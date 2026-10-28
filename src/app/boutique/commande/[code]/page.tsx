import { notFound } from "next/navigation";
import { lireCommande, rapprocherCommande } from "@/lib/boutique";
import Suivi from "./suivi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma commande — Chic Africa Beauty", robots: { index: false } };

/**
 * Page de retour après Jèko, et page de suivi. Le paramètre ?retour= ne
 * décide de rien : le statut est relu chez Jèko tant que la commande attend.
 */
export default async function PageCommande({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let commande = await lireCommande(code);
  if (!commande) notFound();
  if (commande.statut === "en_attente" || (!commande.payee_le && commande.jeko_id)) {
    await rapprocherCommande(commande);
    commande = (await lireCommande(code)) ?? commande;
  }
  return <Suivi commande={commande} />;
}
