/**
 * Tests: pauschale Sperrpunkte der Offboarding-Vorlagen (Ausstattung &
 * Zugaenge, A4; Feinplan G25, S36)
 *
 * Die Titel der pauschalen Punkte („Rueckgabe aller Arbeitsmittel“,
 * „IT-Zugaenge … sperren“ …) bleiben; sie bekommen einen Hinweis fuer die
 * Stelle (`description`). Zwei Wege dorthin:
 *   - neue Datenbanken: prisma/seed.ts (`mitSperrpunktHinweisen`);
 *   - Bestand: die einmalige Migration OFFBOARDING_SPERRPUNKTE_V1 in
 *     prisma/seed-check.js — als reines JS mit einer KOPIE von Tabelle und
 *     Regel, weil es im Container kein tsx gibt.
 *
 * Belegt werden: beide Fassungen sind gleich, die Migration fasst nur Punkte
 * mit unveraendertem Titel und leerer Beschreibung in Offboarding-Vorlagen an,
 * Merker und Aenderung liegen in EINER Transaktion, ein zweiter Lauf bleibt
 * ohne Wirkung, und der Seed traegt den Hinweis an genau diesen Punkten.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { istOffboardingVorlagenName } from "@/lib/abteilungsaufgaben";
import { AUSSTATTUNG_KATEGORIE } from "@/lib/ausstattung";
import {
  SPERRPUNKT_HINWEIS,
  SPERRPUNKT_HINWEISE,
  beschreibungLeer,
  mitSperrpunktHinweisen,
  sperrpunktHinweis,
} from "@/lib/offboarding-sperrpunkte";
import { CHECKLISTEN_HINWEIS_MAX } from "@/lib/validations/abteilungsaufgaben";

// Dank des `require.main === module`-Guards laedt seed-check.js, ohne dass der
// Entrypoint startet (Muster wie in parallele-spuren-migration.test.ts).
const seedCheck = require("../../../prisma/seed-check.js");

type Punkt = { id: string; templateId: string; title: string | null; description: string | null };
type Plan = {
  punkte: { id: string; templateId: string; title: string; von: string | null; nach: string }[];
  mitBeschreibung: number;
  andereVorlage: number;
};

const MARKER: string = seedCheck.OFFBOARDING_SPERRPUNKTE_MARKER;
const HINWEIS_JS: string = seedCheck.SPERRPUNKT_HINWEIS_JS;
const HINWEISE_JS: Record<string, string> = seedCheck.SPERRPUNKT_HINWEISE_JS;
const hinweisJs: (name: string | null | undefined, punkt: { title: unknown; description?: unknown }) => string | null =
  seedCheck.sperrpunktHinweisJs;
const plane: (eingabe: { vorlagen: { id: string; name: string }[]; vorlagenPunkte: Punkt[] }) => Plan =
  seedCheck.planeOffboardingSperrpunkte;
const migriere: (prisma: unknown) => Promise<void> = seedCheck.migriereOffboardingSperrpunkte;

const SEED_TS = readFileSync(join(__dirname, "..", "..", "..", "prisma", "seed.ts"), "utf8");
const SEED_CHECK_JS = readFileSync(join(__dirname, "..", "..", "..", "prisma", "seed-check.js"), "utf8");

/** Die zehn Punkte aus Feinplan S36 – Standard/Bildung, Beamte, Minijob. */
const ERWARTETE_TITEL = [
  "Rueckgabe aller Arbeitsmittel",
  "IT-Zugaenge zur Sperrung vorbereiten",
  "IT-Zugaenge und E-Mail-Konto sperren",
  "Physische Zugaenge entziehen (Schlüssel, Karten)",
  "Rueckgabe Dienstausweis und Arbeitsmittel",
  "IT-Zugaenge und Dienstmail sperren",
  "Physische Zugaenge entziehen",
  "Arbeitsmittel zurueckgeben",
  "IT-Zugaenge sperren (falls vorhanden)",
  "Schlüssel / Zugangskarten einziehen",
];

// =============================================
// Tabelle und Wortlaut
// =============================================

