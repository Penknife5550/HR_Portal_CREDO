/**
 * Zeitplaner — reine Regeln: Faelligkeit (deutsche Zeit, Sommerzeit,
 * Werktage), naechster Lauf, Einschalten, Waechter, Katalog, Auswertung und
 * Payload der Berichtsmail.
 */

import fs from "fs";
import path from "path";
import {
  berlinerZeit,
  laufAusgeblieben,
  laufFaellig,
  naechsterLauf,
  tagErledigtNachAenderung,
  uhrzeitGueltig,
  uhrzeitMinuten,
  type ZeitplanStand,
} from "@/lib/zeitplaner/faelligkeit";
import { LAEUFE, istLaufSchluessel, laufDefinition } from "@/lib/zeitplaner/katalog";
import { berichtNoetig, berichtPayload, gruppieren, laufAuswerten, tabelleHtml } from "@/lib/zeitplaner/bericht";
import { EVENT_CATALOG, getEventDefinition } from "@/lib/events";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { zeitplanerSollLaufen } from "@/lib/zeitplaner/uhr";

/** 30.09.2026 (Mittwoch), Sommerzeit: UTC+2. */
const MI_0759 = new Date("2026-09-30T05:59:00Z");
const MI_0800 = new Date("2026-09-30T06:00:00Z");
const MI_1500 = new Date("2026-09-30T13:00:00Z");

const stand = (teil: Partial<ZeitplanStand> = {}): ZeitplanStand => ({
  aktiv: true,
  uhrzeit: "08:00",
  nurWerktags: false,
  tagErledigt: "2026-09-29",
  ...teil,
});

describe("Uhrzeit und deutsche Zeit", () => {
  it("prueft das Format HH:MM", () => {
    expect(uhrzeitGueltig("08:00")).toBe(true);
    expect(uhrzeitGueltig("23:59")).toBe(true);
    expect(uhrzeitGueltig("24:00")).toBe(false);
    expect(uhrzeitGueltig("8:00")).toBe(false);
    expect(uhrzeitGueltig("08:60")).toBe(false);
    expect(uhrzeitMinuten("08:15")).toBe(495);
    expect(uhrzeitMinuten("x")).toBeNull();
  });

  it("rechnet im Sommer mit UTC+2 und im Winter mit UTC+1", () => {
    expect(berlinerZeit(MI_0800)).toEqual({ tag: "2026-09-30", minuten: 480, uhrzeit: "08:00" });
    expect(berlinerZeit(new Date("2026-12-01T07:00:00Z"))).toEqual({ tag: "2026-12-01", minuten: 480, uhrzeit: "08:00" });
  });

  it("kurz nach Mitternacht in Deutschland ist in UTC noch der Vortag", () => {
    expect(berlinerZeit(new Date("2026-09-29T22:30:00Z")).tag).toBe("2026-09-30");
  });
});

