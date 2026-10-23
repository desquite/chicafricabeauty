import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BATTEMENT_DEFAUT,
  calculerCreneaux,
  ajouterJours,
  minutes,
  type JourCreneaux,
} from "@/lib/creneaux";
import { dureeLisible, fcfa, prixDuJour } from "@/lib/disponibilites";
import { estExpire, type RdvAcompte } from "@/lib/regles-acompte";
import type { GroupeSoin, SoinCatalogue } from "@/lib/types";

/**
 * Lectures de la page publique /rdv.
 *
 * La page n'a pas de session : tout passe par le client de service, côté
 * serveur. Elle ne renvoie au navigateur que des prestations et des heures
 * libres — jamais un nom, un numéro ou un rendez-vous d'une autre cliente.
 */

export type PrestationPublique = {
  id: string;
  nom: string;
  duree: string;
  prix: string;
  /** Prix normal barré pendant une promotion, sinon null. */
  prixBarre: string | null;
  /** Dernier jour de la promotion en cours, sinon null. */
  promoJusquau: string | null;
  /** Prix du jour en chiffres, pour le « dès … » des groupes. */
  prixValeur: number | null;
  description: string | null;
  groupe: GroupeSoin | null;
};

export const aujourdhuiAbidjan = () => new Date().toISOString().slice(0, 10);

export async function prestationsEnLigne(): Promise<PrestationPublique[]> {
  const { data, error } = await createAdminClient()
    .from("soins_catalogue")
    .select("*")
    .eq("actif", true)
    .eq("en_ligne", true)
    .order("ordre")
    .returns<SoinCatalogue[]>();
  if (error) throw new Error(`Lecture des prestations impossible : ${error.message}`);

  const jour = aujourdhuiAbidjan();
  return data.map((s) => {
    const prix = prixDuJour(s, jour);
    const enPromo = prix !== s.prix;
    return {
      id: s.id,
      nom: s.libelle_public || s.libelle,
      duree: dureeLisible(s.duree_std),
      prix: fcfa(prix),
      prixBarre: enPromo ? fcfa(s.prix) : null,
      promoJusquau: enPromo ? s.promo_fin : null,
      prixValeur: prix,
      description: s.description,
      groupe: s.groupe,
    };
  });
}

/** Créneaux libres d'une prestation, sur tout l'horizon de réservation. */
export async function creneauxLibres(soinId: string): Promise<JourCreneaux[] | null> {
  const admin = createAdminClient();
  const maintenant = new Date();
  const debut = maintenant.toISOString().slice(0, 10);

  const [soin, reglages, horaires] = await Promise.all([
    admin
      .from("soins_catalogue")
      .select("duree_std")
      .eq("id", soinId)
      .eq("actif", true)
      .eq("en_ligne", true)
      .maybeSingle<{ duree_std: number | null }>(),
    admin
      .from("reglages_rdv")
      .select("horizon_jours, battement_min")
      .maybeSingle<{ horizon_jours: number; battement_min: number }>(),
    admin.from("horaires_semaine").select("jour, ouvert, ouverture, fermeture"),
  ]);
  if (!soin.data?.duree_std) return null;

  const horizon = reglages.data?.horizon_jours ?? 60;
  const fin = ajouterJours(debut, horizon);

  const [fermetures, rdvs] = await Promise.all([
    admin
      .from("fermetures")
      .select("date_debut, date_fin, heure_debut, heure_fin")
      .lte("date_debut", fin)
      .gte("date_fin", debut),
    admin
      .from("rendez_vous")
      .select(
        "date_rdv, heure_rdv, duree_min, created_at, source, acompte_requis, acompte_paye_le, soins_catalogue(duree_std)",
      )
      .eq("statut", "prevu")
      .is("remplace_par", null)
      .is("masque_le", null)
      .not("heure_rdv", "is", null)
      .gte("date_rdv", debut)
      .lte("date_rdv", fin)
      .returns<
        (RdvAcompte & {
          heure_rdv: string;
          duree_min: number | null;
          soins_catalogue: { duree_std: number | null } | null;
        })[]
      >(),
  ]);

  const erreur = horaires.error ?? fermetures.error ?? rdvs.error;
  if (erreur) throw new Error(`Lecture des disponibilités impossible : ${erreur.message}`);

  return calculerCreneaux({
    horaires: horaires.data ?? [],
    fermetures: fermetures.data ?? [],
    // Même repli que reserver_en_ligne : sans durée connue, une heure. Un
    // acompte requis et non payé à l'échéance ne bloque plus le créneau.
    occupations: (rdvs.data ?? []).filter((r) => !estExpire(r, maintenant)).map((r) => {
      const d = minutes(r.heure_rdv);
      return {
        date: r.date_rdv,
        debut: d,
        fin: d + (r.duree_min ?? r.soins_catalogue?.duree_std ?? 60),
      };
    }),
    duree: soin.data.duree_std,
    maintenant,
    horizonJours: horizon,
    battement: reglages.data?.battement_min ?? BATTEMENT_DEFAUT,
  });
}

