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

/**
 * Die Quellwerte der currentStep-Migration, hoechster zuerst.
 *
 * Eigene Funktion, damit ein Test sie halten kann: Der Ausschluss der 0 ist die
 * ganze Regel, und sie ist nach einem Lauf nicht mehr korrigierbar.
 */
function migrationsQuellen() {
  const quellen = [];
  for (let i = 10; i >= 1; i--) quellen.push(i);
  return quellen;
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
    //
    // Beginn bei 1, NICHT bei 0: Die 0 ist keine alte Anzeigeposition, sondern
    // der Schema-Default „noch nicht begonnen". Die alte API liess nur min(1)
    // zu, das alte Formular speicherte immer currentStep + 1. Wanderte die 0
    // mit auf 1, koennte HR nach dem Deploy nicht mehr unterscheiden, wer den
    // Link nie geoeffnet hat und wer auf Schritt 1 steht — und zwar in allen
    // Fragebogentypen, nicht nur bei Minijob. Die Migration laeuft genau
    // einmal; danach waere der Zustand nur noch aus einem Backup zu holen.
    const sources = migrationsQuellen();

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
 *   - Masernschutz (9) wird hier nicht angefasst. Er war damals bewusst aus;
 *     seit dem 07.09.2026 schaltet ihn `ensureMasernschutzSchritt` mit eigenem
 *     Merker ein — diese Korrektur bleibt so stehen, wie sie gelaufen ist.
 *
 * Bewusst **keine** Rundum-Ueberschreibung: Nur diese drei Schritte werden
 * angefasst, alle uebrigen Einstellungen und alle anderen Vorlagen bleiben so,
 * wie HR sie gepflegt hat. Laeuft genau einmal (AuditLog-Marker) und nur, wenn
 * sich tatsaechlich etwas aendert.
 */
const MINIJOB_TEMPLATE_MARKER = "MINIJOB_TEMPLATE_STEPS_V1";

/**
 * Zweiter Lauf: Schritt 11 (Rentenversicherung) fuer MINIJOB freischalten.
 *
 * Eigener Merker, nicht V2 des ersten: Wer den ersten Lauf schon hinter sich
 * hat, soll ihn nicht wiederholen — aber den neuen Schritt trotzdem bekommen.
 *
 * Der Schritt fehlt in allen gespeicherten Konfigurationen, weil es ihn beim
 * letzten Speichern noch nicht gab. Ein fehlender Schritt gilt als
 * abgeschaltet — fuer MINIJOB muss er also ausdruecklich hinein.
 */
const MINIJOB_RENTE_MARKER = "MINIJOB_TEMPLATE_RENTE_V1";
const RENTE_SCHRITT = 11;

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

async function ensureMinijobRenteSchritt(prisma) {
  try {
    if (await migrationErledigt(prisma, MINIJOB_RENTE_MARKER)) return;

    const template = await prisma.formTemplate.findUnique({
      where: { questionnaireType: "MINIJOB" },
      select: { id: true, stepsConfig: true },
    });
    const steps =
      template && Array.isArray(template.stepsConfig) ? template.stepsConfig : null;

    if (!steps || steps.length === 0) {
      // Wie beim ersten Lauf: ohne Vorlage kein Merker. Auf einer frischen
      // Datenbank legt der Seed sie gleich richtig an.
      console.log(
        "MINIJOB-Vorlage noch nicht vorhanden — Rentenversicherungs-Schritt wird beim naechsten Start geprueft.",
      );
      return;
    }

    const vorhanden = steps.find((s) => s.step === RENTE_SCHRITT);
    if (vorhanden && vorhanden.enabled === true) {
      await markiereMigration(prisma, MINIJOB_RENTE_MARKER, {
        changed: false,
        reason: "Schritt 11 bereits aktiv",
      });
      return;
    }

    const neu = vorhanden
      ? steps.map((s) => (s.step === RENTE_SCHRITT ? { ...s, enabled: true } : s))
      : [...steps, { step: RENTE_SCHRITT, title: "Rentenversicherung", enabled: true }];

    // Laufende Vorgaenge tragen eine eingefrorene Kopie — ohne Nachziehen saehe
    // ein bereits eingeladener Minijobber den Schritt nicht.
    const laufende = await prisma.onboardingProcess.findMany({
      where: {
        questionnaireType: "MINIJOB",
        status: { in: ["INVITED", "IN_PROGRESS"] },
      },
      select: { id: true, formTemplateSnapshot: true },
    });

    const schreibvorgaenge = [
      prisma.formTemplate.update({
        where: { id: template.id },
        data: { stepsConfig: neu },
      }),
    ];

    for (const vorgang of laufende) {
      if (!Array.isArray(vorgang.formTemplateSnapshot)) continue;
      const snap = vorgang.formTemplateSnapshot;
      const hatSchritt = snap.find((s) => s.step === RENTE_SCHRITT);
      if (hatSchritt && hatSchritt.enabled === true) continue;
      const snapNeu = hatSchritt
        ? snap.map((s) => (s.step === RENTE_SCHRITT ? { ...s, enabled: true } : s))
        : [...snap, { step: RENTE_SCHRITT, title: "Rentenversicherung", enabled: true }];
      schreibvorgaenge.push(
        prisma.onboardingProcess.update({
          where: { id: vorgang.id },
          data: { formTemplateSnapshot: snapNeu },
        }),
      );
    }

    schreibvorgaenge.push(
      markiereMigration(prisma, MINIJOB_RENTE_MARKER, {
        changed: true,
        snapshotsNachgezogen: schreibvorgaenge.length - 1,
      }),
    );

    await prisma.$transaction(schreibvorgaenge);
    console.log(
      "MINIJOB-Vorlage: Rentenversicherungs-Schritt aktiviert; laufende Vorgaenge nachgezogen: " +
        (schreibvorgaenge.length - 2),
    );
  } catch (error) {
    console.error("Rentenversicherungs-Schritt fehlgeschlagen:", error.message);
  }
}

// =============================================
// Einmalige Datenmigration: Schritt-6-Felder der MINIJOB-Vorlage
// =============================================
const MINIJOB_STEP6_MARKER = "MINIJOB_TEMPLATE_STEP6_FELDER_V1";
const STEP6 = 6;

/**
 * Der Zielzustand von Schritt 6 fuer MINIJOB.
 *
 * Muss zu FIELD_REGISTRY[6] in src/lib/field-definitions.ts passen; der Test
 * src/__tests__/lib/fragebogen-steps.test.ts prueft das.
 *
 * Hintergrund: Die fuenf Bloecke aus Abschnitt 4 der Checkliste stehen in der
 * Registry auf defaultVisible: false, weil sie in einem TV-L- oder
 * Beamten-Fragebogen nichts zu suchen haben. Fuer MINIJOB muessen sie
 * ausdruecklich an — in gespeicherten Konfigurationen fehlen sie, weil es sie
 * beim letzten Speichern noch nicht gab.
 */
const MINIJOB_STEP6_FIELDS = [
  { name: "beschaeftigungsStatus", label: "Status bei Beschäftigungsbeginn", visible: true, required: true },
  { name: "alsArbeitsuchendGemeldet", label: "Bei der Agentur für Arbeit gemeldet?", visible: true, required: true },
  { name: "hasOtherEmployment", label: "Weitere Beschäftigung?", visible: true, required: false },
  { name: "summeUeberGeringfuegigkeitsgrenze", label: "Summe über Geringfügigkeitsgrenze?", visible: true, required: false },
  { name: "vorbeschaeftigungenVorhanden", label: "Vorbeschäftigungen im Kalenderjahr?", visible: true, required: true },
  { name: "auslandsbeschaeftigungVorhanden", label: "Beschäftigung im Ausland?", visible: true, required: true },
  { name: "employerType", label: "Arbeitgeber-Typ", visible: true, required: true },
  // Altfelder: bleiben aus, werden nicht mehr erhoben.
  { name: "otherEmployerName", label: "Arbeitgeber-Name (Altfeld)", visible: false, required: false },
  { name: "otherWeeklyHours", label: "Wochenstunden Nebenjob (Altfeld)", visible: false, required: false },
  { name: "hasMinijob", label: "Minijob vorhanden? (Altfeld)", visible: false, required: false },
];

/** Steht Schritt 6 der uebergebenen Konfiguration schon im Zielzustand? */
function step6Passt(steps) {
  const schritt = steps.find((s) => s.step === STEP6);
  if (!schritt || schritt.enabled !== true || !Array.isArray(schritt.fields)) return false;
  return MINIJOB_STEP6_FIELDS.every((ziel) => {
    const ist = schritt.fields.find((f) => f.name === ziel.name);
    return ist && ist.visible === ziel.visible && ist.required === ziel.required;
  });
}

/** Setzt Schritt 6 auf den Zielzustand. */
function setzeStep6(steps) {
  const vorhanden = steps.some((s) => s.step === STEP6);
  const ziel = {
    step: STEP6,
    title: "Weitere Beschäftigung",
    enabled: true,
    fields: MINIJOB_STEP6_FIELDS,
  };
  return vorhanden
    ? steps.map((s) => (s.step === STEP6 ? { ...s, ...ziel } : s))
    : [...steps, ziel];
}

/**
 * Schaltet die Minijob-Fragen aus Abschnitt 4 fuer die MINIJOB-Vorgaenge frei.
 *
 * Zieht auch die eingefrorenen Kopien laufender Vorgaenge nach — ohne das saehe
 * ein bereits eingeladener Minijobber die Fragen nicht, obwohl der Antrag sie
 * verlangt.
 */
async function ensureMinijobStep6Felder(prisma) {
  try {
    if (await migrationErledigt(prisma, MINIJOB_STEP6_MARKER)) return;

    const template = await prisma.formTemplate.findUnique({
      where: { questionnaireType: "MINIJOB" },
      select: { id: true, stepsConfig: true },
    });
    const steps =
      template && Array.isArray(template.stepsConfig) ? template.stepsConfig : null;

    if (!steps || steps.length === 0) {
      // Kein Merker: Auf einer frischen Datenbank legt der Seed die Vorlage
      // gleich richtig an; sonst beim naechsten Start erneut versuchen.
      console.log("MINIJOB-Vorlage noch nicht vorhanden — Schritt-6-Felder folgen spaeter.");
      return;
    }

    const schreibvorgaenge = [];
    if (!step6Passt(steps)) {
      schreibvorgaenge.push(
        prisma.formTemplate.update({
          where: { id: template.id },
          data: { stepsConfig: setzeStep6(steps) },
        }),
      );
    }

    const laufende = await prisma.onboardingProcess.findMany({
      where: { questionnaireType: "MINIJOB", status: { in: ["INVITED", "IN_PROGRESS"] } },
      select: { id: true, formTemplateSnapshot: true },
    });
    let nachgezogen = 0;
    for (const vorgang of laufende) {
      if (!Array.isArray(vorgang.formTemplateSnapshot)) continue;
      if (step6Passt(vorgang.formTemplateSnapshot)) continue;
      nachgezogen++;
      schreibvorgaenge.push(
        prisma.onboardingProcess.update({
          where: { id: vorgang.id },
          data: { formTemplateSnapshot: setzeStep6(vorgang.formTemplateSnapshot) },
        }),
      );
    }

    schreibvorgaenge.push(
      markiereMigration(prisma, MINIJOB_STEP6_MARKER, {
        vorlageGeaendert: schreibvorgaenge.length > nachgezogen,
        snapshotsNachgezogen: nachgezogen,
      }),
    );

    await prisma.$transaction(schreibvorgaenge);
    console.log(
      "MINIJOB-Vorlage: Schritt-6-Felder gesetzt; laufende Vorgaenge nachgezogen: " + nachgezogen,
    );
  } catch (error) {
    console.error("Schritt-6-Felder fehlgeschlagen:", error.message);
  }
}

// =============================================
// Einmalige Datenmigration: Masernschutz-Schritt in ALLEN Vorlagen
// =============================================
const MASERNSCHUTZ_MARKER = "FORMTEMPLATE_MASERNSCHUTZ_V1";
const MASERN_SCHRITT = 9;
const MASERN_TITEL = "Masernschutz";

/**
 * Steht Schritt 9 in dieser Konfiguration auf „an"?
 *
 * Ein **fehlender** Eintrag zaehlt als aus (so wertet getActiveSteps ihn) — er
 * muss also ergaenzt werden, nicht uebergangen.
 */
function masernSchrittAktiv(steps) {
  const schritt = steps.find((s) => s.step === MASERN_SCHRITT);
  return Boolean(schritt && schritt.enabled === true);
}

/**
 * Schaltet ausschliesslich Schritt 9 ein.
 *
 * Bewusst so eng: Diese Migration fasst als erste **alle** Vorlagen an, nicht
 * nur MINIJOB. Alles, was HR an Feldern, Titeln und anderen Schritten gepflegt
 * hat, bleibt unangetastet — ein Rundum-Ueberschreiben wuerde hier in einem
 * Zug fuenf Vorlagen und jeden laufenden Vorgang beschaedigen, und `db push
 * --accept-data-loss` laeuft im selben Startvorgang.
 *
 * Ohne `fields`, wenn der Eintrag neu angelegt wird: Die Feld-Defaults kommen
 * dann aus der Registry (mergeStepsConfig / FieldConfigHelper) — dieselbe
 * Behandlung, die der Rentenversicherungs-Schritt bekommen hat.
 */
function aktiviereMasernSchritt(steps) {
  const vorhanden = steps.some((s) => s.step === MASERN_SCHRITT);
  return vorhanden
    ? steps.map((s) =>
        s.step === MASERN_SCHRITT ? { ...s, enabled: true } : s,
      )
    : [...steps, { step: MASERN_SCHRITT, title: MASERN_TITEL, enabled: true }];
}

/**
 * Schaltet den Masernschutz-Schritt in allen Formularvorlagen frei
 * (Entscheidung 07.09.2026).
 *
 * Bis dahin war er fuer MINIJOB und EHRENAMT aus, weil er dort als „nicht
 * einschlaegig" galt. Das Infektionsschutzgesetz knuepft aber an die Taetigkeit
 * in der Gemeinschaftseinrichtung an, nicht an den Umfang der Beschaeftigung.
 *
 * Der Schritt stellt nur die Frage. Ob daraus eine Dokumentenpflicht wird,
 * entscheidet der Vorgang (Geburtsjahr ab 1971 und Einrichtungstyp,
 * src/lib/masernschutz.ts), und selbst dann sperrt der fehlende Nachweis das
 * Absenden nicht.
 *
 * Zieht die eingefrorenen Kopien laufender Vorgaenge nach — ohne das saehe ein
 * bereits eingeladener Minijobber den Schritt nie, obwohl seine Vorlage ihn
 * fuehrt. Anders als die bisherigen Migrationen ohne Filter auf
 * `questionnaireType`: Betroffen sind alle Strecken.
 *
 * Idempotenz: Merker in `system_migrations`, geschrieben in derselben
 * Transaktion wie die Updates.
 */
async function ensureMasernschutzSchritt(prisma) {
  try {
    if (await migrationErledigt(prisma, MASERNSCHUTZ_MARKER)) return;

    const vorlagen = await prisma.formTemplate.findMany({
      select: { id: true, questionnaireType: true, stepsConfig: true },
    });

    if (vorlagen.length === 0) {
      // Kein Merker: Auf einer frischen Datenbank laeuft der Seed erst danach
      // und legt die Vorlagen gleich richtig an. Sonst beim naechsten Start
      // erneut versuchen — wie bei den MINIJOB-Korrekturen.
      console.log(
        "Noch keine Formularvorlagen vorhanden — Masernschutz-Schritt folgt beim naechsten Start.",
      );
      return;
    }

    const schreibvorgaenge = [];
    const geaenderteVorlagen = [];
    const uebersprungen = [];
    for (const vorlage of vorlagen) {
      if (!Array.isArray(vorlage.stepsConfig)) {
        // Eine Vorlage ohne brauchbare Konfiguration wird NICHT neu gebaut:
        // Hier ist nicht zu erkennen, was HR wollte, und ein erfundener
        // Zielzustand waere schlimmer als ein fehlender Schritt.
        uebersprungen.push(vorlage.questionnaireType);
        console.warn(
          "Masernschutz uebersprungen: Vorlage " +
            vorlage.questionnaireType +
            " hat keine Schrittliste.",
        );
        continue;
      }
      if (masernSchrittAktiv(vorlage.stepsConfig)) continue;
      geaenderteVorlagen.push(vorlage.questionnaireType);
      schreibvorgaenge.push(
        prisma.formTemplate.update({
          where: { id: vorlage.id },
          data: { stepsConfig: aktiviereMasernSchritt(vorlage.stepsConfig) },
        }),
      );
    }

    const laufende = await prisma.onboardingProcess.findMany({
      where: { status: { in: ["INVITED", "IN_PROGRESS"] } },
      select: { id: true, formTemplateSnapshot: true },
    });

    let nachgezogen = 0;
    for (const vorgang of laufende) {
      if (!Array.isArray(vorgang.formTemplateSnapshot)) continue;
      if (masernSchrittAktiv(vorgang.formTemplateSnapshot)) continue;
      nachgezogen++;
      schreibvorgaenge.push(
        prisma.onboardingProcess.update({
          where: { id: vorgang.id },
          data: {
            formTemplateSnapshot: aktiviereMasernSchritt(
              vorgang.formTemplateSnapshot,
            ),
          },
        }),
      );
    }

    // Konnte etwas nicht angefasst werden, wird KEIN Merker gesetzt — sonst
    // waere die Migration „erledigt", ohne diese Vorlage je erreicht zu haben.
    //
    // Dass das erlaubt ist, unterscheidet diese Migration von der
    // currentStep-Umstellung: Sie ist von Bauart idempotent (ein bereits
    // aktiver Schritt wird uebersprungen, ein erneutes Einschalten aendert
    // nichts). Ein zweiter Lauf verschiebt hier nichts, er tut schlicht nichts.
    // Der Preis: Solange eine Vorlage kaputt ist, wuerde ein spaeteres
    // Abschalten von Schritt 9 durch HR beim naechsten Start rueckgaengig
    // gemacht. Die Warnung oben nennt die Vorlage beim Namen.
    const merker =
      uebersprungen.length > 0
        ? []
        : [
            markiereMigration(prisma, MASERNSCHUTZ_MARKER, {
              changed: schreibvorgaenge.length > 0,
              vorlagen: geaenderteVorlagen,
              snapshotsNachgezogen: nachgezogen,
            }),
          ];

    if (schreibvorgaenge.length === 0 && merker.length === 0) {
      console.warn(
        "Masernschutz-Schritt: nichts zu tun, aber Vorlagen ohne Schrittliste (" +
          uebersprungen.join(", ") +
          ") — kein Merker, naechster Start prueft erneut.",
      );
      return;
    }

    await prisma.$transaction([...schreibvorgaenge, ...merker]);
    console.log(
      (schreibvorgaenge.length === 0
        ? "Masernschutz-Schritt war bereits ueberall aktiv."
        : "Masernschutz-Schritt aktiviert in: " +
          (geaenderteVorlagen.join(", ") || "keiner Vorlage") +
          "; laufende Vorgaenge nachgezogen: " +
          nachgezogen + ".") +
        (uebersprungen.length > 0
          ? " Kein Merker wegen: " + uebersprungen.join(", ") + "."
          : ""),
    );
  } catch (error) {
    console.error("Masernschutz-Schritt fehlgeschlagen:", error.message);
  }
}

// =============================================
// Einmalige Datenmigration: BA-Betriebsnummern der 16 Mandanten
// =============================================
const BETRIEBSNUMMERN_MARKER = "ORG_BETRIEBSNUMMERN_V1";

/**
 * Der Testwert, den die Dev-Datenbank vor der Erstbefuellung beim Berufskolleg
 * trug. Er darf ueberschrieben werden — ein echter Wert nie.
 */
const BETRIEBSNUMMER_PLATZHALTER = "12345678";

/**
 * Die BA-Betriebsnummern je LOGA-Mandantennummer, geliefert vom Kunden
 * am 01.09.2026.
 *
 * Schluessel ist die `mandantNumber`, nicht der Name: Namen weichen zwischen
 * Liste und Datenbank ab („KiTa Porta" vs. „KiTa Porta Westfalica",
 * „MVS Maranatha GmbH" vs. „Maranatha GmbH"), die Nummer ist eindeutig und
 * @unique.
 *
 * Mehrfachnennungen sind korrekt und kein Tippfehler: Haddenhausen und
 * Minderheide teilen sich 36844001, Gesamtschule/Gymnasium/Berufskolleg
 * teilen sich 78071501. Im Sinne der BA ist das jeweils ein Betrieb — deshalb
 * ist `Organization.betriebsnummer` bewusst nicht @unique.
 */
const BETRIEBSNUMMERN = [
  { mandant: "742", name: "KiTa Minden", betriebsnummer: "93465718" },
  { mandant: "743", name: "KiTa Espelkamp", betriebsnummer: "93483607" },
  { mandant: "766", name: "KiTa Herford", betriebsnummer: "77232791" },
  { mandant: "769", name: "KiTa Porta Westfalica", betriebsnummer: "74674044" },
  { mandant: "712", name: "GS Haddenhausen", betriebsnummer: "36844001" },
  { mandant: "728", name: "GS Minderheide", betriebsnummer: "36844001" },
  { mandant: "719", name: "GS Stemwede", betriebsnummer: "36894251" },
  { mandant: "721", name: "Gesamtschule", betriebsnummer: "78071501" },
  { mandant: "737", name: "Gymnasium", betriebsnummer: "78071501" },
  { mandant: "767", name: "Berufskolleg", betriebsnummer: "78071501" },
  { mandant: "735", name: "Chr. Schulfoerderverein Minden e.V.", betriebsnummer: "18306871" },
  { mandant: "734", name: "Chr. Schulfoerderverein FES Minden e.V.", betriebsnummer: "36907542" },
  { mandant: "764", name: "FES Objekt Service GmbH", betriebsnummer: "18885833" },
  { mandant: "736", name: "MVS Maranatha GmbH", betriebsnummer: "16391978" },
  { mandant: "747", name: "HELEX.IT GmbH", betriebsnummer: "18837588" },
  { mandant: "768", name: "Chr. Familienhilfe Minden e.V.", betriebsnummer: "75478766" },
];

/**
 * Vergleichsform der Mandantennummer.
 *
 * Der Kunde notiert sie vierstellig mit fuehrender Null („0742"), die Datenbank
 * haelt sie dreistellig („742"). Ohne Normalisierung fiele die Zuordnung
 * lautlos aus und die Migration wuerde als erledigt markiert, ohne etwas
 * getan zu haben.
 */
function normalisiereMandantNummer(wert) {
  return String(wert ?? "").trim().replace(/^0+/, "");
}

/**
 * Entscheidet je Mandant, ob geschrieben wird.
 *
 * Geschrieben wird nur, wenn das Feld leer ist oder den dokumentierten
 * Testwert traegt. Eine abweichende, bereits gepflegte Nummer bleibt stehen und
 * wird gemeldet — die Migration soll Stammdaten erstbefuellen, nicht die
 * Pflege des Kunden ueberschreiben.
 */
function planeBetriebsnummern(organisationen, eintraege) {
  const nachNummer = new Map(
    organisationen.map((o) => [normalisiereMandantNummer(o.mandantNumber), o]),
  );
  const zuSchreiben = [];
  const uebersprungen = [];
  const fehlend = [];

  for (const eintrag of eintraege) {
    const org = nachNummer.get(normalisiereMandantNummer(eintrag.mandant));
    if (!org) {
      fehlend.push(eintrag);
      continue;
    }
    const jetzt = org.betriebsnummer;
    if (jetzt && jetzt !== BETRIEBSNUMMER_PLATZHALTER && jetzt !== eintrag.betriebsnummer) {
      uebersprungen.push({ ...eintrag, vorhanden: jetzt, dbName: org.name });
      continue;
    }
    if (jetzt === eintrag.betriebsnummer) continue;
    zuSchreiben.push({ ...eintrag, id: org.id, dbName: org.name });
  }
  return { zuSchreiben, uebersprungen, fehlend };
}

/**
 * Traegt die BA-Betriebsnummern nach.
 *
 * Ohne sie sperrt das Portal die Erzeugung beider Minijob-Antraege fuer den
 * jeweiligen Mandanten (bewusst, siehe src/lib/betriebsnummer.ts) — der
 * Beschaeftigte steht dann am Ende des Fragebogens vor einer Pflicht, die er
 * selbst nicht erfuellen kann.
 *
 * Idempotenz: Merker in `system_migrations`, geschrieben in derselben
 * Transaktion wie die Updates.
 */
async function ensureBetriebsnummern(prisma) {
  try {
    if (await migrationErledigt(prisma, BETRIEBSNUMMERN_MARKER)) return;

    const organisationen = await prisma.organization.findMany({
      select: { id: true, mandantNumber: true, name: true, betriebsnummer: true },
    });
    if (organisationen.length === 0) {
      // Frische Datenbank: der Seed legt die Mandanten erst an. Ohne Merker
      // laeuft die Migration beim naechsten Start erneut.
      console.log("Noch keine Mandanten vorhanden — Betriebsnummern folgen beim naechsten Start.");
      return;
    }

    const { zuSchreiben, uebersprungen, fehlend } = planeBetriebsnummern(
      organisationen,
      BETRIEBSNUMMERN,
    );

    for (const e of fehlend) {
      console.warn(
        "Betriebsnummer ohne Mandant: LOGA " + e.mandant + " (" + e.name + ") nicht gefunden.",
      );
    }
    for (const e of uebersprungen) {
      console.warn(
        "Betriebsnummer uebersprungen: " + e.dbName + " (LOGA " + e.mandant + ") traegt bereits " +
          e.vorhanden + ", erwartet war " + e.betriebsnummer + ".",
      );
    }

    const schreibvorgaenge = zuSchreiben.map((e) =>
      prisma.organization.update({
        where: { id: e.id },
        data: { betriebsnummer: e.betriebsnummer },
      }),
    );
    schreibvorgaenge.push(
      markiereMigration(prisma, BETRIEBSNUMMERN_MARKER, {
        gesetzt: zuSchreiben.length,
        uebersprungen: uebersprungen.map((e) => e.mandant),
        fehlend: fehlend.map((e) => e.mandant),
      }),
    );

    await prisma.$transaction(schreibvorgaenge);
    console.log("BA-Betriebsnummern gesetzt: " + zuSchreiben.length + " von " + BETRIEBSNUMMERN.length + ".");
  } catch (error) {
    console.error("Betriebsnummern-Migration fehlgeschlagen:", error.message);
  }
}

// =============================================
// Einmalige Datenmigration: die EINE Kostenstelle in die Aufteilung ueberfuehren
// =============================================
const KOSTENSTELLEN_MARKER = "KOSTENSTELLEN_AUFTEILUNG_V1";

/** Muss zu MAX_KOSTENSTELLE_LAENGE in src/lib/validations/kostenstellen.ts passen. */
const KOSTENSTELLE_MAX_LAENGE = 100;

/**
 * Entscheidet je Datensatz, welche Zeile aus dem Altbestand entsteht.
 *
 * Eigene, reine Funktion, damit ein Test sie ohne Datenbank halten kann
 * (src/__tests__/lib/kostenstellen.test.ts). Die beiden Entscheidungen darin
 * sind nach dem Lauf nicht mehr korrigierbar:
 *
 * (1) EIN HINTERLEGTER ANTEIL WIRD UNVERAENDERT UEBERNOMMEN, auch wenn er nicht
 *     100 ergibt. Die Zahl stammt von einem Menschen; sie stillschweigend auf
 *     100 zu heben waere eine gefaelschte Buchungsanweisung. Die Luecke wird
 *     stattdessen sichtbar: Sie steht in `details` des Merkers und faellt beim
 *     naechsten Oeffnen der Maske auf, weil die Summenregel dort greift. Das
 *     schliesst die gespeicherte 0 ein — wer 0 eingetragen hat, hat 0 gemeint
 *     (das Formular macht aus einem GELEERTEN Feld null, nicht 0; siehe
 *     src/lib/formular-zahlen.ts). Eine 0 als "keine Angabe" zu deuten und
 *     daraus 100 zu machen, waere dieselbe Faelschung.
 *
 * (2) FEHLT DER ANTEIL GANZ (null — heute moeglich, weil beide Felder optional
 *     sind), traegt die eine Kostenstelle alles: 100. Das ist keine Erfindung,
 *     sondern die einzige Lesart, die zu einer einzelnen Kostenstelle passt —
 *     das gesamte Gehalt geht dorthin. Die Alternative (Zeile weglassen)
 *     verloere eine gepflegte Angabe, die Alternative "0" erzeugte eine
 *     Aufteilung, die nichts verteilt.
 *
 * Leere oder nur aus Leerraum bestehende Bezeichnungen werden uebersprungen:
 * Daraus entstuende eine Zeile ohne Kostenstelle, die die Maske sofort wieder
 * anmeckern wuerde.
 */
function planeKostenstellenZeilen(datensaetze) {
  const zeilen = [];
  let leer = 0;
  let ohneAnteil = 0;
  let nichtHundert = 0;

  for (const sd of datensaetze) {
    const bezeichnung = String(sd.kostenstelle ?? "")
      .trim()
      .slice(0, KOSTENSTELLE_MAX_LAENGE);
    if (bezeichnung === "") {
      leer++;
      continue;
    }

    const hatAnteil =
      typeof sd.kostenstelleAnteil === "number" &&
      Number.isFinite(sd.kostenstelleAnteil);
    const anteil = hatAnteil ? sd.kostenstelleAnteil : 100;

    if (!hatAnteil) ohneAnteil++;
    // In ganzen Hundertsteln vergleichen, nicht `anteil !== 100`: Dieselbe
    // Regel wie in src/lib/validations/kostenstellen.ts, damit die Migration
    // nicht anders zaehlt, als die Maske spaeter rechnet.
    else if (Math.round(anteil * 100) !== 10000) nichtHundert++;

    zeilen.push({
      supervisorDataId: sd.id,
      orderIndex: 0,
      bezeichnung,
      anteil,
    });
  }

  return { zeilen, leer, ohneAnteil, nichtHundert };
}

/**
 * Ueberfuehrt die einzelne Kostenstelle in die neue Aufteilung.
 *
 * Ohne sie muesste jede vorgesetzte Person eine bereits gepflegte Kostenstelle
 * neu eintippen. Und bis dahin stuende in Vorgangsansicht, CSV und PDF nicht
 * etwa nichts, sondern der ALTE Einzelwert aus `kostenstelle` — von den beiden
 * Zustaenden der gefaehrlichere: Eine leere Anzeige faellt auf, eine gefuellte
 * gibt niemandem Anlass zu zweifeln. Ein ungelaufener Lauf heisst also nicht
 * "die Angabe fehlt", sondern "die Angabe steht da, aber nur als eine einzelne
 * Kostenstelle statt als Aufteilung".
 *
 * Dass dieser Einzelwert wenigstens nicht EINFRIERT, sobald jemand die
 * Aufteilung pflegt, besorgt die Speicherroute: PUT /api/modalitaeten/:token
 * fuehrt `kostenstelle`/`kostenstelleAnteil` mit der ersten Zeile mit und
 * setzt sie auf null, wenn keine Zeile mehr da ist.
 *
 * Die alten Spalten bleiben in DIESEM Release bestehen (siehe Kommentar an
 * SupervisorData in prisma/schema.prisma): entrypoint.sh schiebt das Schema
 * VOR diesem Lauf. Waeren sie im selben Release entfernt, laese diese Migration
 * ins Leere.
 *
 * Idempotenz doppelt: Merker in `system_migrations`, geschrieben in DERSELBEN
 * Transaktion wie die Zeilen — und die Bedingung `kostenstellen: { none: {} }`,
 * die einen Datensatz mit bereits vorhandener Aufteilung gar nicht erst
 * aufgreift. Ein Lauf ohne Merker bliebe damit folgenlos; der Merker bleibt
 * trotzdem, so ist es Hausstandard.
 */
async function migriereKostenstellenAufteilung(prisma) {
  try {
    if (await migrationErledigt(prisma, KOSTENSTELLEN_MARKER)) return;

    const datensaetze = await prisma.supervisorData.findMany({
      where: { kostenstelle: { not: null }, kostenstellen: { none: {} } },
      select: { id: true, kostenstelle: true, kostenstelleAnteil: true },
    });

    if (datensaetze.length === 0) {
      // Frische oder bereits vollstaendig migrierte Datenbank. Anders als bei
      // den MINIJOB-Korrekturen haengt hier nichts am Seed — es gibt schlicht
      // nichts zu tun, also darf der Merker gesetzt werden.
      await markiereMigration(prisma, KOSTENSTELLEN_MARKER, {
        migriert: 0,
        grund: "keine Einstellungsmodalitaeten mit Kostenstelle",
      });
      console.log("Kostenstellen-Migration: nichts zu tun, Merker gesetzt.");
      return;
    }

    const { zeilen, leer, ohneAnteil, nichtHundert } =
      planeKostenstellenZeilen(datensaetze);

    const schreibvorgaenge = [];
    if (zeilen.length > 0) {
      schreibvorgaenge.push(prisma.supervisorKostenstelle.createMany({ data: zeilen }));
    }
    schreibvorgaenge.push(
      markiereMigration(prisma, KOSTENSTELLEN_MARKER, {
        geprueft: datensaetze.length,
        migriert: zeilen.length,
        leereBezeichnung: leer,
        ohneAnteilAuf100Gesetzt: ohneAnteil,
        // Diese Vorgaenge ergeben nach der Migration NICHT 100 Prozent. Die
        // Zahl steht hier, damit HR sie gezielt nacharbeiten kann, statt sie
        // zufaellig zu entdecken.
        anteilUngleich100: nichtHundert,
      }),
    );

    await prisma.$transaction(schreibvorgaenge);

    console.log(
      "Kostenstellen-Migration: " +
        zeilen.length +
        " von " +
        datensaetze.length +
        " uebernommen (ohne Anteil: " +
        ohneAnteil +
        ", Anteil ungleich 100: " +
        nichtHundert +
        ", leere Bezeichnung uebersprungen: " +
        leer +
        ").",
    );
  } catch (error) {
    // Nicht-kritisch fuer den Start: Ohne Merker laeuft die Migration beim
    // naechsten Start erneut, und die alten Spalten stehen bis zum naechsten
    // Release noch da.
    console.error("Kostenstellen-Migration fehlgeschlagen:", error.message);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureSystemDocumentTemplates(prisma);
    await migrateCurrentStepToRegistryNumbers(prisma);
    await ensureMinijobTemplateSteps(prisma);
    await ensureMinijobRenteSchritt(prisma);
    await ensureMinijobStep6Felder(prisma);
    await ensureMasernschutzSchritt(prisma);
    await ensureBetriebsnummern(prisma);
    await migriereKostenstellenAufteilung(prisma);

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
  migrationsQuellen,
  RENTE_SCHRITT,
  LEGACY_DISPLAY_ORDER,
  MINIJOB_TAX_FIELDS,
  MINIJOB_STEP6_FIELDS,
  STEP6,
  step6Passt,
  setzeStep6,
  legacyIndexToStepNumber,
  korrigiereMinijobSchritte,
  MASERNSCHUTZ_MARKER,
  MASERN_SCHRITT,
  masernSchrittAktiv,
  aktiviereMasernSchritt,
  BETRIEBSNUMMERN,
  BETRIEBSNUMMER_PLATZHALTER,
  normalisiereMandantNummer,
  planeBetriebsnummern,
  KOSTENSTELLEN_MARKER,
  KOSTENSTELLE_MAX_LAENGE,
  planeKostenstellenZeilen,
};
