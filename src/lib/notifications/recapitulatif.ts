import "server-only";
import { JOURS_PAR_DELAI } from "@/lib/types";
import { REMISE_POURCENT } from "@/lib/fidelite";

export type RdvDuJour = {
  heure_rdv: string | null;
  statut: string;
  clientes: { id: string; nom_complet: string; telephone: string } | null;
  soins_catalogue: { libelle: string } | null;
};

export type ARelancer = {
  nom_complet: string;
  jours: number;
};

const heure = (h: string | null) => (h ? h.slice(0, 5) : "heure à définir");

/** « lundi 10 août ». Partagée par le texte libre et par le modèle. */
const dateEnToutesLettres = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Longueur au-delà de laquelle la liste des rendez-vous est écourtée. */
const LONGUEUR_MAX_LISTE = 700;

/**
 * Construit le message envoyé aux gérantes.
 *
 * Contrainte de fond : WhatsApp est lu sur un téléphone, souvent debout entre
 * deux clientes. Le message doit tenir dans un écran et se lire sans faire
 * défiler. On liste donc les rendez-vous, on signale les contre-indications
 * par un simple marqueur, et on renvoie à l'application pour le détail.
 */
export function construireRecapitulatif({
  date,
  rdvs,
  alertesParCliente,
  remisesParCliente,
  aRelancer,
  seancesHier,
  lectureIncertaine = false,
}: {
  date: Date;
  rdvs: RdvDuJour[];
  alertesParCliente: Map<string, string[]>;
  /** Rang de la venue des clientes qui ouvrent droit à la remise fidélité. */
  remisesParCliente: Map<string, number>;
  aRelancer: ARelancer[];
  seancesHier: number;
  /** La lecture des rendez-vous a échoué : ne pas affirmer qu'il n'y en a pas. */
  lectureIncertaine?: boolean;
}): string {
  const lignes: string[] = [
    `*Chic Africa Beauty* — ${dateEnToutesLettres(date)}`,
    "",
  ];

  if (lectureIncertaine) {
    // Annoncer « aucun rendez-vous » sur une lecture ratée serait pire que de
    // ne rien dire : la gérante organiserait sa journée sur une information
    // fausse.
    lignes.push(
      "⚠️ La liste des rendez-vous n'a pas pu être lue ce matin.",
      "Ouvrez l'application pour la consulter.",
    );
  } else if (rdvs.length === 0) {
    lignes.push("Aucun rendez-vous prévu aujourd'hui.");
  } else {
    lignes.push(
      `*${rdvs.length} rendez-vous* aujourd'hui`,
      ...rdvs.map((r) => {
        const cliente = r.clientes?.nom_complet ?? "Cliente inconnue";
        const soin = r.soins_catalogue ? ` — ${r.soins_catalogue.libelle}` : "";
        const nb = r.clientes ? (alertesParCliente.get(r.clientes.id)?.length ?? 0) : 0;
        const marque = nb > 0 ? ` ⚠️ ${nb}` : "";
        const rang = r.clientes ? remisesParCliente.get(r.clientes.id) : undefined;
        const fidelite = rang ? ` 🎁 ${rang}e — ${REMISE_POURCENT} %` : "";
        return `• ${heure(r.heure_rdv)} ${cliente}${soin}${marque}${fidelite}`;
      }),
    );
    if ([...alertesParCliente.values()].some((a) => a.length > 0)) {
      lignes.push("", "⚠️ = contre-indications à vérifier sur la fiche.");
    }
    if (rdvs.some((r) => r.clientes && remisesParCliente.has(r.clientes.id))) {
      lignes.push(
        `🎁 = remise fidélité ${REMISE_POURCENT} %, sur un soin ou un produit au choix.`,
      );
    }
  }

  if (aRelancer.length > 0) {
    lignes.push(
      "",
      `*${aRelancer.length} cliente${aRelancer.length > 1 ? "s" : ""} à relancer*`,
      ...aRelancer
        .slice(0, 8)
        .map((c) => `• ${c.nom_complet} — ${c.jours} jours sans séance`),
    );
    if (aRelancer.length > 8) {
      lignes.push(`… et ${aRelancer.length - 8} autres.`);
    }
  }

  if (seancesHier > 0) {
    lignes.push("", `Hier : ${seancesHier} séance${seancesHier > 1 ? "s" : ""} saisie${seancesHier > 1 ? "s" : ""}.`);
  }

  return lignes.join("\n");
}

