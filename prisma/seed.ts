/**
 * CREDO HR-Portal – Datenbank Seed Script
 *
 * Legt die Grunddaten einer frischen Installation an: die 16 Mandanten der
 * CREDO Gruppe, den initialen Admin-User, Formular-, Checklisten-,
 * Exit-Interview-, Zeugnis- und Beurteilungsvorlagen und die zentralen
 * Abteilungs-Platzhalter.
 *
 * REGEL: NUR ANLEGEN, WAS FEHLT. Eine vorhandene Zeile wird nie geaendert und
 * nie geloescht — kein update/delete, jedes upsert mit `update: {}`. Auf einer
 * leeren Datenbank entsteht genau derselbe Stand wie frueher. Auf einer
 * gefuellten meldet jeder Bereich, was „vorhanden, unverändert" bleibt, legt
 * aber an, was unter seinem Schluessel fehlt — auch, was HR bewusst geloescht
 * oder umbenannt hat (eine geloeschte Offboarding-Checkliste kaeme zurueck).
 * Folgenlos ist ein Lauf dort also nicht.
 *
 * WARUM: HR pflegt all diese Daten in der Oberflaeche (Mandantenverwaltung,
 * Formular- und Checklisten-Vorlagen, Exit-Interview, Zeugnis- und
 * Beurteilungsvorlagen samt Formulierungen). Bis 10/2026 setzte jeder Lauf sie
 * auf den Stand dieser Datei zurueck: Mandantennamen und Fragebogen-Schritte
 * ueberschrieben, Checklisten-Punkte geloescht und neu angelegt
 * (`ChecklistItem.templateItemId` laufender Vorgaenge zeigte danach ins
 * Leere), Exit-Interview-, Zeugnis- und Beurteilungsvorlagen geloescht und neu
 * erzeugt — mit ihnen alles, was HR daran gepflegt hatte.
 *
 * Auf dem Server deshalb NIE von Hand ausfuehren — er braucht es auch nicht:
 * Der Entrypoint ruft `prisma/seed-check.js`, und der startet `prisma/seed.js`
 * (diese Datei, beim Build mit esbuild gebuendelt) nur, solange es noch keinen
 * Benutzer gibt.
 * Wer bestehende Vorlagen aendern muss, schreibt eine einmalige
 * Datenmigration in `prisma/seed-check.js` (Merker `SystemMigration`), nicht
 * hierher. `src/__tests__/lib/seed-schutz.test.ts` haelt die Regel fest.
 */

import { PrismaClient, OrganizationType, UserRole, QuestionnaireType, ExitInterviewQuestionType, ZeugnisJobGroup } from "@prisma/client";
import { hashSync } from "bcryptjs";
import crypto from "crypto";
import { ALL_DEFAULT_BEURTEILUNG_TEMPLATES } from "../src/lib/beurteilung-defaults";
import { generateFullStepsConfig } from "../src/lib/field-definitions";

const prisma = new PrismaClient();

/**
 * Ein Punkt einer Checklisten-Vorlage im Seed.
 *
 * `defaultAssignee` ist ein Abteilungs-SCHLUESSEL (siehe DEPARTMENT_KEYS in
 * src/lib/constants.ts), kein Freitext — nur so kann HR die Aufgabe im Vorgang
 * per Link an die Abteilung schicken. `description` ist der optionale Hinweis
 * fuer die zustaendige Stelle (hoechstens 500 Zeichen); er wird beim Anlegen
 * eines Vorgangs in die Aufgabe kopiert und steht auf der Link-Seite und in der
 * Mail.
 */
type SeedVorlagenPunkt = {
  title: string;
  category: string;
  orderIndex: number;
  defaultDueDays: number;
  defaultAssignee: string;
  description?: string;
};

/** Eine Checklisten-Vorlage im Seed (ohne Punkte). */
type SeedCheckliste = {
  id: string;
  name: string;
  description: string;
  questionnaireType: QuestionnaireType | null;
};

function vorhandenMelden(bereich: string, bezeichnung: string) {
  console.log(`  ⏭️  ${bereich} vorhanden, unverändert: ${bezeichnung}`);
}

function bilanzMelden(bereich: string, angelegt: number, gesamt: number) {
  console.log(`\n📋 ${bereich}: ${angelegt} von ${gesamt} neu angelegt, vorhandene unverändert.\n`);
}

/**
 * Legt eine Checklisten-Vorlage samt Punkten an — nur, wenn es sie noch nicht
 * gibt. Punkte einer vorhandenen Vorlage fasst der Seed nie an: Laufende
 * Vorgaenge zeigen ueber `ChecklistItem.templateItemId` auf sie.
 *
 * Als vorhanden gilt auch eine Vorlage, die ihren Platz schon einnimmt: gleicher
 * Name (so sucht das Offboarding, `src/lib/offboarding.ts`) oder gleicher
 * Fragebogentyp (so sucht `POST /api/onboarding`). Sonst holte ein Lauf eine
 * Vorlage zurueck, die HR geloescht und durch eine eigene ersetzt hat, und beide
 * stuenden zur Wahl. Punkte und Vorlage entstehen in EINEM Aufruf — eine halb
 * angelegte Vorlage galte beim naechsten Lauf als vorhanden.
 */
async function checklisteAnlegen(vorlage: SeedCheckliste, punkte: SeedVorlagenPunkt[]): Promise<boolean> {
  const vorhanden = await prisma.checklistTemplate.findFirst({
    where: {
      OR: [
        { id: vorlage.id },
        { name: vorlage.name },
        ...(vorlage.questionnaireType ? [{ questionnaireType: vorlage.questionnaireType }] : []),
      ],
    },
    select: { name: true },
  });
  if (vorhanden) {
    vorhandenMelden("Checkliste", vorhanden.name);
    return false;
  }
  await prisma.checklistTemplate.create({
    data: { ...vorlage, isActive: true, items: { create: punkte } },
  });
  console.log(`  ✅ Checkliste: ${vorlage.name} (${punkte.length} Punkte)`);
  return true;
}

