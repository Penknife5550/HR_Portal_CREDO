/**
 * API: /api/settings/email-templates/[id]/zuruecksetzen
 *
 * POST – Text einer gespeicherten E-Mail-Vorlage auf den aktuellen
 *        Standardtext aus dem Code zuruecksetzen.
 *
 * Warum: Eine gespeicherte Vorlage (EmailTemplate) ueberschreibt den
 * Code-Default vollstaendig. Aendert ein Update danach den Standardtext, kommt
 * die Aenderung bei diesem Event nicht an — bisher half nur Abtippen oder ein
 * Eingriff in die Datenbank.
 *
 * Was zurueckgesetzt wird — und was bewusst NICHT:
 *   - ersetzt: subject, bodyHtml, bodyText (+ variables, die Liste im Editor)
 *   - bleibt:  recipientTo/Cc/Bcc/ReplyTo und isActive
 *   Die Zeile wird also NICHT geloescht. Ein Loeschen braechte den Text
 *   zurueck, naehme aber das eingetragene An-Feld mit — und HR-interne Events
 *   haben keinen Empfaenger-Default (events.ts, to: ""). Sie liefen danach
 *   still als SKIPPED ins Leere, ohne dass es beim Klicken jemand merkt.
 *
 * `id` ist die Datenbank-ID der gespeicherten Fassung. Fuer Vorlagen ohne
 * gespeicherte Fassung (Listen-ID "default-<event>") gibt es nichts
 * zurueckzusetzen — dort gilt der Standard ohnehin.
 *
 * Statuscodes: 401/403 wie die uebrigen Settings-Routen, 404 wenn es keine
 * gespeicherte Fassung oder fuer ihr Event keinen Standardtext gibt.
 *
 * Nachweis: AuditLog (processType SYSTEM, action EMAIL_TEMPLATE_RESET) in
 * DERSELBEN Transaktion wie die Aenderung — entweder beides oder nichts. Die
 * Details enthalten den ueberschriebenen Text der abweichenden Felder: Ein
 * Zuruecksetzen verwirft moeglicherweise bewusst formulierte Texte von HR,
 * und ohne Rueckweg gaebe es sie danach nirgends mehr.
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  STANDARD_TEXT_FELDER,
  abweichendeFelder,
  standardFassung,
} from "@/lib/email-vorlagen-standard";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

/** Felder, die das Zuruecksetzen schreibt — so auch im AuditLog vermerkt. */
const ZURUECKGESETZTE_FELDER = [...STANDARD_TEXT_FELDER, "variables"] as const;

const NICHT_GESPEICHERT =
  "Für diese Vorlage ist keine gespeicherte Fassung vorhanden – es gilt bereits der Standardtext.";

/**
 * Prisma meldet mit P2025, dass der zu aendernde Datensatz fehlt. Geprueft
 * wird nur der Code statt `instanceof Prisma.PrismaClientKnownRequestError`:
 * Das genuegt fuer die Unterscheidung und haengt nicht an der Klassenidentitaet
 * des generierten Clients.
 */
function istNichtGefunden(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025";
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const { id } = await params;

    const gespeichert = await prisma.emailTemplate.findUnique({
      where: { id },
      select: { id: true, event: true, subject: true, bodyHtml: true, bodyText: true },
    });
    if (!gespeichert) {
      return NextResponse.json({ error: NICHT_GESPEICHERT }, { status: 404 });
    }

    const standard = standardFassung(gespeichert.event);
    if (!standard) {
      return NextResponse.json(
        {
          error: `Für das Ereignis „${gespeichert.event}“ gibt es keinen Standardtext, auf den zurückgesetzt werden könnte.`,
        },
        { status: 404 }
      );
    }

    const abweichend = abweichendeFelder(gespeichert, standard);

    // Nur Textfelder — Empfaenger und isActive stehen absichtlich NICHT im
    // Update (siehe Kopfkommentar). Kein upsert: Gibt es die Zeile nicht
    // mehr, soll hier keine neue entstehen.
    const [vorlage] = await prisma.$transaction([
      prisma.emailTemplate.update({
        where: { id: gespeichert.id },
        data: {
          subject: standard.subject,
          bodyHtml: standard.bodyHtml,
          bodyText: standard.bodyText,
          variables: standard.variables,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.userId,
          processType: "SYSTEM",
          action: "EMAIL_TEMPLATE_RESET",
          details: {
            event: gespeichert.event,
            felder: [...ZURUECKGESETZTE_FELDER],
            // Welche Textfelder vorher tatsaechlich vom Standard abwichen —
            // leer heisst: Der Klick hat nur die Variablenliste erneuert.
            abweichend,
            // Der ueberschriebene Text, damit eine bewusst angepasste Fassung
            // nicht spurlos verschwindet. Nur die abweichenden Felder, der Rest
            // steht ohnehin im Code.
            vorher: Object.fromEntries(abweichend.map((feld) => [feld, gespeichert[feld]])),
            beibehalten: ["recipientTo", "recipientCc", "recipientBcc", "recipientReplyTo", "isActive"],
          },
        },
      }),
    ]);

    return NextResponse.json({ data: vorlage });
  } catch (error) {
    // Zwischen Lesen und Schreiben geloescht (z.B. parallel in einem zweiten
    // Tab): gleiche Antwort wie „nicht vorhanden“ statt eines 500.
    if (istNichtGefunden(error)) {
      return NextResponse.json({ error: NICHT_GESPEICHERT }, { status: 404 });
    }
    console.error("[API] E-Mail-Vorlage zuruecksetzen fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
