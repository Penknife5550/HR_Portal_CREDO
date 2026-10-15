/**
 * CREDO HR-Portal – Arbeitsort am Onboarding-Vorgang aendern (E-A10, nur Server)
 *
 *   arbeitsortAendern   PATCH /api/onboarding/[id]/arbeitsort
 *
 * Der Arbeitsort ist die Einrichtung, an der die Person arbeitet, wenn das
 * nicht der Arbeitgeber ist (OGS-Kraft des Foerdervereins an einer
 * Grundschule, Hausmeister der Objekt Service GmbH). Er bestimmt die
 * Empfaenger ALLER Abteilungsaufgaben des Vorgangs
 * (`onboardingEmpfaengerEinrichtung` in abteilungsaufgaben.ts) und den
 * Katalog, den die Fuehrungskraft im Modalitaeten-Formular sieht. Gesetzt wird
 * er beim Anlegen (POST /api/onboarding) oder hier.
 *
 * Regeln, die beim Aendern gelten muessen:
 *   1. Der Mandant bleibt `organizationId`. Zugriff auf den VORGANG prueft
 *      `canAccessProcess` gegen den Arbeitgeber, nie gegen den Arbeitsort; den
 *      neuen Arbeitsort muss die Sitzung zusaetzlich sehen duerfen. Unbekannt
 *      und fremd ergeben dieselbe 404 mit demselben Text — beim Vorgang
 *      „Vorgang nicht gefunden“, beim Arbeitsort „Organisation nicht gefunden“
 *      (wie beim Anlegen).
 *   2. Aendern nur, solange der Modalitaeten-Link nicht erzeugt ist und kein
 *      HR-Status vorliegt (`arbeitsortSperrGrund`). Ab dem Link sieht die
 *      Fuehrungskraft den Katalog des Arbeitsorts. Weil der Versand an die
 *      Stellen eingereichte Modalitaeten voraussetzt, gibt es bei einer
 *      erlaubten Aenderung noch keine informierte Stelle — nichts muss
 *      nachgezogen werden.
 *   3. Geschrieben wird BEDINGT (`updateMany` mit `supervisorToken: null` und
 *      `status notIn HR_STATUS`); count 0 → 409 `LINK_ERZEUGT`. Das
 *      Vorab-Lesen allein schuetzte nicht vor einem gleichzeitig erzeugten
 *      Link.
 *   4. Gespeichert wird `null`, wenn der Arbeitsort die Einrichtung ist
 *      (`arbeitsortSpeicherwert`). Ohne echte Aenderung: 200, kein Schreiben,
 *      kein Protokoll.
 *   5. Protokoll `ONBOARDING_ARBEITSORT_GEAENDERT` mit `{ von, nach }` (IDs,
 *      `null` = wie Einrichtung) im selben Commit.
 */

import { prisma } from "@/lib/db";
import { canAccessProcess, HR_EDIT_ROLES, type SessionPayload } from "@/lib/permissions";
import { HR_STATUS, istHrStatus } from "@/lib/onboarding-spuren";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN, type DienstAntwort } from "@/lib/abteilungsaufgaben";
import {
  AUSSTATTUNG_AUDIT,
  MELDUNGEN,
  arbeitsortSpeicherwert,
  arbeitsortSperrGrund,
} from "@/lib/ausstattung";
import { arbeitsortSchema } from "@/lib/validations/ausstattung";

/** Was die Antwort ueber den Arbeitsort sagt (Detailseite und Dialog). */
export interface ArbeitsortStand {
  /** Gespeicherter Wert; `null` = wie Einrichtung. */
  arbeitsortId: string | null;
  arbeitsort: { id: string; name: string; type: string } | null;
  /** Wurde etwas geschrieben? Ohne echte Aenderung `false`. */
  geaendert: boolean;
}

/**
 * PATCH /api/onboarding/[id]/arbeitsort — Body `{ arbeitsortId: string | null }`.
 *
 * Antworten (in dieser Reihenfolge):
 *   403 { error: "Keine Berechtigung" }                       Rolle nicht HR_EDIT_ROLES
 *   400 { error }                                             Body ungueltig
 *   404 { error: "Vorgang nicht gefunden" }                   Vorgang unbekannt ODER fremder Mandant
 *   409 { error, grund: "LINK_ERZEUGT" }                      Link erzeugt oder HR-Status
 *   404 { error: "Organisation nicht gefunden" }              Arbeitsort unbekannt ODER fremd
 *   200 { data: ArbeitsortStand }
 */
export async function arbeitsortAendern(opts: {
  onboardingId: string;
  rohBody: unknown;
  session: SessionPayload;
}): Promise<DienstAntwort> {
  if (!HR_EDIT_ROLES.includes(opts.session.role)) {
    return { status: 403, body: { error: "Keine Berechtigung" } };
  }
  const parsed = arbeitsortSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? MELDUNGEN.ARBEITSORT_UNGUELTIG } };
  }

  const vorgang = await prisma.onboardingProcess.findUnique({
    where: { id: opts.onboardingId },
    select: { id: true, organizationId: true, arbeitsortId: true, status: true, supervisorToken: true },
  });
  // Regel 1: Der Mandant ist der Arbeitgeber — nie der Arbeitsort.
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return { status: 404, body: { error: ABTEILUNGS_MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } };
  }

  const gesperrt = arbeitsortSperrGrund({
    linkErzeugt: !!vorgang.supervisorToken,
    hrStatus: istHrStatus(vorgang.status),
  });
  if (gesperrt) return { status: 409, body: { error: gesperrt, grund: "LINK_ERZEUGT" } };

  const nach = arbeitsortSpeicherwert(vorgang.organizationId, parsed.data.arbeitsortId);
  let ort: ArbeitsortStand["arbeitsort"] = null;
  if (nach) {
    ort = await prisma.organization.findUnique({
      where: { id: nach },
      select: { id: true, name: true, type: true },
    });
    if (!ort || !(await canAccessProcess(opts.session, ort.id))) {
      return { status: 404, body: { error: MELDUNGEN.ORGANISATION_NICHT_GEFUNDEN } };
    }
  }

  const von = vorgang.arbeitsortId ?? null;
  if (von === nach) {
    const stand: ArbeitsortStand = { arbeitsortId: nach, arbeitsort: ort, geaendert: false };
    return { status: 200, body: { data: stand } };
  }

  const geschrieben = await prisma.$transaction(async (tx) => {
    const r = await tx.onboardingProcess.updateMany({
      where: { id: vorgang.id, supervisorToken: null, status: { notIn: [...HR_STATUS] } },
      data: { arbeitsortId: nach },
    });
    if (r.count === 0) return false;
    await tx.auditLog.create({
      data: {
        userId: opts.session.userId,
        onboardingId: vorgang.id,
        processType: "ONBOARDING",
        action: AUSSTATTUNG_AUDIT.ARBEITSORT_GEAENDERT,
        details: { von, nach },
      },
    });
    return true;
  });
  if (!geschrieben) {
    // Zwischen Lesen und Schreiben wurde der Link erzeugt oder der Vorgang
    // geprueft/abgeschlossen/abgelaufen gesetzt (Regel 3).
    return { status: 409, body: { error: MELDUNGEN.ARBEITSORT_LINK_ERZEUGT, grund: "LINK_ERZEUGT" } };
  }

  const stand: ArbeitsortStand = { arbeitsortId: nach, arbeitsort: ort, geaendert: true };
  return { status: 200, body: { data: stand } };
}
