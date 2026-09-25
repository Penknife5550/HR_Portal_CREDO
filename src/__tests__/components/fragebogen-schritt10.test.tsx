/**
 * @jest-environment jsdom
 */

/**
 * Schritt 10 des Personalfragebogens — die Stelle, an der die bedingten
 * Pflichtdokumente entstehen muessen.
 *
 * WARUM ES DIESE SUITE GIBT. `DocumentUpload` nimmt die vier Angaben, aus denen
 * die bedingten Pflichten hervorgehen (`geburtsdatum`, `organisationstyp`,
 * `aufenthaltstitelErforderlich`, `healthInsuranceType`), als OPTIONALE Props
 * entgegen. Wer sie im Aufruf vergisst, bekommt keinen Typfehler, keine
 * Warnung und keinen roten Test: Jede der vier Bedingungen faellt still auf
 * „nicht pflichtig", `effektivePflichtDokumente` hat die regelbasierten Typen
 * zuvor ausnahmslos aus der Vorlagenliste geworfen, und in der Karte
 * „Pflichtdokumente" steht am Ende schlicht ein Eintrag weniger.
 *
 * Genau so war es: Der Aufruf reichte keinen der vier Werte durch.
 * Aufenthaltstitel, Arbeitserlaubnis und PKV-Nachweis konnten nie entstehen,
 * und der Masernschutz — der vor der Umstellung noch ueber `required` durchkam
 * — war eine Regression. Die 45 Tests der Bibliothek blieben dabei gruen, weil
 * sie die reinen Funktionen mit vollstaendigen Eingaben aufrufen. Deshalb prueft
 * diese Suite am GERENDERTEN Schritt und nicht an der Bibliothek.
 *
 * Umgebung wie in fragebogen-schritt6.test.tsx: jsdom im Docblock, JSX aus der
 * einen transform-Regel in jest.config.ts, ohne @testing-library/jest-dom.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Step10Summary } from "@/app/fragebogen/[token]/steps/step10-summary";
import {
  ARBEITSERLAUBNIS_HINWEIS,
  AUFENTHALTSTITEL_HINWEIS,
  MASERNSCHUTZ_HINWEIS,
  NACHREICHEN_FOLGEN_HINWEIS,
  PKV_NACHWEIS_HINWEIS,
} from "@/lib/required-documents";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const TOKEN = "magic-token-1234567890";

/**
 * Der Bestand, den `DocumentUpload` beim Aufbau laedt.
 *
 * Leer, aber ERFOLGREICH: Bei einem Ladefehler zeigt die Komponente bewusst gar
 * keine Liste, und dann prueften die Zusicherungen unten nur noch, dass ein
 * Fehlerkasten dasteht.
 */
function dokumentenliste(typen: string[], fristen: Record<string, string> = {}) {
  return typen.map((typ, i) => ({
    id: `doc${i}`,
    fileName: `${typ.toLowerCase()}.pdf`,
    fileSize: 1024,
    type: typ,
    // `null` heisst „keine Frist erfasst" — genau der Zustand, den die
    // Nachtrag-Zeile aufloesen koennen muss.
    gueltigBis: fristen[typ] ?? null,
    uploadedAt: "2026-09-08T10:00:00.000Z",
  }));
}

function bestand(typen: string[] = [], fristen: Record<string, string> = {}) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ documents: dokumentenliste(typen, fristen) }),
  });
}

/**
 * Ein Bestand, der sich durch einen ECHTEN Upload aendert.
 *
 * Der Umweg ueber die Route ist Absicht: Nur so laeuft dieselbe Kette wie in
 * der Anwendung — POST, danach Neuladen, danach der Rueckkanal nach oben. Ein
 * von Hand gesetzter Zustand bewiese ueber die Frage, ob der Kasten der
 * Upload-Karte hinterherlaeuft, gar nichts.
 */
