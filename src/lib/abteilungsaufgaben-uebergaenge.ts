/**
 * CREDO HR-Portal – Abteilungsaufgaben: Abhaken, Kommentar und
 * Abteilungsstatus (Datenbankteil, nur Server) — Offboarding (Paket 1b) und
 * Onboarding (Paket 5)
 *
 * Zwei Wege aendern eine Aufgabe:
 *   - die Abteilung ueber ihren Link (oeffentlich, ohne Anmeldung):
 *       GET   /api/offboarding-tasks/[token]          → oeffentlicheAufgabenLaden
 *       PATCH /api/offboarding-tasks/[token]/[itemId] → oeffentlicheAufgabeAendern
 *       GET   /api/onboarding-tasks/[token]           → oeffentlicheOnboardingAufgabenLaden
 *       PATCH /api/onboarding-tasks/[token]/[itemId]  → oeffentlicheOnboardingAufgabeAendern
 *   - HR im Portal:
 *       PATCH /api/offboarding/[id]/checklist/[itemId] → aufgabeImPortalAendern
 *       PATCH /api/onboarding/[id]/checklist/[itemId]  → onboardingAufgabeImPortalAendern
 *
 * EINE Link-Tabelle fuer beide Module (OffboardingDepartmentLink mit
 * offboardingId ODER onboardingId, siehe prisma/schema.prisma). Welche
 * Aufgabentabelle dazugehoert, sagt der `LinkBereich` (Modul + Vorgang):
 * OffboardingChecklistItem.assigneeDepartment bzw. ChecklistItem.assignee. Ein
 * Token des einen Moduls ist auf der Seite des anderen ein „Ungültiger Link".
 *
 * WARUM ERST SPERREN, DANN ZAEHLEN, DANN BEDINGT SETZEN. Hakt eine Abteilung
 * ihre letzten beiden Aufgaben in derselben Sekunde ab, liest jeder PATCH die
 * jeweils andere Aufgabe noch als offen — keiner setzte "Abteilung fertig",
 * und die Bestaetigung kaeme nie. Deshalb sperrt jede Transaktion ZUERST die
 * Link-Zeile (UPDATE, haelt bis zum Commit), aendert dann die Aufgabe, zaehlt
 * danach die offenen Aufgaben und setzt den Abteilungsstatus bedingt
 * (updateMany WHERE allTasksComplete = alter Wert). Der zweite PATCH wartet an
 * der Sperre; sein Zaehlen beginnt erst nach dem Commit des ersten und sieht
 * dessen Haken (READ COMMITTED). Wer zuletzt committet, setzt "fertig" — genau
 * einmal. Reihenfolge der Sperren immer: Links (nach Schluessel sortiert),
 * dann Aufgaben — alle Wege gleich (Link, Portal, faelligkeitenVerschieben und
 * faelligkeitenSetzen), sonst droht eine Verklemmung. Nach der Sperre prueft
 * der Link-Weg erneut, ob die Aufgabe noch seiner Abteilung gehoert (HR kann
 * sie in der Zwischenzeit umgehaengt haben).
 * Wie bei statusAbgleichen (onboarding-status-abgleich.ts) ist die
 * Aufrufreihenfolge mit Mocks getestet, nicht das Sperrverhalten von Postgres.
 *
 * Mails gehen NACH dem Commit hinaus und nur bei einem echten Wechsel:
 *   - *-task-completed (an HR, An-Feld in der Vorlage): Aufgabe offen →
 *     erledigt ueber den Link. Im Offboarding-Portal nur fuer Aufgaben einer
 *     Link-Abteilung (das eigene Haekchen einer HR-Aufgabe meldet HR nicht an
 *     sich selbst); im Onboarding-Portal NIE (Entscheidung Paket 5).
 *   - *-department-completed (an die Abteilung): Abteilung offen → fertig, nur
 *     ueber den Link (hakt HR im Portal ab, bestaetigt HR nichts).
 * Nur-Kommentar-Aenderungen loesen keine Mail aus.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { offboardingMailFelder } from "@/lib/offboarding-mail";
import { onboardingAbteilungsMailFelder } from "@/lib/onboarding-abteilung-mail";
import { mitarbeiterName } from "@/lib/onboarding-spuren";
import { canAccessProcess, CHECKLIST_ROLES, type SessionPayload } from "@/lib/permissions";
import { createRateLimiter } from "@/lib/rate-limit";
import { abteilungLabel } from "@/lib/constants";
import {
  ABTEILUNGS_AUDIT,
  MELDUNGEN,
  abteilungsSchluesselBekannt,
  erledigtVonBestimmen,
  istFuehrungskraft,
  istLinkAbteilung,
  kommentarMailFelder,
  meldungUnbekannteZustaendigkeit,
  zusatzWerte,
  type AbteilungsModul,
  type DienstAntwort,
  type ZusatzFeld,
} from "@/lib/abteilungsaufgaben";
import {
  aufgabeLinkPatchSchema,
  onboardingPortalAufgabePatchSchema,
  portalAufgabePatchSchema,
} from "@/lib/validations/abteilungsaufgaben";

// =============================================
// Anfragebremse je Link
// =============================================

/**
 * Zweite Bremse fuer PATCH ueber den Link — NACH der Tokenpruefung, Schluessel
 * ist die Link-ID. Die IP-Bremse (tokenRateLimiter, 20/min, gemeinsam fuer alle
 * Token-Routen) bleibt davor unveraendert: Ein Schluessel aus IP und Token
 * gaebe jedem geratenen Token einen eigenen Zaehler und schwaechte damit den
 * Schutz gegen Durchprobieren. 60/min je Link reicht fuer eine ganze Liste.
 * Gilt fuer beide Module (die Link-ID ist tabellenweit eindeutig).
 */
export const linkAenderungsLimiter = createRateLimiter("abteilungsaufgaben-link", {
  maxRequests: 60,
  windowMs: 60 * 1000,
});

// =============================================
// Link-Bereich: welches Modul, welcher Vorgang
// =============================================

/** Ein Vorgang eines Moduls — bestimmt Link-Spalte und Aufgabentabelle. */
export interface LinkBereich {
  modul: AbteilungsModul;
  vorgangId: string;
}

/** WHERE-Teil fuer die Links eines Vorgangs (offboardingId bzw. onboardingId). */
export function linkBereichWhere(b: LinkBereich): { offboardingId: string } | { onboardingId: string } {
  return b.modul === "OFFBOARDING" ? { offboardingId: b.vorgangId } : { onboardingId: b.vorgangId };
}

/** Eindeutiger Schluessel eines Links: Vorgang + Abteilung (je Modul ein @@unique). */
export function linkEindeutig(
  b: LinkBereich,
  departmentKey: string,
): Prisma.OffboardingDepartmentLinkWhereUniqueInput {
  return b.modul === "OFFBOARDING"
    ? { offboardingId_departmentKey: { offboardingId: b.vorgangId, departmentKey } }
    : { onboardingId_departmentKey: { onboardingId: b.vorgangId, departmentKey } };
}

