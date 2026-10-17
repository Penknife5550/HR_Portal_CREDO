/**
 * API: Einzelner Mitarbeiter
 *
 * GET    /api/employees/[id] - Mitarbeiter mit Anstellungen + verknuepften Vorgaengen
 * PATCH  /api/employees/[id] - Mitarbeiter-Daten aktualisieren
 * DELETE /api/employees/[id] - Soft Delete (isActive=false)
 *
 * Auth: Session-Cookie (alle HR-Rollen) ODER X-API-Key (n8n/Service).
 * Schreiben nur die HR-Rollen. Bei einer Person aus DokuBit sperrt der
 * Schreibschutz Adresse, Aktiv-Status und Quelle, jede Aenderung kommt ins
 * AuditLog: src/lib/personalstamm/schreibschutz.ts
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { PERSONALSTAMM_ACTIONS, PERSONALSTAMM_PROCESS_TYPE } from "@/lib/constants";
import {
  SCHREIBSCHUTZ_MELDUNGEN,
  VERWALTETE_PERSONENFELDER,
  gesperrteFelder,
  personVerwaltet,
} from "@/lib/personalstamm/schreibschutz";

// Lesen: alle HR-Rollen + SERVICE (n8n API-Key)
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
    roles: HR_EDIT_ROLES,
    bodySchema: updateEmployeeSchema,
    logLabel: "Employee PATCH",
  },
  async ({ params, body, session }) => {
    const { id } = params;

    // Pruefen ob Mitarbeiter existiert
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }

    if (personVerwaltet(existing)) {
      const felder = gesperrteFelder(body, VERWALTETE_PERSONENFELDER);
      if (felder.length > 0) {
        return NextResponse.json(
          { error: SCHREIBSCHUTZ_MELDUNGEN.personFelder(felder), felder },
          { status: 409 }
        );
      }
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

    const felder = Object.keys(updateData);
    if (felder.length === 0) return NextResponse.json({ data: existing });

    // Bedingt auf die gelesene Quelle: Uebernimmt der Abgleich die Person
    // inzwischen (Altbestand → DOKUBIT), greift der Schreibschutz.
    const geschrieben = await prisma.$transaction(async (tx) => {
      const { count } = await tx.employee.updateMany({
        where: { id, importSource: existing.importSource },
        data: updateData,
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          userId: session?.userId ?? null,
          processType: PERSONALSTAMM_PROCESS_TYPE,
          action: PERSONALSTAMM_ACTIONS.PERSON_GEAENDERT,
          // Nur Feldnamen, nie Werte; die Quelle ist kein Personendatum
          details: {
            employeeId: id,
            felder,
            ...(body.importSource !== undefined && {
              quelle: { von: existing.importSource, nach: updateData.importSource ?? null },
            }),
          },
        },
      });
      return true;
    });
    if (!geschrieben) {
      return NextResponse.json(
        { error: SCHREIBSCHUTZ_MELDUNGEN.inzwischenGeaendert },
        { status: 409 }
      );
    }

    const employee = await prisma.employee.findUnique({ where: { id } });
    return NextResponse.json({ data: employee });
  }
);

// =============================================
// DELETE /api/employees/[id] (Soft Delete)
// =============================================
export const DELETE = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "Employee DELETE" },
  async ({ params, session }) => {
    const { id } = params;

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Mitarbeiter nicht gefunden" },
        { status: 404 }
      );
    }
    if (personVerwaltet(existing)) {
      return NextResponse.json(
        { error: SCHREIBSCHUTZ_MELDUNGEN.personDeaktivieren },
        { status: 409 }
      );
    }

    const geschrieben = await prisma.$transaction(async (tx) => {
      const { count } = await tx.employee.updateMany({
        where: { id, importSource: existing.importSource },
        data: { isActive: false },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          userId: session?.userId ?? null,
          processType: PERSONALSTAMM_PROCESS_TYPE,
          action: PERSONALSTAMM_ACTIONS.PERSON_DEAKTIVIERT,
          details: { employeeId: id },
        },
      });
      return true;
    });
    if (!geschrieben) {
      return NextResponse.json(
        { error: SCHREIBSCHUTZ_MELDUNGEN.inzwischenGeaendert },
        { status: 409 }
      );
    }

    const employee = await prisma.employee.findUnique({ where: { id } });
    return NextResponse.json({ data: employee });
  }
);
