/**
 * Créneaux libres de la réservation en ligne.
 *
 * Fonction pure, sans base ni horloge cachée : on lui donne les horaires, les
 * fermetures, les rendez-vous déjà pris et l'instant présent, elle rend les
 * heures de début possibles jour par jour. La même règle est revérifiée par
 * la fonction SQL reserver_en_ligne au moment de réserver ; celle-ci ne sert
 * qu'à l'affichage.
 *
 * Abidjan est en UTC toute l'année : dates et heures se lisent en UTC.
 */

export type HoraireCreneaux = {
  jour: number;
  ouvert: boolean;
  ouverture: string | null;
  fermeture: string | null;
};

export type FermetureCreneaux = {
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
};

/** Un rendez-vous qui occupe l'agenda, en minutes depuis minuit. */
export type Occupation = { date: string; debut: number; fin: number };

export type JourCreneaux = { date: string; creneaux: string[] };

/** Toutes les demi-heures : 7h30, 8h00, 8h30… */
export const PAS_MINUTES = 30;

export const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const versHeure = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function ajouterJours(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const chevauche = (a: number, b: number, c: number, d: number) => a < d && c < b;

/** Minutes de préparation de la salle entre deux rendez-vous, par défaut. */
export const BATTEMENT_DEFAUT = 30;

/**
 * Le créneau [debut, fin[ laisse-t-il trop peu de temps avec l'occupation o ?
 * Il faut battement minutes entre la fin de l'un et le début de l'autre,
 * dans les deux sens. Même règle que reserver_en_ligne.
 */
export const tropProche = (
  debut: number,
  fin: number,
  o: { debut: number; fin: number },
  battement: number,
) => chevauche(debut, fin + battement, o.debut, o.fin + battement);

export function calculerCreneaux({
  horaires,
  fermetures,
  occupations,
  duree,
  maintenant,
  horizonJours,
  battement = 0,
}: {
  horaires: HoraireCreneaux[];
  fermetures: FermetureCreneaux[];
  occupations: Occupation[];
  /** Durée de la prestation choisie, en minutes. */
  duree: number;
  maintenant: Date;
  horizonJours: number;
  /** Minutes à laisser libres avant et après chaque rendez-vous pris. */
  battement?: number;
}): JourCreneaux[] {
  const parJour = new Map(horaires.map((h) => [h.jour, h]));
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const minuteActuelle = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  const jours: JourCreneaux[] = [];

  for (let i = 0; i <= horizonJours; i++) {
    const date = ajouterJours(aujourdhui, i);
    const horaire = parJour.get(new Date(`${date}T00:00:00Z`).getUTCDay());
    const creneaux: string[] = [];

    if (horaire?.ouvert && horaire.ouverture && horaire.fermeture) {
      const ouverture = minutes(horaire.ouverture);
      const fermeture = minutes(horaire.fermeture);

      const bloques: [number, number][] = [];
      const pris: Occupation[] = [];
      let journeeFermee = false;
      for (const f of fermetures) {
        if (date < f.date_debut || date > f.date_fin) continue;
        if (!f.heure_debut || !f.heure_fin) {
          journeeFermee = true;
          break;
        }
        bloques.push([minutes(f.heure_debut), minutes(f.heure_fin)]);
      }
      for (const o of occupations) {
        if (o.date === date) pris.push(o);
      }

      if (!journeeFermee) {
        // Premiere demi-heure pleine apres l'ouverture : une ouverture a 7h45
        // propose 8h00, comme le verifie reserver_en_ligne.
        const premier = Math.ceil(ouverture / PAS_MINUTES) * PAS_MINUTES;
        for (let debut = premier; debut + duree <= fermeture; debut += PAS_MINUTES) {
          if (date === aujourdhui && debut <= minuteActuelle) continue;
          const fin = debut + duree;
          if (bloques.some(([a, b]) => chevauche(debut, fin, a, b))) continue;
          if (pris.some((o) => tropProche(debut, fin, o, battement))) continue;
          creneaux.push(versHeure(debut));
        }
      }
    }

    jours.push({ date, creneaux });
  }

  return jours;
}