/** Bezug eines Protokolleintrags: Vorgangs-ID und processType des Moduls. */
export function auditBezug(
  b: LinkBereich,
): { offboardingId: string; processType: "OFFBOARDING" } | { onboardingId: string; processType: "ONBOARDING" } {
  return b.modul === "OFFBOARDING"
    ? { offboardingId: b.vorgangId, processType: "OFFBOARDING" }
    : { onboardingId: b.vorgangId, processType: "ONBOARDING" };
}

// =============================================
// Aufgabentabelle je Modul (klein, ausdruecklich verzweigt)
// =============================================

/** Aufgaben einer Abteilung zaehlen (alle bzw. nur offene). */
async function aufgabenZaehlen(
  tx: Prisma.TransactionClient,
  b: LinkBereich,
  departmentKey: string,
  nurOffen: boolean,
): Promise<number> {
  const offen = nurOffen ? { isCompleted: false } : {};
  return b.modul === "OFFBOARDING"
    ? tx.offboardingChecklistItem.count({
        where: { offboardingId: b.vorgangId, assigneeDepartment: departmentKey, ...offen },
      })
    : tx.checklistItem.count({ where: { onboardingId: b.vorgangId, assignee: departmentKey, ...offen } });
}

/** Offene Aufgaben im ganzen Vorgang (Mail an HR: „Noch offen im Vorgang"). */
async function offeneImVorgang(b: LinkBereich): Promise<number> {
  return b.modul === "OFFBOARDING"
    ? prisma.offboardingChecklistItem.count({ where: { offboardingId: b.vorgangId, isCompleted: false } })
    : prisma.checklistItem.count({ where: { onboardingId: b.vorgangId, isCompleted: false } });
}

/** Zustaendigkeit einer Aufgabe (null, wenn es sie nicht gibt). */
async function aufgabenZustaendigkeit(
  tx: Prisma.TransactionClient,
  modul: AbteilungsModul,
  itemId: string,
): Promise<{ vorhanden: boolean; departmentKey: string | null }> {
  if (modul === "OFFBOARDING") {
    const a = await tx.offboardingChecklistItem.findUnique({
      where: { id: itemId },
      select: { assigneeDepartment: true },
    });
    return { vorhanden: !!a, departmentKey: a?.assigneeDepartment ?? null };
  }
  const a = await tx.checklistItem.findUnique({ where: { id: itemId }, select: { assignee: true } });
  return { vorhanden: !!a, departmentKey: a?.assignee ?? null };
}

// =============================================
// Transaktionsbausteine
// =============================================

export type LinkUebergangArt = "FERTIG" | "WIEDER_OFFEN";

export interface LinkUebergang {
  departmentKey: string;
  linkId: string;
  uebergang: LinkUebergangArt | null;
  email: string;
  departmentName: string;
  completedAt: Date | null;
  /** Aufgaben der Abteilung (gesamt) nach der Aenderung. */
  gesamt: number;
  offen: number;
}

function linkSchluesselSortiert(schluessel: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(schluessel.filter((k): k is string => istLinkAbteilung(k)))].sort();
}

/**
 * Sperrt die Link-Zeilen dieser Schluessel bis zum Ende der Transaktion
 * (UPDATE auf updatedAt). Sortiert, damit zwei Transaktionen dieselben Zeilen
 * immer in derselben Reihenfolge sperren. Schluessel ohne Link: nichts zu tun.
 * Mehrfaches Sperren derselben Zeile in einer Transaktion ist harmlos.
 */
export async function linksSperrenIn(
  tx: Prisma.TransactionClient,
  b: LinkBereich,
  schluessel: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  for (const key of linkSchluesselSortiert(schluessel)) {
    await tx.offboardingDepartmentLink.updateMany({
      where: { ...linkBereichWhere(b), departmentKey: key },
      data: { updatedAt: new Date() },
    });
  }
}

/** Offboarding-Fassung von linksSperrenIn (Paket 1b, unveraenderte Signatur). */
export async function linksSperren(
  tx: Prisma.TransactionClient,
  offboardingId: string,
  schluessel: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  await linksSperrenIn(tx, { modul: "OFFBOARDING", vorgangId: offboardingId }, schluessel);
}

/**
 * Berechnet den Abteilungsstatus der Links dieser Schluessel neu — INNERHALB
 * der Transaktion, NACH der Aenderung der Aufgabe. Sperrt selbst (siehe oben),
 * zaehlt die offenen Aufgaben und setzt bedingt:
 *   offen = 0  → allTasksComplete false → true, completedAt = jetzt  (FERTIG)
 *   offen > 0  → allTasksComplete true → false, completedAt = null   (WIEDER_OFFEN)
 * `uebergang` ist nur gesetzt, wenn DIESE Transaktion den Wechsel vollzogen hat.
 */
export async function linkStatusNeuBerechnenIn(
  tx: Prisma.TransactionClient,
  b: LinkBereich,
  schluessel: ReadonlyArray<string | null | undefined>,
  jetzt: Date = new Date(),
): Promise<LinkUebergang[]> {
  await linksSperrenIn(tx, b, schluessel);
  const ergebnis: LinkUebergang[] = [];
  for (const key of linkSchluesselSortiert(schluessel)) {
    const link = await tx.offboardingDepartmentLink.findUnique({
      where: linkEindeutig(b, key),
      select: { id: true, email: true, departmentName: true, completedAt: true },
    });
    if (!link) continue;
    const [gesamt, offen] = await Promise.all([
      aufgabenZaehlen(tx, b, key, false),
      aufgabenZaehlen(tx, b, key, true),
    ]);
    let uebergang: LinkUebergangArt | null = null;
    let completedAt = link.completedAt;
    if (offen === 0) {
      const r = await tx.offboardingDepartmentLink.updateMany({
        where: { id: link.id, allTasksComplete: false },
        data: { allTasksComplete: true, completedAt: jetzt },
      });
      if (r.count === 1) {
        uebergang = "FERTIG";
        completedAt = jetzt;
      }
    } else {
      const r = await tx.offboardingDepartmentLink.updateMany({
        where: { id: link.id, allTasksComplete: true },
        data: { allTasksComplete: false, completedAt: null },
      });
      if (r.count === 1) {
        uebergang = "WIEDER_OFFEN";
        completedAt = null;
      }
    }
    ergebnis.push({
      departmentKey: key,
      linkId: link.id,
      uebergang,
      email: link.email,
      departmentName: link.departmentName,
      completedAt,
      gesamt,
      offen,
    });
  }
  return ergebnis;
}

/** Offboarding-Fassung von linkStatusNeuBerechnenIn (Paket 1b, unveraenderte Signatur). */
export async function linkStatusNeuBerechnen(
  tx: Prisma.TransactionClient,
  offboardingId: string,
  schluessel: ReadonlyArray<string | null | undefined>,
  jetzt: Date = new Date(),
): Promise<LinkUebergang[]> {
  return linkStatusNeuBerechnenIn(tx, { modul: "OFFBOARDING", vorgangId: offboardingId }, schluessel, jetzt);
}

/**
 * Hakt ab bzw. oeffnet wieder — nur, wenn die Aufgabe noch im anderen Zustand
 * ist (bedingtes updateMany). `true` = DIESER Aufruf hat gewechselt. Ueber den
 * Link bleibt completedById immer null (daran erkennt die Anzeige "per Link").
 * `modul` fehlt = Offboarding (Paket 1b).
 */
