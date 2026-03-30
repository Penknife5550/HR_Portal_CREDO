/**
 * API: Mitarbeiter (zentrale Personalakte)
 *
 * GET  /api/employees - Alle Mitarbeiter auflisten (mit Anstellungen)
 * POST /api/employees - Neuen Mitarbeiter anlegen
 *
 * Auth: Session-Cookie (alle HR-Rollen) ODER X-API-Key (n8n/Service)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

// Alle HR-Rollen + SERVICE (n8n API-Key)
const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "HR_LEITUNG",
  "HR_SACHBEARBEITER",
  "SERVICE",
];

// =============================================
// Zod Schemas
// =============================================

const createEmployeeSchema = z.object({
  personalNumber: z
    .string()
    .trim()
    .min(1, "Personalnummer darf nicht leer sein")
    .optional(),
  firstName: z
    .string()
    .trim()
    .min(1, "Vorname ist erforderlich"),
  lastName: z
    .string()
    .trim()
    .min(1, "Nachname ist erforderlich"),
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
});

type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

// =============================================
// GET /api/employees
// =============================================
export const GET = apiHandler(
  { roles: ALLOWED_ROLES, logLabel: "Employees GET" },
  async ({ request }) => {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim() || undefined;
    const organizationId = searchParams.get("organizationId") || undefined;
    const isActiveParam = searchParams.get("isActive");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "25", 10))
    );
    const skip = (page - 1) * limit;

    // Filter aufbauen
    const where: any = {};

    // isActive-Filter (Standard: nur aktive)
    if (isActiveParam === "false") {
      where.isActive = false;
    } else if (isActiveParam === "all") {
      // Alle anzeigen, kein Filter
    } else {
      where.isActive = true;
    }

    // Suchfilter: Name, E-Mail oder Personalnummer
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { personalNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    // Einrichtungs-Filter (ueber Employment)
    if (organizationId) {
      where.employments = {
        some: { organizationId },
      };
    }

    const [data, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          employments: {
            include: {
              organization: {
                select: { id: true, name: true, mandantNumber: true },
              },
            },
            orderBy: { startDate: "desc" },
          },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  }
);

// =============================================
// POST /api/employees
// =============================================
export const POST = apiHandler<CreateEmployeeInput>(
  {
    roles: ALLOWED_ROLES,
    bodySchema: createEmployeeSchema,
    logLabel: "Employees POST",
  },
  async ({ body }) => {
    // Personalnummer-Eindeutigkeit pruefen
    if (body.personalNumber) {
      const existing = await prisma.employee.findUnique({
        where: { personalNumber: body.personalNumber },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Diese Personalnummer existiert bereits" },
          { status: 409 }
        );
      }
    }

    const employee = await prisma.employee.create({
      data: {
        personalNumber: body.personalNumber || null,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email || null,
        privateEmail: body.privateEmail || null,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        phone: body.phone || null,
        importSource: body.importSource || null,
        importedAt: body.importSource ? new Date() : null,
      },
    });

    return NextResponse.json({ data: employee }, { status: 201 });
  }
);