describe("laufFaellig", () => {
  it("faellig ab der Uhrzeit, wenn heute noch nicht erledigt", () => {
    expect(laufFaellig(stand(), MI_0759)).toBe(false);
    expect(laufFaellig(stand(), MI_0800)).toBe(true);
    expect(laufFaellig(stand(), MI_1500)).toBe(true); // Nachholen am selben Tag
  });

  it("nicht, wenn aus oder heute schon erledigt", () => {
    expect(laufFaellig(stand({ aktiv: false }), MI_0800)).toBe(false);
    expect(laufFaellig(stand({ tagErledigt: "2026-09-30" }), MI_1500)).toBe(false);
  });

  it("nie gelaufen (tagErledigt null) zaehlt als offen", () => {
    expect(laufFaellig(stand({ tagErledigt: null }), MI_0800)).toBe(true);
  });

  it("nur werktags: Samstag und Sonntag nicht", () => {
    const sa = new Date("2026-10-03T06:00:00Z");
    const so = new Date("2026-10-04T06:00:00Z");
    const mo = new Date("2026-10-05T06:00:00Z");
    expect(laufFaellig(stand({ nurWerktags: true, tagErledigt: "2026-10-02" }), sa)).toBe(false);
    expect(laufFaellig(stand({ nurWerktags: true, tagErledigt: "2026-10-02" }), so)).toBe(false);
    expect(laufFaellig(stand({ nurWerktags: true, tagErledigt: "2026-10-02" }), mo)).toBe(true);
  });

  it("Sommerzeit-Beginn: 02:30 gibt es am 29.03.2026 nicht — der Lauf kommt um 03:00", () => {
    const s = stand({ uhrzeit: "02:30", tagErledigt: "2026-03-28" });
    expect(laufFaellig(s, new Date("2026-03-29T00:59:00Z"))).toBe(false); // 01:59 MEZ
    expect(laufFaellig(s, new Date("2026-03-29T01:00:00Z"))).toBe(true); // 03:00 MESZ
  });

  it("Sommerzeit-Ende: die doppelte 02:30 am 25.10.2026 laeuft nur einmal", () => {
    const erste = new Date("2026-10-25T00:30:00Z"); // 02:30 MESZ
    const zweite = new Date("2026-10-25T01:30:00Z"); // 02:30 MEZ
    expect(laufFaellig(stand({ uhrzeit: "02:30", tagErledigt: "2026-10-24" }), erste)).toBe(true);
    // Nach dem ersten Lauf ist der Tag erledigt.
    expect(laufFaellig(stand({ uhrzeit: "02:30", tagErledigt: "2026-10-25" }), zweite)).toBe(false);
  });
});

describe("naechsterLauf", () => {
  it("heute, solange offen; sonst morgen; aus = null", () => {
    expect(naechsterLauf(stand(), MI_0759)).toEqual({ tag: "2026-09-30", uhrzeit: "08:00" });
    expect(naechsterLauf(stand({ tagErledigt: "2026-09-30" }), MI_1500)).toEqual({ tag: "2026-10-01", uhrzeit: "08:00" });
    expect(naechsterLauf(stand({ aktiv: false }), MI_1500)).toBeNull();
  });

  it("nur werktags: nach Freitag kommt Montag", () => {
    const fr = new Date("2026-10-02T13:00:00Z");
    expect(naechsterLauf(stand({ nurWerktags: true, tagErledigt: "2026-10-02" }), fr)).toEqual({
      tag: "2026-10-05",
      uhrzeit: "08:00",
    });
  });
});

describe("tagErledigtNachAenderung (Einschalten, Uhrzeit verschieben)", () => {
  it("Uhrzeit heute schon vorbei → erster Lauf morgen, nicht eine Minute nach dem Speichern", () => {
    expect(tagErledigtNachAenderung({ uhrzeit: "08:00", tagErledigt: null }, MI_1500)).toBe("2026-09-30");
  });

  it("Uhrzeit liegt noch vor uns → heute, und gestern gilt als erledigt (kein Fehlalarm)", () => {
    expect(tagErledigtNachAenderung({ uhrzeit: "08:00", tagErledigt: null }, MI_0759)).toBe("2026-09-29");
  });

  it("heute schon gelaufen, Uhrzeit spaeter gelegt → heute nicht noch einmal", () => {
    expect(tagErledigtNachAenderung({ uhrzeit: "16:00", tagErledigt: "2026-09-30" }, MI_1500)).toBe("2026-09-30");
  });
});

describe("laufAusgeblieben (Waechter)", () => {
  it("meldet nichts vor Uhrzeit plus Karenz", () => {
    expect(laufAusgeblieben(stand(), new Date("2026-09-30T06:30:00Z"))).toBe(false);
  });

  it("meldet, wenn der heutige Termin eine Stunde vorbei und nicht erledigt ist", () => {
    expect(laufAusgeblieben(stand(), new Date("2026-09-30T07:01:00Z"))).toBe(true);
    expect(laufAusgeblieben(stand({ tagErledigt: "2026-09-30" }), new Date("2026-09-30T07:01:00Z"))).toBe(false);
  });

  it("meldet einen ausgefallenen Vortag (Zeitplaner steht)", () => {
    expect(laufAusgeblieben(stand({ tagErledigt: "2026-09-28" }), MI_0759)).toBe(true);
  });

  it("nur werktags: am Montagmorgen zaehlt Freitag, nicht Sonntag", () => {
    const mo = new Date("2026-10-05T05:00:00Z"); // 07:00
    expect(laufAusgeblieben(stand({ nurWerktags: true, tagErledigt: "2026-10-02" }), mo)).toBe(false);
  });

  it("aus = nie ausgeblieben", () => {
    expect(laufAusgeblieben(stand({ aktiv: false, tagErledigt: null }), MI_1500)).toBe(false);
  });
});

