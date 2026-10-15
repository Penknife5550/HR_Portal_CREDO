/**
 * @jest-environment jsdom
 */

/**
 * Einstellungsmodalitaeten: der Schritt „Ausstattung & Zugänge“ (Paket A2,
 * Feinplan S9, Mockups 6.1 und 6.2).
 *
 * An der gerenderten Seite belegt:
 *   - Mit Merker `mitAusstattung` sechs Schritte, der neue an fuenfter Stelle
 *     („Schritt 5 / 6“); ohne Merker fuenf wie bisher — laufende Formulare
 *     springen nicht (Regel 2), ein Index jenseits der Liste wird gekappt.
 *   - Gruppen je Stelle mit „Diese Angaben erhält die Stelle …“, die Bemerkung
 *     klappt erst nach einer Wahl auf, der Datenschutzhinweis haengt am Feld.
 *   - Die Vorauswahl gilt nur, solange der Schritt nie gespeichert wurde.
 *   - „Weiter“ ist nie gesperrt und schickt `{ ausstattung, hinweise,
 *     currentStep: 5 }` — auch leer.
 *   - Die Zusammenfassung zeigt die Kurzform je Stelle und zaehlt die Bemerkungen.
 *
 * Die Rechnungen selbst (Startzustand, Body, Kurzform, Stand nach dem
 * Speichern) haelt src/__tests__/lib/ausstattung.test.ts; der Server
 * src/__tests__/api/modalitaeten-ausstattung.test.ts.
 *
 * Umgebung wie in modalitaeten-kostenstellen.test.tsx: jsdom im Docblock,
 * ohne @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import ModalitaetenPage from "@/app/modalitaeten/[token]/page";
import {
  BEMERKUNG_HINWEIS,
  AENDERUNGEN_NACH_ABGABE_HINWEIS,
  KURZFORM_HINWEIS,
  fuehrungskraftSicht,
  momentaufnahme,
  type BestehendeFuehrungskraftWahl,
  type BestehendeWahl,
  type FuehrungskraftSicht,
  type KatalogPosition,
} from "@/lib/ausstattung";
import { SCHRITT_TEXTE } from "@/components/ausstattung/ausstattung-schritt";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "supervisor-token-1234567890" }),
}));

// Das Logo traegt zu keiner Zusicherung bei.
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

type Rumpf = Record<string, unknown>;

// =============================================
// Katalog und Sicht
// =============================================

function position(teil: Partial<KatalogPosition>): KatalogPosition {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    departmentKey: "IT",
    organizationId: null,
    einrichtungsarten: [],
    art: "JA_NEIN",
    angabeSchluessel: null,
    bezeichnung: "Position",
    hinweisFuehrungskraft: null,
    hinweisStelle: "nur für die Stelle",
    optionen: [],
    vorausgewaehlt: false,
    vorausgewaehlteOptionen: [],
    bemerkungAnbieten: true,
    bemerkungPlatzhalter: null,
    aufgabeTitel: null,
    defaultDueDays: -5,
    personengruppen: [],
    sichtbarFuer: [],
    entgeltrelevant: false,
    isActive: true,
    orderIndex: 0,
    ...teil,
  };
}

const IPAD = position({
  id: "11111111-1111-4111-8111-111111111111",
  bezeichnung: "Dienst-iPad (Lernmittel)",
  hinweisFuehrungskraft: "Für Lehrkräfte mit eigenem Unterricht.",
  bemerkungPlatzhalter: "z. B. Stift, Hülle, benötigte Apps",
  vorausgewaehlt: true,
  orderIndex: 10,
});
const ZUGAENGE = position({
  id: "22222222-2222-4222-8222-222222222222",
  art: "AUSWAHL",
  bezeichnung: "Zugänge",
  optionen: ["Dienst-E-Mail", "Schulportal", "WebUntis"],
  vorausgewaehlteOptionen: ["Dienst-E-Mail"],
  bemerkungPlatzhalter: "z. B. Rolle in WebUntis",
  orderIndex: 20,
});
const SCHLUESSEL = position({
  id: "33333333-3333-4333-8333-333333333333",
  departmentKey: "FACILITY",
  art: "AUSWAHL",
  bezeichnung: "Schlüssel",
  optionen: ["Haupteingang", "Lehrerzimmer"],
  orderIndex: 10,
});
const FAECHER = position({
  id: "44444444-4444-4444-8444-444444444444",
  departmentKey: "FACILITY",
  art: "ANGABE",
  angabeSchluessel: "UNTERRICHTSFAECHER",
  bezeichnung: "Unterrichtsfächer",
  bemerkungAnbieten: false,
  defaultDueDays: null,
  sichtbarFuer: ["IT"],
  orderIndex: 20,
});
const POSITIONEN = [IPAD, ZUGAENGE, SCHLUESSEL, FAECHER];
const NAMEN = { IT: "IT-Support FES", FACILITY: "Hausmeister" };

const NICHTS: BestehendeFuehrungskraftWahl = { zeilen: [], hinweise: [] };

function eigene(p: KatalogPosition, wahl: Partial<BestehendeWahl> = {}): BestehendeWahl {
  return { ...momentaufnahme(p), auswahl: [], angabe: null, bemerkung: null, ...wahl };
}

/** Die Sicht, wie GET /api/modalitaeten/[token] sie liefert (aus derselben Funktion wie der Server). */
function sichtVon(
  bestehend: BestehendeFuehrungskraftWahl = NICHTS,
  gespeichert = false,
  positionen: KatalogPosition[] = POSITIONEN,
): FuehrungskraftSicht {
  return fuehrungskraftSicht({ positionen, stellenNamen: NAMEN, bestehend, ausstattungGespeichert: gespeichert });
}

