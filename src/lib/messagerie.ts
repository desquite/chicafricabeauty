import "server-only";
import { trouverCliente } from "@/lib/reservation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Boîte de réception WhatsApp : conversations et messages, côté serveur.
 *
 * Une conversation par numéro, en chiffres internationaux (2250701020304),
 * rattachée à la fiche cliente quand le numéro est connu. Les messages
 * entrants arrivent par la notification Infobip ; les sortants sont ceux de
 * la gérante (« sortant ») ou de l'application elle-même (« auto » : liens,
 * rappels, reçus).
 */

export type TypeMessage = "texte" | "image" | "audio" | "video" | "document" | "localisation" | "contact" | "autre";

/** Fenêtre Meta : on répond librement 24 h après le dernier message de la cliente. */
export const FENETRE_MS = 24 * 3_600_000;

/** Chiffres internationaux : un numéro ivoirien à 10 chiffres reçoit 225. */
export function chiffresInternationaux(brut: string) {
  const c = brut.replace(/\D/g, "");
  return c.length === 10 ? `225${c}` : c;
}

/**
 * La cliente a-t-elle écrit à l'institut depuis moins de 24 h ? Un message
 * libre peut alors partir sans modèle approuvé.
 */
export async function fenetreOuverte(telephone: string) {
  const fin = chiffresInternationaux(telephone).slice(-8);
  const { data } = await createAdminClient()
    .from("conversations")
    .select("derniere_entree_le")
    .like("telephone", `%${fin}`)
    .returns<{ derniere_entree_le: string | null }[]>();
  const depuis = Date.now() - FENETRE_MS;
  return (data ?? []).some((c) => c.derniere_entree_le && Date.parse(c.derniere_entree_le) > depuis);
}

async function conversationPour(telephone: string, nom: string | null) {
  const admin = createAdminClient();
  const numero = chiffresInternationaux(telephone);
  // Un même numéro ivoirien arrive sous deux formes : WhatsApp transmet
  // souvent l'ancien format à 8 chiffres (22509646096), les fiches gardent
  // le nouveau à 10 (2250709646096). Les 8 derniers chiffres les réunissent.
  const fin = numero.slice(-8);
  const { data: candidates } = await admin
    .from("conversations")
    .select("id, telephone, cliente_id, nom_contact")
    .like("telephone", `%${fin}`)
    .returns<{ id: string; telephone: string; cliente_id: string | null; nom_contact: string | null }[]>();
  const existante =
    (candidates ?? []).find((c) => c.telephone === numero) ??
    (numero.startsWith("225") ? (candidates ?? []).find((c) => c.telephone.startsWith("225")) : undefined);
  if (existante) {
    // Fiche créée depuis : on rattache la conversation à la première occasion.
    if (!existante.cliente_id) {
      const r = await trouverCliente(numero);
      if ("cliente" in r && r.cliente) {
        await admin.from("conversations").update({ cliente_id: r.cliente.id }).eq("id", existante.id);
      }
    }
    if (nom && !existante.nom_contact) await admin.from("conversations").update({ nom_contact: nom }).eq("id", existante.id);
    return existante.id;
  }
  const r = await trouverCliente(numero);
  const { data: creee, error } = await admin
    .from("conversations")
    .insert({
      telephone: numero,
      cliente_id: "cliente" in r && r.cliente ? r.cliente.id : null,
      nom_contact: nom,
    })
    .select("id")
    .single<{ id: string }>();
  if (creee) return creee.id;
  // Deux messages simultanés du même numéro : l'autre a créé la conversation.
  if (error?.code === "23505") {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .like("telephone", `%${fin}`)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (data) return data.id;
  }
  throw new Error(`Conversation impossible : ${error?.message}`);
}

/** Aperçu d'une ligne pour la liste des conversations. */
export function apercu(type: TypeMessage, texte: string | null) {
  const libelles: Record<TypeMessage, string> = {
    texte: "",
    image: "📷 Photo",
    audio: "🎤 Message vocal",
    video: "🎬 Vidéo",
    document: "📄 Document",
    localisation: "📍 Position",
    contact: "👤 Contact",
    autre: "Message",
  };
  const t = texte?.trim() ?? "";
  if (type === "texte") return t.slice(0, 120);
  return t ? `${libelles[type]} · ${t.slice(0, 100)}` : libelles[type];
}

