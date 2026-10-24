"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";
import { paiementConfigure } from "@/lib/afribapay";
import { envoyerMessageAcompte } from "@/lib/notifications/acompte";
import { couvre, type Abonnement } from "@/lib/abonnements";
import { BATTEMENT_DEFAUT, minutes, tropProche, versHeure } from "@/lib/creneaux";
import { estExpire, lienASaisie, type RdvAcompte } from "@/lib/regles-acompte";

type Client = Awaited<ReturnType<typeof createClient>>;

const h = (min: number) => versHeure(min).replace(":", "h");

/**
 * Refuse un rendez-vous qui ne laisse pas le temps de préparer la salle :
 * battement_min minutes avant et après chaque autre rendez-vous prévu du
 * jour. Même règle que la réservation en ligne. Rend le message à afficher,
 * ou null si l'heure convient.
 */
async function conflitAgenda(
  supabase: Client,
  saisie: { id?: string; remplace?: string; date_rdv: string; heure_rdv: string },
  duree: number,
): Promise<string | null> {
  const [{ data: autres, error }, { data: reglages }] = await Promise.all([
    supabase
      .from("rendez_vous")
      .select(
        "id, heure_rdv, duree_min, date_rdv, created_at, source, acompte_requis, acompte_paye_le, clientes(nom_complet), soins_catalogue(duree_std)",
      )
      .eq("date_rdv", saisie.date_rdv)
      .eq("statut", "prevu")
      .is("remplace_par", null)
      .is("masque_le", null)
      .not("heure_rdv", "is", null)
      .returns<
        (RdvAcompte & {
          id: string;
          heure_rdv: string;
          duree_min: number | null;
          clientes: { nom_complet: string } | null;
          soins_catalogue: { duree_std: number | null } | null;
        })[]
      >(),
    supabase.from("reglages_rdv").select("battement_min").maybeSingle<{ battement_min: number }>(),
  ]);
  if (error) return `Vérification de l'agenda impossible : ${error.message}`;

  const battement = reglages?.battement_min ?? BATTEMENT_DEFAUT;
  const debut = minutes(saisie.heure_rdv);
  const fin = debut + duree;
  const maintenant = new Date();

  for (const r of autres ?? []) {
    if (r.id === saisie.id || r.id === saisie.remplace) continue;
    // Acompte non payé à l'échéance : le créneau est déjà rendu en ligne.
    if (estExpire(r, maintenant)) continue;
    const o = { debut: minutes(r.heure_rdv), fin: 0 };
    o.fin = o.debut + (r.duree_min ?? r.soins_catalogue?.duree_std ?? 60);
    if (!tropProche(debut, fin, o, battement)) continue;
    const qui = r.clientes?.nom_complet ?? "une cliente";
    if (battement === 0) {
      return `Ce créneau chevauche le rendez-vous de ${qui} (${h(o.debut)}–${h(o.fin)}).`;
    }
    const avant = o.debut - battement - duree;
    return (
      `Trop proche du rendez-vous de ${qui} (${h(o.debut)}–${h(o.fin)}) : il faut ${battement} min pour préparer la salle. ` +
      (avant >= 0 ? `Possible au plus tard à ${h(avant)}, ou à partir de ${h(o.fin + battement)}.` : `Possible à partir de ${h(o.fin + battement)}.`)
    );
  }
  return null;
}

export type Retour = { ok: boolean; erreur?: string };

