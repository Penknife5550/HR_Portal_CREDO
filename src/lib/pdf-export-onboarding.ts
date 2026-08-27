/**
 * CREDO HR-Portal – PDF-Export für Onboarding-Vorgaenge
 *
 * Erzeugt PDF-Dokumente mit Swiss QR Code auf jeder Deckblatt-Seite.
 * Exporttypen: Fragebogen (PersonalData), Dokumente-Liste, Checkliste, Gesamtakte
 */

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getBefristungSachgrundLabel, getBefristungsartLabel } from "@/lib/constants";
import { getErklaerung } from "@/lib/erklaerung-arbeitnehmer";
import { statusLabel } from "@/lib/minijob-status";
import { rvEntscheidungLabel } from "@/lib/minijob-rentenversicherung";
import { ART_LABELS, KATEGORIE_LABELS } from "@/lib/validations/beschaeftigungs-angaben";

// =============================================
// Typen
// =============================================

export interface OnboardingExportContext {
  firstName: string | null;
  lastName: string | null;
  email: string;
  displayId: string | null;
  status: string;
  organizationName: string;
  mandantNumber: string;
  questionnaireType: string;
  invitedAt: string;
  submittedAt: string | null;
  personalData: PersonalDataExport | null;
  supervisorData: SupervisorDataExport | null;
  documents: DocExport[];
  checklistItems: ChecklistExport[];
}

interface PersonalDataExport {
  salutation: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  birthName: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthCountry: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  severelyDisabled: boolean | null;
  disabilityDegree: number | null;
  street: string | null;
  houseNumber: string | null;
  zipCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  mobile: string | null;
  emailPrivate: string | null;
  iban: string | null;
  bic: string | null;
  bankName: string | null;
  accountHolder: string | null;
  socialSecurityNumber: string | null;
  healthInsuranceName: string | null;
  healthInsuranceType: string | null;
  parentStatus: boolean | null;
  taxId: string | null;
  taxClass: string | null;
  taxAllowance: number | null;
  childAllowance: number | null;
  religion: string | null;
  highestSchoolDegree: string | null;
  highestProfessionalDegree: string | null;
  hasOtherEmployment: boolean | null;
  beschaeftigungsStatus?: string | null;
  beschaeftigungsStatusSonstige?: string | null;
  alsArbeitsuchendGemeldet?: boolean | null;
  agenturFuerArbeit?: string | null;
  mitLeistungsbezug?: boolean | null;
  vorbeschaeftigungenVorhanden?: boolean | null;
  auslandsbeschaeftigungVorhanden?: boolean | null;
  summeUeberGeringfuegigkeitsgrenze?: boolean | null;
  beschaeftigungsAngaben?: {
    kategorie: string;
    beginn: string | null;
    ende: string | null;
    arbeitgeberName: string | null;
    arbeitgeberAdresse: string | null;
    art: string | null;
    entgeltUeberGrenze: boolean | null;
    arbeitstage: number | null;
    beiArbeitsagentur: boolean | null;
  }[];
  otherEmployerName: string | null;
  otherWeeklyHours: number | null;
  hasMinijob: boolean | null;
  minijobRvBefreiung: boolean | null;
  rvEntscheidung?: string | null;
  rvEntscheidungAm?: string | null;
  rvMerkblattGelesen?: boolean | null;
  rvMerkblattGelesenAm?: string | null;
  rvBindungBestaetigt?: boolean | null;
  bornAfter1971: boolean | null;
  masernschutzProvided: boolean | null;
  dsgvoAccepted: boolean | null;
  dsgvoAcceptedAt: string | null;
  erklaerungAccepted?: boolean | null;
  erklaerungAcceptedAt?: string | null;
  erklaerungOrt?: string | null;
  erklaerungIp?: string | null;
  erklaerungUserAgent?: string | null;
  erklaerungVersion?: string | null;
  erklaerungPruefsumme?: string | null;
  children: { firstName: string; lastName: string | null; birthDate: string; taxAllowance: boolean }[];
}

