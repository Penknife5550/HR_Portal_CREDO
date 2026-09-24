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
 *
 * Dazu (Befund B4): `aktionenAuchKommend` zeigt die Aktionen eines KOMMENDEN
 * Schritts schmal in seiner Zeile — nur auf ausdruecklichen Wunsch, sonst
 * bleibt das Markup kommender Schritte woertlich gleich.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ProcessWorkflowStepper,
  type WorkflowStep,
} from "@/components/process-workflow-stepper";
import {
  onboardingWorkflowSchritte,
  type SchritteStand,
  type SchrittAktionen,
} from "@/app/(portal)/dashboard/[id]/uebersicht-schritte";
import {
  abteilungsZeilenBauen,
  onboardingVersandSperre,
  type AbteilungsUebersichtDaten,
} from "@/lib/abteilungsaufgaben";

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

describe("ProcessWorkflowStepper: Aktionen kommender Schritte (`aktionenAuchKommend`)", () => {
  const kommendeZeile = (key: string) =>
    document.querySelector(`[data-kommend-mit-aktionen="${key}"]`);

  it("ohne das Feld: kommende Schritte zeigen KEINE Aktionen, Markup wie ohne Aktionen", () => {
    // Offboarding und alle uebrigen Onboarding-Schritte setzen das Feld nicht —
    // fuer sie darf sich nichts aendern, auch nicht im Markup.
    const klick = jest.fn();
    const ohneAktionen = schritte(["zwei"]);
    const { container, unmount } = render(<ProcessWorkflowStepper steps={ohneAktionen} />);
    const vorher = container.innerHTML;
    unmount();

    const mitAktionen = schritte(["zwei"]).map((s) =>
      s.key === "vier" ? { ...s, actions: [{ label: "Heimlicher Knopf", onClick: klick }] } : s,
    );
    const zweiter = render(<ProcessWorkflowStepper steps={mitAktionen} />);
    expect(screen.queryByRole("button", { name: "Heimlicher Knopf" })).toBeNull();
    expect(kommendeZeile("vier")).toBeNull();
    expect(zweiter.container.innerHTML).toBe(vorher);
  });

  it("mit dem Feld: schmaler Knopf in der Zeile, Klick ruft die Aktion", () => {
    const klick = jest.fn();
    const steps = schritte(["zwei"]).map((s) =>
      s.key === "vier"
        ? {
            ...s,
            aktionenAuchKommend: true,
            actions: [{ label: "Abteilungen informieren…", onClick: klick }],
          }
        : s,
    );
    render(<ProcessWorkflowStepper steps={steps} />);

    const zeile = kommendeZeile("vier");
    expect(zeile).not.toBeNull();
    expect(zeile?.textContent ?? "").toContain("Titel vier");
    const knopf = screen.getByRole("button", { name: "Abteilungen informieren…" });
    expect(zeile?.contains(knopf)).toBe(true);
    // Der Knopf steht nicht unter der Transparenz der ausgegrauten Zeile.
    expect(knopf.closest(".opacity-60")).toBeNull();
    fireEvent.click(knopf);
    expect(klick).toHaveBeenCalledTimes(1);

    // Der Schritt bleibt ein KOMMENDER: keine zweite aktive Karte, kein Parallel-Satz.
    expect(screen.queryAllByText("Aktueller Schritt")).toHaveLength(1);
    expect(hinweiszeile()).toBeNull();
    expect(seitentext()).toContain("Kommende Schritte (4)");
  });

  it("gesperrte Aktion bleibt gesperrt", () => {
    const steps = schritte(["zwei"]).map((s) =>
      s.key === "vier"
        ? {
            ...s,
            aktionenAuchKommend: true,
            actions: [{ label: "Gesperrt", onClick: jest.fn(), disabled: true }],
          }
        : s,
    );
    render(<ProcessWorkflowStepper steps={steps} />);
    expect((screen.getByRole("button", { name: "Gesperrt" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mit dem Feld, aber ohne Aktionen: Zeile wie immer", () => {
    const steps = schritte(["zwei"]).map((s) =>
      s.key === "vier" ? { ...s, aktionenAuchKommend: true } : s,
    );
    render(<ProcessWorkflowStepper steps={steps} />);
    expect(kommendeZeile("vier")).toBeNull();
  });

  it("blockierte Schritte zeigen auch mit dem Feld keine Knoepfe", () => {
    const steps = schritte(["zwei"]).map((s) =>
      s.key === "vier"
        ? {
            ...s,
            status: "blocked" as const,
            aktionenAuchKommend: true,
            actions: [{ label: "Trotzdem", onClick: jest.fn() }],
          }
        : s,
    );
    render(<ProcessWorkflowStepper steps={steps} />);
    expect(screen.queryByRole("button", { name: "Trotzdem" })).toBeNull();
  });
});

describe("Onboarding-Schritte im Stepper: „Abteilungen informieren…“ vor der Prüfung", () => {
  // Verdrahtung: die echten Schritte aus `uebersicht-schritte.ts` im echten
  // Stepper. Beide Spuren eingereicht, HR hat noch nicht geprueft — die
  // Checkliste kommt noch, der Versand an die Abteilungen ist aber erlaubt.
  const JETZT = new Date("2026-09-20T12:00:00.000Z");

  function abteilungen(gesperrt: boolean): AbteilungsUebersichtDaten {
    const sperre = gesperrt
      ? onboardingVersandSperre({ status: "SUBMITTED", supervisorSubmittedAt: null, supervisorData: null })
      : null;
    const r = abteilungsZeilenBauen({
      aufgaben: [
        { id: "c1", title: "Benutzerkonto anlegen", assigneeDepartment: "IT", isCompleted: false, dueDate: null },
      ],
      links: [],
      konfigs: [
        { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo-gruppe.de", organizationId: null, isActive: true },
      ],
      organizationId: "org-1",
      fuehrungskraft: null,
      vorgangAbgeschlossen: false,
      gesperrt: !!sperre,
      linkUrl: (t) => `https://hr.fes-credo.de/onboarding-tasks/${t}`,
      jetzt: JETZT,
    });
    return {
      ...r,
      modul: "ONBOARDING",
      vorgangAbgeschlossen: false,
      vorgangAbgebrochen: false,
      bezugsdatum: sperre ? null : "2026-10-01T00:00:00.000Z",
      gesperrt: sperre,
    };
  }

  function stand(teil: Partial<SchritteStand>): SchritteStand {
    return {
      status: "SUPERVISOR_SUBMITTED",
      token: "tok-fb",
      invitedAt: "2026-09-08T12:00:00.000Z",
      submittedAt: "2026-09-19T12:00:00.000Z",
      supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
      supervisorToken: "tok-sv",
      supervisorEmail: "leitung@example.org",
      supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
      supervisorLinkSentAt: null,
      reviewedAt: null,
      completedAt: null,
      fragebogenFortschritt: { position: 9, total: 9, titel: "Abschluss", prozent: 100 },
      personalData: { isComplete: true, currentStep: 9 },
      supervisorData: { isComplete: true, currentStep: 5 },
      documents: { length: 0 },
      checklistItems: [
        { id: "c1", title: "Benutzerkonto anlegen", isCompleted: false, assignee: "IT", notes: null },
      ],
      ...teil,
    };
  }

  function aktionen(abteilungenInformieren: () => void): SchrittAktionen {
    return {
      darfBearbeiten: true,
      fragebogenLink: "https://hr.fes-credo.de/fragebogen/tok-fb",
      modalitaetenLink: null,
      supervisorAdresseEingetragen: true,
      linkWirdErzeugt: false,
      vorgesetztenLinkErzeugen: jest.fn(),
      abteilungenInformieren,
      csvExport: jest.fn(),
      dokumenteVersenden: jest.fn(),
    };
  }

  it("informierbare Abteilungen: Knopf sichtbar, Klick ruft abteilungenInformieren", () => {
    const informieren = jest.fn();
    const steps = onboardingWorkflowSchritte(
      stand({ abteilungen: abteilungen(false) }),
      aktionen(informieren),
      JETZT,
    );
    render(<ProcessWorkflowStepper steps={steps} />);

    const knopf = screen.getByRole("button", { name: "Abteilungen informieren…" });
    expect(document.querySelector('[data-kommend-mit-aktionen="checkliste"]')?.contains(knopf)).toBe(true);
    fireEvent.click(knopf);
    expect(informieren).toHaveBeenCalledTimes(1);
    // Aktiv bleibt allein „Daten prüfen".
    expect(screen.queryAllByText("Aktueller Schritt")).toHaveLength(1);
    expect(hinweiszeile()).toBeNull();
  });

  it("ohne eingereichte Modalitaeten (gesperrt): kein Knopf", () => {
    const steps = onboardingWorkflowSchritte(
      stand({
        status: "SUBMITTED",
        supervisorSubmittedAt: null,
        supervisorData: { isComplete: false, currentStep: 2 },
        abteilungen: abteilungen(true),
      }),
      aktionen(jest.fn()),
      JETZT,
    );
    render(<ProcessWorkflowStepper steps={steps} />);
    expect(screen.queryByRole("button", { name: "Abteilungen informieren…" })).toBeNull();
    expect(document.querySelector("[data-kommend-mit-aktionen]")).toBeNull();
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
