import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { chiffreAffaires } from "@/lib/caisse-ca";
import { calculerFacture, fcfa, libelleMode, MODES_PAIEMENT } from "@/lib/caisse";
import { prixActuel } from "@/lib/caisse-lecture";
import { prixDuJour, type PrixSoin } from "@/lib/disponibilites";
import { envoyerMessageAcompte } from "@/lib/notifications/acompte";
import { envoyerRecuWhatsapp } from "@/lib/notifications/recu";
import { acompteDuRdv, CHAMPS_PRIX_SOIN, quandLisible } from "@/lib/regles-acompte";
import { conflitAgenda, enregistrerRdvAvec } from "@/lib/rdv-saisie";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Outils de l'assistant des gérantes.
 *
 * Les outils de lecture répondent tout de suite. Ceux d'écriture se font en
 * deux temps : `preparer` vérifie la demande et rédige le résumé que la
 * gérante confirme par « OUI » ; `executer` ne tourne qu'après ce OUI, avec
 * les mêmes arguments. Rien ne s'écrit sans confirmation.
 */

type Admin = ReturnType<typeof createAdminClient>;
export type Acteur = { id: string; nom: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jourLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dateValide = (s: string) => ISO.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
/** « 9h », « 9h30 », « 09:30 » → « 09:30 ». */
function heureNormale(s: string) {
  const m = s.trim().match(/^(\d{1,2})\s*[h:]\s*(\d{2})?$/i);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? "0");
  return hh < 24 && mm < 60 ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
}

function rafraichir(...chemins: string[]) {
  for (const c of chemins) {
    try {
      revalidatePath(c, "layout");
    } catch {
      // hors requête : les pages sont dynamiques, rien de grave
    }
  }
}

type Soin = PrixSoin & { id: string; libelle: string; duree_std: number | null; actif: boolean };
async function soin(admin: Admin, id: string) {
  const { data } = await admin
    .from("soins_catalogue")
    .select("id, libelle, duree_std, actif, " + CHAMPS_PRIX_SOIN)
    .eq("id", id)
    .maybeSingle<Soin>();
  return data;
}

type Produit = { id: string; nom: string; prix_vente: number; prix_promo: number | null; promo_fin: string | null; stock: number; actif: boolean };
async function produit(admin: Admin, id: string) {
  const { data } = await admin
    .from("produits")
    .select("id, nom, prix_vente, prix_promo, promo_fin, stock, actif")
    .eq("id", id)
    .maybeSingle<Produit>();
  return data;
}

type Cliente = { id: string; nom_complet: string; telephone: string | null };
async function cliente(admin: Admin, id: string) {
  const { data } = await admin.from("clientes").select("id, nom_complet, telephone").eq("id", id).maybeSingle<Cliente>();
  return data;
}

type Rdv = {
  id: string;
  cliente_id: string;
  date_rdv: string;
  heure_rdv: string | null;
  duree_min: number | null;
  soin_id: string | null;
  notes: string | null;
  statut: string;
  remplace_par: string | null;
  code_acompte: string | null;
  acompte_requis: boolean;
  acompte_paye_le: string | null;
  clientes: { nom_complet: string } | null;
  soins_catalogue: ({ libelle: string; duree_std: number | null } & PrixSoin) | null;
};
async function rdv(admin: Admin, id: string) {
  const { data } = await admin
    .from("rendez_vous")
    .select(
      "id, cliente_id, date_rdv, heure_rdv, duree_min, soin_id, notes, statut, remplace_par, code_acompte, acompte_requis, acompte_paye_le, " +
        "clientes(nom_complet), soins_catalogue(libelle, duree_std, " + CHAMPS_PRIX_SOIN + ")",
    )
    .eq("id", id)
    .maybeSingle<Rdv>();
  return data;
}
const decrireRdv = (r: Rdv) =>
  `${r.clientes?.nom_complet ?? "cliente"} · ${r.soins_catalogue?.libelle ?? "soin non précisé"} · ${quandLisible(r.date_rdv, r.heure_rdv)}`;

/* ------------------------------------------------------------ Définitions */

type Preparation = { resume: string } | { erreur: string };

type OutilLecture<S extends z.ZodTypeAny> = {
  ecriture: false;
  description: string;
  schema: S;
  parametres: object;
  lire: (a: z.infer<S>) => Promise<string>;
};
type OutilEcriture<S extends z.ZodTypeAny> = {
  ecriture: true;
  description: string;
  schema: S;
  parametres: object;
  preparer: (a: z.infer<S>) => Promise<Preparation>;
  executer: (a: z.infer<S>, acteur: Acteur) => Promise<string>;
};
type Outil = OutilLecture<z.ZodTypeAny> | OutilEcriture<z.ZodTypeAny>;

