"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ProduitBoutique } from "@/lib/boutique";
import { passerCommande } from "../actions";
import { EnTete, PhotoProduit, Prix, prix, Quantite, titre } from "../elements";
import { usePanier } from "../panier-etat";

const COMMUNES = [
  "Cocody", "Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Koumassi",
  "Marcory", "Plateau", "Port-Bouët", "Songon", "Treichville", "Yopougon",
];

// Couleurs des marques, comme sur la page de l'acompte.
const MOYENS = [
  { valeur: "wave", libelle: "Wave", pastille: "bg-[#1DC8F1]" },
  { valeur: "orange", libelle: "Orange Money", pastille: "bg-[#FF7900]" },
  { valeur: "mtn", libelle: "MTN MoMo", pastille: "bg-[#FFCB05]" },
  { valeur: "moov", libelle: "Moov Money", pastille: "bg-[#0066B3]" },
  { valeur: "djamo", libelle: "Djamo", pastille: "bg-[#5B2BE0]" },
] as const;

/** Coordonnées gardées d'une commande à l'autre, sur ce téléphone seulement. */
const CLE_LIVRAISON = "cab-livraison";
type Livraison = { nom: string; telephone: string; commune: string; adresse: string };

const champ =
  "min-h-12 rounded-xl border border-brand-200 bg-white px-3.5 text-base text-brand-900 outline-none focus:border-brand-500";

function lireLivraison(): Livraison {
  const vide = { nom: "", telephone: "", commune: "Cocody", adresse: "" };
  try {
    return { ...vide, ...JSON.parse(localStorage.getItem(CLE_LIVRAISON) ?? "{}") };
  } catch {
    return vide;
  }
}

/** Le panier vit dans le navigateur : rien à montrer avant de l'avoir lu. */
export default function Commander({ produits }: { produits: ProduitBoutique[] }) {
  const { pret } = usePanier();
  if (!pret) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <EnTete retour="/boutique" libelle="Mon panier" />
      </main>
    );
  }
  return <Contenu produits={produits} />;
}

