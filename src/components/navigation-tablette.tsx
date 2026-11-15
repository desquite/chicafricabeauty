"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Rouet } from "@/components/attente";
import { seDeconnecter } from "@/app/connexion/actions";

type Entree = {
  href: string;
  libelle: string;
  icone: string;
  exact?: boolean;
  /** Dans la barre du bas des téléphones ; les autres passent sous « Plus ». */
  principale?: boolean;
};

/** Volet « Institut » : les clientes, l'agenda, les soins. */
const ENTREES: Entree[] = [
  { href: "/accueil", libelle: "Accueil", principale: true, icone: "M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" },
  { href: "/messages", libelle: "Messages", principale: true, icone: "M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.5A9 9 0 1 1 21 12z" },
  { href: "/clientes", libelle: "Clientes", principale: true, icone: "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.87M16.5 3.6a4 4 0 0 1 0 7.75" },
  { href: "/abonnements", libelle: "Abonnements", icone: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" },
  { href: "/rendez-vous", libelle: "Rendez-vous", principale: true, icone: "M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" },
  { href: "/seances", libelle: "Séances", icone: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  { href: "/relances", libelle: "À relancer", icone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" },
  { href: "/catalogue", libelle: "Catalogue", icone: "M4 6h16M4 12h16M4 18h10" },
  { href: "/statistiques", libelle: "Statistiques", icone: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

/** Volet « Caisse & stock », réservé à la gérante. */
const ENTREES_CAISSE: Entree[] = [
  { href: "/caisse", libelle: "À facturer", exact: true, principale: true, icone: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" },
  { href: "/caisse/factures", libelle: "Factures", principale: true, icone: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6" },
  { href: "/caisse/boutique", libelle: "Boutique", principale: true, icone: "M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8zM9 8V6a3 3 0 0 1 6 0v2" },
  { href: "/caisse/stock", libelle: "Stock", principale: true, icone: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" },
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

/** Onglet de la barre du bas : l'actif porte une pilule derrière son icône. */
function OngletBas({
  href,
  libelle,
  icone,
  actif,
  pastille,
  onClick,
}: {
  href: string;
  libelle: string;
  icone: string;
  actif: boolean;
  pastille: number | undefined;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      onClick={onClick}
      className={`relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 truncate text-[11px] ${
        actif ? "font-semibold text-brand-700" : "text-brand-400"
      }`}
    >
      <span className={`flex h-8 w-14 items-center justify-center rounded-full ${actif ? "bg-brand-100" : ""}`}>
        <IconeOuRouet d={icone} />
      </span>
      {libelle}
      {pastille ? (
        <span className="absolute top-1 right-[14%] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
          {pastille}
        </span>
      ) : null}
    </Link>
  );
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
  profil,
}: {
  variante?: "laterale" | "basse";
  pastilles?: Pastilles;
  /** La gérante voit aussi le volet « Caisse & stock ». */
  gerante?: boolean;
  /** Sur téléphone, la déconnexion se trouve sous « Plus ». */
  profil?: { nom: string; role: string };
}) {
  const chemin = usePathname();
  const enCaisse = gerante && (chemin === "/caisse" || chemin.startsWith("/caisse/"));
  const entrees = enCaisse ? ENTREES_CAISSE : ENTREES;
  const entreesMobile = entrees.filter((e) => e.principale);
  // Feuille « Plus » : ouverte sur une adresse, elle se referme d'elle-même
  // à l'arrivée sur une autre page.
  const [plusOuvert, setPlusOuvert] = useState<string | null>(null);
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
    const secondaires = [...entrees.filter((e) => !e.principale), ...(gerante ? [bascule] : [])];
    const surSecondaire = secondaires.some((e) => e !== bascule && estActif(e.href));
    const pastillesCachees = secondaires.reduce((s, e) => s + (pastilles[e.href] ?? 0), 0);
    const ouvert = plusOuvert === chemin;
    return (
      <>
        {/* La barre n'est pas posée sur la page : c'est le dernier élément de
            l'écran, sous la zone qui défile. Rien ne peut donc la déplacer. */}
        <nav className="no-print relative z-[60] grid shrink-0 grid-cols-5 border-t border-brand-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {entreesMobile.map((e) => (
            <OngletBas
              key={e.href}
              href={e.href}
              libelle={e.libelle}
              icone={e.icone}
              actif={!ouvert && estActif(e.href)}
              pastille={pastilles[e.href]}
              onClick={() => {
                setPlusOuvert(null);
                toucher(e.href);
              }}
            />
          ))}
          <button
            type="button"
            aria-expanded={ouvert}
            onClick={() => setPlusOuvert(ouvert ? null : chemin)}
            className={`relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[11px] ${
              ouvert || surSecondaire ? "font-semibold text-brand-700" : "text-brand-400"
            }`}
          >
            <span className={`flex h-8 w-14 items-center justify-center rounded-full ${ouvert || surSecondaire ? "bg-brand-100" : ""}`}>
              <Icone d={ouvert ? "M6 6l12 12M18 6L6 18" : "M4 6h16M4 12h16M4 18h16"} />
            </span>
            Plus
            {!ouvert && pastillesCachees > 0 && (
              <span className="absolute top-1.5 right-[22%] h-2.5 w-2.5 rounded-full bg-brand-500" />
            )}
          </button>
        </nav>

        {ouvert && (
          <div className="no-print fixed inset-0 z-50 flex flex-col justify-end md:hidden" role="dialog" aria-label="Plus">
            <button type="button" aria-label="Fermer" onClick={() => setPlusOuvert(null)} className="absolute inset-0 bg-black/30" />
            <div className="relative rounded-t-3xl bg-white px-4 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-brand-200" aria-hidden="true" />
              <div className="grid grid-cols-3 gap-2">
                {secondaires.map((e) => (
                  <Link
                    key={e.href}
                    href={e.href}
                    onClick={() => {
                      setPlusOuvert(null);
                      toucher(e.href);
                    }}
                    className={`relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl text-[13px] font-medium ${
                      e === bascule
                        ? "bg-brand-600 text-white"
                        : estActif(e.href)
                          ? "bg-brand-100 font-semibold text-brand-700"
                          : "bg-brand-50 text-brand-800"
                    }`}
                  >
                    <IconeOuRouet d={e.icone} />
                    {e === bascule ? (enCaisse ? "Institut" : "Caisse & stock") : e.libelle}
                    {pastilles[e.href] ? (
                      <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white">
                        {pastilles[e.href]}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
              {profil && (
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-brand-100 pt-4">
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold text-brand-800">{profil.nom}</p>
                    <p className="text-xs text-brand-400 capitalize">{profil.role}</p>
                  </div>
                  <form action={seDeconnecter}>
                    <button type="submit" className="h-11 rounded-xl border border-brand-200 px-4 text-sm font-medium text-brand-700">
                      Se déconnecter
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </>
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
