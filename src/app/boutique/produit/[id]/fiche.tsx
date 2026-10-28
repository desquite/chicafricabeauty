"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProduitBoutique } from "@/lib/boutique";
import { BarrePanier } from "../../barre-panier";
import { EnTete, PhotoProduit, prix, Quantite, titre } from "../../elements";
import { usePanier } from "../../panier-etat";

/**
 * Description saisie en texte simple : paragraphes séparés par une ligne
 * vide, puces en « - ». Une ligne qui finit par « : » devient un intertitre.
 */
function Description({ texte }: { texte: string }) {
  return (
    <div className="flex flex-col gap-3.5 text-[15px] leading-relaxed text-brand-900">
      {texte.split(/\n\s*\n/).map((bloc, i) => {
        const lignes = bloc.split("\n").map((l) => l.trim()).filter(Boolean);
        const puces = lignes.filter((l) => l.startsWith("- "));
        const tete = lignes.filter((l) => !l.startsWith("- "));
        return (
          <div key={i} className="flex flex-col gap-1.5">
            {tete.map((l, j) =>
              l.endsWith(":") && l.length < 45 && puces.length ? (
                <strong key={j} className="text-brand-800">
                  {l.replace(/\s*:$/, "")}
                </strong>
              ) : (
                <p key={j}>{l}</p>
              ),
            )}
            {puces.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {puces.map((l, j) => (
                  <li key={j}>{l.slice(2)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Fiche({
  produit: p,
  suggestions,
  tous,
}: {
  produit: ProduitBoutique;
  suggestions: ProduitBoutique[];
  tous: ProduitBoutique[];
}) {
  const { panier, ajouter } = usePanier();
  const router = useRouter();
  const dejaPris = panier[p.id] ?? 0;
  const reste = Math.max(0, p.disponible - dejaPris);
  const [quantite, setQuantite] = useState(1);
  const [photo, setPhoto] = useState(0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col pb-28">
      <EnTete retour="/boutique" />

      <PhotoProduit src={p.photos[photo]} nom={p.nom} className="aspect-square w-full sm:mx-auto sm:mt-4 sm:max-w-md sm:rounded-2xl" />
      {p.photos.length > 1 && (
        <div className="flex gap-2 px-4 pt-3">
          {p.photos.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Photo ${i + 1}`}
              aria-pressed={photo === i}
              onClick={() => setPhoto(i)}
              className={`h-14 w-14 overflow-hidden rounded-xl ${photo === i ? "ring-2 ring-brand-600" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2.5 px-4 pt-5">
        <span className="text-xs font-extrabold tracking-[0.08em] text-brand-600 uppercase">{p.categorie}</span>
        <h1 className={`${titre} text-[30px] leading-tight`}>{p.nom}</h1>
        {p.accroche && <p className="text-base font-bold text-brand-700">{p.accroche}</p>}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-2xl font-extrabold text-brand-600">{prix(p.prix)}</span>
          <span className={`text-[13px] font-bold ${p.disponible > 0 ? "text-[#2f6b3a]" : "text-brand-700"}`}>
            {p.disponible > 0 ? "En stock" : "Rupture de stock"}
          </span>
        </div>
      </section>

      <section className="px-4 py-5">
        {p.disponible <= 0 ? (
          <p className="rounded-2xl bg-brand-100 px-4 py-3 text-[15px] text-brand-800">
            Ce produit revient bientôt. Écrivez-nous sur WhatsApp pour être prévenue de son retour.
          </p>
        ) : reste <= 0 ? (
          <Link
            href="/boutique/panier"
            className="flex min-h-[52px] items-center justify-center rounded-full bg-brand-600 text-[15px] font-extrabold text-white"
          >
            Tout le stock est dans votre panier · Voir le panier
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Quantite grand valeur={Math.min(quantite, reste)} max={reste} changer={(n) => setQuantite(Math.max(1, n))} />
            <button
              type="button"
              onClick={() => {
                ajouter(p.id, Math.min(quantite, reste));
                router.push("/boutique/panier");
              }}
              className="min-h-[52px] flex-1 rounded-full bg-brand-600 text-[15px] font-extrabold text-white"
            >
              Ajouter au panier
            </button>
          </div>
        )}
      </section>

      {p.description && (
        <section className="mx-4 rounded-2xl bg-white p-5">
          <Description texte={p.description} />
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-3 px-4 pt-6">
          <h2 className={`${titre} text-[22px]`}>Pour compléter la routine</h2>
          <div className="grid grid-cols-2 gap-3">
            {suggestions.map((s) => (
              <Link key={s.id} href={`/boutique/produit/${s.id}`} className="flex flex-col overflow-hidden rounded-2xl bg-white">
                <PhotoProduit src={s.photos[0]} nom="" className="h-32 w-full" />
                <span className="px-3 pt-2.5 text-sm font-bold text-brand-900">{s.nom}</span>
                <span className="px-3 pb-3 text-sm font-extrabold text-brand-600">{prix(s.prix)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <BarrePanier produits={tous} />
    </main>
  );
}
