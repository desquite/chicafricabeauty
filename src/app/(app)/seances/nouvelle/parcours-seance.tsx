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
  /** Durée prévue au rendez-vous, reprise dans la séance. */
  duree_min: number | null;
  soin: string | null;
  /** Prix du soin le jour du rendez-vous, promotion comprise. */
  prix: number | null;
  /** Acompte déjà réglé en ligne, sinon null. */
  acompte: number | null;
  enLigne: boolean;
};

/** Ce que la gérante a sous les yeux pendant la saisie. */
export type FicheExpress = {
  id: string;
  nom: string;
  telephone: string;
  age: number | null;
  ficheSante: boolean;
  /** Rang de la venue en cours. */
  venue: number;
};

/** Dernière séance de la cliente, reprise d'un geste. */
export type DerniereSeance = {
  date_seance: string;
  type_peau: string | null;
  etat_peau: string | null;
  observations_peau: string[] | null;
  zones: string[] | null;
  produits_utilises: string | null;
  appareil: string | null;
  programme: string | null;
  conseils: string | null;
  produits_conseilles: string | null;
  delai_recommande: string | null;
};

const dateCourte = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

export default function ParcoursSeance({
  clientes,
  soins,
  clienteInitiale,
  alertesCliente,
  avecSeance,
  seancesParCliente,
  soinsAbonnement = {},
  rdvOrigine,
  fiche = null,
  derniere = null,
}: {
  fiche?: FicheExpress | null;
  derniere?: DerniereSeance | null;
  clientes: Pick<Cliente, "id" | "nom_complet" | "telephone">[];
  soins: SoinCatalogue[];
  clienteInitiale: string | null;
  alertesCliente: string[];
  /** Clientes ayant déjà au moins une séance enregistrée. */
  avecSeance: string[];
  /** Séances déjà enregistrées par cliente, pour le compteur de fidélité. */
  seancesParCliente: Record<string, number>;
  /** Soins couverts par un abonnement en cours, par cliente : hors fidélité. */
  soinsAbonnement?: Record<string, string[]>;
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
    duree_min: rdvOrigine?.duree_min ? String(rdvOrigine.duree_min) : "",
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
  const seanceAbonnement = (soinsAbonnement[s.cliente_id] ?? []).some((id) => s.soins.includes(id));
  const remise = s.cliente_id !== "" && !seanceAbonnement && ouvreDroit(rang);

  const maj = <K extends keyof SaisieSeance>(cle: K, v: SaisieSeance[K]) =>
    setS((p) => ({ ...p, [cle]: v }));

  // Reprendre la derniere seance : diagnostic, protocole et conseils. Les
  // reactions, l'evolution et les observations restent a saisir : elles
  // decrivent la seance du jour, pas la precedente.
  const [reprise, setReprise] = useState(false);
  const reprendre = () => {
    if (!derniere) return;
    setS((p) => ({
      ...p,
      type_peau: derniere.type_peau ?? p.type_peau,
      etat_peau: derniere.etat_peau ?? p.etat_peau,
      observations_peau: derniere.observations_peau ?? p.observations_peau,
      zones: derniere.zones ?? p.zones,
      produits_utilises: derniere.produits_utilises ?? p.produits_utilises,
      appareil: derniere.appareil ?? p.appareil,
      programme: derniere.programme ?? p.programme,
      conseils: derniere.conseils ?? p.conseils,
      produits_conseilles: derniere.produits_conseilles ?? p.produits_conseilles,
      delai_recommande: derniere.delai_recommande ?? p.delai_recommande,
    }));
    setReprise(true);
  };
  const boutonReprise = derniere && s.cliente_id === fiche?.id && (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3">
      <span className="text-sm text-brand-700">
        {reprise
          ? `Repris de la séance du ${dateCourte(derniere.date_seance)} : vérifiez et ajustez.`
          : `Dernière séance le ${dateCourte(derniere.date_seance)}.`}
      </span>
      {!reprise && (
        <button
          type="button"
          onClick={reprendre}
          className="h-11 rounded-lg border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100"
        >
          Reprendre cette séance
        </button>
      )}
    </div>
  );

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

  // Panneau de la cliente, a cote de la saisie : qui elle est, sa sante, et
  // ce qu'il restera a encaisser. Seulement quand la cliente est connue.
  const panneau = fiche && s.cliente_id === fiche.id && (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
      <section className="rounded-2xl border border-brand-100 bg-white p-4">
        <p className="text-lg font-semibold text-brand-800">{fiche.nom}</p>
        <p className="text-sm text-brand-500">
          {[fiche.age != null && `${fiche.age} ans`, fiche.telephone].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">
            {fiche.venue === 1 ? "1re venue" : `${fiche.venue}e venue`}
          </span>
          {remise && (
            <span className="rounded-full bg-[#fff1e5] px-2.5 py-0.5 text-xs font-bold text-[#9a4b12]">
              Remise fidélité {REMISE_POURCENT} % ce jour
            </span>
          )}
          {rdvOrigine?.enLigne && (
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">
              réservé en ligne
            </span>
          )}
        </div>
        <a href={`/clientes/${fiche.id}`} className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
          Ouvrir la fiche complète
        </a>
      </section>

      <section className="rounded-2xl border border-brand-100 bg-white p-4">
        <p className="mb-2 text-sm font-bold text-brand-800">Bilan santé</p>
        {!fiche.ficheSante ? (
          <p className="rounded-xl bg-[#e8eefc] px-3 py-2 text-sm font-semibold text-[#2c4a8a]">
            Fiche santé pas encore remplie.{" "}
            <a href={`/fiche/${fiche.id}/sante`} className="underline">
              La remplir
            </a>
          </p>
        ) : alertesCliente.length > 0 ? (
          <ul className="space-y-1">
            {alertesCliente.map((a) => (
              <li key={a} className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-600">Aucune contre-indication déclarée.</p>
        )}
      </section>

      {rdvOrigine?.prix != null && (
        <section className="flex flex-col gap-1.5 rounded-2xl border border-brand-100 bg-white p-4 text-sm">
          <p className="mb-1 font-bold text-brand-800">À l&apos;encaissement</p>
          <p className="flex justify-between">
            <span className="text-brand-600">{rdvOrigine.soin ?? "Soin"}</span>
            <strong>{rdvOrigine.prix.toLocaleString("fr-FR")} F</strong>
          </p>
          {rdvOrigine.acompte != null && (
            <p className="flex justify-between">
              <span className="text-brand-600">Acompte payé en ligne</span>
              <strong className="text-[#2f5d3a]">− {rdvOrigine.acompte.toLocaleString("fr-FR")} F</strong>
            </p>
          )}
          {remise && (
            <p className="flex justify-between">
              <span className="text-brand-600">Remise fidélité {REMISE_POURCENT} %</span>
              <strong className="text-[#9a4b12]">à appliquer</strong>
            </p>
          )}
          <p className="mt-1 flex justify-between border-t border-brand-100 pt-2">
            <span className="font-bold">Reste à régler</span>
            <strong>
              {Math.max(0, rdvOrigine.prix - (rdvOrigine.acompte ?? 0)).toLocaleString("fr-FR")} F
              {remise ? ", avant remise" : ""}
            </strong>
          </p>
        </section>
      )}
    </aside>
  );

  return (
    <div
      className={
        panneau ? "mx-auto grid max-w-6xl gap-6 lg:grid-cols-[300px_minmax(0,1fr)]" : "mx-auto max-w-2xl"
      }
    >
      {panneau}
      <div className="min-w-0">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-brand-800">
          {panneau ? `Séance de ${fiche!.nom}` : "Nouvelle séance"}
        </h1>
        <p className="text-sm text-brand-400">
          {rdvOrigine?.heure_rdv && s.rdv_id
            ? `Rendez-vous de ${Number(rdvOrigine.heure_rdv.slice(0, 2))}h${rdvOrigine.heure_rdv.slice(3, 5)} · `
            : ""}
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
      {/* Le panneau de la cliente les affiche deja sur grand ecran. */}
      {alertesCliente.length > 0 && (
        <div className={`mb-6 rounded-2xl border-2 border-red-200 bg-red-50 p-4 ${panneau ? "lg:hidden" : ""}`}>
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
          {boutonReprise}
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

      <div className="sticky bottom-[calc(var(--spacing-touch)+env(safe-area-inset-bottom))] mt-8 md:bottom-0 flex gap-3 border-t border-brand-100 bg-creme py-4">
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
    </div>
  );
}
