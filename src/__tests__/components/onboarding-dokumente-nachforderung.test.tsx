/**
 * @jest-environment jsdom
 */

/**
 * Einbau von „Unterlagen nachfordern" in die Vorgangsansicht (Paket 4,
 * Schritt 10, Feinplanung 10.2 und 18 Z1).
 *
 * Die Karte selbst prueft nachforderung-karte.test.tsx, den Dialog
 * nachforderung-dialog.test.tsx, den Kasten „Offene Nachweise" und den
 * Warnbalken offene-nachweise.test.tsx. Hier geht es um die Verdrahtung:
 *
 *  1. Reiter „Dokumente": die Pille der laufenden Nachforderung (mit Namen,
 *     neben der Anzahl der Dokumente); `?tab=dokumente` oeffnet den Reiter,
 *     ohne die Reiterwahl danach zu stoeren (so kommt `portalLink` der
 *     HR-Mails an: `/dashboard/<id>?tab=dokumente`, Modul-Baustein `portalPfad`).
 *  2. Die Karte steht nach „Dokumente versenden" und vor den hochgeladenen
 *     Dokumenten; der Dialog oeffnet dort mit Name · Vorgangsnummer und einem
 *     Fokusziel, seine Meldung steht ueber der Karte — rot bei nicht
 *     zugestellter Mail (FAILED, mit „Link erneut senden"), gelb bei
 *     uebersprungener, nie gruen, wenn die Mail nicht hinausging — und weicht
 *     der naechsten Aktion der Karte. Mit dem ECHTEN Dialog: Nach dem Anfordern
 *     liegt der Fokus auf dem Block der Karte, nicht auf `body`.
 *  3. Die Dokumentenliste zeigt `Document.bezeichnung` und die Herkunft
 *     „aus Nachforderung angenommen am …" samt PDF-Hinweisen.
 *  4. Die Mini-Karte „Dokumente" der Status-Übersicht traegt den Kurzstand.
 *  5. Z1: Der Knopf „Unbefristet" setzt das Kennzeichen — auch ohne
 *     gespeichertes Datum —, und ein unbefristetes Dokument zeigt
 *     „Unbefristet" statt „Keine Frist hinterlegt". Nach dem Speichern liegt
 *     der Fokus auf „Ändern", ein Fehler kommt als Alarm.
 *
 * Die Uebersicht entsteht mit der ECHTEN Regel des Servers (`uebersichtBauen`).
 * Gemockt sind nur Nachbarn mit eigenem Netzverkehr (Kopfzeile, Dokumentenpaket,
 * Vorlagen) und der Dialog — dessen Verhalten ist nicht Gegenstand hier, nur,
 * womit er geoeffnet wird und was nach `onErfolg` geschieht. Fuer den Fokus
 * nach dem Anfordern laeuft einmal der echte (`mockEchterDialog`).
 *
 * Umgebung wie in offene-nachweise.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  AblaufAbzeichen,
  DetailContent,
  TabDocuments,
  TabOverview,
  fristAenderungUebernehmen,
  reiterAusSuche,
  type DetailData,
} from "@/app/(portal)/dashboard/[id]/detail-content";
import {
  aktionsTexte,
  uebersichtBauen,
  type AuswahlEintrag,
  type DateiEingabe,
  type NachforderungEingabe,
  type PositionEingabe,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";

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

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/onb-1",
}));

// Nachbarn mit eigenem Netzverkehr — fuer die Verdrahtung ohne Belang.
jest.mock("@/components/portal-header", () => ({
  PortalHeader: () => <header data-testid="portal-header" />,
}));
jest.mock("@/components/dokumentenpaket-section", () => ({
  DokumentenpaketSection: () => <section data-testid="dokumentenpaket">Dokumente versenden</section>,
}));
jest.mock("@/components/template-generation-section", () => ({
  TemplateGenerationSection: () => <section data-testid="vorlagen" />,
}));

// Der Dialog als Attrappe: Er zeigt, womit er geoeffnet wurde, und meldet auf
// Zuruf Erfolg, Fehler (FAILED) bzw. Warnung (SKIPPED) — so wie der echte nach
// einer Antwort des Servers.
// Mit `mockEchterDialog = true` rendert der echte (Fokus nach dem Anfordern).
let mockEchterDialog = false;
jest.mock("@/components/unterlagen/nachforderung-dialog", () => {
  const echt = jest.requireActual("@/components/unterlagen/nachforderung-dialog");
  return {
    NachforderungDialog: (p: {
      modus: string;
      vorauswahl: string[] | null;
      onSchliessen: () => void;
      onErfolg: (m: { art: "erfolg" | "warnung" | "fehler"; text: string }) => void | Promise<void>;
      kopf?: { name?: string | null; vorgangsnummer?: string | null } | null;
      fokusZiel?: string;
    }) =>
      mockEchterDialog ? <echt.NachforderungDialog {...p} /> : (
    <div
      role="dialog"
      aria-label="Unterlagen nachfordern"
      data-modus={p.modus}
      data-vorauswahl={JSON.stringify(p.vorauswahl)}
      data-kopf={JSON.stringify(p.kopf ?? null)}
      data-fokusziel={p.fokusZiel ?? ""}
    >
      <button type="button" onClick={() => p.onErfolg({ art: "erfolg", text: "Die Unterlagen sind angefordert." })}>
        Attrappe: Erfolg
      </button>
      <button
        type="button"
        onClick={() =>
          p.onErfolg({
            art: "fehler",
            text: "Die Unterlagen sind angefordert. Die E-Mail konnte nicht zugestellt werden; der tägliche Lauf versucht es erneut.",
          })
        }
      >
        Attrappe: Fehler
      </button>
      <button
        type="button"
        onClick={() =>
          p.onErfolg({
            art: "warnung",
            text: "Die Unterlagen sind angefordert. Die E-Mail wurde nicht versendet: Vorlage deaktiviert.",
          })
        }
      >
        Attrappe: Warnung
      </button>
      <button type="button" onClick={p.onSchliessen}>
        Attrappe: Schließen
      </button>
    </div>
      ),
  };
});

// =============================================
// Fixtur — Mockup P:1382-1406, betrachtet am Mo 21.09.2026
// =============================================

const JETZT = new Date("2026-09-21T10:00:00.000Z");
const VORGANG = "onb-1";

function datei(teil: Partial<DateiEingabe> & { id: string }): DateiEingabe {
  return {
    status: "EINGEREICHT",
    anzeigeName: "datei.pdf",
    mimeType: "application/pdf",
    groesse: 1024 * 1024,
    pdfHinweise: null,
    einreichungNr: 1,
    uebermitteltAm: "2026-09-15T08:00:00.000Z",
    entschiedenAm: null,
    speicherPfad: `uploads/unterlagen/nf-1/${teil.id}.pdf`,
    uebernahmeZiel: null,
    uebernommenId: null,
    uebernommenAm: null,
    loeschenAb: null,
    dateiGeloeschtAm: null,
    ...teil,
  };
}

function position(teil: Partial<PositionEingabe> & { id: string }): PositionEingabe {
  return {
    reihenfolge: 0,
    typ: null,
    bezeichnung: "Unterlage",
    hinweis: null,
    originalErforderlich: false,
    sensibel: false,
    fristpflichtig: false,
    status: "ANGEFORDERT",
    einreichungen: 0,
    gueltigBisAngabe: null,
    angefordertAm: "2026-09-12T08:00:00.000Z",
    uebermitteltAm: null,
    begruendung: null,
    entfaelltNotiz: null,
    entschiedenAm: null,
    entschiedenVonName: null,
    dateien: [],
    ...teil,
  };
}

/** RV-Antrag angenommen (als SONSTIGES „doc-rv"), Titel zu pruefen, Masernschutz offen. */
function laufendeNachforderung(): NachforderungEingabe {
  return {
    id: "nf-1",
    modul: "ONBOARDING",
    status: "LAUFEND",
    empfaenger: "anna.beispiel@example.org",
    empfaengerAbweichend: false,
    frist: new Date("2026-09-26T00:00:00.000Z"),
    nachricht: null,
    angefordertAm: "2026-09-12T08:00:00.000Z",
    angefordertVonName: "Erika Muster",
    erinnertFuerFrist: null,
    erinnertStufe: null,
    erledigtAm: null,
    zurueckgezogenAm: null,
    positionen: [
      position({
        id: "p-rv",
        bezeichnung: "Unterschriebener RV-Antrag",
        originalErforderlich: true,
        status: "ANGENOMMEN",
        einreichungen: 1,
        uebermitteltAm: "2026-09-14T09:00:00.000Z",
        entschiedenAm: "2026-09-16T08:00:00.000Z",
        entschiedenVonName: "Erika Muster",
        dateien: [
          datei({
            id: "d-rv",
            status: "ANGENOMMEN",
            anzeigeName: "rv-antrag.pdf",
            pdfHinweise: "VERSCHLUESSELT",
            speicherPfad: null,
            entschiedenAm: "2026-09-16T08:00:00.000Z",
            uebernahmeZiel: "DOCUMENT",
            uebernommenId: "doc-rv",
            uebernommenAm: "2026-09-16T08:00:00.000Z",
          }),
        ],
      }),
      position({
        id: "p-at",
        reihenfolge: 1,
        typ: "AUFENTHALTSTITEL",
        bezeichnung: "Aufenthaltstitel",
        sensibel: true,
        fristpflichtig: true,
        status: "EINGEREICHT",
        einreichungen: 1,
        uebermitteltAm: "2026-09-15T08:00:00.000Z",
        dateien: [datei({ id: "d-at", anzeigeName: "titel.jpg", mimeType: "image/jpeg" })],
      }),
      position({ id: "p-ms", reihenfolge: 2, typ: "MASERNSCHUTZ", bezeichnung: "Masernschutz-Nachweis", sensibel: true }),
    ],
    links: [
      {
        anlass: "ANFORDERUNG",
        mailStatus: "SENT",
        mailDetail: null,
        gesendetAm: "2026-09-12T08:01:00.000Z",
        nachholVersuche: 0,
        erstelltVonId: "u-erika",
        createdAt: "2026-09-12T08:00:00.000Z",
      },
      {
        anlass: "ERINNERUNG_VORAB",
        mailStatus: "SENT",
        mailDetail: null,
        gesendetAm: "2026-09-19T05:00:00.000Z",
        nachholVersuche: 0,
        erstelltVonId: null,
        createdAt: "2026-09-19T05:00:00.000Z",
      },
    ],
  };
}

