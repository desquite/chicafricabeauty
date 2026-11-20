import { Suspense } from "react";
import { after } from "next/server";
import { requireProfil } from "@/lib/auth";
import { rattraperPaiementsEnAttente } from "@/lib/paiements-en-attente";
import { createClient } from "@/lib/supabase/server";
import { BarreChargement } from "@/components/attente";
import { NavigationTablette } from "@/components/navigation-tablette";
import { pastillesCaisse } from "@/lib/caisse-lecture";
import { seDeconnecter } from "@/app/connexion/actions";
import { Logo } from "@/components/logo";

export default async function LayoutApplication({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await requireProfil();
  // Un paiement dont la confirmation d'AfribaPay s'est perdue est rattrapé
  // dès qu'une gérante ouvre l'application, après la réponse.
  after(() => rattraperPaiementsEnAttente().catch(() => 0));

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
  // La gerante voit aussi le volet Caisse : rendez-vous a facturer, stock bas.
  const gerante = profil.role === "gerante";
  // Conversations WhatsApp avec des messages non lus.
  const { count: nonLus } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .gt("non_lus", 0);
  const pastilles = {
    "/rendez-vous": rdvRestants ?? 0,
    "/messages": nonLus ?? 0,
    ...(gerante ? await pastillesCaisse(supabase) : {}),
  };

  return (
    // L'écran tient exactement dans la fenêtre et seule la zone de contenu
    // défile, comme dans une application : le menu du bas ne bouge plus
    // avec la barre d'adresse ni avec une page trop large.
    <div className="flex h-dvh overflow-hidden print:h-auto print:overflow-visible">
      {/* useSearchParams impose une frontière Suspense. */}
      <Suspense fallback={null}>
        <BarreChargement />
      </Suspense>

      {/* Rail latéral : en paysage sur tablette, c'est la disposition qui laisse
          le plus de hauteur utile aux formulaires de saisie. */}
      <aside className="no-print hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-brand-100 bg-white md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <Logo className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-semibold text-brand-700">Chic Africa</p>
            <p className="text-[11px] tracking-[0.2em] text-or-600 uppercase">
              Beauty Online
            </p>
          </div>
        </div>

        <NavigationTablette pastilles={pastilles} gerante={gerante} />

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

      <div className="flex min-w-0 flex-1 flex-col print:block">
        {/* En haut, l'heure et la batterie de l'application installée
            recouvrent la page : on lui laisse leur place. */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pt-[max(1.5rem,env(safe-area-inset-top))] md:p-8 print:overflow-visible">
          {children}
        </main>
        {/* Sur téléphone, la navigation est sous la zone qui défile : le
            pouce y accède seul, sans descendre jusqu'au bas de la page. */}
        <NavigationTablette
          variante="basse"
          pastilles={pastilles}
          gerante={gerante}
          profil={{ nom: profil.nom, role: profil.role }}
        />
      </div>
    </div>
  );
}
