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

/**
 * Steht Schritt 11 (Rentenversicherung) in dieser Konfiguration auf „an"?
 *
 * Aus `ensureMinijobRenteSchritt` herausgezogen (09/2026, verhaltensgleich),
 * damit die Heilung festhaengender Vorgaenge (`migriereParalleleSpuren`)
 * dieselbe Regel nachziehen kann statt eine zweite zu bauen.
 */
function renteSchrittAktiv(steps) {
  const schritt = steps.find((s) => s.step === RENTE_SCHRITT);
  return Boolean(schritt && schritt.enabled === true);
}

/** Schaltet ausschliesslich Schritt 11 ein — und ergaenzt ihn, falls er fehlt. */
function aktiviereRenteSchritt(steps) {
  const vorhanden = steps.some((s) => s.step === RENTE_SCHRITT);
  return vorhanden
    ? steps.map((s) => (s.step === RENTE_SCHRITT ? { ...s, enabled: true } : s))
    : [...steps, { step: RENTE_SCHRITT, title: "Rentenversicherung", enabled: true }];
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

    if (renteSchrittAktiv(steps)) {
      await markiereMigration(prisma, MINIJOB_RENTE_MARKER, {
        changed: false,
        reason: "Schritt 11 bereits aktiv",
      });
      return;
    }

    const neu = aktiviereRenteSchritt(steps);

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
      if (renteSchrittAktiv(vorgang.formTemplateSnapshot)) continue;
      schreibvorgaenge.push(
        prisma.onboardingProcess.update({
          where: { id: vorgang.id },
          data: { formTemplateSnapshot: aktiviereRenteSchritt(vorgang.formTemplateSnapshot) },
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

// =============================================
// Einmalige Datenmigration: Vertragsende-Label „Stellenbezeichnung"
// =============================================
const STELLENBEZEICHNUNG_LABEL_MARKER = "VERTRAGSENDE_LABEL_STELLENBEZEICHNUNG_V1";

/** Name des Feldes in der Registry (src/lib/contract-end-fields.ts) — bleibt. */
const STELLENBEZEICHNUNG_FELD = "stellenbeschreibung";

/** Das fruehere Standard-Label der Registry, das ersetzt wird. */
const STELLENBEZEICHNUNG_ALTES_LABEL = "Stellenbeschreibung";

/**
 * Der neue Standard. Muss `FELD_BEZEICHNUNGEN.stellenbeschreibung` in
 * src/lib/formular-fehler.ts entsprechen — hier als reines JS dupliziert, weil
 * im Container kein tsx verfuegbar ist. Der Test
 * (src/__tests__/lib/stellenbezeichnung.test.ts) haelt beide zusammen.
 */
const STELLENBEZEICHNUNG_NEUES_LABEL = "Stellenbezeichnung";

/**
 * Entscheidet je Mandant, ob seine gespeicherte Vertragsende-Konfiguration
 * angepasst wird.
 *
 * WARUM es die Migration gibt: Die Konfigurationsmaske
 * (/mandanten/[id]/vertragsende-config) speichert beim Sichern IMMER alle
 * Labels — auch die, die niemand angefasst hat. Bei jedem Mandanten, der die
 * Maske einmal gespeichert hat, steht deshalb der alte Standard
 * „Stellenbeschreibung" woertlich in `Organization.contractEndFieldConfig` und
 * gewinnt gegen den neuen Registry-Standard. Nur die Registry zu aendern,
 * haette bei genau diesen Mandanten nichts bewirkt.
 *
 * Die Regel ist bewusst eng: Ersetzt wird NUR ein Label, das getrimmt exakt
 * dem alten Standard entspricht (also auch „Stellenbeschreibung " mit
 * Leerzeichen, das die Maske nicht wegtrimmt). Ein eigenes Label wie
 * „Taetigkeit" ist eine Entscheidung des Mandanten und bleibt stehen; es wird
 * nur gemeldet, damit HR es sieht. Alle uebrigen Eintraege (andere Felder,
 * visible/required) werden unveraendert uebernommen.
 *
 * Rein und ohne Datenbank, damit ein Test die Regel halten kann. Die Eingabe
 * wird nicht veraendert — geschrieben wird eine Kopie.
 */
function planeStellenbezeichnungLabels(organisationen) {
  const zuSchreiben = [];
  const eigeneLabels = [];

  for (const org of organisationen) {
    const konfig = org.contractEndFieldConfig;
    // null (nie gespeichert) oder kein Array: Dort greift ohnehin der neue
    // Registry-Standard — nichts zu tun.
    if (!Array.isArray(konfig)) continue;

    let geaendert = false;
    const neu = konfig.map((eintrag) => {
      if (
        !eintrag ||
        typeof eintrag !== "object" ||
        eintrag.name !== STELLENBEZEICHNUNG_FELD ||
        typeof eintrag.label !== "string"
      ) {
        return eintrag;
      }
      const label = eintrag.label.trim();
      if (label === STELLENBEZEICHNUNG_ALTES_LABEL) {
        geaendert = true;
        return { ...eintrag, label: STELLENBEZEICHNUNG_NEUES_LABEL };
      }
      // Leeres Label faellt beim Lesen auf den Registry-Standard zurueck, der
      // neue Standard ist schon der Zielwert — beides kein eigenes Label.
      if (label !== "" && label !== STELLENBEZEICHNUNG_NEUES_LABEL) {
        eigeneLabels.push({
          id: org.id,
          mandantNumber: org.mandantNumber,
          name: org.name,
          label: eintrag.label,
        });
      }
      return eintrag;
    });

    if (geaendert) {
      zuSchreiben.push({
        id: org.id,
        mandantNumber: org.mandantNumber,
        name: org.name,
        contractEndFieldConfig: neu,
      });
    }
  }

  return { zuSchreiben, eigeneLabels };
}

/**
 * Ersetzt in den gespeicherten Vertragsende-Konfigurationen das alte
 * Standard-Label „Stellenbeschreibung" durch „Stellenbezeichnung".
 *
 * Laeuft vor dem Serverstart (entrypoint.sh), also ohne gleichzeitiges
 * Speichern aus der Maske. Ein spaeteres Speichern schreibt ohnehin den neuen
 * Begriff, weil die Maske ihn aus der Registry anzeigt.
 *
 * Idempotenz: Merker in `system_migrations`, geschrieben in DERSELBEN
 * Transaktion wie die Updates — entweder beides oder nichts. Ein zweiter Lauf
 * waere hier zwar folgenlos (der alte Wert ist dann weg), der Merker bleibt
 * trotzdem, so ist es Hausstandard. Ohne Mandanten oder ohne Treffer wird er
 * ebenfalls gesetzt: Neue Mandanten haben keine gespeicherte Konfiguration
 * und bekommen den neuen Standard direkt aus der Registry.
 */
async function ensureStellenbezeichnungLabels(prisma) {
  try {
    if (await migrationErledigt(prisma, STELLENBEZEICHNUNG_LABEL_MARKER)) return;

    const organisationen = await prisma.organization.findMany({
      select: { id: true, mandantNumber: true, name: true, contractEndFieldConfig: true },
    });

    const { zuSchreiben, eigeneLabels } = planeStellenbezeichnungLabels(organisationen);

    for (const e of eigeneLabels) {
      console.log(
        "Vertragsende-Label bleibt: " + e.name + " (" + e.mandantNumber + ") nutzt das eigene Label \"" +
          e.label + "\" statt des Standards.",
      );
    }

    const schreibvorgaenge = zuSchreiben.map((e) =>
      prisma.organization.update({
        where: { id: e.id },
        data: { contractEndFieldConfig: e.contractEndFieldConfig },
      }),
    );
    schreibvorgaenge.push(
      markiereMigration(prisma, STELLENBEZEICHNUNG_LABEL_MARKER, {
        geprueft: organisationen.length,
        angepasst: zuSchreiben.map((e) => e.mandantNumber),
        eigeneLabels: eigeneLabels.map((e) => ({ mandant: e.mandantNumber, label: e.label })),
      }),
    );

    await prisma.$transaction(schreibvorgaenge);
    console.log(
      "Vertragsende-Label \"Stellenbezeichnung\": " + zuSchreiben.length + " von " +
        organisationen.length + " Mandanten angepasst.",
    );
  } catch (error) {
    // Nicht kritisch fuer den Start: Ohne Merker laeuft die Migration beim
    // naechsten Start erneut. Bis dahin zeigt das Formular dieser Mandanten
    // weiter den alten Begriff — unschoen, aber ohne Datenverlust.
    console.error("Stellenbezeichnung-Label-Migration fehlgeschlagen:", error.message);
  }
}

// =============================================
// Einmalige Datenmigration: festhaengende Onboarding-Vorgaenge heilen
// (Fragebogen und Modalitaeten parallel, Aenderungsplan 09/2026 Abschnitt 2)
// =============================================
const PARALLELE_SPUREN_MARKER = "ONBOARDING_PARALLELE_SPUREN_V1";

/** Status, die nur HR setzt — dieselbe Liste wie HR_STATUS in src/lib/onboarding-spuren.ts. */
const SPUREN_HR_STATUS = ["REVIEWED", "COMPLETED", "EXPIRED"];

/** Link-Status, die „Fragebogen abgegeben" behaupten. Ohne Zeitstempel: festhaengend. */
const SPUREN_ABGABE_STATUS = ["SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"];

/*
 * JS-Kopie der Spurenregeln aus src/lib/onboarding-spuren.ts — im Container
 * gibt es kein tsx. Der Test src/__tests__/lib/parallele-spuren-migration.test.ts
 * haelt `spurenGesamtStatus` ueber die ganze Matrix gegen `gesamtStatus`.
 * Wer die Regel dort aendert, muss sie hier mitaendern (der Test sagt es).
 */
function spurenMitarbeiterAbgesendet(v) {
  return Boolean(v.submittedAt) || Boolean(v.personalData && v.personalData.isComplete === true);
}

function spurenVorgesetzteAbgesendet(v) {
  return (
    Boolean(v.supervisorSubmittedAt) ||
    Boolean(v.supervisorData && v.supervisorData.isComplete === true)
  );
}

function spurenGesamtStatus(v) {
  if (SPUREN_HR_STATUS.includes(v.status)) return v.status;

  if (spurenMitarbeiterAbgesendet(v)) {
    if (spurenVorgesetzteAbgesendet(v)) return "SUPERVISOR_SUBMITTED";
    if (v.supervisorToken) return "SUPERVISOR_PENDING";
    return "SUBMITTED";
  }

  const schritt = (v.personalData && v.personalData.currentStep) || 0;
  const begonnen = v.status === "IN_PROGRESS" || schritt > 0;
  return begonnen ? "IN_PROGRESS" : "INVITED";
}

/**
 * Die Snapshot-Korrekturen der frueheren Migrationen — in ihrer Laufreihenfolge
 * aus `main()`, weil sie aufeinander aufbauen (Schritt 6 ueberschreibt die
 * Felder, die MINIJOB_TEMPLATE_STEPS_V1 nur eingeschaltet hat).
 *
 * WARUM. Alle vier zogen die eingefrorene Fragebogen-Konfiguration
 * (`formTemplateSnapshot`) nur bei Vorgaengen mit Status INVITED/IN_PROGRESS
 * nach. Festhaengende Vorgaenge standen zu dem Zeitpunkt auf
 * SUBMITTED/SUPERVISOR_* und wurden uebersprungen. Der Fragebogen liest
 * bevorzugt diese Kopie — nach der Heilung fuellte die Person also mit alter
 * Schrittfolge weiter, etwa ohne Masernschutz-Schritt. Den Nachweis koennte
 * danach niemand mehr hochladen.
 *
 * `greift(merker)` bildet nach, ob die fruehere Migration Snapshots ueberhaupt
 * angefasst HAETTE: MINIJOB_TEMPLATE_RENTE_V1 kehrte bei bereits aktivem
 * Vorlagenschritt frueh zurueck, ohne einen Snapshot anzusehen („changed:
 * false") — dann zieht auch die Heilung dort nichts nach.
 */
const SNAPSHOT_KORREKTUREN = [
  {
    merker: MINIJOB_TEMPLATE_MARKER,
    nurMinijob: true,
    greift: () => true,
    anwenden: (steps) => {
      const { neu, geaendert } = korrigiereMinijobSchritte(steps);
      return geaendert.length > 0 ? neu : null;
    },
  },
  {
    merker: MINIJOB_RENTE_MARKER,
    nurMinijob: true,
    greift: (merker) => !(merker.details && merker.details.changed === false),
    anwenden: (steps) => (renteSchrittAktiv(steps) ? null : aktiviereRenteSchritt(steps)),
  },
  {
    merker: MINIJOB_STEP6_MARKER,
    nurMinijob: true,
    greift: () => true,
    anwenden: (steps) => (step6Passt(steps) ? null : setzeStep6(steps)),
  },
  {
    merker: MASERNSCHUTZ_MARKER,
    nurMinijob: false,
    greift: () => true,
    anwenden: (steps) => (masernSchrittAktiv(steps) ? null : aktiviereMasernSchritt(steps)),
  },
];

/**
 * Zieht bei EINEM geheilten Vorgang nach, was die frueheren Migrationen bei ihm
 * ausgelassen haben. Liefert `null`, wenn sich nichts aendert.
 *
 * `merkerListe`: die Eintraege aus `system_migrations` ({ name, appliedAt,
 * details }). Nachgezogen wird eine Korrektur nur, wenn
 *   - ihre Migration schon gelaufen ist (sonst holt sie den Vorgang beim
 *     naechsten Start selbst ab — er steht dann ja auf INVITED/IN_PROGRESS),
 *   - sie Snapshots ueberhaupt angefasst haette (`greift`), und
 *   - der Vorgang VOR ihrem Lauf angelegt wurde. Der Snapshot entsteht beim
 *     Anlegen; ein spaeter angelegter Vorgang traegt schon die korrigierte
 *     Vorlage — oder eine, die HR danach bewusst anders eingestellt hat. Die
 *     darf die Heilung nicht zurueckdrehen.
 */
function planeSnapshotNachzug(vorgang, merkerListe) {
  if (!Array.isArray(vorgang.formTemplateSnapshot)) return null;

  let steps = vorgang.formTemplateSnapshot;
  const korrekturen = [];
  const angelegt = vorgang.createdAt ? new Date(vorgang.createdAt) : null;

  for (const k of SNAPSHOT_KORREKTUREN) {
    if (k.nurMinijob && vorgang.questionnaireType !== "MINIJOB") continue;
    const merker = merkerListe.find((m) => m.name === k.merker);
    if (!merker || !k.greift(merker)) continue;
    if (!angelegt || angelegt >= new Date(merker.appliedAt)) continue;
    const neu = k.anwenden(steps);
    if (!neu) continue;
    steps = neu;
    korrekturen.push(k.merker);
  }

  return korrekturen.length > 0 ? { snapshot: steps, korrekturen } : null;
}

/**
 * Plant die Heilung — rein und ohne Datenbank, damit ein Test sie halten kann.
 *
 * Fuer jeden Vorgang ausserhalb der HR-Status wird der Status aus beiden
 * Spuren neu abgeleitet (`spurenGesamtStatus`). Das erfasst:
 *   - FESTHAENGENDE Vorgaenge: Link-Status SUBMITTED/SUPERVISOR_* ohne eigene
 *     Abgabe der Person (Fuehrungskraft war schneller, oder eine
 *     Handkorrektur im HR-PATCH). Sie gehen zurueck auf IN_PROGRESS, wenn die
 *     Person schon gespeichert hat (`currentStep > 0`), sonst auf INVITED — und
 *     bekommen die ausgelassenen Snapshot-Korrekturen nachgezogen.
 *   - SUBMITTED mit offenem Vorgesetzten-Link -> SUPERVISOR_PENDING. Solche
 *     Vorgaenge entstanden, wenn HR den Link VOR der Abgabe erzeugt hatte,
 *     und bekamen nie eine Vorgesetzten-Erinnerung.
 *   - SUPERVISOR_SUBMITTED, obwohl die Modalitaeten fehlen, und umgekehrt.
 *
 * Geprueft/abgeschlossen OHNE eigene Abgabe (HR hat einen festhaengenden
 * Vorgang trotzdem abgehakt) wird NICHT angefasst, nur gemeldet
 * (`hrOhneAbgabe`) — diese Faelle klaert HR einzeln.
 */
function planeStatusAbgleich(vorgaenge, merkerListe = []) {
  const aenderungen = [];
  const hrOhneAbgabe = [];

  for (const v of vorgaenge) {
    if (SPUREN_HR_STATUS.includes(v.status)) {
      if (
        (v.status === "REVIEWED" || v.status === "COMPLETED") &&
        !spurenMitarbeiterAbgesendet(v)
      ) {
        hrOhneAbgabe.push({ id: v.id, displayId: v.displayId || null, status: v.status });
      }
      continue;
    }

    const nach = spurenGesamtStatus(v);
    if (nach === v.status) continue;

    const festhaengend =
      SPUREN_ABGABE_STATUS.includes(v.status) && !spurenMitarbeiterAbgesendet(v);
    const nachzug = festhaengend ? planeSnapshotNachzug(v, merkerListe) : null;

    aenderungen.push({
      id: v.id,
      displayId: v.displayId || null,
      von: v.status,
      nach,
      festhaengend,
      snapshot: nachzug ? nachzug.snapshot : null,
      snapshotKorrekturen: nachzug ? nachzug.korrekturen : [],
    });
  }

  return { aenderungen, hrOhneAbgabe };
}

/**
 * Heilt Onboarding-Vorgaenge, die am gemeinsamen Status festhaengen.
 *
 * Bis 09/2026 setzte das Absenden der Modalitaeten den Status hart auf
 * SUPERVISOR_SUBMITTED. War die Fuehrungskraft schneller als die Person,
 * sperrte das deren Fragebogen-Link dauerhaft. Die neue Logik haengt Zugriff
 * und Sperre an die Zeitstempel und heilt diese Vorgaenge funktional schon ohne
 * diese Migration — aber bis zur Abgabe stuenden sie mit falschem Status in
 * Liste, Statistik und Reporting-API, bekaemen keine Erinnerung und fuellten
 * mit veralteter Schrittfolge weiter.
 *
 * Sicherung: Die neue Spalte `supervisorLinkSentAt` ist ein Schema-Delta, also
 * zieht entrypoint.sh vor diesem Lauf automatisch einen pg_dump. Zusaetzlich
 * stehen alle alten Status im Merker (Rueckweg ohne Dump).
 *
 * Idempotenz: Merker in `system_migrations`, geschrieben in DERSELBEN
 * Transaktion wie die Updates — entweder alles oder nichts. Die Planung ist
 * ausserdem von Bauart idempotent: Ein geheilter Vorgang ergibt bei einem
 * zweiten Lauf keine Aenderung mehr. Ohne Treffer wird der Merker trotzdem
 * gesetzt (frische oder saubere Datenbank). Fehler werden geloggt, brechen den
 * Start aber nicht ab; ohne Merker laeuft die Heilung beim naechsten Start erneut.
 */
async function migriereParalleleSpuren(prisma) {
  try {
    if (await migrationErledigt(prisma, PARALLELE_SPUREN_MARKER)) return;

    const vorgaenge = await prisma.onboardingProcess.findMany({
      where: {
        OR: [
          { status: { notIn: SPUREN_HR_STATUS } },
          // Nur zum Melden, nicht zum Aendern (siehe planeStatusAbgleich).
          { status: { in: ["REVIEWED", "COMPLETED"] }, submittedAt: null },
        ],
      },
      select: {
        id: true,
        displayId: true,
        status: true,
        submittedAt: true,
        supervisorSubmittedAt: true,
        supervisorToken: true,
        questionnaireType: true,
        formTemplateSnapshot: true,
        createdAt: true,
        personalData: { select: { currentStep: true, isComplete: true } },
        supervisorData: { select: { isComplete: true } },
      },
    });

    const merkerListe = await prisma.systemMigration.findMany({
      where: { name: { in: SNAPSHOT_KORREKTUREN.map((k) => k.merker) } },
      select: { name: true, appliedAt: true, details: true },
    });

    const { aenderungen, hrOhneAbgabe } = planeStatusAbgleich(vorgaenge, merkerListe);

    const schreibvorgaenge = aenderungen.map((a) =>
      prisma.onboardingProcess.updateMany({
        // `status: a.von`: Nur den Stand aendern, den die Planung gesehen hat.
        where: { id: a.id, status: a.von },
        data: a.snapshot
          ? { status: a.nach, formTemplateSnapshot: a.snapshot }
          : { status: a.nach },
      }),
    );

    const geheilt = aenderungen.filter((a) => a.festhaengend);
    schreibvorgaenge.push(
      markiereMigration(prisma, PARALLELE_SPUREN_MARKER, {
        geprueft: vorgaenge.length,
        geaendert: aenderungen.length,
        festhaengendGeheilt: geheilt.map((a) => a.displayId || a.id),
        // Der Rueckweg: jeder alte Status, dazu welche Snapshot-Korrekturen
        // nachgezogen wurden.
        aenderungen: aenderungen.map((a) => ({
          id: a.id,
          displayId: a.displayId,
          von: a.von,
          nach: a.nach,
          snapshotKorrekturen: a.snapshotKorrekturen,
        })),
        // HR hat diese Vorgaenge geprueft/abgeschlossen, obwohl der Fragebogen
        // nie abgesendet wurde. Nicht angefasst — einzeln klaeren.
        hrOhneAbgabe,
      }),
    );

    await prisma.$transaction(schreibvorgaenge);

    console.log(
      "Onboarding parallele Spuren: " +
        aenderungen.length +
        " von " +
        vorgaenge.length +
        " Vorgaengen korrigiert (davon festhaengend geheilt: " +
        geheilt.length +
        ").",
    );
    if (hrOhneAbgabe.length > 0) {
      console.warn(
        "Onboarding parallele Spuren: geprueft/abgeschlossen ohne abgesendeten Fragebogen (nicht geaendert): " +
          hrOhneAbgabe.map((h) => (h.displayId || h.id) + " (" + h.status + ")").join(", "),
      );
    }
  } catch (error) {
    // Nicht kritisch fuer den Start: Die neue Logik laesst festhaengende
    // Personen schon ohne diese Migration weiter ausfuellen. Ohne Merker
    // laeuft sie beim naechsten Start erneut.
    console.error("Parallele-Spuren-Migration fehlgeschlagen:", error.message);
  }
}

// =============================================
// Einmalige Datenmigration: Abteilungsaufgaben im Onboarding (Paket 5)
// =============================================
const ONBOARDING_ABTEILUNGEN_MARKER = "ONBOARDING_ABTEILUNGSAUFGABEN_V1";

/** Wie ABTEILUNGS_SCHLUESSEL_MUSTER in src/lib/abteilungsaufgaben.ts. */
const ABTEILUNGS_SCHLUESSEL_MUSTER_JS = /^[A-Z][A-Z0-9_]{1,29}$/;

/** Hoechstens so viele IDs je updateMany (Postgres-Parametergrenze mit Luft). */
const MIGRATION_ID_BLOCK = 1000;

function zustaendigkeitNormalisierenJs(text) {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
 * JS-Kopie von `abteilungAusZustaendigkeit` (src/lib/abteilungsaufgaben.ts) —
 * im Container gibt es kein tsx. Der Test
 * src/__tests__/lib/onboarding-abteilungsaufgaben-migration.test.ts haelt beide
 * Fassungen ueber eine lange Liste von Eingaben zusammen. Wer die Regel dort
 * aendert, muss sie hier mitaendern (der Test sagt es).
 */
function abteilungAusZustaendigkeitJs(text) {
  const roh = String(text == null ? "" : text).trim();
  if (!roh) return null;
  if (ABTEILUNGS_SCHLUESSEL_MUSTER_JS.test(roh)) return roh;

  const n = zustaendigkeitNormalisierenJs(roh);
  if (!n) return null;
  const woerter = n.split(" ");
  const erstes = woerter[0];

  if (erstes === "hr" || n.startsWith("personal")) return "HR";
  if (erstes === "it" || n.startsWith("edv")) return "IT";
  if (n.startsWith("verw") || n.includes("sekretariat")) return "VERWALTUNG";
  if (
    n.startsWith("vorgesetzt") ||
    n.includes("fuehrungskraft") ||
    woerter.some((w) => w.endsWith("leitung"))
  ) {
    return "VORGESETZTER";
  }
  if (n.startsWith("facility") || n.includes("hausmeister") || n.includes("haustechnik")) {
    return "FACILITY";
  }
  if (n.includes("buchhaltung")) return "BUCHHALTUNG";
  if (n.startsWith("datenschutz") || erstes === "dsb") return "DSB";
  if (n.startsWith("mitarbeit") || n.startsWith("beschaeftigt")) return "MITARBEITER";
  return null;
}

/** Wie istOffboardingVorlagenName in src/lib/abteilungsaufgaben.ts. */
function istOffboardingVorlagenNameJs(name) {
  return String(name == null ? "" : name).trim().startsWith("Offboarding:");
}

/**
 * Plant die Umstellung — rein und ohne Datenbank, damit ein Test sie halten kann.
 *
 * Eingabe:
 *   vorlagen        [{ id, name }]                         alle Checklisten-Vorlagen
 *   vorlagenPunkte  [{ id, templateId, title, defaultAssignee, defaultDueDays }]
 *                   (in orderIndex-Reihenfolge)
 *   aufgaben        [{ id, templateItemId, title, assignee, relativeDueDays,
 *                      checklistTemplateId }]              alle ChecklistItems
 *                   (Onboarding), checklistTemplateId vom Vorgang
 *
 * Regeln:
 *   (a) Punkte der ONBOARDING-Vorlagen (Name beginnt nicht mit „Offboarding:"):
 *       Freitext-Zustaendigkeit → Schluessel (abteilungAusZustaendigkeitJs).
 *       Offboarding-Vorlagen bleiben unberuehrt (dort stehen schon Schluessel).
 *   (b) Laufende Onboarding-Aufgaben: `assignee` ebenso — gruppiert je Alttext,
 *       damit die Migration wenige Updates schreibt.
 *   (c) relativeDueDays der Aufgaben ohne Wert: ueber templateItemId die
 *       defaultDueDays des Vorlagenpunkts; zeigt templateItemId ins Leere
 *       (der Editor legte Punkte bis Paket 5 bei jedem Speichern neu an),
 *       Rueckfall: derselbe Titel in derselben Vorlage (erster Treffer mit
 *       Tagesangabe); sonst bleibt null (= ohne Faelligkeit).
 *   Unbekanntes bleibt, wie es ist, und wird gemeldet (`unbekannt`, je Text
 *   mit Anzahl in Vorlagen und Aufgaben). Grossbuchstaben-Schluessel bleiben.
 *
 * Die Planung ist von Bauart idempotent: Ein zweiter Lauf findet nur noch
 * Schluessel und gesetzte Tagesangaben und plant nichts.
 */
function planeOnboardingAbteilungsaufgaben({ vorlagen, vorlagenPunkte, aufgaben }) {
  const onboardingVorlagen = new Set(
    (vorlagen || []).filter((v) => !istOffboardingVorlagenNameJs(v.name)).map((v) => v.id),
  );
  const unbekannt = new Map();
  function merkeUnbekannt(text, art) {
    const eintrag = unbekannt.get(text) || { text, vorlagenPunkte: 0, aufgaben: 0 };
    eintrag[art]++;
    unbekannt.set(text, eintrag);
  }

  // (a) Vorlagenpunkte
  const punkte = [];
  for (const p of vorlagenPunkte || []) {
    if (!onboardingVorlagen.has(p.templateId)) continue;
    const alt = p.defaultAssignee == null ? "" : String(p.defaultAssignee);
    if (!alt.trim()) continue;
    const neu = abteilungAusZustaendigkeitJs(alt);
    if (!neu) {
      merkeUnbekannt(alt.trim(), "vorlagenPunkte");
      continue;
    }
    if (neu !== alt) punkte.push({ id: p.id, von: alt, nach: neu });
  }

  // (b) Aufgaben: je Alttext gruppiert
  const zuordnungenMap = new Map();
  for (const a of aufgaben || []) {
    const alt = a.assignee == null ? "" : String(a.assignee);
    if (!alt.trim()) continue;
    const neu = abteilungAusZustaendigkeitJs(alt);
    if (!neu) {
      merkeUnbekannt(alt.trim(), "aufgaben");
      continue;
    }
    if (neu === alt) continue;
    const z = zuordnungenMap.get(alt) || { von: alt, nach: neu, anzahl: 0 };
    z.anzahl++;
    zuordnungenMap.set(alt, z);
  }

  // (c) relativeDueDays
  const punktNachId = new Map((vorlagenPunkte || []).map((p) => [p.id, p]));
  const faelligkeitenMap = new Map();
  let ueberTitel = 0;
  for (const a of aufgaben || []) {
    if (a.relativeDueDays != null) continue;
    let tage = null;
    const punkt = a.templateItemId ? punktNachId.get(a.templateItemId) : undefined;
    if (punkt) {
      tage = punkt.defaultDueDays == null ? null : punkt.defaultDueDays;
    } else if (a.checklistTemplateId) {
      const titel = String(a.title || "").trim();
      const treffer = (vorlagenPunkte || []).find(
        (p) =>
          p.templateId === a.checklistTemplateId &&
          String(p.title || "").trim() === titel &&
          p.defaultDueDays != null,
      );
      if (treffer) {
        tage = treffer.defaultDueDays;
        ueberTitel++;
      }
    }
    if (tage == null) continue;
    const liste = faelligkeitenMap.get(tage) || [];
    liste.push(a.id);
    faelligkeitenMap.set(tage, liste);
  }

  return {
    punkte,
    zuordnungen: [...zuordnungenMap.values()],
    faelligkeiten: [...faelligkeitenMap.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([tage, ids]) => ({ tage, ids })),
    ueberTitel,
    unbekannt: [...unbekannt.values()].sort((x, y) => (x.text < y.text ? -1 : x.text > y.text ? 1 : 0)),
  };
}

/**
 * Stellt die Freitext-Zustaendigkeiten der Onboarding-Checklisten auf
 * Schluessel um und fuellt relativeDueDays der laufenden Aufgaben nach
 * (Paket 5, Abteilungsaufgaben im Onboarding).
 *
 * WARUM: Bis Paket 5 war die Zustaendigkeit im Onboarding Freitext
 * („Verwaltung", „Vorgesetzter"). Der Versand an Abteilungen, die Labels in
 * Tab, Stepper und PDF und der Editor arbeiten jetzt mit Schluesseln (IT,
 * VERWALTUNG, VORGESETZTER …). Ohne Umstellung ginge keine Bestandsaufgabe
 * per Link hinaus. Neue Punkte, Tagesangaben und Hinweise traegt HR im Editor
 * ein — die Migration aendert nur die Zuordnung und die Tagesangabe.
 *
 * Sicherung: Die neuen Spalten sind ein Schema-Delta, also zieht entrypoint.sh
 * vor diesem Lauf automatisch einen pg_dump. Zusaetzlich stehen alle alten
 * Werte im Merker (Rueckweg ohne Dump).
 *
 * Idempotenz: Merker in `system_migrations`, geschrieben in DERSELBEN
 * Transaktion wie die Updates — entweder alles oder nichts. Die Updates tragen
 * den alten Wert im WHERE (Punkte) bzw. `relativeDueDays: null`. Ohne Treffer
 * wird der Merker trotzdem gesetzt (frische Datenbank — der Seed legt die
 * Vorlagen danach schon mit Schluesseln an). Fehler werden geloggt, brechen
 * den Start aber nicht ab; ohne Merker laeuft die Migration beim naechsten
 * Start erneut.
 */
async function migriereOnboardingAbteilungsaufgaben(prisma) {
  try {
    if (await migrationErledigt(prisma, ONBOARDING_ABTEILUNGEN_MARKER)) return;

    const [vorlagen, vorlagenPunkte, aufgabenRoh] = await Promise.all([
      prisma.checklistTemplate.findMany({ select: { id: true, name: true } }),
      prisma.checklistTemplateItem.findMany({
        select: { id: true, templateId: true, title: true, defaultAssignee: true, defaultDueDays: true },
        orderBy: [{ templateId: "asc" }, { orderIndex: "asc" }],
      }),
      prisma.checklistItem.findMany({
        select: {
          id: true,
          templateItemId: true,
          title: true,
          assignee: true,
          relativeDueDays: true,
          onboarding: { select: { checklistTemplateId: true } },
        },
      }),
    ]);
    const aufgaben = aufgabenRoh.map((a) => ({
      id: a.id,
      templateItemId: a.templateItemId,
      title: a.title,
      assignee: a.assignee,
      relativeDueDays: a.relativeDueDays,
      checklistTemplateId: a.onboarding ? a.onboarding.checklistTemplateId : null,
    }));

    const plan = planeOnboardingAbteilungsaufgaben({ vorlagen, vorlagenPunkte, aufgaben });

    const schreibvorgaenge = [];
    for (const p of plan.punkte) {
      schreibvorgaenge.push(
        prisma.checklistTemplateItem.updateMany({
          where: { id: p.id, defaultAssignee: p.von },
          data: { defaultAssignee: p.nach },
        }),
      );
    }
    for (const z of plan.zuordnungen) {
      schreibvorgaenge.push(
        prisma.checklistItem.updateMany({ where: { assignee: z.von }, data: { assignee: z.nach } }),
      );
    }
    for (const f of plan.faelligkeiten) {
      for (let i = 0; i < f.ids.length; i += MIGRATION_ID_BLOCK) {
        schreibvorgaenge.push(
          prisma.checklistItem.updateMany({
            where: { id: { in: f.ids.slice(i, i + MIGRATION_ID_BLOCK) }, relativeDueDays: null },
            data: { relativeDueDays: f.tage },
          }),
        );
      }
    }
    const mitTagen = plan.faelligkeiten.reduce((summe, f) => summe + f.ids.length, 0);
    schreibvorgaenge.push(
      markiereMigration(prisma, ONBOARDING_ABTEILUNGEN_MARKER, {
        geprueft: { vorlagen: vorlagen.length, vorlagenPunkte: vorlagenPunkte.length, aufgaben: aufgaben.length },
        // Der Rueckweg: jeder alte Wert.
        vorlagenPunkte: plan.punkte,
        aufgaben: plan.zuordnungen,
        faelligkeiten: plan.faelligkeiten.map((f) => ({ tage: f.tage, anzahl: f.ids.length })),
        faelligkeitUeberTitel: plan.ueberTitel,
        unbekannt: plan.unbekannt,
      }),
    );

    await prisma.$transaction(schreibvorgaenge);

    console.log(
      "Onboarding-Abteilungsaufgaben (" + ONBOARDING_ABTEILUNGEN_MARKER + "): " +
        plan.punkte.length + " Vorlagenpunkte und " +
        plan.zuordnungen.reduce((s, z) => s + z.anzahl, 0) + " Aufgaben auf Schluessel umgestellt, " +
        mitTagen + " Aufgaben mit Tagesangabe (davon ueber den Titel: " + plan.ueberTitel + ").",
    );
    if (plan.unbekannt.length > 0) {
      console.warn(
        "Onboarding-Abteilungsaufgaben: unbekannte Zustaendigkeiten (nicht geaendert, bitte unter Checklisten-Vorlagen zuordnen): " +
          plan.unbekannt
            .map((u) => "\"" + u.text + "\" (" + u.vorlagenPunkte + " Vorlagenpunkte, " + u.aufgaben + " Aufgaben)")
            .join(", "),
      );
    }
  } catch (error) {
    // Nicht kritisch fuer den Start: Ohne Umstellung bleiben die Freitexte
    // stehen (Anzeige wie bisher, kein Versand per Link). Ohne Merker laeuft
    // die Migration beim naechsten Start erneut.
    console.error("Onboarding-Abteilungsaufgaben-Migration fehlgeschlagen:", error.message);
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
    await ensureStellenbezeichnungLabels(prisma);
    // Nach den Snapshot-Migrationen: Die Heilung zieht deren Korrekturen bei
    // festhaengenden Vorgaengen nach und braucht dafuer ihre Merker.
    await migriereParalleleSpuren(prisma);
    // Paket 5: Zustaendigkeiten der Onboarding-Checklisten auf Schluessel.
    // Auf einer frischen Datenbank (Seed folgt unten) setzt sie nur den
    // Merker — deshalb legt prisma/seed.ts die Vorlagen schon mit Schluesseln an.
    await migriereOnboardingAbteilungsaufgaben(prisma);

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
  STELLENBEZEICHNUNG_LABEL_MARKER,
  STELLENBEZEICHNUNG_ALTES_LABEL,
  STELLENBEZEICHNUNG_NEUES_LABEL,
  planeStellenbezeichnungLabels,
  MINIJOB_TEMPLATE_MARKER,
  MINIJOB_RENTE_MARKER,
  MINIJOB_STEP6_MARKER,
  renteSchrittAktiv,
  aktiviereRenteSchritt,
  PARALLELE_SPUREN_MARKER,
  SPUREN_HR_STATUS,
  spurenGesamtStatus,
  planeSnapshotNachzug,
  planeStatusAbgleich,
  ONBOARDING_ABTEILUNGEN_MARKER,
  abteilungAusZustaendigkeitJs,
  istOffboardingVorlagenNameJs,
  planeOnboardingAbteilungsaufgaben,
};
