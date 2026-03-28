/**
 * API: Einzelne Anstellung
 *
 * PATCH  /api/employees/[id]/employments/[employmentId] - Anstellung aktualisieren
 * DELETE /api/employees/[id]/employments/[employmentId] - Anstellung entfernen
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

const updateEmploymentSchema = z.object({
  organizationId: z.string().uuid("Ungültige Einrichtungs-ID").optional(),
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
  isActive: z.boolean().optional(),
});

type UpdateEmploymentInput = z.infer<typeof updateEmploymentSchema>;

/**
 * Hilfsfunktion: Anstellung laden und pruefen ob sie zum Mitarbeiter gehoert
 */
async function findEmployment(employeeId: string, employmentId: string) {
  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
  });
  if (!employment) return null;
  if (employment.employeeId !== employeeId) return null;
  return employment;
}

// =============================================
// PATCH /api/employees/[id]/employments/[employmentId]
// =============================================
export const PATCH = apiHandler<UpdateEmploymentInput>(
  {
    roles: ALLOWED_ROLES,
    bodySchema: updateEmploymentSchema,
    logLabel: "Employment PATCH",
  },
  async ({ params, body }) => {
    const { id, employmentId } = params;

    const existing = await findEmployment(id, employmentId);
    if (!existing) {
      return NextResponse.json(
        { error: "Anstellung nicht gefunden" },
        { status: 404 }
      );
    }

    // Falls organizationId geaendert wird, pruefen ob neue Einrichtung existiert
    if (body.organizationId) {
      const organization = await prisma.organization.findUnique({
        where: { id: body.organizationId },
      });
      if (!organization) {
        return NextResponse.json(
          { error: "Einrichtung nicht gefunden" },
          { status: 404 }
        );
      }
    }

    // Update-Daten aufbauen
    const updateData: Record<string, unknown> = {};
    if (body.organizationId !== undefined) updateData.organizationId = body.organizationId;
    if (body.position !== undefined) updateData.position = body.position;
    if (body.department !== undefined) updateData.department = body.department;
    if (body.contractType !== undefined) updateData.contractType = body.contractType;
    if (body.workingHoursWeek !== undefined) updateData.workingHoursWeek = body.workingHoursWeek;
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    }
    if (body.mandantNumber !== undefined) updateData.mandantNumber = body.mandantNumber;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const employment = await prisma.employment.update({
      where: { id: employmentId },
      data: updateData,
      include: {
        organization: {
          select: { id: true, name: true, mandantNumber: true },
        },
      },
    });

    return NextResponse.json({ data: employment });
  }
);

// =============================================
// DELETE /api/employees/[id]/employments/[employmentId]
// =============================================
export const DELETE = apiHandler(
  { roles: ALLOWED_ROLES, logLabel: "Employment DELETE" },
  async ({ params }) => {
    const { id, employmentId } = params;

    const existing = await findEmployment(id, employmentId);
    if (!existing) {
      return NextResponse.json(
        { error: "Anstellung nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.employment.delete({
      where: { id: employmentId },
    });

    return NextResponse.json({ message: "Anstellung gelöscht" });
  }
);
