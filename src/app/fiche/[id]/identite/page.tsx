import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Cliente } from "@/lib/types";
import FormulaireIdentite from "./formulaire-identite";

export const metadata = { title: "Modifier la fiche cliente" };

export default async function PageIdentite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle<Cliente>();
  if (!cliente) notFound();

  const { count } = await supabase
    .from("seances")
    .select("*", { count: "exact", head: true })
    .eq("cliente_id", id);

  return (
    <FormulaireIdentite
      clienteId={cliente.id}
      actif={cliente.actif}
      nbSeances={count ?? 0}
      initial={{
        nom_complet: cliente.nom_complet,
        date_naissance: cliente.date_naissance ?? "",
        profession: cliente.profession ?? "",
        telephone: cliente.telephone,
        email: cliente.email ?? "",
        notes: cliente.notes ?? "",
      }}
    />
  );
}
