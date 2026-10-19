import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calculerRelances } from "@/lib/notifications/recapitulatif";
import { estExpire, type Source } from "@/lib/regles-acompte";
import { alertes, nomChaleureux, type Anamnese } from "@/lib/types";

/**
 * Tout ce que l'accueil « Ma journée » affiche, lu en une fois.
 *
 * Passe par le client à session : la gérante ne voit que ce que la RLS lui
 * ouvre, comme partout ailleurs dans l'application.
 */

export type RdvJournee = {
  id: string;
  heure: string | null;
  duree: number | null;
  statut: "prevu" | "honore" | "annule" | "absent";
  seanceSaisie: boolean;
  cliente: { id: string; nom: string; prenom: string; telephone: string } | null;
  soin: string | null;
  enLigne: boolean;
  acomptePaye: boolean;
  acompteDu: boolean;
  nouvelle: boolean;
  alertes: string[];
  ficheSanteManquante: boolean;
};

export type ATraiter = {
  cle: string;
  nombre: number;
  titre: string;
  detail: string;
  action: string;
  href: string;
  ton: "info" | "alerte" | "acompte" | "neutre";
};

export type Nouveaute = {
  cle: string;
  quoi: "Réservation" | "Annulation" | "Acompte reçu";
  cliente: string;
  detail: string;
  quand: string;
  /** Horodatage ISO, pour le tri. */
  instant: string;
  ton: "reservation" | "annulation" | "acompte";
};

type LigneRdv = {
  id: string;
  date_rdv: string;
  heure_rdv: string | null;
  duree_min: number | null;
  statut: RdvJournee["statut"];
  seance_id: string | null;
  source: Source;
  created_at: string;
  updated_at: string;
  acompte_requis: boolean;
  acompte_paye_le: string | null;
  acompte_montant: number | null;
  annulation_motif: string | null;
  clientes: { id: string; nom_complet: string; prenom_usuel: string | null; telephone: string } | null;
  soins_catalogue: { libelle: string; libelle_public: string | null; duree_std: number | null } | null;
};

const CHAMPS =
  "id, date_rdv, heure_rdv, duree_min, statut, seance_id, source, created_at, updated_at, " +
  "acompte_requis, acompte_paye_le, acompte_montant, annulation_motif, " +
  "clientes(id, nom_complet, prenom_usuel, telephone), soins_catalogue(libelle, libelle_public, duree_std)";

const plusJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** « 21h12 », « hier 21h12 », « lun. 21h12 ». */
function quand(iso: string, aujourdhui: string) {
  const d = new Date(iso);
  const jour = iso.slice(0, 10);
  const h = `${d.getUTCHours()}h${String(d.getUTCMinutes()).padStart(2, "0")}`;
  if (jour === aujourdhui) return `aujourd'hui ${h}`;
  if (jour === plusJours(aujourdhui, -1)) return `hier ${h}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" })} ${h}`;
}

const jourHeure = (date: string, heure: string | null) => {
  const j = new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return heure ? `${j} ${Number(heure.slice(0, 2))}h${heure.slice(3, 5)}` : j;
};

