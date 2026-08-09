/**
 * Modeles WhatsApp approuves par Meta, tels que nommes dans la console Infobip.
 *
 * Quatre plutot qu'un seul parce qu'une variable vide fait rejeter le message :
 * le soin et la phrase de fidelite etant facultatifs, chaque combinaison a son
 * modele. Les noms sont figes cote Meta et ne se renomment pas ; toute
 * correction passe par un nouveau modele a faire approuver.
 *
 * Meta a reclasse en **Marketing** les deux modeles qui annoncent la remise.
 * Une cliente peut refuser cette categorie dans ses reglages WhatsApp : d'ou
 * le repli vers le modele Utilite equivalent, qui perd la mention des 20 %
 * mais fait arriver le rappel de rendez-vous.
 */
export const LANGUE_MODELES = "fr";

export type Modele = {
  nom: string;
  placeholders: string[];
  /** Modele de secours si celui-ci est refuse. */
  repli?: Modele;
};

/**
 * Recapitulatif du matin aux gerantes.
 *
 * Le texte libre de WasenderAPI listait un rendez-vous par ligne. Un modele
 * ne peut pas : une variable n accepte pas de retour a la ligne, et le nombre
 * de rendez-vous change chaque jour. La liste tient donc sur une seule
 * variable, les rendez-vous separes par des points medians. On perd la mise
 * en colonne, pas l information.
 */
export function modeleRecapitulatif(p: {
  /** Prenom de la gerante. */
  nom: string;
  /** « lundi 10 août ». */
  date: string;
  /** Les rendez-vous du jour sur une ligne, ou « aucun aujourd'hui ». */
  rendezVous: string;
  /** Ce qui demande attention, ou « rien de particulier ». */
  aSignaler: string;
}): Modele {
  return {
    nom: "recapitulatif_gerante",
    placeholders: [p.nom, p.date, p.rendezVous, p.aSignaler],
  };
}

export function modeleRappel({
  nom,
  quand,
  soin,
  rang,
}: {
  /** Nom complet de la cliente. */
  nom: string;
  /** « demain jeudi 7 août à 14:00 » — jamais vide. */
  quand: string;
  soin: string | null;
  /** Rang de la seance quand elle ouvre droit a la remise. */
  rang: number | null;
}): Modele {
  const sansSoin: Modele = { nom: "rappel_rdv", placeholders: [nom, quand] };
  const avecSoin: Modele = {
    nom: "rappel_rdv_soin",
    placeholders: [nom, quand, soin ?? ""],
  };

  if (rang === null) return soin ? avecSoin : sansSoin;

  return soin
    ? {
        nom: "rappel_rdv_soin_remise",
        placeholders: [nom, quand, soin, String(rang)],
        repli: avecSoin,
      }
    : {
        nom: "rappel_rdv_fidelite",
        placeholders: [nom, quand, String(rang)],
        repli: sansSoin,
      };
}
