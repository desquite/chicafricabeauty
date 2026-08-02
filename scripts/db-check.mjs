/**
 * Etat de la base : tables, RLS, policies, buckets, catalogue, personnel.
 * Lit .db-url.txt comme scripts/migrate.mjs et n'affiche jamais l'URL.
 *
 *   node scripts/db-check.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: tables } = await client.query(`
  select c.relname as table,
         c.relrowsecurity as rls,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`);

console.log("TABLE                  RLS   POLICIES");
for (const t of tables) {
  console.log(
    `${t.table.padEnd(22)} ${(t.rls ? "oui" : "NON").padEnd(5)} ${t.policies}`,
  );
}

const uneValeur = async (sql) => (await client.query(sql)).rows[0].v;

console.log("");
console.log("vue anamneses_courantes :", await uneValeur(
  `select count(*)::int as v from pg_views where schemaname='public' and viewname='anamneses_courantes'`,
));
console.log("fonction est_staff_actif :", await uneValeur(
  `select count(*)::int as v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='est_staff_actif'`,
));
console.log("declencheurs updated_at  :", await uneValeur(
  `select count(*)::int as v from pg_trigger where tgname in ('clientes_touch','seances_touch')`,
));
console.log("buckets prives           :", await uneValeur(
  `select count(*)::int as v from storage.buckets where id in ('photos-soins','signatures')`,
));
console.log("policy storage.objects   :", await uneValeur(
  `select count(*)::int as v from pg_policies where schemaname='storage' and policyname='storage_soins_staff'`,
));
console.log("soins au catalogue       :", await uneValeur(
  `select count(*)::int as v from soins_catalogue`,
));
console.log("comptes auth             :", await uneValeur(
  `select count(*)::int as v from auth.users`,
));
console.log("profils personnel        :", await uneValeur(
  `select count(*)::int as v from profiles`,
));

await client.end();
