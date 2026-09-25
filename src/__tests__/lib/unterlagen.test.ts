/**
 * Tests: Unterlagen nachfordern — die reinen Regeln (src/lib/unterlagen.ts)
 *
 * Ohne Datenbank und ohne Uhr: Jede Funktion bekommt `heute` bzw. `jetzt`. Die
 * Faelle folgen der Feinplanung (docs/module/onboarding/paket4-feinplanung.md,
 * Abschnitt 13): jeder erlaubte und verbotene Uebergang, Aktionen je Zustand
 * und Vorgangsstatus, der Merker „vollständig" nach der Tabelle in 2.1, die
 * Link-Gueltigkeit (Tag 14 gueltig, Tag 15 nicht, kein Wiederaufleben), die
 * Pille, der Lauf-Waechter ohne Fehlalarm, der Info-Satz des Dialogs und die
 * Eingabepruefung.
 *
 * Die Geschichte der Beispiele: angefordert Mo 14.09.2026, Frist Fr 25.09.2026,
 * Link gueltig bis Fr 09.10.2026. „Heute" ist Mo 21.09.2026, 10:00 Uhr Berlin.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  AKTION_MELDUNGEN,
  ANLASS_LABELS,
  DATEI_STATUS,
  FRIST_MAX_TAGE,
  GUELTIG_NACH_FRIST_TAGE,
  LINK_ANLAESSE,
  MAX_POSITIONEN,
  MELDUNGEN,
  NACHFORDERUNG_STATUS,
  POSITION_STATUS,
  UNTERLAGEN_AUDIT,
  UNTERLAGEN_AUDIT_LABELS,
  aktionsTexte,
  dateiUebergang,
  dialogErinnerungsSatz,
  eingabePruefen,
  erinnerungFaellig,
  erlaubteAktionen,
  erneutSendenSperreBis,
  erneutSendenStatus,
  fortschrittText,
  fristGrenzen,
  fristPruefen,
  fristText,
  fristWochenendeHinweis,
  hochladenErlaubt,
  istWochenende,
  laufWaechter,
  laufWaechterText,
  laufendSchluessel,
  linkGueltig,
  linkGueltigBisFuer,
  linkLebt,
  linkende,
  loeschenAbBerechnen,
  mailWarnung,
  meldungLinkAbgelaufen,
  meldungVorlage,
  nachforderungLinkende,
  nachforderungUebergang,
  nachweisStandText,
  oeffentlicherFristSatz,
  pdfHinweisTexte,
  pdfHinweiseLesen,
  pdfHinweiseSpeichern,
  personenStand,
  positionUebergang,
  ruecknahmeFristOffen,
  tokenFormatGueltig,
  uebersichtBauen,
  unterlagenPille,
  vollstaendigMerker,
  zaehlen,
  zurueckweisenFrist,
  zurueckweisenFristPruefen,
  UEBERGANGS_MELDUNGEN,
  type DateiEingabe,
  type ErinnerungsStand,
  type LinkEingabe,
  type NachforderungEingabe,
  type PositionEingabe,
  type PositionsEreignis,
  type PositionsKontext,
  type UnterlagenUebersicht,
  type WaechterStand,
} from "@/lib/unterlagen";
import { VORLAGE_DEAKTIVIERT_DETAIL } from "@/lib/abteilungsaufgaben";
import { tageSpaeter } from "@/lib/kalendertag";

// =============================================
// Testdaten
// =============================================

/** Mo 21.09.2026, 10:00 Uhr in Berlin. */
const JETZT = new Date("2026-09-21T08:00:00.000Z");
const HEUTE = "2026-09-21";
/** Fr 25.09.2026 — als `@db.Date` kommt sie als Mitternacht UTC. */
const FRIST = "2026-09-25";
const FRIST_DB = new Date(`${FRIST}T00:00:00.000Z`);
const LINKENDE = "2026-10-09";

const DATEI_URL = (id: string) => `/api/onboarding/v1/unterlagen/dateien/${id}`;

function datei(teil: Partial<DateiEingabe> = {}): DateiEingabe {
  return {
    id: "d-vorne",
    status: "EINGEREICHT",
    anzeigeName: "titel-vorne.jpg",
    mimeType: "image/jpeg",
    groesse: 1_153_434,
    pdfHinweise: null,
    einreichungNr: 1,
    uebermitteltAm: new Date("2026-09-15T08:00:00.000Z"),
    entschiedenAm: null,
    speicherPfad: "uploads/unterlagen/n1/d-vorne.jpg",
    uebernahmeZiel: null,
    uebernommenId: null,
    uebernommenAm: null,
    loeschenAb: null,
    dateiGeloeschtAm: null,
    ...teil,
  };
}

function position(teil: Partial<PositionEingabe> = {}): PositionEingabe {
  return {
    id: "p-titel",
    reihenfolge: 1,
    typ: "AUFENTHALTSTITEL",
    bezeichnung: "Aufenthaltstitel",
    hinweis: null,
    originalErforderlich: false,
    sensibel: true,
    fristpflichtig: true,
    status: "ANGEFORDERT",
    einreichungen: 0,
    gueltigBisAngabe: null,
    angefordertAm: new Date("2026-09-14T07:00:00.000Z"),
    uebermitteltAm: null,
    begruendung: null,
    entfaelltNotiz: null,
    entschiedenAm: null,
    entschiedenVonName: null,
    dateien: [],
    ...teil,
  };
}

/** Eine Mail von HR; Mails des Laufs tragen `erstelltVonId: null`. */
function link(teil: Partial<LinkEingabe> = {}): LinkEingabe {
  return {
    anlass: "ANFORDERUNG",
    mailStatus: "SENT",
    mailDetail: null,
    gesendetAm: new Date("2026-09-14T07:00:05.000Z"),
    nachholVersuche: 0,
    erstelltVonId: "u-hr",
    createdAt: new Date("2026-09-14T07:00:00.000Z"),
    ...teil,
  };
}

function nachforderung(teil: Partial<NachforderungEingabe> = {}): NachforderungEingabe {
  return {
    id: "n1",
    modul: "ONBOARDING",
    status: "LAUFEND",
    empfaenger: "anna.beispiel@example.org",
    empfaengerAbweichend: false,
    frist: FRIST_DB,
    nachricht: null,
    angefordertAm: new Date("2026-09-14T07:00:00.000Z"),
    angefordertVonName: "Erika Muster",
    erinnertFuerFrist: null,
    erinnertStufe: null,
    erledigtAm: null,
    zurueckgezogenAm: null,
    positionen: [position()],
    links: [link()],
    ...teil,
  };
}

function kontext(teil: Partial<PositionsKontext> = {}): PositionsKontext {
  return { nachforderungStatus: "LAUFEND", vorgangEingestellt: false, heute: HEUTE, ...teil };
}

/**
 * Onboarding: Der Modul-Baustein meldet `vorgangEingestellt` nur bei EXPIRED
 * (EP-3). COMPLETED und REVIEWED sind KEIN Hindernis — nachfordern laesst sich
 * auch nach dem Abschluss, etwa ein verlaengerter Aufenthaltstitel (P:1446).
 */
const eingestellt = (vorgangStatus: string) => vorgangStatus === "EXPIRED";

// =============================================
// Konstanten und Zustaende
// =============================================

describe("Zustände, Anlässe, Schlüssel", () => {
  it("die Zustände stehen wie im Schema-Kommentar (3.2)", () => {
    expect(NACHFORDERUNG_STATUS).toEqual(["LAUFEND", "ERLEDIGT", "ZURUECKGEZOGEN"]);
    expect(POSITION_STATUS).toEqual(["ANGEFORDERT", "EINGEREICHT", "ANGENOMMEN", "ZURUECKGEWIESEN", "ENTFAELLT"]);
    expect(DATEI_STATUS).toEqual(["ENTWURF", "EINGEREICHT", "ANGENOMMEN", "ZURUECKGEWIESEN", "VERWORFEN"]);
    expect(LINK_ANLAESSE).toEqual([
      "ANFORDERUNG",
      "ERGAENZUNG",
      "ERNEUT",
      "FRISTAENDERUNG",
      "ZURUECKWEISUNG",
      "ERINNERUNG_VORAB",
      "ERINNERUNG_FRISTTAG",
    ]);
    for (const anlass of LINK_ANLAESSE) expect(ANLASS_LABELS[anlass]).toBeTruthy();
  });

  it("der Schema-Kommentar nennt genau diese Werte", () => {
    // Zustaende sind Strings, keine Enums (3.1) — die Liste im Schema ist nur
    // ein Kommentar. Er darf nicht von den Konstanten abweichen.
    const schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain(`// ${NACHFORDERUNG_STATUS.join(" | ")}`);
    expect(schema).toContain(`// ${POSITION_STATUS.join("|")}`);
    expect(schema).toContain(`// ${DATEI_STATUS.join("|")}`);
    expect(schema).toContain(`// ${LINK_ANLAESSE.join("|")}`);
  });

  it("laufendSchluessel ist „<MODUL>:<vorgangId>“", () => {
    expect(laufendSchluessel("ONBOARDING", "abc")).toBe("ONBOARDING:abc");
  });
});

// =============================================
// Uebergaenge der Nachforderung (2.1)
// =============================================

describe("Übergänge der Nachforderung", () => {
  const stand = { vorgangEingestellt: false };

  it("Anlegen: → LAUFEND, außer bei eingestelltem Vorgang oder laufender Nachforderung", () => {
    expect(nachforderungUebergang("ANLEGEN", { ...stand, status: null })).toEqual({ erlaubt: true, nach: "LAUFEND" });
    expect(nachforderungUebergang("ANLEGEN", { status: null, vorgangEingestellt: true })).toMatchObject({
      erlaubt: false,
      grund: "HR_VORGANG_EINGESTELLT",
      meldung: MELDUNGEN.HR_VORGANG_EINGESTELLT,
    });
    expect(nachforderungUebergang("ANLEGEN", { ...stand, status: null, andereLaufend: true })).toMatchObject({
      erlaubt: false,
      grund: "LAEUFT_BEREITS",
      meldung: MELDUNGEN.LAEUFT_BEREITS,
    });
  });

  it.each(["ERGAENZEN", "FRIST_AENDERN", "ERNEUT_SENDEN"] as const)(
    "%s: nur LAUFEND bleibt LAUFEND, nie bei eingestelltem Vorgang (EP-3)",
    (ereignis) => {
      expect(nachforderungUebergang(ereignis, { ...stand, status: "LAUFEND" })).toEqual({
        erlaubt: true,
        nach: "LAUFEND",
      });
      for (const status of ["ERLEDIGT", "ZURUECKGEZOGEN"]) {
        expect(nachforderungUebergang(ereignis, { ...stand, status })).toMatchObject({ grund: "NICHT_LAUFEND" });
      }
      expect(nachforderungUebergang(ereignis, { status: "LAUFEND", vorgangEingestellt: true })).toMatchObject({
        grund: "HR_VORGANG_EINGESTELLT",
      });
    },
  );

  it("Abschließen: erst, wenn jede Position angenommen ist oder entfällt", () => {
    expect(
      nachforderungUebergang("ABSCHLIESSEN", {
        ...stand,
        status: "LAUFEND",
        positionen: [{ status: "ANGENOMMEN" }, { status: "ENTFAELLT" }],
      }),
    ).toEqual({ erlaubt: true, nach: "ERLEDIGT" });
    for (const offen of ["ANGEFORDERT", "EINGEREICHT", "ZURUECKGEWIESEN"]) {
      expect(
        nachforderungUebergang("ABSCHLIESSEN", {
          ...stand,
          status: "LAUFEND",
          positionen: [{ status: "ANGENOMMEN" }, { status: offen }],
        }),
      ).toMatchObject({ grund: "NICHT_ABSCHLIESSBAR" });
    }
    expect(nachforderungUebergang("ABSCHLIESSEN", { ...stand, status: "LAUFEND", positionen: [] })).toMatchObject({
      grund: "NICHT_ABSCHLIESSBAR",
    });
    expect(
      nachforderungUebergang("ABSCHLIESSEN", { ...stand, status: "ERLEDIGT", positionen: [{ status: "ANGENOMMEN" }] }),
    ).toMatchObject({ grund: "NICHT_LAUFEND" });
  });

  it("Zurückziehen: jede laufende, auch bei eingestelltem Vorgang; ZURUECKGEZOGEN ist Endzustand", () => {
    expect(nachforderungUebergang("ZURUECKZIEHEN", { status: "LAUFEND", vorgangEingestellt: true })).toEqual({
      erlaubt: true,
      nach: "ZURUECKGEZOGEN",
    });
    expect(nachforderungUebergang("ZURUECKZIEHEN", { ...stand, status: "ERLEDIGT" })).toMatchObject({
      grund: "NICHT_LAUFEND",
    });
    expect(nachforderungUebergang("ZURUECKZIEHEN", { ...stand, status: "ZURUECKGEZOGEN" })).toMatchObject({
      grund: "NICHT_LAUFEND",
    });
  });

  it("Wiederöffnen (Annahme zurücknehmen): ERLEDIGT → LAUFEND nur ohne andere laufende, nie aus ZURUECKGEZOGEN", () => {
    expect(nachforderungUebergang("WIEDEROEFFNEN", { ...stand, status: "ERLEDIGT" })).toEqual({
      erlaubt: true,
      nach: "LAUFEND",
    });
    expect(nachforderungUebergang("WIEDEROEFFNEN", { ...stand, status: "LAUFEND" })).toEqual({
      erlaubt: true,
      nach: "LAUFEND",
    });
    expect(nachforderungUebergang("WIEDEROEFFNEN", { ...stand, status: "ERLEDIGT", andereLaufend: true })).toMatchObject({
      grund: "ANDERE_LAEUFT",
      meldung: MELDUNGEN.ANDERE_LAEUFT,
    });
    expect(nachforderungUebergang("WIEDEROEFFNEN", { ...stand, status: "ZURUECKGEZOGEN" })).toMatchObject({
      grund: "RUECKNAHME_ZURUECKGEZOGEN",
    });
    // Auch bei eingestelltem Vorgang: Die Ruecknahme verschickt nichts (EP-3).
    expect(nachforderungUebergang("WIEDEROEFFNEN", { status: "ERLEDIGT", vorgangEingestellt: true })).toMatchObject({
      erlaubt: true,
    });
  });
});

// =============================================
// Uebergaenge der Position (2.2)
// =============================================

