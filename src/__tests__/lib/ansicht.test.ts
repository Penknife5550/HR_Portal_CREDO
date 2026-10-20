/**
 * Vorschau-Schalter alt/neu (UX-Umbau, Pilot, Entscheidung P-F1): Name, Lesen
 * und Setzen des Cookies, Verweis „Rückmeldung geben“.
 */

import {
  ANSICHT_COOKIE_DAUER,
  ANSICHT_RUECKMELDUNG_ADRESSE,
  ANSICHT_VERTRAGSENDE_COOKIE,
  ansichtAusCookie,
  ansichtCookieZeile,
  ansichtRueckmeldungLink,
} from "@/lib/ansicht";

/** `name=wert; Attribut; Attribut=Wert` → Name, Wert und Attribute einzeln. */
function zerlegen(zeile: string) {
  const [paar, ...attribute] = zeile.split("; ");
  const gleich = paar.indexOf("=");
  return {
    name: paar.slice(0, gleich),
    wert: paar.slice(gleich + 1),
    attribute: Object.fromEntries(
      attribute.map((a) => {
        const i = a.indexOf("=");
        return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1)];
      }),
    ) as Record<string, string | true>,
  };
}

describe("Name des Cookies", () => {
  it("ist fest und ein gültiger Cookie-Name", () => {
    expect(ANSICHT_VERTRAGSENDE_COOKIE).toBe("ansicht-vertragsende");
    // RFC 6265: Token ohne Trenn- und Leerzeichen
    expect(ANSICHT_VERTRAGSENDE_COOKIE).toMatch(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/);
  });
});

describe("ansichtAusCookie", () => {
  it("nur der Wert „neu“ schaltet auf die neue Ansicht", () => {
    expect(ansichtAusCookie("neu")).toBe("neu");
  });

  it("alles andere ist die alte Ansicht — fehlt, leer, unbekannt, anders geschrieben", () => {
    for (const wert of [undefined, null, "", "NEU", "Neu", " neu", "neu ", "alt", "ja", "true", "1", "neu;", "neu=neu"]) {
      expect({ wert, ansicht: ansichtAusCookie(wert) }).toEqual({ wert, ansicht: "alt" });
    }
  });
});

describe("ansichtCookieZeile", () => {
  it("neu: Wert „neu“, ein Jahr, ganze Seite, SameSite=Lax", () => {
    expect(ANSICHT_COOKIE_DAUER).toBe(31_536_000);
    expect(ansichtCookieZeile("neu", false)).toBe("ansicht-vertragsende=neu; Max-Age=31536000; Path=/; SameSite=Lax");
    const z = zerlegen(ansichtCookieZeile("neu", false));
    expect(z).toEqual({
      name: ANSICHT_VERTRAGSENDE_COOKIE,
      wert: "neu",
      attribute: { "Max-Age": "31536000", Path: "/", SameSite: "Lax" },
    });
  });

  it("alt: leerer Wert und Max-Age=0 — löscht den Cookie, statt einen zweiten Wert zu speichern", () => {
    expect(ansichtCookieZeile("alt", false)).toBe("ansicht-vertragsende=; Max-Age=0; Path=/; SameSite=Lax");
    const z = zerlegen(ansichtCookieZeile("alt", false));
    expect(z.wert).toBe("");
    expect(z.attribute["Max-Age"]).toBe("0");
    // Gelöscht wird nur, was mit demselben Pfad gesetzt wurde.
    expect(z.attribute.Path).toBe(zerlegen(ansichtCookieZeile("neu", false)).attribute.Path);
  });

  it("Secure nur, wenn sicher — in beiden Richtungen", () => {
    for (const ansicht of ["neu", "alt"] as const) {
      expect(zerlegen(ansichtCookieZeile(ansicht, true)).attribute.Secure).toBe(true);
      expect(zerlegen(ansichtCookieZeile(ansicht, false)).attribute.Secure).toBeUndefined();
      expect(ansichtCookieZeile(ansicht, true)).toBe(`${ansichtCookieZeile(ansicht, false)}; Secure`);
    }
  });

  it("kein Expires, kein Domain, kein HttpOnly (der Browser setzt ihn selbst über document.cookie)", () => {
    for (const ansicht of ["neu", "alt"] as const) {
      for (const sicher of [true, false]) {
        const { attribute } = zerlegen(ansichtCookieZeile(ansicht, sicher));
        expect(Object.keys(attribute).filter((a) => ["Expires", "Domain", "HttpOnly"].includes(a))).toEqual([]);
      }
    }
  });

  it("Rundreise: was gesetzt wird, liest ansichtAusCookie als dieselbe Ansicht", () => {
    for (const ansicht of ["neu", "alt"] as const) {
      expect(ansichtAusCookie(zerlegen(ansichtCookieZeile(ansicht, true)).wert)).toBe(ansicht);
    }
  });
});

describe("ansichtRueckmeldungLink", () => {
  it("mailto an das Personalbüro mit kodiertem Betreff", () => {
    expect(ANSICHT_RUECKMELDUNG_ADRESSE).toBe("personalbuchhaltung@fes-minden.de");
    const link = ansichtRueckmeldungLink();
    expect(link.startsWith("mailto:personalbuchhaltung@fes-minden.de?subject=")).toBe(true);
    // Kodiert: keine Leerzeichen, keine Umlaute, kein zweites Fragezeichen
    expect(link).toMatch(/^[\x21-\x7e]+$/);
    expect(link.split("?")).toHaveLength(2);
    const betreff = link.slice(link.indexOf("subject=") + "subject=".length);
    expect(decodeURIComponent(betreff)).toBe("Rückmeldung: neue Ansicht Vertragsende");
    expect(betreff).toBe(encodeURIComponent("Rückmeldung: neue Ansicht Vertragsende"));
  });

  it("ist als Adresse lesbar", () => {
    const url = new URL(ansichtRueckmeldungLink());
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(ANSICHT_RUECKMELDUNG_ADRESSE);
    expect(url.searchParams.get("subject")).toBe("Rückmeldung: neue Ansicht Vertragsende");
  });
});
