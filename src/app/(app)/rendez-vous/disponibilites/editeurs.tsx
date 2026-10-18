"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ, ChoixUnique, DateFr, HeureFr, OuiNon, Texte } from "@/components/champs";
import { Rouet } from "@/components/attente";
import { heureLisible, hhmm, JOURS_SEMAINE } from "@/lib/disponibilites";
import type { Fermeture, HoraireJour, ReglagesRdv } from "@/lib/types";
import {
  ajouterFermeture,
  enregistrerHoraires,
  enregistrerReglages,
  supprimerFermeture,
} from "./actions";

const carte = "rounded-2xl border border-brand-100 bg-white p-6";
const boutonPrincipal =
  "flex h-touch items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700 disabled:opacity-40";
const boutonSecondaire =
  "h-touch rounded-xl border border-brand-200 px-5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40";

function Message({ erreur, info }: { erreur: string | null; info: string | null }) {
  if (erreur)
    return (
      <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
        {erreur}
      </p>
    );
  if (info)
    return (
      <p role="status" className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-brand-700">
        {info}
      </p>
    );
  return null;
}

/** "2026-10-20" → "mar. 20 oct." ; lu en UTC, comme Abidjan. */
function dateCourte(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/* ----------------------------------------------------------------- Horaires */

export function Horaires({
  horaires,
  modifiable,
}: {
  horaires: HoraireJour[];
  modifiable: boolean;
}) {
  const router = useRouter();
  const parJour = new Map(horaires.map((h) => [h.jour, h]));
  const [saisie, setSaisie] = useState(() =>
    JOURS_SEMAINE.map(({ jour }) => {
      const h = parJour.get(jour);
      return {
        jour,
        ouvert: h?.ouvert ?? false,
        ouverture: hhmm(h?.ouverture ?? null),
        fermeture: hhmm(h?.fermeture ?? null),
      };
    }),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const maj = (jour: number, champ: "ouvert" | "ouverture" | "fermeture", v: boolean | string) => {
    setInfo(null);
    setSaisie((p) => p.map((h) => (h.jour === jour ? { ...h, [champ]: v } : h)));
  };

  const enregistrer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await enregistrerHoraires(saisie);
      if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
      setInfo("Horaires enregistrés.");
      router.refresh();
    });

  return (
    <section className={carte} aria-labelledby="titre-horaires">
      <h2 id="titre-horaires" className="text-xl font-semibold text-brand-800">
        Horaires de la semaine
      </h2>
      <p className="mt-1 mb-4 text-sm text-brand-400">
        Un soin doit se terminer avant la fermeture pour être proposé.
      </p>

      <ul className="divide-y divide-brand-100">
        {saisie.map((h) => {
          const libelle = JOURS_SEMAINE.find((j) => j.jour === h.jour)!.libelle;
          return (
            <li key={h.jour} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-24 font-medium text-brand-800">{libelle}</span>
              {modifiable ? (
                <button
                  type="button"
                  aria-pressed={h.ouvert}
                  onClick={() => maj(h.jour, "ouvert", !h.ouvert)}
                  className={`h-11 w-28 rounded-lg text-sm font-semibold ${
                    h.ouvert
                      ? "bg-brand-600 text-white"
                      : "border border-brand-200 bg-brand-50 text-brand-500"
                  }`}
                >
                  {h.ouvert ? "Ouvert" : "Fermé"}
                </button>
              ) : null}
              {h.ouvert &&
                (modifiable ? (
                  <div className="flex flex-1 items-center gap-2">
                    <div className="w-32">
                      <HeureFr valeur={h.ouverture} onChange={(v) => maj(h.jour, "ouverture", v)} />
                    </div>
                    <span className="text-brand-400">à</span>
                    <div className="w-32">
                      <HeureFr valeur={h.fermeture} onChange={(v) => maj(h.jour, "fermeture", v)} />
                    </div>
                  </div>
                ) : (
                  <span className="text-brand-700">
                    {heureLisible(h.ouverture)} – {heureLisible(h.fermeture)}
                  </span>
                ))}
              {!h.ouvert && !modifiable && <span className="text-brand-400">Fermé</span>}
            </li>
          );
        })}
      </ul>

      <Message erreur={erreur} info={info} />
      {modifiable && (
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={enCours} onClick={enregistrer} className={boutonPrincipal}>
            {enCours && <Rouet />}
            {enCours ? "Enregistrement…" : "Enregistrer les horaires"}
          </button>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- Fermetures */

const vierge = {
  date_debut: "",
  date_fin: "",
  journee: true,
  heure_debut: "",
  heure_fin: "",
  motif: "",
};

export function Fermetures({
  fermetures,
  modifiable,
  aujourdhui,
}: {
  fermetures: Fermeture[];
  modifiable: boolean;
  aujourdhui: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState(vierge);
  // Le formulaire est remonte a chaque ouverture : les champs de date gardent
  // leur texte en interne et ne se videraient pas sinon.
  const [formulaire, setFormulaire] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const maj = <K extends keyof typeof vierge>(cle: K, v: (typeof vierge)[K]) =>
    setSaisie((p) => ({ ...p, [cle]: v }));

  const ouvrir = () => {
    setSaisie(vierge);
    setFormulaire((n) => n + 1);
    setErreur(null);
    setInfo(null);
    setOuvert(true);
  };

  const ajouter = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await ajouterFermeture(saisie);
      if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
      setOuvert(false);
      setInfo(r.avertissement ?? "Fermeture enregistrée.");
      router.refresh();
    });

  const supprimer = (id: string) =>
    demarrer(async () => {
      setErreur(null);
      const r = await supprimerFermeture(id);
      setAConfirmer(null);
      if (!r.ok) return setErreur(r.erreur ?? "Suppression impossible.");
      router.refresh();
    });

  return (
    <section className={carte} aria-labelledby="titre-fermetures">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titre-fermetures" className="text-xl font-semibold text-brand-800">
            Fermetures et créneaux bloqués
          </h2>
          <p className="mt-1 text-sm text-brand-400">
            Jours fériés, congés, une demi-journée ou une plage d&apos;heures.
          </p>
        </div>
        {modifiable && !ouvert && (
          <button type="button" onClick={ouvrir} className={boutonPrincipal}>
            Ajouter
          </button>
        )}
      </div>

      {ouvert && (
        <div key={formulaire} className="mt-5 rounded-xl bg-brand-50 p-5">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Champ label="Du" requis>
              <DateFr valeur={saisie.date_debut} onChange={(v) => maj("date_debut", v)} />
            </Champ>
            <Champ label="Au" aide="Vide pour un seul jour">
              <DateFr valeur={saisie.date_fin} onChange={(v) => maj("date_fin", v)} />
            </Champ>
          </div>
          <Champ label="Durée">
            <ChoixUnique
              options={[
                { valeur: "journee", libelle: "Toute la journée" },
                { valeur: "plage", libelle: "Une plage d'heures" },
              ]}
              valeur={saisie.journee ? "journee" : "plage"}
              onChange={(v) => maj("journee", v === "journee")}
            />
          </Champ>
          {!saisie.journee && (
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Champ label="De" requis>
                <HeureFr valeur={saisie.heure_debut} onChange={(v) => maj("heure_debut", v)} />
              </Champ>
              <Champ label="À" requis>
                <HeureFr valeur={saisie.heure_fin} onChange={(v) => maj("heure_fin", v)} />
              </Champ>
            </div>
          )}
          <Champ label="Motif" aide="Visible par le personnel seulement">
            <Texte
              valeur={saisie.motif}
              placeholder="Jour férié, congés, formation…"
              onChange={(v) => maj("motif", v)}
            />
          </Champ>
          <div className="flex gap-3">
            <button type="button" onClick={() => setOuvert(false)} className={`flex-1 ${boutonSecondaire}`}>
              Annuler
            </button>
            <button type="button" disabled={enCours} onClick={ajouter} className={`flex-[2] ${boutonPrincipal}`}>
              {enCours && <Rouet />}
              {enCours ? "Enregistrement…" : "Enregistrer la fermeture"}
            </button>
          </div>
        </div>
      )}

      <Message erreur={erreur} info={info} />

      {fermetures.length === 0 ? (
        <p className="mt-5 text-brand-400">Aucune fermeture prévue.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {fermetures.map((f) => {
            const periode =
              f.date_debut === f.date_fin
                ? dateCourte(f.date_debut)
                : `Du ${dateCourte(f.date_debut)} au ${dateCourte(f.date_fin)}`;
            const plage = f.heure_debut
              ? `de ${heureLisible(f.heure_debut)} à ${heureLisible(f.heure_fin)}`
              : "toute la journée";
            const enCoursAujourdhui = f.date_debut <= aujourdhui;
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-100 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-brand-800">
                    {periode} · {plage}
                    {enCoursAujourdhui && (
                      <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                        en cours
                      </span>
                    )}
                  </p>
                  {f.motif && <p className="text-sm text-brand-400">{f.motif}</p>}
                </div>
                {modifiable &&
                  (aConfirmer === f.id ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAConfirmer(null)}
                        className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
                      >
                        Garder
                      </button>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => supprimer(f.id)}
                        className="flex h-11 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                      >
                        {enCours && <Rouet />}
                        Rouvrir
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAConfirmer(f.id)}
                      className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    >
                      Supprimer
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- Réglages */

export function Reglages({
  reglages,
  modifiable,
  paiementPret,
}: {
  reglages: ReglagesRdv;
  modifiable: boolean;
  /** AfribaPay configuré : sans lui, l'acompte ne peut pas être exigé. */
  paiementPret: boolean;
}) {
  const router = useRouter();
  const [saisie, setSaisie] = useState({
    horizon_jours: String(reglages.horizon_jours),
    acompte_montant: String(reglages.acompte_montant),
    acompte_obligatoire: reglages.acompte_obligatoire,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await enregistrerReglages(saisie);
      if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
      setInfo("Réglages enregistrés.");
      router.refresh();
    });

  return (
    <section className={carte} aria-labelledby="titre-reglages">
      <h2 id="titre-reglages" className="mb-4 text-xl font-semibold text-brand-800">
        Réservation en ligne
      </h2>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Champ label="Réservable jusqu'à (jours)" aide="Combien de jours à l'avance une cliente peut réserver">
          {modifiable ? (
            <Texte
              type="number"
              valeur={saisie.horizon_jours}
              onChange={(v) => setSaisie((p) => ({ ...p, horizon_jours: v }))}
            />
          ) : (
            <p className="text-brand-800">{reglages.horizon_jours} jours</p>
          )}
        </Champ>
        <Champ label="Acompte (F CFA)" aide="Déduit du prix le jour du soin">
          {modifiable ? (
            <Texte
              type="number"
              valeur={saisie.acompte_montant}
              onChange={(v) => setSaisie((p) => ({ ...p, acompte_montant: v }))}
            />
          ) : (
            <p className="text-brand-800">{reglages.acompte_montant.toLocaleString("fr-FR")} F CFA</p>
          )}
        </Champ>
      </div>
      <Champ
        label="Acompte obligatoire"
        aide="À régler au plus tard la veille à 18h, sinon le rendez-vous est annulé automatiquement. N'allumez qu'une fois les modèles WhatsApp approuvés par Meta : ce sont eux qui préviennent les clientes. Ne concerne que les rendez-vous pris après l'allumage."
      >
        {modifiable ? (
          <OuiNon
            valeur={saisie.acompte_obligatoire}
            onChange={(v) => setSaisie((p) => ({ ...p, acompte_obligatoire: v }))}
          />
        ) : (
          <p className="text-brand-800">{reglages.acompte_obligatoire ? "Oui" : "Non"}</p>
        )}
      </Champ>
      {modifiable && !paiementPret && (
        <p className="mb-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Le paiement AfribaPay n&apos;est pas encore configuré : l&apos;acompte ne peut pas être
          exigé pour le moment.
        </p>
      )}
      <Message erreur={erreur} info={info} />
      {modifiable && (
        <div className="mt-2 flex justify-end">
          <button type="button" disabled={enCours} onClick={enregistrer} className={boutonPrincipal}>
            {enCours && <Rouet />}
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}
    </section>
  );
}
