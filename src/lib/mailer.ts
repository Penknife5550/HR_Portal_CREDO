/**
 * CREDO HR-Portal – SMTP-Mailversand (primaerer Versandkanal)
 *
 * Jedes Event wird per SMTP versendet, sofern eine aktive Vorlage existiert
 * und ein Empfaenger aufloesbar ist. Webhooks sind nur noch ein optionaler
 * Zusatzkanal (siehe lib/webhooks.ts).
 *
 * Konfiguration wird aus der Datenbank (SmtpConfig) geladen.
 * E-Mail-Vorlagen werden aus der Datenbank (EmailTemplate) geladen;
 * fehlt eine DB-Vorlage, greifen die Code-Defaults (default-email-templates.ts).
 * Jeder Versandversuch wird im EmailLog protokolliert (SENT/FAILED/SKIPPED).
 *
 * Sensible Felder (Passwort) werden im Frontend maskiert angezeigt.
 */

import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { decrypt, isEncryptionConfigured } from "@/lib/encryption";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/default-email-templates";
import { getEventDefinition } from "@/lib/events";
import { EMAIL_PATTERN } from "@/lib/constants";
import { formatDatumDE } from "@/lib/format";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";
import { escapeHtml } from "@/lib/email-layout";

// =============================================
// Typen
// =============================================
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface MailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

/**
 * Ergebnis eines erfolgreichen Versands — dient als Zustellnachweis
 * (z.B. fuer das BEM-Kommunikationsprotokoll, NFR 0a).
 */
export interface SendEmailResult {
  messageId?: string;
  accepted: string[];
}

interface SmtpTestResult {
  success: boolean;
  error?: string;
  durationMs: number;
}

// =============================================
// SMTP-Transporter erstellen
// =============================================
async function createTransporter() {
  const config = await prisma.smtpConfig.findUnique({
    where: { id: "default" },
  });

  if (!config || !config.isActive || !config.host || !config.username) {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: isEncryptionConfigured() ? decrypt(config.password) : config.password,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
      // Harte Timeouts: ein haengender SMTP-Server darf Request-Pfade
      // (Onboarding-POST, Fragebogen-Submit, ...) nicht minutenlang blockieren
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }),
    from: `"${config.fromName}" <${config.fromEmail}>`,
  };
}

// =============================================
// E-Mail versenden
// =============================================
/**
 * Detaillierte Variante: liefert bei Fehlschlag den konkreten Grund zurueck
 * (statt nur null). Wird z.B. vom BEM-Einladungs-Endpunkt genutzt, um die echte
 * SMTP-Fehlermeldung anzuzeigen und im Versandprotokoll zu hinterlegen.
 */
export type SendEmailDetailed =
  | { ok: true; messageId?: string; accepted: string[] }
  | { ok: false; error: string };

export async function sendEmailDetailed(
  options: MailOptions
): Promise<SendEmailDetailed> {
  const result = await createTransporter();
  if (!result) {
    console.warn("[Mailer] SMTP nicht konfiguriert oder deaktiviert – E-Mail uebersprungen");
    return {
      ok: false,
      error:
        "SMTP ist nicht konfiguriert oder nicht aktiviert. Bitte unter Einstellungen → SMTP Host/Benutzer/Absender eintragen, 'aktiv' setzen und 'Verbindung testen'.",
    };
  }
  try {
    const info = await result.transporter.sendMail({
      from: result.from,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    console.log(`[Mailer] E-Mail erfolgreich gesendet an: ${options.to.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
    return {
      ok: true,
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map((a) =>
        typeof a === "string" ? a : a.address
      ),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Mailer] E-Mail-Versand fehlgeschlagen:", msg);
    return { ok: false, error: msg };
  }
}

export async function sendEmail(
  options: MailOptions
): Promise<SendEmailResult | null> {
  const r = await sendEmailDetailed(options);
  return r.ok ? { messageId: r.messageId, accepted: r.accepted } : null;
}

// =============================================
// SMTP-Verbindung testen (Admin-Portal)
// =============================================
export async function testSmtpConnection(testEmail: string): Promise<SmtpTestResult> {
  const start = Date.now();
  try {
    const result = await createTransporter();
    if (!result) {
      return {
        success: false,
        error: "SMTP ist nicht konfiguriert oder deaktiviert. Bitte Host, Benutzer und Passwort eintragen.",
        durationMs: Date.now() - start,
      };
    }

    // Verbindung verifizieren
    await result.transporter.verify();

    // Test-E-Mail senden
    await result.transporter.sendMail({
      from: result.from,
      to: testEmail,
      subject: "CREDO HR-Portal – SMTP-Verbindungstest",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px;">
          <h2 style="color: #1a1a2e;">✅ SMTP-Verbindungstest erfolgreich</h2>
          <p>Die SMTP-Konfiguration des CREDO HR-Portals funktioniert korrekt.</p>
          <p style="color: #666; font-size: 12px;">Gesendet am: ${new Date().toLocaleString("de-DE")}</p>
        </div>
      `,
      text: "CREDO HR-Portal SMTP-Test: Die Verbindung funktioniert korrekt.",
    });

    return { success: true, durationMs: Date.now() - start };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
      durationMs: Date.now() - start,
    };
  }
}

