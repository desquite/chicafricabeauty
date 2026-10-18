import { NextResponse } from "next/server";
import { annulerAcomptesEchus } from "@/lib/taches-acompte";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Annulation, à 18h, des rendez-vous du lendemain dont l'acompte requis n'a
 * pas été réglé. Le créneau est libéré et la cliente prévenue.
 *
 * Abidjan est en UTC : l'heure du cron Vercel est l'heure locale.
 * ?apercu=1 liste ce qui serait annulé, sans rien toucher.
 */
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "CRON_SECRET non configuré : route désactivée." }, { status: 503 });
  }
  if (requete.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  }

  const apercu = new URL(requete.url).searchParams.get("apercu") === "1";
  try {
    return NextResponse.json({ annulations: await annulerAcomptesEchus(new Date(), apercu) });
  } catch (e) {
    return NextResponse.json(
      { erreur: e instanceof Error ? e.message : "Erreur inattendue" },
      { status: 500 },
    );
  }
}