interface SupervisorDataExport {
  betriebsstaette: string | null;
  stellenbeschreibung: string | null;
  vertragsbeginn: string | null;
  befristet: boolean | null;
  befristungsart: string | null;
  vertragsende: string | null;
  befristungZweck: string | null;
  vertragsendeVoraussichtlich: string | null;
  befristungSachgrund: string | null;
  vollzeit: boolean | null;
  wochenstunden: number | null;
  tageProWoche: number | null;
  svPflichtig: boolean | null;
  minijob: boolean | null;
  ehrenamt: boolean | null;
  verguetungsmodell: string | null;
  entgeltgruppe: string | null;
  stufe: string | null;
  festgehalt: number | null;
  stundenlohn: number | null;
  jahressonderzahlung: boolean | null;
  sonderzahlungProzent: number | null;
  urlaubstageProJahr: number | null;
  probezeit: boolean | null;
  probezeitMonate: number | null;
  zusatzvereinbarungen: string | null;
}

interface DocExport {
  type: string;
  fileName: string;
  fileSize: number;
  status: string;
  uploadedAt: string;
}

interface ChecklistExport {
  title: string;
  category: string;
  isCompleted: boolean;
  completedAt: string | null;
  assignee: string | null;
  notes: string | null;
  dueDate: string | null;
}

// =============================================
// Farben + Helpers
// =============================================

const C = {
  primary: "#575756", gruen: "#6BAA24", gelb: "#FBC900",
  rot: "#E2001A", blau: "#009AC6", gray: "#999999",
  lightGray: "#E5E5E5", white: "#FFFFFF", black: "#000000",
};

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Datum **mit Uhrzeit**. Fuer die Erklaerung reicht das blosse Datum nicht: Der
 * Zeitpunkt ist Teil des Unterschriftsersatzes.
 */
function fmtZeit(d: string | null | undefined): string {
  if (!d) return "—";
  const datum = new Date(d);
  if (Number.isNaN(datum.getTime())) return "—";
  return `${datum.toLocaleDateString("de-DE")}, ${datum.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })} Uhr`;
}

function yn(v: boolean | null): string {
  if (v === true) return "Ja";
  if (v === false) return "Nein";
  return "—";
}

function str(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

// =============================================
// QR Code
// =============================================

async function generateQR(content: string): Promise<Buffer> {
  const dataUri = await QRCode.toDataURL(content, {
    errorCorrectionLevel: "M", type: "image/png", width: 200, margin: 1,
    color: { dark: C.primary, light: C.white },
  });
  return Buffer.from(dataUri.split(",")[1], "base64");
}

function qrContent(ctx: OnboardingExportContext, docType: string): string {
  return [
    "SPC", "0200", "1",
    ctx.mandantNumber,
    `${ctx.lastName || ""}, ${ctx.firstName || ""}`,
    ctx.displayId || "OHNE-ID",
    docType,
    fmt(new Date().toISOString()),
  ].join("\n");
}

// =============================================
// Deckblatt
// =============================================

async function coverPage(doc: PDFKit.PDFDocument, ctx: OnboardingExportContext, docType: string, title: string): Promise<void> {
  const qrBuf = await generateQR(qrContent(ctx, docType));

  doc.rect(50, 40, 515, 3).fill(C.primary);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(C.primary).text("CREDO HR-Portal", 50, 60);
  doc.font("Helvetica").fontSize(14).fillColor(C.gray).text("Onboarding / Personalakte", 50, 88);

  const ly = 115;
  const lw = 515 / 4;
  doc.rect(50, ly, lw, 2).fill(C.gelb);
  doc.rect(50 + lw, ly, lw, 2).fill(C.gruen);
  doc.rect(50 + lw * 2, ly, lw, 2).fill(C.rot);
  doc.rect(50 + lw * 3, ly, lw, 2).fill(C.blau);

  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.black).text(title, 50, 140);
  doc.image(qrBuf, 390, 170, { width: 160, height: 160 });
  doc.font("Helvetica").fontSize(8).fillColor(C.gray).text("DMS-Zuordnung (QR-Code)", 390, 335, { width: 160, align: "center" });

  let y = 180;
  const rows = [
    ["Vorgangs-ID", ctx.displayId || "—"],
    ["Mandant", `${ctx.mandantNumber} — ${ctx.organizationName}`],
    ["Name", `${ctx.firstName || ""} ${ctx.lastName || ""}`],
    ["E-Mail", ctx.email],
    ["Typ", ctx.questionnaireType],
    ["Eingeladen", fmt(ctx.invitedAt)],
    ["Eingereicht", fmt(ctx.submittedAt)],
    ["Exportiert", fmt(new Date().toISOString())],
  ];
  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(C.gray).text(label, 50, y);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.black).text(value, 140, y);
    y += 22;
  }

  doc.rect(50, 750, 515, 1).fill(C.lightGray);
  doc.font("Helvetica").fontSize(7).fillColor(C.gray)
    .text(`CREDO HR-Portal | ${ctx.displayId || "—"} | ${title} | Seite 1`, 50, 758, { width: 515, align: "center" });
}