// =============================================
// Variablen in E-Mail-Vorlage ersetzen
// =============================================

/**
 * Bedingter Block, so wie renderTemplate ihn versteht: oeffnender Marker,
 * Inhalt, gleichnamiger Schluss-Marker. Bewusst EINE Quelle fuer Rendern und
 * Pruefen — liefen beide Muster auseinander, meldete die Pruefung gruen, was
 * der Renderer woertlich stehen laesst. Genau das war der Fehler.
 */
const BEDINGTER_BLOCK = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

/**
 * Was ueberhaupt nach Bedingungsmarker aussieht. Absichtlich weiter gefasst als
 * BEDINGTER_BLOCK (\w+): So faellt auch ein vertippter Name ({{#nachricht-1}})
 * oder ein Leerzeichen ({{ #nachricht}}) auf — beides kommt als Paar nie in
 * Frage und bliebe sonst unbemerkt in der Mail stehen.
 */
const MARKER_MUSTER = /\{\{\s*([#/])([^{}]*)\}\}/g;

export interface VerwaisterMarker {
  /** Feldbezeichnung, wie sie im Editor steht: "Betreff", "HTML-Body", "Plaintext" */
  feld: string;
  /** Der Marker im Wortlaut, z.B. "{{#nachricht}}" */
  marker: string;
  /** Name hinter dem Marker, getrimmt */
  name: string;
  art: "oeffnend" | "schliessend";
}

/**
 * Findet Marker, die der Renderer NICHT als Paar aufloest.
 *
 * Der Trick ist, den Renderer nicht nachzubauen, sondern ihn zu befragen: Erst
 * faellt weg, was er als Paar erkennt — uebrig bleibt exakt das, was er
 * woertlich versenden wuerde. Der Ersatz behaelt den Inhalt ("$2"), damit ein
 * gleichnamig verschachtelter Block sichtbar wird: bei {{#a}}x{{#a}}y{{/a}}
 * loest das lazy Muster nur das aeussere Paar auf, das innere {{#a}} steht
 * danach in der Mail — verschluckten wir den Inhalt, faende die Pruefung es nie.
 *
 * Zur Technik: `String.prototype.matchAll` klont das Muster intern, und
 * `replace` mit /g setzt `lastIndex` zurueck. Die beiden Modul-Regexe tragen
 * hier also keinen Zustand mit sich und duerfen geteilt werden.
 */
export function findeVerwaisteMarker(
  text: string,
): Array<Omit<VerwaisterMarker, "feld">> {
  if (!text) return [];
  const ohnePaare = text.replace(BEDINGTER_BLOCK, "$2");

  const gefunden: Array<Omit<VerwaisterMarker, "feld">> = [];
  const gesehen = new Set<string>();
  for (const treffer of ohnePaare.matchAll(MARKER_MUSTER)) {
    const marker = treffer[0];
    // Denselben Tippfehler nur einmal melden — die Meldung soll die Stelle
    // nennen, nicht sie zehnmal wiederholen.
    if (gesehen.has(marker)) continue;
    gesehen.add(marker);
    gefunden.push({
      marker,
      name: treffer[2].trim(),
      art: treffer[1] === "#" ? "oeffnend" : "schliessend",
    });
  }
  return gefunden;
}

/**
 * Prueft mehrere Vorlagenfelder auf einmal. Schluessel des Objekts ist die
 * Feldbezeichnung, die spaeter in der Fehlermeldung steht — der Aufrufer
 * uebergibt bewusst die Beschriftung aus dem Editor, damit HR die Stelle
 * findet, ohne die Datenbankspalten zu kennen.
 */
export function pruefeVorlagenSyntax(
  felder: Record<string, string | null | undefined>,
): VerwaisterMarker[] {
  return Object.entries(felder).flatMap(([feld, text]) =>
    findeVerwaisteMarker(text ?? "").map((m) => ({ feld, ...m })),
  );
}

/** Deutsche Fehlermeldung aus den gefundenen Markern. */
export function beschreibeVerwaisteMarker(fehler: VerwaisterMarker[]): string {
  return fehler
    .map((f) =>
      f.art === "oeffnend"
        ? `Feld "${f.feld}": ${f.marker} wird nicht geschlossen (erwartet: {{/${f.name}}}).`
        : `Feld "${f.feld}": ${f.marker} steht ohne passendes {{#${f.name}}}.`,
    )
    .join(" ");
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  // Bedingte Bloecke: {{#name}}...{{/name}} bleibt nur stehen, wenn die
  // Variable einen nicht-leeren Wert hat.
  //
  // Gebraucht fuer optionale Abschnitte wie die persoenliche Nachricht beim
  // Dokumentenpaket: Ohne Bedingung stuende dort ein leerer, gerahmter Kasten.
  // Bewusst klein gehalten — keine Schleifen, keine Verschachtelung gleichen
  // Namens, kein Negativ-Block. Wer mehr braucht, ergaenzt es hier bewusst und
  // stoesst nicht auf eine halbe Implementierung.
  const mitBloecken = template.replace(
    BEDINGTER_BLOCK,
    (_treffer, name: string, inhalt: string) =>
      (variables[name] ?? "").trim() === "" ? "" : inhalt,
  );

  // Sicherheitsnetz: Was jetzt noch nach einem Bedingungsmarker aussieht, ist
  // ein Tippfehler in der Vorlage. Der Editor weist ihn seit dieser Aenderung
  // beim Speichern ab; hierher kommt nur, was am Editor vorbei in die Datenbank
  // geriet (direkter DB-Zugriff, Import, aeltere Bestandsvorlage).
  //
  // Warum entfernen und nicht stehen lassen: Ein rohes {{#nachricht}} in einer
  // Mail an eine beschaeftigte Person ist schlimmer als stilles Entfernen — und
  // die Ursache faengt kuenftig der Editor ab, sodass das Entfernen nur noch
  // Bestandsvorlagen betrifft, die am Editor vorbei in die Datenbank gelangt
  // sind. Ganz stillschweigend passiert es trotzdem nicht: Die Warnung nennt
  // die Marker, damit der Fehler im Log auffaellt statt im Postfach.
  //
  // Reihenfolge ist wichtig: Das Entfernen laeuft VOR der Variablen-Ersetzung.
  // Sonst zerschnitte es Werte, die HR selbst eingegeben hat (die freie
  // Nachricht im Dokumentenpaket-Dialog kann geschweifte Klammern enthalten).
  const verwaist = findeVerwaisteMarker(mitBloecken);
  let bereinigt = mitBloecken;
  if (verwaist.length > 0) {
    console.warn(
      `[Mailer] Vorlage enthaelt unvollstaendige Bedingungsmarker (entfernt): ${verwaist
        .map((m) => m.marker)
        .join(", ")}`,
    );
    bereinigt = mitBloecken.replace(MARKER_MUSTER, "");
  }

  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ""),
    bereinigt
  );
}

// =============================================
// Empfaenger-Felder rendern und validieren
// Eingabe: kommagetrennte Liste aus Festadressen und {{variablen}}
// =============================================
function renderRecipientField(
  field: string,
  vars: Record<string, string>
): string {
  const addresses = renderTemplate(field, vars)
    .split(",")
    .map((addr) => addr.trim())
    .filter((addr) => EMAIL_PATTERN.test(addr));
  return [...new Set(addresses.map((a) => a.toLowerCase()))].join(", ");
}

// =============================================
// Vorlage fuer ein Event aufloesen: DB-Eintrag vor Code-Default
// =============================================
interface ResolvedTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  recipientTo: string;
  recipientCc: string;
  recipientBcc: string;
  recipientReplyTo: string;
  isActive: boolean;
  source: "db" | "default";
}

export async function resolveEventTemplate(
  event: string
): Promise<ResolvedTemplate | null> {
  const dbTemplate = await prisma.emailTemplate.findUnique({
    where: { event },
  });
  if (dbTemplate) {
    return {
      subject: dbTemplate.subject,
      bodyHtml: dbTemplate.bodyHtml,
      bodyText: dbTemplate.bodyText,
      recipientTo: dbTemplate.recipientTo,
      recipientCc: dbTemplate.recipientCc,
      recipientBcc: dbTemplate.recipientBcc,
      recipientReplyTo: dbTemplate.recipientReplyTo,
      isActive: dbTemplate.isActive,
      source: "db",
    };
  }

  const defaultTemplate = DEFAULT_EMAIL_TEMPLATES.find((t) => t.event === event);
  if (!defaultTemplate) return null;
  return {
    subject: defaultTemplate.subject,
    bodyHtml: defaultTemplate.bodyHtml,
    bodyText: defaultTemplate.bodyText,
    recipientTo: "",
    recipientCc: "",
    recipientBcc: "",
    recipientReplyTo: "",
    isActive: true,
    source: "default",
  };
}

// =============================================
// Gerenderte Event-E-Mail (auch fuer den Test-Versand nutzbar)
// =============================================
export interface RenderedEventEmail {
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Namen, die im HTML-Teil maskiert werden.
 *
 * Sie stammen aus Freitextfeldern (Fragebogen, Dialog „Neuer Vorgang",
 * Stammdaten), die nur die Laenge begrenzen. `renderTemplate` maskiert nicht —
 * manche Variablen tragen bewusst fertiges, schon maskiertes HTML (etwa
 * `warnungen_liste_html`). Ein Vorname `<a href="…">Anmelden</a>` stuende sonst
 * als klickbarer fremder Link in der Mail an die Fuehrungskraft. Betreff und
 * Textteil bleiben roh: Dort waere `&lt;` falsch und `<` ist harmlos.
 */
const NAMENS_VARIABLEN = [
  "vorname",
  "nachname",
  "mitarbeiter_name",
  "employeeName",
  "firstName",
  "lastName",
  "employeeFirstName",
  "employeeLastName",
];

function mitMaskiertenNamen(vars: Record<string, string>): Record<string, string> {
  const maskiert = { ...vars };
  for (const name of NAMENS_VARIABLEN) {
    if (maskiert[name]) maskiert[name] = escapeHtml(maskiert[name]);
  }
  return maskiert;
}

export function renderEventEmail(
  template: Pick<
    ResolvedTemplate,
    "subject" | "bodyHtml" | "bodyText" | "recipientTo" | "recipientCc" | "recipientBcc" | "recipientReplyTo"
  >,
  event: string,
  payload: Record<string, unknown>,
  options?: {
    /** Test-Versand: Empfaenger-Aufloesung ueberspringen, alles an diese Adresse */
    overrideTo?: string;
    /** Globaler Reply-To-Default aus der SMTP-Konfiguration (Fallback) */
    globalReplyTo?: string;
  }
): { rendered: RenderedEventEmail | null; skipReason?: string } {
  const vars = extractVariables(event, payload);

  const body = {
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.bodyHtml, mitMaskiertenNamen(vars)),
    text: template.bodyText ? renderTemplate(template.bodyText, vars) : undefined,
  };

  // Reply-To: Vorlagen-Override > globaler SMTP-Default; variablen-faehig + validiert
  const replyToField = template.recipientReplyTo.trim() || (options?.globalReplyTo ?? "");
  const replyTo = renderRecipientField(replyToField, vars) || undefined;

  if (options?.overrideTo) {
    return { rendered: { to: options.overrideTo, replyTo, ...body } };
  }

  // An-Adresse: Vorlagen-Feld > Katalog-Default.
  // WICHTIG: Ein leerer Katalog-Default (to: "") bedeutet "bewusst kein
  // Empfaenger" (HR-intern) und faellt NICHT auf Payload-Felder zurueck —
  // sonst gingen interne Benachrichtigungen an die betroffene Person selbst.
  // Nur Events ausserhalb des Katalogs nutzen die alte Payload-Aufloesung.
  const catalogDef = getEventDefinition(event);
  const toField =
    template.recipientTo.trim() ||
    (catalogDef
      ? catalogDef.defaultRecipients.to
      : vars.email || vars.supervisor_email);
  const to = renderRecipientField(toField, vars);
  if (!to) {
    return {
      rendered: null,
      skipReason: template.recipientTo.trim()
        ? `Empfaenger "${template.recipientTo}" ergab keine gueltige Adresse`
        : "Kein Empfaenger konfiguriert — bitte in der Vorlage ein An-Feld setzen",
    };
  }

  const catalogDefaults = catalogDef?.defaultRecipients;
  const cc = renderRecipientField(template.recipientCc.trim() || catalogDefaults?.cc || "", vars);
  const bcc = renderRecipientField(template.recipientBcc.trim() || catalogDefaults?.bcc || "", vars);

  return {
    rendered: { to, cc: cc || undefined, bcc: bcc || undefined, replyTo, ...body },
  };
}

// =============================================
// Versandprotokoll schreiben — wirft niemals
// =============================================
export type EmailLogStatus = "SENT" | "FAILED" | "SKIPPED";

async function writeEmailLog(entry: {
  event: string;
  status: EmailLogStatus;
  recipient?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  detail?: string;
  messageId?: string;
  isTest?: boolean;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        event: entry.event,
        status: entry.status,
        recipient: entry.recipient ?? "",
        cc: entry.cc,
        bcc: entry.bcc,
        subject: entry.subject ?? "",
        detail: entry.detail,
        messageId: entry.messageId,
        isTest: entry.isTest ?? false,
      },
    });
  } catch (err) {
    console.error(
      "[Mailer] Versandprotokoll konnte nicht geschrieben werden:",
      err instanceof Error ? err.message : err
    );
  }
}

