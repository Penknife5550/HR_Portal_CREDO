/**
 * @jest-environment jsdom
 */

/**
 * Dialog „Abteilungen informieren" (Paket 5, beide Module).
 *
 * Wie in abteilungen-karte.test.tsx entstehen die Zeilen mit der ECHTEN Regel
 * des Servers (`abteilungsZeilenBauen`): Der Dialog soll zeigen, was der
 * Versand tatsaechlich taete — Empfaenger, Aufgaben, Faelligkeiten und den
 * Zuschnitt der Daten. Ein eigener Rechenweg im Dialog waere genau die Stelle,
 * an der Anzeige und Mail auseinanderlaufen.
 *
 * Belegt wird:
 *  1. Empfaengerbloecke mit Adresse, Aufgaben und Faelligkeiten, ab der
 *     vierten Aufgabe „…und n weitere".
 *  2. „Was die Empfänger sehen" nennt die Zusatzfelder genau der Stellen, die
 *     sie bekommen (IT ja, Buchhaltung nein) — im Offboarding gar keine.
 *  3. Gelber Block „Nicht informiert werden" mit dem Grund des Servers.
 *  4. Knopf „n E-Mails senden", „Wird gesendet…", Abbrechen ohne Wirkung;
 *     Escape schliesst wie „Abbrechen" — waehrend des Versands nicht.
 *  5. Die Gueltigkeit im Einleitungssatz; bei verschiedenen Daten die
 *     frueheste als Untergrenze.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AbteilungenDialog,
  gueltigkeitsText,
  nichtInformierteZeilen,
} from "@/components/abteilungsaufgaben/abteilungen-dialog";
import {
  abteilungsZeilenBauen,
  type AbteilungsKonfig,
  type AbteilungsModul,
  type AbteilungsUebersichtDaten,
  type AufgabeFuerZeile,
  type FuehrungskraftDaten,
  type LinkFuerZeile,
} from "@/lib/abteilungsaufgaben";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtures
// =============================================

/** 22.09.2026, 12:00 Uhr deutscher Zeit. */
const JETZT = new Date("2026-09-22T10:00:00.000Z");
const BEZUG = "2026-10-01T00:00:00.000Z";
const ORG = "org-minden";

