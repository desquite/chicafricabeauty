import "server-only";
import { BATTEMENT_DEFAUT, calculerCreneaux, minutes } from "@/lib/creneaux";
import { estExpire, type RdvAcompte } from "@/lib/regles-acompte";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Heures libres de l'agenda, jour par jour, pour un soin d'une durée donnée :
 * horaires d'ouverture, fermetures, rendez-vous déjà pris et écart de
 * préparation, comme pour la réservation en ligne. Sert à planifier d'un coup
 * les séances d'un abonnement.
 */
export async function creneauxDuPersonnel(
  supabase: Client,
  p: { duree: number; jusquau: string; maintenant?: Date },
): Promise<Map<string, string[]>> {
  const maintenant = p.maintenant ?? new Date();
  const debut = maintenant.toISOString().slice(0, 10);

  const [horaires, fermetures, rdvs, reglages] = await Promise.all([
    supabase.from("horaires_semaine").select("jour, ouvert, ouverture, fermeture"),
    supabase
      .from("fermetures")
      .select("date_debut, date_fin, heure_debut, heure_fin")
      .lte("date_debut", p.jusquau)
      .gte("date_fin", debut),
    supabase
      .from("rendez_vous")
      .select(
        "date_rdv, heure_rdv, duree_min, created_at, source, acompte_requis, acompte_paye_le, soins_catalogue(duree_std)",
      )
      .eq("statut", "prevu")
      .is("remplace_par", null)
      .is("masque_le", null)
      .not("heure_rdv", "is", null)
      .gte("date_rdv", debut)
      .lte("date_rdv", p.jusquau)
      .returns<
        (RdvAcompte & {
          heure_rdv: string;
          duree_min: number | null;
          soins_catalogue: { duree_std: number | null } | null;
        })[]
      >(),
    supabase.from("reglages_rdv").select("battement_min").maybeSingle<{ battement_min: number }>(),
  ]);
  const erreur = horaires.error ?? fermetures.error ?? rdvs.error;
  if (erreur) throw new Error(`Lecture de l'agenda impossible : ${erreur.message}`);

  const horizon = Math.max(
    0,
    Math.round((Date.parse(`${p.jusquau}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000),
  );
  const jours = calculerCreneaux({
    horaires: horaires.data ?? [],
    fermetures: fermetures.data ?? [],
    occupations: (rdvs.data ?? [])
      .filter((r) => !estExpire(r, maintenant))
      .map((r) => {
        const d = minutes(r.heure_rdv);
        return { date: r.date_rdv, debut: d, fin: d + (r.duree_min ?? r.soins_catalogue?.duree_std ?? 60) };
      }),
    duree: p.duree,
    maintenant,
    horizonJours: horizon,
    battement: reglages.data?.battement_min ?? BATTEMENT_DEFAUT,
  });
  return new Map(jours.map((j) => [j.date, j.creneaux]));
}
