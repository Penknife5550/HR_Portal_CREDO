/**
 * Die Kostenstellen-Aufteilung auf ihrem Weg nach draussen: LOGA-CSV und
 * Personalakte-PDF.
 *
 * ============================================================================
 * WAS HIER SCHIEFGING (Durchsicht 09/2026)
 * ============================================================================
 *
 * Beide Exporte luden `supervisorData: true` — ohne `include` der Zeilen — und
 * gaben `sd.kostenstelle` aus, also die Alt-Spalte, die die Maske seit
 * KOSTENSTELLEN_AUFTEILUNG_V1 nicht mehr befuellt. Ergebnis:
 *
 *  - NEUER Vorgang: leere Zelle in der Spalte "Kostenstelle". LOGA importiert
 *    ohne Kostenstelle, und niemand sieht, dass eine Aufteilung existiert.
 *  - GEAENDERTER Bestandsvorgang: die alte Kostenstelle. LOGA bucht 100
 *    Prozent auf eine Stelle, die im Portal seit Wochen ersetzt ist.
 *
 * Im PDF stand die Kostenstelle ueberhaupt nicht — im einzigen Ausdruck, den
 * die Personalakte kennt, fehlte sie also ganz.
 *
 * ============================================================================
 * WORAUF DIE ZUSICHERUNGEN ZIELEN
 * ============================================================================
 *
 *  1. Das Prisma-`include` selbst. Ohne die Zeilen greift der Rueckfall auf
 *     die Alt-Spalte still — dieselbe Falle, nur eine Ebene tiefer. Der
 *     mitgeschriebene Aufruf haelt fest, dass beide Routen die Zeilen laden,
 *     und zwar nach `orderIndex` geordnet: Die Reihenfolge der Aufteilung ist
 *     die, in der sie eingetragen wurde.
 *  2. Die Spaltenposition der bestehenden CSV-Spalte "Kostenstelle". Sie darf
 *     sich nicht verschieben, weil der LOGA-Import daran haengt; die
 *     Aufteilung kommt deshalb in NEUEN Spalten am Ende.
 *  3. Der Inhalt: die Positionsspalte traegt eine Kostenstelle nur, wenn es
 *     genau EINE gibt (Begruendung in der Route), die vollstaendige Aufteilung
 *     und die Bemerkung stehen am Ende, im PDF die Zeilenliste.
 *  4. Die Datei bleibt zweizeilig. Eine mehrzeilige Bemerkung darf die
 *     Wertezeile nicht in mehrere physische Zeilen zerlegen — ein zeilenweise
 *     lesender Import saehe sonst einen abgeschnittenen Datensatz und einen
 *     Geisterdatensatz hinterher.
 */

const mockGetSession = jest.fn();

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
// Die Entschluesselung braucht einen Schluessel aus der Umgebung und hat mit
// den Kostenstellen nichts zu tun.
jest.mock("@/lib/encryption", () => ({ decrypt: (wert: string) => wert }));

import { GET as CSV_EXPORT } from "@/app/api/onboarding/[id]/export/route";
import { GET as PDF_EXPORT } from "@/app/api/onboarding/[id]/pdf-export/route";
import { NextRequest } from "next/server";
import * as zlib from "zlib";

