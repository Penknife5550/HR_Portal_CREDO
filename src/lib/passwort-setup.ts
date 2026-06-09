/**
 * Passwort-Setup fuer externe BEM-Beauftragte (E7)
 *
 * Externe Beauftragte werden ohne Passwort angelegt und richten es ueber einen
 * einmaligen, zeitlich begrenzten Setup-Link selbst ein. In der DB liegt nur der
 * SHA-256-Hash des Tokens (analog zu den Magic-Links). So wird kein Passwort
 * uebertragen und ein DB-Leak gibt den Token nicht preis.
 */

import { randomUUID } from "crypto";
import { hashToken } from "@/lib/token-hash";
import { renderCredoEmail, paragraphsToHtml } from "@/lib/email-layout";

/** Gueltigkeit des Setup-Links in Stunden (Default 7 Tage). */
export const SETUP_TOKEN_TTL_HOURS = Number(
  process.env.SETUP_TOKEN_TTL_HOURS || 24 * 7,
);

export interface SetupToken {
  token: string; // Klartext — nur in der Mail/URL, NICHT speichern
  tokenHash: string; // SHA-256 — wird in der DB abgelegt
  expiresAt: Date;
}

/** Erzeugt einen neuen Setup-Token (UUID, 122 Bit Entropie). */
export function generateSetupToken(now: Date = new Date()): SetupToken {
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_HOURS * 3600 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

/** Passwort-Policy (identisch zur Benutzeranlage): >=12, Gross/Klein/Ziffer. */
export function validatePasswordPolicy(password: unknown): string[] {
  const errors: string[] = [];
  if (typeof password !== "string" || password.length < 12) {
    errors.push("Passwort muss mindestens 12 Zeichen lang sein");
    return errors;
  }
  if (password.length > 256) {
    errors.push("Passwort ist zu lang");
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push("Passwort muss Gross-/Kleinbuchstaben und Ziffern enthalten");
  }
  return errors;
}

/** Baut die Setup-Mail (CREDO-CI). Link zeigt auf /konto-einrichten/<token>. */
export function buildSetupEmail(opts: {
  firstName: string;
  lastName: string;
  token: string;
}): { subject: string; text: string; html: string } {
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const link = `${appUrl}/konto-einrichten/${opts.token}`;
  const name = `${opts.firstName} ${opts.lastName}`.trim();
  const tage = Math.round(SETUP_TOKEN_TTL_HOURS / 24);
  const subject = "Ihr Zugang zum CREDO HR-Portal (BEM)";
  const text =
    `Guten Tag ${name},\n\n` +
    `fuer das Betriebliche Eingliederungsmanagement (BEM) wurde Ihnen ein Zugang ` +
    `zum CREDO HR-Portal eingerichtet. Bitte vergeben Sie ueber den folgenden Link ` +
    `Ihr persoenliches Passwort:\n\n${link}\n\n` +
    `Der Link ist ${tage} Tage gueltig und kann nur einmal verwendet werden. ` +
    `Nach dem Einrichten melden Sie sich kuenftig mit Ihrer E-Mail-Adresse und ` +
    `dem gewaehlten Passwort an.`;
  const html = renderCredoEmail({
    titel: "Zugang zum CREDO HR-Portal einrichten",
    intro: `Guten Tag ${name},`,
    bodyHtml: paragraphsToHtml(text),
    button: { label: "Passwort jetzt einrichten", url: link },
    fussnote:
      "Falls Sie diesen Zugang nicht erwartet haben, ignorieren Sie diese E-Mail. " +
      "Der Link ist zeitlich begrenzt und nur einmal verwendbar.",
  });
  return { subject, text, html };
}
