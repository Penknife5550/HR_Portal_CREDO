/**
 * @jest-environment jsdom
 */

/**
 * Karte „Unterlagen nachfordern" (Paket 4, Schritt 9).
 *
 * Die Uebersicht entsteht hier mit der ECHTEN Regel des Servers
 * (`uebersichtBauen` aus src/lib/unterlagen.ts) — die Karte rechnet nichts
 * selbst, und genau das soll der Test zeigen: Was der Server als Zeile, Pille,
 * Text, Aktion und Datei-URL liefert, steht so auf der Karte, und nichts
 * anderes. Die Fixtur erzaehlt das Mockup P:1382-1406 nach (RV-Antrag
 * angenommen, Aufenthaltstitel zu pruefen, Masernschutz zurueckgewiesen).
 *
 * Belegt wird:
 *  1. Kopf, Frist, Fortschritt und Zeilen aus `uebersichtBauen`.
 *  2. Nur die Aktionen, die der Server erlaubt — auch bei eingestelltem Vorgang.
 *  3. Ohne Recht: nur lesen, keine Datei-Links, keine Dateinamen.
 *  4. „Öffnen" nimmt die URL vom Server (neuer Tab, kein iframe).
 *  5. Zurueckgewiesenes: Begruendung, „2. Einreichung", Datei durchgestrichen.
 *  6. Mailverlauf: FAILED rot, SKIPPED gelb, nach drei Fehlversuchen „nicht
 *     zustellbar – Adresse prüfen"; Hinweis „HR-Meldung nicht zugestellt".
 *  7. Doppelklick ergibt EINEN Aufruf; `onAktualisiert` auch nach 409.
 *  8. Lauf-Waechter und „seit … ungeprüft" nach 14 Tagen.
 *  9. Eine nicht zugestellte Mail ist nie eine gruene Leiste.
 * 10. Ohne laufende Nachforderung: Knopf bzw. Grund, eingeklappt die letzte
 *     erledigte; Sperrzeit von „Link erneut senden".
 * 11. Nach dem Neuladen: Fehlt das Ziel eines Dialogs (oder passt die Aktion
 *     nicht mehr), schliesst er, und sein Fehler steht als rote Leiste auf der
 *     Karte; Meldungen zu einer Unterlage nennen sie; Fokus nach einer
 *     direkten Aktion.
 *
 * Umgebung wie in abteilungen-karte.test.tsx: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  NachforderungKarte,
  unterlagenAntwortAuswerten,
  unterlagenApiBasis,
} from "@/components/unterlagen/nachforderung-karte";
import {
  MELDUNGEN,
  laufWaechterText,
  uebersichtBauen,
  type DateiEingabe,
  type LinkEingabe,
  type NachforderungEingabe,
  type PositionEingabe,
  type UnterlagenDialogDaten,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";

// React 19 verlangt diese Marke, bevor act() Zustandsaenderungen einsammeln darf.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================
// Fixtur — Mockup P:1382-1406
// =============================================

/** Montag, 21.09.2026, 12:00 Uhr deutscher Zeit. */
const JETZT = new Date("2026-09-21T10:00:00.000Z");
const VORGANG = "vg-1";
const BASIS = `/api/onboarding/${VORGANG}/unterlagen`;
const standardUrl = (id: string) => `${BASIS}/dateien/${id}`;

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

function link(teil: Partial<LinkEingabe> & { anlass: string }): LinkEingabe {
  return {
    mailStatus: "SENT",
    mailDetail: null,
    gesendetAm: "2026-09-12T08:01:00.000Z",
    nachholVersuche: 0,
    erstelltVonId: "u-erika",
    createdAt: "2026-09-12T08:00:00.000Z",
    ...teil,
  };
}

const RV = position({
  id: "p-rv",
  reihenfolge: 0,
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
      speicherPfad: null,
      entschiedenAm: "2026-09-16T08:00:00.000Z",
      uebernahmeZiel: "DOCUMENT",
      uebernommenId: "doc-rv",
      uebernommenAm: "2026-09-16T08:00:00.000Z",
    }),
  ],
});

const TITEL = position({
  id: "p-at",
  reihenfolge: 1,
  typ: "AUFENTHALTSTITEL",
  bezeichnung: "Aufenthaltstitel",
  sensibel: true,
  fristpflichtig: true,
  status: "EINGEREICHT",
  einreichungen: 1,
  gueltigBisAngabe: new Date("2028-03-31T00:00:00.000Z"),
  uebermitteltAm: "2026-09-15T08:00:00.000Z",
  dateien: [
    datei({ id: "d-at1", anzeigeName: "titel-vorne.jpg", mimeType: "image/jpeg", groesse: 1_153_434 }),
    datei({ id: "d-at2", anzeigeName: "titel-hinten.jpg", mimeType: "image/jpeg", groesse: 943_718 }),
  ],
});