/**
 * Numéro ivoirien à 10 chiffres, avec ou sans indicatif. Rend les 10
 * chiffres, ou null si le numéro n'en est pas un.
 */
export function chiffresIvoiriens(saisie: string) {
  let c = saisie.replace(/\D/g, "");
  if (c.startsWith("00225")) c = c.slice(5);
  else if (c.length === 13 && c.startsWith("225")) c = c.slice(3);
  return /^\d{10}$/.test(c) ? c : null;
}

type ClienteConnue = {
  id: string;
  nom_complet: string;
  prenom_usuel: string | null;
  telephone: string;
  email: string | null;
};

/**
 * La cliente qui porte ce numéro, ou null. Les numéros déjà en base ont été
 * saisis sous toutes les formes : seuls les 8 derniers chiffres comptent,
 * comme pour la recherche de doublon de la tablette.
 */
export async function trouverCliente(
  international: string,
): Promise<{ cliente: ClienteConnue | null } | { erreur: string }> {
  const fin = international.slice(-8);
  const { data, error } = await createAdminClient()
    .from("clientes")
    .select("id, nom_complet, prenom_usuel, telephone, email")
    .like("telephone", `%${fin.slice(-2)}%`)
    .returns<ClienteConnue[]>();
  if (error) return { erreur: `${error.code ?? "?"} ${error.message}` };
  return { cliente: data.find((c) => c.telephone.replace(/\D/g, "").endsWith(fin)) ?? null };
}

/**
 * Ce que la page publique montre d'une cliente reconnue : son prénom usuel,
 * sinon le premier mot de son nom suivi de l'initiale du suivant. « Awa K. »,
 * jamais le nom complet : la page est ouverte à tous.
 */
export function salutation(c: Pick<ClienteConnue, "nom_complet" | "prenom_usuel">) {
  const usuel = c.prenom_usuel?.trim();
  if (usuel) return usuel.split(/\s+/)[0];
  const mots = c.nom_complet.trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return "";
  // « KONÉ » devient « Koné », « Marie-Christelle » reste tel quel.
  const majuscule = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
  const premier = (mots[0] === mots[0].toUpperCase() ? mots[0].toLowerCase() : mots[0])
    .split("-")
    .map(majuscule)
    .join("-");
  return mots[1] ? `${premier} ${mots[1].charAt(0).toUpperCase()}.` : premier;
}

/**
 * Retrouve la cliente par son numéro, sinon la crée. Les numéros déjà en base
 * ont été saisis sous toutes les formes : seuls les 8 derniers chiffres
 * comptent, comme pour la recherche de doublon de la tablette.
 */
export async function clientePourReservation(saisie: {
  nom: string;
  /** Chiffres internationaux, indicatif compris (2250701020304). */
  international: string;
  /** Forme enregistrée sur la fiche (+225 07 01 02 03 04). */
  affiche: string;
  email: string;
}): Promise<{ id: string; nouvelle: boolean } | { erreur: string }> {
  const admin = createAdminClient();
  const trouvee = await trouverCliente(saisie.international);
  if ("erreur" in trouvee) return trouvee;

  const existante = trouvee.cliente;
  if (existante) {
    if (saisie.email && !existante.email) {
      await admin.from("clientes").update({ email: saisie.email }).eq("id", existante.id);
    }
    return { id: existante.id, nouvelle: false };
  }

  const { data: creee, error: erreurCreation } = await admin
    .from("clientes")
    .insert({
      nom_complet: saisie.nom,
      telephone: saisie.affiche,
      email: saisie.email || null,
    })
    .select("id")
    .single();
  if (erreurCreation || !creee) {
    // Numéro déjà en base sous une forme que la recherche n'a pas reconnue
    // (espace en trop, autre écriture) : on reprend la fiche existante plutôt
    // que de refuser la réservation.
    if (erreurCreation?.code === "23505") {
      const { data: meme } = await admin
        .from("clientes")
        .select("id")
        .eq("telephone", saisie.affiche)
        .maybeSingle<{ id: string }>();
      if (meme) return { id: meme.id, nouvelle: false };
    }
    return {
      erreur: erreurCreation
        ? `${erreurCreation.code ?? "?"} ${erreurCreation.message}`
        : "Création de la fiche impossible.",
    };
  }
  return { id: creee.id, nouvelle: true };
}
