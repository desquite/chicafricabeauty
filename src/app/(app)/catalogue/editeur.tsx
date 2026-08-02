"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ, Texte } from "@/components/champs";
import type { SoinCatalogue } from "@/lib/types";
import { basculerSoin, enregistrerSoin } from "./actions";

const vierge = { libelle: "", categorie: "", duree_std: "", prix: "", ordre: "" };

export default function Editeur({
  soins,
  modifiable,
}: {
  soins: SoinCatalogue[];
  modifiable: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [edite, setEdite] = useState<string | undefined>();
  const [saisie, setSaisie] = useState(vierge);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const maj = (cle: keyof typeof vierge, v: string) =>
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
          }
        : vierge,
    );
    setOuvert(true);
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
        <div className="mb-6 rounded-2xl border-2 border-brand-200 bg-white p-6">
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
              className="h-touch flex-[2] rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
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
            </div>
            {modifiable && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => ouvrir(s)}
                  className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() =>
                    demarrer(async () => {
                      await basculerSoin(s.id, !s.actif);
                      router.refresh();
                    })
                  }
                  className="h-11 rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
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