const MASERN = position({
  id: "p-ms",
  reihenfolge: 2,
  typ: "MASERNSCHUTZ",
  bezeichnung: "Masernschutz-Nachweis",
  sensibel: true,
  status: "ZURUECKGEWIESEN",
  einreichungen: 1,
  begruendung: "Auf dem Foto ist das Impfdatum nicht lesbar.",
  uebermitteltAm: "2026-09-14T10:00:00.000Z",
  entschiedenAm: "2026-09-16T09:00:00.000Z",
  entschiedenVonName: "Erika Muster",
  dateien: [
    datei({
      id: "d-ms",
      status: "ZURUECKGEWIESEN",
      anzeigeName: "impfpass.jpg",
      mimeType: "image/jpeg",
      groesse: 419_430,
      uebermitteltAm: "2026-09-14T10:00:00.000Z",
      entschiedenAm: "2026-09-16T09:00:00.000Z",
      loeschenAb: "2026-10-16T09:00:00.000Z",
    }),
  ],
});

const LINKS: LinkEingabe[] = [
  link({ anlass: "ANFORDERUNG" }),
  link({
    anlass: "ZURUECKWEISUNG",
    gesendetAm: "2026-09-16T09:01:00.000Z",
    createdAt: "2026-09-16T09:00:00.000Z",
  }),
  link({
    anlass: "ERINNERUNG_VORAB",
    gesendetAm: "2026-09-19T05:00:00.000Z",
    createdAt: "2026-09-19T05:00:00.000Z",
    erstelltVonId: null,
  }),
];

function nachforderung(teil: Partial<NachforderungEingabe> = {}): NachforderungEingabe {
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
    positionen: [RV, TITEL, MASERN],
    links: LINKS,
    ...teil,
  };
}

const DIALOG: UnterlagenDialogDaten = {
  auswahl: [],
  empfaenger: {
    vorgang: "anna.beispiel@example.org",
    vorschlaege: [{ adresse: "anna.beispiel@example.org", quelle: "VORGANG" }],
    erlaubteDomains: [],
  },
};

function uebersicht(
  opts: {
    nachforderungen?: NachforderungEingabe[];
    darfAktionen?: boolean;
    vorgangEingestellt?: boolean;
    verfuegbar?: { ok: true } | { ok: false; grund: string };
    dateiUrl?: (id: string) => string;
  } = {},
): UnterlagenUebersicht {
  return uebersichtBauen({
    modul: "ONBOARDING",
    nachforderungen: opts.nachforderungen ?? [nachforderung()],
    verfuegbar: opts.verfuegbar ?? { ok: true },
    vorgangEingestellt: opts.vorgangEingestellt ?? false,
    darfAktionen: opts.darfAktionen ?? true,
    dateiUrl: opts.dateiUrl ?? standardUrl,
    dialog: DIALOG,
    jetzt: JETZT,
  });
}

function karte(u: UnterlagenUebersicht, extra: Partial<React.ComponentProps<typeof NachforderungKarte>> = {}) {
  const onAktualisiert = jest.fn().mockResolvedValue(undefined);
  const onNachfordern = jest.fn();
  const r = render(
    <NachforderungKarte
      uebersicht={u}
      vorgangId={VORGANG}
      darfAktionen
      onAktualisiert={onAktualisiert}
      onNachfordern={onNachfordern}
      jetzt={JETZT}
      {...extra}
    />,
  );
  return { onAktualisiert, onNachfordern, ...r };
}

const zeile = (id: string) => document.querySelector(`[data-position="${id}"]`) as HTMLElement;
const knoepfeIn = (el: HTMLElement) => within(el).queryAllByRole("button").map((b) => b.textContent);
const kartentext = () => (document.querySelector('[data-karte="unterlagen"]')?.textContent ?? "");

