/**
 * Mandantenpruefung fuer die Unterrouten von /api/offboarding/:id
 * (Notizen, Dokumente, Exit-Interview, Zeugnis-Bewertung).
 *
 * Jede dieser Routen beginnt gleich: Gibt es den Vorgang, und darf die
 * Sitzung seinen Mandanten sehen? Beides ergibt dieselbe 404 mit demselben
 * Text — eine eigene Antwort fuer „fremder Mandant" verriete, dass es den
 * Vorgang gibt. Die Rolle prueft vorher `apiHandler` (`roles`); der
 * n8n-Schluessel meldet sich als SERVICE an und steht in keiner der dort
 * verwendeten Rollengruppen.
 *
 * Kind-Objekte (Notiz, Dokument) laedt die Route danach gebunden an den
 * Vorgang (`findFirst({ where: { id, offboardingId } })`): Ein Objekt aus
 * einem anderen Vorgang bekommt dieselbe 404 wie ein unbekanntes, nie 403.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";

/** Gleicher Text fuer „gibt es nicht" und „fremder Mandant". */
export const VORGANG_NICHT_GEFUNDEN = "Vorgang nicht gefunden";

/** Gibt es den Offboarding-Vorgang, und darf die Sitzung ihn sehen? */
export async function offboardingZugaenglich(
  session: SessionPayload,
  id: string
): Promise<boolean> {
  const vorgang = await prisma.offboardingProcess.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  return !!vorgang && (await canAccessProcess(session, vorgang.organizationId));
}

/** 404 mit festem Text — fuer den Vorgang oder, mit eigenem Text, ein Kind-Objekt. */
export function nichtGefunden(text = VORGANG_NICHT_GEFUNDEN): NextResponse {
  return NextResponse.json({ error: text }, { status: 404 });
}
