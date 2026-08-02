"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";

export type Retour = { ok: boolean; erreur?: string };

/**
 * Le catalogue pilote les statistiques et l'historique : seule la gerante le
 * modifie. La RLS l'autoriserait a tout le personnel, ce controle est donc
 * une regle de gestion, pas une barriere de securite.
 */
async function exigerGerante() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") {
    throw new Error("Seule la gérante peut modifier le catalogue.");
  }
  return profil;
}

export async function enregistrerSoin(saisie: {
  id?: string;
  libelle: string;
  categorie: string;
  duree_std: string;
  prix: string;
  ordre: string;
}): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();

  if (!saisie.libelle.trim()) return { ok: false, erreur: "Le libellé est obligatoire." };

  const valeurs = {
    libelle: saisie.libelle.trim(),
    categorie: saisie.categorie.trim() || null,
    duree_std: saisie.duree_std ? Number(saisie.duree_std) : null,
    prix: saisie.prix ? Number(saisie.prix) : null,
    ordre: saisie.ordre ? Number(saisie.ordre) : 0,
  };

  const { error } = saisie.id
    ? await supabase.from("soins_catalogue").update(valeurs).eq("id", saisie.id)
    : await supabase.from("soins_catalogue").insert(valeurs);

  if (error) {
    if (error.code === "23505")
      return { ok: false, erreur: "Un soin porte déjà ce libellé." };
    return { ok: false, erreur: error.message };
  }

  revalidatePath("/catalogue");
  return { ok: true };
}

/**
 * Un soin retire est desactive, jamais supprime : les seances passees y font
 * reference et l'historique doit rester lisible.
 */
export async function basculerSoin(id: string, actif: boolean): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();
  const { error } = await supabase
    .from("soins_catalogue")
    .update({ actif })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/catalogue");
  return { ok: true };
}