/** fetch, das mit Status und Body antwortet (optional erst auf Zuruf). */
function fetchMit(status: number, body: unknown) {
  const f = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  global.fetch = f as unknown as typeof fetch;
  return f;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================
// 1. Zeilen aus uebersichtBauen
// =============================================

describe("Zeilen aus der Übersicht des Servers", () => {
  it("Kopf, Pille, Metazeilen und Fortschritt wie im Mockup", () => {
    const u = uebersicht();
    karte(u);
    const text = kartentext();
    expect(text).toContain("Unterlagen nachfordern");
    const pille = document.querySelector('[data-pille="karte"]') as HTMLElement;
    expect(pille.textContent).toBe("1 zu prüfen");
    expect(pille.dataset.farbe).toBe("gelb");
    expect(document.querySelector('[data-zeile="kopf"]')?.textContent).toBe(
      "Angefordert am 12.09.2026 von Erika Muster · an anna.beispiel@example.org",
    );
    // Der Wochentag ist gerechnet: der 26.09.2026 ist ein Samstag (EP-5).
    expect(document.querySelector('[data-zeile="frist"]')?.textContent).toBe(
      "Frist: Samstag, 26.09.2026 · noch 5 Tage",
    );
    expect(document.querySelector('[data-zeile="fortschritt"]')?.textContent).toBe(
      "1 von 3 angenommen · 1 zu prüfen · 1 offen",
    );
    const balken = screen.getByRole("progressbar");
    expect(balken.getAttribute("aria-valuenow")).toBe("33");
    // Zwei Teile wie im Mockup (P:1388): angenommen und zu pruefen.
    const teile = Array.from(balken.querySelectorAll<HTMLElement>("[data-balken]")).map((el) => [
      el.dataset.balken,
      el.style.width,
    ]);
    expect(teile).toEqual([
      ["angenommen", "33%"],
      ["zu-pruefen", "33%"],
    ]);
  });

  it("jede Zeile trägt genau die Texte des Servers, in seiner Reihenfolge", () => {
    const u = uebersicht();
    karte(u);
    const ids = Array.from(document.querySelectorAll("[data-position]")).map((e) => (e as HTMLElement).dataset.position);
    expect(ids).toEqual(u.laufend!.positionen.map((p) => p.id));
    for (const p of u.laufend!.positionen) {
      const el = zeile(p.id);
      expect(el.querySelector('[data-pille="position"]')?.textContent).toBe(p.pille.text);
      if (p.detail) expect(el.textContent).toContain(p.detail);
      if (p.gueltigBisAngabeText) expect(el.textContent).toContain(p.gueltigBisAngabeText);
    }
    expect(zeile("p-rv").textContent).toContain(
      "Angenommen am 16.09.2026 von Erika Muster · in die Dokumente des Vorgangs übernommen",
    );
    expect(zeile("p-rv").textContent).toContain("Original erforderlich");
    expect(zeile("p-at").textContent).toContain("titel-vorne.jpg · 1,1 MB");
    // Unter 1 MiB zaehlt formatBytes (Server) in KB — das Mockup rundete auf „0,9 MB".
    expect(zeile("p-at").textContent).toContain("titel-hinten.jpg · 922 KB");
    expect(zeile("p-at").textContent).toContain("Gültig bis (Angabe der Person): 31.03.2028");
  });

  it("PDF-Hinweise stehen an der Datei", () => {
    const titel = {
      ...TITEL,
      dateien: [datei({ id: "d-pdf", anzeigeName: "titel.pdf", pdfHinweise: "VERSCHLUESSELT,AKTIVE_INHALTE" })],
    };
    karte(uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, titel, MASERN] })] }));
    expect(zeile("p-at").querySelector('[data-hinweis="pdf"]')?.textContent).toBe(
      "(kennwortgeschützt, aktive Inhalte gefunden)",
    );
  });
});

// =============================================
// 2. Nur erlaubte Aktionen
// =============================================

describe("Aktionen nur, wenn der Server sie erlaubt", () => {
  it("je Zeile genau die erlaubten Knöpfe", () => {
    const u = uebersicht();
    karte(u);
    expect(knoepfeIn(zeile("p-rv"))).toEqual(["Annahme zurücknehmen…"]);
    // Aufenthaltstitel: Ablaufdatum → „Annehmen…" oeffnet den Dialog.
    expect(knoepfeIn(zeile("p-at"))).toEqual(["Annehmen…", "Zurückweisen…", "Entfällt…"]);
    expect(knoepfeIn(zeile("p-ms"))).toEqual(["Entfällt…"]);
    // Gegenprobe: Anzahl der Knoepfe = Anzahl der erlaubten Aktionen des Servers.
    for (const p of u.laufend!.positionen) {
      const erlaubt = Object.values(p.aktionen).filter(Boolean).length;
      expect(knoepfeIn(zeile(p.id))).toHaveLength(erlaubt);
    }
    const fuss = document.querySelector('[data-block="fuss"]') as HTMLElement;
    expect(knoepfeIn(fuss)).toEqual([
      "Unterlagen ergänzen…",
      "Frist ändern…",
      "Link erneut senden",
      "Zurückziehen…",
    ]);
  });

  it("eingestellter Vorgang (EXPIRED): nichts mehr, was eine Mail an die Person auslöst", () => {
    karte(uebersicht({ vorgangEingestellt: true }));
    const fuss = document.querySelector('[data-block="fuss"]') as HTMLElement;
    expect(knoepfeIn(fuss)).toEqual(["Zurückziehen…"]);
    expect(knoepfeIn(zeile("p-at"))).toEqual(["Annehmen…", "Entfällt…"]);
  });

  it("gleichlautende Knöpfe nennen ihre Unterlage für Screenreader", () => {
    karte(uebersicht());
    expect(screen.getByRole("button", { name: "Entfällt – Aufenthaltstitel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entfällt – Masernschutz-Nachweis" })).toBeTruthy();
  });

  it("„Unterlagen ergänzen…“ öffnet den Dialog aus Schritt 10 über den Rückruf", () => {
    const { onNachfordern } = karte(uebersicht());
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen ergänzen…" }));
    expect(onNachfordern).toHaveBeenCalledWith({ modus: "ergaenzen", vorauswahl: null });
  });
});

// =============================================
// 3. Ohne Recht nur lesen
// =============================================

