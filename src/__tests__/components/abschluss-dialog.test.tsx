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
 *   4. Offboarding (Paket A4, S32, G18, G19): derselbe, verallgemeinerte
 *      Dialog mit den Texten des Austritts und der Hinweiszeile
 *      „Rückgabeprotokoll fehlt“; `austrittAbschlussSenden` (409
 *      RUECKGABEN_OFFEN mit Liste, INZWISCHEN_GEAENDERT mit Grund); die
 *      Offboarding-Detailseite ohne `window.confirm` beim Abschluss. Die
 *      Onboarding-Vorgaben sind unverändert (Abschnitte 1 bis 3).
 *
 * Umgebung wie in den übrigen Komponententests: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  ABSCHLUSS_RUECKGABEN_OFFEN,
  ABSCHLUSS_TEXTE,
  AUSTRITT_ABSCHLUSS_TEXTE,
  AbschlussDialog,
  abschlussSenden,
  austrittAbschlussSenden,
  type AbschlussDialogProps,
} from "@/components/ausstattung/abschluss-dialog";
import { DetailContent, type DetailData } from "@/app/(portal)/dashboard/[id]/detail-content";
import {
  KOPF_ID,
  OffboardingDetailContent,
  STATUS_KNOPF_ID,
} from "@/app/(portal)/dashboard/offboarding/[id]/offboarding-detail-content";
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

// =============================================
// 4. Offboarding (A4, S32, G18, G19): derselbe Dialog mit eigenen Texten
// =============================================

