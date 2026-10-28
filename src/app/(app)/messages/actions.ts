"use server";

import { revalidatePath } from "next/cache";
import { proposerBrouillon } from "@/lib/assistant/brouillon";
import { requireProfil } from "@/lib/auth";
import { FENETRE_MS, journaliserSortant } from "@/lib/messagerie";
import { envoyerTexteWhatsapp } from "@/lib/notifications/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Retour = { ok: boolean; erreur?: string };

/** Réponse libre à une cliente, dans la fenêtre de 24 h ouverte par son message. */
export async function repondre(conversationId: string, texte: string): Promise<Retour> {
  const profil = await requireProfil();
  const message = texte.trim();
  if (!message) return { ok: false, erreur: "Le message est vide." };
  if (message.length > 4000) return { ok: false, erreur: "Le message est trop long." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conversations")
    .select("telephone, derniere_entree_le")
    .eq("id", conversationId)
    .maybeSingle<{ telephone: string; derniere_entree_le: string | null }>();
  if (!c) return { ok: false, erreur: "Conversation introuvable." };
  if (!c.derniere_entree_le || Date.now() - Date.parse(c.derniere_entree_le) > FENETRE_MS) {
    return {
      ok: false,
      erreur: "Plus de 24 h depuis le dernier message de la cliente : WhatsApp n'autorise qu'un modèle validé. Appelez-la, ou attendez qu'elle écrive.",
    };
  }

  const r = await envoyerTexteWhatsapp(c.telephone, message);
  await journaliserSortant({ telephone: c.telephone, texte: message, sens: "sortant", auteur: profil.id, echec: r.ok ? null : r.erreur });
  // Répondre, c'est traiter : la conversation passe en réglée.
  if (r.ok) {
    await supabase
      .from("conversations")
      .update({ statut: "reglee", non_lus: 0, brouillon: null, brouillon_main: false, brouillon_raison: null, brouillon_pour: null })
      .eq("id", conversationId);
  }
  revalidatePath("/messages");
  return r.ok ? { ok: true } : { ok: false, erreur: `Message non parti : ${r.erreur}` };
}

export async function marquerLu(conversationId: string): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  await supabase.from("conversations").update({ non_lus: 0 }).eq("id", conversationId).gt("non_lus", 0);
  revalidatePath("/messages", "layout");
  return { ok: true };
}

export async function changerStatut(conversationId: string, statut: "a_traiter" | "reglee"): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ statut, ...(statut === "reglee" ? { non_lus: 0 } : {}) })
    .eq("id", conversationId);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/messages", "layout");
  return { ok: true };
}

/** Demande une nouvelle proposition à l'assistant. */
export async function proposerReponse(conversationId: string): Promise<Retour> {
  await requireProfil();
  const r = await proposerBrouillon(conversationId);
  revalidatePath("/messages");
  return r.ok ? { ok: true } : { ok: false, erreur: `Pas de proposition : ${r.detail}` };
}

/** Écarte la proposition de l'assistant. */
export async function ignorerBrouillon(conversationId: string): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  await supabase
    .from("conversations")
    .update({ brouillon: null, brouillon_main: false, brouillon_raison: null, brouillon_pour: null })
    .eq("id", conversationId);
  revalidatePath("/messages");
  return { ok: true };
}

/** Allume ou coupe l'envoi automatique de l'assistant ; réservé à la gérante. */
export async function changerEnvoiAuto(actif: boolean): Promise<Retour> {
  const profil = await requireProfil();
  if (profil.role !== "gerante") return { ok: false, erreur: "Seule la gérante peut changer ce réglage." };
  const { error } = await createAdminClient()
    .from("reglages_assistant")
    .update({ envoi_auto: actif, modifie_le: new Date().toISOString(), modifie_par: profil.id })
    .eq("id", true);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/messages", "layout");
  return { ok: true };
}
