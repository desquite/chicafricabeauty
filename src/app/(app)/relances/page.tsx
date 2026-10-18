import { adressePublique } from "@/lib/adresse";
import { requireProfil } from "@/lib/auth";
import { calculerRelances, JOURS_APRES_CONTACT } from "@/lib/notifications/recapitulatif";
import { createClient } from "@/lib/supabase/server";
import { DELAIS, nomChaleureux } from "@/lib/types";
import { ListeRelances, type Relance } from "./liste";

export const metadata = { title: "À relancer — Chic Africa Beauty Online" };

type Ligne = {
  cliente_id: string;
  date_seance: string;
  delai_recommande: string | null;
  clientes: {
    nom_complet: string;
    prenom_usuel: string | null;
    telephone: string;
    actif: boolean;
    relancee_le: string | null;
  } | null;
  soins: { soins_catalogue: { libelle: string } | null }[];
};

/**
 * Clientes à relancer : le délai conseillé à leur dernière séance est dépassé
 * d'une semaine, et aucun rendez-vous n'est prévu. Même calcul que le
 * récapitulatif WhatsApp du matin, ici avec de quoi les contacter.
 */
export default async function PageRelances() {
  await requireProfil();
  const supabase = await createClient();
  const maintenant = new Date();
  const jour = maintenant.toISOString().slice(0, 10);

  const [seances, rdvs] = await Promise.all([
    supabase
      .from("seances")
      .select(
        "cliente_id, date_seance, delai_recommande, " +
          "clientes(nom_complet, prenom_usuel, telephone, actif, relancee_le), " +
          "soins:seance_soins(soins_catalogue(libelle))",
      )
      .order("date_seance", { ascending: false })
      .limit(1000)
      .returns<Ligne[]>(),
    supabase
      .from("rendez_vous")
      .select("cliente_id")
      .gte("date_rdv", jour)
      .eq("statut", "prevu")
      .returns<{ cliente_id: string }[]>(),
  ]);

  const erreur = seances.error ?? rdvs.error;
  if (erreur) throw new Error(`Lecture des relances impossible : ${erreur.message}`);

  const libelleDelai = new Map<string, string>(DELAIS.map((d) => [d.valeur, d.libelle]));

  const relances: Relance[] = calculerRelances(
    seances.data ?? [],
    new Set((rdvs.data ?? []).map((r) => r.cliente_id)),
    maintenant,
  )
    .filter((r) => r.seance.clientes?.actif)
    .map(({ jours, seance }) => ({
      clienteId: seance.cliente_id,
      nom: seance.clientes!.nom_complet,
      prenom: nomChaleureux(seance.clientes!),
      telephone: seance.clientes!.telephone,
      jours,
      derniereSeance: seance.date_seance,
      delai: libelleDelai.get(seance.delai_recommande ?? "") ?? "",
      soins: seance.soins.map((s) => s.soins_catalogue?.libelle).filter((x): x is string => !!x),
    }));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-2">
        <h1 className="text-3xl font-semibold text-brand-800">À relancer</h1>
        <p className="mt-1 text-brand-400">
          Délai conseillé dépassé d&apos;une semaine, sans rendez-vous prévu. Une cliente marquée
          « contactée » sort de la liste pour {JOURS_APRES_CONTACT} jours.
        </p>
      </header>
      <ListeRelances relances={relances} site={await adressePublique()} />
    </div>
  );
}
