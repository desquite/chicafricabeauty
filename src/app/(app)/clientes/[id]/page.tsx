import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  age,
  alertes,
  ETAT_PEAU,
  EVOLUTION,
  EXPOSITION_UV,
  HYDRATATION,
  PRIORITES,
  type Anamnese,
  type Cliente,
  type Consentement,
  type Seance,
} from "@/lib/types";
import {
  etiquetteRemise,
  ouvreDroit,
  PAS_FIDELITE,
  rangSeance,
  REMISE_POURCENT,
} from "@/lib/fidelite";

const dateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

const libelle = (
  options: readonly { valeur: string; libelle: string }[],
  v: string | null,
) => options.find((o) => o.valeur === v)?.libelle ?? "—";

const ouiNon = (v: boolean | null) => (v === null ? "—" : v ? "Oui" : "Non");

export default async function PageFicheCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfil();
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle<Cliente>();
  if (!cliente) notFound();

  const [{ data: bilan }, { data: consentements }, { data: seances }] =
    await Promise.all([
      supabase
        .from("anamneses_courantes")
        .select("*")
        .eq("cliente_id", id)
        .maybeSingle<Anamnese>(),
      supabase
        .from("consentements")
        .select("*")
        .eq("cliente_id", id)
        .order("signe_le", { ascending: false })
        .returns<Consentement[]>(),
      supabase
        .from("seances")
        .select("*")
        .eq("cliente_id", id)
        .order("date_seance", { ascending: false })
        .returns<Seance[]>(),
    ]);

  const listeAlertes = alertes(bilan ?? null);
  // Fidélité : rang de la prochaine venue, et nombre de séances restant avant
  // la remise suivante. Annoncé même quand elle n'est pas encore due — c'est
  // ce qui donne envie de revenir.
  const rangProchaine = rangSeance(seances?.length ?? 0);
  const remiseDue = ouvreDroit(rangProchaine);
  const avantRemise = PAS_FIDELITE - ((rangProchaine - 1) % PAS_FIDELITE);
  const dernier = (nature: "soin" | "photo") =>
    (consentements ?? []).find((c) => c.nature === nature) ?? null;
  const photo = dernier("photo");
  const ans = age(cliente.date_naissance);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/clientes" className="mb-4 inline-block text-sm text-brand-500 hover:underline">
        ← Toutes les clientes
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold text-brand-800">
            {cliente.nom_complet}
            {!cliente.actif && (
              <span className="ml-3 rounded-full bg-brand-100 px-3 py-1 align-middle text-sm font-medium text-brand-500">
                Archivée
              </span>
            )}
          </h1>
          <p className="mt-1 text-brand-400">
            {cliente.telephone}
            {ans !== null && ` · ${ans} ans`}
            {cliente.profession && ` · ${cliente.profession}`}
            {cliente.email && ` · ${cliente.email}`}
          </p>
        </div>
        <Link
          href={`/fiche/${cliente.id}/identite`}
          className="flex h-11 shrink-0 items-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Modifier
        </Link>
      </header>

      {cliente.notes && (
        <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-brand-400 uppercase">
            Notes internes
          </h2>
          <p className="whitespace-pre-line text-brand-800">{cliente.notes}</p>
        </section>
      )}

      {/* Les contre-indications passent avant tout le reste : c'est la seule
          information qu'il serait grave de manquer avant un soin. */}
      {listeAlertes.length > 0 && (
        <section className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 p-5">
          <h2 className="mb-3 font-semibold text-red-800">
            À vérifier avant tout soin
          </h2>
          <ul className="space-y-2">
            {listeAlertes.map((a) => (
              <li key={a} className="flex items-start gap-2 text-red-800">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden="true" />
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      {remiseDue && (
        <section className="mb-6 rounded-2xl border-2 border-or-400 bg-or-400/10 p-5">
          <h2 className="font-semibold text-brand-800">
            🎁 Prochaine venue : {etiquetteRemise(rangProchaine)}
          </h2>
          <p className="mt-1 text-brand-700">
            {REMISE_POURCENT} % sur un soin ou sur un produit, au choix de la
            cliente. À indiquer pendant la saisie de la séance.
          </p>
        </section>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link
          href={`/seances/nouvelle?cliente=${cliente.id}`}
          className="flex h-touch items-center justify-center rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700"
        >
          Nouvelle séance
        </Link>
        <Link
          href={`/fiche/${cliente.id}/sante`}
          className="flex h-touch items-center justify-center rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
        >
          Mettre à jour le bilan santé
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-6">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold text-brand-800">Bilan santé</h2>
          <span className="text-sm text-brand-400">
            {bilan ? `Mis à jour le ${dateFr(bilan.date_maj)}` : "Jamais renseigné"}
          </span>
        </div>

        {bilan ? (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Ligne t="Allergies" v={bilan.allergies ?? "—"} />
            <Ligne
              t="Traitement en cours"
              v={
                bilan.traitement_en_cours
                  ? bilan.traitement_detail || "Oui"
                  : ouiNon(bilan.traitement_en_cours)
              }
            />
            <Ligne t="Grossesse / allaitement" v={ouiNon(bilan.grossesse_allaitement)} />
            <Ligne t="Lentilles de contact" v={ouiNon(bilan.port_lentilles)} />
            <Ligne t="Implants / pacemaker" v={ouiNon(bilan.implants_pacemaker)} />
            <Ligne
              t="Injections ou laser récents"
              v={
                bilan.injections_recentes
                  ? bilan.injections_detail || "Oui"
                  : ouiNon(bilan.injections_recentes)
              }
            />
            <Ligne t="Fumeuse" v={ouiNon(bilan.fumeur)} />
            <Ligne t="Exposition UV" v={libelle(EXPOSITION_UV, bilan.exposition_uv)} />
            <Ligne t="Hydratation" v={libelle(HYDRATATION, bilan.hydratation)} />
            <Ligne
              t="Priorités"
              v={
                bilan.priorites?.length
                  ? bilan.priorites.map((p) => libelle(PRIORITES, p)).join(", ")
                  : "—"
              }
            />
            <div className="sm:col-span-2">
              <Ligne t="Routine actuelle" v={bilan.routine_actuelle ?? "—"} />
            </div>
          </dl>
        ) : (
          <p className="text-brand-400">
            Aucun bilan enregistré. Utilisez le bouton ci-dessus pour le saisir.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-brand-800">Consentements</h2>
        <ul className="space-y-3">
          <li className="flex items-center justify-between gap-4">
            <span className="text-brand-800">Soins esthétiques</span>
            <Etat accepte={dernier("soin")?.accepte ?? null} date={dernier("soin")?.signe_le} />
          </li>
          <li className="flex items-center justify-between gap-4">
            <span className="text-brand-800">Photographies de suivi</span>
            <Etat accepte={photo?.accepte ?? null} date={photo?.signe_le} />
          </li>
        </ul>
        {photo && !photo.accepte && (
          <p className="mt-4 rounded-xl bg-or-400/10 px-4 py-3 text-sm text-brand-700">
            Cette cliente refuse les photographies. Ne pas en prendre pendant les
            séances.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-brand-100 bg-white p-6">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold text-brand-800">Historique des séances</h2>
          <span className="text-sm text-brand-400">
            {seances?.length ?? 0} séance{(seances?.length ?? 0) > 1 ? "s" : ""}
            {!remiseDue &&
              ` · remise dans ${avantRemise} séance${avantRemise > 1 ? "s" : ""}`}
          </span>
        </div>

        {!seances || seances.length === 0 ? (
          <p className="text-brand-400">Aucune séance enregistrée.</p>
        ) : (
          <ol className="space-y-3">
            {seances.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/seances/${s.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-brand-100 p-4 hover:bg-brand-50"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-brand-800">
                      {dateFr(s.date_seance)}
                    </span>
                    <span className="block text-sm text-brand-400">
                      {libelle(EVOLUTION, s.evolution)}
                      {s.etat_peau && ` · ${libelle(ETAT_PEAU, s.etat_peau)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    {s.remise_palier && (
                      <span className="rounded-full bg-or-400/20 px-3 py-1 text-xs font-medium text-brand-700">
                        🎁 {s.remise_palier}e
                      </span>
                    )}
                    {s.incident && (
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                        Incident
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Ligne({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-sm text-brand-400">{t}</dt>
      <dd className="text-brand-800">{v}</dd>
    </div>
  );
}

function Etat({ accepte, date }: { accepte: boolean | null; date?: string }) {
  if (accepte === null)
    return <span className="text-sm text-brand-400">Non recueilli</span>;
  return (
    <span className="text-right">
      <span
        className={`rounded-full px-3 py-1 text-sm font-medium ${
          accepte ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
        }`}
      >
        {accepte ? "Accepté" : "Refusé"}
      </span>
      <span className="ml-2 text-sm text-brand-400">{dateFr(date ?? null)}</span>
    </span>
  );
}
