/**
 * @jest-environment jsdom
 */

/**
 * Pruef-Dialoge und Rueckfragen der Karte „Unterlagen nachfordern" (Paket 4,
 * Schritt 9) und ihr gemeinsamer Rahmen.
 *
 * Positionen und Nachforderung entstehen mit der ECHTEN Regel des Servers
 * (`uebersichtBauen`); jeder Body, den ein Dialog meldet, laeuft zusaetzlich
 * durch das Zod-Schema der Route — ein Dialog, der eine Form baut, die der
 * Server mit 400 ablehnt, faellt hier auf und nicht erst im Betrieb.
 *
 * Belegt wird:
 *  1. Annehmen beim Aufenthaltstitel (Z1): Datum aus der Angabe der Person
 *     ohne Zeitzonen-Versatz, „Unbefristet", „Datum später nachtragen", ohne
 *     Angabe keine Vorauswahl, Warnung bei einem Datum in der Vergangenheit.
 *  2. Annehmen einer freien Zeile: Art waehlen (Standard „Sonstiges"), eine
 *     fristpflichtige Art zeigt das Datumsfeld, gesperrte Arten mit Grund;
 *     RV-Befreiung mit dem Hinweis zum Eingangsdatum.
 *  3. Zurückweisen: Begruendung Pflicht, Frist nach EP-1, Hinweis bei
 *     vertraulichen Unterlagen, Pflichtfrist bei totem Link.
 *  4. Die Rueckfragen nennen die Folgen (Entfällt, Annahme zurücknehmen,
 *     Frist ändern, Link erneut senden, Zurückziehen) — und versprechen keinen
 *     Weg, den der Server danach nicht anbietet (letzte offene Unterlage,
 *     eingestellter Vorgang, nichts wartet auf die Person, neue Adresse).
 *  5. Der Rahmen: role/aria, Fokus auf „Abbrechen", Fokusfang (auch von `body`
 *     aus), Fokus zurueck (auch bei gesperrtem Ausloeser), Escape — waehrend
 *     des Sendens nicht —, Fehlerzeile mit role="alert", die bei einem neuen
 *     Fehler den Fokus bekommt.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  adresseGleich,
  AnnahmeZuruecknehmenDialog,
  AnnehmenDialog,
  annehmenBrauchtDialog,
  EntfaelltDialog,
  ErneutSendenDialog,
  FristAendernDialog,
  ZurueckweisenDialog,
  ZurueckziehenDialog,
} from "@/components/unterlagen/pruef-dialoge";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { ablaufAmpel } from "@/lib/dokument-fristen";
import {
  dialogErinnerungsSatz,
  MELDUNGEN,
  uebersichtBauen,
  type AuswahlEintrag,
  type NachforderungAnsicht,
  type NachforderungEingabe,
  type PositionEingabe,
  type UnterlagenDialogDaten,
  type UnterlagenPositionZeile,
} from "@/lib/unterlagen";
import { positionsAktionSchema, unterlagenAktionSchema } from "@/lib/validations/unterlagen";
import { gleicheAdresse } from "@/lib/validations/onboarding";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtur
// =============================================

/** Montag, 21.09.2026, 12:00 Uhr deutscher Zeit. */
const JETZT = new Date("2026-09-21T10:00:00.000Z");
/** Die Route verlangt eine UUID als Nachforderungs-Id. */
const NF_ID = "3f2b8c1e-7d4a-4c2b-9e1f-0a1b2c3d4e5f";

function position(teil: Partial<PositionEingabe> & { id: string }): PositionEingabe {
  return {
    reihenfolge: 0,
    typ: null,
    bezeichnung: "Unterlage",
    hinweis: null,
    originalErforderlich: false,
    sensibel: false,
    fristpflichtig: false,
    status: "EINGEREICHT",
    einreichungen: 1,
    gueltigBisAngabe: null,
    angefordertAm: "2026-09-12T08:00:00.000Z",
    uebermitteltAm: "2026-09-15T08:00:00.000Z",
    begruendung: null,
    entfaelltNotiz: null,
    entschiedenAm: null,
    entschiedenVonName: null,
    dateien: [],
    ...teil,
  };
}

const TITEL = position({
  id: "p-at",
  typ: "AUFENTHALTSTITEL",
  bezeichnung: "Aufenthaltstitel",
  sensibel: true,
  fristpflichtig: true,
  // So liefert Prisma eine @db.Date-Spalte: Mitternacht UTC.
  gueltigBisAngabe: new Date("2028-03-31T00:00:00.000Z"),
});
const FREI = position({ id: "p-frei", reihenfolge: 1, bezeichnung: "Unterschriebener RV-Antrag" });
const RV = position({ id: "p-rv", reihenfolge: 2, typ: "RV_BEFREIUNG", bezeichnung: "RV-Befreiungsantrag" });
const PKV = position({ id: "p-pkv", reihenfolge: 3, typ: "PKV_NACHWEIS", bezeichnung: "PKV-Nachweis" });
const MASERN_OFFEN = position({
  id: "p-ms",
  reihenfolge: 4,
  typ: "MASERNSCHUTZ",
  bezeichnung: "Masernschutz-Nachweis",
  sensibel: true,
  status: "ANGEFORDERT",
  einreichungen: 0,
  uebermitteltAm: null,
});

function nachforderung(teil: Partial<NachforderungEingabe> = {}): NachforderungEingabe {
  return {
    id: NF_ID,
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
    positionen: [TITEL, FREI, RV, PKV, MASERN_OFFEN],
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
    ],
    ...teil,
  };
}

