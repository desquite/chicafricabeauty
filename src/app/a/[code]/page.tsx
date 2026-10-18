import Link from "next/link";
import { Logo } from "@/components/logo";
import { codeUssdOrange, paiementConfigure } from "@/lib/afribapay";
import { echeanceAcompte, estExpire, jourLisible, quandLisible, type RdvAcompte } from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";
import { INSTITUT } from "@/app/rdv/institut";
import { fraunces } from "@/app/rdv/polices";
import PayerAcompte from "./payer";

export const dynamic = "force-dynamic";

type Rdv = RdvAcompte & {
  heure_rdv: string | null;
  statut: string;
  remplace_par: string | null;
  acompte_montant: number | null;
  clientes: { nom_complet: string; prenom_usuel: string | null; telephone: string } | null;
  soins_catalogue: { libelle: string; libelle_public: string | null } | null;
};

const titre = `${fraunces.className} font-medium text-brand-800`;

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-5 px-5 pt-12 pb-10 text-center">
      <Logo className="h-16 w-16" />
      {children}
    </main>
  );
}

/**
 * Lien de paiement de l'acompte, envoyé à la cliente par WhatsApp et e-mail.
 *
 * Pas de compte : le code du lien suffit, et ne permet que de payer cet
 * acompte. La page ne montre que le prénom, le soin et l'heure.
 */
export default async function PageAcompte({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[0-9a-f]{12}$/.test(code)) {
    return (
      <Cadre>
        <p className="text-lg text-brand-800">Ce lien n&apos;est pas valable. Vérifie qu&apos;il a été copié en entier.</p>
      </Cadre>
    );
  }

  const admin = createAdminClient();
  const [{ data: rdv }, { data: reglages }] = await Promise.all([
    admin
      .from("rendez_vous")
      .select(
        "date_rdv, heure_rdv, created_at, source, statut, remplace_par, acompte_requis, acompte_paye_le, acompte_montant, " +
          "clientes(nom_complet, prenom_usuel, telephone), soins_catalogue(libelle, libelle_public)",
      )
      .eq("code_acompte", code)
      .maybeSingle<Rdv>(),
    admin.from("reglages_rdv").select("acompte_montant").maybeSingle<{ acompte_montant: number }>(),
  ]);

  if (!rdv) {
    return (
      <Cadre>
        <p className="text-lg text-brand-800">Ce lien n&apos;est pas valable. Vérifie qu&apos;il a été copié en entier.</p>
      </Cadre>
    );
  }

  const prenom = rdv.clientes ? nomChaleureux(rdv.clientes) : "";
  const soin = rdv.soins_catalogue?.libelle_public || rdv.soins_catalogue?.libelle || "Ton soin";
  const quand = quandLisible(rdv.date_rdv, rdv.heure_rdv);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const recap = (
    <div className="w-full rounded-[20px] bg-white p-5 text-left text-sm shadow-[0_4px_14px_rgba(74,35,28,0.06)]">
      <p className="font-semibold text-brand-900">{soin}</p>
      <p className="mt-1 text-brand-600">{quand.charAt(0).toUpperCase() + quand.slice(1)}</p>
    </div>
  );

  if (rdv.acompte_paye_le) {
    return (
      <Cadre>
        <h1 className={`${titre} text-[28px]`}>Acompte réglé, merci !</h1>
        <p className="text-brand-700">
          {(rdv.acompte_montant ?? 0).toLocaleString("fr-FR")} F CFA reçus. Ils seront déduits du prix le
          jour du soin. À très vite{prenom ? `, ${prenom}` : ""} !
        </p>
        {recap}
      </Cadre>
    );
  }

  if (rdv.statut !== "prevu" || rdv.remplace_par) {
    return (
      <Cadre>
        <h1 className={`${titre} text-[26px]`}>Ce rendez-vous n&apos;est plus prévu</h1>
        <p className="text-brand-700">Il a été annulé ou déplacé. Tu peux reprendre rendez-vous à tout moment.</p>
        {recap}
        <Link href="/rdv" className="flex h-14 w-full items-center justify-center rounded-full bg-brand-600 font-bold text-white">
          Reprendre rendez-vous
        </Link>
      </Cadre>
    );
  }

  if (rdv.date_rdv < aujourdhui) {
    return (
      <Cadre>
        <p className="text-lg text-brand-800">Ce rendez-vous est passé.</p>
      </Cadre>
    );
  }

  if (estExpire(rdv, new Date())) {
    return (
      <Cadre>
        <h1 className={`${titre} text-[26px]`}>Le délai est dépassé</h1>
        <p className="text-brand-700">
          L&apos;acompte n&apos;a pas été réglé à temps : ce rendez-vous va être annulé. Tu peux en
          reprendre un nouveau à tout moment.
        </p>
        {recap}
        <Link href="/rdv" className="flex h-14 w-full items-center justify-center rounded-full bg-brand-600 font-bold text-white">
          Reprendre rendez-vous
        </Link>
      </Cadre>
    );
  }

  const montant = reglages?.acompte_montant ?? 0;
  if (!paiementConfigure() || montant <= 0) {
    return (
      <Cadre>
        <p className="text-brand-800">
          Le paiement en ligne est momentanément indisponible. Appelle-nous au{" "}
          <a href={INSTITUT.telephoneLien} className="font-semibold underline">{INSTITUT.telephone}</a>.
        </p>
        {recap}
      </Cadre>
    );
  }

  const echeance = echeanceAcompte(rdv);
  const limite = echeance
    ? `${jourLisible(echeance)} à ${echeance.getUTCHours()}h${String(echeance.getUTCMinutes()).padStart(2, "0")}`
    : null;
  // Le numéro de la fiche, pour préremplir : 10 chiffres sans indicatif.
  const chiffres = (rdv.clientes?.telephone ?? "").replace(/\D/g, "");
  const telephone = chiffres.length >= 10 ? chiffres.slice(-10) : "";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-10 pb-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="h-16 w-16" />
        <h1 className={`${titre} text-[28px]`}>Régler l&apos;acompte</h1>
        <p className="text-[15px] leading-relaxed text-brand-700">
          {prenom ? `${prenom}, l` : "L"}&apos;acompte de {montant.toLocaleString("fr-FR")} F CFA confirme
          ton rendez-vous
          {limite ? `. À régler au plus tard le ${limite}, sinon le rendez-vous est annulé automatiquement.` : "."}
        </p>
      </div>
      {recap}
      <div className="rounded-[20px] bg-white p-5 shadow-[0_4px_14px_rgba(74,35,28,0.06)]">
        <PayerAcompte
          code={code}
          montant={montant}
          ussdOrange={await codeUssdOrange()}
          telephone={telephone}
        />
      </div>
      <p className="text-center text-xs text-brand-500">
        {INSTITUT.nom} · {INSTITUT.telephone}
      </p>
    </main>
  );
}
