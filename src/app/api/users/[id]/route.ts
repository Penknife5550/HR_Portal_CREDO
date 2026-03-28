/**
 * API: /api/users/:id
 *
 * PATCH  - Benutzer aktualisieren (nur SUPER_ADMIN / HR_LEITUNG)
 * DELETE - Benutzer deaktivieren (nur SUPER_ADMIN / HR_LEITUNG)
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// =============================================
// PATCH /api/users/:id - Benutzer aktualisieren
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Pruefen ob Benutzer existiert
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { firstName, lastName, email, role, isActive, password } = body;

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};

    if (firstName !== undefined) {
      if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
        return NextResponse.json(
          { error: "Vorname darf nicht leer sein" },
          { status: 400 }
        );
      }
      updateData.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
        return NextResponse.json(
          { error: "Nachname darf nicht leer sein" },
          { status: 400 }
        );
      }
      updateData.lastName = lastName.trim();
    }

    if (email !== undefined) {
      if (!email || typeof email !== "string" || !email.trim()) {
        return NextResponse.json(
          { error: "E-Mail darf nicht leer sein" },
          { status: 400 }
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Eindeutigkeit pruefen (nur wenn sich E-Mail aendert)
      if (normalizedEmail !== existingUser.email) {
        const emailTaken = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (emailTaken) {
          return NextResponse.json(
            { error: "Diese E-Mail-Adresse wird bereits verwendet" },
            { status: 409 }
          );
        }
      }
      updateData.email = normalizedEmail;
    }

    if (role !== undefined) {
      if (!["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"].includes(role)) {
        return NextResponse.json(
          { error: "Ungültige Rolle" },
          { status: 400 }
        );
      }
      updateData.role = role;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 12) {
        return NextResponse.json(
          { error: "Passwort muss mindestens 12 Zeichen lang sein" },
          { status: 400 }
        );
      }
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return NextResponse.json(
          { error: "Passwort muss Gross-/Kleinbuchstaben und Ziffern enthalten" },
          { status: 400 }
        );
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    // Benutzer aktualisieren
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Benutzers:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/users/:id - Benutzer deaktivieren (Soft Delete)
// =============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Pruefen ob Benutzer existiert
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    // Sich selbst darf man nicht deaktivieren
    if (id === session.userId) {
      return NextResponse.json(
        { error: "Sie können sich nicht selbst deaktivieren" },
        { status: 400 }
      );
    }

    // Soft Delete: isActive = false
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: "Benutzer deaktiviert" });
  } catch (error) {
    console.error("Fehler beim Deaktivieren des Benutzers:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
