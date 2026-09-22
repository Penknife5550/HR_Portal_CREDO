/**
 * @jest-environment jsdom
 */

/**
 * Karte „Aufgaben für Abteilungen" (Paket 1b) und ihre Nachbarn im Portal.
 *
 * Die Zeilen entstehen hier mit der ECHTEN Regel des Servers
 * (`abteilungsZeilenBauen` aus src/lib/abteilungsaufgaben.ts) — die Karte
 * rechnet nichts selbst, und genau das soll der Test zeigen: Was der Server
 * als Pill, Hinweis und erlaubte Aktion liefert, steht so auf der Karte.
 *
 * Belegt wird:
 *  1. Der Hauptknopf: „Abteilungen informieren" / „Weitere Abteilungen
 *     informieren (2)" / ausgeblendet.
 *  2. Lücken sind sichtbar: Führungskraft ohne Adresse (gelb, „Eintragen"),
 *     übersprungene Abteilung (gelb, mit Grund).
 *  3. Die Sperrzeit graut „Erinnern"/„Erneut senden" aus, mit Uhrzeit im Tooltip.
 *  4. „Link kopieren" nimmt die Adresse vom Server, nie window.location.
 *  5. „Link erneuern…" fragt nach, und erst die Bestätigung löst aus.
 *  6. Nach einer Aktion: grüne bzw. rote Leiste mit der Meldung des Servers,
 *     gelbe mit dem Hinweis.
 *  7. Abgeschlossener Vorgang: nur lesen.
 *  8. Aufgabenkarte der Checkliste: Urheber (Link/Portal), blaue Box mit dem
 *     Kommentar der Abteilung GETRENNT von der gelben internen Notiz.
 *  9. Tab Übersicht: Schritt 2 aus den Zeilen, Hinweis zur Führungskraft.
 * 10. „Neuer Austritt": Felder der Führungskraft im Body, 409 als Meldung.
 *
 * Umgebung wie in dokumentenpaket-dialog.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AbteilungenKarte,
  abteilungsAktionSenden,
  type AbteilungenKarteDaten,
  type AktionsMeldung,
} from "@/components/abteilungsaufgaben/abteilungen-karte";
import {
  abteilungsZeilenBauen,
  type AbteilungsKonfig,
  type AufgabeFuerZeile,
  type FuehrungskraftDaten,
  type LinkFuerZeile,
} from "@/lib/abteilungsaufgaben";
import { TabChecklist } from "@/app/(portal)/dashboard/offboarding/[id]/tabs/tab-checklist";
import { TabOverview } from "@/app/(portal)/dashboard/offboarding/[id]/tabs/tab-overview";
import type {
  ChecklistItemData,
  OffboardingData,
} from "@/app/(portal)/dashboard/offboarding/[id]/types";
import { NeuerAustrittModal } from "@/components/neuer-austritt-modal";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Ohne App-Router-Kontext: ein schlichter Anker genuegt (Modal „Vorgang öffnen").
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children?: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// =============================================
// Fixtures — Zeilen mit der echten Server-Regel
// =============================================

/** 20.07.2027, 12:00 Uhr deutscher Zeit. */
const JETZT = new Date("2027-07-20T10:00:00.000Z");
const BEZUG = "2027-07-31T00:00:00.000Z";
const ORG = "org-minden";
const URL_BASIS = "https://hr.fes-credo.de/offboarding-tasks/";

