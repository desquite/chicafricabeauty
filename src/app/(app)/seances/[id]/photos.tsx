"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compresserPhoto, poidsLisible } from "@/lib/image";
import { Rouet } from "@/components/attente";
import { enregistrerPhoto, supprimerPhoto } from "./actions";

export type PhotoAffichee = {
  id: string;
  moment: "avant" | "apres";
  url: string;
  prise_le: string;
};

export default function Photos({
  seanceId,
  photos,
  consentement,
  reference,
}: {
  seanceId: string;
  photos: PhotoAffichee[];
  consentement: boolean | null;
  /** Dernière photo d'une séance antérieure, si la cliente en a déjà eu une. */
  reference: { url: string; date: string } | null;
}) {
  const [comparaison, setComparaison] = useState(false);
  const avant = photos.filter((p) => p.moment === "avant");
  const apres = photos.filter((p) => p.moment === "apres");
  const suivi = reference !== null;

  if (consentement !== true) {
    return (
      <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-6">
        <h2 className="mb-2 text-xl font-semibold text-brand-800">
          Photos avant / après
        </h2>
        <p className="rounded-xl bg-or-400/10 px-4 py-3 text-brand-700">
          {consentement === false
            ? "Cette cliente refuse les photographies. Aucune photo ne peut être prise pendant les séances."
            : "Aucun consentement photo n'a été recueilli pour cette cliente. Recueillez-le avant de photographier."}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-brand-800">
          {suivi ? "Photos" : "Photos avant / après"}
        </h2>
        {((suivi && apres.length > 0) || (avant.length > 0 && apres.length > 0)) && (
          <button
            type="button"
            onClick={() => setComparaison((v) => !v)}
            className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {comparaison ? "Vue par lot" : "Comparer côte à côte"}
          </button>
        )}
      </div>

      {/* Séance de suivi : l'état de départ est celui qu'on a laissé la fois
          précédente. Reprendre une photo « avant » ferait doublon, et le vrai
          repère visuel serait perdu au milieu. */}
      {suivi ? (
        comparaison ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-2 text-sm font-semibold tracking-wide text-brand-400 uppercase">
                Séance du {new Date(reference.date).toLocaleDateString("fr-FR")}
              </p>
              <Reference url={reference.url} date={reference.date} />
            </div>
            <Colonne titre="Aujourd'hui" photos={apres} seanceId={seanceId} />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-semibold tracking-wide text-brand-400 uppercase">
                Séance précédente — {new Date(reference.date).toLocaleDateString("fr-FR")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Reference url={reference.url} date={reference.date} />
              </div>
            </div>
            <Lot titre="Photo du jour" moment="apres" photos={apres} seanceId={seanceId} />
          </div>
        )
      ) : comparaison ? (
        <div className="grid grid-cols-2 gap-3">
          <Colonne titre="Avant" photos={avant} seanceId={seanceId} />
          <Colonne titre="Après" photos={apres} seanceId={seanceId} />
        </div>
      ) : (
        <div className="space-y-6">
          <Lot titre="Avant le soin" moment="avant" photos={avant} seanceId={seanceId} />
          <Lot titre="Après le soin" moment="apres" photos={apres} seanceId={seanceId} />
        </div>
      )}
    </section>
  );
}

/** Photo d'une séance antérieure : consultable, jamais supprimable d'ici. */
function Reference({ url, date }: { url: string; date: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border-2 border-brand-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Photo de la séance du ${new Date(date).toLocaleDateString("fr-FR")}`}
        className="aspect-square w-full object-cover"
      />
    </figure>
  );
}

function Colonne({
  titre,
  photos,
  seanceId,
}: {
  titre: string;
  photos: PhotoAffichee[];
  seanceId: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold tracking-wide text-brand-400 uppercase">
        {titre}
      </p>
      <div className="space-y-3">
        {photos.map((p) => (
          <Vignette key={p.id} photo={p} seanceId={seanceId} />
        ))}
      </div>
    </div>
  );
}

function Lot({
  titre,
  moment,
  photos,
  seanceId,
}: {
  titre: string;
  moment: "avant" | "apres";
  photos: PhotoAffichee[];
  seanceId: string;
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold tracking-wide text-brand-400 uppercase">
        {titre}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <Vignette key={p.id} photo={p} seanceId={seanceId} />
        ))}
        <Capture seanceId={seanceId} moment={moment} />
      </div>
    </div>
  );
}

function Vignette({ photo, seanceId }: { photo: PhotoAffichee; seanceId: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  return (
    <figure className="group relative overflow-hidden rounded-xl border border-brand-100">
      {/* Pas de next/image : les URL signées expirent et changent à chaque
          rendu, l'optimiseur ne peut rien en mettre en cache. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={`Photo ${photo.moment} le ${new Date(photo.prise_le).toLocaleDateString("fr-FR")}`}
        className="aspect-square w-full object-cover"
      />
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          if (!confirm("Supprimer cette photo ?")) return;
          demarrer(async () => {
            await supprimerPhoto(seanceId, photo.id);
            router.refresh();
          });
        }}
        className={`absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-brand-700 transition-opacity focus:opacity-100 ${
          enCours ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Supprimer cette photo"
      >
        {enCours ? (
          <Rouet className="h-5 w-5" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </figure>
  );
}

function Capture({
  seanceId,
  moment,
}: {
  seanceId: string;
  moment: "avant" | "apres";
}) {
  const router = useRouter();
  // Deux champs distincts : l'attribut capture force l'appareil photo et
  // supprime l'accès à la galerie. Un seul champ obligerait donc à choisir
  // entre prendre une photo et en reprendre une déjà enregistrée.
  const champAppareil = useRef<HTMLInputElement>(null);
  const champGalerie = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function traiter(fichier: File) {
    setErreur(null);
    try {
      setEtat("Compression…");
      const blob = await compresserPhoto(fichier);

      setEtat(`Envoi ${poidsLisible(blob.size)}…`);
      const supabase = createClient();
      const chemin = `${seanceId}/${moment}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("photos-soins")
        .upload(chemin, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);

      const r = await enregistrerPhoto(seanceId, moment, chemin);
      if (!r.ok) throw new Error(r.erreur ?? "Enregistrement impossible");

      setEtat(null);
      router.refresh();
    } catch (e) {
      setEtat(null);
      setErreur(e instanceof Error ? e.message : "Échec de l'envoi");
    }
  }

  const auChangement = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void traiter(f);
  };

  return (
    <div>
      <input
        ref={champAppareil}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={auChangement}
      />
      <input
        ref={champGalerie}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={auChangement}
      />

      <div className="flex aspect-square w-full flex-col gap-2 rounded-xl border-2 border-dashed border-brand-300 p-2">
        {etat ? (
          <span className="flex flex-1 flex-col items-center justify-center gap-2 text-brand-500">
            <Rouet className="h-6 w-6" />
            <span className="px-2 text-center text-sm">{etat}</span>
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => champAppareil.current?.click()}
              className="flex flex-[2] flex-col items-center justify-center gap-1 rounded-lg text-brand-500 hover:bg-brand-50"
            >
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="text-center text-sm">Prendre une photo</span>
            </button>
            <button
              type="button"
              onClick={() => champGalerie.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand-200 text-sm text-brand-600 hover:bg-brand-50"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 5h16v14H4zM4 15l4.5-4.5 4 4L16 11l4 4" strokeLinejoin="round" />
                <circle cx="9" cy="9" r="1.4" />
              </svg>
              Galerie
            </button>
          </>
        )}
      </div>

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
