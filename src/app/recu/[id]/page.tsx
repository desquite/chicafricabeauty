import { notFound, redirect } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { libelleMode } from "@/lib/caisse";
import { ouvreDroit, PAS_FIDELITE, rangSeance, REMISE_POURCENT } from "@/lib/fidelite";
import { MENTIONS_LEGALES } from "@/lib/mentions-legales";
import { createClient } from "@/lib/supabase/server";
import { INSTITUT } from "@/app/rdv/institut";
import { BarreRecu } from "./barre";

export const metadata = { title: "Reçu — Chic Africa Beauty" };

type Facture = {
  id: string;
  statut: "brouillon" | "payee" | "annulee";
  numero_affiche: string | null;
  cliente_id: string | null;
  montant_soins_normal: number;
  montant_soins: number;
  montant_produits: number;
  remise_fidelite: number;
  remise_sur: "soin" | "produit" | null;
  acompte_deduit: number;
  total: number;
  mode_paiement: string | null;
  payee_le: string | null;
  notes: string | null;
  clientes: { nom_complet: string; telephone: string } | null;
  encaissee: { nom: string } | null;
};

const n = (x: number) => x.toLocaleString("fr-FR");

/**
 * Reçu d'une facture encaissée, prêt à imprimer : ticket 80 mm pour
 * l'imprimante de caisse, ou A5. Hors du menu de l'application pour que
 * l'impression ne porte que le reçu.
 */
