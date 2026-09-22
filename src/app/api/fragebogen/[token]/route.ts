/**
 * API: Personalfragebogen Daten laden & speichern
 *
 * GET  /api/fragebogen/:token  → Lade gespeicherte Fragebogen-Daten
 * PUT  /api/fragebogen/:token  → Speichere/Aktualisiere Step-Daten (Auto-Save)
 * POST /api/fragebogen/:token  → Fragebogen endgültig absenden
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { validateMagicToken } from "@/lib/auth";
import {
  HR_STATUS,
  istHrStatus,
  mitarbeiterAbgesendet,
} from "@/lib/onboarding-spuren";
import { statusAbgleichen } from "@/lib/onboarding-status-abgleich";
import { triggerN8nWebhook } from "@/lib/n8n";
import { sendEmail } from "@/lib/mailer";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { encrypt, decrypt, isEncryptionConfigured } from "@/lib/encryption";
import { tokenRateLimiter, getClientIp, getClientIpOrNull } from "@/lib/rate-limit";
import {
  computeMissingRequiredDocuments,
  fehlendeNachreichbareDokumente,
  RV_BEFREIUNG_HINWEIS,
  documentTypeLabel,
} from "@/lib/required-documents";
import { istNach1970Geboren, masernschutzPflichtig } from "@/lib/masernschutz";
import { MAX_STEP_NUMBER, SUMMARY_STEP_NUMBER } from "@/lib/fragebogen-steps";
import { istBekannteErklaerung } from "@/lib/erklaerung-arbeitnehmer";
import { berechnePruefsumme } from "@/lib/fragebogen-pruefsumme";
import {
  ERLAUBTE_FRAGEBOGEN_FELDER,
  LEERBARE_FRAGEBOGEN_FELDER,
} from "@/lib/fragebogen-felder";
import {
  BESCHAEFTIGUNGS_KATEGORIEN,
  beschaeftigungsAngabenListeSchema,
  zuDatensatz,
} from "@/lib/validations/beschaeftigungs-angaben";
import { istKalendertag } from "@/lib/validations/personal-data";
import { z } from "zod";

// =============================================
// Serverseitige Validierung: Zod-Schema für alle erlaubten Felder
// Alle Felder sind optional (.optional()), da Auto-Save nur Teilmengen sendet
// =============================================

/**
 * Auswahlfeld, das den leeren Vorgabewert ueberlebt.
 *
 * Ein `<select>` startet mit `value=""`, und das Client-Schema laesst das
 * durch, wo das Feld ausgeblendet ist (siehe `beschaeftigungsStatus` in
 * validations/personal-data.ts: sichtbar `z.string().min(1)`, unsichtbar ein
 * blankes `z.string()`). Der Browser schickt dieses `""` also voellig
 * regelkonform mit. Ein nacktes `z.enum([...]).optional()` weist es ab — und
 * weil die Route dann den GANZEN Rumpf mit 400 „Validierungsfehler"
 * zurueckgibt, scheitert nicht nur das eine Feld, sondern der ganze Schritt.
 * Genau so wurde Schritt 6 fuer jeden Fragebogen unpassierbar, der nicht vom
 * Typ MINIJOB ist.
 *
 * `undefined` statt `null`: Die Speicherschleife weiter unten ueberspringt
 * `undefined` und schreibt nichts — ein leeres Auswahlfeld soll eine bereits
 * gespeicherte Angabe nicht loeschen. Ein `""` darf keinesfalls durchgereicht
 * werden; es waere weder ein gueltiger Enum-Wert noch eine Angabe.
 */
function enumOderLeer<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (wert) => (wert === "" || wert === null ? undefined : wert),
    schema.optional(),
  );
}

/**
 * Zahlenfeld, das ein geleertes Eingabefeld ueberlebt.
 *
 * `register("feld", { valueAsNumber: true })` liefert fuer ein geleertes Feld
 * `NaN` — nicht `""` und nicht `null`. Ueber JSON wird daraus `null`, aus
 * einem Textfeld ohne `valueAsNumber` dagegen `""`. Beide duerfen nicht die
 * gesamte Speicherung abweisen: Eine Zahl eintippen und wieder loeschen ist
 * ein alltaeglicher Handgriff.
 *
 * Ergebnis ist `null` (die Felder sind nullable). Die **0 bleibt 0** — ein
 * Grad der Behinderung von 0 oder ein Freibetrag von 0 sind gueltige Angaben,
 * deshalb wird hier auf `""`/`NaN` geprueft und nicht auf Falsy.
 */
function zahlOderLeer<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (wert) =>
      wert === "" || (typeof wert === "number" && Number.isNaN(wert))
        ? null
        : wert,
    schema.nullable().optional(),
  );
}

/**
 * Datumsfeld, das ein geleertes Eingabefeld ueberlebt — und keinen Unsinn
 * durchlaesst.
 *
 * `<input type="date">` sendet "JJJJ-MM-TT" oder "". Das `""` muss durchkommen,
 * sonst laesst sich ein einmal gesetztes Datum nie wieder loeschen (die
 * Freigabe dafuer steht in LEERBARE_FRAGEBOGEN_FELDER); die Speicherschleife
 * weiter unten macht daraus dann `null`.
 *
 * Geprueft wird streng, weil der Wert danach in `new Date()` und von dort nach
 * Prisma laeuft: "2026-02-31" hat das richtige Muster, ist aber kein
 * Kalendertag, und `Invalid Date` waere ein 500 statt eines roten Feldes. Die
 * Pruefung ist dieselbe wie im Client-Schema — `istKalendertag` steht dort und
 * wird hier mitbenutzt, damit die beiden Enden nicht auseinanderlaufen.
 */
function datumOderLeer() {
  return z.preprocess(
    (wert) => (wert === null ? "" : wert),
    z
      .string()
      .refine((wert) => wert === "" || istKalendertag(wert), {
        message: "Bitte geben Sie ein gueltiges Datum an (TT.MM.JJJJ).",
      })
      .optional(),
  );
}

