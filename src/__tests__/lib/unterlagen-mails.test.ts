/**
 * Tests: Mails der Nachforderung „Unterlagen nachfordern“ (Paket 4)
 *
 * Geprueft werden die Payload-Bausteine (src/lib/unterlagen-mail.ts) ZUSAMMEN
 * mit den echten Standardvorlagen und dem echten Renderer (renderEventEmail):
 * Ein Baustein, der ein Feld vergisst, faellt erst beim Rendern auf — als
 * woertliches „{{…}}“ im Postfach der Person.
 *
 * Schwerpunkte (Feinplanung Abschnitt 8, 11, 13):
 *   - kein Betreff nennt eine Unterlage, eine Begruendung oder den Link
 *   - sensible Unterlagen erscheinen nur neutral (E-2)
 *   - HR-Payload ohne Adresse der Person, ohne Link, ohne Unterlagennamen
 *   - Freitexte im HTML maskiert, im Textteil roh
 *   - genau ein Anlass-Merker, Linkende nur nach der Frist
 *   - die Beispielgeschichte im Katalog ist genau das, was die Bausteine bauen
 *
 * @/lib/db wird ersetzt; renderEventEmail selbst braucht keine Datenbank.
 */

jest.mock("@/lib/db", () => ({ prisma: {} }));

import { renderEventEmail, renderTemplate } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import {
  EVENT_CATALOG,
  UNTERLAGEN_BEISPIEL_BEGRUENDUNG,
  UNTERLAGEN_BEISPIEL_NACHRICHT,
  UNTERLAGEN_BEISPIEL_UNTERLAGEN,
  betreffMitVerschachteltenMarkern,
  getEventDefinition,
  verboteneBetreffVariablen,
} from "@/lib/events";
import { formatKalendertagLang, tageZwischen } from "@/lib/kalendertag";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import {
  ORIGINAL_ZUSATZ,
  UNTERLAGEN_EVENTS,
  UNTERLAGEN_PERSONEN_EVENTS,
  VERTRAULICHE_UNTERLAGE,
  aufforderungMailFelder,
  erinnerungMailFelder,
  fristVerstrichenMailFelder,
  hrEmpfaengerFelder,
  unterlagenlisteMailFelder,
  vollstaendigMailFelder,
  zurueckweisungMailFelder,
  type UnterlagenAufforderungAnlass,
  type UnterlagenMailPayload,
  type UnterlagenMailPosition,
  type UnterlagenMailVorgang,
} from "@/lib/unterlagen-mail";

// =============================================
// Hilfen
// =============================================

const ALLE_EVENTS = Object.values(UNTERLAGEN_EVENTS);
const LINK = "https://hr.fes-credo.de/unterlagen/5b0c9a3e-8a51-4c1f-9d2e-6f7a8b9c0d1e";
const PORTAL = "https://hr.fes-credo.de/dashboard/00000000-0000-0000-0000-000000000014?tab=dokumente";

const VORGANG: UnterlagenMailVorgang = {
  nachforderungId: "nf-1",
  modul: "ONBOARDING",
  refId: "onb-1",
  displayId: "2026-GYM-014",
  einrichtung: "FES Minden",
  vorname: "Anna",
  nachname: "Beispiel",
  frist: "2026-09-25",
  mitDetails: true,
};

function position(teil: Partial<UnterlagenMailPosition> = {}): UnterlagenMailPosition {
  return {
    bezeichnung: "Nachweis private Krankenversicherung",
    hinweis: null,
    sensibel: false,
    originalErforderlich: false,
    status: "ANGEFORDERT",
    neu: false,
    ...teil,
  };
}

const MASERN = position({
  bezeichnung: "Masernschutz-Nachweis",
  hinweis: "Bitte nur die Seite Ihres Impfpasses mit den Masern-Impfungen.",
  sensibel: true,
});
const TITEL = position({
  bezeichnung: "Aufenthaltstitel",
  hinweis: "Bitte Vorder- und Rückseite hochladen.",
  sensibel: true,
});
const PKV = position({
  bezeichnung: "Nachweis private Krankenversicherung",
  hinweis: "Keine Beitragsübersicht, nicht den Vertrag.",
});
const RV = position({
  bezeichnung: "Unterschriebener Antrag auf Befreiung von der Rentenversicherungspflicht",
  originalErforderlich: true,
});

function personBasis(teil: { vorgang?: Partial<UnterlagenMailVorgang>; positionen?: UnterlagenMailPosition[]; heute?: string; nachricht?: string | null } = {}) {
  return {
    vorgang: { ...VORGANG, ...teil.vorgang },
    positionen: teil.positionen ?? [MASERN, PKV, RV],
    empfaenger: "anna.beispiel@example.org",
    link: LINK,
    linkGueltigBis: "2026-10-09",
    heute: teil.heute ?? "2026-09-14",
    nachricht: teil.nachricht === undefined ? "Vielen Dank!" : teil.nachricht,
  };
}

function hrBasis(teil: { vorgang?: Partial<UnterlagenMailVorgang>; positionen?: UnterlagenMailPosition[] } = {}) {
  return {
    vorgang: { ...VORGANG, ...teil.vorgang },
    positionen: teil.positionen ?? [
      { ...MASERN, status: "EINGEREICHT", einreichungen: 1 },
      { ...PKV, status: "EINGEREICHT", einreichungen: 2 },
      { ...RV, status: "ANGENOMMEN", einreichungen: 1 },
    ],
    portalLink: PORTAL,
    anfordernd: { email: "erika.muster@example.org", name: "Erika Muster", aktiv: true },
    hrPostfach: "personal@example.org",
    angefordertAm: new Date("2026-09-14T08:30:00.000Z"),
  };
}

function standardVorlage(event: string) {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
  if (!vorlage) throw new Error(`Keine Standardvorlage fuer ${event}`);
  return vorlage;
}

/** Rendert die Standardvorlage wie der Mailer (ohne Datenbank). */
function rendern(
  event: string,
  payload: UnterlagenMailPayload,
  ueberschreibung: Partial<{ bodyHtml: string; bodyText: string; recipientCc: string; recipientBcc: string }> = {},
  optionen: { overrideTo?: string } = {},
) {
  const vorlage = standardVorlage(event);
  const { rendered, skipReason } = renderEventEmail(
    {
      subject: vorlage.subject,
      bodyHtml: ueberschreibung.bodyHtml ?? vorlage.bodyHtml,
      bodyText: ueberschreibung.bodyText ?? vorlage.bodyText,
      recipientTo: "",
      recipientCc: ueberschreibung.recipientCc ?? "",
      recipientBcc: ueberschreibung.recipientBcc ?? "",
      recipientReplyTo: "",
    },
    event,
    payload,
    { globalReplyTo: "personal@example.org", ...optionen },
  );
  if (!rendered) throw new Error(`${event} nicht gerendert: ${skipReason}`);
  return rendered;
}

