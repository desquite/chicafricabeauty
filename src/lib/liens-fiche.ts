import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Liens de fiche à distance.
 *
 * Le jeton est le seul droit de la cliente : 32 octets aléatoires, inutilisable
 * deviné. La base n'en conserve que l'empreinte SHA-256 ; le lien en clair
 * n'existe que dans le message envoyé.
 */
export { DUREE_LIEN_HEURES } from "@/lib/liens-fiche-duree";

export function empreinte(jeton: string) {
  return createHash("sha256").update(jeton).digest("hex");
}

export function creerJeton() {
  const jeton = randomBytes(32).toString("base64url");
  return { jeton, empreinte: empreinte(jeton) };
}

export type EtatLien =
  | { etat: "valide"; id: string; cree_par: string | null }
  | { etat: "utilise" | "expire" | "inconnu" };

/** Un jeton malformé ne vaut pas la peine d'interroger la base. */
const FORME = /^[A-Za-z0-9_-]{43}$/;

export async function lireLien(jeton: string): Promise<EtatLien> {
  if (!FORME.test(jeton)) return { etat: "inconnu" };

  const { data } = await createAdminClient()
    .from("liens_fiche")
    .select("id, cree_par, expire_le, utilise_le, revoque_le")
    .eq("jeton_hash", empreinte(jeton))
    .maybeSingle();

  if (!data || data.revoque_le) return { etat: "inconnu" };
  if (data.utilise_le) return { etat: "utilise" };
  if (new Date(data.expire_le) <= new Date()) return { etat: "expire" };
  return { etat: "valide", id: data.id, cree_par: data.cree_par };
}
