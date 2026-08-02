import ExcelJS from "exceljs";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ajouterFeuille,
  dateFr,
  libelle,
  libelles,
  reponseClasseur,
} from "@/lib/export/classeur";
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

export const dynamic = "force-dynamic";

type LigneSeance = Seance & {
  clientes: Pick<Cliente, "nom" | "prenoms" | "telephone"> | null;
  profiles: { nom: string } | null;
  soins: { soins_catalogue: { libelle: string; categorie: string | null; prix: number | null } | null }[];
};

export async function GET() {
  await requireProfil();
  const supabase = await createClient();

  const { data: seances, error } = await supabase
    .from("seances")
    .select(
      "*, clientes(nom, prenoms, telephone), profiles(nom), soins:seance_soins(soins_catalogue(libelle, categorie, prix))",
    )
    .order("date_seance", { ascending: false })
    .returns<LigneSeance[]>();

  if (error) {
    return Response.json({ erreur: error.message }, { status: 500 });
  }

  const nomComplet = (s: LigneSeance) =>
    s.clientes ? `${s.clientes.prenoms} ${s.clientes.nom}` : "";

  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Chic Africa Beauty Online";
  classeur.created = new Date();

  // ------------------------------------------------------------ Feuille 1
  ajouterFeuille<LigneSeance>(
    classeur,
    "Séances",
    [
      { entete: "Date", valeur: (s) => dateFr(s.date_seance) },
      { entete: "Cliente", largeur: 28, valeur: nomComplet },
      { entete: "Téléphone", largeur: 18, valeur: (s) => s.clientes?.telephone ?? "" },
      { entete: "Praticienne", largeur: 20, valeur: (s) => s.profiles?.nom ?? "" },
      { entete: "Type de venue", largeur: 18, valeur: (s) => libelle(TYPE_VENUE, s.type_venue) },
      { entete: "Soins réalisés", largeur: 40, valeur: (s) =>
        s.soins.map((x) => x.soins_catalogue?.libelle).filter(Boolean).join(", ") },
      { entete: "Zones", largeur: 24, valeur: (s) => libelles(ZONES, s.zones) },
      { entete: "Durée (min)", largeur: 12, valeur: (s) => s.duree_min },
      { entete: "Type de peau", largeur: 20, valeur: (s) => libelle(TYPE_PEAU, s.type_peau) },
      { entete: "État de la peau", largeur: 22, valeur: (s) => libelle(ETAT_PEAU, s.etat_peau) },
      { entete: "Observations peau", largeur: 34, valeur: (s) => libelles(OBSERVATIONS_PEAU, s.observations_peau) },
      { entete: "Produits utilisés", largeur: 40, valeur: (s) => s.produits_utilises },
      { entete: "Appareil", largeur: 20, valeur: (s) => s.appareil },
      { entete: "Réactions", largeur: 30, valeur: (s) => libelles(REACTIONS, s.reactions) },
      { entete: "Évolution", largeur: 22, valeur: (s) => libelle(EVOLUTION, s.evolution) },
      { entete: "Observations", largeur: 50, valeur: (s) => s.observations },
      { entete: "Incident", largeur: 40, valeur: (s) => s.incident },
      { entete: "Programme recommandé", largeur: 40, valeur: (s) => s.programme },
      { entete: "Conseils donnés", largeur: 50, valeur: (s) => s.conseils },
      { entete: "Produits conseillés", largeur: 40, valeur: (s) => s.produits_conseilles },
      { entete: "Délai recommandé", largeur: 18, valeur: (s) => libelle(DELAIS, s.delai_recommande) },
      { entete: "Prochain RDV", valeur: (s) => dateFr(s.prochain_rdv) },
    ],
    seances ?? [],
  );

  // ------------------------------------------------------------ Feuille 2
  // Une ligne par soin et non par séance : c'est la forme qui se compte dans
  // un tableau croisé dynamique. Une cellule « Peeling, Masque » ne se compte
  // pas, elle se dépouille à la main.
  type LigneSoin = {
    date: string;
    cliente: string;
    praticienne: string;
    soin: string;
    categorie: string;
    prix: number | null;
  };

  const parSoin: LigneSoin[] = (seances ?? []).flatMap((s) =>
    s.soins
      .filter((x) => x.soins_catalogue)
      .map((x) => ({
        date: dateFr(s.date_seance),
        cliente: nomComplet(s),
        praticienne: s.profiles?.nom ?? "",
        soin: x.soins_catalogue!.libelle,
        categorie: x.soins_catalogue!.categorie ?? "",
        prix: x.soins_catalogue!.prix,
      })),
  );

  ajouterFeuille<LigneSoin>(
    classeur,
    "Détail par soin",
    [
      { entete: "Date", valeur: (l) => l.date },
      { entete: "Cliente", largeur: 28, valeur: (l) => l.cliente },
      { entete: "Praticienne", largeur: 20, valeur: (l) => l.praticienne },
      { entete: "Soin", largeur: 30, valeur: (l) => l.soin },
      { entete: "Catégorie", largeur: 18, valeur: (l) => l.categorie },
      { entete: "Prix (FCFA)", largeur: 14, valeur: (l) => l.prix },
    ],
    parSoin,
  );

  return reponseClasseur(classeur, "soins_effectues");
}
