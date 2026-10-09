/**
 * Waechter: prisma/seed.ts legt nur an, was fehlt.
 *
 * Bis 10/2026 setzte jeder Seed-Lauf Mandantennamen, Fragebogen-Schritte,
 * Checklisten, Exit-Interview-, Zeugnis- und Beurteilungsvorlagen auf den Stand
 * des Quelltexts zurueck — Checklisten-Punkte geloescht und neu angelegt
 * (`ChecklistItem.templateItemId` laufender Vorgaenge zeigte danach ins Leere),
 * Zeugnisvorlagen samt der von HR gepflegten Formulierungen geloescht. Und
 * CLAUDE.md empfahl `node prisma/seed.js` auf dem Produktionsserver.
 *
 * Der Test liest seed.ts als Text, ohne Kommentare und ohne den Inhalt von
 * Zeichenketten, und verlangt:
 *   - kein `update`, `updateMany`, `delete`, `deleteMany` und kein rohes SQL —
 *     weder `$executeRaw(Unsafe)` noch `$queryRaw(Unsafe)` (unter PostgreSQL
 *     fuehrt auch `$queryRaw` ein `UPDATE … RETURNING` aus, und rohes SQL ginge
 *     an dieser Pruefung vorbei) — auf keinem Objekt, der Seed braucht keins
 *     davon;
 *   - jedes `upsert` mit `update: {}` und keinem anderen `update`.
 *
 * Wer Bestehendes aendern muss, schreibt eine einmalige Datenmigration in
 * `prisma/seed-check.js` (Merker `SystemMigration`) — nicht in den Seed.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SEED = join(__dirname, "..", "..", "..", "prisma", "seed.ts");

const GRUND =
  "prisma/seed.ts darf nur anlegen, was fehlt — HR pflegt diese Daten in der Oberflaeche; " +
  "Aenderungen am Bestand gehoeren als einmalige Migration nach prisma/seed-check.js";

/**
 * Ersetzt Kommentare und den Inhalt von Zeichenketten durch Leerzeichen.
 * Zeilenumbrueche und Positionen bleiben, damit die Zeilennummern der Meldung
 * auf die Datei passen. `${ … }` in Template-Literalen bleibt Code (Stapel der
 * offenen Klammern je Ebene) — ein Aufruf dort wuerde also gefunden.
 */
function nurCode(text: string): string {
  const aus = text.split("");
  const leeren = (von: number, bis: number) => {
    for (let k = von; k < bis; k++) if (aus[k] !== "\n") aus[k] = " ";
  };
  const stapel: number[] = [];
  let i = 0;
  while (i < text.length) {
    const z = text[i];
    const n = text[i + 1];
    if (z === "/" && (n === "/" || n === "*")) {
      const ende = n === "/" ? text.indexOf("\n", i) : text.indexOf("*/", i + 2);
      const bis = ende < 0 ? text.length : n === "/" ? ende : ende + 2;
      leeren(i, bis);
      i = bis;
      continue;
    }
    if (z === '"' || z === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== z && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      leeren(i + 1, j);
      i = j + 1;
      continue;
    }
    if (z === "`" || (z === "}" && stapel.length > 0 && stapel[stapel.length - 1] === 0)) {
      if (z === "}") stapel.pop();
      let j = i + 1;
      while (j < text.length && text[j] !== "`" && !(text[j] === "$" && text[j + 1] === "{")) {
        j += text[j] === "\\" ? 2 : 1;
      }
      leeren(i + 1, j);
      if (text[j] === "$") {
        stapel.push(0);
        i = j + 2;
      } else {
        i = j + 1;
      }
      continue;
    }
    if (stapel.length > 0 && z === "{") stapel[stapel.length - 1] += 1;
    if (stapel.length > 0 && z === "}") stapel[stapel.length - 1] -= 1;
    i += 1;
  }
  return aus.join("");
}

