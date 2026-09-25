/**
 * Validierung: Unterlagen nachfordern (Paket 4, Feinplanung Abschnitt 6.1)
 *
 *   - unterlagenAktionSchema    POST  /api/onboarding/[id]/unterlagen
 *                               { aktion: "anfordern" | "ergaenzen" | "frist-aendern"
 *                                 | "erneut-senden" | "zurueckziehen", … }
 *   - positionsAktionSchema     POST  /api/onboarding/[id]/unterlagen/positionen/[positionId]
 *                               { aktion: "annehmen" | "zurueckweisen" | "entfaellt"
 *                                 | "annahme-zuruecknehmen", … }
 *   - gueltigBisPatchSchema     PATCH /api/unterlagen/[token]/positionen/[positionId]  (oeffentlich)
 *   - uebermittelnSchema        POST  /api/unterlagen/[token]/uebermitteln             (oeffentlich)
 *   - jsonKoerperPruefen        liest den Body-Text und prueft ihn gegen eines der Schemas
 *
 * **Kaputtes JSON, ein leerer Body oder eine fehlende Aktion ergeben 400 —
 * nie eine Standardaktion.** Anders als bei den Abteilungsaufgaben (leerer Body
 * = „informieren") gibt es hier keine Aktion, die man versehentlich ausloesen
 * duerfte: Jede verschickt eine Mail an eine Privatadresse oder entscheidet
 * ueber einen Nachweis. Ein abgeschnittener Aufruf `{"aktion":"zurueckzie…`
 * darf deshalb nichts tun.
 *
 * Zod prueft nur die FORM. Was `heute` oder den Stand braucht (Fristgrenzen,
 * 30 Positionen nach „Ergänzen", doppelte Arten gegen die laufende
 * Nachforderung, Katalog des Moduls), prueft `eingabePruefen` in
 * src/lib/unterlagen.ts; ob ein Ablaufdatum zur Dokumentart passt,
 * `pruefeGueltigBis` in src/lib/dokument-fristen.ts. Alle Meldungen deutsch;
 * die Routen geben die erste Meldung als `{ error }` mit 400 zurueck.
 */

import { z } from "zod";
import { istKalendertag } from "@/lib/kalendertag";
import {
  BEGRUENDUNG_MAX,
  BEZEICHNUNG_MAX,
  ENTFAELLT_NOTIZ_MAX,
  HINWEIS_MAX,
  MAX_POSITIONEN,
  MELDUNGEN,
  NACHRICHT_MAX,
  SAMMELARTEN,
} from "@/lib/unterlagen";

/** RFC 5321: Eine Adresse ist hoechstens 254 Zeichen lang. */
const MAX_EMAIL_LAENGE = 254;

/** Katalogschluessel: „AUFENTHALTSTITEL", „RV_BEFREIUNG" — Grossbuchstaben, Ziffern, _. */
const KATALOG_SCHLUESSEL_MUSTER = /^[A-Z][A-Z0-9_]{1,49}$/;

/**
 * Steuerzeichen ausser Tabulator und Zeilenumbruch (`\p{Cc}` ohne \t, \n, \r).
 * Ein NUL-Zeichen laesst Postgres beim Schreiben scheitern (500 statt 400), die
 * uebrigen haben in einem Text fuer Mail und Upload-Seite nichts verloren.
 */
const STEUERZEICHEN = /[^\P{Cc}\t\n\r]/u;
/** Einzeilige Felder (Bezeichnung) duerfen gar kein Steuerzeichen tragen, auch keinen Umbruch. */
const STEUERZEICHEN_EINZEILIG = /\p{Cc}/u;

const MELDUNG_DATUM = "Bitte geben Sie das Ablaufdatum als Datum an (Tag, Monat, Jahr).";
const MELDUNG_AKTION = "Unbekannte oder fehlende Aktion.";
const MELDUNG_STEUERZEICHEN = "Der Text enthält unzulässige Steuerzeichen.";

