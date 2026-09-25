/**
 * Rahmen der oeffentlichen Upload-Seite „Unterlagen nachreichen" (Paket 4)
 *
 * Nur fuer die Kopfdaten: Die Seite selbst ist eine Client-Komponente
 * (page.tsx) und kann kein `metadata` exportieren.
 *
 *   - `robots: noindex` — die URL traegt den persoenlichen Token. Dazu steht
 *     `Disallow: /unterlagen/` in public/robots.txt.
 *   - `referrer: no-referrer` (Feinplanung 5.3) — nur die ZWEITE Schicht.
 *     Next.js 15 streamt die Metadaten fuer normale Browser in den Body
 *     (`<div hidden>` mit Suspense); das `<meta name="referrer">` greift also
 *     erst NACH den Anfragen aus dem `<head>` (Skripte, CSS, Schrift unter
 *     /_next/static). Fuer diese gilt der HTTP-Kopf der Middleware,
 *     `strict-origin-when-cross-origin` — an die eigene Domain heisst das:
 *     volle URL samt Token im Referer, und damit auch im Zugriffsprotokoll.
 *     Massgeblich ist deshalb der HTTP-Kopf: `Referrer-Policy: no-referrer`
 *     fuer `/unterlagen/` gehoert in die Middleware (offen, dort nachziehen).
 *     Nach aussen geht der Token nicht: Die Seite hat keine externen Links,
 *     die Schrift liefert next/font selbst aus.
 *
 * CSP, X-Frame-Options und nosniff kommen weiter von der Middleware: Die
 * SEITE bleibt im Matcher, nur `/api/unterlagen/*` ist ausgenommen.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unterlagen nachreichen – CREDO HR-Portal",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  referrer: "no-referrer",
};

export default function UnterlagenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
