/**
 * Prueft ob die Datenbank bereits geseeded wurde + stellt System-Vorlagen sicher.
 * Wird im Docker-Entrypoint bei jedem Start aufgerufen.
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Idempotentes Seeding der System-Dokumentvorlagen (z.B. Fuehrungszeugnis-Antrag).
 * Die Quelldatei liegt als committetes Asset unter public/system-dokumente/ und
 * wird ins Prod-Image kopiert (Dockerfile COPY public). Bei Inhaltsaenderung
 * (Hash) wird der Eintrag aktualisiert. Platzhalter sind bekannt (feste Vorlage),
 * daher keine docx-Parsing-Abhaengigkeit noetig.
 * Nicht-kritisch: Fehler werden geloggt, brechen den Start NICHT ab.
 */
async function ensureSystemDocumentTemplates(prisma) {
  try {
    const assetPath = path.join(
      process.cwd(),
      "public",
      "system-dokumente",
      "fuehrungszeugnis-antrag.docx",
    );
    if (!fs.existsSync(assetPath)) {
      console.log("System-Vorlage (Fuehrungszeugnis) Asset fehlt — uebersprungen.");
      return;
    }
    const buf = fs.readFileSync(assetPath);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    const name = "Aufforderung erweitertes Führungszeugnis";
    const data = {
      name,
      description:
        "Anschreiben an die Lehrkraft (§ 30a BZRG) — editierbare System-Vorlage",
      modul: "ONBOARDING",
      dateipfad: assetPath,
      originalName: "Fuehrungszeugnis-Antrag.docx",
      fileSize: buf.length,
      hash,
      platzhalter: ["anrede", "vorname", "nachname", "strasse", "plz", "ort"],
      isSystem: true,
      organizationId: null,
      isActive: true,
    };
    const existing = await prisma.documentTemplate.findFirst({
      where: { name, modul: "ONBOARDING" },
      select: { id: true, hash: true, dateipfad: true },
    });
    if (!existing) {
      await prisma.documentTemplate.create({ data });
      console.log("System-Vorlage (Fuehrungszeugnis) angelegt.");
    } else if (existing.hash !== hash || existing.dateipfad !== assetPath) {
      await prisma.documentTemplate.update({ where: { id: existing.id }, data });
      console.log("System-Vorlage (Fuehrungszeugnis) aktualisiert.");
    } else {
      console.log("System-Vorlage (Fuehrungszeugnis) ist aktuell.");
    }
  } catch (error) {
    console.error("System-Vorlage-Seed Fehler (nicht kritisch):", error.message);
  }
}

// =============================================
// Merker fuer einmalige Datenmigrationen
//
// Bewusst eine eigene Tabelle und kein AuditLog-Eintrag: Ein Log ist etwas,
// das man aufraeumt. Laeuft eine nicht idempotente Migration ein zweites Mal,
// verschiebt sie Daten erneut.
// =============================================
/** Ist diese Migration schon gelaufen? */
async function migrationErledigt(prisma, name) {
  const treffer = await prisma.systemMigration.findUnique({
    where: { name },
    select: { id: true },
  });
  return Boolean(treffer);
}

/** Schreiboperation, die eine Migration als erledigt markiert. */
function markiereMigration(prisma, name, details) {
  return prisma.systemMigration.create({ data: { name, details } });
}

