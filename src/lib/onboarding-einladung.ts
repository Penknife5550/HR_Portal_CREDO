/**
 * CREDO HR-Portal – Onboarding: Links und Einladungsmails beider Spuren
 *
 * Den Vorgesetzten-Link erzeugen zwei Stellen: das Anlegen im Dialog „Neuer
 * Vorgang" (POST /api/onboarding, wenn HR die Fuehrungskraft gleich mit
 * eintraegt) und die Uebersicht des Vorgangs (POST
 * /api/onboarding/[id]/supervisor-link). Beide laufen durch DIESELBE
 * Schreibfunktion und denselben Payload-Baustein — sonst weichen die Wege
 * auseinander, und genau dort landete frueher die private Adresse der Person
 * in der Mail an die Fuehrungskraft.
 *
 * NUR FUER DEN SERVER (Prisma-Transaktion, Token-Erzeugung). Die reinen Regeln
 * stehen client-sicher in src/lib/onboarding-spuren.ts.
 */

import type { Prisma } from "@prisma/client";
import { generateToken, getTokenExpiryDate } from "@/lib/auth";
import { HR_STATUS, MITARBEITER_NEUTRAL, mitarbeiterName } from "@/lib/onboarding-spuren";
import { statusAbgleichen, type StatusAbgleich } from "@/lib/onboarding-status-abgleich";

/**
 * Zwischen Lesen und Schreiben hat sich der Link geaendert (Doppelklick,
 * zweiter Tab). Eigene Klasse, weil nur eine Ausnahme die Transaktion
 * zurueckrollt.
 */
export class LinkGeaendert extends Error {}

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

/** Magic Link der Person auf den Personalfragebogen. */
export function fragebogenLinkZu(token: string): string {
  return `${appUrl()}/fragebogen/${token}`;
}

/** Magic Link der Fuehrungskraft auf die Einstellungsmodalitaeten. */
export function modalitaetenLinkZu(token: string): string {
  return `${appUrl()}/modalitaeten/${token}`;
}

/**
 * Vorgesetzten-Link setzen — innerhalb einer laufenden Transaktion.
 *
 * Reihenfolge nach der Hausregel (onboarding-status-abgleich.ts): erst die
 * eigene Spur per bedingtem `updateMany` beanspruchen, DANN `statusAbgleichen`,
 * und das Protokoll im selben Commit. Beim Anlegen ist `bisherigerToken` null
 * und die Zeile frisch — das UPDATE trifft dort immer, kostet eine Anweisung
 * mehr und erspart einen zweiten Regelpfad.
 *
 * Wirft `LinkGeaendert`, wenn das UPDATE nichts trifft; die Transaktion rollt
 * dann zurueck, und der Aufrufer entscheidet (wiederverwenden oder 409).
 *
 * Die Mail geht NICHT hier hinaus, sondern erst nach dem Commit beim Aufrufer:
 * Nach einem Rollback ginge sonst ein toter Link hinaus, und die Zeilensperre
 * bliebe fuer die Dauer des SMTP-Versands liegen.
 */
