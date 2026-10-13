/**
 * Waechter: ein einziger Schreiber fuer die Tabelle `ausgaben` (Feinplan A4, G3)
 *
 * Jede Zeile von `ausgaben` entsteht, aendert sich und verschwindet nur in
 * src/lib/ausgaben-schreiben.ts. Dort laeuft jeder Zustandswechsel ueber
 * `ausgabeZustandDaten` (src/lib/ausgaben.ts), das Zustand, Zeitpunkt und
 * Loeschfrist (E-A37) gemeinsam liefert – ein Schreibaufruf an anderer Stelle
 * koennte die Frist vergessen oder einen Zustand ohne Zeitstempel setzen.
 * Dasselbe Muster wie `zuweisungSenden` als einziger Schreiber der Link-Zeile.
 *
 * DIE REGEL: In `src/` (ohne `__tests__` – Tests lesen die Fake-Tabelle und
 * pruefen Aufrufe, sie schreiben keine Produktionsdaten) steht ein
 * Schreibaufruf auf das Prisma-Modell `ausgabe` (create, createMany,
 * createManyAndReturn, update, updateMany, updateManyAndReturn, upsert,
 * delete, deleteMany) nur in src/lib/ausgaben-schreiben.ts. Ebenso rohes SQL,
 * das in die Tabelle `ausgaben` schreibt. Lesen (findMany, findFirst, count …)
 * ist ueberall erlaubt. Zeilen, die mit `*` oder `//` beginnen, sind
 * Kommentare und zaehlen nicht.
 */
import { readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";

const SRC = join(__dirname, "..", "..");
const SCHREIBER = "lib/ausgaben-schreiben.ts";

const SCHREIBAUFRUF =
  /\.ausgabe\s*\.\s*(?:createManyAndReturn|createMany|create|updateManyAndReturn|updateMany|update|upsert|deleteMany|delete)\s*\(/g;
const ROHES_SQL = /\b(?:insert\s+into|update|delete\s+from)\s+"?ausgaben"?(?=[\s"(]|$)/gi;

/** Treffer in einem Quelltext, ohne Kommentarzeilen. */
function schreibstellen(text: string): string[] {
  const treffer: string[] = [];
  for (const zeile of text.split(/\r?\n/)) {
    const t = zeile.trimStart();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
    for (const m of zeile.matchAll(SCHREIBAUFRUF)) treffer.push(m[0].replace(/\s+/g, ""));
    for (const m of zeile.matchAll(ROHES_SQL)) treffer.push(m[0]);
  }
  return treffer;
}

function quelltexte(verzeichnis: string): string[] {
  const dateien: string[] = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    if (eintrag.name === "__tests__" || eintrag.name === "node_modules") continue;
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) dateien.push(...quelltexte(pfad));
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(eintrag.name)) dateien.push(pfad);
  }
  return dateien;
}

const relativ = (pfad: string) => relative(SRC, pfad).split(sep).join("/");

describe("Waechter G3: Erkennung", () => {
  it.each([
    ["await tx.ausgabe.create({ data })", 1],
    ["await prisma.ausgabe.createMany({ data: [] })", 1],
    ["db.ausgabe . updateMany ({ where })", 1],
    ["tx.ausgabe.update({ where: { id } })", 1],
    ["tx.ausgabe.upsert({})", 1],
    ["tx.ausgabe.delete({ where: { id } })", 1],
    ["tx.ausgabe.deleteMany({})", 1],
    ["tx.ausgabe.createManyAndReturn({ data: [] })", 1],
    ['await tx.$executeRaw`UPDATE "ausgaben" SET kennung = NULL`', 1],
    ["await tx.$executeRaw`delete from ausgaben where id = 1`", 1],
    ["await tx.$executeRaw`INSERT INTO ausgaben (id) VALUES (1)`", 1],
    // Lesen ist erlaubt.
    ["await tx.ausgabe.findMany({ where })", 0],
    ["await tx.ausgabe.findFirst({ where })", 0],
    ["await tx.ausgabe.count({ where })", 0],
    // Andere Modelle mit aehnlichem Namen.
    ["await tx.ausgabeVorlage.create({})", 0],
    ["await tx.onboardingAusstattung.update({})", 0],
    // Kommentare zaehlen nicht.
    ["// tx.ausgabe.create({}) war frueher hier", 0],
    [" * tx.ausgabe.deleteMany({}) im Lauf", 0],
  ])("%s → %i", (text, anzahl) => {
    expect(schreibstellen(text)).toHaveLength(anzahl);
  });
});

describe("Waechter G3: nur ausgaben-schreiben.ts schreibt die Tabelle `ausgaben`", () => {
  const dateien = quelltexte(SRC);

  it("findet die Quelltexte (Plausibilitaet)", () => {
    expect(dateien.length).toBeGreaterThan(100);
    expect(dateien.map(relativ)).toContain(SCHREIBER);
  });

  it("der Schreiber schreibt selbst (sonst prueft der Waechter ins Leere)", () => {
    const eigene = schreibstellen(readFileSync(join(SRC, SCHREIBER), "utf8"));
    expect(eigene.some((t) => t.startsWith(".ausgabe.create"))).toBe(true);
    expect(eigene.some((t) => t.startsWith(".ausgabe.updateMany"))).toBe(true);
    expect(eigene.some((t) => t.startsWith(".ausgabe.deleteMany"))).toBe(true);
  });

  it("keine Datei ausserhalb von ausgaben-schreiben.ts schreibt `ausgaben`", () => {
    const fremd: string[] = [];
    for (const datei of dateien) {
      const name = relativ(datei);
      if (name === SCHREIBER) continue;
      for (const t of schreibstellen(readFileSync(datei, "utf8"))) fremd.push(`${name}: ${t}`);
    }
    expect(fremd).toEqual([]);
  });
});
