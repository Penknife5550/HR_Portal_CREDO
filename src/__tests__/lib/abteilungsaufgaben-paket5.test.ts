/**
 * Tests: Abteilungsaufgaben — reine Regeln und Validierung fuer Paket 5
 * (Onboarding): Zustaendigkeit aus Freitext, Faelligkeit ab Vertragsbeginn,
 * Datensparsamkeit (Zusatzfelder), Sperre ohne Modalitaeten, Vorschau fuer den
 * Dialog, gemeinsame Mailfelder des Onboardings und die Schemas fuer Portal
 * und Checklisten-Vorlagen.
 */

import {
  DEPARTMENT_LABELS,
  DEPARTMENT_KEYS,
} from "@/lib/constants";
import {
  MELDUNGEN,
  MODUL_TEXTE,
  ONBOARDING_ZUSATZFELDER,
  abteilungAusZustaendigkeit,
  abteilungsZeilenBauen,
  aufgabenlisteMailFelder,
  faelligkeitAus,
  istLinkAbteilung,
  istOffboardingVorlagenName,
  nachFaelligkeitSortiert,
  onboardingVersandSperre,
  sichtbarkeitsHinweis,
  zusatzWerte,
  zusatzfelderFuer,
  type AbteilungsKonfig,
} from "@/lib/abteilungsaufgaben";
import { onboardingAbteilungsMailFelder, onboardingAufgabenLink } from "@/lib/onboarding-abteilung-mail";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import {
  checklistenFehlerMeldung,
  checklistenPunktSchema,
  checklistenVorlageSchema,
  onboardingPortalAufgabePatchSchema,
} from "@/lib/validations/abteilungsaufgaben";

const JETZT = new Date("2026-09-22T08:00:00.000Z");

// =============================================
// Zustaendigkeit aus Freitext
// =============================================

describe("abteilungAusZustaendigkeit", () => {
  it.each([
    ["HR", "HR"],
    ["Personal", "HR"],
    ["Personalabteilung", "HR"],
    ["hr ", "HR"],
    ["IT", "IT"],
    ["it", "IT"],
    ["IT-Abteilung", "IT"],
    ["IT Support", "IT"],
    ["EDV-Abteilung", "IT"],
    ["Verwaltung", "VERWALTUNG"],
    ["Verw.", "VERWALTUNG"],
    ["Sekretariat", "VERWALTUNG"],
    ["Schulsekretariat", "VERWALTUNG"],
    ["Verwaltung / Sekretariat", "VERWALTUNG"],
    ["Vorgesetzter", "VORGESETZTER"],
    ["vorgesetzte", "VORGESETZTER"],
    ["Vorgesetzte(r)", "VORGESETZTER"],
    ["Führungskraft", "VORGESETZTER"],
    ["Fuehrungskraft", "VORGESETZTER"],
    ["Leitung", "VORGESETZTER"],
    ["Schulleitung", "VORGESETZTER"],
    ["Kita-Leitung", "VORGESETZTER"],
    ["Facility", "FACILITY"],
    ["Facility Management", "FACILITY"],
    ["Hausmeister", "FACILITY"],
    ["Buchhaltung", "BUCHHALTUNG"],
    ["Finanzbuchhaltung", "BUCHHALTUNG"],
    ["Datenschutz", "DSB"],
    ["Datenschutzbeauftragte/r", "DSB"],
    ["dsb", "DSB"],
    ["DSB", "DSB"],
    ["Mitarbeiter", "MITARBEITER"],
    ["Mitarbeiter/in", "MITARBEITER"],
    ["Mitarbeitende", "MITARBEITER"],
    ["EMPFANG", "EMPFANG"],
    ["EMPFANG_2", "EMPFANG_2"],
  ])("„%s“ → %s", (text, schluessel) => {
    expect(abteilungAusZustaendigkeit(text)).toBe(schluessel);
  });

  it("Unbekanntes und Leeres ergibt null", () => {
    expect(abteilungAusZustaendigkeit("Kantine")).toBeNull();
    expect(abteilungAusZustaendigkeit("X")).toBeNull();
    expect(abteilungAusZustaendigkeit("   ")).toBeNull();
    expect(abteilungAusZustaendigkeit(null)).toBeNull();
    expect(abteilungAusZustaendigkeit(undefined)).toBeNull();
  });

  it("jeder Anzeigename bildet sich auf seinen Schluessel ab", () => {
    for (const key of Object.values(DEPARTMENT_KEYS)) {
      expect(abteilungAusZustaendigkeit(DEPARTMENT_LABELS[key])).toBe(key);
    }
  });

  it("Link-Abteilung nur in Schluesselform — Freitext geht nie per Link hinaus", () => {
    expect(istLinkAbteilung("Hausmeister")).toBe(false);
    expect(istLinkAbteilung("Vorgesetzter")).toBe(false);
    expect(istLinkAbteilung("IT")).toBe(true);
  });

  it("Offboarding-Vorlage am Namen", () => {
    expect(istOffboardingVorlagenName("Offboarding: Standard-Offboarding")).toBe(true);
    expect(istOffboardingVorlagenName("  Offboarding:X")).toBe(true);
    expect(istOffboardingVorlagenName("Standard-Einstellung (TV-L)")).toBe(false);
    expect(istOffboardingVorlagenName(null)).toBe(false);
  });
});

