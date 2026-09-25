/**
 * CREDO HR-Portal – Unterlagen nachfordern: die reinen Regeln (Paket 4)
 *
 * Worum es geht: HR fordert fehlende oder verlaengerte Nachweise ueber einen
 * persoenlichen Link an. Die Person laedt zu jeder Unterlage eine oder mehrere
 * Dateien hoch und klickt „Übermitteln". HR prueft jede Unterlage einzeln; erst
 * eine angenommene wird zum Dokument des Vorgangs.
 *
 * Diese Datei enthaelt NUR Regeln: keine Datenbank, keine Node-Module, keine
 * Uhr (jede Funktion bekommt `heute` bzw. `jetzt`). Aus Prisma und
 * file-upload.ts kommt hoechstens `import type`. Damit ist sie im Browser
 * nutzbar — Karte, Dialoge und Upload-Seite zeigen dieselben Texte und bieten
 * dieselben Aktionen an wie der Server — und ohne Datenbank testbar
 * (src/__tests__/lib/unterlagen.test.ts). Kalendertage kommen ausschliesslich
 * aus src/lib/kalendertag.ts.
 *
 * Modulneutral: Hier steht nichts, was nur das Onboarding betrifft. Ob eine
 * Nachforderung fuer einen Vorgang moeglich ist (`verfuegbar`), welche Arten
 * der Katalog kennt und welche davon sensibel sind, sagt der Modul-Baustein
 * (Stufe 1: src/lib/unterlagen-onboarding.ts) — Vorbild ist die Aufteilung
 * von abteilungsaufgaben.ts. Den Vorgangsstatus kennt diese Datei nur als
 * `vorgangEingestellt` (Onboarding: EXPIRED, „von HR zurückgezogen").
 *
 * Die Regeln in einem Satz je Thema (Feinplanung
 * docs/module/onboarding/paket4-feinplanung.md):
 *   - Zustaende: Nachforderung LAUFEND → ERLEDIGT | ZURUECKGEZOGEN; zurueck nur
 *     ueber „Annahme zurücknehmen" (2.1). Position und Datei nach 2.2 und 2.3.
 *   - Ein Link gilt bis min(link.gueltigBis, Frist + 14), einschliesslich, in
 *     Berliner Kalendertagen. Ein abgelaufener Link lebt nie wieder auf (2.4, 5.1).
 *   - Der Merker „vollständig" folgt einer festen Tabelle. Nur die Uebermittlung
 *     der Person loest die HR-Mail aus, nie eine Aktion von HR (2.1, EP-17).
 *   - Wird der Vorgang nicht mehr bearbeitet, ist nichts mehr erlaubt, was eine
 *     Mail an die Person ausloest (EP-3).
 *   - HR sieht nie Entwuerfe und nie den Link der Person; Dateinamen,
 *     Datei-URLs und Aktionen nur mit Bearbeitungsrecht (Abschnitt 11).
 */

import {
  VORLAGE_DEAKTIVIERT_DETAIL,
  versandDetailLesbar,
  type AnzeigeFarbe,
} from "@/lib/abteilungsaufgaben";
import type { PdfMerkmal } from "@/lib/file-upload";
import { formatBytes } from "@/lib/format";
import {
  ablaufKalendertag,
  berlinerKalendertag,
  formatKalendertag,
  formatKalendertagLang,
  heuteInBerlin,
  istKalendertag,
  tageSpaeter,
  tageZwischen,
  wochentagVon,
  WOCHENTAGE,
  type Kalendertag,
} from "@/lib/kalendertag";

export type { Kalendertag };
/** Dieselben fuenf Farben wie `PILL_FARBEN` der Abteilungskarte. */
export type UnterlagenFarbe = AnzeigeFarbe;

// =============================================
// Konstanten
// =============================================

const MS_PRO_MINUTE = 60_000;
const MS_PRO_TAG = 86_400_000;

/** Ein Link gilt bis Frist + 14 Tage, einschliesslich dieses Tages (P:1466). */
export const GUELTIG_NACH_FRIST_TAGE = 14;
/**
 * Zurueckgewiesene und verworfene Dateien werden so viele Tage nach dem
 * Ereignis geloescht, uebrig gebliebene Entwuerfe so viele Tage nach dem
 * Linkende (4.5).
 */
export const LOESCHEN_NACH_TAGEN = 30;
/** „Annahme zurücknehmen" hoechstens so viele Tage nach der Annahme (E-3). */
export const RUECKNAHME_MAX_TAGE = 30;
/** Frist: fruehestens morgen … (EP-5) */
export const FRIST_MIN_TAGE = 1;
/** … hoechstens heute + 90 (EP-5). Eine Obergrenze der Gesamtlaufzeit gibt es nicht. */
export const FRIST_MAX_TAGE = 90;
/** Vorschlag im Dialog: heute + 14 (EP-5). */
export const FRIST_VORSCHLAG_TAGE = 14;
/**
 * Zurueckweisen (EP-1): Die bisherige Frist wird nur vorgeschlagen, wenn sie
 * noch mindestens so viele Tage entfernt liegt, sonst heute + 7.
 */
export const ZURUECKWEISEN_FRIST_TAGE = 7;
/** Vorab-Erinnerung an die Person so viele Tage vor der Frist (Abschnitt 9). */
export const ERINNERUNG_VORAB_TAGE = 7;
/** Hoechstens so viele Positionen je Nachforderung, auch nach „Ergänzen" (EP-15). */
export const MAX_POSITIONEN = 30;
/** „Link erneut senden" ist so lange nach der letzten zugestellten Mail dieses Anlasses gesperrt (5.2). */
export const SPERRZEIT_MINUTEN = 10;
/** Ab so vielen Tagen ohne Pruefung zeigt die Karte „seit … ungeprüft" (2.2). */
export const UNGEPRUEFT_HINWEIS_TAGE = 14;
/** Der Lauf holt eine gescheiterte Mail an die Person hoechstens so oft nach (9). */
export const NACHHOL_MAX_VERSUCHE = 3;
/** Eine Mail, die so lange auf AUSSTEHEND steht, gilt als abgebrochen und wird nachgeholt (9). */
export const AUSSTEHEND_NACHHOLEN_MINUTEN = 60;
/** Dateien ohne Zeile erst ab diesem Alter als Waise loeschen (4.5). */
export const WAISEN_MIN_ALTER_STUNDEN = 24;
/** SMTP-Bremse des Laufs: nach so vielen FAILED in Folge keine Mails mehr (9). */
export const SMTP_BREMSE_FEHLER_IN_FOLGE = 3;

// ---- Grenzen beim Hochladen (4.3) ----

/** Hoechstgroesse einer Datei: 9,5 MiB (P:1467). */
export const MAX_DATEI_BYTES = 9_961_472;
/** Hoechstgroesse des ganzen Bodys (Datei samt Multipart-Rahmen): 10 MiB. */
export const MAX_BODY_BYTES = 10_485_760;
/** Aktive Dateien (Entwurf oder eingereicht) je Position. */
export const MAX_DATEIEN_JE_POSITION = 10;
/** Aktive Dateien je Nachforderung. */
export const MAX_DATEIEN_JE_NACHFORDERUNG = 40;
/** Summe der aktiven Dateien je Nachforderung: 150 MiB. */
export const MAX_BYTES_JE_NACHFORDERUNG = 150 * 1024 * 1024;
/** Uploads ueber die ganze Laufzeit einer Nachforderung (`uploadsGesamt`). */
export const MAX_UPLOADS_GESAMT = 200;
/** `accept` des Dateifelds — ohne `capture`, damit Kamera UND Dateiauswahl angeboten werden (5.4). */
export const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

// ---- Bremsen (5.2) — im Speicher des Prozesses, tragen nur bei EINEM Container ----

export const BREMSEN = {
  /** Hochladen je Nachforderung: 30 in 10 Minuten. */
  HOCHLADEN: { anzahl: 30, fensterMs: 10 * MS_PRO_MINUTE },
  /** Uebrige oeffentliche Schreibwege je Nachforderung: 60 pro Minute. */
  SCHREIBEN: { anzahl: 60, fensterMs: MS_PRO_MINUTE },
  /** Mails an die Person durch HR je Vorgang, ueber alle seine Nachforderungen (gezaehlt aus UnterlagenLink). */
  MAILS_JE_STUNDE: 6,
  MAILS_JE_TAG: 20,
} as const;

// ---- Textlaengen (6.1) ----

export const NACHRICHT_MAX = 1000;
export const HINWEIS_MAX = 500;
export const BEZEICHNUNG_MAX = 120;
export const BEGRUENDUNG_MAX = 1000;
export const ENTFAELLT_NOTIZ_MAX = 500;
/** `UnterlagenLink.mailDetail` wird auf so viele Zeichen gekuerzt. */
export const MAIL_DETAIL_MAX = 300;

// =============================================
// Zustaende, Anlaesse, Mailstatus
// =============================================

/** Module mit Nachforderung. Stufe 2 ergaenzt die uebrigen fuenf Vorgangsarten. */
export const UNTERLAGEN_MODULE = ["ONBOARDING"] as const;
export type UnterlagenModul = (typeof UNTERLAGEN_MODULE)[number];

export const NACHFORDERUNG_STATUS = ["LAUFEND", "ERLEDIGT", "ZURUECKGEZOGEN"] as const;
export type NachforderungStatus = (typeof NACHFORDERUNG_STATUS)[number];

export const POSITION_STATUS = [
  "ANGEFORDERT",
  "EINGEREICHT",
  "ANGENOMMEN",
  "ZURUECKGEWIESEN",
  "ENTFAELLT",
] as const;
export type PositionStatus = (typeof POSITION_STATUS)[number];

export const DATEI_STATUS = [
  "ENTWURF",
  "EINGEREICHT",
  "ANGENOMMEN",
  "ZURUECKGEWIESEN",
  "VERWORFEN",
] as const;
export type DateiStatus = (typeof DATEI_STATUS)[number];

/** Anlass einer Mail an die Person — jede Mail hat ihren eigenen Link. */
export const LINK_ANLAESSE = [
  "ANFORDERUNG",
  "ERGAENZUNG",
  "ERNEUT",
  "FRISTAENDERUNG",
  "ZURUECKWEISUNG",
  "ERINNERUNG_VORAB",
  "ERINNERUNG_FRISTTAG",
] as const;
export type LinkAnlass = (typeof LINK_ANLAESSE)[number];

/**
 * Anlaesse, deren gescheiterte Mail der Lauf nachholt (Abschnitt 9, Schritt 2).
 * Erinnerungen stehen nicht hier: Sie holt der nicht gesetzte Merker nach.
 */
export const NACHHOLBARE_ANLAESSE: readonly LinkAnlass[] = [
  "ANFORDERUNG",
  "ERGAENZUNG",
  "ERNEUT",
  "FRISTAENDERUNG",
  "ZURUECKWEISUNG",
];

export const MAIL_STATUS = ["AUSSTEHEND", "SENT", "FAILED", "SKIPPED"] as const;
export type MailStatus = (typeof MAIL_STATUS)[number];

/** ADRESSE: Adresswechsel (Link antwortet 404) · GESPERRT: „frühere Links sperren" (410). */
export const ENTWERTUNG_GRUENDE = ["ADRESSE", "GESPERRT"] as const;
export type EntwertungGrund = (typeof ENTWERTUNG_GRUENDE)[number];

export const ERINNERUNG_STUFEN = ["VORAB", "FRISTTAG"] as const;
/** Eigener Name: `ErinnerungsStufe` in abteilungsaufgaben.ts meint INFO/WARNING/ESCALATION. */
export type UnterlagenErinnerungsStufe = (typeof ERINNERUNG_STUFEN)[number];

/** Wohin eine angenommene Datei uebernommen wurde (Stufe 2 z. B. "IN_KARTE", P:1449). */
export const UEBERNAHME_ZIELE = ["DOCUMENT"] as const;
export type UebernahmeZiel = (typeof UEBERNAHME_ZIELE)[number];

/**
 * Sammelarten des Katalogs, die NIE als Position angefordert werden: Eine
 * „Sonstiges"-Zeile ohne Namen sagte der Person nicht, was sie hochladen soll.
 * Dafuer gibt es die freie Zeile mit Bezeichnung (6.1: 400). Beim Annehmen
 * einer freien Zeile bleibt SONSTIGES die Standardart (4.4).
 */
export const SAMMELARTEN: readonly string[] = ["SONSTIGES"];

function istEiner<T extends string>(liste: readonly T[], wert: unknown): wert is T {
  return typeof wert === "string" && (liste as readonly string[]).includes(wert);
}

export function istNachforderungStatus(wert: unknown): wert is NachforderungStatus {
  return istEiner(NACHFORDERUNG_STATUS, wert);
}
export function istPositionStatus(wert: unknown): wert is PositionStatus {
  return istEiner(POSITION_STATUS, wert);
}
export function istDateiStatus(wert: unknown): wert is DateiStatus {
  return istEiner(DATEI_STATUS, wert);
}
export function istLinkAnlass(wert: unknown): wert is LinkAnlass {
  return istEiner(LINK_ANLAESSE, wert);
}
export function istUnterlagenModul(wert: unknown): wert is UnterlagenModul {
  return istEiner(UNTERLAGEN_MODULE, wert);
}

/** „Wartet auf die Person": ANGEFORDERT oder ZURUECKGEWIESEN (Begriffe, Abschnitt 2). */
export function wartetAufPerson(status: string): boolean {
  return status === "ANGEFORDERT" || status === "ZURUECKGEWIESEN";
}

/** „Zu prüfen": EINGEREICHT. */
export function istZuPruefen(status: string): boolean {
  return status === "EINGEREICHT";
}

/** Zaehlt als erledigt (Abschluss der Nachforderung, P:1259): ANGENOMMEN oder ENTFAELLT. */
export function positionErledigt(status: string): boolean {
  return status === "ANGENOMMEN" || status === "ENTFAELLT";
}

/** Schluessel des Unique-Index „hoechstens eine laufende Nachforderung je Vorgang" (3.1). */
export function laufendSchluessel(modul: string, vorgangId: string): string {
  return `${modul}:${vorgangId}`;
}

// =============================================
// Meldungen (eine Quelle fuer Server, Karte, Dialoge und Upload-Seite)
// =============================================

