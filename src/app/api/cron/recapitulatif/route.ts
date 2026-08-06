import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerWhatsapp } from "@/lib/notifications/whatsapp";
import {
  calculerRelances,
  construireRappelCliente,
  construireRecapitulatif,
  type RdvDuJour,
} from "@/lib/notifications/recapitulatif";
import { alertes, type Anamnese } from "@/lib/types";
import { ouvreDroit, rangSeance } from "@/lib/fidelite";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Récapitulatif quotidien envoyé aux gérantes.
 *
 * Abidjan est en UTC+0 toute l'année : l'heure du cron Vercel, qui est en
 * UTC, correspond donc directement à l'heure locale. Aucune conversion.
 *
 * Effet de bord utile : cet appel quotidien touche la base et empêche le
 * projet Supabase du plan gratuit de se mettre en pause après une semaine
 * sans activité.
 */
export async function GET(requete: Request) {
  try {
    return await traiter(requete);
  } catch (e) {
    // Sans ce filet, une variable d'environnement manquante renvoie une trace
    // d'exécution illisible dans les journaux Vercel.
    return NextResponse.json(
      { erreur: e instanceof Error ? e.message : "Erreur inattendue" },
      { status: 500 },
    );
  }
}

async function traiter(requete: Request) {
  const url = new URL(requete.url);
  // ?apercu=1 construit le message et le renvoie sans rien envoyer.
  const apercu = url.searchParams.get("apercu") === "1";

  // Vercel envoie automatiquement "Authorization: Bearer <CRON_SECRET>" sur
  // les appels planifiés. En l'absence de secret la route serait ouverte a
  // tout le monde : en production on refuse plutot que de laisser passer.
  const secret = process.env.CRON_SECRET;
  const entete = requete.headers.get("authorization");

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { erreur: "CRON_SECRET non configuré : route désactivée." },
        { status: 503 },
      );
    }
  } else if (entete !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const maintenant = new Date();
  const jour = maintenant.toISOString().slice(0, 10);
  const hier = new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10);

  // Les erreurs sont collectées et remontées : une requête qui échoue
  // silencieusement se lit comme « aucune donnée », ce qui est indiscernable
  // d'une base vide et impossible à diagnostiquer à distance.
  const erreurs: string[] = [];

  /**
   * Rejoue une requête une fois avant d'abandonner.
   *
   * Le cron ne passe qu'une fois par jour : une erreur passagère — un
   * PGRST303 dû à une horloge décalée chez Supabase, déjà constaté — ferait
   * annoncer « aucun rendez-vous » pendant vingt-quatre heures.
   */
  async function avecReessai<T>(
    lancer: () => PromiseLike<{
      data: T | null;
      error: { code?: string; message: string } | null;
    }>,
  ) {
    const premier = await lancer();
    if (!premier.error) return premier;
    await new Promise((r) => setTimeout(r, 800));
    return lancer();
  }

  /**
   * Rang de la venue à venir pour les clientes qui ouvrent droit à la remise
   * fidélité, en une seule lecture pour tout le lot. Les autres sont absentes
   * de la table : `has` suffit à décider s'il faut en parler.
   */
  async function remisesDues(ids: string[]) {
    const dues = new Map<string, number>();
    if (ids.length === 0) return dues;

    const { data } = await supabase
      .from("seances")
      .select("cliente_id")
      .in("cliente_id", ids)
      .returns<{ cliente_id: string }[]>();

    const compte = new Map<string, number>();
    for (const s of data ?? []) {
      compte.set(s.cliente_id, (compte.get(s.cliente_id) ?? 0) + 1);
    }
    for (const id of new Set(ids)) {
      const rang = rangSeance(compte.get(id) ?? 0);
      if (ouvreDroit(rang)) dues.set(id, rang);
    }
    return dues;
  }

  const [
    { data: rdvs, error: erreurRdv },
    { data: destinataires, error: erreurDest },
    { data: seancesHier, error: erreurSeances },
  ] = await Promise.all([
    avecReessai(() =>
      supabase
        .from("rendez_vous")
        .select("heure_rdv, statut, clientes(id, nom_complet, telephone), soins_catalogue(libelle)")
        .eq("date_rdv", jour)
        .eq("statut", "prevu")
        .is("remplace_par", null)
        .is("masque_le", null)
        .order("heure_rdv", { nullsFirst: false })
        .returns<RdvDuJour[]>(),
    ),
    avecReessai(() =>
      supabase
        .from("profiles")
        .select("id, nom, telephone")
        .eq("actif", true)
        .eq("notifications_whatsapp", true)
        .not("telephone", "is", null)
        .returns<{ id: string; nom: string; telephone: string }[]>(),
    ),
    avecReessai(() =>
      supabase
        .from("seances")
        .select("id")
        .eq("date_seance", hier)
        .returns<{ id: string }[]>(),
    ),
  ]);

  if (erreurRdv) erreurs.push(`rendez_vous : ${erreurRdv.code} ${erreurRdv.message}`);
  if (erreurDest) erreurs.push(`profiles : ${erreurDest.code} ${erreurDest.message}`);
  if (erreurSeances) erreurs.push(`seances : ${erreurSeances.code} ${erreurSeances.message}`);

  if (!apercu && (!destinataires || destinataires.length === 0)) {
    return NextResponse.json({
      envoyes: 0,
      motif: "Aucune gérante avec un téléphone et les notifications activées.",
    });
  }

  // Contre-indications des clientes attendues aujourd'hui, en une requête.
  const idsClientes = (rdvs ?? [])
    .map((r) => r.clientes?.id)
    .filter((v): v is string => Boolean(v));

  const alertesParCliente = new Map<string, string[]>();
  if (idsClientes.length > 0) {
    const { data: bilans } = await supabase
      .from("anamneses_courantes")
      .select("*")
      .in("cliente_id", idsClientes)
      .returns<Anamnese[]>();
    for (const id of idsClientes) {
      const bilan = (bilans ?? []).find((b) => b.cliente_id === id) ?? null;
      alertesParCliente.set(id, alertes(bilan));
    }
  }

  const remisesParCliente = await remisesDues(idsClientes);

  // Relances : dernière séance de chaque cliente, hors celles déjà attendues.
  const { data: dernieres } = await supabase
    .from("seances")
    .select("cliente_id, date_seance, delai_recommande, clientes(nom_complet)")
    .order("date_seance", { ascending: false })
    .limit(500)
    .returns<
      {
        cliente_id: string;
        date_seance: string;
        delai_recommande: string | null;
        clientes: { nom_complet: string } | null;
      }[]
    >();

  const { data: rdvsAVenir } = await supabase
    .from("rendez_vous")
    .select("cliente_id")
    .gte("date_rdv", jour)
    .eq("statut", "prevu")
    .returns<{ cliente_id: string }[]>();

  const aRelancer = calculerRelances(
    dernieres ?? [],
    new Set((rdvsAVenir ?? []).map((r) => r.cliente_id)),
    maintenant,
  );

  const message = construireRecapitulatif({
    date: maintenant,
    rdvs: rdvs ?? [],
    alertesParCliente,
    remisesParCliente,
    aRelancer,
    seancesHier: seancesHier?.length ?? 0,
    lectureIncertaine: Boolean(erreurRdv),
  });

  if (apercu) {
    // Diagnostic : le catalogue contient toujours des lignes et n'est lisible
    // qu'avec une clé qui contourne la RLS. S'il ressort vide, la clé posée
    // n'est pas la clé secrète. Seule la famille de la clé est exposée,
    // jamais sa valeur.
    const { count: catalogue } = await supabase
      .from("soins_catalogue")
      .select("*", { count: "exact", head: true });
    const cle = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const familleCle = cle.startsWith("sb_secret_")
      ? "secrète"
      : cle.startsWith("sb_publishable_")
        ? "PUBLISHABLE — incorrecte, il faut la clé secrète"
        : cle.startsWith("eyJ")
          ? "JWT hérité (service_role ou anon, indéterminable)"
          : "inconnue";

    return NextResponse.json({
      apercu: true,
      jour,
      diagnostic: {
        familleCle,
        soinsVisibles: catalogue ?? 0,
        contourneRls: (catalogue ?? 0) > 0,
      },
      destinataires: (destinataires ?? []).map((d) => `${d.nom} ${d.telephone}`),
      rendezVous: rdvs?.length ?? 0,
      relances: aRelancer.length,
      erreurs,
      message,
    });
  }

  const resultats: { destinataire: string; ok: boolean; erreur?: string }[] = [];

  /** Envoi journalisé, avec garde contre le renvoi si le cron est rejoué. */
  const envoyerUneFois = async (
    type: string,
    destinataire: string,
    etiquette: string,
    texte: string,
    attente: number,
  ) => {
    const { data: deja } = await supabase
      .from("notifications_envoyees")
      .select("id")
      .eq("type", type)
      .eq("cle_jour", jour)
      .eq("destinataire", destinataire)
      .eq("succes", true)
      .maybeSingle();

    if (deja) {
      resultats.push({ destinataire: etiquette, ok: true, erreur: "déjà envoyé" });
      return;
    }

    const envoi = await envoyerWhatsapp(destinataire, texte);
    await supabase.from("notifications_envoyees").insert({
      type,
      cle_jour: jour,
      destinataire,
      succes: envoi.ok,
      detail: envoi.erreur ?? null,
    });
    resultats.push({ destinataire: etiquette, ok: envoi.ok, erreur: envoi.erreur });

    // Espacement : WasenderAPI passe par WhatsApp Web, une rafale d'envois
    // simultanés est ce qui déclenche les coupures.
    await new Promise((r) => setTimeout(r, attente));
  };

  // Les gérantes d'abord : c'est le message qui organise la journée.
  for (const d of destinataires ?? []) {
    await envoyerUneFois("recapitulatif", d.telephone, d.nom, message, 5000);
  }

  // Puis les clientes : rappel du jour même, et rappel de la veille pour
  // demain. Les deux partent du même passage, à la même heure.
  const demain = new Date(maintenant.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: aRappeler } = await supabase
    .from("rendez_vous")
    .select("date_rdv, heure_rdv, clientes(id, nom_complet, telephone, rappels_whatsapp), soins_catalogue(libelle)")
    .in("date_rdv", [jour, demain])
    .eq("statut", "prevu")
    .is("remplace_par", null)
    .is("masque_le", null)
    .order("date_rdv")
    .order("heure_rdv", { nullsFirst: false })
    .returns<
      {
        date_rdv: string;
        heure_rdv: string | null;
        clientes: {
          id: string;
          nom_complet: string;
          telephone: string;
          rappels_whatsapp: boolean;
        } | null;
        soins_catalogue: { libelle: string } | null;
      }[]
    >();

  // Les clientes rappelées ne sont pas les mêmes que celles du récapitulatif :
  // celui-ci ne parle que d'aujourd'hui, les rappels couvrent aussi demain.
  const remisesRappels = await remisesDues(
    (aRappeler ?? [])
      .map((r) => r.clientes?.id)
      .filter((v): v is string => Boolean(v)),
  );

  let rappelsEnvoyes = 0;
  let rappelsIgnores = 0;

  for (const r of aRappeler ?? []) {
    if (!r.clientes?.rappels_whatsapp) {
      rappelsIgnores += 1;
      continue;
    }
    // La fonction s'exécute dans un temps borné, et WasenderAPI impose un
    // message toutes les 5 secondes. Au-delà de six rappels on s'arrête :
    // le passage suivant reprendra la suite, le journal évitant les doublons.
    if (rappelsEnvoyes >= 6) {
      rappelsIgnores += 1;
      continue;
    }

    const quand = r.date_rdv === jour ? "aujourdhui" : "demain";
    await envoyerUneFois(
      quand === "aujourdhui" ? "rappel_jour" : "rappel_veille",
      r.clientes.telephone,
      `${r.clientes.nom_complet} (${quand})`,
      construireRappelCliente(
        {
          nom_complet: r.clientes.nom_complet,
          telephone: r.clientes.telephone,
          heure_rdv: r.heure_rdv,
          soin: r.soins_catalogue?.libelle ?? null,
          date_rdv: r.date_rdv,
          rangRemise: remisesRappels.get(r.clientes.id) ?? null,
        },
        quand,
      ),
      // WasenderAPI refuse en 429 sous les 5 secondes : « Account protection
      // enabled, you can only send 1 message every 5 seconds ». La marge de
      // 500 ms absorbe la latence variable de l'aller-retour.
      5500,
    );
    rappelsEnvoyes += 1;
  }

  return NextResponse.json({
    jour,
    rendezVous: rdvs?.length ?? 0,
    relances: aRelancer.length,
    rappelsClientes: { envoyes: rappelsEnvoyes, ignores: rappelsIgnores },
    resultats,
  });
}
