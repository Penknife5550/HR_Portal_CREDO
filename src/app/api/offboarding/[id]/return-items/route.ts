/**
 * API: /api/offboarding/:id/return-items — Reiter „Rückgaben“
 *
 * GET    – Gegenstaende auflisten (PORTAL_ROLES)
 * POST   – Gegenstand erfassen (HR_EDIT_ROLES)
 * PATCH  – Gegenstand aendern, etwa die Rueckgabe bestaetigen
 *          (HR_EDIT_ROLES, `itemId` im Body)
 * DELETE – Gegenstand loeschen (HR_EDIT_ROLES, `itemId` als Query-Parameter
 *          oder im Body)
 *
 * Mandant per canAccessProcess: Ein Vorgang eines fremden Mandanten bekommt
 * dieselbe 404 mit demselben Text wie ein unbekannter, ein Gegenstand aus
 * einem anderen Vorgang dieselbe wie ein unbekannter Gegenstand — die Antwort
 * verraet nicht, dass es ihn gibt. Jede Aenderung schreibt ihr AuditLog im
 * selben Commit; dort stehen nur ID, Kategorie und die Namen der geaenderten
 * Felder, nie Freitext (Gegenstand, Seriennummer, Zustand, Notiz).
 */

import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import {
  canAccessProcess,
  HR_EDIT_ROLES,
  PORTAL_ROLES,
  type SessionPayload,
} from "@/lib/permissions";
import {
  rueckgabeAendernSchema,
  rueckgabeAnlegenSchema,
} from "@/lib/validations/offboarding";

const LOG_LABEL = "Offboarding/Rückgaben";

/** Gleicher Text fuer "gibt es nicht" und "fremder Mandant". */
const NICHT_GEFUNDEN = "Vorgang nicht gefunden";
/** Gleicher Text fuer "gibt es nicht" und "gehoert zu einem anderen Vorgang". */
const GEGENSTAND_NICHT_GEFUNDEN = "Rückgabe-Gegenstand nicht gefunden";

/** Gibt es den Vorgang, und darf die Sitzung ihn sehen? */
async function vorgangZugaenglich(
  session: SessionPayload,
  id: string
): Promise<boolean> {
  const vorgang = await prisma.offboardingProcess.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return !!vorgang && (await canAccessProcess(session, vorgang.organizationId));
}

function nichtGefunden(text = NICHT_GEFUNDEN) {
  return NextResponse.json({ error: text }, { status: 404 });
}

// =============================================
// GET /api/offboarding/:id/return-items
// =============================================
export const GET = apiHandler(
  { roles: PORTAL_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    if (!(await vorgangZugaenglich(session!, params.id))) return nichtGefunden();

    const items = await prisma.returnItem.findMany({
      where: { offboardingId: params.id },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ items });
  }
);

// =============================================
// POST /api/offboarding/:id/return-items
// =============================================
export const POST = apiHandler<z.infer<typeof rueckgabeAnlegenSchema>>(
  { roles: HR_EDIT_ROLES, bodySchema: rueckgabeAnlegenSchema, logLabel: LOG_LABEL },
  async ({ params, session, body }) => {
    if (!(await vorgangZugaenglich(session!, params.id))) return nichtGefunden();

    const item = await prisma.$transaction(async (tx) => {
      const neu = await tx.returnItem.create({
        data: {
          offboardingId: params.id,
          category: body.category,
          itemName: body.itemName,
          serialNumber: body.serialNumber ?? null,
          notes: body.notes ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          offboardingId: params.id,
          userId: session!.userId,
          processType: "OFFBOARDING",
          action: "RETURN_ITEM_CREATED",
          details: { returnItemId: neu.id, category: neu.category },
        },
      });
      return neu;
    });

    return NextResponse.json({ item }, { status: 201 });
  }
);