/**
 * Einmalige Datenmigration: PersonalData.currentStep von der Anzeigeposition
 * auf die Registry-Schrittnummer umstellen (AP 1, Renderer-Entkopplung).
 *
 * Vorher speicherte die Spalte die **0-basierte Anzeigeposition** in der fest
 * verdrahteten Reihenfolge des alten Renderers. Weil dieser die Vorlagen-
 * Konfiguration ignoriert hat, galt diese Reihenfolge fuer alle Vorlagen
 * gleichermassen — die Abbildung ist deshalb eindeutig.
 *
 * Ohne die Migration wuerden laufende Vorgaenge an der falschen Stelle wieder
 * einsteigen, sobald der Renderer die Registry-Nummer interpretiert.
 *
 * Muss mit LEGACY_DISPLAY_ORDER in src/lib/fragebogen-steps.ts uebereinstimmen.
 * Hier als reines JS dupliziert, weil im Container kein tsx verfuegbar ist.
 *
 * Idempotenz: Ein Eintrag in `system_migrations` dient als Merker. Er wird in
 * derselben Transaktion geschrieben wie die Updates — entweder beides oder
 * nichts. Ein zweiter Lauf ohne Merker wuerde die Werte erneut verschieben
 * (6 wird zu 8, dann zu 10), deshalb liegt der Merker in einer eigenen Tabelle
 * und nicht im AuditLog: Logs werden aufgeraeumt, Migrationsmerker nicht.
 */
const CURRENT_STEP_MIGRATION_MARKER = "CURRENT_STEP_REGISTRY_V1";

const LEGACY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 8, 9, 10];

function legacyIndexToStepNumber(legacyIndex) {
  // Unterhalb des Bereichs auf den ersten Schritt, oberhalb auf den letzten.
  // Ohne die untere Grenze landete ein negativer Wert bei der Zusammenfassung.
  if (legacyIndex < 0) return LEGACY_DISPLAY_ORDER[0];
  const mapped = LEGACY_DISPLAY_ORDER[legacyIndex];
  if (mapped !== undefined) return mapped;
  return LEGACY_DISPLAY_ORDER[LEGACY_DISPLAY_ORDER.length - 1];
}

async function migrateCurrentStepToRegistryNumbers(prisma) {
  try {
    if (await migrationErledigt(prisma, CURRENT_STEP_MIGRATION_MARKER)) return;

    const rowCount = await prisma.personalData.count();
    if (rowCount === 0) {
      // Frische Datenbank: nichts zu migrieren, Merker trotzdem setzen.
      await markiereMigration(prisma, CURRENT_STEP_MIGRATION_MARKER, {
        migrated: 0,
        reason: "keine PersonalData-Datensaetze",
      });
      console.log("currentStep-Migration: keine Datensaetze, Merker gesetzt.");
      return;
    }

    // Hoechste Quellwerte zuerst. Jedes Ziel liegt >= Quelle, deshalb ist beim
    // Bearbeiten von Wert s garantiert noch nichts nach s hineingeschoben worden.
    const sources = [];
    for (let i = 10; i >= 0; i--) sources.push(i);

    const updates = [];
    for (const from of sources) {
      const to = legacyIndexToStepNumber(from);
      if (to === from) continue;
      updates.push(
        prisma.personalData.updateMany({
          where: { currentStep: from },
          data: { currentStep: to },
        }),
      );
    }

    const results = await prisma.$transaction([
      ...updates,
      markiereMigration(prisma, CURRENT_STEP_MIGRATION_MARKER, {
        rowCount,
        mapping: LEGACY_DISPLAY_ORDER,
      }),
    ]);

    const changed = results
      .slice(0, updates.length)
      .reduce((sum, r) => sum + (r.count || 0), 0);
    console.log(
      "currentStep-Migration: " + changed + " von " + rowCount + " Datensaetzen umgestellt.",
    );
  } catch (error) {
    // Nicht-kritisch fuer den Start, aber laut: ohne Migration steigen laufende
    // Vorgaenge an der falschen Stelle ein.
    console.error("currentStep-Migration fehlgeschlagen:", error.message);
  }
}