// =============================================
// Faelligkeit
// =============================================

describe("faelligkeitAus", () => {
  const beginn = new Date("2026-10-01T00:00:00.000Z");

  it("Vertragsbeginn + Tage als UTC-Mitternacht; 0 bleibt 0; negativ = vorher", () => {
    expect(faelligkeitAus(beginn, -7)?.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(faelligkeitAus(beginn, 0)?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(faelligkeitAus(beginn, 42)?.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });

  it("ohne Tagesangabe oder ohne Bezug keine Faelligkeit", () => {
    expect(faelligkeitAus(beginn, null)).toBeNull();
    expect(faelligkeitAus(beginn, undefined)).toBeNull();
    expect(faelligkeitAus(null, 3)).toBeNull();
    expect(faelligkeitAus("kein Datum", 3)).toBeNull();
  });

  it("liest den Bezugstag in deutscher Zeit (deutsche Mitternacht bleibt derselbe Tag)", () => {
    expect(faelligkeitAus(new Date("2026-09-30T22:00:00.000Z"), 0)?.toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
    expect(faelligkeitAus("2026-10-01", -3)?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("ueber die Zeitumstellung (Ende Oktober) keine Verschiebung um einen Tag", () => {
    expect(faelligkeitAus(new Date("2026-10-20T00:00:00.000Z"), 14)?.toISOString()).toBe(
      "2026-11-03T00:00:00.000Z",
    );
  });
});

// =============================================
// Datensparsamkeit: Zusatzfelder
// =============================================

describe("Zusatzfelder im Onboarding", () => {
  const quelle = {
    stellenbezeichnung: " Lehrkraft Sek. I ",
    betriebsstaette: "Minden, Hauptstandort",
    fuehrungskraftEmail: "a.leitung@example.org",
  };

  it("folgt der Tabelle „Wer sieht was“", () => {
    expect(zusatzWerte("IT", quelle)).toEqual({
      stellenbezeichnung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
      ansprechpartner_email: "a.leitung@example.org",
    });
    expect(zusatzWerte("VERWALTUNG", quelle)).toEqual({
      betriebsstaette: "Minden, Hauptstandort",
      ansprechpartner_email: "a.leitung@example.org",
    });
    expect(zusatzWerte("FACILITY", quelle)).toEqual({
      betriebsstaette: "Minden, Hauptstandort",
      ansprechpartner_email: "a.leitung@example.org",
    });
    expect(zusatzWerte("DSB", quelle)).toEqual({ stellenbezeichnung: "Lehrkraft Sek. I" });
    expect(zusatzWerte("VORGESETZTER", quelle)).toEqual({
      stellenbezeichnung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
    });
  });

  it("Buchhaltung, eigene Schluessel, HR und MITARBEITER sehen nichts zusaetzlich — nicht einmal leere Felder", () => {
    for (const key of ["BUCHHALTUNG", "EMPFANG", "HR", "MITARBEITER", null]) {
      expect(zusatzWerte(key, quelle)).toEqual({});
      expect(zusatzfelderFuer(key)).toEqual([]);
    }
  });

  it("leere Werte fehlen", () => {
    expect(zusatzWerte("IT", { stellenbezeichnung: "  ", betriebsstaette: null })).toEqual({});
  });

  it("die Tabelle nennt keine Felder ausserhalb der drei erlaubten", () => {
    const felder = new Set(Object.values(ONBOARDING_ZUSATZFELDER).flat());
    expect([...felder].sort()).toEqual(["ansprechpartner_email", "betriebsstaette", "stellenbezeichnung"]);
  });

  it("Hinweis „Was die Empfänger sehen“ aus derselben Tabelle", () => {
    const h = sichtbarkeitsHinweis("ONBOARDING", [
      { departmentKey: "IT", departmentName: "IT-Abteilung" },
      { departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung" },
      { departmentKey: "IT", departmentName: "IT-Abteilung" },
    ]);
    expect(h.alle).toBe("Name, Einrichtung, Vorgangsnummer und Vertragsbeginn sowie ihre eigenen Aufgaben.");
    expect(h.zusaetzlich).toEqual([
      {
        departmentKey: "IT",
        departmentName: "IT-Abteilung",
        felder: ["Stellenbezeichnung", "Betriebsstätte", "Adresse der Führungskraft"],
      },
    ]);
    expect(h.hinweis).toBe("Keine Angaben aus dem Personalfragebogen.");
    expect(sichtbarkeitsHinweis("OFFBOARDING", [{ departmentKey: "IT", departmentName: "IT" }])).toEqual({
      alle: MODUL_TEXTE.OFFBOARDING.grunddaten,
      zusaetzlich: [],
      hinweis: null,
    });
  });
});

// =============================================
// Voraussetzung (Sperre ohne Modalitaeten)
// =============================================

describe("onboardingVersandSperre", () => {
  const beginn = new Date("2026-10-01T00:00:00.000Z");

  it("zwischengespeicherter Vertragsbeginn zaehlt nicht", () => {
    expect(
      onboardingVersandSperre({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: { vertragsbeginn: beginn } }),
    ).toEqual({ grund: "MODALITAETEN_FEHLEN", text: MELDUNGEN.MODALITAETEN_FEHLEN });
  });

  it("ohne Modalitaeten (Ehrenamt ohne Link) gesperrt, ohne Ersatzdatum", () => {
    expect(onboardingVersandSperre({ status: "SUBMITTED", supervisorData: null })?.grund).toBe("MODALITAETEN_FEHLEN");
  });

  it("eingereicht ohne Vertragsbeginn (Altfall) gesperrt mit eigenem Grund", () => {
    expect(
      onboardingVersandSperre({ status: "SUPERVISOR_SUBMITTED", supervisorSubmittedAt: JETZT, supervisorData: {} }),
    ).toEqual({ grund: "VERTRAGSBEGINN_FEHLT", text: MELDUNGEN.VERTRAGSBEGINN_FEHLT });
  });

  it("eingereicht (auch Altfall isComplete) mit Vertragsbeginn: frei", () => {
    expect(
      onboardingVersandSperre({ status: "IN_PROGRESS", supervisorSubmittedAt: JETZT, supervisorData: { vertragsbeginn: beginn } }),
    ).toBeNull();
    expect(
      onboardingVersandSperre({ status: "REVIEWED", supervisorData: { isComplete: true, vertragsbeginn: beginn } }),
    ).toBeNull();
  });
});

// =============================================
// Zeilen der Karte: Sperre, Vorschau, unbekannte Zustaendigkeit
// =============================================

describe("abteilungsZeilenBauen (Paket 5)", () => {
  const konfigs: AbteilungsKonfig[] = [
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@example.org", organizationId: null, isActive: true },
  ];
  const aufgaben = [
    { id: "a1", title: "Konto anlegen", description: "M365", assigneeDepartment: "IT", isCompleted: false, dueDate: new Date("2026-09-28T00:00:00Z") },
    { id: "a2", title: "Geraet", description: null, assigneeDepartment: "IT", isCompleted: false, dueDate: new Date("2026-09-24T00:00:00Z") },
    { id: "a3", title: "Ohne Frist", assigneeDepartment: "IT", isCompleted: false, dueDate: null },
    { id: "a4", title: "Erledigt", assigneeDepartment: "IT", isCompleted: true, dueDate: null },
    { id: "a5", title: "Hausmeister-Sache", assigneeDepartment: "Hausmeister", isCompleted: false, dueDate: null },
    { id: "a6", title: "HR", assigneeDepartment: "HR", isCompleted: false, dueDate: null },
  ];
  const basis = {
    aufgaben,
    links: [],
    konfigs,
    organizationId: "org-1",
    fuehrungskraft: null,
    vorgangAbgeschlossen: false,
    linkUrl: (t: string) => `https://hr.example.org/onboarding-tasks/${t}`,
    jetzt: JETZT,
  };

  it("Vorschau: offene Aufgaben in Mail-Reihenfolge, Hinweis, Gueltigkeit", () => {
    const { zeilen, informierbar } = abteilungsZeilenBauen(basis);
    expect(informierbar).toBe(1);
    expect(zeilen.map((z) => z.departmentKey)).toEqual(["IT"]);
    expect(zeilen[0].vorschau).toEqual({
      aufgaben: [
        { id: "a2", title: "Geraet", dueDate: "2026-09-24T00:00:00.000Z", description: null },
        { id: "a1", title: "Konto anlegen", dueDate: "2026-09-28T00:00:00.000Z", description: "M365" },
        { id: "a3", title: "Ohne Frist", dueDate: null, description: null },
      ],
      gueltigBis: new Date(JETZT.getTime() + 90 * 86_400_000).toISOString(),
    });
  });

  it("gesperrt: Zeilen zeigen Empfaenger und Aufgaben, aber nichts ist informierbar, keine Aktion, keine Vorschau", () => {
    const { zeilen, informierbar } = abteilungsZeilenBauen({ ...basis, gesperrt: true });
    expect(informierbar).toBe(0);
    expect(zeilen[0]).toMatchObject({
      email: "it@example.org",
      aufgaben: { gesamt: 4, offen: 3 },
      informierbar: false,
      vorschau: null,
      aktionen: { erinnern: false, erneutSenden: false, linkErneuern: false, linkKopieren: false },
    });
  });

  it("Freitext-Zustaendigkeit offener Aufgaben wird gemeldet, nicht als Abteilung gefuehrt", () => {
    const { zeilen, unbekannteZustaendigkeiten } = abteilungsZeilenBauen(basis);
    expect(unbekannteZustaendigkeiten).toEqual(["Hausmeister"]);
    expect(zeilen.some((z) => z.departmentKey === "Hausmeister")).toBe(false);
  });
});

// =============================================
// Mailfelder
// =============================================

describe("Aufgabenliste mit Hinweis", () => {
  it("Hinweis maskiert unter dem Titel; ohne Hinweis wie in Paket 1b", () => {
    const f = aufgabenlisteMailFelder([
      { title: "Konto <anlegen>", dueDate: new Date("2026-09-24T00:00:00Z"), description: "M365 & <b>Lizenz</b>" },
      { title: "Schlüssel", dueDate: null },
    ]);
    expect(f.aufgabenliste).toBe("- Konto <anlegen> – fällig 24.09.2026\n  M365 & <b>Lizenz</b>\n- Schlüssel");
    expect(f.aufgabenliste_html).toContain(
      'Konto &lt;anlegen&gt; – fällig 24.09.2026<br><span style="color:#6b7280;font-size:13px;">M365 &amp; &lt;b&gt;Lizenz&lt;/b&gt;</span></li>',
    );
    expect(f.aufgabenliste_html).toContain('<li style="margin:0 0 4px;">Schlüssel</li>');
  });

  it("Sortierung ist stabil und stellt Aufgaben ohne Frist ans Ende", () => {
    const sortiert = nachFaelligkeitSortiert([
      { id: 1, dueDate: null },
      { id: 2, dueDate: "2026-10-02T00:00:00Z" },
      { id: 3, dueDate: "2026-10-01T00:00:00Z" },
      { id: 4, dueDate: null },
    ]);
    expect(sortiert.map((s) => s.id)).toEqual([3, 2, 1, 4]);
  });
});

describe("onboardingAbteilungsMailFelder", () => {
  const basis = {
    id: "0123456789abcdef",
    displayId: "ONB-2026-031",
    organization: { name: "FES Minden", mandantNumber: "01" },
    supervisorData: { vertragsbeginn: new Date("2026-10-01T00:00:00.000Z") },
  };

  it("Name aus dem Fragebogen, sonst vom Vorgang; Vertragsbeginn formatiert", () => {
    expect(
      onboardingAbteilungsMailFelder({ ...basis, firstName: "A", lastName: "B", personalData: { firstName: "Anna", lastName: "Beispiel" } }),
    ).toEqual({
      onboardingId: "0123456789abcdef",
      displayId: "ONB-2026-031",
      vorname: "Anna",
      nachname: "Beispiel",
      mitarbeiter_name: "Anna Beispiel",
      employeeName: "Anna Beispiel",
      organization: "FES Minden",
      organizationName: "FES Minden",
      einrichtung: "FES Minden",
      mandantNumber: "01",
      contractStartDate: "2026-10-01T00:00:00.000Z",
      vertragsbeginn: "01.10.2026",
    });
  });

  it("ohne Namen die neutrale Bezeichnung — nie leer, nie eine Adresse; kein email-Feld", () => {
    const f = onboardingAbteilungsMailFelder({ ...basis, displayId: null, personalData: null });
    expect(f.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
    expect(f.employeeName).toBe(MITARBEITER_NEUTRAL);
    expect(f.displayId).toBe("01234567");
    expect(f).not.toHaveProperty("email");
    expect(JSON.stringify(f)).not.toContain("@");
  });

  it("ohne Vertragsbeginn leere Datumsfelder", () => {
    const f = onboardingAbteilungsMailFelder({ ...basis, supervisorData: null });
    expect(f.vertragsbeginn).toBe("");
    expect(f.contractStartDate).toBe("");
  });

  it("Link auf /onboarding-tasks/<token> aus APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://hr.example.org";
    expect(onboardingAufgabenLink("tok")).toBe("https://hr.example.org/onboarding-tasks/tok");
  });
});

// =============================================
// Validierung
// =============================================

describe("onboardingPortalAufgabePatchSchema", () => {
  it("nimmt Status, Notiz, Zustaendigkeit (Schluessel) und Faelligkeit", () => {
    expect(onboardingPortalAufgabePatchSchema.parse({ isCompleted: true })).toEqual({ isCompleted: true });
    expect(onboardingPortalAufgabePatchSchema.parse({ assignee: " IT ", dueDate: "2026-10-01" })).toEqual({
      assignee: "IT",
      dueDate: "2026-10-01",
    });
    expect(onboardingPortalAufgabePatchSchema.parse({ assignee: "", dueDate: "" })).toEqual({
      assignee: null,
      dueDate: null,
    });
  });

  it("weist Freitext, falsches Datum, leeren und kaputten Body deutsch ab", () => {
    expect(onboardingPortalAufgabePatchSchema.safeParse({ assignee: "Vorgesetzter" }).success).toBe(false);
    expect(onboardingPortalAufgabePatchSchema.safeParse({ dueDate: "2026-02-31" }).success).toBe(false);
    expect(onboardingPortalAufgabePatchSchema.safeParse({ dueDate: "01.10.2026" }).success).toBe(false);
    const leer = onboardingPortalAufgabePatchSchema.safeParse({});
    expect(!leer.success && leer.error.errors[0].message).toBe("Mindestens ein Feld erforderlich.");
    const kaputt = onboardingPortalAufgabePatchSchema.safeParse(undefined);
    expect(!kaputt.success && kaputt.error.errors[0].message).toBe(MELDUNGEN.UNGUELTIGE_EINGABE);
  });

  it("wirft unbekannte Felder weg (kein roher Body mehr im Protokoll)", () => {
    expect(onboardingPortalAufgabePatchSchema.parse({ notes: "x", completedById: "u-fremd" })).toEqual({ notes: "x" });
  });
});

describe("Checklisten-Vorlagen", () => {
  const punkt = { title: " Konto anlegen ", category: "Vor Arbeitsbeginn", defaultDueDays: -7, defaultAssignee: "IT" };

  it("Punkt: Schluessel, Hinweis bis 500 Zeichen, Leeres wird null", () => {
    expect(checklistenPunktSchema.parse({ ...punkt, description: "  " })).toEqual({
      title: "Konto anlegen",
      category: "Vor Arbeitsbeginn",
      defaultDueDays: -7,
      defaultAssignee: "IT",
      description: null,
    });
    expect(checklistenPunktSchema.parse({ ...punkt, defaultAssignee: "" }).defaultAssignee).toBeNull();
    expect(checklistenPunktSchema.safeParse({ ...punkt, description: "x".repeat(501) }).success).toBe(false);
    expect(checklistenPunktSchema.safeParse({ ...punkt, description: "x".repeat(500) }).success).toBe(true);
    expect(checklistenPunktSchema.safeParse({ ...punkt, defaultDueDays: 1.5 }).success).toBe(false);
  });

  it("Freitext-Altwert wird mit Nummer des Punkts abgewiesen", () => {
    const r = checklistenVorlageSchema.safeParse({
      name: "Standard",
      items: [punkt, { ...punkt, defaultAssignee: "Hausmeister" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(checklistenFehlerMeldung(r.error)).toBe(
        "Punkt 2: Die Zuständigkeit „Hausmeister“ ist unbekannt – bitte in der Auswahl zuordnen.",
      );
    }
  });

  it("Vorlage: mindestens ein Punkt, keine doppelten IDs, Fragebogentyp aus der Liste", () => {
    expect(checklistenVorlageSchema.safeParse({ name: "X", items: [] }).success).toBe(false);
    expect(
      checklistenVorlageSchema.safeParse({ name: "X", items: [{ ...punkt, id: "p1" }, { ...punkt, id: "p1" }] }).success,
    ).toBe(false);
    expect(checklistenVorlageSchema.safeParse({ name: "X", questionnaireType: "BEAMTE", items: [punkt] }).success).toBe(true);
    expect(checklistenVorlageSchema.parse({ name: "X", questionnaireType: "", items: [punkt] }).questionnaireType).toBeNull();
    expect(checklistenVorlageSchema.safeParse({ name: "X", questionnaireType: "GIBTESNICHT", items: [punkt] }).success).toBe(false);
  });
});
