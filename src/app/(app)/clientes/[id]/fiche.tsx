"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import { creerLienFiche } from "@/app/fiche/actions";
import { changerStatut } from "../../rendez-vous/actions";

const international = (tel: string) => {
  const c = tel.replace(/\D/g, "");
  return c.length === 10 ? `225${c}` : c;
};

const bouton =
  "flex h-11 items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60";

/**
 * Tout ce qu'on peut faire pour la cliente, en haut de sa fiche : la joindre,
 * lui fixer un rendez-vous, saisir une séance, lui envoyer sa fiche santé.
 */
export function BandeauActions({
  clienteId,
  prenom,
  telephone,
  sansBilan,
}: {
  clienteId: string;
  prenom: string;
  telephone: string;
  sansBilan: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const numero = international(telephone);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  // Le lien est cree au clic puis ouvert dans WhatsApp, deja adresse a la
  // cliente : la gerante n'a plus qu'a envoyer.
  const envoyerFicheSante = () => {
    setErreur(null);
    // Fenetre ouverte tout de suite : apres un await, le navigateur la
    // bloquerait comme une fenetre surgissante.
    const fenetre = window.open("", "_blank");
    demarrer(async () => {
      const r = await creerLienFiche(clienteId);
      if (!r.ok) {
        fenetre?.close();
        setErreur(r.erreur);
        return;
      }
      const message =
        `Bonjour ${prenom}, voici votre fiche santé Chic Africa Beauty à remplir avant votre prochain soin : ${r.url}`;
      const url = `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
      if (fenetre) fenetre.location.href = url;
      else window.location.href = url;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={`tel:+${numero}`} className={bouton}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
          </svg>
          Appeler
        </a>
        <a
          href={`https://wa.me/${numero}?text=${encodeURIComponent(`Bonjour ${prenom}, c'est l'institut Chic Africa Beauty. `)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={bouton}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.5A9 9 0 1 1 21 12z" />
          </svg>
          WhatsApp
        </a>
        <Link
          href={`/rendez-vous?jour=${aujourdhui}&cliente=${clienteId}`}
          className="flex h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700"
        >
          + Nouveau rendez-vous
        </Link>
        <Link href={`/seances/nouvelle?cliente=${clienteId}`} className={bouton}>
          + Nouvelle séance
        </Link>
        <button type="button" disabled={enCours} onClick={envoyerFicheSante} className={bouton}>
          {enCours && <Rouet />}
          {sansBilan ? "Envoyer la fiche santé" : "Envoyer la fiche santé à mettre à jour"}
        </button>
      </div>
      {erreur && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}

export function ProchainRdv({
  id,
  quand,
  soin,
  date,
  acompte,
  enLigne,
}: {
  id: string;
  quand: string;
  soin: string;
  date: string;
  acompte: number | null;
  enLigne: boolean;
}) {
  const router = useRouter();
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <>
      <p className="text-lg font-bold text-brand-900 first-letter:uppercase">{quand}</p>
      <p className="text-sm text-brand-600">{soin}</p>
      <div className="flex flex-wrap gap-1.5">
        {acompte !== null && (
          <span className="rounded-full bg-[#e5f0e6] px-2.5 py-0.5 text-xs font-bold text-[#2f5d3a]">
            acompte {acompte.toLocaleString("fr-FR")} F payé
          </span>
        )}
        {enLigne && (
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">pris en ligne</span>
        )}
      </div>
      {erreur && <p role="alert" className="text-sm text-red-700">{erreur}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        <Link
          href={`/rendez-vous?jour=${date}`}
          className="flex h-10 items-center rounded-lg border border-brand-200 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          Voir dans l&apos;agenda
        </Link>
        {confirmer ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmer(false)}
              className="h-10 rounded-lg border border-brand-200 px-3 text-sm font-semibold text-brand-700"
            >
              Garder
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                demarrer(async () => {
                  const r = await changerStatut(id, "annule");
                  if (!r.ok) return setErreur(r.erreur ?? "Annulation impossible.");
                  router.refresh();
                })
              }
              className="flex h-10 items-center gap-1.5 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {enCours && <Rouet />}
              Oui, annuler
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmer(true)}
            className="h-10 rounded-lg border border-brand-200 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Annuler
          </button>
        )}
      </div>
    </>
  );
}

export type Evenement = {
  id: string;
  type: "seance" | "rdv" | "absence" | "annulation" | "paiement" | "sante" | "relance";
  /** Date ISO (AAAA-MM-JJ). */
  date: string;
  titre: string;
  detail: string;
  etiquette?: string;
  ton?: "or" | "rouge";
  depli?: { texte: string; lien: string; photos: number };
};

const FILTRES: { id: string; nom: string; types: Evenement["type"][] | null }[] = [
  { id: "tout", nom: "Tout", types: null },
  { id: "seances", nom: "Séances", types: ["seance"] },
  { id: "rdv", nom: "Rendez-vous", types: ["rdv", "absence", "annulation"] },
  { id: "paiements", nom: "Paiements", types: ["paiement"] },
  { id: "sante", nom: "Santé et suivi", types: ["sante", "relance"] },
];

const POINT: Record<Evenement["type"], string> = {
  seance: "bg-brand-600",
  rdv: "bg-or-400",
  absence: "bg-red-600",
  annulation: "bg-brand-300",
  paiement: "bg-[#2f7d4f]",
  sante: "bg-[#2c4a8a]",
  relance: "bg-brand-400",
};

const dateCourte = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

/** Historique unique de la cliente, filtrable, chaque séance dépliable. */
export function Historique({ evenements }: { evenements: Evenement[] }) {
  const [filtre, setFiltre] = useState("tout");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const types = FILTRES.find((f) => f.id === filtre)?.types ?? null;
  const visibles = types ? evenements.filter((e) => types.includes(e.type)) : evenements;

  return (
    <section aria-labelledby="t-historique" className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="t-historique" className="text-xl font-semibold text-brand-800">Historique</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer l'historique">
          {FILTRES.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtre === f.id}
              onClick={() => setFiltre(f.id)}
              className={`h-9 rounded-full px-3 text-sm ${
                filtre === f.id
                  ? "bg-brand-600 font-bold text-white"
                  : "border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
              }`}
            >
              {f.nom}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-4 text-brand-400">Rien à afficher pour le moment.</p>
      ) : (
        <ul>
          {visibles.map((e) => {
            const deplie = ouvert === e.id;
            return (
              <li key={e.id} className="flex gap-3 border-b border-brand-50 py-3 last:border-b-0">
                <span className="w-16 shrink-0 pt-0.5 text-xs text-brand-400">{dateCourte(e.date)}</span>
                <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${POINT[e.type]}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-brand-900">{e.titre}</span>
                    {e.etiquette && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          e.ton === "rouge" ? "bg-red-50 text-red-700" : "bg-or-400/20 text-brand-800"
                        }`}
                      >
                        {e.etiquette}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-brand-600 first-letter:uppercase">{e.detail}</span>
                  {deplie && e.depli && (
                    <span className="mt-2 flex flex-col gap-2 rounded-xl bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
                      <span className="leading-relaxed">{e.depli.texte}</span>
                      {e.depli.photos > 0 && (
                        <span className="text-xs text-brand-600">
                          {e.depli.photos} photo{e.depli.photos > 1 ? "s" : ""} avant / après
                        </span>
                      )}
                      <Link href={e.depli.lien} className="font-semibold text-brand-600 hover:underline">
                        Ouvrir la séance
                      </Link>
                    </span>
                  )}
                </span>
                {e.depli && (
                  <button
                    type="button"
                    aria-expanded={deplie}
                    aria-label={deplie ? "Replier le détail" : "Voir le détail"}
                    onClick={() => setOuvert(deplie ? null : e.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-200 text-brand-600 hover:bg-brand-50"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={deplie ? "rotate-180" : ""}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
