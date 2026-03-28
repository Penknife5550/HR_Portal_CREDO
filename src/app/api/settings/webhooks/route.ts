/**
 * API: /api/settings/webhooks
 *
 * GET  – Alle Webhook-Konfigurationen laden
 * POST – Neuen Webhook anlegen
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encrypt, isEncryptionConfigured } from "@/lib/encryption";
import { isValidUrl } from "@/lib/constants";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// Sensible Werte im Response maskieren
function maskWebhook(webhook: {
  id: string;
  event: string;
  name: string;
  url: string;
  authType: string;
  authHeader: string | null;
  authValue: string | null;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...webhook,
    authValue: webhook.authValue ? "••••••••" : null,
  };
}

// =============================================
// GET /api/settings/webhooks
// =============================================
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const webhooks = await prisma.webhookConfig.findMany({
      orderBy: [{ event: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ data: webhooks.map(maskWebhook) });
  } catch (error) {
    console.error("[API] Webhooks laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST /api/settings/webhooks – Webhook anlegen
// =============================================
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json();
    const { event, name, url, authType, authHeader, authValue, description, isActive } = body;

    // Validierung
    const errors: string[] = [];
    if (!event?.trim()) errors.push("Event ist ein Pflichtfeld");
    if (!name?.trim()) errors.push("Name ist ein Pflichtfeld");
    if (!url?.trim()) errors.push("URL ist ein Pflichtfeld");
    if (url && !isValidUrl(url)) errors.push("URL ist nicht gültig (muss mit http:// oder https:// beginnen)");
    if (authType && !["none", "api_key", "bearer", "basic"].includes(authType)) {
      errors.push("Ungültiger Auth-Typ");
    }
    if (authType === "api_key" && !authHeader?.trim()) {
      errors.push("API-Key: Header-Name ist ein Pflichtfeld");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
    }

    const rawAuthValue = authValue?.trim() || null;
    const encryptedAuthValue = rawAuthValue && isEncryptionConfigured()
      ? encrypt(rawAuthValue)
      : rawAuthValue;

    const webhook = await prisma.webhookConfig.create({
      data: {
        event: event.trim(),
        name: name.trim(),
        url: url.trim(),
        authType: authType || "none",
        authHeader: authHeader?.trim() || null,
        authValue: encryptedAuthValue,
        description: description?.trim() || null,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ data: maskWebhook(webhook) }, { status: 201 });
  } catch (error) {
    console.error("[API] Webhook anlegen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
