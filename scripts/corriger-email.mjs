/**
 * Corrige l'adresse email d'un compte Supabase Auth.
 *
 *   node scripts/corriger-email.mjs <ancien> <nouveau>
 *
 * Deux endroits a mettre a jour, sinon le compte devient incoherent :
 *   - auth.users.email
 *   - auth.identities.identity_data->>'email' pour le fournisseur "email"
 * La colonne auth.identities.email est calculee a partir de identity_data,
 * il ne faut pas y toucher. provider_id vaut l'UUID du compte, il ne change
 * pas non plus.
 *
 * Ne touche ni au mot de passe ni a la confirmation du compte.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const [ancien, nouveau] = process.argv.slice(2);
if (!ancien || !nouveau) {
  console.error("Usage : node scripts/corriger-email.mjs <ancien> <nouveau>");
  process.exit(1);
}

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");

  const { rows: cible } = await client.query(
    "select id from auth.users where email = $1",
    [ancien],
  );
  if (cible.length === 0) throw new Error(`Aucun compte avec l'email ${ancien}`);
  const id = cible[0].id;

  const { rows: collision } = await client.query(
    "select 1 from auth.users where email = $1",
    [nouveau],
  );
  if (collision.length > 0) throw new Error(`${nouveau} est deja utilise`);

  await client.query(
    "update auth.users set email = $2, updated_at = now() where id = $1",
    [id, nouveau],
  );
  await client.query(
    `update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb($2::text)),
         updated_at = now()
     where user_id = $1 and provider = 'email'`,
    [id, nouveau],
  );

  await client.query("commit");

  const { rows } = await client.query(
    `select u.email as users_email, i.email as identities_email,
            u.email_confirmed_at is not null as confirme
     from auth.users u join auth.identities i on i.user_id = u.id
     where u.id = $1 and i.provider = 'email'`,
    [id],
  );
  console.log("users.email      :", rows[0].users_email);
  console.log("identities.email :", rows[0].identities_email);
  console.log("confirme         :", rows[0].confirme);
} catch (e) {
  await client.query("rollback");
  console.error("Echec, rien n'a ete modifie :", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