export async function enregistrerRdv(saisie: {
  id?: string;
  cliente_id: string;
  date_rdv: string;
  heure_rdv: string;
  duree_min: string;
  soin_id: string;
  notes: string;
  /** Rendez-vous annulé ou manqué que celui-ci remplace. */
  remplace?: string;
}): Promise<Retour> {
  const profil = await requireProfil();
  const supabase = await createClient();

  if (!saisie.cliente_id) return { ok: false, erreur: "Choisissez une cliente." };
  if (!saisie.date_rdv) return { ok: false, erreur: "La date est obligatoire." };

  const valeurs = {
    cliente_id: saisie.cliente_id,
    date_rdv: saisie.date_rdv,
    heure_rdv: saisie.heure_rdv || null,
    duree_min: saisie.duree_min ? Number(saisie.duree_min) : null,
    soin_id: saisie.soin_id || null,
    notes: saisie.notes.trim() || null,
  };

  // Un rendez-vous modifié sans changer de jour, d'heure ni de durée n'est
  // pas revérifié : corriger une note ne doit pas buter sur un voisin posé
  // avant l'existence du battement.
  let inchange = false;
  if (saisie.id) {
    const { data: avant } = await supabase
      .from("rendez_vous")
      .select("date_rdv, heure_rdv, duree_min, soin_id")
      .eq("id", saisie.id)
      .maybeSingle<{ date_rdv: string; heure_rdv: string | null; duree_min: number | null; soin_id: string | null }>();
    inchange =
      !!avant &&
      avant.date_rdv === valeurs.date_rdv &&
      avant.heure_rdv?.slice(0, 5) === valeurs.heure_rdv?.slice(0, 5) &&
      avant.duree_min === valeurs.duree_min &&
      avant.soin_id === valeurs.soin_id;
  }

  if (valeurs.heure_rdv && !inchange) {
    let duree = valeurs.duree_min;
    if (!duree && valeurs.soin_id) {
      const { data: soin } = await supabase
        .from("soins_catalogue")
        .select("duree_std")
        .eq("id", valeurs.soin_id)
        .maybeSingle<{ duree_std: number | null }>();
      duree = soin?.duree_std ?? null;
    }
    const conflit = await conflitAgenda(
      supabase,
      { ...saisie, heure_rdv: valeurs.heure_rdv },
      duree ?? 60,
    );
    if (conflit) return { ok: false, erreur: conflit };
  }

  if (saisie.id) {
    const { error } = await supabase
      .from("rendez_vous")
      .update(valeurs)
      .eq("id", saisie.id);
    if (error) return { ok: false, erreur: error.message };
  } else {
    // Un rendez-vous reprogramme garde l'acompte deja regle sur l'ancien : la
    // cliente ne le paie pas deux fois.
    const [{ data: ancien }, { data: reglages }] = await Promise.all([
      saisie.remplace
        ? supabase
            .from("rendez_vous")
            .select("acompte_montant, acompte_paye_le")
            .eq("id", saisie.remplace)
            .maybeSingle<{ acompte_montant: number | null; acompte_paye_le: string | null }>()
        : Promise.resolve({ data: null }),
      supabase
        .from("reglages_rdv")
        .select("acompte_obligatoire, acompte_montant")
        .maybeSingle<{ acompte_obligatoire: boolean; acompte_montant: number }>(),
    ]);
    // Abonnée dont l'abonnement couvre ce soin ce jour-là : pas d'acompte.
    const { data: abos } = valeurs.soin_id
      ? await supabase
          .from("abonnements")
          .select("soin_id, statut, debut, duree_mois, jours_pause")
          .eq("cliente_id", valeurs.cliente_id)
          .eq("statut", "actif")
          .returns<Pick<Abonnement, "soin_id" | "statut" | "debut" | "duree_mois" | "jours_pause">[]>()
      : { data: [] };
    const abonnee = (abos ?? []).some((a) => couvre(a, valeurs.soin_id, valeurs.date_rdv));
    const acompteRequis =
      !abonnee &&
      Boolean(reglages?.acompte_obligatoire) &&
      (reglages?.acompte_montant ?? 0) > 0 &&
      paiementConfigure();

    const { data: cree, error } = await supabase
      .from("rendez_vous")
      .insert({
        ...valeurs,
        cree_par: profil.id,
        acompte_requis: acompteRequis,
        ...(ancien?.acompte_paye_le
          ? { acompte_montant: ancien.acompte_montant, acompte_paye_le: ancien.acompte_paye_le }
          : {}),
      })
      .select("id, date_rdv, created_at, source, acompte_requis, acompte_paye_le")
      .single<RdvAcompte & { id: string }>();
    if (error || !cree) {
      return { ok: false, erreur: error?.message ?? "Enregistrement impossible." };
    }

    // L'ancien rendez-vous garde son statut : c'est lui qui alimente le taux
    // d'absence. Il est seulement écarté de l'agenda, pas supprimé.
    if (saisie.remplace) {
      await supabase
        .from("rendez_vous")
        .update({ remplace_par: cree.id })
        .eq("id", saisie.remplace);
    }

    // Le lien de paiement part des la saisie, quelle que soit la date du soin ;
    // la tache du matin relance ensuite a J-2 et J-1 tant qu il n est pas regle.
    if (lienASaisie(cree, new Date())) {
      await envoyerMessageAcompte(cree.id, "lien").catch(() => null);
    }
  }

  revalidatePath("/rendez-vous");
  revalidatePath("/accueil");
  return { ok: true };
}

/**
 * Retire un rendez-vous de l'agenda sans le supprimer.
 *
 * Sert aux annulations reprogrammées à la main, avant l'existence du bouton
 * Reprogrammer : elles n'ont aucun lien vers leur remplaçant et resteraient
 * affichées indéfiniment sur leur ancienne date.
 */
export async function masquerRdv(id: string, masque: boolean): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rendez_vous")
    .update({ masque_le: masque ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/rendez-vous");
  return { ok: true };
}

/**
 * Un rendez-vous passé n'est jamais supprimé : le distinguer entre honoré,
 * annulé et absent est précisément ce qui permet de mesurer les absences.
 */
export async function changerStatut(
  id: string,
  statut: "prevu" | "honore" | "annule" | "absent",
): Promise<Retour> {
  await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase.from("rendez_vous").update({ statut }).eq("id", id);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/rendez-vous");
  return { ok: true };
}
