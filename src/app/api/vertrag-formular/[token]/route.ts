/**
 * API: /api/vertrag-formular/:token  (OEFFENTLICH, Magic-Link)
 *
 * Vorgesetzte:r fuellt im Strang A die neuen Vertragsdaten aus.
 * GET  – Vorgang + bisherige Vertragsdaten laden (keine sensiblen Felder)
 * PUT  – Zwischenspeichern (Auto-Save)
 * POST – Endgueltig absenden -> Status VERTRAG_ERSTELLT
 *
 * Kein Login: Zugriff ausschliesslich ueber den gueltigen supervisorToken.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { renewalDataSchema, type RenewalDataInput } from "@/lib/validations/contract-end";

type LoadedContractEnd = Prisma.ContractEndProcessGetPayload<{
  include: {
    organization: { select: { name: true; mandantNumber: true } };
    renewalData: true;
  };
}>;

async function loadByToken(token: string): Promise<LoadedContractEnd | null> {
  if (!token || token.length < 10) return null;
  return prisma.contractEndProcess.findFirst({
    where: { supervisorToken: token },
    include: {
      organization: { select: { name: true, mandantNumber: true } },
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
  if (["ENTSCHEIDUNG_KEINE_UEBERNAHME", "ABGESCHLOSSEN", "STORNIERT"].includes(ce.status)) {
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
  return d;
}

// =============================================
// GET – Formulardaten laden
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const ce = await loadByToken(token);
    const state = tokenState(ce);
    if (!state.ok || !ce) {
      return NextResponse.json({ error: state.reason }, { status: 410 });
    }

    return NextResponse.json({
      displayId: ce.displayId,
      employeeName: `${ce.employeeFirstName} ${ce.employeeLastName}`,
      contractStartDate: ce.contractStartDate,
      contractEndDate: ce.contractEndDate,
      organization: ce.organization.name,
      status: ce.status,
      alreadySubmitted: ce.status === "VERTRAG_ERSTELLT" || Boolean(ce.renewalData?.isComplete),
      renewalData: ce.renewalData,
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
    const { token } = await params;
    const ce = await loadByToken(token);
    const state = tokenState(ce);
    if (!state.ok || !ce) {
      return NextResponse.json({ error: state.reason }, { status: 410 });
    }
    if (ce.renewalData?.isComplete) {
      return NextResponse.json(
        { error: "Die Daten wurden bereits abgesendet." },
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
    const { token } = await params;
    const ce = await loadByToken(token);
    const state = tokenState(ce);
    if (!state.ok || !ce) {
      return NextResponse.json({ error: state.reason }, { status: 410 });
    }
    if (ce.renewalData?.isComplete) {
      return NextResponse.json(
        { error: "Die Daten wurden bereits abgesendet." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
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
        data: { status: "VERTRAG_ERSTELLT" },
      });
      await tx.auditLog.create({
        data: {
          contractEndId: ce.id,
          processType: "CONTRACT_END",
          action: "RENEWAL_DATA_SUBMITTED",
          details: { displayId: ce.displayId },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Fehler beim Absenden des Vertrag-Formulars:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