describe("Übergänge der Position", () => {
  /** Erwartung je Ereignis und Ausgangszustand (Nachforderung LAUFEND, Vorgang bearbeitet). */
  const TABELLE: Record<PositionsEreignis, Record<string, string>> = {
    UEBERMITTELN: {
      ANGEFORDERT: "EINGEREICHT",
      ZURUECKGEWIESEN: "EINGEREICHT",
      EINGEREICHT: "NICHT_OFFEN",
      ANGENOMMEN: "NICHT_OFFEN",
      // 5.5: eigener 409-Text „Diese Unterlage wird nicht mehr benötigt".
      ENTFAELLT: "UNTERLAGE_ENTFAELLT",
    },
    ANNEHMEN: {
      EINGEREICHT: "ANGENOMMEN",
      ANGEFORDERT: "NICHT_ZU_PRUEFEN",
      ZURUECKGEWIESEN: "NICHT_ZU_PRUEFEN",
      ANGENOMMEN: "NICHT_ZU_PRUEFEN",
      ENTFAELLT: "NICHT_ZU_PRUEFEN",
    },
    ZURUECKWEISEN: {
      EINGEREICHT: "ZURUECKGEWIESEN",
      ANGEFORDERT: "NICHT_ZU_PRUEFEN",
      ZURUECKGEWIESEN: "NICHT_ZU_PRUEFEN",
      ANGENOMMEN: "NICHT_ZU_PRUEFEN",
      ENTFAELLT: "NICHT_ZU_PRUEFEN",
    },
    ENTFAELLT: {
      ANGEFORDERT: "ENTFAELLT",
      ZURUECKGEWIESEN: "ENTFAELLT",
      EINGEREICHT: "ENTFAELLT",
      ANGENOMMEN: "NICHT_ENTFAELLBAR",
      ENTFAELLT: "NICHT_ENTFAELLBAR",
    },
    REAKTIVIEREN: {
      ENTFAELLT: "ANGEFORDERT",
      ANGEFORDERT: "NICHT_REAKTIVIERBAR",
      ZURUECKGEWIESEN: "NICHT_REAKTIVIERBAR",
      EINGEREICHT: "NICHT_REAKTIVIERBAR",
      ANGENOMMEN: "NICHT_REAKTIVIERBAR",
    },
    ANNAHME_ZURUECKNEHMEN: {
      ANGENOMMEN: "EINGEREICHT",
      ANGEFORDERT: "NICHT_ANGENOMMEN",
      ZURUECKGEWIESEN: "NICHT_ANGENOMMEN",
      EINGEREICHT: "NICHT_ANGENOMMEN",
      ENTFAELLT: "NICHT_ANGENOMMEN",
    },
  };

  const faelle = Object.entries(TABELLE).flatMap(([ereignis, zeilen]) =>
    Object.entries(zeilen).map(([von, erwartet]) => [ereignis as PositionsEreignis, von, erwartet] as const),
  );

  it.each(faelle)("%s aus %s → %s", (ereignis, von, erwartet) => {
    const ergebnis = positionUebergang(
      ereignis,
      von,
      kontext({ entwuerfe: 1, entschiedenAm: new Date("2026-09-16T08:00:00.000Z") }),
    );
    if ((POSITION_STATUS as readonly string[]).includes(erwartet)) {
      expect(ergebnis).toEqual({ erlaubt: true, nach: erwartet });
    } else {
      expect(ergebnis).toMatchObject({ erlaubt: false, grund: erwartet });
      expect(ergebnis.erlaubt === false && ergebnis.meldung).toBeTruthy();
    }
  });

  it("eine schon angeforderte Art: beim Reaktivieren derselbe Text wie beim Ergänzen", () => {
    expect(positionUebergang("REAKTIVIEREN", "ANGEFORDERT", kontext())).toMatchObject({
      grund: "NICHT_REAKTIVIERBAR",
      meldung: MELDUNGEN.BEREITS_ANGEFORDERT,
    });
    expect(UEBERGANGS_MELDUNGEN.NICHT_REAKTIVIERBAR).toBe(MELDUNGEN.BEREITS_ANGEFORDERT);
  });

  it("Übermitteln verlangt mindestens eine Entwurfsdatei", () => {
    expect(positionUebergang("UEBERMITTELN", "ANGEFORDERT", kontext({ entwuerfe: 0 }))).toMatchObject({
      grund: "NICHTS_BEREIT",
      meldung: MELDUNGEN.NICHTS_ZU_UEBERMITTELN,
    });
  });

  it("außer der Rücknahme verlangt jede Aktion von HR eine LAUFENDE Nachforderung", () => {
    for (const status of ["ERLEDIGT", "ZURUECKGEZOGEN"]) {
      for (const ereignis of ["ANNEHMEN", "ZURUECKWEISEN", "ENTFAELLT", "REAKTIVIEREN"] as const) {
        expect(
          positionUebergang(ereignis, "EINGEREICHT", kontext({ nachforderungStatus: status, entwuerfe: 1 })),
        ).toMatchObject({ grund: "NICHT_LAUFEND" });
      }
    }
  });

  it("bei eingestelltem Vorgang (EXPIRED) nur, was keine Mail an die Person auslöst (EP-3)", () => {
    const k = kontext({ vorgangEingestellt: true, entschiedenAm: new Date("2026-09-16T08:00:00.000Z") });
    expect(positionUebergang("ANNEHMEN", "EINGEREICHT", k)).toMatchObject({ erlaubt: true });
    expect(positionUebergang("ENTFAELLT", "EINGEREICHT", k)).toMatchObject({ erlaubt: true });
    expect(positionUebergang("ANNAHME_ZURUECKNEHMEN", "ANGENOMMEN", k)).toMatchObject({ erlaubt: true });
    expect(positionUebergang("ZURUECKWEISEN", "EINGEREICHT", k)).toMatchObject({
      grund: "HR_VORGANG_EINGESTELLT",
      meldung: MELDUNGEN.HR_VORGANG_EINGESTELLT,
    });
    expect(positionUebergang("REAKTIVIEREN", "ENTFAELLT", k)).toMatchObject({ grund: "HR_VORGANG_EINGESTELLT" });
  });

  describe("Schritt der Person: nur Texte der Upload-Seite (5.5)", () => {
    const personenTexte = new Set<string>([
      MELDUNGEN.LINK_UNGUELTIG,
      MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN,
      MELDUNGEN.VORGANG_EINGESTELLT,
      MELDUNGEN.ALLES_GEPRUEFT,
      MELDUNGEN.UNTERLAGE_ENTFAELLT,
      MELDUNGEN.UNTERLAGE_NICHT_OFFEN,
      MELDUNGEN.NICHTS_ZU_UEBERMITTELN,
    ]);

    it("Nachforderung und Vorgang in der Reihenfolge von linkGueltig", () => {
      const uebermitteln = (teil: Partial<PositionsKontext>) =>
        positionUebergang("UEBERMITTELN", "ANGEFORDERT", kontext({ entwuerfe: 1, ...teil }));
      expect(uebermitteln({ nachforderungStatus: "ZURUECKGEZOGEN", vorgangEingestellt: true })).toMatchObject({
        grund: "ANFORDERUNG_ZURUECKGEZOGEN",
        meldung: MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN,
      });
      // EXPIRED: der oeffentliche 410-Text, nie der Text fuer HR.
      expect(uebermitteln({ vorgangEingestellt: true })).toMatchObject({
        grund: "VORGANG_EINGESTELLT",
        meldung: MELDUNGEN.VORGANG_EINGESTELLT,
      });
      expect(uebermitteln({ nachforderungStatus: "ERLEDIGT" })).toMatchObject({
        grund: "ALLES_GEPRUEFT",
        meldung: MELDUNGEN.ALLES_GEPRUEFT,
      });
      expect(uebermitteln({ nachforderungStatus: "KAPUTT" })).toMatchObject({ grund: "LINK_UNGUELTIG" });
    });

    it("jede Ablehnung beim Übermitteln trägt einen Text der Upload-Seite", () => {
      for (const nachforderungStatus of ["LAUFEND", "ERLEDIGT", "ZURUECKGEZOGEN", "KAPUTT"]) {
        for (const vorgangEingestellt of [false, true]) {
          for (const von of POSITION_STATUS) {
            for (const entwuerfe of [0, 1]) {
              const e = positionUebergang("UEBERMITTELN", von, kontext({ nachforderungStatus, vorgangEingestellt, entwuerfe }));
              if (!e.erlaubt) expect(personenTexte.has(e.meldung)).toBe(true);
            }
          }
        }
      }
    });

    it("hochladenErlaubt: dieselbe Prüfung für Hochladen, „Gültig bis“ und Übermitteln", () => {
      const k = { nachforderungStatus: "LAUFEND", vorgangEingestellt: false };
      expect(hochladenErlaubt("ANGEFORDERT", k)).toEqual({ erlaubt: true });
      expect(hochladenErlaubt("ZURUECKGEWIESEN", k)).toEqual({ erlaubt: true });
      expect(hochladenErlaubt("ENTFAELLT", k)).toMatchObject({
        grund: "UNTERLAGE_ENTFAELLT",
        meldung: "Diese Unterlage wird nicht mehr benötigt.",
      });
      for (const von of ["EINGEREICHT", "ANGENOMMEN"]) {
        expect(hochladenErlaubt(von, k)).toMatchObject({ grund: "NICHT_OFFEN", meldung: MELDUNGEN.UNTERLAGE_NICHT_OFFEN });
      }
      expect(hochladenErlaubt("ANGEFORDERT", { ...k, vorgangEingestellt: true })).toMatchObject({
        meldung: MELDUNGEN.VORGANG_EINGESTELLT,
      });
    });
  });

  describe("Annahme zurücknehmen (E-3)", () => {
    it("höchstens 30 Tage nach der Annahme, in Berliner Kalendertagen", () => {
      // 22.08. 00:30 Berlin = 21.08. 22:30 UTC. Nach UTC-Tag waeren es 31 Tage.
      const kurzNachMitternacht = new Date("2026-08-21T22:30:00.000Z");
      expect(ruecknahmeFristOffen(kurzNachMitternacht, HEUTE)).toBe(true);
      expect(
        positionUebergang("ANNAHME_ZURUECKNEHMEN", "ANGENOMMEN", kontext({ entschiedenAm: kurzNachMitternacht })),
      ).toEqual({ erlaubt: true, nach: "EINGEREICHT" });

      const tag31 = new Date("2026-08-21T10:00:00.000Z");
      expect(
        positionUebergang("ANNAHME_ZURUECKNEHMEN", "ANGENOMMEN", kontext({ entschiedenAm: tag31 })),
      ).toMatchObject({ grund: "RUECKNAHME_ZU_SPAET", meldung: MELDUNGEN.RUECKNAHME_ZU_SPAET });
      expect(
        positionUebergang("ANNAHME_ZURUECKNEHMEN", "ANGENOMMEN", kontext({ entschiedenAm: null })),
      ).toMatchObject({ grund: "RUECKNAHME_ZU_SPAET" });
    });

    it("aus ERLEDIGT nur ohne andere laufende Nachforderung", () => {
      const am = new Date("2026-09-16T08:00:00.000Z");
      expect(
        positionUebergang("ANNAHME_ZURUECKNEHMEN", "ANGENOMMEN", kontext({ nachforderungStatus: "ERLEDIGT", entschiedenAm: am })),
      ).toEqual({ erlaubt: true, nach: "EINGEREICHT" });
      expect(
        positionUebergang(
          "ANNAHME_ZURUECKNEHMEN",
          "ANGENOMMEN",
          kontext({ nachforderungStatus: "ERLEDIGT", entschiedenAm: am, andereLaufend: true }),
        ),
      ).toMatchObject({ grund: "ANDERE_LAEUFT" });
    });

    it("nie bei einer zurückgezogenen Nachforderung — auch innerhalb der 30 Tage", () => {
      expect(
        positionUebergang(
          "ANNAHME_ZURUECKNEHMEN",
          "ANGENOMMEN",
          kontext({ nachforderungStatus: "ZURUECKGEZOGEN", entschiedenAm: new Date("2026-09-20T08:00:00.000Z") }),
        ),
      ).toMatchObject({ grund: "RUECKNAHME_ZURUECKGEZOGEN", meldung: MELDUNGEN.RUECKNAHME_ZURUECKGEZOGEN });
    });
  });
});

// =============================================
// Uebergaenge der Datei (2.3)
// =============================================

describe("Übergänge der Datei", () => {
  it("die Person entfernt nur Entwürfe — Zeile und Datei verschwinden", () => {
    expect(dateiUebergang("ENTFERNEN", "ENTWURF")).toEqual({ erlaubt: true, nach: "GELOESCHT" });
    for (const von of ["EINGEREICHT", "ANGENOMMEN", "ZURUECKGEWIESEN", "VERWORFEN"]) {
      expect(dateiUebergang("ENTFERNEN", von)).toMatchObject({
        grund: "NICHT_ENTFERNBAR",
        meldung: MELDUNGEN.DATEI_NICHT_ENTFERNBAR,
      });
    }
  });

  it("Entfällt/Zurückziehen: Entwürfe weg, eingereichte VERWORFEN, der Rest bleibt", () => {
    expect(dateiUebergang("VERWERFEN", "ENTWURF")).toEqual({ erlaubt: true, nach: "GELOESCHT" });
    expect(dateiUebergang("VERWERFEN", "EINGEREICHT")).toEqual({ erlaubt: true, nach: "VERWORFEN" });
    for (const von of ["ANGENOMMEN", "ZURUECKGEWIESEN", "VERWORFEN"]) {
      expect(dateiUebergang("VERWERFEN", von)).toMatchObject({ grund: "UNBERUEHRT" });
    }
  });

  it("Übermitteln, Annehmen, Zurückweisen und Rücknahme betreffen nur ihren Ausgangszustand", () => {
    expect(dateiUebergang("UEBERMITTELN", "ENTWURF")).toEqual({ erlaubt: true, nach: "EINGEREICHT" });
    expect(dateiUebergang("ANNEHMEN", "EINGEREICHT")).toEqual({ erlaubt: true, nach: "ANGENOMMEN" });
    expect(dateiUebergang("ZURUECKWEISEN", "EINGEREICHT")).toEqual({ erlaubt: true, nach: "ZURUECKGEWIESEN" });
    expect(dateiUebergang("ANNAHME_ZURUECKNEHMEN", "ANGENOMMEN")).toEqual({ erlaubt: true, nach: "EINGEREICHT" });
    // Die zurueckgewiesene Datei der ersten Runde bleibt beim Annehmen der zweiten.
    expect(dateiUebergang("ANNEHMEN", "ZURUECKGEWIESEN")).toMatchObject({ grund: "UNBERUEHRT" });
    expect(dateiUebergang("UEBERMITTELN", "ZURUECKGEWIESEN")).toMatchObject({ grund: "UNBERUEHRT" });
  });

  it("gelöscht wird 30 Tage nach dem Ereignis", () => {
    expect(loeschenAbBerechnen(JETZT).toISOString()).toBe("2026-10-21T08:00:00.000Z");
  });
});

