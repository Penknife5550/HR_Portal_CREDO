/**
 * @jest-environment jsdom
 */

/**
 * `ProcessWorkflowStepper` — mehrere gleichzeitig aktive Schritte (Paket 2).
 *
 * Die Komponente ist GETEILT: Onboarding (`dashboard/[id]/detail-content.tsx`)
 * und Offboarding (`dashboard/offboarding/[id]/tabs/tab-overview.tsx`) rendern
 * dieselbe. Deshalb steht hier an erster Stelle der Nachweis, dass der
 * EIN-SCHRITT-PFAD unveraendert bleibt — daran haengt `abteilungen-karte.test.tsx`
 * mit dem Markup von Offboarding-Schritt 2.
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { render, screen } from "@testing-library/react";
import {
  ProcessWorkflowStepper,
  type WorkflowStep,
} from "@/components/process-workflow-stepper";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function seitentext(): string {
  return document.body.textContent ?? "";
}

function schritt(teil: Partial<WorkflowStep> & { key: string }): WorkflowStep {
  return {
    title: `Titel ${teil.key}`,
    description: `Beschreibung ${teil.key}`,
    status: "upcoming",
    ...teil,
  };
}

/** Sechs Schritte wie im Onboarding; `aktiv` nennt die Schluessel der aktiven. */
function schritte(aktiv: string[], erledigt: string[] = ["eins"]): WorkflowStep[] {
  return ["eins", "zwei", "drei", "vier", "fuenf", "sechs"].map((key) =>
    schritt({
      key,
      status: aktiv.includes(key)
        ? "active"
        : erledigt.includes(key)
          ? "completed"
          : "upcoming",
    }),
  );
}

const hinweiszeile = () => document.querySelector('[data-hinweis="parallele-schritte"]');

describe("ProcessWorkflowStepper: ein aktiver Schritt (unveraendert)", () => {
  it("genau eine grosse Karte mit Chip „Aktueller Schritt“, ohne Hinweiszeile", () => {
    render(<ProcessWorkflowStepper steps={schritte(["zwei"])} />);

    expect(screen.queryAllByText("Aktueller Schritt")).toHaveLength(1);
    expect(screen.queryByText("Läuft parallel")).toBeNull();
    expect(hinweiszeile()).toBeNull();
    expect(seitentext()).toContain("Titel zwei");
  });

  it("die Nummer der Karte ist die Position in der GESAMTEN Liste", () => {
    render(<ProcessWorkflowStepper steps={schritte(["drei"])} />);
    // Die Kopfzeile der aktiven Karte traegt Nummer 3, nicht 1.
    const chip = screen.getByText("Aktueller Schritt");
    const kopf = chip.closest("div")?.parentElement?.parentElement;
    expect(kopf?.textContent ?? "").toContain("3");
  });

  it("kein aktiver Schritt und nichts Kommendes: „Prozess abgeschlossen“", () => {
    render(
      <ProcessWorkflowStepper
        steps={[
          schritt({ key: "eins", status: "completed" }),
          schritt({ key: "zwei", status: "completed" }),
        ]}
      />,
    );
    expect(seitentext()).toContain("Prozess abgeschlossen");
  });
});

describe("ProcessWorkflowStepper: mehrere aktive Schritte", () => {
  it("zwei aktive: beide Karten, zweimal „Läuft parallel“, Hinweiszeile mit den Nummern", () => {
    render(<ProcessWorkflowStepper steps={schritte(["zwei", "drei"])} />);

    expect(seitentext()).toContain("Titel zwei");
    expect(seitentext()).toContain("Titel drei");
    expect(screen.queryAllByText("Läuft parallel")).toHaveLength(2);
    expect(screen.queryByText("Aktueller Schritt")).toBeNull();
    expect(hinweiszeile()?.textContent ?? "").toContain(
      "Schritte 2 und 3 laufen parallel, in beliebiger Reihenfolge",
    );
  });

  it("drei aktive: Aufzaehlung mit Komma und „und“", () => {
    render(<ProcessWorkflowStepper steps={schritte(["zwei", "drei", "vier"])} />);
    expect(hinweiszeile()?.textContent ?? "").toContain(
      "Die Schritte 2, 3 und 4 laufen parallel, in beliebiger Reihenfolge",
    );
    expect(screen.queryAllByText("Läuft parallel")).toHaveLength(3);
  });

  it("Info, Aktionen und Fortschritt erscheinen an JEDER aktiven Karte", () => {
    const klick = jest.fn();
    render(
      <ProcessWorkflowStepper
        steps={[
          schritt({ key: "eins", status: "completed" }),
          schritt({
            key: "zwei",
            status: "active",
            info: "Fragebogen in Bearbeitung",
            progress: { done: 4, total: 9 },
            actions: [{ label: "Fragebogen-Link kopieren", onClick: klick, variant: "secondary" }],
          }),
          schritt({
            key: "drei",
            status: "active",
            info: "Modalitäten in Bearbeitung",
            actions: [{ label: "Vorgesetzten-Link erstellen", onClick: klick }],
          }),
        ]}
      />,
    );

    const text = seitentext();
    expect(text).toContain("Fragebogen in Bearbeitung");
    expect(text).toContain("Modalitäten in Bearbeitung");
    expect(text).toContain("4/9");
    expect(screen.getByRole("button", { name: "Fragebogen-Link kopieren" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Vorgesetzten-Link erstellen" })).not.toBeNull();
  });
});

describe("ProcessWorkflowStepper: erledigte Schritte", () => {
  it("Singular bei einem, Plural ab zwei", () => {
    const { unmount } = render(<ProcessWorkflowStepper steps={schritte(["zwei"], ["eins"])} />);
    expect(seitentext()).toContain("Erledigt (1 Schritt)");
    expect(seitentext()).not.toContain("Erledigt (1 Schritte)");
    unmount();

    render(<ProcessWorkflowStepper steps={schritte(["drei"], ["eins", "zwei"])} />);
    expect(seitentext()).toContain("Erledigt (2 Schritte)");
  });
});
