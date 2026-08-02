import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { age, alertes, type Anamnese, type Cliente } from "@/lib/types";

export const metadata = { title: "Clientes — Chic Africa Beauty Online" };

export default async function PageClientes({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireProfil();
  const { q = "" } = await searchParams;
  const recherche = q.trim();

  const supabase = await createClient();
  let requete = supabase
    .from("clientes")
    .select("*")
    .eq("actif", true)
    .order("nom")
    .limit(200);

  if (recherche) {
    const motif = `%${recherche}%`;
    requete = requete.or(
      `nom.ilike.${motif},prenoms.ilike.${motif},telephone.ilike.${motif}`,
    );
  }

  const { data: clientes, error } = await requete.returns<Cliente[]>();
  if (error) throw new Error(`Lecture des clientes impossible : ${error.message}`);

  // Une seule requête pour tous les bilans, plutôt qu'une par cliente.
  const { data: bilans } = await supabase
    .from("anamneses_courantes")
    .select("*")
    .returns<Anamnese[]>();
  const parCliente = new Map((bilans ?? []).map((b) => [b.cliente_id, b]));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-800">Clientes</h1>
        <Link
          href="/fiche/nouvelle"
          className="flex h-touch items-center rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
        >
          Nouvelle cliente
        </Link>
      </header>

      <form className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={recherche}
          placeholder="Rechercher par nom, prénoms ou téléphone"
          className="h-touch w-full rounded-xl border border-brand-200 bg-white px-5 text-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </form>

      {clientes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-200 p-10 text-center text-brand-400">
          {recherche
            ? `Aucune cliente ne correspond à « ${recherche} ».`
            : "Aucune cliente enregistrée pour le moment."}
        </p>
      ) : (
        <ul className="space-y-3">
          {clientes.map((c) => {
            const bilan = parCliente.get(c.id) ?? null;
            const nbAlertes = alertes(bilan).length;
            const ans = age(c.date_naissance);
            return (
              <li key={c.id}>
                <Link
                  href={`/clientes/${c.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-semibold text-brand-800">
                      {c.prenoms} {c.nom}
                    </span>
                    <span className="block text-sm text-brand-400">
                      {c.telephone}
                      {ans !== null && ` · ${ans} ans`}
                    </span>
                  </span>
                  {nbAlertes > 0 && (
                    <span className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                      {nbAlertes} alerte{nbAlertes > 1 ? "s" : ""}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
