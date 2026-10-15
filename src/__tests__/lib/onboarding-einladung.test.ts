/**
 * Tests: Einladungsmails beider Onboarding-Spuren (src/lib/onboarding-einladung.ts)
 *
 * Festgehalten ist, was vorher kaputt war:
 *   - Die Einladung an die Person gruesste ohne Namen mit „Herzlich willkommen, !".
 *   - Die Einladung an die Fuehrungskraft setzte ohne Namen die PRIVATE
 *     Adresse der Person ein — in Betreff, Text, Versandprotokoll und jeden
 *     Webhook.
 *   - Die Saetze dieser Einladung („Für die Einstellung von …") passten
 *     grammatisch nicht zur neutralen Bezeichnung.
 *   - Kurz nach Mitternacht nannten beide Einladungen verschiedene Fristen
 *     (Serverzeit UTC gegen deutsche Zeit).
 *   - Ein Name mit HTML stand roh im HTML-Teil der Mail an die Fuehrungskraft.
 *
 * Dazu: Die Payload-Bausteine liefern genau die Felder, die der Event-Katalog
 * als Beispiel fuehrt (Test-Versand und Doku zeigen also das Echte), und
 * `vorgesetztenLinkSetzen` rollt zurueck, wenn der Link inzwischen ein anderer ist.
 * Seit A2 (Ausstattung & Zugaenge, Regel 2) setzt es ausserdem den Merker
 * `mitAusstattung` — beim Anlegen der Zeile, beim Erneuern nur, solange er leer
 * und das Formular nie gespeichert ist —, und die Einladung nennt den Schritt
 * nur mit diesem Merker.
 *
 * @/lib/mailer wird NICHT gemockt: geprueft wird der echte Renderer mit den
 * echten Standardvorlagen. @/lib/db ist ersetzt, weil der Mailer es importiert;
 * @/lib/auth, weil es next/headers laedt.
 */

jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({
  generateToken: () => "mod-token",
  getTokenExpiryDate: () => new Date("2026-10-22T10:00:00Z"),
}));

import {
  LinkGeaendert,
  einladungMailFelder,
  fragebogenLinkZu,
  modalitaetenLinkZu,
  vorgesetztenLinkMailFelder,
  vorgesetztenLinkSetzen,
} from "@/lib/onboarding-einladung";
import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { EVENT_CATALOG } from "@/lib/events";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";

const PRIVAT = "anna.privat@example.org";
const LEITUNG = "schulleitung@example.org";
const ORG = { name: "FES Gymnasium", mandantNumber: "10" };

const ORIGINAL_APP_URL = process.env.APP_URL;
beforeAll(() => {
  process.env.APP_URL = "https://hr.example.org";
});
afterAll(() => {
  process.env.APP_URL = ORIGINAL_APP_URL;
});

function einladung(teil: { firstName?: string | null; lastName?: string | null } = {}) {
  return einladungMailFelder({
    id: "ob1",
    displayId: "2026-GYM-014",
    email: PRIVAT,
    firstName: null,
    lastName: null,
    token: "fb-token",
    tokenExpiresAt: new Date("2026-10-22T10:00:00Z"),
    organization: ORG,
    ...teil,
  });
}

function vorgesetztenLink(
  teil: Partial<Parameters<typeof vorgesetztenLinkMailFelder>[0]> = {},
  { ausstattungAngeboten = false }: { ausstattungAngeboten?: boolean } = {},
) {
  return vorgesetztenLinkMailFelder(
    {
      id: "ob1",
      displayId: "2026-GYM-014",
      supervisorEmail: LEITUNG,
      supervisorToken: "mod-token",
      supervisorTokenExpiresAt: new Date("2026-10-22T10:00:00Z"),
      organization: ORG,
      ...teil,
    },
    { ausstattungAngeboten },
  );
}

