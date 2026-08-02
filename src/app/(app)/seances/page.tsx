import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EVOLUTION, type Cliente, type Seance } from "@/lib/types";

export const metadata = { title: "Séances — Chic Africa Beauty Online" };

type LigneSeance = Seance & { clientes: Pick<Cliente, "nom" | "prenoms"> | null };

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export default async function PageSeances() {
  await requireProfil();
  const supabase = await createClient();

  const { data: seances, error } = await supabase
    .from("seances")
    .select("*, clientes(nom, prenoms)")
    .order("date_seance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<LigneSeance[]>();

  if (error) throw new Error(`Lecture des séances impossible : ${error.message}`);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const duJour = seances.filter((s) => s.date_seance === aujourdhui);
  const precedentes = seances.filter((s) => s.date_seance !== aujourdhui);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-800">Séances</h1>
        <div className="flex gap-3">
          <a
            href="/api/export/seances"
            className="flex h-touch items-center rounded-xl border border-brand-200 bg-white px-5 font-medium text-brand-700 hover:bg-brand-50"
          >
            Export Excel
          </a>
          <Link
            href="/seances/nouvelle"
            className="flex h-touch items-center rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
          >
            Nouvelle séance
          </Link>
        </div>
      </header>

      {seances.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-200 p-10 text-center text-brand-400">
          Aucune séance enregistrée pour le moment.
        </p>
      ) : (
        <>
          <Groupe titre="Aujourd'hui" seances={duJour} vide="Aucune séance aujourd'hui." />
          <Groupe titre="Précédentes" seances={precedentes} />
        </>
      )}
    </div>
  );
}

function Groupe({
  titre,
  seances,
  vide,
}: {
  titre: string;
  seances: LigneSeance[];
  vide?: string;
}) {
  if (seances.length === 0 && !vide) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-brand-400 uppercase">
        {titre}
      </h2>
      {seances.length === 0 ? (
        <p className="text-brand-400">{vide}</p>
      ) : (
        <ul className="space-y-3">
          {seances.map((s) => (
            <li key={s.id}>
              <Link
                href={`/seances/${s.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold text-brand-800">
                    {s.clientes ? `${s.clientes.prenoms} ${s.clientes.nom}` : "Cliente inconnue"}
                  </span>
                  <span className="block text-sm text-brand-400">
                    {dateFr(s.date_seance)}
                    {s.evolution &&
                      ` · ${EVOLUTION.find((e) => e.valeur === s.evolution)?.libelle}`}
                  </span>
                </span>
                {s.incident && (
                  <span className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                    Incident
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
