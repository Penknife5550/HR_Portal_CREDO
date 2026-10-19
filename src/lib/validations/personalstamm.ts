/**
 * Zod-Schema fuer den Stammabgleich aus DokuBit (Self-Service, Paket S0).
 *
 * Ein Eintrag ist EIN Vertrag (eine Zeile aus [DokuBit].[dbo].[dokubitmitarbeiter]),
 * eindeutig ueber Mandant + Abrechnungskreis + MANR. Feldnamen wie in der
 * SQL-Abfrage des n8n-Ablaufs (docs/module/selfservice/s0-personalstamm-n8n.md).
 *
 * n8n und MS SQL liefern Zahlen mal als Zahl, mal als Text (MANDANTENNUMMER
 * ist int, TEILZEITSTUNDEN decimal, „25,5" kommt auch vor). Deshalb wird
 * kontrolliert umgewandelt — eine ganze Zeile soll nicht an einer Typfrage
 * scheitern. Eine ungueltige Adresse laesst die Zeile dagegen bewusst ganz
 * scheitern: Die Adresse ist der Personenschluessel, eine kaputte waere ein
 * falscher.
 *
 * `vertragsende` ist autoritativ (null = unbefristet ueberschreibt ein altes
 * Ende). Darum ist der Schluessel Pflicht: Ein fehlender Schluessel ist ein
 * Formatfehler, kein „unbefristet".
 *
 * Steuerzeichen (U+0000–U+001F) und einzelne UTF-16-Surrogate in
 * Abrechnungskreis, MANR und Namen sind ein Formatfehler: Postgres lehnt NUL
 * in Text und JSON ab, Prisma jedes Argument mit einem Surrogat ohne Partner.
 * Eine solche Zeile kaeme sonst bis in die Datenbank und das Lauf-Protokoll —
 * in der MANR liesse sie schon den Vorlauf des ganzen Stapels scheitern.
 *
 * `.strip()` verwirft alles ausserhalb dieser Liste (feste Spaltenliste, Plan
 * 5.1). EVTLLDA wird bewusst nicht angenommen (Bedeutung ungeklaert).
 */

import { z } from "zod";
import { istKalendertag } from "@/lib/kalendertag";

/** Text oder endliche Zahl → getrimmter Text. */
const textOderZahl = z
  .union([z.string(), z.number().finite()])
  .transform((wert) => String(wert).trim());

/**
 * Steuerzeichen U+0000–U+001F (Postgres lehnt NUL in Text und jsonb ab) und
 * einzelne UTF-16-Surrogate (Prisma lehnt das ganze Argument ab).
 */
const STEUERZEICHEN = /[\u0000-\u001F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Pflichttext mit 1 bis `max` Zeichen, ohne Steuerzeichen und einzelne Surrogate. */
const pflichttext = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((wert) => !wert.match(STEUERZEICHEN), "Steuerzeichen sind nicht erlaubt");

const abrechnungskreis = textOderZahl.pipe(pflichttext(50));
const personalNr = textOderZahl.pipe(pflichttext(20));

/** Wie `normalisiereMandantNummer` in prisma/seed-check.js: „0742" → „742". */
const mandantNummer = textOderZahl
  .transform((wert) => wert.replace(/^0+/, ""))
  .pipe(z.string().regex(/^\d{1,6}$/, "Mandantennummer ungültig"));

/** Die ersten 10 Zeichen als Kalendertag („2026-07-31T00:00:00.000Z" → „2026-07-31"). */
const kalendertag = z
  .string()
  .transform((wert) => wert.trim().slice(0, 10))
  .refine((tag) => istKalendertag(tag), "Kein gültiges Datum (YYYY-MM-DD)");

/** Stunden als Zahl oder Text mit Komma/Punkt; leer → null. */
const teilzeitstunden = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((wert, ctx) => {
    if (wert === null || wert === undefined) return null;
    if (typeof wert === "number") return wert;
    const text = wert.trim().replace(",", ".");
    if (text === "") return null;
    if (!/^\d+(\.\d+)?$/.test(text)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Stunden ungültig" });
      return z.NEVER;
    }
    return Number(text);
  })
  .pipe(z.number().min(0).max(80).nullable());

export const personalstammEintragSchema = z
  .object({
    mandantNummer, // MANDANTENNUMMER -> Organization.mandantNumber
    abrechnungskreis, // ABRECHNUNGSKREIS
    personalNr, // MANR (nur je Mandant + Abrechnungskreis eindeutig)
    vorname: z.string().trim().pipe(pflichttext(100)), // MAVONAME
    nachname: z.string().trim().pipe(pflichttext(100)), // MANANAME
    email: z // MAEMAIL (dienstliche Adresse = Personenschluessel)
      .string()
      .nullish()
      .transform((wert) => {
        const adresse = (wert ?? "").trim().toLowerCase();
        return adresse === "" ? null : adresse;
      })
      .pipe(z.string().email("Ungültige E-Mail-Adresse").nullable()),
    teilzeitstunden, // TEILZEITSTUNDEN -> Employment.workingHoursWeek
    vertragsbeginn: kalendertag, // VERTRAGSBEGINN -> Employment.startDate
    vertragsende: kalendertag.nullable(), // VERTRAGSENDE (letzter Arbeitstag) -> Employment.endDate
  })
  .strip();

/** Ausgabetyp: normalisierte Werte (Mandant ohne fuehrende Nullen, Adresse klein, Tage `YYYY-MM-DD`). */
export type PersonalstammEintrag = z.infer<typeof personalstammEintragSchema>;

/** Steuerzeichen und einzelne Surrogate vorab entfernt — der Schluessel einer kaputten Zeile landet im Protokoll (jsonb). */
const ohneSteuerzeichen = (wert: unknown) => (typeof wert === "string" ? wert.replace(STEUERZEICHEN, "") : wert);

const schluesselSchema = z.object({
  mandantNummer: z.preprocess(ohneSteuerzeichen, mandantNummer),
  abrechnungskreis: z.preprocess(ohneSteuerzeichen, abrechnungskreis),
  personalNr: z.preprocess(ohneSteuerzeichen, personalNr),
});

/** Rein: Schluessel eines Vertrags fuer Antwort und Protokoll, „742|AK|MANR". */
export function vertragsSchluessel(e: { mandantNummer: string; abrechnungskreis: string; personalNr: string }): string {
  return `${e.mandantNummer}|${e.abrechnungskreis}|${e.personalNr}`;
}

/**
 * Vertragsschluessel aus einer Rohzeile — auch wenn der Rest der Zeile nicht
 * passt (fuer das Protokoll eines Formatfehlers), ohne Steuerzeichen und
 * einzelne Surrogate. `null`, wenn einer der drei Werte nicht lesbar ist.
 */
export function schluesselAusRohzeile(raw: unknown): string | null {
  const ergebnis = schluesselSchema.safeParse(raw);
  return ergebnis.success ? vertragsSchluessel(ergebnis.data) : null;
}
