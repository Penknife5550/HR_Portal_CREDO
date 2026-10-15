/**
 * Tests: Standardkatalog „Ausstattung & Zugänge“ und Migration
 * AUSSTATTUNG_STANDARDKATALOG_V1 (prisma/seed-check.js)
 *
 * Nach der Zustimmung von DSB und MAV (14.10.2026) soll der Katalog mit dem
 * Deploy bereitstehen. `VORSCHLAEGE` (src/lib/ausstattung.ts) ist die einzige
 * Quelle: „Vorschläge übernehmen“ legt daraus fehlende Positionen
 * ausgeschaltet an, die einmalige Migration fuellt einen LEEREN Katalog und
 * schaltet die Positionen mit `standardAktiv` ein — als reines JS mit einer
 * KOPIE der Liste, weil es im Container kein tsx gibt.
 *
 * Belegt werden: beide Fassungen sind Feld fuer Feld gleich; jede Zeile der
 * Kopie besteht dieselbe Pruefung wie POST /api/settings/ausstattung
 * (katalogPositionSchema + positionPruefen) und nennt nur feste Stellen; der
 * Plan fuellt nur einen leeren Katalog, ohne A4-Werte und ohne
 * `standardAktiv` als Spalte; Anlage, Protokoll und Merker liegen in EINER
 * Transaktion; Fehler werden nur geloggt. Dazu, dass die Aufgabentitel lesbar
 * sind und je Einrichtungsart genau eine Schluessel-Position gilt.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { DEPARTMENT_KEYS } from "@/lib/constants";
import {
  AUSSTATTUNG_AUDIT,
  AUSSTATTUNG_AUDIT_LABELS,
  EINRICHTUNGSARTEN,
  KATALOG_FELDER,
  VORSCHLAEGE,
  aehnlicheVorlagenpunkte,
  aufgabenTitel,
  katalogWerte,
  positionGiltAm,
  positionPruefen,
  type KatalogFeld,
} from "@/lib/ausstattung";
import { RUECKGABE_VORGABEN } from "@/lib/ausgaben";
import { katalogPositionSchema } from "@/lib/validations/ausstattung";

// Dank des `require.main === module`-Guards laedt seed-check.js, ohne dass der
// Entrypoint startet (Muster wie in parallele-spuren-migration.test.ts).
const seedCheck = require("../../../prisma/seed-check.js");

type Zeile = Record<string, unknown> & { vorschlagSchluessel: string; isActive: boolean };
type Plan = {
  anlegen: Zeile[];
  details: { vorhanden: number; angelegt: number; eingeschaltet: number };
};

const MARKER: string = seedCheck.AUSSTATTUNG_STANDARDKATALOG_MARKER;
const AUDIT_JS: string = seedCheck.AUSSTATTUNG_STANDARDKATALOG_AUDIT_JS;
const KATALOG_JS: ReadonlyArray<Record<string, unknown>> = seedCheck.STANDARDKATALOG_JS;
const plane: (anzahlVorhanden: number) => Plan = seedCheck.planeStandardkatalog;
const migriere: (prisma: unknown) => Promise<void> = seedCheck.migriereAusstattungStandardkatalog;

/** Die A4-Felder: weder in der Kopie noch in den Schreibdaten (G27). */
const A4_FELDER = ["beiAustritt", "rueckgabeKategorie", "ausgabeKennung"] as const;

/** Die Listenfelder einer Zeile (eingefroren in der Kopie, kopiert in den Schreibdaten). */
const LISTEN_FELDER = ["einrichtungsarten", "optionen", "vorausgewaehlteOptionen", "personengruppen", "sichtbarFuer"] as const;

/** Die Katalogfelder, die ein Vorschlag traegt — die Positivliste ohne `isActive` und ohne A4. */
const VORSCHLAG_FELDER = KATALOG_FELDER.filter(
  (f): f is Exclude<KatalogFeld, "isActive" | (typeof A4_FELDER)[number]> =>
    f !== "isActive" && !(A4_FELDER as readonly string[]).includes(f),
);

