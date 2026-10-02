/**
 * Navigation des Portals (UX-Umbau U1, Entscheidung E3 und U1-F3).
 *
 * `navigation.ts` ist die eine Tabelle der Punkte im Kopf. Geprueft wird:
 *   - was jede Rolle sieht,
 *   - dass genau ein Punkt aktiv ist,
 *   - dass der Kopf NUR zeigt, was die Rolle oeffnen kann — dafuer ruft der
 *     Test die echte Middleware fuer jeden sichtbaren Punkt jeder Rolle auf.
 */
const jwtVerify = jest.fn();
// jose ist ein reines ES-Modul; die Rolle der Sitzung legt der Test fest.
jest.mock("jose", () => ({ jwtVerify: (...args: unknown[]) => jwtVerify(...args) }));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { aktiverPunkt, NAVIGATION, ROLLEN_NAMEN, rollenName, sichtbarePunkte } from "@/lib/navigation";

const ROLLEN = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "BEM_BEAUFTRAGTER"];

/** Alle Adressen, die eine Rolle im Kopf sieht. */
const adressen = (rolle: string) =>
  sichtbarePunkte(rolle).flatMap((p) => (p.href ? [p.href] : (p.kinder ?? []).map((k) => k.href)));
const texte = (rolle: string) => sichtbarePunkte(rolle).map((p) => p.text);
const unterpunkte = (rolle: string, schluessel: string) =>
  (sichtbarePunkte(rolle).find((p) => p.schluessel === schluessel)?.kinder ?? []).map((k) => k.text);

describe("Punkte je Rolle", () => {
  it("hoechstens sechs Punkte oben (E3)", () => {
    expect(NAVIGATION.length).toBeLessThanOrEqual(6);
    expect(NAVIGATION.map((p) => p.text)).toEqual(["Vorgänge", "BEM", "Vorlagen", "Verwaltung"]);
  });

  it("Super-Admin sieht alles, auch die Mandanten", () => {
    expect(texte("SUPER_ADMIN")).toEqual(["Vorgänge", "BEM", "Vorlagen", "Verwaltung"]);
    expect(unterpunkte("SUPER_ADMIN", "verwaltung")).toEqual(["Benutzer", "BEM-Vorlagen", "Mandanten", "Einstellungen", "Audit-Log"]);
    expect(unterpunkte("SUPER_ADMIN", "vorlagen")).toHaveLength(6);
  });

  it("HR-Leitung sieht alles ausser den Mandanten", () => {
    expect(texte("HR_LEITUNG")).toEqual(["Vorgänge", "BEM", "Vorlagen", "Verwaltung"]);
    expect(unterpunkte("HR_LEITUNG", "verwaltung")).not.toContain("Mandanten");
  });

  it("Sachbearbeitung: Vorlagen nur mit Brief-Vorlagen – „Formulare“ nicht (U1-F3), keine Verwaltung", () => {
    expect(texte("HR_SACHBEARBEITER")).toEqual(["Vorgänge", "BEM", "Vorlagen"]);
    expect(unterpunkte("HR_SACHBEARBEITER", "vorlagen")).toEqual(["Brief-Vorlagen"]);
  });

  it.each(["EINRICHTUNGSLEITUNG", "VORGESETZTER"])("%s sieht Vorgänge und BEM", (rolle) => {
    expect(texte(rolle)).toEqual(["Vorgänge", "BEM"]);
  });

  it("externe BEM-Beauftragte sehen nur BEM", () => {
    expect(texte("BEM_BEAUFTRAGTER")).toEqual(["BEM"]);
  });

  it("eine unbekannte Rolle und der Dienstzugang sehen nichts; ein Menue ohne sichtbaren Unterpunkt entfaellt", () => {
    expect(sichtbarePunkte("SERVICE")).toEqual([]);
    expect(sichtbarePunkte("")).toEqual([]);
    for (const rolle of ROLLEN) {
      for (const p of sichtbarePunkte(rolle)) {
        if (!p.href) expect(p.kinder!.length).toBeGreaterThan(0);
      }
    }
  });

  it("sichtbarePunkte veraendert die Tabelle nicht", () => {
    const vorher = JSON.stringify(NAVIGATION);
    sichtbarePunkte("HR_SACHBEARBEITER");
    expect(JSON.stringify(NAVIGATION)).toBe(vorher);
  });
});

