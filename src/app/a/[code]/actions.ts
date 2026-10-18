"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { alerterGerantesRdv } from "@/lib/notifications/gerantes";
import { createAdminClient } from "@/lib/supabase/admin";
import { annulableEnLigne as annulable, DELAI_ANNULATION_H } from "./annulation";

/**
 * Annulation par la cliente, depuis son lien.
 *
 * Seulement sans acompte versé : l'acompte n'est pas remboursable et son sort
 * se règle avec l'institut, au téléphone. Le créneau est libéré aussitôt.
 */
export async function annulerParCliente(code: string): Promise<{ ok: boolean; erreur?: string }> {
  if (!/^[0-9a-f]{12}$/.test(code)) return { ok: false, erreur: "Lien invalide." };
  const admin = createAdminClient();

  const { data: rdv } = await admin
    .from("rendez_vous")
    .select("id, date_rdv, heure_rdv, statut, remplace_par, acompte_paye_le")
    .eq("code_acompte", code)
    .maybeSingle<{
      id: string;
      date_rdv: string;
      heure_rdv: string | null;
      statut: string;
      remplace_par: string | null;
      acompte_paye_le: string | null;
    }>();

  if (!rdv || rdv.statut !== "prevu" || rdv.remplace_par) {
    return { ok: false, erreur: "Ce rendez-vous n'est plus prévu." };
  }
  if (rdv.acompte_paye_le) {
    return { ok: false, erreur: "Un acompte a été versé : appelle l'institut pour annuler ou déplacer." };
  }
  if (!annulable(rdv.date_rdv, rdv.heure_rdv)) {
    return {
      ok: false,
      erreur: `L'annulation en ligne n'est plus possible à moins de ${DELAI_ANNULATION_H} h du rendez-vous : appelle l'institut.`,
    };
  }

  const { data: annule } = await admin
    .from("rendez_vous")
    .update({ statut: "annule", annulation_motif: "cliente" })
    .eq("id", rdv.id)
    .eq("statut", "prevu")
    .is("acompte_paye_le", null)
    .select("id");
  if (!annule?.length) return { ok: false, erreur: "L'annulation n'a pas pu aboutir." };

  after(() => alerterGerantesRdv(rdv.id, "Annulé par la cliente").catch(() => null));
  revalidatePath("/rendez-vous");
  revalidatePath(`/a/${code}`);
  return { ok: true };
}
