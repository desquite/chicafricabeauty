"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Champ,
  ChoixMultiple,
  ChoixUnique,
  DateFr,
  HeureFr,
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
import { Rouet } from "@/components/attente";
import {
  etiquetteRemise,
  ouvreDroit,
  rangSeance,
  REMISE_CHOIX,
  REMISE_POURCENT,
} from "@/lib/fidelite";
import { enregistrerSeance, type SaisieSeance } from "../actions";

const ETAPES = ["Séance", "Diagnostic", "Soin réalisé", "Observations", "Suite"];

/** Rendez-vous d'où part la saisie, quand elle vient de l'agenda. */
export type RdvOrigine = {
  id: string;
  date_rdv: string;
  heure_rdv: string | null;
  /** Déjà filtré par la page : un soin retiré du catalogue n'est pas repris. */
  soin_id: string | null;
};

export default function ParcoursSeance({
  clientes,
  soins,
  clienteInitiale,
  alertesCliente,
  avecSeance,
  seancesParCliente,
  rdvOrigine,
}: {
  clientes: Pick<Cliente, "id" | "nom_complet" | "telephone">[];
  soins: SoinCatalogue[];
  clienteInitiale: string | null;
  alertesCliente: string[];
  /** Clientes ayant déjà au moins une séance enregistrée. */
  avecSeance: string[];
  /** Séances déjà enregistrées par cliente, pour le compteur de fidélité. */
  seancesParCliente: Record<string, number>;
  rdvOrigine: RdvOrigine | null;
}) {
  const dejaVenue = new Set(avecSeance);
  const router = useRouter();
  const [etape, setEtape] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [filtre, setFiltre] = useState("");

  const [s, setS] = useState<SaisieSeance>({
    cliente_id: clienteInitiale ?? "",
    // La séance porte la date du rendez-vous qu'elle honore, pas celle de la
    // saisie : une séance de la veille rattrapée le lendemain reste datée du
    // jour où la cliente est venue.
    date_seance: rdvOrigine?.date_rdv ?? new Date().toISOString().slice(0, 10),
    type_venue:
      clienteInitiale && !dejaVenue.has(clienteInitiale) ? "premiere_seance" : "suivi",
    type_peau: null,
    etat_peau: null,
    observations_peau: [],
    soins: rdvOrigine?.soin_id ? [rdvOrigine.soin_id] : [],
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
    prochain_rdv_heure: "",
    rdv_id: rdvOrigine?.id ?? null,
    remise_fidelite: null,
  });

  // Rang de la séance en cours pour la cliente choisie. Le serveur le
  // recomptera à l'enregistrement : ici, il ne sert qu'à afficher.
  const rang = rangSeance(seancesParCliente[s.cliente_id] ?? 0);
  const remise = s.cliente_id !== "" && ouvreDroit(rang);

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
      // Changer de cliente détache la séance du rendez-vous de départ : il ne
      // serait plus le sien, et passerait en honoré à tort.
      rdv_id: id === clienteInitiale ? (rdvOrigine?.id ?? null) : null,
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
    s.conseils.trim() !== "" && (!remise || s.remise_fidelite !== null),
  ][etape];

  const visibles = clientes.filter((c) =>
    `${c.nom_complet} ${c.telephone}`.toLowerCase().includes(filtre.toLowerCase()),
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

      {/* Signalée elle aussi à chaque étape : la remise se décide au moment de
          payer, et il serait fâcheux de s'en souvenir après le départ de la
          cliente. */}
      {remise && (
        <div className="mb-6 rounded-2xl border-2 border-or-400 bg-or-400/10 p-4">
          <p className="font-semibold text-brand-800">🎁 {etiquetteRemise(rang)}</p>
          <p className="mt-1 text-sm text-brand-700">
            Sur un soin ou sur un produit, au choix de la cliente. À indiquer à
            la dernière étape.
          </p>
        </div>
      )}

      {etape === 0 && (
        <>
          {s.rdv_id && rdvOrigine && (
            <p className="mb-6 rounded-xl bg-or-400/10 px-4 py-3 text-sm text-brand-700">
              Séance du rendez-vous de{" "}
              {rdvOrigine.date_rdv.split("-").reverse().join("/")}
              {rdvOrigine.heure_rdv && ` à ${rdvOrigine.heure_rdv.slice(0, 5)}`}.
              Il passera en « honoré » dès l&apos;enregistrement.
            </p>
          )}

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
                      {c.nom_complet}
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
          {remise && (
            <Champ
              label={`Remise fidélité ${REMISE_POURCENT} % — ${rang}e séance`}
              aide="Ce que la cliente en a fait. Non utilisée, elle est perdue : le compteur repart."
              requis
            >
              <ChoixUnique
                options={REMISE_CHOIX}
                valeur={s.remise_fidelite}
                onChange={(v) => maj("remise_fidelite", v)}
              />
            </Champ>
          )}

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
          <Champ
            label="Prochain rendez-vous"
            aide="Inscrit automatiquement à l'agenda, avec rappel WhatsApp la veille"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <DateFr valeur={s.prochain_rdv} onChange={(v) => maj("prochain_rdv", v)} />
              <HeureFr
                valeur={s.prochain_rdv_heure}
                onChange={(v) => maj("prochain_rdv_heure", v)}
              />
            </div>
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
          className="flex h-touch flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {enCours && <Rouet />}
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
