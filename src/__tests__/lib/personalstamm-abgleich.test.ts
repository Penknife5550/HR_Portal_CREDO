/**
 * Tests: Stammabgleich aus DokuBit (src/lib/personalstamm/abgleich.ts,
 * Self-Service S0)
 *
 * Gegen die In-Memory-Datenbank src/__tests__/hilfen/personalstamm-fake-db.ts
 * (rollt eine Zeile bei einer Ausnahme zurueck wie die interaktive
 * Transaktion und lehnt NUL-Zeichen ab wie Postgres). Abgedeckt sind die
 * Regeln E1–E6 der Bauvorgabe mit Nachtrag v3 („Die Adresse ist die Person"):
 * eine Zeile = ein Vertrag, die Person ueber die Adresse, ein Vertrag mit
 * neuer Adresse wandert, „laeuft" nach dem Berliner Kalendertag,
 * `vertragsende` autoritativ, Aktiv-Status nur aus verwalteten Vertraegen am
 * Ende des Stapels, alle Grundcodes, Wiederholbarkeit und das Lauf-Protokoll
 * ohne Namen und Adressen. Der Block „Nachtrag v3" am Ende enthaelt die
 * Pflichtfaelle V7.1–V7.16 einzeln, darin „Gegenpruefung zum Bau" die
 * Befunde der Pruefung des fertigen Baus (Schutz vor Stilllegung nur fuer den
 * eigenen Namen und nur, solange sein Grund besteht; doppelte Schluessel neben
 * Formatfehlern; einzelne Surrogate; gleichzeitige Aufrufe), „Anschluss
 * nach dem Ende des Vorgaengers, nur mit Nachweis" die Entscheidungen R2 und F
 * des Auftraggebers vom 17.10.2026 (Umbenennen ohne laufenden Vertrag, Fenster
 * 30 Tage, Zeile des alten Vertrags mit dem neuen Namen und dem gespeicherten
 * Beginn unter der Adresse), „Zweifel verschafft nie Zugang" die
 * Entscheidung P2 (je Zweifelsfall- und Fehlerzweig: nur das Ende kommt an,
 * ein laufender Vertrag wird aufgefrischt, aber nie verlaengert oder
 * entfristet, ein gespeichert nicht laufender bleibt unberuehrt) und „Anderer
 * Beginn" die Ergaenzung vom selben Tag (nennt die Zeile eines laufenden
 * Vertrags einen anderen Beginn: kein Konsens, im Zweifel keine Stunden).
 *
 * „Heute" ist der 17.10.2026 (Berlin, Sommerzeit UTC+2), sofern ein Test
 * nichts anderes sagt.
 */

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/personalstamm-fake-db").fakePrisma,
}));

import {
  fakePrisma,
  neueAnstellung,
  neueOrganisation,
  neuePerson,
  pdb,
  pdbLeeren,
  type Zeile,
} from "../hilfen/personalstamm-fake-db";
import { personalstammAbgleichen, vertragLaeuft, vertragsSchluessel } from "@/lib/personalstamm/abgleich";
import { PERSONALSTAMM_ACTIONS, type PersonalstammGrundcode } from "@/lib/constants";
import { tageSpaeter } from "@/lib/kalendertag";

const JETZT = new Date("2026-10-17T08:00:00.000Z");
const GESTERN = "2026-10-16";
const ANNA = "anna.beispiel@fes-minden.de";
const BERND = "bernd.muster@cfh-minden.de";
/** Neue Adresse von Anna (etwa nach einer Heirat). */
const NEU = "anna.neumann@fes-minden.de";
const SPAETER = new Date("2026-10-17T09:00:00.000Z");

/** Eine DokuBit-Zeile, wie n8n sie schickt (Vorgabe: Anna, 742/01/1001, unbefristet). */
function zeile(ueber: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mandantNummer: "742",
    abrechnungskreis: "01",
    personalNr: "1001",
    vorname: "Anna",
    nachname: "Beispiel",
    email: ANNA,
    teilzeitstunden: 20,
    vertragsbeginn: "2024-08-01",
    vertragsende: null,
    ...ueber,
  };
}

/** Zweiter Vertrag derselben Person bei einem anderen Mandanten. */
const ZWEITER_VERTRAG = { mandantNummer: "712", personalNr: "2002" };
const BERND_ZEILE = { personalNr: "3003", email: BERND, vorname: "Bernd", nachname: "Muster" };

function abgleichen(eintraege: unknown[], jetzt: Date = JETZT) {
  return personalstammAbgleichen(eintraege, { jetzt });
}

function personMit(email: string): Zeile {
  const p = pdb.personen.find((x) => x.email === email);
  if (!p) throw new Error(`Keine Person mit ${email}`);
  return p;
}

function vertrag(mandantNumber: string, abrechnungskreis: string, personalNumber: string): Zeile {
  const v = pdb.anstellungen.find(
    (a) =>
      a.mandantNumber === mandantNumber && a.abrechnungskreis === abrechnungskreis && a.personalNumber === personalNumber,
  );
  if (!v) throw new Error(`Kein Vertrag ${mandantNumber}|${abrechnungskreis}|${personalNumber}`);
  return v;
}

function protokoll(action: string): Zeile[] {
  return pdb.audits.filter((a) => a.action === action);
}

function ohne(zeilen: Zeile[], felder: string[]): Zeile[] {
  return zeilen.map((z) => Object.fromEntries(Object.entries(z).filter(([k]) => !felder.includes(k))));
}

let konsole: jest.SpyInstance;

beforeEach(() => {
  pdbLeeren();
  pdb.organisationen.push(neueOrganisation("742"), neueOrganisation("712"));
  jest.clearAllMocks();
  konsole = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => konsole.mockRestore());

describe("reine Hilfen", () => {
  it("vertragLaeuft: leer oder heute bzw. spaeter", () => {
    expect(vertragLaeuft(null, "2026-10-17")).toBe(true);
    expect(vertragLaeuft("2026-10-17", "2026-10-17")).toBe(true);
    expect(vertragLaeuft("2026-10-18", "2026-10-17")).toBe(true);
    expect(vertragLaeuft("2026-10-16", "2026-10-17")).toBe(false);
  });

  it("vertragsSchluessel: mandant|ak|manr", () => {
    expect(vertragsSchluessel({ mandantNummer: "742", abrechnungskreis: "01", personalNr: "1001" })).toBe(
      "742|01|1001",
    );
  });
});

describe("Anlegen", () => {
  it("legt Person und Vertrag an — Quelle, Zeitpunkte, Adresse klein", async () => {
    const r = await abgleichen([
      zeile({ email: " Anna.Beispiel@FES-Minden.de ", teilzeitstunden: "25,5", vertragsende: "2027-07-31" }),
    ]);

    expect(r.success).toBe(true);
    expect(r.results).toEqual([{ index: 0, status: "angelegt", schluessel: "742|01|1001" }]);
    expect(r.summary).toMatchObject({ zeilen: 1, angelegt: 1, fehler: 0 });

    expect(pdb.personen).toHaveLength(1);
    const p = pdb.personen[0];
    expect(p).toMatchObject({
      firstName: "Anna",
      lastName: "Beispiel",
      email: ANNA,
      importSource: "DOKUBIT",
      importedAt: JETZT,
      lastSyncAt: JETZT,
      isActive: true,
      personalNumber: null,
    });
    expect(pdb.anstellungen).toHaveLength(1);
    expect(pdb.anstellungen[0]).toMatchObject({
      employeeId: p.id,
      organizationId: "org-742",
      mandantNumber: "742",
      abrechnungskreis: "01",
      personalNumber: "1001",
      startDate: new Date("2024-08-01T00:00:00.000Z"),
      endDate: new Date("2027-07-31T00:00:00.000Z"),
      workingHoursWeek: 25.5,
      isActive: true,
    });
  });

  it("findet den Mandanten auch mit fuehrender Null", async () => {
    const r = await abgleichen([zeile({ mandantNummer: "0742" })]);
    expect(r.results[0]).toMatchObject({ status: "angelegt", schluessel: "742|01|1001" });
    expect(pdb.anstellungen[0]).toMatchObject({ organizationId: "org-742", mandantNumber: "742" });
  });

  it("je Zeile eine eigene Transaktion, sequenziell", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG), zeile({ personalNr: "9", vertragsbeginn: "kaputt" })]);
    // Die Formatfehler-Zeile erreicht keine Transaktion.
    expect(fakePrisma.$transaction).toHaveBeenCalledTimes(2);
    for (const [arg] of fakePrisma.$transaction.mock.calls) expect(typeof arg).toBe("function");
  });
});

describe("Mehrere Vertraege, eine Person", () => {
  it("drei laufende Vertraege mit derselben Adresse ergeben eine Person mit drei Vertraegen", async () => {
    const r = await abgleichen([
      zeile(),
      zeile(ZWEITER_VERTRAG),
      zeile({ abrechnungskreis: "02", personalNr: "15", email: "ANNA.Beispiel@fes-minden.de" }),
    ]);

    expect(r.results.map((x) => x.status)).toEqual(["angelegt", "angelegt", "angelegt"]);
    expect(pdb.personen).toHaveLength(1);
    expect(pdb.anstellungen).toHaveLength(3);
    expect(new Set(pdb.anstellungen.map((a) => a.employeeId))).toEqual(new Set([pdb.personen[0].id]));
    expect(pdb.anstellungen.map((a) => a.organizationId).sort()).toEqual(["org-712", "org-742", "org-742"]);
  });
});

describe("Gleiche MANR bei verschiedenen Mandanten oder Abrechnungskreisen", () => {
  it("ergibt mit verschiedenen Adressen verschiedene Personen, nie eine zusammengefuehrte", async () => {
    const r = await abgleichen([
      zeile(),
      zeile({ mandantNummer: "712", email: BERND, vorname: "Bernd", nachname: "Muster" }),
      zeile({ abrechnungskreis: "02", email: "clara.probe@mvs-minden.de", vorname: "Clara", nachname: "Probe" }),
    ]);

    expect(r.results.map((x) => x.status)).toEqual(["angelegt", "angelegt", "angelegt"]);
    expect(pdb.personen).toHaveLength(3);
    expect(new Set(pdb.anstellungen.map((a) => a.employeeId)).size).toBe(3);
    expect(vertrag("712", "01", "1001").employeeId).toBe(personMit(BERND).id);
  });
});

describe("Austritt und Mehrfachanstellung", () => {
  it("ein Vertrag endet: Person bleibt aktiv; beide enden: stillgelegt; Vertrag wieder laufend: reaktiviert", async () => {
    const a = zeile();
    const b = zeile(ZWEITER_VERTRAG);
    await abgleichen([a, b]);
    const person = () => personMit(ANNA);

    // Vertrag A endete gestern, B laeuft weiter.
    let r = await abgleichen([{ ...a, vertragsende: GESTERN }, b]);
    expect(r.results.map((x) => x.status)).toEqual(["aktualisiert", "unveraendert"]);
    expect(vertrag("742", "01", "1001")).toMatchObject({ isActive: false, endDate: new Date("2026-10-16T00:00:00Z") });
    expect(vertrag("712", "01", "2002").isActive).toBe(true);
    expect(person().isActive).toBe(true);
    expect(r.summary.stillgelegt).toBe(0);
    expect(protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT)).toHaveLength(0);

    // Beide beendet.
    r = await abgleichen([{ ...a, vertragsende: GESTERN }, { ...b, vertragsende: GESTERN }]);
    expect(r.results.map((x) => x.status)).toEqual(["unveraendert", "aktualisiert"]);
    expect(person().isActive).toBe(false);
    expect(r.summary.stillgelegt).toBe(1);
    const still = protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT);
    expect(still).toHaveLength(1);
    expect(still[0]).toMatchObject({ processType: "PERSONALSTAMM", userId: null, details: { employeeId: person().id } });

    // B kommt wieder als laufend.
    r = await abgleichen([{ ...b, vertragsende: null }]);
    expect(person().isActive).toBe(true);
    expect(vertrag("712", "01", "2002")).toMatchObject({ isActive: true, endDate: null });
    expect(r.summary.reaktiviert).toBe(1);
    const wieder = protokoll(PERSONALSTAMM_ACTIONS.REAKTIVIERT);
    expect(wieder).toHaveLength(1);
    expect(wieder[0].details).toEqual({ employeeId: person().id });
  });
});

describe("Vertragsende heute", () => {
  it("gilt noch als laufend — gerechnet im Berliner Kalendertag, nicht in UTC", async () => {
    const ende = "2026-10-17";

    // 16.10. 22:30 UTC = 17.10. 00:30 in Berlin: der letzte Arbeitstag.
    let r = await abgleichen([zeile({ vertragsende: ende })], new Date("2026-10-16T22:30:00.000Z"));
    expect(r.results[0].status).toBe("angelegt");
    expect(vertrag("742", "01", "1001").isActive).toBe(true);

    // 17.10. 22:30 UTC = 18.10. 00:30 in Berlin: vorbei, obwohl der UTC-Tag noch der 17. ist.
    r = await abgleichen([zeile({ vertragsende: ende })], new Date("2026-10-17T22:30:00.000Z"));
    expect(r.results[0].status).toBe("aktualisiert");
    expect(vertrag("742", "01", "1001").isActive).toBe(false);
    expect(personMit(ANNA).isActive).toBe(false);
  });

  it("ein unbekannter Vertrag mit Ende am Berliner Vortag wird nicht angelegt (UTC-Tag waere noch derselbe)", async () => {
    const r = await abgleichen([zeile({ vertragsende: "2026-10-16" })], new Date("2026-10-16T22:30:00.000Z"));
    expect(r.results[0].status).toBe("uebersprungen");
    expect(pdb.anstellungen).toHaveLength(0);
  });
});

describe("vertragsende ist autoritativ", () => {
  it("null ueberschreibt ein vorhandenes Ende, aus inaktiv wird aktiv", async () => {
    await abgleichen([zeile({ vertragsende: "2026-12-31" })]);
    await abgleichen([zeile({ vertragsende: "2026-09-30" })]);
    expect(vertrag("742", "01", "1001")).toMatchObject({ isActive: false, endDate: new Date("2026-09-30T00:00:00Z") });
    expect(personMit(ANNA).isActive).toBe(false);

    const r = await abgleichen([zeile({ vertragsende: null })]);
    expect(r.results[0].status).toBe("aktualisiert");
    expect(vertrag("742", "01", "1001")).toMatchObject({ isActive: true, endDate: null });
    expect(personMit(ANNA).isActive).toBe(true);
    expect(r.summary.reaktiviert).toBe(1);
  });
});

