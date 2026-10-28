/**
 * Liste les boutiques (stores) du compte Jèko, pour trouver JEKO_STORE_ID.
 *
 *   node scripts/boutiques-jeko.mjs
 *
 * Lit JEKO_API_KEY et JEKO_API_KEY_ID dans .env.local ; n'affiche jamais les clés.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(racine, ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

if (!env.JEKO_API_KEY || !env.JEKO_API_KEY_ID) {
  console.error("JEKO_API_KEY ou JEKO_API_KEY_ID manquant dans .env.local");
  process.exit(1);
}

const r = await fetch("https://api.jeko.africa/partner_api/stores", {
  headers: { "X-API-KEY": env.JEKO_API_KEY, "X-API-KEY-ID": env.JEKO_API_KEY_ID },
});
const corps = await r.text();
if (!r.ok) {
  console.error(`Jèko ${r.status} ${corps.slice(0, 300)}`);
  process.exit(1);
}
const json = JSON.parse(corps);
const liste = Array.isArray(json) ? json : (json.data ?? json.stores ?? [json]);
for (const s of liste) console.log(`${s.id}  ${s.name ?? s.storeName ?? ""}`);