const lecture = <S extends z.ZodTypeAny>(o: Omit<OutilLecture<S>, "ecriture">): Outil => ({ ecriture: false, ...o }) as Outil;
const ecriture = <S extends z.ZodTypeAny>(o: Omit<OutilEcriture<S>, "ecriture">): Outil => ({ ecriture: true, ...o }) as Outil;

const objet = (proprietes: Record<string, object>, requis: string[]) => ({
  type: "object",
  properties: proprietes,
  required: requis,
  additionalProperties: false,
});
const chaine = (description: string) => ({ type: "string", description });
const entier = (description: string) => ({ type: "integer", description });

const id = z.string().uuid();
const jour = z.string().refine(dateValide, "date au format AAAA-MM-JJ");
const montant = z.number().int().positive().max(10_000_000);

export const OUTILS: Record<string, Outil> = {
  /* --------------------------------------------------------- Lecture */

  chercher_cliente: lecture({
    description: "Cherche une cliente par son nom, son prénom ou son numéro. Rend son id, à utiliser dans les autres outils.",
    schema: z.object({ texte: z.string().min(2) }),
    parametres: objet({ texte: chaine("Nom, prénom ou numéro, même partiel") }, ["texte"]),
    async lire({ texte }) {
      const admin = createAdminClient();
      const chiffres = texte.replace(/\D/g, "");
      const mots = texte.replace(/[^\p{L}\s'-]/gu, " ").trim();
      const filtres = [
        mots && `nom_complet.ilike.%${mots}%`,
        mots && `prenom_usuel.ilike.%${mots}%`,
        chiffres.length >= 4 && `telephone.like.%${chiffres.slice(-8)}%`,
      ].filter(Boolean);
      if (!filtres.length) return "Rien à chercher.";
      const { data } = await admin
        .from("clientes")
        .select("id, nom_complet, telephone")
        .or(filtres.join(","))
        .limit(8)
        .returns<Cliente[]>();
      if (!data?.length) return `Aucune cliente trouvée pour « ${texte} ».`;
      return data.map((c) => `${c.id} · ${c.nom_complet} · ${c.telephone ?? "sans numéro"}`).join("\n");
    },
  }),

  agenda: lecture({
    description: "Rendez-vous entre deux dates incluses (31 jours au plus), avec leur id, statut et acompte.",
    schema: z.object({ du: jour, au: jour.optional() }),
    parametres: objet({ du: chaine("AAAA-MM-JJ"), au: chaine("AAAA-MM-JJ, facultatif : le même jour par défaut") }, ["du"]),
    async lire({ du, au }) {
      const fin = au && au >= du ? au : du;
      if ((new Date(fin).getTime() - new Date(du).getTime()) / 86_400_000 > 31) return "31 jours au plus.";
      const { data } = await createAdminClient()
        .from("rendez_vous")
        .select("id, date_rdv, heure_rdv, statut, acompte_requis, acompte_paye_le, clientes(nom_complet), soins_catalogue(libelle)")
        .gte("date_rdv", du)
        .lte("date_rdv", fin)
        .is("remplace_par", null)
        .is("masque_le", null)
        .order("date_rdv")
        .order("heure_rdv")
        .returns<
          { id: string; date_rdv: string; heure_rdv: string | null; statut: string; acompte_requis: boolean; acompte_paye_le: string | null; clientes: { nom_complet: string } | null; soins_catalogue: { libelle: string } | null }[]
        >();
      if (!data?.length) return "Aucun rendez-vous sur cette période.";
      return data
        .map((r) =>
          [
            r.id,
            quandLisible(r.date_rdv, r.heure_rdv),
            r.clientes?.nom_complet ?? "?",
            r.soins_catalogue?.libelle ?? "soin non précisé",
            r.statut,
            r.acompte_paye_le ? "acompte payé" : r.acompte_requis ? "acompte à payer" : "sans acompte",
          ].join(" · "),
        )
        .join("\n");
    },
  }),

  rdv_cliente: lecture({
    description: "Rendez-vous à venir et récents (30 derniers jours) d'une cliente, avec leur id.",
    schema: z.object({ cliente_id: id }),
    parametres: objet({ cliente_id: chaine("id de la cliente") }, ["cliente_id"]),
    async lire({ cliente_id }) {
      const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const { data } = await createAdminClient()
        .from("rendez_vous")
        .select("id, date_rdv, heure_rdv, statut, acompte_requis, acompte_paye_le, soins_catalogue(libelle)")
        .eq("cliente_id", cliente_id)
        .gte("date_rdv", depuis)
        .is("remplace_par", null)
        .order("date_rdv")
        .returns<{ id: string; date_rdv: string; heure_rdv: string | null; statut: string; acompte_requis: boolean; acompte_paye_le: string | null; soins_catalogue: { libelle: string } | null }[]>();
      if (!data?.length) return "Aucun rendez-vous récent ou à venir pour cette cliente.";
      return data
        .map((r) =>
          [
            r.id,
            quandLisible(r.date_rdv, r.heure_rdv),
            r.soins_catalogue?.libelle ?? "soin non précisé",
            r.statut,
            r.acompte_paye_le ? "acompte payé" : r.acompte_requis ? "acompte à payer" : "sans acompte",
          ].join(" · "),
        )
        .join("\n");
    },
  }),

  chiffre_affaires: lecture({
    description: "Chiffre d'affaires encaissé (soins, produits, abonnements) du jour, de la semaine et du mois d'une date.",
    schema: z.object({ jour: jour.optional() }),
    parametres: objet({ jour: chaine("AAAA-MM-JJ, aujourd'hui par défaut") }, []),
    async lire({ jour: j }) {
      const ca = await chiffreAffaires(createAdminClient() as never, j ?? aujourdhui());
      const ligne = (nom: string, c: (typeof ca)["jour"]) =>
        `${nom} : ${fcfa(c.total)} (soins ${fcfa(c.soins)}, produits ${fcfa(c.produits)}, abonnements ${fcfa(c.abonnements)}, ${c.factures} facture(s))`;
      return [ligne("Jour", ca.jour), ligne("Semaine", ca.semaine), ligne("Mois", ca.mois)].join("\n");
    },
  }),

  ventes_du_jour: lecture({
    description: "Factures encaissées un jour donné, avec leur id (pour renvoyer un reçu).",
    schema: z.object({ jour: jour.optional() }),
    parametres: objet({ jour: chaine("AAAA-MM-JJ, aujourd'hui par défaut") }, []),
    async lire({ jour: j }) {
      const d = j ?? aujourdhui();
      const lendemain = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
      const { data } = await createAdminClient()
        .from("factures")
        .select("id, numero_affiche, total, mode_paiement, payee_le, clientes(nom_complet)")
        .eq("statut", "payee")
        .gte("payee_le", `${d}T00:00:00Z`)
        .lt("payee_le", `${lendemain}T00:00:00Z`)
        .order("payee_le")
        .returns<{ id: string; numero_affiche: string | null; total: number; mode_paiement: string | null; payee_le: string; clientes: { nom_complet: string } | null }[]>();
      if (!data?.length) return "Aucune facture encaissée ce jour-là.";
      return data
        .map((f) => `${f.id} · n° ${f.numero_affiche} · ${f.clientes?.nom_complet ?? "sans cliente"} · ${fcfa(f.total)} · ${libelleMode(f.mode_paiement)}`)
        .join("\n");
    },
  }),

  acomptes_en_attente: lecture({
    description: "Rendez-vous à venir dont l'acompte demandé n'est pas encore payé.",
    schema: z.object({}),
    parametres: objet({}, []),
    async lire() {
      const { data } = await createAdminClient()
        .from("rendez_vous")
        .select("id, date_rdv, heure_rdv, clientes(nom_complet, telephone), soins_catalogue(libelle)")
        .eq("statut", "prevu")
        .eq("acompte_requis", true)
        .is("acompte_paye_le", null)
        .is("remplace_par", null)
        .gte("date_rdv", aujourdhui())
        .order("date_rdv")
        .returns<{ id: string; date_rdv: string; heure_rdv: string | null; clientes: { nom_complet: string; telephone: string } | null; soins_catalogue: { libelle: string } | null }[]>();
      if (!data?.length) return "Aucun acompte en attente.";
      return data
        .map((r) => `${r.id} · ${r.clientes?.nom_complet} (${r.clientes?.telephone}) · ${r.soins_catalogue?.libelle ?? "soin"} · ${quandLisible(r.date_rdv, r.heure_rdv)}`)
        .join("\n");
    },
  }),

  /* ------------------------------------------------- Promotions et prix */

  promo_soin: ecriture({
    description: "Met un soin en promotion entre deux dates incluses (remplace une promotion existante).",
    schema: z.object({ soin_id: id, prix_promo: montant, debut: jour, fin: jour }),
    parametres: objet(
      { soin_id: chaine("id du soin"), prix_promo: entier("prix promo en F CFA"), debut: chaine("AAAA-MM-JJ"), fin: chaine("AAAA-MM-JJ, inclus") },
      ["soin_id", "prix_promo", "debut", "fin"],
    ),
    async preparer(a) {
      const s = await soin(createAdminClient(), a.soin_id);
      if (!s) return { erreur: "soin introuvable" };
      if (s.prix == null) return { erreur: "ce soin n'a pas de prix normal" };
      if (a.prix_promo >= s.prix) return { erreur: `le prix promo doit être inférieur au prix normal (${fcfa(s.prix)})` };
      if (a.fin < a.debut) return { erreur: "la fin doit suivre le début" };
      if (a.fin < aujourdhui()) return { erreur: "la date de fin est déjà passée" };
      return { resume: `Promotion « ${s.libelle} » : ${fcfa(a.prix_promo)} au lieu de ${fcfa(s.prix)}, du ${jourLong(a.debut)} au ${jourLong(a.fin)} inclus.` };
    },
    async executer(a) {
      const { error } = await createAdminClient()
        .from("soins_catalogue")
        .update({ prix_promo: a.prix_promo, promo_debut: a.debut, promo_fin: a.fin })
        .eq("id", a.soin_id);
      if (error) throw new Error(error.message);
      rafraichir("/catalogue", "/rdv");
      return "Promotion enregistrée.";
    },
  }),

  retirer_promo_soin: ecriture({
    description: "Arrête la promotion d'un soin.",
    schema: z.object({ soin_id: id }),
    parametres: objet({ soin_id: chaine("id du soin") }, ["soin_id"]),
    async preparer(a) {
      const s = await soin(createAdminClient(), a.soin_id);
      if (!s) return { erreur: "soin introuvable" };
      if (s.prix_promo == null) return { erreur: "ce soin n'a pas de promotion" };
      return { resume: `Retirer la promotion de « ${s.libelle} » : il revient à ${fcfa(s.prix ?? 0)}.` };
    },
    async executer(a) {
      const { error } = await createAdminClient()
        .from("soins_catalogue")
        .update({ prix_promo: null, promo_debut: null, promo_fin: null })
        .eq("id", a.soin_id);
      if (error) throw new Error(error.message);
      rafraichir("/catalogue", "/rdv");
      return "Promotion retirée.";
    },
  }),

  prix_soin: ecriture({
    description: "Change le prix normal d'un soin.",
    schema: z.object({ soin_id: id, prix: montant }),
    parametres: objet({ soin_id: chaine("id du soin"), prix: entier("nouveau prix en F CFA") }, ["soin_id", "prix"]),
    async preparer(a) {
      const s = await soin(createAdminClient(), a.soin_id);
      if (!s) return { erreur: "soin introuvable" };
      if (s.prix_promo != null && s.prix_promo >= a.prix) {
        return { erreur: `ce soin a une promotion à ${fcfa(s.prix_promo)} : il faut d'abord la retirer ou la baisser` };
      }
      return { resume: `Prix de « ${s.libelle} » : ${s.prix != null ? fcfa(s.prix) : "sans prix"} → ${fcfa(a.prix)}.` };
    },
    async executer(a) {
      const { error } = await createAdminClient().from("soins_catalogue").update({ prix: a.prix }).eq("id", a.soin_id);
      if (error) throw new Error(error.message);
      rafraichir("/catalogue", "/rdv");
      return "Prix enregistré.";
    },
  }),

  promo_produit: ecriture({
    description: "Met un produit en promotion, jusqu'à une date incluse ou sans date de fin (remplace une promotion existante).",
    schema: z.object({ produit_id: id, prix_promo: montant, fin: jour.nullable().optional() }),
    parametres: objet(
      { produit_id: chaine("id du produit"), prix_promo: entier("prix promo en F CFA"), fin: chaine("AAAA-MM-JJ inclus, ou absent si pas de date de fin") },
      ["produit_id", "prix_promo"],
    ),
    async preparer(a) {
      const p = await produit(createAdminClient(), a.produit_id);
      if (!p) return { erreur: "produit introuvable" };
      if (a.prix_promo >= p.prix_vente) return { erreur: `le prix promo doit être inférieur au prix normal (${fcfa(p.prix_vente)})` };
      if (a.fin && a.fin < aujourdhui()) return { erreur: "la date de fin est déjà passée" };
      return {
        resume: `Promotion « ${p.nom} » : ${fcfa(a.prix_promo)} au lieu de ${fcfa(p.prix_vente)}, ${a.fin ? `jusqu'au ${jourLong(a.fin)} inclus` : "sans date de fin"}.`,
      };
    },
    async executer(a) {
      const { error } = await createAdminClient()
        .from("produits")
        .update({ prix_promo: a.prix_promo, promo_fin: a.fin ?? null })
        .eq("id", a.produit_id);
      if (error) throw new Error(error.message);
      rafraichir("/caisse", "/boutique");
      return "Promotion enregistrée.";
    },
  }),

  retirer_promo_produit: ecriture({
    description: "Arrête la promotion d'un produit.",
    schema: z.object({ produit_id: id }),
    parametres: objet({ produit_id: chaine("id du produit") }, ["produit_id"]),
    async preparer(a) {
      const p = await produit(createAdminClient(), a.produit_id);
      if (!p) return { erreur: "produit introuvable" };
      if (p.prix_promo == null) return { erreur: "ce produit n'a pas de promotion" };
      return { resume: `Retirer la promotion de « ${p.nom} » : il revient à ${fcfa(p.prix_vente)}.` };
    },
    async executer(a) {
      const { error } = await createAdminClient().from("produits").update({ prix_promo: null, promo_fin: null }).eq("id", a.produit_id);
      if (error) throw new Error(error.message);
      rafraichir("/caisse", "/boutique");
      return "Promotion retirée.";
    },
  }),

  prix_produit: ecriture({
    description: "Change le prix de vente normal d'un produit.",
    schema: z.object({ produit_id: id, prix: montant }),
    parametres: objet({ produit_id: chaine("id du produit"), prix: entier("nouveau prix en F CFA") }, ["produit_id", "prix"]),
    async preparer(a) {
      const p = await produit(createAdminClient(), a.produit_id);
      if (!p) return { erreur: "produit introuvable" };
      if (p.prix_promo != null && p.prix_promo >= a.prix) {
        return { erreur: `ce produit a une promotion à ${fcfa(p.prix_promo)} : il faut d'abord la retirer ou la baisser` };
      }
      return { resume: `Prix de « ${p.nom} » : ${fcfa(p.prix_vente)} → ${fcfa(a.prix)}.` };
    },
    async executer(a) {
      const { error } = await createAdminClient().from("produits").update({ prix_vente: a.prix }).eq("id", a.produit_id);
      if (error) throw new Error(error.message);
      rafraichir("/caisse", "/boutique");
      return "Prix enregistré.";
    },
  }),

  /* -------------------------------------------------------------- Ventes */

  vendre_produits: ecriture({
    description:
      "Vend et encaisse des produits (sans soin), au prix du jour, puis envoie le reçu WhatsApp à la cliente si demandé. Sans cliente : vente au comptoir, sans reçu.",
    schema: z.object({
      cliente_id: id.nullable().optional(),
      lignes: z.array(z.object({ produit_id: id, quantite: z.number().int().min(1).max(99) })).min(1).max(20),
      mode: z.enum(MODES_PAIEMENT.map((m) => m.valeur) as [string, ...string[]]),
      envoyer_recu: z.boolean(),
    }),
    parametres: objet(
      {
        cliente_id: chaine("id de la cliente, ou absent pour une vente sans cliente"),
        lignes: {
          type: "array",
          items: objet({ produit_id: chaine("id du produit"), quantite: entier("quantité") }, ["produit_id", "quantite"]),
        },
        mode: { type: "string", enum: MODES_PAIEMENT.map((m) => m.valeur), description: "mode de paiement" },
        envoyer_recu: { type: "boolean", description: "envoyer le reçu par WhatsApp à la cliente" },
      },
      ["lignes", "mode", "envoyer_recu"],
    ),
    async preparer(a) {
      const admin = createAdminClient();
      const c = a.cliente_id ? await cliente(admin, a.cliente_id) : null;
      if (a.cliente_id && !c) return { erreur: "cliente introuvable" };
      if (a.envoyer_recu && !c) return { erreur: "pas de reçu sans cliente : demander pour quelle cliente" };
      if (a.envoyer_recu && !c?.telephone) return { erreur: "cette cliente n'a pas de numéro : pas de reçu possible" };
      const lignes: string[] = [];
      const alertes: string[] = [];
      const calcul: { prix_unitaire: number; quantite: number }[] = [];
      for (const l of a.lignes) {
        const p = await produit(admin, l.produit_id);
        if (!p) return { erreur: "produit introuvable" };
        if (!p.actif) return { erreur: `« ${p.nom} » n'est plus en vente` };
        const prix = prixActuel(p);
        calcul.push({ prix_unitaire: prix, quantite: l.quantite });
        lignes.push(`- ${l.quantite} × ${p.nom} à ${fcfa(prix)}${prix < p.prix_vente ? " (promo)" : ""}`);
        if (p.stock < l.quantite) alertes.push(`stock de « ${p.nom} » : ${p.stock} seulement`);
      }
      const total = calculerFacture({ soins: [], montantSoins: null, produits: calcul, remiseSur: null, acompte: 0 }).total;
      return {
        resume: [
          `Vente${c ? ` à ${c.nom_complet}` : " sans cliente"} :`,
          ...lignes,
          `Total ${fcfa(total)}, payé par ${libelleMode(a.mode)}.`,
          a.envoyer_recu ? `Reçu envoyé par WhatsApp au ${c?.telephone}.` : "Pas de reçu envoyé.",
          ...(alertes.length ? [`Attention, ${alertes.join(" ; ")}.`] : []),
        ].join("\n"),
      };
    },
    async executer(a, acteur) {
      const admin = createAdminClient();
      const { data: f, error } = await admin
        .from("factures")
        .insert({ cliente_id: a.cliente_id ?? null, cree_par: acteur.id, notes: "Vente saisie par l'assistant WhatsApp" })
        .select("id")
        .single<{ id: string }>();
      if (error || !f) throw new Error(error?.message ?? "création impossible");
      const lignes = [];
      for (const [i, l] of a.lignes.entries()) {
        const p = await produit(admin, l.produit_id);
        if (!p) throw new Error("produit introuvable");
        lignes.push({ facture_id: f.id, type: "produit", produit_id: p.id, libelle: p.nom, quantite: l.quantite, prix_unitaire: prixActuel(p), ordre: 100 + i });
      }
      const c = calculerFacture({ soins: [], montantSoins: null, produits: lignes, remiseSur: null, acompte: 0 });
      const { error: e1 } = await admin.from("lignes_facture").insert(lignes);
      const { error: e2 } = await admin
        .from("factures")
        .update({ montant_soins_normal: 0, montant_soins: 0, montant_produits: c.produits, remise_fidelite: 0, total: c.total })
        .eq("id", f.id);
      if (e1 || e2) {
        await admin.from("factures").delete().eq("id", f.id).eq("statut", "brouillon");
        throw new Error((e1 ?? e2)!.message);
      }
      const { data, error: e3 } = await admin.rpc("encaisser_facture_par", { p_facture: f.id, p_mode: a.mode, p_acteur: acteur.id });
      const res = data as { numero?: string; erreur?: string } | null;
      if (e3 || res?.erreur) {
        await admin.from("factures").delete().eq("id", f.id).eq("statut", "brouillon");
        throw new Error(e3?.message ?? `encaissement impossible (${res?.erreur})`);
      }
      rafraichir("/caisse", "/accueil", "/boutique");
      let recu = "";
      if (a.envoyer_recu) {
        const r = await envoyerRecuWhatsapp(f.id).catch(() => ({ ok: false, detail: "erreur" }));
        recu = r.ok ? " Reçu envoyé à la cliente." : ` Le reçu n'est pas parti (${r.detail}) : renvoyez-le depuis la caisse.`;
      }
      return `Vente encaissée : ${fcfa(c.total)}, reçu n° ${res?.numero}.${recu}`;
    },
  }),

  renvoyer_recu: ecriture({
    description: "Renvoie par WhatsApp le reçu d'une facture déjà encaissée (id donné par ventes_du_jour).",
    schema: z.object({ facture_id: id }),
    parametres: objet({ facture_id: chaine("id de la facture") }, ["facture_id"]),
    async preparer(a) {
      const { data: f } = await createAdminClient()
        .from("factures")
        .select("statut, numero_affiche, total, clientes(nom_complet, telephone)")
        .eq("id", a.facture_id)
        .maybeSingle<{ statut: string; numero_affiche: string | null; total: number; clientes: { nom_complet: string; telephone: string | null } | null }>();
      if (!f || f.statut !== "payee") return { erreur: "facture introuvable ou non encaissée" };
      if (!f.clientes?.telephone) return { erreur: "pas de cliente avec numéro sur cette facture" };
      return { resume: `Renvoyer le reçu n° ${f.numero_affiche} (${fcfa(f.total)}) à ${f.clientes.nom_complet}, au ${f.clientes.telephone}.` };
    },
    async executer(a) {
      const r = await envoyerRecuWhatsapp(a.facture_id, { forcer: true });
      return r.ok ? "Reçu envoyé." : `Envoi impossible : ${r.detail}.`;
    },
  }),

  /* ---------------------------------------------------------- Rendez-vous */

  creer_rdv: ecriture({
    description:
      "Crée un rendez-vous. Si un acompte est demandé, la cliente reçoit le lien de paiement comme pour un rendez-vous saisi dans l'agenda.",
    schema: z.object({ cliente_id: id, soin_id: id, date: jour, heure: z.string(), notes: z.string().max(300).optional() }),
    parametres: objet(
      {
        cliente_id: chaine("id de la cliente"),
        soin_id: chaine("id du soin"),
        date: chaine("AAAA-MM-JJ"),
        heure: chaine("HH:MM"),
        notes: chaine("note facultative"),
      },
      ["cliente_id", "soin_id", "date", "heure"],
    ),
    async preparer(a) {
      const admin = createAdminClient();
      const heure = heureNormale(a.heure);
      if (!heure) return { erreur: "heure invalide" };
      if (a.date < aujourdhui()) return { erreur: "cette date est passée" };
      const [c, s] = await Promise.all([cliente(admin, a.cliente_id), soin(admin, a.soin_id)]);
      if (!c) return { erreur: "cliente introuvable" };
      if (!s) return { erreur: "soin introuvable" };
      const conflit = await conflitAgenda(admin, { date_rdv: a.date, heure_rdv: heure }, s.duree_std ?? 60);
      if (conflit) return { erreur: conflit };
      return {
        resume: `Rendez-vous pour ${c.nom_complet} : ${s.libelle}, ${quandLisible(a.date, heure)}.${a.notes ? ` Note : ${a.notes}.` : ""}\nSi un acompte est demandé, la cliente reçoit le lien de paiement.`,
      };
    },
    async executer(a, acteur) {
      const r = await enregistrerRdvAvec(createAdminClient(), acteur.id, {
        cliente_id: a.cliente_id,
        date_rdv: a.date,
        heure_rdv: heureNormale(a.heure)!,
        duree_min: "",
        soin_id: a.soin_id,
        notes: a.notes ?? "",
      });
      if (!r.ok) throw new Error(r.erreur);
      rafraichir("/rendez-vous", "/accueil");
      return "Rendez-vous enregistré.";
    },
  }),

  deplacer_rdv: ecriture({
    description: "Déplace un rendez-vous prévu à une autre date ou heure. La cliente n'est pas prévenue automatiquement.",
    schema: z.object({ rdv_id: id, date: jour, heure: z.string() }),
    parametres: objet({ rdv_id: chaine("id du rendez-vous"), date: chaine("AAAA-MM-JJ"), heure: chaine("HH:MM") }, ["rdv_id", "date", "heure"]),
    async preparer(a) {
      const admin = createAdminClient();
      const heure = heureNormale(a.heure);
      if (!heure) return { erreur: "heure invalide" };
      if (a.date < aujourdhui()) return { erreur: "cette date est passée" };
      const r = await rdv(admin, a.rdv_id);
      if (!r || r.statut !== "prevu" || r.remplace_par) return { erreur: "rendez-vous introuvable ou plus prévu" };
      const conflit = await conflitAgenda(admin, { id: r.id, date_rdv: a.date, heure_rdv: heure }, r.duree_min ?? r.soins_catalogue?.duree_std ?? 60);
      if (conflit) return { erreur: conflit };
      return {
        resume: `Déplacer le rendez-vous de ${r.clientes?.nom_complet} (${r.soins_catalogue?.libelle ?? "soin"}) : ${quandLisible(r.date_rdv, r.heure_rdv)} → ${quandLisible(a.date, heure)}.\nLa cliente n'est pas prévenue automatiquement.`,
      };
    },
    async executer(a, acteur) {
      const admin = createAdminClient();
      const r = await rdv(admin, a.rdv_id);
      if (!r) throw new Error("rendez-vous introuvable");
      const res = await enregistrerRdvAvec(admin, acteur.id, {
        id: r.id,
        cliente_id: r.cliente_id,
        date_rdv: a.date,
        heure_rdv: heureNormale(a.heure)!,
        duree_min: r.duree_min ? String(r.duree_min) : "",
        soin_id: r.soin_id ?? "",
        notes: r.notes ?? "",
      });
      if (!res.ok) throw new Error(res.erreur);
      rafraichir("/rendez-vous", "/accueil");
      return "Rendez-vous déplacé. Pensez à prévenir la cliente.";
    },
  }),

  annuler_rdv: ecriture({
    description: "Annule un rendez-vous prévu (il reste dans l'historique). La cliente n'est pas prévenue automatiquement.",
    schema: z.object({ rdv_id: id }),
    parametres: objet({ rdv_id: chaine("id du rendez-vous") }, ["rdv_id"]),
    async preparer(a) {
      const r = await rdv(createAdminClient(), a.rdv_id);
      if (!r || r.statut !== "prevu") return { erreur: "rendez-vous introuvable ou plus prévu" };
      return {
        resume: `Annuler le rendez-vous de ${decrireRdv(r)}.${r.acompte_paye_le ? "\nSon acompte est payé : il n'est pas remboursé automatiquement." : ""}\nLa cliente n'est pas prévenue automatiquement.`,
      };
    },
    async executer(a) {
      const { error } = await createAdminClient().from("rendez_vous").update({ statut: "annule" }).eq("id", a.rdv_id).eq("statut", "prevu");
      if (error) throw new Error(error.message);
      rafraichir("/rendez-vous", "/accueil");
      return "Rendez-vous annulé.";
    },
  }),

  envoyer_lien_acompte: ecriture({
    description: "Envoie (ou renvoie) à la cliente le lien de paiement de l'acompte d'un rendez-vous prévu.",
    schema: z.object({ rdv_id: id }),
    parametres: objet({ rdv_id: chaine("id du rendez-vous") }, ["rdv_id"]),
    async preparer(a) {
      const admin = createAdminClient();
      const r = await rdv(admin, a.rdv_id);
      if (!r || r.statut !== "prevu" || r.remplace_par) return { erreur: "rendez-vous introuvable ou plus prévu" };
      if (r.acompte_paye_le) return { erreur: "l'acompte est déjà payé" };
      if (!r.code_acompte) return { erreur: "ce rendez-vous n'a pas de lien d'acompte" };
      const { data: reglages } = await admin.from("reglages_rdv").select("acompte_montant").maybeSingle<{ acompte_montant: number }>();
      const m = acompteDuRdv(reglages?.acompte_montant ?? 0, r.soins_catalogue, r.date_rdv);
      return { resume: `Envoyer à ${r.clientes?.nom_complet} le lien d'acompte de ${fcfa(m)} pour ${r.soins_catalogue?.libelle ?? "son soin"}, ${quandLisible(r.date_rdv, r.heure_rdv)}.` };
    },
    async executer(a) {
      const r = await envoyerMessageAcompte(a.rdv_id, "lien");
      return `Lien envoyé (WhatsApp : ${r.whatsapp} ; e-mail : ${r.email}).`;
    },
  }),

  /* --------------------------------------------------------------- Stock */

  mouvement_stock: ecriture({
    description:
      "Mouvement de stock d'un produit : reception (produits reçus, ajoutés au stock), cabine (utilisés en cabine, retirés), inventaire (nombre compté, remplace le stock).",
    schema: z.object({
      produit_id: id,
      type: z.enum(["reception", "cabine", "inventaire"]),
      quantite: z.number().int().min(0).max(10_000),
      note: z.string().max(200).optional(),
    }),
    parametres: objet(
      {
        produit_id: chaine("id du produit"),
        type: { type: "string", enum: ["reception", "cabine", "inventaire"] },
        quantite: entier("quantité reçue ou utilisée, ou nombre compté pour un inventaire"),
        note: chaine("note facultative"),
      },
      ["produit_id", "type", "quantite"],
    ),
    async preparer(a) {
      const p = await produit(createAdminClient(), a.produit_id);
      if (!p) return { erreur: "produit introuvable" };
      if (a.type !== "inventaire" && a.quantite < 1) return { erreur: "quantité invalide" };
      const apres = a.type === "reception" ? p.stock + a.quantite : a.type === "cabine" ? p.stock - a.quantite : a.quantite;
      const quoi = a.type === "reception" ? `Réception de ${a.quantite} × ` : a.type === "cabine" ? `Usage en cabine de ${a.quantite} × ` : "Inventaire de ";
      return { resume: `${quoi}« ${p.nom} » : stock ${p.stock} → ${apres}.` };
    },
    async executer(a, acteur) {
      const { data, error } = await createAdminClient().rpc("mouvement_stock_par", {
        p_produit: a.produit_id,
        p_quantite: a.quantite,
        p_type: a.type,
        p_note: a.note ?? "Saisi par l'assistant WhatsApp",
        p_acteur: acteur.id,
      });
      if (error) throw new Error(error.message);
      rafraichir("/caisse", "/boutique");
      return `Stock mis à jour : ${data as number}.`;
    },
  }),
};

/** Définitions envoyées au modèle. */
export const DEFINITIONS = Object.entries(OUTILS).map(([nom, o]) => ({
  type: "function" as const,
  function: { name: nom, description: o.description, parameters: o.parametres },
}));

/* --------------------------------------------- Catalogue pour le modèle */

/** Soins et produits avec leurs id, prix, promotions et stock. */
export async function catalogueGerante() {
  const admin = createAdminClient();
  const j = aujourdhui();
  const [{ data: soins }, { data: produits }] = await Promise.all([
    admin
      .from("soins_catalogue")
      .select("id, libelle, duree_std, " + CHAMPS_PRIX_SOIN)
      .eq("actif", true)
      .order("ordre")
      .returns<(PrixSoin & { id: string; libelle: string; duree_std: number | null })[]>(),
    admin
      .from("produits")
      .select("id, nom, prix_vente, prix_promo, promo_fin, stock, seuil, actif")
      .order("nom")
      .returns<(Produit & { seuil: number })[]>(),
  ]);
  const lignesSoins = (soins ?? []).map((s) => {
    const promo =
      s.prix_promo != null && s.promo_debut && s.promo_fin
        ? ` · promo ${fcfa(s.prix_promo)} du ${s.promo_debut} au ${s.promo_fin}${prixDuJour(s, j) === s.prix_promo ? " (en cours)" : ""}`
        : "";
    return `${s.id} · ${s.libelle} · ${s.duree_std ?? "?"} min · ${s.prix != null ? fcfa(s.prix) : "sans prix"}${promo}`;
  });
  const lignesProduits = (produits ?? []).map((p) => {
    const promo = p.prix_promo != null ? ` · promo ${fcfa(p.prix_promo)}${p.promo_fin ? ` jusqu'au ${p.promo_fin}` : " sans date de fin"}` : "";
    const bas = p.stock <= p.seuil ? " (stock bas)" : "";
    return `${p.id} · ${p.nom} · ${fcfa(p.prix_vente)}${promo} · stock ${p.stock}${bas}${p.actif ? "" : " · plus en vente"}`;
  });
  return `Soins (id · libellé · durée · prix · promo) :\n${lignesSoins.join("\n")}\n\nProduits (id · nom · prix · promo · stock) :\n${lignesProduits.join("\n")}`;
}

