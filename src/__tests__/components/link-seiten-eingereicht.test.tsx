/**
 * @jest-environment jsdom
 */

/**
 * Fragebogen- und Modalitaeten-Seite: Wann erscheint die Karte „bereits
 * eingereicht" statt des Formulars?
 *
 * Das ist die Stelle, an der der gemeldete Fehler fuer die Nutzer sichtbar
 * wurde: Die Fuehrungskraft sendete die Modalitaeten zuerst ab, der gemeinsame
 * Status stand auf SUPERVISOR_SUBMITTED, und Anna (Fragebogen bei Schritt 4)
 * sah „Fragebogen bereits eingereicht" — der Link war fuer sie tot.
 *
 * Seit Paket 1 entscheidet jede Seite an ihrer EIGENEN Spur, die die GET-Route
 * mitliefert (`mitarbeiterAbgesendet` bzw. `vorgesetzteAbgesendet`). Die
 * Routentests belegen das Feld, die reinen Funktionen die Regel — erst dieser
 * Test haelt fest, dass die Seite das Feld auch auswertet und nicht wieder auf
 * den Status schaut. Beide Felder sind im Seitentyp optional; tsc merkt es also
 * nicht, wenn eines umbenannt wird oder wegfaellt.
 *
 * Umgebung wie in modalitaeten-stellenbezeichnung.test.tsx: jsdom im Docblock,
 * ohne @testing-library/jest-dom.
 */
import { act, render, screen } from "@testing-library/react";
import FragebogenPage from "@/app/fragebogen/[token]/page";
import ModalitaetenPage from "@/app/modalitaeten/[token]/page";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "link-token-1234567890" }),
}));

// Das Logo traegt zu keiner Zusicherung bei.
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));

// Das Formular selbst ist hier nicht Gegenstand — nur, OB die Seite es zeigt.
// Die echte FragebogenForm braucht Schrittkonfiguration, Vorlagen und mehr.
jest.mock("@/app/fragebogen/[token]/fragebogen-form", () => ({
  FragebogenForm: () => <div>Formular des Personalfragebogens</div>,
}));

type Rumpf = Record<string, unknown>;

let antwort: Rumpf = {};

beforeEach(() => {
  antwort = {};
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => antwort,
  })) as unknown as typeof fetch;
  window.scrollTo = jest.fn();
});

// =============================================
// Personalfragebogen (/fragebogen/[token])
// =============================================

function fragebogenAntwort(teil: Rumpf): Rumpf {
  return {
    onboardingId: "ob1",
    email: "anna.beispiel@example.org",
    organization: { name: "FES Gymnasium", mandantNumber: "10", type: "SCHULE" },
    questionnaireType: "STANDARD",
    personalData: { currentStep: 4, isComplete: false },
    ...teil,
  };
}

async function zeigeFragebogen(teil: Rumpf) {
  antwort = fragebogenAntwort(teil);
  render(<FragebogenPage />);
  await act(async () => {});
}

describe("Fragebogen-Seite", () => {
  it("zeigt das Formular, obwohl die Führungskraft schon abgesendet hat (der gemeldete Fall)", async () => {
    // Altstand vor der Heil-Migration: Status SUPERVISOR_SUBMITTED, aber die
    // Person hat nichts abgesendet.
    await zeigeFragebogen({ status: "SUPERVISOR_SUBMITTED", mitarbeiterAbgesendet: false });

    expect(screen.getByText("Formular des Personalfragebogens")).toBeTruthy();
    expect(screen.queryByText("Fragebogen bereits eingereicht")).toBeNull();
  });

  it("zeigt das Formular auch bei Status SUPERVISOR_PENDING ohne eigene Abgabe", async () => {
    await zeigeFragebogen({ status: "SUPERVISOR_PENDING", mitarbeiterAbgesendet: false });

    expect(screen.getByText("Formular des Personalfragebogens")).toBeTruthy();
  });

  it("zeigt die Karte, wenn die Person selbst abgesendet hat — unabhängig vom Status", async () => {
    // Nach der eigenen Abgabe ist der Link schreibgesperrt (auth.ts). Zeigte
    // die Seite hier das Formular, scheiterte jedes Speichern mit 410.
    await zeigeFragebogen({ status: "SUPERVISOR_PENDING", mitarbeiterAbgesendet: true });

    expect(screen.getByText("Fragebogen bereits eingereicht")).toBeTruthy();
    expect(screen.queryByText("Formular des Personalfragebogens")).toBeNull();
  });

  it("zeigt die Karte bei einem geprüften Vorgang", async () => {
    await zeigeFragebogen({ status: "REVIEWED", mitarbeiterAbgesendet: false });

    expect(screen.getByText("Fragebogen bereits eingereicht")).toBeTruthy();
  });
});

// =============================================
// Einstellungsmodalitaeten (/modalitaeten/[token])
// =============================================

function modalitaetenAntwort(teil: Rumpf): Rumpf {
  return {
    onboardingId: "ob1",
    email: "anna.beispiel@example.org",
    employeeName: "Anna Beispiel",
    organization: { name: "FES Gymnasium", mandantNumber: "10", type: "SCHULE" },
    organizations: [],
    supervisorData: null,
    ...teil,
  };
}

async function zeigeModalitaeten(teil: Rumpf) {
  antwort = modalitaetenAntwort(teil);
  render(<ModalitaetenPage />);
  await act(async () => {});
}

describe("Modalitäten-Seite", () => {
  it("zeigt „Vielen Dank!“, wenn die Führungskraft abgesendet hat, der Fragebogen aber noch offen ist", async () => {
    // Die Fuehrungskraft war schneller: Der Status folgt der Fragebogen-Spur
    // und bleibt IN_PROGRESS. Am Status gemessen, saehe sie nach dem
    // Neuladen wieder das Formular.
    await zeigeModalitaeten({ status: "IN_PROGRESS", vorgesetzteAbgesendet: true });

    expect(screen.getByText("Vielen Dank!")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();
  });

  it("zeigt das Formular, solange die Führungskraft nicht abgesendet hat — auch nach dem Fragebogen", async () => {
    await zeigeModalitaeten({ status: "SUPERVISOR_PENDING", vorgesetzteAbgesendet: false });

    expect(screen.queryByText("Vielen Dank!")).toBeNull();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeTruthy();
  });
});
