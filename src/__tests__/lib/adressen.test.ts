/**
 * Adressen des Portals (UX-Umbau U1, Entscheidung E4).
 *
 * Drei Dinge:
 *   1. `adressen.ts` baut die neuen Adressen und uebersetzt jede alte.
 *   2. Die Middleware leitet alte Adressen mit 308 um — vor der
 *      Sitzungspruefung — und schuetzt die neuen; die oeffentliche Seite
 *      `/bem/einwilligung` bleibt offen.
 *   3. WAECHTER: Ausserhalb von `adressen.ts` steht im Quelltext keine alte
 *      Adresse mehr, und zu jeder Adresse gibt es genau eine Seiten-Datei.
 */
import fs from "fs";
import path from "path";

const jwtVerify = jest.fn();
// jose ist ein reines ES-Modul; die Rolle der Sitzung legt der Test fest.
jest.mock("jose", () => ({ jwtVerify: (...args: unknown[]) => jwtVerify(...args) }));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  alteAdresse,
  BEM_STATISTIK_PFAD,
  bemPfad,
  istBemPortalPfad,
  istVorgaengePfad,
  istVorgangsModul,
  unter,
  vorgangPfad,
  vorgangslistePfad,
  VORGANGS_MODUL_NAMEN,
  VORGANGS_MODULE,
} from "@/lib/adressen";

const ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

// =============================================
// Neue Adressen bauen
// =============================================

describe("Adressen bauen", () => {
  it("sechs Module, dauerhaft, jedes mit Namen", () => {
    expect([...VORGANGS_MODULE]).toEqual([
      "onboarding",
      "offboarding",
      "vertragsende",
      "verbeamtung",
      "mutterschutz",
      "elternzeit",
    ]);
    for (const m of VORGANGS_MODULE) expect(VORGANGS_MODUL_NAMEN[m]).toBeTruthy();
  });

  it("Liste, Vorgang, Vorgang mit Reiter", () => {
    expect(vorgangslistePfad()).toBe("/vorgaenge");
    expect(vorgangslistePfad("vertragsende")).toBe("/vorgaenge/vertragsende");
    expect(vorgangPfad("onboarding", ID)).toBe(`/vorgaenge/onboarding/${ID}`);
    expect(vorgangPfad("onboarding", ID, "dokumente")).toBe(`/vorgaenge/onboarding/${ID}?tab=dokumente`);
  });

  it("BEM: Liste, Fall, Statistik", () => {
    expect(bemPfad()).toBe("/bem");
    expect(bemPfad(ID)).toBe(`/bem/${ID}`);
    expect(BEM_STATISTIK_PFAD).toBe("/bem/statistik");
  });

  it("eine Kennung mit Sonderzeichen kann die Adresse nicht verbiegen", () => {
    expect(vorgangPfad("onboarding", "a/b?c#d")).toBe("/vorgaenge/onboarding/a%2Fb%3Fc%23d");
    expect(bemPfad("../x")).toBe("/bem/..%2Fx");
    expect(vorgangPfad("onboarding", ID, "a&b=c")).toBe(`/vorgaenge/onboarding/${ID}?tab=a%26b%3Dc`);
  });

  it("istVorgangsModul kennt nur die sechs Namen", () => {
    expect(istVorgangsModul("verbeamtung")).toBe(true);
    for (const x of ["civil-service", "bem", "", "constructor", "Onboarding", undefined, 3]) {
      expect(istVorgangsModul(x)).toBe(false);
    }
  });

  it("unter() vergleicht ganze Pfadteile", () => {
    expect(unter("/bem", "/bem")).toBe(true);
    expect(unter("/bem/x", "/bem")).toBe(true);
    expect(unter("/bem-vorlagen", "/bem")).toBe(false);
    expect(unter("/vorgaengex", "/vorgaenge")).toBe(false);
  });

  it("das BEM-Modul des Portals ist nicht die oeffentliche Einwilligungsseite", () => {
    for (const p of ["/bem", `/bem/${ID}`, "/bem/statistik"]) expect(istBemPortalPfad(p)).toBe(true);
    for (const p of ["/bem/einwilligung", `/bem/einwilligung/${ID}`, "/bem-vorlagen", "/bemx", "/"]) {
      expect({ p, portal: istBemPortalPfad(p) }).toEqual({ p, portal: false });
    }
    expect(istVorgaengePfad("/vorgaenge/onboarding")).toBe(true);
    expect(istVorgaengePfad("/vorgaenge-alt")).toBe(false);
  });
});

