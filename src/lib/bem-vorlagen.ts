/**
 * BEM E10 — Editierbare Vorlagen (Checklisten + Datenschutz-/Einwilligungstexte).
 *
 * Aufloesung: Mandant-Override -> globale Vorlage -> Code-Default. So koennen
 * Admin/HR-Leitung Inhalte bei Gesetzesaenderungen pflegen, ohne dass je etwas
 * fehlt (Fallback ist immer der hier definierte Default).
 *
 * inhalt-Form: Checkliste = string[] (Item-Titel); Text = { titel, koerper }.
 * version: DB-Wert bzw. 0 fuer den Code-Default (fuer den Nachweis-Snapshot).
 */

import { prisma } from "@/lib/db";
import type {
  BemGespraechTyp,
  BemEinwilligungArt,
  BemVorlageTyp,
} from "@prisma/client";
import { getBemCheckliste, type BemChecklistItem } from "@/lib/bem-checkliste-template";

export interface BemTextInhalt {
  titel: string;
  koerper: string;
}

export interface BemVorlageResolved {
  version: number;
  inhalt: unknown;
}

// ---- Typ-Zuordnungen --------------------------------------------------------

export function checklisteVorlageTyp(typ: BemGespraechTyp): BemVorlageTyp {
  return `CHECKLISTE_${typ}` as BemVorlageTyp; // ERSTGESPRAECH/FOLGEGESPRAECH/GEDAECHTNISPROTOKOLL
}

export function einwilligungstextVorlageTyp(art: BemEinwilligungArt): BemVorlageTyp {
  return `EINWILLIGUNGSTEXT_${art}` as BemVorlageTyp; // DATENSCHUTZ/DURCHFUEHRUNG/BR/SBV
}

// ---- Code-Defaults (Fallback) ----------------------------------------------

const TEXT_DEFAULTS: Record<BemEinwilligungArt, BemTextInhalt> = {
  DURCHFUEHRUNG: {
    titel: "Durchführung des BEM",
    koerper:
      "Ihr Arbeitgeber bietet Ihnen ein Betriebliches Eingliederungsmanagement (BEM) an. " +
      "Ziel ist es, gemeinsam Möglichkeiten zu finden, Ihre Arbeitsfähigkeit zu erhalten und " +
      "erneuter Arbeitsunfähigkeit vorzubeugen. Die Teilnahme ist freiwillig; eine Ablehnung " +
      "hat keine arbeitsrechtlichen Nachteile. Mit Ihrer Zustimmung erklären Sie sich mit der " +
      "Durchführung des BEM einverstanden.",
  },
  DATENSCHUTZ: {
    titel: "Datenschutz-Einwilligung",
    koerper:
      "Ihre Angaben werden ausschließlich zur Durchführung des BEM verarbeitet " +
      "(§ 167 Abs. 2 SGB IX, Art. 9 DSGVO), streng vertraulich und getrennt von Ihrer " +
      "Personalakte behandelt und nur den dafür freigegebenen Personen zugänglich gemacht. " +
      "Die Teilnahme ist freiwillig; Sie können eine erteilte Einwilligung jederzeit ohne " +
      "Nachteile widerrufen. Nach Ablauf der gesetzlichen Aufbewahrungsfrist werden die " +
      "BEM-Daten gelöscht.",
  },
  BR: {
    titel: "Beteiligung des Betriebsrats",
    koerper:
      "Mit Ihrer Zustimmung wird der Betriebsrat in Ihr BEM-Verfahren einbezogen. Der " +
      "Betriebsrat begleitet das Verfahren im Rahmen seiner gesetzlichen Aufgaben " +
      "(§ 167 Abs. 2 SGB IX). Die Beteiligung ist freiwillig.",
  },
  SBV: {
    titel: "Beteiligung der Schwerbehindertenvertretung",
    koerper:
      "Mit Ihrer Zustimmung wird die Schwerbehindertenvertretung (SBV) in Ihr BEM-Verfahren " +
      "einbezogen (§ 167 i. V. m. § 178 SGB IX). Die SBV vertritt Ihre Interessen als " +
      "schwerbehinderte:r oder gleichgestellte:r Beschäftigte:r. Die Beteiligung ist freiwillig.",
  },
};