const fragebogenFieldsSchema = z.object({
  salutation: enumOderLeer(z.enum(["Herr", "Frau"])),
  title: z.string().max(100).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  birthName: z.string().max(100).optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().max(200).optional(),
  birthCountry: z.string().max(100).optional(),
  nationality: z.string().max(100).optional(),
  // Selbstauskunft zum Aufenthaltstitel. `nullable`, weil die Ja/Nein-Frage
  // ohne Vorbelegung startet und ein noch nicht angeklicktes Feld `null`
  // sendet — die Speicherschleife ueberspringt es dann, statt den ganzen
  // Schritt mit 400 abzuweisen.
  aufenthaltstitelErforderlich: z.boolean().nullable().optional(),
  aufenthaltstitelGueltigBis: datumOderLeer(),
  maritalStatus: enumOderLeer(z.enum(["ledig", "verheiratet", "geschieden", "verwitwet", "getrennt_lebend", "eingetragene_partnerschaft"])),
  severelyDisabled: z.boolean().optional(),
  disabilityDegree: zahlOderLeer(z.number().min(0).max(100)),
  street: z.string().max(200).optional(),
  houseNumber: z.string().max(20).optional(),
  zipCode: z.string().max(10).optional(),
  city: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  mobile: z.string().max(50).optional(),
  emailPrivate: z.string().max(200).optional(),
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  bankName: z.string().max(200).optional(),
  accountHolder: z.string().max(200).optional(),
  socialSecurityNumber: z.string().max(20).optional(),
  healthInsuranceName: z.string().max(200).optional(),
  healthInsuranceType: enumOderLeer(z.enum(["gesetzlich", "privat"])),
  // Bewusst unabhaengig von healthInsuranceType: Die Frage wird bei gesetzlich
  // UND privat gestellt (Begruendung in validations/personal-data.ts).
  healthInsuranceMembership: enumOderLeer(
    z.enum(["eigene_mitgliedschaft", "familienversicherung"]),
  ),
  parentStatus: z.boolean().optional(),
  taxId: z.string().max(20).optional(),
  taxClass: enumOderLeer(z.enum(["I", "II", "III", "IV", "V", "VI"])),
  taxAllowance: zahlOderLeer(z.number().min(0)),
  childAllowance: zahlOderLeer(z.number().min(0)),
  religion: enumOderLeer(z.enum(["ev", "rk", "ak", "lt", "rf", "fr", "fg", "keine", "sonstige"])),
  highestSchoolDegree: enumOderLeer(z.enum(["ohne_schulabschluss", "hauptschulabschluss", "mittlere_reife", "abitur_fachabitur", "sonstiges"])),
  highestProfessionalDegree: enumOderLeer(z.enum(["ohne_berufsausbildung", "anerkannte_berufsausbildung", "meister_techniker_fachschule", "bachelor", "diplom_magister_master_staatsexamen", "promotion"])),
  isBeamter: z.boolean().optional(),
  besoldungsgruppe: z.string().max(50).optional(),
  laufbahngruppe: z.string().max(50).optional(),
  dienstzeitBeginn: z.string().optional(),
  amtsbezeichnung: z.string().max(200).optional(),
  verfassungstreuePruefung: z.boolean().optional(),
  hasOtherEmployment: z.boolean().optional(),
  otherEmployerName: z.string().max(200).optional(),
  otherWeeklyHours: zahlOderLeer(z.number().min(0).max(60)),
  employerType: enumOderLeer(z.enum(["hauptarbeitgeber", "nebenarbeitgeber", "nein"])),
  hasMinijob: z.boolean().optional(),
  minijobRvBefreiung: z.boolean().optional(),
  bornAfter1971: z.boolean().optional(),
  masernschutzProvided: z.boolean().optional(),
  // Abschnitt 2 der Minijob-Checkliste: Status bei Beginn der Beschaeftigung
  // und die Rueckfrage zur Agentur fuer Arbeit.
  //
  // Der Regelfall ist hier das LEERE Feld: Das Auswahlfeld ist nur in der
  // Vorlage MINIJOB ueberhaupt sichtbar (field-definitions.ts,
  // defaultVisible: false). Alle uebrigen Fragebogen senden den leeren
  // Vorgabewert — deshalb `enumOderLeer`.
  beschaeftigungsStatus: enumOderLeer(z.enum([
    "SCHUELER",
    "STUDENT",
    "SCHULENTLASSEN_BERUFSAUSBILDUNG",
    "SCHULENTLASSEN_STUDIUM",
    "SCHULENTLASSEN_FREIWILLIGENDIENST",
    "BESCHAEFTIGUNGSLOS_SUCHEND",
    "FREIWILLIGENDIENSTLEISTENDER",
    "PRAKTIKANT",
    "BEAMTER",
    "SELBSTSTAENDIGER",
    "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG",
    "ARBEITNEHMER_UNBEZAHLTER_URLAUB",
    "ARBEITNEHMER_ELTERNZEIT",
    "ALTERSVOLLRENTNER_VOR_REGELALTERSGRENZE",
    "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
    "VERSORGUNGSEMPFAENGER",
    "SONSTIGE",
  ])),
  // nullable: Wird die Frage gegenstandslos, sendet das Formular null.
  beschaeftigungsStatusSonstige: z.string().max(200).nullable().optional(),
  alsArbeitsuchendGemeldet: z.boolean().optional(),
  agenturFuerArbeit: z.string().max(200).nullable().optional(),
  mitLeistungsbezug: z.boolean().nullable().optional(),
  // Grundfragen zu Abschnitt 4 der Minijob-Checkliste. hasOtherEmployment
  // (oben) ist die Grundfrage zu 4a.
  vorbeschaeftigungenVorhanden: z.boolean().optional(),
  auslandsbeschaeftigungVorhanden: z.boolean().optional(),
  summeUeberGeringfuegigkeitsgrenze: z.boolean().nullable().optional(),
  // Abschnitt 5 der Minijob-Checkliste: Entscheidung zur Rentenversicherung.
  // Zeitpunkte setzt der Server, nicht der Browser.
  rvEntscheidung: enumOderLeer(z.enum([
    "KEINE_BEFREIUNG",
    "BEFREIUNG_BEANTRAGT",
    "RENTENVERSICHERUNGSFREI",
    "AUFHEBUNG_BEANTRAGT",
  ])),
  rvMerkblattGelesen: z.boolean().optional(),
  rvBindungBestaetigt: z.boolean().optional(),
  // Registry-Nummer des Schritts, auf dem der Vorgang steht — nicht die
  // Anzeigeposition. Obergrenze kommt aus der zentralen Schritt-Definition,
  // damit ein neuer Schritt hier nicht vergessen wird.
  currentStep: z.number().int().min(1).max(MAX_STEP_NUMBER).optional(),
  children: z.array(z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional(),
    birthDate: z.string().min(1),
    taxAllowance: z.boolean().optional(),
  })).optional(),
  // Zeilen der drei Tabellen aus Abschnitt 4. Die Validierung je Kategorie
  // steht in validations/beschaeftigungs-angaben.ts.
  beschaeftigungsAngaben: beschaeftigungsAngabenListeSchema.optional(),
  // Welche Kategorien der sendende Schritt VERANTWORTET — unabhaengig davon,
  // ob er gerade Zeilen dazu hat. Kein Feld von `PersonalData`, sondern eine
  // Angabe ueber den Aufruf selbst; deshalb steht es nicht in
  // ERLAUBTE_FRAGEBOGEN_FELDER und wird unten ausdruecklich herausgenommen.
  //
  // Optional, und das mit Absicht: Ein Browser, der die alte Fassung des
  // Formulars geladen hat, sendet es nicht. Fuer ihn gilt weiter das alte
  // Verhalten (siehe Speicherpfad), statt dass ihm ploetzlich Zeilen
  // verschwinden.
  beschaeftigungsKategorien: z
    .array(z.enum(BESCHAEFTIGUNGS_KATEGORIEN))
    .max(BESCHAEFTIGUNGS_KATEGORIEN.length)
    .optional(),
}).strip(); // strip() entfernt unbekannte Felder serverseitig (Defense in Depth zusaetzlich zur Whitelist)

