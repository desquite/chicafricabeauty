import { redirect } from "next/navigation";
import { couvre, type Abonnement } from "@/lib/abonnements";
import { requireProfil } from "@/lib/auth";
import { chiffreAffaires } from "@/lib/caisse-ca";
import { lireAFacturer, lireProduits } from "@/lib/caisse-lecture";
import { prixDuJour, type PrixSoin } from "@/lib/disponibilites";
import { createClient } from "@/lib/supabase/server";
import { ChiffreAffaires } from "./chiffre";
import { EditeurFacture, type FactureEdition } from "./editeur";
import { FileAFacturer } from "./file";

export const metadata = { title: "Caisse — Chic Africa Beauty Online" };

/**
 * À facturer : les rendez-vous honorés attendent ici leur montant final. La
 * gérante ouvre la facture, fixe le prix des soins, ajoute les produits,
 * encaisse et imprime le reçu.
 */
export default async function PageCaisse({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  const { f } = await searchParams;
  const supabase = await createClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [file, ca, { data: clientes }] = await Promise.all([
    lireAFacturer(supabase),
    chiffreAffaires(supabase, aujourdhui),
    supabase
      .from("clientes")
      .select("id, nom_complet")
      .eq("actif", true)
      .order("nom_complet")
      .limit(1000)
      .returns<{ id: string; nom_complet: string }[]>(),
  ]);

  let edition: FactureEdition | null = null;
  if (f && /^[0-9a-f-]{36}$/.test(f)) {
    const { data: facture } = await supabase
      .from("factures")
      .select(
        "id, statut, cliente_id, remise_sur, acompte_deduit, montant_soins, montant_soins_normal, notes, clientes(nom_complet), rendez_vous:rendez_vous_id(date_rdv, heure_rdv)",
      )
      .eq("id", f)
      .maybeSingle<{
        id: string;
        statut: string;
        cliente_id: string | null;
        remise_sur: "soin" | "produit" | null;
        acompte_deduit: number;
        montant_soins: number;
        montant_soins_normal: number;
        notes: string | null;
        clientes: { nom_complet: string } | null;
        rendez_vous: { date_rdv: string; heure_rdv: string | null } | null;
      }>();
    if (facture && facture.statut !== "brouillon") redirect(`/caisse/factures/${facture.id}`);
    if (facture) {
      const jour = facture.rendez_vous?.date_rdv ?? aujourdhui;
      const [{ data: lignes }, { data: soins }, produits, { data: abos }] = await Promise.all([
        supabase
          .from("lignes_facture")
          .select("type, soin_id, produit_id, libelle, quantite, prix_unitaire")
          .eq("facture_id", facture.id)
          .order("ordre")
          .returns<
            {
              type: "soin" | "produit";
              soin_id: string | null;
              produit_id: string | null;
              libelle: string;
              quantite: number;
              prix_unitaire: number;
            }[]
          >(),
        supabase
          .from("soins_catalogue")
          .select("id, libelle, prix, prix_promo, promo_debut, promo_fin")
          .eq("actif", true)
          .order("ordre")
          .returns<(PrixSoin & { id: string; libelle: string })[]>(),
        lireProduits(supabase),
        facture.cliente_id
          ? supabase
              .from("abonnements")
              .select("soin_id, statut, debut, duree_mois, jours_pause")
              .eq("cliente_id", facture.cliente_id)
              .eq("statut", "actif")
              .returns<Pick<Abonnement, "soin_id" | "statut" | "debut" | "duree_mois" | "jours_pause">[]>()
          : Promise.resolve({ data: [] }),
      ]);
      const couverts = (soins ?? []).filter((s) => (abos ?? []).some((a) => couvre(a, s.id, jour))).map((s) => s.id);
      edition = {
        id: facture.id,
        cliente: facture.clientes?.nom_complet ?? null,
        quand: facture.rendez_vous
          ? `${new Date(`${facture.rendez_vous.date_rdv}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}${facture.rendez_vous.heure_rdv ? ` · ${Number(facture.rendez_vous.heure_rdv.slice(0, 2))}h${facture.rendez_vous.heure_rdv.slice(3, 5)}` : ""}`
          : "Vente sans rendez-vous",
        remiseSur: facture.remise_sur,
        acompte: facture.acompte_deduit,
        // Montant saisi seulement s'il diffère du prix du catalogue.
        montantSoins: facture.montant_soins !== facture.montant_soins_normal ? facture.montant_soins : null,
        notes: facture.notes ?? "",
        soins: (lignes ?? [])
          .filter((l) => l.type === "soin" && l.soin_id)
          .map((l) => ({ soin_id: l.soin_id!, libelle: l.libelle, prix: l.prix_unitaire })),
        produits: (lignes ?? [])
          .filter((l) => l.type === "produit" && l.produit_id)
          .map((l) => ({ produit_id: l.produit_id!, quantite: l.quantite })),
        catalogueSoins: (soins ?? []).map((s) => ({
          id: s.id,
          libelle: couverts.includes(s.id) ? `${s.libelle} (abonnement)` : s.libelle,
          prix: couverts.includes(s.id) ? 0 : (prixDuJour(s, jour) ?? 0),
        })),
        catalogueProduits: produits.map((p) => ({ id: p.id, nom: p.nom, prix: p.prix_vente, stock: p.stock })),
      };
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-4 lg:w-[340px] lg:shrink-0">
        <ChiffreAffaires ca={ca} />
        <FileAFacturer file={file} ouverte={edition?.id ?? null} clientes={clientes ?? []} />
      </div>
      <div className="min-w-0 flex-1">
        {edition ? (
          <EditeurFacture key={edition.id} facture={edition} />
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-200 bg-white p-8 text-center">
            <p className="text-lg font-semibold text-brand-800">Choisissez un rendez-vous à facturer</p>
            <p className="max-w-sm text-sm text-brand-500">
              Un rendez-vous arrive dans la liste dès qu&apos;il passe en « honoré » ou que sa séance est saisie.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
