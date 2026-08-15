/**
 * Envoi d un seul message de test par Infobip, vers un numero choisi.
 *
 * Sert a valider la configuration avant de basculer la moindre cliente : cle,
 * expediteur, nom du modele, langue et forme de la charge utile. Le message
 * part reellement, d ou le numero obligatoire en argument.
 *
 *   node scripts/tester-infobip.mjs +2250709646096
 *   node scripts/tester-infobip.mjs +2250709646096 rappel_rdv_soin
 *
 * Lit INFOBIP_API_KEY, INFOBIP_BASE_URL et INFOBIP_SENDER dans .env.local.
 * La cle n est jamais affichee.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Lecture minimale de .env.local : pas de dependance pour trois variables. */
function lireEnv() {
  const env = {};
  let brut;
  try {
    brut = readFileSync(join(racine, ".env.local"), "utf8");
  } catch {
    console.error("Fichier .env.local introuvable.");
    process.exit(1);
  }
  for (const ligne of brut.split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = lireEnv();
const cle = env.INFOBIP_API_KEY;
const base = env.INFOBIP_BASE_URL;
const expediteur = env.INFOBIP_SENDER;

const manquantes = ["INFOBIP_API_KEY", "INFOBIP_BASE_URL", "INFOBIP_SENDER"].filter(
  (v) => !env[v],
);
if (manquantes.length) {
  console.error(`Manquant dans .env.local : ${manquantes.join(", ")}`);
  process.exit(1);
}

const destinataire = process.argv[2];
const modele = process.argv[3] ?? "rappel_rdv";
if (!destinataire) {
  console.error("Usage : node scripts/tester-infobip.mjs <numero> [modele]");
  process.exit(1);
}

// Un jeu de variables par modele, dans l ordre attendu.
const VARIABLES = {
  rappel_rdv: ["Essai Chic Africa", "aujourd'hui à 14:00"],
  rappel_rdv_soin: ["Essai Chic Africa", "aujourd'hui à 14:00", "Soin hydrafacial"],
  rappel_rdv_fidelite: ["Essai Chic Africa", "aujourd'hui à 14:00", "5"],
  rappel_rdv_soin_remise: [
    "Essai Chic Africa",
    "aujourd'hui à 14:00",
    "Soin hydrafacial",
    "5",
  ],
  anniversaire_cliente: ["Essai Chic Africa"],
  promotion: [
    "Essai Chic Africa",
    "Jusqu'au 30 août, notre Soin du visage et du corps est à -15 % : 34 000 FCFA au lieu de 40 000 FCFA.",
  ],
  recapitulatif_gerante: [
    "Essai",
    "lundi 10 août",
    "2 — 09:00 Cissé Bintou, Soin classique ⚠️ · 11:30 Mariam Kanté, Soin hydrafacial 🎁",
    "1 contre-indication à vérifier, 1 remise fidélité",
  ],
};

const placeholders = VARIABLES[modele];
if (!placeholders) {
  console.error(`Modele inconnu : ${modele}. Connus : ${Object.keys(VARIABLES).join(", ")}`);
  process.exit(1);
}

const chiffres = (s) => s.replace(/\D/g, "");
const hote = base.replace(/^https?:\/\//, "").replace(/\/+$/, "");

console.log(`Modele       ${modele}`);
console.log(`Variables    ${placeholders.join(" | ")}`);
console.log(`Expediteur   ${chiffres(expediteur)}`);
console.log(`Destinataire ${chiffres(destinataire)}`);
console.log("");

const reponse = await fetch(`https://${hote}/whatsapp/1/message/template`, {
  method: "POST",
  headers: {
    Authorization: `App ${cle}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    messages: [
      {
        from: chiffres(expediteur),
        to: chiffres(destinataire),
        content: {
          templateName: modele,
          templateData: { body: { placeholders } },
          language: "fr",
        },
      },
    ],
  }),
});

const corps = await reponse.text();
console.log(`HTTP ${reponse.status}`);
try {
  console.log(JSON.stringify(JSON.parse(corps), null, 2));
} catch {
  console.log(corps);
}