describe("Ohne Bearbeitungsrecht", () => {
  it("keine Knöpfe, keine Datei-Links, keine Dateinamen", () => {
    const u = uebersicht({ darfAktionen: false });
    karte(u, { darfAktionen: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("a")).toHaveLength(0);
    const text = kartentext();
    expect(text).not.toContain("titel-vorne.jpg");
    expect(text).toContain("Datei · 1,1 MB");
    // Lesen darf die Rolle trotzdem: Stand und Fortschritt stehen da.
    expect(text).toContain("1 von 3 angenommen · 1 zu prüfen · 1 offen");
  });

  it("zweite Sicherung: auch eine Übersicht MIT Recht zeigt ohne Recht der Seite nichts an", () => {
    karte(uebersicht({ darfAktionen: true }), { darfAktionen: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(kartentext()).not.toContain("titel-vorne.jpg");
  });
});

// =============================================
// 4. Datei-URL vom Server
// =============================================

describe("„Öffnen“", () => {
  it("nimmt die URL des Servers unverändert, neuer Tab, kein iframe", () => {
    const eigene = (id: string) => `/irgendwo/anders?datei=${id}&x=1`;
    karte(uebersicht({ dateiUrl: eigene }));
    const a = screen.getByRole("link", { name: "titel-vorne.jpg öffnen" }) as HTMLAnchorElement;
    expect(a.getAttribute("href")).toBe("/irgendwo/anders?datei=d-at1&x=1");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("übernommene Dateien haben keine URL mehr — dann gibt es auch kein „Öffnen“", () => {
    karte(uebersicht());
    expect(zeile("p-rv").querySelector("a")).toBeNull();
  });
});

// =============================================
// 5. Zurueckgewiesenes
// =============================================

describe("Zurückgewiesene Unterlage", () => {
  it("Begründung, „2. Einreichung“ und die alte Datei durchgestrichen", () => {
    karte(uebersicht());
    const el = zeile("p-ms");
    expect(el.querySelector('[data-pille="position"]')?.textContent).toBe("Zurückgewiesen, erneut angefordert");
    expect(el.querySelector('[data-zeile="begruendung"]')?.textContent).toBe(
      "Ihre Begründung: Auf dem Foto ist das Impfdatum nicht lesbar. · 2. Einreichung",
    );
    expect(el.querySelector("s")?.textContent).toBe("impfpass.jpg · 410 KB");
    expect(el.textContent).toContain("zurückgewiesen am 16.09.2026");
  });
});

// =============================================
// 6. Mailverlauf
// =============================================

describe("Mailverlauf", () => {
  it("„E-Mails an die Person: …“ wie vom Server", () => {
    const u = uebersicht();
    karte(u);
    const zeileMail = document.querySelector('[data-block="mailverlauf"]') as HTMLElement;
    expect(zeileMail.textContent).toBe(u.laufend!.mailVerlaufText);
    expect(zeileMail.textContent).toBe(
      "E-Mails an die Person: Aufforderung 12.09. · Zurückweisung 16.09. · Erinnerung 19.09.",
    );
  });

  it("FAILED rot, SKIPPED gelb, nach drei Fehlversuchen „nicht zustellbar – Adresse prüfen“", () => {
    const links = [
      link({ anlass: "ANFORDERUNG", mailStatus: "SKIPPED", mailDetail: "Vorlage deaktiviert", gesendetAm: null }),
      link({
        anlass: "ERNEUT",
        mailStatus: "FAILED",
        mailDetail: "SMTP-Fehler",
        gesendetAm: null,
        nachholVersuche: 3,
        createdAt: "2026-09-18T08:00:00.000Z",
      }),
    ];
    karte(uebersicht({ nachforderungen: [nachforderung({ links })] }));
    const skipped = document.querySelector('[data-mail-status="SKIPPED"]') as HTMLElement;
    const failed = document.querySelector('[data-mail-status="FAILED"]') as HTMLElement;
    expect(skipped.className).toContain("text-amber-800");
    expect(failed.className).toContain("text-credo-rot");
    expect(document.querySelector('[data-hinweis="nicht-zustellbar"]')?.textContent).toBe(MELDUNGEN.NICHT_ZUSTELLBAR);
  });

  it("HR-Meldung ohne Empfänger: Hinweis auf der Karte", () => {
    karte(uebersicht({ nachforderungen: [nachforderung({ hrMeldungOhneEmpfaenger: true })] }));
    expect(document.querySelector('[data-hinweis="hr-meldung"]')?.textContent).toBe(
      MELDUNGEN.HR_MELDUNG_OHNE_EMPFAENGER,
    );
  });
});

// =============================================
// 7. Aufrufe: Doppelklick, Neuladen nach 409
// =============================================

/** Eine Katalogart ohne Ablaufdatum: „Annehmen" nimmt direkt an. */
const PKV = position({
  id: "p-pkv",
  reihenfolge: 3,
  typ: "PKV_NACHWEIS",
  bezeichnung: "PKV-Nachweis",
  status: "EINGEREICHT",
  einreichungen: 1,
  uebermitteltAm: "2026-09-18T08:00:00.000Z",
  dateien: [datei({ id: "d-pkv", anzeigeName: "pkv.pdf", uebermitteltAm: "2026-09-18T08:00:00.000Z" })],
});

describe("Aktionen ausführen", () => {
  it("Doppelklick auf „Annehmen“ ergibt genau einen Aufruf", async () => {
    let fertig!: (wert: unknown) => void;
    const f = jest.fn(
      () =>
        new Promise((r) => {
          fertig = r;
        }),
    );
    global.fetch = f as unknown as typeof fetch;
    const { onAktualisiert } = karte(
      uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, TITEL, MASERN, PKV] })] }),
    );
    const annehmen = within(zeile("p-pkv")).getByRole("button", { name: "Annehmen – PKV-Nachweis" });
    expect(annehmen.textContent).toBe("Annehmen");
    await act(async () => {
      fireEvent.click(annehmen);
      fireEvent.click(annehmen);
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(`${BASIS}/positionen/p-pkv`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      aktion: "annehmen",
    });
    await act(async () => {
      fertig({ ok: true, status: 200, json: async () => ({ meldung: "Die Unterlage ist angenommen." }) });
    });
    expect(onAktualisiert).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-art="erfolg"]')?.textContent).toContain("Die Unterlage ist angenommen.");
  });

  it("nach 409 wird trotzdem neu geladen, und die Meldung des Servers steht rot da — mit der Unterlage davor", async () => {
    fetchMit(409, { error: MELDUNGEN.NICHT_ZU_PRUEFEN, grund: "NICHT_ZU_PRUEFEN" });
    const { onAktualisiert } = karte(
      uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, TITEL, MASERN, PKV] })] }),
    );
    const knopf = within(zeile("p-pkv")).getByRole("button", { name: "Annehmen – PKV-Nachweis" });
    await act(async () => {
      fireEvent.click(knopf);
    });
    expect(onAktualisiert).toHaveBeenCalledTimes(1);
    const rot = document.querySelector('[data-art="fehler"]') as HTMLElement;
    expect(rot.textContent).toContain(`PKV-Nachweis: ${MELDUNGEN.NICHT_ZU_PRUEFEN}`);
    expect(rot.getAttribute("role")).toBe("alert");
    // Der Knopf steht noch und ist wieder frei: Der Fokus geht zu ihm zurueck.
    expect(document.activeElement).toBe(knopf);
  });

  it("ein Fehler aus dem Dialog bleibt im Dialog, neu geladen wird trotzdem", async () => {
    fetchMit(400, { error: "Das Ablaufdatum liegt mehr als 20 Jahre in der Zukunft." });
    const { onAktualisiert } = karte(uebersicht());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Annehmen – Aufenthaltstitel" }));
    });
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Annehmen" }));
    });
    expect(onAktualisiert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe(
      "Das Ablaufdatum liegt mehr als 20 Jahre in der Zukunft.",
    );
  });

  it("der Hinweis des Servers geht im Dialog nicht verloren (Grund einer gesperrten Art)", async () => {
    const grund = "Bei Kitas bis zur Entscheidung des Datenschutzbeauftragten gesperrt.";
    fetchMit(409, { error: MELDUNGEN.ART_NICHT_UEBERNEHMBAR, grund: "ART_NICHT_UEBERNEHMBAR", hinweis: grund });
    karte(uebersicht());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Annehmen – Aufenthaltstitel" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annehmen" }));
    });
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe(
      `${MELDUNGEN.ART_NICHT_UEBERNEHMBAR} ${grund}`,
    );
  });

  it("Verbindungsfehler: kein Neuladen, rote Leiste", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const { onAktualisiert } = karte(
      uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, TITEL, MASERN, PKV] })] }),
    );
    await act(async () => {
      fireEvent.click(within(zeile("p-pkv")).getByRole("button", { name: "Annehmen – PKV-Nachweis" }));
    });
    expect(onAktualisiert).not.toHaveBeenCalled();
    expect(document.querySelector('[data-art="fehler"]')?.textContent).toContain("Verbindungsfehler");
  });

  it("die Routen ergeben sich aus dem Modul, eine eigene Basis geht vor", () => {
    expect(unterlagenApiBasis("ONBOARDING", "abc")).toBe("/api/onboarding/abc/unterlagen");
    expect(unterlagenApiBasis("UNBEKANNT", "abc")).toBeNull();
  });
});