export default async function PageRecu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string; imprimer?: string }>;
}) {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  const { id } = await params;
  const { format: f, imprimer } = await searchParams;
  const format = f === "a5" ? "a5" : "ticket";
  const supabase = await createClient();

  const { data: facture } = await supabase
    .from("factures")
    .select("*, clientes(nom_complet, telephone), encaissee:encaissee_par(nom)")
    .eq("id", id)
    .maybeSingle<Facture>();
  if (!facture) notFound();
  if (facture.statut === "brouillon") redirect(`/caisse?f=${facture.id}`);

  const [{ data: lignes }, fidelite] = await Promise.all([
    supabase
      .from("lignes_facture")
      .select("type, libelle, quantite, prix_unitaire")
      .eq("facture_id", id)
      .order("ordre")
      .returns<{ type: "soin" | "produit"; libelle: string; quantite: number; prix_unitaire: number }[]>(),
    facture.cliente_id
      ? supabase
          .from("seances")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", facture.cliente_id)
          .is("abonnement_id", null)
      : Promise.resolve({ count: null }),
  ]);

  const soins = (lignes ?? []).filter((l) => l.type === "soin");
  const produits = (lignes ?? []).filter((l) => l.type === "produit");
  const ecartForfait = facture.montant_soins - facture.montant_soins_normal;
  const quand = facture.payee_le
    ? new Date(facture.payee_le).toLocaleString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "";
  // Prochaine remise fidélité : après les séances déjà saisies.
  let ligneFidelite: string | null = null;
  if (fidelite.count !== null && facture.cliente_id) {
    const prochaine = rangSeance(fidelite.count);
    const avant = ouvreDroit(prochaine) ? 0 : PAS_FIDELITE - ((prochaine - 1) % PAS_FIDELITE);
    ligneFidelite = avant === 0
      ? `Fidélité : remise de ${REMISE_POURCENT} % à la prochaine venue`
      : `Fidélité : remise de ${REMISE_POURCENT} % dans ${avant} venue${avant > 1 ? "s" : ""}`;
  }

  const ticket = format === "ticket";
  const ligne = "flex justify-between gap-3";

  return (
    <main className={`mx-auto flex flex-col items-center gap-4 py-6 print:py-0 ${ticket ? "" : ""}`}>
      <style>{ticket ? "@page { size: 80mm auto; margin: 0; }" : "@page { size: A5; margin: 10mm; }"}</style>
      <BarreRecu
        id={facture.id}
        format={format}
        imprimerAuto={imprimer === "1"}
        telephone={facture.clientes?.telephone ?? null}
        resume={`Bonjour, voici votre reçu Chic Africa Beauty n° ${facture.numero_affiche ?? ""} : ${n(facture.total)} F payés. Merci et à très vite !`}
      />

      <article
        className={`bg-white text-black shadow-md print:shadow-none ${
          ticket ? "w-[80mm] px-[4mm] py-[5mm] font-mono text-[12px] leading-snug" : "w-[148mm] px-[10mm] py-[10mm] text-[13px] leading-relaxed"
        }`}
      >
        <header className="flex flex-col items-center gap-0.5 text-center">
          <svg viewBox="0 0 64 64" width={ticket ? 40 : 52} height={ticket ? 40 : 52} role="img" aria-label="Chic Africa Beauty">
            <circle cx="32" cy="32" r="31" fill="#000" />
            {[0, 72, 144, 216, 288].map((r) => (
              <ellipse key={r} cx="32" cy="19" rx="7.5" ry="12" fill="#fff" transform={`rotate(${r} 32 32)`} />
            ))}
            <circle cx="32" cy="32" r="6.5" fill="#000" />
          </svg>
          <strong className={ticket ? "text-[15px] tracking-wider" : "text-xl tracking-wider"}>CHIC AFRICA BEAUTY</strong>
          <span>{INSTITUT.adresse}</span>
          <span>Tél. {INSTITUT.telephone}</span>
          {(MENTIONS_LEGALES.rccm || MENTIONS_LEGALES.ncc) && (
            <span>
              {[MENTIONS_LEGALES.rccm && `RCCM ${MENTIONS_LEGALES.rccm}`, MENTIONS_LEGALES.ncc && `NCC ${MENTIONS_LEGALES.ncc}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </header>

        <section className="mt-2 flex flex-col border-t border-dashed border-black pt-2">
          <strong>
            REÇU N° {facture.numero_affiche}
            {facture.statut === "annulee" && " — ANNULÉ"}
          </strong>
          <span>{quand}</span>
          <span>Cliente : {facture.clientes?.nom_complet ?? "client de passage"}</span>
          {facture.encaissee?.nom && <span>Servie par : {facture.encaissee.nom.split(" ")[0]}</span>}
        </section>

        {soins.length > 0 && (
          <section className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-black pt-2">
            <strong>SOINS</strong>
            {soins.map((l, i) => (
              <div key={i} className={ligne}>
                <span>{l.libelle}</span>
                <span>{l.prix_unitaire ? n(l.prix_unitaire) : "inclus"}</span>
              </div>
            ))}
            {ecartForfait !== 0 && (
              <div className={ligne}>
                <span>Forfait appliqué</span>
                <span>{ecartForfait > 0 ? "+" : ""}{n(ecartForfait)}</span>
              </div>
            )}
            <div className={`${ligne} font-bold`}>
              <span>Sous-total soins</span>
              <span>{n(facture.montant_soins)}</span>
            </div>
          </section>
        )}

        {produits.length > 0 && (
          <section className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-black pt-2">
            <strong>PRODUITS</strong>
            {produits.map((l, i) => (
              <div key={i} className={ligne}>
                <span>
                  {l.quantite} x {l.libelle}
                </span>
                <span>{n(l.prix_unitaire * l.quantite)}</span>
              </div>
            ))}
          </section>
        )}

        <section className="mt-2 flex flex-col gap-0.5 border-t border-dashed border-black pt-2">
          <div className={ligne}>
            <span>Total</span>
            <span>{n(facture.montant_soins + facture.montant_produits)}</span>
          </div>
          {facture.remise_fidelite > 0 && (
            <div className={ligne}>
              <span>Remise fidélité {REMISE_POURCENT} %</span>
              <span>-{n(facture.remise_fidelite)}</span>
            </div>
          )}
          {facture.acompte_deduit > 0 && (
            <div className={ligne}>
              <span>Acompte payé en ligne</span>
              <span>-{n(Math.min(facture.acompte_deduit, facture.montant_soins + facture.montant_produits - facture.remise_fidelite))}</span>
            </div>
          )}
          <div className={`${ligne} pt-1 font-bold ${ticket ? "text-[16px]" : "text-lg"}`}>
            <span>PAYÉ</span>
            <span>{n(facture.total)} F</span>
          </div>
          <span>Mode : {libelleMode(facture.mode_paiement)}</span>
          {facture.notes && <span className="whitespace-pre-line">{facture.notes}</span>}
        </section>

        <footer className="mt-2 flex flex-col items-center gap-0.5 border-t border-dashed border-black pt-2 text-center">
          {ligneFidelite && <span>{ligneFidelite}</span>}
          <strong>Merci et à très vite !</strong>
          <span>Réservez en ligne :</span>
          <span>chicafricabeauty-w2nz.vercel.app/rdv</span>
        </footer>
      </article>
    </main>
  );
}