describe("Katalog", () => {
  it("eindeutige Schluessel, gueltige Standardzeiten", () => {
    const schluessel = LAEUFE.map((l) => l.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    for (const l of LAEUFE) expect(uhrzeitGueltig(l.standardUhrzeit)).toBe(true);
    expect(istLaufSchluessel("reminders")).toBe(true);
    expect(istLaufSchluessel("gibt-es-nicht")).toBe(false);
    expect(laufDefinition("wartung")?.name).toBe("Wartung");
  });

  it("jede genannte Vorlage steht im Event-Katalog", () => {
    for (const l of LAEUFE) {
      for (const event of l.vorlagen) {
        expect({ lauf: l.schluessel, event, bekannt: !!getEventDefinition(event) }).toEqual({
          lauf: l.schluessel,
          event,
          bekannt: true,
        });
      }
    }
  });

  it("jede genannte Route gibt es als Datei", () => {
    for (const l of LAEUFE) {
      if (!l.route) continue;
      const datei = path.join(process.cwd(), "src/app", l.route, "route.ts");
      expect({ route: l.route, vorhanden: fs.existsSync(datei) }).toEqual({ route: l.route, vorhanden: true });
    }
  });

  it("jeder Loeschlauf kann einen Probelauf (sonst liesse er sich nie scharf schalten)", () => {
    for (const l of LAEUFE.filter((x) => x.loescht)) expect(l.kannProbelauf).toBe(true);
  });

  it("AUSFUEHRER in ausfuehren.ts nennt genau die Schluessel des Katalogs", () => {
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/zeitplaner/ausfuehren.ts"), "utf8");
    const block = quelle.slice(quelle.indexOf("export const AUSFUEHRER"), quelle.indexOf("};", quelle.indexOf("export const AUSFUEHRER")));
    const genannt = [...block.matchAll(/^\s+"?([a-z-]+)"?:/gm)].map((m) => m[1]).sort();
    expect(genannt).toEqual(LAEUFE.map((l) => l.schluessel).sort());
  });
});

describe("Event „automatischer-lauf-bericht“ und „bem-frist-erinnerung“", () => {
  it("stehen im Katalog und haben eine Standardvorlage", () => {
    for (const event of ["automatischer-lauf-bericht", "bem-frist-erinnerung"]) {
      expect(EVENT_CATALOG.find((d) => d.event === event)?.wired).toBe(true);
      expect(DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)).toBeDefined();
    }
  });

  it("der Bericht geht standardmaessig an das HR-Postfach", () => {
    expect(getEventDefinition("automatischer-lauf-bericht")?.defaultRecipients.to).toBe("{{hr_postfach}}");
  });

  it("die BEM-Vorlage nennt die Fristen nicht im Betreff", () => {
    const def = getEventDefinition("bem-frist-erinnerung")!;
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "bem-frist-erinnerung")!;
    for (const variable of def.betreffOhne ?? []) expect(vorlage.subject).not.toContain(`{{${variable}}}`);
    expect(vorlage.bodyText).toContain("keine Gesundheitsdaten");
  });
});

