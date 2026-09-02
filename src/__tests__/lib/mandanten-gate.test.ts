/**
 * Tests: das Mandanten-Gate der Middleware (src/lib/mandanten-gate.ts)
 *
 * Der Sinn des Gates ist der Fehlerfall. Es soll NICHT sorgfaeltig aufzaehlen,
 * was gesperrt ist — es soll alles sperren, was nicht nachweislich freigegeben
 * wurde. Diese Tests halten genau diese Richtung fest: Was hier gruen wird,
 * wenn jemand die Allowlist erweitert, ist eine bewusste Zusage.
 */

import {
  MANDANTEN_API_ALLOWLIST,
  ORG_RESTRICTED_ROLES,
  apiPfadErlaubt,
  apiZugriffVerweigern,
  istMandantenRolle,
} from "@/lib/mandanten-gate";
import {
  GLOBAL_ROLES,
  PORTAL_ROLES,
  ORG_RESTRICTED_ROLES as ausPermissions,
} from "@/lib/permissions";

const EINRICHTUNG = "EINRICHTUNGSLEITUNG";

describe("ORG_RESTRICTED_ROLES", () => {
  it("nennt die beiden mandantenbeschränkten Rollen", () => {
    expect([...ORG_RESTRICTED_ROLES].sort()).toEqual([
      "EINRICHTUNGSLEITUNG",
      "VORGESETZTER",
    ]);
  });

  it("überschneidet sich nicht mit den globalen Rollen", () => {
    // Waere eine Rolle in beiden Listen, wuerde das Gate sie sperren, obwohl
    // sie alles sehen darf — oder umgekehrt.
    for (const rolle of ORG_RESTRICTED_ROLES) {
      expect(GLOBAL_ROLES).not.toContain(rolle);
    }
  });

  it("wird von permissions.ts unverändert weitergereicht", () => {
    // Eine zweite Liste in der Middleware waere die Stelle, die beim naechsten
    // Rollenwechsel vergessen wird. `toBe` statt `toEqual`: Es muss dieselbe
    // Referenz sein, nicht bloss derselbe Inhalt.
    expect(ausPermissions).toBe(ORG_RESTRICTED_ROLES);
  });

  it("führt beide Rollen weiterhin als Portal-Rollen", () => {
    // Sie duerfen sich anmelden — nur eben (noch) nichts abrufen.
    for (const rolle of ORG_RESTRICTED_ROLES) {
      expect(PORTAL_ROLES).toContain(rolle);
    }
  });
});

describe("istMandantenRolle", () => {
  it("erkennt die beschränkten Rollen", () => {
    expect(istMandantenRolle("EINRICHTUNGSLEITUNG")).toBe(true);
    expect(istMandantenRolle("VORGESETZTER")).toBe(true);
  });

  it("lässt globale Rollen in Ruhe", () => {
    for (const rolle of GLOBAL_ROLES) {
      expect(istMandantenRolle(rolle)).toBe(false);
    }
  });

  it("stolpert nicht über fehlende oder unsinnige Werte", () => {
    for (const wert of [undefined, null, "", 42, {}, []]) {
      expect(istMandantenRolle(wert)).toBe(false);
    }
  });
});

describe("apiPfadErlaubt", () => {
  it("lässt die Anmeldung durch", () => {
    expect(apiPfadErlaubt("/api/auth")).toBe(true);
    expect(apiPfadErlaubt("/api/auth/setup")).toBe(true);
  });

  it("vergleicht auf Segmentgrenze, nicht per Präfix", () => {
    // Der klassische Weg, wie eine Allowlist leise loechrig wird: "/api/auth"
    // wuerde per startsWith auch "/api/authentisierung-geheim" freigeben.
    expect(apiPfadErlaubt("/api/authentisierung-geheim")).toBe(false);
    expect(apiPfadErlaubt("/api/auth-intern")).toBe(false);
  });

  it("sperrt alles, was nicht ausdrücklich freigegeben ist", () => {
    for (const pfad of [
      "/api/dashboard/stats",
      "/api/onboarding",
      "/api/onboarding/abc-123",
      "/api/onboarding/abc-123/export",
      "/api/onboarding/abc-123/documents/doc-1",
      "/api/offboarding/abc-123/documents",
      "/api/civil-service/abc-123/documents",
      "/api/employees",
      "/api/audit-logs",
      "/api/reports/onboardings",
      "/api/settings/smtp",
      "/api/users",
    ]) {
      expect(apiPfadErlaubt(pfad)).toBe(false);
    }
  });
});

describe("apiZugriffVerweigern", () => {
  it("weist eine beschränkte Rolle auf nicht freigegebenen API-Pfaden ab", () => {
    expect(apiZugriffVerweigern(EINRICHTUNG, "/api/dashboard/stats")).toBe(true);
    expect(apiZugriffVerweigern("VORGESETZTER", "/api/onboarding/x/export")).toBe(true);
  });

  it("lässt sie auf freigegebenen Pfaden durch", () => {
    expect(apiZugriffVerweigern(EINRICHTUNG, "/api/auth")).toBe(false);
  });

  it("rührt globale Rollen nicht an", () => {
    for (const rolle of GLOBAL_ROLES) {
      expect(apiZugriffVerweigern(rolle, "/api/dashboard/stats")).toBe(false);
      expect(apiZugriffVerweigern(rolle, "/api/onboarding/x/export")).toBe(false);
    }
  });

  it("greift nicht in Seiten ein — nur in APIs", () => {
    // Eine Seite ohne Daten ist harmlos; die Daten holt sie ueber die APIs,
    // und dort greift das Gate. Die Portal-/Admin-Logik der Middleware bleibt
    // unberuehrt.
    expect(apiZugriffVerweigern(EINRICHTUNG, "/dashboard")).toBe(false);
    expect(apiZugriffVerweigern(EINRICHTUNG, "/dashboard/abc-123")).toBe(false);
    expect(apiZugriffVerweigern(EINRICHTUNG, "/login")).toBe(false);
  });

  it("lässt die öffentlichen Token-Strecken unberührt", () => {
    // Sie laufen ohne Session; die Middleware kommt gar nicht erst hierher.
    // Der Vollstaendigkeit halber: ohne Rolle wird nichts verweigert.
    for (const pfad of [
      "/api/fragebogen/tok-1",
      "/api/exit-interview/tok-1/submit",
      "/api/verify/civil-service-assessment/tok-1",
    ]) {
      expect(apiZugriffVerweigern(undefined, pfad)).toBe(false);
      expect(apiZugriffVerweigern("SERVICE", pfad)).toBe(false);
    }
  });
});

describe("MANDANTEN_API_ALLOWLIST — Hygiene", () => {
  it("enthält nur absolute /api-Pfade ohne Schrägstrich am Ende", () => {
    for (const eintrag of MANDANTEN_API_ALLOWLIST) {
      expect(eintrag.startsWith("/api/")).toBe(true);
      expect(eintrag.endsWith("/")).toBe(false);
    }
  });

  it("gibt keinen Sammelpfad frei, der das Gate aushebeln würde", () => {
    // "/api" allein wuerde alles freigeben — der Sinn des Gates waere weg.
    expect(MANDANTEN_API_ALLOWLIST).not.toContain("/api");
    expect(MANDANTEN_API_ALLOWLIST).not.toContain("/api/");
  });

  it("führt jeden Eintrag genau einmal", () => {
    expect(new Set(MANDANTEN_API_ALLOWLIST).size).toBe(MANDANTEN_API_ALLOWLIST.length);
  });
});
