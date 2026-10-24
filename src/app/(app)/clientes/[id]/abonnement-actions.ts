"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  ajouterJours,
  datesSerie,
  DUREES,
  ecartJours,
  finAbonnement,
  placerSerie,
  seanceSuivante,
  type LigneSerie,
  rythmePermis,
  VERSEMENTS_MAX,
  type Abonnement,
  type Rythme,
} from "@/lib/abonnements";
import { paiementConfigure } from "@/lib/afribapay";
import { requireProfil } from "@/lib/auth";
import { envoyerMessageAbonnement } from "@/lib/notifications/abonnement";
import { creneauxDuPersonnel } from "@/lib/planification";
import { createClient } from "@/lib/supabase/server";
import { enregistrerRdv } from "../../rendez-vous/actions";

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

/* ---------------------------------------------------- Planifier la série */

export type PropositionSerie =
  | {
      ok: true;
      lignes: LigneSerie[];
      restantes: number;
      heure: string;
      soin: string;
    }
  | { ok: false; erreur: string };

const HEURE = /^\d{2}:\d{2}$/;

/**
 * Les séances restantes au rythme de l'abonnement, à l'heure voulue, chacune
 * marquée libre ou accompagnée du créneau libre le plus proche. Rien n'est
 * encore créé : la gérante vérifie et ajuste d'abord.
 */
export async function proposerSerie(id: string, heureVoulue?: string): Promise<PropositionSerie> {
  await exigerGerante();
  const supabase = await createClient();
  const { data: abo } = await supabase
    .from("abonnements")
    .select("*, soins_catalogue(libelle, duree_std)")
    .eq("id", id)
    .maybeSingle<Abonnement & { soins_catalogue: { libelle: string; duree_std: number | null } | null }>();
  if (!abo || abo.statut !== "actif") return { ok: false, erreur: "Cet abonnement n'est pas actif." };

  const jour = new Date().toISOString().slice(0, 10);
  const fin = finAbonnement(abo);
  const [{ data: seances }, { data: prevus }] = await Promise.all([
    supabase
      .from("seances")
      .select("date_seance")
      .eq("abonnement_id", id)
      .returns<{ date_seance: string }[]>(),
    supabase
      .from("rendez_vous")
      .select("date_rdv, heure_rdv")
      .eq("cliente_id", abo.cliente_id)
      .eq("soin_id", abo.soin_id)
      .eq("statut", "prevu")
      .is("remplace_par", null)
      .is("masque_le", null)
      .gte("date_rdv", jour)
      .lte("date_rdv", fin)
      .order("date_rdv")
      .returns<{ date_rdv: string; heure_rdv: string | null }[]>(),
  ]);

  const restantes = abo.nb_seances - (seances?.length ?? 0) - (prevus?.length ?? 0);
  if (restantes <= 0) return { ok: false, erreur: "Toutes les séances sont déjà faites ou planifiées." };

  // On repart de la dernière venue ou du dernier rendez-vous déjà pris.
  const reperes = [...(seances ?? []).map((s) => s.date_seance), ...(prevus ?? []).map((r) => r.date_rdv)].sort();
  const dernier = reperes.at(-1);
  let premiere = dernier ? seanceSuivante(dernier, abo.rythme) : abo.debut;
  while (premiere <= jour) premiere = ajouterJours(premiere, 1);

  const derniereHeure = (prevus ?? []).map((r) => r.heure_rdv).filter(Boolean).at(-1)?.slice(0, 5);
  const heure = heureVoulue && HEURE.test(heureVoulue) ? heureVoulue : (derniereHeure ?? "10:00");

  const dates = datesSerie({ premiere, rythme: abo.rythme, nombre: restantes, fin });
  if (!dates.length) return { ok: false, erreur: "Plus de date possible avant la fin de l'abonnement." };

  const libres = await creneauxDuPersonnel(supabase, {
    duree: abo.soins_catalogue?.duree_std ?? 60,
    jusquau: ajouterJours(fin, 3),
  });
  return {
    ok: true,
    lignes: placerSerie(dates, heure, Object.fromEntries(libres)),
    restantes,
    heure,
    soin: abo.soins_catalogue?.libelle ?? "Soin",
  };
}

/**
 * Crée les rendez-vous retenus, un par un, par le même chemin qu'une saisie
 * à la tablette : écart de préparation vérifié, pas d'acompte pour le soin
 * couvert. Un créneau pris entre-temps est signalé, les autres sont créés.
 */
export async function creerSerie(
  id: string,
  lignes: { date: string; heure: string }[],
): Promise<Retour & { erreurs?: string[] }> {
  await exigerGerante();
  const supabase = await createClient();
  const { data: abo } = await supabase
    .from("abonnements")
    .select("cliente_id, soin_id, statut, soins_catalogue(duree_std)")
    .eq("id", id)
    .maybeSingle<{ cliente_id: string; soin_id: string; statut: string; soins_catalogue: { duree_std: number | null } | null }>();
  if (!abo || abo.statut !== "actif") return { ok: false, erreur: "Cet abonnement n'est pas actif." };

  const valides = lignes.filter((l) => DATE.test(l.date) && HEURE.test(l.heure)).slice(0, 60);
  if (!valides.length) return { ok: false, erreur: "Aucun rendez-vous à créer." };

  let crees = 0;
  const erreurs: string[] = [];
  for (const l of valides) {
    const r = await enregistrerRdv({
      cliente_id: abo.cliente_id,
      date_rdv: l.date,
      heure_rdv: l.heure,
      duree_min: String(abo.soins_catalogue?.duree_std ?? 60),
      soin_id: abo.soin_id,
      notes: "Abonnement",
    });
    if (r.ok) crees += 1;
    else erreurs.push(`${l.date.split("-").reverse().join("/")} ${l.heure.replace(":", "h")} : ${r.erreur ?? "refusé"}`);
  }

  rafraichir(abo.cliente_id);
  return {
    ok: crees > 0,
    info: `${crees} rendez-vous créé${crees > 1 ? "s" : ""}.`,
    erreur: crees === 0 ? "Aucun rendez-vous n'a pu être créé." : undefined,
    erreurs,
  };
}
