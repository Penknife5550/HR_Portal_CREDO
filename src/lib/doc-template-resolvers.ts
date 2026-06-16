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
import { decrypt } from "@/lib/encryption";
import type { SessionPayload } from "@/lib/permissions";

export interface ResolverContext {
  organizationId?: string | null;
  /** Bezug innerhalb des Moduls, z.B. bemFallId / onboardingId / employeeId */
  refId?: string | null;
  /**
   * Platzhalter, die die Vorlage tatsaechlich nutzt (aus DocumentTemplate.platzhalter).
   * Wenn gesetzt, loesen Resolver SENSIBLE Felder (IBAN/SV-Nr/Steuer-ID) nur dann auf
   * + melden sie als sensitiveFields, wenn die Vorlage sie wirklich verwendet
   * (praeziser Audit-Trail). Fehlt die Liste, werden sie wie bisher aufgeloest.
   */
  placeholders?: string[];
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

// Der Platzhalter-Katalog (PlaceholderDef, PLACEHOLDER_CATALOG,
// getPlaceholderCatalog) liegt client-sicher in placeholder-catalog.ts und wird
// hier re-exportiert, damit Server-Resolver und Client-UI dieselbe Quelle nutzen.
export {
  type PlaceholderDef,
  ALLGEMEIN_PLACEHOLDERS,
  ONBOARDING_PLACEHOLDERS,
  PLACEHOLDER_CATALOG,
  getPlaceholderCatalog,
} from "@/lib/placeholder-catalog";

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

function deDateOnb(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * ONBOARDING-Resolver: fuellt die Platzhalter aus Personal- + Vorgesetzten-Daten
 * eines Onboarding-Vorgangs (refId == onboardingId). Sensible Felder (IBAN,
 * SV-Nr, Steuer-ID) werden entschluesselt und nur dann gemeldet, wenn die Vorlage
 * sie nutzt (siehe ResolverContext.placeholders).
 */
const onboardingResolver: PlaceholderResolver = async (ctx) => {
  const sensitiveFields: string[] = [];
  if (!ctx.refId) {
    return { data: await commonPlaceholders(ctx.organizationId), sensitiveFields };
  }

  const ob = await prisma.onboardingProcess.findUnique({
    where: { id: ctx.refId },
    select: {
      displayId: true,
      email: true,
      firstName: true,
      lastName: true,
      organizationId: true,
      personalData: {
        select: {
          salutation: true, title: true, firstName: true, lastName: true,
          birthName: true, birthDate: true, birthPlace: true, nationality: true,
          maritalStatus: true, street: true, houseNumber: true, zipCode: true,
          city: true, phone: true, mobile: true, emailPrivate: true,
          iban: true, bic: true, bankName: true, accountHolder: true,
          socialSecurityNumber: true, healthInsuranceName: true, taxId: true,
          taxClass: true, religion: true, highestSchoolDegree: true,
          highestProfessionalDegree: true,
        },
      },
      supervisorData: {
        select: {
          vertragsbeginn: true, vertragsende: true, stellenbeschreibung: true,
          betriebsstaette: true, entgeltgruppe: true, stufe: true,
          wochenstunden: true, probezeitMonate: true, urlaubstageProJahr: true,
        },
      },
    },
  });
  if (!ob) {
    return { data: await commonPlaceholders(ctx.organizationId), sensitiveFields };
  }

  const data = await commonPlaceholders(ob.organizationId);
  const pd = ob.personalData;
  const sd = ob.supervisorData;

  const set = (key: string, value: unknown): void => {
    if (value == null) return;
    const s = typeof value === "string" ? value : String(value);
    if (s.trim() === "") return;
    data[key] = value;
  };

  const vorname = pd?.firstName || ob.firstName || "";
  const nachname = pd?.lastName || ob.lastName || "";
  set("vorname", vorname);
  set("nachname", nachname);
  set("name", `${vorname} ${nachname}`.trim());
  set("anrede", pd?.salutation);
  set("titel", pd?.title);
  set("geburtsname", pd?.birthName);
  set("geburtsdatum", deDateOnb(pd?.birthDate));
  set("geburtsort", pd?.birthPlace);
  set("staatsangehoerigkeit", pd?.nationality);
  set("familienstand", pd?.maritalStatus);
  set("vorgangsnummer", ob.displayId);

  set("strasse", [pd?.street, pd?.houseNumber].filter(Boolean).join(" "));
  set("plz", pd?.zipCode);
  set("ort", pd?.city);
  set("plz_ort", [pd?.zipCode, pd?.city].filter(Boolean).join(" "));
  set("telefon", pd?.phone);
  set("mobil", pd?.mobile);
  set("email", ob.email);
  set("email_privat", pd?.emailPrivate);

  set("bic", pd?.bic);
  set("bank", pd?.bankName);
  set("kontoinhaber", pd?.accountHolder);
  set("krankenkasse", pd?.healthInsuranceName);
  set("steuerklasse", pd?.taxClass);
  set("religion", pd?.religion);
  set("schulabschluss", pd?.highestSchoolDegree);
  set("berufsausbildung", pd?.highestProfessionalDegree);

  set("eintrittsdatum", deDateOnb(sd?.vertragsbeginn));
  set("vertragsende", deDateOnb(sd?.vertragsende));
  set("stellenbeschreibung", sd?.stellenbeschreibung);
  set("betriebsstaette", sd?.betriebsstaette);
  set("entgeltgruppe", sd?.entgeltgruppe);
  set("stufe", sd?.stufe);
  if (sd?.wochenstunden != null) set("wochenstunden", String(sd.wochenstunden).replace(".", ","));
  if (sd?.probezeitMonate != null) set("probezeit_monate", sd.probezeitMonate);
  if (sd?.urlaubstageProJahr != null) set("urlaubstage", sd.urlaubstageProJahr);

  // Sensible Felder nur aufloesen/melden, wenn die Vorlage sie nutzt.
  const wants = (key: string): boolean =>
    !ctx.placeholders || ctx.placeholders.includes(key);
  const resolveSensitive = (key: string, enc: string | null | undefined): void => {
    if (!enc || !wants(key)) return;
    const klar = decrypt(enc);
    if (klar && klar.trim() !== "") {
      data[key] = klar;
      sensitiveFields.push(key);
    }
  };
  resolveSensitive("iban", pd?.iban);
  resolveSensitive("sv_nummer", pd?.socialSecurityNumber);
  resolveSensitive("steuer_id", pd?.taxId);

  return { data, sensitiveFields };
};

const resolvers: Record<string, PlaceholderResolver> = {
  ALLGEMEIN: allgemeinResolver,
  ONBOARDING: onboardingResolver,
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
