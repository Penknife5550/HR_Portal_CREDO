/**
 * Tests: Migration ONBOARDING_ABTEILUNGSAUFGABEN_V1 (prisma/seed-check.js)
 *
 * seed-check.js laeuft im Container als reines JS (kein tsx) und traegt deshalb
 * eine KOPIE von `abteilungAusZustaendigkeit` und `istOffboardingVorlagenName`.
 * Dieser Test haelt beide Fassungen zusammen — liefen sie auseinander, stellte
 * die Migration Zustaendigkeiten anders um, als Anlage, Karte und Editor sie
 * danach lesen.
 *
 * Die Migration selbst ist nach einem Lauf nicht mehr korrigierbar (der Merker
 * verhindert den zweiten). Belegt werden deshalb ihre Regeln ohne Datenbank:
 * welche Vorlagen sie anfasst, wie sie Aufgaben gruppiert, woher die
 * Tagesangabe kommt und was unbekannt bleibt.
 */

import { abteilungAusZustaendigkeit, istOffboardingVorlagenName } from "@/lib/abteilungsaufgaben";
import { DEPARTMENT_KEYS, DEPARTMENT_LABELS } from "@/lib/constants";

// Dank des `require.main === module`-Guards laedt seed-check.js, ohne dass der
// Entrypoint startet (Muster wie in parallele-spuren-migration.test.ts).
const seedCheck = require("../../../prisma/seed-check.js");

// =============================================
// Paritaet TS ↔ JS
// =============================================

/** Alles, was in Vorlagen und Aufgaben vorkommen kann — plus Randfaelle. */
function eingaben(): (string | null | undefined)[] {
  return [
    null,
    undefined,
    "",
    "   ",
    ...Object.values(DEPARTMENT_KEYS),
    ...Object.values(DEPARTMENT_LABELS),
    "HR",
    "hr",
    "Hr",
    "Personal",
    "Personalabteilung",
    "Personalbüro",
    "IT",
    "it",
    " IT ",
    "IT-Abteilung",
    "IT Support",
    "EDV",
    "EDV-Abteilung",
    "Verwaltung",
    "verwaltung",
    "Verw.",
    "Sekretariat",
    "Schulsekretariat",
    "Verwaltung / Sekretariat",
    "Vorgesetzter",
    "Vorgesetzte",
    "Vorgesetzte(r)",
    "Führungskraft",
    "Fuehrungskraft",
    "FÜHRUNGSKRAFT",
    "Leitung",
    "Schulleitung",
    "Kita-Leitung",
    "Einrichtungsleitung",
    "Facility",
    "Facility Management",
    "Hausmeister",
    "Haustechnik",
    "Buchhaltung",
    "Finanzbuchhaltung",
    "Datenschutz",
    "Datenschutzbeauftragter",
    "Datenschutzbeauftragte/r",
    "DSB",
    "dsb",
    "Mitarbeiter",
    "Mitarbeiter/in",
    "Mitarbeitende",
    "Beschäftigte",
    "EMPFANG",
    "EMPFANG_2",
    "X",
    "2IT",
    "Kantine",
    "Team Nord",
    "IT/Verwaltung",
    "Hausmeisterei",
    "Personal & Recht",
  ];
}

describe("JS-Kopie in seed-check.js", () => {
  it("bildet jede Zustaendigkeit genau wie abteilungAusZustaendigkeit ab", () => {
    for (const eingabe of eingaben()) {
      expect([eingabe, seedCheck.abteilungAusZustaendigkeitJs(eingabe)]).toEqual([
        eingabe,
        abteilungAusZustaendigkeit(eingabe),
      ]);
    }
  });

  it("erkennt Offboarding-Vorlagen wie istOffboardingVorlagenName", () => {
    for (const name of ["Offboarding: Standard-Offboarding", " Offboarding:X", "Standard-Einstellung (TV-L)", "", null]) {
      expect(seedCheck.istOffboardingVorlagenNameJs(name)).toBe(istOffboardingVorlagenName(name));
    }
  });
});

// =============================================
// Planung
// =============================================

const VORLAGEN = [
  { id: "t-on", name: "Standard-Einstellung (TV-L)" },
  { id: "t-mini", name: "Minijob-Einstellung" },
  { id: "t-off", name: "Offboarding: Standard-Offboarding" },
];

function plan(teile: {
  vorlagenPunkte?: Record<string, unknown>[];
  aufgaben?: Record<string, unknown>[];
}) {
  return seedCheck.planeOnboardingAbteilungsaufgaben({
    vorlagen: VORLAGEN,
    vorlagenPunkte: teile.vorlagenPunkte ?? [],
    aufgaben: teile.aufgaben ?? [],
  });
}