describe("SPERRPUNKT_HINWEISE", () => {
  it("nennt genau die zehn pauschalen Sperrpunkte aus dem Feinplan", () => {
    expect(Object.keys(SPERRPUNKT_HINWEISE)).toEqual(ERWARTETE_TITEL);
  });

  it("traegt den Wortlaut aus G25 – fuer jeden Punkt", () => {
    expect(SPERRPUNKT_HINWEIS).toBe(
      "Gemeint ist alles, was nicht als eigene Aufgabe unter „Ausstattung & Zugänge“ steht – " +
        "was das Portal als ausgegeben kennt, bekommt eine eigene Rücknahme- bzw. Sperraufgabe.",
    );
    for (const titel of ERWARTETE_TITEL) expect(SPERRPUNKT_HINWEISE[titel]).toBe(SPERRPUNKT_HINWEIS);
  });

  it("nennt die Kategorie, unter der die Ruecknahme- und Sperraufgaben stehen", () => {
    expect(SPERRPUNKT_HINWEIS).toContain(`„${AUSSTATTUNG_KATEGORIE}“`);
  });

  it("passt in das Hinweisfeld des Editors (sonst liesse sich der Punkt danach nicht mehr speichern)", () => {
    for (const hinweis of Object.values(SPERRPUNKT_HINWEISE)) {
      expect(hinweis.trim()).toBe(hinweis);
      expect(hinweis.length).toBeGreaterThan(0);
      expect(hinweis.length).toBeLessThanOrEqual(CHECKLISTEN_HINWEIS_MAX);
    }
  });

  it("laesst „IT-Abteilung über Austritt informieren“ (HR) unberuehrt", () => {
    expect(Object.keys(SPERRPUNKT_HINWEISE)).not.toContain("IT-Abteilung über Austritt informieren");
    expect(sperrpunktHinweis("Offboarding: Standard-Offboarding", { title: "IT-Abteilung über Austritt informieren" })).toBeNull();
  });

  it("ist eingefroren", () => {
    expect(Object.isFrozen(SPERRPUNKT_HINWEISE)).toBe(true);
    expect(Object.isFrozen(HINWEISE_JS)).toBe(true);
  });
});

// =============================================
// Paritaet TS ↔ JS
// =============================================

describe("JS-Kopie in prisma/seed-check.js", () => {
  it("hat dieselbe Tabelle in derselben Reihenfolge und denselben Wortlaut", () => {
    expect(HINWEIS_JS).toBe(SPERRPUNKT_HINWEIS);
    expect(Object.entries(HINWEISE_JS)).toEqual(Object.entries(SPERRPUNKT_HINWEISE));
  });

  const namen: (string | null | undefined)[] = [
    null,
    undefined,
    "",
    "   ",
    "Offboarding: Standard-Offboarding",
    "Offboarding: Bildungseinrichtung",
    "Offboarding: Beamte",
    "Offboarding: Minijob",
    "  Offboarding: eigene Vorlage",
    "Offboarding:",
    "offboarding: klein",
    "Offboarding ohne Doppelpunkt",
    "Standard-Einstellung (TV-L)",
    "Minijob-Einstellung",
    "Kopie von Offboarding: Standard-Offboarding",
  ];
  const titel: (string | null | undefined)[] = [
    ...ERWARTETE_TITEL,
    ...ERWARTETE_TITEL.map((t) => ` ${t}`),
    ...ERWARTETE_TITEL.map((t) => `${t} `),
    ...ERWARTETE_TITEL.map((t) => t.toUpperCase()),
    "Rückgabe aller Arbeitsmittel",
    "Weitere Arbeitsmittel zurueckgeben",
    "IT-Abteilung über Austritt informieren",
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "",
    null,
    undefined,
  ];
  const beschreibungen: (string | null | undefined)[] = [null, undefined, "", " ", "\n\t ", "Eigener Hinweis", SPERRPUNKT_HINWEIS];

  it("entscheidet fuer jede Kombination aus Vorlage, Titel und Beschreibung gleich", () => {
    const abweichungen: string[] = [];
    for (const name of namen) {
      for (const t of titel) {
        for (const d of beschreibungen) {
          const ts = sperrpunktHinweis(name, { title: t, description: d });
          const js = hinweisJs(name, { title: t, description: d });
          if (ts !== js) abweichungen.push(`${JSON.stringify(name)} / ${JSON.stringify(t)} / ${JSON.stringify(d)}`);
        }
      }
    }
    expect(abweichungen).toEqual([]);
  });

  it("erkennt Offboarding-Vorlagen wie istOffboardingVorlagenName", () => {
    for (const name of namen) {
      const erwartet = istOffboardingVorlagenName(name);
      const ts = sperrpunktHinweis(name, { title: ERWARTETE_TITEL[0], description: null }) !== null;
      const js = seedCheck.istOffboardingVorlagenNameJs(name);
      expect([name, ts]).toEqual([name, erwartet]);
      expect([name, js]).toEqual([name, erwartet]);
    }
  });
});

