import { createAdminClient } from "@/lib/supabase/admin";
import { imageRecu, type FactureImage } from "@/lib/recu-image";

/**
 * Image PNG d'un reçu, pour l'en-tête du message WhatsApp « recu_facture ».
 *
 * Adresse publique, car Meta télécharge l'image lui-même : /api/recu/<jeton>.png,
 * où le jeton aléatoire de la facture (24 caractères) ne donne accès qu'à ce
 * reçu-là. Une facture encore en brouillon n'a pas d'image.
 */

const JETON = /^([0-9a-f]{24}).png$/;

export async function GET(_requete: Request, { params }: { params: Promise<{ fichier: string }> }) {
  const { fichier } = await params;
  const jeton = JETON.exec(fichier)?.[1];
  if (!jeton) return new Response("Introuvable", { status: 404 });

  const { data: f } = await createAdminClient()
    .from("factures")
    .select(
      "statut, numero_affiche, montant_soins_normal, montant_soins, montant_produits, remise_fidelite, acompte_deduit, total, mode_paiement, payee_le, clientes(nom_complet), lignes_facture(type, libelle, quantite, prix_unitaire, ordre)",
    )
    .eq("jeton_public", jeton)
    .maybeSingle<FactureImage>();
  if (!f || f.statut === "brouillon") return new Response("Introuvable", { status: 404 });
  return imageRecu(f);
}
