"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Logo } from "@/components/logo";
import { Rouet } from "@/components/attente";
import type { JourCreneaux } from "@/lib/creneaux";
import type { PrestationPublique } from "@/lib/reservation";
import type { EtatAcompte } from "@/lib/acompte";
import { GROUPES } from "@/lib/disponibilites";
import {
  lireCreneaux,
  payerAcompte,
  reserver,
  suivreAcompte,
  type Recapitulatif,
} from "./actions";
import { INSTITUT } from "./institut";
import { fraunces } from "./polices";

/** Les créneaux affichés sont relus toutes les 30 secondes : temps réel. */
const RAFRAICHISSEMENT_MS = 30_000;
/** Pendant un paiement, l'état est relu toutes les 4 secondes, 5 minutes au plus. */
const SUIVI_PAIEMENT_MS = 4_000;
const SUIVI_PAIEMENT_MAX_MS = 5 * 60_000;

export type OffreAcompte = { montant: number; ussdOrange: string | null };

type Paiement =
  | { etat: EtatAcompte; orderId: string; lien: string | null; operateur: string }
  | { etat: "erreur"; erreur: string };

const OPERATEURS = [
  { valeur: "orange", libelle: "Orange" },
  { valeur: "mtn", libelle: "MTN" },
  { valeur: "moov", libelle: "Moov" },
  { valeur: "wave", libelle: "Wave" },
] as const;

const titre = `${fraunces.className} font-medium text-brand-800`;

/* ------------------------------------------------------------ Mise en forme */

const enDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

