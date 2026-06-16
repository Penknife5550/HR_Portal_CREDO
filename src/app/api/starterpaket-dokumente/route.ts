/**
 * Starterpaket — zentraler Dokumenten-Pool.
 *
 * GET  /api/starterpaket-dokumente   Liste aller Pool-Dokumente (Konfiguration)
 * POST /api/starterpaket-dokumente   Neues PDF hochladen (GLOBAL oder mandantenspezifisch)
 *
 * Berechtigung: SUPER_ADMIN / HR_LEITUNG (Mandanten-/Stammdaten-Konfiguration).
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES, canAccessOrg } from "@/lib/permissions";
import {
  validateUpload,
  saveUploadedFile,
  sanitizeFilename,
} from "@/lib/file-upload";
import { createStarterpaketDokumentMetaSchema } from "@/lib/validations/starterpaket";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

function formStr(value: FormDataEntryValue | null): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}

export const GET = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "Starterpaket-Dokumente GET" },
  async ({ request, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "1";

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;

    const documents = await prisma.starterpaketDokument.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { orderIndex: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        beschreibung: true,
        organizationId: true,
        originalName: true,
        fileSize: true,
        isActive: true,
        orderIndex: true,
        createdAt: true,
        organization: { select: { name: true, mandantNumber: true } },
        _count: { select: { auswahl: true } },
      },
    });

    return NextResponse.json({ data: documents });
  },
);

export const POST = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "Starterpaket-Dokumente POST" },
  async ({ request, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Ungueltiger Upload (multipart erwartet)" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }
    // Starterpaket-Dokumente sind ausschliesslich PDFs (1:1-Zustellung ohne Konvertierung).
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Nur PDF-Dateien sind als Starterpaket-Dokument erlaubt." },
        { status: 415 },
      );
    }

    const parsed = createStarterpaketDokumentMetaSchema.safeParse({
      name: formStr(form.get("name")),
      beschreibung: formStr(form.get("beschreibung")),
      organizationId: formStr(form.get("organizationId")),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }
    const meta = parsed.data;

    // PDF validieren (Groesse + Magic Bytes %PDF)
    const valid = await validateUpload(file);
    if (!valid.ok) {
      return NextResponse.json({ error: valid.error }, { status: valid.status });
    }

    // Mandanten-Scope pruefen, falls gesetzt
    if (meta.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: meta.organizationId },
        select: { id: true },
      });
      if (!org) {
        return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
      }
      if (!(await canAccessOrg(session, meta.organizationId))) {
        return NextResponse.json(
          { error: "Keine Berechtigung fuer diesen Mandanten" },
          { status: 403 },
        );
      }
    }

    const filename = sanitizeFilename(file.name);
    const dateipfad = await saveUploadedFile(valid.buffer, "starterpaket", filename);
    const hash = crypto.createHash("sha256").update(valid.buffer).digest("hex");

    const count = await prisma.starterpaketDokument.count();
    const created = await prisma.starterpaketDokument.create({
      data: {
        name: meta.name,
        beschreibung: meta.beschreibung ?? null,
        organizationId: meta.organizationId ?? null,
        dateipfad,
        originalName: file.name,
        fileSize: valid.buffer.length,
        mimeType: "application/pdf",
        hash,
        orderIndex: count,
        createdById: session.userId,
      },
      select: {
        id: true,
        name: true,
        beschreibung: true,
        organizationId: true,
        originalName: true,
        fileSize: true,
        isActive: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "STARTERPAKET",
        action: "STARTERPAKET_DOC_CREATED",
        details: {
          dokumentId: created.id,
          name: created.name,
          organizationId: created.organizationId,
          fileSize: created.fileSize,
        },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  },
);
