"use server";

import { adressePublique } from "@/lib/adresse";
import { creerPaiementJeko, jekoConfigure, MOYENS_JEKO, type MoyenJeko } from "@/lib/jeko";
import { chiffresIvoiriens } from "@/lib/reservation";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultatCommande = { ok: true; lien: string } | { ok: false; erreur: string };

/**
 * Crée la commande (stock réservé) puis la demande de paiement Jèko. La
 * cliente part ensuite chez son opérateur ; elle revient sur la page de
 * suivi, qui relit le statut chez Jèko.
 */
export async function passerCommande(s: {
  lignes: { produit: string; quantite: number }[];
  nom: string;
  telephone: string;
  commune: string;
  adresse: string;
  note: string;
  moyen: string;
}): Promise<ResultatCommande> {
  if (!jekoConfigure()) {
    return { ok: false, erreur: "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous sur WhatsApp pour commander." };
  }
  const nom = s.nom.trim();
  const telephone = chiffresIvoiriens(s.telephone);
  if (nom.length < 2) return { ok: false, erreur: "Indiquez votre prénom et votre nom." };
  if (!telephone) return { ok: false, erreur: "Le numéro doit compter 10 chiffres, par exemple 07 00 00 00 00." };
  if (!s.commune.trim()) return { ok: false, erreur: "Choisissez votre commune." };
  if (s.adresse.trim().length < 4) return { ok: false, erreur: "Indiquez le quartier et un point de repère pour le livreur." };
  if (!MOYENS_JEKO.includes(s.moyen as MoyenJeko)) return { ok: false, erreur: "Choisissez votre moyen de paiement." };
  const lignes = s.lignes.filter((l) => typeof l.produit === "string" && Number.isInteger(l.quantite) && l.quantite > 0);
  if (!lignes.length) return { ok: false, erreur: "Votre panier est vide." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("creer_commande", {
    p_nom: nom.slice(0, 120),
    p_telephone: telephone,
    p_commune: s.commune.trim().slice(0, 60),
    p_adresse: s.adresse.trim().slice(0, 500),
    p_note: s.note.trim().slice(0, 300),
    p_operateur: s.moyen,
    p_lignes: lignes,
  });
  const c = data as { id?: string; numero?: string; code?: string; montant?: number; erreur?: string; produit?: string } | null;
  if (error || !c) return { ok: false, erreur: "La commande n'a pas pu être enregistrée. Réessayez dans un instant." };
  if (c.erreur === "stock") {
    return { ok: false, erreur: `Il ne reste plus assez de « ${c.produit} ». Ajustez la quantité dans votre panier.` };
  }
  if (c.erreur || !c.id || !c.code || !c.numero || !c.montant) {
    return { ok: false, erreur: "La commande n'a pas pu être enregistrée. Vérifiez votre panier." };
  }

  const base = `${await adressePublique()}/boutique/commande/${c.code}`;
  const r = await creerPaiementJeko({
    montant: c.montant,
    reference: c.numero,
    moyen: s.moyen as MoyenJeko,
    retourOk: `${base}?retour=ok`,
    retourErreur: `${base}?retour=erreur`,
  });
  if (!r.ok) {
    console.error(`Jèko : ${c.numero} ${r.erreur}`);
    await admin.from("commandes").update({ erreur_paiement: r.erreur.slice(0, 500) }).eq("id", c.id);
    await admin.rpc("abandonner_commande", { p_commande: c.id });
    return { ok: false, erreur: "Le paiement n'a pas pu démarrer. Réessayez dans un instant, ou choisissez un autre moyen." };
  }
  await admin.from("commandes").update({ jeko_id: r.id }).eq("id", c.id);
  return { ok: true, lien: r.lien };
}
