import Link from "next/link";
import { requireProfil } from "@/lib/auth";
import { pastillesAbonnees } from "@/lib/abonnements-lecture";
import { adressePublique } from "@/lib/adresse";
import { assistantConfigure } from "@/lib/assistant/brouillon";
import { FENETRE_MS } from "@/lib/messagerie";
import { createClient } from "@/lib/supabase/server";
import { INSTITUT } from "@/app/rdv/institut";
import { Discussion, type MessageVue, type Raccourci } from "./discussion";
import { ListeConversations, type ConversationVue } from "./liste";

export const metadata = { title: "Messages — Chic Africa Beauty Online" };

type Conversation = {
  id: string;
  telephone: string;
  cliente_id: string | null;
  nom_contact: string | null;
  statut: "a_traiter" | "reglee";
  non_lus: number;
  dernier_message_le: string | null;
  dernier_apercu: string | null;
  derniere_entree_le: string | null;
  brouillon: string | null;
  brouillon_main: boolean;
  brouillon_raison: string | null;
  brouillon_pour: string | null;
  clientes: { nom_complet: string } | null;
};

/** Moins de 24 h depuis le dernier message de la cliente : réponse libre permise. */
const dansLaFenetre = (iso: string) => Date.now() - Date.parse(iso) < FENETRE_MS;

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const h = (t: string) => `${Number(t.slice(0, 2))}h${t.slice(3, 5)}`;
const jourLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Boîte de réception WhatsApp : les messages des clientes au numéro de
 * l'institut, la réponse de la gérante, et la fiche de la cliente à côté.
 */
