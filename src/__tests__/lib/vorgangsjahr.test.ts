/**
 * Tests: Jahr und Zaehlbereich der Vorgangsnummer in deutscher Zeit
 * (src/lib/vorgangsjahr.ts)
 *
 * Der Container laeuft in UTC. Frueher kamen Jahreszahl und Zaehlbereich aus
 * `new Date().getFullYear()` / `new Date(jahr, 0, 1)` — in der ersten Stunde
 * des neuen Jahres (deutscher Zeit) bekam ein Vorgang dort noch die Nummer des
 * alten Jahres, und der Zaehlbereich begann eine Stunde zu spaet.
 */

import { beginnDesBerlinerTages, vorgangsjahrInBerlin } from "@/lib/vorgangsjahr";

describe("vorgangsjahrInBerlin", () => {
  it("Silvester 23:30 UTC ist in Berlin schon Neujahr 00:30 — Jahr 2027", () => {
    const ergebnis = vorgangsjahrInBerlin(new Date("2026-12-31T23:30:00.000Z"));

    expect(ergebnis.jahr).toBe(2027);
    // 1.1.2027 00:00 MEZ = 31.12.2026 23:00 UTC.
    expect(ergebnis.von.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(ergebnis.bis.toISOString()).toBe("2027-12-31T23:00:00.000Z");
  });

  it("eine Minute vor Mitternacht (Berlin) gilt noch das alte Jahr", () => {
    const ergebnis = vorgangsjahrInBerlin(new Date("2026-12-31T22:59:00.000Z"));

    expect(ergebnis.jahr).toBe(2026);
    expect(ergebnis.von.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(ergebnis.bis.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("der Beginn gehoert zum neuen Jahr, das Ende nicht (halb offen)", () => {
    // Genau 00:00 Berlin am 1.1. — derselbe Zeitpunkt wie `von` des neuen und
    // `bis` des alten Jahres. Kein Vorgang wird doppelt oder gar nicht gezaehlt.
    const grenze = new Date("2026-12-31T23:00:00.000Z");
    const neu = vorgangsjahrInBerlin(grenze);
    const alt = vorgangsjahrInBerlin(new Date(grenze.getTime() - 1));

    expect(neu.jahr).toBe(2027);
    expect(alt.jahr).toBe(2026);
    expect(neu.von.getTime()).toBe(grenze.getTime());
    expect(alt.bis.getTime()).toBe(grenze.getTime());
  });

  it("mitten im Sommer (MESZ) aendert sich am Jahr nichts", () => {
    const ergebnis = vorgangsjahrInBerlin(new Date("2026-07-15T12:00:00.000Z"));
    expect(ergebnis.jahr).toBe(2026);
    expect(ergebnis.von.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });
});

describe("beginnDesBerlinerTages", () => {
  it.each([
    // Winterzeit: UTC+1
    ["2026-01-15", "2026-01-14T23:00:00.000Z"],
    // Sommerzeit: UTC+2
    ["2026-07-01", "2026-06-30T22:00:00.000Z"],
    // Umstellung auf Sommerzeit (29.03.2026, 02:00): Mitternacht ist noch MEZ.
    ["2026-03-29", "2026-03-28T23:00:00.000Z"],
    // Umstellung auf Winterzeit (25.10.2026, 03:00): Mitternacht ist noch MESZ.
    ["2026-10-25", "2026-10-24T22:00:00.000Z"],
  ])("%s beginnt in Berlin um %s", (tag, erwartet) => {
    expect(beginnDesBerlinerTages(tag).toISOString()).toBe(erwartet);
  });

  it("wirft bei einem unlesbaren Tag, statt still einen falschen Bereich zu liefern", () => {
    expect(() => beginnDesBerlinerTages("kein-datum")).toThrow("Kein gültiges Datum");
  });
});
