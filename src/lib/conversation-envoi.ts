import "server-only";
import { journaliserDans, journaliserSortant } from "@/lib/messagerie";
import { envoyerMessageMeta } from "@/lib/meta";
import { envoyerTexteWhatsapp } from "@/lib/notifications/whatsapp";

export type Canal = "whatsapp" | "messenger" | "instagram";

export const LIBELLES_CANAL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

/**
 * Répond dans une conversation par son propre canal, et trace le message.
 * Pour Messenger et Instagram, la colonne telephone porte « canal:<id> ».
 */
export async function envoyerDansConversation(
  conv: { id: string; telephone: string; canal: Canal | null },
  texte: string,
  trace: { auteur?: string | null; parAssistant?: boolean } = {},
): Promise<{ ok: boolean; erreur?: string }> {
  const canal = conv.canal ?? "whatsapp";
  if (canal === "whatsapp") {
    const r = await envoyerTexteWhatsapp(conv.telephone, texte);
    await journaliserSortant({ telephone: conv.telephone, texte, sens: "sortant", echec: r.ok ? null : r.erreur, ...trace });
    return r;
  }
  const r = await envoyerMessageMeta(conv.telephone.slice(canal.length + 1), texte);
  await journaliserDans(conv.id, { texte, sens: "sortant", echec: r.ok ? null : r.erreur, ...trace });
  return r;
}
