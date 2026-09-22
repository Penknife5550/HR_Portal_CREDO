/**
 * CREDO HR-Portal – Gemeinsame Felder der Offboarding-Mails
 *
 * Warum es diese Datei gibt: Die sechs Offboarding-Ereignisse
 * (offboarding-created, -department-assigned, -task-completed,
 * -department-completed, -reminder, -completed) werden an sieben Stellen
 * ausgeloest, und jede Stelle hat ihren Payload selbst zusammengebaut. Das
 * Ergebnis waren sieben verschiedene Payloads: Mal hiess die Einrichtung
 * `organization`, mal `organizationName`, das Austrittsdatum fehlte bei der
 * Abschlussmeldung ganz, Vor- und Nachname gab es nur im Cron. Die
 * Standardvorlagen sprechen dagegen einheitlich von {{vorname}},
 * {{nachname}}, {{austrittsdatum}} und {{einrichtung}} — und blieben an genau
 * diesen Stellen leer ("Neuer Offboarding-Vorgang:  " im Betreff).
 *
 * Deshalb baut jede Aufrufstelle den gemeinsamen Teil hier, und nur das
 * Ereignisspezifische (Abteilung, Aufgabe, Link, Zaehler) selbst. Die
 * englischen Feldnamen bleiben ALLE erhalten: Auf die Ereignisse koennen
 * Webhooks (n8n) eingetragen sein, die genau diese Namen lesen. Hinzu kommen
 * nur Felder, nie fallen welche weg.
 *
 * Das Sicherheitsnetz fuer Payloads, die nicht hier entstehen (aeltere
 * Aufrufer, gespeicherte Vorlagen mit englischen Platzhaltern), sind die
 * Aliase in `extractVariables` (src/lib/mailer.ts).
 */

import { formatDatumDE, formatEmployeeName } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";

/** Was ein Offboarding-Vorgang mindestens mitbringen muss. */
export interface OffboardingMailVorgang {
  id: string;
  displayId: string;
  employeeFirstName: string;
  employeeLastName: string;
  lastWorkingDay: Date;
  organization?: { name: string; mandantNumber?: string | null } | null;
}

/**
 * Die Felder, die JEDE Offboarding-Mail braucht.
 *
 * `organization`, `organizationName` und `einrichtung` tragen denselben Wert.
 * Das ist Absicht und kein Versehen: Jeder der drei Namen war bisher an
 * mindestens einer Aufrufstelle in Gebrauch, und ein Webhook-Empfaenger, der
 * einen davon liest, soll ihn weiter finden.
 *
 * `austrittsdatum` kommt fertig formatiert (TT.MM.JJJJ, deutsche Zeit) mit,
 * `lastWorkingDay` bleibt der ISO-Zeitstempel fuer Maschinen.
 */
export function offboardingMailFelder(
  vorgang: OffboardingMailVorgang,
): Record<string, string> {
  const einrichtung = vorgang.organization?.name ?? "";
  const mandantNumber = vorgang.organization?.mandantNumber;
  return {
    offboardingId: vorgang.id,
    displayId: vorgang.displayId,
    employeeName: formatEmployeeName(vorgang),
    employeeFirstName: vorgang.employeeFirstName,
    employeeLastName: vorgang.employeeLastName,
    vorname: vorgang.employeeFirstName,
    nachname: vorgang.employeeLastName,
    organization: einrichtung,
    organizationName: einrichtung,
    einrichtung,
    ...(mandantNumber ? { mandantNumber } : {}),
    lastWorkingDay: vorgang.lastWorkingDay.toISOString(),
    austrittsdatum: formatDatumDE(vorgang.lastWorkingDay),
  };
}

/**
 * Magic Link einer Abteilung auf ihre Offboarding-Aufgaben.
 *
 * Die Seite heisst /offboarding-tasks/<token> (src/app/offboarding-tasks).
 * Die Mails zeigten bis September 2026 auf /offboarding/abteilung/<token>
 * — eine Seite, die es nie gab. Jede Abteilung, die auf "Aufgaben ansehen"
 * klickte, landete auf einer 404.
 *
 * Seit Paket 1b ist dies die EINZIGE Stelle, die den Link baut: Mails
 * (abteilungsaufgaben-dienst.ts) und der Knopf "Link kopieren" im Portal
 * nutzen sie beide. Der Knopf baut die Adresse nicht mehr im Browser aus
 * window.location, sondern bekommt sie fertig vom Server (`url` an
 * `departmentLinks[]` und `abteilungen.zeilen[].link` in GET
 * /api/offboarding/[id], abteilungsUebersichtLaden). So zeigen Mail und
 * kopierter Link auf dieselbe Adresse (APP_URL), auch wenn HR das Portal ueber
 * eine interne Adresse aufruft. Eine Umbenennung der Seite braucht nur hier
 * eine Aenderung.
 */
export function abteilungsAufgabenLink(token: string): string {
  return `${getBaseUrl()}/offboarding-tasks/${token}`;
}