// =============================================
// Merker „vollständig" (2.1, EP-17)
// =============================================

describe("vollstaendigMerker nach der Tabelle in 2.1", () => {
  const T0 = new Date("2026-09-15T08:00:00.000Z");
  const GEMELDET = new Date("2026-09-15T08:00:30.000Z");
  const leer = { vollstaendigSeit: null, vollstaendigGemeldetAm: null };
  const gesetzt = { vollstaendigSeit: T0, vollstaendigGemeldetAm: GEMELDET };
  const nachher = (...status: string[]) => status.map((s) => ({ status: s }));

  it("Person übermittelt, danach wartet nichts mehr → seit = jetzt, gemeldet = null", () => {
    expect(
      vollstaendigMerker("UEBERMITTELT", { ...leer, positionenNachher: nachher("EINGEREICHT", "ANGENOMMEN"), jetzt: JETZT }),
    ).toEqual({ vollstaendigSeit: JETZT, vollstaendigGemeldetAm: null });
  });

  it("Person übermittelt, es wartet noch etwas → unverändert", () => {
    expect(
      vollstaendigMerker("UEBERMITTELT", { ...leer, positionenNachher: nachher("EINGEREICHT", "ANGEFORDERT"), jetzt: JETZT }),
    ).toEqual(leer);
    expect(
      vollstaendigMerker("UEBERMITTELT", { ...leer, positionenNachher: nachher("EINGEREICHT", "ZURUECKGEWIESEN"), jetzt: JETZT }),
    ).toEqual(leer);
  });

  it.each(["ZURUECKGEWIESEN", "ERGAENZT", "ERLEDIGT", "ZURUECKGEZOGEN"] as const)("%s → beide null", (ereignis) => {
    expect(vollstaendigMerker(ereignis, { ...gesetzt, positionenNachher: nachher("EINGEREICHT"), jetzt: JETZT })).toEqual(
      leer,
    );
  });

  it.each(["FRIST_GEAENDERT", "ERNEUT_GESENDET", "ANNAHME_ZURUECKGENOMMEN"] as const)("%s → unverändert", (ereignis) => {
    expect(vollstaendigMerker(ereignis, { ...gesetzt, positionenNachher: nachher("EINGEREICHT"), jetzt: JETZT })).toEqual(
      gesetzt,
    );
    expect(vollstaendigMerker(ereignis, { ...leer, positionenNachher: nachher("EINGEREICHT"), jetzt: JETZT })).toEqual(leer);
  });

  it("Annehmen oder Entfällt ohne Abschluss → unverändert, mit Abschluss (ERLEDIGT) → null", () => {
    for (const ereignis of ["ANGENOMMEN", "ENTFAELLT"] as const) {
      expect(
        vollstaendigMerker(ereignis, { ...gesetzt, positionenNachher: nachher("ANGENOMMEN", "EINGEREICHT"), jetzt: JETZT }),
      ).toEqual(gesetzt);
      expect(
        vollstaendigMerker(ereignis, { ...gesetzt, positionenNachher: nachher("ANGENOMMEN", "ENTFAELLT"), jetzt: JETZT }),
      ).toEqual(leer);
    }
  });

  it("die zweite Runde nach einer Zurückweisung meldet erneut", () => {
    // Runde 1: alles uebermittelt → Merker gesetzt, HR-Mail beansprucht ihn.
    let m = vollstaendigMerker("UEBERMITTELT", { ...leer, positionenNachher: nachher("EINGEREICHT"), jetzt: T0 });
    expect(m.vollstaendigSeit).toEqual(T0);
    m = { ...m, vollstaendigGemeldetAm: GEMELDET };
    // HR weist zurueck → beide Merker leer.
    m = vollstaendigMerker("ZURUECKGEWIESEN", { ...m, positionenNachher: nachher("ZURUECKGEWIESEN"), jetzt: T0 });
    expect(m).toEqual(leer);
    // Runde 2: neue Uebermittlung setzt `seit` neu, `gemeldet` ist frei → die Mail geht erneut.
    m = vollstaendigMerker("UEBERMITTELT", { ...m, positionenNachher: nachher("EINGEREICHT"), jetzt: JETZT });
    expect(m).toEqual({ vollstaendigSeit: JETZT, vollstaendigGemeldetAm: null });
  });

  it("„Entfällt“ und Rücknahme melden nicht — auch wenn danach nichts mehr auf die Person wartet", () => {
    // Eine Unterlage zu pruefen, die andere wartet → HR setzt die wartende auf
    // „Entfällt". Die Nachforderung ist jetzt „vollständig eingegangen", aber
    // HR bekommt keine Mail ueber die eigene Aktion.
    const nachEntfaellt = vollstaendigMerker("ENTFAELLT", {
      ...leer,
      positionenNachher: nachher("EINGEREICHT", "ENTFAELLT"),
      jetzt: JETZT,
    });
    expect(nachEntfaellt).toEqual(leer);
    // Ruecknahme nach ERLEDIGT: die Merker sind leer und bleiben es.
    const nachRuecknahme = vollstaendigMerker("ANNAHME_ZURUECKGENOMMEN", {
      ...leer,
      positionenNachher: nachher("EINGEREICHT"),
      jetzt: JETZT,
    });
    expect(nachRuecknahme).toEqual(leer);
  });

  it("nimmt JSON-Text wie Date", () => {
    expect(
      vollstaendigMerker("FRIST_GEAENDERT", {
        vollstaendigSeit: T0.toISOString(),
        vollstaendigGemeldetAm: null,
        positionenNachher: [],
        jetzt: JETZT,
      }),
    ).toEqual({ vollstaendigSeit: T0, vollstaendigGemeldetAm: null });
  });
});

// =============================================
// Link und Token (2.4, 5.1)
// =============================================

describe("Link-Gültigkeit", () => {
  const lebenderLink = { entwertetAm: null, entwertetGrund: null, gueltigBis: new Date(`${LINKENDE}T00:00:00.000Z`) };
  const laufend = { status: "LAUFEND", frist: FRIST_DB };
  const pruefe = (heute: string, teil: Partial<Parameters<typeof linkGueltig>[0]> = {}) =>
    linkGueltig({ link: lebenderLink, nachforderung: laufend, vorgangEingestellt: false, heute, ...teil });

  it("gilt bis Frist + 14 einschließlich: Tag 14 gültig, Tag 15 nicht", () => {
    expect(linkGueltigBisFuer(FRIST)).toBe(LINKENDE);
    expect(GUELTIG_NACH_FRIST_TAGE).toBe(14);
    expect(pruefe(LINKENDE)).toMatchObject({ gueltig: true, status: 200, readOnly: false, linkende: LINKENDE });
    const tag15 = pruefe(tageSpaeter(FRIST, 15));
    expect(tag15).toEqual({
      gueltig: false,
      status: 410,
      schluessel: "LINK_ABGELAUFEN",
      meldung: "Dieser Link war bis 09.10.2026 gültig. Bitte wenden Sie sich an die Personalabteilung.",
      linkende: LINKENDE,
    });
  });

  it("ein fortgeschriebener Link lebt weiter, ein nicht fortgeschriebener nicht (5.1)", () => {
    // Am 12.10. verlaengert HR die Frist auf den 20.10. Link A lebte noch
    // (Frist davor: 30.09., Linkende 14.10.) und wurde fortgeschrieben; Link B
    // war schon am 09.10. abgelaufen und bleibt es.
    const alteFrist = "2026-09-30";
    const neueFrist = "2026-10-20";
    const linkA = { ...lebenderLink, gueltigBis: new Date(`${linkGueltigBisFuer(alteFrist)}T00:00:00.000Z`) };
    const linkB = { ...lebenderLink, gueltigBis: new Date(`${LINKENDE}T00:00:00.000Z`) };
    expect(linkLebt(linkA, alteFrist, "2026-10-12")).toBe(true);
    expect(linkLebt(linkB, alteFrist, "2026-10-12")).toBe(false);

    const fortgeschrieben = { ...linkA, gueltigBis: new Date(`${linkGueltigBisFuer(neueFrist)}T00:00:00.000Z`) };
    const nachher = { status: "LAUFEND", frist: new Date(`${neueFrist}T00:00:00.000Z`) };
    expect(pruefe("2026-10-15", { link: fortgeschrieben, nachforderung: nachher })).toMatchObject({ gueltig: true });
    expect(pruefe("2026-10-15", { link: linkB, nachforderung: nachher })).toMatchObject({
      gueltig: false,
      status: 410,
      linkende: LINKENDE,
    });
  });

  it("eine Rücknahme belebt keinen toten Link", () => {
    // ERLEDIGT → LAUFEND ueber „Annahme zurücknehmen"; Frist und gueltigBis
    // bleiben, wie sie waren.
    expect(pruefe("2026-10-12", { nachforderung: { status: "ERLEDIGT", frist: FRIST_DB } })).toMatchObject({
      status: 410,
    });
    expect(pruefe("2026-10-12", { nachforderung: { status: "LAUFEND", frist: FRIST_DB } })).toMatchObject({
      status: 410,
      schluessel: "LINK_ABGELAUFEN",
    });
  });

  it("eine verkürzte Frist kürzt auch einen weiter reichenden Link: min(gueltigBis, Frist + 14)", () => {
    const langerLink = { ...lebenderLink, gueltigBis: new Date("2026-11-30T00:00:00.000Z") };
    expect(linkende(langerLink, FRIST_DB)).toBe(LINKENDE);
    expect(pruefe("2026-10-10", { link: langerLink })).toMatchObject({ status: 410 });
  });

  it("entwertet wegen Adresswechsel → 404 „ungültig“, über „frühere sperren“ → 410 „ersetzt“", () => {
    const entwertet = { entwertetAm: new Date("2026-09-18T08:00:00.000Z"), gueltigBis: lebenderLink.gueltigBis };
    expect(pruefe(HEUTE, { link: { ...entwertet, entwertetGrund: "ADRESSE" } })).toEqual({
      gueltig: false,
      status: 404,
      schluessel: "LINK_UNGUELTIG",
      meldung: MELDUNGEN.LINK_UNGUELTIG,
      linkende: null,
    });
    expect(pruefe(HEUTE, { link: { ...entwertet, entwertetGrund: "GESPERRT" } })).toMatchObject({
      status: 410,
      schluessel: "LINK_ERSETZT",
      meldung: MELDUNGEN.LINK_ERSETZT,
    });
    // Unbekannter Grund: lieber 404 als eine Auskunft.
    expect(pruefe(HEUTE, { link: { ...entwertet, entwertetGrund: null } })).toMatchObject({ status: 404 });
  });

  it("zurückgezogen, Vorgang eingestellt → 410 mit eigenem Text und ohne Datum", () => {
    expect(pruefe(HEUTE, { nachforderung: { status: "ZURUECKGEZOGEN", frist: FRIST_DB } })).toEqual({
      gueltig: false,
      status: 410,
      schluessel: "ANFORDERUNG_ZURUECKGEZOGEN",
      meldung: MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN,
      linkende: null,
    });
    expect(pruefe(HEUTE, { vorgangEingestellt: eingestellt("EXPIRED") })).toMatchObject({
      status: 410,
      schluessel: "VORGANG_EINGESTELLT",
      linkende: null,
    });
    expect(pruefe(HEUTE, { vorgangEingestellt: eingestellt("COMPLETED") })).toMatchObject({ status: 200 });
  });

  it("ERLEDIGT innerhalb des Linkendes → 200 nur lesend mit Dank", () => {
    expect(pruefe(HEUTE, { nachforderung: { status: "ERLEDIGT", frist: FRIST_DB } })).toEqual({
      gueltig: true,
      status: 200,
      readOnly: true,
      schluessel: "ALLES_GEPRUEFT",
      meldung: "Alle Unterlagen sind eingegangen und geprüft. Vielen Dank.",
      linkende: LINKENDE,
    });
  });

  it("unbekannter Status oder unlesbare Daten → 404", () => {
    expect(pruefe(HEUTE, { nachforderung: { status: "KAPUTT", frist: FRIST_DB } })).toMatchObject({ status: 404 });
    expect(pruefe(HEUTE, { link: { ...lebenderLink, gueltigBis: "unlesbar" } })).toMatchObject({ status: 404 });
  });

  it("nimmt JSON-Text (ISO) wie Prisma-Date", () => {
    expect(nachforderungLinkende(FRIST_DB.toISOString())).toBe(LINKENDE);
    expect(linkende({ gueltigBis: `${LINKENDE}T00:00:00.000Z` }, FRIST)).toBe(LINKENDE);
  });

  it("die 410-Antwort verrät nichts außer Meldung und Linkende", () => {
    const ergebnis = pruefe("2026-10-10");
    expect(Object.keys(ergebnis).sort()).toEqual(["gueltig", "linkende", "meldung", "schluessel", "status"]);
  });

  it("meldungLinkAbgelaufen fällt ohne Datum auf den allgemeinen Text zurück", () => {
    expect(meldungLinkAbgelaufen(null)).toBe(MELDUNGEN.LINK_ABGELAUFEN);
    expect(meldungLinkAbgelaufen("2026-10-09")).toContain("bis 09.10.2026 gültig");
  });
});

describe("Tokenformat (UUID v4, Kleinbuchstaben)", () => {
  it("nimmt randomUUID() an", () => {
    for (let i = 0; i < 20; i++) expect(tokenFormatGueltig(randomUUID())).toBe(true);
  });

  it.each([
    ["Großbuchstaben", "3F2504E0-4F89-41D3-9A0C-0305E82C3301"],
    ["Version 1", "3f2504e0-4f89-11d3-9a0c-0305e82c3301"],
    ["falsche Variante", "3f2504e0-4f89-41d3-7a0c-0305e82c3301"],
    ["Leerzeichen", " 3f2504e0-4f89-41d3-9a0c-0305e82c3301"],
    ["Pfad", "../3f2504e0-4f89-41d3-9a0c-0305e82c3301"],
    ["zu kurz", "3f2504e0-4f89-41d3-9a0c"],
    ["leer", ""],
  ])("lehnt %s ab", (_name, token) => {
    expect(tokenFormatGueltig(token)).toBe(false);
  });

  it("lehnt Nicht-Zeichenketten ab", () => {
    expect(tokenFormatGueltig(undefined)).toBe(false);
    expect(tokenFormatGueltig(null)).toBe(false);
    expect(tokenFormatGueltig(42)).toBe(false);
  });
});