function bestandMitUpload(vorher: string[], nachher: string[]) {
  let geladen = 0;
  return jest.fn(async (_url: unknown, init?: { method?: string }) => {
    if (init?.method === "POST") {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    geladen += 1;
    return {
      ok: true,
      json: async () => ({
        documents: dokumentenliste(geladen === 1 ? vorher : nachher),
      }),
    };
  });
}

interface Lage {
  /** Einrichtungstyp des Mandanten — Teil der Masernschutz-Regel. */
  organisationstyp?: string;
  /** Die Angaben des Beschaeftigten, so wie sie im Formularzustand stehen. */
  angaben?: Record<string, unknown>;
  requiredDocuments?: string[];
}

async function rendern(lage: Lage = {}) {
  const angaben = lage.angaben ?? {};
  const onSubmit = jest.fn();
  render(
    <Step10Summary
      data={angaben}
      allData={angaben}
      onBack={jest.fn()}
      saving={false}
      onSubmit={onSubmit}
      organization={{
        name: "Grundschule Beispiel",
        mandantNumber: "0815",
        type: lage.organisationstyp ?? "GRUNDSCHULE",
      }}
      token={TOKEN}
      requiredDocuments={lage.requiredDocuments ?? ["GEBURTSURKUNDE_EIGEN"]}
    />,
  );
  // Der Bestand wird im Effekt geladen; ohne dieses Warten liefe die erste
  // Zusicherung gegen den Zustand vor der Antwort.
  await waitFor(() =>
    expect(screen.getByText("Pflichtdokumente")).not.toBeNull(),
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  return { onSubmit };
}

/**
 * Die Karte „Pflichtdokumente" allein.
 *
 * Ungefiltert waeren die Zusicherungen wertlos: „Aufenthaltstitel" steht auch
 * im Auswahlfeld der freiwilligen Unterlagen — allerdings nur dann, wenn der
 * Typ KEINE Pflicht ist (die Komponente nimmt Pflichttypen dort heraus). Ein
 * `getByText` ueber die ganze Seite fände also in beiden Faellen etwas.
 */
function pflichtkarte(): HTMLElement {
  const karte = screen.getByText("Pflichtdokumente").closest("div");
  if (!karte) throw new Error("Karte „Pflichtdokumente“ nicht gefunden");
  return karte as HTMLElement;
}

/** Die Auswahlliste der freiwilligen Unterlagen. */
function optionsAuswahl(): HTMLSelectElement {
  return screen.getByRole("combobox") as HTMLSelectElement;
}

/** Die Ueberschrift des Ausblicks — als Regex, damit der Gedankenstrich nicht stoert. */
const KASTEN_TITEL = /Diese Nachweise fehlen noch/;

/** Der Ausblick auf die nachreichbaren Pflichten, falls er ueberhaupt dasteht. */
function nachreichKasten(): HTMLElement | null {
  const titel = screen.queryByText(KASTEN_TITEL);
  return titel ? (titel.closest("div") as HTMLElement) : null;
}

/**
 * Das versteckte Dateifeld einer Pflichtzeile.
 *
 * Es traegt weder Label noch Rolle (es wird ueber den Knopf daneben ausgeloest),
 * deshalb der Weg ueber die Beschriftung nach oben bis zu der Zeile, die ein
 * Dateifeld enthaelt.
 */
function dateiFeldFuer(label: string): HTMLInputElement {
  let el: HTMLElement | null = within(pflichtkarte()).getByText(label);
  while (el) {
    const feld = el.querySelector('input[type="file"]');
    if (feld) return feld as HTMLInputElement;
    el = el.parentElement;
  }
  throw new Error(`Kein Dateifeld für „${label}“ gefunden`);
}

/** Eine Unterlage ueber den echten Upload-Weg hochladen. */
async function hochladen(label: string) {
  const feld = dateiFeldFuer(label);
  const datei = new File(["%PDF-1.4"], "nachweis.pdf", {
    type: "application/pdf",
  });
  await act(async () => {
    fireEvent.change(feld, { target: { files: [datei] } });
  });
}

/**
 * Den Fragebogen bis zum Ende durchklicken: Ort, beide Haken, Absenden,
 * Bestaetigung.
 */
async function absenden() {
  fireEvent.change(screen.getByLabelText(/^Ort/), {
    target: { value: "Minden" },
  });
  for (const haken of screen.getAllByRole("checkbox")) {
    fireEvent.click(haken);
  }
  const knopf = screen.getByText(
    "Fragebogen verbindlich absenden",
  ) as HTMLButtonElement;
  // Waere er gesperrt, ginge der Klick ins Leere und der Test bewiese das
  // Gegenteil dessen, was er behauptet.
  expect(knopf.disabled).toBe(false);
  fireEvent.click(knopf);
  fireEvent.click(await screen.findByText("Ja, jetzt absenden"));
}

beforeEach(() => {
  jest.clearAllMocks();
  (global as unknown as { fetch: unknown }).fetch = bestand();
});

// =============================================
// 1 — Die vier bedingten Pflichten entstehen ueberhaupt
// =============================================
describe("Bedingte Pflichtdokumente in der Zusammenfassung", () => {
  it("verlangt den Masernschutz-Nachweis an einer Gemeinschaftseinrichtung", async () => {
    await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: { birthDate: "1990-04-17" },
    });

    const karte = pflichtkarte();
    expect(within(karte).getByText("Masernschutz-Nachweis")).not.toBeNull();
    // Der Hinweistext gehoert dazu: Ohne ihn wirkt die Unterlage wie eine
    // Sperre, und die Person bricht ab.
    expect(within(karte).getByText(MASERNSCHUTZ_HINWEIS)).not.toBeNull();
  });

  it("verlangt Aufenthaltstitel UND Arbeitserlaubnis nach einem Ja in Schritt 1", async () => {
    await rendern({
      angaben: { birthDate: "1965-01-01", aufenthaltstitelErforderlich: true },
    });

    const karte = pflichtkarte();
    expect(within(karte).getByText("Aufenthaltstitel")).not.toBeNull();
    expect(
      within(karte).getByText("Arbeitserlaubnis / Zusatzblatt"),
    ).not.toBeNull();
    expect(within(karte).getByText(AUFENTHALTSTITEL_HINWEIS)).not.toBeNull();
    expect(within(karte).getByText(ARBEITSERLAUBNIS_HINWEIS)).not.toBeNull();
  });

  it("erfasst bei beiden fristpflichtigen Nachweisen das Ablaufdatum", async () => {
    // Ohne das Datum kann die Fristenueberwachung nichts sagen — und die
    // Erinnerung vor Ablauf war der Grund fuer das ganze Feld.
    await rendern({
      angaben: { birthDate: "1965-01-01", aufenthaltstitelErforderlich: true },
    });

    const felder = within(pflichtkarte()).getAllByLabelText(
      "Gültig bis (Ablaufdatum)",
    );
    expect(felder).toHaveLength(2);
    for (const feld of felder) {
      expect((feld as HTMLInputElement).type).toBe("date");
    }
  });

  it("verlangt den PKV-Nachweis bei privat Versicherten", async () => {
    await rendern({
      angaben: { birthDate: "1965-01-01", healthInsuranceType: "privat" },
    });

    const karte = pflichtkarte();
    expect(
      within(karte).getByText("Nachweis private Krankenversicherung"),
    ).not.toBeNull();
    expect(within(karte).getByText(PKV_NACHWEIS_HINWEIS)).not.toBeNull();
  });

  it("bringt alle vier nebeneinander hervor", async () => {
    // Der Fall aus der Meldung: Bewerberin, 1990 geboren, Grundschule,
    // Aufenthaltstitel „Ja", privat versichert.
    await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: {
        birthDate: "1990-04-17",
        aufenthaltstitelErforderlich: true,
        healthInsuranceType: "privat",
      },
    });

    const karte = pflichtkarte();
    for (const label of [
      "Masernschutz-Nachweis",
      "Aufenthaltstitel",
      "Arbeitserlaubnis / Zusatzblatt",
      "Nachweis private Krankenversicherung",
    ]) {
      expect(within(karte).getByText(label)).not.toBeNull();
    }
  });
});

