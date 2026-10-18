"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Logo } from "@/components/logo";
import { Rouet } from "@/components/attente";
import type { JourCreneaux } from "@/lib/creneaux";
import type { PrestationPublique } from "@/lib/reservation";
import { lireCreneaux, reserver, type Recapitulatif } from "./actions";
import { INSTITUT } from "./institut";
import { fraunces } from "./polices";

/** Les créneaux affichés sont relus toutes les 30 secondes : temps réel. */
const RAFRAICHISSEMENT_MS = 30_000;
const ETAPES = 3;

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

function Progression({ etape }: { etape: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Étape ${etape + 1} sur ${ETAPES}`}>
      {Array.from({ length: ETAPES }, (_, i) => (
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

/* ----------------------------------------------------------------- Parcours */

export default function Reservation({ prestations }: { prestations: PrestationPublique[] }) {
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
        setEtape(3);
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
          <Progression etape={0} />
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
          {prestations.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void choisirSoin(p)}
              className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-[18px] py-4 text-left shadow-[0_1px_2px_rgba(74,35,28,0.06),0_4px_14px_rgba(74,35,28,0.05)] transition-transform active:scale-[0.99]"
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[15px] leading-snug font-semibold text-brand-900">{p.nom}</span>
                <span className="text-[13px] text-brand-500">{p.duree}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {p.prixBarre && (
                  <span className="text-xs text-brand-400 line-through">{p.prixBarre}</span>
                )}
                <span className={`text-[15px] font-bold ${p.prixBarre ? "text-brand-500" : "text-brand-800"}`}>
                  {p.prix}
                </span>
                {p.promoJusquau && (
                  <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Offre jusqu&apos;au{" "}
                    {enDate(p.promoJusquau).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      </main>
    );
  }

  /* ------------------------------------------------------ 4. Confirmation */
  if (etape === 3 && recap) {
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
        <Progression etape={etape} />
      </div>
      {soin && (
        <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-100 px-[18px] py-3.5">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">{soin.nom}</span>
            <span className="text-[13px] text-brand-600">
              {etape === 2 && date && choixHeure
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

  /* ------------------------------------------------------- 3. Coordonnées */
  const champ =
    "h-[52px] w-full rounded-[14px] border border-brand-300 bg-white px-4 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {entete}
      <form
        className="flex flex-col gap-[18px] px-5 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          valider();
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
        <BoutonPrincipal
          disabled={enCours || nom.trim().length < 2 || telephone.replace(/\D/g, "").length < 10}
          onClick={valider}
        >
          {enCours && <Rouet />}
          {enCours ? "Réservation…" : "Confirmer le rendez-vous"}
        </BoutonPrincipal>
        <p className="mt-3 text-center text-xs text-brand-500">
          {INSTITUT.nom} · {INSTITUT.telephone}
        </p>
      </Pied>
    </main>
  );
}