function dateLongue(iso: string) {
  const s = enDate(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dateCourte(iso: string) {
  return enDate(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function nomMois(mois: string) {
  const s = enDate(`${mois}-01`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "07:30" → "7h30", "10:00" → "10h00", comme sur les maquettes. */
const heure = (t: string) => `${Number(t.slice(0, 2))}h${t.slice(3, 5)}`;

function decalerMois(mois: string, n: number) {
  const d = enDate(`${mois}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/* ------------------------------------------------------------- Composants */

function Progression({ etape, total }: { etape: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Étape ${etape + 1} sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 w-10 rounded-full ${i <= etape ? "bg-brand-600" : "bg-brand-200"}`}
        />
      ))}
    </div>
  );
}

function Retour({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Retour"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}

function Alerte({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-[15px] text-red-800">
      {children}
    </p>
  );
}

function BoutonPrincipal({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-base font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Pied({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-creme via-creme to-creme/0 px-5 pt-6 pb-8">
      {children}
    </div>
  );
}

function IconeLieu() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="mt-0.5 shrink-0">
      <path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/** Opérateur, numéro qui paie et, pour Orange, le code de paiement. */
function ChoixPaiement({
  montant,
  ussdOrange,
  operateur,
  setOperateur,
  telephone,
  setTelephone,
  otp,
  setOtp,
}: {
  montant: number;
  ussdOrange: string | null;
  operateur: string;
  setOperateur: (v: string) => void;
  telephone: string;
  setTelephone: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Opérateur Mobile Money">
        {OPERATEURS.map((o) => (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={operateur === o.valeur}
            onClick={() => setOperateur(o.valeur)}
            className={`h-11 rounded-xl text-[13px] font-bold text-brand-800 ${
              operateur === o.valeur
                ? "border-2 border-brand-600 bg-brand-100"
                : "border border-brand-200 bg-white"
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-brand-800">
        Numéro qui paie
        <input
          type="tel"
          inputMode="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="07 00 00 00 00"
          className="h-12 rounded-xl border border-brand-300 bg-white px-3.5 text-base text-brand-900 focus:border-brand-600 focus:outline-none"
        />
      </label>
      {operateur === "orange" && (
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-brand-800">
          Code de paiement Orange Money
          <span className="font-normal leading-snug text-brand-600">
            {ussdOrange ? (
              <>
                Compose <strong className="font-bold">{ussdOrange}</strong> sur ce numéro pour obtenir ton code,
                puis saisis-le ici.
              </>
            ) : (
              "Génère un code de paiement depuis ton menu Orange Money, puis saisis-le ici."
            )}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="h-12 rounded-xl border border-brand-300 bg-white px-3.5 text-base tracking-widest text-brand-900 focus:border-brand-600 focus:outline-none"
          />
        </label>
      )}
      <p className="text-xs text-brand-500">
        Montant : {montant.toLocaleString("fr-FR")} F CFA, déduits du prix le jour du soin.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- Parcours */

export default function Reservation({
  prestations,
  acompte,
}: {
  prestations: PrestationPublique[];
  acompte: OffreAcompte | null;
}) {
  const totalEtapes = acompte ? 4 : 3;
  const [etape, setEtape] = useState(0);
  const [soin, setSoin] = useState<PrestationPublique | null>(null);
  const [jours, setJours] = useState<JourCreneaux[] | null>(null);
  const [mois, setMois] = useState("");
  const [date, setDate] = useState("");
  const [choixHeure, setChoixHeure] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [site, setSite] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recapitulatif | null>(null);
  const [chargement, setChargement] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [payerMaintenant, setPayerMaintenant] = useState(true);
  const [operateur, setOperateur] = useState("");
  const [telPayeur, setTelPayeur] = useState("");
  const [otp, setOtp] = useState("");
  const [paiement, setPaiement] = useState<Paiement | null>(null);
  const [attenteLongue, setAttenteLongue] = useState(false);

  // Rubriques dans l'ordre du menu ; un soin sans groupe va dans « Autres ».
  const groupes = useMemo(() => {
    const liste = [
      ...GROUPES.map((g) => ({ ...g, soins: prestations.filter((p) => p.groupe === g.id) })),
      {
        id: "autres",
        titre: "Autres prestations",
        anglais: "",
        soins: prestations.filter((p) => !GROUPES.some((g) => g.id === p.groupe)),
      },
    ].filter((g) => g.soins.length > 0);
    return liste.map((g) => {
      const prix = g.soins.map((p) => p.prixValeur).filter((n): n is number => n != null);
      return { ...g, minimum: prix.length ? Math.min(...prix) : null };
    });
  }, [prestations]);
  const [groupeOuvert, setGroupeOuvert] = useState<string | null>(null);
  const [descriptionOuverte, setDescriptionOuverte] = useState<string | null>(null);

  const paiementPret =
    !!operateur &&
    (telPayeur || telephone).replace(/\D/g, "").length >= 10 &&
    (operateur !== "orange" || otp.replace(/\D/g, "").length >= 4);

  const parDate = useMemo(
    () => new Map((jours ?? []).map((j) => [j.date, j.creneaux])),
    [jours],
  );

  /** Nouvelle liste : un créneau choisi qui a disparu est retiré, et dit. */
  const appliquerCreneaux = useCallback(
    (liste: JourCreneaux[]) => {
      setJours(liste);
      if (date && choixHeure) {
        const libres = liste.find((j) => j.date === date)?.creneaux ?? [];
        if (!libres.includes(choixHeure)) {
          setErreur(`Le créneau de ${heure(choixHeure)} vient d'être réservé. Choisis-en un autre.`);
          setChoixHeure("");
        }
      }
    },
    [date, choixHeure],
  );

  async function choisirSoin(p: PrestationPublique) {
    setSoin(p);
    setErreur(null);
    setDate("");
    setChoixHeure("");
    setJours(null);
    setEtape(1);
    setChargement(true);
    const liste = await lireCreneaux(p.id);
    setChargement(false);
    if (!liste) {
      setErreur("Cette prestation n'est plus proposée en ligne.");
      return;
    }
    setJours(liste);
    const premier = liste.find((j) => j.creneaux.length > 0);
    setMois((premier ?? liste[0]).date.slice(0, 7));
    if (premier) setDate(premier.date);
  }

  useEffect(() => {
    if (etape !== 1 || !soin) return;
    const minuteur = setInterval(async () => {
      const liste = await lireCreneaux(soin.id);
      if (liste) appliquerCreneaux(liste);
    }, RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuteur);
  }, [etape, soin, appliquerCreneaux]);

  /** Le rendez-vous existe déjà : un paiement qui échoue ne le remet pas en cause. */
  async function lancerPaiement(rdvId: string) {
    setAttenteLongue(false);
    const p = await payerAcompte({ rdvId, operateur, telephone: telPayeur || telephone, otp });
    setPaiement(
      p.ok
        ? { etat: p.etat, orderId: p.orderId, lien: p.lien, operateur }
        : { etat: "erreur", erreur: p.erreur },
    );
  }

  function valider() {
    if (!soin) return;
    setErreur(null);
    demarrer(async () => {
      const r = await reserver({
        soinId: soin.id,
        date,
        heure: choixHeure,
        nom,
        telephone,
        email,
        site,
      });
      if (r.ok) {
        setRecap(r.recap);
        if (acompte && payerMaintenant) await lancerPaiement(r.recap.rdvId);
        setEtape(4);
        window.scrollTo({ top: 0 });
        return;
      }
      setErreur(r.erreur);
      if (r.creneaux) {
        setJours(r.creneaux);
        setChoixHeure("");
        setEtape(1);
      }
    });
  }

  const enAttente = paiement?.etat === "en_attente" ? paiement.orderId : null;
  useEffect(() => {
    if (!enAttente) return;
    const debut = Date.now();
    const minuteur = setInterval(async () => {
      if (Date.now() - debut > SUIVI_PAIEMENT_MAX_MS) {
        clearInterval(minuteur);
        setAttenteLongue(true);
        return;
      }
      const etat = await suivreAcompte(enAttente);
      if (etat && etat !== "en_attente") {
        clearInterval(minuteur);
        setPaiement((p) => (p && p.etat !== "erreur" ? { ...p, etat } : p));
      }
    }, SUIVI_PAIEMENT_MS);
    return () => clearInterval(minuteur);
  }, [enAttente]);

  /* ---------------------------------------------- 1. Choix de la prestation */
  if (etape === 0) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="h-28 bg-gradient-to-b from-brand-200 to-brand-100" aria-hidden="true" />
        <div className="-mt-10 flex flex-col items-center gap-2 px-6 text-center">
          <Logo className="h-[72px] w-[72px] rounded-full ring-4 ring-creme" />
          <h1 className={`${titre} mt-1 text-[28px]`}>{INSTITUT.nom}</h1>
          <p className="text-[15px] text-brand-700">Bienvenue ma Chic ! Réserve ton moment.</p>
          <p className="flex items-start gap-1.5 text-[13px] leading-snug text-brand-600/90">
            <IconeLieu />
            Angré nouveau CHU, ruelle de la pharmacie Kabod
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <Progression etape={0} total={totalEtapes} />
        </div>

        <section className="flex flex-col gap-3 px-5 pt-5 pb-10" aria-labelledby="titre-prestation">
          <h2 id="titre-prestation" className={`${titre} mx-1 mb-1 text-[22px]`}>
            Quelle prestation ?
          </h2>
          {prestations.length === 0 && (
            <p className="mx-1 text-brand-600">
              Aucune prestation n&apos;est proposée en ligne pour le moment. Appelle-nous au{" "}
              <a href={INSTITUT.telephoneLien} className="font-semibold underline">
                {INSTITUT.telephone}
              </a>
              .
            </p>
          )}
          {prestations.length > 0 && (
            <p className="mx-1 -mt-2 mb-1 text-sm text-brand-600">
              Touche une catégorie pour voir ses soins.
            </p>
          )}
          {groupes.map((g) => {
            const ouvert = groupeOuvert === g.id;
            const enPromo = g.soins.some((p) => p.prixBarre);
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(74,35,28,0.06),0_4px_14px_rgba(74,35,28,0.05)]"
              >
                <button
                  type="button"
                  aria-expanded={ouvert}
                  aria-controls={`groupe-${g.id}`}
                  onClick={() => setGroupeOuvert(ouvert ? null : g.id)}
                  className="flex min-h-[76px] w-full items-center gap-3.5 px-[18px] py-4 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`${titre} text-xl`}>{g.titre}</span>
                      {g.anglais && (
                        <span className="text-[11px] font-bold tracking-wider text-brand-500 uppercase">
                          {g.anglais}
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] text-brand-500">
                      {g.soins.length} soin{g.soins.length > 1 ? "s" : ""}
                      {g.minimum != null && ` · dès ${g.minimum.toLocaleString("fr-FR")} F`}
                      {enPromo && " · offre en cours"}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ${
                      ouvert ? "rotate-180 bg-brand-600 text-white" : "bg-brand-100 text-brand-600"
                    }`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {ouvert && (
                  <ul id={`groupe-${g.id}`} className="border-t border-brand-100">
                    {g.soins.map((p) => {
                      const descOuverte = descriptionOuverte === p.id;
                      return (
                        <li key={p.id} className="border-b border-brand-50 px-[18px] py-3.5 last:border-b-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 flex-col gap-1">
                              <span className="text-[15px] leading-snug font-semibold text-brand-900">
                                {p.nom}
                              </span>
                              <span className="text-[13px] text-brand-500">
                                {p.duree} ·{" "}
                                {p.prixBarre && (
                                  <span className="mr-1 text-brand-400 line-through">{p.prixBarre}</span>
                                )}
                                <strong className={p.prixBarre ? "text-brand-500" : "text-brand-800"}>
                                  {p.prix}
                                </strong>
                              </span>
                              {p.promoJusquau && (
                                <span className="self-start rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                                  Offre jusqu&apos;au{" "}
                                  {enDate(p.promoJusquau).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "short",
                                    timeZone: "UTC",
                                  })}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => void choisirSoin(p)}
                              aria-label={`Choisir ${p.nom}`}
                              className="h-10 shrink-0 rounded-full bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700"
                            >
                              Choisir
                            </button>
                          </div>
                          {p.description && (
                            <>
                              <button
                                type="button"
                                aria-expanded={descOuverte}
                                onClick={() => setDescriptionOuverte(descOuverte ? null : p.id)}
                                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 text-[13px] font-semibold text-brand-500"
                              >
                                {descOuverte ? "Moins" : "En savoir plus"}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={descOuverte ? "rotate-180" : ""}>
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </button>
                              {descOuverte && (
                                <p className="mt-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-sm leading-relaxed text-brand-700">
                                  {p.description}
                                </p>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      </main>
    );
  }

  /* ------------------------------------------------------ 4. Confirmation */
  if (etape === 4 && recap) {
    const formulaireAcompte = acompte && (
      <div className="flex flex-col gap-3.5">
        <ChoixPaiement
          montant={acompte.montant}
          ussdOrange={acompte.ussdOrange}
          operateur={operateur}
          setOperateur={setOperateur}
          telephone={telPayeur || telephone}
          setTelephone={setTelPayeur}
          otp={otp}
          setOtp={setOtp}
        />
        <BoutonPrincipal
          disabled={enCours || !paiementPret}
          onClick={() => demarrer(() => lancerPaiement(recap.rdvId))}
        >
          {enCours && <Rouet />}
          {enCours ? "Envoi…" : `Payer ${acompte.montant.toLocaleString("fr-FR")} F`}
        </BoutonPrincipal>
      </div>
    );

    let panneauAcompte: React.ReactNode = null;
    if (acompte) {
      if (paiement?.etat === "reussi") {
        panneauAcompte = (
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="text-brand-500">Acompte</span>
            <span className="rounded-full bg-[#e5f0e6] px-2.5 py-1 text-[13px] font-semibold text-[#2f5d3a]">
              {acompte.montant.toLocaleString("fr-FR")} F payés
            </span>
          </p>
        );
      } else if (paiement?.etat === "en_attente") {
        panneauAcompte = (
          <div className="flex flex-col gap-3 text-sm" role="status">
            <p className="flex items-center gap-2 font-semibold text-brand-800">
              <Rouet /> Paiement de l&apos;acompte en cours…
            </p>
            {paiement.lien ? (
              <a
                href={paiement.lien}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center rounded-full bg-[#1dc8ff] font-bold text-[#06283d]"
              >
                Payer avec Wave
              </a>
            ) : paiement.operateur === "orange" ? (
              <p className="text-brand-600">Orange Money valide ton code, un instant.</p>
            ) : (
              <p className="text-brand-600">
                Une demande de paiement arrive sur ton téléphone : valide-la avec ton code secret.
              </p>
            )}
            {attenteLongue && (
              <p className="text-brand-600">
                La confirmation tarde. Si tu as payé, elle arrivera d&apos;elle-même ; sinon, tu
                régleras l&apos;acompte à l&apos;institut. Ton rendez-vous est bien réservé.
              </p>
            )}
          </div>
        );
      } else {
        panneauAcompte = (
          <div className="flex flex-col gap-3 text-sm">
            {paiement ? (
              <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-red-800">
                {paiement.etat === "erreur"
                  ? paiement.erreur
                  : "Le paiement n'a pas abouti."}{" "}
                Ton rendez-vous reste réservé.
              </p>
            ) : (
              <p className="text-brand-600">
                Acompte non réglé : tu peux le payer maintenant, ou à l&apos;institut.
              </p>
            )}
            {formulaireAcompte}
          </div>
        );
      }
    }

    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-[18px] px-5 pt-14 pb-8">
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-brand-600 text-white">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className={`${titre} mt-1 text-[30px]`}>C&apos;est réservé !</h1>
        <p className="text-center text-[15px] leading-relaxed text-brand-700">
          À très vite{nom.trim() ? `, ${nom.trim().split(" ")[0]}` : ""}. Garde bien ce récapitulatif.
        </p>

        <dl className="flex w-full flex-col gap-3.5 rounded-[20px] bg-white p-5 text-sm shadow-[0_4px_14px_rgba(74,35,28,0.06)]">
          {[
            ["Prestation", recap.prestation],
            ["Date", dateLongue(recap.date)],
            ["Heure", `${heure(recap.debut)} – ${heure(recap.fin)}`],
          ].map(([cle, valeur]) => (
            <div key={cle} className="flex justify-between gap-3">
              <dt className="text-brand-500">{cle}</dt>
              <dd className="text-right font-semibold">{valeur}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-brand-100 pt-3.5">
            <dt className="text-brand-500">Prix</dt>
            <dd className="font-bold text-brand-500">{recap.prix}</dd>
          </div>
          {panneauAcompte && <div className="border-t border-brand-100 pt-3.5">{panneauAcompte}</div>}
        </dl>

        <p className="flex items-start gap-1.5 text-center text-[13px] leading-snug text-brand-600">
          <IconeLieu />
          {INSTITUT.adresse}
        </p>

        <div className="mt-auto flex w-full flex-col gap-2.5">
          <a
            href={INSTITUT.itineraire}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[54px] items-center justify-center rounded-full bg-brand-600 text-[15px] font-bold text-white"
          >
            Voir l&apos;itinéraire
          </a>
          <p className="mt-2 text-center text-[13px] text-brand-600">
            Un empêchement ? Appelle-nous au{" "}
            <a href={INSTITUT.telephoneLien} className="font-semibold underline">
              {INSTITUT.telephone}
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  /* ------------------------------------------------ En-tête des étapes 2-3 */
  const entete = (
    <>
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <Retour
          onClick={() => {
            setErreur(null);
            setEtape((e) => e - 1);
          }}
        />
        <Progression etape={etape} total={totalEtapes} />
      </div>
      {soin && (
        <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-100 px-[18px] py-3.5">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">{soin.nom}</span>
            <span className="text-[13px] text-brand-600">
              {etape >= 2 && date && choixHeure
                ? `${dateCourte(date)} · ${heure(choixHeure)}`
                : soin.duree}
            </span>
          </span>
          <span className={`shrink-0 text-sm font-bold ${soin.prixBarre ? "text-brand-500" : "text-brand-800"}`}>
            {soin.prix}
          </span>
        </div>
      )}
    </>
  );

  /* -------------------------------------------------- 2. Jour et heure */
  if (etape === 1) {
    const premierMois = jours?.[0]?.date.slice(0, 7) ?? mois;
    const dernierMois = jours?.at(-1)?.date.slice(0, 7) ?? mois;
    const premierJour = enDate(`${mois}-01`);
    const decalage = (premierJour.getUTCDay() + 6) % 7;
    const nbJours = new Date(Date.UTC(premierJour.getUTCFullYear(), premierJour.getUTCMonth() + 1, 0)).getUTCDate();
    const cases = [
      ...Array.from({ length: decalage }, () => null),
      ...Array.from({ length: nbJours }, (_, i) => `${mois}-${String(i + 1).padStart(2, "0")}`),
    ];
    const libres = date ? (parDate.get(date) ?? []) : [];
    const matin = libres.filter((h) => h < "12:00");
    const apresMidi = libres.filter((h) => h >= "12:00");

    const boutonHeure = (h: string) => (
      <button
        key={h}
        type="button"
        aria-pressed={choixHeure === h}
        onClick={() => {
          setErreur(null);
          setChoixHeure(h);
        }}
        className={`h-12 rounded-full text-[15px] font-semibold transition-colors ${
          choixHeure === h
            ? "bg-brand-600 text-white"
            : "border border-brand-200 bg-white text-brand-800 hover:border-brand-400"
        }`}
      >
        {heure(h)}
      </button>
    );

    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {entete}
        <div className="flex flex-col gap-4 px-5 pt-6">
          {erreur && <Alerte>{erreur}</Alerte>}
          <h2 className={`${titre} mx-1 text-[22px]`}>Quel jour ?</h2>

          {chargement || !jours ? (
            <p className="flex items-center gap-2 px-1 text-brand-600">
              <Rouet /> Recherche des créneaux libres…
            </p>
          ) : (
            <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_14px_rgba(74,35,28,0.05)]">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[15px] font-semibold">{nomMois(mois)}</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label="Mois précédent"
                    disabled={mois <= premierMois}
                    onClick={() => setMois((m) => decalerMois(m, -1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-brand-600 enabled:bg-brand-100 disabled:text-brand-300"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Mois suivant"
                    disabled={mois >= dernierMois}
                    onClick={() => setMois((m) => decalerMois(m, 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-brand-600 enabled:bg-brand-100 disabled:text-brand-300"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => (
                  <span key={i} className="pb-1 text-xs font-semibold text-brand-500" aria-hidden="true">
                    {j}
                  </span>
                ))}
                {cases.map((iso, i) => {
                  if (!iso) return <span key={`vide-${i}`} />;
                  const creneaux = parDate.get(iso);
                  const n = Number(iso.slice(8));
                  if (!creneaux) {
                    return (
                      <span key={iso} className="flex h-11 items-center justify-center text-[15px] text-brand-200">
                        {n}
                      </span>
                    );
                  }
                  if (creneaux.length === 0) {
                    return (
                      <span
                        key={iso}
                        className="flex h-11 items-center justify-center text-[15px] text-brand-300 line-through"
                        aria-label={`${dateLongue(iso)} : complet ou fermé`}
                      >
                        {n}
                      </span>
                    );
                  }
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={date === iso}
                      aria-label={dateLongue(iso)}
                      onClick={() => {
                        setErreur(null);
                        setDate(iso);
                        setChoixHeure("");
                      }}
                      className={`h-11 rounded-xl text-[15px] font-semibold transition-colors ${
                        date === iso
                          ? "bg-brand-600 text-white"
                          : "border border-brand-200 bg-white text-brand-900 hover:border-brand-400"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-brand-500">
                Fermé le lundi. Les jours barrés sont complets ou fermés.
              </p>
            </div>
          )}

          {date && jours && (
            <>
              <h2 className={`${titre} mx-1 mt-2 text-[22px]`}>À quelle heure ?</h2>
              <p className="mx-1 -mt-2 text-sm text-brand-600">{dateLongue(date)} — créneaux libres</p>
              {matin.length > 0 && (
                <>
                  <span className="mx-1 text-[13px] font-semibold text-brand-500">Matin</span>
                  <div className="grid grid-cols-4 gap-2">{matin.map(boutonHeure)}</div>
                </>
              )}
              {apresMidi.length > 0 && (
                <>
                  <span className="mx-1 mt-1 text-[13px] font-semibold text-brand-500">Après-midi</span>
                  <div className="grid grid-cols-4 gap-2">{apresMidi.map(boutonHeure)}</div>
                </>
              )}
            </>
          )}
        </div>

        <Pied>
          <BoutonPrincipal
            disabled={!date || !choixHeure}
            onClick={() => {
              setErreur(null);
              setEtape(2);
              window.scrollTo({ top: 0 });
            }}
          >
            {date && choixHeure
              ? `${dateCourte(date)} à ${heure(choixHeure)} — Continuer`
              : "Choisis un jour et une heure"}
          </BoutonPrincipal>
        </Pied>
      </main>
    );
  }

  /* ------------------------------------------------------------ 4. Acompte */
  if (etape === 3 && acompte) {
    const montant = `${acompte.montant.toLocaleString("fr-FR")} F CFA`;
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {entete}
        <div className="flex flex-col gap-3.5 px-5 pt-5">
          <h2 className={`${titre} mx-1 text-2xl leading-tight`}>
            Veux-tu régler l&apos;acompte maintenant ?
          </h2>
          <p className="mx-1 text-sm leading-relaxed text-brand-600">
            {montant}, déduits du prix le jour du soin. C&apos;est facultatif : ton rendez-vous est
            réservé dans les deux cas.
          </p>

          <div
            className={`flex flex-col gap-3.5 rounded-[18px] bg-white p-[18px] ${
              payerMaintenant ? "border-2 border-brand-600" : "border border-brand-200"
            }`}
          >
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="acompte"
                checked={payerMaintenant}
                onChange={() => setPayerMaintenant(true)}
                className="mt-0.5 h-[22px] w-[22px] accent-brand-600"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold">Payer l&apos;acompte maintenant</span>
                <span className="text-[13px] text-brand-600">Par Mobile Money, en quelques secondes</span>
              </span>
            </label>
            {payerMaintenant && (
              <ChoixPaiement
                montant={acompte.montant}
                ussdOrange={acompte.ussdOrange}
                operateur={operateur}
                setOperateur={setOperateur}
                telephone={telPayeur || telephone}
                setTelephone={setTelPayeur}
                otp={otp}
                setOtp={setOtp}
              />
            )}
          </div>

          <label
            className={`flex items-start gap-3 rounded-[18px] bg-white p-[18px] ${
              !payerMaintenant ? "border-2 border-brand-600" : "border border-brand-200"
            }`}
          >
            <input
              type="radio"
              name="acompte"
              checked={!payerMaintenant}
              onChange={() => setPayerMaintenant(false)}
              className="mt-0.5 h-[22px] w-[22px] accent-brand-600"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">Réserver sans payer maintenant</span>
              <span className="text-[13px] leading-snug text-brand-600">
                Tu pourras régler l&apos;acompte à l&apos;institut.
              </span>
            </span>
          </label>

          <details className="px-1 text-[13px] leading-relaxed text-brand-600">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-700">
              Conditions de l&apos;acompte
            </summary>
            L&apos;acompte n&apos;est pas remboursable. Il est retenu en cas de retard de plus de 30
            minutes, d&apos;annulation moins de 24 h avant le rendez-vous, ou d&apos;absence non
            justifiée.
          </details>

          {erreur && <Alerte>{erreur}</Alerte>}
        </div>

        <Pied>
          <BoutonPrincipal
            disabled={enCours || (payerMaintenant && !paiementPret)}
            onClick={valider}
          >
            {enCours && <Rouet />}
            {enCours
              ? "Réservation…"
              : payerMaintenant
                ? `Payer ${acompte.montant.toLocaleString("fr-FR")} F et confirmer`
                : "Confirmer le rendez-vous"}
          </BoutonPrincipal>
        </Pied>
      </main>
    );
  }

  /* ------------------------------------------------------- 3. Coordonnées */
  const champ =
    "h-[52px] w-full rounded-[14px] border border-brand-300 bg-white px-4 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none";
  const coordonneesPretes = nom.trim().length >= 2 && telephone.replace(/\D/g, "").length >= 10;
  const suite = () => {
    if (!acompte) return valider();
    setErreur(null);
    setEtape(3);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {entete}
      <form
        className="flex flex-col gap-[18px] px-5 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (coordonneesPretes) suite();
        }}
      >
        <h2 className={`${titre} mx-1 text-[22px]`}>Tes coordonnées</h2>
        <p className="mx-1 -mt-2.5 text-sm leading-relaxed text-brand-600">
          Déjà cliente ? Ton numéro suffit, on te reconnaît.
        </p>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-800">
          Nom et prénoms
          <input
            className={champ}
            autoComplete="name"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-800">
          Numéro WhatsApp
          <span className="flex gap-2">
            <span className="flex h-[52px] items-center rounded-[14px] border border-brand-300 bg-brand-50 px-3.5 text-base font-semibold">
              +225
            </span>
            <input
              className={`${champ} min-w-0 flex-1`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="07 00 00 00 00"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              required
            />
          </span>
          <span className="text-[13px] font-normal text-brand-600">
            C&apos;est ici que l&apos;institut te contactera.
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-800">
          E-mail <span className="font-normal text-brand-500">(facultatif)</span>
          <input
            className={champ}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="toi@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {/* Invisible pour une personne, rempli par les robots. */}
        <input
          type="text"
          name="site"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px opacity-0"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        />

        {erreur && <Alerte>{erreur}</Alerte>}
        <button type="submit" hidden />
      </form>

      <Pied>
        <BoutonPrincipal disabled={enCours || !coordonneesPretes} onClick={suite}>
          {enCours && <Rouet />}
          {enCours ? "Réservation…" : acompte ? "Continuer" : "Confirmer le rendez-vous"}
        </BoutonPrincipal>
        <p className="mt-3 text-center text-xs text-brand-500">
          {INSTITUT.nom} · {INSTITUT.telephone}
        </p>
      </Pied>
    </main>
  );
}