/**
 * Einmalige Korrektur der MINIJOB-Formularvorlage (AP 1, Entscheidung 8 und
 * Entscheidung vom 25.08.2026).
 *
 * Bis AP 1 hat der Renderer die Vorlagen-Konfiguration ignoriert. In der
 * Datenbank steht fuer MINIJOB deshalb bis heute ein Stand, der nie gewirkt
 * hat — unter anderem "Steuer: aus". Sobald die Konfiguration wirkt, wuerde
 * damit die **Steuer-ID** aus dem Minijob-Fragebogen verschwinden, obwohl die
 * Checkliste der Minijob-Zentrale sie ausdruecklich verlangt.
 *
 * Diese Korrektur bringt die Vorlage auf denselben Zielzustand, den der Seed
 * fuer eine frische Datenbank erzeugt:
 *   - Steuer (5) an, aber auf die Steuer-ID reduziert
 *   - Weitere Beschaeftigung (6) an — die Beitragsverfahrensverordnung
 *     verlangt genau diese Erklaerung
 *   - Bildung & Beruf (8) an — der Taetigkeitsschluessel der Meldung zur
 *     Sozialversicherung verlangt Schulabschluss und Berufsausbildung auch
 *     bei geringfuegig Beschaeftigten
 *   - Masernschutz (9) bleibt unveraendert (aus)
 *
 * Bewusst **keine** Rundum-Ueberschreibung: Nur diese drei Schritte werden
 * angefasst, alle uebrigen Einstellungen und alle anderen Vorlagen bleiben so,
 * wie HR sie gepflegt hat. Laeuft genau einmal (AuditLog-Marker) und nur, wenn
 * sich tatsaechlich etwas aendert.
 */
const MINIJOB_TEMPLATE_MARKER = "MINIJOB_TEMPLATE_STEPS_V1";

// Muss zu FIELD_REGISTRY[5] in src/lib/field-definitions.ts passen.
// Der Test src/__tests__/lib/fragebogen-steps.test.ts prueft das.
const MINIJOB_TAX_FIELDS = [
  { name: "taxId", label: "Steuer-ID", visible: true, required: true },
  { name: "taxClass", label: "Steuerklasse", visible: false, required: false },
  { name: "taxAllowance", label: "Jährlicher Freibetrag", visible: false, required: false },
  { name: "childAllowance", label: "Kinderfreibetrag", visible: false, required: false },
  { name: "religion", label: "Religionszugehörigkeit", visible: false, required: false },
];

/**
 * Wendet den Zielzustand auf eine stepsConfig an.
 *
 * Gibt die neue Liste zurueck plus die Beschreibung dessen, was sich geaendert
 * hat. Ist die Liste leer, war schon alles im Zielzustand.
 */
function korrigiereMinijobSchritte(steps) {
  const geaendert = [];

  const neu = steps.map((s) => {
    if (s.step === 5) {
      // Vollstaendig gegen den Zielzustand pruefen, nicht nur gegen taxId:
      // Ist der Schritt zwar an, aber Steuerklasse und Religion stehen noch
      // als Pflichtfelder darin, muss er trotzdem korrigiert werden.
      const felderPassen =
        Array.isArray(s.fields) &&
        MINIJOB_TAX_FIELDS.every((ziel) => {
          const ist = s.fields.find((f) => f.name === ziel.name);
          return (
            ist && ist.visible === ziel.visible && ist.required === ziel.required
          );
        });
      if (s.enabled !== true || !felderPassen) {
        geaendert.push("5 (Steuer, auf Steuer-ID reduziert)");
        return { ...s, enabled: true, fields: MINIJOB_TAX_FIELDS };
      }
      return s;
    }
    if ((s.step === 6 || s.step === 8) && s.enabled !== true) {
      geaendert.push(String(s.step));
      return { ...s, enabled: true };
    }
    return s;
  });

  return { neu, geaendert };
}

