import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { paiementConfigure } from "@/lib/afribapay";
import { createClient } from "@/lib/supabase/server";
import type { Fermeture, HoraireJour, ReglagesRdv } from "@/lib/types";
import { Fermetures, Horaires, Reglages } from "./editeurs";

export const metadata = { title: "Disponibilités — Chic Africa Beauty Online" };

export default async function PageDisponibilites() {
  const profil = await requireProfil();
  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [horaires, fermetures, reglages] = await Promise.all([
    supabase.from("horaires_semaine").select("*").returns<HoraireJour[]>(),
    // Les fermetures passees n'ont plus d'effet : seules restent celles qui
    // touchent encore aujourd'hui ou l'avenir.
    supabase
      .from("fermetures")
      .select("id, date_debut, date_fin, heure_debut, heure_fin, motif")
      .gte("date_fin", aujourdhui)
      .order("date_debut")
      .order("heure_debut", { nullsFirst: true })
      .returns<Fermeture[]>(),
    supabase
      .from("reglages_rdv")
      .select("horizon_jours, acompte_montant, acompte_obligatoire, battement_min")
      .maybeSingle<ReglagesRdv>(),
  ]);

  const erreur = horaires.error ?? fermetures.error ?? reglages.error;
  if (erreur) throw new Error(`Lecture des disponibilités impossible : ${erreur.message}`);

  const modifiable = profil.role === "gerante";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/rendez-vous" className="text-sm font-medium text-brand-600 hover:underline">
        ← Rendez-vous
      </Link>
      <header className="mt-2 mb-2">
        <h1 className="text-3xl font-semibold text-brand-800">Disponibilités</h1>
        <p className="mt-1 text-brand-400">
          Les créneaux proposés en ligne suivent ces réglages, dès leur enregistrement.
        </p>
      </header>

      {!modifiable && (
        <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Seule la gérante peut modifier les disponibilités.
        </p>
      )}

      <div className="mt-6 space-y-8">
        <Horaires horaires={horaires.data ?? []} modifiable={modifiable} />
        <Fermetures
          fermetures={fermetures.data ?? []}
          modifiable={modifiable}
          aujourdhui={aujourdhui}
        />
        <Reglages
          reglages={
            reglages.data ?? {
              horizon_jours: 60,
              acompte_montant: 10000,
              acompte_obligatoire: false,
              battement_min: 30,
            }
          }
          modifiable={modifiable}
          paiementPret={paiementConfigure()}
        />
      </div>
    </div>
  );
}
