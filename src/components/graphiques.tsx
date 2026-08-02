import type { MoisActivite, Part } from "@/lib/stats";

/**
 * Graphiques en SVG, sans bibliothèque.
 *
 * Des barres et un anneau ne justifient pas 200 Ko de dépendance sur une
 * tablette. Tout est rendu côté serveur : aucun JavaScript n'est envoyé pour
 * afficher ces figures.
 */

const TEINTES = ["#7a3b2e", "#a8603f", "#c68767", "#ddb29b", "#c89b3c", "#d9b45f"];

export function Vide({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-brand-200 p-6 text-center text-sm text-brand-400">
      {message}
    </p>
  );
}

export function Chiffre({
  valeur,
  libelle,
  detail,
}: {
  valeur: string | number;
  libelle: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-white p-5">
      <p className="text-sm text-brand-400">{libelle}</p>
      <p className="mt-1 text-3xl font-semibold text-brand-700">{valeur}</p>
      {detail && <p className="mt-1 text-xs text-brand-400">{detail}</p>}
    </div>
  );
}

/** Barres verticales par mois, avec la part de premières séances en foncé. */
export function BarresMois({ mois }: { mois: MoisActivite[] }) {
  const max = Math.max(1, ...mois.map((m) => m.total));
  const largeur = 100 / mois.length;

  return (
    <div>
      <svg
        viewBox="0 0 100 42"
        className="h-44 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Séances par mois"
      >
        {mois.map((m, i) => {
          const h = (m.total / max) * 34;
          const hp = (m.premieres / max) * 34;
          const x = i * largeur + largeur * 0.18;
          const w = largeur * 0.64;
          return (
            <g key={m.cle}>
              <rect x={x} y={36 - h} width={w} height={h} fill="#ddb29b" rx="0.6" />
              <rect x={x} y={36 - hp} width={w} height={hp} fill="#7a3b2e" rx="0.6" />
            </g>
          );
        })}
      </svg>
      <div
        className="grid text-center text-[11px] text-brand-400"
        style={{ gridTemplateColumns: `repeat(${mois.length}, 1fr)` }}
      >
        {mois.map((m) => (
          <span key={m.cle}>
            <span className="block font-medium text-brand-700">{m.total || ""}</span>
            {m.libelle.replace(".", "")}
          </span>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-brand-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand-600" /> Premières séances
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand-300" /> Suivis
        </span>
      </p>
    </div>
  );
}

/** Classement horizontal : la forme la plus lisible pour comparer des libellés. */
export function BarresHorizontales({
  parts,
  limite = 8,
  unite = "séance",
}: {
  parts: Part[];
  limite?: number;
  unite?: string;
}) {
  const visibles = parts.slice(0, limite);
  const max = Math.max(1, ...visibles.map((p) => p.nb));

  return (
    <ul className="space-y-3">
      {visibles.map((p, i) => (
        <li key={p.cle}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-brand-800">{p.libelle}</span>
            <span className="shrink-0 text-brand-400">
              {p.nb} {unite}
              {p.nb > 1 ? "s" : ""} · {p.part} %
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-brand-50">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(p.nb / max) * 100}%`,
                backgroundColor: TEINTES[i % TEINTES.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Anneau de répartition, avec la légende chiffrée à droite. */
export function Anneau({ parts }: { parts: Part[] }) {
  const total = parts.reduce((a, p) => a + p.nb, 0);
  if (total === 0) return <Vide message="Aucune donnée sur la période." />;

  const rayon = 15.9155; // circonférence = 100, les parts se lisent en %

  // Chaque segment démarre là où s'arrête la somme des précédents. Calculé
  // sans accumulateur mutable : le décalage se déduit du rang, ce qui évite
  // toute dépendance à l'ordre d'évaluation.
  const segments = parts.map((p, i) => {
    const avant = parts.slice(0, i).reduce((a, x) => a + x.nb, 0);
    return {
      ...p,
      longueur: (p.nb / total) * 100,
      decalage: 25 - (avant / total) * 100, // 25 = démarrage en haut du cercle
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 42 42" className="h-36 w-36 shrink-0" role="img" aria-label="Répartition">
        <circle cx="21" cy="21" r={rayon} fill="transparent" stroke="#f7ebe4" strokeWidth="6" />
        {segments.map((p, i) => (
          <circle
            key={p.cle}
            cx="21"
            cy="21"
            r={rayon}
            fill="transparent"
            stroke={TEINTES[i % TEINTES.length]}
            strokeWidth="6"
            strokeDasharray={`${p.longueur} ${100 - p.longueur}`}
            strokeDashoffset={p.decalage}
          />
        ))}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.cle} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: TEINTES[i % TEINTES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-brand-800">{p.libelle}</span>
            <span className="shrink-0 text-brand-400">
              {p.nb} · {p.part} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bloc({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-2xl border border-brand-100 bg-white p-6">
      <h2 className="text-xl font-semibold text-brand-800">{titre}</h2>
      {aide && <p className="mt-1 mb-4 text-sm text-brand-400">{aide}</p>}
      <div className={aide ? "" : "mt-4"}>{children}</div>
    </section>
  );
}
