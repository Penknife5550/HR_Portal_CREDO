/**
 * CREDO HR-Portal – Gemeinsame Felder der Onboarding-Abteilungsmails (Paket 5)
 *
 * Gegenstueck zu src/lib/offboarding-mail.ts fuer die vier Ereignisse
 * onboarding-department-assigned, -department-reminder, onboarding-task-
 * completed und onboarding-department-completed. Jede Aufrufstelle
 * (src/lib/abteilungsaufgaben-dienst.ts, -uebergaenge.ts) baut den
 * gemeinsamen Teil hier und nur das Ereignisspezifische selbst.
 *
 * DATENSPARSAMKEIT. Diese Felder gehen an Abteilungen, an die Fuehrungskraft
 * und an jeden Webhook auf diese Ereignisse. Deshalb stehen hier NUR Name,
 * Einrichtung, Vorgangsnummer und Vertragsbeginn — nie die private Adresse der
 * Person (`OnboardingProcess.email`), nie etwas aus dem Personalfragebogen
 * ausser dem Namen. `email` im Payload ist IMMER die Adresse des Empfaengers
 * und wird von der Aufrufstelle gesetzt (bei der HR-Meldung
 * onboarding-task-completed gar nicht — Empfaenger ist das An-Feld der Vorlage).
 *
 * `mitarbeiter_name` ist NIE leer und NIE eine Adresse: ohne bekannten Namen
 * MITARBEITER_NEUTRAL („die neue Mitarbeiterin / den neuen Mitarbeiter",
 * Akkusativ — passt nach „für"). Ein leerer Wert fiele in `extractVariables`
 * (src/lib/mailer.ts) auf `payload.email` zurueck — das ist hier die Adresse
 * der Abteilung.
 *
 * Rein (kein Prisma), damit Tests und events.ts-Beispiel sie ohne Datenbank
 * pruefen koennen.
 */

import { formatDatumDE } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";
import { MITARBEITER_NEUTRAL, mitarbeiterName } from "@/lib/onboarding-spuren";

/** Was ein Onboarding-Vorgang fuer die Mails mindestens mitbringen muss. */
export interface OnboardingAbteilungsMailVorgang {
  id: string;
  displayId: string | null;
  firstName?: string | null;
  lastName?: string | null;
  personalData?: { firstName?: string | null; lastName?: string | null } | null;
  organization?: { name: string; mandantNumber?: string | null } | null;
  supervisorData?: { vertragsbeginn?: Date | null } | null;
}

/** Vor- und Nachname aus dem Fragebogen, sonst vom Vorgang (wie mitarbeiterName). */
function namensTeile(v: OnboardingAbteilungsMailVorgang): { vorname: string; nachname: string } {
  const pd = { vorname: v.personalData?.firstName?.trim() ?? "", nachname: v.personalData?.lastName?.trim() ?? "" };
  if (pd.vorname || pd.nachname) return pd;
  return { vorname: v.firstName?.trim() ?? "", nachname: v.lastName?.trim() ?? "" };
}

/**
 * Die Felder, die JEDE Onboarding-Abteilungsmail braucht.
 *
 *   onboardingId, displayId (Rueckfall: erste 8 Zeichen der ID, wie der Cron)
 *   vorname, nachname          koennen leer sein
 *   mitarbeiter_name, employeeName   Name oder MITARBEITER_NEUTRAL, nie leer
 *   organization, organizationName, einrichtung   Einrichtung (derselbe Wert)
 *   mandantNumber              nur, wenn vorhanden
 *   contractStartDate          Vertragsbeginn ISO ("" ohne)
 *   vertragsbeginn             Vertragsbeginn TT.MM.JJJJ ("" ohne)
 */
export function onboardingAbteilungsMailFelder(v: OnboardingAbteilungsMailVorgang): Record<string, string> {
  const name = mitarbeiterName(v) ?? MITARBEITER_NEUTRAL;
  const { vorname, nachname } = namensTeile(v);
  const einrichtung = v.organization?.name ?? "";
  const mandantNumber = v.organization?.mandantNumber;
  const beginn = v.supervisorData?.vertragsbeginn ?? null;
  const beginnGueltig = beginn && !Number.isNaN(beginn.getTime()) ? beginn : null;
  return {
    onboardingId: v.id,
    displayId: v.displayId || v.id.substring(0, 8),
    vorname,
    nachname,
    mitarbeiter_name: name,
    employeeName: name,
    organization: einrichtung,
    organizationName: einrichtung,
    einrichtung,
    ...(mandantNumber ? { mandantNumber } : {}),
    contractStartDate: beginnGueltig ? beginnGueltig.toISOString() : "",
    vertragsbeginn: beginnGueltig ? formatDatumDE(beginnGueltig) : "",
  };
}

/**
 * Magic Link einer Abteilung auf ihre Onboarding-Aufgaben:
 * <APP_URL>/onboarding-tasks/<token>. EINZIGE Stelle, die ihn baut — Mails und
 * „Link kopieren" (Server liefert `url`) nutzen sie beide.
 */
export function onboardingAufgabenLink(token: string): string {
  return `${getBaseUrl()}/onboarding-tasks/${token}`;
}