export default async function PageMessages({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; filtre?: string }>;
}) {
  await requireProfil();
  const { c: choisie, filtre: f } = await searchParams;
  const filtre = f === "reglees" || f === "toutes" ? f : "traiter";
  const supabase = await createClient();

  let requete = supabase
    .from("conversations")
    .select("*, clientes(nom_complet)")
    .order("dernier_message_le", { ascending: false, nullsFirst: false })
    .limit(150);
  if (filtre === "traiter") requete = requete.eq("statut", "a_traiter");
  if (filtre === "reglees") requete = requete.eq("statut", "reglee");
  const { data: conversations } = await requete.returns<Conversation[]>();

  const nom = (c: Conversation) => c.clientes?.nom_complet ?? c.nom_contact ?? `+${c.telephone}`;
  const liste: ConversationVue[] = (conversations ?? []).map((c) => ({
    id: c.id,
    nom: nom(c),
    connue: Boolean(c.cliente_id),
    apercu: c.dernier_apercu ?? "",
    quand: c.dernier_message_le,
    nonLus: c.non_lus,
    statut: c.statut,
    pourGerante: c.statut === "a_traiter" && c.brouillon_main,
  }));

  let ouverte: (Conversation & { messages: MessageVue[] }) | null = null;
  let fiche: { lignes: [string, string][]; abonnee: string | null } | null = null;
  const raccourcis: Raccourci[] = [];

  if (choisie && /^[0-9a-f-]{36}$/.test(choisie)) {
    const { data: c } = await supabase
      .from("conversations")
      .select("*, clientes(nom_complet)")
      .eq("id", choisie)
      .maybeSingle<Conversation>();
    if (c) {
      const { data: messages } = await supabase
        .from("messages")
        .select("id, sens, type, texte, media_url, echec, cree_le, profiles:auteur(nom)")
        .eq("conversation_id", c.id)
        .order("cree_le", { ascending: false })
        .limit(200)
        .returns<
          {
            id: string;
            sens: "entrant" | "sortant" | "auto";
            type: string;
            texte: string | null;
            media_url: string | null;
            echec: string | null;
            cree_le: string;
            profiles: { nom: string } | null;
          }[]
        >();
      ouverte = {
        ...c,
        messages: (messages ?? []).reverse().map((m) => ({
          id: m.id,
          sens: m.sens,
          type: m.type,
          texte: m.texte,
          media: Boolean(m.media_url),
          echec: m.echec,
          quand: m.cree_le,
          auteur: m.profiles?.nom.split(" ")[0] ?? null,
        })),
      };

      const site = await adressePublique();
      const { data: horaires } = await supabase
        .from("horaires_semaine")
        .select("jour, ouvert, ouverture, fermeture")
        .returns<{ jour: number; ouvert: boolean; ouverture: string | null; fermeture: string | null }[]>();
      const ouverts = (horaires ?? [])
        .filter((x) => x.ouvert && x.ouverture && x.fermeture)
        .sort((a, b) => ((a.jour + 6) % 7) - ((b.jour + 6) % 7))
        .map((x) => `${JOURS[x.jour]} ${h(x.ouverture!)}–${h(x.fermeture!)}`)
        .join(", ");
      raccourcis.push(
        { libelle: "Lien de réservation", texte: `Vous pouvez réserver votre créneau ici : ${site}/rdv` },
        {
          libelle: "Adresse et horaires",
          texte: `Nous sommes à ${INSTITUT.adresse}.${ouverts ? ` Nous vous accueillons ${ouverts}.` : ""} Tél. ${INSTITUT.telephone}.`,
        },
      );

      if (c.cliente_id) {
        const aujourdhui = new Date().toISOString().slice(0, 10);
        const [{ data: rdv }, { data: seance }, abonnees, { data: abos }] = await Promise.all([
          supabase
            .from("rendez_vous")
            .select("date_rdv, heure_rdv, acompte_requis, acompte_paye_le, code_acompte, soins_catalogue(libelle)")
            .eq("cliente_id", c.cliente_id)
            .eq("statut", "prevu")
            .is("remplace_par", null)
            .is("masque_le", null)
            .gte("date_rdv", aujourdhui)
            .order("date_rdv")
            .order("heure_rdv")
            .limit(1)
            .maybeSingle<{
              date_rdv: string;
              heure_rdv: string | null;
              acompte_requis: boolean;
              acompte_paye_le: string | null;
              code_acompte: string;
              soins_catalogue: { libelle: string } | null;
            }>(),
          supabase
            .from("seances")
            .select("date_seance")
            .eq("cliente_id", c.cliente_id)
            .order("date_seance", { ascending: false })
            .limit(1)
            .maybeSingle<{ date_seance: string }>(),
          pastillesAbonnees(supabase, [c.cliente_id]),
          supabase
            .from("abonnements")
            .select("code_paiement")
            .eq("cliente_id", c.cliente_id)
            .in("statut", ["actif", "pause"])
            .limit(1)
            .returns<{ code_paiement: string }[]>(),
        ]);
        const lignes: [string, string][] = [
          [
            "Prochain rendez-vous",
            rdv
              ? `${jourLong(rdv.date_rdv)}${rdv.heure_rdv ? ` à ${h(rdv.heure_rdv)}` : ""}${rdv.soins_catalogue ? ` · ${rdv.soins_catalogue.libelle}` : ""}`
              : "Aucun",
          ],
        ];
        if (rdv?.acompte_requis) lignes.push(["Acompte", rdv.acompte_paye_le ? "Payé" : "À régler"]);
        lignes.push(["Dernière venue", seance ? jourLong(seance.date_seance) : "Jamais venue"]);
        fiche = { lignes, abonnee: abonnees.get(c.cliente_id) ?? null };
        if (rdv?.acompte_requis && !rdv.acompte_paye_le) {
          raccourcis.push({ libelle: "Lien d'acompte", texte: `Voici le lien pour régler l'acompte de votre rendez-vous : ${site}/a/${rdv.code_acompte}` });
        }
        if (abos?.[0]) {
          raccourcis.push({ libelle: "Lien d'abonnement", texte: `Voici le lien de paiement de votre abonnement : ${site}/p/${abos[0].code_paiement}` });
        }
      }
    }
  }

  const fenetreOuverte = Boolean(ouverte?.derniere_entree_le && dansLaFenetre(ouverte.derniere_entree_le));
  // La proposition ne vaut que pour le dernier message de la cliente : une
  // nouvelle entrée, ou une réponse déjà partie, la rend caduque.
  const derniere = ouverte?.messages.at(-1);
  const brouillon =
    ouverte?.brouillon && derniere?.sens === "entrant" && ouverte.brouillon_pour === derniere.id
      ? { texte: ouverte.brouillon, main: ouverte.brouillon_main, raison: ouverte.brouillon_raison }
      : null;
  const assistant = assistantConfigure();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-[calc(100dvh-4rem)] lg:flex-row">
      <div className={`${ouverte ? "hidden lg:flex" : "flex"} w-full flex-col lg:w-[340px] lg:shrink-0`}>
        <ListeConversations conversations={liste} filtre={filtre} ouverte={ouverte?.id ?? null} />
      </div>
      {ouverte ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 xl:flex-row">
          <Discussion
            key={ouverte.id}
            id={ouverte.id}
            nom={nom(ouverte)}
            telephone={ouverte.telephone}
            statut={ouverte.statut}
            nonLus={ouverte.non_lus}
            messages={ouverte.messages}
            fenetreOuverte={fenetreOuverte}
            raccourcis={raccourcis}
            filtre={filtre}
            brouillon={brouillon}
            assistant={assistant && derniere?.sens === "entrant"}
          />
          <aside className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-4 xl:w-[290px] xl:shrink-0">
            <h2 className="text-lg font-semibold text-brand-800">{ouverte.clientes?.nom_complet ?? "Numéro inconnu"}</h2>
            {fiche ? (
              <>
                {fiche.abonnee && (
                  <span className="self-start rounded-full bg-[#f6ecd2] px-2.5 py-1 text-xs font-bold text-[#6e5114]">★ {fiche.abonnee}</span>
                )}
                {fiche.lignes.map(([titre, valeur]) => (
                  <div key={titre} className="flex flex-col rounded-xl bg-brand-50 px-3 py-2">
                    <span className="text-xs text-brand-500">{titre}</span>
                    <span className="text-sm font-semibold text-brand-900">{valeur}</span>
                  </div>
                ))}
                <Link href={`/clientes/${ouverte.cliente_id}`} className="flex h-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
                  Ouvrir la fiche
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-brand-600">Ce numéro n&apos;est dans aucune fiche cliente.</p>
                <Link href="/fiche/nouvelle" className="flex h-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
                  Créer la fiche
                </Link>
                <p className="text-xs text-brand-500">Une fois la fiche créée avec ce numéro, la conversation s&apos;y rattache d&apos;elle-même.</p>
              </>
            )}
            <div className="mt-auto rounded-xl border border-dashed border-brand-300 bg-brand-50 p-3 text-xs text-brand-600">
              <strong className="block text-brand-700">Assistant IA · mode brouillon</strong>
              {assistant
                ? "Après chaque message, il propose une réponse : rien ne part sans vous."
                : "Pas encore activé : la clé DEEPSEEK_API_KEY manque dans Vercel."}
            </div>
          </aside>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-white p-8 text-center text-brand-500 lg:flex">
          Choisissez une conversation.
        </div>
      )}
    </div>
  );
}
