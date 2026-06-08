/**
 * API: /api/bem/einwilligung/[token]  (OEFFENTLICH, Magic-Link)
 *
 * GET  – Minimalinfo zum Einwilligungs-Vorgang (Name, Mandant, Art, Status).
 *        Leakt KEINE BEM-Inhalte. Rate-limited gegen Token-Enumeration.
 * POST – Einwilligung erteilen oder ablehnen. Single-Use; speichert
 *        Zeitstempel, IP, Name und einen Integritaets-Hash als Nachweis.
 *
 * Token liegt in der DB nur als SHA-256-Hash (token-hash.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token-hash";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import { einwilligungPublicSchema } from "@/lib/validations/bem";

const ART_LABELS: Record<string, string> = {
  DATENSCHUTZ: "Datenschutz-Einwilligung",
  DURCHFUEHRUNG: "Durchfuehrung des BEM",
  BR: "Beteiligung Betriebsrat",
  SBV: "Beteiligung Schwerbehindertenvertretung",
};

async function loadByToken(token: string) {
  const tokenHash = hashToken(token);
  return prisma.bemEinwilligung.findUnique({
    where: { token: tokenHash },
    select: {
      id: true,
      art: true,
      status: true,
      tokenExpiry: true,
      tokenUsedAt: true,
      bemFall: {
        select: {
          id: true,
          status: true,
          employeeFirstName: true,
          employeeLastName: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const ip = getClientIp(request);
    if (!tokenRateLimiter.check(ip).allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte spaeter erneut versuchen." },
        { status: 429 },
      );
    }
    const { token } = await context.params;
    const e = await loadByToken(token);
    if (!e) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }
    const expired = !!e.tokenExpiry && e.tokenExpiry.getTime() < Date.now();
    const erledigt = e.status !== "OFFEN" || !!e.tokenUsedAt;

    return NextResponse.json({
      data: {
        employeeName: `${e.bemFall.employeeFirstName} ${e.bemFall.employeeLastName}`.trim(),
        organizationName: e.bemFall.organization?.name ?? null,
        art: e.art,
        artLabel: ART_LABELS[e.art] || e.art,
        status: e.status,
        expired,
        erledigt,
      },
    });
  } catch (error) {
    console.error("[API] BEM Einwilligung GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const ip = getClientIp(request);
    if (!tokenRateLimiter.check(ip).allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte spaeter erneut versuchen." },
        { status: 429 },
      );
    }
    const { token } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = einwilligungPublicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const { entscheidung, name } = parsed.data;

    const e = await loadByToken(token);
    if (!e) {
      return NextResponse.json({ error: "Ungueltiger Link" }, { status: 404 });
    }
    if (e.tokenExpiry && e.tokenExpiry.getTime() < Date.now()) {
      return NextResponse.json({ error: "Der Link ist abgelaufen." }, { status: 410 });
    }
    if (e.status !== "OFFEN" || e.tokenUsedAt) {
      return NextResponse.json(
        { error: "Diese Einwilligung wurde bereits beantwortet." },
        { status: 409 },
      );
    }

    const now = new Date();
    const neuerStatus = entscheidung === "ERTEILT" ? "ERTEILT" : "ABGELEHNT";
    // Faelschungssicherer Integritaets-Nachweis: HMAC mit serverseitigem
    // Schluessel (BEM_ENCRYPTION_KEY). Nur der Server kann einen passenden Hash
    // erzeugen — die Werte selbst (signedName/Ip/At) liegen zusaetzlich als
    // Spalten in der DB.
    const hmacKey = process.env.BEM_ENCRYPTION_KEY || "";
    const dokumentHash = createHmac("sha256", hmacKey)
      .update(`${e.id}|${e.bemFall.id}|${neuerStatus}|${name}|${now.getTime()}|${ip}`)
      .digest("hex");

    // Status-Update, Fall-Fortschreibung UND Audit atomar in EINER Transaktion:
    // ein Lese-/Nachweis-Eintrag existiert genau dann, wenn die Einwilligung
    // verbucht wurde (DSGVO Art. 5 Abs. 2 Rechenschaftspflicht).
    await prisma.$transaction(async (tx) => {
      // Single-Use race-frei: nur aktualisieren solange noch OFFEN.
      const upd = await tx.bemEinwilligung.updateMany({
        where: { id: e.id, status: "OFFEN", tokenUsedAt: null },
        data: {
          status: neuerStatus,
          signedAt: now,
          signedIp: ip,
          signedName: name,
          tokenUsedAt: now,
          dokumentHash,
        },
      });
      if (upd.count === 0) {
        throw new Error("ALREADY_HANDLED");
      }

      // Fall-Status fortschreiben (nur aus EINLADUNG_VERSENDET).
      const zielFallStatus =
        neuerStatus === "ERTEILT" ? "EINWILLIGUNG_ERTEILT" : "EINWILLIGUNG_ABGELEHNT";
      await tx.bemFall.updateMany({
        where: { id: e.bemFall.id, status: "EINLADUNG_VERSENDET" },
        data: {
          status: zielFallStatus,
          ...(neuerStatus === "ERTEILT" ? { datenschutzAm: now } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          bemFallId: e.bemFall.id,
          userId: null, // oeffentlich (Beschaeftigte:r)
          processType: "BEM",
          action:
            neuerStatus === "ERTEILT"
              ? BEM_AUDIT_ACTIONS.EINWILLIGUNG_ERTEILT
              : BEM_AUDIT_ACTIONS.EINWILLIGUNG_ABGELEHNT,
          details: { einwilligungId: e.id, art: e.art, signedName: name, dokumentHash },
          ipAddress: ip,
        },
      });
    });

    return NextResponse.json({
      data: { status: neuerStatus },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_HANDLED") {
      return NextResponse.json(
        { error: "Diese Einwilligung wurde bereits beantwortet." },
        { status: 409 },
      );
    }
    console.error("[API] BEM Einwilligung POST fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