// =============================================
// Alte Adressen uebersetzen
// =============================================

describe("alteAdresse", () => {
  it.each([
    ["/dashboard", "", "/vorgaenge"],
    ["/dashboard/", "", "/vorgaenge"],
    ["/dashboard", "?tab=onboarding", "/vorgaenge/onboarding"],
    ["/dashboard", "?tab=offboarding", "/vorgaenge/offboarding"],
    ["/dashboard", "?tab=contract-end", "/vorgaenge/vertragsende"],
    ["/dashboard", "?tab=civil-service", "/vorgaenge/verbeamtung"],
    ["/dashboard", "?tab=mutterschutz", "/vorgaenge/mutterschutz"],
    ["/dashboard", "?tab=elternzeit", "/vorgaenge/elternzeit"],
    [`/dashboard/${ID}`, "", `/vorgaenge/onboarding/${ID}`],
    [`/dashboard/${ID}`, "?tab=dokumente", `/vorgaenge/onboarding/${ID}?tab=dokumente`],
    [`/dashboard/offboarding/${ID}`, "", `/vorgaenge/offboarding/${ID}`],
    [`/dashboard/contract-end/${ID}`, "", `/vorgaenge/vertragsende/${ID}`],
    [`/dashboard/civil-service/${ID}`, "?tab=beurteilungen", `/vorgaenge/verbeamtung/${ID}?tab=beurteilungen`],
    [`/dashboard/elternzeit/${ID}`, "", `/vorgaenge/elternzeit/${ID}`],
    [`/dashboard/mutterschutz/${ID}/`, "", `/vorgaenge/mutterschutz/${ID}`],
    ["/dashboard/bem", "", "/bem"],
    [`/dashboard/bem/${ID}`, "", `/bem/${ID}`],
    ["/dashboard/bem/statistik", "", "/bem/statistik"],
  ])("%s%s → %s", (pfad, suche, neu) => {
    expect(alteAdresse(pfad, suche)).toBe(neu);
  });

  it("an der alten Liste wird nur ?tab zum Pfad – alles andere bleibt", () => {
    expect(alteAdresse("/dashboard", "?tab=contract-end&status=offen")).toBe("/vorgaenge/vertragsende?status=offen");
    expect(alteAdresse("/dashboard", "?status=offen")).toBe("/vorgaenge?status=offen");
  });

  it("ein unbekannter oder boeser Reiter faellt weg, statt eine Adresse zu erfinden", () => {
    for (const tab of ["gibt-es-nicht", "constructor", "__proto__", "bem", ""]) {
      expect(alteAdresse("/dashboard", `?tab=${tab}`)).toBe("/vorgaenge");
    }
  });

  it("ein Modulname ist keine Kennung", () => {
    // `/dashboard/offboarding` gab es nie als Seite; es wird die Liste, kein
    // Onboarding-Vorgang mit der Kennung „offboarding".
    expect(alteAdresse("/dashboard/offboarding")).toBe("/vorgaenge/offboarding");
    expect(alteAdresse("/dashboard/onboarding")).toBe("/vorgaenge/onboarding");
    // `constructor` ist kein Modul, also eine (unbekannte) Kennung.
    expect(alteAdresse("/dashboard/constructor")).toBe("/vorgaenge/onboarding/constructor");
  });

  it("alles andere ist keine alte Adresse", () => {
    for (const p of [
      "/",
      "/login",
      "/vorgaenge",
      `/vorgaenge/onboarding/${ID}`,
      "/bem",
      "/dashboardx",
      "/dashboard-alt/x",
      "/api/dashboard/stats",
      "/x/dashboard",
    ]) {
      expect({ p, neu: alteAdresse(p) }).toEqual({ p, neu: null });
    }
  });

  it("keine Schleife: das Ziel wird nie noch einmal uebersetzt", () => {
    for (const [pfad, suche] of [
      ["/dashboard", ""],
      ["/dashboard", "?tab=civil-service"],
      [`/dashboard/${ID}`, "?tab=dokumente"],
      ["/dashboard/bem/statistik", ""],
      ["/dashboard/dashboard", ""],
    ]) {
      const ziel = alteAdresse(pfad, suche)!;
      const [zielPfad, zielSuche = ""] = ziel.split("?");
      expect({ ziel, nochmal: alteAdresse(zielPfad, zielSuche ? `?${zielSuche}` : "") }).toEqual({ ziel, nochmal: null });
    }
  });
});

