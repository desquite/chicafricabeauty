"use server";

import { revalidatePath } from "next/cache";
import { couvre, type Abonnement } from "@/lib/abonnements";
import { requireProfil } from "@/lib/auth";
import { calculerFacture, MODES_PAIEMENT, type ModePaiement } from "@/lib/caisse";
import { prixDuJour, type PrixSoin } from "@/lib/disponibilites";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type Retour = { ok: boolean; erreur?: string; id?: string; numero?: string };

/** La caisse est réservée à la gérante. */
async function exigerGerante() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") throw new Error("La caisse est réservée à la gérante.");
  return profil;
}

function rafraichir() {
  revalidatePath("/caisse", "layout");
  revalidatePath("/accueil");
}

/** Prix d'un soin pour cette cliente ce jour-là : 0 s'il est couvert par son abonnement. */
async function prixSoin(supabase: Client, soinId: string, clienteId: string | null, jour: string) {
  const [{ data: soin }, { data: abos }] = await Promise.all([
    supabase
      .from("soins_catalogue")
      .select("libelle, prix, prix_promo, promo_debut, promo_fin")
      .eq("id", soinId)
      .maybeSingle<PrixSoin & { libelle: string }>(),
    clienteId
      ? supabase
          .from("abonnements")
          .select("soin_id, statut, debut, duree_mois, jours_pause")
          .eq("cliente_id", clienteId)
          .eq("statut", "actif")
          .returns<Pick<Abonnement, "soin_id" | "statut" | "debut" | "duree_mois" | "jours_pause">[]>()
      : Promise.resolve({ data: [] }),
  ]);
  if (!soin) return null;
  const abonnement = (abos ?? []).some((a) => couvre(a, soinId, jour));
  return {
    libelle: abonnement ? `${soin.libelle} (abonnement)` : soin.libelle,
    prix: abonnement ? 0 : (prixDuJour(soin, jour) ?? soin.prix ?? 0),
  };
}

/**
 * Ouvre la facture d'un rendez-vous honoré : la reprend si elle est déjà
 * commencée, sinon la crée avec le soin prévu, l'acompte payé en ligne et la
 * remise fidélité choisie sur la séance.
 */
