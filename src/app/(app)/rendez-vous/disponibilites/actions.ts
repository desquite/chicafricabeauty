"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";

export type Retour = { ok: boolean; erreur?: string; avertissement?: string };

/**
 * Les disponibilites decident de ce qui est propose aux clientes : seule la
 * gerante les regle, comme le catalogue. La RLS l'autoriserait a tout le
 * personnel, ce controle est une regle de gestion.
 */
async function exigerGerante() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") {
    throw new Error("Seule la gérante peut modifier les disponibilités.");
  }
  return profil;
}

const HEURE = /^\d{2}:\d{2}$/;

export async function enregistrerHoraires(
  horaires: { jour: number; ouvert: boolean; ouverture: string; fermeture: string }[],
): Promise<Retour> {
  await exigerGerante();

  for (const h of horaires) {
    if (!h.ouvert) continue;
    if (!HEURE.test(h.ouverture) || !HEURE.test(h.fermeture)) {
      return { ok: false, erreur: "Chaque jour ouvert doit avoir une heure d'ouverture et de fermeture." };
    }
    if (h.fermeture <= h.ouverture) {
      return { ok: false, erreur: "La fermeture doit venir après l'ouverture." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("horaires_semaine").upsert(
    horaires.map((h) => ({
      jour: h.jour,
      ouvert: h.ouvert,
      ouverture: h.ouvert ? h.ouverture : null,
      fermeture: h.ouvert ? h.fermeture : null,
    })),
  );
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/rendez-vous/disponibilites");
  return { ok: true };
}

/**
 * Une fermeture n'annule aucun rendez-vous deja pris : elle empeche seulement
 * d'en prendre de nouveaux. Ceux qui tombent dedans sont signales, pour que
 * la gerante previenne les clientes.
 */
export async function ajouterFermeture(saisie: {
  date_debut: string;
  date_fin: string;
  journee: boolean;
  heure_debut: string;
  heure_fin: string;
  motif: string;
}): Promise<Retour> {
  const profil = await exigerGerante();

  if (!saisie.date_debut) return { ok: false, erreur: "Indiquez la date." };
  const fin = saisie.date_fin || saisie.date_debut;
  if (fin < saisie.date_debut) {
    return { ok: false, erreur: "La date de fin doit suivre la date de début." };
  }
  if (!saisie.journee) {
    if (!HEURE.test(saisie.heure_debut) || !HEURE.test(saisie.heure_fin)) {
      return { ok: false, erreur: "Indiquez l'heure de début et de fin." };
    }
    if (saisie.heure_fin <= saisie.heure_debut) {
      return { ok: false, erreur: "L'heure de fin doit venir après l'heure de début." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("fermetures").insert({
    date_debut: saisie.date_debut,
    date_fin: fin,
    heure_debut: saisie.journee ? null : saisie.heure_debut,
    heure_fin: saisie.journee ? null : saisie.heure_fin,
    motif: saisie.motif.trim() || null,
    cree_par: profil.id,
  });
  if (error) return { ok: false, erreur: error.message };

  let requete = supabase
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .eq("statut", "prevu")
    .is("remplace_par", null)
    .is("masque_le", null)
    .gte("date_rdv", saisie.date_debut)
    .lte("date_rdv", fin);
  if (!saisie.journee) {
    requete = requete.gte("heure_rdv", saisie.heure_debut).lt("heure_rdv", saisie.heure_fin);
  }
  const { count } = await requete;

  revalidatePath("/rendez-vous/disponibilites");
  return {
    ok: true,
    avertissement: count
      ? `${count} rendez-vous déjà prévu${count > 1 ? "s" : ""} sur cette période : pensez à prévenir ${count > 1 ? "les clientes" : "la cliente"}.`
      : undefined,
  };
}

export async function supprimerFermeture(id: string): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();
  const { error } = await supabase.from("fermetures").delete().eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/rendez-vous/disponibilites");
  return { ok: true };
}

export async function enregistrerReglages(saisie: {
  horizon_jours: string;
  acompte_montant: string;
}): Promise<Retour> {
  await exigerGerante();
  const horizon = Number(saisie.horizon_jours);
  const acompte = Number(saisie.acompte_montant);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 365) {
    return { ok: false, erreur: "La réservation à l'avance doit aller de 1 à 365 jours." };
  }
  if (!Number.isInteger(acompte) || acompte < 0) {
    return { ok: false, erreur: "Le montant de l'acompte est invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reglages_rdv")
    .upsert({ id: true, horizon_jours: horizon, acompte_montant: acompte });
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/rendez-vous/disponibilites");
  return { ok: true };
}
