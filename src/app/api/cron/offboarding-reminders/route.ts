/**
 * API: /api/cron/offboarding-reminders
 *
 * POST – Erinnerungen für offene Offboarding-Aufgaben senden
 *
 * Wird taeglich von n8n per Cron-Workflow aufgerufen.
 * Sicherheit: Authentifizierung über CRON_SECRET Bearer-Token.
 *
 * Die Regeln stehen nicht mehr hier:
 *   - 3-Stufen-Logik (INFO / WARNING / ESCALATION), Mindestabstand ab dem
 *     letzten Versand bzw. der letzten Erinnerung und das Ende 30 Tage nach
 *     der spaetesten offenen Faelligkeit: rein und getestet in
 *     src/lib/abteilungsaufgaben.ts (stufeBerechnen, erinnerungsStufe).
 *   - Versand, Merker (SENT/WEBHOOK/SKIPPED ja, FAILED nein), Verlaengerung
 *     des Links mit GLEICHEM Token und das Ueberspringen bei geaenderter oder
 *     fehlender Adresse: erinnerungenSenden in src/lib/abteilungsaufgaben-dienst.ts.
 * Erinnert werden nur Abteilungen, die die Erstmail wirklich bekommen haben
 * (sentAt gesetzt). Der Lauf erzeugt nie still einen neuen Link.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { erinnerungenSenden } from "@/lib/abteilungsaufgaben-dienst";

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET) */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: NextRequest) {
  // Auth-Check: CRON_SECRET (Timing-Safe)
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET nicht konfiguriert" },
      { status: 500 }
    );
  }

  const expected = `Bearer ${cronSecret}`;
  if (!timingSafeCompare(authHeader, expected)) {
    return NextResponse.json(
      { error: "Nicht autorisiert" },
      { status: 401 }
    );
  }

  const now = new Date();

  try {
    const ergebnis = await erinnerungenSenden(now);
    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      remindersProcessed: ergebnis.remindersProcessed,
      errors: ergebnis.errors,
      details: ergebnis.details,
      uebersprungen: ergebnis.uebersprungen,
    });
  } catch (error) {
    console.error("[Offboarding-Reminders] Schwerer Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
