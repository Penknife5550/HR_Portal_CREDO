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
import { BEM_AUDIT_ACTIONS, logBemAudit, logBemKommunikation } from "@/lib/bem-audit";
import { syncBemFristen } from "@/lib/bem-fristen";
import { sendEmailDetailed } from "@/lib/mailer";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";
import { einwilligungPublicSchema } from "@/lib/validations/bem";
import { getBemKeyHex } from "@/lib/encryption";

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
      bemFall: {
        select: {
          id: true,
          status: true,
          displayId: true,
          organizationId: true,
          employeeFirstName: true,
          employeeLastName: true,
          employeeEmail: true,
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

    // Auswaehlbare Ansprechpartner:innen des Mandanten (nur Name/Funktion — keine
    // E-Mail nach aussen geben).
    const ansprechpartner = await prisma.bemAnsprechpartner.findMany({
      where: { organizationId: e.bemFall.organizationId, isActive: true },
      select: { id: true, name: true, funktion: true },
      orderBy: [{ orderIndex: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      data: {
        employeeName: `${e.bemFall.employeeFirstName} ${e.bemFall.employeeLastName}`.trim(),
        organizationName: e.bemFall.organization?.name ?? null,
        art: e.art,
        artLabel: ART_LABELS[e.art] || e.art,
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

    const now = new Date();
    const neuerStatus = entscheidung === "ERTEILT" ? "ERTEILT" : "ABGELEHNT";

    // Optional gewaehlte:r Ansprechpartner:in — nur uebernehmen, wenn er/sie zum
    // Mandanten des Falls gehoert und aktiv ist (sonst ignorieren statt Fehler).
    const gewaehlt =
      ansprechpartnerId && neuerStatus === "ERTEILT"
        ? await prisma.bemAnsprechpartner.findFirst({
            where: {
              id: ansprechpartnerId,
              organizationId: e.bemFall.organizationId,
              isActive: true,
            },
            select: { id: true, name: true, email: true, funktion: true },
          })
        : null;
    // Faelschungssicherer Integritaets-Nachweis: HMAC mit serverseitigem
    // Schluessel (BEM_ENCRYPTION_KEY). Nur der Server kann einen passenden Hash
    // erzeugen — die Werte selbst (signedName/Ip/At) liegen zusaetzlich als
    // Spalten in der DB.
    // Pflicht-Key (getBemKeyHex wirft bei fehlendem/zu kurzem Schluessel) —
    // kein stiller Fallback auf einen leeren Schluessel, der den Nachweis
    // faelschungssicherheits-wertlos machen wuerde.
    const dokumentHash = createHmac("sha256", getBemKeyHex())
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
      const fallUpd = await tx.bemFall.updateMany({
        where: { id: e.bemFall.id, status: "EINLADUNG_VERSENDET" },
        data: {
          status: zielFallStatus,
          ...(neuerStatus === "ERTEILT" ? { datenschutzAm: now } : {}),
          ...(gewaehlt ? { ansprechpartnerId: gewaehlt.id } : {}),
          ...(neuerStatus === "ERTEILT"
            ? {
                vertrauenspersonWunsch: !!vertrauenspersonWunsch,
                vertrauenspersonText: vertrauenspersonText?.trim() || null,
              }
            : {}),
        },
      });
      // Der Fall ist nicht mehr in EINLADUNG_VERSENDET (z.B. die Antwort kam
      // bereits per Papier oder wurde manuell erfasst). Der digitale Link ist
      // damit veraltet — Transaktion zuruckrollen, statt einen widerspruechlichen
      // Aktenstand + irrefuehrende Benachrichtigungs-Mails zu erzeugen.
      if (fallUpd.count === 0) {
        throw new Error("ALREADY_HANDLED");
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

    // Fristen anpassen (Erstgespraech-Frist nach erteilter Einwilligung).
    await syncBemFristen(e.bemFall.id);

    // Gewaehlte:n Ansprechpartner:in informieren (SMTP-direkt, CREDO-CI).
    if (gewaehlt) {
      const maName =
        `${e.bemFall.employeeFirstName} ${e.bemFall.employeeLastName}`.trim();
      const subject = `BEM ${e.bemFall.displayId}: Sie wurden als Ansprechpartner:in gewählt`;
      const text =
        `Guten Tag ${gewaehlt.name},\n\n` +
        `${maName} hat im Rahmen des Betrieblichen Eingliederungsmanagements (BEM) ` +
        `Sie als Ansprechpartner:in ausgewählt und der Durchführung des BEM zugestimmt.\n\n` +
        `Bitte stimmen Sie sich mit der BEM-Beauftragten/dem BEM-Beauftragten über die ` +
        `nächsten Schritte ab.`;
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

    const maName = `${e.bemFall.employeeFirstName} ${e.bemFall.employeeLastName}`.trim();
    const entscheidungText = neuerStatus === "ERTEILT" ? "zugestimmt" : "abgelehnt";

    // 1) Regelkreis schliessen: freigegebene Beauftragte ueber die Antwort
    //    informieren (SMTP-direkt, je Empfaenger einzeln, ohne Gesundheitsdaten).
    const zugriffe = await prisma.bemZugriff.findMany({
      where: { bemFallId: e.bemFall.id, revokedAt: null },
      include: { user: { select: { email: true, isActive: true } } },
    });
    const beauftragte = zugriffe
      .map((z) => z.user)
      .filter((u) => u.isActive && u.email)
      .map((u) => u.email);
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

    // 2) Bestaetigung an die/den Beschaeftigte:n (Eingangsbestaetigung).
    if (e.bemFall.employeeEmail) {
      const subject = "Ihre Rückmeldung zum BEM ist eingegangen";
      const text =
        neuerStatus === "ERTEILT"
          ? `Guten Tag ${maName},\n\nvielen Dank — Ihre Zustimmung zum Betrieblichen ` +
            `Eingliederungsmanagement wurde gespeichert. Die zuständige Stelle wird sich ` +
            `mit Ihnen in Verbindung setzen.`
          : `Guten Tag ${maName},\n\nIhre Rückmeldung wurde gespeichert: Sie haben das ` +
            `Betriebliche Eingliederungsmanagement abgelehnt. Ihnen entstehen dadurch keine ` +
            `Nachteile. Sie können sich jederzeit an Ihre Personalabteilung wenden.`;
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
      data: { status: neuerStatus, ansprechpartnerGewaehlt: !!gewaehlt },
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
