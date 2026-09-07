/**
 * Tests: Freigaberegel fuer abweichende Empfaengeradressen
 * (lib/empfaenger-freigabe.ts — die reinen Funktionen)
 *
 * Vier Zusagen sollen diese Datei belegen:
 *  (a) Der Normalfall des Onboardings — die im Vorgang hinterlegte private
 *      Adresse — geht auch bei gepflegter Liste durch. Ohne diesen Test waere
 *      die Regel jederzeit versehentlich weg-refaktorierbar, und die Wirkung
 *      faellt erst im Betrieb auf, wenn niemand mehr Unterlagen bekommt.
 *  (b) Der Domainvergleich weicht nicht zu einem endsWith auf. So wird eine
 *      Allowlist leise loechrig: "boesecredo-gruppe.de" endet auf
 *      "credo-gruppe.de".
 *  (c) Eine kaputte Eingabe wird als ungueltig gemeldet und nicht still
 *      geschluckt — eine unwirksame Schranke ist schlimmer als keine, weil
 *      niemand nachsieht. Dazu gehoert der Sonderfall "Feld voller
 *      Trennzeichen": Er darf NICHT als bewusst geleertes Feld durchgehen,
 *      denn leer heisst "keine Einschraenkung" (leerTrotzEingabe).
 *  (d) Die Datei bleibt IMPORTFREI. Daran haengt, dass der Versand-Dialog
 *      ("use client") dieselbe Regel benutzen kann statt sie nachzubauen; ein
 *      einziger Import auf @/lib/db zoege den Prisma-Client ins Browser-Bundle.
 *
 * Dass hier KEIN jest.mock steht, ist selbst Teil der Aussage: Das Modul
 * braucht keine Umgebung.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  domainVon,
  normalisiereDomains,
  empfaengerFreigegeben,
  MAX_ERLAUBTE_DOMAINS,
} from "@/lib/empfaenger-freigabe";

describe("empfaenger-freigabe importiert nichts", () => {
  it("enthaelt keine import- oder require-Anweisung", () => {
    // Statisch am Quelltext geprueft und nicht am geladenen Modul: Ein Import
    // mit reiner Typ-Wirkung oder ein Seiteneffekt-Import ("import '@/lib/x'")
    // waere zur Laufzeit nicht mehr zu sehen, wuerde das Bundle aber trotzdem
    // erreichen. Genau davor schuetzt diese Datei.
    const quelle = readFileSync(
      join(__dirname, "..", "..", "lib", "empfaenger-freigabe.ts"),
      "utf8",
    );
    // Kommentarzeilen weg, damit die Erklaerung im Kopf (die das Wort "import"
    // benutzt) den Test nicht ausloest.
    const code = quelle
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code).not.toMatch(/\brequire\s*\(/);
    expect(code).not.toMatch(/\bfrom\s+["']/);
  });
});

describe("domainVon", () => {
  it("liefert die kleingeschriebene Domain", () => {
    expect(domainVon("Max@Example.ORG")).toBe("example.org");
  });

  it("liefert null ohne @", () => {
    expect(domainVon("kein-at-zeichen")).toBeNull();
  });

  it("liefert null, wenn nach dem @ nichts steht", () => {
    expect(domainVon("a@")).toBeNull();
    expect(domainVon("a@   ")).toBeNull();
  });

  it("nimmt den Teil nach dem LETZTEN @", () => {
    // Ein lokaler Teil darf in Anfuehrungszeichen ein @ enthalten. Wer nach
    // dem ersten trennte, bekaeme hier "b@example.org" als vermeintliche
    // Domain — und liesse sich damit eine andere unterschieben.
    expect(domainVon('"a@b"@example.org')).toBe("example.org");
  });

  it("ignoriert Leerzeichen am Rand der Domain", () => {
    expect(domainVon("max@ example.org ")).toBe("example.org");
  });
});

describe("normalisiereDomains", () => {
  it("schneidet fuehrendes @ und . ab, schreibt klein, entdoppelt und ignoriert Leereintraege", () => {
    const { domains, ungueltig, leerTrotzEingabe } = normalisiereDomains(
      "@Web.DE, .fes-minden.de , , web.de",
    );
    expect(domains).toEqual(["web.de", "fes-minden.de"]);
    expect(ungueltig).toEqual([]);
    expect(leerTrotzEingabe).toBe(false);
  });

  it("meldet kaputte Eintraege als ungueltig, statt sie still zu schlucken", () => {
    const { domains, ungueltig } = normalisiereDomains("kein domain, http://x.de, a b.de");
    expect(domains).toEqual([]);
    // Zurueckgegeben wird der getrimmte Originaltext, damit die Person in der
    // Fehlermeldung wiedererkennt, was sie getippt hat.
    expect(ungueltig).toEqual(["kein domain", "http://x.de", "a b.de"]);
  });

  it("trennt gueltige und ungueltige Eintraege derselben Eingabe", () => {
    const { domains, ungueltig } = normalisiereDomains("fes-minden.de, nurtld, credo-gruppe.de");
    expect(domains).toEqual(["fes-minden.de", "credo-gruppe.de"]);
    expect(ungueltig).toEqual(["nurtld"]);
  });

  it("liefert fuer eine leere Eingabe zwei leere Listen und meldet KEIN leerTrotzEingabe", () => {
    // Das komplett leere Feld ist der legitime Weg, die Einschraenkung
    // abzuschalten. Waere hier leerTrotzEingabe wahr, koennte niemand die
    // Liste mehr loswerden.
    expect(normalisiereDomains("")).toEqual({
      domains: [],
      ungueltig: [],
      leerTrotzEingabe: false,
    });
    expect(normalisiereDomains("   ")).toEqual({
      domains: [],
      ungueltig: [],
      leerTrotzEingabe: false,
    });
  });

  it("meldet leerTrotzEingabe, wenn die Eingabe nur aus Trennzeichen besteht", () => {
    // Der Befund: ",,, @" ergibt weder eine Domain noch einen ungueltigen
    // Eintrag (leere Teile werden uebersprungen). Ohne dieses Kennzeichen
    // sieht das Ergebnis aus wie ein bewusst geleertes Feld — und eine leere
    // Liste heisst "keine Einschraenkung". Die Schranke schaltete sich durch
    // einen Tippfehler selbst ab.
    for (const roh of [",,, @", ",", "   ,  , ", "@", "@.", " . "]) {
      const ergebnis = normalisiereDomains(roh);
      expect(ergebnis.domains).toEqual([]);
      expect(ergebnis.ungueltig).toEqual([]);
      expect(ergebnis.leerTrotzEingabe).toBe(true);
    }
  });

  it("meldet leerTrotzEingabe auch, wenn ALLE Eintraege ungueltig sind", () => {
    // Bewusst beides: Die Route nennt zuerst die ungueltigen Eintraege, weil
    // das die genauere Meldung ist. Faellt diese Pruefung jemals weg, greift
    // immer noch das Kennzeichen — die stille Abschaltung ist der Fehlerfall,
    // den zwei Schranken decken duerfen.
    const ergebnis = normalisiereDomains("http://x.de, a b.de");
    expect(ergebnis.domains).toEqual([]);
    expect(ergebnis.ungueltig).toEqual(["http://x.de", "a b.de"]);
    expect(ergebnis.leerTrotzEingabe).toBe(true);
  });

  it("meldet kein leerTrotzEingabe, solange eine gueltige Domain uebrigbleibt", () => {
    expect(normalisiereDomains("fes-minden.de, nurtld").leerTrotzEingabe).toBe(false);
  });

  it("akzeptiert Unterdomains und Punycode als gueltige Eintraege", () => {
    const { domains, ungueltig } = normalisiereDomains("mail.fes-minden.de, xn--mnchen-3ya.de");
    expect(domains).toEqual(["mail.fes-minden.de", "xn--mnchen-3ya.de"]);
    expect(ungueltig).toEqual([]);
  });

  it("MAX_ERLAUBTE_DOMAINS ist eine Zahl, an der die Einstellungs-Route messen kann", () => {
    expect(typeof MAX_ERLAUBTE_DOMAINS).toBe("number");
    expect(MAX_ERLAUBTE_DOMAINS).toBeGreaterThan(0);
  });
});

describe("empfaengerFreigegeben", () => {
  it("laesst die Adresse des Vorgangs durch, auch wenn ihre Domain nicht in der Liste steht", () => {
    // Der Regelfall des Onboardings: Die neue Person hat noch kein
    // dienstliches Postfach. Blockierte die Liste das, waere sie unbenutzbar.
    expect(
      empfaengerFreigegeben({
        empfaenger: "neue.person@gmail.com",
        empfaengerVorgang: "neue.person@gmail.com",
        domains: ["fes-minden.de"],
      }),
    ).toBe(true);
  });

  it("vergleicht mit der Vorgangsadresse unempfindlich gegen Gross-/Kleinschreibung und Leerzeichen", () => {
    expect(
      empfaengerFreigegeben({
        empfaenger: "  MAX@Example.ORG ",
        empfaengerVorgang: "max@example.org",
        domains: ["fes-minden.de"],
      }),
    ).toBe(true);
  });

  it("blockiert nichts, solange keine Domain gepflegt ist (Auslieferungszustand)", () => {
    expect(
      empfaengerFreigegeben({
        empfaenger: "privat@web.de",
        empfaengerVorgang: "max@example.org",
        domains: [],
      }),
    ).toBe(true);
  });

  it("laesst eine abweichende Adresse durch, deren Domain in der Liste steht", () => {
    expect(
      empfaengerFreigegeben({
        empfaenger: "personal@fes-minden.de",
        empfaengerVorgang: "max@example.org",
        domains: ["fes-minden.de"],
      }),
    ).toBe(true);
  });

  it("lehnt eine abweichende Adresse mit fremder Domain ab", () => {
    expect(
      empfaengerFreigegeben({
        empfaenger: "dieb@gmail.com",
        empfaengerVorgang: "max@example.org",
        domains: ["fes-minden.de"],
      }),
    ).toBe(false);
  });

  it("vergleicht EXAKT und nicht mit endsWith (Praefix-Falle)", () => {
    // Der klassische Weg, wie eine Allowlist leise loechrig wird: Die Domain
    // "boesecredo-gruppe.de" ist fuer ein paar Euro zu haben und endet auf
    // den erlaubten Eintrag.
    expect(
      empfaengerFreigegeben({
        empfaenger: "x@boesecredo-gruppe.de",
        empfaengerVorgang: "max@example.org",
        domains: ["credo-gruppe.de"],
      }),
    ).toBe(false);
  });

  it("erlaubt eine Unterdomain nicht automatisch mit (bewusst: einzeln eintragen)", () => {
    expect(
      empfaengerFreigegeben({
        empfaenger: "x@mail.fes-minden.de",
        empfaengerVorgang: "max@example.org",
        domains: ["fes-minden.de"],
      }),
    ).toBe(false);
  });

  it("lehnt eine Adresse ohne verwertbare Domain ab (fail closed)", () => {
    for (const kaputt of ["kein-at-zeichen", "a@", "a@   ", ""]) {
      expect(
        empfaengerFreigegeben({
          empfaenger: kaputt,
          empfaengerVorgang: "max@example.org",
          domains: ["fes-minden.de"],
        }),
      ).toBe(false);
    }
  });

  it("beurteilt nur die Domain, nicht die Form der Adresse", () => {
    // Bewusst festgehalten, damit die Grenze klar ist: "@fes-minden.de" hat
    // keinen lokalen Teil, aber eine erlaubte Domain — die Freigabe sagt hier
    // ja. Ob die Adresse ueberhaupt zustellbar ist, entscheidet die
    // Adressvalidierung des Versands, nicht diese Schranke. Wer das hier
    // vermischt, bekommt zwei Stellen, die sich widersprechen koennen.
    expect(
      empfaengerFreigegeben({
        empfaenger: "@fes-minden.de",
        empfaengerVorgang: "max@example.org",
        domains: ["fes-minden.de"],
      }),
    ).toBe(true);
  });

  it("laesst eine leere Adresse nicht als 'gleich dem leeren Vorgang' durch", () => {
    // Haette der Vorgang keine Adresse, wuerde ein reiner Gleichheitsvergleich
    // die leere Eingabe freigeben.
    expect(
      empfaengerFreigegeben({
        empfaenger: "   ",
        empfaengerVorgang: "",
        domains: ["fes-minden.de"],
      }),
    ).toBe(false);
  });

  it("vergleicht die Domain gegen die Liste unempfindlich gegen Gross-/Kleinschreibung", () => {
    expect(
      empfaengerFreigegeben({
        empfaenger: "Personal@FES-Minden.DE",
        empfaengerVorgang: "max@example.org",
        domains: ["fes-minden.de"],
      }),
    ).toBe(true);
  });
});
