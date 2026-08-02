"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { enregistrerNouvelleAnamnese, type Sante } from "../../actions";
import { EtapeBilanSante, EtapeHabitudes, santeComplete } from "../../etapes-sante";

/**
 * Mise a jour du bilan sante d'une cliente existante.
 * Les valeurs precedentes sont pre-remplies mais l'enregistrement cree une
 * nouvelle ligne : l'anamnese est un historique, pas une fiche editable.
 */
export default function ParcoursSante({
  clienteId,
  nomComplet,
  initial,
}: {
  clienteId: string;
  nomComplet: string;
  initial: Sante;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState(0);
  const [sante, setSante] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const maj = <K extends keyof Sante>(cle: K, v: Sante[K]) =>
    setSante((p) => ({ ...p, [cle]: v }));

  const peutAvancer = santeComplete(sante, etape === 0 ? "bilan" : "habitudes");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-6">
      <header className="mb-6 flex items-center gap-3">
        <Logo className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-semibold text-brand-800">
            Mise à jour du bilan santé
          </h1>
          <p className="text-sm text-brand-400">{nomComplet}</p>
        </div>
      </header>

      <p className="mb-6 rounded-xl bg-or-400/10 px-4 py-3 text-sm text-brand-700">
        Le bilan précédent est conservé. Cette saisie crée une nouvelle version
        datée, qui deviendra celle de référence.
      </p>

      <div className="flex-1">
        {etape === 0 ? (
          <EtapeBilanSante sante={sante} maj={maj} />
        ) : (
          <EtapeHabitudes sante={sante} maj={maj} />
        )}
        {erreur && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
            {erreur}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 mt-8 flex gap-3 border-t border-brand-100 bg-creme py-4">
        <button
          type="button"
          onClick={() =>
            etape === 0 ? router.push(`/clientes/${clienteId}`) : setEtape(0)
          }
          className="h-touch flex-1 rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
        >
          {etape === 0 ? "Annuler" : "Retour"}
        </button>
        <button
          type="button"
          disabled={!peutAvancer || enCours}
          onClick={() => {
            if (etape === 0) return setEtape(1);
            demarrer(async () => {
              const r = await enregistrerNouvelleAnamnese(clienteId, sante);
              if (!r.ok) return setErreur(r.erreur);
              router.push(`/clientes/${clienteId}`);
            });
          }}
          className="h-touch flex-[2] rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {enCours ? "Enregistrement…" : etape === 0 ? "Suivant" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