/**
 * Kein JSON-Objekt (Array, Zahl, `null`): deutsche Meldung statt zods
 * „Expected object, received array".
 */
const KEIN_OBJEKT = {
  required_error: MELDUNGEN.UNGUELTIGE_EINGABE,
  invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE,
};

/** `null` und leere bzw. nur aus Leerzeichen bestehende Texte gelten als „nicht angegeben". */
const leerAlsFehlend = (v: unknown) =>
  v === null || (typeof v === "string" && v.trim() === "") ? undefined : v;

/** Leerer Text wird `null` („kein Datum"), alles andere bleibt, wie es ist. */
const leerAlsNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/**
 * Die Discriminated Unions melden nur ihre EIGENEN Fehler ueber diese Karte:
 * fehlende oder unbekannte Aktion bzw. gar kein Objekt. Fehler in den Feldern
 * behalten ihre eigene Meldung.
 */
const aktionsFehler: z.ZodErrorMap = (issue, ctx) =>
  issue.code === z.ZodIssueCode.invalid_union_discriminator
    ? { message: MELDUNG_AKTION }
    : issue.code === z.ZodIssueCode.invalid_type
      ? { message: MELDUNGEN.UNGUELTIGE_EINGABE }
      : { message: ctx.defaultError };

// =============================================
// Bausteine
// =============================================

/** Mehrzeiliger Freitext, optional: getrimmt, hoechstens `max` Zeichen, "" und `null` = nicht angegeben. */
function optionalerText(max: number, meldungZuLang: string) {
  return z.preprocess(
    leerAlsFehlend,
    z
      .string({ invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE })
      .trim()
      .max(max, meldungZuLang)
      .refine((t) => !STEUERZEICHEN.test(t), MELDUNG_STEUERZEICHEN)
      .optional(),
  );
}

const emailFeld = z
  .string({
    required_error: "Bitte geben Sie eine E-Mail-Adresse an.",
    invalid_type_error: "Bitte geben Sie eine E-Mail-Adresse an.",
  })
  .trim()
  .min(1, "Bitte geben Sie eine E-Mail-Adresse an.")
  .max(MAX_EMAIL_LAENGE, "Die E-Mail-Adresse ist zu lang.")
  .email("Bitte geben Sie eine gültige E-Mail-Adresse an.");

/** Frist als Kalendertag `YYYY-MM-DD` — Grenzen (morgen bis heute + 90) prueft `fristPruefen`. */
const fristFeld = z
  .string({ required_error: MELDUNGEN.FRIST_FEHLT, invalid_type_error: MELDUNGEN.FRIST_UNGUELTIG })
  .trim()
  .refine((t) => istKalendertag(t), MELDUNGEN.FRIST_UNGUELTIG);

const optionaleFrist = z.preprocess(leerAlsFehlend, fristFeld.optional());

/** Ablaufdatum `YYYY-MM-DD` oder `null` (kein Datum); "" gilt als `null`. */
const ablaufdatumFeld = z.preprocess(
  leerAlsNull,
  z
    .string({ required_error: MELDUNG_DATUM, invalid_type_error: MELDUNG_DATUM })
    .trim()
    .refine((t) => istKalendertag(t), MELDUNG_DATUM)
    .nullable(),
);

const idFeld = (meldung: string) =>
  z.string({ required_error: meldung, invalid_type_error: meldung }).trim().uuid(meldung);

const nachforderungIdFeld = idFeld("Ungültige Nachforderung.");

const katalogSchluesselFeld = z
  .string({ required_error: MELDUNGEN.TYP_UNBEKANNT, invalid_type_error: MELDUNGEN.TYP_UNBEKANNT })
  .trim()
  .regex(KATALOG_SCHLUESSEL_MUSTER, MELDUNGEN.TYP_UNBEKANNT);

// =============================================
// Positionen (Anfordern, Ergaenzen)
// =============================================

