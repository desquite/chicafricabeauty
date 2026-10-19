"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RdvAffiche } from "./agenda";

/**
 * Semaine en colonnes horaires : ce qui est pris, libre ou fermé se voit d'un
 * coup d'œil. Un appui sur un créneau libre ouvre la saisie d'un rendez-vous
 * à ce jour et à cette heure ; un appui sur un rendez-vous ouvre sa journée.
 *
 * Abidjan est en UTC : dates et heures se lisent telles quelles.
 */

export type HoraireSemaine = { jour: number; ouvert: boolean; ouverture: string | null; fermeture: string | null };
export type FermetureSemaine = {
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  motif: string | null;
};

const PAS = 30;
const HAUTEUR = 30; // pixels par demi-heure

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const versHeure = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const lisible = (m: number) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
const plusJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Bloc = { r: RdvAffiche; debut: number; fin: number; voie: number; voies: number };

/** Durée saisie, sinon celle du soin, sinon une heure : le même repli que la réservation en ligne. */
const duree = (r: RdvAffiche) => r.duree_min ?? r.soins_catalogue?.duree_std ?? 60;

/** Rendez-vous qui se chevauchent : côte à côte, chacun dans sa voie. */
function placer(rdvs: RdvAffiche[]): Bloc[] {
  const blocs = rdvs
    .filter((r) => r.heure_rdv)
    .map((r) => {
      const debut = minutes(r.heure_rdv!);
      return { r, debut, fin: debut + duree(r), voie: 0, voies: 1 };
    })
    .sort((a, b) => a.debut - b.debut);

  let groupe: Bloc[] = [];
  let finGroupe = -1;
  const fermer = () => {
    const n = Math.max(1, ...groupe.map((b) => b.voie + 1));
    for (const b of groupe) b.voies = n;
    groupe = [];
  };
  for (const b of blocs) {
    if (b.debut >= finGroupe) fermer();
    const occupees = new Set(groupe.filter((g) => g.fin > b.debut).map((g) => g.voie));
    let v = 0;
    while (occupees.has(v)) v++;
    b.voie = v;
    groupe.push(b);
    finGroupe = Math.max(finGroupe, b.fin);
  }
  fermer();
  return blocs;
}

const TEINTE: Record<RdvAffiche["statut"], string> = {
  prevu: "border-brand-600 bg-brand-100 text-brand-900",
  honore: "border-[#2f7d4f] bg-[#e5f0e6] text-[#1f4a2e]",
  absent: "border-red-600 bg-red-50 text-red-800",
  annule: "border-brand-300 bg-white text-brand-400 line-through",
};

