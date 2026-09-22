/**
 * CREDO HR-Portal – Abteilungsaufgaben im Offboarding: Versand, Uebersicht,
 * Erinnerungen, Fristen, Fuehrungskraft (Datenbankteil, nur Server)
 *
 * Die Regeln selbst stehen rein und getestet in src/lib/abteilungsaufgaben.ts.
 * Hier werden sie auf den Offboarding-Vorgang angewandt. Die Uebergaenge beim
 * Abhaken (Link der Abteilung und Portal) stehen in
 * src/lib/abteilungsaufgaben-uebergaenge.ts.
 *
 * Wer ruft was:
 *   POST /api/offboarding/[id]/department-links → abteilungsAktionAusfuehren
 *   GET  /api/offboarding/[id]                  → abteilungsUebersichtLaden
 *   PATCH /api/offboarding/[id]                 → letztenArbeitstagSperren,
 *                                                 faelligkeitenVerschieben,
 *                                                 fuehrungskraftAdresseFreigegeben
 *   POST /api/offboarding                       → fuehrungskraftAdresseFreigegeben
 *   POST /api/cron/offboarding-reminders        → erinnerungenSenden
 *
 * Ablauf eines Versands je Abteilung (Nachweis nur nach echtem Versand):
 *   1. Link anlegen bzw. anpassen (Token nur beim Anlegen oder bei
 *      ausdruecklicher Erneuerung), Gueltigkeit ggf. verlaengern.
 *   2. Mail ueber triggerWebhooks — NACH dem Schreiben des Links, damit die
 *      Mail nie einen Token enthaelt, den es nicht gibt.
 *   3. Ergebnis am Link festhalten: SENT/WEBHOOK setzen sentAt (einmal) und
 *      lastSentAt, FAILED/SKIPPED nur lastSendStatus/-Detail — mit NEUEM Token
 *      zusaetzlich sentAt = null (der neue Link ist nie angekommen). Laeuft die
 *      Anfrage in einen Proxy-Timeout, steht der Stand trotzdem je Link in der
 *      Datenbank und die Karte zeigt ihn beim naechsten Laden.
 *
 * Doppelversand-Sperre: prozesslokal je Vorgang (wie laufendeVersendungen im
 * Dokumentenpaket) — fuer die HR-Aktionen UND den taeglichen Lauf — plus eine
 * Sperrzeit von 10 Minuten je Link fuer Erinnern und Erneut senden. Beides
 * traegt nur, solange das Portal als EIN Container laeuft; beim waagerechten
 * Skalieren durch eine gemeinsame Ablage ersetzen.
 */

