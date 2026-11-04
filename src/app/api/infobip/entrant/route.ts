import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { assistantConfigure, proposerBrouillon } from "@/lib/assistant/brouillon";
import { gerantePour, traiterMessageGerante, type Gerante } from "@/lib/assistant/gerante";
import { enregistrerEntrant, lireEntrant } from "@/lib/messagerie";

/**
 * Messages WhatsApp reçus par le numéro de l'institut, transmis par Infobip.
 *
 * Infobip ne signe pas ses notifications : l'adresse configurée chez lui
 * porte une clé secrète (?cle=…), la valeur de INFOBIP_WEBHOOK_SECRET dans
 * Vercel. Sans elle, ou sans la bonne, rien n'est enregistré.
 *
 * Corps : { results: [ { from, receivedAt, messageId, contact, message } ] }.
 */
// Le brouillon de l'assistant se prépare après la réponse : il lui faut du temps.
export const maxDuration = 120;

function cleValide(fournie: string | null) {
  const attendue = process.env.INFOBIP_WEBHOOK_SECRET;
  if (!attendue || attendue.length < 16 || !fournie) return false;
  const a = Buffer.from(attendue);
  const b = Buffer.from(fournie);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(requete: Request) {
  if (!cleValide(new URL(requete.url).searchParams.get("cle"))) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 403 });
  }
  let corps: { results?: unknown[] };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "corps illisible" }, { status: 400 });
  }
  const aTraiter = new Set<string>();
  // Les messages des gérantes vont à leur assistant, pas dans la boîte des clientes.
  const pourGerantes: { g: Gerante; texte: string | null; type: string; infobipId: string | null }[] = [];
  for (const r of corps.results ?? []) {
    try {
      const resultat = r as Parameters<typeof enregistrerEntrant>[0];
      const g = resultat.from ? await gerantePour(resultat.from) : null;
      if (g) {
        const { type, texte } = lireEntrant(resultat);
        pourGerantes.push({ g, texte, type, infobipId: resultat.messageId ?? null });
        continue;
      }
      const conversation = await enregistrerEntrant(r as Parameters<typeof enregistrerEntrant>[0]);
      if (conversation) aTraiter.add(conversation);
    } catch (e) {
      console.error(`Message entrant non enregistré : ${e instanceof Error ? e.message : e}`);
    }
  }
  // L'assistant prépare son brouillon après la réponse à Infobip, qui
  // n'attend pas ; il l'envoie lui-même si la gérante a allumé l'envoi
  // automatique.
  if (assistantConfigure() && aTraiter.size) {
    after(async () => {
      for (const id of aTraiter) await proposerBrouillon(id, { envoyer: true });
    });
  }
  if (pourGerantes.length) {
    after(async () => {
      for (const m of pourGerantes) await traiterMessageGerante(m.g, m);
    });
  }
  // Toujours 200 une fois la clé vérifiée : un refus ferait renvoyer le
  // message par Infobip en boucle.
  return NextResponse.json({ recu: true });
}
