/**
 * @jest-environment jsdom
 */

/**
 * Checklisten-Vorlagen, die Oberflaeche (Paket 5).
 *
 * Drei Dinge zeigen sich nur in der React-Verdrahtung:
 *
 *  1. SPEICHERN. Frueher gingen beim Bearbeiten ein PATCH, dann ein DELETE je
 *     Punkt und dann ein POST je Punkt hinaus — keine einzige Antwort wurde
 *     geprueft, und am Ende stand „Checkliste erfolgreich aktualisiert", auch
 *     wenn alle Punkte geloescht und keiner neu angelegt worden war. Hier ist
 *     belegt: EIN PUT, die IDs der vorhandenen Punkte gehen mit, und ein
 *     Fehler des Servers steht als Fehler in der Oberflaeche.
 *  2. ZUSTAENDIGKEIT. Im Onboarding war sie Freitext. Jetzt eine Auswahl mit
 *     den Gruppen „Im Portal" und „Per Link" — und ein Altwert („Hausmeister")
 *     verschwindet nicht still, sondern steht als „Unbekannt: … (bitte
 *     zuordnen)" darin.
 *  3. FAELLIGKEIT UND HINWEIS je Modul: „14 Tage vor Vertragsbeginn" gegen
 *     „Am letzten Arbeitstag", Zaehler „0 / 500".
 *
 * Umgebung wie in einstellungen-abteilungen.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, createEvent, fireEvent, render } from "@testing-library/react";
import { ChecklistenContent } from "@/app/(portal)/checklisten/checklisten-content";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Der Kopf haengt seit U1 im Portal-Layout, nicht mehr in der Seite.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/checklisten",
}));

// =============================================
// Fixtures
// =============================================

const ADMIN = {
  userId: "u-sa",
  email: "admin@credo.de",
  role: "SUPER_ADMIN",
  firstName: "Dimitri",
  lastName: "Riesen",
};

function punkt(teil: Record<string, unknown>) {
  return {
    id: "i-1",
    templateId: "t-on",
    title: "Arbeitsvertrag erstellt",
    category: "Vor Arbeitsbeginn",
    orderIndex: 0,
    defaultDueDays: -14,
    defaultAssignee: "HR",
    description: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...teil,
  };
}

const ONBOARDING_VORLAGE = {
  id: "t-on",
  name: "Standard-Einstellung (TV-L)",
  description: "Standard-Checkliste für Einstellungen nach TV-L",
  questionnaireType: "STANDARD",
  isActive: true,
  items: [
    punkt({}),
    punkt({ id: "i-2", title: "IT-Konto anlegen", orderIndex: 1, defaultDueDays: -7, defaultAssignee: "IT", description: "Microsoft 365" }),
    punkt({ id: "i-3", title: "Schlüssel bestellen", orderIndex: 2, defaultDueDays: 0, defaultAssignee: "Hausmeister" }),
    punkt({ id: "i-4", title: "Datenschutz-Unterweisung", orderIndex: 3, defaultDueDays: 7, defaultAssignee: "DSB" }),
  ],
  _count: { items: 4, onboardings: 2 },
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

/**
 * Zweite Onboarding-Vorlage fuer die beiden Befunde der Durchsicht: ein SELBST
 * angelegter Schluessel (Badge zeigte den Rohwert „EMPFANG") und eine
 * Tagesangabe von genau einem Tag („1 Tage vor Vertragsbeginn").
 */