/** Eine Unterlage aus dem Katalog des Moduls — nie eine Sammelart wie SONSTIGES (400). */
const katalogPositionSchema = z.object({
  art: z.literal("KATALOG"),
  typ: katalogSchluesselFeld.refine((t) => !SAMMELARTEN.includes(t), MELDUNGEN.SAMMELART),
  hinweis: optionalerText(HINWEIS_MAX, `Der Hinweis darf höchstens ${HINWEIS_MAX} Zeichen lang sein.`),
});

/**
 * Eine freie Zeile („Unterschriebener RV-Antrag"). Spitze Klammern sind
 * erlaubt: Die Mail maskiert die Liste im HTML-Teil (FREITEXT_VARIABLEN in
 * mailer.ts), die Upload-Seite rendert nur Text.
 */
const freiePositionSchema = z.object({
  art: z.literal("FREI"),
  typ: z.null(),
  bezeichnung: z
    .string({
      required_error: "Bitte geben Sie eine Bezeichnung an.",
      invalid_type_error: "Bitte geben Sie eine Bezeichnung an.",
    })
    .trim()
    .min(1, "Bitte geben Sie eine Bezeichnung an.")
    .max(BEZEICHNUNG_MAX, `Die Bezeichnung darf höchstens ${BEZEICHNUNG_MAX} Zeichen lang sein.`)
    .refine((t) => !STEUERZEICHEN_EINZEILIG.test(t), MELDUNG_STEUERZEICHEN),
  hinweis: optionalerText(HINWEIS_MAX, `Der Hinweis darf höchstens ${HINWEIS_MAX} Zeichen lang sein.`),
  originalErforderlich: z.boolean({
    required_error: "Bitte geben Sie an, ob das Original erforderlich ist.",
    invalid_type_error: "Bitte geben Sie an, ob das Original erforderlich ist.",
  }),
});

/**
 * Eine Position: `{ typ, hinweis? }` aus dem Katalog oder
 * `{ typ: null, bezeichnung, hinweis?, originalErforderlich }` als freie Zeile.
 * Die Unterscheidung steht danach in `art` ("KATALOG" | "FREI"). Bei einer
 * Katalogart entscheidet der Server ueber „Original erforderlich"
 * (`SCHRIFTFORM_DOKUMENTTYPEN`), ein mitgeschicktes Feld faellt weg.
 */
export const positionEingabeSchema = z.preprocess(
  (roh) => {
    if (!roh || typeof roh !== "object" || Array.isArray(roh)) return roh;
    const r = roh as Record<string, unknown>;
    return { ...r, art: r.typ === null ? "FREI" : "KATALOG" };
  },
  z.discriminatedUnion("art", [katalogPositionSchema, freiePositionSchema], {
    errorMap: () => ({ message: MELDUNGEN.UNGUELTIGE_EINGABE }),
  }),
);

export type PositionEingabeDaten = z.infer<typeof positionEingabeSchema>;

/**
 * Mindestens eine Position. Die Obergrenze von 30 (EP-15) ist beim Anfordern
 * eine Formfrage (400, hier), beim Ergaenzen eine Frage des Stands: Sie zaehlt
 * die bestehenden Positionen mit, und darauf antwortet `eingabePruefen` mit 409
 * (6.1: `positionen[1..]`). Zod laesst sie beim Ergaenzen deshalb offen.
 */
const positionenMindestensEine = z
  .array(positionEingabeSchema, {
    required_error: MELDUNGEN.KEINE_POSITION,
    invalid_type_error: MELDUNGEN.KEINE_POSITION,
  })
  .min(1, MELDUNGEN.KEINE_POSITION);

const positionenAnfordern = positionenMindestensEine.max(MAX_POSITIONEN, MELDUNGEN.ZU_VIELE_POSITIONEN);

const nachrichtFeld = optionalerText(
  NACHRICHT_MAX,
  `Die Nachricht darf höchstens ${NACHRICHT_MAX} Zeichen lang sein.`,
);

