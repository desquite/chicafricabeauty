"use client";

import { useState } from "react";
import type { Periode } from "@/lib/caisse";
import type { ChiffrePeriode } from "@/lib/caisse-ca";

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const COMPARAISON: Record<Periode, string> = {
  jour: "le même jour la semaine dernière",
  semaine: "la semaine dernière",
  mois: "le mois dernier",
};

/** Chiffre d'affaires du jour, de la semaine ou du mois, et sa répartition. */
export function ChiffreAffaires({ ca }: { ca: Record<Periode, ChiffrePeriode> }) {
  const [periode, setPeriode] = useState<Periode>("jour");
  const c = ca[periode];
  const part = (n: number) => (c.total ? `${Math.round((n / c.total) * 100)}%` : "0%");

  return (
    <section aria-labelledby="t-ca" className="flex flex-col gap-3 rounded-2xl bg-[#fbf6e9] p-4 ring-1 ring-[#ecd9a8]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="t-ca" className="text-xs font-bold tracking-wider text-[#6e5114] uppercase">
          Chiffre d&apos;affaires
        </h2>
        <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-[#f3e7c9] p-0.5" role="tablist" aria-label="Période">
          {(
            [
              ["jour", "Jour"],
              ["semaine", "Semaine"],
              ["mois", "Mois"],
            ] as const
          ).map(([id, libelle]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={periode === id}
              onClick={() => setPeriode(id)}
              className={`h-8 rounded-md px-2.5 text-xs font-bold ${
                periode === id ? "bg-white text-brand-800 shadow-sm" : "text-[#6e5114]"
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-brand-800">{f(c.total)}</p>
        <p
          className={`text-xs font-bold ${
            c.evolution === null ? "text-brand-500" : c.evolution >= 0 ? "text-[#2f5d3a]" : "text-red-700"
          }`}
        >
          {c.evolution === null
            ? `Pas de comparaison avec ${COMPARAISON[periode]}`
            : `${c.evolution >= 0 ? "+" : ""}${c.evolution} % par rapport à ${COMPARAISON[periode]}`}
        </p>
      </div>
      <dl className="flex flex-col gap-1 text-sm text-brand-800">
        {(
          [
            ["Soins", c.soins, "bg-brand-600"],
            ["Produits", c.produits, "bg-or-500"],
            ["Abonnements", c.abonnements, "bg-brand-300"],
          ] as const
        ).map(([libelle, montant, couleur]) => (
          <div key={libelle} className="flex items-center justify-between">
            <dt className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${couleur}`} aria-hidden="true" />
              {libelle}
            </dt>
            <dd className="font-bold">{f(montant)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#efe3c4]" aria-hidden="true">
        <span className="bg-brand-600" style={{ width: part(c.soins) }} />
        <span className="bg-or-500" style={{ width: part(c.produits) }} />
        <span className="bg-brand-300" style={{ width: part(c.abonnements) }} />
      </div>
      <p className="text-xs text-brand-600">
        {c.factures} facture{c.factures > 1 ? "s" : ""}
        {c.factures > 0 && ` · panier moyen ${f(c.panier)}`}
      </p>
    </section>
  );
}
