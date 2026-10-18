import type { Metadata } from "next";
import { mulish } from "./polices";

export const metadata: Metadata = {
  title: "Réserver — Chic Africa Beauty",
  description:
    "Réserve ton soin à l'institut Chic Africa Beauty, Angré nouveau CHU, en quelques secondes.",
};

export default function LayoutRdv({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${mulish.className} flex min-h-full flex-1 flex-col bg-creme text-brand-900`}>
      {children}
    </div>
  );
}
