/**
 * Mailtext im Versandprotokoll (src/lib/mail-text-archiv.ts).
 *
 * Der wichtigste Test ist der Durchlauf ueber ALLE Standardvorlagen: Er erzeugt
 * jede Mail mit dem Beispiel-Payload des Katalogs und prueft, dass in der Kopie
 * keine persoenliche Adresse stehen bleibt. Er faengt auch eine KUENFTIGE
 * Vorlage mit einem neuen Link — genau die Luecke, die ein Abgleich nach
 * Variablennamen laesst.
 */

const mockPrisma = {
  emailTemplate: { findUnique: jest.fn() },
  emailLog: { create: jest.fn() },
  smtpConfig: { findUnique: jest.fn() },
  webhookConfig: { findMany: jest.fn() },
};

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: jest.fn() })) },
}));
jest.mock("@/lib/encryption", () => ({
  decrypt: (v: string) => v,
  isEncryptionConfigured: () => false,
}));
jest.mock("@/lib/url", () => ({
  isPublicHostname: jest.fn().mockResolvedValue(true),
  redactUrlForLog: (url: string) => url,
}));

import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { EVENT_CATALOG } from "@/lib/events";
import {
  MAIL_TEXT_MELDUNGEN,
  MAX_TEXT_ZEICHEN,
  PLATZHALTER_LINK,
  PORTAL_PFADE_ERLAUBT,
  htmlFuerAnsicht,
  linksErsetzen,
  textAusHtml,
  textFuerProtokoll,
  textHinweis,
  textSpeichernErlaubt,
} from "@/lib/mail-text-archiv";

const APP = "https://hr.fes-credo.de";
const TOKEN = "3f9c7a1e-52b0-4d1b-9e6a-0c2f8d4b71aa";

