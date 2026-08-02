import { JOURS_PAR_DELAI } from "@/lib/types";

/**
 * Calculs des statistiques. Fonctions pures : aucune requête, aucun accès à
 * Supabase, pour rester lisibles et vérifiables isolément.
 *
 * Règle transversale : en dessous de SEUIL séances, un pourcentage ne veut
 * rien dire. Toutes les fonctions renvoient donc l'effectif à côté du taux,
 * et l'affichage masque le taux quand l'effectif est trop faible. Sur une
 * base qui restera creuse plusieurs semaines, « 100 % d'amélioration » sur
 * une séance ferait plus de mal que de bien.
 */
export const SEUIL = 5;

export type SeanceStat = {
  id: string;
  cliente_id: string;
  date_seance: string;
  type_venue: string;
  duree_min: number | null;
  evolution: string | null;
  incident: string | null;
  reactions: string[] | null;
  zones: string[] | null;
  delai_recommande: string | null;
  soins: { libelle: string; categorie: string | null }[];
};

export type RdvStat = { statut: string; date_rdv: string };

export type Part = { cle: string; libelle: string; nb: number; part: number };

const pourcent = (n: number, total: number) =>
  total === 0 ? 0 : Math.round((n / total) * 1000) / 10;

/* ------------------------------------------------------------------ période */

export type Periode = "mois" | "3m" | "12m" | "tout";

export const PERIODES: { valeur: Periode; libelle: string }[] = [
  { valeur: "mois", libelle: "Mois en cours" },
  { valeur: "3m", libelle: "3 mois" },
  { valeur: "12m", libelle: "12 mois" },
  { valeur: "tout", libelle: "Tout" },
];

/** Date ISO de début de période, ou null pour « tout l'historique ». */
export function debutPeriode(periode: Periode, aujourdhui = new Date()): string | null {
  const d = new Date(aujourdhui);
  if (periode === "tout") return null;
  if (periode === "mois") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  d.setMonth(d.getMonth() - (periode === "3m" ? 3 : 12));
  return d.toISOString().slice(0, 10);
}

/* ----------------------------------------------------------------- activité */

export type MoisActivite = {
  cle: string;
  libelle: string;
  total: number;
  premieres: number;
};

export function parMois(seances: SeanceStat[], nbMois: number, fin = new Date()): MoisActivite[] {
  const mois: MoisActivite[] = [];
  for (let i = nbMois - 1; i >= 0; i--) {
    const d = new Date(fin.getFullYear(), fin.getMonth() - i, 1);
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mois.push({
      cle,
      libelle: d.toLocaleDateString("fr-FR", { month: "short" }),
      total: 0,
      premieres: 0,
    });
  }
  const index = new Map(mois.map((m) => [m.cle, m]));
  for (const s of seances) {
    const m = index.get(s.date_seance.slice(0, 7));
    if (!m) continue;
    m.total += 1;
    if (s.type_venue === "premiere_seance") m.premieres += 1;
  }
  return mois;
}

export function dureeMoyenne(seances: SeanceStat[]) {
  const durees = seances.map((s) => s.duree_min).filter((d): d is number => !!d);
  if (durees.length === 0) return null;
  return Math.round(durees.reduce((a, b) => a + b, 0) / durees.length);
}

/** Clientes vues au moins une fois sur les `jours` derniers jours. */
export function clientesActives(seances: SeanceStat[], jours = 90, fin = new Date()) {
  const limite = new Date(fin.getTime() - jours * 86_400_000).toISOString().slice(0, 10);
  return new Set(seances.filter((s) => s.date_seance >= limite).map((s) => s.cliente_id)).size;
}

/* -------------------------------------------------------------------- soins */

export function classementSoins(seances: SeanceStat[]): Part[] {
  const compte = new Map<string, number>();
  for (const s of seances) {
    for (const soin of s.soins) {
      compte.set(soin.libelle, (compte.get(soin.libelle) ?? 0) + 1);
    }
  }
  const total = [...compte.values()].reduce((a, b) => a + b, 0);
  return [...compte.entries()]
    .map(([libelle, nb]) => ({ cle: libelle, libelle, nb, part: pourcent(nb, total) }))
    .sort((a, b) => b.nb - a.nb);
}

/** Répartition générique sur un champ tableau (zones, réactions…). */
export function repartitionListe(
  seances: SeanceStat[],
  champ: (s: SeanceStat) => string[] | null,
  options: readonly { valeur: string; libelle: string }[],
): Part[] {
  const compte = new Map<string, number>();
  for (const s of seances) {
    for (const v of champ(s) ?? []) compte.set(v, (compte.get(v) ?? 0) + 1);
  }
  const total = [...compte.values()].reduce((a, b) => a + b, 0);
  return [...compte.entries()]
    .map(([cle, nb]) => ({
      cle,
      libelle: options.find((o) => o.valeur === cle)?.libelle ?? cle,
      nb,
      part: pourcent(nb, total),
    }))
    .sort((a, b) => b.nb - a.nb);
}

