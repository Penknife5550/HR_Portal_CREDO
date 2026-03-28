/**
 * API: /api/users
 *
 * GET  - Alle Benutzer auflisten (nur SUPER_ADMIN / HR_LEITUNG)
 * POST - Neuen Benutzer anlegen (nur SUPER_ADMIN / HR_LEITUNG)
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// =============================================
// GET /api/users - Alle Benutzer auflisten
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { lastName: "asc" },
    });

    return NextResponse.json({ data: users });
  } catch (error) {
    console.error("Fehler beim Laden der Benutzer:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// POST /api/users - Neuen Benutzer anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, firstName, lastName, password, role } = body;

    // Validierung
    const errors: string[] = [];
    if (!email || typeof email !== "string" || !email.trim()) {
      errors.push("E-Mail ist ein Pflichtfeld");
    }
    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
      errors.push("Vorname ist ein Pflichtfeld");
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
      errors.push("Nachname ist ein Pflichtfeld");
    }
    if (!password || typeof password !== "string" || password.length < 12) {
      errors.push("Passwort muss mindestens 12 Zeichen lang sein");
    }
    if (password && (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))) {
      errors.push("Passwort muss Gross-/Kleinbuchstaben und Ziffern enthalten");
    }
    if (role && !["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"].includes(role)) {
      errors.push("Ungültige Rolle");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    // Pruefen ob E-Mail bereits vergeben
    const existing = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits verwendet" },
        { status: 409 }
      );
    }

    // Passwort hashen
    const passwordHash = await bcrypt.hash(password, 12);

    // Benutzer anlegen
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        passwordHash,
        role: role || "HR_SACHBEARBEITER",
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Anlegen des Benutzers:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
