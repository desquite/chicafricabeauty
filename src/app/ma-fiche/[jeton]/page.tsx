import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { lireLien } from "@/lib/liens-fiche";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";
import Parcours from "@/app/fiche/nouvelle/parcours";

export const metadata: Metadata = {
  title: "Votre fiche — Chic Africa Beauty",
  robots: { index: false, follow: false },
  // Le jeton est dans l'URL : il ne doit partir vers aucun autre site.
  referrer: "no-referrer",
};

const MESSAGES = {
  utilise: "Votre fiche a déjà été envoyée. Merci, à très bientôt à l'institut !",
  expire: "Ce lien a expiré. Demandez-en un nouveau à l'institut.",
  inconnu: "Ce lien n'est pas valable. Vérifiez qu'il a été copié en entier.",
};

/**
 * Fiche remplie par la cliente sur son propre téléphone.
 *
 * Hors de l'application du personnel : pas de session, pas de navigation.
 * Le jeton est vérifié ici pour l'affichage, puis de nouveau à l'envoi.
 */
export default async function PageMaFiche({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  const lien = await lireLien(jeton);

  if (lien.etat !== "valide") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <Logo className="h-16 w-16" />
        <p className="text-lg text-brand-800">{MESSAGES[lien.etat]}</p>
      </main>
    );
  }

  // Cliente deja enregistree : seul son prenom s'affiche, rien d'autre de sa
  // fiche ne sort vers cette page publique.
  if (lien.cliente_id) {
    const { data: c } = await createAdminClient()
      .from("clientes")
      .select("nom_complet, prenom_usuel")
      .eq("id", lien.cliente_id)
      .maybeSingle<{ nom_complet: string; prenom_usuel: string | null }>();
    if (c) return <Parcours jeton={jeton} prenom={nomChaleureux(c)} />;
  }

  return <Parcours jeton={jeton} />;
}
