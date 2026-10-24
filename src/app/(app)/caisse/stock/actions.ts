"use server";

import { revalidatePath } from "next/cache";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Retour = { ok: boolean; erreur?: string; info?: string };

async function exigerGerante() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") throw new Error("Le stock est réservé à la gérante.");
}

const entier = (v: string, min = 0) => {
  const n = Number(String(v).replace(/[\s ]/g, ""));
  return Number.isInteger(n) && n >= min ? n : null;
};

export type SaisieProduit = {
  nom: string;
  categorie: string;
  prix_vente: string;
  prix_achat: string;
  seuil: string;
};

function valider(s: SaisieProduit) {
  const nom = s.nom.trim();
  if (nom.length < 2) return { erreur: "Indiquez le nom du produit." };
  const prix = entier(s.prix_vente);
  if (prix === null) return { erreur: "Le prix de vente est invalide." };
  const achat = s.prix_achat.trim() ? entier(s.prix_achat) : null;
  if (s.prix_achat.trim() && achat === null) return { erreur: "Le prix d'achat est invalide." };
  const seuil = entier(s.seuil || "0");
  if (seuil === null) return { erreur: "Le seuil d'alerte est invalide." };
  return { valeurs: { nom, categorie: s.categorie.trim() || null, prix_vente: prix, prix_achat: achat, seuil } };
}

export async function creerProduit(s: SaisieProduit & { stock: string }): Promise<Retour> {
  await exigerGerante();
  const v = valider(s);
  if ("erreur" in v) return { ok: false, erreur: v.erreur };
  const stock = entier(s.stock || "0");
  if (stock === null) return { ok: false, erreur: "Le stock de départ est invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("produits").insert(v.valeurs).select("id").single<{ id: string }>();
  if (error || !data) return { ok: false, erreur: error?.message ?? "Création impossible." };
  // Le stock de départ passe par une réception : il figure dans l'historique.
  if (stock > 0) {
    await supabase.rpc("mouvement_stock", { p_produit: data.id, p_quantite: stock, p_type: "reception", p_note: "Stock de départ" });
  }
  revalidatePath("/caisse", "layout");
  return { ok: true, info: "Produit ajouté." };
}

export async function modifierProduit(id: string, s: SaisieProduit & { actif: boolean }): Promise<Retour> {
  await exigerGerante();
  const v = valider(s);
  if ("erreur" in v) return { ok: false, erreur: v.erreur };
  const supabase = await createClient();
  const { error } = await supabase.from("produits").update({ ...v.valeurs, actif: s.actif }).eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/caisse", "layout");
  return { ok: true, info: "Produit enregistré." };
}

/** Réception, usage en cabine, ou inventaire (nombre compté). */
export async function mouvement(
  id: string,
  type: "reception" | "cabine" | "inventaire",
  quantite: string,
  note: string,
): Promise<Retour> {
  await exigerGerante();
  const q = entier(quantite, type === "inventaire" ? 0 : 1);
  if (q === null) return { ok: false, erreur: "Indiquez une quantité." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mouvement_stock", { p_produit: id, p_quantite: q, p_type: type, p_note: note });
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/caisse", "layout");
  return { ok: true, info: `Stock mis à jour : ${data as number}.` };
}
