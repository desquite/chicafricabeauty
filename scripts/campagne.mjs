/**
 * Campagnes recurrentes : creation, liste, arret.
 *
 * L envoi lui-meme est porte par le cron quotidien : chaque matin il regarde
 * s il existe une campagne active dont le jour de la semaine tombe
 * aujourd hui, et sert les clientes qui n ont pas encore recu.
 *
 *   node scripts/campagne.mjs                          liste
 *   node scripts/campagne.mjs --creer "Soin -15%" --fichier promo.txt --fin 2026-08-30
 *   node scripts/campagne.mjs --arreter <id>
 *
 * Options de creation :
 *   --cible venues|toutes   defaut venues
 *   --jour 0..6             defaut le jour de la semaine courant (0 = dimanche)
 *   --debut AAAA-MM-JJ      defaut aujourd hui
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i === -1 ? null : args[i + 1];
};

const client = new pg.Client({
  connectionString: readFileSync(join(racine, ".db-url.txt"), "utf8").trim(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const arreter = valeur("--arreter");
if (arreter) {
  const { rowCount } = await client.query(
    "update campagnes set actif = false where id = $1",
    [arreter],
  );
  console.log(rowCount ? "Campagne arretee." : "Aucune campagne avec cet identifiant.");
  await client.end();
  process.exit(0);
}

const libelle = valeur("--creer");
if (libelle) {
  const fichier = valeur("--fichier");
  const texte = fichier
    ? readFileSync(fichier, "utf8").trim()
    : valeur("--texte");
  const fin = valeur("--fin");

  // Texte facultatif : sans lui, l offre est ecrite en dur dans le modele
  // approuve, qui n a alors qu une seule variable — le nom de la cliente.
  if (texte && /[\n\r\t]/.test(texte)) {
    console.error("Le texte doit tenir sur une seule ligne : pas de retour a la ligne.");
    process.exit(1);
  }
  if (!fin || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    console.error("Date de fin manquante : --fin AAAA-MM-JJ");
    process.exit(1);
  }

  const { rows: [c] } = await client.query(
    `insert into campagnes (libelle, texte, cible, jour_semaine, debut, fin, modele)
     values ($1, $2, $3,
             coalesce($4::int, extract(dow from current_date)::int),
             coalesce($5::date, current_date), $6::date,
             coalesce($7::text, 'promotion'))
     returning id, jour_semaine, debut::text, fin::text, cible, modele`,
    [
      libelle,
      texte,
      valeur("--cible") ?? "venues",
      valeur("--jour"),
      valeur("--debut"),
      fin,
      valeur("--modele"),
    ],
  );

  console.log(`Campagne creee : ${c.id}`);
  console.log(`  chaque ${JOURS[c.jour_semaine]}, du ${c.debut} au ${c.fin}, cible ${c.cible}`);
  console.log(`  modele ${c.modele}`);
  console.log(`  texte : ${texte ?? "(dans le modele)"}`);
  await client.end();
  process.exit(0);
}

const { rows } = await client.query(`
  select id, libelle, cible, jour_semaine, debut::text, fin::text, actif,
         (actif and current_date between debut and fin) as en_cours
  from campagnes order by created_at desc
`);

if (rows.length === 0) {
  console.log("Aucune campagne.");
} else {
  for (const c of rows) {
    const etat = !c.actif ? "arretee" : c.en_cours ? "en cours" : "hors periode";
    console.log(`${c.id}  ${etat.padEnd(12)} ${c.libelle}`);
    console.log(`  chaque ${JOURS[c.jour_semaine]}, du ${c.debut} au ${c.fin}, cible ${c.cible}`);
  }
}

const { rows: envois } = await client.query(`
  select cle_jour::text as jour, count(*)::int as n,
         count(*) filter (where not succes)::int as echecs
  from notifications_envoyees where type = 'promotion'
  group by cle_jour order by cle_jour desc limit 5
`);
if (envois.length) {
  console.log("");
  console.log("Derniers envois promotionnels :");
  for (const e of envois) {
    console.log(`  ${e.jour}  ${e.n} message(s)${e.echecs ? `, ${e.echecs} echec(s)` : ""}`);
  }
}

await client.end();
