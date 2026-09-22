/**
 * @jest-environment jsdom
 */

/**
 * Dialog „Neuer Onboarding-Vorgang": Name und Fuehrungskraft schon beim Anlegen.
 *
 * Was hier belegt wird, sitzt in der React-Verdrahtung selbst und laesst sich
 * mit den Routentests nicht zeigen:
 *
 *  1. Der Rumpf. Leere oder nur aus Leerzeichen bestehende Felder gehen gar
 *     nicht erst hinaus — der Server bekaeme sonst "" statt „nicht angegeben".
 *  2. Das Recht. Ohne `darfVorgesetztenLink` gibt es den Block „Führungskraft"
 *     nicht (der Server wiese das Feld mit 403 ab).
 *  3. Die Erfolgsansicht. Vorgangsnummer, Versand je Link, beide Links zum
 *     Kopieren und das Ablaufdatum aus der Antwort — nicht fest „30 Tage",
 *     und kein n8n-Hinweis mehr.
 *  4. Das Zuruecksetzen. Escape ging frueher an `onClose` vorbei an
 *     `handleClose`: Beim naechsten Oeffnen standen die alten Eingaben da —
 *     mit Namen und Fuehrungskraft ein Vorgang mit fremden Angaben.
 *  5. Der Doppelklick. Zwei Submits vor dem neuen Rendern ergaeben zwei
 *     Vorgaenge und bis zu vier Mails; die Sperre per Ref haelt das auf.
 *
 * Umgebung wie in dokumentenpaket-dialog.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NeuerVorgangModal } from "@/components/neuer-vorgang-modal";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Ohne App-Router-Kontext: ein schlichter Anker genuegt fuer die Zusicherungen.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

// =============================================
// Fixtures
// =============================================

const ORG = {
  id: "org-gym",
  mandantNumber: "10",
  name: "FES Gymnasium",
  shortName: "GYM",
  type: "SCHULE",
};

function antwort(teil: Record<string, unknown> = {}) {
  return {
    id: "vorgang-1",
    displayId: "2026-GYM-014",
    email: "anna.privat@example.org",
    firstName: "Anna",
    lastName: null,
    fragebogenLink: "https://hr.example.org/fragebogen/fb-token",
    organization: { id: ORG.id, name: ORG.name, mandantNumber: ORG.mandantNumber },
    status: "INVITED",
    tokenExpiresAt: "2026-10-22T08:00:00.000Z",
    createdAt: "2026-09-22T08:00:00.000Z",
    mailVersand: "SENT",
    vorgesetzter: null,
    ...teil,
  };
}

const MIT_FUEHRUNGSKRAFT = {
  supervisorEmail: "schulleitung@example.org",
  modalitaetenLink: "https://hr.example.org/modalitaeten/mod-token",
  supervisorTokenExpiresAt: "2026-10-29T08:00:00.000Z",
  mailVersand: "SENT",
};

// =============================================
// Netz: /api/organizations antwortet sofort, das Anlegen erst auf Zuruf
// =============================================

interface Anlegeaufruf {
  init: RequestInit;
  antworte: (koerper: unknown, ok?: boolean) => void;
}

let anlegeaufrufe: Anlegeaufruf[] = [];

beforeEach(() => {
  anlegeaufrufe = [];
  global.fetch = jest.fn((url: string, init: RequestInit) => {
    if (String(url) === "/api/organizations") {
      return Promise.resolve({ ok: true, json: async () => ({ data: [ORG] }) } as Response);
    }
    // Bewusst offen: Der Test bestimmt, wann das Anlegen antwortet — sonst
    // liesse sich weder die Sperre waehrend der Anfrage noch der Doppelklick
    // pruefen.
    return new Promise((aufloesen) => {
      anlegeaufrufe.push({
        init,
        antworte: (koerper, ok = true) => aufloesen({ ok, json: async () => koerper } as Response),
      });
    });
  }) as unknown as typeof fetch;
});

// =============================================
// Helfer
// =============================================

interface Optionen {
  darfVorgesetztenLink?: boolean;
}

async function zeigeModal({ darfVorgesetztenLink = true }: Optionen = {}) {
  const onClose = jest.fn();
  const onCreated = jest.fn();
  const element = (open: boolean) => (
    <NeuerVorgangModal
      open={open}
      onClose={onClose}
      onCreated={onCreated}
      darfVorgesetztenLink={darfVorgesetztenLink}
    />
  );
  let ergebnis!: ReturnType<typeof render>;
  // async act: Die Einrichtungen muessen geladen sein, sonst gibt es die
  // Option im Auswahlfeld nicht.
  await act(async () => {
    ergebnis = render(element(true));
  });
  const oeffne = async (open: boolean) => {
    await act(async () => {
      ergebnis.rerender(element(open));
    });
  };
  return { onClose, onCreated, oeffne };
}

const feld = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const EMAIL = /E-Mail des neuen Mitarbeiters/;
const VORNAME = /^Vorname/;
const NACHNAME = /^Nachname/;
const EINRICHTUNG = /Einrichtung/;
const FUEHRUNGSKRAFT = /E-Mail der Führungskraft/;

function tippe(label: RegExp, wert: string) {
  fireEvent.change(feld(label), { target: { value: wert } });
}

/** Pflichtfelder so fuellen, dass die Formularpruefung von jsdom durchlaesst. */
function pflichtfelder() {
  tippe(EMAIL, "anna.privat@example.org");
  fireEvent.change(screen.getByLabelText(EINRICHTUNG), { target: { value: ORG.id } });
}

