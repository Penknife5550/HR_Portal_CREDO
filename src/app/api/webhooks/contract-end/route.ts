/**
 * API: /api/webhooks/contract-end
 *
 * POST – Eingang der Vertragsende-Meldungen aus n8n (liest DokuBit, Phase 2).
 *
 * Auth wie die Cron-Routen: Bearer CRON_SECRET (timing-safe verglichen).
 * Der Body ist EIN Eintrag (Objekt) oder ein Batch (Array, max. 200) —
 * der woechentliche n8n-Flow kann alle Zeilen in einem Request liefern.
 *
 * Verhalten je Eintrag (1 Eintrag = 1 Einstellung = 1 Vorgang):
 *   - Mandant unbekannt            -> Eintrag-Fehler (Batch laeuft weiter)
 *   - kein offener Vorgang         -> Vorgang anlegen (source N8N), Employee
 *                                     per Personalnummer verknuepfen
 *   - offener Vorgang, gleiches
 *     Vertragsende                 -> idempotent: "unveraendert" (B8);
 *                                     Vorausfuell-/Historie-Felder still auffrischen
 *   - offener Vorgang, ANDERES
 *     Vertragsende                 -> Update statt Neuanlage (B9) + AuditLog
 *   - nur abgeschlossene/stornierte
 *     Vorgaenge vorhanden          -> neue Befristung -> Neuanlage
 *
 * Mehrfach-Erkennung: `personalMandanten` (alle Mandanten-Zuordnungen der
 * Person) wird im AuditLog festgehalten und im Ergebnis gespiegelt — bewusst
 * KEIN Teil-Offboarding (Entscheidung B5: HR prueft selbst).
 *
 * Antwort: HTTP 200 mit Ergebnis je Eintrag; Eintrag-Fehler brechen den Batch
 * NICHT ab (n8n soll nicht wegen einer kaputten Zeile alles wiederholen).
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { createContractEndProcess } from "@/lib/contract-end";
import {
  contractEndWebhookSchema,
  type ContractEndWebhookInput,
} from "@/lib/validations/contract-end";

const MAX_BATCH_SIZE = 200;

// Endstadien: Vorgaenge in diesen Status blockieren keine Neuanlage
// (eine neue Meldung ist dann eine neue Befristung).
const FINAL_STATUS = ["ABGESCHLOSSEN", "STORNIERT"] as const;

/** Timing-Safe String-Vergleich (verhindert Timing-Attacken auf CRON_SECRET). */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

type ItemResult = {
  index: number;
  status: "angelegt" | "aktualisiert" | "unveraendert" | "fehler";
  displayId?: string;
  mehrfach?: boolean;
  fehler?: string;
};

/** Beide Datumsangaben auf denselben Kalendertag pruefen (Zeitanteil egal). */
function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

