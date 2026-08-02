import { PageAVenir } from "@/components/page-a-venir";

export const metadata = { title: "Catalogue — Chic Africa Beauty Online" };

export default function PageCatalogue() {
  return (
    <PageAVenir
      titre="Catalogue des soins"
      lot="Lot 2"
      contenu={[
        "Liste des soins de l'institut, modifiable par la gérante sans intervention technique",
        "Libellé, catégorie, durée standard et prix",
        "Activation ou retrait d'un soin sans perdre l'historique des séances passées",
      ]}
    />
  );
}
