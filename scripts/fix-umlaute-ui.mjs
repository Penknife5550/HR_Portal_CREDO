/**
 * Codemod: Umlaut-Vereinheitlichung in UI-Strings (CREDO HR-Portal, Task P1)
 *
 * Ersetzt deutsche Ersatzschreibweisen (oe/ae/ue/ss) durch echte Umlaute —
 * ABER nur als GANZE WOERTER (\bWort\b). Dadurch bleiben camelCase-Identifier
 * (z.B. dokumentLoeschen, bemerkungVerguetung, getNaechsterSchritt) unangetastet,
 * weil dort keine Wortgrenze vor/nach dem Teilwort liegt.
 *
 * CLAUDE.md: Keine Umlaute in Variablen-/Funktionsnamen — nur in UI-Strings.
 * Das Wortgrenzen-Matching stellt genau das sicher.
 *
 * Aufruf:
 *   node scripts/fix-umlaute-ui.mjs           # Dry-Run (zeigt nur Aenderungen)
 *   node scripts/fix-umlaute-ui.mjs --apply   # schreibt Aenderungen
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();

// Wortliste: NUR eindeutige Anzeige-Woerter. Jede Flexionsform einzeln,
// da \b nur am echten Wortende greift (endgueltig != endgueltige).
const WORDS = {
  // Fragebogen / Personaldaten
  Persoenliche: "Persönliche", persoenliche: "persönliche",
  Persoenlich: "Persönlich", persoenlich: "persönlich",
  Staatsangehoerigkeit: "Staatsangehörigkeit",
  Religionszugehoerigkeit: "Religionszugehörigkeit",
  Zugehoerigkeit: "Zugehörigkeit",
  Hoechster: "Höchster", Hoechste: "Höchste", Hoechsten: "Höchsten",
  Jaehrlicher: "Jährlicher", Jaehrliche: "Jährliche", jaehrlich: "jährlich",
  // Vertrag / Verguetung / Schluessel
  Verguetung: "Vergütung", Verguetungsmodell: "Vergütungsmodell",
  Schluessel: "Schlüssel",
  // Aktionen / Begriffe
  Loeschen: "Löschen", loeschen: "löschen",
  Zurueck: "Zurück", zurueck: "zurück", zurueckfordern: "zurückfordern",
  gemaess: "gemäß", Gemaess: "Gemäß",
  ungueltig: "ungültig",
  // Praepositionen / haeufige Woerter (nur als ganzes Wort; trifft NICHT
  // "Uebersicht", "ueberfaellig" o.ae. da dort keine Wortgrenze liegt)
  fuer: "für", ueber: "über", Ueberblick: "Überblick",
  // vorlaeufig (alle Flexionen)
  vorlaeufig: "vorläufig", vorlaeufige: "vorläufige",
  vorlaeufigen: "vorläufigen", vorlaeufiger: "vorläufiger",
  Vorlaeufig: "Vorläufig", Vorlaeufige: "Vorläufige",
  Vorlaeufigen: "Vorläufigen", Vorlaeufiger: "Vorläufiger",
  Erklaerung: "Erklärung", Erklaerungen: "Erklärungen",
  Aufloesung: "Auflösung",
  Begruessung: "Begrüßung", Begruessungs: "Begrüßungs",
  Massnahme: "Maßnahme", Massnahmen: "Maßnahmen",
  Gebaeude: "Gebäude",
  erhaelt: "erhält", erhaeltlich: "erhältlich",
  auszufuellen: "auszufüllen", ausfuellen: "ausfüllen",
  // endgueltig (alle Flexionen)
  endgueltig: "endgültig", endgueltige: "endgültige",
  endgueltigen: "endgültigen", endgueltiger: "endgültiger",
  endgueltiges: "endgültiges",
  Endgueltig: "Endgültig", Endgueltige: "Endgültige",
  Endgueltigen: "Endgültigen", Endgueltiger: "Endgültiger",
};

// Dateien sammeln
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "__tests__", "dist", "build"]);
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(p);
    } else if ([".ts", ".tsx"].includes(extname(p))) {
      files.push(p);
    }
  }
}
walk(join(ROOT, "src"));
walk(join(ROOT, "prisma"));

// Regex: alle Woerter alterniert, mit Wortgrenzen. Laengste zuerst.
const keys = Object.keys(WORDS).sort((a, b) => b.length - a.length);
const re = new RegExp(`\\b(${keys.join("|")})\\b`, "g");

let totalChanges = 0;
let changedFiles = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  let fileChanges = 0;
  const out = lines.map((line, i) => {
    const replaced = line.replace(re, (m) => WORDS[m] ?? m);
    if (replaced !== line) {
      fileChanges++;
      console.log(`  ${file.replace(ROOT, ".")}:${i + 1}`);
      console.log(`    - ${line.trim()}`);
      console.log(`    + ${replaced.trim()}`);
    }
    return replaced;
  });
  if (fileChanges > 0) {
    changedFiles++;
    totalChanges += fileChanges;
    if (APPLY) writeFileSync(file, out.join("\n"), "utf8");
  }
}

console.log(
  `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${totalChanges} Zeilen in ${changedFiles} Dateien` +
    (APPLY ? " geaendert." : " wuerden geaendert. Mit --apply ausfuehren."),
);
