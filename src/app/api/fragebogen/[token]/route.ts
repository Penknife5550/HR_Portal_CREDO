/**
 * API: Personalfragebogen Daten laden & speichern
 *
 * GET  /api/fragebogen/:token  → Lade gespeicherte Fragebogen-Daten
 * PUT  /api/fragebogen/:token  → Speichere/Aktualisiere Step-Daten (Auto-Save)
 * POST /api/fragebogen/:token  → Fragebogen endgültig absenden
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateMagicToken } from "@/lib/auth";
import { triggerN8nWebhook } from "@/lib/n8n";
import { sendEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/encryption";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import {
  computeMissingRequiredDocuments,
  documentTypeLabel,
} from "@/lib/required-documents";
import { MAX_STEP_NUMBER, SUMMARY_STEP_NUMBER } from "@/lib/fragebogen-steps";
import { istBekannteErklaerung } from "@/lib/erklaerung-arbeitnehmer";
import { berechnePruefsumme } from "@/lib/fragebogen-pruefsumme";
import { z } from "zod";

// =============================================
// Serverseitige Validierung: Zod-Schema für alle erlaubten Felder
// Alle Felder sind optional (.optional()), da Auto-Save nur Teilmengen sendet
// =============================================
const fragebogenFieldsSchema = z.object({
  salutation: z.enum(["Herr", "Frau"]).optional(),
  title: z.string().max(100).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  birthName: z.string().max(100).optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().max(200).optional(),
  birthCountry: z.string().max(100).optional(),
  nationality: z.string().max(100).optional(),
  maritalStatus: z.enum(["ledig", "verheiratet", "geschieden", "verwitwet", "getrennt_lebend", "eingetragene_partnerschaft"]).optional(),
  severelyDisabled: z.boolean().optional(),
  disabilityDegree: z.number().min(0).max(100).nullable().optional(),
  street: z.string().max(200).optional(),
  houseNumber: z.string().max(20).optional(),
  zipCode: z.string().max(10).optional(),
  city: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  mobile: z.string().max(50).optional(),
  emailPrivate: z.string().max(200).optional(),
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  bankName: z.string().max(200).optional(),
  accountHolder: z.string().max(200).optional(),
  socialSecurityNumber: z.string().max(20).optional(),
  healthInsuranceName: z.string().max(200).optional(),
  healthInsuranceType: z.enum(["gesetzlich", "privat"]).optional(),
  parentStatus: z.boolean().optional(),
  taxId: z.string().max(20).optional(),
  taxClass: z.enum(["I", "II", "III", "IV", "V", "VI"]).optional(),
  taxAllowance: z.number().min(0).nullable().optional(),
  childAllowance: z.number().min(0).nullable().optional(),
  religion: z.enum(["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"]).optional(),
  highestSchoolDegree: z.enum(["ohne_schulabschluss", "hauptschulabschluss", "mittlere_reife", "abitur_fachabitur", "sonstiges"]).optional(),
  highestProfessionalDegree: z.enum(["ohne_berufsausbildung", "anerkannte_berufsausbildung", "meister_techniker_fachschule", "bachelor", "diplom_magister_master_staatsexamen", "promotion"]).optional(),
  isBeamter: z.boolean().optional(),
  besoldungsgruppe: z.string().max(50).optional(),
  laufbahngruppe: z.string().max(50).optional(),
  dienstzeitBeginn: z.string().optional(),
  amtsbezeichnung: z.string().max(200).optional(),
  verfassungstreuePruefung: z.boolean().optional(),
  hasOtherEmployment: z.boolean().optional(),
  otherEmployerName: z.string().max(200).optional(),
  otherWeeklyHours: z.number().min(0).max(60).nullable().optional(),
  employerType: z.enum(["hauptarbeitgeber", "nebenarbeitgeber", "nein"]).optional(),
  hasMinijob: z.boolean().optional(),
  minijobRvBefreiung: z.boolean().optional(),
  bornAfter1971: z.boolean().optional(),
  masernschutzProvided: z.boolean().optional(),
  // Registry-Nummer des Schritts, auf dem der Vorgang steht — nicht die
  // Anzeigeposition. Obergrenze kommt aus der zentralen Schritt-Definition,
  // damit ein neuer Schritt hier nicht vergessen wird.
  currentStep: z.number().int().min(1).max(MAX_STEP_NUMBER).optional(),
  children: z.array(z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    birthDate: z.string().min(1),
    taxAllowance: z.boolean().optional(),
  })).optional(),
}).strip(); // strip() entfernt unbekannte Felder serverseitig (Defense in Depth zusaetzlich zur Whitelist)

// =============================================
// GET – Fragebogen-Daten laden
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate Limiting gegen Token-Enumeration
  const clientIp = getClientIp(_request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  // GET erlaubt auch SUBMITTED-Status (Anzeige der eingereichten Daten)
  const result = await validateMagicToken(token, { allowSubmitted: true });
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // PersonalData mit Kindern laden
  const personalData = await prisma.personalData.findUnique({
    where: { onboardingId: onboarding.id },
    include: { children: { orderBy: { orderIndex: "asc" } } },
  });

  // Feld-Konfiguration + Pflicht-Dokumente laden.
  // stepsConfig: Snapshot vom Onboarding-Zeitpunkt (oder aktuelles Template).
  // requiredDocuments: immer aus dem aktuellen Template (nicht im Snapshot).
  const formTemplate = await prisma.formTemplate.findUnique({
    where: { questionnaireType: onboarding.questionnaireType },
    select: { stepsConfig: true, requiredDocuments: true },
  });
  const stepsConfig = onboarding.formTemplateSnapshot ?? formTemplate?.stepsConfig ?? null;
  const requiredDocuments = formTemplate?.requiredDocuments ?? [
    "GEBURTSURKUNDE_EIGEN",
    "GEBURTSURKUNDE_KIND",
  ];

  return NextResponse.json({
    onboardingId: onboarding.id,
    email: onboarding.email,
    organization: {
      name: onboarding.organization.name,
      mandantNumber: onboarding.organization.mandantNumber,
      type: onboarding.organization.type,
      // DSGVO: verantwortliche Stelle (pro Mandant konfigurierbar, sonst Default)
      dsgvoVerantwortlicheName: onboarding.organization.dsgvoVerantwortlicheName,
      dsgvoVerantwortlicheStrasse: onboarding.organization.dsgvoVerantwortlicheStrasse,
      dsgvoVerantwortlichePlz: onboarding.organization.dsgvoVerantwortlichePlz,
      dsgvoVerantwortlicheOrt: onboarding.organization.dsgvoVerantwortlicheOrt,
    },
    questionnaireType: onboarding.questionnaireType,
    status: onboarding.status,
    stepsConfig, // Feld-Konfiguration für den Fragebogen
    requiredDocuments, // Pflicht-Dokumente (pro Vorlage konfigurierbar)
    personalData: personalData
      ? {
          ...personalData,
          // Sensible Felder entschluesseln
          iban: personalData.iban ? decrypt(personalData.iban) : "",
          socialSecurityNumber: personalData.socialSecurityNumber ? decrypt(personalData.socialSecurityNumber) : "",
          taxId: personalData.taxId ? decrypt(personalData.taxId) : "",
          // Dates als ISO strings
          birthDate: personalData.birthDate?.toISOString().split("T")[0] ?? "",
          dienstzeitBeginn:
            personalData.dienstzeitBeginn?.toISOString().split("T")[0] ?? "",
          children: personalData.children.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName ?? "",
            birthDate: c.birthDate.toISOString().split("T")[0],
            taxAllowance: c.taxAllowance,
          })),
        }
      : null,
  });
}

// =============================================
// PUT – Auto-Save (Step-Daten speichern)
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate-Limiting
  const clientIp = getClientIp(request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  const result = await validateMagicToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;
  const body = await request.json();

  // Serverseitige Zod-Validierung
  const parsed = fragebogenFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { currentStep, children, ...data } = parsed.data;

  // Status auf IN_PROGRESS setzen falls noch INVITED
  if (onboarding.status === "INVITED") {
    await prisma.onboardingProcess.update({
      where: { id: onboarding.id },
      data: { status: "IN_PROGRESS" },
    });
  }

  // Whitelist erlaubter Felder (Mass-Assignment-Schutz)
  const ALLOWED_FIELDS = new Set([
    "salutation", "title", "firstName", "lastName", "birthName",
    "birthDate", "birthPlace", "birthCountry", "nationality",
    "maritalStatus", "severelyDisabled", "disabilityDegree",
    "street", "houseNumber", "zipCode", "city", "country",
    "phone", "mobile", "emailPrivate",
    "iban", "bic", "bankName", "accountHolder",
    "socialSecurityNumber", "healthInsuranceName", "healthInsuranceType",
    "parentStatus", "taxId", "taxClass", "taxAllowance", "childAllowance",
    "religion", "highestSchoolDegree", "highestProfessionalDegree",
    "isBeamter", "besoldungsgruppe", "laufbahngruppe", "dienstzeitBeginn",
    "amtsbezeichnung", "verfassungstreuePruefung",
    "hasOtherEmployment", "otherEmployerName", "otherWeeklyHours",
    "employerType", "hasMinijob", "minijobRvBefreiung",
    "bornAfter1971", "masernschutzProvided",
  ]);

  // PersonalData upserten (erstellen oder aktualisieren)
  const updateData: Record<string, unknown> = {};

  // Nur gesetzte UND erlaubte Felder uebernehmen (kein Ueberschreiben mit null)
  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_FIELDS.has(key) && value !== undefined && value !== null && value !== "") {
      updateData[key] = value;
    }
  }

  // Speziell: Booleans und 0 erlauben
  if (typeof data.severelyDisabled === "boolean")
    updateData.severelyDisabled = data.severelyDisabled;
  if (typeof data.parentStatus === "boolean")
    updateData.parentStatus = data.parentStatus;
  if (typeof data.hasOtherEmployment === "boolean")
    updateData.hasOtherEmployment = data.hasOtherEmployment;
  if (typeof data.isBeamter === "boolean")
    updateData.isBeamter = data.isBeamter;
  if (typeof data.bornAfter1971 === "boolean")
    updateData.bornAfter1971 = data.bornAfter1971;
  if (typeof data.masernschutzProvided === "boolean")
    updateData.masernschutzProvided = data.masernschutzProvided;
  if (typeof data.verfassungstreuePruefung === "boolean")
    updateData.verfassungstreuePruefung = data.verfassungstreuePruefung;
  if (typeof data.hasMinijob === "boolean")
    updateData.hasMinijob = data.hasMinijob;
  if (typeof data.minijobRvBefreiung === "boolean")
    updateData.minijobRvBefreiung = data.minijobRvBefreiung;

  // Datumsfelder konvertieren
  if (data.birthDate) updateData.birthDate = new Date(data.birthDate);
  if (data.dienstzeitBeginn)
    updateData.dienstzeitBeginn = new Date(data.dienstzeitBeginn);

  // currentStep aktualisieren
  if (typeof currentStep === "number") {
    updateData.currentStep = currentStep;
  }

  // Sensible Felder verschluesseln (DSGVO Art. 32)
  if (isEncryptionConfigured()) {
    const ENCRYPTED_FIELDS = ["iban", "socialSecurityNumber", "taxId"];
    for (const field of ENCRYPTED_FIELDS) {
      if (typeof updateData[field] === "string" && updateData[field]) {
        updateData[field] = encrypt(updateData[field] as string);
      }
    }
  }

  const personalData = await prisma.personalData.upsert({
    where: { onboardingId: onboarding.id },
    create: {
      onboardingId: onboarding.id,
      ...updateData,
    },
    update: updateData,
  });

  // Kinder separat behandeln (replace-Strategie)
  if (Array.isArray(children)) {
    // Alte Kinder löschen
    await prisma.child.deleteMany({
      where: { personalDataId: personalData.id },
    });

    // Neue Kinder anlegen
    if (children.length > 0) {
      await prisma.child.createMany({
        data: children.map(
          (
            child: {
              firstName: string;
              lastName?: string;
              birthDate: string;
              taxAllowance?: boolean;
            },
            index: number
          ) => ({
            personalDataId: personalData.id,
            firstName: child.firstName,
            lastName: child.lastName || null,
            birthDate: new Date(child.birthDate),
            taxAllowance: child.taxAllowance || false,
            orderIndex: index,
          })
        ),
      });
    }
  }

  // Name im Onboarding-Prozess aktualisieren
  if (data.firstName || data.lastName) {
    await prisma.onboardingProcess.update({
      where: { id: onboarding.id },
      data: {
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
      },
    });
  }

  return NextResponse.json({ success: true, currentStep });
}

// =============================================
// POST – Fragebogen endgültig absenden
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate-Limiting
  const clientIp = getClientIp(request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  const result = await validateMagicToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // Doppelten Submit verhindern: Bereits eingereichte Fragebogen ablehnen
  if (onboarding.status === "SUBMITTED" || onboarding.status === "SUPERVISOR_PENDING" || onboarding.status === "SUPERVISOR_SUBMITTED" || onboarding.status === "REVIEWED" || onboarding.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Fragebogen wurde bereits eingereicht." },
      { status: 409 }
    );
  }

  const body = await request.json();

  const absendenSchema = z.object({
    dsgvoAccepted: z.literal(true),
    // Die Wahrheitsversicherung ersetzt die Unterschrift. Sie war bisher reiner
    // Browser-Zustand und ging beim Absenden verloren — der Server hat sie nie
    // gesehen und konnte sie folglich auch nicht erzwingen.
    erklaerungAccepted: z.literal(true),
    erklaerungOrt: z.string().trim().min(2).max(100),
    erklaerungVersion: z.string().min(1).max(40),
  });

  const absenden = absendenSchema.safeParse(body);
  if (!absenden.success) {
    const fehlend = absenden.error.issues.map((i) => i.path.join("."));
    if (fehlend.includes("dsgvoAccepted")) {
      return NextResponse.json(
        { error: "DSGVO-Einwilligung ist erforderlich." },
        { status: 400 }
      );
    }
    if (fehlend.includes("erklaerungAccepted")) {
      return NextResponse.json(
        { error: "Bitte bestätigen Sie die Erklärung des Arbeitnehmers." },
        { status: 400 }
      );
    }
    if (fehlend.includes("erklaerungOrt")) {
      return NextResponse.json(
        { error: "Bitte geben Sie den Ort an. Er gehört zur Unterschrift." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Die Angaben zur Erklärung sind unvollständig." },
      { status: 400 }
    );
  }

  // Eine Version, die wir nicht kennen, koennen wir spaeter nicht mehr
  // nachweisen — dann waere die Erklaerung wertlos.
  if (!istBekannteErklaerung(absenden.data.erklaerungVersion)) {
    return NextResponse.json(
      {
        error:
          "Der Erklärungstext ist nicht mehr aktuell. Bitte laden Sie die Seite neu.",
      },
      { status: 409 }
    );
  }

  // =============================================
  // Pflicht-Dokumente erzwingen (pro Vorlage konfigurierbar)
  // =============================================
  const template = await prisma.formTemplate.findUnique({
    where: { questionnaireType: onboarding.questionnaireType },
    select: { requiredDocuments: true },
  });
  // Fallback auf Geburtsurkunden, falls (noch) keine Vorlage existiert.
  const requiredDocs = template?.requiredDocuments ?? [
    "GEBURTSURKUNDE_EIGEN",
    "GEBURTSURKUNDE_KIND",
  ];

  if (requiredDocs.length > 0) {
    const [uploaded, childCount] = await Promise.all([
      prisma.document.findMany({
        where: { onboardingId: onboarding.id },
        select: { type: true },
      }),
      prisma.child.count({
        where: { personalData: { onboardingId: onboarding.id } },
      }),
    ]);

    const missing = computeMissingRequiredDocuments({
      required: requiredDocs,
      uploadedTypes: uploaded.map((d) => d.type),
      hasChildren: childCount > 0,
    });

    if (missing.length > 0) {
      const labels = missing.map((t) => documentTypeLabel(t)).join(", ");
      return NextResponse.json(
        {
          error: `Bitte laden Sie folgende Pflichtdokumente hoch, bevor Sie absenden: ${labels}.`,
          missingDocuments: missing,
        },
        { status: 400 }
      );
    }
  }

  // =============================================
  // Wahrheitsversicherung pruefungsfest festhalten
  // =============================================
  // Die Pruefsumme wird ueber den Stand gebildet, den der Beschaeftigte in
  // diesem Moment bestaetigt — im Klartext, damit sie sich spaeter nachrechnen
  // laesst (verschluesselte Felder haben bei jedem Speichern ein anderes
  // Chiffrat).
  const bestand = await prisma.personalData.findUnique({
    where: { onboardingId: onboarding.id },
    include: { children: true },
  });

  if (!bestand) {
    return NextResponse.json(
      { error: "Es sind noch keine Angaben gespeichert." },
      { status: 400 }
    );
  }

  const angabenKlartext: Record<string, unknown> = {
    ...bestand,
    iban: bestand.iban ? decrypt(bestand.iban) : bestand.iban,
    socialSecurityNumber: bestand.socialSecurityNumber
      ? decrypt(bestand.socialSecurityNumber)
      : bestand.socialSecurityNumber,
    taxId: bestand.taxId ? decrypt(bestand.taxId) : bestand.taxId,
  };

  const pruefsumme = berechnePruefsumme(angabenKlartext, bestand.children);
  const abgegebenAm = new Date();

  // PersonalData als vollstaendig markieren
  await prisma.personalData.update({
    where: { onboardingId: onboarding.id },
    data: {
      isComplete: true,
      dsgvoAccepted: true,
      dsgvoAcceptedAt: abgegebenAm,
      currentStep: SUMMARY_STEP_NUMBER,
      erklaerungAccepted: true,
      erklaerungAcceptedAt: abgegebenAm,
      erklaerungOrt: absenden.data.erklaerungOrt,
      erklaerungIp: clientIp,
      erklaerungUserAgent:
        request.headers.get("user-agent")?.slice(0, 500) ?? null,
      erklaerungVersion: absenden.data.erklaerungVersion,
      erklaerungPruefsumme: pruefsumme,
    },
  });

  // Onboarding-Status aktualisieren
  await prisma.onboardingProcess.update({
    where: { id: onboarding.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  // Audit-Log
  await prisma.auditLog.create({
    data: {
      onboardingId: onboarding.id,
      action: "QUESTIONNAIRE_SUBMITTED",
      details: {
        email: onboarding.email,
        submittedAt: abgegebenAm.toISOString(),
        erklaerungOrt: absenden.data.erklaerungOrt,
        erklaerungVersion: absenden.data.erklaerungVersion,
        erklaerungPruefsumme: pruefsumme,
      },
      ipAddress: clientIp,
    },
  });

  // n8n Webhook aufrufen (falls konfiguriert) – HR-Benachrichtigung
  await triggerN8nWebhook("questionnaire-completed", {
    onboardingId: onboarding.id,
    email: onboarding.email,
    organization: onboarding.organization.name,
  });

  // Bestaetigungs-E-Mail direkt an den Mitarbeiter senden
  try {
    // Personaldata für Vorname laden
    const personalData = await prisma.personalData.findUnique({
      where: { onboardingId: onboarding.id },
      select: { firstName: true, lastName: true },
    });

    const vorname = personalData?.firstName || onboarding.firstName || "";
    const nachname = personalData?.lastName || onboarding.lastName || "";
    const displayId = onboarding.displayId || onboarding.id.substring(0, 8).toUpperCase();

    // Template aus DB laden oder Default verwenden
    const dbTemplate = await prisma.emailTemplate.findUnique({
      where: { event: "questionnaire-confirmation-employee" },
    });

    const defaultTpl = DEFAULT_EMAIL_TEMPLATES.find(
      (t) => t.event === "questionnaire-confirmation-employee"
    );

    const template = dbTemplate || defaultTpl;

    if (template) {
      const vars: Record<string, string> = {
        "{{vorname}}": vorname,
        "{{nachname}}": nachname,
        "{{email}}": onboarding.email,
        "{{einrichtung}}": onboarding.organization.name,
        "{{vorgangsnummer}}": displayId,
      };

      let subject = dbTemplate ? dbTemplate.subject : defaultTpl!.subject;
      let html = dbTemplate ? dbTemplate.bodyHtml : defaultTpl!.bodyHtml;
      let text = dbTemplate ? (dbTemplate.bodyText || undefined) : defaultTpl!.bodyText;

      for (const [key, value] of Object.entries(vars)) {
        subject = subject.replaceAll(key, value);
        html = html.replaceAll(key, value);
        if (text) text = text.replaceAll(key, value);
      }

      await sendEmail({
        to: onboarding.email,
        subject,
        html,
        text,
      });
    }
  } catch (emailError) {
    // Bestaetigungs-E-Mail ist nicht kritisch – Fehler loggen, aber nicht abbrechen
    console.error("[Fragebogen] Bestaetigungs-E-Mail an Mitarbeiter fehlgeschlagen:", emailError);
  }

  return NextResponse.json({
    success: true,
    message: "Personalfragebogen wurde erfolgreich eingereicht.",
  });
}
