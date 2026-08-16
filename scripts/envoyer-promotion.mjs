/**
 * Envoi d une promotion aux clientes, par le modele Infobip « promotion ».
 *
 * Un script et non un ecran : une campagne part rarement, touche tout le
 * fichier d un coup et ne se rattrape pas. Mieux vaut une commande qui montre
 * la liste et exige --appliquer qu un bouton qu on presse par megarde.
 *
 *   node scripts/envoyer-promotion.mjs "Jusqu au 30 aout, ..."
 *   node scripts/envoyer-promotion.mjs "..." --toutes
 *   node scripts/envoyer-promotion.mjs "..." --test +2250709646096
 *   node scripts/envoyer-promotion.mjs "..." --appliquer
 *
 * Par defaut la cible est --venues : les clientes ayant au moins une seance.
 * Une promotion envoyee a qui n est jamais venue ressemble a du demarchage,
 * et c est ce qui fait signaler un message — donc baisser la note de qualite
 * du numero qui porte aussi les rappels de rendez-vous.
 *
 * Lit .db-url.txt pour la liste et .env.local pour les acces Infobip.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const toutes = args.includes("--toutes");
const iTest = args.indexOf("--test");
const numeroTest = iTest === -1 ? null : args[iTest + 1];

// Le texte peut venir d un fichier : passer des accents en argument depuis
// PowerShell les deforme selon la page de code, et la deformation ne se voit
// qu une fois le message arrive chez la cliente.
const iFichier = args.indexOf("--fichier");
const cheminTexte = iFichier === -1 ? null : args[iFichier + 1];
const texte = cheminTexte
  ? readFileSync(cheminTexte, "utf8").trim()
  : args.find((a) => !a.startsWith("--") && a !== numeroTest && a !== cheminTexte);

if (!texte) {
  console.error('Usage : node scripts/envoyer-promotion.mjs "<texte de l offre>" [options]');
  process.exit(1);
}

// Une variable de modele n accepte ni retour a la ligne ni tabulation, et ne
// peut jamais etre vide. Se tromper ici donne un rejet distant illisible.
if (/[\n\r\t]/.test(texte)) {
  console.error("Le texte doit tenir sur une seule ligne : pas de retour a la ligne.");
  process.exit(1);
}
if (texte.trim().length < 20) {
  console.error("Texte trop court : ce serait un message vide de sens.");
  process.exit(1);
}

function lireEnv() {
  const env = {};
  for (const ligne of readFileSync(join(racine, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = lireEnv();
const manquantes = ["INFOBIP_API_KEY", "INFOBIP_BASE_URL", "INFOBIP_SENDER"].filter(
  (v) => !env[v],
);
if (manquantes.length) {
  console.error(`Manquant dans .env.local : ${manquantes.join(", ")}`);
  process.exit(1);
}

const hote = env.INFOBIP_BASE_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const chiffres = (s) => String(s).replace(/\D/g, "");

async function unEnvoi(destinataire, nom) {
  const reponse = await fetch(`https://${hote}/whatsapp/1/message/template`, {
    method: "POST",
    headers: {
      Authorization: `App ${env.INFOBIP_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          from: chiffres(env.INFOBIP_SENDER),
          to: chiffres(destinataire),
          content: {
            templateName: "promotion",
            templateData: { body: { placeholders: [nom, texte] } },
            language: "fr",
          },
        },
      ],
    }),
  });
  const corps = await reponse.text();
  if (!reponse.ok) return { ok: false, erreur: `Infobip ${reponse.status} ${corps.slice(0, 160)}` };
  try {
    const statut = JSON.parse(corps)?.messages?.[0]?.status;
    if (statut?.groupName === "REJECTED") {
      return { ok: false, erreur: `rejet ${statut.name ?? ""} ${statut.description ?? ""}`.trim() };
    }
  } catch {
    // 200 sans corps lisible : on ne transforme pas ce doute en echec.
  }
  return { ok: true };
}

/**
 * Un alea reseau ne doit pas emporter la campagne.
 *
 * La premiere version laissait l exception de fetch remonter : un ECONNRESET
 * sur le premier destinataire a tue le script avant meme d ecrire au journal,
 * sans qu on puisse savoir si le message etait parti. L exception est
 * desormais rattrapee, reessayee une fois, puis consignee comme un echec
 * ordinaire — la campagne continue.
 */
