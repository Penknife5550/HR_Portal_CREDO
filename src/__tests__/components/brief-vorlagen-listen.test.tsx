/**
 * @jest-environment jsdom
 */

/**
 * Brief-Vorlagen und Listen-Platzhalter (A4, S33, G19):
 *
 *  1. Erzeugen-Dialog (`brief-vorlagen-content.tsx`): Fuer Listen und ihre
 *     inneren Namen ({ausgaben_je_stelle}, {ausgabe_kennung} …) gibt es KEIN
 *     Eingabefeld – sie fuellt der Resolver aus dem Vorgang, und ein Handwert
 *     ersetzte sie nie. Der Dialog nennt die Listen stattdessen in einem
 *     Hinweis; einfache Platzhalter bleiben Eingabefelder.
 *  2. Variablen-Katalog (`variablen-katalog.tsx`): Listen stehen mit ihren
 *     inneren Namen eingerueckt darunter; der Knopf einer Liste kopiert den
 *     Schleifenkopf `{#…}`.
 *  3. Bearbeiten-Dialog (Review A4d): Das Modul einer System-Vorlage ist
 *     gesperrt, mit Hinweis, und geht nicht mit der Anfrage hinaus; eine
 *     gewoehnliche Vorlage wechselt ihr Modul wie bisher.
 *
 * Umgebung wie die anderen Komponententests (jsdom, ohne jest-dom).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { BriefVorlagenContent } from "@/app/(portal)/brief-vorlagen/brief-vorlagen-content";
import { VariablenKatalog } from "@/components/variablen-katalog";
import { SYSTEM_VORLAGE_MODUL_FEST } from "@/lib/brief-vorlagen-filter";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => <header data-testid="portal-header" />,
}));

const USER = { userId: "u1", email: "hr@credo-gruppe.de", role: "HR_LEITUNG", firstName: "H", lastName: "R" };

const VORLAGE = {
  id: "8d0f2c1e-6a3b-4c5d-9e7f-0a1b2c3d4e5f",
  name: "Übergabeprotokoll Ausstattung",
  description: null,
  modul: "ONBOARDING",
  originalName: "Uebergabeprotokoll-Ausstattung.docx",
  fileSize: 3300,
  platzhalter: [
    "ausgabe_gegenstand",
    "ausgabe_kennung",
    "ausgabe_stelle",
    "ausgabe_uebergeben_am",
    "ausgaben_je_stelle",
    "eintrittsdatum",
    "gegenstaende",
    "mandant",
    "nachname",
    "vorgangsnummer",
    "vorname",
  ],
  organizationId: null,
  isActive: true,
  createdAt: "2026-10-13T10:00:00.000Z",
  updatedAt: "2026-10-13T10:00:00.000Z",
  organization: null,
  createdBy: null,
};

function antwort(daten: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(daten),
    blob: () => Promise.resolve(new Blob(["PK"])),
  } as unknown as Response);
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn((url: string) => {
    if (url.startsWith("/api/brief-vorlagen") && !url.includes("/generate")) return antwort({ data: [VORLAGE] });
    if (url.startsWith("/api/organizations")) return antwort({ data: [] });
    return antwort({ error: "Fehler bei der Erzeugung." }, 500);
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function erzeugenOeffnen() {
  await act(async () => {
    render(<BriefVorlagenContent user={USER} />);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Erzeugen" }));
  });
  return screen.getByRole("dialog");
}

describe("Erzeugen-Dialog: keine Eingabefelder fuer Listen (S33)", () => {
  it("einfache Platzhalter sind Eingabefelder, Listen und innere Namen nicht", async () => {
    const dialog = await erzeugenOeffnen();
    for (const name of ["eintrittsdatum", "mandant", "nachname", "vorgangsnummer", "vorname"]) {
      expect({ name, feld: !!within(dialog).queryByLabelText(name) }).toEqual({ name, feld: true });
    }
    for (const name of [
      "ausgaben_je_stelle",
      "ausgabe_stelle",
      "gegenstaende",
      "ausgabe_gegenstand",
      "ausgabe_kennung",
      "ausgabe_uebergeben_am",
    ]) {
      expect({ name, feld: !!within(dialog).queryByLabelText(name) }).toEqual({ name, feld: false });
    }
    expect(dialog.querySelectorAll("input:not([type])").length).toBe(5 + 1); // + Bezug / Ref-ID
  });

  it("nennt die Listen statt dessen als Hinweis „Listen aus dem Vorgang“", async () => {
    const dialog = await erzeugenOeffnen();
    expect(dialog.textContent).toContain("Listen aus dem Vorgang");
    expect(dialog.textContent).toContain("Ausgaben je ausgebender Stelle");
    expect(dialog.textContent).toContain("lassen sich hier nicht von Hand eintragen");
  });

  it("schickt nur Handwerte einfacher Platzhalter", async () => {
    const dialog = await erzeugenOeffnen();
    fireEvent.change(within(dialog).getByLabelText("vorname"), { target: { value: "Erika-Maria" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /Erzeugen & Herunterladen/ }));
    });
    const aufruf = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/generate"));
    expect(aufruf).toBeDefined();
    expect(JSON.parse(aufruf![1].body).values).toEqual({ vorname: "Erika-Maria" });
  });

  it("eine Vorlage ohne Liste zeigt keinen Listen-Hinweis", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/brief-vorlagen")) {
        return antwort({ data: [{ ...VORLAGE, name: "Brief", platzhalter: ["vorname"] }] });
      }
      return antwort({ data: [] });
    });
    const dialog = await erzeugenOeffnen();
    expect(dialog.textContent).not.toContain("Listen aus dem Vorgang");
    expect(within(dialog).queryByLabelText("vorname")).not.toBeNull();
  });
});

describe("Variablen-Katalog: Listen eingerueckt (S33)", () => {
  it("Onboarding: {#ausgaben_je_stelle} mit seinen Feldern und der Unterliste darunter", () => {
    render(<VariablenKatalog modul="ONBOARDING" />);
    const felder = screen.getByRole("group", { name: "Felder der Liste ausgaben_je_stelle" });
    expect(felder.textContent).toContain("{ausgabe_stelle}");
    expect(felder.textContent).toContain("{#gegenstaende}");
    const unter = within(felder).getByRole("group", { name: "Felder der Liste gegenstaende" });
    for (const name of ["{ausgabe_gegenstand}", "{ausgabe_kennung}", "{ausgabe_uebergeben_am}"]) {
      expect(unter.textContent).toContain(name);
    }
    // Der Kopf der Liste steht als Schleife da, mit Ende und Leerblock.
    expect(document.body.textContent).toContain("{#ausgaben_je_stelle}");
    expect(document.body.textContent).toContain("{^ausgaben_je_stelle}…{/ausgaben_je_stelle}");
    // Die einfachen Ausgaben-Platzhalter stehen als gewoehnliche Knoepfe da.
    expect(document.body.textContent).toContain("{ausgaben_liste}");
    expect(document.body.textContent).toContain("{ausgaben_anzahl}");
  });

  it("Offboarding: {#rueckgaben_je_stelle} – und keine Ausgaben des Onboardings", () => {
    render(<VariablenKatalog modul="OFFBOARDING" />);
    const unter = screen.getByRole("group", { name: "Felder der Liste gegenstaende" });
    expect(unter.textContent).toContain("{rueckgabe_zustand}");
    expect(document.body.textContent).not.toContain("ausgaben_je_stelle");
  });

  it("der Knopf einer Liste kopiert den Schleifenkopf, ein inneres Feld seinen Namen", async () => {
    const schreiben = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: schreiben } });
    render(<VariablenKatalog modul="ONBOARDING" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\{#ausgaben_je_stelle\}/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /\{ausgabe_kennung\}/ }));
    });
    expect(schreiben.mock.calls.map((c) => c[0])).toEqual(["{#ausgaben_je_stelle}", "{ausgabe_kennung}"]);
  });
});

describe("Bearbeiten: das Modul einer System-Vorlage ist fest (Review A4d, G19)", () => {
  async function bearbeitenOeffnen(vorlage: Record<string, unknown>) {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return antwort({ data: vorlage });
      if (url.startsWith("/api/brief-vorlagen")) return antwort({ data: [vorlage] });
      return antwort({ data: [] });
    });
    await act(async () => {
      render(<BriefVorlagenContent user={USER} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    });
    return screen.getByRole("dialog");
  }

  function patchBody(): Record<string, unknown> {
    const aufruf = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(aufruf).toBeDefined();
    return JSON.parse(aufruf![1].body);
  }

  it("System-Vorlage: Feld gesperrt mit Hinweis, das Modul geht nicht mit", async () => {
    const dialog = await bearbeitenOeffnen({ ...VORLAGE, isSystem: true });
    const modul = within(dialog).getByLabelText("Modul") as HTMLSelectElement;
    expect(modul.disabled).toBe(true);
    const hinweis = document.getElementById(modul.getAttribute("aria-describedby")!);
    expect(hinweis?.textContent).toBe(SYSTEM_VORLAGE_MODUL_FEST);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    });
    const body = patchBody();
    expect(body).not.toHaveProperty("modul");
    expect(body.name).toBe(VORLAGE.name);
  });

  it("gewoehnliche Vorlage: Modul waehlbar und gespeichert wie bisher", async () => {
    const dialog = await bearbeitenOeffnen({ ...VORLAGE, name: "Brief", isSystem: false });
    const modul = within(dialog).getByLabelText("Modul") as HTMLSelectElement;
    expect(modul.disabled).toBe(false);
    expect(dialog.textContent).not.toContain(SYSTEM_VORLAGE_MODUL_FEST);
    fireEvent.change(modul, { target: { value: "ALLGEMEIN" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));
    });
    expect(patchBody().modul).toBe("ALLGEMEIN");
  });
});
