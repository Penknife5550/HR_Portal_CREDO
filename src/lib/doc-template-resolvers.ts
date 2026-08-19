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
import { getBefristungSachgrundLabel, getBefristungsartLabel } from "@/lib/constants";

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

// Modul-Liste und Platzhalter-Katalog (PlaceholderDef, PLACEHOLDER_CATALOG,
// getPlaceholderCatalog) liegen client-sicher in placeholder-catalog.ts und
// werden hier re-exportiert, damit Server-Resolver und Client-UI dieselbe
// Quelle nutzen.
export {
  type PlaceholderDef,
  AVAILABLE_MODULES,
  MODULE_VALUES,
  moduleLabel,
  ALLGEMEIN_PLACEHOLDERS,
  ONBOARDING_PLACEHOLDERS,
  VERTRAGSVERLAENGERUNG_PLACEHOLDERS,
  BEM_PLACEHOLDERS,
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
 * verantwortliche Stelle nach DSGVO, Sachbearbeiter). Faellt auf den globalen
 * Default zurueck, wenn keine Organisation uebergeben wird.
 *
 * `userId` ist optional: Ist sie gesetzt, werden zusaetzlich die
 * {sachbearbeiter_*}-Platzhalter aus dem Benutzerkonto der Person gefuellt,
 * die das Dokument erzeugt.
 */
export async function commonPlaceholders(
  organizationId?: string | null,
  userId?: string | null,
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

  // Sachbearbeiter:in = angemeldete Person, die das Dokument erzeugt.
  // Leere Werte werden NICHT gesetzt, damit docxtemplater sie als "___"
  // markiert und meldet (statt einer unsichtbaren Luecke im Schreiben).
  if (userId) {
    const sb = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true, phone: true },
    });
    if (sb) {
      const setSb = (key: string, value: string | null | undefined): void => {
        if (value && value.trim() !== "") base[key] = value.trim();
      };
      const vorname = sb.firstName?.trim() || "";
      const nachname = sb.lastName?.trim() || "";
      setSb("sachbearbeiter_vorname", vorname);
      setSb("sachbearbeiter_nachname", nachname);
      setSb("sachbearbeiter_name", `${vorname} ${nachname}`.trim());
      setSb("sachbearbeiter_email", sb.email);
      setSb("sachbearbeiter_telefon", sb.phone);
    }
  }

  return base;
}

const allgemeinResolver: PlaceholderResolver = async (ctx) => {
  const data = await commonPlaceholders(ctx.organizationId, ctx.session?.userId);
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
    return {
      data: await commonPlaceholders(ctx.organizationId, ctx.session?.userId),
      sensitiveFields,
    };
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
          befristet: true, befristungsart: true, befristungZweck: true,
          vertragsendeVoraussichtlich: true, befristungSachgrund: true,
          betriebsstaette: true, entgeltgruppe: true, stufe: true,
          wochenstunden: true, probezeitMonate: true, urlaubstageProJahr: true,
        },
      },
    },
  });
  if (!ob) {
    return {
      data: await commonPlaceholders(ctx.organizationId, ctx.session?.userId),
      sensitiveFields,
    };
  }

  const data = await commonPlaceholders(ob.organizationId, ctx.session?.userId);
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
  if (sd?.befristet) {
    set("befristung_art", getBefristungsartLabel(sd.befristungsart));
    set("befristung_sachgrund", getBefristungSachgrundLabel(sd.befristungSachgrund));
    // Bei Zweckbefristung gibt es bewusst KEIN kalendermaessiges Vertragsende
    if (sd.befristungsart === "ZWECK") {
      set("befristung_zweck", sd.befristungZweck);
      set("vertragsende_voraussichtlich", deDateOnb(sd.vertragsendeVoraussichtlich));
    } else {
      set("vertragsende", deDateOnb(sd.vertragsende));
    }
  }
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

/**
 * VERTRAGSVERLAENGERUNG-Resolver: fuellt die Platzhalter aus dem Vertragsende-
 * Vorgang (refId == contractEndId) + den vom Vorgesetzten erfassten
 * Verlaengerungsdaten (ContractRenewalData). Keine sensiblen Felder.
 */
