/**
 * API: GET /api/bem/[id]/export
 *
 * Erzeugt den Mitarbeiter-Gesamtexport (DSGVO Art. 15) als PDF der kompletten
 * BEM-Akte. Versiegelte Akte: Zugriff via canAccessBemContent. Entschluesselung
 * der Freitexte erfolgt hier (zugriffsgeschuetzt); der Export wird auditiert.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessBemContent } from "@/lib/permissions";
import { decryptBem } from "@/lib/encryption";
import { statusLabel } from "@/lib/bem-workflow";
import { ABLAGE_LABELS } from "@/lib/bem-aktentrennung";
import { buildBemGesamtExportPdf, type BemExportInput } from "@/lib/bem-export";
import { logBemAudit, BEM_AUDIT_ACTIONS } from "@/lib/bem-audit";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function de(d: Date | null): string | null {
  return d ? d.toLocaleDateString("de-DE") : null;
}
function deTime(d: Date): string {
  return d.toLocaleString("de-DE");
}

const TYP_LABELS: Record<string, string> = {
  ERSTGESPRAECH: "Erstgespräch",
  FOLGEGESPRAECH: "Folgegespräch",
  GEDAECHTNISPROTOKOLL: "Gedächtnisprotokoll",
};
const KATEGORIE_LABELS: Record<string, string> = {
  TECHNISCH: "Technisch",
  ORGANISATORISCH: "Organisatorisch",
  PERSONENBEZOGEN: "Personenbezogen",
};
const MASSNAHME_STATUS_LABELS: Record<string, string> = {
  OFFEN: "Offen",
  LAEUFT: "Läuft",
  UMGESETZT: "Umgesetzt",
  VERWORFEN: "Verworfen",
};
const EINW_ART_LABELS: Record<string, string> = {
  DATENSCHUTZ: "Datenschutz",
  DURCHFUEHRUNG: "Durchführung",
  BR: "Betriebsrat",
  SBV: "Schwerbehindertenvertretung",
};
const EINW_STATUS_LABELS: Record<string, string> = {
  OFFEN: "Offen",
  ERTEILT: "Erteilt",
  ABGELEHNT: "Abgelehnt",
  WIDERRUFEN: "Widerrufen",
};
const ACTION_LABELS: Record<string, string> = {
  BEM_FALL_ANGELEGT: "Fall angelegt",
  BEM_AKTE_GEOEFFNET: "Akte geöffnet",
  BEM_STATUS_GEAENDERT: "Status geändert",
  BEM_EINLADUNG_VERSENDET: "Einladung versendet",
  BEM_EINLADUNG_FEHLGESCHLAGEN: "Einladung fehlgeschlagen",
  BEM_EINWILLIGUNG_ERTEILT: "Einwilligung erteilt",
  BEM_EINWILLIGUNG_ABGELEHNT: "Einwilligung abgelehnt",
  BEM_EINWILLIGUNG_WIDERRUFEN: "Einwilligung widerrufen",
  BEM_GESPRAECH_ERFASST: "Gespräch erfasst",
  BEM_GESPRAECH_AKTUALISIERT: "Gespräch aktualisiert",
  BEM_GESPRAECH_GELOESCHT: "Gespräch gelöscht",
  BEM_MASSNAHME_ERFASST: "Maßnahme erfasst",
  BEM_MASSNAHME_AKTUALISIERT: "Maßnahme aktualisiert",
  BEM_MASSNAHME_GELOESCHT: "Maßnahme gelöscht",
  BEM_DOKUMENT_GENERIERT: "Dokument generiert",
  BEM_DOKUMENT_HOCHGELADEN: "Dokument hochgeladen",
  BEM_EXPORT_ERSTELLT: "Gesamtexport erstellt",
  BEM_ZUGRIFF_GEWAEHRT: "Freigabe erteilt",
  BEM_ZUGRIFF_ENTZOGEN: "Freigabe entzogen",
  BEM_FRIST_ERINNERUNG: "Frist-Erinnerung versendet",
  BEM_GELOESCHT: "Akte gelöscht (Aufbewahrung abgelaufen)",
};

interface TeilnehmerJson {
  name?: string;
  rolle?: string | null;
}
interface ChecklistJson {
  titel?: string;
  erledigt?: boolean;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { id } = await context.params;
    if (!(await canAccessBemContent(session, id))) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const fall = await prisma.bemFall.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true, mandantNumber: true } },
        gespraeche: { orderBy: [{ datum: "asc" }, { createdAt: "asc" }] },
        massnahmen: { orderBy: { createdAt: "asc" } },
        einwilligungen: { orderBy: { createdAt: "desc" } },
        dokumente: { orderBy: { createdAt: "asc" } },
        kommunikation: { orderBy: { gesendetAm: "desc" } },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 500,
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!fall) {
      return NextResponse.json({ error: "Fall nicht gefunden" }, { status: 404 });
    }

    const input: BemExportInput = {
      displayId: fall.displayId,
      status: fall.status,
      statusLabel: statusLabel(fall.status as never),
      eingangsweg: fall.eingangsweg,
      employee: {
        name: `${fall.employeeFirstName} ${fall.employeeLastName}`.trim(),
        email: fall.employeeEmail,
        personalNr: fall.employeePersonalNr,
      },
      organization: fall.organization,
      dates: {
        angelegtAm: de(fall.createdAt),
        fehlzeitenAb: de(fall.anlassFehlzeitenAb),
        einladungAm: de(fall.einladungAm),
        einwilligungAm: de(fall.datenschutzAm),
        erstgespraechAm: de(fall.erstgespraechAm),
        beendetAm: de(fall.beendetAm),
        beendigungsgrund: fall.beendigungsgrund,
        aufbewahrungBis: de(fall.aufbewahrungBis),
      },
      einwilligungen: fall.einwilligungen.map((e) => ({
        artLabel: EINW_ART_LABELS[e.art] || e.art,
        statusLabel: EINW_STATUS_LABELS[e.status] || e.status,
        signedAt: de(e.signedAt),
        signedName: e.signedName,
        widerrufAm: de(e.widerrufAm),
      })),
      gespraeche: fall.gespraeche.map((g) => {
        const teilnehmer = (Array.isArray(g.teilnehmer)
          ? (g.teilnehmer as TeilnehmerJson[])
          : []
        )
          .map((t) => {
            const n = String(t?.name ?? "").trim();
            if (!n) return "";
            return t?.rolle ? `${n} (${t.rolle})` : n;
          })
          .filter((t) => t !== "");
        const checkliste = (Array.isArray(g.checkliste)
          ? (g.checkliste as ChecklistJson[])
          : []
        )
          .filter((c) => c?.titel)
          .map((c) => ({ titel: String(c.titel), erledigt: !!c?.erledigt }));
        return {
          typLabel: TYP_LABELS[g.typ] || g.typ,
          datum: de(g.datum),
          ort: g.ort,
          teilnehmer,
          notizen: g.notizen ? decryptBem(g.notizen) : null,
          checkliste,
        };
      }),
      massnahmen: fall.massnahmen.map((m) => ({
        kategorieLabel: KATEGORIE_LABELS[m.kategorie] || m.kategorie,
        beschreibung: m.beschreibung ? decryptBem(m.beschreibung) : "",
        statusLabel: MASSNAHME_STATUS_LABELS[m.status] || m.status,
        zustaendig: m.zustaendig,
        frist: de(m.frist),
        evaluationAm: de(m.evaluationAm),
      })),
      dokumente: fall.dokumente.map((dk) => ({
        typ: dk.typ,
        ablageLabel: ABLAGE_LABELS[dk.ablage] || dk.ablage,
        quelle: dk.quelle === "GENERIERT" ? "Generiert" : "Upload",
        dateiname: dk.dateiname,
        erstelltAm: de(dk.createdAt) || "",
      })),
      kommunikation: fall.kommunikation.map((k) => ({
        kanal: k.kanal === "EMAIL" ? "E-Mail" : "Brief",
        statusLabel:
          k.status === "GESENDET"
            ? "Gesendet"
            : k.status === "FEHLGESCHLAGEN"
              ? "Fehlgeschlagen"
              : "Generiert",
        empfaenger: k.empfaenger,
        betreff: k.betreff,
        gesendetAm: deTime(k.gesendetAm),
        nachweis: k.messageId
          ? `Msg-ID ${k.messageId}`
          : k.dokumentHash
            ? `Hash ${k.dokumentHash.slice(0, 16)}…`
            : null,
      })),
      protokoll: fall.auditLogs.map((a) => ({
        zeitpunkt: deTime(a.createdAt),
        vorgang: ACTION_LABELS[a.action] || a.action,
        person: a.user ? `${a.user.firstName} ${a.user.lastName}` : "System/Extern",
        ip: a.ipAddress,
      })),
      erstelltAm: new Date().toLocaleString("de-DE"),
      erstelltVon: `${session.firstName} ${session.lastName}`.trim(),
    };

    const pdf = await buildBemGesamtExportPdf(input);

    await logBemAudit({
      bemFallId: id,
      userId: session.userId,
      action: BEM_AUDIT_ACTIONS.EXPORT_ERSTELLT,
      details: { displayId: fall.displayId },
      ipAddress: clientIp(request),
    });

    const filename = `BEM-Gesamtexport_${fall.displayId}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (error) {
    console.error("[API] BEM Export fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
