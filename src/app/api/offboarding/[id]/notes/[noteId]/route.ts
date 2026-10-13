/**
 * API: /api/offboarding/:id/notes/:noteId
 *
 * PATCH  – Notiz bearbeiten (PORTAL_ROLES, nur wer sie angelegt hat)
 * DELETE – Notiz löschen (PORTAL_ROLES, nur wer sie angelegt hat)
 *
 * Mandant per canAccessProcess: unbekannt und fremd = dieselbe 404. Eine
 * Notiz aus einem anderen Vorgang bekommt dieselbe 404 wie eine unbekannte.
 * Eine fremde Notiz im eigenen Vorgang = 403 — die Person sieht sie ja.
 * Geschrieben wird bedingt auf Vorgang UND Urheber; im AuditLog steht nur die
 * Laenge, nie der Text.
 */

import { NextResponse } from "next/server";
import type { z } from "zod";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { PORTAL_ROLES, type SessionPayload } from "@/lib/permissions";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";
import { offboardingNotizSchema } from "@/lib/validations/offboarding";

const LOG_LABEL = "Offboarding/Notizen";

/** Gleicher Text fuer „gibt es nicht" und „gehoert zu einem anderen Vorgang". */
const NOTIZ_NICHT_GEFUNDEN = "Notiz nicht gefunden";

type Pruefung =
  | { ok: true; note: { id: string; content: string } }
  | { ok: false; antwort: NextResponse };

/** Vorgang zugaenglich, Notiz in diesem Vorgang, von dieser Person angelegt? */
async function eigeneNotizLaden(
  session: SessionPayload,
  id: string,
  noteId: string,
  verb: "bearbeiten" | "löschen"
): Promise<Pruefung> {
  if (!(await offboardingZugaenglich(session, id))) return { ok: false, antwort: nichtGefunden() };

  const note = await prisma.offboardingNote.findFirst({
    where: { id: noteId, offboardingId: id },
    select: { id: true, content: true, createdById: true },
  });
  if (!note) return { ok: false, antwort: nichtGefunden(NOTIZ_NICHT_GEFUNDEN) };

  if (note.createdById !== session.userId) {
    return {
      ok: false,
      antwort: NextResponse.json(
        { error: `Nur wer die Notiz angelegt hat, kann sie ${verb}.` },
        { status: 403 }
      ),
    };
  }
  return { ok: true, note };
}

// =============================================
// PATCH /api/offboarding/:id/notes/:noteId – Notiz bearbeiten
// =============================================
export const PATCH = apiHandler<z.infer<typeof offboardingNotizSchema>>(
  { roles: PORTAL_ROLES, bodySchema: offboardingNotizSchema, logLabel: LOG_LABEL },
  async ({ params, session, body }) => {
    const pruefung = await eigeneNotizLaden(session!, params.id, params.noteId, "bearbeiten");
    if (!pruefung.ok) return pruefung.antwort;

    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.offboardingNote.updateMany({
        where: { id: pruefung.note.id, offboardingId: params.id, createdById: session!.userId },
        data: { content: body.content },
      });
      if (count === 0) return null;
      await tx.auditLog.create({
        data: {
          offboardingId: params.id,
          userId: session!.userId,
          processType: "OFFBOARDING",
          action: "NOTE_UPDATED",
          details: {
            noteId: pruefung.note.id,
            laengeVorher: pruefung.note.content.length,
            laenge: body.content.length,
          },
        },
      });
      return tx.offboardingNote.findUnique({
        where: { id: pruefung.note.id },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true },
          },
        },
      });
    });

    // Zwischen Lesen und Schreiben geloescht.
    if (!updated) return nichtGefunden(NOTIZ_NICHT_GEFUNDEN);
    return NextResponse.json({ data: updated });
  }
);

// =============================================
// DELETE /api/offboarding/:id/notes/:noteId – Notiz löschen
// =============================================
export const DELETE = apiHandler(
  { roles: PORTAL_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    const pruefung = await eigeneNotizLaden(session!, params.id, params.noteId, "löschen");
    if (!pruefung.ok) return pruefung.antwort;

    const geloescht = await prisma.$transaction(async (tx) => {
      const { count } = await tx.offboardingNote.deleteMany({
        where: { id: pruefung.note.id, offboardingId: params.id, createdById: session!.userId },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          offboardingId: params.id,
          userId: session!.userId,
          processType: "OFFBOARDING",
          action: "NOTE_DELETED",
          details: { noteId: pruefung.note.id, laenge: pruefung.note.content.length },
        },
      });
      return true;
    });

    if (!geloescht) return nichtGefunden(NOTIZ_NICHT_GEFUNDEN);
    return NextResponse.json({ success: true });
  }
);
