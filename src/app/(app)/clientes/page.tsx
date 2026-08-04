import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { BoutonExport } from "@/components/bouton-export";
import { createClient } from "@/lib/supabase/server";
import { age, alertes, type Anamnese, type Cliente } from "@/lib/types";
import { ListeClientes, type LigneCliente } from "./liste-clientes";

export const metadata = { title: "Clientes — Chic Africa Beauty Online" };

// PostgREST plafonne les réponses : au-delà, la recherche instantanée ne
// couvrirait plus tout le fichier, et l'écran le signale.
const PLAFOND = 1000;

export default async function PageClientes() {
  await requireProfil();
  const supabase = await createClient();

  const [{ data: clientes, error }, { data: bilans }, { count }] = await Promise.all([
    supabase
      .from("clientes")
      .select("*")
      .eq("actif", true)
      .order("nom_complet")
      .limit(PLAFOND)
      .returns<Cliente[]>(),
    supabase.from("anamneses_courantes").select("*").returns<Anamnese[]>(),
    supabase
      .from("clientes")
      .select("*", { count: "exact", head: true })
      .eq("actif", true),
  ]);

  if (error) throw new Error(`Lecture des clientes impossible : ${error.message}`);

  const parCliente = new Map((bilans ?? []).map((b) => [b.cliente_id, b]));

  const lignes: LigneCliente[] = clientes.map((c) => ({
    id: c.id,
    nom_complet: c.nom_complet,
    telephone: c.telephone,
    age: age(c.date_naissance),
    alertes: alertes(parCliente.get(c.id) ?? null).length,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-800">Clientes</h1>
        <div className="flex gap-3">
          <BoutonExport href="/api/export/clientes" />
          <Link
            href="/fiche/nouvelle"
            className="flex h-touch items-center rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
          >
            Nouvelle cliente
          </Link>
        </div>
      </header>

      <ListeClientes lignes={lignes} tronquee={(count ?? 0) > lignes.length} />
    </div>
  );
}
