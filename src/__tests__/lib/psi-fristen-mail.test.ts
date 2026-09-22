/**
 * Tests: Sammelmail "Verbeamtung: Fristen-Warnung" (src/lib/psi-fristen-mail.ts)
 *
 * Vorher nannte die Mail nur eine Zahl und einen englischen Code ("OVERDUE").
 * Die Einzelheiten lagen im Payload als Liste, die der Mail-Baustein nicht
 * einsetzen kann. Hier festgehalten:
 *   - die Liste nennt jeden Hinweis (Stufe, Vorgang, Person, Meldung, Frist),
 *   - Angaben aus der Datenbank werden im HTML maskiert,
 *   - die dringendsten Hinweise stehen oben und fallen beim Abschneiden
 *     zuletzt weg,
 *   - die Standardvorlage setzt alles ein, ohne dass etwas Rohes stehen bleibt.
 *
 * @/lib/mailer wird NICHT gemockt: geprueft wird der echte Renderer mit der
 * echten Vorlage. @/lib/db ist ersetzt, weil der Mailer es importiert.
 */

jest.mock("@/lib/db", () => ({ prisma: {} }));

import {
  fristenMailFelder,
  sortiereFristWarnungen,
  type FristWarnung,
} from "@/lib/psi-fristen-mail";
import { renderEventEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import {
  EVENT_CATALOG,
  PSI_FRISTEN_BEISPIEL,
  PSI_FRISTEN_BEISPIEL_BASIS,
} from "@/lib/events";

function warnung(ueberschreibung: Partial<FristWarnung> = {}): FristWarnung {
  return {
    processId: "psi-1",
    displayId: "PSI-2026-GYM-001",
    employeeName: "Anna Lehrerin",
    type: "AMTSARZT_EXPIRING",
    severity: "WARNING",
    message: "Amtsarzt-Attest (AMTSARZT_PROBE) läuft in 45 Tagen ab.",
    dueDate: "2026-11-05T00:00:00.000Z",
    ...ueberschreibung,
  };
}

function rendereFristenMail(payload: Record<string, unknown>) {
  const vorlage = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === "psi-deadline-warning")!;
  const { rendered } = renderEventEmail(
    { ...vorlage, recipientTo: "", recipientCc: "", recipientBcc: "", recipientReplyTo: "" },
    "psi-deadline-warning",
    payload,
    { overrideTo: "hr@example.org" },
  );
  return rendered!;
}

describe("sortiereFristWarnungen", () => {
  it("stellt Ueberfaelliges vor Dringendes vor Vorwarnungen, innerhalb der Stufe die fruehere Frist zuerst", () => {
    const liste = [
      warnung({ displayId: "W-spaet", severity: "WARNING", dueDate: "2026-12-01T00:00:00.000Z" }),
      warnung({ displayId: "O", severity: "OVERDUE", dueDate: "2026-07-01T00:00:00.000Z" }),
      warnung({ displayId: "W-frueh", severity: "WARNING", dueDate: "2026-10-01T00:00:00.000Z" }),
      warnung({ displayId: "U", severity: "URGENT", dueDate: "2026-10-10T00:00:00.000Z" }),
    ];
    expect(sortiereFristWarnungen(liste).map((w) => w.displayId)).toEqual([
      "O",
      "U",
      "W-frueh",
      "W-spaet",
    ]);
    // Die Eingabe bleibt unveraendert — der Cron gibt sie noch als Antwort aus.
    expect(liste[0].displayId).toBe("W-spaet");
  });
});

