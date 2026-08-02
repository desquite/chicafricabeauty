import Link from "next/link";
import type { RdvAffiche } from "./agenda";

/**
 * Rendez-vous des trente prochains jours, groupés par jour.
 *
 * Écran de consultation, sans navigation : c'est celui qu'on ouvre quand une
 * cliente demande au téléphone s'il reste de la place cette semaine.
 */
export function VueAvenir({
  rdvs,
  aujourdhui,
}: {
  rdvs: RdvAffiche[];
  /** Fourni par la page : une seule date de référence pour tout l'écran. */
  aujourdhui: string;
}) {
  if (rdvs.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-brand-200 p-10 text-center text-brand-400">
        Aucun rendez-vous prévu dans les trente prochains jours.
      </p>
    );
  }

  const parJour = new Map<string, RdvAffiche[]>();
  for (const r of rdvs) {
    parJour.set(r.date_rdv, [...(parJour.get(r.date_rdv) ?? []), r]);
  }

  const demain = new Date(new Date(aujourdhui).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const intitule = (jour: string) => {
    if (jour === aujourdhui) return "Aujourd'hui";
    if (jour === demain) return "Demain";
    return new Date(jour).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  return (
    <div className="space-y-8">
      {[...parJour.entries()].map(([jour, liste]) => (
        <section key={jour}>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="font-semibold text-brand-800 first-letter:uppercase">
              {intitule(jour)}
            </h2>
            <Link
              href={`/rendez-vous?jour=${jour}`}
              className="text-sm text-brand-500 hover:underline"
            >
              {liste.length} rendez-vous →
            </Link>
          </div>
          <ul className="space-y-2">
            {liste.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-100 bg-white p-4"
              >
                <span className="min-w-0">
                  <span className="font-medium text-brand-800">
                    {r.heure_rdv ? r.heure_rdv.slice(0, 5) : "Heure à définir"}
                    {" — "}
                    {r.clientes?.nom_complet ?? "Cliente inconnue"}
                  </span>
                  <span className="block text-sm text-brand-400">
                    {[r.soins_catalogue?.libelle, r.clientes?.telephone]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {r.alertes > 0 && (
                  <span className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                    {r.alertes} alerte{r.alertes > 1 ? "s" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
