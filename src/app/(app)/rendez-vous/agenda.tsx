"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Champ, DateFr, HeureFr, Paragraphe, Texte } from "@/components/champs";
import { Rouet } from "@/components/attente";
import type { Cliente, SoinCatalogue } from "@/lib/types";
import { REMISE_POURCENT } from "@/lib/fidelite";
import { changerStatut, enregistrerRdv, masquerRdv } from "./actions";

/** Durée de l'effacement, à garder alignée sur la transition CSS ci-dessous. */
const DUREE_SORTIE = 450;

export type RdvAffiche = {
  id: string;
  date_rdv: string;
  heure_rdv: string | null;
  duree_min: number | null;
  statut: "prevu" | "honore" | "annule" | "absent";
  notes: string | null;
  soin_id: string | null;
  clientes: Pick<Cliente, "id" | "nom_complet" | "telephone"> | null;
  soins_catalogue: { libelle: string } | null;
  alertes: number;
  /** Rang de la venue quand elle ouvre droit à la remise fidélité, sinon null. */
  remise: number | null;
};

const STATUTS = [
  { valeur: "prevu", libelle: "Prévu", classe: "bg-brand-50 text-brand-700" },
  { valeur: "honore", libelle: "Honoré", classe: "bg-green-50 text-green-800" },
  { valeur: "annule", libelle: "Annulé", classe: "bg-brand-100 text-brand-500" },
  { valeur: "absent", libelle: "Absente", classe: "bg-red-50 text-red-700" },
] as const;

const vierge = {
  cliente_id: "",
  date_rdv: "",
  heure_rdv: "",
  duree_min: "",
  soin_id: "",
  notes: "",
  remplace: "",
};

