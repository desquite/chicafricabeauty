import { redirect } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { lireProduits, stockBas } from "@/lib/caisse-lecture";
import { bornes } from "@/lib/caisse";
import { createClient } from "@/lib/supabase/server";
import { GestionStock, type Mouvement } from "./gestion";

export const metadata = { title: "Stock — Chic Africa Beauty Online" };

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;

export default async function PageStock() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  const supabase = await createClient();
  const mois = bornes("mois", new Date().toISOString().slice(0, 10));

  const [produits, { data: mouvements }, { data: ventes }] = await Promise.all([
    lireProduits(supabase, false),
    supabase
      .from("mouvements_stock")
      .select("id, quantite, type, note, created_at, produits(nom), factures(numero_affiche)")
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<Mouvement[]>(),
    supabase
      .from("factures")
      .select("montant_produits")
      .eq("statut", "payee")
      .gte("payee_le", `${mois.debut}T00:00:00Z`)
      .lt("payee_le", `${mois.fin}T00:00:00Z`)
      .returns<{ montant_produits: number }[]>(),
  ]);

  const actifs = produits.filter((p) => p.actif);
  const bas = actifs.filter(stockBas);
  const valeur = actifs.reduce((t, p) => t + Math.max(0, p.stock) * p.prix_vente, 0);
  const ventesMois = (ventes ?? []).reduce((t, v) => t + v.montant_produits, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <h1 className="text-3xl font-semibold text-brand-800">Produits &amp; stock</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Produits suivis", String(actifs.length), "en vente"],
          ["Stock bas ou rupture", String(bas.length), bas.slice(0, 2).map((p) => p.nom).join(", ") || "aucun"],
          ["Valeur du stock", f(valeur), "au prix de vente"],
          ["Ventes de produits", f(ventesMois), "ce mois-ci"],
        ].map(([titre, valeurAffichee, detail]) => (
          <div key={titre} className="flex flex-col gap-0.5 rounded-2xl border border-brand-100 bg-white p-4">
            <span className="text-sm text-brand-500">{titre}</span>
            <span className="text-2xl font-bold text-brand-800">{valeurAffichee}</span>
            <span className="truncate text-xs text-brand-600">{detail}</span>
          </div>
        ))}
      </div>
      <GestionStock produits={produits} mouvements={mouvements ?? []} />
    </div>
  );
}
