export type RoleStaff = "gerante" | "estheticienne";

export type Cliente = {
  id: string;
  /** Nom et prénoms en une seule saisie, comme sur le formulaire d'origine. */
  nom_complet: string;
  date_naissance: string | null;
  profession: string | null;
  telephone: string;
  email: string | null;
  notes: string | null;
  actif: boolean;
  /** Autorise les rappels de rendez-vous par WhatsApp. */
  rappels_whatsapp: boolean;
  /** Ses rappels partent par Infobip, et non plus par WasenderAPI. */
  rappels_infobip: boolean;
  created_at: string;
};

export type Anamnese = {
  id: string;
  cliente_id: string;
  date_maj: string;
  saisie_par: string | null;
  allergies: string | null;
  traitement_en_cours: boolean | null;
  traitement_detail: string | null;
  grossesse_allaitement: boolean | null;
  port_lentilles: boolean | null;
  implants_pacemaker: boolean | null;
  injections_recentes: boolean | null;
  injections_detail: string | null;
  fumeur: boolean | null;
  exposition_uv: "jamais" | "moderee" | "frequente" | null;
  hydratation: "moins_1l" | "plus_1_5l" | null;
  routine_actuelle: string | null;
  priorites: string[] | null;
};

export type Consentement = {
  id: string;
  cliente_id: string;
  nature: "soin" | "photo";
  accepte: boolean;
  texte_version: string;
  signature_path: string | null;
  signe_le: string;
  recueilli_par: string | null;
};

export type SoinCatalogue = {
  id: string;
  libelle: string;
  categorie: string | null;
  duree_std: number | null;
  prix: number | null;
  actif: boolean;
  ordre: number;
};

export type Seance = {
  id: string;
  cliente_id: string;
  praticienne_id: string | null;
  date_seance: string;
  type_venue: "premiere_seance" | "suivi";
  type_peau: "normale" | "seche" | "grasse" | "mixte" | null;
  etat_peau: "deshydratee" | "sensible" | "mature" | "asphyxiee" | null;
  observations_peau: string[] | null;
  zones: string[] | null;
  produits_utilises: string | null;
  appareil: string | null;
  duree_min: number | null;
  reactions: string[] | null;
  evolution:
    | "premiere_seance"
    | "nette_amelioration"
    | "legere_amelioration"
    | "stable"
    | "degradation"
    | null;
  observations: string | null;
  incident: string | null;
  programme: string | null;
  conseils: string | null;
  produits_conseilles: string | null;
  delai_recommande: string | null;
  prochain_rdv: string | null;
  /** Rang de la séance quand elle ouvre droit à la remise fidélité : 5, 10… */
  remise_palier: number | null;
  remise_fidelite: "soin" | "produit" | "non_utilisee" | null;
  cloturee: boolean;
  created_at: string;
};

export const TYPE_PEAU = [
  { valeur: "normale", libelle: "Normale" },
  { valeur: "seche", libelle: "Sèche (manque de gras)" },
  { valeur: "grasse", libelle: "Grasse (excès de sébum)" },
  { valeur: "mixte", libelle: "Mixte" },
] as const;

export const ETAT_PEAU = [
  { valeur: "deshydratee", libelle: "Déshydratée (ridules)" },
  { valeur: "sensible", libelle: "Sensible / Rougeurs" },
  { valeur: "mature", libelle: "Mature / Atonie" },
  { valeur: "asphyxiee", libelle: "Asphyxiée / Terne" },
] as const;

export const OBSERVATIONS_PEAU = [
  { valeur: "acne", libelle: "Acné" },
  { valeur: "cicatrices", libelle: "Cicatrices" },
  { valeur: "taches", libelle: "Taches pigmentaires" },
  { valeur: "pores", libelle: "Pores dilatés" },
  { valeur: "age", libelle: "Signes de l'âge marqués" },
  { valeur: "comedons", libelle: "Comédons / Kystes" },
] as const;

export const ZONES = [
  { valeur: "visage", libelle: "Visage" },
  { valeur: "cou", libelle: "Cou & décolleté" },
  { valeur: "dos", libelle: "Dos" },
  { valeur: "mains", libelle: "Mains" },
  { valeur: "corps", libelle: "Corps" },
] as const;