const EIGENE_VORLAGE = {
  id: "t-eigen",
  name: "Aushilfe (Empfang)",
  description: null,
  questionnaireType: "MINIJOB",
  isActive: true,
  items: [
    punkt({ id: "e-1", templateId: "t-eigen", title: "Hausausweis ausstellen", category: "Empfang & Ausweis", orderIndex: 0, defaultDueDays: -1, defaultAssignee: "EMPFANG", description: null }),
    punkt({ id: "e-2", templateId: "t-eigen", title: "Einweisung", category: "Empfang & Ausweis", orderIndex: 1, defaultDueDays: 1, defaultAssignee: "EMPFANG", description: null }),
  ],
  _count: { items: 2, onboardings: 0 },
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const OFFBOARDING_VORLAGE = {
  ...ONBOARDING_VORLAGE,
  id: "t-off",
  name: "Offboarding: Standard",
  description: null,
  questionnaireType: null,
  items: [
    punkt({ id: "o-1", templateId: "t-off", title: "IT-Zugänge sperren", defaultDueDays: 0, defaultAssignee: "IT" }),
    punkt({ id: "o-2", templateId: "t-off", title: "Resturlaub berechnen", orderIndex: 1, defaultDueDays: -28, defaultAssignee: "HR" }),
  ],
  _count: { items: 2, onboardings: 0 },
};

const ABTEILUNGEN = [
  { departmentKey: "IT", departmentName: "IT-Abteilung", isActive: true },
  { departmentKey: "VERWALTUNG", departmentName: "Sekretariat GYM", isActive: true },
  { departmentKey: "EMPFANG", departmentName: "Empfang", isActive: true },
  // DSB ist angelegt, aber abgeschaltet → zaehlt als „keine Adresse".
  { departmentKey: "DSB", departmentName: "Datenschutz", isActive: false },
];

// =============================================
// Netz
// =============================================

interface Aufruf {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let aufrufe: Aufruf[] = [];
/** Antwort auf die naechste schreibende Anfrage. */
let schreibAntwort: { ok: boolean; koerper: unknown } = { ok: true, koerper: { data: {} } };

function json(ok: boolean, koerper: unknown) {
  return Promise.resolve({ ok, json: async () => koerper } as Response);
}

beforeEach(() => {
  aufrufe = [];
  schreibAntwort = { ok: true, koerper: { data: {} } };
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    const adresse = String(url);
    const method = init?.method ?? "GET";
    aufrufe.push({ url: adresse, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "GET" && adresse === "/api/checklisten") {
      return json(true, { data: [ONBOARDING_VORLAGE, EIGENE_VORLAGE, OFFBOARDING_VORLAGE] });
    }
    if (method === "GET" && adresse === "/api/settings/departments") {
      return json(true, { data: ABTEILUNGEN, verwendung: {}, fehlendeAdressen: [] });
    }
    return json(schreibAntwort.ok, schreibAntwort.koerper);
  }) as unknown as typeof fetch;
});

async function zeigeSeite() {
  await act(async () => {
    render(<ChecklistenContent user={ADMIN} />);
  });
}

const seitentext = () => document.body.textContent ?? "";
const schreibend = () => aufrufe.filter((a) => a.method !== "GET");

async function klicke(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

function knopf(text: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!treffer) throw new Error(`Knopf „${text}" fehlt`);
  return treffer as HTMLButtonElement;
}

/** Kategorie aufklappen (Titel steht im Kopf des Aufklappers). */
async function klappeAuf(kategorie: string) {
  const treffer = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").startsWith(kategorie),
  );
  if (!treffer) throw new Error(`Kategorie „${kategorie}" fehlt`);
  await klicke(treffer);
}

async function wechsleTab(name: string) {
  await klicke(knopf(name));
}

async function oeffneEditor() {
  await klicke(knopf("Bearbeiten"));
}

function auswahl(index: number): HTMLSelectElement {
  const feld = document.getElementById(`punkt-zustaendig-${index}`);
  if (!feld) throw new Error(`Auswahl fuer Punkt ${index + 1} fehlt`);
  return feld as HTMLSelectElement;
}

function optionsTexte(select: HTMLSelectElement): string[] {
  return Array.from(select.querySelectorAll("option")).map((o) => o.textContent ?? "");
}

// =============================================
// Karte je Vorlage
// =============================================

describe("Vorlagen-Karte", () => {
  it("zeigt Labels statt Rohschluessel und die Faelligkeit je Modul", async () => {
    await zeigeSeite();
    await klappeAuf("Vor Arbeitsbeginn");
    const text = seitentext();
    expect(text).toContain("IT-Abteilung");
    expect(text).toContain("Personalabteilung");
    expect(text).toContain("14 Tage vor Vertragsbeginn");
    expect(text).toContain("Am Vertragsbeginn");
    expect(text).toContain("7 Tage nach Vertragsbeginn");
    // Ein Altwert bleibt sichtbar, wie er ist — haesslich, aber ehrlich.
    expect(text).toContain("Hausmeister");
    // Der Hinweis aus der Vorlage steht unter dem Titel.
    expect(text).toContain("Microsoft 365");
  });

  it("warnt, wenn eine Link-Abteilung keine aktive Adresse hat", async () => {
    await zeigeSeite();
    expect(seitentext()).toContain(
      "1 Punkt ohne Adresse: Datenschutzbeauftragte/r ist unter Einstellungen → Abteilungen nicht hinterlegt.",
    );
    // Die Fuehrungskraft zaehlt nicht mit (ihre Adresse steht im Vorgang) …
    expect(seitentext()).not.toContain("Führungskraft ist unter Einstellungen");
    // … und ein Freitext-Altwert ist keine Abteilung.
    expect(seitentext()).not.toContain("Hausmeister ist unter Einstellungen");
  });

  it("Offboarding formuliert die Faelligkeit auf den letzten Arbeitstag", async () => {
    await zeigeSeite();
    await wechsleTab("Offboarding");
    await klappeAuf("Vor Arbeitsbeginn");
    const text = seitentext();
    expect(text).toContain("Am letzten Arbeitstag");
    expect(text).toContain("28 Tage vor dem letzten Arbeitstag");
    expect(text).not.toContain("Standard-Einstellung (TV-L)");
  });

  it("ein selbst angelegter Schluessel steht mit seinem Namen auf der Karte", async () => {
    // Befund der Durchsicht: `abteilungLabel()` kennt nur die festen
    // Schluessel und gab fuer einen eigenen den Rohwert zurueck — waehrend die
    // Auswahl im Modal darueber den echten Namen anbot.
    await zeigeSeite();
    await klappeAuf("Empfang & Ausweis");
    const text = seitentext();
    expect(text).toContain("Empfang");
    expect(text).not.toContain("EMPFANG");
  });

  it("ein einzelner Tag heisst „Tag“, nicht „Tage“", async () => {
    await zeigeSeite();
    await klappeAuf("Empfang & Ausweis");
    const text = seitentext();
    expect(text).toContain("1 Tag vor Vertragsbeginn");
    expect(text).toContain("1 Tag nach Vertragsbeginn");
    expect(text).not.toContain("1 Tage");
  });

  it("der Tab „Verbeamtung“ zeigt keine Onboarding-Vorlagen mehr", async () => {
    await zeigeSeite();
    await wechsleTab("Verbeamtung");
    const text = seitentext();
    expect(text).toContain("Verbeamtung (PSI)");
    expect(text).not.toContain("Standard-Einstellung (TV-L)");
    expect(text).not.toContain("Keine Onboarding-Checklisten-Vorlagen gefunden.");
  });
});

