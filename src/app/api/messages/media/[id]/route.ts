import { createClient } from "@/lib/supabase/server";

/**
 * Photo, vocal ou document reçu d'une cliente. Infobip le garde derrière sa
 * clé API : cette adresse le relaie au personnel connecté, et à lui seul.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });

  // La politique RLS des messages ne laisse lire que le personnel actif.
  const supabase = await createClient();
  const { data: message } = await supabase
    .from("messages")
    .select("media_url")
    .eq("id", id)
    .maybeSingle<{ media_url: string | null }>();
  const url = message?.media_url;
  if (!url || !/^https:\/\/[a-z0-9.-]*infobip\.com\//i.test(url)) return new Response("Introuvable", { status: 404 });

  const cle = process.env.INFOBIP_API_KEY;
  if (!cle) return new Response("Indisponible", { status: 503 });
  const reponse = await fetch(url, { headers: { Authorization: `App ${cle}` } });
  if (!reponse.ok || !reponse.body) return new Response("Indisponible", { status: 502 });
  return new Response(reponse.body, {
    headers: {
      "Content-Type": reponse.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