/**
 * Les quatre variables du modèle `recapitulatif_gerante`.
 *
 * Trois règles de Meta commandent cette forme, et aucune n'est négociable :
 * une variable ne peut contenir **ni retour à la ligne** ni tabulation, elle
 * ne peut **jamais être vide**, et leur nombre est **figé** par le modèle
 * approuvé. La liste des rendez-vous tient donc sur une seule ligne, les
 * rendez-vous séparés par des points médians, et chaque variable a une
 * formulation de repli quand il n'y a rien à dire.
 */
export function partiesRecapitulatif({
  nomGerante,
  date,
  rdvs,
  alertesParCliente,
  remisesParCliente,
  aRelancer,
  seancesHier,
  lectureIncertaine = false,
}: {
  /** `profiles.nom`, dont seul le premier mot est repris. */
  nomGerante: string;
  date: Date;
  rdvs: RdvDuJour[];
  alertesParCliente: Map<string, string[]>;
  remisesParCliente: Map<string, number>;
  aRelancer: ARelancer[];
  seancesHier: number;
  lectureIncertaine?: boolean;
}): { nom: string; date: string; rendezVous: string; aSignaler: string } {
  // Le personnel est saisi par la gérante elle-même, en « Prénom NOM », et
  // tient en deux lignes : le premier mot est le prénom sans ambiguïté. Rien
  // à voir avec les clientes, dont nom et prénoms sont un seul champ dont on
  // ne sait pas démêler l'ordre.
  const prenom = nomGerante.trim().split(/\s+/)[0] || nomGerante.trim();

  let rendezVous: string;
  if (lectureIncertaine) {
    // Annoncer « aucun rendez-vous » sur une lecture ratée ferait organiser
    // la journée sur une information fausse.
    rendezVous = "liste illisible ce matin, ouvrez l'application";
  } else if (rdvs.length === 0) {
    rendezVous = "aucun aujourd'hui";
  } else {
    const items = rdvs.map((r) => {
      const cliente = r.clientes?.nom_complet ?? "Cliente inconnue";
      const soin = r.soins_catalogue ? `, ${r.soins_catalogue.libelle}` : "";
      const id = r.clientes?.id;
      const alerte = id && (alertesParCliente.get(id)?.length ?? 0) > 0 ? " ⚠️" : "";
      const remise = id && remisesParCliente.has(id) ? " 🎁" : "";
      return `${heure(r.heure_rdv)} ${cliente}${soin}${alerte}${remise}`;
    });

    let liste = items.join(" · ");
    // Une journée très chargée produirait une variable démesurée. On coupe
    // sur un rendez-vous entier, jamais au milieu d'un nom.
    if (liste.length > LONGUEUR_MAX_LISTE) {
      const gardes: string[] = [];
      let taille = 0;
      for (const item of items) {
        if (taille + item.length + 3 > LONGUEUR_MAX_LISTE) break;
        gardes.push(item);
        taille += item.length + 3;
      }
      liste = `${gardes.join(" · ")} · … et ${items.length - gardes.length} autres`;
    }
    rendezVous = `${rdvs.length} — ${liste}`;
  }

  const nbAlertes = [...alertesParCliente.values()].filter((a) => a.length > 0).length;
  const nbRemises = rdvs.filter(
    (r) => r.clientes && remisesParCliente.has(r.clientes.id),
  ).length;

  const signaux = [
    nbAlertes > 0 &&
      `${nbAlertes} contre-indication${nbAlertes > 1 ? "s" : ""} à vérifier`,
    nbRemises > 0 && `${nbRemises} remise${nbRemises > 1 ? "s" : ""} fidélité`,
    aRelancer.length > 0 &&
      `${aRelancer.length} cliente${aRelancer.length > 1 ? "s" : ""} à relancer`,
    seancesHier > 0 &&
      `${seancesHier} séance${seancesHier > 1 ? "s" : ""} saisie${seancesHier > 1 ? "s" : ""} hier`,
  ].filter((s): s is string => typeof s === "string");

  return {
    nom: prenom,
    date: dateEnToutesLettres(date),
    rendezVous,
    aSignaler: signaux.length > 0 ? signaux.join(", ") : "rien de particulier",
  };
}

