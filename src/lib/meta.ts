import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CanalMeta, TypeMessage } from "@/lib/messagerie";

/**
 * Meta : messages privés de la page Facebook (Messenger) et du compte
 * Instagram professionnel relié à la page, par l'API Graph.
 *
 * Variables d'environnement, côté serveur seulement :
 *   META_APP_SECRET    clé secrète de l'application Meta, qui signe les
 *                      notifications (en-tête X-Hub-Signature-256)
 *   META_VERIFY_TOKEN  mot de passe choisi par nous, que Meta renvoie quand
 *                      on branche l'adresse de notification
 *   META_PAGE_TOKEN    jeton d'accès de la page, sans expiration ; il sert
 *                      aussi pour Instagram
 *
 * Tant qu'elles manquent, rien ne part et l'adresse de notification refuse
 * tout.
 */

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}`;

export const metaConfigure = () =>
  Boolean(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN && process.env.META_PAGE_TOKEN);

/** Signature HMAC-SHA256 du corps brut, avec la clé secrète de l'application. */
export function signatureMetaValide(corpsBrut: string, entete: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !entete?.startsWith("sha256=")) return false;
  const attendue = Buffer.from(createHmac("sha256", secret).update(corpsBrut, "utf8").digest("hex"));
  const fournie = Buffer.from(entete.slice(7).trim().toLowerCase());
  return attendue.length === fournie.length && timingSafeEqual(attendue, fournie);
}

/** Le mot de passe de branchement, comparé sans fuite de durée. */
export function jetonVerificationValide(fourni: string | null) {
  const attendu = process.env.META_VERIFY_TOKEN;
  if (!attendu || attendu.length < 16 || !fourni) return false;
  const a = Buffer.from(attendu);
  const b = Buffer.from(fourni);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Découpe un texte trop long pour un seul message : Instagram plafonne à
 * 1 000 caractères, Messenger à 2 000. On coupe entre deux paragraphes.
 */
export function morceaux(texte: string, max = 950): string[] {
  const resultat: string[] = [];
  let courant = "";
  for (const paragraphe of texte.split(/\n{2,}/)) {
    const bloc = courant ? `${courant}\n\n${paragraphe}` : paragraphe;
    if (bloc.length <= max) {
      courant = bloc;
      continue;
    }
    if (courant) resultat.push(courant);
    // Un paragraphe seul trop long : coupé net, c'est rare.
    let reste = paragraphe;
    while (reste.length > max) {
      resultat.push(reste.slice(0, max));
      reste = reste.slice(max);
    }
    courant = reste;
  }
  if (courant) resultat.push(courant);
  return resultat;
}

/**
 * Message privé texte à une personne qui a écrit à la page. Meta ne
 * l'accepte que dans les 24 h qui suivent son dernier message.
 */
export async function envoyerMessageMeta(destinataire: string, texte: string): Promise<{ ok: boolean; erreur?: string }> {
  const jeton = process.env.META_PAGE_TOKEN;
  if (!jeton) return { ok: false, erreur: "Meta n'est pas configuré" };
  try {
    for (const morceau of morceaux(texte)) {
      const reponse = await fetch(`${GRAPH}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: destinataire }, messaging_type: "RESPONSE", message: { text: morceau } }),
      });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
        return { ok: false, erreur: `Meta ${reponse.status} ${corps?.error?.message ?? ""}`.trim().slice(0, 300) };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

/** Nom affiché de la personne, pour une nouvelle conversation ; null si Meta refuse. */
export async function nomMeta(canal: CanalMeta, id: string): Promise<string | null> {
  const jeton = process.env.META_PAGE_TOKEN;
  if (!jeton) return null;
  const champs = canal === "instagram" ? "name,username" : "first_name,last_name";
  const reponse = await fetch(`${GRAPH}/${encodeURIComponent(id)}?fields=${champs}`, {
    headers: { Authorization: `Bearer ${jeton}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!reponse.ok) return null;
  const p = (await reponse.json()) as { name?: string; username?: string; first_name?: string; last_name?: string };
  const nom = canal === "instagram" ? p.name || (p.username ? `@${p.username}` : "") : [p.first_name, p.last_name].filter(Boolean).join(" ");
  return nom.trim() || null;
}

/* ------------------------------------------------------- Notifications */

/** Un message privé dans une notification Meta (Messenger ou Instagram). */
export type EvenementMeta = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: { type?: string; payload?: { url?: string; title?: string } }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
};

/** Lit un événement en type, texte et média ; null s'il ne s'agit pas d'un message reçu. */
export function lireEvenementMeta(e: EvenementMeta): { metaId: string; type: TypeMessage; texte: string | null; media: string | null } | null {
  if (e.postback?.mid) return { metaId: e.postback.mid, type: "texte", texte: e.postback.title ?? e.postback.payload ?? "", media: null };
  const m = e.message;
  // Les « échos » sont nos propres envois, déjà dans la conversation.
  if (!m?.mid || m.is_echo || m.is_deleted) return null;
  const piece = m.attachments?.[0];
  if (!piece) {
    if (m.text) return { metaId: m.mid, type: "texte", texte: m.text, media: null };
    return { metaId: m.mid, type: "autre", texte: null, media: null };
  }
  const types: Record<string, TypeMessage> = {
    image: "image",
    audio: "audio",
    video: "video",
    file: "document",
    location: "localisation",
    // Publication ou story partagée, réaction à une story : un lien suffit.
    share: "autre",
    story_mention: "autre",
    ig_reel: "video",
    reel: "video",
  };
  return {
    metaId: m.mid,
    type: types[piece.type ?? ""] ?? "autre",
    texte: m.text ?? piece.payload?.title ?? null,
    media: piece.payload?.url ?? null,
  };
}