describe("Auswertung", () => {
  it("gruppiert gleiche Schritte", () => {
    expect(gruppieren(["b", "a", "b"])).toEqual(["1 × a", "2 × b"]);
  });

  it("5xx und fehlender Koerper = FEHLER, 409 = PROBLEME", () => {
    expect(laufAuswerten("reminders", 500, { error: "x" }, false).ergebnis).toBe("FEHLER");
    expect(laufAuswerten("reminders", 200, null, false).ergebnis).toBe("FEHLER");
    expect(laufAuswerten("unterlagen-fristen", 409, { error: "läuft" }, false).ergebnis).toBe("PROBLEME");
  });

  it("Onboarding-Erinnerungen: nicht Zugestelltes ist ein Problem, Schritte ohne Namen und Adressen", () => {
    const a = laufAuswerten(
      "reminders",
      200,
      {
        employeeReminders: 2,
        supervisorReminders: 1,
        notSent: 1,
        errors: 0,
        departmentReminders: {
          remindersProcessed: 1,
          errors: 0,
          details: [
            {
              displayId: "ONB-2026-GYM-001",
              departmentName: "IT",
              email: "it@example.org",
              level: "WARNING",
              status: "SENT",
            },
          ],
          uebersprungen: [{ displayId: "ONB-2026-GYM-002", departmentKey: "IT", grund: "KEINE_ADRESSE", detail: "x" }],
        },
      },
      false,
    );
    expect(a.ergebnis).toBe("PROBLEME");
    expect(a.versendet).toBe(4);
    const alles = JSON.stringify(a);
    expect(alles).not.toContain("ONB-2026");
    expect(alles).not.toContain("example.org");
    expect(a.schritte).toEqual(["1 × Abteilung · Warnung · versendet", "1 × Abteilung übersprungen · KEINE_ADRESSE"]);
  });

  it("Unterlagen-Fristen: Probleme aus Zaehlern, Schritte mit deutschen Texten", () => {
    const a = laufAuswerten(
      "unterlagen-fristen",
      200,
      {
        erinnerungen: { vorab: 1, fristtag: 0 },
        hrMeldungen: { vollstaendigNachgeholt: 0, fristVerstrichen: 0 },
        nachgeholt: 0,
        nichtZugestellt: 0,
        mailUebersprungen: 0,
        uebersprungen: 0,
        zurueckgezogen: 0,
        aufgeraeumt: { dateien: 2, entwuerfe: 0, waisen: 0, fehler: 0 },
        errors: 0,
        total: 1,
        details: [{ nachforderungId: "n1", modul: "ONBOARDING", schritt: "ERINNERUNG", anlass: "VORAB", status: "SENT" }],
      },
      false,
    );
    expect(a.ergebnis).toBe("OK");
    expect(a.schritte).toEqual(["1 × Erinnerung an die Person · 7 Tage vorher · versendet"]);
  });

  it("BEM-Aufbewahrung im Probelauf zeigt, was geloescht wuerde", () => {
    const a = laufAuswerten(
      "bem-aufbewahrung",
      200,
      { dryRun: true, data: { faelligGeprueft: 3, wuerdeLoeschen: 3, wuerdeDateienLoeschen: 7 } },
      true,
    );
    expect(a.zaehler).toContainEqual(["Würde löschen: Fälle / Dateien", "3 / 7"]);
  });

  it("Verbeamtung: nicht zugestellte Sammelmail ist ein Problem", () => {
    const a = laufAuswerten("civil-service-deadlines", 200, { warnings: [{ severity: "URGENT" }], processed: 4, mailStatus: "SKIPPED" }, false);
    expect(a.ergebnis).toBe("PROBLEME");
  });

  it("fehlende Felder in der Antwort werden laut statt still 0 (Problem + Feldnamen)", () => {
    // Etwa wenn jemand `errors` in einem Lauf umbenennt.
    const a = laufAuswerten("offboarding-reminders", 200, { remindersProcessed: 2, details: [], uebersprungen: [] }, false);
    expect(a.ergebnis).toBe("PROBLEME");
    expect(a.zaehler).toContainEqual(["Antwort unvollständig – es fehlen", "errors", true]);
    expect(a.hinweis).toMatch(/nicht die erwartete Form/);
  });

  it("verschachtelte Felder werden mit Pfad genannt", () => {
    const a = laufAuswerten("elternzeit-fristen", 200, { data: { vorgaengeGeprueft: 1 } }, false);
    expect(a.zaehler.at(-1)?.[1]).toContain("data.offeneFristen");
  });

  it("Probelauf der Loeschlaeufe verlangt kein `fehler`", () => {
    expect(laufAuswerten("dokumente-aufbewahrung", 200, { dryRun: true, wuerdeLoeschen: 4, individuelleMails: { wuerdeLeeren: 1 } }, true).ergebnis).toBe("OK");
  });

  it("berichtNoetig: Probleme, Fehler, Probelauf — Erfolg nur mit Schalter und Versand", () => {
    const ok = { ergebnis: "OK" as const, zaehler: [], schritte: [], hinweis: null, versendet: 2 };
    expect(berichtNoetig(ok, { probelauf: false, berichtBeiErfolg: false })).toBe(false);
    expect(berichtNoetig(ok, { probelauf: true, berichtBeiErfolg: false })).toBe(true);
    expect(berichtNoetig(ok, { probelauf: false, berichtBeiErfolg: true })).toBe(true);
    expect(berichtNoetig({ ...ok, versendet: 0 }, { probelauf: false, berichtBeiErfolg: true })).toBe(false);
    expect(berichtNoetig({ ...ok, ergebnis: "PROBLEME" }, { probelauf: false, berichtBeiErfolg: false })).toBe(true);
    expect(berichtNoetig({ ...ok, ergebnis: "FEHLER" }, { probelauf: false, berichtBeiErfolg: false })).toBe(true);
  });
});

