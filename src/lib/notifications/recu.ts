import "server-only";
import { adressePublique } from "@/lib/adresse";
import { LANGUE_MODELES } from "@/lib/notifications/modeles";
import { envoyerModeleWhatsapp } from "@/lib/notifications/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";

/**
 * Reçu envoyé par WhatsApp après l'encaissement, avec son image en en-tête.
 *
 * Modèle Meta (catégorie Utilitaire, en-tête image) :
 *
 *   recu_facture   {{1}} prénom {{2}} n° du reçu {{3}} montant payé {{4}} jour
 *
 * L'image est servie par /api/recu/<jeton>.png, que Meta télécharge.
 */
export async function envoyerRecuWhatsapp(
  factureId: string,
  { forcer = false }: { forcer?: boolean } = {},
): Promise<{ ok: boolean; detail: string }> {
  const admin = createAdminClient();
  const { data: f } = await admin
    .from("factures")
    .select("id, statut, numero_affiche, total, payee_le, jeton_public, clientes(nom_complet, prenom_usuel, telephone)")
    .eq("id", factureId)
    .maybeSingle<{
      id: string;
      statut: string;
      numero_affiche: string | null;
      total: number;
      payee_le: string | null;
      jeton_public: string;
      clientes: { nom_complet: string; prenom_usuel: string | null; telephone: string } | null;
    }>();
  if (!f || f.statut !== "payee") return { ok: false, detail: "facture non encaissée" };
  if (!f.clientes?.telephone) return { ok: false, detail: "pas de numéro de cliente" };

  const jour = new Date().toISOString().slice(0, 10);
  const destinataire = `facture:${f.id}:infobip`;
  if (!forcer) {
    const { data: deja } = await admin
      .from("notifications_envoyees")
      .select("id")
      .eq("type", "recu_facture")
      .eq("destinataire", destinataire)
      .eq("succes", true)
      .limit(1);
    if (deja?.length) return { ok: true, detail: "déjà envoyé" };
  }

  const image = `${await adressePublique()}/api/recu/${f.jeton_public}.png`;
  const date = new Date(f.payee_le ?? Date.now()).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const r = await envoyerModeleWhatsapp(
    f.clientes.telephone,
    "recu_facture",
    [nomChaleureux(f.clientes), f.numero_affiche ?? "", f.total.toLocaleString("fr-FR"), date],
    LANGUE_MODELES,
    image,
  );
  await admin.from("notifications_envoyees").insert({
    type: "recu_facture",
    cle_jour: jour,
    destinataire,
    succes: r.ok,
    detail: r.erreur ?? null,
    canal: "infobip",
  });
  return { ok: r.ok, detail: r.ok ? "envoyé" : (r.erreur ?? "échec") };
}
