/**
 * CREDO HR-Portal – Abteilungsaufgaben im Offboarding: Abhaken, Kommentar und
 * Abteilungsstatus (Datenbankteil, nur Server)
 *
 * Zwei Wege aendern eine Aufgabe:
 *   - die Abteilung ueber ihren Link (oeffentlich, ohne Anmeldung):
 *       GET   /api/offboarding-tasks/[token]          → oeffentlicheAufgabenLaden
 *       PATCH /api/offboarding-tasks/[token]/[itemId] → oeffentlicheAufgabeAendern
 *   - HR im Portal:
 *       PATCH /api/offboarding/[id]/checklist/[itemId] → aufgabeImPortalAendern
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
 * dann Aufgaben — alle Wege gleich (Link, Portal und faelligkeitenVerschieben
 * im Dienst), sonst droht eine Verklemmung. Nach der Sperre prueft der Link-Weg
 * erneut, ob die Aufgabe noch seiner Abteilung gehoert (HR kann sie in der
 * Zwischenzeit umgehaengt haben).
 * Wie bei statusAbgleichen (onboarding-status-abgleich.ts) ist die
 * Aufrufreihenfolge mit Mocks getestet, nicht das Sperrverhalten von Postgres.
 *
 * Mails gehen NACH dem Commit hinaus und nur bei einem echten Wechsel:
 *   - offboarding-task-completed (an HR, An-Feld in der Vorlage): Aufgabe
 *     offen → erledigt. Im Portal nur fuer Aufgaben einer Link-Abteilung (das
 *     eigene Haekchen einer HR-Aufgabe meldet HR nicht an sich selbst).
 *   - offboarding-department-completed (an die Abteilung): Abteilung offen →
 *     fertig, nur ueber den Link (hakt HR im Portal ab, bestaetigt HR nichts).
 * Nur-Kommentar-Aenderungen loesen keine Mail aus.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { triggerWebhooks } from "@/lib/webhooks";
import { offboardingMailFelder, type OffboardingMailVorgang } from "@/lib/offboarding-mail";
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
  type DienstAntwort,
} from "@/lib/abteilungsaufgaben";
import { aufgabeLinkPatchSchema, portalAufgabePatchSchema } from "@/lib/validations/abteilungsaufgaben";

// =============================================
// Anfragebremse je Link
// =============================================

/**
 * Zweite Bremse fuer PATCH ueber den Link — NACH der Tokenpruefung, Schluessel
 * ist die Link-ID. Die IP-Bremse (tokenRateLimiter, 20/min, gemeinsam fuer alle
 * Token-Routen) bleibt davor unveraendert: Ein Schluessel aus IP und Token
 * gaebe jedem geratenen Token einen eigenen Zaehler und schwaechte damit den
 * Schutz gegen Durchprobieren. 60/min je Link reicht fuer eine ganze Liste.
 */
export const linkAenderungsLimiter = createRateLimiter("abteilungsaufgaben-link", {
  maxRequests: 60,
  windowMs: 60 * 1000,
});

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

/**
 * Sperrt die Link-Zeilen dieser Schluessel bis zum Ende der Transaktion
 * (UPDATE auf updatedAt). Sortiert, damit zwei Transaktionen dieselben Zeilen
 * immer in derselben Reihenfolge sperren. Schluessel ohne Link: nichts zu tun.
 * Mehrfaches Sperren derselben Zeile in einer Transaktion ist harmlos.
 */
export async function linksSperren(
  tx: Prisma.TransactionClient,
  offboardingId: string,
  schluessel: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const sortiert = [...new Set(schluessel.filter((k): k is string => istLinkAbteilung(k)))].sort();
  for (const key of sortiert) {
    await tx.offboardingDepartmentLink.updateMany({
      where: { offboardingId, departmentKey: key },
      data: { updatedAt: new Date() },
    });
  }
}

/**
 * Berechnet den Abteilungsstatus der Links dieser Schluessel neu — INNERHALB
 * der Transaktion, NACH der Aenderung der Aufgabe. Sperrt selbst (siehe oben),
 * zaehlt die offenen Aufgaben und setzt bedingt:
 *   offen = 0  → allTasksComplete false → true, completedAt = jetzt  (FERTIG)
 *   offen > 0  → allTasksComplete true → false, completedAt = null   (WIEDER_OFFEN)
 * `uebergang` ist nur gesetzt, wenn DIESE Transaktion den Wechsel vollzogen hat.
 */
