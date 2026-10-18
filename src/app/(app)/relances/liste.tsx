"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import { marquerContactee } from "./actions";

export type Relance = {
  clienteId: string;
  nom: string;
  prenom: string;
  telephone: string;
  jours: number;
  derniereSeance: string;
  delai: string;
  soins: string[];
};

/** Numéro pour WhatsApp et l'appel : chiffres seuls, indicatif ivoirien ajouté à 10 chiffres. */
function international(tel: string) {
  const c = tel.replace(/\D/g, "");
  return c.length === 10 ? `225${c}` : c;
}

function dateCourte(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Message préparé dans WhatsApp : la gérante le relit et l'ajuste avant d'envoyer. */
function message(r: Relance, site: string) {
  return (
    `Bonjour ${r.prenom}, c'est l'institut Chic Africa Beauty. ` +
    "Cela fait un moment que nous ne vous avons pas vue : votre peau mérite son prochain soin ! " +
    "Voulez-vous que nous vous réservions un créneau ? Vous pouvez aussi réserver ici : " +
    `${site}/rdv`
  );
}

export function ListeRelances({ relances, site }: { relances: Relance[]; site: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [enAttente, setEnAttente] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Les clientes marquées restent affichées, barrées, jusqu'au rechargement :
  // un appui de travers s'annule sur place.
  const [contactees, setContactees] = useState<Set<string>>(new Set());

  const basculer = (id: string) => {
    const deja = contactees.has(id);
    setEnAttente(id);
    setErreur(null);
    demarrer(async () => {
      const r = await marquerContactee(id, !deja);
      setEnAttente(null);
      if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
      setContactees((p) => {
        const s = new Set(p);
        if (deja) s.delete(id);
        else s.add(id);
        return s;
      });
    });
  };

  if (relances.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border border-brand-100 bg-white p-6 text-brand-600">
        Personne à relancer pour le moment.
      </p>
    );
  }

  return (
    <>
      <p className="mt-4 mb-4 text-sm font-medium text-brand-600">
        {relances.length} cliente{relances.length > 1 ? "s" : ""} à relancer
      </p>
      {erreur && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
          {erreur}
        </p>
      )}
      <ul className="space-y-3">
        {relances.map((r) => {
          const fait = contactees.has(r.clienteId);
          const numero = international(r.telephone);
          return (
            <li
              key={r.clienteId}
              className={`rounded-2xl border p-5 transition-opacity ${
                fait ? "border-brand-100 bg-brand-50/60 opacity-60" : "border-brand-100 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/clientes/${r.clienteId}`}
                    className={`text-lg font-semibold text-brand-800 hover:underline ${fait ? "line-through" : ""}`}
                  >
                    {r.nom}
                  </Link>
                  <p className="text-sm text-brand-500">{r.telephone}</p>
                  <p className="mt-1 text-sm text-brand-700">
                    Dernière séance le {dateCourte(r.derniereSeance)}, il y a {r.jours} jours
                    {r.delai && ` · délai conseillé : ${r.delai}`}
                  </p>
                  {r.soins.length > 0 && (
                    <p className="text-sm text-brand-400">{r.soins.join(", ")}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                  {r.jours} j
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`tel:+${numero}`}
                  className="flex h-11 items-center rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  Appeler
                </a>
                <a
                  href={`https://wa.me/${numero}?text=${encodeURIComponent(message(r, site))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  WhatsApp
                </a>
                <button
                  type="button"
                  disabled={enCours && enAttente === r.clienteId}
                  onClick={() => basculer(r.clienteId)}
                  className="flex h-11 items-center gap-2 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                >
                  {enCours && enAttente === r.clienteId && <Rouet />}
                  {fait ? "Annuler « contactée »" : "Marquer contactée"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-center text-sm text-brand-400">
        <button type="button" onClick={() => router.refresh()} className="underline">
          Actualiser la liste
        </button>
      </p>
    </>
  );
}