async function ensureMinijobTemplateSteps(prisma) {
  try {
    if (await migrationErledigt(prisma, MINIJOB_TEMPLATE_MARKER)) return;

    const template = await prisma.formTemplate.findUnique({
      where: { questionnaireType: "MINIJOB" },
      select: { id: true, stepsConfig: true },
    });

    const steps =
      template && Array.isArray(template.stepsConfig)
        ? template.stepsConfig
        : null;

    if (!steps || steps.length === 0) {
      // **Kein Marker.** Auf einer frischen Datenbank laeuft diese Funktion vor
      // dem Seed, die Vorlage existiert also noch gar nicht. Wuerden wir hier
      // "erledigt" schreiben, liefe die Korrektur nie wieder — auch dann nicht,
      // wenn die Vorlage spaeter mit altem Stand angelegt oder aus einem Backup
      // zurueckgespielt wird. Stattdessen beim naechsten Start erneut versuchen.
      console.log(
        "MINIJOB-Vorlage noch nicht vorhanden — Korrektur wird beim naechsten Start erneut geprueft.",
      );
      return;
    }

    const { neu, geaendert } = korrigiereMinijobSchritte(steps);

    // Laufende Vorgaenge tragen eine eingefrorene Kopie der Konfiguration
    // (OnboardingProcess.formTemplateSnapshot). Der Fragebogen liest bevorzugt
    // diese Kopie — ohne Nachziehen verloere ein bereits eingeladener
    // Minijobber die Steuer-ID trotz korrigierter Vorlage.
    const laufende = await prisma.onboardingProcess.findMany({
      where: {
        questionnaireType: "MINIJOB",
        status: { in: ["INVITED", "IN_PROGRESS"] },
      },
      select: { id: true, formTemplateSnapshot: true },
    });

    const snapshotUpdates = [];
    for (const vorgang of laufende) {
      if (!Array.isArray(vorgang.formTemplateSnapshot)) continue;
      const ergebnis = korrigiereMinijobSchritte(vorgang.formTemplateSnapshot);
      if (ergebnis.geaendert.length === 0) continue;
      snapshotUpdates.push(
        prisma.onboardingProcess.update({
          where: { id: vorgang.id },
          data: { formTemplateSnapshot: ergebnis.neu },
        }),
      );
    }

    if (geaendert.length === 0 && snapshotUpdates.length === 0) {
      await markiereMigration(prisma, MINIJOB_TEMPLATE_MARKER, {
        changed: false,
        reason: "Vorlage bereits im Zielzustand",
      });
      return;
    }

    const schreibvorgaenge = [];
    if (geaendert.length > 0) {
      schreibvorgaenge.push(
        prisma.formTemplate.update({
          where: { id: template.id },
          data: { stepsConfig: neu },
        }),
      );
    }
    schreibvorgaenge.push(...snapshotUpdates);
    schreibvorgaenge.push(
      markiereMigration(prisma, MINIJOB_TEMPLATE_MARKER, {
        changed: true,
        steps: geaendert,
        snapshotsNachgezogen: snapshotUpdates.length,
      }),
    );

    await prisma.$transaction(schreibvorgaenge);

    console.log(
      "MINIJOB-Vorlage korrigiert: Schritte " +
        (geaendert.join(", ") || "keine") +
        "; laufende Vorgaenge nachgezogen: " +
        snapshotUpdates.length,
    );
  } catch (error) {
    console.error("MINIJOB-Vorlagenkorrektur fehlgeschlagen:", error.message);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureSystemDocumentTemplates(prisma);
    await migrateCurrentStepToRegistryNumbers(prisma);
    await ensureMinijobTemplateSteps(prisma);

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log("Keine User gefunden — Seed wird ausgefuehrt...");
      await prisma.$disconnect();
      // Seed-Script ausfuehren (kompiliertes JS)
      require("./seed.js");
      return;
    }
    console.log(
      "Datenbank bereits geseeded (" + userCount + " User vorhanden). Seed uebersprungen.",
    );
    await prisma.$disconnect();
  } catch (error) {
    console.error("Seed-Check Fehler:", error.message);
    await prisma.$disconnect();
    // Nicht-kritisch: Server trotzdem starten
  }
}

// Nur ausfuehren, wenn direkt gestartet (`node prisma/seed-check.js` im
// Entrypoint). Beim `require` aus einem Test bleibt der Modulrumpf wirkungslos —
// so lassen sich die Migrationsregeln testen, ohne eine Datenbank zu brauchen.
if (require.main === module) {
  main();
}

module.exports = {
  LEGACY_DISPLAY_ORDER,
  MINIJOB_TAX_FIELDS,
  legacyIndexToStepNumber,
  korrigiereMinijobSchritte,
};
