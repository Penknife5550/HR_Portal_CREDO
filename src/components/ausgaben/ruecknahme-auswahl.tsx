"use client";

/**
 * Ruecknahme auf der Link-Seite der Stelle (Offboarding, Ausstattung &
 * Zugaenge Stufe 2 – Feinplan A4, S32, 1.6, 1.8, G15, G17, Mockup 6.8)
 *
 * Block an einer Aufgabe mit dem Feld `ausgabe` (vom Server nur an den
 * Ruecknahme- und Sperraufgaben der ausgebenden Stelle und an der
 * Folgeaufgabe „Schließung prüfen“ der Gebaeudewirtschaft,
 * `offboardingLinkAusgabeBauen`), eingebunden von der gemeinsamen
 * Aufgabenseite (src/components/abteilungsaufgaben/aufgaben-seite.tsx):
 *
 *   - Kennung (beschriftet mit `kennungLabel`) und Uebergabe- bzw.
 *     Einrichtungsdatum – damit die Stelle das Stueck findet (G21);
 *   - an einem Gegenstand (RUECKGABE) statt des Hakens die drei Knoepfe
 *     „Zurückerhalten“, „Beschädigt zurückerhalten“, „Fehlt“
 *     (`RUECKNAHME_AUSWAHL`); an einer erledigten Aufgabe zeigen sie den Stand
 *     und wechseln ihn (reiner Zustandswechsel, ohne Mail); „Wieder öffnen“
 *     bleibt der Haken wie bisher. Ohne Knoepfe (Seite nur lesbar) steht der
 *     Stand als Text da, auch „Zustand: offen“;
 *   - an einem Zugang (SPERREN) bleibt der Haken („Als gesperrt markieren“);
 *   - an der Folgeaufgabe nur lesend die Kennung und „fehlt“, mit dem
 *     normalen Haken (G17).
 *
 * Der Block rechnet nichts: Zustand, Woerter und Knoepfe kommen fertig vom
 * Server. Er ruft keine Schnittstelle – die Seite schickt `{ isCompleted:
 * true, zustand }` an den PATCH der Aufgabe und uebernimmt die Antwort.
 *
 * Link-Seite ohne Anmeldung: Texte im „Sie“ bzw. ohne Anrede. Nur Farb-Tokens
 * und lucide-react (neue Datei, Stand 0 in der Sperrklinke).
 */

import { Check } from "lucide-react";
import {
  linkStueckText,
  type LinkAusgabe,
  type OffboardingFolgeAusgabe,
  type OffboardingLinkAusgabe,
  type RueckgabeZustandStelle,
} from "@/lib/ausgaben";

/** Texte des Blocks. */
export const RUECKNAHME_TEXTE = {
  gruppe: "Rücknahme bestätigen",
  zustand: (wort: string): string => `Zustand: ${wort}`,
  gesperrtHaken: "Als gesperrt markieren",
  /**
   * Unter den Knoepfen einer offenen Ruecknahme – der Haken fehlt dort.
   * Neutral: Einer der drei Knoepfe ist „Fehlt“, der Gegenstand kam dann gerade
   * nicht zurueck (Review A4c).
   */
  hilfe: "Bitte wählen Sie: zurückerhalten, beschädigt zurückerhalten oder fehlt.",
} as const;

/** Das Feld `ausgabe` einer Aufgabe auf der Link-Seite – Onboarding oder Offboarding. */
export type AufgabenAusgabe = LinkAusgabe | OffboardingLinkAusgabe | OffboardingFolgeAusgabe;

/** Das Offboarding-Feld (Ruecknahme, Sperre, Folgeaufgabe); das Onboarding traegt `stuecke` → `null`. */
export function offboardingAusgabe(a: AufgabenAusgabe | null | undefined): OffboardingLinkAusgabe | OffboardingFolgeAusgabe | null {
  if (!a || "stuecke" in a) return null;
  return a;
}

/** Ruecknahme- bzw. Sperraufgabe (mit Zustand und `auswahl`), nicht die Folgeaufgabe. */
export function istRuecknahme(a: OffboardingLinkAusgabe | OffboardingFolgeAusgabe): a is OffboardingLinkAusgabe {
  return "auswahl" in a;
}