import crypto from "crypto";
import type { OffboardingDepartmentLink, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { abteilungsAufgabenLink, offboardingMailFelder } from "@/lib/offboarding-mail";
import { canAccessProcess, HR_EDIT_ROLES, type SessionPayload } from "@/lib/permissions";
import { ladeErlaubteDomains, empfaengerFreigegeben } from "@/lib/empfaenger-allowlist";
import {
  ABTEILUNGS_AUDIT,
  MELDUNGEN,
  abteilungsReihenfolge,
  abteilungsZeilenBauen,
  adresseGleich,
  aufgabenlisteMailFelder,
  berichtMeldung,
  empfaengerAufloesen,
  erinnerungsMerkerSetzen,
  erinnerungsStufe,
  erledigtVonBestimmen,
  faelligkeitVerschoben,
  grundText,
  gueltigBis,
  httpStatusAusBericht,
  istFuehrungskraft,
  istLinkAbteilung,
  linkAnzeige,
  meldungNachweisFehlt,
  sperrzeitBis,
  stufeBerechnen,
  stufenMailFelder,
  verlaengerungNoetig,
  versandEntscheidung,
  versandStatusAusErgebnis,
  type AbteilungsAktion,
  type AbteilungsKonfig,
  type AbteilungsZeile,
  type Anzeige,
  type BerichtEintrag,
  type DienstAntwort,
  type Empfaenger,
  type ErinnerungsStufe,
  type ErledigtVon,
  type Fuehrungskraft,
  type FuehrungskraftQuelle,
  type Grund,
  type LinkVersandErgebnis,
  type StufenBerechnung,
  type VersandBericht,
} from "@/lib/abteilungsaufgaben";
import { abteilungsAktionSchema } from "@/lib/validations/abteilungsaufgaben";
import { linksSperren } from "@/lib/abteilungsaufgaben-uebergaenge";

// =============================================
// Konstanten
// =============================================

/** Status, in denen der Vorgang keine Abteilungen mehr anschreibt. */
export const OFFBOARDING_ENDSTATUS = ["COMPLETED", "CANCELLED"] as const;

export function vorgangBeendet(status: string): boolean {
  return (OFFBOARDING_ENDSTATUS as readonly string[]).includes(status);
}

const EVENT_ZUGEWIESEN = "offboarding-department-assigned";
const EVENT_ERINNERUNG = "offboarding-reminder";

/** Felder des Vorgangs, die Versand und Mails brauchen. */
const VORGANG_AUSWAHL = {
  id: true,
  displayId: true,
  organizationId: true,
  status: true,
  employeeFirstName: true,
  employeeLastName: true,
  lastWorkingDay: true,
  supervisorEmail: true,
  supervisorName: true,
  organization: { select: { name: true, mandantNumber: true } },
  zeugnisBewertung: { select: { supervisorEmail: true, supervisorName: true } },
  contractEnd: { select: { supervisorEmail: true } },
} satisfies Prisma.OffboardingProcessSelect;

type VorgangFuerVersand = Prisma.OffboardingProcessGetPayload<{ select: typeof VORGANG_AUSWAHL }>;

const AUFGABEN_AUSWAHL = {
  id: true,
  title: true,
  category: true,
  orderIndex: true,
  dueDate: true,
  isCompleted: true,
  assigneeDepartment: true,
} satisfies Prisma.OffboardingChecklistItemSelect;

type AufgabeFuerVersand = Prisma.OffboardingChecklistItemGetPayload<{ select: typeof AUFGABEN_AUSWAHL }>;

// =============================================
// Fuehrungskraft
// =============================================

export interface FuehrungskraftQuellen {
  supervisorEmail?: string | null;
  supervisorName?: string | null;
  zeugnisBewertung?: { supervisorEmail: string | null; supervisorName: string | null } | null;
  contractEnd?: { supervisorEmail: string | null } | null;
}

// Die Typen stehen in der reinen Datei (die Oberflaeche braucht sie) und
// werden hier fuer die bisherigen Importe weitergereicht.
export type { Fuehrungskraft, FuehrungskraftQuelle };

/**
 * Wer ist die Fuehrungskraft dieses Austritts? In dieser Reihenfolge:
 *   1. im Vorgang hinterlegt (Neuer Austritt / Tab Übersicht / Vertragsende)
 *   2. aus der Zeugnis-Bewertung desselben Austritts
 *   3. aus dem Vertragsende, aus dem der Austritt entstand (Altbestand vor 1b)
 * Der Name folgt der Quelle der Adresse. Ohne Adresse: alles null.
 */
export function fuehrungskraftErmitteln(v: FuehrungskraftQuellen): Fuehrungskraft {
  const eigene = v.supervisorEmail?.trim();
  if (eigene) return { email: eigene, name: v.supervisorName?.trim() || null, quelle: "VORGANG" };
  const zeugnis = v.zeugnisBewertung?.supervisorEmail?.trim();
  if (zeugnis) {
    return { email: zeugnis, name: v.zeugnisBewertung?.supervisorName?.trim() || null, quelle: "ZEUGNIS" };
  }
  const vertragsende = v.contractEnd?.supervisorEmail?.trim();
  if (vertragsende) return { email: vertragsende, name: null, quelle: "VERTRAGSENDE" };
  return { email: null, name: null, quelle: null };
}

/**
 * Darf an diese Adresse der Fuehrungskraft geschrieben werden?
 *
 * Dieselbe Freigabeliste wie das Dokumentenpaket (Einstellungen → SMTP,
 * src/lib/empfaenger-allowlist.ts): leere Liste = keine Einschraenkung.
 * Adressen, die das Portal schon kennt (bisheriger Wert im Vorgang, Zeugnis-
 * Bewertung, Vertragsende), sind immer erlaubt — die Pruefung gilt der FREI
 * EINGETIPPTEN Adresse. Aufrufer: POST /api/offboarding und PATCH
 * /api/offboarding/[id], jeweils VOR dem Speichern; nein = 409 mit
 * MELDUNGEN.FUEHRUNGSKRAFT_NICHT_FREIGEGEBEN.
 */
export async function fuehrungskraftAdresseFreigegeben(
  email: string,
  bekannteAdressen: ReadonlyArray<string | null | undefined> = [],
): Promise<boolean> {
  if (bekannteAdressen.some((b) => !!b && adresseGleich(b, email))) return true;
  const domains = await ladeErlaubteDomains();
  return empfaengerFreigegeben({ empfaenger: email, empfaengerVorgang: "", domains });
}

// =============================================
// Kleine Helfer
// =============================================

async function webhookAktiv(event: string): Promise<boolean> {
  try {
    return (await prisma.webhookConfig.count({ where: { event, isActive: true } })) > 0;
  } catch {
    return false;
  }
}

async function konfigsLaden(): Promise<AbteilungsKonfig[]> {
  return prisma.departmentConfig.findMany({
    select: { departmentKey: true, departmentName: true, email: true, organizationId: true, isActive: true },
  });
}

/** Protokoll nach dem Versand — ein Fehler hier darf den Versand nicht ungeschehen melden. */
async function protokollieren(
  offboardingId: string,
  userId: string | null,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        offboardingId,
        processType: "OFFBOARDING",
        action,
        details: details as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(
      `[Abteilungsaufgaben] Protokolleintrag ${action} fuer ${offboardingId} fehlgeschlagen — der Versand ist trotzdem erfolgt:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// =============================================
// Versandkontext
// =============================================

interface VersandKontext {
  vorgang: VorgangFuerVersand;
  aufgaben: AufgabeFuerVersand[];
  links: Map<string, OffboardingDepartmentLink>;
  konfigs: AbteilungsKonfig[];
  webhook: { zugewiesen: boolean; erinnerung: boolean };
  jetzt: Date;
  /**
   * Abteilungen, an die eine Mail hinausging, deren Ergebnis aber nicht am
   * Link gespeichert werden konnte (Datenbankfehler NACH dem Versand). Die
   * Antwort warnt davor, erneut zu senden (Muster Dokumentenpaket: SENT mit
   * lauter Warnung statt 500, das zum Doppelversand verleitete).
   */
  warnungen: string[];
}

async function versandKontextLaden(vorgang: VorgangFuerVersand, jetzt: Date): Promise<VersandKontext> {
  const [aufgaben, links, konfigs, zugewiesen, erinnerung] = await Promise.all([
    prisma.offboardingChecklistItem.findMany({
      where: { offboardingId: vorgang.id },
      select: AUFGABEN_AUSWAHL,
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    }),
    prisma.offboardingDepartmentLink.findMany({ where: { offboardingId: vorgang.id } }),
    konfigsLaden(),
    webhookAktiv(EVENT_ZUGEWIESEN),
    webhookAktiv(EVENT_ERINNERUNG),
  ]);
  return {
    vorgang,
    aufgaben,
    links: new Map(links.map((l) => [l.departmentKey, l])),
    konfigs,
    webhook: { zugewiesen, erinnerung },
    jetzt,
    warnungen: [],
  };
}

function aufgabenVon(ctx: VersandKontext, key: string): AufgabeFuerVersand[] {
  return ctx.aufgaben.filter((a) => a.assigneeDepartment === key);
}

function offeneVon(ctx: VersandKontext, key: string): AufgabeFuerVersand[] {
  return aufgabenVon(ctx, key).filter((a) => !a.isCompleted);
}

function empfaengerFuer(ctx: VersandKontext, key: string): Empfaenger {
  return empfaengerAufloesen({
    departmentKey: key,
    organizationId: ctx.vorgang.organizationId,
    konfigs: ctx.konfigs,
    fuehrungskraft: fuehrungskraftErmitteln(ctx.vorgang),
  });
}

function uebersprungen(
  key: string,
  name: string,
  email: string | null,
  grund: Grund,
  detail?: string | null,
  neuerLink?: boolean,
): BerichtEintrag {
  return {
    departmentKey: key,
    departmentName: name,
    email,
    grund,
    ...(detail ? { detail } : {}),
    ...(neuerLink ? { neuerLink: true } : {}),
  };
}

function eintragAusErgebnis(
  link: OffboardingDepartmentLink,
  v: LinkVersandErgebnis,
  neuerLink: boolean,
): BerichtEintrag {
  if (v.erfolgreich) {
    return {
      departmentKey: link.departmentKey,
      departmentName: link.departmentName,
      email: link.email,
      status: v.status === "WEBHOOK" ? "WEBHOOK" : "SENT",
      ...(neuerLink ? { neuerLink: true } : {}),
    };
  }
  return uebersprungen(
    link.departmentKey,
    link.departmentName,
    link.email,
    v.status === "FAILED" ? "MAIL_FEHLGESCHLAGEN" : "MAIL_NICHT_VERSENDET",
    v.detail,
    neuerLink,
  );
}

/**
 * Ergebnis eines ERFOLGREICHEN Versands am Link speichern. Die Mail ist dann
 * schon hinaus — scheitert jetzt die Datenbank, wird daraus kein 500 (HR
 * klickte erneut, die Abteilung bekaeme dieselbe Mail doppelt), sondern ein
 * lauter Logeintrag und eine Warnung in der Antwort (ctx.warnungen). Der
 * Stand im Speicher (`imSpeicher`) wird trotzdem fortgeschrieben, damit
 * Bericht und Protokoll den Versand zeigen. Muster: Dokumentenpaket, Regel 3.
 */
async function ergebnisSpeichern(
  ctx: VersandKontext,
  link: OffboardingDepartmentLink,
  daten: Prisma.OffboardingDepartmentLinkUpdateInput,
  imSpeicher: OffboardingDepartmentLink,
): Promise<OffboardingDepartmentLink> {
  try {
    return await prisma.offboardingDepartmentLink.update({ where: { id: link.id }, data: daten });
  } catch (err) {
    console.error(
      `[Abteilungsaufgaben] Mail an ${link.departmentName} (${ctx.vorgang.displayId}) ist versendet, das Ergebnis konnte aber nicht gespeichert werden:`,
      err instanceof Error ? err.message : err,
    );
    ctx.warnungen.push(link.departmentName);
    return imSpeicher;
  }
}

// =============================================
// Mail "Aufgaben zugewiesen" (Erstmail, Erneut, neuer Link)
// =============================================

type ZuweisungsModus = "ERSTMAIL" | "ERNEUT" | "NEUER_LINK";

/**
 * Payload von offboarding-department-assigned. Alle bisherigen Felder bleiben
 * (Webhook-Abnehmer lesen sie, offboarding-mail.ts), neu sind Aufgabenliste,
 * link, erneut_gesendet, neuer_link und ist_fuehrungskraft.
 * `taskCount` = Anzahl der Aufgaben in der Liste (offene; ohne offene alle).
 * `neuer_link` = "ja", wenn ein frueher zugestellter Link nicht mehr gilt
 * (siehe `alterLinkUngueltig` in zuweisungSenden).
 */
function zuweisungsPayload(
  ctx: VersandKontext,
  link: OffboardingDepartmentLink,
  liste: ReadonlyArray<{ title: string; dueDate: Date | null }>,
  modus: ZuweisungsModus,
  alterLinkUngueltig: boolean,
): Record<string, unknown> {
  const url = abteilungsAufgabenLink(link.token);
  return {
    ...offboardingMailFelder(ctx.vorgang),
    departmentKey: link.departmentKey,
    departmentName: link.departmentName,
    abteilung: link.departmentName,
    email: link.email,
    expiresAt: link.expiresAt.toISOString(),
    taskCount: liste.length,
    token: link.token,
    magicLink: url,
    link: url,
    ...aufgabenlisteMailFelder(liste),
    erneut_gesendet: modus === "ERNEUT" ? "ja" : "",
    neuer_link: alterLinkUngueltig ? "ja" : "",
    ist_fuehrungskraft: istFuehrungskraft(link.departmentKey) ? "ja" : "",
  };
}

async function zuweisungSenden(
  ctx: VersandKontext,
  key: string,
  empfaenger: Extract<Empfaenger, { ok: true }>,
  modus: ZuweisungsModus,
): Promise<{ eintrag: BerichtEintrag; v: LinkVersandErgebnis; link: OffboardingDepartmentLink }> {
  const offene = offeneVon(ctx, key);
  const liste = offene.length > 0 ? offene : aufgabenVon(ctx, key);
  const bis = gueltigBis(ctx.jetzt, offene.map((a) => a.dueDate));
  const vorhanden = ctx.links.get(key) ?? null;
  // Gilt ein frueher zugestellter Link nicht mehr? Bei NEUER_LINK sowieso.
  // Ausserdem nach einem gescheiterten "Link erneuern": Dort steht sentAt
  // wieder auf null, lastSentAt aber noch auf dem frueheren Versand — die
  // Abteilung hat eine aeltere Mail, deren Link inzwischen "Ungültiger Link"
  // meldet. Die naechste Mail ("Erneut senden" oder "Abteilungen informieren")
  // schickt den noch nie zugestellten neuen Token und sagt das dazu, statt
  // wie eine Erstmail auszusehen. (sentAt null UND lastSentAt gesetzt gibt es
  // nur nach diesem Fehlschlag — der Fehlerzweig unten sorgt dafuer.)
  const alterLinkUngueltig =
    modus === "NEUER_LINK" || (!!vorhanden && !vorhanden.sentAt && !!vorhanden.lastSentAt);

  let link: OffboardingDepartmentLink;
  if (!vorhanden) {
    // upsert statt create: Zwei Aufrufe in derselben Millisekunde haelt schon
    // die Sperre je Vorgang ab; das upsert ist das Netz darunter (unique
    // offboardingId+departmentKey) und vergibt KEINEN zweiten Token.
    link = await prisma.offboardingDepartmentLink.upsert({
      where: { offboardingId_departmentKey: { offboardingId: ctx.vorgang.id, departmentKey: key } },
      create: {
        offboardingId: ctx.vorgang.id,
        departmentKey: key,
        departmentName: empfaenger.departmentName,
        email: empfaenger.email,
        token: crypto.randomUUID(),
        expiresAt: bis,
      },
      update: {},
    });
  } else if (modus === "NEUER_LINK") {
    // Neuer Token: Der alte Link ist ab jetzt tot. Oeffnungszaehler gehoeren
    // zum alten Link und beginnen neu.
    link = await prisma.offboardingDepartmentLink.update({
      where: { id: vorhanden.id },
      data: {
        token: crypto.randomUUID(),
        expiresAt: bis,
        email: empfaenger.email,
        departmentName: empfaenger.departmentName,
        firstOpenedAt: null,
        lastOpenedAt: null,
        openCount: 0,
      },
    });
  } else {
    link = await prisma.offboardingDepartmentLink.update({
      where: { id: vorhanden.id },
      data: {
        email: empfaenger.email,
        departmentName: empfaenger.departmentName,
        ...(verlaengerungNoetig(vorhanden.expiresAt, bis) ? { expiresAt: bis } : {}),
      },
    });
  }

  const ergebnis = await triggerWebhooks(
    EVENT_ZUGEWIESEN,
    zuweisungsPayload(ctx, link, liste, modus, alterLinkUngueltig),
  );
  const v = versandStatusAusErgebnis(ergebnis, ctx.webhook.zugewiesen);

  // Scheitert die Mail mit einem NEUEN Token, ist der gueltige Link nie
  // angekommen — der alte ist aber schon tot. sentAt zurueck auf null: Die Zeile
  // wird rot ("Versand fehlgeschlagen"), "Erneut senden" schickt eine Erstmail
  // (nicht "Der Link ist unverändert"), und der Cron erinnert nicht mit einem
  // Link, den niemand hat. Geht die Mail durch, bleibt sentAt (erster Versand).
  if (v.erfolgreich) {
    const erfolg = {
      sentAt: link.sentAt ?? ctx.jetzt,
      lastSentAt: ctx.jetzt,
      lastSendStatus: v.status,
      lastSendDetail: v.detail,
      zugestelltAn: v.zugestelltAn,
    };
    link = await ergebnisSpeichern(ctx, link, erfolg, { ...link, ...erfolg });
  } else {
    // Nichts ist hinausgegangen: Ein Fehler hier darf die Anfrage abbrechen
    // (500) — ein zweiter Versuch schickt keine Mail doppelt.
    // Mit NEUEM Token: sentAt null (s. o.), lastSentAt haelt fest, DASS schon
    // einmal ein Link zugestellt wurde — bei Bestandslinks von vor Paket 1b
    // stand dort noch nichts, dann gilt sentAt. Daran erkennt der naechste
    // Versand, dass er den Hinweis "neuer Link" braucht (alterLinkUngueltig).
    link = await prisma.offboardingDepartmentLink.update({
      where: { id: link.id },
      data: {
        lastSendStatus: v.status,
        lastSendDetail: v.detail,
        ...(modus === "NEUER_LINK" ? { sentAt: null, lastSentAt: link.lastSentAt ?? link.sentAt } : {}),
      },
    });
  }
  ctx.links.set(key, link);

  return { eintrag: eintragAusErgebnis(link, v, modus === "NEUER_LINK"), v, link };
}

// =============================================
// Mail "Erinnerung"
// =============================================

function erinnerungsPayload(
  ctx: VersandKontext,
  link: OffboardingDepartmentLink,
  offene: ReadonlyArray<{ title: string; dueDate: Date | null }>,
  stufe: StufenBerechnung,
  level: ErinnerungsStufe,
): Record<string, unknown> {
  const url = abteilungsAufgabenLink(link.token);
  return {
    ...offboardingMailFelder(ctx.vorgang),
    departmentKey: link.departmentKey,
    departmentName: link.departmentName,
    abteilung: link.departmentName,
    email: link.email,
    reminderCount: link.reminderCount + 1,
    expiresAt: link.expiresAt.toISOString(),
    magicLink: url,
    link: url,
    ...stufenMailFelder(stufe, level),
    ...aufgabenlisteMailFelder(offene),
    ist_fuehrungskraft: istFuehrungskraft(link.departmentKey) ? "ja" : "",
  };
}

/**
 * Eine Erinnerung an eine informierte Abteilung (Knopf oder Cron). Der Link
 * wird vorher mit GLEICHEM Token verlaengert, wenn er vor dem neu berechneten
 * "gültig bis" abliefe. Merker lastReminderAt/reminderCount bei SENT, WEBHOOK
 * und SKIPPED, nicht bei FAILED.
 */
async function erinnerungSenden(
  ctx: VersandKontext,
  link: OffboardingDepartmentLink,
  stufe: StufenBerechnung,
  level: ErinnerungsStufe,
): Promise<{ eintrag: BerichtEintrag; v: LinkVersandErgebnis; link: OffboardingDepartmentLink }> {
  const offene = offeneVon(ctx, link.departmentKey);
  const bis = gueltigBis(ctx.jetzt, offene.map((a) => a.dueDate));
  let aktuell = link;
  if (verlaengerungNoetig(link.expiresAt, bis)) {
    aktuell = await prisma.offboardingDepartmentLink.update({ where: { id: link.id }, data: { expiresAt: bis } });
  }

  const ergebnis = await triggerWebhooks(EVENT_ERINNERUNG, erinnerungsPayload(ctx, aktuell, offene, stufe, level));
  const v = versandStatusAusErgebnis(ergebnis, ctx.webhook.erinnerung);

  const merker = erinnerungsMerkerSetzen(v.status);
  const stand = {
    lastSendStatus: v.status,
    lastSendDetail: v.detail,
    ...(v.status === "SENT" ? { zugestelltAn: v.zugestelltAn } : {}),
  };
  if (v.erfolgreich) {
    aktuell = await ergebnisSpeichern(
      ctx,
      aktuell,
      { ...stand, ...(merker ? { lastReminderAt: ctx.jetzt, reminderCount: { increment: 1 } } : {}) },
      {
        ...aktuell,
        ...stand,
        ...(merker ? { lastReminderAt: ctx.jetzt, reminderCount: aktuell.reminderCount + 1 } : {}),
      },
    );
  } else {
    aktuell = await prisma.offboardingDepartmentLink.update({
      where: { id: aktuell.id },
      data: { ...stand, ...(merker ? { lastReminderAt: ctx.jetzt, reminderCount: { increment: 1 } } : {}) },
    });
  }
  ctx.links.set(aktuell.departmentKey, aktuell);
  return { eintrag: eintragAusErgebnis(aktuell, v, false), v, link: aktuell };
}

// =============================================
// Aktionen (POST /api/offboarding/[id]/department-links)
// =============================================

/**
 * Laufende Aktionen je Vorgang. Die Oberflaeche sperrt ihre Knoepfe, aber zwei
 * parallele Aufrufe schrieben sonst zweimal an dieselben Abteilungen. BEWUSST
 * prozesslokal (ein Container), siehe Dateikopf.
 */
const laufendeAbteilungsVersendungen = new Set<string>();

function versandSperreSchluessel(offboardingId: string): string {
  return `OFFBOARDING:${offboardingId}`;
}

/**
 * Sperre je Vorgang nehmen — `false`, wenn schon ein Versand laeuft. Gilt fuer
 * die HR-Aktionen UND den taeglichen Lauf: Sonst erinnerte der Lauf mit einem
 * Token, den "Link erneuern" gerade ersetzt hat, oder eine Abteilung bekaeme
 * zwei Erinnerungen, weil HR waehrend des Laufs "Erinnern" klickt.
 */
function versandSperreNehmen(offboardingId: string): boolean {
  const sperre = versandSperreSchluessel(offboardingId);
  if (laufendeAbteilungsVersendungen.has(sperre)) return false;
  laufendeAbteilungsVersendungen.add(sperre);
  return true;
}

function versandSperreFreigeben(offboardingId: string): void {
  laufendeAbteilungsVersendungen.delete(versandSperreSchluessel(offboardingId));
}

async function informieren(ctx: VersandKontext, userId: string): Promise<VersandBericht> {
  const bericht: VersandBericht = { aktion: "informieren", versendet: [], uebersprungen: [] };
  let versucht = false;
  const schluessel = abteilungsReihenfolge(
    ctx.aufgaben.map((a) => a.assigneeDepartment ?? "").filter(istLinkAbteilung),
  );
  for (const key of schluessel) {
    const offene = offeneVon(ctx, key);
    const link = ctx.links.get(key) ?? null;
    const empfaenger = empfaengerFuer(ctx, key);
    const entscheidung = versandEntscheidung({ offeneAufgaben: offene.length, link, empfaenger });
    const name = link?.departmentName || empfaenger.departmentName;
    if (!entscheidung.senden) {
      bericht.uebersprungen.push(
        uebersprungen(key, name, link?.email ?? (empfaenger.ok ? empfaenger.email : null), entscheidung.grund),
      );
      continue;
    }
    if (!empfaenger.ok) continue; // von versandEntscheidung schon abgefangen; hilft nur dem Typ
    const { eintrag } = await zuweisungSenden(ctx, key, empfaenger, "ERSTMAIL");
    (eintrag.status ? bericht.versendet : bericht.uebersprungen).push(eintrag);
    versucht = true;
  }
  // Protokoll nur, wenn wirklich eine Mail versucht wurde — ein Klick, bei dem
  // alle schon informiert waren, ist kein "Abteilungen informiert".
  if (versucht) {
    await protokollieren(ctx.vorgang.id, userId, ABTEILUNGS_AUDIT.INFORMIERT, {
      versendet: bericht.versendet.map((e) => ({ departmentKey: e.departmentKey, email: e.email, status: e.status })),
      uebersprungen: bericht.uebersprungen.map((e) => ({ departmentKey: e.departmentKey, grund: e.grund })),
    });
  }
  return bericht;
}

/** Gemeinsame Vorpruefung fuer Erneut senden und Erinnern. */
function einzelPruefung(
  ctx: VersandKontext,
  key: string,
  aktion: AbteilungsAktion,
): { link: OffboardingDepartmentLink; empfaenger: Extract<Empfaenger, { ok: true }> } | BerichtEintrag {
  const link = ctx.links.get(key) ?? null;
  const empfaenger = empfaengerFuer(ctx, key);
  const name = link?.departmentName || empfaenger.departmentName;
  const email = link?.email ?? (empfaenger.ok ? empfaenger.email : null);

  if (!link || (aktion === "erinnern" && !link.sentAt)) {
    return uebersprungen(key, name, email, "NICHT_INFORMIERT");
  }
  // Auch fuer "Link erneuern": Die neue Mail heisst "Aufgaben zugewiesen" —
  // bei einer fertigen Abteilung listete sie nur laengst erledigte Aufgaben
  // (oder, wenn alle umgehaengt sind, gar keine). Die Karte bietet die Aktion
  // dort nicht an (abteilungsZeilenBauen); das hier ist das Netz darunter.
  if (link.allTasksComplete || offeneVon(ctx, key).length === 0) {
    return uebersprungen(key, name, email, "ALLES_ERLEDIGT");
  }
  // Die Sperrzeit gilt nicht fuer "Link erneuern" — das ist eine bewusste
  // Entscheidung mit Rueckfrage, etwa weil ein Link in falsche Haende geriet.
  if (aktion !== "link-erneuern" && sperrzeitBis(link, ctx.jetzt)) {
    return uebersprungen(key, name, email, "SPERRZEIT");
  }
  if (!empfaenger.ok) return uebersprungen(key, name, email, empfaenger.grund);
  return { link, empfaenger };
}

async function erneutSenden(ctx: VersandKontext, key: string, userId: string): Promise<VersandBericht> {
  const bericht: VersandBericht = { aktion: "erneut-senden", versendet: [], uebersprungen: [] };
  const pruefung = einzelPruefung(ctx, key, "erneut-senden");
  if (!("link" in pruefung)) {
    bericht.uebersprungen.push(pruefung);
    return bericht;
  }
  const { link, empfaenger } = pruefung;
  // Nie zugestellt → fuer die Empfaengerin ist es die erste Mail. Zugestellt
  // und Adresse geaendert → neuer Token, damit die alte Adresse nichts mehr sieht.
  const adresseNeu = !!link.sentAt && !adresseGleich(link.email, empfaenger.email);
  const modus: ZuweisungsModus = !link.sentAt ? "ERSTMAIL" : adresseNeu ? "NEUER_LINK" : "ERNEUT";
  const alteAdresse = link.email;
  const { eintrag, v } = await zuweisungSenden(ctx, key, empfaenger, modus);
  (eintrag.status ? bericht.versendet : bericht.uebersprungen).push(eintrag);

  if (adresseNeu) {
    await protokollieren(ctx.vorgang.id, userId, ABTEILUNGS_AUDIT.LINK_ERNEUERT, {
      departmentKey: key,
      grund: "ADRESSE_GEAENDERT",
      ausloeser: "erneut-senden",
      emailAlt: alteAdresse,
      emailNeu: empfaenger.email,
      status: v.status,
    });
  }
  await protokollieren(ctx.vorgang.id, userId, ABTEILUNGS_AUDIT.ERNEUT_GESENDET, {
    departmentKey: key,
    email: empfaenger.email,
    status: v.status,
    neuerLink: adresseNeu,
  });
  return bericht;
}

async function erinnern(ctx: VersandKontext, key: string, userId: string): Promise<VersandBericht> {
  const bericht: VersandBericht = { aktion: "erinnern", versendet: [], uebersprungen: [] };
  const pruefung = einzelPruefung(ctx, key, "erinnern");
  if (!("link" in pruefung)) {
    bericht.uebersprungen.push(pruefung);
    return bericht;
  }
  const { link, empfaenger } = pruefung;

  // Adresse geaendert: Die neue Adresse hat die Erstmail nie bekommen. Statt
  // einer "Erinnerung" geht an sie die Zuweisung mit NEUEM Link (ausdrueckliche
  // HR-Aktion, deshalb hier erlaubt — der Cron tut das nie).
  if (!adresseGleich(link.email, empfaenger.email)) {
    const alteAdresse = link.email;
    const { eintrag, v } = await zuweisungSenden(ctx, key, empfaenger, "NEUER_LINK");
    (eintrag.status ? bericht.versendet : bericht.uebersprungen).push(eintrag);
    await protokollieren(ctx.vorgang.id, userId, ABTEILUNGS_AUDIT.LINK_ERNEUERT, {
      departmentKey: key,
      grund: "ADRESSE_GEAENDERT",
      ausloeser: "erinnern",
      emailAlt: alteAdresse,
      emailNeu: empfaenger.email,
      status: v.status,
    });
    return bericht;
  }

  // Der Knopf ist eine ausdrueckliche HR-Aktion: Stufe wie im Cron berechnet,
  // aber ohne Mindestabstand und ohne 30-Tage-Ende (nur die Sperrzeit gilt).
  const stufe = stufeBerechnen(offeneVon(ctx, key), ctx.jetzt);
  const level: ErinnerungsStufe = stufe.level ?? "INFO";
  const { eintrag, v, link: aktuell } = await erinnerungSenden(ctx, link, stufe, level);
  (eintrag.status ? bericht.versendet : bericht.uebersprungen).push(eintrag);
  await protokollieren(ctx.vorgang.id, userId, ABTEILUNGS_AUDIT.ERINNERT_KNOPF, {
    departmentKey: key,
    email: aktuell.email,
    level,
    status: v.status,
    reminderCount: aktuell.reminderCount,
  });
  return bericht;
}

async function linkErneuern(ctx: VersandKontext, key: string, userId: string): Promise<VersandBericht> {
  const bericht: VersandBericht = { aktion: "link-erneuern", versendet: [], uebersprungen: [] };
  const pruefung = einzelPruefung(ctx, key, "link-erneuern");
  if (!("link" in pruefung)) {
    bericht.uebersprungen.push(pruefung);
    return bericht;
  }
  const { link, empfaenger } = pruefung;
  const alteAdresse = link.email;
  const { eintrag, v } = await zuweisungSenden(ctx, key, empfaenger, "NEUER_LINK");
  (eintrag.status ? bericht.versendet : bericht.uebersprungen).push(eintrag);
  await protokollieren(ctx.vorgang.id, userId, ABTEILUNGS_AUDIT.LINK_ERNEUERT, {
    departmentKey: key,
    grund: "HR",
    ausloeser: "link-erneuern",
    emailAlt: alteAdresse,
    emailNeu: empfaenger.email,
    status: v.status,
  });
  return bericht;
}

/**
 * POST /api/offboarding/[id]/department-links.
 *
 * `rohBody`: das geparste JSON oder `undefined` bei leerem Body (= informieren).
 * Kaputtes JSON faengt die Route vorher ab (400 "Ungültige Eingabe").
 *
 * Antworten:
 *   403 { error: "Keine Berechtigung" }                      Rolle nicht HR_EDIT_ROLES
 *   400 { error }                                            Aktion/Schluessel ungueltig
 *   404 { error: "Offboarding-Vorgang nicht gefunden" }      unbekannt ODER fremder Mandant
 *   409 { error, grund: "VORGANG_ABGESCHLOSSEN" }            COMPLETED/CANCELLED
 *   409 { error: "Der Versand läuft bereits." }              Sperre je Vorgang
 *   201 | 409 | 502 { data: VersandBericht, meldung, hinweis, error? }
 *       (httpStatusAusBericht; `error` = meldung nur bei 409/502)
 */
export async function abteilungsAktionAusfuehren(opts: {
  offboardingId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!HR_EDIT_ROLES.includes(opts.session.role)) {
    return { status: 403, body: { error: "Keine Berechtigung" } };
  }
  const parsed = abteilungsAktionSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const aktion = parsed.data;

  const vorgang = await prisma.offboardingProcess.findUnique({
    where: { id: opts.offboardingId },
    select: VORGANG_AUSWAHL,
  });
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return { status: 404, body: { error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN } };
  }
  if (vorgangBeendet(vorgang.status)) {
    return {
      status: 409,
      body: {
        error: vorgang.status === "CANCELLED" ? MELDUNGEN.HR_VORGANG_ABGEBROCHEN : MELDUNGEN.HR_VORGANG_ABGESCHLOSSEN,
        grund: "VORGANG_ABGESCHLOSSEN",
      },
    };
  }

  if (!versandSperreNehmen(vorgang.id)) {
    return { status: 409, body: { error: MELDUNGEN.VERSAND_LAEUFT } };
  }
  try {
    const ctx = await versandKontextLaden(vorgang, jetzt);
    const userId = opts.session.userId;
    const bericht: VersandBericht =
      aktion.aktion === "informieren"
        ? await informieren(ctx, userId)
        : aktion.aktion === "erneut-senden"
          ? await erneutSenden(ctx, aktion.departmentKey, userId)
          : aktion.aktion === "erinnern"
            ? await erinnern(ctx, aktion.departmentKey, userId)
            : await linkErneuern(ctx, aktion.departmentKey, userId);
    const status = httpStatusAusBericht(bericht);
    const { meldung, hinweis } = berichtMeldung(bericht);
    // Versendet, aber nicht gespeichert: Die Warnung steht VOR dem uebrigen
    // Hinweis — sie entscheidet, ob HR gleich noch einmal klickt.
    const warnung = ctx.warnungen.length > 0 ? meldungNachweisFehlt(ctx.warnungen) : null;
    const hinweisGesamt = [warnung, hinweis].filter((t): t is string => !!t).join(" ") || null;
    return {
      status,
      body: { data: bericht, meldung, hinweis: hinweisGesamt, ...(status >= 400 ? { error: meldung } : {}) },
    };
  } finally {
    // Genau eine Freigabestelle — kein Rueckgabepfad darf die Sperre stehen lassen.
    versandSperreFreigeben(vorgang.id);
  }
}

// =============================================
// Uebersicht fuer GET /api/offboarding/[id]
// =============================================

export interface UebersichtVorgang extends FuehrungskraftQuellen {
  id: string;
  organizationId: string;
  status: string;
  lastWorkingDay: Date;
  checklistItems: ReadonlyArray<{
    assigneeDepartment: string | null;
    isCompleted: boolean;
    dueDate: Date | null;
    completedById: string | null;
  }>;
  departmentLinks: ReadonlyArray<OffboardingDepartmentLink>;
}

export interface AbteilungsUebersicht<I, L> {
  /** Die Link-Zeilen wie bisher, dazu `url` (vom Server, APP_URL) und `anzeige`. */
  departmentLinks: Array<L & { url: string; anzeige: Anzeige }>;
  /** Die Aufgaben wie bisher, dazu `erledigtVon` (Portal + Name bzw. Link + Abteilung). */
  checklistItems: Array<I & { erledigtVon: ErledigtVon }>;
  abteilungen: {
    zeilen: AbteilungsZeile[];
    /** So viele Zeilen wuerde "Abteilungen informieren" jetzt anschreiben. */
    informierbar: number;
    niemandInformiert: boolean;
    vorgangAbgeschlossen: boolean;
    /** Letzter Arbeitstag (ISO) — Bezug der Faelligkeiten. */
    bezugsdatum: string;
  };
  fuehrungskraft: Fuehrungskraft;
}

/**
 * Reichert den Vorgang fuer die Detailseite an. Der Aufrufer laedt den Vorgang
 * mit `checklistItems`, `departmentLinks`, `supervisorEmail/Name`,
 * `zeugnisBewertung { supervisorEmail, supervisorName }` und
 * `contractEnd { supervisorEmail }` und spreizt das Ergebnis darueber:
 * `{ ...vorgang, ...(await abteilungsUebersichtLaden(vorgang)) }`.
 */
export async function abteilungsUebersichtLaden<
  I extends UebersichtVorgang["checklistItems"][number],
  L extends OffboardingDepartmentLink,
>(
  vorgang: Omit<UebersichtVorgang, "checklistItems" | "departmentLinks"> & {
    checklistItems: ReadonlyArray<I>;
    departmentLinks: ReadonlyArray<L>;
  },
  jetzt: Date = new Date(),
): Promise<AbteilungsUebersicht<I, L>> {
  const benutzerIds = [
    ...new Set(vorgang.checklistItems.map((i) => i.completedById).filter((id): id is string => !!id)),
  ];
  const [konfigs, benutzer] = await Promise.all([
    konfigsLaden(),
    benutzerIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: benutzerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve([] as { id: string; firstName: string; lastName: string }[]),
  ]);

  const fuehrungskraft = fuehrungskraftErmitteln(vorgang);
  const abgeschlossen = vorgangBeendet(vorgang.status);
  const { zeilen, informierbar, niemandInformiert } = abteilungsZeilenBauen({
    aufgaben: vorgang.checklistItems,
    links: vorgang.departmentLinks,
    konfigs,
    organizationId: vorgang.organizationId,
    fuehrungskraft,
    vorgangAbgeschlossen: abgeschlossen,
    linkUrl: abteilungsAufgabenLink,
    jetzt,
  });

  const benutzerNamen = Object.fromEntries(
    benutzer.map((b) => [b.id, `${b.firstName} ${b.lastName}`.trim()]),
  );
  const abteilungsNamen = Object.fromEntries(zeilen.map((z) => [z.departmentKey, z.departmentName]));

  return {
    departmentLinks: vorgang.departmentLinks.map((l) => ({
      ...l,
      url: abteilungsAufgabenLink(l.token),
      anzeige: linkAnzeige(l, jetzt),
    })),
    checklistItems: vorgang.checklistItems.map((i) => ({
      ...i,
      erledigtVon: erledigtVonBestimmen(i, { benutzer: benutzerNamen, abteilungen: abteilungsNamen }),
    })),
    abteilungen: {
      zeilen,
      informierbar,
      niemandInformiert,
      vorgangAbgeschlossen: abgeschlossen,
      bezugsdatum: vorgang.lastWorkingDay.toISOString(),
    },
    fuehrungskraft,
  };
}

// =============================================
// Taeglicher Lauf (POST /api/cron/offboarding-reminders)
// =============================================

export interface CronDetail {
  offboardingId: string;
  displayId: string;
  departmentKey: string;
  departmentName: string;
  email: string;
  level: ErinnerungsStufe;
  overdueItems: number;
  upcomingItems: number;
  /** SENT | WEBHOOK | SKIPPED | FAILED */
  status: string;
}

export interface CronUebersprungen {
  offboardingId: string;
  displayId: string;
  departmentKey: string;
  grund: Grund;
  detail: string;
}

export interface CronErgebnis {
  /** Erinnerungen, die hinausgingen (SENT oder an Webhook uebergeben). */
  remindersProcessed: number;
  /** Ausnahmen je Link (der Lauf macht trotzdem weiter). */
  errors: number;
  /** Jeder Versandversuch mit Ergebnis. */
  details: CronDetail[];
  /** Faellig, aber bewusst nicht versendet (Adresse geaendert, keine Adresse …). */
  uebersprungen: CronUebersprungen[];
}

/**
 * Erinnert alle informierten Abteilungen mit offenen Aufgaben, deren Stufe
 * heute faellig ist (erinnerungsStufe). Nie an nicht informierte Links, nie
 * bei COMPLETED/CANCELLED, nie laenger als 30 Tage nach der spaetesten
 * offenen Faelligkeit.
 *
 * Die Adresse wird bei jedem Lauf neu aufgeloest. Weicht sie von der des Links
 * ab, erzeugt der Lauf NIE still einen neuen Link — er ueberspringt mit
 * "Adresse geändert, bitte Link erneuern" und vermerkt das am Link (die Karte
 * zeigt es). Merkerregel: SENT/WEBHOOK/SKIPPED ja, FAILED nein.
 *
 * Je Vorgang nimmt der Lauf dieselbe Sperre wie die HR-Aktionen und liest
 * Vorgang, Links und Aufgaben erst DANN frisch. Laeuft gerade eine HR-Aktion
 * fuer den Vorgang, bleibt er heute aus (die Aktion schreibt ohnehin an; eine
 * faellige Erinnerung holt der naechste Lauf nach).
 */
export async function erinnerungenSenden(jetzt: Date = new Date()): Promise<CronErgebnis> {
  const ergebnis: CronErgebnis = { remindersProcessed: 0, errors: 0, details: [], uebersprungen: [] };

  // Nur die Kandidaten — den Stand liest vorgangErinnern unter der Sperre.
  const kandidaten = await prisma.offboardingProcess.findMany({
    where: {
      status: { notIn: [...OFFBOARDING_ENDSTATUS] },
      departmentLinks: { some: { sentAt: { not: null }, allTasksComplete: false } },
    },
    select: { id: true, displayId: true },
  });
  if (kandidaten.length === 0) return ergebnis;

  const [konfigs, erinnerungsWebhook] = await Promise.all([konfigsLaden(), webhookAktiv(EVENT_ERINNERUNG)]);

  for (const kandidat of kandidaten) {
    if (!versandSperreNehmen(kandidat.id)) {
      console.info(
        `[Offboarding-Reminders] ${kandidat.displayId} uebersprungen: Fuer den Vorgang laeuft gerade ein Versand aus dem Portal.`,
      );
      continue;
    }
    try {
      await vorgangErinnern(kandidat.id, { konfigs, erinnerungsWebhook, jetzt, ergebnis });
    } catch (err) {
      console.error(
        `[Offboarding-Reminders] Fehler bei ${kandidat.displayId}:`,
        err instanceof Error ? err.message : err,
      );
      ergebnis.errors++;
    } finally {
      versandSperreFreigeben(kandidat.id);
    }
  }
  return ergebnis;
}

/** Ein Vorgang im taeglichen Lauf — nur unter der Sperre je Vorgang aufrufen. */
async function vorgangErinnern(
  offboardingId: string,
  lauf: { konfigs: AbteilungsKonfig[]; erinnerungsWebhook: boolean; jetzt: Date; ergebnis: CronErgebnis },
): Promise<void> {
  const { jetzt, ergebnis } = lauf;
  // Frisch lesen: Der Lauf kann dauern, und HR kann bis eben "Link erneuern",
  // "Erneut senden" oder "Erinnern" gewaehlt haben. Mit dem Stand vom Beginn
  // des Laufs ginge eine Erinnerung mit einem toten Token hinaus, oder ein
  // SKIPPED "Adresse geändert" ueberschriebe ein frisches SENT.
  const [vorgang, departmentLinks, checklistItems] = await Promise.all([
    prisma.offboardingProcess.findUnique({ where: { id: offboardingId }, select: VORGANG_AUSWAHL }),
    prisma.offboardingDepartmentLink.findMany({
      where: { offboardingId, sentAt: { not: null }, allTasksComplete: false },
    }),
    prisma.offboardingChecklistItem.findMany({
      where: { offboardingId, isCompleted: false },
      select: AUFGABEN_AUSWAHL,
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    }),
  ]);
  if (!vorgang || vorgangBeendet(vorgang.status)) return;

  const ctx: VersandKontext = {
    vorgang,
    aufgaben: checklistItems,
    links: new Map(departmentLinks.map((l) => [l.departmentKey, l])),
    konfigs: lauf.konfigs,
    webhook: { zugewiesen: false, erinnerung: lauf.erinnerungsWebhook },
    jetzt,
    warnungen: [],
  };

  for (const link of departmentLinks) {
    try {
      const entscheidung = erinnerungsStufe(link, offeneVon(ctx, link.departmentKey), jetzt);
      if (!entscheidung.erinnern) continue;

      const empfaenger = empfaengerFuer(ctx, link.departmentKey);
      const problem: Grund | null = !empfaenger.ok
        ? empfaenger.grund
        : !adresseGleich(link.email, empfaenger.email)
          ? "ADRESSE_GEAENDERT"
          : null;
      if (problem) {
        const text = grundText(problem);
        // Nur schreiben, wenn sich der Vermerk aendert — sonst stuende jeden
        // Tag derselbe Eintrag neu am Link.
        if (link.lastSendStatus !== "SKIPPED" || link.lastSendDetail !== text) {
          await prisma.offboardingDepartmentLink.update({
            where: { id: link.id },
            data: { lastSendStatus: "SKIPPED", lastSendDetail: text },
          });
        }
        ergebnis.uebersprungen.push({
          offboardingId: vorgang.id,
          displayId: vorgang.displayId,
          departmentKey: link.departmentKey,
          grund: problem,
          detail: text,
        });
        continue;
      }

      const { stufe } = entscheidung;
      const warnungenVorher = ctx.warnungen.length;
      const { v, link: aktuell } = await erinnerungSenden(ctx, link, stufe, stufe.level);
      await protokollieren(vorgang.id, null, ABTEILUNGS_AUDIT.ERINNERT_CRON, {
        level: stufe.level,
        departmentKey: aktuell.departmentKey,
        departmentName: aktuell.departmentName,
        email: aktuell.email,
        overdueItems: stufe.overdueItems,
        upcomingItems: stufe.upcomingItems,
        reminderCount: aktuell.reminderCount,
        status: v.status,
      });
      if (v.erfolgreich) ergebnis.remindersProcessed++;
      // Versendet, aber der Merker ist nicht gespeichert (Datenbankfehler nach
      // dem Versand): zaehlt als Fehler, damit der Lauf in n8n auffaellt —
      // morgen koennte dieselbe Erinnerung noch einmal hinausgehen.
      if (ctx.warnungen.length > warnungenVorher) ergebnis.errors++;
      ergebnis.details.push({
        offboardingId: vorgang.id,
        displayId: vorgang.displayId,
        departmentKey: aktuell.departmentKey,
        departmentName: aktuell.departmentName,
        email: aktuell.email,
        level: stufe.level,
        overdueItems: stufe.overdueItems,
        upcomingItems: stufe.upcomingItems,
        status: v.status,
      });
    } catch (err) {
      console.error(
        `[Offboarding-Reminders] Fehler bei ${vorgang.displayId} / ${link.departmentKey}:`,
        err instanceof Error ? err.message : err,
      );
      ergebnis.errors++;
    }
  }
}

// =============================================
// Neuer letzter Arbeitstag (PATCH /api/offboarding/[id])
// =============================================

/**
 * Sperrt die Zeile des Vorgangs bis zum Ende der Transaktion (UPDATE auf
 * updatedAt, wie linksSperren) und liest DANACH den gespeicherten letzten
 * Arbeitstag. `null`, wenn es den Vorgang nicht (mehr) gibt.
 *
 * Warum nicht den Wert von vor der Transaktion nehmen: Kommen zwei PATCHes mit
 * demselben neuen Tag gleichzeitig (Doppel-Enter, zwei HR-Konten), laesen
 * beide noch den alten Tag — der zweite verschoebe die schon verschobenen
 * Faelligkeiten ein zweites Mal (+60 statt +30 Tage, still und dauerhaft). So
 * wartet der zweite an der Sperre, liest den neuen Tag und verschiebt um 0.
 */
export async function letztenArbeitstagSperren(
  tx: Prisma.TransactionClient,
  offboardingId: string,
): Promise<Date | null> {
  const gesperrt = await tx.offboardingProcess.updateMany({
    where: { id: offboardingId },
    data: { updatedAt: new Date() },
  });
  if (gesperrt.count === 0) return null;
  const stand = await tx.offboardingProcess.findUnique({
    where: { id: offboardingId },
    select: { lastWorkingDay: true },
  });
  return stand?.lastWorkingDay ?? null;
}

/**
 * Verschiebt die Faelligkeiten aller OFFENEN Aufgaben um dieselbe Spanne wie
 * den letzten Arbeitstag und verlaengert danach Links, deren Gueltigkeit vor
 * dem neuen "gültig bis" endete (gleicher Token) — nur bei laufendem Vorgang.
 * Erledigte Aufgaben bleiben.
 *
 * In DERSELBEN Transaktion wie das Speichern des neuen Tages aufrufen, `alt`
 * dort unter der Sperre lesen (letztenArbeitstagSperren):
 *   await prisma.$transaction(async (tx) => {
 *     const alt = await letztenArbeitstagSperren(tx, id);
 *     await tx.offboardingProcess.update({ … lastWorkingDay: neu … });
 *     const f = await faelligkeitenVerschieben(tx, id, alt, neu);
 *     // f.verschoben ins AuditLog (details.faelligkeitenVerschoben)
 *   });
 */
export async function faelligkeitenVerschieben(
  tx: Prisma.TransactionClient,
  offboardingId: string,
  alt: Date,
  neu: Date,
  jetzt: Date = new Date(),
): Promise<{ verschoben: number; verlaengert: number }> {
  if (Number.isNaN(alt.getTime()) || Number.isNaN(neu.getTime())) {
    // Die Route prueft das Datum vorher (400); hier nur das Netz, damit nie
    // "Invalid Date" in die Faelligkeiten geschrieben wird.
    throw new Error("faelligkeitenVerschieben: ungueltiges Datum");
  }
  if (alt.getTime() === neu.getTime()) return { verschoben: 0, verlaengert: 0 };

  // Sperr-Reihenfolge wie beim Abhaken (abteilungsaufgaben-uebergaenge.ts):
  // ERST alle Links des Vorgangs, DANN die Aufgaben. Andersherum koennte ein
  // gleichzeitiges Abhaken ueber den Link (sperrt Link, dann Aufgabe) mit
  // diesem Lauf verklemmen.
  const alleLinks = await tx.offboardingDepartmentLink.findMany({
    where: { offboardingId },
    select: { departmentKey: true },
  });
  await linksSperren(
    tx,
    offboardingId,
    alleLinks.map((l) => l.departmentKey),
  );

  const offene = await tx.offboardingChecklistItem.findMany({
    where: { offboardingId, isCompleted: false, dueDate: { not: null } },
    select: { id: true, dueDate: true, assigneeDepartment: true },
  });
  const neueFaelligkeiten = new Map<string, Date[]>();
  for (const aufgabe of offene) {
    const faellig = faelligkeitVerschoben(aufgabe.dueDate as Date, alt, neu);
    await tx.offboardingChecklistItem.update({ where: { id: aufgabe.id }, data: { dueDate: faellig } });
    if (aufgabe.assigneeDepartment) {
      const liste = neueFaelligkeiten.get(aufgabe.assigneeDepartment) ?? [];
      liste.push(faellig);
      neueFaelligkeiten.set(aufgabe.assigneeDepartment, liste);
    }
  }

  // Nur Links der Abteilungen, deren Faelligkeiten sich verschoben haben —
  // und nur bei laufendem Vorgang. Nach Abschluss zeigt der Link nur noch eine
  // Lese-Seite mit Name, Vorgangsnummer und Aufgaben (ohne Anmeldung); sie
  // darf nicht allein durch ein korrigiertes Datum laenger offen bleiben. Der
  // Status wird in DERSELBEN Transaktion gelesen, also nach einem Statuswechsel
  // im selben PATCH.
  const stand = await tx.offboardingProcess.findUnique({
    where: { id: offboardingId },
    select: { status: true },
  });
  let verlaengert = 0;
  const betroffen = stand && !vorgangBeendet(stand.status) ? [...neueFaelligkeiten.keys()] : [];
  const links =
    betroffen.length > 0
      ? await tx.offboardingDepartmentLink.findMany({
          where: { offboardingId, allTasksComplete: false, departmentKey: { in: betroffen } },
          select: { id: true, departmentKey: true, expiresAt: true },
        })
      : [];
  for (const link of links) {
    const bis = gueltigBis(jetzt, neueFaelligkeiten.get(link.departmentKey) ?? []);
    if (verlaengerungNoetig(link.expiresAt, bis)) {
      await tx.offboardingDepartmentLink.update({ where: { id: link.id }, data: { expiresAt: bis } });
      verlaengert++;
    }
  }
  return { verschoben: offene.length, verlaengert };
}
