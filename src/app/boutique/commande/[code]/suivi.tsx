"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Commande } from "@/lib/boutique";
import { prix, titre } from "../../elements";
import { usePanier } from "../../panier-etat";

const OPERATEURS: Record<string, string> = {
  wave: "Wave",
  orange: "Orange Money",
  mtn: "MTN MoMo",
  moov: "Moov Money",
  djamo: "Djamo",
};

function Etape({ n, fait, titre: t, texte }: { n: number; fait: boolean; titre: string; texte: string }) {
  return (
    <li className="flex gap-3">
      <span
        className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
          fait ? "bg-[#2f6b3a] text-white" : "bg-brand-100 text-brand-800"
        }`}
      >
        {n}
      </span>
      <span>
        <strong>{t}</strong> {texte}
      </span>
    </li>
  );
}

export default function Suivi({ commande: c }: { commande: Commande }) {
  const { vider } = usePanier();
  const router = useRouter();
  const payee = Boolean(c.payee_le) && c.statut !== "annulee";
  const attente = c.statut === "en_attente";

  // Payée : le panier a servi. En attente : on relit toutes les 4 secondes,
  // le temps que l'opérateur confirme.
  useEffect(() => {
    if (payee) vider();
    if (!attente) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payee, attente]);

  const prenom = c.nom.split(" ")[0];
  const etape = { payee: 1, expediee: 2, livree: 3 }[c.statut as "payee" | "expediee" | "livree"] ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-12 pb-10">
      {payee ? (
        <>
          <div className="flex h-[72px] w-[72px] items-center justify-center self-center rounded-full bg-[#e3f1e5]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2f6b3a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="flex flex-col gap-2 text-center">
            <h1 className={`${titre} text-[30px] leading-tight`}>
              {c.statut === "livree" ? `Merci ${prenom}, votre commande est livrée` : `Merci ${prenom}, votre commande est payée`}
            </h1>
            <p className="text-[15px] text-brand-700">
              Commande n° {c.numero} · {prix(c.montant)}
              {c.operateur && OPERATEURS[c.operateur] ? ` réglés avec ${OPERATEURS[c.operateur]}` : " réglés"}
            </p>
          </div>

          <section className="flex flex-col gap-4 rounded-2xl bg-white p-4">
            <h2 className="text-base font-extrabold text-brand-800">La suite</h2>
            <ol className="flex flex-col gap-3.5 text-sm leading-relaxed">
              <Etape n={1} fait={etape >= 1} titre="Commande reçue." texte="L'institut est prévenu." />
              <Etape n={2} fait={etape >= 2} titre="Préparation et envoi." texte="Nous emballons vos produits et commandons le Yango." />
              <Etape n={3} fait={etape >= 3} titre="Livraison." texte={`Le livreur vous appelle au ${c.telephone.replace(/(\d{2})(?=\d)/g, "$1 ")}. La course se règle à la réception.`} />
            </ol>
          </section>
        </>
      ) : attente ? (
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" aria-hidden="true" />
          <h1 className={`${titre} text-[26px]`}>Paiement en cours de confirmation</h1>
          <p className="text-[15px] text-brand-700">
            Validez le paiement de {prix(c.montant)} sur votre téléphone si ce n&apos;est pas déjà fait. Cette page se
            met à jour toute seule.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <h1 className={`${titre} text-[26px]`}>
            {c.statut === "annulee" && c.payee_le ? "Commande annulée" : "Le paiement n'a pas abouti"}
          </h1>
          <p className="text-[15px] text-brand-700">
            {c.statut === "annulee" && c.payee_le
              ? "Cette commande a été annulée par l'institut. Écrivez-nous sur WhatsApp pour toute question."
              : "Aucun montant n'a été prélevé pour cette commande. Votre panier est conservé : vous pouvez réessayer, avec le même moyen ou un autre."}
          </p>
          {!c.payee_le && (
            <Link href="/boutique/panier" className="mt-2 flex min-h-[52px] items-center rounded-full bg-brand-600 px-8 font-extrabold text-white">
              Revenir au panier
            </Link>
          )}
        </div>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm leading-relaxed">
        <h2 className="text-base font-extrabold text-brand-800">Récapitulatif</h2>
        {c.lignes_commande.map((l, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span>
              {l.quantite} × {l.nom}
            </span>
            <span className="shrink-0 font-bold">{prix(l.prix * l.quantite)}</span>
          </div>
        ))}
        <div className="h-px bg-brand-200" />
        <div className="flex justify-between font-extrabold text-brand-800">
          <span>Total</span>
          <span>{prix(c.montant)}</span>
        </div>
        <p className="text-brand-700">
          Livraison : {c.commune}, {c.adresse}
        </p>
      </section>

      <section className="flex flex-col gap-1.5 rounded-2xl bg-brand-100 p-4 text-sm leading-relaxed text-brand-800">
        <strong>Une question sur votre commande ?</strong>
        <span>Écrivez-nous sur WhatsApp en donnant le numéro {c.numero}.</span>
      </section>

      <Link href="/boutique" className="flex min-h-[52px] items-center justify-center rounded-full border border-brand-600 font-extrabold text-brand-600">
        Retour à la boutique
      </Link>
    </main>
  );
}