/** Ein Gegenstand mit den drei Knoepfen statt des Hakens (RUECKGABE, `auswahl` nicht leer). */
export function knoepfeStattHaken(a: AufgabenAusgabe | null | undefined): boolean {
  const off = offboardingAusgabe(a);
  return !!off && istRuecknahme(off) && off.auswahl.length > 0;
}

/** Ein Zugang (SPERREN) – der Haken heisst „Als gesperrt markieren“. */
export function zugangMitHaken(a: AufgabenAusgabe | null | undefined): boolean {
  const off = offboardingAusgabe(a);
  return !!off && istRuecknahme(off) && off.art === "SPERREN";
}

export interface RuecknahmeAuswahlProps {
  ausgabe: OffboardingLinkAusgabe | OffboardingFolgeAusgabe;
  /** Aufgabe erledigt (ein Zustand ist gesetzt). */
  erledigt: boolean;
  /** Vorgang abgeschlossen bzw. Link nur lesbar: keine Knoepfe. */
  readOnly: boolean;
  /** Eine Aenderung an der Aufgabe laeuft. */
  gesperrt: boolean;
  /** Waehlt den Zustand (PATCH `{ isCompleted: true, zustand }`). */
  onWahl?: (zustand: RueckgabeZustandStelle) => void;
}

export function RuecknahmeAuswahl({ ausgabe, erledigt, readOnly, gesperrt, onWahl }: RuecknahmeAuswahlProps) {
  const kennung = ausgabe.kennung?.trim() || null;
  const ruecknahme = istRuecknahme(ausgabe) ? ausgabe : null;
  const datum = ruecknahme?.uebergebenAm ? linkStueckText({ kennung: null, uebergebenAm: ruecknahme.uebergebenAm }, ruecknahme.art) : "";
  const knoepfe = ruecknahme && ruecknahme.auswahl.length > 0 && !readOnly && onWahl ? ruecknahme.auswahl : [];
  // Der Stand steht immer als Text da, wenn weder Haken noch Knoepfe ihn tragen:
  // An einem offenen Gegenstand ersetzt die Seite den Haken durch einen leeren
  // Platz – ist die Seite nur lesbar (Austritt abgeschlossen), fehlen auch die
  // Knoepfe, und ohne „Zustand: offen“ stuende gar kein Stand da (Review A4c).
  const zeigeZustand = ruecknahme
    ? ruecknahme.zustand !== null || (ruecknahme.auswahl.length > 0 && knoepfe.length === 0)
    : true;

  return (
    <div className="mt-2 rounded-lg border border-border bg-card px-3 py-2" data-ruecknahme={ruecknahme ? ruecknahme.art : "FOLGE"}>
      <p className="break-words text-xs text-foreground" data-ruecknahme-stueck>
        {kennung ? (
          <>
            <span className="text-muted-foreground">{`${ausgabe.kennungLabel}: `}</span>
            <span className="font-medium">{kennung}</span>
          </>
        ) : null}
        {kennung && datum ? " · " : ""}
        {datum}
      </p>
      {zeigeZustand && (
        <p className="mt-0.5 text-xs font-medium text-foreground" data-ruecknahme-zustand>
          {RUECKNAHME_TEXTE.zustand(ausgabe.zustandLabel)}
        </p>
      )}
      {knoepfe.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={RUECKNAHME_TEXTE.gruppe}>
            {knoepfe.map((k) => {
              const gewaehlt = erledigt && ruecknahme?.zustand === k.zustand;
              return (
                <button
                  key={k.zustand}
                  type="button"
                  aria-pressed={gewaehlt}
                  disabled={gesperrt}
                  onClick={() => {
                    if (!gewaehlt) onWahl?.(k.zustand);
                  }}
                  data-wahl={k.zustand}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    gewaehlt ? "border-primary bg-muted" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  {gewaehlt && <Check className="h-4 w-4" aria-hidden="true" />}
                  {k.label}
                </button>
              );
            })}
          </div>
          {!erledigt && <p className="mt-1 text-xs text-muted-foreground">{RUECKNAHME_TEXTE.hilfe}</p>}
        </>
      )}
    </div>
  );
}
