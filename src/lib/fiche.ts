import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Identite, Sante } from "@/app/fiche/actions";
import {
  TEXTE_CONSENTEMENT_PHOTO,
  TEXTE_CONSENTEMENT_SOIN,
} from "@/lib/consentements";

export type FicheComplete = {
  identite: Identite;
  sante: Sante;
  consentementSoin: boolean;
  consentementPhoto: boolean;
  signaturePath: string | null;
};

export type ResultatInsertion =
  | { ok: true; id: string }
  | { ok: false; erreur: string; doublon?: boolean };

const vide = (s: string) => (s.trim() === "" ? null : s.trim());

export function ligneAnamnese(sante: Sante) {
  return {
    allergies: vide(sante.allergies),
    traitement_en_cours: sante.traitement_en_cours,
    traitement_detail: vide(sante.traitement_detail),
    grossesse_allaitement: sante.grossesse_allaitement,
    port_lentilles: sante.port_lentilles,
    implants_pacemaker: sante.implants_pacemaker,
    injections_recentes: sante.injections_recentes,
    injections_detail: vide(sante.injections_detail),
    fumeur: sante.fumeur,
    exposition_uv: sante.exposition_uv,
    hydratation: sante.hydratation,
    routine_actuelle: vide(sante.routine_actuelle),
    priorites: sante.priorites.length ? sante.priorites : null,
  };
}

/**
 * Création d'une cliente avec son premier bilan et ses consentements.
 *
 * Partagée entre la tablette (client à session, soumis à la RLS) et le lien
 * envoyé à la cliente (client de service, après vérification du jeton).
 * `auteur` vaut null dans le second cas : personne du personnel n'a saisi.
 */
export async function insererFiche(
  supabase: SupabaseClient,
  fiche: FicheComplete,
  auteur: string | null,
): Promise<ResultatInsertion> {
  const { identite } = fiche;

  if (!identite.nom_complet.trim() || !identite.telephone.trim()) {
    return { ok: false, erreur: "Le nom et le téléphone sont obligatoires." };
  }
  if (!fiche.consentementSoin) {
    return { ok: false, erreur: "Le consentement aux soins est obligatoire." };
  }

  const { data: cliente, error: erreurCliente } = await supabase
    .from("clientes")
    .insert({
      nom_complet: identite.nom_complet.trim(),
      date_naissance: vide(identite.date_naissance),
      profession: vide(identite.profession),
      telephone: identite.telephone.trim(),
      email: vide(identite.email),
    })
    .select("id")
    .single();

  if (erreurCliente || !cliente) {
    // 23505 = violation d'unicite, ici forcement le telephone.
    if (erreurCliente?.code === "23505") {
      return {
        ok: false,
        doublon: true,
        erreur: "Ce numéro de téléphone est déjà enregistré.",
      };
    }
    return { ok: false, erreur: erreurCliente?.message ?? "Enregistrement impossible." };
  }

  return insererBilan(supabase, cliente.id, fiche, auteur);
}

/**
 * Bilan santé et consentements d'une cliente déjà enregistrée : la fin de la
 * fiche, sans l'identité. Le bilan s'ajoute à l'historique, il n'écrase
 * jamais le précédent.
 */
export async function insererBilan(
  supabase: SupabaseClient,
  clienteId: string,
  fiche: Pick<FicheComplete, "sante" | "consentementSoin" | "consentementPhoto" | "signaturePath">,
  auteur: string | null,
): Promise<ResultatInsertion> {
  if (!fiche.consentementSoin) {
    return { ok: false, erreur: "Le consentement aux soins est obligatoire." };
  }

  const { error: erreurAnamnese } = await supabase.from("anamneses").insert({
    cliente_id: clienteId,
    saisie_par: auteur,
    ...ligneAnamnese(fiche.sante),
  });
  if (erreurAnamnese) return { ok: false, erreur: erreurAnamnese.message };

  const { error: erreurConsentements } = await supabase.from("consentements").insert([
    {
      cliente_id: clienteId,
      nature: "soin",
      accepte: true,
      texte_version: TEXTE_CONSENTEMENT_SOIN,
      signature_path: fiche.signaturePath,
      recueilli_par: auteur,
    },
    {
      cliente_id: clienteId,
      nature: "photo",
      accepte: fiche.consentementPhoto,
      texte_version: TEXTE_CONSENTEMENT_PHOTO,
      signature_path: fiche.signaturePath,
      recueilli_par: auteur,
    },
  ]);
  if (erreurConsentements) return { ok: false, erreur: erreurConsentements.message };

  return { ok: true, id: clienteId };
}