const HR_SESSION = {
  userId: "hr-1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

interface SupervisorTeil {
  kostenstelle?: string | null;
  kostenstelleAnteil?: number | null;
  kostenstellenBemerkung?: string | null;
  kostenstellen?: { bezeichnung: string; anteil: number }[];
  // Die Zweckbefristung ist die ZWEITE mehrzeilige Zelle dieser CSV — siehe
  // den Test ganz unten.
  befristet?: boolean;
  befristungsart?: string | null;
  befristungZweck?: string | null;
}

/** Ein Vorgang, reduziert auf das, was die beiden Exporte anfassen. */
function vorgang(sdTeil: SupervisorTeil) {
  return {
    id: "vorgang-1",
    displayId: "ON-2026-0001",
    status: "REVIEWED",
    email: "neue.person@example.org",
    firstName: "Neue",
    lastName: "Person",
    questionnaireType: "STANDARD",
    invitedAt: new Date("2026-08-01T08:00:00Z"),
    submittedAt: new Date("2026-08-10T08:00:00Z"),
    // Mandantennummer bewusst ohne die Ziffernfolge der Alt-Kostenstelle: Die
    // Zusicherungen unten pruefen, dass "4711" NIRGENDS in der Ausgabe steht.
    organization: { name: "Grundschule Minden", mandantNumber: "M-0815" },
    personalData: null,
    documents: [],
    checklistItems: [],
    supervisorData: {
      betriebsstaette: "Hauptstelle",
      stellenbeschreibung: null,
      vertragsbeginn: new Date("2026-09-01T00:00:00Z"),
      befristet: false,
      befristungsart: null,
      vertragsende: null,
      befristungZweck: null,
      vertragsendeVoraussichtlich: null,
      befristungSachgrund: null,
      vollzeit: true,
      wochenstunden: 39,
      tageProWoche: 5,
      hauptarbeitgeberId: null,
      nebenarbeitgeberId: null,
      svPflichtig: true,
      minijob: false,
      ehrenamt: false,
      verguetungsmodell: "TV_L",
      entgeltgruppe: "E11",
      stufe: "3",
      festgehalt: null,
      stundenlohn: null,
      jahressonderzahlung: true,
      sonderzahlungProzent: null,
      urlaubstageProJahr: 30,
      probezeit: true,
      probezeitMonate: 6,
      zusatzvereinbarungen: null,
      kostenstelle: null,
      kostenstelleAnteil: null,
      kostenstellenBemerkung: null,
      kostenstellen: [],
      ...sdTeil,
    },
  };
}

/**
 * Eine CSV-Zeile in Zellen zerlegen — mit Anfuehrungszeichen, denn eine
 * Bemerkung darf Semikolons enthalten.
 */
function zellen(zeile: string): string[] {
  const ergebnis: string[] = [];
  let zelle = "";
  let inQuotes = false;
  for (let i = 0; i < zeile.length; i++) {
    const zeichen = zeile[i];
    if (inQuotes) {
      if (zeichen === '"' && zeile[i + 1] === '"') {
        zelle += '"';
        i++;
      } else if (zeichen === '"') {
        inQuotes = false;
      } else {
        zelle += zeichen;
      }
    } else if (zeichen === '"') {
      inQuotes = true;
    } else if (zeichen === ";") {
      ergebnis.push(zelle);
      zelle = "";
    } else {
      zelle += zeichen;
    }
  }
  ergebnis.push(zelle);
  return ergebnis;
}

async function csvFuer(sdTeil: SupervisorTeil) {
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang(sdTeil));
  const antwort = await CSV_EXPORT(
    new NextRequest("http://localhost/api/onboarding/vorgang-1/export?format=csv"),
    { params: Promise.resolve({ id: "vorgang-1" }) }
  );
  expect(antwort.status).toBe(200);
  const roh = await antwort.text();
  const [kopf, werte] = roh.split("\n");
  // `zeilen` bewusst roh mit zurueck: Nur daran laesst sich pruefen, dass die
  // Datei zweizeilig bleibt.
  return { kopf: zellen(kopf), werte: zellen(werte), zeilen: roh.split("\n") };
}

/**
 * Den sichtbaren Text aus einem PDF holen.
 *
 * pdfkit komprimiert die Inhaltsstroeme (Flate) und schreibt den Text als
 * hexkodierte WinAnsi-Bruchstuecke in TJ-Anweisungen, zwischen denen
 * Kerning-Zahlen stehen. Eine Suche im Rohpuffer findet deshalb nichts. Hier
 * werden die Stroeme entpackt, die Bruchstuecke je TJ-Anweisung wieder
 * zusammengesetzt und die Kerning-Zahlen verworfen.
 */
function pdfText(pdf: Buffer): string {
  const roh = pdf.toString("latin1");
  const stellen = /stream\r?\n/g;
  const teile: string[] = [];
  let treffer: RegExpExecArray | null;
  while ((treffer = stellen.exec(roh)) !== null) {
    const start = treffer.index + treffer[0].length;
    const ende = roh.indexOf("endstream", start);
    if (ende < 0) continue;
    try {
      teile.push(
        zlib
          .inflateSync(Buffer.from(roh.slice(start, ende), "latin1"))
          .toString("latin1")
      );
    } catch {
      // Bild- und Schriftdaten sind kein Flate-Text — die interessieren hier nicht.
    }
  }
  return teile
    .join("\n")
    .replace(/\[([^\]]*)\]\s*TJ/g, (_, inhalt: string) =>
      [...inhalt.matchAll(/<([0-9a-fA-F]*)>/g)]
        .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
        .join("") + "\n"
    );
}

