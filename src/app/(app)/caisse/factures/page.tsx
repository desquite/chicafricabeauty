import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { libelleMode } from "@/lib/caisse";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Factures — Chic Africa Beauty Online" };

type Ligne = {
  id: string;
  numero_affiche: string | null;
  statut: "payee" | "annulee";
  total: number;
  mode_paiement: string | null;
  payee_le: string;
  clientes: { nom_complet: string } | null;
};

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;

/** Les factures encaissées, les plus récentes d'abord. */
export default async function PageFactures({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  const { q } = await searchParams;
  const supabase = await createClient();

  let requete = supabase
    .from("factures")
    .select("id, numero_affiche, statut, total, mode_paiement, payee_le, clientes(nom_complet)")
    .in("statut", ["payee", "annulee"])
    .order("payee_le", { ascending: false })
    .limit(150);
  const recherche = q?.trim().slice(0, 40);
  if (recherche) requete = requete.ilike("numero_affiche", `%${recherche}%`);
  const { data: factures } = await requete.returns<Ligne[]>();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-brand-800">Factures</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={recherche ?? ""}
            placeholder="N° de reçu"
            aria-label="Rechercher un numéro de reçu"
            className="h-11 w-44 rounded-xl border border-brand-200 bg-white px-3 text-base"
          />
          <button type="submit" className="h-11 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700">
            Chercher
          </button>
        </form>
      </header>

      {(factures ?? []).length === 0 && <p className="text-brand-500">Aucune facture encaissée pour l&apos;instant.</p>}
      <ul className="flex flex-col gap-2">
        {(factures ?? []).map((x) => (
          <li key={x.id}>
            <Link
              href={`/caisse/factures/${x.id}`}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-white p-4 hover:shadow-md"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="text-brand-900">
                  {x.clientes?.nom_complet ?? "Client de passage"}
                </strong>
                <span className="text-sm text-brand-500">
                  N° {x.numero_affiche} ·{" "}
                  {new Date(x.payee_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}{" "}
                  · {libelleMode(x.mode_paiement)}
                </span>
              </span>
              {x.statut === "annulee" ? (
                <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-700">annulée</span>
              ) : (
                <span className="text-lg font-bold text-brand-800">{f(x.total)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
