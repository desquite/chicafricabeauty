import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Anamnese } from "@/lib/types";
import type { Sante } from "../../actions";
import { santeVide } from "../../etapes-sante";
import ParcoursSante from "./parcours-sante";

export const metadata = { title: "Mise à jour du bilan santé" };

export default async function PageSante({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nom_complet")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const { data: derniere } = await supabase
    .from("anamneses_courantes")
    .select("*")
    .eq("cliente_id", id)
    .maybeSingle<Anamnese>();

  const initial: Sante = derniere
    ? {
        allergies: derniere.allergies ?? "",
        traitement_en_cours: derniere.traitement_en_cours,
        traitement_detail: derniere.traitement_detail ?? "",
        grossesse_allaitement: derniere.grossesse_allaitement,
        port_lentilles: derniere.port_lentilles,
        implants_pacemaker: derniere.implants_pacemaker,
        injections_recentes: derniere.injections_recentes,
        injections_detail: derniere.injections_detail ?? "",
        fumeur: derniere.fumeur,
        exposition_uv: derniere.exposition_uv,
        hydratation: derniere.hydratation,
        routine_actuelle: derniere.routine_actuelle ?? "",
        priorites: derniere.priorites ?? [],
      }
    : santeVide;

  return (
    <ParcoursSante
      clienteId={cliente.id}
      nomComplet={cliente.nom_complet}
      initial={initial}
    />
  );
}
