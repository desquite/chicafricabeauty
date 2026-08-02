import "server-only";

/**
 * Envoi WhatsApp via WasenderAPI.
 *
 * Contrat repris de PORTTRACK, éprouvé depuis plusieurs mois :
 *   POST https://wasenderapi.com/api/send-message
 *   Authorization: Bearer <WASENDER_API_KEY>
 *   { "sessionId": "...", "to": "+225XXXXXXXX", "text": "..." }
 *
 * ⚠️ WasenderAPI est un wrapper non officiel de WhatsApp Web. Ici les
 * messages ne partent qu'aux gérantes, à raison d'un par jour : le volume
 * est sans commune mesure avec un envoi client, et le risque de coupure
 * correspondant est faible.
 */
export type ResultatEnvoi = { ok: boolean; erreur?: string };

export async function envoyerWhatsapp(
  destinataire: string,
  texte: string,
): Promise<ResultatEnvoi> {
  const cle = process.env.WASENDER_API_KEY;
  const session = process.env.WASENDER_SESSION_ID;
  const url =
    process.env.WASENDER_API_URL ?? "https://wasenderapi.com/api/send-message";

  if (!cle || !session) {
    return { ok: false, erreur: "WASENDER_API_KEY ou WASENDER_SESSION_ID manquant" };
  }

  const numero = normaliser(destinataire);
  if (!numero) return { ok: false, erreur: `Numéro invalide : ${destinataire}` };

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId: session, to: numero, text: texte }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => "");
      return { ok: false, erreur: `WasenderAPI ${reponse.status} ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

/** Retire espaces, parenthèses et tirets ; garde le + initial. */
function normaliser(brut: string): string | null {
  const propre = brut.replace(/[\s()-]/g, "");
  if (!/^\+?\d{8,15}$/.test(propre)) return null;
  return propre.startsWith("+") ? propre : `+${propre}`;
}