export const MELDUNGEN = {
  // ---- Oeffentliche Seite (5.5) ----
  /** 404: Format falsch, Hash unbekannt, entwertet wegen Adresswechsel. */
  LINK_UNGUELTIG:
    "Dieser Link ist ungültig. Bitte verwenden Sie den Link aus Ihrer letzten E-Mail der Personalabteilung.",
  /** 410: entwertet ueber „frühere Links sperren". */
  LINK_ERSETZT:
    "Dieser Link wurde durch einen neueren ersetzt. Bitte verwenden Sie den Link aus Ihrer letzten E-Mail der Personalabteilung.",
  /** 410 ohne lesbares Datum; mit Datum `meldungLinkAbgelaufen`. */
  LINK_ABGELAUFEN: "Dieser Link ist abgelaufen. Bitte wenden Sie sich an die Personalabteilung.",
  /** 410: Nachforderung zurueckgezogen. */
  ANFORDERUNG_ZURUECKGEZOGEN:
    "Die Personalabteilung hat diese Anforderung zurückgezogen. Sie müssen nichts mehr hochladen.",
  /** 410: Der Vorgang wird nicht mehr bearbeitet (Onboarding EXPIRED = „von HR zurückgezogen"). */
  VORGANG_EINGESTELLT:
    "Dieser Vorgang wird nicht mehr bearbeitet. Bitte wenden Sie sich an die Personalabteilung.",
  /** 200 mit `readOnly`: Nachforderung ERLEDIGT. */
  ALLES_GEPRUEFT: "Alle Unterlagen sind eingegangen und geprüft. Vielen Dank.",
  /** 413 */
  DATEI_ZU_GROSS:
    "Die Datei ist größer als 9,5 MB. Bitte teilen Sie das Dokument auf mehrere Dateien auf oder scannen Sie es mit geringerer Auflösung.",
  /** 415 */
  DATEITYP_NICHT_ERLAUBT: "Bitte laden Sie nur PDF-, JPG-, PNG- oder WebP-Dateien hoch.",
  /** 400: leer, PDF ohne Ende, Datenstrom abgebrochen. */
  DATEI_UNVOLLSTAENDIG:
    "Die Datei ist leer oder unvollständig. Bitte speichern oder scannen Sie das Dokument erneut und laden Sie es noch einmal hoch.",
  /** 409: HR hat die Position auf „Entfällt" gesetzt. */
  UNTERLAGE_ENTFAELLT: "Diese Unterlage wird nicht mehr benötigt.",
  /** 409: Position ist uebermittelt oder angenommen. */
  UNTERLAGE_NICHT_OFFEN:
    "Diese Unterlage ist bereits übermittelt. Weitere Dateien sind erst möglich, wenn die Personalabteilung darum bittet.",
  /** 409: Kontingent je Position. */
  ZU_VIELE_DATEIEN_POSITION: `Zu einer Unterlage können Sie höchstens ${MAX_DATEIEN_JE_POSITION} Dateien hochladen.`,
  /** 409: Kontingente je Nachforderung (Anzahl, Groesse, Uploads insgesamt). */
  GESAMTGRENZE_ERREICHT:
    "Die Gesamtgrenze für diese Anforderung ist erreicht. Bitte entfernen Sie nicht benötigte Dateien oder wenden Sie sich an die Personalabteilung.",
  /** 409: Entfernen einer uebermittelten Datei. */
  DATEI_NICHT_ENTFERNBAR: "Übermittelte Dateien lassen sich nicht mehr entfernen.",
  /** 409: „Übermitteln", obwohl nie etwas bereit war. */
  NICHTS_ZU_UEBERMITTELN: "Es liegen keine Dateien zum Übermitteln vor. Bitte laden Sie zuerst eine Datei hoch.",
  /** 409: „Gültig bis" an einer Unterlage ohne Ablaufdatum. */
  KEIN_ABLAUFDATUM: "Für diese Unterlage wird kein Ablaufdatum erfasst.",
  /** 429 — die Seite versucht es nach `Retry-After` selbst erneut. */
  ZU_VIELE_ANFRAGEN: "Zu viele Anfragen, bitte warten Sie einen Moment.",
  /** 400: kaputtes JSON, fehlende Aktion, falsche Form. */
  UNGUELTIGE_EINGABE: "Ungültige Eingabe",
  /**
   * 413 auf einen JSON-Body ueber der Grenze der oeffentlichen Routen (Gültig
   * bis, Übermitteln) — eine echte Upload-Seite loest das nie aus.
   */
  ANFRAGE_ZU_GROSS: "Die Anfrage ist zu groß.",
  /** 500 der oeffentlichen Routen — ohne jede Angabe zum Fehler; geloggt wird nur der Fehlercode. */
  SERVERFEHLER: "Interner Serverfehler",
  /** 404 fuer unbekannte UND fremde Kinder — derselbe Text, damit er nichts verraet (Abschnitt 6). */
  POSITION_NICHT_GEFUNDEN: "Unterlage nicht gefunden",
  DATEI_NICHT_GEFUNDEN: "Datei nicht gefunden",

  // ---- HR im Portal (6.1, 5.2, Abschnitt 7) ----
  KEINE_BERECHTIGUNG: "Keine Berechtigung",
  /** 404 fuer unbekannten UND fremden Vorgang — derselbe Text wie GET /api/onboarding/[id]. */
  VORGANG_NICHT_GEFUNDEN: "Vorgang nicht gefunden",
  NACHFORDERUNG_NICHT_GEFUNDEN: "Nachforderung nicht gefunden",
  LAEUFT_BEREITS:
    "Für diesen Vorgang läuft bereits eine Nachforderung. Weitere Unterlagen fordern Sie dort mit „Unterlagen ergänzen…“ an.",
  NICHT_LAUFEND: "Die Nachforderung läuft nicht mehr.",
  NICHT_ABSCHLIESSBAR: "Es sind noch nicht alle Unterlagen angenommen oder entfallen.",
  /**
   * 409 (EP-3): Anlegen, Ergaenzen, Frist aendern, erneut senden, Zurueckweisen —
   * und derselbe Text als Hinweis der Karte bei einer laufenden Nachforderung
   * (`eingestelltHinweis`), damit HR die fehlenden Knoepfe nicht fuer einen
   * Fehler haelt. EIN Text fuer beides: Zwei Texte ueber dieselbe Sache gingen
   * auseinander. Nennt, was bleibt — und wie lange: Der naechste taegliche Lauf
   * zieht die Nachforderung zurueck (Z2); danach laesst sich nichts mehr
   * annehmen, und wer die Pruefung aufschiebt, verliert die eingereichten Dateien.
   */
  HR_VORGANG_EINGESTELLT:
    "Der Vorgang wird nicht mehr bearbeitet. E-Mails an die Person sind nicht mehr möglich. Deshalb können Sie keine Unterlagen mehr ergänzen oder zurückweisen, die Frist nicht mehr ändern und den Link nicht erneut senden. Bis zum nächsten täglichen Lauf können Sie eingegangene Unterlagen noch annehmen, Unterlagen als entfallen vermerken, eine Annahme zurücknehmen oder die Nachforderung zurückziehen. Danach zieht der Lauf die Nachforderung von selbst zurück, und ungeprüfte Dateien werden nach 30 Tagen gelöscht.",
  /** 409: prozesslokale Sperre je Vorgang (Abschnitt 7). */
  AKTION_LAEUFT: "Gerade läuft eine andere Aktion für diesen Vorgang. Bitte versuchen Sie es in einem Moment erneut.",
  EMPFAENGER_NICHT_FREIGEGEBEN:
    "Die Adresse weicht von der im Vorgang hinterlegten ab und liegt in keiner freigegebenen Domain (Einstellungen → SMTP → Erlaubte Empfänger-Domains).",
  ADRESSE_NICHT_BESTAETIGT:
    "Die Adresse weicht von der im Vorgang hinterlegten ab. Bitte bestätigen Sie, dass Sie sie geprüft haben.",
  /** 409 beim Anfordern und Ergaenzen (`sensibelAnforderbar`, Abschnitt 11). */
  SENSIBEL_NICHT_ERLAUBT: "Diese vertrauliche Unterlage lässt sich für diesen Vorgang nicht anfordern.",
  /** 409 beim Annehmen einer freien Zeile: die gewaehlte Art ist sensibel und nicht erlaubt (Abschnitt 11, 6.1). */
  ART_NICHT_UEBERNEHMBAR:
    "Diese vertrauliche Art lässt sich für diesen Vorgang nicht übernehmen. Bitte wählen Sie eine andere Art.",
  SAMMELART:
    "„Sonstiges“ lässt sich nicht als Unterlage anfordern. Bitte legen Sie dafür eine weitere Unterlage mit Bezeichnung an.",
  TYP_UNBEKANNT: "Diese Unterlage gibt es für diesen Vorgang nicht.",
  DOPPELT: "Eine Unterlage ist doppelt ausgewählt.",
  BEREITS_ANGEFORDERT: "Diese Unterlage ist in der laufenden Nachforderung bereits angefordert.",
  KEINE_POSITION: "Bitte wählen Sie mindestens eine Unterlage aus.",
  ZU_VIELE_POSITIONEN: `Höchstens ${MAX_POSITIONEN} Unterlagen je Nachforderung.`,
  FRIST_FEHLT: "Bitte geben Sie eine Frist an.",
  FRIST_UNGUELTIG: "Bitte geben Sie die Frist als Datum an (Tag, Monat, Jahr).",
  FRIST_ZU_FRUEH: "Die Frist muss frühestens morgen enden.",
  FRIST_ZU_SPAET: `Die Frist darf höchstens ${FRIST_MAX_TAGE} Tage in der Zukunft liegen.`,
  /** 409 beim Ergaenzen: heute > Frist, aber keine neue Frist angegeben. */
  NEUE_FRIST_NOETIG: "Die Frist ist verstrichen. Bitte geben Sie eine neue Frist an.",
  /** 409 bei „Link erneut senden" nach dem Linkende (EP-16): Die Friständerung verschickt selbst eine Mail. */
  ZUERST_FRIST_AENDERN:
    "Der Link ist abgelaufen. Bitte zuerst die Frist ändern – die Person bekommt dann eine E-Mail mit neuem Link.",
  /**
   * 409 beim Zurueckweisen ohne neue Frist nach dem Linkende (EP-1). NICHT
   * „zuerst die Frist ändern": Das waere eine zweite Mail, EP-1 verlangt genau eine.
   */
  ZURUECKWEISEN_FRIST_NOETIG:
    "Der Link ist abgelaufen. Bitte geben Sie eine neue Frist an – sie geht mit der Zurückweisung in einer E-Mail hinaus.",
  NICHTS_OFFEN: "Keine Unterlage wartet mehr auf die Person. Eine E-Mail ist nicht nötig.",
  /** 409 bei „Frist ändern" mit derselben Frist — der Weg für „noch einmal senden" ist „Link erneut senden". */
  FRIST_UNVERAENDERT:
    "Die Frist ist unverändert. Um der Person den Link noch einmal zu schicken, nutzen Sie „Link erneut senden“.",
  SPERRZEIT: `Der Link wurde vor weniger als ${SPERRZEIT_MINUTEN} Minuten gesendet. Bitte warten Sie kurz.`,
  /** 429: Mail-Bremse je Vorgang, ueber alle seine Nachforderungen (6 je Stunde, 20 je Tag). */
  MAIL_BREMSE:
    "An die Person sind in kurzer Zeit schon viele E-Mails gegangen. Bitte versuchen Sie es später erneut.",
  NICHT_ZU_PRUEFEN: "Diese Unterlage wartet nicht auf eine Prüfung.",
  NICHT_ENTFAELLBAR: "Diese Unterlage ist schon angenommen oder entfällt bereits.",
  NICHT_ANGENOMMEN: "Diese Unterlage ist nicht angenommen.",
  /** 409 beim Annehmen: SHA-256 weicht ab (4.4). */
  DATEI_VERAENDERT:
    "Die Datei wurde seit dem Hochladen verändert (Prüfsumme weicht ab). Bitte weisen Sie die Unterlage zurück.",
  /** 409 beim Annehmen: eine übermittelte Datei liegt nicht mehr auf der Platte (4.4). */
  DATEI_FEHLT:
    "Eine Datei dieser Unterlage liegt nicht mehr vor. Bitte weisen Sie die Unterlage zurück, damit die Person sie erneut hochlädt.",
  /** 400 beim Annehmen einer Katalogart mit einer anderen Art: wählbar nur bei einer frei benannten Unterlage (4.4). */
  ART_NICHT_WAEHLBAR:
    "Die Art steht bei dieser Unterlage fest. Wählen lässt sie sich nur bei einer frei benannten Unterlage.",
  /** 400 beim Annehmen: „Unbefristet" an einer Art ohne Ablaufdatum (Z1). */
  UNBEFRISTET_OHNE_ABLAUFDATUM: "„Unbefristet“ lässt sich nur bei einer Unterlage mit Ablaufdatum wählen.",
  /**
   * 400: Datum UND „unbefristet" zugleich (Z1) — beim Annehmen und in der
   * Frist-Korrektur (`PATCH /api/onboarding/[id]/documents/[docId]`), ein Text.
   */
  DATUM_UND_UNBEFRISTET: "Bitte entweder ein Ablaufdatum angeben oder „Unbefristet“ wählen, nicht beides.",
  RUECKNAHME_ZU_SPAET: `Eine Annahme lässt sich nur innerhalb von ${RUECKNAHME_MAX_TAGE} Tagen zurücknehmen.`,
  RUECKNAHME_ZURUECKGEZOGEN: "Die Nachforderung ist zurückgezogen. Die Annahme lässt sich nicht mehr zurücknehmen.",
  ANDERE_LAEUFT:
    "Für diesen Vorgang läuft inzwischen eine neuere Nachforderung. Die Annahme lässt sich deshalb nicht zurücknehmen – fordern Sie die Unterlage dort erneut an.",
  DOKUMENT_FEHLT: "Das übernommene Dokument liegt nicht mehr vor. Die Annahme lässt sich nicht zurücknehmen.",
  /** 409 bei der Rücknahme: Die Datei im Vorgang ist nicht mehr die angenommene (Prüfsumme, 4.5). */
  RUECKNAHME_DATEI_VERAENDERT:
    "Die übernommene Datei wurde seit der Annahme verändert. Die Annahme lässt sich nicht zurücknehmen.",
  DATEI_UNBERUEHRT: "Diese Datei ist von der Aktion nicht betroffen.",

  // ---- Mails (EP-11, N2, 8.1, Abschnitt 9) ----
  /** Warnung bei FAILED (Aktion trotzdem gespeichert). */
  MAIL_NICHT_ZUGESTELLT: "Die E-Mail konnte nicht zugestellt werden; der tägliche Lauf versucht es erneut.",
  /** Warnung bei SKIPPED wegen deaktivierter Vorlage. SKIPPED wird nie nachgeholt. */
  MAIL_VORLAGE_DEAKTIVIERT: "Die E-Mail wurde nicht versendet: Vorlage deaktiviert.",
  /** N2: versendet, das Ergebnis liess sich aber auch im zweiten Versuch nicht speichern. */
  MAIL_NACHWEIS_FEHLT:
    "Die E-Mail ist versendet, ihr Ergebnis konnte aber nicht gespeichert werden. Bitte nicht erneut senden.",
  /**
   * N2: „frühere Links sperren" liess sich nach dem Versand auch im zweiten
   * Versuch nicht speichern. KEINE Aufforderung zu einem neuen Versuch — der
   * einzige Weg dorthin waere eine weitere Mail mit weiterem Link.
   */
  SPERREN_NICHT_GESPEICHERT:
    "Die E-Mail ist versendet. Die früheren Links ließen sich aber nicht sperren und bleiben gültig – bitte nicht erneut senden.",
  /** `detail` einer Mail, deren Payload sich nicht bauen liess (Datenbank) — es ging nichts hinaus. */
  MAIL_NICHT_VORBEREITET: "Die E-Mail konnte nicht vorbereitet werden.",
  /** `detail`, wenn der Dispatcher kein Ergebnis lieferte (zaehlt als FAILED). */
  MAIL_OHNE_ERGEBNIS: "Der Versand lieferte kein Ergebnis.",
  /** Karte: HR-Mail ohne Empfaenger (weder anfordernde Person noch HR-Postfach). */
  HR_MELDUNG_OHNE_EMPFAENGER: "HR-Meldung nicht zugestellt (kein Empfänger)",
  /** Mailverlauf nach drei gescheiterten Nachholversuchen (Abschnitt 9). */
  NICHT_ZUSTELLBAR: "nicht zustellbar – Adresse prüfen",
} as const;

export type MeldungSchluessel = keyof typeof MELDUNGEN;

/** 410 „Linkende": „Dieser Link war bis 09.10.2026 gültig. …" (5.5). */
export function meldungLinkAbgelaufen(linkende: Kalendertag | null | undefined): string {
  if (!linkende || !istKalendertag(linkende)) return MELDUNGEN.LINK_ABGELAUFEN;
  return `Dieser Link war bis ${formatKalendertag(linkende)} gültig. Bitte wenden Sie sich an die Personalabteilung.`;
}

/**
 * Warum die gespeicherte Vorlage einer Mail an die Person nicht taugt — der
 * Dienst prueft das VOR jeder Anlage (409 ohne jede Aenderung).
 */
export type VorlageGrund = "VORLAGE_FEHLT" | "VORLAGE_DEAKTIVIERT" | "VORLAGE_OHNE_LINK" | "VORLAGE_BETREFF";

/**
 * 409-Text zu einer untauglichen Vorlage, mit ihrem Namen („Unterlagen
 * angefordert"). Jeder Text nennt die Folge fuer die Person und den Weg zur
 * Abhilfe (Einstellungen → E-Mail-Vorlagen).
 */
export function meldungVorlage(grund: VorlageGrund, name: string): string {
  switch (grund) {
    case "VORLAGE_FEHLT":
      return `Für die E-Mail „${name}“ ist keine Vorlage hinterlegt. Ohne sie erhält die Person keinen Link.`;
    case "VORLAGE_DEAKTIVIERT":
      return `Die E-Mail-Vorlage „${name}“ ist deaktiviert. Ohne sie erhält die Person keinen Link – bitte aktivieren Sie sie unter Einstellungen → E-Mail-Vorlagen.`;
    case "VORLAGE_OHNE_LINK":
      return `Die E-Mail-Vorlage „${name}“ enthält den Platzhalter {{link}} nicht. Die Person bekäme keinen Link zum Hochladen – bitte ergänzen Sie ihn unter Einstellungen → E-Mail-Vorlagen.`;
    case "VORLAGE_BETREFF":
      return `Der Betreff der E-Mail-Vorlage „${name}“ enthält einen gesperrten Platzhalter (etwa {{link}}). Der Betreff steht 90 Tage im Versandprotokoll – bitte korrigieren Sie ihn unter Einstellungen → E-Mail-Vorlagen.`;
  }
}

// =============================================
// Hilfen
// =============================================