function rendere(event: string, payload: Record<string, unknown>) {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
  if (!vorlage) throw new Error(`Vorlage ${event} fehlt`);
  const { rendered } = renderEventEmail(
    { ...vorlage, recipientTo: "", recipientCc: "", recipientBcc: "", recipientReplyTo: "" },
    event,
    payload,
    { overrideTo: "test@example.org" },
  );
  return rendered!;
}

function beispiel(event: string): Record<string, unknown> {
  const def = EVENT_CATALOG.find((d) => d.event === event);
  if (!def) throw new Error(`Event ${event} fehlt im Katalog`);
  return def.samplePayload;
}

describe("Links", () => {
  it("baut beide Links aus APP_URL", () => {
    expect(fragebogenLinkZu("t1")).toBe("https://hr.example.org/fragebogen/t1");
    expect(modalitaetenLinkZu("t2")).toBe("https://hr.example.org/modalitaeten/t2");
  });
});

describe("Payload-Bausteine = Beispiel-Payloads im Katalog", () => {
  it("onboarding-created", () => {
    expect(Object.keys(einladung()).sort()).toEqual(
      Object.keys(beispiel("onboarding-created")).sort(),
    );
  });

  it("supervisor-link-created", () => {
    expect(Object.keys(vorgesetztenLink()).sort()).toEqual(
      Object.keys(beispiel("supervisor-link-created")).sort(),
    );
  });
});

describe("einladungMailFelder", () => {
  it("fuehrt den Namen in beiden Schreibweisen, getrimmt", () => {
    expect(einladung({ firstName: " Anna ", lastName: "Beispiel " })).toMatchObject({
      vorname: "Anna",
      nachname: "Beispiel",
      firstName: "Anna",
      lastName: "Beispiel",
      fragebogenLink: "https://hr.example.org/fragebogen/fb-token",
      tokenExpiresAt: "2026-10-22T10:00:00.000Z",
    });
  });

  it("laesst ohne Namen leere Felder stehen (wie die Erinnerung)", () => {
    expect(einladung()).toMatchObject({ vorname: "", nachname: "", firstName: "", lastName: "" });
  });
});

describe("vorgesetztenLinkMailFelder", () => {
  it("hat kein Feld email oder employeeEmail", () => {
    const felder = vorgesetztenLink();
    expect(felder).not.toHaveProperty("email");
    expect(felder).not.toHaveProperty("employeeEmail");
  });

  it("nennt ohne Namen die neutrale Bezeichnung", () => {
    expect(vorgesetztenLink()).toMatchObject({
      employeeName: MITARBEITER_NEUTRAL,
      mitarbeiter_name: MITARBEITER_NEUTRAL,
    });
  });

  it("nimmt den Namen aus dem Fragebogen vor dem am Vorgang", () => {
    const felder = vorgesetztenLink({
      firstName: "Anna",
      lastName: "Vorgang",
      personalData: { firstName: "Anna", lastName: "Fragebogen" },
    });
    expect(felder.mitarbeiter_name).toBe("Anna Fragebogen");
  });

  it("nimmt den Namen am Vorgang, solange der Fragebogen leer ist", () => {
    const felder = vorgesetztenLink({
      firstName: "Anna",
      lastName: null,
      personalData: { firstName: null, lastName: null },
    });
    expect(felder.employeeName).toBe("Anna");
  });

  // Merker als Zeichenkette: renderTemplate kennt nur „nicht leer“, String(false)
  // waere nicht leer und der Block bliebe stehen.
  it("fuehrt den Merker ausstattung_angeboten als \"ja\" bzw. \"\" — der Schluessel steht immer da", () => {
    expect(vorgesetztenLink({}, { ausstattungAngeboten: true }).ausstattung_angeboten).toBe("ja");
    expect(vorgesetztenLink({}, { ausstattungAngeboten: false })).toHaveProperty("ausstattung_angeboten", "");
  });
});

