"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ConversationVue = {
  id: string;
  nom: string;
  connue: boolean;
  apercu: string;
  quand: string | null;
  nonLus: number;
  statut: "a_traiter" | "reglee";
};

/** Toutes les 15 secondes, la liste se relit : les nouveaux messages apparaissent seuls. */
const RAFRAICHISSEMENT_MS = 15_000;

const quandCourt = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const jour = d.toISOString().slice(0, 10);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return jour === aujourdhui
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
};

const initiales = (nom: string) =>
  nom.startsWith("+")
    ? "?"
    : nom
        .split(" ")
        .slice(0, 2)
        .map((m) => m[0])
        .join("")
        .toUpperCase();

export function ListeConversations({
  conversations,
  filtre,
  ouverte,
}: {
  conversations: ConversationVue[];
  filtre: string;
  ouverte: string | null;
}) {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  useEffect(() => {
    const t = setInterval(() => router.refresh(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(t);
  }, [router]);

  const q = recherche.trim().toLowerCase();
  const visibles = q ? conversations.filter((c) => c.nom.toLowerCase().includes(q) || c.apercu.toLowerCase().includes(q)) : conversations;
  const lien = (f: string, c?: string) => `/messages?filtre=${f}${c ? `&c=${c}` : ""}`;

  return (
    <section aria-labelledby="t-messages" className="flex min-h-0 flex-1 flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h1 id="t-messages" className="text-2xl font-semibold text-brand-800">
          Messages
        </h1>
        <span className="text-xs text-brand-500">WhatsApp de l&apos;institut</span>
      </div>
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Nom, numéro, mot…"
        aria-label="Rechercher une conversation"
        className="h-11 rounded-xl border border-brand-200 bg-brand-50 px-3 text-base"
      />
      <nav aria-label="Filtrer" className="flex gap-1.5">
        {(
          [
            ["traiter", "À traiter"],
            ["reglees", "Réglées"],
            ["toutes", "Toutes"],
          ] as const
        ).map(([id, libelle]) => (
          <Link
            key={id}
            href={lien(id)}
            aria-current={filtre === id ? "page" : undefined}
            className={`flex h-9 items-center rounded-full px-3.5 text-sm font-bold ${
              filtre === id ? "bg-brand-600 text-white" : "border border-brand-200 text-brand-700"
            }`}
          >
            {libelle}
          </Link>
        ))}
      </nav>

      {visibles.length === 0 && (
        <p className="text-sm text-brand-500">{filtre === "traiter" ? "Aucun message à traiter. 🌸" : "Aucune conversation."}</p>
      )}
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
        {visibles.map((c) => (
          <li key={c.id}>
            <Link
              href={lien(filtre, c.id)}
              className={`flex gap-3 rounded-xl p-2.5 ${c.id === ouverte ? "bg-brand-100" : "hover:bg-brand-50"}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                  c.connue ? "bg-brand-500" : "bg-brand-300"
                }`}
              >
                {initiales(c.nom)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <strong className="min-w-0 flex-1 truncate text-brand-900">{c.nom}</strong>
                  <span className="shrink-0 text-[11px] text-brand-500">{quandCourt(c.quand)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-brand-600">{c.apercu}</span>
                  {c.nonLus > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#2f7d4f] px-1.5 text-[11px] font-bold text-white">
                      {c.nonLus}
                    </span>
                  )}
                </span>
                {!c.connue && <span className="text-[11px] font-bold text-[#2c4a8a]">pas de fiche</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
