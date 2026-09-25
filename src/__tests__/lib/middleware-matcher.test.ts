/**
 * Tests: Matcher der Middleware (src/middleware.ts) — Paket 4, Feinplanung 5.3
 *
 * Die oeffentliche API `/api/unterlagen/*` laeuft bewusst NICHT durch die
 * Middleware: Nur wenn sie greift, klont Next.js den Body, schneidet ihn bei
 * 10 MiB ab und schreibt dabei die URL samt Token ins Log. Die Upload-SEITE
 * `/unterlagen/[token]` und alle HR-Routen muessen dagegen weiter hindurch
 * (CSP, X-Frame-Options, Mandanten-Gate).
 *
 * Next.js liest den Matcher STATISCH aus dem Quelltext — der Test tut
 * dasselbe, statt das Modul zu importieren, und uebersetzt ihn mit derselben
 * Funktion wie der Build (`getMiddlewareMatchers`). So prueft er, was Next.js
 * tatsaechlich anwendet, und nicht eine nachgebaute Deutung.
 */

import { readFileSync } from "fs";
import path from "path";

type MatcherUebersetzung = (matcher: string[], config: Record<string, unknown>) => Array<{ regexp: string }>;

// Interne Funktion von Next.js, dieselbe, die beim Build den Matcher uebersetzt.
const { getMiddlewareMatchers } = jest.requireActual<{ getMiddlewareMatchers: MatcherUebersetzung }>(
  "next/dist/build/analysis/get-page-static-info",
);

/** Die Zeichenketten im `matcher` von `export const config` — ohne Kommentare. */
function matcherAusQuelltext(): string[] {
  const quelle = readFileSync(path.join(process.cwd(), "src", "middleware.ts"), "utf8");
  const abschnitt = quelle.slice(quelle.indexOf("export const config"));
  const ohneKommentare = abschnitt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const block = /matcher:\s*\[([\s\S]*?)\]\s*,?\s*\}/.exec(ohneKommentare);
  if (!block) throw new Error("matcher nicht gefunden");
  return [...block[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
}

const matcher = matcherAusQuelltext();
const muster = getMiddlewareMatchers(matcher, {}).map((m) => new RegExp(m.regexp));
const laeuftDurchMiddleware = (pfad: string) => muster.some((re) => re.test(pfad));

const TOKEN = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

describe("Matcher der Middleware", () => {
  it("steht als genau ein statischer Eintrag im Quelltext und schliesst api/unterlagen/ aus", () => {
    expect(matcher).toHaveLength(1);
    expect(matcher[0]).toContain("api/unterlagen/");
  });

  it("die oeffentliche API /api/unterlagen/… laeuft NICHT durch die Middleware", () => {
    for (const pfad of [
      `/api/unterlagen/${TOKEN}`,
      `/api/unterlagen/${TOKEN}/positionen/${ID}/dateien`,
      `/api/unterlagen/${TOKEN}/positionen/${ID}`,
      `/api/unterlagen/${TOKEN}/dateien/${ID}`,
      `/api/unterlagen/${TOKEN}/uebermitteln`,
    ]) {
      expect({ pfad, middleware: laeuftDurchMiddleware(pfad) }).toEqual({ pfad, middleware: false });
    }
  });

  it("die Upload-SEITE /unterlagen/… bleibt unter der Middleware (CSP, X-Frame-Options, nosniff)", () => {
    expect(laeuftDurchMiddleware(`/unterlagen/${TOKEN}`)).toBe(true);
  });

  it("HR-Routen der Nachforderung und des Vorgangs bleiben unter der Middleware (Mandanten-Gate)", () => {
    for (const pfad of [
      `/api/onboarding/${ID}`,
      `/api/onboarding/${ID}/unterlagen`,
      `/api/onboarding/${ID}/unterlagen/positionen/${ID}`,
      `/api/onboarding/${ID}/unterlagen/dateien/${ID}`,
      "/api/onboarding",
      "/dashboard",
    ]) {
      expect({ pfad, middleware: laeuftDurchMiddleware(pfad) }).toEqual({ pfad, middleware: true });
    }
  });

  it("nur der Ordner mit Schraegstrich ist ausgenommen, kein Namensverwandter", () => {
    expect(laeuftDurchMiddleware("/api/unterlagen-export/x")).toBe(true);
    expect(laeuftDurchMiddleware("/api/unterlagenliste")).toBe(true);
  });

  it("die bisherigen Ausnahmen bleiben: statische Assets und Bilder", () => {
    expect(laeuftDurchMiddleware("/_next/static/chunks/main.js")).toBe(false);
    expect(laeuftDurchMiddleware("/_next/image")).toBe(false);
    expect(laeuftDurchMiddleware("/favicon.ico")).toBe(false);
    expect(laeuftDurchMiddleware("/logo.png")).toBe(false);
    expect(laeuftDurchMiddleware("/api/auth/login")).toBe(true);
  });
});
