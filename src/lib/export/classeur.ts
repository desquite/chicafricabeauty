import "server-only";
import ExcelJS from "exceljs";

export type Colonne<T> = {
  entete: string;
  largeur?: number;
  valeur: (ligne: T) => string | number | null;
};

const ACCENT = "FF7A3B2E";

/**
 * Ajoute une feuille mise en forme : en-tête figée, filtre automatique,
 * largeurs fixées.
 *
 * Le filtre et le volet figé ne sont pas cosmétiques : sur un export de
 * plusieurs centaines de lignes, sans eux la première chose que fait la
 * gérante est de les ajouter à la main.
 */
export function ajouterFeuille<T>(
  classeur: ExcelJS.Workbook,
  titre: string,
  colonnes: Colonne<T>[],
  lignes: T[],
) {
  const feuille = classeur.addWorksheet(titre, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  feuille.columns = colonnes.map((c) => ({
    header: c.entete,
    width: c.largeur ?? 18,
  }));

  const entete = feuille.getRow(1);
  entete.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  entete.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
  entete.alignment = { vertical: "middle" };
  entete.height = 22;

  for (const ligne of lignes) {
    feuille.addRow(colonnes.map((c) => c.valeur(ligne) ?? ""));
  }

  if (lignes.length > 0) {
    feuille.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: colonnes.length },
    };
  }

  // Les champs longs (observations, conseils) sont illisibles sur une seule
  // ligne : on renvoie à la ligne dans la cellule plutôt que de tronquer.
  colonnes.forEach((c, i) => {
    if ((c.largeur ?? 18) >= 40) {
      feuille.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" };
    }
  });

  return feuille;
}

export function dateFr(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}

export function ouiNon(v: boolean | null | undefined) {
  return v === null || v === undefined ? "" : v ? "Oui" : "Non";
}

export function libelle(
  options: readonly { valeur: string; libelle: string }[],
  v: string | null | undefined,
) {
  return options.find((o) => o.valeur === v)?.libelle ?? "";
}

export function libelles(
  options: readonly { valeur: string; libelle: string }[],
  v: string[] | null | undefined,
) {
  return (v ?? []).map((x) => libelle(options, x)).filter(Boolean).join(", ");
}

/** Réponse HTTP prête pour un téléchargement de classeur. */
export async function reponseClasseur(classeur: ExcelJS.Workbook, nom: string) {
  const tampon = await classeur.xlsx.writeBuffer();
  const jour = new Date().toISOString().slice(0, 10);
  return new Response(tampon as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}_${jour}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
