"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Rouet } from "@/components/attente";

const ENTREES = [
  { href: "/accueil", libelle: "Accueil", icone: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" },
  { href: "/clientes", libelle: "Clientes", icone: "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.87M16.5 3.6a4 4 0 0 1 0 7.75" },
  { href: "/rendez-vous", libelle: "Rendez-vous", icone: "M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" },
  { href: "/seances", libelle: "Séances", icone: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  { href: "/relances", libelle: "À relancer", icone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" },
  { href: "/catalogue", libelle: "Catalogue", icone: "M4 6h16M4 12h16M4 18h10" },
  { href: "/statistiques", libelle: "Statistiques", icone: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
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

/**
 * L'icône de l'entrée, remplacée par un rouet tant que la page demandée n'est
 * pas arrivée. useLinkStatus ne se lit que sous le Link concerné.
 */
function IconeOuRouet({ d }: { d: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Rouet className="h-6 w-6 shrink-0" /> : <Icone d={d} />;
}

/** Nombre affiché à côté d'une entrée, par adresse : « /rendez-vous » → 4. */
type Pastilles = Record<string, number>;

function Pastille({ n, actif }: { n: number | undefined; actif: boolean }) {
  if (!n) return null;
  return (
    <span
      className={`ml-auto flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
        actif ? "bg-white text-brand-600" : "bg-brand-500 text-white"
      }`}
    >
      {n}
    </span>
  );
}

export function NavigationTablette({
  variante = "laterale",
  pastilles = {},
}: {
  variante?: "laterale" | "basse";
  pastilles?: Pastilles;
}) {
  const chemin = usePathname();
  // Entrée touchée : allumée dès l'appui, sans attendre la page. Elle ne vaut
  // que pour l'adresse d'où elle a été touchée, et s'efface donc d'elle-même
  // à l'arrivée sur la nouvelle page.
  const [vise, setVise] = useState<{ href: string; depuis: string } | null>(null);
  const cible = vise?.depuis === chemin ? vise.href : null;
  const estActif = (href: string) =>
    cible ? cible === href : chemin === href || chemin.startsWith(href + "/");
  const toucher = (href: string) => setVise({ href, depuis: chemin });

  if (variante === "basse") {
    return (
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-brand-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.04)] md:hidden">
        {ENTREES.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            aria-current={estActif(e.href) ? "page" : undefined}
            onClick={() => toucher(e.href)}
            className={`relative flex h-touch flex-col items-center justify-center gap-1 text-[11px] ${
              estActif(e.href) ? "font-semibold text-brand-600" : "text-brand-400"
            }`}
          >
            {estActif(e.href) && (
              <span className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-brand-600" />
            )}
            <IconeOuRouet d={e.icone} />
            {e.libelle}
            {pastilles[e.href] ? (
              <span className="absolute top-1 right-[18%] flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                {pastilles[e.href]}
              </span>
            ) : null}
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
          onClick={() => toucher(e.href)}
          className={`flex h-touch items-center gap-3 rounded-xl px-4 text-[15px] font-medium transition-colors ${
            estActif(e.href)
              ? "bg-brand-600 text-white"
              : "text-brand-800 hover:bg-brand-50"
          }`}
        >
          <IconeOuRouet d={e.icone} />
          {e.libelle}
          <Pastille n={pastilles[e.href]} actif={estActif(e.href)} />
        </Link>
      ))}
    </nav>
  );
}
