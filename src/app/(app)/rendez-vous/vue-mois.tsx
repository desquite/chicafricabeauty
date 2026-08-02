import Link from "next/link";

export type JourDuMois = {
  jour: string;
  total: number;
  annules: number;
  alertes: boolean;
};

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * Grille du mois avec le nombre de rendez-vous par jour.
 *
 * Répond à la question qu'on ne pouvait pas poser jusqu'ici : combien de
 * rendez-vous le 9 août ? L'information existait, mais un seul jour à la fois.
 */
export function VueMois({
  mois,
  jours,
  aujourdhui,
}: {
  mois: string;
  jours: Map<string, JourDuMois>;
  aujourdhui: string;
}) {
  const [annee, numeroMois] = mois.split("-").map(Number);
  const premier = new Date(Date.UTC(annee, numeroMois - 1, 1));
  const nbJours = new Date(Date.UTC(annee, numeroMois, 0)).getUTCDate();

  // getUTCDay renvoie 0 pour dimanche : on décale pour une semaine qui
  // commence le lundi, comme dans un agenda français.
  const decalage = (premier.getUTCDay() + 6) % 7;

  const cases: (JourDuMois | null)[] = [
    ...Array(decalage).fill(null),
    ...Array.from({ length: nbJours }, (_, i) => {
      const jour = `${mois}-${String(i + 1).padStart(2, "0")}`;
      return jours.get(jour) ?? { jour, total: 0, annules: 0, alertes: false };
    }),
  ];

  return (
    <>
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold tracking-wide text-brand-400 uppercase">
        {JOURS.map((j) => (
          <span key={j}>{j}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cases.map((c, i) =>
          c === null ? (
            <span key={`vide-${i}`} />
          ) : (
            <Link
              key={c.jour}
              href={`/rendez-vous?jour=${c.jour}`}
              aria-label={`${Number(c.jour.slice(8))} : ${c.total} rendez-vous`}
              className={`flex min-h-20 flex-col rounded-xl border p-2 transition-colors ${
                c.jour === aujourdhui
                  ? "border-brand-600 bg-brand-50"
                  : c.total > 0
                    ? "border-brand-200 bg-white hover:border-brand-400"
                    : "border-brand-100 bg-white/60 hover:border-brand-300"
              }`}
            >
              <span className="flex items-start justify-between">
                <span
                  className={`text-sm ${
                    c.jour === aujourdhui
                      ? "font-bold text-brand-700"
                      : "font-medium text-brand-800"
                  }`}
                >
                  {Number(c.jour.slice(8))}
                </span>
                {c.alertes && (
                  <span
                    className="mt-1 h-2 w-2 rounded-full bg-red-500"
                    title="Contre-indications à vérifier"
                  />
                )}
              </span>

              {c.total > 0 && (
                <span className="mt-auto">
                  <span className="block text-lg leading-tight font-semibold text-brand-700">
                    {c.total}
                  </span>
                  <span className="block text-[11px] text-brand-400">
                    rendez-vous
                  </span>
                </span>
              )}
              {c.total === 0 && c.annules > 0 && (
                <span className="mt-auto text-[11px] text-brand-400">
                  {c.annules} annulé{c.annules > 1 ? "s" : ""}
                </span>
              )}
            </Link>
          ),
        )}
      </div>

      <p className="mt-4 flex flex-wrap gap-4 text-xs text-brand-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-brand-600 bg-brand-50" />
          Aujourd&apos;hui
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Contre-indications à vérifier
        </span>
        <span>Les rendez-vous annulés ne sont pas comptés.</span>
      </p>
    </>
  );
}
