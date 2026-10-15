/**
 * Tests: Abteilungsaufgaben — die reinen Regeln (src/lib/abteilungsaufgaben.ts)
 *
 * Ohne Datenbank und ohne Uhr: Jede Funktion bekommt `jetzt`. Die Faelle
 * stammen aus dem Entwurf zu Paket 1b (Abschnitt "Tests") in der Fassung nach
 * der Kritik: WEBHOOK statt Dauer-SKIPPED, 502 nur bei SMTP-Fehlern, Kommentar
 * im Payload bereits maskiert, Erinnerungen erst ab dem letzten Versand.
 */

import fs from "fs";
import path from "path";
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_KEYS,
  LINK_ABTEILUNGEN,
  PORTAL_ZUSTAENDIGE,
  RESERVIERTE_ABTEILUNGSSCHLUESSEL,
  abteilungLabel,
} from "@/lib/constants";
import {
  GUELTIG_MIN_TAGE,
  MELDUNGEN,
  SPERRZEIT_MINUTEN,
  VORLAGE_DEAKTIVIERT_DETAIL,
  absageEmpfaenger,
  absageInformiert,
  absageOffen,
  absageStand,
  abteilungKonfigDto,
  abteilungsReihenfolge,
  abteilungsSchluesselBekannt,
  abteilungsSchluesselGueltig,
  abteilungsZeilenBauen,
  aufgabenlisteMailFelder,
  berichtMeldung,
  eiltDeckeln,
  empfaengerAufloesen,
  erinnerungsBezug,
  erinnerungsMerkerSetzen,
  erinnerungsStufe,
  erledigteListeMailFelder,
  erledigtVonBestimmen,
  faelligkeitVerschoben,
  fehlendeAdressen,
  grundText,
  gueltigBis,
  httpStatusAusBericht,
  istFuehrungskraft,
  istLinkAbteilung,
  istPortalZustaendig,
  kommentarMailFelder,
  linkAnzeige,
  meldungNachweisFehlt,
  nachtragAnzahl,
  nachtragZeilenText,
  NACHTRAG_TITEL_MAX,
  empfaengerEinrichtung,
  nachInfoNeuText,
  nachInfoNeuZaehlen,
  onboardingEmpfaengerEinrichtung,
  waechterHinweis,
  WAECHTER_TAGE,
  sperrzeitBis,
  stufeBerechnen,
  stufenMailFelder,
  verlaengerungNoetig,
  versandEntscheidung,
  versandStatusAusErgebnis,
  verwendungZaehlen,
  type AbteilungsKonfig,
  type LinkAnzeigeStand,
  type LinkFuerZeile,
  type VersandBericht,
} from "@/lib/abteilungsaufgaben";
import { nachtragListe } from "@/lib/ausstattung";

const TAG = 86_400_000;
const JETZT = new Date("2027-07-20T08:00:00.000Z");
const tage = (n: number) => new Date(JETZT.getTime() + n * TAG);

function konfig(teil: Partial<AbteilungsKonfig>): AbteilungsKonfig {
  return {
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    organizationId: null,
    isActive: true,
    ...teil,
  };
}

// =============================================
// Konstanten und Zustaendigkeiten
// =============================================

describe("Schluessel und Labels", () => {
  it("VERWALTUNG ist neu, VORGESETZTER heisst jetzt Führungskraft", () => {
    expect(DEPARTMENT_KEYS.VERWALTUNG).toBe("VERWALTUNG");
    expect(DEPARTMENT_LABELS.VERWALTUNG).toBe("Verwaltung / Sekretariat");
    expect(DEPARTMENT_LABELS.VORGESETZTER).toBe("Führungskraft");
    expect(abteilungLabel("VORGESETZTER")).toBe("Führungskraft");
  });

  it("abteilungLabel laesst Unbekanntes stehen und macht aus leer ''", () => {
    expect(abteilungLabel("EMPFANG")).toBe("EMPFANG");
    expect(abteilungLabel(null)).toBe("");
    expect(abteilungLabel("")).toBe("");
  });

  it("die Listen passen zueinander", () => {
    expect([...LINK_ABTEILUNGEN]).toEqual(["IT", "VERWALTUNG", "FACILITY", "BUCHHALTUNG", "DSB"]);
    expect([...PORTAL_ZUSTAENDIGE]).toEqual(["HR", "MITARBEITER"]);
    expect([...RESERVIERTE_ABTEILUNGSSCHLUESSEL]).toEqual(["HR", "MITARBEITER", "VORGESETZTER"]);
    for (const k of LINK_ABTEILUNGEN) expect(DEPARTMENT_LABELS[k]).toBeTruthy();
  });

  it("Link-Abteilung ist alles ausser HR/MITARBEITER, auch Führungskraft und eigene Schluessel", () => {
    expect(istLinkAbteilung("IT")).toBe(true);
    expect(istLinkAbteilung("VORGESETZTER")).toBe(true);
    expect(istLinkAbteilung("EMPFANG")).toBe(true);
    expect(istLinkAbteilung("HR")).toBe(false);
    expect(istLinkAbteilung("MITARBEITER")).toBe(false);
    expect(istLinkAbteilung(null)).toBe(false);
    expect(istLinkAbteilung("  ")).toBe(false);
    expect(istPortalZustaendig("HR")).toBe(true);
    expect(istFuehrungskraft("VORGESETZTER")).toBe(true);
  });

  it("Schluesselform und bekannte Schluessel", () => {
    expect(abteilungsSchluesselGueltig("IT")).toBe(true);
    expect(abteilungsSchluesselGueltig("EMPFANG_2")).toBe(true);
    expect(abteilungsSchluesselGueltig("I")).toBe(false);
    expect(abteilungsSchluesselGueltig("it")).toBe(false);
    expect(abteilungsSchluesselGueltig("2IT")).toBe(false);
    expect(abteilungsSchluesselGueltig("A".repeat(31))).toBe(false);
    expect(abteilungsSchluesselBekannt("VERWALTUNG", [])).toBe(true);
    expect(abteilungsSchluesselBekannt("EMPFANG", ["EMPFANG"])).toBe(true);
    expect(abteilungsSchluesselBekannt("EMPFANG", [])).toBe(false);
  });

  it("Reihenfolge: feste Abteilungen, eigene alphabetisch, Führungskraft zuletzt; HR faellt weg", () => {
    expect(abteilungsReihenfolge(["VORGESETZTER", "ZETT", "DSB", "HR", "IT", "EMPFANG", "IT"])).toEqual([
      "IT",
      "DSB",
      "EMPFANG",
      "ZETT",
      "VORGESETZTER",
    ]);
  });
});

// =============================================
// Empfaenger
// =============================================

describe("empfaengerAufloesen", () => {
  const basis = { organizationId: "org-1", fuehrungskraft: null };

  it("die Einrichtung schlaegt die zentrale Adresse", () => {
    const e = empfaengerAufloesen({
      ...basis,
      departmentKey: "IT",
      konfigs: [
        konfig({ email: "zentral@example.org" }),
        konfig({ email: "it-minden@example.org", organizationId: "org-1", departmentName: "IT Minden" }),
        konfig({ email: "fremd@example.org", organizationId: "org-2" }),
      ],
    });
    expect(e).toEqual({ ok: true, email: "it-minden@example.org", departmentName: "IT Minden", quelle: "EINRICHTUNG" });
  });

  it("inaktive Eintraege zaehlen nicht; nur inaktive ergeben ABTEILUNG_INAKTIV", () => {
    const zentralBleibt = empfaengerAufloesen({
      ...basis,
      departmentKey: "IT",
      konfigs: [konfig({ organizationId: "org-1", isActive: false, email: "alt@example.org" }), konfig({})],
    });
    expect(zentralBleibt).toMatchObject({ ok: true, email: "it@example.org", quelle: "ZENTRAL" });

    const nurInaktiv = empfaengerAufloesen({
      ...basis,
      departmentKey: "IT",
      konfigs: [konfig({ isActive: false })],
    });
    expect(nurInaktiv).toEqual({ ok: false, grund: "ABTEILUNG_INAKTIV", departmentName: "IT-Abteilung" });
  });

  it("ohne Eintrag KEINE_ADRESSE mit dem Label als Namen", () => {
    expect(empfaengerAufloesen({ ...basis, departmentKey: "VERWALTUNG", konfigs: [] })).toEqual({
      ok: false,
      grund: "KEINE_ADRESSE",
      departmentName: "Verwaltung / Sekretariat",
    });
  });

  it("VORGESETZTER geht an die Führungskraft des Vorgangs, auch wenn es einen Eintrag VORGESETZTER gibt", () => {
    const e = empfaengerAufloesen({
      organizationId: "org-1",
      departmentKey: "VORGESETZTER",
      konfigs: [konfig({ departmentKey: "VORGESETZTER", email: "alle-leitungen@example.org" })],
      fuehrungskraft: { email: " leitung@example.org ", name: "Anna Leitung" },
    });
    expect(e).toEqual({ ok: true, email: "leitung@example.org", departmentName: "Führungskraft", quelle: "FUEHRUNGSKRAFT" });
  });

  it("ohne Führungskraft KEINE_FUEHRUNGSKRAFT", () => {
    const e = empfaengerAufloesen({
      organizationId: "org-1",
      departmentKey: "VORGESETZTER",
      konfigs: [konfig({ departmentKey: "VORGESETZTER" })],
      fuehrungskraft: { email: null, name: null },
    });
    expect(e).toMatchObject({ ok: false, grund: "KEINE_FUEHRUNGSKRAFT" });
  });

  it("HR und MITARBEITER bekommen nie einen Empfaenger", () => {
    for (const key of ["HR", "MITARBEITER"]) {
      const e = empfaengerAufloesen({
        ...basis,
        departmentKey: key,
        konfigs: [konfig({ departmentKey: key })],
      });
      expect(e.ok).toBe(false);
    }
  });
});

// =============================================
// Versandentscheidung und Gueltigkeit
// =============================================

