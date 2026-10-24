import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  age,
  alertes,
  DELAIS,
  ETAT_PEAU,
  EVOLUTION,
  EXPOSITION_UV,
  HYDRATATION,
  JOURS_PAR_DELAI,
  PRIORITES,
  TYPE_PEAU,
  nomChaleureux,
  type Anamnese,
  type Cliente,
  type Consentement,
  type Seance,
} from "@/lib/types";
import { etiquetteRemise, ouvreDroit, PAS_FIDELITE, rangSeance, REMISE_POURCENT } from "@/lib/fidelite";
import { lireAbonnements } from "@/lib/abonnements-lecture";
import { SectionAbonnement } from "./abonnement";
import { BandeauActions, Historique, ProchainRdv, type Evenement } from "./fiche";

const dateFr = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "—";

const dateLongue = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

const heureFr = (h: string | null) => (h ? `${Number(h.slice(0, 2))}h${h.slice(3, 5)}` : "");

const libelle = (options: readonly { valeur: string; libelle: string }[], v: string | null) =>
  options.find((o) => o.valeur === v)?.libelle ?? "—";

const ouiNon = (v: boolean | null) => (v === null ? "—" : v ? "Oui" : "Non");

type SeanceListe = Seance & { soins: { soins_catalogue: { libelle: string } | null }[]; photos: { id: string }[] };

type RdvListe = {
  id: string;
  date_rdv: string;
  heure_rdv: string | null;
  duree_min: number | null;
  statut: "prevu" | "honore" | "annule" | "absent";
  seance_id: string | null;
  source: "personnel" | "en_ligne";
  created_at: string;
  acompte_paye_le: string | null;
  acompte_montant: number | null;
  annulation_motif: string | null;
  remplace_par: string | null;
  masque_le: string | null;
  soins_catalogue: { libelle: string; libelle_public: string | null } | null;
};

/**
 * Fiche centrale d'une cliente : tout ce qui la concerne, et tout ce qu'on
 * peut faire pour elle, sur une seule page. Séances, rendez-vous, acomptes,
 * bilans et relances se lisent dans un seul historique.
 */
