"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ, DateFr, OuiNon, Texte } from "@/components/champs";
import { Signature } from "@/components/signature";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import {
  TEXTE_CONSENTEMENT_PHOTO,
  TEXTE_CONSENTEMENT_SOIN,
} from "@/lib/consentements";
import { enregistrerNouvelleFiche, type Identite } from "../actions";
import {
  EtapeBilanSante,
  EtapeHabitudes,
  santeComplete,
  santeVide,
} from "../etapes-sante";

const ETAPES = ["Identité", "Bilan santé", "Habitudes", "Consentement"];

export default function Parcours() {
  const router = useRouter();
  const [etape, setEtape] = useState(0);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [identite, setIdentite] = useState<Identite>({
    nom: "",
    prenoms: "",
    date_naissance: "",
    profession: "",
    telephone: "",
    email: "",
  });
  const [sante, setSante] = useState(santeVide);
  const [consentementSoin, setConsentementSoin] = useState(false);
  const [consentementPhoto, setConsentementPhoto] = useState<boolean | null>(null);
  const [signature, setSignature] = useState<Blob | null>(null);

  const majIdentite = (cle: keyof Identite, v: string) =>
    setIdentite((p) => ({ ...p, [cle]: v }));
  const majSante = <K extends keyof typeof sante>(cle: K, v: (typeof sante)[K]) =>
    setSante((p) => ({ ...p, [cle]: v }));

  const identiteComplete =
    identite.nom.trim() !== "" &&
    identite.prenoms.trim() !== "" &&
    identite.telephone.trim() !== "" &&
    identite.date_naissance !== "";

  const peutAvancer = [
    identiteComplete,
    santeComplete(sante, "bilan"),
    santeComplete(sante, "habitudes"),
    consentementSoin && consentementPhoto !== null && signature !== null,
  ][etape];

  async function valider() {
    setErreur(null);
    let signaturePath: string | null = null;

    if (signature) {
      const supabase = createClient();
      const chemin = `${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage
        .from("signatures")
        .upload(chemin, signature, { contentType: "image/png" });
      if (error) {
        setErreur(`Signature non enregistrée : ${error.message}`);
        return;
      }
      signaturePath = chemin;
    }

    const r = await enregistrerNouvelleFiche({
      identite,
      sante,
      consentementSoin,
      consentementPhoto: consentementPhoto ?? false,
      signaturePath,
    });

    if (!r.ok) {
      setErreur(r.erreur);
      return;
    }
    router.push(`/clientes/${r.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-6">
      <header className="mb-6 flex items-center gap-3">
        <Logo className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-semibold text-brand-800">Fiche cliente</h1>
          <p className="text-sm text-brand-400">
            Étape {etape + 1} sur {ETAPES.length} — {ETAPES[etape]}
          </p>
        </div>
      </header>

      <div
        className="mb-8 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${ETAPES.length}, 1fr)` }}
        role="progressbar"
        aria-valuenow={etape + 1}
        aria-valuemin={1}
        aria-valuemax={ETAPES.length}
      >
        {ETAPES.map((e, i) => (
          <span
            key={e}
            className={`h-1.5 rounded-full ${i <= etape ? "bg-brand-600" : "bg-brand-100"}`}
          />
        ))}
      </div>

      <div className="flex-1">
        {etape === 0 && (
          <>
            <Champ label="Nom" requis>
              <Texte valeur={identite.nom} onChange={(v) => majIdentite("nom", v)} />
            </Champ>
            <Champ label="Prénoms" requis>
              <Texte valeur={identite.prenoms} onChange={(v) => majIdentite("prenoms", v)} />
            </Champ>
            <Champ label="Date de naissance" requis>
              <DateFr
                valeur={identite.date_naissance}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(v) => majIdentite("date_naissance", v)}
              />
            </Champ>
            <Champ label="Profession">
              <Texte
                valeur={identite.profession}
                onChange={(v) => majIdentite("profession", v)}
              />
            </Champ>
            <Champ
              label="Téléphone"
              aide="Privilégiez votre contact WhatsApp, avec l'indicatif du pays"
              requis
            >
              <Texte
                valeur={identite.telephone}
                inputMode="tel"
                placeholder="+225 07 00 00 00 00"
                onChange={(v) => majIdentite("telephone", v)}
              />
            </Champ>
            <Champ label="Email">
              <Texte
                type="email"
                inputMode="email"
                valeur={identite.email}
                onChange={(v) => majIdentite("email", v)}
              />
            </Champ>
          </>
        )}

        {etape === 1 && <EtapeBilanSante sante={sante} maj={majSante} />}
        {etape === 2 && <EtapeHabitudes sante={sante} maj={majSante} />}

        {etape === 3 && (
          <>
            <Champ label="Consentement aux soins" requis>
              <button
                type="button"
                aria-pressed={consentementSoin}
                onClick={() => setConsentementSoin((v) => !v)}
                className={`flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-colors ${
                  consentementSoin
                    ? "border-brand-600 bg-brand-50"
                    : "border-brand-200 bg-white hover:border-brand-400"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                    consentementSoin ? "border-brand-600 bg-brand-600" : "border-brand-300"
                  }`}
                  aria-hidden="true"
                >
                  {consentementSoin && (
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="text-brand-800">{TEXTE_CONSENTEMENT_SOIN}</span>
              </button>
            </Champ>

            <Champ label="Photographies de suivi" aide={TEXTE_CONSENTEMENT_PHOTO} requis>
              <OuiNon valeur={consentementPhoto} onChange={setConsentementPhoto} />
            </Champ>

            <Champ label="Signature" requis>
              <Signature onChange={setSignature} />
            </Champ>
          </>
        )}

        {erreur && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
            {erreur}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 mt-8 flex gap-3 border-t border-brand-100 bg-creme py-4">
        <button
          type="button"
          onClick={() => (etape === 0 ? router.push("/clientes") : setEtape((e) => e - 1))}
          className="h-touch flex-1 rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
        >
          {etape === 0 ? "Annuler" : "Retour"}
        </button>
        <button
          type="button"
          disabled={!peutAvancer || enCours}
          onClick={() =>
            etape === ETAPES.length - 1
              ? demarrer(() => void valider())
              : setEtape((e) => e + 1)
          }
          className="h-touch flex-[2] rounded-xl bg-brand-600 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
        >
          {enCours
            ? "Enregistrement…"
            : etape === ETAPES.length - 1
              ? "Enregistrer la fiche"
              : "Suivant"}
        </button>
      </div>
    </div>
  );
}