// =============================================
// Frist (EP-1, EP-5, EP-16)
// =============================================

describe("Frist", () => {
  it("Grenzen: morgen bis heute + 90, Vorschlag heute + 14 (EP-5)", () => {
    expect(fristGrenzen(HEUTE)).toEqual({ min: "2026-09-22", max: tageSpaeter(HEUTE, 90), vorschlag: "2026-10-05" });
    expect(FRIST_MAX_TAGE).toBe(90);
  });

  it.each([
    ["", "FRIST_FEHLT"],
    ["25.09.2026", "FRIST_UNGUELTIG"],
    ["2026-02-30", "FRIST_UNGUELTIG"],
    [HEUTE, "FRIST_ZU_FRUEH"],
    ["2026-09-20", "FRIST_ZU_FRUEH"],
    [tageSpaeter(HEUTE, 91), "FRIST_ZU_SPAET"],
  ])("fristPruefen(%j) → %s", (roh, grund) => {
    expect(fristPruefen(roh, HEUTE)).toMatchObject({ ok: false, grund });
  });

  it("morgen und heute + 90 sind erlaubt, auch am Wochenende", () => {
    expect(fristPruefen("2026-09-22", HEUTE)).toEqual({ ok: true, tag: "2026-09-22" });
    expect(fristPruefen(` ${tageSpaeter(HEUTE, 90)} `, HEUTE)).toEqual({ ok: true, tag: tageSpaeter(HEUTE, 90) });
    expect(fristPruefen("2026-09-26", HEUTE)).toMatchObject({ ok: true });
  });

  it("der 26.09.2026 ist ein Samstag, kein Freitag (P:1342)", () => {
    expect(istWochenende("2026-09-26")).toBe(true);
    expect(istWochenende("2026-09-27")).toBe(true);
    expect(istWochenende(FRIST)).toBe(false);
    expect(fristWochenendeHinweis("2026-09-26")).toBe(
      "Die Frist fällt auf einen Samstag. Das ist erlaubt – die Person kann auch am Wochenende hochladen.",
    );
    expect(fristWochenendeHinweis("2026-09-27")).toContain("Sonntag");
    expect(fristWochenendeHinweis(FRIST)).toBeNull();
  });

  it("fristText: Restlaufzeit, dann Linkende", () => {
    expect(fristText(FRIST, HEUTE)).toBe("Freitag, 25.09.2026 · noch 4 Tage");
    expect(fristText(FRIST, "2026-09-24")).toBe("Freitag, 25.09.2026 · noch 1 Tag");
    expect(fristText(FRIST, FRIST)).toBe("Freitag, 25.09.2026 · endet heute");
    expect(fristText(FRIST, "2026-09-26")).toBe("Freitag, 25.09.2026 · verstrichen, Link noch bis 09.10.2026 nutzbar");
    expect(fristText(FRIST, "2026-10-10")).toBe("Freitag, 25.09.2026 · verstrichen, Link abgelaufen");
  });

  describe("dialogErinnerungsSatz", () => {
    it("ab 8 Tagen: 7 Tage vorher und am Fristtag", () => {
      expect(dialogErinnerungsSatz(tageSpaeter(HEUTE, 8), HEUTE)).toBe(
        "Die Person wird 7 Tage vorher und am Fristtag automatisch erinnert. Ist die Frist verstrichen, erhalten Sie eine E-Mail. Der Link bleibt danach noch 14 Tage nutzbar.",
      );
    });

    it("unter 8 Tagen entfällt „7 Tage vorher“ (KO-K3)", () => {
      for (const tage of [1, 4, 7]) {
        const satz = dialogErinnerungsSatz(tageSpaeter(HEUTE, tage), HEUTE);
        expect(satz).toBe(
          "Die Person wird am Fristtag automatisch erinnert. Ist die Frist verstrichen, erhalten Sie eine E-Mail. Der Link bleibt danach noch 14 Tage nutzbar.",
        );
      }
    });

    it("sagt nur zu, was der Lauf auch tut — gegen erinnerungFaellig gerechnet", () => {
      // Die Mail des Dialogs geht HEUTE hinaus. Fuer jede Frist von morgen bis
      // heute + 20: Verspricht der Satz „7 Tage vorher", muss erinnerungFaellig
      // an einem Tag vor der Frist VORAB liefern — und umgekehrt.
      const gesendetHeute = { mailStatus: "SENT", gesendetAm: JETZT };
      for (let tage = 1; tage <= 20; tage++) {
        const frist = tageSpaeter(HEUTE, tage);
        const stand: ErinnerungsStand = {
          status: "LAUFEND",
          frist: new Date(`${frist}T00:00:00.000Z`),
          erinnertFuerFrist: null,
          erinnertStufe: null,
          positionen: [{ status: "ANGEFORDERT" }],
          links: [gesendetHeute],
        };
        let vorab = false;
        for (let d = 1; d < tage; d++) {
          if (erinnerungFaellig(stand, tageSpaeter(HEUTE, d)) === "VORAB") vorab = true;
        }
        expect([tage, dialogErinnerungsSatz(frist, HEUTE).includes("7 Tage vorher")]).toEqual([tage, vorab]);
        expect(erinnerungFaellig(stand, frist)).toBe("FRISTTAG");
      }
    });

    it("bei bestehender Frist: heute, verstrichen, Link abgelaufen", () => {
      expect(dialogErinnerungsSatz(HEUTE, HEUTE)).toContain("endet heute");
      expect(dialogErinnerungsSatz("2026-09-18", HEUTE)).toBe(
        "Die Frist ist verstrichen. Der Link bleibt noch bis 02.10.2026 nutzbar; eine Erinnerung geht nicht mehr hinaus.",
      );
      expect(dialogErinnerungsSatz("2026-09-01", HEUTE)).toContain("Bitte wählen Sie eine neue Frist.");
    });
  });

  it("Zurückweisen (EP-1): bisherige Frist nur ab 7 Tagen Abstand, sonst heute + 7; nach dem Linkende Pflicht", () => {
    expect(zurueckweisenFrist("2026-09-28", HEUTE)).toEqual({ vorschlag: "2026-09-28", pflicht: false });
    expect(zurueckweisenFrist(FRIST, HEUTE)).toEqual({ vorschlag: "2026-09-28", pflicht: false });
    expect(zurueckweisenFrist(FRIST, LINKENDE)).toEqual({ vorschlag: "2026-10-16", pflicht: false });
    expect(zurueckweisenFrist(FRIST, "2026-10-10")).toEqual({ vorschlag: "2026-10-17", pflicht: true });
  });

  it("Zurückweisen auf dem Server (EP-1): ohne Frist nach dem Linkende 409 — mit eigenem Text, nicht „zuerst die Frist ändern“", () => {
    expect(zurueckweisenFristPruefen(undefined, FRIST, HEUTE)).toEqual({ ok: true, frist: null });
    expect(zurueckweisenFristPruefen("  ", FRIST, LINKENDE)).toEqual({ ok: true, frist: null });
    const tot = zurueckweisenFristPruefen(null, FRIST, "2026-10-10");
    expect(tot).toEqual({
      ok: false,
      status: 409,
      grund: "ZURUECKWEISEN_FRIST_NOETIG",
      meldung: MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG,
    });
    // Die Meldung schickt HR nicht in eine eigene Friständerung (zweite Mail).
    expect(MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG).not.toBe(MELDUNGEN.ZUERST_FRIST_AENDERN);
    expect(MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG).not.toContain("zuerst");
    expect(MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG).toContain("mit der Zurückweisung in einer E-Mail");
    // Eine angegebene Frist gilt, in den Grenzen von EP-5 (sonst 400).
    expect(zurueckweisenFristPruefen("2026-10-20", FRIST, "2026-10-10")).toEqual({ ok: true, frist: "2026-10-20" });
    expect(zurueckweisenFristPruefen("2026-10-10", FRIST, "2026-10-10")).toMatchObject({
      ok: false,
      status: 400,
      grund: "FRIST_ZU_FRUEH",
    });
  });

  it("Upload-Seite: vor der Frist nur die Frist, danach das Linkende (5.3)", () => {
    expect(oeffentlicherFristSatz(FRIST, LINKENDE, HEUTE)).toBe(
      "Bitte laden Sie die Unterlagen bis Freitag, 25.09.2026 hoch.",
    );
    expect(oeffentlicherFristSatz(FRIST, LINKENDE, FRIST)).not.toContain("09.10.2026");
    expect(oeffentlicherFristSatz(FRIST, LINKENDE, "2026-09-26")).toBe(
      "Die Frist ist abgelaufen. Sie können die Unterlagen noch bis Freitag, 09.10.2026 hochladen.",
    );
  });
});

// =============================================
// Eingabe von „Anfordern" und „Ergänzen"
// =============================================

describe("eingabePruefen", () => {
  const KATALOG = ["AUFENTHALTSTITEL", "ARBEITSERLAUBNIS", "MASERNSCHUTZ", "ABSCHLUSSZEUGNIS", "SONSTIGES"];
  const frist = tageSpaeter(HEUTE, 14);

  it("nimmt eine gültige Anforderung an", () => {
    expect(
      eingabePruefen(
        { aktion: "anfordern", frist, positionen: [{ typ: "AUFENTHALTSTITEL" }, { typ: null }, { typ: null }] },
        { heute: HEUTE, katalog: KATALOG },
      ),
    ).toEqual({ ok: true, frist, reaktivieren: [], neu: 3 });
  });

  it("Frist: Pflicht beim Anfordern, Grenzen nach EP-5 (400)", () => {
    const pos = [{ typ: "ARBEITSERLAUBNIS" }];
    expect(eingabePruefen({ aktion: "anfordern", positionen: pos }, { heute: HEUTE, katalog: KATALOG })).toMatchObject({
      ok: false,
      status: 400,
      grund: "FRIST_FEHLT",
    });
    expect(
      eingabePruefen({ aktion: "anfordern", frist: HEUTE, positionen: pos }, { heute: HEUTE, katalog: KATALOG }),
    ).toMatchObject({ status: 400, grund: "FRIST_ZU_FRUEH" });
    expect(
      eingabePruefen(
        { aktion: "anfordern", frist: tageSpaeter(HEUTE, 91), positionen: pos },
        { heute: HEUTE, katalog: KATALOG },
      ),
    ).toMatchObject({ status: 400, grund: "FRIST_ZU_SPAET", meldung: MELDUNGEN.FRIST_ZU_SPAET });
  });

  it("SONSTIGES ist als Katalogart nie anforderbar — auch wenn der Katalog es führt (400)", () => {
    expect(
      eingabePruefen({ aktion: "anfordern", frist, positionen: [{ typ: "SONSTIGES" }] }, { heute: HEUTE, katalog: KATALOG }),
    ).toMatchObject({ ok: false, status: 400, grund: "SAMMELART", meldung: MELDUNGEN.SAMMELART });
  });

  it("unbekannte Art 400, doppelte Art 409", () => {
    expect(
      eingabePruefen({ aktion: "anfordern", frist, positionen: [{ typ: "GIBT_ES_NICHT" }] }, { heute: HEUTE, katalog: KATALOG }),
    ).toMatchObject({ status: 400, grund: "TYP_UNBEKANNT" });
    expect(
      eingabePruefen(
        { aktion: "anfordern", frist, positionen: [{ typ: "MASERNSCHUTZ" }, { typ: null }, { typ: "MASERNSCHUTZ" }] },
        { heute: HEUTE, katalog: KATALOG },
      ),
    ).toMatchObject({ status: 409, grund: "DOPPELT" });
  });

  it("keine Position 400; höchstens 30 Positionen, freie Zeilen nicht eigens begrenzt (EP-15)", () => {
    expect(eingabePruefen({ aktion: "anfordern", frist, positionen: [] }, { heute: HEUTE, katalog: KATALOG })).toMatchObject(
      { status: 400, grund: "KEINE_POSITION" },
    );
    const frei = (n: number) => Array.from({ length: n }, () => ({ typ: null }));
    expect(
      eingabePruefen({ aktion: "anfordern", frist, positionen: frei(MAX_POSITIONEN) }, { heute: HEUTE, katalog: KATALOG }),
    ).toMatchObject({ ok: true, neu: 30 });
    expect(
      eingabePruefen({ aktion: "anfordern", frist, positionen: frei(MAX_POSITIONEN + 1) }, { heute: HEUTE, katalog: KATALOG }),
    ).toMatchObject({ status: 400, grund: "ZU_VIELE_POSITIONEN" });
  });

  describe("Ergänzen", () => {
    const bestehend = [
      { typ: "AUFENTHALTSTITEL", status: "EINGEREICHT" },
      { typ: "MASERNSCHUTZ", status: "ENTFAELLT" },
      { typ: null, status: "ANGEFORDERT" },
    ];

    it("Frist optional, solange sie nicht verstrichen ist", () => {
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: "ARBEITSERLAUBNIS" }] },
          { heute: HEUTE, katalog: KATALOG, bestehend, bisherigeFrist: FRIST },
        ),
      ).toEqual({ ok: true, frist: null, reaktivieren: [], neu: 1 });
    });

    it("nach Fristablauf ohne neue Frist → 409", () => {
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: "ARBEITSERLAUBNIS" }] },
          { heute: "2026-09-26", katalog: KATALOG, bestehend, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ ok: false, status: 409, grund: "NEUE_FRIST_NOETIG" });
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", frist: "2026-10-10", positionen: [{ typ: "ARBEITSERLAUBNIS" }] },
          { heute: "2026-09-26", katalog: KATALOG, bestehend, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ ok: true, frist: "2026-10-10" });
    });

    it("eine schon angeforderte Art → 409, eine entfallene wird wieder aktiv", () => {
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: "AUFENTHALTSTITEL" }] },
          { heute: HEUTE, katalog: KATALOG, bestehend, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ status: 409, grund: "BEREITS_ANGEFORDERT" });
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: "MASERNSCHUTZ" }] },
          { heute: HEUTE, katalog: KATALOG, bestehend, bisherigeFrist: FRIST },
        ),
      ).toEqual({ ok: true, frist: null, reaktivieren: ["MASERNSCHUTZ"], neu: 0 });
    });

    it("zählt die bestehenden Positionen mit: mehr als 30 → 409", () => {
      const voll = Array.from({ length: 29 }, () => ({ typ: null, status: "ANGEFORDERT" }));
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: null }] },
          { heute: HEUTE, katalog: KATALOG, bestehend: voll, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ ok: true, neu: 1 });
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: null }, { typ: null }] },
          { heute: HEUTE, katalog: KATALOG, bestehend: voll, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ ok: false, status: 409, grund: "ZU_VIELE_POSITIONEN" });
      // Das Reaktivieren belegt keinen neuen Platz.
      const mitEntfallen = [...voll, { typ: "MASERNSCHUTZ", status: "ENTFAELLT" }];
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [{ typ: "MASERNSCHUTZ" }] },
          { heute: HEUTE, katalog: KATALOG, bestehend: mitEntfallen, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ ok: true, reaktivieren: ["MASERNSCHUTZ"], neu: 0 });
    });
  });
});

