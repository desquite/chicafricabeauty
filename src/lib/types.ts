export type RoleStaff = "gerante" | "estheticienne";

export type Cliente = {
  id: string;
  nom: string;
  prenoms: string;
  date_naissance: string | null;
  profession: string | null;
  telephone: string;
  email: string | null;
  notes: string | null;
  actif: boolean;
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
