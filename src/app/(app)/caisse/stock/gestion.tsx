"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import type { Produit } from "@/lib/caisse-lecture";
import { creerProduit, modifierProduit, mouvement, type Retour } from "./actions";

export type Mouvement = {
  id: string;
  quantite: number;
  type: "vente" | "reception" | "cabine" | "inventaire" | "annulation" | "boutique";
  note: string | null;
  created_at: string;
  produits: { nom: string } | null;
  factures: { numero_affiche: string | null } | null;
};

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const champ = "h-11 rounded-xl border border-brand-200 bg-white px-3 text-base";
const bouton =
  "flex h-11 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50";
const boutonPlein =
  "flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50";

const LIBELLE_MVT: Record<Mouvement["type"], string> = {
  vente: "Vendu",
  reception: "Réception",
  cabine: "Utilisé en cabine",
  inventaire: "Inventaire",
  annulation: "Annulé, remis en stock",
  boutique: "Vendu en ligne",
};

const etat = (p: Produit) =>
  p.stock <= 0
    ? ["Rupture", "bg-red-50 text-red-700"]
    : p.stock <= p.seuil
      ? ["Stock bas", "bg-[#fff1e5] text-[#9a4b12]"]
      : ["OK", "bg-[#e5f0e6] text-[#2f5d3a]"];

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Produits, alertes de stock, réceptions, inventaire et historique. */
export function GestionStock({ produits, mouvements }: { produits: Produit[]; mouvements: Mouvement[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [filtre, setFiltre] = useState<"tous" | "bas" | "archives">("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState<{ erreur?: string; info?: string } | null>(null);

  const agir = (action: () => Promise<Retour>, apres?: () => void) =>
    demarrer(async () => {
      setMessage(null);
      const r = await action();
      setMessage(r.ok ? { info: r.info } : { erreur: r.erreur });
      if (r.ok) {
        apres?.();
        router.refresh();
      }
    });

  const actifs = produits.filter((p) => p.actif);
  const liste =
    filtre === "bas" ? actifs.filter((p) => p.stock <= p.seuil) : filtre === "archives" ? produits.filter((p) => !p.actif) : actifs;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["tous", `Tous · ${actifs.length}`],
              ["bas", `Stock bas · ${actifs.filter((p) => p.stock <= p.seuil).length}`],
              ["archives", "Retirés de la vente"],
            ] as const
          ).map(([id, libelle]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filtre === id}
              onClick={() => setFiltre(id)}
              className={`h-9 rounded-full px-4 text-sm font-bold ${
                filtre === id ? "bg-brand-600 text-white" : "border border-brand-200 text-brand-700"
              }`}
            >
              {libelle}
            </button>
          ))}
          <button type="button" onClick={() => setOuvert(ouvert === "nouveau" ? null : "nouveau")} className={`${boutonPlein} ml-auto`}>
            + Nouveau produit
          </button>
        </div>

        {ouvert === "nouveau" && (
          <FicheProduit
            enCours={enCours}
            onAnnuler={() => setOuvert(null)}
            onValider={(s) => agir(() => creerProduit(s), () => setOuvert(null))}
          />
        )}

        {message?.erreur && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {message.erreur}
          </p>
        )}
        {message?.info && <p className="rounded-lg bg-[#eef5ef] px-3 py-2 text-sm font-semibold text-[#2f5d3a]">{message.info}</p>}

        {liste.length === 0 && <p className="text-sm text-brand-500">Aucun produit ici.</p>}
        <ul className="flex flex-col gap-2">
          {liste.map((p) => {
            const [libelleEtat, couleur] = etat(p);
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-xl bg-brand-50 p-3">
                <button type="button" onClick={() => setOuvert(ouvert === p.id ? null : p.id)} className="flex flex-wrap items-center gap-3 text-left">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-brand-900">{p.nom}</strong>
                    <span className="text-xs text-brand-500">
                      {p.categorie ?? "Sans catégorie"} · {p.prix_vente ? f(p.prix_vente) : "offert"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-bold text-brand-900">{p.stock}</span>
                    <span className="block text-xs text-brand-500">alerte à {p.seuil}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${couleur}`}>{libelleEtat}</span>
                </button>
                {ouvert === p.id && (
                  <div className="flex flex-col gap-3 border-t border-brand-100 pt-3">
                    <Mouvements
                      enCours={enCours}
                      onMouvement={(type, q, note) => agir(() => mouvement(p.id, type, q, note))}
                    />
                    <FicheProduit
                      produit={p}
                      enCours={enCours}
                      onAnnuler={() => setOuvert(null)}
                      onValider={(s) => agir(() => modifierProduit(p.id, { ...s, actif: s.actif ?? true }), () => setOuvert(null))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="t-mvt" className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-4">
        <h2 id="t-mvt" className="text-lg font-semibold text-brand-800">
          Mouvements récents
        </h2>
        {mouvements.length === 0 && <p className="text-sm text-brand-500">Aucun mouvement.</p>}
        <ul className="flex flex-col">
          {mouvements.map((m) => (
            <li key={m.id} className="flex gap-3 border-b border-brand-50 py-2 last:border-0">
              <span
                className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  m.quantite > 0 ? "bg-[#e5f0e6] text-[#2f5d3a]" : "bg-brand-100 text-brand-700"
                }`}
              >
                {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-brand-900">{m.produits?.nom ?? "Produit"}</span>
                <span className="text-xs text-brand-600">
                  {LIBELLE_MVT[m.type]}
                  {m.factures?.numero_affiche ? ` · reçu ${m.factures.numero_affiche}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </span>
              <span className="text-xs text-brand-500">{quand(m.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Mouvements({
  enCours,
  onMouvement,
}: {
  enCours: boolean;
  onMouvement: (type: "reception" | "cabine" | "inventaire", quantite: string, note: string) => void;
}) {
  const [type, setType] = useState<"reception" | "cabine" | "inventaire">("reception");
  const [quantite, setQuantite] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["reception", "Réception"],
            ["cabine", "Utilisé en cabine"],
            ["inventaire", "Inventaire"],
          ] as const
        ).map(([id, libelle]) => (
          <button
            key={id}
            type="button"
            aria-pressed={type === id}
            onClick={() => setType(id)}
            className={`h-9 rounded-lg px-3 text-sm font-semibold ${type === id ? "bg-brand-600 text-white" : "border border-brand-200 bg-white text-brand-700"}`}
          >
            {libelle}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          inputMode="numeric"
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          placeholder={type === "inventaire" ? "Nombre compté" : "Quantité"}
          aria-label="Quantité"
          className={`${champ} w-36`}
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (facultatif)" aria-label="Note" className={`${champ} min-w-0 flex-1`} />
        <button
          type="button"
          disabled={enCours || !quantite}
          onClick={() => {
            onMouvement(type, quantite, note);
            setQuantite("");
            setNote("");
          }}
          className={boutonPlein}
        >
          {enCours && <Rouet />}
          Valider
        </button>
      </div>
    </div>
  );
}

function FicheProduit({
  produit,
  enCours,
  onAnnuler,
  onValider,
}: {
  produit?: Produit;
  enCours: boolean;
  onAnnuler: () => void;
  onValider: (s: { nom: string; categorie: string; prix_vente: string; prix_achat: string; seuil: string; stock: string; actif?: boolean }) => void;
}) {
  const [s, setS] = useState({
    nom: produit?.nom ?? "",
    categorie: produit?.categorie ?? "",
    prix_vente: produit ? String(produit.prix_vente) : "",
    prix_achat: produit?.prix_achat != null ? String(produit.prix_achat) : "",
    seuil: produit ? String(produit.seuil) : "2",
    stock: "",
    actif: produit?.actif ?? true,
  });
  const maj = (cle: keyof typeof s, v: string | boolean) => setS((p) => ({ ...p, [cle]: v }));
  return (
    <form
      className="grid gap-2 rounded-xl border border-brand-200 bg-white p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onValider(s);
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800 sm:col-span-2">
        Nom du produit
        <input value={s.nom} onChange={(e) => maj("nom", e.target.value)} className={champ} required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
        Catégorie
        <input value={s.categorie} onChange={(e) => maj("categorie", e.target.value)} placeholder="Visage, Corps…" className={champ} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
        Prix de vente (F)
        <input inputMode="numeric" value={s.prix_vente} onChange={(e) => maj("prix_vente", e.target.value)} className={champ} required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
        Prix d&apos;achat (F) <span className="font-normal text-brand-500">facultatif</span>
        <input inputMode="numeric" value={s.prix_achat} onChange={(e) => maj("prix_achat", e.target.value)} className={champ} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
        Alerte quand il en reste
        <input inputMode="numeric" value={s.seuil} onChange={(e) => maj("seuil", e.target.value)} className={champ} />
      </label>
      {!produit && (
        <label className="flex flex-col gap-1 text-sm font-semibold text-brand-800">
          Stock de départ
          <input inputMode="numeric" value={s.stock} onChange={(e) => maj("stock", e.target.value)} placeholder="0" className={champ} />
        </label>
      )}
      {produit && (
        <label className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <input type="checkbox" checked={s.actif} onChange={(e) => maj("actif", e.target.checked)} className="h-5 w-5 accent-brand-600" />
          En vente
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="button" onClick={onAnnuler} className={`${bouton} flex-1`}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className={`${boutonPlein} flex-[2]`}>
          {enCours && <Rouet />}
          {produit ? "Enregistrer le produit" : "Ajouter le produit"}
        </button>
      </div>
    </form>
  );
}