export async function aufgabeUmschaltenPerLink(
  tx: Prisma.TransactionClient,
  opts: { itemId: string; erledigt: boolean; jetzt: Date; modul?: AbteilungsModul },
): Promise<boolean> {
  const where = { id: opts.itemId, isCompleted: !opts.erledigt };
  const data = {
    isCompleted: opts.erledigt,
    completedAt: opts.erledigt ? opts.jetzt : null,
    completedById: null,
  };
  const r =
    (opts.modul ?? "OFFBOARDING") === "OFFBOARDING"
      ? await tx.offboardingChecklistItem.updateMany({ where, data })
      : await tx.checklistItem.updateMany({ where, data });
  return r.count === 1;
}

/**
 * Setzt den Kommentar der Abteilung ("" = loeschen). Die interne HR-Notiz
 * (`notes`) wird nie angefasst. `geaendert` = der Text ist ein anderer.
 * `modul` fehlt = Offboarding (Paket 1b).
 */
export async function kommentarSetzenPerLink(
  tx: Prisma.TransactionClient,
  opts: { itemId: string; text: string; jetzt: Date; modul?: AbteilungsModul },
): Promise<{ geaendert: boolean; laenge: number }> {
  const neu = opts.text.trim();
  const offboarding = (opts.modul ?? "OFFBOARDING") === "OFFBOARDING";
  const vorher = offboarding
    ? await tx.offboardingChecklistItem.findUnique({ where: { id: opts.itemId }, select: { abteilungKommentar: true } })
    : await tx.checklistItem.findUnique({ where: { id: opts.itemId }, select: { abteilungKommentar: true } });
  if ((vorher?.abteilungKommentar ?? "") === neu) return { geaendert: false, laenge: neu.length };
  const data = { abteilungKommentar: neu || null, abteilungKommentarAm: neu ? opts.jetzt : null };
  if (offboarding) {
    await tx.offboardingChecklistItem.update({ where: { id: opts.itemId }, data });
  } else {
    await tx.checklistItem.update({ where: { id: opts.itemId }, data });
  }
  return { geaendert: true, laenge: neu.length };
}

// =============================================
// Mails nach dem Commit
// =============================================

const MAIL_EVENTS: Record<AbteilungsModul, { erledigt: string; fertig: string }> = {
  OFFBOARDING: { erledigt: "offboarding-task-completed", fertig: "offboarding-department-completed" },
  ONBOARDING: { erledigt: "onboarding-task-completed", fertig: "onboarding-department-completed" },
};

/**
 * Mail nach dem Commit. Die Aenderung ist dann schon gespeichert — ein Fehler
 * hier (etwa beim Zaehlen fuer die Mail) darf die Antwort nicht zum 500 machen,
 * sonst klickt die Abteilung erneut, und der zweite Klick findet die Aufgabe
 * schon erledigt (keine Mail, aber auch keine Klarheit). triggerWebhooks selbst
 * wirft nie; abgefangen werden die Datenbankabfragen davor.
 */