function pageHeader(doc: PDFKit.PDFDocument, ctx: OnboardingExportContext, title: string): void {
  doc.font("Helvetica").fontSize(8).fillColor(C.gray)
    .text(`${ctx.displayId || "—"} — ${ctx.firstName || ""} ${ctx.lastName || ""} — ${title}`, 50, 30, { width: 515, align: "right" });
  doc.rect(50, 45, 515, 0.5).fill(C.lightGray);
}

function section(doc: PDFKit.PDFDocument, title: string, y?: number): number {
  const py = y || doc.y + 15;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(C.primary).text(title, 50, py);
  doc.rect(50, py + 18, 515, 1).fill(C.blau);
  return py + 28;
}

function checkBreak(doc: PDFKit.PDFDocument, needed: number, ctx: OnboardingExportContext, title: string): void {
  if (doc.y + needed > 720) {
    doc.addPage();
    pageHeader(doc, ctx, title);
    doc.y = 55;
  }
}

function dataRow(doc: PDFKit.PDFDocument, label: string, value: string, y: number): number {
  doc.font("Helvetica").fontSize(9).fillColor(C.gray).text(label, 50, y, { width: 170 });
  // Ende der Beschriftung merken, bevor der Wert gezeichnet wird: `doc.y` zeigt
  // danach ans Ende des *Werts*. Bei einer Beschriftung, die auf zwei Zeilen
  // umbricht, waere die naechste Zeile sonst in die zweite Zeile hineingerutscht.
  const labelEnde = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(C.black).text(value, 225, y, { width: 340 });
  return Math.max(labelEnde, doc.y, y + 14) + 4;
}

// =============================================
// Fragebogen-Seiten (PersonalData)
// =============================================

