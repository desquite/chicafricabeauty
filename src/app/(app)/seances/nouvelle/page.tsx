import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { alertes, type Anamnese, type Cliente, type SoinCatalogue } from "@/lib/types";
import ParcoursSeance from "./parcours-seance";

export const metadata = { title: "Nouvelle séance" };

export default async function PageNouvelleSeance({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  await requireProfil();
  const { cliente } = await searchParams;
  const supabase = await createClient();

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
    />
  );
}
