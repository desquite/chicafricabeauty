"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import { annulerFacture } from "../../actions";

/**
 * Annule une facture encaissée : elle sort du chiffre d'affaires, ses
 * produits reviennent en stock, et le rendez-vous redevient à facturer.
 */
export function AnnulerFacture({ id }: { id: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="flex h-11 items-center rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700"
      >
        Annuler la facture
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <label className="flex flex-col gap-1 text-sm font-semibold text-red-900">
        Motif de l&apos;annulation
        <input value={motif} onChange={(e) => setMotif(e.target.value)} className="h-11 rounded-xl border border-red-200 bg-white px-3 text-base" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOuvert(false)} className="h-11 flex-1 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-800">
          Retour
        </button>
        <button
          type="button"
          disabled={enCours || motif.trim().length < 3}
          onClick={() =>
            demarrer(async () => {
              const r = await annulerFacture(id, motif);
              if (!r.ok) return setErreur(r.erreur ?? "Annulation impossible.");
              router.refresh();
            })
          }
          className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-red-700 text-sm font-bold text-white disabled:opacity-50"
        >
          {enCours && <Rouet />}
          Confirmer l&apos;annulation
        </button>
      </div>
      {erreur && <p className="text-sm text-red-800">{erreur}</p>}
    </div>
  );
}