describe("Leere Felder loeschen nichts", () => {
  it("fehlende oder leere Stunden lassen die alten stehen, fehlende Adresse die alte Adresse", async () => {
    await abgleichen([zeile({ teilzeitstunden: 20 })]);

    const ohneStunden = zeile();
    delete ohneStunden.teilzeitstunden;
    for (const roh of [ohneStunden, zeile({ teilzeitstunden: null }), zeile({ teilzeitstunden: "" })]) {
      const r = await abgleichen([roh]);
      expect(r.results[0].status).toBe("unveraendert");
    }
    // Ohne Adresse wird gemeldet (V2.c), die gespeicherte Adresse bleibt.
    const r = await abgleichen([zeile({ email: null })]);
    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "MAIL_FEHLT" });
    expect(vertrag("742", "01", "1001").workingHoursWeek).toBe(20);
    expect(personMit(ANNA).email).toBe(ANNA);
  });

  it("geaenderte Stunden werden uebernommen", async () => {
    await abgleichen([zeile({ teilzeitstunden: 20 })]);
    const r = await abgleichen([zeile({ teilzeitstunden: 30.5 })]);
    expect(r.results[0].status).toBe("aktualisiert");
    expect(vertrag("742", "01", "1001").workingHoursWeek).toBe(30.5);
  });
});

describe("Wiederholung (E5, V7.16)", () => {
  it("derselbe Stapel zweimal: beim zweiten Mal alles unveraendert, nur lastSyncAt neu", async () => {
    const stapel = [zeile(), zeile(ZWEITER_VERTRAG), zeile({ ...BERND_ZEILE, vertragsende: "2026-12-31" })];
    await abgleichen(stapel);
    const personenVorher = ohne(pdb.personen, ["lastSyncAt", "updatedAt"]);
    const anstellungenVorher = structuredClone(pdb.anstellungen);
    const protokolleVorher = pdb.audits.length;
    fakePrisma.employment.update.mockClear();
    fakePrisma.employment.create.mockClear();
    fakePrisma.employee.create.mockClear();

    const spaeter = new Date("2026-10-17T09:00:00.000Z");
    const r = await abgleichen(stapel, spaeter);

    expect(r.results.map((x) => x.status)).toEqual(["unveraendert", "unveraendert", "unveraendert"]);
    expect(r.summary).toEqual({
      zeilen: 3,
      angelegt: 0,
      aktualisiert: 0,
      unveraendert: 3,
      uebersprungen: 0,
      stillgelegt: 0,
      reaktiviert: 0,
      zweifelsfall: 0,
      fehler: 0,
    });
    expect(fakePrisma.employment.update).not.toHaveBeenCalled();
    expect(fakePrisma.employment.create).not.toHaveBeenCalled();
    expect(fakePrisma.employee.create).not.toHaveBeenCalled();
    expect(pdb.anstellungen).toEqual(anstellungenVorher);
    expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(personenVorher);
    for (const p of pdb.personen) expect(p.lastSyncAt).toEqual(spaeter);
    // Nur der Lauf-Eintrag kommt dazu.
    expect(pdb.audits.length).toBe(protokolleVorher + 1);
    expect(pdb.audits[pdb.audits.length - 1].action).toBe(PERSONALSTAMM_ACTIONS.LAUF);
  });
});

describe("Was nie stilllegt", () => {
  beforeEach(async () => {
    await abgleichen([zeile()]);
  });

  function annaUnberuehrt() {
    expect(personMit(ANNA).isActive).toBe(true);
    expect(vertrag("742", "01", "1001").isActive).toBe(true);
    expect(protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT)).toHaveLength(0);
  }

  it("ein leerer Stapel", async () => {
    const r = await abgleichen([]);
    expect(r).toEqual({ success: true, summary: expect.objectContaining({ zeilen: 0 }), results: [] });
    annaUnberuehrt();
    expect(protokoll(PERSONALSTAMM_ACTIONS.LAUF)).toHaveLength(2);
  });

  it("ein Stapel ohne diese Person", async () => {
    await abgleichen([zeile(BERND_ZEILE)]);
    annaUnberuehrt();
  });

  it("eine Zeile mit Formatfehler, auch wenn sie ein Vertragsende traegt", async () => {
    const ohneEnde = zeile();
    delete ohneEnde.vertragsende;
    // Je ein Aufruf: Im selben Stapel waere der Schluessel doppelt (V1.2).
    for (const [roh, feld] of [
      [zeile({ vertragsende: GESTERN, vertragsbeginn: "2026-02-31" }), "vertragsbeginn"],
      [ohneEnde, "vertragsende"],
    ] as const) {
      const r = await abgleichen([roh]);
      expect(r.results).toEqual([{ index: 0, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld }]);
      expect(r.success).toBe(false);
    }
    annaUnberuehrt();
    expect(vertrag("742", "01", "1001").endDate).toBeNull();
  });
});

describe("Unbekannter beendeter Vertrag", () => {
  it("einer unbekannten Person: uebersprungen, nichts angelegt", async () => {
    const r = await abgleichen([zeile({ vertragsende: GESTERN })]);
    expect(r.results).toEqual([{ index: 0, status: "uebersprungen", schluessel: "742|01|1001" }]);
    expect(r.summary).toMatchObject({ uebersprungen: 1, fehler: 0 });
    expect(r.success).toBe(true);
    expect(pdb.personen).toHaveLength(0);
    expect(pdb.anstellungen).toHaveLength(0);
  });

  it("einer bekannten Person: uebersprungen, die Person bleibt unberuehrt", async () => {
    await abgleichen([zeile()]);
    const vorher = structuredClone(personMit(ANNA));
    const r = await abgleichen([zeile({ personalNr: "999", vertragsende: GESTERN })], new Date("2026-10-17T10:00:00Z"));
    expect(r.results[0].status).toBe("uebersprungen");
    expect(pdb.anstellungen).toHaveLength(1);
    expect(personMit(ANNA)).toEqual(vorher);
  });
});

describe("Grundcodes", () => {
  it("MANDANT_UNBEKANNT: Fehler der Zeile, nichts angelegt", async () => {
    const r = await abgleichen([zeile({ mandantNummer: "999" })]);
    expect(r.results).toEqual([{ index: 0, status: "fehler", schluessel: "999|01|1001", code: "MANDANT_UNBEKANNT" }]);
    expect(r.success).toBe(false);
    expect(pdb.personen).toHaveLength(0);
  });

  it("MAIL_FEHLT: kein Anlegen und keine Zuordnung ueber den Namen", async () => {
    pdb.personen.push(
      neuePerson({ firstName: "Anna", lastName: "Beispiel", email: "anna.alt@fes-minden.de", importSource: "DOKUBIT" }),
    );
    const vorher = structuredClone(pdb.personen);
    const r = await abgleichen([zeile({ email: null })]);
    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "MAIL_FEHLT" });
    expect(r.summary.zweifelsfall).toBe(1);
    expect(pdb.personen).toEqual(vorher);
    expect(pdb.anstellungen).toHaveLength(0);
  });

  it("EMAIL_MEHRDEUTIG: zwei Personen mit derselben Adresse", async () => {
    pdb.personen.push(
      neuePerson({ firstName: "Anna", lastName: "Beispiel", email: ANNA }),
      neuePerson({ firstName: "Anna", lastName: "Beispiel", email: "Anna.Beispiel@FES-Minden.de" }),
    );
    const vorher = structuredClone(pdb.personen);
    const r = await abgleichen([zeile()]);
    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_MEHRDEUTIG" });
    expect(pdb.personen).toEqual(vorher);
    expect(pdb.anstellungen).toHaveLength(0);
  });

  it.each([
    // Ohne laufenden Vertrag ist eine DokuBit-Person ausgeschieden, also inaktiv (E3).
    ["EMAIL_ANDERER_NAME", { importSource: "DOKUBIT", firstName: "Berta", lastName: "Anders", isActive: false }],
    ["EMAIL_ANDERER_NAME", { importSource: null, firstName: "Anna", lastName: "Anders" }],
    ["MANUELLER_DATENSATZ", { importSource: "MANUELL", firstName: "Anna", lastName: "Beispiel" }],
    ["FREMDE_QUELLE", { importSource: "LOGA", firstName: "Anna", lastName: "Beispiel" }],
  ])("%s: nichts angefasst (%p)", async (code, person) => {
    pdb.personen.push(neuePerson({ ...person, email: ANNA, personalNumber: "L-1" }));
    const vorher = structuredClone(pdb.personen);
    const r = await abgleichen([zeile()]);
    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code });
    expect(pdb.personen).toEqual(vorher);
    expect(pdb.anstellungen).toHaveLength(0);
    expect(pdb.audits.map((a) => a.action)).toEqual([PERSONALSTAMM_ACTIONS.LAUF]);
  });
});

describe("Altbestand (importSource null)", () => {
  function altbestand(ueber: Zeile = {}): Zeile {
    const p = neuePerson({
      firstName: "anna",
      lastName: "BEISPIEL",
      email: "Anna.Beispiel@FES-Minden.de",
      personalNumber: "L-4711",
      ...ueber,
    });
    pdb.personen.push(p);
    // Bestandsanstellung ohne Vertragsschluessel.
    pdb.anstellungen.push(neueAnstellung({ employeeId: p.id, organizationId: "org-742", mandantNumber: "742" }));
    return p;
  }

  it("wird ueber die Adresse uebernommen; Employee.personalNumber bleibt unberuehrt", async () => {
    const p = altbestand();
    const r = await abgleichen([zeile()]);

    expect(r.results[0].status).toBe("angelegt");
    expect(pdb.personen).toHaveLength(1);
    expect(personMit("Anna.Beispiel@FES-Minden.de")).toMatchObject({
      id: p.id,
      importSource: "DOKUBIT",
      importedAt: JETZT,
      lastSyncAt: JETZT,
      personalNumber: "L-4711",
      // Nur Gross-/Kleinschreibung verschieden: keine Aenderung.
      firstName: "anna",
      lastName: "BEISPIEL",
    });
    expect(vertrag("742", "01", "1001").employeeId).toBe(p.id);
    const uebernommen = protokoll(PERSONALSTAMM_ACTIONS.PERSON_UEBERNOMMEN);
    expect(uebernommen).toHaveLength(1);
    expect(uebernommen[0].details).toEqual({ employeeId: p.id });

    // Employee.personalNumber wird weder geschrieben noch gelesen.
    const aufrufe = [
      ...fakePrisma.employee.create.mock.calls,
      ...fakePrisma.employee.update.mock.calls,
      ...fakePrisma.employee.findUnique.mock.calls,
      ...fakePrisma.employee.findMany.mock.calls,
      ...fakePrisma.employee.findFirst.mock.calls,
    ];
    for (const [arg] of aufrufe) {
      expect(arg).not.toHaveProperty("data.personalNumber");
      expect(arg).toHaveProperty("select");
      expect(arg).not.toHaveProperty("select.personalNumber");
    }

    // Zweiter Lauf: Die anders geschriebene Adresse ist dieselbe Person — nichts wandert.
    const zweiter = await abgleichen([zeile()]);
    expect(zweiter.results[0].status).toBe("unveraendert");
    expect(pdb.personen).toHaveLength(1);
    expect(protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN)).toHaveLength(0);
  });

  it("behaelt ein vorhandenes importedAt", async () => {
    const frueher = new Date("2025-01-01T00:00:00.000Z");
    const p = altbestand({ importedAt: frueher });
    await abgleichen([zeile()]);
    expect(pdb.personen.find((x) => x.id === p.id)?.importedAt).toEqual(frueher);
  });

  it("die Bestandsanstellung ohne Schluessel zaehlt nicht fuer den Aktiv-Status", async () => {
    const p = altbestand();
    await abgleichen([zeile()]);
    const bestand = pdb.anstellungen.find((a) => a.personalNumber === null);
    const bestandVorher = structuredClone(bestand);

    const r = await abgleichen([zeile({ vertragsende: GESTERN })]);
    expect(r.summary.stillgelegt).toBe(1);
    expect(pdb.personen.find((x) => x.id === p.id)?.isActive).toBe(false);
    // Die Bestandsanstellung laeuft weiter und bleibt unberuehrt.
    expect(pdb.anstellungen.find((a) => a.personalNumber === null)).toEqual(bestandVorher);
  });
});

describe("Adresswechsel: der Vertrag wandert (v3)", () => {
  it("bei mehreren Vertraegen, nur einer mit neuer Adresse: nur dieser wandert, die Person bleibt aktiv", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
    const alt = personMit(ANNA);
    const r = await abgleichen([zeile({ email: NEU, teilzeitstunden: 25 })]);

    expect(r.results[0]).toEqual({ index: 0, status: "aktualisiert", schluessel: "742|01|1001" });
    expect(r.summary).toMatchObject({ aktualisiert: 1, stillgelegt: 0 });
    expect(vertrag("742", "01", "1001")).toMatchObject({ employeeId: personMit(NEU).id, workingHoursWeek: 25 });
    expect(vertrag("712", "01", "2002").employeeId).toBe(alt.id);
    expect(personMit(ANNA)).toMatchObject({ id: alt.id, isActive: true });
  });

  it("Ziel-Adresse gehoert einer Altbestand-Person mit anderem Namen, dort anders geschrieben: EMAIL_ANDERER_NAME, der Vertrag bleibt", async () => {
    await abgleichen([zeile()]);
    pdb.personen.push(
      neuePerson({ firstName: "Bernd", lastName: "Muster", email: "Bernd.Muster@CFH-Minden.de", importSource: null }),
    );
    const vorher = structuredClone(pdb.personen);
    const r = await abgleichen([zeile({ email: BERND, teilzeitstunden: 25 })]);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    // Nur aufgefrischt: Er bleibt bei Anna, niemand wird umbenannt oder uebernommen.
    expect(vertrag("742", "01", "1001")).toMatchObject({ employeeId: personMit(ANNA).id, workingHoursWeek: 25 });
    expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(ohne(vorher, ["lastSyncAt", "updatedAt"]));
    expect(protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN)).toHaveLength(0);
  });

  it("Ziel-Adresse gehoert einer DokuBit-Person mit anderem Namen: EMAIL_ANDERER_NAME, nichts wandert, kein Name geaendert", async () => {
    await abgleichen([zeile(), zeile(BERND_ZEILE)]);
    const r = await abgleichen([zeile({ email: BERND })]);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    expect(r.summary).toMatchObject({ zweifelsfall: 1, aktualisiert: 0 });
    expect(vertrag("742", "01", "1001").employeeId).toBe(personMit(ANNA).id);
    expect(personMit(BERND)).toMatchObject({ firstName: "Bernd", lastName: "Muster" });
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);
  });

  it("eine Adresse mit Unterstrich ist eine andere als die mit Punkt", async () => {
    await abgleichen([zeile()]);
    pdb.personen.push(
      neuePerson({ firstName: "Anna", lastName: "Beispiel", email: "anna.b@fes-minden.de", importSource: "DOKUBIT" }),
    );
    const r = await abgleichen([zeile({ email: "anna_b@fes-minden.de" })]);

    expect(r.results[0].status).toBe("aktualisiert");
    expect(vertrag("742", "01", "1001").employeeId).toBe(personMit("anna_b@fes-minden.de").id);
    expect(pdb.personen).toHaveLength(3);
  });
});

