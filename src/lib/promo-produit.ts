/**
 * Promotion d'un produit, partagée par la boutique, la caisse et l'assistant,
 * et identique à prix_actuel en SQL : un prix réduit, jusqu'à promo_fin
 * incluse quand elle est renseignée. Abidjan est en UTC.
 */
export type PrixProduit = { prix_vente: number; prix_promo: number | null; promo_fin: string | null };

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Prix promo s'il s'applique ce jour-là, sinon null. */
export function promoProduit(p: PrixProduit, jour = aujourdhui()) {
  if (p.prix_promo === null || p.prix_promo >= p.prix_vente) return null;
  return !p.promo_fin || p.promo_fin >= jour ? p.prix_promo : null;
}
