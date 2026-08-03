"use client";

import { useState } from "react";
import { Rouet } from "./attente";

/**
 * Téléchargement d'un classeur Excel.
 *
 * Un simple lien ne donnait aucun signe de vie : le serveur met plusieurs
 * secondes à assembler le fichier, et rien ne l'indiquait. Ici on récupère le
 * fichier en arrière-plan, on affiche l'attente, puis on déclenche
 * l'enregistrement.
 */
export function BoutonExport({
  href,
  libelle = "Export Excel",
}: {
  href: string;
  libelle?: string;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function telecharger() {
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await fetch(href);
      if (!reponse.ok) throw new Error(`Le serveur a répondu ${reponse.status}`);

      const blob = await reponse.blob();
      const entete = reponse.headers.get("content-disposition") ?? "";
      const nom = /filename="([^"]+)"/.exec(entete)?.[1] ?? "export.xlsx";

      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nom;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Téléchargement impossible");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <span className="relative">
      <button
        type="button"
        disabled={enCours}
        onClick={telecharger}
        className="flex h-touch items-center gap-2 rounded-xl border border-brand-200 bg-white px-5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {enCours && <Rouet />}
        {enCours ? "Préparation du fichier…" : libelle}
      </button>
      {erreur && (
        <span
          role="alert"
          className="absolute top-full right-0 mt-1 text-sm whitespace-nowrap text-red-700"
        >
          {erreur}
        </span>
      )}
    </span>
  );
}