describe("Namensaenderung", () => {
  it("bei einem Vertrag: uebernommen, Eintrag ohne Namen", async () => {
    await abgleichen([zeile()]);
    const r = await abgleichen([zeile({ nachname: "Neumann" })]);

    expect(r.results[0].status).toBe("aktualisiert");
    expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Neumann" });
    const eintraege = protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT);
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0].details).toEqual({ employeeId: personMit(ANNA).id });
  });

  it("bei mehreren Vertraegen, nur einer im Stapel: EMAIL_ANDERER_NAME, Name bleibt", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
    const r = await abgleichen([zeile({ nachname: "Neumann" })]);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    expect(personMit(ANNA).lastName).toBe("Beispiel");
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);
  });

  it("nur Gross-/Kleinschreibung oder Leerzeichen verschieden: keine Aenderung", async () => {
    await abgleichen([zeile()]);
    const r = await abgleichen([zeile({ vorname: " ANNA ", nachname: "beispiel" })]);
    expect(r.results[0].status).toBe("unveraendert");
    expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Beispiel" });
  });
});

describe("Name im Konsens aller laufenden Vertraege (V3)", () => {
  it("verschiedene neue Namen unter einer Adresse: kein Konsens, beide EMAIL_ANDERER_NAME", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
    const r = await abgleichen([zeile({ nachname: "Neumann" }), zeile({ ...ZWEITER_VERTRAG, nachname: "Schulz" })]);

    expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
    expect(personMit(ANNA).lastName).toBe("Beispiel");
  });

  it("ein beendeter Vertrag zaehlt nach einer Verlaengerung nicht mit: der neue Name wird uebernommen", async () => {
    // 1001 befristet bis 31.08., Verlaengerung als neue Zeile 1002.
    await abgleichen([zeile({ vertragsende: "2026-08-31" }), zeile({ personalNr: "1002" })], new Date("2026-08-15T08:00:00Z"));
    await abgleichen([zeile({ vertragsende: "2026-08-31" }), zeile({ personalNr: "1002" })], new Date("2026-09-30T08:00:00Z"));
    expect(vertrag("742", "01", "1001").isActive).toBe(false);

    // Ab jetzt kommt nur noch 1002 — mit neuem Namen, gleiche Adresse.
    const r = await abgleichen([zeile({ personalNr: "1002", nachname: "Neumann" })]);

    expect(r.results[0].status).toBe("aktualisiert");
    expect(personMit(ANNA)).toMatchObject({ lastName: "Neumann", isActive: true });
    expect(pdb.personen).toHaveLength(1);
  });

  it("Konsens, aber die Adresse gehoert einer anderen Person: beide EMAIL_ANDERER_NAME, nichts wandert", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG), zeile(BERND_ZEILE)]);
    const r = await abgleichen([zeile({ email: BERND }), zeile({ ...ZWEITER_VERTRAG, email: BERND })]);

    expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
    expect(pdb.anstellungen.filter((a) => a.employeeId === personMit(ANNA).id)).toHaveLength(2);
    expect(personMit(BERND).lastName).toBe("Muster");
  });

  it("Altbestand mit Bestandsanstellung: die Anstellung ohne Schluessel zaehlt nicht, der neue Name wird uebernommen", async () => {
    const p = neuePerson({ firstName: "Anna", lastName: "Beispiel", email: ANNA });
    pdb.personen.push(p);
    pdb.anstellungen.push(neueAnstellung({ employeeId: p.id, organizationId: "org-742", mandantNumber: "742" }));
    await abgleichen([zeile()]);

    const r = await abgleichen([zeile({ nachname: "Neumann" })]);
    expect(r.results[0].status).toBe("aktualisiert");
    expect(personMit(ANNA)).toMatchObject({ id: p.id, lastName: "Neumann" });
  });
});

describe("Reihenfolge im Stapel", () => {
  it("neuer Vertrag vor dem bekannten mit neuer Adresse: beide bei derselben neuen Person", async () => {
    await abgleichen([zeile()]);
    const alt = personMit(ANNA);

    const r = await abgleichen([zeile({ mandantNummer: "712", personalNr: "9", email: NEU }), zeile({ email: NEU })]);

    expect(r.results).toEqual([
      { index: 0, status: "angelegt", schluessel: "712|01|9" },
      { index: 1, status: "aktualisiert", schluessel: "742|01|1001" },
    ]);
    const neu = personMit(NEU);
    expect(vertrag("712", "01", "9").employeeId).toBe(neu.id);
    expect(vertrag("742", "01", "1001").employeeId).toBe(neu.id);
    expect(pdb.personen.find((p) => p.id === alt.id)).toMatchObject({ email: ANNA, isActive: false });
  });
});

describe("Schutz vor Fehlzuordnung", () => {
  it("ein Unterstrich in der Adresse trifft keine Adresse mit Punkt", async () => {
    pdb.personen.push(
      neuePerson({ firstName: "Anna", lastName: "Beispiel", email: "anna.b@fes-minden.de", importSource: "DOKUBIT" }),
    );
    const r = await abgleichen([zeile({ personalNr: "9", email: "anna_b@fes-minden.de" })]);

    expect(r.results[0].status).toBe("angelegt");
    expect(pdb.personen).toHaveLength(2);
    expect(vertrag("742", "01", "9").employeeId).toBe(personMit("anna_b@fes-minden.de").id);
  });
});

describe("Person nicht (mehr) vom Abgleich verwaltet (D1)", () => {
  it.each([
    ["MANUELL", "MANUELLER_DATENSATZ"],
    ["LOGA", "FREMDE_QUELLE"],
  ])("Quelle %s: Person bleibt, wie sie ist (%s); der Vertrag wird aufgefrischt", async (quelle, code) => {
    await abgleichen([zeile()]);
    const p = personMit(ANNA);
    p.importSource = quelle;

    const r = await abgleichen([zeile({ vertragsende: GESTERN, nachname: "Neumann" })], SPAETER);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code });
    expect(r.summary).toMatchObject({ zweifelsfall: 1, aktualisiert: 1, stillgelegt: 0 });
    // Kein Name, kein Aktiv-Status und kein lastSyncAt an einer Hand- oder Fremdquelle.
    expect(personMit(ANNA)).toMatchObject({
      id: p.id,
      lastName: "Beispiel",
      isActive: true,
      importSource: quelle,
      lastSyncAt: JETZT,
    });
    expect(vertrag("742", "01", "1001")).toMatchObject({ isActive: false, endDate: new Date("2026-10-16T00:00:00Z") });
    expect(pdb.audits.map((a) => a.action)).toEqual([PERSONALSTAMM_ACTIONS.LAUF, PERSONALSTAMM_ACTIONS.LAUF]);
  });
});

describe("Aktiv-Status nach E3 in weiteren Pfaden", () => {
  it("stillgelegte Person bekommt einen neuen laufenden Vertrag: angelegt und REAKTIVIERT", async () => {
    await abgleichen([zeile()]);
    await abgleichen([zeile({ vertragsende: GESTERN })]);
    expect(personMit(ANNA).isActive).toBe(false);

    const r = await abgleichen([zeile({ personalNr: "1002" })]);

    expect(r.results[0].status).toBe("angelegt");
    expect(r.summary.reaktiviert).toBe(1);
    expect(personMit(ANNA).isActive).toBe(true);
    expect(protokoll(PERSONALSTAMM_ACTIONS.REAKTIVIERT)).toHaveLength(1);
  });

  it("inaktiver Altbestand wird uebernommen und REAKTIVIERT", async () => {
    const p = neuePerson({ firstName: "Anna", lastName: "Beispiel", email: ANNA, isActive: false });
    pdb.personen.push(p);

    const r = await abgleichen([zeile()]);

    expect(r.results[0].status).toBe("angelegt");
    expect(r.summary.reaktiviert).toBe(1);
    expect(personMit(ANNA)).toMatchObject({ id: p.id, importSource: "DOKUBIT", isActive: true });
  });

  it("auch Zweifelsfall-Zeilen setzen lastSyncAt und legen still", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);

    // Beide Vertraege enden — unter zwei verschiedenen Namen derselben Adresse.
    const r = await abgleichen(
      [
        zeile({ ...ZWEITER_VERTRAG, vertragsende: GESTERN }),
        zeile({ vertragsende: GESTERN, nachname: "Neumann" }),
      ],
      SPAETER,
    );

    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
    ]);
    expect(r.summary).toMatchObject({ stillgelegt: 1, zweifelsfall: 2, aktualisiert: 2 });
    expect(personMit(ANNA)).toMatchObject({ isActive: false, lastName: "Beispiel", lastSyncAt: SPAETER });
    expect(protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT)).toHaveLength(1);
  });

  it("ein Vertrag, dessen Ende verstrichen ist, haelt die Person nicht aktiv — auch wenn seine Zeile nicht mehr durchkommt", async () => {
    await abgleichen([zeile({ vertragsende: "2026-10-20" }), zeile({ ...ZWEITER_VERTRAG, vertragsende: "2026-10-25" })]);

    const r = await abgleichen(
      [zeile({ vertragsende: "2026-10-20", vertragsbeginn: "kaputt" }), zeile({ ...ZWEITER_VERTRAG, vertragsende: "2026-10-25" })],
      new Date("2026-10-26T08:00:00.000Z"),
    );

    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["fehler", "FORMATFEHLER"],
      ["aktualisiert", undefined],
    ]);
    expect(vertrag("742", "01", "1001").isActive).toBe(true);
    expect(personMit(ANNA).isActive).toBe(false);
    expect(r.summary.stillgelegt).toBe(1);
  });
});

describe("Vertrag auffrischen", () => {
  it("ein korrigierter Vertragsbeginn wird uebernommen", async () => {
    await abgleichen([zeile()]);
    const r = await abgleichen([zeile({ vertragsbeginn: "2024-09-01" })]);
    expect(r.results[0].status).toBe("aktualisiert");
    expect(vertrag("742", "01", "1001").startDate).toEqual(new Date("2024-09-01T00:00:00.000Z"));
  });
});

describe("Lauf-Protokoll", () => {
  it("genau ein Eintrag je Aufruf, mit Zahlen und Meldungen, ohne Namen und Adressen", async () => {
    await abgleichen([zeile()]);
    const r = await abgleichen([
      zeile({ nachname: "Neumann" }),
      zeile({ mandantNummer: "999", email: "xaver.fremd@fes-minden.de", vorname: "Xaver", nachname: "Fremd" }),
      { vorname: "Kunibert", nachname: "Defekt", email: "kunibert.defekt@fes-minden.de" },
      zeile({ personalNr: "5005", email: null, vorname: "Olga", nachname: "Ohnepost" }),
    ]);

    const laeufe = protokoll(PERSONALSTAMM_ACTIONS.LAUF);
    expect(laeufe).toHaveLength(2);
    const lauf = laeufe[1];
    expect(lauf).toMatchObject({ processType: "PERSONALSTAMM", userId: null });
    expect(lauf.details).toEqual({
      zahlen: r.summary,
      meldungen: [
        { schluessel: "999|01|1001", code: "MANDANT_UNBEKANNT" },
        { schluessel: "zeile:2", code: "FORMATFEHLER" },
        { schluessel: "742|01|5005", code: "MAIL_FEHLT" },
      ],
    });
    expect(r.summary).toEqual({
      zeilen: 4,
      angelegt: 0,
      aktualisiert: 1,
      unveraendert: 0,
      uebersprungen: 0,
      stillgelegt: 0,
      reaktiviert: 0,
      zweifelsfall: 1,
      fehler: 2,
    });

    const protokollText = JSON.stringify(lauf.details);
    const antwortText = JSON.stringify(r);
    for (const verboten of ["Anna", "Beispiel", "Neumann", "Xaver", "Fremd", "Kunibert", "Defekt", "Olga", "Ohnepost", "@"]) {
      expect(protokollText).not.toContain(verboten);
      expect(antwortText).not.toContain(verboten);
    }
  });

  it("auch ein vollstaendig fehlerhafter Aufruf schreibt seinen Eintrag", async () => {
    const r = await abgleichen(["kaputt", null, 42]);
    expect(r.summary).toMatchObject({ zeilen: 3, fehler: 3 });
    const laeufe = protokoll(PERSONALSTAMM_ACTIONS.LAUF);
    expect(laeufe).toHaveLength(1);
    expect((laeufe[0].details as { meldungen: unknown[] }).meldungen).toEqual([
      { schluessel: "zeile:0", code: "FORMATFEHLER" },
      { schluessel: "zeile:1", code: "FORMATFEHLER" },
      { schluessel: "zeile:2", code: "FORMATFEHLER" },
    ]);
  });
});