// =============================================
// 8. Lauf-Waechter, ungeprueft seit 14 Tagen
// =============================================

describe("Hinweise ohne eigene Rechnung", () => {
  it("Lauf-Wächter: Vorab-Erinnerung fehlt → Hinweis des Servers", () => {
    const u = uebersicht({ nachforderungen: [nachforderung({ links: LINKS.slice(0, 2) })] });
    expect(u.laufHinweis).toBe(laufWaechterText({ erinnerungVom: "2026-09-19", loeschungSeit: null }));
    karte(u);
    expect(document.querySelector('[data-hinweis="lauf"]')?.textContent).toBe(u.laufHinweis);
  });

  it("ohne Befund kein Hinweis", () => {
    karte(uebersicht());
    expect(document.querySelector('[data-hinweis="lauf"]')).toBeNull();
  });

  it("„seit … ungeprüft“ erst ab 14 Tagen", () => {
    const alt = { ...TITEL, uebermitteltAm: "2026-09-05T08:00:00.000Z" };
    karte(uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, alt, MASERN] })] }));
    expect(zeile("p-at").querySelector('[data-hinweis="ungeprueft"]')?.textContent).toBe(
      "seit 05.09.2026 ungeprüft",
    );
  });

  it("nach sechs Tagen noch kein Hinweis", () => {
    karte(uebersicht());
    expect(zeile("p-at").querySelector('[data-hinweis="ungeprueft"]')).toBeNull();
  });
});

