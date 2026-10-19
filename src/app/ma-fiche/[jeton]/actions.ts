"use server";

import { revalidatePath } from "next/cache";
import { insererBilan, insererFiche, type FicheComplete } from "@/lib/fiche";
import { lireLien } from "@/lib/liens-fiche";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultatLien = { ok: true } | { ok: false; erreur: string };

/** Une signature PNG au doigt pese quelques dizaines de Ko. */
const SIGNATURE_MAX_OCTETS = 500_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Cette action est publique : son seul droit est le jeton. Tout ce qu'elle
 * recoit vient d'un navigateur inconnu, d'ou les bornes sur chaque champ.
 */
function bornerTextes(valeur: unknown): boolean {
  if (typeof valeur === "string") return valeur.length <= 1000;
  if (Array.isArray(valeur)) return valeur.length <= 30 && valeur.every(bornerTextes);
  if (valeur && typeof valeur === "object") return Object.values(valeur).every(bornerTextes);
  return true;
}

export async function enregistrerFicheParLien(
  jeton: string,
  fiche: Omit<FicheComplete, "signaturePath">,
  signature: string,
): Promise<ResultatLien> {
  const lien = await lireLien(jeton);
  if (lien.etat !== "valide") {
    return { ok: false, erreur: "Ce lien n'est plus valable. Demandez-en un nouveau à l'institut." };
  }
  if (!bornerTextes(fiche)) return { ok: false, erreur: "Une réponse est trop longue." };

  const prefixe = "data:image/png;base64,";
  const png = signature.startsWith(prefixe)
    ? Buffer.from(signature.slice(prefixe.length), "base64")
    : null;
  if (!png || png.length > SIGNATURE_MAX_OCTETS || !png.subarray(0, 4).equals(PNG)) {
    return { ok: false, erreur: "La signature n'a pas pu être lue. Signez à nouveau." };
  }

  const supabase = createAdminClient();
  const maintenant = new Date().toISOString();

  // Le lien est reserve avant toute ecriture : deux envois simultanes ne
  // peuvent pas creer deux fiches. La condition est reverifiee par la base.
  const { data: reserve } = await supabase
    .from("liens_fiche")
    .update({ utilise_le: maintenant })
    .eq("id", lien.id)
    .is("utilise_le", null)
    .is("revoque_le", null)
    .gt("expire_le", maintenant)
    .select("id");
  if (!reserve?.length) {
    return { ok: false, erreur: "Ce lien a déjà servi. Demandez-en un nouveau à l'institut." };
  }
  const liberer = () =>
    supabase.from("liens_fiche").update({ utilise_le: null }).eq("id", lien.id);

  const chemin = `${crypto.randomUUID()}.png`;
  const { error: erreurSignature } = await supabase.storage
    .from("signatures")
    .upload(chemin, png, { contentType: "image/png" });
  if (erreurSignature) {
    await liberer();
    return { ok: false, erreur: "La signature n'a pas pu être enregistrée. Réessayez." };
  }

  // Lien envoye a une cliente deja enregistree : seuls son bilan et ses
  // consentements sont ajoutes, son identite ne bouge pas.
  const r = lien.cliente_id
    ? await insererBilan(supabase, lien.cliente_id, { ...fiche, signaturePath: chemin }, null)
    : await insererFiche(supabase, { ...fiche, signaturePath: chemin }, null);
  if (!r.ok) {
    await supabase.storage.from("signatures").remove([chemin]);
    await liberer();
    // Jamais le nom de la cliente existante : la page est publique.
    return {
      ok: false,
      erreur: r.doublon
        ? "Ce numéro est déjà connu de l'institut : vous avez sans doute déjà une fiche. Contactez l'institut si vos informations ont changé."
        : "L'enregistrement a échoué. Réessayez dans un instant.",
    };
  }

  if (!lien.cliente_id) {
    await supabase.from("liens_fiche").update({ cliente_id: r.id }).eq("id", lien.id);
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${r.id}`);
  revalidatePath("/accueil");
  return { ok: true };
}