describe("versandEntscheidung", () => {
  const ok = { ok: true as const, email: "it@example.org", departmentName: "IT-Abteilung", quelle: "ZENTRAL" as const };

  it("alles erledigt → ALLES_ERLEDIGT", () => {
    expect(versandEntscheidung({ offeneAufgaben: 0, link: null, empfaenger: ok })).toEqual({
      senden: false,
      grund: "ALLES_ERLEDIGT",
    });
  });

  it("schon erfolgreich informiert → BEREITS_INFORMIERT", () => {
    expect(versandEntscheidung({ offeneAufgaben: 2, link: { sentAt: JETZT }, empfaenger: ok })).toEqual({
      senden: false,
      grund: "BEREITS_INFORMIERT",
    });
  });

  it("ein Link mit FAILED hat sentAt null und wird erneut versucht", () => {
    expect(versandEntscheidung({ offeneAufgaben: 2, link: { sentAt: null }, empfaenger: ok })).toEqual({ senden: true });
  });

  it("ohne Empfaenger dessen Grund", () => {
    expect(
      versandEntscheidung({
        offeneAufgaben: 1,
        link: null,
        empfaenger: { ok: false, grund: "KEINE_FUEHRUNGSKRAFT", departmentName: "Führungskraft" },
      }),
    ).toEqual({ senden: false, grund: "KEINE_FUEHRUNGSKRAFT" });
  });
});

describe("gueltigBis / verlaengerungNoetig / faelligkeitVerschoben", () => {
  it("Kuendigung im Februar zum 31.07.: spaeteste Faelligkeit + 30 Tage statt jetzt + 90", () => {
    const februar = new Date("2027-02-10T09:00:00.000Z");
    const bis = gueltigBis(februar, [new Date("2027-07-31T00:00:00.000Z"), new Date("2027-07-29T00:00:00.000Z"), null]);
    expect(bis.toISOString()).toBe("2027-08-30T00:00:00.000Z");
  });

  it("ohne Faelligkeiten gilt jetzt + 90 Tage", () => {
    expect(gueltigBis(JETZT, []).getTime()).toBe(JETZT.getTime() + GUELTIG_MIN_TAGE * TAG);
  });

  it("verlaengert nur, wenn der Link frueher ablaeuft", () => {
    expect(verlaengerungNoetig(tage(10), tage(20))).toBe(true);
    expect(verlaengerungNoetig(tage(30), tage(20))).toBe(false);
  });

  it("verschiebt um die Differenz der Bezugstage", () => {
    const alt = new Date("2027-07-31T00:00:00.000Z");
    const neu = new Date("2027-08-15T00:00:00.000Z");
    expect(faelligkeitVerschoben(new Date("2027-07-29T00:00:00.000Z"), alt, neu).toISOString()).toBe(
      "2027-08-13T00:00:00.000Z",
    );
  });
});

describe("sperrzeitBis", () => {
  it("sperrt 10 Minuten nach dem letzten Versand oder der letzten Erinnerung", () => {
    const vorFuenf = new Date(JETZT.getTime() - 5 * 60_000);
    const bis = sperrzeitBis({ lastSentAt: null, lastReminderAt: vorFuenf }, JETZT);
    expect(bis?.getTime()).toBe(vorFuenf.getTime() + SPERRZEIT_MINUTEN * 60_000);
    expect(sperrzeitBis({ lastSentAt: new Date(JETZT.getTime() - 11 * 60_000), lastReminderAt: null }, JETZT)).toBeNull();
    expect(sperrzeitBis({}, JETZT)).toBeNull();
  });
});

// =============================================
// Erinnerungen
// =============================================

describe("stufeBerechnen / erinnerungsStufe", () => {
  const link = (teil: Partial<{ sentAt: Date | null; lastSentAt: Date | null; lastReminderAt: Date | null; allTasksComplete: boolean }> = {}) => ({
    sentAt: tage(-10),
    lastSentAt: null,
    lastReminderAt: null,
    allTasksComplete: false,
    ...teil,
  });

  it("heute versendet, faellig in 2 Tagen: heute KEINE INFO-Erinnerung (Bezug sentAt)", () => {
    const e = erinnerungsStufe(link({ sentAt: JETZT }), [{ dueDate: tage(2) }], JETZT);
    expect(e).toMatchObject({ erinnern: false, warum: "ZU_FRUEH" });
  });

  it("vor 4 Tagen versendet, faellig in 2 Tagen: INFO", () => {
    const e = erinnerungsStufe(link({ sentAt: tage(-4) }), [{ dueDate: tage(2) }], JETZT);
    expect(e.erinnern && e.stufe.level).toBe("INFO");
  });

  it("1 Tag ueberfaellig ergibt WARNING, 3 Tage ESCALATION", () => {
    expect(stufeBerechnen([{ dueDate: tage(-1) }], JETZT)).toMatchObject({ level: "WARNING", overdueItems: 1, tageUeberfaellig: 1 });
    expect(stufeBerechnen([{ dueDate: tage(-3) }, { dueDate: tage(1) }], JETZT)).toMatchObject({
      level: "ESCALATION",
      overdueItems: 1,
      upcomingItems: 1,
      tageUeberfaellig: 3,
    });
  });

  it("heute faellig ist noch nicht ueberfaellig, sondern INFO", () => {
    const heuteFrueh = new Date("2027-07-20T00:00:00.000Z");
    expect(stufeBerechnen([{ dueDate: heuteFrueh }], JETZT)).toMatchObject({ level: "INFO", overdueItems: 0, upcomingItems: 1 });
  });

  it("mehr als 30 Tage nach der spaetesten offenen Faelligkeit: Schluss", () => {
    const e = erinnerungsStufe(link(), [{ dueDate: tage(-31) }], JETZT);
    expect(e).toMatchObject({ erinnern: false, warum: "ENDE" });
    expect(erinnerungsStufe(link(), [{ dueDate: tage(-29) }], JETZT).erinnern).toBe(true);
  });

  it("Aufgaben ohne Faelligkeit ergeben keine Stufe", () => {
    expect(erinnerungsStufe(link(), [{ dueDate: null }], JETZT)).toMatchObject({ erinnern: false, warum: "KEINE_STUFE" });
  });

  it("nie informiert (sentAt null) → keine Erinnerung", () => {
    expect(erinnerungsStufe(link({ sentAt: null }), [{ dueDate: tage(-5) }], JETZT)).toMatchObject({
      erinnern: false,
      warum: "NICHT_INFORMIERT",
    });
  });

  it("nichts offen oder Abteilung fertig → keine Erinnerung", () => {
    expect(erinnerungsStufe(link(), [], JETZT)).toMatchObject({ warum: "ALLES_ERLEDIGT" });
    expect(erinnerungsStufe(link({ allTasksComplete: true }), [{ dueDate: tage(-2) }], JETZT)).toMatchObject({
      warum: "ALLES_ERLEDIGT",
    });
  });

  it("Bezug ist max(lastSentAt ?? sentAt, lastReminderAt): erneut gesendet gestern → WARNING wartet", () => {
    const l = link({ sentAt: tage(-20), lastSentAt: tage(-1), lastReminderAt: tage(-10) });
    expect(erinnerungsBezug(l)?.toISOString()).toBe(tage(-1).toISOString());
    expect(erinnerungsStufe(l, [{ dueDate: tage(-2) }], JETZT)).toMatchObject({ erinnern: false, warum: "ZU_FRUEH" });
  });

  it("ESCALATION wartet 5 Tage nach der letzten Erinnerung", () => {
    expect(erinnerungsStufe(link({ lastReminderAt: tage(-4) }), [{ dueDate: tage(-6) }], JETZT).erinnern).toBe(false);
    expect(erinnerungsStufe(link({ lastReminderAt: tage(-5) }), [{ dueDate: tage(-6) }], JETZT).erinnern).toBe(true);
  });

  it("stufenMailFelder setzt eigene Merker je Stufe (renderTemplate kennt keine Vergleiche)", () => {
    const s = stufeBerechnen([{ dueDate: tage(-3) }, { dueDate: tage(-1) }, { dueDate: null }], JETZT);
    expect(stufenMailFelder(s, "ESCALATION")).toMatchObject({
      level: "ESCALATION",
      overdueItems: 2,
      totalOpenItems: 3,
      offene_aufgaben: 3,
      maxOverdueDays: 3,
      ueberfaellige_aufgaben: "2",
      tage_ueberfaellig: "3",
      ist_ueberfaellig: "ja",
      ist_warnung: "",
      ist_eskalation: "ja",
      ist_info: "",
    });
    const info = stufenMailFelder(stufeBerechnen([{ dueDate: tage(1) }], JETZT), "INFO");
    expect(info).toMatchObject({ ist_ueberfaellig: "", ueberfaellige_aufgaben: "", tage_ueberfaellig: "", ist_info: "ja" });
  });

  it("Merkerregel: SENT/WEBHOOK/SKIPPED ja, FAILED nein", () => {
    expect(erinnerungsMerkerSetzen("SENT")).toBe(true);
    expect(erinnerungsMerkerSetzen("WEBHOOK")).toBe(true);
    expect(erinnerungsMerkerSetzen("SKIPPED")).toBe(true);
    expect(erinnerungsMerkerSetzen("FAILED")).toBe(false);
  });
});

// =============================================
// „Eilt“ (Ausstattung & Zugaenge, Regel 14)
// =============================================