// =============================================
// Middleware
// =============================================

describe("Middleware", () => {
  const ALT_ENV = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = "test-geheimnis-test-geheimnis-test-geheimnis";
  });
  afterAll(() => {
    process.env.JWT_SECRET = ALT_ENV;
  });
  beforeEach(() => {
    jwtVerify.mockReset();
  });

  const aufruf = (adresse: string, rolle?: string) => {
    const anfrage = new NextRequest(`http://localhost:3000${adresse}`, {
      headers: rolle ? { cookie: "credo_session=x" } : undefined,
    });
    if (rolle) jwtVerify.mockResolvedValue({ payload: { role: rolle } });
    return middleware(anfrage);
  };
  const ziel = (antwort: Response) => {
    const ort = antwort.headers.get("location");
    return ort ? new URL(ort).pathname + new URL(ort).search : null;
  };

  it.each([
    ["/dashboard", "/vorgaenge"],
    ["/dashboard?tab=contract-end", "/vorgaenge/vertragsende"],
    [`/dashboard/${ID}?tab=dokumente`, `/vorgaenge/onboarding/${ID}?tab=dokumente`],
    [`/dashboard/civil-service/${ID}`, `/vorgaenge/verbeamtung/${ID}`],
    [`/dashboard/bem/${ID}`, `/bem/${ID}`],
  ])("%s leitet dauerhaft (308) auf %s – ohne Sitzung, ohne Token-Pruefung", async (alt, neu) => {
    const antwort = await aufruf(alt);
    expect(antwort.status).toBe(308);
    expect(ziel(antwort)).toBe(neu);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it("auch mit Sitzung wird zuerst umgeleitet", async () => {
    const antwort = await aufruf(`/dashboard/offboarding/${ID}`, "HR_LEITUNG");
    expect(antwort.status).toBe(308);
    expect(ziel(antwort)).toBe(`/vorgaenge/offboarding/${ID}`);
  });

  it.each(["/vorgaenge", "/vorgaenge/onboarding", `/vorgaenge/vertragsende/${ID}`, "/bem", `/bem/${ID}`, "/bem/statistik"])(
    "%s ohne Sitzung fuehrt zur Anmeldung",
    async (adresse) => {
      const antwort = await aufruf(adresse);
      expect(antwort.status).toBe(307);
      expect(ziel(antwort)).toBe("/login");
    },
  );

  it.each(["/bem/einwilligung", `/bem/einwilligung/${ID}`])("%s ist oeffentlich und bleibt es", async (adresse) => {
    const antwort = await aufruf(adresse);
    expect(antwort.headers.get("location")).toBeNull();
    expect(antwort.status).toBe(200);
  });

  it("mit Sitzung kommen die neuen Adressen durch", async () => {
    for (const adresse of ["/vorgaenge/onboarding", `/vorgaenge/verbeamtung/${ID}`, `/bem/${ID}`]) {
      const antwort = await aufruf(adresse, "HR_SACHBEARBEITER");
      expect({ adresse, ort: antwort.headers.get("location") }).toEqual({ adresse, ort: null });
    }
  });

  it("BEM-Beauftragte sehen nur das BEM-Modul – auch nicht /bem-vorlagen", async () => {
    for (const adresse of ["/vorgaenge", `/vorgaenge/onboarding/${ID}`, "/bem-vorlagen", "/einstellungen"]) {
      const antwort = await aufruf(adresse, "BEM_BEAUFTRAGTER");
      expect({ adresse, ziel: ziel(antwort) }).toEqual({ adresse, ziel: "/bem" });
    }
    for (const adresse of ["/bem", `/bem/${ID}`]) {
      const antwort = await aufruf(adresse, "BEM_BEAUFTRAGTER");
      expect({ adresse, ort: antwort.headers.get("location") }).toEqual({ adresse, ort: null });
    }
  });

  it("ohne Verwaltungsrechte fuehrt eine Verwaltungsseite zur Vorgangsliste", async () => {
    const antwort = await aufruf("/einstellungen", "HR_SACHBEARBEITER");
    expect(ziel(antwort)).toBe("/vorgaenge");
  });
});

