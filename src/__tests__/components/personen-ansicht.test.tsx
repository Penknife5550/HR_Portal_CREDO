/**
 * @jest-environment jsdom
 */

/**
 * Leseansicht „Personen" (Self-Service S0, E8):
 * src/app/(portal)/personen/personen-content.tsx mit
 * src/components/personen/zu-pruefen.tsx.
 *
 * Gerendert wird die echte Client-Komponente; nur Netz, Router und next/image
 * sind ersetzt. Belegt wird:
 *
 *  1. Lade- und Leerzustand, „Noch kein Abgleich gelaufen.", „Nichts zu prüfen."
 *  2. Rote Hinweiszeile, die drei Gruppen von „Zu prüfen" und die Zeilen der
 *     Liste: Anstellungen „läuft / läuft bis / beendet am" (das Vertragsende
 *     ist der letzte Arbeitstag) mit Vertragsschluessel, laufende zuerst,
 *     Bestandsanstellungen einer DokuBit-Person abgesetzt; Quelle, Blättern.
 *  3. Gelbe Hinweiszeile.
 *  4. Fehler der Liste als Banner, mit „Erneut laden".
 *  5. Leerzustand (D3): „Noch keine Personen" nur ohne jede Person, sonst
 *     „Keine Treffer"; der Suchbegriff geht an die Route.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/personen" }));
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

import { PersonenContent } from "@/app/(portal)/personen/personen-content";

const USER = { userId: "u", email: "hr@fes-credo.de", role: "HR_LEITUNG", firstName: "Hanna", lastName: "Haupt" };

function antwort(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

/** Anstellung wie GET /api/personalstamm/personen; `schluessel` null = Bestandsanstellung. */
function vertrag(
  id: string,
  stand: { isActive: boolean; endDate: string | null },
  mandant: string,
  schluessel: [string, string, string] | null,
) {
  return {
    id,
    ...stand,
    mandantNumber: schluessel?.[0] ?? null,
    abrechnungskreis: schluessel?.[1] ?? null,
    personalNumber: schluessel?.[2] ?? null,
    organization: { name: mandant },
  };
}

let pruefung: unknown;
let liste: unknown;
let listeOk = true;

beforeEach(() => {
  jest.useRealTimers();
  listeOk = true;
  pruefung = {
    nichtGeliefert: { anzahl: 0, personen: [] },
    meldungen: [],
    abgewieseneAnmeldungen: [],
    letzterLauf: null,
    hinweis: null,
  };
  liste = { data: [], total: 0, page: 1, limit: 25, bestandLeer: true };
  global.fetch = jest.fn((url: string) => {
    if (url.startsWith("/api/personalstamm/pruefen")) return antwort({ data: pruefung });
    if (url.startsWith("/api/personalstamm/personen")) return antwort(liste, listeOk);
    return antwort({ data: {} });
  }) as unknown as typeof fetch;
});

test("Laden, Leerzustand, kein Abgleich, nichts zu prüfen", async () => {
  render(<PersonenContent user={USER} />);
  expect(screen.getByText("Lade Personen…")).toBeInTheDocument();
  await screen.findByText("Noch keine Personen");
  expect(screen.getByText("Der erste Abgleich aus DokuBit legt sie an.")).toBeInTheDocument();
  expect(screen.getByText("Noch kein Abgleich gelaufen.")).toBeInTheDocument();
  expect(screen.getByText("Nichts zu prüfen.")).toBeInTheDocument();
  expect(document.querySelector("[data-hinweis]")).toBeNull();
});