const vertragsverlaengerungResolver: PlaceholderResolver = async (ctx) => {
  const sensitiveFields: string[] = [];
  if (!ctx.refId) {
    return {
      data: await commonPlaceholders(ctx.organizationId, ctx.session?.userId),
      sensitiveFields,
    };
  }

  const ce = await prisma.contractEndProcess.findUnique({
    where: { id: ctx.refId },
    select: {
      displayId: true,
      employeeFirstName: true,
      employeeLastName: true,
      employeePersonalNr: true,
      contractEndDate: true,
      organizationId: true,
      currentPosition: true,
      currentEntgeltgruppe: true,
      currentStufe: true,
      currentWochenstunden: true,
      dokubitDaten: true,
      renewalData: {
        select: {
          vertragsbeginn: true, vertragsende: true, befristungSachgrund: true,
          wochenstunden: true, entgeltgruppe: true, stufe: true,
          urlaubstageProJahr: true, probezeitMonate: true,
          stellenbeschreibung: true, betriebsstaette: true,
        },
      },
    },
  });
  if (!ce) {
    return {
      data: await commonPlaceholders(ctx.organizationId, ctx.session?.userId),
      sensitiveFields,
    };
  }

  const data = await commonPlaceholders(ce.organizationId, ctx.session?.userId);
  const rd = ce.renewalData;
  const set = (key: string, value: unknown): void => {
    if (value == null) return;
    const s = typeof value === "string" ? value : String(value);
    if (s.trim() === "") return;
    data[key] = value;
  };

  const vorname = ce.employeeFirstName || "";
  const nachname = ce.employeeLastName || "";
  set("vorname", vorname);
  set("nachname", nachname);
  set("name", `${vorname} ${nachname}`.trim());
  set("personalnummer", ce.employeePersonalNr);
  set("vorgangsnummer", ce.displayId);
  set("altes_vertragsende", deDateOnb(ce.contractEndDate));

  set("neuer_vertragsbeginn", deDateOnb(rd?.vertragsbeginn));
  set("neues_vertragsende", deDateOnb(rd?.vertragsende));
  set("befristung_sachgrund", rd?.befristungSachgrund);
  if (rd?.wochenstunden != null) set("wochenstunden", String(rd.wochenstunden).replace(".", ","));
  set("entgeltgruppe", rd?.entgeltgruppe);
  set("stufe", rd?.stufe);
  if (rd?.urlaubstageProJahr != null) set("urlaubstage", rd.urlaubstageProJahr);
  if (rd?.probezeitMonate != null) set("probezeit_monate", rd.probezeitMonate);
  set("stellenbeschreibung", rd?.stellenbeschreibung);
  set("betriebsstaette", rd?.betriebsstaette);

  // Aktueller (auslaufender) Vertrag — typisierte n8n-Felder
  set("aktuelle_position", ce.currentPosition);
  set("aktuelle_entgeltgruppe", ce.currentEntgeltgruppe);
  set("aktuelle_stufe", ce.currentStufe);
  if (ce.currentWochenstunden != null) {
    set("aktuelle_wochenstunden", String(ce.currentWochenstunden).replace(".", ","));
  }

  // DokuBit-Stammdaten (dokubitDaten Json) — Datumsfelder de-DE formatieren.
  // Keys der Whitelist (contractEndStammdatenSchema) -> Platzhalter-Namen.
  const dokubit = (ce.dokubitDaten ?? {}) as Record<string, string>;
  const setDokubitText = (placeholder: string, key: string) => set(placeholder, dokubit[key]);
  const setDokubitDate = (placeholder: string, key: string) => {
    const v = dokubit[key];
    if (v) set(placeholder, deDateOnb(new Date(v)));
  };
  setDokubitText("anrede", "anrede");
  setDokubitText("titel", "titel");
  setDokubitText("grad", "grad");
  setDokubitText("strasse", "strasse");
  setDokubitText("plz", "plz");
  setDokubitText("ort", "ort");
  setDokubitDate("geburtsdatum", "geburtsdatum");
  setDokubitText("geburtsort", "geburtsort");
  setDokubitText("geschlecht", "geschlecht");
  setDokubitText("qualifikation", "qualifikation");
  setDokubitText("mitarbeiter_status", "mitarbeiterStatus");
  setDokubitText("abrechnungskreis", "abrechnungskreis");
  setDokubitText("tarif", "tarif");
  setDokubitDate("konzerneintritt", "konzerneintritt");
  setDokubitDate("regelaltersgrenze", "regelaltersgrenze");
  setDokubitText("beschaeftigungsgruppe", "beschaeftigungsgruppe");
  setDokubitText("vertragsart", "vertragsart");
  setDokubitText("probezeit_einheit", "probezeitEinheit");
  setDokubitText("probezeit_dauer", "probezeitDauer");
  setDokubitDate("probezeit_von", "probezeitVon");
  setDokubitDate("probezeit_bis", "probezeitBis");
  setDokubitDate("evtl_lda", "evtlLda");

  return { data, sensitiveFields };
};

const resolvers: Record<string, PlaceholderResolver> = {
  ALLGEMEIN: allgemeinResolver,
  ONBOARDING: onboardingResolver,
  VERTRAGSVERLAENGERUNG: vertragsverlaengerungResolver,
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