describe("linksErsetzen", () => {
  it.each([
    "/fragebogen/",
    "/modalitaeten/",
    "/unterlagen/",
    "/exit-interview/",
    "/offboarding-tasks/",
    "/onboarding-tasks/",
    "/vertrag-formular/",
    "/elternzeit-antrag/",
    "/elternzeit-leiter/",
    "/civil-service-assessment/",
    "/zeugnis-bewertung/",
    "/verify/civil-service-assessment/",
    "/konto-einrichten/",
  ])("ersetzt den persoenlichen Zugang unter %s", (pfad) => {
    const html = `<a href="${APP}${pfad}${TOKEN}">Öffnen</a> ${APP}${pfad}${TOKEN}`;
    const kopie = linksErsetzen(html, APP);
    expect(kopie).not.toContain(TOKEN);
    expect(kopie).toContain(`<a href="#">Öffnen</a>`);
    expect(kopie).toContain(PLATZHALTER_LINK);
  });

  it("ersetzt auch einen Zugang, dessen Token kein UUID-Muster hat (Positivliste)", () => {
    const kopie = linksErsetzen(`Link: ${APP}/neue-seite/abc`, APP);
    expect(kopie).toBe(`Link: ${PLATZHALTER_LINK}`);
  });

  it("laesst Seiten hinter der Anmeldung stehen, samt Vorgangs-ID", () => {
    const vorgang = `${APP}/vorgaenge/onboarding/${TOKEN}?tab=dokumente`;
    const html = `<a href="${vorgang}">Vorgang</a> ${vorgang} ${APP}/einstellungen?tab=laeufe&amp;lauf=reminders`;
    expect(linksErsetzen(html, APP)).toBe(html);
  });

  it("vergleicht Pfade ganz oder als Anfang, nicht als Zeichenkette", () => {
    const kopie = linksErsetzen(`${APP}/vorgaenge-geheim/${TOKEN}`, APP);
    expect(kopie).toBe(PLATZHALTER_LINK);
  });

  it("ersetzt einen Token-Parameter auch auf einer erlaubten Seite", () => {
    const kopie = linksErsetzen(`${APP}/vorgaenge/onboarding/x?token=abc`, APP);
    expect(kopie).toBe(PLATZHALTER_LINK);
  });

  it("laesst eine fremde Adresse ohne Token-Muster stehen", () => {
    const html = `<a href="https://www.fes-minden.de/datenschutz">Datenschutz</a>`;
    expect(linksErsetzen(html, APP)).toBe(html);
  });

  it("ersetzt auf einer fremden Domain jede Adresse mit Token-Muster", () => {
    const kopie = linksErsetzen(`https://dienst.example.org/u/${TOKEN}`, APP);
    expect(kopie).toBe(PLATZHALTER_LINK);
    expect(linksErsetzen("https://dienst.example.org/a?token=x", APP)).toBe(PLATZHALTER_LINK);
    expect(linksErsetzen("https://dienst.example.org/x/AbCdEfGhIjKlMnOpQrSt12345", APP)).toBe(PLATZHALTER_LINK);
  });

  it("ist gross-/kleinschreibungsunempfindlich und kennt Port, Abfrage und Anker", () => {
    expect(linksErsetzen(`HTTPS://HR.FES-CREDO.DE/Fragebogen/${TOKEN}#oben`, APP)).toBe(PLATZHALTER_LINK);
    expect(linksErsetzen(`http://localhost:3000/fragebogen/${TOKEN}?a=1`, "http://localhost:3000")).toBe(PLATZHALTER_LINK);
  });

  it("behaelt das Satzzeichen hinter einer ersetzten Adresse", () => {
    expect(linksErsetzen(`Bitte öffnen Sie ${APP}/fragebogen/${TOKEN}.`, APP)).toBe(
      `Bitte öffnen Sie ${PLATZHALTER_LINK}.`,
    );
    expect(linksErsetzen(`(${APP}/fragebogen/${TOKEN})`, APP)).toBe(`(${PLATZHALTER_LINK})`);
  });

  it("ersetzt jedes Vorkommen, auch das zweite", () => {
    const kopie = linksErsetzen(`${APP}/fragebogen/${TOKEN} und nochmal ${APP}/fragebogen/${TOKEN}`, APP);
    expect(kopie.split(PLATZHALTER_LINK)).toHaveLength(3);
  });

  it("kann Pfade nicht mit ../ aus der Positivliste schmuggeln", () => {
    expect(linksErsetzen(`${APP}/vorgaenge/../fragebogen/${TOKEN}`, APP)).toBe(PLATZHALTER_LINK);
    expect(linksErsetzen(`${APP}/vorgaenge/%2e%2e/fragebogen/${TOKEN}`, APP)).toBe(PLATZHALTER_LINK);
  });

  it("ersetzt eine Adresse ohne Schema, die auf das Portal zeigt", () => {
    const kopie = linksErsetzen(`Link: hr.fes-credo.de/fragebogen/${TOKEN}`, APP);
    expect(kopie).toBe(`Link: ${PLATZHALTER_LINK}`);
    // …aber nicht eine E-Mail-Adresse auf derselben Domain
    expect(linksErsetzen("Antwort an hr@hr.fes-credo.de bitte", APP)).toBe("Antwort an hr@hr.fes-credo.de bitte");
  });

  it("ersetzt ein protokollrelatives href", () => {
    const kopie = linksErsetzen(`<a href="//hr.fes-credo.de/fragebogen/${TOKEN}">x</a>`, APP);
    expect(kopie).toBe(`<a href="#">x</a>`);
  });

  it("ist ohne bekannte Portal-Adresse geschlossen: nur erlaubte Pfade, jede Domain", () => {
    expect(linksErsetzen(`${APP}/fragebogen/${TOKEN}`, "")).toBe(PLATZHALTER_LINK);
    expect(linksErsetzen(`${APP}/vorgaenge/onboarding/x`, "")).toBe(`${APP}/vorgaenge/onboarding/x`);
    expect(linksErsetzen("https://www.fes-minden.de/datenschutz", "")).toBe(PLATZHALTER_LINK);
  });

  it("ersetzt eine Adresse, die sich nicht lesen laesst", () => {
    expect(linksErsetzen("http://[kaputt/x", APP)).toBe(PLATZHALTER_LINK);
  });

  it("laesst mailto: unberuehrt", () => {
    const html = `<a href="mailto:personal@fes-minden.de">Mail</a>`;
    expect(linksErsetzen(html, APP)).toBe(html);
  });

  it("die erlaubten Pfade sind die erwarteten (Aenderung nur mit Absicht)", () => {
    expect(PORTAL_PFADE_ERLAUBT).toEqual(["/vorgaenge", "/einstellungen", "/login", "/credo_logo.png"]);
  });
});

describe("textFuerProtokoll", () => {
  it("kuerzt nach dem Ersetzen und meldet es", () => {
    const lang = `<p>${"a".repeat(MAX_TEXT_ZEICHEN + 50)}</p> ${APP}/fragebogen/${TOKEN}`;
    const kopie = textFuerProtokoll(lang, APP);
    expect(kopie.gekuerzt).toBe(true);
    expect(kopie.bodyHtml).toHaveLength(MAX_TEXT_ZEICHEN);
    expect(kopie.bodyHtml).not.toContain(TOKEN);
  });

  it("kuerzt einen kurzen Text nicht", () => {
    expect(textFuerProtokoll("<p>Hallo</p>", APP)).toEqual({ bodyHtml: "<p>Hallo</p>", gekuerzt: false });
  });

  it("schneidet keine Adresse in der Mitte durch, bevor sie ersetzt ist", () => {
    // Die Adresse beginnt knapp vor der Grenze; ersetzt wird VOR dem Kuerzen.
    const html = "x".repeat(MAX_TEXT_ZEICHEN - 10) + ` ${APP}/fragebogen/${TOKEN}`;
    expect(textFuerProtokoll(html, APP).bodyHtml).not.toContain("fragebogen/3f9c");
  });
});