export async function linkStatusNeuBerechnen(
  tx: Prisma.TransactionClient,
  offboardingId: string,
  schluessel: ReadonlyArray<string | null | undefined>,
  jetzt: Date = new Date(),
): Promise<LinkUebergang[]> {
  await linksSperren(tx, offboardingId, schluessel);
  const ergebnis: LinkUebergang[] = [];
  const sortiert = [...new Set(schluessel.filter((k): k is string => istLinkAbteilung(k)))].sort();
  for (const key of sortiert) {
    const link = await tx.offboardingDepartmentLink.findUnique({
      where: { offboardingId_departmentKey: { offboardingId, departmentKey: key } },
      select: { id: true, email: true, departmentName: true, completedAt: true },
    });
    if (!link) continue;
    const [gesamt, offen] = await Promise.all([
      tx.offboardingChecklistItem.count({ where: { offboardingId, assigneeDepartment: key } }),
      tx.offboardingChecklistItem.count({ where: { offboardingId, assigneeDepartment: key, isCompleted: false } }),
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

/**
 * Hakt ab bzw. oeffnet wieder — nur, wenn die Aufgabe noch im anderen Zustand
 * ist (bedingtes updateMany). `true` = DIESER Aufruf hat gewechselt. Ueber den
 * Link bleibt completedById immer null (daran erkennt die Anzeige "per Link").
 */
export async function aufgabeUmschaltenPerLink(
  tx: Prisma.TransactionClient,
  opts: { itemId: string; erledigt: boolean; jetzt: Date },
): Promise<boolean> {
  const r = await tx.offboardingChecklistItem.updateMany({
    where: { id: opts.itemId, isCompleted: !opts.erledigt },
    data: {
      isCompleted: opts.erledigt,
      completedAt: opts.erledigt ? opts.jetzt : null,
      completedById: null,
    },
  });
  return r.count === 1;
}

/**
 * Setzt den Kommentar der Abteilung ("" = loeschen). Die interne HR-Notiz
 * (`notes`) wird nie angefasst. `geaendert` = der Text ist ein anderer.
 */
export async function kommentarSetzenPerLink(
  tx: Prisma.TransactionClient,
  opts: { itemId: string; text: string; jetzt: Date },
): Promise<{ geaendert: boolean; laenge: number }> {
  const neu = opts.text.trim();
  const vorher = await tx.offboardingChecklistItem.findUnique({
    where: { id: opts.itemId },
    select: { abteilungKommentar: true },
  });
  if ((vorher?.abteilungKommentar ?? "") === neu) return { geaendert: false, laenge: neu.length };
  await tx.offboardingChecklistItem.update({
    where: { id: opts.itemId },
    data: { abteilungKommentar: neu || null, abteilungKommentarAm: neu ? opts.jetzt : null },
  });
  return { geaendert: true, laenge: neu.length };
}

// =============================================
// Mails nach dem Commit
// =============================================

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

async function offeneImVorgang(offboardingId: string): Promise<number> {
  return prisma.offboardingChecklistItem.count({ where: { offboardingId, isCompleted: false } });
}

async function aufgabeErledigtMelden(opts: {
  vorgang: OffboardingMailVorgang;
  departmentKey: string | null;
  departmentName: string;
  item: { id: string; title: string; category: string; abteilungKommentar: string | null };
  offenInAbteilung: number;
  ueber: "LINK" | "PORTAL";
  completedById?: string;
}): Promise<void> {
  const offen = await offeneImVorgang(opts.vorgang.id);
  await triggerWebhooks("offboarding-task-completed", {
    ...offboardingMailFelder(opts.vorgang),
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

async function abteilungFertigMelden(vorgang: OffboardingMailVorgang, u: LinkUebergang, departmentKey: string) {
  await triggerWebhooks("offboarding-department-completed", {
    ...offboardingMailFelder(vorgang),
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
// Oeffentliche Seite: laden
// =============================================

const AUFGABE_OEFFENTLICH = {
  id: true,
  title: true,
  category: true,
  orderIndex: true,
  isCompleted: true,
  completedAt: true,
  dueDate: true,
  abteilungKommentar: true,
  abteilungKommentarAm: true,
} satisfies Prisma.OffboardingChecklistItemSelect;

const VORGANG_OEFFENTLICH = {
  id: true,
  displayId: true,
  status: true,
  employeeFirstName: true,
  employeeLastName: true,
  lastWorkingDay: true,
  organization: { select: { name: true, mandantNumber: true } },
} satisfies Prisma.OffboardingProcessSelect;

type AufgabeOeffentlich = Prisma.OffboardingChecklistItemGetPayload<{ select: typeof AUFGABE_OEFFENTLICH }>;

function fortschritt(aufgaben: ReadonlyArray<{ isCompleted: boolean }>) {
  const gesamt = aufgaben.length;
  const erledigt = aufgaben.filter((a) => a.isCompleted).length;
  return { gesamt, erledigt, prozent: gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 100 };
}

/**
 * GET /api/offboarding-tasks/[token] — die Aufgaben EINER Abteilung.
 *
 * Datensparsam: nur die eigenen Aufgaben (ohne interne HR-Notiz, ohne
 * Beschreibung, ohne Urheber), kein Fortschritt anderer Abteilungen, kein
 * Vorgangsstatus ausser `readOnly`.
 *
 *   404 { error: "Ungültiger Link" }
 *   410 { error: "Dieser Vorgang wurde abgebrochen. …" }   CANCELLED
 *   410 { error: "Dieser Link ist abgelaufen." }
 *   200 { data: { abteilung, vorgang, readOnly, gueltigBis, aufgaben, fortschritt, allTasksComplete } }
 *
 * Die IP-Bremse (tokenRateLimiter) prueft die Route VOR diesem Aufruf.
 */
export async function oeffentlicheAufgabenLaden(token: string, jetzt: Date = new Date()): Promise<DienstAntwort> {
  const link = await prisma.offboardingDepartmentLink.findUnique({
    where: { token },
    include: { offboarding: { select: VORGANG_OEFFENTLICH } },
  });
  if (!link) return { status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } };
  if (link.offboarding.status === "CANCELLED") {
    return { status: 410, body: { error: MELDUNGEN.VORGANG_ABGEBROCHEN } };
  }
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

  const aufgaben = await prisma.offboardingChecklistItem.findMany({
    where: { offboardingId: link.offboardingId, assigneeDepartment: link.departmentKey },
    orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    select: AUFGABE_OEFFENTLICH,
  });

  const v = link.offboarding;
  return {
    status: 200,
    body: {
      data: {
        abteilung: { key: link.departmentKey, name: link.departmentName },
        vorgang: {
          vorgangsnummer: v.displayId,
          mitarbeiterName: `${v.employeeFirstName} ${v.employeeLastName}`.trim(),
          einrichtung: v.organization?.name ?? "",
          bezugsdatum: v.lastWorkingDay.toISOString(),
        },
        readOnly: v.status === "COMPLETED",
        gueltigBis: link.expiresAt.toISOString(),
        aufgaben,
        fortschritt: fortschritt(aufgaben),
        allTasksComplete: link.allTasksComplete,
      },
    },
  };
}

// =============================================
// Oeffentliche Seite: abhaken / kommentieren
// =============================================

/**
 * PATCH /api/offboarding-tasks/[token]/[itemId].
 *
 * `rohBody` = geparstes JSON; kaputtes JSON gibt die Route als `undefined`
 * weiter (→ 400). Reihenfolge der Pruefungen:
 *   404 { error: "Ungültiger Link" }
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
  const link = await prisma.offboardingDepartmentLink.findUnique({
    where: { token },
    include: { offboarding: { select: VORGANG_OEFFENTLICH } },
  });
  if (!link) return { status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } };
  const vorgang = link.offboarding;
  if (vorgang.status === "CANCELLED") return { status: 410, body: { error: MELDUNGEN.VORGANG_ABGEBROCHEN } };
  if (link.expiresAt.getTime() < jetzt.getTime()) {
    return { status: 410, body: { error: MELDUNGEN.LINK_ABGELAUFEN } };
  }
  if (vorgang.status === "COMPLETED") {
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

  const item = await prisma.offboardingChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, offboardingId: true, assigneeDepartment: true, title: true },
  });
  if (!item || item.offboardingId !== link.offboardingId || item.assigneeDepartment !== link.departmentKey) {
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
    await linksSperren(tx, link.offboardingId, [link.departmentKey]);

    // Nach der Sperre erneut pruefen: Hat HR die Aufgabe inzwischen einer
    // anderen Abteilung zugeordnet (der Portal-PATCH sperrt dieselbe Zeile und
    // committet vorher), darf dieser Link sie nicht mehr aendern.
    const jetztZugeordnet = await tx.offboardingChecklistItem.findUnique({
      where: { id: item.id },
      select: { assigneeDepartment: true },
    });
    if (jetztZugeordnet?.assigneeDepartment !== link.departmentKey) {
      return { umgeschaltet: false, uebergaenge: [] as LinkUebergang[], fremd: true };
    }

    let umgeschaltet = false;
    if (isCompleted !== undefined) {
      umgeschaltet = await aufgabeUmschaltenPerLink(tx, { itemId: item.id, erledigt: isCompleted, jetzt });
      if (umgeschaltet) {
        await tx.auditLog.create({
          data: {
            userId: null,
            offboardingId: link.offboardingId,
            processType: "OFFBOARDING",
            action: isCompleted ? ABTEILUNGS_AUDIT.ERLEDIGT : ABTEILUNGS_AUDIT.WIEDER_GEOEFFNET,
            details: auditBasis,
          },
        });
      }
    }

    if (comment !== undefined && comment !== null) {
      const k = await kommentarSetzenPerLink(tx, { itemId: item.id, text: comment, jetzt });
      if (k.geaendert) {
        // Nur die Laenge — der Text steht an der Aufgabe, nicht im Protokoll.
        await tx.auditLog.create({
          data: {
            userId: null,
            offboardingId: link.offboardingId,
            processType: "OFFBOARDING",
            action: ABTEILUNGS_AUDIT.KOMMENTIERT,
            details: { ...auditBasis, laenge: k.laenge },
          },
        });
      }
    }

    const uebergaenge = umgeschaltet
      ? await linkStatusNeuBerechnen(tx, link.offboardingId, [link.departmentKey], jetzt)
      : [];
    for (const u of uebergaenge) {
      if (!u.uebergang) continue;
      await tx.auditLog.create({
        data: {
          userId: null,
          offboardingId: link.offboardingId,
          processType: "OFFBOARDING",
          action: u.uebergang === "FERTIG" ? ABTEILUNGS_AUDIT.ABTEILUNG_FERTIG : ABTEILUNGS_AUDIT.ABTEILUNG_WIEDER_OFFEN,
          details: { departmentKey: u.departmentKey, linkId: u.linkId, ueber: "LINK" },
        },
      });
    }
    return { umgeschaltet, uebergaenge, fremd: false };
  });
  if (fremd) return { status: 404, body: { error: MELDUNGEN.AUFGABE_NICHT_GEFUNDEN } };

  // Nach dem Commit: frischer Stand fuer Antwort und Mails.
  const aufgaben = await prisma.offboardingChecklistItem.findMany({
    where: { offboardingId: link.offboardingId, assigneeDepartment: link.departmentKey },
    orderBy: [{ category: "asc" }, { orderIndex: "asc" }],
    select: AUFGABE_OEFFENTLICH,
  });
  const aufgabe = aufgaben.find((a) => a.id === item.id) as AufgabeOeffentlich | undefined;
  const offenInAbteilung = aufgaben.filter((a) => !a.isCompleted).length;
  const u = uebergaenge.find((x) => x.departmentKey === link.departmentKey);

  if (umgeschaltet && isCompleted && aufgabe) {
    await nachDemCommit("offboarding-task-completed", () =>
      aufgabeErledigtMelden({
        vorgang,
        departmentKey: link.departmentKey,
        departmentName: link.departmentName,
        item: { id: aufgabe.id, title: aufgabe.title, category: aufgabe.category, abteilungKommentar: aufgabe.abteilungKommentar },
        offenInAbteilung,
        ueber: "LINK",
      }),
    );
  }
  if (u?.uebergang === "FERTIG") {
    await nachDemCommit("offboarding-department-completed", () =>
      abteilungFertigMelden(vorgang, u, link.departmentKey),
    );
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

// =============================================
// Portal: Aufgabe aendern (M9)
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
    await linksSperren(tx, vorgang.id, schluessel);

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
      const uebergaenge = await linkStatusNeuBerechnen(tx, vorgang.id, schluessel, jetzt);
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
        where: { offboardingId_departmentKey: { offboardingId: vorgang.id, departmentKey: key } },
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
        vorgang,
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
  // Urheber: meist die aufrufende Person; hat jemand anderes abgehakt (nur
  // Notiz geaendert), deren Namen nachschlagen.
  let benutzer: Record<string, string> = {};
  if (nachher.completedById === opts.session.userId) {
    benutzer = { [opts.session.userId]: `${opts.session.firstName} ${opts.session.lastName}`.trim() };
  } else if (nachher.completedById) {
    const u = await prisma.user.findUnique({
      where: { id: nachher.completedById },
      select: { firstName: true, lastName: true },
    });
    if (u) benutzer = { [nachher.completedById]: `${u.firstName} ${u.lastName}`.trim() };
  }
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
