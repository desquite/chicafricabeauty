"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Rouet } from "@/components/attente";

type Entree = { href: string; libelle: string; icone: string; exact?: boolean };

/** Volet « Institut » : les clientes, l'agenda, les soins. */
const ENTREES: Entree[] = [
  { href: "/accueil", libelle: "Accueil", icone: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" },
  { href: "/clientes", libelle: "Clientes", icone: "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.87M16.5 3.6a4 4 0 0 1 0 7.75" },
  { href: "/rendez-vous", libelle: "Rendez-vous", icone: "M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" },
  { href: "/seances", libelle: "Séances", icone: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  { href: "/relances", libelle: "À relancer", icone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" },
  { href: "/catalogue", libelle: "Catalogue", icone: "M4 6h16M4 12h16M4 18h10" },
  { href: "/statistiques", libelle: "Statistiques", icone: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

/** Volet « Caisse & stock », réservé à la gérante. */
const ENTREES_CAISSE: Entree[] = [
  { href: "/caisse", libelle: "À facturer", exact: true, icone: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" },
  { href: "/caisse/factures", libelle: "Factures", icone: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6" },
  { href: "/caisse/stock", libelle: "Stock", icone: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" },
  { href: "/caisse/cloture", libelle: "Clôture", icone: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

const ICONE_CAISSE = "M3 7h18v13H3zM3 11h18M7 15h4";
const ICONE_INSTITUT = "M12 3c3 3 3 6 0 9-3-3-3-6 0-9zM5 12c4 0 6 2 7 6-4 0-6-2-7-6zM19 12c-4 0-6 2-7 6 4 0 6-2 7-6z";

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
  gerante = false,
}: {
  variante?: "laterale" | "basse";
  pastilles?: Pastilles;
  /** La gérante voit aussi le volet « Caisse & stock ». */
  gerante?: boolean;
}) {
  const chemin = usePathname();
  const enCaisse = gerante && (chemin === "/caisse" || chemin.startsWith("/caisse/"));
  const entrees = enCaisse ? ENTREES_CAISSE : ENTREES;
  // Entrée touchée : allumée dès l'appui, sans attendre la page. Elle ne vaut
  // que pour l'adresse d'où elle a été touchée, et s'efface donc d'elle-même
  // à l'arrivée sur la nouvelle page.
  const [vise, setVise] = useState<{ href: string; depuis: string } | null>(null);
  const cible = vise?.depuis === chemin ? vise.href : null;
  const estActif = (href: string) => {
    if (cible) return cible === href;
    const exact = entrees.find((e) => e.href === href)?.exact;
    return chemin === href || (!exact && chemin.startsWith(href + "/"));
  };
  // Le basculement d'un volet à l'autre, pour la gérante seulement.
  const bascule: Entree = enCaisse
    ? { href: "/accueil", libelle: "Institut", icone: ICONE_INSTITUT }
    : { href: "/caisse", libelle: "Caisse", icone: ICONE_CAISSE };
  const toucher = (href: string) => setVise({ href, depuis: chemin });

  if (variante === "basse") {
    return (
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-40 grid border-t border-brand-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.04)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${entrees.length + (gerante ? 1 : 0)}, minmax(0, 1fr))` }}
      >
        {[...entrees, ...(gerante ? [bascule] : [])].map((e) => (
          <Link
            key={e.href}
            href={e.href}
            aria-current={estActif(e.href) ? "page" : undefined}
            onClick={() => toucher(e.href)}
            className={`relative flex h-touch min-w-0 flex-col items-center justify-center gap-1 truncate px-0.5 ${
              gerante && !enCaisse ? "text-[10px]" : "text-[11px]"
            } ${
              e === bascule
                ? "bg-brand-50 font-semibold text-brand-700"
                : estActif(e.href)
                  ? "font-semibold text-brand-600"
                  : "text-brand-400"
            }`}
          >
            {e !== bascule && estActif(e.href) && (
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
      {gerante && (
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-brand-100 p-1" aria-label="Espace">
          {[
            { href: "/accueil", libelle: "Institut", actif: !enCaisse },
            { href: "/caisse", libelle: "Caisse & stock", actif: enCaisse },
          ].map((v) => (
            <Link
              key={v.href}
              href={v.href}
              aria-current={v.actif ? "true" : undefined}
              onClick={() => toucher(v.href)}
              className={`flex h-10 items-center justify-center rounded-lg text-[13px] font-bold ${
                v.actif ? "bg-brand-600 text-white" : "text-brand-600 hover:bg-white/60"
              }`}
            >
              {v.libelle}
            </Link>
          ))}
        </div>
      )}
      {entrees.map((e) => (
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