function Contenu({ produits }: { produits: ProduitBoutique[] }) {
  const { panier, fixer, vider } = usePanier();
  const [livraison, setLivraison] = useState<Livraison>(lireLivraison);
  const [note, setNote] = useState("");
  const [moyen, setMoyen] = useState<string>("wave");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  // Le stock a pu baisser depuis l'ajout : le panier se cale sur ce qui reste.
  const lignes = produits
    .filter((p) => (panier[p.id] ?? 0) > 0)
    .map((p) => ({ produit: p, quantite: Math.min(panier[p.id], p.disponible) }));
  const total = lignes.reduce((t, l) => t + l.produit.prix * l.quantite, 0);
  const nombre = lignes.reduce((t, l) => t + l.quantite, 0);
  const changer = (k: keyof Livraison) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setLivraison((v) => ({ ...v, [k]: e.target.value }));

  function payer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    demarrer(async () => {
      const r = await passerCommande({
        lignes: lignes.filter((l) => l.quantite > 0).map((l) => ({ produit: l.produit.id, quantite: l.quantite })),
        ...livraison,
        note,
        moyen,
      });
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      try {
        localStorage.setItem(CLE_LIVRAISON, JSON.stringify(livraison));
      } catch {
        // navigation privée
      }
      window.location.href = r.lien;
    });
  }

  if (lignes.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <EnTete retour="/boutique" libelle="Mon panier" />
        <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
          <h1 className={`${titre} text-[26px]`}>Votre panier est vide</h1>
          <p className="text-brand-700">Choisissez vos soins dans la boutique, ils s&apos;ajouteront ici.</p>
          <Link href="/boutique" className="flex min-h-[52px] items-center rounded-full bg-brand-600 px-8 font-extrabold text-white">
            Voir les produits
          </Link>
          {Object.keys(panier).length > 0 && (
            <button type="button" onClick={vider} className="text-sm font-bold text-brand-600 underline">
              Retirer les produits épuisés
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
      <EnTete retour="/boutique" libelle="Mon panier" />

      <section className="flex flex-col gap-2.5 p-4">
        {lignes.map(({ produit: p, quantite }) => (
          <article key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
            <PhotoProduit src={p.photos[0]} nom="" className="h-[72px] w-[72px] shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-sm font-bold">{p.nom}</span>
              <Prix p={p} className="text-sm font-extrabold" />
              {quantite < panier[p.id] && (
                <span className="text-xs font-bold text-red-800">
                  {quantite === 0 ? "Épuisé entre-temps" : `Plus que ${quantite} en stock`}
                </span>
              )}
            </div>
            <Quantite valeur={quantite} max={p.disponible} changer={(n) => fixer(p.id, n)} />
          </article>
        ))}
        <Link href="/boutique" className="flex min-h-11 items-center self-start text-sm font-bold text-brand-600">
          + Ajouter d&apos;autres produits
        </Link>
      </section>

      <form onSubmit={payer} className="flex flex-col gap-4 px-4">
        <h2 className={`${titre} mt-2 text-[22px]`}>Livraison</h2>
        <div className="flex items-start gap-3 rounded-2xl bg-brand-100 p-3.5 text-sm leading-relaxed text-brand-800">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600">
            <path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" />
          </svg>
          <span>
            Livraison à Abidjan par <strong>Yango</strong>. Le prix de la course dépend de votre adresse : il se règle{" "}
            <strong>au livreur, à la réception</strong>.
          </span>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-brand-800">
          Prénom et nom
          <input required autoComplete="name" value={livraison.nom} onChange={changer("nom")} className={champ} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold text-brand-800">
          Numéro WhatsApp
          <input required type="tel" inputMode="tel" autoComplete="tel" placeholder="07 00 00 00 00" value={livraison.telephone} onChange={changer("telephone")} className={champ} />
          <span className="text-xs font-semibold text-brand-700">Le livreur vous appelle sur ce numéro.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold text-brand-800">
          Commune
          <select value={livraison.commune} onChange={changer("commune")} className={champ}>
            {COMMUNES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold text-brand-800">
          Quartier et point de repère
          <textarea required rows={3} placeholder="Ex. : Angré 8e tranche, après la pharmacie, portail vert" value={livraison.adresse} onChange={changer("adresse")} className={`${champ} py-3`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold text-brand-800">
          Un mot pour nous (facultatif)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : livrer après 17h" className={champ} />
        </label>

        <fieldset className="mt-2 flex flex-col gap-2.5">
          <legend className={`${titre} mb-2.5 text-[22px]`}>Payer avec</legend>
          {MOYENS.map((m) => (
            <label
              key={m.valeur}
              className={`flex min-h-14 items-center gap-3 rounded-2xl border bg-white px-4 text-[15px] font-bold ${
                moyen === m.valeur ? "border-2 border-brand-600" : "border-brand-200"
              }`}
            >
              <input type="radio" name="moyen" value={m.valeur} checked={moyen === m.valeur} onChange={() => setMoyen(m.valeur)} className="h-5 w-5 accent-brand-600" />
              <span className={`h-8 w-8 rounded-lg ${m.pastille}`} aria-hidden="true" />
              {m.libelle}
            </label>
          ))}
        </fieldset>

        <section className="mt-2 flex flex-col gap-2.5 rounded-2xl bg-white p-4 text-[15px]">
          <div className="flex justify-between">
            <span>Produits ({nombre})</span>
            <span className="font-bold">{prix(total)}</span>
          </div>
          <div className="flex justify-between text-brand-700">
            <span>Livraison Yango</span>
            <span className="font-bold">au livreur</span>
          </div>
          <div className="h-px bg-brand-200" />
          <div className="flex justify-between text-[17px] font-extrabold text-brand-800">
            <span>À payer maintenant</span>
            <span>{prix(total)}</span>
          </div>
        </section>

        {erreur && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-[15px] text-red-800">
            {erreur}
          </p>
        )}

        <div className="flex flex-col gap-2.5 pt-2 pb-10">
          <button
            type="submit"
            disabled={enCours || total <= 0}
            className="min-h-[54px] rounded-full bg-brand-600 text-base font-extrabold text-white disabled:opacity-50"
          >
            {enCours ? "Ouverture du paiement…" : `Payer ${prix(total)}`}
          </button>
          <span className="text-center text-xs leading-relaxed text-brand-700">
            Vous êtes redirigée vers la page sécurisée de votre opérateur. Paiement traité par Jèko. Pas de paiement
            à la livraison.
          </span>
        </div>
      </form>
    </main>
  );
}