function alleTeile(mail: { subject: string; html: string; text?: string }): string[] {
  return [mail.subject, mail.html, mail.text ?? ""];
}

/** Alle Payload-Varianten, die die Aufrufer bauen koennen — je Ereignis. */
function varianten(): Array<{ name: string; event: string; payload: UnterlagenMailPayload }> {
  const liste: Array<{ name: string; event: string; payload: UnterlagenMailPayload }> = [];
  const anlaesse: UnterlagenAufforderungAnlass[] = ["ANFORDERUNG", "ERGAENZUNG", "ERNEUT", "FRISTAENDERUNG"];
  const lagen = [
    { name: "mit Details", basis: personBasis() },
    { name: "ohne Details", basis: personBasis({ vorgang: { mitDetails: false } }) },
    { name: "ohne Nummer und Namen", basis: personBasis({ vorgang: { displayId: null, vorname: null, nachname: "" }, nachricht: null }) },
    { name: "nach der Frist", basis: personBasis({ heute: "2026-09-30" }) },
  ];
  for (const lage of lagen) {
    for (const anlass of anlaesse) {
      liste.push({ name: `${anlass} ${lage.name}`, event: UNTERLAGEN_EVENTS.ANGEFORDERT, payload: aufforderungMailFelder({ ...lage.basis, anlass }) });
    }
    liste.push({ name: `nachgeholt ${lage.name}`, event: UNTERLAGEN_EVENTS.ANGEFORDERT, payload: aufforderungMailFelder({ ...lage.basis, anlass: "ERGAENZUNG", nachgeholt: true }) });
    for (const stufe of ["VORAB", "FRISTTAG"] as const) {
      liste.push({ name: `Erinnerung ${stufe} ${lage.name}`, event: UNTERLAGEN_EVENTS.ERINNERUNG, payload: erinnerungMailFelder({ ...lage.basis, stufe, entwurfVorhanden: stufe === "VORAB" }) });
    }
    for (const zurueck of [{ ...PKV, status: "ZURUECKGEWIESEN", einreichungen: 2 }, { ...MASERN, status: "ZURUECKGEWIESEN", einreichungen: 1 }]) {
      liste.push({
        name: `Zurueckweisung ${zurueck.bezeichnung} ${lage.name}`,
        event: UNTERLAGEN_EVENTS.ZURUECKGEWIESEN,
        payload: zurueckweisungMailFelder({ ...lage.basis, position: zurueck, begruendung: "Unscharf." }),
      });
    }
  }
  for (const vorgang of [{}, { displayId: null, vorname: null, nachname: null }]) {
    liste.push({ name: `vollstaendig ${JSON.stringify(vorgang)}`, event: UNTERLAGEN_EVENTS.VOLLSTAENDIG, payload: vollstaendigMailFelder({ ...hrBasis({ vorgang }), uebermitteltAm: new Date("2026-09-21T17:05:00.000Z") }) });
    liste.push({ name: `Frist verstrichen ${JSON.stringify(vorgang)}`, event: UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN, payload: fristVerstrichenMailFelder({ ...hrBasis({ vorgang }), linkGueltigBis: "2026-10-09", nieZugestellt: true }) });
  }
  return liste;
}

// =============================================
// Katalog und Betreff
// =============================================

