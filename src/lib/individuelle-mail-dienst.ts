/**
 * Individuelle E-Mail aus einem Vorgang (Paket 3) — der Server-Teil.
 *
 * Regeln, Grenzen und Texte stehen rein in src/lib/individuelle-mail.ts. Hier:
 * Vorgang laden, Anhaenge pruefen, versenden, Nachweis schreiben, Anhaenge
 * wieder oeffnen, nach 12 Monaten aufraeumen.
 *
 * Dieselben Schutzregeln wie beim Dokumentenpaket (dokumentenpaket.ts), ohne es
 * anzufassen:
 *
 * 1. **Mandant selbst pruefen.** Unbekannt und fremd ergeben dieselbe 404.
 * 2. **Abweichende Adressen nur mit Freigabe.** Die Adressen des Vorgangs sind
 *    immer erlaubt (im Offboarding private UND dienstliche), jede andere nur,
 *    wenn ihre Domain in SmtpConfig.allowedRecipientDomains steht — leere Liste
 *    = keine Einschraenkung. Geprueft VOR dem Versand.
 * 3. **Nachweis nur nach echtem SENT**, in EINER Transaktion mit dem
 *    AuditLog. Scheitert sie nach dem Versand, bleibt das Ergebnis SENT mit
 *    lauter Warnung — ein Fehlschlag verleitete zum Doppelversand.
 * 4. **Anhaenge nur nach den Bytes** (erkenneDateityp), Anzeigename bereinigt,
 *    Endung immer die des erkannten Typs. Abgelegt unter
 *    uploads/individuelle-mails/<mailId>/, gelesen und geloescht NUR unter
 *    dieser Wurzel (nie uploads als Ganzes — darunter liegt uploads/bem/).
 * 5. **Einmal je Dialog.** Jeder geoeffnete Dialog schickt eine eigene
 *    Kennung mit. Bricht die Verbindung nach dem Versand ab und HR klickt
 *    erneut, findet der zweite Aufruf den Nachweis und schickt nichts.
 *
 * Dritte Stelle, die sendEventEmail DIREKT ruft statt triggerWebhooks — mit
 * derselben Begruendung wie das Dokumentenpaket: Der Dispatcher reicht weder
 * Anhaenge noch overrideTo durch, und frei gewaehlte Personalunterlagen
 * gehoeren an keine frei konfigurierbare Webhook-URL (CLAUDE.md, „E-Mail-Versand“;
 * EVENTS_OHNE_WEBHOOK in ereignis-liste.ts).
 */
import crypto from "crypto";
import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import {
  ENDUNG_FUER_DATEITYP,
  anzeigeNameBereinigen,
  dateiLoeschen,
  deleteUploadedDirIfEmpty,
  erkenneDateityp,
  istErkannterDateityp,
  pfadInWurzeln,
  saveUploadedFile,
  sha256Hex,
  type ErkannterDateityp,
} from "@/lib/file-upload";
import { sendEventEmail, type MailAttachment } from "@/lib/mailer";
import { canAccessProcess, type SessionPayload } from "@/lib/permissions";
import { empfaengerFreigegeben, ladeErlaubteDomains, normalisiereDomains } from "@/lib/empfaenger-allowlist";
import { alsHtmlAbsaetze, escapeHtml } from "@/lib/email-layout";
import { bezugAusModul } from "@/lib/vorgangs-mails";
import { vorgangsKontextLaden, type VorgangsKontext } from "@/lib/dokumentenpaket";
import { individuelleMailEingabeSchema } from "@/lib/validations/individuelle-mail";
import {
  INDIVIDUELLE_MAIL_AUDIT,
  INDIVIDUELLE_MAIL_EVENT,
  MAX_ANHAENGE,
  MAX_ANHAENGE_BYTES,
  MELDUNGEN,
  istIndividuelleMailModul,
  type IndividuelleMailAnhangZeile,
  type IndividuelleMailFehler,
  type IndividuelleMailModul,
  type IndividuelleMailUebersicht,
  type IndividuelleMailVerlaufZeile,
  type IndividuelleMailVersandAntwort,
} from "@/lib/individuelle-mail";

