import { NextResponse } from "next/server";
import { appliquerStatut } from "@/lib/acompte";
import { signatureValide } from "@/lib/afribapay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Notification d'AfribaPay quand un paiement atteint son statut final.
 *
 * Trois contrôles avant d'y croire : la signature HMAC du corps brut, puis le
 * paiement retrouvé par son order_id, puis le montant et la devise comparés à
 * ce qui avait été demandé. Une notification rejouée ne change rien de plus.
 */
export async function POST(requete: Request) {
  const corpsBrut = await requete.text();

  if (!signatureValide(corpsBrut, requete.headers.get("afribapay-sign"))) {
    return NextResponse.json({ erreur: "signature invalide" }, { status: 403 });
  }

  let n: {
    status?: string;
    order_id?: string;
    transaction_id?: string;
    original_amount?: number;
    amount_total?: number;
    currency?: string;
  };
  try {
    n = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ erreur: "corps illisible" }, { status: 400 });
  }

  if (!n.order_id || (n.status !== "SUCCESS" && n.status !== "FAILED")) {
    // PENDING n'est pas un statut final : rien a faire, mais bien recu.
    return NextResponse.json({ recu: true });
  }

  const { data: paiement } = await createAdminClient()
    .from("paiements_acompte")
    .select("montant")
    .eq("order_id", n.order_id)
    .maybeSingle<{ montant: number }>();
  if (!paiement) {
    return NextResponse.json({ erreur: "paiement inconnu" }, { status: 404 });
  }

  const montantRecu = Number(n.original_amount ?? n.amount_total);
  if (n.status === "SUCCESS" && (n.currency !== "XOF" || montantRecu !== paiement.montant)) {
    console.error(
      `AfribaPay : montant inattendu pour ${n.order_id} (${montantRecu} ${n.currency}, attendu ${paiement.montant} XOF)`,
    );
    return NextResponse.json({ erreur: "montant inattendu" }, { status: 422 });
  }

  await appliquerStatut(n.order_id, n.status, n.transaction_id ?? null);
  return NextResponse.json({ recu: true });
}
