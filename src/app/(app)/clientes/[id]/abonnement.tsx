"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import {
  DUREES,
  echeances,
  finAbonnement,
  libelleRythme,
  RYTHMES,
  rythmePermis,
  seancesProposees,
  seanceSuivante,
  type Rythme,
} from "@/lib/abonnements";
import type { AbonnementVue } from "@/lib/abonnements-lecture";
import {
  annulerAbonnement,
  creerAbonnement,
  mettreEnPause,
  renvoyerLien,
  reprendre,
  type Retour,
} from "./abonnement-actions";

const jourMois = (iso: string, annee = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(annee ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
const f = (n: number) => n.toLocaleString("fr-FR");

const bouton =
  "flex h-11 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50";
const boutonPlein =
  "flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50";
const puce = (actif: boolean, interdit = false) =>
  `h-10 rounded-xl px-3 text-sm font-semibold ${
    interdit
      ? "cursor-not-allowed border border-dashed border-brand-200 bg-brand-50 text-brand-300"
      : actif
        ? "bg-brand-600 text-white"
        : "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
  }`;

const ETAT_ECHEANCE = {
  payee: ["payée", "text-[#2f5d3a]"],
  due: ["aujourd'hui", "text-[#9a4b12]"],
  en_retard: ["en retard", "text-red-700"],
  a_venir: ["à venir", "text-brand-500"],
} as const;

/** L'abonnement de la cliente, sur sa fiche : suivi, paiement, création. */
export function SectionAbonnement({
  clienteId,
  abonnements,
  soins,
  gerante,
  aujourdhui,
}: {
  clienteId: string;
  abonnements: AbonnementVue[];
  soins: { id: string; libelle: string }[];
  gerante: boolean;
  aujourdhui: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{ erreur?: string; info?: string } | null>(null);
  const [creation, setCreation] = useState(false);

  const enCoursAbo = abonnements.filter((a) => a.statut === "actif" || a.statut === "pause");
  const passes = abonnements.filter((a) => a.statut === "termine" || a.statut === "annule");

  const agir = (action: () => Promise<Retour>, confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return;
    setMessage(null);
    demarrer(async () => {
      try {
        const r = await action();
        setMessage(r.ok ? (r.info ? { info: r.info } : null) : { erreur: r.erreur });
        if (r.ok) router.refresh();
      } catch (e) {
        setMessage({ erreur: e instanceof Error ? e.message : "Action impossible." });
      }
    });
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-brand-500 uppercase">Abonnement</h2>
        {gerante && !creation && (
          <button type="button" onClick={() => setCreation(true)} className="text-sm font-semibold text-brand-600 hover:underline">
            + Nouvel abonnement
          </button>
        )}
      </div>

      {enCoursAbo.map((a) => {
        const p = a.paiement;
        const pourcentSeances = Math.min(100, Math.round((a.faites / a.nb_seances) * 100));
        return (
          <div key={a.id} className="flex flex-col gap-3 rounded-xl bg-[#fbf6e9] p-3.5 ring-1 ring-[#ecd9a8]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-brand-900">{a.soin}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  a.statut === "pause" ? "bg-[#eee7e2] text-brand-600" : "bg-[#f6ecd2] text-[#6e5114]"
                }`}
              >
                {a.etiquette}
              </span>
            </div>
            <p className="text-sm text-brand-700">
              {jourMois(a.debut)} → {jourMois(a.fin, true)} · {libelleRythme(a.rythme)}
              {a.jours_pause > 0 && ` · fin repoussée de ${a.jours_pause} j`}
            </p>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">
                  Séances : {a.faites} sur {a.nb_seances}
                </span>
                {a.statut === "actif" && a.faites < a.nb_seances && (
                  <span className="text-brand-600">
                    prochaine conseillée : {jourMois(a.derniereSeance ? seanceSuivante(a.derniereSeance, a.rythme) : a.debut)}
                  </span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#efe3c4]" aria-hidden="true">
                <div className="h-full rounded-full bg-[#c89b3c]" style={{ width: `${pourcentSeances}%` }} />
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-[#ecd9a8] pt-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-600">Réglé</span>
                <strong>
                  {f(p.paye)} / {f(a.prix)} F
                </strong>
              </div>
              {p.lignes.map((e) => (
                <div key={e.rang} className="flex justify-between text-[13px]">
                  <span className="text-brand-700">
                    {p.lignes.length > 1 ? `${e.rang}ᵉ · ` : ""}
                    {f(e.montant)} F · {jourMois(e.date)}
                  </span>
                  <span className={`font-semibold ${ETAT_ECHEANCE[e.etat][1]}`}>{ETAT_ECHEANCE[e.etat][0]}</span>
                </div>
              ))}
            </div>

            <p className="rounded-lg bg-[#eef5ef] px-3 py-2 text-[13px] font-semibold text-[#2f5d3a]">
              Pas d&apos;acompte demandé pour ses rendez-vous {a.soin} jusqu&apos;au {jourMois(a.fin, true)}.
            </p>

            {gerante && (
              <div className="flex flex-wrap gap-2">
                {p.reste > 0 && (
                  <button type="button" disabled={enCours} onClick={() => agir(() => renvoyerLien(a.id))} className={bouton}>
                    Renvoyer le lien de paiement
                  </button>
                )}
                {a.statut === "actif" ? (
                  <button type="button" disabled={enCours} onClick={() => agir(() => mettreEnPause(a.id))} className={bouton}>
                    Mettre en pause
                  </button>
                ) : (
                  <button type="button" disabled={enCours} onClick={() => agir(() => reprendre(a.id))} className={bouton}>
                    Reprendre
                  </button>
                )}
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => agir(() => annulerAbonnement(a.id), "Annuler cet abonnement ? Ses rendez-vous redemanderont un acompte.")}
                  className={`${bouton} text-red-700`}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        );
      })}

      {enCoursAbo.length === 0 && !creation && <p className="text-sm text-brand-500">Pas d&apos;abonnement en cours.</p>}

      {creation && (
        <NouvelAbonnement
          clienteId={clienteId}
          soins={soins}
          aujourdhui={aujourdhui}
          enCours={enCours}
          onAnnuler={() => setCreation(false)}
          onCreer={(saisie) =>
            agir(async () => {
              const r = await creerAbonnement(saisie);
              if (r.ok) setCreation(false);
              return r;
            })
          }
        />
      )}

      {message?.erreur && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {message.erreur}
        </p>
      )}
      {message?.info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{message.info}</p>}

      {passes.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-brand-100 pt-2 text-[13px] text-brand-600">
          {passes.map((a) => (
            <li key={a.id}>
              {a.soin} · {jourMois(a.debut, true)} → {jourMois(a.fin, true)} · {a.faites}/{a.nb_seances} séances ·{" "}
              {a.statut === "annule" ? "annulé" : "terminé"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NouvelAbonnement({
  clienteId,
  soins,
  aujourdhui,
  enCours,
  onAnnuler,
  onCreer,
}: {
  clienteId: string;
  soins: { id: string; libelle: string }[];
  aujourdhui: string;
  enCours: boolean;
  onAnnuler: () => void;
  onCreer: (saisie: Parameters<typeof creerAbonnement>[0]) => void;
}) {
  const [soinId, setSoinId] = useState("");
  const [debut, setDebut] = useState(aujourdhui);
  const [duree, setDuree] = useState<number>(6);
  const [rythmeChoisi, setRythme] = useState<Rythme>("2s");
  const [nombre, setNombre] = useState<number | null>(null);
  const [prix, setPrix] = useState("");
  const [versements, setVersements] = useState(3);
  const [notes, setNotes] = useState("");

  const rythme = rythmePermis(duree, rythmeChoisi) ? rythmeChoisi : "2s";
  const propose = seancesProposees(duree, rythme);
  const nb = nombre ?? propose;
  const prixNombre = Number(prix.replace(/\D/g, "")) || 0;
  const apercu =
    prixNombre > 0 ? echeances({ prix: prixNombre, nb_versements: versements, debut, duree_mois: duree }) : [];
  const fin = finAbonnement({ debut, duree_mois: duree, jours_pause: 0 });
  const pret = Boolean(soinId) && prixNombre >= 1000 && nb >= 1;

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-brand-200 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pret) return;
        onCreer({
          cliente_id: clienteId,
          soin_id: soinId,
          debut,
          duree_mois: duree,
          rythme,
          nb_seances: nb,
          prix,
          nb_versements: versements,
          notes,
        });
      }}
    >
      <p className="font-semibold text-brand-900">Nouvel abonnement</p>

      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
        Soin couvert
        <select
          value={soinId}
          onChange={(e) => setSoinId(e.target.value)}
          className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-base"
          required
        >
          <option value="">Choisir…</option>
          {soins.map((s) => (
            <option key={s.id} value={s.id}>
              {s.libelle}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold text-brand-800">Durée</legend>
        <div className="flex gap-2">
          {DUREES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={duree === d}
              onClick={() => {
                setDuree(d);
                setNombre(null);
              }}
              className={puce(duree === d)}
            >
              {d} mois
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-semibold text-brand-800">Rythme des séances</legend>
        <div className="flex flex-wrap gap-2">
          {RYTHMES.map((r) => {
            const interdit = !rythmePermis(duree, r.valeur);
            return (
              <button
                key={r.valeur}
                type="button"
                disabled={interdit}
                aria-pressed={rythme === r.valeur}
                onClick={() => {
                  setRythme(r.valeur);
                  setNombre(null);
                }}
                className={puce(rythme === r.valeur, interdit)}
              >
                {r.libelle}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-brand-500">« Chaque mois » est réservé aux abonnements de 12 mois.</span>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-brand-800">Nombre de séances</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Une séance de moins" onClick={() => setNombre(Math.max(1, nb - 1))} className={`${bouton} w-11 px-0`}>
              −
            </button>
            <span className="min-w-8 text-center text-xl font-bold text-brand-900">{nb}</span>
            <button type="button" aria-label="Une séance de plus" onClick={() => setNombre(Math.min(60, nb + 1))} className={`${bouton} w-11 px-0`}>
              +
            </button>
          </div>
          <span className="text-xs text-brand-500">proposé : {propose}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
          Début
          <input
            type="date"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
            className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-base"
            required
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
          Prix (F CFA)
          <input
            inputMode="numeric"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            placeholder="90 000"
            className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-base"
            required
          />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold text-brand-800">Payé en</legend>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={versements === n} onClick={() => setVersements(n)} className={puce(versements === n)}>
                {n} fois
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
        Notes <span className="font-normal text-brand-500">(facultatif)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-base" />
      </label>

      <p className="rounded-lg bg-brand-50 px-3 py-2 text-[13px] leading-relaxed text-brand-800">
        {nb} séances, {libelleRythme(rythme)}, du {jourMois(debut)} au {jourMois(fin, true)}.
        {apercu.length > 0 && (
          <>
            {" "}
            Paiement : {apercu.map((e) => `${f(e.montant)} F le ${jourMois(e.date)}`).join(", ")}. Le lien part à la
            création.
          </>
        )}
      </p>

      <div className="flex gap-2">
        <button type="button" onClick={onAnnuler} className={`${bouton} flex-1`}>
          Annuler
        </button>
        <button type="submit" disabled={!pret || enCours} className={`${boutonPlein} flex-[2]`}>
          {enCours && <Rouet />}
          Créer l&apos;abonnement
        </button>
      </div>
    </form>
  );
}