describe("Katalog und Betreff (Feinplanung 8.1, 8.3)", () => {
  it("die fuenf Ereignisse stehen in der Gruppe „Unterlagen“, jedes mit Standardvorlage", () => {
    const imKatalog = EVENT_CATALOG.filter((d) => d.group === "Unterlagen").map((d) => d.event);
    expect(imKatalog.sort()).toEqual([...ALLE_EVENTS].sort());
    for (const event of ALLE_EVENTS) {
      expect({ event, vorlage: DEFAULT_EMAIL_TEMPLATES.some((t) => t.event === event) }).toEqual({ event, vorlage: true });
    }
  });

  it("die drei Personen-Mails sind genau die mit {{email}} als Empfaenger", () => {
    const personen = EVENT_CATALOG.filter((d) => d.group === "Unterlagen" && d.defaultRecipients.to === "{{email}}").map((d) => d.event);
    expect(personen.sort()).toEqual([...UNTERLAGEN_PERSONEN_EVENTS].sort());
  });

  it("kein Standard-Betreff enthaelt eine verbotene Variable — auch nicht {{link}}", () => {
    for (const event of ALLE_EVENTS) {
      const { subject } = standardVorlage(event);
      expect({ event, verboten: verboteneBetreffVariablen(event, subject) }).toEqual({ event, verboten: [] });
      expect(subject).not.toMatch(/\{\{\s*[#/]?\s*(link|magicLink|magicUrl|unterlage|unterlagenliste|begruendung|nachricht)/);
    }
  });

  it("betreffOhne sperrt Freitexte, Unterlagennamen und jeden Weg zum Link", () => {
    for (const event of ALLE_EVENTS) {
      expect(getEventDefinition(event)?.betreffOhne).toEqual(
        expect.arrayContaining([
          "unterlage",
          "unterlagenliste",
          "unterlagenliste_html",
          "begruendung",
          "begruendung_html",
          "nachricht",
          "nachricht_html",
          "link",
          "magicLink",
          "magicUrl",
        ]),
      );
    }
  });

  it("verboteneBetreffVariablen findet Platzhalter, Bloecke und Leerzeichen-Varianten", () => {
    const event = UNTERLAGEN_EVENTS.ANGEFORDERT;
    expect(verboteneBetreffVariablen(event, "Ihr Link: {{link}}")).toEqual(["link"]);
    expect(verboteneBetreffVariablen(event, "{{ unterlage }} und {{#begruendung}}x{{/begruendung}}")).toEqual(["unterlage", "begruendung"]);
    expect(verboteneBetreffVariablen(event, "Unterlagen zu Ihrem Vorgang{{vorgang_zusatz}}")).toEqual([]);
    // {{unterlagen_frist}} ist nicht {{unterlage}} — kein Treffer auf Teilwoerter.
    expect(verboteneBetreffVariablen(event, "{{unterlagen_frist}} {{linkliste}}")).toEqual([]);
    // Ereignisse ohne Sperrliste bleiben unberuehrt.
    expect(verboteneBetreffVariablen("onboarding-created", "{{link}}")).toEqual([]);
    expect(verboteneBetreffVariablen("gibt-es-nicht", "{{link}}")).toEqual([]);
  });

  it("zusammengesetzte Platzhalter im Betreff werden erkannt, bevor der Renderer daraus {{link}} macht", () => {
    const event = UNTERLAGEN_EVENTS.ANGEFORDERT;
    const zusammengesetzt = [
      "{{li{{#x}}{{/x}}nk}}",
      "{{lin{{#x}}zz{{/x}}k}}",
      // ein Block muss stehen bleiben, der andere wegfallen — zwei Lesarten
      // (alle gesetzt / alle leer) genuegten hier nicht
      "{{l{{#a}}i{{/a}}n{{#b}}zz{{/b}}k}}",
      "{{{#x}}{{/x}}{link}}",
      "{{unterlage{{#x}}{{/x}}nliste}}",
    ];
    const werte = { link: LINK, unterlagenliste: "- Masernschutz-Nachweis", a: "ja", b: "", x: "" };
    for (const betreff of zusammengesetzt) {
      // Die Pruefung auf den Rohtext allein saehe nichts …
      expect({ betreff, verboten: verboteneBetreffVariablen(event, betreff) }).toEqual({ betreff, verboten: [] });
      // … der Renderer setzte aber den Link bzw. die Liste ein.
      expect(renderTemplate(betreff, werte)).toMatch(new RegExp(`${LINK.replace(/[.]/g, "\\.")}|Masernschutz`));
      expect({ betreff, erkannt: betreffMitVerschachteltenMarkern(event, betreff) }).toEqual({ betreff, erkannt: true });
    }

    // Die Standard-Betreffzeilen und einfache Bloecke bleiben erlaubt.
    for (const e of ALLE_EVENTS) {
      expect({ e, erkannt: betreffMitVerschachteltenMarkern(e, standardVorlage(e).subject) }).toEqual({ e, erkannt: false });
    }
    expect(betreffMitVerschachteltenMarkern(event, "{{#ist_ergaenzung}}Ergänzung: {{/ist_ergaenzung}}Unterlagen {{ einrichtung }}")).toBe(false);
    expect(betreffMitVerschachteltenMarkern(event, "Klammer {einzeln} bleibt")).toBe(false);
    // Ereignisse ohne Sperrliste bleiben unberuehrt.
    expect(betreffMitVerschachteltenMarkern("onboarding-created", "{{li{{#x}}{{/x}}nk}}")).toBe(false);
    expect(betreffMitVerschachteltenMarkern("gibt-es-nicht", "{{li{{#x}}{{/x}}nk}}")).toBe(false);
  });

  it("kein gerenderter Betreff nennt eine Unterlage, die Begruendung, die Nachricht oder den Link", () => {
    for (const { name, event, payload } of varianten()) {
      const { subject } = rendern(event, payload);
      for (const verboten of [LINK, "Masernschutz", "Krankenversicherung", "Rentenversicherung", "Unscharf", "Vielen Dank"]) {
        expect({ name, subject, enthaelt: subject.includes(verboten) }).toEqual({ name, subject, enthaelt: false });
      }
    }
  });
});

// =============================================
// Jede Variable in jeder Payload
// =============================================

describe("Vollstaendigkeit der Payloads", () => {
  it("in keiner Variante bleibt ein {{…}} in Betreff, HTML oder Text stehen", () => {
    for (const { name, event, payload } of varianten()) {
      for (const teil of alleTeile(rendern(event, payload))) {
        expect({ name, rest: teil.match(/\{\{[^}]*\}\}/g) }).toEqual({ name, rest: null });
      }
    }
  });

  it("jede Variable aus der Variablenliste der Vorlage steht in der Payload", () => {
    // Nur Namen, die der Mailer selbst bildet (vorgangsnummer aus displayId),
    // duerfen fehlen — alles andere stuende sonst woertlich in der Mail.
    const vomMailer = new Set(["vorgangsnummer"]);
    for (const { name, event, payload } of varianten()) {
      const schluessel = standardVorlage(event)
        .variables.map((v) => /^\{\{(\w+)\}\}$/.exec(v.key)?.[1])
        .filter((k): k is string => Boolean(k));
      for (const k of schluessel) {
        expect({ name, k, vorhanden: k in payload || vomMailer.has(k) }).toEqual({ name, k, vorhanden: true });
      }
    }
  });

  it("Merker sind Zeichenketten „ja“ oder leer, nie Wahrheitswerte", () => {
    const merker = /^(ist_|mit_details|ohne_details|frist_verstrichen|original_erforderlich|entwurf_vorhanden|erneut_eingereicht|nie_zugestellt)/;
    for (const { name, payload } of varianten()) {
      for (const [k, wert] of Object.entries(payload)) {
        if (merker.test(k)) expect({ name, k, wert: ["ja", ""].includes(wert as string) }).toEqual({ name, k, wert: true });
      }
    }
  });

  it("keine Payload traegt expiresAt, tokenExpiresAt oder ein Token-Feld", () => {
    for (const { name, payload } of varianten()) {
      for (const k of ["expiresAt", "tokenExpiresAt", "token", "magicLink", "magicUrl"]) {
        expect({ name, k, drin: k in payload }).toEqual({ name, k, drin: false });
      }
    }
  });

  it("mitarbeiter_name ist nie leer und nie eine Adresse", () => {
    for (const { name, payload } of varianten()) {
      expect({ name, leer: !payload.mitarbeiter_name }).toEqual({ name, leer: false });
      expect(String(payload.mitarbeiter_name)).not.toContain("@");
    }
    const ohneNamen = vollstaendigMailFelder({ ...hrBasis({ vorgang: { vorname: " ", nachname: null } }), uebermitteltAm: new Date() });
    expect(ohneNamen.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
    // Akkusativ nach „für“ — der Betreff bleibt ein Satz.
    expect(rendern(UNTERLAGEN_EVENTS.VOLLSTAENDIG, ohneNamen).subject).toBe(
      `Unterlagen eingegangen: Vorgang 2026-GYM-014 für ${MITARBEITER_NEUTRAL}`,
    );
  });
});

// =============================================
// Sensible Unterlagen (E-2)
// =============================================

describe("Sensible Unterlagen erscheinen nur neutral (E-2)", () => {
  it("die Liste nennt eine sensible Unterlage weder beim Namen noch mit Hinweis", () => {
    const felder = unterlagenlisteMailFelder([MASERN, TITEL, PKV], true);
    for (const teil of [felder.unterlagenliste, felder.unterlagenliste_html]) {
      expect(teil).not.toContain("Masern");
      expect(teil).not.toContain("Impfpass");
      expect(teil).not.toContain("Aufenthaltstitel");
      expect(teil).not.toContain("Rückseite");
      expect(teil.split(VERTRAULICHE_UNTERLAGE).length - 1).toBe(2);
      expect(teil).toContain("Einzelheiten sehen Sie nach dem Öffnen des Links");
      expect(teil).toContain("Nachweis private Krankenversicherung");
    }
    expect(felder.anzahl_unterlagen).toBe(3);
  });

  it("weder Aufforderung noch Erinnerung nennen die sensible Unterlage", () => {
    const basis = personBasis({ positionen: [MASERN, TITEL, PKV] });
    const mails = [
      rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, aufforderungMailFelder({ ...basis, anlass: "ANFORDERUNG" })),
      rendern(UNTERLAGEN_EVENTS.ERINNERUNG, erinnerungMailFelder({ ...basis, stufe: "VORAB", entwurfVorhanden: false })),
    ];
    for (const mail of mails) {
      for (const teil of alleTeile(mail)) {
        expect(teil).not.toMatch(/Masern|Impfpass|Aufenthaltstitel/);
      }
      expect(mail.html).toContain(VERTRAULICHE_UNTERLAGE);
      expect(mail.text).toContain(VERTRAULICHE_UNTERLAGE);
    }
  });

  it("die Zurueckweisung einer sensiblen Unterlage nennt weder Name noch Begruendung", () => {
    const payload = zurueckweisungMailFelder({
      ...personBasis({ positionen: [{ ...MASERN, status: "ZURUECKGEWIESEN" }, PKV] }),
      position: { ...MASERN, status: "ZURUECKGEWIESEN", einreichungen: 1 },
      begruendung: "Die Impfung vom 12.03.1990 ist nicht lesbar.",
    });
    expect(payload.unterlage).toBe("");
    expect(payload.begruendung).toBe("");
    expect(payload.begruendung_html).toBe("");
    const mail = rendern(UNTERLAGEN_EVENTS.ZURUECKGEWIESEN, payload);
    for (const teil of alleTeile(mail)) {
      expect(teil).not.toMatch(/Masern|Impfung|lesbar|Begründung:/);
    }
    expect(mail.text).toContain("die Personalabteilung konnte eine Unterlage nicht annehmen.");
    expect(mail.text).toContain("Nach dem Öffnen des Links sehen Sie alle Einzelheiten");
  });

  it("die Zurueckweisung einer nicht sensiblen Unterlage nennt Name und Begruendung im Text", () => {
    const payload = zurueckweisungMailFelder({
      ...personBasis(),
      position: { ...PKV, status: "ZURUECKGEWIESEN", einreichungen: 2 },
      begruendung: "Der Beginn fehlt.\nBitte vollständig.",
    });
    expect(payload.einreichung_nr).toBe(2);
    const mail = rendern(UNTERLAGEN_EVENTS.ZURUECKGEWIESEN, payload);
    expect(mail.text).toContain("Unterlage: Nachweis private Krankenversicherung");
    expect(mail.text).toContain("Begründung:\nDer Beginn fehlt.\nBitte vollständig.");
    expect(mail.html).toContain("Der Beginn fehlt.<br>Bitte vollständig.");
  });

  it("ohne Details (Stufe 2) bleiben Liste, Name und Vorgangsnummer leer", () => {
    const basis = personBasis({ vorgang: { mitDetails: false } });
    const auf = aufforderungMailFelder({ ...basis, anlass: "ANFORDERUNG" });
    expect(auf.unterlagenliste).toBe("");
    expect(auf.unterlagenliste_html).toBe("");
    expect(auf.original_erforderlich).toBe("");
    expect(auf.displayId).toBe("");
    expect(auf.vorgang_zusatz).toBe("");
    expect(auf.ohne_details).toBe("ja");
    const mail = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, auf);
    expect(mail.subject).toBe("Unterlagen zu Ihrem Vorgang – FES Minden");
    for (const teil of alleTeile(mail)) {
      expect(teil).not.toMatch(/2026-GYM-014|Krankenversicherung|Rentenversicherung/);
    }
    expect(mail.text).toContain("Welche, sehen Sie nach dem Öffnen des Links.");

    const zurueck = zurueckweisungMailFelder({ ...basis, position: { ...PKV, status: "ZURUECKGEWIESEN" }, begruendung: "Unscharf." });
    expect(zurueck.unterlage).toBe("");
    expect(zurueck.begruendung).toBe("");
  });
});

// =============================================
// Liste
// =============================================

describe("unterlagenlisteMailFelder", () => {
  it("listet nur, was auf die Person wartet (offen oder zurueckgewiesen)", () => {
    const felder = unterlagenlisteMailFelder(
      [
        position({ bezeichnung: "A", status: "ANGEFORDERT" }),
        position({ bezeichnung: "B", status: "EINGEREICHT" }),
        position({ bezeichnung: "C", status: "ANGENOMMEN" }),
        position({ bezeichnung: "D", status: "ZURUECKGEWIESEN" }),
        position({ bezeichnung: "E", status: "ENTFAELLT" }),
      ],
      true,
    );
    expect(felder.unterlagenliste).toBe("- A\n- D");
    expect(felder.anzahl_unterlagen).toBe(2);
  });

  it("kennzeichnet neue Positionen und die Schriftform", () => {
    const felder = unterlagenlisteMailFelder(
      [position({ bezeichnung: "Neu", neu: true }), { ...RV, neu: true }, { ...MASERN, neu: true }],
      true,
    );
    expect(felder.unterlagenliste).toBe(
      "- Neu (neu)\n" +
        `- Unterschriebener Antrag auf Befreiung von der Rentenversicherungspflicht (neu) – ${ORIGINAL_ZUSATZ}\n` +
        `- ${VERTRAULICHE_UNTERLAGE} (neu) – Einzelheiten sehen Sie nach dem Öffnen des Links`,
    );
    expect(felder.original_erforderlich).toBe("ja");
  });

  it("ohne Schriftform bleibt original_erforderlich leer; ohne Positionen ist alles leer", () => {
    expect(unterlagenlisteMailFelder([PKV, MASERN], true).original_erforderlich).toBe("");
    expect(unterlagenlisteMailFelder([], true)).toEqual({
      unterlagenliste: "",
      unterlagenliste_html: "",
      anzahl_unterlagen: 0,
      original_erforderlich: "",
    });
  });

  it("rueckt mehrzeilige Hinweise im Klartext ein und bricht sie im HTML um", () => {
    const felder = unterlagenlisteMailFelder([position({ bezeichnung: "X", hinweis: "Zeile 1\r\nZeile 2" })], true);
    expect(felder.unterlagenliste).toBe("- X\n  Zeile 1\n  Zeile 2");
    expect(felder.unterlagenliste_html).toContain("Zeile 1<br>Zeile 2");
  });
});

// =============================================
// Maskierung
// =============================================

describe("Freitexte: im HTML maskiert, im Text roh", () => {
  const BOESE = '<a href="https://boese.example.org">Klick</a>';

  it("Bezeichnung, Hinweis und Nachricht der Aufforderung", () => {
    const payload = aufforderungMailFelder({
      ...personBasis({ positionen: [position({ bezeichnung: `Nachweis ${BOESE}`, hinweis: `Hinweis ${BOESE}` })], nachricht: `Nachricht ${BOESE}` }),
      anlass: "ANFORDERUNG",
    });
    const mail = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, payload);
    expect(mail.html).not.toContain('<a href="https://boese');
    expect(mail.html).toContain("Nachweis &lt;a href=&quot;https://boese.example.org&quot;&gt;Klick&lt;/a&gt;");
    expect(mail.html).toContain("Hinweis &lt;a href=");
    expect(mail.html).toContain("Nachricht &lt;a href=");
    expect(mail.text).toContain(`Nachweis ${BOESE}`);
    expect(mail.text).toContain(`Hinweis ${BOESE}`);
    expect(mail.text).toContain(`Nachricht ${BOESE}`);
  });

  it("Name und Begruendung der Zurueckweisung", () => {
    const payload = zurueckweisungMailFelder({
      ...personBasis(),
      position: position({ bezeichnung: `Nachweis ${BOESE}`, status: "ZURUECKGEWIESEN" }),
      begruendung: `Grund ${BOESE}`,
    });
    const mail = rendern(UNTERLAGEN_EVENTS.ZURUECKGEWIESEN, payload);
    expect(mail.html).not.toContain('<a href="https://boese');
    expect(mail.html).toContain("Grund &lt;a href=");
    expect(mail.text).toContain(`Grund ${BOESE}`);
    expect(mail.text).toContain(`Unterlage: Nachweis ${BOESE}`);
  });

  it("setzt ein Admin die Rohfelder ins HTML, werden sie trotzdem maskiert", () => {
    const html = "<p>{{unterlagenliste}}|{{unterlage}}|{{begruendung}}|{{nachricht}}</p>";
    const payload = zurueckweisungMailFelder({
      ...personBasis({ positionen: [position({ bezeichnung: `L ${BOESE}` })], nachricht: `N ${BOESE}` }),
      position: position({ bezeichnung: `U ${BOESE}`, status: "ZURUECKGEWIESEN" }),
      begruendung: `B ${BOESE}`,
    });
    const mail = rendern(UNTERLAGEN_EVENTS.ZURUECKGEWIESEN, payload, { bodyHtml: html });
    expect(mail.html).not.toContain("<a href");
    expect(mail.html.match(/&lt;a href=/g)).toHaveLength(4);
  });

  it("der Name der anfordernden HR-Kraft wird im HTML der HR-Mails maskiert", () => {
    const eingabe = hrBasis();
    const payload = vollstaendigMailFelder({
      ...eingabe,
      anfordernd: { ...eingabe.anfordernd, name: `Erika ${BOESE}` },
      uebermitteltAm: new Date("2026-09-21T17:05:00.000Z"),
    });
    const mail = rendern(UNTERLAGEN_EVENTS.VOLLSTAENDIG, payload);
    expect(mail.html).not.toContain('<a href="https://boese');
    expect(mail.html).toContain("von Erika &lt;a href=");
    expect(mail.text).toContain(`von Erika ${BOESE}`);
  });

  it("Dollarzeichen im Freitext bleiben wortgetreu ($', $&, $1) — Regression", () => {
    // Frueher ersetzte der Renderer mit String.replace und einer Zeichenkette:
    // $' und $& wurden dort als Ersetzungsmuster ausgewertet. Heute arbeitet
    // renderTemplate mit Ersetzungsfunktionen — dieser Test haelt das fest.
    const text = "Gebühr 5$' und $& und $1 und $$";
    expect(renderTemplate("A {{nachricht}} B", { nachricht: text })).toBe(`A ${text} B`);
    expect(renderTemplate("{{#nachricht}}[{{nachricht}}]{{/nachricht}}", { nachricht: text })).toBe(`[${text}]`);

    const payload = aufforderungMailFelder({ ...personBasis({ nachricht: text }), anlass: "ANFORDERUNG" });
    const mail = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, payload);
    expect(mail.text).toContain(text);
    expect(mail.html).toContain("Gebühr 5$' und $&amp; und $1 und $$");
  });
});

