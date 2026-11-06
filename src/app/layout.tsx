import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Inter_Tight } from "next/font/google";
import { getEnv } from "@/lib/env";
import "./globals.css";

const appName = getEnv().NEXT_PUBLIC_APP_NAME;

/*
 * Fonts of the direction « Suisse » (ADR-064). next/font downloads them at
 * build time and serves them from the application: no request to Google at
 * run time (the CSP allows `font-src 'self'` only).
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-inter-tight",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description:
    "Gestion des bénévoles de l'unité locale de Versailles de la Croix-Rouge française. Outil interne.",
  applicationName: appName,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f4f2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${interTight.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
