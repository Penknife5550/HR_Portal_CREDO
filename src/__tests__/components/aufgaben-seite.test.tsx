/**
 * @jest-environment jsdom
 */

/**
 * Oeffentliche Aufgabenseite einer Abteilung (/offboarding-tasks/[token]).
 *
 * Gerendert wird die echte Seite (page.tsx) mit der gemeinsamen Komponente
 * (src/components/abteilungsaufgaben/aufgaben-seite.tsx); nur Netz, Router
 * und next/image sind ersetzt. Belegt wird:
 *
 *  1. Inhalt: Kategorien als Zwischenüberschriften, „Fortschritt Ihrer
 *     Aufgaben", Countdown-Texte zum letzten Arbeitstag, Fälligkeit bzw.
 *     „Überfällig seit …".
 *  2. Fusszeile: Einrichtung des Vorgangs und Gültigkeit des Links — nie mehr
 *     fest „Christlicher Schulverein Minden e.V.".
 *  3. Kommentar: „Kommentar speichern" schickt `{ comment }`, Abhaken
 *     `{ isCompleted: true }` (den Entwurf nur, wenn getippt), Wiederöffnen
 *     `{ isCompleted: false }` ohne `comment: null`; Zähler bis 1000.
 *  4. Nur lesen (Vorgang abgeschlossen): Banner, Checkboxen und Kommentar aus.
 *  5. Fehlerseite mit dem Text des Servers.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import OffboardingTasksPage from "@/app/offboarding-tasks/[token]/page";
import type { AufgabenSeitenDaten, OeffentlicheAufgabe } from "@/components/abteilungsaufgaben/aufgaben-seite";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({ useParams: () => ({ token: "tok-it" }) }));
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

// =============================================
// Uhr: nur Date festhalten, Timer und Microtasks bleiben echt
// =============================================

/** 19.07.2027, 12:00 Uhr deutscher Zeit — zwölf Tage vor dem 31.07. */
const JETZT = new Date("2027-07-19T10:00:00.000Z");