async function pdfFuer(sdTeil: SupervisorTeil) {
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang(sdTeil));
  const antwort = await PDF_EXPORT(
    new NextRequest(
      "http://localhost/api/onboarding/vorgang-1/pdf-export?type=modalitaeten"
    ),
    { params: Promise.resolve({ id: "vorgang-1" }) }
  );
  expect(antwort.status).toBe(200);
  return pdfText(Buffer.from(await antwort.arrayBuffer()));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR_SESSION);
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("LOGA-CSV", () => {
  it("laedt die Zeilen der Aufteilung mit, geordnet nach orderIndex", async () => {
    await csvFuer({});
    const aufruf = mockPrisma.onboardingProcess.findUnique.mock.calls[0][0];
    expect(aufruf.include.supervisorData).toEqual({
      include: { kostenstellen: { orderBy: { orderIndex: "asc" } } },
    });
  });

  it("laesst die Spalte „Kostenstelle“ an ihrer Stelle und haengt nur an", async () => {
    // Der LOGA-Import haengt an der Position. Neue Angaben gehoeren ans Ende —
    // dasselbe Muster wie bei den Befristungsspalten.
    const { kopf, werte } = await csvFuer({});
    expect(kopf.indexOf("Kostenstelle")).toBe(43);
    expect(kopf[kopf.length - 2]).toBe("Kostenstellen-Aufteilung");
    expect(kopf[kopf.length - 1]).toBe("Kostenstellen-Bemerkung");
    // Kopfzeile und Wertezeile muessen gleich lang bleiben, sonst rutscht der
    // ganze Import um eine Spalte.
    expect(werte).toHaveLength(kopf.length);
  });

  it("laesst die Positionsspalte bei mehreren Kostenstellen LEER", async () => {
    // Die Positionsspalte ist EINE Zelle und kann keine Aufteilung tragen.
    // Stuende dort die erste Bezeichnung, buchte LOGA 100 Prozent auf 5000 und
    // die 40 Prozent auf 6000 fielen still weg. Eine leere Pflichtspalte
    // laesst den Import scheitern — das ist der laute und damit richtige Fall.
    const { kopf, werte } = await csvFuer({
      kostenstellen: [
        { bezeichnung: "5000", anteil: 60 },
        { bezeichnung: "6000", anteil: 40 },
      ],
    });

    expect(werte[kopf.indexOf("Kostenstelle")]).toBe("");
    expect(werte[kopf.indexOf("Kostenstellen-Aufteilung")]).toBe(
      "5000: 60,00 % | 6000: 40,00 %"
    );
  });

  it("speist die Positionsspalte, wenn es genau EINE Kostenstelle gibt", async () => {
    // Neuer Vorgang mit einer einzigen Kostenstelle: Hier stimmt die einzelne
    // Zelle, und ohne sie importierte LOGA gar keine Kostenstelle.
    const { kopf, werte } = await csvFuer({
      kostenstellen: [{ bezeichnung: "5000", anteil: 100 }],
    });

    expect(werte[kopf.indexOf("Kostenstelle")]).toBe("5000");
    expect(werte[kopf.indexOf("Kostenstellen-Aufteilung")]).toBe(
      "5000: 100,00 %"
    );
  });

  it("exportiert NICHT die eingefrorene Alt-Kostenstelle eines geaenderten Bestandsvorgangs", async () => {
    // Der Fall, der still falsch bucht: Bestandswert "4711", Aufteilung
    // laengst auf 5000/6000 umgestellt.
    const { kopf, werte } = await csvFuer({
      kostenstelle: "4711",
      kostenstelleAnteil: 100,
      kostenstellen: [
        { bezeichnung: "5000", anteil: 60 },
        { bezeichnung: "6000", anteil: 40 },
      ],
    });

    expect(werte[kopf.indexOf("Kostenstelle")]).toBe("");
    expect(werte.join(";")).not.toContain("4711");
  });

  it("faellt auf die Alt-Spalte zurueck, solange keine Zeile existiert", async () => {
    // Der Server ist frisch aktualisiert, die Datenmigration noch nicht
    // gelaufen: Der Bestandswert muss durchkommen, sonst verliert der Export
    // eine Angabe, die im Portal sichtbar ist.
    const { kopf, werte } = await csvFuer({
      kostenstelle: "4711",
      kostenstelleAnteil: null,
    });

    expect(werte[kopf.indexOf("Kostenstelle")]).toBe("4711");
    expect(werte[kopf.indexOf("Kostenstellen-Aufteilung")]).toBe(
      "4711: 100,00 %"
    );
  });

  it("nimmt die Bemerkung zur Aufteilung mit und quotet ihr Semikolon", async () => {
    const { kopf, werte } = await csvFuer({
      kostenstellen: [{ bezeichnung: "5000", anteil: 100 }],
      kostenstellenBemerkung: "Beschluss vom 01.09.; ab 2027 neu pruefen",
    });

    expect(werte[kopf.indexOf("Kostenstellen-Bemerkung")]).toBe(
      "Beschluss vom 01.09.; ab 2027 neu pruefen"
    );
    expect(werte).toHaveLength(kopf.length);
  });

  it("bleibt bei einer mehrzeiligen Bemerkung zweizeilig", async () => {
    // Das Eingabefeld ist ein <textarea>: Zeilenumbrueche sind erlaubt und nur
    // gegen die Laenge geprueft. `csvZelle` quotet sie zwar, schreibt sie aber
    // mit — aus einer Wertezeile wuerden drei physische Zeilen.
    const { kopf, werte, zeilen } = await csvFuer({
      kostenstellen: [{ bezeichnung: "5000", anteil: 100 }],
      kostenstellenBemerkung: "Beschluss vom 01.09.\nAb 2027 neu pruefen",
    });

    expect(zeilen).toHaveLength(2);
    expect(werte[kopf.indexOf("Kostenstellen-Bemerkung")]).toBe(
      "Beschluss vom 01.09. Ab 2027 neu pruefen"
    );
    expect(werte).toHaveLength(kopf.length);
  });

  it("faengt auch den Wagenruecklauf aus Windows-Eingaben ab", async () => {
    // Wer aus Word oder Outlook einfuegt, bringt CRLF mit. Bliebe das \r
    // stehen, zerlegte ein Import, der auf \r\n trennt, die Zeile ebenso.
    const { kopf, werte, zeilen } = await csvFuer({
      kostenstellen: [{ bezeichnung: "5000", anteil: 100 }],
      kostenstellenBemerkung: "Erste Zeile\r\nZweite Zeile",
    });

    expect(zeilen).toHaveLength(2);
    expect(werte[kopf.indexOf("Kostenstellen-Bemerkung")]).toBe(
      "Erste Zeile Zweite Zeile"
    );
  });

  /**
   * Die Kostenstellen-Bemerkung war NICHT die erste mehrzeilige Zelle dieser
   * Datei — der Kommentar an `einzeilig` behauptete das, und deshalb blieb die
   * Nachbarzelle ungeschuetzt.
   *
   * "Wodurch endet der Vertrag?" (`befristungZweck`) ist seit dem
   * Zweckbefristungs-Release ein `<textarea>` mit 500 Zeichen und steht in
   * derselben Wertezeile, zwei Spalten weiter links. Ein Umbruch dort zerlegt
   * den Datensatz genauso — nur faellt es weniger auf, weil die Spalte selten
   * gefuellt ist.
   */
  it("macht auch die Zweckbefristung einzeilig", async () => {
    const { kopf, werte, zeilen } = await csvFuer({
      befristet: true,
      befristungsart: "ZWECK",
      befristungZweck:
        "Ende der Kostenzusage des Jugendamtes\nfür das Projekt Ganztag\r\nStand 09/2026",
    });

    expect(zeilen).toHaveLength(2);
    expect(werte[kopf.indexOf("Zweckbefristung: Ende bei")]).toBe(
      "Ende der Kostenzusage des Jugendamtes für das Projekt Ganztag Stand 09/2026"
    );
    expect(werte).toHaveLength(kopf.length);
  });
});

