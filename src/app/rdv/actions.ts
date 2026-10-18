"use server";

import { revalidatePath } from "next/cache";
import type { JourCreneaux } from "@/lib/creneaux";
import { minutes, versHeure } from "@/lib/creneaux";
import { fcfa, prixDuJour } from "@/lib/disponibilites";
import {
  chiffresIvoiriens,
  clientePourReservation,
  creneauxLibres,
} from "@/lib/reservation";
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
  prestation: string;
  date: string;
  debut: string;
  fin: string;
  prix: string;
  nouvelle: boolean;
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
  email: string;
  /** Champ invisible : seul un robot le remplit. */
  site: string;
}): Promise<ResultatReservation> {
  if (saisie.site) return { ok: false, erreur: "La réservation n'a pas pu aboutir." };
  if (!UUID.test(saisie.soinId) || !DATE.test(saisie.date) || !HEURE.test(saisie.heure)) {
    return { ok: false, erreur: "Choisis une prestation, un jour et une heure." };
  }

  const nom = saisie.nom.trim().replace(/\s+/g, " ");
  if (nom.length < 2 || nom.length > 100) {
    return { ok: false, erreur: "Indique ton nom et tes prénoms." };
  }
  const chiffres = chiffresIvoiriens(saisie.telephone);
  if (!chiffres) {
    return { ok: false, erreur: "Le numéro WhatsApp doit compter 10 chiffres, par exemple 07 00 00 00 00." };
  }
  const email = saisie.email.trim().toLowerCase();
  if (email && (email.length > 200 || !EMAIL.test(email))) {
    return { ok: false, erreur: "L'adresse e-mail ne semble pas valide." };
  }

  const cliente = await clientePourReservation({ nom, chiffres, email });
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

  const resultat = data as { id?: string; erreur?: string };
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

  const { data: soin } = await admin
    .from("soins_catalogue")
    .select("*")
    .eq("id", saisie.soinId)
    .single<SoinCatalogue>();

  revalidatePath("/rendez-vous");
  revalidatePath("/accueil");

  const debut = minutes(saisie.heure);
  return {
    ok: true,
    recap: {
      prestation: soin?.libelle_public || soin?.libelle || "",
      date: saisie.date,
      debut: saisie.heure,
      fin: versHeure(debut + (soin?.duree_std ?? 60)),
      prix: soin ? fcfa(prixDuJour(soin, saisie.date)) : "",
      nouvelle: cliente.nouvelle,
    },
  };
}