// =============================================
// 9. Nicht zugestellte Mail nie gruen
// =============================================

describe("Mailergebnis in der Antwort", () => {
  async function zurueckweisen() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zurückweisen – Aufenthaltstitel" }));
    });
    fireEvent.change(screen.getByLabelText("Begründung für die Person *"), {
      target: { value: "Die Rückseite fehlt." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zurückweisen und E-Mail senden" }));
    });
  }

  it("200 mit mail FAILED: rote Leiste, nie grün — und der Dialog ist zu", async () => {
    fetchMit(200, {
      nachforderungId: "nf-1",
      positionId: "p-at",
      mail: { status: "FAILED", detail: "SMTP" },
      meldung: "Die Unterlage ist zurückgewiesen.",
      warnung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
    });
    karte(uebersicht());
    await zurueckweisen();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-art="erfolg"]')).toBeNull();
    const rot = document.querySelector('[data-art="fehler"]') as HTMLElement;
    expect(rot.className).not.toContain("credo-gruen");
    expect(rot.textContent).toContain("Die Unterlage ist zurückgewiesen.");
    expect(rot.textContent).toContain(MELDUNGEN.MAIL_NICHT_ZUGESTELLT);
  });

  it("200 mit mail SKIPPED: gelbe Leiste", async () => {
    fetchMit(200, {
      mail: { status: "SKIPPED", detail: "Vorlage deaktiviert" },
      meldung: "Die Unterlage ist zurückgewiesen.",
      warnung: MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT,
    });
    karte(uebersicht());
    await zurueckweisen();
    expect(document.querySelector('[data-art="erfolg"]')).toBeNull();
    const gelb = document.querySelector('[data-art="warnung"]') as HTMLElement;
    expect(gelb.getAttribute("role")).toBe("alert");
    expect(gelb.textContent).toContain(MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT);
  });

  it("200 mit mail SENT: grün, mit dem Text des Servers", async () => {
    fetchMit(200, { mail: { status: "SENT", detail: null }, meldung: "Die Unterlage ist zurückgewiesen." });
    karte(uebersicht());
    await zurueckweisen();
    expect(document.querySelector('[data-art="erfolg"]')?.textContent).toContain("Die Unterlage ist zurückgewiesen.");
  });

  it("„Link erneut senden“ 502 (FAILED): ausgeführt, Dialog zu, rot", async () => {
    const f = fetchMit(502, {
      mail: { status: "FAILED", detail: "SMTP" },
      meldung: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
      error: MELDUNGEN.MAIL_NICHT_ZUGESTELLT,
      adresseGeaendert: false,
      fruehereGesperrt: false,
    });
    const { onAktualisiert } = karte(uebersicht());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Link erneut senden" }));
    });
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Link erneut senden" }));
    });
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      aktion: "erneut-senden",
      nachforderungId: "nf-1",
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(BASIS);
    expect(onAktualisiert).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-art="fehler"]')?.textContent).toContain(MELDUNGEN.MAIL_NICHT_ZUGESTELLT);
  });

  it("unterlagenAntwortAuswerten: alle Fälle", () => {
    const gruen = unterlagenAntwortAuswerten(201, { mail: { status: "SENT" }, meldung: "Angefordert." });
    expect(gruen.meldung.art).toBe("erfolg");
    expect(gruen.ausgefuehrt).toBe(true);

    const n2 = unterlagenAntwortAuswerten(201, {
      mail: { status: "SENT" },
      meldung: "Angefordert.",
      warnung: MELDUNGEN.MAIL_NACHWEIS_FEHLT,
    });
    expect(n2.meldung.art).toBe("warnung");

    // Ohne Warnung vom Server trotzdem nicht gruen.
    expect(unterlagenAntwortAuswerten(200, { mail: { status: "FAILED" }, meldung: "x" }).meldung.art).toBe("fehler");
    expect(unterlagenAntwortAuswerten(200, { mail: { status: "SKIPPED" }, meldung: "x" }).meldung.art).toBe("warnung");

    // Friständerung ohne Wartendes: keine Mail vorgesehen → gruen.
    expect(unterlagenAntwortAuswerten(200, { mail: null, meldung: "Die Frist ist geändert." }).meldung.art).toBe(
      "erfolg",
    );

    const skipped409 = unterlagenAntwortAuswerten(409, {
      mail: { status: "SKIPPED" },
      meldung: MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT,
      error: MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT,
    });
    expect(skipped409).toEqual({
      status: 409,
      ausgefuehrt: true,
      meldung: { art: "warnung", meldung: MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT, hinweis: null },
    });

    const sperre = unterlagenAntwortAuswerten(409, { error: MELDUNGEN.SPERRZEIT, grund: "SPERRZEIT" });
    expect(sperre.ausgefuehrt).toBe(false);
    expect(sperre.meldung).toEqual({ art: "fehler", meldung: MELDUNGEN.SPERRZEIT, hinweis: null });

    const sensibel = unterlagenAntwortAuswerten(409, {
      error: MELDUNGEN.ART_NICHT_UEBERNEHMBAR,
      hinweis: "Nur bei Kitas gesperrt.",
    });
    expect(sensibel.meldung.hinweis).toBe("Nur bei Kitas gesperrt.");

    expect(unterlagenAntwortAuswerten(500, null).meldung.meldung).toBe("Die Aktion ist fehlgeschlagen (Status 500).");
  });
});

