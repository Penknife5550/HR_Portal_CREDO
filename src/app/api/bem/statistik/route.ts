/**
 * API: GET /api/bem/statistik — Anonymisierter IKS-/BEM-Report (§ 167 SGB IX)
 *
 * Liefert ausschliesslich AGGREGIERTE, anonyme Kennzahlen (reine Anzahlen je
 * Mandant) — KEINE personenbezogenen Inhalte, keine Namen, keine Fall-IDs.
 * Genau deshalb ist dies die einzige BEM-Sicht, die bewusst NICHT der
 * "versiegelten Akte" (per-Fall-Allowlist) unterliegt: Zahlen ohne Personenbezug
 * sind fuer das interne Kontrollsystem / die BEM-Steuerung legitim einsehbar.
 *
 * Zugriff: nur wer BEM-Freigaben verwalten darf (canManageBemAccess =
 * SUPER_ADMIN/HR_LEITUNG). Org-eingeschraenkte Rollen sehen nur ihre Mandanten
 * (orgFilter).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageBemAccess, orgFilter } from "@/lib/permissions";

type Phase = "inBearbeitung" | "abgelehnt" | "abgebrochen" | "abgeschlossen";

interface FallRow {
  organizationId: string;
  status: string;
  einladungAm: Date | null;
  datenschutzAm: Date | null;
  ergebnis: string | null;
  createdAt: Date;
  organization: { name: string; mandantNumber: string } | null;
}

// Genau ein Status-Bucket je Fall (summiert sich auf "gesamt").
function phaseOf(f: FallRow): Phase {
  switch (f.status) {
    case "EINWILLIGUNG_ABGELEHNT":
      return "abgelehnt";
    case "ABGEBROCHEN":
      return "abgebrochen";
    case "ABGESCHLOSSEN":
      return "abgeschlossen";
    case "AUFBEWAHRUNG":
    case "GELOESCHT":
      // Nachlauf-Phase: Ergebnis gesetzt -> regulaer abgeschlossen, sonst Abbruch.
      return f.ergebnis ? "abgeschlossen" : "abgebrochen";
    default:
      // ANGELEGT, EINLADUNG_VERSENDET, EINWILLIGUNG_ERTEILT, ERSTGESPRAECH,
      // MASSNAHMEN_LAUFEN
      return "inBearbeitung";
  }
}

function emptyAgg() {
  return {
    gesamt: 0,
    // Status-Verteilung (Momentaufnahme, Summe = gesamt)
    inBearbeitung: 0,
    abgelehnt: 0,
    abgebrochen: 0,
    abgeschlossen: 0,
    // Verfahrens-Funnel (kumuliert, kann ueberlappen)
    angeboten: 0, // Einladung versendet (einladungAm gesetzt)
    angenommen: 0, // Einwilligung erteilt (datenschutzAm gesetzt)
    // Ergebnis der abgeschlossenen Verfahren
    ergErfolgreich: 0,
    ergTeilweise: 0,
    ergKeinErfolg: 0,
    ergKeineMassnahmen: 0,
  };
}

type Agg = ReturnType<typeof emptyAgg>;

function applyFall(agg: Agg, f: FallRow) {
  agg.gesamt += 1;
  agg[phaseOf(f)] += 1;
  if (f.einladungAm) agg.angeboten += 1;
  if (f.datenschutzAm) agg.angenommen += 1;
  switch (f.ergebnis) {
    case "ERFOLGREICH":
      agg.ergErfolgreich += 1;
      break;
    case "TEILWEISE":
      agg.ergTeilweise += 1;
      break;
    case "KEIN_ERFOLG":
      agg.ergKeinErfolg += 1;
      break;
    case "KEINE_MASSNAHMEN_NOETIG":
      agg.ergKeineMassnahmen += 1;
      break;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    if (!canManageBemAccess(session)) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const jahrParam = searchParams.get("jahr");
    const jahr =
      jahrParam && /^\d{4}$/.test(jahrParam) ? parseInt(jahrParam, 10) : null;

    // Org-Scope (global = keine Einschraenkung). Bewusst KEIN bemFilter:
    // anonyme Aggregate spannen alle Faelle des Scopes, nicht nur freigegebene.
    const where = await orgFilter(session);

    const faelle = (await prisma.bemFall.findMany({
      where,
      select: {
        organizationId: true,
        status: true,
        einladungAm: true,
        datenschutzAm: true,
        ergebnis: true,
        createdAt: true,
        organization: { select: { name: true, mandantNumber: true } },
      },
    })) as FallRow[];

    // Verfuegbare Jahre (ueber den gesamten Scope, unabhaengig vom Filter).
    const verfuegbareJahre = Array.from(
      new Set(faelle.map((f) => f.createdAt.getFullYear())),
    ).sort((a, b) => b - a);

    const gefiltert = jahr
      ? faelle.filter((f) => f.createdAt.getFullYear() === jahr)
      : faelle;

    // Aggregation je Mandant + Gesamt.
    const perOrg = new Map<
      string,
      { mandant: string; mandantNumber: string; agg: Agg }
    >();
    const gesamtAgg = emptyAgg();

    for (const f of gefiltert) {
      applyFall(gesamtAgg, f);
      let entry = perOrg.get(f.organizationId);
      if (!entry) {
        entry = {
          mandant: f.organization?.name ?? "Unbekannt",
          mandantNumber: f.organization?.mandantNumber ?? "—",
          agg: emptyAgg(),
        };
        perOrg.set(f.organizationId, entry);
      }
      applyFall(entry.agg, f);
    }

    const zeilen = Array.from(perOrg.entries())
      .map(([organizationId, v]) => ({
        organizationId,
        mandant: v.mandant,
        mandantNumber: v.mandantNumber,
        ...v.agg,
      }))
      .sort((a, b) => a.mandantNumber.localeCompare(b.mandantNumber, "de"));

    return NextResponse.json({
      data: {
        jahr,
        verfuegbareJahre,
        zeilen,
        gesamt: gesamtAgg,
        generiertAm: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[API] BEM Statistik GET fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
