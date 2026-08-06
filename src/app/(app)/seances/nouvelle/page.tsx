import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { alertes, type Anamnese, type Cliente, type SoinCatalogue } from "@/lib/types";
import ParcoursSeance, { type RdvOrigine } from "./parcours-seance";

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
        .select("id, cliente_id, date_rdv, heure_rdv, soin_id, statut, seance_id")
        .eq("id", rdv)
        .maybeSingle<{
          id: string;
          cliente_id: string;
          date_rdv: string;
          heure_rdv: string | null;
          soin_id: string | null;
          statut: string;
          seance_id: string | null;
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
    supabase.from("seances").select("cliente_id").returns<{ cliente_id: string }[]>(),
  ]);

  const avecSeance = [...new Set((dejaVenues ?? []).map((s) => s.cliente_id))];

  // Nombre de séances déjà enregistrées par cliente : c'est lui qui dit si la
  // séance en cours est une 5e, une 10e… et ouvre droit à la remise fidélité.
  // La même lecture sert aux deux, elle n'est pas refaite.
  const seancesParCliente: Record<string, number> = {};
  for (const s of dejaVenues ?? []) {
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
        }
      : null;

  let alertesCliente: string[] = [];
  if (cliente) {
    const { data: bilan } = await supabase
      .from("anamneses_courantes")
      .select("*")
      .eq("cliente_id", cliente)
      .maybeSingle<Anamnese>();
    alertesCliente = alertes(bilan ?? null);
  }

  return (
    <ParcoursSeance
      clientes={clientes ?? []}
      soins={soins ?? []}
      clienteInitiale={cliente ?? null}
      alertesCliente={alertesCliente}
      avecSeance={avecSeance}
      seancesParCliente={seancesParCliente}
      rdvOrigine={rdvOrigine}
    />
  );
}