// =============================================
// 10. Ohne laufende Nachforderung, Sperrzeit
// =============================================

describe("Ohne laufende Nachforderung", () => {
  it("Knopf „Unterlagen nachfordern…“ öffnet über den Rückruf den Dialog", () => {
    const { onNachfordern } = karte(uebersicht({ nachforderungen: [] }));
    expect(document.querySelector('[data-zeile="aufforderung"]')?.textContent).toContain(
      "Fordern Sie fehlende oder weitere Unterlagen bei der Person an.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Unterlagen nachfordern…" }));
    expect(onNachfordern).toHaveBeenCalledWith({ modus: "neu", vorauswahl: null });
  });

  it("vor der Abgabe bzw. bei EXPIRED: der Grund im Klartext statt des Knopfs — ohne Aufforderung darüber", () => {
    const grund = "Unterlagen lassen sich nachfordern, sobald die Person ihren Personalfragebogen abgesendet hat.";
    karte(uebersicht({ nachforderungen: [], verfuegbar: { ok: false, grund } }));
    expect(screen.queryByRole("button", { name: "Unterlagen nachfordern…" })).toBeNull();
    expect(document.querySelector('[data-hinweis="nicht-verfuegbar"]')?.textContent).toBe(grund);
    expect(document.querySelector('[data-zeile="aufforderung"]')).toBeNull();
  });

  it("ohne Recht: weder Knopf noch Grund noch Aufforderung, nur der Stand", () => {
    karte(uebersicht({ nachforderungen: [], darfAktionen: false }), { darfAktionen: false });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelector('[data-hinweis="keine-laufende"]')).not.toBeNull();
    expect(document.querySelector('[data-zeile="aufforderung"]')).toBeNull();
  });

  it("die letzte erledigte steht eingeklappt da, solange eine Rücknahme möglich ist", () => {
    const erledigt = nachforderung({
      id: "nf-alt",
      status: "ERLEDIGT",
      erledigtAm: "2026-09-18T08:00:00.000Z",
      positionen: [RV],
    });
    karte(uebersicht({ nachforderungen: [erledigt] }));
    const details = document.querySelector('[data-block="zuletzt-erledigt"]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector("summary") as HTMLElement;
    expect(summary.textContent).toContain("Erledigt am 18.09.2026");
    // `display: list-item` bleibt (Tailwind-Preflight), sonst fehlt das Aufklapp-Dreieck.
    expect(summary.classList.contains("flex")).toBe(false);
    // Die Restlaufzeit einer erledigten („noch 5 Tage") fuehrte in die Irre.
    expect(details.querySelector('[data-zeile="frist"]')).toBeNull();
    expect(within(details).getByRole("button", { name: "Annahme zurücknehmen – Unterschriebener RV-Antrag" })).toBeTruthy();
    // Daneben der Knopf fuer eine neue Nachforderung.
    expect(screen.getByRole("button", { name: "Unterlagen nachfordern…" })).toBeTruthy();
  });

  it("nach 30 Tagen verschwindet die erledigte", () => {
    const alt = { ...RV, entschiedenAm: "2026-08-01T08:00:00.000Z" };
    const erledigt = nachforderung({ id: "nf-alt", status: "ERLEDIGT", erledigtAm: "2026-08-01T08:00:00.000Z", positionen: [alt] });
    karte(uebersicht({ nachforderungen: [erledigt] }));
    expect(document.querySelector('[data-block="zuletzt-erledigt"]')).toBeNull();
  });
});

// =============================================
// 11. Nach dem Neuladen: Dialog ohne Ziel, Fokus
// =============================================

/** Karte mit echtem Neuladen: `onAktualisiert` setzt die naechste Uebersicht. */
function Huelle({ start, danach }: { start: UnterlagenUebersicht; danach: UnterlagenUebersicht }) {
  const [u, setU] = useState(start);
  return (
    <NachforderungKarte
      uebersicht={u}
      vorgangId={VORGANG}
      darfAktionen
      onAktualisiert={async () => setU(danach)}
      onNachfordern={() => {}}
      jetzt={JETZT}
    />
  );
}

