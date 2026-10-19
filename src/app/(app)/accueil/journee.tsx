"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rouet } from "@/components/attente";
import type { RdvJournee } from "@/lib/journee";
import { changerStatut } from "../rendez-vous/actions";

const heure = (h: string | null) => (h ? `${Number(h.slice(0, 2))}h${h.slice(3, 5)}` : "—");
const duree = (m: number | null) =>
  !m ? "" : m < 60 ? `${m}min` : m % 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m / 60}h`;
const international = (tel: string) => {
  const c = tel.replace(/\D/g, "");
  return c.length === 10 ? `225${c}` : c;
};

function Pastille({ children, ton }: { children: React.ReactNode; ton: string }) {
  const tons: Record<string, string> = {
    enligne: "bg-brand-100 text-brand-700",
    paye: "bg-[#e5f0e6] text-[#2f5d3a]",
    du: "bg-[#fff1e5] text-[#9a4b12]",
    nouvelle: "bg-[#e8eefc] text-[#2c4a8a]",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tons[ton]}`}>{children}</span>
  );
}

/**
 * Frise des rendez-vous du jour. « Arrivée » ouvre la séance pré-remplie
 * depuis le rendez-vous ; « Absente » le marque sur place, l'écran suit
 * aussitôt et se corrige si le serveur refuse.
 */
export function FriseJournee({ rdvs }: { rdvs: RdvJournee[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [statuts, setStatuts] = useState<Record<string, RdvJournee["statut"]>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  const prochain = rdvs.find((r) => (statuts[r.id] ?? r.statut) === "prevu")?.id;

  const absente = (id: string) => {
    setErreur(null);
    setStatuts((s) => ({ ...s, [id]: "absent" }));
    demarrer(async () => {
      const r = await changerStatut(id, "absent");
      if (!r.ok) {
        setStatuts((s) => {
          const t = { ...s };
          delete t[id];
          return t;
        });
        setErreur(r.erreur ?? "Le statut n'a pas pu être enregistré.");
        return;
      }
      router.refresh();
    });
  };

  if (rdvs.length === 0) {
    return <p className="py-6 text-brand-400">Aucun rendez-vous aujourd&apos;hui.</p>;
  }

  return (
    <>
      {erreur && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rdvs.map((r) => {
          const statut = statuts[r.id] ?? r.statut;
          const fait = statut !== "prevu";
          const suivant = r.id === prochain;
          return (
            <li
              key={r.id}
              className={`flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5 sm:flex-nowrap ${
                fait
                  ? "bg-[#f6faf6] opacity-80"
                  : suivant
                    ? "bg-brand-50 ring-2 ring-brand-200"
                    : "bg-white ring-1 ring-brand-100"
              }`}
            >
              <span className="flex w-14 shrink-0 flex-col">
                <span className="text-base font-bold text-brand-800">{heure(r.heure)}</span>
                <span className="text-xs text-brand-400">{duree(r.duree)}</span>
              </span>
              <span
                aria-hidden="true"
                className={`w-1 self-stretch rounded-full ${
                  statut === "honore" ? "bg-[#2f7d4f]" : statut === "absent" ? "bg-red-300" : suivant ? "bg-brand-600" : "bg-brand-300"
                }`}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  {r.cliente ? (
                    <Link href={`/clientes/${r.cliente.id}`} className="font-bold text-brand-900 hover:underline">
                      {r.cliente.nom}
                    </Link>
                  ) : (
                    <span className="font-bold">Cliente inconnue</span>
                  )}
                  {r.enLigne && <Pastille ton="enligne">en ligne</Pastille>}
                  {r.acomptePaye && <Pastille ton="paye">acompte payé</Pastille>}
                  {r.acompteDu && <Pastille ton="du">acompte à régler</Pastille>}
                  {r.nouvelle && <Pastille ton="nouvelle">nouvelle cliente</Pastille>}
                </span>
                {r.soin && <span className="text-sm text-brand-600">{r.soin}</span>}
                {statut === "prevu" && r.alertes.length > 0 && (
                  <span className="text-xs font-semibold text-red-700">À vérifier : {r.alertes.join(", ")}</span>
                )}
                {statut === "prevu" && r.ficheSanteManquante && (
                  <span className="text-xs font-semibold text-[#2c4a8a]">Fiche santé pas encore remplie</span>
                )}
              </span>

              {statut === "prevu" ? (
                <span className="flex shrink-0 gap-1.5">
                  <Link
                    href={`/seances/nouvelle?rdv=${r.id}`}
                    className="flex h-10 items-center rounded-lg bg-[#2f7d4f] px-3.5 text-sm font-bold text-white hover:bg-[#276942]"
                  >
                    Arrivée
                  </Link>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => absente(r.id)}
                    className="flex h-10 items-center gap-1 rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                  >
                    Absente
                  </button>
                  {r.cliente && (
                    <a
                      href={`tel:+${international(r.cliente.telephone)}`}
                      aria-label={`Appeler ${r.cliente.prenom}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-white text-brand-700 hover:bg-brand-50"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
                      </svg>
                    </a>
                  )}
                </span>
              ) : (
                <span
                  className={`shrink-0 text-sm font-bold ${statut === "honore" ? "text-[#2f7d4f]" : "text-red-700"}`}
                >
                  {statut === "honore"
                    ? r.seanceSaisie
                      ? "Honoré · séance saisie"
                      : "Honoré"
                    : "Absente"}
                  {enCours && statuts[r.id] && <Rouet className="ml-1 inline h-3.5 w-3.5" />}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Copie ou partage du lien /rdv, pour la bio Instagram ou un statut. */
export function BoutonLienReservation({ url }: { url: string }) {
  const [copie, setCopie] = useState(false);
  const partager = async () => {
    const texte = "Réserve ton soin chez Chic Africa Beauty :";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Chic Africa Beauty", text: texte, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      // Partage annulé par l'utilisatrice : rien à signaler.
    }
  };
  return (
    <button
      type="button"
      onClick={() => void partager()}
      className="flex h-11 items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
      </svg>
      {copie ? "Lien copié" : "Lien de réservation"}
    </button>
  );
}
