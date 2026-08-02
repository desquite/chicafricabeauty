import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import FormulaireConnexion from "./formulaire";

export const metadata = { title: "Connexion — Chic Africa Beauty Online" };

export default async function PageConnexion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/accueil");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center text-center">
          <Logo className="h-16 w-16" />
          <h1 className="mt-5 text-3xl font-semibold text-brand-700">
            Chic Africa Beauty
          </h1>
          <p className="mt-1 text-sm tracking-[0.25em] text-or-600 uppercase">
            Online
          </p>
        </div>

        <div className="rounded-2xl border border-brand-100 bg-white p-8 shadow-sm">
          <FormulaireConnexion />
        </div>

        <p className="mt-6 text-center text-xs text-brand-400">
          Accès réservé au personnel de l&apos;institut
        </p>
      </div>
    </main>
  );
}
