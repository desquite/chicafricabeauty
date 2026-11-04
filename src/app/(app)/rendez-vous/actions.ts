"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";
import { enregistrerRdvAvec, type SaisieRdv } from "@/lib/rdv-saisie";

export type Retour = { ok: boolean; erreur?: string };

export async function enregistrerRdv(saisie: SaisieRdv): Promise<Retour> {
  const profil = await requireProfil();
  const r = await enregistrerRdvAvec(await createClient(), profil.id, saisie);
  if (!r.ok) return { ok: false, erreur: r.erreur };
  revalidatePath("/rendez-vous");
  revalidatePath("/accueil");
  return { ok: true };
}

/**
 * Retire un rendez-vous de l'agenda sans le supprimer.
 *
 * Sert aux annulations reprogrammées à la main, avant l'existence du bouton
 * Reprogrammer : elles n'ont aucun lien vers leur remplaçant et resteraient
 * affichées indéfiniment sur leur ancienne date.
 */
export async function masquerRdv(id: string, masque: boolean): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rendez_vous")
    .update({ masque_le: masque ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/rendez-vous");
  return { ok: true };
}

/**
 * Un rendez-vous passé n'est jamais supprimé : le distinguer entre honoré,
 * annulé et absent est précisément ce qui permet de mesurer les absences.
 */
export async function changerStatut(
  id: string,
  statut: "prevu" | "honore" | "annule" | "absent",
): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase.from("rendez_vous").update({ statut }).eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/rendez-vous");
  return { ok: true };
}