// =============================================
// GET – Fragebogen-Daten laden
// =============================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate Limiting gegen Token-Enumeration
  const clientIp = getClientIp(_request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  // GET erlaubt auch nach der eigenen Abgabe (Anzeige der eingereichten Daten)
  const result = await validateMagicToken(token, { allowSubmitted: true });
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // PersonalData mit Kindern laden
  const personalData = await prisma.personalData.findUnique({
    where: { onboardingId: onboarding.id },
    include: {
      children: { orderBy: { orderIndex: "asc" } },
      beschaeftigungsAngaben: { orderBy: [{ kategorie: "asc" }, { orderIndex: "asc" }] },
    },
  });

  // Feld-Konfiguration + Pflicht-Dokumente laden.
  // stepsConfig: Snapshot vom Onboarding-Zeitpunkt (oder aktuelles Template).
  // requiredDocuments: immer aus dem aktuellen Template (nicht im Snapshot).
  const formTemplate = await prisma.formTemplate.findUnique({
    where: { questionnaireType: onboarding.questionnaireType },
    select: { stepsConfig: true, requiredDocuments: true },
  });
  const stepsConfig = onboarding.formTemplateSnapshot ?? formTemplate?.stepsConfig ?? null;
  const requiredDocuments = formTemplate?.requiredDocuments ?? [
    "GEBURTSURKUNDE_EIGEN",
    "GEBURTSURKUNDE_KIND",
  ];

  return NextResponse.json({
    onboardingId: onboarding.id,
    email: onboarding.email,
    organization: {
      name: onboarding.organization.name,
      mandantNumber: onboarding.organization.mandantNumber,
      type: onboarding.organization.type,
      // Nur die Tatsache, nicht die Nummer: Der Fragebogen muss den
      // Antrags-Download sperren koennen, aber die Betriebsnummer ist ein
      // Arbeitgeber-Stammdatum und gehoert nicht in ein oeffentliches Formular.
      betriebsnummerVorhanden: Boolean(onboarding.organization.betriebsnummer),
      // DSGVO: verantwortliche Stelle (pro Mandant konfigurierbar, sonst Default)
      dsgvoVerantwortlicheName: onboarding.organization.dsgvoVerantwortlicheName,
      dsgvoVerantwortlicheStrasse: onboarding.organization.dsgvoVerantwortlicheStrasse,
      dsgvoVerantwortlichePlz: onboarding.organization.dsgvoVerantwortlichePlz,
      dsgvoVerantwortlicheOrt: onboarding.organization.dsgvoVerantwortlicheOrt,
    },
    questionnaireType: onboarding.questionnaireType,
    status: onboarding.status,
    // Die Seite entscheidet an DIESEM Feld, ob sie die Karte „bereits
    // eingereicht" zeigt — nicht am Status. Der Status fasst seit dem
    // parallelen Ablauf beide Spuren zusammen; hat die Fuehrungskraft zuerst
    // abgesendet, stand er frueher auf SUPERVISOR_SUBMITTED, und die Person sah
    // „bereits eingereicht", obwohl sie nichts abgesendet hatte.
    mitarbeiterAbgesendet: mitarbeiterAbgesendet(onboarding),
    stepsConfig, // Feld-Konfiguration für den Fragebogen
    requiredDocuments, // Pflicht-Dokumente (pro Vorlage konfigurierbar)
    personalData: personalData
      ? {
          ...personalData,
          // Der Arbeitgeberteil bleibt drin: Das sind Feststellungen des
          // Arbeitgebers und die Kennung des Sachbearbeiters — sie gehen den
          // Beschaeftigten nichts an und haben in einem oeffentlichen,
          // nur token-geschuetzten Formular nichts zu suchen. `...personalData`
          // nimmt sonst jedes neue Feld des Modells stillschweigend mit.
          rvAntragEingangAm: undefined,
          rvWirkungAb: undefined,
          rvMeldungAm: undefined,
          rvBearbeitetVonId: undefined,
          rvBearbeitetAm: undefined,
          // Sensible Felder entschluesseln
          iban: personalData.iban ? decrypt(personalData.iban) : "",
          socialSecurityNumber: personalData.socialSecurityNumber ? decrypt(personalData.socialSecurityNumber) : "",
          taxId: personalData.taxId ? decrypt(personalData.taxId) : "",
          // Dates als ISO strings
          birthDate: personalData.birthDate?.toISOString().split("T")[0] ?? "",
          dienstzeitBeginn:
            personalData.dienstzeitBeginn?.toISOString().split("T")[0] ?? "",
          // Ohne diese Zeile kaeme das Datum als vollstaendiger Zeitstempel im
          // Formular an. `<input type="date">` zeigt den nicht an — das Feld
          // saehe beim Wiedereinstieg leer aus, und beim naechsten Speichern
          // ginge der Zeitstempel als Wert zurueck und scheiterte an der
          // Formatpruefung. Erst die Kuerzung auf den Tag macht das Feld
          // wieder befuellbar.
          aufenthaltstitelGueltigBis:
            personalData.aufenthaltstitelGueltigBis
              ?.toISOString()
              .split("T")[0] ?? "",
          children: personalData.children.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName ?? "",
            birthDate: c.birthDate.toISOString().split("T")[0],
            taxAllowance: c.taxAllowance,
          })),
        }
      : null,
  });
}

