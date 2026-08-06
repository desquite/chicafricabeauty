/**
 * Rattrapage des liens entre seances et agenda, pour les seances saisies
 * avant que ces liens n'existent.
 *
 * Deux manques :
 *   1. un rendez-vous honore est reste "prevu", faute de lien vers la seance ;
 *   2. une date de prochain rendez-vous posee en fin de seance n'a jamais
 *      donne d'entree d'agenda, donc aucun rappel.
 *
 * N'ecrit rien sans --appliquer. Sans option, il se contente d'afficher ce
 * qu'il ferait.
 *
 *   node scripts/rattraper-rdv.mjs
 *   node scripts/rattraper-rdv.mjs --appliquer
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const appliquer = process.argv.includes("--appliquer");
const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = readFileSync(join(racine, ".db-url.txt"), "utf8").trim();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const jour = (d) => new Date(d).toISOString().slice(0, 10).split("-").reverse().join("/");

// --------------------------------------------------- 1. rendez-vous honores
// Une seance le jour meme d'un rendez-vous prevu, pour la meme cliente : la
// cliente est donc venue. Les rendez-vous annules ou marques absente ne sont
// pas touches, c'est une correction de statut oublie, pas une reecriture.
const { rows: aHonorer } = await client.query(`
  select r.id as rdv_id, r.date_rdv, c.nom_complet, s.id as seance_id
  from rendez_vous r
  join clientes c on c.id = r.cliente_id
  join lateral (
    select s.id
    from seances s
    where s.cliente_id = r.cliente_id and s.date_seance = r.date_rdv
    order by s.created_at
    limit 1
  ) s on true
  where r.statut = 'prevu'
    and r.seance_id is null
    and r.remplace_par is null
    and r.masque_le is null
  order by r.date_rdv
`);

// Une seance ne peut honorer qu'un rendez-vous : deux rendez-vous le meme jour
// pour la meme cliente designeraient sinon la meme seance.
const seancesPrises = new Set();
const honorables = aHonorer.filter((r) => {
  if (seancesPrises.has(r.seance_id)) return false;
  seancesPrises.add(r.seance_id);
  return true;
});

console.log(`Rendez-vous restes "prevu" alors que la seance existe : ${honorables.length}`);
for (const r of honorables) {
  console.log(`  ${jour(r.date_rdv)}  ${r.nom_complet}`);
}

if (appliquer) {
  for (const r of honorables) {
    await client.query(
      `update rendez_vous set statut = 'honore', seance_id = $1 where id = $2`,
      [r.seance_id, r.rdv_id],
    );
  }
}

// ------------------------------------------ 2. prochains rendez-vous absents
// Uniquement les dates a venir : creer un rendez-vous "prevu" dans le passe
// le ferait compter comme jamais honore et fausserait le taux d'absence.
const { rows: aCreer } = await client.query(`
  select s.id, s.cliente_id, s.date_seance, s.prochain_rdv,
         s.praticienne_id, c.nom_complet
  from seances s
  join clientes c on c.id = s.cliente_id
  where s.prochain_rdv is not null
    and s.prochain_rdv >= current_date
    and not exists (
      select 1 from rendez_vous r
      where r.cliente_id = s.cliente_id
        and r.date_rdv = s.prochain_rdv
        and r.remplace_par is null
        and r.masque_le is null
    )
  order by s.prochain_rdv
`);

// Deux seances peuvent avoir pose la meme date pour la meme cliente.
const deja = new Set();
const creables = aCreer.filter((s) => {
  const cle = `${s.cliente_id}:${s.prochain_rdv}`;
  if (deja.has(cle)) return false;
  deja.add(cle);
  return true;
});

console.log("");
console.log(`Prochains rendez-vous a venir absents de l'agenda : ${creables.length}`);
for (const s of creables) {
  console.log(`  ${jour(s.prochain_rdv)}  ${s.nom_complet}`);
}

if (appliquer) {
  for (const s of creables) {
    await client.query(
      `insert into rendez_vous (cliente_id, date_rdv, notes, cree_par)
       values ($1, $2, $3, $4)`,
      [
        s.cliente_id,
        s.prochain_rdv,
        `Fixe en fin de seance du ${jour(s.date_seance)}`,
        s.praticienne_id,
      ],
    );
  }
}

console.log("");
console.log(
  appliquer
    ? "Applique."
    : "Apercu seulement. Relancer avec --appliquer pour ecrire.",
);

await client.end();