type ResultatInfobip = {
  from?: string;
  receivedAt?: string;
  messageId?: string;
  contact?: { name?: string };
  message?: {
    type?: string;
    text?: string;
    caption?: string;
    url?: string;
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
    title?: string;
    payload?: string;
  };
};

/** Lit un message entrant Infobip en type, texte et média. */
export function lireEntrant(r: ResultatInfobip): { type: TypeMessage; texte: string | null; media: string | null } {
  const m = r.message ?? {};
  const t = (m.type ?? "").toUpperCase();
  if (t === "TEXT") return { type: "texte", texte: m.text ?? "", media: null };
  if (t === "IMAGE" || t === "STICKER") return { type: "image", texte: m.caption ?? null, media: m.url ?? null };
  if (t === "AUDIO" || t === "VOICE") return { type: "audio", texte: null, media: m.url ?? null };
  if (t === "VIDEO") return { type: "video", texte: m.caption ?? null, media: m.url ?? null };
  if (t === "DOCUMENT") return { type: "document", texte: m.caption ?? null, media: m.url ?? null };
  if (t === "LOCATION") {
    return {
      type: "localisation",
      texte: [m.name, m.address, m.latitude != null ? `${m.latitude}, ${m.longitude}` : null].filter(Boolean).join(" · ") || null,
      media: null,
    };
  }
  if (t === "CONTACT") return { type: "contact", texte: null, media: null };
  // Bouton de modèle touché, réponse interactive : le libellé suffit.
  if (t.includes("BUTTON") || t.includes("INTERACTIVE")) return { type: "texte", texte: m.text ?? m.title ?? m.payload ?? "", media: null };
  return { type: "autre", texte: m.text ?? m.caption ?? null, media: m.url ?? null };
}

/**
 * Enregistre un message reçu ; un même message reçu deux fois ne compte
 * qu'une. Rend la conversation concernée, ou null si rien de neuf.
 */
export async function enregistrerEntrant(r: ResultatInfobip): Promise<string | null> {
  if (!r.from) return null;
  const admin = createAdminClient();
  const conversationId = await conversationPour(r.from, r.contact?.name?.trim() || null);
  const { type, texte, media } = lireEntrant(r);
  const quand = r.receivedAt ? new Date(r.receivedAt).toISOString() : new Date().toISOString();

  const { error } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sens: "entrant",
    type,
    texte,
    media_url: media,
    infobip_id: r.messageId ?? null,
    cree_le: quand,
  });
  if (error?.code === "23505") return null; // déjà reçu
  if (error) throw new Error(error.message);

  const { data: c } = await admin.from("conversations").select("non_lus").eq("id", conversationId).single<{ non_lus: number }>();
  await admin
    .from("conversations")
    .update({
      statut: "a_traiter",
      non_lus: (c?.non_lus ?? 0) + 1,
      dernier_message_le: quand,
      dernier_apercu: apercu(type, texte),
      derniere_entree_le: quand,
    })
    .eq("id", conversationId);
  return conversationId;
}

/**
 * Trace un message parti du numéro de l'institut. Sans conséquence s'il
 * échoue : la conversation est un confort, jamais une condition d'envoi.
 */
export async function journaliserSortant(p: {
  telephone: string;
  texte: string;
  sens: "sortant" | "auto";
  auteur?: string | null;
  echec?: string | null;
}) {
  try {
    const admin = createAdminClient();
    const conversationId = await conversationPour(p.telephone, null);
    await admin.from("messages").insert({
      conversation_id: conversationId,
      sens: p.sens,
      type: "texte",
      texte: p.texte,
      auteur: p.auteur ?? null,
      echec: p.echec ?? null,
    });
    if (!p.echec) {
      await admin
        .from("conversations")
        .update({ dernier_message_le: new Date().toISOString(), dernier_apercu: p.texte.slice(0, 120) })
        .eq("id", conversationId);
    }
  } catch (e) {
    console.error(`Journal de conversation : ${e instanceof Error ? e.message : e}`);
  }
}
