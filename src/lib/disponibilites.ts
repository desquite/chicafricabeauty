import type { SoinCatalogue } from "@/lib/types";

/** Ordre d'affichage : la semaine de l'institut commence le lundi. */
export const JOURS_SEMAINE = [
  { jour: 1, libelle: "Lundi" },
  { jour: 2, libelle: "Mardi" },
  { jour: 3, libelle: "Mercredi" },
  { jour: 4, libelle: "Jeudi" },
  { jour: 5, libelle: "Vendredi" },
  { jour: 6, libelle: "Samedi" },
  { jour: 0, libelle: "Dimanche" },
] as const;

/** "07:30:00" → "07:30" ; les champs d'heure travaillent en HH:MM. */
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** "07:30" → "7h30", "09:00" → "9h" : la façon dont l'institut écrit l'heure. */
export function heureLisible(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}h${m === "00" ? "" : m}`;
}

export type EtatPromo = "aucune" | "a_venir" | "en_cours" | "terminee";

/** Dates ISO comparées en texte : AAAA-MM-JJ se trie comme une date. */
export function etatPromo(soin: SoinCatalogue, jour: string): EtatPromo {
  if (soin.prix_promo == null || !soin.promo_debut || !soin.promo_fin) return "aucune";
  if (jour < soin.promo_debut) return "a_venir";
  if (jour > soin.promo_fin) return "terminee";
  return "en_cours";
}

/**
 * Prix demandé à la cliente ce jour-là. La promotion s'applique d'elle-même
 * entre ses deux dates, et le prix normal revient sans que personne y pense.
 */
export function prixDuJour(soin: SoinCatalogue, jour: string) {
  return etatPromo(soin, jour) === "en_cours" ? soin.prix_promo : soin.prix;
}

export const fcfa = (n: number | null) =>
  n == null ? "" : `${n.toLocaleString("fr-FR")} F CFA`;

/** Durée comme sur la page de réservation : 30min, 1h, 1h30. */
export function dureeLisible(min: number | null) {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
