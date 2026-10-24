"use client";

import Link from "next/link";
import { useEffect } from "react";

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
        <a
          href={`https://wa.me/${numero}?text=${encodeURIComponent(resume)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={bouton}
        >
          Envoyer par WhatsApp
        </a>
      )}
      <Link href={`/caisse/factures/${id}`} className={bouton}>
        Détail de la facture
      </Link>
    </div>
  );
}
