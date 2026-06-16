/**
 * Starterpaket-Versand.
 *
 * Sammelt die markierten, aktiven Pool-Dokumente eines Mandanten (in Reihenfolge),
 * haengt sie als einzelne PDFs an die Willkommens-Mail (Event
 * "onboarding-starter-packet-sent") und protokolliert den Versand rechtssicher:
 * Zeitstempel am Vorgang + AuditLog (Dokumentnamen + SHA-256-Hashes) + EmailLog
 * (ueber den Mailer). Der Zeitstempel wird nur bei tatsaechlichem SENT gesetzt.
 *
 * Zustellung: einzelne PDF-Anhaenge (kein Merge) — daher kein Gotenberg noetig.
 */
import { prisma } from "@/lib/db";
import { readUploadedFile } from "@/lib/file-upload";
import { sendEventEmail, type MailAttachment } from "@/lib/mailer";

export interface StarterpaketSendResult {
  status: "SENT" | "FAILED" | "SKIPPED" | "NO_DOCS";
  detail?: string;
  /** Versendete Dokumente (Name + Hash) — fuer die UI-Rueckmeldung. */
  dokumente?: { name: string; hash: string }[];
}

interface PoolDoc {
  id: string;
  name: string;
  dateipfad: string;
  originalName: string;
  hash: string;
}

/** Markierte, aktive Pool-Dokumente eines Mandanten in konfigurierter Reihenfolge. */
export async function resolveStarterpaketDokumente(
  organizationId: string,
): Promise<PoolDoc[]> {
  const auswahl = await prisma.starterpaketAuswahl.findMany({
    where: { organizationId, dokument: { isActive: true } },
    orderBy: { orderIndex: "asc" },
    select: {
      dokument: {
        select: {
          id: true,
          name: true,
          dateipfad: true,
          originalName: true,
          hash: true,
        },
      },
    },
  });
  return auswahl.map((a) => a.dokument);
}

/** Erzeugt einen sauberen, fuer den Empfaenger lesbaren PDF-Dateinamen. */
function attachmentName(doc: PoolDoc): string {
  const base =
    doc.originalName && doc.originalName.toLowerCase().endsWith(".pdf")
      ? doc.originalName
      : `${doc.name}.pdf`;
  return base.replace(/[\r\n"]/g, "").slice(0, 150);
}

export async function sendStarterpaket(opts: {
  onboardingId: string;
  userId: string;
  ipAddress?: string | null;
}): Promise<StarterpaketSendResult> {
  const ob = await prisma.onboardingProcess.findUnique({
    where: { id: opts.onboardingId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      displayId: true,
      organizationId: true,
      organization: { select: { name: true } },
      personalData: { select: { firstName: true, lastName: true } },
    },
  });
  if (!ob) return { status: "FAILED", detail: "Vorgang nicht gefunden" };

  const docs = await resolveStarterpaketDokumente(ob.organizationId);
  if (docs.length === 0) {
    return {
      status: "NO_DOCS",
      detail: "Keine Starterpaket-Dokumente fuer diesen Mandanten konfiguriert.",
    };
  }

  // PDFs laden -> einzelne Anhaenge (readUploadedFile schuetzt vor Pfad-Injection)
  const attachments: MailAttachment[] = [];
  for (const doc of docs) {
    try {
      const content = await readUploadedFile(doc.dateipfad);
      attachments.push({
        filename: attachmentName(doc),
        content,
        contentType: "application/pdf",
      });
    } catch {
      return {
        status: "FAILED",
        detail: `Dokument "${doc.name}" konnte nicht geladen werden (fehlt im Speicher).`,
      };
    }
  }

  const vorname = ob.personalData?.firstName || ob.firstName || "";
  const nachname = ob.personalData?.lastName || ob.lastName || "";
  const payload: Record<string, unknown> = {
    onboardingId: ob.id,
    displayId: ob.displayId,
    email: ob.email,
    vorname,
    nachname,
    organization: ob.organization?.name ?? "",
    anzahlDokumente: docs.length,
  };

  const result = await sendEventEmail("onboarding-starter-packet-sent", payload, {
    attachments,
  });

  if (result.status !== "SENT") {
    return { status: result.status, detail: result.detail };
  }

  // Nur bei echtem Versand: Nachweis schreiben (Zeitstempel + Audit mit Hashes).
  const dokumente = docs.map((d) => ({ name: d.name, hash: d.hash }));
  await prisma.onboardingProcess.update({
    where: { id: ob.id },
    data: {
      starterPacketSentAt: new Date(),
      starterPacketSentCount: { increment: 1 },
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: opts.userId,
      onboardingId: ob.id,
      processType: "ONBOARDING",
      action: "STARTERPAKET_SENT",
      details: { empfaenger: ob.email, anzahl: docs.length, dokumente },
      ipAddress: opts.ipAddress ?? null,
    },
  });

  return { status: "SENT", dokumente };
}
