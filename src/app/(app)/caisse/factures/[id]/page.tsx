import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { libelleMode } from "@/lib/caisse";
import { createClient } from "@/lib/supabase/server";
import { AnnulerFacture } from "./annuler";

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;

/** Détail d'une facture encaissée : réimpression, annulation. */
export default async function PageFacture({ params }: { params: Promise<{ id: string }> }) {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  const { id } = await params;
  const supabase = await createClient();

  const { data: x } = await supabase
    .from("factures")
    .select("*, clientes(id, nom_complet)")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      statut: "brouillon" | "payee" | "annulee";
      numero_affiche: string | null;
      montant_soins_normal: number;
      montant_soins: number;
      montant_produits: number;
      remise_fidelite: number;
      acompte_deduit: number;
      total: number;
      mode_paiement: string | null;
      payee_le: string | null;
      notes: string | null;
      clientes: { id: string; nom_complet: string } | null;
    }>();
  if (!x) notFound();
  if (x.statut === "brouillon") redirect(`/caisse?f=${x.id}`);
  const { data: lignes } = await supabase
    .from("lignes_facture")
    .select("type, libelle, quantite, prix_unitaire")
    .eq("facture_id", id)
    .order("ordre")
    .returns<{ type: string; libelle: string; quantite: number; prix_unitaire: number }[]>();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/caisse/factures" className="text-sm font-medium text-brand-600 hover:underline">
        ← Factures
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-800">Reçu n° {x.numero_affiche}</h1>
          <p className="text-sm text-brand-500">
            {x.clientes ? (
              <Link href={`/clientes/${x.clientes.id}`} className="underline">
                {x.clientes.nom_complet}
              </Link>
            ) : (
              "Client de passage"
            )}{" "}
            · {x.payee_le && new Date(x.payee_le).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })} ·{" "}
            {libelleMode(x.mode_paiement)}
          </p>
        </div>
        {x.statut === "annulee" && <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700">annulée</span>}
      </header>

      <section className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-4 text-sm">
        {(lignes ?? []).map((l, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>
              {l.type === "produit" ? `${l.quantite} x ` : ""}
              {l.libelle}
            </span>
            <span>{l.prix_unitaire ? f(l.prix_unitaire * l.quantite) : "inclus"}</span>
          </div>
        ))}
        {x.montant_soins !== x.montant_soins_normal && (
          <div className="flex justify-between text-brand-600">
            <span>Forfait des soins</span>
            <span>{f(x.montant_soins)} au lieu de {f(x.montant_soins_normal)}</span>
          </div>
        )}
        {x.remise_fidelite > 0 && (
          <div className="flex justify-between">
            <span>Remise fidélité</span>
            <span>−{f(x.remise_fidelite)}</span>
          </div>
        )}
        {x.acompte_deduit > 0 && (
          <div className="flex justify-between">
            <span>Acompte payé en ligne</span>
            <span>−{f(x.acompte_deduit)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-brand-100 pt-2 text-lg font-bold text-brand-800">
          <span>Payé</span>
          <span>{f(x.total)}</span>
        </div>
        {x.notes && <p className="text-brand-600">{x.notes}</p>}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={`/recu/${x.id}?format=ticket`} className="flex h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white">
          Réimprimer (ticket)
        </Link>
        <Link href={`/recu/${x.id}?format=a5`} className="flex h-11 items-center rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700">
          Réimprimer (A5)
        </Link>
        {x.statut === "payee" && <AnnulerFacture id={x.id} />}
      </div>
    </div>
  );
}