// =============================================
// Anlass, Frist, Vorgangsnummer
// =============================================

describe("Anlass-Merker der Aufforderung", () => {
  const MERKER = ["ist_erstmalig", "ist_ergaenzung", "ist_erneut", "ist_fristaenderung", "ist_nachgeholt"];
  const ERWARTET: Record<UnterlagenAufforderungAnlass, string> = {
    ANFORDERUNG: "ist_erstmalig",
    ERGAENZUNG: "ist_ergaenzung",
    ERNEUT: "ist_erneut",
    FRISTAENDERUNG: "ist_fristaenderung",
  };

  it.each(Object.keys(ERWARTET) as UnterlagenAufforderungAnlass[])("%s setzt genau einen Merker", (anlass) => {
    const payload = aufforderungMailFelder({ ...personBasis(), anlass });
    expect(MERKER.filter((m) => payload[m] === "ja")).toEqual([ERWARTET[anlass]]);
  });

  it("beim Nachholen ist nur ist_nachgeholt gesetzt, gleich welcher Anlass", () => {
    for (const anlass of Object.keys(ERWARTET) as UnterlagenAufforderungAnlass[]) {
      const payload = aufforderungMailFelder({ ...personBasis(), anlass, nachgeholt: true });
      expect(MERKER.filter((m) => payload[m] === "ja")).toEqual(["ist_nachgeholt"]);
    }
  });

  it("nur die Ergaenzung beginnt den Betreff mit „Ergänzung:“", () => {
    const ergaenzung = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, aufforderungMailFelder({ ...personBasis(), anlass: "ERGAENZUNG" }));
    const erneut = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, aufforderungMailFelder({ ...personBasis(), anlass: "ERNEUT" }));
    expect(ergaenzung.subject).toBe("Ergänzung: Unterlagen zu Ihrem Vorgang 2026-GYM-014 – FES Minden");
    expect(erneut.subject).toBe("Unterlagen zu Ihrem Vorgang 2026-GYM-014 – FES Minden");
    expect(ergaenzung.text).toContain("hat ihre Anforderung um weitere Unterlagen ergänzt");
    expect(erneut.text).toContain("Sie erhalten Ihren persönlichen Link hier noch einmal.");
  });

  it("die Erinnerung am Fristtag beginnt den Betreff mit „Heute:“", () => {
    const fristtag = rendern(UNTERLAGEN_EVENTS.ERINNERUNG, erinnerungMailFelder({ ...personBasis({ heute: "2026-09-25" }), stufe: "FRISTTAG", entwurfVorhanden: false }));
    expect(fristtag.subject).toBe("Heute: Erinnerung: Unterlagen zu Ihrem Vorgang 2026-GYM-014 – Frist 25.09.2026");
    expect(fristtag.text).toContain("heute, am Freitag, 25.09.2026, endet die Frist");
    expect(fristtag.text).not.toContain("„Unterlagen übermitteln“ geklickt");
  });
});