function unterlagen(
  opts: { nachforderungen?: NachforderungEingabe[]; darfAktionen?: boolean; auswahl?: AuswahlEintrag[] } = {},
): UnterlagenUebersicht {
  return uebersichtBauen({
    modul: "ONBOARDING",
    nachforderungen: opts.nachforderungen ?? [laufendeNachforderung()],
    verfuegbar: { ok: true },
    vorgangEingestellt: false,
    darfAktionen: opts.darfAktionen ?? true,
    dateiUrl: (id) => `/api/onboarding/${VORGANG}/unterlagen/dateien/${id}`,
    apiBasis: `/api/onboarding/${VORGANG}/unterlagen`,
    dialog: {
      auswahl: opts.auswahl ?? [],
      empfaenger: {
        vorgang: "anna.beispiel@example.org",
        vorschlaege: [{ adresse: "anna.beispiel@example.org", quelle: "VORGANG" }],
        erlaubteDomains: [],
      },
    },
    jetzt: JETZT,
  });
}

function dokument(teil: Record<string, unknown> & { id: string; type: string }) {
  return {
    fileName: `${teil.id}.pdf`,
    fileSize: 2048,
    mimeType: "application/pdf",
    status: "UPLOADED",
    uploadedAt: "2026-09-16T08:00:00.000Z",
    gueltigBis: null,
    ...teil,
  };
}