const KONFIGS: AbteilungsKonfig[] = [
  { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo-gruppe.de", organizationId: null, isActive: true },
  { departmentKey: "FACILITY", departmentName: "Facility Management", email: "facility@credo-gruppe.de", organizationId: null, isActive: true },
];

const AUFGABEN: AufgabeFuerZeile[] = [
  { assigneeDepartment: "IT", isCompleted: true, dueDate: "2027-07-29T00:00:00.000Z" },
  { assigneeDepartment: "IT", isCompleted: false, dueDate: "2027-07-31T00:00:00.000Z" },
  { assigneeDepartment: "FACILITY", isCompleted: false, dueDate: "2027-07-31T00:00:00.000Z" },
  { assigneeDepartment: "VERWALTUNG", isCompleted: false, dueDate: "2027-07-30T00:00:00.000Z" },
  { assigneeDepartment: "VORGESETZTER", isCompleted: false, dueDate: "2027-07-24T00:00:00.000Z" },
  { assigneeDepartment: "HR", isCompleted: false, dueDate: null },
];

function linkIt(teil: Partial<LinkFuerZeile> = {}): LinkFuerZeile {
  return {
    id: "link-it",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@credo-gruppe.de",
    token: "tok-it",
    sentAt: "2027-07-12T08:00:00.000Z",
    lastSentAt: "2027-07-12T08:00:00.000Z",
    firstOpenedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    allTasksComplete: false,
    completedAt: null,
    expiresAt: "2027-10-30T00:00:00.000Z",
    lastReminderAt: null,
    reminderCount: 0,
    lastSendStatus: "SENT",
    lastSendDetail: null,
    zugestelltAn: "it@credo-gruppe.de",
    ...teil,
  };
}

function daten(opts: {
  links?: LinkFuerZeile[];
  fuehrungskraft?: FuehrungskraftDaten | null;
  aufgaben?: AufgabeFuerZeile[];
  abgeschlossen?: boolean;
} = {}): AbteilungenKarteDaten {
  const abgeschlossen = opts.abgeschlossen ?? false;
  const r = abteilungsZeilenBauen({
    aufgaben: opts.aufgaben ?? AUFGABEN,
    links: opts.links ?? [],
    konfigs: KONFIGS,
    organizationId: ORG,
    fuehrungskraft: opts.fuehrungskraft ?? null,
    vorgangAbgeschlossen: abgeschlossen,
    linkUrl: (t) => `${URL_BASIS}${t}`,
    jetzt: JETZT,
  });
  return { ...r, vorgangAbgeschlossen: abgeschlossen, bezugsdatum: BEZUG };
}

function karte(d: AbteilungenKarteDaten, extra: Partial<React.ComponentProps<typeof AbteilungenKarte>> = {}) {
  const onAktion = jest.fn().mockResolvedValue(undefined);
  const onFuehrungskraftEintragen = jest.fn();
  render(
    <AbteilungenKarte
      abteilungen={d}
      onAktion={onAktion}
      onFuehrungskraftEintragen={onFuehrungskraftEintragen}
      jetzt={JETZT}
      {...extra}
    />,
  );
  return { onAktion, onFuehrungskraftEintragen };
}

const zeile = (key: string) => document.querySelector(`[data-zeile="${key}"]`) as HTMLElement;
const knopf = (name: string | RegExp) => screen.queryByRole("button", { name });
const seitentext = () => document.body.textContent ?? "";

// =============================================
// 1. Hauptknopf
// =============================================

describe("Hauptknopf", () => {
  it("heißt „Abteilungen informieren“, solange niemand informiert ist", () => {
    const d = daten();
    expect(d.niemandInformiert).toBe(true);
    expect(d.informierbar).toBe(2); // IT und Facility; Verwaltung ohne Adresse, Führungskraft fehlt
    karte(d);
    expect(knopf("Abteilungen informieren")).not.toBeNull();
  });

  it("zählt die noch offenen: „Weitere Abteilungen informieren (2)“", () => {
    // IT informiert; Facility und die (jetzt hinterlegte) Führungskraft fehlen noch.
    karte(daten({ links: [linkIt()], fuehrungskraft: { email: "leitung@fes-minden.de", name: "Anna Leitung" } }));
    expect(knopf("Weitere Abteilungen informieren (2)")).not.toBeNull();
    expect(knopf("Abteilungen informieren")).toBeNull();
  });

  it("verschwindet, wenn niemand mehr zu informieren ist", () => {
    karte(
      daten({
        aufgaben: AUFGABEN.filter((a) => a.assigneeDepartment === "IT" || a.assigneeDepartment === "HR"),
        links: [linkIt()],
      }),
    );
    expect(knopf(/Abteilungen informieren/)).toBeNull();
  });

  it("schickt „informieren“ ohne Abteilung und zeigt „Wird gesendet…“, bis die Aktion fertig ist", async () => {
    let fertig!: () => void;
    const onAktion = jest.fn(() => new Promise<void>((r) => (fertig = r)));
    karte(daten(), { onAktion });
    await act(async () => {
      fireEvent.click(knopf("Abteilungen informieren")!);
    });
    expect(onAktion).toHaveBeenCalledWith("informieren", undefined);
    expect(knopf("Wird gesendet…")).not.toBeNull();
    // Doppelklick waehrend des Versands: kein zweiter Aufruf.
    fireEvent.click(knopf("Wird gesendet…")!);
    expect(onAktion).toHaveBeenCalledTimes(1);
    await act(async () => fertig());
    expect(knopf("Abteilungen informieren")).not.toBeNull();
  });
});

// =============================================
// 2. Luecken sind sichtbar
// =============================================

describe("Zeilen ohne Versand", () => {
  it("Führungskraft ohne Adresse: gelbe Zeile mit „Eintragen“", () => {
    const { onFuehrungskraftEintragen } = karte(daten());
    const z = zeile("VORGESETZTER");
    expect(z.getAttribute("data-art")).toBe("fuehrungskraft-fehlt");
    expect(z.textContent).toContain("Keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen");
    fireEvent.click(within(z).getByRole("button", { name: "Eintragen" }));
    expect(onFuehrungskraftEintragen).toHaveBeenCalledTimes(1);
  });

  it("übersprungene Abteilung: gelb, mit Name und Grund", () => {
    karte(daten());
    const z = zeile("VERWALTUNG");
    expect(z.getAttribute("data-art")).toBe("uebersprungen");
    expect(z.textContent).toContain(
      "Verwaltung / Sekretariat · keine aktive Adresse hinterlegt (Einstellungen → Abteilungen)",
    );
    expect(z.className).toContain("credo-gelb");
  });

  it("noch nicht informierte Abteilung: graue Pill, Aufgabenzahl, keine Aktionen", () => {
    karte(daten());
    const z = zeile("IT");
    expect(z.textContent).toContain("it@credo-gruppe.de");
    expect(z.textContent).toContain("2 Aufgaben, 1 offen");
    expect(z.querySelector("[data-status]")?.textContent).toBe("Noch nicht informiert");
    expect(within(z).queryByRole("button", { name: "Erinnern" })).toBeNull();
    expect(within(z).queryByRole("button", { name: "Link kopieren" })).toBeNull();
  });

  it("Führungskraft mit Adresse: „leitung@… (Name)“, Quelle aus der Zeugnis-Bewertung", () => {
    karte(daten({ fuehrungskraft: { email: "leitung@fes-minden.de", name: "Anna Leitung" } }), {
      fuehrungskraft: { email: "leitung@fes-minden.de", name: "Anna Leitung", quelle: "ZEUGNIS" },
    });
    const z = zeile("VORGESETZTER");
    expect(z.textContent).toContain("leitung@fes-minden.de (Anna Leitung)");
    expect(z.textContent).toContain("aus der Zeugnis-Bewertung");
  });

  it("ohne jede Abteilungsaufgabe: Hinweis auf die Checklisten-Vorlagen", () => {
    karte(daten({ aufgaben: [{ assigneeDepartment: "HR", isCompleted: false, dueDate: null }] }));
    expect(seitentext()).toContain(
      "In dieser Checkliste ist keine Aufgabe einer Abteilung zugeordnet. Zuständigkeiten legen Sie in den Checklisten-Vorlagen fest.",
    );
  });

  it("zeigt Gültigkeit und Erinnerungen als Zusatzzeile", () => {
    karte(daten({ links: [linkIt({ reminderCount: 1, lastReminderAt: "2027-07-15T08:00:00.000Z" })] }));
    expect(zeile("IT").textContent).toContain("Link gültig bis 30.10.2027 · 1 Erinnerung, zuletzt 15.07.2027");
  });

  it("fehlgeschlagener Versand: rote Pill und rote Hinweiszeile mit dem Grund", () => {
    karte(
      daten({
        links: [linkIt({ sentAt: null, lastSentAt: null, lastSendStatus: "FAILED", lastSendDetail: "SMTP-Server nicht erreichbar" })],
      }),
    );
    const z = zeile("IT");
    expect(z.querySelector("[data-status]")?.textContent).toBe("Versand fehlgeschlagen");
    expect(z.querySelector('[data-hinweis="rot"]')?.textContent).toContain("SMTP-Server nicht erreichbar");
    // Erneut senden ja, Erinnern nein (nie zugestellt).
    expect(within(z).queryByRole("button", { name: "Erneut senden" })).not.toBeNull();
    expect(within(z).queryByRole("button", { name: "Erinnern" })).toBeNull();
  });
});

// =============================================
// 3. Sperrzeit
// =============================================

describe("Sperrzeit nach einem Versand", () => {
  it("graut Erinnern und Erneut senden aus, mit Uhrzeit im Tooltip", () => {
    // Vor zwei Minuten erneut gesendet → gesperrt bis 10:08 UTC = 12:08 Uhr.
    const d = daten({ links: [linkIt({ lastSentAt: "2027-07-20T09:58:00.000Z" })] });
    expect(d.zeilen.find((z) => z.departmentKey === "IT")?.aktionen.erinnern).toBe(false);
    const { onAktion } = karte(d);
    const z = zeile("IT");
    const erinnern = within(z).getByRole("button", { name: "Erinnern" }) as HTMLButtonElement;
    const erneut = within(z).getByRole("button", { name: "Erneut senden" }) as HTMLButtonElement;
    expect(erinnern.disabled).toBe(true);
    expect(erneut.disabled).toBe(true);
    expect(erinnern.title).toBe("Bitte kurz warten (bis 12:08 Uhr).");
    fireEvent.click(erinnern);
    expect(onAktion).not.toHaveBeenCalled();
  });

  it("ohne Sperre löst „Erinnern“ die Aktion für genau diese Abteilung aus", async () => {
    const { onAktion } = karte(daten({ links: [linkIt()] }));
    await act(async () => {
      fireEvent.click(within(zeile("IT")).getByRole("button", { name: "Erinnern" }));
    });
    expect(onAktion).toHaveBeenCalledWith("erinnern", "IT");
  });
});

// =============================================
// 4. Link kopieren
// =============================================

describe("Link kopieren", () => {
  it("kopiert die Adresse des Servers, nicht window.location", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    karte(daten({ links: [linkIt()] }));
    await act(async () => {
      fireEvent.click(within(zeile("IT")).getByRole("button", { name: "Link kopieren" }));
    });
    expect(writeText).toHaveBeenCalledWith("https://hr.fes-credo.de/offboarding-tasks/tok-it");
    expect(writeText.mock.calls[0][0]).not.toContain(window.location.origin);
    expect(within(zeile("IT")).getByRole("button", { name: "Kopiert!" })).not.toBeNull();
  });
});

