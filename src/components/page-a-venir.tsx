/**
 * Écran d'attente pour les rubriques dont le lot n'est pas encore livré.
 * Volontairement explicite sur ce qui arrivera : la gérante peut ouvrir
 * l'application dès maintenant sans se demander si c'est cassé.
 */
export function PageAVenir({
  titre,
  lot,
  contenu,
}: {
  titre: string;
  lot: string;
  contenu: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold text-brand-800">{titre}</h1>
      <p className="mt-2 text-brand-400">{lot}</p>

      <ul className="mt-8 space-y-3">
        {contenu.map((ligne) => (
          <li
            key={ligne}
            className="flex items-start gap-3 rounded-xl border border-brand-100 bg-white p-4"
          >
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-or-500"
              aria-hidden="true"
            />
            <span className="text-brand-800">{ligne}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
