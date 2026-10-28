import { NextResponse } from "next/server";
import { CHAMPS_COMMANDE, rapprocherCommande, type Commande } from "@/lib/boutique";
import { signatureJekoValide } from "@/lib/jeko";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook Jèko (TRANSACTION_COMPLETED), à déclarer dans le tableau de bord
 * Jèko : Paramètres › API & Webhooks.
 *
 * La signature prouve que l'appel vient de Jèko ; le statut, lui, est relu
 * chez Jèko avant de marquer la commande payée. Une notification rejouée ne
 * change rien de plus.
 */
export async function POST(requete: Request) {
  const corpsBrut = await requete.text();
  if (!signatureJekoValide(corpsBrut, requete.headers.get("jeko-signature"))) {
    return NextResponse.json({ erreur: "signature invalide" }, { status: 403 });
  }

  let n: { transactionDetails?: { id?: string; reference?: string } };
  try {
    n = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ erreur: "corps illisible" }, { status: 400 });
  }

  // La référence envoyée à la création est le numéro de commande.
  const reference = n.transactionDetails?.reference;
  if (!reference) return NextResponse.json({ recu: true });

  const { data: c } = await createAdminClient()
    .from("commandes")
    .select(CHAMPS_COMMANDE)
    .eq("numero", reference)
    .maybeSingle<Commande>();
  if (!c) return NextResponse.json({ recu: true });

  await rapprocherCommande(c);
  return NextResponse.json({ recu: true });
}
