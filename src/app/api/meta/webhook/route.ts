import { after, NextResponse } from "next/server";
import { assistantConfigure, proposerBrouillon } from "@/lib/assistant/brouillon";
import { enregistrerEntrantMeta, type CanalMeta } from "@/lib/messagerie";
import { jetonVerificationValide, lireEvenementMeta, nomMeta, signatureMetaValide, type EvenementMeta } from "@/lib/meta";

/**
 * Messages privés reçus sur la page Facebook (Messenger) et sur le compte
 * Instagram de l'institut, transmis par Meta.
 *
 * GET : Meta vérifie l'adresse au branchement, avec le mot de passe
 * META_VERIFY_TOKEN, et attend en retour le nombre qu'il a envoyé.
 * POST : chaque notification est signée avec META_APP_SECRET ; sans la bonne
 * signature, rien n'est enregistré.
 */
// L'assistant prépare sa réponse après la réponse à Meta : il lui faut du temps.
export const maxDuration = 120;

export async function GET(requete: Request) {
  const p = new URL(requete.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && jetonVerificationValide(p.get("hub.verify_token"))) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ erreur: "non autorisé" }, { status: 403 });
}

export async function POST(requete: Request) {
  const corpsBrut = await requete.text();
  if (!signatureMetaValide(corpsBrut, requete.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ erreur: "signature invalide" }, { status: 403 });
  }
  let corps: { object?: string; entry?: { id?: string; messaging?: EvenementMeta[] }[] };
  try {
    corps = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ erreur: "corps illisible" }, { status: 400 });
  }
  const canal: CanalMeta | null = corps.object === "page" ? "messenger" : corps.object === "instagram" ? "instagram" : null;
  if (!canal) return NextResponse.json({ recu: true });

  const aTraiter = new Set<string>();
  for (const entree of corps.entry ?? []) {
    for (const e of entree.messaging ?? []) {
      try {
        const expediteur = e.sender?.id;
        // Ce que la page envoie elle-même revient aussi : on ne garde que
        // les messages des personnes.
        if (!expediteur || expediteur === entree.id) continue;
        const lu = lireEvenementMeta(e);
        if (!lu) continue;
        const conversation = await enregistrerEntrantMeta({
          canal,
          expediteur,
          ...lu,
          quand: new Date(e.timestamp ?? Date.now()).toISOString(),
          nom: () => nomMeta(canal, expediteur),
        });
        if (conversation) aTraiter.add(conversation);
      } catch (err) {
        console.error(`Message ${canal} non enregistré : ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  if (assistantConfigure() && aTraiter.size) {
    after(async () => {
      for (const id of aTraiter) await proposerBrouillon(id, { envoyer: true });
    });
  }
  // Toujours 200 une fois la signature vérifiée : un refus ferait renvoyer
  // la notification par Meta, puis couper l'adresse.
  return NextResponse.json({ recu: true });
}
