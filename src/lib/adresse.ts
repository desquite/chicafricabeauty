import "server-only";
import { headers } from "next/headers";

/**
 * Adresse publique du site, pour les liens envoyés aux clientes et l'adresse
 * de notification donnée à AfribaPay.
 *
 * En production, toujours le domaine principal du projet, fourni par Vercel
 * (un domaine personnalisé dès qu'il y en a un) : la tablette peut avoir
 * ouvert l'app par une adresse de déploiement, bien plus longue et qui ne vit
 * pas éternellement. En local, l'hôte de la requête.
 */
export async function adressePublique() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && production) {
    return `https://${production}`;
  }
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host");
  const protocole = h.get("x-forwarded-proto") ?? "https";
  return `${protocole}://${hote}`;
}
