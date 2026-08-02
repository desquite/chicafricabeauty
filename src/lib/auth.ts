import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RoleStaff = "gerante" | "estheticienne";

export type Profil = {
  id: string;
  nom: string;
  role: RoleStaff;
  actif: boolean;
};

/**
 * Garde d'accès de l'application.
 *
 * Deux conditions distinctes, volontairement séparées :
 *  - une session Supabase valide (sinon → page de connexion) ;
 *  - une ligne `profiles` active (sinon → compte non habilité).
 *
 * Le second cas arrive dès qu'un compte est créé dans Supabase Auth sans être
 * rattaché au personnel. Le laisser entrer serait un trou de sécurité.
 */
export async function requireProfil(): Promise<Profil> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion");

  const { data: profil } = await supabase
    .from("profiles")
    .select("id, nom, role, actif")
    .eq("id", user.id)
    .maybeSingle();

  if (!profil || !profil.actif) redirect("/non-habilite");

  return profil as Profil;
}