// =============================================
// Seite und Route
// =============================================

let gesendet: { method: string; body: Rumpf }[] = [];
let gespeichert: Rumpf | null = null;
let sicht: FuehrungskraftSicht | null = null;
/** Antwort des naechsten PUT, wenn er scheitern soll. */
let putFehler: { status: number; body: Rumpf } | null = null;

function seite(supervisorData: Rumpf | null) {
  return {
    onboardingId: "ob1",
    employeeName: "Lena Brandt",
    organization: { name: "Gymnasium Minden", mandantNumber: "100", type: "GYMNASIUM" },
    organizations: [],
    supervisorData,
    status: "IN_PROGRESS",
    vorgesetzteAbgesendet: false,
    ausstattung: sicht,
  };
}

/**
 * Ein Vorgang auf Schritt 4 (`currentStep: 3`, Index) mit gueltigen
 * Pflichtangaben, damit „Weiter“ durch `supStep4Schema` kommt.
 */
function schritt4(zusatz: Rumpf = {}): Rumpf {
  return {
    currentStep: 3,
    mitAusstattung: true,
    ausstattungGespeichertAm: null,
    probezeit: true,
    probezeitMonate: 6,
    urlaubstageProJahr: 30,
    masernschutzErforderlich: false,
    masernschutzVorArbeitsbeginn: false,
    zeiterfassung: true,
    zusatzvereinbarungen: "",
    kostenstellenBemerkung: "",
    kostenstellen: [],
    ...zusatz,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  gesendet = [];
  gespeichert = null;
  sicht = null;
  putFehler = null;
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return { ok: true, json: async () => seite(gespeichert) } as unknown as Response;
    }
    gesendet.push({ method, body: JSON.parse(String(init?.body)) as Rumpf });
    if (method === "PUT" && putFehler) {
      const { status, body } = putFehler;
      return { ok: false, status, json: async () => body } as unknown as Response;
    }
    return { ok: true, json: async () => ({ success: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
  window.scrollTo = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

// =============================================
// Zugriffe auf die Oberflaeche
// =============================================

const stepTitel = () => document.querySelector("main h2")?.textContent ?? "";
const letzterRumpf = () => gesendet[gesendet.length - 1].body;
const stelle = (name: string) => screen.getByRole("region", { name });
const bemerkungFeld = (bezeichnung: string) =>
  screen.queryByLabelText(`${SCHRITT_TEXTE.bemerkung} zu „${bezeichnung}“`) as HTMLTextAreaElement | null;
const chip = (name: string) => screen.getByRole("button", { name });
const schrittleiste = () => Array.from(document.querySelectorAll("nav button")).map((b) => b.textContent?.trim());

async function zeige(supervisorData: Rumpf, ausstattung: FuehrungskraftSicht | null) {
  gespeichert = supervisorData;
  sicht = ausstattung;
  render(<ModalitaetenPage />);
  await act(async () => {});
}

async function klicke(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function tippe(feld: HTMLElement, wert: string) {
  await act(async () => {
    fireEvent.change(feld, { target: { value: wert } });
  });
}

async function hake(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name }));
  });
}

