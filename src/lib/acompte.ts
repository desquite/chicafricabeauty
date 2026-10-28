import "server-only";
import { randomBytes } from "node:crypto";
import { lancerPayin, statutPayin, type Operateur, type StatutAfriba } from "@/lib/afribapay";
import { adressePublique } from "@/lib/adresse";
import { envoyerMessageAcompte } from "@/lib/notifications/acompte";
import { alerterGerantesRdv } from "@/lib/notifications/gerantes";
import type { PrixSoin } from "@/lib/disponibilites";
import { acompteDuRdv, CHAMPS_PRIX_SOIN, estExpire, type RdvAcompte } from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Acompte d'un rendez-vous pris en ligne.
 *
 * Le rendez-vous existe déjà quand l'acompte est demandé : un paiement qui
 * échoue ou traîne ne fait jamais perdre son créneau à la cliente. Un
 * paiement n'est tenu pour réussi que sur la notification signée d'AfribaPay
 * ou sur son API de statut, jamais sur la parole du navigateur.
 */

export type EtatAcompte = "en_attente" | "reussi" | "echoue";

/** Une tentative restée sans nouvelles plus longtemps n'empêche plus d'en refaire une. */
const DELAI_TENTATIVE_MS = 10 * 60_000;
/** Avant ce délai, on attend la notification plutôt que d'interroger AfribaPay. */
const DELAI_AVANT_VERIFICATION_MS = 20_000;

const nouvelOrderId = () =>
  `CAB-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`.toUpperCase();

export type ResultatInitiation =
  | { ok: true; orderId: string; etat: EtatAcompte; lien: string | null }
  | { ok: false; erreur: string };