/** Der Absende-Knopf — waehrend der Anfrage heisst er „Wird angelegt...". */
const anlegeKnopf = () =>
  document.querySelector('form button[type="submit"]') as HTMLButtonElement;

async function absenden() {
  await act(async () => {
    fireEvent.click(anlegeKnopf());
  });
}

async function antworteMit(koerper: unknown, ok = true, index = 0) {
  await act(async () => {
    anlegeaufrufe[index].antworte(koerper, ok);
  });
}

const gesendet = (index = 0): Record<string, unknown> =>
  JSON.parse(String(anlegeaufrufe[index].init.body));

const seitentext = () => document.body.textContent ?? "";

// =============================================
// 1. Der Rumpf
// =============================================

describe("Absenden: optionale Felder nur, wenn etwas drinsteht", () => {
  it("laesst leere und nur aus Leerzeichen bestehende Felder weg", async () => {
    await zeigeModal();
    pflichtfelder();
    tippe(VORNAME, "   ");
    tippe(NACHNAME, "");
    tippe(FUEHRUNGSKRAFT, "");

    await absenden();

    expect(anlegeaufrufe).toHaveLength(1);
    const rumpf = gesendet();
    expect(Object.keys(rumpf).sort()).toEqual([
      "email",
      "organizationId",
      "processType",
      "questionnaireType",
    ]);
    expect(rumpf).toEqual({
      email: "anna.privat@example.org",
      organizationId: ORG.id,
      processType: "EINSTELLUNG",
      questionnaireType: "STANDARD",
    });
  });

  it("schickt Name und Fuehrungskraft getrimmt mit", async () => {
    await zeigeModal();
    pflichtfelder();
    tippe(VORNAME, "  Anna ");
    tippe(NACHNAME, " Beispiel  ");
    tippe(FUEHRUNGSKRAFT, "schulleitung@example.org");

    await absenden();

    expect(gesendet()).toMatchObject({
      firstName: "Anna",
      lastName: "Beispiel",
      supervisorEmail: "schulleitung@example.org",
    });
  });

  it("zeigt die Meldung des Servers und behaelt die Eingaben", async () => {
    const { onCreated } = await zeigeModal();
    pflichtfelder();
    tippe(VORNAME, "Anna");
    await absenden();

    await antworteMit({ error: "Organisation nicht gefunden" }, false);

    expect(screen.getByRole("alert").textContent).toBe("Organisation nicht gefunden");
    expect(feld(VORNAME).value).toBe("Anna");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("holt die Meldung in den Blick — auf dem Handy steht sie oberhalb des Sichtbereichs", async () => {
    // jsdom scrollt nicht; hier genuegt der Nachweis des Aufrufs.
    const vorher = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: scrollIntoView,
      configurable: true,
    });
    try {
      await zeigeModal();
      pflichtfelder();
      tippe(FUEHRUNGSKRAFT, "anna.privat@example.org");
      await absenden();

      await antworteMit(
        { error: "Die Führungskraft braucht eine eigene E-Mail-Adresse – nicht die der neuen Person." },
        false,
      );

      const meldung = screen.getByRole("alert");
      expect(document.activeElement).toBe(meldung);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(meldung);
    } finally {
      if (vorher) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", vorher);
      else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

// =============================================
// 2. Das Recht auf den Vorgesetzten-Link
// =============================================

describe("Block „Führungskraft\"", () => {
  it("fehlt ohne darfVorgesetztenLink — samt dem Hinweis auf „später\"", async () => {
    await zeigeModal({ darfVorgesetztenLink: false });

    expect(screen.queryByLabelText(FUEHRUNGSKRAFT)).toBeNull();
    expect(seitentext()).not.toContain("Führungskraft (optional)");

    pflichtfelder();
    await absenden();
    expect(gesendet()).not.toHaveProperty("supervisorEmail");

    await antworteMit(antwort());
    expect(seitentext()).toContain("Vorgang angelegt");
    expect(seitentext()).not.toContain("Einstellungsmodalitäten");
  });

  it("steht mit Recht da, und ohne Fuehrungskraft folgt der Hinweis auf „später\"", async () => {
    await zeigeModal({ darfVorgesetztenLink: true });

    expect(seitentext()).toContain("Führungskraft (optional)");
    expect(feld(FUEHRUNGSKRAFT).type).toBe("email");
    expect(seitentext()).toContain(
      "Ist sie eingetragen, bekommt die Führungskraft den Link zu den Einstellungsmodalitäten sofort, parallel zum Fragebogen. Sonst lässt sich der Link später jederzeit in der Übersicht erstellen.",
    );

    pflichtfelder();
    await absenden();
    await antworteMit(antwort());

    expect(seitentext()).toContain(
      "Den Link zu den Einstellungsmodalitäten können Sie später in der Übersicht des Vorgangs erstellen.",
    );
    expect(screen.queryByLabelText("Modalitäten-Link")).toBeNull();
  });
});

// =============================================
// 3. Die Erfolgsansicht
// =============================================

describe("Erfolgsansicht", () => {
  it("zeigt Vorgangsnummer, beide Versandzeilen, beide Links und das Ablaufdatum", async () => {
    const { onCreated } = await zeigeModal();
    pflichtfelder();
    tippe(FUEHRUNGSKRAFT, "schulleitung@example.org");
    await absenden();

    await antworteMit(antwort({ vorgesetzter: MIT_FUEHRUNGSKRAFT }));

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(seitentext()).toContain("Onboarding-Vorgang 2026-GYM-014 wurde angelegt.");
    expect(seitentext()).toContain(
      "Einladung zum Personalfragebogen an anna.privat@example.org versendet",
    );
    expect(seitentext()).toContain(
      "Link zu den Einstellungsmodalitäten an schulleitung@example.org versendet",
    );

    expect(feld(/^Fragebogen-Link$/).value).toBe("https://hr.example.org/fragebogen/fb-token");
    expect(feld(/^Modalitäten-Link$/).value).toBe("https://hr.example.org/modalitaeten/mod-token");
    expect(screen.getAllByRole("button", { name: "Kopieren" })).toHaveLength(2);

    // Jeder Link mit SEINER Frist aus der Antwort, deutsch formatiert. Zwei
    // verschiedene Daten im Fixture — eine Vertauschung fiele sonst nicht auf.
    const block = (label: RegExp) => feld(label).closest(".space-y-2")?.textContent ?? "";
    expect(block(/^Fragebogen-Link$/)).toContain("Gültig bis 22.10.2026");
    expect(block(/^Fragebogen-Link$/)).not.toContain("29.10.2026");
    expect(block(/^Modalitäten-Link$/)).toContain("Gültig bis 29.10.2026");
    expect(block(/^Modalitäten-Link$/)).not.toContain("22.10.2026");
    expect(seitentext()).toContain("Beide Seiten können unabhängig voneinander ausfüllen.");
    expect(screen.queryByRole("alert")).toBeNull();

    const zumVorgang = screen.getByRole("link", { name: "Zum Vorgang" }) as HTMLAnchorElement;
    expect(zumVorgang.getAttribute("href")).toBe("/dashboard/vorgang-1");
  });

  it("warnt je Link, wenn die Mail nicht hinausging (FAILED, SKIPPED)", async () => {
    await zeigeModal();
    pflichtfelder();
    tippe(FUEHRUNGSKRAFT, "schulleitung@example.org");
    await absenden();

    await antworteMit(
      antwort({
        mailVersand: "FAILED",
        vorgesetzter: { ...MIT_FUEHRUNGSKRAFT, mailVersand: "SKIPPED" },
      }),
    );

    const warnungen = screen.getAllByRole("alert").map((w) => w.textContent);
    expect(warnungen).toEqual([
      "Die E-Mail an anna.privat@example.org wurde nicht versendet. Bitte geben Sie den Link selbst weiter.",
      "Die E-Mail an schulleitung@example.org wurde nicht versendet. Bitte geben Sie den Link selbst weiter.",
    ]);
    expect(seitentext()).not.toContain("Einladung zum Personalfragebogen an");
    expect(seitentext()).not.toContain("Link zu den Einstellungsmodalitäten an");
    // Der Vorgang steht trotzdem — die Links sind da.
    expect(screen.getAllByRole("button", { name: "Kopieren" })).toHaveLength(2);
  });

  it("warnt auch ohne Versandergebnis (null)", async () => {
    await zeigeModal();
    pflichtfelder();
    await absenden();

    await antworteMit(antwort({ mailVersand: null }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Die E-Mail an anna.privat@example.org wurde nicht versendet.",
    );
  });

  it("nennt weder n8n noch eine fest eingetragene Gueltigkeit", async () => {
    await zeigeModal();
    expect(seitentext()).not.toMatch(/n8n/i);

    pflichtfelder();
    await absenden();
    await antworteMit(antwort({ vorgesetzter: MIT_FUEHRUNGSKRAFT }));

    expect(seitentext()).not.toMatch(/n8n/i);
    expect(seitentext()).not.toContain("30 Tage");
  });
});

// =============================================
// 4. Schliessen und Zuruecksetzen
// =============================================

describe("Schliessen", () => {
  it("setzt nach Escape alle Felder zurueck — auch Name und Fuehrungskraft", async () => {
    const { onClose, oeffne } = await zeigeModal();
    pflichtfelder();
    tippe(VORNAME, "Anna");
    tippe(NACHNAME, "Beispiel");
    tippe(FUEHRUNGSKRAFT, "schulleitung@example.org");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await oeffne(false);
    await oeffne(true);

    expect(feld(EMAIL).value).toBe("");
    expect(feld(VORNAME).value).toBe("");
    expect(feld(NACHNAME).value).toBe("");
    expect(feld(FUEHRUNGSKRAFT).value).toBe("");
    expect((screen.getByLabelText(EINRICHTUNG) as HTMLSelectElement).value).toBe("");
  });

  it("zeigt nach Escape in der Erfolgsansicht beim naechsten Oeffnen wieder das Formular", async () => {
    const { oeffne } = await zeigeModal();
    pflichtfelder();
    await absenden();
    await antworteMit(antwort());
    expect(seitentext()).toContain("Vorgang angelegt");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await oeffne(false);
    await oeffne(true);

    expect(seitentext()).toContain("Neuer Onboarding-Vorgang");
    expect(seitentext()).not.toContain("2026-GYM-014");
  });

  it("sperrt Escape, Hintergrund und Schliessen-Knopf, solange die Anfrage laeuft", async () => {
    const { onClose } = await zeigeModal();
    pflichtfelder();
    await absenden();
    expect(anlegeKnopf().disabled).toBe(true);
    expect(anlegeKnopf().textContent).toBe("Wird angelegt...");

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    const schliessen = screen.getByRole("button", { name: "Schließen" }) as HTMLButtonElement;
    expect(schliessen.disabled).toBe(true);
    await act(async () => {
      // Der Hintergrund ist das erste Kind des Dialogs.
      fireEvent.click(screen.getByRole("dialog").firstElementChild as Element);
    });
    expect(onClose).not.toHaveBeenCalled();

    // Nach der Antwort sind die Links zu sehen — genau dafuer die Sperre.
    await antworteMit(antwort());
    expect(seitentext()).toContain("Vorgang angelegt");
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// =============================================
// 5. Der Doppelklick
// =============================================

describe("Doppelklick", () => {
  it("fuehrt zu genau einer Anfrage, auch wenn beide Klicks vor dem neuen Rendern kommen", async () => {
    await zeigeModal();
    pflichtfelder();

    // Beide Klicks in EINEM act: React rendert erst danach neu, der Knopf ist
    // beim zweiten Klick also noch nicht gesperrt. Nur die Ref haelt ihn auf.
    await act(async () => {
      fireEvent.click(anlegeKnopf());
      fireEvent.click(anlegeKnopf());
    });
    expect(anlegeaufrufe).toHaveLength(1);

    // Ein spaeterer Klick trifft den gesperrten Knopf.
    await absenden();
    expect(anlegeaufrufe).toHaveLength(1);

    await antworteMit(antwort());
    expect(seitentext()).toContain("Vorgang angelegt");
  });
});

// =============================================
// Kopieren ohne HTTPS
// =============================================

describe("Kopieren", () => {
  it("faellt ohne Zwischenablage-API auf execCommand zurueck", async () => {
    // jsdom kennt navigator.clipboard nicht — genau wie ein Browser, der das
    // Portal per http aufruft.
    const execCommand = jest.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });

    await zeigeModal();
    pflichtfelder();
    await absenden();
    await antworteMit(antwort());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(seitentext()).toContain("Kopiert!");
    // Das Hilfsfeld raeumt sich wieder weg.
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
});