async function nachDemCommit(event: string, senden: () => Promise<void>): Promise<void> {
  try {
    await senden();
  } catch (err) {
    console.error(
      `[Abteilungsaufgaben] Mail ${event} nach dem Speichern nicht ausgeloest:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * *-task-completed an HR. KEIN `email`-Feld: Empfaenger ist das An-Feld der
 * Vorlage (ohne An-Feld SKIPPED).
 */
async function aufgabeErledigtMelden(opts: {
  bereich: LinkBereich;
  /** Gemeinsamer Teil (offboardingMailFelder bzw. onboardingAbteilungsMailFelder). */
  mailFelder: Record<string, unknown>;
  departmentKey: string | null;
  departmentName: string;
  item: { id: string; title: string; category: string; abteilungKommentar: string | null };
  offenInAbteilung: number;
  ueber: "LINK" | "PORTAL";
  completedById?: string;
}): Promise<void> {
  const offen = await offeneImVorgang(opts.bereich);
  await triggerWebhooks(MAIL_EVENTS[opts.bereich.modul].erledigt, {
    ...opts.mailFelder,
    departmentKey: opts.departmentKey ?? "",
    departmentName: opts.departmentName,
    abteilung: opts.departmentName,
    itemId: opts.item.id,
    itemTitle: opts.item.title,
    aufgabe: opts.item.title,
    offene_aufgaben: offen,
    offene_aufgaben_abteilung: opts.offenInAbteilung,
    // Aufgaben der Fuehrungskraft kommen ueber IHREN Link — "Link der
    // Abteilung" stuende sonst in der HR-Mail zu einer Person.
    erledigt_ueber:
      opts.ueber === "PORTAL"
        ? "Portal"
        : istFuehrungskraft(opts.departmentKey)
          ? "Link der Führungskraft"
          : "Link der Abteilung",
    ...kommentarMailFelder(opts.item.abteilungKommentar),
    // Nur der Portal-Weg sendete diese Felder schon immer (Webhook-Abnehmer).
    ...(opts.ueber === "PORTAL"
      ? {
          taskId: opts.item.id,
          taskTitle: opts.item.title,
          taskCategory: opts.item.category,
          completedById: opts.completedById ?? "",
        }
      : {}),
  });
}

/** *-department-completed an die Abteilung (genau einmal, nur ueber den Link). */
async function abteilungFertigMelden(
  bereich: LinkBereich,
  mailFelder: Record<string, unknown>,
  u: LinkUebergang,
  departmentKey: string,
) {
  await triggerWebhooks(MAIL_EVENTS[bereich.modul].fertig, {
    ...mailFelder,
    departmentKey,
    departmentName: u.departmentName,
    abteilung: u.departmentName,
    email: u.email,
    completedAt: u.completedAt?.toISOString(),
    anzahl_aufgaben: u.gesamt,
    // Wie bei "Aufgaben zugewiesen": "ja", wenn die Bestaetigung an die
    // Fuehrungskraft geht. Der Standardtext nutzt das (noch) nicht — eine
    // eigene Vorlage kann damit "Ihrer Abteilung" vermeiden.
    ist_fuehrungskraft: istFuehrungskraft(departmentKey) ? "ja" : "",
  });
}

// =============================================
// Oeffentliche Seite: Datenzuschnitt
// =============================================

/**
 * Felder einer Aufgabe auf der Link-Seite — in beiden Tabellen gleich benannt.
 * `description` ist der Hinweis aus der Vorlage FUER die zustaendige Stelle
 * (Paket 5). NIE: `notes` (interne HR-Notiz), `completedById`, Zustaendigkeit
 * anderer Aufgaben.
 */
const AUFGABE_OEFFENTLICH = {
  id: true,
  title: true,
  category: true,
  orderIndex: true,
  description: true,
  isCompleted: true,
  completedAt: true,
  dueDate: true,
  abteilungKommentar: true,
  abteilungKommentarAm: true,
} as const satisfies Prisma.OffboardingChecklistItemSelect & Prisma.ChecklistItemSelect;

type AufgabeOeffentlich = Prisma.OffboardingChecklistItemGetPayload<{ select: typeof AUFGABE_OEFFENTLICH }>;

const VORGANG_OEFFENTLICH = {
  id: true,
  displayId: true,
  status: true,
  employeeFirstName: true,
  employeeLastName: true,
  lastWorkingDay: true,
  organization: { select: { name: true, mandantNumber: true } },
} satisfies Prisma.OffboardingProcessSelect;

/**
 * Onboarding-Vorgang fuer die Link-Seite — EIGENES select, nie die Detailroute
 * (GET /api/onboarding/[id] entschluesselt IBAN, SV-Nummer und Steuer-ID).
 * Bewusst NICHT: `email` (private Adresse der Person), `token`s, alle
 * Fragebogen-Angaben ausser dem Namen, Verguetung, Kostenstellen, Notizen.
 * Stellenbezeichnung, Betriebsstaette und die Adresse der Fuehrungskraft
 * werden geladen, aber nur je Schluessel ausgegeben (zusatzWerte).
 */
export const ONBOARDING_VORGANG_OEFFENTLICH = {
  id: true,
  displayId: true,
  status: true,
  firstName: true,
  lastName: true,
  supervisorEmail: true,
  personalData: { select: { firstName: true, lastName: true } },
  supervisorData: { select: { vertragsbeginn: true, stellenbeschreibung: true, betriebsstaette: true } },
  organization: { select: { name: true, mandantNumber: true } },
} satisfies Prisma.OnboardingProcessSelect;

type OnboardingVorgangOeffentlich = Prisma.OnboardingProcessGetPayload<{
  select: typeof ONBOARDING_VORGANG_OEFFENTLICH;
}>;

/** Der Vorgang hinter einem Link, fuer beide Module gleich aufbereitet. */
interface OeffentlicherVorgang {
  bereich: LinkBereich;
  /** 410-Meldung wegen des Vorgangsstatus (abgebrochen bzw. nicht mehr aktiv), sonst null. */
  gesperrtMeldung: string | null;
  /** Abgeschlossen: nur lesen (PATCH 409). */
  readOnly: boolean;
  anzeige: { vorgangsnummer: string; mitarbeiterName: string; einrichtung: string; bezugsdatum: string | null };
  zusatz: (departmentKey: string) => Partial<Record<ZusatzFeld, string>>;
  mailFelder: Record<string, unknown>;
}

function offboardingOeffentlich(v: Prisma.OffboardingProcessGetPayload<{ select: typeof VORGANG_OEFFENTLICH }>): OeffentlicherVorgang {
  return {
    bereich: { modul: "OFFBOARDING", vorgangId: v.id },
    gesperrtMeldung: v.status === "CANCELLED" ? MELDUNGEN.VORGANG_ABGEBROCHEN : null,
    readOnly: v.status === "COMPLETED",
    anzeige: {
      vorgangsnummer: v.displayId,
      mitarbeiterName: `${v.employeeFirstName} ${v.employeeLastName}`.trim(),
      einrichtung: v.organization?.name ?? "",
      bezugsdatum: v.lastWorkingDay.toISOString(),
    },
    zusatz: () => ({}),
    mailFelder: offboardingMailFelder(v),
  };
}

function onboardingOeffentlich(v: OnboardingVorgangOeffentlich): OeffentlicherVorgang {
  const beginn = v.supervisorData?.vertragsbeginn ?? null;
  return {
    bereich: { modul: "ONBOARDING", vorgangId: v.id },
    gesperrtMeldung: v.status === "EXPIRED" ? MELDUNGEN.VORGANG_NICHT_MEHR_AKTIV : null,
    readOnly: v.status === "COMPLETED",
    anzeige: {
      vorgangsnummer: v.displayId || v.id.substring(0, 8),
      mitarbeiterName: mitarbeiterName(v) ?? MELDUNGEN.NAME_FOLGT,
      einrichtung: v.organization?.name ?? "",
      bezugsdatum: beginn ? beginn.toISOString() : null,
    },
    zusatz: (key) =>
      zusatzWerte(key, {
        stellenbezeichnung: v.supervisorData?.stellenbeschreibung,
        betriebsstaette: v.supervisorData?.betriebsstaette,
        fuehrungskraftEmail: v.supervisorEmail,
      }),
    mailFelder: onboardingAbteilungsMailFelder(v),
  };
}

/**
 * Link + Vorgang zum Token. `null`, wenn es den Token nicht gibt ODER er zum
 * anderen Modul gehoert (dieselbe 404 „Ungültiger Link" — die Antwort verraet
 * nicht, dass es ihn dort gibt).
 */
async function linkZumToken(token: string, modul: AbteilungsModul) {
  const link = await prisma.offboardingDepartmentLink.findUnique({
    where: { token },
    include: {
      offboarding: { select: VORGANG_OEFFENTLICH },
      onboarding: { select: ONBOARDING_VORGANG_OEFFENTLICH },
    },
  });
  if (!link) return null;
  const vorgang =
    modul === "OFFBOARDING"
      ? link.offboarding
        ? offboardingOeffentlich(link.offboarding)
        : null
      : link.onboarding
        ? onboardingOeffentlich(link.onboarding)
        : null;
  if (!vorgang) return null;
  return { link, vorgang };
}

async function aufgabenDerAbteilung(b: LinkBereich, departmentKey: string): Promise<AufgabeOeffentlich[]> {
  const orderBy = [{ category: "asc" as const }, { orderIndex: "asc" as const }];
  return b.modul === "OFFBOARDING"
    ? prisma.offboardingChecklistItem.findMany({
        where: { offboardingId: b.vorgangId, assigneeDepartment: departmentKey },
        orderBy,
        select: AUFGABE_OEFFENTLICH,
      })
    : prisma.checklistItem.findMany({
        where: { onboardingId: b.vorgangId, assignee: departmentKey },
        orderBy,
        select: AUFGABE_OEFFENTLICH,
      });
}

function fortschritt(aufgaben: ReadonlyArray<{ isCompleted: boolean }>) {
  const gesamt = aufgaben.length;
  const erledigt = aufgaben.filter((a) => a.isCompleted).length;
  return { gesamt, erledigt, prozent: gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 100 };
}

// =============================================
// Oeffentliche Seite: laden
// =============================================

async function oeffentlichLaden(modul: AbteilungsModul, token: string, jetzt: Date): Promise<DienstAntwort> {
  const gefunden = await linkZumToken(token, modul);
  if (!gefunden) return { status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } };
  const { link, vorgang } = gefunden;
  if (vorgang.gesperrtMeldung) return { status: 410, body: { error: vorgang.gesperrtMeldung } };
  if (link.expiresAt.getTime() < jetzt.getTime()) {
    return { status: 410, body: { error: MELDUNGEN.LINK_ABGELAUFEN } };
  }

  await prisma.offboardingDepartmentLink.update({
    where: { id: link.id },
    data: {
      firstOpenedAt: link.firstOpenedAt ?? jetzt,
      lastOpenedAt: jetzt,
      openCount: { increment: 1 },
    },
  });

  const aufgaben = await aufgabenDerAbteilung(vorgang.bereich, link.departmentKey);
  return {
    status: 200,
    body: {
      data: {
        modul,
        abteilung: { key: link.departmentKey, name: link.departmentName },
        vorgang: vorgang.anzeige,
        zusatz: vorgang.zusatz(link.departmentKey),
        readOnly: vorgang.readOnly,
        gueltigBis: link.expiresAt.toISOString(),
        aufgaben,
        fortschritt: fortschritt(aufgaben),
        allTasksComplete: link.allTasksComplete,
      },
    },
  };
}

/**
 * GET /api/offboarding-tasks/[token] — die Aufgaben EINER Abteilung.
 *
 * Datensparsam: nur die eigenen Aufgaben (mit Hinweis aus der Vorlage, ohne
 * interne HR-Notiz, ohne Urheber), kein Fortschritt anderer Abteilungen, kein
 * Vorgangsstatus ausser `readOnly`.
 *
 *   404 { error: "Ungültiger Link" }                         unbekannt oder Onboarding-Token
 *   410 { error: "Dieser Vorgang wurde abgebrochen. …" }     CANCELLED
 *   410 { error: "Dieser Link ist abgelaufen." }
 *   200 { data: { modul, abteilung, vorgang, zusatz: {}, readOnly, gueltigBis, aufgaben, fortschritt, allTasksComplete } }
 *
 * Die IP-Bremse (tokenRateLimiter) prueft die Route VOR diesem Aufruf.
 */
export async function oeffentlicheAufgabenLaden(token: string, jetzt: Date = new Date()): Promise<DienstAntwort> {
  return oeffentlichLaden("OFFBOARDING", token, jetzt);
}

/**
 * GET /api/onboarding-tasks/[token] — wie oben, fuer das Onboarding:
 *
 *   404 { error: "Ungültiger Link" }                                    unbekannt oder Offboarding-Token
 *   410 { error: "Dieser Vorgang ist nicht mehr aktiv. Bitte keine weiteren Schritte unternehmen." }   EXPIRED
 *   410 { error: "Dieser Link ist abgelaufen." }
 *   200 { data: { modul: "ONBOARDING", abteilung, vorgang: { vorgangsnummer, mitarbeiterName (sonst „Name folgt"),
 *         einrichtung, bezugsdatum (Vertragsbeginn ISO | null) }, zusatz (nur erlaubte Felder), readOnly (COMPLETED),
 *         gueltigBis, aufgaben, fortschritt, allTasksComplete } }
 */
export async function oeffentlicheOnboardingAufgabenLaden(
  token: string,
  jetzt: Date = new Date(),
): Promise<DienstAntwort> {
  return oeffentlichLaden("ONBOARDING", token, jetzt);
}

// =============================================
// Oeffentliche Seite: abhaken / kommentieren
// =============================================

async function oeffentlichAendern(
  modul: AbteilungsModul,
  token: string,
  itemId: string,
  rohBody: unknown,
  jetzt: Date,
): Promise<DienstAntwort> {
  const gefunden = await linkZumToken(token, modul);
  if (!gefunden) return { status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } };
  const { link, vorgang } = gefunden;
  const bereich = vorgang.bereich;
  if (vorgang.gesperrtMeldung) return { status: 410, body: { error: vorgang.gesperrtMeldung } };
  if (link.expiresAt.getTime() < jetzt.getTime()) {
    return { status: 410, body: { error: MELDUNGEN.LINK_ABGELAUFEN } };
  }
  if (vorgang.readOnly) {
    return { status: 409, body: { error: MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN } };
  }
  if (!linkAenderungsLimiter.check(link.id).allowed) {
    return { status: 429, body: { error: MELDUNGEN.ZU_VIELE_ANFRAGEN } };
  }

  const parsed = aufgabeLinkPatchSchema.safeParse(rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const { isCompleted, comment } = parsed.data;

  const item =
    modul === "OFFBOARDING"
      ? await prisma.offboardingChecklistItem
          .findUnique({
            where: { id: itemId },
            select: { id: true, offboardingId: true, assigneeDepartment: true, title: true },
          })
          .then((a) =>
            a ? { id: a.id, vorgangId: a.offboardingId, departmentKey: a.assigneeDepartment, title: a.title } : null,
          )
      : await prisma.checklistItem
          .findUnique({
            where: { id: itemId },
            select: { id: true, onboardingId: true, assignee: true, title: true },
          })
          .then((a) => (a ? { id: a.id, vorgangId: a.onboardingId, departmentKey: a.assignee, title: a.title } : null));
  if (!item || item.vorgangId !== bereich.vorgangId || item.departmentKey !== link.departmentKey) {
    return { status: 404, body: { error: MELDUNGEN.AUFGABE_NICHT_GEFUNDEN } };
  }

  const auditBasis = {
    itemId: item.id,
    title: item.title,
    departmentKey: link.departmentKey,
    linkId: link.id,
  };

  const { umgeschaltet, uebergaenge, fremd } = await prisma.$transaction(async (tx) => {
    // 1. Sperren (Link-Zeile), 2. Aufgabe aendern, 3. Status neu berechnen.
    await linksSperrenIn(tx, bereich, [link.departmentKey]);

    // Nach der Sperre erneut pruefen: Hat HR die Aufgabe inzwischen einer
    // anderen Abteilung zugeordnet (der Portal-PATCH sperrt dieselbe Zeile und
    // committet vorher), darf dieser Link sie nicht mehr aendern.
    const jetztZugeordnet = await aufgabenZustaendigkeit(tx, modul, item.id);
    if (jetztZugeordnet.departmentKey !== link.departmentKey) {
      return { umgeschaltet: false, uebergaenge: [] as LinkUebergang[], fremd: true };
    }

    let umgeschaltet = false;
    if (isCompleted !== undefined) {
      umgeschaltet = await aufgabeUmschaltenPerLink(tx, { itemId: item.id, erledigt: isCompleted, jetzt, modul });
      if (umgeschaltet) {
        await tx.auditLog.create({
          data: {
            userId: null,
            ...auditBezug(bereich),
            action: isCompleted ? ABTEILUNGS_AUDIT.ERLEDIGT : ABTEILUNGS_AUDIT.WIEDER_GEOEFFNET,
            details: auditBasis,
          },
        });
      }
    }

    if (comment !== undefined && comment !== null) {
      const k = await kommentarSetzenPerLink(tx, { itemId: item.id, text: comment, jetzt, modul });
      if (k.geaendert) {
        // Nur die Laenge — der Text steht an der Aufgabe, nicht im Protokoll.
        await tx.auditLog.create({
          data: {
            userId: null,
            ...auditBezug(bereich),
            action: ABTEILUNGS_AUDIT.KOMMENTIERT,
            details: { ...auditBasis, laenge: k.laenge },
          },
        });
      }
    }

    const uebergaenge = umgeschaltet
      ? await linkStatusNeuBerechnenIn(tx, bereich, [link.departmentKey], jetzt)
      : [];
    for (const u of uebergaenge) {
      if (!u.uebergang) continue;
      await tx.auditLog.create({
        data: {
          userId: null,
          ...auditBezug(bereich),
          action: u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
          details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "LINK" },
        },
      });
    }
    return { umgeschaltet, uebergaenge, fremd: false };
  });
  if (fremd) return { status: 404, body: { error: MELDUNGEN.AUFGABE_NICHT_GEFUNDEN } };

  // Nach dem Commit: frischer Stand fuer Antwort und Mails.
  const aufgaben = await aufgabenDerAbteilung(bereich, link.departmentKey);
  const aufgabe = aufgaben.find((a) => a.id === item.id);
  const offenInAbteilung = aufgaben.filter((a) => !a.isCompleted).length;
  const u = uebergaenge.find((x) => x.departmentKey === link.departmentKey);
  const events = MAIL_EVENTS[modul];

  if (umgeschaltet && isCompleted && aufgabe) {
    await nachDemCommit(events.erledigt, () =>
      aufgabeErledigtMelden({
        bereich,
        mailFelder: vorgang.mailFelder,
        departmentKey: link.departmentKey,
        departmentName: link.departmentName,
        item: {
          id: aufgabe.id,
          title: aufgabe.title,
          category: aufgabe.category,
          abteilungKommentar: aufgabe.abteilungKommentar,
        },
        offenInAbteilung,
        ueber: "LINK",
      }),
    );
  }
  if (u?.uebergang === "FERTIG") {
    await nachDemCommit(events.fertig, () => abteilungFertigMelden(bereich, vorgang.mailFelder, u, link.departmentKey));
  }

  return {
    status: 200,
    body: {
      data: {
        aufgabe: aufgabe ?? null,
        fortschritt: fortschritt(aufgaben),
        allTasksComplete: u ? u.offen === 0 : link.allTasksComplete && offenInAbteilung === 0,
      },
    },
  };
}

/**
 * PATCH /api/offboarding-tasks/[token]/[itemId].
 *
 * `rohBody` = geparstes JSON; kaputtes JSON gibt die Route als `undefined`
 * weiter (→ 400). Reihenfolge der Pruefungen:
 *   404 { error: "Ungültiger Link" }                                   (auch Onboarding-Token)
 *   410 { error: "Dieser Vorgang wurde abgebrochen. …" }             CANCELLED
 *   410 { error: "Dieser Link ist abgelaufen." }
 *   409 { error: "Dieser Vorgang ist abgeschlossen. Änderungen …" }   COMPLETED
 *   429 { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." } je Link
 *   400 { error: <Meldung des Schemas> }
 *   404 { error: "Aufgabe nicht gefunden" }  fremde Aufgabe oder andere Abteilung
 *   200 { data: { aufgabe, fortschritt, allTasksComplete } }
 * Ein zweites "erledigt" auf eine erledigte Aufgabe ist 200 ohne Mail.
 */
export async function oeffentlicheAufgabeAendern(
  token: string,
  itemId: string,
  rohBody: unknown,
  jetzt: Date = new Date(),
): Promise<DienstAntwort> {
  return oeffentlichAendern("OFFBOARDING", token, itemId, rohBody, jetzt);
}

/**
 * PATCH /api/onboarding-tasks/[token]/[itemId] — dieselbe Reihenfolge wie
 * oben; 410 bei EXPIRED mit „Dieser Vorgang ist nicht mehr aktiv. …", 409 bei
 * COMPLETED. Mails: onboarding-task-completed (an HR, mit Kommentar) und
 * onboarding-department-completed (an die Abteilung, genau einmal).
 */
export async function oeffentlicheOnboardingAufgabeAendern(
  token: string,
  itemId: string,
  rohBody: unknown,
  jetzt: Date = new Date(),
): Promise<DienstAntwort> {
  return oeffentlichAendern("ONBOARDING", token, itemId, rohBody, jetzt);
}

// =============================================
// Portal: Aufgabe aendern (Offboarding, M9)
// =============================================

/**
 * PATCH /api/offboarding/[id]/checklist/[itemId].
 *
 *   403 { error: "Keine Berechtigung" }                 Rolle nicht CHECKLIST_ROLES
 *   400 { error }                                       Schema / unbekannte Zustaendigkeit
 *   404 { error: "Offboarding-Vorgang nicht gefunden" } unbekannt ODER fremder Mandant
 *   404 { error: "Checklisten-Eintrag nicht gefunden" } Eintrag fehlt oder gehoert zu einem anderen Vorgang
 *   409 { error: "Der Vorgang wurde abgebrochen. …" }   CANCELLED und Status/Zustaendigkeit geaendert
 *   200 { item: <Eintrag + erledigtVon>, progress: { total, completed, allCompleted } }
 *
 * Haengt HR eine Aufgabe auf eine andere Abteilung um, werden BEIDE Links neu
 * berechnet. HR bekommt die Mail "Aufgabe erledigt" nur bei Aufgaben einer
 * Link-Abteilung und nur bei offenem Vorgang; eine Bestaetigung an die
 * Abteilung geht aus dem Portal nie hinaus. Die interne Notiz (`notes`) darf
 * auch bei abgebrochenem Vorgang geaendert werden.
 */
export async function aufgabeImPortalAendern(opts: {
  offboardingId: string;
  itemId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!CHECKLIST_ROLES.includes(opts.session.role)) {
    return { status: 403, body: { error: "Keine Berechtigung" } };
  }
  const parsed = portalAufgabePatchSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const eingabe = parsed.data;

  const vorgang = await prisma.offboardingProcess.findUnique({
    where: { id: opts.offboardingId },
    select: {
      id: true,
      displayId: true,
      organizationId: true,
      status: true,
      employeeFirstName: true,
      employeeLastName: true,
      lastWorkingDay: true,
      organization: { select: { name: true, mandantNumber: true } },
    },
  });
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return { status: 404, body: { error: MELDUNGEN.VORGANG_NICHT_GEFUNDEN } };
  }
  const bereich: LinkBereich = { modul: "OFFBOARDING", vorgangId: vorgang.id };
  const vorher = await prisma.offboardingChecklistItem.findUnique({ where: { id: opts.itemId } });
  if (!vorher || vorher.offboardingId !== vorgang.id) {
    return { status: 404, body: { error: MELDUNGEN.EINTRAG_NICHT_GEFUNDEN } };
  }

  const neuerSchluessel = eingabe.assigneeDepartment; // undefined = unveraendert, null = keiner
  if (typeof neuerSchluessel === "string" && neuerSchluessel !== vorher.assigneeDepartment) {
    const konfig = await prisma.departmentConfig.findMany({ select: { departmentKey: true } });
    if (!abteilungsSchluesselBekannt(neuerSchluessel, konfig.map((k) => k.departmentKey))) {
      return { status: 400, body: { error: meldungUnbekannteZustaendigkeit(neuerSchluessel) } };
    }
  }

  const statusWechsel = eingabe.isCompleted !== undefined && eingabe.isCompleted !== vorher.isCompleted;
  const zustaendigWechsel = neuerSchluessel !== undefined && neuerSchluessel !== vorher.assigneeDepartment;
  if (vorgang.status === "CANCELLED" && (statusWechsel || zustaendigWechsel)) {
    return { status: 409, body: { error: MELDUNGEN.CHECKLISTE_ABGEBROCHEN } };
  }

  const schluessel = [vorher.assigneeDepartment, zustaendigWechsel ? neuerSchluessel : null];

  const { umgeschaltet } = await prisma.$transaction(async (tx) => {
    await linksSperrenIn(tx, bereich, schluessel);

    let umgeschaltet = false;
    if (statusWechsel) {
      const r = await tx.offboardingChecklistItem.updateMany({
        where: { id: vorher.id, isCompleted: vorher.isCompleted },
        data: eingabe.isCompleted
          ? { isCompleted: true, completedAt: jetzt, completedById: opts.session.userId }
          : { isCompleted: false, completedAt: null, completedById: null },
      });
      umgeschaltet = r.count === 1;
    }

    const rest: Prisma.OffboardingChecklistItemUpdateInput = {};
    if (eingabe.notes !== undefined) rest.notes = eingabe.notes?.trim() ? eingabe.notes : null;
    if (zustaendigWechsel) rest.assigneeDepartment = neuerSchluessel ?? null;
    if (Object.keys(rest).length > 0) {
      await tx.offboardingChecklistItem.update({ where: { id: vorher.id }, data: rest });
    }

    if (umgeschaltet || zustaendigWechsel) {
      const uebergaenge = await linkStatusNeuBerechnenIn(tx, bereich, schluessel, jetzt);
      for (const u of uebergaenge) {
        if (!u.uebergang) continue;
        await tx.auditLog.create({
          data: {
            userId: opts.session.userId,
            offboardingId: vorgang.id,
            processType: "OFFBOARDING",
            action:
              u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
            details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "PORTAL" },
          },
        });
      }
    }

    const details: Record<string, unknown> = { itemId: vorher.id, title: vorher.title };
    if (umgeschaltet) details.isCompleted = { von: vorher.isCompleted, nach: eingabe.isCompleted };
    if (zustaendigWechsel) details.assigneeDepartment = { von: vorher.assigneeDepartment, nach: neuerSchluessel ?? null };
    if (eingabe.notes !== undefined) details.notizGeaendert = true;
    if (umgeschaltet || zustaendigWechsel || eingabe.notes !== undefined) {
      await tx.auditLog.create({
        data: {
          userId: opts.session.userId,
          offboardingId: vorgang.id,
          processType: "OFFBOARDING",
          action: ABTEILUNGS_AUDIT.PORTAL_GEAENDERT,
          details: details as Prisma.InputJsonValue,
        },
      });
    }
    return { umgeschaltet };
  });

  const nachher = await prisma.offboardingChecklistItem.findUnique({ where: { id: vorher.id } });
  if (!nachher) return { status: 404, body: { error: MELDUNGEN.EINTRAG_NICHT_GEFUNDEN } };

  // Name fuer Mail und Anzeige: Link der Abteilung, sonst Label.
  const key = nachher.assigneeDepartment;
  const link = key
    ? await prisma.offboardingDepartmentLink.findUnique({
        where: linkEindeutig(bereich, key),
        select: { departmentName: true },
      })
    : null;
  // Ohne Zustaendigkeit gibt es weder Mail noch Urheber "per Link" — der Name
  // wird dann nicht gebraucht.
  const abteilungName = key ? (link?.departmentName ?? abteilungLabel(key)) : "";

  if (
    umgeschaltet &&
    nachher.isCompleted &&
    istLinkAbteilung(key) &&
    vorgang.status !== "COMPLETED" &&
    vorgang.status !== "CANCELLED"
  ) {
    await nachDemCommit("offboarding-task-completed", async () => {
      const offenInAbteilung = await prisma.offboardingChecklistItem.count({
        where: { offboardingId: vorgang.id, assigneeDepartment: key, isCompleted: false },
      });
      await aufgabeErledigtMelden({
        bereich,
        mailFelder: offboardingMailFelder(vorgang),
        departmentKey: key,
        departmentName: abteilungName,
        item: {
          id: nachher.id,
          title: nachher.title,
          category: nachher.category,
          abteilungKommentar: nachher.abteilungKommentar,
        },
        offenInAbteilung,
        ueber: "PORTAL",
        completedById: opts.session.userId,
      });
    });
  }

  const [total, completed] = await Promise.all([
    prisma.offboardingChecklistItem.count({ where: { offboardingId: vorgang.id } }),
    prisma.offboardingChecklistItem.count({ where: { offboardingId: vorgang.id, isCompleted: true } }),
  ]);
  const benutzer = await benutzerNamen(opts.session, nachher.completedById);
  const erledigtVon = erledigtVonBestimmen(nachher, {
    benutzer,
    abteilungen: key ? { [key]: abteilungName } : {},
  });

  return {
    status: 200,
    body: {
      item: { ...nachher, erledigtVon },
      progress: { total, completed, allCompleted: total > 0 && total === completed },
    },
  };
}

/**
 * Urheber-Namen fuer erledigtVon: meist die aufrufende Person; hat jemand
 * anderes abgehakt (nur Notiz geaendert), deren Namen nachschlagen.
 */
async function benutzerNamen(session: SessionPayload, completedById: string | null): Promise<Record<string, string>> {
  if (!completedById) return {};
  if (completedById === session.userId) {
    return { [session.userId]: `${session.firstName} ${session.lastName}`.trim() };
  }
  const u = await prisma.user.findUnique({
    where: { id: completedById },
    select: { firstName: true, lastName: true },
  });
  return u ? { [completedById]: `${u.firstName} ${u.lastName}`.trim() } : {};
}

// =============================================
// Portal: Aufgabe aendern (Onboarding, Paket 5)
// =============================================

/**
 * PATCH /api/onboarding/[id]/checklist/[itemId] — Gegenstueck zu
 * aufgabeImPortalAendern, mit den Onboarding-Regeln:
 *
 *   403 { error: "Keine Berechtigung" }                 Rolle nicht CHECKLIST_ROLES
 *   400 { error }                                       Schema / unbekannte Zustaendigkeit
 *   404 { error: "Vorgang nicht gefunden" }             unbekannt ODER fremder Mandant
 *   404 { error: "Checklisten-Eintrag nicht gefunden" } Eintrag fehlt oder gehoert zu einem anderen Vorgang
 *   409 { error: "Der Vorgang ist abgelaufen. Die Checkliste kann nicht mehr geändert werden." }
 *        EXPIRED und Status/Zustaendigkeit/Faelligkeit geaendert (Notiz geht)
 *   200 { item: <Eintrag + completedBy {firstName,lastName} + erledigtVon>, progress: { total, completed, allCompleted } }
 *
 * Body (onboardingPortalAufgabePatchSchema): isCompleted, notes, assignee
 * (Schluessel oder null), dueDate ("YYYY-MM-DD" oder null — von Hand
 * gesetzte Faelligkeiten ueberschreibt faelligkeitenSetzen nie). `dueDate:
 * null` entfernt die Frist ENDGUELTIG: `relativeDueDays` faellt mit weg,
 * sonst rechnete `faelligkeitenSetzen` sie bei der naechsten HR-Aktion
 * erneut aus.
 *
 * KEINE Mail (Entscheidung Paket 5): Das Haekchen von HR meldet weder HR noch
 * die Abteilung etwas. Der Abteilungsstatus wird trotzdem neu berechnet
 * (Umhaengen: beide Links).
 */
export async function onboardingAufgabeImPortalAendern(opts: {
  onboardingId: string;
  itemId: string;
  rohBody: unknown;
  session: SessionPayload;
  jetzt?: Date;
}): Promise<DienstAntwort> {
  const jetzt = opts.jetzt ?? new Date();
  if (!CHECKLIST_ROLES.includes(opts.session.role)) {
    return { status: 403, body: { error: "Keine Berechtigung" } };
  }
  const parsed = onboardingPortalAufgabePatchSchema.safeParse(opts.rohBody);
  if (!parsed.success) {
    return { status: 400, body: { error: parsed.error.errors[0]?.message ?? MELDUNGEN.UNGUELTIGE_EINGABE } };
  }
  const eingabe = parsed.data;

  const vorgang = await prisma.onboardingProcess.findUnique({
    where: { id: opts.onboardingId },
    select: { id: true, organizationId: true, status: true },
  });
  if (!vorgang || !(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return { status: 404, body: { error: MELDUNGEN.ONBOARDING_VORGANG_NICHT_GEFUNDEN } };
  }
  const bereich: LinkBereich = { modul: "ONBOARDING", vorgangId: vorgang.id };
  const vorher = await prisma.checklistItem.findUnique({ where: { id: opts.itemId } });
  if (!vorher || vorher.onboardingId !== vorgang.id) {
    return { status: 404, body: { error: MELDUNGEN.EINTRAG_NICHT_GEFUNDEN } };
  }

  const neuerSchluessel = eingabe.assignee; // undefined = unveraendert, null = keiner
  if (typeof neuerSchluessel === "string" && neuerSchluessel !== vorher.assignee) {
    const konfig = await prisma.departmentConfig.findMany({ select: { departmentKey: true } });
    if (!abteilungsSchluesselBekannt(neuerSchluessel, konfig.map((k) => k.departmentKey))) {
      return { status: 400, body: { error: meldungUnbekannteZustaendigkeit(neuerSchluessel) } };
    }
  }

  const statusWechsel = eingabe.isCompleted !== undefined && eingabe.isCompleted !== vorher.isCompleted;
  const zustaendigWechsel = neuerSchluessel !== undefined && neuerSchluessel !== vorher.assignee;
  const neueFaelligkeit = eingabe.dueDate === undefined ? undefined : eingabe.dueDate ? new Date(eingabe.dueDate) : null;
  const faelligWechsel =
    neueFaelligkeit !== undefined && (neueFaelligkeit?.getTime() ?? null) !== (vorher.dueDate?.getTime() ?? null);
  if (vorgang.status === "EXPIRED" && (statusWechsel || zustaendigWechsel || faelligWechsel)) {
    return { status: 409, body: { error: MELDUNGEN.CHECKLISTE_ABGELAUFEN } };
  }

  const schluessel = [vorher.assignee, zustaendigWechsel ? neuerSchluessel : null];

  await prisma.$transaction(async (tx) => {
    await linksSperrenIn(tx, bereich, schluessel);

    let umgeschaltet = false;
    if (statusWechsel) {
      const r = await tx.checklistItem.updateMany({
        where: { id: vorher.id, isCompleted: vorher.isCompleted },
        data: eingabe.isCompleted
          ? { isCompleted: true, completedAt: jetzt, completedById: opts.session.userId }
          : { isCompleted: false, completedAt: null, completedById: null },
      });
      umgeschaltet = r.count === 1;
    }

    const rest: Prisma.ChecklistItemUncheckedUpdateInput = {};
    if (eingabe.notes !== undefined) rest.notes = eingabe.notes?.trim() ? eingabe.notes : null;
    if (zustaendigWechsel) rest.assignee = neuerSchluessel ?? null;
    if (faelligWechsel) {
      rest.dueDate = neueFaelligkeit ?? null;
      // Frist von Hand ENTFERNT: Dann faellt auch die Tagesangabe weg.
      // Sonst holte `faelligkeitenSetzen` die geloeschte Frist bei der
      // naechsten HR-Aktion zurueck (WHERE dueDate: null, relativeDueDays
      // not null) — die Aufgabe waere wieder ueberfaellig und die Abteilung
      // bekaeme eine Erinnerung, die HR gerade abgestellt hatte.
      if (neueFaelligkeit === null) rest.relativeDueDays = null;
    }
    if (Object.keys(rest).length > 0) {
      await tx.checklistItem.update({ where: { id: vorher.id }, data: rest });
    }

    if (umgeschaltet || zustaendigWechsel) {
      const uebergaenge = await linkStatusNeuBerechnenIn(tx, bereich, schluessel, jetzt);
      for (const u of uebergaenge) {
        if (!u.uebergang) continue;
        await tx.auditLog.create({
          data: {
            userId: opts.session.userId,
            ...auditBezug(bereich),
            action:
              u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
            details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "PORTAL" },
          },
        });
      }
    }

    // Protokoll wie bisher unter CHECKLIST_ITEM_UPDATED — aber mit
    // Von/Nach statt des rohen Bodys (frueher `changes: body`).
    const details: Record<string, unknown> = { itemId: vorher.id, title: vorher.title };
    if (umgeschaltet) details.isCompleted = { von: vorher.isCompleted, nach: eingabe.isCompleted };
    if (zustaendigWechsel) details.assignee = { von: vorher.assignee, nach: neuerSchluessel ?? null };
    if (faelligWechsel) {
      details.dueDate = { von: vorher.dueDate?.toISOString() ?? null, nach: neueFaelligkeit?.toISOString() ?? null };
      if (neueFaelligkeit === null && vorher.relativeDueDays !== null) {
        details.relativeDueDays = { von: vorher.relativeDueDays, nach: null };
      }
    }
    if (eingabe.notes !== undefined) details.notizGeaendert = true;
    if (umgeschaltet || zustaendigWechsel || faelligWechsel || eingabe.notes !== undefined) {
      await tx.auditLog.create({
        data: {
          userId: opts.session.userId,
          ...auditBezug(bereich),
          action: ABTEILUNGS_AUDIT.PORTAL_GEAENDERT,
          details: details as Prisma.InputJsonValue,
        },
      });
    }
  });

  const nachher = await prisma.checklistItem.findUnique({
    where: { id: vorher.id },
    include: { completedBy: { select: { firstName: true, lastName: true } } },
  });
  if (!nachher) return { status: 404, body: { error: MELDUNGEN.EINTRAG_NICHT_GEFUNDEN } };

  const key = nachher.assignee;
  const link = key && istLinkAbteilung(key)
    ? await prisma.offboardingDepartmentLink.findUnique({
        where: linkEindeutig(bereich, key),
        select: { departmentName: true },
      })
    : null;
  const abteilungName = key ? (link?.departmentName ?? abteilungLabel(key)) : "";

  const [total, completed] = await Promise.all([
    prisma.checklistItem.count({ where: { onboardingId: vorgang.id } }),
    prisma.checklistItem.count({ where: { onboardingId: vorgang.id, isCompleted: true } }),
  ]);
  const benutzer = await benutzerNamen(opts.session, nachher.completedById);
  const erledigtVon = erledigtVonBestimmen(
    { isCompleted: nachher.isCompleted, completedById: nachher.completedById, assigneeDepartment: key },
    { benutzer, abteilungen: key ? { [key]: abteilungName } : {} },
  );

  return {
    status: 200,
    body: {
      item: { ...nachher, erledigtVon },
      progress: { total, completed, allCompleted: total > 0 && total === completed },
    },
  };
}
