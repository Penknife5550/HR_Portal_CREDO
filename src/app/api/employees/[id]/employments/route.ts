/**
 * API: Anstellungen eines Mitarbeiters
 *
 * GET  /api/employees/[id]/employments - Alle Anstellungen auflisten
 * POST /api/employees/[id]/employments - Neue Anstellung anlegen
 *
 * Auth: Session-Cookie (alle HR-Rollen) ODER X-API-Key (n8n/Service)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "HR_LEITUNG",
  "HR_SACHBEARBEITER",
  "SERVICE",
];

// =============================================
// Zod Schemas
// =============================================

const VALID_CONTRACT_TYPES = [
  "UNBEFRISTET",
  "BEFRISTET",
  "BEAMTER",
  "MINIJOB",
  "EHRENAMT",
  "PRAKTIKUM",
] as const;

const createEmploymentSchema = z.object({
  organizationId: z
    .string()
    .uuid("Ungültige Einrichtungs-ID"),
  position: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  contractType: z
    .enum(VALID_CONTRACT_TYPES, {
      errorMap: () => ({
        message: `Ungültiger Vertragstyp. Erlaubt: ${VALID_CONTRACT_TYPES.join(", ")}`,
      }),
    })
    .optional()
    .nullable(),
  workingHoursWeek: z
    .number()
    .min(0, "Wochenstunden müssen >= 0 sein")
    .max(168, "Wochenstunden müssen <= 168 sein")
    .optional()
    .nullable(),
  startDate: z
    .string()
    .datetime({ message: "Ungültiges Datumsformat (ISO 8601 erwartet)" })
    .optional()
    .nullable(),
  endDate: z
    .string()
    .datetime({ message: "Ungültiges Datumsformat (ISO 8601 erwartet)" })
    .optional()
    .nullable(),
  mandantNumber: z.string().trim().optional().nullable(),
});

type CreateEmploymentInput = z.infer<typeof createEmploymentSchema>;

// =============================================
// GET /api/employees/[id]/employments
// =============================================
export const GET = apiHandler(
  { roles: ALLOWED_ROLES, logLabel: "Employments GET" },
  async ({ params }) => {
    const { id } = params;

    // Pruefen ob Mitarbeiter existiert
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }

    const employments = await prisma.employment.findMany({
      where: { employeeId: id },
      include: {
        organization: {
          select: { id: true, name: true, mandantNumber: true },
        },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json({ data: employments });
  }
);

// =============================================
// POST /api/employees/[id]/employments
// =============================================
export const POST = apiHandler<CreateEmploymentInput>(
  {
    roles: ALLOWED_ROLES,
    bodySchema: createEmploymentSchema,
    logLabel: "Employments POST",
  },
  async ({ params, body }) => {
    const { id } = params;

    // Pruefen ob Mitarbeiter existiert
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob Einrichtung existiert
    const organization = await prisma.organization.findUnique({
      where: { id: body.organizationId },
    });
    if (!organization) {
      return NextResponse.json(
        { error: "Einrichtung nicht gefunden" },
        { status: 404 }
      );
    }

    const employment = await prisma.employment.create({
      data: {
        employeeId: id,
        organizationId: body.organizationId,
        position: body.position || null,
        department: body.department || null,
        contractType: body.contractType || null,
        workingHoursWeek: body.workingHoursWeek ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        mandantNumber: body.mandantNumber || null,
      },
      include: {
        organization: {
          select: { id: true, name: true, mandantNumber: true },
        },
      },
    });

    return NextResponse.json({ data: employment }, { status: 201 });
  }
);
