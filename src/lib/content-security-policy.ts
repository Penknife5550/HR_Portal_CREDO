/**
 * Content-Security-Policy des Portals — EINE Quelle fuer die Middleware und
 * die Routen, die ihre CSP selbst setzen.
 *
 * **Warum eine Route ihre CSP selbst setzen muss.** Die Middleware setzt ihre
 * Kopfzeilen vor der Route, und Next.js (15.5, `send-response.js`) haengt
 * einen Kopf der Route nur an, wenn es ihn noch nicht gibt. Die Datei-Route
 * der Nachforderung (`GET /api/onboarding/[id]/unterlagen/dateien/[dateiId]`,
 * Paket 4, 6.1) braucht fuer Bilder `Content-Security-Policy: sandbox` — die
 * kam deshalb nie an, solange die Middleware auch dort ihre CSP setzte. Fuer
 * genau diese Route laesst die Middleware die CSP weg
 * (`routeSetztEigeneCsp`), alle uebrigen Sicherheitskoepfe bleiben. Die
 * Route setzt dann selbst: bei Bildern `sandbox`, bei PDFs dieselbe CSP wie
 * bisher (`portalCsp`) — eine Sandbox kann eingebettete PDF-Anzeigen
 * blockieren, und fuer PDFs entscheidet erst die Browserprobe nach dem Deploy
 * (Feinplanung Abschnitt 15 und 17).
 *
 * Laeuft in der Edge-Runtime der Middleware und darf deshalb nichts
 * importieren, was Prisma oder Node-Module anfasst — reine Zeichenketten.
 */

/**
 * Die CSP der Middleware, unveraendert: In der Entwicklung `unsafe-eval` und
 * die Websocket-Verbindung (Next.js HMR); `upgrade-insecure-requests` nur in
 * Produktion und nur, wenn APP_URL nicht ausdruecklich http:// ist (sonst
 * blockierte es localhost).
 */
export function portalCsp(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const connectSrc = isDev ? "connect-src 'self' ws://localhost:3000" : "connect-src 'self'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    connectSrc,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://")
      ? ["upgrade-insecure-requests"]
      : []),
  ].join("; ");
}

/**
 * Routen, die ihre CSP selbst setzen — nur die Datei-Route der Nachforderung.
 * Genau ein Segment je ID und nichts dahinter: Ein Namensverwandter oder ein
 * tieferer Pfad behaelt die CSP der Middleware.
 */
const ROUTEN_MIT_EIGENER_CSP: readonly RegExp[] = [/^\/api\/onboarding\/[^/]+\/unterlagen\/dateien\/[^/]+\/?$/];

/** Setzt die Route unter diesem Pfad ihre CSP selbst? Dann laesst die Middleware ihre weg. */
export function routeSetztEigeneCsp(pathname: string): boolean {
  return ROUTEN_MIT_EIGENER_CSP.some((muster) => muster.test(pathname));
}
