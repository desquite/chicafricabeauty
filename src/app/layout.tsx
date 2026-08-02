import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chic Africa Beauty Online",
  description: "Fiches clientes et suivi des soins de l'institut",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chic Africa",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#7a3b2e",
  width: "device-width",
  initialScale: 1,
  // Le pincement reste autorisé : sur une photo de peau, pouvoir zoomer compte
  // plus que d'éviter un zoom accidentel.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Les extensions de navigateur posent leurs propres attributs sur <html>
    // avant que React ne s'hydrate, ce qui declenche un avertissement
    // d'hydratation sans rapport avec l'application.
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
