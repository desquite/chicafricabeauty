import "server-only";
import { etatAcompte } from "@/lib/acompte";
import { etatVersement } from "@/lib/paiement-abonnement";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rattrapage des paiements restés « en attente ».
 *
 * La confirmation d'AfribaPay arrive normalement par notification, ou par la
 * page de paiement tant que la cliente la garde ouverte. Sur Wave, elle quitte
 * souvent la page pour payer et n'y revient pas ; si la notification se perd,
 * plus rien ne revérifiait avant l'annulation de 18h. Ce rattrapage interroge
 * AfribaPay pour chaque paiement en attente de moins de trois jours.
 */

const AGE_MIN_MS = 2 * 60_000;
const AGE_MAX_MS = 3 * 86_400_000;
const INTERVALLE_MS = 2 * 60_000;

let dernierPassage = 0;

export async function rattraperPaiementsEnAttente(): Promise<number> {
  // Déclenché à chaque page des gérantes : un passage au plus toutes les
  // deux minutes par instance suffit.
  if (Date.now() - dernierPassage < INTERVALLE_MS) return 0;
  dernierPassage = Date.now();

  const admin = createAdminClient();
  const avant = new Date(Date.now() - AGE_MIN_MS).toISOString();
  const apres = new Date(Date.now() - AGE_MAX_MS).toISOString();
  const [{ data: acomptes }, { data: versements }] = await Promise.all([
    admin
      .from("paiements_acompte")
      .select("order_id")
      .eq("statut", "en_attente")
      .lt("created_at", avant)
      .gt("created_at", apres)
      .limit(10)
      .returns<{ order_id: string }[]>(),
    admin
      .from("paiements_abonnement")
      .select("order_id")
      .eq("statut", "en_attente")
      .lt("created_at", avant)
      .gt("created_at", apres)
      .limit(10)
      .returns<{ order_id: string }[]>(),
  ]);

  let regles = 0;
  for (const p of acomptes ?? []) if ((await etatAcompte(p.order_id)) === "reussi") regles += 1;
  for (const p of versements ?? []) if ((await etatVersement(p.order_id)) === "reussi") regles += 1;
  return regles;
}
