/**
 * Règles de l'acompte obligatoire, sans base ni horloge cachée.
 *
 * Une seule règle pour toutes les clientes : l'acompte se règle au plus tard
 * la veille du rendez-vous à 18h, sinon le rendez-vous est annulé.
 *
 *   en ligne    lien à la réservation, rappels à J-3, J-2 et le matin de J-1 ;
 *               réservé après la veille 18h : jusqu'à 2 h avant le
 *               rendez-vous, et jamais moins de 30 minutes pour payer
 *   tablette    lien à J-2, rappel le matin de J-1 ; saisi après la veille
 *               18h : pas d'échéance, la cliente règle sur place
 *
 * Miroir exact de la fonction SQL echeance_acompte. Abidjan est en UTC.
 */

import { prixDuJour, type PrixSoin } from "@/lib/disponibilites";

export type Source = "personnel" | "en_ligne";

export type RdvAcompte = {
  date_rdv: string;
  heure_rdv: string | null;
  /** Horodatage ISO de création. */
  created_at: string;
  source: Source;
  acompte_requis: boolean;
  acompte_paye_le: string | null;
};

export const HEURE_LIMITE = 18;
/** Réservé après la veille 18h : l'acompte se règle jusqu'à 2 h avant le rendez-vous… */
export const AVANCE_SUR_RDV_MIN = 120;
/** … mais la cliente a toujours au moins 30 minutes pour payer. */
export const DELAI_IMMEDIAT_MIN = 30;

const DEUX = (n: number) => String(n).padStart(2, "0");

/** La veille du rendez-vous à 18h, en UTC. */
export function veilleLimite(dateRdv: string) {
  const d = new Date(`${dateRdv}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(HEURE_LIMITE);
  return d;
}

/**
 * Échéance d'une réservation tardive : 2 h avant le rendez-vous, jamais
 * moins de 30 minutes après la réservation. Une cliente qui réserve à 22h
 * pour 11h30 le lendemain a jusqu'à 9h30 : elle peut payer au réveil.
 */
export function echeanceTardive(dateRdv: string, heureRdv: string | null, cree: Date) {
  const auPlusTot = cree.getTime() + DELAI_IMMEDIAT_MIN * 60_000;
  if (!heureRdv) return new Date(auPlusTot);
  const debut = new Date(`${dateRdv}T${heureRdv.slice(0, 5)}:00Z`).getTime();
  return new Date(Math.max(debut - AVANCE_SUR_RDV_MIN * 60_000, auPlusTot));
}

export function echeanceAcompte(rdv: Pick<RdvAcompte, "date_rdv" | "heure_rdv" | "created_at" | "source">) {
  const limite = veilleLimite(rdv.date_rdv);
  const cree = new Date(rdv.created_at);
  if (cree < limite) return limite;
  if (rdv.source === "en_ligne") return echeanceTardive(rdv.date_rdv, rdv.heure_rdv, cree);
  return null;
}

/** Réservé en ligne après la veille 18h : l'échéance n'est plus la veille 18h. */
export function paiementImmediat(rdv: Pick<RdvAcompte, "date_rdv" | "created_at" | "source">) {
  return rdv.source === "en_ligne" && new Date(rdv.created_at) >= veilleLimite(rdv.date_rdv);
}

const doitPayer = (rdv: RdvAcompte) => rdv.acompte_requis && !rdv.acompte_paye_le;

/**
 * Montant de l'acompte pour un soin : celui du réglage, mais jamais plus que
 * le prix du soin ce jour-là. Une pédicure à 5 000 F se règle 5 000 F, pas
 * 10 000. Sans prix connu, le montant du réglage.
 */
export function montantAcompte(acompteReglage: number, prixSoin: number | null) {
  return prixSoin != null && prixSoin > 0 ? Math.min(acompteReglage, prixSoin) : acompteReglage;
}

/** Acompte d'un rendez-vous : prix du soin le jour du rendez-vous, promotion comprise. */
export function acompteDuRdv(acompteReglage: number, soin: PrixSoin | null, dateRdv: string) {
  return montantAcompte(acompteReglage, soin ? prixDuJour(soin, dateRdv) : null);
}

/** Champs du soin à lire avec le rendez-vous pour calculer son acompte. */
export const CHAMPS_PRIX_SOIN = "prix, prix_promo, promo_debut, promo_fin";

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
  // Tablette : le lien part à la saisie (lienASaisie) ; le matin ne fait que
  // relancer, comme en ligne, tant que l'acompte n'est pas réglé.
  if (ecart === 2) return "rappel";
  if (ecart === 1) return "dernier_rappel";
  return null;
}

/**
 * À la saisie à la tablette, le lien part tout de suite, quelle que soit la
 * date du soin : la cliente est souvent encore devant la gérante, et
 * attendre J-2 laissait des jours sans moyen de payer. Rien ne part si
 * l'échéance est déjà passée (saisie après la veille 18h : pas d'acompte
 * exigé).
 */
export function lienASaisie(rdv: RdvAcompte, maintenant: Date) {
  if (!doitPayer(rdv) || rdv.source !== "personnel") return false;
  const echeance = echeanceAcompte(rdv);
  return echeance !== null && echeance > maintenant;
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
