/**
 * Planifie le recapitulatif quotidien depuis la base elle-meme.
 *
 *   node scripts/planifier-cron.mjs <url-application> <cron-secret> [expression]
 *
 * Pourquoi pas le cron Vercel : sur le plan Hobby il ne se declenche que dans
 * une fenetre dune heure, et il ne se declenchait pas du tout. pg_cron
 * sexecute a lheure exacte, se verifie depuis cette meme connexion, et ne
 * depend plus du plan dhebergement. Effet de bord utile : lappel quotidien
 * touche la base et empeche la mise en veille du plan Supabase gratuit.
 *
 * Le secret nest pas ecrit dans le depot : il est passe en argument et ne vit
 * que dans la definition de la tache, cote base.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const [urlApp, secret, expression = "0 7 * * *"] = process.argv.slice(2);
if (!urlApp || !secret) {
  console.error(
    "Usage : node scripts/planifier-cron.mjs <url-application> <cron-secret> [expression]",
  );
  process.exit(1);
}

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const NOM = "recapitulatif-quotidien";
const litteral = (s) => `'${String(s).replace(/'/g, "''")}'`;

try {
  await c.query("create extension if not exists pg_cron");
  await c.query("create extension if not exists pg_net");
  console.log("extensions pg_cron et pg_net : OK");

  // Rejouer le script ne doit pas empiler les taches.
  const { rows: existantes } = await c.query(
    "select jobid from cron.job where jobname = $1",
    [NOM],
  );
  for (const j of existantes) {
    await c.query("select cron.unschedule($1::bigint)", [j.jobid]);
    console.log("ancienne tache retiree :", j.jobid);
  }

  const cible = `${urlApp.replace(/\/$/, "")}/api/cron/recapitulatif`;
  const entetes = JSON.stringify({ Authorization: `Bearer ${secret}` });
  const appel = `select net.http_get(
    url := ${litteral(cible)},
    headers := ${litteral(entetes)}::jsonb,
    timeout_milliseconds := 120000
  );`;

  const { rows } = await c.query("select cron.schedule($1, $2, $3) as jobid", [
    NOM,
    expression,
    appel,
  ]);
  console.log(`tache planifiee : jobid ${rows[0].jobid}, "${expression}" en UTC`);

  const { rows: verif } = await c.query(
    "select jobid, jobname, schedule, active, database, username from cron.job where jobname = $1",
    [NOM],
  );
  console.table(verif);
  console.log("cible :", cible);
} catch (e) {
  console.error("Echec :", e.code ?? "", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
