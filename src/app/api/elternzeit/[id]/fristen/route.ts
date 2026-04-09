/**
 * API: /api/elternzeit/[id]/fristen
 *
 * GET   – Alle Fristen eines Vorgangs auflisten (mit Severity).
 * POST  – Neue manuelle Frist anlegen (HR_EDIT_ROLES).
 *
 * Einzelne Frist erledigen via PATCH /api/elternzeit/[id]/fristen/[fristId].
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES, PORTAL_ROLES, canAccessProcess } from "@/lib/permissions";
import {
  berechneSeverity,
  verbleibendeTage,
  syncElternzeitFristen,
} from "@/lib/elternzeit-fristen";

const createSchema = z.object({
  bezeichnung: z.string().min(1).max(200),
  beschreibung: z.string().max(2000).optional().nullable(),
  faelligAm: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!PORTAL_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    // IDOR-Schutz: Mandant-Scope pruefen
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    // Aktuell halten — Mandanten-bezogene Aenderungen werden hier sichtbar
    await syncElternzeitFristen(id).catch((err) =>
      console.error(
        `[syncElternzeitFristen] Fehler beim Lesen der Fristen ${id}:`,
        err instanceof Error ? err.message : err,
      ),
    );

    const fristen = await prisma.elternzeitFrist.findMany({
      where: { elternzeitId: id },
      orderBy: [{ erledigtAm: "asc" }, { faelligAm: "asc" }],
    });

    const heute = new Date();
    const enriched = fristen.map((f) => ({
      ...f,
      severity: f.erledigtAm ? null : berechneSeverity(f.faelligAm, heute),
      verbleibendeTage: f.erledigtAm ? null : verbleibendeTage(f.faelligAm, heute),
    }));

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error("[API] elternzeit/fristen GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!HR_EDIT_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { id } = await params;

    // IDOR-Schutz: Mandant-Scope pruefen
    const ez = await prisma.elternzeitProzess.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!ez) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessProcess(session, ez.organizationId))) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const frist = await prisma.elternzeitFrist.create({
      data: {
        elternzeitId: id,
        fristTyp: "SONSTIGE",
        bezeichnung: parsed.data.bezeichnung,
        beschreibung: parsed.data.beschreibung ?? null,
        faelligAm: new Date(parsed.data.faelligAm),
      },
    });

    return NextResponse.json({ data: frist });
  } catch (error) {
    console.error("[API] elternzeit/fristen POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
