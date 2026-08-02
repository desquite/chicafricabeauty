"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Champ,
  ChoixMultiple,
  ChoixUnique,
  DateFr,
  Paragraphe,
  Texte,
} from "@/components/champs";
import {
  DELAIS,
  ETAT_PEAU,
  EVOLUTION,
  OBSERVATIONS_PEAU,
  REACTIONS,
  TYPE_PEAU,
  TYPE_VENUE,
  ZONES,
  type Cliente,
  type SoinCatalogue,
} from "@/lib/types";
import { enregistrerSeance, type SaisieSeance } from "../actions";

const ETAPES = ["Séance", "Diagnostic", "Soin réalisé", "Observations", "Suite"];

export default function ParcoursSeance({
  clientes,
  soins,
  clienteInitiale,
  alertesCliente,
  avecSeance,
}: {
  clientes: Pick<Cliente, "id" | "nom" | "prenoms" | "telephone">[];
  soins: SoinCatalogue[];
  clienteInitiale: string | null;
  alertesCliente: string[];
  /** Clientes ayant déjà au moins une séance enregistrée. */
  avecSeance: string[];
}) {
  const dejaVenue = new Set(avecSeance);
  const router = useRouter();
  const [etape, setEtape] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [filtre, setFiltre] = useState("");

  const [s, setS] = useState<SaisieSeance>({
    cliente_id: clienteInitiale ?? "",
    date_seance: new Date().toISOString().slice(0, 10),
    type_venue:
      clienteInitiale && !dejaVenue.has(clienteInitiale) ? "premiere_seance" : "suivi",
    type_peau: null,
    etat_peau: null,
    observations_peau: [],
    soins: [],
    zones: [],
    produits_utilises: "",
    appareil: "",
    duree_min: "",
    reactions: [],
    evolution: null,
    observations: "",
    incident: "",
    programme: "",
    conseils: "",
    produits_conseilles: "",
    delai_recommande: null,
    prochain_rdv: "",
  });

  const maj = <K extends keyof SaisieSeance>(cle: K, v: SaisieSeance[K]) =>
    setS((p) => ({ ...p, [cle]: v }));

  /**
   * Le choix de la cliente détermine le type de venue : une cliente déjà
   * venue ne peut pas faire une première séance, et une nouvelle cliente ne
   * peut pas être en suivi. Le champ est donc dérivé, pas saisi.
   */
  const choisirCliente = (id: string) =>
    setS((p) => ({
      ...p,
      cliente_id: id,
      type_venue: dejaVenue.has(id) ? "suivi" : "premiere_seance",
      evolution: dejaVenue.has(id) ? p.evolution : "premiere_seance",
    }));

  const connue = s.cliente_id !== "" && dejaVenue.has(s.cliente_id);
  const optionsVenue = connue
    ? TYPE_VENUE.filter((o) => o.valeur !== "premiere_seance")
    : TYPE_VENUE;
  const optionsEvolution = connue
    ? EVOLUTION.filter((o) => o.valeur !== "premiere_seance")
    : EVOLUTION;

  const peutAvancer = [
    s.cliente_id !== "" && s.date_seance !== "",
    true,
    s.soins.length > 0 && s.produits_utilises.trim() !== "",
    s.reactions.length > 0 && s.evolution !== null && s.observations.trim() !== "",
    s.conseils.trim() !== "",
  ][etape];

  const visibles = clientes.filter((c) =>
    `${c.prenoms} ${c.nom} ${c.telephone}`.toLowerCase().includes(filtre.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-brand-800">Nouvelle séance</h1>
        <p className="text-sm text-brand-400">
          Étape {etape + 1} sur {ETAPES.length} — {ETAPES[etape]}
        </p>
      </header>

      <div
        className="mb-8 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${ETAPES.length}, 1fr)` }}
      >
        {ETAPES.map((e, i) => (
          <span
            key={e}
            className={`h-1.5 rounded-full ${i <= etape ? "bg-brand-600" : "bg-brand-100"}`}
          />
        ))}
      </div>

      {/* Rappelees a chaque etape : c'est pendant la saisie du soin, pas avant,
          qu'une contre-indication doit revenir sous les yeux. */}
      {alertesCliente.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 p-4">
          <p className="mb-2 font-semibold text-red-800">À vérifier avant tout soin</p>
          <ul className="space-y-1 text-sm text-red-800">
            {alertesCliente.map((a) => (
              <li key={a}>• {a}</li>
            ))}
          </ul>
        </div>
      )}

      {etape === 0 && (
        <>
          {!clienteInitiale && (
            <Champ label="Cliente" requis>
              <div className="mb-3">
                <Texte
                  valeur={filtre}
                  onChange={setFiltre}
                  placeholder="Rechercher par nom ou téléphone"
                />
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {visibles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={s.cliente_id === c.id}
                    onClick={() => choisirCliente(c.id)}
                    className={`flex h-touch w-full items-center justify-between rounded-xl border-2 px-4 text-left ${
                      s.cliente_id === c.id
                        ? "border-brand-600 bg-brand-50"
                        : "border-brand-200 bg-white hover:border-brand-400"
                    }`}
                  >
                    <span className="font-medium text-brand-800">
                      {c.prenoms} {c.nom}
                    </span>
                    <span className="text-sm text-brand-400">{c.telephone}</span>
                  </button>
                ))}
                {visibles.length === 0 && (
                  <p className="py-4 text-center text-brand-400">Aucune cliente trouvée.</p>
                )}
              </div>
            </Champ>
          )}

          <Champ label="Date de la séance" requis>
            <DateFr valeur={s.date_seance} onChange={(v) => maj("date_seance", v)} />
          </Champ>
          <Champ
            label="Type de venue"
            aide={
              connue
                ? "Cette cliente a déjà un historique : la séance est forcément un suivi."
                : undefined
            }
            requis
          >
            <ChoixUnique
              options={optionsVenue}
              valeur={s.type_venue as "premiere_seance" | "suivi"}
              onChange={(v) => maj("type_venue", v)}
            />
          </Champ>
        </>
      )}

      {etape === 1 && (
        <>
          <Champ label="Type de peau" aide="Génétique : ne change pas d'une séance à l'autre">
            <ChoixUnique
              options={TYPE_PEAU}
              valeur={s.type_peau as "normale" | "seche" | "grasse" | "mixte" | null}
              onChange={(v) => maj("type_peau", v)}
            />
          </Champ>
          <Champ label="État de la peau" aide="Passager : c'est lui qui mesure les progrès">
            <ChoixUnique
              options={ETAT_PEAU}
              valeur={s.etat_peau as "deshydratee" | "sensible" | "mature" | "asphyxiee" | null}
              onChange={(v) => maj("etat_peau", v)}
            />
          </Champ>
          <Champ label="Observations visuelles et tactiles">
            <ChoixMultiple
              options={OBSERVATIONS_PEAU}
              valeurs={s.observations_peau as (typeof OBSERVATIONS_PEAU)[number]["valeur"][]}
              onChange={(v) => maj("observations_peau", [...v])}
            />
          </Champ>
        </>
      )}

      {etape === 2 && (
        <>
          <Champ label="Soins réalisés" requis>
            <ChoixMultiple
              options={soins.map((s) => ({ valeur: s.id, libelle: s.libelle }))}
              valeurs={s.soins}
              onChange={(v) => maj("soins", [...v])}
            />
            {soins.length === 0 && (
              <p className="mt-2 text-sm text-brand-400">
                Le catalogue est vide. Ajoutez vos soins depuis la rubrique Catalogue.
              </p>
            )}
          </Champ>
          <Champ label="Zones traitées">
            <ChoixMultiple
              options={ZONES}
              valeurs={s.zones as (typeof ZONES)[number]["valeur"][]}
              onChange={(v) => maj("zones", [...v])}
            />
          </Champ>
          <Champ label="Produits et actifs utilisés" aide="Marque, nom, concentration" requis>
            <Paragraphe
              valeur={s.produits_utilises}
              onChange={(v) => maj("produits_utilises", v)}
            />
          </Champ>
          <Champ label="Appareil utilisé">
            <Texte valeur={s.appareil} onChange={(v) => maj("appareil", v)} />
          </Champ>
          <Champ label="Durée du soin (minutes)">
            <Texte
              type="number"
              valeur={s.duree_min}
              onChange={(v) => maj("duree_min", v)}
              placeholder="60"
            />
          </Champ>
        </>
      )}

      {etape === 3 && (
        <>
          <Champ label="Réaction pendant le soin" requis>
            <ChoixMultiple
              options={REACTIONS}
              valeurs={s.reactions as (typeof REACTIONS)[number]["valeur"][]}
              onChange={(v) => maj("reactions", [...v])}
            />
          </Champ>
          <Champ
            label={
              connue ? "Évolution depuis la séance précédente" : "Évolution"
            }
            requis
          >
            <ChoixUnique
              options={optionsEvolution}
              valeur={s.evolution as (typeof EVOLUTION)[number]["valeur"] | null}
              onChange={(v) => maj("evolution", v)}
            />
          </Champ>
          <Champ label="Observations de la praticienne" requis>
            <Paragraphe
              valeur={s.observations}
              onChange={(v) => maj("observations", v)}
            />
          </Champ>
          <Champ
            label="Incident ou contre-indication constatée"
            aide="Laisser vide s'il n'y a rien à signaler"
          >
            <Paragraphe valeur={s.incident} onChange={(v) => maj("incident", v)} />
          </Champ>
        </>
      )}

      {etape === 4 && (
        <>
          <Champ label="Conseils donnés à la cliente" aide="Routine à domicile, gestes à éviter" requis>
            <Paragraphe valeur={s.conseils} onChange={(v) => maj("conseils", v)} />
          </Champ>
          <Champ label="Programme recommandé">
            <Paragraphe valeur={s.programme} onChange={(v) => maj("programme", v)} />
          </Champ>
          <Champ label="Produits conseillés ou vendus">
            <Paragraphe
              valeur={s.produits_conseilles}
              onChange={(v) => maj("produits_conseilles", v)}
            />
          </Champ>
          <Champ label="Délai avant la prochaine séance">
            <ChoixUnique
              options={DELAIS}
              valeur={s.delai_recommande as (typeof DELAIS)[number]["valeur"] | null}
              onChange={(v) => maj("delai_recommande", v)}
            />
          </Champ>
          <Champ label="Date du prochain rendez-vous">
            <DateFr valeur={s.prochain_rdv} onChange={(v) => maj("prochain_rdv", v)} />
          </Champ>
        </>
      )}

      {erreur && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
          {erreur}
        </p>
      )}

      <div className="sticky bottom-0 mt-8 flex gap-3 border-t border-brand-100 bg-creme py-4">
        <button
          type="button"
          onClick={() => (etape === 0 ? router.back() : setEtape((e) => e - 1))}
          className="h-touch flex-1 rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
        >
          {etape === 0 ? "Annuler" : "Retour"}
        </button>
        <button
          type="button"
          disabled={!peutAvancer || enCours}
          onClick={() => {
            if (etape < ETAPES.length - 1) return setEtape((e) => e + 1);
            demarrer(async () => {
              const r = await enregistrerSeance(s);
              if (!r.ok) return setErreur(r.erreur);
              router.push(`/seances/${r.id}`);
            });
          }}
          className="h-touch flex-[2] rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {enCours
            ? "Enregistrement…"
            : etape === ETAPES.length - 1
              ? "Enregistrer la séance"
              : "Suivant"}
        </button>
      </div>
    </div>
  );
}