const SEED_TS = readFileSync(join(__dirname, "..", "..", "..", "prisma", "seed.ts"), "utf8");

/** Titel und Zustaendigkeit der Punkte einer Onboarding-Vorlage aus prisma/seed.ts, in Reihenfolge. */
function seedPunkte(von: string, bis: string): { title: string; defaultAssignee: string }[] {
  const teil = SEED_TS.slice(SEED_TS.indexOf(von), SEED_TS.indexOf(bis));
  return [...teil.matchAll(/title:\s*"([^"]*)"[\s\S]*?defaultAssignee:\s*"([^"]*)"/g)].map((m) => ({
    title: m[1],
    defaultAssignee: m[2],
  }));
}

/** Die Tabelle aus dem Feinplan, Abschnitt „Standardkatalog (14.10.2026)“: Reihenfolge und Standard. */
const TABELLE: ReadonlyArray<[string, boolean]> = [
  ["IT_ZUGAENGE", true],
  ["IT_ZUGAENGE_SCHULE", true],
  ["IT_LAPTOP", true],
  ["IT_TELEFON", true],
  ["IT_IPAD", true],
  ["IT_MOBIL", true],
  ["IT_BYOD", false],
  ["IT_DURCHWAHL", false],
  ["FACILITY_SCHLUESSEL", true],
  ["FACILITY_SCHLUESSEL_KITA", true],
  ["FACILITY_SCHLUESSEL_BUERO", true],
  ["FACILITY_UNTERRICHTSFAECHER", true],
  ["FACILITY_ARBEITSPLATZ", true],
  ["FACILITY_TRANSPONDER", false],
  ["FACILITY_PARKPLATZ", false],
  ["FACILITY_SPIND", false],
  ["VERWALTUNG_FACH", true],
  ["VERWALTUNG_TUERSCHILD", true],
  ["VERWALTUNG_KOPIERKARTE", false],
  ["VERWALTUNG_DIENSTAUSWEIS", false],
];

/** Was ein Vorschlag der TS-Quelle fuer die Kopie bedeutet: Katalogfelder, Schluessel, Standard. */
function erwartet(v: (typeof VORSCHLAEGE)[number]): Record<string, unknown> {
  const felder = Object.fromEntries(VORSCHLAG_FELDER.map((f) => [f, v[f]]));
  return { ...felder, vorschlagSchluessel: v.vorschlagSchluessel, standardAktiv: v.standardAktiv };
}

// =============================================
// Die Liste selbst (TS)
// =============================================

