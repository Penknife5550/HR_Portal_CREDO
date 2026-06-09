/**
 * API: /api/bem-vorlagen — editierbare BEM-Vorlagen (E10)
 *
 * GET  – Liste aller Typen mit effektivem Inhalt (Override -> global -> Default)
 *        fuer einen optionalen Mandanten. PUT – Vorlage anlegen/aktualisieren
 *        (Version++, auditiert). DELETE – Mandant-Override entfernen.
 * Nur SUPER_ADMIN / HR_LEITUNG (ADMIN_ROLES).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import { BEM_VORLAGE_TYPEN, getBemVorlageDefault, istChecklistenTyp } from "@/lib/bem-vorlagen";
import type { BemVorlageTyp, Prisma } from "@prisma/client";

function darf(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!darf(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const orgId = new URL(request.url).searchParams.get("organizationId") || null;

    // Alle relevanten Zeilen (global + ggf. Override) in EINER Query laden.
    const rows = await prisma.bemVorlage.findMany({
      where: { OR: [{ organizationId: null }, ...(orgId ? [{ organizationId: orgId }] : [])] },
      orderBy: { updatedAt: "desc" },
      select: { typ: true, organizationId: true, inhalt: true, version: true },
    });

    const items = BEM_VORLAGE_TYPEN.map((typ) => {
      const global = rows.find((r) => r.typ === typ && r.organizationId === null);
      const override = orgId
        ? rows.find((r) => r.typ === typ && r.organizationId === orgId)
        : undefined;
      const effektiv = override ?? global;
      return {
        typ,
        istCheckliste: istChecklistenTyp(typ),
        inhalt: effektiv ? effektiv.inhalt : getBemVorlageDefault(typ).inhalt,
        version: effektiv ? effektiv.version : 0,
        hatGlobal: !!global,
        hatOverride: !!override,
        default: getBemVorlageDefault(typ).inhalt,
      };
    });

    return NextResponse.json({ data: { organizationId: orgId, vorlagen: items } });
  } catch (error) {
    console.error("[API] BEM-Vorlagen GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!darf(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const body = await request.json().catch(() => null);
    const typ = body?.typ as BemVorlageTyp;
    const organizationId: string | null = body?.organizationId ?? null;
    const rawInhalt = body?.inhalt;
    if (!typ || !BEM_VORLAGE_TYPEN.includes(typ)) {
      return NextResponse.json({ error: "Ungültiger Vorlagen-Typ" }, { status: 400 });
    }
    // Inhalts-Form je Typ validieren + normalisieren.
    let inhalt: Prisma.InputJsonValue;
    if (istChecklistenTyp(typ)) {
      if (!Array.isArray(rawInhalt) || !rawInhalt.every((x) => typeof x === "string")) {
        return NextResponse.json(
          { error: "Checkliste muss eine Liste von Texten sein" },
          { status: 400 },
        );
      }
      const items = (rawInhalt as string[]).map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) {
        return NextResponse.json(
          { error: "Die Checkliste muss mindestens einen Punkt enthalten" },
          { status: 400 },
        );
      }
      inhalt = items;
    } else {
      const koerper = typeof rawInhalt?.koerper === "string" ? rawInhalt.koerper.trim() : "";
      const titel = typeof rawInhalt?.titel === "string" ? rawInhalt.titel.trim() : "";
      if (!koerper) {
        return NextResponse.json(
          { error: "Der Text darf nicht leer sein" },
          { status: 400 },
        );
      }
      inhalt = { titel, koerper };
    }
    // Mandant-Override: Existenz des Mandanten pruefen.
    if (organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
      }
    }

    const existing = await prisma.bemVorlage.findFirst({
      where: { typ, organizationId },
      select: { id: true, version: true },
    });
    const saved = existing
      ? await prisma.bemVorlage.update({
          where: { id: existing.id },
          data: { inhalt, version: existing.version + 1, aktualisiertById: session.userId },
          select: { id: true, version: true },
        })
      : await prisma.bemVorlage.create({
          data: { typ, organizationId, inhalt, aktualisiertById: session.userId },
          select: { id: true, version: true },
        });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "BEM",
        action: "BEM_VORLAGE_GEAENDERT",
        details: { typ, organizationId, version: saved.version },
      },
    });

    return NextResponse.json({ data: saved });
  } catch (error) {
    console.error("[API] BEM-Vorlagen PUT fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!darf(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const typ = searchParams.get("typ") as BemVorlageTyp | null;
    const organizationId = searchParams.get("organizationId");
    if (!typ || !BEM_VORLAGE_TYPEN.includes(typ) || !organizationId) {
      return NextResponse.json(
        { error: "typ und organizationId (Override) erforderlich" },
        { status: 400 },
      );
    }
    await prisma.bemVorlage.deleteMany({ where: { typ, organizationId } });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "BEM",
        action: "BEM_VORLAGE_OVERRIDE_ENTFERNT",
        details: { typ, organizationId },
      },
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API] BEM-Vorlagen DELETE fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
