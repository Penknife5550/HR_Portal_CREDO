/**
 * Vertragsende: die Hinweise über der Arbeit (UX-Umbau, Pilot).
 *
 * Je Hinweis: greift genau bei seiner Bedingung — und an den Grenzen nicht
 * mehr. Dazu über ein Raster vieler Lagen: Reihenfolge critical → wait → info,
 * Sprache (keine Anrede, keine Emojis, keine Großschreibung als Betonung) und
 * Datum im Text in deutscher Zeit.
 */

import { CONTRACT_END_UEBERGAENGE } from "@/lib/contract-end-status";
import { entfristungsWarnung, vertragsendePille } from "@/lib/prozess/vertragsende";
import { vertragsendeHinweise, type HinweisAngabe, type HinweisStand } from "@/lib/prozess/vertragsende-hinweise";

const JETZT = new Date("2026-10-06T10:00:00Z");
const TAG_MS = 86_400_000;
/** Genau `n` × 24 Stunden nach JETZT — die Grenzen von `getSignatureWarning` rechnen in Millisekunden. */
const inTagen = (n: number) => new Date(JETZT.getTime() + n * TAG_MS).toISOString();

const ALLE_STATUS = Object.keys(CONTRACT_END_UEBERGAENGE);
const ENDSTATUS = ["ABGESCHLOSSEN", "STORNIERT"];
const OFFENE_STATUS = ALLE_STATUS.filter((s) => !ENDSTATUS.includes(s));
/** Die beiden Status, in denen die Entfristungswarnung greifen kann (`getSignatureWarning`). */
const VERTRAG_OFFEN = ["RUECKMELDUNG_UEBERNAHME", "VERTRAG_ERSTELLT"];

/** Ein Vorgang, zu dem es keinen einzigen Hinweis gibt. */
function stand(teil: Partial<HinweisStand> = {}): HinweisStand {
  return {
    status: "ANGELEGT",
    decision: "OFFEN",
    contractEndDate: inTagen(200),
    createdAt: inTagen(-20),
    supervisorEmail: null,
    supervisorLinkSentAt: null,
    supervisorTokenExpiresAt: null,
    supervisorRespondedAt: null,
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    contractSignedReturnedAt: null,
    mavStatus: null,
    completedAt: null,
    offboarding: null,
    vorstandAbgestimmt: null,
    befristungsart: null,
    bisherigeBefristungMonate: null,
    bisherigeVerlaengerungen: null,
    contractEndDateGeaendertAm: null,
    weitereMandanten: [],
    ...teil,
  };
}

/** Übernahme entschieden, Vertrag noch nicht unterschrieben zurück. */
const uebernahme = (teil: Partial<HinweisStand> = {}) =>
  stand({ status: "RUECKMELDUNG_UEBERNAHME", decision: "UEBERNAHME", ...teil });

const hinweise = (s: HinweisStand) => vertragsendeHinweise(s, JETZT);
const schluessel = (s: HinweisStand) => hinweise(s).map((h) => h.schluessel);
const einer = (s: HinweisStand, key: HinweisAngabe["schluessel"]) => hinweise(s).find((h) => h.schluessel === key);

describe("Ohne Anlass", () => {
  it("ein gewöhnlicher Vorgang hat keinen Hinweis", () => {
    expect(hinweise(stand())).toEqual([]);
    for (const status of ALLE_STATUS) {
      expect({ status, hinweise: schluessel(stand({ status })) }).toEqual({ status, hinweise: [] });
    }
  });
});

