import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerWhatsapp } from "@/lib/notifications/whatsapp";
import {
  calculerRelances,
  construireRecapitulatif,
  type RdvDuJour,
} from "@/lib/notifications/recapitulatif";
import { alertes, type Anamnese } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Récapitulatif quotidien envoyé aux gérantes.
 *
 * Abidjan est en UTC+0 toute l'année : l'heure du cron Vercel, qui est en
 * UTC, correspond donc directement à l'heure locale. Aucune conversion.
 *
 * Effet de bord utile : cet appel quotidien touche la base et empêche le
 * projet Supabase du plan gratuit de se mettre en pause après une semaine
 * sans activité.
 */
export async function GET(requete: Request) {
  const secret = process.env.CRON_SECRET;
  const entete = requete.headers.get("authorization");
  if (secret && entete !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const maintenant = new Date();
  const jour = maintenant.toISOString().slice(0, 10);
  const hier = new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10);

  const [{ data: rdvs }, { data: destinataires }, { data: seancesHier }] =
    await Promise.all([
      supabase
        .from("rendez_vous")
        .select("heure_rdv, statut, clientes(id, nom, prenoms, telephone), soins_catalogue(libelle)")
        .eq("date_rdv", jour)
        .eq("statut", "prevu")
        .order("heure_rdv", { nullsFirst: false })
        .returns<RdvDuJour[]>(),
      supabase
        .from("profiles")
        .select("id, nom, telephone")
        .eq("actif", true)
        .eq("notifications_whatsapp", true)
        .not("telephone", "is", null)
        .returns<{ id: string; nom: string; telephone: string }[]>(),
      supabase
        .from("seances")
        .select("id")
        .eq("date_seance", hier)
        .returns<{ id: string }[]>(),
    ]);

  if (!destinataires || destinataires.length === 0) {
    return NextResponse.json({
      envoyes: 0,
      motif: "Aucune gérante avec un téléphone et les notifications activées.",
    });
  }

  // Contre-indications des clientes attendues aujourd'hui, en une requête.
  const idsClientes = (rdvs ?? [])
    .map((r) => r.clientes?.id)
    .filter((v): v is string => Boolean(v));

  const alertesParCliente = new Map<string, string[]>();
  if (idsClientes.length > 0) {
    const { data: bilans } = await supabase
      .from("anamneses_courantes")
      .select("*")
      .in("cliente_id", idsClientes)
      .returns<Anamnese[]>();
    for (const id of idsClientes) {
      const bilan = (bilans ?? []).find((b) => b.cliente_id === id) ?? null;
      alertesParCliente.set(id, alertes(bilan));
    }
  }

  // Relances : dernière séance de chaque cliente, hors celles déjà attendues.
  const { data: dernieres } = await supabase
    .from("seances")
    .select("cliente_id, date_seance, delai_recommande, clientes(nom, prenoms)")
    .order("date_seance", { ascending: false })
    .limit(500)
    .returns<
      {
        cliente_id: string;
        date_seance: string;
        delai_recommande: string | null;
        clientes: { nom: string; prenoms: string } | null;
      }[]
    >();

  const { data: rdvsAVenir } = await supabase
    .from("rendez_vous")
    .select("cliente_id")
    .gte("date_rdv", jour)
    .eq("statut", "prevu")
    .returns<{ cliente_id: string }[]>();

  const aRelancer = calculerRelances(
    dernieres ?? [],
    new Set((rdvsAVenir ?? []).map((r) => r.cliente_id)),
    maintenant,
  );

  const message = construireRecapitulatif({
    date: maintenant,
    rdvs: rdvs ?? [],
    alertesParCliente,
    aRelancer,
    seancesHier: seancesHier?.length ?? 0,
  });

  const resultats: { destinataire: string; ok: boolean; erreur?: string }[] = [];

  for (const d of destinataires) {
    // Le journal porte un index unique sur (type, jour, destinataire) pour les
    // envois réussis : rejouer le cron ne produit donc pas de doublon.
    const { data: deja } = await supabase
      .from("notifications_envoyees")
      .select("id")
      .eq("type", "recapitulatif")
      .eq("cle_jour", jour)
      .eq("destinataire", d.telephone)
      .eq("succes", true)
      .maybeSingle();

    if (deja) {
      resultats.push({ destinataire: d.nom, ok: true, erreur: "déjà envoyé" });
      continue;
    }

    const envoi = await envoyerWhatsapp(d.telephone, message);
    await supabase.from("notifications_envoyees").insert({
      type: "recapitulatif",
      cle_jour: jour,
      destinataire: d.telephone,
      succes: envoi.ok,
      detail: envoi.erreur ?? null,
    });
    resultats.push({ destinataire: d.nom, ok: envoi.ok, erreur: envoi.erreur });

    // Espacement volontaire : WasenderAPI passe par WhatsApp Web, une rafale
    // d'envois simultanés est ce qui déclenche les coupures.
    await new Promise((r) => setTimeout(r, 5000));
  }

  return NextResponse.json({
    jour,
    rendezVous: rdvs?.length ?? 0,
    relances: aRelancer.length,
    resultats,
  });
}
