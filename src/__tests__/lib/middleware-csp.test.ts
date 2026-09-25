/**
 * Tests: Content-Security-Policy der Middleware — und die Ausnahme fuer die
 * Datei-Route der Nachforderung (Paket 4, Nacharbeit zu Schritt 6)
 *
 * Die Datei-Route `GET /api/onboarding/[id]/unterlagen/dateien/[dateiId]`
 * setzt fuer Bilder `Content-Security-Policy: sandbox`. Die Middleware setzt
 * ihre Kopfzeilen vorher, und Next.js haengt einen Kopf der Route nur an, wenn
 * es ihn noch nicht gibt — solange die Middleware dort ihre CSP setzte, kam
 * die Sandbox nie an. Fuer GENAU diese Route laesst sie ihre CSP deshalb weg;
 * alle uebrigen Sicherheitskoepfe bleiben, und jeder andere Pfad behaelt die
 * CSP unveraendert (der Aufbau zog nur nach src/lib/content-security-policy.ts
 * um, damit Middleware und Route dieselbe Zeichenkette nutzen).
 */

// jose ist ein reines ES-Modul; die Sitzung spielt fuer die Kopfzeilen keine Rolle.
jest.mock("jose", () => ({ jwtVerify: jest.fn() }));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { portalCsp, routeSetztEigeneCsp } from "@/lib/content-security-policy";

const ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const DATEI = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const DATEI_ROUTE = `/api/onboarding/${ID}/unterlagen/dateien/${DATEI}`;

const alteUmgebung = { ...process.env };
/** NODE_ENV ist in den Typen schreibgeschuetzt — fuer die Tests trotzdem setzen. */
function umgebung(werte: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(werte)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
}

afterEach(() => {
  process.env = { ...alteUmgebung };
});

describe("routeSetztEigeneCsp", () => {
  it("nur die Datei-Route der Nachforderung", () => {
    expect(routeSetztEigeneCsp(DATEI_ROUTE)).toBe(true);
    expect(routeSetztEigeneCsp(`${DATEI_ROUTE}/`)).toBe(true);
  });

  it.each([
    `/api/onboarding/${ID}/unterlagen/dateien`,
    `/api/onboarding/${ID}/unterlagen/dateien/${DATEI}/mehr`,
    `/api/onboarding/${ID}/unterlagen`,
    `/api/onboarding/${ID}/unterlagen/positionen/${DATEI}`,
    `/api/onboarding/${ID}/documents/${DATEI}`,
    `/api/offboarding/${ID}/unterlagen/dateien/${DATEI}`,
    `/unterlagen/${DATEI}`,
    `/dashboard/${ID}`,
    `/x/api/onboarding/${ID}/unterlagen/dateien/${DATEI}`,
  ])("%s behaelt die CSP der Middleware", (pfad) => {
    expect(routeSetztEigeneCsp(pfad)).toBe(false);
  });
});

describe("portalCsp — dieselbe CSP wie bisher in der Middleware", () => {
  it("Entwicklung: unsafe-eval und Websocket fuer Next.js HMR, kein upgrade-insecure-requests", () => {
    umgebung({ NODE_ENV: "development", APP_URL: undefined });
    expect(portalCsp()).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' ws://localhost:3000",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; "),
    );
  });

  it("Produktion: ohne unsafe-eval, mit upgrade-insecure-requests — ausser APP_URL ist ausdruecklich http://", () => {
    umgebung({ NODE_ENV: "production", APP_URL: "https://hr.fes-credo.de" });
    const csp = portalCsp();
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self';");
    expect(csp.endsWith("; upgrade-insecure-requests")).toBe(true);

    umgebung({ APP_URL: "http://localhost:3000" });
    expect(portalCsp()).not.toContain("upgrade-insecure-requests");
  });
});

describe("Middleware", () => {
  const aufruf = (pfad: string) => middleware(new NextRequest(`http://localhost:3000${pfad}`));

  it("setzt fuer die Datei-Route KEINE eigene CSP — alle uebrigen Sicherheitskoepfe bleiben", async () => {
    const antwort = await aufruf(DATEI_ROUTE);
    expect(antwort.headers.get("Content-Security-Policy")).toBeNull();
    expect(antwort.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(antwort.headers.get("X-Frame-Options")).toBe("DENY");
    expect(antwort.headers.get("X-XSS-Protection")).toBe("1; mode=block");
    expect(antwort.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(antwort.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=(), payment=()");
  });

  it.each([
    `/api/onboarding/${ID}/unterlagen`,
    `/api/onboarding/${ID}/documents/${DATEI}`,
    `/unterlagen/${DATEI}`,
    "/login",
  ])("%s: die CSP der Middleware, unveraendert", async (pfad) => {
    umgebung({ NODE_ENV: "production", APP_URL: "https://hr.fes-credo.de" });
    const antwort = await aufruf(pfad);
    expect(antwort.headers.get("Content-Security-Policy")).toBe(portalCsp());
    expect(antwort.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(antwort.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
