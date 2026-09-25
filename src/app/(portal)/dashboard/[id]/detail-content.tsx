"use client";

/**
 * Detail-Ansicht eines Onboarding-Vorgangs (Vollbild-Seite)
 *
 * Tabs: Uebersicht | Dokumente | Checkliste | Vorgesetzter
 * Nutzt die bestehende PortalHeader-Komponente und CREDO Corporate Design.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalHeader } from "@/components/portal-header";
import { DokumentenpaketSection } from "@/components/dokumentenpaket-section";
import { CopyButton } from "@/components/copy-button";
import {
  STATUS_LABELS,
  abteilungLabel,
  documentStatusLabel,
  getBefristungSachgrundLabel,
  getBefristungsartLabel,
} from "@/lib/constants";
import type {
  AbteilungsAktion,
  AbteilungsUebersichtDaten,
  ErledigtVon,
  Fuehrungskraft,
} from "@/lib/abteilungsaufgaben";
import {
  AbteilungenKarte,
  abteilungsAktionSenden,
  erledigtText,
  PILL_FARBEN,
  type AktionsMeldung,
} from "@/components/abteilungsaufgaben/abteilungen-karte";
import type { UnterlagenMeldung } from "@/components/unterlagen/aktionen";
import { NachforderungDialog } from "@/components/unterlagen/nachforderung-dialog";
import { NachforderungKarte, UnterlagenMeldungen } from "@/components/unterlagen/nachforderung-karte";
import {
  alsEntfallenVermerkt,
  nachweisStandText,
  offeneNachweiseAktion,
  warnbalkenAktion,
  type NachforderungDialogAnfrage,
  type NachweisAktion,
  type UnterlagenUebersicht,
} from "@/lib/unterlagen";
import { ProcessWorkflowStepper } from "@/components/process-workflow-stepper";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { EditPersonalDataModal } from "./edit-personal-data-modal";
import { RvFristenCard } from "./rv-fristen-card";
import { TemplateGenerationSection } from "@/components/template-generation-section";
import {
  documentTypeLabel,
  offeneNachweise,
  pflichtEingabenAusVorgang,
} from "@/lib/required-documents";
import {
  ABLAUF_KATEGORIE_META,
  ablaufAmpel,
  ablaufKalendertag,
  dringendeNachweisLagen,
  istFristpflichtig,
  nachweisLagen,
} from "@/lib/dokument-fristen";
import { nach1970GeborenAnzeige } from "@/lib/masernschutz";
import { statusLabel } from "@/lib/minijob-status";
import { formatProgress, type FragebogenFortschritt } from "@/lib/fragebogen-steps";
import { formatBytes } from "@/lib/format";
import { FELD_BEZEICHNUNGEN } from "@/lib/formular-fehler";
import {
  bereitZurPruefung,
  istHrStatus,
  mitarbeiterAbgesendet,
  mitarbeiterName,
  nachweiseAbgegeben,
  pruefungNichtMoeglichGrund,
  vorgesetzteAbgesendet,
  vorgesetztenLinkAbgelaufen,
} from "@/lib/onboarding-spuren";
import {
  formatModalitaetenFortschritt,
  modalitaetenFortschritt,
} from "@/lib/validations/supervisor-data";
import {
  onboardingKurzschritte,
  onboardingWorkflowSchritte,
  spurenChips,
  type SpurChip,
} from "./uebersicht-schritte";
import {
  anteilText,
  kostenstellenAnzeige,
  summeText,
} from "@/lib/kostenstellen-anzeige";

// =============================================
// Types
// =============================================

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface DocumentData {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  uploadedAt: string;
  /**
   * Ablauf eines befristeten Nachweises als ISO-Zeichenkette; `null`, wenn
   * keiner erfasst ist. Wird NIE mit formatDate() angezeigt: Die Spalte ist
   * `@db.Date`, kommt also als Mitternacht UTC herein — `toLocaleDateString()`
   * rechnet in die Ortszeit des Browsers und macht daraus westlich von
   * Greenwich den Vortag. Die Anzeige kommt deshalb ausschliesslich aus
   * `ablaufAmpel()` (src/lib/dokument-fristen.ts).
   */
  gueltigBis: string | null;
  /**
   * Ausdruecklich unbefristeter Nachweis (Paket 4, Z1; `Document.unbefristet`).
   * Kasten und Warnbalken reichen es an `nachweisLagen` weiter: Eine
   * unbefristete Art verdraengt jedes datierte Dokument derselben Art.
   * Optional, weil aeltere Antworten das Feld nicht tragen.
   */
  unbefristet?: boolean;
  /**
   * Name einer frei benannten Unterlage, die als SONSTIGES uebernommen wurde
   * (Paket 4, EP-6; `Document.bezeichnung`), etwa „Unterschriebener
   * RV-Antrag". Sonst null bzw. fehlend.
   */
  bezeichnung?: string | null;
}

/**
 * Was die Frist-Route (PATCH /api/onboarding/[id]/documents/[docId]) nach
 * einer Aenderung zurueckmeldet.
 */
export interface FristAenderung {
  gueltigBis: string | null;
  /**
   * Der Status NACH der Aenderung, sofern die Antwort ihn traegt. Eine
   * korrigierte, nicht abgelaufene Frist nimmt EXPIRED zurueck (UPLOADED);
   * fehlt das Feld, bleibt der bisherige Status stehen.
   */
  status?: string;
  /**
   * Das Kennzeichen „unbefristet" NACH der Aenderung (Paket 4, Z1), sofern die
   * Antwort es traegt. Ein gesetztes Datum nimmt es zurueck.
   */
  unbefristet?: boolean;
}

/**
 * Eine bestaetigte Fristaenderung in die geladene Dokumentliste uebernehmen —
 * Datum, Status und das Kennzeichen „unbefristet". Frueher nur das Datum: Nach
 * einer Korrektur stand bis zum Neuladen das Abzeichen „Abgelaufen" neben der
 * gruenen Ampel, obwohl der Server den Status laengst zurueckgenommen hatte.
 * Rein und exportiert fuer den Test.
 */
export function fristAenderungUebernehmen<
  T extends { id: string; gueltigBis: string | null; status: string },
>(dokumente: T[], docId: string, aenderung: FristAenderung): T[] {
  return dokumente.map((d) =>
    d.id === docId
      ? {
          ...d,
          gueltigBis: aenderung.gueltigBis,
          ...(aenderung.status ? { status: aenderung.status } : {}),
          ...(typeof aenderung.unbefristet === "boolean" ? { unbefristet: aenderung.unbefristet } : {}),
        }
      : d
  );
}

export interface ChecklistItemData {
  id: string;
  title: string;
  category: string;
  orderIndex: number;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: { firstName: string; lastName: string } | null;
  dueDate: string | null;
  /**
   * Zustaendigkeit als SCHLUESSEL („IT", „VORGESETZTER") seit Paket 5 — nie
   * roh anzeigen, sondern ueber den Namen aus `abteilungen.zeilen` bzw.
   * `abteilungLabel()`. Altbestand kann noch Freitext tragen.
   */
  assignee: string | null;
  notes: string | null;
  /** Hinweis aus der Vorlage; steht auch auf der Link-Seite und in der Mail. */
  description?: string | null;
  /** Kopie von `defaultDueDays` — Grundlage von `faelligAm`. */
  relativeDueDays?: number | null;
  /** Rueckmeldung der Abteilung ueber ihren Link. */
  abteilungKommentar?: string | null;
  abteilungKommentarAm?: string | null;
  /** Wer abgehakt hat (Portal-Benutzer oder Abteilung per Link). */
  erledigtVon?: ErledigtVon;
  /**
   * Faelligkeit (ISO): die gespeicherte, sonst die aus Vertragsbeginn und
   * `relativeDueDays` berechnete Vorschau. Kommt fertig vom Server.
   */
  faelligAm?: string | null;
}

interface NoteData {
  id: string;
  content: string;
  createdAt: string;
  createdBy: { firstName: string; lastName: string };
}

export interface DetailData {
  id: string;
  /** Serverseitig gegen die Vorlage dieses Vorgangs berechnet. */
  fragebogenFortschritt: FragebogenFortschritt;
  /**
   * Die Pflicht-Dokumenttypen der Vorlage dieses Fragebogentyps, wie sie auch
   * das Absenden auswertet. Ausgangspunkt fuer den Kasten „Offene Nachweise" —
   * die bedingten Pflichten kommen erst in `effektivePflichtDokumente` dazu.
   */
  requiredDocuments: string[];
  displayId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  questionnaireType: string;
  token: string;
  supervisorToken: string | null;
  supervisorEmail: string | null;
  /**
   * Ablauf des Vorgesetzten-Links (per Spread aus GET /api/onboarding/[id]).
   * Ist er vorbei, bietet die Karte „Vorgesetzten-Link" einen neuen an — sonst
   * sperrte `bereitZurPruefung` den Vorgang dauerhaft (wartet auf Modalitaeten,
   * die mit dem toten Link niemand mehr absenden kann).
   */
  supervisorTokenExpiresAt: string | null;
  invitedAt: string;
  submittedAt: string | null;
  /**
   * Zeitpunkt, zu dem die Fuehrungskraft die Modalitaeten abgesendet hat — die
   * zweite Spur neben `submittedAt` (src/lib/onboarding-spuren.ts). Kommt per
   * Spread aus GET /api/onboarding/[id].
   */
  supervisorSubmittedAt: string | null;
  /**
   * Die drei folgenden Felder kommen seit jeher per Spread aus
   * GET /api/onboarding/[id] (prisma/schema.prisma), waren hier aber nie
   * deklariert — deshalb zeigte der Abschluss-Schritt das Datum der
   * Fragebogen-Abgabe statt des Abschlusses.
   */
  reviewedAt: string | null;
  completedAt: string | null;
  /** Wann der Vorgesetzten-Link verschickt wurde (Anker der Erinnerung). */
  supervisorLinkSentAt: string | null;
  starterPacketSentAt: string | null;
  starterPacketSentCount: number;
  organization: {
    id: string;
    name: string;
    mandantNumber: string;
    betriebsnummer?: string | null;
    /**
     * `OrganizationType` — entscheidet ueber die Masernschutzpflicht
     * (Gemeinschaftseinrichtung ja/nein, siehe `src/lib/masernschutz.ts`).
     */
    type?: string | null;
  };
  personalData: {
    firstName: string | null;
    lastName: string | null;
    isComplete: boolean;
    currentStep: number;
    /** Entscheidung aus Schritt 11 — steuert, welcher Antrag erzeugt wird. */
    rvEntscheidung?: string | null;
    // Schritt 6 seit AP 5/6 — Status und Grundfragen zu weiteren Beschaeftigungen.
    beschaeftigungsStatus?: string | null;
    beschaeftigungsStatusSonstige?: string | null;
    alsArbeitsuchendGemeldet?: boolean | null;
    agenturFuerArbeit?: string | null;
    mitLeistungsbezug?: boolean | null;
    summeUeberGeringfuegigkeitsgrenze?: boolean | null;
    vorbeschaeftigungenVorhanden?: boolean | null;
    auslandsbeschaeftigungVorhanden?: boolean | null;
    // Persönliche Angaben
    salutation: string | null;
    title: string | null;
    birthName: string | null;
    birthDate: string | null;
    birthPlace: string | null;
    birthCountry: string | null;
    nationality: string | null;
    /**
     * Selbstauskunft aus Schritt 1. `null` heisst „noch nicht beantwortet" und
     * erzeugt KEINE Pflicht — siehe `PflichtEingaben` in required-documents.ts.
     */
    aufenthaltstitelErforderlich?: boolean | null;
    maritalStatus: string | null;
    severelyDisabled: boolean | null;
    disabilityDegree: number | null;
    // Adresse
    street: string | null;
    houseNumber: string | null;
    zipCode: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    mobile: string | null;
    emailPrivate: string | null;
    // Bankverbindung
    iban: string | null;
    bic: string | null;
    bankName: string | null;
    accountHolder: string | null;
    // Sozialversicherung
    socialSecurityNumber: string | null;
    healthInsuranceName: string | null;
    healthInsuranceType: string | null;
    parentStatus: boolean | null;
    // Steuer
    taxId: string | null;
    taxClass: string | null;
    taxAllowance: number | null;
    childAllowance: number | null;
    religion: string | null;
    // Bildung
    highestSchoolDegree: string | null;
    highestProfessionalDegree: string | null;
    // Sonstiges
    hasOtherEmployment: boolean | null;
    otherEmployerName: string | null;
    otherWeeklyHours: number | null;
    employerType: string | null;
    hasMinijob: boolean | null;
    minijobRvBefreiung: boolean | null;
    // Masernschutz
    bornAfter1971: boolean | null;
    masernschutzProvided: boolean | null;
    // DSGVO
    dsgvoAccepted: boolean | null;
    dsgvoAcceptedAt: string | null;
    // Wahrheitsversicherung (Unterschriftsersatz)
    erklaerungAccepted: boolean | null;
    erklaerungAcceptedAt: string | null;
    erklaerungOrt: string | null;
    erklaerungIp: string | null;
    erklaerungUserAgent: string | null;
    erklaerungVersion: string | null;
    erklaerungPruefsumme: string | null;
    // Kinder
    children: {
      id: string;
      firstName: string;
      lastName: string | null;
      birthDate: string;
      taxAllowance: boolean;
    }[];
  } | null;
  supervisorData: {
    isComplete: boolean;
    currentStep: number;
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
    hauptarbeitgeberId: string | null;
    hauptarbeitgeberStunden: number | null;
    nebenarbeitgeberId: string | null;
    nebenarbeitgeberStunden: number | null;
    svPflichtig: boolean | null;
    minijob: boolean | null;
    ehrenamt: boolean | null;
    /**
     * Bestandsfelder. Ab KOSTENSTELLEN_AUFTEILUNG_V1 nur noch Lesequelle und
     * ausschliesslich Rueckfall, solange `kostenstellen` leer ist — die Maske
     * befuellt sie nicht mehr. Wer hier wieder direkt anzeigt, zeigt bei einem
     * geaenderten Bestandsvorgang die ALTE Kostenstelle an.
     */
    kostenstelle: string | null;
    kostenstelleAnteil: number | null;
    /** Die gepflegte Aufteilung; kommt aus dem `include` in /api/onboarding/[id]. */
    kostenstellen: { bezeichnung: string; anteil: number }[];
    kostenstellenBemerkung: string | null;
    probezeit: boolean | null;
    probezeitMonate: number | null;
    verguetungsmodell: string | null;
    entgeltgruppe: string | null;
    stufe: string | null;
    festgehalt: number | null;
    stundenlohn: number | null;
    bemerkungVerguetung: string | null;
    jahressonderzahlung: boolean | null;
    sonderzahlungProzent: number | null;
    sachbezuege: boolean | null;
    sachbezuegeBetrag: number | null;
    zulage: boolean | null;
    zulageBetrag: number | null;
    urlaubstageProJahr: number | null;
    masernschutzErforderlich: boolean | null;
    masernschutzVorArbeitsbeginn: boolean | null;
    zeiterfassung: boolean | null;
    zusatzvereinbarungen: string | null;
  } | null;
  documents: DocumentData[];
  checklistItems: ChecklistItemData[];
  notes: NoteData[];
  _count: { notes: number };
  /**
   * Karte „Aufgaben für Abteilungen" (Paket 5) — fehlt, solange die Route sie
   * nicht liefert (Bestandsstand, anderer Zweig).
   */
  abteilungen?: AbteilungsUebersichtDaten;
  /** Wirksame Fuehrungskraft des Vorgangs (Adresse aus den Modalitaeten). */
  fuehrungskraft?: Fuehrungskraft;
  /**
   * „Unterlagen nachfordern" (Paket 4) — fertig aus `unterlagenUebersichtLaden`
   * (src/lib/unterlagen.ts, `uebersichtBauen`). Karte, Kasten „Offene
   * Nachweise", Warnbalken, Reiter-Pille, Mini-Karte und Dokumentenliste lesen
   * nur hieraus; `loadData(true)` aktualisiert alle zugleich. Fehlt, solange
   * die Route es nicht liefert.
   */
  unterlagen?: UnterlagenUebersicht;
}

// =============================================
// Constants
// =============================================

// `alias`: der deutsche Name des Reiters fuer `?tab=` (siehe `reiterAusSuche`).
const TABS = [
  { id: "overview", label: "Übersicht", alias: "uebersicht" },
  { id: "questionnaire", label: "Fragebogen-Daten", alias: "fragebogen" },
  { id: "documents", label: "Dokumente", alias: "dokumente" },
  { id: "checklist", label: "Checkliste", alias: "checkliste" },
  { id: "supervisor", label: "Vorgesetzter", alias: "vorgesetzter" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * `?tab=` → Reiter: die interne Id oder der deutsche Name, beides aus `TABS`
 * abgeleitet — ein neuer Reiter ist damit ohne zweite Liste erreichbar. Eine
 * Map statt eines Objekts: `?tab=constructor` darf nicht auf
 * `Object.prototype` treffen.
 */
const REITER_AUS_SUCHE: ReadonlyMap<string, TabId> = new Map<string, TabId>(
  TABS.flatMap((t): [string, TabId][] => [
    [t.id, t.id],
    [t.alias, t.id],
  ]),
);

/**
 * Der Reiter aus `?tab=…` (`window.location.search`), sonst `null` — dann
 * bleibt es bei „Übersicht". Unbekannte Werte werden ignoriert, nie als
 * Fehler gezeigt. Rein und exportiert fuer den Test.
 *
 * Gesetzt wird der Parameter von `portalLink` der HR-Mails zu „Unterlagen
 * nachfordern": Der Modul-Baustein (`portalPfad`) zeigt auf
 * `/dashboard/<id>?tab=dokumente` — „Im Portal prüfen" landet so gleich bei
 * der Karte, nicht in der „Übersicht" (Schritt 11, Abweichung von
 * Feinplanung 8.2).
 */
export function reiterAusSuche(suche: string): TabId | null {
  const wert = new URLSearchParams(suche).get("tab");
  if (!wert) return null;
  return REITER_AUS_SUCHE.get(wert.trim().toLowerCase()) ?? null;
}

/**
 * Rueckmeldung zum Vorgesetzten-Link: ein Fehler (rot — Ablehnung, Mail nicht
 * versendet) oder ein neutraler Hinweis (der bestehende Link gilt weiter).
 */
type LinkMeldung = { art: "fehler" | "hinweis"; text: string };

// =============================================
// Helper Functions
// =============================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBoolean(val: boolean | null): string {
  if (val === null || val === undefined) return "\u2014";
  return val ? "Ja" : "Nein";
}

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return "\u2014";
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatNumber(val: number | null, suffix?: string): string {
  if (val === null || val === undefined) return "\u2014";
  return suffix ? `${val} ${suffix}` : String(val);
}

// =============================================
// SVG Icons
// =============================================

function ArrowLeftIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function DocumentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function UploadCloudIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
    </svg>
  );
}

function ChatBubbleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function NoteIndicatorIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function LinkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

// =============================================
// Main Component
// =============================================

export function DetailContent({
  onboardingId,
  user,
}: {
  onboardingId: string;
  user: User;
}) {
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Notes state
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Supervisor link state
  const [supervisorEmail, setSupervisorEmail] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);
  // Fehler bzw. Hinweis zum Vorgesetzten-Link. Frueher schluckte die Seite
  // jede Ablehnung still („// silent"); seit die Route 409 kennt (Modalitaeten
  // schon eingereicht, Vorgang geprueft) muss HR den Grund sehen.
  const [linkMeldung, setLinkMeldung] = useState<LinkMeldung | null>(null);

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<ChecklistItemData[]>([]);
  const [togglingItems, setTogglingItems] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [checklistNoteText, setChecklistNoteText] = useState("");
  const [savingChecklistNote, setSavingChecklistNote] = useState(false);
  const [completingProcess, setCompletingProcess] = useState(false);
  const [reviewingProcess, setReviewingProcess] = useState(false);
  // Ablehnung von „Als geprüft markieren" / „Vorgang abschließen". Der Server
  // prueft die Uebergaenge selbst (409 mit deutschem Grund) — ohne Anzeige
  // saehe HR nur einen Knopf, der nichts tut.
  const [statusFehler, setStatusFehler] = useState<string | null>(null);

  // Dokumentenpaket-Versand: Der Dialog gehoert der Karte im Dokumente-Tab,
  // der Knopf im Abschluss-Schritt oeffnet denselben.
  const [paketDialogOffen, setPaketDialogOffen] = useState(false);

  // Karte „Aufgaben für Abteilungen" (Paket 5): Ergebnis der letzten Aktion
  // und der Dialog „Abteilungen informieren" — beide hier, weil auch der
  // Stepper-Schritt „Checkliste abarbeiten" den Dialog oeffnet.
  const [abteilungsMeldung, setAbteilungsMeldung] = useState<AktionsMeldung | null>(null);
  const [abteilungenDialogOffen, setAbteilungenDialogOffen] = useState(false);
  // Fehler beim Abhaken oder Notieren in der Checkliste. Frueher verschluckte
  // die Seite jede Ablehnung („// silent") — ein abgelaufener Vorgang sah
  // dann aus wie ein Knopf, der nichts tut.
  const [checklistFehler, setChecklistFehler] = useState<string | null>(null);

  // „Unterlagen nachfordern" (Paket 4): Der Dialog gehoert der Karte im
  // Dokumente-Tab — der Kasten „Offene Nachweise" und der Warnbalken oeffnen
  // denselben und wechseln dafuer dorthin (wie „Dokumente versenden…").
  // `vorauswahl` legt fest, was der Dialog ankreuzt; `null` (Karte) heisst die
  // Vorschlaege ohne frueher als entfallen vermerkte Arten
  // (`NachforderungDialogAnfrage`). Die Meldung des Dialogs steht ueber der
  // Karte: gruen nur, wenn auch die Mail an die Person hinausging.
  const [nachforderungDialog, setNachforderungDialog] = useState<NachforderungDialogAnfrage | null>(null);
  const [unterlagenMeldung, setUnterlagenMeldung] = useState<UnterlagenMeldung | null>(null);
  // „Zur Nachforderung": zaehlt hoch, der Dokumente-Tab rollt dann zur Karte
  // und meldet den Sprung als erledigt (zurueck auf 0).
  const [karteSprung, setKarteSprung] = useState(0);
  const karteSprungErledigt = useCallback(() => setKarteSprung(0), []);

  // `?tab=dokumente` oeffnet gleich einen Reiter (`reiterAusSuche`; so kommen
  // die HR-Mails der Nachforderung an). Einmal beim Oeffnen — danach gilt,
  // was HR klickt. Im Effekt, nicht im Anfangszustand: Die Seite wird auch auf
  // dem Server gerendert, und dort gibt es kein `window`. Der Effekt laeuft,
  // waehrend die Seite noch laedt — die „Übersicht" blitzt also nicht auf.
  useEffect(() => {
    const reiter = reiterAusSuche(window.location.search);
    if (reiter) setActiveTab(reiter);
  }, []);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  // ---- Status-Aktionen ----
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "HR_LEITUNG";

  // "Als geprüft markieren" – wenn der Fragebogen eingereicht ist und, falls ein
  // Vorgesetzten-Link besteht, auch die Modalitaeten (Entscheidung 21.09.2026).
  // Dieselbe Funktion wie im PATCH. Frueher hing der Knopf am Status und
  // erschien im festhaengenden Fall („Vorgesetzter fertig", Fragebogen offen),
  // obwohl der Fragebogen fehlte.
  const canReview = data && isAdmin && bereitZurPruefung(data);

  // "Vorgang abschließen" – wenn geprueft
  const canComplete = data &&
    data.status === "REVIEWED" &&
    isAdmin;

  // Starterpaket an den Mitarbeiter versenden (manuell, im Abschluss/Dokumente-Hub)
  const handleReviewProcess = async () => {
    if (!data || !canReview) return;
    setReviewingProcess(true);
    setStatusFehler(null);
    try {
      const res = await fetch(`/api/onboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REVIEWED" }),
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusFehler(
          err.error || "Der Vorgang konnte nicht als geprüft markiert werden."
        );
      }
    } catch {
      setStatusFehler("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setReviewingProcess(false);
    }
  };

  const handleCompleteProcess = async () => {
    if (!data || !canComplete) return;
    if (!window.confirm("Möchten Sie diesen Vorgang wirklich als abgeschlossen markieren? Diese Aktion kann nicht rückgängig gemacht werden.")) return;
    setCompletingProcess(true);
    setStatusFehler(null);
    try {
      const res = await fetch(`/api/onboarding/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusFehler(err.error || "Der Vorgang konnte nicht abgeschlossen werden.");
      }
    } catch {
      setStatusFehler("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setCompletingProcess(false);
    }
  };

  // ---- Data Loading ----
  //
  // `leise` laedt nach, ohne die Seite gegen „Lade Vorgangsdaten…" zu
  // tauschen: Beim Abhaken einer Checklisten-Aufgabe und nach einer
  // Abteilungs-Aktion verschwaende das Vollneuladen die halbe Sekunde
  // sichtbar — der Scrollstand spraenge nach oben, und die Anzeige „Wird
  // gesendet…" des Dialogs waere nie zu sehen. Das Offboarding macht es
  // ebenso (`loadData(true)`).
  const loadData = useCallback(async (leise = false) => {
    if (!leise) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}`);
      if (!res.ok) throw new Error("Vorgang konnte nicht geladen werden");
      const result: DetailData = await res.json();
      setData(result);
      setNotes(result.notes || []);
      setChecklistItems(result.checklistItems || []);
      setSupervisorEmail(result.supervisorEmail || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      if (!leise) setLoading(false);
    }
  }, [onboardingId]);

  /**
   * Eine geaenderte Dokumentenfrist in den geladenen Vorgang zurueckschreiben.
   *
   * Bewusst punktuell statt `loadData()`: Das Neuladen setzt `loading` und
   * blendet die ganze Seite fuer einen Moment aus — fuer ein Datumsfeld, das
   * die Route bereits bestaetigt hat, ist das die groessere Stoerung. Der
   * Warnbalken und der Kasten „Offene Nachweise" rechnen live aus
   * `data.documents` und stimmen mit diesem einen Feld sofort wieder.
   *
   * Den Status gleich mit (`fristAenderungUebernehmen`): Eine korrigierte Frist
   * nimmt EXPIRED zurueck — ohne ihn stuende bis zum Neuladen „Abgelaufen"
   * neben der gruenen Ampel.
   */
  const setzeDokumentFrist = useCallback(
    (docId: string, aenderung: FristAenderung) => {
      setData((bisher) =>
        bisher
          ? {
              ...bisher,
              documents: fristAenderungUebernehmen(bisher.documents, docId, aenderung),
            }
          : bisher
      );
    },
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Note actions ----
  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) {
        const result = await res.json();
        setNotes((prev) => [result.data, ...prev]);
        setNewNote("");
      }
    } catch {
      // silent
    } finally {
      setSavingNote(false);
    }
  };

  // ---- Supervisor link ----
  const generateSupervisorLink = async () => {
    if (!supervisorEmail.trim()) return;
    setGeneratingLink(true);
    setLinkMeldung(null);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/supervisor-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supervisorEmail: supervisorEmail.trim() }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setLinkResult(result.modalitaetenLink);
        // Der Link ist da, aber ist die Mail auch raus? Die Route meldet den
        // Versandstatus mit — FAILED/SKIPPED heisst: HR muss den Link selbst
        // weitergeben. Bei einem wiederverwendeten Link geht bewusst keine
        // zweite Mail hinaus.
        if (result.wiederverwendet) {
          setLinkMeldung({
            art: "hinweis",
            text: "Der bestehende Link gilt weiter. Es wurde keine neue E-Mail versendet.",
          });
        } else if (result.mailVersand && result.mailVersand !== "SENT") {
          setLinkMeldung({
            art: "fehler",
            text: "Link erstellt, aber die E-Mail an die Führungskraft wurde nicht versendet. Bitte geben Sie den Link selbst weiter.",
          });
        } else if (result.mailVersand === "SENT") {
          // Beim Ersetzen (abgelaufener Link, andere Adresse) aendert sich in
          // der Karte sonst nur die Zeichenkette im Linkfeld — HR soll sehen,
          // dass der neue Link auch unterwegs ist.
          setLinkMeldung({
            art: "hinweis",
            text: `Link erstellt und per E-Mail an ${result.supervisorEmail ?? "die Führungskraft"} versendet.`,
          });
        }
        loadData();
      } else {
        setLinkMeldung({
          art: "fehler",
          text: result.error || "Der Vorgesetzten-Link konnte nicht erstellt werden.",
        });
      }
    } catch {
      setLinkMeldung({ art: "fehler", text: "Verbindungsfehler. Bitte versuchen Sie es erneut." });
    } finally {
      setGeneratingLink(false);
    }
  };

  // ---- Checklist actions ----
  //
  // Die Route antwortet seit Paket 5 mit `{ item, progress }` statt mit dem
  // nackten Datensatz. Wer hier weiter das ganze JSON in die Liste schriebe,
  // ersetzte die Aufgabe durch ein Objekt ohne `title` — die Zeile waere leer.
  const checklistPatch = async (
    itemId: string,
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    setChecklistFehler(null);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const antwort = (await res.json().catch(() => null)) as
        | { item?: ChecklistItemData; error?: string }
        | null;
      if (!res.ok || !antwort?.item) {
        setChecklistFehler(antwort?.error || "Die Aufgabe konnte nicht gespeichert werden.");
        return false;
      }
      const item = antwort.item;
      setChecklistItems((prev) => prev.map((alt) => (alt.id === itemId ? { ...alt, ...item } : alt)));
      return true;
    } catch {
      setChecklistFehler("Verbindungsfehler. Bitte versuchen Sie es erneut.");
      return false;
    }
  };

  const toggleChecklistItem = async (itemId: string, currentState: boolean) => {
    setTogglingItems((prev) => new Set(prev).add(itemId));
    try {
      const ok = await checklistPatch(itemId, { isCompleted: !currentState });
      // Der Abteilungsstand haengt am Abhaken (letzte Aufgabe erledigt →
      // Zeile „Erledigt", Knopf verschwindet). Deshalb neu laden, nicht nur
      // die eine Zeile ersetzen — aber leise, sonst verschwindet die Seite
      // bei jedem Klick auf eine Checkbox.
      if (ok) await loadData(true);
    } finally {
      setTogglingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const saveChecklistNote = async (itemId: string) => {
    setSavingChecklistNote(true);
    try {
      if (await checklistPatch(itemId, { notes: checklistNoteText })) {
        setEditingNoteId(null);
        setChecklistNoteText("");
      }
    } finally {
      setSavingChecklistNote(false);
    }
  };

  // ---- Abteilungs-Aktionen (Karte „Aufgaben für Abteilungen") ----
  //
  // Eine Route fuer alle vier Aktionen: Informieren (`{}`), Erinnern, Erneut
  // senden und Link erneuern (`{ aktion, departmentKey }`). Die Antwort traegt
  // den Versandbericht als fertige Meldung (201 gruen, 409/502 rot) samt
  // Hinweis (gelb). Danach IMMER neu laden — auch ein 409/502 kann den Stand
  // aendern (etwa „Versand fehlgeschlagen" an der Zeile).
  const abteilungsAktion = async (aktion: AbteilungsAktion, departmentKey?: string) => {
    setAbteilungsMeldung(null);
    const meldung = await abteilungsAktionSenden(
      `/api/onboarding/${onboardingId}/abteilungen`,
      aktion,
      departmentKey,
    );
    setAbteilungsMeldung(meldung);
    await loadData(true);
  };

  // ---- Unterlagen nachfordern (Paket 4) ----
  const darfBearbeiten = HR_EDIT_ROLES.includes(user.role);

  const nachfordern = (anfrage: NachforderungDialogAnfrage) => {
    setActiveTab("documents");
    setUnterlagenMeldung(null);
    setNachforderungDialog(anfrage);
  };

  const zurNachforderung = () => {
    setActiveTab("documents");
    setKarteSprung((n) => n + 1);
  };

  // Erst neu laden, dann schliessen: So steht der neue Stand (Karte, Kasten,
  // Reiter-Pille) schon da, wenn der Dialog verschwindet. Die Meldung kommt
  // fertig vom Dialog, in denselben Farben wie die Aktionen der Karte: gruen
  // nur, wenn die Mail hinausging, rot bei nicht zugestellter Mail (FAILED —
  // gespeichert ist die Nachforderung trotzdem, der Text nennt „Link erneut
  // senden"), gelb bei uebersprungener (SKIPPED) bzw. N2.
  const nachforderungErfolg = async (m: { art: "erfolg" | "warnung" | "fehler"; text: string }) => {
    try {
      await loadData(true);
    } finally {
      setNachforderungDialog(null);
      setUnterlagenMeldung({ art: m.art, meldung: m.text, hinweis: null });
    }
  };

  // ---- Computed values ----
  const statusInfo = data ? STATUS_LABELS[data.status] || STATUS_LABELS.INVITED : STATUS_LABELS.INVITED;
  // mitarbeiterName: erst der Name aus dem Fragebogen, dann der beim Anlegen
  // eingetragene — und ohne „Anna null", wenn nur ein Teil bekannt ist.
  const displayName = (data ? mitarbeiterName(data) : null) ?? data?.email ?? "";

  // ---- Render ----
  if (loading) {
    return (
      <div className="min-h-screen bg-muted">
        <PortalHeader user={user} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-credo-gruen" />
            <p className="text-sm text-muted-foreground">Lade Vorgangsdaten...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted">
        <PortalHeader user={user} />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <p className="mb-2 text-lg font-semibold text-foreground">Fehler</p>
            <p className="mb-4 text-sm text-muted-foreground">{error || "Vorgang nicht gefunden"}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Zurück zum Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      {/* ============================================= */}
      {/* Top Bar: Back + ID + Status + Type            */}
      {/* ============================================= */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          {/* Row 1: Back + ID + Status + Type */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Zurück</span>
            </button>

            <div className="h-5 w-px bg-border" />

            {data.displayId && (
              <span className="inline-flex rounded-md bg-muted px-3 py-1 font-mono text-sm font-bold text-foreground">
                {data.displayId}
              </span>
            )}

            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>

            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {data.questionnaireType}
            </span>

            {/* Je ein Chip pro Spur. Der Vorgangsstatus fasst seit Paket 1 nur
                noch zusammen; welche Seite wie weit ist, steht hier. */}
            <SpurenChips chips={spurenChips(data)} />

            {/* Status-Aktionen: Nur für SUPER_ADMIN / HR_LEITUNG */}
            {canReview && (
              <button
                onClick={handleReviewProcess}
                disabled={reviewingProcess}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                {reviewingProcess ? "Wird markiert..." : "Als geprüft markieren"}
              </button>
            )}
            {canComplete && (
              <button
                onClick={handleCompleteProcess}
                disabled={completingProcess}
                className={`${canReview ? "" : "ml-auto "}inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50`}
              >
                <CheckIcon className="h-3.5 w-3.5" />
                {completingProcess ? "Wird abgeschlossen..." : "Vorgang abschließen"}
              </button>
            )}

            {/* Fehlt der Knopf „Als geprüft markieren", stand bisher NICHTS da
                — HR sah nur eine Leerstelle. `pruefungNichtMoeglichGrund` ist
                dieselbe Quelle wie die Ablehnung im PATCH und deckt auch den
                abgelaufenen Vorgesetzten-Link samt Ausweg ab. Bei bereits
                geprueften Vorgaengen bleibt der Satz weg (Dauerrauschen). */}
            {isAdmin && !canReview && !istHrStatus(data.status) && (
              <p data-hinweis="pruefung-nicht-moeglich" className="ml-auto text-xs text-muted-foreground">
                {"ⓘ"} {pruefungNichtMoeglichGrund(data)}
              </p>
            )}
          </div>

          {/* Ablehnung einer Statusaktion — der Server nennt den Grund. */}
          {statusFehler && (
            <p role="alert" className="mt-2 text-xs font-medium text-destructive">
              {statusFehler}
            </p>
          )}

          {/* Row 2: Person info */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{displayName}</span>
            {displayName !== data.email && (
              <>
                <span className="text-border">&middot;</span>
                <span>{data.email}</span>
              </>
            )}
            <span className="text-border">&middot;</span>
            <span>
              {data.organization.name} ({data.organization.mandantNumber})
            </span>
            <span className="text-border">&middot;</span>
            <span>Eingeladen am {formatDate(data.invitedAt)}</span>
          </div>
        </div>
      </div>

      {/* ============================================= */}
      {/* Tab Navigation                                */}
      {/* ============================================= */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-reiter={tab.id}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-credo-gruen text-credo-gruen"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {/* Die Spur, nicht `isComplete`: Im Altfall „Zeitstempel ohne
                      isComplete" stand neben dem Kopf-Chip „✓ Fragebogen:
                      eingereicht" ein Reiter-Zaehler „4/9". */}
                  {tab.id === "questionnaire" && data.personalData && (
                    <span className={`ml-1.5 inline-flex h-5 w-auto min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      mitarbeiterAbgesendet(data)
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {mitarbeiterAbgesendet(data) ? "Komplett" : `${data.fragebogenFortschritt.position}/${data.fragebogenFortschritt.total}`}
                    </span>
                  )}
                  {tab.id === "documents" && data.documents.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {data.documents.length}
                    </span>
                  )}
                  {/* Stand der laufenden Nachforderung: „1 zu prüfen" vor
                      „Frist verstrichen" vor „x/y" (`unterlagenPille`, fertig
                      aus der Uebersicht). Ohne laufende keine Pille. Neben der
                      Anzahl der Dokumente waere „1/3" ohne Namen mehrdeutig —
                      deshalb „Nachforderung:" fuer Screenreader und im Tooltip
                      der Kurzstand. */}
                  {tab.id === "documents" && data.unterlagen?.pille && (
                    <span
                      data-pille="reiter"
                      data-farbe={data.unterlagen.pille.farbe}
                      title={`Nachforderung: ${data.unterlagen.kurzstand ?? data.unterlagen.pille.text}`}
                      className={`ml-1.5 inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-bold ${PILL_FARBEN[data.unterlagen.pille.farbe]}`}
                    >
                      <span className="sr-only">Nachforderung: </span>
                      {data.unterlagen.pille.text}
                    </span>
                  )}
                  {tab.id === "checklist" && checklistItems.length > 0 && (
                    <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      {checklistItems.filter((i) => i.isCompleted).length}/{checklistItems.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ============================================= */}
      {/* Tab Content                                   */}
      {/* ============================================= */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Ablauf-Warnbalken: bewusst VOR dem Tab-Inhalt und damit auf JEDEM
            Tab. Ein abgelaufener Aufenthaltstitel ist kein Dokumententhema,
            das sich wegklicken laesst, indem man auf den Reiter Uebersicht
            wechselt. */}
        <NachweisFristenWarnung
          documents={data.documents}
          onZuDenDokumenten={
            activeTab === "documents" ? null : () => setActiveTab("documents")
          }
          unterlagen={data.unterlagen}
          onNachfordern={darfBearbeiten ? nachfordern : null}
          onZurNachforderung={zurNachforderung}
        />

        {/* Ebenfalls auf JEDEM Tab und aus demselben Grund: Ein fehlender
            Masernschutz-Nachweis ist eine Meldepflicht des Arbeitgebers, keine
            Randnotiz des Dokumente-Reiters. Unter dem Fristenbalken, weil ein
            abgelaufener Titel die dringendere Lage ist als ein noch nicht
            eingetroffenes Papier. */}
        <OffeneNachweiseKasten
          data={data}
          onZuDenDokumenten={
            activeTab === "documents" ? null : () => setActiveTab("documents")
          }
          onNachfordern={darfBearbeiten ? nachfordern : null}
          onZurNachforderung={zurNachforderung}
        />

        {activeTab === "overview" && (
          <TabOverview
            data={data}
            appUrl={appUrl}
            supervisorEmail={supervisorEmail}
            setSupervisorEmail={setSupervisorEmail}
            generatingLink={generatingLink}
            generateSupervisorLink={generateSupervisorLink}
            linkResult={linkResult}
            linkMeldung={linkMeldung}
            notes={notes}
            newNote={newNote}
            setNewNote={setNewNote}
            savingNote={savingNote}
            addNote={addNote}
            setActiveTab={setActiveTab}
            oeffnePaketDialog={() => setPaketDialogOffen(true)}
            oeffneAbteilungenDialog={() => {
              setActiveTab("checklist");
              setAbteilungenDialogOffen(true);
            }}
            onboardingId={onboardingId}
            darfBearbeiten={HR_EDIT_ROLES.includes(user.role)}
          />
        )}
        {activeTab === "questionnaire" && (
          <TabFragebogenDaten
            data={data}
            onboardingId={onboardingId}
            canEdit={HR_EDIT_ROLES.includes(user.role)}
            onSaved={() => loadData()}
          />
        )}
        {activeTab === "documents" && (
          <TabDocuments
            data={data}
            onboardingId={onboardingId}
            canEdit={darfBearbeiten}
            onFristGeaendert={setzeDokumentFrist}
            paketDialogOffen={paketDialogOffen}
            setPaketDialogOffen={setPaketDialogOffen}
            onAktualisiert={() => loadData(true)}
            nachforderungDialog={nachforderungDialog}
            onNachfordern={nachfordern}
            onNachforderungSchliessen={() => setNachforderungDialog(null)}
            onNachforderungErfolg={nachforderungErfolg}
            unterlagenMeldung={unterlagenMeldung}
            onUnterlagenMeldungSchliessen={() => setUnterlagenMeldung(null)}
            karteSprung={karteSprung}
            onKarteSprungErledigt={karteSprungErledigt}
          />
        )}
        {activeTab === "checklist" && (
          <TabChecklist
            checklistItems={checklistItems}
            togglingItems={togglingItems}
            toggleChecklistItem={toggleChecklistItem}
            editingNoteId={editingNoteId}
            setEditingNoteId={setEditingNoteId}
            checklistNoteText={checklistNoteText}
            setChecklistNoteText={setChecklistNoteText}
            savingChecklistNote={savingChecklistNote}
            saveChecklistNote={saveChecklistNote}
            checklistFehler={checklistFehler}
            abteilungen={data.abteilungen}
            fuehrungskraft={data.fuehrungskraft}
            darfAbteilungsAktionen={HR_EDIT_ROLES.includes(user.role)}
            istAdmin={isAdmin}
            onAbteilungsAktion={abteilungsAktion}
            abteilungsMeldung={abteilungsMeldung}
            onAbteilungsMeldungSchliessen={() => setAbteilungsMeldung(null)}
            abteilungenDialogOffen={abteilungenDialogOffen}
            setAbteilungenDialogOffen={setAbteilungenDialogOffen}
          />
        )}
        {activeTab === "supervisor" && <TabSupervisor data={data} appUrl={appUrl} />}
      </main>
    </div>
  );
}

