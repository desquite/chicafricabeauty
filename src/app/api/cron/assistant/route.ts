import { NextResponse } from "next/server";
import { envoiAutoActif } from "@/lib/assistant/brouillon";
import { alerterGerantes } from "@/lib/notifications/gerantes";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Compte rendu de l'assistant envoyé aux gérantes, à 5h et 17h30 (pg_cron ;
 * Abidjan est en UTC). Il couvre la période depuis le passage précédent :
 * la nuit le matin, la journée le soir.
 *
 * ?apercu=1 renvoie le texte sans rien envoyer.
 */
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || requete.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  }
  try {
    const ligne = await compteRendu(new Date());
    if (new URL(requete.url).searchParams.get("apercu") !== "1") await alerterGerantes(ligne);
    return NextResponse.json({ ligne });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : "Erreur inattendue" }, { status: 500 });
  }
}

/** Début de la période : 17h30 la veille pour le passage du matin, 5h sinon. */
function debutPeriode(maintenant: Date) {
  const d = new Date(maintenant);
  if (maintenant.getUTCHours() < 12) {
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(17, 30, 0, 0);
  } else {
    d.setUTCHours(5, 0, 0, 0);
  }
  return d;
}

async function compteRendu(maintenant: Date) {
  const admin = createAdminClient();
  const depuis = debutPeriode(maintenant).toISOString();
  const [recus, envoyes, aReprendre, auto] = await Promise.all([
    admin.from("messages").select("conversation_id").eq("sens", "entrant").gte("cree_le", depuis).returns<{ conversation_id: string }[]>(),
    admin.from("messages").select("id", { count: "exact", head: true }).eq("par_assistant", true).is("echec", null).gte("cree_le", depuis),
    admin
      .from("conversations")
      .select("telephone, nom_contact, clientes(nom_complet)", { count: "exact" })
      .eq("statut", "a_traiter")
      .order("dernier_message_le", { ascending: false })
      .limit(4)
      .returns<{ telephone: string; nom_contact: string | null; clientes: { nom_complet: string } | null }[]>(),
    envoiAutoActif(),
  ]);
  for (const r of [recus, envoyes, aReprendre]) if (r.error) throw new Error(r.error.message);

  const messages = recus.data?.length ?? 0;
  const clientes = new Set(recus.data?.map((m) => m.conversation_id)).size;
  const reprendre = aReprendre.count ?? 0;
  const noms = (aReprendre.data ?? []).map((c) => c.clientes?.nom_complet ?? c.nom_contact ?? c.telephone);
  const moment = maintenant.getUTCHours() < 12 ? "de la nuit" : "de la journée";

  return [
    `Compte rendu ${moment} de l'assistant`,
    messages ? `${messages} message${messages > 1 ? "s" : ""} de ${clientes} cliente${clientes > 1 ? "s" : ""}` : "aucun message reçu",
    `${envoyes.count ?? 0} réponse${(envoyes.count ?? 0) > 1 ? "s" : ""} envoyée${(envoyes.count ?? 0) > 1 ? "s" : ""} par l'assistant`,
    reprendre
      ? `${reprendre} conversation${reprendre > 1 ? "s" : ""} à reprendre : ${noms.join(", ")}${reprendre > noms.length ? "…" : ""}`
      : "rien à reprendre",
    auto ? "envoi automatique allumé" : "brouillons seulement",
  ].join(" · ");
}