// =============================================
// 1. Schrittliste mit und ohne Merker
// =============================================

describe("Schrittliste: mit Merker sechs Schritte, ohne fuenf wie bisher", () => {
  it("nach „Zusätzliche Angaben“ kommt „Ausstattung & Zugänge“ als Schritt 5 von 6", async () => {
    await zeige(schritt4(), sichtVon());
    expect(stepTitel()).toBe("Zusätzliche Angaben");
    expect(screen.getByText("Schritt 4 / 6")).toBeTruthy();
    expect(schrittleiste()).toHaveLength(6);
    expect(schrittleiste()[4]).toContain("Ausstattung & Zugänge");
    expect(schrittleiste()[5]).toContain("Zusammenfassung");

    await klicke("Weiter");

    // Schritt 4 speichert wie bisher, ohne Ausstattung.
    expect(gesendet).toHaveLength(1);
    expect(letzterRumpf().currentStep).toBe(4);
    expect(letzterRumpf()).not.toHaveProperty("ausstattung");
    expect(stepTitel()).toBe("Ausstattung & Zugänge");
    expect(screen.getByText("Schritt 5 / 6")).toBeTruthy();
    expect(screen.getByText("Was zum Arbeitsbeginn bereitstehen soll")).toBeTruthy();
  });

  it.each([false, null, undefined])("ohne Merker (%s) bleibt alles bei fuenf Schritten", async (merker) => {
    await zeige(schritt4({ mitAusstattung: merker }), null);
    expect(screen.getByText("Schritt 4 / 5")).toBeTruthy();
    expect(schrittleiste()).toHaveLength(5);

    await klicke("Weiter");

    expect(stepTitel()).toBe("Zusammenfassung");
    expect(screen.getByText("Schritt 5 / 5")).toBeTruthy();
    expect(screen.queryByText(/Ausstattung & Zugänge/)).toBeNull();
    expect(letzterRumpf()).not.toHaveProperty("ausstattung");
    expect(letzterRumpf()).not.toHaveProperty("hinweise");
  });

  it("ein gespeicherter Index jenseits der Liste wird gekappt", async () => {
    await zeige(schritt4({ currentStep: 9, mitAusstattung: false }), null);
    expect(stepTitel()).toBe("Zusammenfassung");
    expect(screen.getByText("Schritt 5 / 5")).toBeTruthy();
  });

  it("mit Merker steht die Zusammenfassung an sechster Stelle, Index 5", async () => {
    await zeige(schritt4({ currentStep: 5 }), sichtVon(NICHTS, true));
    expect(stepTitel()).toBe("Zusammenfassung");
    expect(screen.getByText("Schritt 6 / 6")).toBeTruthy();
  });

  it("der Platzhalter der Zusatzvereinbarungen verweist nur mit dem Schritt auf ihn, „Dienstwagen“ entfällt", async () => {
    await zeige(schritt4(), sichtVon());
    const mit = document.querySelector<HTMLTextAreaElement>('[name="zusatzvereinbarungen"]');
    expect(mit?.placeholder).toBe("z. B. besondere Regelungen (Ausstattung bitte im Schritt „Ausstattung & Zugänge“)");
  });

  it("ohne den Schritt nur „z. B. besondere Regelungen“", async () => {
    await zeige(schritt4({ mitAusstattung: false }), null);
    const ohne = document.querySelector<HTMLTextAreaElement>('[name="zusatzvereinbarungen"]');
    expect(ohne?.placeholder).toBe("z. B. besondere Regelungen");
  });
});