describe("Offboarding: Abschluss mit Warnung über den verallgemeinerten Dialog", () => {
  const OFFEN_AUSTRITT: AbschlussOffeneAufgabe[] = [
    { titel: "Dienst-iPad (Lernmittel)", stelle: "IT-Abteilung" },
    { titel: "Schließung prüfen: Schlüssel: Haupteingang", stelle: "Facility Management" },
  ];
  const PROTOKOLL_FEHLT = "Unterschriebenes Rückgabeprotokoll: fehlt";

  it("Texte des Austritts und die Hinweiszeile „Rückgabeprotokoll fehlt“ (ohne Sperre)", () => {
    const props = zeige({
      texte: AUSTRITT_ABSCHLUSS_TEXTE,
      hinweis: PROTOKOLL_FEHLT,
      offen: OFFEN_AUSTRITT,
      fehler: "2 Rückgaben oder Sperren sind noch offen. Der Austritt lässt sich trotzdem abschließen – bitte bestätigen.",
    });
    expect(dialog().textContent).toContain(AUSTRITT_ABSCHLUSS_TEXTE.titel);
    expect(dialog().textContent).toContain(AUSTRITT_ABSCHLUSS_TEXTE.satz);
    expect(dialog().querySelector('[data-hinweis="abschluss"]')?.textContent).toBe(PROTOKOLL_FEHLT);
    const liste = document.querySelector('[data-liste="abschluss-offen"]') as HTMLElement;
    expect(liste.textContent).toContain("Noch offen: Rückgaben und Sperren (2)");
    expect([...liste.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "Dienst-iPad (Lernmittel) – IT-Abteilung",
      "Schließung prüfen: Schlüssel: Haupteingang – Facility Management",
    ]);
    fireEvent.click(knopfImDialog(AUSTRITT_ABSCHLUSS_TEXTE.trotzdem));
    expect(props.onAbschliessen).toHaveBeenCalledWith(true);
  });

  it("fokusZiel: fehlt der Auslöser beim Schließen (Fokus lag auf body), bekommt das Ersatzziel den Fokus (Review A4c)", () => {
    const abbrechen = jest.fn();
    const abschliessen = jest.fn();
    function Seite({ offen }: { offen: boolean }) {
      return (
        <>
          <button id="ersatz-ziel" type="button">
            Status ändern
          </button>
          {offen && (
            <AbschlussDialog
              offen={null}
              fehler={null}
              sendet={false}
              texte={AUSTRITT_ABSCHLUSS_TEXTE}
              fokusZiel="ersatz-ziel"
              onAbbrechen={abbrechen}
              onAbschliessen={abschliessen}
            />
          )}
        </>
      );
    }
    (document.activeElement as HTMLElement | null)?.blur();
    const { rerender } = render(<Seite offen />);
    expect(document.activeElement?.textContent).toBe("Abbrechen");
    rerender(<Seite offen={false} />);
    expect(document.activeElement?.id).toBe("ersatz-ziel");
  });

  it("ohne Hinweis keine Zeile; die Vorgaben bleiben die des Onboardings", () => {
    zeige({ hinweis: "  " });
    expect(dialog().querySelector('[data-hinweis="abschluss"]')).toBeNull();
    expect(dialog().textContent).toContain(ABSCHLUSS_TEXTE.titel);
  });

  it("austrittAbschlussSenden: PATCH an den Austritt, 409 RUECKGABEN_OFFEN mit Liste, INZWISCHEN_GEAENDERT mit Grund", async () => {
    const f = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "2 offen", grund: ABSCHLUSS_RUECKGABEN_OFFEN, offen: OFFEN_AUSTRITT }),
    }));
    global.fetch = f as unknown as typeof fetch;
    expect(await austrittAbschlussSenden("off-1", false)).toEqual({ art: "offen", offen: OFFEN_AUSTRITT, meldung: "2 offen" });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("/api/offboarding/off-1");
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ status: "COMPLETED" });

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "Der Austritt wurde inzwischen geändert. Bitte die Seite neu laden.", grund: "INZWISCHEN_GEAENDERT" }),
    })) as unknown as typeof fetch;
    expect(await austrittAbschlussSenden("off-1", true)).toEqual({
      art: "fehler",
      meldung: "Der Austritt wurde inzwischen geändert. Bitte die Seite neu laden.",
      grund: "INZWISCHEN_GEAENDERT",
    });

    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => null })) as unknown as typeof fetch;
    expect(await austrittAbschlussSenden("off-1", true)).toEqual({
      art: "fehler",
      meldung: AUSTRITT_ABSCHLUSS_TEXTE.fehlerAllgemein,
    });
  });

  describe("Detailseite des Offboardings", () => {
    const VORGANG = "off-1";
    const USER = { userId: "u-leitung", email: "leitung@credo-gruppe.de", role: "HR_LEITUNG", firstName: "Lea", lastName: "Leitung" };

    function austritt(status: string, mitProtokoll: boolean) {
      return {
        id: VORGANG,
        displayId: "OFF-2027-GYM-014",
        employeeEmail: "max.mustermann@fes-minden.de",
        employeeFirstName: "Max",
        employeeLastName: "Mustermann",
        employeePersonalNr: null,
        employeePrivateEmail: null,
        exitType: "KUENDIGUNG_ARBEITNEHMER",
        exitReason: null,
        noticeDate: null,
        lastWorkingDay: "2027-07-31T00:00:00.000Z",
        contractEndDate: null,
        noticePeriodEnd: null,
        status,
        initiatedAt: "2027-06-01T00:00:00.000Z",
        completedAt: status === "COMPLETED" ? "2027-08-01T08:00:00.000Z" : null,
        dataRetentionDate: null,
        organization: { id: "org-gym", name: "FES Gymnasium", mandantNumber: "10" },
        exitData: null,
        returnItems: [],
        documents: [],
        checklistItems: [],
        notes: [],
        departmentLinks: [],
        // Feld `rueckgaben` (HR): hier nur, was Seite und Uebersicht lesen.
        rueckgaben: mitProtokoll
          ? {
              protokoll: { art: "RUECKGABE", noetig: true, hochgeladenAm: null, text: PROTOKOLL_FEHLT },
              aktionen: { zuordnen: false, loesen: false, aktualisieren: false, ohneVermerk: false },
              zuordnungEmpfohlen: false,
              offen: OFFEN_AUSTRITT,
              schritt: { erledigt: false, text: "Laut Portal ausgegeben." },
              fortschritt: { erledigt: 0, gesamt: OFFEN_AUSTRITT.length },
            }
          : null,
      };
    }

    function server(patchAntworten: { status: number; json: unknown }[], mitProtokoll = true) {
      let abgeschlossen = false;
      const f = jest.fn(async (url: string, init?: RequestInit) => {
        if (url === `/api/offboarding/${VORGANG}` && init?.method === "PATCH") {
          const a = patchAntworten.shift()!;
          if (a.status === 200) abgeschlossen = true;
          return { ok: a.status === 200, status: a.status, json: async () => a.json };
        }
        if (url === `/api/offboarding/${VORGANG}`) {
          return {
            ok: true,
            status: 200,
            json: async () => JSON.parse(JSON.stringify(austritt(abgeschlossen ? "COMPLETED" : "FINAL_SETTLEMENT", mitProtokoll))),
          };
        }
        // Exit-Interview und Zeugnis: ohne Daten.
        return { ok: true, status: 200, json: async () => ({ data: null }) };
      });
      global.fetch = f as unknown as typeof fetch;
      return f;
    }

    const patchBodies = (f: jest.Mock) =>
      (f.mock.calls as [string, RequestInit | undefined][])
        .filter(([, init]) => init?.method === "PATCH")
        .map(([, init]) => JSON.parse(String(init!.body)));

    async function klick(el: HTMLElement) {
      await act(async () => {
        fireEvent.click(el);
      });
    }

    async function abschlussOeffnen() {
      await klick(screen.getByRole("button", { name: /Status ändern/ }));
      await klick(screen.getByRole("button", { name: "Abgeschlossen" }));
    }

    it("kein window.confirm: Dialog mit Protokoll-Hinweis, 409 mit Liste, „Trotzdem abschließen“ schickt `bestaetigt`", async () => {
      const confirm = jest.spyOn(window, "confirm").mockImplementation(() => true);
      const f = server([
        {
          status: 409,
          json: { error: "2 Rückgaben oder Sperren sind noch offen.", grund: ABSCHLUSS_RUECKGABEN_OFFEN, offen: OFFEN_AUSTRITT },
        },
        { status: 200, json: { id: VORGANG, status: "COMPLETED" } },
      ]);
      await act(async () => {
        render(<OffboardingDetailContent offboardingId={VORGANG} user={USER} />);
      });
      await screen.findAllByText("OFF-2027-GYM-014");

      await abschlussOeffnen();
      expect(confirm).not.toHaveBeenCalled();
      expect(patchBodies(f)).toEqual([]);
      expect(dialog().textContent).toContain(AUSTRITT_ABSCHLUSS_TEXTE.titel);
      expect(dialog().querySelector('[data-hinweis="abschluss"]')?.textContent).toBe(PROTOKOLL_FEHLT);

      await klick(knopfImDialog(AUSTRITT_ABSCHLUSS_TEXTE.abschliessen));
      expect(patchBodies(f)).toEqual([{ status: "COMPLETED" }]);
      expect(document.querySelectorAll('[data-liste="abschluss-offen"] li')).toHaveLength(2);

      await klick(knopfImDialog(AUSTRITT_ABSCHLUSS_TEXTE.trotzdem));
      expect(patchBodies(f)).toEqual([{ status: "COMPLETED" }, { status: "COMPLETED", bestaetigt: true }]);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(confirm).not.toHaveBeenCalled();
    });

    it("Fokus (Review A4c): nach „Abbrechen“ auf „Status ändern“, nach dem Abschluss (Knopf weg) auf die Vorgangsnummer im Kopf", async () => {
      server([{ status: 200, json: { id: VORGANG, status: "COMPLETED" } }], false);
      await act(async () => {
        render(<OffboardingDetailContent offboardingId={VORGANG} user={USER} />);
      });
      await screen.findAllByText("OFF-2027-GYM-014");

      // Das Menü schließt im selben Rendern, der Fokus läge sonst auf body.
      await abschlussOeffnen();
      await klick(knopfImDialog("Abbrechen"));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement?.id).toBe(STATUS_KNOPF_ID);

      await abschlussOeffnen();
      await klick(knopfImDialog(AUSTRITT_ABSCHLUSS_TEXTE.abschliessen));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("button", { name: /Status ändern/ })).toBeNull();
      expect(document.activeElement?.id).toBe(KOPF_ID);
      expect(document.activeElement?.textContent).toBe("OFF-2027-GYM-014");
    });

    it("INZWISCHEN_GEAENDERT: Meldung im Dialog, die Seite lädt neu, die Liste ist weg", async () => {
      const f = server(
        [
          { status: 409, json: { error: "x", grund: ABSCHLUSS_RUECKGABEN_OFFEN, offen: OFFEN_AUSTRITT } },
          { status: 409, json: { error: "Der Austritt wurde inzwischen geändert. Bitte die Seite neu laden.", grund: "INZWISCHEN_GEAENDERT" } },
        ],
        false,
      );
      await act(async () => {
        render(<OffboardingDetailContent offboardingId={VORGANG} user={USER} />);
      });
      await screen.findAllByText("OFF-2027-GYM-014");
      await abschlussOeffnen();
      expect(dialog().querySelector('[data-hinweis="abschluss"]')).toBeNull();
      await klick(knopfImDialog(AUSTRITT_ABSCHLUSS_TEXTE.abschliessen));
      const getsVorher = (f.mock.calls as [string, RequestInit | undefined][]).filter(
        ([url, init]) => url === `/api/offboarding/${VORGANG}` && !init?.method,
      ).length;
      await klick(knopfImDialog(AUSTRITT_ABSCHLUSS_TEXTE.trotzdem));
      expect(within(dialog()).getByRole("alert").textContent).toBe(
        "Der Austritt wurde inzwischen geändert. Bitte die Seite neu laden.",
      );
      expect(document.querySelector('[data-liste="abschluss-offen"]')).toBeNull();
      const getsDanach = (f.mock.calls as [string, RequestInit | undefined][]).filter(
        ([url, init]) => url === `/api/offboarding/${VORGANG}` && !init?.method,
      ).length;
      expect(getsDanach).toBe(getsVorher + 1);
    });
  });
});