function alsDatum(wert: Date | string | null | undefined): Date | null {
  if (wert == null) return null;
  const d = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Kalendertag einer `@db.Date`-Spalte (Frist, gueltigBis, …) — Prisma-Date oder JSON-Text. */
function datumsTag(wert: Date | string | null | undefined): Kalendertag | null {
  return ablaufKalendertag(wert);
}

/** Berliner Kalendertag eines Zeitstempels (angefordertAm, gesendetAm, …). */
function zeitpunktTag(wert: Date | string | null | undefined): Kalendertag | null {
  const d = alsDatum(wert);
  return d ? berlinerKalendertag(d) : null;
}

function iso(wert: Date | string | null | undefined): string | null {
  const d = alsDatum(wert);
  return d ? d.toISOString() : null;
}

/** „12.09.2026" aus einem Zeitstempel, leer bei unlesbarem Wert. */
function datumText(wert: Date | string | null | undefined): string {
  const tag = zeitpunktTag(wert);
  return tag ? formatKalendertag(tag) : "";
}

/** „12.09." — die Kurzform im Mailverlauf der Karte. */
function datumKurz(wert: Date | string | null | undefined): string {
  const lang = datumText(wert);
  return lang ? lang.slice(0, 6) : "";
}

function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

// =============================================
// Uebergaenge (2.1–2.3): erlaubt oder Grund
// =============================================

export type UebergangsGrund =
  // ---- HR ----
  | "NICHT_LAUFEND"
  | "NICHT_ABSCHLIESSBAR"
  | "HR_VORGANG_EINGESTELLT"
  | "LAEUFT_BEREITS"
  | "ANDERE_LAEUFT"
  | "NICHT_ZU_PRUEFEN"
  | "NICHT_ENTFAELLBAR"
  | "NICHT_REAKTIVIERBAR"
  | "NICHT_ANGENOMMEN"
  | "RUECKNAHME_ZU_SPAET"
  | "RUECKNAHME_ZURUECKGEZOGEN"
  | "UNBERUEHRT"
  // ---- Person (Upload-Seite, Texte aus 5.5) ----
  | "LINK_UNGUELTIG"
  | "ANFORDERUNG_ZURUECKGEZOGEN"
  | "VORGANG_EINGESTELLT"
  | "ALLES_GEPRUEFT"
  | "UNTERLAGE_ENTFAELLT"
  | "NICHT_OFFEN"
  | "NICHTS_BEREIT"
  | "NICHT_ENTFERNBAR";

/**
 * Text je Grund. Die Schluessel heissen wie in `MELDUNGEN`, damit gleiche Namen
 * nie zwei Texte meinen: `HR_VORGANG_EINGESTELLT` ist der 409-Text fuer HR,
 * `VORGANG_EINGESTELLT` der 410-Text fuer die Person.
 *
 * HR-Aktionen antworten mit 409 und dem Text ihres Grundes. Die Gruende der
 * Person tragen die Texte der Upload-Seite (5.5). Fuer Nachforderung und Vorgang
 * (LINK_UNGUELTIG, ANFORDERUNG_ZURUECKGEZOGEN, VORGANG_EINGESTELLT,
 * ALLES_GEPRUEFT) liefert den Statuscode `linkGueltig` (404/410, bei ERLEDIGT
 * 409): Die oeffentlichen Wege pruefen es vor und nach der Sperre (N1), die
 * Uebergaenge wiederholen nur die Reihenfolge, damit auch ein Aufruf ohne diese
 * Pruefung der Person nie einen Text fuer HR zeigt.
 */
export const UEBERGANGS_MELDUNGEN: Readonly<Record<UebergangsGrund, string>> = {
  NICHT_LAUFEND: MELDUNGEN.NICHT_LAUFEND,
  NICHT_ABSCHLIESSBAR: MELDUNGEN.NICHT_ABSCHLIESSBAR,
  HR_VORGANG_EINGESTELLT: MELDUNGEN.HR_VORGANG_EINGESTELLT,
  LAEUFT_BEREITS: MELDUNGEN.LAEUFT_BEREITS,
  ANDERE_LAEUFT: MELDUNGEN.ANDERE_LAEUFT,
  NICHT_ZU_PRUEFEN: MELDUNGEN.NICHT_ZU_PRUEFEN,
  NICHT_ENTFAELLBAR: MELDUNGEN.NICHT_ENTFAELLBAR,
  // Dieselbe Lage wie beim Ergaenzen einer schon angeforderten Art — ein Text.
  NICHT_REAKTIVIERBAR: MELDUNGEN.BEREITS_ANGEFORDERT,
  NICHT_ANGENOMMEN: MELDUNGEN.NICHT_ANGENOMMEN,
  RUECKNAHME_ZU_SPAET: MELDUNGEN.RUECKNAHME_ZU_SPAET,
  RUECKNAHME_ZURUECKGEZOGEN: MELDUNGEN.RUECKNAHME_ZURUECKGEZOGEN,
  UNBERUEHRT: MELDUNGEN.DATEI_UNBERUEHRT,
  LINK_UNGUELTIG: MELDUNGEN.LINK_UNGUELTIG,
  ANFORDERUNG_ZURUECKGEZOGEN: MELDUNGEN.ANFORDERUNG_ZURUECKGEZOGEN,
  VORGANG_EINGESTELLT: MELDUNGEN.VORGANG_EINGESTELLT,
  ALLES_GEPRUEFT: MELDUNGEN.ALLES_GEPRUEFT,
  UNTERLAGE_ENTFAELLT: MELDUNGEN.UNTERLAGE_ENTFAELLT,
  NICHT_OFFEN: MELDUNGEN.UNTERLAGE_NICHT_OFFEN,
  NICHTS_BEREIT: MELDUNGEN.NICHTS_ZU_UEBERMITTELN,
  NICHT_ENTFERNBAR: MELDUNGEN.DATEI_NICHT_ENTFERNBAR,
};

export type Verboten = { erlaubt: false; grund: UebergangsGrund; meldung: string };

export type Uebergang<S extends string> = { erlaubt: true; nach: S } | Verboten;

function verboten(grund: UebergangsGrund): Verboten {
  return { erlaubt: false, grund, meldung: UEBERGANGS_MELDUNGEN[grund] };
}

// ---- Nachforderung (2.1) ----

export type NachforderungsEreignis =
  /** — → LAUFEND („Anfordern und E-Mail senden") */
  | "ANLEGEN"
  /** LAUFEND → LAUFEND */
  | "ERGAENZEN"
  | "FRIST_AENDERN"
  | "ERNEUT_SENDEN"
  /** LAUFEND → ERLEDIGT, automatisch mit der letzten Entscheidung */
  | "ABSCHLIESSEN"
  /** LAUFEND → ZURUECKGEZOGEN (Endzustand) */
  | "ZURUECKZIEHEN"
  /** „Annahme zurücknehmen": ERLEDIGT → LAUFEND bzw. LAUFEND bleibt LAUFEND */
  | "WIEDEROEFFNEN";

/**
 * Darf die Nachforderung diesen Uebergang nehmen — und wohin fuehrt er?
 *
 * `vorgangEingestellt` sperrt nur, was eine Mail an die Person ausloest
 * (EP-3): Anlegen, Ergaenzen, Frist aendern, erneut senden. Zurueckziehen
 * bleibt immer moeglich. Ob die Nachforderung fuer den Vorgang ueberhaupt
 * `verfuegbar` ist (Onboarding: Nachweise abgegeben), prueft der Modul-Baustein
 * vorher. `andereLaufend` ist die Frage des Unique-Index `laufendSchluessel`
 * (die Datenbank beantwortet sie verbindlich mit P2002, hier nur vorab).
 */
export function nachforderungUebergang(
  ereignis: NachforderungsEreignis,
  stand: {
    status: string | null;
    vorgangEingestellt: boolean;
    andereLaufend?: boolean;
    /** Positionen NACH der Entscheidung (nur fuer ABSCHLIESSEN). */
    positionen?: ReadonlyArray<{ status: string }>;
  },
): Uebergang<NachforderungStatus> {
  switch (ereignis) {
    case "ANLEGEN":
      if (stand.vorgangEingestellt) return verboten("HR_VORGANG_EINGESTELLT");
      if (stand.andereLaufend) return verboten("LAEUFT_BEREITS");
      return { erlaubt: true, nach: "LAUFEND" };
    case "ERGAENZEN":
    case "FRIST_AENDERN":
    case "ERNEUT_SENDEN":
      if (stand.status !== "LAUFEND") return verboten("NICHT_LAUFEND");
      if (stand.vorgangEingestellt) return verboten("HR_VORGANG_EINGESTELLT");
      return { erlaubt: true, nach: "LAUFEND" };
    case "ABSCHLIESSEN": {
      if (stand.status !== "LAUFEND") return verboten("NICHT_LAUFEND");
      const positionen = stand.positionen ?? [];
      if (positionen.length === 0 || !positionen.every((p) => positionErledigt(p.status))) {
        return verboten("NICHT_ABSCHLIESSBAR");
      }
      return { erlaubt: true, nach: "ERLEDIGT" };
    }
    case "ZURUECKZIEHEN":
      if (stand.status !== "LAUFEND") return verboten("NICHT_LAUFEND");
      return { erlaubt: true, nach: "ZURUECKGEZOGEN" };
    case "WIEDEROEFFNEN":
      if (stand.status === "LAUFEND") return { erlaubt: true, nach: "LAUFEND" };
      if (stand.status === "ZURUECKGEZOGEN") return verboten("RUECKNAHME_ZURUECKGEZOGEN");
      if (stand.status !== "ERLEDIGT") return verboten("NICHT_LAUFEND");
      if (stand.andereLaufend) return verboten("ANDERE_LAEUFT");
      return { erlaubt: true, nach: "LAUFEND" };
  }
}

// ---- Position (2.2) ----

export type PositionsEreignis =
  /** ANGEFORDERT/ZURUECKGEWIESEN → EINGEREICHT (Person, mindestens eine Entwurfsdatei) */
  | "UEBERMITTELN"
  /** EINGEREICHT → ANGENOMMEN */
  | "ANNEHMEN"
  /** EINGEREICHT → ZURUECKGEWIESEN (Begruendung, genau eine Mail) */
  | "ZURUECKWEISEN"
  /** ANGEFORDERT/ZURUECKGEWIESEN/EINGEREICHT → ENTFAELLT (EP-2) */
  | "ENTFAELLT"
  /** ENTFAELLT → ANGEFORDERT („Ergänzen…" mit derselben Art) */
  | "REAKTIVIEREN"
  /** ANGENOMMEN → EINGEREICHT (E-3) */
  | "ANNAHME_ZURUECKNEHMEN";

export interface PositionsKontext {
  /** Status der Nachforderung, zu der die Position gehoert. */
  nachforderungStatus: string;
  vorgangEingestellt: boolean;
  heute: Kalendertag;
  /** UEBERMITTELN: Anzahl der Entwurfsdateien dieser Position. */
  entwuerfe?: number;
  /** ANNAHME_ZURUECKNEHMEN: Zeitpunkt der Annahme (`entschiedenAm`). */
  entschiedenAm?: Date | string | null;
  /** ANNAHME_ZURUECKNEHMEN bei ERLEDIGT: laeuft fuer den Vorgang schon eine andere? */
  andereLaufend?: boolean;
}

/** Liegt die Annahme noch hoechstens `RUECKNAHME_MAX_TAGE` Kalendertage zurueck? */
export function ruecknahmeFristOffen(entschiedenAm: Date | string | null | undefined, heute: Kalendertag): boolean {
  const tag = zeitpunktTag(entschiedenAm);
  return !!tag && tageZwischen(tag, heute) <= RUECKNAHME_MAX_TAGE;
}

/**
 * Darf die Person zu dieser Unterlage etwas hochladen, „Gültig bis" speichern
 * oder uebermitteln (4.3 Nr. 5 und 12, 6.1, N1)? Eine Pruefung fuer alle drei
 * Wege, damit sie dieselben Texte nennen.
 *
 * Zuerst Nachforderung und Vorgang in der Reihenfolge von `linkGueltig` — die
 * Route nimmt den Statuscode von dort (404/410, bei ERLEDIGT 409), hier steht
 * nur der passende Text der Person. Danach die Position: „Entfällt" hat einen
 * eigenen Text (5.5), eine uebermittelte oder angenommene Unterlage einen
 * anderen. Der Aufrufer antwortet darauf mit 409.
 */
export function hochladenErlaubt(
  von: string,
  kontext: Pick<PositionsKontext, "nachforderungStatus" | "vorgangEingestellt">,
): { erlaubt: true } | Verboten {
  const status = kontext.nachforderungStatus;
  if (status === "ZURUECKGEZOGEN") return verboten("ANFORDERUNG_ZURUECKGEZOGEN");
  if (status !== "LAUFEND" && status !== "ERLEDIGT") return verboten("LINK_UNGUELTIG");
  if (kontext.vorgangEingestellt) return verboten("VORGANG_EINGESTELLT");
  if (status === "ERLEDIGT") return verboten("ALLES_GEPRUEFT");
  if (von === "ENTFAELLT") return verboten("UNTERLAGE_ENTFAELLT");
  if (!wartetAufPerson(von)) return verboten("NICHT_OFFEN");
  return { erlaubt: true };
}

/**
 * Darf die Position diesen Uebergang nehmen?
 *
 * „Übermitteln" ist der Schritt der Person und nennt nur Texte der Upload-Seite
 * (`hochladenErlaubt`). Alle Ereignisse von HR ausser der Ruecknahme verlangen
 * eine LAUFENDE Nachforderung. Die Ruecknahme geht auch aus ERLEDIGT (dann
 * oeffnet sie die Nachforderung wieder, sofern keine andere laeuft), nie aus
 * ZURUECKGEZOGEN (E-3). Bei einem eingestellten Vorgang sind Zurueckweisen und
 * Reaktivieren gesperrt, weil beide eine Mail an die Person ausloesen (EP-3);
 * Annehmen, Entfällt und die Ruecknahme bleiben.
 */
export function positionUebergang(
  ereignis: PositionsEreignis,
  von: string,
  kontext: PositionsKontext,
): Uebergang<PositionStatus> {
  if (ereignis === "UEBERMITTELN") {
    const offen = hochladenErlaubt(von, kontext);
    if (!offen.erlaubt) return offen;
    if ((kontext.entwuerfe ?? 0) < 1) return verboten("NICHTS_BEREIT");
    return { erlaubt: true, nach: "EINGEREICHT" };
  }

  if (ereignis === "ANNAHME_ZURUECKNEHMEN") {
    if (von !== "ANGENOMMEN") return verboten("NICHT_ANGENOMMEN");
    const kopf = nachforderungUebergang("WIEDEROEFFNEN", {
      status: kontext.nachforderungStatus,
      vorgangEingestellt: kontext.vorgangEingestellt,
      andereLaufend: kontext.andereLaufend,
    });
    if (!kopf.erlaubt) return kopf;
    if (!ruecknahmeFristOffen(kontext.entschiedenAm, kontext.heute)) return verboten("RUECKNAHME_ZU_SPAET");
    return { erlaubt: true, nach: "EINGEREICHT" };
  }

  if (kontext.nachforderungStatus !== "LAUFEND") return verboten("NICHT_LAUFEND");

  switch (ereignis) {
    case "ANNEHMEN":
      if (von !== "EINGEREICHT") return verboten("NICHT_ZU_PRUEFEN");
      return { erlaubt: true, nach: "ANGENOMMEN" };
    case "ZURUECKWEISEN":
      if (kontext.vorgangEingestellt) return verboten("HR_VORGANG_EINGESTELLT");
      if (von !== "EINGEREICHT") return verboten("NICHT_ZU_PRUEFEN");
      return { erlaubt: true, nach: "ZURUECKGEWIESEN" };
    case "ENTFAELLT":
      if (!wartetAufPerson(von) && von !== "EINGEREICHT") return verboten("NICHT_ENTFAELLBAR");
      return { erlaubt: true, nach: "ENTFAELLT" };
    case "REAKTIVIEREN":
      if (kontext.vorgangEingestellt) return verboten("HR_VORGANG_EINGESTELLT");
      if (von !== "ENTFAELLT") return verboten("NICHT_REAKTIVIERBAR");
      return { erlaubt: true, nach: "ANGEFORDERT" };
  }
}

// ---- Datei (2.3) ----

export type DateiEreignis =
  /** Die Person entfernt einen Entwurf. */
  | "ENTFERNEN"
  /** Die Person uebermittelt: ENTWURF → EINGEREICHT. */
  | "UEBERMITTELN"
  | "ANNEHMEN"
  | "ZURUECKWEISEN"
  /** „Entfällt" oder Zurueckziehen der Nachforderung (EP-2, EP-9, Z2). */
  | "VERWERFEN"
  | "ANNAHME_ZURUECKNEHMEN";

/** `GELOESCHT`: Zeile in der Transaktion loeschen, die Datei danach. */
export type DateiFolge = DateiStatus | "GELOESCHT";

/**
 * Was eine Aktion mit einer Datei macht.
 *
 * Entwuerfe hat HR nie gesehen, und sie werden auch nicht mehr sichtbar: Beim
 * Entfernen durch die Person, bei „Entfällt" und beim Zurueckziehen
 * verschwinden Zeile und Datei sofort. Eingereichte Dateien werden dagegen
 * `VERWORFEN` und erst nach 30 Tagen geloescht (`loeschenAbBerechnen`); die
 * Zeile bleibt als Nachweis. `UNBERUEHRT` heisst: Diese Datei betrifft die
 * Aktion nicht (etwa eine laengst zurueckgewiesene beim Annehmen der neuen).
 */
export function dateiUebergang(ereignis: DateiEreignis, von: string): Uebergang<DateiFolge> {
  switch (ereignis) {
    case "ENTFERNEN":
      return von === "ENTWURF" ? { erlaubt: true, nach: "GELOESCHT" } : verboten("NICHT_ENTFERNBAR");
    case "UEBERMITTELN":
      return von === "ENTWURF" ? { erlaubt: true, nach: "EINGEREICHT" } : verboten("UNBERUEHRT");
    case "ANNEHMEN":
      return von === "EINGEREICHT" ? { erlaubt: true, nach: "ANGENOMMEN" } : verboten("UNBERUEHRT");
    case "ZURUECKWEISEN":
      return von === "EINGEREICHT" ? { erlaubt: true, nach: "ZURUECKGEWIESEN" } : verboten("UNBERUEHRT");
    case "VERWERFEN":
      if (von === "ENTWURF") return { erlaubt: true, nach: "GELOESCHT" };
      if (von === "EINGEREICHT") return { erlaubt: true, nach: "VERWORFEN" };
      return verboten("UNBERUEHRT");
    case "ANNAHME_ZURUECKNEHMEN":
      return von === "ANGENOMMEN" ? { erlaubt: true, nach: "EINGEREICHT" } : verboten("UNBERUEHRT");
  }
}

/**
 * Ab wann der Lauf eine zurueckgewiesene oder verworfene Datei loeschen darf:
 * Ereignis + 30 Tage (4.5, EP-8). Ein Zeitpunkt, kein Kalendertag — die
 * Stunde der Zeitumstellung spielt bei 30 Tagen keine Rolle.
 */
export function loeschenAbBerechnen(jetzt: Date): Date {
  return new Date(jetzt.getTime() + LOESCHEN_NACH_TAGEN * MS_PRO_TAG);
}

// =============================================
// Merker „vollständig" (2.1, EP-17)
// =============================================

export type MerkerEreignis =
  /** Die Person uebermittelt. */
  | "UEBERMITTELT"
  | "ZURUECKGEWIESEN"
  /** Ergaenzen, auch das Reaktivieren einer Position ueber „Ergänzen". */
  | "ERGAENZT"
  | "ANGENOMMEN"
  | "ENTFAELLT"
  | "FRIST_GEAENDERT"
  | "ERNEUT_GESENDET"
  /** ERLEDIGT, automatisch mit der letzten Entscheidung. */
  | "ERLEDIGT"
  | "ZURUECKGEZOGEN"
  | "ANNAHME_ZURUECKGENOMMEN";

export interface VollstaendigMerker {
  vollstaendigSeit: Date | null;
  vollstaendigGemeldetAm: Date | null;
}

/**
 * Die beiden Merker nach der Tabelle in 2.1:
 *
 * | Ereignis                                              | Seit        | Gemeldet   |
 * |-------------------------------------------------------|-------------|------------|
 * | Person uebermittelt, danach wartet nichts mehr        | jetzt       | null       |
 * | Person uebermittelt, es wartet noch etwas             | unveraendert| unveraendert|
 * | Zurueckweisen, Ergaenzen (auch Reaktivieren)          | null        | null       |
 * | Annehmen/Entfällt ohne Abschluss, Frist, erneut senden| unveraendert| unveraendert|
 * | ERLEDIGT (automatisch), Zurueckziehen                 | null        | null       |
 * | Annahme zuruecknehmen                                 | unveraendert| unveraendert|
 *
 * Nur die Uebermittlung der Person setzt `vollstaendigSeit` — deshalb loest nie
 * eine Aktion von HR die HR-Mail aus, auch wenn die Nachforderung durch
 * „Entfällt" oder eine Ruecknahme „vollständig" wird. In der zweiten Runde nach
 * einer Zurueckweisung setzt die neue Uebermittlung den Merker erneut, und die
 * Mail geht noch einmal hinaus. Annehmen oder Entfällt mit Abschluss ist
 * „ERLEDIGT" — hier daran erkannt, dass nach dem Ereignis jede Position erledigt
 * ist.
 *
 * @param stand.positionenNachher alle Positionen NACH dem Ereignis
 */
export function vollstaendigMerker(
  ereignis: MerkerEreignis,
  stand: {
    vollstaendigSeit: Date | string | null;
    vollstaendigGemeldetAm: Date | string | null;
    positionenNachher: ReadonlyArray<{ status: string }>;
    jetzt: Date;
  },
): VollstaendigMerker {
  const unveraendert: VollstaendigMerker = {
    vollstaendigSeit: alsDatum(stand.vollstaendigSeit),
    vollstaendigGemeldetAm: alsDatum(stand.vollstaendigGemeldetAm),
  };
  const geleert: VollstaendigMerker = { vollstaendigSeit: null, vollstaendigGemeldetAm: null };

  switch (ereignis) {
    case "UEBERMITTELT":
      return stand.positionenNachher.some((p) => wartetAufPerson(p.status))
        ? unveraendert
        : { vollstaendigSeit: stand.jetzt, vollstaendigGemeldetAm: null };
    case "ZURUECKGEWIESEN":
    case "ERGAENZT":
    case "ERLEDIGT":
    case "ZURUECKGEZOGEN":
      return geleert;
    case "ANGENOMMEN":
    case "ENTFAELLT": {
      const abgeschlossen =
        stand.positionenNachher.length > 0 && stand.positionenNachher.every((p) => positionErledigt(p.status));
      return abgeschlossen ? geleert : unveraendert;
    }
    case "FRIST_GEAENDERT":
    case "ERNEUT_GESENDET":
    case "ANNAHME_ZURUECKGENOMMEN":
      return unveraendert;
  }
}

// =============================================
// Link und Token (2.4, 5.1)
// =============================================

const TOKEN_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Hat der Token die Form von `randomUUID()` (UUID v4, Kleinbuchstaben)? Sonst
 * antwortet die Route 404, OHNE die Datenbank zu fragen (4.3 Nr. 2).
 */
export function tokenFormatGueltig(token: unknown): token is string {
  return typeof token === "string" && TOKEN_MUSTER.test(token);
}

/** `gueltigBis` eines neuen Links: Frist + 14 (5.1). */
export function linkGueltigBisFuer(frist: Kalendertag): Kalendertag {
  return tageSpaeter(frist, GUELTIG_NACH_FRIST_TAGE);
}

/**
 * Das Linkende der Nachforderung als Ganzes: Frist + 14. Kein Link kann laenger
 * gelten (`linkende`); danach ist die Nachforderung „Link abgelaufen" (2.1),
 * und ab hier zaehlen die 30 Tage fuer uebrige Entwuerfe (4.5) — jeweils neu
 * berechnet, eine verlaengerte Frist rettet die Entwuerfe.
 */
export function nachforderungLinkende(frist: Date | string): Kalendertag | null {
  const tag = datumsTag(frist);
  return tag ? linkGueltigBisFuer(tag) : null;
}

/**
 * Ab welchem Kalendertag der Lauf uebrig gebliebene Entwuerfe loescht:
 * Linkende + 30 (4.5) — jeweils aus der AKTUELLEN Frist gerechnet, eine
 * verlaengerte Frist rettet die Entwuerfe. Dieselbe Rechnung im Lauf
 * (unterlagen-fristen.ts) und im Lauf-Waechter, damit er nie eine Loeschung
 * anmahnt, die der Lauf noch gar nicht vorhat.
 */
export function entwurfLoeschenAb(frist: Date | string): Kalendertag | null {
  const ende = nachforderungLinkende(frist);
  return ende ? tageSpaeter(ende, LOESCHEN_NACH_TAGEN) : null;
}

/** Linkende EINES Links: min(link.gueltigBis, Frist + 14), einschliesslich (2.4). */
export function linkende(link: { gueltigBis: Date | string }, frist: Date | string): Kalendertag | null {
  const eigen = datumsTag(link.gueltigBis);
  const kopf = nachforderungLinkende(frist);
  if (!eigen || !kopf) return null;
  return eigen <= kopf ? eigen : kopf;
}

/**
 * Lebt der Link heute noch (nicht entwertet, Linkende nicht ueberschritten)?
 * Nur solche Links schreibt eine Friständerung auf `neueFrist + 14` fort (5.1)
 * — ein abgelaufener lebt nicht wieder auf, auch nicht nach einer
 * Verlaengerung oder einer Ruecknahme.
 */
export function linkLebt(
  link: { entwertetAm: Date | string | null; gueltigBis: Date | string },
  frist: Date | string,
  heute: Kalendertag,
): boolean {
  if (alsDatum(link.entwertetAm)) return false;
  const ende = linkende(link, frist);
  return !!ende && heute <= ende;
}

export type LinkMeldung =
  | "LINK_UNGUELTIG"
  | "LINK_ERSETZT"
  | "LINK_ABGELAUFEN"
  | "ANFORDERUNG_ZURUECKGEZOGEN"
  | "VORGANG_EINGESTELLT"
  | "ALLES_GEPRUEFT";

export type LinkPruefung =
  | {
      gueltig: true;
      status: 200;
      /** ERLEDIGT: nur lesen (Hochladen, Entfernen, Übermitteln → 409). */
      readOnly: boolean;
      schluessel: "ALLES_GEPRUEFT" | null;
      meldung: string | null;
      linkende: Kalendertag;
    }
  | {
      gueltig: false;
      status: 404 | 410;
      schluessel: Exclude<LinkMeldung, "ALLES_GEPRUEFT">;
      meldung: string;
      /** Nur bei LINK_ABGELAUFEN: das Datum fuer die Meldung. Sonst null — eine
       *  410 verraet weder Name noch Einrichtung noch Vorgangsnummer. */
      linkende: Kalendertag | null;
    };

/**
 * Ist dieser Link heute gueltig — und was antwortet die oeffentliche Seite?
 *
 * Reihenfolge (2.4):
 *   1. entwertet wegen Adresswechsel → 404 „ungültig" (wer die Mail an eine
 *      falsche Adresse bekam, erfaehrt nicht, dass es den Vorgang gibt);
 *      entwertet ueber „frühere Links sperren" → 410 „ersetzt";
 *   2. Nachforderung zurueckgezogen → 410;
 *   3. Vorgang eingestellt (Onboarding EXPIRED) → 410;
 *   4. heute > min(link.gueltigBis, Frist + 14) → 410 mit Datum;
 *   5. ERLEDIGT → 200 nur lesend; LAUFEND → 200.
 *
 * Dieselbe Pruefung laeuft in jedem oeffentlichen Schreibweg nach der Sperre
 * noch einmal (N1). Unlesbare Daten oder ein unbekannter Status ergeben 404.
 */
export function linkGueltig(opts: {
  link: { entwertetAm: Date | string | null; entwertetGrund: string | null; gueltigBis: Date | string };
  nachforderung: { status: string; frist: Date | string };
  vorgangEingestellt: boolean;
  heute: Kalendertag;
}): LinkPruefung {
  const ungueltig = (
    schluessel: Exclude<LinkMeldung, "ALLES_GEPRUEFT">,
    status: 404 | 410,
    ende: Kalendertag | null = null,
  ): LinkPruefung => ({
    gueltig: false,
    status,
    schluessel,
    meldung: schluessel === "LINK_ABGELAUFEN" ? meldungLinkAbgelaufen(ende) : MELDUNGEN[schluessel],
    linkende: ende,
  });

  if (alsDatum(opts.link.entwertetAm)) {
    return opts.link.entwertetGrund === "GESPERRT" ? ungueltig("LINK_ERSETZT", 410) : ungueltig("LINK_UNGUELTIG", 404);
  }
  const status = opts.nachforderung.status;
  if (status === "ZURUECKGEZOGEN") return ungueltig("ANFORDERUNG_ZURUECKGEZOGEN", 410);
  if (status !== "LAUFEND" && status !== "ERLEDIGT") return ungueltig("LINK_UNGUELTIG", 404);
  if (opts.vorgangEingestellt) return ungueltig("VORGANG_EINGESTELLT", 410);

  const ende = linkende(opts.link, opts.nachforderung.frist);
  if (!ende) return ungueltig("LINK_UNGUELTIG", 404);
  if (opts.heute > ende) return ungueltig("LINK_ABGELAUFEN", 410, ende);

  if (status === "ERLEDIGT") {
    return {
      gueltig: true,
      status: 200,
      readOnly: true,
      schluessel: "ALLES_GEPRUEFT",
      meldung: MELDUNGEN.ALLES_GEPRUEFT,
      linkende: ende,
    };
  }
  return { gueltig: true, status: 200, readOnly: false, schluessel: null, meldung: null, linkende: ende };
}

// =============================================
// Frist (EP-1, EP-5, EP-16)
// =============================================

export interface FristGrenzen {
  /** Fruehester Tag: morgen. */
  min: Kalendertag;
  /** Spaetester Tag: heute + 90. */
  max: Kalendertag;
  /** Vorschlag im Dialog: heute + 14. */
  vorschlag: Kalendertag;
}

export function fristGrenzen(heute: Kalendertag): FristGrenzen {
  return {
    min: tageSpaeter(heute, FRIST_MIN_TAGE),
    max: tageSpaeter(heute, FRIST_MAX_TAGE),
    vorschlag: tageSpaeter(heute, FRIST_VORSCHLAG_TAGE),
  };
}

/**
 * Ergebnis von `fristPruefen`. Eigener Name: `FristPruefung` in
 * dokument-fristen.ts prueft das Ablaufdatum eines Dokuments, nicht die Frist
 * einer Nachforderung — der Annehmen-Dienst braucht beide.
 */
export type NachforderungsFristPruefung =
  | { ok: true; tag: Kalendertag }
  | { ok: false; grund: "FRIST_FEHLT" | "FRIST_UNGUELTIG" | "FRIST_ZU_FRUEH" | "FRIST_ZU_SPAET"; meldung: string };

/**
 * Prueft eine neue Frist (Anfordern, Ergaenzen, Frist aendern, Zurueckweisen):
 * ein echter Kalendertag `YYYY-MM-DD`, fruehestens morgen, hoechstens heute + 90.
 * Wochenenden sind erlaubt — der Dialog weist nur darauf hin (EP-5).
 */
export function fristPruefen(roh: unknown, heute: Kalendertag): NachforderungsFristPruefung {
  const wert = typeof roh === "string" ? roh.trim() : "";
  if (!wert) return { ok: false, grund: "FRIST_FEHLT", meldung: MELDUNGEN.FRIST_FEHLT };
  if (!istKalendertag(wert)) return { ok: false, grund: "FRIST_UNGUELTIG", meldung: MELDUNGEN.FRIST_UNGUELTIG };
  const grenzen = fristGrenzen(heute);
  if (wert < grenzen.min) return { ok: false, grund: "FRIST_ZU_FRUEH", meldung: MELDUNGEN.FRIST_ZU_FRUEH };
  if (wert > grenzen.max) return { ok: false, grund: "FRIST_ZU_SPAET", meldung: MELDUNGEN.FRIST_ZU_SPAET };
  return { ok: true, tag: wert };
}

/** Samstag oder Sonntag? Der Wochentag wird immer gerechnet, nie abgeschrieben. */
export function istWochenende(tag: Kalendertag): boolean {
  const w = wochentagVon(tag);
  return w === 0 || w === 6;
}

/** Hinweis im Dialog bei einer Frist am Wochenende — sperrt nichts (EP-5). Name aus `WOCHENTAGE`. */
export function fristWochenendeHinweis(tag: Kalendertag): string | null {
  if (!istKalendertag(tag) || !istWochenende(tag)) return null;
  return `Die Frist fällt auf einen ${WOCHENTAGE[wochentagVon(tag)]}. Das ist erlaubt – die Person kann auch am Wochenende hochladen.`;
}

/**
 * Die Frist mit Restlaufzeit, etwa „Freitag, 25.09.2026 · noch 5 Tage". Nach der
 * Frist: „… · verstrichen, Link noch bis 09.10.2026 nutzbar", nach dem Linkende
 * „… · verstrichen, Link abgelaufen". Die Karte setzt „Frist: " davor.
 */
export function fristText(frist: Kalendertag, heute: Kalendertag): string {
  const lang = formatKalendertagLang(frist);
  if (!istKalendertag(frist)) return lang;
  const tage = tageZwischen(heute, frist);
  if (tage > 0) return `${lang} · noch ${anzahl(tage, "Tag", "Tage")}`;
  if (tage === 0) return `${lang} · endet heute`;
  const ende = linkGueltigBisFuer(frist);
  return heute <= ende
    ? `${lang} · verstrichen, Link noch bis ${formatKalendertag(ende)} nutzbar`
    : `${lang} · verstrichen, Link abgelaufen`;
}

/**
 * Der Info-Satz im Dialog zur gewaehlten Frist (10.1, KO-K3) — nur, was auch
 * stimmt. Die Vorab-Erinnerung geht nur, wenn die letzte Mail vor
 * „Frist − 7" lag; die Mail, die der Dialog gleich verschickt, geht heute
 * hinaus. Bei einer Frist unter 8 Tagen entfaellt „7 Tage vorher" also.
 */
export function dialogErinnerungsSatz(frist: Kalendertag, heute: Kalendertag): string {
  const danach = "Ist die Frist verstrichen, erhalten Sie eine E-Mail. Der Link bleibt danach noch 14 Tage nutzbar.";
  if (!istKalendertag(frist)) return danach;
  const tage = tageZwischen(heute, frist);
  if (tage > ERINNERUNG_VORAB_TAGE) {
    return `Die Person wird 7 Tage vorher und am Fristtag automatisch erinnert. ${danach}`;
  }
  if (tage > 0) return `Die Person wird am Fristtag automatisch erinnert. ${danach}`;
  if (tage === 0) {
    return "Die Frist endet heute; eine Erinnerung geht nicht mehr hinaus. Ist sie verstrichen, erhalten Sie eine E-Mail. Der Link bleibt danach noch 14 Tage nutzbar.";
  }
  const ende = linkGueltigBisFuer(frist);
  return heute <= ende
    ? `Die Frist ist verstrichen. Der Link bleibt noch bis ${formatKalendertag(ende)} nutzbar; eine Erinnerung geht nicht mehr hinaus.`
    : "Die Frist ist seit mehr als 14 Tagen verstrichen, der Link ist abgelaufen. Bitte wählen Sie eine neue Frist.";
}

/**
 * Das Fristfeld im Dialog „Zurückweisen…" (EP-1): Vorschlag ist die bisherige
 * Frist, wenn sie noch mindestens 7 Tage entfernt liegt, sonst heute + 7. Ist
 * der Link schon tot (heute > Frist + 14), ist eine neue Frist Pflicht — sonst
 * enthielte die Mail einen toten Link.
 */
export function zurueckweisenFrist(
  frist: Kalendertag,
  heute: Kalendertag,
): { vorschlag: Kalendertag; pflicht: boolean } {
  const weitGenug = istKalendertag(frist) && tageZwischen(heute, frist) >= ZURUECKWEISEN_FRIST_TAGE;
  return {
    vorschlag: weitGenug ? frist : tageSpaeter(heute, ZURUECKWEISEN_FRIST_TAGE),
    pflicht: !istKalendertag(frist) || heute > linkGueltigBisFuer(frist),
  };
}

/**
 * Die Frist im Body von „zurueckweisen" (EP-1), dieselbe Regel wie im Dialog
 * (`zurueckweisenFrist`): Eine angegebene Frist muss in den Grenzen liegen
 * (400). Ohne Angabe bleibt die bisherige — ausser der Link ist schon tot, dann
 * 409. Die neue Frist geht mit der Zurueckweisung in EINER Mail hinaus; eine
 * eigene Friständerung davor waere eine zweite.
 */
export function zurueckweisenFristPruefen(
  roh: unknown,
  bisherigeFrist: Kalendertag,
  heute: Kalendertag,
):
  | { ok: true; frist: Kalendertag | null }
  | {
      ok: false;
      status: 400 | 409;
      grund: Exclude<NachforderungsFristPruefung, { ok: true }>["grund"] | "ZURUECKWEISEN_FRIST_NOETIG";
      meldung: string;
    } {
  const wert = typeof roh === "string" ? roh.trim() : "";
  if (wert) {
    const pruefung = fristPruefen(wert, heute);
    return pruefung.ok
      ? { ok: true, frist: pruefung.tag }
      : { ok: false, status: 400, grund: pruefung.grund, meldung: pruefung.meldung };
  }
  if (zurueckweisenFrist(bisherigeFrist, heute).pflicht) {
    return {
      ok: false,
      status: 409,
      grund: "ZURUECKWEISEN_FRIST_NOETIG",
      meldung: MELDUNGEN.ZURUECKWEISEN_FRIST_NOETIG,
    };
  }
  return { ok: true, frist: null };
}

/**
 * Der Satz im Fristkasten der Upload-Seite (5.3, 10.1). Das Linkende steht nur
 * NACH der Frist da — vorher gibt es genau ein Datum, die Frist.
 */
export function oeffentlicherFristSatz(frist: Kalendertag, linkendeTag: Kalendertag, heute: Kalendertag): string {
  if (heute <= frist) return `Bitte laden Sie die Unterlagen bis ${formatKalendertagLang(frist)} hoch.`;
  return `Die Frist ist abgelaufen. Sie können die Unterlagen noch bis ${formatKalendertagLang(linkendeTag)} hochladen.`;
}

// =============================================
// Eingabe von „Anfordern" und „Ergänzen" (EP-5, EP-15, 6.1)
// =============================================

export type EingabeGrund =
  | "KEINE_POSITION"
  | "ZU_VIELE_POSITIONEN"
  | "SAMMELART"
  | "TYP_UNBEKANNT"
  | "DOPPELT"
  | "BEREITS_ANGEFORDERT"
  | "NEUE_FRIST_NOETIG"
  | "FRIST_FEHLT"
  | "FRIST_UNGUELTIG"
  | "FRIST_ZU_FRUEH"
  | "FRIST_ZU_SPAET";

export type EingabePruefung =
  | {
      ok: true;
      /** Neue Frist, beim Ergaenzen ohne Angabe `null` (bisherige bleibt). */
      frist: Kalendertag | null;
      /** Katalogarten, deren Position auf ENTFAELLT steht und wieder angefordert wird. */
      reaktivieren: string[];
      /** So viele Positionen kommen neu hinzu (Katalog und frei). */
      neu: number;
    }
  | { ok: false; status: 400 | 409; grund: EingabeGrund; meldung: string };

/**
 * Die Regeln einer Anforderung, die Zod nicht kennt, weil sie `heute` oder den
 * Stand der laufenden Nachforderung brauchen — dieselbe Pruefung im Dialog und
 * auf dem Server.
 *
 * - Frist (EP-5): morgen bis heute + 90. Beim Anfordern Pflicht, beim
 *   Ergaenzen optional — nach Fristablauf aber Pflicht (409), sonst ginge eine
 *   Mail mit verstrichener Frist hinaus.
 * - Katalogarten: nie eine Sammelart wie SONSTIGES (400), nur Arten aus dem
 *   Katalog des Moduls (400), keine doppelt (409). Beim Ergaenzen ist eine
 *   schon angeforderte Art nur waehlbar, wenn ihre Position auf ENTFAELLT steht
 *   — dann wird sie wieder aktiv, statt neu zu entstehen.
 * - Hoechstens 30 Positionen, auch nach „Ergänzen" (EP-15). Freie Zeilen sind
 *   nicht eigens begrenzt. Beim Anfordern ist das eine Formfrage (400, wie Zod),
 *   beim Ergaenzen eine Frage des Stands (409).
 *
 * Ob eine sensible Art angefordert werden darf, entscheidet das Modul
 * (`sensibelAnforderbar`, 409) — das braucht Pflichten und Vorgangsdaten.
 */
export function eingabePruefen(
  eingabe: {
    aktion: "anfordern" | "ergaenzen";
    frist?: string | null;
    positionen: ReadonlyArray<{ typ: string | null }>;
  },
  kontext: {
    heute: Kalendertag;
    /** Katalogarten des Moduls, die sich anfordern lassen. */
    katalog: readonly string[];
    /** Nur beim Ergaenzen: die Positionen der laufenden Nachforderung. */
    bestehend?: ReadonlyArray<{ typ: string | null; status: string }>;
    /** Nur beim Ergaenzen: die bisherige Frist. */
    bisherigeFrist?: Kalendertag | null;
  },
): EingabePruefung {
  const fehler = (status: 400 | 409, grund: EingabeGrund): EingabePruefung => ({
    ok: false,
    status,
    grund,
    meldung: MELDUNGEN[grund],
  });
  const ergaenzen = eingabe.aktion === "ergaenzen";

  if (eingabe.positionen.length === 0) return fehler(400, "KEINE_POSITION");
  if (!ergaenzen && eingabe.positionen.length > MAX_POSITIONEN) return fehler(400, "ZU_VIELE_POSITIONEN");

  let frist: Kalendertag | null = null;
  const fristRoh = typeof eingabe.frist === "string" ? eingabe.frist.trim() : "";
  if (fristRoh || !ergaenzen) {
    const pruefung = fristPruefen(fristRoh, kontext.heute);
    if (!pruefung.ok) return fehler(400, pruefung.grund);
    frist = pruefung.tag;
  } else if (kontext.bisherigeFrist && kontext.heute > kontext.bisherigeFrist) {
    return fehler(409, "NEUE_FRIST_NOETIG");
  }

  const bestehend = ergaenzen ? (kontext.bestehend ?? []) : [];
  const gesehen = new Set<string>();
  const reaktivieren: string[] = [];
  let neu = 0;
  for (const p of eingabe.positionen) {
    if (p.typ === null) {
      neu += 1;
      continue;
    }
    if (SAMMELARTEN.includes(p.typ)) return fehler(400, "SAMMELART");
    if (!kontext.katalog.includes(p.typ)) return fehler(400, "TYP_UNBEKANNT");
    if (gesehen.has(p.typ)) return fehler(409, "DOPPELT");
    gesehen.add(p.typ);
    const vorhanden = bestehend.find((b) => b.typ === p.typ);
    if (vorhanden) {
      if (vorhanden.status !== "ENTFAELLT") return fehler(409, "BEREITS_ANGEFORDERT");
      reaktivieren.push(p.typ);
    } else {
      neu += 1;
    }
  }

  if (ergaenzen && bestehend.length + neu > MAX_POSITIONEN) return fehler(409, "ZU_VIELE_POSITIONEN");

  return { ok: true, frist, reaktivieren, neu };
}

// =============================================
// Taeglicher Lauf: Erinnerung und Lauf-Waechter (Abschnitt 9, EP-13)
// =============================================

/**
 * Was `erinnerungFaellig` braucht — die Felder heissen wie in der Datenbank,
 * damit der Lauf (src/lib/unterlagen-fristen.ts) Prisma-Zeilen direkt
 * hineinreicht. Alle Links einer Nachforderung sind Mails an die Person.
 */
export interface ErinnerungsStand {
  status: string;
  frist: Date | string;
  erinnertFuerFrist: Date | string | null;
  erinnertStufe: string | null;
  positionen: ReadonlyArray<{ status: string }>;
  links: ReadonlyArray<{ mailStatus: string; gesendetAm: Date | string | null }>;
}

/** Der Berliner Tag der juengsten zugestellten Mail an die Person, oder null. */
function letzteZustellung(links: ErinnerungsStand["links"]): Kalendertag | null {
  let spaetester: Kalendertag | null = null;
  for (const l of links) {
    if (l.mailStatus !== "SENT") continue;
    const tag = zeitpunktTag(l.gesendetAm);
    if (tag && (!spaetester || tag > spaetester)) spaetester = tag;
  }
  return spaetester;
}

/**
 * Ist heute eine Erinnerung an die Person faellig — und welche?
 *
 * DIE eine Faelligkeitsregel: Der taegliche Lauf (unterlagen-fristen.ts
 * re-exportiert sie von hier) und der Lauf-Waechter (`laufWaechter`, mit
 * `gestern`) rufen dieselbe Funktion. Zwei Fassungen liefen auseinander, und
 * dann meldete der Waechter eine Erinnerung als ausgeblieben, die der Lauf nie
 * schicken wollte.
 *
 * Voraussetzungen: LAUFEND, mindestens eine zugestellte Mail an die Person,
 * mindestens eine Position wartet auf sie, heute ≤ Frist. Einen eingestellten
 * Vorgang laesst der Lauf vorher aus (EP-3).
 *
 * - VORAB: Frist − 7 ≤ heute < Frist, fuer diese Frist noch keine Erinnerung,
 *   und die letzte zugestellte Mail liegt VOR Frist − 7. Wer die Aufforderung
 *   erst in der Woche vor der Frist bekam, braucht keine Vorab-Mail.
 * - FRISTTAG: heute = Frist, fuer diese Frist noch keine Fristtag-Erinnerung,
 *   und heute ging noch keine Mail an die Person. Ein verpasster Fristtag wird
 *   nicht nachgeholt.
 *
 * Eine neue Frist startet ueber `erinnertFuerFrist` von selbst einen neuen
 * Zyklus.
 */
export function erinnerungFaellig(stand: ErinnerungsStand, heute: Kalendertag): UnterlagenErinnerungsStufe | null {
  if (stand.status !== "LAUFEND") return null;
  const frist = datumsTag(stand.frist);
  if (!frist || heute > frist) return null;
  if (!stand.positionen.some((p) => wartetAufPerson(p.status))) return null;
  const zuletzt = letzteZustellung(stand.links);
  if (!zuletzt) return null;

  const fuerDieseFrist = datumsTag(stand.erinnertFuerFrist) === frist;
  if (heute === frist) {
    const fristtagSchonErinnert = fuerDieseFrist && stand.erinnertStufe === "FRISTTAG";
    return !fristtagSchonErinnert && zuletzt !== heute ? "FRISTTAG" : null;
  }
  const fensterBeginn = tageSpaeter(frist, -ERINNERUNG_VORAB_TAGE);
  if (heute < fensterBeginn) return null;
  return !fuerDieseFrist && zuletzt < fensterBeginn ? "VORAB" : null;
}

/** Was der Waechter je Nachforderung braucht: der Erinnerungsstand plus Dateien und Anlaesse. */
export interface WaechterStand extends ErinnerungsStand {
  /** Onboarding: EXPIRED — der Lauf verschickt dann nichts, ein Ausbleiben ist kein Alarm. */
  vorgangEingestellt: boolean;
  links: ReadonlyArray<{
    anlass: string;
    mailStatus: string;
    gesendetAm: Date | string | null;
    createdAt: Date | string;
    /** `null` = vom taeglichen Lauf angelegt (Erinnerung oder Nachholen, Schema 3.2). */
    erstelltVonId: string | null;
  }>;
  positionen: ReadonlyArray<{
    status: string;
    dateien: ReadonlyArray<{
      status: string;
      loeschenAb: Date | string | null;
      dateiGeloeschtAm: Date | string | null;
    }>;
  }>;
}

export interface WaechterBefund {
  /** Die Vorab-Erinnerung war faellig seit (Fensterbeginn Frist − 7), aber es gibt keine Spur des Laufs. */
  erinnerungVom: Kalendertag | null;
  /** Eine Loeschung ist seit diesem Tag faellig und noch nicht geschehen. */
  loeschungSeit: Kalendertag | null;
}

/**
 * Der Lauf-Waechter ohne neue Tabelle (EP-13). Anlass: Die Erinnerungen standen
 * mindestens 60 Tage still, ohne dass es auffiel (P:2740).
 *
 * - **Erinnerung ausgeblieben:** `erinnerungFaellig(stand, gestern)` sagt VORAB
 *   — mit DERSELBEN Funktion wie der Lauf — und seit dem Fensterbeginn gibt es
 *   keine Spur des Laufs: keine Link-Zeile ERINNERUNG_VORAB und auch sonst keine
 *   vom Lauf angelegte (`erstelltVonId = null`), gleich welcher Status. So loesen
 *   eine regelgerecht entfallene Vorab-Mail (letzte Mail im Fenster), eine
 *   FAILED-Erinnerung (sie wurde ja versucht) und ein eingestellter Vorgang
 *   keinen Fehlalarm aus — und ebenso ein Lauf, der im Fenster eine gescheiterte
 *   Mail nachholte: Je Lauf geht hoechstens EINE Mail an die Person, das
 *   Nachholen (Schritt 2) kommt vor der Erinnerung (Schritt 3). Das praezisiert
 *   den Wortlaut von Abschnitt 9, dessen Zweck „kein Fehlalarm, wenn der Lauf
 *   lief" es ist.
 * - **Loeschung ueberfaellig:** Eine Datei hat `loeschenAb < heute − 1` und kein
 *   `dateiGeloeschtAm`, oder ein Entwurf liegt mehr als 31 Tage hinter dem
 *   Linkende (Frist + 14). Der eine Tag Luft deckt einen Lauf, der heute noch
 *   nicht dran war. Gilt fuer JEDE Nachforderung, auch erledigte und
 *   zurueckgezogene.
 */
export function laufWaechter(stand: WaechterStand, heute: Kalendertag): WaechterBefund | null {
  let erinnerungVom: Kalendertag | null = null;
  const frist = datumsTag(stand.frist);

  if (!stand.vorgangEingestellt && frist) {
    if (erinnerungFaellig(stand, tageSpaeter(heute, -1)) === "VORAB") {
      const fensterBeginn = tageSpaeter(frist, -ERINNERUNG_VORAB_TAGE);
      const spur = stand.links.some((l) => {
        const tag = zeitpunktTag(l.createdAt);
        const vomLauf = l.anlass === "ERINNERUNG_VORAB" || l.erstelltVonId === null;
        return vomLauf && !!tag && tag >= fensterBeginn;
      });
      if (!spur) erinnerungVom = fensterBeginn;
    }
  }

  let loeschungSeit: Kalendertag | null = null;
  const merke = (tag: Kalendertag) => {
    if (!loeschungSeit || tag < loeschungSeit) loeschungSeit = tag;
  };
  const gestern = tageSpaeter(heute, -1);
  const entwurfFaelligAb = frist ? entwurfLoeschenAb(frist) : null;
  for (const p of stand.positionen) {
    for (const d of p.dateien) {
      if (alsDatum(d.dateiGeloeschtAm)) continue;
      const ab = zeitpunktTag(d.loeschenAb);
      if (ab && ab < gestern) merke(ab);
      if (d.status === "ENTWURF" && entwurfFaelligAb && tageZwischen(entwurfFaelligAb, heute) > 1) {
        merke(entwurfFaelligAb);
      }
    }
  }

  if (!erinnerungVom && !loeschungSeit) return null;
  return { erinnerungVom, loeschungSeit };
}

/**
 * Der Hinweis auf der Karte (Abschnitt 9): „Der tägliche Lauf erreicht das
 * Portal vermutlich nicht (Erinnerung vom … nicht versendet / Löschung seit …
 * überfällig). Bitte die IT informieren."
 */
export function laufWaechterText(befund: WaechterBefund): string {
  const teile: string[] = [];
  if (befund.erinnerungVom) teile.push(`Erinnerung vom ${formatKalendertag(befund.erinnerungVom)} nicht versendet`);
  if (befund.loeschungSeit) teile.push(`Löschung seit ${formatKalendertag(befund.loeschungSeit)} überfällig`);
  return `Der tägliche Lauf erreicht das Portal vermutlich nicht (${teile.join(", ")}). Bitte die IT informieren.`;
}

// =============================================
// PDF-Merkmale (4.3 Nr. 9) — nur Hinweise fuer HR, nie ein Ablehnungsgrund
// =============================================

/** Positiv formuliert, nie „keine aktiven Inhalte": Komprimierte Objektstroeme findet die Suche nicht. */
export const PDF_MERKMAL_TEXTE: Readonly<Record<PdfMerkmal, string>> = {
  VERSCHLUESSELT: "kennwortgeschützt",
  AKTIVE_INHALTE: "aktive Inhalte gefunden",
};

/** Eigener Schluessel, nicht `in`: Das faende auch geerbte wie `toString`. */
function istPdfMerkmal(wert: string): wert is PdfMerkmal {
  return Object.prototype.hasOwnProperty.call(PDF_MERKMAL_TEXTE, wert);
}

/** Fuer `UnterlagenDatei.pdfHinweise`: „VERSCHLUESSELT,AKTIVE_INHALTE", ohne Merkmal `null`. */
export function pdfHinweiseSpeichern(merkmale: readonly PdfMerkmal[]): string | null {
  const bekannt = merkmale.filter(istPdfMerkmal);
  return bekannt.length > 0 ? Array.from(new Set(bekannt)).join(",") : null;
}

/** Zurueck aus der Spalte; Unbekanntes wird uebergangen. */
export function pdfHinweiseLesen(roh: string | null | undefined): PdfMerkmal[] {
  if (!roh) return [];
  const merkmale: PdfMerkmal[] = [];
  for (const teil of roh.split(",")) {
    const m = teil.trim();
    if (istPdfMerkmal(m) && !merkmale.includes(m)) merkmale.push(m);
  }
  return merkmale;
}

/** Die Anzeigetexte zu einer gespeicherten Spalte: „kennwortgeschützt", „aktive Inhalte gefunden". */
export function pdfHinweisTexte(roh: string | null | undefined): string[] {
  return pdfHinweiseLesen(roh).map((m) => PDF_MERKMAL_TEXTE[m]);
}

// =============================================
// Pille, Fortschritt, Stand je Nachweis
// =============================================

export interface UnterlagenZaehler {
  /** Alle Positionen ohne ENTFAELLT. */
  gesamt: number;
  angenommen: number;
  zuPruefen: number;
  /** Wartet auf die Person (ANGEFORDERT, ZURUECKGEWIESEN). */
  offen: number;
  entfaellt: number;
}

export function zaehlen(positionen: ReadonlyArray<{ status: string }>): UnterlagenZaehler {
  const z: UnterlagenZaehler = { gesamt: 0, angenommen: 0, zuPruefen: 0, offen: 0, entfaellt: 0 };
  for (const p of positionen) {
    if (p.status === "ENTFAELLT") {
      z.entfaellt += 1;
      continue;
    }
    z.gesamt += 1;
    if (p.status === "ANGENOMMEN") z.angenommen += 1;
    else if (istZuPruefen(p.status)) z.zuPruefen += 1;
    else if (wartetAufPerson(p.status)) z.offen += 1;
  }
  return z;
}

/** „1 von 3 angenommen · 1 zu prüfen · 1 offen" — Nullen hinter dem ersten Teil entfallen. */
export function fortschrittText(z: UnterlagenZaehler): string {
  const teile = [`${z.angenommen} von ${z.gesamt} angenommen`];
  if (z.zuPruefen > 0) teile.push(`${z.zuPruefen} zu prüfen`);
  if (z.offen > 0) teile.push(`${z.offen} offen`);
  if (z.entfaellt > 0) teile.push(`${z.entfaellt} ${z.entfaellt === 1 ? "entfällt" : "entfallen"}`);
  return teile.join(" · ");
}

export interface UnterlagenPille {
  text: string;
  farbe: UnterlagenFarbe;
}

/**
 * Die Pille der Karte und des Reiters „Dokumente" (P:1406, E-6): „n zu prüfen"
 * vor „Frist verstrichen" vor „x/y". „Frist verstrichen" nur, solange noch
 * etwas auf die Person wartet — ist nur die Pruefung durch HR offen, ist die
 * Person nicht saeumig. Eine zurueckgezogene Nachforderung zeigt nie einen
 * Stand (2.2); die Karte zeigt sie grau, der Reiter gar nicht.
 */
export function unterlagenPille(stand: {
  status: string;
  zaehler: UnterlagenZaehler;
  fristVerstrichen: boolean;
}): UnterlagenPille {
  if (stand.status === "ERLEDIGT") return { text: "Erledigt", farbe: "gruen" };
  if (stand.status === "ZURUECKGEZOGEN") return { text: "Zurückgezogen", farbe: "grau" };
  const z = stand.zaehler;
  if (z.zuPruefen > 0) return { text: `${z.zuPruefen} zu prüfen`, farbe: "gelb" };
  if (stand.fristVerstrichen && z.offen > 0) return { text: "Frist verstrichen", farbe: "rot" };
  return { text: `${z.angenommen}/${z.gesamt}`, farbe: "blau" };
}

/** Stand einer Katalogart fuer den Kasten „Offene Nachweise" (`nachweisStandText`). */
export interface TypStand {
  status: PositionStatus;
  /** Gehoert zur laufenden Nachforderung (sonst: ENTFAELLT einer erledigten). */
  laufend: boolean;
  nachforderungId: string;
  angefordertAm: Kalendertag | null;
  frist: Kalendertag | null;
  fristVerstrichen: boolean;
  entschiedenAm: Kalendertag | null;
}

/**
 * Der Zusatz einer Zeile im Kasten „Offene Nachweise" (P:1285): „angefordert am
 * 12.09.2026, Frist 26.09.2026", „eingegangen, bitte prüfen" usw. Der Kasten
 * schreibt „<Art> — <Zusatz>". `null`, wenn die Art in keiner Nachforderung
 * steht — dann bietet der Kasten „Unterlagen nachfordern…" an.
 */
export function nachweisStandText(
  typ: string,
  uebersicht: { typen: Readonly<Record<string, TypStand>> } | null | undefined,
): string | null {
  const stand = uebersicht?.typen[typ];
  if (!stand) return null;
  const frist = stand.frist ? formatKalendertag(stand.frist) : "";
  const verstrichen = stand.fristVerstrichen ? " (verstrichen)" : "";
  switch (stand.status) {
    case "ANGEFORDERT":
      return `angefordert am ${stand.angefordertAm ? formatKalendertag(stand.angefordertAm) : "—"}, Frist ${frist}${verstrichen}`;
    case "ZURUECKGEWIESEN":
      return `zurückgewiesen, erneut angefordert, Frist ${frist}${verstrichen}`;
    case "EINGEREICHT":
      return "eingegangen, bitte prüfen";
    case "ANGENOMMEN":
      return "angenommen";
    case "ENTFAELLT":
      return stand.entschiedenAm
        ? `entfällt laut Nachforderung (vermerkt am ${formatKalendertag(stand.entschiedenAm)})`
        : "entfällt laut Nachforderung";
  }
}

// =============================================
// Aktionen (EP-3, E-3, EP-16, 5.2) — nur, was der Server auch ausfuehrt
// =============================================

export interface NachforderungsAktionen {
  ergaenzen: boolean;
  fristAendern: boolean;
  erneutSenden: boolean;
  /** „Link erneut senden" waere moeglich, ist aber gerade gesperrt (`sperreBis`). Die Karte zeigt den Knopf grau. */
  erneutSendenGesperrt: boolean;
  zurueckziehen: boolean;
}

export interface PositionsAktionen {
  annehmen: boolean;
  zurueckweisen: boolean;
  entfaellt: boolean;
  annahmeZuruecknehmen: boolean;
}

export interface ErlaubteAktionen {
  nachforderung: NachforderungsAktionen;
  /** Je Positions-Id. */
  positionen: Record<string, PositionsAktionen>;
  /** ISO, solange „Link erneut senden" gesperrt ist. */
  sperreBis: string | null;
}

const KEINE_NACHFORDERUNGS_AKTIONEN: NachforderungsAktionen = {
  ergaenzen: false,
  fristAendern: false,
  erneutSenden: false,
  erneutSendenGesperrt: false,
  zurueckziehen: false,
};

const KEINE_POSITIONS_AKTIONEN: PositionsAktionen = {
  annehmen: false,
  zurueckweisen: false,
  entfaellt: false,
  annahmeZuruecknehmen: false,
};

/** Ende der Sperrzeit von „Link erneut senden": letzte zugestellte ERNEUT-Mail + 10 Minuten. */
export function erneutSendenSperreBis(
  links: ReadonlyArray<{ anlass: string; mailStatus: string; gesendetAm: Date | string | null }>,
  jetzt: Date,
): Date | null {
  let spaetester: Date | null = null;
  for (const l of links) {
    if (l.anlass !== "ERNEUT" || l.mailStatus !== "SENT") continue;
    const d = alsDatum(l.gesendetAm);
    if (d && (!spaetester || d.getTime() > spaetester.getTime())) spaetester = d;
  }
  if (!spaetester) return null;
  const bis = new Date(spaetester.getTime() + SPERRZEIT_MINUTEN * MS_PRO_MINUTE);
  return bis.getTime() > jetzt.getTime() ? bis : null;
}

/**
 * Welche Knoepfe die Karte anbietet — dieselben Regeln wie die Uebergaenge,
 * damit keine Aktion angeboten wird, die der Server mit 409 ablehnt.
 *
 * - Ohne Bearbeitungsrecht (`darfAktionen`) nichts.
 * - Ergaenzen, Frist aendern, erneut senden: nur LAUFEND und nie bei einem
 *   eingestellten Vorgang (EP-3). Ergaenzen nur, solange noch Platz ist
 *   (30 Positionen) oder eine entfallene KATALOGART wieder angefordert werden
 *   kann — eine entfallene freie Zeile laesst sich nicht reaktivieren, jede
 *   Eingabe zaehlte in `eingabePruefen` als neu (409).
 *   Erneut senden nur, solange etwas auf die Person wartet und das Linkende
 *   nicht ueberschritten ist (EP-16) — sonst „Bitte zuerst die Frist ändern".
 * - Zurueckziehen: jede laufende, auch bei eingestelltem Vorgang.
 * - Positionen nach `positionUebergang`; die Ruecknahme auch aus ERLEDIGT,
 *   solange keine andere Nachforderung laeuft und die Annahme hoechstens
 *   30 Tage zurueckliegt (E-3). Ob das `Document` noch da ist, weiss nur der
 *   Server (409).
 */
export function erlaubteAktionen(opts: {
  nachforderung: {
    status: string;
    frist: Date | string;
    positionen: ReadonlyArray<{ id: string; typ: string | null; status: string; entschiedenAm: Date | string | null }>;
    links: ReadonlyArray<{ anlass: string; mailStatus: string; gesendetAm: Date | string | null }>;
  };
  vorgangEingestellt: boolean;
  darfAktionen: boolean;
  /** Laeuft fuer den Vorgang eine ANDERE Nachforderung (nur fuer ERLEDIGT von Belang)? */
  andereLaufend: boolean;
  jetzt: Date;
}): ErlaubteAktionen {
  const n = opts.nachforderung;
  const positionen: Record<string, PositionsAktionen> = {};
  if (!opts.darfAktionen) {
    for (const p of n.positionen) positionen[p.id] = { ...KEINE_POSITIONS_AKTIONEN };
    return { nachforderung: { ...KEINE_NACHFORDERUNGS_AKTIONEN }, positionen, sperreBis: null };
  }

  const heute = heuteInBerlin(opts.jetzt);
  const kopf = { status: n.status, vorgangEingestellt: opts.vorgangEingestellt };
  const wartet = n.positionen.some((p) => wartetAufPerson(p.status));
  const ende = nachforderungLinkende(n.frist);
  const linkNochNutzbar = !!ende && heute <= ende;
  const platz =
    n.positionen.length < MAX_POSITIONEN || n.positionen.some((p) => p.status === "ENTFAELLT" && p.typ !== null);

  const erneutMoeglich =
    nachforderungUebergang("ERNEUT_SENDEN", kopf).erlaubt && wartet && linkNochNutzbar;
  const sperre = erneutMoeglich ? erneutSendenSperreBis(n.links, opts.jetzt) : null;

  const nachforderung: NachforderungsAktionen = {
    ergaenzen: nachforderungUebergang("ERGAENZEN", kopf).erlaubt && platz,
    fristAendern: nachforderungUebergang("FRIST_AENDERN", kopf).erlaubt,
    erneutSenden: erneutMoeglich && !sperre,
    erneutSendenGesperrt: erneutMoeglich && !!sperre,
    zurueckziehen: nachforderungUebergang("ZURUECKZIEHEN", kopf).erlaubt,
  };

  for (const p of n.positionen) {
    const kontext: PositionsKontext = {
      nachforderungStatus: n.status,
      vorgangEingestellt: opts.vorgangEingestellt,
      heute,
      entschiedenAm: p.entschiedenAm,
      andereLaufend: opts.andereLaufend,
    };
    positionen[p.id] = {
      annehmen: positionUebergang("ANNEHMEN", p.status, kontext).erlaubt,
      zurueckweisen: positionUebergang("ZURUECKWEISEN", p.status, kontext).erlaubt,
      entfaellt: positionUebergang("ENTFAELLT", p.status, kontext).erlaubt,
      annahmeZuruecknehmen: positionUebergang("ANNAHME_ZURUECKNEHMEN", p.status, kontext).erlaubt,
    };
  }

  return { nachforderung, positionen, sperreBis: sperre ? sperre.toISOString() : null };
}

// =============================================
// Uebersicht fuer GET /api/onboarding/[id] (Karte, Kasten, Reiter, Mini-Karte)
// =============================================

/**
 * Eingabe von `uebersichtBauen` — eigene, enge Schnittstelle ohne Prisma-Typen
 * (Muster `abteilungsZeilenBauen`). Die Felder heissen wie die Spalten; Datumswerte
 * duerfen `Date` (Prisma) oder ISO-Text (JSON) sein. Hier steht NUR, was Karte,
 * Aktionen und Lauf-Waechter lesen — der Server selektiert nichts ohne Zweck,
 * etwa keine Empfaengeradresse je Link. Der Server reicht ALLE Dateien herein,
 * auch Entwuerfe — die Uebersicht zeigt HR nur uebermittelte, der Lauf-Waechter
 * braucht die uebrigen.
 */
export interface DateiEingabe {
  id: string;
  status: string;
  anzeigeName: string;
  mimeType: string;
  groesse: number;
  pdfHinweise: string | null;
  einreichungNr: number | null;
  uebermitteltAm: Date | string | null;
  entschiedenAm: Date | string | null;
  speicherPfad: string | null;
  uebernahmeZiel: string | null;
  uebernommenId: string | null;
  uebernommenAm: Date | string | null;
  loeschenAb: Date | string | null;
  dateiGeloeschtAm: Date | string | null;
}

export interface PositionEingabe {
  id: string;
  reihenfolge: number;
  typ: string | null;
  bezeichnung: string;
  hinweis: string | null;
  originalErforderlich: boolean;
  sensibel: boolean;
  fristpflichtig: boolean;
  status: string;
  einreichungen: number;
  gueltigBisAngabe: Date | string | null;
  angefordertAm: Date | string;
  uebermitteltAm: Date | string | null;
  begruendung: string | null;
  entfaelltNotiz: string | null;
  entschiedenAm: Date | string | null;
  /** Name der HR-Kraft, die zuletzt entschieden hat (Server: `entschiedenVon`). */
  entschiedenVonName: string | null;
  dateien: ReadonlyArray<DateiEingabe>;
}

/** Eine Mail an die Person (Mailverlauf, Sperrzeit, Lauf-Waechter). */
export interface LinkEingabe {
  anlass: string;
  mailStatus: string;
  /** Roher Grund des Mailers, gekuerzt; lesbar macht ihn `versandDetailLesbar`. */
  mailDetail: string | null;
  gesendetAm: Date | string | null;
  nachholVersuche: number;
  /** `null` = vom taeglichen Lauf angelegt (Spur fuer den Lauf-Waechter). */
  erstelltVonId: string | null;
  createdAt: Date | string;
}

export interface NachforderungEingabe {
  id: string;
  modul: string;
  status: string;
  empfaenger: string;
  empfaengerAbweichend: boolean;
  frist: Date | string;
  nachricht: string | null;
  angefordertAm: Date | string;
  /** Name der anfordernden HR-Kraft (Server: `angefordertVon`), null bei geloeschtem Konto. */
  angefordertVonName: string | null;
  erinnertFuerFrist: Date | string | null;
  erinnertStufe: string | null;
  erledigtAm: Date | string | null;
  zurueckgezogenAm: Date | string | null;
  /**
   * Die letzte HR-Meldung („vollständig", „Frist verstrichen") ging an niemanden:
   * weder die anfordernde HR-Kraft noch das HR-Postfach (8.1, SKIPPED mit Grund).
   * Die Quelle legt der Dienst fest; ohne Angabe kein Hinweis.
   */
  hrMeldungOhneEmpfaenger?: boolean;
  positionen: ReadonlyArray<PositionEingabe>;
  links: ReadonlyArray<LinkEingabe>;
}

/** Eine Datei auf der Karte — nur uebermittelte, nie Entwuerfe (2.3). */
export interface UnterlagenDateiZeile {
  id: string;
  /** Anzeigename; `null` ohne Bearbeitungsrecht (SI-K4). */
  name: string | null;
  groesseText: string;
  mimeType: string;
  status: DateiStatus;
  einreichungNr: number | null;
  uebermitteltAm: string | null;
  /** „Öffnen" (neuer Tab, `inline`): nur mit Bearbeitungsrecht und solange die Datei bei der Nachforderung liegt. */
  url: string | null;
  /** Uebernommen: das `Document` im Reiter (nur mit Bearbeitungsrecht). */
  dokumentId: string | null;
  /** PDF-Hinweise: „kennwortgeschützt", „aktive Inhalte gefunden". */
  hinweise: string[];
  /** Zurueckgewiesen oder verworfen: durchgestrichen anzeigen. */
  durchgestrichen: boolean;
  /** „zurückgewiesen am 16.09.2026", „verworfen am …", „übernommen am …", „Datei gelöscht am …". */
  zusatz: string | null;
}

export interface UnterlagenPositionZeile {
  id: string;
  typ: string | null;
  bezeichnung: string;
  hinweis: string | null;
  originalErforderlich: boolean;
  sensibel: boolean;
  fristpflichtig: boolean;
  status: PositionStatus;
  pille: UnterlagenPille;
  einreichungen: number;
  /** „2. Einreichung" — beim Zurueckgewiesenen die erwartete, sonst ab der zweiten. */
  einreichungText: string | null;
  gueltigBisAngabe: Kalendertag | null;
  /** „Gültig bis (Angabe der Person): 31.03.2028" — nur bei Fristpflicht und uebermittelter Unterlage. */
  gueltigBisAngabeText: string | null;
  /** „Ihre Begründung: …" (zurueckgewiesen) bzw. „Zuletzt zurückgewiesen: …" (erneut eingereicht). */
  begruendungText: string | null;
  /** „Angenommen am … von … · in die Dokumente des Vorgangs übernommen" bzw. „Entfällt seit …". */
  detail: string | null;
  /** Interne Notiz zu „Entfällt". */
  entfaelltNotiz: string | null;
  /** „seit 12.09.2026 ungeprüft" — ab 14 Tagen (2.2). */
  ungeprueftHinweis: string | null;
  dateien: UnterlagenDateiZeile[];
  aktionen: PositionsAktionen;
}

export interface MailVerlaufEintrag {
  anlass: string;
  /** „Aufforderung 12.09." */
  text: string;
  status: string;
  /** FAILED rot, SKIPPED gelb, sonst null. */
  farbe: UnterlagenFarbe | null;
  hinweis: string | null;
}

export interface NachforderungAnsicht {
  id: string;
  modul: string;
  status: NachforderungStatus;
  pille: UnterlagenPille;
  /** „Angefordert am 12.09.2026 von Erika Muster · an anna.beispiel@example.org" */
  kopfZeile: string;
  empfaenger: string;
  empfaengerAbweichend: boolean;
  frist: Kalendertag;
  fristLang: string;
  /**
   * LAUFEND: „Frist: Freitag, 26.09.2026 · noch 5 Tage". Erledigt oder
   * zurueckgezogen die Ersatzzeile „Frist war Freitag, 26.09.2026" — ohne
   * Restlaufzeit, die fuer eine abgeschlossene Nachforderung in die Irre fuehrte.
   */
  fristZeile: string;
  /** „Frist verstrichen" nach 2.1: LAUFEND, heute > Frist und noch etwas wartet auf die Person. */
  fristVerstrichen: boolean;
  /** Frist + 14. */
  linkende: Kalendertag;
  linkAbgelaufen: boolean;
  nachricht: string | null;
  zaehler: UnterlagenZaehler;
  /**
   * Balken und „1 von 3 angenommen · 1 zu prüfen · 1 offen". `anteil` ist der
   * gruene Teil (angenommen), `anteilZuPruefen` der gelbe daneben (P:1388) —
   * beide 0 bis 1, beide bezogen auf `zaehler.gesamt`.
   */
  fortschritt: { anteil: number; anteilZuPruefen: number; text: string };
  positionen: UnterlagenPositionZeile[];
  /** „E-Mails an die Person: Aufforderung 12.09. · Zurückweisung 16.09." (leer ohne Mail). */
  mailVerlaufText: string;
  mailVerlauf: MailVerlaufEintrag[];
  /** Nach drei gescheiterten Nachholversuchen: „nicht zustellbar – Adresse prüfen". */
  mailHinweis: string | null;
  /** „HR-Meldung nicht zugestellt (kein Empfänger)" (8.1), sonst null. */
  hrMeldungHinweis: string | null;
  /** „Erledigt am 20.09.2026" bzw. „Zurückgezogen am …". */
  abschlussText: string | null;
  /**
   * LAUFEND bei eingestelltem Vorgang (EP-3), nur mit Bearbeitungsrecht: warum
   * Ergaenzen, Frist aendern, erneut senden und Zurueckweisen fehlen und wie
   * lange der Rest noch geht (`MELDUNGEN.HR_VORGANG_EINGESTELLT`, derselbe Text
   * wie die 409 dieser Aktionen). Sonst null.
   */
  eingestelltHinweis: string | null;
  aktionen: NachforderungsAktionen;
  sperreBis: string | null;
  /** Fuer die Dialoge (EP-1, EP-5). */
  dialog: {
    fristGrenzen: FristGrenzen;
    /** Ergaenzen nach Fristablauf: neue Frist Pflicht. */
    ergaenzenFristPflicht: boolean;
    zurueckweisenFrist: { vorschlag: Kalendertag; pflicht: boolean };
  };
}

/**
 * Eine waehlbare Katalogart im Dialog „Unterlagen nachfordern…" (10.1) — der
 * Modul-Baustein liefert sie (`auswahl(v)`), diese Datei legt nur die Form fest.
 */
export interface AuswahlEintrag {
  /** Katalogschluessel (Onboarding: DocumentType, nie eine Sammelart). */
  typ: string;
  label: string;
  /** „Vorgeschlagen (offene Nachweise)", vorangekreuzt — sonst unter „Weitere". */
  vorgeschlagen: boolean;
  sensibel: boolean;
  /** Darf angefordert werden (Onboarding: `sensibelAnforderbar`); sonst ausgegraut mit `grund`. */
  erlaubt: boolean;
  grund: string | null;
  /** Schriftform: Kennzeichen „Original" (E-4). */
  originalErforderlich: boolean;
  fristpflichtig: boolean;
  /** Vorschlag fuer den Hinweis an die Person (Onboarding: `NACHFORDERUNG_HINWEISE`). */
  hinweis: string | null;
}

/** Ein Adressvorschlag im Dialog: zuerst die Adresse aus dem Vorgang. */
export interface EmpfaengerVorschlag {
  adresse: string;
  /** VORGANG: immer erlaubt · PERSONALAKTE: nur ein Vorschlag (Abschnitt 17, KO-K10). */
  quelle: "VORGANG" | "PERSONALAKTE";
}

/** Was die Dialoge „Unterlagen nachfordern…"/„Ergänzen…" brauchen — nur mit Bearbeitungsrecht. */
export interface UnterlagenDialogDaten {
  auswahl: AuswahlEintrag[];
  empfaenger: {
    /** Adresse im Vorgang — sie ist immer erlaubt (`empfaengerFreigegeben`). */
    vorgang: string;
    vorschlaege: EmpfaengerVorschlag[];
    /** `SmtpConfig.allowedRecipientDomains` — nur zur Anzeige, die Schranke ist der Server. */
    erlaubteDomains: string[];
  };
}

/** Herkunft eines uebernommenen Dokuments fuer die Dokumentenliste (10.2). */
export interface DokumentHerkunft {
  nachforderungId: string;
  /** „aus Nachforderung angenommen am 16.09.2026" */
  text: string;
  /** PDF-Hinweise der uebernommenen Datei. */
  hinweise: string[];
}

/**
 * Die Uebersicht in `GET /api/onboarding/[id]` (Feld `unterlagen`). Karte,
 * Kasten „Offene Nachweise", Warnbalken, Reiter-Pille und Mini-Karte lesen nur
 * hieraus (Kasten und Warnbalken ueber `offeneNachweiseAktion` bzw.
 * `warnbalkenAktion`) — die Oberflaeche rechnet nichts selbst (10.1).
 */
export interface UnterlagenUebersicht {
  modul: string;
  darfAktionen: boolean;
  /**
   * Basis der HR-Routen des Moduls (Modul-Baustein `apiBasis`, Onboarding
   * `/api/onboarding/<id>/unterlagen`) — Karte und Dialog bauen daraus ihre
   * Aufrufe, statt die Routen je Modul selbst zu kennen. Nur mit
   * Bearbeitungsrecht; ohne gibt es nichts aufzurufen.
   */
  apiBasis: string | null;
  /** Knopf „Unterlagen nachfordern…" — nur ohne laufende Nachforderung. */
  anfordern: {
    moeglich: boolean;
    /** Grund im Klartext, warum nicht (vor der Abgabe, Vorgang eingestellt). */
    grund: string | null;
  };
  laufend: NachforderungAnsicht | null;
  /** Eingeklappt: die zuletzt erledigte, solange eine Ruecknahme moeglich ist (nur ohne laufende). */
  zuletztErledigt: NachforderungAnsicht | null;
  /** Reiter „Dokumente" (nur mit laufender Nachforderung). */
  pille: UnterlagenPille | null;
  /** Mini-Karte „Dokumente": „1 von 3 angenommen · 1 zu prüfen · Frist 26.09.2026". */
  kurzstand: string | null;
  /** Je Katalogart, Quelle von `nachweisStandText`. */
  typen: Record<string, TypStand>;
  /** Je `Document.id` einer uebernommenen Datei. */
  dokumentHerkunft: Record<string, DokumentHerkunft>;
  /** Lauf-Waechter (Abschnitt 9), sonst null. */
  laufHinweis: string | null;
  /** Daten der Dialoge aus dem Modul-Baustein; `null` ohne Bearbeitungsrecht oder ohne Angabe. */
  dialog: UnterlagenDialogDaten | null;
}

// =============================================
// Der Weg zur Nachforderung ausserhalb der Karte (Kasten, Warnbalken; P:1285)
// =============================================

/** Womit ein Knopf den Dialog „Unterlagen nachfordern…"/„Unterlagen ergänzen…" oeffnet. */
export interface NachforderungDialogAnfrage {
  modus: "neu" | "ergaenzen";
  /**
   * Katalogarten, die der Dialog ZUSAETZLICH zu seinen Vorschlaegen ankreuzt;
   * `null` = nur die Vorschlaege. Vorschlaege sind die offenen Nachweise
   * (`dialog.auswahl[].vorgeschlagen`, 10.1) — beim Ergaenzen nur die, die noch
   * nicht in der laufenden Nachforderung stehen. Eine dort entfallene Art kreuzt
   * der Dialog nur ueber diese Liste an („wieder anfordern" auf Zuruf).
   */
  vorauswahl: string[] | null;
}

/**
 * Was der Kasten „Offene Nachweise" bzw. der Warnbalken zur Nachforderung
 * anbietet. Die Beschriftungen setzt die Oberflaeche; ob etwas geht, sagt nur
 * die Uebersicht des Servers (`anfordern`, `laufend.aktionen`, `typen`) — kein
 * Knopf, den die Route mit 409 ablehnte, und kein Satz, der zu einer Aktion
 * auffordert, die es fuer diesen Vorgang oder diese Rolle nicht gibt.
 */
export interface NachweisAktion {
  /** Schreibender Knopf: oeffnet den Dialog. Nur mit Recht und wenn der Server die Aktion ausfuehrt. */
  anfrage: NachforderungDialogAnfrage | null;
  /** „Zur Nachforderung": Es laeuft eine — auch ohne Recht, das ist nur ein Sprung zur Karte. */
  zurNachforderung: boolean;
  /**
   * Laesst sich die Aufforderung befolgen („Mit „Unterlagen nachfordern“
   * schicken Sie …", P:1285)? Mit Recht, und entweder laesst sich anfordern
   * bzw. ergaenzen, oder eine Nachforderung laeuft bei nicht eingestelltem
   * Vorgang (EP-3). Sonst steht der Satz nicht da.
   */
  aufforderung: boolean;
  /**
   * Mit Recht, ohne laufende, aber nicht moeglich: der Grund des Servers im
   * Klartext (`anfordern.grund`, etwa ein eingestellter Vorgang). Sonst null.
   */
  grund: string | null;
}

const KEINE_NACHWEIS_AKTION: NachweisAktion = { anfrage: null, zurNachforderung: false, aufforderung: false, grund: null };

/** Ohne laufende Nachforderung: Anfordern mit `arten` vorangekreuzt, sonst der Grund. */
function neueNachforderungAktion(arten: readonly string[], u: UnterlagenUebersicht): NachweisAktion {
  const anfrage: NachforderungDialogAnfrage | null =
    u.darfAktionen && u.anfordern.moeglich ? { modus: "neu", vorauswahl: [...arten] } : null;
  return {
    anfrage,
    zurNachforderung: false,
    aufforderung: anfrage !== null,
    grund: u.darfAktionen && !u.anfordern.moeglich ? u.anfordern.grund : null,
  };
}

/**
 * Die Knoepfe des Kastens „Offene Nachweise" (P:1285, Feinplanung 10.2 und 13).
 *
 * - Ohne laufende Nachforderung: „Unterlagen nachfordern…" mit GENAU den
 *   offenen Arten — dieselben, die der Dialog als Vorschlaege ankreuzt, auch
 *   eine, die in einer frueheren Nachforderung als entfallen vermerkt ist: Sie
 *   ist weiter Pflicht und offen, der Kasten nennt ihren Stand, und HR waehlt
 *   sie im Dialog ab, wenn es dabei bleibt.
 * - Mit laufender: „Zur Nachforderung"; stehen offene Arten noch NICHT in ihr,
 *   dazu „Ergänzen…" mit genau diesen (die Vorschlaege des Dialogs beim
 *   Ergaenzen). Eine in der laufenden entfallene Art kreuzt der Knopf nicht an:
 *   Diese Entscheidung hat HR gerade erst getroffen; wieder anfordern laesst
 *   sie sich im Dialog.
 * - Ohne offene Pflichtunterlage (nur die Nachfrage nach dem Ablaufdatum) hat
 *   der Kasten mit der Nachforderung nichts zu tun.
 */
export function offeneNachweiseAktion(
  offen: readonly string[],
  u: UnterlagenUebersicht | null | undefined,
): NachweisAktion {
  if (!u || offen.length === 0) return KEINE_NACHWEIS_AKTION;
  const { laufend, typen } = u;
  if (!laufend) return neueNachforderungAktion(offen, u);

  const fehlend = offen.filter((typ) => !typen[typ]?.laufend);
  return {
    anfrage:
      u.darfAktionen && laufend.aktionen.ergaenzen && fehlend.length > 0
        ? { modus: "ergaenzen", vorauswahl: fehlend }
        : null,
    zurNachforderung: true,
    // Frist aendern geht genau dann, wenn die laufende bei nicht eingestelltem
    // Vorgang mit Recht bearbeitet werden kann.
    aufforderung: u.darfAktionen && laufend.aktionen.fristAendern,
    grund: null,
  };
}

/**
 * Die Knoepfe des Warnbalkens (abgelaufener bzw. bald ablaufender Nachweis):
 * „Verlängerten Nachweis anfordern…" mit `arten` vorangekreuzt.
 *
 * - Ohne laufende Nachforderung: neu. Der Dialog kreuzt dazu seine Vorschlaege
 *   an, die offenen Nachweise (10.1) — gewollt: Die Mail an die Person nennt
 *   dann alles, was fehlt; HR kann abwaehlen.
 * - Mit laufender: „Zur Nachforderung"; stehen die Arten dort noch nicht oder
 *   nur als entfallen, dazu derselbe Knopf als Ergaenzung. Anders als im
 *   Kasten kreuzt er eine entfallene Art an: Der abgelaufene Nachweis ist der
 *   ausdrueckliche Anlass, sie wieder anzufordern. Eine dort schon angeforderte,
 *   eingegangene oder angenommene Art fordert er nicht erneut an; den Weg dazu
 *   nennt der Dialog.
 */
export function warnbalkenAktion(
  arten: readonly string[],
  u: UnterlagenUebersicht | null | undefined,
): NachweisAktion {
  if (!u || arten.length === 0) return KEINE_NACHWEIS_AKTION;
  const { laufend, typen } = u;
  if (!laufend) return neueNachforderungAktion(arten, u);

  const fehlend = arten.filter((typ) => {
    const stand = typen[typ];
    return !stand || !stand.laufend || stand.status === "ENTFAELLT";
  });
  return {
    anfrage:
      u.darfAktionen && laufend.aktionen.ergaenzen && fehlend.length > 0
        ? { modus: "ergaenzen", vorauswahl: fehlend }
        : null,
    zurNachforderung: true,
    aufforderung: u.darfAktionen && laufend.aktionen.fristAendern,
    grund: null,
  };
}

export const ANLASS_LABELS: Readonly<Record<LinkAnlass, string>> = {
  ANFORDERUNG: "Aufforderung",
  ERGAENZUNG: "Ergänzung",
  ERNEUT: "Link erneut gesendet",
  FRISTAENDERUNG: "Neue Frist",
  ZURUECKWEISUNG: "Zurückweisung",
  ERINNERUNG_VORAB: "Erinnerung",
  ERINNERUNG_FRISTTAG: "Erinnerung am Fristtag",
};

const POSITION_PILLEN: Readonly<Record<PositionStatus, UnterlagenPille>> = {
  ANGEFORDERT: { text: "Offen", farbe: "grau" },
  EINGEREICHT: { text: "Zu prüfen", farbe: "gelb" },
  ANGENOMMEN: { text: "Angenommen", farbe: "gruen" },
  ZURUECKGEWIESEN: { text: "Zurückgewiesen, erneut angefordert", farbe: "rot" },
  ENTFAELLT: { text: "Entfällt", farbe: "grau" },
};

function dateiZeile(d: DateiEingabe, darfAktionen: boolean, dateiUrl: (id: string) => string): UnterlagenDateiZeile {
  const status: DateiStatus = istDateiStatus(d.status) ? d.status : "EINGEREICHT";
  const geloescht = !!alsDatum(d.dateiGeloeschtAm);
  const liegtBeiNachforderung = !!d.speicherPfad && !geloescht;
  let zusatz: string | null = null;
  if (status === "ZURUECKGEWIESEN") zusatz = `zurückgewiesen am ${datumText(d.entschiedenAm)}`;
  else if (status === "VERWORFEN") zusatz = `verworfen am ${datumText(d.entschiedenAm)}`;
  else if (status === "ANGENOMMEN") zusatz = `übernommen am ${datumText(d.uebernommenAm ?? d.entschiedenAm)}`;
  if (geloescht) zusatz = `${zusatz ? `${zusatz} · ` : ""}Datei gelöscht am ${datumText(d.dateiGeloeschtAm)}`;

  return {
    id: d.id,
    name: darfAktionen ? d.anzeigeName : null,
    groesseText: formatBytes(d.groesse),
    mimeType: d.mimeType,
    status,
    einreichungNr: d.einreichungNr,
    uebermitteltAm: iso(d.uebermitteltAm),
    url: darfAktionen && liegtBeiNachforderung ? dateiUrl(d.id) : null,
    dokumentId: darfAktionen && d.uebernahmeZiel === "DOCUMENT" ? d.uebernommenId : null,
    hinweise: pdfHinweisTexte(d.pdfHinweise),
    durchgestrichen: status === "ZURUECKGEWIESEN" || status === "VERWORFEN",
    zusatz,
  };
}

function positionZeile(
  p: PositionEingabe,
  aktionen: PositionsAktionen,
  ctx: { heute: Kalendertag; darfAktionen: boolean; dateiUrl: (id: string) => string },
): UnterlagenPositionZeile {
  const status: PositionStatus = istPositionStatus(p.status) ? p.status : "ANGEFORDERT";

  // HR sieht nur Dateien mit `uebermitteltAm` (2.3) — nie Entwuerfe, auch
  // nicht nach Zurueckziehen oder „Entfällt". Aktuelle vor durchgestrichenen,
  // innerhalb in der Reihenfolge der Uebermittlung.
  const dateien = p.dateien
    .filter((d) => !!alsDatum(d.uebermitteltAm) && d.status !== "ENTWURF")
    .map((d) => dateiZeile(d, ctx.darfAktionen, ctx.dateiUrl))
    .sort((a, b) => {
      if (a.durchgestrichen !== b.durchgestrichen) return a.durchgestrichen ? 1 : -1;
      return (a.uebermitteltAm ?? "").localeCompare(b.uebermitteltAm ?? "");
    });

  let einreichungText: string | null = null;
  if (status === "ZURUECKGEWIESEN") einreichungText = `${p.einreichungen + 1}. Einreichung`;
  else if (p.einreichungen >= 2 && status !== "ENTFAELLT") einreichungText = `${p.einreichungen}. Einreichung`;

  let begruendungText: string | null = null;
  const begruendung = p.begruendung?.trim() || null;
  if (begruendung && status === "ZURUECKGEWIESEN") begruendungText = `Ihre Begründung: ${begruendung}`;
  else if (begruendung && status === "EINGEREICHT") begruendungText = `Zuletzt zurückgewiesen: ${begruendung}`;

  let detail: string | null = null;
  const von = p.entschiedenVonName?.trim() ? ` von ${p.entschiedenVonName.trim()}` : "";
  if (status === "ANGENOMMEN") {
    detail = `Angenommen am ${datumText(p.entschiedenAm)}${von} · in die Dokumente des Vorgangs übernommen`;
  } else if (status === "ENTFAELLT") {
    detail = `Entfällt seit ${datumText(p.entschiedenAm)}${von}`;
  }

  const angabe = datumsTag(p.gueltigBisAngabe);
  const uebermittelt = !!alsDatum(p.uebermitteltAm);
  const gueltigBisAngabeText =
    p.fristpflichtig && uebermittelt
      ? `Gültig bis (Angabe der Person): ${angabe ? formatKalendertag(angabe) : "keine Angabe"}`
      : null;

  let ungeprueftHinweis: string | null = null;
  const seit = zeitpunktTag(p.uebermitteltAm);
  if (status === "EINGEREICHT" && seit && tageZwischen(seit, ctx.heute) >= UNGEPRUEFT_HINWEIS_TAGE) {
    ungeprueftHinweis = `seit ${formatKalendertag(seit)} ungeprüft`;
  }

  return {
    id: p.id,
    typ: p.typ,
    bezeichnung: p.bezeichnung,
    hinweis: p.hinweis,
    originalErforderlich: p.originalErforderlich,
    sensibel: p.sensibel,
    fristpflichtig: p.fristpflichtig,
    status,
    pille: POSITION_PILLEN[status],
    einreichungen: p.einreichungen,
    einreichungText,
    gueltigBisAngabe: angabe,
    gueltigBisAngabeText,
    begruendungText,
    detail,
    entfaelltNotiz: status === "ENTFAELLT" ? p.entfaelltNotiz?.trim() || null : null,
    ungeprueftHinweis,
    dateien,
    aktionen,
  };
}

function mailVerlaufBauen(links: ReadonlyArray<LinkEingabe>): {
  eintraege: MailVerlaufEintrag[];
  text: string;
  hinweis: string | null;
} {
  const sortiert = [...links].sort(
    (a, b) => (alsDatum(a.createdAt)?.getTime() ?? 0) - (alsDatum(b.createdAt)?.getTime() ?? 0),
  );
  const eintraege = sortiert.map((l): MailVerlaufEintrag => {
    const label = istLinkAnlass(l.anlass) ? ANLASS_LABELS[l.anlass] : l.anlass;
    const datum = datumKurz(l.gesendetAm ?? l.createdAt);
    let zusatz = "";
    let farbe: UnterlagenFarbe | null = null;
    let hinweis: string | null = null;
    if (l.mailStatus === "FAILED") {
      zusatz = " (nicht zugestellt)";
      farbe = "rot";
      hinweis = versandDetailLesbar(l.mailDetail) || null;
    } else if (l.mailStatus === "SKIPPED") {
      zusatz = " (nicht versendet)";
      farbe = "gelb";
      hinweis = versandDetailLesbar(l.mailDetail) || null;
    } else if (l.mailStatus === "AUSSTEHEND") {
      zusatz = " (wird gesendet)";
    }
    return { anlass: l.anlass, text: `${label} ${datum}${zusatz}`, status: l.mailStatus, farbe, hinweis };
  });

  const letzte = sortiert[sortiert.length - 1];
  const hinweis =
    letzte && letzte.mailStatus === "FAILED" && letzte.nachholVersuche >= NACHHOL_MAX_VERSUCHE
      ? MELDUNGEN.NICHT_ZUSTELLBAR
      : null;

  return {
    eintraege,
    text: eintraege.length > 0 ? `E-Mails an die Person: ${eintraege.map((e) => e.text).join(" · ")}` : "",
    hinweis,
  };
}

function nachforderungAnsichtBauen(
  n: NachforderungEingabe,
  ctx: {
    heute: Kalendertag;
    jetzt: Date;
    vorgangEingestellt: boolean;
    darfAktionen: boolean;
    andereLaufend: boolean;
    dateiUrl: (id: string) => string;
  },
): NachforderungAnsicht {
  const status: NachforderungStatus = istNachforderungStatus(n.status) ? n.status : "LAUFEND";
  const frist = datumsTag(n.frist) ?? ctx.heute;
  const ende = linkGueltigBisFuer(frist);
  const z = zaehlen(n.positionen);
  // Der abgeleitete Zustand aus 2.1: LAUFEND, heute > Frist UND es wartet noch
  // etwas auf die Person. Ist nur noch die Pruefung durch HR offen, ist die
  // Person nicht saeumig.
  const fristVerstrichen = status === "LAUFEND" && ctx.heute > frist && z.offen > 0;

  const erlaubt = erlaubteAktionen({
    nachforderung: n,
    vorgangEingestellt: ctx.vorgangEingestellt,
    darfAktionen: ctx.darfAktionen,
    andereLaufend: ctx.andereLaufend,
    jetzt: ctx.jetzt,
  });

  const positionen = [...n.positionen]
    .sort((a, b) => a.reihenfolge - b.reihenfolge)
    .map((p) =>
      positionZeile(p, erlaubt.positionen[p.id] ?? { ...KEINE_POSITIONS_AKTIONEN }, {
        heute: ctx.heute,
        darfAktionen: ctx.darfAktionen,
        dateiUrl: ctx.dateiUrl,
      }),
    );

  const von = n.angefordertVonName?.trim() ? ` von ${n.angefordertVonName.trim()}` : "";
  const mails = mailVerlaufBauen(n.links);

  let abschlussText: string | null = null;
  if (status === "ERLEDIGT") abschlussText = `Erledigt am ${datumText(n.erledigtAm)}`;
  else if (status === "ZURUECKGEZOGEN") abschlussText = `Zurückgezogen am ${datumText(n.zurueckgezogenAm)}`;

  // Die Restlaufzeit gilt nur fuer die laufende; eine abgeschlossene nennt nur
  // noch, welche Frist sie hatte.
  const fristZeile =
    status === "LAUFEND" ? `Frist: ${fristText(frist, ctx.heute)}` : `Frist war ${formatKalendertagLang(frist)}`;

  return {
    id: n.id,
    modul: n.modul,
    status,
    pille: unterlagenPille({ status, zaehler: z, fristVerstrichen }),
    kopfZeile: `Angefordert am ${datumText(n.angefordertAm)}${von} · an ${n.empfaenger}`,
    empfaenger: n.empfaenger,
    empfaengerAbweichend: n.empfaengerAbweichend,
    frist,
    fristLang: formatKalendertagLang(frist),
    fristZeile,
    fristVerstrichen,
    linkende: ende,
    linkAbgelaufen: ctx.heute > ende,
    nachricht: n.nachricht?.trim() || null,
    zaehler: z,
    fortschritt: {
      anteil: z.gesamt > 0 ? z.angenommen / z.gesamt : 0,
      anteilZuPruefen: z.gesamt > 0 ? z.zuPruefen / z.gesamt : 0,
      text: fortschrittText(z),
    },
    positionen,
    mailVerlaufText: mails.text,
    mailVerlauf: mails.eintraege,
    mailHinweis: mails.hinweis,
    hrMeldungHinweis: n.hrMeldungOhneEmpfaenger ? MELDUNGEN.HR_MELDUNG_OHNE_EMPFAENGER : null,
    abschlussText,
    // Nur, wer die Knoepfe sonst saehe, braucht die Erklaerung, warum sie fehlen.
    eingestelltHinweis:
      status === "LAUFEND" && ctx.vorgangEingestellt && ctx.darfAktionen ? MELDUNGEN.HR_VORGANG_EINGESTELLT : null,
    aktionen: erlaubt.nachforderung,
    sperreBis: erlaubt.sperreBis,
    dialog: {
      fristGrenzen: fristGrenzen(ctx.heute),
      ergaenzenFristPflicht: ctx.heute > frist,
      zurueckweisenFrist: zurueckweisenFrist(frist, ctx.heute),
    },
  };
}

/**
 * Baut die Uebersicht fuer `GET /api/onboarding/[id]` (Feld `unterlagen`).
 *
 * - `laufend`: die LAUFENDE Nachforderung (hoechstens eine, Unique-Index).
 * - `zuletztErledigt`: ohne laufende die juengste ERLEDIGTE, solange sich eine
 *   ihrer Annahmen noch zuruecknehmen laesst (eingeklappt auf der Karte).
 * - `anfordern`: der Knopf „Unterlagen nachfordern…" — nur mit Recht, ohne
 *   laufende und wenn der Modul-Baustein den Vorgang `verfuegbar` nennt; sonst
 *   der Grund im Klartext (wie `abteilungen-karte.tsx`).
 * - Datei-URLs, Dateinamen, Aktionen und `apiBasis` nur mit `darfAktionen`
 *   (EP-14, SI-K4). Mit Recht erklaert `eingestelltHinweis` bei einem
 *   eingestellten Vorgang, warum Knoepfe fehlen.
 * - Eine zurueckgezogene Nachforderung werten Pille, Kurzstand und
 *   `nachweisStandText` nie aus (2.2); ihre uebernommenen Dokumente behalten
 *   aber ihre Herkunft, und der Waechter prueft auch ihre Loeschungen.
 */
export function uebersichtBauen(opts: {
  modul: string;
  nachforderungen: ReadonlyArray<NachforderungEingabe>;
  /** Aus dem Modul-Baustein (Onboarding: Nachweise abgegeben und nicht EXPIRED). */
  verfuegbar: { ok: true } | { ok: false; grund: string };
  /** Onboarding: EXPIRED. */
  vorgangEingestellt: boolean;
  /** HR_EDIT_ROLES. */
  darfAktionen: boolean;
  /** Baut die URL der HR-Dateiroute zu einer Datei-Id. */
  dateiUrl: (dateiId: string) => string;
  /** Basis der HR-Routen aus dem Modul-Baustein; nur mit `darfAktionen` weitergegeben. */
  apiBasis?: string | null;
  /** Auswahl und Adressvorschlaege aus dem Modul-Baustein; nur mit `darfAktionen` weitergegeben. */
  dialog?: UnterlagenDialogDaten | null;
  jetzt: Date;
}): UnterlagenUebersicht {
  const heute = heuteInBerlin(opts.jetzt);
  const nachNeueste = [...opts.nachforderungen].sort(
    (a, b) => (alsDatum(b.angefordertAm)?.getTime() ?? 0) - (alsDatum(a.angefordertAm)?.getTime() ?? 0),
  );
  const laufendRoh = nachNeueste.find((n) => n.status === "LAUFEND") ?? null;
  const ctx = {
    heute,
    jetzt: opts.jetzt,
    vorgangEingestellt: opts.vorgangEingestellt,
    darfAktionen: opts.darfAktionen,
    dateiUrl: opts.dateiUrl,
  };

  const laufend = laufendRoh ? nachforderungAnsichtBauen(laufendRoh, { ...ctx, andereLaufend: false }) : null;

  let zuletztErledigt: NachforderungAnsicht | null = null;
  if (!laufendRoh) {
    const erledigte = nachNeueste
      .filter((n) => n.status === "ERLEDIGT")
      .sort((a, b) => (alsDatum(b.erledigtAm)?.getTime() ?? 0) - (alsDatum(a.erledigtAm)?.getTime() ?? 0));
    const kandidat = erledigte[0];
    if (
      kandidat &&
      kandidat.positionen.some((p) => p.status === "ANGENOMMEN" && ruecknahmeFristOffen(p.entschiedenAm, heute))
    ) {
      zuletztErledigt = nachforderungAnsichtBauen(kandidat, { ...ctx, andereLaufend: false });
    }
  }

  // Stand je Katalogart: die laufende zuerst, danach nur ENTFAELLT aus
  // erledigten — neueste zuerst, die erste Fundstelle gilt. Die laufende steht
  // ausdruecklich vorn: Nach „Annahme zurücknehmen" (E-3) laeuft wieder eine
  // AELTERE, und eine neuere erledigte mit ENTFAELLT derselben Art darf ihren
  // Stand nicht verdecken (2.2).
  const typen: Record<string, TypStand> = {};
  const reihenfolge = laufendRoh ? [laufendRoh, ...nachNeueste.filter((n) => n !== laufendRoh)] : nachNeueste;
  for (const n of reihenfolge) {
    if (n.status === "ZURUECKGEZOGEN") continue;
    const istLaufend = n.status === "LAUFEND";
    const frist = datumsTag(n.frist);
    for (const p of n.positionen) {
      if (!p.typ || typen[p.typ] || !istPositionStatus(p.status)) continue;
      if (!istLaufend && p.status !== "ENTFAELLT") continue;
      typen[p.typ] = {
        status: p.status,
        laufend: istLaufend,
        nachforderungId: n.id,
        angefordertAm: zeitpunktTag(p.angefordertAm),
        frist,
        fristVerstrichen: istLaufend && !!frist && heute > frist && wartetAufPerson(p.status),
        entschiedenAm: zeitpunktTag(p.entschiedenAm),
      };
    }
  }

  const dokumentHerkunft: Record<string, DokumentHerkunft> = {};
  for (const n of opts.nachforderungen) {
    for (const p of n.positionen) {
      for (const d of p.dateien) {
        if (d.status !== "ANGENOMMEN" || d.uebernahmeZiel !== "DOCUMENT" || !d.uebernommenId) continue;
        dokumentHerkunft[d.uebernommenId] = {
          nachforderungId: n.id,
          text: `aus Nachforderung angenommen am ${datumText(d.uebernommenAm ?? d.entschiedenAm)}`,
          hinweise: pdfHinweisTexte(d.pdfHinweise),
        };
      }
    }
  }

  // Waechter ueber ALLE Nachforderungen: die Erinnerung nur bei der laufenden
  // (erinnerungFaellig verlangt LAUFEND), die Loeschung bei jeder.
  let erinnerungVom: Kalendertag | null = null;
  let loeschungSeit: Kalendertag | null = null;
  for (const n of opts.nachforderungen) {
    const befund = laufWaechter({ ...n, vorgangEingestellt: opts.vorgangEingestellt }, heute);
    if (!befund) continue;
    if (befund.erinnerungVom && (!erinnerungVom || befund.erinnerungVom < erinnerungVom)) {
      erinnerungVom = befund.erinnerungVom;
    }
    if (befund.loeschungSeit && (!loeschungSeit || befund.loeschungSeit < loeschungSeit)) {
      loeschungSeit = befund.loeschungSeit;
    }
  }
  const laufHinweis = erinnerungVom || loeschungSeit ? laufWaechterText({ erinnerungVom, loeschungSeit }) : null;

  const anfordern = !opts.darfAktionen
    ? { moeglich: false, grund: null }
    : laufendRoh
      ? { moeglich: false, grund: null }
      : opts.verfuegbar.ok
        ? { moeglich: true, grund: null }
        : { moeglich: false, grund: opts.verfuegbar.grund };

  return {
    modul: opts.modul,
    darfAktionen: opts.darfAktionen,
    apiBasis: opts.darfAktionen ? (opts.apiBasis ?? null) : null,
    anfordern,
    laufend,
    zuletztErledigt,
    pille: laufend ? laufend.pille : null,
    kurzstand: laufend ? `${laufend.fortschritt.text} · Frist ${formatKalendertag(laufend.frist)}` : null,
    typen,
    dokumentHerkunft,
    laufHinweis,
    dialog: opts.darfAktionen ? (opts.dialog ?? null) : null,
  };
}

// =============================================
// Antworten der Routen (6.1) — die Schritte 4, 5, 6, 9 und 10 bauen darauf
// =============================================

/** Ergebnis einer Mail an die Person, wie es die HR-Aktionen melden (EP-11). */
export interface UnterlagenMailErgebnis {
  status: "SENT" | "FAILED" | "SKIPPED";
  /**
   * ROHER Grund des Mailers bei FAILED/SKIPPED, gekuerzt auf `MAIL_DETAIL_MAX` —
   * dieselbe Form wie `UnterlagenLink.mailDetail`, sonst null. Lesbar macht ihn
   * erst `mailWarnung` (ueber `versandDetailLesbar`).
   */
  detail: string | null;
  /** N2: versendet, das Ergebnis liess sich aber nicht speichern. */
  nachweisFehlt?: boolean;
}

/** 201 auf `{ aktion: "anfordern" }`. */
export interface AnfordernAntwort {
  nachforderungId: string;
  mail: UnterlagenMailErgebnis;
  meldung: string;
  warnung?: string;
}

/**
 * 200 auf „ergaenzen", „frist-aendern" und „zurueckziehen". `mail` ist `null`,
 * wenn keine Mail vorgesehen war (Zurueckziehen, Friständerung ohne Wartendes).
 */
export interface NachforderungsAktionAntwort {
  nachforderungId: string;
  mail: UnterlagenMailErgebnis | null;
  meldung: string;
  warnung?: string;
}

/**
 * 201 (SENT), 502 (FAILED) oder 409 (SKIPPED) auf „erneut-senden" — die Mail
 * ist hier die Hauptsache (CL:244). Bei 502/409 steht der Text zusaetzlich in
 * `error`, wie bei jeder Fehlerantwort.
 */
export interface ErneutSendenAntwort {
  nachforderungId: string;
  mail: UnterlagenMailErgebnis;
  meldung: string;
  warnung?: string;
  error?: string;
  /** Neue Adresse: aeltere Links als ADRESSE entwertet (vor dem Versand). */
  adresseGeaendert: boolean;
  /** „frühere Links sperren": erst NACH SENT als GESPERRT entwertet. */
  fruehereGesperrt: boolean;
}

/** 200 auf die Positionsaktionen (annehmen, zurueckweisen, entfaellt, annahme-zuruecknehmen). */
export interface PositionsAktionAntwort {
  nachforderungId: string;
  positionId: string;
  positionStatus: PositionStatus;
  nachforderungStatus: NachforderungStatus;
  /** Nur beim Zurueckweisen eine Mail, sonst null. */
  mail: UnterlagenMailErgebnis | null;
  meldung: string;
  warnung?: string;
  /** Annehmen: die angelegten `Document`-Ids. */
  dokumentIds?: string[];
}

/** Fehler aller Routen (400/403/404/409/410/413/415/429/502). */
export interface UnterlagenFehlerAntwort {
  error: string;
  grund?: string;
  /** Nur oeffentlich bei 410 „Linkende". */
  linkGueltigBis?: Kalendertag;
  /** 409 SENSIBEL_NICHT_ERLAUBT: die abgelehnte Katalogart … */
  typ?: string;
  /** … und warum sie fuer diesen Vorgang nicht anforderbar ist (Klartext, Abschnitt 11). */
  hinweis?: string;
  /** 409 SPERRZEIT bei „Link erneut senden": Ende der Sperrzeit (ISO). */
  sperreBis?: string;
}

export type HrAktion =
  | "anfordern"
  | "ergaenzen"
  | "frist-aendern"
  | "erneut-senden"
  | "zurueckziehen"
  | "annehmen"
  | "zurueckweisen"
  | "entfaellt"
  | "annahme-zuruecknehmen";

export const AKTION_MELDUNGEN: Readonly<Record<HrAktion, string>> = {
  anfordern: "Die Unterlagen sind angefordert.",
  ergaenzen: "Die Nachforderung ist ergänzt.",
  "frist-aendern": "Die Frist ist geändert.",
  "erneut-senden": "Der Link ist erneut gesendet.",
  zurueckziehen: "Die Nachforderung ist zurückgezogen.",
  annehmen: "Die Unterlage ist angenommen und in die Dokumente des Vorgangs übernommen.",
  zurueckweisen: "Die Unterlage ist zurückgewiesen.",
  entfaellt: "Die Unterlage ist als entfallen vermerkt.",
  "annahme-zuruecknehmen": "Die Annahme ist zurückgenommen.",
};

/**
 * Warnung zu einer Mail (EP-11, N2): FAILED holt der Lauf nach, SKIPPED nie.
 * Bei SENT nur, wenn das Ergebnis nicht gespeichert werden konnte.
 */
export function mailWarnung(mail: UnterlagenMailErgebnis | null | undefined): string | null {
  if (!mail) return null;
  if (mail.status === "SENT") return mail.nachweisFehlt ? MELDUNGEN.MAIL_NACHWEIS_FEHLT : null;
  if (mail.status === "FAILED") return MELDUNGEN.MAIL_NICHT_ZUGESTELLT;
  const detail = (mail.detail ?? "").trim();
  if (detail === VORLAGE_DEAKTIVIERT_DETAIL) return MELDUNGEN.MAIL_VORLAGE_DEAKTIVIERT;
  return `Die E-Mail wurde nicht versendet: ${versandDetailLesbar(detail) || "unbekannter Grund"}.`;
}

/** Meldung und Warnung einer HR-Aktion — die Karte zeigt beides, erfindet keine Texte. */
export function aktionsTexte(
  aktion: HrAktion,
  mail: UnterlagenMailErgebnis | null,
): { meldung: string; warnung?: string } {
  const warnung = mailWarnung(mail);
  if (aktion === "erneut-senden" && mail && mail.status !== "SENT" && warnung) {
    // Beim erneuten Senden ist die Mail die Aktion selbst: ohne Zustellung
    // gibt es keine Erfolgsmeldung.
    return { meldung: warnung };
  }
  return warnung ? { meldung: AKTION_MELDUNGEN[aktion], warnung } : { meldung: AKTION_MELDUNGEN[aktion] };
}

/** Statuscode von „erneut senden": 201 SENT, 502 FAILED, 409 SKIPPED (6.1). */
export function erneutSendenStatus(mail: UnterlagenMailErgebnis): 201 | 409 | 502 {
  if (mail.status === "SENT") return 201;
  return mail.status === "FAILED" ? 502 : 409;
}

// ---- Oeffentliche Seite (5.3) ----

/** Stand einer Position aus Sicht der Person (2.2). */
export type PersonenStand = "OFFEN" | "ZURUECKGEWIESEN" | "BEREIT" | "UEBERMITTELT" | "ANGENOMMEN" | "ENTFAELLT";

/**
 * Stand und Text einer Position fuer die Person (2.2). Entwuerfe haben Vorrang
 * vor „offen" und „zurückgewiesen": „2 Dateien bereit, noch nicht übermittelt".
 */
export function personenStand(
  status: string,
  entwuerfe: number,
  uebermitteltAm: Date | string | null,
): { stand: PersonenStand; text: string } {
  if (wartetAufPerson(status) && entwuerfe > 0) {
    return { stand: "BEREIT", text: `${anzahl(entwuerfe, "Datei", "Dateien")} bereit, noch nicht übermittelt` };
  }
  switch (status) {
    case "ZURUECKGEWIESEN":
      return { stand: "ZURUECKGEWIESEN", text: "Bitte erneut hochladen" };
    case "EINGEREICHT": {
      const am = datumText(uebermitteltAm);
      return { stand: "UEBERMITTELT", text: am ? `Übermittelt am ${am}, wird geprüft` : "Übermittelt, wird geprüft" };
    }
    case "ANGENOMMEN":
      return { stand: "ANGENOMMEN", text: "Angenommen" };
    case "ENTFAELLT":
      return { stand: "ENTFAELLT", text: "Wird nicht mehr benötigt" };
    default:
      return { stand: "OFFEN", text: "Offen" };
  }
}

export interface OeffentlicheDatei {
  id: string;
  name: string;
  groesse: number;
}

export interface OeffentlichePosition {
  id: string;
  bezeichnung: string;
  hinweis: string | null;
  originalErforderlich: boolean;
  fristpflichtig: boolean;
  gueltigBisAngabe: Kalendertag | null;
  stand: PersonenStand;
  standText: string;
  /** Nur bei zurueckgewiesener Position (bei sensiblen steht sie NUR hier, E-2). */
  begruendung: string | null;
  uebermitteltAm: string | null;
  /** Nur die eigenen Entwuerfe — nie die Namen eingereichter Dateien. */
  entwuerfe: OeffentlicheDatei[];
}

/**
 * 200 auf `GET /api/unterlagen/[token]` (5.3). Nie enthalten: E-Mail-Adresse,
 * Name der HR-Kraft, andere Dokumente, Angaben aus dem Fragebogen, Notizen,
 * Pruefsummen, `tokenHash`, Namen eingereichter Dateien.
 */
export interface OeffentlicheUnterlagen {
  readOnly: boolean;
  /** Bei `readOnly`: „Alle Unterlagen sind eingegangen und geprüft. Vielen Dank." */
  meldung: string | null;
  name: string | null;
  einrichtung: string;
  vorgangsnummer: string | null;
  frist: Kalendertag;
  fristLang: string;
  /** Linkende — nur NACH der Frist, sonst null. */
  linkGueltigBis: Kalendertag | null;
  /** `oeffentlicherFristSatz` */
  fristSatz: string;
  nachricht: string | null;
  verantwortlicheStelle: string;
  grenzen: { maxDateiBytes: number; maxDateienJePosition: number; accept: string };
  positionen: OeffentlichePosition[];
}

/** 201 auf das Hochladen, 200 auf Entfernen und „Gültig bis". */
export interface OeffentlichePositionsAntwort {
  position: OeffentlichePosition;
}

/** 200 auf „Übermitteln", auch beim Doppelklick (dann `uebermittelt: 0`). */
export interface UebermittelnAntwort {
  stand: OeffentlicheUnterlagen;
  uebermittelt: number;
}

// =============================================
// Protokoll (AuditLog, Abschnitt 11)
// =============================================

/**
 * Die Codes, die Paket 4 schreibt. `details` enthaelt nur IDs,
 * Katalogschluessel, Groessen, Typ, SHA-256, Fristen, Laengen und bei
 * abweichender Adresse `adresseBestaetigt: true` — nie Freitexte, Dateinamen
 * oder den Token. `DOKUMENT_GEOEFFNET` schreibt die gehaertete Download-Route
 * der Onboarding-Dokumente fuer sensible Arten (6.2).
 */
export const UNTERLAGEN_AUDIT = {
  ANGEFORDERT: "UNTERLAGEN_ANGEFORDERT",
  ERGAENZT: "UNTERLAGEN_ERGAENZT",
  FRIST_GEAENDERT: "UNTERLAGEN_FRIST_GEAENDERT",
  LINK_ERNEUT_GESENDET: "UNTERLAGEN_LINK_ERNEUT_GESENDET",
  ZURUECKGEZOGEN: "UNTERLAGEN_ZURUECKGEZOGEN",
  UEBERMITTELT: "UNTERLAGEN_UEBERMITTELT",
  ANGENOMMEN: "UNTERLAGE_ANGENOMMEN",
  ZURUECKGEWIESEN: "UNTERLAGE_ZURUECKGEWIESEN",
  ENTFAELLT: "UNTERLAGE_ENTFAELLT",
  ANNAHME_ZURUECKGENOMMEN: "UNTERLAGE_ANNAHME_ZURUECKGENOMMEN",
  ERLEDIGT: "UNTERLAGEN_ERLEDIGT",
  DATEI_GEOEFFNET: "UNTERLAGEN_DATEI_GEOEFFNET",
  DOKUMENT_GEOEFFNET: "DOKUMENT_GEOEFFNET",
  // Die vier Aktionen des taeglichen Laufs (Abschnitt 9)
  ERINNERT: "UNTERLAGEN_ERINNERT",
  HR_GEMELDET: "UNTERLAGEN_HR_GEMELDET",
  MAIL_NACHGEHOLT: "UNTERLAGEN_MAIL_NACHGEHOLT",
  DATEIEN_GELOESCHT: "UNTERLAGEN_DATEIEN_GELOESCHT",
} as const;

/** Anzeige im Protokoll (audit-log-content.tsx ergaenzt seine Tabelle damit). */
export const UNTERLAGEN_AUDIT_LABELS: Record<string, string> = {
  UNTERLAGEN_ANGEFORDERT: "Unterlagen angefordert",
  UNTERLAGEN_ERGAENZT: "Nachforderung ergänzt",
  UNTERLAGEN_FRIST_GEAENDERT: "Frist der Nachforderung geändert",
  UNTERLAGEN_LINK_ERNEUT_GESENDET: "Unterlagen-Link erneut gesendet",
  UNTERLAGEN_ZURUECKGEZOGEN: "Nachforderung zurückgezogen",
  UNTERLAGEN_UEBERMITTELT: "Unterlagen übermittelt (Link)",
  UNTERLAGE_ANGENOMMEN: "Unterlage angenommen",
  UNTERLAGE_ZURUECKGEWIESEN: "Unterlage zurückgewiesen",
  UNTERLAGE_ENTFAELLT: "Unterlage entfällt",
  UNTERLAGE_ANNAHME_ZURUECKGENOMMEN: "Annahme einer Unterlage zurückgenommen",
  UNTERLAGEN_ERLEDIGT: "Nachforderung erledigt",
  UNTERLAGEN_DATEI_GEOEFFNET: "Nachgereichte Datei geöffnet",
  DOKUMENT_GEOEFFNET: "Vertrauliches Dokument geöffnet",
  UNTERLAGEN_ERINNERT: "Erinnerung an Unterlagen gesendet",
  UNTERLAGEN_HR_GEMELDET: "HR über Unterlagen informiert",
  UNTERLAGEN_MAIL_NACHGEHOLT: "Unterlagen-Mail nachgeholt",
  UNTERLAGEN_DATEIEN_GELOESCHT: "Unterlagen-Dateien gelöscht (Aufbewahrung)",
};
