/**
 * Tests: Dokumenttypen der Verbeamtung (src/lib/constants.ts)
 *
 * Anlass ist ein Fehler, der lange unbemerkt lief. Die Upload-Route pflegte
 * eine eigene Typ-Liste, die sich mit der Liste der Oberflaeche nur in neun von
 * siebenundzwanzig Eintraegen deckte. Aufgefallen ist das nie, weil die
 * Oberflaeche den Typ unter dem Feldnamen "type" schickte, die Route aber
 * "documentType" las — der Wert fehlte also immer und fiel auf SONSTIGES
 * zurueck. Jeder Upload landete unter diesem Typ, und weil SONSTIGES im
 * Typ-Raster der Oberflaeche nicht vorkommt, war jedes hochgeladene Dokument
 * unsichtbar.
 *
 * Dieser Test haelt fest, dass die Oberflaeche nichts anbieten kann, was der
 * Upload ablehnt.
 */

import {
  CIVIL_SERVICE_DOC_TYPES,
  CIVIL_SERVICE_UPLOAD_TYPES,
} from "@/lib/constants";

describe("Dokumenttypen der Verbeamtung", () => {
  it("nimmt jeden Typ an, den die Oberflaeche zur Auswahl stellt", () => {
    const angeboten = Object.keys(CIVIL_SERVICE_DOC_TYPES);
    expect(angeboten.length).toBeGreaterThan(0);
    const abgelehnt = angeboten.filter((t) => !CIVIL_SERVICE_UPLOAD_TYPES.includes(t));
    expect(abgelehnt).toEqual([]);
  });

  it("erlaubt zusaetzlich SONSTIGES als Rueckfallwert", () => {
    // Der Typ aller bisher hochgeladenen Dokumente. Ohne ihn liessen sich
    // Bestandsdaten nicht mehr ersetzen.
    expect(CIVIL_SERVICE_UPLOAD_TYPES).toContain("SONSTIGES");
  });

  it("erlaubt nichts, was die Oberflaeche nicht kennt (ausser SONSTIGES)", () => {
    const angeboten = new Set(Object.keys(CIVIL_SERVICE_DOC_TYPES));
    const zusaetzlich = CIVIL_SERVICE_UPLOAD_TYPES.filter((t) => !angeboten.has(t));
    expect(zusaetzlich).toEqual(["SONSTIGES"]);
  });

  it("fuehrt jeden Typ genau einmal", () => {
    expect(new Set(CIVIL_SERVICE_UPLOAD_TYPES).size).toBe(CIVIL_SERVICE_UPLOAD_TYPES.length);
  });

  it("gibt jedem angebotenen Typ eine Beschriftung", () => {
    for (const [key, label] of Object.entries(CIVIL_SERVICE_DOC_TYPES)) {
      expect(typeof label).toBe("string");
      expect(String(label).trim().length).toBeGreaterThan(0);
      // Grossschreibungs-Codes gehoeren nicht in die Anzeige.
      expect(label).not.toBe(key);
    }
  });
});
