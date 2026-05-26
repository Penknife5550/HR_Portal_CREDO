/**
 * Daten-Migration: Umlaut-Vereinheitlichung in persistierten Formular-Konfigs
 * (CREDO HR-Portal, Task P1 — Teil 2).
 *
 * Korrigiert die Umlaut-Schreibweise in bereits gespeicherten JSON-Feldern, damit
 * auch ALTE Vorgaenge/Vorlagen korrekte Umlaute in Schritt-Titeln und Feld-Labels
 * anzeigen:
 *   - FormTemplate.stepsConfig          (Vorlagen-Definition)
 *   - OnboardingProcess.formTemplateSnapshot (Snapshot zum Anlage-Zeitpunkt)
 *
 * Ersetzt NUR die `title`- und `label`-Strings (Anzeige-Text), niemals `name`
 * (DB-Feldname) oder andere Schluessel.
 *
 * Idempotent: mehrfaches Ausfuehren ist unschaedlich.
 *
 * Aufruf (lokal):
 *   node scripts/migrate-umlaute-templates.mjs            # Dry-Run
 *   node scripts/migrate-umlaute-templates.mjs --apply    # schreibt
 *
 * Im Docker-Container (prod), nachdem das Image die Datei enthaelt:
 *   node scripts/migrate-umlaute-templates.mjs --apply
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Gleiche Ersetzungen wie der UI-Codemod, plus label-spezifische Faelle (Strasse).
// Ganzes-Wort-Ersetzung schuetzt vor Teiltreffern.
const WORDS = {
  Persoenliche: "Persönliche", Persoenlich: "Persönlich",
  Staatsangehoerigkeit: "Staatsangehörigkeit",
  Religionszugehoerigkeit: "Religionszugehörigkeit",
  Hoechster: "Höchster", Hoechste: "Höchste", Hoechsten: "Höchsten",
  Jaehrlicher: "Jährlicher", Jaehrliche: "Jährliche",
  Strasse: "Straße",
  Verguetung: "Vergütung",
  Schluessel: "Schlüssel",
  Beschaeftigung: "Beschäftigung",
};
const keys = Object.keys(WORDS).sort((a, b) => b.length - a.length);
const re = new RegExp(`\\b(${keys.join("|")})\\b`, "g");

function fixText(s) {
  if (typeof s !== "string") return s;
  return s.replace(re, (m) => WORDS[m] ?? m);
}

/** Wendet die Ersetzung auf title + fields[].label eines stepsConfig-Arrays an. */
function fixStepsConfig(config) {
  if (!Array.isArray(config)) return { config, changed: false };
  let changed = false;
  const next = config.map((step) => {
    const s = { ...step };
    if (typeof s.title === "string") {
      const t = fixText(s.title);
      if (t !== s.title) { s.title = t; changed = true; }
    }
    if (Array.isArray(s.fields)) {
      s.fields = s.fields.map((f) => {
        if (f && typeof f.label === "string") {
          const l = fixText(f.label);
          if (l !== f.label) { changed = true; return { ...f, label: l }; }
        }
        return f;
      });
    }
    return s;
  });
  return { config: next, changed };
}

async function main() {
  let tplChanged = 0;
  const templates = await prisma.formTemplate.findMany({
    select: { id: true, questionnaireType: true, stepsConfig: true },
  });
  for (const tpl of templates) {
    const { config, changed } = fixStepsConfig(tpl.stepsConfig);
    if (changed) {
      tplChanged++;
      console.log(`  FormTemplate ${tpl.questionnaireType} (${tpl.id}) — Labels/Titel korrigiert`);
      if (APPLY) {
        await prisma.formTemplate.update({ where: { id: tpl.id }, data: { stepsConfig: config } });
      }
    }
  }

  let snapChanged = 0;
  const onboardings = await prisma.onboardingProcess.findMany({
    where: { formTemplateSnapshot: { not: null } },
    select: { id: true, displayId: true, formTemplateSnapshot: true },
  });
  for (const ob of onboardings) {
    const { config, changed } = fixStepsConfig(ob.formTemplateSnapshot);
    if (changed) {
      snapChanged++;
      console.log(`  OnboardingProcess ${ob.displayId ?? ob.id} — Snapshot korrigiert`);
      if (APPLY) {
        await prisma.onboardingProcess.update({ where: { id: ob.id }, data: { formTemplateSnapshot: config } });
      }
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${tplChanged} Vorlagen + ${snapChanged} Snapshots` +
      (APPLY ? " aktualisiert." : " wuerden aktualisiert. Mit --apply ausfuehren."),
  );
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
