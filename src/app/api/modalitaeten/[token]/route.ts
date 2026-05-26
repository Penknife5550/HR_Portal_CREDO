/**
 * API: Einstellungsmodalitaeten (Vorgesetzter)
 *
 * GET  /api/modalitaeten/:token  → Lade Vorgesetzten-Daten + MA-Info
 * PUT  /api/modalitaeten/:token  → Speichere/Aktualisiere Daten (Auto-Save)
 * POST /api/modalitaeten/:token  → Modalitaeten endgültig absenden
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateSupervisorToken } from "@/lib/auth";
import { triggerN8nWebhook } from "@/lib/n8n";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

// =============================================
// Zod-Schema für Modalitaeten-Validierung (serverseitig)
// =============================================
const modalitaetenFieldsSchema = z.object({
  betriebsstaette: z.string().max(500).optional(),
  stellenbeschreibung: z.string().max(2000).optional(),
  vertragsbeginn: z.string().optional(),
  befristet: z.boolean().optional(),
  vertragsende: z.string().optional(),
  befristungSachgrund: z.string().max(500).optional(),
  vollzeit: z.boolean().optional(),
  wochenstunden: z.number().min(0).max(60).nullable().optional(),
  tageProWoche: z.number().min(1).max(7).nullable().optional(),
  hauptarbeitgeberId: z.string().max(200).optional(),
  hauptarbeitgeberStunden: z.number().min(0).max(60).nullable().optional(),
  nebenarbeitgeberId: z.string().max(200).optional(),
  nebenarbeitgeberStunden: z.number().min(0).max(60).nullable().optional(),
  svPflichtig: z.boolean().optional(),
  minijob: z.boolean().optional(),
  ehrenamt: z.boolean().optional(),
  kostenstelle: z.string().max(100).optional(),
  kostenstelleAnteil: z.number().min(0).max(100).nullable().optional(),
  probezeit: z.boolean().optional(),
  probezeitMonate: z.number().min(0).max(12).nullable().optional(),
  verguetungsmodell: z.enum(["TV_L", "TV_L_S", "HAUSTARIF", "SONSTIGES"]).optional(),
  entgeltgruppe: z.string().max(50).optional(),
  stufe: z.string().max(50).optional(),
  festgehalt: z.number().min(0).nullable().optional(),
  stundenlohn: z.number().min(0).nullable().optional(),
  bemerkungVerguetung: z.string().max(2000).optional(),
  jahressonderzahlung: z.boolean().optional(),
  sonderzahlungProzent: z.number().min(0).max(100).nullable().optional(),
  sachbezuege: z.boolean().optional(),
  sachbezuegeBetrag: z.number().min(0).nullable().optional(),
  zulage: z.boolean().optional(),
  zulageBetrag: z.number().min(0).nullable().optional(),
  urlaubstageProJahr: z.number().min(0).max(50).nullable().optional(),
  masernschutzErforderlich: z.boolean().optional(),
  masernschutzVorArbeitsbeginn: z.boolean().optional(),
  zeiterfassung: z.boolean().optional(),
  zusatzvereinbarungen: z.string().max(5000).optional(),
  currentStep: z.number().min(1).max(10).optional(),
}).strip();

// =============================================
// GET – Modalitaeten-Daten laden
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

  // GET erlaubt auch SUPERVISOR_SUBMITTED-Status (Anzeige der eingereichten Daten)
  const result = await validateSupervisorToken(token, { allowSubmitted: true });
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // Alle Einrichtungen laden (für Haupt-/Nebenarbeitgeber Dropdown)
  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, mandantNumber: true, name: true, shortName: true, type: true },
  });

  return NextResponse.json({
    onboardingId: onboarding.id,
    email: onboarding.email,
    employeeName: onboarding.personalData
      ? `${onboarding.personalData.firstName || ""} ${onboarding.personalData.lastName || ""}`.trim()
      : onboarding.email,
    organization: {
      name: onboarding.organization.name,
      mandantNumber: onboarding.organization.mandantNumber,
      type: onboarding.organization.type,
    },
    organizations,
    supervisorData: onboarding.supervisorData || null,
    status: onboarding.status,
  });
}

// =============================================
// PUT – Auto-Save (Daten speichern)
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

  const result = await validateSupervisorToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;
  const body = await request.json();

  // Serverseitige Zod-Validierung
  const parsed = modalitaetenFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { currentStep, ...data } = parsed.data;

  // Whitelist erlaubter Felder (Mass-Assignment-Schutz)
  const ALLOWED_FIELDS = new Set([
    "betriebsstaette", "stellenbeschreibung",
    "vertragsbeginn", "befristet", "vertragsende", "befristungSachgrund",
    "vollzeit", "wochenstunden", "tageProWoche",
    "hauptarbeitgeberId", "hauptarbeitgeberStunden",
    "nebenarbeitgeberId", "nebenarbeitgeberStunden",
    "svPflichtig", "minijob", "ehrenamt",
    "kostenstelle", "kostenstelleAnteil",
    "probezeit", "probezeitMonate",
    "verguetungsmodell", "entgeltgruppe", "stufe",
    "festgehalt", "stundenlohn", "bemerkungVerguetung",
    "jahressonderzahlung", "sonderzahlungProzent",
    "sachbezuege", "sachbezuegeBetrag",
    "zulage", "zulageBetrag",
    "urlaubstageProJahr",
    "masernschutzErforderlich", "masernschutzVorArbeitsbeginn",
    "zeiterfassung", "zusatzvereinbarungen",
  ]);

  const updateData: Record<string, unknown> = {};

  // Nur gesetzte UND erlaubte Felder uebernehmen
  for (const [key, value] of Object.entries(data)) {
    if (ALLOWED_FIELDS.has(key) && value !== undefined) {
      updateData[key] = value;
    }
  }

  // Datumsfelder konvertieren
  if (data.vertragsbeginn) updateData.vertragsbeginn = new Date(data.vertragsbeginn);
  if (data.vertragsende) updateData.vertragsende = new Date(data.vertragsende);

  // Booleans explizit setzen
  const boolFields = [
    "befristet", "vollzeit", "svPflichtig", "minijob", "ehrenamt",
    "probezeit", "jahressonderzahlung", "sachbezuege", "zulage",
    "masernschutzErforderlich", "masernschutzVorArbeitsbeginn", "zeiterfassung",
  ] as const;
  for (const field of boolFields) {
    if (typeof data[field] === "boolean") {
      updateData[field] = data[field];
    }
  }

  if (typeof currentStep === "number") {
    updateData.currentStep = currentStep;
  }

  await prisma.supervisorData.upsert({
    where: { onboardingId: onboarding.id },
    create: {
      onboardingId: onboarding.id,
      ...updateData,
    },
    update: updateData,
  });

  return NextResponse.json({ success: true, currentStep });
}

// =============================================
// POST – Modalitaeten endgültig absenden
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

  const result = await validateSupervisorToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // SupervisorData als vollstaendig markieren
  await prisma.supervisorData.update({
    where: { onboardingId: onboarding.id },
    data: {
      isComplete: true,
    },
  });

  // Onboarding-Status aktualisieren
  await prisma.onboardingProcess.update({
    where: { id: onboarding.id },
    data: {
      status: "SUPERVISOR_SUBMITTED",
      supervisorSubmittedAt: new Date(),
    },
  });

  // Audit-Log
  await prisma.auditLog.create({
    data: {
      onboardingId: onboarding.id,
      action: "SUPERVISOR_DATA_SUBMITTED",
      details: {
        supervisorEmail: onboarding.supervisorEmail,
        submittedAt: new Date().toISOString(),
      },
    },
  });

  // n8n Webhook
  await triggerN8nWebhook("supervisor-completed", {
    onboardingId: onboarding.id,
    email: onboarding.email,
    supervisorEmail: onboarding.supervisorEmail,
    organization: onboarding.organization.name,
  });

  return NextResponse.json({
    success: true,
    message: "Einstellungsmodalitaeten wurden erfolgreich eingereicht.",
  });
}
