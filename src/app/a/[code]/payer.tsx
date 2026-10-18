"use client";

import { SuiviPaiement, usePaiement } from "@/app/rdv/paiement";

export default function PayerAcompte({
  code,
  montant,
  ussdOrange,
  telephone,
}: {
  code: string;
  montant: number;
  ussdOrange: string | null;
  telephone: string;
}) {
  const paiement = usePaiement(telephone);
  return (
    <SuiviPaiement
      code={code}
      montant={montant}
      ussdOrange={ussdOrange}
      p={paiement}
      invitation="Choisis ton opérateur Mobile Money."
    />
  );
}
