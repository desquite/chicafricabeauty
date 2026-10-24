/**
 * Caisse : calcul d'une facture et périodes du chiffre d'affaires, sans base
 * ni horloge cachée.
 *
 * Les soins ont un prix au catalogue, mais la gérante fixe le montant final
 * (forfait) : un soin ajouté pendant la séance peut être fait à prix réduit.
 * La remise fidélité (20 %) porte sur les soins ou sur les produits, selon le
 * choix de la cliente consigné sur la séance. L'acompte déjà payé en ligne
 * est déduit. Pas de TVA.
 */
import { REMISE_POURCENT } from "@/lib/fidelite";

export const MODES_PAIEMENT = [
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "wave", libelle: "Wave" },
  { valeur: "orange", libelle: "Orange" },
  { valeur: "mtn", libelle: "MTN" },
  { valeur: "moov", libelle: "Moov" },
  { valeur: "carte", libelle: "Carte" },
] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number]["valeur"];
export const libelleMode = (m: string | null) => MODES_PAIEMENT.find((x) => x.valeur === m)?.libelle ?? "—";

export type Ligne = { prix_unitaire: number; quantite: number };

export type CalculFacture = {
  soinsNormal: number;
  soins: number;
  produits: number;
  remise: number;
  acompte: number;
  total: number;
};

const somme = (l: Ligne[]) => l.reduce((t, x) => t + x.prix_unitaire * x.quantite, 0);

/** Arrondi aux 50 F : pas de pièces plus petites en caisse. */
export const arrondi50 = (n: number) => Math.round(n / 50) * 50;

export function calculerFacture(p: {
  soins: Ligne[];
  /** Montant final saisi par la gérante ; null : le prix du catalogue. */
  montantSoins: number | null;
  produits: Ligne[];
  remiseSur: "soin" | "produit" | null;
  /** Acompte payé en ligne pour ce rendez-vous. */
  acompte: number;
}): CalculFacture {
  const soinsNormal = somme(p.soins);
  const soins = Math.max(0, p.montantSoins ?? soinsNormal);
  const produits = somme(p.produits);
  const base = p.remiseSur === "soin" ? soins : p.remiseSur === "produit" ? produits : 0;
  const remise = arrondi50((base * REMISE_POURCENT) / 100);
  const avantAcompte = Math.max(0, soins + produits - remise);
  // L'acompte ne rend jamais de monnaie : au plus, la facture tombe à zéro.
  const acompte = Math.min(Math.max(0, p.acompte), avantAcompte);
  return { soinsNormal, soins, produits, remise, acompte, total: avantAcompte - acompte };
}

/* ---------------------------------------------------- Chiffre d'affaires */

export type Periode = "jour" | "semaine" | "mois";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Bornes [début, fin[ d'une période contenant ce jour, et de la précédente. */
export function bornes(periode: Periode, jour: string) {
  const d = new Date(`${jour}T00:00:00Z`);
  let debut: Date;
  let fin: Date;
  let avantDebut: Date;
  if (periode === "jour") {
    debut = d;
    fin = new Date(d.getTime() + 86_400_000);
    // Même jour la semaine dernière : un samedi se compare à un samedi.
    avantDebut = new Date(d.getTime() - 7 * 86_400_000);
  } else if (periode === "semaine") {
    const decalage = (d.getUTCDay() + 6) % 7; // lundi = 0
    debut = new Date(d.getTime() - decalage * 86_400_000);
    fin = new Date(debut.getTime() + 7 * 86_400_000);
    avantDebut = new Date(debut.getTime() - 7 * 86_400_000);
  } else {
    debut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    avantDebut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  }
  const avantFin = new Date(avantDebut.getTime() + (fin.getTime() - debut.getTime()));
  return {
    debut: iso(debut),
    fin: iso(periode === "mois" ? fin : fin),
    avantDebut: iso(avantDebut),
    avantFin: iso(periode === "mois" ? debut : avantFin),
  };
}

/** Évolution en pourcentage entière, ou null sans point de comparaison. */
export const evolution = (actuel: number, avant: number) =>
  avant > 0 ? Math.round(((actuel - avant) / avant) * 100) : null;

export const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;
