"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENTREES = [
  { href: "/accueil", libelle: "Accueil", icone: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" },
  { href: "/clientes", libelle: "Clientes", icone: "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.87M16.5 3.6a4 4 0 0 1 0 7.75" },
  { href: "/seances", libelle: "Séances", icone: "M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" },
  { href: "/catalogue", libelle: "Catalogue", icone: "M4 6h16M4 12h16M4 18h10" },
];

function Icone({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 shrink-0"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function NavigationTablette({
  variante = "laterale",
}: {
  variante?: "laterale" | "basse";
}) {
  const chemin = usePathname();
  const estActif = (href: string) => chemin === href || chemin.startsWith(href + "/");

  if (variante === "basse") {
    return (
      <nav className="no-print grid grid-cols-4 border-t border-brand-100 bg-white md:hidden">
        {ENTREES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            aria-current={estActif(e.href) ? "page" : undefined}
            className={`flex h-touch flex-col items-center justify-center gap-1 text-[11px] ${
              estActif(e.href) ? "text-brand-600" : "text-brand-400"
            }`}
          >
            <Icone d={e.icone} />
            {e.libelle}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1 px-3">
      {ENTREES.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          aria-current={estActif(e.href) ? "page" : undefined}
          className={`flex h-touch items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-colors ${
            estActif(e.href)
              ? "bg-brand-600 text-white"
              : "text-brand-800 hover:bg-brand-50"
          }`}
        >
          <Icone d={e.icone} />
          {e.libelle}
        </Link>
      ))}
    </nav>
  );
}
