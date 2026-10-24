import { Logo } from "@/components/logo";
import {
  finAbonnement,
  libelleRythme,
  situationPaiement,
  type Abonnement,
} from "@/lib/abonnements";
import { codeUssdOrange, paiementConfigure } from "@/lib/afribapay";
import { jourMois } from "@/lib/notifications/abonnement";
import { totalVerse } from "@/lib/paiement-abonnement";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";
import { INSTITUT } from "@/app/rdv/institut";
import { fraunces } from "@/app/rdv/polices";
import PayerAbonnement from "./payer";

export const dynamic = "force-dynamic";

const titre = `${fraunces.className} font-medium text-brand-800`;

type Abo = Abonnement & {
  clientes: { nom_complet: string; prenom_usuel: string | null; telephone: string } | null;
  soins_catalogue: { libelle: string; libelle_public: string | null } | null;
};

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-5 pt-12 pb-10 text-center">
      <Logo className="h-16 w-16" />
      {children}
    </main>
  );
}

const ETATS = {
  payee: ["Payée", "bg-[#e5f0e6] text-[#2f5d3a]"],
  due: ["À régler aujourd'hui", "bg-[#fff1e5] text-[#9a4b12]"],
  en_retard: ["En retard", "bg-red-50 text-red-800"],
  a_venir: ["À venir", "bg-brand-50 text-brand-600"],
} as const;

/**
 * Lien de paiement d'un abonnement, envoyé à la cliente par WhatsApp et
 * e-mail. Le même lien sert toute la durée : il montre ce qui est payé, ce
 * qui reste, et permet de régler l'échéance ou tout d'un coup.
 */
export default async function PagePaiementAbonnement({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const invalide = (
    <Cadre>
      <p className="text-lg text-brand-800">Ce lien n&apos;est pas valable. Vérifie qu&apos;il a été copié en entier.</p>
    </Cadre>
  );
  if (!/^[0-9a-f]{12}$/.test(code)) return invalide;

  const { data: abo } = await createAdminClient()
    .from("abonnements")
    .select("*, clientes(nom_complet, prenom_usuel, telephone), soins_catalogue(libelle, libelle_public)")
    .eq("code_paiement", code)
    .maybeSingle<Abo>();
  if (!abo?.clientes || abo.statut === "annule") return invalide;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const situation = situationPaiement(abo, await totalVerse(abo.id), aujourdhui);
  const soin = abo.soins_catalogue?.libelle_public || abo.soins_catalogue?.libelle || "Soin";
  const pourcent = Math.round((situation.paye / abo.prix) * 100);
  const peutPayer = paiementConfigure() && situation.reste > 0 && situation.prochaine;

  return (
    <Cadre>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold tracking-wide text-[#a67d29] uppercase">Abonnement</p>
        <h1 className={`${titre} text-[28px]`}>Bonjour {nomChaleureux(abo.clientes)}</h1>
      </div>

      <dl className="flex w-full flex-col gap-3 rounded-[20px] bg-white p-5 text-left text-sm shadow-[0_4px_14px_rgba(74,35,28,0.06)]">
        {[
          ["Soin", soin],
          ["Séances", `${abo.nb_seances}, ${libelleRythme(abo.rythme)}`],
          ["Période", `du ${jourMois(abo.debut)} au ${jourMois(finAbonnement(abo), true)}`],
        ].map(([cle, valeur]) => (
          <div key={cle} className="flex justify-between gap-3">
            <dt className="text-brand-500">{cle}</dt>
            <dd className="text-right font-semibold">{valeur}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t border-brand-100 pt-3">
          <div className="flex justify-between">
            <span className="text-brand-500">Réglé</span>
            <strong>
              {situation.paye.toLocaleString("fr-FR")} / {abo.prix.toLocaleString("fr-FR")} F
            </strong>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-brand-100" aria-hidden="true">
            <div className="h-full rounded-full bg-[#c89b3c]" style={{ width: `${pourcent}%` }} />
          </div>
        </div>
        <ul className="flex flex-col gap-2 border-t border-brand-100 pt-3">
          {situation.lignes.map((e) => (
            <li key={e.rang} className="flex items-center justify-between gap-2">
              <span>
                {situation.lignes.length > 1 ? `${e.rang}ᵉ échéance · ` : ""}
                {e.montant.toLocaleString("fr-FR")} F · {jourMois(e.date)}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ETATS[e.etat][1]}`}>
                {ETATS[e.etat][0]}
              </span>
            </li>
          ))}
        </ul>
      </dl>

      {situation.reste === 0 ? (
        <p className="rounded-2xl bg-[#e5f0e6] px-4 py-3 font-semibold text-[#2f5d3a]">
          Ton abonnement est entièrement réglé. Merci !
        </p>
      ) : peutPayer ? (
        <div className="w-full text-left">
          <PayerAbonnement
            code={code}
            echeance={situation.prochaine!.aVerser}
            reste={situation.reste}
            ussdOrange={await codeUssdOrange()}
            telephone={abo.clientes.telephone.replace(/\D/g, "").slice(-10)}
          />
        </div>
      ) : (
        <p className="text-brand-700">Le paiement en ligne est momentanément indisponible : règle à l&apos;institut.</p>
      )}

      <p className="text-[13px] text-brand-600">
        Une question ? Appelle-nous au{" "}
        <a href={INSTITUT.telephoneLien} className="font-semibold underline">
          {INSTITUT.telephone}
        </a>
        .
      </p>
    </Cadre>
  );
}