async function main() {
  console.log("🏫 Seeding CREDO HR-Portal Datenbank...\n");

  // =============================================
  // 1. Mandanten / Einrichtungen (aus Mandantenuebersicht.xlsx)
  // =============================================
  const organizations = [
    // Sorted by mandantNumber ascending (aus Mandantenuebersicht.xlsx)
    {
      mandantNumber: "712",
      name: "GS Haddenhausen",
      shortName: "GSH",
      type: OrganizationType.GRUNDSCHULE,
    },
    {
      mandantNumber: "719",
      name: "GS Stemwede",
      shortName: "GSS",
      type: OrganizationType.GRUNDSCHULE,
    },
    {
      mandantNumber: "721",
      name: "Gesamtschule",
      shortName: "GES",
      type: OrganizationType.GESAMTSCHULE,
    },
    {
      mandantNumber: "728",
      name: "GS Minderheide",
      shortName: "GSM",
      type: OrganizationType.GRUNDSCHULE,
    },
    {
      mandantNumber: "734",
      name: "Christlicher Schulfoerderverein FES Minden e.V.",
      shortName: "SFV-FES",
      type: OrganizationType.VEREIN,
    },
    {
      mandantNumber: "735",
      name: "Christlicher Schulfoerderverein Minden e.V.",
      shortName: "SFV-MI",
      type: OrganizationType.VEREIN,
    },
    {
      mandantNumber: "736",
      name: "Maranatha GmbH",
      shortName: "MAR",
      type: OrganizationType.GMBH,
    },
    {
      mandantNumber: "737",
      name: "Gymnasium",
      shortName: "GYM",
      type: OrganizationType.GYMNASIUM,
    },
    {
      mandantNumber: "742",
      name: "KiTa Minden",
      shortName: "KITA-MI",
      type: OrganizationType.KITA,
    },
    {
      mandantNumber: "743",
      name: "KiTa Espelkamp",
      shortName: "KITA-ES",
      type: OrganizationType.KITA,
    },
    {
      mandantNumber: "747",
      name: "HELEX.IT GmbH",
      shortName: "HLX",
      type: OrganizationType.GMBH,
    },
    {
      mandantNumber: "764",
      name: "FES Objekt Service GmbH",
      shortName: "FOS",
      type: OrganizationType.GMBH,
    },
    {
      mandantNumber: "766",
      name: "KiTa Herford",
      shortName: "KITA-HF",
      type: OrganizationType.KITA,
    },
    {
      mandantNumber: "767",
      name: "Berufskolleg",
      shortName: "BK",
      type: OrganizationType.BERUFSKOLLEG,
    },
    {
      mandantNumber: "768",
      name: "Christliche Familienhilfe Minden e. V.",
      shortName: "CFH",
      type: OrganizationType.VEREIN,
    },
    {
      mandantNumber: "769",
      name: "KiTa Porta Westfalica",
      shortName: "KITA-PW",
      type: OrganizationType.KITA,
    },
  ];

  // Name, Kuerzel und Typ pflegt HR in der Mandantenverwaltung — ein
  // vorhandener Mandant bleibt, wie er ist.
  let mandantenAngelegt = 0;
  for (const org of organizations) {
    const vorhanden = await prisma.organization.findUnique({
      where: { mandantNumber: org.mandantNumber },
      select: { name: true },
    });
    if (vorhanden) {
      vorhandenMelden("Mandant", `${org.mandantNumber} - ${vorhanden.name}`);
      continue;
    }
    await prisma.organization.create({ data: org });
    mandantenAngelegt++;
    console.log(`  ✅ ${org.mandantNumber} - ${org.name} (${org.shortName})`);
  }

  bilanzMelden("Mandanten", mandantenAngelegt, organizations.length);

  // =============================================
  // 2. Admin-User (Dimitri)
  // =============================================
  // Nur in einer Datenbank ohne jeden Benutzer — dieselbe Regel wie
  // `prisma/seed-check.js`. Eine Pruefung je Adresse legte nach einer
  // geaenderten Admin-Adresse (Benutzerverwaltung) ein zweites SUPER_ADMIN-Konto
  // an, samt Passwort in der Konsole. Vorher pruefen statt upsert: Bei einem
  // vorhandenen Konto stuende sonst ein Passwort im Kasten unten, das nie
  // gesetzt wurde.
  const adminEmail = "dimitri@credo-gruppe.de";
  const vorhandeneBenutzer = await prisma.user.count();

  if (vorhandeneBenutzer > 0) {
    vorhandenMelden(
      "Benutzer",
      `${vorhandeneBenutzer} Konto/Konten — kein Admin-User angelegt, Passwörter nicht geändert\n`,
    );
  } else {
    // Sicheres Zufallspasswort generieren (NICHT das schwache "admin2026"!)
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(16).toString("hex");

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashSync(initialPassword, 12),
        firstName: "Dimitri",
        lastName: "Riesen",
        role: UserRole.SUPER_ADMIN,
      },
    });

    console.log(
      `👤 Admin-User angelegt: ${adminUser.firstName} ${adminUser.lastName} (${adminUser.email})`
    );
    console.log(`   Rolle: ${adminUser.role}`);
    console.log(`\n   ╔══════════════════════════════════════════════╗`);
    console.log(`   ║  INITIALES PASSWORT: ${initialPassword}`);
    console.log(`   ║  BITTE SOFORT AENDERN!`);
    console.log(`   ╚══════════════════════════════════════════════╝\n`);
  }

  // =============================================
  // 3. Formularvorlagen (Default-Templates je QuestionnaireType)
  // =============================================
  console.log("📋 Formularvorlagen anlegen...\n");

  // Schrittnummern und Titel kommen aus der zentralen Definition
  // (src/lib/fragebogen-steps.ts). Hier wird nur noch entschieden, welche
  // Schritte eine Vorlage abschaltet.
  const stepsExcept = (disabled: number[]) =>
    generateFullStepsConfig().map((s) => ({
      ...s,
      enabled: !disabled.includes(s.step),
    }));

  // Schritt 11 (Rentenversicherung) ist eine Minijob-Angelegenheit und bleibt
  // in allen anderen Vorlagen aus.
  const allStepsEnabled = stepsExcept([11]);

  /**
   * Minijob: Der Steuer-Schritt bleibt aktiv, wird aber auf die Steuer-ID
   * reduziert. Die Checkliste der Minijob-Zentrale verlangt die Steuer-ID;
   * Steuerklasse, Freibetraege und Religionszugehoerigkeit spielen bei
   * Pauschalbesteuerung keine Rolle und wuerden als Pflichtfelder stoeren.
   */
  const minijobTaxFields = (
    generateFullStepsConfig().find((s) => s.step === 5)?.fields ?? []
  ).map((f) =>
    f.name === "taxId"
      ? { ...f, visible: true, required: true }
      : { ...f, visible: false, required: false },
  );

  /**
   * Minijob: Es faellt kein Schritt mehr weg — der Steuer-Schritt wird nur auf
   * die Steuer-ID reduziert (siehe oben).
   *
   * Der Masernschutz (9) war bis 07.09.2026 abgeschaltet mit der Begruendung,
   * er sei fuer geringfuegig Beschaeftigte nicht einschlaegig. Das war falsch:
   * Das Infektionsschutzgesetz knuepft an die **Taetigkeit in der
   * Gemeinschaftseinrichtung** an, nicht an den Umfang der Beschaeftigung. Eine
   * Aushilfe in der Kita faellt genauso darunter wie eine Erzieherin in
   * Vollzeit. Ob daraus eine Dokumentenpflicht wird, entscheidet sich ohnehin
   * erst am Vorgang (Geburtsjahr ab 1971 und Einrichtungstyp, siehe
   * src/lib/masernschutz.ts) — der Schritt stellt nur die Frage.
   *
   * "Bildung & Beruf" bleibt bewusst aktiv: Der Taetigkeitsschluessel der
   * Meldung zur Sozialversicherung verlangt Schulabschluss und
   * Berufsausbildung auch bei geringfuegig Beschaeftigten (Entscheidung
   * 25.08.2026). "Weitere Beschaeftigung" bleibt aktiv, weil die
   * Beitragsverfahrensverordnung genau diese Erklaerung verlangt.
   */
  const minijobSteps = stepsExcept([]).map((s) =>
    s.step === 5 ? { ...s, fields: minijobTaxFields } : s,
  );

  /**
   * Ehrenamt: minimaler Fragebogen — plus Masernschutz (9).
   *
   * Ehrenamtliche, die regelmaessig in einer Kita oder Schule taetig sind,
   * fallen fachlich unter dieselbe Vorschrift wie Angestellte (Entscheidung
   * 07.09.2026). Der Schritt kostet sie eine Frage; die Pflicht zum Nachweis
   * entsteht auch hier nur bei Geburtsjahr ab 1971 und Gemeinschafts-
   * einrichtung, und sie haelt das Absenden nicht auf.
   */
  const ehrenamtSteps = stepsExcept([3, 4, 5, 6, 7, 8, 11]);

  const formTemplates = [
    {
      questionnaireType: QuestionnaireType.STANDARD,
      name: "Standard (TV-L)",
      description: "Standardfragebogen für Angestellte nach TV-L",
      stepsConfig: allStepsEnabled,
    },
    {
      questionnaireType: QuestionnaireType.BEAMTE,
      name: "Beamte (Planstellen)",
      description: "Fragebogen für Planstelleninhaber / Beamte",
      stepsConfig: allStepsEnabled,
    },
    {
      questionnaireType: QuestionnaireType.ERZIEHER,
      name: "Erzieher (TV-L S)",
      description: "Fragebogen für Kita-Personal nach TV-L S (inkl. Masernschutz)",
      stepsConfig: allStepsEnabled,
    },
    {
      questionnaireType: QuestionnaireType.MINIJOB,
      name: "Minijob",
      description: "Vereinfachter Fragebogen für geringfuegig Beschaeftigte",
      stepsConfig: minijobSteps,
    },
    {
      questionnaireType: QuestionnaireType.EHRENAMT,
      name: "Ehrenamt",
      description: "Minimaler Fragebogen für ehrenamtliche Mitarbeiter",
      stepsConfig: ehrenamtSteps,
    },
  ];

  // Eine vorhandene Vorlage bleibt, wie HR sie im Vorlagen-Editor eingestellt
  // hat. Neue Schritte oder Felder fuer Bestaende bringt eine einmalige
  // Migration in prisma/seed-check.js (z.B. FORMTEMPLATE_MASERNSCHUTZ_V1).
  let formularvorlagenAngelegt = 0;
  for (const tmpl of formTemplates) {
    const vorhanden = await prisma.formTemplate.findUnique({
      where: { questionnaireType: tmpl.questionnaireType },
      select: { name: true },
    });
    if (vorhanden) {
      vorhandenMelden("Vorlage", `${vorhanden.name} (${tmpl.questionnaireType})`);
      continue;
    }
    // stepsConfig ist eine Json-Spalte. StepFieldConfig ist ein Interface mit
    // optionalem `fields` und damit fuer Prismas InputJsonValue nicht direkt
    // zuweisbar — der Umweg ueber `object` ist hier der uebliche Weg.
    const stepsConfig = tmpl.stepsConfig as unknown as object;
    await prisma.formTemplate.create({ data: { ...tmpl, stepsConfig } });
    formularvorlagenAngelegt++;
    console.log(`  ✅ Vorlage: ${tmpl.name} (${tmpl.questionnaireType})`);
  }

  bilanzMelden("Formularvorlagen", formularvorlagenAngelegt, formTemplates.length);

  // =============================================
  // 4. Checklisten-Vorlagen (Standard-Checklisten für Onboarding)
  // =============================================
  //
  // WICHTIG (Paket 5): `defaultAssignee` ist ein SCHLUESSEL (HR, IT,
  // VERWALTUNG, VORGESETZTER, DSB …), kein Freitext. Frueher stand hier
  // „Verwaltung" bzw. „Vorgesetzter"; daraus wurde nie eine Abteilung, an die
  // ein Link haette gehen koennen. Die einmalige Datenmigration
  // ONBOARDING_ABTEILUNGSAUFGABEN_V1 (prisma/seed-check.js) stellt Bestaende
  // um — sie laeuft aber VOR dem Seed und setzt auf einer leeren Datenbank nur
  // ihren Merker. Ohne Schluessel hier haette eine frische Installation also
  // wieder Freitext. `src/__tests__/api/checklisten-vorlagen.test.ts` haelt das
  // fest.
  //
  // Die Punkte, Tagesangaben und Hinweise folgen dem Vorschlag
  // „Standard-Einstellung (TV-L)" aus dem Aenderungsplan (Paket 5). In der
  // Produktion sind die Vorlagen Daten von HR — der Seed legt sie nur an, wenn
  // sie fehlen (`checklisteAnlegen`).
  // BUCHHALTUNG bekommt bewusst keinen Standardpunkt (Gehalt laeuft ueber
  // LOGA/HR, Datensparsamkeit).
  console.log("📋 Checklisten-Vorlagen anlegen...\n");

  // Checkliste 1: Standard-Einstellung (TV-L)
  const standardItems: SeedVorlagenPunkt[] = [
    // Kategorie: Vor Arbeitsbeginn
    { title: "Arbeitsvertrag erstellt und versendet", category: "Vor Arbeitsbeginn", orderIndex: 0, defaultDueDays: -14, defaultAssignee: "HR" },
    { title: "Arbeitsvertrag unterschrieben retour", category: "Vor Arbeitsbeginn", orderIndex: 1, defaultDueDays: -7, defaultAssignee: "HR" },
    {
      title: "Benutzerkonto und dienstliche E-Mail-Adresse anlegen",
      category: "Vor Arbeitsbeginn",
      orderIndex: 2,
      defaultDueDays: -7,
      defaultAssignee: "IT",
      description: "Konto in der Schulverwaltung und im Microsoft-365-Mandanten der Einrichtung; Zugangsdaten an die Führungskraft.",
    },
    {
      title: "Zugänge zu Fachanwendungen einrichten",
      category: "Vor Arbeitsbeginn",
      orderIndex: 3,
      defaultDueDays: -3,
      defaultAssignee: "IT",
      description: "Schulverwaltung, Lernplattform, Zeiterfassung.",
    },
    { title: "Schlüssel/Transponder bestellen", category: "Vor Arbeitsbeginn", orderIndex: 4, defaultDueDays: -7, defaultAssignee: "VERWALTUNG" },
    { title: "Postfach, Namensschild und Telefonliste vorbereiten", category: "Vor Arbeitsbeginn", orderIndex: 5, defaultDueDays: -3, defaultAssignee: "VERWALTUNG" },
    { title: "Einarbeitungspatin/-paten benennen", category: "Vor Arbeitsbeginn", orderIndex: 6, defaultDueDays: -7, defaultAssignee: "VORGESETZTER" },
    { title: "Arbeitsplatz bzw. Einsatz- und Stundenplan vorbereiten", category: "Vor Arbeitsbeginn", orderIndex: 7, defaultDueDays: -3, defaultAssignee: "VORGESETZTER" },
    // Kategorie: Erster Arbeitstag
    { title: "Begrüßung und Vorstellung im Team", category: "Erster Arbeitstag", orderIndex: 8, defaultDueDays: 0, defaultAssignee: "VORGESETZTER" },
    { title: "Arbeitsplatz/Endgerät einrichten, Zugangsdaten übergeben", category: "Erster Arbeitstag", orderIndex: 9, defaultDueDays: 0, defaultAssignee: "IT" },
    { title: "Schlüsselübergabe dokumentieren", category: "Erster Arbeitstag", orderIndex: 10, defaultDueDays: 0, defaultAssignee: "VERWALTUNG" },
    { title: "Einweisung Arbeitssicherheit", category: "Erster Arbeitstag", orderIndex: 11, defaultDueDays: 0, defaultAssignee: "HR" },
    // Kategorie: Erste Woche
    {
      title: "Datenschutz-Unterweisung und Verpflichtung auf Vertraulichkeit",
      category: "Erste Woche",
      orderIndex: 12,
      defaultDueDays: 7,
      defaultAssignee: "DSB",
    },
    { title: "Einarbeitungsplan besprochen", category: "Erste Woche", orderIndex: 13, defaultDueDays: 5, defaultAssignee: "VORGESETZTER" },
    { title: "Zeiterfassung eingerichtet", category: "Erste Woche", orderIndex: 14, defaultDueDays: 5, defaultAssignee: "HR" },
    // Kategorie: Dokumente
    { title: "Personalfragebogen vollständig", category: "Dokumente", orderIndex: 15, defaultDueDays: 0, defaultAssignee: "HR" },
    { title: "Alle Unterlagen eingegangen", category: "Dokumente", orderIndex: 16, defaultDueDays: 14, defaultAssignee: "HR" },
    { title: "Daten in LOGA erfasst", category: "Dokumente", orderIndex: 17, defaultDueDays: 14, defaultAssignee: "HR" },
    // Kategorie: Einarbeitung
    { title: "Feedbackgespräch nach sechs Wochen", category: "Einarbeitung", orderIndex: 18, defaultDueDays: 42, defaultAssignee: "VORGESETZTER" },
  ];

  // Checkliste 2: Minijob-Einstellung
  const minijobItems: SeedVorlagenPunkt[] = [
    // Kategorie: Vor Arbeitsbeginn
    { title: "Arbeitsvertrag erstellt", category: "Vor Arbeitsbeginn", orderIndex: 0, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "RV-Befreiungsantrag geklärt", category: "Vor Arbeitsbeginn", orderIndex: 1, defaultDueDays: -7, defaultAssignee: "HR" },
    {
      title: "Schlüssel/Transponder bestellen (falls nötig)",
      category: "Vor Arbeitsbeginn",
      orderIndex: 2,
      defaultDueDays: -3,
      defaultAssignee: "VERWALTUNG",
    },
    // Kategorie: Dokumente
    { title: "Personalfragebogen vollständig", category: "Dokumente", orderIndex: 3, defaultDueDays: 0, defaultAssignee: "HR" },
    { title: "Daten in LOGA erfasst", category: "Dokumente", orderIndex: 4, defaultDueDays: 7, defaultAssignee: "HR" },
  ];

  const onboardingChecklisten: { vorlage: SeedCheckliste; punkte: SeedVorlagenPunkt[] }[] = [
    {
      vorlage: {
        id: "seed-checklist-standard",
        name: "Standard-Einstellung (TV-L)",
        description: "Standard-Checkliste für Einstellungen nach TV-L",
        questionnaireType: QuestionnaireType.STANDARD,
      },
      punkte: standardItems,
    },
    {
      vorlage: {
        id: "seed-checklist-minijob",
        name: "Minijob-Einstellung",
        description: "Vereinfachte Checkliste für Minijob-Einstellungen",
        questionnaireType: QuestionnaireType.MINIJOB,
      },
      punkte: minijobItems,
    },
  ];

  let checklistenAngelegt = 0;
  for (const { vorlage, punkte } of onboardingChecklisten) {
    if (await checklisteAnlegen(vorlage, punkte)) checklistenAngelegt++;
  }

  bilanzMelden("Checklisten-Vorlagen", checklistenAngelegt, onboardingChecklisten.length);

  // =============================================
  // 5. Offboarding Checklisten-Vorlagen
  // =============================================
  console.log("📋 Offboarding Checklisten-Vorlagen anlegen...\n");

  // 5a) Standard-Offboarding (18 Items)
  const offboardingStandardItems: SeedVorlagenPunkt[] = [
    // Phase 1: Sofort (Tag der Kuendigung)
    { title: "Kuendigungsbestaetigung erstellen", category: "Phase 1: Sofort", orderIndex: 0, defaultDueDays: -30, defaultAssignee: "HR" },
    { title: "Kuendigungsfrist berechnen und pruefen", category: "Phase 1: Sofort", orderIndex: 1, defaultDueDays: -30, defaultAssignee: "HR" },
    { title: "Resturlaub berechnen und abstimmen", category: "Phase 1: Sofort", orderIndex: 2, defaultDueDays: -28, defaultAssignee: "HR" },
    { title: "IT-Abteilung über Austritt informieren", category: "Phase 1: Sofort", orderIndex: 3, defaultDueDays: -28, defaultAssignee: "HR" },
    { title: "Team über bevorstehenden Austritt informieren", category: "Phase 1: Sofort", orderIndex: 4, defaultDueDays: -28, defaultAssignee: "VORGESETZTER" },
    // Phase 2: Erste Woche
    { title: "Nachfolgeplanung einleiten", category: "Phase 2: Erste Woche", orderIndex: 5, defaultDueDays: -21, defaultAssignee: "VORGESETZTER" },
    { title: "Uebergabeplan erstellen", category: "Phase 2: Erste Woche", orderIndex: 6, defaultDueDays: -21, defaultAssignee: "MITARBEITER" },
    { title: "Stellenausschreibung pruefen", category: "Phase 2: Erste Woche", orderIndex: 7, defaultDueDays: -21, defaultAssignee: "HR" },
    // Phase 3: Uebergabe
    { title: "Wissenstransfer durchfuehren", category: "Phase 3: Uebergabe", orderIndex: 8, defaultDueDays: -14, defaultAssignee: "MITARBEITER" },
    { title: "Dokumentation aktualisieren und uebergeben", category: "Phase 3: Uebergabe", orderIndex: 9, defaultDueDays: -7, defaultAssignee: "MITARBEITER" },
    { title: "Arbeitszeugnis erstellen", category: "Phase 3: Uebergabe", orderIndex: 10, defaultDueDays: -7, defaultAssignee: "HR" },
    // Phase 4: Letzte Woche
    { title: "Exit-Interview durchfuehren", category: "Phase 4: Letzte Woche", orderIndex: 11, defaultDueDays: -5, defaultAssignee: "HR" },
    { title: "Rueckgabe aller Arbeitsmittel", category: "Phase 4: Letzte Woche", orderIndex: 12, defaultDueDays: -2, defaultAssignee: "MITARBEITER" },
    { title: "IT-Zugaenge zur Sperrung vorbereiten", category: "Phase 4: Letzte Woche", orderIndex: 13, defaultDueDays: -2, defaultAssignee: "IT" },
    // Phase 5: Letzter Tag
    { title: "IT-Zugaenge und E-Mail-Konto sperren", category: "Phase 5: Letzter Tag", orderIndex: 14, defaultDueDays: 0, defaultAssignee: "IT" },
    { title: "Physische Zugaenge entziehen (Schlüssel, Karten)", category: "Phase 5: Letzter Tag", orderIndex: 15, defaultDueDays: 0, defaultAssignee: "FACILITY" },
    // Phase 6: Nach Austritt
    { title: "Arbeitsbescheinigung an Agentur für Arbeit", category: "Phase 6: Nach Austritt", orderIndex: 16, defaultDueDays: 3, defaultAssignee: "HR" },
    { title: "SV-Abmeldung durchfuehren", category: "Phase 6: Nach Austritt", orderIndex: 17, defaultDueDays: 42, defaultAssignee: "HR" },
  ];

  // 5b) Bildungseinrichtung-Offboarding (22 Items = Standard + 4 Extra)
  const offboardingBildungItems: SeedVorlagenPunkt[] = [
    // Alle Standard-Items uebernehmen
    ...offboardingStandardItems,
    // Zusaetzliche Bildungseinrichtungs-Items
    { title: "Eltern über Personalwechsel informieren", category: "Phase 2: Erste Woche", orderIndex: 18, defaultDueDays: -14, defaultAssignee: "VORGESETZTER" },
    { title: "Entwicklungsdokumentationen uebergeben", category: "Phase 3: Uebergabe", orderIndex: 19, defaultDueDays: -7, defaultAssignee: "MITARBEITER" },
    { title: "Fortbildungsnachweise archivieren", category: "Phase 3: Uebergabe", orderIndex: 20, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "Vertretungsregelung für Betreuungsgruppen sicherstellen", category: "Phase 2: Erste Woche", orderIndex: 21, defaultDueDays: -21, defaultAssignee: "VORGESETZTER" },
  ];

  // 5c) Beamten-Offboarding (15 Items)
  const offboardingBeamteItems: SeedVorlagenPunkt[] = [
    // Phase 1: Sofort
    { title: "Entlassungsantrag / Versetzungsverfuegung pruefen", category: "Phase 1: Sofort", orderIndex: 0, defaultDueDays: -30, defaultAssignee: "HR" },
    { title: "Dienstherr über Entlassung informieren", category: "Phase 1: Sofort", orderIndex: 1, defaultDueDays: -30, defaultAssignee: "HR" },
    { title: "Personalrat beteiligen", category: "Phase 1: Sofort", orderIndex: 2, defaultDueDays: -28, defaultAssignee: "HR" },
    // Phase 2: Erste Woche
    { title: "Nachfolgeplanung einleiten", category: "Phase 2: Erste Woche", orderIndex: 3, defaultDueDays: -21, defaultAssignee: "VORGESETZTER" },
    { title: "Dienstakten zusammenstellen", category: "Phase 2: Erste Woche", orderIndex: 4, defaultDueDays: -21, defaultAssignee: "HR" },
    { title: "Beihilfeansprueche klaeren", category: "Phase 2: Erste Woche", orderIndex: 5, defaultDueDays: -21, defaultAssignee: "HR" },
    // Phase 3: Uebergabe
    { title: "Dienstliche Aufgaben uebergeben", category: "Phase 3: Uebergabe", orderIndex: 6, defaultDueDays: -14, defaultAssignee: "MITARBEITER" },
    { title: "Dienstakten an neue Dienststelle uebergeben", category: "Phase 3: Uebergabe", orderIndex: 7, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "Dienstzeugnis erstellen", category: "Phase 3: Uebergabe", orderIndex: 8, defaultDueDays: -7, defaultAssignee: "HR" },
    // Phase 4: Letzte Woche
    { title: "Exit-Interview durchfuehren", category: "Phase 4: Letzte Woche", orderIndex: 9, defaultDueDays: -5, defaultAssignee: "HR" },
    { title: "Rueckgabe Dienstausweis und Arbeitsmittel", category: "Phase 4: Letzte Woche", orderIndex: 10, defaultDueDays: -2, defaultAssignee: "MITARBEITER" },
    // Phase 5: Letzter Tag
    { title: "IT-Zugaenge und Dienstmail sperren", category: "Phase 5: Letzter Tag", orderIndex: 11, defaultDueDays: 0, defaultAssignee: "IT" },
    { title: "Physische Zugaenge entziehen", category: "Phase 5: Letzter Tag", orderIndex: 12, defaultDueDays: 0, defaultAssignee: "FACILITY" },
    // Phase 6: Nach Austritt
    { title: "Versorgungsansprueche dokumentieren", category: "Phase 6: Nach Austritt", orderIndex: 13, defaultDueDays: 7, defaultAssignee: "HR" },
    { title: "Entlassungsurkunde ausstellen", category: "Phase 6: Nach Austritt", orderIndex: 14, defaultDueDays: 14, defaultAssignee: "HR" },
  ];

  // 5d) Minijob-Offboarding (10 Items)
  const offboardingMinijobItems: SeedVorlagenPunkt[] = [
    // Phase 1: Sofort
    { title: "Kuendigungsbestaetigung erstellen", category: "Phase 1: Sofort", orderIndex: 0, defaultDueDays: -14, defaultAssignee: "HR" },
    { title: "Kuendigungsfrist pruefen", category: "Phase 1: Sofort", orderIndex: 1, defaultDueDays: -14, defaultAssignee: "HR" },
    { title: "Resturlaub berechnen", category: "Phase 1: Sofort", orderIndex: 2, defaultDueDays: -14, defaultAssignee: "HR" },
    // Phase 2: Uebergabe
    { title: "Aufgaben uebergeben", category: "Phase 2: Uebergabe", orderIndex: 3, defaultDueDays: -7, defaultAssignee: "MITARBEITER" },
    { title: "Arbeitsmittel zurueckgeben", category: "Phase 2: Uebergabe", orderIndex: 4, defaultDueDays: -2, defaultAssignee: "MITARBEITER" },
    // Phase 3: Letzter Tag
    { title: "IT-Zugaenge sperren (falls vorhanden)", category: "Phase 3: Letzter Tag", orderIndex: 5, defaultDueDays: 0, defaultAssignee: "IT" },
    { title: "Schlüssel / Zugangskarten einziehen", category: "Phase 3: Letzter Tag", orderIndex: 6, defaultDueDays: 0, defaultAssignee: "FACILITY" },
    // Phase 4: Nach Austritt
    { title: "Endabrechnung erstellen", category: "Phase 4: Nach Austritt", orderIndex: 7, defaultDueDays: 3, defaultAssignee: "HR" },
    { title: "Arbeitsbescheinigung ausstellen", category: "Phase 4: Nach Austritt", orderIndex: 8, defaultDueDays: 3, defaultAssignee: "HR" },
    { title: "Minijob-Zentrale Abmeldung", category: "Phase 4: Nach Austritt", orderIndex: 9, defaultDueDays: 14, defaultAssignee: "HR" },
  ];

  // Das Offboarding sucht seine Vorlage ueber den Namen (src/lib/offboarding.ts).
  const offboardingChecklisten: { vorlage: SeedCheckliste; punkte: SeedVorlagenPunkt[] }[] = [
    {
      vorlage: {
        id: "seed-offboarding-standard",
        name: "Offboarding: Standard-Offboarding",
        description: "Standard-Checkliste für alle Offboarding-Prozesse",
        questionnaireType: null,
      },
      punkte: offboardingStandardItems,
    },
    {
      vorlage: {
        id: "seed-offboarding-bildung",
        name: "Offboarding: Bildungseinrichtung",
        description: "Erweiterte Checkliste für Bildungseinrichtungen (Schulen, KiTas)",
        questionnaireType: null,
      },
      punkte: offboardingBildungItems,
    },
    {
      vorlage: {
        id: "seed-offboarding-beamte",
        name: "Offboarding: Beamte",
        description: "Checkliste für Beamten-Entlassung / Versetzung",
        questionnaireType: null,
      },
      punkte: offboardingBeamteItems,
    },
    {
      vorlage: {
        id: "seed-offboarding-minijob",
        name: "Offboarding: Minijob",
        description: "Vereinfachte Checkliste für Minijob-Austritte",
        questionnaireType: null,
      },
      punkte: offboardingMinijobItems,
    },
  ];

  let offboardingChecklistenAngelegt = 0;
  for (const { vorlage, punkte } of offboardingChecklisten) {
    if (await checklisteAnlegen(vorlage, punkte)) offboardingChecklistenAngelegt++;
  }

  bilanzMelden("Offboarding Checklisten-Vorlagen", offboardingChecklistenAngelegt, offboardingChecklisten.length);

  // =============================================
  // 6. Standard-Abteilungs-Konfigurationen (zentral, ohne Mandant)
  // =============================================
  // NUR ANLEGEN, NIE AKTUALISIEREN (Paket 1b, M15). Frueher setzte jeder Lauf
  // Name und Adresse vorhandener Eintraege auf die Platzhalter unten zurueck —
  // ein versehentliches `node prisma/seed.js` auf dem Server haette die unter
  // Einstellungen → Abteilungen gepflegten Adressen ueberschrieben, und die
  // Abteilungsaufgaben waeren an *@credo-gruppe.de gegangen. Ein vorhandener
  // zentraler Eintrag bleibt deshalb, wie er ist, auch wenn er deaktiviert ist.
  // VERWALTUNG fehlt bewusst: Das Sekretariat hat je Einrichtung eine eigene
  // Adresse, ein zentraler Platzhalter waere falsch.
  //
  // Und NUR bei der Erstinstallation (noch gar keine Abteilung): Wer unter
  // Einstellungen → Abteilungen eine zentrale Platzhalterzeile bewusst
  // geloescht hat, bekaeme sie sonst beim naechsten Seed-Lauf aktiv mit
  // *@credo-gruppe.de zurueck — und Einrichtungen ohne eigenen Eintrag ihre
  // Aufgaben wieder an diese Adresse.
  const departmentConfigs = [
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo-gruppe.de" },
    { departmentKey: "FACILITY", departmentName: "Facility Management", email: "facility@credo-gruppe.de" },
    { departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", email: "buchhaltung@credo-gruppe.de" },
    { departmentKey: "DSB", departmentName: "Datenschutzbeauftragte/r", email: "dsb@credo-gruppe.de" },
  ];

  const vorhandeneAbteilungen = await prisma.departmentConfig.count();
  let departmentConfigsAngelegt = 0;
  if (vorhandeneAbteilungen > 0) {
    console.log(
      `📋 Abteilungs-Konfigurationen: ${vorhandeneAbteilungen} vorhanden — keine Platzhalter angelegt (Pflege unter Einstellungen → Abteilungen).\n`,
    );
  } else {
    console.log("📋 Abteilungs-Konfigurationen anlegen (Erstinstallation)...\n");
  }
  for (const dept of vorhandeneAbteilungen > 0 ? [] : departmentConfigs) {
    // findFirst statt findUnique: Der zusammengesetzte Schluessel nimmt
    // organizationId null nicht an (zentral).
    const existing = await prisma.departmentConfig.findFirst({
      where: { departmentKey: dept.departmentKey, organizationId: null },
    });

    if (existing) {
      console.log(`  ⏭️  Abteilung vorhanden, unverändert: ${existing.departmentName} (${existing.email})`);
      continue;
    }

    await prisma.departmentConfig.create({
      data: {
        departmentKey: dept.departmentKey,
        departmentName: dept.departmentName,
        email: dept.email,
        organizationId: null,
      },
    });
    departmentConfigsAngelegt++;
    console.log(`  ✅ Abteilung angelegt: ${dept.departmentName} (${dept.email})`);
  }

  console.log(
    `\n📋 ${departmentConfigsAngelegt} von ${departmentConfigs.length} Abteilungs-Konfigurationen neu angelegt.\n`,
  );

  // =============================================
  // 7. Phase 2: Exit-Interview Default Template
  // =============================================
  console.log("📋 Phase 2: Exit-Interview Template anlegen...\n");

  async function exitInterviewVorlageAnlegen() {
    const exitTemplate = await prisma.exitInterviewTemplate.create({
      data: {
        name: "Standard Exit-Interview",
        isDefault: true,
        isActive: true,
        introText: "Vielen Dank für Ihre Arbeit bei der CREDO Bildungsgruppe. Auch wenn sich unsere Wege nun trennen, ist uns Ihre Meinung weiterhin sehr wichtig. Mit diesem vertraulichen Fragebogen möchten wir verstehen, was wir als Arbeitgeber gut machen — und wo wir uns verbessern können. Ausfüllzeit: ca. 8-10 Minuten.",
        dsgvoText: "Die Teilnahme ist vollständig freiwillig. Eine Nicht-Teilnahme hat keinerlei Nachteile. Zweck: Verbesserung der Arbeitsbedingungen und Mitarbeiterzufriedenheit. Rechtsgrundlage: Einwilligung gemäß Art. 6 Abs. 1 a DSGVO. Speicherdauer: Rohdaten 24 Monate, aggregierte Daten unbefristet. Widerruf: Jederzeit per E-Mail an datenschutz@credo-gruppe.de.",
        categories: {
          create: [
            {
              name: "Austrittsgrund",
              orderIndex: 0,
              questions: {
                create: [
                  {
                    questionText: "Was waren die Hauptgründe für Ihren Austritt?",
                    questionType: ExitInterviewQuestionType.MULTIPLE_CHOICE,
                    orderIndex: 0,
                    options: ["Besseres Gehaltsangebot", "Mangelnde Entwicklungsmöglichkeiten", "Unzufriedenheit mit der Führung", "Work-Life-Balance", "Betriebsklima", "Persönliche Gründe", "Befristung ausgelaufen", "Gesundheitliche Gründe", "Berufliche Veränderung", "Arbeitsbedingungen", "Sonstiges"],
                  },
                  {
                    questionText: "Welcher Grund war der ausschlaggebende?",
                    questionType: ExitInterviewQuestionType.FREE_TEXT,
                    orderIndex: 1,
                  },
                  {
                    questionText: "Hätte etwas getan werden können, um Sie zu halten?",
                    questionType: ExitInterviewQuestionType.SINGLE_CHOICE,
                    orderIndex: 2,
                    options: ["Ja, definitiv", "Vielleicht", "Nein, meine Entscheidung stand fest"],
                  },
                ],
              },
            },
            {
              name: "Führung & Management",
              orderIndex: 1,
              questions: {
                create: [
                  {
                    questionText: "Zufriedenheit mit der Führungsqualität",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Regelmäßiges konstruktives Feedback erhalten",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                  {
                    questionText: "Unterstützung und Wertschätzung durch Vorgesetzte",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 2,
                  },
                  {
                    questionText: "Was hätte Ihre Führungskraft besser machen können?",
                    questionType: ExitInterviewQuestionType.FREE_TEXT,
                    orderIndex: 3,
                    isRequired: false,
                  },
                ],
              },
            },
            {
              name: "Einrichtungskultur",
              orderIndex: 2,
              questions: {
                create: [
                  {
                    questionText: "Betriebsklima und Zusammenarbeit im Team",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Zugehörigkeit und Respekt",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                  {
                    questionText: "Beschreiben Sie die Kultur in drei Worten",
                    questionType: ExitInterviewQuestionType.FREE_TEXT,
                    orderIndex: 2,
                    isRequired: false,
                  },
                ],
              },
            },
            {
              name: "Berufliche Entwicklung",
              orderIndex: 3,
              questions: {
                create: [
                  {
                    questionText: "Möglichkeiten zur Weiterbildung",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Klare berufliche Perspektiven",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                  {
                    questionText: "Relevanz der Fortbildungen",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 2,
                    roleFilter: "LEHRKRAFT",
                  },
                ],
              },
            },
            {
              name: "Vergütung & Benefits",
              orderIndex: 4,
              questions: {
                create: [
                  {
                    questionText: "Angemessenheit des Gehalts",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Attraktivität der Sozialleistungen",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                  {
                    questionText: "Transparenz der Vergütung",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 2,
                  },
                ],
              },
            },
            {
              name: "Work-Life-Balance",
              orderIndex: 5,
              questions: {
                create: [
                  {
                    questionText: "Angemessenheit der Arbeitsbelastung",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Vereinbarkeit von Beruf und Privatleben",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                  {
                    questionText: "Verhältnis pädagogische Arbeit vs. Administration",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 2,
                    roleFilter: "LEHRKRAFT",
                  },
                ],
              },
            },
            {
              name: "Arbeitsbedingungen",
              orderIndex: 6,
              questions: {
                create: [
                  {
                    questionText: "Räumliche und technische Ausstattung",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Materialien und Ressourcen",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                ],
              },
            },
            {
              name: "Kommunikation",
              orderIndex: 7,
              questions: {
                create: [
                  {
                    questionText: "Interne Kommunikation und Transparenz",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Offenheit für Verbesserungsvorschläge",
                    questionType: ExitInterviewQuestionType.RATING_5_STAR,
                    orderIndex: 1,
                  },
                ],
              },
            },
            {
              name: "Gesamtbewertung",
              orderIndex: 8,
              questions: {
                create: [
                  {
                    questionText: "Wie wahrscheinlich würden Sie CREDO als Arbeitgeber weiterempfehlen?",
                    questionType: ExitInterviewQuestionType.ENPS,
                    orderIndex: 0,
                  },
                  {
                    questionText: "Wäre eine Rückkehr zu CREDO vorstellbar?",
                    questionType: ExitInterviewQuestionType.SINGLE_CHOICE,
                    orderIndex: 1,
                    options: ["Ja", "Unter bestimmten Bedingungen", "Eher nicht", "Nein"],
                  },
                  {
                    questionText: "Ein Rat an die Leitung zur Verbesserung",
                    questionType: ExitInterviewQuestionType.FREE_TEXT,
                    orderIndex: 2,
                    isRequired: false,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    console.log(`  ✅ Exit-Interview Template: ${exitTemplate.name} (9 Kategorien, 26 Fragen)`);
  }

  // Nur, wenn es noch GAR KEINE Exit-Interview-Vorlage gibt — nicht je Name:
  // Hat HR die Standardvorlage umbenannt, stuende sonst eine zweite mit
  // `isDefault` daneben. Fragen und Kategorien pflegt HR in der Oberflaeche.
  try {
    const vorhandeneExitVorlagen = await prisma.exitInterviewTemplate.count();
    if (vorhandeneExitVorlagen > 0) {
      vorhandenMelden("Exit-Interview-Vorlage", `${vorhandeneExitVorlagen} Vorlage(n)`);
    } else {
      await exitInterviewVorlageAnlegen();
    }
  } catch (error) {
    console.error("  ⚠️ Exit-Interview Template konnte nicht angelegt werden:", error);
  }

  // =============================================
  // 8. Phase 2: Zeugnis-Bewertungsbogen Templates
  // =============================================
  console.log("\n📋 Phase 2: Zeugnis-Bewertungsbogen Templates anlegen...\n");

  const gesamtFormulierungen = [
    { criterionKey: "GESAMT", grade: 1, formulation: "stets zu unserer vollsten Zufriedenheit" },
    { criterionKey: "GESAMT", grade: 2, formulation: "stets zu unserer vollen Zufriedenheit" },
    { criterionKey: "GESAMT", grade: 3, formulation: "zu unserer vollen Zufriedenheit" },
    { criterionKey: "GESAMT", grade: 4, formulation: "zu unserer Zufriedenheit" },
    { criterionKey: "GESAMT", grade: 5, formulation: "im Großen und Ganzen zu unserer Zufriedenheit" },
    { criterionKey: "GESAMT", grade: 6, formulation: "hat sich bemüht, den Anforderungen gerecht zu werden" },
  ];

  const zeugnisTemplates = [
    {
      jobGroup: ZeugnisJobGroup.LEHRKRAFT,
      name: "Bewertungsbogen Lehrkraft",
      categories: [
        {
          name: "Fachkompetenz", weight: 2.0, orderIndex: 0,
          criteria: [
            { name: "Fachwissen", orderIndex: 0 },
            { name: "Didaktisch-methodische Kompetenz", orderIndex: 1 },
            { name: "Fortbildungsbereitschaft", orderIndex: 2 },
          ],
        },
        {
          name: "Pädagogische Kompetenz", weight: 2.5, orderIndex: 1,
          criteria: [
            { name: "Unterrichtsgestaltung", orderIndex: 0 },
            { name: "Differenzierung", orderIndex: 1 },
            { name: "Lernerfolgskontrolle", orderIndex: 2 },
            { name: "Classroom Management", orderIndex: 3 },
          ],
        },
        {
          name: "Arbeitsverhalten", weight: 1.5, orderIndex: 2,
          criteria: [
            { name: "Arbeitsbereitschaft", orderIndex: 0 },
            { name: "Zuverlässigkeit", orderIndex: 1 },
            { name: "Belastbarkeit", orderIndex: 2 },
          ],
        },
        {
          name: "Sozialverhalten", weight: 2.0, orderIndex: 3,
          criteria: [
            { name: "Verhalten ggü. Vorgesetzten", orderIndex: 0 },
            { name: "Verhalten ggü. Kollegen", orderIndex: 1 },
            { name: "Verhalten ggü. Schülern", orderIndex: 2 },
            { name: "Elternarbeit", orderIndex: 3 },
          ],
        },
        {
          name: "Besondere Leistungen", weight: 2.0, orderIndex: 4,
          criteria: [
            { name: "Außerunterrichtliches Engagement", orderIndex: 0 },
            { name: "Inklusion", orderIndex: 1 },
            { name: "Digitale Kompetenz", orderIndex: 2 },
          ],
        },
      ],
    },
    {
      jobGroup: ZeugnisJobGroup.ERZIEHER,
      name: "Bewertungsbogen Erzieher/in",
      categories: [
        {
          name: "Pädagogische Kompetenz", weight: 3.0, orderIndex: 0,
          criteria: [
            { name: "Fachwissen", orderIndex: 0 },
            { name: "Förderung der Kinder", orderIndex: 1 },
            { name: "Beobachtung/Dokumentation", orderIndex: 2 },
            { name: "Spielpädagogik", orderIndex: 3 },
          ],
        },
        {
          name: "Arbeitsverhalten", weight: 1.5, orderIndex: 1,
          criteria: [
            { name: "Eigeninitiative", orderIndex: 0 },
            { name: "Zuverlässigkeit", orderIndex: 1 },
            { name: "Belastbarkeit", orderIndex: 2 },
            { name: "Organisation", orderIndex: 3 },
          ],
        },
        {
          name: "Sozialverhalten", weight: 2.5, orderIndex: 2,
          criteria: [
            { name: "Verhalten ggü. Vorgesetzten", orderIndex: 0 },
            { name: "Verhalten ggü. Kollegen", orderIndex: 1 },
            { name: "Verhalten ggü. Kindern", orderIndex: 2 },
            { name: "Elternarbeit", orderIndex: 3 },
          ],
        },
        {
          name: "Spezifische Kompetenzen", weight: 2.0, orderIndex: 3,
          criteria: [
            { name: "Hygiene/Sicherheit", orderIndex: 0 },
            { name: "Kreativität", orderIndex: 1 },
            { name: "Sprachförderung", orderIndex: 2 },
            { name: "Inklusion", orderIndex: 3 },
          ],
        },
        {
          name: "Fortbildung", weight: 1.0, orderIndex: 4,
          criteria: [
            { name: "Fortbildungsbereitschaft", orderIndex: 0 },
            { name: "Reflexionsfähigkeit", orderIndex: 1 },
          ],
        },
      ],
    },
    {
      jobGroup: ZeugnisJobGroup.VERWALTUNG,
      name: "Bewertungsbogen Verwaltung",
      categories: [
        {
          name: "Fachkompetenz", weight: 2.5, orderIndex: 0,
          criteria: [
            { name: "Fachwissen", orderIndex: 0 },
            { name: "IT-Kompetenz", orderIndex: 1 },
            { name: "Fortbildungsbereitschaft", orderIndex: 2 },
          ],
        },
        {
          name: "Arbeitsweise", weight: 3.0, orderIndex: 1,
          criteria: [
            { name: "Sorgfalt/Genauigkeit", orderIndex: 0 },
            { name: "Selbstständigkeit", orderIndex: 1 },
            { name: "Effizienz", orderIndex: 2 },
            { name: "Zuverlässigkeit", orderIndex: 3 },
            { name: "Belastbarkeit", orderIndex: 4 },
          ],
        },
        {
          name: "Sozialverhalten", weight: 2.5, orderIndex: 2,
          criteria: [
            { name: "Verhalten ggü. Vorgesetzten", orderIndex: 0 },
            { name: "Verhalten ggü. Kollegen", orderIndex: 1 },
            { name: "Verhalten ggü. Externen", orderIndex: 2 },
          ],
        },
        {
          name: "Spezifische Kompetenzen", weight: 2.0, orderIndex: 3,
          criteria: [
            { name: "Datenschutz", orderIndex: 0 },
            { name: "Kommunikation", orderIndex: 1 },
            { name: "Problemlösung", orderIndex: 2 },
          ],
        },
      ],
    },
    {
      jobGroup: ZeugnisJobGroup.SCHULLEITUNG,
      name: "Bewertungsbogen Schulleitung",
      categories: [
        {
          name: "Führungskompetenz", weight: 3.0, orderIndex: 0,
          criteria: [
            { name: "Mitarbeiterführung", orderIndex: 0 },
            { name: "Führungsstil", orderIndex: 1 },
            { name: "Delegation", orderIndex: 2 },
            { name: "Konfliktmanagement", orderIndex: 3 },
            { name: "Vorbildfunktion", orderIndex: 4 },
          ],
        },
        {
          name: "Strategische Kompetenz", weight: 2.0, orderIndex: 1,
          criteria: [
            { name: "Schulentwicklung", orderIndex: 0 },
            { name: "Konzeptentwicklung", orderIndex: 1 },
            { name: "Change Management", orderIndex: 2 },
            { name: "Entscheidungsfähigkeit", orderIndex: 3 },
          ],
        },
        {
          name: "Fachkompetenz", weight: 1.5, orderIndex: 2,
          criteria: [
            { name: "Pädagogisches Wissen", orderIndex: 0 },
            { name: "Rechtskenntnisse", orderIndex: 1 },
            { name: "Budgetkompetenz", orderIndex: 2 },
          ],
        },
        {
          name: "Soziale Kompetenz", weight: 2.0, orderIndex: 3,
          criteria: [
            { name: "Verhalten ggü. Träger", orderIndex: 0 },
            { name: "Verhalten ggü. Mitarbeitern", orderIndex: 1 },
            { name: "Verhalten ggü. Eltern/Öffentlichkeit", orderIndex: 2 },
          ],
        },
        {
          name: "Ergebnisse", weight: 1.5, orderIndex: 4,
          criteria: [
            { name: "Zielerreichung", orderIndex: 0 },
            { name: "Messbare Erfolge", orderIndex: 1 },
            { name: "Teamleistung", orderIndex: 2 },
          ],
        },
      ],
    },
    {
      jobGroup: ZeugnisJobGroup.SONSTIGES,
      name: "Bewertungsbogen Sonstiges Personal",
      categories: [
        {
          name: "Fachkompetenz", weight: 2.5, orderIndex: 0,
          criteria: [
            { name: "Fachkenntnisse", orderIndex: 0 },
            { name: "Problemlösung", orderIndex: 1 },
            { name: "Sicherheitsbewusstsein", orderIndex: 2 },
          ],
        },
        {
          name: "Arbeitsweise", weight: 3.0, orderIndex: 1,
          criteria: [
            { name: "Sorgfalt", orderIndex: 0 },
            { name: "Selbstständigkeit", orderIndex: 1 },
            { name: "Effizienz", orderIndex: 2 },
            { name: "Zuverlässigkeit", orderIndex: 3 },
            { name: "Belastbarkeit", orderIndex: 4 },
          ],
        },
        {
          name: "Sozialverhalten", weight: 2.5, orderIndex: 2,
          criteria: [
            { name: "Verhalten ggü. Vorgesetzten", orderIndex: 0 },
            { name: "Verhalten ggü. Kollegen", orderIndex: 1 },
            { name: "Verhalten ggü. Externen", orderIndex: 2 },
          ],
        },
        {
          name: "Spezifisches", weight: 2.0, orderIndex: 3,
          criteria: [
            { name: "Hygiene/Ordnung", orderIndex: 0 },
            { name: "Flexibilität", orderIndex: 1 },
            { name: "Wirtschaftliches Handeln", orderIndex: 2 },
          ],
        },
      ],
    },
  ];

  // Je Berufsgruppe nur, wenn es fuer sie noch keine Vorlage gibt. Kategorien,
  // Kriterien und Formulierungen pflegt HR in der Oberflaeche — frueher loeschte
  // jeder Lauf die Vorlage samt allem daran (Cascade) und legte sie neu an.
  let zeugnisVorlagenAngelegt = 0;
  for (const tmpl of zeugnisTemplates) {
    try {
      const vorhanden = await prisma.zeugnisBewertungTemplate.findFirst({
        where: { jobGroup: tmpl.jobGroup },
        select: { name: true },
      });
      if (vorhanden) {
        vorhandenMelden("Zeugnis Template", `${vorhanden.name} (${tmpl.jobGroup})`);
        continue;
      }

      const created = await prisma.zeugnisBewertungTemplate.create({
        data: {
          name: tmpl.name,
          jobGroup: tmpl.jobGroup,
          isActive: true,
          categories: {
            create: tmpl.categories.map((cat) => ({
              name: cat.name,
              weight: cat.weight,
              orderIndex: cat.orderIndex,
              criteria: {
                create: cat.criteria.map((crit) => ({
                  name: crit.name,
                  orderIndex: crit.orderIndex,
                })),
              },
            })),
          },
          formulierungen: {
            create: gesamtFormulierungen,
          },
        },
      });

      const criteriaCount = tmpl.categories.reduce((sum, cat) => sum + cat.criteria.length, 0);
      zeugnisVorlagenAngelegt++;
      console.log(`  ✅ Zeugnis Template: ${created.name} (${tmpl.categories.length} Kategorien, ${criteriaCount} Kriterien, 6 Formulierungen)`);
    } catch (error) {
      console.error(`  ⚠️ Zeugnis Template ${tmpl.name} konnte nicht angelegt werden:`, error);
    }
  }

  bilanzMelden("Phase 2: Zeugnis-Bewertungsbogen Templates", zeugnisVorlagenAngelegt, zeugnisTemplates.length);

  // =============================================
  // Section 8b: Beurteilungs-Vorlagen (BRL NRW + CREDO Legacy)
  //
  // Globale Defaults — pro Mandant kann später ein Override über die
  // Einstellungen-UI angelegt werden.
  // =============================================
  console.log("\n📋 Phase 4: Beurteilungs-Vorlagen anlegen...\n");

  // Je Name nur, wenn es noch keine globale Vorlage dieses Namens gibt — eine
  // vorhandene bleibt samt Kategorien und Kriterien, wie HR sie gepflegt hat.
  // Eine Standardvorlage (`isDefault`) zusaetzlich nur, solange es keine globale
  // Standardvorlage gibt: Hat HR sie umbenannt oder eine andere zum Standard
  // gemacht, gaebe es sonst zwei — die Oberflaeche haelt je Bereich genau eine,
  // und die Verbeamtung waehlt den globalen Standard per findFirst ohne
  // Reihenfolge (`/api/civil-service/[id]/assessments`).
  let beurteilungsVorlagenAngelegt = 0;
  for (const tmpl of ALL_DEFAULT_BEURTEILUNG_TEMPLATES) {
    try {
      const vorhanden = await prisma.beurteilungTemplate.findFirst({
        where: {
          organizationId: null,
          OR: [{ name: tmpl.name }, ...(tmpl.isDefault ? [{ isDefault: true }] : [])],
        },
        select: { name: true },
      });
      if (vorhanden) {
        vorhandenMelden("Beurteilungs-Vorlage", vorhanden.name);
        continue;
      }

      const created = await prisma.beurteilungTemplate.create({
        data: {
          name: tmpl.name,
          description: tmpl.description ?? null,
          scaleType: tmpl.scaleType,
          scaleLabels: tmpl.scaleLabels,
          organizationId: null, // global
          isActive: true,
          isDefault: tmpl.isDefault,
          version: 1,
          categories: {
            create: tmpl.categories.map((cat) => ({
              name: cat.name,
              description: cat.description ?? null,
              weight: cat.weight ?? 1.0,
              orderIndex: cat.orderIndex,
              isMandatory: cat.isMandatory ?? false,
              legalReference: cat.legalReference ?? null,
              criteria: {
                create: cat.criteria.map((crit) => ({
                  name: crit.name,
                  description: crit.description ?? null,
                  weight: crit.weight ?? 1.0,
                  orderIndex: crit.orderIndex,
                })),
              },
            })),
          },
        },
      });

      const criteriaCount = tmpl.categories.reduce(
        (sum, cat) => sum + cat.criteria.length,
        0,
      );
      const defaultBadge = tmpl.isDefault ? " [DEFAULT]" : "";
      beurteilungsVorlagenAngelegt++;
      console.log(
        `  ✅ Beurteilungs-Vorlage: ${created.name}${defaultBadge} (${tmpl.scaleType}, ${tmpl.categories.length} Kategorien, ${criteriaCount} Kriterien)`,
      );
    } catch (error) {
      console.error(
        `  ⚠️ Beurteilungs-Vorlage ${tmpl.name} konnte nicht angelegt werden:`,
        error,
      );
    }
  }

  bilanzMelden(
    "Phase 4: Beurteilungs-Vorlagen",
    beurteilungsVorlagenAngelegt,
    ALL_DEFAULT_BEURTEILUNG_TEMPLATES.length,
  );

  // =============================================
  // Section 9: Verbeamtung Checklisten-Template
  // =============================================
  console.log("\n📋 Phase 5: Verbeamtung Checklisten-Vorlage anlegen...\n");
  console.log("  ℹ️  Verbeamtung (PSI) Checklisten-Template ist als Konstante in src/lib/civil-service-checklist-template.ts definiert.");
  console.log("  ℹ️  62 Checklistenpunkte werden beim Start eines neuen CivilServiceProcess aus dem Template erzeugt.");
  console.log("  ✅ Verbeamtung Konstanten bereit (Status, Schritte, Phasen, Zuständige, Dokumenttypen).\n");

  console.log("✨ Seeding abgeschlossen!\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed fehlgeschlagen:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
