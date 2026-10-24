"use server";

import type { EtatAcompte, ResultatInitiation } from "@/lib/acompte";
import { OPERATEURS, type Operateur } from "@/lib/afribapay";
import {
  etatVersement,
  initierVersement,
  ORDER_ID_ABONNEMENT,
} from "@/lib/paiement-abonnement";
import { chiffresIvoiriens } from "@/lib/reservation";

const CODE = /^[0-9a-f]{12}$/;

/** Actions publiques : tout ce qu'elles reçoivent vient d'un navigateur inconnu. */
export async function payerAbonnement(saisie: {
  code: string;
  operateur: string;
  telephone: string;
  otp: string;
  mode: "echeance" | "tout";
}): Promise<ResultatInitiation> {
  if (!CODE.test(saisie.code)) return { ok: false, erreur: "Abonnement introuvable." };
  if (!OPERATEURS.includes(saisie.operateur as Operateur)) {
    return { ok: false, erreur: "Choisis ton opérateur Mobile Money." };
  }
  const telephone = chiffresIvoiriens(saisie.telephone);
  if (!telephone) return { ok: false, erreur: "Le numéro qui paie doit compter 10 chiffres." };
  const otp = saisie.otp.replace(/\D/g, "");
  if (saisie.operateur === "orange" && !/^\d{4,8}$/.test(otp)) {
    return { ok: false, erreur: "Indique le code de paiement Orange Money reçu sur ton téléphone." };
  }
  return initierVersement({
    code: saisie.code,
    operateur: saisie.operateur as Operateur,
    telephone,
    otp: saisie.operateur === "orange" ? otp : undefined,
    mode: saisie.mode === "tout" ? "tout" : "echeance",
  });
}

export async function suivreAbonnement(orderId: string): Promise<EtatAcompte | null> {
  if (!ORDER_ID_ABONNEMENT.test(orderId)) return null;
  return etatVersement(orderId);
}