function uhrStellen(zeit: Date = JETZT) {
  jest.useFakeTimers({
    now: zeit,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
}

afterEach(() => {
  jest.useRealTimers();
});

// =============================================
// Fixtures
// =============================================

function aufgabe(teil: Partial<OeffentlicheAufgabe>): OeffentlicheAufgabe {
  return {
    id: "a1",
    title: "IT-Zugänge zur Sperrung vorbereiten",
    category: "Phase 4: Letzte Woche",
    orderIndex: 0,
    isCompleted: false,
    completedAt: null,
    dueDate: "2027-07-29T00:00:00.000Z",
    abteilungKommentar: null,
    abteilungKommentarAm: null,
    ...teil,
  };
}

const A1 = aufgabe({});
const A2 = aufgabe({
  id: "a2",
  title: "IT-Zugänge und E-Mail-Konto sperren",
  category: "Phase 5: Letzter Tag",
  orderIndex: 1,
  dueDate: "2027-07-31T00:00:00.000Z",
});

function seitenDaten(teil: Partial<AufgabenSeitenDaten> = {}): AufgabenSeitenDaten {
  const aufgaben = teil.aufgaben ?? [A1, A2];
  const erledigt = aufgaben.filter((a) => a.isCompleted).length;
  return {
    abteilung: { key: "IT", name: "IT-Abteilung" },
    vorgang: {
      vorgangsnummer: "OFF-2027-GYM-014",
      mitarbeiterName: "Max Mustermann",
      einrichtung: "FES Minden",
      bezugsdatum: "2027-07-31T00:00:00.000Z",
    },
    readOnly: false,
    gueltigBis: "2027-10-30T00:00:00.000Z",
    aufgaben,
    fortschritt: {
      gesamt: aufgaben.length,
      erledigt,
      prozent: aufgaben.length ? Math.round((erledigt / aufgaben.length) * 100) : 100,
    },
    allTasksComplete: aufgaben.length > 0 && erledigt === aufgaben.length,
    ...teil,
  };
}

// =============================================
// Netz
// =============================================

interface Anfrage {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let anfragen: Anfrage[] = [];
let getAntwort: { status: number; body: unknown };
/** Antwort auf PATCH: Standard = Aufgabe mit den gesendeten Feldern zurueck. */
let patchAntwort: ((a: Anfrage) => { status: number; body: unknown }) | null;

function aufgabeAusAnfrage(a: Anfrage): OeffentlicheAufgabe {
  const id = a.url.split("/").pop()!;
  const basis = (getAntwort.body as { data: AufgabenSeitenDaten }).data.aufgaben.find((x) => x.id === id)!;
  const b = a.body ?? {};
  return {
    ...basis,
    ...(typeof b.isCompleted === "boolean"
      ? { isCompleted: b.isCompleted, completedAt: b.isCompleted ? "2027-07-19T10:05:00.000Z" : null }
      : {}),
    ...(typeof b.comment === "string"
      ? { abteilungKommentar: b.comment || null, abteilungKommentarAm: b.comment ? "2027-07-19T10:05:00.000Z" : null }
      : {}),
  };
}

beforeEach(() => {
  anfragen = [];
  getAntwort = { status: 200, body: { data: seitenDaten() } };
  patchAntwort = null;
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    const a: Anfrage = {
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    anfragen.push(a);
    const antwort =
      a.method === "PATCH"
        ? patchAntwort?.(a) ?? { status: 200, body: { data: { aufgabe: aufgabeAusAnfrage(a) } } }
        : getAntwort;
    return Promise.resolve({
      ok: antwort.status >= 200 && antwort.status < 300,
      status: antwort.status,
      json: async () => antwort.body,
    } as Response);
  }) as unknown as typeof fetch;
});

async function zeigeSeite() {
  await act(async () => {
    render(<OffboardingTasksPage />);
  });
}

const seitentext = () => document.body.textContent ?? "";
const karteVon = (id: string) => document.querySelector(`[data-aufgabe="${id}"]`) as HTMLElement;
const patches = () => anfragen.filter((a) => a.method === "PATCH");

// =============================================
// 1. Inhalt
// =============================================

describe("Inhalt", () => {
  it("lädt über die Route der Abteilung und zeigt Titel, Person und Einrichtung", async () => {
    uhrStellen();
    await zeigeSeite();
    expect(anfragen[0]).toEqual({ url: "/api/offboarding-tasks/tok-it", method: "GET", body: null });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Offboarding-Aufgaben: IT-Abteilung");
    const text = seitentext();
    expect(text).toContain("Mitarbeiterin / Mitarbeiter");
    expect(text).toContain("Max Mustermann");
    expect(text).toContain("FES Minden");
    expect(text).toContain("Letzter Arbeitstag");
    expect(text).toContain("31.07.2027");
  });

  it("Kategorien als Zwischenüberschriften unter „Offene Aufgaben (2)“", async () => {
    uhrStellen();
    await zeigeSeite();
    const offen = screen.getByRole("region", { name: "Offene Aufgaben (2)" });
    const ueberschriften = within(offen)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(ueberschriften).toEqual(["Phase 4: Letzte Woche", "Phase 5: Letzter Tag"]);
  });

  it("„Fortschritt Ihrer Aufgaben“ statt „Gesamtfortschritt“", async () => {
    uhrStellen();
    getAntwort = {
      status: 200,
      body: { data: seitenDaten({ aufgaben: [aufgabe({ isCompleted: true, completedAt: "2027-07-18T08:00:00.000Z" }), A2] }) },
    };
    await zeigeSeite();
    expect(seitentext()).toContain("Fortschritt Ihrer Aufgaben");
    expect(seitentext()).toContain("50 %");
    expect(seitentext()).not.toContain("Gesamtfortschritt");
    expect(seitentext()).toContain("1 / 2 erledigt");
  });

  it.each([
    ["2027-07-19T10:00:00.000Z", "Noch 12 Tage bis zum letzten Arbeitstag"],
    ["2027-07-30T10:00:00.000Z", "Morgen ist der letzte Arbeitstag"],
    ["2027-07-31T21:30:00.000Z", "Heute ist der letzte Arbeitstag"], // 23:30 Uhr in Berlin
    ["2027-08-03T10:00:00.000Z", "Letzter Arbeitstag war vor 3 Tagen"],
    ["2027-08-01T10:00:00.000Z", "Letzter Arbeitstag war vor 1 Tag"],
  ])("Countdown am %s: „%s“", async (zeit, erwartet) => {
    uhrStellen(new Date(zeit));
    await zeigeSeite();
    expect(document.querySelector("[data-countdown]")?.textContent).toBe(erwartet);
    expect(seitentext()).not.toContain("überfällig");
  });

  it("Fälligkeit: „Fällig TT.MM.JJJJ“, vergangen rot „Überfällig seit TT.MM.JJJJ“", async () => {
    uhrStellen(new Date("2027-07-30T10:00:00.000Z"));
    await zeigeSeite();
    expect(karteVon("a1").textContent).toContain("Überfällig seit 29.07.2027");
    expect(karteVon("a2").textContent).toContain("Fällig 31.07.2027");
  });

  it("alles erledigt: Dank, und die Personalabteilung sieht die Rückmeldung", async () => {
    uhrStellen();
    getAntwort = {
      status: 200,
      body: {
        data: seitenDaten({
          aufgaben: [
            aufgabe({ isCompleted: true, completedAt: "2027-07-18T08:14:00.000Z", abteilungKommentar: "Konto gesperrt." }),
          ],
        }),
      },
    };
    await zeigeSeite();
    const text = seitentext();
    expect(text).toContain("Alle Aufgaben erledigt");
    expect(text).toContain("Vielen Dank. Die Personalabteilung sieht Ihre Rückmeldung im Portal.");
    expect(text).toContain("Erledigte Aufgaben (1)");
    expect(karteVon("a1").textContent).toContain("Erledigt am 18.07.2027, 10:14");
    expect(karteVon("a1").textContent).toContain("Ihr Kommentar: Konto gesperrt.");
    expect(within(karteVon("a1")).getByRole("button", { name: "Kommentar ändern" })).not.toBeNull();
  });

  it("ohne Aufgaben: Hinweis", async () => {
    uhrStellen();
    getAntwort = { status: 200, body: { data: seitenDaten({ aufgaben: [] }) } };
    await zeigeSeite();
    expect(seitentext()).toContain("Keine Aufgaben für diese Abteilung vorhanden.");
  });
});

// =============================================
// 2. Fusszeile
// =============================================

describe("Fußzeile", () => {
  it("nennt die Einrichtung und die Gültigkeit — nie den festen Trägernamen", async () => {
    uhrStellen();
    await zeigeSeite();
    const text = seitentext();
    expect(text).toContain("Bei Fragen wenden Sie sich an die Personalabteilung.");
    expect(text).toContain(
      "Dieser Link ist für Ihre Abteilung bestimmt und gültig bis 30.10.2027. Bitte nicht außerhalb Ihrer Abteilung weitergeben.",
    );
    expect(document.querySelector('[data-fusszeile="einrichtung"]')?.textContent).toBe("© 2027 FES Minden");
    expect(text).not.toContain("Christlicher Schulverein Minden");
  });

  it("zeigt eine andere Einrichtung, wenn der Vorgang dort liegt", async () => {
    uhrStellen();
    const d = seitenDaten();
    getAntwort = {
      status: 200,
      body: { data: { ...d, vorgang: { ...d.vorgang, einrichtung: "FES Bielefeld" } } },
    };
    await zeigeSeite();
    expect(document.querySelector('[data-fusszeile="einrichtung"]')?.textContent).toBe("© 2027 FES Bielefeld");
  });
});

// =============================================
// 3. Kommentar und Abhaken
// =============================================

describe("Kommentar und Abhaken", () => {
  async function kommentarOeffnen(id = "a1") {
    fireEvent.click(within(karteVon(id)).getByRole("button", { name: "Kommentar hinzufügen" }));
    return screen.getByLabelText("Kommentar für die Personalabteilung") as HTMLTextAreaElement;
  }

  it("Textfeld mit Platzhalter, Zähler bis 1000 und Hinweis", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = await kommentarOeffnen();
    expect(feld.placeholder).toBe("Kommentar für die Personalabteilung (optional, höchstens 1000 Zeichen)");
    expect(feld.maxLength).toBe(1000);
    expect(karteVon("a1").textContent).toContain("0 / 1000");
    fireEvent.change(feld, { target: { value: "Hallo" } });
    expect(karteVon("a1").textContent).toContain("5 / 1000");
    expect(karteVon("a1").textContent).toContain(
      "Der Kommentar wird auch beim Abhaken gespeichert und ist für die Personalabteilung sichtbar.",
    );
  });

  it("„Kommentar speichern“ schickt nur { comment } — ohne Statuswechsel", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = await kommentarOeffnen();
    fireEvent.change(feld, { target: { value: "  Konto ist vorbereitet.  " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kommentar speichern" }));
    });
    expect(patches()).toEqual([
      { url: "/api/offboarding-tasks/tok-it/a1", method: "PATCH", body: { comment: "Konto ist vorbereitet." } },
    ]);
    // Antwort des Servers uebernommen, Editor zu, Aufgabe weiter offen.
    expect(karteVon("a1").textContent).toContain("Ihr Kommentar: Konto ist vorbereitet.");
    expect(within(karteVon("a1")).getByRole("button", { name: "Kommentar ändern" })).not.toBeNull();
    expect(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" })).not.toBeNull();
  });

  it("„Kommentar speichern“ ist aus, solange nichts getippt wurde", async () => {
    uhrStellen();
    await zeigeSeite();
    await kommentarOeffnen();
    expect((screen.getByRole("button", { name: "Kommentar speichern" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Abhaken ohne Tippen schickt genau { isCompleted: true }", async () => {
    uhrStellen();
    await zeigeSeite();
    await act(async () => {
      fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" }));
    });
    expect(patches().map((p) => p.body)).toEqual([{ isCompleted: true }]);
    expect(seitentext()).toContain("Erledigte Aufgaben (1)");
  });

  it("Abhaken mit getipptem Entwurf schickt den Kommentar mit", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = await kommentarOeffnen();
    fireEvent.change(feld, { target: { value: "Erledigt, Konto gesperrt." } });
    await act(async () => {
      fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" }));
    });
    expect(patches().map((p) => p.body)).toEqual([{ isCompleted: true, comment: "Erledigt, Konto gesperrt." }]);
    expect(karteVon("a1").textContent).toContain("Ihr Kommentar: Erledigt, Konto gesperrt.");
  });

  it("zugeklappter Entwurf ist verworfen: Abhaken schickt ihn NICHT mit", async () => {
    uhrStellen();
    await zeigeSeite();
    const feld = await kommentarOeffnen();
    fireEvent.change(feld, { target: { value: "Test" } });
    // Zuklappen = verwerfen
    fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Kommentar hinzufügen" }));
    expect(screen.queryByLabelText("Kommentar für die Personalabteilung")).toBeNull();
    await act(async () => {
      fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" }));
    });
    expect(patches().map((p) => p.body)).toEqual([{ isCompleted: true }]);

    // Wieder aufgeklappt: leeres Feld, nicht der verworfene Text.
    fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Kommentar hinzufügen" }));
    expect((screen.getByLabelText("Kommentar für die Personalabteilung") as HTMLTextAreaElement).value).toBe("");
  });

  it("Wiederöffnen schickt { isCompleted: false } — nie comment: null", async () => {
    uhrStellen();
    getAntwort = {
      status: 200,
      body: {
        data: seitenDaten({
          aufgaben: [aufgabe({ isCompleted: true, completedAt: "2027-07-18T08:00:00.000Z", abteilungKommentar: "Bleibt stehen." }), A2],
        }),
      },
    };
    await zeigeSeite();
    await act(async () => {
      fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Als offen markieren" }));
    });
    expect(patches().map((p) => p.body)).toEqual([{ isCompleted: false }]);
    expect("comment" in (patches()[0].body ?? {})).toBe(false);
    expect(karteVon("a1").textContent).toContain("Ihr Kommentar: Bleibt stehen.");
  });

  it("Fehler beim Speichern: Stand zurück und Text des Servers", async () => {
    uhrStellen();
    await zeigeSeite();
    patchAntwort = () => ({ status: 429, body: { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." } });
    await act(async () => {
      fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Zu viele Anfragen. Bitte warten Sie einen Moment.");
    expect(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" })).not.toBeNull();
    expect(seitentext()).toContain("Offene Aufgaben (2)");
  });

  it("409 „abgeschlossen“ beim Speichern schaltet auf nur lesen", async () => {
    uhrStellen();
    await zeigeSeite();
    patchAntwort = () => ({
      status: 409,
      body: { error: "Dieser Vorgang ist abgeschlossen. Änderungen sind nicht mehr möglich." },
    });
    await act(async () => {
      fireEvent.click(within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" }));
    });
    expect(seitentext()).toContain(
      "Dieser Vorgang ist abgeschlossen. Die Aufgaben können nicht mehr geändert werden.",
    );
    expect((within(karteVon("a1")).getByRole("button", { name: "Als erledigt markieren" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// =============================================
// 4. Nur lesen
// =============================================

describe("Nur lesen (Vorgang abgeschlossen)", () => {
  it("Banner, Checkboxen und Kommentar deaktiviert", async () => {
    uhrStellen();
    getAntwort = { status: 200, body: { data: seitenDaten({ readOnly: true }) } };
    await zeigeSeite();
    expect(seitentext()).toContain(
      "Dieser Vorgang ist abgeschlossen. Die Aufgaben können nicht mehr geändert werden.",
    );
    const checkboxen = screen.getAllByRole("button", { name: /Als (erledigt|offen) markieren/ }) as HTMLButtonElement[];
    expect(checkboxen).toHaveLength(2);
    expect(checkboxen.every((c) => c.disabled)).toBe(true);
    const kommentar = screen.getAllByRole("button", { name: /Kommentar/ }) as HTMLButtonElement[];
    expect(kommentar.every((k) => k.disabled)).toBe(true);
    fireEvent.click(checkboxen[0]);
    expect(patches()).toHaveLength(0);
  });
});

// =============================================
// 5. Fehlerseite
// =============================================

describe("Fehlerseite", () => {
  it.each([
    [404, "Ungültiger Link"],
    [410, "Dieser Link ist abgelaufen."],
    [410, "Dieser Vorgang wurde abgebrochen. Bitte keine weiteren Schritte unternehmen."],
    [429, "Zu viele Anfragen. Bitte warten Sie einen Moment."],
  ])("%s: „%s“ mit Hinweis auf die Personalabteilung", async (status, text) => {
    getAntwort = { status, body: { error: text } };
    await zeigeSeite();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Link nicht gültig");
    expect(seitentext()).toContain(text);
    expect(seitentext()).toContain(
      "Bitte wenden Sie sich an die Personalabteilung, falls Sie einen neuen Link benötigen.",
    );
  });

  it("Netzfehler: Verbindungsfehler", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    await zeigeSeite();
    expect(seitentext()).toContain("Verbindungsfehler. Bitte versuchen Sie es später erneut.");
  });
});
