/**
 * API: /api/checklisten/:id
 *
 * GET    – Einzelne Vorlage mit allen Items abrufen
 * PUT    – Vorlage VOLLSTAENDIG ersetzen (Metadaten + alle Punkte) in EINER
 *          Transaktion (Paket 5)
 * PATCH  – Vorlage bearbeiten (name, description, questionnaireType, isActive)
 * DELETE – Vorlage löschen (nur wenn nicht in Verwendung)
 *
 * Warum PUT (Paket 5): Der Editor speicherte eine bearbeitete Vorlage, indem er
 * erst ALLE Punkte einzeln loeschte und sie danach einzeln neu anlegte — ohne
 * eine einzige Antwort zu pruefen. Brach etwas dazwischen ab (Netz, 403, 500),
 * war die Vorlage leer und die Oberflaeche meldete trotzdem Erfolg. Ausserdem
 * bekam jeder Punkt eine neue ID, sodass `ChecklistItem.templateItemId`
 * laufender Vorgaenge ins Leere zeigte. PUT ersetzt deshalb alles in einer
 * Transaktion und BEHAELT die mitgeschickten Punkt-IDs.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { istOffboardingVorlagenName } from "@/lib/abteilungsaufgaben";
import {
  checklistenFehlerMeldung,
  checklistenVorlageSchema,
  type ChecklistenPunktInput,
} from "@/lib/validations/abteilungsaufgaben";

/** Antwortform von GET, PUT und PATCH: Punkte nach Reihenfolge, dazu die Zaehler. */
const MIT_PUNKTEN = {
  items: { orderBy: { orderIndex: "asc" } },
  _count: { select: { items: true, onboardings: true } },
} as const;

/** Spaltenwerte eines Vorlagenpunkts — fuer Anlegen und Aktualisieren gleich. */
function punktWerte(punkt: ChecklistenPunktInput, position: number) {
  return {
    title: punkt.title,
    category: punkt.category,
    orderIndex: punkt.orderIndex ?? position,
    defaultDueDays: punkt.defaultDueDays ?? null,
    defaultAssignee: punkt.defaultAssignee ?? null,
    description: punkt.description ?? null,
  };
}

