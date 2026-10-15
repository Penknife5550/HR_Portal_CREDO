/**
 * API: /api/offboarding/:id/notes — Reiter „Notizen"
 *
 * GET  – Alle Notizen eines Offboarding-Vorgangs laden (PORTAL_ROLES)
 * POST – Neue Notiz erstellen (PORTAL_ROLES — Notizen darf laut
 *        `permissions.ts` auch die Fuehrungskraft schreiben)
 *
 * Mandant per canAccessProcess: unbekannt und fremd = dieselbe 404. Der
 * n8n-Schluessel (SERVICE) steht nicht in PORTAL_ROLES → 403. Im AuditLog
 * steht nur die Laenge der Notiz, nie ihr Text.
 */

import { NextResponse } from "next/server";
import type { z } from "zod";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { PORTAL_ROLES } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";
import { offboardingNotizSchema } from "@/lib/validations/offboarding";

const LOG_LABEL = "Offboarding/Notizen";

// =============================================
// GET /api/offboarding/:id/notes
// =============================================
export const GET = apiHandler(
  { roles: PORTAL_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

    const notes = await prisma.offboardingNote.findMany({
      where: { offboardingId: params.id },
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: notes });
  }
);

// =============================================
// POST /api/offboarding/:id/notes – Neue Notiz erstellen
// =============================================
export const POST = apiHandler<z.infer<typeof offboardingNotizSchema>>(
  { roles: PORTAL_ROLES, bodySchema: offboardingNotizSchema, logLabel: LOG_LABEL },
  async ({ params, session, body }) => {
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

    // Notiz und Protokoll in EINER Transaktion.
    const note = await prisma.$transaction(async (tx) => {
      const neu = await tx.offboardingNote.create({
        data: {
          offboardingId: params.id,
          content: body.content,
          createdById: session!.userId,
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          offboardingId: params.id,
          userId: session!.userId,
          processType: "OFFBOARDING",
          action: "NOTE_CREATED",
          details: { noteId: neu.id, laenge: body.content.length },
        },
      });
      return neu;
    });

    return NextResponse.json({ data: note }, { status: 201 });
  }
);
