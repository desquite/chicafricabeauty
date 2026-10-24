"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import type { AFacturer } from "@/lib/caisse-lecture";
import { nouvelleVente, ouvrirFacture } from "./actions";

const jourCourt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const heure = (h: string | null) => (h ? `${Number(h.slice(0, 2))}h${h.slice(3, 5)}` : "");

/** Les rendez-vous honorés qui attendent leur facture. */
export function FileAFacturer({
  file,
  ouverte,
  clientes,
}: {
  file: AFacturer[];
  ouverte: string | null;
  clientes: { id: string; nom_complet: string }[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [attente, setAttente] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vente, setVente] = useState(false);
  const [clienteVente, setClienteVente] = useState("");
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const ouvrir = (cle: string, action: () => Promise<{ ok: boolean; id?: string; erreur?: string }>) => {
    setErreur(null);
    setAttente(cle);
    demarrer(async () => {
      const r = await action();
      if (r.ok && r.id) router.push(`/caisse?f=${r.id}`);
      else setErreur(r.erreur ?? "Ouverture impossible.");
      setAttente(null);
    });
  };

  return (
    <section aria-labelledby="t-file" className="flex flex-col gap-2.5 rounded-2xl border border-brand-100 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h1 id="t-file" className="text-2xl font-semibold text-brand-800">
          À facturer
        </h1>
        <span className="text-sm text-brand-500">{file.length}</span>
      </div>

      {file.length === 0 && <p className="text-sm text-brand-500">Rien à facturer pour le moment.</p>}

      <ul className="flex flex-col gap-2">
        {file.map((r) => {
          const actif = Boolean(ouverte && r.factureId === ouverte);
          return (
            <li key={r.rdvId}>
              <button
                type="button"
                disabled={enCours}
                onClick={() => ouvrir(r.rdvId, () => ouvrirFacture(r.rdvId))}
                className={`flex w-full flex-col gap-1 rounded-xl p-3 text-left ${
                  actif ? "bg-brand-100 ring-2 ring-brand-200" : "bg-brand-50 hover:bg-brand-100"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <strong className="text-brand-900">{r.cliente?.nom ?? "Cliente inconnue"}</strong>
                  <span className="flex items-center gap-1 text-xs text-brand-500">
                    {attente === r.rdvId && <Rouet className="h-3.5 w-3.5" />}
                    {r.date === aujourdhui ? heure(r.heure) : `${jourCourt(r.date)} ${heure(r.heure)}`}
                  </span>
                </span>
                {r.soin && <span className="text-sm text-brand-700">{r.soin}</span>}
                <span className="flex flex-wrap gap-1.5">
                  {r.acompte > 0 && (
                    <span className="rounded-full bg-[#e5f0e6] px-2 py-0.5 text-[11px] font-bold text-[#2f5d3a]">
                      acompte {r.acompte.toLocaleString("fr-FR")} F
                    </span>
                  )}
                  {r.factureId && (
                    <span className="rounded-full bg-[#fff1e5] px-2 py-0.5 text-[11px] font-bold text-[#9a4b12]">en cours</span>
                  )}
                  {!r.seanceSaisie && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-600">séance non saisie</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {vente ? (
        <div className="flex flex-col gap-2 rounded-xl border border-brand-200 p-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
            Vente de produits pour
            <select
              value={clienteVente}
              onChange={(e) => setClienteVente(e.target.value)}
              className="h-11 rounded-xl border border-brand-200 bg-white px-3 text-base"
            >
              <option value="">Client de passage</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom_complet}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setVente(false)} className="h-11 flex-1 rounded-xl border border-brand-200 text-sm font-semibold text-brand-700">
              Annuler
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => ouvrir("vente", () => nouvelleVente(clienteVente || null))}
              className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-bold text-white"
            >
              {attente === "vente" && <Rouet />}
              Commencer la vente
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setVente(true)}
          className="h-11 rounded-xl border border-dashed border-brand-300 text-sm font-semibold text-brand-600 hover:bg-brand-50"
        >
          + Vente de produits sans rendez-vous
        </button>
      )}

      {erreur && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {erreur}
        </p>
      )}
    </section>
  );
}
