/**
 * Standardpaket pro Mandant und Modul.
 *
 * GET /api/organizations/[id]/starterpaket?modul=ONBOARDING
 *   Verfuegbare Pool-PDFs und Brief-Vorlagen fuer diesen Mandanten (global +
 *   eigene) inkl. Markierung und Reihenfolge. `paket` ist die geordnete,
 *   gemischte Liste — die Oberflaeche muss sie nicht selbst zusammensetzen.
 * PUT /api/organizations/[id]/starterpaket
 *   Setzt die komplette (geordnete) Auswahl fuer ein Modul neu (atomar).
 *
 * Berechtigung: SUPER_ADMIN / HR_LEITUNG (Entscheidung vom 03.09.2026 —
 * unveraendert gegenueber dem reinen PDF-Paket).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { sensiblePlatzhalter, type SensiblesFeld } from "@/lib/placeholder-catalog";
import {
  setPaketAuswahlSchema,
  PAKET_MODULE,
  type PaketPositionArt,
} from "@/lib/validations/dokumentenpaket";
import { setStarterpaketAuswahlSchema } from "@/lib/validations/starterpaket";

const STANDARD_MODUL = "ONBOARDING";

/**
 * Uebergangsweise werden beide Koerperformen angenommen.
 *
 * Die Konfigurationsseite schickt bis Baustein 4 noch `{ dokumentIds }`. Wuerde
 * die Route das ab sofort ablehnen, koennte zwischen diesem und dem naechsten
 * Schritt niemand mehr ein Starterpaket speichern — die Seite meldete einen
 * Fehler, den niemand erwartet. Mit Baustein 4 faellt die alte Form weg.
 */
const putBodySchema = z.union([setPaketAuswahlSchema, setStarterpaketAuswahlSchema]);
type PutBody = z.infer<typeof putBodySchema>;

interface Position {
  art: PaketPositionArt;
  id: string;
}

/** Ein Eintrag der geordneten Gesamtliste, die die Oberflaeche anzeigt. */
interface PaketEintrag {
  art: PaketPositionArt;
  id: string;
  name: string;
  orderIndex: number;
  /** Nur bei Vorlagen gesetzt; PDFs koennen keine Platzhalter befuellen. */
  sensibleFelder?: SensiblesFeld[];
}

/** Vereinheitlicht beide Koerperformen zu Modul + geordneter Positionsliste. */
function normalisiere(body: PutBody): { modul: string; positionen: Position[] } {
  if ("positionen" in body) {
    return { modul: body.modul, positionen: body.positionen };
  }
  return {
    modul: STANDARD_MODUL,
    positionen: body.dokumentIds.map((id) => ({ art: "PDF" as const, id })),
  };
}