export async function ouvrirFacture(rdvId: string): Promise<Retour> {
  const profil = await exigerGerante();
  const supabase = await createClient();

  const { data: existante } = await supabase
    .from("factures")
    .select("id, statut")
    .eq("rendez_vous_id", rdvId)
    .neq("statut", "annulee")
    .maybeSingle<{ id: string; statut: string }>();
  if (existante) return { ok: true, id: existante.id };

  const { data: rdv } = await supabase
    .from("rendez_vous")
    .select("id, cliente_id, date_rdv, soin_id, acompte_paye_le, acompte_montant, seances:seance_id(remise_fidelite)")
    .eq("id", rdvId)
    .maybeSingle<{
      id: string;
      cliente_id: string;
      date_rdv: string;
      soin_id: string | null;
      acompte_paye_le: string | null;
      acompte_montant: number | null;
      seances: { remise_fidelite: string | null } | null;
    }>();
  if (!rdv) return { ok: false, erreur: "Rendez-vous introuvable." };

  const remise = rdv.seances?.remise_fidelite;
  const { data: facture, error } = await supabase
    .from("factures")
    .insert({
      cliente_id: rdv.cliente_id,
      rendez_vous_id: rdv.id,
      acompte_deduit: rdv.acompte_paye_le ? (rdv.acompte_montant ?? 0) : 0,
      remise_sur: remise === "soin" || remise === "produit" ? remise : null,
      cree_par: profil.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !facture) return { ok: false, erreur: error?.message ?? "Création impossible." };

  if (rdv.soin_id) {
    const p = await prixSoin(supabase, rdv.soin_id, rdv.cliente_id, rdv.date_rdv);
    if (p) {
      await supabase.from("lignes_facture").insert({
        facture_id: facture.id,
        type: "soin",
        soin_id: rdv.soin_id,
        libelle: p.libelle,
        prix_unitaire: p.prix,
      });
    }
  }
  rafraichir();
  return { ok: true, id: facture.id };
}

/** Vente sans rendez-vous : des produits, pour une cliente ou non. */
export async function nouvelleVente(clienteId: string | null): Promise<Retour> {
  const profil = await exigerGerante();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("factures")
    .insert({ cliente_id: clienteId, cree_par: profil.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, erreur: error?.message ?? "Création impossible." };
  rafraichir();
  return { ok: true, id: data.id };
}

export type SaisieFacture = {
  soins: { soin_id: string }[];
  produits: { produit_id: string; quantite: number }[];
  /** Montant final des soins ; null : le prix du catalogue. */
  montantSoins: number | null;
  notes: string;
};

/**
 * Remplace les lignes du brouillon et recalcule les montants. Les prix sont
 * relus en base : le navigateur ne choisit que quoi et combien.
 */
async function enregistrer(supabase: Client, factureId: string, s: SaisieFacture) {
  const { data: f } = await supabase
    .from("factures")
    .select("id, statut, cliente_id, remise_sur, acompte_deduit, created_at, rendez_vous:rendez_vous_id(date_rdv)")
    .eq("id", factureId)
    .maybeSingle<{
      id: string;
      statut: string;
      cliente_id: string | null;
      remise_sur: "soin" | "produit" | null;
      acompte_deduit: number;
      created_at: string;
      rendez_vous: { date_rdv: string } | null;
    }>();
  if (!f) return { erreur: "Facture introuvable." };
  if (f.statut !== "brouillon") return { erreur: "Cette facture est déjà encaissée." };
  const jour = f.rendez_vous?.date_rdv ?? new Date().toISOString().slice(0, 10);

  const lignesSoins = [];
  for (const [i, l] of s.soins.slice(0, 20).entries()) {
    const p = await prixSoin(supabase, l.soin_id, f.cliente_id, jour);
    if (p) lignesSoins.push({ type: "soin", soin_id: l.soin_id, libelle: p.libelle, quantite: 1, prix_unitaire: p.prix, ordre: i });
  }

  const ids = [...new Set(s.produits.map((p) => p.produit_id))];
  const { data: produits } = ids.length
    ? await supabase.from("produits").select("id, nom, prix_vente").in("id", ids).returns<{ id: string; nom: string; prix_vente: number }[]>()
    : { data: [] };
  const lignesProduits = s.produits
    .filter((l) => Number.isInteger(l.quantite) && l.quantite > 0 && l.quantite <= 99)
    .map((l, i) => {
      const p = (produits ?? []).find((x) => x.id === l.produit_id);
      return p
        ? { type: "produit", produit_id: p.id, libelle: p.nom, quantite: l.quantite, prix_unitaire: p.prix_vente, ordre: 100 + i }
        : null;
    })
    .filter((x) => x !== null);

  const montant = s.montantSoins !== null && Number.isFinite(s.montantSoins) ? Math.round(s.montantSoins) : null;
  if (montant !== null && (montant < 0 || montant > 10_000_000)) return { erreur: "Le montant des soins est invalide." };
  const calcul = calculerFacture({
    soins: lignesSoins,
    montantSoins: montant,
    produits: lignesProduits,
    remiseSur: f.remise_sur,
    acompte: f.acompte_deduit,
  });

  await supabase.from("lignes_facture").delete().eq("facture_id", factureId);
  const lignes = [...lignesSoins, ...lignesProduits].map((l) => ({ ...l, facture_id: factureId }));
  if (lignes.length) {
    const { error } = await supabase.from("lignes_facture").insert(lignes);
    if (error) return { erreur: error.message };
  }
  const { error } = await supabase
    .from("factures")
    .update({
      montant_soins_normal: calcul.soinsNormal,
      montant_soins: calcul.soins,
      montant_produits: calcul.produits,
      remise_fidelite: calcul.remise,
      total: calcul.total,
      notes: s.notes.trim() || null,
    })
    .eq("id", factureId);
  if (error) return { erreur: error.message };
  return { calcul, vide: lignes.length === 0 };
}

export async function garderBrouillon(factureId: string, s: SaisieFacture): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();
  const r = await enregistrer(supabase, factureId, s);
  if ("erreur" in r && r.erreur) return { ok: false, erreur: r.erreur };
  rafraichir();
  return { ok: true, id: factureId };
}

export async function encaisser(factureId: string, s: SaisieFacture, mode: string): Promise<Retour> {
  await exigerGerante();
  if (!MODES_PAIEMENT.some((m) => m.valeur === mode)) return { ok: false, erreur: "Choisissez le mode de paiement." };
  const supabase = await createClient();
  const r = await enregistrer(supabase, factureId, s);
  if ("erreur" in r && r.erreur) return { ok: false, erreur: r.erreur };
  if ("vide" in r && r.vide) return { ok: false, erreur: "La facture est vide." };

  const { data, error } = await supabase.rpc("encaisser_facture", { p_facture: factureId, p_mode: mode as ModePaiement });
  if (error) return { ok: false, erreur: error.message };
  const res = data as { numero?: string; erreur?: string };
  if (res.erreur) {
    return { ok: false, erreur: res.erreur === "deja" ? "Cette facture est déjà encaissée." : "Encaissement impossible." };
  }
  rafraichir();
  return { ok: true, id: factureId, numero: res.numero };
}

/** Abandonne un brouillon ; le rendez-vous revient dans « À facturer ». */
export async function supprimerBrouillon(factureId: string): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();
  const { error } = await supabase.from("factures").delete().eq("id", factureId).eq("statut", "brouillon");
  if (error) return { ok: false, erreur: error.message };
  rafraichir();
  return { ok: true };
}

export async function annulerFacture(factureId: string, motif: string): Promise<Retour> {
  await exigerGerante();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("annuler_facture", { p_facture: factureId, p_motif: motif });
  if (error) return { ok: false, erreur: error.message };
  if ((data as { erreur?: string }).erreur) return { ok: false, erreur: "Seule une facture encaissée peut être annulée." };
  rafraichir();
  return { ok: true };
}
