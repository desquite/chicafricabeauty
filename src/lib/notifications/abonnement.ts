import "server-only";
import { finAbonnement, situationPaiement, type Abonnement } from "@/lib/abonnements";
import { adressePublique } from "@/lib/adresse";
import { envoyerEmail } from "@/lib/notifications/email";
import { LANGUE_MODELES } from "@/lib/notifications/modeles";
import { envoyerModeleWhatsapp } from "@/lib/notifications/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";

/**
 * Messages des abonnements, par WhatsApp et par e-mail.
 *
 * Modèles Meta (catégorie Utilitaire) :
 *
 *   abonnement_lien     {{1}} prénom {{2}} soin {{3}} séances {{4}} fin
 *                       {{5}} montant de l'échéance {{6}} jour limite {{7}} lien
 *   abonnement_rappel   {{1}} prénom {{2}} montant {{3}} soin {{4}} jour limite
 *                       {{5}} lien
 *   abonnement_recu     {{1}} prénom {{2}} montant reçu {{3}} soin
 *                       {{4}} total réglé {{5}} prix
 *
 * Le lien /p/<code> sert toute la durée de l'abonnement : la page montre ce
 * qui est payé et ce qui reste.
 */

export type MessageAbonnement = "lien" | "rappel" | "recu";

const MODELES: Record<MessageAbonnement, string> = {
  lien: "abonnement_lien",
  rappel: "abonnement_rappel",
  recu: "abonnement_recu",
};

/** « 26 octobre » ; « 25 avril 2027 » avec l'année. */
export function jourMois(iso: string, annee = false) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    ...(annee ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const fcfa = (n: number) => n.toLocaleString("fr-FR");

type AboMessage = Abonnement & {
  clientes: { nom_complet: string; prenom_usuel: string | null; telephone: string; email: string | null } | null;
  soins_catalogue: { libelle: string; libelle_public: string | null } | null;
};

export async function envoyerMessageAbonnement(
  abonnementId: string,
  type: MessageAbonnement,
  extra: { montant?: number; orderId?: string } = {},
): Promise<{ whatsapp: string; email: string }> {
  const admin = createAdminClient();
  const jour = new Date().toISOString().slice(0, 10);

  const [{ data: abo }, { data: versements }] = await Promise.all([
    admin
      .from("abonnements")
      .select("*, clientes(nom_complet, prenom_usuel, telephone, email), soins_catalogue(libelle, libelle_public)")
      .eq("id", abonnementId)
      .maybeSingle<AboMessage>(),
    admin
      .from("paiements_abonnement")
      .select("montant")
      .eq("abonnement_id", abonnementId)
      .eq("statut", "reussi")
      .returns<{ montant: number }[]>(),
  ]);
  if (!abo?.clientes) return { whatsapp: "abonnement introuvable", email: "—" };

  const cliente = abo.clientes;
  const prenom = nomChaleureux(cliente);
  const soin = abo.soins_catalogue?.libelle_public || abo.soins_catalogue?.libelle || "votre soin";
  const paye = (versements ?? []).reduce((t, v) => t + v.montant, 0);
  const situation = situationPaiement(abo, paye, jour);
  const prochaine = situation.prochaine;
  const lien = `${await adressePublique()}/p/${abo.code_paiement}`;
  const fin = jourMois(finAbonnement(abo), true);

  // Plus rien à régler : ni lien ni rappel.
  if (type !== "recu" && !prochaine) return { whatsapp: "déjà réglé", email: "—" };

  const montantEcheance = prochaine ? fcfa(prochaine.aVerser) : "0";
  const limite = prochaine ? jourMois(prochaine.date) : "";
  const recu = extra.montant ?? 0;

  const placeholders: Record<MessageAbonnement, string[]> = {
    lien: [prenom, soin, String(abo.nb_seances), fin, montantEcheance, limite, lien],
    rappel: [prenom, montantEcheance, soin, limite, lien],
    recu: [prenom, fcfa(recu), soin, fcfa(paye), fcfa(abo.prix)],
  };

  const emails: Record<MessageAbonnement, { sujet: string; paragraphes: string[]; bouton?: { libelle: string; url: string } }> = {
    lien: {
      sujet: `Votre abonnement ${soin} chez Chic Africa Beauty`,
      paragraphes: [
        `Bonjour ${prenom},`,
        `Votre abonnement ${soin} est enregistré : ${abo.nb_seances} séances jusqu'au ${fin}.`,
        `Échéance à régler : ${montantEcheance} F CFA avant le ${limite}. Vous pouvez aussi tout régler en une fois depuis le même lien.`,
      ],
      bouton: { libelle: "Régler mon abonnement", url: lien },
    },
    rappel: {
      sujet: `Rappel : échéance de votre abonnement ${soin}`,
      paragraphes: [
        `Bonjour ${prenom},`,
        `L'échéance de ${montantEcheance} F CFA de votre abonnement ${soin} est à régler avant le ${limite}.`,
      ],
      bouton: { libelle: "Régler l'échéance", url: lien },
    },
    recu: {
      sujet: "Paiement bien reçu, merci !",
      paragraphes: [
        `Bonjour ${prenom},`,
        `Nous avons bien reçu votre paiement de ${fcfa(recu)} F CFA pour votre abonnement ${soin}.`,
        `Total réglé : ${fcfa(paye)} F CFA sur ${fcfa(abo.prix)} F CFA. Merci pour votre confiance !`,
      ],
    },
  };

  // Un reçu par versement, un rappel par échéance, un lien par jour au plus.
  const suffixe =
    type === "recu" ? (extra.orderId ?? jour) : type === "rappel" ? `r${prochaine?.rang ?? 0}` : "lien";
  const cle = `abo:${abo.id}:${suffixe}`;
  const typeJournal = `abonnement_${type}`;

  async function uneFois(canal: string, faire: () => Promise<{ ok: boolean; erreur?: string }>) {
    const { data: deja } = await admin
      .from("notifications_envoyees")
      .select("id")
      .eq("type", typeJournal)
      .eq("cle_jour", jour)
      .eq("destinataire", `${cle}:${canal}`)
      .eq("succes", true)
      .maybeSingle();
    if (deja) return "déjà envoyé";
    const r = await faire();
    await admin.from("notifications_envoyees").insert({
      type: typeJournal,
      cle_jour: jour,
      destinataire: `${cle}:${canal}`,
      succes: r.ok,
      detail: r.erreur ?? null,
      canal,
    });
    return r.ok ? "envoyé" : `échec : ${r.erreur}`;
  }

  const whatsapp = await uneFois("infobip", () =>
    envoyerModeleWhatsapp(cliente.telephone, MODELES[type], placeholders[type], LANGUE_MODELES),
  );
  const email = cliente.email
    ? await uneFois("email", () => envoyerEmail({ a: cliente.email!, ...emails[type] }))
    : "pas d'adresse";
  return { whatsapp, email };
}
