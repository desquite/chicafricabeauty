import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SoinCatalogue } from "@/lib/types";
import Editeur from "./editeur";

export const metadata = { title: "Catalogue — Chic Africa Beauty Online" };

export default async function PageCatalogue() {
  const profil = await requireProfil();
  const supabase = await createClient();

  const { data: soins, error } = await supabase
    .from("soins_catalogue")
    .select("*")
    .order("actif", { ascending: false })
    .order("ordre")
    .returns<SoinCatalogue[]>();

  if (error) throw new Error(`Lecture du catalogue impossible : ${error.message}`);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-2">
        <h1 className="text-3xl font-semibold text-brand-800">Catalogue des soins</h1>
        <p className="mt-1 text-brand-400">
          Cette liste alimente la saisie des séances et les statistiques.
        </p>
      </header>

      <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
        {profil.role === "gerante"
          ? "Un soin retiré n'est jamais supprimé : il disparaît de la saisie mais reste lisible dans les séances passées."
          : "Seule la gérante peut modifier le catalogue."}
      </p>

      <Editeur soins={soins} modifiable={profil.role === "gerante"} />
    </div>
  );
}
