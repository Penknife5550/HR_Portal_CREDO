/**
 * Ausstattung & Zugaenge auf der Link-Seite einer Stelle (Feinplan S14,
 * Mockup 6.5) — die Bausteine, die die gemeinsame Aufgabenseite
 * (src/components/abteilungsaufgaben/aufgaben-seite.tsx) nur einbindet:
 *
 *   BemerkungKasten     die Bemerkung zur Position als eigener Kasten an der
 *                       Aufgabe, getrennt vom festen Hinweis fuer die Stelle
 *                       aus dem Katalog (`description`); Beschriftung nach
 *                       Herkunft (Regel 8) kommt fertig vom Server
 *   EiltKennzeichen     Frist auf den Tag des Versands angehoben (Regel 14)
 *   EntfaelltKennzeichen  von der Personalabteilung gestrichen (R9, E-A21)
 *   AngabenEintraege    Angaben und Hinweis im Block „Nur für …“ (Regel 7)
 *
 * Was hier steht, hat der Server schon zugeschnitten (nur die eigene Stelle
 * und die fuer sie freigegebenen Angaben); die Bausteine zeigen nur, was
 * ankommt, und rechnen nichts. Nur Farb-Tokens (Sperrklinke Stand 0), Texte
 * im „Sie“ (Link-Seite ohne Anmeldung).
 */

import { HINWEIS_ANGABE_LABEL } from "@/lib/ausstattung";

/** Bemerkung an einer Aufgabe (Mockup 6.5: „Bemerkung der Führungskraft“). */
export function BemerkungKasten({ bemerkung }: { bemerkung: { text: string; label: string } | null | undefined }) {
  const text = bemerkung?.text?.trim();
  if (!bemerkung || !text) return null;
  return (
    <div className="mt-2 rounded-lg border-l-2 border-primary bg-muted px-3 py-2" data-bemerkung>
      <p className="text-xs font-semibold text-foreground">{bemerkung.label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-foreground">{text}</p>
    </div>
  );
}

/** Kennzeichen „Eilt“ neben der Faelligkeit einer offenen Aufgabe. */
export function EiltKennzeichen() {
  return (
    <span
      className="shrink-0 rounded-full border border-credo-rot/40 bg-credo-rot/10 px-2.5 py-0.5 text-xs font-semibold text-foreground"
      title="Die Frist wurde auf den Tag der Benachrichtigung vorgezogen."
      data-kennzeichen="eilt"
    >
      Eilt
    </span>
  );
}

/** Kennzeichen „Entfällt“ an einer gestrichenen Aufgabe. */
export function EntfaelltKennzeichen() {
  return (
    <span
      className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
      data-kennzeichen="entfaellt"
    >
      Entfällt
    </span>
  );
}

/** Erklaerung unter einer gestrichenen Aufgabe (ein Kommentar bleibt moeglich). */
export const ENTFAELLT_TEXT =
  "Die Personalabteilung hat diese Aufgabe gestrichen. Sie kann nicht mehr abgehakt werden; ein Kommentar ist weiter möglich.";

/**
 * Angaben (z. B. „Unterrichtsfächer“) und der Hinweis an diese Stelle als
 * Eintraege einer Beschreibungsliste — fuer den Block „Nur für …“. Der
 * Hinweis steht ueber die ganze Breite (bis 1000 Zeichen, mehrzeilig) und
 * traegt dieselbe Beschriftung wie im Infokasten der Mail.
 */
export function AngabenEintraege({
  angaben,
  hinweis,
}: {
  angaben: ReadonlyArray<{ label: string; wert: string }>;
  hinweis: string | null | undefined;
}) {
  const liste = angaben.filter((a) => a.wert.trim() !== "");
  const text = hinweis?.trim();
  if (liste.length === 0 && !text) return null;
  return (
    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3" data-angaben>
      {liste.map((a) => (
        <div key={a.label} data-angabe={a.label}>
          <dt className="text-xs text-muted-foreground">{a.label}</dt>
          <dd className="whitespace-pre-wrap break-words font-medium text-foreground">{a.wert}</dd>
        </div>
      ))}
      {text && (
        <div className="sm:col-span-3" data-stellen-hinweis>
          <dt className="text-xs text-muted-foreground">{HINWEIS_ANGABE_LABEL}</dt>
          <dd className="whitespace-pre-wrap break-words text-foreground">{text}</dd>
        </div>
      )}
    </dl>
  );
}