// =============================================
// Waechter
// =============================================

describe("Waechter", () => {
  const SRC = path.join(__dirname, "..", "..");

  function dateien(ordner: string): string[] {
    return fs.readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
      const voll = path.join(ordner, e.name);
      if (e.isDirectory()) return e.name === "__tests__" ? [] : dateien(voll);
      return /\.(ts|tsx)$/.test(e.name) ? [voll] : [];
    });
  }
  const relativ = (d: string) => path.relative(SRC, d).split(path.sep).join("/");

  it("ausserhalb von adressen.ts nennt der Quelltext keine alte Adresse", () => {
    // Erlaubt bleiben: die Schnittstelle `/api/dashboard/…` und der ORDNER
    // `(portal)/dashboard/`, in dem die Dateien der Module bis U4 liegen.
    const treffer: string[] = [];
    // Auch die Skripte (Screenshots, n8n-Bausteine): Sie liefen sonst nur noch
    // ueber die Weiterleitung.
    const skripte = fs
      .readdirSync(path.join(SRC, "..", "scripts"))
      .filter((n) => /\.(js|ts|py)$/.test(n))
      .map((n) => path.join(SRC, "..", "scripts", n));
    for (const d of [...dateien(SRC), ...skripte]) {
      if (relativ(d) === "lib/adressen.ts") continue;
      // Das Abnahme-Skript ruft die alten Adressen ABSICHTLICH auf (es prueft
      // die Weiterleitung im Browser).
      if (path.basename(d) === "ux-abnahme-u1.js") continue;
      fs.readFileSync(d, "utf8")
        .split("\n")
        .forEach((zeile, i) => {
          const bereinigt = zeile.replace(/\/api\/dashboard/g, "").replace(/\(portal\)\/dashboard\//g, "");
          // `/dashboard` als ganzer Pfadteil — `@/components/dashboard-charts` ist keine Adresse.
          if (/\/dashboard(?![\w-])/.test(bereinigt)) treffer.push(`${relativ(d)}:${i + 1}`);
        });
    }
    expect(treffer).toEqual([]);
  });

  it("unter (portal)/dashboard/ liegt keine Seiten-Datei mehr – jede Seite gibt es genau einmal", () => {
    const alteSeiten = dateien(path.join(SRC, "app", "(portal)", "dashboard"))
      .map(relativ)
      .filter((d) => /\/(page|layout|route)\.tsx?$/.test(d));
    expect(alteSeiten).toEqual([]);
  });

  it("zu jedem Modul gibt es Liste und Vorgang, zum BEM Liste, Fall und Statistik", () => {
    const portal = path.join(SRC, "app", "(portal)");
    const gibt = (...teile: string[]) => fs.existsSync(path.join(portal, ...teile, "page.tsx"));
    expect(gibt("vorgaenge")).toBe(true);
    expect(gibt("vorgaenge", "[modul]")).toBe(true);
    for (const m of VORGANGS_MODULE) expect({ m, seite: gibt("vorgaenge", m, "[id]") }).toEqual({ m, seite: true });
    // Kein Ordner unter vorgaenge/, der kein Modul ist (ausser der Liste).
    const ordner = fs.readdirSync(path.join(portal, "vorgaenge"), { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(ordner.map((e) => e.name).sort()).toEqual(["[modul]", ...VORGANGS_MODULE].sort());
    expect(gibt("bem")).toBe(true);
    expect(gibt("bem", "[id]")).toBe(true);
    expect(gibt("bem", "statistik")).toBe(true);
  });
});