describe("Frist und Linkende (EP-16)", () => {
  it("bis einschliesslich zum Fristtag nennt die Mail nur die Frist", () => {
    for (const heute of ["2026-09-14", "2026-09-25"]) {
      const payload = aufforderungMailFelder({ ...personBasis({ heute }), anlass: "ERNEUT" });
      expect(payload.frist_verstrichen).toBe("");
      expect(payload.link_gueltig_bis).toBe("");
      const mail = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, payload);
      for (const teil of alleTeile(mail)) expect(teil).not.toContain("09.10.2026");
      expect(mail.text).toContain("Frist: Freitag, 25.09.2026");
    }
  });

  it("nach der Frist kommt der Satz mit dem Linkende dazu", () => {
    const payload = aufforderungMailFelder({ ...personBasis({ heute: "2026-09-26" }), anlass: "ERNEUT" });
    expect(payload.frist_verstrichen).toBe("ja");
    expect(payload.link_gueltig_bis).toBe("09.10.2026");
    const mail = rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, payload);
    expect(mail.text).toContain("Die Frist ist abgelaufen. Sie können die Unterlagen noch bis zum 09.10.2026 hochladen.");
    expect(mail.html).toContain("noch bis zum 09.10.2026 hochladen");

    const zurueck = rendern(
      UNTERLAGEN_EVENTS.ZURUECKGEWIESEN,
      zurueckweisungMailFelder({ ...personBasis({ heute: "2026-09-26" }), position: { ...PKV, status: "ZURUECKGEWIESEN" }, begruendung: "x" }),
    );
    expect(zurueck.text).toContain("Sie können die Unterlage noch bis zum 09.10.2026 hochladen.");
  });

  it("frist und frist_lang tragen den gerechneten Wochentag", () => {
    const payload = aufforderungMailFelder({ ...personBasis(), anlass: "ANFORDERUNG" });
    expect(payload.frist).toBe("25.09.2026");
    expect(payload.frist_lang).toBe("Freitag, 25.09.2026");
  });
});

