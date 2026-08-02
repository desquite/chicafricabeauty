/**
 * Compression d'une photo avant envoi.
 *
 * 2400 px / qualité 0,85 : sur de la peau, il faut assez de définition pour
 * comparer des pores ou une tache d'une séance à l'autre. Un profil plus
 * agressif (1600 / 0,7, correct pour une photo d'illustration) écrase
 * justement le détail qu'on cherche à suivre.
 *
 * imageOrientation "from-image" applique l'orientation EXIF : sans elle, les
 * photos prises en portrait sur tablette arrivent couchées.
 */
export async function compresserPhoto(
  fichier: File,
  maxPx = 2400,
  qualite = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier, {
    imageOrientation: "from-image",
  });

  const echelle = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * echelle);
  const hauteur = Math.round(bitmap.height * echelle);

  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexte 2D indisponible");
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();

  const blob = await new Promise<Blob | null>((r) =>
    canvas.toBlob(r, "image/jpeg", qualite),
  );
  if (!blob) throw new Error("Compression impossible");
  return blob;
}

export function poidsLisible(octets: number) {
  return octets < 1024 * 1024
    ? `${Math.round(octets / 1024)} Ko`
    : `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}
