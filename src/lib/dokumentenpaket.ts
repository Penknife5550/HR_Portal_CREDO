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
import { readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { readUploadedFile, saveUploadedFile } from "@/lib/file-upload";
import { sendEventEmail, resolveEventTemplate, type MailAttachment } from "@/lib/mailer";
import { renderDocx, TemplateError } from "@/lib/doc-templates";
import { convertDocxToPdf, isGotenbergReachable } from "@/lib/gotenberg";
import { getResolver, hasModuleResolver } from "@/lib/doc-template-resolvers";
import { sensiblePlatzhalter, type SensiblesFeld } from "@/lib/placeholder-catalog";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { istModulUnterstuetzt } from "@/lib/erzeugte-dokumente";

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
  | "VERSAND";

export interface PaketPositionEingabe {
  art: "PDF" | "VORLAGE";
  id: string;
  /** Nur bei Vorlagen mit sensiblen Feldern noetig — und dort zwingend. */
  bestaetigt?: boolean;
}

/** Ein fertiger Anhang samt allem, was in den Nachweis gehoert. */
export interface PaketDokument {
  art: "PDF" | "VORLAGE";
  name: string;
  dateiname: string;
  hash: string;
  groesse: number;
  templateId?: string;
  generatedDocumentId?: string;
  /** Platzhalter, die leer geblieben sind — Warnung, kein Abbruch. */
  fehlendeFelder: string[];
  /** Sensible Felder, die fuer dieses Dokument entschluesselt wurden. */
  sensibleFelder: string[];
}

export type PaketErgebnis =
  | {
      status: "SENT";
      versandId: string;
      empfaenger: string;
      dokumente: PaketDokument[];
      warnungen: string[];
    }
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
}

interface ModulEintrag {
  /** Event der Mailvorlage. Fehlt es, ist das Modul noch nicht verdrahtet. */
  event: string;
  lade: (refId: string) => Promise<VorgangsKontext | null>;
}

/**
 * Je Modul ein Eintrag.
 *
 * Phase 1 verdrahtet nur Onboarding. Offboarding, Verbeamtung und
 * Vertragsverlaengerung brauchen je eine eigene Mailvorlage mit abgestimmtem
 * Text (Baustein 13) — sie hier ohne Vorlage einzutragen wuerde einen Versand
 * ermoeglichen, dessen Anschreiben niemand gelesen hat. Deshalb erst dann.
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
 * Liest eine Vorlagendatei — aus den beiden Verzeichnissen, in denen Vorlagen
 * legitim liegen, und aus keinem anderen.
 *
 * Hochgeladene Vorlagen liegen unter uploads/. System-Vorlagen liegen
 * bewusst als Asset unter public/system-dokumente/ (sie werden beim Start
 * geseedet, nicht hochgeladen) — readUploadedFile weist sie deshalb ab.
 *
 * Die bestehende Erzeugen-Route liest die Datei ohne jede Pruefung. Das wird
 * hier nicht nachgemacht: dateipfad steht in der Datenbank, und eine
 * manipulierte Zeile duerfte sonst jede Datei des Servers als Anhang
 * verschicken.
 */
