import { prestationsEnLigne } from "@/lib/reservation";
import Reservation from "./reservation";

// Prix, promotions et prestations changent quand la gérante les modifie :
// la page est lue à chaque visite, jamais figée au déploiement.
export const dynamic = "force-dynamic";

export default async function PageRdv() {
  const prestations = await prestationsEnLigne();
  return <Reservation prestations={prestations} />;
}
