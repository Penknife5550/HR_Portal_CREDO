/**
 * CREDO HR-Portal – Datenbank Seed Script
 *
 * Erstellt die 16 Mandanten der CREDO Gruppe und
 * einen initialen Admin-User für Dimitri.
 */

import { PrismaClient, OrganizationType, UserRole, QuestionnaireType, ExitInterviewQuestionType, ZeugnisJobGroup } from "@prisma/client";
import { hashSync } from "bcryptjs";
import crypto from "crypto";
import { ALL_DEFAULT_BEURTEILUNG_TEMPLATES } from "../src/lib/beurteilung-defaults";

const prisma = new PrismaClient();

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

  for (const org of organizations) {
    await prisma.organization.upsert({
      where: { mandantNumber: org.mandantNumber },
      update: { name: org.name, shortName: org.shortName, type: org.type },
      create: org,
    });
    console.log(`  ✅ ${org.mandantNumber} - ${org.name} (${org.shortName})`);
  }

  console.log(`\n📋 ${organizations.length} Mandanten angelegt/aktualisiert.\n`);

  // =============================================
  // 2. Admin-User (Dimitri)
  // =============================================
  // Sicheres Zufallspasswort generieren (NICHT das schwache "admin2026"!)
  const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(16).toString("hex");

  const adminUser = await prisma.user.upsert({
    where: { email: "dimitri@credo-gruppe.de" },
    update: {},
    create: {
      email: "dimitri@credo-gruppe.de",
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

  // =============================================
  // 3. Formularvorlagen (Default-Templates je QuestionnaireType)
  // =============================================
  console.log("📋 Formularvorlagen anlegen...\n");

  const allStepsEnabled = [
    { step: 1, title: "Persönliche Angaben", enabled: true },
    { step: 2, title: "Adresse & Kontakt", enabled: true },
    { step: 3, title: "Bankverbindung", enabled: true },
    { step: 4, title: "Sozialversicherung", enabled: true },
    { step: 5, title: "Steuer", enabled: true },
    { step: 6, title: "Weitere Beschaeftigung", enabled: true },
    { step: 7, title: "Kinder", enabled: true },
    { step: 8, title: "Bildung & Beruf", enabled: true },
    { step: 9, title: "Masernschutz", enabled: true },
    { step: 10, title: "Zusammenfassung", enabled: true },
  ];

  const minijobSteps = [
    { step: 1, title: "Persönliche Angaben", enabled: true },
    { step: 2, title: "Adresse & Kontakt", enabled: true },
    { step: 3, title: "Bankverbindung", enabled: true },
    { step: 4, title: "Sozialversicherung", enabled: true },
    { step: 5, title: "Steuer", enabled: false },
    { step: 6, title: "Weitere Beschaeftigung", enabled: false },
    { step: 7, title: "Kinder", enabled: false },
    { step: 8, title: "Bildung & Beruf", enabled: false },
    { step: 9, title: "Masernschutz", enabled: false },
    { step: 10, title: "Zusammenfassung", enabled: true },
  ];

  const ehrenamtSteps = [
    { step: 1, title: "Persönliche Angaben", enabled: true },
    { step: 2, title: "Adresse & Kontakt", enabled: true },
    { step: 3, title: "Bankverbindung", enabled: false },
    { step: 4, title: "Sozialversicherung", enabled: false },
    { step: 5, title: "Steuer", enabled: false },
    { step: 6, title: "Weitere Beschaeftigung", enabled: false },
    { step: 7, title: "Kinder", enabled: false },
    { step: 8, title: "Bildung & Beruf", enabled: false },
    { step: 9, title: "Masernschutz", enabled: false },
    { step: 10, title: "Zusammenfassung", enabled: true },
  ];

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

  for (const tmpl of formTemplates) {
    await prisma.formTemplate.upsert({
      where: { questionnaireType: tmpl.questionnaireType },
      update: {
        name: tmpl.name,
        description: tmpl.description,
        stepsConfig: tmpl.stepsConfig,
      },
      create: tmpl,
    });
    console.log(`  ✅ Vorlage: ${tmpl.name} (${tmpl.questionnaireType})`);
  }

  console.log(`\n📋 ${formTemplates.length} Formularvorlagen angelegt/aktualisiert.\n`);

  // =============================================
  // 4. Checklisten-Vorlagen (Standard-Checklisten für Onboarding)
  // =============================================
  console.log("📋 Checklisten-Vorlagen anlegen...\n");

  // Checkliste 1: Standard-Einstellung (TV-L)
  const standardChecklist = await prisma.checklistTemplate.upsert({
    where: { id: "seed-checklist-standard" },
    update: {
      name: "Standard-Einstellung (TV-L)",
      description: "Standard-Checkliste für Einstellungen nach TV-L",
      questionnaireType: QuestionnaireType.STANDARD,
      isActive: true,
    },
    create: {
      id: "seed-checklist-standard",
      name: "Standard-Einstellung (TV-L)",
      description: "Standard-Checkliste für Einstellungen nach TV-L",
      questionnaireType: QuestionnaireType.STANDARD,
      isActive: true,
    },
  });

  // Items für Standard-Checkliste löschen und neu anlegen
  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: standardChecklist.id },
  });

  const standardItems = [
    // Kategorie: Vor Arbeitsbeginn
    { title: "Arbeitsvertrag erstellt und versendet", category: "Vor Arbeitsbeginn", orderIndex: 0, defaultDueDays: -14, defaultAssignee: "HR" },
    { title: "Arbeitsvertrag unterschrieben retour", category: "Vor Arbeitsbeginn", orderIndex: 1, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "IT-Zugaenge beantragt", category: "Vor Arbeitsbeginn", orderIndex: 2, defaultDueDays: -7, defaultAssignee: "IT" },
    { title: "Schlüssel/Ausweis bestellt", category: "Vor Arbeitsbeginn", orderIndex: 3, defaultDueDays: -3, defaultAssignee: "Verwaltung" },
    // Kategorie: Erster Arbeitstag
    { title: "Begrüßung und Vorstellung im Team", category: "Erster Arbeitstag", orderIndex: 4, defaultDueDays: 0, defaultAssignee: "Vorgesetzter" },
    { title: "Arbeitsplatz eingerichtet", category: "Erster Arbeitstag", orderIndex: 5, defaultDueDays: 0, defaultAssignee: "IT" },
    { title: "Einweisung Arbeitssicherheit", category: "Erster Arbeitstag", orderIndex: 6, defaultDueDays: 0, defaultAssignee: "HR" },
    // Kategorie: Erste Woche
    { title: "Schluesseluebergabe dokumentiert", category: "Erste Woche", orderIndex: 7, defaultDueDays: 5, defaultAssignee: "Verwaltung" },
    { title: "Zeiterfassung eingerichtet", category: "Erste Woche", orderIndex: 8, defaultDueDays: 5, defaultAssignee: "HR" },
    { title: "Einarbeitungsplan besprochen", category: "Erste Woche", orderIndex: 9, defaultDueDays: 5, defaultAssignee: "Vorgesetzter" },
    // Kategorie: Dokumente
    { title: "Personalfragebogen vollstaendig", category: "Dokumente", orderIndex: 10, defaultDueDays: 0, defaultAssignee: "HR" },
    { title: "Alle Unterlagen eingegangen", category: "Dokumente", orderIndex: 11, defaultDueDays: 14, defaultAssignee: "HR" },
    { title: "Daten in LOGA erfasst", category: "Dokumente", orderIndex: 12, defaultDueDays: 14, defaultAssignee: "HR" },
  ];

  for (const item of standardItems) {
    await prisma.checklistTemplateItem.create({
      data: {
        templateId: standardChecklist.id,
        ...item,
      },
    });
  }

  console.log(`  ✅ Checkliste: ${standardChecklist.name} (${standardItems.length} Punkte)`);

  // Checkliste 2: Minijob-Einstellung
  const minijobChecklist = await prisma.checklistTemplate.upsert({
    where: { id: "seed-checklist-minijob" },
    update: {
      name: "Minijob-Einstellung",
      description: "Vereinfachte Checkliste für Minijob-Einstellungen",
      questionnaireType: QuestionnaireType.MINIJOB,
      isActive: true,
    },
    create: {
      id: "seed-checklist-minijob",
      name: "Minijob-Einstellung",
      description: "Vereinfachte Checkliste für Minijob-Einstellungen",
      questionnaireType: QuestionnaireType.MINIJOB,
      isActive: true,
    },
  });

  // Items für Minijob-Checkliste löschen und neu anlegen
  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: minijobChecklist.id },
  });

  const minijobItems = [
    // Kategorie: Vor Arbeitsbeginn
    { title: "Arbeitsvertrag erstellt", category: "Vor Arbeitsbeginn", orderIndex: 0, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "RV-Befreiungsantrag geklaert", category: "Vor Arbeitsbeginn", orderIndex: 1, defaultDueDays: -7, defaultAssignee: "HR" },
    // Kategorie: Dokumente
    { title: "Personalfragebogen vollstaendig", category: "Dokumente", orderIndex: 2, defaultDueDays: 0, defaultAssignee: "HR" },
    { title: "Daten in LOGA erfasst", category: "Dokumente", orderIndex: 3, defaultDueDays: 7, defaultAssignee: "HR" },
  ];

  for (const item of minijobItems) {
    await prisma.checklistTemplateItem.create({
      data: {
        templateId: minijobChecklist.id,
        ...item,
      },
    });
  }

  console.log(`  ✅ Checkliste: ${minijobChecklist.name} (${minijobItems.length} Punkte)`);

  console.log(`\n📋 2 Checklisten-Vorlagen angelegt/aktualisiert.\n`);

  // =============================================
  // 5. Offboarding Checklisten-Vorlagen
  // =============================================
  console.log("📋 Offboarding Checklisten-Vorlagen anlegen...\n");

  // 5a) Standard-Offboarding (18 Items)
  const offboardingStandard = await prisma.checklistTemplate.upsert({
    where: { id: "seed-offboarding-standard" },
    update: {
      name: "Offboarding: Standard-Offboarding",
      description: "Standard-Checkliste für alle Offboarding-Prozesse",
      questionnaireType: null,
      isActive: true,
    },
    create: {
      id: "seed-offboarding-standard",
      name: "Offboarding: Standard-Offboarding",
      description: "Standard-Checkliste für alle Offboarding-Prozesse",
      questionnaireType: null,
      isActive: true,
    },
  });

  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: offboardingStandard.id },
  });

  const offboardingStandardItems = [
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

  for (const item of offboardingStandardItems) {
    await prisma.checklistTemplateItem.create({
      data: { templateId: offboardingStandard.id, ...item },
    });
  }

  console.log(`  ✅ Checkliste: ${offboardingStandard.name} (${offboardingStandardItems.length} Punkte)`);

  // 5b) Bildungseinrichtung-Offboarding (22 Items = Standard + 4 Extra)
  const offboardingBildung = await prisma.checklistTemplate.upsert({
    where: { id: "seed-offboarding-bildung" },
    update: {
      name: "Offboarding: Bildungseinrichtung",
      description: "Erweiterte Checkliste für Bildungseinrichtungen (Schulen, KiTas)",
      questionnaireType: null,
      isActive: true,
    },
    create: {
      id: "seed-offboarding-bildung",
      name: "Offboarding: Bildungseinrichtung",
      description: "Erweiterte Checkliste für Bildungseinrichtungen (Schulen, KiTas)",
      questionnaireType: null,
      isActive: true,
    },
  });

  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: offboardingBildung.id },
  });

  const offboardingBildungItems = [
    // Alle Standard-Items uebernehmen
    ...offboardingStandardItems,
    // Zusaetzliche Bildungseinrichtungs-Items
    { title: "Eltern über Personalwechsel informieren", category: "Phase 2: Erste Woche", orderIndex: 18, defaultDueDays: -14, defaultAssignee: "VORGESETZTER" },
    { title: "Entwicklungsdokumentationen uebergeben", category: "Phase 3: Uebergabe", orderIndex: 19, defaultDueDays: -7, defaultAssignee: "MITARBEITER" },
    { title: "Fortbildungsnachweise archivieren", category: "Phase 3: Uebergabe", orderIndex: 20, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "Vertretungsregelung für Betreuungsgruppen sicherstellen", category: "Phase 2: Erste Woche", orderIndex: 21, defaultDueDays: -21, defaultAssignee: "VORGESETZTER" },
  ];

  for (const item of offboardingBildungItems) {
    await prisma.checklistTemplateItem.create({
      data: { templateId: offboardingBildung.id, ...item },
    });
  }

  console.log(`  ✅ Checkliste: ${offboardingBildung.name} (${offboardingBildungItems.length} Punkte)`);

  // 5c) Beamten-Offboarding (15 Items)
  const offboardingBeamte = await prisma.checklistTemplate.upsert({
    where: { id: "seed-offboarding-beamte" },
    update: {
      name: "Offboarding: Beamte",
      description: "Checkliste für Beamten-Entlassung / Versetzung",
      questionnaireType: null,
      isActive: true,
    },
    create: {
      id: "seed-offboarding-beamte",
      name: "Offboarding: Beamte",
      description: "Checkliste für Beamten-Entlassung / Versetzung",
      questionnaireType: null,
      isActive: true,
    },
  });

  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: offboardingBeamte.id },
  });

  const offboardingBeamteItems = [
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

  for (const item of offboardingBeamteItems) {
    await prisma.checklistTemplateItem.create({
      data: { templateId: offboardingBeamte.id, ...item },
    });
  }

  console.log(`  ✅ Checkliste: ${offboardingBeamte.name} (${offboardingBeamteItems.length} Punkte)`);

  // 5d) Minijob-Offboarding (10 Items)
  const offboardingMinijob = await prisma.checklistTemplate.upsert({
    where: { id: "seed-offboarding-minijob" },
    update: {
      name: "Offboarding: Minijob",
      description: "Vereinfachte Checkliste für Minijob-Austritte",
      questionnaireType: null,
      isActive: true,
    },
    create: {
      id: "seed-offboarding-minijob",
      name: "Offboarding: Minijob",
      description: "Vereinfachte Checkliste für Minijob-Austritte",
      questionnaireType: null,
      isActive: true,
    },
  });

  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: offboardingMinijob.id },
  });

  const offboardingMinijobItems = [
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

  for (const item of offboardingMinijobItems) {
    await prisma.checklistTemplateItem.create({
      data: { templateId: offboardingMinijob.id, ...item },
    });
  }

  console.log(`  ✅ Checkliste: ${offboardingMinijob.name} (${offboardingMinijobItems.length} Punkte)`);

  console.log(`\n📋 4 Offboarding Checklisten-Vorlagen angelegt/aktualisiert.\n`);

  // =============================================
  // 6. Standard-Abteilungs-Konfigurationen (zentral, ohne Mandant)
  // =============================================
  console.log("📋 Abteilungs-Konfigurationen anlegen...\n");

  const departmentConfigs = [
    { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo-gruppe.de" },
    { departmentKey: "FACILITY", departmentName: "Facility Management", email: "facility@credo-gruppe.de" },
    { departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", email: "buchhaltung@credo-gruppe.de" },
    { departmentKey: "DSB", departmentName: "Datenschutzbeauftragter", email: "dsb@credo-gruppe.de" },
  ];

  for (const dept of departmentConfigs) {
    const existing = await prisma.departmentConfig.findFirst({
      where: { departmentKey: dept.departmentKey, organizationId: null },
    });

    if (existing) {
      await prisma.departmentConfig.update({
        where: { id: existing.id },
        data: { departmentName: dept.departmentName, email: dept.email },
      });
    } else {
      await prisma.departmentConfig.create({
        data: {
          departmentKey: dept.departmentKey,
          departmentName: dept.departmentName,
          email: dept.email,
          organizationId: null,
        },
      });
    }
    console.log(`  ✅ Abteilung: ${dept.departmentName} (${dept.email})`);
  }

  console.log(`\n📋 ${departmentConfigs.length} Abteilungs-Konfigurationen angelegt/aktualisiert.\n`);

  // =============================================
  // 7. Phase 2: Exit-Interview Default Template
  // =============================================
  console.log("📋 Phase 2: Exit-Interview Template anlegen...\n");

  try {
    // Delete existing default template categories/questions via cascade
    const existingExitTemplate = await prisma.exitInterviewTemplate.findFirst({
      where: { name: "Standard Exit-Interview" },
    });

    if (existingExitTemplate) {
      await prisma.exitInterviewTemplate.delete({
        where: { id: existingExitTemplate.id },
      });
      console.log("  🔄 Bestehendes Exit-Interview Template entfernt (wird neu angelegt).");
    }

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

  for (const tmpl of zeugnisTemplates) {
    try {
      // Delete existing template for this job group (cascade deletes categories, criteria, formulierungen)
      const existingZeugnis = await prisma.zeugnisBewertungTemplate.findFirst({
        where: { jobGroup: tmpl.jobGroup },
      });

      if (existingZeugnis) {
        await prisma.zeugnisBewertungTemplate.delete({
          where: { id: existingZeugnis.id },
        });
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
      console.log(`  ✅ Zeugnis Template: ${created.name} (${tmpl.categories.length} Kategorien, ${criteriaCount} Kriterien, 6 Formulierungen)`);
    } catch (error) {
      console.error(`  ⚠️ Zeugnis Template ${tmpl.name} konnte nicht angelegt werden:`, error);
    }
  }

  console.log(`\n📋 Phase 2: ${zeugnisTemplates.length} Zeugnis-Bewertungsbogen Templates angelegt/aktualisiert.\n`);

  // =============================================
  // Section 8b: Beurteilungs-Vorlagen (BRL NRW + CREDO Legacy)
  //
  // Globale Defaults — pro Mandant kann später ein Override über die
  // Einstellungen-UI angelegt werden.
  // =============================================
  console.log("\n📋 Phase 4: Beurteilungs-Vorlagen anlegen...\n");

  for (const tmpl of ALL_DEFAULT_BEURTEILUNG_TEMPLATES) {
    try {
      // Existierende globale Vorlage mit demselben Namen löschen (idempotent)
      const existing = await prisma.beurteilungTemplate.findFirst({
        where: { name: tmpl.name, organizationId: null },
      });

      if (existing) {
        await prisma.beurteilungTemplate.delete({ where: { id: existing.id } });
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

  console.log(
    `\n📋 Phase 4: ${ALL_DEFAULT_BEURTEILUNG_TEMPLATES.length} Beurteilungs-Vorlagen angelegt/aktualisiert.\n`,
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
