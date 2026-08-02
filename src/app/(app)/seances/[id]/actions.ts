"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";

export type Retour = { ok: boolean; erreur?: string };

/**
 * Enregistre une photo deja deposee dans le bucket.
 *
 * Le consentement est revérifié ici et pas seulement dans l'interface : un
 * refus de photo est une volonte de la cliente, elle ne doit pas dependre du
 * fait qu'un bouton ait ete masque ou non.
 */
export async function enregistrerPhoto(
  seanceId: string,
  moment: "avant" | "apres",
  chemin: string,
): Promise<Retour> {
  const profil = await requireProfil();
  const supabase = await createClient();

  const { data: seance } = await supabase
    .from("seances")
    .select("cliente_id")
    .eq("id", seanceId)
    .maybeSingle();
  if (!seance) return { ok: false, erreur: "Séance introuvable." };

  const { data: consentement } = await supabase
    .from("consentements")
    .select("accepte")
    .eq("cliente_id", seance.cliente_id)
    .eq("nature", "photo")
    .order("signe_le", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!consentement?.accepte) {
    await supabase.storage.from("photos-soins").remove([chemin]);
    return {
      ok: false,
      erreur: "Cette cliente n'a pas autorisé les photographies.",
    };
  }

  const { error } = await supabase.from("photos").insert({
    seance_id: seanceId,
    moment,
    storage_path: chemin,
    prise_par: profil.id,
  });
  if (error) {
    await supabase.storage.from("photos-soins").remove([chemin]);
    return { ok: false, erreur: error.message };
  }

  revalidatePath(`/seances/${seanceId}`);
  return { ok: true };
}

export async function supprimerPhoto(
  seanceId: string,
  photoId: string,
): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, erreur: "Photo introuvable." };

  const { error } = await supabase.from("photos").delete().eq("id", photoId);
  if (error) return { ok: false, erreur: error.message };

  // Le fichier part apres la ligne : si le retrait du fichier echoue, mieux
  // vaut un orphelin dans le bucket qu'une vignette pointant dans le vide.
  await supabase.storage.from("photos-soins").remove([photo.storage_path]);

  revalidatePath(`/seances/${seanceId}`);
  return { ok: true };
}
