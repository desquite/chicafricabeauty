"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import { calculerFacture, MODES_PAIEMENT } from "@/lib/caisse";
import { REMISE_POURCENT } from "@/lib/fidelite";
import { encaisser, garderBrouillon, supprimerBrouillon, type SaisieFacture } from "./actions";

export type FactureEdition = {
  id: string;
  cliente: string | null;
  /** La cliente a un numéro : le reçu peut partir par WhatsApp. */
  aTelephone: boolean;
  quand: string;
  remiseSur: "soin" | "produit" | null;
  acompte: number;
  montantSoins: number | null;
  notes: string;
  soins: { soin_id: string; libelle: string; prix: number }[];
  produits: { produit_id: string; quantite: number }[];
  catalogueSoins: { id: string; libelle: string; prix: number }[];
  catalogueProduits: { id: string; nom: string; prix: number; stock: number }[];
};

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const carte = "flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4";
const bouton =
  "flex h-11 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50";
const CLE_FORMAT = "cab_format_recu";

/** Facture en préparation : montant final des soins, produits, encaissement. */
export function EditeurFacture({ facture }: { facture: FactureEdition }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [soins, setSoins] = useState(facture.soins);
  const [produits, setProduits] = useState(facture.produits);
  const [montant, setMontant] = useState(facture.montantSoins === null ? "" : String(facture.montantSoins));
  const [notes, setNotes] = useState(facture.notes);
  const [mode, setMode] = useState("");
  const [format, setFormat] = useState<"ticket" | "a5">("ticket");
  const [envoyerRecu, setEnvoyerRecu] = useState(facture.aTelephone);
  const [ajoutSoin, setAjoutSoin] = useState("");
  const [ajoutProduit, setAjoutProduit] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Format du reçu retenu sur cet appareil : la tablette garde son imprimante.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLE_FORMAT);
      if (v === "a5" || v === "ticket") queueMicrotask(() => setFormat(v));
    } catch {
      // stockage indisponible : ticket par défaut
    }
  }, []);
  const choisirFormat = (v: "ticket" | "a5") => {
    setFormat(v);
    try {
      window.localStorage.setItem(CLE_FORMAT, v);
    } catch {
      // sans conséquence
    }
  };

  const prixProduit = (id: string) => facture.catalogueProduits.find((p) => p.id === id);
  const montantSaisi = montant.trim() === "" ? null : Number(montant.replace(/\D/g, "")) || 0;
  const calcul = useMemo(
    () =>
      calculerFacture({
        soins: soins.map((s) => ({ prix_unitaire: s.prix, quantite: 1 })),
        montantSoins: montantSaisi,
        produits: produits.map((p) => ({ prix_unitaire: prixProduit(p.produit_id)?.prix ?? 0, quantite: p.quantite })),
        remiseSur: facture.remiseSur,
        acompte: facture.acompte,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [soins, produits, montantSaisi, facture.remiseSur, facture.acompte],
  );

  const saisie = (): SaisieFacture => ({
    soins: soins.map((s) => ({ soin_id: s.soin_id })),
    produits,
    montantSoins: montantSaisi,
    notes,
  });

  const garder = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await garderBrouillon(facture.id, saisie());
      if (!r.ok) return setErreur(r.erreur ?? "Enregistrement impossible.");
      setInfo("Facture gardée : elle reste dans « À facturer ».");
      router.refresh();
    });

  const valider = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await encaisser(facture.id, saisie(), mode, envoyerRecu);
      if (!r.ok) return setErreur(r.erreur ?? "Encaissement impossible.");
      router.push(`/recu/${facture.id}?format=${format}&imprimer=1`);
    });

  const abandonner = () => {
    if (!window.confirm("Abandonner cette facture ? Le rendez-vous restera à facturer.")) return;
    demarrer(async () => {
      const r = await supprimerBrouillon(facture.id);
      if (!r.ok) return setErreur(r.erreur ?? "Suppression impossible.");
      router.push("/caisse");
    });
  };

  const remiseLibelle =
    facture.remiseSur === "soin"
      ? `Remise fidélité ${REMISE_POURCENT} % (soins)`
      : facture.remiseSur === "produit"
        ? `Remise fidélité ${REMISE_POURCENT} % (produits)`
        : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-brand-500">Facture en préparation · {facture.quand}</p>
          <h2 className="text-2xl font-semibold text-brand-800">{facture.cliente ?? "Client de passage"}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {facture.acompte > 0 && (
            <span className="rounded-full bg-[#e5f0e6] px-2.5 py-1 text-xs font-bold text-[#2f5d3a]">acompte payé {f(facture.acompte)}</span>
          )}
          {remiseLibelle && (
            <span className="rounded-full bg-[#f6ecd2] px-2.5 py-1 text-xs font-bold text-[#6e5114]">remise fidélité {REMISE_POURCENT} %</span>
          )}
        </div>
      </header>

      <section className={carte} aria-labelledby="t-soins">
        <h3 id="t-soins" className="font-semibold text-brand-900">
          Soins réalisés
        </h3>
        {soins.length === 0 && <p className="text-sm text-brand-500">Aucun soin.</p>}
        <ul className="flex flex-col gap-1.5">
          {soins.map((s, i) => (
            <li key={`${s.soin_id}-${i}`} className="flex items-center gap-3 text-sm">
              <span className="flex-1 text-brand-900">{s.libelle}</span>
              <span className="w-24 text-right font-semibold">{s.prix ? f(s.prix) : "inclus"}</span>
              <button
                type="button"
                aria-label={`Retirer ${s.libelle}`}
                onClick={() => setSoins(soins.filter((_, j) => j !== i))}
                className="h-8 w-8 rounded-lg text-brand-400 hover:bg-brand-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <select
            value={ajoutSoin}
            onChange={(e) => setAjoutSoin(e.target.value)}
            aria-label="Soin à ajouter"
            className="h-11 min-w-0 flex-1 rounded-xl border border-brand-200 bg-white px-3 text-base"
          >
            <option value="">Ajouter un soin fait pendant la séance…</option>
            {facture.catalogueSoins.map((s) => (
              <option key={s.id} value={s.id}>
                {s.libelle} · {s.prix ? f(s.prix) : "inclus"}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!ajoutSoin}
            onClick={() => {
              const s = facture.catalogueSoins.find((x) => x.id === ajoutSoin);
              if (s) setSoins([...soins, { soin_id: s.id, libelle: s.libelle, prix: s.prix }]);
              setAjoutSoin("");
            }}
            className={bouton}
          >
            Ajouter
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-100 pt-3">
          <span className="text-sm text-brand-600">
            Prix normal : <strong>{f(calcul.soinsNormal)}</strong>
          </span>
          <label className="flex items-center gap-2 text-sm font-bold text-brand-900">
            Montant final des soins
            <input
              inputMode="numeric"
              value={montant}
              placeholder={calcul.soinsNormal.toLocaleString("fr-FR")}
              onChange={(e) => setMontant(e.target.value)}
              className="h-12 w-32 rounded-xl border-2 border-brand-600 bg-brand-50 px-3 text-right text-lg font-bold"
            />
            F
          </label>
        </div>
        {calcul.soins < calcul.soinsNormal && (
          <p className="text-right text-xs font-bold text-[#2f5d3a]">Geste commercial : −{f(calcul.soinsNormal - calcul.soins)}</p>
        )}
      </section>

      <section className={carte} aria-labelledby="t-produits">
        <h3 id="t-produits" className="font-semibold text-brand-900">
          Produits vendus
        </h3>
        {produits.length === 0 && <p className="text-sm text-brand-500">Aucun produit.</p>}
        <ul className="flex flex-col gap-1.5">
          {produits.map((l, i) => {
            const p = prixProduit(l.produit_id);
            const reste = (p?.stock ?? 0) - l.quantite;
            return (
              <li key={l.produit_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-brand-900">{p?.nom ?? "Produit"}</span>
                  <span className={`text-xs ${reste < 0 ? "font-bold text-red-700" : "text-brand-500"}`}>
                    {f(p?.prix ?? 0)} l&apos;unité · {reste < 0 ? "stock insuffisant" : `reste ${reste} en stock`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Un de moins"
                  onClick={() =>
                    setProduits(
                      l.quantite <= 1
                        ? produits.filter((_, j) => j !== i)
                        : produits.map((x, j) => (j === i ? { ...x, quantite: x.quantite - 1 } : x)),
                    )
                  }
                  className={`${bouton} h-9 w-9 px-0`}
                >
                  −
                </button>
                <span className="w-6 text-center font-bold">{l.quantite}</span>
                <button
                  type="button"
                  aria-label="Un de plus"
                  onClick={() => setProduits(produits.map((x, j) => (j === i ? { ...x, quantite: Math.min(99, x.quantite + 1) } : x)))}
                  className={`${bouton} h-9 w-9 px-0`}
                >
                  +
                </button>
                <span className="w-24 text-right font-semibold">{f((p?.prix ?? 0) * l.quantite)}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <select
            value={ajoutProduit}
            onChange={(e) => setAjoutProduit(e.target.value)}
            aria-label="Produit à ajouter"
            className="h-11 min-w-0 flex-1 rounded-xl border border-brand-200 bg-white px-3 text-base"
          >
            <option value="">{facture.catalogueProduits.length ? "Ajouter un produit…" : "Aucun produit : créez-les dans Stock"}</option>
            {facture.catalogueProduits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} · {f(p.prix)} · stock {p.stock}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!ajoutProduit}
            onClick={() => {
              const deja = produits.find((p) => p.produit_id === ajoutProduit);
              setProduits(
                deja
                  ? produits.map((p) => (p.produit_id === ajoutProduit ? { ...p, quantite: p.quantite + 1 } : p))
                  : [...produits, { produit_id: ajoutProduit, quantite: 1 }],
              );
              setAjoutProduit("");
            }}
            className={bouton}
          >
            Ajouter
          </button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={carte} aria-labelledby="t-total">
          <h3 id="t-total" className="font-semibold text-brand-900">
            Total
          </h3>
          <dl className="flex flex-col gap-1.5 text-sm text-brand-900">
            <div className="flex justify-between">
              <dt>Soins</dt>
              <dd>{f(calcul.soins)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Produits</dt>
              <dd>{f(calcul.produits)}</dd>
            </div>
            {remiseLibelle && calcul.remise > 0 && (
              <div className="flex justify-between">
                <dt>{remiseLibelle}</dt>
                <dd>−{f(calcul.remise)}</dd>
              </div>
            )}
            {calcul.acompte > 0 && (
              <div className="flex justify-between">
                <dt>Acompte déjà payé en ligne</dt>
                <dd>−{f(calcul.acompte)}</dd>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-brand-100 pt-2 text-xl font-bold text-brand-800">
              <dt>Reste à payer</dt>
              <dd>{f(calcul.total)}</dd>
            </div>
          </dl>
          <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
            Note sur la facture <span className="font-normal text-brand-500">(facultatif)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl border border-brand-200 px-3 text-base" />
          </label>
        </section>

        <section className={carte} aria-labelledby="t-paiement">
          <h3 id="t-paiement" className="font-semibold text-brand-900">
            Payé par
          </h3>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Mode de paiement">
            {MODES_PAIEMENT.map((m) => (
              <button
                key={m.valeur}
                type="button"
                role="radio"
                aria-checked={mode === m.valeur}
                onClick={() => setMode(m.valeur)}
                className={`h-11 rounded-xl text-sm font-bold ${
                  mode === m.valeur ? "bg-brand-600 text-white" : "border border-brand-200 bg-white text-brand-700"
                }`}
              >
                {m.libelle}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-brand-600">Reçu :</span>
            {(
              [
                ["ticket", "Ticket 80 mm"],
                ["a5", "A5"],
              ] as const
            ).map(([v, libelle]) => (
              <button
                key={v}
                type="button"
                aria-pressed={format === v}
                onClick={() => choisirFormat(v)}
                className={`h-9 rounded-lg px-3 font-semibold ${format === v ? "bg-brand-100 text-brand-800" : "text-brand-500"}`}
              >
                {libelle}
              </button>
            ))}
          </div>
          {facture.aTelephone && (
            <label className="flex items-center gap-2 text-sm font-semibold text-brand-800">
              <input
                type="checkbox"
                checked={envoyerRecu}
                onChange={(e) => setEnvoyerRecu(e.target.checked)}
                className="h-5 w-5 accent-brand-600"
              />
              Envoyer le reçu par WhatsApp à la cliente
            </label>
          )}
          <button
            type="button"
            disabled={enCours || !mode}
            onClick={valider}
            className="flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {enCours && <Rouet />}
            {mode ? `Encaisser ${f(calcul.total)} et imprimer` : "Choisissez le mode de paiement"}
          </button>
          <div className="flex gap-2">
            <button type="button" disabled={enCours} onClick={garder} className={`${bouton} flex-1`}>
              Garder pour plus tard
            </button>
            <button type="button" disabled={enCours} onClick={abandonner} className={`${bouton} text-red-700`}>
              Abandonner
            </button>
          </div>
          {erreur && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {erreur}
            </p>
          )}
          {info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{info}</p>}
        </section>
      </div>
    </div>
  );
}