describe("Payload der Berichtsmail", () => {
  const def = laufDefinition("dokument-ablauf")!;
  const payload = berichtPayload({
    definition: def,
    auswertung: {
      ergebnis: "PROBLEME",
      zaehler: [["Nicht <zugestellt>", 1, true]],
      schritte: [],
      hinweis: "Bitte prüfen.",
      versendet: 0,
    },
    probelauf: false,
    ausloeser: "ZEITPLAN",
    datum: "30.09.2026",
    uhrzeit: "07:30",
    portalLink: "https://hr.example.org/einstellungen?tab=laeufe",
    hrPostfach: "hr@example.org",
  });

  it("Merker sind Zeichenketten („ja“ oder leer)", () => {
    expect(payload.hat_probleme).toBe("ja");
    expect(payload.ist_probelauf).toBe("");
    expect(payload.ist_fehler).toBe("");
  });

  it("maskiert die Tabelle und markiert rote Werte", () => {
    expect(payload.tabelle_html).toContain("Nicht &lt;zugestellt&gt;");
    expect(tabelleHtml([["a", 1, true]])).toContain("color:#E2001A");
  });

  it("traegt Name, Auslöser, HR-Postfach und nur bei Problemen den Hinweis", () => {
    expect(payload.lauf_name).toBe("Ablauf befristeter Nachweise");
    expect(payload.ausloeser).toBe("Zeitplan");
    expect(payload.hr_postfach).toBe("hr@example.org");
    expect(payload.hinweis).toBe("Bitte prüfen.");
  });

  it("jede Variable der Standardvorlage kommt im Payload vor", () => {
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "automatischer-lauf-bericht")!;
    const text = vorlage.subject + vorlage.bodyHtml + vorlage.bodyText;
    const variablen = new Set([...text.matchAll(/\{\{[#/]?(\w+)\}\}/g)].map((m) => m[1]));
    for (const v of variablen) expect({ v, vorhanden: v in payload }).toEqual({ v, vorhanden: true });
  });
});

describe("Uhr: ZEITPLANER_AKTIV", () => {
  it("Standard: an in Produktion, aus sonst; ausdruecklich ueberschreibbar", () => {
    expect(zeitplanerSollLaufen({ NODE_ENV: "production" })).toBe(true);
    expect(zeitplanerSollLaufen({ NODE_ENV: "development" })).toBe(false);
    expect(zeitplanerSollLaufen({ NODE_ENV: "production", ZEITPLANER_AKTIV: "false" })).toBe(false);
    expect(zeitplanerSollLaufen({ NODE_ENV: "development", ZEITPLANER_AKTIV: "true" })).toBe(true);
  });
});
