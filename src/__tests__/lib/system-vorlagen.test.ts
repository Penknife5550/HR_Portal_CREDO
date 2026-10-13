/**
 * Tests: System-Word-Vorlagen (A4, S33, G19, E-A34)
 *
 * Belegt werden:
 *  1. Die Liste `SYSTEM_VORLAGEN` (prisma/seed-check.js): jedes Asset liegt
 *     unter public/system-dokumente/, die Platzhalter der Liste sind genau die
 *     der Datei (`extractPlaceholders`), Uebergabeprotokoll AUS, Rueckgabe-
 *     protokoll AN bei der Anlage.
 *  2. Die beiden Ausstattungsprotokolle entsprechen dem Skript
 *     scripts/system-vorlagen/ausstattungsprotokolle.js und tragen nur feste
 *     Texte und Platzhalter (die Dateien sind unter public/ oeffentlich).
 *  3. Gerendert mit echten Listen (`ausgabenPlatzhalter`, `rueckgabenJeStelle`
 *     aus ausgaben.ts, `renderDocx` wie beim Erzeugen): zwei Stellen und drei
 *     Stuecke ergeben drei Tabellenzeilen und zwei Seitenumbrueche; eine leere
 *     Liste den Leersatz; kein inneres Feld faellt auf die Person zurueck.
 *  4. Kein innerer Name ist sensibel (keine Bestaetigungspflicht beim Versand).
 *  5. Der Seed-Check (`ensureSystemDocumentTemplates`) sucht ueber
 *     `{ isSystem, modul, originalName }` die AELTESTE EINGESCHALTETE Zeile
 *     (ohne eingeschaltete die aelteste): Eine Umbenennung durch HR legt kein
 *     Duplikat an, eine ausgeschaltete Vorlage bleibt aus, ein Duplikat aus dem
 *     alten Seed bleibt unberuehrt, wird gemeldet und nie geloescht. Ein
 *     deaktiviertes Duplikat gilt als bereinigt (keine Warnung; Brief-Vorlagen
 *     kennt kein Loeschen), und hat HR die aeltere Zeile abgeschaltet, bekommt
 *     die eingeschaltete den neuen Stand (Review A4d).
 *  6. Die Beschreibungen nennen keinen internen Paketnamen – HR sieht sie in
 *     Brief-Vorlagen, und „(A4)“ laese sich dort als Papierformat (Review A4d).
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import PizZip from "pizzip";
import { extractPlaceholders, renderDocx } from "@/lib/doc-templates";
import { sensiblePlatzhalter, istListenPlatzhalter } from "@/lib/placeholder-catalog";
import { ausgabenPlatzhalter, rueckgabenJeStelle } from "@/lib/ausgaben";

// Dank des `require.main === module`-Guards laden beide Dateien, ohne zu laufen.
const seedCheck = require("../../../prisma/seed-check.js");
const skript = require("../../../scripts/system-vorlagen/ausstattungsprotokolle.js");

interface SystemVorlage {
  datei: string;
  name: string;
  description: string;
  modul: string;
  originalName: string;
  platzhalter: string[];
  aktivBeiAnlage: boolean;
}

const SYSTEM_VORLAGEN: SystemVorlage[] = seedCheck.SYSTEM_VORLAGEN;
const ensureSystemDocumentTemplates: (prisma: unknown, vorlagen?: SystemVorlage[]) => Promise<void> =
  seedCheck.ensureSystemDocumentTemplates;

const ORDNER = join(process.cwd(), "public", "system-dokumente");
const asset = (datei: string) => readFileSync(join(ORDNER, datei));
const vorlage = (datei: string) => SYSTEM_VORLAGEN.find((v) => v.datei === datei)!;

const UEBERGABE = "uebergabeprotokoll-ausstattung.docx";
const RUECKGABE = "rueckgabeprotokoll-ausstattung.docx";

/** Text von word/document.xml ohne Markup (Absaetze durch \n getrennt). */
function text(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function documentXml(buf: Buffer): string {
  return new PizZip(buf).file("word/document.xml")!.asText();
}

/** Zeilen der Gegenstandstabellen (ohne Kopfzeile) im gerenderten Dokument. */
function gegenstandsZeilen(xml: string): string[] {
  const tabellen = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
  return tabellen
    .filter((t) => t.includes("<w:tblHeader/>"))
    .flatMap((t) => (t.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? []).filter((z) => !z.includes("<w:tblHeader/>")))
    .map((z) => text(z).replace(/\n/g, " | ").trim());
}

const anzahl = (xml: string, muster: string) => xml.split(muster).length - 1;

const PERSON = {
  vorname: "Erika",
  nachname: "Beispiel",
  mandant: "Freie Evangelische Grundschule",
  vorgangsnummer: "EIN-2027-GS-007",
  eintrittsdatum: "01.02.2027",
  letzter_arbeitstag: "31.07.2027",
};

// =============================================
// 1. Liste und Assets
// =============================================

describe("SYSTEM_VORLAGEN (prisma/seed-check.js)", () => {
  it("Fuehrungszeugnis und die beiden Ausstattungsprotokolle, je eindeutiger Suchschluessel", () => {
    expect(SYSTEM_VORLAGEN.map((v) => [v.modul, v.originalName])).toEqual([
      ["ONBOARDING", "Fuehrungszeugnis-Antrag.docx"],
      ["ONBOARDING", "Uebergabeprotokoll-Ausstattung.docx"],
      ["OFFBOARDING", "Rueckgabeprotokoll-Ausstattung.docx"],
    ]);
    expect(vorlage(UEBERGABE).name).toBe("Übergabeprotokoll Ausstattung");
    expect(vorlage(RUECKGABE).name).toBe("Rückgabeprotokoll Ausstattung");
  });

  it("Uebergabeprotokoll wird ausgeschaltet angelegt, Rueckgabeprotokoll und Fuehrungszeugnis eingeschaltet", () => {
    expect(SYSTEM_VORLAGEN.map((v) => [v.datei, v.aktivBeiAnlage])).toEqual([
      ["fuehrungszeugnis-antrag.docx", true],
      [UEBERGABE, false],
      [RUECKGABE, true],
    ]);
  });

  it.each(SYSTEM_VORLAGEN.map((v) => [v.datei, v] as const))("Asset %s existiert und ist eine .docx", (datei) => {
    expect(existsSync(join(ORDNER, datei))).toBe(true);
    expect(asset(datei).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it.each(SYSTEM_VORLAGEN.map((v) => [v.datei, v] as const))(
    "%s: extractPlaceholders entspricht den Platzhaltern der Liste",
    (datei, v) => {
      const sortiert = (l: string[]) => [...l].sort();
      expect(sortiert(extractPlaceholders(asset(datei)))).toEqual(sortiert(v.platzhalter));
    },
  );

  it("Beschreibungen ohne internen Paketnamen – sie stehen in Brief-Vorlagen vor HR", () => {
    for (const v of SYSTEM_VORLAGEN) {
      expect({ datei: v.datei, paket: /\((A|U|P)\d+[a-z]?\)|Paket\s*\d|Stufe\s*\d/.test(v.description) }).toEqual({
        datei: v.datei,
        paket: false,
      });
    }
    expect(vorlage(UEBERGABE).description).toContain("System-Vorlage (Ausstattung & Zugänge)");
    expect(vorlage(RUECKGABE).description).toContain("System-Vorlage (Ausstattung & Zugänge)");
  });

  it("keine System-Vorlage verlangt eine Bestaetigung beim Versand (kein sensibler Platzhalter)", () => {
    for (const v of SYSTEM_VORLAGEN) expect({ datei: v.datei, sensibel: sensiblePlatzhalter(v.platzhalter) }).toEqual({ datei: v.datei, sensibel: [] });
  });
});

// =============================================
// 2. Skript und Inhalt der Assets
// =============================================

describe("Ausstattungsprotokolle: Skript und Asset", () => {
  it.each([
    ["UEBERGABE", UEBERGABE],
    ["RUECKGABE", RUECKGABE],
  ])("%s: die eingecheckte Datei entspricht dem Skript (sonst: node scripts/system-vorlagen/ausstattungsprotokolle.js)", (art, datei) => {
    expect(skript.VORLAGEN[art].datei).toBe(datei);
    expect(documentXml(asset(datei))).toBe(skript.dokumentXml(art));
    // bytegleich je Lauf: festes Zip-Datum, feste Reihenfolge
    expect(skript.baueDocx(art).equals(asset(datei))).toBe(true);
  });

  it.each([UEBERGABE, RUECKGABE])("%s: nur feste Texte und Platzhalter – keine Daten (oeffentlich unter public/)", (datei) => {
    const ohneTags = text(documentXml(asset(datei))).replace(/\{[^{}]*\}/g, "");
    expect(ohneTags).not.toMatch(/\d/);
    expect(ohneTags).not.toMatch(/@/);
    // Jeder Platzhalter ist ein Name aus der Liste (keine Werte in Klammern).
    const tags = documentXml(asset(datei)).match(/\{[^{}]*\}/g) ?? [];
    for (const tag of tags) expect(tag).toMatch(/^\{[#^/]?[a-z_]+\}$/);
  });

  it("die inneren Namen der Vorlagen sind Listen-Platzhalter des Katalogs (kein Eingabefeld im Editor)", () => {
    const innen = ["ausgabe_gegenstand", "ausgabe_kennung", "ausgabe_stelle", "ausgabe_uebergeben_am", "gegenstaende",
      "rueckgabe_am", "rueckgabe_gegenstand", "rueckgabe_kennung", "rueckgabe_stelle", "rueckgabe_zustand"];
    for (const name of innen) expect({ name, liste: istListenPlatzhalter(name) }).toEqual({ name, liste: true });
    for (const v of [vorlage(UEBERGABE), vorlage(RUECKGABE)]) {
      const einfach = v.platzhalter.filter((p) => !istListenPlatzhalter(p));
      expect({ datei: v.datei, einfach }).toEqual({
        datei: v.datei,
        einfach: v.datei === UEBERGABE
          ? ["eintrittsdatum", "mandant", "nachname", "vorgangsnummer", "vorname"]
          : ["letzter_arbeitstag", "mandant", "nachname", "vorgangsnummer", "vorname"],
      });
    }
  });
});

// =============================================
// 3. Rendern mit echten Listen
// =============================================

describe("Uebergabeprotokoll gerendert", () => {
  const stueck = (teil: Record<string, unknown>) => ({
    departmentKey: "IT",
    bezeichnung: "Dienst-iPad (Lernmittel)",
    kennung: "FES-IPAD-0412",
    uebergebenAm: "2027-01-28",
    zustand: "AUSGEGEBEN",
    beiAustritt: "RUECKGABE",
    ...teil,
  });

  it("zwei Stellen, drei Stuecke: drei Tabellenzeilen, zwei Seitenumbrueche, jede Seite mit ihrer Stelle", () => {
    const werte = ausgabenPlatzhalter(
      [
        stueck({}),
        stueck({ bezeichnung: "Zugänge: Dienst-E-Mail", kennung: null, beiAustritt: "SPERREN", uebergebenAm: "2027-01-29" }),
        stueck({ departmentKey: "FACILITY", bezeichnung: "Schlüssel: Haupteingang", kennung: "GS-114", uebergebenAm: "2027-01-30" }),
      ],
      { FACILITY: "Hausmeister" },
    );
    const { buffer, missing } = renderDocx(asset(UEBERGABE), { ...PERSON, ...werte });
    const xml = documentXml(buffer);

    expect(gegenstandsZeilen(xml)).toEqual([
      "Dienst-iPad (Lernmittel) | FES-IPAD-0412 | 28.01.2027 |",
      "Zugänge: Dienst-E-Mail |  | 29.01.2027 |",
      "Schlüssel: Haupteingang | GS-114 | 30.01.2027 |",
    ]);
    expect(anzahl(xml, "<w:pageBreakBefore/>")).toBe(2);
    expect(missing).toEqual([]);

    const t = text(xml);
    expect(anzahl(t, "Übergabeprotokoll Ausstattung")).toBe(2);
    expect(t).toContain("Ausgebende Stelle: IT-Abteilung");
    expect(t).toContain("Ausgebende Stelle: Hausmeister");
    expect(t).toContain("Übergeben (Hausmeister)");
    // Im Inneren der Schleife faellt {vorname} bewusst auf die Person zurueck.
    expect(anzahl(t, "Erhalten (Erika Beispiel)")).toBe(2);
    expect(t).not.toContain("keine Übergabe vermerkt");
    // Keine Schleifen-Tags bleiben stehen.
    expect(t).not.toMatch(/[{}]/);
  });

  it("leere Liste: nur der Leersatz, keine Tabelle, kein Seitenumbruch", () => {
    const { buffer, missing } = renderDocx(asset(UEBERGABE), { ...PERSON, ...ausgabenPlatzhalter([], {}) });
    const xml = documentXml(buffer);
    const t = text(xml);
    expect(t).toContain("Für diesen Vorgang ist im Portal keine Übergabe vermerkt.");
    expect(t).toContain("Name: Erika Beispiel");
    expect(t).not.toContain("Ausgebende Stelle");
    expect(gegenstandsZeilen(xml)).toEqual([]);
    expect(anzahl(xml, "<w:pageBreakBefore/>")).toBe(0);
    expect(missing).toEqual([]);
  });

  it("ohne Liste (kein Vorgang): Leersatz statt einer leeren Seite – nur die Person fehlt als „___“", () => {
    const { buffer, missing } = renderDocx(asset(UEBERGABE), {});
    expect(text(documentXml(buffer))).toContain("keine Übergabe vermerkt");
    expect(missing).toEqual(["eintrittsdatum", "mandant", "nachname", "vorgangsnummer", "vorname"].sort((a, b) => a.localeCompare(b, "de")));
  });

  it("ein inneres Feld faellt nie auf einen gleichnamigen Wert der Person zurueck", () => {
    // Haette der Resolver ein inneres Feld weggelassen, griffe der Parser auf
    // den aeusseren Wert. `ausgabenPlatzhalter` setzt jedes Feld – auch leer.
    const werte = ausgabenPlatzhalter([stueck({ kennung: null })], {});
    const { buffer } = renderDocx(asset(UEBERGABE), {
      ...PERSON,
      ...werte,
      ausgabe_kennung: "AUSSEN-1",
      ausgabe_stelle: "AUSSEN-STELLE",
    });
    const t = text(documentXml(buffer));
    expect(t).not.toContain("AUSSEN");
  });
});

describe("Rueckgabeprotokoll gerendert", () => {
  it("je Stelle eine Seite, offene Zeilen mit leerem Zustand, Unterschriften Stelle/Person", () => {
    const liste = rueckgabenJeStelle(
      [
        { itemName: "Dienst-iPad (Lernmittel)", serialNumber: "FES-IPAD-0412", isReturned: true, returnedAt: "2027-07-31", zustand: "BESCHAEDIGT", departmentKey: "IT" },
        { itemName: "Notebook", serialNumber: null, isReturned: false, zustand: null, departmentKey: "IT" },
        { itemName: "Parkausweis", isReturned: false, zustand: "FEHLT", departmentKey: null },
      ],
      {},
    );
    const { buffer, missing } = renderDocx(asset(RUECKGABE), { ...PERSON, rueckgaben_je_stelle: liste });
    const xml = documentXml(buffer);
    expect(gegenstandsZeilen(xml)).toEqual([
      "Dienst-iPad (Lernmittel) | FES-IPAD-0412 | beschädigt zurück | 31.07.2027 |",
      "Notebook |  |  |  |",
      "Parkausweis |  | fehlt |  |",
    ]);
    expect(anzahl(xml, "<w:pageBreakBefore/>")).toBe(2);
    expect(missing).toEqual([]);
    const t = text(xml);
    expect(t).toContain("Zuständige Stelle: IT-Abteilung");
    expect(t).toContain("Zurückgenommen (Personalabteilung)");
    expect(anzahl(t, "Zurückgegeben (Erika Beispiel)")).toBe(2);
    expect(t).toContain("Letzter Arbeitstag: 31.07.2027");
  });

  it("leere Liste: der Leersatz", () => {
    const { buffer } = renderDocx(asset(RUECKGABE), { ...PERSON, rueckgaben_je_stelle: [] });
    const t = text(documentXml(buffer));
    expect(t).toContain("Für diesen Austritt sind im Portal keine Rückgaben erfasst.");
    expect(t).not.toContain("Zuständige Stelle");
  });
});

// =============================================
// 5. Seed-Check
// =============================================

describe("ensureSystemDocumentTemplates (Seed-Check)", () => {
  const PFAD = (datei: string) => join(process.cwd(), "public", "system-dokumente", datei);
  const HASH = (datei: string) => require("crypto").createHash("sha256").update(asset(datei)).digest("hex");

  function prismaErsatz(zeilenJeSchluessel: Record<string, Array<Record<string, unknown>>> = {}) {
    return {
      documentTemplate: {
        findMany: jest.fn(async ({ where }: { where: { originalName: string } }) => zeilenJeSchluessel[where.originalName] ?? []),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
  }

  /** Eine Zeile, wie der Seed sie fuer diese Vorlage aktuell schreiben wuerde (eingeschaltet). */
  function aktuelleZeile(v: SystemVorlage, teil: Record<string, unknown> = {}) {
    return {
      id: `id-${v.datei}`,
      hash: HASH(v.datei),
      dateipfad: PFAD(v.datei),
      platzhalter: [...v.platzhalter],
      isActive: true,
      ...teil,
    };
  }

  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let fehler: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, "log").mockImplementation(() => {});
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    fehler = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
    fehler.mockRestore();
  });

  it("leere Datenbank: legt alle drei an – Uebergabeprotokoll ausgeschaltet, ohne Mandant, als System-Vorlage", async () => {
    const p = prismaErsatz();
    await ensureSystemDocumentTemplates(p);
    expect(p.documentTemplate.create).toHaveBeenCalledTimes(3);
    const daten = p.documentTemplate.create.mock.calls.map((c) => c[0].data);
    const uebergabe = daten.find((d) => d.originalName === "Uebergabeprotokoll-Ausstattung.docx");
    expect(uebergabe).toEqual({
      name: "Übergabeprotokoll Ausstattung",
      description: vorlage(UEBERGABE).description,
      modul: "ONBOARDING",
      originalName: "Uebergabeprotokoll-Ausstattung.docx",
      dateipfad: PFAD(UEBERGABE),
      fileSize: asset(UEBERGABE).length,
      hash: HASH(UEBERGABE),
      platzhalter: vorlage(UEBERGABE).platzhalter,
      isSystem: true,
      organizationId: null,
      isActive: false,
    });
    expect(daten.find((d) => d.originalName === "Rueckgabeprotokoll-Ausstattung.docx")).toMatchObject({
      modul: "OFFBOARDING",
      isActive: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("sucht ueber { isSystem, modul, originalName }, die aelteste Zeile zuerst – nicht ueber den Namen", async () => {
    const p = prismaErsatz();
    await ensureSystemDocumentTemplates(p);
    expect(p.documentTemplate.findMany).toHaveBeenCalledWith({
      where: { isSystem: true, modul: "ONBOARDING", originalName: "Uebergabeprotokoll-Ausstattung.docx" },
      orderBy: { createdAt: "asc" },
      select: { id: true, hash: true, dateipfad: true, platzhalter: true, isActive: true },
    });
  });

  it("Umbenennung durch HR legt kein Duplikat an; eine aktuelle Zeile bleibt ganz unberuehrt", async () => {
    const v = vorlage(UEBERGABE);
    // Name gibt der Ersatz gar nicht zurueck – gesucht wird nicht danach.
    const p = prismaErsatz({ [v.originalName]: [aktuelleZeile(v)] });
    await ensureSystemDocumentTemplates(p, [v]);
    expect(p.documentTemplate.create).not.toHaveBeenCalled();
    expect(p.documentTemplate.update).not.toHaveBeenCalled();
  });

  it("neue Datei: aktualisiert nur Datei, Hash, Groesse und Platzhalter – eine ausgeschaltete Vorlage bleibt aus, Name und Mandant bleiben", async () => {
    const v = vorlage(RUECKGABE);
    const p = prismaErsatz({ [v.originalName]: [aktuelleZeile(v, { hash: "alt", platzhalter: ["vorname"] })] });
    await ensureSystemDocumentTemplates(p, [v]);
    expect(p.documentTemplate.update).toHaveBeenCalledTimes(1);
    expect(p.documentTemplate.update).toHaveBeenCalledWith({
      where: { id: `id-${v.datei}` },
      data: { dateipfad: PFAD(v.datei), fileSize: asset(v.datei).length, hash: HASH(v.datei), platzhalter: v.platzhalter },
    });
    expect(p.documentTemplate.create).not.toHaveBeenCalled();
  });

  it("zwei eingeschaltete Zeilen gleichen Schluessels (Altlast): die aeltere wird aktualisiert, die juengere bleibt, Warnung im Protokoll, nichts geloescht", async () => {
    const v = vorlage("fuehrungszeugnis-antrag.docx");
    const p = prismaErsatz({
      [v.originalName]: [
        aktuelleZeile(v, { id: "aelter", hash: "alt" }),
        aktuelleZeile(v, { id: "juenger", hash: "alt" }),
      ],
    });
    await ensureSystemDocumentTemplates(p, [v]);
    expect(p.documentTemplate.update).toHaveBeenCalledTimes(1);
    expect(p.documentTemplate.update.mock.calls[0][0].where).toEqual({ id: "aelter" });
    expect(p.documentTemplate.create).not.toHaveBeenCalled();
    expect(p.documentTemplate.delete).not.toHaveBeenCalled();
    expect(p.documentTemplate.deleteMany).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Duplikat der System-Vorlage Aufforderung erweitertes Führungszeugnis"));
    expect(warn.mock.calls[0][0]).toContain("bitte in Brief-Vorlagen bereinigen");
    expect(warn.mock.calls[0][0]).toContain("alle bis auf eine deaktivieren");
  });

  it("ein deaktiviertes Duplikat ist bereinigt: keine Warnung, die eingeschaltete Zeile bekommt den neuen Stand", async () => {
    const v = vorlage("fuehrungszeugnis-antrag.docx");
    const p = prismaErsatz({
      [v.originalName]: [
        aktuelleZeile(v, { id: "aelter", hash: "alt", isActive: true }),
        aktuelleZeile(v, { id: "juenger", hash: "alt", isActive: false }),
      ],
    });
    await ensureSystemDocumentTemplates(p, [v]);
    expect(warn).not.toHaveBeenCalled();
    expect(p.documentTemplate.update).toHaveBeenCalledTimes(1);
    expect(p.documentTemplate.update.mock.calls[0][0].where).toEqual({ id: "aelter" });
  });

  it("hat HR die aeltere Zeile abgeschaltet, bekommt die juengere (eingeschaltete) den neuen Stand – ohne Warnung", async () => {
    const v = vorlage("fuehrungszeugnis-antrag.docx");
    const p = prismaErsatz({
      [v.originalName]: [
        aktuelleZeile(v, { id: "aelter", hash: "alt", isActive: false }),
        aktuelleZeile(v, { id: "juenger", hash: "alt", isActive: true }),
      ],
    });
    await ensureSystemDocumentTemplates(p, [v]);
    expect(warn).not.toHaveBeenCalled();
    expect(p.documentTemplate.update).toHaveBeenCalledTimes(1);
    expect(p.documentTemplate.update.mock.calls[0][0].where).toEqual({ id: "juenger" });
    // Der Schalter bleibt, wie HR ihn gesetzt hat.
    expect(p.documentTemplate.update.mock.calls[0][0].data).not.toHaveProperty("isActive");
  });

  it("alle Zeilen ausgeschaltet (etwa das Uebergabeprotokoll vor dem Pilot): die aelteste bekommt den neuen Stand und bleibt aus", async () => {
    const v = vorlage(UEBERGABE);
    const p = prismaErsatz({
      [v.originalName]: [
        aktuelleZeile(v, { id: "aelter", hash: "alt", isActive: false }),
        aktuelleZeile(v, { id: "juenger", hash: "alt", isActive: false }),
      ],
    });
    await ensureSystemDocumentTemplates(p, [v]);
    expect(warn).not.toHaveBeenCalled();
    expect(p.documentTemplate.update).toHaveBeenCalledTimes(1);
    expect(p.documentTemplate.update.mock.calls[0][0].where).toEqual({ id: "aelter" });
    expect(p.documentTemplate.update.mock.calls[0][0].data).not.toHaveProperty("isActive");
    expect(p.documentTemplate.create).not.toHaveBeenCalled();
  });

  it("planeSystemVorlage: eine Zeile ohne isActive gilt als eingeschaltet (Verhalten vor Review A4d)", () => {
    const v = vorlage(UEBERGABE);
    const zeile = { id: "a", hash: "alt", dateipfad: PFAD(v.datei), platzhalter: [...v.platzhalter] };
    const plan = seedCheck.planeSystemVorlage(v, [zeile, { ...zeile, id: "b" }], {
      pfad: PFAD(v.datei),
      hash: HASH(v.datei),
      groesse: 1,
    });
    expect(plan).toMatchObject({ aktion: "AKTUALISIEREN", id: "a", duplikate: 1 });
  });

  it("ein Fehler bei einer Vorlage bricht weder die anderen noch den Start ab", async () => {
    const p = prismaErsatz();
    p.documentTemplate.findMany.mockRejectedValueOnce(new Error("Verbindung weg"));
    await expect(ensureSystemDocumentTemplates(p)).resolves.toBeUndefined();
    expect(p.documentTemplate.create).toHaveBeenCalledTimes(2);
    expect(fehler).toHaveBeenCalledWith(expect.stringContaining("System-Vorlage-Seed Fehler"), "Verbindung weg");
  });

  it("planeSystemVorlage: der Platzhalter-Vergleich achtet nicht auf die Reihenfolge", () => {
    const v = vorlage(UEBERGABE);
    const plan = seedCheck.planeSystemVorlage(
      v,
      [aktuelleZeile(v, { platzhalter: [...v.platzhalter].reverse() })],
      { pfad: PFAD(v.datei), hash: HASH(v.datei), groesse: 1 },
    );
    expect(plan).toEqual({ aktion: "AKTUELL", id: `id-${v.datei}`, duplikate: 0 });
  });
});