// =============================================
// PUT – Auto-Save (Step-Daten speichern)
// =============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate-Limiting
  const clientIp = getClientIp(request);
  const rlCheck = tokenRateLimiter.check(clientIp);
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  const { token } = await params;

  const result = await validateMagicToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;
  const body = await request.json();

  // Serverseitige Zod-Validierung
  const parsed = fragebogenFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    currentStep,
    children,
    beschaeftigungsAngaben,
    beschaeftigungsKategorien,
    ...data
  } = parsed.data;

  // Status auf IN_PROGRESS setzen falls noch INVITED.
  //
  // Bedingt statt `update` auf den vorher gelesenen Stand: Zwischen dem Lesen
  // in validateMagicToken und dieser Zeile kann die Person in einem zweiten
  // Tab abgesendet haben. Ein unbedingtes Update schriebe dann IN_PROGRESS
  // ueber SUBMITTED/SUPERVISOR_* — ein Lost Update. Das WHERE greift nur, wenn
  // der Vorgang in der Datenbank WIRKLICH noch INVITED und nicht abgesendet
  // ist. Das ist die eine erlaubte Ausnahme von „Status nur ueber
  // statusAbgleichen" (siehe src/lib/onboarding-status-abgleich.ts): Der
  // Wechsel ist genau das, was gesamtStatus fuer diesen Stand ergaebe.
  //
  // Die Vorpruefung auf den Lesestand bleibt: Sie spart bei jedem weiteren
  // Speichern den Datenbankaufruf.
  if (onboarding.status === "INVITED") {
    await prisma.onboardingProcess.updateMany({
      where: { id: onboarding.id, status: "INVITED", submittedAt: null },
      data: { status: "IN_PROGRESS" },
    });
  }

  // Freigabeliste und leerbare Felder stehen in src/lib/fragebogen-felder.ts —
  // dort halten Tests sie gegen die Schritt-Schemata.
  const ALLOWED_FIELDS = ERLAUBTE_FRAGEBOGEN_FELDER;
  const DARF_GELEERT_WERDEN = LEERBARE_FRAGEBOGEN_FELDER;

  // PersonalData upserten (erstellen oder aktualisieren)
  const updateData: Record<string, unknown> = {};

  // Nur gesetzte UND erlaubte Felder uebernehmen (kein Ueberschreiben mit null)
  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_FIELDS.has(key) || value === undefined) continue;
    if (value === null || value === "") {
      if (DARF_GELEERT_WERDEN.has(key)) updateData[key] = null;
      continue;
    }
    updateData[key] = value;
  }

  // Speziell: Booleans und 0 erlauben
  if (typeof data.severelyDisabled === "boolean")
    updateData.severelyDisabled = data.severelyDisabled;
  if (typeof data.parentStatus === "boolean")
    updateData.parentStatus = data.parentStatus;
  if (typeof data.hasOtherEmployment === "boolean")
    updateData.hasOtherEmployment = data.hasOtherEmployment;
  if (typeof data.isBeamter === "boolean")
    updateData.isBeamter = data.isBeamter;
  if (typeof data.bornAfter1971 === "boolean")
    updateData.bornAfter1971 = data.bornAfter1971;
  if (typeof data.masernschutzProvided === "boolean")
    updateData.masernschutzProvided = data.masernschutzProvided;
  if (typeof data.verfassungstreuePruefung === "boolean")
    updateData.verfassungstreuePruefung = data.verfassungstreuePruefung;
  if (typeof data.hasMinijob === "boolean")
    updateData.hasMinijob = data.hasMinijob;
  if (typeof data.minijobRvBefreiung === "boolean")
    updateData.minijobRvBefreiung = data.minijobRvBefreiung;
  if (typeof data.alsArbeitsuchendGemeldet === "boolean")
    updateData.alsArbeitsuchendGemeldet = data.alsArbeitsuchendGemeldet;
  if (typeof data.mitLeistungsbezug === "boolean")
    updateData.mitLeistungsbezug = data.mitLeistungsbezug;
  if (typeof data.vorbeschaeftigungenVorhanden === "boolean")
    updateData.vorbeschaeftigungenVorhanden = data.vorbeschaeftigungenVorhanden;
  if (typeof data.auslandsbeschaeftigungVorhanden === "boolean")
    updateData.auslandsbeschaeftigungVorhanden = data.auslandsbeschaeftigungVorhanden;
  if (typeof data.summeUeberGeringfuegigkeitsgrenze === "boolean")
    updateData.summeUeberGeringfuegigkeitsgrenze = data.summeUeberGeringfuegigkeitsgrenze;
  if (typeof data.rvMerkblattGelesen === "boolean")
    updateData.rvMerkblattGelesen = data.rvMerkblattGelesen;
  if (typeof data.rvBindungBestaetigt === "boolean")
    updateData.rvBindungBestaetigt = data.rvBindungBestaetigt;

  // Zeitpunkte gehoeren dem Server. Was der Browser behauptet, taugt als
  // Nachweis nichts — genauso wie bei der Wahrheitsversicherung.
  if (data.rvEntscheidung) {
    updateData.rvEntscheidungAm = new Date();
  }
  if (data.rvMerkblattGelesen === true) {
    updateData.rvMerkblattGelesenAm = new Date();
  }

  // Datumsfelder konvertieren
  if (data.birthDate) updateData.birthDate = new Date(data.birthDate);
  if (data.dienstzeitBeginn)
    updateData.dienstzeitBeginn = new Date(data.dienstzeitBeginn);
  // Das leere Datum steht hier bewusst NICHT: Die Schleife oben hat es bereits
  // auf `null` gesetzt (das Feld ist leerbar). Ein `new Date("")` waere
  // `Invalid Date` und ueberschriebe die Loeschung mit einem Fehler.
  if (data.aufenthaltstitelGueltigBis)
    updateData.aufenthaltstitelGueltigBis = new Date(
      data.aufenthaltstitelGueltigBis,
    );

  /**
   * `bornAfter1971` dem Geburtsdatum nachziehen.
   *
   * Die Spalte ist keine eigene Antwort, sondern eine Ableitung aus
   * `birthDate` — geschrieben beim Verlassen von Schritt 9 und danach nie
   * wieder. Wer sein Geburtsdatum spaeter in Schritt 1 korrigiert
   * (Zahlendreher 1990 statt 1965; die Schrittleiste macht den Sprung zurueck
   * zum bequemen Regelweg), liess bisher einen eingefrorenen Wert stehen.
   * Portal-Ansicht und Personalakte-PDF fangen das beim LESEN mit
   * `nach1970GeborenAnzeige` ab, der JSON-Export (`/api/onboarding/[id]/export`)
   * gibt `personalData` dagegen unveraendert aus — zwei Auskuenfte zu einer
   * Tatsache, und die falsche waere die maschinenlesbare gewesen. Deshalb steht
   * die Korrektur hier an der Quelle; die Anzeigefunktion bleibt das Netz fuer
   * Altbestand.
   *
   * NUR NACHZIEHEN, NIE NEU ERFINDEN: Ist die Spalte noch leer, wurde Schritt 9
   * nie durchlaufen — bei der Vorlage MINIJOB ist er abgeschaltet, die Frage
   * wird dort nie gestellt. Sie aus Schritt 1 heraus zu befuellen machte aus
   * einer nie gestellten Frage eine beantwortete, und genau daran haengt die
   * Zusammenfassung in Schritt 10, die den Masernschutz-Abschnitt nur bei
   * vorhandener Angabe zeigt.
   *
   * Keine Kollision mit Schritt 9: Der sendet `bornAfter1971` ohne `birthDate`
   * (und leitet es aus demselben Datum ab), Schritt 1 sendet `birthDate` ohne
   * `bornAfter1971`. Treffen doch beide zusammen, gilt das Geburtsdatum.
   */
  if (data.birthDate && (onboarding.personalData?.bornAfter1971 ?? null) !== null) {
    const abgeleitet = istNach1970Geboren(updateData.birthDate);
    // `null` heisst "unlesbares Datum". Dann bleibt der frueher gegebene Wert
    // stehen — er ist immer noch besser als ein stilles Ueberschreiben.
    if (abgeleitet !== null) updateData.bornAfter1971 = abgeleitet;
  }

  // currentStep aktualisieren
  if (typeof currentStep === "number") {
    updateData.currentStep = currentStep;
  }

  // Sensible Felder verschluesseln (DSGVO Art. 32)
  if (isEncryptionConfigured()) {
    const ENCRYPTED_FIELDS = ["iban", "socialSecurityNumber", "taxId"];
    for (const field of ENCRYPTED_FIELDS) {
      if (typeof updateData[field] === "string" && updateData[field]) {
        updateData[field] = encrypt(updateData[field] as string);
      }
    }
  }

  const personalData = await prisma.personalData.upsert({
    where: { onboardingId: onboarding.id },
    create: {
      onboardingId: onboarding.id,
      ...updateData,
    },
    update: updateData,
  });

  // =============================================
  // Wiederholbare Zeilen: ersetzen statt zusammenfuehren
  // =============================================
  // Loeschen und Neuanlegen laufen in **einer** Transaktion. Vorher waren es
  // zwei getrennte Aufrufe — schlug das Anlegen fehl, waren die alten Zeilen
  // schon weg und der Zwischenstand des Beschaeftigten verloren.
  const zeilenSchreiben: Prisma.PrismaPromise<unknown>[] = [];

  if (Array.isArray(children)) {
    zeilenSchreiben.push(
      prisma.child.deleteMany({ where: { personalDataId: personalData.id } }),
    );
    if (children.length > 0) {
      zeilenSchreiben.push(
        prisma.child.createMany({
          data: children.map((child, index) => ({
            personalDataId: personalData.id,
            firstName: child.firstName,
            lastName: child.lastName || null,
            birthDate: new Date(child.birthDate),
            taxAllowance: child.taxAllowance || false,
            orderIndex: index,
          })),
        }),
      );
    }
  }

  if (Array.isArray(beschaeftigungsAngaben)) {
    // Nur die Kategorien anfassen, die der sendende Schritt verantwortet.
    // Sonst loeschte ein Schritt, der nur 4a sendet, auch die Zeilen zu 4b
    // und 4c mit.
    //
    // Wer das ist, sagt der Schritt selbst (`beschaeftigungsKategorien`) — es
    // aus den Zeilen abzuleiten, ging genau so lange gut, wie es Zeilen gab.
    // Eine leere Liste nennt keine Kategorie, also wurde nichts geloescht: Ein
    // Widerruf („Nein, doch keine weitere Beschaeftigung") kam nie an, und die
    // Zeilen blieben in der Personalakte, im PDF und in der Pruefsumme der
    // Wahrheitsversicherung stehen — im Widerspruch zum „Nein" daneben.
    //
    // Die Vereinigung mit den Zeilen-Kategorien ist der Rueckfall fuer
    // Browser-Sitzungen mit der alten Formularfassung. Sie hat einen zweiten
    // Zweck: Zeilen einer NICHT genannten Kategorie wuerden sonst angelegt,
    // ohne dass die alten weichen — aus Ersetzen wuerde Verdoppeln.
    const gesendeteKategorien = new Set<string>([
      ...(beschaeftigungsKategorien ?? []),
      ...beschaeftigungsAngaben.map((a) => a.kategorie),
    ]);

    for (const kategorie of BESCHAEFTIGUNGS_KATEGORIEN) {
      if (!gesendeteKategorien.has(kategorie)) continue;
      zeilenSchreiben.push(
        prisma.beschaeftigungsAngabe.deleteMany({
          where: { personalDataId: personalData.id, kategorie },
        }),
      );
    }

    // orderIndex je Kategorie zaehlen, nicht ueber die gesamte Liste.
    const zaehler: Record<string, number> = {};
    for (const angabe of beschaeftigungsAngaben) {
      const index = zaehler[angabe.kategorie] ?? 0;
      zaehler[angabe.kategorie] = index + 1;
      zeilenSchreiben.push(
        prisma.beschaeftigungsAngabe.create({
          data: zuDatensatz(angabe, personalData.id, index),
        }),
      );
    }
  }

  if (zeilenSchreiben.length > 0) {
    await prisma.$transaction(zeilenSchreiben);
  }

  // Name im Onboarding-Prozess aktualisieren
  if (data.firstName || data.lastName) {
    await prisma.onboardingProcess.update({
      where: { id: onboarding.id },
      data: {
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
      },
    });
  }

  return NextResponse.json({ success: true, currentStep });
}