export default function Agenda({
  rdvs,
  clientes,
  soins,
  jour,
}: {
  rdvs: RdvAffiche[];
  clientes: Pick<Cliente, "id" | "nom_complet" | "telephone">[];
  soins: SoinCatalogue[];
  jour: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState({ ...vierge, date_rdv: jour });
  const [filtre, setFiltre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  // Identifie le bouton précis en attente : sans cela, tous les statuts de
  // tous les rendez-vous s'afficheraient occupés pour un seul clic.
  const [enAttente, setEnAttente] = useState<string | null>(null);
  // Rendez-vous en cours d'effacement : ils restent affichés le temps de
  // l'animation, sinon ils disparaîtraient d'un coup au rafraîchissement.
  const [sortants, setSortants] = useState<string[]>([]);

  const effacer = (id: string, apres: () => void) => {
    setSortants((s) => [...s, id]);
    setTimeout(() => {
      apres();
      router.refresh();
    }, DUREE_SORTIE);
  };

  const maj = (cle: keyof typeof vierge, v: string) =>
    setSaisie((p) => ({ ...p, [cle]: v }));

  /**
   * Reprogrammation après une annulation ou une absence.
   *
   * Crée un nouveau rendez-vous pré-rempli au lieu de modifier l'ancien :
   * celui-ci garde son statut, sans quoi le taux d'absence s'effacerait à
   * mesure qu'on reprogramme.
   */
  const reprogrammer = (r: RdvAffiche) => {
    setSaisie({
      cliente_id: r.clientes?.id ?? "",
      date_rdv: "",
      heure_rdv: r.heure_rdv?.slice(0, 5) ?? "",
      duree_min: r.duree_min?.toString() ?? "",
      soin_id: r.soin_id ?? "",
      notes: r.notes ?? "",
      remplace: r.id,
    });
    setFiltre("");
    setErreur(null);
    setOuvert(true);
  };

  const normalise = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const chiffres = (s: string) => s.replace(/\D/g, "");

  // Recherche insensible aux accents, et comparant les chiffres seuls pour le
  // téléphone : « Zoe » trouve « Zoé », « 07 09 » trouve « +2250709... ».
  const requete = normalise(filtre.trim());
  const requeteChiffres = chiffres(filtre);
  const visibles = !requete
    ? []
    : clientes
        .filter((c) => {
          const nom = normalise(c.nom_complet);
          return (
            nom.includes(requete) ||
            (requeteChiffres.length >= 3 &&
              chiffres(c.telephone).includes(requeteChiffres))
          );
        })
        .slice(0, 20);

  const choisie = clientes.find((c) => c.id === saisie.cliente_id);

  return (
    <>
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setSaisie({ ...vierge, date_rdv: jour });
            setFiltre("");
            setErreur(null);
            setOuvert((v) => !v);
          }}
          className="h-touch rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
        >
          {ouvert ? "Fermer" : "Nouveau rendez-vous"}
        </button>
      </div>

      {ouvert && (
        <div className="mb-8 rounded-2xl border-2 border-brand-200 bg-white p-6">
          {saisie.remplace && (
            <p className="mb-5 rounded-xl bg-or-400/10 px-4 py-3 text-sm text-brand-700">
              Reprogrammation. Le rendez-vous d&apos;origine disparaîtra de
              l&apos;agenda une fois celui-ci enregistré, mais restera compté
              dans les statistiques.
            </p>
          )}
          <Champ label="Cliente" requis>
            {choisie ? (
              <div className="flex h-touch items-center justify-between rounded-xl border-2 border-brand-600 bg-brand-50 px-4">
                <span className="font-medium text-brand-800">
                  {choisie.nom_complet}
                </span>
                <button
                  type="button"
                  onClick={() => maj("cliente_id", "")}
                  className="text-sm text-brand-600 hover:underline"
                >
                  Changer
                </button>
              </div>
            ) : (
              <>
                <Texte
                  valeur={filtre}
                  onChange={setFiltre}
                  placeholder="Tapez un nom ou un numéro"
                />
                <div className="mt-2 space-y-2">
                  {visibles.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => maj("cliente_id", c.id)}
                      className="flex h-touch w-full items-center justify-between rounded-xl border border-brand-200 px-4 text-left hover:border-brand-400"
                    >
                      <span className="font-medium text-brand-800">
                        {c.nom_complet}
                      </span>
                      <span className="text-sm text-brand-400">{c.telephone}</span>
                    </button>
                  ))}
                  {requete && visibles.length === 0 && (
                    <p className="py-3 text-center text-sm text-brand-400">
                      Aucune cliente trouvée.{" "}
                      <Link href="/fiche/nouvelle" className="text-brand-600 underline">
                        Créer une fiche
                      </Link>
                    </p>
                  )}
                </div>
              </>
            )}
          </Champ>

          <div className="grid gap-4 sm:grid-cols-3">
            <Champ label="Date" requis>
              <DateFr valeur={saisie.date_rdv} onChange={(v) => maj("date_rdv", v)} />
            </Champ>
            <Champ label="Heure">
              <HeureFr valeur={saisie.heure_rdv} onChange={(v) => maj("heure_rdv", v)} />
            </Champ>
            <Champ label="Durée (min)">
              <Texte
                type="number"
                valeur={saisie.duree_min}
                onChange={(v) => maj("duree_min", v)}
              />
            </Champ>
          </div>

          <Champ label="Soin prévu">
            <select
              value={saisie.soin_id}
              onChange={(e) => maj("soin_id", e.target.value)}
              className="h-touch w-full rounded-xl border border-brand-200 bg-white px-4 text-lg"
            >
              <option value="">À définir</option>
              {soins.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </Champ>

          <Champ label="Notes">
            <Paragraphe valeur={saisie.notes} onChange={(v) => maj("notes", v)} />
          </Champ>

          {erreur && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
              {erreur}
            </p>
          )}

          <button
            type="button"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const remplace = saisie.remplace;
                const r = await enregistrerRdv(saisie);
                if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
                setOuvert(false);
                // L'original s'efface en douceur plutôt que de disparaître
                // brutalement : on doit voir lequel s'en va.
                if (remplace) effacer(remplace, () => {});
                else router.refresh();
              })
            }
            className="flex h-touch w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {enCours && <Rouet />}
            {enCours ? "Enregistrement…" : "Enregistrer le rendez-vous"}
          </button>
        </div>
      )}

      {rdvs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-200 p-10 text-center text-brand-400">
          Aucun rendez-vous ce jour.
        </p>
      ) : (
        <ul className="space-y-3">
          {rdvs.map((r) => (
            <li
              key={r.id}
              className={`overflow-hidden rounded-2xl border border-brand-100 bg-white p-5 transition-all duration-[450ms] ease-out ${
                sortants.includes(r.id)
                  ? "max-h-0 -translate-x-6 scale-95 border-0 p-0 opacity-0"
                  : "max-h-[40rem] opacity-100"
              }`}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-brand-800">
                    {r.heure_rdv ? r.heure_rdv.slice(0, 5) : "Heure à définir"}
                    {" — "}
                    {r.clientes ? (
                      <Link href={`/clientes/${r.clientes.id}`} className="hover:underline">
                        {r.clientes.nom_complet}
                      </Link>
                    ) : (
                      "Cliente inconnue"
                    )}
                  </p>
                  <p className="text-sm text-brand-400">
                    {[
                      r.soins_catalogue?.libelle,
                      r.duree_min && `${r.duree_min} min`,
                      r.clientes?.telephone,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.notes && <p className="mt-1 text-sm text-brand-700">{r.notes}</p>}
                </div>
                <span className="flex shrink-0 gap-2">
                  {r.remise && (
                    <span className="rounded-full bg-or-400/20 px-3 py-1 text-sm font-medium text-brand-700">
                      🎁 {r.remise}e séance — {REMISE_POURCENT} %
                    </span>
                  )}
                  {r.alertes > 0 && (
                    <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                      {r.alertes} alerte{r.alertes > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {STATUTS.map((s) => {
                  const cle = `${r.id}:${s.valeur}`;
                  return (
                    <button
                      key={s.valeur}
                      type="button"
                      aria-pressed={r.statut === s.valeur}
                      disabled={enCours}
                      onClick={() => {
                        setEnAttente(cle);
                        demarrer(async () => {
                          await changerStatut(r.id, s.valeur);
                          router.refresh();
                          setEnAttente(null);
                        });
                      }}
                      className={`flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
                        r.statut === s.valeur
                          ? s.classe
                          : "border border-brand-200 text-brand-500 hover:bg-brand-50"
                      }`}
                    >
                      {enAttente === cle && <Rouet />}
                      {s.libelle}
                    </button>
                  );
                })}
                {r.clientes && r.statut === "prevu" && (
                  <Link
                    href={`/seances/nouvelle?cliente=${r.clientes.id}&rdv=${r.id}`}
                    className="flex h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Saisir la séance
                  </Link>
                )}
                {r.clientes && (r.statut === "annule" || r.statut === "absent") && (
                  <>
                    <button
                      type="button"
                      onClick={() => reprogrammer(r)}
                      className="flex h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      Reprogrammer
                    </button>
                    {/* Pour les annulations reprogrammées à la main, avant que
                        le bouton ci-dessus n'existe : elles n'ont aucun lien
                        vers leur remplaçant et resteraient affichées. */}
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() =>
                        effacer(r.id, () => {
                          demarrer(async () => {
                            await masquerRdv(r.id, true);
                          });
                        })
                      }
                      className="flex h-11 items-center rounded-lg border border-brand-200 px-4 text-sm font-medium text-brand-500 hover:bg-brand-50 disabled:opacity-60"
                    >
                      Retirer de l&apos;agenda
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