export function repartitionCategories(seances: SeanceStat[]): Part[] {
  const compte = new Map<string, number>();
  for (const s of seances) {
    for (const soin of s.soins) {
      const c = soin.categorie ?? "Sans catégorie";
      compte.set(c, (compte.get(c) ?? 0) + 1);
    }
  }
  const total = [...compte.values()].reduce((a, b) => a + b, 0);
  return [...compte.entries()]
    .map(([cle, nb]) => ({ cle, libelle: cle, nb, part: pourcent(nb, total) }))
    .sort((a, b) => b.nb - a.nb);
}

/* ------------------------------------------------------------ rendez-vous */

export function tauxRendezVous(rdvs: RdvStat[]) {
  const passes = rdvs.filter((r) => r.statut !== "prevu");
  const absent = passes.filter((r) => r.statut === "absent").length;
  const annule = passes.filter((r) => r.statut === "annule").length;
  const honore = passes.filter((r) => r.statut === "honore").length;
  return {
    total: passes.length,
    honore,
    annule,
    absent,
    tauxAbsence: pourcent(absent, passes.length),
    tauxAnnulation: pourcent(annule, passes.length),
  };
}

/* -------------------------------------------------------------- fidélité */

/**
 * Écarts entre séances successives d'une même cliente, et comparaison au
 * délai qui avait été recommandé lors de la séance précédente.
 */
export function fidelite(seances: SeanceStat[], fin = new Date()) {
  const parClientes = new Map<string, SeanceStat[]>();
  for (const s of seances) {
    const l = parClientes.get(s.cliente_id) ?? [];
    l.push(s);
    parClientes.set(s.cliente_id, l);
  }

  const ecarts: number[] = [];
  const ecartsAuConseil: number[] = [];

  for (const liste of parClientes.values()) {
    const triees = [...liste].sort((a, b) => a.date_seance.localeCompare(b.date_seance));
    for (let i = 1; i < triees.length; i++) {
      const jours = Math.round(
        (new Date(triees[i].date_seance).getTime() -
          new Date(triees[i - 1].date_seance).getTime()) /
          86_400_000,
      );
      ecarts.push(jours);
      const conseille = triees[i - 1].delai_recommande
        ? JOURS_PAR_DELAI[triees[i - 1].delai_recommande!]
        : undefined;
      if (conseille) ecartsAuConseil.push(jours - conseille);
    }
  }

  // Une cliente venue une seule fois hier n'est pas une cliente perdue : on
  // ne la compte comme non revenue qu'après un délai de grâce de 60 jours.
  const limite = new Date(fin.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
  const eligibles = [...parClientes.values()].filter(
    (l) => l[0] && l.some((s) => s.date_seance <= limite),
  );
  const uneSeule = eligibles.filter((l) => l.length === 1).length;

  const moyenne = (l: number[]) =>
    l.length === 0 ? null : Math.round(l.reduce((a, b) => a + b, 0) / l.length);

  return {
    clientesSuivies: parClientes.size,
    nbEcarts: ecarts.length,
    delaiMoyen: moyenne(ecarts),
    ecartAuConseil: moyenne(ecartsAuConseil),
    eligibles: eligibles.length,
    uneSeule,
    tauxNonRetour: pourcent(uneSeule, eligibles.length),
  };
}

/* -------------------------------------------------------------- résultats */

const AMELIORATIONS = ["nette_amelioration", "legere_amelioration"];

/** Évolutions constatées, hors premières séances qui n'ont rien à comparer. */
export function evolutions(seances: SeanceStat[]) {
  const comparables = seances.filter(
    (s) => s.evolution && s.evolution !== "premiere_seance",
  );
  const compte = new Map<string, number>();
  for (const s of comparables) {
    compte.set(s.evolution!, (compte.get(s.evolution!) ?? 0) + 1);
  }
  return { total: comparables.length, compte };
}

export type ResultatSoin = {
  libelle: string;
  nb: number;
  ameliorations: number;
  taux: number;
};

export function evolutionParSoin(seances: SeanceStat[]): ResultatSoin[] {
  const parSoin = new Map<string, { nb: number; ameliorations: number }>();
  for (const s of seances) {
    if (!s.evolution || s.evolution === "premiere_seance") continue;
    for (const soin of s.soins) {
      const e = parSoin.get(soin.libelle) ?? { nb: 0, ameliorations: 0 };
      e.nb += 1;
      if (AMELIORATIONS.includes(s.evolution)) e.ameliorations += 1;
      parSoin.set(soin.libelle, e);
    }
  }
  return [...parSoin.entries()]
    .map(([libelle, e]) => ({
      libelle,
      nb: e.nb,
      ameliorations: e.ameliorations,
      taux: pourcent(e.ameliorations, e.nb),
    }))
    .sort((a, b) => b.nb - a.nb);
}

/* --------------------------------------------------------------- sécurité */

const REACTIONS_MARQUEES = ["rougeur_marquee", "douleur"];

export function securite(seances: SeanceStat[]) {
  const avecIncident = seances.filter((s) => s.incident && s.incident.trim()).length;
  const avecReaction = seances.filter((s) =>
    (s.reactions ?? []).some((r) => REACTIONS_MARQUEES.includes(r)),
  ).length;
  return {
    total: seances.length,
    avecIncident,
    avecReaction,
    tauxIncident: pourcent(avecIncident, seances.length),
    tauxReaction: pourcent(avecReaction, seances.length),
  };
}