describe("textSpeichernErlaubt", () => {
  it("nie bei BEM — jedes Ereignis der Gruppe", () => {
    const bem = EVENT_CATALOG.filter((d) => d.group === "BEM");
    expect(bem.length).toBeGreaterThan(0);
    for (const d of bem) expect(textSpeichernErlaubt(d.event)).toBe(false);
  });

  it("nie bei einem bem-Praefix, auch ausserhalb des Katalogs", () => {
    expect(textSpeichernErlaubt("bem-irgendwas-neues")).toBe(false);
  });

  it("nie bei einem Ereignis ausserhalb des Katalogs", () => {
    expect(textSpeichernErlaubt("gibt-es-nicht")).toBe(false);
  });

  it("sonst ja — Mutterschutz eingeschlossen (Entscheidung 14.10.2026)", () => {
    expect(textSpeichernErlaubt("onboarding-created")).toBe(true);
    expect(textSpeichernErlaubt("mutterschutz-angelegt")).toBe(true);
    expect(textSpeichernErlaubt("individuelle-mail")).toBe(true);
  });
});

describe("textAusHtml", () => {
  it("macht aus Absaetzen, Umbruechen und Tabellen lesbare Zeilen", () => {
    const html =
      "<html><head><title>x</title><style>p{color:red}</style></head><body>" +
      "<h2>Hallo, Anna!</h2><p>Erster&nbsp;Absatz<br>zweite Zeile</p>" +
      '<table><tr><td>Bitte ausfüllen bis:</td><td><strong>28.10.2026</strong></td></tr></table>' +
      "<ul><li>IBAN</li><li>Steuer-ID</li></ul></body></html>";
    expect(textAusHtml(html)).toBe(
      [
        "Hallo, Anna!",
        "",
        "Erster Absatz",
        "zweite Zeile",
        "",
        "Bitte ausfüllen bis: 28.10.2026",
        "",
        "- IBAN",
        "- Steuer-ID",
      ].join("\n"),
    );
  });

  it("loest Entitaeten auf, ohne doppelt zu dekodieren", () => {
    expect(textAusHtml("<p>Müller &amp; Söhne &lt;b&gt; &quot;x&quot; &#228; &#xE4; &amp;lt;</p>")).toBe(
      'Müller & Söhne <b> "x" ä ä &lt;',
    );
  });

  it("laesst keinen Rest eines Tags zurueck, auch nicht am abgeschnittenen Ende", () => {
    expect(textAusHtml('<p>Text</p><a href="https://x.example/abc')).toBe("Text");
  });

  it("verwirft Skripte und Kommentare", () => {
    expect(textAusHtml("<!-- geheim --><script>alert(1)</script><p>Sichtbar</p>")).toBe("Sichtbar");
  });
});

describe("htmlFuerAnsicht", () => {
  it("entfernt Skripte, Rahmen, Formulare, Ereignisattribute und klickbare Adressen", () => {
    const html =
      '<html><head><meta http-equiv="refresh" content="0;url=https://boese.example"></head><body onload="x()">' +
      '<script>alert(1)</script><iframe src="https://boese.example"></iframe><form action="/x"><input></form>' +
      '<a href="https://hr.fes-credo.de/vorgaenge/x" onclick="y()">Vorgang</a></body></html>';
    const ansicht = htmlFuerAnsicht(html);
    expect(ansicht).not.toMatch(/<script|<iframe|<form|onload|onclick|href=|refresh/i);
    expect(ansicht).toContain("Vorgang");
    expect(ansicht).toContain("Content-Security-Policy");
  });

  it("setzt die CSP auch in ein Fragment ohne head", () => {
    const ansicht = htmlFuerAnsicht("<p>Hallo</p>");
    expect(ansicht).toMatch(/^<!DOCTYPE html><html><head>.*Content-Security-Policy.*<\/head><body><p>Hallo<\/p><\/body><\/html>$/);
  });
});

