"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type LigneCliente = {
  id: string;
  nom_complet: string;
  telephone: string;
  age: number | null;
  alertes: number;
};

/** Minuscules sans accents : « Zoe » doit trouver « Zoé ». */
const normalise = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const chiffres = (s: string) => s.replace(/\D/g, "");

const MAX_AFFICHE = 60;

/**
 * Recherche instantanée, entièrement dans le navigateur.
 *
 * La liste passait auparavant par un formulaire : il fallait valider, puis
 * attendre un aller-retour serveur à chaque frappe de recherche. Ici tout est
 * déjà chargé, le filtre s'applique à la frappe et effacer le champ rétablit
 * la liste sans aucune requête.
 *
 * Tenable tant que le fichier reste de l'ordre du millier de fiches. Au-delà,
 * il faudra revenir à une recherche côté serveur — le message de troncature
 * ci-dessous préviendra le moment venu.
 */
export function ListeClientes({
  lignes,
  tronquee,
}: {
  lignes: LigneCliente[];
  tronquee: boolean;
}) {
  const [recherche, setRecherche] = useState("");

  // Index calculé une seule fois : normaliser à chaque frappe coûterait un
  // parcours complet du fichier par caractère saisi.
  const index = useMemo(
    () =>
      lignes.map((c) => ({
        ...c,
        nomNormalise: normalise(c.nom_complet),
        telChiffres: chiffres(c.telephone),
      })),
    [lignes],
  );

  const resultats = useMemo(() => {
    const q = normalise(recherche.trim());
    if (!q) return index;
    const qChiffres = chiffres(recherche);
    // Chaque mot saisi doit se retrouver dans le nom : « assi aicha » trouve
    // « Aïcha Assi », quel que soit l'ordre.
    const mots = q.split(/\s+/).filter(Boolean);
    return index.filter(
      (c) =>
        mots.every((m) => c.nomNormalise.includes(m)) ||
        (qChiffres.length >= 3 && c.telChiffres.includes(qChiffres)),
    );
  }, [index, recherche]);

  const visibles = resultats.slice(0, MAX_AFFICHE);

  return (
    <>
      <div className="mb-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par nom, prénom ou téléphone"
          className="h-touch w-full rounded-xl border border-brand-200 bg-white px-5 text-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </div>

      <p className="mb-4 text-sm text-brand-400">
        {recherche.trim()
          ? `${resultats.length} résultat${resultats.length > 1 ? "s" : ""} sur ${lignes.length}`
          : `${lignes.length} cliente${lignes.length > 1 ? "s" : ""}`}
        {resultats.length > MAX_AFFICHE &&
          ` — ${MAX_AFFICHE} affichées, affinez la recherche`}
      </p>

      {tronquee && (
        <p className="mb-4 rounded-xl bg-or-400/10 px-4 py-3 text-sm text-brand-700">
          Le fichier dépasse ce que cet écran peut charger d&apos;un coup : la
          recherche ne porte que sur les fiches ci-dessous. Il est temps de
          passer à une recherche côté serveur.
        </p>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-200 p-10 text-center text-brand-400">
          {lignes.length === 0
            ? "Aucune cliente enregistrée pour le moment."
            : `Aucune cliente ne correspond à « ${recherche.trim()} ».`}
        </p>
      ) : (
        <ul className="space-y-3">
          {visibles.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clientes/${c.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold text-brand-800">
                    {c.nom_complet}
                  </span>
                  <span className="block text-sm text-brand-400">
                    {c.telephone}
                    {c.age !== null && ` · ${c.age} ans`}
                  </span>
                </span>
                {c.alertes > 0 && (
                  <span className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                    {c.alertes} alerte{c.alertes > 1 ? "s" : ""}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