async function addFragebogenPages(doc: PDFKit.PDFDocument, ctx: OnboardingExportContext, first = false): Promise<void> {
  if (!first) doc.addPage();
  await coverPage(doc, ctx, "FRAGEBOGEN", "Personalfragebogen");

  const pd = ctx.personalData;
  if (!pd) {
    doc.addPage();
    pageHeader(doc, ctx, "Fragebogen");
    doc.font("Helvetica").fontSize(11).fillColor(C.gray).text("Fragebogen wurde noch nicht ausgefuellt.", 50, 70);
    return;
  }

  // Persönliche Daten
  doc.addPage();
  pageHeader(doc, ctx, "Fragebogen");
  let y = section(doc, "Persönliche Angaben", 55);
  y = dataRow(doc, "Anrede", str(pd.salutation), y);
  y = dataRow(doc, "Titel", str(pd.title), y);
  y = dataRow(doc, "Vorname", str(pd.firstName), y);
  y = dataRow(doc, "Nachname", str(pd.lastName), y);
  y = dataRow(doc, "Geburtsname", str(pd.birthName), y);
  y = dataRow(doc, "Geburtsdatum", fmt(pd.birthDate), y);
  y = dataRow(doc, "Geburtsort", str(pd.birthPlace), y);
  y = dataRow(doc, "Geburtsland", str(pd.birthCountry), y);
  y = dataRow(doc, "Staatsangehörigkeit", str(pd.nationality), y);
  y = dataRow(doc, "Familienstand", str(pd.maritalStatus), y);
  y = dataRow(doc, "Schwerbehindert", yn(pd.severelyDisabled), y);
  if (pd.severelyDisabled) y = dataRow(doc, "Grad der Behinderung", str(pd.disabilityDegree), y);

  // Adresse
  checkBreak(doc, 120, ctx, "Fragebogen");
  y = section(doc, "Adresse");
  y = dataRow(doc, "Strasse / Nr.", `${str(pd.street)} ${str(pd.houseNumber)}`, y);
  y = dataRow(doc, "PLZ / Ort", `${str(pd.zipCode)} ${str(pd.city)}`, y);
  y = dataRow(doc, "Land", str(pd.country), y);
  y = dataRow(doc, "Telefon", str(pd.phone), y);
  y = dataRow(doc, "Mobil", str(pd.mobile), y);
  y = dataRow(doc, "Private E-Mail", str(pd.emailPrivate), y);

  // Bankverbindung
  checkBreak(doc, 80, ctx, "Fragebogen");
  y = section(doc, "Bankverbindung");
  y = dataRow(doc, "IBAN", str(pd.iban), y);
  y = dataRow(doc, "BIC", str(pd.bic), y);
  y = dataRow(doc, "Bank", str(pd.bankName), y);
  y = dataRow(doc, "Kontoinhaber", str(pd.accountHolder), y);

  // Sozialversicherung
  checkBreak(doc, 80, ctx, "Fragebogen");
  y = section(doc, "Sozialversicherung");
  y = dataRow(doc, "SV-Nummer", str(pd.socialSecurityNumber), y);
  y = dataRow(doc, "Krankenkasse", str(pd.healthInsuranceName), y);
  y = dataRow(doc, "KK-Typ", str(pd.healthInsuranceType), y);
  y = dataRow(doc, "Elterneigenschaft", yn(pd.parentStatus), y);

  // Steuer
  checkBreak(doc, 80, ctx, "Fragebogen");
  y = section(doc, "Steuer");
  y = dataRow(doc, "Steuer-ID", str(pd.taxId), y);
  y = dataRow(doc, "Steuerklasse", str(pd.taxClass), y);
  y = dataRow(doc, "Freibetrag", str(pd.taxAllowance), y);
  y = dataRow(doc, "Kinderfreibetrag", str(pd.childAllowance), y);
  y = dataRow(doc, "Konfession", str(pd.religion), y);

  // Bildung
  checkBreak(doc, 50, ctx, "Fragebogen");
  y = section(doc, "Bildung");
  y = dataRow(doc, "Schulabschluss", str(pd.highestSchoolDegree), y);
  y = dataRow(doc, "Berufsabschluss", str(pd.highestProfessionalDegree), y);

  // =============================================
  // Status bei Beginn der Beschaeftigung (Checkliste, Abschnitt 2)
  // =============================================
  if (pd.beschaeftigungsStatus) {
    checkBreak(doc, 60, ctx, "Fragebogen");
    y = section(doc, "Status bei Beginn der Beschäftigung");
    y = dataRow(doc, "Status", statusLabel(pd.beschaeftigungsStatus), y);
    if (pd.beschaeftigungsStatusSonstige) {
      y = dataRow(doc, "Erläuterung", str(pd.beschaeftigungsStatusSonstige), y);
    }
    y = dataRow(doc, "Bei der Agentur gemeldet", yn(pd.alsArbeitsuchendGemeldet ?? null), y);
    if (pd.alsArbeitsuchendGemeldet) {
      y = dataRow(doc, "Zuständige Agentur", str(pd.agenturFuerArbeit), y);
      y = dataRow(doc, "Leistungsbezug", yn(pd.mitLeistungsbezug ?? null), y);
    }
  }

  // =============================================
  // Weitere Beschaeftigungen (Checkliste, Abschnitt 4)
  // =============================================
  checkBreak(doc, 60, ctx, "Fragebogen");
  y = section(doc, "Weitere Beschäftigungen");
  y = dataRow(doc, "Weitere Beschäftigungen", yn(pd.hasOtherEmployment), y);
  if (pd.summeUeberGeringfuegigkeitsgrenze !== null && pd.summeUeberGeringfuegigkeitsgrenze !== undefined) {
    y = dataRow(doc, "Summe über der Grenze", yn(pd.summeUeberGeringfuegigkeitsgrenze), y);
  }
  if (pd.vorbeschaeftigungenVorhanden !== null && pd.vorbeschaeftigungenVorhanden !== undefined) {
    y = dataRow(doc, "Vorbeschäftigungen dieses Jahr", yn(pd.vorbeschaeftigungenVorhanden), y);
  }
  if (pd.auslandsbeschaeftigungVorhanden !== null && pd.auslandsbeschaeftigungVorhanden !== undefined) {
    y = dataRow(doc, "Tätigkeit im Ausland", yn(pd.auslandsbeschaeftigungVorhanden), y);
  }

  // Die Zeilen der drei Tabellen, nach Kategorie gruppiert. Jede Zeile prueft
  // vorher, ob sie noch auf die Seite passt — sonst reisst der Block mitten
  // durch.
  const angaben = pd.beschaeftigungsAngaben ?? [];
  for (const kategorie of ["WEITERE", "VORBESCHAEFTIGUNG", "AUSLAND"] as const) {
    const zeilen = angaben.filter((a) => a.kategorie === kategorie);
    if (zeilen.length === 0) continue;

    checkBreak(doc, 50, ctx, "Fragebogen");
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.primary)
      .text(KATEGORIE_LABELS[kategorie], 50, y);
    y = doc.y + 6;

    zeilen.forEach((zeile, i) => {
      checkBreak(doc, 55, ctx, "Fragebogen");
      const zeitraum = zeile.ende
        ? `${fmt(zeile.beginn)} – ${fmt(zeile.ende)}`
        : `ab ${fmt(zeile.beginn)}`;
      y = dataRow(doc, `${i + 1}. Zeitraum`, zeitraum, y);

      if (zeile.art) {
        y = dataRow(doc, "   Art", ART_LABELS[zeile.art] ?? zeile.art, y);
      }
      if (zeile.entgeltUeberGrenze !== null) {
        y = dataRow(doc, "   Entgelt über Grenze", yn(zeile.entgeltUeberGrenze), y);
      }
      if (zeile.arbeitstage !== null) {
        y = dataRow(doc, "   Arbeitstage", String(zeile.arbeitstage), y);
      }
      if (zeile.beiArbeitsagentur) {
        y = dataRow(doc, "   Art", "Meldung bei der Agentur für Arbeit", y);
      }
      if (zeile.arbeitgeberName) {
        y = dataRow(doc, "   Arbeitgeber", str(zeile.arbeitgeberName), y);
      }
      if (zeile.arbeitgeberAdresse) {
        y = dataRow(doc, "   Adresse", str(zeile.arbeitgeberAdresse), y);
      }
    });
  }

  // Altfelder — nur noch, wenn ein Vorgang sie traegt.
  if (pd.otherEmployerName || pd.otherWeeklyHours) {
    y = dataRow(doc, "Arbeitgeber (Altangabe)", str(pd.otherEmployerName), y);
    y = dataRow(doc, "Wochenstunden (Altangabe)", str(pd.otherWeeklyHours), y);
  }
  y = dataRow(doc, "Minijob", yn(pd.hasMinijob), y);
  if (pd.hasMinijob) y = dataRow(doc, "RV-Befreiung Minijob", yn(pd.minijobRvBefreiung), y);

  // =============================================
  // Rentenversicherung (Checkliste, Abschnitt 5)
  // =============================================
  if (pd.rvEntscheidung) {
    checkBreak(doc, 70, ctx, "Fragebogen");
    y = section(doc, "Rentenversicherung");
    y = dataRow(doc, "Entscheidung", rvEntscheidungLabel(pd.rvEntscheidung), y);
    y = dataRow(doc, "Abgegeben am", fmtZeit(pd.rvEntscheidungAm), y);
    if (pd.rvMerkblattGelesen) {
      y = dataRow(doc, "Merkblatt gelesen", fmtZeit(pd.rvMerkblattGelesenAm), y);
    }
    if (pd.rvBindungBestaetigt) {
      y = dataRow(doc, "Bindungswirkung bestätigt", "Ja", y);
    }
  }

  // Masernschutz
  checkBreak(doc, 40, ctx, "Fragebogen");
  y = section(doc, "Masernschutz");
  y = dataRow(doc, "Geboren nach 1971", yn(pd.bornAfter1971), y);
  y = dataRow(doc, "Masernschutz nachgewiesen", yn(pd.masernschutzProvided), y);

  // Kinder
  if (pd.children && pd.children.length > 0) {
    checkBreak(doc, 40 + pd.children.length * 18, ctx, "Fragebogen");
    y = section(doc, `Kinder (${pd.children.length})`);
    for (const child of pd.children) {
      y = dataRow(doc, `${child.firstName} ${child.lastName || ""}`, `geb. ${fmt(child.birthDate)}, Kinderfreibetrag: ${yn(child.taxAllowance)}`, y);
    }
  }

  // =============================================
  // Erklaerung des Arbeitnehmers (Unterschriftsersatz)
  // =============================================
  // Eigener Abschnitt, weil genau er in der Betriebspruefung die Unterschrift
  // ersetzt: Wortlaut in der Fassung, die galt, plus Zeitpunkt, Ort, Herkunft
  // und Pruefsumme.
  checkBreak(doc, 200, ctx, "Fragebogen");
  y = section(doc, "Erklärung des Arbeitnehmers");

  if (!pd.erklaerungAccepted) {
    // Altvorgaenge: Der Haken war frueher reiner Browser-Zustand und wurde nie
    // uebertragen. Ein Nachweis wird nicht rueckwirkend konstruiert.
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.gray).text(
      "Für diesen Vorgang liegt keine gespeicherte Erklärung vor. Der Fragebogen " +
        "wurde eingereicht, bevor das Portal Zeitpunkt, Ort und Prüfsumme " +
        "festgehalten hat.",
      50,
      y,
      { width: 515 },
    );
    y = doc.y + 10;
  } else {
    const fassung = getErklaerung(pd.erklaerungVersion);

    if (fassung) {
      doc.font("Helvetica").fontSize(8.5).fillColor(C.black);
      for (const abschnitt of fassung.abschnitte) {
        checkBreak(doc, 40, ctx, "Fragebogen");
        doc.font("Helvetica").fontSize(8.5).fillColor(C.black)
          .text(abschnitt.text, 50, doc.y, { width: 515, align: "justify" });
        if (abschnitt.punkte) {
          for (const punkt of abschnitt.punkte) {
            doc.font("Helvetica").fontSize(8.5).fillColor(C.gray)
              .text(`•  ${punkt}`, 62, doc.y + 2, { width: 503 });
          }
        }
        doc.moveDown(0.4);
      }
      checkBreak(doc, 30, ctx, "Fragebogen");
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.black)
        .text(fassung.bestaetigung, 50, doc.y + 4, { width: 515 });
      y = doc.y + 12;
    } else {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.gray).text(
        `Der Wortlaut der bestätigten Fassung (${str(pd.erklaerungVersion)}) liegt ` +
          "im System nicht mehr vor.",
        50,
        y,
        { width: 515 },
      );
      y = doc.y + 10;
    }

    checkBreak(doc, 90, ctx, "Fragebogen");
    y = dataRow(doc, "Bestätigt", yn(pd.erklaerungAccepted), y);
    y = dataRow(doc, "Ort", str(pd.erklaerungOrt), y);
    y = dataRow(doc, "Zeitpunkt", fmtZeit(pd.erklaerungAcceptedAt), y);
    y = dataRow(doc, "Fassung des Wortlauts", str(pd.erklaerungVersion), y);
    y = dataRow(doc, "IP-Adresse", str(pd.erklaerungIp), y);
    y = dataRow(doc, "Browserkennung", str(pd.erklaerungUserAgent), y);
    y = dataRow(doc, "Prüfsumme (SHA-256)", str(pd.erklaerungPruefsumme), y);
  }

  // DSGVO
  checkBreak(doc, 30, ctx, "Fragebogen");
  y = section(doc, "Datenschutz");
  y = dataRow(doc, "DSGVO akzeptiert", yn(pd.dsgvoAccepted), y);
  if (pd.dsgvoAcceptedAt) y = dataRow(doc, "Akzeptiert am", fmt(pd.dsgvoAcceptedAt), y);
}