async function processEintrag(
  eintrag: ContractEndWebhookInput,
  index: number,
): Promise<ItemResult> {
  const org = await prisma.organization.findUnique({
    where: { mandantNumber: eintrag.mandantNummer },
    select: { id: true, name: true, shortName: true, mandantNumber: true },
  });
  if (!org) {
    return {
      index,
      status: "fehler",
      fehler: `Mandant "${eintrag.mandantNummer}" unbekannt`,
    };
  }

  const personalNr = eintrag.personalNr?.trim() || null;
  const email = eintrag.email?.trim() || null;
  const mehrfach = (eintrag.personalMandanten?.length ?? 0) > 1;
  // Weitere Mandanten der Person (ohne den eigenen) — Hinweis fuer HR (B5-light)
  const weitereMandanten = (eintrag.personalMandanten ?? []).filter(
    (m) => m !== eintrag.mandantNummer,
  );

  // DokuBit-Stammdaten: leere Strings verwerfen, nur belegte Werte speichern
  const dokubitDaten: Record<string, string> = {};
  for (const [key, value] of Object.entries(eintrag.stammdaten ?? {})) {
    if (typeof value === "string" && value.trim() !== "") dokubitDaten[key] = value.trim();
  }
  const hatStammdaten = Object.keys(dokubitDaten).length > 0;

  // Personen-Schluessel fuer die Dedup-Suche: Personalnummer bevorzugt,
  // sonst E-Mail (DokuBit liefert nicht immer beides).
  const personWhere = personalNr
    ? { employeePersonalNr: personalNr }
    : email
      ? { employeeEmail: { equals: email, mode: "insensitive" as const } }
      : {
          employeeFirstName: { equals: eintrag.vorname, mode: "insensitive" as const },
          employeeLastName: { equals: eintrag.nachname, mode: "insensitive" as const },
        };

  const offenerVorgang = await prisma.contractEndProcess.findFirst({
    where: {
      organizationId: org.id,
      status: { notIn: [...FINAL_STATUS] },
      ...personWhere,
    },
    orderBy: { createdAt: "desc" },
  });

  const vertragsende = new Date(eintrag.vertragsende);
  const vertragsbeginn = eintrag.vertragsbeginn ? new Date(eintrag.vertragsbeginn) : null;

  // Vorausfuell-/Historie-Felder (nur setzen, was n8n mitliefert)
  const prefillData = {
    ...(eintrag.aktuellePosition ? { currentPosition: eintrag.aktuellePosition } : {}),
    ...(eintrag.aktuelleEntgeltgruppe
      ? { currentEntgeltgruppe: eintrag.aktuelleEntgeltgruppe }
      : {}),
    ...(eintrag.aktuelleStufe ? { currentStufe: eintrag.aktuelleStufe } : {}),
    ...(eintrag.aktuelleWochenstunden != null
      ? { currentWochenstunden: eintrag.aktuelleWochenstunden }
      : {}),
    ...(eintrag.befristungsart ? { befristungsart: eintrag.befristungsart } : {}),
    ...(eintrag.bisherigeBefristungMonate != null
      ? { bisherigeBefristungMonate: eintrag.bisherigeBefristungMonate }
      : {}),
    ...(eintrag.bisherigeVerlaengerungen != null
      ? { bisherigeVerlaengerungen: eintrag.bisherigeVerlaengerungen }
      : {}),
    ...(hatStammdaten ? { dokubitDaten } : {}),
    // Sobald n8n personalMandanten mitliefert, ist die Liste autoritativ —
    // auch eine LEERE Liste (Mehrfachbeschaeftigung beendet) muss den alten
    // Wert ueberschreiben. Nur bei fehlendem Feld nicht anfassen.
    ...(eintrag.personalMandanten !== undefined ? { weitereMandanten } : {}),
  };

  if (offenerVorgang) {
    const endeUnveraendert = sameDay(new Date(offenerVorgang.contractEndDate), vertragsende);

    if (endeUnveraendert) {
      // B8 Idempotenz: gleicher offener Vorgang, gleiches Ende -> kein Duplikat.
      // Vorausfuell-Daten trotzdem auffrischen (n8n kann spaeter mehr liefern).
      if (Object.keys(prefillData).length > 0) {
        await prisma.contractEndProcess.update({
          where: { id: offenerVorgang.id },
          data: prefillData,
        });
      }
      return { index, status: "unveraendert", displayId: offenerVorgang.displayId, mehrfach };
    }

    // B9 Vertragsaenderung: Ende hat sich verschoben -> Update statt Neuanlage.
    // Ist der Vorgang schon weit fortgeschritten (Uebernahme laeuft), wurde die
    // Verlaengerung vermutlich bereits in LOGA vollzogen -> HR-Hinweis-Marker.
    const weitFortgeschritten = [
      "RUECKMELDUNG_UEBERNAHME",
      "VERTRAG_ERSTELLT",
      "VERTRAG_UNTERSCHRIEBEN",
    ].includes(offenerVorgang.status);
    await prisma.$transaction([
      prisma.contractEndProcess.update({
        where: { id: offenerVorgang.id },
        data: {
          contractEndDate: vertragsende,
          ...(vertragsbeginn ? { contractStartDate: vertragsbeginn } : {}),
          ...(weitFortgeschritten ? { contractEndDateGeaendertAm: new Date() } : {}),
          ...prefillData,
        },
      }),
      prisma.auditLog.create({
        data: {
          contractEndId: offenerVorgang.id,
          processType: "CONTRACT_END",
          action: "CONTRACT_END_UPDATED_BY_WEBHOOK",
          details: {
            altesVertragsende: new Date(offenerVorgang.contractEndDate).toISOString(),
            neuesVertragsende: vertragsende.toISOString(),
            quelle: "N8N",
            ...(mehrfach ? { personalMandanten: eintrag.personalMandanten } : {}),
          },
        },
      }),
    ]);
    return { index, status: "aktualisiert", displayId: offenerVorgang.displayId, mehrfach };
  }

  // Neuanlage — Employee-Verknuepfung per Personalnummer (unique in LOGA-Import)
  let employeeId: string | null = null;
  if (personalNr) {
    const employee = await prisma.employee.findUnique({
      where: { personalNumber: personalNr },
      select: { id: true },
    });
    employeeId = employee?.id ?? null;
  }

  const created = await createContractEndProcess({
    organization: org,
    employeeEmail: email || "",
    employeeFirstName: eintrag.vorname,
    employeeLastName: eintrag.nachname,
    employeePersonalNr: personalNr,
    employeeId,
    contractEndDate: vertragsende,
    contractStartDate: vertragsbeginn,
    source: "N8N",
    ...prefillData,
  });

  // Mehrfach-Erkennung im Audit festhalten (Info fuer HR, kein Teil-Offboarding)
  if (mehrfach) {
    await prisma.auditLog.create({
      data: {
        contractEndId: created.id,
        processType: "CONTRACT_END",
        action: "CONTRACT_END_MEHRFACH_ERKANNT",
        details: {
          personalMandanten: eintrag.personalMandanten,
          hinweis: "Person hat weitere Einstellungen bei anderen Mandanten",
        },
      },
    });
  }

  return { index, status: "angelegt", displayId: created.displayId, mehrfach };
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (error) {
    console.error("[ContractEndWebhook] Schwerer Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

async function handlePost(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET nicht konfiguriert" }, { status: 500 });
  }
  if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const eintraege: unknown[] = Array.isArray(body) ? body : [body];
  if (eintraege.length === 0) {
    return NextResponse.json({ error: "Leerer Batch" }, { status: 400 });
  }
  if (eintraege.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Maximal ${MAX_BATCH_SIZE} Einträge pro Request` },
      { status: 400 },
    );
  }

  const results: ItemResult[] = [];
  for (let i = 0; i < eintraege.length; i++) {
    const parsed = contractEndWebhookSchema.safeParse(eintraege[i]);
    if (!parsed.success) {
      results.push({ index: i, status: "fehler", fehler: parsed.error.errors[0].message });
      continue;
    }
    try {
      results.push(await processEintrag(parsed.data, i));
    } catch (err) {
      console.error(`[ContractEndWebhook] Fehler bei Eintrag ${i}:`, err);
      results.push({ index: i, status: "fehler", fehler: "Interner Fehler bei diesem Eintrag" });
    }
  }

  const summary = {
    angelegt: results.filter((r) => r.status === "angelegt").length,
    aktualisiert: results.filter((r) => r.status === "aktualisiert").length,
    unveraendert: results.filter((r) => r.status === "unveraendert").length,
    fehler: results.filter((r) => r.status === "fehler").length,
  };

  return NextResponse.json({ success: summary.fehler === 0, summary, results });
}
