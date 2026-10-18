/**
 * Indicatifs téléphoniques internationaux, pour la saisie du numéro sur la
 * page de réservation. +225 (Côte d'Ivoire) par défaut.
 *
 * Seuls le code pays ISO et l'indicatif sont écrits ici : le nom du pays en
 * français vient d'Intl.DisplayNames, qui le connaît mieux qu'une liste
 * recopiée à la main.
 */

export type Indicatif = { iso: string; indicatif: string };

export const INDICATIF_DEFAUT = "225";

/** En tête de liste : la Côte d'Ivoire et ses voisins, puis la diaspora. */
const FREQUENTS = ["CI", "BF", "ML", "GN", "LR", "GH", "SN", "TG", "BJ", "NE", "CM", "FR", "BE", "CA", "US"];

const LISTE: [string, string][] = [
  ["AF", "93"], ["ZA", "27"], ["AL", "355"], ["DZ", "213"], ["DE", "49"], ["AD", "376"],
  ["AO", "244"], ["AG", "1268"], ["SA", "966"], ["AR", "54"], ["AM", "374"], ["AU", "61"],
  ["AT", "43"], ["AZ", "994"], ["BS", "1242"], ["BH", "973"], ["BD", "880"], ["BB", "1246"],
  ["BE", "32"], ["BZ", "501"], ["BJ", "229"], ["BT", "975"], ["BY", "375"], ["MM", "95"],
  ["BO", "591"], ["BA", "387"], ["BW", "267"], ["BR", "55"], ["BN", "673"], ["BG", "359"],
  ["BF", "226"], ["BI", "257"], ["KH", "855"], ["CM", "237"], ["CA", "1"], ["CV", "238"],
  ["CF", "236"], ["CL", "56"], ["CN", "86"], ["CY", "357"], ["CO", "57"], ["KM", "269"],
  ["CG", "242"], ["CD", "243"], ["KR", "82"], ["KP", "850"], ["CR", "506"], ["CI", "225"],
  ["HR", "385"], ["CU", "53"], ["DK", "45"], ["DJ", "253"], ["DM", "1767"], ["DO", "1809"],
  ["EG", "20"], ["AE", "971"], ["EC", "593"], ["ER", "291"], ["ES", "34"], ["EE", "372"],
  ["SZ", "268"], ["US", "1"], ["ET", "251"], ["FJ", "679"], ["FI", "358"], ["FR", "33"],
  ["GA", "241"], ["GM", "220"], ["GE", "995"], ["GH", "233"], ["GR", "30"], ["GD", "1473"],
  ["GT", "502"], ["GN", "224"], ["GQ", "240"], ["GW", "245"], ["GY", "592"], ["HT", "509"],
  ["HN", "504"], ["HK", "852"], ["HU", "36"], ["IN", "91"], ["ID", "62"], ["IQ", "964"],
  ["IR", "98"], ["IE", "353"], ["IS", "354"], ["IL", "972"], ["IT", "39"], ["JM", "1876"],
  ["JP", "81"], ["JO", "962"], ["KZ", "7"], ["KE", "254"], ["KG", "996"], ["KI", "686"],
  ["KW", "965"], ["LA", "856"], ["LS", "266"], ["LV", "371"], ["LB", "961"], ["LR", "231"],
  ["LY", "218"], ["LI", "423"], ["LT", "370"], ["LU", "352"], ["MO", "853"], ["MK", "389"],
  ["MG", "261"], ["MY", "60"], ["MW", "265"], ["MV", "960"], ["ML", "223"], ["MT", "356"],
  ["MA", "212"], ["MH", "692"], ["MU", "230"], ["MR", "222"], ["MX", "52"], ["FM", "691"],
  ["MD", "373"], ["MC", "377"], ["MN", "976"], ["ME", "382"], ["MZ", "258"], ["NA", "264"],
  ["NR", "674"], ["NP", "977"], ["NI", "505"], ["NE", "227"], ["NG", "234"], ["NO", "47"],
  ["NZ", "64"], ["OM", "968"], ["UG", "256"], ["UZ", "998"], ["PK", "92"], ["PW", "680"],
  ["PS", "970"], ["PA", "507"], ["PG", "675"], ["PY", "595"], ["NL", "31"], ["PE", "51"],
  ["PH", "63"], ["PL", "48"], ["PT", "351"], ["QA", "974"], ["RO", "40"], ["GB", "44"],
  ["RU", "7"], ["RW", "250"], ["KN", "1869"], ["SM", "378"], ["VC", "1784"], ["LC", "1758"],
  ["SB", "677"], ["SV", "503"], ["WS", "685"], ["ST", "239"], ["SN", "221"], ["RS", "381"],
  ["SC", "248"], ["SL", "232"], ["SG", "65"], ["SK", "421"], ["SI", "386"], ["SO", "252"],
  ["SD", "249"], ["SS", "211"], ["LK", "94"], ["SE", "46"], ["CH", "41"], ["SR", "597"],
  ["SY", "963"], ["TJ", "992"], ["TW", "886"], ["TZ", "255"], ["TD", "235"], ["CZ", "420"],
  ["TH", "66"], ["TL", "670"], ["TG", "228"], ["TO", "676"], ["TT", "1868"], ["TN", "216"],
  ["TM", "993"], ["TR", "90"], ["TV", "688"], ["UA", "380"], ["UY", "598"], ["VU", "678"],
  ["VA", "379"], ["VE", "58"], ["VN", "84"], ["YE", "967"], ["ZM", "260"], ["ZW", "263"],
  ["RE", "262"], ["GP", "590"], ["MQ", "596"], ["GF", "594"], ["YT", "262"], ["PF", "689"],
  ["NC", "687"], ["PR", "1787"],
];