/** Ein abgegebener Vorgang: Masernschutz fehlt, der RV-Antrag ist aus der Nachforderung uebernommen. */
function vorgang(teil: Record<string, unknown> = {}): DetailData {
  return {
    id: VORGANG,
    displayId: "2026-GYM-014",
    email: "anna.beispiel@example.org",
    firstName: "Anna",
    lastName: "Beispiel",
    status: "SUBMITTED",
    questionnaireType: "STANDARD",
    token: "tok-fb",
    invitedAt: "2026-09-08T12:00:00.000Z",
    submittedAt: "2026-09-10T12:00:00.000Z",
    supervisorSubmittedAt: null,
    supervisorToken: null,
    supervisorEmail: null,
    supervisorTokenExpiresAt: null,
    supervisorLinkSentAt: null,
    reviewedAt: null,
    completedAt: null,
    starterPacketSentAt: null,
    starterPacketSentCount: 0,
    organization: { id: "org-1", name: "FES Gymnasium", mandantNumber: "10", type: "GYMNASIUM" },
    fragebogenFortschritt: { position: 9, total: 9, titel: "Abschluss", prozent: 100 },
    requiredDocuments: ["MASERNSCHUTZ"],
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
    documents: [
      dokument({
        id: "doc-rv",
        type: "SONSTIGES",
        fileName: "rv-antrag.pdf",
        status: "APPROVED",
        bezeichnung: "Unterschriebener RV-Antrag",
      }),
      dokument({ id: "doc-gb", type: "GEBURTSURKUNDE_EIGEN", fileName: "geburtsurkunde.pdf" }),
    ],
    checklistItems: [],
    notes: [],
    _count: { notes: 0 },
    unterlagen: unterlagen(),
    ...teil,
  } as unknown as DetailData;
}

const USER = {
  userId: "u-erika",
  email: "erika.muster@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "Erika",
  lastName: "Muster",
};

function fetchMit(...antworten: DetailData[]) {
  let i = 0;
  const f = jest.fn(async () => {
    const daten = antworten[Math.min(i, antworten.length - 1)];
    i += 1;
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(daten)) };
  });
  global.fetch = f as unknown as typeof fetch;
  return f;
}

async function seite(user = USER) {
  await act(async () => {
    render(<DetailContent onboardingId={VORGANG} user={user} />);
  });
  // Die Vorgangsnummer steht nur einmal im Kopf — erst nach dem Laden.
  await screen.findByText("2026-GYM-014");
}

const reiter = (id: string) => document.querySelector(`[data-reiter="${id}"]`) as HTMLElement;

afterEach(() => {
  mockEchterDialog = false;
  window.history.replaceState(null, "", "/");
  jest.restoreAllMocks();
});

// =============================================
// 1. Reiter „Dokumente": Pille und ?tab=
// =============================================