function zeile(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

const AENDERNDE_AUFRUFE =
  /\.\s*(updateMany|update|deleteMany|delete|\$executeRawUnsafe|\$executeRaw|\$queryRawUnsafe|\$queryRaw)\s*[(`]/g;

/** Jeder Aufruf, der vorhandene Zeilen aendern oder loeschen kann. */
function aenderndeAufrufe(code: string): string[] {
  return [...code.matchAll(AENDERNDE_AUFRUFE)].map((m) =>
    m[1].startsWith("$")
      ? `Zeile ${zeile(code, m.index)}: .${m[1]} — rohes SQL kann vorhandene Zeilen aendern oder loeschen`
      : `Zeile ${zeile(code, m.index)}: .${m[1]} aendert oder loescht vorhandene Zeilen`,
  );
}

/** Jedes `upsert`, dessen `update` nicht leer ist (oder fehlt). */
function upsertsMitAenderung(code: string): string[] {
  const meldungen: string[] = [];
  for (const m of code.matchAll(/\.\s*upsert\s*\(/g)) {
    const start = m.index + m[0].length;
    let tiefe = 1;
    let j = start;
    while (j < code.length && tiefe > 0) {
      if (code[j] === "(") tiefe += 1;
      if (code[j] === ")") tiefe -= 1;
      j += 1;
    }
    const argument = code.slice(start, j - 1);
    const alle = [...argument.matchAll(/\bupdate\b/g)].length;
    const leer = [...argument.matchAll(/\bupdate\s*:\s*\{\s*\}/g)].length;
    if (alle === 0 || alle !== leer) {
      meldungen.push(`Zeile ${zeile(code, m.index)}: upsert ohne \`update: {}\` ueberschreibt eine vorhandene Zeile`);
    }
  }
  return meldungen;
}

describe("Waechter selbst", () => {
  it("findet aendernde Aufrufe, auch ueber Zeilen und als rohes SQL", () => {
    const code = nurCode(
      [
        "await prisma.organization.update({ where, data });",
        "await prisma.checklistTemplateItem",
        "  .deleteMany({ where });",
        "await tx.user.updateMany({});",
        "await prisma.$executeRaw`DELETE FROM users`;",
        "await prisma.zeugnisBewertungTemplate.delete({ where });",
        "await prisma.$queryRaw`UPDATE organizations SET name = 'x' RETURNING id`;",
        'await prisma.$queryRawUnsafe("DELETE FROM organizations");',
        'await prisma.$executeRawUnsafe("DELETE FROM users");',
      ].join("\n"),
    );
    expect(aenderndeAufrufe(code)).toEqual([
      "Zeile 1: .update aendert oder loescht vorhandene Zeilen",
      "Zeile 3: .deleteMany aendert oder loescht vorhandene Zeilen",
      "Zeile 4: .updateMany aendert oder loescht vorhandene Zeilen",
      "Zeile 5: .$executeRaw — rohes SQL kann vorhandene Zeilen aendern oder loeschen",
      "Zeile 6: .delete aendert oder loescht vorhandene Zeilen",
      "Zeile 7: .$queryRaw — rohes SQL kann vorhandene Zeilen aendern oder loeschen",
      "Zeile 8: .$queryRawUnsafe — rohes SQL kann vorhandene Zeilen aendern oder loeschen",
      "Zeile 9: .$executeRawUnsafe — rohes SQL kann vorhandene Zeilen aendern oder loeschen",
    ]);
  });

  it("uebergeht Kommentare und Zeichenketten, nicht aber Code in `${ … }`", () => {
    const code = nurCode(
      [
        "// prisma.organization.update({})",
        "/* prisma.user.delete({}) */",
        'console.log("vorher .update( und .delete(");',
        "console.log(`nur Text .deleteMany( ${'.update('}`);",
        "console.log(`${await prisma.user.delete({ where: { id: `${x}` } })}`);",
      ].join("\n"),
    );
    expect(aenderndeAufrufe(code)).toEqual(["Zeile 5: .delete aendert oder loescht vorhandene Zeilen"]);
  });

  it("laesst nur upsert mit `update: {}` durch", () => {
    const code = nurCode(
      [
        "await prisma.user.upsert({ where, update: {}, create: { name: \"update: {}\" } });",
        "await prisma.organization.upsert({",
        "  where: { mandantNumber },",
        "  update: { name: org.name },",
        "  create: org,",
        "});",
        "await prisma.formTemplate.upsert({ where, update, create });",
        "await prisma.user.upsert({ where, create: { a: fn(1) } });",
      ].join("\n"),
    );
    expect(upsertsMitAenderung(code)).toEqual([
      "Zeile 2: upsert ohne `update: {}` ueberschreibt eine vorhandene Zeile",
      "Zeile 7: upsert ohne `update: {}` ueberschreibt eine vorhandene Zeile",
      "Zeile 8: upsert ohne `update: {}` ueberschreibt eine vorhandene Zeile",
    ]);
  });
});

describe("prisma/seed.ts legt nur an, was fehlt", () => {
  const code = nurCode(readFileSync(SEED, "utf8"));

  it("liest wirklich Code (nicht alles weggeleert)", () => {
    expect(code).toContain(".create(");
    expect(code).toContain("findUnique(");
  });

  it(`kein update/delete auf vorhandenen Zeilen — ${GRUND}`, () => {
    expect(aenderndeAufrufe(code)).toEqual([]);
  });

  it(`jedes upsert mit \`update: {}\` — ${GRUND}`, () => {
    expect(upsertsMitAenderung(code)).toEqual([]);
  });
});