async function leseVorlagenDatei(dateipfad: string): Promise<Buffer> {
  const wurzeln = [
    path.resolve(path.join(process.cwd(), "uploads")),
    path.resolve(path.join(process.cwd(), "public", "system-dokumente")),
  ];
  const ziel = path.resolve(dateipfad);
  if (!wurzeln.some((w) => ziel === w || ziel.startsWith(w + path.sep))) {
    throw new Error("Pfad ausserhalb der erlaubten Vorlagen-Verzeichnisse");
  }
  return readFile(ziel);
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Auf ASCII reduzierter Dateiname — wie beim Download erzeugter Dokumente. */
function ascii(name: string): string {
  return name.replace(/[^\w\-.]/g, "_");
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
  const datum = stichtag.toISOString().slice(0, 10);
  const teile = [vorlagenName, nachname].filter((t) => t && t.trim() !== "");
  return ascii(`${teile.join("_")}_${datum}.pdf`).slice(0, 150);
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
          select: { id: true, name: true, dateipfad: true, originalName: true, hash: true },
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

export async function versendePaket(opts: VersandOptionen): Promise<PaketErgebnis> {
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
    return fehler("VORGANG_NICHT_GEFUNDEN", "Der Vorgang wurde nicht gefunden.");
  }

  // --- 3. Mandant ---
  // Muss hier stehen und nicht nur im Resolver: Der Resolver faellt bei
  // fehlendem Zugriff still auf die allgemeinen Platzhalter zurueck. Ohne diese
  // Zeile ginge ein leeres Schreiben an eine echte Adresse.
  if (!(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return fehler("KEIN_ZUGRIFF", "Kein Zugriff auf den Mandanten dieses Vorgangs.");
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

  for (const [index, pos] of zusammen.positionen.entries()) {
    if (pos.art === "PDF") {
      let inhalt: Buffer;
      try {
        inhalt = await readUploadedFile(pos.dateipfad!);
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
        hash: sha256(inhalt),
        groesse: inhalt.length,
        fehlendeFelder: [],
        sensibleFelder: [],
      });
      continue;
    }

    // --- Vorlage: befuellen, wandeln ---
    const resolver = getResolver(opts.modul);
    const aufgeloest = await resolver({
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
      hash: sha256(pdf),
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
      hash: sha256(gerendert.buffer),
      fehlendeFelder: gerendert.missing,
      index: dokumente.length - 1,
    });
  }

  // --- 7. Groesse ---
  const gesamt = anhaenge.reduce((s, a) => s + a.content.length, 0);
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
  const dokumentenliste = dokumente.map((d, i) => `${i + 1}. ${d.name}`).join("\n");
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
      nachricht: opts.nachricht ?? "",
      dokumentenliste,
      sachbearbeiter_name: `${opts.session.firstName} ${opts.session.lastName}`.trim(),
    },
    { attachments: anhaenge },
  );

  if (ergebnis.status !== "SENT") {
    return fehler(
      "VERSAND",
      ergebnis.detail || "Die E-Mail konnte nicht versendet werden.",
    );
  }

  // --- 9. Nachweis (erst jetzt, und in einer Transaktion) ---
  const abweichend = empfaenger.toLowerCase() !== (vorgang.empfaenger || "").toLowerCase();
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
  await prisma.$transaction(async (tx) => {
    await tx.dokumentenVersand.create({
      data: {
        id: versandId,
        modul: opts.modul,
        refId: opts.refId,
        organizationId: vorgang.organizationId,
        empfaenger,
        empfaengerVorgang: vorgang.empfaenger,
        empfaengerAbweichend: abweichend,
        // Der Betreff kommt aus der Mailvorlage und wird vom Mailer
        // zurueckgemeldet. Ihn hier selbst zusammenzusetzen hiesse, im Nachweis
        // etwas zu behaupten, das so nie versendet wurde.
        betreff: ergebnis.subject ?? "",
        nachricht: opts.nachricht || null,
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
          name: `${a.name} (${jetzt.toISOString().slice(0, 10)})`,
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
          empfaenger,
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
  });

  return { status: "SENT", versandId, empfaenger, dokumente, warnungen };
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

export interface PruefPosition {
  art: "PDF" | "VORLAGE";
  id: string;
  name: string;
  groesse: number;
  /**
   * Bei Vorlagen ist die Groesse geschaetzt: Gemessen wird das befuellte
   * Word-Dokument, versendet wird das daraus gewandelte PDF. Die Vorpruefung
   * ruft den PDF-Dienst bewusst nicht — sie soll schnell und folgenlos sein.
   */
  geschaetzt: boolean;
  fehlendeFelder: string[];
  sensibleFelder: SensiblesFeld[];
  bestaetigungNoetig: boolean;
}

export interface PaketPruefung {
  empfaengerVorgang: string;
  empfaengerAbweichend: boolean;
  positionen: PruefPosition[];
  gesamtGroesse: number;
  gesamtGeschaetzt: boolean;
  ueberGroessenGrenze: boolean;
  pdfDienstErreichbar: boolean;
  /**
   * Kennt die Mailvorlage die Variable {{nachricht}}? Wer die Vorlage in der
   * Datenbank angepasst hat, hat sie moeglicherweise nicht — dann verschwaende
   * die eingegebene Nachricht stillschweigend.
   */
  mailvorlageKenntNachricht: boolean;
  warnungen: string[];
}

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
      detail: "Der Vorgang wurde nicht gefunden.",
    };
  }
  if (!(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return {
      status: "FEHLER",
      fehler: "KEIN_ZUGRIFF",
      detail: "Kein Zugriff auf den Mandanten dieses Vorgangs.",
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
  const mailvorlageKenntNachricht = Boolean(
    vorlage &&
      [vorlage.subject, vorlage.bodyHtml, vorlage.bodyText ?? ""].some((t) =>
        t.includes("{{nachricht}}"),
      ),
  );
  if (!vorlage) {
    warnungen.push("Fuer diesen Versand ist keine E-Mail-Vorlage hinterlegt.");
  } else if (!mailvorlageKenntNachricht) {
    warnungen.push(
      "Die E-Mail-Vorlage enthaelt die Variable {{nachricht}} nicht — eine eingegebene Nachricht erschiene nicht in der Mail.",
    );
  }

  for (const pos of zusammen.positionen) {
    if (pos.art === "PDF") {
      let groesse = 0;
      try {
        groesse = (await readUploadedFile(pos.dateipfad!)).length;
      } catch {
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

    const aufgeloest = await getResolver(opts.modul)({
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
    try {
      const quelle = await leseVorlagenDatei(pos.dateipfad!);
      const gerendert = renderDocx(quelle, daten);
      groesse = gerendert.buffer.length;
      fehlendeFelder = gerendert.missing.filter((k) => !gesperrt.has(k.trim().toLowerCase()));
    } catch (e) {
      warnungen.push(
        `Vorlage "${pos.name}" konnte nicht probeweise befuellt werden: ${
          e instanceof Error ? e.message : "Unbekannter Fehler"
        }`,
      );
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
    });
  }

  const gesamtGroesse = positionen.reduce((s, p) => s + p.groesse, 0);
  const empfaenger = (opts.empfaenger || "").trim();

  return {
    status: "OK",
    pruefung: {
      empfaengerVorgang: vorgang.empfaenger,
      empfaengerAbweichend:
        empfaenger !== "" && empfaenger.toLowerCase() !== vorgang.empfaenger.toLowerCase(),
      positionen,
      gesamtGroesse,
      gesamtGeschaetzt: positionen.some((p) => p.geschaetzt),
      ueberGroessenGrenze: gesamtGroesse > MAX_PAKET_BYTES,
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
    case "KEIN_ZUGRIFF":
      return 403;
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
    case "MODUL_NICHT_UNTERSTUETZT":
    case "POSITION_NICHT_VERFUEGBAR":
      return 400;
  }
}

// =============================================
// Zusammenstellung fuer den Dialog
// =============================================

export interface PaketAngebotPosition {
  art: "PDF" | "VORLAGE";
  id: string;
  name: string;
  beschreibung: string | null;
  scope: "GLOBAL" | "MANDANT";
  groesse: number;
  sensibleFelder: SensiblesFeld[];
}

export interface PaketAngebot {
  modul: string;
  organizationId: string;
  empfaengerVorschlag: string;
  vorname: string;
  nachname: string;
  displayId: string | null;
  /** Standardpaket des Mandanten, in Reihenfolge — im Dialog vorausgewaehlt. */
  standardpaket: { art: "PDF" | "VORLAGE"; id: string }[];
  /** Alles Waehlbare, Standardpaket eingeschlossen. */
  verfuegbar: PaketAngebotPosition[];
  verlauf: {
    id: string;
    createdAt: Date;
    empfaenger: string;
    anzahl: number;
    empfaengerAbweichend: boolean;
  }[];
  maxBytes: number;
}

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
      detail: "Der Vorgang wurde nicht gefunden.",
    };
  }
  if (!(await canAccessProcess(opts.session, vorgang.organizationId))) {
    return {
      status: "FEHLER",
      fehler: "KEIN_ZUGRIFF",
      detail: "Kein Zugriff auf den Mandanten dieses Vorgangs.",
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
      maxBytes: MAX_PAKET_BYTES,
    },
  };
}
