import { seDeconnecter } from "@/app/connexion/actions";
import { Logo } from "@/components/logo";

export const metadata = { title: "Accès refusé — Chic Africa Beauty Online" };

export default function PageNonHabilite() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-14 w-14" />
        <h1 className="mt-6 text-2xl font-semibold text-brand-800">
          Compte non habilité
        </h1>
        <p className="mt-3 text-brand-700">
          Votre connexion a réussi, mais ce compte n&apos;est rattaché à aucun
          membre actif du personnel. Demandez à la gérante de créer votre profil.
        </p>
        <form action={seDeconnecter} className="mt-8">
          <button
            type="submit"
            className="h-touch w-full rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
