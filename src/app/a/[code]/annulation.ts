/** Délai d'annulation par la cliente, comme sur la confirmation Krenup. */
export const DELAI_ANNULATION_H = 24;

/** La cliente peut-elle encore annuler elle-même ? Même règle à l'affichage et à l'action. */
export function annulableEnLigne(date: string, heure: string | null, maintenant = new Date()) {
  const debut = new Date(`${date}T${(heure ?? "00:00").slice(0, 5)}:00Z`);
  return debut.getTime() - maintenant.getTime() >= DELAI_ANNULATION_H * 3_600_000;
}