// =============================================
// Erinnerung (Abschnitt 9) — die EINE Faelligkeitsregel
// =============================================

describe("erinnerungFaellig", () => {
  const stand = (teil: Partial<ErinnerungsStand> = {}): ErinnerungsStand => ({
    status: "LAUFEND",
    frist: FRIST_DB,
    erinnertFuerFrist: null,
    erinnertStufe: null,
    positionen: [{ status: "ANGEFORDERT" }],
    links: [{ mailStatus: "SENT", gesendetAm: new Date("2026-09-14T07:00:00.000Z") }],
    ...teil,
  });

  it("Vorab-Fenster: Frist − 7 bis Frist − 1", () => {
    expect(erinnerungFaellig(stand(), "2026-09-17")).toBeNull(); // Frist − 8
    expect(erinnerungFaellig(stand(), "2026-09-18")).toBe("VORAB"); // Frist − 7
    expect(erinnerungFaellig(stand(), "2026-09-24")).toBe("VORAB"); // Frist − 1
  });

  it("einmal je Frist: nach der Vorab-Erinnerung nicht noch einmal", () => {
    const erinnert = stand({ erinnertFuerFrist: FRIST_DB, erinnertStufe: "VORAB" });
    expect(erinnerungFaellig(erinnert, "2026-09-22")).toBeNull();
    expect(erinnerungFaellig(erinnert, FRIST)).toBe("FRISTTAG");
  });

  it("keine Vorab-Mail, wenn die Aufforderung erst in der Woche vor der Frist kam", () => {
    const spaet = stand({ links: [{ mailStatus: "SENT", gesendetAm: new Date("2026-09-19T08:00:00.000Z") }] });
    expect(erinnerungFaellig(spaet, "2026-09-20")).toBeNull();
    expect(erinnerungFaellig(spaet, FRIST)).toBe("FRISTTAG");
  });

  it("zählt die Mail nach dem Berliner Tag: 17.09. 22:30 UTC ist schon der 18.09.", () => {
    const kurzNachMitternacht = stand({ links: [{ mailStatus: "SENT", gesendetAm: new Date("2026-09-17T22:30:00.000Z") }] });
    expect(erinnerungFaellig(kurzNachMitternacht, "2026-09-20")).toBeNull();
  });

  it("Fristtag: nicht, wenn heute schon eine Mail ging, nicht zweimal, und ein verpasster entfällt", () => {
    const heuteGesendet = stand({
      links: [
        { mailStatus: "SENT", gesendetAm: new Date("2026-09-14T07:00:00.000Z") },
        { mailStatus: "SENT", gesendetAm: new Date("2026-09-25T06:00:00.000Z") },
      ],
    });
    expect(erinnerungFaellig(heuteGesendet, FRIST)).toBeNull();
    expect(erinnerungFaellig(stand({ erinnertFuerFrist: FRIST_DB, erinnertStufe: "FRISTTAG" }), FRIST)).toBeNull();
    expect(erinnerungFaellig(stand(), "2026-09-26")).toBeNull();
  });

  it("eine neue Frist startet einen neuen Zyklus", () => {
    const verlaengert = stand({
      frist: new Date("2026-10-10T00:00:00.000Z"),
      erinnertFuerFrist: FRIST_DB,
      erinnertStufe: "FRISTTAG",
      links: [
        { mailStatus: "SENT", gesendetAm: new Date("2026-09-14T07:00:00.000Z") },
        { mailStatus: "SENT", gesendetAm: new Date("2026-09-26T08:00:00.000Z") },
      ],
    });
    expect(erinnerungFaellig(verlaengert, "2026-10-03")).toBe("VORAB");
  });

  it("nichts, wenn nichts auf die Person wartet, nie etwas zugestellt wurde oder die Nachforderung nicht läuft", () => {
    expect(erinnerungFaellig(stand({ positionen: [{ status: "EINGEREICHT" }] }), "2026-09-20")).toBeNull();
    expect(
      erinnerungFaellig(stand({ links: [{ mailStatus: "FAILED", gesendetAm: null }] }), "2026-09-20"),
    ).toBeNull();
    expect(erinnerungFaellig(stand({ status: "ERLEDIGT" }), "2026-09-20")).toBeNull();
    expect(erinnerungFaellig(stand({ positionen: [{ status: "ZURUECKGEWIESEN" }] }), "2026-09-20")).toBe("VORAB");
  });
});

// =============================================
// Lauf-Waechter (Abschnitt 9, EP-13)
// =============================================

describe("laufWaechter", () => {
  const stand = (teil: Partial<WaechterStand> = {}): WaechterStand => ({
    status: "LAUFEND",
    vorgangEingestellt: false,
    frist: FRIST_DB,
    erinnertFuerFrist: null,
    erinnertStufe: null,
    positionen: [{ status: "ANGEFORDERT", dateien: [] }],
    links: [
      {
        anlass: "ANFORDERUNG",
        mailStatus: "SENT",
        gesendetAm: new Date("2026-09-14T07:00:00.000Z"),
        createdAt: new Date("2026-09-14T07:00:00.000Z"),
        erstelltVonId: "u-hr",
      },
    ],
    ...teil,
  });

  it("meldet eine ausgebliebene Vorab-Erinnerung (war gestern fällig, keine Spur)", () => {
    expect(laufWaechter(stand(), "2026-09-20")).toEqual({ erinnerungVom: "2026-09-18", loeschungSeit: null });
    expect(laufWaechterText({ erinnerungVom: "2026-09-18", loeschungSeit: null })).toBe(
      "Der tägliche Lauf erreicht das Portal vermutlich nicht (Erinnerung vom 18.09.2026 nicht versendet). Bitte die IT informieren.",
    );
  });

  it("kein Alarm am ersten Tag des Fensters — der Lauf ist heute noch dran", () => {
    expect(laufWaechter(stand(), "2026-09-18")).toBeNull();
  });

  it("kein Fehlalarm: Aufforderung im Fenster (Vorab entfällt regelgerecht)", () => {
    const spaet = stand({
      links: [
        {
          anlass: "ANFORDERUNG",
          mailStatus: "SENT",
          gesendetAm: new Date("2026-09-19T08:00:00.000Z"),
          createdAt: new Date("2026-09-19T08:00:00.000Z"),
          erstelltVonId: "u-hr",
        },
      ],
    });
    expect(laufWaechter(spaet, "2026-09-21")).toBeNull();
  });

  it("kein Fehlalarm: eine FAILED-Erinnerung ist eine Spur des Laufs", () => {
    const versucht = stand({
      links: [
        ...stand().links,
        {
          anlass: "ERINNERUNG_VORAB",
          mailStatus: "FAILED",
          gesendetAm: null,
          createdAt: new Date("2026-09-18T05:00:00.000Z"),
          erstelltVonId: null,
        },
      ],
    });
    expect(laufWaechter(versucht, "2026-09-21")).toBeNull();
  });

  it("kein Fehlalarm: Der Lauf holte im Fenster eine gescheiterte Mail nach (höchstens eine Mail je Lauf)", () => {
    // HR ergaenzt am 17.09., die Mail scheitert. Der Lauf am 18.09. holt sie
    // nach (Schritt 2) — wieder FAILED — und schickt deshalb keine Erinnerung.
    const ergaenzung = {
      anlass: "ERGAENZUNG",
      mailStatus: "FAILED",
      gesendetAm: null,
      createdAt: new Date("2026-09-17T12:00:00.000Z"),
      erstelltVonId: "u-hr",
    };
    const nachgeholt = { ...ergaenzung, createdAt: new Date("2026-09-18T05:00:00.000Z"), erstelltVonId: null };
    expect(laufWaechter(stand({ links: [...stand().links, ergaenzung, nachgeholt] }), "2026-09-19")).toBeNull();
    // Nur die gescheiterte Mail von HR im Fenster ist keine Spur des Laufs.
    const nurHr = stand({ links: [...stand().links, { ...ergaenzung, createdAt: new Date("2026-09-18T12:00:00.000Z") }] });
    expect(laufWaechter(nurHr, "2026-09-19")).toEqual({ erinnerungVom: "2026-09-18", loeschungSeit: null });
    // Eine Spur des Laufs VOR dem Fenster zaehlt nicht.
    const davor = stand({ links: [...stand().links, { ...nachgeholt, createdAt: new Date("2026-09-17T05:00:00.000Z") }] });
    expect(laufWaechter(davor, "2026-09-19")).toEqual({ erinnerungVom: "2026-09-18", loeschungSeit: null });
  });

  it("kein Fehlalarm bei eingestelltem Vorgang (EXPIRED) — der Lauf verschickt dort nichts", () => {
    expect(laufWaechter(stand({ vorgangEingestellt: eingestellt("EXPIRED") }), "2026-09-21")).toBeNull();
  });

  it("meldet eine überfällige Löschung (loeschenAb < heute − 1, nicht gelöscht)", () => {
    const zurueckgewiesen = {
      status: "ZURUECKGEWIESEN",
      loeschenAb: new Date("2026-09-18T08:00:00.000Z"),
      dateiGeloeschtAm: null,
    };
    const mitDatei = stand({ positionen: [{ status: "ANGEFORDERT", dateien: [zurueckgewiesen] }] });
    // Gestern (19.09.) hatte der Lauf den ganzen Tag Zeit — heute noch nicht.
    expect(laufWaechter(mitDatei, "2026-09-19")?.loeschungSeit ?? null).toBeNull();
    expect(laufWaechter(mitDatei, "2026-09-20")).toMatchObject({ loeschungSeit: "2026-09-18" });
    const geloescht = stand({
      positionen: [
        { status: "ANGEFORDERT", dateien: [{ ...zurueckgewiesen, dateiGeloeschtAm: new Date("2026-09-19T05:00:00Z") }] },
      ],
    });
    expect(laufWaechter(geloescht, "2026-09-20")?.loeschungSeit ?? null).toBeNull();
  });

  it("meldet einen Entwurf, der über Linkende + 31 Tage hinaus liegt — auch bei zurückgezogener Nachforderung", () => {
    const entwurf = { status: "ENTWURF", loeschenAb: null, dateiGeloeschtAm: null };
    const alt = stand({ status: "ZURUECKGEZOGEN", positionen: [{ status: "ANGEFORDERT", dateien: [entwurf] }] });
    // Linkende 09.10., faellig ab 08.11., Alarm ab dem 10.11.
    expect(laufWaechter(alt, "2026-11-09")).toBeNull();
    expect(laufWaechter(alt, "2026-11-10")).toEqual({ erinnerungVom: null, loeschungSeit: "2026-11-08" });
    expect(laufWaechterText({ erinnerungVom: null, loeschungSeit: "2026-11-08" })).toContain(
      "Löschung seit 08.11.2026 überfällig",
    );
  });

  it("beide Befunde zugleich stehen in einem Satz", () => {
    expect(laufWaechterText({ erinnerungVom: "2026-09-18", loeschungSeit: "2026-09-10" })).toBe(
      "Der tägliche Lauf erreicht das Portal vermutlich nicht (Erinnerung vom 18.09.2026 nicht versendet, Löschung seit 10.09.2026 überfällig). Bitte die IT informieren.",
    );
  });
});

// =============================================
// PDF-Merkmale
// =============================================

describe("PDF-Hinweise", () => {
  it("speichern und lesen, Anzeige positiv formuliert", () => {
    expect(pdfHinweiseSpeichern([])).toBeNull();
    expect(pdfHinweiseSpeichern(["VERSCHLUESSELT", "AKTIVE_INHALTE", "VERSCHLUESSELT"])).toBe(
      "VERSCHLUESSELT,AKTIVE_INHALTE",
    );
    expect(pdfHinweiseLesen("VERSCHLUESSELT, AKTIVE_INHALTE,UNBEKANNT")).toEqual(["VERSCHLUESSELT", "AKTIVE_INHALTE"]);
    // Geerbte Schluessel des Objekts sind keine Merkmale.
    expect(pdfHinweiseLesen("toString,constructor,__proto__")).toEqual([]);
    expect(pdfHinweisTexte("VERSCHLUESSELT,AKTIVE_INHALTE")).toEqual(["kennwortgeschützt", "aktive Inhalte gefunden"]);
    expect(pdfHinweisTexte(null)).toEqual([]);
    expect(pdfHinweisTexte("").join()).not.toContain("keine");
  });
});

// =============================================
// Pille, Fortschritt, Stand je Nachweis
// =============================================

describe("Pille und Fortschritt", () => {
  const z = (...status: string[]) => zaehlen(status.map((s) => ({ status: s })));

  it("zählt ohne ENTFAELLT", () => {
    expect(z("ANGENOMMEN", "EINGEREICHT", "ANGEFORDERT", "ZURUECKGEWIESEN", "ENTFAELLT")).toEqual({
      gesamt: 4,
      angenommen: 1,
      zuPruefen: 1,
      offen: 2,
      entfaellt: 1,
    });
    expect(fortschrittText(z("ANGENOMMEN", "EINGEREICHT", "ANGEFORDERT"))).toBe(
      "1 von 3 angenommen · 1 zu prüfen · 1 offen",
    );
    expect(fortschrittText(z("ANGENOMMEN", "ANGENOMMEN"))).toBe("2 von 2 angenommen");
    expect(fortschrittText(z("ANGENOMMEN", "ENTFAELLT", "ENTFAELLT"))).toBe("1 von 1 angenommen · 2 entfallen");
  });

  it("Vorrang: zu prüfen > Frist verstrichen > x/y (P:1406)", () => {
    const pille = (fristVerstrichen: boolean, ...status: string[]) =>
      unterlagenPille({ status: "LAUFEND", zaehler: z(...status), fristVerstrichen });
    expect(pille(true, "EINGEREICHT", "ANGEFORDERT")).toEqual({ text: "1 zu prüfen", farbe: "gelb" });
    expect(pille(true, "ANGENOMMEN", "ANGEFORDERT")).toEqual({ text: "Frist verstrichen", farbe: "rot" });
    expect(pille(false, "ANGENOMMEN", "ANGEFORDERT", "ANGEFORDERT")).toEqual({ text: "1/3", farbe: "blau" });
    // Nur HR ist noch dran: die Person ist nicht saeumig.
    expect(pille(true, "ANGENOMMEN", "ENTFAELLT")).toEqual({ text: "1/1", farbe: "blau" });
  });

  it("erledigt grün, zurückgezogen grau", () => {
    expect(unterlagenPille({ status: "ERLEDIGT", zaehler: z("ANGENOMMEN"), fristVerstrichen: false })).toEqual({
      text: "Erledigt",
      farbe: "gruen",
    });
    expect(unterlagenPille({ status: "ZURUECKGEZOGEN", zaehler: z("EINGEREICHT"), fristVerstrichen: true })).toEqual({
      text: "Zurückgezogen",
      farbe: "grau",
    });
  });
});