// =============================================
// Regel (rein)
// =============================================

describe("sperrpunktHinweis", () => {
  const OFF = "Offboarding: Standard-Offboarding";

  it("gibt den Hinweis fuer jeden Sperrpunkt einer Offboarding-Vorlage ohne Beschreibung", () => {
    for (const t of ERWARTETE_TITEL) {
      expect(sperrpunktHinweis(OFF, { title: t, description: null })).toBe(SPERRPUNKT_HINWEIS);
      expect(sperrpunktHinweis(OFF, { title: t })).toBe(SPERRPUNKT_HINWEIS);
    }
  });

  it("nur bei EXAKT gleichem Titel – ein von HR geaenderter Titel bleibt ohne Hinweis", () => {
    expect(sperrpunktHinweis(OFF, { title: "Rueckgabe aller Arbeitsmittel (inkl. Bücher)", description: null })).toBeNull();
    expect(sperrpunktHinweis(OFF, { title: "Rückgabe aller Arbeitsmittel", description: null })).toBeNull();
    expect(sperrpunktHinweis(OFF, { title: "rueckgabe aller arbeitsmittel", description: null })).toBeNull();
    expect(sperrpunktHinweis(OFF, { title: " Rueckgabe aller Arbeitsmittel", description: null })).toBeNull();
  });

  it("eine gepflegte Beschreibung bleibt; leer heisst null, \"\" oder nur Leerraum", () => {
    expect(sperrpunktHinweis(OFF, { title: ERWARTETE_TITEL[0], description: "Bücher zurück an die Bibliothek" })).toBeNull();
    for (const leer of [null, undefined, "", "  ", "\n"]) {
      expect(beschreibungLeer(leer)).toBe(true);
      expect(sperrpunktHinweis(OFF, { title: ERWARTETE_TITEL[0], description: leer })).toBe(SPERRPUNKT_HINWEIS);
    }
    expect(beschreibungLeer("x")).toBe(false);
  });

  it("nur in Offboarding-Vorlagen – derselbe Titel in einer Einstellungs-Vorlage bleibt", () => {
    expect(sperrpunktHinweis("Standard-Einstellung (TV-L)", { title: ERWARTETE_TITEL[0], description: null })).toBeNull();
    expect(sperrpunktHinweis(null, { title: ERWARTETE_TITEL[0], description: null })).toBeNull();
  });

  it("faellt nicht auf Eigenschaften des Objekt-Prototyps herein", () => {
    for (const t of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(sperrpunktHinweis(OFF, { title: t, description: null })).toBeNull();
    }
  });
});

describe("mitSperrpunktHinweisen (Seed)", () => {
  const punkte = [
    { title: "Kuendigungsbestaetigung erstellen", category: "Phase 1", orderIndex: 0 },
    { title: "Rueckgabe aller Arbeitsmittel", category: "Phase 4", orderIndex: 1 },
    { title: "IT-Zugaenge sperren (falls vorhanden)", category: "Phase 5", orderIndex: 2, description: "Eigener Text" },
    { title: "Schlüssel / Zugangskarten einziehen", category: "Phase 5", orderIndex: 3 },
  ];

  it("setzt den Hinweis an den Sperrpunkten und laesst alles andere gleich", () => {
    const ergebnis = mitSperrpunktHinweisen("Offboarding: Minijob", punkte);
    expect(ergebnis).toEqual([
      punkte[0],
      { ...punkte[1], description: SPERRPUNKT_HINWEIS },
      punkte[2],
      { ...punkte[3], description: SPERRPUNKT_HINWEIS },
    ]);
    // Titel bleiben
    expect(ergebnis.map((p) => p.title)).toEqual(punkte.map((p) => p.title));
    // unveraenderte Punkte sind dieselben Objekte
    expect(ergebnis[0]).toBe(punkte[0]);
    expect(ergebnis[2]).toBe(punkte[2]);
  });

  it("veraendert die Eingabe nicht", () => {
    const kopie = JSON.parse(JSON.stringify(punkte));
    mitSperrpunktHinweisen("Offboarding: Minijob", punkte);
    expect(punkte).toEqual(kopie);
  });

  it("aendert ausserhalb einer Offboarding-Vorlage nichts", () => {
    expect(mitSperrpunktHinweisen("Minijob-Einstellung", punkte)).toEqual(punkte);
  });
});

