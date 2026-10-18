"use server";

import { revalidatePath } from "next/cache";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Une cliente contactée sort de la liste pour deux semaines, et du
 * récapitulatif du matin aussi. Annulable : un appui de travers se corrige.
 */
export async function marquerContactee(
  clienteId: string,
  contactee: boolean,
): Promise<{ ok: boolean; erreur?: string }> {
  const profil = await requireProfil();
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update(
      contactee
        ? { relancee_le: new Date().toISOString(), relancee_par: profil.id }
        : { relancee_le: null, relancee_par: null },
    )
    .eq("id", clienteId);
  if (error) return { ok: false, erreur: error.message };
  revalidatePath("/relances");
  return { ok: true };
}
