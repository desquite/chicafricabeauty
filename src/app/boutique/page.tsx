import { CATEGORIES, catalogueBoutique } from "@/lib/boutique";
import Catalogue from "./catalogue";

// Prix et stock changent à chaque vente : lus à chaque visite.
export const dynamic = "force-dynamic";

export default async function PageBoutique() {
  const produits = await catalogueBoutique();
  // En vente avec photo d'abord, ruptures en fin de rayon.
  const rang = (p: (typeof produits)[number]) => (p.disponible > 0 ? 2 : 0) + (p.photos.length ? 1 : 0);
  const sections = CATEGORIES.map((categorie) => ({
    categorie,
    produits: produits.filter((p) => p.categorie === categorie).sort((a, b) => rang(b) - rang(a)),
  })).filter((s) => s.produits.length > 0);
  return <Catalogue sections={sections} />;
}
