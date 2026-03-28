/**
 * API: /api/settings/departments
 *
 * GET  - Alle Abteilungs-Konfigurationen auflisten
 * POST - Neue Abteilung anlegen
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ADMIN_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// Einfache E-Mail-Validierung
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================
// GET /api/settings/departments
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const departments = await prisma.departmentConfig.findMany({
      include: {
        organization: true,
      },
      orderBy: [
        { departmentKey: "asc" },
        { organizationId: { sort: "asc", nulls: "first" } },
      ],
    });

    return NextResponse.json({ data: departments });
  } catch (error) {
    console.error("[API] Abteilungen laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/settings/departments - Abteilung anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ADMIN_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json();
    const { departmentKey, departmentName, email, organizationId } = body;

    // Validierung
    const errors: string[] = [];
    if (!departmentKey?.trim()) errors.push("departmentKey ist ein Pflichtfeld");
    if (!departmentName?.trim()) errors.push("departmentName ist ein Pflichtfeld");
    if (!email?.trim()) errors.push("E-Mail ist ein Pflichtfeld");
    if (email && !isValidEmail(email.trim())) errors.push("E-Mail-Adresse ist nicht gültig");

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    // Unique Check: [departmentKey, organizationId]
    const existing = await prisma.departmentConfig.findUnique({
      where: {
        departmentKey_organizationId: {
          departmentKey: departmentKey.trim(),
          organizationId: organizationId || null,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Diese Abteilung existiert bereits fuer diese Einrichtung" },
        { status: 409 }
      );
    }

    const department = await prisma.departmentConfig.create({
      data: {
        departmentKey: departmentKey.trim(),
        departmentName: departmentName.trim(),
        email: email.trim(),
        organizationId: organizationId || null,
      },
      include: {
        organization: true,
      },
    });

    return NextResponse.json({ data: department }, { status: 201 });
  } catch (error) {
    console.error("[API] Abteilung anlegen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