test("rote Hinweiszeile, Gruppen von „Zu prüfen“ und Zeilen der Liste", async () => {
  // 17.10.2026 in Berlin: An diesem Tag laeuft ein Vertrag mit Ende 17.10. noch.
  jest.useFakeTimers({ now: new Date("2026-10-17T10:00:00Z"), doNotFake: ["queueMicrotask", "nextTick"] });
  pruefung = {
    nichtGeliefert: { anzahl: 51, personen: [{ id: "e1", name: "Anna Alt", lastSyncAt: "2026-10-15T02:30:00.000Z" }] },
    meldungen: [
      {
        schluessel: "742|01|1001",
        code: "MAIL_FEHLT",
        label: "Vertrag ohne dienstliche Adresse",
        anzahl: 2,
        zuletzt: "2026-10-17T02:30:00.000Z",
      },
      {
        schluessel: "zeile:5",
        code: "FORMATFEHLER",
        label: "Zeile unvollständig oder im falschen Format",
        anzahl: 1,
        zuletzt: "2026-10-17T02:30:00.000Z",
      },
      {
        schluessel: "person",
        code: "INTERNER_FEHLER",
        label: "Interner Fehler bei dieser Zeile",
        anzahl: 1,
        zuletzt: "2026-10-17T02:30:00.000Z",
      },
    ],
    abgewieseneAnmeldungen: [{ email: null, anzahl: 1, zuletzt: "2026-10-16T08:00:00.000Z" }],
    letzterLauf: "2026-10-17T02:30:00.000Z",
    hinweis: "rot",
  };
  liste = {
    data: [
      {
        id: "p1",
        firstName: "Bernd",
        lastName: "Beispiel",
        email: "b.beispiel@fes-minden.de",
        isActive: true,
        importSource: "DOKUBIT",
        lastSyncAt: "2026-10-17T02:30:00.000Z",
        // Wie die Route sie liefert: nach Beginn absteigend, also unsortiert nach Laufen.
        employments: [
          vertrag("a3", { isActive: false, endDate: "2026-10-16T00:00:00.000Z" }, "CFH", ["721", "01", "7"]),
          vertrag("a0", { isActive: true, endDate: null }, "Gymnasium", null),
          vertrag("a1", { isActive: true, endDate: null }, "FES Minden", ["742", "01", "1001"]),
          vertrag("a2", { isActive: true, endDate: "2026-10-17T00:00:00.000Z" }, "Kita", ["719", "02", "2001"]),
        ],
      },
    ],
    total: 30,
    page: 1,
    limit: 25,
    bestandLeer: false,
  };

  render(<PersonenContent user={USER} />);
  await waitFor(() => expect(screen.getByText("Beispiel, Bernd")).toBeInTheDocument());
  await waitFor(() => expect(document.querySelector('[data-hinweis="rot"]')).not.toBeNull());

  expect(document.querySelector('[data-hinweis="rot"]')).toHaveTextContent(
    "51 aktive Personen wurden seit mehr als 26 Stunden nicht aus DokuBit geliefert. Läuft der Abgleich?",
  );
  expect(document.querySelector('[data-hinweis="gelb"]')).toBeNull();
  expect(screen.getByText(/^Letzter Abgleich: /)).toBeInTheDocument();

  // „Zu prüfen": drei Gruppen, der Rest der 51 als „weitere"
  expect(screen.getByText("Seit mehr als 26 Stunden nicht geliefert (51)")).toBeInTheDocument();
  expect(screen.getByText("Anna Alt")).toBeInTheDocument();
  expect(screen.getByText("… und 50 weitere")).toBeInTheDocument();
  expect(screen.getByText("Meldungen aus dem Abgleich (3)")).toBeInTheDocument();
  expect(screen.getByText("Vertrag ohne dienstliche Adresse")).toBeInTheDocument();
  expect(screen.getByText("Mandant 742 · Abrechnungskreis 01 · MANR 1001")).toBeInTheDocument();
  expect(screen.getByText("Zeile 6 im Stapel, ohne lesbaren Schlüssel")).toBeInTheDocument();
  expect(screen.getByText("Aktiv-Status einer Person am Ende des Stapels")).toBeInTheDocument();
  expect(screen.getByText("Abgewiesene Anmeldungen (1)")).toBeInTheDocument();
  expect(screen.getByText("ohne Adresse")).toBeInTheDocument();

  // Liste: laufende verwaltete Vertraege zuerst, dann beendete, die
  // Bestandsanstellung ohne Schluessel zuletzt und als solche benannt
  expect(screen.getByText("b.beispiel@fes-minden.de")).toBeInTheDocument();
  const zellen = screen.getAllByRole("listitem").filter((li) => li.closest("table"));
  expect(zellen.map((li) => li.textContent)).toEqual([
    "FES Minden · läuft742 · AK 01 · MANR 1001",
    "Kita · läuft bis 17.10.2026719 · AK 02 · MANR 2001",
    "CFH · beendet am 16.10.2026721 · AK 01 · MANR 7",
    "Gymnasium · läuftBestand, zählt nicht für den Status",
  ]);
  expect(zellen[0]).toHaveClass("text-foreground");
  expect(zellen[2]).toHaveClass("text-muted-foreground");
  expect(zellen[3]).toHaveClass("text-muted-foreground");
  expect(screen.getByText("aktiv")).toBeInTheDocument();
  expect(screen.getByText("DokuBit")).toBeInTheDocument();
  expect(screen.getByText("30 Personen")).toHaveAttribute("role", "status");
  expect(screen.getByText("Seite 1 von 2")).toBeInTheDocument();
});

