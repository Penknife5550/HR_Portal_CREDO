/**
 * API: /api/settings/api-keys
 *
 * GET  – Alle API-Keys auflisten (ohne Hash, nur Prefix)
 * POST – Neuen API-Key erstellen — Klartext wird NUR in dieser Antwort geliefert
 *
 * Berechtigung: SUPER_ADMIN
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateApiKey } from "@/lib/api-key";

const ALLOWED_ROLES = ["SUPER_ADMIN"];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: keys });
  } catch (error) {
    console.error("[API] API-Keys laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name ist ein Pflichtfeld" }, { status: 400 });
    }

    const { plaintext, keyHash, prefix } = generateApiKey();
    const created = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        prefix,
        scopes: ["reports:read"],
        createdBy: session.userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "SYSTEM",
        action: "API_KEY_CREATED",
        details: { apiKeyId: created.id, name },
      },
    });

    return NextResponse.json(
      {
        data: {
          id: created.id,
          name: created.name,
          prefix: created.prefix,
          scopes: created.scopes,
          isActive: created.isActive,
          createdAt: created.createdAt,
          // Klartext-Key: wird nur in dieser Antwort geliefert!
          plaintextKey: plaintext,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API] API-Key erstellen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