describe("Reiter „Dokumente“", () => {
  it("trägt die Pille der laufenden Nachforderung („1 zu prüfen“, gelb) — mit Namen", async () => {
    fetchMit(vorgang());
    await seite();
    const pille = reiter("documents").querySelector('[data-pille="reiter"]') as HTMLElement;
    expect(pille.dataset.farbe).toBe("gelb");
    // Neben der Anzahl der Dokumente waere „1 zu prüfen" bzw. „1/3" ohne Namen
    // mehrdeutig: fuer Screenreader „Nachforderung:", im Tooltip der Kurzstand.
    expect(pille.textContent).toBe("Nachforderung: 1 zu prüfen");
    expect(pille.querySelector(".sr-only")?.textContent).toBe("Nachforderung: ");
    expect(pille.getAttribute("title")).toBe(
      "Nachforderung: 1 von 3 angenommen · 1 zu prüfen · 1 offen · Frist 26.09.2026",
    );
    // Die Anzahl der Dokumente bleibt daneben stehen.
    expect(reiter("documents").textContent).toBe("Dokumente2Nachforderung: 1 zu prüfen");
  });

  it("ohne laufende Nachforderung keine Pille", async () => {
    fetchMit(vorgang({ unterlagen: unterlagen({ nachforderungen: [] }) }));
    await seite();
    expect(reiter("documents").querySelector('[data-pille="reiter"]')).toBeNull();
  });

  it("?tab=dokumente öffnet den Reiter mit der Karte", async () => {
    window.history.replaceState(null, "", `/dashboard/${VORGANG}?tab=dokumente`);
    fetchMit(vorgang());
    await seite();
    expect(reiter("documents").getAttribute("aria-current")).toBe("page");
    expect(reiter("overview").getAttribute("aria-current")).toBeNull();
    expect(document.querySelector('[data-karte="unterlagen"]')).not.toBeNull();
  });

  it("ohne ?tab bleibt es bei „Übersicht“ — und die Reiterwahl danach funktioniert wie bisher", async () => {
    fetchMit(vorgang());
    await seite();
    expect(reiter("overview").getAttribute("aria-current")).toBe("page");
    fireEvent.click(reiter("documents"));
    expect(reiter("documents").getAttribute("aria-current")).toBe("page");
    fireEvent.click(reiter("checklist"));
    expect(reiter("checklist").getAttribute("aria-current")).toBe("page");
  });

  it("reiterAusSuche: deutsche Namen und interne Ids, Unbekanntes wird ignoriert", () => {
    expect(reiterAusSuche("?tab=dokumente")).toBe("documents");
    expect(reiterAusSuche("?tab=Dokumente")).toBe("documents");
    expect(reiterAusSuche("?tab=documents")).toBe("documents");
    expect(reiterAusSuche("?x=1&tab=checkliste")).toBe("checklist");
    expect(reiterAusSuche("?tab=fragebogen")).toBe("questionnaire");
    expect(reiterAusSuche("?tab=vorgesetzter")).toBe("supervisor");
    expect(reiterAusSuche("?tab=uebersicht")).toBe("overview");
    expect(reiterAusSuche("")).toBeNull();
    expect(reiterAusSuche("?tab=")).toBeNull();
    expect(reiterAusSuche("?tab=unbekannt")).toBeNull();
    // Keine Eigenschaft von Object.prototype.
    expect(reiterAusSuche("?tab=constructor")).toBeNull();
    expect(reiterAusSuche("?tab=__proto__")).toBeNull();
  });
});

// =============================================
// 2. Karte, Dialog und Meldung im Reiter „Dokumente"
// =============================================

function tabDokumente(teil: Partial<React.ComponentProps<typeof TabDocuments>> = {}, daten = vorgang()) {
  return render(
    <TabDocuments
      data={daten}
      onboardingId={VORGANG}
      canEdit
      onFristGeaendert={jest.fn()}
      paketDialogOffen={false}
      setPaketDialogOffen={jest.fn()}
      {...teil}
    />,
  );
}

/** a steht im Dokument vor b. */
function steht_vor(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("Karte „Unterlagen nachfordern“ im Reiter „Dokumente“", () => {
  it("steht nach „Dokumente versenden“ und vor den hochgeladenen Dokumenten", () => {
    tabDokumente();
    const paket = screen.getByTestId("dokumentenpaket");
    const karte = document.querySelector('[data-karte="unterlagen"]') as HTMLElement;
    const liste = screen.getByText("2 Dokumente hochgeladen");
    expect(karte).not.toBeNull();
    expect(steht_vor(paket, karte)).toBe(true);
    expect(steht_vor(karte, liste)).toBe(true);
    // Auch vor dem leeren Zustand der Liste.
    document.body.innerHTML = "";
    tabDokumente({}, vorgang({ documents: [] }));
    expect(
      steht_vor(
        document.querySelector('[data-karte="unterlagen"]') as HTMLElement,
        screen.getByText("Keine Dokumente hochgeladen"),
      ),
    ).toBe(true);
  });

  it("ohne Übersicht (ältere Antwort) keine Karte — der Reiter bleibt, wie er war", () => {
    tabDokumente({}, vorgang({ unterlagen: undefined }));
    expect(document.querySelector('[data-karte="unterlagen"]')).toBeNull();
    expect(screen.getByText("2 Dokumente hochgeladen")).toBeTruthy();
  });

  it("der Dialog öffnet mit Modus und Vorauswahl — nur mit Bearbeitungsrecht", () => {
    const erster = tabDokumente({ nachforderungDialog: { modus: "ergaenzen", vorauswahl: ["PKV_NACHWEIS"] } });
    const dialog = screen.getByRole("dialog", { name: "Unterlagen nachfordern" });
    expect(dialog.dataset.modus).toBe("ergaenzen");
    expect(dialog.dataset.vorauswahl).toBe('["PKV_NACHWEIS"]');
    erster.unmount();

    tabDokumente(
      { canEdit: false, nachforderungDialog: { modus: "neu", vorauswahl: null } },
      vorgang({ unterlagen: unterlagen({ darfAktionen: false }) }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("der Dialog bekommt Name · Vorgangsnummer und ein Fokusziel — eine benannte Gruppe um Meldung und Karte", () => {
    tabDokumente({ nachforderungDialog: { modus: "neu", vorauswahl: null } });
    const dialog = screen.getByRole("dialog", { name: "Unterlagen nachfordern" });
    expect(JSON.parse(dialog.dataset.kopf ?? "null")).toEqual({ name: "Anna Beispiel", vorgangsnummer: "2026-GYM-014" });
    const ziel = document.getElementById(dialog.dataset.fokusziel ?? "") as HTMLElement;
    expect(ziel.dataset.block).toBe("nachforderung");
    expect(ziel.getAttribute("tabindex")).toBe("-1");
    expect(ziel.getAttribute("role")).toBe("group");
    expect(ziel.getAttribute("aria-label")).toBe("Unterlagen nachfordern");
  });

  it("eine Aktion der Karte räumt die Meldung des Dialogs ab — keine zwei Meldungen zum selben Vorgang", async () => {
    // Masernschutz eingegangen (ohne Frist): „Annehmen" wirkt direkt, ohne Rueckfrage.
    const basis = laufendeNachforderung();
    const n: NachforderungEingabe = {
      ...basis,
      positionen: basis.positionen.map((p) =>
        p.id === "p-ms"
          ? {
              ...p,
              status: "EINGEREICHT",
              einreichungen: 1,
              uebermitteltAm: "2026-09-18T08:00:00.000Z",
              dateien: [datei({ id: "d-ms", anzeigeName: "impfpass.jpg", mimeType: "image/jpeg" })],
            }
          : p,
      ),
    };
    const f = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ meldung: "Die Unterlage ist angenommen." }) }));
    global.fetch = f as unknown as typeof fetch;
    const onUnterlagenMeldungSchliessen = jest.fn();
    const onAktualisiert = jest.fn();
    tabDokumente(
      {
        unterlagenMeldung: { art: "erfolg", meldung: "Die Unterlagen sind angefordert.", hinweis: null },
        onUnterlagenMeldungSchliessen,
        onAktualisiert,
      },
      vorgang({ unterlagen: unterlagen({ nachforderungen: [n] }) }),
    );
    const zeile = document.querySelector('[data-position="p-ms"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(zeile).getByRole("button", { name: "Annehmen – Masernschutz-Nachweis" }));
    });
    expect(f).toHaveBeenCalledWith(`/api/onboarding/${VORGANG}/unterlagen/positionen/p-ms`, expect.anything());
    expect(onAktualisiert).toHaveBeenCalledTimes(1);
    expect(onUnterlagenMeldungSchliessen).toHaveBeenCalledTimes(1);
  });

  it("„Unterlagen ergänzen…“ der Karte öffnet den Dialog über den Rückruf der Seite", () => {
    const onNachfordern = jest.fn();
    tabDokumente({ onNachfordern });
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen ergänzen…" }));
    expect(onNachfordern).toHaveBeenCalledWith({ modus: "ergaenzen", vorauswahl: null });
  });

  it("Meldung über der Karte: Warnung gelb, nie grün", () => {
    tabDokumente({ unterlagenMeldung: { art: "warnung", meldung: "Die E-Mail wurde nicht versendet.", hinweis: null } });
    const block = document.querySelector('[data-block="nachforderung"]') as HTMLElement;
    expect(within(block).queryByText("Die E-Mail wurde nicht versendet.")).not.toBeNull();
    expect(block.querySelector('[data-art="warnung"]')).not.toBeNull();
    expect(block.querySelector('[data-art="erfolg"]')).toBeNull();
    expect(steht_vor(block.querySelector('[data-art="warnung"]') as HTMLElement, block.querySelector('[data-karte="unterlagen"]') as HTMLElement)).toBe(true);
  });
});

