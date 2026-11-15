import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { libelleRythme, seanceSuivante } from "@/lib/abonnements";
import { lireAbonnements, type AbonnementVue } from "@/lib/abonnements-lecture";

export const metadata = { title: "Abonnements — Chic Africa Beauty Online" };

const jourMois = (iso: string, annee = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(annee ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
const f = (n: number) => n.toLocaleString("fr-FR");

/** Toutes les abonnées d'un coup d'œil : séances faites, restantes, paiement. */
export default async function PageAbonnements({
  searchParams,
}: {
  searchParams: Promise<{ voir?: string }>;
}) {
  await requireProfil();
  const { voir } = await searchParams;
  const passes = voir === "termines";
  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const tous = await lireAbonnements(supabase, {});
  const enCours = tous.filter((a) => a.statut === "actif" || a.statut === "pause");
  const termines = tous.filter((a) => a.statut === "termine" || a.statut === "annule");
  const affiches = passes ? termines : enCours;

  const clienteIds = [...new Set(affiches.map((a) => a.cliente_id))];
  const [{ data: clientes }, { data: rdv }] = clienteIds.length
    ? await Promise.all([
        supabase
          .from("clientes")
          .select("id, nom_complet, telephone")
          .in("id", clienteIds)
          .returns<{ id: string; nom_complet: string; telephone: string | null }[]>(),
        // Prochain rendez-vous déjà pris pour le soin de l'abonnement.
        supabase
          .from("rendez_vous")
          .select("cliente_id, soin_id, date_rdv, heure_rdv")
          .in("cliente_id", clienteIds)
          .eq("statut", "prevu")
          .is("remplace_par", null)
          .is("masque_le", null)
          .gte("date_rdv", aujourdhui)
          .order("date_rdv")
          .order("heure_rdv")
          .returns<{ cliente_id: string; soin_id: string | null; date_rdv: string; heure_rdv: string | null }[]>(),
      ])
    : [{ data: [] }, { data: [] }];

  const nom = new Map((clientes ?? []).map((c) => [c.id, c]));
  const prochainRdv = new Map<string, { date_rdv: string; heure_rdv: string | null }>();
  for (const r of rdv ?? []) {
    const cle = `${r.cliente_id} ${r.soin_id}`;
    if (!prochainRdv.has(cle)) prochainRdv.set(cle, r);
  }

  // Les plus avancées vers la fin en premier : ce sont elles qu'il faut
  // relancer ou réabonner bientôt.
  const lignes = [...affiches].sort((a, b) =>
    passes ? b.fin.localeCompare(a.fin) : a.fin.localeCompare(b.fin),
  );

  const restantes = enCours.reduce((s, a) => s + Math.max(0, a.nb_seances - a.faites), 0);
  const enRetard = enCours.filter((a) => a.paiement.enRetard).length;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-800">Abonnements</h1>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-brand-100 p-1">
          {[
            { href: "/abonnements", libelle: `En cours (${enCours.length})`, actif: !passes },
            { href: "/abonnements?voir=termines", libelle: `Terminés (${termines.length})`, actif: passes },
          ].map((o) => (
            <Link
              key={o.href}
              href={o.href}
              aria-current={o.actif ? "true" : undefined}
              className={`flex h-10 items-center justify-center rounded-lg px-3 text-sm font-bold ${
                o.actif ? "bg-brand-600 text-white" : "text-brand-600 hover:bg-white/60"
              }`}
            >
              {o.libelle}
            </Link>
          ))}
        </div>
      </header>

      {!passes && enCours.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Chiffre valeur={enCours.length} libelle={enCours.length > 1 ? "abonnées en cours" : "abonnée en cours"} />
          <Chiffre valeur={restantes} libelle={restantes > 1 ? "séances restantes" : "séance restante"} />
          <Chiffre valeur={enRetard} libelle="paiement en retard" alerte={enRetard > 0} />
        </div>
      )}

      {lignes.length === 0 ? (
        <p className="rounded-2xl border border-brand-100 bg-white p-6 text-center text-brand-500">
          {passes
            ? "Aucun abonnement terminé pour l'instant."
            : "Aucune abonnée en cours. Un abonnement se crée depuis la fiche de la cliente."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lignes.map((a) => (
            <Carte
              key={a.id}
              a={a}
              cliente={nom.get(a.cliente_id)?.nom_complet ?? "Cliente"}
              telephone={nom.get(a.cliente_id)?.telephone ?? null}
              rdv={prochainRdv.get(`${a.cliente_id} ${a.soin_id}`) ?? null}
              aujourdhui={aujourdhui}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Chiffre({ valeur, libelle, alerte = false }: { valeur: number; libelle: string; alerte?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 text-center ${alerte ? "border-red-200 bg-red-50" : "border-brand-100 bg-white"}`}>
      <p className={`text-2xl font-bold ${alerte ? "text-red-700" : "text-brand-800"}`}>{valeur}</p>
      <p className="text-xs text-brand-500">{libelle}</p>
    </div>
  );
}

function Carte({
  a,
  cliente,
  telephone,
  rdv,
  aujourdhui,
}: {
  a: AbonnementVue;
  cliente: string;
  telephone: string | null;
  rdv: { date_rdv: string; heure_rdv: string | null } | null;
  aujourdhui: string;
}) {
  const reste = Math.max(0, a.nb_seances - a.faites);
  const pourcent = Math.min(100, Math.round((a.faites / a.nb_seances) * 100));
  const joursAvantFin = Math.round(
    (new Date(`${a.fin}T00:00:00Z`).getTime() - new Date(`${aujourdhui}T00:00:00Z`).getTime()) / 86_400_000,
  );
  const enCours = a.statut === "actif" || a.statut === "pause";
  const p = a.paiement;

  return (
    <li>
      <Link
        href={`/clientes/${a.cliente_id}`}
        className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4 hover:border-brand-300"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-brand-900">{cliente}</p>
            <p className="text-sm text-brand-600">
              {a.soin} · {libelleRythme(a.rythme)}
              {telephone && <span className="text-brand-400"> · {telephone}</span>}
            </p>
          </div>
          <Statut a={a} joursAvantFin={joursAvantFin} />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
            <span className="font-semibold text-brand-900">
              {a.faites} faite{a.faites > 1 ? "s" : ""} sur {a.nb_seances}
            </span>
            <span className={`font-bold ${reste === 0 ? "text-[#2f5d3a]" : "text-[#6e5114]"}`}>
              {reste === 0 ? "Toutes faites" : `${reste} restante${reste > 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#efe3c4]" aria-hidden="true">
            <div className="h-full rounded-full bg-[#c89b3c]" style={{ width: `${pourcent}%` }} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <Info titre="Période" texte={`${jourMois(a.debut)} → ${jourMois(a.fin, true)}`} />
          <Info titre="Dernière séance" texte={a.derniereSeance ? jourMois(a.derniereSeance, true) : "aucune"} />
          {enCours && (
            <Info
              titre="Prochain rendez-vous"
              texte={
                rdv
                  ? `${jourMois(rdv.date_rdv)}${rdv.heure_rdv ? ` à ${rdv.heure_rdv.slice(0, 5).replace(":", "h")}` : ""}`
                  : reste > 0 && a.statut === "actif"
                    ? `aucun (conseillé : ${jourMois(a.derniereSeance ? seanceSuivante(a.derniereSeance, a.rythme) : a.debut)})`
                    : "aucun"
              }
              alerte={!rdv && reste > 0 && a.statut === "actif"}
            />
          )}
          <Info
            titre="Paiement"
            texte={p.reste === 0 ? `${f(a.prix)} F, soldé` : `${f(p.paye)} F payés · reste ${f(p.reste)} F`}
            alerte={enCours && p.enRetard}
            detail={enCours && p.enRetard ? "en retard" : undefined}
          />
        </dl>
      </Link>
    </li>
  );
}

function Statut({ a, joursAvantFin }: { a: AbonnementVue; joursAvantFin: number }) {
  const [texte, style] =
    a.statut === "pause"
      ? ["En pause", "bg-[#eee7e2] text-brand-600"]
      : a.statut === "annule"
        ? ["Annulé", "bg-[#eee7e2] text-brand-500"]
        : a.statut === "termine"
          ? ["Terminé", "bg-[#e3efe5] text-[#2f5d3a]"]
          : joursAvantFin < 0
            ? ["Période dépassée", "bg-red-50 text-red-700"]
            : joursAvantFin <= 14
              ? [`Fin dans ${joursAvantFin} j`, "bg-[#fbe9d7] text-[#9a4b12]"]
              : ["En cours", "bg-[#f6ecd2] text-[#6e5114]"];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${style}`}>{texte}</span>;
}

function Info({ titre, texte, alerte = false, detail }: { titre: string; texte: string; alerte?: boolean; detail?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-brand-400">{titre}</dt>
      <dd className={alerte ? "font-semibold text-red-700" : "text-brand-800"}>
        {texte}
        {detail && <span className="ml-1 text-xs font-bold uppercase">· {detail}</span>}
      </dd>
    </div>
  );
}
