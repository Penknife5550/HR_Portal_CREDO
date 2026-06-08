/**
 * API: POST /api/cron/bem-fristen
 *
 * Taegliche BEM-Fristenpruefung. Wird (wie die uebrigen Crons) extern von n8n
 * per Bearer-CRON_SECRET aufgerufen.
 *
 * Ablauf:
 * 1. Fristen aller nicht-geloeschten Faelle via syncBemFristen() aktualisieren.
 * 2. Offene Fristen bewerten (Severity). Bei Eskalation (Stufe gestiegen) eine
 *    interne Erinnerungs-Mail an die freigegebenen BEM-Beauftragten senden
 *    (SMTP-direkt, KEIN n8n) — gebuendelt pro Fall. letzteSeverity verhindert
 *    Mehrfach-Mails pro Stufe.
 *
 * Datenschutz: Die Mail enthaelt nur Fall-Nummer + generische Frist-Bezeichnung
 * + Stichtag — KEINE Gesundheitsdaten. Empfaenger sind ausschliesslich die
 * freigegebenen internen Beauftragten.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { syncBemFristen, berechneSeverity } from "@/lib/bem-fristen";
import { sendEmailDetailed } from "@/lib/mailer";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";
import { logBemAudit, logBemKommunikation, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";
import type { BemFristSeverity } from "@prisma/client";

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const SEVERITY_RANK: Record<BemFristSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  URGENT: 2,
  OVERDUE: 3,
};

const SEVERITY_LABEL: Record<BemFristSeverity, string> = {
  INFO: "Hinweis",
  WARNING: "Warnung",
  URGENT: "Dringend",
  OVERDUE: "Ueberfaellig",
};

interface EskItem {
  bezeichnung: string;
  faelligAm: Date;
  severity: BemFristSeverity;
}

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || cronSecret.length < 24) {
      console.error("[cron/bem-fristen] CRON_SECRET fehlt oder zu kurz (min 24 Zeichen)");
      return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
    }
    const authHeader = request.headers.get("authorization") || "";
    if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    // 1. Fristen synchronisieren
    const faelle = await prisma.bemFall.findMany({
      where: { status: { not: "GELOESCHT" } },
      select: { id: true },
    });
    for (const f of faelle) {
      await syncBemFristen(f.id); // wirft nicht
    }

    // 2. Offene Fristen bewerten + Eskalationen sammeln (pro Fall gebuendelt)
    const offene = await prisma.bemFrist.findMany({
      where: { erledigtAm: null },
      include: { bemFall: { select: { id: true, displayId: true } } },
    });

    const eskByFall = new Map<
      string,
      { displayId: string; items: EskItem[] }
    >();

    for (const frist of offene) {
      const severity = berechneSeverity(frist.faelligAm);
      const prevRank = frist.letzteSeverity ? SEVERITY_RANK[frist.letzteSeverity] : -1;
      if (SEVERITY_RANK[severity] <= prevRank) continue; // keine Eskalation

      await prisma.bemFrist.update({
        where: { id: frist.id },
        data: { letzteSeverity: severity, letzteWarnungAm: new Date() },
      });

      const entry = eskByFall.get(frist.bemFall.id) ?? {
        displayId: frist.bemFall.displayId,
        items: [],
      };
      entry.items.push({
        bezeichnung: frist.bezeichnung,
        faelligAm: frist.faelligAm,
        severity,
      });
      eskByFall.set(frist.bemFall.id, entry);
    }

    // 3. Eine Erinnerungs-Mail pro Fall an die freigegebenen Beauftragten
    const baseUrl =
      process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    let mailsGesendet = 0;
    let mailsFehler = 0;
    let ohneEmpfaenger = 0;

    for (const [fallId, info] of eskByFall) {
      const zugriffe = await prisma.bemZugriff.findMany({
        where: { bemFallId: fallId, revokedAt: null },
        include: { user: { select: { email: true, isActive: true } } },
      });
      const empfaenger = zugriffe
        .map((z) => z.user)
        .filter((u) => u.isActive && u.email)
        .map((u) => u.email);
      if (empfaenger.length === 0) {
        ohneEmpfaenger++;
        continue;
      }

      const zeilen = info.items
        .map(
          (i) =>
            `- ${i.bezeichnung}: faellig am ${i.faelligAm.toLocaleDateString("de-DE")} (${SEVERITY_LABEL[i.severity]})`,
        )
        .join("\n");
      const subject = `BEM ${info.displayId}: Frist(en) faellig`;
      const text =
        `Im BEM-Fall ${info.displayId} sind folgende Fristen faellig oder ruecken naeher:\n\n${zeilen}\n\n` +
        `Bitte oeffnen Sie den Fall im HR-Portal, um die naechsten Schritte zu veranlassen.`;
      const html = renderCredoEmail({
        titel: `BEM-Fristen: ${info.displayId}`,
        bodyHtml: paragraphsToHtml(text),
        button: { label: "Fall oeffnen", url: `${baseUrl}/dashboard/bem/${fallId}` },
        fussnote:
          "Automatische Erinnerung des CREDO HR-Portals (BEM). Diese Nachricht enthaelt keine Gesundheitsdaten.",
        appUrl: baseUrl,
      });

      // Eine eigene Mail PRO Empfaenger — so sieht niemand die Adressen der
      // anderen Beauftragten (kein To:-Verteiler) und der Versandnachweis ist
      // pro Person granular.
      let fallErfolg = false;
      for (const adr of empfaenger) {
        const sent = await sendEmailDetailed({ to: adr, subject, html, text });
        await logBemKommunikation({
          bemFallId: fallId,
          kanal: "EMAIL",
          status: sent.ok ? "GESENDET" : "FEHLGESCHLAGEN",
          empfaenger: adr,
          betreff: subject,
          messageId: sent.ok ? (sent.messageId ?? null) : null,
          fehlertext: sent.ok ? null : sent.error.slice(0, 500),
          gesendetById: null,
        });
        if (sent.ok) {
          mailsGesendet++;
          fallErfolg = true;
        } else {
          mailsFehler++;
        }
      }
      await logBemAudit({
        bemFallId: fallId,
        userId: null,
        action: BEM_AUDIT_ACTIONS.FRIST_ERINNERUNG,
        details: {
          fristen: info.items.map((i) => i.bezeichnung),
          empfaengerAnzahl: empfaenger.length,
          erfolg: fallErfolg,
        },
      });
    }

    return NextResponse.json({
      data: {
        faelleGeprueft: faelle.length,
        offeneFristen: offene.length,
        eskalierteFaelle: eskByFall.size,
        mailsGesendet,
        mailsFehler,
        ohneEmpfaenger,
      },
    });
  } catch (error) {
    console.error(
      "[cron/bem-fristen] POST fehlgeschlagen:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
