import { couvre } from "@/lib/abonnements";
import { lireAbonnements } from "@/lib/abonnements-lecture";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prixDuJour, type PrixSoin } from "@/lib/disponibilites";
import { age, alertes, type Anamnese, type Cliente, type SoinCatalogue } from "@/lib/types";
import ParcoursSeance, {
  type DerniereSeance,
  type FicheExpress,
  type RdvOrigine,
} from "./parcours-seance";

export const metadata = { title: "Nouvelle séance" };

export default async function PageNouvelleSeance({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; rdv?: string }>;
}) {
  await requireProfil();
  const { cliente: clienteDemandee, rdv } = await searchParams;
  const supabase = await createClient();

  // Rendez-vous d'où part la saisie. Il donne la cliente, la date et le soin
  // prévu, et c'est lui que la séance fera passer en honoré.
  const { data: rdvSource } = rdv
    ? await supabase
        .from("rendez_vous")
        .select(
          "id, cliente_id, date_rdv, heure_rdv, soin_id, statut, seance_id, duree_min, source, acompte_paye_le, acompte_montant, " +
            "soins_catalogue(libelle, libelle_public, duree_std, prix, prix_promo, promo_debut, promo_fin)",
        )
        .eq("id", rdv)
        .maybeSingle<{
          id: string;
          cliente_id: string;
          date_rdv: string;
          heure_rdv: string | null;
          soin_id: string | null;
          statut: string;
          seance_id: string | null;
          duree_min: number | null;
          source: string;
          acompte_paye_le: string | null;
          acompte_montant: number | null;
          soins_catalogue:
            | (PrixSoin & { libelle: string; libelle_public: string | null; duree_std: number | null })
            | null;
        }>()
    : { data: null };

  const cliente = clienteDemandee ?? rdvSource?.cliente_id;

  const [{ data: clientes }, { data: soins }, { data: dejaVenues }] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nom_complet, telephone")
      .eq("actif", true)
      .order("nom_complet")
      .returns<Pick<Cliente, "id" | "nom_complet" | "telephone">[]>(),
    supabase
      .from("soins_catalogue")
      .select("*")
      .eq("actif", true)
      .order("ordre")
      .returns<SoinCatalogue[]>(),
    // Clientes ayant déjà au moins une séance : pour elles, « Première
    // séance » n'a plus de sens et ne doit pas être proposé.
    supabase
      .from("seances")
      .select("cliente_id, abonnement_id")
      .returns<{ cliente_id: string; abonnement_id: string | null }[]>(),
  ]);

  const avecSeance = [...new Set((dejaVenues ?? []).map((s) => s.cliente_id))];

  // Soins couverts par un abonnement en cours, par cliente : leur séance ne
  // donne pas droit à la remise fidélité.
  const soinsAbonnement: Record<string, string[]> = {};
  const aujourdhuiSaisie = new Date().toISOString().slice(0, 10);
  for (const a of await lireAbonnements(supabase, { enCoursSeulement: true })) {
    if (couvre(a, a.soin_id, aujourdhuiSaisie)) (soinsAbonnement[a.cliente_id] ??= []).push(a.soin_id);
  }

  // Nombre de séances déjà enregistrées par cliente : c'est lui qui dit si la
  // séance en cours est une 5e, une 10e… et ouvre droit à la remise fidélité.
  // La même lecture sert aux deux, elle n'est pas refaite.
  const seancesParCliente: Record<string, number> = {};
  // Les séances d'abonnement ne comptent pas pour la fidélité.
  for (const s of dejaVenues ?? []) {
    if (s.abonnement_id) continue;
    seancesParCliente[s.cliente_id] = (seancesParCliente[s.cliente_id] ?? 0) + 1;
  }

  // Un rendez-vous déjà rattaché à une séance n'est pas repris : ce serait
  // une seconde séance pour une seule venue. Un soin retiré du catalogue non
  // plus, il ne serait pas visible dans la liste des soins réalisés.
  const rdvOrigine: RdvOrigine | null =
    rdvSource && rdvSource.cliente_id === cliente && !rdvSource.seance_id
      ? {
          id: rdvSource.id,
          date_rdv: rdvSource.date_rdv,
          heure_rdv: rdvSource.heure_rdv,
          soin_id:
            (soins ?? []).some((s) => s.id === rdvSource.soin_id)
              ? rdvSource.soin_id
              : null,
          duree_min: rdvSource.duree_min ?? rdvSource.soins_catalogue?.duree_std ?? null,
          soin: rdvSource.soins_catalogue?.libelle_public || rdvSource.soins_catalogue?.libelle || null,
          prix: rdvSource.soins_catalogue ? prixDuJour(rdvSource.soins_catalogue, rdvSource.date_rdv) : null,
          acompte: rdvSource.acompte_paye_le ? rdvSource.acompte_montant : null,
          enLigne: rdvSource.source === "en_ligne",
        }
      : null;

  let alertesCliente: string[] = [];
  let fiche: FicheExpress | null = null;
  let derniere: DerniereSeance | null = null;
  if (cliente) {
    const [{ data: bilan }, { data: c }, { data: precedente }] = await Promise.all([
      supabase
        .from("anamneses_courantes")
        .select("*")
        .eq("cliente_id", cliente)
        .maybeSingle<Anamnese>(),
      supabase
        .from("clientes")
        .select("nom_complet, telephone, date_naissance")
        .eq("id", cliente)
        .maybeSingle<{ nom_complet: string; telephone: string; date_naissance: string | null }>(),
      // La derniere seance, que la gerante peut reprendre d'un geste : la peau
      // et le protocole changent rarement d'une venue a l'autre.
      supabase
        .from("seances")
        .select(
          "date_seance, type_peau, etat_peau, observations_peau, zones, produits_utilises, appareil, programme, conseils, produits_conseilles, delai_recommande",
        )
        .eq("cliente_id", cliente)
        .order("date_seance", { ascending: false })
        .limit(1)
        .maybeSingle<DerniereSeance>(),
    ]);
    alertesCliente = alertes(bilan ?? null);
    derniere = precedente ?? null;
    if (c) {
      fiche = {
        id: cliente,
        nom: c.nom_complet,
        telephone: c.telephone,
        age: age(c.date_naissance),
        ficheSante: Boolean(bilan),
        venue: (seancesParCliente[cliente] ?? 0) + 1,
      };
    }
  }

  return (
    <ParcoursSeance
      clientes={clientes ?? []}
      soins={soins ?? []}
      clienteInitiale={cliente ?? null}
      alertesCliente={alertesCliente}
      avecSeance={avecSeance}
      seancesParCliente={seancesParCliente}
      soinsAbonnement={soinsAbonnement}
      rdvOrigine={rdvOrigine}
      fiche={fiche}
      derniere={derniere}
    />
  );
}