describe("eiltDeckeln / erinnerungsStufe mit eilender Aufgabe (Regel 14)", () => {
  const eilend = [{ dueDate: tage(-6), eilt: true }];
  const normal = [{ dueDate: tage(-6), eilt: false }];

  it("erste Erinnerung (reminderCount 0) mit eilender Aufgabe: ESCALATION wird WARNING", () => {
    expect(eiltDeckeln("ESCALATION", eilend, 0)).toBe("WARNING");
    // Eine eilende reicht, auch neben einer gewoehnlichen.
    expect(eiltDeckeln("ESCALATION", [...normal, ...eilend], 0)).toBe("WARNING");
  });

  it("alles andere bleibt: ab der zweiten Erinnerung, ohne eilende Aufgabe, ohne Zaehler, andere Stufen", () => {
    expect(eiltDeckeln("ESCALATION", eilend, 1)).toBe("ESCALATION");
    expect(eiltDeckeln("ESCALATION", normal, 0)).toBe("ESCALATION");
    expect(eiltDeckeln("ESCALATION", [{ eilt: undefined }], 0)).toBe("ESCALATION");
    expect(eiltDeckeln("ESCALATION", eilend, undefined)).toBe("ESCALATION");
    expect(eiltDeckeln("ESCALATION", eilend, null)).toBe("ESCALATION");
    expect(eiltDeckeln("WARNING", eilend, 0)).toBe("WARNING");
    expect(eiltDeckeln("INFO", eilend, 0)).toBe("INFO");
    expect(eiltDeckeln(null, eilend, 0)).toBeNull();
  });

  it("erinnerungsStufe: reminderCount 0 und eilende Aufgabe ergeben WARNING samt dessen Abstand", () => {
    // Versand vor 3 Tagen, Aufgabe seit 6 Tagen ueberfaellig: ESCALATION verlangte 5 Tage Abstand.
    const link = { sentAt: tage(-3), lastSentAt: tage(-3), lastReminderAt: null, allTasksComplete: false, reminderCount: 0 };
    const e = erinnerungsStufe(link, eilend, JETZT);
    expect(e.erinnern && e.stufe.level).toBe("WARNING");
    expect(e.stufe).toMatchObject({ overdueItems: 1, tageUeberfaellig: 6 });

    // Ohne „Eilt“ waere es eine Eskalation — und dafuer ist es noch zu frueh.
    expect(erinnerungsStufe(link, normal, JETZT)).toMatchObject({ erinnern: false, warum: "ZU_FRUEH" });
    // Die zweite Erinnerung eskaliert wieder normal.
    const zweite = { ...link, sentAt: tage(-10), lastSentAt: tage(-10), lastReminderAt: tage(-5), reminderCount: 1 };
    const e2 = erinnerungsStufe(zweite, eilend, JETZT);
    expect(e2.erinnern && e2.stufe.level).toBe("ESCALATION");
  });

  it("Links ohne reminderCount (Offboarding-Regeln wie bisher) werden nie gedeckelt", () => {
    const link = { sentAt: tage(-10), lastReminderAt: null, allTasksComplete: false };
    const e = erinnerungsStufe(link, eilend, JETZT);
    expect(e.erinnern && e.stufe.level).toBe("ESCALATION");
  });
});

// =============================================
// Mailfelder
// =============================================