describe("VORSCHLAEGE als Standardkatalog", () => {
  it("folgt der Tabelle des Feinplans: 20 Positionen, 13 im Standard eingeschaltet", () => {
    expect(VORSCHLAEGE.map((v) => [v.vorschlagSchluessel, v.standardAktiv])).toEqual(TABELLE);
    expect(VORSCHLAEGE).toHaveLength(20);
    expect(VORSCHLAEGE.filter((v) => v.standardAktiv)).toHaveLength(13);
    expect(VORSCHLAEGE.map((v) => v.orderIndex)).toEqual(TABELLE.map((_, i) => i * 10));
  });

  it("jede Einstellung bekommt Zugang, Diensthandy und Türschild (ohne Einschränkung, eingeschaltet)", () => {
    for (const s of ["IT_ZUGAENGE", "IT_MOBIL", "VERWALTUNG_TUERSCHILD"]) {
      const v = VORSCHLAEGE.find((x) => x.vorschlagSchluessel === s)!;
      expect([s, v.standardAktiv, v.einrichtungsarten, v.personengruppen]).toEqual([s, true, [], []]);
    }
    const zugaenge = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "IT_ZUGAENGE")!;
    expect(zugaenge.vorausgewaehlteOptionen).toEqual(["Benutzerkonto und Dienst-E-Mail"]);
    for (const s of ["IT_LAPTOP", "IT_TELEFON"]) {
      expect(VORSCHLAEGE.find((v) => v.vorschlagSchluessel === s)?.vorausgewaehlt).toBe(true);
    }
  });

  it("Rechner und Telefon: überall eingeschaltet, aber nicht für Minijob und Ehrenamt (Entscheidung 14.10.2026)", () => {
    for (const s of ["IT_LAPTOP", "IT_TELEFON"]) {
      const v = VORSCHLAEGE.find((x) => x.vorschlagSchluessel === s)!;
      expect([s, v.standardAktiv, v.einrichtungsarten, v.personengruppen]).toEqual([
        s,
        true,
        [],
        ["STANDARD", "BEAMTE", "ERZIEHER"],
      ]);
    }
    // Alle uebrigen Positionen gelten fuer jede Personengruppe.
    const eingeschraenkt = VORSCHLAEGE.filter((v) => v.personengruppen.length > 0).map((v) => v.vorschlagSchluessel);
    expect(eingeschraenkt).toEqual(["IT_LAPTOP", "IT_TELEFON"]);
  });

  it("je Einrichtungsart gilt genau EINE Schlüssel-Position, und jede schlägt Haupteingang vor", () => {
    const schluessel = VORSCHLAEGE.filter((v) => v.departmentKey === "FACILITY" && v.art === "AUSWAHL");
    expect(schluessel.map((v) => v.vorschlagSchluessel)).toEqual([
      "FACILITY_SCHLUESSEL",
      "FACILITY_SCHLUESSEL_KITA",
      "FACILITY_SCHLUESSEL_BUERO",
    ]);
    for (const art of Object.keys(EINRICHTUNGSARTEN)) {
      const gelten = schluessel.filter((v) =>
        positionGiltAm({ ...v, id: v.vorschlagSchluessel }, { arbeitsortId: "ort", einrichtungsart: art }, []),
      );
      expect([art, gelten.length]).toEqual([art, 1]);
    }
    for (const v of schluessel) {
      expect(v.standardAktiv).toBe(true);
      expect(v.vorausgewaehlteOptionen[0]).toBe("Haupteingang");
      expect(v.hinweisStelle).toBe("Schlüssel gegen Unterschrift ausgeben und die Schlüsselnummer notieren.");
    }
  });

  it("die Aufgabentitel lesen sich: „Schlüssel ausgeben: Haupteingang“, „Zugang einrichten: WLAN“ …", () => {
    const titel = VORSCHLAEGE.flatMap((v) => {
      if (v.art === "ANGABE") return [];
      if (v.art === "AUSWAHL") return v.optionen.map((o) => aufgabenTitel(v, o));
      return [aufgabenTitel(v, "")];
    });
    expect(titel).toEqual(
      expect.arrayContaining([
        "Zugang einrichten: Benutzerkonto und Dienst-E-Mail",
        "Zugang einrichten: WLAN",
        "Zugang einrichten: Schulverwaltung",
        "Dienstrechner/Endgerät (Laptop/PC) bereitstellen",
        "Telefon mit Durchwahl bereitstellen",
        "Diensthandy bereitstellen",
        "Schlüssel ausgeben: Haupteingang",
        "Schlüssel ausgeben: Gruppenraum",
        "Schlüssel ausgeben: Büro",
        "Fach im Lehrerzimmer bereitstellen",
        "Türschild bereitstellen",
        "Private Endgeräte (BYOD) freischalten",
      ]),
    );
    for (const t of titel) {
      expect(t).not.toMatch(/freischalten bereitstellen|ausgeben bereitstellen|einrichten bereitstellen/);
      expect(t.length).toBeLessThanOrEqual(120);
    }
  });

  it("Angaben bleiben ohne Aufgabe; der Arbeitsplatz-Raum geht an Gebäudewirtschaft, IT und Sekretariat", () => {
    const arbeitsplatz = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "FACILITY_ARBEITSPLATZ")!;
    expect(arbeitsplatz).toMatchObject({
      art: "ANGABE",
      angabeSchluessel: "ARBEITSPLATZ_RAUM",
      bezeichnung: "Raum des Arbeitsplatzes",
      sichtbarFuer: ["IT", "VERWALTUNG"],
      defaultDueDays: null,
      aufgabeTitel: null,
      bemerkungAnbieten: false,
    });
    const faecher = VORSCHLAEGE.find((v) => v.vorschlagSchluessel === "FACILITY_UNTERRICHTSFAECHER")!;
    expect(faecher.einrichtungsarten).toEqual(["GYMNASIUM", "GESAMTSCHULE", "GRUNDSCHULE", "BERUFSKOLLEG"]);
  });

  it("standardAktiv ist kein Katalogfeld: katalogWerte und das Schema lassen es fallen", () => {
    for (const v of VORSCHLAEGE) {
      expect(katalogWerte({ ...v, isActive: false })).not.toHaveProperty("standardAktiv");
      expect(katalogPositionSchema.parse(v)).not.toHaveProperty("standardAktiv");
    }
    expect(KATALOG_FELDER as readonly string[]).not.toContain("standardAktiv");
  });

  it("die Katalogseite warnt vor den doppelten Aufgaben aus „Standard-Einstellung (TV-L)“ (prisma/seed.ts)", () => {
    const punkte = seedPunkte("const standardItems", "const minijobItems");
    expect(punkte.length).toBeGreaterThan(15);
    const katalog = VORSCHLAEGE.map((v) => ({ ...v, id: v.vorschlagSchluessel, isActive: v.standardAktiv }));
    const treffer = aehnlicheVorlagenpunkte(
      katalog,
      punkte.map((p, i) => ({ ...p, id: `p${i}`, templateId: "seed-checklist-standard", templateName: "Standard-Einstellung (TV-L)" })),
    );
    // Gleiche Stelle: Zugänge, Rechner (über „Endgerät“) und Fach im Lehrerzimmer meldet die Seite.
    expect(treffer.map((t) => [t.positionId, t.punktTitel])).toEqual(
      expect.arrayContaining([
        ["IT_ZUGAENGE", "Benutzerkonto und dienstliche E-Mail-Adresse anlegen"],
        ["IT_LAPTOP", "Arbeitsplatz/Endgerät einrichten, Zugangsdaten übergeben"],
        ["VERWALTUNG_FACH", "Postfach, Namensschild und Telefonliste vorbereiten"],
      ]),
    );
    // Über zwei Stellen meldet sie nichts: Die Schlüssel-Punkte hängen in der Vorlage an der
    // Verwaltung, die Schlüssel-Positionen an der Gebäudewirtschaft — deshalb steht das Paar als
    // Handgriff im Feinplan (Abschnitt 8). Ändert sich der Seed, muss der Handgriff mit.
    expect(punkte.filter((p) => p.title.includes("Schlüssel"))).toEqual([
      { title: "Schlüssel/Transponder bestellen", defaultAssignee: "VERWALTUNG" },
      { title: "Schlüsselübergabe dokumentieren", defaultAssignee: "VERWALTUNG" },
    ]);
    expect(treffer.filter((t) => t.punktTitel.includes("Schlüssel"))).toEqual([]);
    expect(seedPunkte("const minijobItems", "const onboardingChecklisten")).toContainEqual({
      title: "Schlüssel/Transponder bestellen (falls nötig)",
      defaultAssignee: "VERWALTUNG",
    });
  });

  it("RUECKGABE_VORGABEN deckt jeden Vorschlag ab, der keine Angabe ist — auch die neuen", () => {
    const ohneAngabe = VORSCHLAEGE.filter((v) => v.art !== "ANGABE").map((v) => v.vorschlagSchluessel);
    expect(Object.keys(RUECKGABE_VORGABEN).sort()).toEqual([...ohneAngabe].sort());
    for (const s of ["IT_ZUGAENGE_SCHULE", "IT_MOBIL", "FACILITY_SCHLUESSEL_KITA", "FACILITY_SCHLUESSEL_BUERO"]) {
      expect(RUECKGABE_VORGABEN).toHaveProperty(s);
    }
    expect(RUECKGABE_VORGABEN).not.toHaveProperty("FACILITY_ARBEITSPLATZ");
  });
});