// =============================================
// Vorgesetzten-Daten (SupervisorData)
// =============================================

async function addModalitaetenPages(doc: PDFKit.PDFDocument, ctx: OnboardingExportContext, first = false): Promise<void> {
  if (!first) doc.addPage();
  await coverPage(doc, ctx, "MODALITAETEN", "Einstellungsmodalitaeten");

  const sd = ctx.supervisorData;
  if (!sd) {
    doc.addPage();
    pageHeader(doc, ctx, "Modalitaeten");
    doc.font("Helvetica").fontSize(11).fillColor(C.gray).text("Modalitaeten wurden noch nicht ausgefuellt.", 50, 70);
    return;
  }

  doc.addPage();
  pageHeader(doc, ctx, "Modalitaeten");
  let y = section(doc, "Einsatzort & Vertrag", 55);
  y = dataRow(doc, "Betriebsstaette", str(sd.betriebsstaette), y);
  y = dataRow(doc, "Stellenbeschreibung", str(sd.stellenbeschreibung), y);
  y = dataRow(doc, "Vertragsbeginn", fmt(sd.vertragsbeginn), y);
  y = dataRow(doc, "Befristet", yn(sd.befristet), y);
  if (sd.befristet) {
    y = dataRow(doc, "Art der Befristung", str(getBefristungsartLabel(sd.befristungsart)), y);
    if (sd.befristungsart === "ZWECK") {
      y = dataRow(doc, "Vertragsende", "Zweckbefristung - kein festes Datum", y);
      y = dataRow(doc, "Ende bei", str(sd.befristungZweck), y);
      if (sd.vertragsendeVoraussichtlich) {
        y = dataRow(doc, "Vorauss. Ende", `${fmt(sd.vertragsendeVoraussichtlich)} (unverbindlich)`, y);
      }
    } else {
      y = dataRow(doc, "Vertragsende", fmt(sd.vertragsende), y);
    }
    y = dataRow(doc, "Sachgrund", str(getBefristungSachgrundLabel(sd.befristungSachgrund)), y);
  }

  checkBreak(doc, 80, ctx, "Modalitaeten");
  y = section(doc, "Arbeitszeit");
  y = dataRow(doc, "Vollzeit", yn(sd.vollzeit), y);
  y = dataRow(doc, "Wochenstunden", str(sd.wochenstunden), y);
  y = dataRow(doc, "Tage pro Woche", str(sd.tageProWoche), y);

  checkBreak(doc, 80, ctx, "Modalitaeten");
  y = section(doc, "Beschaeftigungsart");
  y = dataRow(doc, "SV-pflichtig", yn(sd.svPflichtig), y);
  y = dataRow(doc, "Minijob", yn(sd.minijob), y);
  y = dataRow(doc, "Ehrenamt", yn(sd.ehrenamt), y);

  checkBreak(doc, 100, ctx, "Modalitaeten");
  y = section(doc, "Vergütung");
  y = dataRow(doc, "Modell", str(sd.verguetungsmodell), y);
  y = dataRow(doc, "Entgeltgruppe", str(sd.entgeltgruppe), y);
  y = dataRow(doc, "Stufe", str(sd.stufe), y);
  if (sd.festgehalt) y = dataRow(doc, "Festgehalt", `${sd.festgehalt} EUR`, y);
  if (sd.stundenlohn) y = dataRow(doc, "Stundenlohn", `${sd.stundenlohn} EUR`, y);
  y = dataRow(doc, "Jahressonderzahlung", yn(sd.jahressonderzahlung), y);
  if (sd.sonderzahlungProzent) y = dataRow(doc, "Sonderzahlung %", `${sd.sonderzahlungProzent}%`, y);
  y = dataRow(doc, "Urlaubstage/Jahr", str(sd.urlaubstageProJahr), y);

  checkBreak(doc, 50, ctx, "Modalitaeten");
  y = section(doc, "Probezeit & Sonstiges");
  y = dataRow(doc, "Probezeit", yn(sd.probezeit), y);
  if (sd.probezeitMonate) y = dataRow(doc, "Probezeit (Monate)", str(sd.probezeitMonate), y);
  if (sd.zusatzvereinbarungen) {
    y = dataRow(doc, "Zusatzvereinbarungen", str(sd.zusatzvereinbarungen), y);
  }
}

