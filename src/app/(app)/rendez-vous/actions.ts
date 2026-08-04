"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";

export type Retour = { ok: boolean; erreur?: string };

export async function enregistrerRdv(saisie: {
  id?: string;
  cliente_id: string;
  date_rdv: string;
  heure_rdv: string;
  duree_min: string;
  soin_id: string;
  notes: string;
  /** Rendez-vous annulé ou manqué que celui-ci remplace. */
  remplace?: string;
}): Promise<Retour> {
  const profil = await requireProfil();
  const supabase = await createClient();

  if (!saisie.cliente_id) return { ok: false, erreur: "Choisissez une cliente." };
  if (!saisie.date_rdv) return { ok: false, erreur: "La date est obligatoire." };

  const valeurs = {
    cliente_id: saisie.cliente_id,
    date_rdv: saisie.date_rdv,
    heure_rdv: saisie.heure_rdv || null,
    duree_min: saisie.duree_min ? Number(saisie.duree_min) : null,
    soin_id: saisie.soin_id || null,
    notes: saisie.notes.trim() || null,
  };

  if (saisie.id) {
    const { error } = await supabase
      .from("rendez_vous")
      .update(valeurs)
      .eq("id", saisie.id);
    if (error) return { ok: false, erreur: error.message };
  } else {
    const { data: cree, error } = await supabase
      .from("rendez_vous")
      .insert({ ...valeurs, cree_par: profil.id })
      .select("id")
      .single();
    if (error || !cree) {
      return { ok: false, erreur: error?.message ?? "Enregistrement impossible." };
    }

    // L'ancien rendez-vous garde son statut : c'est lui qui alimente le taux
    // d'absence. Il est seulement écarté de l'agenda, pas supprimé.
    if (saisie.remplace) {
      await supabase
        .from("rendez_vous")
        .update({ remplace_par: cree.id })
        .eq("id", saisie.remplace);
    }
  }

  revalidatePath("/rendez-vous");
  revalidatePath("/accueil");
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
