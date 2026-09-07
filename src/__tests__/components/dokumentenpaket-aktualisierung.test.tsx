/**
 * @jest-environment jsdom
 */

/**
 * Die Anzeige nach einem Paketversand — beide Haelften der Kette.
 *
 * Der Versand legt in seiner Nachweis-Transaktion fuer JEDE mitgeschickte
 * Vorlage ein neues GeneratedDocument mit Versandbezug an. Die Karte "Dokumente
 * erstellen" und die Karte "Dokumente versenden" sind aber Geschwister und
 * kennen einander nicht: Ohne ein Signal von der einen zur anderen fehlten die
 * frisch versendeten Schreiben bis zum naechsten Seitenwechsel komplett aus der
 * Liste "Fuer diesen Vorgang bereits erstellt" — das gruene Etikett "per E-Mail
 * versendet" ist nur der auffaelligste Teil davon.
 *
 * Belegt werden deshalb drei Dinge, die sich alle drei nur in der
 * React-Verdrahtung zeigen und mit reinen Funktionen nicht pruefbar sind:
 *
 *  1. TemplateGenerationSection laedt die Liste genau dann nach, wenn der
 *     Zaehler steigt — und beim Startwert 0 eben NICHT ein zweites Mal.
 *  2. DokumentenpaketSection reicht die Meldung des Dialogs sowohl an ihr
 *     eigenes Nachladen als auch nach oben weiter. Damit haengt die Kette
 *     Dialog → Karte → Elternteil im Test und nicht nur im Kopf.
 *  3. Die Karte behauptet nach einem Versand mit gescheitertem Nachweis nicht
 *     wieder "Noch nicht versendet". Das ist der gefaehrlichste Fall: Die Mail
 *     ist raus, der Nachweis fehlt — und die naechste Handlung waere der zweite
 *     Versand desselben Pakets.
 *
 * Umgebung und JSX-Uebersetzung wie in dokumentenpaket-dialog.test.tsx: jsdom
 * im Docblock (jest.config.ts bleibt global auf "node"), JSX aus der einen
 * transform-Regel in jest.config.ts, und ohne @testing-library/jest-dom — die
 * Zusicherungen kommen mit queryByText, textContent und nativen
 * DOM-Eigenschaften aus.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TemplateGenerationSection } from "@/components/template-generation-section";
import { DokumentenpaketSection } from "@/components/dokumentenpaket-section";
import type { PaketAngebotJson } from "@/lib/types/dokumentenpaket";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln
// darf. @testing-library/react setzt sie selbst, aber nur beim ersten render.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Der Ersatz-Dialog macht die Meldung nach oben zu einem Knopf — so haengt
 * dieser Test nicht an der Vorpruefung, der Groessengrenze und den
 * Bestaetigungshaken des echten Dialogs, die alle drei mit der Frage nach der
 * NACHFOLGENDEN Kette nichts zu tun haben.
 *
 * WICHTIG, und lange uebersehen: Damit ist hier die Annahme "der echte Dialog
 * ruft onVersendet() schon" nur GESETZT, nicht geprueft. Waere sie sonst
 * nirgends belegt, bliebe diese Suite gruen, waehrend die Kette im Betrieb an
 * ihrem ersten Glied risse — die Karte sagte nach einem erfolgreichen Versand
 * weiter "Noch nicht versendet" und verleitete zum Doppelversand. Das erste
 * Glied steht deshalb in dokumentenpaket-dialog.test.tsx, Abschnitt 5
 * ("Versand: der Dialog meldet nach oben"): am echten Dialog, mit Klick auf
 * "Versenden". Wer den Ersatz hier anfasst, muss dort nachsehen.
 */
jest.mock("@/components/dokumentenpaket-dialog", () => ({
  DokumentenpaketDialog: ({ onVersendet }: { onVersendet: () => void }) => (
    <button type="button" onClick={onVersendet}>
      Ersatz-Dialog: Versand melden
    </button>
  ),
}));

const seitentext = () => document.body.textContent ?? "";

function antwort(daten: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, json: async () => ({ data: daten }) } as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================
// 1. "Bereits erstellt" laedt beim steigenden Zaehler nach
// =============================================