let noms: Intl.DisplayNames | null = null;

export function nomPays(iso: string) {
  try {
    noms ??= new Intl.DisplayNames(["fr"], { type: "region" });
    return noms.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

/** Fréquents d'abord, puis tous les pays dans l'ordre alphabétique français. */
export function listeIndicatifs() {
  const tous = LISTE.map(([iso, indicatif]) => ({ iso, indicatif, nom: nomPays(iso) }));
  const tri = new Intl.Collator("fr");
  const frequents = FREQUENTS.map((iso) => tous.find((p) => p.iso === iso)!).filter(Boolean);
  const autres = tous
    .filter((p) => !FREQUENTS.includes(p.iso))
    .sort((a, b) => tri.compare(a.nom, b.nom));
  return { frequents, autres };
}

const INDICATIFS_CONNUS = new Set(LISTE.map(([, i]) => i));

/**
 * Numéro saisi sur la page, avec son indicatif, mis en forme pour la fiche.
 *
 *   +225  10 chiffres, le zéro initial fait partie du numéro (07 00 00 00 00)
 *   autre 6 à 14 chiffres ; un zéro initial de format national est retiré
 *         (06 12 34 56 78 en France devient +33 6 12 34 56 78), sauf en
 *         Italie où il fait partie du numéro
 *
 * Rend les chiffres internationaux (pour WhatsApp) et la forme affichée, ou
 * null si le numéro n'est pas valable.
 */
export function normaliserNumero(indicatif: string, saisie: string) {
  if (!INDICATIFS_CONNUS.has(indicatif)) return null;
  let c = saisie.replace(/\D/g, "");
  // Indicatif retapé dans le champ : « 225 07 … » ou « 00225 07 … ».
  if (c.startsWith(`00${indicatif}`)) c = c.slice(indicatif.length + 2);
  else if (c.startsWith(indicatif) && c.length > indicatif.length + 6 && indicatif !== "225") {
    c = c.slice(indicatif.length);
  } else if (indicatif === "225" && c.length === 13 && c.startsWith("225")) c = c.slice(3);

  if (indicatif === "225") {
    if (!/^\d{10}$/.test(c)) return null;
    return { international: `225${c}`, affiche: `+225 ${c.match(/.{2}/g)!.join(" ")}` };
  }

  if (c.startsWith("0") && indicatif !== "39") c = c.slice(1);
  if (!/^\d{6,14}$/.test(c) || indicatif.length + c.length > 15) return null;
  // Par deux en partant de la droite : 6 12 34 56 78, pas 61 23 45 67 8.
  const groupes = (c.length % 2 ? [c[0], ...(c.slice(1).match(/.{2}/g) ?? [])] : c.match(/.{2}/g)!).join(" ");
  return { international: `${indicatif}${c}`, affiche: `+${indicatif} ${groupes}` };
}
