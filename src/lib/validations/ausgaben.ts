/**
 * Validierung: Ausstattung & Zugaenge, Stufe 2 (Paket A4) – Ausgaben je Stueck
 *
 *   - kennungSchema           Kennung eines Stuecks (auch `serialNumber` einer
 *                             Rueckgabe-Zeile mit `ausgabeId`, G15)
 *   - vermerkSchema           Vermerk ueber den Link der Stelle
 *                             POST /api/onboarding-tasks/[token]/[itemId]/ausgaben
 *   - ausgabenAktionSchema    HR in der Karte „Ausstattung & Zugänge“
 *                             POST /api/onboarding/[id]/ausgaben
 *   - einstellungAktionSchema Austritt ↔ Einstellung
 *                             POST /api/offboarding/[id]/einstellung
 *   - einstellungSucheSchema  Query von GET /api/offboarding/[id]/einstellung
 *
 * Zod prueft die FORM. Ob Aufgabe, Ausgabe und Einstellung zum Vorgang
 * gehoeren, ob das Datum in den erlaubten Bereich faellt (`vermerkPruefen`)
 * und ob ein Stueck an einen Austritt gebunden ist (G28), prueft der Dienst.
 * Alle Meldungen deutsch aus MELDUNGEN_AUSGABEN (src/lib/ausgaben.ts); die
 * Routen geben `error.errors[0].message` mit 400 zurueck. Unbekannte Felder
 * fallen weg.
 */

import { z } from "zod";
import { MELDUNGEN as ABTEILUNGS_MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { AUSGABE_GRENZEN, MELDUNGEN_AUSGABEN, RUECKGABE_ZUSTAENDE_STELLE, TAUSCH_GRUENDE } from "@/lib/ausgaben";
import { istKalendertag } from "@/lib/kalendertag";
import { OHNE_KLAMMERN_STEUERZEICHEN } from "@/lib/validations/abteilungsaufgaben";
import { freitextNormalisieren, idFeld } from "@/lib/validations/ausstattung";

/** Kein JSON-Objekt (leerer Body, Array, Zahl): deutsche Meldung statt zods englischer. */
const KEIN_OBJEKT = {
  required_error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE,
  invalid_type_error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE,
};

const UNBEKANNTE_AKTION = {
  errorMap: (issue: z.ZodIssueOptionalMessage) => ({
    message:
      issue.code === "invalid_union_discriminator" ? "Unbekannte Aktion." : ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE,
  }),
};

// =============================================
// Bausteine
// =============================================

/**
 * Kennung eines Stuecks (Inventar-, Schluessel-, Chipnummer; G4, G15):
 * auf `\n` normalisiert und getrimmt, einzeilig, hoechstens
 * `AUSGABE_GRENZEN.kennung` Zeichen, ohne spitze Klammern und Steuerzeichen
 * (`OHNE_KLAMMERN_STEUERZEICHEN` – ein Zeilenumbruch ist eins). Leer (auch
 * nur Leerraum) heisst `null`. Die Kennung geht in webhookfreie Mails, in die
 * Karte und in Word-Protokolle, nie in Titel oder Betreff (G21).
 */
export const kennungSchema = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const text = freitextNormalisieren(v);
    return text === "" ? null : text;
  },
  z
    .string({ invalid_type_error: MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG })
    .max(AUSGABE_GRENZEN.kennung, MELDUNGEN_AUSGABEN.KENNUNG_ZU_LANG)
    .regex(OHNE_KLAMMERN_STEUERZEICHEN, MELDUNGEN_AUSGABEN.KENNUNG_UNGUELTIG)
    .nullable(),
);

/**
 * Uebergabedatum: `YYYY-MM-DD` mit Rueckprobe (kein 31.02., `istKalendertag`).
 * Fehlend, `null` oder leer = nicht angegeben (`undefined`; beim Vermerk gilt
 * dann heute). Ob es in den erlaubten Bereich faellt, prueft `vermerkPruefen`.
 */