// =============================================
// Plan der Migration (rein)
// =============================================

describe("planeOffboardingSperrpunkte", () => {
  const vorlagen = [
    { id: "t-std", name: "Offboarding: Standard-Offboarding" },
    { id: "t-bild", name: "Offboarding: Bildungseinrichtung" },
    { id: "t-on", name: "Standard-Einstellung (TV-L)" },
  ];

  function punkt(id: string, templateId: string, title: string | null, description: string | null = null): Punkt {
    return { id, templateId, title, description };
  }

  it("setzt den Hinweis an Punkten mit leerer Beschreibung (null und \"\") – mit altem Wert als Rueckweg", () => {
    const plan = plane({
      vorlagen,
      vorlagenPunkte: [
        punkt("p1", "t-std", "Rueckgabe aller Arbeitsmittel"),
        punkt("p2", "t-bild", "IT-Zugaenge und E-Mail-Konto sperren", ""),
        punkt("p3", "t-bild", "Physische Zugaenge entziehen (Schlüssel, Karten)", "  "),
      ],
    });
    expect(plan.punkte).toEqual([
      { id: "p1", templateId: "t-std", title: "Rueckgabe aller Arbeitsmittel", von: null, nach: SPERRPUNKT_HINWEIS },
      { id: "p2", templateId: "t-bild", title: "IT-Zugaenge und E-Mail-Konto sperren", von: "", nach: SPERRPUNKT_HINWEIS },
      {
        id: "p3",
        templateId: "t-bild",
        title: "Physische Zugaenge entziehen (Schlüssel, Karten)",
        von: "  ",
        nach: SPERRPUNKT_HINWEIS,
      },
    ]);
    expect(plan.mitBeschreibung).toBe(0);
    expect(plan.andereVorlage).toBe(0);
  });

  it("ein geaenderter Titel bleibt (wird nicht einmal gezaehlt)", () => {
    const plan = plane({
      vorlagen,
      vorlagenPunkte: [
        punkt("p1", "t-std", "Rueckgabe aller Arbeitsmittel und Bücher"),
        punkt("p2", "t-std", "Rückgabe aller Arbeitsmittel"),
        punkt("p3", "t-std", null),
      ],
    });
    expect(plan).toEqual({ punkte: [], mitBeschreibung: 0, andereVorlage: 0 });
  });

  it("eine gepflegte Beschreibung bleibt und wird gezaehlt", () => {
    const plan = plane({
      vorlagen,
      vorlagenPunkte: [punkt("p1", "t-std", "IT-Zugaenge zur Sperrung vorbereiten", "Auch das Telefonkonto.")],
    });
    expect(plan.punkte).toEqual([]);
    expect(plan.mitBeschreibung).toBe(1);
  });

  it("gleicher Titel ausserhalb einer Offboarding-Vorlage (oder unbekannte Vorlage) bleibt und wird gezaehlt", () => {
    const plan = plane({
      vorlagen,
      vorlagenPunkte: [
        punkt("p1", "t-on", "Rueckgabe aller Arbeitsmittel"),
        punkt("p2", "t-weg", "Arbeitsmittel zurueckgeben"),
      ],
    });
    expect(plan.punkte).toEqual([]);
    expect(plan.andereVorlage).toBe(2);
  });

  it("„IT-Abteilung über Austritt informieren“ bleibt", () => {
    const plan = plane({ vorlagen, vorlagenPunkte: [punkt("p1", "t-std", "IT-Abteilung über Austritt informieren")] });
    expect(plan).toEqual({ punkte: [], mitBeschreibung: 0, andereVorlage: 0 });
  });

  it("ein zweiter Lauf auf dem Ergebnis plant nichts mehr (von Bauart idempotent)", () => {
    const vorher = [
      punkt("p1", "t-std", "Rueckgabe aller Arbeitsmittel"),
      punkt("p2", "t-std", "IT-Zugaenge und E-Mail-Konto sperren", ""),
      punkt("p3", "t-std", "Kuendigungsbestaetigung erstellen"),
    ];
    const erster = plane({ vorlagen, vorlagenPunkte: vorher });
    expect(erster.punkte).toHaveLength(2);
    const nachher = vorher.map((p) => {
      const geplant = erster.punkte.find((g) => g.id === p.id);
      return geplant ? { ...p, description: geplant.nach } : p;
    });
    const zweiter = plane({ vorlagen, vorlagenPunkte: nachher });
    expect(zweiter.punkte).toEqual([]);
  });

  it("kommt mit leerer Eingabe aus (frische Datenbank)", () => {
    expect(plane({ vorlagen: [], vorlagenPunkte: [] })).toEqual({ punkte: [], mitBeschreibung: 0, andereVorlage: 0 });
  });
});

