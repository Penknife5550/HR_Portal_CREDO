/**
 * API: /api/offboarding/:id/return-items — Reiter „Rückgaben“
 *
 * GET    – Gegenstaende auflisten (PORTAL_ROLES)
 * POST   – Gegenstand erfassen (HR_EDIT_ROLES)
 * PATCH  – Gegenstand aendern, etwa die Rueckgabe bestaetigen
 *          (HR_EDIT_ROLES, `itemId` im Body) – duenn um `rueckgabeAendern`
 *          (src/lib/offboarding-ausgaben.ts)
 * DELETE – Gegenstand loeschen (HR_EDIT_ROLES, `itemId` als Query-Parameter
 *          oder im Body)
 *
 * Mandant per canAccessProcess (`offboardingZugaenglich`): Ein Vorgang eines
 * fremden Mandanten bekommt dieselbe 404 mit demselben Text wie ein
 * unbekannter, ein Gegenstand aus einem anderen Vorgang dieselbe wie ein
 * unbekannter Gegenstand — die Antwort verraet nicht, dass es ihn gibt. Jede
 * Aenderung schreibt ihr AuditLog im selben Commit; dort stehen nur ID,
 * Kategorie, die Namen der geaenderten Felder und der Zustand, nie Freitext
 * (Gegenstand, Seriennummer, Zustandstext, Notiz).
 *
 * Seit A4 (S30, G15, G16): `zustand` (einer der fuenf Rueckgabezustaende,
 * `null` = wieder offen) neben der Altform `isReturned`. Eine Zeile aus der
 * Einstellung (`ausgabeId`) laeuft mit ihrer Ausgabe und der Ruecknahmeaufgabe
 * gleich, ihre Kennung muss `kennungSchema` bestehen (400) und zieht die
 * Ausgabe mit; ist das Stueck an einen anderen Austritt gebunden, 409. Ein
 * abgebrochener Austritt nimmt keine Aenderung mehr an (409). Loeschen laesst
 * sich eine vorgeschlagene Zeile nie (409 – stattdessen „entfällt“).
 */

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES, PORTAL_ROLES } from "@/lib/permissions";
import { MELDUNGEN_AUSGABEN } from "@/lib/ausgaben";
import { rueckgabeAendern } from "@/lib/offboarding-ausgaben";
import { nichtGefunden, offboardingZugaenglich } from "@/lib/offboarding-zugriff";
import {
  rueckgabeAendernSchema,
  rueckgabeAnlegenSchema,
  type RueckgabeAendernInput,
} from "@/lib/validations/offboarding";
import type { z } from "zod";

const LOG_LABEL = "Offboarding/Rückgaben";

// =============================================
// GET /api/offboarding/:id/return-items
// =============================================
export const GET = apiHandler(
  { roles: PORTAL_ROLES, logLabel: LOG_LABEL },
  async ({ params, session }) => {
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

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
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

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
export const PATCH = apiHandler<RueckgabeAendernInput>(
  { roles: HR_EDIT_ROLES, bodySchema: rueckgabeAendernSchema, logLabel: LOG_LABEL },
  async ({ params, session, body }) => {
    const antwort = await rueckgabeAendern({ offboardingId: params.id, eingabe: body, session: session! });
    return NextResponse.json(antwort.body, { status: antwort.status });
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
    if (!(await offboardingZugaenglich(session!, params.id))) return nichtGefunden();

    const vorhanden = await prisma.returnItem.findFirst({
      where: { id: itemId, offboardingId: params.id },
      select: { id: true, category: true, isReturned: true, ausgabeId: true },
    });
    if (!vorhanden) return nichtGefunden(MELDUNGEN_AUSGABEN.GEGENSTAND_NICHT_GEFUNDEN);
    // Aus der Einstellung vorgeschlagen (G15): Die Zeile gehoert zu einer
    // Ausgabe und einer Ruecknahmeaufgabe – stattdessen „entfällt“ waehlen.
    if (vorhanden.ausgabeId) {
      return NextResponse.json(
        { error: MELDUNGEN_AUSGABEN.VORGESCHLAGEN_NICHT_LOESCHEN, grund: "VORGESCHLAGEN_NICHT_LOESCHEN" },
        { status: 409 }
      );
    }

    const geloescht = await prisma.$transaction(async (tx) => {
      // `ausgabeId` setzt nur die Anlage einer Zeile – eine von HR erfasste bekommt nie nachtraeglich eine.
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

    if (!geloescht) return nichtGefunden(MELDUNGEN_AUSGABEN.GEGENSTAND_NICHT_GEFUNDEN);
    return NextResponse.json({ success: true });
  }
);
