"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";
import { ouvreDroit, rangSeance, type ChoixRemise } from "@/lib/fidelite";

export type SaisieSeance = {
  cliente_id: string;
  date_seance: string;
  type_venue: string;
  type_peau: string | null;
  etat_peau: string | null;
  observations_peau: string[];
  soins: string[];
  zones: string[];
  produits_utilises: string;
  appareil: string;
  duree_min: string;
  reactions: string[];
  evolution: string | null;
  observations: string;
  incident: string;
  programme: string;
  conseils: string;
  produits_conseilles: string;
  delai_recommande: string | null;
  prochain_rdv: string;
  prochain_rdv_heure: string;
  /** Rendez-vous que cette séance honore, quand la saisie part de l'agenda. */
  rdv_id: string | null;
  /** Ce que la cliente a fait de sa remise, si cette séance y ouvre droit. */
  remise_fidelite: ChoixRemise | null;
};

export type Resultat = { ok: true; id: string } | { ok: false; erreur: string };

type Client = Awaited<ReturnType<typeof createClient>>;

const vide = (s: string) => (s.trim() === "" ? null : s.trim());
const liste = (l: string[]) => (l.length ? l : null);
const jourFr = (iso: string) => iso.split("-").reverse().join("/");

export async function enregistrerSeance(s: SaisieSeance): Promise<Resultat> {
  const profil = await requireProfil();
  const supabase = await createClient();

  if (!s.cliente_id) return { ok: false, erreur: "Aucune cliente sélectionnée." };
  if (s.soins.length === 0)
    return { ok: false, erreur: "Indiquez au moins un soin réalisé." };

  // Le rang est recompté ici, jamais repris du navigateur : deux tablettes
  // ouvertes en même temps sur la même cliente offriraient sinon deux fois la
  // remise. Il est ensuite figé sur la séance, pour qu'une venue supprimée
  // plus tard ne décale pas les remises déjà accordées.
  const { count } = await supabase
    .from("seances")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", s.cliente_id);

  const rang = rangSeance(count ?? 0);
  const remise = ouvreDroit(rang);

  const { data: seance, error } = await supabase
    .from("seances")
    .insert({
      cliente_id: s.cliente_id,
      praticienne_id: profil.id,
      date_seance: s.date_seance,
      type_venue: s.type_venue,
      type_peau: s.type_peau,
      etat_peau: s.etat_peau,
      observations_peau: liste(s.observations_peau),
      zones: liste(s.zones),
      produits_utilises: vide(s.produits_utilises),
      appareil: vide(s.appareil),
      duree_min: s.duree_min ? Number(s.duree_min) : null,
      reactions: liste(s.reactions),
      evolution: s.evolution,
      observations: vide(s.observations),
      incident: vide(s.incident),
      programme: vide(s.programme),
      conseils: vide(s.conseils),
      produits_conseilles: vide(s.produits_conseilles),
      delai_recommande: s.delai_recommande,
      prochain_rdv: vide(s.prochain_rdv),
      remise_palier: remise ? rang : null,
      remise_fidelite: remise ? s.remise_fidelite : null,
      cloturee: true,
    })
    .select("id")
    .single();

  if (error || !seance)
    return { ok: false, erreur: error?.message ?? "Enregistrement impossible." };

  const { error: erreurSoins } = await supabase
    .from("seance_soins")
    .insert(s.soins.map((soin_id) => ({ seance_id: seance.id, soin_id })));

  if (erreurSoins) {
    // La seance sans ses soins n'a pas de sens : on annule plutot que de
    // laisser une ligne incomplete dans l'historique.
    await supabase.from("seances").delete().eq("id", seance.id);
    return { ok: false, erreur: `Soins non enregistrés : ${erreurSoins.message}` };
  }

  // Les deux liens avec l'agenda. Ni l'un ni l'autre ne conditionne la
  // séance : elle est enregistrée, et une erreur ici ne doit pas la faire
  // annuler. Chacun est rattrapable à la main depuis les rendez-vous.
  await honorerRdv(supabase, s, seance.id);
  await inscrireProchainRdv(supabase, s, profil.id);

  revalidatePath("/seances");
  revalidatePath("/accueil");
  revalidatePath("/rendez-vous");
  revalidatePath(`/clientes/${s.cliente_id}`);
  return { ok: true, id: seance.id };
}

/**
 * Bascule en « honoré » le rendez-vous que cette séance vient de réaliser.
 *
 * Sans ce rattachement, un rendez-vous restait « prévu » indéfiniment : une
 * cliente pourtant venue continuait d'apparaître à l'agenda, et rien ne
 * distinguait plus un rendez-vous honoré d'une absence.
 *
 * Le rendez-vous est connu quand la saisie part de l'agenda. Sinon on le
 * retrouve par la cliente et la date, car la séance est le plus souvent
 * saisie depuis la fiche de la cliente, sans passer par l'agenda.
 */
async function honorerRdv(supabase: Client, s: SaisieSeance, seanceId: string) {
  let id = s.rdv_id;

  if (!id) {
    const { data } = await supabase
      .from("rendez_vous")
      .select("id")
      .eq("cliente_id", s.cliente_id)
      .eq("date_rdv", s.date_seance)
      .eq("statut", "prevu")
      .is("seance_id", null)
      .is("remplace_par", null)
      .is("masque_le", null)
      .order("heure_rdv", { nullsFirst: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    id = data?.id ?? null;
  }

  if (!id) return;

  await supabase
    .from("rendez_vous")
    .update({ statut: "honore", seance_id: seanceId })
    .eq("id", id);
}

/**
 * Inscrit à l'agenda le rendez-vous fixé en fin de séance.
 *
 * Cette date ne vivait que sur la séance : elle n'apparaissait sur aucune
 * journée de l'agenda, ne comptait pas dans les rendez-vous du jour et ne
 * déclenchait aucun rappel WhatsApp. La cliente repartait avec une date que
 * l'institut était seul à ne pas voir venir.
 */
async function inscrireProchainRdv(
  supabase: Client,
  s: SaisieSeance,
  profilId: string,
) {
  const date = vide(s.prochain_rdv);
  if (!date) return;

  // La gérante a pu poser ce rendez-vous depuis l'agenda avant de saisir la
  // séance : on ne le double pas. Les rendez-vous masqués ou remplacés ne
  // comptent pas, ils ne sont plus à l'agenda.
  const { data: existant } = await supabase
    .from("rendez_vous")
    .select("id")
    .eq("cliente_id", s.cliente_id)
    .eq("date_rdv", date)
    .is("remplace_par", null)
    .is("masque_le", null)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existant) return;

  await supabase.from("rendez_vous").insert({
    cliente_id: s.cliente_id,
    date_rdv: date,
    heure_rdv: vide(s.prochain_rdv_heure),
    notes: `Fixé en fin de séance du ${jourFr(s.date_seance)}`,
    cree_par: profilId,
  });
}
