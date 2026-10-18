"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ, ChoixUnique, DateFr, OuiNon, Paragraphe, Texte } from "@/components/champs";
import { Rouet } from "@/components/attente";
import { dureeLisible, etatPromo, fcfa, GROUPES } from "@/lib/disponibilites";
import type { GroupeSoin, SoinCatalogue } from "@/lib/types";
import { basculerSoin, enregistrerSoin } from "./actions";

const vierge = {
  libelle: "",
  categorie: "",
  duree_std: "",
  prix: "",
  ordre: "",
  libelle_public: "",
  en_ligne: false,
  prix_promo: "",
  promo_debut: "",
  promo_fin: "",
  description: "",
  groupe: "",
};

/** "2026-11-01" → "1 nov." */
const jourMois = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "";

export default function Editeur({
  soins,
  modifiable,
  aujourdhui,
}: {
  soins: SoinCatalogue[];
  modifiable: boolean;
  aujourdhui: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<string | undefined>();
  const [saisie, setSaisie] = useState(vierge);
  // Les champs de date gardent leur texte en interne : le formulaire est
  // remonte a chaque ouverture et a chaque retrait de promotion.
  const [formulaire, setFormulaire] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const [enAttente, setEnAttente] = useState<string | null>(null);

  const maj = <K extends keyof typeof vierge>(cle: K, v: (typeof vierge)[K]) =>
    setSaisie((p) => ({ ...p, [cle]: v }));

  const ouvrir = (s?: SoinCatalogue) => {
    setErreur(null);
    setEdite(s?.id);
    setSaisie(
      s
        ? {
            libelle: s.libelle,
            categorie: s.categorie ?? "",
            duree_std: s.duree_std?.toString() ?? "",
            prix: s.prix?.toString() ?? "",
            ordre: s.ordre.toString(),
            libelle_public: s.libelle_public ?? "",
            en_ligne: s.en_ligne,
            prix_promo: s.prix_promo?.toString() ?? "",
            promo_debut: s.promo_debut ?? "",
            promo_fin: s.promo_fin ?? "",
            description: s.description ?? "",
            groupe: s.groupe ?? "",
          }
        : vierge,
    );
    setFormulaire((n) => n + 1);
    setOuvert(true);
  };

  const retirerPromo = () => {
    setSaisie((p) => ({ ...p, prix_promo: "", promo_debut: "", promo_fin: "" }));
    setFormulaire((n) => n + 1);
  };

  const enregistrer = () =>
    demarrer(async () => {
      const r = await enregistrerSoin({ id: edite, ...saisie });
      if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
      setOuvert(false);
      router.refresh();
    });

  return (
    <>
      {modifiable && (
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => ouvrir()}
            className="h-touch rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
          >
            Ajouter un soin
          </button>
        </div>
      )}

      {ouvert && (
        <div key={formulaire} className="mb-6 rounded-2xl border-2 border-brand-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold text-brand-800">
            {edite ? "Modifier le soin" : "Nouveau soin"}
          </h2>
          <Champ label="Libellé" requis>
            <Texte valeur={saisie.libelle} onChange={(v) => maj("libelle", v)} />
          </Champ>
          <Champ label="Catégorie" aide="Visage, corps, mains…">
            <Texte valeur={saisie.categorie} onChange={(v) => maj("categorie", v)} />
          </Champ>
          <div className="grid gap-4 sm:grid-cols-3">
            <Champ label="Durée (min)">
              <Texte
                type="number"
                valeur={saisie.duree_std}
                onChange={(v) => maj("duree_std", v)}
              />
            </Champ>
            <Champ label="Prix (FCFA)">
              <Texte type="number" valeur={saisie.prix} onChange={(v) => maj("prix", v)} />
            </Champ>
            <Champ label="Ordre d'affichage">
              <Texte type="number" valeur={saisie.ordre} onChange={(v) => maj("ordre", v)} />
            </Champ>
          </div>

          <h3 className="mt-2 mb-3 border-t border-brand-100 pt-5 text-lg font-semibold text-brand-800">
            Réservation en ligne
          </h3>
          <Champ label="Proposé sur la page de réservation">
            <OuiNon valeur={saisie.en_ligne} onChange={(v) => maj("en_ligne", v)} />
          </Champ>
          {saisie.en_ligne && (
            <Champ label="Nom affiché aux clientes" aide="Vide : le libellé ci-dessus">
              <Texte
                valeur={saisie.libelle_public}
                placeholder={saisie.libelle}
                onChange={(v) => maj("libelle_public", v)}
              />
            </Champ>
          )}
          {saisie.en_ligne && (
            <>
              <Champ label="Groupe" aide="La rubrique où le soin apparaît sur la page de réservation">
                <ChoixUnique
                  options={GROUPES.map((g) => ({ valeur: g.id, libelle: g.titre }))}
                  valeur={(saisie.groupe || null) as GroupeSoin | null}
                  onChange={(v) => maj("groupe", v)}
                />
              </Champ>
              <Champ label="Description" aide="Affichée derrière « En savoir plus ». Vide : pas de bouton.">
                <Paragraphe
                  valeur={saisie.description}
                  onChange={(v) => maj("description", v)}
                />
              </Champ>
            </>
          )}

          <h3 className="mt-2 mb-1 border-t border-brand-100 pt-5 text-lg font-semibold text-brand-800">
            Promotion
          </h3>
          <p className="mb-3 text-sm text-brand-400">
            Le prix promo s&apos;applique entre ces deux dates, puis le prix normal revient seul.
          </p>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Champ label="Prix promo (FCFA)">
              <Texte
                type="number"
                valeur={saisie.prix_promo}
                onChange={(v) => maj("prix_promo", v)}
              />
            </Champ>
            <Champ label="Du">
              <DateFr valeur={saisie.promo_debut} onChange={(v) => maj("promo_debut", v)} />
            </Champ>
            <Champ label="Au (inclus)">
              <DateFr valeur={saisie.promo_fin} onChange={(v) => maj("promo_fin", v)} />
            </Champ>
          </div>
          {(saisie.prix_promo || saisie.promo_debut || saisie.promo_fin) && (
            <button
              type="button"
              onClick={retirerPromo}
              className="mb-4 h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Retirer la promotion
            </button>
          )}
          {erreur && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
              {erreur}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="h-touch flex-1 rounded-xl border border-brand-200 font-medium text-brand-700 hover:bg-brand-50"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={enregistrer}
              className="flex h-touch flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              {enCours && <Rouet />}
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {soins.map((s) => (
          <li
            key={s.id}
            className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${
              s.actif ? "border-brand-100 bg-white" : "border-brand-100 bg-brand-50/50"
            }`}
          >
            <div className="min-w-0">
              <p
                className={`text-lg font-semibold ${
                  s.actif ? "text-brand-800" : "text-brand-400 line-through"
                }`}
              >
                {s.libelle}
              </p>
              <p className="text-sm text-brand-400">
                {[
                  s.categorie,
                  s.duree_std && `${s.duree_std} min`,
                  s.prix && `${s.prix.toLocaleString("fr-FR")} FCFA`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Aucun détail"}
              </p>
              <Pastilles soin={s} aujourdhui={aujourdhui} />
            </div>
            {modifiable && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => ouvrir(s)}
                  className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  disabled={enCours}
                  onClick={() => {
                    setEnAttente(s.id);
                    demarrer(async () => {
                      await basculerSoin(s.id, !s.actif);
                      router.refresh();
                      setEnAttente(null);
                    });
                  }}
                  className="flex h-11 items-center gap-2 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                >
                  {enAttente === s.id && <Rouet />}
                  {s.actif ? "Retirer" : "Réactiver"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Ce que la cliente voit de ce soin : en ligne ou non, et sa promotion. */
function Pastilles({ soin, aujourdhui }: { soin: SoinCatalogue; aujourdhui: string }) {
  const promo = etatPromo(soin, aujourdhui);
  if (!soin.en_ligne && (promo === "aucune" || promo === "terminee")) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
      {soin.en_ligne && (
        <span className="rounded-full bg-brand-100 px-2.5 py-1 text-brand-700">
          En ligne
          {soin.libelle_public && soin.libelle_public !== soin.libelle
            ? ` : « ${soin.libelle_public} »`
            : ""}
          {` · ${dureeLisible(soin.duree_std)}`}
        </span>
      )}
      {promo === "en_cours" && (
        <span className="rounded-full bg-brand-600 px-2.5 py-1 text-white">
          Promo {fcfa(soin.prix_promo)} jusqu&apos;au {jourMois(soin.promo_fin)}
        </span>
      )}
      {promo === "a_venir" && (
        <span className="rounded-full border border-brand-300 px-2.5 py-1 text-brand-700">
          Promo {fcfa(soin.prix_promo)} du {jourMois(soin.promo_debut)} au{" "}
          {jourMois(soin.promo_fin)}
        </span>
      )}
    </div>
  );
}