const datumSchema = z.preprocess(
  (v) => {
    if (v === null) return undefined;
    if (typeof v !== "string") return v;
    const text = v.trim();
    return text === "" ? undefined : text;
  },
  z
    .string({ invalid_type_error: MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG })
    .refine((t) => istKalendertag(t), MELDUNGEN_AUSGABEN.DATUM_UNGUELTIG)
    .optional(),
);

/** Ein Stueck: Kennung und Datum, beides freiwillig. */
const stueckSchema = z
  .object(
    {
      kennung: kennungSchema.optional(),
      uebergebenAm: datumSchema,
    },
    KEIN_OBJEKT,
  )
  .strip();

/** 1 bis `stueckJeVermerk` Stueck (G4). */
const stueckeSchema = z
  .array(stueckSchema, { required_error: MELDUNGEN_AUSGABEN.KEIN_STUECK, invalid_type_error: MELDUNGEN_AUSGABEN.KEIN_STUECK })
  .min(1, MELDUNGEN_AUSGABEN.KEIN_STUECK)
  .max(AUSGABE_GRENZEN.stueckJeVermerk, MELDUNGEN_AUSGABEN.ZU_VIELE_STUECKE);

const ausgabeIdFeld = idFeld(MELDUNGEN_AUSGABEN.AUSGABE_ID_UNGUELTIG);
const aufgabeIdFeld = idFeld(MELDUNGEN_AUSGABEN.AUFGABE_ID_UNGUELTIG);
const einstellungIdFeld = idFeld(MELDUNGEN_AUSGABEN.EINSTELLUNG_ID_UNGUELTIG);

const weitereBeschaeftigungFeld = z.boolean({ invalid_type_error: ABTEILUNGS_MELDUNGEN.UNGUELTIGE_EINGABE });

/** Liste von IDs ohne Doppelte (Reihenfolge des ersten Auftretens). */
function idListe(feld: z.ZodString, min: number, max: number, meldung: string) {
  return z
    .array(feld, { required_error: meldung, invalid_type_error: meldung })
    .min(min, meldung)
    .max(max, meldung)
    .transform((ids) => [...new Set(ids)]);
}

// =============================================
// Vermerk ueber den Link der Stelle (G6)
// =============================================

/**
 * `{ stuecke: { kennung?, uebergebenAm? }[] }` – 1 bis 10 Stueck. Dieselbe Form
 * nimmt HR in der Karte (`vermerken`).
 */
export const vermerkSchema = z.object({ stuecke: stueckeSchema }, KEIN_OBJEKT).strip();

export type VermerkInput = z.infer<typeof vermerkSchema>;

// =============================================
// HR in der Karte „Ausstattung & Zugänge“ (G7)
// =============================================

/**
 * Die fuenf Aktionen der Karte (Feinplan 1.4):
 *
 *   vermerken         { checklistItemId, stuecke }
 *   korrigieren       { ausgabeId, kennung?, uebergebenAm? } – mindestens eins;
 *                     `kennung: null`/"" loescht die Kennung
 *   tauschen          { ausgabeId, grund: DEFEKT|VERLOREN (Pflicht), neu?: { kennung?, uebergebenAm? } }
 *   zurueckgenommen   { ausgabeId, zustand: ZURUECK|BESCHAEDIGT|FEHLT }
 *   entfernen         { ausgabeId }
 */
export const ausgabenAktionSchema = z
  .discriminatedUnion(
    "aktion",
    [
      z.object({ aktion: z.literal("vermerken"), checklistItemId: aufgabeIdFeld, stuecke: stueckeSchema }).strip(),
      z
        .object({
          aktion: z.literal("korrigieren"),
          ausgabeId: ausgabeIdFeld,
          kennung: kennungSchema.optional(),
          uebergebenAm: datumSchema,
        })
        .strip(),
      z
        .object({
          aktion: z.literal("tauschen"),
          ausgabeId: ausgabeIdFeld,
          grund: z.enum(TAUSCH_GRUENDE, { errorMap: () => ({ message: MELDUNGEN_AUSGABEN.TAUSCH_GRUND_FEHLT }) }),
          neu: stueckSchema.optional().transform((n) => n ?? {}),
        })
        .strip(),
      z
        .object({
          aktion: z.literal("zurueckgenommen"),
          ausgabeId: ausgabeIdFeld,
          // Dieselben drei wie ueber den Link der Stelle: VERBLEIBT und ENTFAELLT
          // gibt es nur im Austritt.
          zustand: z.enum(RUECKGABE_ZUSTAENDE_STELLE, {
            errorMap: () => ({ message: MELDUNGEN_AUSGABEN.ZUSTAND_UNBEKANNT }),
          }),
        })
        .strip(),
      z.object({ aktion: z.literal("entfernen"), ausgabeId: ausgabeIdFeld }).strip(),
    ],
    UNBEKANNTE_AKTION,
  )
  .superRefine((d, ctx) => {
    if (d.aktion === "korrigieren" && d.kennung === undefined && d.uebergebenAm === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MELDUNGEN_AUSGABEN.KORREKTUR_LEER });
    }
  });