test("gelbe Hinweiszeile mit der Zahl der Einträge", async () => {
  pruefung = {
    nichtGeliefert: { anzahl: 0, personen: [] },
    meldungen: [
      { schluessel: "742|01|1001", code: "MAIL_FEHLT", label: "Neuer Vertrag ohne dienstliche Adresse", anzahl: 1, zuletzt: "2026-10-17T02:30:00.000Z" },
    ],
    abgewieseneAnmeldungen: [{ email: "x@fes-minden.de", anzahl: 1, zuletzt: "2026-10-16T08:00:00.000Z" }],
    letzterLauf: "2026-10-17T02:30:00.000Z",
    hinweis: "gelb",
  };
  render(<PersonenContent user={USER} />);
  await waitFor(() => expect(document.querySelector('[data-hinweis="gelb"]')).not.toBeNull());
  expect(document.querySelector('[data-hinweis="gelb"]')).toHaveTextContent("2 Einträge zu prüfen.");
  expect(document.querySelector('[data-hinweis="rot"]')).toBeNull();
});

test("Fehler der Liste als Banner, „Erneut laden“ fragt noch einmal", async () => {
  listeOk = false;
  render(<PersonenContent user={USER} />);
  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("Die Personen konnten nicht geladen werden.");
  expect(screen.queryByText("Noch keine Personen")).toBeNull();

  listeOk = true;
  fireEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
  await screen.findByText("Noch keine Personen");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("Leerzustand: ohne jede Person „Noch keine Personen“, sonst „Keine Treffer“", async () => {
  liste = { data: [], total: 0, page: 1, limit: 25, bestandLeer: false };
  render(<PersonenContent user={USER} />);
  await screen.findByText("Keine Treffer für diese Suche oder diesen Filter.");
  expect(screen.queryByText("Noch keine Personen")).toBeNull();
});

test("Suche ohne Treffer: eigener Text, der Begriff geht an die Route", async () => {
  liste = { data: [], total: 0, page: 1, limit: 25, bestandLeer: false };
  render(<PersonenContent user={USER} />);
  await screen.findByText("Keine Treffer für diese Suche oder diesen Filter.");
  fireEvent.change(screen.getByLabelText("Personen suchen"), { target: { value: "xyz" } });
  await waitFor(
    () => {
      const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.startsWith("/api/personalstamm/personen?") && u.includes("search=xyz"))).toBe(true);
    },
    { timeout: 2000 },
  );
  await screen.findByText("Keine Treffer für diese Suche oder diesen Filter.");
});