function ansicht(
  teil: Partial<NachforderungEingabe> = {},
  opts: { vorgangEingestellt?: boolean } = {},
): NachforderungAnsicht {
  const u = uebersichtBauen({
    modul: "ONBOARDING",
    nachforderungen: [nachforderung(teil)],
    verfuegbar: { ok: true },
    vorgangEingestellt: opts.vorgangEingestellt ?? false,
    darfAktionen: true,
    dateiUrl: (id) => `/api/onboarding/vg-1/unterlagen/dateien/${id}`,
    jetzt: JETZT,
  });
  const a = u.laufend ?? u.zuletztErledigt;
  if (!a) throw new Error("Fixtur ohne Nachforderung");
  return a;
}

function zeile(id: string, teil: Partial<NachforderungEingabe> = {}): UnterlagenPositionZeile {
  const p = ansicht(teil).positionen.find((x) => x.id === id);
  if (!p) throw new Error(`Position ${id} fehlt`);
  return p;
}

const AUSWAHL: AuswahlEintrag[] = [
  {
    typ: "AUFENTHALTSTITEL",
    label: "Aufenthaltstitel",
    vorgeschlagen: false,
    sensibel: true,
    erlaubt: true,
    grund: null,
    originalErforderlich: false,
    fristpflichtig: true,
    hinweis: null,
  },
  {
    typ: "RV_BEFREIUNG",
    label: "Antrag auf Befreiung von der Rentenversicherungspflicht",
    vorgeschlagen: false,
    sensibel: false,
    erlaubt: true,
    grund: null,
    originalErforderlich: true,
    fristpflichtig: false,
    hinweis: null,
  },
  {
    typ: "FUEHRUNGSZEUGNIS",
    label: "Führungszeugnis",
    vorgeschlagen: false,
    sensibel: true,
    erlaubt: false,
    grund: "Bei Kitas bis zur Entscheidung des Datenschutzbeauftragten gesperrt.",
    originalErforderlich: false,
    fristpflichtig: false,
    hinweis: null,
  },
];

const EMPFAENGER: UnterlagenDialogDaten["empfaenger"] = {
  vorgang: "anna.beispiel@example.org",
  vorschlaege: [{ adresse: "anna.beispiel@example.org", quelle: "VORGANG" }],
  erlaubteDomains: ["example.org", "credo-gruppe.de"],
};

const bestaetigenKnopf = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const dialogtext = () => screen.getByRole("dialog").textContent ?? "";
const hinweis = (name: string) => document.querySelector(`[data-hinweis="${name}"]`) as HTMLElement | null;

/** Der gemeldete Body — und die Probe, dass die Route ihn so annimmt. */
function positionsBody(fn: jest.Mock) {
  expect(fn).toHaveBeenCalledTimes(1);
  const body = fn.mock.calls[0][0];
  expect(positionsAktionSchema.safeParse(body).success).toBe(true);
  return body;
}
function nachforderungsBody(fn: jest.Mock) {
  expect(fn).toHaveBeenCalledTimes(1);
  const body = fn.mock.calls[0][0];
  expect(unterlagenAktionSchema.safeParse(body).success).toBe(true);
  return body;
}

// =============================================
// 1. Annehmen beim Aufenthaltstitel
// =============================================

describe("Annehmen: Aufenthaltstitel (Z1)", () => {
  function zeige(p: UnterlagenPositionZeile = zeile("p-at")) {
    const onBestaetigen = jest.fn();
    render(
      <AnnehmenDialog position={p} auswahl={AUSWAHL} jetzt={JETZT} onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />,
    );
    return onBestaetigen;
  }

  it("Datum aus der Angabe der Person, ohne Zeitzonen-Versatz", () => {
    const onBestaetigen = zeige();
    const datum = screen.getByLabelText("Gültig bis (Datum)") as HTMLInputElement;
    expect(datum.value).toBe("2028-03-31");
    const radio = screen.getByRole("radio", { name: "Gültig bis" }) as HTMLInputElement;
    expect(radio.checked).toBe(true);
    expect(dialogtext()).toContain("Angabe der Person: 31.03.2028");
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annehmen", gueltigBis: "2028-03-31" });
  });

  it("auch westlich von Greenwich bleibt es der 31.03.", () => {
    // Die Uebersicht rechnet mit UTC-Gettern, der Dialog nimmt den Kalendertag
    // als Text — kein `new Date()` dazwischen, das den Vortag zeigen koennte.
    const vorher = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      zeige(zeile("p-at"));
      expect((screen.getByLabelText("Gültig bis (Datum)") as HTMLInputElement).value).toBe("2028-03-31");
    } finally {
      // `process.env.TZ = undefined` setzte den Text "undefined" — also loeschen.
      if (vorher === undefined) delete process.env.TZ;
      else process.env.TZ = vorher;
    }
  });

  it("„Unbefristet (z. B. Niederlassungserlaubnis)“", () => {
    const onBestaetigen = zeige();
    fireEvent.click(screen.getByRole("radio", { name: "Unbefristet (z. B. Niederlassungserlaubnis)" }));
    expect(hinweis("unbefristet")).not.toBeNull();
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annehmen", gueltigBis: null, unbefristet: true });
  });

  it("„Datum später nachtragen“: weder Datum noch Kennzeichen", () => {
    const onBestaetigen = zeige();
    fireEvent.click(screen.getByRole("radio", { name: "Datum später nachtragen" }));
    expect(hinweis("spaeter")?.textContent).toContain("später im Reiter „Dokumente“ nach");
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annehmen", gueltigBis: null });
  });

  it("ohne Angabe der Person ist nichts vorgewählt — erst eine Wahl gibt den Knopf frei", () => {
    const ohne = zeile("p-at", { positionen: [{ ...TITEL, gueltigBisAngabe: null }] });
    const onBestaetigen = zeige(ohne);
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByLabelText("Gültig bis (Datum)") as HTMLInputElement).value).toBe("");
    expect(bestaetigenKnopf("Annehmen").disabled).toBe(true);
    expect(document.querySelector('[data-zeile="grund"]')?.textContent).toBe(
      "Bitte wählen Sie, wie das Ablaufdatum erfasst wird.",
    );
    fireEvent.change(screen.getByLabelText("Gültig bis (Datum)"), { target: { value: "2029-06-30" } });
    expect(bestaetigenKnopf("Annehmen").disabled).toBe(false);
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annehmen", gueltigBis: "2029-06-30" });
  });

  it("Warnung über ablaufAmpel, wenn das Datum zurückliegt — angenommen wird trotzdem", () => {
    zeige();
    expect(hinweis("abgelaufen")).toBeNull();
    fireEvent.change(screen.getByLabelText("Gültig bis (Datum)"), { target: { value: "2026-09-01" } });
    const warnung = hinweis("abgelaufen");
    expect(warnung?.textContent).toContain(ablaufAmpel("2026-09-01", JETZT).text);
    expect(warnung?.textContent).toContain("Abgelaufen seit 20 Tagen (01.09.2026)");
    expect(bestaetigenKnopf("Annehmen").disabled).toBe(false);
  });
});

