"use server";

import { revalidatePath } from "next/cache";
import { requireProfil } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
  prix_promo: string;
  promo_fin: string;
  prix_achat: string;
  seuil: string;
};

function valider(s: SaisieProduit) {
  const nom = s.nom.trim();
  if (nom.length < 2) return { erreur: "Indiquez le nom du produit." };
  const prix = entier(s.prix_vente);
  if (prix === null) return { erreur: "Le prix de vente est invalide." };
  // Promotion : vide pour l'arrêter, sinon un prix inférieur au prix normal.
  const promo = s.prix_promo.trim() ? entier(s.prix_promo, 1) : null;
  if (s.prix_promo.trim() && (promo === null || promo >= prix)) {
    return { erreur: "Le prix promo doit être inférieur au prix de vente (laissez vide pour arrêter la promotion)." };
  }
  // Date de fin facultative, et sans objet hors promotion.
  const fin = promo !== null && /^\d{4}-\d{2}-\d{2}$/.test(s.promo_fin) ? s.promo_fin : null;
  const achat = s.prix_achat.trim() ? entier(s.prix_achat) : null;
  if (s.prix_achat.trim() && achat === null) return { erreur: "Le prix d'achat est invalide." };
  const seuil = entier(s.seuil || "0");
  if (seuil === null) return { erreur: "Le seuil d'alerte est invalide." };
  return { valeurs: { nom, categorie: s.categorie.trim() || null, prix_vente: prix, prix_promo: promo, promo_fin: fin, prix_achat: achat, seuil } };
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
  revalidatePath("/boutique", "layout");
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
  revalidatePath("/boutique", "layout");
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
  revalidatePath("/boutique", "layout");
  return { ok: true, info: `Stock mis à jour : ${data as number}.` };
}

/* --------------------------------------------------------------- Photos */

// Le bucket « produits » est public en lecture, mais seule la clé de service
// y écrit : la photo passe par ici, après le contrôle du rôle.
const BUCKET = "produits";
const TYPES_PHOTO: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

async function lirePhotos(id: string) {
  const { data } = await createAdminClient()
    .from("produits")
    .select("photo, galerie")
    .eq("id", id)
    .maybeSingle<{ photo: string | null; galerie: string[] | null }>();
  return data ? [data.photo, ...(data.galerie ?? [])].filter((x): x is string => Boolean(x)) : null;
}

/** La première photo est la principale : celle des listes de la boutique. */
async function enregistrerPhotos(id: string, photos: string[]) {
  const { error } = await createAdminClient()
    .from("produits")
    .update({ photo: photos[0] ?? null, galerie: photos.slice(1) })
    .eq("id", id);
  revalidatePath("/caisse/stock");
  revalidatePath("/boutique", "layout");
  return error;
}

/** Ajoute une photo, déjà réduite par le navigateur, après les autres. */
export async function ajouterPhotoProduit(id: string, donnees: FormData): Promise<Retour> {
  await exigerGerante();
  const fichier = donnees.get("photo");
  if (!(fichier instanceof File) || !TYPES_PHOTO[fichier.type]) return { ok: false, erreur: "Choisissez une photo (JPEG, PNG ou WebP)." };
  if (fichier.size > 5 * 1024 * 1024) return { ok: false, erreur: "Cette photo est trop lourde (5 Mo au plus)." };
  const photos = await lirePhotos(id);
  if (!photos) return { ok: false, erreur: "Produit introuvable." };
  if (photos.length >= 6) return { ok: false, erreur: "Six photos au plus par produit : retirez-en une d'abord." };

  const chemin = `${id}/${Date.now().toString(36)}.${TYPES_PHOTO[fichier.type]}`;
  const admin = createAdminClient();
  const { error: envoi } = await admin.storage
    .from(BUCKET)
    .upload(chemin, fichier, { contentType: fichier.type, cacheControl: "31536000" });
  if (envoi) return { ok: false, erreur: "La photo n'a pas pu être envoyée. Réessayez." };

  if (await enregistrerPhotos(id, [...photos, chemin])) {
    await admin.storage.from(BUCKET).remove([chemin]);
    return { ok: false, erreur: "La photo n'a pas pu être enregistrée." };
  }
  return { ok: true, info: photos.length ? "Photo ajoutée." : "Photo ajoutée : c'est la photo principale." };
}

/** Passe une photo en principale. */
export async function photoPrincipale(id: string, chemin: string): Promise<Retour> {
  await exigerGerante();
  const photos = await lirePhotos(id);
  if (!photos?.includes(chemin)) return { ok: false, erreur: "Photo introuvable." };
  if (await enregistrerPhotos(id, [chemin, ...photos.filter((p) => p !== chemin)])) {
    return { ok: false, erreur: "Modification impossible." };
  }
  return { ok: true, info: "Photo principale changée." };
}

/** Retire une photo ; si c'était la principale, la suivante prend sa place. */
export async function retirerPhotoProduit(id: string, chemin: string): Promise<Retour> {
  await exigerGerante();
  const photos = await lirePhotos(id);
  if (!photos?.includes(chemin)) return { ok: false, erreur: "Photo introuvable." };
  if (await enregistrerPhotos(id, photos.filter((p) => p !== chemin))) {
    return { ok: false, erreur: "Suppression impossible." };
  }
  // Le fichier part après la fiche : un échec ne laisse qu'un fichier orphelin,
  // jamais une photo cassée dans la boutique.
  await createAdminClient().storage.from(BUCKET).remove([chemin]);
  return { ok: true, info: "Photo retirée." };
}