// =============================================
// Primaerer Event-basierter E-Mail-Versand
// Wird vom Dispatcher (lib/webhooks.ts) fuer jedes Event aufgerufen.
// Wirft niemals — jedes Ergebnis wird im EmailLog protokolliert.
// =============================================
export interface EventEmailResult {
  status: EmailLogStatus;
  detail?: string;
  /**
   * Message-ID des SMTP-Servers — nur bei status "SENT" gesetzt, und auch dann
   * nur, wenn der Server eine geliefert hat.
   *
   * Der Wert stand hier schon immer zur Verfuegung (er wandert ins EmailLog),
   * wurde aber nicht zurueckgegeben. Der Dokumentenpaket-Versand braucht ihn
   * fuer seinen dauerhaften Nachweis: Das EmailLog wird nach 90 Tagen
   * aufgeraeumt, der Nachweis bleibt.
   */
  messageId?: string;
  /**
   * Betreff, der tatsaechlich versendet wurde — nach Einsetzen der Variablen
   * und (bei Testversand) dem [TEST]-Praefix. Der Nachweis soll festhalten,
   * was hinausging, nicht was der Aufrufer vermutet hat.
   */
  subject?: string;
  /**
   * Adresse, an die tatsaechlich zugestellt wurde — nach Aufloesung der
   * Vorlagen-Empfaengerfelder und dem Aussortieren ungueltiger Adressen. Nicht
   * zwingend das, was der Aufrufer erwartet hat; genau deshalb im Nachweis
   * festgehalten.
   */
  recipient?: string;
}

