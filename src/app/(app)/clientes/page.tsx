import { PageAVenir } from "@/components/page-a-venir";

export const metadata = { title: "Clientes — Chic Africa Beauty Online" };

export default function PageClientes() {
  return (
    <PageAVenir
      titre="Clientes"
      lot="Lot 1"
      contenu={[
        "Recherche par nom ou téléphone, et liste des clientes de l'institut",
        "Fiche d'accueil remplie par la cliente sur la tablette, en mode plein écran",
        "Bilan santé daté : allergies, traitement, grossesse, contre-indications",
        "Alertes de contre-indication affichées en rouge en haut de la fiche",
        "Consentement soin et consentement photo, signés au doigt sur l'écran",
      ]}
    />
  );
}
