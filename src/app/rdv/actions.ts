"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { alerterGerantes } from "@/lib/notifications/gerantes";
import {
  etatAcompte,
  initierAcompte,
  type EtatAcompte,
  type ResultatInitiation,
} from "@/lib/acompte";
import { OPERATEURS, paiementConfigure, type Operateur } from "@/lib/afribapay";
import type { JourCreneaux } from "@/lib/creneaux";
import { minutes, versHeure } from "@/lib/creneaux";
import { fcfa, prixDuJour } from "@/lib/disponibilites";
import { INDICATIF_DEFAUT, normaliserNumero } from "@/lib/indicatifs";
import { chiffresIvoiriens, clientePourReservation, creneauxLibres } from "@/lib/reservation";
import { envoyerMessageAcompte } from "@/lib/notifications/acompte";
import {
  acompteDuRdv,
  echeanceAcompte,
  paiementImmediat,
  quandLisible,
  type RdvAcompte,
} from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SoinCatalogue } from "@/lib/types";
import { INSTITUT } from "./institut";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Actions publiques : tout ce qu'elles recoivent vient d'un navigateur inconnu. */
export async function lireCreneaux(soinId: string): Promise<JourCreneaux[] | null> {
  if (!UUID.test(soinId)) return null;
  return creneauxLibres(soinId);
}

export type Recapitulatif = {
  /** Code du lien de paiement /a/<code> ; aléatoire, donc impossible à deviner. */
  code: string;
  prestation: string;
  date: string;
  debut: string;
  fin: string;
  prix: string;
  nouvelle: boolean;
  /** L'acompte est obligatoire pour ce rendez-vous. */
  acompteRequis: boolean;
  /** Échéance ISO du paiement, si l'acompte est requis. */
  echeance: string | null;
  /** Réservé après la veille 18h : l'acompte se paie maintenant. */
  immediat: boolean;
  /** Montant de l'acompte de ce soin : jamais plus que son prix. */
  acompte: number;
};

export type ResultatReservation =
  | { ok: true; recap: Recapitulatif }
  | { ok: false; erreur: string; creneaux?: JourCreneaux[] | null };