export async function lireJournee() {
  const supabase = await createClient();
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const demain = plusJours(aujourdhui, 1);
  const hier = plusJours(aujourdhui, -1);
  const dansUneSemaine = plusJours(aujourdhui, 7);
  const depuisHier = `${hier}T00:00:00Z`;

  const [duJour, aVenir, recents, seancesDuJour, seancesRelances, rdvsFuturs, clientesAvecSeance] =
    await Promise.all([
      supabase
        .from("rendez_vous")
        .select(CHAMPS)
        .eq("date_rdv", aujourdhui)
        .is("remplace_par", null)
        .is("masque_le", null)
        .order("heure_rdv", { nullsFirst: false })
        .returns<LigneRdv[]>(),
      // Les sept prochains jours : fiches santé à faire remplir, acomptes du
      // lendemain, et le compteur de la semaine.
      supabase
        .from("rendez_vous")
        .select(CHAMPS)
        .gt("date_rdv", aujourdhui)
        .lte("date_rdv", dansUneSemaine)
        .eq("statut", "prevu")
        .is("remplace_par", null)
        .is("masque_le", null)
        .returns<LigneRdv[]>(),
      // Ce qui s'est passé en ligne depuis hier matin.
      supabase
        .from("rendez_vous")
        .select(CHAMPS)
        .or(
          `and(source.eq.en_ligne,created_at.gte.${depuisHier}),` +
            `acompte_paye_le.gte.${depuisHier},` +
            `and(annulation_motif.not.is.null,updated_at.gte.${depuisHier})`,
        )
        .order("updated_at", { ascending: false })
        .limit(30)
        .returns<LigneRdv[]>(),
      supabase
        .from("seances")
        .select("id", { count: "exact", head: true })
        .eq("date_seance", aujourdhui),
      supabase
        .from("seances")
        .select("cliente_id, date_seance, delai_recommande, clientes(nom_complet, relancee_le, actif)")
        .order("date_seance", { ascending: false })
        .limit(1000)
        .returns<
          {
            cliente_id: string;
            date_seance: string;
            delai_recommande: string | null;
            clientes: { nom_complet: string; relancee_le: string | null; actif: boolean } | null;
          }[]
        >(),
      supabase
        .from("rendez_vous")
        .select("cliente_id")
        .gte("date_rdv", aujourdhui)
        .eq("statut", "prevu")
        .returns<{ cliente_id: string }[]>(),
      supabase.from("seances").select("cliente_id").returns<{ cliente_id: string }[]>(),
    ]);

  const erreur = duJour.error ?? aVenir.error;
  if (erreur) throw new Error(`Lecture de la journée impossible : ${erreur.message}`);
  // Les nouveautes en ligne sont un complement : un echec de lecture laisse
  // le bloc vide, il n'empeche pas la gerante de voir sa journee.
  if (recents.error) console.error(`Nouveautés en ligne illisibles : ${recents.error.message}`);

  const rdvsJour = duJour.data ?? [];
  const prochains = aVenir.data ?? [];

  // Bilans santé des clientes concernées, en une lecture.
  const ids = [
    ...new Set(
      [...rdvsJour, ...prochains].map((r) => r.clientes?.id).filter((x): x is string => !!x),
    ),
  ];
  const { data: bilans } = ids.length
    ? await supabase.from("anamneses_courantes").select("*").in("cliente_id", ids).returns<Anamnese[]>()
    : { data: [] as Anamnese[] };
  const bilanDe = new Map((bilans ?? []).map((b) => [b.cliente_id, b]));
  const dejaVenues = new Set((clientesAvecSeance.data ?? []).map((s) => s.cliente_id));

  const versJournee = (r: LigneRdv): RdvJournee => {
    const c = r.clientes;
    const bilan = c ? bilanDe.get(c.id) : undefined;
    return {
      id: r.id,
      heure: r.heure_rdv,
      duree: r.duree_min ?? r.soins_catalogue?.duree_std ?? null,
      statut: r.statut,
      seanceSaisie: Boolean(r.seance_id),
      cliente: c ? { id: c.id, nom: c.nom_complet, prenom: nomChaleureux(c), telephone: c.telephone } : null,
      soin: r.soins_catalogue?.libelle_public || r.soins_catalogue?.libelle || null,
      enLigne: r.source === "en_ligne",
      acomptePaye: Boolean(r.acompte_paye_le),
      acompteDu: r.acompte_requis && !r.acompte_paye_le && !estExpire(r, maintenant),
      nouvelle: c ? !dejaVenues.has(c.id) : false,
      alertes: alertes(bilan ?? null),
      ficheSanteManquante: Boolean(c) && !bilan,
    };
  };

  const rdvs = rdvsJour.filter((r) => r.statut !== "annule").map(versJournee);

  // À traiter.
  const aTraiter: ATraiter[] = [];
  const sansFiche = [...rdvsJour.filter((r) => r.statut === "prevu"), ...prochains]
    .map(versJournee)
    .filter((r) => r.ficheSanteManquante && r.cliente);
  const sansFicheUniques = [...new Map(sansFiche.map((r) => [r.cliente!.id, r])).values()];
  if (sansFicheUniques.length) {
    const premiere = sansFicheUniques[0];
    aTraiter.push({
      cle: "fiche",
      nombre: sansFicheUniques.length,
      titre: sansFicheUniques.length > 1 ? "Fiches santé manquantes" : "Fiche santé manquante",
      detail:
        sansFicheUniques.length > 1
          ? `${sansFicheUniques.map((r) => r.cliente!.prenom).slice(0, 3).join(", ")}${sansFicheUniques.length > 3 ? "…" : ""} — avant leur venue`
          : `${premiere.cliente!.prenom}, ${premiere.heure ? "vient bientôt" : "rendez-vous à venir"}`,
      action: "Remplir",
      href: `/fiche/${premiere.cliente!.id}/sante`,
      ton: "info",
    });
  }
  const aVerifier = rdvs.filter((r) => r.statut === "prevu" && r.alertes.length > 0);
  if (aVerifier.length) {
    aTraiter.push({
      cle: "alertes",
      nombre: aVerifier.length,
      titre: aVerifier.length > 1 ? "Contre-indications à vérifier" : "Contre-indication à vérifier",
      detail: aVerifier
        .map((r) => `${r.cliente?.prenom ?? "?"}${r.heure ? ` à ${Number(r.heure.slice(0, 2))}h${r.heure.slice(3, 5)}` : ""}`)
        .join(", "),
      action: "Voir la fiche",
      href: aVerifier[0].cliente ? `/clientes/${aVerifier[0].cliente.id}` : "/rendez-vous",
      ton: "alerte",
    });
  }
  const acomptesDemain = prochains.filter(
    (r) => r.date_rdv === demain && r.acompte_requis && !r.acompte_paye_le,
  );
  if (acomptesDemain.length) {
    aTraiter.push({
      cle: "acomptes",
      nombre: acomptesDemain.length,
      titre: "Acomptes à régler avant ce soir 18h",
      detail: "Rendez-vous de demain, sinon annulation automatique",
      action: "Voir",
      href: `/rendez-vous?jour=${demain}`,
      ton: "acompte",
    });
  }
  const relances = calculerRelances(
    (seancesRelances.data ?? []).filter((s) => s.clientes?.actif),
    new Set((rdvsFuturs.data ?? []).map((r) => r.cliente_id)),
    maintenant,
  ).length;
  if (relances) {
    aTraiter.push({
      cle: "relances",
      nombre: relances,
      titre: "Clientes à relancer",
      detail: "Délai conseillé dépassé",
      action: "Ouvrir",
      href: "/relances",
      ton: "neutre",
    });
  }

  // En ligne depuis hier.
  const nouveautes: Nouveaute[] = [];
  for (const r of recents.data ?? []) {
    const nom = r.clientes?.nom_complet ?? "Cliente";
    const soin = r.soins_catalogue?.libelle_public || r.soins_catalogue?.libelle || "soin";
    if (r.source === "en_ligne" && r.created_at >= depuisHier) {
      nouveautes.push({
        cle: `${r.id}-r`,
        quoi: "Réservation",
        cliente: nom,
        detail: `${soin} · ${jourHeure(r.date_rdv, r.heure_rdv)}`,
        quand: quand(r.created_at, aujourdhui),
        instant: r.created_at,
        ton: "reservation",
      });
    }
    if (r.acompte_paye_le && r.acompte_paye_le >= depuisHier) {
      nouveautes.push({
        cle: `${r.id}-a`,
        quoi: "Acompte reçu",
        cliente: nom,
        detail: `${(r.acompte_montant ?? 0).toLocaleString("fr-FR")} F · ${jourHeure(r.date_rdv, r.heure_rdv)}`,
        quand: quand(r.acompte_paye_le, aujourdhui),
        instant: r.acompte_paye_le,
        ton: "acompte",
      });
    }
    if (r.annulation_motif && r.updated_at >= depuisHier) {
      nouveautes.push({
        cle: `${r.id}-x`,
        quoi: "Annulation",
        cliente: nom,
        detail: `${soin} · ${jourHeure(r.date_rdv, r.heure_rdv)} · ${
          r.annulation_motif === "cliente" ? "par la cliente" : "acompte non réglé"
        }`,
        quand: quand(r.updated_at, aujourdhui),
        instant: r.updated_at,
        ton: "annulation",
      });
    }
  }
  nouveautes.sort((a, b) => b.instant.localeCompare(a.instant));

  const acomptesDuJour = rdvsJour
    .filter((r) => r.acompte_paye_le)
    .reduce((t, r) => t + (r.acompte_montant ?? 0), 0);

  return {
    aujourdhui,
    rdvs,
    chiffres: {
      rdvDuJour: rdvs.length,
      honores: rdvs.filter((r) => r.statut === "honore").length,
      aVenir: rdvs.filter((r) => r.statut === "prevu").length,
      seancesDuJour: seancesDuJour.count ?? 0,
      acomptesDuJour,
      acomptesPayes: rdvsJour.filter((r) => r.acompte_paye_le).length,
      semaine: prochains.length + rdvs.filter((r) => r.statut === "prevu").length,
    },
    aTraiter,
    nouveautes: nouveautes.slice(0, 8),
  };
}