describe("Interner Fehler", () => {
  it("kostet nur seine Zeile; zurueckgerollt; ins Log nur Index und Code", async () => {
    fakePrisma.employment.create.mockImplementationOnce(async () => {
      throw Object.assign(new Error(`Unique constraint failed: ${ANNA}`), { code: "P2002" });
    });

    const r = await abgleichen([zeile(), zeile(BERND_ZEILE)]);

    expect(r.results).toEqual([
      { index: 0, status: "fehler", schluessel: "742|01|1001", code: "INTERNER_FEHLER" },
      { index: 1, status: "angelegt", schluessel: "742|01|3003" },
    ]);
    expect(r.success).toBe(false);
    expect(r.summary).toMatchObject({ fehler: 1, angelegt: 1 });
    // Die in Zeile 0 schon angelegte Person ist mit der Transaktion verschwunden.
    expect(pdb.personen.map((p) => p.email)).toEqual([BERND]);
    expect(konsole).toHaveBeenCalledTimes(1);
    expect(konsole).toHaveBeenCalledWith("[Personalstamm] Zeile 0 fehlgeschlagen:", "P2002");
    expect(JSON.stringify(konsole.mock.calls)).not.toMatch(/anna|beispiel|@/i);
  });
});

describe("Aktiv-Status scheitert fuer eine Person (V4)", () => {
  it("zaehlt als Fehler mit Meldung „person“, legt nicht still, ins Log nur der Code", async () => {
    await abgleichen([zeile()]);
    fakePrisma.employment.count.mockRejectedValueOnce(Object.assign(new Error(`kaputt ${ANNA}`), { code: "P1001" }));

    const r = await abgleichen([zeile({ vertragsende: GESTERN })]);

    expect(r.results).toEqual([{ index: 0, status: "aktualisiert", schluessel: "742|01|1001" }]);
    expect(r.success).toBe(false);
    expect(r.summary).toMatchObject({ aktualisiert: 1, fehler: 1, stillgelegt: 0 });
    expect(personMit(ANNA).isActive).toBe(true);
    const lauf = protokoll(PERSONALSTAMM_ACTIONS.LAUF).at(-1)!;
    expect((lauf.details as { meldungen: unknown[] }).meldungen).toEqual([{ schluessel: "person", code: "INTERNER_FEHLER" }]);
    expect(konsole).toHaveBeenCalledWith("[Personalstamm] Aktiv-Status fehlgeschlagen:", "P1001");
    expect(JSON.stringify(konsole.mock.calls)).not.toMatch(/anna|@/i);
  });
});

describe("Lauf-Protokoll scheitert (V5)", () => {
  it("ein zweiter Versuch nur mit den Zahlen", async () => {
    fakePrisma.auditLog.create.mockRejectedValueOnce(Object.assign(new Error("kaputt"), { code: "P2010" }));

    const r = await abgleichen([zeile({ mandantNummer: "999" })]);

    const laeufe = protokoll(PERSONALSTAMM_ACTIONS.LAUF);
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0].details).toEqual({ zahlen: r.summary });
    expect(konsole).toHaveBeenCalledWith("[Personalstamm] Lauf-Protokoll fehlgeschlagen:", "P2010");
  });

  it("scheitert auch der, nur ein Log-Eintrag — keine Ausnahme nach aussen", async () => {
    fakePrisma.auditLog.create
      .mockRejectedValueOnce(Object.assign(new Error("kaputt"), { code: "P2010" }))
      .mockRejectedValueOnce(Object.assign(new Error("kaputt"), { code: "P1001" }));

    const r = await abgleichen([zeile()]);

    expect(r.results[0].status).toBe("angelegt");
    expect(protokoll(PERSONALSTAMM_ACTIONS.LAUF)).toHaveLength(0);
    expect(konsole).toHaveBeenCalledTimes(2);
    expect(konsole).toHaveBeenLastCalledWith("[Personalstamm] Lauf-Protokoll fehlgeschlagen:", "P1001");
  });
});

/**
 * Pflichtfaelle aus dem Nachtrag v3 („Die Adresse ist die Person"), je einer
 * als eigener Fall. Jeder endet mit `wiederholungAendertNichts` — derselbe
 * Stapel noch einmal aendert nichts ausser lastSyncAt (V7.16).
 */
