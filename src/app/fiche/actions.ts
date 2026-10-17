"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireProfil } from "@/lib/auth";
import { insererFiche, ligneAnamnese, type FicheComplete } from "@/lib/fiche";
import { creerJeton, DUREE_LIEN_HEURES } from "@/lib/liens-fiche";

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

export async function enregistrerNouvelleFiche(
  payload: FicheComplete,
): Promise<Resultat> {
  const profil = await requireProfil();
  const supabase = await createClient();

  const r = await insererFiche(supabase, payload, profil.id);
  if (!r.ok) {
    if (r.doublon) {
      const { data: existante } = await supabase
        .from("clientes")
        .select("nom_complet")
        .eq("telephone", payload.identite.telephone.trim())
        .maybeSingle();
      if (existante) {
        return { ok: false, erreur: `Ce téléphone est déjà celui de ${existante.nom_complet}.` };
      }
    }
    return { ok: false, erreur: r.erreur };
  }

  revalidatePath("/clientes");
  revalidatePath("/accueil");
  return { ok: true, id: r.id };
}

/**
 * Adresse a donner a la cliente. En production, toujours le domaine principal
 * du projet, fourni par Vercel (un domaine personnalise des qu'il y en a un) :
 * la tablette peut avoir ouvert l'app par une adresse de deploiement, bien
 * plus longue et moins rassurante dans un message. En local, l'hote de la
 * requete.
 */
async function adressePublique() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && production) {
    return `https://${production}`;
  }
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host");
  const protocole = h.get("x-forwarded-proto") ?? "https";
  return `${protocole}://${hote}`;
}

export type LienCree =
  | { ok: true; url: string; expire_le: string }
  | { ok: false; erreur: string };

/**
 * Lien a envoyer a une nouvelle cliente pour qu'elle remplisse sa fiche
 * depuis son telephone. Le jeton en clair n'existe qu'ici et dans le lien :
 * la base n'en garde que l'empreinte, il ne pourra pas etre reaffiche.
 */
export async function creerLienFiche(): Promise<LienCree> {
  const profil = await requireProfil();
  const supabase = await createClient();
  const { jeton, empreinte } = creerJeton();
  const expire = new Date(Date.now() + DUREE_LIEN_HEURES * 3600_000);

  const { error } = await supabase.from("liens_fiche").insert({
    jeton_hash: empreinte,
    cree_par: profil.id,
    expire_le: expire.toISOString(),
  });
  if (error) return { ok: false, erreur: error.message };

  return {
    ok: true,
    url: `${await adressePublique()}/ma-fiche/${jeton}`,
    expire_le: expire.toISOString(),
  };
}

export type IdentiteModifiable = Identite & {
  notes: string;
  prenom_usuel: string;
  rappels_whatsapp: boolean;
  anniversaire_whatsapp: boolean;
  promotions_whatsapp: boolean;
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
      promotions_whatsapp: identite.promotions_whatsapp,
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
    ...ligneAnamnese(sante),
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