function codeDefaultInhalt(typ: BemVorlageTyp): unknown {
  switch (typ) {
    case "CHECKLISTE_ERSTGESPRAECH":
      return getBemCheckliste("ERSTGESPRAECH").map((i) => i.titel);
    case "CHECKLISTE_FOLGEGESPRAECH":
      return getBemCheckliste("FOLGEGESPRAECH").map((i) => i.titel);
    case "CHECKLISTE_GEDAECHTNISPROTOKOLL":
      return getBemCheckliste("GEDAECHTNISPROTOKOLL").map((i) => i.titel);
    case "EINWILLIGUNGSTEXT_DATENSCHUTZ":
      return TEXT_DEFAULTS.DATENSCHUTZ;
    case "EINWILLIGUNGSTEXT_DURCHFUEHRUNG":
      return TEXT_DEFAULTS.DURCHFUEHRUNG;
    case "EINWILLIGUNGSTEXT_BR":
      return TEXT_DEFAULTS.BR;
    case "EINWILLIGUNGSTEXT_SBV":
      return TEXT_DEFAULTS.SBV;
    default:
      return null;
  }
}

/** Liste aller Vorlagen-Typen (fuer das Verwaltungs-UI / Seed). */
export const BEM_VORLAGE_TYPEN: BemVorlageTyp[] = [
  "CHECKLISTE_ERSTGESPRAECH",
  "CHECKLISTE_FOLGEGESPRAECH",
  "CHECKLISTE_GEDAECHTNISPROTOKOLL",
  "EINWILLIGUNGSTEXT_DATENSCHUTZ",
  "EINWILLIGUNGSTEXT_DURCHFUEHRUNG",
  "EINWILLIGUNGSTEXT_BR",
  "EINWILLIGUNGSTEXT_SBV",
];

export function istChecklistenTyp(typ: BemVorlageTyp): boolean {
  return typ.startsWith("CHECKLISTE_");
}

/** Code-Default eines Typs (fuer Vorschau/Reset im UI). */
export function getBemVorlageDefault(typ: BemVorlageTyp): BemVorlageResolved {
  return { version: 0, inhalt: codeDefaultInhalt(typ) };
}

// ---- Aufloesung (Override -> global -> Default) ------------------------------

export async function getBemVorlage(
  typ: BemVorlageTyp,
  organizationId?: string | null,
): Promise<BemVorlageResolved> {
  // Deterministisch (jeweils neueste Zeile), falls aus Altbestand/Race doch
  // mehrere Zeilen je (typ, organizationId) existieren — wichtig fuer die
  // Reproduzierbarkeit des zugestimmten Textes.
  if (organizationId) {
    const override = await prisma.bemVorlage.findFirst({
      where: { typ, organizationId },
      orderBy: { updatedAt: "desc" },
      select: { inhalt: true, version: true },
    });
    if (override) return { version: override.version, inhalt: override.inhalt };
  }
  const global = await prisma.bemVorlage.findFirst({
    where: { typ, organizationId: null },
    orderBy: { updatedAt: "desc" },
    select: { inhalt: true, version: true },
  });
  if (global) return { version: global.version, inhalt: global.inhalt };
  return getBemVorlageDefault(typ);
}

/** Checkliste (Items, alle unerledigt) fuer einen Gespraechstyp. */
export async function getBemChecklisteItems(
  typ: BemGespraechTyp,
  organizationId?: string | null,
): Promise<BemChecklistItem[]> {
  const { inhalt } = await getBemVorlage(checklisteVorlageTyp(typ), organizationId);
  const items = Array.isArray(inhalt) ? (inhalt as unknown[]) : [];
  return items
    .filter((t): t is string => typeof t === "string" && t.trim() !== "")
    .map((titel) => ({ titel, erledigt: false }));
}

/** Einwilligungs-/Datenschutztext + Version fuer eine Art. */
export async function getBemEinwilligungstext(
  art: BemEinwilligungArt,
  organizationId?: string | null,
): Promise<{ titel: string; koerper: string; version: number }> {
  const { inhalt, version } = await getBemVorlage(
    einwilligungstextVorlageTyp(art),
    organizationId,
  );
  const fallback = TEXT_DEFAULTS[art];
  const obj = (inhalt && typeof inhalt === "object" ? inhalt : {}) as Partial<BemTextInhalt>;
  return {
    titel: typeof obj.titel === "string" && obj.titel ? obj.titel : fallback.titel,
    koerper: typeof obj.koerper === "string" && obj.koerper ? obj.koerper : fallback.koerper,
    version,
  };
}