describe("Entfristungsrisiko (§ 15 Abs. 5 TzBfG)", () => {
  it("greift bei Übernahme ohne unterschriebenen Vertrag, in beiden offenen Vertragsstatus", () => {
    for (const status of VERTRAG_OFFEN) {
      const h = einer(uebernahme({ status, contractEndDate: inTagen(10) }), "entfristung");
      expect(h).toMatchObject({ ton: "critical", titel: "Entfristungsrisiko (§ 15 Abs. 5 TzBfG)" });
    }
  });

  it("Grenze: 30 Tage vorher greift er, 31 Tage vorher noch nicht", () => {
    const dreissig = einer(uebernahme({ contractEndDate: inTagen(30) }), "entfristung");
    expect(dreissig?.text).toBe(
      "Bis zum Vertragsende (05.11.2026, in 30 Tagen) muss der unterschriebene Verlängerungsvertrag vorliegen – sonst droht durch Weiterarbeit ein unbefristetes Arbeitsverhältnis.",
    );
    expect(einer(uebernahme({ contractEndDate: inTagen(31) }), "entfristung")).toBeUndefined();
    expect(einer(uebernahme({ status: "VERTRAG_ERSTELLT", contractEndDate: inTagen(31) }), "entfristung")).toBeUndefined();
  });

  it("nicht in anderen Status, auch wenn Übernahme entschieden ist", () => {
    for (const status of ALLE_STATUS.filter((s) => !VERTRAG_OFFEN.includes(s))) {
      const s = uebernahme({ status, contractEndDate: inTagen(10) });
      expect({ status, hinweise: schluessel(s) }).toEqual({ status, hinweise: [] });
    }
  });

  it("nicht ohne entschiedene Übernahme", () => {
    for (const decision of ["OFFEN", "KEINE_UEBERNAHME", ""]) {
      for (const status of VERTRAG_OFFEN) {
        expect(einer(uebernahme({ status, decision, contractEndDate: inTagen(10) }), "entfristung")).toBeUndefined();
      }
    }
  });

  it("nicht, sobald der unterschriebene Vertrag erfasst ist — auch nach dem Vertragsende", () => {
    for (const ende of [inTagen(10), inTagen(-5)]) {
      const s = uebernahme({ contractEndDate: ende, contractSignedReturnedAt: inTagen(-1) });
      expect(einer(s, "entfristung")).toBeUndefined();
    }
  });

  it("am Tag des Vertragsendes „heute“, nicht „überschritten“ (Berliner Kalendertag)", () => {
    // 00:30 in Berlin am 06.10. — `getSignatureWarning` rechnet hier schon −1 Tag.
    const h = einer(uebernahme({ contractEndDate: "2026-10-05T22:30:00.000Z" }), "entfristung");
    expect(h?.text).toBe(
      "Bis zum Vertragsende (06.10.2026, heute) muss der unterschriebene Verlängerungsvertrag vorliegen – sonst droht durch Weiterarbeit ein unbefristetes Arbeitsverhältnis.",
    );
    expect(h?.text).not.toContain("überschritten");
  });

  it("überschritten: eigener Text, „überschritten … unbefristet“, ohne Tageszahl", () => {
    for (const versatz of [-1, -2, -40]) {
      const h = einer(uebernahme({ contractEndDate: inTagen(versatz) }), "entfristung");
      expect(h?.ton).toBe("critical");
      expect(h?.text).toMatch(/überschritten.*unbefristet/);
      expect(h?.text).not.toMatch(/Bis zum Vertragsende/);
    }
    expect(einer(uebernahme({ contractEndDate: inTagen(-2) }), "entfristung")?.text).toBe(
      "Das Vertragsende (04.10.2026) ist überschritten, und es liegt kein unterschriebener Vertrag vor. Arbeitet die Person weiter, gilt das Arbeitsverhältnis als unbefristet – bitte sofort klären.",
    );
  });

  it("Datum im Text in deutscher Zeit, nicht in UTC", () => {
    // 23:30 UTC am 31.10. ist in Berlin (nach dem Ende der Sommerzeit) schon der 01.11.
    const h = einer(uebernahme({ contractEndDate: "2026-10-31T23:30:00.000Z" }), "entfristung");
    expect(h?.text).toContain("(01.11.2026, in 26 Tagen)");
    expect(h?.text).not.toContain("31.10.2026");
  });

  it("dieselbe Regel wie die Statuspille: Hinweis genau dann, wenn die Pille kritisch ist", () => {
    for (const status of ALLE_STATUS) {
      for (const decision of ["OFFEN", "UEBERNAHME", "KEINE_UEBERNAHME"]) {
        for (const versatz of [-3, 0, 10, 30, 31, 200]) {
          for (const contractSignedReturnedAt of [null, inTagen(-1)]) {
            const s = stand({ status, decision, contractEndDate: inTagen(versatz), contractSignedReturnedAt });
            const lage = `${status} / ${decision} / ${versatz} / unterschrieben ${contractSignedReturnedAt ? "ja" : "nein"}`;
            const hat = Boolean(einer(s, "entfristung"));
            expect({ lage, hat }).toEqual({ lage, hat: entfristungsWarnung(s, JETZT) });
            expect({ lage, hat }).toEqual({ lage, hat: vertragsendePille(s, JETZT).ton === "critical" });
          }
        }
      }
    }
  });
});

