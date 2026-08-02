"use client";

import type { ReactNode } from "react";

export function Champ({
  label,
  aide,
  requis,
  children,
}: {
  label: string;
  aide?: string;
  requis?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <label className="mb-1 block text-lg font-medium text-brand-800">
        {label}
        {requis && <span className="ml-1 text-red-600">*</span>}
      </label>
      {aide && <p className="mb-2 text-sm text-brand-400">{aide}</p>}
      {children}
    </div>
  );
}

const styleSaisie =
  "h-touch w-full rounded-xl border border-brand-200 bg-white px-4 text-lg " +
  "outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function Texte({
  valeur,
  onChange,
  type = "text",
  placeholder,
  inputMode,
}: {
  valeur: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "tel" | "email";
}) {
  return (
    <input
      type={type}
      value={valeur}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={styleSaisie}
    />
  );
}

export function Paragraphe({
  valeur,
  onChange,
  placeholder,
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={valeur}
      rows={3}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-brand-200 bg-white p-4 text-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
    />
  );
}

/**
 * Oui / Non en deux grands boutons plutot qu'en boutons radio.
 * Sur tablette, une cible de 56px se touche sans viser ; un radio de 20px non.
 */
export function OuiNon({
  valeur,
  onChange,
}: {
  valeur: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { v: true, l: "OUI" },
        { v: false, l: "NON" },
      ].map(({ v, l }) => (
        <button
          key={l}
          type="button"
          aria-pressed={valeur === v}
          onClick={() => onChange(v)}
          className={`h-touch rounded-xl border-2 text-lg font-semibold transition-colors ${
            valeur === v
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-brand-200 bg-white text-brand-700 hover:border-brand-400"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function ChoixUnique<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: readonly { valeur: T; libelle: string }[];
  valeur: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          aria-pressed={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={`h-touch rounded-xl border-2 px-3 text-base font-medium transition-colors ${
            valeur === o.valeur
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-brand-200 bg-white text-brand-700 hover:border-brand-400"
          }`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

export function ChoixMultiple<T extends string>({
  options,
  valeurs,
  onChange,
}: {
  options: readonly { valeur: T; libelle: string }[];
  valeurs: T[];
  onChange: (v: T[]) => void;
}) {
  const basculer = (v: T) =>
    onChange(valeurs.includes(v) ? valeurs.filter((x) => x !== v) : [...valeurs, v]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const actif = valeurs.includes(o.valeur);
        return (
          <button
            key={o.valeur}
            type="button"
            aria-pressed={actif}
            onClick={() => basculer(o.valeur)}
            className={`flex h-touch items-center gap-3 rounded-xl border-2 px-4 text-base font-medium transition-colors ${
              actif
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-brand-200 bg-white text-brand-700 hover:border-brand-400"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                actif ? "border-brand-600 bg-brand-600" : "border-brand-300"
              }`}
              aria-hidden="true"
            >
              {actif && (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}
