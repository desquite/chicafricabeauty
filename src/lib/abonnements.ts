/**
 * Abonnements : règles de calcul, sans base ni horloge cachée.
 *
 * Une abonnée paie d'avance une formule de 3, 6 ou 12 mois sur un soin : un
 * nombre de séances choisi par la gérante, à un rythme donné. Le prix se règle
 * par lien de paiement, en 1 à 3 versements, tous dus au plus tard aux deux
 * tiers de l'abonnement. Une pause repousse la fin d'autant de jours.
 *
 * Les dates sont des jours ISO (« 2026-10-26 ») : Abidjan est en UTC.
 */

export const DUREES = [3, 6, 12] as const;
export type Duree = (typeof DUREES)[number];

export type Rythme = "1s" | "2s" | "3s" | "1m";
export const RYTHMES: { valeur: Rythme; libelle: string; court: string; semaines: number | null }[] = [
  { valeur: "1s", libelle: "Chaque semaine", court: "chaque semaine", semaines: 1 },
  { valeur: "2s", libelle: "Toutes les 2 semaines", court: "toutes les 2 semaines", semaines: 2 },
  { valeur: "3s", libelle: "Toutes les 3 semaines", court: "toutes les 3 semaines", semaines: 3 },
  { valeur: "1m", libelle: "Chaque mois", court: "chaque mois", semaines: null },
];

/** « Chaque mois » n'a de sens que sur un an. */
export const rythmePermis = (duree: number, rythme: Rythme) => rythme !== "1m" || duree === 12;

export const VERSEMENTS_MAX = 3;

export type StatutAbonnement = "actif" | "pause" | "termine" | "annule";

export type Abonnement = {
  id: string;
  cliente_id: string;
  soin_id: string;
  debut: string;
  duree_mois: number;
  rythme: Rythme;
  nb_seances: number;
  prix: number;
  nb_versements: number;
  statut: StatutAbonnement;
  pause_depuis: string | null;
  jours_pause: number;
  code_paiement: string;
  notes: string | null;
  created_at: string;
};

const enDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const versIso = (d: Date) => d.toISOString().slice(0, 10);

export function ajouterJours(iso: string, n: number) {
  const d = enDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return versIso(d);
}

/** Même calendrier que Postgres : le 31 janvier + 1 mois donne le 28 février. */
export function ajouterMois(iso: string, n: number) {
  const d = enDate(iso);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return versIso(d);
}

export const ecartJours = (de: string, a: string) =>
  Math.round((enDate(a).getTime() - enDate(de).getTime()) / 86_400_000);

/**
 * Dernier jour couvert, pauses comprises. Même formule que la fonction SQL
 * fin_abonnement : début + durée + jours de pause, moins un jour.
 */
export function finAbonnement(a: Pick<Abonnement, "debut" | "duree_mois" | "jours_pause">) {
  return ajouterJours(ajouterMois(a.debut, a.duree_mois), a.jours_pause - 1);
}

/** Nombre de séances proposé à la création : la gérante le change librement. */
export function seancesProposees(duree: number, rythme: Rythme) {
  if (rythme === "1m") return duree;
  const semaines = Math.round((duree * 52) / 12);
  const pas = RYTHMES.find((r) => r.valeur === rythme)!.semaines!;
  return Math.max(1, Math.floor(semaines / pas));
}

/** Date de la séance qui suit, au rythme de l'abonnement. */
export function seanceSuivante(iso: string, rythme: Rythme) {
  if (rythme === "1m") return ajouterMois(iso, 1);
  return ajouterJours(iso, 7 * RYTHMES.find((r) => r.valeur === rythme)!.semaines!);
}

/* -------------------------------------------------------------- Versements */

export type Echeance = { rang: number; date: string; montant: number; cumul: number };

/**
 * Les versements : montants arrondis à 500 F, la dernière échéance prenant le
 * reste ; dates espacées d'un tiers de la durée à partir du début, si bien que
 * tout est dû au plus tard aux deux tiers de l'abonnement.
 */
export function echeances(
  a: Pick<Abonnement, "prix" | "nb_versements" | "debut" | "duree_mois">,
): Echeance[] {
  const n = Math.min(Math.max(1, a.nb_versements), VERSEMENTS_MAX);
  const base = n === 1 ? a.prix : Math.floor(a.prix / n / 500) * 500;
  const pasMois = a.duree_mois / 3;
  let cumul = 0;
  return Array.from({ length: n }, (_, k) => {
    const montant = k === n - 1 ? a.prix - base * (n - 1) : base;
    cumul += montant;
    return { rang: k + 1, date: ajouterMois(a.debut, Math.round(k * pasMois)), montant, cumul };
  });
}

export type EtatEcheance = "payee" | "en_retard" | "due" | "a_venir";

export type SituationPaiement = {
  paye: number;
  reste: number;
  /** Prochaine échéance non couverte, avec ce qu'il reste à verser pour elle. */
  prochaine: (Echeance & { aVerser: number; etat: EtatEcheance }) | null;
  lignes: (Echeance & { etat: EtatEcheance })[];
  enRetard: boolean;
};

/**
 * Où en est le paiement d'un abonnement. Les versements reçus couvrent les
 * échéances dans l'ordre : payer plus tôt ou plus que prévu avance d'autant.
 */
export function situationPaiement(
  a: Pick<Abonnement, "prix" | "nb_versements" | "debut" | "duree_mois">,
  paye: number,
  aujourdhui: string,
): SituationPaiement {
  const etat = (e: Echeance): EtatEcheance =>
    paye >= e.cumul ? "payee" : e.date < aujourdhui ? "en_retard" : e.date === aujourdhui ? "due" : "a_venir";
  const lignes = echeances(a).map((e) => ({ ...e, etat: etat(e) }));
  const suivante = lignes.find((e) => e.etat !== "payee") ?? null;
  return {
    paye,
    reste: Math.max(0, a.prix - paye),
    prochaine: suivante ? { ...suivante, aVerser: suivante.cumul - paye } : null,
    lignes,
    enRetard: lignes.some((e) => e.etat === "en_retard"),
  };
}

/* ------------------------------------------------------------- Couverture */

/** Le soin de ce jour-là est-il couvert ? Même règle que abonnement_couvre en SQL. */
export function couvre(
  a: Pick<Abonnement, "soin_id" | "statut" | "debut" | "duree_mois" | "jours_pause">,
  soinId: string | null,
  jour: string,
) {
  return (
    a.statut === "actif" && a.soin_id === soinId && jour >= a.debut && jour <= finAbonnement(a)
  );
}

/** « Abonnée · 4/13 » ou « Abonnée · en pause ». */
export function etiquetteAbonnee(
  a: Pick<Abonnement, "statut" | "nb_seances">,
  faites: number,
) {
  return a.statut === "pause" ? "Abonnée · en pause" : `Abonnée · ${faites}/${a.nb_seances}`;
}

export const libelleRythme = (r: Rythme) => RYTHMES.find((x) => x.valeur === r)?.court ?? "";