/** Die einzige Wurzel, unter der Anhaenge gelesen und geloescht werden. */
export const ANHANG_WURZEL = path.join(process.cwd(), "uploads", "individuelle-mails");
const UPLOADS = path.join(process.cwd(), "uploads");

export type MailErgebnis<T> =
  | { ok: true; daten: T }
  | { ok: false; fehler: IndividuelleMailFehler; meldung: string };

function fehler<T>(f: IndividuelleMailFehler, meldung: string): MailErgebnis<T> {
  return { ok: false, fehler: f, meldung };
}

// =============================================
// Vorgang je Modul
// =============================================

/**
 * Der Vorgang kommt aus demselben Lader wie beim Dokumentenpaket
 * (`vorgangsKontextLaden`) — Namen, Nummer, Mandant und alle Adressen
 * (Offboarding: private vor dienstlicher). Eine Regel, eine Stelle.
 */
type Vorgang = VorgangsKontext;

/** Vorgang laden UND Zugriff pruefen — unbekannt und fremd sind von aussen gleich. */
async function vorgangMitZugriff(
  modul: string,
  refId: string,
  session: SessionPayload,
): Promise<MailErgebnis<{ modul: IndividuelleMailModul; vorgang: Vorgang }>> {
  if (!istIndividuelleMailModul(modul)) {
    return fehler("MODUL_NICHT_UNTERSTUETZT", "Für dieses Modul gibt es keine individuelle E-Mail.");
  }
  const vorgang = await vorgangsKontextLaden(modul, refId);
  if (!vorgang || !(await canAccessProcess(session, vorgang.organizationId))) {
    return fehler("VORGANG_NICHT_GEFUNDEN", MELDUNGEN.nichtGefunden);
  }
  return { ok: true, daten: { modul, vorgang } };
}

/** Verknuepfung des AuditLogs mit dem Vorgang (erscheint im Protokoll des Vorgangs). */
function auditBezug(modul: IndividuelleMailModul, refId: string) {
  switch (modul) {
    case "ONBOARDING":
      return { onboardingId: refId, processType: "ONBOARDING" };
    case "OFFBOARDING":
      return { offboardingId: refId, processType: "OFFBOARDING" };
    case "VERBEAMTUNG":
      return { civilServiceId: refId, processType: "CIVIL_SERVICE" };
    case "VERTRAGSVERLAENGERUNG":
      return { contractEndId: refId, processType: "CONTRACT_END" };
  }
}

// =============================================
// Uebersicht (Karte und Dialog)
// =============================================

const VERLAUF_AUSWAHL = {
  id: true,
  createdAt: true,
  empfaenger: true,
  empfaengerAbweichend: true,
  betreff: true,
  inhaltGeloeschtAm: true,
  sentBy: { select: { firstName: true, lastName: true } },
  anhaenge: {
    orderBy: { reihenfolge: "asc" as const },
    select: { id: true, dateiname: true, groesse: true, sha256: true, dateipfad: true },
  },
};

type VerlaufRoh = {
  id: string;
  createdAt: Date;
  empfaenger: string;
  empfaengerAbweichend: boolean;
  betreff: string;
  inhaltGeloeschtAm: Date | null;
  sentBy: { firstName: string; lastName: string } | null;
  anhaenge: { id: string; dateiname: string; groesse: number; sha256: string; dateipfad: string | null }[];
};

function anhangZeile(a: VerlaufRoh["anhaenge"][number]): IndividuelleMailAnhangZeile {
  return { id: a.id, dateiname: a.dateiname, groesse: a.groesse, sha256: a.sha256, verfuegbar: a.dateipfad !== null };
}

function verlaufZeile(m: VerlaufRoh): IndividuelleMailVerlaufZeile {
  return {
    id: m.id,
    gesendetAm: m.createdAt.toISOString(),
    empfaenger: m.empfaenger,
    empfaengerAbweichend: m.empfaengerAbweichend,
    betreff: m.betreff,
    gesendetVon: m.sentBy ? `${m.sentBy.firstName} ${m.sentBy.lastName}`.trim() : null,
    anhaenge: m.anhaenge.map(anhangZeile),
    inhaltGeloescht: m.inhaltGeloeschtAm !== null,
  };
}

