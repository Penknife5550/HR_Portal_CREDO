/**
 * API: /api/settings/email-templates
 *
 * GET – Alle E-Mail-Vorlagen laden
 *       Falls noch keine vorhanden: Standard-Vorlagen aus Code liefern.
 *       Empfaenger-Felder werden mit den Katalog-Defaults vorbelegt,
 *       solange sie nicht explizit konfiguriert wurden.
 *
 *       Je Vorlage zusaetzlich:
 *       - `source`: "db" (gespeicherte Fassung gilt) oder "default"
 *         (Standardtext aus dem Code gilt)
 *       - `weichtVomStandardAb`: true, wenn Betreff, HTML oder Plaintext der
 *         gespeicherten Fassung nicht (mehr) dem aktuellen Standardtext
 *         entsprechen. Grund: Eine gespeicherte Fassung schluckt jede spaetere
 *         Textaenderung im Code; ohne dieses Kennzeichen sieht niemand, dass
 *         ein Update bei diesem Event nicht ankommt. Zuruecksetzen ueber
 *         POST /api/settings/email-templates/[id]/zuruecksetzen.
 *       - `variables`: immer die Liste aus dem Code-Default, auch bei einer
 *         gespeicherten Fassung (siehe unten).
 *
 * Berechtigung: SUPER_ADMIN, HR_LEITUNG
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { getEventDefinition } from "@/lib/events";
import { weichtVomStandardAb } from "@/lib/email-vorlagen-standard";

const ALLOWED_ROLES = ["SUPER_ADMIN", "HR_LEITUNG"];

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    if (!ALLOWED_ROLES.includes(session.role)) return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });

    const dbTemplates = await prisma.emailTemplate.findMany({
      orderBy: { event: "asc" },
    });

    // Fehlende Vorlagen durch Defaults ersetzen (ohne DB-Eintrag anzulegen);
    // leere Empfaenger-Felder mit den Katalog-Defaults vorbelegen.
    const dbByEvent = new Map(dbTemplates.map((t) => [t.event, t]));
    const allTemplates = DEFAULT_EMAIL_TEMPLATES.map((def) => {
      const catalog = getEventDefinition(def.event);
      const defaults = catalog?.defaultRecipients;
      const found = dbByEvent.get(def.event);
      const base =
        found ??
        {
          ...def,
          id: `default-${def.event}`,
          recipientTo: "",
          recipientCc: "",
          recipientBcc: "",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      return {
        ...base,
        // Die Variablenliste ist Metadatum des Events, kein Vorlagentext:
        // IMMER die aktuelle aus dem Code. Die gespeicherte (`found.variables`)
        // ist der Stand beim letzten Speichern — neue Platzhalter wie
        // {{warnungen_liste_html}} saehe HR im Editor sonst erst nach dem
        // naechsten Speichern, also gerade dann nicht, wenn eine angepasste
        // Vorlage von Hand nachgezogen werden soll. Der PUT schreibt ohnehin
        // die Default-Variablen.
        variables: def.variables,
        recipientTo: base.recipientTo || defaults?.to || "",
        recipientCc: base.recipientCc || defaults?.cc || "",
        recipientBcc: base.recipientBcc || defaults?.bcc || "",
        group: catalog?.group ?? "Weitere",
        recipientHint: catalog?.recipientHint ?? "",
        wired: catalog?.wired ?? true,
        source: found ? ("db" as const) : ("default" as const),
        // Verglichen wird gegen den Code-Default desselben Events (`def`) —
        // ohne gespeicherte Fassung gilt er ohnehin, kann also nicht abweichen.
        weichtVomStandardAb: found ? weichtVomStandardAb(found, def) : false,
      };
    });

    return NextResponse.json({ data: allTemplates });
  } catch (error) {
    console.error("[API] E-Mail-Vorlagen laden fehlgeschlagen:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
