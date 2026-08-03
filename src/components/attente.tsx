"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function Rouet({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Barre de progression affichée pendant les navigations.
 *
 * Next n'expose pas d'événements de routeur : on intercepte donc les clics
 * sur les liens internes en phase de capture, et on efface la barre quand
 * l'URL a effectivement changé.
 *
 * Tout passe par le DOM plutôt que par un état React : un setState déclenché
 * depuis un effet provoquerait un rendu en cascade à chaque navigation, pour
 * un élément purement décoratif.
 */
export function BarreChargement() {
  const barre = useRef<HTMLDivElement>(null);
  const chemin = usePathname();
  const parametres = useSearchParams();

  useEffect(() => {
    const auClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const lien = (e.target as HTMLElement | null)?.closest?.("a");
      if (!lien || lien.target === "_blank" || lien.hasAttribute("download")) return;

      const cible = new URL(lien.href, window.location.href);
      if (cible.origin !== window.location.origin) return;
      // Un lien vers la page courante ne déclenche aucun chargement.
      if (
        cible.pathname + cible.search ===
        window.location.pathname + window.location.search
      )
        return;

      barre.current?.setAttribute("data-actif", "");
    };

    document.addEventListener("click", auClic, true);
    return () => document.removeEventListener("click", auClic, true);
  }, []);

  useEffect(() => {
    barre.current?.removeAttribute("data-actif");
  }, [chemin, parametres]);

  return (
    <div
      ref={barre}
      role="presentation"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 opacity-0 transition-opacity data-[actif]:opacity-100"
    >
      <div className="h-full w-full origin-left animate-[progression_2s_ease-out_forwards] bg-or-500" />
    </div>
  );
}
