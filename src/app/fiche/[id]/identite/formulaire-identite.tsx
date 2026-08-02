"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ, DateFr, Paragraphe, Texte } from "@/components/champs";
import { Logo } from "@/components/logo";
import {
  changerArchivage,
  modifierCliente,
  type IdentiteModifiable,
} from "../../actions";

export default function FormulaireIdentite({
  clienteId,
  initial,
  actif,
  nbSeances,
}: {
  clienteId: string;
  initial: IdentiteModifiable;
  actif: boolean;
  nbSeances: number;
}) {
  const router = useRouter();
  const [identite, setIdentite] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const maj = (cle: keyof IdentiteModifiable, v: string) =>
    setIdentite((p) => ({ ...p, [cle]: v }));

  const complet =
    identite.nom_complet.trim() !== "" && identite.telephone.trim() !== "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-6">
      <header className="mb-6 flex items-center gap-3">
        <Logo className="h-10 w-10" />
        <div>
          <h1 className="text-xl font-semibold text-brand-800">
            Informations de la cliente
          </h1>
          <p className="text-sm text-brand-400">{initial.nom_complet}</p>
        </div>
      </header>

      <div className="flex-1">
        <Champ label="Nom & Prénoms" requis>
          <Texte
            valeur={identite.nom_complet}
            onChange={(v) => maj("nom_complet", v)}
          />
        </Champ>
        <Champ label="Date de naissance">
          <DateFr
            valeur={identite.date_naissance}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(v) => maj("date_naissance", v)}
          />
        </Champ>
        <Champ label="Profession">
          <Texte valeur={identite.profession} onChange={(v) => maj("profession", v)} />
        </Champ>
        <Champ
          label="Téléphone"
          aide="Avec l'indicatif du pays. Il identifie la cliente, deux fiches ne peuvent pas partager le même."
          requis
        >
          <Texte
            valeur={identite.telephone}
            inputMode="tel"
            onChange={(v) => maj("telephone", v)}
          />
        </Champ>
        <Champ label="Email">
          <Texte
            type="email"
            inputMode="email"
            valeur={identite.email}
            onChange={(v) => maj("email", v)}
          />
        </Champ>
        <Champ
          label="Notes internes"
          aide="Visibles du personnel uniquement, jamais montrées à la cliente."
        >
          <Paragraphe valeur={identite.notes} onChange={(v) => maj("notes", v)} />
        </Champ>

        {erreur && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700">
            {erreur}
          </p>
        )}

        <div className="mt-10 rounded-2xl border border-brand-100 p-5">
          <p className="font-medium text-brand-800">
            {actif ? "Archiver cette cliente" : "Réactiver cette cliente"}
          </p>
          <p className="mt-1 mb-4 text-sm text-brand-400">
            {actif
              ? `Elle disparaît des listes et des sélecteurs, mais ses ${nbSeances} séance${nbSeances > 1 ? "s" : ""} et son historique restent consultables. Réversible à tout moment.`
              : "Elle réapparaîtra dans les listes et pourra de nouveau recevoir des séances."}
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const r = await changerArchivage(clienteId, !actif);
                if (!r.ok) return setErreur(r.erreur);
                router.push(`/clientes/${clienteId}`);
              })
            }
            className="h-11 rounded-lg border border-brand-200 px-5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {actif ? "Archiver" : "Réactiver"}
          </button>
        </div>
      </div>

      <div className="sticky bottom-0 mt-8 flex gap-3 border-t border-brand-100 bg-creme py-4">
        <button
          type="button"
          onClick={() => router.push(`/clientes/${clienteId}`)}
          className="h-touch flex-1 rounded-xl border border-brand-200 bg-white font-medium text-brand-700 hover:bg-brand-50"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={!complet || enCours}
          onClick={() =>
            demarrer(async () => {
              const r = await modifierCliente(clienteId, identite);
              if (!r.ok) return setErreur(r.erreur);
              router.push(`/clientes/${clienteId}`);
            })
          }
          className="h-touch flex-[2] rounded-xl bg-brand-600 font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
