/**
 * Tests: OFFBOARDING-Resolver (src/lib/doc-template-resolvers.ts)
 *
 * Schwerpunkte sind die Stellen, an denen ein Fehler in einem Schreiben landet,
 * das jemand unterschreibt: die Zeugnisnote vor ihrer Freigabe, die Abfindung
 * als Freitext, der Briefkopf des richtigen Mandanten — und die Frage, was
 * passiert, wenn ein Feld fehlt.
 */

jest.mock("@/lib/db", () => ({
  prisma: {
    offboardingProcess: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userOrgAssignment: { findUnique: jest.fn() },
    departmentConfig: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/encryption", () => ({
  decrypt: (v: string) => (v.startsWith("enc:") ? v.slice(4) : v),
}));

import { prisma } from "@/lib/db";
import { getResolver, type ResolverContext } from "@/lib/doc-template-resolvers";

const findOff = prisma.offboardingProcess.findUnique as jest.Mock;
const findOrg = prisma.organization.findUnique as jest.Mock;
const findUser = prisma.user.findUnique as jest.Mock;

const session = {
  userId: "u1", email: "hr@credo.de", role: "HR_LEITUNG",
  firstName: "Hanna", lastName: "Roth",
};

function ctx(extra?: Partial<ResolverContext>): ResolverContext {
  return { organizationId: "orgX", refId: "off1", session, ...extra };
}

/** Ein Vorgang mit allem, was das Portal im besten Fall hat. */
function vorgang(overrides: Record<string, unknown> = {}) {
  return {
    displayId: "OFF-2026-GYM-001",
    organizationId: "org-gym",
    employeeEmail: "e.mustermann@fes-minden.de",
    employeeFirstName: "Erika",
    employeeLastName: "Mustermann",
    employeePersonalNr: "100234",
    employeePrivateEmail: null,
    exitType: "AUFHEBUNGSVERTRAG",
    exitReason: "Wechsel in den Ruhestand",
    noticeDate: new Date("2026-03-31T00:00:00.000Z"),
    noticePeriodEnd: new Date("2026-06-30T00:00:00.000Z"),
    lastWorkingDay: new Date("2026-06-30T00:00:00.000Z"),
    contractEndDate: new Date("2026-06-30T00:00:00.000Z"),
    employee: null,
    exitData: {
      employmentType: "ANGESTELLT",
      tarifvertrag: "TV-L",
      entgeltgruppe: "E11",
      remainingVacationDays: 12.5,
      vacationPayout: 1234.5,
      overtimeHours: 37.5,
      overtimePayout: 890,
      severancePay: null,
      certificateType: "QUALIFIZIERT",
      nonCompeteClause: false,
      successorName: "Jonas Weber",
    },
    contractEnd: {
      contractStartDate: new Date("2015-08-01T00:00:00.000Z"),
      currentPosition: "Lehrkraft",
      currentEntgeltgruppe: "E11",
      currentStufe: "4",
      currentWochenstunden: 25.5,
      dokubitDaten: {
        anrede: "Frau", titel: "Dr.", geschlecht: "weiblich",
        strasse: "Musterweg 1", plz: "32425", ort: "Minden",
        geburtsort: "Minden", konzerneintritt: "2010-08-01",
      },
    },
    zeugnisBewertung: null,
    returnItems: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findOrg.mockResolvedValue({
    name: "Gymnasium", shortName: "GYM", mandantNumber: "737",
    dsgvoVerantwortlicheName: null, dsgvoVerantwortlicheStrasse: null,
    dsgvoVerantwortlichePlz: null, dsgvoVerantwortlicheOrt: null,
  });
  findUser.mockResolvedValue({
    firstName: "Hanna", lastName: "Roth", email: "hr@credo.de", phone: null,
  });
  findOff.mockResolvedValue(vorgang());
});

async function loese(extra?: Partial<ResolverContext>) {
  return getResolver("OFFBOARDING")(ctx(extra));
}

describe("Offboarding-Resolver — Grundfelder", () => {
  it("fuellt Person, Austritt und Beschaeftigung", async () => {
    const { data } = await loese();
    expect(data).toMatchObject({
      vorname: "Erika",
      nachname: "Mustermann",
      name: "Erika Mustermann",
      personalnummer: "100234",
      vorgangsnummer: "OFF-2026-GYM-001",
      position: "Lehrkraft",
      tarifvertrag: "TV-L",
      nachfolger: "Jonas Weber",
    });
  });

  it("uebersetzt die Austrittsart statt den Code auszugeben", async () => {
    const { data } = await loese();
    expect(data.austrittsart).toBe("Aufhebungsvertrag");
  });

  it("uebersetzt Beschaeftigungsart und Zeugnisart", async () => {
    const { data } = await loese();
    expect(data.beschaeftigungsart).toBe("Angestellt");
    expect(data.zeugnisart).toBe("Qualifiziertes Arbeitszeugnis");
  });

  it("faellt bei unbekannten Codes auf den Rohwert zurueck", async () => {
    // Die Felder sind nicht gegen ein Enum validiert — ein unbekannter Wert
    // darf nicht verschwinden, sondern soll sichtbar bleiben.
    findOff.mockResolvedValue(
      vorgang({ exitData: { ...vorgang().exitData, employmentType: "WERKSTUDENT" } })
    );
    const { data } = await loese();
    expect(data.beschaeftigungsart).toBe("WERKSTUDENT");
  });

  it("setzt das Wettbewerbsverbot als Ja oder Nein", async () => {
    expect((await loese()).data.wettbewerbsverbot).toBe("Nein");
    findOff.mockResolvedValue(
      vorgang({ exitData: { ...vorgang().exitData, nonCompeteClause: true } })
    );
    expect((await loese()).data.wettbewerbsverbot).toBe("Ja");
  });
});

describe("Offboarding-Resolver — Zahlen und Betraege", () => {
  it("schreibt Geldbetraege mit zwei Nachkommastellen in deutscher Form", async () => {
    const { data } = await loese();
    expect(data.urlaubsauszahlung).toBe("1.234,50");
    expect(data.ueberstundenauszahlung).toBe("890,00");
  });

  it("schreibt Mengen mit Komma, ohne erzwungene Nachkommastellen", async () => {
    const { data } = await loese();
    expect(data.resturlaub_tage).toBe("12,5");
    expect(data.ueberstunden).toBe("37,5");
    expect(data.wochenstunden).toBe("25,5");
  });

  it("laesst die Abfindung als Freitext unveraendert", async () => {
    // Sie ist ein String-Feld. Wuerde man sie als Zahl formatieren, machte
    // parseFloat("15.000,00") daraus den Betrag fuenfzehn.
    findOff.mockResolvedValue(
      vorgang({ exitData: { ...vorgang().exitData, severancePay: "enc:15.000,00 EUR" } })
    );
    const { data, sensitiveFields } = await loese();
    expect(data.abfindung).toBe("15.000,00 EUR");
    expect(sensitiveFields).toContain("abfindung");
  });

  it("loest die Abfindung nicht auf, wenn die Vorlage sie nicht nutzt", async () => {
    findOff.mockResolvedValue(
      vorgang({ exitData: { ...vorgang().exitData, severancePay: "enc:15.000,00 EUR" } })
    );
    const { data, sensitiveFields } = await loese({ placeholders: ["vorname", "nachname"] });
    expect(data.abfindung).toBeUndefined();
    expect(sensitiveFields).toEqual([]);
  });
});

describe("Offboarding-Resolver — Zeugnisnote", () => {
  const bewertung = (extra: Record<string, unknown>) => ({
    jobGroup: "LEHRKRAFT", overallGradeRounded: 2,
    supervisorName: "Thomas Schmidt", finalizedAt: null, ...extra,
  });

  it("setzt die Note erst nach Abschluss der Bewertung", async () => {
    findOff.mockResolvedValue(vorgang({ zeugnisBewertung: bewertung({ status: "FINALIZED" }) }));
    const { data } = await loese();
    expect(data.zeugnis_note).toBe("2");
    expect(data.zeugnis_note_text).toBe("Gut");
    expect(data.zeugnis_gesamtformulierung).toBe("stets zu unserer vollen Zufriedenheit");
  });

  it("laesst die Note weg, solange die Bewertung laeuft", async () => {
    // Vorher ist es die vorlaeufige Einschaetzung der Fuehrungskraft ohne die
    // HR-Korrektur — sie darf nicht in ein rechtsverbindliches Zeugnis geraten.
    findOff.mockResolvedValue(vorgang({ zeugnisBewertung: bewertung({ status: "IN_PROGRESS" }) }));
    const { data } = await loese();
    expect(data.zeugnis_note).toBeUndefined();
    expect(data.zeugnis_note_text).toBeUndefined();
    expect(data.zeugnis_gesamtformulierung).toBeUndefined();
    // Berufsgruppe und Beurteiler bleiben trotzdem verfuegbar.
    expect(data.zeugnis_berufsgruppe).toBe("Lehrkraft");
    expect(data.beurteiler_name).toBe("Thomas Schmidt");
  });
});

describe("Offboarding-Resolver — Rueckgaben", () => {
  const items = [
    { category: "IT", itemName: "Notebook", serialNumber: "NB-77", isReturned: true, returnedAt: new Date("2026-06-28T00:00:00.000Z") },
    { category: "IT", itemName: "Diensthandy", serialNumber: null, isReturned: false, returnedAt: null },
    { category: "ZUGANG", itemName: "Schluessel Haupteingang", serialNumber: null, isReturned: false, returnedAt: null },
  ];

  it("baut zwei Listen als mehrzeiligen Text", async () => {
    findOff.mockResolvedValue(vorgang({ returnItems: items }));
    const { data } = await loese();
    expect(data.rueckgaben_liste).toBe("Notebook (NB-77) — zurueck am 28.06.2026");
    expect(String(data.rueckgaben_offen_liste).split("\n")).toEqual([
      "Diensthandy",
      "Schluessel Haupteingang",
    ]);
    expect(data.rueckgaben_offen_anzahl).toBe("2");
  });

  // A4, S30 (G16, 1.9): „offen“ heisst ohne Zustand; `rueckgaben_liste`
  // nennt jede Zeile mit Zustand samt Zustandswort.
  it("offen = ohne Zustand; die Liste nennt jeden Zustand mit seinem Wort – kein Stück fällt aus beiden Listen", async () => {
    const am = new Date("2026-06-28T00:00:00.000Z");
    const zeile = (itemName: string, teil: Record<string, unknown>) => ({
      category: "IT_HARDWARE",
      itemName,
      serialNumber: null,
      isReturned: false,
      returnedAt: null,
      zustand: null,
      ...teil,
    });
    const alle = [
      zeile("A Notebook", { serialNumber: "NB-77", zustand: "ZURUECK", isReturned: true, returnedAt: am }),
      zeile("B Tablet", { zustand: "BESCHAEDIGT", isReturned: true, returnedAt: am }),
      zeile("C Schlüssel", { serialNumber: "GS-114", zustand: "FEHLT" }),
      zeile("D Diensthandy", { zustand: "VERBLEIBT" }),
      zeile("E Kopierkarte", { zustand: "ENTFAELLT" }),
      zeile("F Monitor", {}),
      // Altbestand: zurueckgegeben, ohne Zustand
      zeile("G Dockingstation", { isReturned: true, returnedAt: am }),
    ];
    findOff.mockResolvedValue(vorgang({ returnItems: alle }));
    const { data } = await loese();
    const liste = String(data.rueckgaben_liste).split("\n");
    const offen = String(data.rueckgaben_offen_liste).split("\n");
    expect(liste).toEqual([
      "A Notebook (NB-77) — zurueck am 28.06.2026",
      "B Tablet — beschädigt zurück am 28.06.2026",
      "C Schlüssel (GS-114) — fehlt",
      "D Diensthandy — verbleibt",
      "E Kopierkarte — entfällt",
      "G Dockingstation — zurueck am 28.06.2026",
    ]);
    expect(offen).toEqual(["F Monitor"]);
    expect(data.rueckgaben_offen_anzahl).toBe("1");
    // Jede Zeile steht in genau einer der beiden Listen.
    expect(liste.length + offen.length).toBe(alle.length);
  });

  it("setzt die Listen gar nicht, wenn es nichts zu melden gibt", async () => {
    // Dann faellt eine Rueckgabe-Bestaetigung mit "___" auf, statt still leer
    // zu bleiben.
    const { data } = await loese();
    expect(data.rueckgaben_liste).toBeUndefined();
    expect(data.rueckgaben_offen_liste).toBeUndefined();
    expect(data.rueckgaben_offen_anzahl).toBeUndefined();
  });
});

describe("Offboarding-Resolver — fehlende Daten und Mandant", () => {
  it("laesst Felder ungesetzt, wenn kein Vertragsende-Vorgang dahintersteht", async () => {
    // Bei von Hand angelegten Offboardings hat das Portal keine Postanschrift.
    findOff.mockResolvedValue(vorgang({ contractEnd: null }));
    const { data } = await loese();
    for (const key of ["strasse", "plz", "ort", "anrede", "titel", "position", "wochenstunden"]) {
      expect(data[key]).toBeUndefined();
    }
    // Die Grunddaten stehen weiterhin.
    expect(data.vorname).toBe("Erika");
  });

  it("nimmt den Mandanten DES VORGANGS, nicht den mitgeschickten", async () => {
    // Sonst truege das Schreiben den Briefkopf eines fremden Traegers.
    await loese({ organizationId: "ein-ganz-anderer-mandant" });
    expect(findOrg).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-gym" } })
    );
  });

  it("gibt nur die allgemeinen Platzhalter zurueck, wenn es den Vorgang nicht gibt", async () => {
    findOff.mockResolvedValue(null);
    const { data } = await loese();
    expect(data.vorname).toBeUndefined();
    expect(data.datum).toBeDefined();
  });

  it("gibt ohne refId nur die allgemeinen Platzhalter zurueck", async () => {
    const { data } = await loese({ refId: null });
    expect(data.vorname).toBeUndefined();
    expect(data.datum).toBeDefined();
  });
});

