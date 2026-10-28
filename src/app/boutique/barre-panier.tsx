"use client";

import Link from "next/link";
import type { ProduitBoutique } from "@/lib/boutique";
import { prix } from "./elements";
import { usePanier } from "./panier-etat";

/** Barre figée en bas de l'écran dès que le panier n'est plus vide. */
export function BarrePanier({ produits }: { produits: ProduitBoutique[] }) {
  const { panier, nombre } = usePanier();
  if (nombre === 0) return null;
  const total = produits.reduce((t, p) => t + p.prix * (panier[p.id] ?? 0), 0);
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-brand-200 bg-creme/95 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
      <Link
        href="/boutique/panier"
        className="mx-auto flex min-h-[52px] max-w-3xl items-center justify-between rounded-full bg-brand-800 px-5 text-[15px] font-extrabold text-white"
      >
        <span>Voir mon panier · {nombre}</span>
        <span>{prix(total)}</span>
      </Link>
    </div>
  );
}
