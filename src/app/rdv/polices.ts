import { Fraunces, Mulish } from "next/font/google";

/**
 * Polices de la partie publique, celles des maquettes validées : Fraunces
 * pour les titres, Mulish pour le texte. L'application du personnel garde
 * les siennes.
 */
export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const mulish = Mulish({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
