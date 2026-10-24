"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  DUREES,
  ecartJours,
  finAbonnement,
  rythmePermis,
  VERSEMENTS_MAX,
  type Abonnement,
  type Rythme,
} from "@/lib/abonnements";
import { paiementConfigure } from "@/lib/afribapay";
import { requireProfil } from "@/lib/auth";
import { envoyerMessageAbonnement } from "@/lib/notifications/abonnement";
import { createClient } from "@/lib/supabase/server";

export type Retour = { ok: boolean; erreur?: string; info?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RYTHMES: Rythme[] = ["1s", "2s", "3s", "1m"];

/** Seule la gérante crée, met en pause ou annule un abonnement. */
async function exigerGerante() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") throw new Error("Seule la gérante gère les abonnements.");
  return profil;
}

function rafraichir(clienteId: string) {
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/rendez-vous");
  revalidatePath("/accueil");
}

export async function creerAbonnement(saisie: {
  cliente_id: string;
  soin_id: string;
  debut: string;
  duree_mois: number;
  rythme: string;
  nb_seances: number;
  prix: string;
  nb_versements: number;
  notes: string;
}): Promise<Retour> {
  const profil = await exigerGerante();
  const supabase = await createClient();

  const prix = Number(saisie.prix.replace(/\D/g, ""));
  const rythme = saisie.rythme as Rythme;
  if (!saisie.soin_id) return { ok: false, erreur: "Choisissez le soin couvert." };
  if (!DATE.test(saisie.debut)) return { ok: false, erreur: "La date de début est invalide." };
  if (!DUREES.includes(saisie.duree_mois as (typeof DUREES)[number])) {
    return { ok: false, erreur: "La durée doit être de 3, 6 ou 12 mois." };
  }
  if (!RYTHMES.includes(rythme) || !rythmePermis(saisie.duree_mois, rythme)) {
    return { ok: false, erreur: "« Chaque mois » est réservé aux abonnements de 12 mois." };
  }
  if (!Number.isInteger(saisie.nb_seances) || saisie.nb_seances < 1 || saisie.nb_seances > 60) {
    return { ok: false, erreur: "Le nombre de séances doit aller de 1 à 60." };
  }
  if (!Number.isInteger(prix) || prix < 1000) return { ok: false, erreur: "Indiquez le prix de l'abonnement." };
  if (!Number.isInteger(saisie.nb_versements) || saisie.nb_versements < 1 || saisie.nb_versements > VERSEMENTS_MAX) {
    return { ok: false, erreur: "Le paiement se fait en 1, 2 ou 3 fois." };
  }

  // Un seul abonnement en cours par soin : deux se chevaucheraient.
  const { data: enCours } = await supabase
    .from("abonnements")
    .select("id")
    .eq("cliente_id", saisie.cliente_id)
    .eq("soin_id", saisie.soin_id)
    .in("statut", ["actif", "pause"])
    .limit(1);
  if (enCours?.length) return { ok: false, erreur: "Cette cliente a déjà un abonnement en cours sur ce soin." };

  const { data: cree, error } = await supabase
    .from("abonnements")
    .insert({
      cliente_id: saisie.cliente_id,
      soin_id: saisie.soin_id,
      debut: saisie.debut,
      duree_mois: saisie.duree_mois,
      rythme,
      nb_seances: saisie.nb_seances,
      prix,
      nb_versements: saisie.nb_versements,
      notes: saisie.notes.trim() || null,
      cree_par: profil.id,
    })
    .select("*")
    .single<Abonnement>();
  if (error || !cree) return { ok: false, erreur: error?.message ?? "Création impossible." };

  // Rendez-vous déjà pris pour ce soin pendant l'abonnement : l'acompte
  // n'est plus exigé, et aucun rappel ne partira.
  await supabase
    .from("rendez_vous")
    .update({ acompte_requis: false })
    .eq("cliente_id", saisie.cliente_id)
    .eq("soin_id", saisie.soin_id)
    .eq("statut", "prevu")
    .is("acompte_paye_le", null)
    .gte("date_rdv", saisie.debut)
    .lte("date_rdv", finAbonnement(cree));

  // Le lien de paiement part tout de suite, avec la première échéance.
  if (paiementConfigure()) {
    after(async () => {
      await envoyerMessageAbonnement(cree.id, "lien").catch(() => null);
    });
  }

  rafraichir(saisie.cliente_id);
  return {
    ok: true,
    info: paiementConfigure()
      ? "Abonnement créé. Le lien de paiement part à la cliente."
      : "Abonnement créé. Le paiement en ligne n'est pas configuré : aucun lien envoyé.",
  };
}

async function lire(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("abonnements").select("*").eq("id", id).maybeSingle<Abonnement>();
  return { supabase, abo: data };
}

export async function mettreEnPause(id: string): Promise<Retour> {
  await exigerGerante();
  const { supabase, abo } = await lire(id);
  if (!abo || abo.statut !== "actif") return { ok: false, erreur: "Cet abonnement n'est pas actif." };
  const { error } = await supabase
    .from("abonnements")
    .update({ statut: "pause", pause_depuis: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  rafraichir(abo.cliente_id);
  return { ok: true };
}

/** La pause repousse la fin d'autant de jours. */
export async function reprendre(id: string): Promise<Retour> {
  await exigerGerante();
  const { supabase, abo } = await lire(id);
  if (!abo || abo.statut !== "pause") return { ok: false, erreur: "Cet abonnement n'est pas en pause." };
  const jour = new Date().toISOString().slice(0, 10);
  const jours = abo.pause_depuis ? Math.max(0, ecartJours(abo.pause_depuis, jour)) : 0;
  const { error } = await supabase
    .from("abonnements")
    .update({ statut: "actif", pause_depuis: null, jours_pause: abo.jours_pause + jours })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  rafraichir(abo.cliente_id);
  return { ok: true, info: jours ? `Fin repoussée de ${jours} jour${jours > 1 ? "s" : ""}.` : undefined };
}

export async function annulerAbonnement(id: string): Promise<Retour> {
  await exigerGerante();
  const { supabase, abo } = await lire(id);
  if (!abo || abo.statut === "annule") return { ok: false, erreur: "Abonnement introuvable." };
  const { error } = await supabase.from("abonnements").update({ statut: "annule" }).eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  rafraichir(abo.cliente_id);
  return { ok: true };
}

export async function renvoyerLien(id: string): Promise<Retour> {
  await exigerGerante();
  if (!paiementConfigure()) return { ok: false, erreur: "Le paiement en ligne n'est pas configuré." };
  const r = await envoyerMessageAbonnement(id, "lien");
  if (r.whatsapp === "déjà réglé") return { ok: false, erreur: "L'abonnement est déjà entièrement réglé." };
  if (r.whatsapp === "déjà envoyé") return { ok: true, info: "Le lien a déjà été envoyé aujourd'hui." };
  return r.whatsapp === "envoyé" || r.email === "envoyé"
    ? { ok: true, info: "Lien renvoyé à la cliente." }
    : { ok: false, erreur: `Envoi impossible : ${r.whatsapp}` };
}
