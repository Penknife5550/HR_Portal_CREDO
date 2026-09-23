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
import { act, fireEvent, render } from "@testing-library/react";
import { ChecklistenContent } from "@/app/(portal)/checklisten/checklisten-content";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Der Kopf der Seite zieht Router, next/image und die Sitzungswarnung mit; der
// Editor selbst braucht nichts davon.
jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => null,
}));
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
