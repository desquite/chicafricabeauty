import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  DELAIS,
  ETAT_PEAU,
  EVOLUTION,
  OBSERVATIONS_PEAU,
  REACTIONS,
  TYPE_PEAU,
  TYPE_VENUE,
  ZONES,
  type Cliente,
  type Seance,
} from "@/lib/types";
import Photos, { type PhotoAffichee } from "./photos";

const dateFr = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

const lib = (
  options: readonly { valeur: string; libelle: string }[],
  v: string | null,
) => options.find((o) => o.valeur === v)?.libelle ?? "—";

const libs = (
  options: readonly { valeur: string; libelle: string }[],
  v: string[] | null,
) => (v?.length ? v.map((x) => lib(options, x)).join(", ") : "—");

export default async function PageSeance({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfil();
  const { id } = await params;
  const supabase = await createClient();

  const { data: seance } = await supabase
    .from("seances")
    .select("*, clientes(id, nom, prenoms, telephone), profiles(nom)")
    .eq("id", id)
    .maybeSingle<
      Seance & {
        clientes: Pick<Cliente, "id" | "nom" | "prenoms" | "telephone"> | null;
        profiles: { nom: string } | null;
      }
    >();
  if (!seance) notFound();

  const [{ data: soins }, { data: photos }, { data: consentement }] =
    await Promise.all([
      supabase
        .from("seance_soins")
        .select("soins_catalogue(libelle)")
        .eq("seance_id", id)
        .returns<{ soins_catalogue: { libelle: string } | null }[]>(),
      supabase
        .from("photos")
        .select("id, moment, storage_path, prise_le")
        .eq("seance_id", id)
        .order("prise_le")
        .returns<
          { id: string; moment: "avant" | "apres"; storage_path: string; prise_le: string }[]
        >(),
      supabase
        .from("consentements")
        .select("accepte")
        .eq("cliente_id", seance.cliente_id)
        .eq("nature", "photo")
        .order("signe_le", { ascending: false })
        .limit(1)
        .maybeSingle<{ accepte: boolean }>(),
    ]);

  const libellesSoins = (soins ?? [])
    .map((s) => s.soins_catalogue?.libelle)
    .filter(Boolean)
    .join(", ");

  // Bucket privé : chaque vignette passe par une URL signée, générée ici et
  // valable une heure. Rien n'est jamais exposé publiquement.
  const chemins = (photos ?? []).map((p) => p.storage_path);
  const { data: urls } = chemins.length
    ? await supabase.storage.from("photos-soins").createSignedUrls(chemins, 3600)
    : { data: [] };

  const parChemin = new Map(
    (urls ?? []).map((u) => [u.path ?? "", u.signedUrl]),
  );
  const photosAffichees: PhotoAffichee[] = (photos ?? [])
    .map((p) => ({
      id: p.id,
      moment: p.moment,
      prise_le: p.prise_le,
      url: parChemin.get(p.storage_path) ?? "",
    }))
    .filter((p) => p.url !== "");

  return (
    <div className="mx-auto max-w-3xl">
      {seance.clientes && (
        <Link
          href={`/clientes/${seance.clientes.id}`}
          className="mb-4 inline-block text-sm text-brand-500 hover:underline"
        >
          ← Fiche de {seance.clientes.prenoms} {seance.clientes.nom}
        </Link>
      )}

      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-800">
          {seance.clientes
            ? `${seance.clientes.prenoms} ${seance.clientes.nom}`
            : "Séance"}
        </h1>
        <p className="mt-1 text-brand-400">
          {dateFr(seance.date_seance)} · {lib(TYPE_VENUE, seance.type_venue)}
          {seance.profiles && ` · ${seance.profiles.nom}`}
        </p>
      </header>

      {seance.incident && (
        <section className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 p-5">
          <h2 className="mb-2 font-semibold text-red-800">Incident signalé</h2>
          <p className="text-red-800">{seance.incident}</p>
        </section>
      )}

      <Bloc titre="Diagnostic de la peau">
        <Ligne t="Type de peau" v={lib(TYPE_PEAU, seance.type_peau)} />
        <Ligne t="État de la peau" v={lib(ETAT_PEAU, seance.etat_peau)} />
        <Ligne
          t="Observations"
          v={libs(OBSERVATIONS_PEAU, seance.observations_peau)}
          large
        />
      </Bloc>

      <Bloc titre="Soin réalisé">
        <Ligne t="Soins" v={libellesSoins || "—"} large />
        <Ligne t="Zones traitées" v={libs(ZONES, seance.zones)} />
        <Ligne
          t="Durée"
          v={seance.duree_min ? `${seance.duree_min} min` : "—"}
        />
        <Ligne t="Produits utilisés" v={seance.produits_utilises ?? "—"} large />
        <Ligne t="Appareil" v={seance.appareil ?? "—"} />
      </Bloc>

      <Bloc titre="Observations">
        <Ligne t="Réaction pendant le soin" v={libs(REACTIONS, seance.reactions)} />
        <Ligne t="Évolution" v={lib(EVOLUTION, seance.evolution)} />
        <Ligne t="Notes de la praticienne" v={seance.observations ?? "—"} large />
      </Bloc>

      <Bloc titre="Suite à donner">
        <Ligne t="Conseils donnés" v={seance.conseils ?? "—"} large />
        <Ligne t="Programme recommandé" v={seance.programme ?? "—"} large />
        <Ligne t="Produits conseillés" v={seance.produits_conseilles ?? "—"} large />
        <Ligne t="Délai recommandé" v={lib(DELAIS, seance.delai_recommande)} />
        <Ligne
          t="Prochain rendez-vous"
          v={seance.prochain_rdv ? dateFr(seance.prochain_rdv) : "—"}
        />
      </Bloc>

      <Photos
        seanceId={seance.id}
        photos={photosAffichees}
        consentement={consentement?.accepte ?? null}
      />
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold text-brand-800">{titre}</h2>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Ligne({ t, v, large }: { t: string; v: string; large?: boolean }) {
  return (
    <div className={large ? "sm:col-span-2" : undefined}>
      <dt className="text-sm text-brand-400">{t}</dt>
      <dd className="whitespace-pre-line text-brand-800">{v}</dd>
    </div>
  );
}