// =============================================
// Paritaet TS ↔ JS
// =============================================

describe("JS-Kopie in prisma/seed-check.js", () => {
  it("hat dieselben Vorschläge in derselben Reihenfolge", () => {
    expect(KATALOG_JS.map((v) => v.vorschlagSchluessel)).toEqual(VORSCHLAEGE.map((v) => v.vorschlagSchluessel));
  });

  it("gleicht der TS-Quelle Feld für Feld (Standardwerte, orderIndex, standardAktiv)", () => {
    const abweichungen: string[] = [];
    VORSCHLAEGE.forEach((v, i) => {
      const soll = erwartet(v);
      const ist = KATALOG_JS[i] ?? {};
      const felder = new Set([...Object.keys(soll), ...Object.keys(ist)]);
      for (const f of felder) {
        if (JSON.stringify(ist[f]) !== JSON.stringify(soll[f])) {
          abweichungen.push(`${v.vorschlagSchluessel}.${f}: JS ${JSON.stringify(ist[f])} ≠ TS ${JSON.stringify(soll[f])}`);
        }
      }
    });
    expect(abweichungen).toEqual([]);
    // Kein Feld zu viel: weder A4-Werte noch der Pflegehinweis (kein Katalogfeld).
    for (const zeile of KATALOG_JS) {
      for (const f of [...A4_FELDER, "pflegeHinweis", "isActive", "id"]) expect(zeile).not.toHaveProperty(f);
    }
  });

  it("jede Zeile besteht die Prüfung von POST /api/settings/ausstattung (Zod + positionPruefen)", () => {
    for (const zeile of KATALOG_JS) {
      const geparst = katalogPositionSchema.safeParse(zeile);
      expect(`${zeile.vorschlagSchluessel}: ${geparst.success ? "ok" : geparst.error.errors[0]?.message}`).toBe(
        `${zeile.vorschlagSchluessel}: ok`,
      );
      if (!geparst.success) continue;
      // So rechnet positionAnlegen: geparster Body, ausgeschaltet, nur die Positivliste.
      const werte = katalogWerte({ ...geparst.data, isActive: false });
      expect(`${zeile.vorschlagSchluessel}: ${positionPruefen(werte)}`).toBe(`${zeile.vorschlagSchluessel}: null`);
      // Zod aendert nichts an den Werten (sonst saehe die Oberflaeche spaeter anderes als die Migration schrieb).
      for (const f of VORSCHLAG_FELDER) {
        expect([zeile.vorschlagSchluessel, f, (werte as Record<string, unknown>)[f]]).toEqual([
          zeile.vorschlagSchluessel,
          f,
          zeile[f],
        ]);
      }
    }
  });

  it("nennt nur feste Stellen (der Dienst weist unbekannte ab; eigene Schlüssel kennt nur die Datenbank)", () => {
    const fest = Object.values(DEPARTMENT_KEYS) as string[];
    for (const zeile of KATALOG_JS) {
      for (const stelle of [zeile.departmentKey, ...(zeile.sichtbarFuer as string[])]) {
        expect(fest).toContain(stelle);
      }
    }
  });

  it("der Protokoll-Code ist derselbe wie in AUSSTATTUNG_AUDIT und hat eine Beschriftung", () => {
    expect(AUDIT_JS).toBe(AUSSTATTUNG_AUDIT.STANDARDKATALOG_ANGELEGT);
    expect(AUSSTATTUNG_AUDIT_LABELS[AUSSTATTUNG_AUDIT.STANDARDKATALOG_ANGELEGT]).toBe(
      "Standardkatalog Ausstattung & Zugänge angelegt",
    );
  });

  it("ist tief eingefroren (weder eine Zeile noch eine ihrer Listen laesst sich zur Laufzeit verbiegen)", () => {
    expect(Object.isFrozen(KATALOG_JS)).toBe(true);
    for (const zeile of KATALOG_JS) {
      expect(Object.isFrozen(zeile)).toBe(true);
      for (const f of LISTEN_FELDER) {
        expect([zeile.vorschlagSchluessel, f, Object.isFrozen(zeile[f])]).toEqual([zeile.vorschlagSchluessel, f, true]);
      }
    }
    // Ein Schreibversuch aendert nichts (im strikten Modus wirft er).
    expect(() => (KATALOG_JS[0].optionen as string[]).push("X")).toThrow(TypeError);
    expect(plane(0).anlegen[0].optionen).toEqual(["Benutzerkonto und Dienst-E-Mail", "Drucker-PIN", "WLAN"]);
  });
});