export async function sendEventEmail(
  event: string,
  payload: Record<string, unknown>,
  options?: {
    isTest?: boolean;
    /** Optionale Datei-Anhaenge (z.B. Starterpaket-PDFs) — werden an den SMTP-Versand durchgereicht */
    attachments?: MailAttachment[];
    /** Test-Versand: alle Empfaenger durch diese Adresse ersetzen */
    overrideTo?: string;
    /** Test-Versand: ungespeicherte Editor-Felder statt der DB-Vorlage nutzen */
    templateOverride?: Partial<
      Pick<
        ResolvedTemplate,
        "subject" | "bodyHtml" | "bodyText" | "recipientTo" | "recipientCc" | "recipientBcc" | "recipientReplyTo"
      >
    >;
  }
): Promise<EventEmailResult> {
  const isTest = options?.isTest ?? false;
  try {
    let template = await resolveEventTemplate(event);
    if (!template && options?.templateOverride?.subject && options.templateOverride.bodyHtml) {
      // Test-Versand fuer Events ohne jede Vorlage: Editor-Entwurf nutzen
      template = {
        subject: options.templateOverride.subject,
        bodyHtml: options.templateOverride.bodyHtml,
        bodyText: options.templateOverride.bodyText ?? null,
        recipientTo: options.templateOverride.recipientTo ?? "",
        recipientCc: options.templateOverride.recipientCc ?? "",
        recipientBcc: options.templateOverride.recipientBcc ?? "",
        recipientReplyTo: options.templateOverride.recipientReplyTo ?? "",
        isActive: true,
        source: "default",
      };
    } else if (template && options?.templateOverride) {
      template = { ...template, ...options.templateOverride };
    }
    if (!template) {
      const detail = "Keine E-Mail-Vorlage vorhanden";
      await writeEmailLog({ event, status: "SKIPPED", detail, isTest });
      return { status: "SKIPPED", detail };
    }
    // Test-Versand ist auch bei deaktivierter Vorlage erlaubt
    if (!template.isActive && !isTest) {
      const detail = "E-Mail-Vorlage ist deaktiviert";
      await writeEmailLog({ event, status: "SKIPPED", detail, isTest });
      return { status: "SKIPPED", detail };
    }

    const smtpConfig = await prisma.smtpConfig.findUnique({ where: { id: "default" } });
    const { rendered, skipReason } = renderEventEmail(template, event, payload, {
      overrideTo: options?.overrideTo,
      globalReplyTo: smtpConfig?.replyToEmail ?? "",
    });
    if (!rendered) {
      await writeEmailLog({ event, status: "SKIPPED", detail: skipReason, isTest });
      console.warn(`[Mailer] Event "${event}" uebersprungen: ${skipReason}`);
      return { status: "SKIPPED", detail: skipReason };
    }

    if (isTest) {
      rendered.subject = `[TEST] ${rendered.subject}`;
    }

    const attachmentNote =
      options?.attachments && options.attachments.length > 0
        ? `${options.attachments.length} Anhang/Anhaenge: ${options.attachments
            .map((a) => a.filename)
            .join(", ")}`
        : undefined;

    const result = await sendEmailDetailed({
      ...rendered,
      attachments: options?.attachments,
    });
    if (result.ok) {
      await writeEmailLog({
        event,
        status: "SENT",
        recipient: rendered.to,
        cc: rendered.cc,
        bcc: rendered.bcc,
        subject: rendered.subject,
        detail: attachmentNote,
        messageId: result.messageId,
        isTest,
      });
      return {
        status: "SENT",
        messageId: result.messageId,
        recipient: rendered.to,
        subject: rendered.subject,
      };
    }

    await writeEmailLog({
      event,
      status: "FAILED",
      recipient: rendered.to,
      cc: rendered.cc,
      bcc: rendered.bcc,
      subject: rendered.subject,
      detail: result.error,
      isTest,
    });
    return { status: "FAILED", detail: result.error };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[Mailer] Unerwarteter Fehler beim Versand fuer "${event}":`, detail);
    await writeEmailLog({ event, status: "FAILED", detail, isTest });
    return { status: "FAILED", detail };
  }
}

// =============================================
// Variablen aus Event-Payload extrahieren
// =============================================
function extractVariables(
  event: string,
  payload: Record<string, unknown>
): Record<string, string> {
  const str = (v: unknown) => (v != null ? String(v) : "");

  // Frist des Links: in deutscher Zeit und als TT.MM.JJJJ (formatDatumDE) —
  // wie „Gültig bis" im Dialog und die Frist des Vorgesetzten-Links unten.
  // Frueher toLocaleDateString in der Zeitzone des Servers (im Container UTC,
  // dazu „1.9.2026"): Wer kurz nach Mitternacht anlegte, las in der Einladung
  // an die Person einen Tag frueher als in der Mail an die Fuehrungskraft.
  const frist = payload.tokenExpiresAt || payload.expiresAt;

  // Generischer Durchreich: jedes skalare Payload-Feld wird unter seinem
  // Originalnamen als Platzhalter verfuegbar (z.B. {{employeeName}}, {{displayId}},
  // {{magicUrl}}). Die kuratierten Felder unten ueberschreiben diese gezielt.
  const generic: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      generic[k] = String(v);
    }
  }

  const base: Record<string, string> = {
    ...generic,
    // Empfaenger: deckt die unterschiedlichen Feldnamen aller Module ab.
    email: str(
      payload.email ||
        payload.employeeEmail ||
        payload.recipientEmail ||
        payload.privateEmail,
    ),
    vorname: str(payload.vorname || payload.firstName),
    nachname: str(payload.nachname || payload.lastName),
    einrichtung: str(payload.organization || payload.einrichtung),
    vorgangsnummer: str(payload.displayId),
    mitarbeiter_name:
      str(payload.mitarbeiter_name || payload.employeeName) ||
      [str(payload.vorname || payload.firstName), str(payload.nachname || payload.lastName)]
        .filter(Boolean)
        .join(" ") ||
      str(payload.email || payload.employeeEmail),
    link: str(
      payload.fragebogenLink ||
        payload.modalitaetenLink ||
        payload.magicUrl ||
        payload.magicLink ||
        payload.formularLink ||
        payload.link,
    ),
    ablaufdatum: frist instanceof Date ? formatDatumDE(frist) : formatDatumDE(str(frist)),
    supervisor_email: str(payload.supervisorEmail),
    supervisor_link: str(payload.supervisor_link || payload.modalitaetenLink),
    tage_offen: str(payload.tage_offen || ""),
  };

  // Event-spezifische Ergaenzungen
  if (event === "supervisor-link-created" || event === "supervisor-reminder") {
    base.email = str(payload.supervisorEmail || payload.email);
    base.link = str(payload.modalitaetenLink || payload.supervisor_link);
    // Sicherheitsnetz fuer den Namen: Der allgemeine Rueckfall oben endet bei
    // `payload.email` — das ist hier die Adresse der Fuehrungskraft (Erinnerung)
    // oder, bei einem Aufrufer, der sie doch mitschickt, die private Adresse
    // der Person. Beides gehoert nicht in „Einstellungsmodalitäten für …".
    // Ohne Namen deshalb die neutrale Bezeichnung (Akkusativ, passt nach „für").
    base.mitarbeiter_name =
      str(payload.mitarbeiter_name || payload.employeeName).trim() ||
      [base.vorname.trim(), base.nachname.trim()].filter(Boolean).join(" ") ||
      MITARBEITER_NEUTRAL;
    // Frist des Vorgesetzten-Links fuer den Kasten „Bitte ausfüllen bis".
    if (!base.ablaufdatum && payload.supervisorTokenExpiresAt) {
      base.ablaufdatum = formatDatumDE(str(payload.supervisorTokenExpiresAt));
    }
  }

  // PSI-Beurteilungs-Anfrage: Empfaenger ist der/die Gutachter:in (recipientEmail),
  // der Link liegt unter `magicLink` (nicht magicUrl).
  if (event === "psi-assessment-requested") {
    base.email = str(payload.recipientEmail || payload.email);
    base.link = str(payload.magicLink || payload.link);
  }

  // PSI-Beurteilung freigegeben: Empfaenger ist der/die Beschaeftigte,
  // der Bestaetigungs-Link liegt unter `ackLink`.
  if (event === "psi-assessment-released") {
    base.email = str(payload.employeeEmail || payload.email);
    base.link = str(payload.ackLink || payload.link);
  }

  // Offboarding-spezifische Variablen
  //
  // Die Standardvorlagen dieser Gruppe sprechen deutsch ({{vorname}},
  // {{abteilung}}, {{aufgabe}}, {{austrittsdatum}}, {{offene_aufgaben}},
  // {{einrichtung}}), die Aufrufer senden seit jeher englische Feldnamen
  // (employeeFirstName, departmentName, itemTitle bzw. taskTitle,
  // lastWorkingDay, totalOpenItems, organizationName). Bis zu dieser
  // Aenderung kannte dieser Block nur Namen, die kein Aufrufer je gesendet
  // hat — Namen, Datum, Abteilung und Aufgabe blieben in allen
  // Offboarding-Mails leer. Die Aufrufer senden die deutschen Felder
  // inzwischen mit (src/lib/offboarding-mail.ts); die Aliase hier bleiben das
  // Netz fuer alles, was dort nicht entsteht, und fuer gespeicherte Vorlagen.
  //
  // `erster` statt `a || b`: Eine Zahl 0 ist ein Wert. "0 offene Aufgaben"
  // ist eine Aussage, ein leeres Feld ist keine.
  if (event.startsWith("offboarding-")) {
    const erster = (...werte: unknown[]): string => {
      for (const wert of werte) {
        if (wert != null && String(wert).trim() !== "") return String(wert);
      }
      return "";
    };

    base.vorname = erster(payload.vorname, payload.firstName, payload.employeeFirstName);
    base.nachname = erster(payload.nachname, payload.lastName, payload.employeeLastName);
    // Letzter Rueckfall fuer Payloads, die nur den ganzen Namen kennen: Der
    // Name landet vollstaendig in {{vorname}}. Ein Aufteilen am Leerzeichen
    // ginge bei "Anna Maria von Berg" schief; "{{vorname}} {{nachname}}"
    // ergibt so trotzdem den richtigen Namen.
    if (!base.vorname && !base.nachname) {
      base.vorname = erster(payload.employeeName, payload.mitarbeiter_name);
    }
    base.einrichtung = erster(payload.organization, payload.einrichtung, payload.organizationName);
    base.abteilung = erster(payload.abteilung, payload.department, payload.departmentName);
    base.aufgabe = erster(payload.aufgabe, payload.task, payload.itemTitle, payload.taskTitle);
    base.offene_aufgaben = erster(
      payload.offene_aufgaben,
      payload.openTasks,
      payload.totalOpenItems,
    );
    base.link = erster(payload.link, payload.offboardingLink, payload.magicLink);

    // Austrittsdatum: IMMER TT.MM.JJJJ in deutscher Zeit — und ein schon
    // formatierter Wert bleibt, wie er ist. Das Dokumentenpaket
    // (offboarding-documents-sent) liefert "31.12.2026"; der fruehere Code
    // schickte das erneut durch new Date() und machte daraus "Invalid Date"
    // bzw. aus "01.08.2026" den 8. Januar. formatDatumDE kennt beide Formen.
    // Ergibt ein Wert gar kein Datum, steht er lieber roh in der Mail als
    // "Invalid Date".
    const rohDatum = erster(payload.austrittsdatum, payload.lastWorkingDay);
    base.austrittsdatum = rohDatum ? formatDatumDE(rohDatum) || rohDatum : "";
  }

  return base;
}
