import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Anneau,
  BarresHorizontales,
  BarresMois,
  Bloc,
  Chiffre,
  Vide,
} from "@/components/graphiques";
import {
  classementSoins,
  clientesActives,
  debutPeriode,
  dureeMoyenne,
  evolutionParSoin,
  evolutions,
  fidelite,
  parMois,
  PERIODES,
  repartitionCategories,
  repartitionListe,
  securite,
  SEUIL,
  tauxRendezVous,
  type Periode,
  type RdvStat,
  type SeanceStat,
} from "@/lib/stats";
import { EVOLUTION, REACTIONS, ZONES } from "@/lib/types";

export const metadata = { title: "Statistiques — Chic Africa Beauty Online" };

type LigneSeance = Omit<SeanceStat, "soins"> & {
  soins: { soins_catalogue: { libelle: string; categorie: string | null } | null }[];
};

export default async function PageStatistiques({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  await requireProfil();
  const params = await searchParams;
  const periode = (PERIODES.find((p) => p.valeur === params.periode)?.valeur ??
    "12m") as Periode;
  const debut = debutPeriode(periode);

  const supabase = await createClient();

  let requeteSeances = supabase
    .from("seances")
    .select(
      "id, cliente_id, date_seance, type_venue, duree_min, evolution, incident, reactions, zones, delai_recommande, soins:seance_soins(soins_catalogue(libelle, categorie))",
    )
    .order("date_seance");
  if (debut) requeteSeances = requeteSeances.gte("date_seance", debut);

  let requeteRdv = supabase.from("rendez_vous").select("statut, date_rdv");
  if (debut) requeteRdv = requeteRdv.gte("date_rdv", debut);

  const [{ data: brutes, error }, { data: rdvs }, { count: nbClientes }] =
    await Promise.all([
      requeteSeances.returns<LigneSeance[]>(),
      requeteRdv.returns<RdvStat[]>(),
      supabase.from("clientes").select("*", { count: "exact", head: true }),
    ]);

  if (error) throw new Error(`Lecture des séances impossible : ${error.message}`);

  const seances: SeanceStat[] = (brutes ?? []).map((s) => ({
    ...s,
    soins: s.soins
      .map((x) => x.soins_catalogue)
      .filter((c): c is { libelle: string; categorie: string | null } => Boolean(c)),
  }));

  const assez = seances.length >= SEUIL;
  const mois = parMois(seances, periode === "mois" ? 1 : periode === "3m" ? 3 : 12);
  const soins = classementSoins(seances);
  const rdv = tauxRendezVous(rdvs ?? []);
  const fid = fidelite(seances);
  const evo = evolutions(seances);
  const parSoin = evolutionParSoin(seances);
  const sec = securite(seances);

  const partsEvolution = [...evo.compte.entries()]
    .map(([cle, nb]) => ({
      cle,
      libelle: EVOLUTION.find((e) => e.valeur === cle)?.libelle ?? cle,
      nb,
      part: Math.round((nb / evo.total) * 1000) / 10,
    }))
    .sort((a, b) => b.nb - a.nb);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-800">Statistiques</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {PERIODES.map((p) => (
            <Link
              key={p.valeur}
              href={`/statistiques?periode=${p.valeur}`}
              className={`flex h-11 items-center rounded-lg px-4 text-sm font-medium ${
                p.valeur === periode
                  ? "bg-brand-600 text-white"
                  : "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
              }`}
            >
              {p.libelle}
            </Link>
          ))}
        </div>
      </header>

      {seances.length === 0 && (
        <p className="mb-6 rounded-2xl border border-dashed border-brand-200 p-10 text-center text-brand-400">
          Aucune séance sur cette période. Les statistiques se rempliront au fil
          des saisies.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Chiffre valeur={seances.length} libelle="Séances" />
        <Chiffre valeur={nbClientes ?? 0} libelle="Clientes au fichier" />
        <Chiffre
          valeur={clientesActives(seances)}
          libelle="Clientes actives"
          detail="vues sur 90 jours"
        />
        <Chiffre
          valeur={dureeMoyenne(seances) ? `${dureeMoyenne(seances)} min` : "—"}
          libelle="Durée moyenne"
        />
      </div>

      <Bloc titre="Activité" aide="Séances par mois, dont les premières venues.">
        {seances.length === 0 ? (
          <Vide message="Rien à afficher pour l'instant." />
        ) : (
          <BarresMois mois={mois} />
        )}
      </Bloc>

      <Bloc
        titre="Soins les plus pratiqués"
        aide="Sert à ajuster le stock et la carte de l'institut."
      >
        {soins.length === 0 ? (
          <Vide message="Aucun soin enregistré sur la période." />
        ) : (
          <BarresHorizontales parts={soins} unite="fois" />
        )}
      </Bloc>

      <div className="grid gap-6 md:grid-cols-2">
        <Bloc titre="Par catégorie">
          <Anneau parts={repartitionCategories(seances)} />
        </Bloc>
        <Bloc titre="Zones traitées">
          <Anneau parts={repartitionListe(seances, (s) => s.zones, ZONES)} />
        </Bloc>
      </div>

      <Bloc
        titre="Rendez-vous"
        aide="Calculé sur les rendez-vous passés, hors ceux encore au statut Prévu."
      >
        {rdv.total < SEUIL ? (
          <Vide
            message={`${rdv.total} rendez-vous clôturé${rdv.total > 1 ? "s" : ""} : pas encore assez pour un taux fiable (${SEUIL} minimum).`}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Chiffre valeur={`${rdv.tauxAbsence} %`} libelle="Absences" detail={`${rdv.absent} sur ${rdv.total}`} />
            <Chiffre valeur={`${rdv.tauxAnnulation} %`} libelle="Annulations" detail={`${rdv.annule} sur ${rdv.total}`} />
            <Chiffre valeur={rdv.honore} libelle="Honorés" />
          </div>
        )}
      </Bloc>

      <Bloc
        titre="Fidélité"
        aide="Le taux de non-retour ne compte que les clientes dont la première séance remonte à plus de 60 jours."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Chiffre
            valeur={fid.delaiMoyen !== null ? `${fid.delaiMoyen} j` : "—"}
            libelle="Délai moyen entre 2 séances"
            detail={`${fid.nbEcarts} intervalle${fid.nbEcarts > 1 ? "s" : ""}`}
          />
          <Chiffre
            valeur={
              fid.ecartAuConseil === null
                ? "—"
                : `${fid.ecartAuConseil > 0 ? "+" : ""}${fid.ecartAuConseil} j`
            }
            libelle="Écart au délai conseillé"
            detail={fid.ecartAuConseil === null ? undefined : "positif = retour tardif"}
          />
          <Chiffre
            valeur={fid.eligibles >= SEUIL ? `${fid.tauxNonRetour} %` : "—"}
            libelle="Non-retour"
            detail={
              fid.eligibles >= SEUIL
                ? `${fid.uneSeule} sur ${fid.eligibles}`
                : "pas encore assez de recul"
            }
          />
        </div>
      </Bloc>

      <Bloc
        titre="Résultats constatés"
        aide="Évolutions relevées en séance de suivi. Les premières séances sont exclues, elles n'ont rien à comparer."
      >
        {evo.total < SEUIL ? (
          <Vide
            message={`${evo.total} séance${evo.total > 1 ? "s" : ""} comparable${evo.total > 1 ? "s" : ""} : pas encore assez pour conclure (${SEUIL} minimum).`}
          />
        ) : (
          <>
            <Anneau parts={partsEvolution} />
            <h3 className="mt-8 mb-1 font-semibold text-brand-800">Par soin</h3>
            <p className="mb-4 text-sm text-brand-400">
              Part de séances suivies d&apos;une amélioration, nette ou légère.
            </p>
            <ul className="space-y-3">
              {parSoin.map((s) => (
                <li key={s.libelle} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-brand-800">{s.libelle}</span>
                  <span className="shrink-0 text-sm text-brand-400">
                    {s.nb < SEUIL ? (
                      <>{s.nb} séance{s.nb > 1 ? "s" : ""} — trop peu</>
                    ) : (
                      <>
                        <span className="font-semibold text-brand-700">{s.taux} %</span>{" "}
                        sur {s.nb} séances
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloc>

      <Bloc
        titre="Sécurité"
        aide="Incidents signalés et réactions marquées (rougeur marquée, douleur)."
      >
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Chiffre
            valeur={sec.avecIncident}
            libelle="Séances avec incident"
            detail={assez ? `${sec.tauxIncident} % des séances` : undefined}
          />
          <Chiffre
            valeur={sec.avecReaction}
            libelle="Réactions marquées"
            detail={assez ? `${sec.tauxReaction} % des séances` : undefined}
          />
        </div>
        {seances.length > 0 && (
          <BarresHorizontales
            parts={repartitionListe(seances, (s) => s.reactions, REACTIONS)}
            unite="fois"
          />
        )}
      </Bloc>
    </div>
  );
}
