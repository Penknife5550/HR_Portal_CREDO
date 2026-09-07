/**
 * Dokumentenpaket-Versand — modulneutral.
 *
 * Loest starterpaket.ts ab. Die alte Datei kannte nur Onboarding, nur feste
 * PDFs und nur den Alles-oder-nichts-Fall; hier kommen beide Quellen zusammen:
 * Pool-PDFs gehen unveraendert mit, Brief-Vorlagen werden vorher mit den Daten
 * des Vorgangs befuellt und nach PDF gewandelt.
 *
 * Drei Dinge, die diese Datei anders macht als ihre Vorgaengerin:
 *
 * 1. **Sie prueft den Mandanten selbst.** Die Resolver fallen bei fehlendem
 *    Zugriff oder unbekanntem Vorgang STILL auf die allgemeinen Platzhalter
 *    zurueck (Datum, Einrichtung) — ohne Fehler. Ohne eigene Pruefung ginge ein
 *    vollstaendig leeres Schreiben an eine echte Adresse hinaus, und niemand
 *    bekaeme davon etwas mit.
 *
 * 2. **Die Bestaetigung ist eine Schranke im Datenfluss, keine Abfrage.** Fuer
 *    eine unbestaetigte Vorlage werden die sensiblen Platzhalter gar nicht erst
 *    an den Resolver gereicht — er kann sie dann technisch nicht entschluesseln.
 *    Zusaetzlich lehnt der Versand sie vorher ab (BESTAETIGUNG_FEHLT).
 *
 * 3. **Der Nachweis liegt in einer Transaktion.** In starterpaket.ts waren
 *    Zeitstempel und Pruefprotokoll zwei getrennte Schreibvorgaenge — schlug der
 *    zweite fehl, gab es einen Versand ohne Protokolleintrag.
 *
 * Geschrieben wird der Nachweis ausschliesslich nach einem tatsaechlichen
 * SENT. Jeder Abbruchpfad davor laesst die Datenbank unberuehrt.
 */
import crypto from "crypto";
import path from "path";
import { readFile, realpath, unlink } from "fs/promises";
import { prisma } from "@/lib/db";
import { asciiFilename, saveUploadedFile, sha256Hex } from "@/lib/file-upload";
import { sendEventEmail, resolveEventTemplate, type MailAttachment } from "@/lib/mailer";
import { renderDocx, TemplateError } from "@/lib/doc-templates";
import { convertDocxToPdf, isGotenbergReachable } from "@/lib/gotenberg";
import {
  getResolver,
  hasModuleResolver,
  type ResolvedPlaceholders,
} from "@/lib/doc-template-resolvers";
import { sensiblePlatzhalter, type SensiblesFeld } from "@/lib/placeholder-catalog";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { istModulUnterstuetzt } from "@/lib/erzeugte-dokumente";
import { escapeHtml } from "@/lib/email-layout";
import { empfaengerFreigegeben, ladeErlaubteDomains } from "@/lib/empfaenger-allowlist";
// Die Antwort-Typen stehen in einer eigenen, importfreien Datei, weil der
// Versand-Dialog ("use client") dieselben braucht und diese Datei hier prisma,
// fs und node:crypto mitzieht. Siehe Kopfkommentar dort.
import type {
  PaketAngebot,
  PaketAngebotPosition,
  PaketDokument,
  PaketPruefung,
  PaketVersandAntwort,
  PruefPosition,
} from "@/lib/types/dokumentenpaket";

// Weiterhin von hier beziehbar: Routen und Tests sollen nicht wissen muessen,
// wo die Typen wohnen.
export type {
  PaketAngebot,
  PaketAngebotJson,
  PaketAngebotPosition,
  PaketDokument,
  PaketPruefung,
  PaketVersandAntwort,
  PruefPosition,
} from "@/lib/types/dokumentenpaket";

// =============================================
// Grenzen
// =============================================

/**
 * Hoechstgroesse aller Anhaenge zusammen.
 *
 * Der Wert richtet sich nicht nach dem, was unser SMTP-Server annimmt, sondern
 * danach, was die Gegenstelle annimmt — und 15 MB ist die Grenze, unter der so
 * gut wie jeder Posteingang liegt. Wird sie ueberschritten, brechen wir VOR dem
 * Versand ab: Eine abgewiesene Mail mit Personalunterlagen laesst sich nicht
 * zurueckholen und niemand erfaehrt zuverlaessig davon.
 */
export const MAX_PAKET_BYTES = 15 * 1024 * 1024;

/**
 * Ein Text fuer zwei Faelle: nicht vorhanden und nicht zugaenglich.
 *
 * Der Statuscode ist bei beiden 404 — waere der Text unterschiedlich,
 * verriete er trotzdem, dass der Vorgang existiert.
 */
const NICHT_GEFUNDEN_TEXT = "Der Vorgang wurde nicht gefunden.";

// =============================================
// Fehlerbilder
// =============================================

export type PaketFehler =
  | "MODUL_NICHT_UNTERSTUETZT"
  | "VORGANG_NICHT_GEFUNDEN"
  | "KEIN_ZUGRIFF"
  | "LEERE_AUSWAHL"
  | "POSITION_NICHT_VERFUEGBAR"
  | "BESTAETIGUNG_FEHLT"
  | "DATEI_FEHLT"
  | "VORLAGE_FEHLERHAFT"
  | "PDF_DIENST"
  | "ZU_GROSS"
  | "VERSAND"
  | "VERSAND_LAEUFT"
  | "EMPFAENGER_NICHT_ERLAUBT";

export interface PaketPositionEingabe {
  art: "PDF" | "VORLAGE";
  id: string;
  /** Nur bei Vorlagen mit sensiblen Feldern noetig — und dort zwingend. */
  bestaetigt?: boolean;
}

export type PaketErgebnis =
  // Der SENT-Zweig ist die geteilte Antwort plus Status: Der Dialog liest genau
  // dieses Objekt, nachdem die Route es als `data` durchgereicht hat.
  | ({ status: "SENT" } & PaketVersandAntwort)
  | {
      status: "FEHLER";
      fehler: PaketFehler;
      detail: string;
      /** Bei BESTAETIGUNG_FEHLT: welche Vorlagen es betrifft. */
      betroffen?: { templateId: string; name: string; felder: SensiblesFeld[] }[];
    };

// =============================================
// Modul-Tabelle
// =============================================

/**
 * Was der Versand ueber einen Vorgang wissen muss — unabhaengig vom Modul.
 */
export interface VorgangsKontext {
  organizationId: string;
  organizationName: string;
  displayId: string | null;
  vorname: string;
  nachname: string;
  /** Adressvorschlag aus dem Vorgang. Der Dialog darf ihn aendern. */
  empfaenger: string;
  /**
   * Versand aus der Zeit VOR dieser Tabelle.
   *
   * Das Onboarding hat sein Starterpaket frueher ueber
   * OnboardingProcess.starterPacketSentAt vermerkt. Ohne diese Angabe stuende
   * nach dem Deploy bei jedem Bestandsvorgang "Noch nicht versendet" — und
   * jemand schickte die Unterlagen ein zweites Mal an Beschaeftigte, die sie
   * laengst haben.
   *
   * Bewusst KEINE nachtraeglich erfundene DokumentenVersand-Zeile: Wir wissen
   * nicht, welche Dokumente das damals waren und an welche Adresse sie gingen.
   * Ein Nachweis, der das behauptet, waere schlimmer als keiner.
   */
  altversand?: { am: Date; anzahl: number } | null;
  /**
   * Zusaetzliche Platzhalter, die nur dieses Modul kennt — etwa das
   * Austrittsdatum im Offboarding. Sie gehen unveraendert in die
   * Mail-Payload; leere Werte lassen den bedingten Block der Vorlage
   * entfallen, statt einen Satz ohne Datum zu hinterlassen.
   */
  zusatz?: Record<string, string>;
}

interface ModulEintrag {
  /** Event der Mailvorlage. Fehlt es, ist das Modul noch nicht verdrahtet. */
  event: string;
  lade: (refId: string) => Promise<VorgangsKontext | null>;
}

/**
 * Je Modul ein Eintrag.
 *
 * Alle vier Vorgangsmodule sind verdrahtet; je Modul gehoert eine eigene
 * Mailvorlage dazu (default-email-templates.ts) — ein Modul ohne Vorlage
 * duerfte gar nicht erst versenden koennen, deshalb prueft modulVerdrahtet
 * beides.
 *
 * Was je Modul verschieden ist: die Empfaengeradresse und das Datum, das im
 * Anschreiben zaehlt. Beides liefert der Lader ueber `zusatz`, damit nicht
 * jedes Modul dieselben Felder haben muss.
 */
