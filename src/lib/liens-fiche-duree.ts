/**
 * Durée de validité d'un lien de fiche, à part de liens-fiche.ts : l'écran
 * du personnel l'affiche, et ce module-là est réservé au serveur.
 *
 * Trois jours : assez pour qu'une cliente remplisse la veille de sa venue,
 * pas assez pour qu'un lien oublié dans une conversation reste ouvert.
 */
export const DUREE_LIEN_HEURES = 72;
