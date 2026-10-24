import "server-only";
import {
  etiquetteAbonnee,
  finAbonnement,
  situationPaiement,
  type Abonnement,
  type SituationPaiement,
} from "@/lib/abonnements";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AbonnementVue = Abonnement & {
  soin: string;
  fin: string;
  faites: number;
  /** Date de la dernière séance faite au titre de l'abonnement. */
  derniereSeance: string | null;
  etiquette: string;
  paiement: SituationPaiement;
};

/** Abonnements des clientes données, avec séances faites et paiements. */
export async function lireAbonnements(
  supabase: Client,
  /** Sans clienteIds : toutes les clientes. */
  filtre: { clienteIds?: string[]; enCoursSeulement?: boolean },
): Promise<AbonnementVue[]> {
  if (filtre.clienteIds && filtre.clienteIds.length === 0) return [];
  let requete = supabase
    .from("abonnements")
    .select("*, soins_catalogue(libelle, libelle_public)")
    .order("created_at", { ascending: false });
  if (filtre.clienteIds) requete = requete.in("cliente_id", filtre.clienteIds);
  if (filtre.enCoursSeulement) requete = requete.in("statut", ["actif", "pause"]);
  const { data: abos } = await requete.returns<
    (Abonnement & { soins_catalogue: { libelle: string; libelle_public: string | null } | null })[]
  >();
  if (!abos?.length) return [];

  const ids = abos.map((a) => a.id);
  const [{ data: seances }, { data: versements }] = await Promise.all([
    supabase
      .from("seances")
      .select("abonnement_id, date_seance")
      .in("abonnement_id", ids)
      .returns<{ abonnement_id: string; date_seance: string }[]>(),
    supabase
      .from("paiements_abonnement")
      .select("abonnement_id, montant")
      .in("abonnement_id", ids)
      .eq("statut", "reussi")
      .returns<{ abonnement_id: string; montant: number }[]>(),
  ]);

  const faites = new Map<string, number>();
  const derniere = new Map<string, string>();
  for (const s of seances ?? []) {
    faites.set(s.abonnement_id, (faites.get(s.abonnement_id) ?? 0) + 1);
    if ((derniere.get(s.abonnement_id) ?? "") < s.date_seance) derniere.set(s.abonnement_id, s.date_seance);
  }
  const paye = new Map<string, number>();
  for (const v of versements ?? []) paye.set(v.abonnement_id, (paye.get(v.abonnement_id) ?? 0) + v.montant);

  const jour = new Date().toISOString().slice(0, 10);
  return abos.map(({ soins_catalogue, ...a }) => {
    const n = faites.get(a.id) ?? 0;
    return {
      ...a,
      soin: soins_catalogue?.libelle_public || soins_catalogue?.libelle || "Soin",
      fin: finAbonnement(a),
      faites: n,
      derniereSeance: derniere.get(a.id) ?? null,
      etiquette: etiquetteAbonnee(a, n),
      paiement: situationPaiement(a, paye.get(a.id) ?? 0, jour),
    };
  });
}

/** Pastille des abonnées en cours, par cliente : « Abonnée · 4/13 ». */
export async function pastillesAbonnees(supabase: Client, clienteIds?: string[]) {
  const abos = await lireAbonnements(supabase, { clienteIds, enCoursSeulement: true });
  const pastilles = new Map<string, string>();
  for (const a of abos) if (!pastilles.has(a.cliente_id)) pastilles.set(a.cliente_id, a.etiquette);
  return pastilles;
}