// =============================================
// 2. Der Schritt selbst
// =============================================

describe("Schritt „Ausstattung & Zugänge“", () => {
  it("gruppiert nach Stelle und sagt, wer die Angaben erhält", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon());
    const it = stelle("IT-Support FES");
    expect(within(it).getByText("Diese Angaben erhält die Stelle „IT-Support FES“.")).toBeTruthy();
    expect(within(it).getByRole("checkbox", { name: "Dienst-iPad (Lernmittel)" })).toBeTruthy();
    expect(within(it).getByRole("group", { name: "Zugänge" })).toBeTruthy();
    const hausmeister = stelle("Hausmeister");
    expect(within(hausmeister).getByText("Diese Angaben erhält die Stelle „Hausmeister“.")).toBeTruthy();
    // Die Angabe nennt, wer sie ausserdem sieht.
    const faecher = within(hausmeister).getByLabelText("Unterrichtsfächer") as HTMLInputElement;
    expect(faecher.placeholder).toBe("z. B. Chemie, Sport");
    expect(faecher.maxLength).toBe(200);
    const hilfe = document.getElementById(faecher.getAttribute("aria-describedby") ?? "");
    expect(hilfe?.textContent).toContain("Hilft bei der Zuordnung von Fachräumen.");
    expect(hilfe?.textContent).toContain("Außerdem sichtbar für: IT-Support FES.");
    // Je Stelle ein freies Feld, Hinweis E-A26.
    expect(screen.getByLabelText(/Weitere Hinweise an die Stelle „IT-Support FES“/)).toBeTruthy();
    expect(screen.getByLabelText(/Weitere Hinweise an die Stelle „Hausmeister“/)).toBeTruthy();
    expect(screen.getByText(AENDERUNGEN_NACH_ABGABE_HINWEIS)).toBeTruthy();
    // Interne Felder der Katalogposition erscheinen nie.
    expect(document.body.textContent).not.toContain("nur für die Stelle");
  });

  it("die Bemerkung klappt erst nach einer Wahl auf, mit eigenem Platzhalter und Datenschutzhinweis", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, true));
    expect(bemerkungFeld("Dienst-iPad (Lernmittel)")).toBeNull();
    expect(bemerkungFeld("Schlüssel")).toBeNull();

    await hake("Dienst-iPad (Lernmittel)");
    const ipad = bemerkungFeld("Dienst-iPad (Lernmittel)");
    expect(ipad?.placeholder).toBe("z. B. Stift, Hülle, benötigte Apps");
    expect(ipad?.maxLength).toBe(500);
    const hinweis = document.getElementById(ipad?.getAttribute("aria-describedby") ?? "");
    expect(hinweis?.textContent).toBe(BEMERKUNG_HINWEIS);
    expect(screen.getByText("0 / 500 Zeichen")).toBeTruthy();

    await act(async () => {
      fireEvent.click(chip("Haupteingang"));
    });
    expect(chip("Haupteingang").getAttribute("aria-pressed")).toBe("true");
    expect(bemerkungFeld("Schlüssel")).not.toBeNull();

    // Keine Bemerkung bei einer Angabe.
    expect(bemerkungFeld("Unterrichtsfächer")).toBeNull();
  });

  it("abwählen klappt die Bemerkung zu, wieder anhaken bringt den Text zurück", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, true));
    await hake("Dienst-iPad (Lernmittel)");
    await tippe(bemerkungFeld("Dienst-iPad (Lernmittel)")!, "Mit Stift");
    await hake("Dienst-iPad (Lernmittel)");
    expect(bemerkungFeld("Dienst-iPad (Lernmittel)")).toBeNull();
    await hake("Dienst-iPad (Lernmittel)");
    expect(bemerkungFeld("Dienst-iPad (Lernmittel)")?.value).toBe("Mit Stift");
  });

  it("die Vorauswahl gilt nur, solange der Schritt nie gespeichert wurde", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, false));
    expect((screen.getByRole("checkbox", { name: "Dienst-iPad (Lernmittel)" }) as HTMLInputElement).checked).toBe(true);
    expect(chip("Dienst-E-Mail").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Schulportal").getAttribute("aria-pressed")).toBe("false");
  });

  it("nach dem Speichern (ausstattungGespeichertAm) keine Vorauswahl mehr", async () => {
    await zeige(schritt4({ currentStep: 4, ausstattungGespeichertAm: "2027-01-10T09:00:00.000Z" }), sichtVon(NICHTS, true));
    expect((screen.getByRole("checkbox", { name: "Dienst-iPad (Lernmittel)" }) as HTMLInputElement).checked).toBe(false);
    expect(chip("Dienst-E-Mail").getAttribute("aria-pressed")).toBe("false");
  });

  it("„Weiter“ sendet { ausstattung, hinweise, currentStep: 5 } in der Form des PUT", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, true));
    await hake("Dienst-iPad (Lernmittel)");
    await tippe(bemerkungFeld("Dienst-iPad (Lernmittel)")!, "  Mit Stift und Hülle ");
    await act(async () => {
      fireEvent.click(chip("WebUntis"));
      fireEvent.click(chip("Dienst-E-Mail"));
    });
    await tippe(screen.getByLabelText("Unterrichtsfächer"), " Chemie, Sport ");
    await tippe(screen.getByLabelText(/Weitere Hinweise an die Stelle „IT-Support FES“/), "Monitor bitte höhenverstellbar");

    await klicke("Weiter");

    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].method).toBe("PUT");
    expect(letzterRumpf()).toEqual({
      ausstattung: [
        { positionId: IPAD.id, gewaehlt: true, bemerkung: "Mit Stift und Hülle" },
        { positionId: ZUGAENGE.id, auswahl: ["Dienst-E-Mail", "WebUntis"] },
        { positionId: FAECHER.id, angabe: "Chemie, Sport" },
      ],
      hinweise: [{ departmentKey: "IT", hinweis: "Monitor bitte höhenverstellbar" }],
      currentStep: 5,
    });
    expect(stepTitel()).toBe("Zusammenfassung");
  });

  it("„Weiter“ ist nie gesperrt — ohne Wahl gehen leere Listen hinaus", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, true));
    expect((screen.getByRole("button", { name: "Weiter" }) as HTMLButtonElement).disabled).toBe(false);

    await klicke("Weiter");

    expect(letzterRumpf()).toEqual({ ausstattung: [], hinweise: [], currentStep: 5 });
  });

  it("leerer Ausschnitt trotz Merker: ein Satz statt Positionen, „Weiter“ frei", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, false, []));
    expect(screen.getByText(SCHRITT_TEXTE.leer)).toBeTruthy();
    expect(screen.queryAllByRole("region")).toHaveLength(0);

    await klicke("Weiter");

    expect(letzterRumpf()).toEqual({ ausstattung: [], hinweise: [], currentStep: 5 });
    expect(stepTitel()).toBe("Zusammenfassung");
  });

  it("ohne Sicht sendet „Weiter“ nichts zur Ausstattung (keine gespeicherte Wahl wird geleert)", async () => {
    await zeige(schritt4({ currentStep: 4 }), null);
    await klicke("Weiter");
    expect(letzterRumpf()).toEqual({ currentStep: 5 });
  });

  it("eine Position, die der Katalog nicht mehr anbietet, steht mit „nicht mehr im Katalog“ da", async () => {
    const alt = position({ id: "55555555-5555-4555-8555-555555555555", bezeichnung: "Altes iPad", orderIndex: 5 });
    await zeige(schritt4({ currentStep: 4 }), sichtVon({ zeilen: [eigene(alt)], hinweise: [] }, true));
    const box = screen.getByRole("checkbox", { name: "Altes iPad" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(within(stelle("IT-Support FES")).getByText(SCHRITT_TEXTE.nichtMehrImKatalog)).toBeTruthy();
    const beschreibung = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(beschreibung).toContain(SCHRITT_TEXTE.nichtMehrImKatalogHilfe);
  });

  it("eine gewählte Position, die der Katalog seitdem geändert hat, steht in der gespeicherten Form mit „inzwischen geändert“ da", async () => {
    // Gespeichert als Auswahl mit zwei Optionen; heute führt der Katalog „Zugänge“ als Ja/Nein.
    const jetzt = { ...ZUGAENGE, art: "JA_NEIN", optionen: [], vorausgewaehlteOptionen: [] };
    const bestehend = { zeilen: [eigene(ZUGAENGE, { auswahl: ["Dienst-E-Mail", "WebUntis"] })], hinweise: [] };
    await zeige(schritt4({ currentStep: 4 }), sichtVon(bestehend, true, [IPAD, jetzt, SCHLUESSEL, FAECHER]));

    // Die neue Form (Häkchen) fehlt, die gespeicherte (Chips) steht da und ist gewählt.
    expect(screen.queryByRole("checkbox", { name: "Zugänge" })).toBeNull();
    expect(chip("Dienst-E-Mail").getAttribute("aria-pressed")).toBe("true");
    expect(chip("WebUntis").getAttribute("aria-pressed")).toBe("true");
    const gruppe = screen.getByRole("group", { name: "Zugänge" });
    expect(within(gruppe).getByText(SCHRITT_TEXTE.imKatalogGeaendert)).toBeTruthy();
    expect(within(gruppe).queryByText(SCHRITT_TEXTE.nichtMehrImKatalog)).toBeNull();
    const beschreibung = (gruppe.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(beschreibung).toContain(SCHRITT_TEXTE.imKatalogGeaendertHilfe);

    // „Weiter“ ohne Änderung schickt die gespeicherte Form zurück — der Server nimmt sie an.
    await klicke("Weiter");
    expect(letzterRumpf().ausstattung).toEqual([{ positionId: ZUGAENGE.id, auswahl: ["Dienst-E-Mail", "WebUntis"] }]);
  });

  it("ein 400 des Servers bleibt im Schritt stehen und wird angezeigt", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, true));
    putFehler = {
      status: 400,
      body: { error: "Eine gewählte Position gehört nicht (mehr) zu diesem Formular. Bitte laden Sie die Seite neu." },
    };
    await hake("Dienst-iPad (Lernmittel)");
    await klicke("Weiter");

    expect(stepTitel()).toBe("Ausstattung & Zugänge");
    expect(screen.getByRole("alert").textContent).toContain("Bitte laden Sie die Seite neu.");
  });
});