describe("Vorstand nicht abgestimmt", () => {
  it("greift nur bei ausdrücklichem „nein“ (false), entschiedener Übernahme und laufendem Vorgang", () => {
    for (const status of OFFENE_STATUS) {
      const h = einer(stand({ status, decision: "UEBERNAHME", vorstandAbgestimmt: false }), "vorstand");
      expect({ status, ton: h?.ton }).toEqual({ status, ton: "critical" });
    }
    expect(einer(uebernahme({ vorstandAbgestimmt: false }), "vorstand")).toMatchObject({
      titel: "Nicht mit Vorstand oder Geschäftsführung abgestimmt",
      text: "Die Führungskraft hat angegeben, dass die Übernahme nicht mit Vorstand oder Geschäftsführung abgestimmt ist. Vor der Vertragserstellung klären.",
    });
  });

  it("nicht bei „ja“ oder ohne Angabe", () => {
    for (const vorstandAbgestimmt of [null, true]) {
      for (const status of ALLE_STATUS) {
        expect(einer(stand({ status, decision: "UEBERNAHME", vorstandAbgestimmt }), "vorstand")).toBeUndefined();
      }
    }
  });

  it("nicht ohne entschiedene Übernahme – das Formular speichert den Vermerk schon beim Zwischenspeichern", () => {
    // Zwischengespeichert „nein“, danach abgelehnt oder noch offen: kein Hinweis.
    for (const decision of ["OFFEN", "KEINE_UEBERNAHME"]) {
      for (const status of ALLE_STATUS) {
        const s = stand({ status, decision, vorstandAbgestimmt: false });
        expect({ status, decision, h: einer(s, "vorstand") }).toEqual({ status, decision, h: undefined });
      }
    }
  });

  it("nicht mehr nach dem Ende des Vorgangs (abgeschlossen, storniert)", () => {
    for (const status of ENDSTATUS) {
      expect(einer(stand({ status, decision: "UEBERNAHME", vorstandAbgestimmt: false }), "vorstand")).toBeUndefined();
    }
  });
});

describe("Kettenbefristung (§ 14 TzBfG)", () => {
  const kette = (teil: Partial<HinweisStand>) => einer(stand({ befristungsart: "SACHGRUNDLOS", ...teil }), "kettenbefristung");

  it("greift bei sachgrundloser Befristung ab 24 Monaten", () => {
    expect(kette({ bisherigeBefristungMonate: 24 })).toMatchObject({
      ton: "wait",
      titel: "Hinweis zur Befristung (§ 14 TzBfG)",
    });
    expect(kette({ bisherigeBefristungMonate: 24 })?.text).toContain("24 Monate");
    expect(kette({ bisherigeBefristungMonate: 36, bisherigeVerlaengerungen: 0 })).toBeDefined();
    expect(kette({ bisherigeBefristungMonate: 23 })).toBeUndefined();
  });

  it("greift bei sachgrundloser Befristung ab 3 Verlängerungen", () => {
    expect(kette({ bisherigeVerlaengerungen: 3 })?.text).toContain("3 Verlängerungen");
    expect(kette({ bisherigeVerlaengerungen: 2, bisherigeBefristungMonate: 23 })).toBeUndefined();
  });

  it("beide Grenzen erreicht: ein Hinweis, beide Gründe", () => {
    const h = kette({ bisherigeBefristungMonate: 24, bisherigeVerlaengerungen: 3 });
    expect(h?.text).toContain("24 Monate");
    expect(h?.text).toContain("3 Verlängerungen");
    const alle = hinweise(stand({ befristungsart: "SACHGRUNDLOS", bisherigeBefristungMonate: 24, bisherigeVerlaengerungen: 3 }));
    expect(alle.filter((x) => x.schluessel === "kettenbefristung")).toHaveLength(1);
  });

  it("ohne Angaben kein Hinweis", () => {
    expect(kette({})).toBeUndefined();
  });

  it("nur bei sachgrundloser Befristung", () => {
    for (const befristungsart of [null, "", "SACHGRUND", "MIT_SACHGRUND", "sachgrundlos"]) {
      const s = stand({ befristungsart, bisherigeBefristungMonate: 48, bisherigeVerlaengerungen: 5 });
      expect({ befristungsart, h: einer(s, "kettenbefristung") }).toEqual({ befristungsart, h: undefined });
    }
  });

  it("greift in jedem laufenden Status", () => {
    for (const status of OFFENE_STATUS) {
      expect({ status, ton: kette({ status, bisherigeBefristungMonate: 24 })?.ton }).toEqual({ status, ton: "wait" });
    }
  });

  it("nicht mehr nach dem Ende des Vorgangs (abgeschlossen, storniert) – anders als die alte Seite", () => {
    // Die Grenze betrifft die NAECHSTE Befristung; nach dem Ende ist hier nichts mehr zu tun.
    for (const status of ENDSTATUS) {
      for (const teil of [{ bisherigeBefristungMonate: 24 }, { bisherigeVerlaengerungen: 3 }]) {
        expect({ status, h: kette({ status, ...teil }) }).toEqual({ status, h: undefined });
      }
    }
  });
});

