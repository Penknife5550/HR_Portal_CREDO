/**
 * API: GET /api/brief-vorlagen/erzeugt?modul=...&refId=...
 *
 * Liefert die fuer einen Vorgang bereits erzeugten Dokumente. Die Erzeugung
 * legt sie laengst ab (GeneratedDocument + Datei im uploads-Volume) — bis hier
 * gab es nur keinen Weg zurueck.
 *
 * Zugriff: dieselben Rollen wie die Erzeugung, zusaetzlich der Mandanten-Scope
 * des Vorgangs. BEM wird abgewiesen (versiegelte Akte, eigener Weg).
 *
 * Dateipfade werden bewusst NICHT ausgeliefert — nur die Information, welche
 * Formate vorliegen. Heruntergeladen wird ueber /erzeugt/[genId]/download.
 */

import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { HR_EDIT_ROLES, canAccessOrg } from "@/lib/permissions";
import { istModulUnterstuetzt, ladeVorgangsMandant } from "@/lib/erzeugte-dokumente-vorgang";

export const GET = apiHandler(
  { roles: HR_EDIT_ROLES, logLabel: "ErzeugteDokumente GET" },
  async ({ request, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const modul = (searchParams.get("modul") || "").trim().toUpperCase();
    const refId = (searchParams.get("refId") || "").trim();

    if (!modul || !refId) {
      return NextResponse.json(
        { error: "Modul und Vorgang sind erforderlich" },
        { status: 400 },
      );
    }

    // Versiegelte Akte: BEM-Dokumente sind ausschliesslich ueber den
    // zugriffsgeschuetzten BEM-Weg erreichbar.
    if (modul === "BEM") {
      return NextResponse.json(
        { error: "BEM-Dokumente sind nur im BEM-Modul einsehbar." },
        { status: 403 },
      );
    }
    if (!istModulUnterstuetzt(modul)) {
      return NextResponse.json({ error: "Modul wird nicht unterstützt" }, { status: 400 });
    }

    // Ueber den Vorgang an den Mandanten — erst damit ist die Berechtigung pruefbar.
    const organizationId = await ladeVorgangsMandant(modul, refId);
    if (!organizationId) {
      return NextResponse.json({ error: "Vorgang nicht gefunden" }, { status: 404 });
    }
    if (!(await canAccessOrg(session, organizationId))) {
      return NextResponse.json(
        { error: "Keine Berechtigung für diesen Vorgang" },
        { status: 403 },
      );
    }

    const dokumente = await prisma.generatedDocument.findMany({
      where: { modul, refId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        missingPlaceholders: true,
        pfadDocx: true,
        pfadPdf: true,
        createdBy: { select: { firstName: true, lastName: true } },
        // Wurde dieses Dokument als Teil eines Pakets verschickt? Die Liste
        // zeigt dann "per E-Mail versendet" — sonst waere aus ihr nicht zu
        // erkennen, was beim Empfaenger schon angekommen ist.
        versand: { select: { createdAt: true, empfaenger: true } },
      },
    });

    return NextResponse.json({
      data: dokumente.map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        erstelltVon: d.createdBy
          ? `${d.createdBy.firstName} ${d.createdBy.lastName}`.trim()
          : null,
        hatDocx: !!d.pfadDocx,
        hatPdf: !!d.pfadPdf,
        versendetAm: d.versand?.createdAt ?? null,
        versendetAn: d.versand?.empfaenger ?? null,
        fehlendeFelder: d.missingPlaceholders.length,
      })),
    });
  },
);