// =============================================
// Editor
// =============================================

describe("Editor", () => {
  it("bietet die Zustaendigkeit auch im Onboarding als Auswahl an – mit beiden Gruppen", async () => {
    await zeigeSeite();
    await oeffneEditor();

    const feld = auswahl(0);
    expect(feld.tagName).toBe("SELECT");
    const gruppen = Array.from(feld.querySelectorAll("optgroup")).map((g) => g.getAttribute("label"));
    expect(gruppen).toEqual(["Im Portal", "Per Link"]);

    const texte = optionsTexte(feld);
    expect(texte).toContain("— keine —");
    expect(texte).toContain("Personalabteilung");
    expect(texte).toContain("Mitarbeiter/in");
    expect(texte).toContain("IT-Abteilung");
    expect(texte).toContain("Verwaltung / Sekretariat");
    expect(texte).toContain("Führungskraft des Vorgangs");
    // Eigener Schluessel aus Einstellungen → Abteilungen
    expect(texte).toContain("Empfang");

    // Kein Freitextfeld mehr fuer die Zustaendigkeit
    const platzhalter = Array.from(document.querySelectorAll("input")).map((i) => i.getAttribute("placeholder"));
    expect(platzhalter).not.toContain("Verantwortlicher (z.B. HR, IT)");
  });

  it("zeigt einen unbekannten Altwert als „Unbekannt: … (bitte zuordnen)“ und verliert ihn nicht", async () => {
    await zeigeSeite();
    await oeffneEditor();

    const feld = auswahl(2);
    expect(feld.value).toBe("Hausmeister");
    expect(optionsTexte(feld)).toContain("Unbekannt: Hausmeister (bitte zuordnen)");
    // Nur bei diesem Punkt, nicht bei den anderen
    expect(optionsTexte(auswahl(0)).some((t) => t.startsWith("Unbekannt:"))).toBe(false);
  });

  it("zeigt Fällig (Tage) mit Hilfetext je Modul und den Hinweis mit Zaehler", async () => {
    await zeigeSeite();
    await oeffneEditor();

    const text = seitentext();
    expect(text).toContain("Fällig (Tage)");
    expect(text).toContain("relativ zum Vertragsbeginn");
    expect(text).toContain("Hinweis für die zuständige Stelle (optional)");
    // Punkt 1 ohne Hinweis, Punkt 2 mit „Microsoft 365" (13 Zeichen)
    expect(text).toContain("0 / 500");
    expect(text).toContain("13 / 500");

    const hinweis = document.getElementById("punkt-hinweis-1") as HTMLTextAreaElement;
    expect(hinweis.value).toBe("Microsoft 365");
    expect(hinweis.getAttribute("maxLength")).toBe("500");
  });

  it("der Zaehler laeuft mit der Eingabe mit", async () => {
    await zeigeSeite();
    await oeffneEditor();
    const hinweis = document.getElementById("punkt-hinweis-0") as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(hinweis, { target: { value: "Transponder für Haupteingang" } });
    });
    expect(seitentext()).toContain("28 / 500");
  });
});

// =============================================
// Reihenfolge
// =============================================

