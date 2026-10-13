/**
 * @jest-environment jsdom
 */

/**
 * Rückfrage „Vorgang abschließen?“ im Onboarding (Paket A3, Feinplan S19,
 * E-A19): src/components/ausstattung/abschluss-dialog.tsx und ihre
 * Verdrahtung in der Detailseite (detail-content.tsx).
 *
 * Belegt wird:
 *   1. Der Dialog: erster Schritt ohne Liste („Vorgang abschließen“ schickt
 *      ohne Bestätigung), zweiter Schritt mit der Liste des Servers
 *      („Trotzdem abschließen“ schickt `bestaetigt: true`), Meldung des
 *      Servers als Fehlerzeile, gesperrt während des Aufrufs.
 *   2. Der Aufruf (`abschlussSenden`): Body, 200, 409 AUSSTATTUNG_OFFEN mit
 *      Liste, andere Fehler mit dem Text des Servers, Verbindungsfehler.
 *   3. Die Detailseite: kein `window.confirm` mehr; erst der Dialog, dann die
 *      409 mit Liste, dann der bestätigte Abschluss und das Neuladen.
 *
 * Umgebung wie in den übrigen Komponententests: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  ABSCHLUSS_TEXTE,
  AbschlussDialog,
  abschlussSenden,
  type AbschlussDialogProps,
} from "@/components/ausstattung/abschluss-dialog";
import { DetailContent, type DetailData } from "@/app/(portal)/dashboard/[id]/detail-content";
import { abschlussOffenMeldung, type AbschlussOffeneAufgabe } from "@/lib/ausstattung";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, className }: { href: string; children?: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/onb-1",
}));

// Nachbarn mit eigenem Netzverkehr — fuer die Verdrahtung ohne Belang.
jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => <header data-testid="portal-header" />,
}));
jest.mock("@/components/dokumentenpaket-section", () => ({
  DokumentenpaketSection: () => <section data-testid="dokumentenpaket" />,
}));
jest.mock("@/components/template-generation-section", () => ({
  TemplateGenerationSection: () => <section data-testid="vorlagen" />,
}));
jest.mock("@/components/individuelle-mail/individuelle-mail-karte", () => ({
  IndividuelleMailKarte: () => <section data-testid="individuelle-mail" />,
}));

const OFFEN: AbschlussOffeneAufgabe[] = [
  { titel: "Dienst-iPad (Lernmittel) bereitstellen", stelle: "IT-Abteilung" },
  { titel: "Hinweis der Führungskraft beachten", stelle: "Hausmeister Grundschule" },
];

const dialog = () => screen.getByRole("dialog");
const knopfImDialog = (name: string | RegExp) => within(dialog()).getByRole("button", { name }) as HTMLButtonElement;

function zeige(teil: Partial<AbschlussDialogProps> = {}) {
  const props: AbschlussDialogProps = {
    offen: null,
    fehler: null,
    sendet: false,
    untertitel: "2027-GYM-003 · Anna Beispiel",
    onAbbrechen: jest.fn(),
    onAbschliessen: jest.fn(),
    ...teil,
  };
  render(<AbschlussDialog {...props} />);
  return props;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================
// 1. Dialog
// =============================================

describe("AbschlussDialog", () => {
  it("erster Schritt: Satz ohne Liste, „Vorgang abschließen“ schickt ohne Bestätigung", () => {
    const props = zeige();
    expect(dialog().getAttribute("data-dialog")).toBe("abschluss");
    expect(dialog().textContent).toContain(ABSCHLUSS_TEXTE.titel);
    expect(dialog().textContent).toContain("2027-GYM-003 · Anna Beispiel");
    expect(dialog().textContent).toContain(ABSCHLUSS_TEXTE.satz);
    expect(document.querySelector('[data-liste="abschluss-offen"]')).toBeNull();
    // Der Fokus liegt beim Oeffnen auf „Abbrechen“, nie auf dem bestaetigenden Knopf.
    expect(document.activeElement).toBe(knopfImDialog("Abbrechen"));

    fireEvent.click(knopfImDialog(ABSCHLUSS_TEXTE.abschliessen));
    expect(props.onAbschliessen).toHaveBeenCalledWith(false);
  });

  it("zweiter Schritt: Liste „Titel – Stelle“, Meldung des Servers, „Trotzdem abschließen“ schickt `bestaetigt`", () => {
    const props = zeige({ offen: OFFEN, fehler: abschlussOffenMeldung(2) });
    const liste = document.querySelector('[data-liste="abschluss-offen"]') as HTMLElement;
    expect(liste.textContent).toContain(ABSCHLUSS_TEXTE.offenTitel(2));
    expect([...liste.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Dienst-iPad (Lernmittel) bereitstellen – IT-Abteilung",
      "Hinweis der Führungskraft beachten – Hausmeister Grundschule",
    ]);
    expect(ABSCHLUSS_TEXTE.offenTitel(2)).toBe("Noch offen aus „Ausstattung & Zugänge“ (2)");
    expect(within(dialog()).getByRole("alert").textContent).toBe(abschlussOffenMeldung(2));
    expect(within(dialog()).queryByRole("button", { name: ABSCHLUSS_TEXTE.abschliessen })).toBeNull();

    fireEvent.click(knopfImDialog(ABSCHLUSS_TEXTE.trotzdem));
    expect(props.onAbschliessen).toHaveBeenCalledWith(true);
  });

  it("eine leere Liste gilt wie keine — kein „Trotzdem“", () => {
    zeige({ offen: [] });
    expect(knopfImDialog(ABSCHLUSS_TEXTE.abschliessen)).toBeTruthy();
    expect(document.querySelector('[data-liste="abschluss-offen"]')).toBeNull();
  });

  it("während des Aufrufs gesperrt: „Wird gesendet…“, Escape und Abbrechen schließen nicht", () => {
    const props = zeige({ offen: OFFEN, sendet: true });
    expect(knopfImDialog("Wird gesendet…").disabled).toBe(true);
    expect(knopfImDialog("Abbrechen").disabled).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onAbbrechen).not.toHaveBeenCalled();
  });

  it("Abbrechen und Escape schließen ohne Aufruf", () => {
    const props = zeige();
    fireEvent.click(knopfImDialog("Abbrechen"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onAbbrechen).toHaveBeenCalledTimes(2);
    expect(props.onAbschliessen).not.toHaveBeenCalled();
  });
});

// =============================================
// 2. Aufruf
// =============================================

describe("abschlussSenden", () => {
  function antwort(status: number, json: unknown) {
    const f = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (json === undefined) throw new Error("kein JSON");
        return json;
      },
    }));
    global.fetch = f as unknown as typeof fetch;
    return f;
  }

  it("Body: ohne Bestätigung nur der Status, mit Bestätigung `bestaetigt: true`", async () => {
    const f = antwort(200, { id: "onb-1" });
    expect(await abschlussSenden("onb-1", false)).toEqual({ art: "ok" });
    expect(await abschlussSenden("onb-1", true)).toEqual({ art: "ok" });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("/api/onboarding/onb-1");
    expect(calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ status: "COMPLETED" });
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ status: "COMPLETED", bestaetigt: true });
  });

  it("409 AUSSTATTUNG_OFFEN: die Liste und die Meldung des Servers", async () => {
    antwort(409, {
      error: abschlussOffenMeldung(2),
      grund: "AUSSTATTUNG_OFFEN",
      offen: [...OFFEN, { titel: 7 }, null],
    });
    expect(await abschlussSenden("onb-1", false)).toEqual({
      art: "offen",
      offen: OFFEN,
      meldung: abschlussOffenMeldung(2),
    });
  });

  it("andere 409 (etwa „erst als geprüft markieren“): Fehler mit dem Text des Servers", async () => {
    antwort(409, { error: "Ein Vorgang kann erst abgeschlossen werden, wenn er als geprüft markiert ist." });
    expect(await abschlussSenden("onb-1", false)).toEqual({
      art: "fehler",
      meldung: "Ein Vorgang kann erst abgeschlossen werden, wenn er als geprüft markiert ist.",
    });
    // Eine AUSSTATTUNG_OFFEN ohne Liste ist ebenfalls nur ein Fehler.
    antwort(409, { error: "x", grund: "AUSSTATTUNG_OFFEN", offen: [] });
    expect(await abschlussSenden("onb-1", false)).toEqual({ art: "fehler", meldung: "x" });
  });

  it("ohne lesbare Antwort ein allgemeiner Text; ohne Verbindung der Verbindungsfehler", async () => {
    antwort(500, undefined);
    expect(await abschlussSenden("onb-1", true)).toEqual({ art: "fehler", meldung: ABSCHLUSS_TEXTE.fehlerAllgemein });
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await abschlussSenden("onb-1", true)).toEqual({ art: "fehler", meldung: ABSCHLUSS_TEXTE.verbindung });
  });
});

// =============================================
// 3. Detailseite
// =============================================

describe("Detailseite: „Vorgang abschließen“ mit Rückfrage", () => {
  const VORGANG = "onb-1";
  const USER = { userId: "u-leitung", email: "leitung@credo-gruppe.de", role: "HR_LEITUNG", firstName: "Lea", lastName: "Leitung" };

  function detail(status = "REVIEWED"): DetailData {
    return {
      id: VORGANG,
      displayId: "2027-GYM-003",
      email: "anna.beispiel@example.org",
      firstName: "Anna",
      lastName: "Beispiel",
      status,
      questionnaireType: "STANDARD",
      token: "tok-fb",
      invitedAt: "2027-01-08T12:00:00.000Z",
      submittedAt: "2027-01-10T12:00:00.000Z",
      supervisorSubmittedAt: "2027-01-14T09:30:00.000Z",
      supervisorToken: "tok-sv",
      supervisorEmail: "leitung@fes-minden.de",
      supervisorTokenExpiresAt: "2027-02-14T09:30:00.000Z",
      supervisorLinkSentAt: null,
      reviewedAt: "2027-01-20T09:30:00.000Z",
      completedAt: null,
      starterPacketSentAt: null,
      starterPacketSentCount: 0,
      organization: { id: "org-gym", name: "FES Gymnasium", mandantNumber: "10", type: "GYMNASIUM" },
      fragebogenFortschritt: { position: 9, total: 9, titel: "Abschluss", prozent: 100 },
      requiredDocuments: [],
      personalData: {
        firstName: "Anna",
        lastName: "Beispiel",
        isComplete: true,
        currentStep: 9,
        birthDate: "1990-05-03",
        children: [],
        rvEntscheidung: null,
        aufenthaltstitelErforderlich: null,
        healthInsuranceType: "gesetzlich",
      },
      supervisorData: null,
      documents: [],
      checklistItems: [],
      notes: [],
      _count: { notes: 0 },
      ausstattung: null,
    } as unknown as DetailData;
  }

  /** GET liefert den Vorgang; PATCH antwortet nach `patchAntworten` der Reihe nach. */
  function server(patchAntworten: { status: number; json: unknown }[]) {
    let abgeschlossen = false;
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/onboarding/${VORGANG}` && init?.method === "PATCH") {
        const a = patchAntworten.shift()!;
        if (a.status === 200) abgeschlossen = true;
        return { ok: a.status === 200, status: a.status, json: async () => a.json };
      }
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(detail(abgeschlossen ? "COMPLETED" : "REVIEWED"))),
      };
    });
    global.fetch = f as unknown as typeof fetch;
    return f;
  }

  const patches = (f: jest.Mock) =>
    (f.mock.calls as [string, RequestInit | undefined][])
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init!.body)));

  async function klick(el: HTMLElement) {
    await act(async () => {
      fireEvent.click(el);
    });
  }

  it("kein window.confirm: Dialog, 409 mit Liste, „Trotzdem abschließen“ schickt `bestaetigt` und lädt neu", async () => {
    const confirm = jest.spyOn(window, "confirm").mockImplementation(() => true);
    const f = server([
      { status: 409, json: { error: abschlussOffenMeldung(2), grund: "AUSSTATTUNG_OFFEN", offen: OFFEN } },
      { status: 200, json: { id: VORGANG, status: "COMPLETED" } },
    ]);
    await act(async () => {
      render(<DetailContent onboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("2027-GYM-003");

    // Der Knopf im Kopf oeffnet nur den Dialog — noch kein Aufruf.
    await klick(screen.getByRole("button", { name: "Vorgang abschließen" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(patches(f)).toEqual([]);
    expect(dialog().textContent).toContain(ABSCHLUSS_TEXTE.titel);

    // Erster Klick im Dialog: ohne Bestaetigung → 409 mit Liste, Dialog bleibt.
    await klick(knopfImDialog(ABSCHLUSS_TEXTE.abschliessen));
    expect(patches(f)).toEqual([{ status: "COMPLETED" }]);
    expect(document.querySelectorAll('[data-liste="abschluss-offen"] li')).toHaveLength(2);
    expect(within(dialog()).getByRole("alert").textContent).toBe(abschlussOffenMeldung(2));

    // Zweiter Klick: mit Bestaetigung → abgeschlossen, Dialog zu, neu geladen.
    const vorher = f.mock.calls.length;
    await klick(knopfImDialog(ABSCHLUSS_TEXTE.trotzdem));
    expect(patches(f)).toEqual([{ status: "COMPLETED" }, { status: "COMPLETED", bestaetigt: true }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    const danach = (f.mock.calls as [string, RequestInit | undefined][]).slice(vorher);
    expect(danach.some(([url, init]) => url === `/api/onboarding/${VORGANG}` && !init?.method)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("ohne offene Ausstattung schließt schon der erste Klick ab; Abbrechen schickt nichts", async () => {
    const f = server([{ status: 200, json: { id: VORGANG, status: "COMPLETED" } }]);
    await act(async () => {
      render(<DetailContent onboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("2027-GYM-003");

    await klick(screen.getByRole("button", { name: "Vorgang abschließen" }));
    await klick(knopfImDialog("Abbrechen"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(patches(f)).toEqual([]);

    await klick(screen.getByRole("button", { name: "Vorgang abschließen" }));
    await klick(knopfImDialog(ABSCHLUSS_TEXTE.abschliessen));
    expect(patches(f)).toEqual([{ status: "COMPLETED" }]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ein anderer Fehler des Servers bleibt im Dialog", async () => {
    server([{ status: 409, json: { error: "Der Vorgang wurde gerade geändert. Bitte laden Sie die Seite neu und versuchen Sie es erneut." } }]);
    await act(async () => {
      render(<DetailContent onboardingId={VORGANG} user={USER} />);
    });
    await screen.findAllByText("2027-GYM-003");

    await klick(screen.getByRole("button", { name: "Vorgang abschließen" }));
    await klick(knopfImDialog(ABSCHLUSS_TEXTE.abschliessen));
    expect(within(dialog()).getByRole("alert").textContent).toContain("gerade geändert");
    // Ohne Liste bleibt es beim ersten Schritt.
    expect(knopfImDialog(ABSCHLUSS_TEXTE.abschliessen)).toBeTruthy();
  });
});