describe("Vorgangsnummer ohne doppelte Leerzeichen", () => {
  it("ohne displayId sind vorgang_zusatz leer und vorgang_kurz nur „Vorgang“", () => {
    const person = aufforderungMailFelder({ ...personBasis({ vorgang: { displayId: null } }), anlass: "ANFORDERUNG" });
    expect(person.vorgang_zusatz).toBe("");
    expect(person.vorgang_kurz).toBe("Vorgang");
    expect(rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, person).subject).toBe("Unterlagen zu Ihrem Vorgang – FES Minden");

    const hr = fristVerstrichenMailFelder({ ...hrBasis({ vorgang: { displayId: "  " } }), linkGueltigBis: "2026-10-09", nieZugestellt: false });
    expect(rendern(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN, hr).subject).toBe("Frist verstrichen (25.09.2026): Unterlagen für Vorgang");

    for (const { subject } of [rendern(UNTERLAGEN_EVENTS.ANGEFORDERT, person), rendern(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN, hr)]) {
      expect(subject).not.toMatch(/ {2}/);
    }
  });

  it("ohne Details nennen auch die HR-Mails keine Nummer (Feinplanung 8.2, „Gemeinsam“)", () => {
    // Stufe 2: Das Praefix verriete das Modul („MS-…“), der HR-Betreff steht
    // 90 Tage im Versandprotokoll, und die HR-Payload geht an Webhooks.
    const eingabe = hrBasis({ vorgang: { mitDetails: false } });
    const payloads = [
      { event: UNTERLAGEN_EVENTS.VOLLSTAENDIG, payload: vollstaendigMailFelder({ ...eingabe, uebermitteltAm: new Date("2026-09-21T17:05:00.000Z") }) },
      { event: UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN, payload: fristVerstrichenMailFelder({ ...eingabe, linkGueltigBis: "2026-10-09", nieZugestellt: false }) },
    ];
    for (const { event, payload } of payloads) {
      expect(payload).toMatchObject({ displayId: "", vorgang_zusatz: "", vorgang_kurz: "Vorgang", mit_details: "", ohne_details: "ja" });
      const mail = rendern(event, payload);
      for (const teil of alleTeile(mail)) {
        expect({ event, nummer: teil.includes("2026-GYM-014") }).toEqual({ event, nummer: false });
      }
      expect(mail.subject).not.toMatch(/ {2}/);
    }
    expect(rendern(UNTERLAGEN_EVENTS.VOLLSTAENDIG, payloads[0].payload).subject).toBe(
      "Unterlagen eingegangen: Vorgang für Anna Beispiel",
    );

    // Mit Details (Stufe 1) steht die Nummer dagegen im HR-Betreff.
    const mitNummer = vollstaendigMailFelder({ ...hrBasis(), uebermitteltAm: new Date("2026-09-21T17:05:00.000Z") });
    expect(mitNummer.vorgang_kurz).toBe("Vorgang 2026-GYM-014");
  });
});

// =============================================
// HR-Mails
// =============================================