// =============================================
// 2 — Und sie entstehen NICHT, wo sie nicht hingehoeren
// =============================================
describe("Die Grenzen der Regeln bleiben gewahrt", () => {
  it("verlangt in der Verwaltung keinen Masernschutz-Nachweis", async () => {
    // Fuer VERWALTUNG traegt IfSG § 20 Abs. 8 nicht. Ein Gesundheitsdatum ohne
    // Rechtsgrundlage waere ein Verstoss gegen Art. 9 DSGVO — auch dann, wenn
    // HR den Typ im Vorlagen-Editor angehakt hat.
    await rendern({
      organisationstyp: "VERWALTUNG",
      angaben: { birthDate: "1990-04-17" },
      requiredDocuments: ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ"],
    });

    expect(
      within(pflichtkarte()).queryByText("Masernschutz-Nachweis"),
    ).toBeNull();
    // Freiwillig bleibt er waehlbar.
    expect(
      within(optionsAuswahl()).getByText("Masernschutz-Nachweis"),
    ).not.toBeNull();
  });

  it("verlangt keinen Aufenthaltstitel, solange die Frage unbeantwortet ist", async () => {
    // `null` heisst „noch nicht gefragt", nicht „ja". Wer nie gefragt wurde,
    // darf nicht an einer Forderung haengenbleiben.
    for (const wert of [null, undefined, false]) {
      cleanup();
      await rendern({
        organisationstyp: "VERWALTUNG",
        angaben: {
          birthDate: "1965-01-01",
          aufenthaltstitelErforderlich: wert,
        },
        requiredDocuments: ["GEBURTSURKUNDE_EIGEN", "AUFENTHALTSTITEL"],
      });
      const karte = pflichtkarte();
      expect(within(karte).queryByText("Aufenthaltstitel")).toBeNull();
      expect(
        within(karte).queryByText("Arbeitserlaubnis / Zusatzblatt"),
      ).toBeNull();
    }
  });

  it("verlangt bei gesetzlich Versicherten keinen PKV-Nachweis", async () => {
    await rendern({
      organisationstyp: "VERWALTUNG",
      angaben: {
        birthDate: "1965-01-01",
        healthInsuranceType: "gesetzlich",
      },
      requiredDocuments: ["GEBURTSURKUNDE_EIGEN", "PKV_NACHWEIS"],
    });

    expect(
      within(pflichtkarte()).queryByText("Nachweis private Krankenversicherung"),
    ).toBeNull();
  });
});

