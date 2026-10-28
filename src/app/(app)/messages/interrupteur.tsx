"use client";

import { useState, useTransition } from "react";
import { changerEnvoiAuto } from "./actions";

/**
 * Envoi automatique de l'assistant : allumé, il répond seul aux clientes ;
 * coupé, il ne fait que des brouillons. Seule la gérante le change.
 */
export function InterrupteurAssistant({ actif, modifiable }: { actif: boolean; modifiable: boolean }) {
  const [enCours, lancer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = () => {
    if (actif && !confirm("Couper l'envoi automatique ? L'assistant ne fera plus que des brouillons.")) return;
    if (!actif && !confirm("Allumer l'envoi automatique ? L'assistant répondra seul aux clientes.")) return;
    setErreur(null);
    lancer(async () => {
      const r = await changerEnvoiAuto(!actif);
      if (!r.ok) setErreur(r.erreur ?? "Réglage non enregistré.");
    });
  };

  return (
    <div className={`mb-3 flex flex-col gap-1 rounded-xl border p-3 ${actif ? "border-[#2f6b3a]/30 bg-[#e3f1e5]" : "border-brand-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">
          <strong className="block text-brand-800">Assistant : {actif ? "envoi automatique" : "brouillons seulement"}</strong>
          <span className="text-xs text-brand-600">{actif ? "Il répond seul aux clientes." : "Rien ne part sans vous."}</span>
        </span>
        {modifiable && (
          <button
            type="button"
            role="switch"
            aria-checked={actif}
            aria-label="Envoi automatique de l'assistant"
            disabled={enCours}
            onClick={basculer}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${actif ? "bg-[#2f6b3a]" : "bg-brand-300"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${actif ? "left-[22px]" : "left-0.5"}`} />
          </button>
        )}
      </div>
      {erreur && <p className="text-xs font-bold text-red-700">{erreur}</p>}
    </div>
  );
}