describe("Ablauf in der Seite: Kasten → Dialog → Meldung", () => {
  it("„Unterlagen nachfordern…“ im Kasten wechselt in den Reiter, öffnet den Dialog mit den offenen Arten; nicht zugestellt: neu laden, schließen, rote Leiste", async () => {
    const ohneLaufende = vorgang({ unterlagen: unterlagen({ nachforderungen: [] }) });
    const f = fetchMit(ohneLaufende, vorgang());
    await seite();
    expect(reiter("overview").getAttribute("aria-current")).toBe("page");

    const kasten = document.querySelector('[data-kasten="offene-nachweise"]') as HTMLElement;
    fireEvent.click(within(kasten).getByRole("button", { name: "Unterlagen nachfordern…" }));

    expect(reiter("documents").getAttribute("aria-current")).toBe("page");
    const dialog = screen.getByRole("dialog", { name: "Unterlagen nachfordern" });
    expect(dialog.dataset.modus).toBe("neu");
    expect(dialog.dataset.vorauswahl).toBe('["MASERNSCHUTZ"]');

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Attrappe: Fehler" }));
    });

    // Neu geladen (leise: die Seite bleibt stehen), Dialog zu, rote Leiste.
    expect(f).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    const fehler = document.querySelector('[data-block="nachforderung"] [data-art="fehler"]') as HTMLElement;
    expect(fehler.textContent).toContain("Die E-Mail konnte nicht zugestellt werden");
    expect(fehler.getAttribute("role")).toBe("alert");
    expect(document.querySelector('[data-art="erfolg"]')).toBeNull();
    expect(document.querySelector('[data-art="warnung"]')).toBeNull();
    // Der neue Stand ist da: Pille am Reiter, Stand im Kasten.
    expect(reiter("documents").querySelector('[data-pille="reiter"]')?.textContent).toBe("Nachforderung: 1 zu prüfen");
    expect(document.querySelector('[data-nachweis="MASERNSCHUTZ"]')?.textContent).toContain("angefordert am 12.09.2026");
  });

  it("übersprungen (SKIPPED): gelbe Leiste, nie grün", async () => {
    fetchMit(vorgang({ unterlagen: unterlagen({ nachforderungen: [] }) }), vorgang());
    await seite();
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Attrappe: Warnung" }));
    });
    const warnung = document.querySelector('[data-block="nachforderung"] [data-art="warnung"]') as HTMLElement;
    expect(warnung.textContent).toContain("Vorlage deaktiviert");
    expect(document.querySelector('[data-art="erfolg"]')).toBeNull();
    expect(document.querySelector('[data-art="fehler"]')).toBeNull();
  });

  it("Erfolg: grüne Leiste", async () => {
    fetchMit(vorgang({ unterlagen: unterlagen({ nachforderungen: [] }) }), vorgang());
    await seite();
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Attrappe: Erfolg" }));
    });
    expect(document.querySelector('[data-art="erfolg"]')?.textContent).toContain("Die Unterlagen sind angefordert.");
  });

  it("„Zur Nachforderung“ wechselt in den Reiter „Dokumente“", async () => {
    fetchMit(vorgang());
    await seite();
    const kasten = document.querySelector('[data-kasten="offene-nachweise"]') as HTMLElement;
    fireEvent.click(within(kasten).getByRole("button", { name: "Zur Nachforderung" }));
    expect(reiter("documents").getAttribute("aria-current")).toBe("page");
    expect(document.activeElement?.getAttribute("data-block")).toBe("nachforderung");

    // Der Sprung gilt einmal: Wer spaeter selbst in den Reiter wechselt, landet
    // nicht erneut an der Karte.
    fireEvent.click(reiter("checklist"));
    fireEvent.click(reiter("documents"));
    expect(document.activeElement?.getAttribute("data-block")).not.toBe("nachforderung");
  });

  it("echter Dialog: Nach „Anfordern und E-Mail senden“ liegt der Fokus auf dem Block der Karte, nicht auf body", async () => {
    mockEchterDialog = true;
    const masern: AuswahlEintrag = {
      typ: "MASERNSCHUTZ",
      label: "Masernschutz-Nachweis",
      vorgeschlagen: true,
      sensibel: true,
      erlaubt: true,
      grund: null,
      originalErforderlich: false,
      fristpflichtig: false,
      hinweis: null,
    };
    const vorher = vorgang({ unterlagen: unterlagen({ nachforderungen: [], auswahl: [masern] }) });
    const nachher = vorgang();
    const mail = { status: "SENT" as const, detail: null };
    let geladen = 0;
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ nachforderungId: "nf-1", mail, ...aktionsTexte("anfordern", mail) }),
        };
      }
      const daten = geladen++ === 0 ? vorher : nachher;
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(daten)) };
    });
    global.fetch = f as unknown as typeof fetch;
    await seite();

    const knopf = within(document.querySelector('[data-kasten="offene-nachweise"]') as HTMLElement).getByRole("button", {
      name: "Unterlagen nachfordern…",
    });
    knopf.focus();
    fireEvent.click(knopf);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    // Name · Vorgangsnummer unter dem Titel.
    expect(dialog.textContent).toContain("Anna Beispiel · 2026-GYM-014");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Anfordern und E-Mail senden" }));
    });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    expect(f.mock.calls.some(([url, init]) => url === `/api/onboarding/${VORGANG}/unterlagen` && init?.method === "POST")).toBe(true);
    // Der ausloesende Knopf ist weg (jetzt „Zur Nachforderung") — der Fokus liegt auf dem Ersatzziel.
    expect(screen.queryByRole("button", { name: "Unterlagen nachfordern…" })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.getAttribute("data-block")).toBe("nachforderung");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Unterlagen nachfordern");
    expect(document.querySelector('[data-block="nachforderung"] [data-art="erfolg"]')?.textContent).toContain(
      "angefordert",
    );
  });

  it("echter Dialog, Mail nicht zugestellt (FAILED): rote Leiste über der Karte — angefordert, Weg über „Link erneut senden“", async () => {
    mockEchterDialog = true;
    const masern: AuswahlEintrag = {
      typ: "MASERNSCHUTZ",
      label: "Masernschutz-Nachweis",
      vorgeschlagen: true,
      sensibel: true,
      erlaubt: true,
      grund: null,
      originalErforderlich: false,
      fristpflichtig: false,
      hinweis: null,
    };
    const vorher = vorgang({ unterlagen: unterlagen({ nachforderungen: [], auswahl: [masern] }) });
    const nachher = vorgang();
    const mail = { status: "FAILED" as const, detail: "ETIMEDOUT" };
    let geladen = 0;
    const f = jest.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ nachforderungId: "nf-1", mail, ...aktionsTexte("anfordern", mail) }),
        };
      }
      const daten = geladen++ === 0 ? vorher : nachher;
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(daten)) };
    });
    global.fetch = f as unknown as typeof fetch;
    await seite();

    fireEvent.click(
      within(document.querySelector('[data-kasten="offene-nachweise"]') as HTMLElement).getByRole("button", {
        name: "Unterlagen nachfordern…",
      }),
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Anfordern und E-Mail senden" }));
    });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    const rot = document.querySelector('[data-block="nachforderung"] [data-art="fehler"]') as HTMLElement;
    expect(rot.textContent).toContain("Die Unterlagen sind angefordert.");
    expect(rot.textContent).toContain("Die E-Mail konnte nicht zugestellt werden");
    expect(rot.textContent).toContain(
      "Über „Link erneut senden“ in der Karte können Sie die E-Mail auch selbst noch einmal senden",
    );
    expect(document.querySelector('[data-block="nachforderung"] [data-art="warnung"]')).toBeNull();
    expect(document.querySelector('[data-block="nachforderung"] [data-art="erfolg"]')).toBeNull();
    // Den Weg gibt es wirklich: Die Karte der laufenden Nachforderung bietet ihn an.
    expect(within(document.querySelector('[data-karte="unterlagen"]') as HTMLElement).queryByRole("button", {
      name: "Link erneut senden",
    })).not.toBeNull();
  });

  it("ohne Bearbeitungsrecht: im Kasten kein „Unterlagen nachfordern…“", async () => {
    fetchMit(vorgang({ unterlagen: unterlagen({ nachforderungen: [], darfAktionen: false }) }));
    await seite({ ...USER, role: "VORGESETZTER" });
    expect(screen.queryByRole("button", { name: "Unterlagen nachfordern…" })).toBeNull();
  });
});

