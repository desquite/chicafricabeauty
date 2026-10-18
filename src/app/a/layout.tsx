import type { Metadata } from "next";
import { mulish } from "@/app/rdv/polices";

export const metadata: Metadata = {
  title: "Acompte — Chic Africa Beauty",
  robots: { index: false, follow: false },
  // Le code est dans l'URL : il ne doit partir vers aucun autre site.
  referrer: "no-referrer",
};

export default function LayoutAcompte({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${mulish.className} flex min-h-full flex-1 flex-col bg-creme text-brand-900`}>
      {children}
    </div>
  );
}
