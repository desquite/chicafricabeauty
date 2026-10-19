"use client";

import { useEffect, useState, useTransition } from "react";
import { Rouet } from "@/components/attente";
import type { EtatAcompte } from "@/lib/acompte";
import { payerAcompte, suivreAcompte } from "./actions";

/**
 * Paiement de l'acompte par Mobile Money, partagé entre la fin de la
 * réservation (/rdv) et le lien envoyé à la cliente (/a/<code>).
 */

/** Pendant un paiement, l'état est relu toutes les 4 secondes, 5 minutes au plus. */
const SUIVI_PAIEMENT_MS = 4_000;
const SUIVI_PAIEMENT_MAX_MS = 5 * 60_000;

export type OffreAcompte = {
  montant: number;
  ussdOrange: string | null;
  /** Réglage « Acompte obligatoire » allumé par la gérante. */
  obligatoire: boolean;
};

export type Paiement =
  | { etat: EtatAcompte; orderId: string; lien: string | null; operateur: string }
  | { etat: "erreur"; erreur: string };

// Couleurs des marques, pour que la cliente reconnaisse son operateur d un
// coup d oeil : orange Orange, jaune MTN, bleu Moov Africa, bleu ciel Wave.
const OPERATEURS = [
  { valeur: "orange", libelle: "Orange", couleurs: "bg-[#FF7900] text-black" },
  { valeur: "mtn", libelle: "MTN", couleurs: "bg-[#FFCB05] text-black" },
  { valeur: "moov", libelle: "Moov", couleurs: "bg-[#0066B3] text-white" },
  { valeur: "wave", libelle: "Wave", couleurs: "bg-[#1DC8F1] text-[#0B1F3A]" },
] as const;

/** État du formulaire et du suivi d'un paiement. */
export function usePaiement(telephoneDefaut: string) {
  const [operateur, setOperateur] = useState("");
  const [telPayeur, setTelPayeur] = useState("");
  const [otp, setOtp] = useState("");
  const [paiement, setPaiement] = useState<Paiement | null>(null);
  const [attenteLongue, setAttenteLongue] = useState(false);
  const telephone = telPayeur || telephoneDefaut;

  const pret =
    !!operateur &&
    telephone.replace(/\D/g, "").length >= 10 &&
    (operateur !== "orange" || otp.replace(/\D/g, "").length >= 4);

  async function lancer(code: string) {
    setAttenteLongue(false);
    const r = await payerAcompte({ code, operateur, telephone, otp });
    setPaiement(
      r.ok
        ? { etat: r.etat, orderId: r.orderId, lien: r.lien, operateur }
        : { etat: "erreur", erreur: r.erreur },
    );
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

  return {
    operateur,
    setOperateur,
    telephone,
    setTelephone: setTelPayeur,
    otp,
    setOtp,
    paiement,
    attenteLongue,
    pret,
    lancer,
  };
}

export type EtatPaiement = ReturnType<typeof usePaiement>;

/** Opérateur, numéro qui paie et, pour Orange, le code de paiement. */
export function ChoixPaiement({
  montant,
  ussdOrange,
  p,
}: {
  montant: number;
  ussdOrange: string | null;
  p: EtatPaiement;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Opérateur Mobile Money">
        {OPERATEURS.map((o) => (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={p.operateur === o.valeur}
            onClick={() => p.setOperateur(o.valeur)}
            className={`h-11 rounded-xl text-[13px] font-bold transition ${o.couleurs} ${
              p.operateur === o.valeur
                ? "ring-[3px] ring-brand-900 ring-offset-2"
                : p.operateur
                  ? "opacity-45"
                  : ""
            }`}
          >
            {p.operateur === o.valeur && <span aria-hidden>✓ </span>}
            {o.libelle}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-brand-800">
        Numéro qui paie
        <input
          type="tel"
          inputMode="tel"
          value={p.telephone}
          onChange={(e) => p.setTelephone(e.target.value)}
          placeholder="07 00 00 00 00"
          className="h-12 rounded-xl border border-brand-300 bg-white px-3.5 text-base text-brand-900 focus:border-brand-600 focus:outline-none"
        />
      </label>
      {p.operateur === "orange" && (
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-brand-800">
          Code de paiement Orange Money
          <span className="leading-snug font-normal text-brand-600">
            {ussdOrange ? (
              <>
                Compose <strong className="font-bold">{ussdOrange}</strong> sur ce numéro pour obtenir
                ton code, puis saisis-le ici.
              </>
            ) : (
              "Génère un code de paiement depuis ton menu Orange Money, puis saisis-le ici."
            )}
          </span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={p.otp}
            onChange={(e) => p.setOtp(e.target.value)}
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

/**
 * Où en est le paiement : réussi, en cours, ou à faire (premier essai ou
 * nouvel essai après un échec), avec le formulaire.
 */
export function SuiviPaiement({
  code,
  montant,
  ussdOrange,
  p,
  invitation,
}: {
  code: string;
  montant: number;
  ussdOrange: string | null;
  p: EtatPaiement;
  /** Phrase affichée tant que rien n'a été tenté. */
  invitation: string;
}) {
  const [enCours, demarrer] = useTransition();
  const { paiement } = p;

  if (paiement?.etat === "reussi") {
    return (
      <p className="flex items-center justify-between gap-3 text-sm">
        <span className="text-brand-500">Acompte</span>
        <span className="rounded-full bg-[#e5f0e6] px-2.5 py-1 text-[13px] font-semibold text-[#2f5d3a]">
          {montant.toLocaleString("fr-FR")} F payés
        </span>
      </p>
    );
  }

  if (paiement?.etat === "en_attente") {
    return (
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
        {p.attenteLongue && (
          <p className="text-brand-600">
            La confirmation tarde. Si tu as payé, elle arrivera d&apos;elle-même et tu recevras un
            message. Sinon, réessaie depuis le lien reçu sur WhatsApp.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {paiement ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-red-800">
          {paiement.etat === "erreur"
            ? paiement.erreur
            : "Le paiement n'a pas abouti. Tu peux réessayer."}
        </p>
      ) : (
        <p className="text-brand-600">{invitation}</p>
      )}
      <ChoixPaiement montant={montant} ussdOrange={ussdOrange} p={p} />
      <button
        type="button"
        disabled={enCours || !p.pret}
        onClick={() => demarrer(() => p.lancer(code))}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-base font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
      >
        {enCours && <Rouet />}
        {enCours ? "Envoi…" : `Payer ${montant.toLocaleString("fr-FR")} F`}
      </button>
    </div>
  );
}