// =============================================
// GET /api/checklisten/:id – Einzelne Vorlage
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const template = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: MIT_PUNKTEN,
    });

    if (!template) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("Fehler beim Laden der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PUT /api/checklisten/:id – Vorlage vollstaendig ersetzen
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // Rollencheck wie bei PATCH und DELETE
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen Checklisten bearbeiten." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Zuerst pruefen, dann schreiben: Ein ungueltiger Punkt darf die Vorlage
    // nicht halb ersetzt zuruecklassen.
    const roh = await request.json().catch(() => undefined);
    const geprueft = checklistenVorlageSchema.safeParse(roh);
    if (!geprueft.success) {
      return NextResponse.json(
        { error: checklistenFehlerMeldung(geprueft.error) },
        { status: 400 }
      );
    }
    const daten = geprueft.data;

    const vorhanden = await prisma.checklistTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!vorhanden) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Offboarding-Vorlagen werden am Namen erkannt (beide Module teilen sich
    // die Tabelle). Traegt eine „Offboarding: …"-Vorlage einen Fragebogentyp,
    // zieht POST /api/onboarding sie als Onboarding-Checkliste heran — der
    // neue Vorgang bekaeme Austrittsaufgaben.
    const questionnaireType = istOffboardingVorlagenName(daten.name)
      ? null
      : daten.questionnaireType ?? null;

    const aktualisiert = await prisma.$transaction(
      async (tx) => {
        await tx.checklistTemplate.update({
          where: { id },
          data: {
            name: daten.name,
            description: daten.description ?? null,
            questionnaireType,
            // Der Aktiv-Schalter sitzt ausserhalb des Editors (PATCH) und
            // bleibt unveraendert, solange ihn niemand mitschickt.
            ...(daten.isActive !== undefined && { isActive: daten.isActive }),
          },
        });

        // Punkte, die nicht mehr in der Liste stehen, verschwinden. Die
        // Beschraenkung auf `templateId` sorgt dafuer, dass eine fremde ID in
        // `behalten` nichts ausserhalb dieser Vorlage betrifft.
        const behalten = daten.items
          .map((p) => p.id)
          .filter((pid): pid is string => !!pid);
        await tx.checklistTemplateItem.deleteMany({
          where: {
            templateId: id,
            ...(behalten.length > 0 && { id: { notIn: behalten } }),
          },
        });

        // Vorhandene Punkte behalten ihre ID (updateMany mit templateId im
        // WHERE — eine ID aus einer FREMDEN Vorlage trifft nichts und wird
        // stattdessen als neuer Punkt angelegt).
        const anzulegen: (ReturnType<typeof punktWerte> & { templateId: string })[] = [];
        for (const [position, punkt] of daten.items.entries()) {
          const werte = punktWerte(punkt, position);
          if (punkt.id) {
            const { count } = await tx.checklistTemplateItem.updateMany({
              where: { id: punkt.id, templateId: id },
              data: werte,
            });
            if (count > 0) continue;
          }
          anzulegen.push({ templateId: id, ...werte });
        }
        if (anzulegen.length > 0) {
          await tx.checklistTemplateItem.createMany({ data: anzulegen });
        }

        return tx.checklistTemplate.findUnique({
          where: { id },
          include: MIT_PUNKTEN,
        });
      },
      // Eine Vorlage darf bis zu 300 Punkte haben; die Voreinstellung von
      // 5 Sekunden reicht dafuer nicht sicher.
      { timeout: 20000 }
    );

    return NextResponse.json({ data: aktualisiert });
  } catch (error) {
    console.error("Fehler beim Ersetzen der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// PATCH /api/checklisten/:id – Vorlage bearbeiten
// =============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // Rollencheck
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG duerfen Checklisten bearbeiten." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => undefined)) as
      | { name?: unknown; description?: unknown; questionnaireType?: unknown; isActive?: unknown }
      | undefined;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
    }
    const { name, description, questionnaireType, isActive } = body;

    // Vorlage pruefen
    const existing = await prisma.checklistTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Update-Daten zusammenbauen
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (description !== undefined) updateData.description = String(description ?? "").trim() || null;
    if (questionnaireType !== undefined) updateData.questionnaireType = questionnaireType || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Dieselbe Sperre wie in PUT und POST: Beide Module teilen sich eine
    // Vorlagentabelle und werden am Namen unterschieden. Traegt eine
    // „Offboarding: …"-Vorlage einen Fragebogentyp, zieht POST /api/onboarding
    // sie als Onboarding-Checkliste — der neue Vorgang bekaeme Austritts-
    // aufgaben („IT-Zugänge sperren" ginge seit Paket 5 per Link an die IT).
    // Geprueft wird der Name NACH dem Update, nicht der mitgeschickte.
    const endgueltigerName =
      typeof updateData.name === "string" ? updateData.name : existing.name;
    if (istOffboardingVorlagenName(endgueltigerName)) {
      updateData.questionnaireType = null;
    }

    const updated = await prisma.checklistTemplate.update({
      where: { id },
      data: updateData,
      include: MIT_PUNKTEN,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================
// DELETE /api/checklisten/:id – Vorlage löschen
// =============================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 }
      );
    }

    // Rollencheck
    if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur SUPER_ADMIN und HR_LEITUNG dürfen Checklisten löschen." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Pruefen ob Vorlage existiert
    const existing = await prisma.checklistTemplate.findUnique({
      where: { id },
      include: {
        _count: {
          select: { onboardings: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Checklisten-Vorlage nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefen ob Vorlage in Verwendung ist
    if (existing._count.onboardings > 0) {
      return NextResponse.json(
        {
          error: `Diese Vorlage wird von ${existing._count.onboardings} Onboarding-Vorgang/Vorgängen verwendet und kann nicht gelöscht werden.`,
        },
        { status: 409 }
      );
    }

    // Vorlage löschen (Cascade loescht auch die Template-Items)
    await prisma.checklistTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Löschen der Checklisten-Vorlage:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
