import { redirect } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { MODES_PAIEMENT } from "@/lib/caisse";
import { createClient } from "@/lib/supabase/server";
import { BoutonImprimer } from "./imprimer";

export const metadata = { title: "Clôture du jour — Chic Africa Beauty Online" };

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;

/**
 * Clôture du jour : ce qui est entré en caisse, mode par mode, à comparer
 * avec le tiroir et les relevés Mobile Money ; plus ce qui est arrivé en
 * ligne (acomptes, abonnements) par AfribaPay.
 */
export default async function PageCloture({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  const { jour: j } = await searchParams;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const jour = j && /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : aujourdhui;
  const lendemain = new Date(Date.parse(`${jour}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const de = `${jour}T00:00:00Z`;
  const a = `${lendemain}T00:00:00Z`;
  const supabase = await createClient();

  const [{ data: factures }, { data: acomptes }, { data: abonnements }] = await Promise.all([
    supabase
      .from("factures")
      .select("statut, total, mode_paiement, montant_soins, montant_produits, remise_fidelite, remise_sur")
      .in("statut", ["payee", "annulee"])
      .gte("payee_le", de)
      .lt("payee_le", a)
      .returns<
        {
          statut: "payee" | "annulee";
          total: number;
          mode_paiement: string | null;
          montant_soins: number;
          montant_produits: number;
          remise_fidelite: number;
          remise_sur: "soin" | "produit" | null;
        }[]
      >(),
    supabase.from("paiements_acompte").select("montant").eq("statut", "reussi").gte("updated_at", de).lt("updated_at", a).returns<{ montant: number }[]>(),
    supabase.from("paiements_abonnement").select("montant").eq("statut", "reussi").gte("updated_at", de).lt("updated_at", a).returns<{ montant: number }[]>(),
  ]);

  const payees = (factures ?? []).filter((x) => x.statut === "payee");
  const annulees = (factures ?? []).filter((x) => x.statut === "annulee");
  const parMode = MODES_PAIEMENT.map((m) => {
    const liste = payees.filter((x) => x.mode_paiement === m.valeur);
    return { ...m, nombre: liste.length, total: liste.reduce((t, x) => t + x.total, 0) };
  });
  const caisse = payees.reduce((t, x) => t + x.total, 0);
  const enLigneAcomptes = (acomptes ?? []).reduce((t, x) => t + x.montant, 0);
  const enLigneAbonnements = (abonnements ?? []).reduce((t, x) => t + x.montant, 0);
  const soins = payees.reduce((t, x) => t + x.montant_soins - (x.remise_sur === "soin" ? x.remise_fidelite : 0), 0);
  const produits = payees.reduce((t, x) => t + x.montant_produits - (x.remise_sur === "produit" ? x.remise_fidelite : 0), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-brand-800">Clôture du jour</h1>
          <p className="text-brand-500">
            {new Date(`${jour}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
          </p>
        </div>
        <form className="no-print flex gap-2">
          <input type="date" name="jour" defaultValue={jour} aria-label="Jour" className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-base" />
          <button type="submit" className="h-11 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700">
            Voir
          </button>
          <BoutonImprimer />
        </form>
      </header>

      <section className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-4">
        <h2 className="font-semibold text-brand-900">Encaissé à l&apos;institut</h2>
        <dl className="flex flex-col gap-1.5 text-sm">
          {parMode.map((m) => (
            <div key={m.valeur} className={`flex justify-between ${m.nombre ? "text-brand-900" : "text-brand-400"}`}>
              <dt>
                {m.libelle}
                {m.nombre > 0 && ` · ${m.nombre} facture${m.nombre > 1 ? "s" : ""}`}
              </dt>
              <dd className="font-semibold">{f(m.total)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-brand-100 pt-2 text-lg font-bold text-brand-800">
            <dt>Total caisse</dt>
            <dd>{f(caisse)}</dd>
          </div>
        </dl>
        {annulees.length > 0 && (
          <p className="text-sm text-red-700">
            {annulees.length} facture{annulees.length > 1 ? "s" : ""} annulée{annulees.length > 1 ? "s" : ""} ce jour (hors total).
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-4">
        <h2 className="font-semibold text-brand-900">Reçu en ligne (AfribaPay)</h2>
        <dl className="flex flex-col gap-1.5 text-sm text-brand-900">
          <div className="flex justify-between">
            <dt>Acomptes de rendez-vous · {(acomptes ?? []).length}</dt>
            <dd className="font-semibold">{f(enLigneAcomptes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Abonnements · {(abonnements ?? []).length}</dt>
            <dd className="font-semibold">{f(enLigneAbonnements)}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-[#fbf6e9] p-4 ring-1 ring-[#ecd9a8]">
        <h2 className="text-xs font-bold tracking-wider text-[#6e5114] uppercase">Chiffre d&apos;affaires du jour</h2>
        <p className="text-3xl font-bold text-brand-800">{f(soins + produits + enLigneAbonnements)}</p>
        <p className="text-sm text-brand-700">
          Soins {f(soins)} · Produits {f(produits)} · Abonnements {f(enLigneAbonnements)} · {payees.length} facture
          {payees.length > 1 ? "s" : ""}
        </p>
        <p className="text-xs text-brand-600">
          Les acomptes sont comptés dans les soins le jour de la facture, pas le jour où ils sont payés.
        </p>
      </section>
    </div>
  );
}
