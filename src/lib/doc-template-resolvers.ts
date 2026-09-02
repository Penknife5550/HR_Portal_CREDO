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
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import {
  getBefristungSachgrundLabel,
  getBefristungsartLabel,
  labelOderRohwert,
  CERTIFICATE_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EXIT_TYPE_LABELS,
  OVERALL_GRADE_FORMULATIONS,
  SCHOOL_GRADE_LABELS,
  ZEUGNIS_JOB_GROUP_LABELS,
  CIVIL_SERVICE_STATUS_LABELS,
} from "@/lib/constants";

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
  OFFBOARDING_PLACEHOLDERS,
  VERBEAMTUNG_PLACEHOLDERS,
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
  const datum = new Date(d);
  // Ein Invalid-Date-Objekt ist truthy — ohne diese Pruefung liefert
  // toLocaleDateString woertlich "Invalid Date", und genau das stuende dann im
  // erzeugten Schreiben. Die Aufrufer geben teils Werte aus untypisierten
  // Json-Feldern herein (dokubitDaten, prerequisites aus dem oeffentlichen
  // Antragsformular), die kein gueltiges Datum sein muessen.
  if (Number.isNaN(datum.getTime())) return undefined;
  return datum.toLocaleDateString("de-DE", {
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

/**
 * Geldbetrag in deutscher Schreibweise, immer mit zwei Nachkommastellen.
 *
 * Betrifft nur die Betraege, die als Zahl gespeichert sind. Die Abfindung ist
 * ein FREITEXT-Feld und laeuft bewusst NICHT hier durch: Aus "15.000,00" wuerde
 * beim Parsen der Betrag fuenfzehn — und der stuende dann in einem
 * Aufhebungsvertrag.
 */
function euroDe(wert: number | null | undefined): string | undefined {
  if (wert == null || Number.isNaN(wert)) return undefined;
  return wert.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Kommazahl in deutscher Schreibweise, ohne erzwungene Nachkommastellen. */
function zahlDe(wert: number | null | undefined): string | undefined {
  if (wert == null || Number.isNaN(wert)) return undefined;
  return String(wert).replace(".", ",");
}

/**
 * OFFBOARDING-Resolver: fuellt die Platzhalter aus einem Offboarding-Vorgang
 * (refId == offboardingId).
 *
 * Anschrift, Anrede, Titel, Geburtsort, Position und Wochenstunden stammen aus
 * dem vorgelagerten Vertragsende-Vorgang und gibt es deshalb nur bei Vorgaengen,
 * die daraus entstanden sind. Bei von Hand angelegten Offboardings hat das
 * Portal keine Postanschrift der Person — die betroffenen Platzhalter bleiben
 * dann ungesetzt und rendern als "___".
 */
const offboardingResolver: PlaceholderResolver = async (ctx) => {
  const sensitiveFields: string[] = [];
  const nurAllgemein = async (): Promise<ResolvedPlaceholders> => ({
    data: await commonPlaceholders(ctx.organizationId, ctx.session?.userId),
    sensitiveFields,
  });

  if (!ctx.refId) return nurAllgemein();

  const off = await prisma.offboardingProcess.findUnique({
    where: { id: ctx.refId },
    select: {
      displayId: true,
      organizationId: true,
      employeeEmail: true,
      employeeFirstName: true,
      employeeLastName: true,
      employeePersonalNr: true,
      employeePrivateEmail: true,
      exitType: true,
      exitReason: true,
      noticeDate: true,
      noticePeriodEnd: true,
      lastWorkingDay: true,
      contractEndDate: true,
      employee: {
        select: { personalNumber: true, dateOfBirth: true, phone: true, privateEmail: true },
      },
      exitData: {
        select: {
          employmentType: true, tarifvertrag: true, entgeltgruppe: true,
          remainingVacationDays: true, vacationPayout: true,
          overtimeHours: true, overtimePayout: true, severancePay: true,
          certificateType: true, nonCompeteClause: true, successorName: true,
        },
      },
      contractEnd: {
        select: {
          contractStartDate: true, currentPosition: true,
          currentEntgeltgruppe: true, currentStufe: true,
          currentWochenstunden: true, dokubitDaten: true,
        },
      },
      zeugnisBewertung: {
        select: {
          jobGroup: true, overallGradeRounded: true,
          status: true, finalizedAt: true, supervisorName: true,
        },
      },
      returnItems: {
        select: { category: true, itemName: true, serialNumber: true, isReturned: true, returnedAt: true },
      },
    },
  });
  if (!off) return nurAllgemein();

  // Mandantenpruefung. Der Erzeugen-Endpunkt prueft die Organisation der
  // VORLAGE und eine mitgeschickte organizationId, aber nicht, ob der Vorgang
  // hinter der refId zum eigenen Mandanten gehoert. Ohne diese Zeile koennte
  // eine fremde Vorgangs-ID untergeschoben werden.
  if (!(await canAccessProcess(ctx.session, off.organizationId))) {
    return nurAllgemein();
  }

  // Mandant DES VORGANGS, nicht ctx.organizationId — sonst truege das Schreiben
  // den Briefkopf eines fremden Traegers.
  const data = await commonPlaceholders(off.organizationId, ctx.session?.userId);
  const ed = off.exitData;
  const ce = off.contractEnd;
  const zb = off.zeugnisBewertung;

  const set = (key: string, value: unknown): void => {
    if (value == null) return;
    const s = typeof value === "string" ? value : String(value);
    if (s.trim() === "") return;
    data[key] = value;
  };

  // dokubitDaten ist ein untypisiertes Json-Feld (Whitelist
  // contractEndStammdatenSchema) — wie im Vertragsverlaengerungs-Resolver als
  // Zeichenketten-Map lesen, Datumswerte liegen als YYYY-MM-DD vor.
  const dokubit = (ce?.dokubitDaten ?? {}) as Record<string, string>;
  const dk = (feld: string): string | undefined => {
    const v = dokubit[feld];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  const dkDatum = (feld: string): string | undefined => {
    const v = dk(feld);
    return v ? deDateOnb(new Date(v)) : undefined;
  };

  const vorname = off.employeeFirstName;
  const nachname = off.employeeLastName;
  set("vorname", vorname);
  set("nachname", nachname);
  set("name", `${vorname} ${nachname}`.trim());
  set("anrede", dk("anrede"));
  set("titel", dk("titel"));
  set("geschlecht", dk("geschlecht"));
  set("personalnummer", off.employeePersonalNr || off.employee?.personalNumber);
  set("geburtsdatum", deDateOnb(off.employee?.dateOfBirth) ?? dkDatum("geburtsdatum"));
  set("geburtsort", dk("geburtsort"));
  set("email", off.employeeEmail);
  set("email_privat", off.employeePrivateEmail || off.employee?.privateEmail);
  set("telefon", off.employee?.phone);

  set("strasse", dk("strasse"));
  set("plz", dk("plz"));
  set("ort", dk("ort"));
  set("plz_ort", [dk("plz"), dk("ort")].filter(Boolean).join(" "));

  set("vorgangsnummer", off.displayId);

  set("austrittsart", EXIT_TYPE_LABELS[off.exitType] ?? off.exitType);
  set("austrittsgrund", off.exitReason);
  set("kuendigungsdatum", deDateOnb(off.noticeDate));
  set("kuendigungsfrist_ende", deDateOnb(off.noticePeriodEnd));
  set("letzter_arbeitstag", deDateOnb(off.lastWorkingDay));
  // {vertragsende} meint hier das Ende des AUSLAUFENDEN Arbeitsverhaeltnisses.
  set("vertragsende", deDateOnb(off.contractEndDate));
  set("eintrittsdatum", deDateOnb(ce?.contractStartDate));
  set("konzerneintritt", dkDatum("konzerneintritt"));

  set("position", ce?.currentPosition);
  set("beschaeftigungsart", labelOderRohwert(EMPLOYMENT_TYPE_LABELS, ed?.employmentType));
  set("tarifvertrag", ed?.tarifvertrag);
  set("entgeltgruppe", ed?.entgeltgruppe || ce?.currentEntgeltgruppe);
  set("stufe", ce?.currentStufe);
  set("wochenstunden", zahlDe(ce?.currentWochenstunden));
  set("wettbewerbsverbot", ed?.nonCompeteClause ? "Ja" : "Nein");
  set("nachfolger", ed?.successorName);

  set("resturlaub_tage", zahlDe(ed?.remainingVacationDays));
  set("urlaubsauszahlung", euroDe(ed?.vacationPayout));
  set("ueberstunden", zahlDe(ed?.overtimeHours));
  set("ueberstundenauszahlung", euroDe(ed?.overtimePayout));

  set("zeugnisart", labelOderRohwert(CERTIFICATE_TYPE_LABELS, ed?.certificateType));
  set("zeugnis_berufsgruppe", ZEUGNIS_JOB_GROUP_LABELS[zb?.jobGroup ?? ""] ?? zb?.jobGroup);
  set("beurteiler_name", zb?.supervisorName);

  // Note NUR aus einer abgeschlossenen Bewertung. Vorher ist es die
  // vorlaeufige Einschaetzung der Fuehrungskraft ohne die HR-Korrektur — die
  // gehoert nicht in ein rechtsverbindliches Arbeitszeugnis.
  const noteFreigegeben = zb?.status === "FINALIZED" && zb?.overallGradeRounded != null;
  if (noteFreigegeben) {
    const note = zb.overallGradeRounded as number;
    set("zeugnis_note", String(note));
    set("zeugnis_note_text", SCHOOL_GRADE_LABELS[note]?.label);
    set("zeugnis_gesamtformulierung", OVERALL_GRADE_FORMULATIONS[note]);
  }

  // Rueckgaben als mehrzeilige Zeichenkette: renderDocx laeuft mit
  // linebreaks: true, Umbrueche kommen also im Word an. Ein Schleifen-Konstrukt
  // kennen weder der Editor noch PlaceholderDef. ReturnItem hat kein
  // orderIndex, deshalb explizit sortieren.
  const sortiert = [...off.returnItems].sort(
    (a, b) =>
      String(a.category).localeCompare(String(b.category)) ||
      a.itemName.localeCompare(b.itemName),
  );
  const bezeichnung = (i: (typeof sortiert)[number]): string =>
    i.serialNumber ? `${i.itemName} (${i.serialNumber})` : i.itemName;
  const zurueck = sortiert.filter((i) => i.isReturned);
  const offen = sortiert.filter((i) => !i.isReturned);
  if (zurueck.length > 0) {
    set(
      "rueckgaben_liste",
      zurueck
        .map((i) => {
          const am = deDateOnb(i.returnedAt);
          return am ? `${bezeichnung(i)} — zurueck am ${am}` : bezeichnung(i);
        })
        .join("\n"),
    );
  }
  if (offen.length > 0) {
    set("rueckgaben_offen_liste", offen.map(bezeichnung).join("\n"));
    set("rueckgaben_offen_anzahl", String(offen.length));
  }

  // Sensibles Feld nur aufloesen und melden, wenn die Vorlage es nutzt.
  // Die Abfindung ist ein Freitext und wird UNVERAENDERT uebernommen.
  const wantsAbfindung =
    !ctx.placeholders || ctx.placeholders.includes("abfindung");
  if (ed?.severancePay && wantsAbfindung) {
    const klar = decrypt(ed.severancePay);
    if (klar && klar.trim() !== "") {
      data.abfindung = klar;
      sensitiveFields.push("abfindung");
    }
  }

  return { data, sensitiveFields };
};

/** PSI-Art als Klartext. */
const PSI_ART_LABELS: Record<string, string> = {
  PROBE: "Beamtenverhaeltnis auf Probe",
  LIFETIME: "Beamtenverhaeltnis auf Lebenszeit",
};

/** Ergebnis einer Beiratsentscheidung als Klartext. */
const BEIRAT_ERGEBNIS_LABELS: Record<string, string> = {
  POSITIVE: "Zustimmung",
  NEGATIVE: "Ablehnung",
  POSTPONED: "Zurueckgestellt",
};

/**
 * VERBEAMTUNG-Resolver: fuellt die Platzhalter aus einem PSI-Vorgang
 * (refId == civilServiceProcessId).
 *
 * `prerequisites`, `applicationData` und `stakeholders` sind untypisierte
 * Json-Felder, die zum Teil aus einem OEFFENTLICHEN Magic-Link-Formular
 * stammen. Sie werden deshalb schluesselweise und mit Typpruefung gelesen,
 * niemals blind uebernommen.
 *
 * Schutzwuerdige Angaben (Gemeindezugehoerigkeit, persoenliche Erklaerung,
 * Beurteilungsergebnisse) sind NICHT verschluesselt, gehoeren aber ins
 * Protokoll: Sie werden wie sensible Felder ueber `placeholders` gegated und
 * in `sensitiveFields` gemeldet.
 */
const verbeamtungResolver: PlaceholderResolver = async (ctx) => {
  const sensitiveFields: string[] = [];
  const nurAllgemein = async (): Promise<ResolvedPlaceholders> => ({
    data: await commonPlaceholders(ctx.organizationId, ctx.session?.userId),
    sensitiveFields,
  });

  if (!ctx.refId) return nurAllgemein();

  const cs = await prisma.civilServiceProcess.findUnique({
    where: { id: ctx.refId },
    select: {
      displayId: true,
      organizationId: true,
      employeeFirstName: true,
      employeeLastName: true,
      employeeEmail: true,
      employeePersonalNr: true,
      type: true,
      status: true,
      targetStartDate: true,
      probationStartDate: true,
      probationEndDate: true,
      completedAt: true,
      besoldungsgruppe: true,
      erfahrungsstufe: true,
      applicationSubmittedAt: true,
      prerequisites: true,
      applicationData: true,
      stakeholders: true,
      employee: {
        select: { personalNumber: true, dateOfBirth: true, phone: true, privateEmail: true },
      },
      organization: {
        select: {
          ezBrDetmoldName: true, ezBrDetmoldEmail: true, ezBrDetmoldPhone: true,
          ezBrDetmoldAktenPrefix: true, ezGfFirstName: true, ezGfLastName: true,
          ezGfTitle: true,
        },
      },
      assessments: {
        select: {
          assessmentType: true, assessmentNumber: true, submittedAt: true,
          meetsRequirements: true, meetsRequirementsManual: true,
        },
      },
      boardDecisions: {
        select: { decisionType: true, result: true, decisionDate: true },
        orderBy: { decisionDate: "desc" },
      },
    },
  });
  if (!cs) return nurAllgemein();

  // Mandantenpruefung — siehe offboardingResolver.
  if (!(await canAccessProcess(ctx.session, cs.organizationId))) {
    return nurAllgemein();
  }

  const data = await commonPlaceholders(cs.organizationId, ctx.session?.userId);

  const set = (key: string, value: unknown): void => {
    if (value == null) return;
    const s = typeof value === "string" ? value : String(value);
    if (s.trim() === "") return;
    data[key] = value;
  };

  // Json-Felder schluesselweise und mit Typpruefung lesen.
  const json = (feld: unknown): Record<string, unknown> =>
    feld && typeof feld === "object" && !Array.isArray(feld)
      ? (feld as Record<string, unknown>)
      : {};
  const vor = json(cs.prerequisites);
  const antrag = json(cs.applicationData);
  const beteiligte = json(cs.stakeholders);

  const text = (quelle: Record<string, unknown>, key: string): string | undefined => {
    const v = quelle[key];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  const zahl = (quelle: Record<string, unknown>, key: string): string | undefined => {
    const v = quelle[key];
    return typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;
  };
  /** Ein verschachtelter Beteiligter, z.B. stakeholders.schulleitung.email */
  const beteiligter = (rolle: string, feld: string): string | undefined =>
    text(json(beteiligte[rolle]), feld);

  set("vorgangsnummer", cs.displayId);
  set("verbeamtungsart", PSI_ART_LABELS[cs.type] ?? cs.type);
  set("vorgang_status", CIVIL_SERVICE_STATUS_LABELS[cs.status]?.label ?? cs.status);
  set("antrag_eingereicht_am", deDateOnb(cs.applicationSubmittedAt));

  const vorname = cs.employeeFirstName;
  const nachname = cs.employeeLastName;
  set("vorname", vorname);
  set("nachname", nachname);
  set("name", `${vorname} ${nachname}`.trim());
  set("email", cs.employeeEmail);
  set("personalnummer", cs.employeePersonalNr || cs.employee?.personalNumber);
  set("geburtsdatum", deDateOnb(cs.employee?.dateOfBirth));
  set("telefon", cs.employee?.phone);
  set("email_privat", cs.employee?.privateEmail);

  set("geplanter_beginn", deDateOnb(cs.targetStartDate));
  set("probezeit_beginn", deDateOnb(cs.probationStartDate));
  set("probezeit_ende", deDateOnb(cs.probationEndDate));
  set("abgeschlossen_am", deDateOnb(cs.completedAt));
  set("besoldungsgruppe", cs.besoldungsgruppe);
  if (cs.erfahrungsstufe != null) set("erfahrungsstufe", String(cs.erfahrungsstufe));

  set("faecher", text(vor, "subjectCombination"));
  set("stellenumfang_prozent", zahl(vor, "workloadPercent"));
  const seminar = text(vor, "vebsSeminarCompletedDate");
  if (seminar) set("vebs_seminar_am", deDateOnb(new Date(seminar)));

  set("schulleitung_name", beteiligter("schulleitung", "name"));
  set("schulleitung_email", beteiligter("schulleitung", "email"));
  set("amtsarzt_email", beteiligter("amtsarzt", "email"));
  set("beirat_email", beteiligter("beirat", "email"));

  // Mandanten-Stammdaten. Heute bei keinem der 16 Mandanten gepflegt und in
  // der Oberflaeche unter "Elternzeit-Konfiguration" zu finden, obwohl das
  // Datenmodell sie fuer die Verbeamtung vorsieht.
  const o = cs.organization;
  set("br_kontakt", o?.ezBrDetmoldName);
  set("br_email", o?.ezBrDetmoldEmail);
  set("br_telefon", o?.ezBrDetmoldPhone);
  set("br_aktenzeichen_prefix", o?.ezBrDetmoldAktenPrefix);
  set("gf_name", [o?.ezGfFirstName, o?.ezGfLastName].filter(Boolean).join(" "));
  set("gf_funktion", o?.ezGfTitle);

  // Beurteilungen und Referenzen. Das Gesamturteil ist meetsRequirementsManual
  // (BRL Nr. 7.5); meetsRequirements ist nur der Legacy-Fallback. Der
  // Gesamtschnitt bleibt bewusst aussen vor — der Schema-Kommentar sagt
  // woertlich "KEIN Gesamturteil".
  const findeBeurteilung = (typ: string, nr: number) =>
    cs.assessments.find((a) => a.assessmentType === typ && a.assessmentNumber === nr);

  const wants = (key: string): boolean =>
    !ctx.placeholders || ctx.placeholders.includes(key);
  /** Schutzwuerdig: setzen und melden, aber nur wenn die Vorlage es nutzt. */
  const setGeschuetzt = (key: string, value: string | undefined): void => {
    if (!value || !wants(key)) return;
    data[key] = value;
    sensitiveFields.push(key);
  };

  for (const nr of [1, 2, 3]) {
    const b = findeBeurteilung("BEURTEILUNG", nr);
    if (!b) continue;
    set(`beurteilung_${nr}_am`, deDateOnb(b.submittedAt));
    const erfuellt = b.meetsRequirementsManual ?? b.meetsRequirements;
    if (erfuellt != null) {
      setGeschuetzt(
        `beurteilung_${nr}_ergebnis`,
        erfuellt ? "Anforderungen erfuellt" : "Anforderungen nicht erfuellt",
      );
    }
  }
  for (const nr of [1, 2]) {
    const r = findeBeurteilung("REFERENZ", nr);
    if (r) set(`referenz_${nr}_am`, deDateOnb(r.submittedAt));
  }

  // Beiratsentscheidung: NUR die neueste, deren Art zum Vorgang passt.
  //
  // Bewusst ohne Rueckfall auf die neueste Entscheidung beliebiger Art: Ein
  // Lebenszeit-Vorgang traegt in der Regel schon die Probe-Entscheidung von vor
  // drei Jahren. Ein Schreiben "Mitteilung Beiratsentscheidung (Lebenszeit)",
  // das nur {beirat_entscheidung} nutzt, teilte der Lehrkraft sonst eine
  // Zustimmung mit, die der Beirat nie getroffen hat. Fehlt die passende
  // Entscheidung, bleiben die Platzhalter ungesetzt und rendern "___".
  const beirat = cs.boardDecisions.find((b) => b.decisionType === cs.type);
  if (beirat) {
    setGeschuetzt(
      "beirat_entscheidung",
      BEIRAT_ERGEBNIS_LABELS[beirat.result] ?? String(beirat.result),
    );
    set("beirat_entscheidung_am", deDateOnb(beirat.decisionDate));
    set(
      "beirat_entscheidung_art",
      PSI_ART_LABELS[beirat.decisionType] ?? beirat.decisionType,
    );
  }

  setGeschuetzt("gemeinde", text(vor, "activeCommunityMembershipDetail"));
  setGeschuetzt("antrag_erklaerung", text(antrag, "employeeStatement"));

  return { data, sensitiveFields };
};

const resolvers: Record<string, PlaceholderResolver> = {
  ALLGEMEIN: allgemeinResolver,
  ONBOARDING: onboardingResolver,
  VERTRAGSVERLAENGERUNG: vertragsverlaengerungResolver,
  OFFBOARDING: offboardingResolver,
  VERBEAMTUNG: verbeamtungResolver,
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