// =============================================
// Dokumente-Liste
// =============================================

async function addDokumentePages(doc: PDFKit.PDFDocument, ctx: OnboardingExportContext, first = false): Promise<void> {
  if (!first) doc.addPage();
  await coverPage(doc, ctx, "DOKUMENTE", "Dokumentenuebersicht");

  doc.addPage();
  pageHeader(doc, ctx, "Dokumente");
  let y = section(doc, `Hochgeladene Dokumente (${ctx.documents.length})`, 55);

  if (ctx.documents.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor(C.gray).text("Keine Dokumente hochgeladen.", 50, y);
    return;
  }

  for (const d of ctx.documents) {
    checkBreak(doc, 35, ctx, "Dokumente");
    y = doc.y;

    const statusColor = d.status === "APPROVED" ? C.gruen : d.status === "REJECTED" ? C.rot : C.gray;
    const statusLabel = d.status === "APPROVED" ? "Genehmigt" : d.status === "REJECTED" ? "Abgelehnt" : d.status === "REVIEWED" ? "Geprueft" : "Hochgeladen";

    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.black).text(d.type, 50, y, { width: 150 });
    doc.font("Helvetica").fontSize(9).fillColor(C.black).text(d.fileName, 205, y, { width: 200 });
    doc.font("Helvetica").fontSize(8).fillColor(statusColor).text(statusLabel, 415, y, { width: 60 });
    doc.font("Helvetica").fontSize(8).fillColor(C.gray).text(fmt(d.uploadedAt), 480, y, { width: 80 });

    y = doc.y + 4;
    doc.rect(50, y, 515, 0.5).fill(C.lightGray);
    doc.y = y + 6;
  }
}

