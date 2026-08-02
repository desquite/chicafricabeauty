import "server-only";
import { JOURS_PAR_DELAI } from "@/lib/types";

export type RdvDuJour = {
  heure_rdv: string | null;
  statut: string;
  clientes: { id: string; nom: string; prenoms: string; telephone: string } | null;
  soins_catalogue: { libelle: string } | null;
};

export type ARelancer = {
  prenoms: string;
  nom: string;
  jours: number;
};

const heure = (h: string | null) => (h ? h.slice(0, 5) : "heure à définir");

/**
 * Construit le message envoyé aux gérantes.
 *
 * Contrainte de fond : WhatsApp est lu sur un téléphone, souvent debout entre
 * deux clientes. Le message doit tenir dans un écran et se lire sans faire
 * défiler. On liste donc les rendez-vous, on signale les contre-indications
 * par un simple marqueur, et on renvoie à l'application pour le détail.
 */
export function construireRecapitulatif({
  date,
  rdvs,
  alertesParCliente,
  aRelancer,
  seancesHier,
}: {
  date: Date;
  rdvs: RdvDuJour[];
  alertesParCliente: Map<string, string[]>;
  aRelancer: ARelancer[];
  seancesHier: number;
}): string {
  const jour = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const lignes: string[] = [`*Chic Africa Beauty* — ${jour}`, ""];

  if (rdvs.length === 0) {
    lignes.push("Aucun rendez-vous prévu aujourd'hui.");
  } else {
    lignes.push(
      `*${rdvs.length} rendez-vous* aujourd'hui`,
      ...rdvs.map((r) => {
        const cliente = r.clientes
          ? `${r.clientes.prenoms} ${r.clientes.nom}`
          : "Cliente inconnue";
        const soin = r.soins_catalogue ? ` — ${r.soins_catalogue.libelle}` : "";
        const nb = r.clientes ? (alertesParCliente.get(r.clientes.id)?.length ?? 0) : 0;
        const marque = nb > 0 ? ` ⚠️ ${nb}` : "";
        return `• ${heure(r.heure_rdv)} ${cliente}${soin}${marque}`;
      }),
    );
    if ([...alertesParCliente.values()].some((a) => a.length > 0)) {
      lignes.push("", "⚠️ = contre-indications à vérifier sur la fiche.");
    }
  }

  if (aRelancer.length > 0) {
    lignes.push(
      "",
      `*${aRelancer.length} cliente${aRelancer.length > 1 ? "s" : ""} à relancer*`,
      ...aRelancer
        .slice(0, 8)
        .map((c) => `• ${c.prenoms} ${c.nom} — ${c.jours} jours sans séance`),
    );
    if (aRelancer.length > 8) {
      lignes.push(`… et ${aRelancer.length - 8} autres.`);
    }
  }

  if (seancesHier > 0) {
    lignes.push("", `Hier : ${seancesHier} séance${seancesHier > 1 ? "s" : ""} saisie${seancesHier > 1 ? "s" : ""}.`);
  }

  return lignes.join("\n");
}

/**
 * Clientes dont le délai recommandé est dépassé de plus d'une semaine.
 *
 * La marge d'une semaine évite de relancer quelqu'un qui a simplement décalé
 * de deux jours : une relance trop prompte se retourne contre l'institut.
 */
export function calculerRelances(
  dernieresSeances: {
    cliente_id: string;
    date_seance: string;
    delai_recommande: string | null;
    clientes: { nom: string; prenoms: string } | null;
  }[],
  clientesAvecRdv: Set<string>,
  aujourdhui: Date,
): ARelancer[] {
  const relances: ARelancer[] = [];
  const vues = new Set<string>();

  for (const s of dernieresSeances) {
    if (vues.has(s.cliente_id)) continue;
    vues.add(s.cliente_id);
    if (clientesAvecRdv.has(s.cliente_id)) continue;
    if (!s.delai_recommande) continue;

    const attendu = JOURS_PAR_DELAI[s.delai_recommande];
    if (!attendu) continue;

    const jours = Math.floor(
      (aujourdhui.getTime() - new Date(s.date_seance).getTime()) / 86_400_000,
    );
    if (jours > attendu + 7 && s.clientes) {
      relances.push({ prenoms: s.clientes.prenoms, nom: s.clientes.nom, jours });
    }
  }

  return relances.sort((a, b) => b.jours - a.jours);
}
