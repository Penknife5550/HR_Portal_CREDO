/**
 * Tests fuer alsHtmlAbsaetze in src/lib/email-layout.ts.
 *
 * Die Funktion stand bis Paket 4 in dokumentenpaket.ts (das sie weiter
 * re-exportiert, siehe „Freitext im HTML-Teil" in dokumentenpaket.test.ts).
 * Hier wird sie dort geprueft, wo sie jetzt wohnt — ohne Prisma, Mailer und
 * Dateisystem des Dokumentenpakets, genau wie die Mails der Nachforderung sie
 * benutzen werden.
 */

import { alsHtmlAbsaetze, escapeHtml } from "@/lib/email-layout";

describe("alsHtmlAbsaetze", () => {
  it("maskiert alles, was die Mail zerlegen koennte", () => {
    expect(alsHtmlAbsaetze('<a href="https://x.example">Klick</a> & mehr')).toBe(
      "&lt;a href=&quot;https://x.example&quot;&gt;Klick&lt;/a&gt; &amp; mehr",
    );
  });

  it("macht aus jeder Zeilenendung ein <br> — LF, CRLF und ein einzelnes CR", () => {
    expect(alsHtmlAbsaetze("a\nb\r\nc\rd")).toBe("a<br>b<br>c<br>d");
  });

  it("maskiert zuerst und bricht danach um: das eingefuegte <br> bleibt ein Umbruch", () => {
    expect(alsHtmlAbsaetze("<br>\nx")).toBe("&lt;br&gt;<br>x");
  });

  it("nutzt denselben Maskierungskern wie escapeHtml", () => {
    const text = `Meier & "Sohn" <GmbH>`;
    expect(alsHtmlAbsaetze(text)).toBe(escapeHtml(text));
  });
});
