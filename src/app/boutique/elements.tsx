"use client";

import Link from "next/link";
import { fraunces } from "@/app/rdv/polices";
import { usePanier } from "./panier-etat";

export const titre = `${fraunces.className} font-medium text-brand-800`;

export const prix = (n: number) => `${n.toLocaleString("fr-FR")} F`;

function IconePanier() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/** En-tête des pages : retour à gauche (ou le nom de l'institut), panier à droite. */
export function EnTete({ retour, libelle }: { retour?: string; libelle?: string }) {
  const { nombre } = usePanier();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-200 bg-creme/95 px-4 py-3 backdrop-blur">
      {retour ? (
        <Link href={retour} className="flex min-h-11 items-center gap-1.5 text-[15px] font-bold text-brand-800">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {libelle ?? "Boutique"}
        </Link>
      ) : (
        <Link href="/boutique" className="flex flex-col leading-tight">
          <span className={`${titre} text-[22px]`}>Chic Africa Beauty</span>
          <span className="text-xs font-semibold text-brand-600">La boutique · soins naturels</span>
        </Link>
      )}
      <Link
        href="/boutique/panier"
        aria-label={`Panier, ${nombre} article${nombre > 1 ? "s" : ""}`}
        className="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-800"
      >
        <IconePanier />
        {nombre > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-extrabold text-white">
            {nombre}
          </span>
        )}
      </Link>
    </header>
  );
}

/** Choix de la quantité, plafonné au stock disponible. */
export function Quantite({
  valeur,
  max,
  changer,
  grand = false,
}: {
  valeur: number;
  max: number;
  changer: (n: number) => void;
  grand?: boolean;
}) {
  const h = grand ? "h-[52px] w-12" : "h-11 w-10";
  return (
    <div role="group" aria-label="Quantité" className="flex items-center rounded-full border border-brand-200 bg-white">
      <button type="button" aria-label="Retirer un" onClick={() => changer(valeur - 1)} className={`${h} text-xl text-brand-800`}>
        −
      </button>
      <span className="w-7 text-center font-extrabold" aria-live="polite">
        {valeur}
      </span>
      <button
        type="button"
        aria-label="Ajouter un"
        disabled={valeur >= max}
        onClick={() => changer(valeur + 1)}
        className={`${h} text-xl text-brand-800 disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}

export function PhotoProduit({ src, nom, className }: { src: string | undefined; nom: string; className: string }) {
  if (!src) {
    return (
      <div className={`${className} flex items-center justify-center bg-brand-100 text-xs font-bold text-brand-600`}>
        Photo à venir
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={nom} className={`${className} bg-brand-100 object-cover`} loading="lazy" />;
}
