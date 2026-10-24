/**
 * Mentions légales imprimées sur les reçus.
 *
 * À compléter dès que la gérante les fournit : tant qu'une valeur est vide,
 * la ligne n'apparaît pas sur le reçu. Pas de TVA : l'institut n'y est pas
 * assujetti.
 */
export const MENTIONS_LEGALES: { rccm: string | null; ncc: string | null } = {
  /** Registre du commerce et du crédit mobilier. */
  rccm: null,
  /** Numéro de compte contribuable. */
  ncc: null,
};
