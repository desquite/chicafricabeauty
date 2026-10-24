import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { assistantConfigure, proposerBrouillon } from "@/lib/assistant/brouillon";
import { enregistrerEntrant } from "@/lib/messagerie";

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
export const maxDuration = 60;

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
  for (const r of corps.results ?? []) {
    try {
      const conversation = await enregistrerEntrant(r as Parameters<typeof enregistrerEntrant>[0]);
      if (conversation) aTraiter.add(conversation);
    } catch (e) {
      console.error(`Message entrant non enregistré : ${e instanceof Error ? e.message : e}`);
    }
  }
  // L'assistant prépare son brouillon après la réponse à Infobip, qui
  // n'attend pas.
  if (assistantConfigure() && aTraiter.size) {
    after(async () => {
      for (const id of aTraiter) await proposerBrouillon(id);
    });
  }
  // Toujours 200 une fois la clé vérifiée : un refus ferait renvoyer le
  // message par Infobip en boucle.
  return NextResponse.json({ recu: true });
}
