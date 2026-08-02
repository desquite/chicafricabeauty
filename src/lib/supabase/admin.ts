import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase à privilèges élevés, réservé aux tâches planifiées.
 *
 * Le cron s'exécute sans session : il n'a pas d'utilisateur, donc la RLS lui
 * refuserait tout. Ce client contourne la RLS, ce qui en fait la pièce la
 * plus sensible du projet.
 *
 * Trois règles qui vont avec :
 *   - jamais importé depuis un composant client, d'où le "server-only" ;
 *   - la clé vit uniquement dans les variables d'environnement du serveur,
 *     sans préfixe NEXT_PUBLIC qui l'enverrait au navigateur ;
 *   - à n'utiliser que dans /api/cron, nulle part ailleurs. Les écrans
 *     passent par le client à session, qui reste soumis à la RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !cle) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquant : les tâches planifiées ne peuvent pas lire la base.",
    );
  }

  return createClient(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