export async function reserver(saisie: {
  soinId: string;
  date: string;
  heure: string;
  nom: string;
  telephone: string;
  /** Indicatif choisi, sans le +. 225 par défaut. */
  indicatif: string;
  email: string;
  /** Champ invisible : seul un robot le remplit. */
  site: string;
  /** Faux quand la cliente choisit de régler l'acompte plus tard. */
  acompteMaintenant: boolean;
}): Promise<ResultatReservation> {
  if (saisie.site) return { ok: false, erreur: "La réservation n'a pas pu aboutir." };
  if (!UUID.test(saisie.soinId) || !DATE.test(saisie.date) || !HEURE.test(saisie.heure)) {
    return { ok: false, erreur: "Choisis une prestation, un jour et une heure." };
  }

  const nom = saisie.nom.trim().replace(/\s+/g, " ");
  if (nom.length < 2 || nom.length > 100) {
    return { ok: false, erreur: "Indique ton nom et tes prénoms." };
  }
  const numero = normaliserNumero(saisie.indicatif || INDICATIF_DEFAUT, saisie.telephone);
  if (!numero) {
    return {
      ok: false,
      erreur:
        (saisie.indicatif || INDICATIF_DEFAUT) === INDICATIF_DEFAUT
          ? "Le numéro WhatsApp doit compter 10 chiffres, par exemple 07 00 00 00 00."
          : "Ce numéro ne semble pas valable pour le pays choisi.",
    };
  }
  const email = saisie.email.trim().toLowerCase();
  if (email && (email.length > 200 || !EMAIL.test(email))) {
    return { ok: false, erreur: "L'adresse e-mail ne semble pas valide." };
  }

  const cliente = await clientePourReservation({
    nom,
    international: numero.international,
    affiche: numero.affiche,
    email,
  });
  if ("erreur" in cliente) {
    return { ok: false, erreur: "La réservation n'a pas pu aboutir. Réessaie dans un instant." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserver_en_ligne", {
    p_cliente: cliente.id,
    p_soin: saisie.soinId,
    p_date: saisie.date,
    p_heure: saisie.heure,
  });
  if (error) {
    return { ok: false, erreur: "La réservation n'a pas pu aboutir. Réessaie dans un instant." };
  }

  const resultat = data as { id?: string; code?: string; erreur?: string };
  if (resultat.erreur) {
    if (resultat.erreur === "trop") {
      return {
        ok: false,
        erreur: `Tu as déjà 3 rendez-vous à venir. Pour en prendre un autre, appelle l'institut au ${INSTITUT.telephone}.`,
      };
    }
    if (resultat.erreur === "soin") {
      return { ok: false, erreur: "Cette prestation n'est plus proposée en ligne." };
    }
    // Pris, ferme, passe : le creneau n'est plus libre. On renvoie la liste a
    // jour pour que la cliente en choisisse un autre sans recharger.
    return {
      ok: false,
      erreur:
        resultat.erreur === "pris"
          ? "Ce créneau vient d'être réservé par une autre cliente. Choisis-en un autre."
          : "Ce créneau n'est plus disponible. Choisis-en un autre.",
      creneaux: await creneauxLibres(saisie.soinId),
    };
  }

  const [{ data: soin }, { data: rdv }, { data: reglages }] = await Promise.all([
    admin.from("soins_catalogue").select("*").eq("id", saisie.soinId).single<SoinCatalogue>(),
    admin
      .from("rendez_vous")
      .select("date_rdv, created_at, source, acompte_requis, acompte_paye_le")
      .eq("id", resultat.id!)
      .single<RdvAcompte>(),
    admin.from("reglages_rdv").select("acompte_montant").maybeSingle<{ acompte_montant: number }>(),
  ]);

  // Garde-fou : sans AfribaPay configure, la cliente ne pourrait pas payer et
  // serait annulee. L'acompte n'est alors pas exige.
  if (rdv?.acompte_requis && !paiementConfigure()) {
    await admin.from("rendez_vous").update({ acompte_requis: false }).eq("id", resultat.id!);
    rdv.acompte_requis = false;
  }

  const echeance = rdv?.acompte_requis ? echeanceAcompte(rdv) : null;
  const immediat = rdv ? paiementImmediat(rdv) : false;

  // Les messages partent apres la reponse : la cliente n'attend pas WhatsApp.
  // Un echec d'envoi ne remet pas la reservation en cause, l'ecran de
  // confirmation porte deja tout.
  //   sans acompte a regler   confirmation (avec le lien pour annuler)
  //   payer plus tard         le lien de paiement, qui vaut confirmation
  //   payer maintenant        le recu partira a la reussite du paiement
  const rdvId = resultat.id!;
  const requis = Boolean(rdv?.acompte_requis);
  const quand = quandLisible(saisie.date, saisie.heure);
  const nomSoin = soin?.libelle_public || soin?.libelle || "soin";
  after(async () => {
    if (!requis) {
      await envoyerMessageAcompte(rdvId, "confirmation").catch(() => null);
    } else if (!saisie.acompteMaintenant && !immediat) {
      await envoyerMessageAcompte(rdvId, "lien").catch(() => null);
    }
    await alerterGerantes(
      `Nouveau rendez-vous en ligne : ${nom} (${numero.affiche}) · ${nomSoin} · ${quand}` +
        (requis ? " · acompte à régler" : "") +
        (cliente.nouvelle ? " · nouvelle cliente, fiche santé à remplir" : ""),
    ).catch(() => null);
  });

  revalidatePath("/rendez-vous");
  revalidatePath("/accueil");

  const debut = minutes(saisie.heure);
  return {
    ok: true,
    recap: {
      code: resultat.code!,
      prestation: soin?.libelle_public || soin?.libelle || "",
      date: saisie.date,
      debut: saisie.heure,
      fin: versHeure(debut + (soin?.duree_std ?? 60)),
      prix: soin ? fcfa(prixDuJour(soin, saisie.date)) : "",
      nouvelle: cliente.nouvelle,
      acompteRequis: Boolean(rdv?.acompte_requis),
      echeance: echeance?.toISOString() ?? null,
      immediat,
      acompte: acompteDuRdv(reglages?.acompte_montant ?? 0, soin, saisie.date),
    },
  };
}

/* ------------------------------------------------------------------ Acompte */

const CODE = /^[0-9a-f]{12}$/;

export async function payerAcompte(saisie: {
  code: string;
  operateur: string;
  telephone: string;
  otp: string;
}): Promise<ResultatInitiation> {
  if (!CODE.test(saisie.code)) return { ok: false, erreur: "Rendez-vous introuvable." };
  if (!OPERATEURS.includes(saisie.operateur as Operateur)) {
    return { ok: false, erreur: "Choisis ton opérateur Mobile Money." };
  }
  const telephone = chiffresIvoiriens(saisie.telephone);
  if (!telephone) {
    return { ok: false, erreur: "Le numéro qui paie doit compter 10 chiffres." };
  }
  const otp = saisie.otp.replace(/\D/g, "");
  if (saisie.operateur === "orange" && !/^\d{4,8}$/.test(otp)) {
    return { ok: false, erreur: "Indique le code de paiement Orange Money reçu sur ton téléphone." };
  }

  const r = await initierAcompte({
    code: saisie.code,
    operateur: saisie.operateur as Operateur,
    telephone,
    otp: saisie.operateur === "orange" ? otp : undefined,
  });
  if (r.ok) revalidatePath("/rendez-vous");
  return r;
}

const ORDER_ID = /^CAB-[A-Z0-9]+-[A-F0-9]{12}$/;

export async function suivreAcompte(orderId: string): Promise<EtatAcompte | null> {
  if (!ORDER_ID.test(orderId)) return null;
  return etatAcompte(orderId);
}