// =============================================
// POST /api/onboarding/[id]/unterlagen
// =============================================

/**
 * Die fuenf Aktionen auf eine Nachforderung.
 *
 *   anfordern      empfaenger, adresseBestaetigt?, frist, nachricht?, positionen[1..30]
 *   ergaenzen      nachforderungId, positionen[1..], frist?, nachricht?  (> 30 insgesamt: 409)
 *   frist-aendern  nachforderungId, frist
 *   erneut-senden  nachforderungId, empfaenger?, adresseBestaetigt?, fruehereSperren?
 *   zurueckziehen  nachforderungId
 *
 * `adresseBestaetigt` verlangt der Server, sobald die Adresse von der im
 * Vorgang abweicht (409) — hier ist es nur ein optionales Feld.
 */
export const unterlagenAktionSchema = z.discriminatedUnion(
  "aktion",
  [
    z.object({
      aktion: z.literal("anfordern"),
      empfaenger: emailFeld,
      adresseBestaetigt: z.boolean({ invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE }).optional(),
      frist: fristFeld,
      nachricht: nachrichtFeld,
      positionen: positionenAnfordern,
    }),
    z.object({
      aktion: z.literal("ergaenzen"),
      nachforderungId: nachforderungIdFeld,
      positionen: positionenMindestensEine,
      frist: optionaleFrist,
      nachricht: nachrichtFeld,
    }),
    z.object({
      aktion: z.literal("frist-aendern"),
      nachforderungId: nachforderungIdFeld,
      frist: fristFeld,
    }),
    z.object({
      aktion: z.literal("erneut-senden"),
      nachforderungId: nachforderungIdFeld,
      empfaenger: z.preprocess(leerAlsFehlend, emailFeld.optional()),
      adresseBestaetigt: z.boolean({ invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE }).optional(),
      fruehereSperren: z.boolean({ invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE }).optional(),
    }),
    z.object({
      aktion: z.literal("zurueckziehen"),
      nachforderungId: nachforderungIdFeld,
    }),
  ],
  { errorMap: aktionsFehler },
);

export type UnterlagenAktionInput = z.infer<typeof unterlagenAktionSchema>;

// =============================================
// POST /api/onboarding/[id]/unterlagen/positionen/[positionId]
// =============================================

/**
 * Die vier Entscheidungen ueber eine Position.
 *
 *   annehmen               gueltigBis? ("YYYY-MM-DD" | null), unbefristet? (Z1), dokumentTyp?
 *   zurueckweisen          begruendung (1..1000, Pflicht), frist?
 *   entfaellt              notiz? (intern, ≤ 500)
 *   annahme-zuruecknehmen  —
 *
 * `dokumentTyp` waehlt HR nur bei einer freien Zeile (Standard SONSTIGES, 4.4)
 * — deshalb ist SONSTIGES hier erlaubt. Ob die Art sensibel und erlaubt ist
 * und ob ein Datum zu ihr passt, prueft der Server. Ein Datum UND
 * „unbefristet" zugleich ist ein Widerspruch (Z1: drei Moeglichkeiten —
 * Datum, unbefristet, „Datum später nachtragen" = beides leer).
 */
