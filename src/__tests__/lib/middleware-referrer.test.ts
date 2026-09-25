/**
 * Tests: Referrer-Policy der Upload-Seite (Paket 4, Feinplanung 5.3,
 * Uebergabe aus Schritt 8)
 *
 * Die Seite `/unterlagen/[token]` traegt den Token im Pfad. Die Middleware
 * setzt dort `Referrer-Policy: no-referrer` statt der sonst geltenden
 * `strict-origin-when-cross-origin` — sonst ginge die volle URL samt Token als
 * `Referer` mit jeder Anfrage desselben Ursprungs hinaus. Alle anderen Pfade
 * behalten ihren Wert, und die uebrigen Sicherheitskoepfe bleiben auch auf der
 * Upload-Seite (CSP, X-Frame-Options, nosniff).
 */

// jose ist ein reines ES-Modul; die Sitzung spielt fuer die Kopfzeilen keine Rolle.
jest.mock("jose", () => ({ jwtVerify: jest.fn() }));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const TOKEN = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

const aufruf = (pfad: string) => middleware(new NextRequest(`http://localhost:3000${pfad}`));

describe("Referrer-Policy der Middleware", () => {
  it("Upload-Seite: no-referrer — die uebrigen Sicherheitskoepfe bleiben", async () => {
    const antwort = await aufruf(`/unterlagen/${TOKEN}`);
    expect(antwort.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(antwort.headers.get("X-Frame-Options")).toBe("DENY");
    expect(antwort.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(antwort.headers.get("Content-Security-Policy")).not.toBeNull();
  });

  it("auch ohne Token und mit Schraegstrich am Ende", async () => {
    for (const pfad of ["/unterlagen", "/unterlagen/", `/unterlagen/${TOKEN}/`]) {
      const antwort = await aufruf(pfad);
      expect({ pfad, policy: antwort.headers.get("Referrer-Policy") }).toEqual({ pfad, policy: "no-referrer" });
    }
  });

  // Portal-Seiten ohne Sitzung leitet die Middleware um (eigene Antwort) — hier
  // geht es nur um Pfade, deren Antwort ihre Kopfzeilen traegt.
  it.each([
    "/login",
    `/fragebogen/${TOKEN}`,
    `/api/onboarding/${ID}/unterlagen`,
    `/unterlagen-hilfe`,
    `/x/unterlagen/${TOKEN}`,
  ])("%s behaelt strict-origin-when-cross-origin", async (pfad) => {
    const antwort = await aufruf(pfad);
    expect(antwort.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
