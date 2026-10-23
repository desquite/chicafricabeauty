import { codeUssdOrange, paiementConfigure } from "@/lib/afribapay";
import { prestationsEnLigne } from "@/lib/reservation";
import { createAdminClient } from "@/lib/supabase/admin";
import Reservation, { type OffreAcompte } from "./reservation";

// Prix, promotions et prestations changent quand la gérante les modifie :
// la page est lue à chaque visite, jamais figée au déploiement.
export const dynamic = "force-dynamic";

// La reservation attend jusqu a 45 s avant d envoyer le lien de paiement
// (actions.ts) : la fonction doit vivre jusque-la.
export const maxDuration = 60;

/** L'acompte n'est proposé que si AfribaPay est configuré et un montant fixé. */
async function offreAcompte(): Promise<OffreAcompte | null> {
  if (!paiementConfigure()) return null;
  const { data } = await createAdminClient()
    .from("reglages_rdv")
    .select("acompte_montant, acompte_obligatoire")
    .maybeSingle<{ acompte_montant: number; acompte_obligatoire: boolean }>();
  const montant = data?.acompte_montant ?? 0;
  if (montant <= 0) return null;
  return {
    montant,
    ussdOrange: await codeUssdOrange(),
    obligatoire: Boolean(data?.acompte_obligatoire),
  };
}

export default async function PageRdv() {
  const [prestations, acompte] = await Promise.all([prestationsEnLigne(), offreAcompte()]);
  return <Reservation prestations={prestations} acompte={acompte} />;
}