// =============================================
// Ablauf der Migration (Prisma-Ersatz)
// =============================================

describe("migriereOffboardingSperrpunkte", () => {
  function prismaErsatz(
    opts: { erledigt?: boolean; vorlagen?: { id: string; name: string }[]; punkte?: Punkt[] } = {},
  ) {
    const markerOp = { op: "marker" };
    const vorlagen = opts.vorlagen ?? [
      { id: "t-std", name: "Offboarding: Standard-Offboarding" },
      { id: "t-on", name: "Standard-Einstellung (TV-L)" },
    ];
    const punkte = opts.punkte ?? [
      { id: "p1", templateId: "t-std", title: "Rueckgabe aller Arbeitsmittel", description: null },
      { id: "p2", templateId: "t-std", title: "IT-Zugaenge und E-Mail-Konto sperren", description: "" },
      { id: "p3", templateId: "t-std", title: "Physische Zugaenge entziehen (Schlüssel, Karten)", description: "Gepflegt" },
      { id: "p4", templateId: "t-on", title: "Rueckgabe aller Arbeitsmittel", description: null },
    ];
    return {
      markerOp,
      systemMigration: {
        findUnique: jest.fn().mockResolvedValue(opts.erledigt ? { id: "m1" } : null),
        create: jest.fn().mockReturnValue(markerOp),
      },
      checklistTemplate: { findMany: jest.fn().mockResolvedValue(vorlagen) },
      checklistTemplateItem: {
        findMany: jest.fn().mockResolvedValue(punkte),
        updateMany: jest.fn((args: unknown) => ({ op: "updateMany", args })),
      },
      $transaction: jest.fn(async (ops: unknown[]) => ops.map((op) => (op === markerOp ? {} : { count: 1 }))),
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
    expect(MARKER).toBe("OFFBOARDING_SPERRPUNKTE_V1");
  });

  it("liest nur Kandidaten mit einem der zehn Titel", async () => {
    const p = prismaErsatz();
    await migriere(p);
    expect(p.checklistTemplateItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { title: { in: ERWARTETE_TITEL } },
        select: { id: true, templateId: true, title: true, description: true },
      }),
    );
  });

  it("schreibt nur `description`, bedingt auf Titel und gelesene Beschreibung, und den Merker in EINER Transaktion", async () => {
    const p = prismaErsatz();

    await migriere(p);

    expect(p.systemMigration.findUnique).toHaveBeenCalledWith({ where: { name: MARKER }, select: { id: true } });
    expect(p.checklistTemplateItem.updateMany.mock.calls).toEqual([
      [
        {
          where: { id: "p1", title: "Rueckgabe aller Arbeitsmittel", description: null },
          data: { description: SPERRPUNKT_HINWEIS },
        },
      ],
      [
        {
          where: { id: "p2", title: "IT-Zugaenge und E-Mail-Konto sperren", description: "" },
          data: { description: SPERRPUNKT_HINWEIS },
        },
      ],
    ]);
    expect(p.systemMigration.create).toHaveBeenCalledWith({
      data: {
        name: MARKER,
        details: {
          geprueft: { vorlagen: 2, kandidaten: 4 },
          punkte: [
            { id: "p1", templateId: "t-std", title: "Rueckgabe aller Arbeitsmittel", von: null },
            { id: "p2", templateId: "t-std", title: "IT-Zugaenge und E-Mail-Konto sperren", von: "" },
          ],
          mitBeschreibung: 1,
          andereVorlage: 1,
        },
      },
    });
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    const ops = p.$transaction.mock.calls[0][0] as unknown[];
    expect(ops).toHaveLength(3);
    expect(ops[ops.length - 1]).toBe(p.markerOp);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("2 Vorlagenpunkte mit Hinweis versehen"));
    expect(fehler).not.toHaveBeenCalled();
  });

  it("fasst nur Vorlagenpunkte an – laufende Vorgaenge behalten ihre Kopie", async () => {
    const p = prismaErsatz();
    await migriere(p);
    // Der Ersatz kennt weder offboardingChecklistItem noch checklistItem; ein
    // Zugriff darauf wuerde werfen und als Fehler geloggt.
    expect(fehler).not.toHaveBeenCalled();
    for (const [args] of p.checklistTemplateItem.updateMany.mock.calls as [{ data: Record<string, unknown> }][]) {
      expect(Object.keys(args.data)).toEqual(["description"]);
    }
  });

  it("setzt den Merker auch auf einer frischen Datenbank (nichts zu tun)", async () => {
    const p = prismaErsatz({ vorlagen: [], punkte: [] });
    await migriere(p);
    expect(p.checklistTemplateItem.updateMany).not.toHaveBeenCalled();
    expect(p.$transaction).toHaveBeenCalledWith([p.markerOp]);
    expect(p.systemMigration.create).toHaveBeenCalledWith({
      data: {
        name: MARKER,
        details: { geprueft: { vorlagen: 0, kandidaten: 0 }, punkte: [], mitBeschreibung: 0, andereVorlage: 0 },
      },
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("0 Vorlagenpunkte mit Hinweis versehen"));
  });

  it("zaehlt im Protokoll, was die Updates wirklich trafen", async () => {
    const p = prismaErsatz();
    p.$transaction.mockImplementation(async (ops: unknown[]) =>
      ops.map((op, i) => (op === p.markerOp ? {} : { count: i === 0 ? 1 : 0 })),
    );
    await migriere(p);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("1 Vorlagenpunkte mit Hinweis versehen"));
  });

  it("laeuft kein zweites Mal, wenn der Merker steht", async () => {
    const p = prismaErsatz({ erledigt: true });

    await migriere(p);

    expect(p.checklistTemplate.findMany).not.toHaveBeenCalled();
    expect(p.checklistTemplateItem.findMany).not.toHaveBeenCalled();
    expect(p.checklistTemplateItem.updateMany).not.toHaveBeenCalled();
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("loggt einen Fehler und bricht den Start nicht ab – ohne Merker laeuft sie beim naechsten Start erneut", async () => {
    const p = prismaErsatz();
    p.$transaction.mockRejectedValue(new Error("Verbindung weg"));

    await expect(migriere(p)).resolves.toBeUndefined();

    expect(fehler).toHaveBeenCalledWith(expect.stringContaining(MARKER), "Verbindung weg");
  });
});

