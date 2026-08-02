import ExcelJS from "exceljs";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ajouterFeuille,
  dateFr,
  libelle,
  libelles,
  ouiNon,
  reponseClasseur,
} from "@/lib/export/classeur";
import {
  age,
  alertes,
  ETAT_PEAU,
  EVOLUTION,
  EXPOSITION_UV,
  HYDRATATION,
  PRIORITES,
  TYPE_PEAU,
  TYPE_VENUE,
  ZONES,
  type Anamnese,
  type Cliente,
  type Consentement,
  type Seance,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type SeanceExport = Seance & {
  soins: { soins_catalogue: { libelle: string } | null }[];
};

/**
 * Fiches clientes complètes.
 *
 * Le client Supabase utilisé ici est celui à session : la RLS s'applique
 * exactement comme dans les écrans. Un export ne doit jamais être une porte
 * dérobée qui contourne les règles d'accès.
 */
export async function GET() {
  await requireProfil();
  const supabase = await createClient();

  const [{ data: clientes }, { data: bilans }, { data: consentements }, { data: seances }] =
    await Promise.all([
      supabase.from("clientes").select("*").order("nom_complet").returns<Cliente[]>(),
      supabase.from("anamneses").select("*").order("date_maj", { ascending: false }).returns<Anamnese[]>(),
      supabase.from("consentements").select("*").order("signe_le", { ascending: false }).returns<Consentement[]>(),
      supabase
        .from("seances")
        .select("*, soins:seance_soins(soins_catalogue(libelle))")
        .order("date_seance", { ascending: false })
        .returns<SeanceExport[]>(),
    ]);

  const parCliente = new Map<string, Anamnese>();
  for (const b of bilans ?? []) if (!parCliente.has(b.cliente_id)) parCliente.set(b.cliente_id, b);

  const dernierConsentement = (id: string, nature: "soin" | "photo") =>
    (consentements ?? []).find((c) => c.cliente_id === id && c.nature === nature) ?? null;

  const seancesDe = (id: string) => (seances ?? []).filter((s) => s.cliente_id === id);
  const nomCliente = new Map((clientes ?? []).map((c) => [c.id, c]));

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Chic Africa Beauty Online";
  classeur.created = new Date();

  // ------------------------------------------------------------ Feuille 1
  ajouterFeuille<Cliente>(
    classeur,
    "Clientes",
    [
      { entete: "Nom & Prénoms", largeur: 30, valeur: (c) => c.nom_complet },
      { entete: "Téléphone", largeur: 18, valeur: (c) => c.telephone },
      { entete: "Email", largeur: 26, valeur: (c) => c.email },
      { entete: "Date de naissance", valeur: (c) => dateFr(c.date_naissance) },
      { entete: "Âge", largeur: 8, valeur: (c) => age(c.date_naissance) },
      { entete: "Profession", largeur: 20, valeur: (c) => c.profession },
      { entete: "Fiche créée le", valeur: (c) => dateFr(c.created_at) },
      { entete: "Statut", largeur: 12, valeur: (c) => (c.actif ? "Active" : "Archivée") },
      { entete: "Nb séances", largeur: 12, valeur: (c) => seancesDe(c.id).length },
      {
        entete: "Dernière séance",
        valeur: (c) => dateFr(seancesDe(c.id)[0]?.date_seance),
      },
      {
        entete: "Prochain RDV",
        valeur: (c) => dateFr(seancesDe(c.id)[0]?.prochain_rdv),
      },
      {
        entete: "Contre-indications",
        largeur: 45,
        valeur: (c) => {
          const liste = alertes(parCliente.get(c.id) ?? null);
          return liste.join(" ; ");
        },
      },
      { entete: "Bilan santé du", valeur: (c) => dateFr(parCliente.get(c.id)?.date_maj) },
      { entete: "Allergies", largeur: 40, valeur: (c) => parCliente.get(c.id)?.allergies ?? "" },
      { entete: "Traitement en cours", valeur: (c) => ouiNon(parCliente.get(c.id)?.traitement_en_cours) },
      { entete: "Détail traitement", largeur: 30, valeur: (c) => parCliente.get(c.id)?.traitement_detail ?? "" },
      { entete: "Grossesse / allaitement", valeur: (c) => ouiNon(parCliente.get(c.id)?.grossesse_allaitement) },
      { entete: "Lentilles", valeur: (c) => ouiNon(parCliente.get(c.id)?.port_lentilles) },
      { entete: "Implants / pacemaker", valeur: (c) => ouiNon(parCliente.get(c.id)?.implants_pacemaker) },
      { entete: "Injections récentes", valeur: (c) => ouiNon(parCliente.get(c.id)?.injections_recentes) },
      { entete: "Détail injections", largeur: 30, valeur: (c) => parCliente.get(c.id)?.injections_detail ?? "" },
      { entete: "Fumeuse", valeur: (c) => ouiNon(parCliente.get(c.id)?.fumeur) },
      { entete: "Exposition UV", valeur: (c) => libelle(EXPOSITION_UV, parCliente.get(c.id)?.exposition_uv) },
      { entete: "Hydratation", valeur: (c) => libelle(HYDRATATION, parCliente.get(c.id)?.hydratation) },
      { entete: "Routine actuelle", largeur: 45, valeur: (c) => parCliente.get(c.id)?.routine_actuelle ?? "" },
      { entete: "Priorités", largeur: 30, valeur: (c) => libelles(PRIORITES, parCliente.get(c.id)?.priorites) },
      {
        entete: "Consentement soin",
        valeur: (c) => {
          const k = dernierConsentement(c.id, "soin");
          return k ? `${k.accepte ? "Accepté" : "Refusé"} le ${dateFr(k.signe_le)}` : "Non recueilli";
        },
        largeur: 24,
      },
      {
        entete: "Consentement photo",
        valeur: (c) => {
          const k = dernierConsentement(c.id, "photo");
          return k ? `${k.accepte ? "Accepté" : "Refusé"} le ${dateFr(k.signe_le)}` : "Non recueilli";
        },
        largeur: 24,
      },
    ],
    clientes ?? [],
  );

  // ------------------------------------------------------------ Feuille 2
  ajouterFeuille<SeanceExport>(
    classeur,
    "Séances par cliente",
    [
      { entete: "Cliente", largeur: 28, valeur: (s) => {
        const c = nomCliente.get(s.cliente_id);
        return c?.nom_complet ?? "";
      } },
      { entete: "Téléphone", largeur: 18, valeur: (s) => nomCliente.get(s.cliente_id)?.telephone ?? "" },
      { entete: "Date", valeur: (s) => dateFr(s.date_seance) },
      { entete: "Type de venue", valeur: (s) => libelle(TYPE_VENUE, s.type_venue) },
      { entete: "Soins réalisés", largeur: 40, valeur: (s) =>
        s.soins.map((x) => x.soins_catalogue?.libelle).filter(Boolean).join(", ") },
      { entete: "Zones", largeur: 24, valeur: (s) => libelles(ZONES, s.zones) },
      { entete: "Type de peau", valeur: (s) => libelle(TYPE_PEAU, s.type_peau) },
      { entete: "État de la peau", largeur: 22, valeur: (s) => libelle(ETAT_PEAU, s.etat_peau) },
      { entete: "Évolution", largeur: 22, valeur: (s) => libelle(EVOLUTION, s.evolution) },
      { entete: "Produits utilisés", largeur: 40, valeur: (s) => s.produits_utilises },
      { entete: "Observations", largeur: 50, valeur: (s) => s.observations },
      { entete: "Incident", largeur: 40, valeur: (s) => s.incident },
      { entete: "Conseils donnés", largeur: 50, valeur: (s) => s.conseils },
      { entete: "Prochain RDV", valeur: (s) => dateFr(s.prochain_rdv) },
    ],
    seances ?? [],
  );

  // ------------------------------------------------------------ Feuille 3
  // Historique complet des bilans : c'est ce qui permet de retracer l'état de
  // santé déclaré au moment d'un soin donné, et non aujourd'hui seulement.
  ajouterFeuille<Anamnese>(
    classeur,
    "Bilans santé (historique)",
    [
      { entete: "Cliente", largeur: 28, valeur: (a) => {
        const c = nomCliente.get(a.cliente_id);
        return c?.nom_complet ?? "";
      } },
      { entete: "Saisi le", valeur: (a) => dateFr(a.date_maj) },
      { entete: "Allergies", largeur: 40, valeur: (a) => a.allergies },
      { entete: "Traitement", valeur: (a) => ouiNon(a.traitement_en_cours) },
      { entete: "Grossesse", valeur: (a) => ouiNon(a.grossesse_allaitement) },
      { entete: "Lentilles", valeur: (a) => ouiNon(a.port_lentilles) },
      { entete: "Implants", valeur: (a) => ouiNon(a.implants_pacemaker) },
      { entete: "Injections", valeur: (a) => ouiNon(a.injections_recentes) },
      { entete: "Fumeuse", valeur: (a) => ouiNon(a.fumeur) },
      { entete: "Exposition UV", valeur: (a) => libelle(EXPOSITION_UV, a.exposition_uv) },
      { entete: "Hydratation", valeur: (a) => libelle(HYDRATATION, a.hydratation) },
      { entete: "Routine", largeur: 45, valeur: (a) => a.routine_actuelle },
      { entete: "Priorités", largeur: 30, valeur: (a) => libelles(PRIORITES, a.priorites) },
    ],
    bilans ?? [],
  );

  return reponseClasseur(classeur, "fiches_clientes");
}
