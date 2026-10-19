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

const EVENEMENT = "chargement:debut";

/**
 * Allume la barre de chargement pour une navigation lancée par le code
 * (router.push) plutôt que par un lien : la barre ne voit que les clics sur
 * les liens.
 */
export function signalerChargement() {
  window.dispatchEvent(new Event(EVENEMENT));
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
    let filet: ReturnType<typeof setTimeout> | undefined;

    const allumer = () => {
      const el = barre.current;
      if (!el) return;
      // L'animation ne rejoue pas d'elle-même : sans cette relance, la barre
      // apparaissait déjà pleine dès la deuxième navigation.
      const trait = el.firstElementChild as HTMLElement | null;
      if (trait) {
        trait.style.animation = "none";
        void trait.offsetWidth;
        trait.style.animation = "";
      }
      el.setAttribute("data-actif", "");
      // Navigation abandonnée ou en erreur : la barre ne reste pas allumée.
      clearTimeout(filet);
      filet = setTimeout(() => el.removeAttribute("data-actif"), 15_000);
    };

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

      allumer();
    };

    // Safari sur iPad et iPhone n'applique :active, donc le retour au toucher,
    // que si la page écoute les appuis.
    const auToucher = () => {};

    document.addEventListener("click", auClic, true);
    document.addEventListener("touchstart", auToucher, { passive: true });
    window.addEventListener(EVENEMENT, allumer);
    return () => {
      clearTimeout(filet);
      document.removeEventListener("click", auClic, true);
      document.removeEventListener("touchstart", auToucher);
      window.removeEventListener(EVENEMENT, allumer);
    };
  }, []);

  useEffect(() => {
    barre.current?.removeAttribute("data-actif");
  }, [chemin, parametres]);

  return (
    <div
      ref={barre}
      role="presentation"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 opacity-0 transition-opacity data-[actif]:opacity-100"
    >
      <div className="h-full w-full origin-left animate-[progression_2s_ease-out_forwards] rounded-r-full bg-gradient-to-r from-or-500 to-brand-600 shadow-[0_0_8px_rgba(168,96,63,0.6)]" />
    </div>
  );
}