// =============================================
// Plan der Migration (rein)
// =============================================

describe("planeStandardkatalog", () => {
  it("leerer Katalog: alle Vorschläge, eingeschaltet genau die mit standardAktiv", () => {
    const plan = plane(0);
    expect(plan.anlegen.map((z) => [z.vorschlagSchluessel, z.isActive])).toEqual(TABELLE);
    expect(plan.details).toEqual({ vorhanden: 0, angelegt: 20, eingeschaltet: 13 });
  });

  it("schreibt zentral, mit Schlüssel und Standardwerten — ohne A4-Werte, ohne standardAktiv, ohne ID", () => {
    const erlaubt = [...VORSCHLAG_FELDER, "isActive", "vorschlagSchluessel"].sort();
    for (const z of plane(0).anlegen) {
      expect(Object.keys(z).sort()).toEqual(erlaubt);
      expect(z.organizationId).toBeNull();
    }
    const laptop = plane(0).anlegen.find((z) => z.vorschlagSchluessel === "IT_LAPTOP")!;
    expect(laptop).toMatchObject({ defaultDueDays: -5, vorausgewaehlt: true, isActive: true });
  });

  it("jede Schreibzeile besteht positionPruefen (so steht sie danach im Katalog)", () => {
    for (const z of plane(0).anlegen) {
      expect(`${z.vorschlagSchluessel}: ${positionPruefen(z as never)}`).toBe(`${z.vorschlagSchluessel}: null`);
    }
  });

  it("jede Liste ist eine eigene Kopie (Prisma bekommt nie die eingefrorene Kopie)", () => {
    const [erste] = plane(0).anlegen;
    const quelle = KATALOG_JS[0];
    for (const f of LISTEN_FELDER) expect(Object.isFrozen(erste[f])).toBe(false);
    for (const f of LISTEN_FELDER) {
      expect(erste[f]).toEqual(quelle[f]);
      expect(erste[f]).not.toBe(quelle[f]);
    }
    // Zwei Laeufe teilen auch untereinander keine Liste.
    expect(plane(0).anlegen[0].optionen).not.toBe(erste.optionen);
  });

  it("nicht leerer Katalog: nichts anlegen, die Anzahl steht im Nachweis", () => {
    expect(plane(1)).toEqual({ anlegen: [], details: { vorhanden: 1, angelegt: 0, eingeschaltet: 0 } });
    expect(plane(37)).toEqual({ anlegen: [], details: { vorhanden: 37, angelegt: 0, eingeschaltet: 0 } });
  });
});

