import "server-only";
import { LANGUE_MODELES } from "@/lib/notifications/modeles";
import { envoyerModeleWhatsapp, envoyerWhatsapp } from "@/lib/notifications/whatsapp";
import { quandLisible } from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Alerte immédiate aux gérantes : une réservation ou une annulation en ligne.
 *
 * Même canal que le récapitulatif du matin : texte libre par WasenderAPI,
 * ou modèle Infobip pour les gérantes basculées (notifications_infobip).
 *
 *   alerte_gerante (Utilitaire)  {{1}} prénom de la gérante  {{2}} l'alerte
 *
 * L'alerte tient sur une ligne : une variable de modèle n'accepte pas de
 * retour à la ligne. Un échec n'empêche jamais la réservation : l'agenda et
 * le récapitulatif du matin restent la référence.
 */
/** Alerte sur un rendez-vous précis : « <événement> : Awa · Soin du corps · mardi 20 octobre à 10h00 ». */
export async function alerterGerantesRdv(rdvId: string, evenement: string) {
  const { data: r } = await createAdminClient()
    .from("rendez_vous")
    .select("date_rdv, heure_rdv, clientes(nom_complet, telephone), soins_catalogue(libelle)")
    .eq("id", rdvId)
    .maybeSingle<{
      date_rdv: string;
      heure_rdv: string | null;
      clientes: { nom_complet: string; telephone: string } | null;
      soins_catalogue: { libelle: string } | null;
    }>();
  if (!r) return;
  await alerterGerantes(
    [
      evenement,
      [r.clientes?.nom_complet, r.soins_catalogue?.libelle, quandLisible(r.date_rdv, r.heure_rdv)]
        .filter(Boolean)
        .join(" · "),
    ].join(" : "),
  );
}

export async function alerterGerantes(alerte: string) {
  const admin = createAdminClient();
  const { data: gerantes } = await admin
    .from("profiles")
    .select("nom, telephone, notifications_infobip")
    .eq("actif", true)
    .eq("notifications_whatsapp", true)
    .not("telephone", "is", null)
    .returns<{ nom: string; telephone: string; notifications_infobip: boolean }[]>();

  const ligne = alerte.replace(/\s+/g, " ").trim();
  const jour = new Date().toISOString().slice(0, 10);

  for (const g of gerantes ?? []) {
    const prenom = g.nom.split(" ")[0] || g.nom;
    const r = g.notifications_infobip
      ? await envoyerModeleWhatsapp(g.telephone, "alerte_gerante", [prenom, ligne], LANGUE_MODELES)
      : await envoyerWhatsapp(g.telephone, `Chic Africa Online\n\n${ligne}`);
    await admin.from("notifications_envoyees").insert({
      type: "alerte_gerante",
      cle_jour: jour,
      // Plusieurs alertes le même jour : l'horodatage les distingue dans le
      // journal, dont l'unicité porte sur (type, jour, destinataire).
      destinataire: `${g.telephone}@${new Date().toISOString()}`,
      succes: r.ok,
      detail: r.erreur ?? ligne.slice(0, 300),
      canal: g.notifications_infobip ? "infobip" : "wasender",
    });
  }
}
