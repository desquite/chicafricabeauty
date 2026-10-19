/**
 * Écrans d'attente des rubriques.
 *
 * Affichés dès le clic, le temps que le serveur lise les données de la page :
 * la forme de la page arrive tout de suite, son contenu ensuite. Sans eux,
 * l'ancienne page restait figée et la gérante ne savait pas si son appui
 * avait été pris.
 */

function Bloc({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-brand-100 ${className}`} />;
}

function Cadre({ largeur, children }: { largeur: string; children: React.ReactNode }) {
  return (
    <div className={`mx-auto ${largeur}`} role="status" aria-live="polite">
      <span className="sr-only">Chargement…</span>
      {children}
    </div>
  );
}

function Entete({ bouton = false }: { bouton?: boolean }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Bloc className="h-8 w-48" />
        <Bloc className="h-4 w-64 max-w-full" />
      </div>
      {bouton && <Bloc className="h-touch w-36" />}
    </div>
  );
}

function Ligne() {
  return (
    <div className="flex items-center gap-4 border-b border-brand-50 px-5 py-4 last:border-0">
      <Bloc className="h-11 w-11 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Bloc className="h-4 w-2/5" />
        <Bloc className="h-3 w-3/5" />
      </div>
      <Bloc className="hidden h-4 w-16 sm:block" />
    </div>
  );
}

/** Liste : Clientes, Séances, À relancer, Catalogue, Disponibilités… */
export function SqueletteListe({
  largeur = "max-w-4xl",
  recherche = false,
  bouton = false,
  lignes = 7,
}: {
  largeur?: string;
  recherche?: boolean;
  bouton?: boolean;
  lignes?: number;
}) {
  return (
    <Cadre largeur={largeur}>
      <Entete bouton={bouton} />
      {recherche && <Bloc className="mb-5 h-touch w-full" />}
      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
        {Array.from({ length: lignes }, (_, i) => (
          <Ligne key={i} />
        ))}
      </div>
    </Cadre>
  );
}

/** Cartes en grille : Accueil, Statistiques. */
export function SqueletteCartes({ largeur = "max-w-7xl" }: { largeur?: string }) {
  return (
    <Cadre largeur={largeur}>
      <Entete />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Bloc key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white">
          {Array.from({ length: 5 }, (_, i) => (
            <Ligne key={i} />
          ))}
        </div>
        <Bloc className="h-72" />
      </div>
    </Cadre>
  );
}

/** Fiche : cliente, séance. */
export function SqueletteFiche({ largeur = "max-w-7xl" }: { largeur?: string }) {
  return (
    <Cadre largeur={largeur}>
      <Bloc className="mb-4 h-4 w-24" />
      <div className="mb-5 flex items-center gap-4">
        <Bloc className="h-16 w-16 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Bloc className="h-8 w-56 max-w-full" />
          <Bloc className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="mb-5 flex gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Bloc key={i} className="h-touch w-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Bloc className="h-64" />
        <Bloc className="h-64" />
        <Bloc className="h-64" />
      </div>
    </Cadre>
  );
}

/** Agenda : onglets, flèches et grille de la semaine. */
export function SqueletteAgenda() {
  return (
    <Cadre largeur="max-w-7xl">
      <Bloc className="mb-3 h-8 w-48" />
      <div className="mb-5 flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Bloc key={i} className="h-11 w-24" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={`flex-col gap-2 ${i > 2 ? "hidden sm:flex" : "flex"}`}>
            <Bloc className="h-10" />
            <Bloc className="h-96" />
          </div>
        ))}
      </div>
    </Cadre>
  );
}
