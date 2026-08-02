/**
 * Applique les migrations SQL directement sur la base Supabase.
 *
 * Existe parce que l'éditeur SQL du tableau de bord découpe le script côté
 * client et se trompe : une apostrophe dans un commentaire lui fait croire
 * qu'une chaîne s'ouvre, et il avale tout ce qui suit sans l'exécuter. Ici
 * chaque fichier part en un seul morceau, c'est Postgres qui l'analyse.
 *
 *   node scripts/migrate.mjs                 applique ce qui manque
 *   node scripts/migrate.mjs --etat          liste sans rien appliquer
 *   node scripts/migrate.mjs --marque 0001   note comme appliqué sans exécuter
 *
 * Les fichiers déjà appliqués sont enregistrés dans schema_migrations et ne
 * sont jamais rejoués : 0001 contient des CREATE TABLE, la rejouer sur une
 * base en service détruirait les données.
 *
 * La chaîne de connexion est lue dans .db-url.txt (ignoré par git) et n'est
 * jamais affichée, ni en cas d'erreur.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const dossier = join(racine, "supabase", "migrations");

let url;
try {
  url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();
} catch {
  console.error(
    "Fichier .db-url.txt introuvable.\n\n" +
      "Supabase, bouton Connect en haut de la page, onglet Session pooler.\n" +
      "Remplacer [YOUR-PASSWORD] par le mot de passe de la base, et coller la\n" +
      `ligne complète dans ${join(racine, ".db-url.txt")}`,
  );
  process.exit(1);
}
if (!url.startsWith("postgres") || url.includes("[YOUR-PASSWORD]")) {
  console.error(".db-url.txt ne contient pas une URL postgres valide et complète.");
  process.exit(1);
}

const args = process.argv.slice(2);
const etatSeul = args.includes("--etat");
const iMarque = args.indexOf("--marque");
const aMarquer = iMarque === -1 ? [] : args.slice(iMarque + 1);

const fichiers = readdirSync(dossier)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

try {
  await client.connect();
} catch (e) {
  // On n'affiche que le message : l'URL contient le mot de passe.
  console.error(`Connexion impossible : ${e.message}`);
  process.exit(1);
}

await client.query(`
  create table if not exists schema_migrations (
    fichier     text primary key,
    applique_le timestamptz not null default now()
  )
`);

const { rows } = await client.query("select fichier from schema_migrations");
const deja = new Set(rows.map((r) => r.fichier));

if (aMarquer.length > 0) {
  for (const f of aMarquer) {
    const cible = fichiers.filter((x) => x.includes(f));
    for (const c of cible) {
      await client.query(
        "insert into schema_migrations (fichier) values ($1) on conflict do nothing",
        [c],
      );
      console.log(`marqué appliqué : ${c}`);
      deja.add(c);
    }
  }
}

if (etatSeul || aMarquer.length > 0) {
  console.log("");
  for (const f of fichiers) {
    console.log(`${deja.has(f) ? "applique " : "A FAIRE  "} ${f}`);
  }
  await client.end();
  process.exit(0);
}

const aFaire = fichiers.filter((f) => !deja.has(f));
if (aFaire.length === 0) {
  console.log("Base à jour, rien à appliquer.");
  await client.end();
  process.exit(0);
}

let echec = false;

for (const fichier of aFaire) {
  const sql = readFileSync(join(dossier, fichier), "utf8");
  process.stdout.write(`${fichier.padEnd(36)} `);
  try {
    // Le fichier entier part en une requête : aucun découpage côté client.
    await client.query(sql);
    await client.query("insert into schema_migrations (fichier) values ($1)", [
      fichier,
    ]);
    console.log("OK");
  } catch (e) {
    console.log("ECHEC");
    console.error(`  ${e.code ?? ""} ${e.message}`);
    if (e.position) {
      const ligne = sql.slice(0, Number(e.position)).split("\n").length;
      console.error(`  ligne ${ligne} : ${sql.split("\n")[ligne - 1]?.trim()}`);
    }
    echec = true;
    break;
  }
}

await client.end();
process.exit(echec ? 1 : 0);
