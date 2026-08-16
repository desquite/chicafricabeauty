/**
 * Ce que l API Infobip expose sur les modeles WhatsApp de ce compte.
 *
 * Sert a repondre sans deviner : quels modeles existent, sous quel
 * identifiant, et quelles operations le compte autorise.
 *
 *   node scripts/modeles-infobip.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const l of readFileSync(join(racine, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const hote = env.INFOBIP_BASE_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const expediteur = String(env.INFOBIP_SENDER).replace(/\D/g, "");

const CHEMINS = [
  `/whatsapp/2/senders/${expediteur}/templates`,
  `/whatsapp/1/senders/${expediteur}/templates`,
  `/whatsapp/2/templates`,
];

for (const chemin of CHEMINS) {
  const r = await fetch(`https://${hote}${chemin}`, {
    headers: { Authorization: `App ${env.INFOBIP_API_KEY}`, Accept: "application/json" },
  });
  const corps = await r.text();
  console.log(`GET ${chemin} -> ${r.status}`);
  if (!r.ok) {
    console.log(`     ${corps.slice(0, 160)}`);
    continue;
  }

  let j;
  try {
    j = JSON.parse(corps);
  } catch {
    console.log(corps.slice(0, 300));
    break;
  }

  const modeles = j.templates ?? j.results ?? [];
  console.log(`     ${modeles.length} modele(s)`);
  for (const m of modeles) {
    console.log(
      `     ${String(m.name ?? "").padEnd(26)} ${String(m.status ?? "").padEnd(12)} ` +
        `${String(m.category ?? "").padEnd(10)} id=${m.id ?? "-"}`,
    );
    const corpsModele = m.structure?.body ?? m.body ?? null;
    if (corpsModele) {
      console.log(`        ${String(corpsModele).replace(/\n/g, " / ").slice(0, 200)}`);
    }
  }
  break;
}