/** Ein erzeugtes Dokument, wie es GET /api/brief-vorlagen/erzeugt liefert. */
const ERZEUGT = {
  id: "gen-1",
  name: "Willkommensschreiben",
  createdAt: "2026-09-04T08:00:00.000Z",
  erstelltVon: "HR",
  hatDocx: true,
  hatPdf: true,
  fehlendeFelder: 0,
};

describe("TemplateGenerationSection: Liste nach dem Versand", () => {
  /** Zaehlt die beiden Endpunkte getrennt — die Praefixe ueberschneiden sich. */
  function netzAufbauen() {
    const zaehler = { vorlagen: 0, erzeugt: 0 };
    global.fetch = jest.fn((eingabe: RequestInfo | URL) => {
      const url = String(eingabe);
      // ZUERST der laengere Pfad: "/api/brief-vorlagen/erzeugt" beginnt selbst
      // mit "/api/brief-vorlagen", die umgekehrte Reihenfolge zaehlte falsch.
      if (url.startsWith("/api/brief-vorlagen/erzeugt")) {
        zaehler.erzeugt += 1;
        return antwort([
          zaehler.erzeugt === 1
            ? { ...ERZEUGT, versendetAm: null, versendetAn: null }
            : {
                ...ERZEUGT,
                versendetAm: "2026-09-04T09:00:00.000Z",
                versendetAn: "neu@example.org",
              },
        ]);
      }
      zaehler.vorlagen += 1;
      return antwort([]);
    }) as unknown as typeof fetch;
    return zaehler;
  }

  it("laedt erst beim steigenden Zaehler nach und zeigt dann das Etikett", async () => {
    const zaehler = netzAufbauen();

    const { rerender } = render(
      <TemplateGenerationSection modul="ONBOARDING" refId="vorgang-1" canEdit aktualisierung={0} />,
    );

    await waitFor(() => expect(zaehler.erzeugt).toBe(1));
    // Vor dem Versand ist das Dokument da, aber ohne Versandbezug.
    await screen.findByText("Willkommensschreiben");
    expect(screen.queryByText("per E-Mail versendet")).toBeNull();

    rerender(
      <TemplateGenerationSection modul="ONBOARDING" refId="vorgang-1" canEdit aktualisierung={1} />,
    );

    await waitFor(() => expect(zaehler.erzeugt).toBe(2));
    await screen.findByText("per E-Mail versendet");

    // Die VORLAGENliste aendert ein Versand nicht — sie darf deshalb kein
    // zweites Mal gefragt werden. Sonst waere der Zaehler ein verkappter
    // Komplettreload.
    expect(zaehler.vorlagen).toBe(1);
  });

  it("laedt beim Startwert 0 genau einmal, nicht doppelt", async () => {
    const zaehler = netzAufbauen();

    render(
      <TemplateGenerationSection modul="ONBOARDING" refId="vorgang-1" canEdit aktualisierung={0} />,
    );

    await screen.findByText("Willkommensschreiben");
    // Der zweite Effekt haelt beim Startwert still. Ohne die Bedingung liefe
    // der erste Ladelauf jedes Mal doppelt — zwei Anfragen fuer nichts.
    expect(zaehler.erzeugt).toBe(1);
  });

  it("bleibt ohne die Prop unveraendert (Default 0)", async () => {
    const zaehler = netzAufbauen();

    // Der Zaehler ist optional: Wer die Karte ohne ihn einbindet, bekommt genau
    // das bisherige Verhalten.
    render(<TemplateGenerationSection modul="ONBOARDING" refId="vorgang-1" canEdit />);

    await screen.findByText("Willkommensschreiben");
    expect(zaehler.erzeugt).toBe(1);
  });
});

// =============================================
// 2./3. Die Versandkarte: Rueckruf nach oben und ehrlicher Statussatz
// =============================================