describe("aufgabenlisteMailFelder", () => {
  it("maskiert Titel im HTML, sortiert nach Faelligkeit und nennt die naechste", () => {
    const f = aufgabenlisteMailFelder([
      { title: "Postfach <script>alert(1)</script> & \"Weiterleitung\"", dueDate: new Date("2027-07-31T00:00:00.000Z") },
      { title: "Ohne Frist", dueDate: null },
      { title: "Konto sperren", dueDate: new Date("2027-07-29T00:00:00.000Z") },
    ]);
    expect(f.anzahl_aufgaben).toBe(3);
    expect(f.naechste_faelligkeit).toBe("29.07.2027");
    expect(f.aufgabenliste).toBe(
      [
        "- Konto sperren – fällig 29.07.2027",
        "- Postfach <script>alert(1)</script> & \"Weiterleitung\" – fällig 31.07.2027",
        "- Ohne Frist",
      ].join("\n"),
    );
    expect(f.aufgabenliste_html).not.toContain("<script>");
    expect(f.aufgabenliste_html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Weiterleitung&quot;");
    expect(f.aufgabenliste_html.startsWith("<ul")).toBe(true);
  });

  it("leere Liste ergibt leere Felder", () => {
    expect(aufgabenlisteMailFelder([])).toEqual({
      aufgabenliste: "",
      aufgabenliste_html: "",
      anzahl_aufgaben: 0,
      naechste_faelligkeit: "",
    });
  });

  describe("Bemerkung und „Eilt“ (Ausstattung & Zugaenge, Regel 8 und 14)", () => {
    const basis = [
      { title: "Konto anlegen", dueDate: new Date("2027-07-29T00:00:00.000Z"), description: "M365 & Lizenz" },
      { title: "Ohne Frist", dueDate: null },
    ];

    it("ohne Bemerkung und ohne eilt: Byte fuer Byte wie vorher (auch mit null/false/leeren Feldern)", () => {
      const vorher = aufgabenlisteMailFelder(basis);
      expect(vorher.aufgabenliste).toBe("- Konto anlegen – fällig 29.07.2027\n  M365 & Lizenz\n- Ohne Frist");
      expect(
        aufgabenlisteMailFelder(
          basis.map((a) => ({ ...a, bemerkung: null, eilt: false })),
        ),
      ).toEqual(vorher);
      expect(
        aufgabenlisteMailFelder(basis.map((a) => ({ ...a, bemerkung: { text: "   ", label: "Bemerkung der Führungskraft" } }))),
      ).toEqual(vorher);
    });

    it("eilt: „(eilt)“ hinter der Faelligkeit — ohne Faelligkeit nichts", () => {
      const f = aufgabenlisteMailFelder([
        { title: "Dienst-iPad bereitstellen", dueDate: new Date("2027-07-20T00:00:00.000Z"), eilt: true },
        { title: "Ohne Frist", dueDate: null, eilt: true },
      ]);
      expect(f.aufgabenliste).toBe("- Dienst-iPad bereitstellen – fällig 20.07.2027 (eilt)\n- Ohne Frist");
      expect(f.aufgabenliste_html).toContain(
        '<li style="margin:0 0 4px;">Dienst-iPad bereitstellen – fällig 20.07.2027 (eilt)</li>',
      );
      expect(f.naechste_faelligkeit).toBe("20.07.2027");
    });

    it("Bemerkung: eigene eingerueckte Zeile „<Label>: <Text>“ unter dem Hinweis, im HTML maskiert", () => {
      const f = aufgabenlisteMailFelder([
        {
          title: "Zugang einrichten: Dienst-E-Mail",
          dueDate: new Date("2027-07-25T00:00:00.000Z"),
          description: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
          bemerkung: { text: "Mit Stift <und>\nHülle & Apps", label: "Bemerkung der Führungskraft" },
          eilt: true,
        },
        {
          title: "Dienst-iPad bereitstellen",
          dueDate: null,
          bemerkung: { text: "Bitte bis Montag", label: "Bemerkung der Personalabteilung" },
        },
      ]);
      expect(f.aufgabenliste).toBe(
        [
          "- Zugang einrichten: Dienst-E-Mail – fällig 25.07.2027 (eilt)",
          "  Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
          "  Bemerkung der Führungskraft: Mit Stift <und> Hülle & Apps",
          "- Dienst-iPad bereitstellen",
          "  Bemerkung der Personalabteilung: Bitte bis Montag",
        ].join("\n"),
      );
      expect(f.aufgabenliste_html).toContain(
        '<li style="margin:0 0 4px;">Zugang einrichten: Dienst-E-Mail – fällig 25.07.2027 (eilt)' +
          '<br><span style="color:#6b7280;font-size:13px;">Erst nach Verpflichtung auf Vertraulichkeit freischalten.</span>' +
          '<br><span style="color:#6b7280;font-size:13px;">Bemerkung der Führungskraft: Mit Stift &lt;und&gt; Hülle &amp; Apps</span></li>',
      );
      expect(f.aufgabenliste_html).toContain(
        '<li style="margin:0 0 4px;">Dienst-iPad bereitstellen' +
          '<br><span style="color:#6b7280;font-size:13px;">Bemerkung der Personalabteilung: Bitte bis Montag</span></li>',
      );
      expect(f.aufgabenliste_html).not.toContain("<und>");
    });
  });
});

describe("kommentarMailFelder", () => {
  it("kommentar ist maskiert mit <br>, kommentar_text roh", () => {
    const f = kommentarMailFelder("  Konto <b>gesperrt</b> & \"weitergeleitet\"\nZweite Zeile  ");
    expect(f.kommentar).toBe("Konto &lt;b&gt;gesperrt&lt;/b&gt; &amp; &quot;weitergeleitet&quot;<br>Zweite Zeile");
    expect(f.kommentar_text).toBe("Konto <b>gesperrt</b> & \"weitergeleitet\"\nZweite Zeile");
  });

  it("leer ergibt '' (der Bedingungsblock entfaellt)", () => {
    expect(kommentarMailFelder("   ")).toEqual({ kommentar: "", kommentar_text: "" });
    expect(kommentarMailFelder(null)).toEqual({ kommentar: "", kommentar_text: "" });
  });
});

// =============================================
// Versandergebnis und Bericht
// =============================================

describe("versandStatusAusErgebnis", () => {
  it("SENT merkt den tatsaechlichen Empfaenger", () => {
    expect(versandStatusAusErgebnis({ status: "SENT", recipient: "it@example.org, hr@example.org" }, false)).toEqual({
      status: "SENT",
      erfolgreich: true,
      detail: null,
      zugestelltAn: "it@example.org, hr@example.org",
    });
  });

  it("deaktivierte Vorlage mit aktivem Webhook gilt als uebergeben (WEBHOOK)", () => {
    const v = versandStatusAusErgebnis({ status: "SKIPPED", detail: VORLAGE_DEAKTIVIERT_DETAIL }, true);
    expect(v).toMatchObject({ status: "WEBHOOK", erfolgreich: true });
  });

  it("deaktivierte Vorlage ohne Webhook bleibt sichtbar nicht versendet", () => {
    const v = versandStatusAusErgebnis({ status: "SKIPPED", detail: VORLAGE_DEAKTIVIERT_DETAIL }, false);
    expect(v).toEqual({
      status: "SKIPPED",
      erfolgreich: false,
      detail: "Vorlage deaktiviert (Einstellungen → E-Mail-Vorlagen)",
      zugestelltAn: null,
    });
  });

  it("anderes SKIPPED bleibt SKIPPED, auch mit Webhook", () => {
    const v = versandStatusAusErgebnis(
      { status: "SKIPPED", detail: "Kein Empfaenger konfiguriert — bitte in der Vorlage ein An-Feld setzen" },
      true,
    );
    expect(v).toMatchObject({ status: "SKIPPED", erfolgreich: false, detail: "kein Empfänger in der E-Mail-Vorlage" });
  });

  it("FAILED und fehlendes Ergebnis sind FAILED; lange Gruende werden gekuerzt", () => {
    expect(versandStatusAusErgebnis(null, true)).toMatchObject({ status: "FAILED", erfolgreich: false });
    const lang = versandStatusAusErgebnis({ status: "FAILED", detail: "x".repeat(500) }, false);
    expect(lang.detail!.length).toBe(300);
  });

  it("der Mailer benutzt weiter genau den Wortlaut der WEBHOOK-Regel", () => {
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/mailer.ts"), "utf-8");
    expect(quelle).toContain(`"${VORLAGE_DEAKTIVIERT_DETAIL}"`);
  });
});

describe("httpStatusAusBericht / berichtMeldung", () => {
  const it_ = { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org" };
  const fm = { departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" };
  const fk = { departmentKey: "VORGESETZTER", departmentName: "Führungskraft", email: null };

  it("201 mit Liste und gelbem Hinweis fuer die Uebersprungenen", () => {
    const b: VersandBericht = {
      aktion: "informieren",
      versendet: [{ ...it_, status: "SENT" }, { ...fm, status: "SENT" }],
      uebersprungen: [{ ...fk, grund: "KEINE_FUEHRUNGSKRAFT" }, { ...it_, departmentKey: "DSB", departmentName: "DSB", grund: "BEREITS_INFORMIERT" }],
    };
    expect(httpStatusAusBericht(b)).toBe(201);
    expect(berichtMeldung(b)).toEqual({
      meldung: "2 Abteilungen informiert: IT-Abteilung, Facility Management.",
      hinweis: "Nicht informiert: Führungskraft (keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen).",
    });
  });

  it("409, wenn fachlich nichts zu versenden war — die Meldung nennt jede Abteilung mit Grund", () => {
    const b: VersandBericht = {
      aktion: "informieren",
      versendet: [],
      uebersprungen: [{ ...it_, grund: "KEINE_ADRESSE" }, { ...fk, grund: "KEINE_FUEHRUNGSKRAFT" }],
    };
    expect(httpStatusAusBericht(b)).toBe(409);
    expect(berichtMeldung(b).meldung).toBe(
      "Es wurde niemand informiert. IT-Abteilung: keine aktive Adresse hinterlegt (Einstellungen → Abteilungen). Führungskraft: keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen.",
    );
  });

  it("502, wenn alle Versuche am Mailserver scheiterten", () => {
    const b: VersandBericht = {
      aktion: "informieren",
      versendet: [],
      uebersprungen: [
        { ...it_, grund: "MAIL_FEHLGESCHLAGEN", detail: "SMTP-Server nicht erreichbar" },
        { ...fk, grund: "KEINE_FUEHRUNGSKRAFT" },
      ],
    };
    expect(httpStatusAusBericht(b)).toBe(502);
    expect(berichtMeldung(b).meldung).toContain("IT-Abteilung: Versand fehlgeschlagen: SMTP-Server nicht erreichbar.");
  });

  it("409 statt 502, wenn ein Versuch nur SKIPPED war", () => {
    const b: VersandBericht = {
      aktion: "informieren",
      versendet: [],
      uebersprungen: [
        { ...it_, grund: "MAIL_FEHLGESCHLAGEN" },
        { ...fm, grund: "MAIL_NICHT_VERSENDET", detail: "Vorlage deaktiviert" },
      ],
    };
    expect(httpStatusAusBericht(b)).toBe(409);
  });

  it("nichts mehr offen / keine Abteilungsaufgaben: eigene Meldungen", () => {
    expect(
      berichtMeldung({ aktion: "informieren", versendet: [], uebersprungen: [{ ...it_, grund: "BEREITS_INFORMIERT" }] })
        .meldung,
    ).toBe("Es gibt keine Abteilung, die noch informiert werden muss.");
    expect(berichtMeldung({ aktion: "informieren", versendet: [], uebersprungen: [] }).meldung).toBe(
      "In dieser Checkliste ist keine Aufgabe einer Abteilung zugeordnet.",
    );
  });

  it("Meldungen der Einzelaktionen", () => {
    expect(berichtMeldung({ aktion: "erneut-senden", versendet: [{ ...it_, status: "SENT" }], uebersprungen: [] }).meldung).toBe(
      "E-Mail an IT-Abteilung erneut gesendet. Der Link ist unverändert.",
    );
    expect(berichtMeldung({ aktion: "erinnern", versendet: [{ ...it_, status: "SENT" }], uebersprungen: [] }).meldung).toBe(
      "Erinnerung an IT-Abteilung gesendet.",
    );
    expect(
      berichtMeldung({ aktion: "link-erneuern", versendet: [{ ...it_, status: "SENT", neuerLink: true }], uebersprungen: [] })
        .meldung,
    ).toBe("Neuer Link an IT-Abteilung gesendet (it@example.org). Der bisherige Link ist ungültig.");
    expect(
      berichtMeldung({ aktion: "erinnern", versendet: [], uebersprungen: [{ ...it_, grund: "SPERRZEIT" }] }).meldung,
    ).toBe(`Erinnern nicht möglich. IT-Abteilung: ${grundText("SPERRZEIT")}.`);
    expect(
      berichtMeldung({
        aktion: "link-erneuern",
        versendet: [],
        uebersprungen: [{ ...it_, grund: "MAIL_FEHLGESCHLAGEN", detail: "Timeout", neuerLink: true }],
      }).meldung,
    ).toContain("Der bisherige Link von IT-Abteilung ist ungültig");
  });

  it("WEBHOOK ergaenzt einen Hinweis", () => {
    const m = berichtMeldung({ aktion: "informieren", versendet: [{ ...it_, status: "WEBHOOK" }], uebersprungen: [] });
    expect(m.hinweis).toContain("nur an den Webhook übergeben");
  });
});

// =============================================
// Anzeige und Zeilen der Karte
// =============================================

function linkStand(teil: Partial<LinkAnzeigeStand> = {}): LinkAnzeigeStand {
  return {
    sentAt: new Date("2027-07-12T08:00:00.000Z"),
    lastSentAt: null,
    firstOpenedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    allTasksComplete: false,
    completedAt: null,
    expiresAt: new Date("2027-10-30T00:00:00.000Z"),
    lastReminderAt: null,
    reminderCount: 0,
    lastSendStatus: "SENT",
    lastSendDetail: null,
    ...teil,
  };
}

describe("linkAnzeige", () => {
  it("informiert, geoeffnet, erledigt", () => {
    expect(linkAnzeige(linkStand(), JETZT)).toMatchObject({
      status: "INFORMIERT",
      text: "Informiert am 12.07.2027",
      farbe: "gelb",
      zusatz: "Link gültig bis 30.10.2027",
    });
    expect(
      linkAnzeige(
        linkStand({
          firstOpenedAt: new Date("2027-07-13T08:00:00Z"),
          lastOpenedAt: new Date("2027-07-14T08:00:00Z"),
          openCount: 3,
          reminderCount: 1,
          lastReminderAt: new Date("2027-07-18T08:00:00Z"),
        }),
        JETZT,
      ),
    ).toMatchObject({
      status: "GEOEFFNET",
      text: "Geöffnet (3×), zuletzt 14.07.2027",
      farbe: "blau",
      zusatz: "Link gültig bis 30.10.2027 · 1 Erinnerung, zuletzt 18.07.2027",
    });
    expect(linkAnzeige(linkStand({ allTasksComplete: true, completedAt: new Date("2027-07-19T08:00:00Z") }), JETZT)).toMatchObject({
      status: "ERLEDIGT",
      text: "Erledigt am 19.07.2027",
      farbe: "gruen",
    });
  });

  it("nie zugestellt: fehlgeschlagen bzw. nicht versendet, rot", () => {
    expect(
      linkAnzeige(linkStand({ sentAt: null, lastSendStatus: "FAILED", lastSendDetail: "SMTP-Server nicht erreichbar" }), JETZT),
    ).toMatchObject({ status: "FEHLGESCHLAGEN", text: "Versand fehlgeschlagen", farbe: "rot", hinweis: "SMTP-Server nicht erreichbar" });
    expect(
      linkAnzeige(linkStand({ sentAt: null, lastSendStatus: "SKIPPED", lastSendDetail: "Vorlage deaktiviert" }), JETZT),
    ).toMatchObject({ status: "NICHT_VERSENDET", text: "Nicht versendet: Vorlage deaktiviert", farbe: "rot" });
  });

  it("abgelaufen, und ein spaeterer Fehlversuch als Hinweis", () => {
    expect(linkAnzeige(linkStand({ expiresAt: tage(-1) }), JETZT)).toMatchObject({ status: "ABGELAUFEN", farbe: "rot" });
    expect(
      linkAnzeige(linkStand({ lastSendStatus: "FAILED", lastSendDetail: "Timeout" }), JETZT).hinweis,
    ).toBe("Letzte E-Mail nicht zugestellt: Timeout");
  });

  it("ohne Link: uebersprungen mit Grund, keine offenen oder noch nicht informiert", () => {
    expect(linkAnzeige(null, JETZT, { grund: "KEINE_ADRESSE", offeneAufgaben: 1 })).toMatchObject({
      status: "UEBERSPRUNGEN",
      farbe: "gelb",
      text: "keine aktive Adresse hinterlegt (Einstellungen → Abteilungen)",
    });
    expect(linkAnzeige(null, JETZT, { grund: "ALLES_ERLEDIGT", offeneAufgaben: 0 }).status).toBe("KEINE_OFFENEN");
    expect(linkAnzeige(null, JETZT, { grund: null, offeneAufgaben: 2 }).status).toBe("NICHT_INFORMIERT");
  });
});

describe("abteilungsZeilenBauen", () => {
  const link: LinkFuerZeile = {
    ...linkStand({ lastSentAt: new Date(JETZT.getTime() - 3 * 60_000) }),
    id: "l-it",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    zugestelltAn: "it@example.org",
  };

  function bauen(teil: Partial<Parameters<typeof abteilungsZeilenBauen>[0]> = {}) {
    return abteilungsZeilenBauen({
      aufgaben: [
        { assigneeDepartment: "IT", isCompleted: false, dueDate: new Date("2027-07-31T00:00:00Z") },
        { assigneeDepartment: "IT", isCompleted: true, dueDate: new Date("2027-07-29T00:00:00Z") },
        { assigneeDepartment: "BUCHHALTUNG", isCompleted: false, dueDate: null },
        { assigneeDepartment: "FACILITY", isCompleted: false, dueDate: new Date("2027-07-30T00:00:00Z") },
        { assigneeDepartment: "VORGESETZTER", isCompleted: false, dueDate: null },
        { assigneeDepartment: "HR", isCompleted: false, dueDate: null },
      ],
      links: [link],
      konfigs: [konfig({}), konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" })],
      organizationId: "org-1",
      fuehrungskraft: { email: null, name: null },
      vorgangAbgeschlossen: false,
      linkUrl: (t) => `https://hr.example.org/offboarding-tasks/${t}`,
      jetzt: JETZT,
      ...teil,
    });
  }

  it("eine Zeile je Link-Zustaendigkeit, auch fuer nicht informierte und uebersprungene; HR fehlt", () => {
    const { zeilen, informierbar, niemandInformiert } = bauen();
    expect(zeilen.map((z) => z.departmentKey)).toEqual(["IT", "FACILITY", "BUCHHALTUNG", "VORGESETZTER"]);
    expect(informierbar).toBe(1); // nur FACILITY
    expect(niemandInformiert).toBe(false);

    const it = zeilen[0];
    expect(it.link?.url).toBe("https://hr.example.org/offboarding-tasks/tok-it");
    expect(it.aufgaben).toEqual({ gesamt: 2, offen: 1, naechsteFaelligkeit: "2027-07-31T00:00:00.000Z" });
    expect(it.anzeige.status).toBe("INFORMIERT");
    // Vor 3 Minuten erneut gesendet → Sperrzeit: moeglich, aber gesperrt
    expect(it.aktionen).toEqual({
      erinnern: false,
      erneutSenden: false,
      linkKopieren: true,
      linkErneuern: true,
      erinnernGesperrt: true,
      erneutSendenGesperrt: true,
    });
    expect(it.sperreBis).not.toBeNull();

    expect(zeilen[1]).toMatchObject({ informierbar: true, email: "fm@example.org", anzeige: { status: "NICHT_INFORMIERT" } });
    expect(zeilen[2]).toMatchObject({
      informierbar: false,
      email: null,
      label: "Buchhaltung",
      anzeige: { status: "UEBERSPRUNGEN", farbe: "gelb" },
    });
    expect(zeilen[3]).toMatchObject({
      istFuehrungskraft: true,
      departmentName: "Führungskraft",
      empfaenger: { ok: false, grund: "KEINE_FUEHRUNGSKRAFT" },
    });
  });

  it("Adressaenderung in den Einstellungen wird als Hinweis an der Zeile gezeigt", () => {
    const { zeilen } = bauen({ konfigs: [konfig({ email: "it-neu@example.org" })] });
    expect(zeilen[0].anzeige.hinweis).toContain("Adresse geändert (jetzt it-neu@example.org)");
  });

  it("abgeschlossener Vorgang: nichts informierbar, nur Link kopieren", () => {
    const { zeilen, informierbar } = bauen({ vorgangAbgeschlossen: true });
    expect(informierbar).toBe(0);
    expect(zeilen[0].aktionen).toEqual({
      erinnern: false,
      erneutSenden: false,
      linkKopieren: true,
      linkErneuern: false,
      erinnernGesperrt: false,
      erneutSendenGesperrt: false,
    });
  });

  it("ohne Sperre: alle Aktionen frei, nichts „gesperrt“", () => {
    const { zeilen } = bauen({ links: [{ ...link, lastSentAt: null }] });
    expect(zeilen[0].aktionen).toEqual({
      erinnern: true,
      erneutSenden: true,
      linkKopieren: true,
      linkErneuern: true,
      erinnernGesperrt: false,
      erneutSendenGesperrt: false,
    });
  });

  it("erledigte Abteilung: kein „Link erneuern“ (der Server lehnt ab, die Mail listete nur Erledigtes)", () => {
    const { zeilen } = bauen({
      aufgaben: [{ assigneeDepartment: "IT", isCompleted: true, dueDate: null }],
      links: [{ ...link, lastSentAt: null, allTasksComplete: true, completedAt: JETZT }],
    });
    expect(zeilen[0].anzeige.status).toBe("ERLEDIGT");
    expect(zeilen[0].aktionen).toMatchObject({ erinnern: false, erneutSenden: false, linkErneuern: false, linkKopieren: true });
  });

  it("ohne aufloesbaren Empfaenger: keine Versandaktion — die Rueckfrage versprache sonst einen neuen Link", () => {
    const { zeilen } = bauen({ konfigs: [konfig({ isActive: false })], links: [{ ...link, lastSentAt: null }] });
    expect(zeilen[0].aktionen).toEqual({
      erinnern: false,
      erneutSenden: false,
      linkKopieren: true,
      linkErneuern: false,
      erinnernGesperrt: false,
      erneutSendenGesperrt: false,
    });
    expect(zeilen[0].anzeige.hinweis).toBe("Abteilung ist deaktiviert (Einstellungen → Abteilungen)");
  });

  it("ohne Links: niemandInformiert", () => {
    expect(bauen({ links: [] }).niemandInformiert).toBe(true);
  });
});

// =============================================
// Urheber, Einstellungen
// =============================================

describe("erledigtVonBestimmen", () => {
  const namen = { benutzer: { "u-1": "Erika Sachbearbeiter" }, abteilungen: { IT: "IT-Abteilung" } };
  it("Portal mit Namen, Link mit Abteilung, offen/unbekannt null", () => {
    expect(erledigtVonBestimmen({ isCompleted: true, completedById: "u-1", assigneeDepartment: "IT" }, namen)).toEqual({
      art: "PORTAL",
      name: "Erika Sachbearbeiter",
    });
    expect(erledigtVonBestimmen({ isCompleted: true, completedById: null, assigneeDepartment: "IT" }, namen)).toEqual({
      art: "LINK",
      name: "IT-Abteilung",
    });
    expect(erledigtVonBestimmen({ isCompleted: true, completedById: null, assigneeDepartment: "HR" }, namen)).toBeNull();
    expect(erledigtVonBestimmen({ isCompleted: false, completedById: "u-1", assigneeDepartment: "IT" }, namen)).toBeNull();
  });
});

describe("verwendungZaehlen / fehlendeAdressen", () => {
  const punkte = [
    { templateId: "t1", templateName: "Offboarding: Standard", defaultAssignee: "IT" },
    { templateId: "t1", templateName: "Offboarding: Standard", defaultAssignee: "IT" },
    { templateId: "t2", templateName: "Offboarding: Bildung", defaultAssignee: "IT" },
    { templateId: "t2", templateName: "Offboarding: Bildung", defaultAssignee: "VERWALTUNG" },
    { templateId: "t2", templateName: "Offboarding: Bildung", defaultAssignee: "VORGESETZTER" },
    { templateId: "t2", templateName: "Offboarding: Bildung", defaultAssignee: "HR" },
    { templateId: "t2", templateName: "Offboarding: Bildung", defaultAssignee: null },
  ];

  it("zaehlt Aufgaben und Vorlagen je Schluessel", () => {
    expect(verwendungZaehlen(punkte)).toEqual({
      IT: { aufgaben: 3, vorlagen: 2 },
      VERWALTUNG: { aufgaben: 1, vorlagen: 1 },
      VORGESETZTER: { aufgaben: 1, vorlagen: 1 },
      HR: { aufgaben: 1, vorlagen: 1 },
    });
  });

  it("uebergeht Freitext, der kein Schluessel ist (Onboarding-Vorlagen bis Paket 5)", () => {
    const mitFreitext = [
      ...punkte,
      { templateId: "t3", templateName: "Onboarding: Standard", defaultAssignee: "Verwaltung" },
      { templateId: "t3", templateName: "Onboarding: Standard", defaultAssignee: "Vorgesetzter" },
      { templateId: "t3", templateName: "Onboarding: Standard", defaultAssignee: " IT " },
    ];
    expect(verwendungZaehlen(mitFreitext)).toEqual({
      IT: { aufgaben: 4, vorlagen: 3 },
      VERWALTUNG: { aufgaben: 1, vorlagen: 1 },
      VORGESETZTER: { aufgaben: 1, vorlagen: 1 },
      HR: { aufgaben: 1, vorlagen: 1 },
    });
    expect(fehlendeAdressen(mitFreitext, [konfig({}), konfig({ departmentKey: "VERWALTUNG" })])).toEqual([]);
  });

  it("meldet Link-Abteilungen ohne aktive Adresse (nicht Führungskraft, nicht HR)", () => {
    expect(fehlendeAdressen(punkte, [konfig({})])).toEqual([
      { vorlage: "Offboarding: Bildung", departmentKey: "VERWALTUNG", label: "Verwaltung / Sekretariat" },
    ]);
    expect(fehlendeAdressen(punkte, [konfig({ isActive: false }), konfig({ departmentKey: "VERWALTUNG" })])).toEqual([
      { vorlage: "Offboarding: Standard", departmentKey: "IT", label: "IT-Abteilung" },
      { vorlage: "Offboarding: Bildung", departmentKey: "IT", label: "IT-Abteilung" },
    ]);
  });
});

describe("abteilungKonfigDto / meldungNachweisFehlt", () => {
  it("ergaenzt Anzeigenamen und Kennzeichen Altbestand", () => {
    expect(abteilungKonfigDto({ id: "k1", departmentKey: "IT", email: "it@example.org" })).toEqual({
      id: "k1",
      departmentKey: "IT",
      email: "it@example.org",
      label: "IT-Abteilung",
      reserviert: false,
    });
    expect(abteilungKonfigDto({ departmentKey: "VORGESETZTER" })).toMatchObject({ label: "Führungskraft", reserviert: true });
    expect(abteilungKonfigDto({ departmentKey: "EMPFANG" })).toMatchObject({ label: "EMPFANG", reserviert: false });
  });

  it("warnt mit allen Namen vor einem zweiten Versand", () => {
    expect(meldungNachweisFehlt(["IT-Abteilung", "Buchhaltung"])).toBe(
      "Achtung: Die E-Mail an IT-Abteilung, Buchhaltung ist versendet, das Ergebnis konnte aber nicht gespeichert werden. Die Übersicht zeigt den Versand deshalb nicht – bitte nicht erneut senden.",
    );
  });
});

describe("onboardingEmpfaengerEinrichtung (E-A10)", () => {
  it("der Arbeitsort bestimmt die Empfaenger, sonst die Einrichtung des Vorgangs", () => {
    expect(onboardingEmpfaengerEinrichtung({ arbeitsortId: "org-gs", organizationId: "org-foerderverein" })).toBe(
      "org-gs",
    );
    expect(onboardingEmpfaengerEinrichtung({ arbeitsortId: null, organizationId: "org-gym" })).toBe("org-gym");
    expect(onboardingEmpfaengerEinrichtung({ organizationId: "org-gym" })).toBe("org-gym");
    expect(onboardingEmpfaengerEinrichtung({ arbeitsortId: "", organizationId: "org-gym" })).toBe("org-gym");
  });

  it("mit empfaengerAufloesen: der Eintrag des Arbeitsorts vor dem zentralen", () => {
    const konfigs = [
      konfig({ departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: "hm-gs@example.org", organizationId: "org-gs" }),
      konfig({ departmentKey: "FACILITY", departmentName: "Facility zentral", email: "facility@example.org", organizationId: null }),
    ];
    const vorgang = { arbeitsortId: "org-gs", organizationId: "org-foerderverein" };
    expect(
      empfaengerAufloesen({
        departmentKey: "FACILITY",
        organizationId: onboardingEmpfaengerEinrichtung(vorgang),
        konfigs,
        fuehrungskraft: null,
      }),
    ).toMatchObject({ ok: true, email: "hm-gs@example.org", quelle: "EINRICHTUNG" });
    expect(
      empfaengerAufloesen({
        departmentKey: "FACILITY",
        organizationId: onboardingEmpfaengerEinrichtung({ ...vorgang, arbeitsortId: null }),
        konfigs,
        fuehrungskraft: null,
      }),
    ).toMatchObject({ ok: true, email: "facility@example.org", quelle: "ZENTRAL" });
  });
});

// =============================================
// Ausstattung & Zugaenge (Paket A3, S17): Nachtrag und Waechter
// =============================================

describe("waechterHinweis (Regel 15)", () => {
  // JETZT = 20.07.2027, 10:00 Uhr deutscher Zeit; die Grenze ist der 27.07.
  const faellig = (iso: string) => ({ dueDate: new Date(`${iso}T00:00:00.000Z`) });
  const basis = {
    link: null,
    offene: [faellig("2027-07-26")],
    nachtragOffen: false,
    gesperrt: false,
    abgeschlossen: false,
    jetzt: JETZT,
  };

  it("nicht informiert und Frist in weniger als 7 Tagen: Text mit dem Datum", () => {
    expect(waechterHinweis(basis)).toBe("Früheste Fälligkeit 26.07.2027 – Stelle noch nicht informiert");
    // Ein nie zugestellter Link (sentAt null) zaehlt wie keiner.
    expect(waechterHinweis({ ...basis, link: { sentAt: null } })).toBe(
      "Früheste Fälligkeit 26.07.2027 – Stelle noch nicht informiert",
    );
  });

  it("schon verstrichen: ebenfalls — die frueheste offene Faelligkeit zaehlt", () => {
    expect(
      waechterHinweis({ ...basis, offene: [faellig("2027-08-30"), { dueDate: null }, faellig("2027-07-10")] }),
    ).toBe("Früheste Fälligkeit 10.07.2027 – Stelle noch nicht informiert");
  });

  it("genau eine Woche oder mehr entfernt, oder ohne Faelligkeit: kein Waechter", () => {
    expect(WAECHTER_TAGE).toBe(7);
    expect(waechterHinweis({ ...basis, offene: [faellig("2027-07-27")] })).toBeNull();
    expect(waechterHinweis({ ...basis, offene: [faellig("2027-08-15")] })).toBeNull();
    expect(waechterHinweis({ ...basis, offene: [{ dueDate: null }] })).toBeNull();
    expect(waechterHinweis({ ...basis, offene: [] })).toBeNull();
  });

  it("informiert: nur mit offenem Nachtrag — „Nachtrag noch nicht gesendet“", () => {
    const informiert = { ...basis, link: { sentAt: tage(-5) } };
    expect(waechterHinweis(informiert)).toBeNull();
    expect(waechterHinweis({ ...informiert, nachtragOffen: true })).toBe(
      "Früheste Fälligkeit 26.07.2027 – Nachtrag noch nicht gesendet",
    );
  });

  it("abgeschlossener Vorgang oder fehlende Modalitaeten: nie", () => {
    expect(waechterHinweis({ ...basis, abgeschlossen: true })).toBeNull();
    expect(waechterHinweis({ ...basis, gesperrt: true })).toBeNull();
    expect(waechterHinweis({ ...basis, link: { sentAt: tage(-5) }, nachtragOffen: true, abgeschlossen: true })).toBeNull();
  });
});

describe("nachtragAnzahl / nachtragZeilenText (Regel 10)", () => {
  it("zaehlt alle Arten; ohne Liste 0", () => {
    expect(nachtragAnzahl(null)).toBe(0);
    expect(nachtragAnzahl({ neu: ["a"], geaendert: ["b", "c"], entfaellt: ["d"] })).toBe(4);
  });

  it("Zeile der Karte: je Art ein Verb, zweiter Satz nach Knopf bzw. naechster Mail", () => {
    const liste = { neu: ["Dienst-Laptop/PC bereitstellen"], geaendert: ["Zugang einrichten: WebUntis"], entfaellt: ["Spind bereitstellen"] };
    expect(nachtragZeilenText(liste, true)).toBe(
      "Nach der Information geändert: „Dienst-Laptop/PC bereitstellen“ hinzugefügt, „Zugang einrichten: WebUntis“ geändert, „Spind bereitstellen“ entfällt. Die Stelle erfährt davon erst mit „Nachtrag senden“.",
    );
    expect(nachtragZeilenText(liste, false)).toMatch(/Die Stelle erfährt davon erst mit der nächsten Aufgaben-E-Mail \(„Erneut senden“\)\.$/);
  });

  it("nennt hoechstens NACHTRAG_TITEL_MAX Titel, den Rest als Anzahl", () => {
    const neu = ["A", "B", "C", "D", "E", "F"];
    const text = nachtragZeilenText({ neu, geaendert: [], entfaellt: [] }, true);
    expect(NACHTRAG_TITEL_MAX).toBe(4);
    expect(text).toContain("„A“ hinzugefügt, „B“ hinzugefügt, „C“ hinzugefügt, „D“ hinzugefügt und 2 weitere.");
    expect(text).not.toContain("„E“");
  });
});

describe("abteilungsZeilenBauen mit Nachtrag und Waechter (nur Onboarding)", () => {
  /** Informiert vor acht Tagen — keine Sperrzeit. */
  const linkIt: LinkFuerZeile = {
    ...linkStand({ sentAt: tage(-8), lastSentAt: tage(-8) }),
    id: "l-it",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    zugestelltAn: "it@example.org",
  };

  function bauen(teil: Partial<Parameters<typeof abteilungsZeilenBauen>[0]> = {}) {
    return abteilungsZeilenBauen({
      aufgaben: [{ assigneeDepartment: "IT", isCompleted: false, dueDate: new Date("2027-07-24T00:00:00Z") }],
      links: [linkIt],
      konfigs: [konfig({})],
      organizationId: "org-1",
      fuehrungskraft: null,
      vorgangAbgeschlossen: false,
      linkUrl: (t) => `https://hr.example.org/onboarding-tasks/${t}`,
      jetzt: JETZT,
      ...teil,
    });
  }

  const NUR_ENTFAELLT = { IT: { neu: [], geaendert: [], entfaellt: ["Spind bereitstellen"] } };

  it("ohne die beiden Optionen bleibt die Zeile wie bisher (Offboarding): keine neuen Schluessel", () => {
    const [z] = bauen({ links: [{ ...linkIt, sentAt: null }] }).zeilen;
    expect(z).not.toHaveProperty("nachtrag");
    expect(z.aktionen).not.toHaveProperty("nachtrag");
    expect(z.aktionen).not.toHaveProperty("nachtragGesperrt");
    // Kein Waechter, obwohl die Stelle nicht informiert ist und die Frist naht.
    expect(z.anzeige).not.toHaveProperty("hinweisTon");
  });

  it("„Nachtrag senden“ auch ohne offene Aufgabe (nur „Entfällt“), mit der Zeile der Karte", () => {
    const [z] = bauen({
      aufgaben: [{ assigneeDepartment: "IT", isCompleted: true, dueDate: null, entfaellt: true }],
      links: [{ ...linkIt, allTasksComplete: true, completedAt: tage(-1) }],
      nachtraege: NUR_ENTFAELLT,
    }).zeilen;
    expect(z.aktionen).toMatchObject({ nachtrag: true, nachtragGesperrt: false, erneutSenden: false });
    expect(z.nachtrag).toEqual({
      anzahl: 1,
      text: "Nach der Information geändert: „Spind bereitstellen“ entfällt. Die Stelle erfährt davon erst mit „Nachtrag senden“.",
    });
  });

  it("waehrend der Sperrzeit: sichtbar, aber gesperrt", () => {
    const [z] = bauen({
      links: [{ ...linkIt, lastSentAt: new Date(JETZT.getTime() - 3 * 60_000) }],
      nachtraege: NUR_ENTFAELLT,
    }).zeilen;
    expect(z.aktionen).toMatchObject({ nachtrag: false, nachtragGesperrt: true });
  });

  it("kein Nachtrag ohne Liste, ohne zugestellten Link, ohne Empfaenger, bei abgeschlossenem oder gesperrtem Vorgang", () => {
    const ohneListe = bauen({ nachtraege: {} }).zeilen[0];
    expect(ohneListe.aktionen).toMatchObject({ nachtrag: false, nachtragGesperrt: false });
    expect(ohneListe.nachtrag).toBeNull();

    const nieZugestellt = bauen({ links: [{ ...linkIt, sentAt: null }], nachtraege: NUR_ENTFAELLT }).zeilen[0];
    expect(nieZugestellt.aktionen.nachtrag).toBe(false);
    // Die Zeile steht trotzdem — mit dem Hinweis auf die naechste Mail (F7).
    expect(nieZugestellt.nachtrag?.text).toContain("mit der nächsten Aufgaben-E-Mail");

    const ohneEmpfaenger = bauen({ konfigs: [konfig({ isActive: false })], nachtraege: NUR_ENTFAELLT }).zeilen[0];
    expect(ohneEmpfaenger.aktionen.nachtrag).toBe(false);

    const abgeschlossen = bauen({ vorgangAbgeschlossen: true, nachtraege: NUR_ENTFAELLT }).zeilen[0];
    expect(abgeschlossen.aktionen).toMatchObject({ nachtrag: false, nachtragGesperrt: false });
    expect(abgeschlossen.nachtrag).toBeNull();

    const gesperrt = bauen({ gesperrt: true, nachtraege: NUR_ENTFAELLT }).zeilen[0];
    expect(gesperrt.aktionen.nachtrag).toBe(false);
  });

  it("nachtragListe zusammengefasst: was sich aufhebt, zaehlt nicht und loest keinen Knopf aus", () => {
    const liste = nachtragListe([
      { art: "NEU", titel: "Parkplatz bereitstellen" },
      { art: "ENTFAELLT", titel: "Parkplatz bereitstellen" },
    ]);
    const [z] = bauen({ nachtraege: { IT: liste } }).zeilen;
    expect(nachtragAnzahl(liste)).toBe(0);
    expect(z.aktionen.nachtrag).toBe(false);
    expect(z.nachtrag).toBeNull();
  });

  it("Waechter: roter Hinweis vorn, ein bestehender Hinweis der Zeile bleibt dahinter", () => {
    const [z] = bauen({
      konfigs: [konfig({ email: "it-neu@example.org" })],
      nachtraege: NUR_ENTFAELLT,
      waechter: true,
    }).zeilen;
    expect(z.anzeige.hinweisTon).toBe("rot");
    expect(z.anzeige.hinweis).toMatch(
      /^Früheste Fälligkeit 24\.07\.2027 – Nachtrag noch nicht gesendet · Adresse geändert \(jetzt it-neu@example\.org\)/,
    );
  });

  it("Waechter auch in einer uebersprungenen Zeile (keine Adresse) — dort steht sonst kein Hinweis", () => {
    const { zeilen } = bauen({
      aufgaben: [{ assigneeDepartment: "FACILITY", isCompleted: false, dueDate: new Date("2027-07-21T00:00:00Z") }],
      links: [],
      waechter: true,
      nachtraege: {},
    });
    expect(zeilen[0]).toMatchObject({
      departmentKey: "FACILITY",
      anzeige: {
        status: "UEBERSPRUNGEN",
        hinweis: "Früheste Fälligkeit 21.07.2027 – Stelle noch nicht informiert",
        hinweisTon: "rot",
      },
    });
  });
});

// =============================================
// Ausstattung & Zugaenge, Stufe 2 (Paket A4, S22): nach der Information
// hinzugekommene Aufgaben (nur Offboarding) und der Empfaenger am Arbeitsort
// =============================================

describe("abteilungsZeilenBauen mit nachInfoNeu (A4, G14, nur Offboarding)", () => {
  /** Informiert vor acht Tagen — keine Sperrzeit. */
  const linkIt: LinkFuerZeile = {
    ...linkStand({ sentAt: tage(-8), lastSentAt: tage(-8) }),
    id: "l-it",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    zugestelltAn: "it@example.org",
  };

  function bauen(teil: Partial<Parameters<typeof abteilungsZeilenBauen>[0]> = {}) {
    return abteilungsZeilenBauen({
      aufgaben: [
        { assigneeDepartment: "IT", isCompleted: false, dueDate: new Date("2027-07-31T00:00:00Z") },
        { assigneeDepartment: "FACILITY", isCompleted: false, dueDate: null },
      ],
      links: [linkIt],
      konfigs: [konfig({}), konfig({ departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" })],
      organizationId: "org-1",
      fuehrungskraft: null,
      vorgangAbgeschlossen: false,
      linkUrl: (t) => `https://hr.example.org/offboarding-tasks/${t}`,
      jetzt: JETZT,
      ...teil,
    });
  }

  it("ohne das Feld (und mit leerem Feld) dieselbe Ausgabe wie bisher", () => {
    const bisher = bauen();
    expect(bauen({ nachInfoNeu: {} })).toEqual(bisher);
    expect(bauen({ nachInfoNeu: { IT: 0 } })).toEqual(bisher);
    expect(bisher.zeilen[0].anzeige).toEqual({
      status: "INFORMIERT",
      text: "Informiert am 12.07.2027",
      farbe: "gelb",
      zusatz: expect.any(String),
      hinweis: null,
    });
  });

  it("gelber Hinweis an der informierten Stelle, Einzahl und Mehrzahl", () => {
    const [it] = bauen({ nachInfoNeu: { IT: 2 } }).zeilen;
    expect(it.anzeige.hinweis).toBe("2 Aufgaben nach der Information hinzugekommen – bitte „Erneut senden“");
    expect(it.anzeige.hinweisTon).toBe("gelb");
    expect(nachInfoNeuText(1)).toBe("1 Aufgabe nach der Information hinzugekommen – bitte „Erneut senden“");
    // Die Aktionen bleiben, wie sie sind: „Erneut senden“ schickt denselben Link.
    expect(it.aktionen).toEqual(bauen().zeilen[0].aktionen);
  });

  it("ein bestehender Hinweis bleibt vorn und behaelt seine Farbe", () => {
    const [it] = bauen({
      konfigs: [konfig({ email: "it-neu@example.org" })],
      nachInfoNeu: { IT: 1 },
    }).zeilen;
    expect(it.anzeige.hinweis).toMatch(
      /^Adresse geändert \(jetzt it-neu@example\.org\).* · 1 Aufgabe nach der Information hinzugekommen – bitte „Erneut senden“$/,
    );
    expect(it.anzeige).not.toHaveProperty("hinweisTon");
  });

  it("kein Hinweis ohne zugestellten Link, bei nicht informierter Stelle oder abgeschlossenem Vorgang", () => {
    expect(bauen({ links: [{ ...linkIt, sentAt: null, lastSentAt: null }], nachInfoNeu: { IT: 2 } }).zeilen[0].anzeige.hinweis).toBeNull();
    const facility = bauen({ nachInfoNeu: { FACILITY: 1 } }).zeilen.find((z) => z.departmentKey === "FACILITY")!;
    expect(facility.anzeige.hinweis).toBeNull();
    expect(bauen({ vorgangAbgeschlossen: true, nachInfoNeu: { IT: 2 } }).zeilen[0].anzeige.hinweis).toBeNull();
  });
});

describe("nachInfoNeuZaehlen (A4, S29: Eingabe von nachInfoNeu)", () => {
  const informiert = new Date("2027-07-12T08:00:00.000Z");
  const aufgabe = (teil: { assigneeDepartment?: string | null; isCompleted?: boolean; createdAt?: Date | string | null }) => ({
    assigneeDepartment: "IT",
    isCompleted: false,
    createdAt: new Date("2027-07-18T08:00:00.000Z"),
    ...teil,
  });

  it("zaehlt offene Aufgaben der Stelle, die nach `lastSentAt ?? sentAt` angelegt wurden", () => {
    expect(
      nachInfoNeuZaehlen(
        [
          aufgabe({}),
          aufgabe({ createdAt: "2027-07-19T08:00:00.000Z" }),
          // vor der Information, erledigt, andere Stelle, ohne Anlagezeit
          aufgabe({ createdAt: new Date("2027-07-01T08:00:00.000Z") }),
          aufgabe({ isCompleted: true }),
          aufgabe({ assigneeDepartment: "FACILITY" }),
          aufgabe({ createdAt: null }),
        ],
        [{ departmentKey: "IT", sentAt: informiert, lastSentAt: informiert }],
      ),
    ).toEqual({ IT: 2 });
  });

  it("„Erneut senden“ (lastSentAt danach) nimmt sie heraus; nur lastSentAt (sentAt nach gescheitertem Erneuern leer) zaehlt als informiert", () => {
    const spaeter = new Date("2027-07-20T08:00:00.000Z");
    expect(nachInfoNeuZaehlen([aufgabe({})], [{ departmentKey: "IT", sentAt: informiert, lastSentAt: spaeter }])).toEqual({});
    expect(nachInfoNeuZaehlen([aufgabe({})], [{ departmentKey: "IT", sentAt: null, lastSentAt: informiert }])).toEqual({ IT: 1 });
  });

  it("ohne Link oder ohne Versand nichts – die Stelle bekommt alles mit der ersten Mail", () => {
    expect(nachInfoNeuZaehlen([aufgabe({})], [])).toEqual({});
    expect(nachInfoNeuZaehlen([aufgabe({})], [{ departmentKey: "IT", sentAt: null, lastSentAt: null }])).toEqual({});
  });
});

describe("empfaengerEinrichtung (G12) – der alte Name bleibt", () => {
  it("dieselbe Funktion unter beiden Namen", () => {
    expect(onboardingEmpfaengerEinrichtung).toBe(empfaengerEinrichtung);
  });

  it("Offboarding: Arbeitsort aus der Zuordnung, sonst wie bisher die Einrichtung", () => {
    expect(empfaengerEinrichtung({ arbeitsortId: "org-gs", organizationId: "org-foerderverein" })).toBe("org-gs");
    expect(empfaengerEinrichtung({ arbeitsortId: null, organizationId: "org-gym" })).toBe("org-gym");
    expect(empfaengerEinrichtung({ organizationId: "org-gym" })).toBe("org-gym");
  });
});

describe("berichtMeldung: Nachtrag", () => {
  const it_ = { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org" };

  it("Erfolg mit gleichem bzw. neuem Link", () => {
    expect(berichtMeldung({ aktion: "nachtrag", versendet: [{ ...it_, status: "SENT" }], uebersprungen: [] }).meldung).toBe(
      "Nachtrag an IT-Abteilung gesendet. Der Link ist unverändert.",
    );
    expect(
      berichtMeldung({ aktion: "nachtrag", versendet: [{ ...it_, status: "SENT", neuerLink: true }], uebersprungen: [] })
        .meldung,
    ).toBe("Nachtrag mit neuem Link an IT-Abteilung (neue Adresse it@example.org) gesendet. Der bisherige Link ist ungültig.");
  });

  it("nichts nachzutragen: 409 mit Grund — kein Problem, aber auch kein Versand", () => {
    const b: VersandBericht = { aktion: "nachtrag", versendet: [], uebersprungen: [{ ...it_, grund: "KEIN_NACHTRAG" }] };
    expect(httpStatusAusBericht(b)).toBe(409);
    expect(berichtMeldung(b).meldung).toBe(
      "Nachtrag senden nicht möglich. IT-Abteilung: seit der letzten E-Mail nichts geändert – kein Nachtrag nötig.",
    );
    // Als „Problem“ zaehlt KEIN_NACHTRAG nicht (kein gelber Grund in der Zeile).
    expect(linkAnzeige(null, JETZT, { grund: "KEIN_NACHTRAG", offeneAufgaben: 1 }).status).toBe("NICHT_INFORMIERT");
  });
});

// =============================================
// Absage an die Stellen (Paket A3, S19; E-A20, F13, F17)
// =============================================

describe("absageInformiert / absageOffen / absageStand (E-A20)", () => {
  const it_ = { departmentKey: "IT", departmentName: "IT-Abteilung" };
  const fm = { departmentKey: "FACILITY", departmentName: "Facility Management" };
  const fk = { departmentKey: "VORGESETZTER", departmentName: "Führungskraft" };

  it("informiert heisst `sentAt ?? lastSentAt` — auch nach einem gescheiterten „Link erneuern“", () => {
    expect(absageInformiert({ ...it_, sentAt: tage(-5) })).toBe(true);
    expect(absageInformiert({ ...it_, sentAt: null, lastSentAt: tage(-6) })).toBe(true);
    expect(absageInformiert({ ...it_, sentAt: null, lastSentAt: null })).toBe(false);
    expect(absageInformiert({ ...it_, sentAt: "kein Datum" })).toBe(false);
  });

  it("offen heisst informiert und noch ohne Absage (F13)", () => {
    expect(absageOffen({ ...it_, sentAt: tage(-5), abgesagtAm: null })).toBe(true);
    expect(absageOffen({ ...it_, sentAt: tage(-5) })).toBe(true);
    expect(absageOffen({ ...it_, sentAt: tage(-5), abgesagtAm: tage(-1) })).toBe(false);
    expect(absageOffen({ ...it_, sentAt: null, abgesagtAm: null })).toBe(false);
  });

  it("nur bei EXPIRED und mit mindestens einer informierten Stelle", () => {
    const links = [{ ...it_, sentAt: tage(-5) }];
    for (const status of ["SUPERVISOR_SUBMITTED", "REVIEWED", "COMPLETED"]) {
      expect({ status, stand: absageStand({ status, links }) }).toEqual({ status, stand: null });
    }
    expect(absageStand({ status: "EXPIRED", links: [] })).toBeNull();
    expect(absageStand({ status: "EXPIRED", links: [{ ...it_, sentAt: null, lastSentAt: null }] })).toBeNull();
  });

  it("Stellen in der Reihenfolge der Karte (Fuehrungskraft zuletzt), Namen wie am Link, juengste Absage", () => {
    const stand = absageStand({
      status: "EXPIRED",
      links: [
        { ...fk, sentAt: tage(-5) },
        { ...fm, sentAt: null, lastSentAt: tage(-6), abgesagtAm: null },
        { ...it_, sentAt: tage(-5), abgesagtAm: null },
      ],
    });
    expect(stand).toEqual({ moeglich: true, stellen: ["IT-Abteilung", "Facility Management", "Führungskraft"], gesendetAm: null });

    const teilweise = absageStand({
      status: "EXPIRED",
      links: [
        { ...it_, sentAt: tage(-5), abgesagtAm: tage(-2) },
        { ...fm, sentAt: tage(-5), abgesagtAm: null },
        { ...fk, sentAt: tage(-5), abgesagtAm: tage(-1) },
      ],
    });
    expect(teilweise).toEqual({ moeglich: true, stellen: ["Facility Management"], gesendetAm: tage(-1).toISOString() });

    const fertig = absageStand({
      status: "EXPIRED",
      links: [{ ...it_, sentAt: tage(-5), abgesagtAm: tage(-2).toISOString() }],
    });
    expect(fertig).toEqual({ moeglich: false, stellen: [], gesendetAm: tage(-2).toISOString() });
  });
});

describe("absageEmpfaenger (F16)", () => {
  it("die zuletzt zugestellte Adresse — `link.email` nur, wenn die Mail an sie ging", () => {
    // Normalfall: zugestellt an die Adresse am Link.
    expect(absageEmpfaenger({ email: "it@example.org", zugestelltAn: "it@example.org" })).toBe("it@example.org");
    // Gross/klein und weitere An-Adressen der Zuweisungsvorlage: bleibt bei `email`.
    expect(absageEmpfaenger({ email: "IT@example.org", zugestelltAn: "it@example.org, it-leitung@example.org" })).toBe(
      "IT@example.org",
    );
    // Adresswechsel, Mail an die neue gescheitert: `email` bekam nie etwas.
    expect(absageEmpfaenger({ email: "it-neu@example.org", zugestelltAn: "it@example.org" })).toBe("it@example.org");
    expect(absageEmpfaenger({ email: "it-neu@example.org", zugestelltAn: "it@example.org; it-leitung@example.org" })).toBe(
      "it@example.org, it-leitung@example.org",
    );
  });

  it("ohne `zugestelltAn` (Bestand vor Paket 1b): `link.email`", () => {
    expect(absageEmpfaenger({ email: "it@example.org", zugestelltAn: null })).toBe("it@example.org");
    expect(absageEmpfaenger({ email: "it@example.org", zugestelltAn: " , " })).toBe("it@example.org");
    expect(absageEmpfaenger({ email: "it@example.org" })).toBe("it@example.org");
  });
});

describe("erledigteListeMailFelder (F17)", () => {
  it("Titel einzeilig, Klartext roh, HTML maskiert, Merker als Zeichenkette", () => {
    expect(erledigteListeMailFelder([{ title: "Konto anlegen" }, { title: "Schlüssel &\n<b>Chip</b>" }])).toEqual({
      erledigte_liste: "- Konto anlegen\n- Schlüssel & <b>Chip</b>",
      erledigte_liste_html:
        '<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
        '<li style="margin:0 0 4px;">Konto anlegen</li>' +
        '<li style="margin:0 0 4px;">Schlüssel &amp; &lt;b&gt;Chip&lt;/b&gt;</li>' +
        "</ul>",
      anzahl_erledigt: 2,
      hat_erledigte: "ja",
    });
  });

  it("ohne erledigte Aufgabe (oder nur mit leeren Titeln): alles leer, Merker leer", () => {
    const leer = { erledigte_liste: "", erledigte_liste_html: "", anzahl_erledigt: 0, hat_erledigte: "" };
    expect(erledigteListeMailFelder([])).toEqual(leer);
    expect(erledigteListeMailFelder([{ title: "  " }])).toEqual(leer);
  });
});

describe("berichtMeldung: Absage", () => {
  const it_ = { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org" };
  const fm = { departmentKey: "FACILITY", departmentName: "Facility Management", email: "fm@example.org" };

  it("Erfolg nennt die Stellen; eine nicht zugestellte steht als Hinweis „Absage nicht zugestellt“", () => {
    expect(berichtMeldung({ aktion: "absage", versendet: [{ ...it_, status: "SENT" }], uebersprungen: [] })).toEqual({
      meldung: "Absage an 1 Stelle gesendet: IT-Abteilung.",
      hinweis: null,
    });
    const teil: VersandBericht = {
      aktion: "absage",
      versendet: [{ ...it_, status: "SENT" }],
      uebersprungen: [{ ...fm, grund: "MAIL_FEHLGESCHLAGEN", detail: "Timeout" }],
    };
    expect(httpStatusAusBericht(teil)).toBe(201);
    expect(berichtMeldung(teil)).toEqual({
      meldung: "Absage an 1 Stelle gesendet: IT-Abteilung.",
      hinweis: "Absage nicht zugestellt: Facility Management (Versand fehlgeschlagen: Timeout).",
    });
  });

  it("zweiter Klick: 409 BEREITS_ABGESAGT — kein Problem, eigene Meldung", () => {
    const b: VersandBericht = {
      aktion: "absage",
      versendet: [],
      uebersprungen: [
        { ...it_, grund: "BEREITS_ABGESAGT" },
        { ...fm, grund: "BEREITS_ABGESAGT" },
      ],
    };
    expect(httpStatusAusBericht(b)).toBe(409);
    expect(berichtMeldung(b)).toEqual({ meldung: MELDUNGEN.ABSAGE_BEREITS_GESENDET, hinweis: null });
    expect(grundText("BEREITS_ABGESAGT")).toBe("Absage bereits gesendet");
    // Als „Problem“ zaehlt BEREITS_ABGESAGT nicht (kein gelber Grund in der Zeile).
    expect(linkAnzeige(null, JETZT, { grund: "BEREITS_ABGESAGT", offeneAufgaben: 1 }).status).toBe("NICHT_INFORMIERT");
  });

  it("niemand informiert: eigene Meldung; alle Mails gescheitert: 502 mit Grund je Stelle", () => {
    expect(berichtMeldung({ aktion: "absage", versendet: [], uebersprungen: [] }).meldung).toBe(
      MELDUNGEN.ABSAGE_NIEMAND_INFORMIERT,
    );
    const gescheitert: VersandBericht = {
      aktion: "absage",
      versendet: [],
      uebersprungen: [
        { ...it_, grund: "BEREITS_ABGESAGT" },
        { ...fm, grund: "MAIL_FEHLGESCHLAGEN", detail: "Timeout" },
      ],
    };
    expect(httpStatusAusBericht(gescheitert)).toBe(502);
    expect(berichtMeldung(gescheitert).meldung).toBe(
      "Absage nicht gesendet. Facility Management: Versand fehlgeschlagen: Timeout.",
    );
  });
});

