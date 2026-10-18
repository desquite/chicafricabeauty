import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * AfribaPay : encaissement Mobile Money des acomptes (docs.afribapay.com).
 *
 * Quatre variables d'environnement, côté serveur seulement :
 *   AFRIBAPAY_BASE_URL      api-sandbox.afribapay.com en essai, l'adresse de
 *                           production ensuite — les identifiants ne passent
 *                           pas de l'une à l'autre
 *   AFRIBAPAY_API_USER      identifiant API (pk_…)
 *   AFRIBAPAY_API_KEY       clé API (sk_…), qui signe aussi les notifications
 *   AFRIBAPAY_MERCHANT_KEY  clé marchand (mk_…)
 *
 * Tant qu'elles manquent, l'acompte n'est pas proposé : la réservation marche
 * sans.
 *
 * Attention : d'après AfribaPay, même leur environnement d'essai peut faire
 * passer de l'argent réel.
 */

export type Operateur = "orange" | "mtn" | "moov" | "wave";
export const OPERATEURS: readonly Operateur[] = ["orange", "mtn", "moov", "wave"];

export type StatutAfriba = "PENDING" | "SUCCESS" | "FAILED";

type Config = { base: string; utilisateur: string; cle: string; marchand: string };

function config(): Config | null {
  const base = process.env.AFRIBAPAY_BASE_URL;
  const utilisateur = process.env.AFRIBAPAY_API_USER;
  const cle = process.env.AFRIBAPAY_API_KEY;
  const marchand = process.env.AFRIBAPAY_MERCHANT_KEY;
  if (!base || !utilisateur || !cle || !marchand) return null;
  const hote = base.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { base: `https://${hote}`, utilisateur, cle, marchand };
}

export const paiementConfigure = () => config() !== null;

/**
 * Identifiants refusés par AfribaPay (401 ou 403 sur le jeton) : mauvaise
 * clé, ou clé d'essai sur l'adresse de production et inversement.
 */
class ErreurAcces extends Error {}

/* ------------------------------------------------------- Jeton d'accès */

// Valable 24 h : on le garde le temps de l'instance plutôt que d'en
// redemander un à chaque paiement, comme AfribaPay le recommande.
let jetonEnCache: { valeur: string; expire: number } | null = null;

async function jetonAcces(c: Config, forcer = false) {
  if (!forcer && jetonEnCache && jetonEnCache.expire > Date.now()) return jetonEnCache.valeur;

  const reponse = await fetch(`${c.base}/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.utilisateur}:${c.cle}`).toString("base64")}`,
      Accept: "application/json",
    },
  });
  const corps = await reponse.json().catch(() => null);
  const valeur = corps?.data?.access_token;
  if (!reponse.ok || typeof valeur !== "string") {
    throw new ErreurAcces(`AfribaPay a refusé l'authentification (${reponse.status}).`);
  }
  const duree = Number(corps.data.expires_in) || 3600;
  jetonEnCache = { valeur, expire: Date.now() + (duree - 300) * 1000 };
  return valeur;
}

