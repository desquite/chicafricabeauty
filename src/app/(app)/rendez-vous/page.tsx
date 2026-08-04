import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { alertes, type Anamnese, type Cliente, type SoinCatalogue } from "@/lib/types";
import Agenda, { type RdvAffiche } from "./agenda";
import { NavigationJour, NavigationMois } from "./navigation";
import { VueMois, type JourDuMois } from "./vue-mois";
import { VueAvenir } from "./vue-avenir";

export const metadata = { title: "Rendez-vous — Chic Africa Beauty Online" };

const CHAMPS_RDV =
  "id, date_rdv, heure_rdv, duree_min, statut, notes, soin_id, clientes(id, nom_complet, telephone), soins_catalogue(libelle)";

/** Dernier jour du mois, au format ISO. */
function finDeMois(mois: string) {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export default async function PageRendezVous({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string; mois?: string; vue?: string }>;
}) {
  await requireProfil();
  const params = await searchParams;
  const supabase = await createClient();
  // Un seul instant de référence pour toute la page : deux appels séparés
  // pourraient tomber de part et d'autre de minuit.
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  // Le mois est la vue par défaut : elle donne le nombre de rendez-vous de
  // chaque jour d'un coup d'œil, ce que la vue jour ne permettait pas.
  const vue = params.jour ? "jour" : params.vue === "avenir" ? "avenir" : "mois";
  const jour = params.jour ?? aujourdhui;
  const mois = params.mois ?? jour.slice(0, 7);

  const debut = vue === "jour" ? jour : vue === "mois" ? `${mois}-01` : aujourdhui;
  const fin =
    vue === "jour"
      ? jour
      : vue === "mois"
        ? finDeMois(mois)
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
  const { data: bilans } = ids.length
    ? await supabase
        .from("anamneses_courantes")
        .select("*")
        .in("cliente_id", ids)
        .returns<Anamnese[]>()
    : { data: [] as Anamnese[] };

  const nbAlertes = (clienteId?: string) =>
    clienteId
      ? alertes((bilans ?? []).find((b) => b.cliente_id === clienteId) ?? null).length
      : 0;

  const enrichis: RdvAffiche[] = (rdvs ?? []).map((r) => ({
    ...r,
    alertes: nbAlertes(r.clientes?.id),
  }));

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

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-brand-800">Rendez-vous</h1>
        {vue === "jour" && <NavigationJour jour={jour} />}
        {vue === "mois" && <NavigationMois mois={mois} />}
      </header>

      {vue === "mois" && (
        <VueMois mois={mois} jours={parJour} aujourdhui={aujourdhui} />
      )}
      {vue === "avenir" && <VueAvenir rdvs={enrichis} aujourdhui={aujourdhui} />}
      {vue === "jour" && (
        <Agenda rdvs={enrichis} clientes={clientes ?? []} soins={soins ?? []} jour={jour} />
      )}
    </div>
  );
}
