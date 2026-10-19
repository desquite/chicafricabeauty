"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Navigation dans le temps, pilotée côté navigateur.
 *
 * Les flèches étaient auparavant des liens dont la cible était calculée par
 * le serveur à partir de la date affichée. Tant que la page suivante n'était
 * pas rendue, le bouton pointait encore vers la même date : dix clics rapides
 * n'avançaient que d'un jour, et l'écran semblait figé.
 *
 * Ici la date courante vit dans l'état local. Chaque clic l'incrémente
 * immédiatement, l'affichage suit sans attendre, et l'URL est poussée dans la
 * foulée. Le contenu, lui, rattrape son retard.
 */

const decaleJour = (iso: string, n: number) =>
  new Date(new Date(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

function decaleMois(cle: string, n: number) {
  const [a, m] = cle.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const styleBouton =
  "flex h-11 items-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50";

export function NavigationJour({ jour }: { jour: string }) {
  const router = useRouter();
  const [courant, setCourant] = useState(jour);
  const [enCours, demarrer] = useTransition();

  const aller = (cible: string) => {
    setCourant(cible);
    demarrer(() => router.push(`/rendez-vous?jour=${cible}`));
  };

  const lisible = new Date(courant).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" className={styleBouton} onClick={() => aller(decaleJour(courant, -1))}>
        ← Veille
      </button>
      {/* first-letter et non capitalize : « Samedi 1 Août » mettait une
          majuscule parasite au mois. */}
      <span className="px-2 font-medium text-brand-700 first-letter:uppercase">
        {lisible}
        {enCours && <span className="ml-2 text-sm text-brand-400">…</span>}
      </span>
      <button type="button" className={styleBouton} onClick={() => aller(decaleJour(courant, 1))}>
        Lendemain →
      </button>
      <button
        type="button"
        className={styleBouton}
        onClick={() => aller(new Date().toISOString().slice(0, 10))}
      >
        Aujourd&apos;hui
      </button>
      <Link href={`/rendez-vous?mois=${courant.slice(0, 7)}`} className={styleBouton}>
        Vue mois
      </Link>
    </div>
  );
}

export function NavigationMois({ mois }: { mois: string }) {
  const router = useRouter();
  const [courant, setCourant] = useState(mois);
  const [enCours, demarrer] = useTransition();

  const aller = (cible: string) => {
    setCourant(cible);
    demarrer(() => router.push(`/rendez-vous?mois=${cible}`));
  };

  const [a, m] = courant.split("-").map(Number);
  const lisible = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" className={styleBouton} onClick={() => aller(decaleMois(courant, -1))}>
        ← Mois précédent
      </button>
      <span className="px-2 font-medium text-brand-700 first-letter:uppercase">
        {lisible}
        {enCours && <span className="ml-2 text-sm text-brand-400">…</span>}
      </span>
      <button type="button" className={styleBouton} onClick={() => aller(decaleMois(courant, 1))}>
        Mois suivant →
      </button>
      <Link href={`/rendez-vous?jour=${new Date().toISOString().slice(0, 10)}`} className={styleBouton}>
        Aujourd&apos;hui
      </Link>
      <Link href="/rendez-vous?vue=avenir" className={styleBouton}>
        À venir
      </Link>
    </div>
  );
}

const plusJoursIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Bascule entre les vues de l'agenda. */
export function OngletsVues({ vue, jour }: { vue: string; jour: string }) {
  const onglets = [
    { id: "jour", nom: "Jour", href: `/rendez-vous?jour=${jour}` },
    { id: "semaine", nom: "Semaine", href: `/rendez-vous?semaine=${jour}` },
    { id: "mois", nom: "Mois", href: `/rendez-vous?mois=${jour.slice(0, 7)}` },
    { id: "avenir", nom: "À venir", href: "/rendez-vous?vue=avenir" },
  ];
  return (
    <nav aria-label="Vues de l'agenda" className="mt-4 inline-flex rounded-xl border border-brand-200 bg-white p-1">
      {onglets.map((o) => (
        <Link
          key={o.id}
          href={o.href}
          aria-current={vue === o.id ? "page" : undefined}
          className={`flex h-10 items-center rounded-lg px-4 text-sm font-semibold ${
            vue === o.id ? "bg-brand-600 text-white" : "text-brand-700 hover:bg-brand-50"
          }`}
        >
          {o.nom}
        </Link>
      ))}
    </nav>
  );
}

export function NavigationSemaine({ lundi }: { lundi: string }) {
  const router = useRouter();
  const [courant, setCourant] = useState(lundi);
  const [enCours, demarrer] = useTransition();

  const aller = (cible: string) => {
    setCourant(cible);
    demarrer(() => router.push(`/rendez-vous?semaine=${cible}`));
  };

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" className={styleBouton} onClick={() => aller(plusJoursIso(courant, -7))}>
        ← Semaine précédente
      </button>
      <span className="px-2 font-medium text-brand-700">
        Du {fmt(courant)} au {fmt(plusJoursIso(courant, 6))}
        {enCours && <span className="ml-2 text-sm text-brand-400">…</span>}
      </span>
      <button type="button" className={styleBouton} onClick={() => aller(plusJoursIso(courant, 7))}>
        Semaine suivante →
      </button>
      <button
        type="button"
        className={styleBouton}
        onClick={() => {
          const auj = new Date().toISOString().slice(0, 10);
          const j = new Date(`${auj}T00:00:00Z`).getUTCDay();
          aller(plusJoursIso(auj, -((j + 6) % 7)));
        }}
      >
        Cette semaine
      </button>
    </div>
  );
}
