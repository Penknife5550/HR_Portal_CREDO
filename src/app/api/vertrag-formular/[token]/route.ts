/**
 * API: /api/vertrag-formular/:token  (OEFFENTLICH, Magic-Link)
 *
 * Vorgesetzte:r ENTSCHEIDET im Strang A ueber die Uebernahme und fuellt bei Ja
 * die neuen Vertragsdaten aus.
 * GET  – Vorgang + bisherige Daten laden (keine sensiblen Felder)
 * PUT  – Zwischenspeichern der Vertragsdaten (Auto-Save, nur relevant bei Ja)
 * POST – Rueckmeldung verbindlich absenden:
 *          Ja   -> Status RUECKMELDUNG_UEBERNAHME (+ Vertragsdaten)
 *          Nein -> Status RUECKMELDUNG_KEINE_UEBERNAHME (+ Begruendung)
 *
 * Kein Login: Zugriff ausschliesslich ueber den gueltigen supervisorToken.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { tokenRateLimiter, getClientIp } from "@/lib/rate-limit";
import {
  renewalDataSchema,
  supervisorDecisionSchema,
  type RenewalDataInput,
} from "@/lib/validations/contract-end";
import { resolveContractEndFieldConfig } from "@/lib/contract-end-fields";

/** Rate-Limit-Schutz gegen Token-Enumeration (wie alle Public-Token-Routen). */
function rateLimited(request: NextRequest): NextResponse | null {
  if (!tokenRateLimiter.check(getClientIp(request)).allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      { status: 429 },
    );
  }
  return null;
}

type LoadedContractEnd = Prisma.ContractEndProcessGetPayload<{
  include: {
    organization: { select: { id: true; name: true; mandantNumber: true; contractEndFieldConfig: true } };
    renewalData: true;
  };
}>;

async function loadByToken(token: string): Promise<LoadedContractEnd | null> {
  if (!token || token.length < 10) return null;
  return prisma.contractEndProcess.findFirst({
    where: { supervisorToken: token },
    include: {
      organization: { select: { id: true, name: true, mandantNumber: true, contractEndFieldConfig: true } },
      renewalData: true,
    },
  });
}

/** Prueft, ob der Token aktuell bearbeitbar ist (konstante Fehlermeldung). */
function tokenState(ce: LoadedContractEnd | null): { ok: boolean; reason?: string } {
  if (!ce || !ce.supervisorToken) return { ok: false, reason: "Link ungültig" };
  if (!ce.supervisorTokenExpiresAt || ce.supervisorTokenExpiresAt < new Date()) {
    return { ok: false, reason: "Der Link ist abgelaufen. Bitte fordern Sie einen neuen an." };
  }
  // Bearbeitbar nur, solange die Anfrage offen ist (ENTSCHEIDUNG_UEBERNAHME = Alt-Bestandsdaten).
  if (!["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"].includes(ce.status)) {
    return { ok: false, reason: "Dieser Vorgang kann nicht mehr bearbeitet werden." };
  }
  return { ok: true };
}

/** Zod-Eingabe (Strings) in Prisma-Felder (Dates) umwandeln. */
function mapRenewalData(input: RenewalDataInput): Record<string, unknown> {
  const d: Record<string, unknown> = { ...input };
  if (input.vertragsbeginn !== undefined) {
    d.vertragsbeginn = input.vertragsbeginn ? new Date(input.vertragsbeginn) : null;
  }
  if (input.vertragsende !== undefined) {
    d.vertragsende = input.vertragsende ? new Date(input.vertragsende) : null;
  }
  if (input.betriebsstaetteOrgId !== undefined) {
    d.betriebsstaetteOrgId = input.betriebsstaetteOrgId || null;
  }
  return d;
}

