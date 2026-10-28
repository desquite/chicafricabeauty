"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProduitBoutique } from "@/lib/boutique";
import { EnTete, PhotoProduit, prix, titre } from "./elements";
import { usePanier } from "./panier-etat";
import { BarrePanier } from "./barre-panier";

type Section = { categorie: string; produits: ProduitBoutique[] };

const ancre = (categorie: string) => categorie.toLowerCase().replace(/[^a-z]+/g, "-");

export default function Catalogue({ sections }: { sections: Section[] }) {
  const { panier, ajouter } = usePanier();
  const [filtre, setFiltre] = useState<string | null>(null);
  const visibles = filtre ? sections.filter((s) => s.categorie === filtre) : sections;
  const tous = sections.flatMap((s) => s.produits);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <EnTete />

      <section className="flex flex-col gap-2.5 px-4 pt-6 pb-2">
        <h1 className={`${titre} text-[32px] leading-tight`}>Les soins de l&apos;institut, chez vous</h1>
        <p className="text-[15px] leading-relaxed text-brand-700">
          Les produits utilisés en cabine, faits à base d&apos;ingrédients naturels. Livrés partout à Abidjan par
          Yango.
        </p>
      </section>

      <nav aria-label="Catégories" className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
        {[null, ...sections.map((s) => s.categorie)].map((c) => (
          <button
            key={c ?? "tout"}
            type="button"
            aria-pressed={filtre === c}
            onClick={() => setFiltre(c)}
            className={`min-h-10 rounded-full px-4 text-sm font-bold ${
              filtre === c ? "bg-brand-800 text-white" : "bg-brand-100 text-brand-800"
            }`}
          >
            {c ?? "Tout"}
          </button>
        ))}
      </nav>

      {visibles.map((s) => (
        <section key={s.categorie} id={ancre(s.categorie)} className="flex flex-col gap-3.5 px-4 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className={`${titre} text-2xl`}>{s.categorie}</h2>
            <span className="text-[13px] font-semibold text-brand-600">
              {s.produits.length} produit{s.produits.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {s.produits.map((p) => {
              const dansPanier = panier[p.id] ?? 0;
              const rupture = p.disponible <= 0;
              return (
                <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(74,35,28,0.08)]">
                  <Link href={`/boutique/produit/${p.id}`} className="relative block">
                    <PhotoProduit src={p.photos[0]} nom={p.nom} className="h-40 w-full sm:h-48" />
                    {rupture && (
                      <span className="absolute top-2 left-2 rounded-full bg-brand-900 px-2.5 py-1 text-[11px] font-extrabold text-white">
                        Rupture
                      </span>
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <Link href={`/boutique/produit/${p.id}`} className="min-h-9 text-sm leading-snug font-bold text-brand-900">
                      {p.nom}
                    </Link>
                    <span className="text-[15px] font-extrabold text-brand-600">{prix(p.prix)}</span>
                    {rupture ? (
                      <span className="mt-auto flex min-h-11 items-center justify-center rounded-full border border-brand-200 text-[13px] font-bold text-brand-700">
                        Bientôt de retour
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={dansPanier >= p.disponible}
                        onClick={() => ajouter(p.id)}
                        className="mt-auto min-h-11 rounded-full bg-brand-600 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {dansPanier > 0 ? `Ajouté · ${dansPanier}` : "Ajouter"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="mt-8 flex flex-col gap-2 bg-brand-100 px-4 pt-6 pb-32 text-[13px] leading-relaxed text-brand-700">
        <strong className="text-sm text-brand-800">Livraison</strong>
        <span>À Abidjan, par Yango. Les frais de course se règlent au livreur à la réception.</span>
        <strong className="mt-2 text-sm text-brand-800">Paiement</strong>
        <span>En ligne avec Wave, Orange Money, MTN, Moov ou Djamo, via Jèko. Pas de paiement à la livraison.</span>
      </footer>

      <BarrePanier produits={tous} />
    </main>
  );
}
