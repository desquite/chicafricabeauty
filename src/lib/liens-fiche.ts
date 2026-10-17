import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Liens de fiche à distance.
 *
 * Le jeton est le seul droit de la cliente. Dix caractères alphanumériques,
 * soit près de 60 bits : impossible à deviner par essais successifs sur un
 * lien qui ne vit que trois jours et ne sert qu'une fois. Plus long, le lien
 * déborde de l'aperçu WhatsApp et inquiète la cliente.
 *
 * La base n'en conserve que l'empreinte SHA-256 ; le lien en clair n'existe
 * que dans le message envoyé.
 */
export { DUREE_LIEN_HEURES } from "@/lib/liens-fiche-duree";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LONGUEUR_JETON = 10;
// Plus grand multiple de 62 sous 256 : au-dela, l'octet est ecarte pour que
// chaque caractere reste equiprobable.
const PLAFOND_OCTET = 248;

export function empreinte(jeton: string) {
  return createHash("sha256").update(jeton).digest("hex");
}

export function creerJeton() {
  let jeton = "";
  while (jeton.length < LONGUEUR_JETON) {
    for (const octet of randomBytes(16)) {
      if (octet < PLAFOND_OCTET && jeton.length < LONGUEUR_JETON) {
        jeton += ALPHABET[octet % ALPHABET.length];
      }
    }
  }
  return { jeton, empreinte: empreinte(jeton) };
}

export type EtatLien =
  | { etat: "valide"; id: string; cree_par: string | null }
  | { etat: "utilise" | "expire" | "inconnu" };

/**
 * Un jeton malformé ne vaut pas la peine d'interroger la base. Les 43
 * caractères restent admis : ce sont les premiers liens, déjà envoyés.
 */
const FORME = /^(?:[A-Za-z0-9]{10}|[A-Za-z0-9_-]{43})$/;

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
