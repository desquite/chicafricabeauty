/**
 * Bascule des rappels clientes entre WasenderAPI et Infobip.
 *
 * La fiche de chaque cliente porte la case, mais la cocher 91 fois n a pas de
 * sens le jour ou la migration est validee. Ce script fait la meme chose en un
 * geste, et sait revenir en arriere.
 *
 *   node scripts/basculer-infobip.mjs                 etat des lieux
 *   node scripts/basculer-infobip.mjs 0709646096      bascule une cliente
 *   node scripts/basculer-infobip.mjs "Mariam"        idem, par le nom
 *   node scripts/basculer-infobip.mjs --tous          toutes les clientes
 *   node scripts/basculer-infobip.mjs --gerantes      le recapitulatif du matin
 *   node scripts/basculer-infobip.mjs --retour 0709646096   revient a Wasender
 *   node scripts/basculer-infobip.mjs --retour --tous
 *
 * Sans --appliquer, rien n est ecrit : le script dit ce qu il ferait.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const retour = args.includes("--retour");
const tous = args.includes("--tous");
const gerantes = args.includes("--gerantes");
const cible = args.find((a) => !a.startsWith("--"));

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: etat } = await client.query(`
  select count(*) filter (where rappels_infobip)::int as infobip,
         count(*) filter (where not rappels_infobip)::int as wasender,
         count(*) filter (where not rappels_whatsapp)::int as sans_rappel
  from clientes
`);
console.log(
  `Clientes : ${etat[0].infobip} sur Infobip, ${etat[0].wasender} sur WasenderAPI ` +
    `(dont ${etat[0].sans_rappel} sans rappel du tout)`,
);

const { rows: staff } = await client.query(`
  select count(*) filter (where notifications_infobip)::int as infobip,
         count(*) filter (where not notifications_infobip)::int as wasender
  from profiles where actif and notifications_whatsapp and telephone is not null
`);
console.log(
  `Gerantes : ${staff[0].infobip} sur Infobip, ${staff[0].wasender} sur WasenderAPI`,
);

// Les gerantes ne recoivent pas des rappels mais le recapitulatif du matin,
// et leur modele est distinct : elles se basculent a part.
if (gerantes) {
  const { rows } = await client.query(
    `select id, nom, telephone, notifications_infobip from profiles
     where actif and notifications_whatsapp and telephone is not null
     order by nom`,
  );
  const vers = !retour;
  console.log("");
  console.log(`Gerantes vers ${vers ? "Infobip" : "WasenderAPI"} :`);
  for (const g of rows) {
    console.log(
      `  ${g.nom.padEnd(24)} ${g.telephone}${g.notifications_infobip === vers ? "  (deja)" : ""}`,
    );
  }
  if (appliquer) {
    const { rowCount } = await client.query(
      `update profiles set notifications_infobip = $1 where id = any($2)`,
      [vers, rows.map((g) => g.id)],
    );
    console.log("");
    console.log(`Applique : ${rowCount} profil(s) mis a jour.`);
  } else {
    console.log("");
    console.log("Apercu seulement. Relancer avec --appliquer pour ecrire.");
  }
  await client.end();
  process.exit(0);
}

if (!tous && !cible) {
  const { rows } = await client.query(`
    select nom_complet, telephone from clientes
    where rappels_infobip order by nom_complet
  `);
  if (rows.length) {
    console.log("");
    console.log("Deja sur Infobip :");
    for (const c of rows) console.log(`  ${c.nom_complet.padEnd(30)} ${c.telephone}`);
  }
  console.log("");
  console.log("Aucune cible donnee. Voir l en-tete du fichier pour les options.");
  await client.end();
  process.exit(0);
}

// Le nom comme le telephone sont acceptes : la gerante a rarement l un et
// l autre sous les yeux. La comparaison porte sur les chiffres seuls, les
// numeros etant saisis de plusieurs facons.
const { rows: concernees } = tous
  ? await client.query(
      `select id, nom_complet, telephone, rappels_infobip from clientes
       where rappels_whatsapp and rappels_infobip = $1 order by nom_complet`,
      [retour],
    )
  : await client.query(
      `select id, nom_complet, telephone, rappels_infobip from clientes
       where (nom_complet ilike $1 or regexp_replace(telephone, '\\D', '', 'g') like $2)
       order by nom_complet`,
      [`%${cible}%`, `%${String(cible).replace(/\D/g, "")}%`],
    );

if (concernees.length === 0) {
  console.log("");
  console.log("Aucune cliente ne correspond.");
  await client.end();
  process.exit(0);
}

const vers = !retour;
console.log("");
console.log(`${concernees.length} cliente(s) vers ${vers ? "Infobip" : "WasenderAPI"} :`);
for (const c of concernees) {
  const deja = c.rappels_infobip === vers ? "  (deja)" : "";
  console.log(`  ${c.nom_complet.padEnd(30)} ${c.telephone}${deja}`);
}

if (appliquer) {
  const { rowCount } = await client.query(
    `update clientes set rappels_infobip = $1 where id = any($2)`,
    [vers, concernees.map((c) => c.id)],
  );
  console.log("");
  console.log(`Applique : ${rowCount} fiche(s) mise(s) a jour.`);
} else {
  console.log("");
  console.log("Apercu seulement. Relancer avec --appliquer pour ecrire.");
}

await client.end();