describe("HR-Mails: keine Adresse der Person, kein Link, keine Unterlagennamen", () => {
  const hrPayloads = () => [
    vollstaendigMailFelder({ ...hrBasis(), uebermitteltAm: new Date("2026-09-21T17:05:00.000Z") }),
    fristVerstrichenMailFelder({ ...hrBasis(), linkGueltigBis: "2026-10-09", nieZugestellt: false }),
  ];

  it("die Payload traegt kein Adress- und kein Link-Feld", () => {
    for (const payload of hrPayloads()) {
      for (const k of ["email", "employeeEmail", "recipientEmail", "privateEmail", "mitarbeiter_email", "link", "magicLink", "magicUrl", "unterlagenliste", "unterlage"]) {
        expect({ k, drin: k in payload }).toEqual({ k, drin: false });
      }
    }
  });

  it("kein Wert nennt eine Unterlage, ihren Hinweis oder die Adresse der Person", () => {
    for (const payload of hrPayloads()) {
      const werte = Object.values(payload).map(String).join("\n");
      for (const p of [MASERN, PKV, RV]) {
        expect(werte).not.toContain(p.bezeichnung);
        if (p.hinweis) expect(werte).not.toContain(p.hinweis);
      }
      expect(werte).not.toContain("anna.beispiel@example.org");
    }
  });

  it("die gerenderten HR-Mails gehen an die anfordernde Person mit Kopie an das HR-Postfach", () => {
    for (const [i, payload] of hrPayloads().entries()) {
      const event = i === 0 ? UNTERLAGEN_EVENTS.VOLLSTAENDIG : UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN;
      const mail = rendern(event, payload);
      expect(mail.to).toBe("erika.muster@example.org");
      expect(mail.cc).toBe("personal@example.org");
      for (const teil of alleTeile(mail)) {
        expect(teil).not.toMatch(/Masern|Krankenversicherung|Rentenversicherung|anna\.beispiel@/);
      }
      expect(mail.html).toContain(PORTAL);
    }
  });

  it("Zaehler und Merker der Meldung „vollständig“", () => {
    const [vollstaendig] = hrPayloads();
    expect(vollstaendig).toMatchObject({
      anzahl_unterlagen: 3,
      anzahl_zu_pruefen: 2,
      anzahl_angenommen: 1,
      anzahl_offen: 0,
      uebermittelt_am: "21.09.2026",
      angefordert_am: "14.09.2026",
      angefordert_von: "Erika Muster",
      erneut_eingereicht: "ja",
    });
    const ersteRunde = vollstaendigMailFelder({
      ...hrBasis({ positionen: [{ ...PKV, status: "EINGEREICHT", einreichungen: 1 }, { ...RV, status: "ENTFAELLT" }] }),
      uebermitteltAm: new Date(),
    });
    expect(ersteRunde.erneut_eingereicht).toBe("");
    // Entfallene Unterlagen zaehlen nicht mit.
    expect(ersteRunde.anzahl_unterlagen).toBe(1);
  });

  it("„Frist verstrichen“ nennt das Linkende und bei Bedarf „nie zugestellt“", () => {
    const mit = fristVerstrichenMailFelder({ ...hrBasis(), linkGueltigBis: "2026-10-09", nieZugestellt: true });
    expect(mit).toMatchObject({ link_gueltig_bis: "09.10.2026", nie_zugestellt: "ja" });
    const mail = rendern(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN, mit);
    expect(mail.text).toContain("Die Aufforderung wurde der Person nie zugestellt – bitte Adresse prüfen.");
    expect(mail.text).toContain("möglich bis zum 09.10.2026");
    const ohne = rendern(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN, fristVerstrichenMailFelder({ ...hrBasis(), linkGueltigBis: "2026-10-09", nieZugestellt: false }));
    expect(ohne.text).not.toContain("nie zugestellt");
  });
});

describe("hrEmpfaengerFelder: Entdoppeln und Rueckfall auf das HR-Postfach", () => {
  const aktiv = { email: "erika.muster@example.org", name: "Erika Muster", aktiv: true };

  it("aktive anfordernde Person: An sie, Cc das Postfach", () => {
    expect(hrEmpfaengerFelder(aktiv, " personal@example.org ")).toEqual({
      anfordernde_email: "erika.muster@example.org",
      hr_postfach: "personal@example.org",
    });
  });

  it("gleiche Adresse (auch in anderer Schreibweise) steht nur einmal", () => {
    expect(hrEmpfaengerFelder(aktiv, "Erika.Muster@Example.org")).toEqual({
      anfordernde_email: "erika.muster@example.org",
      hr_postfach: "",
    });
  });

  it("inaktives oder geloeschtes Konto: An das Postfach, kein Cc", () => {
    const erwartet = { anfordernde_email: "personal@example.org", hr_postfach: "" };
    expect(hrEmpfaengerFelder({ ...aktiv, aktiv: false }, "personal@example.org")).toEqual(erwartet);
    expect(hrEmpfaengerFelder(null, "personal@example.org")).toEqual(erwartet);
    expect(hrEmpfaengerFelder({ ...aktiv, email: null }, "personal@example.org")).toEqual(erwartet);
  });

  it("ohne Postfach bleibt nur die anfordernde Person — ohne beides ueberspringt der Mailer", () => {
    expect(hrEmpfaengerFelder(aktiv, null)).toEqual({ anfordernde_email: "erika.muster@example.org", hr_postfach: "" });
    const payload = vollstaendigMailFelder({ ...hrBasis(), anfordernd: null, hrPostfach: "", uebermitteltAm: new Date() });
    expect(payload.anfordernde_email).toBe("");
    expect(payload.angefordert_von).toBe("");
    const vorlage = standardVorlage(UNTERLAGEN_EVENTS.VOLLSTAENDIG);
    const { rendered, skipReason } = renderEventEmail(
      { subject: vorlage.subject, bodyHtml: vorlage.bodyHtml, bodyText: vorlage.bodyText, recipientTo: "", recipientCc: "", recipientBcc: "", recipientReplyTo: "" },
      UNTERLAGEN_EVENTS.VOLLSTAENDIG,
      payload,
    );
    expect(rendered).toBeNull();
    expect(skipReason).toMatch(/Kein Empfaenger/);
    // Ohne Namen der HR-Kraft bleibt der Satz „Angefordert am …“ vollstaendig.
    expect(rendern(UNTERLAGEN_EVENTS.VOLLSTAENDIG, { ...payload, anfordernde_email: "x@example.org" }).text).toContain(
      "Angefordert: am 14.09.2026\n",
    );
  });
});