// =============================================
// Checkliste
// =============================================

async function addChecklistePages(doc: PDFKit.PDFDocument, ctx: OnboardingExportContext, first = false): Promise<void> {
  if (!first) doc.addPage();
  await coverPage(doc, ctx, "CHECKLISTE", "Onboarding-Checkliste");

  doc.addPage();
  pageHeader(doc, ctx, "Checkliste");

  const completed = ctx.checklistItems.filter((i) => i.isCompleted).length;
  let y = section(doc, `Checkliste (${completed}/${ctx.checklistItems.length})`, 55);

  // Nach Kategorie gruppieren
  const byCategory: Record<string, ChecklistExport[]> = {};
  for (const item of ctx.checklistItems) {
    const cat = item.category || "Sonstiges";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  for (const [category, items] of Object.entries(byCategory)) {
    checkBreak(doc, 30, ctx, "Checkliste");
    y = doc.y;

    const catDone = items.filter((i) => i.isCompleted).length;
    doc.rect(50, y, 515, 20).fill("#F0F0F0");
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.primary).text(category, 58, y + 4, { width: 380 });
    doc.font("Helvetica-Bold").fontSize(9)
      .fillColor(catDone === items.length ? C.gruen : C.gray)
      .text(`${catDone}/${items.length}`, 460, y + 4, { width: 100, align: "right" });
    doc.y = y + 26;

    for (const item of items) {
      checkBreak(doc, item.notes ? 35 : 20, ctx, "Checkliste");
      const iy = doc.y;

      const icon = item.isCompleted ? "\u2713" : "\u2610";
      const iconColor = item.isCompleted ? C.gruen : C.gray;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(iconColor).text(icon, 55, iy);

      const titleColor = item.isCompleted ? C.gray : C.black;
      doc.font("Helvetica").fontSize(9).fillColor(titleColor).text(item.title, 72, iy, { width: 340 });

      if (item.assignee) {
        doc.font("Helvetica").fontSize(7).fillColor(C.blau).text(item.assignee, 420, iy, { width: 60 });
      }
      if (item.isCompleted && item.completedAt) {
        doc.font("Helvetica").fontSize(7).fillColor(C.gray).text(fmt(item.completedAt), 485, iy, { width: 80, align: "right" });
      }

      let ny = doc.y + 2;
      if (item.notes) {
        doc.rect(72, ny, 400, 0.5).fill(C.gelb);
        ny += 3;
        doc.font("Helvetica").fontSize(8).fillColor(C.primary).text(`Notiz: ${item.notes}`, 72, ny, { width: 440 });
        ny = doc.y + 4;
      }
      doc.y = ny + 2;
    }
  }
}

// =============================================
// Haupt-Export
// =============================================

export type OnboardingExportType = "gesamtakte" | "fragebogen" | "modalitaeten" | "dokumente" | "checkliste";

export async function generateOnboardingPDF(
  ctx: OnboardingExportContext,
  type: OnboardingExportType,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4", margin: 50,
    info: {
      Title: `${ctx.displayId || "Onboarding"} — ${type}`,
      Author: "CREDO HR-Portal",
      Subject: `Onboarding ${ctx.firstName} ${ctx.lastName}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  switch (type) {
    case "fragebogen":
      await addFragebogenPages(doc, ctx, true);
      break;
    case "modalitaeten":
      await addModalitaetenPages(doc, ctx, true);
      break;
    case "dokumente":
      await addDokumentePages(doc, ctx, true);
      break;
    case "checkliste":
      await addChecklistePages(doc, ctx, true);
      break;
    case "gesamtakte":
      await addFragebogenPages(doc, ctx, true);
      await addModalitaetenPages(doc, ctx);
      await addDokumentePages(doc, ctx);
      await addChecklistePages(doc, ctx);
      break;
  }

  doc.end();
  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