// =============================================
// 3. Dokumentenliste: Bezeichnung, Herkunft, Farben
// =============================================

describe("Dokumentenliste", () => {
  const karteVon = (id: string) => document.querySelector(`[data-dokument="${id}"]`) as HTMLElement;

  it("zeigt Document.bezeichnung über dem Dateinamen", () => {
    tabDokumente();
    const rv = karteVon("doc-rv");
    expect(rv.querySelector('[data-feld="bezeichnung"]')?.textContent).toBe("Unterschriebener RV-Antrag");
    expect(rv.textContent).toContain("rv-antrag.pdf");
    // Ohne Bezeichnung bleibt der Dateiname die Ueberschrift.
    expect(karteVon("doc-gb").querySelector('[data-feld="bezeichnung"]')).toBeNull();
  });

  it("„aus Nachforderung angenommen am …“ samt PDF-Hinweisen — nur am übernommenen Dokument", () => {
    tabDokumente();
    const herkunft = karteVon("doc-rv").querySelector('[data-feld="herkunft"]') as HTMLElement;
    expect(herkunft.textContent).toBe("aus Nachforderung angenommen am 16.09.2026(kennwortgeschützt)");
    expect(herkunft.querySelector('[data-hinweis="pdf"]')?.textContent).toBe("(kennwortgeschützt)");
    expect(karteVon("doc-gb").querySelector('[data-feld="herkunft"]')).toBeNull();
  });

  it("Aufenthaltstitel, Arbeitserlaubnis und PKV-Nachweis haben eigene Farben statt Grau", () => {
    tabDokumente(
      {},
      vorgang({
        documents: [
          dokument({ id: "d1", type: "AUFENTHALTSTITEL", gueltigBis: "2030-01-01T00:00:00.000Z" }),
          dokument({ id: "d2", type: "ARBEITSERLAUBNIS", gueltigBis: "2030-01-01T00:00:00.000Z" }),
          dokument({ id: "d3", type: "PKV_NACHWEIS" }),
          dokument({ id: "d4", type: "SONSTIGES" }),
        ],
      }),
    );
    const grau = "bg-gray-100";
    for (const [id, label] of [
      ["d1", "Aufenthaltstitel"],
      ["d2", "Arbeitserlaubnis / Zusatzblatt"],
      ["d3", "Nachweis private Krankenversicherung"],
    ] as const) {
      const badge = within(karteVon(id)).getByText(label);
      expect({ id, grau: badge.className.includes(grau) }).toEqual({ id, grau: false });
    }
    expect(within(karteVon("d4")).getByText("Sonstiges Dokument").className).toContain(grau);
  });
});

