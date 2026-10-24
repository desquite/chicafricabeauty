import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { alertes, type Anamnese, type Cliente, type SoinCatalogue } from "@/lib/types";
import { ouvreDroit, rangSeance } from "@/lib/fidelite";
import { pastillesAbonnees } from "@/lib/abonnements-lecture";
import Agenda, { type RdvAffiche } from "./agenda";
import { NavigationJour, NavigationMois, NavigationSemaine, OngletsVues } from "./navigation";
import { VueSemaine, type FermetureSemaine, type HoraireSemaine } from "./vue-semaine";
import { VueMois, type JourDuMois } from "./vue-mois";
import { VueAvenir } from "./vue-avenir";

export const metadata = { title: "Rendez-vous — Chic Africa Beauty Online" };

const CHAMPS_RDV =
  "id, date_rdv, heure_rdv, duree_min, statut, notes, soin_id, source, acompte_montant, acompte_paye_le, acompte_requis, created_at, annulation_motif, code_acompte, clientes(id, nom_complet, telephone), soins_catalogue(libelle, duree_std)";

/** Dernier jour du mois, au format ISO. */
function finDeMois(mois: string) {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

function plusJours(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine d'une date : la semaine de l'institut commence le lundi. */
function lundiDe(iso: string) {
  const jourSemaine = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return plusJours(iso, -((jourSemaine + 6) % 7));
}

export default async function PageRendezVous({
  searchParams,
}: {
  searchParams: Promise<{
    jour?: string;
    mois?: string;
    vue?: string;
    cliente?: string;
    semaine?: string;
    heure?: string;
  }>;
}) {
  await requireProfil();
  const params = await searchParams;
  const supabase = await createClient();
  // Un seul instant de référence pour toute la page : deux appels séparés
  // pourraient tomber de part et d'autre de minuit.
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  // La semaine en colonnes horaires est la vue par défaut : ce qui est pris,
  // libre ou fermé s'y voit d'un coup d'œil. Le mois reste à un onglet.
  const vue = params.jour
    ? "jour"
    : params.vue === "avenir"
      ? "avenir"
      : params.mois || params.vue === "mois"
        ? "mois"
        : "semaine";
  const jour = params.jour ?? aujourdhui;
  const mois = params.mois ?? jour.slice(0, 7);
  const lundi = lundiDe(params.semaine && /^\d{4}-\d{2}-\d{2}$/.test(params.semaine) ? params.semaine : aujourdhui);

  const debut =
    vue === "jour" ? jour : vue === "mois" ? `${mois}-01` : vue === "semaine" ? lundi : aujourdhui;
  const fin =
    vue === "jour"
      ? jour
      : vue === "mois"
        ? finDeMois(mois)
        : vue === "semaine"
          ? plusJours(lundi, 6)
          : new Date(maintenant.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  // Un rendez-vous reprogrammé n'a plus rien à faire dans l'agenda : il a été
  // remplacé. Il reste en base et continue d'alimenter le taux d'absence.
  let requete = supabase
    .from("rendez_vous")
    .select(CHAMPS_RDV)
    .is("remplace_par", null)
    .is("masque_le", null)
    .gte("date_rdv", debut)
    .lte("date_rdv", fin)
    .order("date_rdv")
    .order("heure_rdv", { nullsFirst: false });
  if (vue === "avenir") requete = requete.eq("statut", "prevu");

  const [{ data: rdvs, error }, { data: clientes }, { data: soins }] =
    await Promise.all([
      requete.returns<Omit<RdvAffiche, "alertes">[]>(),
      supabase
        .from("clientes")
        .select("id, nom_complet, telephone")
        .eq("actif", true)
        .order("nom_complet")
        .returns<Pick<Cliente, "id" | "nom_complet" | "telephone">[]>(),
      supabase
        .from("soins_catalogue")
        .select("*")
        .eq("actif", true)
        .order("ordre")
        .returns<SoinCatalogue[]>(),
    ]);

  if (error) throw new Error(`Lecture des rendez-vous impossible : ${error.message}`);

  // Contre-indications des clientes concernées, en une seule requête.
  const ids = [
    ...new Set((rdvs ?? []).map((r) => r.clientes?.id).filter((v): v is string => Boolean(v))),
  ];
  const [{ data: bilans }, { data: venues }] = ids.length
    ? await Promise.all([
        supabase
          .from("anamneses_courantes")
          .select("*")
          .in("cliente_id", ids)
          .returns<Anamnese[]>(),
        // Séances déjà faites par ces clientes : la venue à venir est-elle
        // une 5e, une 10e ? La gérante doit le savoir avant l'arrivée.
        supabase
          .from("seances")
          .select("cliente_id")
          .in("cliente_id", ids)
          .is("abonnement_id", null)
          .returns<{ cliente_id: string }[]>(),
      ])
    : [{ data: [] as Anamnese[] }, { data: [] as { cliente_id: string }[] }];

  const seancesParCliente = new Map<string, number>();
  for (const v of venues ?? []) {
    seancesParCliente.set(v.cliente_id, (seancesParCliente.get(v.cliente_id) ?? 0) + 1);
  }

  /** Rang de la venue si elle ouvre droit à la remise, sinon null. */
  const remiseDe = (clienteId?: string) => {
    if (!clienteId) return null;
    const rang = rangSeance(seancesParCliente.get(clienteId) ?? 0);
    return ouvreDroit(rang) ? rang : null;
  };

  const nbAlertes = (clienteId?: string) =>
    clienteId
      ? alertes((bilans ?? []).find((b) => b.cliente_id === clienteId) ?? null).length
      : 0;

  const abonnees = await pastillesAbonnees(supabase, ids);
  const enrichis: RdvAffiche[] = (rdvs ?? []).map((r) => {
    const abonnee = r.clientes ? (abonnees.get(r.clientes.id) ?? null) : null;
    return {
      ...r,
      alertes: nbAlertes(r.clientes?.id),
      // Une abonnée n'a pas de remise fidélité sur ses séances d'abonnement.
      remise: abonnee ? null : remiseDe(r.clientes?.id),
      abonnee,
    };
  });

  // Compteurs par jour pour la grille mensuelle. Les annulés sont comptés à
  // part : les inclure gonflerait artificiellement une journée vide.
  const parJour = new Map<string, JourDuMois>();
  for (const r of enrichis) {
    const c = parJour.get(r.date_rdv) ?? {
      jour: r.date_rdv,
      total: 0,
      annules: 0,
      alertes: false,
    };
    if (r.statut === "annule") c.annules += 1;
    else c.total += 1;
    if (r.alertes > 0 && r.statut !== "annule") c.alertes = true;
    parJour.set(r.date_rdv, c);
  }

  // Horaires et fermetures : la semaine grise ce qui n'est pas réservable.
  const [horaires, fermetures] =
    vue === "semaine"
      ? await Promise.all([
          supabase
            .from("horaires_semaine")
            .select("jour, ouvert, ouverture, fermeture")
            .returns<HoraireSemaine[]>(),
          supabase
            .from("fermetures")
            .select("date_debut, date_fin, heure_debut, heure_fin, motif")
            .lte("date_debut", fin)
            .gte("date_fin", debut)
            .returns<FermetureSemaine[]>(),
        ])
      : [{ data: [] as HoraireSemaine[] }, { data: [] as FermetureSemaine[] }];

  return (
    <div className={`mx-auto ${vue === "semaine" ? "max-w-7xl" : "max-w-4xl"}`}>
      <header className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-brand-800">Rendez-vous</h1>
          <Link
            href="/rendez-vous/disponibilites"
            className="flex h-touch items-center rounded-xl border border-brand-200 bg-white px-5 font-medium text-brand-700 hover:bg-brand-50"
          >
            Disponibilités
          </Link>
        </div>
        <OngletsVues vue={vue} jour={jour} />
        {vue === "jour" && <NavigationJour jour={jour} />}
        {vue === "mois" && <NavigationMois mois={mois} />}
        {vue === "semaine" && <NavigationSemaine lundi={lundi} />}
      </header>

      {vue === "semaine" && (
        <VueSemaine
          lundi={lundi}
          aujourdhui={aujourdhui}
          rdvs={enrichis}
          horaires={horaires.data ?? []}
          fermetures={fermetures.data ?? []}
          minuteActuelle={maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes()}
        />
      )}
      {vue === "mois" && (
        <VueMois mois={mois} jours={parJour} aujourdhui={aujourdhui} />
      )}
      {vue === "avenir" && <VueAvenir rdvs={enrichis} aujourdhui={aujourdhui} />}
      {vue === "jour" && (
        <Agenda
          rdvs={enrichis}
          clientes={clientes ?? []}
          soins={soins ?? []}
          jour={jour}
          clienteOuverte={params.cliente ?? null}
          heureOuverte={params.heure ?? null}
        />
      )}
    </div>
  );
}