describe("Reihenfolge", () => {
  function pfeil(label: string): HTMLButtonElement {
    const treffer = document.querySelector(`button[aria-label="${label}"]`);
    if (!treffer) throw new Error(`Pfeil „${label}" fehlt`);
    return treffer as HTMLButtonElement;
  }

  const titel = () =>
    [0, 1, 2, 3].map((i) => (document.getElementById(`punkt-titel-${i}`) as HTMLInputElement).value);

  const zeilen = () => Array.from(document.querySelectorAll<HTMLElement>("[data-punkt]"));
  const liste = () => document.querySelector("[data-punktliste]") as HTMLElement;

  async function gespeicherteIds() {
    await klicke(knopf("Aktualisieren"));
    const rumpf = schreibend()[0].body as { items: { id: string; orderIndex: number }[] };
    expect(rumpf.items.map((p) => p.orderIndex)).toEqual([0, 1, 2, 3]);
    return rumpf.items.map((p) => p.id);
  }

  const zugDaten = () => ({ setData: jest.fn(), setDragImage: jest.fn(), effectAllowed: "", dropEffect: "" });

  /**
   * jsdom kennt kein Layout. Fuer die Rechnung „welche Marke steht an der
   * Stelle des Zeigers" bekommen die Zeilen feste Flaechen: Zeile i liegt bei
   * y = i*100 … i*100+88, dazwischen 12 px Abstand; die Liste reicht mit ihrem
   * Innenabstand von -8 bis 396.
   */
  function flaechenSetzen() {
    const flaeche = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 600, width: 600, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    zeilen().forEach((z, i) => {
      z.getBoundingClientRect = () => flaeche(i * 100, i * 100 + 88);
    });
    liste().getBoundingClientRect = () => flaeche(-8, 396);
  }

  /**
   * Zieh-Ereignis MIT Zeigerposition. jsdom kennt kein DragEvent; die
   * Testing Library faellt auf ein nacktes Event zurueck und verwirft
   * clientX/clientY aus den Optionen. Deshalb werden sie am Ereignis gesetzt.
   * Rueckgabe wie fireEvent: false, wenn preventDefault gerufen wurde.
   */
  function zug(
    typ: "dragOver" | "dragLeave" | "drop",
    ziel: Element,
    optionen: { dataTransfer?: unknown; clientX?: number; clientY?: number } = {},
  ): boolean {
    const ereignis = createEvent[typ](ziel, { dataTransfer: optionen.dataTransfer });
    Object.defineProperty(ereignis, "clientX", { value: optionen.clientX ?? 0 });
    Object.defineProperty(ereignis, "clientY", { value: optionen.clientY ?? 0 });
    return fireEvent(ziel, ereignis);
  }

  async function ziehe(von: number, ueber: Element, ort: { clientX?: number; clientY?: number } = {}) {
    const dataTransfer = zugDaten();
    await act(async () => {
      fireEvent.dragStart(document.querySelector(`[data-griff="${von}"]`) as HTMLElement, { dataTransfer });
    });
    await act(async () => {
      zug("dragOver", ueber, { dataTransfer, ...ort });
    });
    return dataTransfer;
  }

  it("die Pfeile verschieben einen Punkt, und die neue Reihenfolge wird gespeichert", async () => {
    await zeigeSeite();
    await oeffneEditor();
    // Am Listenende aria-disabled, NICHT disabled: Der Knopf wandert mit dem
    // Punkt und behielte mit `disabled` den Tastaturfokus nicht.
    expect(pfeil("Punkt 1 nach oben").getAttribute("aria-disabled")).toBe("true");
    expect(pfeil("Punkt 4 nach unten").getAttribute("aria-disabled")).toBe("true");
    expect(pfeil("Punkt 1 nach oben").disabled).toBe(false);
    await klicke(pfeil("Punkt 1 nach oben"));
    await klicke(pfeil("Punkt 4 nach unten"));
    expect(titel()[0]).toBe("Arbeitsvertrag erstellt");
    expect(titel()[3]).toBe("Datenschutz-Unterweisung");

    await klicke(pfeil("Punkt 4 nach oben"));
    await klicke(pfeil("Punkt 3 nach oben"));
    expect(titel()).toEqual([
      "Arbeitsvertrag erstellt",
      "Datenschutz-Unterweisung",
      "IT-Konto anlegen",
      "Schlüssel bestellen",
    ]);
    expect(await gespeicherteIds()).toEqual(["i-1", "i-4", "i-2", "i-3"]);
  });

  it("die Zeile wandert als Ganzes mit – derselbe DOM-Knoten, nicht nur seine Werte", async () => {
    // Mit `key={index}` blieben die Knoten an ihrer Position und bekaemen nur
    // neue Werte: Fokus, Auswahl und ungespeicherte Eingaben blieben an der
    // alten Stelle haengen.
    await zeigeSeite();
    await oeffneEditor();
    const erste = zeilen()[0];
    await klicke(pfeil("Punkt 1 nach unten"));
    expect(zeilen()[1]).toBe(erste);
    expect(zeilen()[0]).not.toBe(erste);
  });

  it("nach dem Verschieben rollt der Dialog um die Strecke mit, die der Punkt gewandert ist", async () => {
    // Befund der Durchsicht: Der Punkt wanderte unter dem Zeiger weg, der
    // zweite Klick an derselben Stelle traf den Pfeil des Nachbarn und nahm
    // die Verschiebung zurueck.
    await zeigeSeite();
    await oeffneEditor();
    const erste = zeilen()[0];
    let oben = 120;
    erste.getBoundingClientRect = () => ({ top: oben }) as DOMRect;
    const rumpf = erste.closest(".overflow-y-auto") as HTMLElement;
    rumpf.scrollTop = 40;
    oben = 120;
    const klick = klicke(pfeil("Punkt 1 nach unten"));
    // Nach dem Umhaengen steht die Zeile 319 px tiefer.
    oben = 439;
    await klick;
    expect(rumpf.scrollTop).toBe(40 + 319);
  });

  it("Ziehen am Griff legt den Punkt auf der Zeile ab, über der losgelassen wird", async () => {
    await zeigeSeite();
    await oeffneEditor();
    const ziel = zeilen()[2];
    const dataTransfer = await ziehe(0, ziel);
    await act(async () => {
      fireEvent.drop(ziel, { dataTransfer });
    });
    expect(await gespeicherteIds()).toEqual(["i-2", "i-3", "i-1", "i-4"]);
  });

  it("der Griff ist ziehbar und trägt einen eigenen Datentyp, nie text/plain", async () => {
    // text/plain naehmen die Textfelder „Name" und „Beschreibung" von sich aus
    // an – die Positionsnummer landete im Vorlagennamen.
    await zeigeSeite();
    await oeffneEditor();
    const griff = document.querySelector('[data-griff="1"]') as HTMLElement;
    expect(griff.getAttribute("draggable")).toBe("true");
    const dataTransfer = zugDaten();
    await act(async () => {
      fireEvent.dragStart(griff, { dataTransfer });
    });
    expect(dataTransfer.setData).toHaveBeenCalledTimes(1);
    expect(dataTransfer.setData.mock.calls[0][0]).toBe("application/x-credo-checklistenpunkt");
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(zeilen()[1], 16, 16);
  });

  it("im Zwischenraum zählt die Stelle des Zeigers – unabhängig vom Weg dorthin", async () => {
    // Befund der Durchsicht: Ziel war die zuletzt ueberfahrene Zeile. Dieselbe
    // Luecke ergab je nach Weg verschiedene Positionen.
    for (const umweg of [false, true]) {
      aufrufe = [];
      document.body.innerHTML = "";
      await zeigeSeite();
      await oeffneEditor();
      flaechenSetzen();
      const dataTransfer = await ziehe(3, zeilen()[umweg ? 0 : 2]);
      // Luecke zwischen Zeile 2 (100–188) und Zeile 3 (200–288)
      await act(async () => {
        zug("dragOver", liste(), { dataTransfer, clientX: 10, clientY: 194 });
      });
      await act(async () => {
        zug("drop", liste(), { dataTransfer, clientX: 10, clientY: 194 });
      });
      expect(await gespeicherteIds()).toEqual(["i-1", "i-2", "i-4", "i-3"]);
    }
  });

  it("die Marken über dem ersten und unter dem letzten Punkt sind Ablageziel", async () => {
    // Befund der Durchsicht: Beide Marken lagen ausserhalb der Liste; dort
    // losgelassen, sprang der Punkt zurueck.
    await zeigeSeite();
    await oeffneEditor();
    flaechenSetzen();
    const dataTransfer = await ziehe(2, liste(), { clientX: 10, clientY: -4 });
    expect(zeilen()[0].className).toContain("shadow-primary");
    await act(async () => {
      zug("drop", liste(), { dataTransfer, clientX: 10, clientY: -4 });
    });
    expect(await gespeicherteIds()).toEqual(["i-3", "i-1", "i-2", "i-4"]);
  });

  it("unter dem letzten Punkt losgelassen landet der Punkt am Ende", async () => {
    await zeigeSeite();
    await oeffneEditor();
    flaechenSetzen();
    const dataTransfer = await ziehe(0, liste(), { clientX: 10, clientY: 392 });
    await act(async () => {
      zug("drop", liste(), { dataTransfer, clientX: 10, clientY: 392 });
    });
    expect(await gespeicherteIds()).toEqual(["i-2", "i-3", "i-4", "i-1"]);
  });

  it("die Liste bricht dragenter und dragover ab, aber nur während eines eigenen Ziehens", async () => {
    await zeigeSeite();
    await oeffneEditor();
    // fireEvent liefert false, wenn preventDefault gerufen wurde.
    expect(fireEvent.dragEnter(liste())).toBe(true);
    expect(fireEvent.dragOver(liste())).toBe(true);
    await act(async () => {
      fireEvent.drop(liste());
    });

    const dataTransfer = await ziehe(1, zeilen()[1]);
    expect(fireEvent.dragEnter(zeilen()[2], { dataTransfer })).toBe(false);
    expect(fireEvent.dragOver(zeilen()[2], { dataTransfer })).toBe(false);
    expect(dataTransfer.dropEffect).toBe("move");
    await act(async () => {
      fireEvent.dragEnd(document.querySelector('[data-griff="1"]') as HTMLElement);
    });
    expect(await gespeicherteIds()).toEqual(["i-1", "i-2", "i-3", "i-4"]);
  });

  it("verlässt der Zeiger die Liste, verschwindet die Marke", async () => {
    await zeigeSeite();
    await oeffneEditor();
    flaechenSetzen();
    const dataTransfer = await ziehe(0, zeilen()[2]);
    expect(zeilen()[2].className).toContain("shadow-primary");
    // Wechsel zwischen Kindern (Zeiger weiter in der Liste) laesst sie stehen …
    await act(async () => {
      zug("dragLeave", liste(), { dataTransfer, clientX: 10, clientY: 150 });
    });
    expect(zeilen()[2].className).toContain("shadow-primary");
    // … das Verlassen nimmt sie weg.
    await act(async () => {
      zug("dragLeave", liste(), { dataTransfer, clientX: 10, clientY: 900 });
    });
    expect(zeilen().some((z) => z.className.includes("shadow-primary"))).toBe(false);
  });

  it("der Ziehzustand überlebt das Schließen des Dialogs nicht", async () => {
    // Befund der Durchsicht: Schloss das Speichern den Dialog waehrend eines
    // Ziehens, kam dragend nur am abgehaengten Griff an. Beim naechsten Oeffnen
    // war die Zeile halbtransparent, und die Liste nahm fremdes Ablegen an.
    await zeigeSeite();
    await oeffneEditor();
    await ziehe(2, zeilen()[0]);
    expect(zeilen()[2].className).toContain("opacity-50");
    await klicke(knopf("Aktualisieren"));
    expect(document.querySelector("[data-punktliste]")).toBeNull();

    await oeffneEditor();
    expect(zeilen().some((z) => z.className.includes("opacity-50"))).toBe(false);
    expect(zeilen().some((z) => z.className.includes("shadow-primary"))).toBe(false);
    expect(fireEvent.dragOver(liste())).toBe(true);
  });

  it("ein neuer Punkt lässt sich von ganz unten nach oben holen", async () => {
    await zeigeSeite();
    await oeffneEditor();
    await klicke(knopf("+ Punkt hinzufügen"));
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-titel-4") as HTMLInputElement, {
        target: { value: "Postfach vorbereiten" },
      });
      fireEvent.change(document.getElementById("punkt-kategorie-4") as HTMLInputElement, {
        target: { value: "Vor Arbeitsbeginn" },
      });
    });
    for (const n of [5, 4, 3, 2]) await klicke(pfeil(`Punkt ${n} nach oben`));
    await klicke(knopf("Aktualisieren"));
    const rumpf = schreibend()[0].body as { items: Record<string, unknown>[] };
    expect(rumpf.items[0]).toMatchObject({ title: "Postfach vorbereiten", orderIndex: 0 });
    expect("id" in rumpf.items[0]).toBe(false);
    expect("uiKey" in rumpf.items[0]).toBe(false);
    expect(rumpf.items.slice(1).map((p) => p.id)).toEqual(["i-1", "i-2", "i-3", "i-4"]);
  });

  it("„+ Punkt darunter“ fügt an Ort und Stelle ein, übernimmt die Kategorie des Punkts darüber und setzt den Fokus ins neue Titelfeld", async () => {
    await zeigeSeite();
    await oeffneEditor();
    // Punkt 2 bekommt eine eigene Kategorie – sonst liesse sich „des Punkts
    // darueber" nicht von „irgendeines Punkts" unterscheiden.
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-kategorie-1") as HTMLInputElement, {
        target: { value: "Erster Arbeitstag" },
      });
    });
    await klicke(pfeil("Punkt darunter einfügen (unter Punkt 2)"));
    const neuesFeld = document.getElementById("punkt-titel-2") as HTMLInputElement;
    expect(neuesFeld.value).toBe("");
    expect((document.getElementById("punkt-kategorie-2") as HTMLInputElement).value).toBe("Erster Arbeitstag");
    expect(document.activeElement).toBe(neuesFeld);
    await act(async () => {
      fireEvent.change(neuesFeld, { target: { value: "Personalnummer vergeben" } });
    });
    await klicke(knopf("Aktualisieren"));
    const rumpf = schreibend()[0].body as { items: Record<string, unknown>[] };
    expect(rumpf.items.map((p) => p.id ?? "neu")).toEqual(["i-1", "i-2", "neu", "i-3", "i-4"]);
    expect(rumpf.items[2]).toMatchObject({ title: "Personalnummer vergeben", category: "Erster Arbeitstag", orderIndex: 2 });
  });

  it("der Name von „+ Punkt darunter“ enthält den sichtbaren Text (WCAG 2.5.3)", async () => {
    await zeigeSeite();
    await oeffneEditor();
    const knoepfe = Array.from(document.querySelectorAll("button")).filter((b) =>
      (b.textContent ?? "").includes("Punkt darunter"),
    );
    expect(knoepfe).toHaveLength(4);
    for (const b of knoepfe) {
      expect(b.getAttribute("aria-label")).toContain("Punkt darunter");
      expect(b.getAttribute("aria-label")!.startsWith("Punkt darunter")).toBe(true);
    }
  });

  it("nach „Entfernen“ bleibt der Fokus in der Liste – auf „Entfernen“ der nachgerückten Zeile", async () => {
    // Befund der Durchsicht: Mit dem festen Schluessel je Zeile verschwand der
    // fokussierte Knopf, der Fokus fiel auf <body>.
    await zeigeSeite();
    await oeffneEditor();
    const entfernen = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-entfernen]"));
    entfernen()[1].focus();
    await klicke(entfernen()[1]);
    const titelDerZeilen = () => zeilen().map((z) => (z.querySelector("input") as HTMLInputElement).value);
    expect(titelDerZeilen()).toEqual(["Arbeitsvertrag erstellt", "Schlüssel bestellen", "Datenschutz-Unterweisung"]);
    expect(document.activeElement).toBe(entfernen()[1]);
    expect(zeilen()[1].contains(document.activeElement)).toBe(true);

    // Letzte Zeile entfernt: Fokus auf der Zeile davor.
    await klicke(entfernen()[2]);
    expect(document.activeElement).toBe(entfernen()[1]);
  });

  it("eine stehende Meldung „Punkt n: …“ verschwindet, sobald sich die Positionen ändern", async () => {
    await zeigeSeite();
    await oeffneEditor();
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-titel-2") as HTMLInputElement, { target: { value: "" } });
    });
    await klicke(knopf("Aktualisieren"));
    expect(seitentext()).toContain("Punkt 3: Titel und Kategorie sind Pflichtfelder.");
    await klicke(pfeil("Punkt 3 nach oben"));
    expect(seitentext()).not.toContain("Punkt 3: Titel und Kategorie");
  });

  it("der Hinweis sagt, was die Reihenfolge im Vorgang bewirkt", async () => {
    await zeigeSeite();
    await oeffneEditor();
    expect(seitentext()).toContain("Im Vorgang stehen die Punkte in dieser Reihenfolge, zusammengefasst je Kategorie");
  });

  it("bei nur einem Punkt gibt es weder Griff noch Pfeile – aber „+ Punkt darunter“", async () => {
    await zeigeSeite();
    await klicke(knopf("+ Neue Checkliste"));
    // Erst pruefen, dass der Dialog wirklich offen ist – sonst bestuende die
    // Abwesenheit auch ohne ihn.
    expect(document.getElementById("punkt-titel-0")).not.toBeNull();
    expect(document.querySelector("[data-griff]")).toBeNull();
    expect(document.querySelector('button[aria-label="Punkt 1 nach unten"]')).toBeNull();
    expect(document.querySelector("[data-entfernen]")).toBeNull();
    expect(document.querySelector('button[aria-label="Punkt darunter einfügen (unter Punkt 1)"]')).not.toBeNull();
  });
});

