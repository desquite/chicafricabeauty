import "server-only";

/**
 * Deux canaux WhatsApp, le temps de la bascule.
 *
 * **WasenderAPI** — pont non officiel vers WhatsApp Web. Texte libre, aucune
 * contrainte de forme, mais session coupable sans preavis et protection de
 * compte a un message toutes les cinq secondes. Reste le canal des gerantes :
 * leur recapitulatif est une liste de longueur variable, qu'aucun modele
 * WhatsApp ne sait porter.
 *
 * **Infobip** — API officielle. Hors de la fenetre de 24 h ouverte par un
 * message de la cliente, seuls des modeles approuves par Meta peuvent partir.
 * C'est le canal des clientes, active fiche par fiche.
 */
export type ResultatEnvoi = { ok: boolean; erreur?: string };

/* -------------------------------------------------------------- WasenderAPI */

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

/* ------------------------------------------------------------------ Infobip */

/**
 * Envoi d'un modele approuve.
 *
 *   POST https://<base>/whatsapp/1/message/template
 *   Authorization: App <cle>
 *   { "messages": [ { "from", "to",
 *       "content": { "templateName", "templateData": { "body": { "placeholders" } },
 *                    "language" } } ] }
 *
 * Forme relevee sur la console Infobip elle-meme, a l'onglet JSON de chaque
 * modele : c'est la source la moins susceptible de mentir.
 */
export async function envoyerModeleWhatsapp(
  destinataire: string,
  modele: string,
  placeholders: string[],
  langue = "fr",
): Promise<ResultatEnvoi> {
  const cle = process.env.INFOBIP_API_KEY;
  const base = process.env.INFOBIP_BASE_URL;
  const expediteur = process.env.INFOBIP_SENDER;

  if (!cle || !base || !expediteur) {
    return {
      ok: false,
      erreur: "INFOBIP_API_KEY, INFOBIP_BASE_URL ou INFOBIP_SENDER manquant",
    };
  }

  const numero = chiffresSeuls(destinataire);
  if (!numero) return { ok: false, erreur: `Numéro invalide : ${destinataire}` };

  // Une variable vide fait rejeter le message par Meta. Mieux vaut le voir ici,
  // avec le nom du modele en clair, que dans un code d'erreur distant.
  if (placeholders.some((p) => p.trim() === "")) {
    return { ok: false, erreur: `Variable vide pour le modèle ${modele}` };
  }

  const hote = base.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  try {
    const reponse = await fetch(`https://${hote}/whatsapp/1/message/template`, {
      method: "POST",
      headers: {
        Authorization: `App ${cle}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            from: chiffresSeuls(expediteur),
            to: numero,
            content: {
              templateName: modele,
              templateData: { body: { placeholders } },
              language: langue,
            },
          },
        ],
      }),
    });

    const corps = await reponse.text().catch(() => "");

    if (!reponse.ok) {
      return { ok: false, erreur: `Infobip ${reponse.status} ${corps.slice(0, 200)}` };
    }

    // Infobip repond 200 meme pour un message refuse : le sort reel est dans
    // le statut de chaque message. Sans cette lecture, un rejet passerait pour
    // un succes dans le journal.
    try {
      const json = JSON.parse(corps);
      const statut = json?.messages?.[0]?.status;
      if (statut?.groupName === "REJECTED") {
        return {
          ok: false,
          erreur: `Infobip rejet ${statut.name ?? ""} ${statut.description ?? ""}`.trim(),
        };
      }
    } catch {
      // Reponse illisible mais HTTP 200 : on ne transforme pas ce doute en
      // echec, l'envoi a de fortes chances d'etre parti.
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Erreur réseau" };
  }
}

/* ------------------------------------------------------------------ numeros */

/** Retire espaces, parenthèses et tirets ; garde le + initial. */
function normaliser(brut: string): string | null {
  const propre = brut.replace(/[\s()-]/g, "");
  if (!/^\+?\d{8,15}$/.test(propre)) return null;
  return propre.startsWith("+") ? propre : `+${propre}`;
}

/**
 * Infobip attend le numero international sans le plus.
 *
 * Le fichier contient des numeros ecrits de plusieurs facons, et il a ete
 * decide de ne pas les normaliser en base : de vrais numeros etrangers y
 * cotoient des numeros ivoiriens, et prefixer +225 les casserait. La mise en
 * forme se fait donc a l'envoi, sans jamais toucher a la fiche.
 */
function chiffresSeuls(brut: string): string | null {
  const propre = brut.replace(/\D/g, "");
  return /^\d{8,15}$/.test(propre) ? propre : null;
}