// =============================================
// 3 — „Nachreichbar" wird ausgesprochen, nicht nur gemeint
// =============================================
describe("Ausblick auf die nachreichbaren Pflichten", () => {
  it("nennt die offenen Unterlagen und sagt, was nach dem Absenden folgt", async () => {
    await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: {
        birthDate: "1990-04-17",
        aufenthaltstitelErforderlich: true,
        healthInsuranceType: "privat",
      },
    });

    // Der Kasten kommt erst, wenn die Upload-Karte ihren Bestand gemeldet hat
    // — er haengt genau an diesem Rueckkanal und nicht an einer eigenen Rechnung.
    await screen.findByText(KASTEN_TITEL);
    const kasten = nachreichKasten() as HTMLElement;
    expect(kasten).not.toBeNull();

    for (const label of [
      "Masernschutz-Nachweis",
      "Aufenthaltstitel",
      "Arbeitserlaubnis / Zusatzblatt",
      "Nachweis private Krankenversicherung",
    ]) {
      expect(within(kasten).getByText(label)).not.toBeNull();
    }

    // Die drei Zusagen des Hinweises: absenden ist frei, der Vorgang bleibt
    // offen gefuehrt, und der Link traegt danach nicht mehr.
    const text = within(kasten).getByText(NACHREICHEN_FOLGEN_HINWEIS)
      .textContent as string;
    expect(text).toMatch(/absenden/i);
    expect(text).toContain("Nachweis offen");
    expect(text).toMatch(/nach dem Absenden nichts mehr hochladen/);
    // Paket 4: der Weg danach — HR fordert an, dann kommt der eigene Link.
    expect(text).toContain("E-Mail mit einem persönlichen Link");
    expect(text).not.toContain("kommt auf Sie zu");
  });

  it("bleibt weg, wenn es nichts nachzureichen gibt", async () => {
    // Ein Kasten ohne Inhalt waere ausgerechnet auf der Seite, auf der die
    // Person die Richtigkeit ihrer Angaben verbindlich erklaert, nur eine
    // offene Frage.
    await rendern({
      organisationstyp: "VERWALTUNG",
      angaben: {
        birthDate: "1965-01-01",
        aufenthaltstitelErforderlich: false,
        healthInsuranceType: "gesetzlich",
      },
    });

    expect(nachreichKasten()).toBeNull();
  });

  it("zaehlt nur auf, was wirklich noch fehlt", async () => {
    // Der Kern des Rueckkanals: Der Masernschutz-Nachweis liegt vor. Stuende er
    // trotzdem im Kasten, laese die Person unmittelbar vor der verbindlichen
    // Abgabe, sie habe etwas vergessen — und suchte nach einer Unterlage, die
    // sie gerade hochgeladen hat.
    (global as unknown as { fetch: unknown }).fetch = bestand([
      "GEBURTSURKUNDE_EIGEN",
      "MASERNSCHUTZ",
    ]);
    await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: {
        birthDate: "1990-04-17",
        aufenthaltstitelErforderlich: true,
        healthInsuranceType: "privat",
      },
    });

    await screen.findByText(KASTEN_TITEL);
    const kasten = nachreichKasten() as HTMLElement;
    for (const label of [
      "Aufenthaltstitel",
      "Arbeitserlaubnis / Zusatzblatt",
      "Nachweis private Krankenversicherung",
    ]) {
      expect(within(kasten).getByText(label)).not.toBeNull();
    }
    expect(within(kasten).queryByText("Masernschutz-Nachweis")).toBeNull();
  });

  it("verschwindet, sobald die letzte offene Unterlage hochgeladen ist", async () => {
    (global as unknown as { fetch: unknown }).fetch = bestandMitUpload(
      ["GEBURTSURKUNDE_EIGEN"],
      ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ"],
    );
    await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: { birthDate: "1990-04-17" },
    });

    await screen.findByText(KASTEN_TITEL);
    expect(
      within(nachreichKasten() as HTMLElement).getByText(
        "Masernschutz-Nachweis",
      ),
    ).not.toBeNull();

    await hochladen("Masernschutz-Nachweis");

    // Die Karte oben und der Kasten unten muessen dasselbe sagen — sie haengen
    // an derselben Liste, deshalb gibt es hier keinen Zwischenzustand, in dem
    // die Zeile „Hochgeladen" meldet und der Kasten sie noch vermisst.
    await waitFor(() =>
      // Beide Pflichtzeilen — die Geburtsurkunde lag schon vor, der
      // Masernschutz-Nachweis ist gerade dazugekommen.
      expect(within(pflichtkarte()).getAllByText("Hochgeladen")).toHaveLength(2),
    );
    expect(nachreichKasten()).toBeNull();
  });

  it("laesst das Absenden zu, solange ein nachreichbarer Nachweis offen ist", async () => {
    // Die Zusage des Kastens muss auch tragen: Bankverbindung und Steuer-ID
    // duerfen nicht an einem Impfausweis haengen.
    (global as unknown as { fetch: unknown }).fetch = bestand([
      "GEBURTSURKUNDE_EIGEN",
    ]);
    const { onSubmit } = await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: { birthDate: "1990-04-17" },
    });

    await screen.findByText(KASTEN_TITEL);
    await absenden();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ ort: "Minden" });
  });

  it("laesst das Absenden auch dann zu, wenn nichts mehr offen ist", async () => {
    (global as unknown as { fetch: unknown }).fetch = bestandMitUpload(
      ["GEBURTSURKUNDE_EIGEN"],
      ["GEBURTSURKUNDE_EIGEN", "MASERNSCHUTZ"],
    );
    const { onSubmit } = await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: { birthDate: "1990-04-17" },
    });

    await screen.findByText(KASTEN_TITEL);
    await hochladen("Masernschutz-Nachweis");
    await waitFor(() => expect(nachreichKasten()).toBeNull());

    await absenden();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("kennzeichnet genau die vier als nachreichbar — die Geburtsurkunde nicht", async () => {
    // Der Kern der Entscheidung: Bankverbindung und Steuer-ID duerfen nicht an
    // einem Impfausweis haengen. Sichtbar wird das an der Statuszeile je
    // Eintrag — sie ist die einzige Stelle, an der die Person den Unterschied
    // zwischen „haelt auf" und „haelt nicht auf" ablesen kann.
    await rendern({
      organisationstyp: "GRUNDSCHULE",
      angaben: {
        birthDate: "1990-04-17",
        aufenthaltstitelErforderlich: true,
        healthInsuranceType: "privat",
      },
    });

    const karte = pflichtkarte();
    expect(
      within(karte).getAllByText("Noch nicht hochgeladen – Pflicht, nachreichbar"),
    ).toHaveLength(4);
    // Die Geburtsurkunde aus der Vorlage sperrt weiterhin.
    expect(
      within(karte).getAllByText("Noch nicht hochgeladen – Pflicht"),
    ).toHaveLength(1);
    // Und der Zusatz in der Einleitung, ohne den ueber einer nachreichbaren
    // Unterlage schlicht „benötigt" stuende.
    expect(
      within(karte).getByText(/Einzelne Nachweise dürfen Sie nachreichen/),
    ).not.toBeNull();
  });
});

