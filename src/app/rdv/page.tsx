import { codeUssdOrange, paiementConfigure } from "@/lib/afribapay";
import { prestationsEnLigne } from "@/lib/reservation";
import { createAdminClient } from "@/lib/supabase/admin";
import Reservation, { type OffreAcompte } from "./reservation";

// Prix, promotions et prestations changent quand la gérante les modifie :
// la page est lue à chaque visite, jamais figée au déploiement.
export const dynamic = "force-dynamic";

/** L'acompte n'est proposé que si AfribaPay est configuré et un montant fixé. */
async function offreAcompte(): Promise<OffreAcompte | null> {
  if (!paiementConfigure()) return null;
  const { data } = await createAdminClient()
    .from("reglages_rdv")
    .select("acompte_montant")
    .maybeSingle<{ acompte_montant: number }>();
  const montant = data?.acompte_montant ?? 0;
  if (montant <= 0) return null;
  return { montant, ussdOrange: await codeUssdOrange() };
}

export default async function PageRdv() {
  const [prestations, acompte] = await Promise.all([prestationsEnLigne(), offreAcompte()]);
  return <Reservation prestations={prestations} acompte={acompte} />;
}
