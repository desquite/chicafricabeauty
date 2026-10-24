"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { renvoyerRecu } from "@/app/(app)/caisse/actions";

const bouton =
  "flex h-11 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50";

/** Barre d'outils du reçu, jamais imprimée. */
export function BarreRecu({
  id,
  format,
  imprimerAuto,
  telephone,
  resume,
}: {
  id: string;
  format: "ticket" | "a5";
  imprimerAuto: boolean;
  telephone: string | null;
  resume: string;
}) {
  // Juste après l'encaissement, la fenêtre d'impression s'ouvre seule.
  useEffect(() => {
    if (!imprimerAuto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [imprimerAuto]);

  const [enCours, demarrer] = useTransition();
  const [etatEnvoi, setEtatEnvoi] = useState<string | null>(null);
  const renvoyer = () =>
    demarrer(async () => {
      const r = await renvoyerRecu(id);
      setEtatEnvoi(r.ok ? "Reçu envoyé sur WhatsApp." : (r.erreur ?? "Envoi impossible."));
    });

  const chiffres = telephone?.replace(/\D/g, "") ?? "";
  const numero = chiffres.length === 10 ? `225${chiffres}` : chiffres;

  return (
    <div className="no-print flex flex-wrap justify-center gap-2 print:hidden">
      <Link href="/caisse" className={bouton}>
        ← Caisse
      </Link>
      <button type="button" onClick={() => window.print()} className="flex h-11 items-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white">
        Imprimer
      </button>
      <Link href={`/recu/${id}?format=${format === "ticket" ? "a5" : "ticket"}`} className={bouton}>
        Format {format === "ticket" ? "A5" : "ticket 80 mm"}
      </Link>
      {numero && (
        <button type="button" disabled={enCours} onClick={renvoyer} className={bouton}>
          {enCours ? "Envoi…" : "Renvoyer le reçu (image)"}
        </button>
      )}
      {numero && (
        <a
          href={`https://wa.me/${numero}?text=${encodeURIComponent(resume)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={bouton}
        >
          Écrire depuis mon WhatsApp
        </a>
      )}
      {etatEnvoi && <p className="w-full text-center text-sm text-brand-700">{etatEnvoi}</p>}
      <Link href={`/caisse/factures/${id}`} className={bouton}>
        Détail de la facture
      </Link>
    </div>
  );
}
