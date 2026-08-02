import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Accueil — Chic Africa Beauty Online" };

export default async function PageAccueil() {
  const profil = await requireProfil();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  // `null` = la requête a échoué, typiquement parce que la migration n'a pas
  // encore été appliquée. On l'affiche comme tel plutôt que comme un zéro.
  const supabase = await createClient();
  const [clientes, seancesDuJour, rdvAVenir] = await Promise.all([
    supabase
      .from("clientes")
      .select("*", { count: "exact", head: true })
      .then((r) => (r.error ? null : (r.count ?? 0))),
    supabase
      .from("seances")
      .select("*", { count: "exact", head: true })
      .eq("date_seance", aujourdhui)
      .then((r) => (r.error ? null : (r.count ?? 0))),
    supabase
      .from("rendez_vous")
      .select("*", { count: "exact", head: true })
      .gte("date_rdv", aujourdhui)
      .eq("statut", "prevu")
      .then((r) => (r.error ? null : (r.count ?? 0))),
  ]);

  const baseIndisponible = clientes === null;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-sm text-brand-400">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-brand-800">
          Bonjour {profil.nom.split(" ")[0]}
        </h1>
      </header>

      {baseIndisponible && (
        <div className="mb-8 rounded-2xl border border-or-400 bg-or-400/10 p-5">
          <p className="font-medium text-brand-800">
            Base de données non initialisée
          </p>
          <p className="mt-1 text-sm text-brand-700">
            Appliquez la migration{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">
              supabase/migrations/0001_schema_initial.sql
            </code>{" "}
            dans l&apos;éditeur SQL Supabase, puis rechargez cette page.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Carte titre="Clientes" valeur={clientes} href="/clientes" />
        <Carte titre="Séances aujourd'hui" valeur={seancesDuJour} href="/seances" />
        <Carte titre="Rendez-vous à venir" valeur={rdvAVenir} href="/rendez-vous" />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Action
          href="/fiche/nouvelle"
          titre="Nouvelle cliente"
          detail="Fiche d'accueil à remplir sur la tablette"
        />
        <Action
          href="/seances/nouvelle"
          titre="Nouvelle séance"
          detail="Diagnostic, soin réalisé et suite à donner"
        />
      </div>
    </div>
  );
}

function Carte({
  titre,
  valeur,
  href,
}: {
  titre: string;
  valeur: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <p className="text-sm text-brand-400">{titre}</p>
      <p className="mt-2 text-4xl font-semibold text-brand-700">
        {valeur ?? "—"}
      </p>
    </Link>
  );
}

function Action({
  href,
  titre,
  detail,
}: {
  href: string;
  titre: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-touch items-center justify-between gap-4 rounded-2xl bg-brand-600 p-5 text-white transition-colors hover:bg-brand-700"
    >
      <span>
        <span className="block text-lg font-semibold">{titre}</span>
        <span className="block text-sm text-brand-100">{detail}</span>
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6 shrink-0"
        aria-hidden="true"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