describe("Der Kopf zeigt nur, was die Rolle oeffnen kann", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-geheimnis-test-geheimnis-test-geheimnis";
  });
  beforeEach(() => jwtVerify.mockReset());

  it.each(ROLLEN)("%s: die Middleware leitet keinen sichtbaren Punkt um", async (rolle) => {
    expect(adressen(rolle).length).toBeGreaterThan(0);
    for (const adresse of adressen(rolle)) {
      jwtVerify.mockResolvedValue({ payload: { role: rolle } });
      const antwort = await middleware(
        new NextRequest(`http://localhost:3000${adresse}`, { headers: { cookie: "credo_session=x" } }),
      );
      expect({ rolle, adresse, umgeleitet: antwort.headers.get("location") }).toEqual({ rolle, adresse, umgeleitet: null });
    }
  });

  it("Gegenprobe: /vorlagen leitet die Sachbearbeitung um – deshalb fehlt der Punkt", async () => {
    jwtVerify.mockResolvedValue({ payload: { role: "HR_SACHBEARBEITER" } });
    const antwort = await middleware(
      new NextRequest("http://localhost:3000/vorlagen", { headers: { cookie: "credo_session=x" } }),
    );
    expect(antwort.headers.get("location")).toContain("/vorgaenge");
  });
});

describe("aktiverPunkt", () => {
  const ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

  it.each([
    ["/vorgaenge", "vorgaenge", "/vorgaenge"],
    ["/vorgaenge/vertragsende", "vorgaenge", "/vorgaenge"],
    [`/vorgaenge/onboarding/${ID}`, "vorgaenge", "/vorgaenge"],
    ["/bem", "bem", "/bem"],
    [`/bem/${ID}`, "bem", "/bem"],
    ["/bem/statistik", "bem", "/bem"],
    ["/bem-vorlagen", "verwaltung", "/bem-vorlagen"],
    ["/vorlagen", "vorlagen", "/vorlagen"],
    [`/vorlagen/vorschau/${ID}`, "vorlagen", "/vorlagen"],
    ["/brief-vorlagen", "vorlagen", "/brief-vorlagen"],
    ["/checklisten", "vorlagen", "/checklisten"],
    ["/einstellungen/schulferien", "verwaltung", "/einstellungen"],
    [`/mandanten/${ID}/starterpaket`, "verwaltung", "/mandanten"],
    ["/audit-log", "verwaltung", "/audit-log"],
  ])("%s → %s (%s)", (pfad, schluessel, href) => {
    expect(aktiverPunkt(pfad)).toEqual({ schluessel, href });
  });

  it("im BEM ist nur BEM aktiv – und auf /bem-vorlagen nicht BEM", () => {
    // Frueher begannen beide Adressen mit demselben Anfang, und zwei Punkte
    // waren zugleich markiert.
    expect(aktiverPunkt("/bem")?.schluessel).toBe("bem");
    expect(aktiverPunkt("/bem-vorlagen")?.schluessel).toBe("verwaltung");
  });

  it("ohne passenden Punkt ist keiner aktiv", () => {
    for (const pfad of ["/ui-muster", "/", "/login", "/vorgaengex", "/bemx"]) {
      expect({ pfad, aktiv: aktiverPunkt(pfad) }).toEqual({ pfad, aktiv: null });
    }
  });

  it("zaehlt nur die Punkte, die uebergeben werden", () => {
    // Die Sachbearbeitung sieht „Formulare" nicht — auf /vorlagen ist fuer sie nichts markiert.
    expect(aktiverPunkt("/vorlagen", sichtbarePunkte("HR_SACHBEARBEITER"))).toBeNull();
  });
});

describe("Rollenname", () => {
  it("jede Rolle, die sich anmelden kann, hat einen eigenen Namen", () => {
    for (const rolle of ROLLEN) expect(ROLLEN_NAMEN[rolle]).toBeTruthy();
    expect(new Set(ROLLEN.map(rollenName)).size).toBe(ROLLEN.length);
  });

  it("Einrichtungsleitung und Fuehrungskraft heissen nicht mehr „Sachbearbeiter“", () => {
    expect(rollenName("EINRICHTUNGSLEITUNG")).toBe("Einrichtungsleitung");
    expect(rollenName("VORGESETZTER")).toBe("Führungskraft");
  });

  it("eine unbekannte Rolle zeigt ihren Schluessel – nie den Namen einer anderen", () => {
    expect(rollenName("NEUE_ROLLE")).toBe("NEUE_ROLLE");
    expect(rollenName("constructor")).toBe("constructor");
  });
});
