/**
 * API: Einzelner Mitarbeiter
 *
 * GET    /api/employees/[id] - Mitarbeiter mit Anstellungen + verknuepften Vorgaengen
 * PATCH  /api/employees/[id] - Mitarbeiter-Daten aktualisieren
 * DELETE /api/employees/[id] - Soft Delete (isActive=false)
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

const updateEmployeeSchema = z.object({
  personalNumber: z
    .string()
    .trim()
    .min(1, "Personalnummer darf nicht leer sein")
    .optional(),
  firstName: z
    .string()
    .trim()
    .min(1, "Vorname darf nicht leer sein")
    .optional(),
  lastName: z
    .string()
    .trim()
    .min(1, "Nachname darf nicht leer sein")
    .optional(),
  email: z.string().email("Ungültige E-Mail-Adresse").optional().nullable(),
  privateEmail: z
    .string()
    .email("Ungültige private E-Mail-Adresse")
    .optional()
    .nullable(),
  dateOfBirth: z
    .string()
    .datetime({ message: "Ungültiges Datumsformat (ISO 8601 erwartet)" })
    .optional()
    .nullable(),
  phone: z.string().trim().optional().nullable(),
  importSource: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

// =============================================
// GET /api/employees/[id]
// =============================================
export const GET = apiHandler(
  { roles: ALLOWED_ROLES, logLabel: "Employee GET" },
  async ({ params }) => {
    const { id } = params;

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        employments: {
          include: {
            organization: {
              select: { id: true, name: true, mandantNumber: true },
            },
          },
          orderBy: { startDate: "desc" },
        },
        onboardings: {
          select: {
            id: true,
            displayId: true,
            status: true,
            createdAt: true,
            organizationId: true,
          },
          orderBy: { createdAt: "desc" },
        },
        offboardings: {
          select: {
            id: true,
            displayId: true,
            status: true,
            createdAt: true,
            organizationId: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: employee });
  }
);

// =============================================
// PATCH /api/employees/[id]
// =============================================
export const PATCH = apiHandler<UpdateEmployeeInput>(
  {
    roles: ALLOWED_ROLES,
    bodySchema: updateEmployeeSchema,
    logLabel: "Employee PATCH",
  },
  async ({ params, body }) => {
    const { id } = params;

    // Pruefen ob Mitarbeiter existiert
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }

    // Personalnummer-Eindeutigkeit pruefen (falls geaendert)
    if (body.personalNumber && body.personalNumber !== existing.personalNumber) {
      const duplicate = await prisma.employee.findUnique({
        where: { personalNumber: body.personalNumber },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "Diese Personalnummer existiert bereits" },
          { status: 409 }
        );
      }
    }

    // Update-Daten aufbauen
    const updateData: Record<string, unknown> = {};
    if (body.personalNumber !== undefined) updateData.personalNumber = body.personalNumber;
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.privateEmail !== undefined) updateData.privateEmail = body.privateEmail;
    if (body.dateOfBirth !== undefined) {
      updateData.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    }
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.importSource !== undefined) updateData.importSource = body.importSource;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: employee });
  }
);

// =============================================
// DELETE /api/employees/[id] (Soft Delete)
// =============================================
export const DELETE = apiHandler(
  { roles: ALLOWED_ROLES, logLabel: "Employee DELETE" },
  async ({ params }) => {
    const { id } = params;

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: employee });
  }
);
