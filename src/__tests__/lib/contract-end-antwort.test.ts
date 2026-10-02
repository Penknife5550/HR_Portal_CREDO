/**
 * Vertragsende: Der Schluessel des Magic-Links (`supervisorToken`) gehoert in
 * keine Antwort einer Schnittstelle.
 *
 * Zwei Teile:
 *   1. die Funktion selbst (`ohneVorgesetztenToken`),
 *   2. eine Sperrklinke ueber die Quelltexte der Routen: Jede Route, die
 *      `prisma.contractEndProcess` anfasst, steht unten in der Tabelle — mit
 *      dem Helfer oder mit dem Grund, warum sie ihn nicht braucht. Eine NEUE
 *      Route faellt hier auf, bevor sie den ganzen Datensatz zurueckgibt.
 *
 * Was die Sperrklinke nicht kann: Sie prueft nicht jede einzelne Antwort einer
 * Datei. Das tun die Routen-Tests (src/__tests__/api/contract-end*.test.ts).
 */
import { readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";
import { ohneVorgesetztenToken } from "@/lib/contract-end-antwort";

describe("ohneVorgesetztenToken", () => {
  const vorgang = {
    id: "ce1",
    supervisorEmail: "leitung@example.org",
    supervisorToken: "geheimer-magic-link-token",
    supervisorTokenExpiresAt: new Date("2026-11-01T00:00:00.000Z"),
    organization: { name: "Gymnasium" },
  };

  it("entfernt nur den Token — Ablaufdatum und alles Übrige bleiben", () => {
    expect(ohneVorgesetztenToken(vorgang)).toEqual({
      id: "ce1",
      supervisorEmail: "leitung@example.org",
      supervisorTokenExpiresAt: new Date("2026-11-01T00:00:00.000Z"),
      organization: { name: "Gymnasium" },
    });
  });

  it("entfernt das Feld auch, wenn es leer ist", () => {
    expect(ohneVorgesetztenToken({ id: "ce1", supervisorToken: null })).toEqual({ id: "ce1" });
  });

  it("lässt einen Vorgang ohne das Feld unverändert und verändert die Eingabe nicht", () => {
    const ohneFeld: { id: string; supervisorToken?: string } = { id: "ce1" };
    expect(ohneVorgesetztenToken(ohneFeld)).toEqual({ id: "ce1" });
    ohneVorgesetztenToken(vorgang);
    expect(vorgang.supervisorToken).toBe("geheimer-magic-link-token");
  });
});

describe("Sperrklinke: Routen mit Zugriff auf den Vertragsende-Datensatz", () => {
  const API_WURZEL = join(__dirname, "..", "..", "app", "api");
  const HELFER = "ohneVorgesetztenToken";

  /**
   * Jede Route unter src/app/api, die `contractEndProcess.` anfasst.
   * `HELFER` = gibt einen Vorgang zurueck und schickt ihn durch die Funktion;
   * sonst der Grund, warum die Antwort den Token nicht tragen kann.
   */
  const ROUTEN: Record<string, string> = {
    "contract-end/route.ts": HELFER,
    "contract-end/[id]/route.ts": HELFER,
    "contract-end/[id]/nicht-uebernehmen/route.ts": HELFER,
    "contract-end/[id]/reminder/route.ts": "Antwort aus einem select mit zwei Erinnerungsfeldern",
    "contract-end/[id]/supervisor-link/route.ts": "Antwort aus einzelnen Feldern, ohne Link",
    "reports/contract-end/route.ts": "festes select ohne Token",
    "vertrag-formular/[token]/route.ts": "öffentliches Formular, Antwort aus einzelnen Feldern",
    "vorgaenge/[modul]/[id]/mails/route.ts": "liest nur organizationId",
    "webhooks/contract-end/route.ts": "Antwort nur Status und Vorgangsnummer je Eintrag",
  };

  function routenDateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((eintrag) => {
      const pfad = join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) return routenDateien(pfad);
      return eintrag.name === "route.ts" ? [pfad] : [];
    });
  }

  const quellen = new Map(
    routenDateien(API_WURZEL).map((pfad) => [
      relative(API_WURZEL, pfad).split(sep).join("/"),
      readFileSync(pfad, "utf8"),
    ]),
  );

  it("jede Route mit contractEndProcess steht in der Tabelle (und keine zu viel)", () => {
    const gefunden = [...quellen]
      .filter(([, quelle]) => /\bcontractEndProcess\./.test(quelle))
      .map(([datei]) => datei)
      .sort();
    // Neue Route? Gibt sie einen Vorgang zurueck: durch ohneVorgesetztenToken()
    // schicken und mit HELFER eintragen. Sonst mit dem Grund eintragen.
    expect(gefunden).toEqual(Object.keys(ROUTEN).sort());
  });

  it.each(Object.entries(ROUTEN).filter(([, grund]) => grund === HELFER))(
    "%s schickt den Vorgang durch ohneVorgesetztenToken()",
    (datei) => {
      const quelle = quellen.get(datei) ?? "";
      expect(quelle).toContain('from "@/lib/contract-end-antwort"');
      // Import UND mindestens eine Verwendung
      expect(quelle.split(HELFER).length - 1).toBeGreaterThanOrEqual(2);
    },
  );

  it("keine Route hängt den Vertragsende-Datensatz ungefiltert an einen anderen", () => {
    // `contractEnd: true` bzw. `contractEndProcesses: true` in einem include
    // gaebe den ganzen Datensatz samt Token zurueck — nur mit select.
    const treffer = [...quellen]
      .filter(([, quelle]) => /\bcontractEnd(Processes)?:\s*true\b/.test(quelle))
      .map(([datei]) => datei);
    expect(treffer).toEqual([]);
  });
});
