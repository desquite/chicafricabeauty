import { catalogueBoutique } from "@/lib/boutique";
import Commander from "./commander";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon panier — Chic Africa Beauty" };

export default async function PagePanier() {
  return <Commander produits={await catalogueBoutique()} />;
}
