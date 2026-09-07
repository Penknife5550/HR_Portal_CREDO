/**
 * Antwort-Typen des Dokumentenpakets — die EINZIGE Quelle fuer Server und
 * Client.
 *
 * Warum eine eigene Datei und nicht `import type { ... } from
 * "@/lib/dokumentenpaket"`: Der Versand-Dialog ist eine "use client"-Komponente,
 * und dokumentenpaket.ts zieht prisma (@/lib/db), fs/promises, node:crypto, den
 * Mailer und Gotenberg in den Modulgraphen. Ein reiner `import type` wuerde von
 * TypeScript zwar geloescht (isolatedModules ist an) — die Zusicherung haenge
 * dann aber daran, dass niemand spaeter versehentlich einen WERT aus derselben
 * Zeile mitimportiert. Ab dem Moment steht der Prisma-Client im Client-Bundle,
 * und das faellt erst im Build auf, wenn ueberhaupt. Dieselbe Ueberlegung steht
 * im Kopf von src/lib/placeholder-catalog.ts; diese Datei folgt ihr.
 *
 * Deshalb: KEINE Laufzeit-Importe. Der einzige Import ist ein `import type` auf
 * placeholder-catalog.ts, und diese Datei hat selbst keinen einzigen Import.
 *
 * Vorher standen dieselben sechs Beschreibungen zweimal im Projekt — einmal
 * serverseitig in dokumentenpaket.ts, einmal abgetippt im Dialog. Zwei
 * Abschriften derselben Wahrheit laufen frueher oder spaeter auseinander, ohne
 * dass es jemand merkt: Genau das war passiert, denn `empfaengerErlaubt` und
 * `erlaubteDomains` gab es serverseitig laengst und im Dialog gar nicht.
 *
 * Die einzige ECHTE Abweichung zwischen beiden Seiten ist das Datum: Ueber JSON
 * wird aus einem `Date` ein String. Deshalb traegt das Angebot einen Typ-
 * parameter fuers Datum und bekommt zwei Namen darauf (`PaketAngebot` fuer den
 * Server, `PaketAngebotJson` fuer alles hinter JSON.parse) statt zweier
 * Abschriften.
 */
import type { SensiblesFeld } from "@/lib/placeholder-catalog";

export type { SensiblesFeld };

/** PDF aus dem Pool oder Brief-Vorlage — beide teilen sich den Zahlenraum nicht. */
export type PaketPositionArt = "PDF" | "VORLAGE";

// =============================================
// Zusammenstellung fuer den Dialog
// =============================================

export interface PaketAngebotPosition {
  art: PaketPositionArt;
  id: string;
  name: string;
  beschreibung: string | null;
  scope: "GLOBAL" | "MANDANT";
  groesse: number;
  sensibleFelder: SensiblesFeld[];
}

/**
 * Grundform des Angebots mit Typparameter fuers Datum.
 *
 * `TDatum` ist serverseitig `Date` und im Browser `string` — siehe
 * Dateikopf. Alles andere ist auf beiden Seiten Zeichen fuer Zeichen dasselbe.
 */
export interface PaketAngebotBasis<TDatum> {
  modul: string;
  organizationId: string;
  empfaengerVorschlag: string;
  vorname: string;
  nachname: string;
  displayId: string | null;
  /** Standardpaket des Mandanten, in Reihenfolge — im Dialog vorausgewaehlt. */
  standardpaket: { art: PaketPositionArt; id: string }[];
  /** Alles Waehlbare, Standardpaket eingeschlossen. */
  verfuegbar: PaketAngebotPosition[];
  verlauf: {
    id: string;
    createdAt: TDatum;
    empfaenger: string;
    anzahl: number;
    empfaengerAbweichend: boolean;
  }[];
  /** Versand aus der Zeit vor dieser Tabelle — nur Zeitpunkt und Anzahl. */
  altversand: { am: TDatum; anzahl: number } | null;
  maxBytes: number;
}

/** Serversicht (ladePaketAngebot). */
export type PaketAngebot = PaketAngebotBasis<Date>;

/** Clientsicht — nach JSON.parse sind die Datumsangaben Strings. */
export type PaketAngebotJson = PaketAngebotBasis<string>;

// =============================================
// Vorpruefung
// =============================================

export interface PruefPosition {
  art: PaketPositionArt;
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
  /**
   * Wuerde diese Position den Versand mit 409 abbrechen? (Datei fehlt im
   * Speicher, Vorlage laesst sich nicht befuellen.)
   *
   * OPTIONAL, und das aus zwei Gruenden. Erstens rollt das Kennzeichen erst
   * mit dem naechsten Deploy aus: Ein bereits geoeffneter Browsertab sieht
   * danach noch Antworten ohne das Feld, und `undefined` heisst dort "nicht
   * auffaellig" — also genau der bisherige Zustand, keine Verschlechterung.
   * Zweitens ist das Kennzeichen ein KENNZEICHEN und kein Textvergleich: Die
   * ausformulierte Begruendung steht wie bisher in `warnungen` und nennt dort
   * den Dokumentnamen; der Client darf sie NICHT nach Stichworten durchsuchen,
   * um eine Sperre daraus zu bauen.
   */
  blockiert?: boolean;
}

export interface PaketPruefung {
  empfaengerVorgang: string;
  empfaengerAbweichend: boolean;
  /**
   * Wuerde der Versand diese Adresse annehmen?
   *
   * false heisst: Der Dialog muss den Knopf sperren, sonst laeuft die Person in
   * einen 409, nachdem sie das ganze Paket zusammengestellt hat. Die Antwort
   * kommt aus derselben Funktion, die auch der Versand benutzt — eine Logik,
   * zwei Aufrufer, kein Auseinanderlaufen.
   */
  empfaengerErlaubt: boolean;
  /** Gepflegte Domains; leer = keine Einschraenkung. Fuer die Meldung im Dialog. */
  erlaubteDomains: string[];
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

// =============================================
// Ergebnis des Versands
// =============================================

/** Ein fertiger Anhang samt allem, was in den Nachweis gehoert. */
export interface PaketDokument {
  art: PaketPositionArt;
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

/** Der erfolgreiche Teil von PaketErgebnis — was der Dialog nach SENT anzeigt. */
export interface PaketVersandAntwort {
  versandId: string;
  empfaenger: string;
  dokumente: PaketDokument[];
  warnungen: string[];
}