/** Modul aus der Abfrage, auf die unterstuetzten Werte begrenzt. */
function modulAusAbfrage(url: string): string {
  const roh = new URL(url).searchParams.get("modul")?.trim().toUpperCase();
  return roh && (PAKET_MODULE as readonly string[]).includes(roh) ? roh : STANDARD_MODUL;
}

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export const GET = apiHandler(
  { roles: ADMIN_ROLES, logLabel: "Starterpaket-Auswahl GET" },
  async ({ request, params, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;
    const modul = modulAusAbfrage(request.url);

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, mandantNumber: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    // Verfuegbar = globale Pool-Dokumente + die dieses Mandanten.
    const docs = await prisma.starterpaketDokument.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: id }] },
      select: {
        id: true,
        name: true,
        beschreibung: true,
        organizationId: true,
        fileSize: true,
        isActive: true,
      },
    });

    // Vorlagen: das Modul des Pakets plus ALLGEMEIN (die passen ueberall),
    // gruppenweit plus mandantenspezifisch, und nur aktive. BEM taucht hier
    // nicht auf — das Modul steht nicht in PAKET_MODULE.
    const templates = await prisma.documentTemplate.findMany({
      where: {
        isActive: true,
        modul: { in: [modul, "ALLGEMEIN"] },
        OR: [{ organizationId: null }, { organizationId: id }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        modul: true,
        organizationId: true,
        fileSize: true,
        platzhalter: true,
        isSystem: true,
      },
    });

    const auswahl = await prisma.starterpaketAuswahl.findMany({
      where: { organizationId: id, modul },
      orderBy: { orderIndex: "asc" },
      select: { dokumentId: true, templateId: true, orderIndex: true },
    });
    const pdfMarken = new Map(
      auswahl.flatMap((a) => (a.dokumentId ? [[a.dokumentId, a.orderIndex] as const] : [])),
    );
    const vorlagenMarken = new Map(
      auswahl.flatMap((a) => (a.templateId ? [[a.templateId, a.orderIndex] as const] : [])),
    );

    // Markierte zuerst (in Paketreihenfolge), dann unmarkierte alphabetisch.
    const sortiere = <T extends { marked: boolean; orderIndex: number | null; name: string }>(
      a: T,
      b: T,
    ): number => {
      if (a.marked && b.marked) return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
      if (a.marked) return -1;
      if (b.marked) return 1;
      return a.name.localeCompare(b.name, "de");
    };

    const documents = docs
      .map((d) => ({
        id: d.id,
        name: d.name,
        beschreibung: d.beschreibung,
        scope: d.organizationId ? ("MANDANT" as const) : ("GLOBAL" as const),
        fileSize: d.fileSize,
        isActive: d.isActive,
        marked: pdfMarken.has(d.id),
        orderIndex: pdfMarken.get(d.id) ?? null,
      }))
      .sort(sortiere);

    const vorlagen = templates
      .map((t) => ({
        id: t.id,
        name: t.name,
        beschreibung: t.description,
        modul: t.modul,
        scope: t.organizationId ? ("MANDANT" as const) : ("GLOBAL" as const),
        fileSize: t.fileSize,
        isSystem: t.isSystem,
        // Rotes Kennzeichen in der Oberflaeche: welche sensiblen Felder wuerde
        // diese Vorlage befuellen? Ohne Datenbankzugriff und ohne
        // Entschluesselung — hier zaehlt nur, was in der Vorlage steht.
        sensibleFelder: sensiblePlatzhalter(t.platzhalter),
        marked: vorlagenMarken.has(t.id),
        orderIndex: vorlagenMarken.get(t.id) ?? null,
      }))
      .sort(sortiere);

    // Die geordnete Gesamtliste — eine Quelle fuer die Reihenfolge, damit
    // Oberflaeche und Versand nicht getrennt sortieren muessen.
    const paket: PaketEintrag[] = auswahl
      .flatMap<PaketEintrag>((a) => {
        if (a.dokumentId) {
          const d = documents.find((x) => x.id === a.dokumentId);
          return d ? [{ art: "PDF" as const, id: d.id, name: d.name, orderIndex: a.orderIndex }] : [];
        }
        if (a.templateId) {
          const v = vorlagen.find((x) => x.id === a.templateId);
          return v
            ? [
                {
                  art: "VORLAGE" as const,
                  id: v.id,
                  name: v.name,
                  orderIndex: a.orderIndex,
                  sensibleFelder: v.sensibleFelder,
                },
              ]
            : [];
        }
        return [];
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return NextResponse.json({
      data: { organization: org, modul, documents, vorlagen, paket },
    });
  },
);

export const PUT = apiHandler<PutBody>(
  {
    roles: ADMIN_ROLES,
    bodySchema: putBodySchema,
    logLabel: "Starterpaket-Auswahl PUT",
  },
  async ({ request, params, body, session }) => {
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = params;
    const { modul, positionen } = normalisiere(body);

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Mandant nicht gefunden" }, { status: 404 });
    }

    // Duplikate entfernen, Reihenfolge erhalten. Das Zod-Schema lehnt sie fuer
    // die neue Koerperform bereits ab; die alte Form kannte die Pruefung nicht.
    const gesehen = new Set<string>();
    const eindeutig = positionen.filter((p) => {
      const schluessel = p.art + ":" + p.id;
      if (gesehen.has(schluessel)) return false;
      gesehen.add(schluessel);
      return true;
    });

    const pdfIds = eindeutig.filter((p) => p.art === "PDF").map((p) => p.id);
    const vorlagenIds = eindeutig.filter((p) => p.art === "VORLAGE").map((p) => p.id);

    // Alle markierten PDFs muessen fuer diesen Mandanten verfuegbar sein
    // (global oder mandantenspezifisch) — sonst koennte ein fremdes
    // Mandanten-PDF markiert werden.
    if (pdfIds.length > 0) {
      const verfuegbar = await prisma.starterpaketDokument.count({
        where: {
          id: { in: pdfIds },
          OR: [{ organizationId: null }, { organizationId: id }],
        },
      });
      if (verfuegbar !== pdfIds.length) {
        return NextResponse.json(
          { error: "Mindestens ein Dokument ist fuer diesen Mandanten nicht verfuegbar." },
          { status: 400 },
        );
      }
    }

    // Vorlagen zusaetzlich gegen Modul und Aktivitaet pruefen. Eine Vorlage aus
    // einem anderen Modul wuerde der Resolver des Vorgangs nicht befuellen und
    // ein halb leeres Schreiben verschicken; eine deaktivierte gehoert gar
    // nicht mehr ins Paket.
    if (vorlagenIds.length > 0) {
      const verfuegbar = await prisma.documentTemplate.count({
        where: {
          id: { in: vorlagenIds },
          isActive: true,
          modul: { in: [modul, "ALLGEMEIN"] },
          OR: [{ organizationId: null }, { organizationId: id }],
        },
      });
      if (verfuegbar !== vorlagenIds.length) {
        return NextResponse.json(
          {
            error:
              "Mindestens eine Vorlage ist fuer diesen Mandanten oder dieses Modul nicht verfuegbar.",
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction([
      // Nur das eigene Modul leeren: Ohne die Einschraenkung loescht das
      // Speichern des Onboarding-Pakets die Pakete der anderen Module mit ab.
      prisma.starterpaketAuswahl.deleteMany({ where: { organizationId: id, modul } }),
      ...(eindeutig.length > 0
        ? [
            prisma.starterpaketAuswahl.createMany({
              data: eindeutig.map((p, index) => ({
                organizationId: id,
                modul,
                dokumentId: p.art === "PDF" ? p.id : null,
                templateId: p.art === "VORLAGE" ? p.id : null,
                orderIndex: index,
              })),
            }),
          ]
        : []),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        processType: "STARTERPAKET",
        action: "STARTERPAKET_SELECTION_UPDATED",
        details: {
          organizationId: id,
          modul,
          anzahl: eindeutig.length,
          anzahlPdf: pdfIds.length,
          anzahlVorlagen: vorlagenIds.length,
        },
        ipAddress: clientIp(request.headers),
      },
    });

    return NextResponse.json({
      data: {
        organizationId: id,
        modul,
        positionen: eindeutig,
        // Solange die alte Oberflaeche laeuft, erwartet sie dieses Feld.
        dokumentIds: pdfIds,
      },
    });
  },
);