// =============================================
// 2. Annehmen: freie Zeile, RV-Befreiung, direkte Annahme
// =============================================

describe("Annehmen: freie Zeile und besondere Arten", () => {
  function zeige(p: UnterlagenPositionZeile) {
    const onBestaetigen = jest.fn();
    render(
      <AnnehmenDialog position={p} auswahl={AUSWAHL} jetzt={JETZT} onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />,
    );
    return onBestaetigen;
  }

  it("Standard „Sonstiges“, ohne Datumsfeld", () => {
    const onBestaetigen = zeige(zeile("p-frei"));
    const art = screen.getByLabelText("Art des Dokuments") as HTMLSelectElement;
    expect(art.value).toBe("SONSTIGES");
    expect(document.querySelector('[data-block="ablauf"]')).toBeNull();
    expect(dialogtext()).toContain("Die Bezeichnung „Unterschriebener RV-Antrag“ bleibt am Dokument erhalten.");
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annehmen", dokumentTyp: "SONSTIGES" });
  });

  it("eine fristpflichtige Art zeigt das Datumsfeld — ohne Vorauswahl", () => {
    const onBestaetigen = zeige(zeile("p-frei"));
    fireEvent.change(screen.getByLabelText("Art des Dokuments"), { target: { value: "AUFENTHALTSTITEL" } });
    expect(document.querySelector('[data-block="ablauf"]')).not.toBeNull();
    expect(bestaetigenKnopf("Annehmen").disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Unbefristet (z. B. Niederlassungserlaubnis)" }));
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({
      aktion: "annehmen",
      dokumentTyp: "AUFENTHALTSTITEL",
      gueltigBis: null,
      unbefristet: true,
    });
  });

  it("gesperrte vertrauliche Arten sind nicht wählbar und nennen ihren Grund", () => {
    zeige(zeile("p-frei"));
    const option = screen.getByRole("option", { name: "Führungszeugnis (gesperrt)" }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(document.querySelector('[data-block="gesperrte-arten"]')?.textContent).toContain(
      "Führungszeugnis – Bei Kitas bis zur Entscheidung des Datenschutzbeauftragten gesperrt.",
    );
  });

  it("RV-Befreiung: „Eingangsdatum bitte selbst erfassen“ — als Katalogart und als gewählte Art", () => {
    const onBestaetigen = zeige(zeile("p-rv"));
    expect(hinweis("eingangsdatum")?.textContent).toContain("Eingangsdatum bitte selbst erfassen");
    // Katalogart: keine Art im Body, kein Datum.
    fireEvent.click(bestaetigenKnopf("Annehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annehmen" });
  });

  it("RV-Befreiung als Art einer freien Zeile zeigt denselben Hinweis", () => {
    zeige(zeile("p-frei"));
    expect(hinweis("eingangsdatum")).toBeNull();
    fireEvent.change(screen.getByLabelText("Art des Dokuments"), { target: { value: "RV_BEFREIUNG" } });
    expect(hinweis("eingangsdatum")).not.toBeNull();
  });

  it("wann „Annehmen“ einen Dialog braucht", () => {
    expect(annehmenBrauchtDialog(zeile("p-at"))).toBe(true); // Ablaufdatum
    expect(annehmenBrauchtDialog(zeile("p-frei"))).toBe(true); // Art waehlen
    expect(annehmenBrauchtDialog(zeile("p-rv"))).toBe(true); // Hinweis
    expect(annehmenBrauchtDialog(zeile("p-pkv"))).toBe(false); // direkt
  });
});

// =============================================
// 3. Zurueckweisen
// =============================================

describe("Zurückweisen (EP-1, E-2)", () => {
  function zeige(p: UnterlagenPositionZeile, teil: Partial<NachforderungEingabe> = {}) {
    const a = ansicht(teil);
    const onBestaetigen = jest.fn();
    render(
      <ZurueckweisenDialog
        position={p}
        frist={a.dialog.zurueckweisenFrist}
        grenzen={a.dialog.fristGrenzen}
        onAbbrechen={() => {}}
        onBestaetigen={onBestaetigen}
      />,
    );
    return { onBestaetigen, a };
  }

  it("verlangt eine Begründung; die Frist ist nach EP-1 vorbelegt", () => {
    const { onBestaetigen, a } = zeige(zeile("p-at"));
    const knopf = bestaetigenKnopf("Zurückweisen und E-Mail senden");
    expect(knopf.disabled).toBe(true);
    expect(document.querySelector('[data-zeile="grund"]')?.textContent).toBe(
      "Bitte geben Sie eine Begründung für die Person an.",
    );
    // Frist 26.09. liegt nur 5 Tage entfernt → Vorschlag heute + 7 = 28.09.
    expect(a.dialog.zurueckweisenFrist.vorschlag).toBe("2026-09-28");
    const frist = screen.getByLabelText("Frist für die erneute Einreichung") as HTMLInputElement;
    expect(frist.value).toBe("2026-09-28");
    expect(frist.min).toBe(a.dialog.fristGrenzen.min);
    expect(frist.max).toBe(a.dialog.fristGrenzen.max);

    const feld = screen.getByLabelText("Begründung für die Person *") as HTMLTextAreaElement;
    expect(feld.maxLength).toBe(1000);
    fireEvent.change(feld, { target: { value: "  Die Rückseite fehlt.  " } });
    expect(knopf.disabled).toBe(false);
    fireEvent.click(knopf);
    expect(positionsBody(onBestaetigen)).toEqual({
      aktion: "zurueckweisen",
      begruendung: "Die Rückseite fehlt.",
      frist: "2026-09-28",
    });
  });

  it("vertrauliche Unterlage: Begründung nur auf der Upload-Seite", () => {
    zeige(zeile("p-at"));
    expect(hinweis("sensibel")?.textContent).toContain(
      "Die Begründung erscheint nur auf der Upload-Seite, nicht in der E-Mail",
    );
  });

  it("andere Unterlage: die Begründung geht per E-Mail", () => {
    zeige(zeile("p-pkv"));
    expect(hinweis("sensibel")).toBeNull();
    expect(dialogtext()).toContain("Die Person erhält Ihre Begründung per E-Mail");
  });

  it("eine Frist außerhalb der Grenzen sperrt mit dem Text des Servers", () => {
    zeige(zeile("p-pkv"));
    fireEvent.change(screen.getByLabelText("Begründung für die Person *"), { target: { value: "Unleserlich." } });
    fireEvent.change(screen.getByLabelText("Frist für die erneute Einreichung"), { target: { value: "2027-06-01" } });
    expect(bestaetigenKnopf("Zurückweisen und E-Mail senden").disabled).toBe(true);
    expect(document.querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.FRIST_ZU_SPAET);
  });

  it("toter Link: neue Frist ist Pflicht", () => {
    // Frist 20.08. + 14 = 03.09. < heute → der Link ist tot (EP-1).
    const teil = { frist: new Date("2026-08-20T00:00:00.000Z") };
    const { a } = zeige(zeile("p-pkv", teil), teil);
    expect(a.dialog.zurueckweisenFrist.pflicht).toBe(true);
    expect(screen.getByLabelText("Frist für die erneute Einreichung *")).toBeTruthy();
    expect(hinweis("frist-pflicht")?.textContent).toBe(MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG);
    fireEvent.change(screen.getByLabelText("Begründung für die Person *"), { target: { value: "Unleserlich." } });
    fireEvent.change(screen.getByLabelText("Frist für die erneute Einreichung *"), { target: { value: "" } });
    expect(bestaetigenKnopf("Zurückweisen und E-Mail senden").disabled).toBe(true);
    expect(document.querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG);
  });

  it("Frist am Wochenende: Hinweis, aber keine Sperre (EP-5)", () => {
    zeige(zeile("p-pkv"));
    fireEvent.change(screen.getByLabelText("Begründung für die Person *"), { target: { value: "Unleserlich." } });
    fireEvent.change(screen.getByLabelText("Frist für die erneute Einreichung"), { target: { value: "2026-10-03" } });
    expect(document.querySelector('[data-zeile="frist-lang"]')?.textContent).toBe("Samstag, 03.10.2026");
    expect(hinweis("wochenende")?.textContent).toContain("Samstag");
    expect(bestaetigenKnopf("Zurückweisen und E-Mail senden").disabled).toBe(false);
  });
});

// =============================================
// 4. Die Rueckfragen nennen die Folgen
// =============================================

const folgen = () => document.querySelector('[data-block="folgen"]')?.textContent ?? "";

describe("Entfällt (EP-2)", () => {
  it("nennt die Folgen — auch das Löschen der Entwürfe", () => {
    const onBestaetigen = jest.fn();
    render(
      <EntfaelltDialog
        position={zeile("p-at")}
        nachforderung={ansicht()}
        onAbbrechen={() => {}}
        onBestaetigen={onBestaetigen}
      />,
    );
    expect(folgen()).toContain("Nicht übermittelte Entwürfe der Person werden gelöscht.");
    expect(folgen()).toContain("Die Person bekommt keine E-Mail.");
    // Eingereicht: die Dateien werden verworfen.
    expect(folgen()).toContain("verworfen und nach 30 Tagen gelöscht");
    // Es warten noch andere Unterlagen: Die Nachforderung laeuft weiter, Ergaenzen bleibt.
    expect(folgen()).toContain("Die Unterlage wird nicht mehr verlangt und zählt als erledigt.");
    expect(folgen()).toContain("über „Unterlagen ergänzen…“ mit derselben Unterlage");
    fireEvent.change(screen.getByLabelText("Interne Notiz (optional)"), {
      target: { value: " Arbeitserlaubnis steht auf dem Titel " },
    });
    fireEvent.click(bestaetigenKnopf("Als entfallen vermerken"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "entfaellt", notiz: "Arbeitserlaubnis steht auf dem Titel" });
  });

  it("ohne Notiz, offene Unterlage: kein Satz über verworfene Dateien", () => {
    const onBestaetigen = jest.fn();
    render(
      <EntfaelltDialog
        position={zeile("p-ms")}
        nachforderung={ansicht()}
        onAbbrechen={() => {}}
        onBestaetigen={onBestaetigen}
      />,
    );
    expect(folgen()).not.toContain("verworfen");
    fireEvent.click(bestaetigenKnopf("Als entfallen vermerken"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "entfaellt" });
  });

  it("freie Zeile: rückgängig nur als neue Zeile", () => {
    render(
      <EntfaelltDialog position={zeile("p-frei")} nachforderung={ansicht()} onAbbrechen={() => {}} onBestaetigen={() => {}} />,
    );
    expect(folgen()).toContain("fordern Sie sie über „Unterlagen ergänzen…“ neu an");
  });

  it("letzte offene Unterlage: Die Nachforderung ist danach erledigt — kein „Ergänzen“, sondern eine neue Nachforderung", () => {
    // Nur noch der Aufenthaltstitel ist offen, der RV-Antrag ist angenommen.
    const rvAngenommen = { ...RV, status: "ANGENOMMEN", entschiedenAm: "2026-09-16T08:00:00.000Z" };
    const teil = { positionen: [TITEL, rvAngenommen] };
    const a = ansicht(teil);
    expect(a.aktionen.ergaenzen).toBe(true);
    render(<EntfaelltDialog position={zeile("p-at", teil)} nachforderung={a} onAbbrechen={() => {}} onBestaetigen={() => {}} />);
    expect(folgen()).toContain("Es ist die letzte offene Unterlage – die Nachforderung ist damit erledigt.");
    expect(folgen()).toContain("über „Unterlagen nachfordern…“ neu an");
    expect(folgen()).not.toContain("Unterlagen ergänzen");
  });

  it("eingestellter Vorgang (EXPIRED): kein Weg zurück versprochen", () => {
    // Nicht die letzte: Ergaenzen sperrt der Server (EP-3).
    const a = ansicht({}, { vorgangEingestellt: true });
    expect(a.aktionen.ergaenzen).toBe(false);
    const { unmount } = render(
      <EntfaelltDialog position={a.positionen[0]} nachforderung={a} onAbbrechen={() => {}} onBestaetigen={() => {}} />,
    );
    expect(folgen()).not.toContain("Unterlagen ergänzen");
    expect(folgen()).not.toContain("Unterlagen nachfordern");
    unmount();

    // Die letzte: Eine neue Nachforderung gibt es bei EXPIRED auch nicht.
    const letzte = ansicht({ positionen: [TITEL] }, { vorgangEingestellt: true });
    render(
      <EntfaelltDialog position={letzte.positionen[0]} nachforderung={letzte} onAbbrechen={() => {}} onBestaetigen={() => {}} />,
    );
    expect(folgen()).toContain("die Nachforderung ist damit erledigt");
    expect(folgen()).not.toContain("Unterlagen nachfordern");
  });
});

describe("Annahme zurücknehmen (E-3)", () => {
  const angenommen = position({
    id: "p-ok",
    typ: "AUFENTHALTSTITEL",
    bezeichnung: "Aufenthaltstitel",
    fristpflichtig: true,
    status: "ANGENOMMEN",
    entschiedenAm: "2026-09-16T08:00:00.000Z",
  });

  it("nennt die Folgen: die Dokumente verschwinden, auch mit geändertem Ablaufdatum", () => {
    const onBestaetigen = jest.fn();
    const p = zeile("p-ok", { positionen: [angenommen] });
    render(
      <AnnahmeZuruecknehmenDialog
        position={p}
        nachforderungErledigt={false}
        onAbbrechen={() => {}}
        onBestaetigen={onBestaetigen}
      />,
    );
    expect(folgen()).toContain(
      "Die übernommenen Dokumente (eines je Datei) verschwinden aus dem Reiter „Dokumente“ – auch wenn Sie ihr Ablaufdatum inzwischen geändert haben.",
    );
    expect(folgen()).toContain("wieder auf „Zu prüfen“ und lässt sich erneut annehmen");
    // Zurueckweisen sperrt der Server bei einem eingestellten Vorgang (EP-3) — der Dialog verspricht es nicht.
    expect(folgen()).not.toContain("zurückweisen");
    expect(folgen()).not.toContain("läuft danach wieder");
    fireEvent.click(bestaetigenKnopf("Annahme zurücknehmen"));
    expect(positionsBody(onBestaetigen)).toEqual({ aktion: "annahme-zuruecknehmen" });
  });

  it("aus einer erledigten Nachforderung: sie läuft danach wieder", () => {
    const teil = { status: "ERLEDIGT", erledigtAm: "2026-09-16T08:00:00.000Z", positionen: [angenommen] };
    const a = ansicht(teil);
    render(
      <AnnahmeZuruecknehmenDialog
        position={a.positionen[0]}
        nachforderungErledigt={a.status === "ERLEDIGT"}
        onAbbrechen={() => {}}
        onBestaetigen={() => {}}
      />,
    );
    expect(folgen()).toContain("Die Nachforderung läuft danach wieder.");
  });
});

describe("Frist ändern", () => {
  it("mit Wartendem: E-Mail mit neuem Link; Erinnerungssatz aus der Regel", () => {
    const a = ansicht();
    const onBestaetigen = jest.fn();
    render(<FristAendernDialog nachforderung={a} onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />);
    expect(document.querySelector('[data-zeile="mail"]')?.textContent).toBe(
      "Die Person erhält eine E-Mail mit der neuen Frist und einem neuen Link.",
    );
    const feld = screen.getByLabelText("Neue Frist") as HTMLInputElement;
    // Vorschlag heute + 14 (EP-5).
    expect(feld.value).toBe(a.dialog.fristGrenzen.vorschlag);
    expect(document.querySelector('[data-zeile="erinnerung"]')?.textContent).toBe(
      dialogErinnerungsSatz(a.dialog.fristGrenzen.vorschlag, "2026-09-21"),
    );
    fireEvent.click(bestaetigenKnopf("Frist ändern"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({
      aktion: "frist-aendern",
      nachforderungId: NF_ID,
      frist: "2026-10-05",
    });
  });

  it("dieselbe Frist sperrt mit dem Text des Servers", () => {
    const a = ansicht();
    render(<FristAendernDialog nachforderung={a} onAbbrechen={() => {}} onBestaetigen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Neue Frist"), { target: { value: "2026-09-26" } });
    expect(bestaetigenKnopf("Frist ändern").disabled).toBe(true);
    expect(document.querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.FRIST_UNVERAENDERT);
  });

  it("ohne Wartendes: keine E-Mail — und kein Satz über Erinnerungen, die der Lauf nie verschickt", () => {
    const a = ansicht({ positionen: [TITEL] });
    render(<FristAendernDialog nachforderung={a} onAbbrechen={() => {}} onBestaetigen={() => {}} />);
    expect(document.querySelector('[data-zeile="mail"]')?.textContent).toContain("sie erhält keine E-Mail");
    // Die gewaehlte Frist ist gueltig — der Satz fehlt also nur, weil nichts auf die Person wartet.
    expect(bestaetigenKnopf("Frist ändern").disabled).toBe(false);
    expect(document.querySelector('[data-zeile="erinnerung"]')).toBeNull();
  });
});

describe("Link erneut senden (EP-16, E-5)", () => {
  function zeige(a: NachforderungAnsicht = ansicht(), empfaenger = EMPFAENGER) {
    const onBestaetigen = jest.fn();
    render(
      <ErneutSendenDialog nachforderung={a} empfaenger={empfaenger} onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />,
    );
    return onBestaetigen;
  }
  const adressfeld = () => screen.getByLabelText("E-Mail-Adresse der Person") as HTMLInputElement;

  it("unveränderte Adresse: nur die Nachforderung im Body", () => {
    const onBestaetigen = zeige();
    expect(adressfeld().value).toBe("anna.beispiel@example.org");
    fireEvent.click(bestaetigenKnopf("Link erneut senden"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({ aktion: "erneut-senden", nachforderungId: NF_ID });
  });

  it("abweichende, freigegebene Adresse: gelb, „Adresse geprüft“ ist Pflicht, alte Links werden ungültig", () => {
    const onBestaetigen = zeige();
    fireEvent.change(adressfeld(), { target: { value: "a.beispiel@credo-gruppe.de" } });
    expect(hinweis("adresswechsel")?.textContent).toContain("Alle bisherigen Links werden sofort ungültig.");
    expect(hinweis("abweichend")?.textContent).toContain("anna.beispiel@example.org");
    expect(bestaetigenKnopf("Link erneut senden").disabled).toBe(true);
    expect(document.querySelector('[data-zeile="grund"]')?.textContent).toBe(MELDUNGEN.ADRESSE_NICHT_BESTAETIGT);
    fireEvent.click(screen.getByRole("checkbox", { name: "Adresse geprüft" }));
    fireEvent.click(bestaetigenKnopf("Link erneut senden"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({
      aktion: "erneut-senden",
      nachforderungId: NF_ID,
      empfaenger: "a.beispiel@credo-gruppe.de",
      adresseBestaetigt: true,
    });
  });

  it("nicht freigegebene Adresse: rot und gesperrt", () => {
    zeige();
    fireEvent.change(adressfeld(), { target: { value: "jemand@gmail.com" } });
    expect(hinweis("nicht-freigegeben")?.textContent).toBe(MELDUNGEN.EMPFAENGER_NICHT_FREIGEGEBEN);
    expect(adressfeld().getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("checkbox", { name: "Adresse geprüft" })).toBeNull();
    expect(bestaetigenKnopf("Link erneut senden").disabled).toBe(true);
  });

  it("zurück auf die Adresse des Vorgangs: keine Bestätigung nötig", () => {
    const a = ansicht({ empfaenger: "privat@credo-gruppe.de", empfaengerAbweichend: true });
    const onBestaetigen = zeige(a);
    fireEvent.change(adressfeld(), { target: { value: "Anna.Beispiel@example.org " } });
    expect(hinweis("abweichend")).toBeNull();
    fireEvent.click(bestaetigenKnopf("Link erneut senden"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({
      aktion: "erneut-senden",
      nachforderungId: NF_ID,
      empfaenger: "Anna.Beispiel@example.org",
    });
  });

  it("„Frühere Links sperren“ geht mit", () => {
    const onBestaetigen = zeige();
    fireEvent.click(screen.getByRole("checkbox", { name: /Frühere Links sperren/ }));
    expect(dialogtext()).toContain("erst ungültig, wenn die neue E-Mail zugestellt ist");
    fireEvent.click(bestaetigenKnopf("Link erneut senden"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({
      aktion: "erneut-senden",
      nachforderungId: NF_ID,
      fruehereSperren: true,
    });
  });

  it("neue Adresse: kein Kästchen „Frühere Links sperren“ — ein vorher gesetzter Haken geht nicht mit", () => {
    const onBestaetigen = zeige();
    fireEvent.click(screen.getByRole("checkbox", { name: /Frühere Links sperren/ }));
    fireEvent.change(adressfeld(), { target: { value: "a.beispiel@credo-gruppe.de" } });
    // Der Server entwertet bei neuer Adresse schon vor dem Versand alle Links (5.1 a).
    expect(screen.queryByRole("checkbox", { name: /Frühere Links sperren/ })).toBeNull();
    expect(dialogtext()).not.toContain("erst ungültig, wenn die neue E-Mail zugestellt ist");
    expect(hinweis("adresswechsel")?.textContent).toContain("Alle bisherigen Links werden sofort ungültig.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Adresse geprüft" }));
    fireEvent.click(bestaetigenKnopf("Link erneut senden"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({
      aktion: "erneut-senden",
      nachforderungId: NF_ID,
      empfaenger: "a.beispiel@credo-gruppe.de",
      adresseBestaetigt: true,
    });
  });

  it("vor der Frist: kein Hinweis auf das Linkende", () => {
    zeige();
    expect(hinweis("linkende")).toBeNull();
  });

  it("nach der Frist: Hinweis auf das Linkende", () => {
    // Frist 18.09. verstrichen, Linkende 02.10.2026.
    const a = ansicht({ frist: new Date("2026-09-18T00:00:00.000Z") });
    expect(a.fristVerstrichen).toBe(true);
    zeige(a);
    expect(hinweis("linkende")?.textContent).toContain(
      "Die Frist ist am 18.09.2026 abgelaufen. Der neue Link ist nur noch bis 02.10.2026 nutzbar",
    );
  });

  it("dieselbe Adressregel wie der Server (gleicheAdresse)", () => {
    const paare: Array<[string, string]> = [
      ["a@b.de", "A@B.DE"],
      [" a@b.de ", "a@b.de"],
      ["a@b.de", "a@c.de"],
      ["", ""],
    ];
    for (const [x, y] of paare) expect(adresseGleich(x, y)).toBe(gleicheAdresse(x, y));
  });
});

describe("Zurückziehen (EP-9)", () => {
  it("nennt alle Folgen", () => {
    const onBestaetigen = jest.fn();
    render(<ZurueckziehenDialog nachforderung={ansicht()} onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />);
    expect(folgen()).toContain("Der Link der Person wird sofort ungültig.");
    expect(folgen()).toContain("Die Person bekommt keine E-Mail.");
    expect(folgen()).toContain("Nicht übermittelte Entwürfe der Person werden sofort gelöscht.");
    expect(folgen()).toContain("noch nicht geprüfte Dateien werden verworfen und nach 30 Tagen gelöscht");
    // Die 30 Tage aus dem Annehmen-Dialog enden hier (2.1, E-3).
    expect(folgen()).toContain("ihre Annahme lässt sich danach nicht mehr zurücknehmen");
    fireEvent.click(bestaetigenKnopf("Zurückziehen"));
    expect(nachforderungsBody(onBestaetigen)).toEqual({ aktion: "zurueckziehen", nachforderungId: NF_ID });
  });
});

// =============================================
// 5. Der Rahmen
// =============================================

describe("Dialograhmen", () => {
  function zeige(extra: Partial<React.ComponentProps<typeof EntfaelltDialog>> = {}) {
    const onAbbrechen = jest.fn();
    const onBestaetigen = jest.fn();
    const r = render(
      <EntfaelltDialog
        position={zeile("p-at")}
        nachforderung={ansicht()}
        onAbbrechen={onAbbrechen}
        onBestaetigen={onBestaetigen}
        {...extra}
      />,
    );
    return { onAbbrechen, onBestaetigen, ...r };
  }

  it("role, aria-modal und aria-labelledby auf den Titel", () => {
    zeige();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const titel = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(titel?.textContent).toBe("Unterlage entfällt");
    expect(document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Aufenthaltstitel",
    );
  });

  it("Fokus liegt beim Öffnen auf „Abbrechen“", () => {
    zeige();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" }));
  });

  it("Escape und „Dialog schließen“ schließen, ohne zu bestätigen", () => {
    const { onAbbrechen, onBestaetigen } = zeige();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Dialog schließen" }));
    expect(onAbbrechen).toHaveBeenCalledTimes(2);
    expect(onBestaetigen).not.toHaveBeenCalled();
  });

  it("während des Sendens: kein Escape, alle Knöpfe gesperrt, „Wird gesendet…“", () => {
    const { onAbbrechen } = zeige({ sendet: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Abbrechen" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Dialog schließen" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Wird gesendet…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Fokusfang: Tab am Ende springt an den Anfang, Umschalt+Tab am Anfang ans Ende", () => {
    zeige();
    const dialog = screen.getByRole("dialog");
    const schliessen = within(dialog).getByRole("button", { name: "Dialog schließen" });
    const bestaetigen = within(dialog).getByRole("button", { name: "Als entfallen vermerken" });
    bestaetigen.focus();
    fireEvent.keyDown(bestaetigen, { key: "Tab" });
    expect(document.activeElement).toBe(schliessen);
    fireEvent.keyDown(schliessen, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(bestaetigen);
    // Mitten im Dialog greift der Fang nicht ein.
    const notiz = screen.getByLabelText("Interne Notiz (optional)");
    notiz.focus();
    fireEvent.keyDown(notiz, { key: "Tab" });
    expect(document.activeElement).toBe(notiz);
  });

  it("Fokusfang auch von `body` aus (Klick auf Text, gesperrter Knopf beim Senden)", () => {
    zeige();
    const dialog = screen.getByRole("dialog");
    const schliessen = within(dialog).getByRole("button", { name: "Dialog schließen" });
    const bestaetigen = within(dialog).getByRole("button", { name: "Als entfallen vermerken" });
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    // Das Ereignis laeuft nicht durch das Overlay — der Horcher sitzt an `document`.
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(document.activeElement).toBe(schliessen);
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(bestaetigen);
  });

  it("Fehlerzeile des Servers mit role=alert", () => {
    zeige({ fehler: MELDUNGEN.NICHT_ENTFAELLBAR });
    const alert = within(screen.getByRole("dialog")).getByRole("alert");
    expect(alert.textContent).toBe(MELDUNGEN.NICHT_ENTFAELLBAR);
    // Ein Fehler schon beim Oeffnen nimmt „Abbrechen“ den Fokus nicht.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" }));
  });

  it("ein neuer Fehler des Servers holt den Fokus in den Dialog (auf die Fehlerzeile)", () => {
    const props = { position: zeile("p-at"), nachforderung: ansicht(), onAbbrechen: () => {}, onBestaetigen: () => {} };
    const { rerender } = render(<EntfaelltDialog {...props} sendet />);
    // Waehrend des Sendens ist alles gesperrt, der Fokus faellt auf `body`.
    (document.activeElement as HTMLElement).blur();
    rerender(<EntfaelltDialog {...props} fehler={MELDUNGEN.NICHT_ENTFAELLBAR} />);
    const alert = within(screen.getByRole("dialog")).getByRole("alert");
    expect(document.activeElement).toBe(alert);
    // Per Tab ist die Zeile nicht erreichbar, nur per Programm.
    expect(alert.getAttribute("tabindex")).toBe("-1");
  });

  it("beim Schließen kehrt der Fokus zum Auslöser zurück", async () => {
    function Huelle() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOffen(true)}>
            Entfällt öffnen
          </button>
          {offen && (
            <EntfaelltDialog
              position={zeile("p-at")}
              nachforderung={ansicht()}
              onAbbrechen={() => setOffen(false)}
              onBestaetigen={() => {}}
            />
          )}
        </>
      );
    }
    render(<Huelle />);
    const ausloeser = screen.getByRole("button", { name: "Entfällt öffnen" });
    ausloeser.focus();
    await act(async () => {
      fireEvent.click(ausloeser);
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abbrechen" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(ausloeser);
  });

  it("ist der Auslöser verschwunden, bekommt das Ersatzziel den Fokus", async () => {
    function Huelle() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <h3 id="ersatz" tabIndex={-1}>
            Karte
          </h3>
          {!offen && (
            <button type="button" onClick={() => setOffen(true)}>
              Öffnen
            </button>
          )}
          {offen && (
            <DialogRahmen
              titel="Test"
              fokusZiel="ersatz"
              onAbbrechen={() => setOffen(false)}
              bestaetigen={{ text: "OK", onClick: () => {} }}
            />
          )}
        </>
      );
    }
    render(<Huelle />);
    const ausloeser = screen.getByRole("button", { name: "Öffnen" });
    ausloeser.focus();
    await act(async () => {
      fireEvent.click(ausloeser);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    });
    expect(document.activeElement).toBe(document.getElementById("ersatz"));
  });

  it("ist der Auslöser beim Schließen gesperrt (Sperrzeit), bekommt das Ersatzziel den Fokus — nicht `body`", async () => {
    function Huelle() {
      const [offen, setOffen] = useState(false);
      const [gesperrt, setGesperrt] = useState(false);
      return (
        <>
          <h3 id="ersatz" tabIndex={-1}>
            Karte
          </h3>
          <button type="button" onClick={() => setOffen(true)} disabled={gesperrt}>
            Link erneut senden
          </button>
          {offen && (
            <DialogRahmen
              titel="Test"
              fokusZiel="ersatz"
              onAbbrechen={() => {
                // Wie nach einem erfolgreichen Versand: Dialog zu, Knopf grau.
                setOffen(false);
                setGesperrt(true);
              }}
              bestaetigen={{ text: "OK", onClick: () => {} }}
            />
          )}
        </>
      );
    }
    render(<Huelle />);
    const ausloeser = screen.getByRole("button", { name: "Link erneut senden" }) as HTMLButtonElement;
    ausloeser.focus();
    await act(async () => {
      fireEvent.click(ausloeser);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    });
    expect(ausloeser.disabled).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("ersatz"));
  });

  it("ein gesperrter Bestätigen-Knopf nennt seinen Grund sichtbar", () => {
    render(
      <DialogRahmen
        titel="Test"
        onAbbrechen={() => {}}
        bestaetigen={{ text: "OK", onClick: () => {}, grund: "Bitte erst etwas eintragen." }}
      />,
    );
    const ok = screen.getByRole("button", { name: "OK" }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    const grund = document.querySelector('[data-zeile="grund"]') as HTMLElement;
    expect(grund.textContent).toBe("Bitte erst etwas eintragen.");
    expect(ok.getAttribute("aria-describedby")).toBe(grund.id);
  });
});