describe("planeOnboardingAbteilungsaufgaben", () => {
  it("stellt nur Onboarding-Vorlagen um; Offboarding und schon gesetzte Schluessel bleiben", () => {
    const p = plan({
      vorlagenPunkte: [
        { id: "p1", templateId: "t-on", title: "Schlüssel", defaultAssignee: "Verwaltung", defaultDueDays: -3 },
        { id: "p2", templateId: "t-on", title: "Konto", defaultAssignee: "IT", defaultDueDays: -7 },
        { id: "p3", templateId: "t-mini", title: "Vertrag", defaultAssignee: "Vorgesetzter", defaultDueDays: null },
        { id: "p4", templateId: "t-off", title: "Sperren", defaultAssignee: "IT", defaultDueDays: 0 },
        { id: "p5", templateId: "t-on", title: "Leer", defaultAssignee: null, defaultDueDays: null },
      ],
    });
    expect(p.punkte).toEqual([
      { id: "p1", von: "Verwaltung", nach: "VERWALTUNG" },
      { id: "p3", von: "Vorgesetzter", nach: "VORGESETZTER" },
    ]);
  });

  it("gruppiert die Aufgaben je Alttext und laesst Unbekanntes stehen", () => {
    const p = plan({
      vorlagenPunkte: [{ id: "p1", templateId: "t-on", title: "Schlüssel", defaultAssignee: "Werkstatt Nord", defaultDueDays: 0 }],
      aufgaben: [
        { id: "a1", assignee: "Verwaltung", relativeDueDays: 1 },
        { id: "a2", assignee: "Verwaltung", relativeDueDays: 1 },
        { id: "a3", assignee: "IT", relativeDueDays: 1 },
        { id: "a4", assignee: "Kantine", relativeDueDays: 1 },
        { id: "a5", assignee: null, relativeDueDays: 1 },
      ],
    });
    expect(p.zuordnungen).toEqual([{ von: "Verwaltung", nach: "VERWALTUNG", anzahl: 2 }]);
    expect(p.unbekannt).toEqual([
      { text: "Kantine", vorlagenPunkte: 0, aufgaben: 1 },
      { text: "Werkstatt Nord", vorlagenPunkte: 1, aufgaben: 0 },
    ]);
  });

  it("Tagesangabe ueber templateItemId, sonst ueber Titel derselben Vorlage, sonst gar nicht", () => {
    const p = plan({
      vorlagenPunkte: [
        { id: "p1", templateId: "t-on", title: "Konto anlegen", defaultAssignee: "IT", defaultDueDays: -7 },
        { id: "p2", templateId: "t-on", title: "Ohne Tage", defaultAssignee: "IT", defaultDueDays: null },
        { id: "p3", templateId: "t-mini", title: "Konto anlegen", defaultAssignee: "IT", defaultDueDays: 3 },
      ],
      aufgaben: [
        { id: "a1", templateItemId: "p1", title: "Konto anlegen", assignee: "IT", relativeDueDays: null, checklistTemplateId: "t-on" },
        // templateItemId zeigt ins Leere (Editor legte Punkte neu an) → Titel in derselben Vorlage
        { id: "a2", templateItemId: "weg", title: "Konto anlegen", assignee: "IT", relativeDueDays: null, checklistTemplateId: "t-on" },
        // andere Vorlage → deren Wert
        { id: "a3", templateItemId: null, title: "Konto anlegen", assignee: "IT", relativeDueDays: null, checklistTemplateId: "t-mini" },
        // Titel gibt es nicht mehr → ohne Faelligkeit
        { id: "a4", templateItemId: "weg", title: "Gibt es nicht", assignee: "IT", relativeDueDays: null, checklistTemplateId: "t-on" },
        // Vorlagenpunkt ohne Tagesangabe → ohne Faelligkeit
        { id: "a5", templateItemId: "p2", title: "Ohne Tage", assignee: "IT", relativeDueDays: null, checklistTemplateId: "t-on" },
        // schon gesetzt → bleibt
        { id: "a6", templateItemId: "p1", title: "Konto anlegen", assignee: "IT", relativeDueDays: 0, checklistTemplateId: "t-on" },
      ],
    });
    expect(p.faelligkeiten).toEqual([
      { tage: -7, ids: ["a1", "a2"] },
      { tage: 3, ids: ["a3"] },
    ]);
    // a2 (Punkt-ID zeigt ins Leere) und a3 (ohne Punkt-ID) kamen ueber den Titel.
    expect(p.ueberTitel).toBe(2);
  });

  it("ist idempotent: nach einem Lauf plant sie nichts mehr", () => {
    const vorlagenPunkte = [{ id: "p1", templateId: "t-on", title: "Konto", defaultAssignee: "VERWALTUNG", defaultDueDays: -3 }];
    const aufgaben = [{ id: "a1", templateItemId: "p1", title: "Konto", assignee: "VERWALTUNG", relativeDueDays: -3, checklistTemplateId: "t-on" }];
    const p = plan({ vorlagenPunkte, aufgaben });
    expect(p).toMatchObject({ punkte: [], zuordnungen: [], faelligkeiten: [], unbekannt: [] });
  });
});
