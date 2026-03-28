/**
 * API: /api/offboarding/export
 *
 * GET – CSV-Export aller Offboarding-Vorgaenge (mit Filtern)
 * Berechtigt: SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"];

const EXIT_TYPE_LABELS: Record<string, string> = {
  KUENDIGUNG_ARBEITNEHMER: "Kündigung Arbeitnehmer",
  KUENDIGUNG_ARBEITGEBER: "Kündigung Arbeitgeber",
  AUFHEBUNGSVERTRAG: "Aufhebungsvertrag",
  BEFRISTUNGSENDE: "Befristungsende",
  RENTE_PENSION: "Rente / Pension",
  ERWERBSMINDERUNG: "Erwerbsminderung",
  ENTLASSUNG_BEAMTER: "Entlassung (Beamter)",
  VERSETZUNG: "Versetzung",
  TOD: "Todesfall",
  SONSTIGES: "Sonstiges",
};

const STATUS_LABELS: Record<string, string> = {
  INITIATED: "Erfasst",
  NOTICE_PERIOD: "Kündigungsfrist",
  HANDOVER_PHASE: "Übergabe",
  FINAL_SETTLEMENT: "Endabrechnung",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgebrochen",
};

/** CSV-Feld escapen: Semikolons, Anfuehrungszeichen und Zeilenumbrueche */
function escapeCsvField(value: string): string {
  if (
    value.includes(";") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return new Response("Nicht authentifiziert", { status: 401 });
    }

    if (!ALLOWED_ROLES.includes(session.role)) {
      return new Response("Keine Berechtigung", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organizationId");
    const search = searchParams.get("search")?.trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Filter zusammenbauen (gleiche Logik wie GET /api/offboarding)
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (organizationId) where.organizationId = organizationId;
    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: "insensitive" } },
        { employeeEmail: { contains: search, mode: "insensitive" } },
        { employeeFirstName: { contains: search, mode: "insensitive" } },
        { employeeLastName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (from || to) {
      const createdAtFilter: Record<string, Date> = {};
      if (from) createdAtFilter.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        createdAtFilter.lte = toDate;
      }
      where.createdAt = createdAtFilter;
    }

    const offboardings = await prisma.offboardingProcess.findMany({
      where,
      include: {
        organization: {
          select: { name: true, mandantNumber: true },
        },
        checklistItems: {
          select: { isCompleted: true },
        },
        returnItems: {
          select: { isReturned: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // CSV-Header
    const headers = [
      "Vorgangs-ID",
      "Vorname",
      "Nachname",
      "Dienst-E-Mail",
      "Private E-Mail",
      "Personalnummer",
      "Einrichtung",
      "Mandantennummer",
      "Austrittsart",
      "Letzter Arbeitstag",
      "Status",
      "Erfasst am",
      "Abgeschlossen am",
      "Checkliste",
      "Rückgaben",
    ];

    const rows = offboardings.map((o) => {
      const checklistCompleted = o.checklistItems.filter((i) => i.isCompleted).length;
      const checklistTotal = o.checklistItems.length;
      const returnReturned = o.returnItems.filter((i) => i.isReturned).length;
      const returnTotal = o.returnItems.length;

      return [
        o.displayId || "",
        o.employeeFirstName || "",
        o.employeeLastName || "",
        o.employeeEmail || "",
        o.employeePrivateEmail || "",
        o.employeePersonalNr || "",
        o.organization?.name || "",
        o.organization?.mandantNumber || "",
        EXIT_TYPE_LABELS[o.exitType] || o.exitType || "",
        formatDate(o.lastWorkingDay),
        STATUS_LABELS[o.status] || o.status || "",
        formatDate(o.createdAt),
        o.status === "COMPLETED" ? formatDate(o.updatedAt) : "",
        `${checklistCompleted}/${checklistTotal}`,
        `${returnReturned}/${returnTotal}`,
      ].map((v) => escapeCsvField(String(v)));
    });

    // BOM + CSV zusammenbauen
    const csvContent =
      "\uFEFF" +
      headers.join(";") +
      "\n" +
      rows.map((row) => row.join(";")).join("\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="offboarding-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Fehler beim CSV-Export:", error);
    return new Response("Interner Serverfehler", { status: 500 });
  }
}
