/**
 * API: /api/settings/smtp
 *
 * GET – SMTP-Konfiguration laden (Passwort maskiert)
 * PUT – SMTP-Konfiguration speichern
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encrypt, isEncryptionConfigured } from "@/lib/encryption";
import { isValidEmail } from "@/lib/constants";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

function maskConfig(config: {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...config,
    password: config.password ? "••••••••" : "",
  };
}

// =============================================
// GET /api/settings/smtp
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const config = await prisma.smtpConfig.findUnique({ where: { id: "default" } });

    // Falls noch keine Konfiguration vorhanden: Standardwerte liefern
    if (!config) {
      return NextResponse.json({
        data: {
          id: "default",
          host: "",
          port: 587,
          secure: false,
          username: "",
          password: "",
          fromEmail: "",
          fromName: "CREDO HR-Portal",
          isActive: false,
        },
      });
    }

    return NextResponse.json({ data: maskConfig(config) });
  } catch (error) {
    console.error("[API] SMTP-Konfiguration laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PUT /api/settings/smtp – Konfiguration speichern
// =============================================
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json();
    const { host, port, secure, username, password, fromEmail, fromName, isActive } = body;

    // Pflichtfelder pruefen wenn aktiviert
    if (isActive) {
      const errors: string[] = [];
      if (!host?.trim()) errors.push("SMTP-Host ist ein Pflichtfeld");
      if (!username?.trim()) errors.push("Benutzername ist ein Pflichtfeld");
      if (!fromEmail?.trim()) errors.push("Absender-E-Mail ist ein Pflichtfeld");
      if (fromEmail && !isValidEmail(fromEmail)) errors.push("Absender-E-Mail ist ungueltig");
      if (errors.length > 0) return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    // Bestehende Konfiguration laden (fuer Passwort-Handling)
    const existing = await prisma.smtpConfig.findUnique({ where: { id: "default" } });

    // Passwort: "••••••••" = nicht aendern (bestehenden verschluesselten Wert behalten)
    const rawPassword =
      password === "••••••••"
        ? (existing?.password ?? "")
        : (password?.trim() ?? "");
    const newPassword =
      password === "••••••••"
        ? rawPassword
        : isEncryptionConfigured() ? encrypt(rawPassword) : rawPassword;

    const config = await prisma.smtpConfig.upsert({
      where: { id: "default" },
      update: {
        host: host?.trim() ?? "",
        port: Number(port) || 587,
        secure: Boolean(secure),
        username: username?.trim() ?? "",
        password: newPassword,
        fromEmail: fromEmail?.trim() ?? "",
        fromName: fromName?.trim() || "CREDO HR-Portal",
        isActive: Boolean(isActive),
      },
      create: {
        id: "default",
        host: host?.trim() ?? "",
        port: Number(port) || 587,
        secure: Boolean(secure),
        username: username?.trim() ?? "",
        password: newPassword,
        fromEmail: fromEmail?.trim() ?? "",
        fromName: fromName?.trim() || "CREDO HR-Portal",
        isActive: Boolean(isActive),
      },
    });

    return NextResponse.json({ data: maskConfig(config) });
  } catch (error) {
    console.error("[API] SMTP-Konfiguration speichern fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
