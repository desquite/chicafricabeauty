"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Logo } from "@/components/logo";
import { Rouet } from "@/components/attente";
import type { JourCreneaux } from "@/lib/creneaux";
import type { PrestationPublique } from "@/lib/reservation";
import { GROUPES } from "@/lib/disponibilites";
import { INDICATIF_DEFAUT, listeIndicatifs, normaliserNumero } from "@/lib/indicatifs";
import { echeanceTardive, montantAcompte, veilleLimite } from "@/lib/regles-acompte";
import {
  lireCreneaux,
  reconnaitre,
  reserver,
  type Recapitulatif,
  type Reconnaissance,
} from "./actions";
import { INSTITUT } from "./institut";
import { ChoixPaiement, SuiviPaiement, usePaiement, type OffreAcompte } from "./paiement";
import { fraunces } from "./polices";

export type { OffreAcompte };

/**
 * Rendez-vous réservé dont l'acompte n'est pas encore payé, gardé dans le
 * navigateur. Passer par l'appli Wave, ou fermer l'onglet, faisait perdre
 * l'écran de paiement : la cliente le retrouve en revenant sur /rdv.
 */
const CLE_EN_ATTENTE = "cab_acompte_en_attente";
type EnAttente = { code: string; prestation: string; date: string; heure: string; echeance: string | null };

function lireEnAttente(): EnAttente | null {
  try {
    const brut = window.localStorage.getItem(CLE_EN_ATTENTE);
    if (!brut) return null;
    const e = JSON.parse(brut) as EnAttente;
    // Échéance passée, ou rendez-vous passé : plus rien à payer.
    const fin = e.echeance ? Date.parse(e.echeance) : Date.parse(`${e.date}T23:59:59Z`);
    if (!/^[0-9a-f]{12}$/.test(e.code) || !(fin > Date.now())) {
      window.localStorage.removeItem(CLE_EN_ATTENTE);
      return null;
    }
    return e;
  } catch {
    return null;
  }
}

function ecrireEnAttente(e: EnAttente | null) {
  try {
    if (e) window.localStorage.setItem(CLE_EN_ATTENTE, JSON.stringify(e));
    else window.localStorage.removeItem(CLE_EN_ATTENTE);
  } catch {
    // Navigation privée ou stockage bloqué : le lien WhatsApp reste.
  }
}

/** Les créneaux affichés sont relus toutes les 30 secondes : temps réel. */
const RAFRAICHISSEMENT_MS = 30_000;