describe("Offboarding-Resolver — Mandantenpruefung", () => {
  /**
   * Der Erzeugen-Endpunkt prueft die Organisation der VORLAGE und eine
   * mitgeschickte organizationId, aber nicht, ob der Vorgang hinter der refId
   * zum eigenen Mandanten gehoert. Ohne die Pruefung im Resolver koennte eine
   * fremde Vorgangs-ID untergeschoben werden und die Daten landeten im
   * Dokument.
   */
  const leitung = { ...session, userId: "u2", role: "EINRICHTUNGSLEITUNG" };
  const findZuweisung = prisma.userOrgAssignment.findUnique as jest.Mock;

  it("liefert einer fremden Einrichtungsleitung nur die allgemeinen Platzhalter", async () => {
    findZuweisung.mockResolvedValue(null);
    const { data } = await getResolver("OFFBOARDING")(ctx({ session: leitung }));
    expect(data.vorname).toBeUndefined();
    expect(data.austrittsart).toBeUndefined();
    expect(data.datum).toBeDefined();
  });

  it("laesst die eigene Einrichtungsleitung durch", async () => {
    findZuweisung.mockResolvedValue({ id: "z1" });
    const { data } = await getResolver("OFFBOARDING")(ctx({ session: leitung }));
    expect(data.vorname).toBe("Erika");
  });

  it("fragt fuer globale Rollen gar nicht erst nach einer Zuweisung", async () => {
    await loese();
    expect(findZuweisung).not.toHaveBeenCalled();
  });
});