// =============================================
// Tab 1: Uebersicht
// =============================================

/** Exportiert fuer den Komponententest (Stepper-Schritt „Checkliste abarbeiten"). */
export function TabOverview({
  data,
  appUrl,
  supervisorEmail,
  setSupervisorEmail,
  generatingLink,
  generateSupervisorLink,
  linkResult,
  linkMeldung,
  notes,
  newNote,
  setNewNote,
  savingNote,
  addNote,
  onboardingId,
  setActiveTab,
  oeffnePaketDialog,
  oeffneAbteilungenDialog,
  darfBearbeiten,
}: {
  data: DetailData;
  appUrl: string;
  supervisorEmail: string;
  setSupervisorEmail: (v: string) => void;
  generatingLink: boolean;
  generateSupervisorLink: () => void;
  linkResult: string | null;
  /** Fehler oder Hinweis zum Vorgesetzten-Link (z. B. Mail nicht versendet). */
  linkMeldung: LinkMeldung | null;
  notes: NoteData[];
  newNote: string;
  setNewNote: (v: string) => void;
  savingNote: boolean;
  addNote: () => void;
  onboardingId: string;
  setActiveTab: (tab: TabId) => void;
  oeffnePaketDialog: () => void;
  /** Wechselt in den Tab Checkliste und oeffnet „Abteilungen informieren". */
  oeffneAbteilungenDialog: () => void;
  /**
   * `HR_EDIT_ROLES` — ohne dieses Recht zeigt die Uebersicht keine
   * schreibenden Knoepfe (Stepper und Karte „Vorgesetzten-Link"). Die Routen
   * lehnen mit 403 ab; ein Knopf, der nur diesen Fehler erzeugt, ist keiner.
   */
  darfBearbeiten: boolean;
}) {
  const fragebogenLink = `${appUrl}/fragebogen/${data.token}`;
  const modalitaetenLink = data.supervisorToken
    ? `${appUrl}/modalitaeten/${data.supervisorToken}`
    : null;

  const supervisorLinkExists = !!data.supervisorToken;

  // Neuer Vorgesetzten-Link: moeglich, solange die Modalitaeten offen sind und
  // HR den Vorgang nicht geprueft/abgeschlossen/abgelaufen gesetzt hat — genau
  // die Bedingungen, unter denen die Route einen Link ersetzt (sonst 409).
  // Angeboten wird er, wenn der alte abgelaufen ist oder HR eine andere
  // Adresse eintraegt (falscher Empfaenger). Frueher gab es bei vorhandenem
  // Link nur „Kopieren": Ein abgelaufener, nie benutzter Link sperrte den
  // Vorgang dauerhaft, weil `bereitZurPruefung` auf die Modalitaeten wartet.
  const linkAbgelaufen = vorgesetztenLinkAbgelaufen(data);
  const neuerLinkMoeglich =
    supervisorLinkExists && !vorgesetzteAbgesendet(data) && !istHrStatus(data.status);
  const andereAdresse =
    supervisorEmail.trim().toLowerCase() !== (data.supervisorEmail ?? "").trim().toLowerCase();
  const neuenLinkErzeugenAktiv =
    neuerLinkMoeglich && !!supervisorEmail.trim() && (linkAbgelaufen || andereAdresse);

  // Die Schritte selbst stehen rein und getestet in `./uebersicht-schritte`.
  // Sie lesen ausschliesslich die Spuren-Funktionen (`mitarbeiterAbgesendet`,
  // `vorgesetzteAbgesendet`, `bereitZurPruefung`) — die Modalitaeten-Spur
  // haengt dort an KEINER Stelle am Fragebogen.
  const workflowSteps = onboardingWorkflowSchritte(data, {
    darfBearbeiten,
    fragebogenLink,
    modalitaetenLink,
    supervisorAdresseEingetragen: !!supervisorEmail.trim(),
    linkWirdErzeugt: generatingLink,
    vorgesetztenLinkErzeugen: generateSupervisorLink,
    abteilungenInformieren: oeffneAbteilungenDialog,
    csvExport: () => {
      window.location.href = `/api/onboarding/${onboardingId}/export?format=csv`;
    },
    // Oeffnet denselben Dialog wie die Karte — und wechselt dorthin, damit
    // sichtbar bleibt, wo der Versand zuhause ist.
    dokumenteVersenden: () => {
      setActiveTab("documents");
      oeffnePaketDialog();
    },
  });

  // Speist die Karte „Status-Übersicht" — dieselbe Quelle wie die Chips im
  // Kopf der Seite (E10).
  const chips = spurenChips(data);

  return (
    <div className="space-y-6">
      {/* ===== WORKFLOW STEPPER ===== */}
      <ProcessWorkflowStepper steps={workflowSteps} />

      {/* 2-Column Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Person Card */}
          <Card title="Person">
            <FieldRow label="E-Mail" value={data.email} />
            <FieldRow label="Name" value={mitarbeiterName(data) ?? "\u2014"} />
            <FieldRow
              label="Einrichtung"
              value={`${data.organization.name} (${data.organization.mandantNumber})`}
            />
            <FieldRow label="Eingeladen am" value={formatDate(data.invitedAt)} />
            {data.submittedAt && <FieldRow label="Eingereicht am" value={formatDate(data.submittedAt)} />}
          </Card>

          {/* Personalfragebogen Card */}
          <Card title="Personalfragebogen">
            <FieldRow
              label="Status"
              value={
                // Die Spur, nicht `isComplete`: Im Altfall „Zeitstempel ohne
                // isComplete" stand hier „in Bearbeitung", waehrend Server und
                // Statuszeile „eingereicht" sagten.
                mitarbeiterAbgesendet(data)
                  ? data.submittedAt
                    ? `Eingereicht am ${formatDate(data.submittedAt)}`
                    : "Eingereicht"
                  : formatProgress(data.fragebogenFortschritt)
              }
            />
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Fragebogen-Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={fragebogenLink}
                  className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 font-mono text-xs text-foreground outline-none"
                />
                <CopyButton text={fragebogenLink} />
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Supervisor Link Card */}
          <Card title="Vorgesetzten-Link">
            {/* Ueber beiden Zweigen: Nach dem Erzeugen laedt die Seite neu und
                wechselt in den „Link vorhanden"-Zweig — ein Hinweis wie „E-Mail
                nicht versendet" muss dort noch zu sehen sein. */}
            {linkMeldung && (
              <p
                role={linkMeldung.art === "fehler" ? "alert" : "status"}
                className={`mb-3 rounded-md border px-3 py-2 text-xs ${
                  linkMeldung.art === "fehler"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {linkMeldung.text}
              </p>
            )}
            {data.supervisorToken ? (
              <div className="space-y-3">
                <FieldRow
                  label="Status"
                  value={
                    // `currentStep` ist ein 0-basierter INDEX — roh angezeigt
                    // stand hier „Schritt 0 von 5", waehrend die Fuehrungskraft
                    // „Schritt 1 / 5" sah. `modalitaetenFortschritt` rechnet um
                    // und kennt den Fall „noch nicht begonnen" wieder.
                    vorgesetzteAbgesendet(data)
                      ? data.supervisorSubmittedAt
                        ? `Eingereicht am ${formatDate(data.supervisorSubmittedAt)}`
                        : "Eingereicht"
                      : formatModalitaetenFortschritt(
                          modalitaetenFortschritt(data.supervisorData),
                        )
                  }
                />
                {data.supervisorEmail && <FieldRow label="E-Mail Vorgesetzter" value={data.supervisorEmail} />}
                {neuerLinkMoeglich && data.supervisorTokenExpiresAt && (
                  <FieldRow
                    label={linkAbgelaufen ? "Link abgelaufen am" : "Link gültig bis"}
                    value={formatDate(data.supervisorTokenExpiresAt)}
                  />
                )}
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Modalitaeten-Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={modalitaetenLink || ""}
                      className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 font-mono text-xs text-foreground outline-none"
                    />
                    {modalitaetenLink && <CopyButton text={modalitaetenLink} />}
                  </div>
                </div>
                {/* Neuer Link: bei abgelaufenem Link oder anderer Adresse. Die
                    Route ersetzt den Token; was die Fuehrungskraft schon
                    eingetragen hat, bleibt stehen. Nur mit Bearbeitungsrecht
                    (die Route verlangt HR_EDIT_ROLES). */}
                {neuerLinkMoeglich && darfBearbeiten && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className={`text-xs ${linkAbgelaufen ? "text-destructive" : "text-muted-foreground"}`}>
                      {linkAbgelaufen
                        ? "Der Link ist abgelaufen – die Führungskraft kann damit nichts mehr absenden. Erzeugen Sie einen neuen Link; bereits eingetragene Angaben bleiben erhalten."
                        : "Falscher Empfänger? Mit einer anderen Adresse wird ein neuer Link erzeugt, der bisherige wird damit ungültig."}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        aria-label="E-Mail der Führungskraft"
                        value={supervisorEmail}
                        onChange={(e) => setSupervisorEmail(e.target.value)}
                        placeholder="vorgesetzter@einrichtung.de"
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                        onKeyDown={(e) => e.key === "Enter" && neuenLinkErzeugenAktiv && generateSupervisorLink()}
                      />
                      <button
                        onClick={generateSupervisorLink}
                        disabled={generatingLink || !neuenLinkErzeugenAktiv}
                        className="shrink-0 rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
                      >
                        {generatingLink ? "..." : "Neuen Link erzeugen"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : !darfBearbeiten ? (
              // Ohne Bearbeitungsrecht nur der Stand — kein Formular, das beim
              // Absenden an der Rollenpruefung der Route scheitert.
              <p className="text-xs text-muted-foreground">
                Noch kein Vorgesetzten-Link generiert.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Noch kein Vorgesetzten-Link generiert. Geben Sie die E-Mail des Vorgesetzten ein.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={supervisorEmail}
                    onChange={(e) => setSupervisorEmail(e.target.value)}
                    placeholder="vorgesetzter@einrichtung.de"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                    onKeyDown={(e) => e.key === "Enter" && generateSupervisorLink()}
                  />
                  <button
                    onClick={generateSupervisorLink}
                    disabled={generatingLink || !supervisorEmail.trim()}
                    className="shrink-0 rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
                  >
                    {generatingLink ? "..." : "Generieren"}
                  </button>
                </div>
                {linkResult && (
                  <div className="rounded-md border border-credo-gruen/30 bg-credo-gruen/5 p-3">
                    <p className="mb-2 text-xs font-medium text-credo-gruen">Link erstellt!</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={linkResult}
                        className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 font-mono text-xs outline-none"
                      />
                      <CopyButton text={linkResult} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Quick Status Card */}
          <Card title="Status-Übersicht">
            <div className="grid grid-cols-2 gap-3">
              {/* DIESELBE Quelle wie die Chips im Kopf (`spurenChips`): Zwei
                  Rechnungen ueber denselben Stand liefen frueher auseinander —
                  die Karte kannte „Ausstehend", der Stepper „Schritt 1 von 5". */}
              <StatusMiniCard
                label="Fragebogen"
                value={chips[0].kurz}
                done={chips[0].ton === "fertig"}
              />
              <StatusMiniCard
                label="Vorgesetzter"
                value={chips[1].kurz}
                done={chips[1].ton === "fertig"}
              />
              {/* Mit laufender Nachforderung darunter ihr Kurzstand, fertig aus
                  der Uebersicht („1 von 3 angenommen · 1 zu prüfen · Frist …").
                  Dann ist die Karte auch nicht gruen: Es fehlt noch etwas. */}
              <StatusMiniCard
                label="Dokumente"
                value={`${data.documents.length} Datei${data.documents.length !== 1 ? "en" : ""}`}
                done={data.documents.length > 0 && !data.unterlagen?.laufend}
                zusatz={data.unterlagen?.kurzstand ? `Nachforderung: ${data.unterlagen.kurzstand}` : null}
              />
              <StatusMiniCard
                label="Checkliste"
                value={
                  data.checklistItems.length > 0
                    ? `${data.checklistItems.filter((i) => i.isCompleted).length}/${data.checklistItems.length}`
                    : "Keine"
                }
                done={
                  data.checklistItems.length > 0 &&
                  data.checklistItems.every((i) => i.isCompleted)
                }
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Notes Section */}
      <Card title="Notizen">
        {/* Add Note */}
        <div className="mb-4">
          <div className="flex gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Neue Notiz hinzufügen..."
              rows={2}
              className="min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
              }}
            />
            <button
              onClick={addNote}
              disabled={savingNote || !newNote.trim()}
              className="shrink-0 self-end rounded-md bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
            >
              {savingNote ? "..." : "Speichern"}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Strg+Enter zum Speichern</p>
        </div>

        {/* Note List */}
        {notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Noch keine Notizen vorhanden.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium">
                    {note.createdBy.firstName} {note.createdBy.lastName}
                  </span>
                  <span>&middot;</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Export Buttons */}
      <div className="flex gap-3">
        <a
          href={`/api/onboarding/${onboardingId}/export?format=csv`}
          download
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-[0.98]"
        >
          <DownloadIcon className="h-4 w-4 text-muted-foreground" />
          CSV Export
        </a>
        <a
          href={`/api/onboarding/${onboardingId}/export?format=json`}
          download
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-[0.98]"
        >
          <DownloadIcon className="h-4 w-4 text-muted-foreground" />
          JSON Export
        </a>
      </div>
    </div>
  );
}

// =============================================
// Tab: Fragebogen-Daten (alle Antworten)
// =============================================

const MARITAL_STATUS_LABELS: Record<string, string> = {
  ledig: "Ledig",
  verheiratet: "Verheiratet",
  geschieden: "Geschieden",
  verwitwet: "Verwitwet",
  eingetragene_lebenspartnerschaft: "Eingetragene Lebenspartnerschaft",
};

const TAX_CLASS_LABELS: Record<string, string> = {
  I: "Steuerklasse I",
  II: "Steuerklasse II",
  III: "Steuerklasse III",
  IV: "Steuerklasse IV",
  V: "Steuerklasse V",
  VI: "Steuerklasse VI",
};

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  gesetzlich: "Gesetzlich",
  privat: "Privat",
};

const SCHOOL_DEGREE_LABELS: Record<string, string> = {
  ohne_schulabschluss: "Ohne Schulabschluss",
  hauptschulabschluss: "Hauptschulabschluss",
  mittlere_reife: "Mittlere Reife / Realschulabschluss",
  abitur_fachabitur: "Abitur / Fachabitur",
  sonstiges: "Sonstiges",
};

const PROF_DEGREE_LABELS: Record<string, string> = {
  ohne_berufsausbildung: "Ohne Berufsausbildung",
  anerkannte_berufsausbildung: "Anerkannte Berufsausbildung",
  meister_techniker: "Meister / Techniker / Fachwirt",
  bachelor: "Bachelor",
  master_diplom: "Master / Diplom / Magister",
  promotion: "Promotion",
  sonstiges: "Sonstiges",
};

const RELIGION_LABELS: Record<string, string> = {
  ev: "Evangelisch",
  rk: "Roemisch-Katholisch",
  keine: "Keine / Konfessionslos",
  sonstige: "Sonstige",
};

/**
 * Antworten auf „Sind wir Ihr Haupt- oder Nebenarbeitgeber?" (Schritt 6).
 *
 * Der interne Wert der dritten Option heisst historisch `"nein"`, in der Maske
 * steht dort aber „Weiß ich nicht". Ohne diese Zuordnung stand hier der
 * Rohwert — die Sachbearbeitung las „nein" und damit das Gegenteil dessen,
 * was die Person angeklickt hat. Bitte den Wert NICHT umbenennen: In der
 * Datenbank stehen bereits Fragebogen mit `"nein"`, ein Umbenennen brauchte
 * eine Datenmigration und braechte nichts, was das Label hier nicht auch
 * loest. Dieselbe Tabelle steht in der Zusammenfassung des Fragebogens
 * (`src/app/fragebogen/[token]/steps/step10-summary.tsx`) — beide muessen
 * zusammen geaendert werden.
 */
const EMPLOYER_TYPE_LABELS: Record<string, string> = {
  hauptarbeitgeber: "Hauptarbeitgeber",
  nebenarbeitgeber: "Nebenarbeitgeber",
  nein: "Weiß ich nicht",
};

function TabFragebogenDaten({
  data,
  onboardingId,
  canEdit,
  onSaved,
}: {
  data: DetailData;
  onboardingId: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const pd = data.personalData;
  // Die Spur, nicht `personalData.isComplete`: Im Altfall „Zeitstempel ohne
  // isComplete" zeigte dieser Reiter „in Bearbeitung — Schritt 4 von 9" und
  // einen halben Balken, waehrend Kopf, Uebersicht und Server „eingereicht"
  // sagten.
  const abgesendet = mitarbeiterAbgesendet(data);
  const [showEdit, setShowEdit] = useState(false);

  if (!pd) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-lg font-semibold text-foreground">Noch keine Daten vorhanden</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Der Mitarbeiter hat den Fragebogen noch nicht begonnen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showEdit && (
        <EditPersonalDataModal
          onboardingId={onboardingId}
          personalData={pd as unknown as Record<string, unknown>}
          onClose={() => setShowEdit(false)}
          onSaved={onSaved}
        />
      )}
      {/* =============================================
          Erklaerung des Arbeitnehmers (Unterschriftsersatz)
          =============================================
          Steht bewusst weit oben: In einer Betriebspruefung ist das der
          Nachweis, dass der Beschaeftigte die Angaben bestaetigt hat.
          Gebunden an die SPUR: Der Altfall-Hinweis weiter unten („eingereicht,
          bevor das Portal Zeitpunkt, Ort und Pruefsumme festgehalten hat") gilt
          genau fuer Vorgaenge mit Zeitstempel ohne `isComplete` — an
          `pd.isComplete` gebunden war er nie zu sehen. */}
      {abgesendet && (
        <div
          className={`rounded-lg border p-4 ${
            pd.erklaerungAccepted
              ? "border-green-200 bg-green-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className="text-sm font-semibold text-foreground">
            Erklärung des Arbeitnehmers
          </p>
          {pd.erklaerungAccepted ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Bestätigt am{" "}
                {pd.erklaerungAcceptedAt
                  ? formatDateTime(pd.erklaerungAcceptedAt)
                  : "—"}
                {pd.erklaerungOrt ? ` in ${pd.erklaerungOrt}` : ""} — ersetzt die
                handschriftliche Unterschrift.
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Fassung des Wortlauts</dt>
                  <dd className="font-medium text-foreground">
                    {pd.erklaerungVersion ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">IP-Adresse</dt>
                  <dd className="font-medium text-foreground">
                    {pd.erklaerungIp ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:col-span-2">
                  <dt className="text-muted-foreground">Prüfsumme (SHA-256)</dt>
                  <dd
                    className="break-all font-mono text-[11px] font-medium text-foreground"
                    title={pd.erklaerungPruefsumme ?? undefined}
                  >
                    {pd.erklaerungPruefsumme ?? "—"}
                  </dd>
                </div>
                {pd.erklaerungUserAgent && (
                  <div className="flex justify-between gap-3 sm:col-span-2">
                    <dt className="shrink-0 text-muted-foreground">Browserkennung</dt>
                    <dd className="break-all text-right text-[11px] text-muted-foreground">
                      {pd.erklaerungUserAgent}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Die Prüfsumme bezieht sich auf die Angaben zum Zeitpunkt des
                Absendens. Wurden Felder danach über die Personalabteilung
                geändert, stimmt sie mit dem heutigen Stand nicht mehr überein —
                das ist gewollt und im Änderungsprotokoll nachvollziehbar.
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Für diesen Vorgang liegt keine gespeicherte Erklärung vor. Der
              Fragebogen wurde eingereicht, bevor das Portal Zeitpunkt, Ort und
              Prüfsumme festgehalten hat. Ein Nachweis wird nicht rückwirkend
              erzeugt.
            </p>
          )}
        </div>
      )}

      {/* Fortschrittsanzeige */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Fragebogen-Status: {abgesendet ? "Vollständig ausgefüllt" : `in Bearbeitung — ${formatProgress(data.fragebogenFortschritt)}`}
            </p>
            {pd.dsgvoAccepted && pd.dsgvoAcceptedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                DSGVO-Einwilligung erteilt am {formatDate(pd.dsgvoAcceptedAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Dokument-Erzeugung (Fuehrungszeugnis/Masernschutz) ist in den Dokumente-Tab (Hub) umgezogen. */}
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowEdit(true)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Daten bearbeiten
              </button>
            )}
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
              abgesendet ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}>
              {abgesendet ? "Komplett" : "In Bearbeitung"}
            </div>
          </div>
        </div>
        {/* Progress Bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-credo-gruen transition-all"
            style={{ width: `${abgesendet ? 100 : data.fragebogenFortschritt.prozent}%` }}
          />
        </div>
      </div>

      {/* Schritt 1: Persönliche Daten */}
      <SectionCard title="1. Persönliche Daten" icon="&#128100;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Anrede" value={pd.salutation || "\u2014"} />
          <FieldRow label="Titel" value={pd.title || "\u2014"} />
          <FieldRow label="Vorname" value={pd.firstName || "\u2014"} />
          <FieldRow label="Nachname" value={pd.lastName || "\u2014"} />
          <FieldRow label="Geburtsname" value={pd.birthName || "\u2014"} />
          <FieldRow label="Geburtsdatum" value={formatDate(pd.birthDate)} />
          <FieldRow label="Geburtsort" value={pd.birthPlace || "\u2014"} />
          <FieldRow label="Geburtsland" value={pd.birthCountry || "\u2014"} />
          <FieldRow label="Staatsangeh\u00f6rigkeit" value={pd.nationality || "\u2014"} />
          <FieldRow label="Familienstand" value={pd.maritalStatus ? (MARITAL_STATUS_LABELS[pd.maritalStatus] || pd.maritalStatus) : "\u2014"} />
          <FieldRow label="Schwerbehindert" value={formatBoolean(pd.severelyDisabled)} />
          {pd.severelyDisabled && <FieldRow label="Grad der Behinderung" value={formatNumber(pd.disabilityDegree, "%")} />}
        </div>
      </SectionCard>

      {/* Schritt 2: Adresse */}
      <SectionCard title="2. Adresse &amp; Kontakt" icon="&#127968;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Strasse" value={pd.street || "\u2014"} />
          <FieldRow label="Hausnummer" value={pd.houseNumber || "\u2014"} />
          <FieldRow label="PLZ" value={pd.zipCode || "\u2014"} />
          <FieldRow label="Ort" value={pd.city || "\u2014"} />
          <FieldRow label="Land" value={pd.country || "\u2014"} />
          <FieldRow label="Telefon (Festnetz)" value={pd.phone || "\u2014"} />
          <FieldRow label="Mobilnummer" value={pd.mobile || "\u2014"} />
          <FieldRow label="Private E-Mail" value={pd.emailPrivate || "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 3: Bankverbindung */}
      <SectionCard title="3. Bankverbindung" icon="&#127974;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Kontoinhaber" value={pd.accountHolder || "\u2014"} />
          <FieldRow label="IBAN" value={pd.iban || "\u2014"} />
          <FieldRow label="BIC" value={pd.bic || "\u2014"} />
          <FieldRow label="Bankname" value={pd.bankName || "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 4: Sozialversicherung */}
      <SectionCard title="4. Sozialversicherung" icon="&#128737;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="SV-Nummer" value={pd.socialSecurityNumber || "\u2014"} />
          <FieldRow label="Krankenkasse" value={pd.healthInsuranceName || "\u2014"} />
          <FieldRow label="Versicherungsart" value={pd.healthInsuranceType ? (INSURANCE_TYPE_LABELS[pd.healthInsuranceType] || pd.healthInsuranceType) : "\u2014"} />
          <FieldRow label="Kinder vorhanden" value={formatBoolean(pd.parentStatus)} />
        </div>
      </SectionCard>

      {/* Schritt 5: Steuer */}
      <SectionCard title="5. Steuerliche Angaben" icon="&#128196;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Steuer-ID" value={pd.taxId || "\u2014"} />
          <FieldRow label="Steuerklasse" value={pd.taxClass ? (TAX_CLASS_LABELS[pd.taxClass] || pd.taxClass) : "\u2014"} />
          <FieldRow label="J\u00e4hrlicher Freibetrag" value={pd.taxAllowance != null ? formatCurrency(pd.taxAllowance) : "\u2014"} />
          <FieldRow label="Kinderfreibetrag" value={pd.childAllowance != null ? formatCurrency(pd.childAllowance) : "\u2014"} />
          <FieldRow label="Konfession" value={pd.religion ? (RELIGION_LABELS[pd.religion] || pd.religion) : "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 6: Beschäftigung */}
      <SectionCard title="6. Weitere Beschäftigung" icon="&#128188;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="Status" value={pd.beschaeftigungsStatus ? statusLabel(pd.beschaeftigungsStatus) : "\u2014"} />
          {pd.beschaeftigungsStatusSonstige && (
            <FieldRow label="Und zwar" value={pd.beschaeftigungsStatusSonstige} />
          )}
          <FieldRow label="Bei der Agentur für Arbeit gemeldet" value={formatBoolean(pd.alsArbeitsuchendGemeldet ?? null)} />
          {pd.alsArbeitsuchendGemeldet && (
            <>
              <FieldRow label="Agentur" value={pd.agenturFuerArbeit || "\u2014"} />
              <FieldRow label="Mit Leistungsbezug" value={formatBoolean(pd.mitLeistungsbezug ?? null)} />
            </>
          )}
          <FieldRow label="Weitere Beschäftigungen" value={formatBoolean(pd.hasOtherEmployment)} />
          <FieldRow label="Arbeitgebertyp" value={pd.employerType ? (EMPLOYER_TYPE_LABELS[pd.employerType] || pd.employerType) : "\u2014"} />
          <FieldRow label="Summe über der Geringfügigkeitsgrenze" value={formatBoolean(pd.summeUeberGeringfuegigkeitsgrenze ?? null)} />
          <FieldRow label="Vorbeschäftigungen in diesem Jahr" value={formatBoolean(pd.vorbeschaeftigungenVorhanden ?? null)} />
          <FieldRow label="Tätigkeit im Ausland" value={formatBoolean(pd.auslandsbeschaeftigungVorhanden ?? null)} />
          {/* Altfelder: seit AP 6 nicht mehr erhoben, erscheinen nur noch
              bei alten Vorgängen. */}
          {pd.otherEmployerName && (
            <FieldRow label="Anderer Arbeitgeber (frühere Erfassung)" value={pd.otherEmployerName} />
          )}
          {pd.otherWeeklyHours != null && (
            <FieldRow label="Wochenstunden (frühere Erfassung)" value={formatNumber(pd.otherWeeklyHours, "Std.")} />
          )}
        </div>
      </SectionCard>

      {/* Schritt 7: Kinder */}
      <SectionCard title="7. Kinder" icon="&#128118;">
        {pd.children && pd.children.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Nr.</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Vorname</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Nachname</th>
                  <th className="pb-2 pr-4 text-xs font-semibold text-muted-foreground">Geburtsdatum</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Kinderfreibetrag</th>
                </tr>
              </thead>
              <tbody>
                {pd.children.map((child, idx) => (
                  <tr key={child.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-muted-foreground">{idx + 1}</td>
                    <td className="py-2 pr-4 font-medium text-foreground">{child.firstName}</td>
                    <td className="py-2 pr-4 text-foreground">{child.lastName || "\u2014"}</td>
                    <td className="py-2 pr-4 text-foreground">{formatDate(child.birthDate)}</td>
                    <td className="py-2 text-foreground">{child.taxAllowance ? "Ja" : "Nein"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Kinder angegeben.</p>
        )}
      </SectionCard>

      {/* Schritt 8: Bildung */}
      <SectionCard title="8. Bildungsabschluss" icon="&#127891;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="H\u00f6chster Schulabschluss" value={pd.highestSchoolDegree ? (SCHOOL_DEGREE_LABELS[pd.highestSchoolDegree] || pd.highestSchoolDegree) : "\u2014"} />
          <FieldRow label="H\u00f6chster Berufsabschluss" value={pd.highestProfessionalDegree ? (PROF_DEGREE_LABELS[pd.highestProfessionalDegree] || pd.highestProfessionalDegree) : "\u2014"} />
        </div>
      </SectionCard>

      {/* Schritt 9: Masernschutz */}
      <SectionCard title="9. Masernschutz" icon="&#128137;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {/* Aus dem Geburtsdatum gerechnet, nicht aus der gleichnamigen Spalte
              gelesen: Die Spalte wird beim Verlassen von Schritt 9 eingefroren
              und veraltet, sobald jemand das Geburtsdatum danach korrigiert —
              Begruendung in `nach1970GeborenAnzeige`. */}
          <FieldRow
            label="Nach dem 31.12.1970 geboren"
            value={formatBoolean(nach1970GeborenAnzeige(pd.birthDate, pd.bornAfter1971))}
          />
          <FieldRow label="Masernschutz nachgewiesen" value={formatBoolean(pd.masernschutzProvided)} />
        </div>
      </SectionCard>

      {/* Rentenversicherung: Entscheidung des Beschäftigten plus der
          Arbeitgeberteil des Antrags (Eingang, Wirkung, Fristen). Bewusst
          ohne Ziffer — die Nummern oben stammen aus der alten festen
          Schrittfolge, in der es diesen Schritt noch nicht gab. */}
      <RvFristenCard
        onboardingId={onboardingId}
        canEdit={canEdit}
        istMinijob={data.questionnaireType === "MINIJOB"}
      />

      {/* Schritt 10: DSGVO */}
      <SectionCard title="10. Datenschutz &amp; Einwilligung" icon="&#128274;">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <FieldRow label="DSGVO-Einwilligung" value={formatBoolean(pd.dsgvoAccepted)} />
          <FieldRow label="Einwilligung erteilt am" value={formatDate(pd.dsgvoAcceptedAt)} />
        </div>
      </SectionCard>
    </div>
  );
}

// Helper: Sensible Daten maskieren (IBAN, SV-Nr, Steuer-ID)
function maskSensitive(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
}

// Helper: Section Card mit Icon und Titel
function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span dangerouslySetInnerHTML={{ __html: icon }} />
          {title}
        </h3>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

// =============================================
// Tab 2: Dokumente
// =============================================

/**
 * Der Kasten „Offene Nachweise" — die einzige Stelle, an der HR ueberhaupt
 * erfaehrt, dass etwas fehlt.
 *
 * **Warum es ihn gibt.** Nachreichbare Pflichten (Masernschutz,
 * Aufenthaltstitel, Arbeitserlaubnis, PKV-Nachweis) halten das Absenden nicht
 * auf. Beim Masernschutz ist der Verzicht auf die Sperre ausdruecklich damit
 * begruendet, dass das Infektionsschutzgesetz vom Arbeitgeber die MELDUNG eines
 * fehlenden Nachweises ans Gesundheitsamt verlangt — und der Fragebogen sagt
 * der Person zu, die Personalabteilung fordere die Unterlage bei ihr an
 * (`NACHREICHEN_FOLGEN_HINWEIS`). Beides setzt voraus, dass HR die Luecke
 * sieht. Der Protokolleintrag `DOKUMENTE_NACHZUREICHEN` allein leistet das
 * nicht: Er steht unter /audit-log hinter einem zugeklappten JSON, und die
 * Vorgangsansicht hat gar keine Protokollanzeige.
 *
 * **Der Weg dazu (Paket 4).** Seit „Unterlagen nachfordern" fuehrt der Kasten
 * selbst dorthin: Je Nachweis steht der Stand der Nachforderung daneben
 * (`nachweisStandText`: „eingegangen, bitte prüfen", „angefordert am …, Frist
 * …"), und die Knoepfe „Unterlagen nachfordern…", „Ergänzen…" bzw. „Zur
 * Nachforderung" oeffnen den Dialog mit genau den offenen Arten vorangekreuzt
 * (ohne frueher als entfallen vermerkte — deren Stand nennt die Zeile) oder
 * springen zur Karte. Was geht, entscheidet `offeneNachweiseAktion`
 * (src/lib/unterlagen.ts) aus der Uebersicht des Servers; der Satz „Mit
 * „Unterlagen nachfordern“ …" steht nur, wo er sich befolgen laesst, sonst der
 * Grund (etwa ein eingestellter Vorgang) bzw. ohne Recht ein Satz ueber die
 * Personalabteilung (`nachforderungsSatz`). Er sagt nur zu, was der Knopf
 * ankreuzt: Sind Arten frueher als entfallen vermerkt, nennt er die Ausnahme;
 * sind es alle, gibt es keinen Knopf, und der Satz verweist auf die Karte. Die
 * Rechnung selbst bleibt, wie sie ist: Erst ein ANGENOMMENES Dokument raeumt
 * einen Nachweis ab.
 *
 * **Warum LIVE gerechnet und nicht aus dem Protokolleintrag gelesen.** Der
 * Eintrag ist eine Momentaufnahme des Abgabezeitpunkts und taugt genau dafuer:
 * als Nachweis dessen, was damals offen war. Als Arbeitsvorrat taugt er nicht,
 * gleich zweifach — Vorgaenge, die VOR seiner Einfuehrung abgesendet wurden,
 * haben keinen (darunter der gemeldete Masernschutz-Fall), und wird die
 * Unterlage eine Woche spaeter hochgeladen, behauptet er weiter eine Luecke.
 * Die Rechnung hier stimmt fuer Bestandsakten mit und wird still, sobald das
 * Papier da ist.
 *
 * **Dieselben Funktionen wie Formular und Absendezweig** — keine zweite Regel:
 * `pflichtEingabenAusVorgang` baut die Eingaben (der Absendezweig nutzt
 * dieselbe Funktion), `offeneNachweise` rechnet daraus die Luecken. Ein
 * Nachbau liefe frueher oder spaeter auseinander, und dann mahnt HR etwas an,
 * das niemand verlangt hat.
 *
 * **Die zweite Haelfte: Nachweise ohne Ablaufdatum.** Der vorgangsweite
 * Warnbalken laesst diesen Fall bewusst aus (siehe `dringendeNachweisLagen`),
 * und der naechtliche Cron sieht solche Dokumente nie — er filtert auf
 * `gueltigBis: { not: null }`. Ein befristeter Aufenthaltstitel ohne erfasstes
 * Datum liefe damit ab, ohne dass irgendwer etwas erfaehrt. Der Kasten fragt
 * deshalb nach, er warnt nicht: Bei einer unbefristeten Niederlassungserlaubnis
 * gibt es kein Datum, und ein Vorwurf, den niemand ausraeumen kann, wird nach
 * zwei Wochen ignoriert. Ausraeumen laesst er sich seit Paket 4 (Z1): Ein
 * Dokument mit dem Kennzeichen `unbefristet` erscheint hier nicht mehr.
 * Setzen laesst es sich beim Annehmen einer nachgeforderten Unterlage und mit
 * dem Knopf „Unbefristet" an der Dokumentenzeile (`AblaufAbzeichen`) — auf den
 * der Satz im Kasten verweist.
 *
 * Erst ab Abgabe — und zwar BEIDE Haelften: Solange der Fragebogen offen ist,
 * laedt die Person selbst hoch, wird im Formular je Unterlage angemahnt und
 * bekommt das Ablaufdatum dort direkt neben der Datei abgefragt. Vorher zu
 * mahnen hiesse, HR hinter jemandem hertelefonieren zu lassen, der gerade in
 * Schritt 3 sitzt. Das Tor ist `nachweiseAbgegeben` (onboarding-spuren.ts):
 * die eigene Spur der Person, dazu REVIEWED und COMPLETED fuer Bestandsakten
 * ohne Zeitstempel — dort steht auch, warum die Link-Status NICHT zaehlen.
 */
export function OffeneNachweiseKasten({
  data,
  onZuDenDokumenten,
  onNachfordern = null,
  onZurNachforderung = null,
}: {
  data: DetailData;
  onZuDenDokumenten: (() => void) | null;
  /**
   * Oeffnet den Dialog „Unterlagen nachfordern…" bzw. „Unterlagen ergänzen…"
   * mit den offenen Arten vorangekreuzt (und wechselt dafuer in den Reiter
   * „Dokumente"). Nur mit `HR_EDIT_ROLES`, sonst `null` — dann zeigt der Kasten
   * keinen schreibenden Knopf. Optional, damit Einbauten ohne Nachforderung
   * unveraendert bleiben.
   */
  onNachfordern?: ((anfrage: NachforderungDialogAnfrage) => void) | null;
  /** Zur Karte der laufenden Nachforderung im Reiter „Dokumente". */
  onZurNachforderung?: (() => void) | null;
}) {
  const pd = data.personalData;
  const abgegeben = nachweiseAbgegeben(data);

  const offen = abgegeben
    ? offeneNachweise(
        pflichtEingabenAusVorgang({
          required: data.requiredDocuments,
          anzahlKinder: pd?.children.length ?? 0,
          organisationstyp: data.organization.type,
          personalData: pd,
        }),
        data.documents.map((d) => d.type),
      )
    : [];

  // `nachweisLagen` gruppiert je Nachweisart und liefert `ampel: null` genau
  // dann, wenn fuer diese Art ueberhaupt kein Ablaufdatum erfasst ist — ein
  // nachgereichtes Papier MIT Datum raeumt die Nachfrage also ab. Ebenso ein
  // ausdruecklich unbefristetes (Paket 4, Z1): Dessen Lage traegt zwar auch
  // `ampel: null`, dazu aber `unbefristet` — nachzufragen gibt es da nichts.
  //
  // `abgegeben` gilt hier GENAUSO wie fuer die Liste darueber. Vorher lief
  // diese Haelfte ungebremst: Wer in Schritt 3 seinen Aufenthaltstitel ohne
  // Datum hochlud, loeste den Kasten auf JEDEM Reiter der HR-Ansicht aus —
  // waehrend das Formular ihn selbst gerade nach dem Datum fragt. Genau davor
  // warnt der Absatz „Erst ab Abgabe" im Kopf dieser Komponente.
  const ohneFrist = abgegeben
    ? nachweisLagen(data.documents)
        .filter((l) => l.ampel === null && !l.unbefristet)
        .map((l) => l.typ)
    : [];

  if (offen.length === 0 && ohneFrist.length === 0) return null;

  const unterlagen = data.unterlagen ?? null;
  const aktion = offeneNachweiseAktion(offen, unterlagen);
  // Mit Recht heisst: Die Seite reicht den Rueckruf (HR_EDIT_ROLES) UND die
  // Uebersicht des Servers sagt dasselbe.
  const mitRecht = !!onNachfordern && !!unterlagen?.darfAktionen;
  const anfrage = mitRecht ? aktion.anfrage : null;
  const zurKarte = onZurNachforderung && aktion.zurNachforderung ? onZurNachforderung : null;
  // Als entfallen vermerkte Arten kreuzt kein Knopf an — frueher entfallene
  // nicht (dieselbe Regel wie im Dialog), in der laufenden entfallene nicht,
  // weil sie dort schon stehen. Der Satz sagt das, statt „genau diese
  // Nachweise" zuzusagen.
  const entfallen = offen.filter((typ) => alsEntfallenVermerkt(typ, unterlagen)).length;
  const wegSatz = nachforderungsSatz(aktion, mitRecht, {
    aufforderung:
      entfallen === 0
        ? NACHFORDERN_SAETZE.KASTEN
        : entfallen < offen.length
          ? NACHFORDERN_SAETZE.KASTEN_TEILS_ENTFALLEN
          : NACHFORDERN_SAETZE.KASTEN_ALLE_ENTFALLEN,
    ohneRecht: NACHFORDERN_SAETZE.KASTEN_OHNE_RECHT,
  });

  return (
    <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" data-kasten="offene-nachweise">
      <p className="text-sm font-bold text-amber-800">Offene Nachweise</p>

      {offen.length > 0 && (
        <>
          <p className="mt-2 text-sm text-foreground" data-zeile="kasten-satz">
            Diese Pflichtunterlagen durften nachgereicht werden und liegen bis
            heute nicht vor.{wegSatz && ` ${wegSatz}`}
          </p>
          <ul className="mt-2 space-y-1">
            {/* Je Nachweis der Stand der Nachforderung, fertig aus der
                Uebersicht (P:1285) — die Bezeichnung in einem eigenen Element,
                der Zusatz daneben. */}
            {offen.map((typ) => {
              const stand = nachweisStandText(typ, unterlagen);
              return (
                <li key={typ} className="text-sm text-foreground" data-nachweis={typ}>
                  <span className="font-semibold">{documentTypeLabel(typ)}</span>
                  {stand && <span className="text-amber-900" data-zeile="stand">{` — ${stand}`}</span>}
                </li>
              );
            })}
          </ul>
          {offen.includes("MASERNSCHUTZ") && (
            <p className="mt-2 text-sm text-foreground">
              Bleibt der Masernschutz-Nachweis dauerhaft aus, muss die
              Personalabteilung das dem Gesundheitsamt melden — das
              Infektionsschutzgesetz verlangt die Meldung, nicht das Anhalten
              des Vorgangs.
            </p>
          )}
        </>
      )}

      {ohneFrist.length > 0 && (
        <>
          <p className={`text-sm text-foreground ${offen.length > 0 ? "mt-4" : "mt-2"}`}>
            Für diese Nachweise ist kein Ablaufdatum erfasst. Sie werden damit
            nicht überwacht — weder der Warnbalken noch die nächtliche
            Erinnerung erfassen sie. Ist der Nachweis unbefristet (etwa eine
            Niederlassungserlaubnis), klicken Sie an der Unterlage im Reiter
            „Dokumente“ auf „Unbefristet“; ist er befristet, tragen Sie dort
            das Ablaufdatum nach.
          </p>
          <ul className="mt-2 space-y-1">
            {ohneFrist.map((typ) => (
              <li key={typ} className="text-sm font-semibold text-foreground">
                {documentTypeLabel(typ)}
              </li>
            ))}
          </ul>
        </>
      )}

      {(anfrage || zurKarte || onZuDenDokumenten) && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-block="kasten-knoepfe">
          {anfrage && (
            <button
              type="button"
              onClick={() => onNachfordern?.(anfrage)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-credo-blau px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-credo-blau/90"
            >
              {anfrage.modus === "ergaenzen" ? "Ergänzen…" : "Unterlagen nachfordern…"}
            </button>
          )}
          {zurKarte && (
            <button
              type="button"
              onClick={zurKarte}
              className="inline-flex items-center gap-1.5 rounded-lg border border-credo-gelb bg-credo-gelb/20 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-credo-gelb/30"
            >
              Zur Nachforderung
            </button>
          )}
          {onZuDenDokumenten && (
            <button
              type="button"
              onClick={onZuDenDokumenten}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Zu den Dokumenten
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Die Arten fuer „Verlängerten Nachweis anfordern…" am Warnbalken: die
 * abgelaufenen bzw. bald ablaufenden, beim Aufenthaltstitel dazu die
 * Arbeitserlaubnis — die Pflichtregel verlangt beide (required-documents.ts),
 * und meist steht die Erlaubnis auf dem Titel selbst (N4: dieselbe Karte zu
 * beiden Positionen, oder HR quittiert mit „Entfällt…"). Eine Regel des
 * Onboardings, deshalb hier und nicht im modulneutralen unterlagen.ts
 * (Feinplanung 2.1); ob und wie der Knopf erscheint, sagt `warnbalkenAktion`.
 * Rein, exportiert fuer den Test.
 */
export function verlaengerungVorauswahl(dringendeTypen: readonly string[]): string[] {
  const typen = Array.from(new Set(dringendeTypen));
  if (typen.includes("AUFENTHALTSTITEL") && !typen.includes("ARBEITSERLAUBNIS")) typen.push("ARBEITSERLAUBNIS");
  return typen;
}

/** Die Saetze von Kasten und Warnbalken zum Weg ueber „Unterlagen nachfordern" (P:1285). */
const NACHFORDERN_SAETZE = {
  KASTEN: "Mit „Unterlagen nachfordern“ schicken Sie der Person einen Link, über den sie genau diese Nachweise hochlädt.",
  // Als entfallen vermerkte Arten kreuzt kein Knopf an (`alsEntfallenVermerkt`,
  // frueher oder in der laufenden); „genau diese" stimmte dann nicht mehr.
  KASTEN_TEILS_ENTFALLEN:
    "Mit „Unterlagen nachfordern“ schicken Sie der Person einen Link, über den sie diese Nachweise hochlädt – außer den als entfallen vermerkten; die lassen sich im Dialog bei Bedarf dazunehmen.",
  // Alle so vermerkt: Der Kasten hat keinen Knopf (nichts vorzukreuzen), der
  // Weg fuehrt ueber die Karte — ohne laufende „Unterlagen nachfordern…", mit
  // laufender „Unterlagen ergänzen…".
  // Ohne „früheren": Auch eine in der LAUFENDEN Nachforderung entfallene Art
  // zaehlt; die Zeile darunter nennt je Art, wann sie vermerkt wurde.
  KASTEN_ALLE_ENTFALLEN:
    "Laut Nachforderung sind sie als entfallen vermerkt; werden sie doch gebraucht, fordern Sie sie in der Karte „Unterlagen nachfordern“ im Reiter „Dokumente“ wieder an.",
  KASTEN_OHNE_RECHT: "Die Personalabteilung kann sie über „Unterlagen nachfordern“ bei der Person anfordern.",
  // „Annehmen" allein genuegt nicht: Ohne Datum verdraengt der neue Nachweis
  // den abgelaufenen nie (`nachweisLagen`, Z1 „Datum später nachtragen").
  BALKEN:
    "Fordern Sie den verlängerten Nachweis bei der Person an und nehmen Sie ihn mit seinem Ablaufdatum oder als unbefristet an – ohne Datum bleibt der abgelaufene Nachweis maßgeblich und diese Warnung stehen.",
  BALKEN_OHNE_RECHT:
    "Die Personalabteilung kann den verlängerten Nachweis über „Unterlagen nachfordern“ bei der Person anfordern.",
} as const;

/**
 * Welcher Satz zum Weg ueber die Nachforderung dasteht — nur einer, der sich
 * befolgen laesst:
 * - mit Recht und moeglich (oder eine Nachforderung laeuft): die Aufforderung;
 * - mit Recht, aber gesperrt (etwa ein eingestellter Vorgang): der Grund des
 *   Servers statt einer Aufforderung ohne Knopf;
 * - ohne Recht: ein Satz ueber die Personalabteilung — ausser es laeuft schon
 *   eine, dann sprechen die Zeilen selbst („angefordert am …").
 * Bei einer laufenden Nachforderung eines eingestellten Vorgangs steht keiner;
 * warum, sagt die Karte hinter „Zur Nachforderung" (`eingestelltHinweis`).
 */
function nachforderungsSatz(
  aktion: NachweisAktion,
  mitRecht: boolean,
  saetze: { aufforderung: string; ohneRecht: string },
): string | null {
  if (!mitRecht) return aktion.zurNachforderung ? null : saetze.ohneRecht;
  if (aktion.aufforderung) return saetze.aufforderung;
  return aktion.grund;
}

/**
 * Der Warnbalken am Vorgang.
 *
 * Bewusst NUR bei „abgelaufen" und „kritisch" (14 Tage) — welche Lagen das sind,
 * entscheidet `dringendeNachweisLagen` in `src/lib/dokument-fristen.ts`; dort
 * steht auch, warum „kein Ablaufdatum erfasst" NICHT dazugehoert (die
 * unbefristete Niederlassungserlaubnis ist der Regelfall, nicht das Versaeumnis)
 * und warum BEOBACHTEN/WARNUNG an der Dokumentenzeile bleiben.
 *
 * Und er sperrt nichts (Entscheidung des Nutzers): Ein abgelaufener Titel ist
 * ein Problem der BESCHAEFTIGUNG, nicht der Aktenfuehrung. Wer hier den Vorgang
 * dichtmacht, hindert HR genau an der Arbeit, mit der das Problem behoben wird.
 *
 * Seit Paket 4 bietet er den Weg dazu an: „Verlängerten Nachweis anfordern…"
 * oeffnet den Dialog mit genau den betroffenen Arten vorangekreuzt
 * (`verlaengerungVorauswahl`, `warnbalkenAktion`; offene Nachweise stehen
 * darunter, nicht angekreuzt), mit laufender Nachforderung dazu „Zur
 * Nachforderung". Nimmt HR den neuen Nachweis MIT Datum oder als unbefristet
 * an, endet die Warnung von selbst — `nachweisLagen` nimmt das spaeteste Datum
 * bzw. ein unbefristetes Dokument; ohne Datum bleibt der alte Titel
 * massgeblich, und genau das sagt der Satz. Wie im Kasten steht die
 * Aufforderung nur, wo sie sich befolgen laesst (`nachforderungsSatz`).
 *
 * Exportiert fuer den Komponententest.
 */
export function NachweisFristenWarnung({
  documents,
  onZuDenDokumenten,
  unterlagen = null,
  onNachfordern = null,
  onZurNachforderung = null,
}: {
  documents: DocumentData[];
  onZuDenDokumenten: (() => void) | null;
  /** `unterlagen` aus GET /api/onboarding/[id] (Paket 4). */
  unterlagen?: UnterlagenUebersicht | null;
  /** Oeffnet den Dialog; nur mit `HR_EDIT_ROLES`, sonst `null`. */
  onNachfordern?: ((anfrage: NachforderungDialogAnfrage) => void) | null;
  /** Zur Karte der laufenden Nachforderung im Reiter „Dokumente". */
  onZurNachforderung?: (() => void) | null;
}) {
  const lagen = dringendeNachweisLagen(documents);
  if (lagen.length === 0) return null;

  const aktion = warnbalkenAktion(
    verlaengerungVorauswahl(lagen.map((l) => l.typ)),
    unterlagen,
  );
  const mitRecht = !!onNachfordern && !!unterlagen?.darfAktionen;
  const anfrage = mitRecht ? aktion.anfrage : null;
  const zurKarte = onZurNachforderung && aktion.zurNachforderung ? onZurNachforderung : null;
  const wegSatz = nachforderungsSatz(aktion, mitRecht, {
    aufforderung: NACHFORDERN_SAETZE.BALKEN,
    ohneRecht: NACHFORDERN_SAETZE.BALKEN_OHNE_RECHT,
  });
  // „Bleibt bedienbar" nur vor einem Weg — nicht vor dem Grund, warum es
  // keinen gibt (etwa ein eingestellter Vorgang).
  const gesperrt = mitRecht && !aktion.aufforderung;
  const balkenSatz = wegSatz && !gesperrt ? `Der Vorgang bleibt bedienbar. ${wegSatz}` : wegSatz;

  const abgelaufen = lagen.some((l) => l.ampel?.kategorie === "ABGELAUFEN");

  const rahmen = abgelaufen
    ? "border-credo-rot/40 bg-credo-rot/5"
    : "border-amber-300 bg-amber-50";
  const ueberschrift = abgelaufen
    ? "⚠ Nachweis abgelaufen"
    : "Nachweis läuft in Kürze ab";
  const titelFarbe = abgelaufen ? "text-credo-rot" : "text-amber-800";

  return (
    <div className={`mb-6 rounded-2xl border-2 p-4 ${rahmen}`} data-kasten="nachweis-fristen">
      <p className={`text-sm font-bold ${titelFarbe}`}>{ueberschrift}</p>
      <ul className="mt-2 space-y-1">
        {lagen.map((l) => (
          <li key={l.typ} className="text-sm text-foreground">
            <span className="font-semibold">{documentTypeLabel(l.typ)}:</span>{" "}
            {l.ampel?.text}
          </li>
        ))}
      </ul>
      {abgelaufen && (
        <p className="mt-2 text-sm text-foreground" data-zeile="balken-satz">
          Eine Beschäftigung ohne gültigen Aufenthaltstitel ist für den Arbeitgeber
          bußgeldbewehrt (§ 404 SGB III, § 98 AufenthG).{balkenSatz && ` ${balkenSatz}`}
        </p>
      )}
      {(anfrage || zurKarte || onZuDenDokumenten) && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-block="warnbalken-knoepfe">
          {anfrage && (
            <button
              type="button"
              onClick={() => onNachfordern?.(anfrage)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-credo-blau px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-credo-blau/90"
            >
              Verlängerten Nachweis anfordern…
            </button>
          )}
          {zurKarte && (
            <button
              type="button"
              onClick={zurKarte}
              className="inline-flex items-center gap-1.5 rounded-lg border border-credo-gelb bg-credo-gelb/20 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-credo-gelb/30"
            >
              Zur Nachforderung
            </button>
          )}
          {onZuDenDokumenten && (
            <button
              type="button"
              onClick={onZuDenDokumenten}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              Zu den Dokumenten
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Das Abzeichen an der Dokumentenzeile — Stufe, Klartext und das Ablaufdatum
 * selbst.
 *
 * Gestaltung wie die Vertragsende-Ampel (`contract-end-config.tsx`): rundes
 * Abzeichen, Farben aus dem Meta-Objekt als Inline-Stil, weil sie samt
 * Hintergrund aus der Fristenrechnung kommen und nicht aus Tailwind.
 *
 * Anders als dort bekommt auch die harmloseste Stufe ein Abzeichen: Bei einem
 * Vertragsende ist „noch weit weg" die Abwesenheit einer Aufgabe, hier ist es
 * die Auskunft „dieses Papier gilt bis ..." — genau die Auskunft, wegen der
 * jemand den Vorgang oeffnet.
 *
 * **Warum hier auch geschrieben wird.** Der Satz „andernfalls bitte das
 * Ablaufdatum nachtragen" stand hier, bevor es einen Weg dafuer gab:
 * Geschrieben werden konnte `gueltigBis` nur ueber den Magic Link der
 * beschaeftigten Person, und der ist mit dem Absenden des Fragebogens tot. Eine
 * Aufforderung ohne Schaltflaeche ist keine Aufforderung, sondern ein Vorwurf —
 * deshalb sitzt das Eingabefeld jetzt an derselben Stelle wie der Satz.
 *
 * **„Unbefristet" (Paket 4, Z1).** Der Knopf setzt das Kennzeichen
 * (`{ gueltigBis: null, unbefristet: true }`) statt nur das Datum zu leeren —
 * sonst bliebe ein alter, befristeter Titel maßgeblich, und Warnbalken und
 * Erinnerungen liefen weiter. Er steht auch ohne gespeichertes Datum da (der
 * haeufigste Fall: die Niederlassungserlaubnis kam ohne Datum), und ein so
 * gekennzeichnetes Dokument zeigt „Unbefristet" statt „Keine Frist
 * hinterlegt". Ein Datum nimmt das Kennzeichen zurueck (der Server setzt es
 * dann auf false).
 *
 * Exportiert fuer den Komponententest (Status nach einer Fristkorrektur).
 */
export function AblaufAbzeichen({
  doc,
  onboardingId,
  canEdit,
  onFristGeaendert,
}: {
  doc: DocumentData;
  onboardingId: string;
  canEdit: boolean;
  onFristGeaendert: (docId: string, aenderung: FristAenderung) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");
  // Nach dem Speichern verschwindet der geklickte Knopf (der Editor schliesst,
  // „Unbefristet" wechselt die Darstellung) — ohne Ziel laege der Fokus auf
  // `body`. Er geht auf den Einstieg der neuen Darstellung: „Ändern" bzw.
  // „Ablaufdatum nachtragen". Gesetzt erst, wenn die Seite das neue Dokument
  // gerendert hat (Effekt ohne Abhaengigkeiten, der Merker haelt ihn still).
  const einstiegRef = useRef<HTMLButtonElement>(null);
  const fokusNachSpeichern = useRef(false);
  useEffect(() => {
    if (!fokusNachSpeichern.current || offen || !einstiegRef.current) return;
    fokusNachSpeichern.current = false;
    einstiegRef.current.focus();
  });

  // `ablaufKalendertag` und nicht `slice(0, 10)`: Die Spalte ist `@db.Date` und
  // kommt als Mitternacht UTC herein; jede eigene Umrechnung waere die naechste
  // Gelegenheit fuer den Zeitzonenfehler, gegen den dieses Modul gebaut ist.
  const gespeicherterTag = ablaufKalendertag(doc.gueltigBis) ?? "";

  const oeffne = () => {
    setEingabe(gespeicherterTag);
    setFehler("");
    setOffen(true);
  };

  // Zwei Formen: ein Datum (`{ gueltigBis: "JJJJ-MM-TT" }`) oder das
  // Kennzeichen (`{ gueltigBis: null, unbefristet: true }`). Beides zugleich
  // weist der Server als Widerspruch ab.
  const speichere = async (anfrage: { gueltigBis: string } | { gueltigBis: null; unbefristet: true }) => {
    setSpeichert(true);
    setFehler("");
    try {
      const res = await fetch(
        `/api/onboarding/${onboardingId}/documents/${doc.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(anfrage),
        }
      );
      const koerper = await res.json().catch(() => null);
      if (!res.ok) {
        setFehler(
          koerper && typeof koerper.error === "string"
            ? koerper.error
            : "Das Ablaufdatum konnte nicht gespeichert werden."
        );
        return;
      }
      // Den Status aus der Antwort mitnehmen: Eine korrigierte Frist nimmt
      // EXPIRED zurueck, und das Abzeichen „Abgelaufen" soll nicht bis zum
      // Neuladen neben der gruenen Ampel stehen bleiben.
      onFristGeaendert(doc.id, {
        gueltigBis:
          koerper && typeof koerper.gueltigBis === "string"
            ? koerper.gueltigBis
            : null,
        status:
          koerper && typeof koerper.status === "string"
            ? koerper.status
            : undefined,
        unbefristet:
          koerper && typeof koerper.unbefristet === "boolean"
            ? koerper.unbefristet
            : undefined,
      });
      fokusNachSpeichern.current = true;
      setOffen(false);
    } catch {
      setFehler("Verbindungsfehler beim Speichern des Ablaufdatums.");
    } finally {
      setSpeichert(false);
    }
  };

  if (!istFristpflichtig(doc.type)) return null;

  const ampel = ablaufAmpel(doc.gueltigBis);

  const unbefristetKnopf = (klassen: string) => (
    <button
      type="button"
      disabled={speichert}
      onClick={() => speichere({ gueltigBis: null, unbefristet: true })}
      className={klassen}
      title="Der Nachweis gilt unbefristet (etwa eine Niederlassungserlaubnis)"
    >
      Unbefristet
    </button>
  );

  // Dieselbe Eingabezeile fuer beide Faelle — „noch keins" und „falsches".
  // Ein eigener Weg je Fall waere eine zweite Stelle, an der dieselbe Regel
  // steht.
  const editor = offen ? (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label={`Ablaufdatum für ${documentTypeLabel(doc.type)}`}
          value={eingabe}
          onChange={(e) => setEingabe(e.target.value)}
          className="rounded-lg border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          disabled={speichert || eingabe === ""}
          onClick={() => speichere({ gueltigBis: eingabe })}
          className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {speichert ? "Wird gespeichert..." : "Speichern"}
        </button>
        {/* Das Datum entfernen gibt es NUR hier, nicht ueber den Magic Link:
            Ein faelschlich eingetragenes Datum an einer unbefristeten
            Niederlassungserlaubnis waere sonst nicht mehr wegzubekommen. Seit
            Z1 setzt der Knopf dabei das Kennzeichen — auch ohne gespeichertes
            Datum. Jede Aenderung steht im Protokoll. */}
        {!doc.unbefristet && unbefristetKnopf("rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50")}
        <button
          type="button"
          disabled={speichert}
          onClick={() => setOffen(false)}
          className="text-[11px] text-muted-foreground underline underline-offset-2 disabled:opacity-50"
        >
          Abbrechen
        </button>
      </div>
      {fehler && (
        <p role="alert" className="mt-1 text-[11px] text-credo-rot">
          {fehler}
        </p>
      )}
    </div>
  ) : null;

  // Ausdruecklich unbefristet (Z1): kein Vorwurf, keine Nachfrage — die
  // Auskunft selbst. „Ändern" bleibt: Ein Verklicken muss sich mit einem Datum
  // zuruecknehmen lassen (das nimmt das Kennzeichen zurueck).
  if (doc.unbefristet) {
    return (
      <div className="mb-3" data-ablauf="unbefristet">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-semibold text-foreground">
            Unbefristet
          </span>
          <span className="text-[11px] text-muted-foreground">
            Kein Ablaufdatum – der Nachweis gilt unbefristet.
          </span>
          {canEdit && !offen && (
            <button
              ref={einstiegRef}
              type="button"
              onClick={oeffne}
              className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Ändern
            </button>
          )}
        </div>
        {editor}
      </div>
    );
  }

  // Kein Datum ist kein Fehler (der Titel kann unbefristet sein, das Feld kann
  // schlicht noch leer sein) — aber es muss sichtbar sein. Sonst liest HR die
  // schweigende Ampel als „alles in Ordnung", obwohl gar nichts geprueft wird.
  //
  // Hier und NUR hier: Der vorgangsweite Balken laesst diesen Fall bewusst aus
  // (siehe `dringendeNachweisLagen`). Deshalb muss der Satz an dieser Stelle
  // beide Lesarten offenhalten — und seit Z1 fuer beide einen Knopf anbieten:
  // „Ablaufdatum nachtragen" und „Unbefristet".
  if (!ampel.kategorie) {
    return (
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5" data-ablauf="ohne-frist">
        <p className="text-[11px] font-semibold text-amber-800">Keine Frist hinterlegt</p>
        <p className="text-[11px] text-amber-900">
          Kein Ablaufdatum erfasst — dieser Nachweis wird nicht überwacht. Ist
          der Nachweis unbefristet (etwa eine Niederlassungserlaubnis), klicken
          Sie auf „Unbefristet“; andernfalls tragen Sie das Ablaufdatum bitte
          hier nach.
        </p>
        {canEdit &&
          (editor ?? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                ref={einstiegRef}
                type="button"
                onClick={oeffne}
                className="rounded-lg border border-amber-600 px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
              >
                Ablaufdatum nachtragen
              </button>
              {unbefristetKnopf(
                "rounded-lg border border-amber-600 px-2 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50",
              )}
            </div>
          ))}
        {/* Ohne offenen Editor steht ein Fehler des direkten Knopfs sonst
            nirgends — als Alarm, denn der Fokus liegt noch auf dem Knopf. */}
        {!offen && fehler && (
          <p role="alert" className="mt-1 text-[11px] text-credo-rot">
            {fehler}
          </p>
        )}
      </div>
    );
  }

  const meta = ABLAUF_KATEGORIE_META[ampel.kategorie];
  const dringend = ampel.kategorie === "ABGELAUFEN" || ampel.kategorie === "KRITISCH";

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
          style={{ color: meta.color, backgroundColor: meta.bg }}
        >
          {meta.label}
        </span>
        {/* Der Satz selbst bleibt in Theme-Farben: Die Meta-Farben sind fuer
            Text AUF ihrem eigenen Hintergrund gedacht; frei auf der Karte waeren
            sie im dunklen Erscheinungsbild kaum lesbar. */}
        <span className={`text-[11px] ${dringend ? "font-semibold text-credo-rot" : "text-muted-foreground"}`}>
          {ampel.text}
        </span>
        {/* Auch ein VORHANDENES Datum muss aenderbar sein: Ein Zahlendreher im
            Jahr laesst die Ampel jahrelang schweigen, und der verlaengerte
            Titel bringt ohnehin eine neue Frist mit. */}
        {canEdit && !offen && (
          <button
            ref={einstiegRef}
            type="button"
            onClick={oeffne}
            className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Ändern
          </button>
        )}
      </div>
      {editor}
    </div>
  );
}

function OnboardingExportSection({ onboardingId }: { onboardingId: string }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  // Fehler erscheinen als Zeile in der Karte statt als Systemmeldung (alert).
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownload = async (type: string) => {
    setDownloading(type);
    setExportError(null);
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/pdf-export?type=${type}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export fehlgeschlagen" }));
        setExportError(err.error || "Export fehlgeschlagen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `${type}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Verbindungsfehler beim Export.");
    } finally {
      setDownloading(null);
    }
  };

  // Verdichtet: aus fuenf gleich aussehenden Karten (ca. 400 px) wird eine
  // Schaltflaechenzeile (ca. 110 px). "Dokumente" heisst jetzt
  // "Dokumentenuebersicht", damit im Tab "Dokumente" kein Knopf "Dokumente" steht.
  const exports = [
    { key: "gesamtakte", title: "Gesamtakte" },
    { key: "fragebogen", title: "Fragebogen" },
    { key: "modalitaeten", title: "Modalitäten" },
    { key: "dokumente", title: "Dokumentenübersicht" },
    { key: "checkliste", title: "Checkliste" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
        <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        PDF-Export für DMS
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Jedes Dokument erhält einen QR-Code auf der Deckseite zur automatischen DMS-Zuordnung.
      </p>
      {exportError && (
        <div className="mb-3 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-3 py-2 text-xs text-credo-rot">
          {exportError}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {exports.map((e) => (
          <button
            key={e.key}
            onClick={() => handleDownload(e.key)}
            disabled={downloading === e.key}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {downloading === e.key ? "…" : e.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Schritt-Anzeige im Dokumente-Hub ("Sie sind hier") ----
//
// Die Stationen kommen aus `onboardingKurzschritte` (rein, getestet). Neu ist,
// dass ZWEI Stationen gleichzeitig hervorgehoben sein koennen: Solange weder
// Fragebogen noch Modalitaeten da sind, ist HR an zwei Stellen zugleich.
function StepHinweis({ data }: { data: DetailData }) {
  const { schritte, aktuell } = onboardingKurzschritte(data);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3">
      <span className="mr-1 text-xs text-muted-foreground">Sie sind hier:</span>
      {schritte.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-border">&rsaquo;</span>}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              aktuell.has(i)
                ? "bg-credo-blau/10 text-credo-blau"
                : s.done
                  ? "text-credo-gruen"
                  : "text-muted-foreground"
            }`}
          >
            {s.done && !aktuell.has(i) && <CheckIcon className="h-3 w-3" />}
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function OnboardingErstellenSection({
  onboardingId,
  organizationId,
  canEdit,
  rvEntscheidung,
  betriebsnummerFehlt,
  istMinijob,
  aktualisierung,
}: {
  onboardingId: string;
  organizationId: string;
  canEdit: boolean;
  rvEntscheidung?: string | null;
  betriebsnummerFehlt: boolean;
  /** Nur dort ist das RV-Merkblatt einschlaegig. */
  istMinijob: boolean;
  /** Steigt nach jedem Paketversand — laedt die Liste "bereits erstellt" nach. */
  aktualisierung: number;
}) {
  // Nutzt die generische Hub-Komponente; Onboarding-Spezifika (Modul, amtliche
  // Formulare der Minijob-Checkliste) bleiben hier gekapselt.
  const statisch = [
    {
      name: "Masernschutz – Nachweis-Bescheinigung",
      tag: "Amtliches NRW-Formular (zum Ausfüllen beim Arzt)",
      href: "/system-dokumente/masernschutz-nrw.pdf",
      label: "PDF öffnen",
    },
  ];

  // Das Merkblatt gehoert zum Minijob-Verfahren. In einem TV-L- oder
  // Beamten-Vorgang steht es nur im Weg.
  if (istMinijob || rvEntscheidung) {
    statisch.push({
      name: "Merkblatt zur Befreiung von der Rentenversicherungspflicht",
      tag: "Amtliche Anlage der Minijob-Zentrale, Stand 30.06.2026",
      href: "/system-dokumente/merkblatt-rv-befreiung.pdf",
      label: "PDF öffnen",
    });
  }

  // Der Antrag entsteht nur, wenn der Beschaeftigte sich dafuer entschieden hat
  // — und nur, wenn die Betriebsnummer des Mandanten hinterlegt ist. Fehlt sie,
  // erscheint statt eines Knopfes der Grund: Ein deaktivierter Knopf ohne
  // Begruendung ist hier schlimmer als gar keiner.
  const antragsArt =
    rvEntscheidung === "BEFREIUNG_BEANTRAGT"
      ? "BEFREIUNG"
      : rvEntscheidung === "AUFHEBUNG_BEANTRAGT"
        ? "AUFHEBUNG"
        : null;

  if (antragsArt && !betriebsnummerFehlt) {
    statisch.push({
      name:
        antragsArt === "BEFREIUNG"
          ? "Antrag auf Befreiung von der Rentenversicherungspflicht"
          : "Antrag auf Aufhebung der Befreiung von der Rentenversicherungspflicht",
      tag: "Vorausgefüllt · gehört nach § 8 Abs. 2 Nr. 4a BVV in die Entgeltunterlagen",
      href: `/api/onboarding/${onboardingId}/rv-antrag?art=${antragsArt}`,
      label: "PDF erzeugen",
    });
  }

  return (
    <>
      {antragsArt && betriebsnummerFehlt && (
        <div className="rounded-2xl border-2 border-[#FBC900]/50 bg-[#FBC900]/10 p-4">
          <p className="text-sm font-semibold text-foreground">
            Der Antrag zur Rentenversicherung kann nicht erzeugt werden
          </p>
          <p className="mt-1 text-xs text-foreground/80">
            Für diesen Mandanten ist keine BA-Betriebsnummer hinterlegt. Der
            amtliche Antrag verlangt sie im Arbeitgeberteil. Sie tragen sie unter{" "}
            <Link href="/mandanten" className="font-medium underline">
              Mandanten
            </Link>{" "}
            nach.
          </p>
        </div>
      )}
      <TemplateGenerationSection
        modul="ONBOARDING"
        refId={onboardingId}
        organizationId={organizationId}
        canEdit={canEdit}
        staticDocuments={statisch}
        emptyHint="Keine Onboarding-Vorlagen hinterlegt. Vorlagen legen Sie unter „Brief-Vorlagen“ an."
        aktualisierung={aktualisierung}
      />
    </>
  );
}
/** Id des Rahmens um Meldung und Karte „Unterlagen nachfordern" — Fokusziel nach dem Dialog. */
const NACHFORDERUNG_FOKUSZIEL = "unterlagen-nachforderung";

/**
 * Reiter „Dokumente". Exportiert fuer den Komponententest (Position der Karte
 * „Unterlagen nachfordern", Dokumentenliste mit Bezeichnung und Herkunft).
 */
export function TabDocuments({
  data,
  onboardingId,
  canEdit,
  onFristGeaendert,
  paketDialogOffen,
  setPaketDialogOffen,
  onAktualisiert = () => {},
  nachforderungDialog = null,
  onNachfordern = () => {},
  onNachforderungSchliessen = () => {},
  onNachforderungErfolg = () => {},
  unterlagenMeldung = null,
  onUnterlagenMeldungSchliessen = () => {},
  karteSprung = 0,
  onKarteSprungErledigt,
}: {
  data: DetailData;
  onboardingId: string;
  /** `HR_EDIT_ROLES` — zugleich `darfAktionen` der Karte „Unterlagen nachfordern". */
  canEdit: boolean;
  /** Meldet eine geaenderte Dokumentenfrist nach oben — siehe `setzeDokumentFrist`. */
  onFristGeaendert: (docId: string, aenderung: FristAenderung) => void;
  paketDialogOffen: boolean;
  setPaketDialogOffen: (offen: boolean) => void;
  /** Vorgang leise neu laden (`loadData(true)`) — nach jeder Aktion der Karte. */
  onAktualisiert?: () => void | Promise<unknown>;
  /** Offener Dialog „Unterlagen nachfordern…"/„Unterlagen ergänzen…", sonst null. */
  nachforderungDialog?: NachforderungDialogAnfrage | null;
  /** Oeffnet den Dialog (Knoepfe der Karte). */
  onNachfordern?: (anfrage: NachforderungDialogAnfrage) => void;
  onNachforderungSchliessen?: () => void;
  /**
   * Der Dialog meldet gespeichert: `erfolg` (gruen, Mail zugestellt), `fehler`
   * (rot, Mail nicht zugestellt) oder `warnung` (gelb, Mail uebersprungen bzw. N2).
   */
  onNachforderungErfolg?: (meldung: { art: "erfolg" | "warnung" | "fehler"; text: string }) => void | Promise<void>;
  unterlagenMeldung?: UnterlagenMeldung | null;
  onUnterlagenMeldungSchliessen?: () => void;
  /** Zaehlt bei „Zur Nachforderung" hoch — dann rollt der Reiter zur Karte. */
  karteSprung?: number;
  /**
   * Der Sprung ist erledigt: Die Seite setzt den Zaehler zurueck — sonst
   * rollte der Reiter bei jedem spaeteren Wechsel hierher erneut zur Karte.
   */
  onKarteSprungErledigt?: () => void;
}) {
  // Ein Paketversand legt fuer jede mitgeschickte Vorlage ein Dokument an. Die
  // Erstellen- und die Versenden-Karte sind Geschwister und wissen nichts
  // voneinander — dieser Zaehler ist das Signal von der einen zur anderen.
  const [versandZaehler, setVersandZaehler] = useState(0);

  const unterlagen = data.unterlagen ?? null;

  // „Zur Nachforderung" (Kasten, Warnbalken): zur Karte rollen und den Fokus
  // dorthin setzen, damit auch die Tastatur dort weitermacht. Beim Wechsel aus
  // einem anderen Reiter laeuft der Effekt gleich beim Einhaengen.
  const karteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!karteSprung) return;
    karteRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    karteRef.current?.focus({ preventScroll: true });
    onKarteSprungErledigt?.();
  }, [karteSprung, onKarteSprungErledigt]);

  // Die Statustabelle steht in `@/lib/constants` (DOCUMENT_STATUS_LABELS) und
  // NICHT mehr hier: Als lokale Kopie fehlte ihr der Wert EXPIRED, den der
  // naechtliche Cron setzt — und der Rueckfall `|| UPLOADED` machte daraus das
  // graue Abzeichen „Hochgeladen" neben dem roten „Abgelaufen" der Ampel.

  // Schluessel MUESSEN dem Enum DocumentType entsprechen (prisma/schema.prisma).
  // Frueher standen hier PERSONALAUSWEIS, LOHNSTEUERBESCHEINIGUNG und
  // SOZIALVERSICHERUNGSAUSWEIS — die es im Datenmodell gar nicht gibt; real
  // vorkommende Arten fielen dadurch alle auf Grau zurueck.
  const DOC_TYPE_COLORS: Record<string, string> = {
    ARBEITSVERTRAG: "bg-[#009AC6]/10 text-[#009AC6]",
    FUEHRUNGSZEUGNIS: "bg-red-100 text-red-700",
    KK_BESCHEINIGUNG: "bg-credo-gruen/10 text-credo-gruen",
    GEBURTSURKUNDE_EIGEN: "bg-amber-100 text-amber-700",
    GEBURTSURKUNDE_KIND: "bg-amber-100 text-amber-700",
    SV_AUSWEIS: "bg-purple-100 text-purple-700",
    ZEUGNIS: "bg-sky-100 text-sky-700",
    ABSCHLUSSZEUGNIS: "bg-sky-100 text-sky-700",
    MASERNSCHUTZ: "bg-orange-100 text-orange-700",
    INFEKTIONSSCHUTZ: "bg-orange-100 text-orange-700",
    RV_BEFREIUNG: "bg-teal-100 text-teal-700",
    SB_AUSWEIS: "bg-indigo-100 text-indigo-700",
    VL_VERTRAG: "bg-lime-100 text-lime-700",
    BAV_VERTRAG: "bg-lime-100 text-lime-700",
    // Befristete Nachweise und PKV — fielen bis Paket 4 auf Grau zurueck.
    AUFENTHALTSTITEL: "bg-rose-100 text-rose-700",
    ARBEITSERLAUBNIS: "bg-rose-100 text-rose-700",
    PKV_NACHWEIS: "bg-credo-gruen/10 text-credo-gruen",
    SONSTIGES: "bg-gray-100 text-gray-600",
  };

  const downloadAll = () => {
    data.documents.forEach((doc, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = `/api/onboarding/${onboardingId}/documents/${doc.id}`;
        link.download = doc.fileName;
        link.click();
      }, index * 300);
    });
  };

  return (
    <div className="space-y-6">
      {/* Prozessschritt-Anzeige */}
      <StepHinweis data={data} />

      {/* Dokumente erstellen */}
      <OnboardingErstellenSection
        onboardingId={onboardingId}
        organizationId={data.organization.id}
        canEdit={canEdit}
        rvEntscheidung={data.personalData?.rvEntscheidung ?? null}
        betriebsnummerFehlt={!data.organization.betriebsnummer}
        istMinijob={data.questionnaireType === "MINIJOB"}
        aktualisierung={versandZaehler}
      />

      {/* Dokumentenpaket versenden */}
      <DokumentenpaketSection
        modul="ONBOARDING"
        refId={onboardingId}
        canEdit={canEdit}
        offen={paketDialogOffen}
        onOffenChange={setPaketDialogOffen}
        onVersendet={() => setVersandZaehler((n) => n + 1)}
      />

      {/* Unterlagen nachfordern (Paket 4) — nach „Dokumente versenden" und vor
          den hochgeladenen Dokumenten: Was die Karte annimmt, erscheint direkt
          darunter in der Liste. Die Meldung des Dialogs steht darueber.
          Der Rahmen ist zugleich das Fokusziel nach dem Dialog und nach „Zur
          Nachforderung": Nach dem Anfordern ist der ausloesende Knopf weg
          (Kasten: jetzt „Zur Nachforderung", Karte: die laufende), ohne Ziel
          laege der Fokus auf `body`. Eine Gruppe mit Namen, keine zweite
          Landmarke — die Karte selbst ist schon ein benannter Abschnitt. */}
      {unterlagen && (
        <div
          ref={karteRef}
          id={NACHFORDERUNG_FOKUSZIEL}
          tabIndex={-1}
          role="group"
          aria-label="Unterlagen nachfordern"
          className="scroll-mt-4 space-y-3 outline-none"
          data-block="nachforderung"
        >
          {unterlagenMeldung && (
            <UnterlagenMeldungen meldung={unterlagenMeldung} onSchliessen={onUnterlagenMeldungSchliessen} />
          )}
          {/* Jede Aktion der Karte bringt ihre eigene Meldung mit — die des
              Dialogs darueber waere dann veraltet und stuende womoeglich gruen
              ueber einer neuen roten. */}
          <NachforderungKarte
            uebersicht={unterlagen}
            darfAktionen={canEdit}
            onAktualisiert={() => {
              onUnterlagenMeldungSchliessen();
              return onAktualisiert();
            }}
            onNachfordern={onNachfordern}
          />
        </div>
      )}
      {canEdit && unterlagen?.darfAktionen && nachforderungDialog && (
        <NachforderungDialog
          uebersicht={unterlagen}
          modus={nachforderungDialog.modus}
          vorauswahl={nachforderungDialog.vorauswahl}
          onSchliessen={onNachforderungSchliessen}
          onErfolg={onNachforderungErfolg}
          // Letzte Kontrolle vor einer Mail an eine private Adresse: Name ·
          // Vorgangsnummer unter dem Titel (Mockup P:1299).
          kopf={{ name: mitarbeiterName(data), vorgangsnummer: data.displayId }}
          fokusZiel={NACHFORDERUNG_FOKUSZIEL}
        />
      )}

      {/* Hochgeladene Dokumente — vor den Export gezogen: der am haeufigsten
          konsultierte Bereich, waehrend der Export der seltenste Vorgang ist. */}
      {data.documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-12">
          <UploadCloudIcon className="mb-4 h-14 w-14 text-border" />
          <p className="mb-1 text-base font-medium text-foreground">Keine Dokumente hochgeladen</p>
          <p className="text-sm text-muted-foreground">
            Es wurden noch keine Dokumente zu diesem Vorgang hochgeladen.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data.documents.length} Dokument{data.documents.length !== 1 ? "e" : ""} hochgeladen
            </p>
            <button
              onClick={downloadAll}
              className="inline-flex items-center gap-2 rounded-lg bg-credo-gruen px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95"
            >
              <DownloadIcon className="h-4 w-4" />
              Alle herunterladen
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.documents.map((doc) => {
              const statusLabel = documentStatusLabel(doc.status);
              const typeColor = DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.SONSTIGES;
              // Paket 4: Name einer frei benannten Unterlage (sonst stuende da
              // nur „Sonstiges") und die Herkunft aus einer Nachforderung samt
              // PDF-Hinweisen — beides fertig vom Server.
              const bezeichnung = doc.bezeichnung?.trim() || null;
              const herkunft = unterlagen?.dokumentHerkunft[doc.id] ?? null;

              return (
                <div
                  key={doc.id}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-all hover:border-[#009AC6]/30 hover:shadow-md"
                  data-dokument={doc.id}
                >
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <DocumentIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {bezeichnung && (
                        <p className="truncate text-sm font-semibold text-foreground" title={bezeichnung} data-feld="bezeichnung">
                          {bezeichnung}
                        </p>
                      )}
                      <p
                        className={`truncate ${bezeichnung ? "text-xs text-muted-foreground" : "text-sm font-semibold text-foreground"}`}
                        title={doc.fileName}
                      >
                        {doc.fileName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(doc.fileSize)}</p>
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                      {documentTypeLabel(doc.type)}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusLabel.color}`}>
                      {statusLabel.label}
                    </span>
                  </div>

                  {herkunft && (
                    <p className="mb-3 text-[11px] text-muted-foreground" data-feld="herkunft">
                      {herkunft.text}
                      {herkunft.hinweise.length > 0 && (
                        <span className="ml-1 font-medium text-amber-800" data-hinweis="pdf">
                          ({herkunft.hinweise.join(", ")})
                        </span>
                      )}
                    </p>
                  )}

                  {/* Ablauf-Ampel — nur bei fristpflichtigen Nachweisen
                      (Aufenthaltstitel, Arbeitserlaubnis). Sie ist zugleich die
                      EINZIGE Stelle im Portal, an der `gueltigBis` geschrieben
                      werden kann, nachdem der Magic Link erloschen ist. */}
                  <AblaufAbzeichen
                    doc={doc}
                    onboardingId={onboardingId}
                    canEdit={canEdit}
                    onFristGeaendert={onFristGeaendert}
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
                    <a
                      href={`/api/onboarding/${onboardingId}/documents/${doc.id}`}
                      download={doc.fileName}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-credo-gruen/10 hover:text-credo-gruen"
                      title="Herunterladen"
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PDF-Export (DMS) — ans Ende gerueckt und zu einer Schaltflaechenzeile
          verdichtet; der Gesamtakte-Export ist eine Routine am Vorgangsende. */}
      <OnboardingExportSection onboardingId={onboardingId} />
    </div>
  );
}

// =============================================
// Tab 3: Checkliste
// =============================================

/** Exportiert fuer den Komponententest (Aufgabenkarte, Karte, Dialog). */
export function TabChecklist({
  checklistItems,
  togglingItems,
  toggleChecklistItem,
  editingNoteId,
  setEditingNoteId,
  checklistNoteText,
  setChecklistNoteText,
  savingChecklistNote,
  saveChecklistNote,
  checklistFehler,
  abteilungen,
  fuehrungskraft,
  darfAbteilungsAktionen = true,
  istAdmin = false,
  onAbteilungsAktion,
  abteilungsMeldung,
  onAbteilungsMeldungSchliessen,
  abteilungenDialogOffen,
  setAbteilungenDialogOffen,
}: {
  checklistItems: ChecklistItemData[];
  togglingItems: Set<string>;
  toggleChecklistItem: (id: string, current: boolean) => void;
  editingNoteId: string | null;
  setEditingNoteId: (id: string | null) => void;
  checklistNoteText: string;
  setChecklistNoteText: (v: string) => void;
  savingChecklistNote: boolean;
  saveChecklistNote: (id: string) => void;
  /** Ablehnung des Servers beim Abhaken/Notieren (z. B. Vorgang abgelaufen). */
  checklistFehler: string | null;
  /** Karte „Aufgaben für Abteilungen" (fehlt, solange die API sie nicht liefert). */
  abteilungen?: AbteilungsUebersichtDaten;
  fuehrungskraft?: Fuehrungskraft;
  darfAbteilungsAktionen?: boolean;
  /** Nur Admins sehen den Link zu den Checklisten-Vorlagen (Route ist gesperrt). */
  istAdmin?: boolean;
  onAbteilungsAktion: (aktion: AbteilungsAktion, departmentKey?: string) => Promise<unknown> | void;
  abteilungsMeldung?: AktionsMeldung | null;
  onAbteilungsMeldungSchliessen?: () => void;
  abteilungenDialogOffen: boolean;
  setAbteilungenDialogOffen: (offen: boolean) => void;
}) {
  if (checklistItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <CheckIcon className="mb-4 h-16 w-16 text-border" />
        <p className="mb-1 text-base font-medium text-foreground">Keine Checkliste</p>
        <p className="text-sm text-muted-foreground">
          Diesem Vorgang wurde noch keine Checkliste zugeordnet.
        </p>
      </div>
    );
  }

  const completed = checklistItems.filter((i) => i.isCompleted).length;
  const total = checklistItems.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Anzeigename je Zustaendigkeit: der Name aus der Karte (bei eigenen
  // Schluesseln z. B. „Empfang FES Minden" statt „EMPFANG"), sonst das Label.
  // Nie der rohe Schluessel — „VORGESETZTER" ist keine Beschriftung.
  const abteilungsName = (key: string) =>
    abteilungen?.zeilen.find((z) => z.departmentKey === key)?.departmentName ?? abteilungLabel(key);

  // Group by category
  const grouped: Record<string, ChecklistItemData[]> = {};
  checklistItems.forEach((item) => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Fortschritt</p>
            <p className="text-xs text-muted-foreground">
              {completed} von {total} Aufgaben erledigt
            </p>
          </div>
          <span
            className={`text-2xl font-bold ${
              pct === 100 ? "text-credo-gruen" : pct > 50 ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {pct}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-credo-gruen transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Aufgaben für Abteilungen (Paket 5) */}
      {abteilungen && (
        <AbteilungenKarte
          abteilungen={abteilungen}
          fuehrungskraft={fuehrungskraft ?? null}
          bezugsdatumLabel="Vertragsbeginn"
          darfAktionen={darfAbteilungsAktionen}
          abgebrochen={abteilungen.vorgangAbgebrochen}
          zeigeVorlagenLink={istAdmin}
          onAktion={onAbteilungsAktion}
          meldung={abteilungsMeldung}
          onMeldungSchliessen={onAbteilungsMeldungSchliessen}
          dialogOffen={abteilungenDialogOffen}
          setDialogOffen={setAbteilungenDialogOffen}
        />
      )}

      {checklistFehler && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {checklistFehler}
        </p>
      )}

      {/* Grouped Items */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{category}</span>
            <span className="h-px flex-1 bg-border" />
          </h3>
          <div className="space-y-2">
            {items
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((item) => {
                const name = item.assignee ? abteilungsName(item.assignee) : null;
                const erledigt = item.isCompleted ? erledigtText(item) : "";
                // `faelligAm` ist die gespeicherte Faelligkeit ODER die aus
                // Vertragsbeginn und Tagen berechnete Vorschau — deshalb hat
                // sie Vorrang vor `dueDate`.
                const faellig = item.faelligAm ?? item.dueDate;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-card transition-all hover:shadow-sm"
                    data-aufgabe={item.id}
                  >
                    <div className="flex items-start gap-3 p-4">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleChecklistItem(item.id, item.isCompleted)}
                        disabled={togglingItems.has(item.id)}
                        aria-label={item.isCompleted ? "Als offen markieren" : "Als erledigt markieren"}
                        aria-pressed={item.isCompleted}
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                          item.isCompleted
                            ? "border-credo-gruen bg-credo-gruen"
                            : "border-border hover:border-credo-gruen/50"
                        } ${togglingItems.has(item.id) ? "opacity-50" : ""}`}
                      >
                        {item.isCompleted && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                      </button>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm font-medium ${
                              item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                            }`}
                          >
                            {item.title}
                          </p>

                          {/* Note button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (editingNoteId === item.id) {
                                setEditingNoteId(null);
                                setChecklistNoteText("");
                              } else {
                                setEditingNoteId(item.id);
                                setChecklistNoteText(item.notes || "");
                              }
                            }}
                            className={`relative shrink-0 rounded-md p-1.5 transition-colors ${
                              editingNoteId === item.id
                                ? "bg-[#009AC6]/10 text-[#009AC6]"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                            title="Interne Notiz"
                            aria-label="Interne Notiz"
                          >
                            <ChatBubbleIcon className="h-4 w-4" />
                            {item.notes && (
                              <span className="absolute -right-0.5 -top-0.5">
                                <NoteIndicatorIcon className="h-2.5 w-2.5 text-[#FBC900]" />
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Hinweis aus der Vorlage — steht auch auf der Link-Seite */}
                        {item.description && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        )}

                        {/* Meta info */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {name && (
                            <span className="inline-flex rounded-full bg-[#009AC6]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#009AC6]">
                              {name}
                            </span>
                          )}
                          {faellig && (
                            <span className="text-[11px] text-muted-foreground">
                              Fällig: {formatDate(faellig)}
                            </span>
                          )}
                          {erledigt && (
                            <span className="text-[11px] text-muted-foreground" data-urheber>
                              {erledigt}
                            </span>
                          )}
                        </div>

                        {/* Kommentar der Abteilung (ueber ihren Link) — React maskiert */}
                        {item.abteilungKommentar && (
                          <div
                            className="mt-2 rounded-md border border-credo-blau/30 bg-credo-blau/5 px-3 py-2"
                            data-box="abteilungskommentar"
                          >
                            <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                              <span className="font-semibold text-credo-blau">
                                Kommentar {name ?? "der Abteilung"}
                                {item.abteilungKommentarAm ? `, ${formatDate(item.abteilungKommentarAm)}` : ""}:
                              </span>{" "}
                              {item.abteilungKommentar}
                            </p>
                          </div>
                        )}

                        {/* Interne HR-Notiz — nur im Portal */}
                        {item.notes && editingNoteId !== item.id && (
                          <div
                            className="mt-2 rounded-md border border-[#FBC900]/30 bg-[#FBC900]/5 px-3 py-2"
                            data-box="interne-notiz"
                          >
                            <p className="text-[11px] font-semibold text-amber-800">
                              Interne Notiz (nur im Portal)
                            </p>
                            <p className="whitespace-pre-wrap break-words text-xs text-foreground">{item.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline note editor */}
                    {editingNoteId === item.id && (
                      <div className="border-t border-border bg-muted/30 p-4">
                        <label
                          htmlFor={`interne-notiz-${item.id}`}
                          className="mb-1 block text-[11px] font-semibold text-amber-800"
                        >
                          Interne Notiz (nur im Portal)
                        </label>
                        <textarea
                          id={`interne-notiz-${item.id}`}
                          autoComplete="off"
                          value={checklistNoteText}
                          onChange={(e) => setChecklistNoteText(e.target.value)}
                          placeholder="Notiz eingeben..."
                          rows={2}
                          className="mb-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-credo-blau focus:ring-1 focus:ring-credo-blau"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(null);
                              setChecklistNoteText("");
                            }}
                            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                          >
                            Abbrechen
                          </button>
                          <button
                            type="button"
                            onClick={() => saveChecklistNote(item.id)}
                            disabled={savingChecklistNote}
                            className="rounded-md bg-credo-gruen px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#5a9420] active:scale-95 disabled:opacity-50"
                          >
                            {savingChecklistNote ? "..." : "Speichern"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================
// Tab 4: Vorgesetzter (Einstellungsmodalitaeten)
// =============================================

/**
 * Leiste mit dem Modalitaeten-Link im Reiter „Vorgesetzter".
 *
 * Ist der Link abgelaufen (und die Modalitaeten noch offen), steht statt
 * „Kopieren" der Hinweis, wo ein neuer entsteht: Ein abgelaufener Link hilft
 * der Fuehrungskraft nicht mehr, und ohne neuen Link bleibt die Pruefung
 * gesperrt (`bereitZurPruefung`).
 */
function ModalitaetenLinkLeiste({
  link,
  abgelaufenAm,
}: {
  link: string;
  abgelaufenAm: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#009AC6]/30 bg-[#009AC6]/5 p-4">
      <LinkIcon className="h-5 w-5 text-[#009AC6]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Modalitaeten-Formular</p>
        <p className="truncate text-xs text-muted-foreground">{link}</p>
        {abgelaufenAm && (
          <p className="mt-1 text-xs text-destructive">
            Link abgelaufen am {abgelaufenAm}. Einen neuen Link erzeugen Sie im Reiter
            „Übersicht“ unter „Vorgesetzten-Link“.
          </p>
        )}
      </div>
      {!abgelaufenAm && <CopyButton text={link} label="Link kopieren" />}
    </div>
  );
}

function TabSupervisor({ data, appUrl }: { data: DetailData; appUrl: string }) {
  const sd = data.supervisorData;
  const modalitaetenLink = data.supervisorToken ? `${appUrl}/modalitaeten/${data.supervisorToken}` : null;
  const abgelaufenAm =
    !vorgesetzteAbgesendet(data) && vorgesetztenLinkAbgelaufen(data)
      ? formatDate(data.supervisorTokenExpiresAt)
      : null;

  // Die Spur statt `sd.isComplete` — sonst zeigte der Altfall „Zeitstempel ohne
  // isComplete" hier „Noch keine Daten", obwohl die Modalitaeten vorliegen.
  if (!sd || (!vorgesetzteAbgesendet(data) && sd.currentStep === 0 && !sd.betriebsstaette)) {
    return (
      <div className="space-y-4">
        {modalitaetenLink && (
          <ModalitaetenLinkLeiste link={modalitaetenLink} abgelaufenAm={abgelaufenAm} />
        )}
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <svg className="mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="mb-1 text-base font-medium text-foreground">Noch keine Daten</p>
          <p className="text-sm text-muted-foreground">
            Der Vorgesetzte hat noch keine Daten eingegeben.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Link bar */}
      {modalitaetenLink && (
        <ModalitaetenLinkLeiste link={modalitaetenLink} abgelaufenAm={abgelaufenAm} />
      )}

      {/* Sektion 1: Stelle & Vertrag */}
      <Card title="Stelle & Vertrag">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Betriebsstätte" value={sd.betriebsstaette} />
          <FieldRow label={FELD_BEZEICHNUNGEN.stellenbeschreibung} value={sd.stellenbeschreibung} />
          <FieldRow label="Vertragsbeginn" value={formatDate(sd.vertragsbeginn)} />
          <FieldRow label="Befristet" value={formatBoolean(sd.befristet)} />
          {sd.befristet && (
            <>
              <FieldRow label="Art der Befristung" value={getBefristungsartLabel(sd.befristungsart)} />
              {sd.befristungsart === "ZWECK" ? (
                <>
                  <FieldRow label="Vertragsende" value="Zweckbefristung – kein festes Datum" />
                  <FieldRow label="Ende bei" value={sd.befristungZweck} />
                  <FieldRow
                    label="Voraussichtliches Ende"
                    value={sd.vertragsendeVoraussichtlich ? `${formatDate(sd.vertragsendeVoraussichtlich)} (unverbindlich)` : null}
                  />
                </>
              ) : (
                <FieldRow label="Vertragsende" value={formatDate(sd.vertragsende)} />
              )}
              <FieldRow label="Befristung Sachgrund" value={getBefristungSachgrundLabel(sd.befristungSachgrund)} />
            </>
          )}
        </div>
      </Card>

      {/* Sektion 2: Arbeitszeit & Arbeitgeber */}
      <Card title="Arbeitszeit & Arbeitgeber">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Vollzeit" value={formatBoolean(sd.vollzeit)} />
          <FieldRow label="Wochenstunden" value={formatNumber(sd.wochenstunden, "Std.")} />
          <FieldRow label="Tage pro Woche" value={formatNumber(sd.tageProWoche)} />
          <FieldRow label="Hauptarbeitgeber-ID" value={sd.hauptarbeitgeberId} />
          <FieldRow label="Hauptarbeitgeber Std." value={formatNumber(sd.hauptarbeitgeberStunden, "Std.")} />
          <FieldRow label="Nebenarbeitgeber-ID" value={sd.nebenarbeitgeberId} />
          <FieldRow label="Nebenarbeitgeber Std." value={formatNumber(sd.nebenarbeitgeberStunden, "Std.")} />
          <FieldRow label="SV-pflichtig" value={formatBoolean(sd.svPflichtig)} />
          <FieldRow label="Minijob" value={formatBoolean(sd.minijob)} />
          <FieldRow label="Ehrenamt" value={formatBoolean(sd.ehrenamt)} />
        </div>
      </Card>

      {/* Sektion 3: Vergütung */}
      <Card title="Vergütung">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Vergütungsmodell" value={sd.verguetungsmodell} />
          <FieldRow label="Entgeltgruppe" value={sd.entgeltgruppe} />
          <FieldRow label="Stufe" value={sd.stufe} />
          <FieldRow label="Festgehalt" value={formatCurrency(sd.festgehalt)} />
          <FieldRow label="Stundenlohn" value={formatCurrency(sd.stundenlohn)} />
          <FieldRow label="Bemerkung Vergütung" value={sd.bemerkungVerguetung} />
          <FieldRow label="Jahressonderzahlung" value={formatBoolean(sd.jahressonderzahlung)} />
          <FieldRow label="Sonderzahlung %" value={formatNumber(sd.sonderzahlungProzent, "%")} />
          <FieldRow label="Sachbezuege" value={formatBoolean(sd.sachbezuege)} />
          <FieldRow label="Sachbezuege Betrag" value={formatCurrency(sd.sachbezuegeBetrag)} />
          <FieldRow label="Zulage" value={formatBoolean(sd.zulage)} />
          <FieldRow label="Zulage Betrag" value={formatCurrency(sd.zulageBetrag)} />
        </div>
      </Card>

      {/* Sektion 4: Weitere Angaben */}
      <Card title="Weitere Angaben">
        <KostenstellenAufteilung sd={sd} />
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <FieldRow label="Probezeit" value={formatBoolean(sd.probezeit)} />
          <FieldRow label="Probezeit Monate" value={formatNumber(sd.probezeitMonate, "Monate")} />
          <FieldRow label="Urlaubstage/Jahr" value={formatNumber(sd.urlaubstageProJahr, "Tage")} />
          <FieldRow label="Masernschutz erforderlich" value={formatBoolean(sd.masernschutzErforderlich)} />
          <FieldRow label="Masernschutz vor Arbeitsbeginn" value={formatBoolean(sd.masernschutzVorArbeitsbeginn)} />
          <FieldRow label="Zeiterfassung" value={formatBoolean(sd.zeiterfassung)} />
        </div>
        {sd.zusatzvereinbarungen && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Zusatzvereinbarungen</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{sd.zusatzvereinbarungen}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Die Kostenstellen-Aufteilung in der Vorgangsansicht.
 *
 * Hier stand bis zur Durchsicht 09/2026 ein blosses
 * `<FieldRow label="Kostenstelle" value={sd.kostenstelle} />`. Das las die
 * Alt-Spalte, die die Maske seit KOSTENSTELLEN_AUFTEILUNG_V1 nicht mehr
 * befuellt: Bei einem neuen Vorgang stand dort ein Gedankenstrich, bei einem
 * geaenderten Bestandsvorgang die laengst ersetzte alte Kostenstelle — und
 * genau die gab HR dann an die Lohnbuchhaltung weiter.
 *
 * Eigene, exportierte Komponente statt JSX mitten in TabSupervisor: So laesst
 * sich die Anzeige pruefen, ohne die ganze Detailseite mit Router, Sitzung und
 * Nachladen aufzubauen (src/__tests__/components/kostenstellen-aufteilung.test.tsx).
 */
export function KostenstellenAufteilung({
  sd,
}: {
  sd: DetailData["supervisorData"];
}) {
  const aufteilung = kostenstellenAnzeige(sd);

  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Kostenstellen-Aufteilung
      </p>
      {aufteilung.zeilen.length === 0 ? (
        <p className="text-sm text-foreground">{"—"}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {aufteilung.zeilen.map((zeile, index) => (
              <li
                key={`${zeile.bezeichnung}-${index}`}
                className="flex items-baseline justify-between gap-3 px-3 py-1.5"
              >
                <span className="text-sm text-foreground">{zeile.bezeichnung}</span>
                <span className="text-sm font-medium text-foreground">
                  {anteilText(zeile.anteil)}
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Summe</span>
              <span
                className={`text-xs font-medium ${aufteilung.summeStimmt ? "text-muted-foreground" : "text-credo-rot"}`}
              >
                {summeText(aufteilung.summe)}
                {aufteilung.summeStimmt ? "" : " – ergibt nicht 100 %"}
              </span>
            </li>
          </ul>
          {aufteilung.ausBestand && (
            <p className="mt-1 text-xs text-muted-foreground">
              Übernommen aus dem alten Einzelfeld – im Modalitäten-Formular noch
              nicht aufgeteilt.
            </p>
          )}
        </>
      )}
      {aufteilung.bemerkung && (
        <div className="mt-2">
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">
            Bemerkung zur Aufteilung
          </p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {aufteilung.bemerkung}
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================
// Shared UI Components
// =============================================

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="h-1 w-1 rounded-full bg-credo-gruen" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value || "\u2014"}</span>
    </div>
  );
}

/**
 * Die beiden Spur-Chips im Kopf der Detailseite.
 *
 * Grün = abgesendet, Amber = Aufmerksamkeit (abgelaufener Link), sonst grau.
 * Die Texte kommen fertig aus `spurenChips` — die Oberflaeche formuliert
 * nichts selbst, sonst laufen Kopf und Karte „Status-Übersicht" auseinander.
 */
function SpurenChips({ chips }: { chips: readonly SpurChip[] }) {
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.key}
          data-spur={c.key}
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            c.ton === "fertig"
              ? "bg-credo-gruen/10 text-credo-gruen"
              : c.ton === "warnung"
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {c.text}
        </span>
      ))}
    </>
  );
}

function StatusMiniCard({
  label,
  value,
  done,
  zusatz = null,
}: {
  label: string;
  value: string;
  done: boolean;
  /** Zweite, kleine Zeile — etwa der Kurzstand einer laufenden Nachforderung. */
  zusatz?: string | null;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${done ? "border-credo-gruen/30 bg-credo-gruen/5" : "border-border bg-muted/30"}`}
      data-mini-karte={label}
    >
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${done ? "text-credo-gruen" : "text-foreground"}`}>{value}</p>
      {zusatz && (
        <p className="mt-0.5 break-words text-[11px] text-amber-800" data-zeile="kurzstand">
          {zusatz}
        </p>
      )}
    </div>
  );
}
