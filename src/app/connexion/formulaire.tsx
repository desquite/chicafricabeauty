"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { seConnecter, type EtatConnexion } from "./actions";

function BoutonValider() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-touch w-full rounded-xl bg-brand-600 text-base font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Connexion…" : "Se connecter"}
    </button>
  );
}

export default function FormulaireConnexion() {
  const [etat, action] = useActionState<EtatConnexion, FormData>(seConnecter, {});

  return (
    <form action={action} className="space-y-5">
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-brand-800"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-touch w-full rounded-xl border border-brand-200 bg-white px-4 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </div>

      <div>
        <label
          htmlFor="motDePasse"
          className="mb-2 block text-sm font-medium text-brand-800"
        >
          Mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="h-touch w-full rounded-xl border border-brand-200 bg-white px-4 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
      </div>

      {etat.erreur && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {etat.erreur}
        </p>
      )}

      <BoutonValider />
    </form>
  );
}
