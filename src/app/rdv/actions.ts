"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
import {
  chiffresIvoiriens,
  clientePourReservation,
  creneauxLibres,
  salutation,
  trouverCliente,
} from "@/lib/reservation";
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

/** Attente avant le lien quand la cliente paie à l'écran : un Mobile Money se valide le plus souvent en moins d'une minute. Reste sous la durée maximale de la fonction (maxDuration de page.tsx). */
const DELAI_AVANT_LIEN_MS = 45_000;

/** Actions publiques : tout ce qu'elles recoivent vient d'un navigateur inconnu. */
export async function lireCreneaux(soinId: string): Promise<JourCreneaux[] | null> {
  if (!UUID.test(soinId)) return null;
  return creneauxLibres(soinId);
}

/* ------------------------------------------------------- Reconnaissance */

/** Recherches de numéro permises par appareil et par heure. */
const RECHERCHES_PAR_HEURE = 10;

export type Reconnaissance =
  | { etat: "connue"; salut: string; emailConnu: boolean }
  | { etat: "nouvelle" }
  | { etat: "limite" };

/**
 * La cliente qui tape son numéro est-elle déjà en base ? Rend son prénom
 * seulement (« Awa K. »), jamais son nom complet, son e-mail ni son
 * historique : la page est publique. Les recherches sont limitées par
 * appareil, pour qu'on ne puisse pas essayer des numéros en série.
 */