export type RappelCliente = {
  nom_complet: string;
  telephone: string;
  heure_rdv: string | null;
  soin: string | null;
  date_rdv: string;
  /** Rang de cette venue si elle ouvre droit à la remise fidélité. */
  rangRemise: number | null;
};

/**
 * Les parties variables du rappel, communes aux deux canaux.
 *
 * WasenderAPI reçoit un texte libre, Infobip des variables à glisser dans un
 * modèle approuvé : les deux doivent dire exactement la même chose, donc rien
 * ne se calcule deux fois. Chaque partie tient sur une seule ligne — une
 * variable de modèle WhatsApp ne supporte ni retour à la ligne ni tabulation.
 */
export function partiesRappel(
  r: RappelCliente,
  quand: "aujourdhui" | "demain",
): { nom: string; quand: string; soin: string | null; rang: number | null } {
  const heure = r.heure_rdv ? ` à ${r.heure_rdv.slice(0, 5)}` : "";
  const jour =
    quand === "aujourdhui"
      ? "aujourd'hui"
      : `demain ${new Date(r.date_rdv).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}`;

  return {
    nom: r.nom_complet,
    quand: `${jour}${heure}`,
    soin: r.soin,
    rang: r.rangRemise,
  };
}

/**
 * Rappel envoyé à la cliente elle-même, en texte libre — canal WasenderAPI.
 *
 * Court, sans mise en forme superflue : il est lu sur un téléphone, souvent
 * d'un coup d'œil sur l'écran verrouillé. L'essentiel — jour et heure — doit
 * tenir dans les deux premières lignes de l'aperçu de notification.
 *
 * Les modèles Infobip reprennent ce texte au mot près : toute retouche ici
 * doit être reportée dans la console Meta, où les modèles ne se modifient pas
 * mais se recréent.
 */
export function construireRappelCliente(
  r: RappelCliente,
  quand: "aujourdhui" | "demain",
): string {
  const p = partiesRappel(r, quand);

  // Le prénom seul serait plus chaleureux, mais nom et prénoms ne sont qu'un
  // champ : impossible de savoir lequel est lequel sans risquer un « Bonjour
  // Kouassi » à quelqu'un qui s'appelle Kouassi de nom de famille.
  return [
    `Bonjour ${p.nom},`,
    "",
    `Nous vous rappelons votre rendez-vous *${p.quand}*${p.soin ? ` — ${p.soin}` : ""} chez *Chic Africa Beauty*.`,
    // La remise s'annonce, elle ne se choisit pas ici : le choix se fait sur
    // place, au moment de payer, et une réponse à ce message n'est lue par
    // personne.
    ...(p.rang
      ? [
          "",
          `🎁 C'est votre *${p.rang}e séance* : vous bénéficiez de *${REMISE_POURCENT} % de remise*, sur un soin ou sur un produit, à choisir sur place.`,
        ]
      : []),
    "",
    "En cas d'empêchement, merci de nous prévenir en répondant à ce message.",
    "",
    "À très bientôt 🌸",
  ].join("\n");
}

/**
 * Clientes dont le délai recommandé est dépassé de plus d'une semaine.
 *
 * La marge d'une semaine évite de relancer quelqu'un qui a simplement décalé
 * de deux jours : une relance trop prompte se retourne contre l'institut.
 */
export function calculerRelances(
  dernieresSeances: {
    cliente_id: string;
    date_seance: string;
    delai_recommande: string | null;
    clientes: { nom_complet: string } | null;
  }[],
  clientesAvecRdv: Set<string>,
  aujourdhui: Date,
): ARelancer[] {
  const relances: ARelancer[] = [];
  const vues = new Set<string>();

  for (const s of dernieresSeances) {
    if (vues.has(s.cliente_id)) continue;
    vues.add(s.cliente_id);
    if (clientesAvecRdv.has(s.cliente_id)) continue;
    if (!s.delai_recommande) continue;

    const attendu = JOURS_PAR_DELAI[s.delai_recommande];
    if (!attendu) continue;

    const jours = Math.floor(
      (aujourdhui.getTime() - new Date(s.date_seance).getTime()) / 86_400_000,
    );
    if (jours > attendu + 7 && s.clientes) {
      relances.push({ nom_complet: s.clientes.nom_complet, jours });
    }
  }

  return relances.sort((a, b) => b.jours - a.jours);
}
