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
  linkWurdeErsetzt,
  linksErsetzen,
  PLATZHALTER_KENNUNG,
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
    const lang = `<p>${"x".repeat(MAX_TEXT_ZEICHEN + 50)}</p> ${APP}/fragebogen/${TOKEN}`;
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
    expect(ansicht).toMatch(/^<!DOCTYPE html><html><head>.*Content-Security-Policy.*<\/head><body style="margin:0"><p>Hallo<\/p><\/body><\/html>$/);
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

  it.each(DEFAULT_EMAIL_TEMPLATES.map((t) => [t.event, t] as const))(
    "%s: das Netz fuer Kennungen greift bei den Beispieldaten nicht ein",
    (event, template) => {
      // Eine Standardmail traegt keine UUID im Fliesstext. Greift das Netz hier
      // ein, steht eine interne Kennung in einer Mail an Menschen — oder das Netz
      // ist zu grob geworden und frisst Inhalt.
      const katalog = EVENT_CATALOG.find((d) => d.event === event);
      const { rendered } = renderEventEmail(alsAufgeloest(template), event, katalog?.samplePayload ?? {}, {
        overrideTo: "test@beispiel.invalid",
      });
      expect(textFuerProtokoll(rendered!.html, APP).bodyHtml).not.toContain(PLATZHALTER_KENNUNG);
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

// =============================================
// Befunde der Durchsicht vom 15.10.2026
// =============================================

describe("linksErsetzen: Fehlkonfiguration und Verpackung", () => {
  it.each([
    ["hr.fes-credo.de"],
    ["localhost:3000"],
    ['"https://hr.fes-credo.de"'],
    ["'https://hr.fes-credo.de'"],
    ["  https://hr.fes-credo.de  "],
    ["https//hr.fes-credo.de"],
    ["//hr.fes-credo.de"],
    ["not a url"],
    [""],
  ])("kaputte APP_URL %j: der Link bleibt nicht stehen, mit und ohne Schema", (appUrl) => {
    const html = `<a href="hr.fes-credo.de/fragebogen/${TOKEN}">hr.fes-credo.de/fragebogen/${TOKEN}</a> http://localhost:3000/fragebogen/${TOKEN}`;
    expect(linksErsetzen(html, appUrl)).not.toContain(TOKEN);
  });

  it("liest eine APP_URL mit Anfuehrungszeichen und Leerraum wie die saubere", () => {
    expect(linksErsetzen(`${APP}/vorgaenge/onboarding/${TOKEN}`, ' "https://hr.fes-credo.de" ')).toBe(
      `${APP}/vorgaenge/onboarding/${TOKEN}`,
    );
  });

  it("haelt einen Host ohne Punkt (Tippfehler „https//…“) nicht fuer die Portal-Adresse", () => {
    // Haette portalHostAus „https“ geliefert, galte hr.fes-credo.de als FREMDER Host und ein
    // Token ohne UUID-Form bliebe stehen.
    const kopie = linksErsetzen("https://hr.fes-credo.de/neue-seite/AbCdEfGhIjKlMnOpQr12", "https//hr.fes-credo.de");
    expect(kopie).toBe(PLATZHALTER_LINK);
  });

  it.each([
    ["&quot;http://localhost:3000/unterlagen/UUID&quot;"],
    ["http://localhost:3000/unterlagen/UUID&nbsp;weiter"],
    ["&lt;http://localhost:3000/unterlagen/UUID&gt;"],
    ["http://localhost:3000/unterlagen/UUID&#39;"],
    ["http://localhost:3000/unterlagen/UUID.pdf"],
    ["„http://localhost:3000/unterlagen/UUID“"],
    ["http://localhost:3000/unterlagen/UUID–bitte"],
    ["https://boese.example/?u=UUID"],
    ["https://boese.example/f#UUID"],
    ["https://boese.example/x?a=1&amp;token=SECRET"],
    ["https://hr.fes-credo.de/vorgaenge/onboarding/abc?tab=dokumente&amp;token=SECRET"],
    ["https://hr.fes-credo.de/vorgaenge?u=UUID"],
    ["https://hr.fes-credo.de/login?next=/fragebogen/UUID"],
    ["https:\\\\hr.fes-credo.de\\fragebogen\\UUID"],
    ['<a href="https:\\\\hr.fes-credo.de\\fragebogen\\UUID">x</a>'],
    ["https://hr.fes-credo.de/vorgaenge/onboarding/abc#access_token=UUID"],
  ])("laesst von %s nichts Lesbares stehen", (vorlage) => {
    const kopie = linksErsetzen(vorlage.replace(/UUID/g, TOKEN).replace(/SECRET/g, "S3cr3tS3cr3tS3cr3t0000"), APP);
    expect(kopie).not.toContain(TOKEN);
    expect(kopie).not.toContain("S3cr3t");
  });

  it("faltet doppelte Schraegstriche, bevor es den Pfad prueft (APP_URL mit Schlussschraegstrich)", () => {
    const portal = `https://hr.fes-credo.de//vorgaenge/onboarding/abc?tab=dokumente`;
    expect(linksErsetzen(portal, "https://hr.fes-credo.de/")).toBe(portal);
    expect(linksErsetzen(`https://hr.fes-credo.de//fragebogen/${TOKEN}`, "https://hr.fes-credo.de/")).toBe(
      PLATZHALTER_LINK,
    );
  });

  it("ersetzt auch ein relatives href, das nicht zu den erlaubten Seiten gehoert", () => {
    expect(linksErsetzen(`<a href="/fragebogen/${TOKEN}">x</a>`, APP)).toBe('<a href="#">x</a>');
    expect(linksErsetzen('<a href="/vorgaenge/onboarding/abc">x</a>', APP)).toBe('<a href="/vorgaenge/onboarding/abc">x</a>');
  });

  it("entscheidet ueber ein href nach dem Aufloesen der Entitaeten", () => {
    const kopie = linksErsetzen(`<a href="&#104;ttps://hr.fes-credo.de/fragebogen/${TOKEN}">x</a>`, APP);
    expect(kopie).not.toContain(TOKEN);
  });

  describe("Netz fuer Kennungen", () => {
    it("entfernt eine UUID im Fliesstext und eine lange Hex-Folge", () => {
      const hex = "0123456789abcdef0123456789abcdef";
      const kopie = linksErsetzen(`<p>Kennung ${TOKEN} und ${hex} im Text</p>`, APP);
      expect(kopie).toBe(`<p>Kennung ${PLATZHALTER_KENNUNG} und ${PLATZHALTER_KENNUNG} im Text</p>`);
    });

    it("laesst die Vorgangs-ID im Pfad einer behaltenen Seite stehen", () => {
      const html = `<a href="${APP}/vorgaenge/onboarding/${TOKEN}">Vorgang</a> ${APP}/vorgaenge/onboarding/${TOKEN}`;
      expect(linksErsetzen(html, APP)).toBe(html);
    });

    it("rettet nichts nach der Entitaet einer behaltenen Adresse hinaus", () => {
      const kopie = linksErsetzen(`${APP}/vorgaenge/onboarding/abc&quot;${TOKEN}`, APP);
      expect(kopie).not.toContain(TOKEN);
      expect(kopie).toContain(`${APP}/vorgaenge/onboarding/abc`);
    });

    it("beruehrt weder Vorgangsnummern noch kurze Hex-Werte noch Farben", () => {
      const html = '<p style="color:#575756">ONB-2026-GYM-014, Farbe #FBC900, Kuerzel deadbeef, 28.10.2026</p>';
      expect(linksErsetzen(html, APP)).toBe(html);
    });
  });
});

describe("linkWurdeErsetzt", () => {
  it("erkennt Platzhalter, Kennungsplatzhalter und ein entschaerftes href", () => {
    expect(linkWurdeErsetzt(`<p>${PLATZHALTER_LINK}</p>`)).toBe(true);
    expect(linkWurdeErsetzt(`<p>${PLATZHALTER_KENNUNG}</p>`)).toBe(true);
    expect(linkWurdeErsetzt('<a href="#">x</a>')).toBe(true);
    expect(linkWurdeErsetzt("<a href='#'>x</a>")).toBe(true);
  });

  it("sagt nein, wenn nichts ersetzt wurde — auch bei einem behaltenen Portal-Link", () => {
    expect(linkWurdeErsetzt("<p>Hallo</p>")).toBe(false);
    expect(linkWurdeErsetzt(`<a href="${APP}/vorgaenge/onboarding/abc">x</a>`)).toBe(false);
  });
});

describe("htmlFuerAnsicht: Positivliste (Befunde der Durchsicht)", () => {
  const ERLAUBTE_TAGS = new Set([
    "a", "abbr", "address", "article", "aside", "b", "blockquote", "br", "caption", "center", "code", "col",
    "colgroup", "dd", "div", "dl", "dt", "em", "figcaption", "figure", "font", "footer", "h1", "h2", "h3", "h4",
    "h5", "h6", "header", "hr", "i", "img", "li", "main", "nav", "ol", "p", "pre", "s", "section", "small", "span",
    "strike", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
    "html", "head", "meta", "body",
  ]);
  const ERLAUBTE_ATTRIBUTE = new Set([
    "style", "align", "valign", "width", "height", "bgcolor", "colspan", "rowspan", "cellpadding", "cellspacing",
    "border", "color", "size", "face", "alt", "title", "lang", "dir", "role", "src", "charset", "http-equiv", "content",
  ]);

  /** Die Zusagen an die Ausgabe — fuer jede Eingabe, auch fuer die boesen. */
  function pruefe(ausgabe: string) {
    expect(ausgabe.startsWith("<!DOCTYPE html><html><head>")).toBe(true);
    // genau EIN meta-Tag mit http-equiv: unsere CSP (dasselbe als Text im Inhalt waere harmlos)
    expect((ausgabe.match(/<meta[^>]*http-equiv=/gi) ?? []).length).toBe(1);
    expect(ausgabe).toContain("Content-Security-Policy");
    for (const tag of ausgabe.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g)) {
      expect({ tag: tag[1].toLowerCase(), erlaubt: ERLAUBTE_TAGS.has(tag[1].toLowerCase()) }).toEqual({
        tag: tag[1].toLowerCase(),
        erlaubt: true,
      });
      for (const attribut of tag[2].matchAll(/([^\s"'<>/=]+)\s*=/g)) {
        expect({ attribut: attribut[1].toLowerCase(), erlaubt: ERLAUBTE_ATTRIBUTE.has(attribut[1].toLowerCase()) }).toEqual({
          attribut: attribut[1].toLowerCase(),
          erlaubt: true,
        });
      }
    }
    // ausserhalb der Tags steht kein „<“ mehr
    expect(ausgabe.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/g, "").replace(/<!DOCTYPE html>/, "")).not.toContain("<");
  }

  const BOESE = [
    "<scr<script>ipt>alert(1)</scr<script>ipt>",
    '<me<meta>ta http-equiv="refresh" content="0;url=https://evil.example/phish">',
    "<fo<form>rm action=https://evil.example><input name=x></fo<form>rm>",
    "<ifr<iframe>ame src=https://evil.example></ifr<iframe>ame>",
    "<ob<object>ject data=https://evil.example></ob<object>ject>",
    "<ba<base>se target=_self href=https://evil.example>",
    "<img/src=x/onerror=alert(1)>",
    '<img src="x"onerror=alert(1)>',
    '<a/href="javascript:alert(1)">x</a>',
    '<a title="t"href="https://evil.example">x</a>',
    '<p title="<head>">x</p><img src="https://tracker.example/p.gif">',
    "<svg onload=alert(1)><circle/></svg>",
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    "<style>@import url(https://evil.example/x.css);</style>",
    '<div style="background:url(https://evil.example/t.gif)">x</div>',
    '<div style="width:expression(alert(1))">x</div>',
    '<div style="b\\61ckground:u\\72l(https://evil.example/t.gif)">x</div>',
    '<link rel=stylesheet href="https://evil.example/x.css">',
    "<!-- <script>alert(1)</script> -->",
    "<script>alert(1)",
    '<a href="x>unclosed',
    "< script>alert(1)</ script>",
    "<object data=x></object>",
    "<embed src=x>",
    "<button formaction=x>x</button>",
    "<details open ontoggle=alert(1)>x</details>",
    "<input autofocus onfocus=alert(1)>",
    "<video src=x onerror=alert(1)>",
    '<a ping="https://evil.example">x</a>',
    "<img src=x onerror=alert(1)//",
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    "<<script>script>alert(1)<</script>/script>",
    "<a href=javascript:alert(1)>x</a",
    '<SCRIPT SRC="https://evil.example/x.js"></SCRIPT>',
    "<scRipt>alert(1)</scRipt >",
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  ];

  it.each(BOESE.map((b) => [b]))("haelt die Zusagen bei %s", (eingabe) => {
    pruefe(htmlFuerAnsicht(eingabe));
  });

  it("verschachtelte Tags setzen nichts zusammen", () => {
    const ausgabe = htmlFuerAnsicht("<scr<script>ipt>alert(1)</scr<script>ipt>");
    expect(ausgabe).not.toMatch(/<script/i);
    expect(ausgabe).not.toMatch(/<[^>]*alert/i);
  });

  it("baut den Kopf immer selbst — auch wenn „<head>“ in einem Attribut steht", () => {
    const ausgabe = htmlFuerAnsicht('<p title="<head>">x</p><img src="https://tracker.example/p.gif">');
    expect(ausgabe).toMatch(/^<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/);
    expect(ausgabe).not.toContain("tracker.example");
  });

  it("ein Bild bleibt nur als eingebettetes Bild oder als Logo", () => {
    expect(htmlFuerAnsicht('<img src="https://tracker.example/p.gif">')).not.toContain("<img");
    expect(htmlFuerAnsicht('<img src="https://hr.fes-credo.de/credo_logo.png" alt="Logo">', APP)).toContain(
      '<img src="https://hr.fes-credo.de/credo_logo.png" alt="Logo">',
    );
    // von einem fremden Host oder ohne bekannte Portal-Adresse nicht
    expect(htmlFuerAnsicht('<img src="https://tracker.example/credo_logo.png">', APP)).not.toContain("<img");
    expect(htmlFuerAnsicht('<img src="https://hr.fes-credo.de/credo_logo.png">')).not.toContain("<img");
    expect(htmlFuerAnsicht('<img src="/credo_logo.png">')).toContain('<img src="/credo_logo.png">');
    expect(htmlFuerAnsicht('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain("<img src=");
    expect(htmlFuerAnsicht('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain("<img");
  });

  it("behaelt Gestaltung und Text einer echten Vorlage", () => {
    const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "onboarding-created")!;
    const { rendered } = renderEventEmail(alsAufgeloest(vorlage), "onboarding-created", {
      vorname: "Anna",
      organization: "FES Gymnasium Minden",
      link: `${APP}/fragebogen/${TOKEN}`,
    }, { overrideTo: "anna@beispiel.invalid" });
    const ansicht = htmlFuerAnsicht(textFuerProtokoll(rendered!.html, APP).bodyHtml, APP);
    pruefe(ansicht);
    expect(ansicht).toContain("Herzlich willkommen");
    expect(ansicht).toContain("Personalfragebogen ausfüllen");
    expect(ansicht).toContain(PLATZHALTER_LINK);
    expect(ansicht).toContain("background-color:#f4f4f5");
    expect(ansicht).not.toContain(TOKEN);
  });

  it("schreibt die Adresse eines behaltenen Links hinter den Linktext", () => {
    const html = `<a href="${APP}/vorgaenge/onboarding/abc?tab=dokumente" style="color:#000">Vorgang öffnen</a>`;
    const ansicht = htmlFuerAnsicht(html);
    expect(ansicht).toContain("Vorgang öffnen</a>");
    expect(ansicht).toContain(`(${APP}/vorgaenge/onboarding/abc?tab=dokumente)`);
    expect(ansicht).not.toMatch(/href=/i);
  });

  it("doppelt die Adresse nicht, wenn sie schon als Linktext dasteht", () => {
    const adresse = `${APP}/vorgaenge/onboarding/abc`;
    const ansicht = htmlFuerAnsicht(`<a href="${adresse}">${adresse}</a>`);
    expect(ansicht.split(adresse).length - 1).toBe(1);
  });

  it("haelt die Zusagen bei zufaellig zusammengesetzten Eingaben", () => {
    // Deterministisch (kleiner LCG): dieselben 400 Eingaben bei jedem Lauf.
    let zustand = 20261015;
    const zufall = (n: number) => {
      zustand = (zustand * 1664525 + 1013904223) % 4294967296;
      return zustand % n;
    };
    const SICHER = ["<p>Hallo</p>", "<table><tr><td>x</td></tr></table>", "Text &amp; mehr", "<b>fett</b>", `<a href="${APP}/vorgaenge/x">Link</a>`];
    const pool = [...BOESE, ...SICHER];
    for (let lauf = 0; lauf < 400; lauf++) {
      const teile = Array.from({ length: 2 + zufall(5) }, () => pool[zufall(pool.length)]);
      const eingabe = teile.join(zufall(3) === 0 ? "" : " ");
      pruefe(htmlFuerAnsicht(eingabe));
    }
  });

  it("braucht fuer lange Eingaben keine unvertretbare Zeit", () => {
    const eingabe = '<a title="x" '.repeat(20000) + "<p>".repeat(20000);
    const start = Date.now();
    htmlFuerAnsicht(eingabe);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe("textAusHtml: Adressen behaltener Links", () => {
  it("schreibt die Adresse hinter den Linktext", () => {
    const html = `<p>Bitte pruefen: <a href="${APP}/vorgaenge/onboarding/abc?tab=dokumente">Vorgang öffnen</a></p>`;
    expect(textAusHtml(html)).toBe(`Bitte pruefen: Vorgang öffnen (${APP}/vorgaenge/onboarding/abc?tab=dokumente)`);
  });

  it("laesst eine ersetzte Adresse (href=#) und mailto: ohne Klammer", () => {
    expect(textAusHtml('<a href="#">Fragebogen</a> <a href="mailto:a@b.de">Mail</a>')).toBe("Fragebogen Mail");
  });
});

describe("textHinweis: FAILED ohne Betreff", () => {
  it("nennt als Grund, dass die Mail nie erzeugt wurde", () => {
    expect(textHinweis({ event: "onboarding-created", status: "FAILED", hatText: false, ohneBetreff: true })).toBe(
      MAIL_TEXT_MELDUNGEN.nichtErzeugtFehler,
    );
  });

  it("mit Betreff bleibt es beim allgemeinen Satz", () => {
    expect(textHinweis({ event: "onboarding-created", status: "FAILED", hatText: false })).toBe(
      MAIL_TEXT_MELDUNGEN.nichtGespeichert,
    );
  });
});

// =============================================
// Zweite Durchsicht vom 15.10.2026 (Korrekturen)
// =============================================

describe("Laufzeit: beide Anzeigen sind linear", () => {
  const MS = 1500;
  const PATHOLOGISCH: Array<[string, string]> = [
    ["viele Anker ohne Ende", '<a href="x" '.repeat(5000)],
    ["viele < ohne >", "<".repeat(100000)],
    ["viele <a ohne >", "<a ".repeat(33000)],
    ["viele Kommentaranfaenge", "<!--".repeat(25000)],
    ["verschachtelte Anker mit Entitaeten", "<a href=http://a>".repeat(2500) + "&amp;".repeat(6000) + "</a>".repeat(2500)],
    ["viele href ohne Ende", 'href="'.repeat(15000)],
    ["lange Punktfolge hinter einer Adresse", "https://hr.fes-credo.de/x" + ".".repeat(90000) + "x"],
    ["viele http://", "http://".repeat(14000)],
    ["viele &#", "&#".repeat(50000)],
    ["tiefe Verschachtelung", "<div>".repeat(20000) + "x" + "</div>".repeat(20000)],
  ];

  it.each(PATHOLOGISCH)("%s", (_name, eingabe) => {
    const start = Date.now();
    textAusHtml(eingabe);
    htmlFuerAnsicht(eingabe, APP);
    textFuerProtokoll(eingabe, APP);
    expect(Date.now() - start).toBeLessThan(MS * 3);
  });
});

describe("htmlFuerAnsicht: Attributwerte und Stil", () => {
  const ohneStil = (eingabe: string) => htmlFuerAnsicht(eingabe, APP);

  it.each([
    ['<div style="background:u&amp;#114;l(http://h/t.gif)">x</div>'],
    ['<div style="background:u&#38;#114;l(http://h/t.gif)">x</div>'],
    ['<div style="background:url&lpar;http://h/t.gif)">x</div>'],
    ['<div style="background:u&bsol;72 l(http://h/t.gif)">x</div>'],
    ["<div style=\"background-image:image-set('http://h/t.gif' 1x)\">x</div>"],
    ['<div style="background-image:-webkit-image-set(url(http://h/t.gif) 1x)">x</div>'],
    ['<div style="--x:u&amp;#114;l(http://h/t.gif);background-image:var(--x)">x</div>'],
    ['<div style="background:src(http://h/t.gif)">x</div>'],
    ['<div style="width:expr/**/ession(alert(1))">x</div>'],
    ['<body style="background:u&amp;#114;l(http://h/t.gif)"><p>x</p></body>'],
  ])("verwirft den style-Wert in %s", (eingabe) => {
    const ausgabe = ohneStil(eingabe);
    expect(ausgabe).not.toMatch(/url|image-set|var\(|src\(|expression|#114|bsol|lpar/i);
    expect(ausgabe).toContain("<body");
  });

  it("behaelt Gestaltung mit erlaubten Funktionen", () => {
    const ausgabe = ohneStil('<td style="background-color:rgb(244,244,245);padding:calc(8px + 2px);color:#575756">x</td>');
    expect(ausgabe).toContain("rgb(244,244,245)");
    expect(ausgabe).toContain("calc(8px + 2px)");
  });

  it("maskiert jedes & im Attribut, damit der Browser nicht ein zweites Mal dekodiert", () => {
    const ausgabe = ohneStil('<p title="a &amp;#60;b&#62; &lt;x&gt;">x</p>');
    expect(ausgabe).toContain('title="a &amp;#60;b&gt; &lt;x&gt;"');
  });
});

describe("htmlFuerAnsicht und textAusHtml: Randfaelle der Zerlegung", () => {
  it("ein leerer Kommentar „<!-->“ verschluckt den Rest nicht", () => {
    for (const leer of ["<!-->", "<!--->", "<!---->", "<!-- x --!>"]) {
      expect(htmlFuerAnsicht(`<p>vorher</p>${leer}<p>nachher</p>`)).toContain("<p>nachher</p>");
      expect(textAusHtml(`<p>vorher</p>${leer}<p>nachher</p>`)).toBe("vorher\n\nnachher");
    }
  });

  it("selbstschliessende Container verschlucken den Rest nicht", () => {
    for (const container of ['<svg width="10"/>', "<button/>", "<video src=x />", "<object data=x/>"]) {
      const ansicht = htmlFuerAnsicht(`<p>a</p>${container}<p>danach</p>`);
      expect(ansicht).toContain("<p>danach</p>");
      expect(textAusHtml(`<p>a</p>${container}<p>danach</p>`)).toContain("danach");
    }
  });

  it("ein eingebetteter Inhalt ohne Schluss-Tag verwirft nur das Tag, ein Skript ohne Ende den Rest", () => {
    expect(htmlFuerAnsicht("<p>a</p><object data=x><p>danach</p>")).toContain("<p>danach</p>");
    expect(htmlFuerAnsicht("<p>a</p><script>alert(1)<p>danach</p>")).not.toContain("danach");
  });

  it("ein einzelnes „<“ im Text ist Text — auch in „Nur Text“", () => {
    expect(textAusHtml("<p>1 < 2 und 3 > 2</p>")).toBe("1 < 2 und 3 > 2");
    expect(htmlFuerAnsicht("<p>1 < 2</p>")).toContain("1 &lt; 2");
  });

  it("button, form und select behalten ihren Text", () => {
    expect(textAusHtml('<form action="x"><button>Jetzt oeffnen</button></form>')).toBe("Jetzt oeffnen");
    expect(htmlFuerAnsicht('<button>Jetzt oeffnen</button>')).toContain("Jetzt oeffnen");
  });
});

describe("linksErsetzen: Aufbau behaltener Portal-Adressen und Verpackungen", () => {
  const U = TOKEN;

  it.each([
    [`${APP}/vorgaenge/onboarding/x,${APP}/fragebogen/${U}`],
    [`${APP}/vorgaenge/onboarding/x|${APP}/fragebogen/${U}`],
    [`${APP}/vorgaenge/onboarding/x/${APP}/fragebogen/${U}`],
    [`${APP}/vorgaenge/onboarding/x/https%3A%2F%2Fhr.fes-credo.de%2Ffragebogen%2F${U}`],
    [`${APP}/login/${APP}/fragebogen/${U}`],
    [`${APP}/einstellungen/${APP}/unterlagen/${U}`],
    [`${APP}/credo_logo.png/${APP}/fragebogen/${U}`],
    [`${APP}/login?${U}`],
    [`${APP}/login?${U}=1`],
    [`https://${U}.example.org/x`],
    [`${APP}/vorgaenge/${U}/x`],
    [`${APP}/vorgaenge/onboarding/${U}/${U}`],
    [`${APP}&sol;fragebogen&sol;${U}`],
    [`https:&sol;&sol;hr.fes-credo.de/fragebogen/AbCdEfGhIjKlMnOpQr12`],
    [`${APP}&bsol;fragebogen&bsol;${U}`],
    [`${APP}&#47;fragebogen&#47;${U}`],
    [`${APP}&#x2F;fragebogen&#x2F;${U}`],
  ])("laesst von %s nichts Lesbares stehen", (vorlage) => {
    const kopie = linksErsetzen(vorlage, APP);
    expect(kopie).not.toContain(U);
    expect(kopie).not.toContain("AbCdEfGhIjKlMnOpQr12");
  });

  it("behaelt die erwarteten Portal-Formen unveraendert", () => {
    for (const adresse of [
      `${APP}/vorgaenge/onboarding/${U}`,
      `${APP}/vorgaenge/onboarding/${U}?tab=dokumente`,
      `${APP}/vorgaenge/onboarding/${U}?tab=dokumente#abschnitt-unterlagen-2026`,
      `${APP}/vorgaenge/vertragsende`,
      `${APP}/vorgaenge/onboarding?filter=offene-unterlagen-2026-gymnasium`,
      `${APP}/einstellungen?tab=laeufe&amp;lauf=unterlagen-fristen`,
      `${APP}/login`,
    ]) {
      expect(linksErsetzen(adresse, APP)).toBe(adresse);
    }
  });

  it("behaelt Fremdlinks mit Slugs, Jahreszahlen und Dateiendungen", () => {
    for (const adresse of [
      "https://www.fes-minden.de/wp-content/uploads/2024/05/Datenschutzerklaerung-Bewerber-2024.pdf",
      "https://www.fes-minden.de/anmeldung?utm_campaign=sommerfest-2026-einladung-eltern",
      "https://www.landesrecht.nrw/Masernschutzgesetz-Information-2020.pdf",
    ]) {
      expect(linksErsetzen(adresse, APP)).toBe(adresse);
    }
  });

  it("ersetzt weiterhin zufaellige Zeichenfolgen als Token", () => {
    for (const token of ["AbCdEfGhIjKlMnOpQr12", "k3j9x0q8z7w6v5u4t3s2r1", "3f9c7a1e52b04d1b9e6a0c2f8d4b71aa", "Zx9-Qw8_Er7-Ty6_Ui5-Op4_As3"]) {
      expect(linksErsetzen(`https://dienst.example.org/u/${token}`, APP)).toBe(PLATZHALTER_LINK);
    }
  });
});

describe("textFuerProtokoll: speicherbar", () => {
  const lose = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("entfernt NUL", () => {
    const kopie = textFuerProtokoll("<p>a\u0000b</p>", APP);
    expect(kopie.bodyHtml).toBe("<p>ab</p>");
  });

  it("laesst nach dem Kuerzen kein loses Surrogat zurueck", () => {
    const kopie = textFuerProtokoll("x".repeat(MAX_TEXT_ZEICHEN - 1) + "\u{1F600}bbb", APP);
    expect(kopie.gekuerzt).toBe(true);
    expect(lose.test(kopie.bodyHtml)).toBe(false);
  });

  it("ersetzt ein loses Surrogat in der Eingabe", () => {
    expect(lose.test(textFuerProtokoll("<p>a\ud83db</p>", APP).bodyHtml)).toBe(false);
  });
});