export async function reconnaitre(saisie: {
  indicatif: string;
  telephone: string;
}): Promise<Reconnaissance> {
  const numero = normaliserNumero(saisie.indicatif || INDICATIF_DEFAUT, saisie.telephone);
  if (!numero) return { etat: "nouvelle" };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "?";
  const empreinte = createHash("sha256")
    .update(`${ip}|${h.get("user-agent") ?? ""}`)
    .digest("hex")
    .slice(0, 32);

  const admin = createAdminClient();
  const depuis = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("recherches_numero")
    .select("id", { count: "exact", head: true })
    .eq("empreinte", empreinte)
    .gte("faite_le", depuis);
  if ((count ?? 0) >= RECHERCHES_PAR_HEURE) return { etat: "limite" };
  await admin.from("recherches_numero").insert({ empreinte });
  // Le journal ne sert qu'à la limite horaire : on ne garde pas plus d'un jour.
  after(async () => {
    await admin
      .from("recherches_numero")
      .delete()
      .lt("faite_le", new Date(Date.now() - 86_400_000).toISOString());
  });

  const r = await trouverCliente(numero.international);
  if ("erreur" in r) {
    console.error(`Reconnaissance impossible : ${r.erreur}`);
    return { etat: "nouvelle" };
  }
  if (!r.cliente) return { etat: "nouvelle" };
  return {
    etat: "connue",
    salut: salutation(r.cliente),
    emailConnu: Boolean(r.cliente.email),
  };
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
  /** Prénom affiché à la confirmation (« À très vite, Awa »). */
  prenom: string;
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
  /** Vide quand la cliente a été reconnue à son numéro. */
  nom: string;
  /** Réservation pour une autre personne sur le numéro d'une cliente connue. */
  pourAutre?: boolean;
  telephone: string;
  /** Indicatif choisi, sans le +. 225 par défaut. */
  indicatif: string;
  email: string;
  /** Champ invisible : seul un robot le remplit. */
  site: string;
  /** Faux quand la cliente choisit de régler l'acompte plus tard. */
  acompteMaintenant: boolean;
}): Promise<ResultatReservation> {
  // Champ piege rempli : jadis un refus sec, mais le remplissage automatique
  // de certains navigateurs le remplit aussi, et une vraie cliente se voyait
  // refuser sans explication. On le note seulement : la limite de trois
  // rendez-vous a venir par numero suffit contre les envois en serie.
  if (saisie.site) {
    console.warn(`Réservation : champ piège rempli (${saisie.site.slice(0, 40)}), réservation poursuivie`);
  }
  if (!UUID.test(saisie.soinId) || !DATE.test(saisie.date) || !HEURE.test(saisie.heure)) {
    return { ok: false, erreur: "Choisis une prestation, un jour et une heure." };
  }

  const nomSaisi = saisie.nom.trim().replace(/\s+/g, " ");
  if (nomSaisi.length > 100) {
    return { ok: false, erreur: "Le nom est trop long." };
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

  // Une cliente reconnue à son numéro n'a plus à donner son nom : on prend
  // celui de sa fiche. Seule une nouvelle cliente doit le saisir.
  const connue = await trouverCliente(numero.international);
  const ficheExistante = "cliente" in connue ? connue.cliente : null;
  if (!ficheExistante && nomSaisi.length < 2) {
    return { ok: false, erreur: "Indique ton nom et tes prénoms." };
  }
  const nom = ficheExistante && !saisie.pourAutre ? ficheExistante.nom_complet : nomSaisi;
  if (saisie.pourAutre && nomSaisi.length < 2) {
    return { ok: false, erreur: "Indique le nom de la personne qui vient." };
  }

  const cliente = await clientePourReservation({
    nom,
    international: numero.international,
    affiche: numero.affiche,
    email,
  });
  if ("erreur" in cliente) {
    console.error(`Réservation : fiche cliente impossible (${numero.affiche}) : ${cliente.erreur}`);
    return {
      ok: false,
      erreur: `Ta fiche n'a pas pu être enregistrée. Réessaie dans un instant, ou appelle l'institut au ${INSTITUT.telephone}.`,
    };
  }

  const admin = createAdminClient();
  const appel = () =>
    admin.rpc("reserver_en_ligne", {
      p_cliente: cliente.id,
      p_soin: saisie.soinId,
      p_date: saisie.date,
      p_heure: saisie.heure,
    });
  // Un aléa réseau entre le serveur et la base ne doit pas faire perdre le
  // créneau : un second essai, la fonction refusant d'elle-même un doublon.
  let { data, error } = await appel();
  if (error) {
    console.error(`Réservation : premier essai refusé (${error.code ?? "?"}) : ${error.message}`);
    ({ data, error } = await appel());
  }
  if (error) {
    console.error(`Réservation : enregistrement impossible (${error.code ?? "?"}) : ${error.message}`);
    return {
      ok: false,
      erreur: `Le rendez-vous n'a pas pu être enregistré. Réessaie dans un instant, ou appelle l'institut au ${INSTITUT.telephone}.`,
    };
  }

  const resultat = data as { id?: string; code?: string; erreur?: string };
  // Rendez-vous pris pour une autre personne sur ce numéro : la fiche reste
  // celle du numéro, la gérante voit qui vient vraiment.
  if (resultat.id && saisie.pourAutre && ficheExistante) {
    await admin
      .from("rendez_vous")
      .update({ notes: `Réservé pour : ${nomSaisi}` })
      .eq("id", resultat.id);
  }
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
  //   payer maintenant        le lien aussi, sauf si le paiement a abouti
  //                           entre-temps : le recu part alors seul
  // Le lien partait jadis seulement sur « payer plus tard ». Une cliente qui
  // choisissait de payer tout de suite, choix propose par defaut, puis
  // n'allait pas au bout (passage par l'appli Wave, code Orange, reseau)
  // n'avait plus aucun moyen de payer : la gerante devait supprimer le
  // rendez-vous pour qu'elle reserve de nouveau.
  // Paiement immediat (apres la veille 18h) : le modele WhatsApp annonce une
  // limite « a 18h » qui serait fausse ; la cliente garde l'ecran et retrouve
  // son paiement en revenant sur /rdv.
  const rdvId = resultat.id!;
  const requis = Boolean(rdv?.acompte_requis);
  const quand = quandLisible(saisie.date, saisie.heure);
  const nomSoin = soin?.libelle_public || soin?.libelle || "soin";
  const alerter = async () => {
    await alerterGerantes(
      `Nouveau rendez-vous en ligne : ${nom} (${numero.affiche}) · ${nomSoin} · ${quand}` +
        (requis ? " · acompte à régler" : "") +
        (cliente.nouvelle ? " · nouvelle cliente, fiche santé à remplir" : ""),
    ).catch(() => null);
  };
  after(async () => {
    // La gerante est prevenue tout de suite, avant l eventuelle attente.
    await alerter();
    if (!requis) {
      await envoyerMessageAcompte(rdvId, "confirmation").catch(() => null);
    } else if (!immediat) {
      if (saisie.acompteMaintenant) {
        // Laisser au paiement lance a l'ecran le temps d'aboutir : une cliente
        // qui vient de payer ne recoit pas « reglez l'acompte ».
        await new Promise((r) => setTimeout(r, DELAI_AVANT_LIEN_MS));
        const { data: etat } = await admin
          .from("rendez_vous")
          .select("acompte_paye_le")
          .eq("id", rdvId)
          .maybeSingle<{ acompte_paye_le: string | null }>();
        if (etat?.acompte_paye_le) return;
      }
      await envoyerMessageAcompte(rdvId, "lien").catch(() => null);
    }
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
      prenom: ficheExistante && !saisie.pourAutre ? salutation(ficheExistante) : nomSaisi.split(" ")[0],
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