// =============================================
// POST – Fragebogen endgültig absenden
// =============================================
/**
 * Ein zweiter Absender war schneller.
 *
 * Eigene Klasse, weil das Beanspruchen des Vorgangs INNERHALB der Transaktion
 * passiert: Der einzige Weg, eine begonnene Transaktion zurueckzurollen, ist
 * eine Ausnahme. Sie traegt keine Nutzdaten — der Aufrufer antwortet 409.
 */
class BereitsEingereicht extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Rate-Limiting. Der Zaehlerschluessel muss ein String sein, deshalb hier
  // `getClientIp` mit seinem Ersatzwert "unknown" — ein gemeinsamer Topf fuer
  // alle Aufrufe ohne Proxy-Header, der zu viel bremst, aber nichts oeffnet.
  const rlCheck = tokenRateLimiter.check(getClientIp(request));
  if (!rlCheck.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie." },
      { status: 429 }
    );
  }

  // Fuer die PROTOKOLLE dagegen die null-Fassung. `erklaerungIp` und
  // `AuditLog.ipAddress` sind beide `String?` (prisma/schema.prisma), und
  // "nicht ermittelbar" gehoert dort als Luecke hinein, nicht als erfundene
  // Zeichenkette. Sonst fuehrte dieselbe Spalte zwei Schreibweisen fuer
  // denselben Sachverhalt — NULL von allen uebrigen Protokollschreibern (BEM,
  // Elternzeit, Mutterschutz, Dokumentenpaket) und "unknown" von hier. Wer
  // spaeter nach Vorgaengen ohne IP sucht, muesste beide kennen, und die
  // Wahrheitsversicherung ist der Unterschriftsersatz: Dort ist eine ehrliche
  // Luecke mehr wert als ein Wert, der wie eine Feststellung aussieht.
  //
  // Zweiter Leseaufruf statt `?? "unknown"` an der Bremse oben: So bleibt der
  // Ersatzwert an genau EINER Stelle (rate-limit.ts) und wird hier nicht
  // nachgebaut. Es kostet das Lesen eines Headers.
  const clientIp = getClientIpOrNull(request);

  const { token } = await params;

  const result = await validateMagicToken(token);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "Token nicht gefunden" ? 404 : 410 }
    );
  }

  const onboarding = result.onboarding!;

  // Schneller Weg fuer den Regelfall: Wer den Link nach dem Absenden erneut
  // oeffnet, bekommt sofort eine klare Antwort, ohne dass Dokumente und
  // Pruefsumme umsonst geladen werden.
  //
  // Verlassen darf man sich darauf NICHT — zwischen dieser Zeile und dem
  // Schreiben liegen mehrere Datenbankabfragen. Die verbindliche Sperre ist das
  // bedingte updateMany unten, das den eigenen Zeitstempel als Sperre benutzt.
  //
  // Geprueft wird die EIGENE Spur, nicht der Status: Frueher durfte nur aus
  // INVITED/IN_PROGRESS abgesendet werden. Hatte die Fuehrungskraft zuerst
  // abgesendet, stand der Status auf SUPERVISOR_SUBMITTED — und die Person
  // konnte ihren Fragebogen nie mehr abgeben, auch nicht ueber die API.
  if (mitarbeiterAbgesendet(onboarding)) {
    return NextResponse.json(
      { error: "Fragebogen wurde bereits eingereicht." },
      { status: 409 }
    );
  }
  if (istHrStatus(onboarding.status)) {
    return NextResponse.json(
      { error: "Der Vorgang wurde bereits geprüft oder abgeschlossen." },
      { status: 409 }
    );
  }

  const body = await request.json();

  const absendenSchema = z.object({
    dsgvoAccepted: z.literal(true),
    // Die Wahrheitsversicherung ersetzt die Unterschrift. Sie war bisher reiner
    // Browser-Zustand und ging beim Absenden verloren — der Server hat sie nie
    // gesehen und konnte sie folglich auch nicht erzwingen.
    erklaerungAccepted: z.literal(true),
    erklaerungOrt: z.string().trim().min(2).max(100),
    erklaerungVersion: z.string().min(1).max(40),
  });

  const absenden = absendenSchema.safeParse(body);
  if (!absenden.success) {
    const fehlend = absenden.error.issues.map((i) => i.path.join("."));
    if (fehlend.includes("dsgvoAccepted")) {
      return NextResponse.json(
        { error: "DSGVO-Einwilligung ist erforderlich." },
        { status: 400 }
      );
    }
    if (fehlend.includes("erklaerungAccepted")) {
      return NextResponse.json(
        { error: "Bitte bestätigen Sie die Erklärung des Arbeitnehmers." },
        { status: 400 }
      );
    }
    if (fehlend.includes("erklaerungOrt")) {
      return NextResponse.json(
        { error: "Bitte geben Sie den Ort an. Er gehört zur Unterschrift." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Die Angaben zur Erklärung sind unvollständig." },
      { status: 400 }
    );
  }

  // Eine Version, die wir nicht kennen, koennen wir spaeter nicht mehr
  // nachweisen — dann waere die Erklaerung wertlos.
  if (!istBekannteErklaerung(absenden.data.erklaerungVersion)) {
    return NextResponse.json(
      {
        error:
          "Der Erklärungstext ist nicht mehr aktuell. Bitte laden Sie die Seite neu.",
      },
      { status: 409 }
    );
  }

  // =============================================
  // Pflicht-Dokumente erzwingen (pro Vorlage konfigurierbar)
  // =============================================
  const template = await prisma.formTemplate.findUnique({
    where: { questionnaireType: onboarding.questionnaireType },
    select: { requiredDocuments: true },
  });
  // Fallback auf Geburtsurkunden, falls (noch) keine Vorlage existiert.
  const requiredDocs = template?.requiredDocuments ?? [
    "GEBURTSURKUNDE_EIGEN",
    "GEBURTSURKUNDE_KIND",
  ];

  const [uploaded, childCount] = await Promise.all([
    prisma.document.findMany({
      where: { onboardingId: onboarding.id },
      select: { type: true },
    }),
    prisma.child.count({
      where: { personalData: { onboardingId: onboarding.id } },
    }),
  ]);

  // Verbindlich ist der Datenbankstand, nicht etwas Mitgeschicktes: In einem
  // zweiten Tab kann ein Dokument geloescht worden sein, waehrend hier
  // abgesendet wird.
  const uploadedTypes = uploaded.map((d) => d.type);

  /**
   * Die Eingaben, aus denen sich die Pflichten dieses Vorgangs ergeben — EINMAL
   * gebildet und von beiden Auswertungen unten benutzt.
   *
   * Alles darin liegt bereits vor: `validateMagicToken` laedt `organization`
   * und `personalData` mit. Die vier bedingten Pflichten fehlten hier bisher
   * ganz; sperrend wirkte sich das nicht aus (alle vier stehen in
   * NACHREICHBARE_PFLICHTEN), aber damit erfuhr auch keine Stelle auf dem
   * Server, dass ueberhaupt etwas offen ist.
   *
   * Die Regeln werden NICHT nachgebaut, sondern mit denselben Funktionen
   * ausgewertet, die der Fragebogen aufruft (`masernschutzPflichtig`,
   * `effektivePflichtDokumente`). Zwei Nachbauten liefen frueher oder spaeter
   * auseinander — und dann sperrt der Server etwas, wovon das Formular nichts
   * weiss.
   */
  const pflichtEingaben = {
    required: requiredDocs,
    hasChildren: childCount > 0,
    rvEntscheidung: onboarding.personalData?.rvEntscheidung ?? null,
    masernschutzPflichtig: masernschutzPflichtig({
      geburtsdatum: onboarding.personalData?.birthDate,
      organisationstyp: onboarding.organization.type,
    }),
    aufenthaltstitelErforderlich:
      onboarding.personalData?.aufenthaltstitelErforderlich ?? null,
    healthInsuranceType: onboarding.personalData?.healthInsuranceType ?? null,
  };

  // Bewusst ohne `if (requiredDocs.length > 0)`: Die Pflicht zum
  // Befreiungsantrag entsteht aus der Entscheidung des Beschaeftigten, nicht aus
  // der Vorlage. Setzt HR die Pflichtdokumente einer Vorlage auf die leere
  // Liste, verschwaende der alte Guard diese Sperre lautlos mit.
  {
    const missing = computeMissingRequiredDocuments({
      ...pflichtEingaben,
      uploadedTypes,
    });

    if (missing.length > 0) {
      const labels = missing.map((t) => documentTypeLabel(t)).join(", ");
      const nurRv = missing.length === 1 && missing[0] === "RV_BEFREIUNG";
      return NextResponse.json(
        {
          error: nurRv
            ? RV_BEFREIUNG_HINWEIS
            : `Bitte laden Sie folgende Pflichtdokumente hoch, bevor Sie absenden: ${labels}.`,
          missingDocuments: missing,
        },
        { status: 400 }
      );
    }
  }

  /**
   * Die Pflichtunterlagen, die fehlen und trotzdem nicht sperren.
   *
   * Der Verzicht auf die Sperre ist ein Tausch (Entscheidung 07./08.09.2026):
   * Der Vorgang entsteht, DAFUER wird er sichtbar als offen gefuehrt und HR
   * erfaehrt davon. Ohne diese Zeile waere nur die erste Haelfte gebaut — und
   * gerade beim Masernschutz haengt die Begruendung daran, dass der Arbeitgeber
   * einen fehlenden Nachweis dem Gesundheitsamt melden KANN. Das setzt voraus,
   * dass irgendwo steht, dass er fehlt.
   */
  const offeneNachweise = fehlendeNachreichbareDokumente({
    ...pflichtEingaben,
    uploadedTypes,
  });

  // =============================================
  // Wahrheitsversicherung pruefungsfest festhalten
  // =============================================
  // Die Pruefsumme wird ueber den Stand gebildet, den der Beschaeftigte in
  // diesem Moment bestaetigt — im Klartext, damit sie sich spaeter nachrechnen
  // laesst (verschluesselte Felder haben bei jedem Speichern ein anderes
  // Chiffrat).
  const bestand = await prisma.personalData.findUnique({
    where: { onboardingId: onboarding.id },
    include: { children: true, beschaeftigungsAngaben: true },
  });

  if (!bestand) {
    return NextResponse.json(
      { error: "Es sind noch keine Angaben gespeichert." },
      { status: 400 }
    );
  }

  // =============================================
  // Rentenversicherung: Voraussetzungen fuer einen Antrag
  // =============================================
  // Beide Antragsanlagen tragen im Kopf Name, Vorname und
  // Rentenversicherungsnummer. Ohne sie erzeugte das Portal ein Dokument mit
  // leerer Pflichtangabe — deshalb blockiert es lieber und sagt, was fehlt.
  const brauchtRvNummer =
    bestand.rvEntscheidung === "BEFREIUNG_BEANTRAGT" ||
    bestand.rvEntscheidung === "AUFHEBUNG_BEANTRAGT";

  if (brauchtRvNummer && !bestand.socialSecurityNumber) {
    return NextResponse.json(
      {
        error:
          "Für Ihren Antrag zur Rentenversicherung brauchen wir Ihre " +
          "Rentenversicherungsnummer. Bitte ergänzen Sie sie im Schritt " +
          "„Sozialversicherung“.",
      },
      { status: 400 }
    );
  }

  const angabenKlartext: Record<string, unknown> = {
    ...bestand,
    iban: bestand.iban ? decrypt(bestand.iban) : bestand.iban,
    socialSecurityNumber: bestand.socialSecurityNumber
      ? decrypt(bestand.socialSecurityNumber)
      : bestand.socialSecurityNumber,
    taxId: bestand.taxId ? decrypt(bestand.taxId) : bestand.taxId,
  };

  const pruefsumme = berechnePruefsumme(
    angabenKlartext,
    bestand.children,
    bestand.beschaeftigungsAngaben,
  );
  const abgegebenAm = new Date();

  // =============================================
  // Der eigentliche Abschluss — atomar und in einem Rutsch
  // =============================================
  // Alle drei Saetze gehoeren zusammen: die abgegebene Erklaerung, der
  // Statuswechsel und der Protokolleintrag. Liefen sie einzeln, koennte ein
  // Abbruch dazwischen eine bestaetigte Erklaerung hinterlassen, waehrend der
  // Vorgang weiter IN_PROGRESS steht — HR saehe ihn als unerledigt, und der
  // Beschaeftigte koennte erneut absenden und Ort, Zeitpunkt und Pruefsumme
  // der ersten Erklaerung ueberschreiben.
  //
  // Das bedingte updateMany ist zugleich die Sperre gegen den Doppel-Submit:
  // Es ist EIN atomares UPDATE ... WHERE "submittedAt" IS NULL, also gewinnt
  // genau ein Aufrufer. Die vorgelagerte Pruefung allein genuegt nicht — der
  // Handler wartet danach auf mehrere Abfragen, und zwei offene Tabs oder ein
  // Retry nach Proxy-Timeout kommen beide durch. Zwei QUESTIONNAIRE_SUBMITTED
  // mit verschiedenen Pruefsummen zur selben Erklaerung machen den
  // Unterschriftsersatz in der Betriebspruefung mehrdeutig.
  //
  // Beansprucht wird die EIGENE Spur (`submittedAt`), nicht ein Status: Die
  // Fuehrungskraft darf vorher, gleichzeitig oder danach absenden. Den Status
  // setzt erst `statusAbgleichen`, NACH der Beanspruchung und aus dem frisch
  // gelesenen Stand — sendet die Fuehrungskraft in derselben Sekunde ab, sieht
  // die zweite Transaktion den Zeitstempel der ersten, und der Vorgang landet
  // korrekt auf „Bereit zur Prüfung" (siehe onboarding-status-abgleich.ts).
  // HR-Status (geprueft, abgeschlossen, abgelaufen) nimmt das WHERE aus: Ein
  // Link darf einen solchen Vorgang nie zurueckschreiben.
  //
  // submittedAt traegt bewusst `abgegebenAm` — denselben Zeitpunkt wie die
  // Erklaerung und das Protokoll. Ein eigenes `new Date()` ergaebe drei
  // minimal verschiedene Zeitstempel fuer einen Vorgang, und submittedAt ist
  // der Anker fuer das RV-Wirkungsdatum beim Aufhebungsantrag.
  try {
    await prisma.$transaction(async (tx) => {
      const beansprucht = await tx.onboardingProcess.updateMany({
        where: {
          id: onboarding.id,
          submittedAt: null,
          status: { notIn: [...HR_STATUS] },
        },
        data: { submittedAt: abgegebenAm },
      });
      if (beansprucht.count === 0) throw new BereitsEingereicht();

      await tx.personalData.update({
        where: { onboardingId: onboarding.id },
        data: {
          isComplete: true,
          dsgvoAccepted: true,
          dsgvoAcceptedAt: abgegebenAm,
          currentStep: SUMMARY_STEP_NUMBER,
          erklaerungAccepted: true,
          erklaerungAcceptedAt: abgegebenAm,
          erklaerungOrt: absenden.data.erklaerungOrt,
          erklaerungIp: clientIp,
          erklaerungUserAgent:
            request.headers.get("user-agent")?.slice(0, 500) ?? null,
          erklaerungVersion: absenden.data.erklaerungVersion,
          erklaerungPruefsumme: pruefsumme,
        },
      });

      // Erst jetzt den Status aus beiden Spuren ableiten: SUBMITTED (kein
      // Vorgesetzten-Link), SUPERVISOR_PENDING (Link offen) oder
      // SUPERVISOR_SUBMITTED (die Modalitaeten lagen schon vor).
      const abgleich = await statusAbgleichen(tx, onboarding.id);

      // Der Protokolleintrag gehoert in denselben Commit: Er ist der Nachweis
      // der Abgabe, nicht bloss ein Logeintrag daneben.
      await tx.auditLog.create({
        data: {
          onboardingId: onboarding.id,
          action: "QUESTIONNAIRE_SUBMITTED",
          details: {
            email: onboarding.email,
            submittedAt: abgegebenAm.toISOString(),
            // Welcher Status sich daraus ergab — bei zwei Spuren ist das nicht
            // mehr selbstverstaendlich SUBMITTED.
            status: { von: abgleich.von, nach: abgleich.nach },
            erklaerungOrt: absenden.data.erklaerungOrt,
            erklaerungVersion: absenden.data.erklaerungVersion,
            erklaerungPruefsumme: pruefsumme,
            // Immer mitgeschrieben, auch als leere Liste: Der Abgabesatz soll
            // fuer sich sagen koennen, dass NICHTS offen war. Sonst ist die
            // Abwesenheit des Vermerks unten zweideutig — nichts offen oder
            // Vermerk vergessen.
            offeneNachweise,
          },
          ipAddress: clientIp,
        },
      });

      /**
       * Der Vermerk „Nachweis offen" — ein eigener Satz, nicht bloss ein Feld
       * im Abgabesatz.
       *
       * Er ist die abfragbare Haelfte des Tauschs. `action` ist eine
       * gewoehnliche Spalte, der Zustand also mit einem gewoehnlichen
       * `where: { action: "DOKUMENTE_NACHZUREICHEN" }` zu finden — im
       * Abgabesatz braeuchte es dafuer eine Suche IM JSON. Fuer einen einzelnen
       * Vorgang laeuft die Abfrage ueber `onboardingId`, und der ist indiziert;
       * eine Auswertung ueber ALLE Vorgaenge liest die Tabelle voll (auf
       * `action` liegt kein Index, siehe AuditLog in prisma/schema.prisma).
       * Bei der heutigen Groessenordnung ist das unerheblich — wer daraus
       * einmal eine Dauerabfrage macht, ergaenzt ihn.
       *
       * Genau hier kann ein Benachrichtigungsweg andocken: Der Vermerk steht
       * fest, bevor irgendeine Mail verschickt wird.
       *
       * In DERSELBEN Transaktion wie die Abgabe: Ein Vermerk, der danach
       * einzeln geschrieben wird, fehlt genau dann, wenn die Verbindung
       * abreisst — und der Vorgang stuende als vollstaendig da, obwohl er es
       * nicht ist. Lieber gar keine Abgabe als eine Abgabe ohne den Vermerk.
       */
      if (offeneNachweise.length > 0) {
        await tx.auditLog.create({
          data: {
            onboardingId: onboarding.id,
            processType: "ONBOARDING",
            action: "DOKUMENTE_NACHZUREICHEN",
            details: {
              typen: offeneNachweise,
              // Die deutschen Bezeichnungen mitschreiben: Das Protokoll wird
              // von Menschen gelesen, und "PKV_NACHWEIS" steht dort sonst ohne
              // Uebersetzung.
              bezeichnungen: offeneNachweise.map((t) => documentTypeLabel(t)),
              submittedAt: abgegebenAm.toISOString(),
            },
            ipAddress: clientIp,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof BereitsEingereicht) {
      return NextResponse.json(
        { error: "Fragebogen wurde bereits eingereicht." },
        { status: 409 }
      );
    }
    console.error("[Fragebogen] Absenden fehlgeschlagen:", error);
    return NextResponse.json(
      {
        error:
          "Der Fragebogen konnte nicht abgesendet werden. " +
          "Bitte versuchen Sie es erneut.",
      },
      { status: 500 }
    );
  }

  // n8n Webhook aufrufen (falls konfiguriert) – HR-Benachrichtigung
  await triggerN8nWebhook("questionnaire-completed", {
    onboardingId: onboarding.id,
    email: onboarding.email,
    organization: onboarding.organization.name,
  });

  // Bestaetigungs-E-Mail direkt an den Mitarbeiter senden
  try {
    // Personaldata für Vorname laden
    const personalData = await prisma.personalData.findUnique({
      where: { onboardingId: onboarding.id },
      select: { firstName: true, lastName: true },
    });

    const vorname = personalData?.firstName || onboarding.firstName || "";
    const nachname = personalData?.lastName || onboarding.lastName || "";
    const displayId = onboarding.displayId || onboarding.id.substring(0, 8).toUpperCase();

    // Template aus DB laden oder Default verwenden
    const dbTemplate = await prisma.emailTemplate.findUnique({
      where: { event: "questionnaire-confirmation-employee" },
    });

    const defaultTpl = DEFAULT_EMAIL_TEMPLATES.find(
      (t) => t.event === "questionnaire-confirmation-employee"
    );

    const template = dbTemplate || defaultTpl;

    if (template) {
      const vars: Record<string, string> = {
        "{{vorname}}": vorname,
        "{{nachname}}": nachname,
        "{{email}}": onboarding.email,
        "{{einrichtung}}": onboarding.organization.name,
        "{{vorgangsnummer}}": displayId,
      };

      let subject = dbTemplate ? dbTemplate.subject : defaultTpl!.subject;
      let html = dbTemplate ? dbTemplate.bodyHtml : defaultTpl!.bodyHtml;
      let text = dbTemplate ? (dbTemplate.bodyText || undefined) : defaultTpl!.bodyText;

      for (const [key, value] of Object.entries(vars)) {
        subject = subject.replaceAll(key, value);
        html = html.replaceAll(key, value);
        if (text) text = text.replaceAll(key, value);
      }

      await sendEmail({
        to: onboarding.email,
        subject,
        html,
        text,
      });
    }
  } catch (emailError) {
    // Bestaetigungs-E-Mail ist nicht kritisch – Fehler loggen, aber nicht abbrechen
    console.error("[Fragebogen] Bestaetigungs-E-Mail an Mitarbeiter fehlgeschlagen:", emailError);
  }

  return NextResponse.json({
    success: true,
    message: "Personalfragebogen wurde erfolgreich eingereicht.",
  });
}
