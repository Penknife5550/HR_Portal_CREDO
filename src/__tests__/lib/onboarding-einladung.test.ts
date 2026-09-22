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
) {
  return vorgesetztenLinkMailFelder({
    id: "ob1",
    displayId: "2026-GYM-014",
    supervisorEmail: LEITUNG,
    supervisorToken: "mod-token",
    supervisorTokenExpiresAt: new Date("2026-10-22T10:00:00Z"),
    organization: ORG,
    ...teil,
  });
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
  function tx(count: number) {
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
      supervisorData: { upsert: jest.fn().mockResolvedValue({}) },
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
  };

  it("liefert Token, Frist und Abgleich und vermerkt den ersetzten Link", async () => {
    const t = tx(1);
    const ergebnis = await vorgesetztenLinkSetzen(t as never, eingabe);

    expect(ergebnis).toEqual({
      supervisorToken: "mod-token",
      supervisorTokenExpiresAt: new Date("2026-10-22T10:00:00Z"),
      abgleich: { von: "INVITED", nach: "INVITED" },
    });
    expect(t.onboardingProcess.updateMany.mock.calls[0][0].where.supervisorToken).toBe("alter-token");
    expect(t.auditLog.create.mock.calls[0][0].data.details.ersetztLinkAn).toBe("falsch@example.org");
  });

  it("wirft LinkGeaendert und schreibt sonst nichts, wenn das UPDATE nichts trifft", async () => {
    const t = tx(0);
    await expect(vorgesetztenLinkSetzen(t as never, eingabe)).rejects.toBeInstanceOf(LinkGeaendert);
    expect(t.supervisorData.upsert).not.toHaveBeenCalled();
    expect(t.onboardingProcess.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(t.auditLog.create).not.toHaveBeenCalled();
  });
});
