import "server-only";
import { adressePublique } from "@/lib/adresse";
import { envoyerEmail } from "@/lib/notifications/email";
import { envoyerModeleWhatsapp } from "@/lib/notifications/whatsapp";
import { LANGUE_MODELES } from "@/lib/notifications/modeles";
import { echeanceAcompte, jourLisible, quandLisible, type Source } from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";

/**
 * Messages de l'acompte obligatoire, par WhatsApp et par e-mail.
 *
 * Modèles Meta (catégorie Utilitaire), à faire approuver avant d'allumer le
 * réglage « Acompte obligatoire » :
 *
 *   acompte_lien        {{1}} prénom {{2}} soin {{3}} quand {{4}} montant
 *                       {{5}} jour limite {{6}} lien
 *   acompte_rappel      {{1}} prénom {{2}} soin {{3}} quand {{4}} jour limite
 *                       {{5}} lien
 *   acompte_recu        {{1}} prénom {{2}} montant {{3}} soin {{4}} quand
 *   rdv_annule_acompte  {{1}} prénom {{2}} soin {{3}} quand {{4}} lien /rdv
 *
 * Chaque envoi est journalisé par rendez-vous et par jour : rejouer une tâche
 * ne fait pas partir deux fois le même message.
 */

export type TypeMessage = "lien" | "rappel" | "dernier_rappel" | "recu" | "annule";

const MODELES: Record<TypeMessage, string> = {
  lien: "acompte_lien",
  rappel: "acompte_rappel",
  dernier_rappel: "acompte_rappel",
  recu: "acompte_recu",
  annule: "rdv_annule_acompte",
};

type RdvMessage = {
  id: string;
  date_rdv: string;
  heure_rdv: string | null;
  created_at: string;
  source: Source;
  code_acompte: string;
  acompte_montant: number | null;
  clientes: {
    nom_complet: string;
    prenom_usuel: string | null;
    telephone: string;
    email: string | null;
  } | null;
  soins_catalogue: { libelle: string; libelle_public: string | null } | null;
};

const CHAMPS =
  "id, date_rdv, heure_rdv, created_at, source, code_acompte, acompte_montant, " +
  "clientes(nom_complet, prenom_usuel, telephone, email), soins_catalogue(libelle, libelle_public)";

export type CompteRendu = { whatsapp: string; email: string };

export async function envoyerMessageAcompte(
  rdvId: string,
  type: TypeMessage,
): Promise<CompteRendu> {
  const admin = createAdminClient();
  const jour = new Date().toISOString().slice(0, 10);

  const [{ data: rdv }, { data: reglages }] = await Promise.all([
    admin.from("rendez_vous").select(CHAMPS).eq("id", rdvId).maybeSingle<RdvMessage>(),
    admin.from("reglages_rdv").select("acompte_montant").maybeSingle<{ acompte_montant: number }>(),
  ]);
  if (!rdv?.clientes) return { whatsapp: "rendez-vous introuvable", email: "—" };

  const cliente = rdv.clientes;
  const prenom = nomChaleureux(cliente);
  const soin = rdv.soins_catalogue?.libelle_public || rdv.soins_catalogue?.libelle || "votre soin";
  const quand = quandLisible(rdv.date_rdv, rdv.heure_rdv);
  const montant = (type === "recu" ? rdv.acompte_montant : null) ?? reglages?.acompte_montant ?? 0;
  const montantTexte = montant.toLocaleString("fr-FR");
  const echeance = echeanceAcompte(rdv);
  const limite = echeance ? jourLisible(echeance) : "";
  const site = await adressePublique();
  const lien = `${site}/a/${rdv.code_acompte}`;
  const pageRdv = `${site}/rdv`;

  const placeholders: Record<TypeMessage, string[]> = {
    lien: [prenom, soin, quand, montantTexte, limite, lien],
    rappel: [prenom, soin, quand, limite, lien],
    dernier_rappel: [prenom, soin, quand, limite, lien],
    recu: [prenom, montantTexte, soin, quand],
    annule: [prenom, soin, quand, pageRdv],
  };

  const heureLimite = echeance
    ? `${limite} à ${echeance.getUTCHours()}h${String(echeance.getUTCMinutes()).padStart(2, "0")}`
    : "";
  const emails: Record<TypeMessage, { sujet: string; paragraphes: string[]; bouton?: { libelle: string; url: string } }> = {
    lien: {
      sujet: `Votre rendez-vous du ${quand} : réglez l'acompte`,
      paragraphes: [
        `Bonjour ${prenom},`,
        `Votre rendez-vous chez Chic Africa Beauty est bien enregistré : ${soin}, le ${quand}.`,
        `Pour le confirmer, merci de régler l'acompte de ${montantTexte} F CFA au plus tard le ${heureLimite}. Il est déduit du prix le jour du soin.`,
        "Sans acompte à cette heure-là, le rendez-vous sera annulé automatiquement.",
      ],
      bouton: { libelle: "Régler l'acompte", url: lien },
    },
    rappel: {
      sujet: `Rappel : l'acompte de votre rendez-vous du ${quand}`,
      paragraphes: [
        `Bonjour ${prenom},`,
        `L'acompte de votre rendez-vous ${soin} du ${quand} n'est pas encore réglé.`,
        `Merci de le payer avant le ${heureLimite}. Sans acompte, le rendez-vous sera annulé automatiquement.`,
      ],
      bouton: { libelle: "Régler l'acompte", url: lien },
    },
    dernier_rappel: {
      sujet: `Dernier rappel : acompte à régler avant ce soir 18h`,
      paragraphes: [
        `Bonjour ${prenom},`,
        `L'acompte de votre rendez-vous ${soin} du ${quand} n'est toujours pas réglé.`,
        `Il doit l'être aujourd'hui avant 18h, faute de quoi le rendez-vous sera annulé automatiquement.`,
      ],
      bouton: { libelle: "Régler l'acompte", url: lien },
    },
    recu: {
      sujet: "Acompte bien reçu, merci !",
      paragraphes: [
        `Bonjour ${prenom},`,
        `Nous avons bien reçu votre acompte de ${montantTexte} F CFA pour votre rendez-vous ${soin} du ${quand}. Il sera déduit du prix le jour du soin.`,
        "À très vite chez Chic Africa Beauty !",
      ],
    },
    annule: {
      sujet: "Votre rendez-vous a été annulé",
      paragraphes: [
        `Bonjour ${prenom},`,
        `Faute d'acompte reçu à temps, votre rendez-vous ${soin} du ${quand} a été annulé et le créneau libéré.`,
        "Vous pouvez reprendre rendez-vous à tout moment.",
      ],
      bouton: { libelle: "Reprendre rendez-vous", url: pageRdv },
    },
  };

  const typeJournal = `acompte_${type}`;
  const cle = `rdv:${rdv.id}`;

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