// =============================================
// Das Ablaufdatum nachtragen — auch ausserhalb der Pflichtkarte
// =============================================

/**
 * „Keine Frist erfasst" darf an KEINER Stelle eine Sackgasse sein.
 *
 * Das Nachtrag-Feld sass zuerst nur in der Karte „Pflichtdokumente". Damit
 * fehlte es genau dort, wo es am wahrscheinlichsten gebraucht wird: Ein
 * Aufenthaltstitel laesst sich auch FREIWILLIG hochladen — die Auswahlliste
 * bietet ihn an, und wer die Frage in Schritt 1 mit „Nein" beantwortet hat,
 * bekommt oben gar keinen Pflichteintrag. Der einzige Ausweg waere gewesen, den
 * Scan zu loeschen und dieselbe Datei erneut hochzuladen — genau der Weg, fuer
 * dessen Abschaffung der PATCH-Zweig der Upload-Route gebaut wurde.
 */
describe("Fehlendes Ablaufdatum in der Liste der hochgeladenen Dokumente", () => {
  /** Die untere Liste allein — die Pflichtkarte hat ihre eigene Zeile. */
  function dokumentenkarte(): HTMLElement {
    const ueberschrift = screen.getByText(/^Hochgeladene Dokumente/);
    const karte = ueberschrift.closest("div")?.parentElement;
    if (!karte) throw new Error("Karte 'Hochgeladene Dokumente' nicht gefunden");
    return karte as HTMLElement;
  }

  it("bietet das Nachtragen auch bei einem freiwillig hochgeladenen Titel an", async () => {
    // „Nein" in Schritt 1: Es gibt KEINEN Pflichteintrag zum Aufenthaltstitel,
    // die Datei liegt trotzdem im Vorgang.
    global.fetch = bestand(["AUFENTHALTSTITEL"]) as unknown as typeof fetch;
    await rendern({
      angaben: { birthDate: "1965-01-01", aufenthaltstitelErforderlich: false },
    });

    const karte = dokumentenkarte();
    expect(
      within(karte).getByText(
        "Kein Ablaufdatum erfasst — wir können vor Ablauf nicht erinnern.",
      ),
    ).not.toBeNull();

    const feld = within(karte).getByLabelText("Ablaufdatum für Aufenthaltstitel");
    expect((feld as HTMLInputElement).type).toBe("date");
    expect(within(karte).getByText("Datum speichern")).not.toBeNull();
  });

  it("schweigt, sobald das Datum erfasst ist", async () => {
    global.fetch = bestand(["AUFENTHALTSTITEL"], {
      AUFENTHALTSTITEL: "2030-01-01T00:00:00.000Z",
    }) as unknown as typeof fetch;
    await rendern({
      angaben: { birthDate: "1965-01-01", aufenthaltstitelErforderlich: false },
    });

    const karte = dokumentenkarte();
    expect(
      within(karte).queryByText(
        "Kein Ablaufdatum erfasst — wir können vor Ablauf nicht erinnern.",
      ),
    ).toBeNull();
    // Die Frist steht stattdessen im Klartext an der Zeile.
    expect(within(karte).getByText(/01\.01\.2030/)).not.toBeNull();
  });

  /**
   * Eine Geburtsurkunde hat kein Ablaufdatum und soll auch keines bekommen —
   * sonst stuende die Nachfrage an jedem Dokument jedes Vorgangs.
   */
  it("fragt nur bei fristpflichtigen Nachweisarten nach", async () => {
    global.fetch = bestand(["GEBURTSURKUNDE_EIGEN"]) as unknown as typeof fetch;
    await rendern({ angaben: { birthDate: "1965-01-01" } });

    expect(
      within(dokumentenkarte()).queryByText(
        "Kein Ablaufdatum erfasst — wir können vor Ablauf nicht erinnern.",
      ),
    ).toBeNull();
  });
});
