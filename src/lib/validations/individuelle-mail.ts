/**
 * Zod-Schemas fuer die individuelle E-Mail aus einem Vorgang (Paket 3).
 *
 * Zwei Stufen, weil die Anfrage multipart ist:
 * - `individuelleMailAnfrageSchema` prueft in der Route die FORM der Felder
 *   (bekanntes Modul, UUIDs) — falsch = 400 „Ungültige Anfrage.“, ohne Datenbank.
 * - `individuelleMailEingabeSchema` prueft im Dienst den INHALT (Adresse,
 *   Betreff, Nachricht) mit den Texten aus individuelle-mail.ts, damit Dialog
 *   und Server dieselben Saetze sagen. Die Nachricht wird vorher auf \n
 *   normalisiert: Browser schicken Zeilenumbrueche im Formular als \r\n, der
 *   Zaehler im Dialog zaehlt \n — sonst waere eine Nachricht mit vielen
 *   Absaetzen im Dialog erlaubt und auf dem Server zu lang.
 *
 * Die Anhaenge prueft der Dienst selbst (Bytes, nicht Form).
 */
import { z } from "zod";
import { EMAIL_PATTERN } from "@/lib/constants";
import {
  INDIVIDUELLE_MAIL_MODULE,
  MAX_BETREFF_ZEICHEN,
  MAX_NACHRICHT_ZEICHEN,
  MELDUNGEN,
} from "@/lib/individuelle-mail";

export const individuelleMailAnfrageSchema = z.object({
  modul: z.enum(INDIVIDUELLE_MAIL_MODULE),
  refId: z.string().uuid(),
  dialogKennung: z.string().uuid(),
});

/** Zeilenumbrueche vereinheitlichen und aussen kuerzen — vor jeder Laengenpruefung. */
export function nachrichtNormalisieren(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export const individuelleMailEingabeSchema = z.object({
  empfaenger: z
    .string()
    .trim()
    .refine((v) => EMAIL_PATTERN.test(v), { message: MELDUNGEN.adresseUngueltig }),
  betreff: z
    .string()
    .trim()
    .min(1, MELDUNGEN.betreffFehlt)
    .max(MAX_BETREFF_ZEICHEN, MELDUNGEN.betreffZuLang)
    .refine((v) => !/[\r\n]/.test(v), { message: "Der Betreff darf keinen Zeilenumbruch enthalten." }),
  nachricht: z
    .string()
    .transform(nachrichtNormalisieren)
    .pipe(z.string().min(1, MELDUNGEN.nachrichtFehlt).max(MAX_NACHRICHT_ZEICHEN, MELDUNGEN.nachrichtZuLang)),
});

export type IndividuelleMailEingabe = z.infer<typeof individuelleMailEingabeSchema>;
