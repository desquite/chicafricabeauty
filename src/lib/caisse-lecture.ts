import "server-only";
import { promoProduit, type PrixProduit } from "@/lib/promo-produit";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AFacturer = {
  rdvId: string;
  date: string;
  heure: string | null;
  cliente: { id: string; nom: string } | null;
  soin: string | null;
  acompte: number;
  seanceSaisie: boolean;
  /** Facture déjà commencée (brouillon) pour ce rendez-vous. */
  factureId: string | null;
};

/**
 * Rendez-vous honorés qui attendent leur facture, depuis la mise en service
 * de la caisse. Un rendez-vous dont la facture est encaissée sort de la
 * liste ; une facture annulée l'y remet.
 */
export async function lireAFacturer(supabase: Client): Promise<AFacturer[]> {
  const { data: reglages } = await supabase
    .from("reglages_rdv")
    .select("caisse_depuis")
    .maybeSingle<{ caisse_depuis: string }>();
  const depuis = reglages?.caisse_depuis ?? new Date().toISOString().slice(0, 10);

  const { data: rdvs } = await supabase
    .from("rendez_vous")
    .select(
      "id, date_rdv, heure_rdv, seance_id, acompte_paye_le, acompte_montant, clientes(id, nom_complet), soins_catalogue(libelle, libelle_public)",
    )
    .eq("statut", "honore")
    .gte("date_rdv", depuis)
    .is("remplace_par", null)
    .is("masque_le", null)
    .order("date_rdv", { ascending: false })
    .order("heure_rdv", { ascending: false })
    .limit(200)
    .returns<
      {
        id: string;
        date_rdv: string;
        heure_rdv: string | null;
        seance_id: string | null;
        acompte_paye_le: string | null;
        acompte_montant: number | null;
        clientes: { id: string; nom_complet: string } | null;
        soins_catalogue: { libelle: string; libelle_public: string | null } | null;
      }[]
    >();
  if (!rdvs?.length) return [];

  const { data: factures } = await supabase
    .from("factures")
    .select("id, rendez_vous_id, statut")
    .in("rendez_vous_id", rdvs.map((r) => r.id))
    .neq("statut", "annulee")
    .returns<{ id: string; rendez_vous_id: string; statut: string }[]>();
  const parRdv = new Map((factures ?? []).map((f) => [f.rendez_vous_id, f]));

  return rdvs
    .filter((r) => parRdv.get(r.id)?.statut !== "payee")
    .map((r) => ({
      rdvId: r.id,
      date: r.date_rdv,
      heure: r.heure_rdv,
      cliente: r.clientes ? { id: r.clientes.id, nom: r.clientes.nom_complet } : null,
      soin: r.soins_catalogue?.libelle_public || r.soins_catalogue?.libelle || null,
      acompte: r.acompte_paye_le ? (r.acompte_montant ?? 0) : 0,
      seanceSaisie: Boolean(r.seance_id),
      factureId: parRdv.get(r.id)?.id ?? null,
    }));
}

export type Produit = {
  id: string;
  nom: string;
  categorie: string | null;
  prix_vente: number;
  /** Prix réduit pendant une promotion ; null hors promotion. */
  prix_promo: number | null;
  /** Dernier jour de la promotion ; null si elle dure jusqu'à nouvel ordre. */
  promo_fin: string | null;
  prix_achat: number | null;
  stock: number;
  seuil: number;
  actif: boolean;
};

/** Prix encaissé aujourd'hui : la promotion si elle baisse le prix. */
export const prixActuel = (p: PrixProduit) => promoProduit(p) ?? p.prix_vente;

export async function lireProduits(supabase: Client, actifsSeulement = true): Promise<Produit[]> {
  let q = supabase.from("produits").select("*").order("nom");
  if (actifsSeulement) q = q.eq("actif", true);
  const { data } = await q.returns<Produit[]>();
  return data ?? [];
}

export const stockBas = (p: Pick<Produit, "stock" | "seuil">) => p.stock <= p.seuil;

/** Pastilles du volet Caisse : rendez-vous à facturer, produits en stock bas. */
export async function pastillesCaisse(supabase: Client) {
  const [aFacturer, produits, { count: aEnvoyer }] = await Promise.all([
    lireAFacturer(supabase),
    lireProduits(supabase),
    // Commandes de la boutique payées, pas encore parties.
    supabase.from("commandes").select("id", { count: "exact", head: true }).eq("statut", "payee"),
  ]);
  return {
    "/caisse": aFacturer.length,
    "/caisse/boutique": aEnvoyer ?? 0,
    "/caisse/stock": produits.filter(stockBas).length,
  };
}
