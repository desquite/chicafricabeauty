import { Suspense } from "react";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BarreChargement } from "@/components/attente";
import { NavigationTablette } from "@/components/navigation-tablette";
import { seDeconnecter } from "@/app/connexion/actions";
import { Logo } from "@/components/logo";

export default async function LayoutApplication({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await requireProfil();

  // Rendez-vous encore attendus aujourd'hui, en pastille dans le menu : une
  // seule lecture comptee, legere a chaque navigation.
  const supabase = await createClient();
  const { count: rdvRestants } = await supabase
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .eq("date_rdv", new Date().toISOString().slice(0, 10))
    .eq("statut", "prevu")
    .is("remplace_par", null)
    .is("masque_le", null);
  const pastilles = { "/rendez-vous": rdvRestants ?? 0 };

  return (
    <div className="flex min-h-full flex-1">
      {/* useSearchParams impose une frontière Suspense. */}
      <Suspense fallback={null}>
        <BarreChargement />
      </Suspense>

      {/* Rail latéral : en paysage sur tablette, c'est la disposition qui laisse
          le plus de hauteur utile aux formulaires de saisie. */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-brand-100 bg-white md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <Logo className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-semibold text-brand-700">Chic Africa</p>
            <p className="text-[11px] tracking-[0.2em] text-or-600 uppercase">
              Beauty Online
            </p>
          </div>
        </div>

        <NavigationTablette pastilles={pastilles} />

        <div className="mt-auto border-t border-brand-100 p-4">
          <p className="truncate text-sm font-medium text-brand-800">
            {profil.nom}
          </p>
          <p className="mb-3 text-xs text-brand-400 capitalize">{profil.role}</p>
          <form action={seDeconnecter}>
            <button
              type="submit"
              className="h-11 w-full rounded-lg border border-brand-200 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-6 md:p-8">{children}</main>
        {/* En portrait, la navigation passe en bas : le pouce y accède seul. */}
        <NavigationTablette variante="basse" pastilles={pastilles} />
      </div>
    </div>
  );
}
