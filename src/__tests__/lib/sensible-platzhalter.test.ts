/**
 * Tests: Kennzeichnung sensibler Vorlagen (src/lib/placeholder-catalog.ts)
 *
 * Grundlage der Bestaetigungspflicht beim Paketversand. Bewusst ohne Datenbank
 * und ohne Entschluesselung — die Funktion beantwortet allein aus den
 * extrahierten Platzhaltern einer Vorlage, ob eine Bestaetigung noetig ist.
 */

import {
  PLACEHOLDER_CATALOG,
  SENSIBLE_PLATZHALTER_KEYS,
  sensiblePlatzhalter,
  brauchtBestaetigung,
} from "@/lib/placeholder-catalog";

describe("Sensible Felder erkennen", () => {
  it("meldet IBAN, SV-Nummer und Steuer-ID", () => {
    const felder = sensiblePlatzhalter(["anrede", "iban", "nachname", "sv_nummer", "steuer_id"]);
    expect(felder.map((f) => f.key)).toEqual(["iban", "sv_nummer", "steuer_id"]);
  });

  it("meldet die Abfindung aus dem Offboarding", () => {
    expect(sensiblePlatzhalter(["abfindung"]).map((f) => f.key)).toEqual(["abfindung"]);
  });

  it("liefert zu jedem Feld eine Beschriftung fuer die Bestaetigung", () => {
    for (const feld of sensiblePlatzhalter(["iban", "steuer_id"])) {
      expect(feld.label.length).toBeGreaterThan(0);
    }
  });

  it("laesst harmlose Vorlagen in Ruhe", () => {
    expect(sensiblePlatzhalter(["vorname", "nachname", "datum", "mandant"])).toEqual([]);
    expect(brauchtBestaetigung(["vorname", "nachname"])).toBe(false);
  });
});

describe("Modul-uebergreifend", () => {
  /**
   * Der Kern der Entscheidung: Eine Vorlage traegt ihr eigenes Modul (oft
   * ALLGEMEIN), gefuellt wird sie aber vom Resolver des Vorgangs. Eine
   * ALLGEMEIN-Vorlage mit {iban} bekommt in einem Onboarding-Paket die echte
   * IBAN — eine Pruefung gegen den ALLGEMEIN-Katalog wuerde sie durchwinken.
   */
  it("erkennt {iban} auch dann, wenn der ALLGEMEIN-Katalog das Feld gar nicht kennt", () => {
    const allgemeineKeys = PLACEHOLDER_CATALOG.ALLGEMEIN.map((p) => p.key);
    expect(allgemeineKeys).not.toContain("iban");
    expect(brauchtBestaetigung(["iban"])).toBe(true);
  });

  it("erfasst jedes im Katalog als sensitiv markierte Feld", () => {
    const ausKatalog = new Set<string>();
    for (const defs of Object.values(PLACEHOLDER_CATALOG)) {
      for (const def of defs) if (def.sensitive) ausKatalog.add(def.key);
    }
    // Waechst der Katalog um ein sensibles Feld, faellt es hier auf.
    expect(ausKatalog.size).toBeGreaterThan(0);
    const erkannt = sensiblePlatzhalter([...ausKatalog]).map((f) => f.key);
    expect(new Set(erkannt)).toEqual(ausKatalog);
    expect(SENSIBLE_PLATZHALTER_KEYS.size).toBe(ausKatalog.size);
  });
});

describe("Im Zweifel melden", () => {
  it("achtet nicht auf Gross- und Kleinschreibung", () => {
    // Der Extraktor legt die Namen so ab, wie sie in der .docx stehen. {IBAN}
    // wuerde der Resolver zwar nicht fuellen — ein Klick zu viel ist aber
    // folgenlos, eine ungefragt verschickte Steuer-ID nicht.
    expect(brauchtBestaetigung(["IBAN"])).toBe(true);
    expect(brauchtBestaetigung(["Steuer_ID"])).toBe(true);
  });

  it("uebersteht Klammern, Leerzeichen und Punkt-Notation", () => {
    expect(brauchtBestaetigung(["{iban}"])).toBe(true);
    expect(brauchtBestaetigung(["  sv_nummer  "])).toBe(true);
    expect(brauchtBestaetigung(["iban.formatiert"])).toBe(true);
  });
});

describe("Robustheit gegenueber dem Json-Feld", () => {
  it("kommt mit allem zurecht, was in platzhalter stehen kann", () => {
    for (const eingabe of [null, undefined, "iban", 42, {}, { iban: true }]) {
      expect(sensiblePlatzhalter(eingabe)).toEqual([]);
    }
  });

  it("uebergeht Nicht-Strings innerhalb der Liste", () => {
    expect(sensiblePlatzhalter([null, 7, { key: "iban" }, "iban"]).map((f) => f.key)).toEqual([
      "iban",
    ]);
  });

  it("liefert leere Listen fuer leere Eingaben", () => {
    expect(sensiblePlatzhalter([])).toEqual([]);
    expect(sensiblePlatzhalter(["", "   "])).toEqual([]);
  });
});

describe("Stabile Reihenfolge", () => {
  it("haengt an der Katalogreihenfolge, nicht an der Vorlage", () => {
    const a = sensiblePlatzhalter(["steuer_id", "iban", "sv_nummer"]).map((f) => f.key);
    const b = sensiblePlatzhalter(["iban", "sv_nummer", "steuer_id"]).map((f) => f.key);
    expect(a).toEqual(b);
  });

  it("meldet ein doppelt genanntes Feld nur einmal", () => {
    expect(sensiblePlatzhalter(["iban", "iban", "{IBAN}"]).map((f) => f.key)).toEqual(["iban"]);
  });
});

describe("Besondere Kategorien nach Art. 9 DSGVO", () => {
  it("verlangt auch fuer Religion, Krankenkasse und Gemeinde eine Bestaetigung", () => {
    // Aus dem Review: Diese drei standen nicht als sensibel im Katalog und
    // waeren damit ohne Bestaetigung und ohne rotes Kennzeichen per
    // unverschluesselter E-Mail hinausgegangen. Religionszugehoerigkeit,
    // Krankenkasse (Gesundheitsbezug) und Gemeindezugehoerigkeit sind
    // besondere Kategorien.
    expect(brauchtBestaetigung(["religion"])).toBe(true);
    expect(brauchtBestaetigung(["krankenkasse"])).toBe(true);
    expect(brauchtBestaetigung(["gemeinde"])).toBe(true);
  });

  it("nennt sie im Dialog beim Namen", () => {
    expect(sensiblePlatzhalter(["religion", "krankenkasse"]).map((f) => f.label)).toEqual([
      "Krankenkasse",
      "Religion (Kirchensteuer)",
    ]);
  });
});
