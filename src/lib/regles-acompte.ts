/**
 * Règles de l'acompte obligatoire, sans base ni horloge cachée.
 *
 * Une seule règle pour toutes les clientes : l'acompte se règle au plus tard
 * la veille du rendez-vous à 18h, sinon le rendez-vous est annulé.
 *
 *   en ligne    lien à la réservation, rappels à J-3, J-2 et le matin de J-1 ;
 *               réservé après la veille 18h : 30 minutes pour payer
 *   tablette    lien à J-2, rappel le matin de J-1 ; saisi après la veille
 *               18h : pas d'échéance, la cliente règle sur place
 *
 * Miroir exact de la fonction SQL echeance_acompte. Abidjan est en UTC.
 */

export type Source = "personnel" | "en_ligne";

export type RdvAcompte = {
  date_rdv: string;
  /** Horodatage ISO de création. */
  created_at: string;
  source: Source;
  acompte_requis: boolean;
  acompte_paye_le: string | null;
};

export const HEURE_LIMITE = 18;
export const DELAI_IMMEDIAT_MIN = 30;

const DEUX = (n: number) => String(n).padStart(2, "0");

/** La veille du rendez-vous à 18h, en UTC. */
export function veilleLimite(dateRdv: string) {
  const d = new Date(`${dateRdv}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(HEURE_LIMITE);
  return d;
}

export function echeanceAcompte(rdv: Pick<RdvAcompte, "date_rdv" | "created_at" | "source">) {
  const limite = veilleLimite(rdv.date_rdv);
  const cree = new Date(rdv.created_at);
  if (cree < limite) return limite;
  if (rdv.source === "en_ligne") return new Date(cree.getTime() + DELAI_IMMEDIAT_MIN * 60_000);
  return null;
}

/** Réservé en ligne après la veille 18h : l'acompte se paie sur-le-champ. */
export function paiementImmediat(rdv: Pick<RdvAcompte, "date_rdv" | "created_at" | "source">) {
  return rdv.source === "en_ligne" && new Date(rdv.created_at) >= veilleLimite(rdv.date_rdv);
}

const doitPayer = (rdv: RdvAcompte) => rdv.acompte_requis && !rdv.acompte_paye_le;

/** Échéance dépassée sans paiement : le créneau ne bloque plus l'agenda. */
export function estExpire(rdv: RdvAcompte, maintenant: Date) {
  if (!doitPayer(rdv)) return false;
  const e = echeanceAcompte(rdv);
  return e !== null && e <= maintenant;
}

/**
 * À annuler par la tâche du soir. Jamais le rendez-vous du jour même, sauf
 * paiement immédiat non fait : un rendez-vous déplacé à la dernière minute
 * par la gérante ne doit pas sauter le jour où il a lieu.
 */
export function aAnnuler(rdv: RdvAcompte, maintenant: Date) {
  if (!estExpire(rdv, maintenant)) return false;
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  return rdv.date_rdv > aujourdhui || paiementImmediat(rdv);
}

export type MessageAcompte = "lien" | "rappel" | "dernier_rappel";

/** Jours entiers entre deux dates ISO. */
function ecartJours(de: string, a: string) {
  return Math.round(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${de}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Ce que la tâche du matin envoie ce jour-là pour ce rendez-vous. */
export function messageDuMatin(rdv: RdvAcompte, maintenant: Date): MessageAcompte | null {
  if (!doitPayer(rdv)) return null;
  const echeance = echeanceAcompte(rdv);
  if (!echeance || echeance <= maintenant || paiementImmediat(rdv)) return null;

  const ecart = ecartJours(maintenant.toISOString().slice(0, 10), rdv.date_rdv);
  if (rdv.source === "en_ligne") {
    if (ecart === 3 || ecart === 2) return "rappel";
    if (ecart === 1) return "dernier_rappel";
    return null;
  }
  // Tablette : le lien n'est envoyé qu'à J-2, sauf s'il l'a été à la saisie.
  if (ecart === 2) return "lien";
  if (ecart === 1) return "rappel";
  return null;
}

/**
 * À la saisie à la tablette : si le rendez-vous est déjà à moins de deux
 * jours, le lien part tout de suite, puisque la tâche du matin l'a manqué.
 */
export function lienASaisie(rdv: RdvAcompte, maintenant: Date) {
  if (!doitPayer(rdv) || rdv.source !== "personnel") return false;
  const echeance = echeanceAcompte(rdv);
  if (!echeance || echeance <= maintenant) return false;
  return ecartJours(maintenant.toISOString().slice(0, 10), rdv.date_rdv) <= 2;
}

/** « lundi 19 octobre » pour les messages. */
export function jourLisible(d: Date) {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** « mardi 20 octobre à 10h00 ». */
export function quandLisible(dateRdv: string, heure: string | null) {
  const jour = jourLisible(new Date(`${dateRdv}T00:00:00Z`));
  if (!heure) return jour;
  const [h, m] = heure.split(":").map(Number);
  return `${jour} à ${h}h${DEUX(m)}`;
}