async function envoyer(destinataire, nom) {
  for (let essai = 1; essai <= 2; essai += 1) {
    try {
      return await unEnvoi(destinataire, nom);
    } catch (e) {
      const motif = e instanceof Error ? e.message : "erreur reseau";
      if (essai === 2) return { ok: false, erreur: `reseau : ${motif}` };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, erreur: "reseau" };
}

const client = new pg.Client({
  connectionString: readFileSync(join(racine, ".db-url.txt"), "utf8").trim(),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Un essai vers un seul numero, sans toucher a la base ni au journal.
if (numeroTest) {
  console.log(`Essai vers ${numeroTest}`);
  console.log(`  {{1}} Essai Chic Africa`);
  console.log(`  {{2}} ${texte}`);
  if (!appliquer) {
    console.log("\nApercu seulement. Relancer avec --appliquer pour envoyer.");
    await client.end();
    process.exit(0);
  }
  const r = await envoyer(numeroTest, "Essai Chic Africa");
  console.log(r.ok ? "Envoye." : `ECHEC : ${r.erreur}`);
  await client.end();
  process.exit(r.ok ? 0 : 1);
}

const { rows: cibles } = await client.query(
  `select c.id, c.nom_complet, c.prenom_usuel, c.telephone
   from clientes c
   where c.actif
     and c.rappels_whatsapp
     and c.promotions_whatsapp
     and c.rappels_infobip
     ${toutes ? "" : "and exists (select 1 from seances s where s.cliente_id = c.id)"}
   order by c.nom_complet`,
);

const jour = new Date().toISOString().slice(0, 10);
const { rows: deja } = await client.query(
  `select destinataire from notifications_envoyees
   where type = 'promotion' and cle_jour = $1 and succes`,
  [jour],
);
const envoyes = new Set(deja.map((d) => d.destinataire));
const restants = cibles.filter((c) => !envoyes.has(c.telephone));

console.log(`Cible : ${toutes ? "toutes les clientes" : "clientes deja venues"}`);
console.log(`Destinataires : ${restants.length}${envoyes.size ? ` (${envoyes.size} deja servies aujourd hui)` : ""}`);
console.log("");
console.log("Message :");
console.log(`  Bonjour <nom> 🌸 ... ${texte} ...`);
console.log("");
for (const c of restants.slice(0, 10)) {
  console.log(`  ${(c.prenom_usuel || c.nom_complet).padEnd(30)} ${c.telephone}`);
}
if (restants.length > 10) console.log(`  ... et ${restants.length - 10} autres`);

if (!appliquer) {
  console.log("");
  console.log("Apercu seulement. Relancer avec --appliquer pour envoyer.");
  await client.end();
  process.exit(0);
}

let ok = 0;
let echecs = 0;
for (const c of restants) {
  const nom = c.prenom_usuel?.trim() || c.nom_complet;
  const r = await envoyer(c.telephone, nom);
  await client.query(
    `insert into notifications_envoyees (type, cle_jour, destinataire, succes, detail, canal)
     values ('promotion', $1, $2, $3, $4, 'infobip')`,
    [jour, c.telephone, r.ok, r.erreur ?? null],
  );
  if (r.ok) ok += 1;
  else {
    echecs += 1;
    console.log(`  ECHEC ${nom} ${c.telephone} : ${r.erreur}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

console.log("");
console.log(`Envoyes : ${ok}   Echecs : ${echecs}`);
await client.end();