/** « lundi 19 octobre » : le jour limite de l'acompte. */
const jourLimite = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

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
  const [indicatif, setIndicatif] = useState(INDICATIF_DEFAUT);
  const pays = useMemo(() => listeIndicatifs(), []);
  const [email, setEmail] = useState("");
  // Réponse de la recherche, valable pour le seul numéro « cle » : taper un
  // autre numéro la rend caduque sans effet à remettre à zéro.
  const [reco, setReco] = useState<(Reconnaissance & { cle: string }) | null>(null);
  const [pourAutre, setPourAutre] = useState(false);
  const [site, setSite] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [recap, setRecap] = useState<Recapitulatif | null>(null);
  const [chargement, setChargement] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [payerMaintenant, setPayerMaintenant] = useState(true);
  const [enAttente, setEnAttente] = useState<EnAttente | null>(null);
  // Lu après le premier rendu : le serveur ne connaît pas le navigateur.
  useEffect(() => {
    const e = lireEnAttente();
    if (e) queueMicrotask(() => setEnAttente(e));
  }, []);
  // Mobile Money ivoirien seulement : un numero etranger ne preremplit pas.
  const paiement = usePaiement(indicatif === INDICATIF_DEFAUT ? telephone : "");
  // Paiement abouti : plus rien à reprendre.
  const payeIci = paiement.paiement?.etat === "reussi";
  useEffect(() => {
    if (payeIci) ecrireEnAttente(null);
  }, [payeIci]);

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

  // Rendez-vous apres la veille 18h : l'acompte se regle jusqu'a 2 h avant le
  // rendez-vous. Calcule ici pour l'affichage ; le serveur tranche avec sa
  // propre horloge.
  const obligatoire = !!acompte?.obligatoire;
  const immediat = obligatoire && !!date && new Date() >= veilleLimite(date);
  const payerTout = payerMaintenant;
  // Jamais plus que le prix du soin : une pedicure a 5 000 F se regle 5 000 F.
  const montantSoin = acompte ? montantAcompte(acompte.montant, soin?.prixValeur ?? null) : 0;

  function valider() {
    if (!soin) return;
    setErreur(null);
    demarrer(async () => {
      const r = await reserver({
        soinId: soin.id,
        date,
        heure: choixHeure,
        nom: demanderNom ? nom : "",
        pourAutre: Boolean(connue) && pourAutre,
        telephone,
        indicatif,
        email,
        site,
        acompteMaintenant: Boolean(acompte) && payerTout,
      });
      if (r.ok) {
        setRecap(r.recap);
        if (r.recap.acompteRequis) {
          ecrireEnAttente({
            code: r.recap.code,
            prestation: r.recap.prestation,
            date: r.recap.date,
            heure: r.recap.debut,
            echeance: r.recap.echeance,
          });
        }
        // Le rendez-vous existe deja : un paiement qui echoue ne le remet pas
        // en cause, la cliente peut reessayer depuis la confirmation.
        if (acompte && payerTout) await paiement.lancer(r.recap.code);
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

  const numeroValide = normaliserNumero(indicatif, telephone);
  const cleNumero = numeroValide?.international ?? "";
  useEffect(() => {
    if (!cleNumero) return;
    const minuteur = setTimeout(async () => {
      const r = await reconnaitre({ indicatif, telephone }).catch(
        (): Reconnaissance => ({ etat: "nouvelle" }),
      );
      setReco({ ...r, cle: cleNumero });
    }, 400);
    return () => clearTimeout(minuteur);
    // indicatif et telephone sont résumés par cleNumero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleNumero]);
  const recoActuelle = reco && reco.cle === cleNumero ? reco : null;
  const recherche = Boolean(cleNumero) && !recoActuelle;
  const connue = recoActuelle?.etat === "connue" ? recoActuelle : null;
  // Le nom n'est demandé qu'à une nouvelle cliente, ou pour une autre personne.
  const demanderNom = Boolean(recoActuelle) && (!connue || pourAutre);

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

        {enAttente && (
          <a
            href={`/a/${enAttente.code}`}
            className="mx-5 mt-5 flex flex-col gap-1 rounded-[18px] border-2 border-brand-500 bg-white px-4 py-3.5 text-left shadow-[0_4px_14px_rgba(74,35,28,0.08)]"
          >
            <span className="text-[13px] font-bold tracking-wide text-brand-500 uppercase">
              Acompte en attente
            </span>
            <span className="text-[15px] font-semibold text-brand-800">
              {enAttente.prestation} · {dateLongue(enAttente.date)} à {heure(enAttente.heure)}
            </span>
            <span className="text-sm font-bold text-brand-600 underline">Régler l&apos;acompte →</span>
          </a>
        )}

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
                                <p className="mt-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-sm leading-relaxed whitespace-pre-line text-brand-700">
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
    const paye = paiement.paiement?.etat === "reussi";
    // Paiement lance mais pas encore abouti : rien n'est confirme a l'ecran,
    // meme quand l'acompte est facultatif.
    const paiementEnCours = paiement.paiement?.etat === "en_attente";
    // Acompte requis et pas encore regle : le creneau est retenu, pas confirme.
    const enSuspens = Boolean(acompte && !paye && (recap.acompteRequis || paiementEnCours));
    const echeance = recap.echeance ? new Date(recap.echeance) : null;
    const limiteTexte = echeance
      ? recap.immediat
        ? `au plus tard le ${jourLimite(echeance)} à ${echeance.getUTCHours()}h${String(echeance.getUTCMinutes()).padStart(2, "0")}`
        : `au plus tard le ${jourLimite(echeance)} à 18h`
      : "";
    const lienAcompte = `/a/${recap.code}`;

    const panneauAcompte = acompte && (
      <SuiviPaiement
        code={recap.code}
        montant={recap.acompte || montantSoin}
        ussdOrange={acompte.ussdOrange}
        p={paiement}
        invitation={
          recap.acompteRequis
            ? `Acompte de ${(recap.acompte || montantSoin).toLocaleString("fr-FR")} F à régler ${limiteTexte}. Tu peux le payer maintenant.`
            : "Acompte non réglé : tu peux le payer maintenant, ou à l'institut."
        }
      />
    );

    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-[18px] px-5 pt-14 pb-8">
        <div
          className={`flex h-[88px] w-[88px] items-center justify-center rounded-full text-white ${
            // Vert : reserve et confirme. Le brun clair reste pour l'attente
            // de l'acompte, qui n'est pas encore une confirmation.
            enSuspens ? "bg-brand-400" : "bg-[#2f7d4f]"
          }`}
        >
          {enSuspens ? (
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          ) : (
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h1 className={`${titre} mt-1 text-center text-[30px]`}>
          {enSuspens ? "Plus qu'une étape !" : paye ? "C'est confirmé !" : "C'est réservé !"}
        </h1>
        <p className="text-center text-[15px] leading-relaxed text-brand-700">
          {enSuspens && recap.acompteRequis ? (
            <>
              Ton créneau est retenu. Règle l&apos;acompte {limiteTexte} pour le confirmer : sans
              acompte, le rendez-vous est annulé automatiquement.
              {" Le lien de paiement t'est aussi envoyé sur WhatsApp."}
            </>
          ) : enSuspens ? (
            <>Ton créneau est retenu. Termine le paiement de l&apos;acompte pour le confirmer.</>
          ) : (
            <>
              À très vite{recap.prenom ? `, ${recap.prenom}` : ""}. Garde bien ce
              récapitulatif.
            </>
          )}
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
          {enSuspens && (
            <p className="mt-1 text-center text-[13px] text-brand-600">
              Pour payer plus tard, garde ce lien :{" "}
              <a href={lienAcompte} className="font-semibold break-all underline">
                {typeof window === "undefined" ? lienAcompte : `${window.location.origin}${lienAcompte}`}
              </a>
            </p>
          )}
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
    const montant = `${montantSoin.toLocaleString("fr-FR")} F CFA`;
    const tardive = immediat && date ? echeanceTardive(date, choixHeure || null, new Date()) : null;
    const limite = tardive
      ? `${jourLimite(tardive)} à ${tardive.getUTCHours()}h${String(tardive.getUTCMinutes()).padStart(2, "0")}`
      : date
        ? `${jourLimite(veilleLimite(date))} à 18h`
        : "";
    const plusTardPossible = true;
    const maintenant = payerTout;
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {entete}
        <div className="flex flex-col gap-3.5 px-5 pt-5">
          {obligatoire ? (
            <>
              <h2 className={`${titre} mx-1 text-2xl leading-tight`}>Régler l&apos;acompte</h2>
              <p className="mx-1 text-sm leading-relaxed text-brand-600">
                L&apos;acompte de {montant} confirme ton rendez-vous. Il est déduit du prix le jour du
                soin.
              </p>
              {immediat && (
                <p className="rounded-2xl bg-brand-100 px-4 py-3 text-sm leading-relaxed text-brand-800">
                  Ton rendez-vous est très proche : l&apos;acompte est à régler au plus tard le{" "}
                  {limite}. Sans paiement à cette heure-là, le créneau est libéré.
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className={`${titre} mx-1 text-2xl leading-tight`}>
                Veux-tu régler l&apos;acompte maintenant ?
              </h2>
              <p className="mx-1 text-sm leading-relaxed text-brand-600">
                {montant}, déduits du prix le jour du soin. C&apos;est facultatif : ton rendez-vous
                est réservé dans les deux cas.
              </p>
            </>
          )}

          <div
            className={`flex flex-col gap-3.5 rounded-[18px] bg-white p-[18px] ${
              maintenant ? "border-2 border-brand-600" : "border border-brand-200"
            }`}
          >
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="acompte"
                checked={maintenant}
                onChange={() => setPayerMaintenant(true)}
                className="mt-0.5 h-[22px] w-[22px] accent-brand-600"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold">Payer l&apos;acompte maintenant</span>
                <span className="text-[13px] text-brand-600">Par Mobile Money, en quelques secondes</span>
              </span>
            </label>
            {maintenant && (
              <ChoixPaiement montant={montantSoin} ussdOrange={acompte.ussdOrange} p={paiement} />
            )}
          </div>

          {plusTardPossible && (
            <label
              className={`flex items-start gap-3 rounded-[18px] bg-white p-[18px] ${
                !maintenant ? "border-2 border-brand-600" : "border border-brand-200"
              }`}
            >
              <input
                type="radio"
                name="acompte"
                checked={!maintenant}
                onChange={() => setPayerMaintenant(false)}
                className="mt-0.5 h-[22px] w-[22px] accent-brand-600"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-bold">
                  {obligatoire ? "Payer plus tard" : "Réserver sans payer maintenant"}
                </span>
                <span className="text-[13px] leading-snug text-brand-600">
                  {obligatoire
                    ? `Tu reçois le lien de paiement sur WhatsApp. À régler au plus tard le ${limite}, sinon le rendez-vous est annulé automatiquement.`
                    : "Tu pourras régler l'acompte à l'institut."}
                </span>
              </span>
            </label>
          )}

          <details className="px-1 text-[13px] leading-relaxed text-brand-600">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-700">
              Conditions de l&apos;acompte
            </summary>
            {obligatoire &&
              "L'acompte est obligatoire et se règle au plus tard la veille du rendez-vous à 18h (pour une réservation faite après, au plus tard 2 h avant le rendez-vous) ; sans acompte à cette heure-là, le rendez-vous est annulé automatiquement. "}
            L&apos;acompte n&apos;est pas remboursable. Il est retenu en cas de retard de plus de 30
            minutes, d&apos;annulation moins de 24 h avant le rendez-vous, ou d&apos;absence non
            justifiée.
          </details>

          {erreur && <Alerte>{erreur}</Alerte>}
        </div>

        <Pied>
          <BoutonPrincipal disabled={enCours || (maintenant && !paiement.pret)} onClick={valider}>
            {enCours && <Rouet />}
            {enCours
              ? "Réservation…"
              : maintenant
                ? `Payer ${montantSoin.toLocaleString("fr-FR")} F et réserver`
                : obligatoire
                  ? "Réserver et recevoir le lien"
                  : "Confirmer le rendez-vous"}
          </BoutonPrincipal>
        </Pied>
      </main>
    );
  }

  /* ------------------------------------------------------- 3. Coordonnées */
  const champ =
    "h-[52px] w-full rounded-[14px] border border-brand-300 bg-white px-4 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none";
  const coordonneesPretes =
    numeroValide !== null && !recherche && (!demanderNom || nom.trim().length >= 2);
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
          Commence par ton numéro : si tu es déjà cliente, on te reconnaît.
        </p>

        {/* Deux champs, l'indicatif et le numero : un div, pas un label qui ne
            peut en designer qu'un. */}
        <div className="flex flex-col gap-1.5 text-sm font-semibold text-brand-800">
          <label htmlFor="telephone">Numéro WhatsApp</label>
          <span className="flex gap-2">
            {/* Le select natif, invisible, couvre la pastille : la liste des
                pays s'ouvre comme sur n'importe quel telephone, et seul
                l'indicatif s'affiche dans le champ. */}
            <span className="relative flex h-[52px] shrink-0 items-center gap-1 rounded-[14px] border border-brand-300 bg-brand-50 pr-2.5 pl-3.5 text-base font-semibold">
              +{indicatif}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-brand-500">
                <path d="M6 9l6 6 6-6" />
              </svg>
              <select
                aria-label="Indicatif du pays"
                value={indicatif}
                onChange={(e) => setIndicatif(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <optgroup label="Fréquents">
                  {pays.frequents.map((p) => (
                    <option key={`f-${p.iso}`} value={p.indicatif}>
                      {p.nom} (+{p.indicatif})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tous les pays">
                  {pays.autres.map((p) => (
                    <option key={p.iso} value={p.indicatif}>
                      {p.nom} (+{p.indicatif})
                    </option>
                  ))}
                </optgroup>
              </select>
            </span>
            <input
              id="telephone"
              className={`${champ} min-w-0 flex-1`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={indicatif === INDICATIF_DEFAUT ? "07 00 00 00 00" : "Numéro"}
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              required
            />
          </span>
          <span className="text-[13px] font-normal text-brand-600">
            C&apos;est ici que l&apos;institut te contactera.
          </span>
        </div>


        {recherche && (
          <p className="mx-1 flex items-center gap-2 text-sm text-brand-600" role="status">
            <Rouet /> On vérifie ton numéro…
          </p>
        )}

        {connue && !pourAutre && (
          <div
            className="flex flex-col gap-1 rounded-[18px] border border-brand-200 bg-white px-4 py-3.5 shadow-[0_4px_14px_rgba(74,35,28,0.06)]"
            role="status"
          >
            <span className={`${titre} text-[20px]`}>Bonjour {connue.salut} !</span>
            <span className="text-sm text-brand-700">
              On t&apos;a reconnue, le rendez-vous sera à ton nom.
            </span>
            <button
              type="button"
              onClick={() => setPourAutre(true)}
              className="mt-1 self-start text-[13px] font-semibold text-brand-600 underline"
            >
              Ce n&apos;est pas moi, ou je réserve pour quelqu&apos;un d&apos;autre
            </button>
          </div>
        )}

        {demanderNom && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-800">
            {connue ? "Nom et prénoms de la personne qui vient" : "Nom et prénoms"}
            <input
              className={champ}
              autoComplete={connue ? "off" : "name"}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
            />
            {connue && (
              <button
                type="button"
                onClick={() => setPourAutre(false)}
                className="self-start text-[13px] font-normal text-brand-600 underline"
              >
                Finalement, c&apos;est pour moi
              </button>
            )}
          </label>
        )}

        {recoActuelle?.etat === "limite" && (
          <p className="mx-1 text-[13px] text-brand-600">
            Trop de numéros essayés depuis cet appareil : indique ton nom pour continuer.
          </p>
        )}

        {recoActuelle && !(connue && connue.emailConnu && !pourAutre) && (
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
        )}

        {/* Invisible pour une personne, rempli par les robots. Nom sans sens
            et marques « à ignorer » : les gestionnaires de mots de passe et le
            remplissage automatique ne doivent pas y toucher. */}
        <input
          type="text"
          name="cab_ref_interne"
          tabIndex={-1}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
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