export const positionsAktionSchema = z
  .discriminatedUnion(
    "aktion",
    [
      z.object({
        aktion: z.literal("annehmen"),
        gueltigBis: ablaufdatumFeld.optional(),
        unbefristet: z.boolean({ invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE }).optional(),
        dokumentTyp: z.preprocess(leerAlsFehlend, katalogSchluesselFeld.optional()),
      }),
      z.object({
        aktion: z.literal("zurueckweisen"),
        begruendung: z
          .string({
            required_error: "Bitte geben Sie eine Begründung für die Person an.",
            invalid_type_error: "Bitte geben Sie eine Begründung für die Person an.",
          })
          .trim()
          .min(1, "Bitte geben Sie eine Begründung für die Person an.")
          .max(BEGRUENDUNG_MAX, `Die Begründung darf höchstens ${BEGRUENDUNG_MAX} Zeichen lang sein.`)
          .refine((t) => !STEUERZEICHEN.test(t), MELDUNG_STEUERZEICHEN),
        frist: optionaleFrist,
      }),
      z.object({
        aktion: z.literal("entfaellt"),
        notiz: optionalerText(
          ENTFAELLT_NOTIZ_MAX,
          `Die Notiz darf höchstens ${ENTFAELLT_NOTIZ_MAX} Zeichen lang sein.`,
        ),
      }),
      z.object({ aktion: z.literal("annahme-zuruecknehmen") }),
    ],
    { errorMap: aktionsFehler },
  )
  .superRefine((d, ctx) => {
    if (d.aktion === "annehmen" && d.unbefristet === true && d.gueltigBis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unbefristet"],
        message: "Bitte entweder ein Ablaufdatum angeben oder „Unbefristet“ wählen, nicht beides.",
      });
    }
  });

export type PositionsAktionInput = z.infer<typeof positionsAktionSchema>;

// =============================================
// Oeffentliche Upload-Seite (Token)
// =============================================

/**
 * PATCH /api/unterlagen/[token]/positionen/[positionId] — „Gültig bis" beim
 * Verlassen des Feldes zwischenspeichern. `gueltigBis` ist Pflicht, `null`
 * (oder "") heisst „leer lassen, unbefristet". Ob die Unterlage ueberhaupt
 * fristpflichtig ist und das Datum passt, prueft der Server mit
 * `pruefeGueltigBis`.
 */
export const gueltigBisPatchSchema = z.object(
  {
    gueltigBis: ablaufdatumFeld,
  },
  KEIN_OBJEKT,
);

export type GueltigBisPatchInput = z.infer<typeof gueltigBisPatchSchema>;

/**
 * POST /api/unterlagen/[token]/uebermitteln — die Seite schickt die Daten
 * „Gültig bis" mit, damit sie in DERSELBEN Transaktion gespeichert werden
 * (KO-S4). Ein leeres Objekt `{}` ist gueltig; ein leerer Body nicht.
 */
export const uebermittelnSchema = z.object(
  {
    gueltigBis: z
      .record(idFeld("Unbekannte Unterlage."), ablaufdatumFeld, {
        invalid_type_error: MELDUNGEN.UNGUELTIGE_EINGABE,
      })
      .refine((r) => Object.keys(r).length <= MAX_POSITIONEN, MELDUNGEN.UNGUELTIGE_EINGABE)
      .optional(),
  },
  KEIN_OBJEKT,
);

export type UebermittelnInput = z.infer<typeof uebermittelnSchema>;

// =============================================
// Body lesen
// =============================================

export type KoerperErgebnis<T> = { ok: true; daten: T } | { ok: false; status: 400; error: string };

/**
 * Liest den Text eines Request-Bodys als JSON und prueft ihn gegen ein Schema.
 *
 * Die Route liest den Body selbst (`await request.text()`) und reicht ihn
 * hierher — nicht `request.json().catch(() => ({}))`: Das machte aus einem
 * kaputten Body ein leeres Objekt. Leer, kein JSON oder nicht passend: 400 mit
 * deutscher Meldung, nie eine Standardaktion.
 */
export function jsonKoerperPruefen<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): KoerperErgebnis<T> {
  if (text.trim() === "") return { ok: false, status: 400, error: MELDUNGEN.UNGUELTIGE_EINGABE };
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: MELDUNGEN.UNGUELTIGE_EINGABE };
  }
  const ergebnis = schema.safeParse(roh);
  if (ergebnis.success) return { ok: true, daten: ergebnis.data };
  return {
    ok: false,
    status: 400,
    error: ergebnis.error.errors[0]?.message || MELDUNGEN.UNGUELTIGE_EINGABE,
  };
}
