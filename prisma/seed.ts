/**
 * CREDO HR-Portal – Datenbank Seed Script
 *
 * Erstellt die 16 Mandanten der CREDO Gruppe und
 * einen initialen Admin-User fuer Dimitri.
 */

import { PrismaClient, OrganizationType, UserRole, QuestionnaireType } from "@prisma/client";
import { hashSync } from "bcryptjs";

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
      name: "helex.it GmbH",
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
  const adminUser = await prisma.user.upsert({
    where: { email: "dimitri@credo-gruppe.de" },
    update: {},
    create: {
      email: "dimitri@credo-gruppe.de",
      passwordHash: hashSync("admin2026", 12),
      firstName: "Dimitri",
      lastName: "Riesen",
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log(
    `👤 Admin-User angelegt: ${adminUser.firstName} ${adminUser.lastName} (${adminUser.email})`
  );
  console.log(`   Rolle: ${adminUser.role}`);
  console.log(`   Passwort: admin2026 (BITTE AENDERN!)\n`);

  // =============================================
  // 3. Formularvorlagen (Default-Templates je QuestionnaireType)
  // =============================================
  console.log("📋 Formularvorlagen anlegen...\n");

  const allStepsEnabled = [
    { step: 1, title: "Persoenliche Angaben", enabled: true },
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
    { step: 1, title: "Persoenliche Angaben", enabled: true },
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
    { step: 1, title: "Persoenliche Angaben", enabled: true },
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
      description: "Standardfragebogen fuer Angestellte nach TV-L",
      stepsConfig: allStepsEnabled,
    },
    {
      questionnaireType: QuestionnaireType.BEAMTE,
      name: "Beamte (Planstellen)",
      description: "Fragebogen fuer Planstelleninhaber / Beamte",
      stepsConfig: allStepsEnabled,
    },
    {
      questionnaireType: QuestionnaireType.ERZIEHER,
      name: "Erzieher (TV-L S)",
      description: "Fragebogen fuer Kita-Personal nach TV-L S (inkl. Masernschutz)",
      stepsConfig: allStepsEnabled,
    },
    {
      questionnaireType: QuestionnaireType.MINIJOB,
      name: "Minijob",
      description: "Vereinfachter Fragebogen fuer geringfuegig Beschaeftigte",
      stepsConfig: minijobSteps,
    },
    {
      questionnaireType: QuestionnaireType.EHRENAMT,
      name: "Ehrenamt",
      description: "Minimaler Fragebogen fuer ehrenamtliche Mitarbeiter",
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
  // 4. Checklisten-Vorlagen (Standard-Checklisten fuer Onboarding)
  // =============================================
  console.log("📋 Checklisten-Vorlagen anlegen...\n");

  // Checkliste 1: Standard-Einstellung (TV-L)
  const standardChecklist = await prisma.checklistTemplate.upsert({
    where: { id: "seed-checklist-standard" },
    update: {
      name: "Standard-Einstellung (TV-L)",
      description: "Standard-Checkliste fuer Einstellungen nach TV-L",
      questionnaireType: QuestionnaireType.STANDARD,
      isActive: true,
    },
    create: {
      id: "seed-checklist-standard",
      name: "Standard-Einstellung (TV-L)",
      description: "Standard-Checkliste fuer Einstellungen nach TV-L",
      questionnaireType: QuestionnaireType.STANDARD,
      isActive: true,
    },
  });

  // Items fuer Standard-Checkliste loeschen und neu anlegen
  await prisma.checklistTemplateItem.deleteMany({
    where: { templateId: standardChecklist.id },
  });

  const standardItems = [
    // Kategorie: Vor Arbeitsbeginn
    { title: "Arbeitsvertrag erstellt und versendet", category: "Vor Arbeitsbeginn", orderIndex: 0, defaultDueDays: -14, defaultAssignee: "HR" },
    { title: "Arbeitsvertrag unterschrieben retour", category: "Vor Arbeitsbeginn", orderIndex: 1, defaultDueDays: -7, defaultAssignee: "HR" },
    { title: "IT-Zugaenge beantragt", category: "Vor Arbeitsbeginn", orderIndex: 2, defaultDueDays: -7, defaultAssignee: "IT" },
    { title: "Schluessel/Ausweis bestellt", category: "Vor Arbeitsbeginn", orderIndex: 3, defaultDueDays: -3, defaultAssignee: "Verwaltung" },
    // Kategorie: Erster Arbeitstag
    { title: "Begruessung und Vorstellung im Team", category: "Erster Arbeitstag", orderIndex: 4, defaultDueDays: 0, defaultAssignee: "Vorgesetzter" },
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
      description: "Vereinfachte Checkliste fuer Minijob-Einstellungen",
      questionnaireType: QuestionnaireType.MINIJOB,
      isActive: true,
    },
    create: {
      id: "seed-checklist-minijob",
      name: "Minijob-Einstellung",
      description: "Vereinfachte Checkliste fuer Minijob-Einstellungen",
      questionnaireType: QuestionnaireType.MINIJOB,
      isActive: true,
    },
  });

  // Items fuer Minijob-Checkliste loeschen und neu anlegen
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
