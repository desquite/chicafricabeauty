/**
 * Applique les migrations SQL directement sur la base Supabase.
 *
 * Existe parce que l'éditeur SQL du tableau de bord découpe le script côté
 * client et se trompe : une apostrophe dans un commentaire lui fait croire
 * qu'une chaîne s'ouvre, et il avale tout ce qui suit sans l'exécuter. Ici
 * chaque fichier part en un seul morceau, c'est Postgres qui l'analyse.
 *
 *   node scripts/migrate.mjs              tous les fichiers, dans l'ordre
 *   node scripts/migrate.mjs 0002         seulement ceux dont le nom contient
 *
 * La chaîne de connexion est lue dans .db-url.txt (ignoré par git) et n'est
 * jamais affichée, ni en cas d'erreur.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const fichierUrl = join(racine, ".db-url.txt");
const dossierMigrations = join(racine, "supabase", "migrations");

let url;
try {
  url = readFileSync(fichierUrl, "utf8").trim();
} catch {
  console.error(
    `Fichier .db-url.txt introuvable.\n\n` +
      `Supabase > Settings > Database > Connection string > Session pooler,\n` +
      `remplacer [YOUR-PASSWORD] par le mot de passe de la base, et coller le\n` +
      `tout dans ${fichierUrl}`,
  );
  process.exit(1);
}

if (!url.startsWith("postgres")) {
  console.error(".db-url.txt ne contient pas une URL postgres:// valide.");
  process.exit(1);
}
if (url.includes("[YOUR-PASSWORD]")) {
  console.error(
    ".db-url.txt contient encore le marqueur [YOUR-PASSWORD] : le remplacer par le mot de passe réel.",
  );
  process.exit(1);
}

const filtre = process.argv[2];
const fichiers = readdirSync(dossierMigrations)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => !filtre || f.includes(filtre))
  .sort();

if (fichiers.length === 0) {
  console.error("Aucun fichier de migration à appliquer.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  // Une migration longue ne doit pas être coupée par un timeout court.
  statement_timeout: 120_000,
});

try {
  await client.connect();
} catch (e) {
  // On n'affiche que le message : l'URL contient le mot de passe.
  console.error(`Connexion impossible : ${e.message}`);
  process.exit(1);
}

let echec = false;

for (const fichier of fichiers) {
  const sql = readFileSync(join(dossierMigrations, fichier), "utf8");
  process.stdout.write(`${fichier.padEnd(32)} `);
  try {
    // Le fichier entier part en une requête : aucun découpage côté client.
    await client.query(sql);
    console.log("OK");
  } catch (e) {
    console.log("ECHEC");
    console.error(`  ${e.code ?? ""} ${e.message}`);
    if (e.position) {
      const pos = Number(e.position);
      const avant = sql.slice(0, pos);
      const ligne = avant.split("\n").length;
      console.error(`  ligne ${ligne} : ${sql.split("\n")[ligne - 1]?.trim()}`);
    }
    echec = true;
    break;
  }
}

await client.end();
process.exit(echec ? 1 : 0);