// =============================================
// Aktionen (EP-3, E-3, EP-16, 5.2)
// =============================================

describe("erlaubteAktionen", () => {
  const n = (teil: Partial<NachforderungEingabe> = {}) =>
    nachforderung({
      positionen: [
        position({ id: "p-offen", status: "ANGEFORDERT" }),
        position({ id: "p-pruefen", typ: "MASERNSCHUTZ", status: "EINGEREICHT" }),
        position({ id: "p-an", typ: "ABSCHLUSSZEUGNIS", status: "ANGENOMMEN", entschiedenAm: new Date("2026-09-16T08:00:00Z") }),
      ],
      ...teil,
    });

  it("ohne Bearbeitungsrecht: nichts", () => {
    const a = erlaubteAktionen({ nachforderung: n(), vorgangEingestellt: false, darfAktionen: false, andereLaufend: false, jetzt: JETZT });
    expect(Object.values(a.nachforderung).some(Boolean)).toBe(false);
    for (const p of Object.values(a.positionen)) expect(Object.values(p).some(Boolean)).toBe(false);
  });

  it("laufend bei bearbeitetem Vorgang (auch COMPLETED): alles, was der Zustand hergibt", () => {
    const a = erlaubteAktionen({
      nachforderung: n(),
      vorgangEingestellt: eingestellt("COMPLETED"),
      darfAktionen: true,
      andereLaufend: false,
      jetzt: JETZT,
    });
    expect(a.nachforderung).toEqual({
      ergaenzen: true,
      fristAendern: true,
      erneutSenden: true,
      erneutSendenGesperrt: false,
      zurueckziehen: true,
    });
    expect(a.positionen["p-offen"]).toEqual({ annehmen: false, zurueckweisen: false, entfaellt: true, annahmeZuruecknehmen: false });
    expect(a.positionen["p-pruefen"]).toEqual({ annehmen: true, zurueckweisen: true, entfaellt: true, annahmeZuruecknehmen: false });
    expect(a.positionen["p-an"]).toEqual({ annehmen: false, zurueckweisen: false, entfaellt: false, annahmeZuruecknehmen: true });
  });

  it("EXPIRED: keine Mail an die Person — Annehmen, Entfällt, Rücknahme und Zurückziehen bleiben (EP-3)", () => {
    const a = erlaubteAktionen({
      nachforderung: n(),
      vorgangEingestellt: eingestellt("EXPIRED"),
      darfAktionen: true,
      andereLaufend: false,
      jetzt: JETZT,
    });
    expect(a.nachforderung).toEqual({
      ergaenzen: false,
      fristAendern: false,
      erneutSenden: false,
      erneutSendenGesperrt: false,
      zurueckziehen: true,
    });
    expect(a.positionen["p-pruefen"]).toEqual({ annehmen: true, zurueckweisen: false, entfaellt: true, annahmeZuruecknehmen: false });
    expect(a.positionen["p-an"].annahmeZuruecknehmen).toBe(true);
  });

  it("„Link erneut senden“ nur, solange etwas wartet und das Linkende nicht überschritten ist (EP-16)", () => {
    const nurPruefen = n({ positionen: [position({ id: "p1", status: "EINGEREICHT" })] });
    expect(
      erlaubteAktionen({ nachforderung: nurPruefen, vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: JETZT })
        .nachforderung.erneutSenden,
    ).toBe(false);
    // Nach der Frist bis zum Linkende erlaubt, danach nicht.
    const amLinkende = new Date(`${LINKENDE}T10:00:00.000Z`);
    const danach = new Date("2026-10-10T10:00:00.000Z");
    expect(
      erlaubteAktionen({ nachforderung: n(), vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: amLinkende })
        .nachforderung.erneutSenden,
    ).toBe(true);
    const spaet = erlaubteAktionen({ nachforderung: n(), vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: danach });
    expect(spaet.nachforderung.erneutSenden).toBe(false);
    expect(spaet.nachforderung.fristAendern).toBe(true);
  });

  it("Sperrzeit: 10 Minuten nach der letzten zugestellten ERNEUT-Mail grau statt weg", () => {
    const vorFuenf = new Date(JETZT.getTime() - 5 * 60_000);
    const mitErneut = n({
      links: [link(), link({ anlass: "ERNEUT", gesendetAm: vorFuenf, createdAt: vorFuenf })],
    });
    const a = erlaubteAktionen({ nachforderung: mitErneut, vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: JETZT });
    expect(a.nachforderung.erneutSenden).toBe(false);
    expect(a.nachforderung.erneutSendenGesperrt).toBe(true);
    expect(a.sperreBis).toBe(new Date(vorFuenf.getTime() + 10 * 60_000).toISOString());

    const spaeter = new Date(JETZT.getTime() + 6 * 60_000);
    expect(erneutSendenSperreBis(mitErneut.links, spaeter)).toBeNull();
    // Eine gescheiterte ERNEUT-Mail sperrt nicht.
    const gescheitert = [link({ anlass: "ERNEUT", mailStatus: "FAILED", gesendetAm: null })];
    expect(erneutSendenSperreBis(gescheitert, JETZT)).toBeNull();
  });

  it("Ergänzen nur mit Platz: 30 Positionen ohne entfallene → nein", () => {
    const voll = Array.from({ length: MAX_POSITIONEN }, (_, i) => position({ id: `p${i}`, typ: null, status: "ANGEFORDERT" }));
    const a = (positionen: PositionEingabe[]) =>
      erlaubteAktionen({ nachforderung: n({ positionen }), vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: JETZT });
    expect(a(voll).nachforderung.ergaenzen).toBe(false);
    expect(a([...voll.slice(1), position({ id: "px", status: "ENTFAELLT" })]).nachforderung.ergaenzen).toBe(true);
  });

  it("Ergänzen bei 30 Positionen nicht wegen einer entfallenen FREIEN Zeile — sie lässt sich nicht reaktivieren", () => {
    const offen = Array.from({ length: MAX_POSITIONEN - 1 }, (_, i) => position({ id: `p${i}`, typ: null, status: "ANGEFORDERT" }));
    const positionen = [...offen, position({ id: "p-frei", typ: null, status: "ENTFAELLT" })];
    const a = erlaubteAktionen({
      nachforderung: n({ positionen }),
      vorgangEingestellt: false,
      darfAktionen: true,
      andereLaufend: false,
      jetzt: JETZT,
    });
    expect(a.nachforderung.ergaenzen).toBe(false);
    // Gegenprobe mit derselben Regel wie der Server: jede Eingabe endet in 409.
    const bestehend = positionen.map((p) => ({ typ: p.typ, status: p.status }));
    for (const eingabe of [{ typ: null }, { typ: "AUFENTHALTSTITEL" }]) {
      expect(
        eingabePruefen(
          { aktion: "ergaenzen", positionen: [eingabe] },
          { heute: HEUTE, katalog: ["AUFENTHALTSTITEL"], bestehend, bisherigeFrist: FRIST },
        ),
      ).toMatchObject({ ok: false, status: 409, grund: "ZU_VIELE_POSITIONEN" });
    }
  });

  it("ERLEDIGT: nur die Rücknahme — und die nicht neben einer anderen laufenden oder nach 30 Tagen", () => {
    const erledigt = n({
      status: "ERLEDIGT",
      positionen: [position({ id: "p-an", status: "ANGENOMMEN", entschiedenAm: new Date("2026-09-16T08:00:00Z") })],
    });
    const a = erlaubteAktionen({ nachforderung: erledigt, vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: JETZT });
    expect(Object.values(a.nachforderung).some(Boolean)).toBe(false);
    expect(a.positionen["p-an"].annahmeZuruecknehmen).toBe(true);
    expect(
      erlaubteAktionen({ nachforderung: erledigt, vorgangEingestellt: false, darfAktionen: true, andereLaufend: true, jetzt: JETZT })
        .positionen["p-an"].annahmeZuruecknehmen,
    ).toBe(false);
    expect(
      erlaubteAktionen({
        nachforderung: erledigt,
        vorgangEingestellt: false,
        darfAktionen: true,
        andereLaufend: false,
        jetzt: new Date("2026-10-17T10:00:00.000Z"),
      }).positionen["p-an"].annahmeZuruecknehmen,
    ).toBe(false);
  });

  it("ZURUECKGEZOGEN: nichts, auch keine Rücknahme", () => {
    const zurueck = n({
      status: "ZURUECKGEZOGEN",
      positionen: [position({ id: "p-an", status: "ANGENOMMEN", entschiedenAm: new Date("2026-09-20T08:00:00Z") })],
    });
    const a = erlaubteAktionen({ nachforderung: zurueck, vorgangEingestellt: false, darfAktionen: true, andereLaufend: false, jetzt: JETZT });
    expect(Object.values(a.nachforderung).some(Boolean)).toBe(false);
    expect(Object.values(a.positionen["p-an"]).some(Boolean)).toBe(false);
  });
});

// =============================================
// Uebersicht fuer GET /api/onboarding/[id]
// =============================================

