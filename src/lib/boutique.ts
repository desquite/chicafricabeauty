import "server-only";
import { statutPaiementJeko } from "@/lib/jeko";
import { fenetreOuverte, journaliserSortant } from "@/lib/messagerie";
import { alerterGerantes } from "@/lib/notifications/gerantes";
import { envoyerTexteWhatsapp } from "@/lib/notifications/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Boutique en ligne : catalogue public et suivi des commandes.
 *
 * Le stock est réservé à la création de la commande (creer_commande, en
 * SQL) et rendu si le paiement n'aboutit pas. Une commande n'est payée que
 * sur le statut lu chez Jèko, jamais sur le retour du navigateur.
 */

export type ProduitBoutique = {
  id: string;
  nom: string;
  categorie: string;
  prix: number;
  /** Prix normal, barré, quand une promotion est en cours. */
  prixAvant: number | null;
  accroche: string | null;
  description: string | null;
  photos: string[];
  disponible: number;
};

export type StatutCommande = "en_attente" | "payee" | "expediee" | "livree" | "annulee" | "expiree";

export type Commande = {
  id: string;
  numero: string;
  code: string;
  nom: string;
  telephone: string;
  commune: string;
  adresse: string;
  note: string | null;
  montant: number;
  statut: StatutCommande;
  operateur: string | null;
  jeko_id: string | null;
  payee_le: string | null;
  created_at: string;
  lignes_commande: { nom: string; prix: number; quantite: number }[];
};

export const CHAMPS_COMMANDE =
  "id, numero, code, nom, telephone, commune, adresse, note, montant, statut, operateur, jeko_id, payee_le, created_at, lignes_commande(nom, prix, quantite)";

export const CATEGORIES = ["Visage", "Corps", "Bébé / enfant"];

/** Adresse publique d'une photo du bucket produits. */
export function urlPhoto(chemin: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produits/${chemin}`;
}

/** Tous les produits, même en rupture : ils s'affichent « bientôt de retour ». */
export async function catalogueBoutique(): Promise<ProduitBoutique[]> {
  const { data } = await createAdminClient()
    .from("produits")
    .select("id, nom, categorie, prix_vente, prix_promo, stock, actif, accroche, description, photo, galerie")
    .gt("prix_vente", 0)
    .order("nom")
    .returns<
      {
        id: string;
        nom: string;
        categorie: string | null;
        prix_vente: number;
        prix_promo: number | null;
        stock: number;
        actif: boolean;
        accroche: string | null;
        description: string | null;
        photo: string | null;
        galerie: string[];
      }[]
    >();
  return (data ?? []).map((p) => {
    const promo = p.prix_promo !== null && p.prix_promo < p.prix_vente ? p.prix_promo : null;
    return {
      id: p.id,
      nom: p.nom,
      categorie: p.categorie && CATEGORIES.includes(p.categorie) ? p.categorie : "Corps",
      prix: promo ?? p.prix_vente,
      prixAvant: promo === null ? null : p.prix_vente,
      accroche: p.accroche,
      description: p.description,
      photos: [p.photo, ...(p.galerie ?? [])].filter((x): x is string => Boolean(x)).map(urlPhoto),
      disponible: p.actif ? Math.max(0, p.stock) : 0,
    };
  });
}

export async function lireCommande(code: string) {
  const { data } = await createAdminClient()
    .from("commandes")
    .select(CHAMPS_COMMANDE)
    .eq("code", code)
    .maybeSingle<Commande>();
  return data;
}

/**
 * Rapproche une commande non payée du statut Jèko : payée, abandonnée, ou
 * toujours en attente. Rejouable : le retour de la cliente et le webhook
 * peuvent arriver tous les deux.
 */
export async function rapprocherCommande(c: Pick<Commande, "id" | "jeko_id" | "payee_le">) {
  if (c.payee_le || !c.jeko_id) return;
  const s = await statutPaiementJeko(c.jeko_id);
  if (!s) return;
  const admin = createAdminClient();
  if (s.statut === "success") {
    const { data } = await admin.rpc("payer_commande", { p_commande: c.id, p_transaction: s.transaction });
    if ((data as { premiere?: boolean } | null)?.premiere) await annoncerCommande(c.id);
  } else if (s.statut === "error") {
    await admin.rpc("abandonner_commande", { p_commande: c.id });
  }
}

const F = (n: number) => `${n.toLocaleString("fr-FR")} F`;

/** Commande payée : alerte aux gérantes, récapitulatif à la cliente si possible. */
async function annoncerCommande(id: string) {
  const { data: c } = await createAdminClient()
    .from("commandes")
    .select(CHAMPS_COMMANDE)
    .eq("id", id)
    .maybeSingle<Commande>();
  if (!c) return;
  const articles = c.lignes_commande.map((l) => `${l.quantite} × ${l.nom}`).join(", ");

  await alerterGerantes(
    `Commande boutique ${c.numero} payée, ${F(c.montant)} : ${c.nom} · ${c.telephone} · ${c.commune}, ${c.adresse} · ${articles}`,
  ).catch(() => null);

  // Hors de la fenêtre de 24 h, seul un modèle approuvé peut partir : la
  // cliente garde alors la page de suivi, et l'institut la contacte.
  if (await fenetreOuverte(c.telephone)) {
    const texte = [
      `Merci ${c.nom.split(" ")[0]} 🌸`,
      `Votre commande ${c.numero} est bien payée (${F(c.montant)}) :\n${c.lignes_commande
        .map((l) => `• ${l.quantite} × ${l.nom}`)
        .join("\n")}`,
      `Livraison Yango à ${c.commune}. Le livreur vous appellera ; la course se règle à la réception.`,
    ].join("\n\n");
    const r = await envoyerTexteWhatsapp(c.telephone, texte);
    await journaliserSortant({ telephone: c.telephone, texte, sens: "sortant", echec: r.ok ? null : r.erreur });
  }
}
