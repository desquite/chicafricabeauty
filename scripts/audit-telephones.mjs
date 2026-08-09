/**
 * Audit des numeros de telephone : lesquels ne peuvent pas recevoir un
 * message, et lesquels risquent de designer deux fois la meme personne.
 *
 * Les numeros ne sont volontairement pas normalises en base : de vrais
 * numeros etrangers y cotoient des numeros ivoiriens, et prefixer +225
 * automatiquement les casserait. Ce script ne corrige donc rien, il signale.
 *
 *   node scripts/audit-telephones.mjs
 *
 * Cote d Ivoire depuis 2021 : 10 chiffres, prefixes 01 05 07 (mobile) et
 * 21 25 27 (fixe). En international : 225 suivi de ces 10 chiffres, soit 13.
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

const PREFIXES_CI = ["01", "05", "07", "21", "25", "27"];

/** Renvoie null si le numero est utilisable, sinon la raison du rejet. */
function diagnostiquer(brut) {
  if (!brut || !brut.trim()) return "vide";

  // Tout ce qui n est ni chiffre ni ponctuation de mise en forme est suspect :
  // un # ou une lettre vient d une faute de frappe, pas d un format.
  if (/[^\d\s+()\-.]/.test(brut)) return "caractere interdit";

  const c = brut.replace(/\D/g, "");
  if (c.length < 8) return "trop court";
  if (c.length > 15) return "trop long";

  if (c.startsWith("225")) {
    const local = c.slice(3);
    if (local.length !== 10) return `CI mais ${local.length} chiffres au lieu de 10`;
    if (!PREFIXES_CI.includes(local.slice(0, 2))) {
      return `prefixe CI inconnu (${local.slice(0, 2)})`;
    }
    return null;
  }

  // Numero local ivoirien saisi sans indicatif : 10 chiffres commencant par 0.
  if (c.length === 10 && c.startsWith("0")) return "sans indicatif pays";

  // Reste : un numero etranger, plausible mais invérifiable ici.
  return { avertissement: `etranger (+${c.slice(0, 2)}...)` };
}

const { rows: clientes } = await client.query(`
  select c.id, c.nom_complet, c.telephone, c.actif, c.rappels_whatsapp,
         (select min(r.date_rdv)::text from rendez_vous r
           where r.cliente_id = c.id and r.date_rdv >= current_date
             and r.statut = 'prevu' and r.remplace_par is null
             and r.masque_le is null) as prochain_rdv
  from clientes c order by c.nom_complet
`);

const { rows: staff } = await client.query(
  `select nom, telephone, notifications_whatsapp from profiles where telephone is not null`,
);

const casses = [];
const etrangers = [];

for (const c of clientes) {
  const d = diagnostiquer(c.telephone);
  if (d === null) continue;
  if (typeof d === "object") etrangers.push({ ...c, motif: d.avertissement });
  else casses.push({ ...c, motif: d });
}

console.log(`CLIENTES : ${clientes.length} fiches`);
console.log("");
console.log(`Numeros inutilisables : ${casses.length}`);
if (casses.length) {
  console.log("NOM                             TELEPHONE          MOTIF                     PROCHAIN RDV");
  for (const c of casses) {
    console.log(
      `${c.nom_complet.padEnd(31)} ${String(c.telephone).padEnd(18)} ` +
        `${c.motif.padEnd(25)} ${c.prochain_rdv ?? "-"}` +
        `${c.rappels_whatsapp ? "" : "  (rappels coupes)"}`,
    );
  }
}

console.log("");
console.log(`Numeros etrangers, a confirmer : ${etrangers.length}`);
for (const c of etrangers) {
  console.log(
    `${c.nom_complet.padEnd(31)} ${String(c.telephone).padEnd(18)} ${c.motif.padEnd(25)} ${c.prochain_rdv ?? "-"}`,
  );
}

// Doublons : la contrainte d unicite porte sur la chaine, pas sur les chiffres.
// « 0777918102 » et « +2250777918102 » sont donc deux fiches pour une personne.
const parFin = new Map();
for (const c of clientes) {
  const cle = String(c.telephone).replace(/\D/g, "").slice(-8);
  if (cle.length < 8) continue;
  parFin.set(cle, [...(parFin.get(cle) ?? []), c]);
}
const doublons = [...parFin.entries()].filter(([, v]) => v.length > 1);

console.log("");
console.log(`Fiches partageant les 8 derniers chiffres : ${doublons.length}`);
for (const [cle, v] of doublons) {
  console.log(`  ...${cle}`);
  for (const c of v) {
    console.log(`     ${c.nom_complet.padEnd(31)} ${c.telephone} ${c.actif ? "" : "(archivee)"}`);
  }
}

console.log("");
console.log("GERANTES");
for (const s of staff) {
  const d = diagnostiquer(s.telephone);
  const etat = d === null ? "ok" : typeof d === "object" ? d.avertissement : d;
  console.log(
    `  ${s.nom.padEnd(20)} ${String(s.telephone).padEnd(18)} ${etat}` +
      `${s.notifications_whatsapp ? "" : "  (notifications coupees)"}`,
  );
}

await client.end();
