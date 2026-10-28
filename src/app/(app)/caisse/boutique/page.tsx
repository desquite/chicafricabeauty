import { redirect } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { CHAMPS_COMMANDE, type Commande } from "@/lib/boutique";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BoutonsSuivi } from "./suivi";

export const metadata = { title: "Boutique — Chic Africa Beauty Online" };

const f = (n: number) => `${n.toLocaleString("fr-FR")} F`;
const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

const LIBELLES: Record<string, { texte: string; couleur: string }> = {
  payee: { texte: "Payée · à envoyer", couleur: "bg-or-400/30 text-brand-800" },
  expediee: { texte: "Envoyée", couleur: "bg-brand-100 text-brand-700" },
  livree: { texte: "Livrée", couleur: "bg-[#e3f1e5] text-[#2f6b3a]" },
  annulee: { texte: "Annulée", couleur: "bg-brand-50 text-brand-500" },
};

export default async function PageCommandesBoutique() {
  const profil = await requireProfil();
  if (profil.role !== "gerante") redirect("/accueil");
  // Les commandes abandonnées depuis 45 minutes rendent leur stock.
  await createAdminClient().rpc("expirer_commandes");

  const { data } = await (await createClient())
    .from("commandes")
    .select(CHAMPS_COMMANDE)
    .not("payee_le", "is", null)
    .order("payee_le", { ascending: false })
    .limit(60)
    .returns<Commande[]>();
  const commandes = data ?? [];
  const aEnvoyer = commandes.filter((c) => c.statut === "payee");
  const autres = commandes.filter((c) => c.statut !== "payee");
  const mois = new Date().toISOString().slice(0, 7);
  const ventesMois = commandes
    .filter((c) => c.statut !== "annulee" && (c.payee_le ?? "").startsWith(mois))
    .reduce((t, c) => t + c.montant, 0);

  const carte = (c: Commande) => {
    const l = LIBELLES[c.statut] ?? LIBELLES.annulee;
    return (
      <article key={c.id} className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold text-brand-800">{c.numero}</span>
            <span className="text-sm text-brand-500">{c.payee_le ? quand(c.payee_le) : ""}</span>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${l.couleur}`}>{l.texte}</span>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-brand-800">{c.nom}</span>
            <a href={`https://wa.me/225${c.telephone}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">
              {c.telephone} · WhatsApp
            </a>
            <span className="text-brand-700">
              {c.commune}, {c.adresse}
            </span>
            {c.note && <span className="text-brand-600 italic">« {c.note} »</span>}
          </div>
          <ul className="flex flex-col gap-1">
            {c.lignes_commande.map((x, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {x.quantite} × {x.nom}
                </span>
                <span className="shrink-0 text-brand-600">{f(x.prix * x.quantite)}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-brand-100 pt-1 font-bold text-brand-800">
              <span>Payé{c.operateur ? ` (${c.operateur})` : ""}</span>
              <span>{f(c.montant)}</span>
            </li>
          </ul>
        </div>
        <BoutonsSuivi id={c.id} statut={c.statut} />
      </article>
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold text-brand-800">Boutique en ligne</h1>
        <a href="/boutique" target="_blank" className="text-sm font-semibold text-brand-600 underline">
          Voir la boutique
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5 rounded-2xl border border-brand-100 bg-white p-4">
          <span className="text-sm text-brand-500">À envoyer</span>
          <span className="text-2xl font-bold text-brand-800">{aEnvoyer.length}</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl border border-brand-100 bg-white p-4">
          <span className="text-sm text-brand-500">Ventes en ligne</span>
          <span className="text-2xl font-bold text-brand-800">{f(ventesMois)}</span>
          <span className="text-xs text-brand-600">ce mois-ci</span>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-brand-800">À préparer et envoyer</h2>
        {aEnvoyer.length ? aEnvoyer.map(carte) : <p className="text-brand-600">Aucune commande en attente d&apos;envoi.</p>}
      </section>
      {autres.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-brand-800">Déjà traitées</h2>
          {autres.map(carte)}
        </section>
      )}
    </div>
  );
}