// =============================================
// GET – Formulardaten laden
// =============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const limited = rateLimited(request);
    if (limited) return limited;
    const { token } = await params;
    const ce = await loadByToken(token);
    const state = tokenState(ce);
    if (!state.ok || !ce) {
      return NextResponse.json({ error: state.reason }, { status: 410 });
    }

    const fieldConfig = resolveContractEndFieldConfig(ce.organization.contractEndFieldConfig);
    const betriebsstaetten = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true, mandantNumber: true },
      orderBy: { name: "asc" },
    });

    // Vorbefuellung aus den n8n-/DokuBit-Daten des AKTUELLEN Vertrags —
    // Vorgesetzte aendern nur, was sich aendert. Bewusst KEINE Adress-/
    // Geburtsdaten (im Formular nicht gebraucht, Datenminimierung).
    const dokubit = (ce.dokubitDaten ?? {}) as Record<string, string>;
    // Probezeit-Monate nur ableiten, wenn DokuBit in Monaten rechnet
    const probezeitMonate =
      dokubit.probezeitDauer && /^monat/i.test(dokubit.probezeitEinheit || "")
        ? parseInt(dokubit.probezeitDauer, 10) || null
        : null;
    // Kandidat fuer den neuen Vertragsbeginn: Tag nach dem alten Vertragsende
    const beginnKandidat = new Date(ce.contractEndDate);
    beginnKandidat.setDate(beginnKandidat.getDate() + 1);
    const vorbefuellung = {
      vertragsbeginn: beginnKandidat.toISOString().slice(0, 10),
      wochenstunden: ce.currentWochenstunden,
      entgeltgruppe: ce.currentEntgeltgruppe,
      stufe: ce.currentStufe,
      stellenbeschreibung: ce.currentPosition,
      ...(probezeitMonate ? { probezeitMonate } : {}),
    };

    return NextResponse.json({
      displayId: ce.displayId,
      employeeName: `${ce.employeeFirstName} ${ce.employeeLastName}`,
      contractStartDate: ce.contractStartDate,
      contractEndDate: ce.contractEndDate,
      organization: ce.organization.name,
      organizationId: ce.organization.id,
      fieldConfig,
      betriebsstaetten,
      status: ce.status,
      decision: ce.decision,
      declineReason: ce.supervisorDeclineReason,
      alreadySubmitted:
        Boolean(ce.supervisorRespondedAt) ||
        Boolean(ce.renewalData?.isComplete) ||
        ["RUECKMELDUNG_UEBERNAHME", "RUECKMELDUNG_KEINE_UEBERNAHME", "VERTRAG_ERSTELLT", "VERTRAG_UNTERSCHRIEBEN"].includes(
          ce.status,
        ),
      renewalData: ce.renewalData,
      vorbefuellung,
    });
  } catch (error) {
    console.error("Fehler beim Laden des Vertrag-Formulars:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// PUT – Zwischenspeichern (Auto-Save)
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const limited = rateLimited(request);
    if (limited) return limited;
    const { token } = await params;
    const ce = await loadByToken(token);
    const state = tokenState(ce);
    if (!state.ok || !ce) {
      return NextResponse.json({ error: state.reason }, { status: 410 });
    }
    if (ce.supervisorRespondedAt || ce.renewalData?.isComplete) {
      return NextResponse.json(
        { error: "Ihre Rückmeldung wurde bereits abgesendet." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = renewalDataSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const data = mapRenewalData(parsed.data);

    await prisma.contractRenewalData.upsert({
      where: { contractEndId: ce.id },
      update: data,
      create: { contractEndId: ce.id, ...data },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Fehler beim Speichern des Vertrag-Formulars:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

// =============================================
// POST – Endgueltig absenden
// =============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const limited = rateLimited(request);
    if (limited) return limited;
    const { token } = await params;
    const ce = await loadByToken(token);
    const state = tokenState(ce);
    if (!state.ok || !ce) {
      return NextResponse.json({ error: state.reason }, { status: 410 });
    }
    if (ce.supervisorRespondedAt || ce.renewalData?.isComplete) {
      return NextResponse.json(
        { error: "Ihre Rückmeldung wurde bereits abgesendet." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const decisionParsed = supervisorDecisionSchema.safeParse(body);
    if (!decisionParsed.success) {
      return NextResponse.json(
        { error: decisionParsed.error.errors[0].message },
        { status: 400 }
      );
    }
    const { decision, declineReason, vorstandAbgestimmt, vorstandAbstimmungVermerk } =
      decisionParsed.data;
    const now = new Date();

    if (decision === "UEBERNAHME") {
      // Vorstand-/GF-Abstimmung: Pflichtangabe bei Uebernahme, sofern das Feld
      // laut Mandanten-Config sichtbar ist (Mandanten ohne Vorstand koennen es
      // in der Vertragsende-Konfiguration ausblenden).
      const fieldConfig = resolveContractEndFieldConfig(ce.organization.contractEndFieldConfig);
      const vorstandFeldSichtbar =
        fieldConfig.find((f) => f.name === "vorstandAbstimmung")?.visible ?? true;
      if (vorstandFeldSichtbar && typeof vorstandAbgestimmt !== "boolean") {
        return NextResponse.json(
          {
            error:
              "Bitte beantworten Sie die Frage zur Abstimmung mit Vorstand/Geschäftsführung.",
          },
          { status: 400 },
        );
      }

      // Ja -> Vertragsdaten erfassen, HR vollzieht anschliessend (Vertrag erzeugen)
      const parsed = renewalDataSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
      }
      const data = mapRenewalData(parsed.data);
      await prisma.$transaction(async (tx) => {
        await tx.contractRenewalData.upsert({
          where: { contractEndId: ce.id },
          update: { ...data, isComplete: true },
          create: { contractEndId: ce.id, ...data, isComplete: true },
        });
        await tx.contractEndProcess.update({
          where: { id: ce.id },
          data: {
            status: "RUECKMELDUNG_UEBERNAHME",
            decision: "UEBERNAHME",
            supervisorRespondedAt: now,
            decidedAt: now,
            vorstandAbgestimmt: vorstandAbgestimmt ?? null,
            vorstandAbstimmungVermerk: vorstandAbgestimmt
              ? vorstandAbstimmungVermerk?.trim() || null
              : null,
          },
        });
        await tx.auditLog.create({
          data: {
            contractEndId: ce.id,
            processType: "CONTRACT_END",
            action: "SUPERVISOR_DECISION_UEBERNAHME",
            details: {
              displayId: ce.displayId,
              vorstandAbgestimmt: vorstandAbgestimmt ?? null,
              ...(vorstandAbgestimmt && vorstandAbstimmungVermerk
                ? { vorstandAbstimmungVermerk: vorstandAbstimmungVermerk.trim() }
                : {}),
            },
          },
        });
      });
    } else {
      // Nein -> Begruendung speichern, HR bestaetigt anschliessend das Offboarding
      await prisma.$transaction(async (tx) => {
        await tx.contractEndProcess.update({
          where: { id: ce.id },
          data: {
            status: "RUECKMELDUNG_KEINE_UEBERNAHME",
            decision: "KEINE_UEBERNAHME",
            supervisorDeclineReason: declineReason ?? null,
            supervisorRespondedAt: now,
            decidedAt: now,
          },
        });
        await tx.auditLog.create({
          data: {
            contractEndId: ce.id,
            processType: "CONTRACT_END",
            action: "SUPERVISOR_DECISION_KEINE_UEBERNAHME",
            details: { displayId: ce.displayId, declineReason },
          },
        });
      });
    }

    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    console.error("Fehler beim Absenden des Vertrag-Formulars:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
