"use client";

export function BoutonImprimer() {
  return (
    <button type="button" onClick={() => window.print()} className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white">
      Imprimer
    </button>
  );
}
