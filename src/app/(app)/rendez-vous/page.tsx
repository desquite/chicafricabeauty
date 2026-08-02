import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { alertes, type Anamnese, type Cliente, type SoinCatalogue } from "@/lib/types";
import Agenda, { type RdvAffiche } from "./agenda";

export const metadata = { title: "Rendez-vous — Chic Africa Beauty Online" };

const decale = (jour: string, n: number) =>
  new Date(new Date(jour).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export default async function PageRendezVous({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>;
}) {
  await requireProfil();
  const params = await searchParams;
  const jour = params.jour ?? new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: rdvs }, { data: clientes }, { data: soins }] = await Promise.all([
    supabase
      .from("rendez_vous")
      .select(
        "id, date_rdv, heure_rdv, duree_min, statut, notes, clientes(id, nom_complet, telephone), soins_catalogue(libelle)",
      )
      .eq("date_rdv", jour)
      .order("heure_rdv", { nullsFirst: false })
      .returns<Omit<RdvAffiche, "alertes">[]>(),
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
  ]);

  const ids = (rdvs ?? [])
    .map((r) => r.clientes?.id)
    .filter((v): v is string => Boolean(v));

  const { data: bilans } = ids.length
    ? await supabase
        .from("anamneses_courantes")
        .select("*")
        .in("cliente_id", ids)
        .returns<Anamnese[]>()
    : { data: [] as Anamnese[] };

  const enrichis: RdvAffiche[] = (rdvs ?? []).map((r) => ({
    ...r,
    alertes: r.clientes
      ? alertes((bilans ?? []).find((b) => b.cliente_id === r.clientes!.id) ?? null).length
      : 0,
  }));

  const dateLisible = new Date(jour).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-800">Rendez-vous</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Lien jour={decale(jour, -1)} libelle="← Veille" />
          <span className="px-2 font-medium text-brand-700 capitalize">{dateLisible}</span>
          <Lien jour={decale(jour, 1)} libelle="Lendemain →" />
          <Lien jour={new Date().toISOString().slice(0, 10)} libelle="Aujourd'hui" />
        </div>
      </header>

      <Agenda rdvs={enrichis} clientes={clientes ?? []} soins={soins ?? []} jour={jour} />
    </div>
  );
}

function Lien({ jour, libelle }: { jour: string; libelle: string }) {
  return (
    <Link
      href={`/rendez-vous?jour=${jour}`}
      className="flex h-11 items-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
    >
      {libelle}
    </Link>
  );
}