// =============================================
// Speichern
// =============================================

describe("Speichern", () => {
  it("schickt EINEN PUT mit allen Punkt-IDs – kein Loeschen und Neuanlegen mehr", async () => {
    await zeigeSeite();
    await oeffneEditor();
    await klicke(knopf("Aktualisieren"));

    const geschrieben = schreibend();
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0].method).toBe("PUT");
    expect(geschrieben[0].url).toBe("/api/checklisten/t-on");
    expect(geschrieben.some((a) => a.method === "DELETE")).toBe(false);

    const rumpf = geschrieben[0].body as { name: string; items: Record<string, unknown>[] };
    expect(rumpf.name).toBe("Standard-Einstellung (TV-L)");
    expect(rumpf.items.map((p) => p.id)).toEqual(["i-1", "i-2", "i-3", "i-4"]);
    expect(rumpf.items[1]).toMatchObject({
      id: "i-2",
      title: "IT-Konto anlegen",
      defaultAssignee: "IT",
      defaultDueDays: -7,
      description: "Microsoft 365",
      orderIndex: 1,
    });
    // Punkt ohne Hinweis geht als null hinaus
    expect(rumpf.items[0].description).toBeNull();

    expect(seitentext()).toContain("Checkliste erfolgreich aktualisiert");
  });

  it("ein neuer Punkt geht ohne id hinaus", async () => {
    await zeigeSeite();
    await oeffneEditor();
    await klicke(knopf("+ Punkt hinzufügen"));
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-titel-4") as HTMLInputElement, {
        target: { value: "Postfach vorbereiten" },
      });
      fireEvent.change(document.getElementById("punkt-kategorie-4") as HTMLInputElement, {
        target: { value: "Vor Arbeitsbeginn" },
      });
    });
    await act(async () => {
      fireEvent.change(auswahl(4), { target: { value: "VERWALTUNG" } });
    });
    await klicke(knopf("Aktualisieren"));

    const rumpf = schreibend()[0].body as { items: Record<string, unknown>[] };
    expect(rumpf.items).toHaveLength(5);
    expect(rumpf.items[4]).toEqual({
      title: "Postfach vorbereiten",
      category: "Vor Arbeitsbeginn",
      orderIndex: 4,
      defaultDueDays: null,
      defaultAssignee: "VERWALTUNG",
      description: null,
    });
  });

  it("ein geleerter vorhandener Punkt wird gemeldet – nichts geht still verloren", async () => {
    // Befund der Durchsicht: Frueher filterte der Editor unvollstaendige
    // Punkte heraus. Der geleerte Punkt fehlte damit in `items`, seine ID
    // stand nicht in `behalten` — und das `deleteMany` der PUT-Route loeschte
    // ihn endgueltig, waehrend die Oberflaeche „erfolgreich" meldete.
    await zeigeSeite();
    await oeffneEditor();
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-kategorie-2") as HTMLInputElement, {
        target: { value: "  " },
      });
    });
    await klicke(knopf("Aktualisieren"));

    expect(schreibend()).toHaveLength(0);
    const text = seitentext();
    expect(text).toContain("Punkt 3: Titel und Kategorie sind Pflichtfelder.");
    expect(text).not.toContain("Checkliste erfolgreich aktualisiert");
    // Das Modal bleibt offen, der Punkt steht noch da.
    expect((document.getElementById("punkt-titel-2") as HTMLInputElement).value).toBe("Schlüssel bestellen");
  });

  it("ein geleerter Titel zaehlt genauso", async () => {
    await zeigeSeite();
    await oeffneEditor();
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-titel-0") as HTMLInputElement, { target: { value: "" } });
    });
    await klicke(knopf("Aktualisieren"));
    expect(schreibend()).toHaveLength(0);
    expect(seitentext()).toContain("Punkt 1: Titel und Kategorie sind Pflichtfelder.");
  });

  it("zeigt den Fehler des Servers statt „erfolgreich“ – und laesst das Modal offen", async () => {
    schreibAntwort = {
      ok: false,
      koerper: { error: "Punkt 3: Die Zuständigkeit „Hausmeister“ ist unbekannt – bitte in der Auswahl zuordnen." },
    };
    await zeigeSeite();
    await oeffneEditor();
    await klicke(knopf("Aktualisieren"));

    const text = seitentext();
    expect(text).toContain("Punkt 3: Die Zuständigkeit „Hausmeister“ ist unbekannt – bitte in der Auswahl zuordnen.");
    expect(text).not.toContain("Checkliste erfolgreich aktualisiert");
    // Das Modal bleibt stehen, damit HR die Zuordnung nachholen kann.
    expect(document.getElementById("punkt-zustaendig-2")).not.toBeNull();
    // Und die Vorlage wurde NICHT neu geladen (es gab nichts Neues).
    expect(aufrufe.filter((a) => a.method === "GET" && a.url === "/api/checklisten")).toHaveLength(1);
  });

  it("beim Anlegen geht ein POST ohne Punkt-IDs hinaus", async () => {
    await zeigeSeite();
    await klicke(knopf("+ Neue Checkliste"));
    await act(async () => {
      fireEvent.change(document.getElementById("punkt-titel-0") as HTMLInputElement, {
        target: { value: "Neuer Punkt" },
      });
      fireEvent.change(document.getElementById("punkt-kategorie-0") as HTMLInputElement, {
        target: { value: "Vor Arbeitsbeginn" },
      });
    });
    const nameFeld = Array.from(document.querySelectorAll("input")).find(
      (i) => i.getAttribute("placeholder") === "z.B. Standard-Einstellung (TV-L)",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameFeld, { target: { value: "Erzieher-Einstellung" } });
    });
    await klicke(knopf("Erstellen"));

    const geschrieben = schreibend();
    expect(geschrieben).toHaveLength(1);
    expect(geschrieben[0].method).toBe("POST");
    expect(geschrieben[0].url).toBe("/api/checklisten");
    const rumpf = geschrieben[0].body as { name: string; items: Record<string, unknown>[] };
    expect(rumpf.name).toBe("Erzieher-Einstellung");
    expect("id" in rumpf.items[0]).toBe(false);
  });
});