describe("textHinweis", () => {
  it("sagt nichts, wenn ein Text da ist", () => {
    expect(textHinweis({ event: "onboarding-created", status: "SENT", hatText: true })).toBeNull();
  });

  it("nennt den Grund je Lage", () => {
    expect(textHinweis({ event: "bem-frist-erinnerung", status: "SENT", hatText: false })).toBe(MAIL_TEXT_MELDUNGEN.bem);
    expect(textHinweis({ event: "onboarding-created", status: "SENT", isTest: true, hatText: false })).toBe(
      MAIL_TEXT_MELDUNGEN.test,
    );
    expect(textHinweis({ event: "onboarding-created", status: "SKIPPED", hatText: false })).toBe(
      MAIL_TEXT_MELDUNGEN.nichtErzeugt,
    );
    expect(textHinweis({ event: "onboarding-created", status: "SENT", hatText: false })).toBe(
      MAIL_TEXT_MELDUNGEN.nichtGespeichert,
    );
  });
});

/** Wie resolveEventTemplate (mailer.ts) eine Code-Vorlage ohne DB-Eintrag aufloest. */
function alsAufgeloest(t: (typeof DEFAULT_EMAIL_TEMPLATES)[number]) {
  return {
    subject: t.subject,
    bodyHtml: t.bodyHtml,
    bodyText: t.bodyText,
    recipientTo: "",
    recipientCc: "",
    recipientBcc: "",
    recipientReplyTo: "",
  };
}

describe("Durchlauf ueber alle Standardvorlagen", () => {
  const PERSOENLICH = [
    "onboarding-created",
    "supervisor-link-created",
    "contract-end-supervisor-link",
    "employee-reminder",
    "supervisor-reminder",
    "onboarding-department-assigned",
    "offboarding-department-assigned",
    "exit-interview-invited",
    "psi-assessment-requested",
    "unterlagen-angefordert",
  ];

  const erlaubt = (pfad: string) =>
    pfad === "/" || PORTAL_PFADE_ERLAUBT.some((p) => pfad === p || pfad.startsWith(`${p}/`));

  it("hat Vorlagen und Katalogeintraege, an denen sich der Test messen laesst", () => {
    expect(DEFAULT_EMAIL_TEMPLATES.length).toBeGreaterThan(50);
  });

  it.each(DEFAULT_EMAIL_TEMPLATES.map((t) => [t.event, t] as const))(
    "%s: nach dem Ersetzen steht kein persoenlicher Zugang mehr im Text",
    (event, template) => {
      const katalog = EVENT_CATALOG.find((d) => d.event === event);
      // Beispiel-Payload des Katalogs plus ein ECHT aussehender Zugang in jedem
      // bekannten Link-Feld — der Beispiellink des Katalogs ist harmlos.
      const echt = `${APP}/fragebogen/${TOKEN}`;
      const payload = {
        ...(katalog?.samplePayload ?? {}),
        link: echt,
        magicUrl: echt,
        magicLink: echt,
        fragebogenLink: echt,
        modalitaetenLink: echt,
        supervisor_link: echt,
        formularLink: echt,
        ackLink: echt,
        offboardingLink: echt,
      };
      const { rendered } = renderEventEmail(alsAufgeloest(template), event, payload, { overrideTo: "test@beispiel.invalid" });
      expect(rendered).not.toBeNull();

      const kopie = textFuerProtokoll(rendered!.html, APP).bodyHtml;
      expect(kopie).not.toContain(TOKEN);

      for (const treffer of kopie.match(/https?:\/\/[^\s"'<>]+/gi) ?? []) {
        const url = new URL(treffer.replace(/[.,;:!?)\]]+$/, ""));
        if (url.host === "hr.fes-credo.de") {
          expect({ event, pfad: url.pathname, erlaubt: erlaubt(url.pathname) }).toEqual({
            event,
            pfad: url.pathname,
            erlaubt: true,
          });
        }
      }
    },
  );

  it.each(PERSOENLICH)("%s: der Zugangslink ist durch den Platzhalter ersetzt", (event) => {
    const template = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event)!;
    const echt = `${APP}/fragebogen/${TOKEN}`;
    const payload = {
      ...(EVENT_CATALOG.find((d) => d.event === event)?.samplePayload ?? {}),
      link: echt,
      magicUrl: echt,
      magicLink: echt,
      fragebogenLink: echt,
      modalitaetenLink: echt,
      supervisor_link: echt,
    };
    const { rendered } = renderEventEmail(alsAufgeloest(template), event, payload, { overrideTo: "test@beispiel.invalid" });
    expect(rendered!.html).toContain(TOKEN); // die echte Mail traegt ihn …
    const kopie = textFuerProtokoll(rendered!.html, APP).bodyHtml;
    expect(kopie).not.toContain(TOKEN); // … die Kopie nicht
    // Steht der Link nur im Knopf (href), bleibt dort „#“; steht er als Text
    // da, der Platzhalter. Eines von beiden muss an seiner Stelle sein.
    expect(kopie.includes(PLATZHALTER_LINK) || kopie.includes('href="#"')).toBe(true);
  });
});
