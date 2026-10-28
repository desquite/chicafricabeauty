import { notFound } from "next/navigation";
import { catalogueBoutique } from "@/lib/boutique";
import Fiche from "./fiche";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = (await catalogueBoutique()).find((x) => x.id === id);
  return { title: p ? `${p.nom} — Chic Africa Beauty` : "Boutique — Chic Africa Beauty" };
}

export default async function PageProduit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const produits = await catalogueBoutique();
  const produit = produits.find((p) => p.id === id);
  if (!produit) notFound();
  // Même rayon, en vente, avec photo : de quoi compléter la routine.
  const suggestions = produits
    .filter((p) => p.id !== id && p.categorie === produit.categorie && p.disponible > 0 && p.photos.length)
    .slice(0, 2);
  return <Fiche produit={produit} suggestions={suggestions} tous={produits} />;
}
