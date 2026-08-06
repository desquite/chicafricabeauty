/**
 * Fidélité : une remise de 20 % toutes les cinq séances, au choix de la
 * cliente sur un soin ou sur un produit.
 *
 * Le compteur ne connaît que les séances saisies dans l'application. Le passé
 * de l'institut, tenu sur papier, n'est pas repris : mieux vaut une remise qui
 * se fait attendre qu'une remise accordée à tort, impossible à reprendre une
 * fois annoncée à la cliente.
 *
 * Aucun montant n'est manipulé ici. L'application dit qui y a droit et ce que
 * la cliente en a fait ; le calcul se fait à la caisse.
 */

/** Nombre de séances entre deux remises. La 5e, la 10e, la 15e… */
export const PAS_FIDELITE = 5;

export const REMISE_POURCENT = 20;

/** Rang de la séance à venir, la première venue étant la n° 1. */
export const rangSeance = (seancesPassees: number) => seancesPassees + 1;

/** Une séance ouvre droit à la remise quand son rang est un multiple du pas. */
export const ouvreDroit = (rang: number) =>
  rang > 0 && rang % PAS_FIDELITE === 0;

export const REMISE_CHOIX = [
  { valeur: "soin", libelle: "Sur un soin" },
  { valeur: "produit", libelle: "Sur un produit" },
  { valeur: "non_utilisee", libelle: "Non utilisée" },
] as const;

export type ChoixRemise = (typeof REMISE_CHOIX)[number]["valeur"];

/**
 * « 5e séance — remise 20 % ». Utilisé tel quel dans les bandeaux de
 * l'application et dans les messages WhatsApp, pour que la gérante et la
 * cliente lisent la même phrase.
 */
export const etiquetteRemise = (rang: number) =>
  `${rang}e séance — remise ${REMISE_POURCENT} %`;
