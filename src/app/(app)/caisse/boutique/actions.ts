"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireProfil } from "@/lib/auth";
import { annoncerEnvoi } from "@/lib/boutique";
import { createClient } from "@/lib/supabase/server";

export type Retour = { ok: boolean; erreur?: string };

/** Suivi d'une commande : expédiée, livrée, ou annulée (le stock revient). */
export async function suivreCommande(id: string, etape: "expediee" | "livree" | "annulee"): Promise<Retour> {
  const profil = await requireProfil();
  if (profil.role !== "gerante") return { ok: false, erreur: "Réservé à la gérante." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suivre_commande", { p_commande: id, p_etape: etape });
  if (error || (data as { erreur?: string } | null)?.erreur) {
    return { ok: false, erreur: "La commande a changé entre-temps : rechargez la page." };
  }
  // La cliente est prévenue après la réponse, pour ne pas ralentir le clic.
  if (etape === "expediee") after(() => annoncerEnvoi(id).catch(() => null));
  revalidatePath("/caisse/boutique");
  return { ok: true };
}