const KONFIGS: AbteilungsKonfig[] = [
  { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo-gruppe.de", organizationId: null, isActive: true },
  { departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", email: "buha@credo-gruppe.de", organizationId: null, isActive: true },
  // FACILITY steht mit Absicht NICHT hier: keine hinterlegte Adresse, also
  // „Nicht informiert werden".
];

const FUEHRUNGSKRAFT: FuehrungskraftDaten = { email: "a.leitung@fes-minden.de", name: "Anna Leitung" };

const AUFGABEN: AufgabeFuerZeile[] = [
  { id: "it1", title: "Benutzerkonto anlegen", assigneeDepartment: "IT", isCompleted: false, dueDate: "2026-09-24T00:00:00.000Z" },
  { id: "it2", title: "Notebook bereitstellen", assigneeDepartment: "IT", isCompleted: false, dueDate: "2026-09-28T00:00:00.000Z" },
  { id: "it3", title: "Telefon einrichten", assigneeDepartment: "IT", isCompleted: false, dueDate: null },
  { id: "it4", title: "Drucker freischalten", assigneeDepartment: "IT", isCompleted: false, dueDate: "2026-10-01T00:00:00.000Z" },
  { id: "bu1", title: "Personalstammsatz anlegen", assigneeDepartment: "BUCHHALTUNG", isCompleted: false, dueDate: null },
  { id: "fa1", title: "Schlüssel bereitlegen", assigneeDepartment: "FACILITY", isCompleted: false, dueDate: null },
  { id: "vo1", title: "Einarbeitungsplan abstimmen", assigneeDepartment: "VORGESETZTER", isCompleted: false, dueDate: "2026-09-29T00:00:00.000Z" },
];

function daten(
  opts: {
    modul?: AbteilungsModul;
    aufgaben?: AufgabeFuerZeile[];
    links?: LinkFuerZeile[];
    fuehrungskraft?: FuehrungskraftDaten | null;
  } = {},
): AbteilungsUebersichtDaten {
  const r = abteilungsZeilenBauen({
    aufgaben: opts.aufgaben ?? AUFGABEN,
    links: opts.links ?? [],
    konfigs: KONFIGS,
    organizationId: ORG,
    fuehrungskraft: opts.fuehrungskraft === undefined ? FUEHRUNGSKRAFT : opts.fuehrungskraft,
    vorgangAbgeschlossen: false,
    linkUrl: (t) => `https://hr.fes-credo.de/onboarding-tasks/${t}`,
    jetzt: JETZT,
  });
  return {
    ...r,
    modul: opts.modul ?? "ONBOARDING",
    vorgangAbgeschlossen: false,
    vorgangAbgebrochen: false,
    bezugsdatum: BEZUG,
    gesperrt: null,
  };
}

function zeige(d: AbteilungsUebersichtDaten, extra: Partial<React.ComponentProps<typeof AbteilungenDialog>> = {}) {
  const onSenden = jest.fn();
  const onAbbrechen = jest.fn();
  render(<AbteilungenDialog abteilungen={d} onSenden={onSenden} onAbbrechen={onAbbrechen} {...extra} />);
  return { onSenden, onAbbrechen };
}

const block = (key: string) => document.querySelector(`[data-empfaenger="${key}"]`) as HTMLElement;
const dialogtext = () => (screen.getByRole("dialog").textContent ?? "");

// =============================================
// 1. Empfaengerbloecke
// =============================================

describe("Empfängerblöcke", () => {
  it("nennt Name, Adresse, Aufgaben und Fälligkeiten", () => {
    zeige(daten());
    const it = block("IT");
    expect(it.textContent).toContain("IT-Abteilung – it@credo-gruppe.de");
    expect(it.textContent).toContain("Benutzerkonto anlegen – fällig 24.09.2026");
    expect(it.textContent).toContain("Notebook bereitstellen – fällig 28.09.2026");
    // Ohne Frist nur der Titel, kein „fällig".
    const buha = block("BUCHHALTUNG");
    expect(buha.textContent).toContain("Personalstammsatz anlegen");
    expect(buha.textContent).not.toContain("fällig");
  });

  it("Reihenfolge wie in der Mail: früheste Fälligkeit zuerst, ohne Frist zuletzt", () => {
    zeige(daten());
    // „Telefon einrichten" hat keine Frist und steht deshalb hinter den drei
    // datierten — sichtbar sind nur die ersten drei.
    expect(block("IT").textContent).toContain("…und 1 weitere");
    expect(block("IT").textContent).not.toContain("Telefon einrichten");
    expect(block("IT").textContent).toContain("Drucker freischalten – fällig 01.10.2026");
  });

  it("Führungskraft bekommt ihre eigene Zeile mit der Adresse aus dem Vorgang", () => {
    zeige(daten());
    expect(block("VORGESETZTER").textContent).toContain("Führungskraft – a.leitung@fes-minden.de");
    expect(block("VORGESETZTER").textContent).toContain("Einarbeitungsplan abstimmen – fällig 29.09.2026");
  });
});

// =============================================
// 2. Was die Empfaenger sehen
// =============================================

describe("Was die Empfänger sehen", () => {
  it("Onboarding: Grunddaten, Zusatzfelder nur für berechtigte Stellen, Schlusssatz", () => {
    zeige(daten());
    const b = document.querySelector('[data-block="sichtbarkeit"]') as HTMLElement;
    expect(b.textContent).toContain(
      "Name, Einrichtung, Vorgangsnummer und Vertragsbeginn sowie ihre eigenen Aufgaben.",
    );
    expect(b.textContent).toContain(
      "IT-Abteilung zusätzlich: Stellenbezeichnung, Betriebsstätte, Adresse der Führungskraft",
    );
    expect(b.textContent).toContain("Führungskraft zusätzlich: Stellenbezeichnung, Betriebsstätte");
    // Buchhaltung sieht nichts zusaetzlich — sie darf hier nicht stehen.
    expect(b.textContent).not.toContain("Buchhaltung zusätzlich");
    expect(b.textContent).toContain("Keine Angaben aus dem Personalfragebogen.");
  });

  it("Offboarding: nur der Grundsatz, kein „zusätzlich“ und kein Schlusssatz", () => {
    zeige(daten({ modul: "OFFBOARDING" }));
    const b = document.querySelector('[data-block="sichtbarkeit"]') as HTMLElement;
    expect(b.textContent).toContain(
      "Name, Einrichtung, Vorgangsnummer und den letzten Arbeitstag sowie ihre eigenen Aufgaben.",
    );
    expect(b.textContent).not.toContain("zusätzlich");
    expect(b.textContent).not.toContain("Personalfragebogen");
  });
});

// =============================================
// 3. Nicht informiert werden
// =============================================

describe("Nicht informiert werden", () => {
  it("gelber Block mit Name und Grund des Servers", () => {
    zeige(daten());
    const b = document.querySelector('[data-block="nicht-informiert"]') as HTMLElement;
    expect(b.className).toContain("credo-gelb");
    expect(b.textContent).toContain(
      "Facility Management – keine aktive Adresse hinterlegt (Einstellungen → Abteilungen)",
    );
    // Wer informiert wird, steht nicht hier.
    expect(b.textContent).not.toContain("IT-Abteilung");
  });

  it("fehlt ganz, wenn jede Stelle erreichbar ist", () => {
    const d = daten({ aufgaben: AUFGABEN.filter((a) => a.assigneeDepartment !== "FACILITY") });
    expect(nichtInformierteZeilen(d)).toEqual([]);
    zeige(d);
    expect(document.querySelector('[data-block="nicht-informiert"]')).toBeNull();
  });

  it("bereits informierte Abteilungen zählen nicht als Versäumnis", () => {
    const d = daten({
      links: [
        {
          id: "l-it",
          departmentKey: "IT",
          departmentName: "IT-Abteilung",
          email: "it@credo-gruppe.de",
          token: "tok-it",
          sentAt: "2026-09-20T08:00:00.000Z",
          lastSentAt: "2026-09-20T08:00:00.000Z",
          firstOpenedAt: null,
          lastOpenedAt: null,
          openCount: 0,
          allTasksComplete: false,
          completedAt: null,
          expiresAt: "2026-12-30T00:00:00.000Z",
          lastReminderAt: null,
          reminderCount: 0,
          lastSendStatus: "SENT",
          lastSendDetail: null,
          zugestelltAn: "it@credo-gruppe.de",
        },
      ],
    });
    zeige(d);
    expect(block("IT")).toBeNull();
    const b = document.querySelector('[data-block="nicht-informiert"]') as HTMLElement;
    expect(b.textContent).not.toContain("IT-Abteilung");
  });
});

// =============================================
// 4. Knoepfe
// =============================================

describe("Knöpfe", () => {
  it("„3 E-Mails senden“ meldet „senden“ an die Karte, ohne selbst zu rufen", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { onSenden } = zeige(daten());
    const k = screen.getByRole("button", { name: "3 E-Mails senden" });
    await act(async () => {
      fireEvent.click(k);
    });
    expect(onSenden).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Einzahl: „1 E-Mail senden“", () => {
    zeige(daten({ aufgaben: AUFGABEN.filter((a) => a.assigneeDepartment === "IT") }));
    expect(screen.getByRole("button", { name: "1 E-Mail senden" })).not.toBeNull();
  });

  it("während des Versands „Wird gesendet…“, beide Knöpfe gesperrt", () => {
    zeige(daten(), { sendet: true });
    const senden = screen.getByRole("button", { name: "Wird gesendet…" }) as HTMLButtonElement;
    const abbrechen = screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement;
    expect(senden.disabled).toBe(true);
    expect(abbrechen.disabled).toBe(true);
  });

  it("„Abbrechen“ und Escape schließen, ohne zu senden", () => {
    const { onAbbrechen, onSenden } = zeige(daten());
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).toHaveBeenCalledTimes(2);
    expect(onSenden).not.toHaveBeenCalled();
  });

  it("Escape während des Versands schließt NICHT (wie der gesperrte Knopf „Abbrechen“)", () => {
    const { onAbbrechen } = zeige(daten(), { sendet: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).not.toHaveBeenCalled();
  });

  it("Escape liest `sendet` aktuell — kein veralteter Wert nach einem Wechsel", () => {
    // Dieselbe Dialog-Instanz durch alle drei Stände: Ein Horcher mit
    // veralteter Closure schloesse im zweiten Stand trotzdem (bzw. im dritten
    // nicht mehr).
    const onAbbrechen = jest.fn();
    const onSenden = jest.fn();
    const d = daten();
    const { rerender } = render(
      <AbteilungenDialog abteilungen={d} sendet={false} onAbbrechen={onAbbrechen} onSenden={onSenden} />,
    );

    rerender(<AbteilungenDialog abteilungen={d} sendet onAbbrechen={onAbbrechen} onSenden={onSenden} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).not.toHaveBeenCalled();

    rerender(<AbteilungenDialog abteilungen={d} sendet={false} onAbbrechen={onAbbrechen} onSenden={onSenden} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("Escape nach dem Schließen: kein Horcher bleibt zurück", () => {
    const { onAbbrechen } = zeige(daten());
    cleanup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).not.toHaveBeenCalled();
  });

  it("andere Tasten schließen nicht", () => {
    const { onAbbrechen } = zeige(daten());
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onAbbrechen).not.toHaveBeenCalled();
  });

  it("Fokus liegt beim Öffnen auf „Abbrechen“ und springt beim Neuzeichnen nicht zurück", () => {
    // Die Karte reicht `onAbbrechen` als neue Pfeilfunktion je Render. Hing der
    // Fokus am selben Effekt wie die Taste, riss jedes Neuzeichnen ihn zurueck.
    const d = daten();
    const { rerender } = render(
      <AbteilungenDialog abteilungen={d} onAbbrechen={() => {}} onSenden={() => {}} />,
    );
    const abbrechen = screen.getByRole("button", { name: "Abbrechen" });
    const senden = screen.getByRole("button", { name: "3 E-Mails senden" });
    expect(document.activeElement).toBe(abbrechen);

    senden.focus();
    rerender(<AbteilungenDialog abteilungen={d} onAbbrechen={() => {}} onSenden={() => {}} />);
    expect(document.activeElement).toBe(senden);
  });

  it("ohne Empfänger: Hinweis statt Versand, Knopf gesperrt", () => {
    const d = daten({ aufgaben: [{ id: "h1", title: "Akte anlegen", assigneeDepartment: "HR", isCompleted: false, dueDate: null }] });
    zeige(d);
    expect(dialogtext()).toContain("Es gibt keine Abteilung, die jetzt informiert werden kann.");
    expect((screen.getByRole("button", { name: "0 E-Mails senden" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// =============================================
// 5. Gueltigkeit im Einleitungssatz
// =============================================

describe("Gültigkeit", () => {
  it("ein Datum für alle: „gültig bis TT.MM.JJJJ“", () => {
    zeige(daten());
    expect(dialogtext()).toContain(
      "Folgende Stellen erhalten eine E-Mail mit einem Link zu ihren Aufgaben. Der Link funktioniert ohne Anmeldung und ist gültig bis",
    );
    // Alle neuen Links laufen gleich lang — genau ein Datum im Satz.
    const d = daten();
    expect(new Set(d.zeilen.filter((z) => z.informierbar).map((z) => z.vorschau?.gueltigBis)).size).toBe(1);
  });

  it("verschiedene Daten: das früheste als Untergrenze", () => {
    const zeilen = [
      { vorschau: { aufgaben: [], gueltigBis: "2026-12-30T00:00:00.000Z" } },
      { vorschau: { aufgaben: [], gueltigBis: "2026-11-15T00:00:00.000Z" } },
    ] as unknown as Parameters<typeof gueltigkeitsText>[0];
    expect(gueltigkeitsText(zeilen)).toBe("mindestens gültig bis 15.11.2026");
  });

  it("ohne Vorschau: kein erfundenes Datum", () => {
    expect(gueltigkeitsText([])).toBe("");
  });
});

// =============================================
// 6. Datensparsamkeit
// =============================================

describe("Datensparsamkeit", () => {
  it("nennt weder die private Adresse noch Angaben aus dem Fragebogen", () => {
    zeige(daten());
    const text = dialogtext();
    expect(text).not.toContain("@gmx");
    expect(text).not.toContain("IBAN");
    expect(text).not.toContain("Geburtsdatum");
  });
});
