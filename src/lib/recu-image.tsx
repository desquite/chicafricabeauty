import { ImageResponse } from "next/og";
import { libelleMode } from "@/lib/caisse";
import { REMISE_POURCENT } from "@/lib/fidelite";
import { MENTIONS_LEGALES } from "@/lib/mentions-legales";
import { INSTITUT } from "@/app/rdv/institut";

/**
 * Dessin du reçu en image PNG (moteur Satori de next/og). Séparé de la route
 * pour pouvoir le vérifier avec une facture fictive.
 *
 * Satori n'accepte qu'un enfant par bloc qui n'est pas en flex : un texte
 * fixe suivi d'une valeur s'écrit donc en une seule chaîne.
 */

const n = (x: number) => x.toLocaleString("fr-FR").replace(/ /g, " ");

export type FactureImage = {
  statut: string;
  numero_affiche: string | null;
  montant_soins_normal: number;
  montant_soins: number;
  montant_produits: number;
  remise_fidelite: number;
  acompte_deduit: number;
  total: number;
  mode_paiement: string | null;
  payee_le: string | null;
  clientes: { nom_complet: string } | null;
  lignes_facture: { type: string; libelle: string; quantite: number; prix_unitaire: number; ordre: number }[];
};

export function imageRecu(f: FactureImage) {
  const lignes = [...f.lignes_facture].sort((a, b) => a.ordre - b.ordre);
  const soins = lignes.filter((l) => l.type === "soin");
  const produits = lignes.filter((l) => l.type === "produit");
  const ecart = f.montant_soins - f.montant_soins_normal;
  const brut = f.montant_soins + f.montant_produits;
  const acompte = Math.min(f.acompte_deduit, brut - f.remise_fidelite);
  const quand = f.payee_le
    ? new Date(f.payee_le).toLocaleString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "";

  type Rangee = [string, string, boolean?];
  const blocs: { titre?: string; rangees: Rangee[] }[] = [];
  if (soins.length) {
    blocs.push({
      titre: "SOINS",
      rangees: [
        ...soins.map((l): Rangee => [l.libelle, l.prix_unitaire ? n(l.prix_unitaire) : "inclus"]),
        ...(ecart !== 0 ? [["Forfait appliqué", `${ecart > 0 ? "+" : ""}${n(ecart)}`] as Rangee] : []),
        ["Sous-total soins", n(f.montant_soins), true],
      ],
    });
  }
  if (produits.length) {
    blocs.push({
      titre: "PRODUITS",
      rangees: produits.map((l): Rangee => [`${l.quantite} x ${l.libelle}`, n(l.prix_unitaire * l.quantite)]),
    });
  }
  blocs.push({
    rangees: [
      ["Total", n(brut)],
      ...(f.remise_fidelite > 0 ? [[`Remise fidélité ${REMISE_POURCENT} %`, `-${n(f.remise_fidelite)}`] as Rangee] : []),
      ...(acompte > 0 ? [["Acompte payé en ligne", `-${n(acompte)}`] as Rangee] : []),
    ],
  });

  const nbRangees = blocs.reduce((t, b) => t + b.rangees.length + (b.titre ? 1 : 0), 0);
  // Large marge : l'adresse tient sur deux lignes, et un bloc trop serré se chevauche.
  const hauteur = 700 + nbRangees * 42;
  const legal = [MENTIONS_LEGALES.rccm && `RCCM ${MENTIONS_LEGALES.rccm}`, MENTIONS_LEGALES.ncc && `NCC ${MENTIONS_LEGALES.ncc}`]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#faf6f2",
          padding: 28,
          fontSize: 24,
          color: "#331813",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: "#ffffff",
            borderRadius: 24,
            padding: "30px 34px",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                background: "#7a3b2e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 999, background: "#c89b3c" }} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 2, color: "#4a231c" }}>CHIC AFRICA BEAUTY</div>
            <div style={{ display: "flex", fontSize: 18, color: "#6b4a3d", textAlign: "center", justifyContent: "center" }}>{INSTITUT.adresse}</div>
            <div style={{ fontSize: 18, color: "#6b4a3d" }}>{`Tél. ${INSTITUT.telephone}`}</div>
            {legal && <div style={{ fontSize: 16, color: "#6b4a3d" }}>{legal}</div>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", borderTop: "2px dashed #ddb29b", paddingTop: 12, gap: 2, flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>
              {`Reçu n° ${f.numero_affiche ?? ""}${f.statut === "annulee" ? " — ANNULÉ" : ""}`}
            </div>
            <div style={{ color: "#6b4a3d" }}>{quand}</div>
            <div style={{ color: "#6b4a3d" }}>{`Cliente : ${f.clientes?.nom_complet ?? "client de passage"}`}</div>
          </div>

          {blocs.map((b, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", borderTop: "2px dashed #ddb29b", paddingTop: 12, gap: 6, flexShrink: 0 }}>
              {b.titre && <div style={{ fontSize: 20, fontWeight: 700, color: "#a8603f", letterSpacing: 1 }}>{b.titre}</div>}
              {b.rangees.map(([gauche, droite, fort], j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 20, fontWeight: fort ? 700 : 400 }}>
                  <div style={{ display: "flex", flex: 1 }}>{gauche}</div>
                  <div style={{ display: "flex" }}>{droite}</div>
                </div>
              ))}
            </div>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#7a3b2e",
              color: "#ffffff",
              borderRadius: 16,
              padding: "14px 20px",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            <div style={{ display: "flex" }}>PAYÉ</div>
            <div style={{ display: "flex" }}>{`${n(f.total)} F CFA`}</div>
          </div>
          <div style={{ display: "flex", color: "#6b4a3d" }}>{`Mode : ${libelleMode(f.mode_paiement)}`}</div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", gap: 2, color: "#6b4a3d", fontSize: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#4a231c" }}>Merci et à très vite !</div>
            <div>Réservez en ligne : chicafricabeauty-w2nz.vercel.app/rdv</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 720,
      height: hauteur,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
