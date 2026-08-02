"use client";

import { useRef, useState, type ReactNode } from "react";

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

/* ------------------------------------------------------------------ dates
 * Un <input type="date"> affiche son format selon la langue du NAVIGATEUR,
 * pas celle de la page : sur un poste en anglais il montre mm/dd/yyyy, et
 * l'attribut lang="fr" n'y change rien (vérifié). Pour une saisie faite par
 * une cliente ivoirienne, c'est une source d'erreur directe : 03/04 se lit
 * 3 avril ou 4 mars selon qui regarde.
 *
 * D'où ces deux champs maîtrisés, au format français quel que soit le poste,
 * doublés du sélecteur natif via showPicker() pour garder le calendrier.
 * ------------------------------------------------------------------------ */

function isoVersFr(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

function frVersIso(chiffres: string): string | null {
  if (chiffres.length !== 8) return null;
  const j = Number(chiffres.slice(0, 2));
  const m = Number(chiffres.slice(2, 4));
  const a = Number(chiffres.slice(4, 8));
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || j < 1) return null;
  // Le passage par Date rejette les dates inexistantes comme le 31/02.
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCDate() !== j || d.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

const styleAvecBouton =
  "h-touch w-full rounded-xl border border-brand-200 bg-white pl-4 pr-14 text-lg " +
  "outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

function BoutonSelecteur({
  cible,
  label,
  children,
}: {
  cible: React.RefObject<HTMLInputElement | null>;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        // showPicker lève une exception si le navigateur ne le gère pas ou si
        // l'appel n'est pas issu d'une action utilisateur.
        try {
          cible.current?.showPicker();
        } catch {
          cible.current?.focus();
        }
      }}
      className="absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-50"
    >
      {children}
    </button>
  );
}

export function DateFr({
  valeur,
  onChange,
  max,
}: {
  /** Date ISO (AAAA-MM-JJ) ou chaîne vide. */
  valeur: string;
  onChange: (iso: string) => void;
  max?: string;
}) {
  const natif = useRef<HTMLInputElement>(null);
  // Affichage initialisé depuis la valeur reçue, puis piloté par la saisie et
  // par le sélecteur natif. Pas de synchronisation continue : réécrire le
  // texte à chaque rendu effacerait une date en cours de frappe dès qu'elle
  // devient momentanément incomplète.
  const [texte, setTexte] = useState(() => isoVersFr(valeur));

  const saisir = (brut: string) => {
    const c = brut.replace(/\D/g, "").slice(0, 8);
    const parties = [c.slice(0, 2), c.slice(2, 4), c.slice(4, 8)].filter(Boolean);
    setTexte(parties.join("/"));
    onChange(frVersIso(c) ?? "");
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={texte}
        placeholder="JJ/MM/AAAA"
        onChange={(e) => saisir(e.target.value)}
        className={styleAvecBouton}
      />
      <input
        ref={natif}
        type="date"
        max={max}
        value={valeur}
        onChange={(e) => {
          setTexte(isoVersFr(e.target.value));
          onChange(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 bottom-0 h-px w-px opacity-0"
      />
      <BoutonSelecteur cible={natif} label="Ouvrir le calendrier">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" strokeLinecap="round" />
        </svg>
      </BoutonSelecteur>
    </div>
  );
}

export function HeureFr({
  valeur,
  onChange,
}: {
  /** Heure sur 24 h (HH:MM) ou chaîne vide. */
  valeur: string;
  onChange: (heure: string) => void;
}) {
  const natif = useRef<HTMLInputElement>(null);
  const [texte, setTexte] = useState(valeur);

  const saisir = (brut: string) => {
    const c = brut.replace(/\D/g, "").slice(0, 4);
    const affiche = c.length > 2 ? `${c.slice(0, 2)}:${c.slice(2)}` : c;
    setTexte(affiche);
    if (c.length !== 4) return onChange("");
    const h = Number(c.slice(0, 2));
    const m = Number(c.slice(2, 4));
    onChange(h < 24 && m < 60 ? `${c.slice(0, 2)}:${c.slice(2, 4)}` : "");
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={texte}
        placeholder="HH:MM"
        onChange={(e) => saisir(e.target.value)}
        className={styleAvecBouton}
      />
      <input
        ref={natif}
        type="time"
        value={valeur}
        onChange={(e) => {
          setTexte(e.target.value);
          onChange(e.target.value);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-4 bottom-0 h-px w-px opacity-0"
      />
      <BoutonSelecteur cible={natif} label="Ouvrir le sélecteur d'heure">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      </BoutonSelecteur>
    </div>
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