export function VueSemaine({
  lundi,
  aujourdhui,
  rdvs,
  horaires,
  fermetures,
  minuteActuelle,
}: {
  lundi: string;
  aujourdhui: string;
  rdvs: RdvAffiche[];
  horaires: HoraireSemaine[];
  fermetures: FermetureSemaine[];
  /** Minutes depuis minuit, fixées par le serveur : même rendu des deux côtés. */
  minuteActuelle: number;
}) {
  const router = useRouter();
  const jours = Array.from({ length: 7 }, (_, i) => plusJours(lundi, i));
  const horaireDe = (iso: string) =>
    horaires.find((h) => h.jour === new Date(`${iso}T00:00:00Z`).getUTCDay());

  // Amplitude affichée : de la plus tôt ouverture à la plus tard fermeture,
  // élargie si un rendez-vous déborde.
  const ouverts = horaires.filter((h) => h.ouvert && h.ouverture && h.fermeture);
  let debutGrille = ouverts.length ? Math.min(...ouverts.map((h) => minutes(h.ouverture!))) : 8 * 60;
  let finGrille = ouverts.length ? Math.max(...ouverts.map((h) => minutes(h.fermeture!))) : 18 * 60;
  for (const r of rdvs) {
    if (!r.heure_rdv) continue;
    const d = minutes(r.heure_rdv);
    debutGrille = Math.min(debutGrille, d);
    finGrille = Math.max(finGrille, d + duree(r));
  }
  debutGrille = Math.floor(debutGrille / PAS) * PAS;
  finGrille = Math.ceil(finGrille / PAS) * PAS;
  const lignes = Array.from({ length: (finGrille - debutGrille) / PAS }, (_, i) => debutGrille + i * PAS);
  const y = (m: number) => ((m - debutGrille) / PAS) * HAUTEUR;

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white">
      <div className="min-w-[820px]">
        <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-brand-100 bg-white">
          <span />
          {jours.map((j) => {
            const d = new Date(`${j}T00:00:00Z`);
            const nb = rdvs.filter((r) => r.date_rdv === j && r.statut !== "annule").length;
            return (
              <Link
                key={j}
                href={`/rendez-vous?jour=${j}`}
                className={`flex flex-col items-center py-2 hover:bg-brand-50 ${j === aujourdhui ? "text-brand-600" : "text-brand-800"}`}
              >
                <span className="text-xs tracking-wide uppercase">
                  {d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" })}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-bold ${
                    j === aujourdhui ? "bg-brand-600 text-white" : ""
                  }`}
                >
                  {d.getUTCDate()}
                </span>
                <span className="text-[11px] text-brand-400">{nb ? `${nb} rdv` : " "}</span>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height: lignes.length * HAUTEUR }}>
            {lignes.map((m) =>
              m % 60 === 0 ? (
                <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-brand-400" style={{ top: y(m) }}>
                  {lisible(m)}
                </span>
              ) : null,
            )}
          </div>

          {jours.map((j) => {
            const h = horaireDe(j);
            const ouvert = Boolean(h?.ouvert && h.ouverture && h.fermeture);
            const ouv = ouvert ? minutes(h!.ouverture!) : 0;
            const ferm = ouvert ? minutes(h!.fermeture!) : 0;
            const fermeturesDuJour = fermetures.filter((f) => j >= f.date_debut && j <= f.date_fin);
            const journeeFermee = fermeturesDuJour.some((f) => !f.heure_debut);
            const bloque = (m: number) =>
              !ouvert ||
              journeeFermee ||
              m < ouv ||
              m + PAS > ferm ||
              fermeturesDuJour.some((f) => f.heure_debut && m < minutes(f.heure_fin!) && m + PAS > minutes(f.heure_debut));
            const passe = (m: number) => j < aujourdhui || (j === aujourdhui && m + PAS <= minuteActuelle);
            const blocs = placer(rdvs.filter((r) => r.date_rdv === j));

            return (
              <div
                key={j}
                className={`relative border-l border-brand-100 ${j === aujourdhui ? "bg-brand-50/40" : ""}`}
                style={{ height: lignes.length * HAUTEUR }}
              >
                {lignes.map((m) => {
                  const ferme = bloque(m);
                  const style = { top: y(m), height: HAUTEUR };
                  const trait = m % 60 === 0 ? "border-t border-brand-100" : "border-t border-dashed border-brand-50";
                  if (ferme || passe(m)) {
                    return (
                      <span
                        key={m}
                        aria-hidden="true"
                        className={`absolute inset-x-0 ${trait} ${ferme ? "bg-[repeating-linear-gradient(135deg,#f7efe9_0_6px,#fbf6f2_6px_12px)]" : ""}`}
                        style={style}
                      />
                    );
                  }
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-label={`Nouveau rendez-vous le ${j} à ${lisible(m)}`}
                      onClick={() => router.push(`/rendez-vous?jour=${j}&heure=${versHeure(m)}`)}
                      className={`group absolute inset-x-0 ${trait} hover:bg-brand-50`}
                      style={style}
                    >
                      <span className="hidden text-[11px] font-semibold text-brand-500 group-hover:inline">
                        + {lisible(m)}
                      </span>
                    </button>
                  );
                })}

                {!ouvert && (
                  <span className="pointer-events-none absolute inset-x-0 top-4 text-center text-xs font-semibold text-brand-400">
                    Fermé
                  </span>
                )}
                {fermeturesDuJour.map((f, i) => {
                  const haut = f.heure_debut ? y(minutes(f.heure_debut)) : 0;
                  return (
                    <span
                      key={i}
                      className="pointer-events-none absolute inset-x-1 text-center text-[11px] font-semibold text-brand-500"
                      style={{ top: haut + 4 }}
                    >
                      {f.motif || "Fermeture"}
                    </span>
                  );
                })}

                {blocs.map((b) => {
                  const largeur = 100 / b.voies;
                  return (
                    <Link
                      key={b.r.id}
                      href={b.r.clientes ? `/clientes/${b.r.clientes.id}` : `/rendez-vous?jour=${j}`}
                      title={`${lisible(b.debut)} – ${lisible(b.fin)} · ${b.r.clientes?.nom_complet ?? ""} · ${b.r.soins_catalogue?.libelle ?? ""}`}
                      className={`absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm hover:z-10 hover:shadow-md ${TEINTE[b.r.statut]}`}
                      style={{
                        top: y(b.debut) + 1,
                        height: Math.max(y(b.fin) - y(b.debut) - 2, 18),
                        left: `calc(${b.voie * largeur}% + 2px)`,
                        width: `calc(${largeur}% - 4px)`,
                      }}
                    >
                      <span className="block font-bold">
                        {lisible(b.debut)} {b.r.clientes?.nom_complet ?? "?"}
                      </span>
                      <span className="block truncate opacity-80">{b.r.soins_catalogue?.libelle}</span>
                      {(b.r.source === "en_ligne" || b.r.acompte_paye_le || b.r.alertes > 0) && (
                        <span className="mt-0.5 flex flex-wrap gap-0.5">
                          {b.r.source === "en_ligne" && <span className="rounded bg-white/70 px-1">en ligne</span>}
                          {b.r.acompte_paye_le && <span className="rounded bg-white/70 px-1 text-[#2f5d3a]">acompte</span>}
                          {b.r.alertes > 0 && <span className="rounded bg-white/70 px-1 text-red-700">santé</span>}
                        </span>
                      )}
                    </Link>
                  );
                })}

                {j === aujourdhui && minuteActuelle > debutGrille && minuteActuelle < finGrille && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-red-500"
                    style={{ top: y(minuteActuelle) }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="flex flex-wrap gap-4 border-t border-brand-100 px-4 py-2 text-xs text-brand-500">
        <span>Touchez un créneau libre pour y créer un rendez-vous.</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-brand-600 bg-brand-100" />prévu</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-[#2f7d4f] bg-[#e5f0e6]" />honoré</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-l-4 border-red-600 bg-red-50" />absente</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[repeating-linear-gradient(135deg,#f7efe9_0_3px,#fbf6f2_3px_6px)]" />fermé</span>
      </p>
    </div>
  );
}