describe("Vertragsende von DokuBit geändert", () => {
  it("greift mit Datum bei laufendem Vorgang; Datum im Titel in deutscher Zeit", () => {
    // 22:30 UTC am 30.09. ist in Berlin (Sommerzeit) schon der 01.10.
    for (const status of OFFENE_STATUS) {
      const h = einer(stand({ status, contractEndDateGeaendertAm: "2026-09-30T22:30:00.000Z" }), "dokubit");
      expect({ status, ton: h?.ton, titel: h?.titel }).toEqual({
        status,
        ton: "wait",
        titel: "Vertragsende von DokuBit geändert (01.10.2026)",
      });
    }
  });

  it("ohne Datum kein Hinweis", () => {
    for (const contractEndDateGeaendertAm of [null, ""]) {
      expect(einer(stand({ contractEndDateGeaendertAm }), "dokubit")).toBeUndefined();
    }
  });

  it("nicht mehr nach dem Ende des Vorgangs", () => {
    for (const status of ENDSTATUS) {
      expect(einer(stand({ status, contractEndDateGeaendertAm: inTagen(-1) }), "dokubit")).toBeUndefined();
    }
  });

  it("ein unlesbares Datum fällt samt Klammer weg — kein „()“ im Titel", () => {
    const h = einer(stand({ contractEndDateGeaendertAm: "kein Datum" }), "dokubit");
    expect(h?.titel).toBe("Vertragsende von DokuBit geändert");
  });
});

describe("Weitere Einstellungen", () => {
  it("greift mit mindestens einem Eintrag und nennt alle", () => {
    const h = einer(stand({ weitereMandanten: ["Gymnasium Minden", "Grundschule Lübbecke"] }), "weitere-mandanten");
    expect(h).toMatchObject({ ton: "info", titel: "Person hat weitere Einstellungen" });
    expect(h?.text).toBe(
      "Laut DokuBit zusätzlich beschäftigt bei: Gymnasium Minden, Grundschule Lübbecke. Bei der Vertragsgestaltung die Gesamtarbeitszeit beachten.",
    );
  });

  it("leere Liste, leere und nur aus Leerzeichen bestehende Einträge: kein Hinweis", () => {
    for (const weitereMandanten of [[], [""], ["   "], ["", " ", "\t"]]) {
      expect(einer(stand({ weitereMandanten }), "weitere-mandanten")).toBeUndefined();
    }
  });

  it("leere Einträge fallen weg, die übrigen stehen ohne Rand da", () => {
    const h = einer(stand({ weitereMandanten: ["", "  Gymnasium Minden ", " ", "Kita Arche"] }), "weitere-mandanten");
    expect(h?.text).toContain("bei: Gymnasium Minden, Kita Arche.");
    expect(h?.text).not.toMatch(/, ,|: ,|,\./);
  });

  it("ändert die Liste des Aufrufers nicht", () => {
    const liste = [" Gymnasium Minden ", ""];
    hinweise(stand({ weitereMandanten: liste }));
    expect(liste).toEqual([" Gymnasium Minden ", ""]);
  });
});

// =============================================
// Über ein Raster von Lagen
// =============================================

const RASTER: HinweisStand[] = ALLE_STATUS.flatMap((status) =>
  ["OFFEN", "UEBERNAHME", "KEINE_UEBERNAHME"].flatMap((decision) =>
    [inTagen(-3), inTagen(0), inTagen(10), inTagen(200)].flatMap((contractEndDate) =>
      [null, true, false].flatMap((vorstandAbgestimmt) =>
        [false, true].flatMap((mitKette) =>
          [null, "2026-09-30T22:30:00.000Z"].flatMap((contractEndDateGeaendertAm) =>
            [[], ["Gymnasium Minden", " "]].map((weitereMandanten) =>
              stand({
                status,
                decision,
                contractEndDate,
                vorstandAbgestimmt,
                ...(mitKette ? { befristungsart: "SACHGRUNDLOS", bisherigeBefristungMonate: 30, bisherigeVerlaengerungen: 3 } : {}),
                contractEndDateGeaendertAm,
                weitereMandanten,
              }),
            ),
          ),
        ),
      ),
    ),
  ),
);

const kurz = (s: HinweisStand) =>
  `${s.status} / ${s.decision} / Ende ${s.contractEndDate} / Vorstand ${String(s.vorstandAbgestimmt)} / Kette ${
    s.befristungsart ?? "—"
  } / DokuBit ${s.contractEndDateGeaendertAm ?? "—"} / weitere ${s.weitereMandanten.length}`;