// =============================================
// 3. Zusammenfassung
// =============================================

describe("Zusammenfassung: „5. Ausstattung & Zugänge“", () => {
  it("zeigt die Kurzform je Stelle und zaehlt die Bemerkungen", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, true));
    await hake("Dienst-iPad (Lernmittel)");
    await tippe(bemerkungFeld("Dienst-iPad (Lernmittel)")!, "Mit Stift");
    await act(async () => {
      fireEvent.click(chip("Dienst-E-Mail"));
      fireEvent.click(chip("Schulportal"));
      fireEvent.click(chip("Haupteingang"));
    });
    await tippe(screen.getByLabelText("Unterrichtsfächer"), "Chemie, Sport");
    await tippe(screen.getByLabelText(/Weitere Hinweise an die Stelle „IT-Support FES“/), "Monitor bitte höhenverstellbar");
    await klicke("Weiter");

    expect(stepTitel()).toBe("Zusammenfassung");
    const karte = document.querySelector<HTMLElement>('[data-zusammenfassung="ausstattung"]')!;
    expect(within(karte).getByRole("heading", { name: "5. Ausstattung & Zugänge" })).toBeTruthy();
    expect(within(karte).getByText(`Dienst-iPad (Lernmittel) · Zugänge (2) · ${KURZFORM_HINWEIS}`)).toBeTruthy();
    expect(within(karte).getByText("Schlüssel (1) · Unterrichtsfächer: Chemie, Sport")).toBeTruthy();
    const bemerkungen = karte.querySelector('[data-zeile="bemerkungen"]');
    expect(bemerkungen?.textContent).toBe("Bemerkungen1");
    // Der Text der Bemerkung steht nicht in der Zusammenfassung.
    expect(karte.textContent).not.toContain("Mit Stift");
    expect(karte.textContent).not.toContain("Monitor");
    // Die Karte steht nach „4. Zusätzliche Angaben“.
    const titel = Array.from(document.querySelectorAll("main h3")).map((h) => h.textContent);
    expect(titel.indexOf("5. Ausstattung & Zugänge")).toBe(titel.indexOf("4. Zusätzliche Angaben") + 1);
  });

  it("„Zurück“ aus der Zusammenfassung zeigt die gespeicherte Wahl, nicht die Vorauswahl von vorher", async () => {
    await zeige(schritt4({ currentStep: 4 }), sichtVon(NICHTS, false));
    // Vorauswahl iPad abwählen, dann speichern.
    await hake("Dienst-iPad (Lernmittel)");
    await klicke("Weiter");
    expect(letzterRumpf().ausstattung).toEqual([{ positionId: ZUGAENGE.id, auswahl: ["Dienst-E-Mail"] }]);

    await klicke("Zurück");

    expect(stepTitel()).toBe("Ausstattung & Zugänge");
    expect((screen.getByRole("checkbox", { name: "Dienst-iPad (Lernmittel)" }) as HTMLInputElement).checked).toBe(false);
    expect(chip("Dienst-E-Mail").getAttribute("aria-pressed")).toBe("true");
  });

  it("beim Wiedereinstieg in die Zusammenfassung steht die gespeicherte Wahl darin", async () => {
    const bestehend = {
      zeilen: [eigene(SCHLUESSEL, { auswahl: ["Haupteingang", "Lehrerzimmer"], bemerkung: "Sammlung später" })],
      hinweise: [],
    };
    await zeige(schritt4({ currentStep: 5 }), sichtVon(bestehend, true));
    const karte = document.querySelector<HTMLElement>('[data-zusammenfassung="ausstattung"]')!;
    expect(within(karte).getByText("Schlüssel (2)")).toBeTruthy();
    expect(karte.querySelector('[data-zeile="bemerkungen"]')?.textContent).toBe("Bemerkungen1");
  });

  it("Wiedereinstieg nach einer Katalogänderung: die Zusammenfassung zeigt die gespeicherte Form, nicht die neue", async () => {
    // Gespeichert: Zugänge (Auswahl, 2 Optionen) bei der IT, Schlüssel beim Hausmeister.
    // Seitdem: Zugänge ist Ja/Nein und heißt anders, Schlüssel gehört zur IT.
    const bestehend = {
      zeilen: [
        eigene(ZUGAENGE, { auswahl: ["Dienst-E-Mail", "WebUntis"] }),
        eigene(SCHLUESSEL, { auswahl: ["Haupteingang"] }),
      ],
      hinweise: [],
    };
    const zugaengeJetzt = { ...ZUGAENGE, art: "JA_NEIN", bezeichnung: "Zugänge (neu)", optionen: [], vorausgewaehlteOptionen: [] };
    const schluesselJetzt = { ...SCHLUESSEL, departmentKey: "IT" };
    await zeige(schritt4({ currentStep: 5 }), sichtVon(bestehend, true, [IPAD, zugaengeJetzt, schluesselJetzt, FAECHER]));

    const karte = document.querySelector<HTMLElement>('[data-zusammenfassung="ausstattung"]')!;
    expect(karte.querySelector('[data-stelle="IT"]')?.textContent).toBe("IT-Support FESZugänge (2)");
    expect(karte.querySelector('[data-stelle="FACILITY"]')?.textContent).toBe("HausmeisterSchlüssel (1)");
    expect(karte.textContent).not.toContain("Zugänge (neu)");
  });

  it("ohne Wahl: „Keine Auswahl“", async () => {
    await zeige(schritt4({ currentStep: 5 }), sichtVon(NICHTS, true));
    const karte = document.querySelector<HTMLElement>('[data-zusammenfassung="ausstattung"]')!;
    expect(within(karte).getByText("Keine Auswahl")).toBeTruthy();
  });

  it("ohne Merker gibt es die Karte nicht", async () => {
    await zeige(schritt4({ currentStep: 4, mitAusstattung: false }), null);
    expect(stepTitel()).toBe("Zusammenfassung");
    expect(document.querySelector('[data-zusammenfassung="ausstattung"]')).toBeNull();
  });
});