export const REACTIONS = [
  { valeur: "aucune", libelle: "Aucune réaction" },
  { valeur: "legere_rougeur", libelle: "Légère rougeur" },
  { valeur: "rougeur_marquee", libelle: "Rougeur marquée" },
  { valeur: "picotements", libelle: "Picotements" },
  { valeur: "chaleur", libelle: "Sensation de chaleur" },
  { valeur: "douleur", libelle: "Sensibilité / Douleur" },
] as const;

export const EVOLUTION = [
  { valeur: "premiere_seance", libelle: "Première séance" },
  { valeur: "nette_amelioration", libelle: "Nette amélioration" },
  { valeur: "legere_amelioration", libelle: "Légère amélioration" },
  { valeur: "stable", libelle: "Stable" },
  { valeur: "degradation", libelle: "Dégradation" },
] as const;

export const TYPE_VENUE = [
  { valeur: "premiere_seance", libelle: "Première séance" },
  { valeur: "suivi", libelle: "Séance de suivi" },
] as const;

/** Correspondance délai recommandé -> jours, utilisée par le récap et les stats. */
export const JOURS_PAR_DELAI: Record<string, number> = {
  "1_semaine": 7,
  "2_semaines": 14,
  "3_semaines": 21,
  "1_mois": 30,
  plus_1_mois: 45,
};

export const DELAIS = [
  { valeur: "1_semaine", libelle: "1 semaine" },
  { valeur: "2_semaines", libelle: "2 semaines" },
  { valeur: "3_semaines", libelle: "3 semaines" },
  { valeur: "1_mois", libelle: "1 mois" },
  { valeur: "plus_1_mois", libelle: "Plus d'1 mois" },
] as const;

export const PRIORITES = [
  { valeur: "eclat", libelle: "Éclat" },
  { valeur: "rides", libelle: "Rides / Fermeté" },
  { valeur: "imperfections", libelle: "Imperfections / Acné" },
  { valeur: "hydratation", libelle: "Hydratation" },
  { valeur: "taches", libelle: "Taches" },
] as const;

export const EXPOSITION_UV = [
  { valeur: "jamais", libelle: "Jamais" },
  { valeur: "moderee", libelle: "Modérée" },
  { valeur: "frequente", libelle: "Fréquente" },
] as const;

export const HYDRATATION = [
  { valeur: "moins_1l", libelle: "Moins d'1 litre" },
  { valeur: "plus_1_5l", libelle: "Plus d'1,5 litre" },
] as const;

/** Calcule l'âge à partir d'une date ISO, en tenant compte du jour anniversaire. */
export function age(dateNaissance: string | null): number | null {
  if (!dateNaissance) return null;
  const n = new Date(dateNaissance);
  const t = new Date();
  let a = t.getFullYear() - n.getFullYear();
  const m = t.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < n.getDate())) a -= 1;
  return a;
}

/**
 * Contre-indications a signaler avant tout soin.
 * Volontairement conservateur : en cas de doute la ligne est affichee.
 */
export function alertes(a: Anamnese | null): string[] {
  if (!a) return ["Aucun bilan santé enregistré"];
  const liste: string[] = [];
  if (a.allergies && a.allergies.trim() && !/^(non|aucune?|rien|ras)$/i.test(a.allergies.trim()))
    liste.push(`Allergies : ${a.allergies.trim()}`);
  if (a.grossesse_allaitement) liste.push("Grossesse ou allaitement");
  if (a.implants_pacemaker) liste.push("Implants métalliques ou pacemaker");
  if (a.traitement_en_cours)
    liste.push(
      `Traitement médical en cours${a.traitement_detail ? ` : ${a.traitement_detail}` : ""}`,
    );
  if (a.injections_recentes)
    liste.push(
      `Injections ou laser récents${a.injections_detail ? ` : ${a.injections_detail}` : ""}`,
    );
  if (a.port_lentilles) liste.push("Port de lentilles de contact");
  return liste;
}
