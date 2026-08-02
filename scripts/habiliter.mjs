/**
 * Rattache un compte Supabase Auth au personnel de l'institut.
 *
 * Un compte Auth seul ne donne aucun acces : il faut une ligne profiles
 * active. Ce script cree ou met a jour cette ligne.
 *
 *   node scripts/habiliter.mjs email@exemple.com "Nom Prenom" gerante
 *   node scripts/habiliter.mjs email@exemple.com "Nom Prenom"    -> estheticienne
 *
 * Le compte doit exister au prealable, cree depuis Supabase >
 * Authentication > Add user. Ce script ne cree pas de compte et ne
 * manipule aucun mot de passe.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const [email, nom, role = "estheticienne"] = process.argv.slice(2);

if (!email || !nom) {
  console.error(
    'Usage : node scripts/habiliter.mjs <email> "<nom>" [gerante|estheticienne]',
  );
  process.exit(1);
}
if (!["gerante", "estheticienne"].includes(role)) {
  console.error(`Role inconnu : ${role}. Attendu gerante ou estheticienne.`);
  process.exit(1);
}

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `insert into profiles (id, nom, role, actif)
   select id, $2, $3, true from auth.users where email = $1
   on conflict (id) do update
     set nom = excluded.nom, role = excluded.role, actif = true
   returning id, nom, role`,
  [email, nom, role],
);

if (rows.length === 0) {
  console.error(
    `Aucun compte Auth pour ${email}.\n` +
      `Le creer depuis Supabase > Authentication > Add user, puis relancer.`,
  );
  await client.end();
  process.exit(1);
}

console.log(`Habilite : ${rows[0].nom} (${rows[0].role})`);
await client.end();
