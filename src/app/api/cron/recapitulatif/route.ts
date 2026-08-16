import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  envoyerModeleWhatsapp,
  envoyerWhatsapp,
  type ResultatEnvoi,
} from "@/lib/notifications/whatsapp";
import {
  LANGUE_MODELES,
  modeleAnniversaire,
  modelePromotion,
  modeleRappel,
  modeleRecapitulatif,
} from "@/lib/notifications/modeles";
import {
  calculerRelances,
  construireAnniversaire,
  construireRappelCliente,
  construireRecapitulatif,
  partiesRappel,
  partiesRecapitulatif,
  type RdvDuJour,
} from "@/lib/notifications/recapitulatif";
import { alertes, nomChaleureux, type Anamnese } from "@/lib/types";
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
  // La fonction est bornée à 60 s. Les envois sont espacés, parfois de cinq
  // secondes : sans repère de départ, un passage chargé serait interrompu au
  // milieu d'un envoi, sans trace dans le journal.
  const debut = Date.now();
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
        .select("id, nom, telephone, notifications_infobip")
        .eq("actif", true)
        .eq("notifications_whatsapp", true)
        .not("telephone", "is", null)
        .returns<
          {
            id: string;
            nom: string;
            telephone: string;
            notifications_infobip: boolean;
          }[]
        >(),
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

  /* --------------------------------------------------------- anniversaires
   * Le tri se fait sur le mois et le jour, jamais sur l'année. Le 29 février
   * bascule sur le 28 les années non bissextiles, sans quoi la cliente née un
   * 29 ne serait fêtée qu'une fois tous les quatre ans.
   */
  const jourMois = jour.slice(5);
  const bissextile = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const joursFetes = [jourMois];
  if (jourMois === "02-28" && !bissextile(maintenant.getUTCFullYear())) {
    joursFetes.push("02-29");
  }

  const { data: toutesClientes } = await supabase
    .from("clientes")
    .select(
      "id, nom_complet, prenom_usuel, telephone, date_naissance, actif, rappels_whatsapp, anniversaire_whatsapp, promotions_whatsapp, rappels_infobip",
    )
    // Pas de filtre sur la date de naissance : cette lecture sert aussi aux
    // campagnes, et une cliente sans date renseignée doit recevoir les offres
    // comme les autres.
    .eq("actif", true)
    .returns<
      {
        id: string;
        nom_complet: string;
        prenom_usuel: string | null;
        telephone: string;
        date_naissance: string | null;
        actif: boolean;
        rappels_whatsapp: boolean;
        anniversaire_whatsapp: boolean;
        promotions_whatsapp: boolean;
        rappels_infobip: boolean;
      }[]
    >();

  // Le filtre se fait ici plutôt qu'en SQL : la table tient en une centaine de
  // lignes, et une comparaison de chaînes en JavaScript se relit mieux qu'un
  // to_char passé au travers du client.
  const feteesAujourdhui = (toutesClientes ?? []).filter(
    (c) => c.date_naissance && joursFetes.includes(c.date_naissance.slice(5)),
  );

  // La gérante est prévenue de tous les anniversaires, y compris ceux des
  // clientes qui refusent les messages : le mot dit de vive voix ne dépend
  // pas d'un consentement à recevoir du WhatsApp.
  const anniversaires = feteesAujourdhui.map((c) => nomChaleureux(c));

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
    anniversaires,
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

    // Combien de clientes sont déjà basculées, et la configuration Infobip
    // est-elle complète ? Se vérifie avant le premier envoi réel, sans jamais
    // exposer la clé elle-même.
    const { count: surInfobip } = await supabase
      .from("clientes")
      .select("*", { count: "exact", head: true })
      .eq("rappels_infobip", true);

    return NextResponse.json({
      apercu: true,
      jour,
      diagnostic: {
        familleCle,
        soinsVisibles: catalogue ?? 0,
        contourneRls: (catalogue ?? 0) > 0,
        infobip: {
          configure: Boolean(
            process.env.INFOBIP_API_KEY &&
              process.env.INFOBIP_BASE_URL &&
              process.env.INFOBIP_SENDER,
          ),
          expediteur: process.env.INFOBIP_SENDER ?? null,
          clientesBasculees: surInfobip ?? 0,
        },
      },
      anniversaires: feteesAujourdhui.map(
        (c) =>
          `${nomChaleureux(c)} ${c.telephone}` +
          `${c.rappels_whatsapp && c.anniversaire_whatsapp ? "" : " (voeux refuses)"}`,
      ),
      destinataires: (destinataires ?? []).map(
        (d) => `${d.nom} ${d.telephone} (${d.notifications_infobip ? "infobip" : "wasender"})`,
      ),
      rendezVous: rdvs?.length ?? 0,
      relances: aRelancer.length,
      erreurs,
      message,
      // Ce que recevrait une gérante basculée : à lire avant de cocher la
      // case, puisque le modèle rend autrement que le texte libre.
      modeleGerante: modeleRecapitulatif(
        partiesRecapitulatif({
          nomGerante: destinataires?.[0]?.nom ?? "Gérante",
          date: maintenant,
          rdvs: rdvs ?? [],
          alertesParCliente,
          remisesParCliente,
          aRelancer,
          seancesHier: seancesHier?.length ?? 0,
          anniversaires,
          lectureIncertaine: Boolean(erreurRdv),
        }),
      ),
    });
  }

  const resultats: {
    destinataire: string;
    canal: string;
    ok: boolean;
    erreur?: string;
  }[] = [];

  /** Ce que rapporte un envoi, avec le canal qui l'a réellement porté. */
  type Envoi = ResultatEnvoi & { canal: string };

  /** Envoi journalisé, avec garde contre le renvoi si le cron est rejoué. */
  const envoyerUneFois = async (
    type: string,
    destinataire: string,
    etiquette: string,
    faire: () => Promise<Envoi>,
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
      resultats.push({
        destinataire: etiquette,
        canal: "—",
        ok: true,
        erreur: "déjà envoyé",
      });
      return;
    }

    const envoi = await faire();
    await supabase.from("notifications_envoyees").insert({
      type,
      cle_jour: jour,
      destinataire,
      succes: envoi.ok,
      detail: envoi.erreur ?? null,
      canal: envoi.canal,
    });
    resultats.push({
      destinataire: etiquette,
      canal: envoi.canal,
      ok: envoi.ok,
      erreur: envoi.erreur,
    });

    // Espacement : WasenderAPI passe par WhatsApp Web, une rafale d'envois
    // simultanés est ce qui déclenche les coupures. Infobip n'a pas cette
    // contrainte, la pause y est symbolique.
    await new Promise((r) => setTimeout(r, attente));
  };

  // Les gérantes d'abord : c'est le message qui organise la journée. Chacune
  // part sur son canal — le modèle Infobip perd la mise en colonne, il ne
  // s'active donc qu'une fois vu et accepté.
  for (const d of destinataires ?? []) {
    await envoyerUneFois(
      "recapitulatif",
      d.telephone,
      d.nom,
      async (): Promise<Envoi> => {
        if (!d.notifications_infobip) {
          return {
            ...(await envoyerWhatsapp(d.telephone, message)),
            canal: "wasender",
          };
        }
        const modele = modeleRecapitulatif(
          partiesRecapitulatif({
            nomGerante: d.nom,
            date: maintenant,
            rdvs: rdvs ?? [],
            alertesParCliente,
            remisesParCliente,
            aRelancer,
            seancesHier: seancesHier?.length ?? 0,
            anniversaires,
            lectureIncertaine: Boolean(erreurRdv),
          }),
        );
        return {
          ...(await envoyerModeleWhatsapp(
            d.telephone,
            modele.nom,
            modele.placeholders,
            LANGUE_MODELES,
          )),
          canal: "infobip",
        };
      },
      d.notifications_infobip ? 400 : 5000,
    );
  }

  // Puis les clientes : rappel du jour même, et rappel de la veille pour
  // demain. Les deux partent du même passage, à la même heure.
  const demain = new Date(maintenant.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data: aRappeler } = await supabase
    .from("rendez_vous")
    .select(
      "date_rdv, heure_rdv, clientes(id, nom_complet, telephone, rappels_whatsapp, rappels_infobip), soins_catalogue(libelle)",
    )
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
          rappels_infobip: boolean;
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
  let rappelsWasender = 0;
  let rappelsIgnores = 0;

  for (const r of aRappeler ?? []) {
    if (!r.clientes?.rappels_whatsapp) {
      rappelsIgnores += 1;
      continue;
    }

    const cliente = r.clientes;
    const infobip = cliente.rappels_infobip;

    // WasenderAPI impose un message toutes les 5 secondes : au-delà de six
    // rappels sur ce canal, le passage suivant reprendra la suite, le journal
    // évitant les doublons. Infobip n'a pas cette limite et n'est donc pas
    // compté ici.
    if (!infobip && rappelsWasender >= 6) {
      rappelsIgnores += 1;
      continue;
    }
    // Garde-fou de durée, tous canaux confondus : mieux vaut un rappel remis
    // au passage suivant qu'une fonction coupée en plein envoi.
    if (Date.now() - debut > 45_000) {
      rappelsIgnores += 1;
      continue;
    }

    const quand = r.date_rdv === jour ? "aujourdhui" : "demain";
    const parties = partiesRappel(
      {
        nom_complet: cliente.nom_complet,
        telephone: cliente.telephone,
        heure_rdv: r.heure_rdv,
        soin: r.soins_catalogue?.libelle ?? null,
        date_rdv: r.date_rdv,
        rangRemise: remisesRappels.get(cliente.id) ?? null,
      },
      quand,
    );

    await envoyerUneFois(
      quand === "aujourdhui" ? "rappel_jour" : "rappel_veille",
      cliente.telephone,
      `${cliente.nom_complet} (${quand})`,
      async (): Promise<Envoi> => {
        if (!infobip) {
          const texte = construireRappelCliente(
            {
              nom_complet: parties.nom,
              telephone: cliente.telephone,
              heure_rdv: r.heure_rdv,
              soin: parties.soin,
              date_rdv: r.date_rdv,
              rangRemise: parties.rang,
            },
            quand,
          );
          return { ...(await envoyerWhatsapp(cliente.telephone, texte)), canal: "wasender" };
        }

        const modele = modeleRappel(parties);
        const envoi = await envoyerModeleWhatsapp(
          cliente.telephone,
          modele.nom,
          modele.placeholders,
          LANGUE_MODELES,
        );
        if (envoi.ok || !modele.repli) return { ...envoi, canal: "infobip" };

        // Les modèles qui annoncent la remise ont été reclassés en Marketing
        // par Meta, catégorie qu'une cliente peut refuser dans ses réglages.
        // Le rendez-vous doit lui parvenir malgré tout : on renvoie le modèle
        // Utilité, sans la mention des 20 %.
        const secours = await envoyerModeleWhatsapp(
          cliente.telephone,
          modele.repli.nom,
          modele.repli.placeholders,
          LANGUE_MODELES,
        );
        return secours.ok
          ? { ok: true, erreur: `repli ${modele.repli.nom} : ${envoi.erreur}`, canal: "infobip-repli" }
          : { ok: false, erreur: `${envoi.erreur} | repli : ${secours.erreur}`, canal: "infobip" };
      },
      // WasenderAPI refuse en 429 sous les 5 secondes : « Account protection
      // enabled, you can only send 1 message every 5 seconds ». La marge de
      // 500 ms absorbe la latence variable de l'aller-retour. Infobip accepte
      // 250 messages par 24 h sans cadence imposée.
      infobip ? 400 : 5500,
    );
    rappelsEnvoyes += 1;
    if (!infobip) rappelsWasender += 1;
  }

  /* ----------------------------------------------------- vœux d'anniversaire
   * En dernier : ce sont les messages les moins urgents de la matinée. Si la
   * fonction manque de temps, mieux vaut un vœu remis au passage suivant
   * qu'un rappel de rendez-vous perdu.
   */
  let voeuxEnvoyes = 0;
  let voeuxIgnores = 0;

  for (const c of feteesAujourdhui) {
    // Deux consentements distincts : le refus global de WhatsApp, et le refus
    // des seuls vœux, qui relèvent du Marketing.
    if (!c.rappels_whatsapp || !c.anniversaire_whatsapp) {
      voeuxIgnores += 1;
      continue;
    }
    if (Date.now() - debut > 50_000) {
      voeuxIgnores += 1;
      continue;
    }

    const nom = nomChaleureux(c);
    await envoyerUneFois(
      "anniversaire",
      c.telephone,
      nom,
      async (): Promise<Envoi> => {
        if (!c.rappels_infobip) {
          return {
            ...(await envoyerWhatsapp(c.telephone, construireAnniversaire(nom))),
            canal: "wasender",
          };
        }
        const modele = modeleAnniversaire(nom);
        return {
          ...(await envoyerModeleWhatsapp(
            c.telephone,
            modele.nom,
            modele.placeholders,
            LANGUE_MODELES,
          )),
          canal: "infobip",
        };
      },
      c.rappels_infobip ? 400 : 5500,
    );
    voeuxEnvoyes += 1;
  }

  /* --------------------------------------------------------------- campagnes
   * Une promotion se répète pendant sa durée de validité, un jour fixe de la
   * semaine, puis s'arrête d'elle-même à la date de fin. Traitée en dernier :
   * c'est le message le moins urgent de la matinée, et le plus volumineux.
   *
   * Le cron repasse toutes les cinq minutes pendant l'heure de 7 h : ce qui
   * n'a pas tenu dans le temps imparti part au passage suivant, le journal
   * empêchant tout doublon.
   */
  let promosEnvoyees = 0;
  let promosRestantes = 0;

  const { data: campagnes } = await supabase
    .from("campagnes")
    .select("id, libelle, texte, cible, jour_semaine, debut, fin, modele")
    .eq("actif", true)
    .lte("debut", jour)
    .gte("fin", jour)
    .returns<
      {
        id: string;
        libelle: string;
        /** Null quand l'offre est écrite en dur dans le modèle approuvé. */
        texte: string | null;
        cible: "venues" | "toutes";
        jour_semaine: number;
        debut: string;
        fin: string;
        modele: string;
      }[]
    >();

  const duJour = (campagnes ?? []).filter(
    (c) => c.jour_semaine === maintenant.getUTCDay(),
  );

  for (const campagne of duJour) {
    const cibles = (toutesClientes ?? []).filter(
      (c) => c.rappels_whatsapp && c.promotions_whatsapp && c.rappels_infobip,
    );

    // La cible « venues » écarte celles qui ne sont jamais passées : une offre
    // envoyée à qui ne connaît pas l'institut ressemble à du démarchage, et un
    // message signalé fait baisser la note du numéro qui porte les rappels.
    const { data: venues } =
      campagne.cible === "venues"
        ? await supabase.from("seances").select("cliente_id").returns<{ cliente_id: string }[]>()
        : { data: null };
    const dejaVenues = venues ? new Set(venues.map((s) => s.cliente_id)) : null;

    for (const c of cibles) {
      if (dejaVenues && !dejaVenues.has(c.id)) continue;
      if (Date.now() - debut > 52_000) {
        promosRestantes += 1;
        continue;
      }
      const nom = nomChaleureux(c);
      const modele = modelePromotion(nom, campagne.texte, campagne.modele);
      await envoyerUneFois(
        "promotion",
        c.telephone,
        nom,
        async (): Promise<Envoi> => ({
          ...(await envoyerModeleWhatsapp(
            c.telephone,
            modele.nom,
            modele.placeholders,
            LANGUE_MODELES,
          )),
          canal: "infobip",
        }),
        400,
      );
      promosEnvoyees += 1;
    }
  }

  return NextResponse.json({
    jour,
    rendezVous: rdvs?.length ?? 0,
    relances: aRelancer.length,
    anniversaires: { envoyes: voeuxEnvoyes, ignores: voeuxIgnores },
    campagnes: {
      actives: campagnes?.length ?? 0,
      duJour: duJour.map((c) => c.libelle),
      envoyees: promosEnvoyees,
      restantes: promosRestantes,
    },
    rappelsClientes: {
      envoyes: rappelsEnvoyes,
      dontInfobip: rappelsEnvoyes - rappelsWasender,
      ignores: rappelsIgnores,
    },
    resultats,
  });
}