export default async function PageFicheCliente({ params }: { params: Promise<{ id: string }> }) {
  const profil = await requireProfil();
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle<
    Cliente & { relancee_le: string | null }
  >();
  if (!cliente) notFound();

  const [{ data: bilan }, { data: bilans }, { data: consentements }, { data: seances }, { data: rdvs }] =
    await Promise.all([
      supabase.from("anamneses_courantes").select("*").eq("cliente_id", id).maybeSingle<Anamnese>(),
      supabase
        .from("anamneses")
        .select("id, date_maj")
        .eq("cliente_id", id)
        .order("date_maj", { ascending: true })
        .returns<{ id: string; date_maj: string }[]>(),
      supabase
        .from("consentements")
        .select("*")
        .eq("cliente_id", id)
        .order("signe_le", { ascending: false })
        .returns<Consentement[]>(),
      supabase
        .from("seances")
        .select("*, soins:seance_soins(soins_catalogue(libelle)), photos(id)")
        .eq("cliente_id", id)
        .order("date_seance", { ascending: false })
        .returns<SeanceListe[]>(),
      supabase
        .from("rendez_vous")
        .select(
          "id, date_rdv, heure_rdv, duree_min, statut, seance_id, source, created_at, acompte_paye_le, acompte_montant, annulation_motif, remplace_par, masque_le, soins_catalogue(libelle, libelle_public)",
        )
        .eq("cliente_id", id)
        .order("date_rdv", { ascending: false })
        .returns<RdvListe[]>(),
    ]);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [abonnements, { data: soinsActifs }] = await Promise.all([
    lireAbonnements(supabase, { clienteIds: [id] }),
    supabase
      .from("soins_catalogue")
      .select("id, libelle")
      .eq("actif", true)
      .order("ordre")
      .returns<{ id: string; libelle: string }[]>(),
  ]);
  const abonnementEnCours = abonnements.find((a) => a.statut === "actif" || a.statut === "pause");
  const listeAlertes = alertes(bilan ?? null);
  const nbSeances = seances?.length ?? 0;
  // Les séances d'abonnement ne comptent pas pour la fidélité.
  const nbFidelite = (seances ?? []).filter((s) => !s.abonnement_id).length;
  const rangProchaine = rangSeance(nbFidelite);
  const remiseDue = ouvreDroit(rangProchaine);
  const dansLeCycle = nbFidelite % PAS_FIDELITE;
  const avantRemise = PAS_FIDELITE - ((rangProchaine - 1) % PAS_FIDELITE);
  const dernierConsentement = (nature: "soin" | "photo") =>
    (consentements ?? []).find((c) => c.nature === nature) ?? null;
  const photo = dernierConsentement("photo");
  const soin = dernierConsentement("soin");
  const ans = age(cliente.date_naissance);
  const prenom = nomChaleureux(cliente);
  const nomSoin = (r: RdvListe) => r.soins_catalogue?.libelle_public || r.soins_catalogue?.libelle || "soin";

  // Rendez-vous utiles : ceux qui n'ont été ni remplacés ni retirés de l'agenda.
  const rdvsVisibles = (rdvs ?? []).filter((r) => !r.remplace_par && !r.masque_le);
  const prochain = [...rdvsVisibles]
    .filter((r) => r.statut === "prevu" && r.date_rdv >= aujourdhui)
    .sort((a, b) => `${a.date_rdv}${a.heure_rdv}`.localeCompare(`${b.date_rdv}${b.heure_rdv}`))[0];
  const passes = rdvsVisibles.filter((r) => r.statut === "honore" || r.statut === "absent");
  const absences = passes.filter((r) => r.statut === "absent").length;

  const derniere = seances?.[0] ?? null;
  const delaiJours = derniere?.delai_recommande ? JOURS_PAR_DELAI[derniere.delai_recommande] : null;
  const joursDepuis = derniere
    ? Math.floor((Date.parse(`${aujourdhui}T00:00:00Z`) - Date.parse(`${derniere.date_seance}T00:00:00Z`)) / 86_400_000)
    : null;
  const aRelancer = Boolean(delaiJours && joursDepuis !== null && joursDepuis > delaiJours + 7 && !prochain);

  // Historique unique, du plus récent au plus ancien.
  const evenements: Evenement[] = [];
  const ordre = [...(seances ?? [])].reverse();
  for (const s of seances ?? []) {
    const rang = ordre.findIndex((x) => x.id === s.id) + 1;
    const soins = s.soins.map((x) => x.soins_catalogue?.libelle).filter(Boolean).join(", ");
    const detail = [
      `${rang === 1 ? "1re" : `${rang}e`} venue`,
      s.evolution ? libelle(EVOLUTION, s.evolution) : null,
      s.incident ? "incident signalé" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const texte = [
      s.type_peau && `Peau : ${libelle(TYPE_PEAU, s.type_peau)}${s.etat_peau ? `, ${libelle(ETAT_PEAU, s.etat_peau).toLowerCase()}` : ""}.`,
      s.produits_utilises && `Produits : ${s.produits_utilises}.`,
      s.observations && `Observations : ${s.observations}`,
      s.conseils && `Conseils : ${s.conseils}`,
    ]
      .filter(Boolean)
      .join(" ");
    evenements.push({
      id: `s-${s.id}`,
      type: "seance",
      date: s.date_seance,
      titre: `Séance · ${soins || "soin"}`,
      detail,
      etiquette: s.remise_palier ? `remise ${REMISE_POURCENT} %` : undefined,
      ton: s.remise_palier ? "or" : undefined,
      depli: { texte: texte || "Pas de détail saisi.", lien: `/seances/${s.id}`, photos: s.photos.length },
    });
  }
  for (const r of rdvsVisibles) {
    const quand = `${dateLongue(r.date_rdv)}${r.heure_rdv ? ` à ${heureFr(r.heure_rdv)}` : ""}`;
    if (r.statut === "prevu" && r.date_rdv >= aujourdhui) {
      evenements.push({
        id: `r-${r.id}`,
        type: "rdv",
        date: r.date_rdv,
        titre: `Rendez-vous à venir · ${nomSoin(r)}`,
        detail: `${quand}${r.source === "en_ligne" ? ` · réservé en ligne le ${dateFr(r.created_at)}` : ""}`,
        etiquette: "à venir",
        ton: "or",
      });
    } else if (r.statut === "absent") {
      evenements.push({
        id: `r-${r.id}`,
        type: "absence",
        date: r.date_rdv,
        titre: `Absente · ${nomSoin(r)}`,
        detail: quand,
        etiquette: "absence",
        ton: "rouge",
      });
    } else if (r.statut === "annule") {
      evenements.push({
        id: `r-${r.id}`,
        type: "annulation",
        date: r.date_rdv,
        titre: `Annulé · ${nomSoin(r)}`,
        detail: `${quand}${
          r.annulation_motif === "cliente"
            ? " · par la cliente"
            : r.annulation_motif === "acompte_non_regle"
              ? " · acompte non réglé"
              : ""
        }`,
      });
    } else if (r.statut === "honore" && !r.seance_id) {
      evenements.push({ id: `r-${r.id}`, type: "rdv", date: r.date_rdv, titre: `Rendez-vous honoré · ${nomSoin(r)}`, detail: quand });
    }
    if (r.acompte_paye_le) {
      evenements.push({
        id: `p-${r.id}`,
        type: "paiement",
        date: r.acompte_paye_le.slice(0, 10),
        titre: `Acompte reçu · ${(r.acompte_montant ?? 0).toLocaleString("fr-FR")} F`,
        detail: `pour le rendez-vous du ${dateLongue(r.date_rdv)}`,
      });
    }
  }
  (bilans ?? []).forEach((b, i) =>
    evenements.push({
      id: `b-${b.id}`,
      type: "sante",
      date: b.date_maj.slice(0, 10),
      titre: i === 0 ? "Bilan santé enregistré" : "Bilan santé mis à jour",
      detail: "Allergies, traitements, contre-indications et habitudes",
    }),
  );
  if (cliente.relancee_le) {
    evenements.push({
      id: "relance",
      type: "relance",
      date: cliente.relancee_le.slice(0, 10),
      titre: "Contactée pour une relance",
      detail: "Marquée depuis l'écran À relancer",
    });
  }
  evenements.sort((a, b) => b.date.localeCompare(a.date));

  const delaiLibelle = DELAIS.find((d) => d.valeur === derniere?.delai_recommande)?.libelle;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Link href="/clientes" className="text-sm font-medium text-brand-600 hover:underline">
        ← Toutes les clientes
      </Link>

      <section aria-label="Cliente" className="flex flex-col gap-4 rounded-2xl border border-brand-100 bg-white p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-600 ${
              abonnementEnCours ? "ring-[3px] ring-or-400 ring-offset-2" : ""
            }`}
          >
            {cliente.nom_complet
              .split(" ")
              .slice(0, 2)
              .map((m) => m[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold text-brand-800">
              {cliente.nom_complet}
              {!cliente.actif && (
                <span className="ml-3 rounded-full bg-brand-100 px-3 py-1 align-middle text-sm font-medium text-brand-500">
                  Archivée
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-brand-500">
              {[ans !== null && `${ans} ans`, cliente.telephone, cliente.email, `cliente depuis ${dateFr(cliente.created_at)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {abonnementEnCours && (
              <span className="rounded-full bg-[#f6ecd2] px-2.5 py-1 text-xs font-bold text-[#6e5114]">
                ★ {abonnementEnCours.etiquette}
              </span>
            )}
            {listeAlertes.length > 0 && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                {listeAlertes.length} alerte{listeAlertes.length > 1 ? "s" : ""} santé
              </span>
            )}
            {!bilan && (
              <span className="rounded-full bg-[#e8eefc] px-2.5 py-1 text-xs font-bold text-[#2c4a8a]">
                fiche santé manquante
              </span>
            )}
            {aRelancer && (
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">à relancer</span>
            )}
          </div>
          <Link
            href={`/fiche/${cliente.id}/identite`}
            className="flex h-11 shrink-0 items-center rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            Modifier
          </Link>
        </div>
        <BandeauActions
          clienteId={cliente.id}
          prenom={prenom}
          telephone={cliente.telephone}
          sansBilan={!bilan}
        />
      </section>

      {cliente.notes && (
        <section className="rounded-2xl border border-brand-100 bg-white p-5">
          <h2 className="mb-1 text-xs font-bold tracking-wide text-brand-500 uppercase">Notes internes</h2>
          <p className="whitespace-pre-line text-brand-800">{cliente.notes}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          {/* Les contre-indications passent avant tout le reste : c'est la seule
              information qu'il serait grave de manquer avant un soin. */}
          {listeAlertes.length > 0 && (
            <section className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
              <h2 className="mb-2 font-semibold text-red-800">À vérifier avant tout soin</h2>
              <ul className="space-y-1.5">
                {listeAlertes.map((a) => (
                  <li key={a} className="text-sm font-medium text-red-800">
                    • {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(abonnements.length > 0 || profil.role === "gerante") && (
            <SectionAbonnement
              clienteId={cliente.id}
              abonnements={abonnements}
              soins={soinsActifs ?? []}
              gerante={profil.role === "gerante"}
              aujourdhui={aujourdhui}
            />
          )}

          <section className="flex flex-col gap-1.5 rounded-2xl border border-brand-100 bg-white p-4">
            <h2 className="text-xs font-bold tracking-wide text-brand-500 uppercase">Prochain rendez-vous</h2>
            {prochain ? (
              <ProchainRdv
                id={prochain.id}
                quand={`${dateLongue(prochain.date_rdv)}${prochain.heure_rdv ? ` à ${heureFr(prochain.heure_rdv)}` : ""}`}
                soin={nomSoin(prochain)}
                date={prochain.date_rdv}
                acompte={prochain.acompte_paye_le ? (prochain.acompte_montant ?? 0) : null}
                enLigne={prochain.source === "en_ligne"}
              />
            ) : (
              <p className="text-sm text-brand-500">Aucun rendez-vous prévu.</p>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-bold tracking-wide text-brand-500 uppercase">Fidélité</h2>
              <span className="text-sm text-brand-500">
                {nbSeances} venue{nbSeances > 1 ? "s" : ""}
              </span>
            </div>
            <p className="font-semibold text-brand-900">
              {remiseDue
                ? `${etiquetteRemise(rangProchaine)} à la prochaine venue`
                : `Remise de ${REMISE_POURCENT} % dans ${avantRemise} venue${avantRemise > 1 ? "s" : ""}`}
            </p>
            <div className="grid grid-cols-5 gap-1.5" aria-label={`${remiseDue ? PAS_FIDELITE - 1 : dansLeCycle} venues sur ${PAS_FIDELITE}`}>
              {Array.from({ length: PAS_FIDELITE }, (_, i) => {
                const fait = remiseDue ? i < PAS_FIDELITE - 1 : i < dansLeCycle;
                const prochaine = remiseDue && i === PAS_FIDELITE - 1;
                return (
                  <span
                    key={i}
                    className={`h-2 rounded-full ${prochaine ? "bg-or-400" : fait ? "bg-brand-600" : "bg-brand-100"}`}
                  />
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 rounded-2xl border border-brand-100 bg-white p-4">
            <div>
              <p className="text-xs text-brand-500">Dernière venue</p>
              <p className="font-semibold text-brand-900">{derniere ? dateFr(derniere.date_seance) : "—"}</p>
              {delaiLibelle && <p className="text-xs text-brand-600">délai conseillé : {delaiLibelle}</p>}
            </div>
            <div>
              <p className="text-xs text-brand-500">Fiabilité</p>
              <p className="font-semibold text-brand-900">
                {absences === 0 ? "Aucune absence" : `${absences} absence${absences > 1 ? "s" : ""}`}
              </p>
              <p className="text-xs text-brand-600">
                sur {passes.length} rendez-vous passé{passes.length > 1 ? "s" : ""}
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xs font-bold tracking-wide text-brand-500 uppercase">Bilan santé</h2>
              <Link href={`/fiche/${cliente.id}/sante`} className="text-sm font-semibold text-brand-600 hover:underline">
                {bilan ? "Mettre à jour" : "Remplir"}
              </Link>
            </div>
            {bilan ? (
              <>
                <p className="text-xs text-brand-500">Mis à jour le {dateFr(bilan.date_maj)}</p>
                <details className="text-sm">
                  <summary className="flex min-h-10 cursor-pointer items-center font-semibold text-brand-700">
                    Voir le bilan complet
                  </summary>
                  <dl className="mt-2 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                    <Ligne t="Allergies" v={bilan.allergies ?? "—"} />
                    <Ligne
                      t="Traitement en cours"
                      v={bilan.traitement_en_cours ? bilan.traitement_detail || "Oui" : ouiNon(bilan.traitement_en_cours)}
                    />
                    <Ligne t="Grossesse / allaitement" v={ouiNon(bilan.grossesse_allaitement)} />
                    <Ligne t="Lentilles de contact" v={ouiNon(bilan.port_lentilles)} />
                    <Ligne t="Implants / pacemaker" v={ouiNon(bilan.implants_pacemaker)} />
                    <Ligne
                      t="Injections ou laser récents"
                      v={bilan.injections_recentes ? bilan.injections_detail || "Oui" : ouiNon(bilan.injections_recentes)}
                    />
                    <Ligne t="Fumeuse" v={ouiNon(bilan.fumeur)} />
                    <Ligne t="Exposition UV" v={libelle(EXPOSITION_UV, bilan.exposition_uv)} />
                    <Ligne t="Hydratation" v={libelle(HYDRATATION, bilan.hydratation)} />
                    <Ligne
                      t="Priorités"
                      v={bilan.priorites?.length ? bilan.priorites.map((p) => libelle(PRIORITES, p)).join(", ") : "—"}
                    />
                    <div className="sm:col-span-2">
                      <Ligne t="Routine actuelle" v={bilan.routine_actuelle ?? "—"} />
                    </div>
                  </dl>
                </details>
              </>
            ) : (
              <p className="rounded-xl bg-[#e8eefc] px-3 py-2 text-sm font-semibold text-[#2c4a8a]">
                Jamais renseigné : à faire avant le premier soin.
              </p>
            )}
            <div className="mt-1 flex flex-col gap-1 border-t border-brand-100 pt-2 text-sm">
              <Consent libelleNature="Soins esthétiques" c={soin} />
              <Consent libelleNature="Photographies de suivi" c={photo} />
              {photo && !photo.accepte && (
                <p className="mt-1 rounded-lg bg-or-400/10 px-3 py-2 text-xs text-brand-700">
                  Cette cliente refuse les photographies. Ne pas en prendre pendant les séances.
                </p>
              )}
            </div>
          </section>

          <details className="rounded-2xl border border-brand-100 bg-white px-4">
            <summary className="flex min-h-12 cursor-pointer items-center text-sm font-bold text-brand-800">
              Identité et préférences
            </summary>
            <dl className="grid gap-x-6 gap-y-2.5 pb-4 text-sm sm:grid-cols-2">
              <Ligne t="Date de naissance" v={dateFr(cliente.date_naissance)} />
              <Ligne t="Profession" v={cliente.profession ?? "—"} />
              <Ligne t="Rappels WhatsApp" v={ouiNon(cliente.rappels_whatsapp ?? null)} />
              <Ligne t="Vœux d'anniversaire" v={ouiNon(cliente.anniversaire_whatsapp ?? null)} />
              <Ligne t="Promotions" v={ouiNon(cliente.promotions_whatsapp ?? null)} />
            </dl>
          </details>
        </div>

        <Historique evenements={evenements} />
      </div>
    </div>
  );
}

function Ligne({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-500">{t}</dt>
      <dd className="text-brand-800">{v}</dd>
    </div>
  );
}

function Consent({ libelleNature, c }: { libelleNature: string; c: Consentement | null }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="text-brand-700">{libelleNature}</span>
      {c === null ? (
        <span className="text-xs text-brand-400">Non recueilli</span>
      ) : (
        <span className="text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${c.accepte ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
          >
            {c.accepte ? "Accepté" : "Refusé"}
          </span>
          <span className="ml-1.5 text-brand-400">{dateFr(c.signe_le)}</span>
        </span>
      )}
    </p>
  );
}
