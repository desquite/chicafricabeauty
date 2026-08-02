/**
 * Rattache un compte Supabase Auth au personnel de l'institut.
 *
 * Un compte Auth seul ne donne aucun acces : il faut une ligne profiles
 * active. Ce script cree ou met a jour cette ligne.
 *
 *   node scripts/habiliter.mjs                                   liste les comptes
 *   node scripts/habiliter.mjs email@exemple.com "Nom Prenom" gerante +2250700000000
 *   node scripts/habiliter.mjs email@exemple.com "Nom Prenom"    -> estheticienne
 *
 * Le telephone est celui du recapitulatif WhatsApp quotidien. Il est
 * normalise a lindicatif +225 sil est donne au format local.
 *
 * Le compte doit exister au prealable, cree depuis Supabase >
 * Authentication > Add user. Ce script ne cree pas de compte et ne
 * manipule aucun mot de passe.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const [email, nom, role = "estheticienne", telephoneBrut] = process.argv.slice(2);

/** 0709646096 -> +2250709646096 ; un numero deja international est garde tel quel. */
function normaliserTelephone(brut) {
  if (!brut) return null;
  const propre = brut.replace(/[\s()-]/g, "");
  if (propre.startsWith("+")) return propre;
  if (propre.startsWith("00")) return `+${propre.slice(2)}`;
  if (propre.startsWith("225")) return `+${propre}`;
  return `+225${propre}`;
}

if (email && !nom) {
  console.error(
    'Usage : node scripts/habiliter.mjs <email> "<nom>" [gerante|estheticienne]',
  );
  process.exit(1);
}
if (nom && !["gerante", "estheticienne"].includes(role)) {
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

// Sans argument : etat des comptes Auth et de leur habilitation.
if (!email) {
  const { rows } = await client.query(
    `select u.email,
            u.email_confirmed_at is not null as confirme,
            p.nom, p.role, p.actif, p.telephone, p.notifications_whatsapp
     from auth.users u
     left join profiles p on p.id = u.id
     order by u.created_at`,
  );
  if (rows.length === 0) {
    console.log("Aucun compte Auth. En creer depuis Authentication > Add user.");
  }
  for (const u of rows) {
    const habilitation = u.nom
      ? `${u.nom} (${u.role}${u.actif ? "" : ", inactif"})`
      : "NON HABILITE";
    const rappel = u.telephone
      ? `${u.telephone}${u.notifications_whatsapp ? "" : " (notifications coupees)"}`
      : "pas de telephone";
    console.log(
      `${u.email.padEnd(26)} ${habilitation.padEnd(28)} ${rappel}`,
    );
  }
  await client.end();
  process.exit(0);
}

const telephone = normaliserTelephone(telephoneBrut);

const { rows } = await client.query(
  `insert into profiles (id, nom, role, actif, telephone)
   select id, $2, $3, true, $4 from auth.users where email = $1
   on conflict (id) do update
     set nom = excluded.nom,
         role = excluded.role,
         actif = true,
         -- Un appel sans telephone ne doit pas effacer celui deja enregistre.
         telephone = coalesce(excluded.telephone, profiles.telephone)
   returning id, nom, role, telephone`,
  [email, nom, role, telephone],
);

if (rows.length === 0) {
  console.error(
    `Aucun compte Auth pour ${email}.\n` +
      `Le creer depuis Supabase > Authentication > Add user, puis relancer.`,
  );
  await client.end();
  process.exit(1);
}

console.log(
  `Habilite : ${rows[0].nom} (${rows[0].role}) telephone=${rows[0].telephone ?? "aucun"}`,
);
await client.end();
