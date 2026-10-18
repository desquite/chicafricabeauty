import Link from "next/link";
import { Logo } from "@/components/logo";
import { codeUssdOrange, paiementConfigure } from "@/lib/afribapay";
import type { PrixSoin } from "@/lib/disponibilites";
import {
  acompteDuRdv,
  CHAMPS_PRIX_SOIN,
  echeanceAcompte,
  estExpire,
  jourLisible,
  quandLisible,
  type RdvAcompte,
} from "@/lib/regles-acompte";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomChaleureux } from "@/lib/types";
import { INSTITUT } from "@/app/rdv/institut";
import { fraunces } from "@/app/rdv/polices";
import AnnulerRdv from "./annuler";
import { annulableEnLigne, DELAI_ANNULATION_H } from "./annulation";
import PayerAcompte from "./payer";

export const dynamic = "force-dynamic";

type Rdv = RdvAcompte & {
  heure_rdv: string | null;
  statut: string;
  remplace_par: string | null;
  acompte_montant: number | null;
  clientes: { nom_complet: string; prenom_usuel: string | null; telephone: string } | null;
  soins_catalogue: ({ libelle: string; libelle_public: string | null } & PrixSoin) | null;
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
          "clientes(nom_complet, prenom_usuel, telephone), soins_catalogue(libelle, libelle_public, " + CHAMPS_PRIX_SOIN + ")",
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

  const reprendre = (
    <Link href="/rdv" className="flex h-14 w-full items-center justify-center rounded-full bg-brand-600 font-bold text-white">
      Reprendre rendez-vous
    </Link>
  );

  if (rdv.statut !== "prevu" || rdv.remplace_par) {
    return (
      <Cadre>
        <h1 className={`${titre} text-[26px]`}>Ce rendez-vous n&apos;est plus prévu</h1>
        <p className="text-brand-700">Il a été annulé ou déplacé. Tu peux reprendre rendez-vous à tout moment.</p>
        {recap}
        {reprendre}
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

  const appeler = (
    <a href={INSTITUT.telephoneLien} className="font-semibold underline">
      {INSTITUT.telephone}
    </a>
  );
  const annulation = annulableEnLigne(rdv.date_rdv, rdv.heure_rdv) ? (
    <div className="flex w-full flex-col items-center gap-2">
      <AnnulerRdv code={code} />
      <p className="text-xs text-brand-500">Possible jusqu&apos;à {DELAI_ANNULATION_H} h avant le rendez-vous.</p>
    </div>
  ) : (
    <p className="text-sm text-brand-600">Un empêchement ? Appelle-nous au {appeler}.</p>
  );

  if (rdv.acompte_paye_le) {
    return (
      <Cadre>
        <h1 className={`${titre} text-[28px]`}>C&apos;est confirmé !</h1>
        <p className="text-brand-700">
          Acompte de {(rdv.acompte_montant ?? 0).toLocaleString("fr-FR")} F CFA bien reçu : il sera
          déduit du prix le jour du soin. À très vite{prenom ? `, ${prenom}` : ""} !
        </p>
        {recap}
        <p className="text-sm text-brand-600">
          Pour annuler ou déplacer ce rendez-vous, appelle-nous au {appeler}.
        </p>
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
        {reprendre}
      </Cadre>
    );
  }

  // Jamais plus que le prix du soin, promotion comprise.
  const montant = acompteDuRdv(reglages?.acompte_montant ?? 0, rdv.soins_catalogue, rdv.date_rdv);
  const paiementPossible =
    paiementConfigure() && montant > 0 && (rdv.acompte_requis || rdv.source === "en_ligne");
  // Le numéro de la fiche, pour préremplir : 10 chiffres sans indicatif.
  const chiffres = (rdv.clientes?.telephone ?? "").replace(/\D/g, "");
  const telephone = chiffres.length >= 10 ? chiffres.slice(-10) : "";
  const formulaire = paiementPossible && (
    <div className="w-full rounded-[20px] bg-white p-5 text-left shadow-[0_4px_14px_rgba(74,35,28,0.06)]">
      <PayerAcompte code={code} montant={montant} ussdOrange={await codeUssdOrange()} telephone={telephone} />
    </div>
  );

  // Sans acompte exigé : le rendez-vous est confirmé, l'acompte reste possible.
  if (!rdv.acompte_requis) {
    return (
      <Cadre>
        <h1 className={`${titre} text-[28px]`}>Ton rendez-vous</h1>
        <p className="text-brand-700">
          Il est bien confirmé{prenom ? `, ${prenom}` : ""}. À très vite chez Chic Africa Beauty !
        </p>
        {recap}
        {formulaire && (
          <>
            <p className="text-sm text-brand-600">
              Tu peux régler dès maintenant l&apos;acompte de {montant.toLocaleString("fr-FR")} F CFA,
              déduit du prix le jour du soin.
            </p>
            {formulaire}
          </>
        )}
        {annulation}
      </Cadre>
    );
  }

  if (!paiementPossible) {
    return (
      <Cadre>
        <p className="text-brand-800">
          Le paiement en ligne est momentanément indisponible. Appelle-nous au {appeler}.
        </p>
        {recap}
      </Cadre>
    );
  }

  const echeance = echeanceAcompte(rdv);
  const limite = echeance
    ? `${jourLisible(echeance)} à ${echeance.getUTCHours()}h${String(echeance.getUTCMinutes()).padStart(2, "0")}`
    : null;

  return (
    <Cadre>
      <h1 className={`${titre} text-[28px]`}>Régler l&apos;acompte</h1>
      <p className="text-[15px] leading-relaxed text-brand-700">
        {prenom ? `${prenom}, l` : "L"}&apos;acompte de {montant.toLocaleString("fr-FR")} F CFA confirme
        ton rendez-vous
        {limite ? `. À régler au plus tard le ${limite}, sinon le rendez-vous est annulé automatiquement.` : "."}
      </p>
      {recap}
      {formulaire}
      {annulation}
      <p className="text-xs text-brand-500">
        {INSTITUT.nom} · {INSTITUT.telephone}
      </p>
    </Cadre>
  );
}
