import "server-only";
import { ajouterJours, finAbonnement, situationPaiement, type Abonnement } from "@/lib/abonnements";
import { envoyerMessageAbonnement } from "@/lib/notifications/abonnement";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tâche du matin (7h, cron du récapitulatif) pour les abonnements.
 *
 *   - rappel 3 jours avant chaque échéance, puis le jour même si rien n'est
 *     arrivé ; la 1re échéance part avec le lien, à la création
 *   - un abonnement dont la fin est passée devient « terminé »
 *
 * Aucune annulation : une échéance en retard s'affiche dans « À traiter »,
 * la gérante décide.
 */
export async function tachesAbonnementsDuMatin(maintenant = new Date()) {
  const admin = createAdminClient();
  const jour = maintenant.toISOString().slice(0, 10);

  const [{ data: abos, error }, { data: versements }] = await Promise.all([
    admin.from("abonnements").select("*").in("statut", ["actif", "pause"]).returns<Abonnement[]>(),
    admin
      .from("paiements_abonnement")
      .select("abonnement_id, montant")
      .eq("statut", "reussi")
      .returns<{ abonnement_id: string; montant: number }[]>(),
  ]);
  if (error) throw new Error(`Lecture des abonnements impossible : ${error.message}`);

  const paye = new Map<string, number>();
  for (const v of versements ?? []) paye.set(v.abonnement_id, (paye.get(v.abonnement_id) ?? 0) + v.montant);

  const envois = [];
  const termines = [];
  for (const a of abos ?? []) {
    if (a.statut === "actif" && finAbonnement(a) < jour) {
      await admin.from("abonnements").update({ statut: "termine" }).eq("id", a.id);
      termines.push(a.id);
      continue;
    }
    const prochaine = situationPaiement(a, paye.get(a.id) ?? 0, jour).prochaine;
    if (!prochaine || prochaine.rang === 1) continue;
    if (prochaine.date === ajouterJours(jour, 3) || prochaine.date === jour) {
      envois.push({ abonnement: a.id, rang: prochaine.rang, ...(await envoyerMessageAbonnement(a.id, "rappel")) });
    }
  }
  return { envois, termines };
}
