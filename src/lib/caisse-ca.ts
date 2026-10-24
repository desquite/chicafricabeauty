import "server-only";
import { bornes, evolution, type Periode } from "@/lib/caisse";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type ChiffrePeriode = {
  soins: number;
  produits: number;
  abonnements: number;
  total: number;
  /** Évolution par rapport à la période précédente, en %, ou null. */
  evolution: number | null;
  factures: number;
  panier: number;
};

type FactureCa = {
  montant_soins: number;
  montant_produits: number;
  remise_fidelite: number;
  remise_sur: "soin" | "produit" | null;
  payee_le: string;
};

/**
 * Chiffre d'affaires : soins et produits des factures encaissées (remise
 * fidélité déduite, acompte compris puisqu'il paie une partie du soin), plus
 * les versements d'abonnement reçus. Les factures annulées n'y sont pas.
 */
export async function chiffreAffaires(supabase: Client, jour: string): Promise<Record<Periode, ChiffrePeriode>> {
  const plusTot = [bornes("jour", jour), bornes("semaine", jour), bornes("mois", jour)]
    .map((b) => b.avantDebut)
    .sort()[0];
  const fin = bornes("mois", jour).fin > bornes("semaine", jour).fin ? bornes("mois", jour).fin : bornes("semaine", jour).fin;

  const [{ data: factures }, { data: versements }] = await Promise.all([
    supabase
      .from("factures")
      .select("montant_soins, montant_produits, remise_fidelite, remise_sur, payee_le")
      .eq("statut", "payee")
      .gte("payee_le", `${plusTot}T00:00:00Z`)
      .lt("payee_le", `${fin}T00:00:00Z`)
      .returns<FactureCa[]>(),
    supabase
      .from("paiements_abonnement")
      .select("montant, updated_at")
      .eq("statut", "reussi")
      .gte("updated_at", `${plusTot}T00:00:00Z`)
      .lt("updated_at", `${fin}T00:00:00Z`)
      .returns<{ montant: number; updated_at: string }[]>(),
  ]);

  const dans = (instant: string, de: string, a: string) => {
    const j = instant.slice(0, 10);
    return j >= de && j < a;
  };
  const cumul = (de: string, a: string) => {
    let soins = 0;
    let produits = 0;
    let n = 0;
    for (const f of factures ?? []) {
      if (!dans(f.payee_le, de, a)) continue;
      soins += f.montant_soins - (f.remise_sur === "soin" ? f.remise_fidelite : 0);
      produits += f.montant_produits - (f.remise_sur === "produit" ? f.remise_fidelite : 0);
      n += 1;
    }
    const abonnements = (versements ?? []).filter((v) => dans(v.updated_at, de, a)).reduce((t, v) => t + v.montant, 0);
    return { soins, produits, abonnements, total: soins + produits + abonnements, factures: n };
  };

  const resultat = {} as Record<Periode, ChiffrePeriode>;
  for (const periode of ["jour", "semaine", "mois"] as Periode[]) {
    const b = bornes(periode, jour);
    const actuel = cumul(b.debut, b.fin);
    const avant = cumul(b.avantDebut, b.avantFin);
    resultat[periode] = {
      ...actuel,
      evolution: evolution(actuel.total, avant.total),
      panier: actuel.factures ? Math.round((actuel.soins + actuel.produits) / actuel.factures) : 0,
    };
  }
  return resultat;
}