describe("uebersichtBauen", () => {
  const bauen = (
    nachforderungen: NachforderungEingabe[],
    teil: Partial<Parameters<typeof uebersichtBauen>[0]> = {},
  ): UnterlagenUebersicht =>
    uebersichtBauen({
      modul: "ONBOARDING",
      nachforderungen,
      verfuegbar: { ok: true },
      vorgangEingestellt: false,
      darfAktionen: true,
      dateiUrl: DATEI_URL,
      jetzt: JETZT,
      ...teil,
    });

  /** Die Geschichte des Mockups (P:1382-1406), am Mo 21.09.2026 betrachtet. */
  const mockup = () =>
    nachforderung({
      positionen: [
        position({
          id: "p-rv",
          reihenfolge: 3,
          typ: null,
          bezeichnung: "Unterschriebener RV-Antrag",
          sensibel: false,
          fristpflichtig: false,
          originalErforderlich: true,
          status: "ANGENOMMEN",
          einreichungen: 1,
          uebermitteltAm: new Date("2026-09-15T08:00:00Z"),
          entschiedenAm: new Date("2026-09-16T08:00:00Z"),
          entschiedenVonName: "Erika Muster",
          dateien: [
            datei({
              id: "d-rv",
              status: "ANGENOMMEN",
              anzeigeName: "rv-antrag.pdf",
              mimeType: "application/pdf",
              pdfHinweise: "VERSCHLUESSELT",
              speicherPfad: null,
              uebernahmeZiel: "DOCUMENT",
              uebernommenId: "doc-rv",
              uebernommenAm: new Date("2026-09-16T08:00:00Z"),
              entschiedenAm: new Date("2026-09-16T08:00:00Z"),
            }),
          ],
        }),
        position({
          id: "p-titel",
          reihenfolge: 2,
          status: "EINGEREICHT",
          einreichungen: 1,
          gueltigBisAngabe: new Date("2028-03-31T00:00:00Z"),
          uebermitteltAm: new Date("2026-09-15T08:00:00Z"),
          dateien: [
            datei({ id: "d-vorne", anzeigeName: "titel-vorne.jpg" }),
            datei({ id: "d-hinten", anzeigeName: "titel-hinten.jpg", groesse: 921_600, speicherPfad: "uploads/unterlagen/n1/d-hinten.jpg" }),
            // Ein Entwurf, den HR nie sehen darf.
            datei({ id: "d-entwurf", status: "ENTWURF", anzeigeName: "geheimer-entwurf.jpg", uebermitteltAm: null }),
          ],
        }),
        position({
          id: "p-masern",
          reihenfolge: 1,
          typ: "MASERNSCHUTZ",
          bezeichnung: "Masernschutz-Nachweis",
          fristpflichtig: false,
          status: "ZURUECKGEWIESEN",
          einreichungen: 1,
          uebermitteltAm: new Date("2026-09-15T08:00:00Z"),
          begruendung: "Auf dem Foto ist das Impfdatum nicht lesbar.",
          entschiedenAm: new Date("2026-09-16T08:00:00Z"),
          dateien: [
            datei({
              id: "d-impf",
              status: "ZURUECKGEWIESEN",
              anzeigeName: "impfpass.jpg",
              groesse: 409_600,
              entschiedenAm: new Date("2026-09-16T08:00:00Z"),
              loeschenAb: new Date("2026-10-16T08:00:00Z"),
            }),
          ],
        }),
      ],
      links: [
        link(),
        link({
          anlass: "ZURUECKWEISUNG",
          gesendetAm: new Date("2026-09-16T08:00:05Z"),
          createdAt: new Date("2026-09-16T08:00:00Z"),
        }),
        link({
          anlass: "ERINNERUNG_VORAB",
          erstelltVonId: null,
          gesendetAm: new Date("2026-09-19T05:00:05Z"),
          createdAt: new Date("2026-09-19T05:00:00Z"),
        }),
      ],
    });

  it("baut die Karte der laufenden Nachforderung wie im Mockup", () => {
    const u = bauen([mockup()]);
    const l = u.laufend!;
    expect(l.pille).toEqual({ text: "1 zu prüfen", farbe: "gelb" });
    expect(u.pille).toEqual(l.pille);
    expect(l.kopfZeile).toBe("Angefordert am 14.09.2026 von Erika Muster · an anna.beispiel@example.org");
    expect(l.fristZeile).toBe("Frist: Freitag, 25.09.2026 · noch 4 Tage");
    expect(l.fortschritt).toEqual({ anteil: 1 / 3, text: "1 von 3 angenommen · 1 zu prüfen · 1 offen" });
    expect(l.mailVerlaufText).toBe("E-Mails an die Person: Aufforderung 14.09. · Zurückweisung 16.09. · Erinnerung 19.09.");
    expect(u.kurzstand).toBe("1 von 3 angenommen · 1 zu prüfen · 1 offen · Frist 25.09.2026");
    // Positionen nach `reihenfolge`.
    expect(l.positionen.map((p) => p.id)).toEqual(["p-masern", "p-titel", "p-rv"]);
  });

  it("Positionen: Pille, Begründung, Einreichung, Angabe der Person, Detail", () => {
    const [masern, titel, rv] = bauen([mockup()]).laufend!.positionen;

    expect(masern.pille).toEqual({ text: "Zurückgewiesen, erneut angefordert", farbe: "rot" });
    expect(masern.begruendungText).toBe("Ihre Begründung: Auf dem Foto ist das Impfdatum nicht lesbar.");
    expect(masern.einreichungText).toBe("2. Einreichung");
    expect(masern.dateien).toEqual([
      expect.objectContaining({ id: "d-impf", durchgestrichen: true, zusatz: "zurückgewiesen am 16.09.2026", groesseText: "400 KB" }),
    ]);

    expect(titel.pille).toEqual({ text: "Zu prüfen", farbe: "gelb" });
    expect(titel.gueltigBisAngabeText).toBe("Gültig bis (Angabe der Person): 31.03.2028");
    expect(titel.einreichungText).toBeNull();
    expect(titel.aktionen).toEqual({ annehmen: true, zurueckweisen: true, entfaellt: true, annahmeZuruecknehmen: false });
    expect(titel.dateien.map((d) => [d.name, d.groesseText, d.url])).toEqual([
      ["titel-vorne.jpg", "1,1 MB", DATEI_URL("d-vorne")],
      ["titel-hinten.jpg", "900 KB", DATEI_URL("d-hinten")],
    ]);

    expect(rv.pille).toEqual({ text: "Angenommen", farbe: "gruen" });
    expect(rv.detail).toBe("Angenommen am 16.09.2026 von Erika Muster · in die Dokumente des Vorgangs übernommen");
    expect(rv.originalErforderlich).toBe(true);
    expect(rv.dateien[0]).toMatchObject({ url: null, dokumentId: "doc-rv", hinweise: ["kennwortgeschützt"] });
  });

  it("HR sieht nie Entwürfe und nie den Link der Person", () => {
    const json = JSON.stringify(bauen([mockup()]));
    expect(json).not.toContain("d-entwurf");
    expect(json).not.toContain("geheimer-entwurf");
    expect(json.toLowerCase()).not.toContain("token");
  });

  it("ohne Bearbeitungsrecht: keine Dateinamen, keine URLs, keine Aktionen (SI-K4)", () => {
    const u = bauen([mockup()], { darfAktionen: false });
    const dateien = u.laufend!.positionen.flatMap((p) => p.dateien);
    expect(dateien.length).toBeGreaterThan(0);
    for (const d of dateien) {
      expect(d.name).toBeNull();
      expect(d.url).toBeNull();
      expect(d.dokumentId).toBeNull();
    }
    expect(Object.values(u.laufend!.aktionen).some(Boolean)).toBe(false);
    for (const p of u.laufend!.positionen) expect(Object.values(p.aktionen).some(Boolean)).toBe(false);
    expect(JSON.stringify(u)).not.toContain("titel-vorne.jpg");
    expect(u.anfordern).toEqual({ moeglich: false, grund: null });
  });

  it("Mailverlauf: FAILED rot, SKIPPED gelb; nach drei Nachholversuchen „nicht zustellbar“", () => {
    const n = nachforderung({
      links: [
        link(),
        link({ anlass: "ERNEUT", mailStatus: "SKIPPED", mailDetail: VORLAGE_DEAKTIVIERT_DETAIL, gesendetAm: null, createdAt: new Date("2026-09-15T08:00:00Z") }),
        link({ anlass: "ERNEUT", mailStatus: "FAILED", mailDetail: "SMTP-Server nicht erreichbar", gesendetAm: null, nachholVersuche: 3, createdAt: new Date("2026-09-17T08:00:00Z") }),
      ],
    });
    const l = bauen([n]).laufend!;
    expect(l.mailVerlauf.map((e) => [e.text, e.farbe])).toEqual([
      ["Aufforderung 14.09.", null],
      ["Link erneut gesendet 15.09. (nicht versendet)", "gelb"],
      ["Link erneut gesendet 17.09. (nicht zugestellt)", "rot"],
    ]);
    expect(l.mailVerlauf[1].hinweis).toBe("Vorlage deaktiviert (Einstellungen → E-Mail-Vorlagen)");
    expect(l.mailHinweis).toBe("nicht zustellbar – Adresse prüfen");
    // Unter drei Versuchen noch kein Hinweis.
    const n2 = nachforderung({ links: [link({ mailStatus: "FAILED", gesendetAm: null, nachholVersuche: 2 })] });
    expect(bauen([n2]).laufend!.mailHinweis).toBeNull();
  });

  it("„seit … ungeprüft“ ab 14 Tagen", () => {
    const n = (uebermitteltAm: Date) =>
      nachforderung({ positionen: [position({ status: "EINGEREICHT", einreichungen: 1, uebermitteltAm })] });
    expect(bauen([n(new Date("2026-09-08T08:00:00Z"))]).laufend!.positionen[0].ungeprueftHinweis).toBeNull();
    expect(bauen([n(new Date("2026-09-07T08:00:00Z"))]).laufend!.positionen[0].ungeprueftHinweis).toBe(
      "seit 07.09.2026 ungeprüft",
    );
  });

  it("Frist verstrichen: rote Pille, Dialoge verlangen eine neue Frist", () => {
    const u = bauen([nachforderung()], { jetzt: new Date("2026-09-28T08:00:00Z") });
    expect(u.pille).toEqual({ text: "Frist verstrichen", farbe: "rot" });
    expect(u.laufend!.fristVerstrichen).toBe(true);
    expect(u.laufend!.dialog.ergaenzenFristPflicht).toBe(true);
    expect(u.laufend!.dialog.zurueckweisenFrist).toEqual({ vorschlag: "2026-10-05", pflicht: false });
  });

  it("nach der Frist, aber nur HR ist dran: nicht „Frist verstrichen“ (2.1)", () => {
    const nurPruefen = nachforderung({
      positionen: [position({ status: "EINGEREICHT", einreichungen: 1, uebermitteltAm: new Date("2026-09-24T08:00:00Z") })],
    });
    const u = bauen([nurPruefen], { jetzt: new Date("2026-09-28T08:00:00Z") });
    expect(u.laufend!.fristVerstrichen).toBe(false);
    expect(u.pille).toEqual({ text: "1 zu prüfen", farbe: "gelb" });
  });

  it("ohne laufende Nachforderung: Knopf nach `verfuegbar`, sonst der Grund im Klartext", () => {
    expect(bauen([]).anfordern).toEqual({ moeglich: true, grund: null });
    const grund = "Unterlagen lassen sich erst nachfordern, wenn die Person ihren Fragebogen abgesendet hat.";
    expect(bauen([], { verfuegbar: { ok: false, grund } }).anfordern).toEqual({ moeglich: false, grund });
    expect(bauen([mockup()]).anfordern).toEqual({ moeglich: false, grund: null });
    const leer = bauen([]);
    expect(leer.laufend).toBeNull();
    expect(leer.pille).toBeNull();
    expect(leer.kurzstand).toBeNull();
    expect(leer.laufHinweis).toBeNull();
  });

  it("zuletztErledigt: nur ohne laufende und solange eine Rücknahme möglich ist", () => {
    const erledigt = nachforderung({
      id: "n-alt",
      status: "ERLEDIGT",
      erledigtAm: new Date("2026-09-16T08:00:00Z"),
      positionen: [position({ status: "ANGENOMMEN", entschiedenAm: new Date("2026-09-16T08:00:00Z") })],
    });
    const u = bauen([erledigt]);
    expect(u.zuletztErledigt?.id).toBe("n-alt");
    expect(u.zuletztErledigt?.abschlussText).toBe("Erledigt am 16.09.2026");
    expect(u.zuletztErledigt?.positionen[0].aktionen.annahmeZuruecknehmen).toBe(true);
    expect(u.pille).toBeNull();

    expect(bauen([erledigt], { jetzt: new Date("2026-10-17T08:00:00Z") }).zuletztErledigt).toBeNull();
    expect(bauen([erledigt, nachforderung({ id: "n-neu", angefordertAm: new Date("2026-09-20T08:00:00Z") })]).zuletztErledigt).toBeNull();
  });

  it("nachweisStandText: der Zusatz im Kasten „Offene Nachweise“ (P:1285)", () => {
    const u = bauen([mockup()]);
    expect(nachweisStandText("AUFENTHALTSTITEL", u)).toBe("eingegangen, bitte prüfen");
    expect(nachweisStandText("MASERNSCHUTZ", u)).toBe("zurückgewiesen, erneut angefordert, Frist 25.09.2026");
    expect(nachweisStandText("ARBEITSERLAUBNIS", u)).toBeNull();
    expect(nachweisStandText("AUFENTHALTSTITEL", null)).toBeNull();

    const offen = bauen([nachforderung()]);
    expect(nachweisStandText("AUFENTHALTSTITEL", offen)).toBe("angefordert am 14.09.2026, Frist 25.09.2026");
    const spaet = bauen([nachforderung()], { jetzt: new Date("2026-09-28T08:00:00Z") });
    expect(nachweisStandText("AUFENTHALTSTITEL", spaet)).toBe("angefordert am 14.09.2026, Frist 25.09.2026 (verstrichen)");
  });

  it("eine zurückgezogene Nachforderung zählt nie für Pille, Kurzstand und Stand je Nachweis", () => {
    const zurueck = nachforderung({
      status: "ZURUECKGEZOGEN",
      zurueckgezogenAm: new Date("2026-09-18T08:00:00Z"),
      positionen: [position({ status: "EINGEREICHT", einreichungen: 1, uebermitteltAm: new Date("2026-09-15T08:00:00Z") })],
    });
    const u = bauen([zurueck]);
    expect(u.pille).toBeNull();
    expect(u.kurzstand).toBeNull();
    expect(u.typen).toEqual({});
    expect(nachweisStandText("AUFENTHALTSTITEL", u)).toBeNull();
  });

  it("ENTFAELLT einer erledigten Nachforderung bleibt im Kasten erklärt", () => {
    const erledigt = nachforderung({
      status: "ERLEDIGT",
      erledigtAm: new Date("2026-09-10T08:00:00Z"),
      positionen: [position({ typ: "ARBEITSERLAUBNIS", status: "ENTFAELLT", entschiedenAm: new Date("2026-09-10T08:00:00Z") })],
    });
    expect(nachweisStandText("ARBEITSERLAUBNIS", bauen([erledigt]))).toBe(
      "entfällt laut Nachforderung (vermerkt am 10.09.2026)",
    );
  });

  it("die laufende Nachforderung zählt zuerst — auch eine ältere, per Rücknahme wieder geöffnete (E-3)", () => {
    // NF1 (01.09.) hatte den Titel angenommen, NF2 (10.09.) forderte ihn erneut
    // an, setzte ihn auf „Entfällt" und ist erledigt. Danach nimmt HR die Annahme
    // in NF1 zurueck: NF1 laeuft wieder, der Titel ist dort zu pruefen.
    const nf1 = nachforderung({
      id: "n1",
      angefordertAm: new Date("2026-09-01T08:00:00Z"),
      positionen: [position({ status: "EINGEREICHT", einreichungen: 1, uebermitteltAm: new Date("2026-09-03T08:00:00Z") })],
    });
    const nf2 = nachforderung({
      id: "n2",
      status: "ERLEDIGT",
      angefordertAm: new Date("2026-09-10T08:00:00Z"),
      erledigtAm: new Date("2026-09-12T08:00:00Z"),
      positionen: [position({ status: "ENTFAELLT", entschiedenAm: new Date("2026-09-12T08:00:00Z") })],
    });
    for (const reihe of [[nf1, nf2], [nf2, nf1]]) {
      const u = bauen(reihe);
      expect(u.laufend?.id).toBe("n1");
      expect(u.typen.AUFENTHALTSTITEL).toMatchObject({ status: "EINGEREICHT", laufend: true, nachforderungId: "n1" });
      expect(nachweisStandText("AUFENTHALTSTITEL", u)).toBe("eingegangen, bitte prüfen");
    }
  });

  it("HR-Meldung ohne Empfänger: der Hinweis der Karte kommt fertig aus der Übersicht (8.1)", () => {
    expect(bauen([nachforderung()]).laufend!.hrMeldungHinweis).toBeNull();
    expect(bauen([nachforderung({ hrMeldungOhneEmpfaenger: true })]).laufend!.hrMeldungHinweis).toBe(
      "HR-Meldung nicht zugestellt (kein Empfänger)",
    );
  });

  it("dokumentHerkunft: je übernommenem Dokument, auch aus zurückgezogenen Nachforderungen", () => {
    const u = bauen([mockup()]);
    expect(u.dokumentHerkunft).toEqual({
      "doc-rv": { nachforderungId: "n1", text: "aus Nachforderung angenommen am 16.09.2026", hinweise: ["kennwortgeschützt"] },
    });
    const zurueck = nachforderung({ ...mockup(), id: "n-z", status: "ZURUECKGEZOGEN" });
    expect(Object.keys(bauen([zurueck]).dokumentHerkunft)).toEqual(["doc-rv"]);
  });

  it("Lauf-Wächter über alle Nachforderungen — auch eine überfällige Löschung einer zurückgezogenen", () => {
    const zurueck = nachforderung({
      id: "n-z",
      status: "ZURUECKGEZOGEN",
      positionen: [
        position({
          status: "EINGEREICHT",
          dateien: [datei({ status: "VERWORFEN", loeschenAb: new Date("2026-09-10T08:00:00Z"), entschiedenAm: new Date("2026-08-11T08:00:00Z") })],
        }),
      ],
    });
    expect(bauen([zurueck]).laufHinweis).toBe(
      "Der tägliche Lauf erreicht das Portal vermutlich nicht (Löschung seit 10.09.2026 überfällig). Bitte die IT informieren.",
    );
    // Die laufende des Mockups hat ihre Vorab-Erinnerung (19.09.) — kein Alarm.
    expect(bauen([mockup()]).laufHinweis).toBeNull();
    // Ohne sie schon.
    const ohneErinnerung = nachforderung({ ...mockup(), links: [link()] });
    expect(bauen([ohneErinnerung]).laufHinweis).toContain("Erinnerung vom 18.09.2026 nicht versendet");
  });

  it("Dialogdaten des Modul-Bausteins nur mit Bearbeitungsrecht", () => {
    const dialog = {
      auswahl: [
        {
          typ: "FUEHRUNGSZEUGNIS",
          label: "Führungszeugnis",
          vorgeschlagen: false,
          sensibel: true,
          erlaubt: false,
          grund: "Bei Kitas vorerst gesperrt",
          originalErforderlich: false,
          fristpflichtig: false,
          hinweis: null,
        },
      ],
      empfaenger: {
        vorgang: "anna.beispiel@example.org",
        vorschlaege: [{ adresse: "anna.beispiel@example.org", quelle: "VORGANG" as const }],
        erlaubteDomains: [],
      },
    };
    expect(bauen([], { dialog }).dialog).toEqual(dialog);
    expect(bauen([], { dialog, darfAktionen: false }).dialog).toBeNull();
    expect(bauen([]).dialog).toBeNull();
  });

  it("JSON-Text ergibt dieselbe Übersicht wie Prisma-Date", () => {
    const alsJson = JSON.parse(JSON.stringify(mockup())) as NachforderungEingabe;
    expect(bauen([alsJson])).toEqual(bauen([mockup()]));
  });
});