describe("Personen-Mails gehen nur an die Adresse der Nachforderung", () => {
  it("overrideTo verwirft einen Verteiler aus Cc und Bcc der Vorlage", () => {
    const payload = aufforderungMailFelder({ ...personBasis(), anlass: "ANFORDERUNG" });
    const mail = rendern(
      UNTERLAGEN_EVENTS.ANGEFORDERT,
      payload,
      { recipientCc: "verteiler@example.org", recipientBcc: "mitleser@example.org" },
      { overrideTo: "anna.beispiel@example.org" },
    );
    expect(mail.to).toBe("anna.beispiel@example.org");
    expect(mail.cc).toBeUndefined();
    expect(mail.bcc).toBeUndefined();
    expect(mail.replyTo).toBe("personal@example.org");
  });

  it("jede Mail an die Person traegt den Link im Text, den Hinweis gegen Mail-Anhaenge und keinen Ablauf-Platzhalter", () => {
    for (const { name, event, payload } of varianten().filter((v) => UNTERLAGEN_PERSONEN_EVENTS.includes(v.event))) {
      const mail = rendern(event, payload);
      expect({ name, html: mail.html.includes(`href="${LINK}"`), text: (mail.text ?? "").includes(LINK) }).toEqual({ name, html: true, text: true });
      expect(mail.text).toContain("Bitte senden Sie Unterlagen nicht per E-Mail, sondern nur über den Link.");
      expect(mail.text).toContain("Der Link ist persönlich, bitte nicht weiterleiten.");
    }
  });
});

// =============================================
// Beispielgeschichte (Katalog == Bausteine)
// =============================================

describe("Beispielgeschichte im Katalog", () => {
  const [masern, pkv, rv] = UNTERLAGEN_BEISPIEL_UNTERLAGEN;
  const stand = (s: [string, string, string], e: [number, number, number] = [0, 0, 0]): UnterlagenMailPosition[] =>
    [masern, pkv, rv].map((u, i) => ({ ...u, status: s[i], neu: false, einreichungen: e[i] }));
  const vorgang: UnterlagenMailVorgang = {
    nachforderungId: "00000000-0000-0000-0000-000000000041",
    modul: "ONBOARDING",
    refId: "00000000-0000-0000-0000-000000000014",
    displayId: "2026-GYM-014",
    einrichtung: "FES Minden",
    vorname: "Anna",
    nachname: "Beispiel",
    frist: "2026-09-25",
    mitDetails: true,
  };
  const person = {
    vorgang,
    empfaenger: "anna.beispiel@example.org",
    link: "https://hr.fes-credo.de/beispiel-link",
    linkGueltigBis: "2026-10-09",
    nachricht: UNTERLAGEN_BEISPIEL_NACHRICHT,
  };
  const hr = {
    vorgang,
    portalLink: PORTAL,
    anfordernd: { email: "erika.muster@example.org", name: "Erika Muster", aktiv: true },
    hrPostfach: "personal@example.org",
    angefordertAm: new Date("2026-09-14T08:30:00.000Z"),
  };
  const beispiel = (event: string) => getEventDefinition(event)!.samplePayload;

  it("Mo 14.09.: Aufforderung", () => {
    expect(
      aufforderungMailFelder({ ...person, heute: "2026-09-14", positionen: stand(["ANGEFORDERT", "ANGEFORDERT", "ANGEFORDERT"]), anlass: "ANFORDERUNG" }),
    ).toEqual(beispiel(UNTERLAGEN_EVENTS.ANGEFORDERT));
  });

  it("Mi 16.09.: Zurueckweisung des PKV-Nachweises", () => {
    expect(
      zurueckweisungMailFelder({
        ...person,
        heute: "2026-09-16",
        positionen: stand(["ANGEFORDERT", "ZURUECKGEWIESEN", "EINGEREICHT"], [0, 1, 1]),
        position: { ...pkv, status: "ZURUECKGEWIESEN", neu: false, einreichungen: 1 },
        begruendung: UNTERLAGEN_BEISPIEL_BEGRUENDUNG,
      }),
    ).toEqual(beispiel(UNTERLAGEN_EVENTS.ZURUECKGEWIESEN));
  });

  it("Fr 18.09.: Vorab-Erinnerung mit Entwurf", () => {
    expect(
      erinnerungMailFelder({
        ...person,
        heute: "2026-09-18",
        positionen: stand(["ANGEFORDERT", "ZURUECKGEWIESEN", "ANGENOMMEN"], [0, 1, 1]),
        stufe: "VORAB",
        entwurfVorhanden: true,
      }),
    ).toEqual(beispiel(UNTERLAGEN_EVENTS.ERINNERUNG));
  });

  it("Mo 21.09.: vollstaendig eingegangen", () => {
    expect(
      vollstaendigMailFelder({
        ...hr,
        positionen: stand(["EINGEREICHT", "EINGEREICHT", "ANGENOMMEN"], [1, 2, 1]),
        uebermitteltAm: new Date("2026-09-21T17:05:00.000Z"),
      }),
    ).toEqual(beispiel(UNTERLAGEN_EVENTS.VOLLSTAENDIG));
  });

  it("Di 22.09.: die Frist bleibt beim 25.09. nur, weil HR die Vorbelegung zuruecksetzt (EP-1, EP-5)", () => {
    // Der Zurueckweisen-Dialog schlaegt heute + 7 vor, sobald die bisherige
    // Frist keine 7 Tage mehr entfernt liegt — am 22.09. also den 29.09. Die
    // Geschichte braucht die Meldung „Frist verstrichen“ am 26.09., deshalb
    // stellt HR den 25.09. wieder ein; erlaubt ist jede Frist ab morgen.
    expect(tageZwischen("2026-09-22", "2026-09-25")).toBe(3);
    expect(formatKalendertagLang("2026-09-29")).toBe("Dienstag, 29.09.2026");
  });

  it("Sa 26.09.: Frist verstrichen", () => {
    expect(
      fristVerstrichenMailFelder({
        ...hr,
        positionen: stand(["ZURUECKGEWIESEN", "ANGENOMMEN", "ANGENOMMEN"], [1, 2, 1]),
        linkGueltigBis: "2026-10-09",
        nieZugestellt: false,
      }),
    ).toEqual(beispiel(UNTERLAGEN_EVENTS.FRIST_VERSTRICHEN));
  });

  it("die Tage der Geschichte tragen ihre echten Wochentage", () => {
    expect(
      ["2026-09-14", "2026-09-16", "2026-09-18", "2026-09-21", "2026-09-25", "2026-09-26", "2026-10-09"].map(formatKalendertagLang),
    ).toEqual([
      "Montag, 14.09.2026",
      "Mittwoch, 16.09.2026",
      "Freitag, 18.09.2026",
      "Montag, 21.09.2026",
      "Freitag, 25.09.2026",
      "Samstag, 26.09.2026",
      "Freitag, 09.10.2026",
    ]);
  });

  it("der Masernschutz-Nachweis der Geschichte steht in keinem Beispiel beim Namen", () => {
    expect(masern.sensibel).toBe(true);
    for (const event of ALLE_EVENTS) {
      const werte = Object.values(beispiel(event)).map(String).join("\n");
      expect(werte).not.toContain(masern.bezeichnung);
      expect(werte).not.toContain(masern.hinweis!);
    }
  });
});