const RANG = { critical: 0, wait: 1, info: 2 } as const;

describe("Über alle Lagen", () => {
  let PROBEN: { lage: string; liste: HinweisAngabe[] }[] = [];
  beforeAll(() => {
    PROBEN = RASTER.map((s) => ({ lage: kurz(s), liste: hinweise(s) }));
  });

  it("das Raster trifft jeden Hinweis mindestens einmal", () => {
    const vorgekommen = new Set(PROBEN.flatMap((p) => p.liste.map((h) => h.schluessel)));
    expect([...vorgekommen].sort()).toEqual(["dokubit", "entfristung", "kettenbefristung", "vorstand", "weitere-mandanten"]);
  });

  it("alle zugleich: in fester Reihenfolge critical → wait → info", () => {
    const s = uebernahme({
      contractEndDate: inTagen(10),
      vorstandAbgestimmt: false,
      befristungsart: "SACHGRUNDLOS",
      bisherigeBefristungMonate: 24,
      contractEndDateGeaendertAm: inTagen(-1),
      weitereMandanten: ["Gymnasium Minden"],
    });
    expect(hinweise(s).map((h) => [h.schluessel, h.ton])).toEqual([
      ["entfristung", "critical"],
      ["vorstand", "critical"],
      ["kettenbefristung", "wait"],
      ["dokubit", "wait"],
      ["weitere-mandanten", "info"],
    ]);
  });

  it("Reihenfolge in jeder Lage: erst kritisch, dann Vorsicht, dann Kenntnis — jeder Hinweis höchstens einmal", () => {
    for (const { lage, liste } of PROBEN) {
      const raenge = liste.map((h) => RANG[h.ton]);
      expect({ lage, raenge }).toEqual({ lage, raenge: [...raenge].sort((a, b) => a - b) });
      const keys = liste.map((h) => h.schluessel);
      expect({ lage, doppelt: keys.length - new Set(keys).size }).toEqual({ lage, doppelt: 0 });
    }
  });

  it("Ton je Hinweis fest", () => {
    const TON = {
      entfristung: "critical",
      vorstand: "critical",
      kettenbefristung: "wait",
      dokubit: "wait",
      "weitere-mandanten": "info",
    } as const;
    for (const { liste } of PROBEN) {
      for (const h of liste) expect([h.schluessel, h.ton]).toEqual([h.schluessel, TON[h.schluessel]]);
    }
  });

  it("Sprache: keine Anrede, keine Emojis, keine Großschreibung als Betonung, „Führungskraft“", () => {
    for (const { lage, liste } of PROBEN) {
      for (const h of liste) {
        for (const text of [h.titel, h.text]) {
          const befund = {
            leer: text.trim() === "",
            rand: text !== text.trim(),
            anrede: /\b(Sie|Ihnen|Ihre?[mnrs]?|du|dich|dir|dein\w*)\b/.test(text),
            emoji: /\p{Extended_Pictographic}/u.test(text),
            versalien: /(?<!\p{L})\p{Lu}{4,}(?!\p{L})/u.exec(text)?.[0] ?? null,
            vorgesetzt: /Vorgesetzt/.test(text),
            leerstelle: /undefined|null|NaN|\(\)|\s{2,}/.test(text),
          };
          expect({ lage, text, befund }).toEqual({
            lage,
            text,
            befund: { leer: false, rand: false, anrede: false, emoji: false, versalien: null, vorgesetzt: false, leerstelle: false },
          });
        }
      }
    }
    // Die alte Seite schrieb „NICHT“ und „UNBEFRISTET“ in Versalien.
    const alle = PROBEN.flatMap((p) => p.liste.flatMap((h) => [h.titel, h.text])).join("\n");
    expect(alle).not.toMatch(/NICHT|UNBEFRISTET/);
  });

  it("Daten im Text nur als TT.MM.JJJJ, nie als ISO-Zeitstempel", () => {
    for (const { lage, liste } of PROBEN) {
      for (const h of liste) {
        const text = `${h.titel} ${h.text}`;
        expect({ lage, iso: /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/.test(text) }).toEqual({ lage, iso: false });
        for (const datum of text.match(/\d+\.\d+\.\d+/g) ?? []) {
          expect(datum).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
        }
      }
    }
  });

  it("rein: gleiche Eingabe, gleiche Ausgabe — die Uhr kommt nur über `jetzt`", () => {
    const s = RASTER[RASTER.length - 1];
    expect(vertragsendeHinweise(s, JETZT)).toEqual(vertragsendeHinweise(s, new Date(JETZT.getTime())));
  });
});