describe("Offboarding-Resolver — Befunde aus dem Codereview", () => {
  it("macht aus einem unmoeglichen Datum kein \"Invalid Date\"", async () => {
    // Die Datumswerte in dokubitDaten werden beim Schreiben nur gegen eine
    // Formatmaske geprueft (nicht am Ende verankert, ohne Kalenderpruefung):
    // "2026-13-45" kommt durch.
    findOff.mockResolvedValue(
      vorgang({
        contractEnd: {
          ...vorgang().contractEnd,
          dokubitDaten: { ...vorgang().contractEnd.dokubitDaten, konzerneintritt: "2026-13-45" },
        },
      })
    );
    const { data } = await loese();
    expect(data.konzerneintritt).toBeUndefined();
  });

  it("nimmt ein gueltiges Konzerneintrittsdatum weiterhin an", async () => {
    expect((await loese()).data.konzerneintritt).toBe("01.08.2010");
  });
});

// =============================================
// A4, S33 (G19, 1.9): {rueckgaben_je_stelle} fuer das Rueckgabeprotokoll
// =============================================
describe("Offboarding-Resolver — Rueckgaben je Stelle (S33)", () => {
  const findKonfigs = prisma.departmentConfig.findMany as jest.Mock;
  const am = new Date("2027-07-31T08:00:00.000Z");
  const zeile = (itemName: string, teil: Record<string, unknown> = {}) => ({
    category: "IT_HARDWARE",
    itemName,
    serialNumber: null,
    isReturned: false,
    returnedAt: null,
    zustand: null,
    ausgabe: null,
    ...teil,
  });

  beforeEach(() => {
    findKonfigs.mockResolvedValue([
      { departmentKey: "FACILITY", departmentName: "Hausmeister Grundschule", email: "hm@gs.example", organizationId: "org-gs", isActive: true },
      { departmentKey: "FACILITY", departmentName: "Hausmeister Gymnasium", email: "hm@gym.example", organizationId: "org-gym", isActive: true },
    ]);
  });

  it("je Stelle der Ausgabe eine Gruppe, von HR erfasste Zeilen unter „Personalabteilung“, offene mit leerem Zustand", async () => {
    findOff.mockResolvedValue(
      vorgang({
        arbeitsortId: "org-gs",
        returnItems: [
          zeile("Dienst-iPad (Lernmittel)", {
            serialNumber: "FES-IPAD-0412", zustand: "BESCHAEDIGT", isReturned: true, returnedAt: am,
            ausgabe: { departmentKey: "IT" },
          }),
          zeile("Schlüssel: Haupteingang", { serialNumber: "GS-114", ausgabe: { departmentKey: "FACILITY" } }),
          zeile("Parkausweis", { zustand: "FEHLT" }),
        ],
      }),
    );
    const { data, sensitiveFields } = await loese();
    expect(data.rueckgaben_je_stelle).toEqual([
      {
        rueckgabe_stelle: "IT-Abteilung",
        gegenstaende: [
          { rueckgabe_gegenstand: "Dienst-iPad (Lernmittel)", rueckgabe_kennung: "FES-IPAD-0412", rueckgabe_zustand: "beschädigt zurück", rueckgabe_am: "31.07.2027" },
        ],
      },
      {
        // Name an der Empfaenger-Einrichtung des Austritts (Arbeitsort, G12)
        rueckgabe_stelle: "Hausmeister Grundschule",
        gegenstaende: [
          { rueckgabe_gegenstand: "Schlüssel: Haupteingang", rueckgabe_kennung: "GS-114", rueckgabe_zustand: "", rueckgabe_am: "" },
        ],
      },
      {
        rueckgabe_stelle: "Personalabteilung",
        gegenstaende: [{ rueckgabe_gegenstand: "Parkausweis", rueckgabe_kennung: "", rueckgabe_zustand: "fehlt", rueckgabe_am: "" }],
      },
    ]);
    expect(sensitiveFields).toEqual([]);
    expect(findKonfigs).toHaveBeenCalledWith(
      expect.objectContaining({ where: { departmentKey: { in: ["IT", "FACILITY"] } } }),
    );
  });

  it("ohne Arbeitsort gilt die Einrichtung des Austritts", async () => {
    findOff.mockResolvedValue(
      vorgang({ arbeitsortId: null, returnItems: [zeile("Schlüssel", { ausgabe: { departmentKey: "FACILITY" } })] }),
    );
    const { data } = await loese();
    expect((data.rueckgaben_je_stelle as Array<{ rueckgabe_stelle: string }>)[0].rueckgabe_stelle).toBe("Hausmeister Gymnasium");
  });

  it("liest die Stelle ueber die Ausgabe, nie Zustandsnotiz oder Notiz der Rueckgabe", async () => {
    await loese();
    const auswahl = findOff.mock.calls[0][0].select;
    expect(auswahl.arbeitsortId).toBe(true);
    expect(auswahl.returnItems).toEqual({
      select: {
        category: true, itemName: true, serialNumber: true, isReturned: true,
        returnedAt: true, zustand: true, ausgabe: { select: { departmentKey: true } },
      },
    });
  });

  it("Listen ohne Bemerkung: kaemen Notiz und Zustandsbeschreibung doch mit, stuenden sie nirgends", async () => {
    findOff.mockResolvedValue(
      vorgang({ returnItems: [zeile("Notebook", { notes: "Kratzer am Deckel", condition: "Akku schwach" })] }),
    );
    const { data } = await loese();
    expect(JSON.stringify(data)).not.toMatch(/Kratzer|Akku/);
  });

  it("jedes innere Feld ist gesetzt; ohne Rueckgabe eine leere Liste (Leersatz der Vorlage) ohne Abfrage der Stellen", async () => {
    findOff.mockResolvedValue(vorgang({ returnItems: [zeile("Notebook")] }));
    const { data } = await loese();
    const [stelle] = data.rueckgaben_je_stelle as Array<{ gegenstaende: Record<string, unknown>[] }>;
    for (const wert of Object.values(stelle.gegenstaende[0])) expect(typeof wert).toBe("string");

    jest.clearAllMocks();
    findOff.mockResolvedValue(vorgang());
    const leer = await loese();
    expect(leer.data.rueckgaben_je_stelle).toEqual([]);
    expect(findKonfigs).not.toHaveBeenCalled();
  });

  it("fremder Mandant: keine Liste (wie alle Vorgangsdaten)", async () => {
    const leitung = { ...session, userId: "u2", role: "EINRICHTUNGSLEITUNG" };
    (prisma.userOrgAssignment.findUnique as jest.Mock).mockResolvedValue(null);
    findOff.mockResolvedValue(vorgang({ returnItems: [zeile("Notebook", { ausgabe: { departmentKey: "IT" } })] }));
    const { data } = await getResolver("OFFBOARDING")(ctx({ session: leitung }));
    expect(data.rueckgaben_je_stelle).toBeUndefined();
    expect(findKonfigs).not.toHaveBeenCalled();
  });
});
