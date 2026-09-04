/**
 * Zod-Schemas fuer den Dokumentenpaket-Versand.
 *
 * Ein Paket besteht aus Positionen, die entweder ein Pool-PDF ("PDF") oder eine
 * Brief-Vorlage ("VORLAGE") sind — genau eine Art je Position. Dieselbe Form
 * benutzen die Konfiguration des Standardpakets, die Vorpruefung und der
 * Versand, damit die drei nicht auseinanderlaufen.
 *
 * Verwendet von:
 * - GET/PUT /api/organizations/[id]/starterpaket (Standardpaket je Mandant+Modul)
 * - POST /api/dokumentenpaket/pruefen  (Vorpruefung, persistiert nichts)
 * - POST /api/dokumentenpaket/versenden (Versand + Nachweis)
 *
 * Was hier bewusst NICHT geprueft wird: ob eine Vorlage sensible Platzhalter
 * traegt und deshalb `bestaetigt` braucht. Das haengt am Platzhalter-Katalog und
 * am Inhalt der Vorlage, nicht an der Form der Anfrage — die Versandroute
 * beantwortet es mit 409. Zod kennt hier nur die Struktur.
 */

import { z } from "zod";
import { UNTERSTUETZTE_MODULE } from "@/lib/erzeugte-dokumente";

/**
 * Module, fuer die ein Paket verschickt werden darf.
 *
 * Identisch mit der Anzeige erzeugter Dokumente — insbesondere ohne BEM: Die
 * versiegelte Akte (§ 167 SGB IX) hat einen eigenen, zugriffsgeschuetzten Weg,
 * den ein generischer Versandendpunkt nicht umgehen darf.
 */
export const PAKET_MODULE = UNTERSTUETZTE_MODULE;

const modulSchema = z
  .string()
  .trim()
  .refine((v) => (PAKET_MODULE as readonly string[]).includes(v), {
    message: "Unbekanntes oder nicht unterstuetztes Modul",
  });

/** Quelle einer Paketposition. */
export const paketPositionArtSchema = z.enum(["PDF", "VORLAGE"]);
export type PaketPositionArt = z.infer<typeof paketPositionArtSchema>;

/**
 * Eine Position im Paket.
 *
 * `bestaetigt` gilt nur beim Versand und nur fuer Vorlagen mit sensiblen
 * Platzhaltern (IBAN, SV-Nummer, Steuer-ID, im Offboarding auch die Abfindung).
 * In der Konfiguration und in der Vorpruefung wird das Feld ignoriert.
 */
export const paketPositionSchema = z.object({
  art: paketPositionArtSchema,
  id: z.string().uuid("Ungueltige Dokument- oder Vorlagen-ID"),
  bestaetigt: z.boolean().optional(),
});
export type PaketPosition = z.infer<typeof paketPositionSchema>;

/**
 * Doppelte Positionen zurueckweisen.
 *
 * Ohne diese Pruefung haenge dieselbe Vorlage zweimal am selben Versand: Der
 * Empfaenger bekaeme zwei identische Anhaenge, und der Nachweis zaehlte sie
 * doppelt. Die Eindeutigkeit gilt je Art — dieselbe UUID kann es als PDF und
 * als Vorlage nicht geben, aber darauf verlassen wir uns nicht.
 */
function ohneDoppelte<T extends { art: PaketPositionArt; id: string }>(
  positionen: T[],
  ctx: z.RefinementCtx,
): void {
  const gesehen = new Set<string>();
  positionen.forEach((p, i) => {
    const schluessel = p.art + ":" + p.id;
    if (gesehen.has(schluessel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i],
        message: "Diese Position steht mehrfach im Paket",
      });
    }
    gesehen.add(schluessel);
  });
}

/** Hoechstlaenge der persoenlichen Nachricht im Versand-Dialog. */
export const MAX_NACHRICHT_ZEICHEN = 2000;

