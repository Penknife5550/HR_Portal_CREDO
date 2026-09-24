/**
 * @jest-environment jsdom
 */

/**
 * Verdrahtungsnachweis: Der Tab „Übersicht" eines Onboardings zeigt BEIDE
 * Spuren nebeneinander (Paket 2).
 *
 * Die Regeln selbst stehen rein in `dashboard/[id]/uebersicht-schritte.ts` und
 * werden dort geprueft (`onboarding-uebersicht-schritte.test.ts`). Hier geht es
 * nur um die Frage, ob `TabOverview` sie tatsaechlich an den Stepper reicht —
 * und ob die Karte „Status-Übersicht" aus derselben Quelle gespeist wird.
 *
 * Umgebung wie in `abteilungen-karte.test.tsx`: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import { TabOverview } from "@/app/(portal)/dashboard/[id]/detail-content";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Ohne App-Router-Kontext: ein schlichter Anker genuegt.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children?: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function seitentext(): string {
  return document.body.textContent ?? "";
}

/** Nur die Felder, die der Tab liest — bewusst verengt. */
function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "onb-1",
    displayId: "2026-GYM-014",
    email: "anna.beispiel@example.org",
    firstName: "Anna",
    lastName: "Beispiel",
    status: "IN_PROGRESS",
    questionnaireType: "STANDARD",
    token: "tok-fb",
    invitedAt: "2026-09-08T12:00:00.000Z",
    submittedAt: null,
    supervisorSubmittedAt: null,
    supervisorToken: null,
    supervisorEmail: null,
    supervisorTokenExpiresAt: null,
    supervisorLinkSentAt: null,
    reviewedAt: null,
    completedAt: null,
    starterPacketSentAt: null,
    starterPacketSentCount: 0,
    organization: { id: "org-1", name: "FES Gymnasium", mandantNumber: "10" },
    fragebogenFortschritt: {
      position: 4,
      total: 9,
      titel: "Sozialversicherung",
      prozent: 44,
    },
    requiredDocuments: [],
    personalData: { firstName: "Anna", lastName: "Beispiel", isComplete: false, currentStep: 4 },
    supervisorData: null,
    documents: [],
    checklistItems: [],
    notes: [],
    _count: { notes: 0 },
    ...teil,
  };
}

function uebersicht(
  teil: Record<string, unknown> = {},
  supervisorEmail = "",
  darfBearbeiten = true,
) {
  render(
    <TabOverview
      data={vorgang(teil) as unknown as React.ComponentProps<typeof TabOverview>["data"]}
      appUrl="https://hr.fes-credo.de"
      supervisorEmail={supervisorEmail}
      setSupervisorEmail={jest.fn()}
      generatingLink={false}
      generateSupervisorLink={jest.fn()}
      linkResult={null}
      linkMeldung={null}
      notes={[]}
      newNote=""
      setNewNote={jest.fn()}
      savingNote={false}
      addNote={jest.fn()}
      onboardingId="onb-1"
      setActiveTab={jest.fn()}
      oeffnePaketDialog={jest.fn()}
      oeffneAbteilungenDialog={jest.fn()}
      darfBearbeiten={darfBearbeiten}
    />,
  );
}