describe("Nachtrag v3 — Pflichtfaelle V7", () => {
  const GETEILT = "sekretariat@fes-minden.de";

  /** V7.16: derselbe Stapel noch einmal — nichts geaendert ausser lastSyncAt, nur der Lauf-Eintrag kommt dazu. */
  async function wiederholungAendertNichts(stapel: unknown[], jetzt: Date = SPAETER) {
    const personen = ohne(pdb.personen, ["lastSyncAt", "updatedAt"]);
    const anstellungen = ohne(pdb.anstellungen, ["updatedAt"]);
    const eintraege = pdb.audits.length;

    const r = await abgleichen(stapel, jetzt);

    expect(r.summary).toMatchObject({ angelegt: 0, aktualisiert: 0, stillgelegt: 0, reaktiviert: 0 });
    expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(personen);
    expect(ohne(pdb.anstellungen, ["updatedAt"])).toEqual(anstellungen);
    expect(pdb.audits.slice(eintraege).map((a) => a.action)).toEqual([PERSONALSTAMM_ACTIONS.LAUF]);
    return r;
  }

  it("V7.1 Adresswechsel bei einem Vertrag: neue Person, Vertrag umgehaengt, alte stillgelegt, UMGEZOGEN ohne Adressen", async () => {
    await abgleichen([zeile()]);
    const alt = personMit(ANNA);
    const stapel = [zeile({ email: NEU })];

    const r = await abgleichen(stapel);

    expect(r.results).toEqual([{ index: 0, status: "aktualisiert", schluessel: "742|01|1001" }]);
    expect(r.summary).toMatchObject({ aktualisiert: 1, stillgelegt: 1, angelegt: 0 });
    const neu = personMit(NEU);
    expect(neu).toMatchObject({
      firstName: "Anna",
      lastName: "Beispiel",
      importSource: "DOKUBIT",
      importedAt: JETZT,
      lastSyncAt: JETZT,
      isActive: true,
    });
    expect(vertrag("742", "01", "1001").employeeId).toBe(neu.id);
    // Die alte Person wird nicht umgeschrieben, nur stillgelegt.
    expect(personMit(ANNA)).toMatchObject({ id: alt.id, firstName: "Anna", lastName: "Beispiel", isActive: false });
    const umzug = protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN);
    expect(umzug).toHaveLength(1);
    expect(umzug[0]).toMatchObject({ processType: "PERSONALSTAMM", userId: null });
    expect(umzug[0].details).toEqual({ schluessel: "742|01|1001", vonEmployeeId: alt.id, nachEmployeeId: neu.id });
    expect(protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT).map((a) => a.details)).toEqual([{ employeeId: alt.id }]);

    const zweiter = await wiederholungAendertNichts(stapel);
    expect(zweiter.results[0].status).toBe("unveraendert");
  });

  it("V7.2 Heirat bei gleicher Adresse, zwei Vertraege, beide im Stapel: Name geaendert, ein NAME_GEAENDERT", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
    const stapel = [zeile({ nachname: "Neumann" }), zeile({ ...ZWEITER_VERTRAG, nachname: "Neumann" })];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["aktualisiert", undefined],
      ["unveraendert", undefined],
    ]);
    expect(pdb.personen).toHaveLength(1);
    expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Neumann", isActive: true });
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT).map((a) => a.details)).toEqual([
      { employeeId: personMit(ANNA).id },
    ]);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.2 Heirat bei gleicher Adresse, nur einer der zwei Vertraege im Stapel: EMAIL_ANDERER_NAME, keine Aenderung", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
    const vorher = ohne(pdb.personen, ["lastSyncAt", "updatedAt"]);
    const stapel = [zeile({ ...ZWEITER_VERTRAG, nachname: "Neumann" })];

    const r = await abgleichen(stapel);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    expect(r.summary).toMatchObject({ aktualisiert: 0, zweifelsfall: 1 });
    expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(vorher);
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.2 ein abgelaufener Vertrag, dessen Zeile nicht mehr kommt, sperrt den Konsens nicht (Bedingung wie E3)", async () => {
    await abgleichen([zeile({ vertragsende: "2026-10-20" }), zeile(ZWEITER_VERTRAG)]);
    const spaet = new Date("2026-10-26T08:00:00.000Z");
    // 1001 steht noch auf isActive, sein Ende ist aber verstrichen; nur 2002 kommt.
    const stapel = [zeile({ ...ZWEITER_VERTRAG, nachname: "Neumann" })];

    const r = await abgleichen(stapel, spaet);

    expect(r.results[0].status).toBe("aktualisiert");
    expect(personMit(ANNA).lastName).toBe("Neumann");

    await wiederholungAendertNichts(stapel, new Date("2026-10-26T09:00:00.000Z"));
  });

  it("V7.3 Heirat mit neuer Adresse: neue Person aktiv, alte inaktiv mit altem Namen und alter Adresse", async () => {
    await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
    const alt = personMit(ANNA);
    const stapel = [
      zeile({ nachname: "Neumann", email: NEU }),
      zeile({ ...ZWEITER_VERTRAG, nachname: "Neumann", email: NEU }),
    ];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => x.status)).toEqual(["aktualisiert", "aktualisiert"]);
    const neu = personMit(NEU);
    expect(neu).toMatchObject({ firstName: "Anna", lastName: "Neumann", isActive: true });
    expect(pdb.anstellungen.filter((a) => a.employeeId === neu.id)).toHaveLength(2);
    expect(personMit(ANNA)).toMatchObject({ id: alt.id, lastName: "Beispiel", email: ANNA, isActive: false });
    expect(protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN)).toHaveLength(2);
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);
    expect(r.summary).toMatchObject({ stillgelegt: 1, reaktiviert: 0 });

    await wiederholungAendertNichts(stapel);
  });

  it("V7.4 falsche Zeile in DokuBit bearbeitet: der Vertrag wandert zu Q und nach der Korrektur zurueck, P wird reaktiviert", async () => {
    await abgleichen([zeile(), zeile(BERND_ZEILE)]);
    const anna = personMit(ANNA);
    const bernd = personMit(BERND);

    // HR traegt Bernds Namen und Adresse in Annas Zeile 1001 ein.
    const falsch = [zeile({ ...BERND_ZEILE, personalNr: "1001" }), zeile(BERND_ZEILE)];
    let r = await abgleichen(falsch);
    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["aktualisiert", undefined],
      ["unveraendert", undefined],
    ]);
    expect(vertrag("742", "01", "1001").employeeId).toBe(bernd.id);
    expect(personMit(ANNA)).toMatchObject({ id: anna.id, firstName: "Anna", lastName: "Beispiel", isActive: false });
    expect(personMit(BERND)).toMatchObject({ firstName: "Bernd", lastName: "Muster", isActive: true });
    await wiederholungAendertNichts(falsch);

    // Korrektur in DokuBit.
    const richtig = [zeile(), zeile(BERND_ZEILE)];
    r = await abgleichen(richtig);
    expect(r.results.map((x) => x.status)).toEqual(["aktualisiert", "unveraendert"]);
    expect(r.summary).toMatchObject({ reaktiviert: 1, stillgelegt: 0 });
    expect(vertrag("742", "01", "1001").employeeId).toBe(anna.id);
    expect(personMit(ANNA).isActive).toBe(true);
    expect(protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN).map((a) => a.details)).toEqual([
      { schluessel: "742|01|1001", vonEmployeeId: anna.id, nachEmployeeId: bernd.id },
      { schluessel: "742|01|1001", vonEmployeeId: bernd.id, nachEmployeeId: anna.id },
    ]);
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);
    await wiederholungAendertNichts(richtig);
  });

  it("V7.5 wiederverwendeter Schluessel fuer einen neuen Kollegen: neue Person, die alte verliert den Vertrag, nichts umgeschrieben", async () => {
    await abgleichen([zeile()]);
    await abgleichen([zeile({ vertragsende: GESTERN })]);
    const anna = structuredClone(personMit(ANNA));
    expect(anna.isActive).toBe(false);

    const stapel = [zeile({ ...BERND_ZEILE, personalNr: "1001", vertragsbeginn: "2026-10-01" })];
    const r = await abgleichen(stapel);

    expect(r.results[0]).toEqual({ index: 0, status: "aktualisiert", schluessel: "742|01|1001" });
    const bernd = personMit(BERND);
    expect(bernd).toMatchObject({ firstName: "Bernd", lastName: "Muster", isActive: true });
    expect(vertrag("742", "01", "1001")).toMatchObject({
      employeeId: bernd.id,
      isActive: true,
      endDate: null,
      startDate: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(personMit(ANNA)).toEqual(anna);
    expect(r.summary).toMatchObject({ reaktiviert: 0, stillgelegt: 0 });

    await wiederholungAendertNichts(stapel);
  });

  it("V7.6 geteilte Adresse im Stapel: der bekannte Vertrag wandert nicht, kein Name wird geaendert", async () => {
    await abgleichen([zeile()]);
    const vorher = ohne(pdb.personen, ["lastSyncAt", "updatedAt"]);
    // Annas Zeile traegt versehentlich die Adresse, die Bernd (neu) ebenfalls hat.
    const stapel = [zeile({ email: BERND, teilzeitstunden: 25 }), zeile(BERND_ZEILE)];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
    ]);
    expect(r.summary).toMatchObject({ aktualisiert: 1, angelegt: 0 });
    expect(vertrag("742", "01", "1001")).toMatchObject({ employeeId: personMit(ANNA).id, workingHoursWeek: 25 });
    expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(vorher);
    expect(pdb.anstellungen).toHaveLength(1);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.6 geteilte Adresse im Stapel: keine der neuen Zeilen legt an", async () => {
    const stapel = [zeile({ email: GETEILT }), zeile({ ...BERND_ZEILE, email: GETEILT })];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
    ]);
    expect(pdb.personen).toHaveLength(0);
    expect(pdb.anstellungen).toHaveLength(0);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.6 geteilte Adresse blockiert den Anschlussvertrag: Schutz vor Stilllegung („zugang 1“)", async () => {
    await abgleichen([zeile()]);
    const stapel = [
      zeile({ vertragsende: GESTERN }),
      zeile({ personalNr: "1002", vertragsbeginn: "2026-10-17" }),
      zeile({ mandantNummer: "712", personalNr: "77", vorname: "Bernd", nachname: "Muster" }),
    ];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => [x.status, x.code])).toEqual([
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ["zweifelsfall", "EMAIL_ANDERER_NAME"],
    ]);
    // Das Vertragsende ist angekommen, der Anschluss ist nicht zugeordnet — Anna bleibt trotzdem aktiv.
    expect(vertrag("742", "01", "1001").isActive).toBe(false);
    expect(pdb.anstellungen).toHaveLength(1);
    expect(personMit(ANNA).isActive).toBe(true);
    expect(r.summary).toMatchObject({ stillgelegt: 0, aktualisiert: 1 });
    expect(protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT)).toHaveLength(0);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.7 Adresse eines Ausgeschiedenen fuer einen Nachfolger mit anderem Namen: EMAIL_ANDERER_NAME, Q bleibt unveraendert und inaktiv", async () => {
    await abgleichen([zeile()]);
    await abgleichen([zeile({ vertragsende: GESTERN })]);
    const anna = structuredClone(personMit(ANNA));
    expect(anna.isActive).toBe(false);

    const stapel = [zeile({ ...BERND_ZEILE, personalNr: "5005", email: ANNA })];
    const r = await abgleichen(stapel);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    expect(personMit(ANNA)).toEqual(anna);
    expect(pdb.anstellungen).toHaveLength(1);
    expect(r.summary).toMatchObject({ reaktiviert: 0, angelegt: 0 });

    await wiederholungAendertNichts(stapel);
  });

  it("V7.8 Altbestand mit gleichem Namen wird uebernommen, auch unter „ Anna.Beispiel@FES-Minden.de “", async () => {
    const p = neuePerson({ firstName: "Anna", lastName: "Beispiel", email: " Anna.Beispiel@FES-Minden.de " });
    pdb.personen.push(p);
    const stapel = [zeile()];

    const r = await abgleichen(stapel);

    expect(r.results[0].status).toBe("angelegt");
    expect(pdb.personen).toHaveLength(1);
    // Die gespeicherte Adresse bleibt, wie sie ist — die Adresse wird nie umgeschrieben.
    expect(pdb.personen[0]).toMatchObject({ id: p.id, importSource: "DOKUBIT", email: " Anna.Beispiel@FES-Minden.de " });
    expect(vertrag("742", "01", "1001").employeeId).toBe(p.id);
    expect(protokoll(PERSONALSTAMM_ACTIONS.PERSON_UEBERNOMMEN)).toHaveLength(1);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.8 Altbestand mit anderem Namen: EMAIL_ANDERER_NAME, nicht uebernommen, keine zweite Person", async () => {
    pdb.personen.push(neuePerson({ firstName: "Berta", lastName: "Anders", email: " Anna.Beispiel@FES-Minden.de " }));
    const vorher = structuredClone(pdb.personen);
    const stapel = [zeile()];

    const r = await abgleichen(stapel);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    expect(pdb.personen).toEqual(vorher);
    expect(pdb.anstellungen).toHaveLength(0);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.8 Altbestand mit anderem Namen wird auch im Konsens nicht umbenannt (etwa von Hand zurueckgestellt)", async () => {
    await abgleichen([zeile()]);
    personMit(ANNA).importSource = null;
    const vorher = structuredClone(pdb.personen);
    const stapel = [zeile({ nachname: "Neumann" })];

    const r = await abgleichen(stapel);

    expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
    expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(ohne(vorher, ["lastSyncAt", "updatedAt"]));
    expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.9 bekannter Vertrag ohne Adresse: MAIL_FEHLT, das Vertragsende kommt an, die Person wird stillgelegt", async () => {
    await abgleichen([zeile()]);
    const stapel = [zeile({ email: null, vertragsende: GESTERN, nachname: "Neumann" })];

    const r = await abgleichen(stapel, SPAETER);

    expect(r.results[0]).toEqual({ index: 0, status: "zweifelsfall", schluessel: "742|01|1001", code: "MAIL_FEHLT" });
    expect(r.summary).toMatchObject({ zweifelsfall: 1, aktualisiert: 1, stillgelegt: 1 });
    expect(vertrag("742", "01", "1001")).toMatchObject({ isActive: false, endDate: new Date("2026-10-16T00:00:00Z") });
    // Ohne Adresse kein Name: „Neumann“ wird nicht uebernommen.
    expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: false, lastSyncAt: SPAETER });

    await wiederholungAendertNichts(stapel);
  });

  it("V7.10 bekannter Vertrag mit ungueltiger Adresse: FORMATFEHLER email, das Vertragsende kommt an, die Person wird stillgelegt", async () => {
    await abgleichen([zeile()]);
    const stapel = [
      zeile({ email: "anna.beispiel@", vertragsende: GESTERN, nachname: "Neumann" }),
      // Ein unbekannter Vertrag mit ungueltiger Adresse bleibt unangetastet.
      zeile({ personalNr: "1002", email: "-" }),
    ];

    const r = await abgleichen(stapel, SPAETER);

    expect(r.results).toEqual([
      { index: 0, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "email" },
      { index: 1, status: "fehler", schluessel: "742|01|1002", code: "FORMATFEHLER", feld: "email" },
    ]);
    expect(r.summary).toMatchObject({ fehler: 2, aktualisiert: 1, stillgelegt: 1 });
    expect(vertrag("742", "01", "1001")).toMatchObject({ isActive: false, endDate: new Date("2026-10-16T00:00:00Z") });
    expect(pdb.anstellungen).toHaveLength(1);
    expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: false });

    await wiederholungAendertNichts(stapel);
  });

  it("V7.11 doppelter Schluessel: alle Zeilen FORMATFEHLER schluessel, keine verarbeitet", async () => {
    await abgleichen([zeile()]);
    const vorher = { personen: structuredClone(pdb.personen), anstellungen: structuredClone(pdb.anstellungen) };
    fakePrisma.$transaction.mockClear();
    const stapel = [zeile({ vertragsende: GESTERN }), zeile({ ...BERND_ZEILE, personalNr: "1001" })];

    const r = await abgleichen(stapel);

    expect(r.results).toEqual([
      { index: 0, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "schluessel" },
      { index: 1, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "schluessel" },
    ]);
    expect(fakePrisma.$transaction).not.toHaveBeenCalled();
    expect(pdb.personen).toEqual(vorher.personen);
    expect(pdb.anstellungen).toEqual(vorher.anstellungen);

    await wiederholungAendertNichts(stapel);
  });

  it("V7.12 eine Formatfehler-Zeile mit gleicher Adresse und anderem Namen sperrt das Anlegen der gueltigen Zeile", async () => {
    const stapel = [
      zeile({ email: GETEILT }),
      zeile({ ...BERND_ZEILE, email: " Sekretariat@FES-Minden.de ", teilzeitstunden: "viel" }),
    ];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => [x.status, x.code, x.feld])).toEqual([
      ["zweifelsfall", "EMAIL_ANDERER_NAME", undefined],
      ["fehler", "FORMATFEHLER", "teilzeitstunden"],
    ]);
    expect(pdb.personen).toHaveLength(0);
    expect(pdb.anstellungen).toHaveLength(0);
    await wiederholungAendertNichts(stapel);

    // Gegenprobe: ohne die fehlerhafte Zeile wird angelegt.
    expect((await abgleichen([zeile({ email: GETEILT })])).results[0].status).toBe("angelegt");
  });

  it("V7.13 NUL in der MANR: FORMATFEHLER, der Lauf-Eintrag wird geschrieben, sein Schluessel ohne Steuerzeichen", async () => {
    const stapel = [zeile({ personalNr: "10\u000001" }), zeile(BERND_ZEILE)];

    const r = await abgleichen(stapel);

    expect(r.results).toEqual([
      { index: 0, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "personalNr" },
      { index: 1, status: "angelegt", schluessel: "742|01|3003" },
    ]);
    const laeufe = protokoll(PERSONALSTAMM_ACTIONS.LAUF);
    expect(laeufe).toHaveLength(1);
    expect(laeufe[0].details).toEqual({
      zahlen: r.summary,
      meldungen: [{ schluessel: "742|01|1001", code: "FORMATFEHLER" }],
    });
    expect(JSON.stringify(laeufe[0].details)).not.toContain("\\u0000");
    expect(konsole).not.toHaveBeenCalled();

    await wiederholungAendertNichts(stapel);
  });

  it("V7.14 der Vorlauf wirft: alle Zeilen INTERNER_FEHLER, der Lauf-Eintrag wird geschrieben, keine Ausnahme nach aussen", async () => {
    fakePrisma.employee.findMany.mockRejectedValueOnce(Object.assign(new Error(`kaputt ${ANNA}`), { code: "P1001" }));

    const r = await abgleichen([zeile(), zeile(BERND_ZEILE), "kaputt"]);

    expect(r.results).toEqual([
      { index: 0, status: "fehler", schluessel: "742|01|1001", code: "INTERNER_FEHLER" },
      { index: 1, status: "fehler", schluessel: "742|01|3003", code: "INTERNER_FEHLER" },
      { index: 2, status: "fehler", code: "INTERNER_FEHLER" },
    ]);
    expect(r).toMatchObject({ success: false, summary: { zeilen: 3, fehler: 3 } });
    expect(pdb.personen).toHaveLength(0);
    const laeufe = protokoll(PERSONALSTAMM_ACTIONS.LAUF);
    expect(laeufe).toHaveLength(1);
    expect((laeufe[0].details as { meldungen: unknown[] }).meldungen).toHaveLength(3);
    expect(konsole).toHaveBeenCalledWith("[Personalstamm] Vorlauf fehlgeschlagen:", "P1001");
    expect(JSON.stringify(konsole.mock.calls)).not.toMatch(/anna|@/i);

    // Der naechste Lauf holt alles nach.
    const nachgeholt = await abgleichen([zeile(), zeile(BERND_ZEILE)]);
    expect(nachgeholt.results.map((x) => x.status)).toEqual(["angelegt", "angelegt"]);
    await wiederholungAendertNichts([zeile(), zeile(BERND_ZEILE)]);
  });

  it("V7.15 Anschlussvertrag hinter dem beendeten Vorgaenger: kein STILLGELEGT/REAKTIVIERT-Paar", async () => {
    await abgleichen([zeile()]);
    const stapel = [zeile({ vertragsende: GESTERN }), zeile({ personalNr: "1002", vertragsbeginn: "2026-10-17" })];

    const r = await abgleichen(stapel);

    expect(r.results.map((x) => x.status)).toEqual(["aktualisiert", "angelegt"]);
    expect(r.summary).toMatchObject({ stillgelegt: 0, reaktiviert: 0 });
    expect(personMit(ANNA).isActive).toBe(true);
    expect(vertrag("742", "01", "1002").employeeId).toBe(personMit(ANNA).id);
    expect(protokoll(PERSONALSTAMM_ACTIONS.STILLGELEGT)).toHaveLength(0);
    expect(protokoll(PERSONALSTAMM_ACTIONS.REAKTIVIERT)).toHaveLength(0);

    await wiederholungAendertNichts(stapel);
  });

  /** Befunde der Gegenpruefung zum Bau von v3, je einer als eigener Fall. */
  describe("Gegenpruefung zum Bau", () => {
    /** Bernd, dem DokuBit Annas Adresse eintraegt (Nachfolger oder geteiltes Postfach). */
    const BERND_MIT_ANNAS_ADRESSE = { ...BERND_ZEILE, email: ANNA };

    it("Schutz vor Stilllegung nur fuer den eigenen Namen: Nachfolger mit Annas Adresse in derselben Nacht", async () => {
      await abgleichen([zeile()]);
      const stapel = [zeile({ vertragsende: GESTERN }), zeile({ ...BERND_MIT_ANNAS_ADRESSE, personalNr: "5005" })];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ]);
      // Wie ohne Ueberschneidung (V7.7): Annas Zeile laeuft nicht mehr, die blockierte gehoert Bernd.
      expect(r.summary).toMatchObject({ stillgelegt: 1, angelegt: 0 });
      expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Beispiel", isActive: false });
      expect(pdb.anstellungen).toHaveLength(1);

      await wiederholungAendertNichts(stapel);
    });

    it("Schutz vor Stilllegung nur fuer den eigenen Namen: geteiltes Postfach bei Bernds bekanntem Vertrag", async () => {
      await abgleichen([zeile(), zeile(BERND_ZEILE)]);
      const bernd = personMit(BERND);
      const stapel = [zeile({ vertragsende: GESTERN }), zeile(BERND_MIT_ANNAS_ADRESSE)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(r.summary.stillgelegt).toBe(1);
      expect(personMit(ANNA).isActive).toBe(false);
      // Bernds Vertrag bleibt bei ihm und haelt ihn aktiv.
      expect(vertrag("742", "01", "3003").employeeId).toBe(bernd.id);
      expect(personMit(BERND).isActive).toBe(true);

      await wiederholungAendertNichts(stapel);
    });

    it("der Schutz haelt, solange der eigene Anschluss blockiert ist, und endet mit ihm", async () => {
      await abgleichen([zeile()]);
      const anschluss = zeile({ personalNr: "1002", vertragsbeginn: "2026-10-17", vertragsende: "2027-07-31" });
      const geteilt = zeile({ mandantNummer: "712", personalNr: "77", vorname: "Bernd", nachname: "Muster" });
      await abgleichen([zeile({ vertragsende: GESTERN }), anschluss, geteilt]);
      expect(personMit(ANNA).isActive).toBe(true);

      // 34 Tage spaeter ist 1001 aus dem Fenster der Abfrage; der Anschluss ist weiter blockiert.
      let r = await abgleichen([anschluss, geteilt], new Date("2026-11-20T08:00:00.000Z"));
      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(r.summary.stillgelegt).toBe(0);
      expect(personMit(ANNA).isActive).toBe(true);

      // Der nie zugeordnete Anschluss endet: kein Grund mehr fuer den Schutz.
      const stapel = [anschluss, geteilt];
      r = await abgleichen(stapel, new Date("2027-08-02T08:00:00.000Z"));
      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["uebersprungen", undefined],
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ]);
      expect(r.summary.stillgelegt).toBe(1);
      expect(personMit(ANNA).isActive).toBe(false);
      expect(pdb.anstellungen).toHaveLength(1);

      await wiederholungAendertNichts(stapel, new Date("2027-08-02T09:00:00.000Z"));
    });

    it.each([
      ["der gueltige Zwilling beendet den Vertrag", [zeile({ vertragsende: GESTERN }), zeile({ teilzeitstunden: "viel" })]],
      [
        "der gueltige Zwilling gehoert einem anderen",
        [zeile({ ...BERND_ZEILE, personalNr: "1001" }), zeile({ teilzeitstunden: "viel" })],
      ],
    ])("V7.11 doppelter Schluessel, ein Zwilling mit Formatfehler (%s): keine Zeile verarbeitet", async (_fall, stapel) => {
      await abgleichen([zeile()]);
      const vorher = { personen: structuredClone(pdb.personen), anstellungen: structuredClone(pdb.anstellungen) };
      fakePrisma.$transaction.mockClear();

      const r = await abgleichen(stapel);

      expect(r.results).toEqual([
        { index: 0, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "schluessel" },
        { index: 1, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "schluessel" },
      ]);
      expect(fakePrisma.$transaction).not.toHaveBeenCalled();
      expect(pdb.personen).toEqual(vorher.personen);
      expect(pdb.anstellungen).toEqual(vorher.anstellungen);

      await wiederholungAendertNichts(stapel);
    });

    it("im Konsens nur ein neuer Vor- oder Nachname: ein ganz anderer Name schreibt die Person nicht um", async () => {
      await abgleichen([zeile({ email: GETEILT })]);
      const vorher = ohne(pdb.personen, ["lastSyncAt", "updatedAt"]);
      // Stelle neu besetzt, Zeile und Postfach behalten.
      const stapel = [zeile({ email: GETEILT, vorname: "Bernd", nachname: "Muster" })];

      const r = await abgleichen(stapel);

      expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
      expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(vorher);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);
      await wiederholungAendertNichts(stapel);

      // Gegenprobe: Ein neuer Vorname allein wird uebernommen.
      const vorname = await abgleichen([zeile({ email: GETEILT, vorname: "Anne" })]);
      expect(vorname.results[0].status).toBe("aktualisiert");
      expect(personMit(GETEILT)).toMatchObject({ firstName: "Anne", lastName: "Beispiel" });
    });

    it("Heirat, neue Adresse nur bei einem von zwei Vertraegen: der verbliebene Datensatz folgt dem Namen im zweiten Lauf", async () => {
      await abgleichen([zeile(), zeile(ZWEITER_VERTRAG)]);
      const anna = personMit(ANNA);
      const stapel = [zeile({ email: NEU, nachname: "Neumann" }), zeile({ ...ZWEITER_VERTRAG, nachname: "Neumann" })];

      // Lauf 1: 1001 zieht um; 2002 meldet, weil 1001 vor dem Lauf noch Annas laufender Vertrag war.
      let r = await abgleichen(stapel);
      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["aktualisiert", undefined],
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ]);
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Beispiel", isActive: true });

      // Lauf 2: 2002 ist Annas einziger laufender Vertrag — Konsens, die Meldung verschwindet.
      r = await abgleichen(stapel, SPAETER);
      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["unveraendert", undefined],
        ["aktualisiert", undefined],
      ]);
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Neumann", email: ANNA, isActive: true });
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(1);

      await wiederholungAendertNichts(stapel, new Date("2026-10-17T10:00:00.000Z"));
    });

    it("zwei gleichzeitige Aufrufe laufen nacheinander: keine doppelte Person beim Umzug eines Vertrags", async () => {
      await abgleichen([zeile()]);
      const alt = personMit(ANNA);

      const [a, b] = await Promise.all([abgleichen([zeile({ email: NEU })]), abgleichen([zeile({ email: NEU })])]);

      expect([a.results[0].status, b.results[0].status]).toEqual(["aktualisiert", "unveraendert"]);
      expect(pdb.personen.filter((p) => p.email === NEU)).toHaveLength(1);
      expect(protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN).map((x) => x.details)).toEqual([
        { schluessel: "742|01|1001", vonEmployeeId: alt.id, nachEmployeeId: personMit(NEU).id },
      ]);
      expect(protokoll(PERSONALSTAMM_ACTIONS.LAUF)).toHaveLength(3);
    });

    it("nur ein Zweifelsfall schuetzt: scheitert der Anschluss am unbekannten Mandanten, wird stillgelegt, bis der Mandant da ist", async () => {
      await abgleichen([zeile()]);
      const stapel = [
        zeile({ vertragsende: GESTERN }),
        zeile({ mandantNummer: "770", personalNr: "1002", vertragsbeginn: "2026-10-17" }),
      ];

      let r = await abgleichen(stapel);
      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["aktualisiert", undefined],
        ["fehler", "MANDANT_UNBEKANNT"],
      ]);
      expect(r.summary.stillgelegt).toBe(1);
      expect(personMit(ANNA).isActive).toBe(false);

      // Mandant im Portal angelegt: Der naechste Lauf ordnet den Anschluss zu und reaktiviert.
      pdb.organisationen.push(neueOrganisation("770"));
      r = await abgleichen(stapel, SPAETER);
      expect(r.results.map((x) => x.status)).toEqual(["unveraendert", "angelegt"]);
      expect(r.summary.reaktiviert).toBe(1);
      expect(personMit(ANNA).isActive).toBe(true);
      expect(vertrag("770", "01", "1002").employeeId).toBe(personMit(ANNA).id);
    });

    it("V7.13 einzelnes UTF-16-Surrogat in MANR oder Abrechnungskreis: FORMATFEHLER nur dieser Zeile, der Lauf traegt die Meldungen", async () => {
      const stapel = [
        zeile({ personalNr: "10\uD80001" }),
        zeile({ ...BERND_ZEILE, abrechnungskreis: "0\uDC001" }),
        zeile({ mandantNummer: "999", personalNr: "4", email: "xaver.fremd@fes-minden.de", vorname: "Xaver" }),
        zeile({ personalNr: "5005", email: "clara.probe@mvs-minden.de", vorname: "Clara", nachname: "Probe" }),
      ];

      const r = await abgleichen(stapel);

      expect(r.results).toEqual([
        { index: 0, status: "fehler", schluessel: "742|01|1001", code: "FORMATFEHLER", feld: "personalNr" },
        { index: 1, status: "fehler", schluessel: "742|01|3003", code: "FORMATFEHLER", feld: "abrechnungskreis" },
        { index: 2, status: "fehler", schluessel: "999|01|4", code: "MANDANT_UNBEKANNT" },
        { index: 3, status: "angelegt", schluessel: "742|01|5005" },
      ]);
      const laeufe = protokoll(PERSONALSTAMM_ACTIONS.LAUF);
      expect(laeufe).toHaveLength(1);
      expect(laeufe[0].details).toEqual({
        zahlen: r.summary,
        meldungen: [
          { schluessel: "742|01|1001", code: "FORMATFEHLER" },
          { schluessel: "742|01|3003", code: "FORMATFEHLER" },
          { schluessel: "999|01|4", code: "MANDANT_UNBEKANNT" },
        ],
      });
      expect(konsole).not.toHaveBeenCalled();

      await wiederholungAendertNichts(stapel);
    });
  });

  /**
   * Anschluss nach dem Ende des Vorgaengers, nur mit Nachweis (Entscheidungen
   * R2 und F des Auftraggebers vom 17.10.2026): Eine DokuBit-Person ohne
   * laufenden Vertrag benennt eine LAUFENDE Zeile um und bekommt ihren
   * Vertrag, wenn der Vorname bleibt, alle Zeilen ihrer Adresse im Stapel
   * denselben Namen tragen und als Nachweis die Zeile eines ihrer Vertraege
   * unter derselben Adresse kommt, die ihn hoechstens 30 Kalendertage vor
   * heute enden laesst und seinen gespeicherten Beginn nennt. Sonst
   * EMAIL_ANDERER_NAME. Die frueheren Restrisiken (Zeile des alten Vertrags
   * nicht unter der Adresse, neu vergebener Schluessel samt Postfach, auch
   * wenn der Vertrag der Nachfolgerin darauf endet) sind damit gesperrt.
   */
  describe("Anschluss nach dem Ende des Vorgaengers, nur mit Nachweis (Entscheidungen R2 und F vom 17.10.2026)", () => {
    /** Annas Anschlussvertrag mit neuem Nachnamen (Heirat), beginnt heute. */
    const ANSCHLUSS = { personalNr: "1002", vertragsbeginn: "2026-10-17", nachname: "Neumann" };

    /** Nachweis: die Zeile des alten Vertrags 1001, Ende `ende`, mit dem neuen Namen unter Annas Adresse. */
    function nachweis(ende: string, ueber: Record<string, unknown> = {}) {
      return zeile({ vertragsende: ende, nachname: "Neumann", ...ueber });
    }

    /** Anna mit Vertrag 1001 bis `ende`; der Lauf am Tag danach hat sie stillgelegt. */
    async function ausgeschieden(ende: string) {
      await abgleichen([zeile({ vertragsende: ende })], new Date("2026-09-01T08:00:00.000Z"));
      await abgleichen([zeile({ vertragsende: ende })], new Date(`${tageSpaeter(ende, 1)}T08:00:00.000Z`));
      expect(personMit(ANNA).isActive).toBe(false);
    }

    const ohneSync = (zeilen: Zeile[]) => ohne(zeilen, ["lastSyncAt", "updatedAt"]);

    it("Heirat mit Nachweis (alte Zeile mit neuem Namen unter der Adresse), Vorgaenger gestern beendet: Q umbenannt, Vertrag an Q, Q aktiv", async () => {
      await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-01T08:00:00.000Z"));
      const anna = personMit(ANNA);
      const stapel = [nachweis(GESTERN), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      // Der Nachweis kommt vor dem Anschluss dran (bekannte zuerst) und laeuft nicht:
      // In diesem Lauf wird er noch gemeldet, der Anschluss benennt um.
      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
        ["angelegt", undefined],
      ]);
      expect(pdb.personen).toHaveLength(1);
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, firstName: "Anna", lastName: "Neumann", isActive: true });
      expect(vertrag("742", "01", "1002")).toMatchObject({ employeeId: anna.id, isActive: true });
      expect(vertrag("742", "01", "1001")).toMatchObject({ employeeId: anna.id, isActive: false });
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT).map((a) => a.details)).toEqual([{ employeeId: anna.id }]);
      expect(r.summary).toMatchObject({ stillgelegt: 0, reaktiviert: 0 });

      // Ab dem naechsten Lauf passt der Name auch zur beendeten Zeile: keine Meldung mehr.
      const zweiter = await wiederholungAendertNichts(stapel);
      expect(zweiter.results.map((x) => [x.status, x.code])).toEqual([
        ["unveraendert", undefined],
        ["unveraendert", undefined],
      ]);
    });

    it("Ende vor 31 Tagen: EMAIL_ANDERER_NAME, Q bleibt unveraendert und inaktiv", async () => {
      await ausgeschieden("2026-09-16");
      const vorher = ohneSync(pdb.personen);
      // Mit Nachweis, damit nur das Fenster sperrt (n8n liefert die Zeile ab dem 31. Tag ohnehin nicht mehr).
      const stapel = [nachweis("2026-09-16"), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(ohneSync(pdb.personen)).toEqual(vorher);
      expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: false });
      expect(pdb.anstellungen).toHaveLength(1);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

      await wiederholungAendertNichts(stapel);
    });

    it("Ende genau vor 30 Tagen: uebernommen — umbenannt, Vertrag an Q, Q reaktiviert", async () => {
      await ausgeschieden("2026-09-17");
      const anna = personMit(ANNA);
      const stapel = [nachweis("2026-09-17"), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
        ["angelegt", undefined],
      ]);
      expect(r.summary).toMatchObject({ angelegt: 1, reaktiviert: 1, stillgelegt: 0 });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, firstName: "Anna", lastName: "Neumann", isActive: true });
      expect(vertrag("742", "01", "1002").employeeId).toBe(anna.id);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT).map((a) => a.details)).toEqual([{ employeeId: anna.id }]);
      expect(protokoll(PERSONALSTAMM_ACTIONS.REAKTIVIERT).map((a) => a.details)).toEqual([{ employeeId: anna.id }]);

      await wiederholungAendertNichts(stapel);
    });

    it("anderer Vorname, gleicher Nachname: EMAIL_ANDERER_NAME, Q bleibt unveraendert", async () => {
      await ausgeschieden(GESTERN);
      const vorher = ohneSync(pdb.personen);
      const berta = { vorname: "Berta", nachname: "Beispiel" };
      const stapel = [nachweis(GESTERN, berta), zeile({ ...ANSCHLUSS, ...berta })];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(ohneSync(pdb.personen)).toEqual(vorher);
      expect(pdb.anstellungen).toHaveLength(1);

      await wiederholungAendertNichts(stapel);
    });

    it("Altbestand (importSource null) wird ueber den Anschluss nicht umbenannt und nicht uebernommen", async () => {
      await ausgeschieden(GESTERN);
      personMit(ANNA).importSource = null;
      const vorher = ohneSync(pdb.personen);
      const stapel = [nachweis(GESTERN), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(ohneSync(pdb.personen)).toEqual(vorher);
      expect(pdb.anstellungen).toHaveLength(1);
      expect(protokoll(PERSONALSTAMM_ACTIONS.PERSON_UEBERNOMMEN)).toHaveLength(0);

      await wiederholungAendertNichts(stapel);
    });

    it.each([
      ["die beendete Zeile des Vorgaengers traegt noch den alten Namen", [zeile({ vertragsende: GESTERN }), zeile(ANSCHLUSS)]],
      ["ein anderer Mensch mit derselben Adresse", [zeile(ANSCHLUSS), zeile({ ...BERND_ZEILE, personalNr: "5005", email: ANNA })]],
    ])("geteilte Adresse im Stapel (%s): gesperrt, Q nicht umbenannt, kein Vertrag an Q", async (_fall, stapel) => {
      await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-01T08:00:00.000Z"));

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Beispiel", isActive: false });
      expect(pdb.anstellungen).toHaveLength(1);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

      await wiederholungAendertNichts(stapel);
    });

    it("nur eine laufende Zeile benennt um: der Nachweis allein wird gemeldet", async () => {
      await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-01T08:00:00.000Z"));
      const stapel = [nachweis(GESTERN)];

      const r = await abgleichen(stapel);

      expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
      expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: false });
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

      await wiederholungAendertNichts(stapel);
    });

    it("gilt nur ohne laufenden Vertrag: ein laufender Vertrag, dessen Zeile nicht unter der Adresse kommt, sperrt auch mit Nachweis", async () => {
      const zweiter = { ...ZWEITER_VERTRAG, vertragsende: "2027-07-31" };
      await abgleichen([zeile({ vertragsende: GESTERN }), zeile(zweiter)], new Date("2026-10-01T08:00:00.000Z"));
      const vorher = ohneSync(pdb.personen);
      // 2002 laeuft bis 2027 und kommt ohne Adresse: kein Anschluss, und im Konsens fehlt er.
      const stapel = [nachweis(GESTERN), zeile({ ...zweiter, nachname: "Neumann", email: null }), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "MAIL_FEHLT", "EMAIL_ANDERER_NAME"]);
      expect(ohneSync(pdb.personen)).toEqual(vorher);
      expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: true });
      expect(pdb.anstellungen).toHaveLength(2);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

      await wiederholungAendertNichts(stapel);
    });

    it("korrigiert der Nachweis das Ende des alten Vertrags ins Fenster, greift der Anschluss schon in diesem Lauf", async () => {
      await abgleichen([zeile({ vertragsende: "2026-08-31" })], new Date("2026-08-01T08:00:00.000Z"));
      await abgleichen([zeile({ vertragsende: "2026-08-31" })], new Date("2026-09-01T08:00:00.000Z"));
      const anna = personMit(ANNA);
      expect(anna.isActive).toBe(false);
      // In DokuBit: Ende vom 31.08. auf den 10.10. korrigiert, neuer Nachname auch dort; dazu der Anschluss.
      const stapel = [nachweis("2026-10-10"), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
        ["angelegt", undefined],
      ]);
      expect(r.summary).toMatchObject({ reaktiviert: 1, stillgelegt: 0 });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Neumann", isActive: true });
      expect(vertrag("742", "01", "1002").employeeId).toBe(anna.id);
      expect(vertrag("742", "01", "1001").endDate).toEqual(new Date("2026-10-10T00:00:00.000Z"));

      await wiederholungAendertNichts(stapel);
    });

    it("lief der alte Vertrag vor dem Lauf noch und kommt seine Zeile ohne Adresse: kein Nachweis — gesperrt, auch im naechsten Lauf", async () => {
      await abgleichen([zeile()], new Date("2026-10-01T08:00:00.000Z"));
      const anna = personMit(ANNA);
      // In DokuBit: Ende 16.10. nachgetragen und das Postfach von der alten Zeile genommen.
      const stapel = [zeile({ vertragsende: GESTERN, email: null }), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      // Das Ende kommt an (P2), der Anschluss nicht: Anna wird stillgelegt.
      expect(r.results.map((x) => x.code)).toEqual(["MAIL_FEHLT", "EMAIL_ANDERER_NAME"]);
      expect(r.summary).toMatchObject({ stillgelegt: 1, angelegt: 0 });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Beispiel", isActive: false });
      expect(vertrag("742", "01", "1001").isActive).toBe(false);

      // Frueher griff der Anschluss hier im zweiten Lauf (Ausnahme von der Wiederholbarkeit) — jetzt nicht mehr.
      await wiederholungAendertNichts(stapel);
    });

    it("Abhilfe ohne Nachweis (alte Zeile ohne Adresse): den Namen im Portal per PATCH nachziehen — der naechste Lauf ordnet zu", async () => {
      await ausgeschieden(GESTERN);
      const anna = personMit(ANNA);
      const stapel = [zeile({ vertragsende: GESTERN, email: null }), zeile(ANSCHLUSS)];
      await abgleichen(stapel);
      expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: false });

      personMit(ANNA).lastName = "Neumann"; // PATCH /api/employees/[id]
      const r = await abgleichen(stapel, SPAETER);

      expect(r.summary).toMatchObject({ angelegt: 1, reaktiviert: 1 });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Neumann", isActive: true });
      expect(vertrag("742", "01", "1002").employeeId).toBe(anna.id);

      await wiederholungAendertNichts(stapel, new Date("2026-10-18T08:00:00.000Z"));
    });

    it("alte Zeile noch mit altem Namen: ein PATCH des Namens hilft nicht, solange n8n sie liefert", async () => {
      await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-01T08:00:00.000Z"));
      const stapel = [zeile({ vertragsende: GESTERN }), zeile(ANSCHLUSS)];
      await abgleichen(stapel);
      expect(personMit(ANNA)).toMatchObject({ lastName: "Beispiel", isActive: false });

      personMit(ANNA).lastName = "Neumann"; // PATCH /api/employees/[id]
      const r = await abgleichen(stapel, new Date("2026-10-18T08:00:00.000Z"));

      // Die Adresse steht im Stapel weiter bei zwei Namen.
      expect(r.results.map((x) => x.code)).toEqual(["EMAIL_ANDERER_NAME", "EMAIL_ANDERER_NAME"]);
      expect(personMit(ANNA).isActive).toBe(false);
      expect(pdb.anstellungen).toHaveLength(1);

      // Ab dem 31. Tag nach dem Ende liefert n8n die alte Zeile nicht mehr: Jetzt ordnet der Lauf den Anschluss zu.
      await abgleichen([zeile(ANSCHLUSS)], new Date("2026-11-16T08:00:00.000Z"));

      expect(personMit(ANNA)).toMatchObject({ lastName: "Neumann", isActive: true });
      expect(vertrag("742", "01", "1002").employeeId).toBe(personMit(ANNA).id);
    });

    it("alte Zeile noch mit altem Namen: den neuen Namen auch dort in DokuBit eintragen — der naechste Lauf ordnet zu und reaktiviert", async () => {
      await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-01T08:00:00.000Z"));
      await abgleichen([zeile({ vertragsende: GESTERN }), zeile(ANSCHLUSS)]);
      const anna = personMit(ANNA);
      expect(anna.isActive).toBe(false);
      const stapel = [nachweis(GESTERN), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel, new Date("2026-10-18T08:00:00.000Z"));

      expect(r.summary).toMatchObject({ angelegt: 1, reaktiviert: 1 });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Neumann", isActive: true });
      expect(vertrag("742", "01", "1002").employeeId).toBe(anna.id);

      await wiederholungAendertNichts(stapel, new Date("2026-10-19T08:00:00.000Z"));
    });

    /** Nachfolgerin mit Annas Vornamen und eigenem Vertrag ab heute, der DokuBit Annas Postfach gibt. */
    const NACHFOLGERIN = { personalNr: "9009", nachname: "Schmidt", vertragsbeginn: "2026-10-17" };
    const SCHMIDT = "anna.schmidt@fes-minden.de";

    it.each([
      ["ohne Adresse", { email: null }],
      ["mit einer anderen Adresse", { email: "anna.privat@example.de" }],
      ["mit einer ungueltigen Adresse", { email: "anna.beispiel@" }],
      ["gar nicht (in DokuBit geloescht)", null],
    ])(
      "ohne Nachweis — die Zeile des alten Vertrags kommt %s: EMAIL_ANDERER_NAME, eine Nachfolgerin mit demselben Vornamen uebernimmt Annas Datensatz nicht",
      async (_fall, alteZeile) => {
        await ausgeschieden(GESTERN);
        const vorher = { personen: ohneSync(pdb.personen), anstellungen: ohne(pdb.anstellungen, ["updatedAt"]) };
        const alt = alteZeile ? [zeile({ vertragsende: GESTERN, ...alteZeile })] : [];
        const stapel = [...alt, zeile(NACHFOLGERIN)];

        const r = await abgleichen(stapel);

        expect(r.results.at(-1)).toEqual({
          index: alt.length,
          status: "zweifelsfall",
          schluessel: "742|01|9009",
          code: "EMAIL_ANDERER_NAME",
        });
        expect(r.summary).toMatchObject({ angelegt: 0, reaktiviert: 0 });
        expect(ohneSync(pdb.personen)).toEqual(vorher.personen);
        expect(ohne(pdb.anstellungen, ["updatedAt"])).toEqual(vorher.anstellungen);
        expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Beispiel", isActive: false });
        expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

        await wiederholungAendertNichts(stapel);
      },
    );

    it("ohne Nachweis — die Zeile unter der Adresse gehoert zu keinem Vertrag von Anna (im Portal geloescht): EMAIL_ANDERER_NAME", async () => {
      await ausgeschieden(GESTERN);
      pdb.anstellungen = [];
      const vorher = ohneSync(pdb.personen);
      const stapel = [nachweis(GESTERN), zeile(ANSCHLUSS)];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["uebersprungen", undefined],
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ]);
      expect(ohneSync(pdb.personen)).toEqual(vorher);
      expect(pdb.anstellungen).toHaveLength(0);

      await wiederholungAendertNichts(stapel);
    });

    it("ohne Nachweis wandert der Vertrag einer Nachfolgerin mit eigenem Datensatz nicht zu Anna: ihr Datensatz bleibt aktiv", async () => {
      const seit = { ...NACHFOLGERIN, vertragsbeginn: "2026-10-01" };
      const vorher = [zeile({ vertragsende: GESTERN }), zeile({ ...seit, email: SCHMIDT })];
      await abgleichen(vorher, new Date("2026-10-01T08:00:00.000Z"));
      await abgleichen(vorher);
      const anna = personMit(ANNA);
      const schmidt = personMit(SCHMIDT);
      expect(anna.isActive).toBe(false);
      // DokuBit gibt der Nachfolgerin Annas Postfach und nimmt es von Annas alter Zeile.
      const stapel = [zeile({ vertragsende: GESTERN, email: null }), zeile(seit)];

      const r = await abgleichen(stapel, SPAETER);

      expect(r.results.map((x) => x.code)).toEqual(["MAIL_FEHLT", "EMAIL_ANDERER_NAME"]);
      expect(r.summary).toMatchObject({ stillgelegt: 0, reaktiviert: 0 });
      expect(vertrag("742", "01", "9009")).toMatchObject({ employeeId: schmidt.id, isActive: true });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Beispiel", isActive: false });
      expect(personMit(SCHMIDT)).toMatchObject({ id: schmidt.id, isActive: true });
      expect(protokoll(PERSONALSTAMM_ACTIONS.VERTRAG_UMGEZOGEN)).toHaveLength(0);

      await wiederholungAendertNichts(stapel, new Date("2026-10-18T08:00:00.000Z"));
    });

    it.each([
      ["innerhalb von 30 Tagen, gleicher Vorname", GESTERN, { nachname: "Schmidt" }],
      ["innerhalb von 30 Tagen, gleicher Vorname, befristet", GESTERN, { nachname: "Schmidt", vertragsende: "2027-07-31" }],
      ["innerhalb von 30 Tagen, ganz anderer Name", GESTERN, { vorname: "Berta", nachname: "Muster" }],
      ["nach mehr als 30 Tagen, gleicher Vorname", "2026-08-31", { nachname: "Schmidt" }],
      ["nach mehr als 30 Tagen, ganz anderer Name (V7.7)", "2026-08-31", { vorname: "Berta", nachname: "Muster" }],
    ])(
      "neu vergebener Vertragsschluessel samt Postfach (%s): kein Nachweis, der Vertrag bleibt beendet, Anna unveraendert und inaktiv (P2)",
      async (_fall, ende, neu) => {
        await abgleichen([zeile({ vertragsende: ende })], new Date("2026-08-01T08:00:00.000Z"));
        await abgleichen([zeile({ vertragsende: ende })], new Date(`${tageSpaeter(ende, 1)}T08:00:00.000Z`));
        expect(personMit(ANNA).isActive).toBe(false);
        const vorher = structuredClone({ personen: pdb.personen, anstellungen: pdb.anstellungen });
        // Die Zeile laeuft selbst — sie ist kein Nachweis; als Zweifelsfall laesst sie den Vertrag liegen.
        const stapel = [zeile({ ...neu, vertragsbeginn: "2026-10-17" })];

        const r = await abgleichen(stapel, SPAETER);

        expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
        expect(r.summary).toMatchObject({ aktualisiert: 0, reaktiviert: 0 });
        expect(pdb.personen).toEqual(vorher.personen);
        expect(pdb.anstellungen).toEqual(vorher.anstellungen);

        await wiederholungAendertNichts(stapel, new Date("2026-10-18T08:00:00.000Z"));
      },
    );

    it("neu vergebener Schluessel samt Postfach, dessen Vertrag die Nachfolgerin gleichen Vornamens beendet, neben ihrem Anschluss: kein Nachweis (anderer Beginn), auch nicht in der zweiten Nacht", async () => {
      await abgleichen([zeile({ vertragsende: "2026-06-30" })], new Date("2026-06-01T08:00:00.000Z"));
      await abgleichen([zeile({ vertragsende: "2026-06-30" })], new Date("2026-07-01T08:00:00.000Z"));
      const anna = personMit(ANNA);
      expect(anna.isActive).toBe(false);
      // DokuBit vergibt 1001 samt Postfach am 01.09. an Anna Schmidt, befristet bis gestern.
      const nachfolgerin = { nachname: "Schmidt", vertragsbeginn: "2026-09-01", vertragsende: GESTERN };
      await abgleichen([zeile(nachfolgerin)], new Date("2026-09-01T08:00:00.000Z"));
      const stapel = [zeile(nachfolgerin), zeile({ nachname: "Schmidt", personalNr: "1003", vertragsbeginn: "2026-10-17" })];

      const r = await abgleichen(stapel);

      expect(r.results.map((x) => [x.status, x.code])).toEqual([
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
        ["zweifelsfall", "EMAIL_ANDERER_NAME"],
      ]);
      expect(r.summary).toMatchObject({ angelegt: 0, reaktiviert: 0 });
      expect(personMit(ANNA)).toMatchObject({ id: anna.id, firstName: "Anna", lastName: "Beispiel", isActive: false });
      // Nur das Ende kommt an, der Beginn bleibt Annas — so ist die Zeile auch morgen kein Nachweis.
      expect(vertrag("742", "01", "1001")).toMatchObject({
        employeeId: anna.id,
        isActive: false,
        startDate: new Date("2024-08-01T00:00:00Z"),
        endDate: new Date("2026-10-16T00:00:00Z"),
      });
      expect(pdb.anstellungen).toHaveLength(1);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);

      await wiederholungAendertNichts(stapel, new Date("2026-10-18T08:00:00.000Z"));
    });
  });

  /**
   * Zweifel verschafft nie Zugang (Entscheidung P2 des Auftraggebers vom
   * 17.10.2026): In jedem Zweifelsfall- und Fehlerzweig bleibt ein bekannter
   * Vertrag bei seiner Person. Beendet die Zeile ihn, kommt das Ende an, und
   * nur das Ende; laeuft sie, wird nur ein gespeichert laufender Vertrag
   * aufgefrischt — die Stunden (nur bei gleichem Beginn) und ein frueheres
   * Ende, nie ein spaeteres oder leeres, nie der Beginn — ein gespeichert
   * nicht laufender bleibt unberuehrt und die Person inaktiv. So haengt das
   * Ergebnis auch nicht davon ab, ob dieselbe Zeile vor oder nach dem
   * gespeicherten Ende ankommt.
   */
  describe("Zweifel verschafft nie Zugang (Entscheidung P2 vom 17.10.2026)", () => {
    /** Adresse einer zweiten Person, die nicht der Abgleich fuehrt. */
    const FREMD = "verwaltung@fes-minden.de";
    const zweitePerson = (daten: Zeile) => () => {
      pdb.personen.push(neuePerson({ firstName: "Anna", lastName: "Beispiel", ...daten }));
    };

    /**
     * Zweig: Name, Grundcode, Vorbereitung nach Annas Anlage, Zeilen des Stapels (Annas Vertrag 1001
     * zuerst) und ob die Zeile Annas Namen unter Annas Adresse traegt — dann schuetzt sie Anna vor
     * der Stilllegung (V4), solange sie laeuft.
     */
    const zweige: [string, PersonalstammGrundcode, () => void, (ueber: Zeile) => Zeile[], boolean][] = [
      ["anderer Name", "EMAIL_ANDERER_NAME", () => {}, (u) => [zeile({ ...u, ...BERND_ZEILE, personalNr: "1001", email: ANNA })], false],
      ["geteilte Adresse im Stapel", "EMAIL_ANDERER_NAME", () => {}, (u) => [zeile(u), zeile({ ...BERND_ZEILE, personalNr: "5005", email: ANNA })], true],
      ["mehrere Personen mit der Adresse", "EMAIL_MEHRDEUTIG", zweitePerson({ email: " Anna.Beispiel@FES-Minden.de " }), (u) => [zeile(u)], true],
      ["Adresse einer von Hand gefuehrten Person", "MANUELLER_DATENSATZ", zweitePerson({ email: FREMD, importSource: "MANUELL" }), (u) => [zeile({ ...u, email: FREMD })], false],
      ["Adresse einer Person aus einer anderen Quelle", "FREMDE_QUELLE", zweitePerson({ email: FREMD, importSource: "LOGA" }), (u) => [zeile({ ...u, email: FREMD })], false],
      ["ohne Adresse", "MAIL_FEHLT", () => {}, (u) => [zeile({ ...u, email: null })], false],
      ["ungueltige Adresse", "FORMATFEHLER", () => {}, (u) => [zeile({ ...u, email: "anna.beispiel@" })], false],
    ];

    describe.each(zweige)("%s (%s)", (_zweig, code, vorbereiten, zeilen, eigeneZeile) => {
      const status = code === "FORMATFEHLER" ? "fehler" : "zweifelsfall";

      it("gespeichert nicht laufend, Zeile laeuft: nichts geaendert, Anna bleibt inaktiv", async () => {
        await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-01T08:00:00.000Z"));
        await abgleichen([zeile({ vertragsende: GESTERN })]);
        vorbereiten();
        const vorher = structuredClone({ personen: pdb.personen, anstellungen: pdb.anstellungen });
        const stapel = zeilen({ vertragsbeginn: "2026-10-17", teilzeitstunden: 25 });

        const r = await abgleichen(stapel, SPAETER);

        expect(r.results[0]).toMatchObject({ status, code });
        expect(r.summary).toMatchObject({ aktualisiert: 0, angelegt: 0, reaktiviert: 0 });
        // Kein Reaktivieren, kein neues Ende, keine Stunden — und kein lastSyncAt.
        expect(pdb.personen).toEqual(vorher.personen);
        expect(pdb.anstellungen).toEqual(vorher.anstellungen);
        expect(personMit(ANNA).isActive).toBe(false);

        await wiederholungAendertNichts(stapel, new Date("2026-10-18T08:00:00.000Z"));
      });

      it("gespeichert laufend, Zeile beendet ihn: nur das Ende kommt an (kein Beginn, keine Stunden), Anna wird stillgelegt", async () => {
        await abgleichen([zeile()], new Date("2026-10-01T08:00:00.000Z"));
        const anna = personMit(ANNA);
        vorbereiten();
        const stapel = zeilen({ vertragsende: GESTERN, vertragsbeginn: "2026-09-01", teilzeitstunden: 39 });

        const r = await abgleichen(stapel);

        expect(r.results[0]).toMatchObject({ status, code });
        expect(r.summary).toMatchObject({ aktualisiert: 1, stillgelegt: 1, reaktiviert: 0 });
        expect(vertrag("742", "01", "1001")).toMatchObject({
          employeeId: anna.id,
          isActive: false,
          endDate: new Date("2026-10-16T00:00:00Z"),
          startDate: new Date("2024-08-01T00:00:00Z"),
          workingHoursWeek: 20,
        });
        expect(personMit(ANNA)).toMatchObject({ id: anna.id, firstName: "Anna", lastName: "Beispiel", isActive: false });

        await wiederholungAendertNichts(stapel);
      });

      it.each([
        ["unbefristet", null],
        ["laenger", "2027-07-31"],
      ])(
        "gespeichert laufend bis 20.10., Zeile laeuft %s mit anderem Beginn: Ende, Beginn und Stunden bleiben; ab 21.10. stillgelegt, ausser Annas eigene Zeile schuetzt",
        async (_fall, ende) => {
          await abgleichen([zeile({ vertragsende: "2026-10-20" })], new Date("2026-10-01T08:00:00.000Z"));
          const anna = personMit(ANNA);
          vorbereiten();
          // Etwa: DokuBit hat Schluessel 1001 schon an jemanden vergeben, der am 21.10. beginnt.
          const stapel = zeilen({ vertragsende: ende, vertragsbeginn: "2026-10-21", teilzeitstunden: 25 });
          const gespeichert = {
            employeeId: anna.id,
            isActive: true,
            endDate: new Date("2026-10-20T00:00:00Z"),
            startDate: new Date("2024-08-01T00:00:00Z"),
            workingHoursWeek: 20,
          };

          const r = await abgleichen(stapel);

          expect(r.results[0]).toMatchObject({ status, code });
          expect(r.summary).toMatchObject({ aktualisiert: 0, stillgelegt: 0 });
          expect(vertrag("742", "01", "1001")).toMatchObject(gespeichert);
          expect(personMit(ANNA).isActive).toBe(true);
          await wiederholungAendertNichts(stapel);

          // Am Tag nach dem gespeicherten Ende: wie ohne die Zeile. Annas eigene Zeile unter ihrer
          // Adresse haelt sie aktiv, solange sie kommt und laeuft (V4; entschieden am 17.10.2026).
          const tagDanach = await abgleichen(stapel, new Date("2026-10-21T08:00:00.000Z"));

          expect(tagDanach.summary).toMatchObject({ aktualisiert: 0, stillgelegt: eigeneZeile ? 0 : 1, reaktiviert: 0 });
          expect(vertrag("742", "01", "1001")).toMatchObject(gespeichert);
          expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Beispiel", isActive: eigeneZeile });
          await wiederholungAendertNichts(stapel, new Date("2026-10-21T09:00:00.000Z"));
        },
      );

      it("gespeichert laufend, Zeile laeuft: aufgefrischt, bleibt bei Anna, Anna aktiv", async () => {
        await abgleichen([zeile()], new Date("2026-10-01T08:00:00.000Z"));
        const anna = personMit(ANNA);
        vorbereiten();
        const stapel = zeilen({ teilzeitstunden: 25 });

        const r = await abgleichen(stapel);

        expect(r.results[0]).toMatchObject({ status, code });
        expect(r.summary).toMatchObject({ aktualisiert: 1, stillgelegt: 0, reaktiviert: 0 });
        expect(vertrag("742", "01", "1001")).toMatchObject({ employeeId: anna.id, isActive: true, workingHoursWeek: 25 });
        expect(personMit(ANNA)).toMatchObject({ id: anna.id, firstName: "Anna", lastName: "Beispiel", isActive: true });

        await wiederholungAendertNichts(stapel);
      });
    });

    it("gespeichert noch aktiv, das Ende aber verstrichen: eine laufende Zeile im Zweifel verlaengert ihn nicht, Anna wird stillgelegt", async () => {
      // Der Lauf gestern sah 1001 noch laufen (Ende gestern); heute vergibt DokuBit Schluessel und Postfach neu.
      await abgleichen([zeile({ vertragsende: GESTERN })], new Date("2026-10-16T08:00:00.000Z"));
      expect(vertrag("742", "01", "1001").isActive).toBe(true);
      const anstellungen = structuredClone(pdb.anstellungen);
      const stapel = [zeile({ ...BERND_ZEILE, personalNr: "1001", email: ANNA, vertragsbeginn: "2026-10-17" })];

      const r = await abgleichen(stapel);

      expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
      expect(r.summary).toMatchObject({ aktualisiert: 0, stillgelegt: 1, reaktiviert: 0 });
      expect(pdb.anstellungen).toEqual(anstellungen);
      expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Beispiel", isActive: false });

      await wiederholungAendertNichts(stapel);
    });
  });

  /**
   * Anderer Beginn (Ergaenzung des Auftraggebers vom 17.10.2026 zu R1 und P2):
   * Nennt die Zeile eines bekannten laufenden Vertrags einen anderen Beginn als
   * gespeichert, ist der Schluessel vermutlich neu vergeben — die Zeile
   * beschreibt den Vertrag eines anderen Menschen. Sie benennt die Person nicht
   * um (kein Konsens), und im Zweifel frischt sie weder Stunden noch
   * Organisation auf; das Ende bleibt geregelt wie in P2.
   */
  describe("Anderer Beginn: Schluessel vermutlich neu vergeben (Ergaenzung vom 17.10.2026)", () => {
    it("Heirat bei gleicher Adresse, ein laufender Vertrag, die Zeile nennt einen anderen Beginn: EMAIL_ANDERER_NAME, Name bleibt", async () => {
      await abgleichen([zeile()]);
      const vorher = ohne(pdb.personen, ["lastSyncAt", "updatedAt"]);
      // Etwa: DokuBit hat 1001 samt Postfach an Anna Neumann vergeben, Beginn 01.10.
      const stapel = [zeile({ nachname: "Neumann", vertragsbeginn: "2026-10-01", teilzeitstunden: 39 })];

      const r = await abgleichen(stapel);

      expect(r.results[0]).toMatchObject({ status: "zweifelsfall", code: "EMAIL_ANDERER_NAME" });
      expect(r.summary).toMatchObject({ aktualisiert: 0, zweifelsfall: 1, stillgelegt: 0 });
      expect(ohne(pdb.personen, ["lastSyncAt", "updatedAt"])).toEqual(vorher);
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT)).toHaveLength(0);
      expect(vertrag("742", "01", "1001")).toMatchObject({ startDate: new Date("2024-08-01T00:00:00Z"), workingHoursWeek: 20 });

      await wiederholungAendertNichts(stapel);
    });

    it("Gegenprobe: dieselbe Heirat mit dem gespeicherten Beginn benennt um (NAME_GEAENDERT)", async () => {
      await abgleichen([zeile()]);
      const stapel = [zeile({ nachname: "Neumann", vertragsbeginn: "2024-08-01", teilzeitstunden: 39 })];

      const r = await abgleichen(stapel);

      expect(r.results).toEqual([{ index: 0, status: "aktualisiert", schluessel: "742|01|1001" }]);
      expect(personMit(ANNA)).toMatchObject({ firstName: "Anna", lastName: "Neumann", isActive: true });
      expect(protokoll(PERSONALSTAMM_ACTIONS.NAME_GEAENDERT).map((a) => a.details)).toEqual([
        { employeeId: personMit(ANNA).id },
      ]);
      expect(vertrag("742", "01", "1001").workingHoursWeek).toBe(39);

      await wiederholungAendertNichts(stapel);
    });

    it.each([
      ["einen anderen Beginn: Stunden und Organisation bleiben", "2026-09-01", 0, { workingHoursWeek: 20, organizationId: "org-712" }],
      ["den gespeicherten Beginn (Gegenprobe): Stunden und Organisation aufgefrischt", "2024-08-01", 1, { workingHoursWeek: 39, organizationId: "org-742" }],
    ])(
      "Zweifelsfall (geteilte Adresse im Stapel) auf einem gespeichert laufenden Vertrag, die Zeile nennt %s",
      async (_fall, beginn, aktualisiert, erwartet) => {
        await abgleichen([zeile()]);
        const anna = personMit(ANNA);
        // Von Hand falsch zugeordnet — sonst zeigte sich eine Aenderung der Organisation nicht.
        vertrag("742", "01", "1001").organizationId = "org-712";
        const stapel = [
          zeile({ vertragsbeginn: beginn, teilzeitstunden: 39 }),
          zeile({ ...BERND_ZEILE, personalNr: "5005", email: ANNA }),
        ];

        const r = await abgleichen(stapel);

        expect(r.results.map((x) => [x.status, x.code])).toEqual([
          ["zweifelsfall", "EMAIL_ANDERER_NAME"],
          ["zweifelsfall", "EMAIL_ANDERER_NAME"],
        ]);
        expect(r.summary).toMatchObject({ aktualisiert, angelegt: 0, stillgelegt: 0 });
        expect(vertrag("742", "01", "1001")).toMatchObject({
          employeeId: anna.id,
          isActive: true,
          startDate: new Date("2024-08-01T00:00:00Z"),
          endDate: null,
          ...erwartet,
        });
        expect(personMit(ANNA)).toMatchObject({ id: anna.id, lastName: "Beispiel", isActive: true });

        await wiederholungAendertNichts(stapel);
      },
    );
  });
});