function machAngebot(teil: Partial<PaketAngebotJson> = {}): PaketAngebotJson {
  return {
    modul: "ONBOARDING",
    organizationId: "org-1",
    empfaengerVorschlag: "max@example.org",
    vorname: "Max",
    nachname: "Muster",
    displayId: "ONB-1",
    standardpaket: [{ art: "PDF", id: "pdf-leitbild" }],
    verfuegbar: [
      {
        art: "PDF",
        id: "pdf-leitbild",
        name: "Leitbild",
        beschreibung: null,
        scope: "GLOBAL",
        groesse: 2048,
        sensibleFelder: [],
      },
    ],
    verlauf: [],
    altversand: null,
    maxBytes: 15 * 1024 * 1024,
    ...teil,
  };
}

describe("DokumentenpaketSection: Meldung des Dialogs", () => {
  /**
   * Antwortet auf GET /api/dokumentenpaket der Reihe nach mit den uebergebenen
   * Angeboten; das letzte gilt fuer alle weiteren Aufrufe. So laesst sich der
   * Stand VOR und NACH dem Versand getrennt vorgeben.
   */
  function netzAufbauen(...angebote: PaketAngebotJson[]) {
    const zaehler = { angebot: 0 };
    global.fetch = jest.fn(() => {
      const naechstes = angebote[Math.min(zaehler.angebot, angebote.length - 1)];
      zaehler.angebot += 1;
      return antwort(naechstes);
    }) as unknown as typeof fetch;
    return zaehler;
  }

  async function versandMelden() {
    // Karte oeffnen (der Dialog haengt an `offen`), dann den Ersatz-Dialog
    // melden lassen.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dokumente versenden…" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ersatz-Dialog: Versand melden" }));
    });
  }

  it("laedt das eigene Angebot nach UND reicht die Meldung nach oben", async () => {
    // Zweiter Abruf mit Verlauf: der Regelfall, in dem der Nachweis steht.
    const zaehler = netzAufbauen(
      machAngebot(),
      machAngebot({
        verlauf: [
          {
            id: "v1",
            createdAt: "2026-09-04T09:00:00.000Z",
            empfaenger: "neu@example.org",
            anzahl: 2,
            empfaengerAbweichend: false,
          },
        ],
      }),
    );
    const nachOben = jest.fn();

    render(
      <DokumentenpaketSection
        modul="ONBOARDING"
        refId="ref-1"
        canEdit
        onVersendet={nachOben}
      />,
    );
    await screen.findByText("Noch nicht versendet");

    await versandMelden();

    // Beides muss passieren: das eigene Nachladen (sonst stuende die Karte auf
    // dem Stand von vor dem Versand) und der Rueckruf nach oben (sonst erfaehrt
    // die Geschwisterkarte nichts von den neuen Dokumenten).
    await waitFor(() => expect(zaehler.angebot).toBe(2));
    expect(nachOben).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(seitentext()).toContain("Zuletzt am"));
    expect(seitentext()).toContain("neu@example.org");
  });

  it("behauptet nach gescheitertem Nachweis nicht wieder 'Noch nicht versendet'", async () => {
    // Der Warnfall: Ergebnis SENT, aber die Nachweis-Transaktion ist
    // zurueckgerollt — der Server kennt weder Verlauf noch Altversand.
    const zaehler = netzAufbauen(machAngebot());

    render(<DokumentenpaketSection modul="ONBOARDING" refId="ref-1" canEdit />);
    await screen.findByText("Noch nicht versendet");

    await versandMelden();

    await waitFor(() => expect(zaehler.angebot).toBe(2));
    expect(screen.queryByText("Noch nicht versendet")).toBeNull();
    expect(seitentext()).toContain("Soeben versendet");
    // Und der Knopf lockt nicht mehr zum ersten Versand.
    expect(screen.queryByRole("button", { name: "Dokumente versenden…" })).toBeNull();
    screen.getByRole("button", { name: "Erneut versenden…" });
  });

  it("kommt ohne die Prop aus — der Rueckruf ist optional", async () => {
    const zaehler = netzAufbauen(machAngebot());

    render(<DokumentenpaketSection modul="ONBOARDING" refId="ref-1" canEdit />);
    await screen.findByText("Noch nicht versendet");

    // Ohne onVersendet darf die Karte nicht an `undefined` scheitern; ihr
    // eigenes Nachladen laeuft trotzdem.
    await versandMelden();
    await waitFor(() => expect(zaehler.angebot).toBe(2));
  });
});