/** Hoechstzahl Positionen je Versand — die Groessenpruefung sitzt in der Bibliothek. */
export const MAX_POSITIONEN_VERSAND = 50;
/**
 * Hoechstzahl Positionen im Standardpaket eines Mandanten.
 *
 * Darf NICHT groesser sein als MAX_POSITIONEN_VERSAND: Der Dialog waehlt das
 * ganze Standardpaket vor, ein groesseres liesse sich also konfigurieren,
 * aber nie versenden.
 */
export const MAX_POSITIONEN_KONFIG = MAX_POSITIONEN_VERSAND;

/**
 * Standardpaket eines Mandanten setzen: Die uebergebene, geordnete Liste
 * ersetzt die komplette Auswahl fuer dieses Modul. Die Position in der Liste
 * wird zum orderIndex.
 *
 * Loest `setStarterpaketAuswahlSchema` aus validations/starterpaket.ts ab, das
 * nur PDFs und nur Onboarding kannte.
 */
export const setPaketAuswahlSchema = z.object({
  modul: modulSchema.default("ONBOARDING"),
  positionen: z
    .array(paketPositionSchema.omit({ bestaetigt: true }))
    .max(MAX_POSITIONEN_KONFIG)
    .superRefine(ohneDoppelte),
});
export type SetPaketAuswahl = z.infer<typeof setPaketAuswahlSchema>;

/**
 * Die Positionsliste ohne Doppelten-Pruefung — als eigene Konstante, damit der
 * Versand seine Mindestanzahl daraufsetzen kann. Nach superRefine ist das ein
 * ZodEffects, auf dem .min() nicht mehr zur Verfuegung steht.
 */
const positionenListe = z
  .array(paketPositionSchema)
  .max(
    MAX_POSITIONEN_VERSAND,
    `Ein Paket fasst hoechstens ${MAX_POSITIONEN_VERSAND} Dokumente`,
  );

/**
 * Gemeinsame Felder von Vorpruefung und Versand.
 *
 * OHNE Mindestanzahl: Die Vorpruefung laeuft waehrend des Zusammenstellens,
 * und eine leere Auswahl ist dort ausdruecklich kein Fehler. Nur der Versand
 * verlangt mindestens eine Position (siehe versendePaketSchema).
 */
const paketBasis = {
  modul: modulSchema,
  refId: z.string().uuid("Ungueltige Vorgangs-ID"),
  positionen: positionenListe.superRefine(ohneDoppelte),
};

/**
 * Vorpruefung: befuellt die gewaehlten Vorlagen probeweise und meldet leere
 * Felder, Gesamtgroesse und die Erreichbarkeit des PDF-Dienstes. Persistiert
 * nichts und entschluesselt nichts.
 *
 * `empfaenger` ist optional, weil die Vorpruefung auch vor dem Aendern der
 * Adresse laufen darf; ist sie gesetzt, meldet der Dialog eine Abweichung vom
 * Vorgang schon hier.
 */
export const pruefePaketSchema = z.object({
  ...paketBasis,
  empfaenger: z.string().trim().email("Ungueltige E-Mail-Adresse").max(254).optional(),
});
export type PruefePaket = z.infer<typeof pruefePaketSchema>;

/**
 * Versand.
 *
 * `nachricht` ist der Freitext aus dem Dialog und landet als {{nachricht}} in
 * der Mailvorlage; leer bedeutet, dass die Standardvorlage den Block weglaesst.
 */
export const versendePaketSchema = z.object({
  ...paketBasis,
  // Erst hier: Ein Versand ohne Dokument ergibt keinen Sinn, eine
  // Vorpruefung ohne Dokument schon.
  positionen: positionenListe
    .min(1, "Es ist keine Position ausgewaehlt")
    .superRefine(ohneDoppelte),
  empfaenger: z.string().trim().email("Ungueltige E-Mail-Adresse").max(254),
  nachricht: z
    .string()
    .trim()
    .max(MAX_NACHRICHT_ZEICHEN, "Die Nachricht ist zu lang")
    .optional(),
});
export type VersendePaket = z.infer<typeof versendePaketSchema>;
