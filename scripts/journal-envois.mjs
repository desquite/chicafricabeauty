/**
 * Derniers envois WhatsApp, avec le canal qui les a portes.
 *
 * La colonne canal a ete ajoutee pour diagnostiquer la periode ou les deux
 * fournisseurs coexistent, mais rien ne la lisait : un rappel manquant se
 * serait cherche a l aveugle.
 *
 *   node scripts/journal-envois.mjs          les 30 derniers
 *   node scripts/journal-envois.mjs 100      les 100 derniers
 *   node scripts/journal-envois.mjs --echecs seulement ce qui a rate
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const args = process.argv.slice(2);
const echecsSeuls = args.includes("--echecs");
const limite = Number(args.find((a) => /^\d+$/.test(a))) || 30;

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(
  `select envoye_le, type, canal, destinataire, succes, detail
   from notifications_envoyees
   ${echecsSeuls ? "where not succes" : ""}
   order by envoye_le desc
   limit $1`,
  [limite],
);

if (rows.length === 0) {
  console.log(echecsSeuls ? "Aucun echec." : "Aucun envoi.");
} else {
  console.log("QUAND             TYPE           CANAL         DESTINATAIRE      ETAT");
  for (const r of rows) {
    const quand = new Date(r.envoye_le).toISOString().slice(5, 16).replace("T", " ");
    console.log(
      `${quand}  ${String(r.type).padEnd(14)} ${String(r.canal ?? "—").padEnd(13)} ` +
        `${String(r.destinataire).padEnd(17)} ${r.succes ? "ok" : "ECHEC"}` +
        `${r.detail ? `  ${String(r.detail).slice(0, 90)}` : ""}`,
    );
  }
}

const { rows: [bilan] } = await client.query(`
  select count(*) filter (where canal = 'infobip')::int as infobip,
         count(*) filter (where canal = 'infobip-repli')::int as repli,
         count(*) filter (where canal = 'wasender')::int as wasender,
         count(*) filter (where not succes)::int as echecs
  from notifications_envoyees
`);
console.log("");
console.log(
  `Depuis le debut : ${bilan.infobip} par Infobip (dont ${bilan.repli} en repli), ` +
    `${bilan.wasender} par WasenderAPI, ${bilan.echecs} echec(s).`,
);

await client.end();
