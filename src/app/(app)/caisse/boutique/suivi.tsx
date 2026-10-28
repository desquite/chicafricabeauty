"use client";

import { useState, useTransition } from "react";
import { suivreCommande } from "./actions";

export function BoutonsSuivi({ id, statut }: { id: string; statut: string }) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  if (statut !== "payee" && statut !== "expediee") return null;

  const agir = (etape: "expediee" | "livree" | "annulee") =>
    demarrer(async () => {
      setErreur(null);
      const r = await suivreCommande(id, etape);
      if (!r.ok) setErreur(r.erreur ?? "Échec");
      setConfirmer(false);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {statut === "payee" && (
          <button type="button" disabled={enCours} onClick={() => agir("expediee")} className="h-12 rounded-xl bg-brand-600 px-5 font-semibold text-white disabled:opacity-50">
            Envoyée par Yango
          </button>
        )}
        <button
          type="button"
          disabled={enCours}
          onClick={() => agir("livree")}
          className={`h-12 rounded-xl px-5 font-semibold disabled:opacity-50 ${statut === "expediee" ? "bg-brand-600 text-white" : "border border-brand-200 text-brand-700"}`}
        >
          Livrée
        </button>
        {confirmer ? (
          <button type="button" disabled={enCours} onClick={() => agir("annulee")} className="h-12 rounded-xl bg-red-700 px-5 font-semibold text-white disabled:opacity-50">
            Confirmer l&apos;annulation
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmer(true)} className="h-12 rounded-xl px-4 text-sm font-semibold text-brand-500 underline">
            Annuler la commande
          </button>
        )}
      </div>
      {confirmer && (
        <p className="text-sm text-brand-600">
          Les produits reviennent en stock. Le remboursement de la cliente se fait à part, depuis le tableau de bord Jèko.
        </p>
      )}
      {erreur && <p role="alert" className="text-sm text-red-800">{erreur}</p>}
    </div>
  );
}