describe("Dialog, dessen Ziel nach dem Neuladen fehlt", () => {
  it("„Frist ändern“: eine Kollegin hat inzwischen zurückgezogen → Dialog zu, 409-Text als rote Leiste", async () => {
    fetchMit(409, { error: MELDUNGEN.NICHT_LAUFEND, grund: "NICHT_LAUFEND" });
    const zurueckgezogen = nachforderung({ status: "ZURUECKGEZOGEN", zurueckgezogenAm: "2026-09-21T09:00:00.000Z" });
    render(<Huelle start={uebersicht()} danach={uebersicht({ nachforderungen: [zurueckgezogen] })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Frist ändern…" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Frist ändern" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const rot = document.querySelector('[data-art="fehler"]') as HTMLElement;
    expect(rot.getAttribute("role")).toBe("alert");
    expect(rot.textContent).toContain(MELDUNGEN.NICHT_LAUFEND);
    expect(document.querySelector('[data-art="erfolg"]')).toBeNull();
  });

  it("„Annahme zurücknehmen“ auf der erledigten: inzwischen läuft eine neuere → der Text des Servers erreicht HR", async () => {
    fetchMit(409, { error: MELDUNGEN.ANDERE_LAEUFT, grund: "ANDERE_LAEUFT" });
    const erledigt = nachforderung({
      id: "nf-alt",
      status: "ERLEDIGT",
      angefordertAm: "2026-09-01T08:00:00.000Z",
      erledigtAm: "2026-09-18T08:00:00.000Z",
      positionen: [RV],
    });
    const neue = nachforderung({ id: "nf-neu", angefordertAm: "2026-09-20T08:00:00.000Z" });
    render(
      <Huelle
        start={uebersicht({ nachforderungen: [erledigt] })}
        danach={uebersicht({ nachforderungen: [erledigt, neue] })}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Annahme zurücknehmen – Unterschriebener RV-Antrag" }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annahme zurücknehmen" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const rot = document.querySelector('[data-art="fehler"]') as HTMLElement;
    expect(rot.getAttribute("role")).toBe("alert");
    expect(rot.textContent).toContain(`Unterschriebener RV-Antrag: ${MELDUNGEN.ANDERE_LAEUFT}`);
  });

  it("„Zurückweisen“, die Unterlage ist inzwischen angenommen → Dialog zu statt erneut klickbar", async () => {
    fetchMit(409, { error: MELDUNGEN.NICHT_ZU_PRUEFEN, grund: "NICHT_ZU_PRUEFEN" });
    const angenommen = {
      ...TITEL,
      status: "ANGENOMMEN",
      entschiedenAm: "2026-09-21T09:00:00.000Z",
      entschiedenVonName: "Max Kollege",
    };
    render(
      <Huelle
        start={uebersicht()}
        danach={uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, angenommen, MASERN] })] })}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zurückweisen – Aufenthaltstitel" }));
    });
    fireEvent.change(screen.getByLabelText("Begründung für die Person *"), { target: { value: "Rückseite fehlt." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Zurückweisen und E-Mail senden" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[data-art="fehler"]')?.textContent).toContain(
      `Aufenthaltstitel: ${MELDUNGEN.NICHT_ZU_PRUEFEN}`,
    );
  });
});

describe("Direkte Aktion: Bezug und Fokus", () => {
  it("nach „Annehmen“ nennt die Leiste die Unterlage, und der Fokus steht auf ihrer Zeile statt auf `body`", async () => {
    fetchMit(200, { mail: null, meldung: "Die Unterlage ist angenommen." });
    const pkvAngenommen = {
      ...PKV,
      status: "ANGENOMMEN",
      entschiedenAm: "2026-09-21T09:00:00.000Z",
      entschiedenVonName: "Erika Muster",
    };
    render(
      <Huelle
        start={uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, TITEL, MASERN, PKV] })] })}
        danach={uebersicht({ nachforderungen: [nachforderung({ positionen: [RV, TITEL, MASERN, pkvAngenommen] })] })}
      />,
    );
    const knopf = within(zeile("p-pkv")).getByRole("button", { name: "Annehmen – PKV-Nachweis" });
    knopf.focus();
    await act(async () => {
      fireEvent.click(knopf);
    });
    expect(document.querySelector('[data-art="erfolg"]')?.textContent).toContain(
      "PKV-Nachweis: Die Unterlage ist angenommen.",
    );
    // Der Knopf „Annehmen“ ist weg — die Zeile traegt den Fokus.
    expect(knopf.isConnected).toBe(false);
    expect(document.activeElement).toBe(zeile("p-pkv"));
  });
});

describe("Sperrzeit „Link erneut senden“", () => {
  it("grau, mit dem Ende als sichtbarem Text", () => {
    const links = [
      ...LINKS,
      link({
        anlass: "ERNEUT",
        gesendetAm: "2026-09-21T09:58:00.000Z",
        createdAt: "2026-09-21T09:58:00.000Z",
      }),
    ];
    const u = uebersicht({ nachforderungen: [nachforderung({ links })] });
    expect(u.laufend!.aktionen.erneutSendenGesperrt).toBe(true);
    karte(u);
    const k = screen.getByRole("button", { name: "Link erneut senden" }) as HTMLButtonElement;
    expect(k.disabled).toBe(true);
    expect(document.querySelector('[data-hinweis="sperrzeit"]')?.textContent).toContain("21.09.2026, 12:08 Uhr");
  });
});