describe("Personalakte-PDF", () => {
  it("laedt die Zeilen der Aufteilung mit", async () => {
    await pdfFuer({});
    const aufruf = mockPrisma.onboardingProcess.findUnique.mock.calls[0][0];
    expect(aufruf.include.supervisorData).toEqual({
      include: { kostenstellen: { orderBy: { orderIndex: "asc" } } },
    });
  });

  it("druckt die Aufteilung mit Anteilen und Summe", async () => {
    const text = await pdfFuer({
      kostenstellen: [
        { bezeichnung: "5000", anteil: 60 },
        { bezeichnung: "6000", anteil: 40 },
      ],
      kostenstellenBemerkung: "Beschluss vom 01.09.",
    });

    expect(text).toContain("Kostenstellen");
    expect(text).toContain("5000");
    expect(text).toContain("60,00 %");
    expect(text).toContain("6000");
    expect(text).toContain("40,00 %");
    expect(text).toContain("100,00 %");
    expect(text).toContain("Beschluss vom 01.09.");
  });

  it("druckt NICHT die eingefrorene Alt-Kostenstelle, wenn Zeilen da sind", async () => {
    const text = await pdfFuer({
      kostenstelle: "4711",
      kostenstelleAnteil: 100,
      kostenstellen: [{ bezeichnung: "5000", anteil: 100 }],
    });

    expect(text).toContain("5000");
    expect(text).not.toContain("4711");
  });

  it("weist eine Aufteilung aus, die nicht 100 Prozent ergibt", async () => {
    // Die Migration uebernimmt Bestandsanteile ungeprueft. Wer den Ausdruck
    // liest, muss das sehen koennen.
    const text = await pdfFuer({
      kostenstellen: [
        { bezeichnung: "5000", anteil: 60 },
        { bezeichnung: "6000", anteil: 30 },
      ],
    });

    expect(text).toContain("90,00 %");
    expect(text).toContain("ergibt nicht 100 %");
  });
});
