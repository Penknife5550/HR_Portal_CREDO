/**
 * API: /api/bem/einwilligung/[token]  (OEFFENTLICH, Magic-Link, E10)
 *
 * GET  – Minimalinfo + art-spezifischer Einwilligungstext (editierbare Vorlage).
 * POST – Einwilligung der jeweiligen Art erteilen/ablehnen. Single-Use.
 *        Wird die DURCHFUEHRUNG angenommen, werden die weiteren erforderlichen
 *        Einwilligungs-Links (Datenschutz, BR/SBV je nach Betrieb) automatisch
 *        versendet. Der Fall-Status wird zentral aus den tragenden Einwilligungen
 *        fortgeschrieben (recomputeFallEinwilligungsStatus).
 *
 * Token liegt in der DB nur als SHA-256-Hash (token-hash.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token-hash";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import { BEM_AUDIT_ACTIONS, logBemAudit, logBemKommunikation } from "@/lib/bem-audit";
import { syncBemFristen } from "@/lib/bem-fristen";
import { sendEmailDetailed } from "@/lib/mailer";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";
import { einwilligungPublicSchema } from "@/lib/validations/bem";
import { getBemKeyHex } from "@/lib/encryption";
import { getBemEinwilligungstext } from "@/lib/bem-vorlagen";
import {
  sendBemEinwilligungLink,
  erforderlicheFolgeArten,
} from "@/lib/bem-einladung";
import { recomputeFallEinwilligungsStatus } from "@/lib/bem-einwilligung";

const ART_LABELS: Record<string, string> = {
  DATENSCHUTZ: "Datenschutz-Einwilligung",
  DURCHFUEHRUNG: "Durchführung des BEM",
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
      vorlageVersion: true,
      textSnapshot: true,
      bemFall: {
        select: {
          id: true,
          status: true,
          displayId: true,
          organizationId: true,
          schwerbehindert: true,
          employeeFirstName: true,
          employeeLastName: true,
          employeeEmail: true,
          organization: {
            select: {
              name: true,
              ezTokenValidityDays: true,
              hatBetriebsrat: true,
              hatSchwerbehindertenvertretung: true,
            },
          },
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
        { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
        { status: 429 },
      );
    }
    const { token } = await context.params;
    const e = await loadByToken(token);
    if (!e) {
      return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
    }
    const expired = !!e.tokenExpiry && e.tokenExpiry.getTime() < Date.now();
    const erledigt = e.status !== "OFFEN" || !!e.tokenUsedAt;

    // Ansprechpartner:innen nur fuer den Durchfuehrungs-Schritt anbieten.
    const ansprechpartner =
      e.art === "DURCHFUEHRUNG"
        ? await prisma.bemAnsprechpartner.findMany({
            where: { organizationId: e.bemFall.organizationId, isActive: true },
            select: { id: true, name: true, funktion: true },
            orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
          })
        : [];

    // Den zum VERSAND gespeicherten Wortlaut anzeigen (Snapshot) — so stimmt der
    // angezeigte/zugestimmte Text mit dem Nachweis ueberein, auch wenn die Vorlage
    // zwischenzeitlich geaendert wurde. Fallback: live aufloesen (Altbestand).
    const snap = e.textSnapshot as { titel?: string; koerper?: string } | null;
    const text =
      snap && typeof snap.koerper === "string" && snap.koerper
        ? { titel: snap.titel || ART_LABELS[e.art] || e.art, koerper: snap.koerper }
        : await getBemEinwilligungstext(e.art, e.bemFall.organizationId);

    return NextResponse.json({
      data: {
        employeeName: `${e.bemFall.employeeFirstName} ${e.bemFall.employeeLastName}`.trim(),
        organizationName: e.bemFall.organization?.name ?? null,
        art: e.art,
        artLabel: ART_LABELS[e.art] || e.art,
        text: { titel: text.titel, koerper: text.koerper },
        status: e.status,
        expired,
        erledigt,
        ansprechpartner,
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
        { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
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
    const { entscheidung, name, ansprechpartnerId, vertrauenspersonWunsch, vertrauenspersonText } =
      parsed.data;

    const e = await loadByToken(token);
    if (!e) {
      return NextResponse.json({ error: "Ungültiger Link" }, { status: 404 });
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
    // Fall muss noch im einwilligungs-aktiven Zustand sein (EINLADUNG_VERSENDET
    // waehrend der Sammlung; EINWILLIGUNG_ERTEILT erlaubt spaete BR/SBV-Antworten).
    // Sonst ist der Link veraltet (Fall abgelehnt/abgebrochen/in Aufbewahrung).
    if (
      e.bemFall.status !== "EINLADUNG_VERSENDET" &&
      e.bemFall.status !== "EINWILLIGUNG_ERTEILT"
    ) {
      return NextResponse.json(
        { error: "Dieser Link ist nicht mehr gültig (Verfahren bereits abgeschlossen oder beendet)." },
        { status: 409 },
      );
    }

    const now = new Date();
    const neuerStatus = entscheidung === "ERTEILT" ? "ERTEILT" : "ABGELEHNT";
    const istDurchfuehrung = e.art === "DURCHFUEHRUNG";

    // Ansprechpartner-Wahl nur beim Durchfuehrungs-Schritt (Annahme) relevant.
    const gewaehlt =
      istDurchfuehrung && ansprechpartnerId && neuerStatus === "ERTEILT"
        ? await prisma.bemAnsprechpartner.findFirst({
            where: {
              id: ansprechpartnerId,
              organizationId: e.bemFall.organizationId,
              isActive: true,
            },
            select: { id: true, name: true, email: true, funktion: true },
          })
        : null;

    // Faelschungssicherer Integritaets-Nachweis (HMAC, inkl. Textstand-Version).
    const dokumentHash = createHmac("sha256", getBemKeyHex())
      .update(
        `${e.id}|${e.bemFall.id}|${e.art}|${neuerStatus}|${name}|${now.getTime()}|${ip}|v${e.vorlageVersion ?? 0}`,
      )
      .digest("hex");

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
      if (upd.count === 0) throw new Error("ALREADY_HANDLED");

      // Ansprechpartner/Vertrauensperson nur beim Durchfuehrungs-Schritt setzen
      // und nur solange der Fall noch in der Einladungs-Phase ist.
      if (
        istDurchfuehrung &&
        neuerStatus === "ERTEILT" &&
        e.bemFall.status === "EINLADUNG_VERSENDET"
      ) {
        await tx.bemFall.update({
          where: { id: e.bemFall.id },
          data: {
            ...(gewaehlt ? { ansprechpartnerId: gewaehlt.id } : {}),
            vertrauenspersonWunsch: !!vertrauenspersonWunsch,
            vertrauenspersonText: vertrauenspersonText?.trim() || null,
          },
        });
      }

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

    await syncBemFristen(e.bemFall.id);

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin;
    const validityDays = e.bemFall.organization?.ezTokenValidityDays || 30;
    const maName = `${e.bemFall.employeeFirstName} ${e.bemFall.employeeLastName}`.trim();

    // --- Auto-Versand der Folge-Einwilligungen nach Annahme der Durchfuehrung ---
    const autoVersandt: string[] = [];
    if (istDurchfuehrung && neuerStatus === "ERTEILT" && e.bemFall.employeeEmail) {
      const arten = erforderlicheFolgeArten({
        hatBetriebsrat: !!e.bemFall.organization?.hatBetriebsrat,
        hatSchwerbehindertenvertretung:
          !!e.bemFall.organization?.hatSchwerbehindertenvertretung,
        schwerbehindert: !!e.bemFall.schwerbehindert,
      });
      for (const art of arten) {
        const r = await sendBemEinwilligungLink({
          fall: {
            id: e.bemFall.id,
            displayId: e.bemFall.displayId,
            organizationId: e.bemFall.organizationId,
            employeeFirstName: e.bemFall.employeeFirstName,
            employeeLastName: e.bemFall.employeeLastName,
          },
          art,
          recipient: e.bemFall.employeeEmail,
          baseUrl,
          gueltigkeitstage: validityDays,
          gesendetById: null,
          ipAddress: ip,
        });
        if (r.ok) autoVersandt.push(art);
      }
    }

    // --- Fall-Status zentral fortschreiben (Datenschutz + Durchfuehrung) ---
    const transition = await recomputeFallEinwilligungsStatus(e.bemFall.id);

    // Bei Ablehnung der Durchfuehrung: offene (auto-angelegte) Einwilligungen
    // SYSTEMBEDINGT schliessen — ohne persoenliche signed*-Daten (die Person hat
    // diese Arten nicht selbst beantwortet), nur Status + Zeitstempel.
    if (transition === "EINWILLIGUNG_ABGELEHNT") {
      await prisma.bemEinwilligung.updateMany({
        where: { bemFallId: e.bemFall.id, status: "OFFEN" },
        data: { status: "ABGELEHNT", signedAt: now },
      });
    }

    // --- Gewaehlte:n Ansprechpartner:in informieren ---
    if (gewaehlt) {
      const subject = `BEM ${e.bemFall.displayId}: Sie wurden als Ansprechpartner:in gewählt`;
      const text =
        `${maName} hat im Rahmen des Betrieblichen Eingliederungsmanagements (BEM) ` +
        `Sie als Ansprechpartner:in ausgewählt und der Durchführung des BEM zugestimmt.\n\n` +
        `Bitte stimmen Sie sich mit der/dem BEM-Beauftragten über die nächsten Schritte ab.`;
      const html = renderCredoEmail({
        titel: "Sie wurden als BEM-Ansprechpartner:in gewählt",
        intro: `Guten Tag ${gewaehlt.name},`,
        bodyHtml: paragraphsToHtml(text),
        fussnote:
          "Automatische Nachricht des CREDO HR-Portals (BEM). Bitte behandeln Sie diese Information vertraulich.",
      });
      const sent = await sendEmailDetailed({ to: gewaehlt.email, subject, html, text });
      await logBemKommunikation({
        bemFallId: e.bemFall.id,
        kanal: "EMAIL",
        status: sent.ok ? "GESENDET" : "FEHLGESCHLAGEN",
        empfaenger: gewaehlt.email,
        betreff: subject,
        messageId: sent.ok ? (sent.messageId ?? null) : null,
        fehlertext: sent.ok ? null : sent.error.slice(0, 500),
        gesendetById: null,
      });
      await logBemAudit({
        bemFallId: e.bemFall.id,
        userId: null,
        action: BEM_AUDIT_ACTIONS.ANSPRECHPARTNER_GEWAEHLT,
        details: { ansprechpartnerId: gewaehlt.id, name: gewaehlt.name, benachrichtigt: sent.ok },
        ipAddress: ip,
      });
    }

    // --- Beauftragte informieren, wenn der Fall-Status gewechselt hat ---
    if (transition) {
      const entscheidungText =
        transition === "EINWILLIGUNG_ERTEILT" ? "zugestimmt" : "abgelehnt";
      const zugriffe = await prisma.bemZugriff.findMany({
        where: { bemFallId: e.bemFall.id, revokedAt: null },
        include: { user: { select: { email: true, isActive: true } } },
      });
      const beauftragte = zugriffe
        .map((z) => z.user)
        .filter((u) => u.isActive && u.email)
        .map((u) => u.email as string);
      if (beauftragte.length > 0) {
        const subject = `BEM ${e.bemFall.displayId}: Beschäftigte:r hat ${entscheidungText}`;
        const text =
          `Im BEM-Fall ${e.bemFall.displayId} (${maName}) wurde die Einwilligung ` +
          `${entscheidungText}.\n\nBitte öffnen Sie den Fall im HR-Portal für die nächsten Schritte.`;
        const html = renderCredoEmail({
          titel: `BEM-Antwort: ${e.bemFall.displayId}`,
          bodyHtml: paragraphsToHtml(text),
          fussnote:
            "Automatische Benachrichtigung des CREDO HR-Portals (BEM). Keine Gesundheitsdaten.",
        });
        for (const adr of beauftragte) {
          const r = await sendEmailDetailed({ to: adr, subject, html, text });
          await logBemKommunikation({
            bemFallId: e.bemFall.id,
            kanal: "EMAIL",
            status: r.ok ? "GESENDET" : "FEHLGESCHLAGEN",
            empfaenger: adr,
            betreff: subject,
            messageId: r.ok ? (r.messageId ?? null) : null,
            fehlertext: r.ok ? null : r.error.slice(0, 500),
            gesendetById: null,
          });
        }
      }
    }

    // --- Eingangsbestaetigung an die/den Beschaeftigte:n (nur Durchfuehrungs-Schritt) ---
    if (istDurchfuehrung && e.bemFall.employeeEmail) {
      const subject = "Ihre Rückmeldung zum BEM ist eingegangen";
      const text =
        neuerStatus === "ERTEILT"
          ? `Vielen Dank — Ihre Zustimmung zur Durchführung des BEM wurde gespeichert. ` +
            `Wir haben Ihnen die weiteren erforderlichen Einwilligungen (u. a. Datenschutz) ` +
            `per E-Mail zugesandt. Bitte bestätigen Sie auch diese, damit das BEM starten kann.`
          : `Ihre Rückmeldung wurde gespeichert: Sie haben das Betriebliche ` +
            `Eingliederungsmanagement abgelehnt. Ihnen entstehen dadurch keine Nachteile. ` +
            `Sie können sich jederzeit an Ihre Personalabteilung wenden.`;
      const html = renderCredoEmail({
        titel: "Eingangsbestätigung BEM",
        intro: `Guten Tag ${maName},`,
        bodyHtml: paragraphsToHtml(text),
        fussnote:
          "Automatische Eingangsbestätigung des CREDO HR-Portals. Bitte antworten Sie nicht auf diese E-Mail.",
      });
      const r = await sendEmailDetailed({ to: e.bemFall.employeeEmail, subject, html, text });
      await logBemKommunikation({
        bemFallId: e.bemFall.id,
        kanal: "EMAIL",
        status: r.ok ? "GESENDET" : "FEHLGESCHLAGEN",
        empfaenger: e.bemFall.employeeEmail,
        betreff: subject,
        messageId: r.ok ? (r.messageId ?? null) : null,
        fehlertext: r.ok ? null : r.error.slice(0, 500),
        gesendetById: null,
      });
    }

    return NextResponse.json({
      data: {
        status: neuerStatus,
        art: e.art,
        ansprechpartnerGewaehlt: !!gewaehlt,
        folgeLinksVersendet: autoVersandt,
      },
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