const MODULE: Record<string, ModulEintrag> = {
  ONBOARDING: {
    event: "onboarding-starter-packet-sent",
    lade: async (refId) => {
      const ob = await prisma.onboardingProcess.findUnique({
        where: { id: refId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          displayId: true,
          organizationId: true,
          organization: { select: { name: true } },
          personalData: { select: { firstName: true, lastName: true } },
          starterPacketSentAt: true,
          starterPacketSentCount: true,
          supervisorData: { select: { vertragsbeginn: true } },
        },
      });
      if (!ob) return null;
      return {
        organizationId: ob.organizationId,
        organizationName: ob.organization?.name ?? "",
        displayId: ob.displayId,
        // Fragebogendaten haben Vorrang — wie in starterpaket.ts.
        vorname: ob.personalData?.firstName || ob.firstName || "",
        nachname: ob.personalData?.lastName || ob.lastName || "",
        empfaenger: ob.email,
        zusatz: { eintrittsdatum: anzeigeDatum(ob.supervisorData?.vertragsbeginn) },
        altversand: ob.starterPacketSentAt
          ? { am: ob.starterPacketSentAt, anzahl: ob.starterPacketSentCount }
          : null,
      };
    },
  },

  OFFBOARDING: {
    event: "offboarding-documents-sent",
    lade: async (refId) => {
      const off = await prisma.offboardingProcess.findUnique({
        where: { id: refId },
        select: {
          employeeEmail: true,
          employeePrivateEmail: true,
          employeeFirstName: true,
          employeeLastName: true,
          displayId: true,
          organizationId: true,
          organization: { select: { name: true } },
          contractEndDate: true,
          lastWorkingDay: true,
        },
      });
      if (!off) return null;
      return {
        organizationId: off.organizationId,
        organizationName: off.organization?.name ?? "",
        displayId: off.displayId,
        vorname: off.employeeFirstName,
        nachname: off.employeeLastName,
        // Private Adresse zuerst (Entscheidung vom 4. September): Wer
        // ausscheidet, verliert das dienstliche Postfach — und genau dort
        // laegen dann Zeugnis und Bescheinigungen. Im Dialog aenderbar.
        empfaenger: off.employeePrivateEmail || off.employeeEmail,
        zusatz: {
          austrittsdatum: anzeigeDatum(off.contractEndDate ?? off.lastWorkingDay),
        },
      };
    },
  },

  VERBEAMTUNG: {
    event: "civil-service-documents-sent",
    lade: async (refId) => {
      const cs = await prisma.civilServiceProcess.findUnique({
        where: { id: refId },
        select: {
          employeeEmail: true,
          employeeFirstName: true,
          employeeLastName: true,
          displayId: true,
          organizationId: true,
          organization: { select: { name: true } },
          probationStartDate: true,
          targetStartDate: true,
        },
      });
      if (!cs) return null;
      return {
        organizationId: cs.organizationId,
        organizationName: cs.organization?.name ?? "",
        displayId: cs.displayId,
        vorname: cs.employeeFirstName,
        nachname: cs.employeeLastName,
        empfaenger: cs.employeeEmail,
        zusatz: {
          // Der tatsaechliche Beginn schlaegt den geplanten; steht keiner
          // fest, bleibt die Angabe leer und der Satz entfaellt.
          probezeit_beginn: anzeigeDatum(cs.probationStartDate ?? cs.targetStartDate),
        },
      };
    },
  },

  VERTRAGSVERLAENGERUNG: {
    event: "contract-renewal-documents-sent",
    lade: async (refId) => {
      const ce = await prisma.contractEndProcess.findUnique({
        where: { id: refId },
        select: {
          employeeEmail: true,
          employeeFirstName: true,
          employeeLastName: true,
          displayId: true,
          organizationId: true,
          organization: { select: { name: true } },
          renewalData: { select: { vertragsende: true } },
        },
      });
      if (!ce) return null;
      return {
        organizationId: ce.organizationId,
        organizationName: ce.organization?.name ?? "",
        displayId: ce.displayId,
        vorname: ce.employeeFirstName,
        nachname: ce.employeeLastName,
        empfaenger: ce.employeeEmail,
        zusatz: {
          vertragsende_neu: anzeigeDatum(ce.renewalData?.vertragsende),
        },
      };
    },
  },
};

/** Ist fuer dieses Modul ein Paketversand eingerichtet? */
export function modulVerdrahtet(modul: string): boolean {
  return istModulUnterstuetzt(modul) && Boolean(MODULE[modul]) && hasModuleResolver(modul);
}

// =============================================
// Hilfen
// =============================================

/**
 * Vorlagen liegen in genau zwei Verzeichnissen: hochgeladene unter
 * uploads/brief-vorlagen (der Unterordner ist in der Upload-Route hart
 * kodiert), geseedete als Asset unter public/system-dokumente.
 */
const VORLAGEN_WURZELN = [
  path.join(process.cwd(), "uploads", "brief-vorlagen"),
  path.join(process.cwd(), "public", "system-dokumente"),
];

/**
 * Feste Pool-PDFs liegen in genau einem Verzeichnis — auch hier ist der
 * Unterordner in der Upload-Route hart kodiert.
 */
const POOL_WURZELN = [path.join(process.cwd(), "uploads", "starterpaket")];

/**
 * Loest einen Pfad auf und gibt ihn nur zurueck, wenn er WIRKLICH unterhalb
 * einer der uebergebenen Wurzeln liegt.
 *
 * Zwei Dinge, die der frueher hier stehende Vergleich (path.resolve +
 * startsWith) nicht leistet:
 *
 * 1. **Symlinks.** path.resolve normalisiert Zeichenketten, sonst nichts. Ein
 *    Link, der brav unterhalb der Wurzel liegt und auf /etc oder in die
 *    BEM-Anlagen zeigt, besteht jede Praefix-Pruefung — geprueft wird der
 *    Link, gelesen wird sein Ziel. Erst realpath macht daraus dasselbe.
 *    Aufgeloest werden muessen BEIDE Seiten: auch die Wurzel kann ein Link
 *    oder ein Bind-Mount sein (das uploads-Volume ist genau das), und dann
 *    passte sonst nichts mehr zusammen.
 *
 * 2. **Der Vergleich selbst.** startsWith kennt weder Pfadgrenzen noch die
 *    Gross-/Kleinschreibung — entwickelt wird auf Windows, gelaufen wird im
 *    Linux-Container. path.relative kennt beides: liegt das Ziel ausserhalb,
 *    ist das erste Segment "..", auf einem anderen Laufwerk ist das Ergebnis
 *    absolut. Verglichen wird das erste SEGMENT und nicht der Praefix "..",
 *    sonst wiese ein Geschwisterordner namens "..alt" faelschlich ab.
 *
 * Eine Wurzel, die es auf dieser Maschine gar nicht gibt, wird uebersprungen
 * statt zu werfen: Ob public/system-dokumente existiert, darf nicht darueber
 * entscheiden, ob eine hochgeladene Vorlage lesbar ist.
 *
 * Weil realpath auch bei einer fehlenden Datei wirft, beantwortet diese
 * Funktion zwei Fragen auf einmal — "liegt der Pfad im erlaubten Bereich" und
 * "gibt es die Datei ueberhaupt". Die Vorpruefung nutzt genau das, ohne ein
 * einziges Byte zu lesen.
 */
async function pfadInWurzeln(dateipfad: string, wurzeln: string[]): Promise<string> {
  const ziel = await realpath(path.resolve(dateipfad));
  for (const wurzel of wurzeln) {
    let aufgeloest: string;
    try {
      aufgeloest = await realpath(path.resolve(wurzel));
    } catch {
      continue;
    }
    const rel = path.relative(aufgeloest, ziel);
    if (rel === "" || (rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel))) {
      return ziel;
    }
  }
  throw new Error("Pfad ausserhalb der erlaubten Verzeichnisse");
}

/**
 * Liest eine Vorlagendatei — aus den beiden Verzeichnissen, in denen Vorlagen
 * legitim liegen, und aus keinem anderen.
 *
 * Frueher stand hier der ganze uploads-Baum als Wurzel. Das war zu weit:
 * darunter liegt auch uploads/bem/<id>/... — Gesundheitsdaten nach Art. 9
 * DSGVO mit eigenem Schluessel, die in einem Dokumentenpaket nichts zu suchen
 * haben. Geschrieben wird `dateipfad` ohnehin nur an zwei Stellen (Upload-Route
 * mit hart kodiertem Unterordner "brief-vorlagen", seed-check.js mit dem
 * Asset-Pfad), die Verengung bricht also keinen Bestandsfall — auch die
 * BEM-Vorlagen nicht, die ganz normale DocumentTemplate-Zeilen aus derselben
 * Upload-Route sind.
 *
 * Die bestehende Erzeugen-Route liest die Datei ohne jede Pruefung. Das wird
 * hier nicht nachgemacht: dateipfad steht in der Datenbank, und eine
 * manipulierte Zeile duerfte sonst jede Datei des Servers als Anhang
 * verschicken.
 */
async function leseVorlagenDatei(dateipfad: string): Promise<Buffer> {
  return readFile(await pfadInWurzeln(dateipfad, VORLAGEN_WURZELN));
}

/**
 * Liest ein festes Pool-PDF. Gleiche Begruendung, andere Wurzel.
 *
 * Frueher lief das ueber readUploadedFile und damit ebenfalls ueber den ganzen
 * uploads-Baum. Ein Fragebogen-Upload (uploads/<onboardingId>/...) oder eine
 * BEM-Anlage haette so als Pool-Dokument durchgehen koennen, wenn ihr Pfad je
 * in einer StarterpaketDokument-Zeile landete.
 */
async function lesePoolDokument(dateipfad: string): Promise<Buffer> {
  return readFile(await pfadInWurzeln(dateipfad, POOL_WURZELN));
}

/**
 * Macht Freitext HTML-sicher und behaelt seine Absaetze.
 *
 * Die Nachricht kommt aus einem Eingabefeld und landet unveraendert im
 * HTML-Teil der Mail. Ohne Maskierung koennte ein < im Text die Mail
 * zerlegen — und ein "<script>" waere im Postfach des Empfaengers.
 * Zeilenumbrueche werden zu <br>, damit die Absaetze erhalten bleiben.
 *
 * Maskiert wird ueber escapeHtml aus dem E-Mail-Layout: dieselben vier
 * Ersetzungen standen hier ein zweites Mal, und zwei Fassungen einer
 * Maskierung laufen frueher oder spaeter auseinander. Die Reihenfolge ist
 * dabei zwingend — erst maskieren, dann umbrechen. Andersherum machte
 * escapeHtml aus dem eingefuegten <br> ein &lt;br&gt;, und der Absatz stuende
 * als sichtbarer Text im Postfach.
 *
 * Nicht mit paragraphsToHtml aus derselben Datei zusammenlegen: die erzeugt
 * <p>-Absaetze, hier braucht es <br> innerhalb eines Absatzes. Gemeinsam ist
 * nur der Maskierungskern, und genau der wird jetzt geteilt.
 */
