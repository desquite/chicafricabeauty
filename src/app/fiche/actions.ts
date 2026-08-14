"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";
import {
  TEXTE_CONSENTEMENT_PHOTO,
  TEXTE_CONSENTEMENT_SOIN,
} from "@/lib/consentements";

export type Identite = {
  nom_complet: string;
  date_naissance: string;
  profession: string;
  telephone: string;
  email: string;
};

export type Sante = {
  allergies: string;
  traitement_en_cours: boolean | null;
  traitement_detail: string;
  grossesse_allaitement: boolean | null;
  port_lentilles: boolean | null;
  implants_pacemaker: boolean | null;
  injections_recentes: boolean | null;
  injections_detail: string;
  fumeur: boolean | null;
  exposition_uv: string | null;
  hydratation: string | null;
  routine_actuelle: string;
  priorites: string[];
};

export type Resultat = { ok: true; id: string } | { ok: false; erreur: string };

const vide = (s: string) => (s.trim() === "" ? null : s.trim());

/** Normalise un numero pour la comparaison : seuls les chiffres comptent. */
function chiffres(tel: string) {
  return tel.replace(/\D/g, "");
}

export async function enregistrerNouvelleFiche(payload: {
  identite: Identite;
  sante: Sante;
  consentementSoin: boolean;
  consentementPhoto: boolean;
  signaturePath: string | null;
}): Promise<Resultat> {
  const profil = await requireProfil();
  const supabase = await createClient();
  const { identite, sante } = payload;

  if (!identite.nom_complet.trim() || !identite.telephone.trim()) {
    return { ok: false, erreur: "Le nom et le téléphone sont obligatoires." };
  }
  if (!payload.consentementSoin) {
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
      const { data: existante } = await supabase
        .from("clientes")
        .select("nom_complet")
        .eq("telephone", identite.telephone.trim())
        .maybeSingle();
      return {
        ok: false,
        erreur: existante
          ? `Ce téléphone est déjà celui de ${existante.nom_complet}.`
          : "Ce numéro de téléphone est déjà enregistré.",
      };
    }
    return { ok: false, erreur: erreurCliente?.message ?? "Enregistrement impossible." };
  }

  const { error: erreurAnamnese } = await supabase.from("anamneses").insert({
    cliente_id: cliente.id,
    saisie_par: profil.id,
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
  });
  if (erreurAnamnese) return { ok: false, erreur: erreurAnamnese.message };

  const { error: erreurConsentements } = await supabase.from("consentements").insert([
    {
      cliente_id: cliente.id,
      nature: "soin",
      accepte: true,
      texte_version: TEXTE_CONSENTEMENT_SOIN,
      signature_path: payload.signaturePath,
      recueilli_par: profil.id,
    },
    {
      cliente_id: cliente.id,
      nature: "photo",
      accepte: payload.consentementPhoto,
      texte_version: TEXTE_CONSENTEMENT_PHOTO,
      signature_path: payload.signaturePath,
      recueilli_par: profil.id,
    },
  ]);
  if (erreurConsentements) return { ok: false, erreur: erreurConsentements.message };

  revalidatePath("/clientes");
  revalidatePath("/accueil");
  return { ok: true, id: cliente.id };
}

export type IdentiteModifiable = Identite & {
  notes: string;
  prenom_usuel: string;
  rappels_whatsapp: boolean;
  anniversaire_whatsapp: boolean;
  rappels_infobip: boolean;
};

/**
 * Correction des informations personnelles.
 *
 * Contrairement a l'anamnese, l'identite est bien modifiee sur place : une
 * faute de frappe dans un nom n'a pas d'historique a conserver. Les donnees
 * de sante, elles, restent en append-only.
 */
export async function modifierCliente(
  clienteId: string,
  identite: IdentiteModifiable,
): Promise<Resultat> {
  await requireProfil();
  const supabase = await createClient();

  if (!identite.nom_complet.trim() || !identite.telephone.trim()) {
    return { ok: false, erreur: "Le nom et le téléphone sont obligatoires." };
  }

  const { error } = await supabase
    .from("clientes")
    .update({
      nom_complet: identite.nom_complet.trim(),
      date_naissance: vide(identite.date_naissance),
      profession: vide(identite.profession),
      telephone: identite.telephone.trim(),
      email: vide(identite.email),
      notes: vide(identite.notes),
      prenom_usuel: vide(identite.prenom_usuel),
      rappels_whatsapp: identite.rappels_whatsapp,
      anniversaire_whatsapp: identite.anniversaire_whatsapp,
      rappels_infobip: identite.rappels_infobip,
    })
    .eq("id", clienteId);

  if (error) {
    if (error.code === "23505") {
      const { data: existante } = await supabase
        .from("clientes")
        .select("nom_complet")
        .eq("telephone", identite.telephone.trim())
        .maybeSingle();
      return {
        ok: false,
        erreur: existante
          ? `Ce téléphone est déjà celui de ${existante.nom_complet}.`
          : "Ce numéro de téléphone est déjà enregistré.",
      };
    }
    return { ok: false, erreur: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, id: clienteId };
}

/**
 * Archivage. Une cliente ayant un historique ne peut pas etre supprimee
 * (cle etrangere en on delete restrict) : elle sort des listes et des
 * selecteurs, mais ses seances passees restent lisibles.
 */
export async function changerArchivage(
  clienteId: string,
  actif: boolean,
): Promise<Resultat> {
  await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({ actif })
    .eq("id", clienteId);
  if (error) return { ok: false, erreur: error.message };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, id: clienteId };
}

/** Nouvelle anamnese pour une cliente existante : l'ancienne n'est pas ecrasee. */
export async function enregistrerNouvelleAnamnese(
  clienteId: string,
  sante: Sante,
): Promise<Resultat> {
  const profil = await requireProfil();
  const supabase = await createClient();

  const { error } = await supabase.from("anamneses").insert({
    cliente_id: clienteId,
    saisie_par: profil.id,
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
  });
  if (error) return { ok: false, erreur: error.message };

  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, id: clienteId };
}

/** Recherche d'un doublon avant creation, sur les chiffres du numero seuls. */
export async function chercherParTelephone(tel: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select("id, nom_complet, telephone");
  const cible = chiffres(tel);
  if (cible.length < 6) return null;
  return (
    data?.find((c) => chiffres(c.telephone).endsWith(cible.slice(-8))) ?? null
  );
}