// =============================================
// 4. Mini-Karte „Dokumente" in der Status-Übersicht
// =============================================

function uebersichtTab(daten: DetailData) {
  render(
    <TabOverview
      data={daten}
      appUrl="https://hr.fes-credo.de"
      supervisorEmail=""
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
      onboardingId={VORGANG}
      setActiveTab={jest.fn()}
      oeffnePaketDialog={jest.fn()}
      oeffneAbteilungenDialog={jest.fn()}
      darfBearbeiten
    />,
  );
}

describe("Mini-Karte „Dokumente“", () => {
  it("trägt den Kurzstand der laufenden Nachforderung und ist dann nicht grün", () => {
    uebersichtTab(vorgang());
    const mini = document.querySelector('[data-mini-karte="Dokumente"]') as HTMLElement;
    expect(mini.textContent).toContain("2 Dateien");
    expect(mini.querySelector('[data-zeile="kurzstand"]')?.textContent).toBe(
      "Nachforderung: 1 von 3 angenommen · 1 zu prüfen · 1 offen · Frist 26.09.2026",
    );
    expect(mini.className).not.toContain("credo-gruen");
  });

  it("ohne laufende Nachforderung wie bisher: Anzahl, grün ab einem Dokument", () => {
    uebersichtTab(vorgang({ unterlagen: unterlagen({ nachforderungen: [] }) }));
    const mini = document.querySelector('[data-mini-karte="Dokumente"]') as HTMLElement;
    expect(mini.querySelector('[data-zeile="kurzstand"]')).toBeNull();
    expect(mini.className).toContain("credo-gruen");
  });
});

// =============================================
// 5. Z1: „Unbefristet" an der Dokumentenzeile
// =============================================

