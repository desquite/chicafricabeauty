/**
 * Acomptes encaissés aujourd'hui : les paiements réussis du jour, quelle que
 * soit la date du rendez-vous. Compter les rendez-vous du jour laissait la
 * tuile à 0 quand une cliente payait aujourd'hui pour un soin à venir, le cas
 * le plus courant puisque l'acompte se règle la veille au plus tard.
 */
export function acomptesEncaisses(
  paiements: { montant: number; statut: string; updated_at: string }[],
  aujourdhui: string,
) {
  const reussis = paiements.filter(
    (p) => p.statut === "reussi" && p.updated_at.slice(0, 10) === aujourdhui,
  );
  return { total: reussis.reduce((t, p) => t + p.montant, 0), nombre: reussis.length };
}
