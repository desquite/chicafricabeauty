"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";

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
};

export type Resultat = { ok: true; id: string } | { ok: false; erreur: string };

const vide = (s: string) => (s.trim() === "" ? null : s.trim());
const liste = (l: string[]) => (l.length ? l : null);

export async function enregistrerSeance(s: SaisieSeance): Promise<Resultat> {
  const profil = await requireProfil();
  const supabase = await createClient();

  if (!s.cliente_id) return { ok: false, erreur: "Aucune cliente sélectionnée." };
  if (s.soins.length === 0)
    return { ok: false, erreur: "Indiquez au moins un soin réalisé." };

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

  revalidatePath("/seances");
  revalidatePath("/accueil");
  revalidatePath(`/clientes/${s.cliente_id}`);
  return { ok: true, id: seance.id };
}
