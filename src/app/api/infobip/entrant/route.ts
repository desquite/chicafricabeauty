import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
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
  for (const r of corps.results ?? []) {
    try {
      await enregistrerEntrant(r as Parameters<typeof enregistrerEntrant>[0]);
    } catch (e) {
      console.error(`Message entrant non enregistré : ${e instanceof Error ? e.message : e}`);
    }
  }
  // Toujours 200 une fois la clé vérifiée : un refus ferait renvoyer le
  // message par Infobip en boucle.
  return NextResponse.json({ recu: true });
}