// =============================================
// Ablauf der Migration (Prisma-Ersatz)
// =============================================

describe("migriereAusstattungStandardkatalog", () => {
  function prismaErsatz(opts: { erledigt?: boolean; vorhanden?: number } = {}) {
    const tx = {
      ausstattungsPosition: {
        count: jest.fn().mockResolvedValue(opts.vorhanden ?? 0),
        createMany: jest.fn().mockResolvedValue({ count: 20 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      systemMigration: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      tx,
      systemMigration: { findUnique: jest.fn().mockResolvedValue(opts.erledigt ? { id: "m1" } : null) },
      // Ausserhalb der Transaktion wird nur gezaehlt (Hinweis bei gesetztem Merker), nie
      // geschrieben — die schreibenden Ersatzmethoden fehlen absichtlich.
      ausstattungsPosition: { count: jest.fn().mockResolvedValue(opts.vorhanden ?? 0) },
      $transaction: jest.fn(async (arbeit: (t: typeof tx) => Promise<unknown>) => arbeit(tx)),
    };
  }

  let log: jest.SpyInstance;
  let fehler: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
    fehler = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    fehler.mockRestore();
  });

  it("traegt einen stabilen Namen", () => {
    expect(MARKER).toBe("AUSSTATTUNG_STANDARDKATALOG_V1");
  });

  it("leerer Katalog: Anlage, Protokoll und Merker in EINER Transaktion — mit denselben IDs", async () => {
    const p = prismaErsatz({ vorhanden: 0 });

    await migriere(p);

    expect(p.systemMigration.findUnique).toHaveBeenCalledWith({ where: { name: MARKER }, select: { id: true } });
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    expect(p.tx.ausstattungsPosition.count).toHaveBeenCalledWith();

    const { data } = p.tx.ausstattungsPosition.createMany.mock.calls[0][0] as { data: Zeile[] };
    expect(data).toHaveLength(20);
    const ids = data.map((z) => z.id as string);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const { id: _id, ...ohneId } = data[0];
    expect(ohneId).toEqual(plane(0).anlegen[0]);

    expect(p.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        processType: "SYSTEM",
        action: AUSSTATTUNG_AUDIT.STANDARDKATALOG_ANGELEGT,
        details: {
          migration: MARKER,
          angelegt: 20,
          eingeschaltet: 13,
          positionen: data.map((z) => ({
            positionId: z.id,
            vorschlagSchluessel: z.vorschlagSchluessel,
            departmentKey: z.departmentKey,
            isActive: z.isActive,
          })),
        },
      },
    });
    // Protokoll ohne Inhalte: keine Bezeichnung, kein Hinweis, keine Option.
    const details = JSON.stringify(p.tx.auditLog.create.mock.calls[0][0]);
    expect(details).not.toMatch(/Schlüssel gegen Unterschrift|Haupteingang|Dienstrechner/);

    expect(p.tx.systemMigration.create).toHaveBeenCalledWith({
      data: { name: MARKER, details: { vorhanden: 0, angelegt: 20, eingeschaltet: 13 } },
    });
    expect(log).toHaveBeenCalledWith(
      "Ausstattung & Zugaenge (AUSSTATTUNG_STANDARDKATALOG_V1): 20 Katalogpositionen angelegt, 13 eingeschaltet.",
    );
  });

  it("nicht leerer Katalog: nichts anlegen, kein Protokoll, aber Merker mit der Anzahl", async () => {
    const p = prismaErsatz({ vorhanden: 7 });

    await migriere(p);

    expect(p.tx.ausstattungsPosition.createMany).not.toHaveBeenCalled();
    expect(p.tx.auditLog.create).not.toHaveBeenCalled();
    expect(p.tx.systemMigration.create).toHaveBeenCalledWith({
      data: { name: MARKER, details: { vorhanden: 7, angelegt: 0, eingeschaltet: 0 } },
    });
    expect(log).toHaveBeenCalledWith(
      "Ausstattung & Zugaenge (AUSSTATTUNG_STANDARDKATALOG_V1): Katalog nicht leer (7 Positionen) - nichts angelegt.",
    );
  });

  it("laeuft kein zweites Mal, wenn der Merker steht — bei gepflegtem Katalog ohne Zeile", async () => {
    const p = prismaErsatz({ erledigt: true, vorhanden: 20 });

    await migriere(p);

    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.tx.ausstattungsPosition.count).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("Merker steht, Katalog leer (etwa nach einem Rueckfall auf ein Image ohne Ausstattung): Hinweiszeile, nichts angelegt", async () => {
    const p = prismaErsatz({ erledigt: true, vorhanden: 0 });

    await migriere(p);

    expect(p.$transaction).not.toHaveBeenCalled();
    expect(p.tx.ausstattungsPosition.createMany).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Ausstattung & Zugaenge (AUSSTATTUNG_STANDARDKATALOG_V1): bereits gelaufen, Katalog leer - nichts angelegt.",
    );
  });

  it("loggt einen Fehler und bricht den Start nicht ab — ohne Merker laeuft sie beim naechsten Start erneut", async () => {
    const p = prismaErsatz();
    p.tx.ausstattungsPosition.createMany.mockRejectedValue(new Error("Verbindung weg"));

    await expect(migriere(p)).resolves.toBeUndefined();

    expect(fehler).toHaveBeenCalledWith(expect.stringContaining(MARKER), "Verbindung weg");
    expect(log).not.toHaveBeenCalled();
  });
});