export async function initierAcompte(p: {
  /** Code du lien de paiement, le seul identifiant que voit la cliente. */
  code: string;
  operateur: Operateur;
  telephone: string;
  otp?: string;
}): Promise<ResultatInitiation> {
  const admin = createAdminClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [{ data: rdv }, { data: reglages }] = await Promise.all([
    admin
      .from("rendez_vous")
      .select(
        `id, date_rdv, heure_rdv, created_at, statut, source, acompte_requis, acompte_paye_le, remplace_par, soins_catalogue(${CHAMPS_PRIX_SOIN})`,
      )
      .eq("code_acompte", p.code)
      .maybeSingle<
        RdvAcompte & {
          id: string;
          statut: string;
          remplace_par: string | null;
          soins_catalogue: PrixSoin | null;
        }
      >(),
    admin.from("reglages_rdv").select("acompte_montant").maybeSingle(),
  ]);

  // Le code vient du navigateur : seul un rendez-vous à venir, encore prévu,
  // pris en ligne ou soumis à l'acompte, peut en recevoir un.
  if (
    !rdv ||
    rdv.statut !== "prevu" ||
    rdv.remplace_par ||
    rdv.date_rdv < aujourdhui ||
    (rdv.source !== "en_ligne" && !rdv.acompte_requis)
  ) {
    return { ok: false, erreur: "Ce rendez-vous ne peut pas recevoir d'acompte en ligne." };
  }
  if (rdv.acompte_paye_le) return { ok: false, erreur: "L'acompte de ce rendez-vous est déjà réglé." };
  if (estExpire(rdv, new Date())) {
    return { ok: false, erreur: "Le délai pour régler l'acompte est dépassé : ce rendez-vous va être annulé." };
  }

  // Jamais plus que le prix du soin : une pedicure a 5 000 F se regle 5 000 F.
  const montant = acompteDuRdv(reglages?.acompte_montant ?? 0, rdv.soins_catalogue, rdv.date_rdv);
  if (montant <= 0) return { ok: false, erreur: "Aucun acompte n'est demandé pour le moment." };

  const { data: enCours } = await admin
    .from("paiements_acompte")
    .select("order_id, operateur, lien_paiement")
    .eq("rendez_vous_id", rdv.id)
    .eq("statut", "en_attente")
    .gte("created_at", new Date(Date.now() - DELAI_TENTATIVE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const tentative = enCours?.[0];
  if (tentative) {
    // Avant de bloquer, on demande à AfribaPay : une tentative déjà échouée
    // ne doit pas empêcher d'en refaire une.
    const etat = await etatAcompte(tentative.order_id);
    if (etat === "reussi") return { ok: false, erreur: "L'acompte de ce rendez-vous est déjà réglé." };
    if (etat === "en_attente") {
      // Même opérateur, page Wave fermée trop tôt : on rend le même lien plutôt
      // que de bloquer la cliente dix minutes (Carine Camara, 28 octobre).
      if (tentative.operateur === p.operateur && tentative.lien_paiement) {
        return { ok: true, orderId: tentative.order_id, etat, lien: tentative.lien_paiement };
      }
      return {
        ok: false,
        erreur: "Un paiement est déjà en cours pour ce rendez-vous. Valide-le sur ton téléphone, ou réessaie dans quelques minutes.",
      };
    }
  }

  const orderId = nouvelOrderId();
  const { error: erreurCreation } = await admin.from("paiements_acompte").insert({
    rendez_vous_id: rdv.id,
    order_id: orderId,
    operateur: p.operateur,
    telephone: p.telephone,
    montant,
  });
  if (erreurCreation) return { ok: false, erreur: "Le paiement n'a pas pu démarrer." };

  const r = await lancerPayin({
    operateur: p.operateur,
    telephone: p.telephone,
    montant,
    orderId,
    reference: `Acompte RDV ${rdv.date_rdv}`,
    notifyUrl: `${await adressePublique()}/api/afribapay/notification`,
    otp: p.otp,
  });

  if (!r.ok) {
    await admin
      .from("paiements_acompte")
      .update({ statut: "echoue", detail: r.erreur.slice(0, 500) })
      .eq("order_id", orderId);
    // Identifiants refuses : la cliente n'y peut rien, inutile de lui faire
    // verifier son numero.
    return {
      ok: false,
      erreur: r.acces
        ? "Le paiement en ligne est momentanément indisponible. Ton créneau reste retenu : réessaie un peu plus tard, ou règle l'acompte à l'institut."
        : "Le paiement n'a pas pu démarrer. Vérifie le numéro et l'opérateur, puis réessaie.",
    };
  }

  await admin
    .from("paiements_acompte")
    .update({ transaction_id: r.transactionId, lien_paiement: r.lien })
    .eq("order_id", orderId);

  const etat = await appliquerStatut(orderId, r.statut);
  return { ok: true, orderId, etat, lien: r.lien };
}

/**
 * Reporte un statut AfribaPay sur le paiement et son rendez-vous. Rejouable
 * sans effet : une notification reçue deux fois ne fait rien de plus.
 */
export async function appliquerStatut(
  orderId: string,
  statut: StatutAfriba,
  transactionId?: string | null,
): Promise<EtatAcompte> {
  const admin = createAdminClient();

  if (statut === "SUCCESS") {
    const { data: paiement } = await admin
      .from("paiements_acompte")
      .update({ statut: "reussi", ...(transactionId ? { transaction_id: transactionId } : {}) })
      .eq("order_id", orderId)
      .select("rendez_vous_id, montant")
      .single();
    if (paiement) {
      const { data: premiere } = await admin
        .from("rendez_vous")
        .update({ acompte_montant: paiement.montant, acompte_paye_le: new Date().toISOString() })
        .eq("id", paiement.rendez_vous_id)
        .is("acompte_paye_le", null)
        .select("id");
      // Le recu ne part qu'a la premiere confirmation : la notification et
      // l'API de statut peuvent toutes deux annoncer la meme reussite.
      if (premiere?.length) {
        await envoyerMessageAcompte(paiement.rendez_vous_id, "recu").catch(() => null);
        await alerterGerantesRdv(
          paiement.rendez_vous_id,
          `Acompte de ${paiement.montant.toLocaleString("fr-FR")} F reçu`,
        ).catch(() => null);
      }
    }
    return "reussi";
  }

  if (statut === "FAILED") {
    // Un echec ne remplace jamais une reussite deja enregistree.
    await admin
      .from("paiements_acompte")
      .update({ statut: "echoue" })
      .eq("order_id", orderId)
      .eq("statut", "en_attente");
  }

  const { data } = await admin
    .from("paiements_acompte")
    .select("statut")
    .eq("order_id", orderId)
    .maybeSingle<{ statut: EtatAcompte }>();
  return data?.statut ?? "en_attente";
}

/** État d'un paiement pour l'écran de la cliente, rapproché d'AfribaPay si besoin. */
export async function etatAcompte(orderId: string): Promise<EtatAcompte | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("paiements_acompte")
    .select("statut, created_at")
    .eq("order_id", orderId)
    .maybeSingle<{ statut: EtatAcompte; created_at: string }>();
  if (!data) return null;
  if (data.statut !== "en_attente") return data.statut;

  if (Date.now() - new Date(data.created_at).getTime() < DELAI_AVANT_VERIFICATION_MS) {
    return "en_attente";
  }
  const statut = await statutPayin(orderId);
  return statut ? appliquerStatut(orderId, statut) : "en_attente";
}
