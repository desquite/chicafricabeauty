"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import { changerStatut, marquerLu, repondre } from "./actions";

export type MessageVue = {
  id: string;
  sens: "entrant" | "sortant" | "auto";
  type: string;
  texte: string | null;
  media: boolean;
  echec: string | null;
  quand: string;
  auteur: string | null;
};

export type Raccourci = { libelle: string; texte: string };

const heure = (iso: string) => {
  const d = new Date(iso);
  const jour = d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  return d.toLocaleString("fr-FR", {
    ...(jour ? {} : { day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
};

function Media({ m }: { m: MessageVue }) {
  const src = `/api/messages/media/${m.id}`;
  if (m.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Photo envoyée par la cliente" className="mb-1 max-h-72 rounded-xl object-contain" loading="lazy" />;
  }
  if (m.type === "audio") return <audio controls src={src} className="mb-1 w-64 max-w-full" preload="none" />;
  if (m.type === "video") return <video controls src={src} className="mb-1 max-h-72 rounded-xl" preload="none" />;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="mb-1 block font-semibold underline">
      Ouvrir le document
    </a>
  );
}

/** Le fil d'une conversation, la réponse et les réponses rapides. */
export function Discussion({
  id,
  nom,
  telephone,
  statut,
  nonLus,
  messages,
  fenetreOuverte,
  raccourcis,
  filtre,
}: {
  id: string;
  nom: string;
  telephone: string;
  statut: "a_traiter" | "reglee";
  nonLus: number;
  messages: MessageVue[];
  fenetreOuverte: boolean;
  raccourcis: Raccourci[];
  filtre: string;
}) {
  const router = useRouter();
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const fin = useRef<HTMLDivElement>(null);

  // Ouvrir la conversation, c'est la lire.
  useEffect(() => {
    if (nonLus > 0) void marquerLu(id);
  }, [id, nonLus]);
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const envoyer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await repondre(id, texte);
      if (!r.ok) return setErreur(r.erreur ?? "Envoi impossible.");
      setTexte("");
      router.refresh();
    });

  return (
    <section aria-label={`Conversation avec ${nom}`} className="flex min-h-[70dvh] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white lg:min-h-0">
      <header className="flex flex-wrap items-center gap-3 border-b border-brand-100 px-4 py-3">
        <Link href={`/messages?filtre=${filtre}`} className="text-sm font-semibold text-brand-600 lg:hidden">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-brand-900">{nom}</p>
          <p className="text-xs text-brand-500">+{telephone}</p>
        </div>
        <a href={`tel:+${telephone}`} className="flex h-10 items-center rounded-xl border border-brand-200 px-3 text-sm font-semibold text-brand-700">
          Appeler
        </a>
        <button
          type="button"
          disabled={enCours}
          onClick={() =>
            demarrer(async () => {
              await changerStatut(id, statut === "reglee" ? "a_traiter" : "reglee");
              router.refresh();
            })
          }
          className={`flex h-10 items-center rounded-xl px-3 text-sm font-bold ${
            statut === "reglee" ? "border border-brand-200 text-brand-700" : "bg-[#e5f0e6] text-[#2f5d3a]"
          }`}
        >
          {statut === "reglee" ? "Remettre à traiter" : "✓ Marquer réglée"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#f6efe9] px-4 py-4">
        {messages.length === 0 && <p className="text-center text-sm text-brand-500">Aucun message.</p>}
        {messages.map((m) =>
          m.sens === "auto" ? (
            <p key={m.id} className="self-center rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-600">
              {m.texte} · {heure(m.quand)}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.sens === "sortant" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 pt-2 pb-1.5 text-[15px] leading-snug ${
                  m.sens === "sortant"
                    ? `rounded-br-md text-white ${m.echec ? "bg-red-700" : "bg-brand-600"}`
                    : "rounded-bl-md bg-white text-brand-900 shadow-sm"
                }`}
              >
                {m.media && <Media m={m} />}
                {m.texte && <p className="whitespace-pre-line break-words">{m.texte}</p>}
                {!m.media && !m.texte && <p className="italic opacity-70">Message non pris en charge</p>}
                <p className={`mt-1 text-right text-[11px] ${m.sens === "sortant" ? "text-white/75" : "text-brand-500"}`}>
                  {m.sens === "sortant" && m.auteur ? `${m.auteur} · ` : ""}
                  {heure(m.quand)}
                  {m.echec ? " · non parti" : m.sens === "sortant" ? " ✓" : ""}
                </p>
              </div>
            </div>
          ),
        )}
        <div ref={fin} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-brand-100 px-4 py-3">
        {fenetreOuverte ? (
          <>
            {raccourcis.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {raccourcis.map((r) => (
                  <button
                    key={r.libelle}
                    type="button"
                    onClick={() => setTexte((t) => (t ? `${t}\n${r.texte}` : r.texte))}
                    className="h-8 rounded-full border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-700"
                  >
                    {r.libelle}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
                rows={2}
                placeholder="Écrire une réponse…"
                aria-label="Votre réponse"
                className="min-h-12 flex-1 resize-none rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-base"
              />
              <button
                type="button"
                disabled={enCours || !texte.trim()}
                onClick={envoyer}
                aria-label="Envoyer"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"
              >
                {enCours ? (
                  <Rouet />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M4 12l16-8-6 16-2.5-6.5z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-brand-500">Réponse libre possible : la cliente a écrit il y a moins de 24 h.</p>
          </>
        ) : (
          <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            Plus de 24 h depuis le dernier message de la cliente : WhatsApp n&apos;autorise plus de réponse libre. Appelez-la, ou
            attendez qu&apos;elle écrive à nouveau.
          </p>
        )}
        {erreur && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {erreur}
          </p>
        )}
      </footer>
    </section>
  );
}
