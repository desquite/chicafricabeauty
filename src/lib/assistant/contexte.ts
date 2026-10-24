import "server-only";
import { finAbonnement, situationPaiement, type Abonnement } from "@/lib/abonnements";
import { adressePublique } from "@/lib/adresse";
import { prixDuJour, type PrixSoin } from "@/lib/disponibilites";
import { creneauxLibres } from "@/lib/reservation";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";

/**
 * Ce que l'assistant sait de l'institut et de la cliente au moment de
 * répondre, lu en direct dans l'application : jamais de prix ni d'horaire
 * appris par cœur, qui seraient faux à la première modification.
 */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const h = (t: string) => `${Number(t.slice(0, 2))}h${t.slice(3, 5)}`;
const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const jourLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

type Soin = PrixSoin & {
  id: string;
  libelle: string;
  libelle_public: string | null;
  groupe: string | null;
  duree_std: number | null;
  en_ligne: boolean;
};

export async function contexteEnDirect(clienteId: string | null, maintenant = new Date()) {
  const admin = createAdminClient();
  const jour = maintenant.toISOString().slice(0, 10);
  const dans30 = new Date(maintenant.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const site = await adressePublique();

  const [{ data: horaires }, { data: fermetures }, { data: soins }, { data: produits }] = await Promise.all([
    admin.from("horaires_semaine").select("jour, ouvert, ouverture, fermeture").returns<
      { jour: number; ouvert: boolean; ouverture: string | null; fermeture: string | null }[]
    >(),
    admin
      .from("fermetures")
      .select("date_debut, date_fin, heure_debut, heure_fin, motif")
      .lte("date_debut", dans30)
      .gte("date_fin", jour)
      .returns<{ date_debut: string; date_fin: string; heure_debut: string | null; heure_fin: string | null; motif: string | null }[]>(),
    admin
      .from("soins_catalogue")
      .select("id, libelle, libelle_public, groupe, duree_std, en_ligne, prix, prix_promo, promo_debut, promo_fin")
      .eq("actif", true)
      .order("ordre")
      .returns<Soin[]>(),
    admin.from("produits").select("nom, prix_vente, stock").eq("actif", true).order("nom").returns<
      { nom: string; prix_vente: number; stock: number }[]
    >(),
  ]);

  const lignes: string[] = [];
  lignes.push(
    `Nous sommes le ${jourLong(jour)} ${maintenant.getUTCFullYear()}, il est ${h(maintenant.toISOString().slice(11, 16))} à Abidjan.`,
  );
  lignes.push(`Lien de réservation : ${site}/rdv`);

  lignes.push("", "HORAIRES D'OUVERTURE");
  for (const x of [...(horaires ?? [])].sort((a, b) => ((a.jour + 6) % 7) - ((b.jour + 6) % 7))) {
    lignes.push(`- ${JOURS[x.jour]} : ${x.ouvert && x.ouverture && x.fermeture ? `${h(x.ouverture)} – ${h(x.fermeture)}` : "fermé"}`);
  }
  if (fermetures?.length) {
    lignes.push("Fermetures exceptionnelles à venir :");
    for (const x of fermetures) {
      lignes.push(
        `- du ${jourLong(x.date_debut)} au ${jourLong(x.date_fin)}${x.heure_debut && x.heure_fin ? ` de ${h(x.heure_debut)} à ${h(x.heure_fin)}` : ""}${x.motif ? ` (${x.motif})` : ""}`,
      );
    }
  }

  lignes.push("", "SOINS (prix du jour)");
  for (const s of soins ?? []) {
    const prix = prixDuJour(s, jour) ?? s.prix ?? 0;
    const promo = prix !== s.prix && s.promo_fin ? ` (promotion jusqu'au ${jourLong(s.promo_fin)}, prix normal ${f(s.prix ?? 0)})` : "";
    lignes.push(
      `- ${s.libelle_public || s.libelle} : ${f(prix)}${promo}${s.duree_std ? `, ${s.duree_std} min` : ""}${s.en_ligne ? "" : ", réservation par la gérante seulement"}`,
    );
  }

  lignes.push("", "PRODUITS EN VENTE");
  for (const p of produits ?? []) lignes.push(`- ${p.nom} : ${f(p.prix_vente)}${p.stock > 0 ? "" : " (rupture de stock)"}`);

  // Créneaux libres des 7 prochains jours, pour un soin d'1 h et un soin
  // d'1 h 30 : de quoi proposer des heures sans tout recalculer par soin.
  lignes.push("", "CRÉNEAUX LIBRES (7 prochains jours)");
  for (const duree of [60, 90]) {
    const soin = (soins ?? []).find((s) => s.en_ligne && s.duree_std === duree);
    if (!soin) continue;
    const jours = ((await creneauxLibres(soin.id).catch(() => null)) ?? []).slice(0, 8);
    lignes.push(`Pour un soin de ${duree === 60 ? "1 h" : "1 h 30"} (ex. ${soin.libelle_public || soin.libelle}) :`);
    const avec = jours.filter((j) => j.creneaux.length);
    if (!avec.length) lignes.push("- aucun créneau libre");
    for (const j of avec) lignes.push(`- ${jourLong(j.date)} : ${j.creneaux.slice(0, 8).map(h).join(", ")}`);
  }

  lignes.push("", "LA CLIENTE");
  if (!clienteId) {
    lignes.push("Numéro inconnu : pas de fiche cliente. Nouvelle cliente probable.");
    return lignes.join("\n");
  }

  const [{ data: cliente }, { data: rdvs }, { data: seance }, { data: abos }] = await Promise.all([
    admin.from("clientes").select("nom_complet, prenom_usuel").eq("id", clienteId).maybeSingle<{ nom_complet: string; prenom_usuel: string | null }>(),
    admin
      .from("rendez_vous")
      .select("date_rdv, heure_rdv, acompte_requis, acompte_paye_le, code_acompte, soins_catalogue(libelle, libelle_public)")
      .eq("cliente_id", clienteId)
      .eq("statut", "prevu")
      .is("remplace_par", null)
      .is("masque_le", null)
      .gte("date_rdv", jour)
      .order("date_rdv")
      .order("heure_rdv")
      .limit(3)
      .returns<
        {
          date_rdv: string;
          heure_rdv: string | null;
          acompte_requis: boolean;
          acompte_paye_le: string | null;
          code_acompte: string;
          soins_catalogue: { libelle: string; libelle_public: string | null } | null;
        }[]
      >(),
    admin.from("seances").select("date_seance").eq("cliente_id", clienteId).order("date_seance", { ascending: false }).limit(1).maybeSingle<{ date_seance: string }>(),
    admin
      .from("abonnements")
      .select("*, soins_catalogue(libelle)")
      .eq("cliente_id", clienteId)
      .in("statut", ["actif", "pause"])
      .returns<(Abonnement & { soins_catalogue: { libelle: string } | null })[]>(),
  ]);

  if (cliente) lignes.push(`Cliente connue : ${nomChaleureux(cliente)} (fiche : ${cliente.nom_complet}).`);
  lignes.push(seance ? `Dernière venue : ${jourLong(seance.date_seance)}.` : "Jamais venue à l'institut.");
  if (!rdvs?.length) lignes.push("Aucun rendez-vous à venir.");
  for (const r of rdvs ?? []) {
    const soin = r.soins_catalogue?.libelle_public || r.soins_catalogue?.libelle || "soin";
    const acompte = r.acompte_requis
      ? r.acompte_paye_le
        ? "acompte payé"
        : `acompte NON payé, lien de paiement : ${site}/a/${r.code_acompte}`
      : "pas d'acompte demandé";
    lignes.push(`Rendez-vous : ${soin}, ${jourLong(r.date_rdv)}${r.heure_rdv ? ` à ${h(r.heure_rdv)}` : ""} ; ${acompte}.`);
  }
  for (const a of abos ?? []) {
    const { data: versements } = await admin
      .from("paiements_abonnement")
      .select("montant")
      .eq("abonnement_id", a.id)
      .eq("statut", "reussi")
      .returns<{ montant: number }[]>();
    const s = situationPaiement(a, (versements ?? []).reduce((t, v) => t + v.montant, 0), jour);
    lignes.push(
      `Abonnée : ${a.soins_catalogue?.libelle ?? "soin"}, ${a.nb_seances} séances jusqu'au ${jourLong(finAbonnement(a))}${a.statut === "pause" ? " (en pause)" : ""} ; reste à payer ${f(s.reste)}${s.reste ? `, lien : ${site}/p/${a.code_paiement}` : ""}.`,
    );
  }
  return lignes.join("\n");
}
