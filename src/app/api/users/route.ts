/**
 * API: /api/users
 *
 * GET  - Alle Benutzer auflisten (nur SUPER_ADMIN / HR_LEITUNG)
 * POST - Neuen Benutzer anlegen (nur SUPER_ADMIN / HR_LEITUNG)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateSetupToken, buildSetupEmail } from "@/lib/passwort-setup";
import { sendEmailDetailed } from "@/lib/mailer";
import { assignableRoles } from "@/lib/permissions";

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
        phone: true,
        role: true,
        isActive: true,
        isBemBeauftragte: true,
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
    const { email, firstName, lastName, phone, password, role, isBemBeauftragte } = body;

    // Externe BEM-Beauftragte (E7) werden OHNE Passwort angelegt und richten es
    // ueber einen Setup-Link selbst ein.
    const isExternalBem = role === "BEM_BEAUFTRAGTER";

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
    // Passwort nur fuer NICHT-externe Rollen verpflichtend.
    if (!isExternalBem) {
      if (!password || typeof password !== "string" || password.length < 12) {
        errors.push("Passwort muss mindestens 12 Zeichen lang sein");
      }
      if (password && (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))) {
        errors.push("Passwort muss Gross-/Kleinbuchstaben und Ziffern enthalten");
      }
    }
    if (role && !assignableRoles(session.role).includes(role)) {
      errors.push(
        role === "SUPER_ADMIN"
          ? "Nur ein Super-Admin darf die Rolle Super-Admin vergeben"
          : "Ungültige Rolle"
      );
    }
    // Telefon ist optional; wenn gesetzt, muss es ein String sinnvoller Laenge sein
    if (phone !== undefined && phone !== null && phone !== "") {
      if (typeof phone !== "string" || phone.trim().length > 50) {
        errors.push("Telefonnummer darf höchstens 50 Zeichen lang sein");
      }
    }
    // Externe BEM-Beauftragte brauchen eine E-Mail-Adresse fuer den Setup-Link.
    if (isExternalBem && !process.env.APP_URL) {
      errors.push("APP_URL ist nicht konfiguriert (fuer den Setup-Link erforderlich)");
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

    // BEM-Beauftragten-Kennzeichnung (Flag) nur durch SUPER_ADMIN setzbar.
    // Die externe Rolle BEM_BEAUFTRAGTER braucht das Flag nicht (Rolle reicht).
    const setBem = isBemBeauftragte === true && session.role === "SUPER_ADMIN";

    // Externe Beauftragte: kein Passwort, sondern Setup-Token. Der initiale
    // passwordHash ist ein gueltiger bcrypt-Hash eines Zufallswerts -> Login per
    // Passwort schlaegt zuverlaessig fehl, bis ueber den Setup-Link eines gesetzt wird.
    const setup = isExternalBem ? generateSetupToken() : null;
    const passwordHash = isExternalBem
      ? await bcrypt.hash(randomUUID(), 12)
      : await bcrypt.hash(password, 12);

    // Benutzer anlegen
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: typeof phone === "string" && phone.trim() !== "" ? phone.trim() : null,
        passwordHash,
        role: role || "HR_SACHBEARBEITER",
        isBemBeauftragte: setBem,
        // Externe Konten erst nach erfolgreichem Setup loginfaehig (doppelte
        // Sperre: kein gueltiges Passwort UND inaktiv). Setup-POST aktiviert.
        isActive: isExternalBem ? false : true,
        passwortSetupTokenHash: setup?.tokenHash ?? null,
        passwortSetupExpiresAt: setup?.expiresAt ?? null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        isBemBeauftragte: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    // Setup-Link versenden (nach erfolgreicher Anlage).
    let setupMailOk: boolean | undefined;
    if (isExternalBem && setup) {
      const mail = buildSetupEmail({
        firstName: user.firstName,
        lastName: user.lastName,
        token: setup.token,
      });
      const res = await sendEmailDetailed({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      setupMailOk = res.ok;
      if (!res.ok) {
        console.error("[API] Setup-Mail fehlgeschlagen:", res.error);
      }
    }

    return NextResponse.json(
      { ...user, ...(isExternalBem ? { setupMailVersendet: !!setupMailOk } : {}) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Fehler beim Anlegen des Benutzers:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
