import Link from "next/link";
import { adressePublique } from "@/lib/adresse";
import { requireProfil } from "@/lib/auth";
import { lireJournee, type ATraiter, type Nouveaute } from "@/lib/journee";
import { BoutonLienReservation, FriseJournee } from "./journee";

export const metadata = { title: "Accueil — Chic Africa Beauty Online" };

const TON_A_TRAITER: Record<ATraiter["ton"], string> = {
  info: "bg-[#e8eefc] text-[#2c4a8a]",
  alerte: "bg-[#fde8e2] text-[#a33a1f]",
  acompte: "bg-[#fff1e5] text-[#9a4b12]",
  neutre: "bg-brand-100 text-brand-700",
};

const TON_NOUVEAUTE: Record<Nouveaute["ton"], string> = {
  reservation: "bg-brand-500",
  acompte: "bg-[#2f7d4f]",
  annulation: "bg-red-600",
};

/**
 * Accueil « Ma journée » : ce que la gérante a à faire aujourd'hui, et non
 * seulement des compteurs. Les rendez-vous du jour avec leurs actions, ce qui
 * demande attention, et ce qui est arrivé en ligne depuis hier.
 */
export default async function PageAccueil() {
  const profil = await requireProfil();
  const [j, site] = await Promise.all([lireJournee(), adressePublique()]);
  const date = new Date(`${j.aujourdhui}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const chiffres = [
    {
      titre: "Rendez-vous aujourd'hui",
      valeur: String(j.chiffres.rdvDuJour),
      detail: `${j.chiffres.honores} honoré${j.chiffres.honores > 1 ? "s" : ""} · ${j.chiffres.aVenir} à venir`,
      href: `/rendez-vous?jour=${j.aujourdhui}`,
    },
    { titre: "Séances saisies", valeur: String(j.chiffres.seancesDuJour), detail: "aujourd'hui", href: "/seances" },
    {
      titre: "Acomptes du jour",
      valeur: `${j.chiffres.acomptesDuJour.toLocaleString("fr-FR")} F`,
      detail: `${j.chiffres.acomptesPayes} payé${j.chiffres.acomptesPayes > 1 ? "s" : ""} en ligne`,
      href: `/rendez-vous?jour=${j.aujourdhui}`,
    },
    { titre: "Cette semaine", valeur: String(j.chiffres.semaine), detail: "rendez-vous prévus", href: "/rendez-vous?vue=avenir" },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-brand-500 first-letter:uppercase">{date}</p>
          <h1 className="mt-0.5 text-3xl font-semibold text-brand-800">Bonjour {profil.nom.split(" ")[0]}</h1>
        </div>
        <form action="/clientes" className="flex h-11 w-full items-center gap-2 rounded-xl border border-brand-200 bg-white px-3.5 sm:w-80">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-400" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            name="q"
            aria-label="Rechercher une cliente"
            placeholder="Rechercher une cliente, un numéro…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </form>
        <BoutonLienReservation url={`${site}/rdv`} />
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {chiffres.map((c) => (
          <Link
            key={c.titre}
            href={c.href}
            className="flex flex-col gap-0.5 rounded-2xl border border-brand-100 bg-white px-4 py-3.5 transition-shadow hover:shadow-md"
          >
            <span className="text-sm text-brand-400">{c.titre}</span>
            <span className="text-2xl font-bold text-brand-800">{c.valeur}</span>
            <span className="text-xs text-brand-500">{c.detail}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section aria-labelledby="t-journee" className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="t-journee" className="text-xl font-semibold text-brand-800">Rendez-vous du jour</h2>
            <span className="flex gap-2">
              <Link href="/fiche/nouvelle" className="flex h-9 items-center rounded-lg border border-brand-200 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
                + Nouvelle cliente
              </Link>
              <Link href="/seances/nouvelle" className="flex h-9 items-center rounded-lg border border-brand-200 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50">
                + Séance
              </Link>
            </span>
          </div>
          <FriseJournee rdvs={j.rdvs} />
        </section>

        <div className="flex flex-col gap-5">
          <section aria-labelledby="t-traiter" className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-5">
            <h2 id="t-traiter" className="mb-1 text-xl font-semibold text-brand-800">À traiter</h2>
            {j.aTraiter.length === 0 ? (
              <p className="text-brand-400">Rien en attente. Belle journée !</p>
            ) : (
              j.aTraiter.map((t) => (
                <div key={t.cle} className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5">
                  <span className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 text-[15px] font-bold ${TON_A_TRAITER[t.ton]}`}>
                    {t.nombre}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-brand-900">{t.titre}</span>
                    <span className="truncate text-xs text-brand-600">{t.detail}</span>
                  </span>
                  <Link href={t.href} className="shrink-0 text-sm font-bold text-brand-600 hover:underline">
                    {t.action}
                  </Link>
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="t-enligne" className="flex flex-col gap-1 rounded-2xl border border-brand-100 bg-white p-5">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h2 id="t-enligne" className="text-xl font-semibold text-brand-800">En ligne depuis hier</h2>
              {j.nouveautes.length > 0 && (
                <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-bold text-white">
                  {j.nouveautes.length} nouveau{j.nouveautes.length > 1 ? "x" : ""}
                </span>
              )}
            </div>
            {j.nouveautes.length === 0 ? (
              <p className="text-brand-400">Rien de nouveau en ligne.</p>
            ) : (
              <ul>
                {j.nouveautes.map((n) => (
                  <li key={n.cle} className="flex gap-2.5 border-b border-brand-50 py-2 last:border-b-0">
                    <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TON_NOUVEAUTE[n.ton]}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm">
                        <strong>{n.quoi}</strong> · {n.cliente}
                      </span>
                      <span className="truncate text-xs text-brand-600">{n.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-brand-400">{n.quand}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