export type AusgabenAktionInput = z.infer<typeof ausgabenAktionSchema>;

// =============================================
// Austritt ↔ Einstellung (G11 bis G14)
// =============================================

/**
 * Die vier Aktionen am Austritt (Feinplan 1.4):
 *
 *   zuordnen       { onboardingId, weitereBeschaeftigung?, uebernehmen?: string[] }
 *                  ohne `uebernehmen` = der Vorschlag; ohne `weitereBeschaeftigung`
 *                  = Vorbelegung nach `exitType` (Dienst)
 *   loesen         {}
 *   aktualisieren  { ausgabeIds?: string[], weitereBeschaeftigung? } – ohne Merker
 *                  gilt der gespeicherte
 *   ohne-vermerk   { checklistItemIds: string[] (1..50) }
 */
export const einstellungAktionSchema = z.discriminatedUnion(
  "aktion",
  [
    z
      .object({
        aktion: z.literal("zuordnen"),
        onboardingId: einstellungIdFeld,
        weitereBeschaeftigung: weitereBeschaeftigungFeld.optional(),
        uebernehmen: idListe(ausgabeIdFeld, 0, 200, MELDUNGEN_AUSGABEN.AUSGABEN_AUSWAHL).optional(),
      })
      .strip(),
    z.object({ aktion: z.literal("loesen") }).strip(),
    z
      .object({
        aktion: z.literal("aktualisieren"),
        ausgabeIds: idListe(ausgabeIdFeld, 0, 200, MELDUNGEN_AUSGABEN.AUSGABEN_AUSWAHL).optional(),
        weitereBeschaeftigung: weitereBeschaeftigungFeld.optional(),
      })
      .strip(),
    z
      .object({
        aktion: z.literal("ohne-vermerk"),
        checklistItemIds: idListe(aufgabeIdFeld, 1, 50, MELDUNGEN_AUSGABEN.AUFGABEN_AUSWAHL),
      })
      .strip(),
  ],
  UNBEKANNTE_AKTION,
);

export type EinstellungAktionInput = z.infer<typeof einstellungAktionSchema>;

/**
 * Query von GET /api/offboarding/[id]/einstellung:
 *
 *   q         Suche ueber Vorgangsnummer oder Nachname, getrimmt,
 *             `sucheMinZeichen` bis `sucheMaxZeichen`; leer = keine Suche
 *   vorschau  ID einer Einstellung – der Rueckgabe-Vorschlag vor der Bestaetigung
 */
export const einstellungSucheSchema = z
  .object(
    {
      q: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z
          .string({ invalid_type_error: MELDUNGEN_AUSGABEN.SUCHE_ZU_KURZ })
          .trim()
          .min(AUSGABE_GRENZEN.sucheMinZeichen, MELDUNGEN_AUSGABEN.SUCHE_ZU_KURZ)
          .max(AUSGABE_GRENZEN.sucheMaxZeichen, MELDUNGEN_AUSGABEN.SUCHE_ZU_LANG)
          .optional(),
      ),
      vorschau: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        einstellungIdFeld.optional(),
      ),
    },
    KEIN_OBJEKT,
  )
  .strip();

export type EinstellungSucheInput = z.infer<typeof einstellungSucheSchema>;