describe("Vorlage onboarding-created", () => {
  it("gruesst mit Vornamen", () => {
    const mail = rendere("onboarding-created", einladung({ firstName: "Anna", lastName: "Beispiel" }));
    expect(mail.text).toContain("Herzlich willkommen, Anna!");
    expect(mail.html).toContain("Herzlich willkommen, Anna!");
  });

  it("gruesst ohne Namen ohne leeres Komma", () => {
    const mail = rendere("onboarding-created", einladung());
    for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
      expect(teil).not.toContain(", !");
      expect(teil).not.toContain("{{");
    }
    expect(mail.text).toContain("Herzlich willkommen!");
    expect(mail.html).toContain("Herzlich willkommen!");
    expect(mail.text).toContain("https://hr.example.org/fragebogen/fb-token");
  });
});

describe("Vorlage supervisor-link-created", () => {
  it("passt grammatisch zur neutralen Bezeichnung — ohne eine Adresse als Namen", () => {
    const mail = rendere("supervisor-link-created", vorgesetztenLink());

    expect(mail.subject).toBe(
      "Einstellungsmodalitäten für die neue Mitarbeiterin / den neuen Mitarbeiter – bitte ausfüllen",
    );
    expect(mail.text).toContain("Für die neue Mitarbeiterin / den neuen Mitarbeiter fehlen");
    expect(mail.html).toContain("Für <strong>die neue Mitarbeiterin / den neuen Mitarbeiter</strong> fehlen");
    for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
      expect(teil).not.toContain(PRIVAT);
      expect(teil).not.toContain(LEITUNG);
      expect(teil).not.toContain("{{");
      expect(teil).not.toContain("Einstellung von");
    }
  });

  it("nennt die Frist des Links (aus supervisorTokenExpiresAt)", () => {
    const mail = rendere("supervisor-link-created", vorgesetztenLink());
    expect(mail.text).toContain("Bitte ausfüllen bis: 22.10.2026");
    expect(mail.html).toContain("<strong>Bitte ausfüllen bis:</strong> 22.10.2026");
  });

  it("nennt den Namen, wenn er bekannt ist", () => {
    const mail = rendere(
      "supervisor-link-created",
      vorgesetztenLink({ firstName: "Anna", lastName: "Beispiel" }),
    );
    expect(mail.subject).toBe("Einstellungsmodalitäten für Anna Beispiel – bitte ausfüllen");
    expect(mail.text).toContain("Für Anna Beispiel fehlen bei FES Gymnasium noch");
    expect(mail.text).toContain("https://hr.example.org/modalitaeten/mod-token");
  });

  it("laesst den Fristkasten ohne Frist weg", () => {
    const ohneFrist: Record<string, string> = { ...vorgesetztenLink() };
    delete ohneFrist.supervisorTokenExpiresAt;
    const mail = rendere("supervisor-link-created", ohneFrist);
    expect(mail.text).not.toContain("Bitte ausfüllen bis");
    expect(mail.html).not.toContain("Bitte ausfüllen bis");
    expect(mail.text).toContain("Formular öffnen:");
  });

  const SATZ_AUSSTATTUNG = "Im Formular können Sie auch angeben, was zum Arbeitsbeginn bereitstehen soll.";

  it("nennt den Ausstattungsschritt nur, wenn das Formular ihn zeigt (Regel 2)", () => {
    const mit = rendere("supervisor-link-created", vorgesetztenLink({}, { ausstattungAngeboten: true }));
    expect(mit.html).toContain(SATZ_AUSSTATTUNG);
    expect(mit.text).toContain(SATZ_AUSSTATTUNG);
    expect(mit.subject).not.toContain("Arbeitsbeginn");

    const ohne = rendere("supervisor-link-created", vorgesetztenLink());
    for (const teil of [ohne.subject, ohne.html, ohne.text ?? ""]) {
      expect(teil).not.toContain(SATZ_AUSSTATTUNG);
      expect(teil).not.toContain("ausstattung_angeboten");
      expect(teil).not.toContain("{{");
    }
    // Der Textteil bleibt ohne den Satz so, wie er vorher war: Liste, Leerzeile, „So geht es weiter".
    expect(ohne.text).toContain("- Vergütung (Entgeltgruppe/Stufe oder Festgehalt)\n\nSo geht es weiter:");
  });

  it("steht in HTML und Text im selben flachen Block (kein Block im Block)", () => {
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "supervisor-link-created")!;
    for (const teil of [vorlage.bodyHtml, vorlage.bodyText ?? ""]) {
      const block = teil.match(/\{\{#ausstattung_angeboten\}\}([\s\S]*?)\{\{\/ausstattung_angeboten\}\}/);
      expect(block?.[1]).toContain(SATZ_AUSSTATTUNG);
      expect(block?.[1]).not.toContain("{{");
    }
    expect(vorlage.subject).not.toContain("ausstattung_angeboten");
    expect(vorlage.variables.map((v) => v.key)).toContain("{{ausstattung_angeboten}}");
  });
});

describe("Sicherheitsnetz im Mailer", () => {
  it("setzt ohne jeden Namen die neutrale Bezeichnung — auch wenn ein Aufrufer `email` mitschickt", () => {
    const mail = rendere("supervisor-link-created", {
      supervisorEmail: LEITUNG,
      email: PRIVAT,
      modalitaetenLink: "https://hr.example.org/modalitaeten/x",
      organization: "FES Gymnasium",
    });
    expect(mail.subject).toContain(MITARBEITER_NEUTRAL);
    expect(mail.subject).not.toContain(PRIVAT);
    expect(mail.text).not.toContain(PRIVAT);
  });

  it("nennt in der Erinnerung nie die Adresse der Fuehrungskraft als Namen", () => {
    const mail = rendere("supervisor-reminder", {
      email: LEITUNG,
      supervisorEmail: LEITUNG,
      mitarbeiter_name: "",
      organization: "FES Gymnasium",
      supervisor_link: "https://hr.example.org/modalitaeten/x",
      tage_offen: 8,
    });
    expect(mail.subject).toBe(
      `Erinnerung: Einstellungsmodalitäten für ${MITARBEITER_NEUTRAL} offen`,
    );
  });

  it("nimmt Vor- und Nachnamen, wenn nur diese geschickt werden", () => {
    const mail = rendere("supervisor-link-created", {
      supervisorEmail: LEITUNG,
      vorname: "Anna",
      nachname: "Beispiel",
      organization: "FES Gymnasium",
    });
    expect(mail.subject).toContain("für Anna Beispiel –");
  });
});

describe("Frist in beiden Einladungen", () => {
  // Der Container laeuft ohne TZ, also in UTC; der Rechner, auf dem der Test
  // laeuft, womoeglich in deutscher Zeit — dann fiele der Fehler nicht auf.
  // process.env.TZ laesst sich in Jest nicht umstellen (jede Testdatei hat ihre
  // eigene Kopie von process.env), also wird die Serverzeit dort nachgestellt,
  // wo sie frueher wirkte: in toLocaleDateString ohne Zeitzone.
  let serverzeit: jest.SpyInstance | undefined;
  beforeEach(() => {
    const original = Date.prototype.toLocaleDateString;
    serverzeit = jest
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockImplementation(function (
        this: Date,
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
      ) {
        return original.call(this, locales, { timeZone: "UTC", ...options });
      });
  });
  afterEach(() => {
    serverzeit?.mockRestore();
  });

  it("nennt kurz nach Mitternacht in beiden Mails dasselbe Datum — in deutscher Zeit", () => {
    // 21.10. 23:30 UTC = 22.10. 01:30 MESZ. Frueher stand in der Einladung an
    // die Person (Serverzeit) der 21.10., bei der Fuehrungskraft der 22.10.
    const ablauf = new Date("2026-10-21T23:30:00Z");
    const person = rendere(
      "onboarding-created",
      einladungMailFelder({
        id: "ob1",
        displayId: "2026-GYM-014",
        email: PRIVAT,
        firstName: null,
        lastName: null,
        token: "fb-token",
        tokenExpiresAt: ablauf,
        organization: ORG,
      }),
    );
    const fuehrungskraft = rendere(
      "supervisor-link-created",
      vorgesetztenLink({ supervisorTokenExpiresAt: ablauf }),
    );

    expect(person.subject).toContain("(bis 22.10.2026)");
    expect(person.text).toContain("Bitte ausfüllen bis: 22.10.2026");
    expect(fuehrungskraft.text).toContain("Bitte ausfüllen bis: 22.10.2026");
  });

  it("schreibt Tag und Monat zweistellig — wie „Gültig bis“ im Dialog", () => {
    const mail = rendere(
      "onboarding-created",
      { ...einladung(), tokenExpiresAt: "2026-09-01T10:00:00.000Z" },
    );
    expect(mail.subject).toContain("(bis 01.09.2026)");
  });
});

describe("Namen im HTML-Teil", () => {
  const LINK_IM_NAMEN = '<a href="https://fremd.example">Anmelden</a>';

  it("maskiert einen Namen mit spitzen Klammern — kein fremder Link in der Mail an die Fuehrungskraft", () => {
    // Der Fragebogen begrenzt den Namen nur in der Laenge.
    const mail = rendere(
      "supervisor-link-created",
      vorgesetztenLink({ personalData: { firstName: LINK_IM_NAMEN, lastName: null } }),
    );

    expect(mail.html).not.toContain('<a href="https://fremd.example">');
    expect(mail.html).toContain(
      "&lt;a href=&quot;https://fremd.example&quot;&gt;Anmelden&lt;/a&gt;",
    );
    // Die Links der Vorlage selbst bleiben, wie sie sind.
    expect(mail.html).toContain('<a href="https://hr.example.org/modalitaeten/mod-token"');
    // Betreff und Textteil sind kein HTML: dort kein &lt;.
    expect(mail.subject).toContain(LINK_IM_NAMEN);
    expect(mail.text).not.toContain("&lt;");
  });

  it("maskiert auch den Gruss an die Person", () => {
    const mail = rendere("onboarding-created", einladung({ firstName: "<b>Anna</b>" }));
    expect(mail.html).toContain("Herzlich willkommen, &lt;b&gt;Anna&lt;/b&gt;!");
  });
});

describe("Vorlage employee-reminder", () => {
  function erinnerung(vorname: string) {
    return rendere("employee-reminder", {
      email: PRIVAT,
      vorname,
      nachname: "",
      organization: "FES Gymnasium",
      tage_offen: 7,
      fragebogenLink: "https://hr.example.org/fragebogen/x",
    });
  }

  it("gruesst mit Vornamen", () => {
    const mail = erinnerung("Anna");
    expect(mail.text).toContain("Hallo Anna, ");
    expect(mail.html).toContain("Hallo Anna, ");
  });

  it("gruesst ohne Namen ohne Leerzeichen vor dem Komma", () => {
    const mail = erinnerung("");
    expect(mail.text).toContain("Hallo, ");
    expect(mail.html).toContain("Hallo, ");
    expect(mail.text).not.toContain("Hallo , ");
    expect(mail.text).not.toContain("{{");
  });
});

describe("vorgesetztenLinkSetzen", () => {
  /**
   * `zeile` = was das upsert zurueckgibt. Ohne Angabe: die frisch angelegte
   * Zeile (Merker aus `create`, `currentStep` 0) — wie Prisma bei einer neuen.
   */
  function tx(
    count: number,
    zeile?: { mitAusstattung: boolean | null; currentStep: number },
    gesetzt = 1,
  ) {
    return {
      onboardingProcess: {
        updateMany: jest.fn().mockResolvedValue({ count }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          status: "INVITED",
          submittedAt: null,
          supervisorSubmittedAt: null,
          supervisorToken: "mod-token",
          personalData: { currentStep: 0, isComplete: false },
          supervisorData: { isComplete: false },
        }),
        update: jest.fn(),
      },
      supervisorData: {
        upsert: jest.fn(
          async ({ create }: { where: unknown; update: unknown; create: { mitAusstattung: boolean } }) =>
            zeile ?? { mitAusstattung: create.mitAusstattung, currentStep: 0 },
        ),
        updateMany: jest.fn().mockResolvedValue({ count: gesetzt }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  const eingabe = {
    id: "ob1",
    supervisorEmail: LEITUNG,
    bisherigerToken: "alter-token",
    bisherigeEmail: "falsch@example.org",
    userId: "u1",
    organizationName: "FES Gymnasium",
    ausstattungAngeboten: false,
    arbeitsortId: null,
  };

  it("liefert Token, Frist, Abgleich und Merker und vermerkt den ersetzten Link", async () => {
    const t = tx(1);
    const ergebnis = await vorgesetztenLinkSetzen(t as never, eingabe);

    expect(ergebnis).toEqual({
      supervisorToken: "mod-token",
      supervisorTokenExpiresAt: new Date("2026-10-22T10:00:00Z"),
      abgleich: { von: "INVITED", nach: "INVITED" },
      mitAusstattung: false,
    });
    expect(t.onboardingProcess.updateMany.mock.calls[0][0].where.supervisorToken).toBe("alter-token");
    expect(t.auditLog.create.mock.calls[0][0].data.details.ersetztLinkAn).toBe("falsch@example.org");
  });

  it("die Sperre gilt nur, solange der Vorgang auf dem Arbeitsort steht, aus dem der Merker stammt", async () => {
    // Ein Arbeitsort-PATCH zwischen dem Lesen des Aufrufers und dieser Sperre
    // laesst sie nichts treffen (LinkGeaendert unten) — sonst kaeme der Merker
    // aus dem Katalog des alten Orts und bliebe, weil der Ort ab dem Link
    // eingefroren ist.
    const mitOrt = tx(1);
    await vorgesetztenLinkSetzen(mitOrt as never, { ...eingabe, arbeitsortId: "org-grundschule" });
    expect(mitOrt.onboardingProcess.updateMany.mock.calls[0][0].where).toEqual({
      id: "ob1",
      supervisorToken: "alter-token",
      supervisorSubmittedAt: null,
      status: { notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] },
      arbeitsortId: "org-grundschule",
    });

    const ohneOrt = tx(1);
    await vorgesetztenLinkSetzen(ohneOrt as never, eingabe);
    expect(ohneOrt.onboardingProcess.updateMany.mock.calls[0][0].where.arbeitsortId).toBeNull();

    // Fehlt der Wert (ungetypter Aufrufer), faellt die Bedingung nicht still
    // weg (Prisma ignoriert `undefined`): Die Sperre trifft dann nur ohne Arbeitsort.
    const fehlt = tx(1);
    await vorgesetztenLinkSetzen(fehlt as never, { ...eingabe, arbeitsortId: undefined as unknown as null });
    expect(fehlt.onboardingProcess.updateMany.mock.calls[0][0].where).toHaveProperty("arbeitsortId", null);
  });

  it("wirft LinkGeaendert und schreibt sonst nichts, wenn das UPDATE nichts trifft", async () => {
    const t = tx(0);
    await expect(vorgesetztenLinkSetzen(t as never, eingabe)).rejects.toBeInstanceOf(LinkGeaendert);
    expect(t.supervisorData.upsert).not.toHaveBeenCalled();
    expect(t.supervisorData.updateMany).not.toHaveBeenCalled();
    expect(t.onboardingProcess.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(t.auditLog.create).not.toHaveBeenCalled();
  });

  describe("Merker mitAusstattung (Regel 2)", () => {
    it("angeboten: eine neue Zeile bekommt den Merker true mit dem Anlegen", async () => {
      const t = tx(1);
      const ergebnis = await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: true });

      expect(t.supervisorData.upsert).toHaveBeenCalledWith({
        where: { onboardingId: "ob1" },
        update: {},
        create: { onboardingId: "ob1", mitAusstattung: true },
        select: { mitAusstattung: true, currentStep: true },
      });
      // Schon beim Anlegen gesetzt — kein zweites Schreiben.
      expect(t.supervisorData.updateMany).not.toHaveBeenCalled();
      expect(ergebnis.mitAusstattung).toBe(true);
    });

    it("nicht angeboten: eine neue Zeile bekommt false, nicht null", async () => {
      const t = tx(1);
      const ergebnis = await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: false });

      expect(t.supervisorData.upsert.mock.calls[0][0].create).toEqual({ onboardingId: "ob1", mitAusstattung: false });
      // Beim Ersetzen bleibt die bestehende Zeile, wie sie ist.
      expect(t.supervisorData.upsert.mock.calls[0][0].update).toEqual({});
      expect(t.supervisorData.updateMany).not.toHaveBeenCalled();
      expect(ergebnis.mitAusstattung).toBe(false);
    });

    it("Erneuern einer Zeile ohne Merker, nie gespeichert: setzt ihn bedingt", async () => {
      const t = tx(1, { mitAusstattung: null, currentStep: 0 });
      const ergebnis = await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: true });

      expect(t.supervisorData.updateMany).toHaveBeenCalledWith({
        where: { onboardingId: "ob1", mitAusstattung: null, currentStep: 0 },
        data: { mitAusstattung: true },
      });
      expect(ergebnis.mitAusstattung).toBe(true);
    });

    it("das bedingte Setzen trifft nichts (Formular inzwischen gespeichert): der Merker bleibt leer und gilt als false", async () => {
      const t = tx(1, { mitAusstattung: null, currentStep: 0 }, 0);
      const ergebnis = await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: true });

      expect(t.supervisorData.updateMany).toHaveBeenCalledTimes(1);
      expect(ergebnis.mitAusstattung).toBe(false);
    });

    it("Erneuern mit currentStep > 0 laesst den Merker unveraendert — das Formular springt nicht", async () => {
      const t = tx(1, { mitAusstattung: null, currentStep: 2 });
      const ergebnis = await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: true });

      expect(t.supervisorData.updateMany).not.toHaveBeenCalled();
      expect(ergebnis.mitAusstattung).toBe(false);
    });

    it.each([
      [false, true],
      [true, false],
    ])(
      "ein gesetzter Merker (%s) bleibt, auch wenn der Katalog heute anders entscheidet (%s)",
      async (gespeichert, angeboten) => {
        const t = tx(1, { mitAusstattung: gespeichert, currentStep: 0 });
        const ergebnis = await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: angeboten });

        expect(t.supervisorData.updateMany).not.toHaveBeenCalled();
        expect(ergebnis.mitAusstattung).toBe(gespeichert);
      },
    );

    it("setzt den Merker vor dem Status-Abgleich und dem Protokoll — alles in derselben Transaktion", async () => {
      const t = tx(1, { mitAusstattung: null, currentStep: 0 });
      await vorgesetztenLinkSetzen(t as never, { ...eingabe, ausstattungAngeboten: true });

      const merker = t.supervisorData.updateMany.mock.invocationCallOrder[0];
      expect(t.onboardingProcess.updateMany.mock.invocationCallOrder[0]).toBeLessThan(merker);
      expect(merker).toBeLessThan(t.onboardingProcess.findUniqueOrThrow.mock.invocationCallOrder[0]);
      expect(merker).toBeLessThan(t.auditLog.create.mock.invocationCallOrder[0]);
    });
  });
});