describe("Z1: Knopf „Unbefristet“ und Anzeige", () => {
  type AbzeichenDoc = React.ComponentProps<typeof AblaufAbzeichen>["doc"];
  const titel = (teil: Record<string, unknown> = {}) =>
    dokument({ id: "d1", type: "AUFENTHALTSTITEL", status: "APPROVED", ...teil }) as unknown as AbzeichenDoc;

  function antwort(koerper: unknown, ok = true) {
    return { ok, json: async () => koerper } as unknown as Response;
  }

  it("ohne gespeichertes Datum steht „Unbefristet“ direkt da und setzt das Kennzeichen", async () => {
    const f = jest.fn().mockResolvedValue(
      antwort({ id: "d1", type: "AUFENTHALTSTITEL", gueltigBis: null, unbefristet: true, status: "APPROVED" }),
    );
    global.fetch = f as unknown as typeof fetch;
    const onFristGeaendert = jest.fn();
    render(<AblaufAbzeichen doc={titel()} onboardingId={VORGANG} canEdit onFristGeaendert={onFristGeaendert} />);

    expect(document.body.textContent).toContain("Keine Frist hinterlegt");
    // Der neue Satz — der alte nannte das leere Feld „richtig so".
    expect(document.body.textContent).toContain(
      "Ist der Nachweis unbefristet (etwa eine Niederlassungserlaubnis), klicken Sie auf „Unbefristet“; andernfalls tragen Sie das Ablaufdatum bitte hier nach.",
    );
    expect(document.body.textContent).not.toContain("richtig so");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unbefristet" }));
    });
    expect(f).toHaveBeenCalledWith(
      `/api/onboarding/${VORGANG}/documents/d1`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ gueltigBis: null, unbefristet: true }) }),
    );
    expect(onFristGeaendert).toHaveBeenCalledWith("d1", { gueltigBis: null, status: "APPROVED", unbefristet: true });
  });

  it("mit gespeichertem Datum: „Ändern“ → „Unbefristet“ schickt dasselbe", async () => {
    const f = jest.fn().mockResolvedValue(antwort({ id: "d1", gueltigBis: null, unbefristet: true, status: "APPROVED" }));
    global.fetch = f as unknown as typeof fetch;
    render(
      <AblaufAbzeichen
        doc={titel({ gueltigBis: "2030-05-01T00:00:00.000Z" })}
        onboardingId={VORGANG}
        canEdit
        onFristGeaendert={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unbefristet" }));
    });
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      gueltigBis: null,
      unbefristet: true,
    });
  });

  it("ein unbefristetes Dokument zeigt „Unbefristet“ statt „Keine Frist hinterlegt“ — ein Datum lässt sich trotzdem setzen", async () => {
    const f = jest.fn().mockResolvedValue(
      antwort({ id: "d1", gueltigBis: "2031-01-01T00:00:00.000Z", unbefristet: false, status: "APPROVED" }),
    );
    global.fetch = f as unknown as typeof fetch;
    const onFristGeaendert = jest.fn();
    render(
      <AblaufAbzeichen doc={titel({ unbefristet: true })} onboardingId={VORGANG} canEdit onFristGeaendert={onFristGeaendert} />,
    );
    const block = document.querySelector('[data-ablauf="unbefristet"]') as HTMLElement;
    expect(within(block).getByText("Unbefristet")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Keine Frist hinterlegt");

    fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
    // Schon unbefristet: kein zweiter Knopf dafuer.
    expect(screen.queryByRole("button", { name: "Unbefristet" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Ablaufdatum für/), { target: { value: "2031-01-01" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    });
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      gueltigBis: "2031-01-01",
    });
    expect(onFristGeaendert).toHaveBeenCalledWith("d1", {
      gueltigBis: "2031-01-01T00:00:00.000Z",
      status: "APPROVED",
      unbefristet: false,
    });
  });

  it("ohne Bearbeitungsrecht: nur die Auskunft, kein Knopf", () => {
    const erster = render(
      <AblaufAbzeichen doc={titel()} onboardingId={VORGANG} canEdit={false} onFristGeaendert={jest.fn()} />,
    );
    expect(within(erster.container).queryAllByRole("button")).toHaveLength(0);
    erster.unmount();
    render(
      <AblaufAbzeichen doc={titel({ unbefristet: true })} onboardingId={VORGANG} canEdit={false} onFristGeaendert={jest.fn()} />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent).toContain("Unbefristet");
  });

  it("nach „Unbefristet“ liegt der Fokus auf „Ändern“ — der geklickte Knopf ist verschwunden", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        antwort({ id: "d1", gueltigBis: null, unbefristet: true, status: "APPROVED" }),
      ) as unknown as typeof fetch;
    // Die Seite uebernimmt die Aenderung in ihren Zustand — wie `setzeDokumentFrist`.
    function MitZustand() {
      const [doc, setDoc] = useState<AbzeichenDoc>(titel());
      return (
        <AblaufAbzeichen
          doc={doc}
          onboardingId={VORGANG}
          canEdit
          onFristGeaendert={(id, aenderung) => setDoc((d) => fristAenderungUebernehmen([d], id, aenderung)[0])}
        />
      );
    }
    render(<MitZustand />);
    const knopf = screen.getByRole("button", { name: "Unbefristet" });
    knopf.focus();
    await act(async () => {
      fireEvent.click(knopf);
    });
    expect(document.querySelector('[data-ablauf="unbefristet"]')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ändern" }));
  });

  it("scheitert „Unbefristet“, meldet sich der Fehler als Alarm", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(antwort({ error: "Keine Berechtigung" }, false)) as unknown as typeof fetch;
    render(<AblaufAbzeichen doc={titel()} onboardingId={VORGANG} canEdit onFristGeaendert={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unbefristet" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Keine Berechtigung");
  });

  it("fristAenderungUebernehmen übernimmt das Kennzeichen — und lässt es ohne Angabe stehen", () => {
    const liste = [titel(), titel({ id: "d2" })] as Array<AbzeichenDoc & { id: string }>;
    const neu = fristAenderungUebernehmen(liste, "d1", { gueltigBis: null, status: "APPROVED", unbefristet: true });
    expect(neu[0]).toMatchObject({ gueltigBis: null, unbefristet: true });
    expect(neu[1]).toBe(liste[1]);
    const ohne = fristAenderungUebernehmen([titel({ unbefristet: true })], "d1", { gueltigBis: null });
    expect(ohne[0]).toMatchObject({ unbefristet: true });
  });
});
