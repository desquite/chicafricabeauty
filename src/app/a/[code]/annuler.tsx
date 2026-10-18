"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import { annulerParCliente } from "./actions";

/** Annulation en deux temps : un appui de travers ne doit rien annuler. */
export default function AnnulerRdv({ code }: { code: string }) {
  const router = useRouter();
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!confirmer) {
    return (
      <button
        type="button"
        onClick={() => setConfirmer(true)}
        className="h-12 w-full rounded-full border border-brand-300 bg-white text-[15px] font-semibold text-brand-700"
      >
        Annuler mon rendez-vous
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl bg-white p-4 text-left">
      <p className="text-sm text-brand-800">
        Tu confirmes l&apos;annulation ? Le créneau sera libéré pour une autre cliente.
      </p>
      {erreur && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          {erreur}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirmer(false)}
          className="h-12 flex-1 rounded-full border border-brand-200 font-semibold text-brand-700"
        >
          Garder
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() =>
            demarrer(async () => {
              const r = await annulerParCliente(code);
              if (!r.ok) return setErreur(r.erreur ?? "Annulation impossible.");
              router.refresh();
            })
          }
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-red-700 font-semibold text-white disabled:opacity-60"
        >
          {enCours && <Rouet />}
          Oui, annuler
        </button>
      </div>
    </div>
  );
}
