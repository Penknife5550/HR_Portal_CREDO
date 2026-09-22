/**
 * @jest-environment jsdom
 */

/**
 * Einstellungen → Abteilungen, die Oberflaeche (Paket 1b, M8).
 *
 * Vorher las die Seite `dept.name`/`dept.key` und schickte `{name, key}` —
 * der Server kennt `departmentName`/`departmentKey`. Folge: leere Spalte
 * „Abteilung", jedes Anlegen mit rotem Fehler, Meldungen mit „undefined".
 * Hier belegt, was sich nur in der React-Verdrahtung zeigt: Feldnamen im
 * Rumpf, echte Namen in den Meldungen, die Auswahl ohne HR/MITARBEITER/
 * VORGESETZTER (mit VERWALTUNG), „Verwendet in" samt Warnungen, Bearbeiten
 * in der Zeile.
 *
 * Umgebung wie in neuer-vorgang-modal.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { DepartmentsTab } from "@/app/(portal)/einstellungen/einstellungen-content";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Die Datei zieht ueber PortalHeader den App-Router mit; der Tab selbst braucht ihn nicht.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/einstellungen",
}));

// =============================================
// Fixtures
// =============================================

const ORG = { id: "org-gym", name: "FES Gymnasium" };

function abteilung(teil: Record<string, unknown>) {
  return {
    id: "d-it",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@credo.de",
    organizationId: null,
    organization: null,
    isActive: true,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    label: "IT-Abteilung",
    reserviert: false,
    ...teil,
  };
}

const LISTE = {
  data: [
    abteilung({}),
    abteilung({ id: "d-buch", departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", email: "buch@credo.de", label: "Buchhaltung" }),
    abteilung({
      id: "d-sek",
      departmentKey: "VERWALTUNG",
      departmentName: "Sekretariat GYM",
      email: "sek@fes.de",
      organizationId: ORG.id,
      organization: ORG,
      label: "Verwaltung / Sekretariat",
    }),
    abteilung({
      id: "d-alt",
      departmentKey: "VORGESETZTER",
      departmentName: "Vorgesetzter",
      email: "chef@credo.de",
      label: "Führungskraft",
      reserviert: true,
    }),
  ],
  verwendung: {
    IT: { aufgaben: 5, vorlagen: 3 },
    VERWALTUNG: { aufgaben: 1, vorlagen: 1 },
    VORGESETZTER: { aufgaben: 4, vorlagen: 2 },
  },
  fehlendeAdressen: [{ vorlage: "Offboarding: Standard", departmentKey: "DSB", label: "Datenschutzbeauftragte/r" }],
};

// =============================================
// Netz
// =============================================

interface Aufruf {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let aufrufe: Aufruf[] = [];
/** Antwort auf die naechste schreibende Anfrage (POST/PATCH/DELETE). */
let schreibAntwort: { ok: boolean; koerper: unknown } = { ok: true, koerper: {} };
let listeOk = true;

function json(ok: boolean, koerper: unknown) {
  return Promise.resolve({ ok, json: async () => koerper } as Response);
}

beforeEach(() => {
  aufrufe = [];
  listeOk = true;
  schreibAntwort = { ok: true, koerper: {} };
  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    aufrufe.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url) === "/api/organizations") return json(true, { data: [ORG] });
    if (method === "GET") return listeOk ? json(true, LISTE) : json(false, { error: "Interner Serverfehler" });
    return json(schreibAntwort.ok, schreibAntwort.koerper);
  }) as unknown as typeof fetch;
  window.confirm = jest.fn(() => true);
});

async function zeigeTab() {
  await act(async () => {
    render(<DepartmentsTab />);
  });
}

const seitentext = () => document.body.textContent ?? "";
const schreibend = () => aufrufe.filter((a) => a.method !== "GET");
const zeile = (key: string) => document.querySelector(`tr[data-abteilung="${key}"]`) as HTMLTableRowElement;

