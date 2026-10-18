import "server-only";
import { etatAcompte } from "@/lib/acompte";
import { envoyerMessageAcompte } from "@/lib/notifications/acompte";
import { aAnnuler, messageDuMatin, type RdvAcompte } from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tâches planifiées de l'acompte obligatoire.
 *
 *   7h   liens et rappels du jour (cron du récapitulatif)
 *   18h  annulation des rendez-vous du lendemain non réglés (cron acomptes)
 *
 * Seuls les rendez-vous marqués acompte_requis sont concernés : ceux créés
 * après l'allumage du réglage par la gérante.
 */

type Ligne = RdvAcompte & { id: string };

const CHAMPS = "id, date_rdv, created_at, source, acompte_requis, acompte_paye_le";

function aRegler() {
  return createAdminClient()
    .from("rendez_vous")
    .select(CHAMPS)
    .eq("statut", "prevu")
    .eq("acompte_requis", true)
    .is("acompte_paye_le", null)
    .is("remplace_par", null)
    .is("masque_le", null);
}

export async function envoyerMessagesDuMatin(maintenant = new Date()) {
  const jour = maintenant.toISOString().slice(0, 10);
  const dans3 = new Date(maintenant.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await aRegler()
    .gt("date_rdv", jour)
    .lte("date_rdv", dans3)
    .returns<Ligne[]>();
  if (error) throw new Error(`Lecture des acomptes impossible : ${error.message}`);

  const envois = [];
  for (const rdv of data ?? []) {
    const type = messageDuMatin(rdv, maintenant);
    if (!type) continue;
    envois.push({ rdv: rdv.id, type, ...(await envoyerMessageAcompte(rdv.id, type)) });
  }
  return envois;
}

export async function annulerAcomptesEchus(maintenant = new Date(), apercu = false) {
  const admin = createAdminClient();
  const jour = maintenant.toISOString().slice(0, 10);

  const { data, error } = await aRegler().gte("date_rdv", jour).returns<Ligne[]>();
  if (error) throw new Error(`Lecture des acomptes impossible : ${error.message}`);

  const resultats = [];
  for (const rdv of (data ?? []).filter((r) => aAnnuler(r, maintenant))) {
    // Un paiement peut avoir abouti sans que la notification soit encore
    // arrivee : on interroge AfribaPay avant d'annuler.
    const { data: enCours } = await admin
      .from("paiements_acompte")
      .select("order_id")
      .eq("rendez_vous_id", rdv.id)
      .eq("statut", "en_attente");
    let paye = false;
    for (const p of enCours ?? []) {
      if ((await etatAcompte(p.order_id)) === "reussi") paye = true;
    }
    if (paye) {
      resultats.push({ rdv: rdv.id, action: "payé entre-temps" });
      continue;
    }
    if (apercu) {
      resultats.push({ rdv: rdv.id, action: "serait annulé" });
      continue;
    }

    const { data: annule } = await admin
      .from("rendez_vous")
      .update({ statut: "annule", annulation_motif: "acompte_non_regle" })
      .eq("id", rdv.id)
      .eq("statut", "prevu")
      .is("acompte_paye_le", null)
      .select("id");
    if (!annule?.length) continue;

    resultats.push({ rdv: rdv.id, action: "annulé", ...(await envoyerMessageAcompte(rdv.id, "annule")) });
  }
  return resultats;
}
