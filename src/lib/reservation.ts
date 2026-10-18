import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculerCreneaux, ajouterJours, minutes, type JourCreneaux } from "@/lib/creneaux";
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
    admin.from("reglages_rdv").select("horizon_jours").maybeSingle<{ horizon_jours: number }>(),
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
  const fin = saisie.international.slice(-8);

  const { data: candidates, error } = await admin
    .from("clientes")
    .select("id, telephone, email")
    .like("telephone", `%${fin.slice(-2)}`);
  if (error) return { erreur: error.message };

  const existante = candidates?.find((c) => c.telephone.replace(/\D/g, "").endsWith(fin));
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
    return { erreur: erreurCreation?.message ?? "Création de la fiche impossible." };
  }
  return { id: creee.id, nouvelle: true };
}