async function klicke(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

function knopfIn(element: Element, text: string): HTMLButtonElement {
  const knopf = Array.from(element.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!knopf) throw new Error(`Knopf „${text}" fehlt`);
  return knopf as HTMLButtonElement;
}

// =============================================
// Anzeige
// =============================================

describe("Tabelle", () => {
  it("zeigt Name, Schluessel, Einrichtung bzw. „Zentral“ — nicht mehr leer", async () => {
    await zeigeTab();
    const it = zeile("IT");
    expect(it.textContent).toContain("IT-Abteilung");
    expect(it.textContent).toContain("it@credo.de");
    expect(it.textContent).toContain("Zentral");
    expect(zeile("VERWALTUNG").textContent).toContain("FES Gymnasium");
    const kopf = Array.from(document.querySelectorAll("th")).map((th) => th.textContent);
    expect(kopf).toEqual(["Abteilung", "Schlüssel", "E-Mail", "Gilt für", "Verwendet in", "Status", "Aktionen"]);
  });

  it("„Verwendet in“ mit Einzahl/Mehrzahl, gelbe Warnung ohne Verwendung", async () => {
    await zeigeTab();
    expect(zeile("IT").textContent).toContain("5 Aufgaben in 3 Vorlagen");
    expect(zeile("VERWALTUNG").textContent).toContain("1 Aufgabe in 1 Vorlage");
    expect(zeile("BUCHHALTUNG").textContent).toContain("In keiner Checklisten-Vorlage verwendet");
  });

  it("Altzeile VORGESETZTER: Hinweis statt Verwendung", async () => {
    await zeigeTab();
    const alt = zeile("VORGESETZTER");
    expect(alt.textContent).toContain(
      "Wird nicht mehr verwendet – Aufgaben für Vorgesetzte gehen an die Führungskraft des Vorgangs.",
    );
    expect(alt.textContent).not.toContain("4 Aufgaben");
  });

  it("Warnbanner je Vorlage ohne aktive Adresse", async () => {
    await zeigeTab();
    expect(seitentext()).toContain(
      "Die Vorlage „Offboarding: Standard“ nutzt „Datenschutzbeauftragte/r“. Dafür ist keine aktive Adresse hinterlegt. Diese Aufgaben können nicht per Link verschickt werden.",
    );
  });

  it("Ladefehler wird genannt, nicht als leere Liste getarnt", async () => {
    listeOk = false;
    await zeigeTab();
    expect(seitentext()).toContain("Abteilungen konnten nicht geladen werden");
    expect(seitentext()).not.toContain("Keine Abteilungen konfiguriert.");
  });
});

// =============================================
// Anlegen
// =============================================

describe("Neue Abteilung", () => {
  async function oeffneFormular() {
    await zeigeTab();
    await klicke(screen.getByText("+ Abteilung hinzufügen"));
  }

  it("Auswahl: Link-Abteilungen mit VERWALTUNG, ohne HR/MITARBEITER/VORGESETZTER", async () => {
    await oeffneFormular();
    const auswahl = screen.getByLabelText(/^Abteilung/) as HTMLSelectElement;
    const werte = Array.from(auswahl.options).map((o) => o.value);
    expect(werte).toEqual(["", "IT", "VERWALTUNG", "FACILITY", "BUCHHALTUNG", "DSB", "__eigener__"]);
    expect(Array.from(auswahl.options).map((o) => o.textContent)).toContain("Verwaltung / Sekretariat (VERWALTUNG)");
    expect(seitentext()).toContain(
      "Personalabteilung und Mitarbeitende arbeiten im Portal und bekommen keinen Link. Aufgaben für Vorgesetzte gehen an die im Vorgang hinterlegte Führungskraft.",
    );
  });

  it("belegt den Anzeigenamen vor und schickt departmentKey/departmentName (zentral = null)", async () => {
    await oeffneFormular();
    schreibAntwort = {
      ok: true,
      koerper: { data: abteilung({ id: "neu", departmentKey: "VERWALTUNG", departmentName: "Verwaltung / Sekretariat" }) },
    };
    fireEvent.change(screen.getByLabelText(/^Abteilung/), { target: { value: "VERWALTUNG" } });
    expect((screen.getByLabelText(/^Anzeigename/) as HTMLInputElement).value).toBe("Verwaltung / Sekretariat");
    fireEvent.change(screen.getByLabelText(/^E-Mail-Adresse/), { target: { value: "sek@credo.de" } });
    await klicke(screen.getByText("Abteilung anlegen"));

    expect(schreibend()).toEqual([
      {
        url: "/api/settings/departments",
        method: "POST",
        body: {
          departmentKey: "VERWALTUNG",
          departmentName: "Verwaltung / Sekretariat",
          email: "sek@credo.de",
          organizationId: null,
        },
      },
    ]);
    expect(seitentext()).toContain("Abteilung „Verwaltung / Sekretariat“ angelegt");
    expect(seitentext()).not.toContain("undefined");
  });

  it("eigener Schluessel: Grossbuchstaben, Einrichtung gewaehlt, selbst getippter Name bleibt", async () => {
    await oeffneFormular();
    schreibAntwort = { ok: true, koerper: { data: abteilung({ departmentName: "Empfang" }) } };
    fireEvent.change(screen.getByLabelText(/^Anzeigename/), { target: { value: "Empfang" } });
    fireEvent.change(screen.getByLabelText(/^Abteilung/), { target: { value: "__eigener__" } });
    fireEvent.change(screen.getByLabelText(/^Eigener Schlüssel/), { target: { value: "empfang-1" } });
    expect((screen.getByLabelText(/^Eigener Schlüssel/) as HTMLInputElement).value).toBe("EMPFANG1");
    expect((screen.getByLabelText(/^Anzeigename/) as HTMLInputElement).value).toBe("Empfang");
    fireEvent.change(screen.getByLabelText(/^E-Mail-Adresse/), { target: { value: "empfang@fes.de" } });
    fireEvent.change(screen.getByLabelText(/^Gilt für/), { target: { value: ORG.id } });
    await klicke(screen.getByText("Abteilung anlegen"));
    expect(schreibend()[0].body).toEqual({
      departmentKey: "EMPFANG1",
      departmentName: "Empfang",
      email: "empfang@fes.de",
      organizationId: ORG.id,
    });
  });

  it("zeigt die Meldung der API (409)", async () => {
    await oeffneFormular();
    schreibAntwort = { ok: false, koerper: { error: "Eine zentrale Abteilung „IT“ gibt es schon." } };
    fireEvent.change(screen.getByLabelText(/^Abteilung/), { target: { value: "IT" } });
    fireEvent.change(screen.getByLabelText(/^E-Mail-Adresse/), { target: { value: "it2@credo.de" } });
    await klicke(screen.getByText("Abteilung anlegen"));
    expect(seitentext()).toContain("Eine zentrale Abteilung „IT“ gibt es schon.");
  });
});

// =============================================
// Zeilenaktionen
// =============================================

describe("Zeilenaktionen", () => {
  it("Bearbeiten: Anzeigename und E-Mail in der Zeile, Meldung mit dem neuen Namen", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("IT"), "Bearbeiten"));
    fireEvent.change(screen.getByLabelText("Anzeigename"), { target: { value: "IT-Support FES" } });
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "support@fes.de" } });
    schreibAntwort = { ok: true, koerper: { data: abteilung({ departmentName: "IT-Support FES" }) } };
    await klicke(knopfIn(zeile("IT"), "Speichern"));
    expect(schreibend()).toEqual([
      {
        url: "/api/settings/departments/d-it",
        method: "PATCH",
        body: { departmentName: "IT-Support FES", email: "support@fes.de" },
      },
    ]);
    expect(seitentext()).toContain("Änderungen an „IT-Support FES“ gespeichert");
  });

  it("Deaktivieren nennt den Namen", async () => {
    await zeigeTab();
    await klicke(knopfIn(zeile("IT"), "Deaktivieren"));
    expect(schreibend()[0]).toEqual({ url: "/api/settings/departments/d-it", method: "PATCH", body: { isActive: false } });
    expect(seitentext()).toContain("„IT-Abteilung“ deaktiviert");
  });

  it("Loeschen fragt mit Name und Einrichtung nach", async () => {
    await zeigeTab();
    schreibAntwort = { ok: true, koerper: { success: true } };
    await klicke(knopfIn(zeile("VERWALTUNG"), "Löschen"));
    expect(window.confirm).toHaveBeenCalledWith(
      "Abteilung „Sekretariat GYM“ (FES Gymnasium) wirklich löschen? Bereits verschickte Links bleiben gültig, Erinnerungen gehen aber nicht mehr an diese Adresse.",
    );
    expect(schreibend()[0]).toMatchObject({ url: "/api/settings/departments/d-sek", method: "DELETE" });
    expect(seitentext()).toContain("„Sekretariat GYM“ gelöscht");
  });

  it("Loeschen abgebrochen: keine Anfrage", async () => {
    await zeigeTab();
    (window.confirm as jest.Mock).mockReturnValue(false);
    await klicke(knopfIn(zeile("IT"), "Löschen"));
    expect(schreibend()).toEqual([]);
  });
});
