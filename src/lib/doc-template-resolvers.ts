/**
 * Platzhalter-Resolver fuer die Vorlagenbibliothek (E0).
 *
 * Jedes Modul kann einen Resolver registrieren, der aus Portal-Daten die Werte
 * fuer die Platzhalter einer Vorlage sammelt. Sensible Felder (IBAN, SV-Nr, ...)
 * werden im jeweiligen Modul-Resolver entschluesselt und ueber `sensitiveFields`
 * gemeldet, damit der Aufrufer einen Audit-Log-Eintrag schreiben kann.
 *
 * Manuelle Eingaben aus der UI ueberschreiben spaeter immer die Resolver-Werte.
 *
 * Stand E0: nur der ALLGEMEIN-Resolver (Datum, Mandant, verantwortliche Stelle).
 * Modul-Resolver (z.B. BEM, Onboarding) werden in spaeteren Epics via
 * registerResolver() ergaenzt.
 */

import { prisma } from "@/lib/db";
import { resolveVerantwortlicheStelle } from "@/lib/dsgvo";
import type { SessionPayload } from "@/lib/permissions";

export interface ResolverContext {
  organizationId?: string | null;
  /** Bezug innerhalb des Moduls, z.B. bemFallId / onboardingId / employeeId */
  refId?: string | null;
  session: SessionPayload;
  ipAddress?: string | null;
}

export interface ResolvedPlaceholders {
  data: Record<string, unknown>;
  /** Namen sensibler Felder, die entschluesselt wurden (fuer Audit-Log). */
  sensitiveFields: string[];
}

export type PlaceholderResolver = (
  ctx: ResolverContext,
) => Promise<ResolvedPlaceholders>;

/** Modul-Auswahl fuer die UI (Wert + Anzeige). */
export const AVAILABLE_MODULES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "ALLGEMEIN", label: "Allgemein" },
  { value: "BEM", label: "BEM" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "OFFBOARDING", label: "Offboarding" },
  { value: "VERBEAMTUNG", label: "Verbeamtung" },
  { value: "MUTTERSCHUTZ", label: "Mutterschutz" },
  { value: "ELTERNZEIT", label: "Elternzeit" },
];

export const MODULE_VALUES = AVAILABLE_MODULES.map((m) => m.value);

function todayDe(): string {
  return new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Gemeinsame Platzhalter, die fuer alle Module gelten (Datum, Mandant,
 * verantwortliche Stelle nach DSGVO). Faellt auf den globalen Default zurueck,
 * wenn keine Organisation uebergeben wird.
 */
export async function commonPlaceholders(
  organizationId?: string | null,
): Promise<Record<string, unknown>> {
  const now = new Date();
  const base: Record<string, unknown> = {
    datum: todayDe(),
    jahr: String(now.getFullYear()),
  };

  let org: {
    name: string;
    shortName: string | null;
    mandantNumber: string;
    dsgvoVerantwortlicheName: string | null;
    dsgvoVerantwortlicheStrasse: string | null;
    dsgvoVerantwortlichePlz: string | null;
    dsgvoVerantwortlicheOrt: string | null;
  } | null = null;

  if (organizationId) {
    org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        shortName: true,
        mandantNumber: true,
        dsgvoVerantwortlicheName: true,
        dsgvoVerantwortlicheStrasse: true,
        dsgvoVerantwortlichePlz: true,
        dsgvoVerantwortlicheOrt: true,
      },
    });
  }

  if (org) {
    base.mandant = org.name;
    base.mandant_name = org.name;
    // Leere optionale Werte NICHT setzen — sonst rendert docxtemplater eine
    // unsichtbare Luecke statt "___" + Missing-Meldung.
    if (org.shortName) base.mandant_kuerzel = org.shortName;
    base.mandant_nummer = org.mandantNumber;
  }

  const vs = resolveVerantwortlicheStelle(org);
  base.verantwortliche_stelle = vs.name;
  base.verantwortliche_strasse = vs.strasse;
  base.verantwortliche_plz = vs.plz;
  base.verantwortliche_ort = vs.ort;

  return base;
}

const allgemeinResolver: PlaceholderResolver = async (ctx) => {
  const data = await commonPlaceholders(ctx.organizationId);
  return { data, sensitiveFields: [] };
};

const resolvers: Record<string, PlaceholderResolver> = {
  ALLGEMEIN: allgemeinResolver,
};

/** Registriert einen Modul-Resolver (z.B. in E5 fuer BEM). */
export function registerResolver(
  modul: string,
  resolver: PlaceholderResolver,
): void {
  resolvers[modul.toUpperCase()] = resolver;
}

/** Liefert den Resolver fuer ein Modul (Fallback: ALLGEMEIN). */
export function getResolver(modul: string): PlaceholderResolver {
  return resolvers[modul.toUpperCase()] || allgemeinResolver;
}

/** Prueft, ob es fuer ein Modul einen spezifischen Resolver gibt. */
export function hasModuleResolver(modul: string): boolean {
  const key = modul.toUpperCase();
  return key in resolvers && key !== "ALLGEMEIN";
}