// =============================================
// 5. Link erneuern (Rueckfrage)
// =============================================

describe("Link erneuern…", () => {
  async function dialogOeffnen() {
    const aktionen = karte(daten({ links: [linkIt()] }));
    fireEvent.click(screen.getByRole("button", { name: "Weitere Aktionen für IT-Abteilung" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Link erneuern…" }));
    return aktionen;
  }

  it("fragt mit den Texten des Vertrags nach", async () => {
    await dialogOeffnen();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Link der IT-Abteilung erneuern?");
    expect(dialog.textContent).toContain(
      "Der bisherige Link wird sofort ungültig. IT-Abteilung erhält eine neue E-Mail mit neuem Link an it@credo-gruppe.de.",
    );
    expect(within(dialog).getByRole("button", { name: "Abbrechen" })).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Link erneuern und senden" })).not.toBeNull();
  });

  it("„Abbrechen“ löst nichts aus", async () => {
    const { onAktion } = await dialogOeffnen();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAktion).not.toHaveBeenCalled();
  });

  it("erst die Bestätigung löst „link-erneuern“ aus", async () => {
    const { onAktion } = await dialogOeffnen();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Link erneuern und senden" }));
    });
    expect(onAktion).toHaveBeenCalledWith("link-erneuern", "IT");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("bei erledigter Abteilung nicht angeboten (der Server lehnt ab, die Mail listete nur Erledigtes)", () => {
    const erledigt = AUFGABEN.map((a) => (a.assigneeDepartment === "IT" ? { ...a, isCompleted: true } : a));
    karte(daten({ aufgaben: erledigt, links: [linkIt({ allTasksComplete: true, completedAt: "2027-07-19T08:00:00.000Z" })] }));
    expect(screen.queryByRole("button", { name: "Weitere Aktionen für IT-Abteilung" })).toBeNull();
    expect(within(zeile("IT")).queryByRole("button", { name: "Erneut senden" })).toBeNull();
    // Link kopieren bleibt.
    expect(within(zeile("IT")).queryByRole("button", { name: "Link kopieren" })).not.toBeNull();
  });
});

// =============================================
// 6. Meldungen nach einer Aktion
// =============================================

describe("Meldungen nach einer Aktion", () => {
  const ROUTE = "/api/offboarding/vorgang-1/department-links";
  let anfragen: { url: string; init: RequestInit }[] = [];

  function antwortet(status: number, body: unknown) {
    anfragen = [];
    global.fetch = jest.fn((url: string, init: RequestInit) => {
      anfragen.push({ url: String(url), init });
      return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
    }) as unknown as typeof fetch;
  }

  /** Wie die Detailseite: Zustand halten, Route rufen, Meldung zeigen. */
  function Seite({ d }: { d: AbteilungenKarteDaten }) {
    const [meldung, setMeldung] = useState<AktionsMeldung | null>(null);
    return (
      <AbteilungenKarte
        abteilungen={d}
        jetzt={JETZT}
        meldung={meldung}
        onMeldungSchliessen={() => setMeldung(null)}
        onAktion={async (aktion, key) => setMeldung(await abteilungsAktionSenden(ROUTE, aktion, key))}
      />
    );
  }

  it("201: grüne Leiste mit der Meldung, gelbe mit dem Hinweis; Body {}", async () => {
    antwortet(201, {
      data: { aktion: "informieren", versendet: [], uebersprungen: [] },
      meldung: "2 Abteilungen informiert: IT-Abteilung, Facility Management.",
      hinweis: "Nicht informiert: Führungskraft (keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen).",
    });
    render(<Seite d={daten()} />);
    await act(async () => {
      fireEvent.click(knopf("Abteilungen informieren")!);
    });
    expect(anfragen[0].url).toBe(ROUTE);
    expect(JSON.parse(String(anfragen[0].init.body))).toEqual({});
    const status = screen.getAllByRole("status");
    const gruen = status.find((s) => s.getAttribute("data-art") === "erfolg")!;
    const gelb = status.find((s) => s.getAttribute("data-art") === "hinweis")!;
    expect(gruen.textContent).toBe("2 Abteilungen informiert: IT-Abteilung, Facility Management.");
    expect(gelb.textContent).toContain("Nicht informiert: Führungskraft");
    fireEvent.click(screen.getByRole("button", { name: "Meldung schließen" }));
    expect(document.querySelector('[data-testid="aktions-meldungen"]')).toBeNull();
  });

  it("409: rote Leiste mit dem Text des Servers", async () => {
    antwortet(409, {
      error: "Es wurde niemand informiert. IT-Abteilung: keine aktive Adresse hinterlegt (Einstellungen → Abteilungen).",
      meldung: "Es wurde niemand informiert. IT-Abteilung: keine aktive Adresse hinterlegt (Einstellungen → Abteilungen).",
      hinweis: null,
    });
    render(<Seite d={daten()} />);
    await act(async () => {
      fireEvent.click(knopf("Abteilungen informieren")!);
    });
    const rot = screen.getByRole("alert");
    expect(rot.getAttribute("data-art")).toBe("fehler");
    expect(rot.textContent).toContain("Es wurde niemand informiert.");
  });

  it("Erinnern schickt { aktion, departmentKey }", async () => {
    antwortet(201, { meldung: "Erinnerung an IT-Abteilung gesendet.", hinweis: null });
    render(<Seite d={daten({ links: [linkIt()] })} />);
    await act(async () => {
      fireEvent.click(within(zeile("IT")).getByRole("button", { name: "Erinnern" }));
    });
    expect(JSON.parse(String(anfragen[0].init.body))).toEqual({ aktion: "erinnern", departmentKey: "IT" });
    expect(seitentext()).toContain("Erinnerung an IT-Abteilung gesendet.");
  });

  it("Netzfehler: rote Leiste statt stiller Erfolg", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    const m = await abteilungsAktionSenden(ROUTE, "informieren");
    expect(m).toEqual({ art: "fehler", meldung: "Verbindungsfehler beim Versenden.", hinweis: null });
  });

  it("403 ohne Bericht: zeigt den Fehlertext des Servers", async () => {
    antwortet(403, { error: "Keine Berechtigung" });
    const m = await abteilungsAktionSenden(ROUTE, "erneut-senden", "IT");
    expect(m).toEqual({ art: "fehler", meldung: "Keine Berechtigung", hinweis: null });
    expect(JSON.parse(String(anfragen[0].init.body))).toEqual({ aktion: "erneut-senden", departmentKey: "IT" });
  });
});

// =============================================
// 7. Abgeschlossen / ohne Recht
// =============================================

describe("nur lesen", () => {
  it("abgeschlossener Vorgang: Hinweis, kein Hauptknopf, nur „Link kopieren“", () => {
    karte(daten({ links: [linkIt()], abgeschlossen: true }));
    expect(seitentext()).toContain(
      "Der Vorgang ist abgeschlossen. Abteilungen können nicht mehr informiert werden.",
    );
    expect(knopf(/Abteilungen informieren/)).toBeNull();
    const z = zeile("IT");
    expect(within(z).queryByRole("button", { name: "Erinnern" })).toBeNull();
    expect(within(z).queryByRole("button", { name: "Erneut senden" })).toBeNull();
    expect(within(z).queryByRole("button", { name: /Weitere Aktionen/ })).toBeNull();
    expect(within(z).queryByRole("button", { name: "Link kopieren" })).not.toBeNull();
    // Auch „Eintragen" fehlt — der Vorgang ist zu.
    expect(knopf("Eintragen")).toBeNull();
  });

  it("abgebrochener Vorgang nennt den Abbruch", () => {
    karte(daten({ abgeschlossen: true }), { abgebrochen: true });
    expect(seitentext()).toContain(
      "Der Vorgang wurde abgebrochen. Abteilungen können nicht mehr informiert werden.",
    );
  });

  it("Rolle ohne Bearbeitungsrecht: keine Versand-Aktionen", () => {
    karte(daten({ links: [linkIt()] }), { darfAktionen: false });
    expect(knopf(/Abteilungen informieren/)).toBeNull();
    expect(within(zeile("IT")).queryByRole("button", { name: "Erinnern" })).toBeNull();
    expect(within(zeile("IT")).queryByRole("button", { name: "Link kopieren" })).not.toBeNull();
  });
});

// =============================================
// 8. Aufgabenkarte der Checkliste
// =============================================

describe("Aufgabenkarte (Tab Checkliste)", () => {
  function aufgabe(teil: Partial<ChecklistItemData>): ChecklistItemData {
    return {
      id: "a1",
      title: "IT-Zugänge und E-Mail-Konto sperren",
      category: "Phase 5: Letzter Tag",
      orderIndex: 1,
      description: null,
      assigneeDepartment: "IT",
      isCompleted: false,
      completedAt: null,
      completedById: null,
      dueDate: "2027-07-31T00:00:00.000Z",
      notes: null,
      abteilungKommentar: null,
      abteilungKommentarAm: null,
      erledigtVon: null,
      ...teil,
    };
  }

  function checkliste(items: ChecklistItemData[], d: AbteilungenKarteDaten = daten({ links: [linkIt()] })) {
    render(
      <TabChecklist
        checklistItems={items}
        togglingItems={new Set()}
        toggleChecklistItem={jest.fn()}
        editingChecklistNoteId={null}
        setEditingChecklistNoteId={jest.fn()}
        checklistNoteText=""
        setChecklistNoteText={jest.fn()}
        savingChecklistNote={false}
        saveChecklistNote={jest.fn()}
        abteilungen={d}
        onAbteilungsAktion={jest.fn()}
      />,
    );
  }

  const karteVon = (id: string) => document.querySelector(`[data-aufgabe="${id}"]`) as HTMLElement;

  it("Urheber: „erledigt von IT-Abteilung (Link)“ bzw. „erledigt im Portal von …“", () => {
    checkliste([
      aufgabe({
        id: "link",
        isCompleted: true,
        completedAt: "2027-07-29T08:14:00.000Z",
        erledigtVon: { art: "LINK", name: "IT-Abteilung" },
      }),
      aufgabe({
        id: "portal",
        isCompleted: true,
        completedAt: "2027-07-29T08:14:00.000Z",
        completedById: "u1",
        erledigtVon: { art: "PORTAL", name: "Erika Muster" },
      }),
      aufgabe({ id: "alt", isCompleted: true, completedAt: "2027-07-29T08:14:00.000Z", assigneeDepartment: "HR" }),
    ]);
    expect(karteVon("link").querySelector("[data-urheber]")?.textContent).toBe(
      "erledigt von IT-Abteilung (Link) am 29.07.2027, 10:14",
    );
    expect(karteVon("portal").querySelector("[data-urheber]")?.textContent).toBe(
      "erledigt im Portal von Erika Muster am 29.07.2027, 10:14",
    );
    expect(karteVon("alt").querySelector("[data-urheber]")?.textContent).toBe("am 29.07.2027");
  });

  it("blaue Box: Kommentar der Abteilung; gelbe Box: interne Notiz — getrennt", () => {
    checkliste([
      aufgabe({
        abteilungKommentar: "Konto gesperrt, Postfach an die Schulleitung weitergeleitet.",
        abteilungKommentarAm: "2027-07-29T08:14:00.000Z",
        notes: "Rücksprache mit der Schulleitung wegen Postfach",
      }),
    ]);
    const k = karteVon("a1");
    const blau = k.querySelector('[data-box="abteilungskommentar"]') as HTMLElement;
    const gelb = k.querySelector('[data-box="interne-notiz"]') as HTMLElement;
    expect(blau.textContent).toBe(
      "Kommentar IT-Abteilung, 29.07.2027: Konto gesperrt, Postfach an die Schulleitung weitergeleitet.",
    );
    expect(gelb.textContent).toContain("Interne Notiz (nur im Portal)");
    expect(gelb.textContent).toContain("Rücksprache mit der Schulleitung wegen Postfach");
    expect(blau.textContent).not.toContain("Rücksprache");
    expect(gelb.textContent).not.toContain("Konto gesperrt");
  });

  it("maskiert den Kommentar der Abteilung (React, kein HTML)", () => {
    checkliste([aufgabe({ abteilungKommentar: "<img src=x onerror=alert(1)>", abteilungKommentarAm: null })]);
    const blau = karteVon("a1").querySelector('[data-box="abteilungskommentar"]') as HTMLElement;
    expect(blau.querySelector("img")).toBeNull();
    expect(blau.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("Badge mit dem Anzeigenamen aus der Karte (eigener Schlüssel), sonst dem Label", () => {
    const d = daten({
      aufgaben: [{ assigneeDepartment: "EMPFANG", isCompleted: false, dueDate: null }],
      links: [linkIt({ id: "l-e", departmentKey: "EMPFANG", departmentName: "Empfang FES Minden", token: "tok-e" })],
    });
    checkliste(
      [
        aufgabe({ id: "e", assigneeDepartment: "EMPFANG" }),
        aufgabe({ id: "v", assigneeDepartment: "VORGESETZTER" }),
      ],
      d,
    );
    expect(karteVon("e").textContent).toContain("Empfang FES Minden");
    expect(karteVon("e").textContent).not.toContain("EMPFANG");
    expect(karteVon("v").textContent).toContain("Führungskraft");
    expect(karteVon("v").textContent).toContain("Fällig: 31.07.2027");
  });
});

// =============================================
// 9. Tab Übersicht
// =============================================

describe("Tab Übersicht", () => {
  function vorgang(teil: Partial<OffboardingData> = {}): OffboardingData {
    return {
      id: "vorgang-1",
      displayId: "OFF-2027-GYM-014",
      employeeEmail: "max.mustermann@fes-minden.de",
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      employeePersonalNr: null,
      employeePrivateEmail: null,
      exitType: "KUENDIGUNG_ARBEITNEHMER",
      exitReason: null,
      noticeDate: null,
      lastWorkingDay: BEZUG,
      contractEndDate: null,
      noticePeriodEnd: null,
      status: "NOTICE_PERIOD",
      initiatedAt: "2027-06-01T00:00:00.000Z",
      completedAt: null,
      dataRetentionDate: null,
      organization: { id: ORG, name: "FES Minden", mandantNumber: "10" },
      exitData: null,
      returnItems: [],
      documents: [],
      checklistItems: [],
      notes: [],
      departmentLinks: [],
      supervisorEmail: null,
      supervisorName: null,
      fuehrungskraft: { email: null, name: null, quelle: null },
      abteilungen: daten(),
      ...teil,
    };
  }

  function uebersicht(d: OffboardingData) {
    render(
      <TabOverview
        data={d}
        editingField={null}
        editingValue=""
        savingField={false}
        setEditingField={jest.fn()}
        setEditingValue={jest.fn()}
        handleFieldSave={jest.fn()}
        onNavigateTab={jest.fn()}
      />,
    );
  }

  it("Schritt 2: Einträge aus den Zeilen mit Kurz-Status und Hinweis ohne Versand", () => {
    uebersicht(vorgang());
    const text = seitentext();
    expect(text).toContain("Aufgaben per Link an Abteilungen und Führungskraft verteilen");
    expect(text).toContain("Noch keine Abteilung informiert – im Tab Checkliste „Abteilungen informieren“ wählen.");
    expect(text).toContain("IT-Abteilung");
    expect(text).toContain("Verwaltung / Sekretariat");
    expect(text).toContain("Ausstehend");
    expect(text).toContain("Übersprungen");
    // Fortschritt: keine Zeile ist fertig.
    expect(text).toContain("0/4");
    // Nie der Rohschluessel.
    expect(text).not.toContain("VERWALTUNG");
  });

  it("Führungskraft aus der Zeugnis-Bewertung: grauer Hinweis, solange nichts eingetragen ist", () => {
    uebersicht(
      vorgang({ fuehrungskraft: { email: "chef@fes-minden.de", name: "Karl Chef", quelle: "ZEUGNIS" } }),
    );
    expect(document.querySelector('[data-hinweis="fuehrungskraft-quelle"]')?.textContent).toBe(
      "Verwendet wird chef@fes-minden.de aus der Zeugnis-Bewertung, solange hier nichts eingetragen ist.",
    );
    expect(seitentext()).toContain("E-Mail der Führungskraft");
    expect(seitentext()).toContain("Name der Führungskraft");
  });

  it("eingetragene Führungskraft: kein Quellen-Hinweis", () => {
    uebersicht(
      vorgang({
        supervisorEmail: "leitung@fes-minden.de",
        fuehrungskraft: { email: "leitung@fes-minden.de", name: null, quelle: "VORGANG" },
      }),
    );
    expect(document.querySelector('[data-hinweis="fuehrungskraft-quelle"]')).toBeNull();
    expect(seitentext()).toContain("leitung@fes-minden.de");
  });
});

// =============================================
// 10. „Neuer Austritt": Felder der Fuehrungskraft
// =============================================

describe("Neuer Austritt: Führungskraft", () => {
  let anlage: RequestInit | null = null;
  let anlageAntwort: { ok: boolean; status: number; body: unknown } = { ok: true, status: 201, body: {} };

  beforeEach(() => {
    anlage = null;
    anlageAntwort = { ok: true, status: 201, body: { id: "v1", displayId: "OFF-2027-GYM-015" } };
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (String(url) === "/api/organizations") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [{ id: ORG, mandantNumber: "10", name: "FES Minden", shortName: null, type: "GYMNASIUM" }] }),
        } as Response);
      }
      anlage = init ?? null;
      return Promise.resolve({
        ok: anlageAntwort.ok,
        status: anlageAntwort.status,
        json: async () => anlageAntwort.body,
      } as Response);
    }) as unknown as typeof fetch;
  });

  async function ausfuellen(fuehrungskraft: { email: string; name: string }) {
    await act(async () => {
      render(<NeuerAustrittModal open onClose={jest.fn()} onCreated={jest.fn()} />);
    });
    const tippe = (label: RegExp, wert: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value: wert } });
    tippe(/^Vorname/, "Max");
    tippe(/^Nachname/, "Mustermann");
    tippe(/^Dienst-E-Mail/, "max.mustermann@fes-minden.de");
    tippe(/^Einrichtung/, ORG);
    tippe(/^Austrittsart/, "KUENDIGUNG_ARBEITNEHMER");
    tippe(/^Letzter Arbeitstag/, "2027-07-31");
    tippe(/^E-Mail der Führungskraft/, fuehrungskraft.email);
    tippe(/^Name der Führungskraft/, fuehrungskraft.name);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Austritt anlegen" }));
    });
  }

  it("schickt Adresse und Namen getrimmt mit", async () => {
    await ausfuellen({ email: "  leitung@fes-minden.de ", name: " Anna Leitung " });
    const body = JSON.parse(String(anlage?.body));
    expect(body.supervisorEmail).toBe("leitung@fes-minden.de");
    expect(body.supervisorName).toBe("Anna Leitung");
  });

  it("lässt leere Felder weg", async () => {
    await ausfuellen({ email: "   ", name: "" });
    const body = JSON.parse(String(anlage?.body));
    expect("supervisorEmail" in body).toBe(false);
    expect("supervisorName" in body).toBe(false);
  });

  it("zeigt die 409 der Freigabeliste im Formular", async () => {
    const text =
      "Die Adresse der Führungskraft liegt in keiner freigegebenen Domain (Einstellungen → SMTP → Erlaubte Empfänger-Domains). Bitte eine dienstliche Adresse eintragen.";
    anlageAntwort = { ok: false, status: 409, body: { error: text } };
    await ausfuellen({ email: "chef@gmail.com", name: "" });
    expect(seitentext()).toContain(text);
    expect(screen.getByLabelText(/^E-Mail der Führungskraft/)).not.toBeNull();
  });

  it("Hilfetext und Platzhalter wie im Vertrag", async () => {
    await act(async () => {
      render(<NeuerAustrittModal open onClose={jest.fn()} onCreated={jest.fn()} />);
    });
    const feld = screen.getByLabelText(/^E-Mail der Führungskraft/) as HTMLInputElement;
    expect(feld.placeholder).toBe("leitung@einrichtung.de");
    expect((screen.getByLabelText(/^Name der Führungskraft/) as HTMLInputElement).placeholder).toBe(
      "z.B. Anna Leitung",
    );
    expect(seitentext()).toContain(
      "Bekommt die Aufgaben mit der Zuständigkeit „Führungskraft“ per Link. Später im Tab Übersicht änderbar.",
    );
  });
});