describe("Onboarding-Übersicht: beide Spuren offen", () => {
  it("zwei Karten nebeneinander, Hinweiszeile mit den Schrittnummern", () => {
    uebersicht();

    expect(
      document.querySelector('[data-hinweis="parallele-schritte"]')?.textContent ?? "",
    ).toContain("Schritte 2 und 3 laufen parallel, in beliebiger Reihenfolge");
    expect(screen.queryAllByText("Läuft parallel")).toHaveLength(2);
    expect(seitentext()).toContain("Personalfragebogen");
    expect(seitentext()).toContain("Einstellungsmodalitäten");
  });

  it("ohne Vorgesetzten-Link steht der Knopf trotzdem da — frueher erst nach dem Fragebogen", () => {
    uebersicht({}, "leitung@example.org");
    expect(screen.getByRole("button", { name: "Vorgesetzten-Link erstellen" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Fragebogen-Link kopieren" })).not.toBeNull();
    expect(seitentext()).toContain("Kann sofort erstellt werden, unabhängig vom Fragebogen.");
  });

  it("mit gültigem Link: „Modalitäten-Link kopieren“ am Schritt", () => {
    uebersicht(
      {
        supervisorToken: "tok-sv",
        supervisorEmail: "leitung@example.org",
        supervisorTokenExpiresAt: "2099-10-20T12:00:00.000Z",
        supervisorData: { isComplete: false, currentStep: 1 },
      },
      "leitung@example.org",
    );
    expect(screen.getByRole("button", { name: "Modalitäten-Link kopieren" })).not.toBeNull();
    expect(seitentext()).toContain("Modalitäten in Bearbeitung — Schritt 2 von 5");
  });

  it("Karte „Status-Übersicht“ spricht dieselbe Sprache wie die Chips", () => {
    uebersicht();
    const text = seitentext();
    expect(text).toContain("Schritt 4 von 9");
    expect(text).toContain("kein Link");
    // Die alten, abweichenden Texte gibt es nicht mehr.
    expect(text).not.toContain("Ausstehend");
    expect(text).not.toContain("Nicht begonnen");
  });
});

describe("Onboarding-Übersicht: ohne Bearbeitungsrecht", () => {
  // Durchsicht 09/2026: Die Uebersicht pruefte keine Rolle. Eine Rolle ohne
  // HR_EDIT_ROLES sah Formular und Knoepfe und bekam beim Absenden 403.
  it("Karte „Vorgesetzten-Link“ ohne Formular, Stepper ohne „erstellen“", () => {
    uebersicht({}, "leitung@example.org", false);
    expect(screen.queryByRole("button", { name: "Generieren" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vorgesetzten-Link erstellen" })).toBeNull();
    expect(screen.queryByPlaceholderText("vorgesetzter@einrichtung.de")).toBeNull();
    expect(seitentext()).toContain("Noch kein Vorgesetzten-Link generiert.");
    expect(seitentext()).not.toContain("Kann sofort erstellt werden");
    // Kopieren bleibt.
    expect(screen.getByRole("button", { name: "Fragebogen-Link kopieren" })).not.toBeNull();
  });

  it("abgelaufener Link: kein „Neuen Link erzeugen“ in der Karte", () => {
    const abgelaufen = {
      supervisorToken: "tok-sv",
      supervisorEmail: "leitung@example.org",
      supervisorTokenExpiresAt: "2020-01-01T12:00:00.000Z",
      supervisorData: { isComplete: false, currentStep: 1 },
    };
    uebersicht(abgelaufen, "leitung@example.org", false);
    expect(screen.queryByRole("button", { name: "Neuen Link erzeugen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Neuen Vorgesetzten-Link erzeugen" })).toBeNull();
    // Der Stand bleibt lesbar.
    expect(seitentext()).toContain("Link abgelaufen am");
  });

  it("Gegenprobe mit Recht: Formular und Knoepfe wie bisher", () => {
    uebersicht({}, "leitung@example.org", true);
    expect(screen.getByRole("button", { name: "Generieren" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Vorgesetzten-Link erstellen" })).not.toBeNull();
  });
});

describe("Onboarding-Übersicht: Fuehrungskraft war schneller", () => {
  it("nur EIN aktiver Schritt, dafuer der Hinweis auf die fertige Gegenspur", () => {
    uebersicht({
      supervisorToken: "tok-sv",
      supervisorEmail: "leitung@example.org",
      supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
      supervisorTokenExpiresAt: "2099-10-20T12:00:00.000Z",
      supervisorData: { isComplete: true, currentStep: 5 },
    });

    expect(document.querySelector('[data-hinweis="parallele-schritte"]')).toBeNull();
    expect(screen.queryAllByText("Aktueller Schritt")).toHaveLength(1);
    expect(seitentext()).toContain(
      "✓ Einstellungsmodalitäten bereits eingereicht am 18.09.2026, unabhängig vom Fragebogen.",
    );
    // Die Modalitaeten stehen jetzt unter „Erledigt" — mit Datum.
    expect(seitentext()).toContain("Erledigt (2 Schritte)");
    expect(seitentext()).toContain("Eingereicht am 18.09.2026");
  });
});