describe("fristenMailFelder", () => {
  it("nennt jeden Hinweis mit deutscher Stufe, Vorgang, Person, Meldung und Frist", () => {
    const felder = fristenMailFelder(
      [
        warnung({ severity: "OVERDUE", message: "BR-Genehmigung überfällig.", dueDate: "2026-07-28T00:00:00.000Z" }),
        warnung({ processId: "psi-2", displayId: "PSI-2026-GYM-002", employeeName: "Bernd Beispiel" }),
      ],
      { maxAnzeige: 50 },
    );

    expect(felder.warnungen_liste.split("\n")).toEqual([
      "- [Überfällig] PSI-2026-GYM-001 · Anna Lehrerin: BR-Genehmigung überfällig. (Frist: 28.07.2026)",
      "- [Vorwarnung] PSI-2026-GYM-002 · Bernd Beispiel: Amtsarzt-Attest (AMTSARZT_PROBE) läuft in 45 Tagen ab. (Frist: 05.11.2026)",
    ]);
    expect(felder.warnungen_liste_html).toContain("<ul");
    expect(felder.warnungen_liste_html.match(/<li/g)).toHaveLength(2);
    expect(felder).toMatchObject({
      hoechste_dringlichkeit: "Überfällig",
      anzahl_vorgaenge: 2,
      anzahl_ueberfaellig: 1,
      anzahl_dringend: 0,
      anzahl_vorwarnung: 1,
      weitere_warnungen: "",
    });
  });

  it("maskiert Namen, Meldungen und Vorgangsnummern im HTML", () => {
    const felder = fristenMailFelder(
      [
        warnung({
          displayId: 'PSI-"1"',
          employeeName: "<script>alert(1)</script>",
          message: "Frist <b>abgelaufen</b> & nicht verlängert",
        }),
      ],
      { maxAnzeige: 50, portalBasis: "https://hr.example.org" },
    );

    expect(felder.warnungen_liste_html).not.toContain("<script>");
    expect(felder.warnungen_liste_html).not.toContain("<b>");
    expect(felder.warnungen_liste_html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(felder.warnungen_liste_html).toContain("Frist &lt;b&gt;abgelaufen&lt;/b&gt; &amp; nicht verlängert");
    expect(felder.warnungen_liste_html).toContain("PSI-&quot;1&quot;");
    // Der Klartext bleibt Klartext — dort gibt es nichts zu maskieren.
    expect(felder.warnungen_liste).toContain("<script>alert(1)</script>");
  });

  it("verlinkt den Vorgang im Portal, wenn eine Basis-Adresse bekannt ist", () => {
    const mitBasis = fristenMailFelder([warnung()], {
      maxAnzeige: 50,
      portalBasis: "https://hr.example.org/",
    });
    expect(mitBasis.warnungen_liste_html).toContain(
      'href="https://hr.example.org/dashboard/civil-service/psi-1"',
    );
    expect(mitBasis.warnungen_liste).toContain("  https://hr.example.org/dashboard/civil-service/psi-1");

    // Ohne Basis kein Link — ein relativer Link waere in einer Mail wertlos.
    const ohneBasis = fristenMailFelder([warnung()], { maxAnzeige: 50 });
    expect(ohneBasis.warnungen_liste_html).not.toContain("<a ");
    expect(ohneBasis.warnungen_liste).not.toContain("http");
  });

  it("schneidet nach maxAnzeige ab, zaehlt aber alle und nennt den Rest in einem Satz", () => {
    const viele = [
      ...Array.from({ length: 53 }, (_, i) =>
        warnung({ processId: `psi-${i}`, displayId: `PSI-W-${i}`, severity: "WARNING" }),
      ),
      warnung({ processId: "psi-o", displayId: "PSI-UEBERFAELLIG", severity: "OVERDUE" }),
      warnung({ processId: "psi-u", displayId: "PSI-DRINGEND", severity: "URGENT" }),
    ];
    const felder = fristenMailFelder(viele, { maxAnzeige: 50 });

    expect(felder.warnungen_liste_html.match(/<li/g)).toHaveLength(50);
    expect(felder.warnungen_liste.split("\n")).toHaveLength(50);
    // Das Dringendste steht oben und faellt nicht dem Abschneiden zum Opfer,
    // obwohl es in der Eingabe ganz hinten stand.
    expect(felder.warnungen_liste.split("\n")[0]).toContain("PSI-UEBERFAELLIG");
    expect(felder.warnungen_liste.split("\n")[1]).toContain("PSI-DRINGEND");
    expect(felder).toMatchObject({
      anzahl_vorgaenge: 55,
      anzahl_ueberfaellig: 1,
      anzahl_dringend: 1,
      anzahl_vorwarnung: 53,
      weitere_warnungen: "Weitere 5 Hinweise sind hier nicht aufgeführt – bitte im HR-Portal prüfen.",
    });
  });

  it("sagt 'Hinweis ist' bei genau einem weggelassenen Hinweis", () => {
    const felder = fristenMailFelder(
      Array.from({ length: 3 }, (_, i) => warnung({ processId: `p-${i}` })),
      { maxAnzeige: 2 },
    );
    expect(felder.weitere_warnungen).toBe(
      "Weitere 1 Hinweis ist hier nicht aufgeführt – bitte im HR-Portal prüfen.",
    );
  });
});

describe("Beispiel-Payload im Katalog (Testversand)", () => {
  it("enthaelt genau die Mailfelder, die fristenMailFelder aus den Beispiel-Hinweisen baut", () => {
    // events.ts bleibt ohne Importe (Browser) und schreibt die Texte deshalb
    // aus. Dieser Test haelt sie mit dem echten Baustein gleich: Aendert sich
    // dort das Markup, steht hier der neue Text zum Uebernehmen.
    const def = EVENT_CATALOG.find((d) => d.event === "psi-deadline-warning")!;
    const erwartet = fristenMailFelder(PSI_FRISTEN_BEISPIEL, {
      maxAnzeige: 50,
      portalBasis: PSI_FRISTEN_BEISPIEL_BASIS,
    });
    expect(def.samplePayload).toMatchObject({ ...erwartet });
    expect(def.samplePayload.totalWarnings).toBe(PSI_FRISTEN_BEISPIEL.length);
  });
});

describe("Standardvorlage psi-deadline-warning", () => {
  function payload(warnungen: FristWarnung[]) {
    return {
      timestamp: "2026-09-22T06:00:00.000Z",
      totalWarnings: warnungen.length,
      shownWarnings: Math.min(50, warnungen.length),
      truncated: warnungen.length > 50,
      omittedCount: Math.max(0, warnungen.length - 50),
      topSeverity: "OVERDUE",
      bySeverity: { OVERDUE: 1, URGENT: 0, WARNING: 0 },
      warnings: warnungen,
      ...fristenMailFelder(warnungen, { maxAnzeige: 50, portalBasis: "https://hr.example.org" }),
    };
  }

  it("setzt Liste, Zaehler und deutsche Dringlichkeit ein — HTML und Klartext", () => {
    const mail = rendereFristenMail(
      payload([
        warnung({ severity: "OVERDUE", employeeName: "Anna <Lehrerin>" }),
        warnung({ processId: "psi-2", displayId: "PSI-2026-GYM-002" }),
      ]),
    );

    expect(mail.subject).toBe("Verbeamtung: 2 Frist(en) erfordern Aufmerksamkeit");
    expect(mail.html).toContain("Höchste Dringlichkeit: <strong>Überfällig</strong>");
    expect(mail.html).toContain("in <strong>2</strong> Verbeamtungsvorgang");
    expect(mail.html).toContain("PSI-2026-GYM-002");
    expect(mail.html).toContain("Anna &lt;Lehrerin&gt;");
    expect(mail.html).not.toContain("Anna <Lehrerin>");
    expect(mail.text).toContain("Höchste Dringlichkeit: Überfällig");
    expect(mail.text).toContain("- [Überfällig] PSI-2026-GYM-001 · Anna <Lehrerin>:");
    expect(mail.text).toContain("- [Vorwarnung] PSI-2026-GYM-002");
    // Nichts weggelassen: der Satz dazu entfaellt ganz.
    expect(mail.text).not.toContain("Weitere");
    for (const teil of [mail.subject, mail.html, mail.text ?? ""]) {
      expect(teil).not.toMatch(/\{\{/);
      expect(teil).not.toContain("OVERDUE");
    }
  });

  it("nennt beim Abschneiden die Zahl der nicht aufgefuehrten Hinweise", () => {
    const mail = rendereFristenMail(
      payload(Array.from({ length: 52 }, (_, i) => warnung({ processId: `p-${i}`, displayId: `PSI-${i}` }))),
    );
    expect(mail.html).toContain("Weitere 2 Hinweise sind hier nicht aufgeführt");
    expect(mail.text).toContain("Weitere 2 Hinweise sind hier nicht aufgeführt");
  });
});
