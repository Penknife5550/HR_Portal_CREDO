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
 *
 * Merker `SupervisorData.mitAusstattung` (Ausstattung & Zugaenge, Regel 2):
 * Die Schrittliste des Formulars steht fest, sobald der Link entsteht. Der
 * Aufrufer rechnet `ausstattungAngeboten` (`ausstattungAngebotenIn`) in
 * DERSELBEN Transaktion vorher aus — Pflichtfeld, damit kein Weg ihn vergisst.
 * Gerechnet wird mit dem Arbeitsort, den der Aufrufer gelesen hat
 * (`arbeitsortId`, ebenfalls Pflicht); die Sperre unten trifft nur, wenn der
 * Vorgang noch auf DIESEM Arbeitsort steht. Sonst koennte ein gleichzeitiger
 * Arbeitsort-PATCH (bedingt auf `supervisorToken: null`) zwischen dem Lesen
 * und der Sperre committen: Der Merker kaeme aus dem Katalog des alten Orts,
 * und weil der Arbeitsort ab dem Link eingefroren ist, korrigierte ihn
 * niemand mehr. So endet dieser Wettlauf als `LinkGeaendert` (Route: 409
 * „Vorgang wurde gerade geändert“), und der naechste Versuch liest den neuen
 * Ort.
 *   - Neue Zeile: Der Merker kommt mit dem Anlegen (`create`).
 *   - Bestehende Zeile (Erneuern, andere Adresse): Er wird nur gesetzt, solange
 *     er leer ist UND `currentStep` 0 ist — bedingtes `updateMany`. Sonst
 *     spraenge ein halb ausgefuelltes Formular, weil `currentStep` ein Index ist.
 *     Ein einmal gesetzter Wert (auch `false`) bleibt, selbst wenn der Katalog
 *     inzwischen etwas anbietet.
 * Zurueck kommt der WIRKSAME Wert (`null` gilt als `false`); er steuert den
 * Satz in der Einladungsmail (`vorgesetztenLinkMailFelder`).
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
    /** Bietet der Katalog diesem Vorgang etwas an? (`ausstattungAngebotenIn`, dieselbe Transaktion) */
    ausstattungAngeboten: boolean;
    /**
     * Der Arbeitsort, mit dem `ausstattungAngeboten` gerechnet wurde — so, wie
     * der Aufrufer ihn gelesen hat (null = Einrichtung des Vorgangs). Steht im
     * WHERE der Sperre.
     */
    arbeitsortId: string | null;
  },
): Promise<{
  supervisorToken: string;
  supervisorTokenExpiresAt: Date;
  abgleich: StatusAbgleich;
  /** Wirksamer Merker der Schrittliste nach diesem Aufruf. */
  mitAusstattung: boolean;
}> {
  const supervisorToken = generateToken();
  const supervisorTokenExpiresAt = getTokenExpiryDate();

  // Optimistische Sperre: Geschrieben wird nur, wenn der Link noch der
  // ist, den wir oben gelesen haben (bzw. es noch keinen gibt), die
  // Modalitaeten weiter offen sind und HR den Vorgang nicht inzwischen
  // abgeschlossen hat. Ein zweiter, gleichzeitiger Aufruf (Doppelklick)
  // wartet auf unsere Zeilensperre, findet danach einen anderen Token
  // vor und bekommt count 0 — statt unseren frischen Link zu ersetzen.
  // Ebenso, wenn der Arbeitsort nicht mehr der ist, aus dem der Merker
  // stammt (Kopfkommentar). `?? null`: Fehlte der Wert, fiele die Bedingung
  // in Prisma still weg — so trifft die Sperre dann nur ohne Arbeitsort.
  const gesetzt = await tx.onboardingProcess.updateMany({
    where: {
      id: e.id,
      supervisorToken: e.bisherigerToken,
      supervisorSubmittedAt: null,
      status: { notIn: [...HR_STATUS] },
      arbeitsortId: e.arbeitsortId ?? null,
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
  // weitermachen koennen. Eine neue Zeile bekommt den Merker der
  // Schrittliste gleich mit.
  const zeile = await tx.supervisorData.upsert({
    where: { onboardingId: e.id },
    update: {},
    create: { onboardingId: e.id, mitAusstattung: e.ausstattungAngeboten },
    select: { mitAusstattung: true, currentStep: true },
  });

  // Bestehende Zeile ohne Merker (Altbestand, den die Migration
  // SUPERVISOR_MIT_AUSSTATTUNG_V1 noch nicht erreicht hat): nur, solange das
  // Formular nie gespeichert wurde. Bedingt, damit ein gleichzeitiges
  // Speichern des Formulars (currentStep > 0) gewinnt; dann bleibt er leer
  // und gilt als false.
  let mitAusstattung = zeile.mitAusstattung ?? false;
  if (zeile.mitAusstattung === null && zeile.currentStep === 0) {
    const merker = await tx.supervisorData.updateMany({
      where: { onboardingId: e.id, mitAusstattung: null, currentStep: 0 },
      data: { mitAusstattung: e.ausstattungAngeboten },
    });
    mitAusstattung = merker.count > 0 ? e.ausstattungAngeboten : false;
  }

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

  return { supervisorToken, supervisorTokenExpiresAt, abgleich, mitAusstattung };
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
 *
 * `ausstattung_angeboten` (Regel 2) ist der WIRKSAME Merker aus
 * `vorgesetztenLinkSetzen` (`mitAusstattung`), nicht der Katalog von heute —
 * die Mail verspricht nur den Schritt, den das Formular auch zeigt. Als
 * Zeichenkette `"ja"`/`""`: `renderTemplate` kennt nur „nicht leer“, und
 * `String(false)` waere nicht leer. Der Schluessel steht immer da (Payload =
 * Katalogbeispiel).
 */
export function vorgesetztenLinkMailFelder(
  v: {
    id: string;
    displayId: string | null;
    supervisorEmail: string;
    supervisorToken: string;
    supervisorTokenExpiresAt: Date;
    organization: { name: string; mandantNumber: string };
    firstName?: string | null;
    lastName?: string | null;
    personalData?: { firstName?: string | null; lastName?: string | null } | null;
  },
  opts: { ausstattungAngeboten: boolean },
): Record<string, string> {
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
    ausstattung_angeboten: opts.ausstattungAngeboten ? "ja" : "",
  };
}
