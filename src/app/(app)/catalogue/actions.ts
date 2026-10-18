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
  libelle_public: string;
  en_ligne: boolean;
  prix_promo: string;
  promo_debut: string;
  promo_fin: string;
}): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();

  if (!saisie.libelle.trim()) return { ok: false, erreur: "Le libellé est obligatoire." };

  const prix = saisie.prix ? Number(saisie.prix) : null;
  const duree = saisie.duree_std ? Number(saisie.duree_std) : null;
  if (saisie.en_ligne && (!duree || prix == null)) {
    return {
      ok: false,
      erreur: "Pour proposer ce soin en ligne, indiquez sa durée et son prix : la durée décide des créneaux.",
    };
  }

  // Une promotion est complete ou absente : un prix sans dates ne
  // s'arreterait jamais, des dates sans prix n'auraient pas de sens.
  const promo = [saisie.prix_promo, saisie.promo_debut, saisie.promo_fin];
  const promoRemplie = promo.filter((v) => v.trim() !== "").length;
  if (promoRemplie > 0 && promoRemplie < 3) {
    return { ok: false, erreur: "Une promotion demande un prix, une date de début et une date de fin." };
  }
  const prixPromo = promoRemplie ? Number(saisie.prix_promo) : null;
  if (prixPromo != null) {
    if (saisie.promo_fin < saisie.promo_debut) {
      return { ok: false, erreur: "La fin de la promotion doit suivre son début." };
    }
    if (prix != null && prixPromo >= prix) {
      return { ok: false, erreur: "Le prix promo doit être inférieur au prix normal." };
    }
  }

  const valeurs = {
    libelle: saisie.libelle.trim(),
    categorie: saisie.categorie.trim() || null,
    duree_std: duree,
    prix,
    ordre: saisie.ordre ? Number(saisie.ordre) : 0,
    libelle_public: saisie.libelle_public.trim() || null,
    en_ligne: saisie.en_ligne,
    prix_promo: prixPromo,
    promo_debut: prixPromo != null ? saisie.promo_debut : null,
    promo_fin: prixPromo != null ? saisie.promo_fin : null,
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
