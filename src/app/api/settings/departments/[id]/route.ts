/**
 * API: /api/settings/departments/[id]  (Einstellungen → Abteilungen)
 *
 * PATCH  - Anzeigename, E-Mail-Adresse und aktiv/inaktiv aendern
 * DELETE - Abteilung entfernen
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG (adminHandler)
 *
 * Schluessel und Einrichtung sind nicht aenderbar (das Schema wirft sie weg);
 * dafuer loeschen und neu anlegen. Schon verschickte Links behalten ihre
 * Adresse. Erinnerungen und „Erneut senden" pruefen die Adresse neu: Nach einer
 * Aenderung ueberspringt der taegliche Lauf den Link mit „Adresse geändert,
 * bitte Link erneuern", nach dem Loeschen mit „keine aktive Adresse".
 *
 * Paket 1b (M8): vorher ohne zod (`email.trim()` auf einer Zahl → 500) und
 * ohne Protokoll.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { adminHandler } from "@/lib/api-handler";
import { ABTEILUNGS_AUDIT, abteilungKonfigDto } from "@/lib/abteilungsaufgaben";
import {
  abteilungConfigUpdateSchema,
  type AbteilungConfigUpdateInput,
} from "@/lib/validations/abteilungsaufgaben";

const LOG_LABEL = "Einstellungen/Abteilungen";
const NICHT_GEFUNDEN = "Abteilung nicht gefunden";

/** Zwilling in ../route.ts (eine Route-Datei exportiert nur HTTP-Methoden). */
const MIT_EINRICHTUNG = { organization: { select: { id: true, name: true } } } as const;

/**
 * P2025 = Datensatz fehlt. Tritt auf, wenn die Abteilung zwischen Lesen und
 * Schreiben geloescht wurde (zweiter Tab) — dann 404 statt 500.
 */
function istVerschwunden(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025";
}

// =============================================
// PATCH /api/settings/departments/[id]
// =============================================
export const PATCH = adminHandler<AbteilungConfigUpdateInput>(async ({ body, params, session }) => {
  const { id } = params;

  const bisher = await prisma.departmentConfig.findUnique({ where: { id }, include: MIT_EINRICHTUNG });
  if (!bisher) return NextResponse.json({ error: NICHT_GEFUNDEN }, { status: 404 });

  // Nur was sich wirklich aendert, landet im Update und im Protokoll.
  const daten: { departmentName?: string; email?: string; isActive?: boolean } = {};
  const aenderungen: Record<string, { von: string | boolean; nach: string | boolean }> = {};
  if (body.departmentName !== undefined && body.departmentName !== bisher.departmentName) {
    daten.departmentName = body.departmentName;
    aenderungen.departmentName = { von: bisher.departmentName, nach: body.departmentName };
  }
  if (body.email !== undefined && body.email !== bisher.email) {
    daten.email = body.email;
    aenderungen.email = { von: bisher.email, nach: body.email };
  }
  if (body.isActive !== undefined && body.isActive !== bisher.isActive) {
    daten.isActive = body.isActive;
    aenderungen.isActive = { von: bisher.isActive, nach: body.isActive };
  }

  // Nichts geaendert (z. B. „Speichern" ohne Eingabe): kein Schreiben, kein Protokoll.
  if (Object.keys(daten).length === 0) {
    return NextResponse.json({ data: abteilungKonfigDto(bisher) });
  }

  try {
    const aktualisiert = await prisma.$transaction(async (tx) => {
      const neu = await tx.departmentConfig.update({
        where: { id },
        data: daten,
        include: MIT_EINRICHTUNG,
      });
      await tx.auditLog.create({
        data: {
          userId: session?.userId ?? null,
          processType: "SYSTEM",
          action: ABTEILUNGS_AUDIT.KONFIG_GEAENDERT,
          details: {
            departmentConfigId: id,
            departmentKey: bisher.departmentKey,
            organizationId: bisher.organizationId,
            aenderungen,
          },
        },
      });
      return neu;
    });
    return NextResponse.json({ data: abteilungKonfigDto(aktualisiert) });
  } catch (error) {
    if (istVerschwunden(error)) return NextResponse.json({ error: NICHT_GEFUNDEN }, { status: 404 });
    throw error;
  }
}, { bodySchema: abteilungConfigUpdateSchema, logLabel: LOG_LABEL });

// =============================================
// DELETE /api/settings/departments/[id]
// =============================================
export const DELETE = adminHandler(async ({ params, session }) => {
  const { id } = params;

  const bisher = await prisma.departmentConfig.findUnique({ where: { id } });
  if (!bisher) return NextResponse.json({ error: NICHT_GEFUNDEN }, { status: 404 });

  try {
    // Loeschen und Protokoll in EINER Transaktion: entweder beides oder nichts.
    await prisma.$transaction(async (tx) => {
      await tx.departmentConfig.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: session?.userId ?? null,
          processType: "SYSTEM",
          action: ABTEILUNGS_AUDIT.KONFIG_GELOESCHT,
          details: {
            departmentConfigId: id,
            departmentKey: bisher.departmentKey,
            departmentName: bisher.departmentName,
            email: bisher.email,
            organizationId: bisher.organizationId,
          },
        },
      });
    });
  } catch (error) {
    if (istVerschwunden(error)) return NextResponse.json({ error: NICHT_GEFUNDEN }, { status: 404 });
    throw error;
  }

  return NextResponse.json({ success: true });
}, { logLabel: LOG_LABEL });