/** Appel authentifié ; un 401 renouvelle le jeton et réessaie une fois. */
async function appeler(c: Config, chemin: string, init: RequestInit = {}) {
  for (const forcer of [false, true]) {
    const reponse = await fetch(`${c.base}${chemin}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${await jetonAcces(c, forcer)}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    if (reponse.status === 401 && !forcer) continue;
    const corps = await reponse.json().catch(() => null);
    return { reponse, corps };
  }
  throw new Error("AfribaPay injoignable.");
}

function messageErreur(corps: unknown, statut: number) {
  const c = corps as { message?: unknown; error?: { message?: unknown } | unknown } | null;
  const m =
    (typeof c?.message === "string" && c.message) ||
    (typeof (c?.error as { message?: unknown })?.message === "string" &&
      (c!.error as { message: string }).message) ||
    (typeof c?.error === "string" && c.error);
  return m ? `${m} (${statut})` : `Réponse ${statut}`;
}

/* --------------------------------------------------------- Encaissement */

export type ResultatPayin =
  | { ok: true; statut: StatutAfriba; transactionId: string | null; lien: string | null }
  /** acces : identifiants refusés ; rien à voir avec la cliente. */
  | { ok: false; erreur: string; acces?: boolean };

export async function lancerPayin(p: {
  operateur: Operateur;
  /** Numéro ivoirien à 10 chiffres, sans indicatif. */
  telephone: string;
  montant: number;
  orderId: string;
  reference: string;
  notifyUrl: string;
  /** Orange Côte d'Ivoire exige un code généré par la cliente. */
  otp?: string;
}): Promise<ResultatPayin> {
  const c = config();
  if (!c) return { ok: false, erreur: "Paiement en ligne non configuré." };

  try {
    const { reponse, corps } = await appeler(c, "/v1/pay/payin", {
      method: "POST",
      body: JSON.stringify({
        operator: p.operateur,
        country: "CI",
        phone_number: `225${p.telephone}`,
        amount: p.montant,
        currency: "XOF",
        order_id: p.orderId,
        merchant_key: c.marchand,
        reference_id: p.reference,
        lang: "fr",
        notify_url: p.notifyUrl,
        ...(p.otp ? { otp_code: p.otp } : {}),
      }),
    });
    const data = corps?.data;
    const statut = data?.status as StatutAfriba | undefined;
    if (!reponse.ok || !statut) {
      return { ok: false, erreur: messageErreur(corps, reponse.status) };
    }
    return {
      ok: true,
      statut,
      transactionId: typeof data.transaction_id === "string" ? data.transaction_id : null,
      lien: typeof data.provider_link === "string" ? data.provider_link : null,
    };
  } catch (e) {
    return {
      ok: false,
      erreur: e instanceof Error ? e.message : "Erreur réseau",
      acces: e instanceof ErreurAcces,
    };
  }
}

/** Statut d'une transaction, en secours quand la notification tarde. */
export async function statutPayin(orderId: string): Promise<StatutAfriba | null> {
  const c = config();
  if (!c) return null;
  try {
    const { reponse, corps } = await appeler(
      c,
      `/v1/status?order_id=${encodeURIComponent(orderId)}`,
    );
    const statut = corps?.data?.status;
    return reponse.ok && ["PENDING", "SUCCESS", "FAILED"].includes(statut) ? statut : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------- Notifications */

/**
 * AfribaPay signe le corps brut de chaque notification en HMAC-SHA256 avec la
 * clé API, dans l'en-tête Afribapay-Sign. Le corps doit être celui reçu, à
 * l'octet près : jamais un JSON relu puis réécrit.
 */
export function signatureValide(corpsBrut: string, signature: string | null) {
  const c = config();
  if (!c || !signature) return false;
  const attendue = createHmac("sha256", c.cle).update(corpsBrut, "utf8").digest("hex");
  const a = Buffer.from(attendue, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------- Code Orange */

let ussdOrange: { code: string | null; lu: number } | null = null;

/**
 * Code USSD qu'une cliente Orange compose pour obtenir son code de paiement.
 * Lu chez AfribaPay (/v1/countries) plutôt qu'écrit en dur : c'est l'opérateur
 * qui le fixe. Gardé une journée.
 */
export async function codeUssdOrange(): Promise<string | null> {
  if (ussdOrange && Date.now() - ussdOrange.lu < 86_400_000) return ussdOrange.code;
  const c = config();
  if (!c) return null;
  let code: string | null = null;
  try {
    const { corps } = await appeler(c, "/v1/countries");
    const chercher = (v: unknown): void => {
      if (code || !v || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      const pays = String(o.country_code ?? o.country ?? "").toUpperCase();
      const op = String(o.operator_code ?? o.operator ?? "").toLowerCase();
      if (pays === "CI" && op === "orange" && typeof o.ussd_code === "string" && o.ussd_code) {
        code = o.ussd_code;
        return;
      }
      // Les opérateurs peuvent être rangés sous leur pays.
      for (const [k, enfant] of Object.entries(o)) {
        if (Array.isArray(enfant) || (enfant && typeof enfant === "object")) {
          if (pays === "CI" && k.toLowerCase().includes("operator")) {
            for (const e of Object.values(enfant as object)) {
              chercher({ ...(e as object), country_code: "CI" });
            }
          } else {
            chercher(enfant);
          }
        }
      }
    };
    chercher(corps);
  } catch {
    // Sans code connu, l'écran donne une consigne générale.
  }
  ussdOrange = { code, lu: Date.now() };
  return code;
}
