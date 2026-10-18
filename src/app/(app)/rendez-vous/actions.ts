"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";
import { paiementConfigure } from "@/lib/afribapay";
import { envoyerMessageAcompte } from "@/lib/notifications/acompte";
import { lienASaisie, type RdvAcompte } from "@/lib/regles-acompte";

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
    // Un rendez-vous reprogramme garde l'acompte deja regle sur l'ancien : la
    // cliente ne le paie pas deux fois.
    const [{ data: ancien }, { data: reglages }] = await Promise.all([
      saisie.remplace
        ? supabase
            .from("rendez_vous")
            .select("acompte_montant, acompte_paye_le")
            .eq("id", saisie.remplace)
            .maybeSingle<{ acompte_montant: number | null; acompte_paye_le: string | null }>()
        : Promise.resolve({ data: null }),
      supabase
        .from("reglages_rdv")
        .select("acompte_obligatoire, acompte_montant")
        .maybeSingle<{ acompte_obligatoire: boolean; acompte_montant: number }>(),
    ]);
    const acompteRequis =
      Boolean(reglages?.acompte_obligatoire) &&
      (reglages?.acompte_montant ?? 0) > 0 &&
      paiementConfigure();

    const { data: cree, error } = await supabase
      .from("rendez_vous")
      .insert({
        ...valeurs,
        cree_par: profil.id,
        acompte_requis: acompteRequis,
        ...(ancien?.acompte_paye_le
          ? { acompte_montant: ancien.acompte_montant, acompte_paye_le: ancien.acompte_paye_le }
          : {}),
      })
      .select("id, date_rdv, created_at, source, acompte_requis, acompte_paye_le")
      .single<RdvAcompte & { id: string }>();
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

    // Rendez-vous a moins de deux jours : la tache du matin a deja manque son
    // tour, le lien part tout de suite.
    if (lienASaisie(cree, new Date())) {
      await envoyerMessageAcompte(cree.id, "lien").catch(() => null);
    }
  }

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
