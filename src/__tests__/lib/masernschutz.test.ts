import {
  GEMEINSCHAFTSEINRICHTUNGEN,
  NACHWEIS_AB_GEBURTSJAHR,
  geburtsjahr,
  istGemeinschaftseinrichtung,
  istNach1970Geboren,
  masernschutzPflichtig,
} from "@/lib/masernschutz";

describe("istNach1970Geboren", () => {
  it("zieht die Grenze am 31.12.1970 — 1971 ist erfasst", () => {
    // Der Fehler, der heute in mehreren Labels steht ("nach 1971 geboren"),
    // wuerde genau diesen Jahrgang durchrutschen lassen.
    expect(istNach1970Geboren("1970-12-31")).toBe(false);
    expect(istNach1970Geboren("1971-01-01")).toBe(true);
    expect(istNach1970Geboren("1971-12-31")).toBe(true);
    expect(istNach1970Geboren("1972-06-15")).toBe(true);
    expect(istNach1970Geboren("1969-01-01")).toBe(false);
  });

  it("liest auch Date-Objekte an der Jahresgrenze richtig", () => {
    // Prisma liefert `Date`. Ein Datum ohne Uhrzeit liegt auf Mitternacht UTC —
    // in Ortszeit gelesen waere der 01.01.1971 westlich von Greenwich der
    // 31.12.1970 und damit die falsche Antwort.
    expect(istNach1970Geboren(new Date("1971-01-01"))).toBe(true);
    expect(istNach1970Geboren(new Date("1970-12-31"))).toBe(false);
  });

  it("liest den vollen Zeitstempel als Praefix", () => {
    expect(istNach1970Geboren("2001-05-03T00:00:00.000Z")).toBe(true);
  });

  it("antwortet mit null statt mit 'nein', wenn nichts vorliegt", () => {
    // Der Unterschied ist der ganze Grund fuer den Umbau: Ein stilles "Nein"
    // sieht in der Personalakte aus wie eine gegebene Antwort.
    expect(istNach1970Geboren(null)).toBeNull();
    expect(istNach1970Geboren(undefined)).toBeNull();
    expect(istNach1970Geboren("")).toBeNull();
  });

  it("raet bei fremden Formaten nicht, sondern gibt null zurueck", () => {
    // "03.05.2001" liest `new Date` je nach Laufzeit unterschiedlich. Ein
    // geratenes Jahr entscheidet hier ueber eine Nachweispflicht.
    expect(istNach1970Geboren("03.05.2001")).toBeNull();
    expect(istNach1970Geboren("irgendwas")).toBeNull();
    expect(istNach1970Geboren(new Date("kein datum"))).toBeNull();
  });

  it("stuerzt bei unerwarteten Typen nicht ab", () => {
    // Im Browser kommt der Wert aus einem Record<string, unknown>.
    expect(istNach1970Geboren(42)).toBeNull();
    expect(istNach1970Geboren({ jahr: 2001 })).toBeNull();
    expect(istNach1970Geboren(true)).toBeNull();
  });
});

describe("geburtsjahr", () => {
  it("liefert das Jahr fuer die Anzeige", () => {
    expect(geburtsjahr("2001-05-03")).toBe(2001);
    expect(geburtsjahr(new Date("1968-02-29"))).toBe(1968);
    expect(geburtsjahr("")).toBeNull();
  });
});

describe("istGemeinschaftseinrichtung", () => {
  it("erfasst genau die fuenf Einrichtungstypen", () => {
    for (const typ of GEMEINSCHAFTSEINRICHTUNGEN) {
      expect(istGemeinschaftseinrichtung(typ)).toBe(true);
    }
    expect(GEMEINSCHAFTSEINRICHTUNGEN).toHaveLength(5);
  });

  it("schliesst Verwaltung, GmbH und Verein aus", () => {
    // Fuer sie traegt IfSG § 20 Abs. 8 nicht — ein Gesundheitsdatum ohne
    // Rechtsgrundlage einzufordern ist ein Art.-9-Problem.
    expect(istGemeinschaftseinrichtung("VERWALTUNG")).toBe(false);
    expect(istGemeinschaftseinrichtung("GMBH")).toBe(false);
    expect(istGemeinschaftseinrichtung("VEREIN")).toBe(false);
    expect(istGemeinschaftseinrichtung(null)).toBe(false);
    expect(istGemeinschaftseinrichtung(undefined)).toBe(false);
    expect(istGemeinschaftseinrichtung("")).toBe(false);
  });
});

describe("masernschutzPflichtig", () => {
  it("verlangt den Nachweis in Schule und Kita ab Geburtsjahr 1971", () => {
    expect(
      masernschutzPflichtig({
        geburtsdatum: "1971-01-01",
        organisationstyp: "GRUNDSCHULE",
      })
    ).toBe(true);
    expect(
      masernschutzPflichtig({
        geburtsdatum: new Date("2001-05-03"),
        organisationstyp: "KITA",
      })
    ).toBe(true);
  });

  it("verlangt ihn nicht von vor 1971 Geborenen", () => {
    expect(
      masernschutzPflichtig({
        geburtsdatum: "1970-12-31",
        organisationstyp: "GYMNASIUM",
      })
    ).toBe(false);
  });

  it("verlangt ihn nicht ausserhalb von Gemeinschaftseinrichtungen", () => {
    expect(
      masernschutzPflichtig({
        geburtsdatum: "2001-05-03",
        organisationstyp: "VERWALTUNG",
      })
    ).toBe(false);
  });

  it("fuehrt ohne Geburtsdatum NIE zur Pflicht", () => {
    // "Im Zweifel Pflicht" wuerde einen Vorgang an einer Grundlage
    // haengenbleiben lassen, die die Person nie zu Gesicht bekommen hat.
    expect(
      masernschutzPflichtig({ geburtsdatum: null, organisationstyp: "KITA" })
    ).toBe(false);
    expect(
      masernschutzPflichtig({ geburtsdatum: "", organisationstyp: "KITA" })
    ).toBe(false);
    expect(
      masernschutzPflichtig({
        geburtsdatum: "03.05.2001",
        organisationstyp: "KITA",
      })
    ).toBe(false);
  });
});

describe("NACHWEIS_AB_GEBURTSJAHR", () => {
  it("steht auf 1971 — das Feld heisst nur anders", () => {
    // Die Spalte `bornAfter1971` bleibt so heissen: Ohne Migrationsordner waere
    // eine Umbenennung ein `db push --accept-data-loss`, also ein Loeschen mit
    // anschliessendem Neuanlegen. Der Wert der Konstante ist die Regel, der
    // Spaltenname ist nur ein Name.
    expect(NACHWEIS_AB_GEBURTSJAHR).toBe(1971);
  });
});
