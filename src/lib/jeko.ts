import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Jèko, le moyen de paiement de la boutique.
 *
 *   POST https://api.jeko.africa/partner_api/payment_requests
 *   X-API-KEY, X-API-KEY-ID
 *   { storeId, amountCents, currency: "XOF", reference,
 *     paymentDetails: { type: "redirect", data: { paymentMethod, successUrl, errorUrl } } }
 *   → { id, status, redirectUrl }
 *
 * La cliente est renvoyée vers redirectUrl, valide chez son opérateur, puis
 * revient sur successUrl ou errorUrl. Ce retour ne prouve rien : seul le
 * statut lu chez Jèko (GET /payment_requests/{id}) fait foi, que l'on y
 * arrive par le retour de la cliente ou par le webhook TRANSACTION_COMPLETED.
 *
 * Montant en « centimes », multiple de 100 : 12 000 F s'envoient 1 200 000.
 * Pas de bac à sable chez Jèko : la convention est à vérifier sur la page de
 * paiement avant toute mise en vente.
 */

const BASE = "https://api.jeko.africa/partner_api";

export type MoyenJeko = "wave" | "orange" | "mtn" | "moov" | "djamo";
export const MOYENS_JEKO: MoyenJeko[] = ["wave", "orange", "mtn", "moov", "djamo"];

export type StatutJeko = "pending" | "success" | "error";

function identifiants() {
  const cle = process.env.JEKO_API_KEY;
  const idCle = process.env.JEKO_API_KEY_ID;
  const boutique = process.env.JEKO_STORE_ID;
  if (!cle || !idCle || !boutique) return null;
  return { cle, idCle, boutique };
}

export const jekoConfigure = () => identifiants() !== null;

export async function creerPaiementJeko(p: {
  montant: number;
  reference: string;
  moyen: MoyenJeko;
  retourOk: string;
  retourErreur: string;
}): Promise<{ ok: true; id: string; lien: string } | { ok: false; erreur: string }> {
  const ids = identifiants();
  if (!ids) return { ok: false, erreur: "JEKO_API_KEY, JEKO_API_KEY_ID ou JEKO_STORE_ID manquant" };
  try {
    const reponse = await fetch(`${BASE}/payment_requests`, {
      method: "POST",
      headers: { "X-API-KEY": ids.cle, "X-API-KEY-ID": ids.idCle, "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: ids.boutique,
        amountCents: p.montant * 100,
        currency: "XOF",
        reference: p.reference,
        paymentDetails: {
          type: "redirect",
          data: { paymentMethod: p.moyen, successUrl: p.retourOk, errorUrl: p.retourErreur },
        },
      }),
    });
    const corps = await reponse.text();
    if (!reponse.ok) return { ok: false, erreur: `Jèko ${reponse.status} ${corps.slice(0, 200)}` };
    const json = JSON.parse(corps) as { id?: string; redirectUrl?: string; errorReason?: string | null };
    if (!json.id || !json.redirectUrl) {
      return { ok: false, erreur: `Jèko : réponse incomplète ${json.errorReason ?? ""}`.trim() };
    }
    return { ok: true, id: json.id, lien: json.redirectUrl };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

/** Statut d'une demande de paiement, lu chez Jèko ; null si illisible. */
export async function statutPaiementJeko(
  id: string,
): Promise<{ statut: StatutJeko; transaction: string | null } | null> {
  const ids = identifiants();
  if (!ids) return null;
  try {
    const reponse = await fetch(`${BASE}/payment_requests/${encodeURIComponent(id)}`, {
      headers: { "X-API-KEY": ids.cle, "X-API-KEY-ID": ids.idCle },
      cache: "no-store",
    });
    if (!reponse.ok) return null;
    const json = (await reponse.json()) as { status?: string; transaction?: { id?: string } | null };
    const statut = json.status === "success" || json.status === "error" ? json.status : "pending";
    return { statut, transaction: json.transaction?.id ?? null };
  } catch {
    return null;
  }
}

/** En-tête Jeko-Signature : HMAC-SHA256 du corps brut, en hexadécimal. */
export function signatureJekoValide(corpsBrut: string, signature: string | null) {
  const secret = process.env.JEKO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const attendu = createHmac("sha256", secret).update(corpsBrut).digest("hex");
  const a = Buffer.from(attendu);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