export function alsHtmlAbsaetze(text: string): string {
  return escapeHtml(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}

/**
 * Datum in deutscher Zeit als JJJJ-MM-TT.
 *
 * toISOString() liefert UTC: Zwischen 00:00 und 02:00 deutscher Sommerzeit
 * stuende im Dateinamen der Vortag — und der Dateiname ist Teil des
 * Nachweises. Der bestehende Erzeugen-Weg hat denselben Fehler;
 * Gleichfoermigkeit macht ihn nicht richtiger.
 *
 * "en-CA" liefert genau das ISO-Format JJJJ-MM-TT.
 */
export function deutschesDatum(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(zeitpunkt);
}

/**
 * Groesse, die aus n Rohbytes als base64-kodierter Anhang wird.
 *
 * SMTP transportiert Anhaenge base64-kodiert: je drei Bytes werden zu vier
 * Zeichen. Die Grenze der Gegenstelle gilt fuer die kodierte Nachricht, also
 * muessen wir dagegen pruefen und nicht gegen die Rohdaten.
 */
export function kodierteGroesse(rohBytes: number): number {
  return Math.ceil(rohBytes / 3) * 4;
}

/**
 * Datum fuer die Anzeige in einer Mail: TT.MM.JJJJ in deutscher Zeit.
 *
 * Leer, wenn kein Datum vorliegt — die Vorlagen setzen solche Angaben in
 * einen bedingten Block, damit kein angefangener Satz stehen bleibt.
 */
export function anzeigeDatum(zeitpunkt: Date | null | undefined): string {
  if (!zeitpunkt) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(zeitpunkt);
}

/**
 * Dateiname einer befuellten Vorlage: Vorlagenname_Nachname_JJJJ-MM-TT.pdf
 * (Entscheidung vom 3. September). Der Nachname macht Anhaenge in einem
 * Posteingang mit vielen Vorgaengen unterscheidbar.
 */
export function vorlagenDateiname(
  vorlagenName: string,
  nachname: string,
  stichtag: Date,
): string {
  const datum = deutschesDatum(stichtag);
  const teile = [vorlagenName, nachname].filter((t) => t && t.trim() !== "");
  // Erst kuerzen, DANN die Endung anhaengen. Andersherum schneidet ein langer
  // Vorlagenname das ".pdf" ab — und dann trifft `replace(/\.pdf$/i, ".docx")`
  // beim Ablegen nicht mehr, Word- und PDF-Fassung landen unter demselben Pfad
  // und ueberschreiben sich.
  const basis = asciiFilename(`${teile.join("_")}_${datum}`).slice(0, 140);
  return `${basis}.pdf`;
}

/**
 * Der blosse Dateiname aus einem gespeicherten Pfad — fuer Meldungen, die den
 * Browser erreichen.
 *
 * Bewusst NICHT path.basename: Das trennt nur am Trennzeichen der laufenden
 * Maschine. Ein unter Windows geschriebener Pfad ("uploads\\brief-vorlagen\\
 * a.docx") kaeme im Linux-Container unveraendert zurueck — samt Verzeichnissen,
 * also genau das, was hier nicht hinaus soll. Der Ausdruck trennt an beiden
 * Zeichen und ist damit unabhaengig davon, wo der Wert entstanden ist.
 */
function dateinameOhnePfad(dateipfad: string | undefined): string {
  const teile = (dateipfad ?? "").split(/[\\/]/);
  return teile[teile.length - 1] || "unbekannt";
}

/** Dateiname eines Pool-PDFs — unveraendert aus starterpaket.ts uebernommen. */
function pdfDateiname(doc: { name: string; originalName: string }): string {
  const basis =
    doc.originalName && doc.originalName.toLowerCase().endsWith(".pdf")
      ? doc.originalName
      : `${doc.name}.pdf`;
  return basis.replace(/[\r\n"]/g, "").slice(0, 150);
}

function fehler(f: PaketFehler, detail: string): PaketErgebnis {
  return { status: "FEHLER", fehler: f, detail };
}

// =============================================
// Zusammenstellung
// =============================================

interface AufgeloestePosition {
  art: "PDF" | "VORLAGE";
  id: string;
  name: string;
  bestaetigt: boolean;
  sensibleFelder: SensiblesFeld[];
  /** Nur bei PDF */
  dateipfad?: string;
  originalName?: string;
  hash?: string;
  /**
   * Groesse laut Datenbank — NUR fuer die Vorpruefung.
   *
   * Sie wird beim Upload aus `valid.buffer.length` geschrieben und danach nie
   * mehr angefasst (die PATCH-Route aendert nur Name, Beschreibung und
   * isActive); die Datei laesst sich ueber das Portal nicht austauschen. Der
   * Versand misst trotzdem weiter die echten Bytes — dort haengt die
   * 413-Grenze daran, und die muss belastbar bleiben.
   */
  fileSize?: number;
  /** Nur bei Vorlage */
  platzhalter?: unknown;
  modul?: string;
}

/**
 * Loest die uebergebenen Positionen gegen die Datenbank auf und prueft dabei
 * Mandant, Modul und Aktivitaet.
 *
 * Die Reihenfolge der Eingabe ist die Reihenfolge der Anhaenge — sie wird
 * bewusst NICHT neu sortiert.
 */
export async function stellePaketZusammen(opts: {
  modul: string;
  organizationId: string;
  positionen: PaketPositionEingabe[];
}): Promise<{ ok: true; positionen: AufgeloestePosition[] } | { ok: false; detail: string }> {
  const pdfIds = opts.positionen.filter((p) => p.art === "PDF").map((p) => p.id);
  const vorlagenIds = opts.positionen.filter((p) => p.art === "VORLAGE").map((p) => p.id);

  const [pdfs, vorlagen] = await Promise.all([
    pdfIds.length
      ? prisma.starterpaketDokument.findMany({
          where: {
            id: { in: pdfIds },
            isActive: true,
            OR: [{ organizationId: null }, { organizationId: opts.organizationId }],
          },
          select: {
            id: true,
            name: true,
            dateipfad: true,
            originalName: true,
            hash: true,
            // Fuer die Vorpruefung: Sie meldet die Groesse, ohne die Datei zu
            // lesen. Der Dialog stoesst sie nach jeder Aenderung erneut an —
            // bei fuenf Anhaengen zu je zwei Megabyte waeren das zehn Megabyte
            // je Tastendruck, die sofort wieder weggeworfen werden.
            fileSize: true,
          },
        })
      : Promise.resolve([]),
    vorlagenIds.length
      ? prisma.documentTemplate.findMany({
          where: {
            id: { in: vorlagenIds },
            isActive: true,
            modul: { in: [opts.modul, "ALLGEMEIN"] },
            OR: [{ organizationId: null }, { organizationId: opts.organizationId }],
          },
          select: { id: true, name: true, dateipfad: true, platzhalter: true, modul: true },
        })
      : Promise.resolve([]),
  ]);

  const pdfMap = new Map(pdfs.map((d) => [d.id, d]));
  const vorlagenMap = new Map(vorlagen.map((t) => [t.id, t]));

  const aufgeloest: AufgeloestePosition[] = [];
  for (const p of opts.positionen) {
    if (p.art === "PDF") {
      const d = pdfMap.get(p.id);
      if (!d) {
        return {
          ok: false,
          detail: `Ein Dokument ist fuer diesen Mandanten nicht verfuegbar oder nicht mehr aktiv.`,
        };
      }
      aufgeloest.push({
        art: "PDF",
        id: d.id,
        name: d.name,
        bestaetigt: true, // PDFs befuellen nichts, es gibt nichts zu bestaetigen
        sensibleFelder: [],
        dateipfad: d.dateipfad,
        originalName: d.originalName,
        hash: d.hash,
        fileSize: d.fileSize,
      });
    } else {
      const t = vorlagenMap.get(p.id);
      if (!t) {
        return {
          ok: false,
          detail: `Eine Vorlage ist fuer diesen Mandanten oder dieses Modul nicht verfuegbar oder nicht mehr aktiv.`,
        };
      }
      aufgeloest.push({
        art: "VORLAGE",
        id: t.id,
        name: t.name,
        bestaetigt: p.bestaetigt === true,
        sensibleFelder: sensiblePlatzhalter(t.platzhalter),
        dateipfad: t.dateipfad,
        platzhalter: t.platzhalter,
        modul: t.modul,
      });
    }
  }

  return { ok: true, positionen: aufgeloest };
}

/**
 * Welche Vorlagen brauchen eine Bestaetigung und haben keine?
 *
 * Reine Funktion ueber dem Ergebnis der Zusammenstellung — deshalb ohne
 * Datenbank testbar.
 */
export function unbestaetigteSensible(
  positionen: AufgeloestePosition[],
): { templateId: string; name: string; felder: SensiblesFeld[] }[] {
  return positionen
    .filter((p) => p.art === "VORLAGE" && p.sensibleFelder.length > 0 && !p.bestaetigt)
    .map((p) => ({ templateId: p.id, name: p.name, felder: p.sensibleFelder }));
}

/**
 * Platzhalter, die der Resolver fuer diese Position aufloesen darf.
 *
 * Fuer eine unbestaetigte Vorlage werden die sensiblen Schluessel entfernt —
 * der Resolver entschluesselt dann nichts davon (ResolverContext.placeholders
 * steuert genau das). Die zweite Schranke neben der Abweisung: Selbst wenn ein
 * kuenftiger Aufrufer die Pruefung vergisst, verlaesst kein Klartext die
 * Datenbank.
 */
export function erlaubtePlatzhalter(position: AufgeloestePosition): string[] {
  const alle = Array.isArray(position.platzhalter)
    ? position.platzhalter.filter((x): x is string => typeof x === "string")
    : [];
  if (position.bestaetigt) return alle;
  const gesperrt = new Set(position.sensibleFelder.map((f) => f.key.toLowerCase()));
  return alle.filter((k) => !gesperrt.has(k.trim().toLowerCase()));
}

/**
 * Ruft den Resolver hoechstens einmal je Platzhalterliste — fuer EINEN Aufruf.
 *
 * Ein Paket besteht regelmaessig aus mehreren Brief-Vorlagen. Der Resolver
 * laeuft je Vorlage einmal und laedt dabei jedes Mal denselben Vorgang, denselben
 * Mandanten und dasselbe Benutzerkonto — bei drei Vorlagen fuenfzehn Abfragen
 * statt fuenf. Der Dialog stoesst die Vorpruefung zudem nach jeder Aenderung
 * erneut an.
 *
 * Drei Regeln, die diesen Speicher ungefaehrlich machen:
 *
 * 1. Er wird im Aufrufer angelegt und stirbt mit ihm. Es gibt bewusst KEINEN
 *    Modul- oder globalThis-Speicher: Ein Eintrag mit entschluesselter IBAN
 *    darf niemals eine Anfrage oder eine Person ueberleben. Alles andere
 *    (Vorgang, Sitzung, IP) ist innerhalb eines Aufrufs ohnehin konstant.
 *
 * 2. Der Schluessel ist die VOLLSTAENDIGE, sortierte Platzhalterliste — nicht
 *    nur der sensible Anteil. Das ist der Punkt, an dem diese kleine Variante
 *    steht und faellt: `ctx.placeholders` steuert, welche Werte der Resolver
 *    ueberhaupt setzt, und zwar nachweislich NICHT nur bei sensiblen Feldern.
 *    Der Verbeamtungs-Resolver gated ueber dieselbe Abfrage auch
 *    `beurteilung_<n>_ergebnis`, `beirat_entscheidung` und `antrag_erklaerung`
 *    (setGeschuetzt) — und von denen ist nur `gemeinde` im Katalog als
 *    `sensitive` markiert. Ein Schluessel aus den sensiblen Feldern allein
 *    wuerde zwei Vorlagen mit verschiedenen Listen dasselbe Ergebnis geben:
 *    die zweite bekaeme ein Feld, das sie nicht angefordert hat, oder — der
 *    schlimmere Fall, weil er still bleibt — ihr fehlte eines, das sie nutzt,
 *    und im Schreiben stuende an dieser Stelle nichts.
 *    Der Preis der Genauigkeit: Zwei Vorlagen teilen sich das Ergebnis nur bei
 *    gleicher Platzhalterliste. Das ist seltener als ein Schluessel aus den
 *    sensiblen Feldern allein, aber es ist richtig — und ein falsch befuelltes
 *    Schreiben an eine echte Adresse ist teurer als eine gesparte Abfrage.
 *
 * 3. Zwischengespeichert wird die PROMISE, nicht erst das Ergebnis. Sonst
 *    liefen zwei Positionen mit gleicher Liste nebeneinander los. Ein
 *    Fehlschlag wird wieder ausgetragen, damit ein Verbindungsabriss bei der
 *    ersten Vorlage nicht alle folgenden mitreisst.
 *
 * Herausgegeben wird das Ergebnis als flache Kopie: Die Resolver liefern
 * ausschliesslich Zeichenketten, und kein heutiger Aufrufer schreibt hinein —
 * aber wer das spaeter tut, soll damit nicht der naechsten Vorlage in die Daten
 * oder in ihre Liste entschluesselter Felder schreiben.
 */
function neuerResolverSpeicher(modul: string) {
  const resolver = getResolver(modul);
  const eintraege = new Map<string, Promise<ResolvedPlaceholders>>();

  return async function aufloesen(
    kontext: {
      organizationId: string;
      refId: string;
      placeholders: string[];
      session: SessionPayload;
      ipAddress: string | null;
    },
  ): Promise<ResolvedPlaceholders> {
    // Sortiert, damit zwei Vorlagen mit denselben Platzhaltern in anderer
    // Reihenfolge denselben Schluessel bekommen. Als Zeichenkette dient das
    // JSON der Liste und nicht ein zusammengefuegter Text: Mit einem
    // Trennzeichen waeren ["a,b"] und ["a","b"] derselbe Schluessel, und ein
    // Schluessel, der zwei verschiedene Platzhaltermengen zusammenwirft, ist
    // genau der Fehler, den dieser Speicher nicht machen darf.
    const schluessel = JSON.stringify([...kontext.placeholders].sort());
    let lauf = eintraege.get(schluessel);
    if (!lauf) {
      lauf = resolver(kontext).catch((e) => {
        eintraege.delete(schluessel);
        throw e;
      });
      eintraege.set(schluessel, lauf);
    }
    const ergebnis = await lauf;
    return { data: { ...ergebnis.data }, sensitiveFields: [...ergebnis.sensitiveFields] };
  };
}

// =============================================
// Versand
// =============================================

export interface VersandOptionen {
  modul: string;
  refId: string;
  positionen: PaketPositionEingabe[];
  /** Vom Dialog gewaehlte Adresse; fehlt sie, gilt die des Vorgangs. */
  empfaenger?: string;
  nachricht?: string;
  session: SessionPayload;
  ipAddress?: string | null;
  /** Zeitpunkt — als Parameter, damit Tests ihn festlegen koennen. */
  jetzt?: Date;
}

/**
 * Laufende Versendungen je Vorgang.
 *
 * Der Dialog sperrt seinen Knopf, aber zwei parallele API-Aufrufe wuerden
 * zweimal verschicken und zwei Nachweise schreiben. Eine Mail laesst sich nicht
 * zurueckholen, also greift die Sperre VOR dem Versand.
 *
 * BEWUSST prozesslokal: Das Portal laeuft als ein Container (hr-portal-app).
 * Wird es je waagerecht skaliert, traegt diese Sperre nicht mehr und muss durch
 * eine Datenbanksperre ersetzt werden. Der Hinweis steht hier, damit das beim
 * Skalieren auffaellt und nicht erst im Postfach eines Beschaeftigten.
 */
const laufendeVersendungen = new Set<string>();

export async function versendePaket(opts: VersandOptionen): Promise<PaketErgebnis> {
  const sperre = `${opts.modul}:${opts.refId}`;
  if (laufendeVersendungen.has(sperre)) {
    return fehler(
      "VERSAND_LAEUFT",
      "Fuer diesen Vorgang laeuft bereits ein Versand. Bitte das Ergebnis abwarten.",
    );
  }
  laufendeVersendungen.add(sperre);
  try {
    return await versendeIntern(opts);
  } finally {
    // Genau eine Freigabestelle — kein Rueckgabepfad darf die Sperre stehen
    // lassen, sonst waere der Vorgang dauerhaft blockiert.
    laufendeVersendungen.delete(sperre);
  }
}

async function versendeIntern(opts: VersandOptionen): Promise<PaketErgebnis> {
  const jetzt = opts.jetzt ?? new Date();

  // --- 1. Modul ---
  if (!modulVerdrahtet(opts.modul)) {
    return fehler(
      "MODUL_NICHT_UNTERSTUETZT",
      `Fuer das Modul "${opts.modul}" ist kein Paketversand eingerichtet.`,
    );
  }
  const eintrag = MODULE[opts.modul];

  // --- 2. Vorgang ---
  const vorgang = await eintrag.lade(opts.refId);
  if (!vorgang) {
    return fehler("VORGANG_NICHT_GEFUNDEN", NICHT_GEFUNDEN_TEXT);
  }

  // --- 3. Mandant ---
  // Muss hier stehen und nicht nur im Resolver: Der Resolver faellt bei
  // fehlendem Zugriff still auf die allgemeinen Platzhalter zurueck. Ohne diese
  // Zeile ginge ein leeres Schreiben an eine echte Adresse.
  if (!(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return fehler("KEIN_ZUGRIFF", NICHT_GEFUNDEN_TEXT);
  }

  // --- 4. Auswahl ---
  if (opts.positionen.length === 0) {
    return fehler("LEERE_AUSWAHL", "Es ist kein Dokument ausgewaehlt.");
  }

  const zusammen = await stellePaketZusammen({
    modul: opts.modul,
    organizationId: vorgang.organizationId,
    positionen: opts.positionen,
  });
  if (!zusammen.ok) {
    return fehler("POSITION_NICHT_VERFUEGBAR", zusammen.detail);
  }

  // --- 5. Bestaetigungspflicht ---
  const offen = unbestaetigteSensible(zusammen.positionen);
  if (offen.length > 0) {
    return {
      status: "FEHLER",
      fehler: "BESTAETIGUNG_FEHLT",
      detail:
        "Mindestens eine Vorlage befuellt sensible Felder und wurde nicht bestaetigt.",
      betroffen: offen,
    };
  }

  const empfaenger = (opts.empfaenger || vorgang.empfaenger || "").trim();
  if (!empfaenger) {
    return fehler("VERSAND", "Der Vorgang hat keine Empfaengeradresse.");
  }

  // --- 5b. Freigabe der Empfaengeradresse ---
  // Hier und nicht weiter unten: Die Abweichung von der Vorgangsadresse wird
  // in Abschnitt 9 zwar berechnet, aber erst NACH sendEventEmail — dort ist
  // sie nur noch ein Vermerk im Nachweis. Eine Schranke muss vor dem Bauen der
  // Anhaenge greifen; danach ist die Mail unterwegs und mit ihr die IBAN.
  //
  // Vor diesem Punkt wurde nichts entschluesselt, nichts gerendert und nichts
  // abgelegt — der Abbruch laesst die Datenbank unberuehrt und fuegt sich damit
  // in die Zusage "kein Abbruchpfad hinterlaesst einen Nachweis".
  const erlaubteDomains = await ladeErlaubteDomains();
  if (
    !empfaengerFreigegeben({
      empfaenger,
      empfaengerVorgang: vorgang.empfaenger,
      domains: erlaubteDomains,
    })
  ) {
    return fehler(
      "EMPFAENGER_NICHT_ERLAUBT",
      `An "${empfaenger}" darf nicht versendet werden: Die Adresse weicht von der im Vorgang hinterlegten ab und ihre Domain ist nicht freigegeben (erlaubt: ${erlaubteDomains.join(
        ", ",
      )}). Bitte die Adresse des Vorgangs verwenden oder die Freigabeliste in den Einstellungen unter SMTP ergaenzen lassen.`,
    );
  }

  // --- 6. Anhaenge bauen ---
  const anhaenge: MailAttachment[] = [];
  const dokumente: PaketDokument[] = [];
  const warnungen: string[] = [];
  /** Was nach erfolgreichem Versand persistiert wird — vorher nichts. */
  const abzulegen: {
    templateId: string;
    name: string;
    dateiname: string;
    docx: Buffer;
    pdf: Buffer;
    hash: string;
    fehlendeFelder: string[];
    index: number;
  }[] = [];

  const braucheGotenberg = zusammen.positionen.some((p) => p.art === "VORLAGE");
  if (braucheGotenberg && !(await isGotenbergReachable())) {
    return fehler(
      "PDF_DIENST",
      "Der Dienst zur PDF-Erzeugung ist nicht erreichbar. Es wurde nichts versendet.",
    );
  }

  // Ein Zwischenspeicher fuer genau diesen Versand: Ohne ihn laedt jede Vorlage
  // mit derselben Platzhalterliste Vorgang, Mandant und Benutzerkonto erneut.
  // Er lebt nur in dieser Funktion und sieht deshalb genau eine Sitzung.
  const aufloesen = neuerResolverSpeicher(opts.modul);

  for (const [index, pos] of zusammen.positionen.entries()) {
    if (pos.art === "PDF") {
      let inhalt: Buffer;
      try {
        inhalt = await lesePoolDokument(pos.dateipfad!);
      } catch {
        return fehler(
          "DATEI_FEHLT",
          `Dokument "${pos.name}" konnte nicht geladen werden (fehlt im Speicher).`,
        );
      }
      const dateiname = pdfDateiname({ name: pos.name, originalName: pos.originalName! });
      anhaenge.push({ filename: dateiname, content: inhalt, contentType: "application/pdf" });
      dokumente.push({
        art: "PDF",
        name: pos.name,
        dateiname,
        // Hash des tatsaechlich gelesenen Inhalts, nicht der DB-Wert: Der
        // Nachweis soll die versendeten Bytes belegen, nicht eine Zusage.
        hash: sha256Hex(inhalt),
        groesse: inhalt.length,
        fehlendeFelder: [],
        sensibleFelder: [],
      });
      continue;
    }

    // --- Vorlage: befuellen, wandeln ---
    const aufgeloest = await aufloesen({
      organizationId: vorgang.organizationId,
      refId: opts.refId,
      placeholders: erlaubtePlatzhalter(pos),
      session: opts.session,
      ipAddress: opts.ipAddress ?? null,
    });

    let quelle: Buffer;
    try {
      quelle = await leseVorlagenDatei(pos.dateipfad!);
    } catch {
      return fehler(
        "DATEI_FEHLT",
        `Vorlage "${pos.name}" konnte nicht geladen werden (fehlt im Speicher).`,
      );
    }

    let gerendert;
    try {
      gerendert = renderDocx(quelle, aufgeloest.data);
    } catch (e) {
      const detail =
        e instanceof TemplateError && e.details.length > 0
          ? `${e.message} ${e.details.join("; ")}`
          : e instanceof Error
            ? e.message
            : "Unbekannter Fehler";
      return fehler("VORLAGE_FEHLERHAFT", `Vorlage "${pos.name}": ${detail}`);
    }

    const dateiname = vorlagenDateiname(pos.name, vorgang.nachname, jetzt);
    let pdf: Buffer;
    try {
      pdf = await convertDocxToPdf(gerendert.buffer, dateiname.replace(/\.pdf$/i, ".docx"));
    } catch (e) {
      return fehler(
        "PDF_DIENST",
        `Vorlage "${pos.name}" konnte nicht in PDF gewandelt werden: ${
          e instanceof Error ? e.message : "Unbekannter Fehler"
        }`,
      );
    }

    if (gerendert.missing.length > 0) {
      warnungen.push(
        `"${pos.name}": ${gerendert.missing.length} Feld(er) blieben leer (${gerendert.missing.join(", ")}).`,
      );
    }

    anhaenge.push({ filename: dateiname, content: pdf, contentType: "application/pdf" });
    dokumente.push({
      art: "VORLAGE",
      name: pos.name,
      dateiname,
      hash: sha256Hex(pdf),
      groesse: pdf.length,
      templateId: pos.id,
      fehlendeFelder: gerendert.missing,
      sensibleFelder: aufgeloest.sensitiveFields,
    });
    abzulegen.push({
      templateId: pos.id,
      name: pos.name,
      dateiname,
      docx: gerendert.buffer,
      pdf,
      hash: sha256Hex(gerendert.buffer),
      fehlendeFelder: gerendert.missing,
      index: dokumente.length - 1,
    });
  }

  // --- 7. Groesse ---
  // Gemessen wird die Groesse der fertigen Nachricht, nicht die der Rohdaten:
  // Anhaenge gehen base64-kodiert ueber SMTP und wachsen dabei um rund ein
  // Drittel. Ein Paket mit 14,8 MB Rohbytes ergibt gut 20 MB Nachricht — und
  // wird von jedem Posteingang mit 20-MB-Grenze abgewiesen. Genau das soll die
  // Pruefung verhindern.
  const gesamt = kodierteGroesse(anhaenge.reduce((s, a) => s + a.content.length, 0));
  if (gesamt > MAX_PAKET_BYTES) {
    return fehler(
      "ZU_GROSS",
      `Das Paket ist mit ${(gesamt / 1024 / 1024).toFixed(1)} MB zu gross (erlaubt sind ${(
        MAX_PAKET_BYTES /
        1024 /
        1024
      ).toFixed(0)} MB). Bitte weniger Dokumente waehlen.`,
    );
  }

  // --- 8. Versand ---
  // Zwei Fassungen, weil dieselbe Payload den Text- UND den HTML-Teil der
  // Mail speist: Was fuer HTML maskiert ist, sieht im Textteil falsch aus.
  const dokumentenliste = dokumente.map((d, i) => `${i + 1}. ${d.name}`).join("\n");
  const dokumentenlisteHtml =
    "<ol style=\"margin:0;padding-left:20px;\">" +
    dokumente.map((d) => `<li>${alsHtmlAbsaetze(d.name)}</li>`).join("") +
    "</ol>";
  const nachricht = (opts.nachricht ?? "").trim();
  // Bewusste Ausnahme von der Hausregel "immer ueber triggerWebhooks":
  //
  // Der Dispatcher reicht weder Anhaenge noch overrideTo durch — er koennte es
  // nur, wenn seine Signatur um die Mailer-Optionen waechst. Genau das ist hier
  // NICHT gewollt (Entscheidung des Nutzers): Ein Dokumentenpaket kann 15 MB
  // Personalunterlagen tragen, und an einer frei konfigurierbaren Webhook-URL
  // will sie niemand haben — auch nicht als base64 im JSON-Koerper, auch nicht
  // in einem dritten Parameter, der heute nur die Mail betrifft und beim
  // naechsten Umbau vielleicht nicht mehr.
  //
  // Der Preis, den das kostet und den man kennen muss: Ein in den Einstellungen
  // ueber "Freies Event" angelegter Webhook auf die vier "*-sent"-Ereignisse
  // wird angelegt, angezeigt — und feuert nie. Das EmailLog schreibt
  // sendEventEmail selbst, der Protokollteil geht also nicht verloren.
  const ergebnis = await sendEventEmail(
    eintrag.event,
    {
      refId: opts.refId,
      // Die bestehende Onboarding-Mailvorlage kennt die Variable unter diesem
      // Namen. Beim Verdrahten der drei anderen Module (Baustein 13) bekommt
      // jede Vorlage `refId` — ein Sonderfall reicht.
      ...(opts.modul === "ONBOARDING" ? { onboardingId: opts.refId } : {}),
      displayId: vorgang.displayId,
      email: empfaenger,
      vorname: vorgang.vorname,
      nachname: vorgang.nachname,
      organization: vorgang.organizationName,
      einrichtung: vorgang.organizationName,
      anzahlDokumente: dokumente.length,
      nachricht,
      nachricht_html: alsHtmlAbsaetze(nachricht),
      dokumentenliste,
      dokumentenliste_html: dokumentenlisteHtml,
      sachbearbeiter_name: `${opts.session.firstName} ${opts.session.lastName}`.trim(),
      // Modulspezifisches zuletzt: Es soll nichts Allgemeines ueberschreiben.
      ...(vorgang.zusatz ?? {}),
    },
    {
      attachments: anhaenge,
      // Die im Dialog gewaehlte Adresse MUSS gelten. Ohne overrideTo entscheidet
      // renderEventEmail nach der Regel "Vorlagen-Feld vor Katalog-Default" —
      // ein in der Vorlagenverwaltung gesetztes An-Feld schluege die Auswahl,
      // und der Nachweis behauptete eine Zustellung, die nie stattfand.
      //
      // overrideTo verwirft zugleich Cc und Bcc der Vorlage. Das ist hier
      // richtig: Die Bestaetigung fuer sensible Daten nennt genau eine Adresse.
      // Ein stiller Verteiler im Cc bekaeme die IBAN mit, ohne dass ihn jemand
      // bestaetigt oder der Nachweis ihn kennt.
      overrideTo: empfaenger,
    },
  );

  if (ergebnis.status !== "SENT") {
    return fehler(
      "VERSAND",
      ergebnis.detail || "Die E-Mail konnte nicht versendet werden.",
    );
  }

  // --- 9. Nachweis (erst jetzt, und in einer Transaktion) ---
  // Festgehalten wird, was der Mailer TATSAECHLICH adressiert hat — nicht, was
  // wir angefordert haben. Beides sollte durch overrideTo uebereinstimmen; wenn
  // nicht, ist die Wahrheit die des Mailers.
  const zugestelltAn = ergebnis.recipient || empfaenger;
  const abweichend =
    zugestelltAn.toLowerCase() !== (vorgang.empfaenger || "").trim().toLowerCase();
  const bestaetigungen = zusammen.positionen
    .filter((p) => p.art === "VORLAGE" && p.sensibleFelder.length > 0)
    .map((p) => ({
      templateId: p.id,
      felder: p.sensibleFelder.map((f) => f.key),
      userId: opts.session.userId,
      at: jetzt.toISOString(),
    }));

  // Dateien liegen ausserhalb der Transaktion — ein Schreibfehler hier darf den
  // Nachweis nicht verhindern, der Versand ist ja bereits geschehen.
  const abgelegt = new Map<number, { pfadDocx: string; pfadPdf: string }>();
  for (const a of abzulegen) {
    try {
      const unterordner = `brief-vorlagen-generiert/${crypto.randomUUID()}`;
      const pfadDocx = await saveUploadedFile(
        a.docx,
        unterordner,
        a.dateiname.replace(/\.pdf$/i, ".docx"),
      );
      const pfadPdf = await saveUploadedFile(a.pdf, unterordner, a.dateiname);
      abgelegt.set(a.index, { pfadDocx, pfadPdf });
    } catch {
      warnungen.push(
        `"${a.name}" wurde versendet, konnte aber nicht abgelegt werden. Der Nachweis behaelt Name und Pruefsumme.`,
      );
    }
  }

  const versandId = crypto.randomUUID();
  const nachweisGeschrieben = await prisma.$transaction(async (tx) => {
    await tx.dokumentenVersand.create({
      data: {
        id: versandId,
        modul: opts.modul,
        refId: opts.refId,
        organizationId: vorgang.organizationId,
        empfaenger: zugestelltAn,
        empfaengerVorgang: vorgang.empfaenger,
        empfaengerAbweichend: abweichend,
        // Der Betreff kommt aus der Mailvorlage und wird vom Mailer
        // zurueckgemeldet. Ihn hier selbst zusammenzusetzen hiesse, im Nachweis
        // etwas zu behaupten, das so nie versendet wurde.
        betreff: ergebnis.subject ?? "",
        nachricht: nachricht || null,
        anzahl: dokumente.length,
        positionen: dokumente as unknown as object,
        bestaetigungen: bestaetigungen as unknown as object,
        fehlendeFelderGesamt: dokumente.reduce((s, d) => s + d.fehlendeFelder.length, 0),
        messageId: ergebnis.messageId ?? null,
        sentById: opts.session.userId,
      },
    });

    for (const a of abzulegen) {
      const pfade = abgelegt.get(a.index);
      const erzeugt = await tx.generatedDocument.create({
        data: {
          templateId: a.templateId,
          name: `${a.name} (${deutschesDatum(jetzt)})`,
          modul: opts.modul,
          refId: opts.refId,
          organizationId: vorgang.organizationId,
          pfadDocx: pfade?.pfadDocx ?? null,
          pfadPdf: pfade?.pfadPdf ?? null,
          hash: a.hash,
          missingPlaceholders: a.fehlendeFelder,
          createdById: opts.session.userId,
          versandId,
        },
        select: { id: true },
      });
      dokumente[a.index].generatedDocumentId = erzeugt.id;
    }

    // Nachziehen, weil der create oben `dokumente` in dem Zustand serialisiert
    // hat, den es VOR dieser Schleife hatte. Ohne diese Zeilen bliebe die
    // Verknuepfung Nachweis -> Datei dauerhaft leer, obwohl die HTTP-Antwort
    // sie enthaelt — und nach der Zwoelf-Monats-Aufbewahrung waere sie
    // endgueltig verloren.
    if (abzulegen.length > 0) {
      await tx.dokumentenVersand.update({
        where: { id: versandId },
        data: { positionen: dokumente as unknown as object },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: opts.session.userId,
        onboardingId: opts.modul === "ONBOARDING" ? opts.refId : null,
        processType: "STARTERPAKET",
        action: "DOKUMENTENPAKET_SENT",
        details: {
          versandId,
          modul: opts.modul,
          refId: opts.refId,
          empfaenger: zugestelltAn,
          empfaengerAbweichend: abweichend,
          anzahl: dokumente.length,
          dokumente: dokumente.map((d) => ({ name: d.name, hash: d.hash, art: d.art })),
          // Welche sensiblen Felder tatsaechlich entschluesselt wurden —
          // derselbe Nachweis wie beim Download einer Vorlage.
          sensitiveFields: [...new Set(dokumente.flatMap((d) => d.sensibleFelder))],
        },
        ipAddress: opts.ipAddress ?? null,
      },
    });

    // Uebergangsweise: Die alte Karte im Onboarding zeigt "Zuletzt gesendet"
    // aus diesen beiden Feldern. Faellt sie mit Baustein 9 weg, kann das hier
    // ersatzlos verschwinden — der Nachweis steht in DokumentenVersand.
    if (opts.modul === "ONBOARDING") {
      await tx.onboardingProcess.update({
        where: { id: opts.refId },
        data: {
          starterPacketSentAt: jetzt,
          starterPacketSentCount: { increment: 1 },
        },
      });
    }
  }, {
    // Bis zu 50 erzeugte Dokumente plus Nachweis, Protokoll und Zeitstempel —
    // das Standardbudget von 5 Sekunden reicht dafuer nicht verlaesslich, und
    // ein Timeout hier kostet den kompletten Nachweis einer bereits
    // zugestellten Mail.
    timeout: 30_000,
  }).then(
    () => true,
    async (e) => {
      // Die Mail ist raus — das ist die unumkehrbare Tatsache. Ein Fehler hier
      // darf NICHT als Fehlschlag zurueckkommen: Sonst verschickt jemand
      // dasselbe Paket ein zweites Mal, und das ist der schlimmere Ausgang.
      // Die eben abgelegten Dateien referenziert nun nichts mehr — weg damit,
      // statt sie als Muell im Speicher zu lassen.
      for (const pfade of abgelegt.values()) {
        await unlink(pfade.pfadDocx).catch(() => undefined);
        await unlink(pfade.pfadPdf).catch(() => undefined);
      }
      console.error("[Dokumentenpaket] Nachweis konnte nicht geschrieben werden:", e);

      // Der Nachweis UND das Pruefprotokoll lagen in derselben Transaktion —
      // beide sind jetzt weg. Uebrig bliebe nur das EmailLog, das nach 90 Tagen
      // aufgeraeumt wird und weder Hashes noch die entschluesselten Felder
      // kennt. Fuer eine Mail, die Art.-9-Daten enthalten kann, ist das zu
      // wenig: Ein Auskunftsersuchen waere danach nicht mehr zu beantworten.
      // Deshalb ein eigenstaendiger Protokolleintrag ausserhalb jeder
      // Transaktion. Schlaegt auch der fehl, bleibt nur noch die Konsole.
      await prisma.auditLog
        .create({
          data: {
            userId: opts.session.userId,
            onboardingId: opts.modul === "ONBOARDING" ? opts.refId : null,
            processType: "STARTERPAKET",
            action: "DOKUMENTENPAKET_NACHWEIS_FEHLGESCHLAGEN",
            details: {
              versandId,
              modul: opts.modul,
              refId: opts.refId,
              empfaenger: zugestelltAn,
              anzahl: dokumente.length,
              dokumente: dokumente.map((d) => ({ name: d.name, hash: d.hash, art: d.art })),
              sensitiveFields: [...new Set(dokumente.flatMap((d) => d.sensibleFelder))],
              grund: e instanceof Error ? e.message : String(e),
            },
            ipAddress: opts.ipAddress ?? null,
          },
        })
        .catch((zweiterFehler) =>
          console.error(
            "[Dokumentenpaket] Auch der Ersatz-Protokolleintrag schlug fehl:",
            zweiterFehler,
          ),
        );
      return false;
    },
  );

  if (!nachweisGeschrieben) {
    warnungen.push(
      "Das Paket wurde versendet, der Nachweis konnte aber nicht gespeichert werden. " +
        "Bitte den Versand NICHT wiederholen und die Protokolle pruefen.",
    );
  }

  return { status: "SENT", versandId, empfaenger: zugestelltAn, dokumente, warnungen };
}

// =============================================
// Vorpruefung
//
// Sagt vor dem Versand, was hinausgehen wuerde: welche Felder leer bleiben,
// wie gross das Paket wird, ob der PDF-Dienst antwortet und ob die Mailvorlage
// die Nachricht ueberhaupt kennt.
//
// Sie persistiert nichts und ENTSCHLUESSELT NICHTS. Sensible Platzhalter
// bekommen einen Marker und zaehlen dadurch nicht als leer — sie werden erst
// beim bestaetigten Versand befuellt. Der Marker verlaesst den Server nie: Das
// probeweise befuellte Dokument wird weder abgelegt noch verschickt.
// =============================================

/** Fuellwert fuer sensible Platzhalter waehrend der Vorpruefung. */
export const SENSIBEL_MARKER = "(wird beim Versand eingesetzt)";

export type PruefungErgebnis =
  | { status: "OK"; pruefung: PaketPruefung }
  | { status: "FEHLER"; fehler: PaketFehler; detail: string };

export async function pruefePaket(opts: {
  modul: string;
  refId: string;
  positionen: PaketPositionEingabe[];
  empfaenger?: string;
  session: SessionPayload;
}): Promise<PruefungErgebnis> {
  if (!modulVerdrahtet(opts.modul)) {
    return {
      status: "FEHLER",
      fehler: "MODUL_NICHT_UNTERSTUETZT",
      detail: `Fuer das Modul "${opts.modul}" ist kein Paketversand eingerichtet.`,
    };
  }
  const eintrag = MODULE[opts.modul];

  const vorgang = await eintrag.lade(opts.refId);
  if (!vorgang) {
    return {
      status: "FEHLER",
      fehler: "VORGANG_NICHT_GEFUNDEN",
      detail: NICHT_GEFUNDEN_TEXT,
    };
  }
  if (!(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return {
      status: "FEHLER",
      fehler: "KEIN_ZUGRIFF",
      detail: NICHT_GEFUNDEN_TEXT,
    };
  }

  // Eine leere Auswahl ist hier KEIN Fehler: Der Dialog prueft waehrend des
  // Zusammenstellens, und eine Fehlermeldung auf dem Weg dorthin waere Laerm.
  // Der Versand lehnt sie ab, das genuegt.
  const zusammen = await stellePaketZusammen({
    modul: opts.modul,
    organizationId: vorgang.organizationId,
    positionen: opts.positionen,
  });
  if (!zusammen.ok) {
    return { status: "FEHLER", fehler: "POSITION_NICHT_VERFUEGBAR", detail: zusammen.detail };
  }

  const warnungen: string[] = [];
  const positionen: PruefPosition[] = [];

  const brauchtVorlagen = zusammen.positionen.some((p) => p.art === "VORLAGE");
  const pdfDienstErreichbar = brauchtVorlagen ? await isGotenbergReachable() : true;
  if (brauchtVorlagen && !pdfDienstErreichbar) {
    warnungen.push(
      "Der Dienst zur PDF-Erzeugung antwortet nicht. Vorlagen koennen derzeit nicht versendet werden.",
    );
  }

  const vorlage = await resolveEventTemplate(eintrag.event);
  // Erkennt {{nachricht}}, {{nachricht_html}} und den bedingten Block
  // {{#nachricht}} — sonst meldete die Vorpruefung eine Luecke, die es in
  // der Standardvorlage gar nicht gibt.
  const nachrichtImText = /\{\{[#/]?nachricht(_html)?\}\}/;
  const mailvorlageKenntNachricht = Boolean(
    vorlage &&
      [vorlage.subject, vorlage.bodyHtml, vorlage.bodyText ?? ""].some((t) =>
        nachrichtImText.test(t),
      ),
  );
  if (!vorlage) {
    warnungen.push("Fuer diesen Versand ist keine E-Mail-Vorlage hinterlegt.");
  } else if (!mailvorlageKenntNachricht) {
    warnungen.push(
      "Die E-Mail-Vorlage enthaelt die Variable {{nachricht}} nicht — eine eingegebene Nachricht erschiene nicht in der Mail.",
    );
  }

  // Ein Zwischenspeicher fuer genau diese Vorpruefung — siehe
  // neuerResolverSpeicher. Der Dialog stoesst sie nach jeder Aenderung erneut
  // an, jeder gesparte Lauf zaehlt hier also doppelt.
  const aufloesen = neuerResolverSpeicher(opts.modul);

  for (const pos of zusammen.positionen) {
    if (pos.art === "PDF") {
      // Die Groesse kommt aus der Datenbank, nicht von der Platte: Sie wird
      // beim Upload aus den tatsaechlichen Bytes geschrieben und danach nie
      // veraendert, und die Vorpruefung laeuft nach JEDER Aenderung im Dialog
      // erneut. Frueher stand hier ein vollstaendiges readUploadedFile, nur um
      // .length zu lesen — bei drei Anhaengen zu je zwei Megabyte sechs
      // Megabyte je Tastendruck im Adressfeld.
      //
      // Der Versand misst weiterhin die echten Bytes. Die 413-Grenze haengt
      // dort und nur dort; hier geht es um eine Anzeige.
      const groesse = pos.fileSize ?? 0;
      // Kennzeichen fuer den Dialog: Genau dieser Fehlschlag laesst den Versand
      // spaeter mit DATEI_FEHLT (409) abbrechen — lesePoolDokument nimmt
      // denselben Weg durch pfadInWurzeln. Die Warnung darunter sagt dasselbe
      // in Worten; der Dialog darf sie aber nicht nach Stichworten durchsuchen,
      // um daraus eine Sperre zu bauen, also bekommt er ein Kennzeichen.
      let blockiert = false;
      try {
        // Kein Byte, nur der aufgeloeste Pfad: realpath wirft sowohl bei einer
        // fehlenden Datei als auch bei einem Pfad ausserhalb des Pool-
        // Verzeichnisses. Damit bleibt die Zusage der Vorpruefung erhalten —
        // "dieses Dokument wuerde den Versand abbrechen" — ohne dass dafuer
        // noch etwas gelesen werden muesste.
        //
        // BEWUSSTE LUECKE, und zwar eine bezahlte: Geprueft wird der Pfad, NICHT
        // die Lesbarkeit. Stimmen die Rechte im uploads-Volume nicht (der
        // Container laeuft als uid 1001 — siehe CLAUDE.md), existiert die Datei,
        // realpath ist zufrieden, und erst der Versand faellt mit EACCES in den
        // 409. Der Preis dafuer ist bekannt und wird trotzdem gezahlt: Der Dialog
        // stoesst diese Pruefung 500 ms nach JEDER Aenderung erneut an; ein
        // probeweises Oeffnen jeder Pool-Datei bei jedem Tastendruck im
        // Adressfeld waere teurer als der seltene, gut erkennbare Rechte-Fehler.
        // Wer das aendern will, prueft die Lesbarkeit (open/close statt read),
        // nicht den Inhalt — sonst sind die eingesparten Megabyte wieder da.
        await pfadInWurzeln(pos.dateipfad!, POOL_WURZELN);
      } catch {
        blockiert = true;
        warnungen.push(`Dokument "${pos.name}" fehlt im Speicher und wuerde den Versand abbrechen.`);
      }
      positionen.push({
        art: "PDF",
        id: pos.id,
        name: pos.name,
        groesse,
        geschaetzt: false,
        fehlendeFelder: [],
        sensibleFelder: [],
        bestaetigungNoetig: false,
        blockiert,
      });
      continue;
    }

    // Sensible Schluessel gehen NICHT an den Resolver — er entschluesselt hier
    // also nichts, unabhaengig davon, ob die Vorlage spaeter bestaetigt wird.
    const gesperrt = new Set(pos.sensibleFelder.map((f) => f.key.toLowerCase()));
    const alle = Array.isArray(pos.platzhalter)
      ? pos.platzhalter.filter((x): x is string => typeof x === "string")
      : [];
    const ohneSensible = alle.filter((k) => !gesperrt.has(k.trim().toLowerCase()));

    const aufgeloest = await aufloesen({
      organizationId: vorgang.organizationId,
      refId: opts.refId,
      placeholders: ohneSensible,
      session: opts.session,
      ipAddress: null,
    });

    // Marker setzen, damit die sensiblen Felder nicht als "leer" erscheinen.
    const daten = { ...aufgeloest.data };
    for (const f of pos.sensibleFelder) daten[f.key] = SENSIBEL_MARKER;

    let fehlendeFelder: string[] = [];
    let groesse = 0;
    // Dieselben zwei Schritte macht der Versand (leseVorlagenDatei, renderDocx)
    // und bricht dort mit DATEI_FEHLT bzw. VORLAGE_FEHLERHAFT ab — beides 409.
    // Scheitert der Probelauf hier, wuerde also auch der echte Lauf scheitern.
    //
    // Bewusst NICHT blockierend: leere Felder. Sie stehen in fehlendeFelder,
    // das Dokument geht mit Luecken hinaus, und der Versand kennt dafuer keinen
    // Abbruch — nur eine Warnung. Ebenso wenig gehoeren PDF-Dienst (502),
    // Groessengrenze (413), Empfaengerfreigabe und Bestaetigungspflicht hier
    // hinein: Fuer jedes davon traegt die Pruefung ein eigenes Feld.
    let blockiert = false;
    // Zwei getrennte Schritte statt eines gemeinsamen try, weil ihre Fehler
    // grundverschieden sind — und nur einer davon gefahrlos in den Browser darf.
    let quelle: Buffer | null = null;
    try {
      quelle = await leseVorlagenDatei(pos.dateipfad!);
    } catch (e) {
      blockiert = true;
      // Die Meldung des Dateisystems geht hier bewusst NICHT mit hinaus. Sie
      // lautet woertlich "ENOENT: no such file or directory, open
      // '/app/uploads/brief-vorlagen/<datei>'" und truege damit den absoluten
      // Serverpfad bis in den Browser — die Verzeichnisstruktur des Servers ist
      // nichts, was eine Fehlermeldung ueber ein fehlendes Dokument verraten
      // muss. Dem Nutzer hilft sie ohnehin nicht: Er kann auf dem Server nichts
      // nachsehen, er kann die Vorlage nur in der Vorlagenverwaltung suchen —
      // und dafuer genuegen Name und Dateiname.
      //
      // Der vollstaendige Pfad bleibt erhalten, nur an der richtigen Stelle:
      // im Serverprotokoll, wo ihn beim Suchen jemand braucht, der ohnehin
      // Zugriff auf die Maschine hat.
      console.error(
        `[Dokumentenpaket] Vorlage "${pos.name}" nicht lesbar (${pos.dateipfad}):`,
        e,
      );
      warnungen.push(
        `Vorlage "${pos.name}" (Datei "${dateinameOhnePfad(pos.dateipfad)}") konnte nicht geladen werden und wuerde den Versand abbrechen.`,
      );
    }

    if (quelle) {
      try {
        const gerendert = renderDocx(quelle, daten);
        groesse = gerendert.buffer.length;
        fehlendeFelder = gerendert.missing.filter((k) => !gesperrt.has(k.trim().toLowerCase()));
      } catch (e) {
        blockiert = true;
        // Diese Meldung darf unveraendert hinaus: Sie stammt aus
        // doc-templates.ts, beschreibt die Vorlage selbst ("Ein Platzhalter
        // wurde nicht geschlossen") und kennt keinen Pfad — renderDocx bekommt
        // einen Puffer und weiss gar nicht, woher er stammt. Genau diese
        // Meldung ist das, womit jemand die Vorlage reparieren kann.
        warnungen.push(
          `Vorlage "${pos.name}" konnte nicht probeweise befuellt werden: ${
            e instanceof Error ? e.message : "Unbekannter Fehler"
          }`,
        );
      }
    }

    positionen.push({
      art: "VORLAGE",
      id: pos.id,
      name: pos.name,
      groesse,
      geschaetzt: true,
      fehlendeFelder,
      sensibleFelder: pos.sensibleFelder,
      bestaetigungNoetig: pos.sensibleFelder.length > 0,
      blockiert,
    });
  }

  // Zwei Zahlen aus derselben Summe, und sie duerfen nicht verwechselt werden:
  //
  // `gesamtGroesse` ist der ANZEIGEWERT — die Rohbytes der Anhaenge. Genau das
  // will die Person wissen, die im Dialog "8,2 MB von 15 MB" liest: wie gross
  // ihre Dokumente sind, nicht wie gross deren base64-Fassung waere.
  //
  // Die GRENZE dagegen gilt fuer die fertige Nachricht. Der Versand misst in
  // Abschnitt 7 kodierteGroesse(...) und weist mit 413 ab; die Vorpruefung hat
  // hier lange die Rohbytes verglichen. Das Fenster dazwischen — rund 11,25 MB
  // bis 15 MB roh — meldete "passt", der Dialog gab den Knopf frei, und der
  // Klick lief in denselben 413, den die Knopfsperre gerade verhindern soll.
  // Beide Seiten muessen dieselbe Zahl vergleichen, sonst ist die Vorpruefung
  // an ihrer wichtigsten Stelle eine Zusage, die der Versand nicht haelt.
  const gesamtGroesse = positionen.reduce((s, p) => s + p.groesse, 0);
  const empfaenger = (opts.empfaenger || "").trim();

  // Dieselbe Entscheidung wie im Versand, nur folgenlos: Der Dialog soll den
  // Knopf schon waehrend des Tippens sperren koennen, statt die Person erst
  // nach dem Klick in einen 409 laufen zu lassen.
  const erlaubteDomains = await ladeErlaubteDomains();
  // Ohne eingegebene Adresse gibt es nichts zu pruefen — der Dialog ruft die
  // Vorpruefung auch dann, wenn das Feld noch leer ist.
  const empfaengerErlaubt =
    empfaenger === "" ||
    empfaengerFreigegeben({
      empfaenger,
      empfaengerVorgang: vorgang.empfaenger,
      domains: erlaubteDomains,
    });

  return {
    status: "OK",
    pruefung: {
      empfaengerVorgang: vorgang.empfaenger,
      empfaengerAbweichend:
        empfaenger !== "" && empfaenger.toLowerCase() !== vorgang.empfaenger.toLowerCase(),
      empfaengerErlaubt,
      erlaubteDomains,
      positionen,
      gesamtGroesse,
      gesamtGeschaetzt: positionen.some((p) => p.geschaetzt),
      // Dieselbe Rechnung wie im Versand (Abschnitt 7), damit die Vorpruefung
      // nicht freigibt, was der Versand dann mit 413 abweist. Die Groesse der
      // Vorlagen ist dabei geschaetzt (docx vor der PDF-Wandlung) — das steht
      // in `gesamtGeschaetzt` und bleibt so; eine Schaetzung ist hier besser als
      // gar keine Warnung.
      ueberGroessenGrenze: kodierteGroesse(gesamtGroesse) > MAX_PAKET_BYTES,
      pdfDienstErreichbar,
      mailvorlageKenntNachricht,
      warnungen,
    },
  };
}

// =============================================
// HTTP-Zuordnung
// =============================================

/**
 * Ein Fehlerbild, ein Status — hier und nicht in den Routen, damit Vorpruefung
 * und Versand nicht auseinanderlaufen.
 *
 * 409 sammelt die Faelle, in denen das Paket in seiner jetzigen
 * Zusammenstellung nicht versendbar ist: Die aufrufende Person kann etwas
 * daran aendern (Bestaetigung setzen, ein Dokument entfernen). 502 steht fuer
 * die beiden fremden Dienste, an denen es liegen kann.
 */
export function statusFuerFehler(fehler: PaketFehler): number {
  switch (fehler) {
    // 404 auch bei fehlendem Zugriff — Hausstandard: Ueber den Statuscode
    // soll niemand erfahren, dass ein fremder Vorgang existiert. Aus
    // demselben Grund lautet der Text beider Faelle gleich.
    case "KEIN_ZUGRIFF":
    case "VORGANG_NICHT_GEFUNDEN":
      return 404;
    case "LEERE_AUSWAHL":
    case "BESTAETIGUNG_FEHLT":
    case "DATEI_FEHLT":
    case "VORLAGE_FEHLERHAFT":
      return 409;
    case "ZU_GROSS":
      return 413;
    case "PDF_DIENST":
    case "VERSAND":
      return 502;
    case "VERSAND_LAEUFT":
      return 409;
    // 409 und nicht 403: Die aufrufende Person DARF versenden, nur nicht an
    // diese Adresse — sie kann es selbst beheben, indem sie die Adresse des
    // Vorgangs nimmt. Genau die Bedeutung, die 409 hier schon traegt. 403
    // hiesse "du darfst hier gar nichts", und das waere falsch.
    case "EMPFAENGER_NICHT_ERLAUBT":
      return 409;
    case "MODUL_NICHT_UNTERSTUETZT":
    case "POSITION_NICHT_VERFUEGBAR":
      return 400;
  }
}

// =============================================
// Zusammenstellung fuer den Dialog
// =============================================

export type AngebotErgebnis =
  | { status: "OK"; angebot: PaketAngebot }
  | { status: "FEHLER"; fehler: PaketFehler; detail: string };

/**
 * Alles, was der Versand-Dialog braucht — in einem Aufruf.
 *
 * Bewusst hier und nicht in der Route: Der Dialog waehlt aus derselben Menge,
 * die der Versand spaeter akzeptiert. Zwei getrennte Abfragen wuerden
 * frueher oder spaeter auseinanderlaufen und Positionen anbieten, die der
 * Versand dann mit 400 abweist.
 */
export async function ladePaketAngebot(opts: {
  modul: string;
  refId: string;
  session: SessionPayload;
}): Promise<AngebotErgebnis> {
  if (!modulVerdrahtet(opts.modul)) {
    return {
      status: "FEHLER",
      fehler: "MODUL_NICHT_UNTERSTUETZT",
      detail: `Fuer das Modul "${opts.modul}" ist kein Paketversand eingerichtet.`,
    };
  }

  const vorgang = await MODULE[opts.modul].lade(opts.refId);
  if (!vorgang) {
    return {
      status: "FEHLER",
      fehler: "VORGANG_NICHT_GEFUNDEN",
      detail: NICHT_GEFUNDEN_TEXT,
    };
  }
  if (!(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return {
      status: "FEHLER",
      fehler: "KEIN_ZUGRIFF",
      detail: NICHT_GEFUNDEN_TEXT,
    };
  }

  const org = vorgang.organizationId;
  const [pdfs, vorlagen, auswahl, verlauf] = await Promise.all([
    prisma.starterpaketDokument.findMany({
      where: { isActive: true, OR: [{ organizationId: null }, { organizationId: org }] },
      select: {
        id: true,
        name: true,
        beschreibung: true,
        organizationId: true,
        fileSize: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.documentTemplate.findMany({
      where: {
        isActive: true,
        modul: { in: [opts.modul, "ALLGEMEIN"] },
        OR: [{ organizationId: null }, { organizationId: org }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        organizationId: true,
        fileSize: true,
        platzhalter: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.starterpaketAuswahl.findMany({
      where: { organizationId: org, modul: opts.modul },
      orderBy: { orderIndex: "asc" },
      select: { dokumentId: true, templateId: true },
    }),
    prisma.dokumentenVersand.findMany({
      where: { modul: opts.modul, refId: opts.refId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        empfaenger: true,
        anzahl: true,
        empfaengerAbweichend: true,
      },
    }),
  ]);

  const verfuegbar: PaketAngebotPosition[] = [
    ...pdfs.map((d) => ({
      art: "PDF" as const,
      id: d.id,
      name: d.name,
      beschreibung: d.beschreibung,
      scope: (d.organizationId ? "MANDANT" : "GLOBAL") as "GLOBAL" | "MANDANT",
      groesse: d.fileSize,
      sensibleFelder: [],
    })),
    ...vorlagen.map((t) => ({
      art: "VORLAGE" as const,
      id: t.id,
      name: t.name,
      beschreibung: t.description,
      scope: (t.organizationId ? "MANDANT" : "GLOBAL") as "GLOBAL" | "MANDANT",
      groesse: t.fileSize,
      sensibleFelder: sensiblePlatzhalter(t.platzhalter),
    })),
  ];

  // Nur, was es noch gibt: Eine geloeschte oder deaktivierte Position bliebe
  // sonst als Vorauswahl stehen und der Versand wiese sie ab.
  const vorhanden = new Set(verfuegbar.map((p) => `${p.art}:${p.id}`));
  const standardpaket = auswahl
    .map((a) =>
      a.dokumentId
        ? { art: "PDF" as const, id: a.dokumentId }
        : a.templateId
          ? { art: "VORLAGE" as const, id: a.templateId }
          : null,
    )
    .filter((p): p is { art: "PDF" | "VORLAGE"; id: string } => p !== null)
    .filter((p) => vorhanden.has(`${p.art}:${p.id}`));

  return {
    status: "OK",
    angebot: {
      modul: opts.modul,
      organizationId: org,
      empfaengerVorschlag: vorgang.empfaenger,
      vorname: vorgang.vorname,
      nachname: vorgang.nachname,
      displayId: vorgang.displayId,
      standardpaket,
      verfuegbar,
      verlauf,
      altversand: vorgang.altversand ?? null,
      maxBytes: MAX_PAKET_BYTES,
    },
  };
}
