"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

/**
 * Panier de la boutique, gardé dans le navigateur : la cliente peut fermer
 * WhatsApp et revenir plus tard sans rien perdre. Seuls les identifiants et
 * quantités y vivent ; prix et stock sont toujours relus au serveur.
 */
type Panier = Record<string, number>;

const CLE = "cab-panier";
const EVENEMENT = "cab-panier";

type Contexte = {
  panier: Panier;
  /** Faux au premier rendu (serveur) : le panier n'est pas encore lu. */
  pret: boolean;
  nombre: number;
  ajouter: (id: string, quantite?: number) => void;
  fixer: (id: string, quantite: number) => void;
  vider: () => void;
};

const PanierContexte = createContext<Contexte | null>(null);

// Navigation privée : le panier vit le temps de la page, ici.
let secours = "{}";

function lireBrut() {
  try {
    return localStorage.getItem(CLE) ?? "{}";
  } catch {
    return secours;
  }
}

function ecrire(p: Panier) {
  secours = JSON.stringify(p);
  try {
    localStorage.setItem(CLE, secours);
  } catch {
    // reste en mémoire
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

function abonner(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}

function analyser(brut: string): Panier {
  try {
    const p = JSON.parse(brut);
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

export function FournisseurPanier({ children }: { children: React.ReactNode }) {
  const brut = useSyncExternalStore(abonner, lireBrut, () => null);

  const valeur = useMemo<Contexte>(() => {
    const panier = brut === null ? {} : analyser(brut);
    const fixer = (id: string, quantite: number) => {
      const suivant = { ...analyser(lireBrut()) };
      if (quantite > 0) suivant[id] = Math.min(quantite, 50);
      else delete suivant[id];
      ecrire(suivant);
    };
    return {
      panier,
      pret: brut !== null,
      nombre: Object.values(panier).reduce((t, q) => t + q, 0),
      fixer,
      ajouter: (id, quantite = 1) => fixer(id, (analyser(lireBrut())[id] ?? 0) + quantite),
      vider: () => ecrire({}),
    };
  }, [brut]);

  return <PanierContexte.Provider value={valeur}>{children}</PanierContexte.Provider>;
}

export function usePanier() {
  const c = useContext(PanierContexte);
  if (!c) throw new Error("usePanier hors de FournisseurPanier");
  return c;
}
