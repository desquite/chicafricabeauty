"use client";

import { useState, useTransition } from "react";
import { Rouet } from "@/components/attente";
import { creerLienFiche } from "@/app/fiche/actions";
import { DUREE_LIEN_HEURES } from "@/lib/liens-fiche-duree";

/**
 * Lien à envoyer à une nouvelle cliente, qui remplit sa fiche depuis son
 * téléphone avant de venir.
 *
 * L'envoi reste manuel : la gérante choisit la conversation WhatsApp. Le lien
 * ne peut pas être réaffiché ensuite — la base n'en garde que l'empreinte —
 * d'où l'invitation à l'envoyer tout de suite.
 */
export function BoutonLienFiche() {
  const [ouvert, setOuvert] = useState(false);
  const [lien, setLien] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [enCours, demarrer] = useTransition();

  function generer() {
    setErreur(null);
    setCopie(false);
    demarrer(async () => {
      const r = await creerLienFiche();
      if (r.ok) setLien(r.url);
      else setErreur(r.erreur);
    });
  }

  const message = lien
    ? "Bonjour, voici votre fiche cliente Chic Africa Beauty à remplir avant " +
      `votre venue : ${lien}`
    : "";

  async function copier() {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
    } catch {
      setErreur("Copie impossible : sélectionnez le lien à la main.");
    }
  }

  function fermer() {
    setOuvert(false);
    setLien(null);
    setErreur(null);
    setCopie(false);
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => {
          setOuvert(true);
          generer();
        }}
        className="flex h-touch items-center gap-2 rounded-xl border border-brand-200 bg-white px-5 font-medium text-brand-700 hover:bg-brand-50"
      >
        Lien à envoyer
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-lien-fiche"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={fermer}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titre-lien-fiche" className="text-xl font-semibold text-brand-800">
          Fiche à remplir à distance
        </h2>
        <p className="mt-1 text-sm text-brand-400">
          Valable {DUREE_LIEN_HEURES / 24} jours, pour une seule fiche. Envoyez-le
          maintenant : il ne pourra pas être réaffiché.
        </p>

        <div className="mt-5">
          {enCours && (
            <p className="flex items-center gap-2 text-brand-600">
              <Rouet /> Création du lien…
            </p>
          )}
          {lien && (
            <>
              <input
                readOnly
                value={lien}
                onFocus={(e) => e.currentTarget.select()}
                className="h-touch w-full rounded-xl border border-brand-200 bg-brand-50 px-4 text-sm text-brand-800"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-touch items-center justify-center rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700"
                >
                  Envoyer par WhatsApp
                </a>
                <button
                  type="button"
                  onClick={copier}
                  className="h-touch rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
                >
                  {copie ? "Lien copié" : "Copier le lien"}
                </button>
              </div>
            </>
          )}
          {erreur && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
              {erreur}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-between gap-3">
          <button
            type="button"
            disabled={enCours}
            onClick={generer}
            className="h-11 rounded-lg px-4 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40"
          >
            Nouveau lien
          </button>
          <button
            type="button"
            onClick={fermer}
            className="h-11 rounded-lg border border-brand-200 px-5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
