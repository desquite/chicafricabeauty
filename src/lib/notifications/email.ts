import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import type { ResultatEnvoi } from "@/lib/notifications/whatsapp";

/**
 * E-mails aux clientes, par le compte Gmail de l'institut.
 *
 *   GMAIL_USER          l'adresse complète
 *   GMAIL_APP_PASSWORD  un mot de passe d'application Google (16 lettres),
 *                       jamais le mot de passe du compte
 *
 * Sans ces deux variables, rien ne part et rien ne casse : les messages
 * passent alors par WhatsApp seulement. Gmail plafonne à environ 500 envois
 * par jour, largement au-dessus des besoins de l'institut.
 */

let transport: Transporter | null = null;

export const emailConfigure = () =>
  Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

function transporteur() {
  if (!transport) {
    transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        // Google affiche le mot de passe par groupes de quatre lettres.
        pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, ""),
      },
    });
  }
  return transport;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function envoyerEmail(p: {
  a: string;
  sujet: string;
  /** Paragraphes du message, en texte simple. */
  paragraphes: string[];
  /** Bouton principal, s'il y en a un. */
  bouton?: { libelle: string; url: string };
  /** Pièces jointes, par exemple le rendez-vous au format agenda (.ics). */
  pieces?: { nom: string; contenu: string; type: string }[];
}): Promise<ResultatEnvoi> {
  if (!emailConfigure()) return { ok: false, erreur: "GMAIL_USER ou GMAIL_APP_PASSWORD manquant" };
  if (!EMAIL.test(p.a)) return { ok: false, erreur: `Adresse invalide : ${p.a}` };

  const echapper = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const texte = [
    ...p.paragraphes,
    ...(p.bouton ? [`${p.bouton.libelle} : ${p.bouton.url}`] : []),
    "",
    "Chic Africa Beauty — Angré nouveau CHU, ruelle de la pharmacie Kabod — 01 72 70 37 38",
  ].join("\n\n");

  // Mise en page volontairement simple : tableaux et styles en ligne, la seule
  // forme que tous les logiciels de messagerie affichent correctement.
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#faf6f2;font-family:Helvetica,Arial,sans-serif;color:#331813">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px">
<tr><td style="background:#7a3b2e;border-radius:16px 16px 0 0;padding:22px 24px;color:#ffffff;font-size:20px;font-family:Georgia,serif">Chic Africa Beauty</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">
${p.paragraphes.map((x) => `<p style="margin:0 0 14px">${echapper(x)}</p>`).join("")}
${
  p.bouton
    ? `<p style="margin:22px 0"><a href="${echapper(p.bouton.url)}" style="display:inline-block;background:#7a3b2e;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:999px">${echapper(p.bouton.libelle)}</a></p>`
    : ""
}
</td></tr>
<tr><td style="padding:0 24px 22px;font-size:12px;color:#8a6a58">Angré nouveau CHU, ruelle de la pharmacie Kabod · 01 72 70 37 38</td></tr>
</table></td></tr></table></body></html>`;

  try {
    await transporteur().sendMail({
      from: `"Chic Africa Beauty" <${process.env.GMAIL_USER}>`,
      to: p.a,
      subject: p.sujet,
      text: texte,
      html,
      attachments: p.pieces?.map((x) => ({ filename: x.nom, content: x.contenu, contentType: x.type })),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Envoi impossible" };
  }
}