// =============================================
// Einbindung: main() und prisma/seed.ts
// =============================================

describe("Einbindung", () => {
  it("main() ruft die Migration vor dem Seed auf", () => {
    const start = SEED_CHECK_JS.indexOf("async function main()");
    expect(start).toBeGreaterThan(-1);
    const rumpf = SEED_CHECK_JS.slice(start);
    const aufruf = rumpf.indexOf("await migriereOffboardingSperrpunkte(prisma);");
    const seed = rumpf.indexOf('require("./seed.js")');
    expect(aufruf).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(-1);
    expect(aufruf).toBeLessThan(seed);
  });

  it("prisma/seed.ts kennt jeden der zehn Titel als Punkt einer Offboarding-Liste", () => {
    const offboardingTeil = SEED_TS.slice(SEED_TS.indexOf("const offboardingStandardItems"), SEED_TS.indexOf("const offboardingChecklisten"));
    expect(offboardingTeil.length).toBeGreaterThan(0);
    for (const t of ERWARTETE_TITEL) {
      expect([t, offboardingTeil.includes(`title: "${t}"`)]).toEqual([t, true]);
    }
  });

  it("prisma/seed.ts legt die Offboarding-Vorlagen mit Hinweis an", () => {
    expect(SEED_TS).toContain('import { mitSperrpunktHinweisen } from "../src/lib/offboarding-sperrpunkte";');
    expect(SEED_TS).toMatch(
      /for \(const \{ vorlage, punkte \} of offboardingChecklisten\) \{\s*if \(await checklisteAnlegen\(vorlage, mitSperrpunktHinweisen\(vorlage\.name, punkte\)\)\)/,
    );
  });

  it("alle vier Offboarding-Vorlagen des Seeds sind Offboarding-Vorlagen im Sinne der Regel", () => {
    const namen = [...SEED_TS.matchAll(/name: "(Offboarding:[^"]*)"/g)].map((m) => m[1]);
    expect(namen).toEqual([
      "Offboarding: Standard-Offboarding",
      "Offboarding: Bildungseinrichtung",
      "Offboarding: Beamte",
      "Offboarding: Minijob",
    ]);
    for (const n of namen) expect(istOffboardingVorlagenName(n)).toBe(true);
  });
});