export async function vorgesetztenLinkSetzen(
  tx: Prisma.TransactionClient,
  e: {
    id: string;
    supervisorEmail: string;
    /** Der vorher gelesene Token (null = es gibt noch keinen). */
    bisherigerToken: string | null;
    /** Adresse zum bisherigen Token — fuer `ersetztLinkAn` im Protokoll. */
    bisherigeEmail: string | null;
    userId: string;
    organizationName: string;
  },
): Promise<{ supervisorToken: string; supervisorTokenExpiresAt: Date; abgleich: StatusAbgleich }> {
  const supervisorToken = generateToken();
  const supervisorTokenExpiresAt = getTokenExpiryDate();

  // Optimistische Sperre: Geschrieben wird nur, wenn der Link noch der
  // ist, den wir oben gelesen haben (bzw. es noch keinen gibt), die
  // Modalitaeten weiter offen sind und HR den Vorgang nicht inzwischen
  // abgeschlossen hat. Ein zweiter, gleichzeitiger Aufruf (Doppelklick)
  // wartet auf unsere Zeilensperre, findet danach einen anderen Token
  // vor und bekommt count 0 — statt unseren frischen Link zu ersetzen.
  const gesetzt = await tx.onboardingProcess.updateMany({
    where: {
      id: e.id,
      supervisorToken: e.bisherigerToken,
      supervisorSubmittedAt: null,
      status: { notIn: [...HR_STATUS] },
    },
    data: {
      supervisorEmail: e.supervisorEmail,
      supervisorToken,
      supervisorTokenExpiresAt,
      supervisorLinkSentAt: new Date(),
      // Erinnerungen zaehlen ab DIESEM Link. Eine Erinnerung zum alten
      // (ersetzten) Link darf die erste zum neuen nicht verschieben.
      lastSupervisorReminderAt: null,
    },
  });
  if (gesetzt.count === 0) throw new LinkGeaendert();

  // Leerer Datensatz fuer das Formular. Beim Ersetzen bleibt alles
  // stehen, was schon eingetragen wurde — die richtige Person soll dort
  // weitermachen koennen.
  await tx.supervisorData.upsert({
    where: { onboardingId: e.id },
    update: {},
    create: { onboardingId: e.id },
  });

  const abgleich = await statusAbgleichen(tx, e.id);

  await tx.auditLog.create({
    data: {
      onboardingId: e.id,
      userId: e.userId,
      action: "SUPERVISOR_LINK_CREATED",
      details: {
        supervisorEmail: e.supervisorEmail,
        organization: e.organizationName,
        // War schon ein Link da, ist er jetzt ungueltig — das gehoert
        // ins Protokoll (falscher Empfaenger, abgelaufener Link).
        ersetztLinkAn: e.bisherigerToken ? e.bisherigeEmail : null,
        status: { von: abgleich.von, nach: abgleich.nach },
      },
    },
  });

  return { supervisorToken, supervisorTokenExpiresAt, abgleich };
}

/**
 * Payload der Einladung an die Person (`onboarding-created`).
 *
 * Ohne Namen stehen `vorname`/`nachname` als leere Zeichenkette da — wie in
 * der Erinnerung (cron/reminders). Die Vorlage gruesst deshalb mit
 * `{{#vorname}}…{{/vorname}}`, nicht mit `{{mitarbeiter_name}}`: Das faellt im
 * Mailer auf die Adresse zurueck.
 */
export function einladungMailFelder(v: {
  id: string;
  displayId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  token: string;
  tokenExpiresAt: Date;
  organization: { name: string; mandantNumber: string };
}): Record<string, string> {
  const vorname = v.firstName?.trim() ?? "";
  const nachname = v.lastName?.trim() ?? "";
  return {
    onboardingId: v.id,
    displayId: v.displayId ?? "",
    email: v.email,
    vorname,
    nachname,
    firstName: vorname,
    lastName: nachname,
    fragebogenLink: fragebogenLinkZu(v.token),
    organization: v.organization.name,
    mandantNumber: v.organization.mandantNumber,
    tokenExpiresAt: v.tokenExpiresAt.toISOString(),
  };
}

/**
 * Payload der Einladung an die Fuehrungskraft (`supervisor-link-created`).
 *
 * Name aus Fragebogen oder Vorgang, sonst die neutrale Bezeichnung — NIE die
 * private E-Mail-Adresse der Person (Datensparsamkeit, Art. 5 Abs. 1 lit. c
 * DSGVO). Deshalb auch KEIN Feld `email` oder `employeeEmail`: Der Mailer
 * (`extractVariables`) faellt fuer `{{mitarbeiter_name}}` auf genau diese
 * Felder zurueck, und jeder Webhook bekaeme die Adresse mit.
 */
export function vorgesetztenLinkMailFelder(v: {
  id: string;
  displayId: string | null;
  supervisorEmail: string;
  supervisorToken: string;
  supervisorTokenExpiresAt: Date;
  organization: { name: string; mandantNumber: string };
  firstName?: string | null;
  lastName?: string | null;
  personalData?: { firstName?: string | null; lastName?: string | null } | null;
}): Record<string, string> {
  const name = mitarbeiterName(v) ?? MITARBEITER_NEUTRAL;
  return {
    onboardingId: v.id,
    displayId: v.displayId ?? "",
    supervisorEmail: v.supervisorEmail,
    modalitaetenLink: modalitaetenLinkZu(v.supervisorToken),
    employeeName: name,
    mitarbeiter_name: name,
    organization: v.organization.name,
    mandantNumber: v.organization.mandantNumber,
    supervisorTokenExpiresAt: v.supervisorTokenExpiresAt.toISOString(),
  };
}
