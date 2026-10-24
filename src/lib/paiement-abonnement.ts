import "server-only";
import { randomBytes } from "node:crypto";
import type { EtatAcompte, ResultatInitiation } from "@/lib/acompte";
import { lancerPayin, statutPayin, type Operateur, type StatutAfriba } from "@/lib/afribapay";
import { situationPaiement, type Abonnement } from "@/lib/abonnements";
import { adressePublique } from "@/lib/adresse";
import { envoyerMessageAbonnement } from "@/lib/notifications/abonnement";
import { alerterGerantes } from "@/lib/notifications/gerantes";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Versements d'un abonnement, par le lien /p/<code>.
 *
 * Même prudence que pour l'acompte : un versement n'est tenu pour réussi que
 * sur la notification signée d'AfribaPay ou sur son API de statut, jamais sur
 * la parole du navigateur.
 */

const DELAI_TENTATIVE_MS = 10 * 60_000;
const DELAI_AVANT_VERIFICATION_MS = 20_000;

/** Préfixe distinct des acomptes : la notification AfribaPay sait où chercher. */
export const PREFIXE_ABONNEMENT = "CAB-ABO-";
export const ORDER_ID_ABONNEMENT = /^CAB-ABO-[A-Z0-9]+-[A-F0-9]{12}$/;

const nouvelOrderId = () =>
  `${PREFIXE_ABONNEMENT}${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`.toUpperCase();

/** Total déjà versé et confirmé. */
export async function totalVerse(abonnementId: string) {
  const { data } = await createAdminClient()
    .from("paiements_abonnement")
    .select("montant")
    .eq("abonnement_id", abonnementId)
    .eq("statut", "reussi")
    .returns<{ montant: number }[]>();
  return (data ?? []).reduce((t, p) => t + p.montant, 0);
}

export async function initierVersement(p: {
  code: string;
  operateur: Operateur;
  telephone: string;
  otp?: string;
  /** « echeance » : la prochaine échéance ; « tout » : tout le reste. */
  mode: "echeance" | "tout";
}): Promise<ResultatInitiation> {
  const admin = createAdminClient();
  const { data: abo } = await admin
    .from("abonnements")
    .select("*")
    .eq("code_paiement", p.code)
    .maybeSingle<Abonnement>();
  if (!abo || abo.statut === "annule") {
    return { ok: false, erreur: "Cet abonnement ne peut pas recevoir de paiement." };
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const situation = situationPaiement(abo, await totalVerse(abo.id), aujourdhui);
  const montant = p.mode === "tout" ? situation.reste : (situation.prochaine?.aVerser ?? 0);
  if (montant <= 0) return { ok: false, erreur: "Cet abonnement est déjà entièrement réglé." };

  const { data: enCours } = await admin
    .from("paiements_abonnement")
    .select("id")
    .eq("abonnement_id", abo.id)
    .eq("statut", "en_attente")
    .gte("created_at", new Date(Date.now() - DELAI_TENTATIVE_MS).toISOString())
    .limit(1);
  if (enCours?.length) {
    return {
      ok: false,
      erreur: "Un paiement est déjà en cours. Valide-le sur ton téléphone, ou réessaie dans quelques minutes.",
    };
  }

  const orderId = nouvelOrderId();
  const { error } = await admin.from("paiements_abonnement").insert({
    abonnement_id: abo.id,
    order_id: orderId,
    operateur: p.operateur,
    telephone: p.telephone,
    montant,
  });
  if (error) return { ok: false, erreur: "Le paiement n'a pas pu démarrer." };

  const r = await lancerPayin({
    operateur: p.operateur,
    telephone: p.telephone,
    montant,
    orderId,
    reference: `Abonnement ${abo.debut}`,
    notifyUrl: `${await adressePublique()}/api/afribapay/notification`,
    otp: p.otp,
  });
  if (!r.ok) {
    await admin
      .from("paiements_abonnement")
      .update({ statut: "echoue", detail: r.erreur.slice(0, 500) })
      .eq("order_id", orderId);
    return {
      ok: false,
      erreur: r.acces
        ? "Le paiement en ligne est momentanément indisponible. Réessaie un peu plus tard, ou règle à l'institut."
        : "Le paiement n'a pas pu démarrer. Vérifie le numéro et l'opérateur, puis réessaie.",
    };
  }

  await admin
    .from("paiements_abonnement")
    .update({ transaction_id: r.transactionId, lien_paiement: r.lien })
    .eq("order_id", orderId);

  const etat = await appliquerStatutVersement(orderId, r.statut);
  return { ok: true, orderId, etat, lien: r.lien };
}

/** Reporte un statut AfribaPay sur le versement. Rejouable sans effet. */
export async function appliquerStatutVersement(
  orderId: string,
  statut: StatutAfriba,
  transactionId?: string | null,
): Promise<EtatAcompte> {
  const admin = createAdminClient();

  if (statut === "SUCCESS") {
    // Seule la bascule en_attente -> reussi déclenche le reçu : la
    // notification et l'API de statut peuvent annoncer la même réussite.
    const { data: bascule } = await admin
      .from("paiements_abonnement")
      .update({ statut: "reussi", ...(transactionId ? { transaction_id: transactionId } : {}) })
      .eq("order_id", orderId)
      .neq("statut", "reussi")
      .select("abonnement_id, montant");
    const v = bascule?.[0];
    if (v) {
      await envoyerMessageAbonnement(v.abonnement_id, "recu", { montant: v.montant, orderId }).catch(
        () => null,
      );
      const { data: abo } = await admin
        .from("abonnements")
        .select("clientes(nom_complet), soins_catalogue(libelle)")
        .eq("id", v.abonnement_id)
        .maybeSingle<{ clientes: { nom_complet: string } | null; soins_catalogue: { libelle: string } | null }>();
      await alerterGerantes(
        `Abonnement : ${v.montant.toLocaleString("fr-FR")} F reçu · ${abo?.clientes?.nom_complet ?? "cliente"} · ${abo?.soins_catalogue?.libelle ?? ""}`,
      ).catch(() => null);
    }
    return "reussi";
  }

  if (statut === "FAILED") {
    await admin
      .from("paiements_abonnement")
      .update({ statut: "echoue" })
      .eq("order_id", orderId)
      .eq("statut", "en_attente");
  }

  const { data } = await admin
    .from("paiements_abonnement")
    .select("statut")
    .eq("order_id", orderId)
    .maybeSingle<{ statut: EtatAcompte }>();
  return data?.statut ?? "en_attente";
}

/** État d'un versement pour l'écran de la cliente, rapproché d'AfribaPay si besoin. */
export async function etatVersement(orderId: string): Promise<EtatAcompte | null> {
  const { data } = await createAdminClient()
    .from("paiements_abonnement")
    .select("statut, created_at")
    .eq("order_id", orderId)
    .maybeSingle<{ statut: EtatAcompte; created_at: string }>();
  if (!data) return null;
  if (data.statut !== "en_attente") return data.statut;
  if (Date.now() - new Date(data.created_at).getTime() < DELAI_AVANT_VERIFICATION_MS) {
    return "en_attente";
  }
  const statut = await statutPayin(orderId);
  return statut ? appliquerStatutVersement(orderId, statut) : "en_attente";
}