export async function uebersichtLaden(opts: {
  modul: string;
  refId: string;
  session: SessionPayload;
}): Promise<MailErgebnis<IndividuelleMailUebersicht>> {
  const zugang = await vorgangMitZugriff(opts.modul, opts.refId, opts.session);
  if (!zugang.ok) return zugang;
  const { modul, vorgang } = zugang.daten;

  const [verlauf, smtp] = await Promise.all([
    prisma.individuelleMail.findMany({
      where: { modul, refId: opts.refId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: VERLAUF_AUSWAHL,
    }),
    // Antwortadresse und Freigabeliste stehen in derselben Zeile — einmal lesen.
    prisma.smtpConfig.findUnique({
      where: { id: "default" },
      select: { replyToEmail: true, allowedRecipientDomains: true },
    }),
  ]);

  return {
    ok: true,
    daten: {
      vorgang: {
        name: `${vorgang.vorname} ${vorgang.nachname}`.trim(),
        displayId: vorgang.displayId,
        einrichtung: vorgang.organizationName,
        adressen: vorgang.adressen,
      },
      erlaubteDomains: normalisiereDomains(smtp?.allowedRecipientDomains ?? "").domains,
      antwortAn: smtp?.replyToEmail ?? "",
      verlauf: (verlauf as VerlaufRoh[]).map(verlaufZeile),
    },
  };
}

// =============================================
// Versand
// =============================================

export interface HochgeladeneDatei {
  name: string;
  inhalt: Buffer;
}

export interface MailSendenOptionen {
  modul: string;
  refId: string;
  dialogKennung: string;
  empfaenger: string;
  betreff: string;
  nachricht: string;
  dateien: HochgeladeneDatei[];
  session: SessionPayload;
  ipAddress?: string | null;
}

interface GepruefterAnhang {
  id: string;
  dateiname: string;
  mimeType: ErkannterDateityp;
  inhalt: Buffer;
  sha256: string;
}

/**
 * Laufende Versendungen je Dialog-Kennung. Ein Doppelklick oder ein zweiter
 * Aufruf, waehrend der erste noch beim Mailserver haengt, darf nicht zweimal
 * schicken — der Nachweis, an dem der zweite Aufruf das sonst erkennt, entsteht
 * erst NACH dem Versand.
 *
 * Dazu die Kennungen, deren Mail hinausging, deren Nachweis aber scheiterte:
 * Ohne Zeile in der Datenbank faende der naechste Versuch nichts und schickte
 * noch einmal. Beides BEWUSST prozesslokal (ein Container, wie beim
 * Dokumentenpaket); beim waagerechten Skalieren durch eine gemeinsame Ablage
 * ersetzen. Die Merker ohne Nachweis gelten 24 Stunden — so lange klickt
 * niemand denselben Dialog erneut, und die Liste waechst nicht unbegrenzt.
 */
const laufendeKennungen = new Set<string>();
const versendetOhneNachweis = new Map<string, { am: number; antwort: IndividuelleMailVersandAntwort }>();
const OHNE_NACHWEIS_MERKEN_MS = 24 * 60 * 60 * 1000;

function ohneNachweisMerken(kennung: string, antwort: IndividuelleMailVersandAntwort): void {
  const jetzt = Date.now();
  for (const [k, v] of versendetOhneNachweis) {
    if (jetzt - v.am > OHNE_NACHWEIS_MERKEN_MS) versendetOhneNachweis.delete(k);
  }
  versendetOhneNachweis.set(kennung, { am: jetzt, antwort });
}

function ohneNachweisFinden(kennung: string): IndividuelleMailVersandAntwort | null {
  const eintrag = versendetOhneNachweis.get(kennung);
  if (!eintrag) return null;
  if (Date.now() - eintrag.am > OHNE_NACHWEIS_MERKEN_MS) {
    versendetOhneNachweis.delete(kennung);
    return null;
  }
  return eintrag.antwort;
}

function anhaengePruefen(dateien: HochgeladeneDatei[]): MailErgebnis<GepruefterAnhang[]> {
  if (dateien.length > MAX_ANHAENGE) return fehler("DATEI_UNGUELTIG", MELDUNGEN.zuVieleAnhaenge);
  const summe = dateien.reduce((s, d) => s + d.inhalt.length, 0);
  if (summe > MAX_ANHAENGE_BYTES) return fehler("ZU_GROSS", MELDUNGEN.zuGross);

  const geprueft: GepruefterAnhang[] = [];
  for (const d of dateien) {
    if (d.inhalt.length === 0) return fehler("DATEI_UNGUELTIG", `„${d.name}“: ${MELDUNGEN.leer}`);
    const typ = erkenneDateityp(d.inhalt);
    if (!typ.ok) {
      return typ.grund === "PDF_UNVOLLSTAENDIG"
        ? fehler("DATEI_UNGUELTIG", `„${d.name}“: ${MELDUNGEN.pdfUnvollstaendig}`)
        : fehler("DATEITYP", `„${d.name}“: ${MELDUNGEN.typNichtErlaubt}`);
    }
    geprueft.push({
      id: crypto.randomUUID(),
      dateiname: anzeigeNameBereinigen(d.name, typ.mimeType),
      mimeType: typ.mimeType,
      inhalt: d.inhalt,
      sha256: sha256Hex(d.inhalt),
    });
  }
  return { ok: true, daten: geprueft };
}

/** Payload der Vorlage `individuelle-mail`. Freitexte roh UND als HTML (maskiert). */
export function mailPayload(opts: {
  modul: IndividuelleMailModul;
  refId: string;
  vorgang: Vorgang;
  empfaenger: string;
  betreff: string;
  nachricht: string;
  anhaenge: { dateiname: string }[];
  absender: string;
}): Record<string, unknown> {
  return {
    modul: opts.modul,
    refId: opts.refId,
    displayId: opts.vorgang.displayId,
    email: opts.empfaenger,
    vorname: opts.vorgang.vorname,
    nachname: opts.vorgang.nachname,
    organization: opts.vorgang.organizationName,
    einrichtung: opts.vorgang.organizationName,
    betreff: opts.betreff,
    nachricht: opts.nachricht,
    nachricht_html: alsHtmlAbsaetze(opts.nachricht),
    anhaenge_anzahl: String(opts.anhaenge.length),
    anhaenge_liste: opts.anhaenge.map((a) => `- ${a.dateiname}`).join("\n"),
    anhaenge_liste_html:
      opts.anhaenge.length === 0
        ? ""
        : `<ul style="margin:0;padding-left:20px;">${opts.anhaenge
            .map((a) => `<li>${escapeHtml(a.dateiname)}</li>`)
            .join("")}</ul>`,
    absender_name: opts.absender,
  };
}

export async function mailSenden(opts: MailSendenOptionen): Promise<MailErgebnis<IndividuelleMailVersandAntwort>> {
  const kennung = opts.dialogKennung;
  if (laufendeKennungen.has(kennung)) return fehler("VERSAND_LAEUFT", MELDUNGEN.versandLaeuft);
  laufendeKennungen.add(kennung);
  try {
    return await sendenIntern(opts);
  } finally {
    laufendeKennungen.delete(kennung);
  }
}

async function sendenIntern(opts: MailSendenOptionen): Promise<MailErgebnis<IndividuelleMailVersandAntwort>> {
  // --- 1. Vorgang und Mandant ---
  const zugang = await vorgangMitZugriff(opts.modul, opts.refId, opts.session);
  if (!zugang.ok) return zugang;
  const { modul, vorgang } = zugang.daten;

  // --- 2. Schon versendet? (zweiter Versuch desselben Dialogs) ---
  const frueher = await prisma.individuelleMail.findUnique({
    where: { dialogKennung: opts.dialogKennung },
    select: { ...VERLAUF_AUSWAHL, modul: true, refId: true },
  });
  if (frueher) {
    // Eine Kennung aus einem anderen Vorgang verraet nichts ueber ihn.
    if (frueher.modul !== modul || frueher.refId !== opts.refId) {
      return fehler("VORGANG_NICHT_GEFUNDEN", MELDUNGEN.nichtGefunden);
    }
    const zeile = verlaufZeile(frueher as VerlaufRoh);
    return {
      ok: true,
      daten: {
        mailId: zeile.id,
        empfaenger: zeile.empfaenger,
        betreff: zeile.betreff,
        anhaenge: zeile.anhaenge,
        warnungen: [MELDUNGEN.schonVersendet],
        wiederholt: true,
      },
    };
  }
  const ohneNachweis = ohneNachweisFinden(opts.dialogKennung);
  if (ohneNachweis) return { ok: true, daten: { ...ohneNachweis, wiederholt: true } };

  // --- 3. Eingaben ---
  // Zod-Schema (validations/individuelle-mail.ts): Die Nachricht wird VOR der
  // Laengenpruefung auf \n normalisiert — Browser schicken Formularfelder mit \r\n.
  const eingabe = individuelleMailEingabeSchema.safeParse(opts);
  if (!eingabe.success) return fehler("EINGABE_UNGUELTIG", eingabe.error.errors[0].message);
  const { empfaenger, betreff, nachricht } = eingabe.data;

  // --- 4. Freigabe der Adresse (vor jedem Bauen und Versenden) ---
  const ausVorgang = vorgang.adressen.some((a) => a.adresse.toLowerCase() === empfaenger.toLowerCase());
  if (!ausVorgang) {
    const domains = await ladeErlaubteDomains();
    if (!empfaengerFreigegeben({ empfaenger, empfaengerVorgang: "", domains })) {
      return fehler("EMPFAENGER_NICHT_ERLAUBT", MELDUNGEN.adresseNichtFreigegeben);
    }
  }

  // --- 5. Anhaenge ---
  const pruefung = anhaengePruefen(opts.dateien);
  if (!pruefung.ok) return pruefung;
  const anhaenge = pruefung.daten;

  // --- 6. Versand ---
  const absender = `${opts.session.firstName} ${opts.session.lastName}`.trim();
  const ergebnis = await sendEventEmail(
    INDIVIDUELLE_MAIL_EVENT,
    mailPayload({ modul, refId: opts.refId, vorgang, empfaenger, betreff, nachricht, anhaenge, absender }),
    {
      attachments: anhaenge.map<MailAttachment>((a) => ({
        filename: a.dateiname,
        content: a.inhalt,
        contentType: a.mimeType,
      })),
      // Die im Dialog gewaehlte Adresse MUSS gelten; overrideTo verwirft
      // zugleich An/CC/BCC der Vorlage — ein stiller Verteiler bekaeme sonst
      // Personalunterlagen, die niemand fuer ihn bestaetigt hat.
      overrideTo: empfaenger,
      bezug: bezugAusModul(modul, opts.refId),
    },
  );
  if (ergebnis.status === "SKIPPED") return fehler("VORLAGE_AUS", MELDUNGEN.vorlageAus);
  if (ergebnis.status !== "SENT") {
    return fehler("VERSAND", ergebnis.detail ? `${MELDUNGEN.versandFehlgeschlagen} (${ergebnis.detail})` : MELDUNGEN.versandFehlgeschlagen);
  }

  // --- 7. Nachweis (erst jetzt) ---
  const zugestelltAn = ergebnis.recipient || empfaenger;
  const mailId = crypto.randomUUID();
  const warnungen: string[] = [];

  // Dateien ausserhalb der Transaktion — ein Schreibfehler darf den Nachweis
  // nicht verhindern, die Mail ist schon draussen.
  const abgelegt = new Map<string, string>();
  for (const a of anhaenge) {
    try {
      const voll = await saveUploadedFile(
        a.inhalt,
        `individuelle-mails/${mailId}`,
        `${a.id}${ENDUNG_FUER_DATEITYP[a.mimeType]}`,
      );
      abgelegt.set(a.id, path.relative(UPLOADS, voll).split(path.sep).join("/"));
    } catch {
      warnungen.push(`„${a.dateiname}“ wurde versendet, die Kopie im Vorgang konnte aber nicht abgelegt werden.`);
    }
  }

  const bezug = auditBezug(modul, opts.refId);
  const auditDetails = {
    mailId,
    modul,
    refId: opts.refId,
    empfaenger: zugestelltAn,
    empfaengerAbweichend: !ausVorgang,
    betreffLaenge: betreff.length,
    nachrichtLaenge: nachricht.length,
    anhaenge: anhaenge.map((a) => ({ dateiname: a.dateiname, groesse: a.inhalt.length, sha256: a.sha256 })),
  };

  const gespeichert = await prisma
    .$transaction(async (tx) => {
      await tx.individuelleMail.create({
        data: {
          id: mailId,
          modul,
          refId: opts.refId,
          organizationId: vorgang.organizationId,
          dialogKennung: opts.dialogKennung,
          empfaenger: zugestelltAn,
          empfaengerVorgang: vorgang.adressen[0]?.adresse ?? null,
          empfaengerAbweichend: !ausVorgang,
          // Der Betreff, den der Mailer tatsaechlich gesetzt hat.
          betreff: ergebnis.subject || betreff,
          nachricht,
          messageId: ergebnis.messageId ?? null,
          sentById: opts.session.userId,
          anhaenge: {
            create: anhaenge.map((a, i) => ({
              id: a.id,
              reihenfolge: i,
              dateiname: a.dateiname,
              mimeType: a.mimeType,
              groesse: a.inhalt.length,
              sha256: a.sha256,
              dateipfad: abgelegt.get(a.id) ?? null,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: opts.session.userId,
          ...bezug,
          action: INDIVIDUELLE_MAIL_AUDIT.VERSENDET,
          details: auditDetails,
          ipAddress: opts.ipAddress ?? null,
        },
      });
    })
    .then(
      () => true,
      async (e) => {
        console.error("[IndividuelleMail] Nachweis konnte nicht geschrieben werden:", e instanceof Error ? e.name : e);
        for (const rel of abgelegt.values()) {
          await dateiLoeschen(path.join(UPLOADS, rel), [ANHANG_WURZEL]);
        }
        abgelegt.clear();
        await prisma.auditLog
          .create({
            data: {
              userId: opts.session.userId,
              ...bezug,
              action: INDIVIDUELLE_MAIL_AUDIT.NACHWEIS_FEHLGESCHLAGEN,
              details: auditDetails,
              ipAddress: opts.ipAddress ?? null,
            },
          })
          .catch(() => console.error("[IndividuelleMail] Auch der Ersatz-Protokolleintrag schlug fehl."));
        return false;
      },
    );

  const antwort: IndividuelleMailVersandAntwort = {
    mailId: gespeichert ? mailId : null,
    empfaenger: zugestelltAn,
    betreff: ergebnis.subject || betreff,
    anhaenge: anhaenge.map((a) => ({
      id: a.id,
      dateiname: a.dateiname,
      groesse: a.inhalt.length,
      sha256: a.sha256,
      verfuegbar: gespeichert && abgelegt.has(a.id),
    })),
    warnungen: gespeichert ? warnungen : [MELDUNGEN.nachweisFehlt, ...warnungen],
    wiederholt: false,
  };
  if (!gespeichert) ohneNachweisMerken(opts.dialogKennung, antwort);
  return { ok: true, daten: antwort };
}

// =============================================
// Anhang oeffnen
// =============================================

export async function anhangLaden(opts: {
  anhangId: string;
  session: SessionPayload;
  ipAddress?: string | null;
}): Promise<MailErgebnis<{ inhalt: Buffer; mimeType: ErkannterDateityp; dateiname: string }>> {
  const anhang = await prisma.individuelleMailAnhang.findUnique({
    where: { id: opts.anhangId },
    select: {
      id: true,
      dateiname: true,
      mimeType: true,
      dateipfad: true,
      sha256: true,
      mail: { select: { id: true, modul: true, refId: true } },
    },
  });
  if (!anhang) return fehler("VORGANG_NICHT_GEFUNDEN", "Der Anhang wurde nicht gefunden.");
  const zugang = await vorgangMitZugriff(anhang.mail.modul, anhang.mail.refId, opts.session);
  if (!zugang.ok) return fehler("VORGANG_NICHT_GEFUNDEN", "Der Anhang wurde nicht gefunden.");
  if (!anhang.dateipfad || !istErkannterDateityp(anhang.mimeType)) {
    return fehler(
      "VORGANG_NICHT_GEFUNDEN",
      "Die Datei ist nicht mehr vorhanden (nach 12 Monaten gelöscht). Der Nachweis mit Name und Prüfsumme bleibt.",
    );
  }

  let inhalt: Buffer;
  try {
    const pfad = await pfadInWurzeln(path.join(UPLOADS, anhang.dateipfad), [ANHANG_WURZEL]);
    inhalt = await readFile(pfad);
  } catch {
    return fehler("VORGANG_NICHT_GEFUNDEN", "Die Datei wurde im Speicher nicht gefunden.");
  }

  await prisma.auditLog.create({
    data: {
      userId: opts.session.userId,
      ...auditBezug(zugang.daten.modul, anhang.mail.refId),
      action: INDIVIDUELLE_MAIL_AUDIT.ANHANG_GEOEFFNET,
      details: { mailId: anhang.mail.id, anhangId: anhang.id, sha256: anhang.sha256 },
      ipAddress: opts.ipAddress ?? null,
    },
  });
  return { ok: true, daten: { inhalt, mimeType: anhang.mimeType, dateiname: anhang.dateiname } };
}

// =============================================
// Aufbewahrung (12 Monate) — Teil des Laufs „Aufbewahrung erzeugter Dokumente“
// =============================================

export interface AufraeumErgebnis {
  /** Mails, deren Text und Dateien geloescht wurden (bzw. im Probelauf wuerden). */
  mails: number;
  dateienGeloescht: number;
  fehler: number;
}

/**
 * Loescht bei Mails vor `grenze` die Dateien und den Nachrichtentext. Die Zeile
 * bleibt als Nachweis: Datum, Empfaenger, Betreff, Dateinamen, Pruefsummen.
 *
 * Erst die Dateien, dann die Zeile — scheitert eine Datei („fehler“), bleibt
 * die Mail offen und der naechste Lauf versucht es erneut. Eine schon fehlende
 * Datei zaehlt als erledigt.
 */
export async function individuelleMailsAufraeumen(opts: { grenze: Date; dryRun: boolean }): Promise<AufraeumErgebnis> {
  const faellig = await prisma.individuelleMail.findMany({
    where: { createdAt: { lt: opts.grenze }, inhaltGeloeschtAm: null },
    select: { id: true, anhaenge: { select: { id: true, dateipfad: true } } },
  });
  if (opts.dryRun) return { mails: faellig.length, dateienGeloescht: 0, fehler: 0 };

  let mails = 0;
  let dateienGeloescht = 0;
  let fehlerZahl = 0;
  for (const mail of faellig) {
    let allesWeg = true;
    for (const a of mail.anhaenge) {
      if (!a.dateipfad) continue;
      const ergebnis = await dateiLoeschen(path.join(UPLOADS, a.dateipfad), [ANHANG_WURZEL]);
      if (ergebnis === "fehler") {
        allesWeg = false;
        continue;
      }
      if (ergebnis === "geloescht") dateienGeloescht++;
      await prisma.individuelleMailAnhang.update({
        where: { id: a.id },
        data: { dateipfad: null, dateiGeloeschtAm: new Date() },
      });
    }
    if (!allesWeg) {
      fehlerZahl++;
      continue;
    }
    await deleteUploadedDirIfEmpty(path.join(ANHANG_WURZEL, mail.id));
    await prisma.individuelleMail.update({
      where: { id: mail.id },
      data: { nachricht: null, inhaltGeloeschtAm: new Date() },
    });
    mails++;
  }
  return { mails, dateienGeloescht, fehler: fehlerZahl };
}
