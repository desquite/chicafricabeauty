"use client";

import {
  Champ,
  ChoixMultiple,
  ChoixUnique,
  OuiNon,
  Paragraphe,
  Texte,
} from "@/components/champs";
import { EXPOSITION_UV, HYDRATATION, PRIORITES } from "@/lib/types";
import type { Sante } from "./actions";

export const santeVide: Sante = {
  allergies: "",
  traitement_en_cours: null,
  traitement_detail: "",
  grossesse_allaitement: null,
  port_lentilles: null,
  implants_pacemaker: null,
  injections_recentes: null,
  injections_detail: "",
  fumeur: null,
  exposition_uv: null,
  hydratation: null,
  routine_actuelle: "",
  priorites: [],
};

type Maj = <K extends keyof Sante>(cle: K, valeur: Sante[K]) => void;

export function EtapeBilanSante({ sante, maj }: { sante: Sante; maj: Maj }) {
  return (
    <>
      <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-brand-700">
        Merci de répondre honnêtement : ces réponses conditionnent la sécurité
        des soins qui vous seront proposés.
      </p>

      <Champ label="Allergies" aide="Médicaments, iode, latex, aspirine…" requis>
        <Paragraphe
          valeur={sante.allergies}
          onChange={(v) => maj("allergies", v)}
          placeholder="Indiquez « aucune » si vous n'en avez pas"
        />
      </Champ>

      <Champ label="Traitement médical en cours" requis>
        <OuiNon
          valeur={sante.traitement_en_cours}
          onChange={(v) => maj("traitement_en_cours", v)}
        />
      </Champ>
      {sante.traitement_en_cours && (
        <Champ label="Lequel ?">
          <Texte
            valeur={sante.traitement_detail}
            onChange={(v) => maj("traitement_detail", v)}
          />
        </Champ>
      )}

      <Champ label="Grossesse ou allaitement" requis>
        <OuiNon
          valeur={sante.grossesse_allaitement}
          onChange={(v) => maj("grossesse_allaitement", v)}
        />
      </Champ>

      <Champ label="Port de lentilles de contact" requis>
        <OuiNon
          valeur={sante.port_lentilles}
          onChange={(v) => maj("port_lentilles", v)}
        />
      </Champ>

      <Champ label="Implants métalliques ou pacemaker" requis>
        <OuiNon
          valeur={sante.implants_pacemaker}
          onChange={(v) => maj("implants_pacemaker", v)}
        />
      </Champ>

      <Champ label="Injections récentes (Botox, acide hyaluronique) ou laser" requis>
        <OuiNon
          valeur={sante.injections_recentes}
          onChange={(v) => maj("injections_recentes", v)}
        />
      </Champ>
      {sante.injections_recentes && (
        <Champ label="Lesquelles, et à quelle date ?">
          <Texte
            valeur={sante.injections_detail}
            onChange={(v) => maj("injections_detail", v)}
          />
        </Champ>
      )}
    </>
  );
}

export function EtapeHabitudes({ sante, maj }: { sante: Sante; maj: Maj }) {
  return (
    <>
      <Champ label="Fumeuse ou fumeur" requis>
        <OuiNon valeur={sante.fumeur} onChange={(v) => maj("fumeur", v)} />
      </Champ>

      <Champ label="Exposition au soleil ou aux UV" requis>
        <ChoixUnique
          options={EXPOSITION_UV}
          valeur={sante.exposition_uv as "jamais" | "moderee" | "frequente" | null}
          onChange={(v) => maj("exposition_uv", v)}
        />
      </Champ>

      <Champ label="Consommation d'eau par jour" requis>
        <ChoixUnique
          options={HYDRATATION}
          valeur={sante.hydratation as "moins_1l" | "plus_1_5l" | null}
          onChange={(v) => maj("hydratation", v)}
        />
      </Champ>

      <Champ label="Votre routine actuelle" aide="Nettoyant, crème, sérum…" requis>
        <Paragraphe
          valeur={sante.routine_actuelle}
          onChange={(v) => maj("routine_actuelle", v)}
        />
      </Champ>

      <Champ label="Vos priorités pour ce soin" aide="Plusieurs choix possibles" requis>
        <ChoixMultiple
          options={PRIORITES}
          valeurs={sante.priorites as (typeof PRIORITES)[number]["valeur"][]}
          onChange={(v) => maj("priorites", [...v])}
        />
      </Champ>
    </>
  );
}

/** Champs obligatoires des deux etapes sante, pour bloquer le bouton Suivant. */
export function santeComplete(sante: Sante, etape: "bilan" | "habitudes") {
  if (etape === "bilan") {
    return (
      sante.allergies.trim() !== "" &&
      sante.traitement_en_cours !== null &&
      sante.grossesse_allaitement !== null &&
      sante.port_lentilles !== null &&
      sante.implants_pacemaker !== null &&
      sante.injections_recentes !== null
    );
  }
  return (
    sante.fumeur !== null &&
    sante.exposition_uv !== null &&
    sante.hydratation !== null &&
    sante.routine_actuelle.trim() !== "" &&
    sante.priorites.length > 0
  );
}
