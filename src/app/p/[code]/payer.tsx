"use client";

import { useState } from "react";
import { SuiviPaiement, usePaiement } from "@/app/rdv/paiement";
import { payerAbonnement, suivreAbonnement } from "./actions";

/** Payer l'échéance due, ou tout le reste d'un coup. */
export default function PayerAbonnement({
  code,
  echeance,
  reste,
  ussdOrange,
  telephone,
}: {
  code: string;
  echeance: number;
  reste: number;
  ussdOrange: string | null;
  telephone: string;
}) {
  const [mode, setMode] = useState<"echeance" | "tout">("echeance");
  const paiement = usePaiement(telephone, {
    payer: (s) => payerAbonnement({ ...s, mode }),
    suivre: suivreAbonnement,
  });
  const montant = mode === "tout" ? reste : echeance;
  const choixPossible = reste > echeance && !paiement.paiement;

  return (
    <div className="flex flex-col gap-4">
      {choixPossible && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Montant à payer">
          {(
            [
              ["echeance", "L'échéance", echeance],
              ["tout", "Tout régler", reste],
            ] as const
          ).map(([valeur, libelle, m]) => (
            <button
              key={valeur}
              type="button"
              role="radio"
              aria-checked={mode === valeur}
              onClick={() => setMode(valeur)}
              className={`flex flex-col items-center rounded-2xl px-3 py-3 text-sm font-semibold ${
                mode === valeur
                  ? "bg-brand-600 text-white"
                  : "border border-brand-200 bg-white text-brand-700"
              }`}
            >
              {libelle}
              <span className="text-base font-bold">{m.toLocaleString("fr-FR")} F</span>
            </button>
          ))}
        </div>
      )}
      <SuiviPaiement
        code={code}
        montant={montant}
        ussdOrange={ussdOrange}
        p={paiement}
        invitation="Choisis ton opérateur Mobile Money."
        libelle="Abonnement"
        note="pour ton abonnement"
      />
    </div>
  );
}