// =============================================
// Personen-Sicht, Antworten, Meldungen
// =============================================

describe("personenStand (2.2)", () => {
  it("Entwürfe haben Vorrang, sonst der Zustand", () => {
    expect(personenStand("ANGEFORDERT", 0, null)).toEqual({ stand: "OFFEN", text: "Offen" });
    expect(personenStand("ANGEFORDERT", 2, null)).toEqual({ stand: "BEREIT", text: "2 Dateien bereit, noch nicht übermittelt" });
    expect(personenStand("ZURUECKGEWIESEN", 1, null)).toEqual({ stand: "BEREIT", text: "1 Datei bereit, noch nicht übermittelt" });
    expect(personenStand("ZURUECKGEWIESEN", 0, null)).toEqual({ stand: "ZURUECKGEWIESEN", text: "Bitte erneut hochladen" });
    expect(personenStand("EINGEREICHT", 0, new Date("2026-09-15T08:00:00Z"))).toEqual({
      stand: "UEBERMITTELT",
      text: "Übermittelt am 15.09.2026, wird geprüft",
    });
    expect(personenStand("ANGENOMMEN", 0, null)).toEqual({ stand: "ANGENOMMEN", text: "Angenommen" });
    expect(personenStand("ENTFAELLT", 0, null)).toEqual({ stand: "ENTFAELLT", text: "Wird nicht mehr benötigt" });
  });
});

describe("Antworten der HR-Aktionen (EP-11, N2)", () => {
  it("mailWarnung: FAILED holt der Lauf nach, SKIPPED nie", () => {
    expect(mailWarnung(null)).toBeNull();
    expect(mailWarnung({ status: "SENT", detail: null })).toBeNull();
    expect(mailWarnung({ status: "SENT", detail: null, nachweisFehlt: true })).toBe(MELDUNGEN.MAIL_NACHWEIS_FEHLT);
    expect(mailWarnung({ status: "FAILED", detail: "Timeout" })).toBe(
      "Die E-Mail konnte nicht zugestellt werden; der tägliche Lauf versucht es erneut.",
    );
    expect(mailWarnung({ status: "SKIPPED", detail: VORLAGE_DEAKTIVIERT_DETAIL })).toBe(
      "Die E-Mail wurde nicht versendet: Vorlage deaktiviert.",
    );
    expect(mailWarnung({ status: "SKIPPED", detail: "Keine E-Mail-Vorlage vorhanden" })).toBe(
      "Die E-Mail wurde nicht versendet: keine E-Mail-Vorlage vorhanden.",
    );
  });

  it("`detail` ist der ROHE Mailer-Text (wie `UnterlagenLink.mailDetail`) — lesbar macht ihn erst mailWarnung", () => {
    expect(mailWarnung({ status: "SKIPPED", detail: "Kein Empfaenger konfiguriert (An-Feld leer)" })).toBe(
      "Die E-Mail wurde nicht versendet: kein Empfänger in der E-Mail-Vorlage.",
    );
    expect(mailWarnung({ status: "SKIPPED", detail: null })).toBe("Die E-Mail wurde nicht versendet: unbekannter Grund.");
  });

  it("aktionsTexte: der Zustand ist gespeichert (2xx), die Mail steht als Warnung daneben", () => {
    expect(aktionsTexte("anfordern", { status: "SENT", detail: null })).toEqual({ meldung: AKTION_MELDUNGEN.anfordern });
    expect(aktionsTexte("zurueckweisen", { status: "FAILED", detail: "x" })).toEqual({
      meldung: AKTION_MELDUNGEN.zurueckweisen,
      warnung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
    });
    expect(aktionsTexte("zurueckziehen", null)).toEqual({ meldung: AKTION_MELDUNGEN.zurueckziehen });
    // Beim erneuten Senden ist die Mail die Aktion: keine Erfolgsmeldung ohne Zustellung.
    expect(aktionsTexte("erneut-senden", { status: "FAILED", detail: "x" })).toEqual({
      meldung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
    });
  });

  it("erneut senden: 201 SENT, 502 FAILED, 409 SKIPPED (6.1)", () => {
    expect(erneutSendenStatus({ status: "SENT", detail: null })).toBe(201);
    expect(erneutSendenStatus({ status: "FAILED", detail: null })).toBe(502);
    expect(erneutSendenStatus({ status: "SKIPPED", detail: null })).toBe(409);
  });
});

describe("Meldungen der öffentlichen Seite (5.5)", () => {
  it("stehen im Wortlaut der Feinplanung", () => {
    expect(MELDUNGEN.LINK_UNGUELTIG).toBe(
      "Dieser Link ist ungültig. Bitte verwenden Sie den Link aus Ihrer letzten E-Mail der Personalabteilung.",
    );
    expect(MELDUNGEN.LINK_ERSETZT).toBe(
      "Dieser Link wurde durch einen neueren ersetzt. Bitte verwenden Sie den Link aus Ihrer letzten E-Mail der Personalabteilung.",
    );
    expect(MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN).toBe(
      "Die Personalabteilung hat diese Anforderung zurückgezogen. Sie müssen nichts mehr hochladen.",
    );
    expect(MELDUNGEN.VORGANG_EINGESTELLT).toBe(
      "Dieser Vorgang wird nicht mehr bearbeitet. Bitte wenden Sie sich an die Personalabteilung.",
    );
    expect(MELDUNGEN.DATEI_ZU_GROSS).toBe(
      "Die Datei ist größer als 9,5 MB. Bitte teilen Sie das Dokument auf mehrere Dateien auf oder scannen Sie es mit geringerer Auflösung.",
    );
    expect(MELDUNGEN.DATEITYP_NICHT_ERLAUBT).toBe("Bitte laden Sie nur PDF-, JPG-, PNG- oder WebP-Dateien hoch.");
    expect(MELDUNGEN.DATEI_UNVOLLSTAENDIG).toBe(
      "Die Datei ist leer oder unvollständig. Bitte speichern oder scannen Sie das Dokument erneut und laden Sie es noch einmal hoch.",
    );
    expect(MELDUNGEN.ZU_VIELE_ANFRAGEN).toBe("Zu viele Anfragen, bitte warten Sie einen Moment.");
  });

  it("409 bei eingestelltem Vorgang nennt alles, was bleibt — auch die Rücknahme (EP-3)", () => {
    expect(MELDUNGEN.HR_VORGANG_EINGESTELLT).toBe(
      "Der Vorgang wird nicht mehr bearbeitet. E-Mails an die Person sind nicht mehr möglich – Unterlagen lassen sich nur noch annehmen, als entfallen vermerken oder eine Annahme zurücknehmen; die Nachforderung lässt sich nur noch zurückziehen.",
    );
  });

  it("Annehmen einer freien Zeile mit nicht erlaubter sensibler Art: eigener Text, nicht „anfordern“", () => {
    expect(MELDUNGEN.ART_NICHT_UEBERNEHMBAR).toBe(
      "Diese vertrauliche Art lässt sich für diesen Vorgang nicht übernehmen. Bitte wählen Sie eine andere Art.",
    );
    expect(MELDUNGEN.ART_NICHT_UEBERNEHMBAR).not.toContain("anfordern");
  });

  it("kein Satz steht zweimal in MELDUNGEN — zwei Texte über dieselbe Sache gingen auseinander", () => {
    const texte = Object.values(MELDUNGEN);
    expect(new Set(texte).size).toBe(texte.length);
  });

  it("404 für unbekannte und fremde Kinder: derselbe Text", () => {
    expect(MELDUNGEN.VORGANG_NICHT_GEFUNDEN).toBe("Vorgang nicht gefunden");
    expect(MELDUNGEN.POSITION_NICHT_GEFUNDEN).toBe("Unterlage nicht gefunden");
    expect(MELDUNGEN.DATEI_NICHT_GEFUNDEN).toBe("Datei nicht gefunden");
  });
});

describe("Meldungen des HR-Dienstes — eine Quelle (Schritt 6)", () => {
  it("die frueher im Dienst verstreuten Texte stehen hier, im bisherigen Wortlaut", () => {
    expect(MELDUNGEN.FRIST_UNVERAENDERT).toBe(
      "Die Frist ist unverändert. Um der Person den Link noch einmal zu schicken, nutzen Sie „Link erneut senden“.",
    );
    expect(MELDUNGEN.SPERREN_NICHT_GESPEICHERT).toBe(
      "Die E-Mail ist versendet. Die früheren Links ließen sich aber nicht sperren und bleiben gültig – bitte nicht erneut senden.",
    );
    expect(MELDUNGEN.MAIL_NICHT_VORBEREITET).toBe("Die E-Mail konnte nicht vorbereitet werden.");
    expect(MELDUNGEN.MAIL_OHNE_ERGEBNIS).toBe("Der Versand lieferte kein Ergebnis.");
  });

  it("N2: „frühere Links sperren“ gescheitert — kein Aufruf zu einer weiteren Mail", () => {
    expect(MELDUNGEN.SPERREN_NICHT_GESPEICHERT).toContain("bitte nicht erneut senden");
    expect(MELDUNGEN.SPERREN_NICHT_GESPEICHERT).not.toMatch(/bitte (senden|versuchen) Sie/i);
  });

  it("meldungVorlage: je Grund der Name der Vorlage, die Folge fuer die Person und der Weg zur Abhilfe", () => {
    const name = "Unterlagen angefordert";
    expect(meldungVorlage("VORLAGE_FEHLT", name)).toBe(
      "Für die E-Mail „Unterlagen angefordert“ ist keine Vorlage hinterlegt. Ohne sie erhält die Person keinen Link.",
    );
    expect(meldungVorlage("VORLAGE_DEAKTIVIERT", name)).toBe(
      "Die E-Mail-Vorlage „Unterlagen angefordert“ ist deaktiviert. Ohne sie erhält die Person keinen Link – bitte aktivieren Sie sie unter Einstellungen → E-Mail-Vorlagen.",
    );
    expect(meldungVorlage("VORLAGE_OHNE_LINK", name)).toContain("{{link}}");
    expect(meldungVorlage("VORLAGE_BETREFF", name)).toContain("90 Tage im Versandprotokoll");
    for (const grund of ["VORLAGE_FEHLT", "VORLAGE_DEAKTIVIERT", "VORLAGE_OHNE_LINK", "VORLAGE_BETREFF"] as const) {
      expect(meldungVorlage(grund, name)).toContain("„Unterlagen angefordert“");
    }
  });

  it("Texte der Entscheidungen (4.4, 4.5, Z1): jeder nennt den Weg, keiner einen Dateinamen", () => {
    expect(MELDUNGEN.DATEI_FEHLT).toContain("weisen Sie die Unterlage zurück");
    expect(MELDUNGEN.DATEI_VERAENDERT).toContain("weisen Sie die Unterlage zurück");
    expect(MELDUNGEN.RUECKNAHME_DATEI_VERAENDERT).toContain("nicht zurücknehmen");
    expect(MELDUNGEN.ART_NICHT_WAEHLBAR).toContain("frei benannten Unterlage");
    expect(MELDUNGEN.UNBEFRISTET_OHNE_ABLAUFDATUM).toBe(
      "„Unbefristet“ lässt sich nur bei einer Unterlage mit Ablaufdatum wählen.",
    );
  });

  it("der Dienst selbst traegt keine eigenen Nutzertexte mehr", () => {
    const dienst = fs.readFileSync(path.join(process.cwd(), "src/lib/unterlagen-dienst.ts"), "utf8");
    expect(dienst).not.toMatch(/^const (FRIST_UNVERAENDERT|SPERREN_NICHT_GESPEICHERT) =/m);
    expect(dienst).not.toContain("ist keine Vorlage hinterlegt");
    expect(dienst).not.toContain('"Die E-Mail konnte nicht vorbereitet werden."');
  });
});

describe("Protokoll", () => {
  it("jeder Code ist eindeutig und beschriftet (Abschnitt 11, samt Lauf und DOKUMENT_GEOEFFNET)", () => {
    const codes = Object.values(UNTERLAGEN_AUDIT);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(UNTERLAGEN_AUDIT_LABELS[code]).toBeTruthy();
    expect(codes).toEqual(
      expect.arrayContaining([
        "UNTERLAGEN_ERINNERT",
        "UNTERLAGEN_HR_GEMELDET",
        "UNTERLAGEN_MAIL_NACHGEHOLT",
        "UNTERLAGEN_DATEIEN_GELOESCHT",
        "UNTERLAGEN_DATEI_GEOEFFNET",
        "DOKUMENT_GEOEFFNET",
      ]),
    );
  });
});

describe("rein und client-sicher", () => {
  const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/unterlagen.ts"), "utf8");
  const importe = quelle.split("\n").filter((z) => /^import |^\} from /.test(z) || /^\s*from /.test(z));

  it("importiert nichts vom Server — aus Prisma und file-upload nur Typen", () => {
    expect(quelle).not.toMatch(/from "@\/lib\/prisma"/);
    expect(quelle).not.toMatch(/from "(fs|path|crypto|node:[a-z]+)"/);
    expect(quelle).not.toMatch(/from "next\//);
    expect(quelle).not.toMatch(/^import \{[^}]*\} from "@prisma\/client"/m);
    expect(quelle).toMatch(/^import type \{ PdfMerkmal \} from "@\/lib\/file-upload";/m);
    expect(importe.join("\n")).not.toMatch(/^import \{[^}]*\} from "@\/lib\/file-upload"/m);
  });

  it("Kalendertage nur über kalendertag.ts, keine Uhr", () => {
    expect(quelle).not.toMatch(/from "@\/lib\/(minijob-fristen|dokument-fristen)"/);
    expect(quelle).not.toMatch(/new Date\(\)/);
    expect(quelle).not.toMatch(/Date\.now\(\)/);
  });
});