// =============================================
// PATCH /api/offboarding/:id/return-items
// =============================================
export const PATCH = apiHandler<z.infer<typeof rueckgabeAendernSchema>>(
  { roles: HR_EDIT_ROLES, bodySchema: rueckgabeAendernSchema, logLabel: LOG_LABEL },
  async ({ params, session, body }) => {
    if (!(await vorgangZugaenglich(session!, params.id))) return nichtGefunden();

    const vorhanden = await prisma.returnItem.findFirst({
      where: { id: body.itemId, offboardingId: params.id },
    });
    if (!vorhanden) return nichtGefunden(GEGENSTAND_NICHT_GEFUNDEN);

    const daten: Prisma.ReturnItemUpdateManyMutationInput = {};
    const geaenderteFelder: string[] = [];
    if (body.isReturned !== undefined && body.isReturned !== vorhanden.isReturned) {
      daten.isReturned = body.isReturned;
      daten.returnedAt = body.isReturned ? new Date() : null;
      daten.returnedToId = body.isReturned ? session!.userId : null;
      geaenderteFelder.push("isReturned");
    }
    for (const feld of ["serialNumber", "condition", "notes"] as const) {
      const wert = body[feld];
      if (wert !== undefined && wert !== vorhanden[feld]) {
        daten[feld] = wert;
        geaenderteFelder.push(feld);
      }
    }

    // Nichts zu tun (etwa die Rueckgabe ein zweites Mal bestaetigt): kein
    // Schreiben, kein Protokoll — Zeitpunkt und Person der ersten bleiben.
    if (geaenderteFelder.length === 0) return NextResponse.json({ item: vorhanden });

    const item = await prisma.$transaction(async (tx) => {
      // Bedingt auf den gelesenen Stand: Zwei gleichzeitige Bestaetigungen
      // ueberschrieben sonst Zeitpunkt und Person der ersten.
      const { count } = await tx.returnItem.updateMany({
        where: {
          id: vorhanden.id,
          offboardingId: params.id,
          isReturned: vorhanden.isReturned,
        },
        data: daten,
      });
      if (count === 0) return null;
      await tx.auditLog.create({
        data: {
          offboardingId: params.id,
          userId: session!.userId,
          processType: "OFFBOARDING",
          action: "RETURN_ITEM_UPDATED",
          details: {
            returnItemId: vorhanden.id,
            category: vorhanden.category,
            geaenderteFelder,
            ...(daten.isReturned !== undefined ? { isReturned: daten.isReturned } : {}),
          },
        },
      });
      return tx.returnItem.findUnique({ where: { id: vorhanden.id } });
    });

    if (!item) {
      return NextResponse.json(
        { error: "Der Gegenstand wurde inzwischen geändert oder gelöscht. Bitte die Seite neu laden." },
        { status: 409 }
      );
    }
    return NextResponse.json({ item });
  }
);

// =============================================
// DELETE /api/offboarding/:id/return-items
// =============================================

/** `itemId` aus dem Query-Parameter, sonst aus dem Body. */
async function itemIdLesen(request: NextRequest): Promise<string | null> {
  const ausQuery = request.nextUrl.searchParams.get("itemId");
  if (ausQuery) return ausQuery;
  const roh: unknown = await request.json().catch(() => null);
  const id = roh && typeof roh === "object" ? (roh as { itemId?: unknown }).itemId : undefined;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export const DELETE = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: LOG_LABEL },
  async ({ request, params, session }) => {
    const itemId = await itemIdLesen(request);
    if (!itemId) {
      return NextResponse.json({ error: "Rückgabe-Gegenstand fehlt" }, { status: 400 });
    }
    if (!(await vorgangZugaenglich(session!, params.id))) return nichtGefunden();

    const vorhanden = await prisma.returnItem.findFirst({
      where: { id: itemId, offboardingId: params.id },
      select: { id: true, category: true, isReturned: true },
    });
    if (!vorhanden) return nichtGefunden(GEGENSTAND_NICHT_GEFUNDEN);

    const geloescht = await prisma.$transaction(async (tx) => {
      const { count } = await tx.returnItem.deleteMany({
        where: { id: vorhanden.id, offboardingId: params.id },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          offboardingId: params.id,
          userId: session!.userId,
          processType: "OFFBOARDING",
          action: "RETURN_ITEM_DELETED",
          details: {
            returnItemId: vorhanden.id,
            category: vorhanden.category,
            warZurueckgegeben: vorhanden.isReturned,
          },
        },
      });
      return true;
    });

    if (!geloescht) return nichtGefunden(GEGENSTAND_NICHT_GEFUNDEN);
    return NextResponse.json({ success: true });
  }
);
