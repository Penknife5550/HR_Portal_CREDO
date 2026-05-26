/**
 * API: /api/settings/webhooks/[id]
 *
 * PUT    – Webhook aktualisieren
 * DELETE – Webhook löschen
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encrypt, isEncryptionConfigured } from "@/lib/encryption";
import { isValidUrl } from "@/lib/constants";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

// =============================================
// PUT /api/settings/webhooks/[id]
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const { event, name, url, authType, authHeader, authValue, description, isActive } = body;

    // Pruefen ob Webhook existiert
    const existing = await prisma.webhookConfig.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Webhook nicht gefunden" }, { status: 404 });

    // Validierung
    if (url && !isValidUrl(url)) {
      return NextResponse.json(
        { error: "URL ist nicht gültig (muss mit http:// oder https:// beginnen)" },
        { status: 400 }
      );
    }

    // authValue: "••••••••" bedeutet "nicht aendern" (bestehenden verschluesselten Wert behalten)
    const rawAuthValue = authValue?.trim() || null;
    const newAuthValue =
      authValue === "••••••••"
        ? existing.authValue
        : rawAuthValue && isEncryptionConfigured()
          ? encrypt(rawAuthValue)
          : rawAuthValue;

    const updated = await prisma.webhookConfig.update({
      where: { id },
      data: {
        event: event?.trim() ?? existing.event,
        name: name?.trim() ?? existing.name,
        url: url?.trim() ?? existing.url,
        authType: authType ?? existing.authType,
        authHeader: authHeader?.trim() || null,
        authValue: newAuthValue,
        description: description?.trim() || null,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    return NextResponse.json({
      data: { ...updated, authValue: updated.authValue ? "••••••••" : null },
    });
  } catch (error) {
    console.error("[API] Webhook aktualisieren fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// DELETE /api/settings/webhooks/[id]
// =============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;

    const existing = await prisma.webhookConfig.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Webhook nicht gefunden" }, { status: 404 });

    await prisma.webhookConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Webhook löschen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
