/**
 * CREDO-CI E-Mail-Layout (wiederverwendbar, modueluebergreifend)
 *
 * Liefert ein tabellenbasiertes HTML mit Inline-Styles (maximale Kompatibilitaet
 * in Outlook/Gmail/Apple Mail). CREDO Corporate Design:
 *  - Primaerfarbe #575756, Akzent #DADADA
 *  - CREDO-Linie: Gelb #FBC900 / Gruen #6BAA24 / Rot #E2001A / Blau #009AC6
 *  - Schrift Montserrat -> Arial-Fallback, KEINE Verlaeufe
 *  - Logo aus /public (credo_logo.png) per absoluter APP_URL
 *
 * Genutzt z.B. fuer BEM-Einladungen (SMTP-direkt, Entscheidung #9).
 */

const CREDO_GRAU = "#575756";
const CREDO_GELB = "#FBC900";
const CREDO_GRUEN = "#6BAA24";
const CREDO_ROT = "#E2001A";
const CREDO_BLAU = "#009AC6";

export interface CredoEmailOptions {
  /** Ueberschrift im Mail-Body */
  titel: string;
  /** Optionaler Einleitungssatz (z.B. Anrede) */
  intro?: string;
  /** Haupttext als HTML (bereits escaped/erzeugt vom Aufrufer) */
  bodyHtml: string;
  /** Optionaler Call-to-Action-Button */
  button?: { label: string; url: string };
  /** Optionale Fussnote (z.B. Gueltigkeit, Datenschutzhinweis) */
  fussnote?: string;
  /** Basis-URL fuer das Logo; default aus ENV */
  appUrl?: string;
}

function resolveAppUrl(explicit?: string): string {
  return (
    explicit ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/$/, "");
}

/** Wandelt Klartext in einfaches Absatz-HTML (zeilenweise). */
export function paragraphsToHtml(text: string): string {
  return text
    .split("\n")
    .map((l) => `<p style="margin:0 0 12px;">${l.trim() === "" ? "&nbsp;" : escapeHtml(l)}</p>`)
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rendert eine vollstaendige CREDO-CI-HTML-Mail.
 * Der bodyHtml-Parameter wird unveraendert eingebettet — der Aufrufer ist fuer
 * sauberes/escaptes HTML verantwortlich (z.B. via paragraphsToHtml).
 */
export function renderCredoEmail(opts: CredoEmailOptions): string {
  const appUrl = resolveAppUrl(opts.appUrl);
  const logo = appUrl ? `${appUrl}/credo_logo.png` : "";
  const font =
    "font-family: Montserrat, 'Segoe UI', Arial, Helvetica, sans-serif;";

  const logoBlock = logo
    ? `<img src="${logo}" alt="CREDO" height="40" style="display:block;height:40px;border:0;outline:none;text-decoration:none;" />`
    : `<span style="${font}font-size:20px;font-weight:700;color:${CREDO_GRAU};">CREDO</span>`;

  // Nur http(s)-URLs zulassen (kein javascript:/data: o.ae.) und fuer das
  // Attribut escapen — Defense-in-Depth, falls die Funktion spaeter mit
  // weniger vertrauenswuerdigen URLs wiederverwendet wird.
  const safeButtonUrl =
    opts.button && /^https?:\/\//i.test(opts.button.url)
      ? escapeHtml(opts.button.url)
      : "#";
  const button = opts.button
    ? `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:8px 0 20px;">
         <tr><td style="background-color:${CREDO_BLAU};border-radius:8px;">
           <a href="${safeButtonUrl}" style="${font}display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">
             ${escapeHtml(opts.button.label)}
           </a>
         </td></tr>
       </table>`
    : "";

  const intro = opts.intro
    ? `<p style="${font}margin:0 0 16px;font-size:15px;color:#1a1a1a;">${escapeHtml(opts.intro)}</p>`
    : "";

  const fussnote = opts.fussnote
    ? `<p style="${font}margin:16px 0 0;font-size:12px;color:#777777;">${escapeHtml(opts.fussnote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;${font}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:24px 32px 16px;background-color:#ffffff;">
          ${logoBlock}
        </td></tr>

        <!-- CREDO-Linie -->
        <tr><td style="padding:0;font-size:0;line-height:0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td height="4" style="background-color:${CREDO_GELB};">&nbsp;</td>
            <td height="4" style="background-color:${CREDO_GRUEN};">&nbsp;</td>
            <td height="4" style="background-color:${CREDO_ROT};">&nbsp;</td>
            <td height="4" style="background-color:${CREDO_BLAU};">&nbsp;</td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <h1 style="${font}margin:0 0 16px;font-size:20px;font-weight:700;color:${CREDO_GRAU};">${escapeHtml(opts.titel)}</h1>
          ${intro}
          <div style="${font}font-size:15px;line-height:1.6;color:#1a1a1a;">${opts.bodyHtml}</div>
          ${button}
          ${fussnote}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #DADADA;">
          <p style="${font}margin:0;font-size:12px;color:#999999;">
            CREDO Schulträgergruppe · Diese E-Mail wurde automatisch vom CREDO HR-Portal versendet.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
