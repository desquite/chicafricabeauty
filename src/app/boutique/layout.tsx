import type { Metadata } from "next";
import { mulish } from "@/app/rdv/polices";
import { FournisseurPanier } from "./panier-etat";

export const metadata: Metadata = {
  title: "Boutique — Chic Africa Beauty",
  description:
    "Les soins naturels de l'institut Chic Africa Beauty, livrés à Abidjan par Yango. Paiement Wave, Orange Money, MTN, Moov ou Djamo.",
};

export default function LayoutBoutique({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${mulish.className} flex min-h-full flex-1 flex-col bg-creme text-brand-900`}>
      <FournisseurPanier>{children}</FournisseurPanier>
    </div>
  );
}
