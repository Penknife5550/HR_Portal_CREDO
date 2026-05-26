/**
 * API: /api/offboarding/[id]/department-links
 *
 * GET  - Status aller Abteilungs-Links eines Offboardings
 * POST - Magic Links generieren und versenden / Reminder senden
 *
 * Berechtigung: Authentifizierter Benutzer
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { triggerWebhooks } from "@/lib/webhooks";
import { getBaseUrl } from "@/lib/url";
import { formatEmployeeName } from "@/lib/format";
import crypto from "crypto";

// Abteilungen die direkt im Portal arbeiten (keine Magic Links)
const SKIP_DEPARTMENTS = ["HR", "MITARBEITER"];

// =============================================
// GET /api/offboarding/[id]/department-links
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    // Pruefen ob Offboarding existiert
    const offboarding = await prisma.offboardingProcess.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!offboarding) {
      return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
    }

    const links = await prisma.offboardingDepartmentLink.findMany({
      where: { offboardingId: id },
      orderBy: { departmentKey: "asc" },
    });

    return NextResponse.json({ data: links });
  } catch (error) {
    console.error("[API] Department-Links laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/offboarding/[id]/department-links
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;

    const body = await request.json().catch(() => ({}));

    // =============================================
    // Reminder-Modus: { action: "remind", departmentKey: "IT" }
    // =============================================
    if (body.action === "remind") {
      return handleReminder(id, body.departmentKey, session);
    }

    // =============================================
    // Standard-Modus: Magic Links generieren
    // =============================================
    return handleGenerateLinks(id, session);
  } catch (error) {
    console.error("[API] Department-Links erstellen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// Magic Links generieren
// =============================================
async function handleGenerateLinks(offboardingId: string, session: { userId: string }) {
  // Offboarding laden
  const offboarding = await prisma.offboardingProcess.findUnique({
    where: { id: offboardingId },
    include: {
      organization: true,
    },
  });

  if (!offboarding) {
    return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
  }

  // Alle ChecklistItems mit assigneeDepartment laden
  const checklistItems = await prisma.offboardingChecklistItem.findMany({
    where: {
      offboardingId,
      assigneeDepartment: { not: null },
    },
  });

  // Gruppieren nach assigneeDepartment
  const departmentMap = new Map<string, typeof checklistItems>();
  for (const item of checklistItems) {
    if (!item.assigneeDepartment) continue;
    if (SKIP_DEPARTMENTS.includes(item.assigneeDepartment)) continue;

    const existing = departmentMap.get(item.assigneeDepartment) || [];
    existing.push(item);
    departmentMap.set(item.assigneeDepartment, existing);
  }

  // Alle DepartmentConfigs laden (für E-Mail-Lookup)
  const departmentConfigs = await prisma.departmentConfig.findMany({
    where: { isActive: true },
  });

  const createdLinks = [];
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 Tage

  for (const [departmentKey, items] of departmentMap) {
    // E-Mail finden: Erst einrichtungsspezifisch, dann zentral
    const orgSpecific = departmentConfigs.find(
      (c) => c.departmentKey === departmentKey && c.organizationId === offboarding.organizationId
    );
    const central = departmentConfigs.find(
      (c) => c.departmentKey === departmentKey && c.organizationId === null
    );

    const config = orgSpecific || central;

    if (!config) {
      console.warn(
        `[Department-Links] Keine E-Mail-Konfiguration für Abteilung "${departmentKey}" gefunden, ueberspringe`
      );
      continue;
    }

    // Token generieren
    const token = crypto.randomUUID();

    // Upsert: erstellen oder aktualisieren
    const link = await prisma.offboardingDepartmentLink.upsert({
      where: {
        offboardingId_departmentKey: {
          offboardingId,
          departmentKey,
        },
      },
      create: {
        offboardingId,
        departmentKey,
        departmentName: config.departmentName,
        email: config.email,
        token,
        expiresAt,
        sentAt: new Date(),
      },
      update: {
        email: config.email,
        departmentName: config.departmentName,
        token,
        expiresAt,
        sentAt: new Date(),
      },
    });

    createdLinks.push(link);

    // Webhook pro Abteilung triggern
    await triggerWebhooks("offboarding-department-assigned", {
      offboardingId,
      displayId: offboarding.displayId,
      departmentKey,
      departmentName: config.departmentName,
      email: config.email,
      expiresAt: expiresAt.toISOString(),
      employeeName: formatEmployeeName(offboarding),
      organizationName: offboarding.organization.name,
      lastWorkingDay: offboarding.lastWorkingDay.toISOString(),
      taskCount: items.length,
      token: link.token,
      magicLink: `${getBaseUrl()}/offboarding/abteilung/${link.token}`,
    });
  }

  // AuditLog schreiben
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      offboardingId,
      processType: "OFFBOARDING",
      action: "DEPARTMENT_LINKS_GENERATED",
      details: {
        departmentCount: createdLinks.length,
        departments: createdLinks.map((l) => l.departmentKey),
      },
    },
  });

  return NextResponse.json({ data: createdLinks }, { status: 201 });
}

// =============================================
// Reminder senden
// =============================================
async function handleReminder(
  offboardingId: string,
  departmentKey: string,
  session: { userId: string }
) {
  if (!departmentKey?.trim()) {
    return NextResponse.json({ error: "departmentKey ist ein Pflichtfeld" }, { status: 400 });
  }

  // Offboarding laden
  const offboarding = await prisma.offboardingProcess.findUnique({
    where: { id: offboardingId },
    include: { organization: true },
  });

  if (!offboarding) {
    return NextResponse.json({ error: "Offboarding-Vorgang nicht gefunden" }, { status: 404 });
  }

  // DepartmentLink laden
  const link = await prisma.offboardingDepartmentLink.findUnique({
    where: {
      offboardingId_departmentKey: {
        offboardingId,
        departmentKey: departmentKey.trim(),
      },
    },
  });

  if (!link) {
    return NextResponse.json(
      { error: "Kein Department-Link für diese Abteilung gefunden" },
      { status: 404 }
    );
  }

  // Reminder-Daten aktualisieren
  const updated = await prisma.offboardingDepartmentLink.update({
    where: { id: link.id },
    data: {
      lastReminderAt: new Date(),
      reminderCount: { increment: 1 },
    },
  });

  // Webhook "offboarding-reminder" triggern
  await triggerWebhooks("offboarding-reminder", {
    offboardingId,
    displayId: offboarding.displayId,
    departmentKey: link.departmentKey,
    departmentName: link.departmentName,
    email: link.email,
    reminderCount: updated.reminderCount,
    employeeName: formatEmployeeName(offboarding),
    organizationName: offboarding.organization.name,
    lastWorkingDay: offboarding.lastWorkingDay.toISOString(),
    magicLink: `${getBaseUrl()}/offboarding/abteilung/${link.token}`,
    level: "INFO",
  });

  // AuditLog schreiben
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      offboardingId,
      processType: "OFFBOARDING",
      action: "DEPARTMENT_REMINDER_SENT",
      details: {
        departmentKey: link.departmentKey,
        reminderCount: updated.reminderCount,
      },
    },
  });

  return NextResponse.json({ data: updated });
}
