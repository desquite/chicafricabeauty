import { PageAVenir } from "@/components/page-a-venir";

export const metadata = { title: "Séances — Chic Africa Beauty Online" };

export default function PageSeances() {
  return (
    <PageAVenir
      titre="Séances"
      lot="Lot 2, puis lot 3 pour les photos"
      contenu={[
        "Saisie d'une séance : diagnostic de peau, soins réalisés, produits, durée",
        "Observations, réaction de la peau et évolution depuis la dernière venue",
        "Conseils donnés, produits conseillés et date du prochain rendez-vous",
        "Historique complet d'une cliente, séance après séance",
        "Photos avant et après, comparées côte à côte (lot 3)",
      ]}
    />
  );
}
