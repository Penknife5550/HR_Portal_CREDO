"use client";

/**
 * Oeffentliche Upload-Seite „Unterlagen nachreichen" (Paket 4, Magic Link ohne Anmeldung)
 *
 * Die Person laedt zu jeder angeforderten Unterlage eine oder mehrere Dateien
 * hoch und gibt sie mit „Unterlagen übermitteln" an die Personalabteilung.
 * Hochladen legt nur einen Entwurf an, den HR nie sieht; bis zum Übermitteln
 * laesst er sich wieder entfernen. Teilweises Übermitteln ist moeglich (P:1371).
 *
 * Die Seite spricht nur mit der oeffentlichen API (src/lib/unterlagen-upload.ts)
 * und zeigt, was dort ankommt — Texte, Stand je Unterlage und Fristsatz kommen
 * fertig vom Server bzw. aus src/lib/unterlagen.ts (`MELDUNGEN`). Die Regeln
 * (Feinplanung docs/module/onboarding/paket4-feinplanung.md, 5.3–5.5, 10.1):
 *
 *   1. **Eine Datei je Anfrage, nacheinander** (genau ein Feld `datei`). Vor dem
 *      Senden prueft die Seite Groesse (9,5 MB), Typ und die Zahl je Unterlage —
 *      eine Datei, die ohnehin abgewiesen wuerde, geht gar nicht erst hinaus.
 *      Verkleinert wird im Browser nichts (Stufe 1). Entscheidend bleibt der
 *      Server: Er erkennt den Typ aus den Bytes.
 *   2. **429:** Die Seite wartet `Retry-After` ab und versucht es selbst erneut
 *      (hoechstens dreimal). Bis dahin steht der Hinweis im Balken unten.
 *   3. **Fehler bleiben stehen** — je Datei an ihrer Unterlage, mit
 *      `role="alert"`, bis zur naechsten Aktion dort. Nie nach ein paar
 *      Sekunden ausblenden: Am Handy steckt die Person dann oft noch im
 *      Dateiwaehler und saehe die Meldung nie. Ein abgelehntes „Gültig bis"
 *      steht getrennt davon unter seinem Feld (`aria-invalid`) und geht erst,
 *      wenn sich das Feld aendert oder die Speicherung klappt — ein Hochladen
 *      an derselben Unterlage raeumt es nicht ab.
 *   4. **„Gültig bis"** speichert beim Verlassen des Feldes und geht beim
 *      Übermitteln noch einmal mit (der Server speichert es in derselben
 *      Transaktion) — sonst ginge ein Datum verloren, das beim Tippen auf
 *      „Übermitteln" noch unterwegs war. Übermitteln wartet eine laufende
 *      Speicherung ab und sendet nicht, solange ein Datum abgelehnt ist: Der
 *      Server wiese sonst die GANZE Übermittlung ab.
 *   5. **Nur ein GET beim Oeffnen**, auch im StrictMode. Ein GET schreibt
 *      nichts; der Merker verhindert nur die doppelte Anfrage.
 *   6. **Das Linkende steht erst nach der Frist da** — vorher gibt es genau ein
 *      Datum, die Frist (5.3). Deshalb nennt die Fusszeile, anders als die
 *      Aufgabenseite der Abteilungen, keine Gueltigkeit des Links.
 *   7. **Freitexte der Personalabteilung** (Nachricht, Hinweis, Begruendung)
 *      nur als Text — die CSP erlaubt `unsafe-inline`.
 *   8. **Übermitteln ist fuer diese Unterlagen endgueltig** — danach nimmt
 *      keine von ihnen noch Dateien an, bis HR zurueckweist. Deshalb nennen
 *      Erklaerung und Balken das VOR dem Tippen, der Balken samt Namen.
 *   9. **Schriftform:** Der Hinweis auf das unterschriebene Original steht
 *      immer da, ausser die Unterlage entfaellt (P:1457) — auch nach dem
 *      Übermitteln und nach der Annahme. Das Portal verfolgt das Original
 *      nicht; ein angenommener Scan ersetzt es nicht.
 *  10. **409 „alles geprüft"** auf einem Schreibweg laedt den Stand neu: HR hat
 *      inzwischen entschieden, Entwuerfe einer entfallenen Unterlage gibt es
 *      nicht mehr. Scheitert das Laden, bleibt die Seite wenigstens auf „nur
 *      lesen".
 *
 * Kopf, Ladezustand, Fehlerseite und CREDO-Linie folgen
 * src/components/abteilungsaufgaben/aufgaben-seite.tsx.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { formatBytes } from "@/lib/format";
import { formatKalendertagLang, heuteInBerlin, istKalendertag, tageZwischen } from "@/lib/kalendertag";
import {
  MELDUNGEN,
  type OeffentlicheDatei,
  type OeffentlichePosition,
  type OeffentlichePositionsAntwort,
  type OeffentlicheUnterlagen,
  type PersonenStand,
  type UebermittelnAntwort,
  type UnterlagenFehlerAntwort,
} from "@/lib/unterlagen";

// =============================================
// Texte, die MELDUNGEN (unterlagen.ts) nicht kennt
// =============================================

export const UPLOAD_SEITE_TEXTE = {
  LADEN: "Unterlagen werden geladen…",
  FEHLER_LADEN: "Die Unterlagen konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
  FEHLER_VERBINDUNG: "Verbindungsfehler. Bitte versuchen Sie es später erneut.",
  FEHLER_SERVER: "Das hat leider nicht geklappt. Bitte versuchen Sie es in einem Moment erneut.",
  GUELTIG_BIS_LABEL: "Gültig bis (Ablaufdatum)",
  GUELTIG_BIS_HINWEIS: "Leer lassen, wenn Ihr Nachweis unbefristet ist (z. B. Niederlassungserlaubnis).",
  ORIGINAL: "Bitte geben Sie zusätzlich das unterschriebene Original ab.",
  ZURUECKGEWIESEN: "Die Personalabteilung konnte Ihre Unterlage nicht annehmen:",
  /** Ergaenzt MELDUNGEN.ZU_VIELE_DATEIEN_POSITION an einer vollen Unterlage (statt des Dateifelds). */
  VOLL_ENTFERNEN: "Entfernen Sie eine Datei, um eine andere hinzuzufügen.",
  /** Erklaerung ueber den Kacheln: Übermitteln ist fuer diese Unterlagen endgueltig. */
  NACH_DEM_UEBERMITTELN:
    "Danach können Sie zu diesen Unterlagen keine Dateien mehr hinzufügen oder entfernen – laden Sie deshalb zuerst alle Seiten einer Unterlage hoch.",
  UEBERMITTELN: "Unterlagen übermitteln",
  PRUEFUNG: "Die Personalabteilung prüft Ihre Unterlagen. Falls etwas fehlt oder nicht lesbar ist, erhalten Sie eine E-Mail.",
  ALLES_UEBERMITTELT:
    "Sie haben alle angeforderten Unterlagen übermittelt. Die Personalabteilung prüft sie. Falls etwas fehlt oder nicht lesbar ist, erhalten Sie eine E-Mail.",
  LINK_PERSOENLICH: "Der Link ist persönlich, bitte nicht weiterleiten.",
  KEINE_EMAIL: "Bitte senden Sie Unterlagen nicht per E-Mail.",
  /**
   * PLATZHALTER — der Wortlaut (Art. 13 DSGVO, mit Art. 9 fuer
   * Gesundheitsnachweise) kommt vom Datenschutzbeauftragten und wird vor dem
   * Deploy ersetzt (Feinplanung 11 „Für den DSB", 15 Handschritt 4). Bis dahin
   * steht hier sinngemaess der Text des Personalfragebogens.
   */
  DATENSCHUTZ:
    "Datenschutz: Ihre Unterlagen werden ausschließlich zur Begründung und Durchführung Ihres Arbeitsverhältnisses verarbeitet (Art. 6 Abs. 1 lit. b und Art. 88 DSGVO i. V. m. § 26 BDSG) und nur der Personalabteilung zugänglich gemacht. Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung (Art. 15–18 DSGVO). Bei Fragen zum Datenschutz wenden Sie sich bitte an die Personalabteilung.",
} as const;

/** „Datei hinzufügen: Aufenthaltstitel" — sichtbares Label des Dateifelds (5.4). */
export function dateiFeldLabel(bezeichnung: string): string {
  return `Datei hinzufügen: ${bezeichnung}`;
}

/** Stand im Balken unten: „1 Unterlage bereit zum Übermitteln". */
export function bereitText(anzahl: number): string {
  if (anzahl === 0) return "Noch keine Unterlage bereit zum Übermitteln";
  return `${anzahl} ${anzahl === 1 ? "Unterlage" : "Unterlagen"} bereit zum Übermitteln`;
}

/**
 * Zweite Zeile im Balken, am Knopf per `aria-describedby`: welche Unterlagen
 * hinausgehen und dass danach keine Dateien mehr dazukommen.
 */
export function bereitNamenText(namen: readonly string[]): string {
  return `Übermittelt werden: ${namen.join(", ")}. Danach können Sie dazu keine Dateien mehr hinzufügen.`;
}

/** Bestaetigung: Schriftform-Unterlagen, deren Scan gerade uebermittelt wurde. */
export function originalBestaetigungText(namen: readonly string[]): string {
  return `Bitte geben Sie zusätzlich das unterschriebene Original ab: ${namen.join(", ")}.`;
}

/** Übermitteln gesperrt, solange ein „Gültig bis" abgelehnt ist. */
export function ablaufdatumPruefenText(namen: readonly string[]): string {
  return `Bitte prüfen Sie zuerst das Ablaufdatum: ${namen.join(", ")}.`;
}

/** Countdown unter dem Fristsatz, in Berliner Kalendertagen; nach der Frist keiner. */
export function fristCountdown(tage: number): string | null {
  if (tage >= 2) return `Noch ${tage} Tage bis zur Frist.`;
  if (tage === 1) return "Die Frist endet morgen.";
  if (tage === 0) return "Die Frist endet heute.";
  return null;
}

function sekundenText(s: number): string {
  return s === 1 ? "1 Sekunde" : `${s} Sekunden`;
}

// =============================================
// Anfragen
// =============================================

const API_BASIS = "/api/unterlagen";
/** 429: so oft wartet die Seite `Retry-After` ab und versucht es erneut. */
const MAX_WIEDERHOLUNGEN = 3;
const RETRY_AFTER_STANDARD_S = 5;
/** Obergrenze fuer ein unplausibles `Retry-After` (die laengste Bremse hat 10 Minuten). */
const RETRY_AFTER_MAX_S = 900;
/** Fuer Dateiwaehler, die keinen Typ melden: dieselben Arten wie `accept`. */
const ERLAUBTE_ENDUNGEN = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

interface Antwort {
  /** 0 = keine Verbindung. */
  status: number;
  body: unknown;
  /** Nur bei 429: Wartezeit in Sekunden. */
  retryAfterS: number;
}

function retryAfterSekunden(wert: string | null | undefined): number {
  const s = Number(wert);
  if (!Number.isFinite(s) || s <= 0) return RETRY_AFTER_STANDARD_S;
  return Math.min(Math.ceil(s), RETRY_AFTER_MAX_S);
}

async function einmalSenden(url: string, init: RequestInit): Promise<Antwort> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    return { status: 0, body: null, retryAfterS: 0 };
  }
  const body: unknown = await res.json().catch(() => null);
  return {
    status: res.status,
    body,
    retryAfterS: res.status === 429 ? retryAfterSekunden(res.headers?.get("Retry-After")) : 0,
  };
}

const warte = (ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms));

function fehlerAus(body: unknown): { text: string | null; grund: string | null } {
  const b = body as Partial<UnterlagenFehlerAntwort> | null;
  return {
    text: typeof b?.error === "string" && b.error ? b.error : null,
    grund: typeof b?.grund === "string" ? b.grund : null,
  };
}

/** Text zu einer gescheiterten Anfrage: der des Servers, sonst ein eigener. */
function fehlerText(status: number, text: string | null): string {
  if (status === 0) return UPLOAD_SEITE_TEXTE.FEHLER_VERBINDUNG;
  if (status === 429) return MELDUNGEN.ZU_VIELE_ANFRAGEN;
  if (status >= 500) return UPLOAD_SEITE_TEXTE.FEHLER_SERVER;
  return text ?? UPLOAD_SEITE_TEXTE.FEHLER_SERVER;
}

/** 410 immer, 404 nur fuer den Link selbst — eine unbekannte Unterlage ist kein toter Link. */
function istLinkSperre(status: number, grund: string | null): boolean {
  return status === 410 || (status === 404 && grund === "LINK_UNGUELTIG");
}

/** 404 (Unterlage/Datei weg) und 409 ausser den Kontingenten: Der Stand auf der Seite ist alt. */
function standVeraltet(status: number, grund: string | null): boolean {
  return status === 404 || (status === 409 && grund !== "ZU_VIELE_DATEIEN_POSITION" && grund !== "GESAMTGRENZE_ERREICHT");
}

function standAus(body: unknown): OeffentlicheUnterlagen | null {
  const s = body as Partial<OeffentlicheUnterlagen> | null;
  return s && Array.isArray(s.positionen) && typeof s.fristSatz === "string" && s.grenzen
    ? (s as OeffentlicheUnterlagen)
    : null;
}

function positionAus(body: unknown): OeffentlichePosition | null {
  const p = (body as Partial<OeffentlichePositionsAntwort> | null)?.position;
  return p && typeof p.id === "string" && Array.isArray(p.entwuerfe) ? p : null;
}

function uebermittelnAus(body: unknown): UebermittelnAntwort | null {
  const b = body as Partial<UebermittelnAntwort> | null;
  const stand = standAus(b?.stand);
  return stand && typeof b?.uebermittelt === "number" ? { stand, uebermittelt: b.uebermittelt } : null;
}

// =============================================
// Fehlerseite (404/410, Laden gescheitert)
// =============================================

interface Sperre {
  titel: string;
  text: string;
  /** „info": nichts falsch gemacht (zurueckgezogen, Vorgang beendet). */
  art: "warnung" | "info";
  /** Nur wenn ein neuer Versuch helfen kann (Verbindung, Server). */
  erneutVersuchen: boolean;
}

const SPERRE_TITEL: Readonly<Record<string, Pick<Sperre, "titel" | "art">>> = {
  LINK_UNGUELTIG: { titel: "Link nicht gültig", art: "warnung" },
  LINK_ERSETZT: { titel: "Link ersetzt", art: "warnung" },
  LINK_ABGELAUFEN: { titel: "Link abgelaufen", art: "warnung" },
  ANFORDERUNG_ZURUECKGEZOGEN: { titel: "Anforderung zurückgezogen", art: "info" },
  VORGANG_EINGESTELLT: { titel: "Vorgang nicht mehr aktiv", art: "info" },
};

function sperreAus(status: number, body: unknown): Sperre {
  const f = fehlerAus(body);
  if (istLinkSperre(status, f.grund) || status === 404) {
    const bekannt = (f.grund && SPERRE_TITEL[f.grund]) || SPERRE_TITEL.LINK_UNGUELTIG;
    return { ...bekannt, text: f.text ?? MELDUNGEN.LINK_UNGUELTIG, erneutVersuchen: false };
  }
  const text = status === 200 ? UPLOAD_SEITE_TEXTE.FEHLER_LADEN : fehlerText(status, f.text);
  return { titel: "Seite nicht erreichbar", art: "warnung", text, erneutVersuchen: true };
}

function SperrSeite({ sperre, onErneut }: { sperre: Sperre; onErneut: () => void }) {
  const info = sperre.art === "info";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
        <div className="p-6 text-center sm:p-8">
          <Image src="/credo_logo_claim.svg" alt="CREDO" width={200} height={65} className="mx-auto mb-6" priority />
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              info ? "bg-muted" : "bg-destructive/10"
            }`}
          >
            <svg
              className={`h-8 w-8 ${info ? "text-muted-foreground" : "text-destructive"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={
                  info
                    ? "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                }
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-foreground">{sperre.titel}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{sperre.text}</p>
          {sperre.erneutVersuchen && (
            <button
              type="button"
              onClick={onErneut}
              className="mt-5 min-h-11 rounded-lg border border-border bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Erneut versuchen
            </button>
          )}
        </div>
        <CredoLinie />
      </div>
    </div>
  );
}

// =============================================
// Kachel je Unterlage
// =============================================

/** Stand, in dem die Person an einer Unterlage noch etwas tun kann (2.2). */
function istOffen(p: OeffentlichePosition): boolean {
  return p.stand === "OFFEN" || p.stand === "ZURUECKGEWIESEN" || p.stand === "BEREIT";
}

/** Farben wie im Mockup (P:1352-1375): zurueckgewiesen rot, bereit gelb, uebermittelt blau. */
const AUSSEHEN: Readonly<Record<PersonenStand, { karte: string; kreis: string; pille: string; zeichen: string }>> = {
  OFFEN: { karte: "border-border bg-card", kreis: "bg-amber-100 text-amber-700", pille: "bg-gray-100 text-gray-700", zeichen: "+" },
  ZURUECKGEWIESEN: { karte: "border-red-200 bg-red-50/60", kreis: "bg-red-100 text-red-700", pille: "bg-red-100 text-red-700", zeichen: "!" },
  BEREIT: { karte: "border-amber-300 bg-amber-50/60", kreis: "bg-amber-100 text-amber-700", pille: "bg-amber-100 text-amber-800", zeichen: "+" },
  UEBERMITTELT: { karte: "border-[#009AC6]/30 bg-[#009AC6]/5", kreis: "bg-[#009AC6]/15 text-[#00789a]", pille: "bg-blue-100 text-blue-700", zeichen: "✓" },
  ANGENOMMEN: { karte: "border-green-200 bg-green-50", kreis: "bg-green-100 text-green-700", pille: "bg-green-100 text-green-700", zeichen: "✓" },
  ENTFAELLT: { karte: "border-border bg-muted", kreis: "bg-gray-100 text-gray-500", pille: "bg-gray-100 text-gray-600", zeichen: "–" },
};

/** Ids der Kachel — die Fokusfuehrung nach „Entfernen" und Übermitteln greift darauf zu. */
const kachelIds = (positionId: string) => ({
  titel: `unterlage-${positionId}`,
  dateiFeld: `datei-${positionId}`,
  fristFeld: `gueltig-bis-${positionId}`,
  fristHinweis: `gueltig-bis-hinweis-${positionId}`,
  fristFehler: `gueltig-bis-fehler-${positionId}`,
});
const entfernenKnopfId = (dateiId: string) => `entfernen-${dateiId}`;

interface KachelProps {
  position: OeffentlichePosition;
  nurLesen: boolean;
  beschaeftigt: boolean;
  grenzen: OeffentlicheUnterlagen["grenzen"];
  gueltigBis: string;
  fehler: readonly string[];
  /** Abgelehntes „Gültig bis" — steht unter dem Feld, getrennt von den Datei-Fehlern. */
  datumFehler: string | null;
  onDateien: (dateien: File[]) => void;
  onEntfernen: (datei: OeffentlicheDatei) => void;
  onGueltigBis: (wert: string) => void;
  onGueltigBisVerlassen: (wert: string) => void;
}

function PositionKachel({
  position,
  nurLesen,
  beschaeftigt,
  grenzen,
  gueltigBis,
  fehler,
  datumFehler,
  onDateien,
  onEntfernen,
  onGueltigBis,
  onGueltigBisVerlassen,
}: KachelProps) {
  const ids = kachelIds(position.id);
  const offen = istOffen(position) && !nurLesen;
  const aussehen = AUSSEHEN[position.stand] ?? AUSSEHEN.OFFEN;
  const platzFrei = position.entwuerfe.length < grenzen.maxDateienJePosition;

  return (
    <section
      aria-labelledby={ids.titel}
      className={`rounded-xl border p-4 shadow-sm sm:p-5 ${aussehen.karte}`}
      data-position={position.id}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${aussehen.kreis}`}
        >
          {aussehen.zeichen}
        </span>
        <div className="min-w-0 flex-1">
          {/* tabIndex -1: letzter Halt der Fokusfuehrung nach „Entfernen". */}
          <h2 id={ids.titel} tabIndex={-1} className="break-words text-base font-semibold text-foreground outline-none">
            {position.bezeichnung}
          </h2>
          <span
            className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${aussehen.pille}`}
            data-stand={position.stand}
          >
            {position.standText}
          </span>
        </div>
      </div>

      {position.hinweis && (
        <p className="mt-3 whitespace-pre-line break-words text-sm text-muted-foreground" data-hinweis>
          {position.hinweis}
        </p>
      )}

      {/* Immer, ausser die Unterlage entfaellt (P:1457): Auch nach dem Übermitteln
          und nach der Annahme fehlt das Original noch — das Portal verfolgt es nicht. */}
      {position.originalErforderlich && position.stand !== "ENTFAELLT" && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-original>
          {UPLOAD_SEITE_TEXTE.ORIGINAL}
        </p>
      )}

      {/* Die Begruendung steht auch dann noch da, wenn schon neue Dateien bereitliegen. */}
      {position.begruendung && offen && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-begruendung>
          <p>{UPLOAD_SEITE_TEXTE.ZURUECKGEWIESEN}</p>
          <p className="mt-1 whitespace-pre-line break-words italic">{position.begruendung}</p>
        </div>
      )}

      {position.entwuerfe.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-card" aria-label={`Bereit zum Übermitteln: ${position.bezeichnung}`}>
          {position.entwuerfe.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-1 pl-3 pr-1" data-datei={d.id}>
              <span className="min-w-0 break-all text-sm text-foreground">
                {d.name} <span className="whitespace-nowrap text-xs text-muted-foreground">· {formatBytes(d.groesse)}</span>
              </span>
              {offen && (
                <button
                  id={entfernenKnopfId(d.id)}
                  type="button"
                  onClick={() => onEntfernen(d)}
                  disabled={beschaeftigt}
                  aria-label={`${d.name} entfernen`}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  Entfernen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {position.fristpflichtig && offen && (
        <div className="mt-3">
          <label htmlFor={ids.fristFeld} className="mb-1 block text-sm font-medium text-foreground">
            {UPLOAD_SEITE_TEXTE.GUELTIG_BIS_LABEL}
          </label>
          <input
            id={ids.fristFeld}
            type="date"
            value={gueltigBis}
            onChange={(e) => onGueltigBis(e.target.value)}
            onBlur={(e) => onGueltigBisVerlassen(e.currentTarget.value)}
            aria-invalid={datumFehler ? true : undefined}
            aria-describedby={datumFehler ? `${ids.fristFehler} ${ids.fristHinweis}` : ids.fristHinweis}
            className={`min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-base text-foreground outline-none focus:ring-1 sm:w-auto sm:text-sm ${
              datumFehler ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-input focus:border-ring focus:ring-ring"
            }`}
          />
          {datumFehler && (
            <p id={ids.fristFehler} role="alert" className="mt-1 break-words text-sm text-red-800" data-datum-fehler>
              {datumFehler}
            </p>
          )}
          <p id={ids.fristHinweis} className="mt-1 text-xs text-muted-foreground">
            {UPLOAD_SEITE_TEXTE.GUELTIG_BIS_HINWEIS}
          </p>
        </div>
      )}

      {/* Voll: Statt des Dateifelds steht da, warum keins mehr da ist — auch
          nach einem Neuladen, nicht nur nach einer abgewiesenen elften Datei. */}
      {offen && !platzFrei && (
        <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground" data-voll>
          {MELDUNGEN.ZU_VIELE_DATEIEN_POSITION} {UPLOAD_SEITE_TEXTE.VOLL_ENTFERNEN}
        </p>
      )}

      {/* Das Feld selbst ist unsichtbar, das Label ist der Knopf. Kein `capture`:
          So bietet das Handy Kamera UND Dateiauswahl an (5.4). */}
      {offen && platzFrei && (
        <div className="mt-3">
          <input
            id={ids.dateiFeld}
            type="file"
            multiple
            accept={grenzen.accept}
            disabled={beschaeftigt}
            onChange={(e) => {
              const dateien = Array.from(e.target.files ?? []);
              e.target.value = "";
              onDateien(dateien);
            }}
            className="peer sr-only"
          />
          <label
            htmlFor={ids.dateiFeld}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-amber-700 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:w-auto sm:justify-start"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="break-words">{dateiFeldLabel(position.bezeichnung)}</span>
          </label>
        </div>
      )}

      {fehler.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-fehler>
          <ul className="space-y-1">
            {fehler.map((f, i) => (
              <li key={i} className="break-words">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// =============================================
// Hilfen der Seite
// =============================================

interface Bestaetigung {
  uebermittelt: string[];
  /** Davon Schriftform: Der Scan allein genuegt nicht, das Original fehlt noch. */
  original: string[];
  offen: string[];
  /** Doppelklick oder zweiter Tab: Es war schon alles uebermittelt. */
  nichtsNeues: boolean;
}

function bestaetigungBauen(vorher: OeffentlichePosition[], stand: OeffentlicheUnterlagen, anzahl: number): Bestaetigung {
  const jetztUebermittelt = new Set(stand.positionen.filter((p) => p.stand === "UEBERMITTELT").map((p) => p.id));
  const eben = vorher.filter((p) => p.stand === "BEREIT" && jetztUebermittelt.has(p.id));
  return {
    uebermittelt: eben.map((p) => p.bezeichnung),
    original: eben.filter((p) => p.originalErforderlich).map((p) => p.bezeichnung),
    offen: stand.positionen.filter(istOffen).map((p) => p.bezeichnung),
    nichtsNeues: anzahl === 0,
  };
}

/** Grund, warum eine Datei gar nicht erst gesendet wird — oder `null`. */
function dateiVorpruefen(datei: File, grenzen: OeffentlicheUnterlagen["grenzen"]): string | null {
  const typ = (datei.type || "").toLowerCase();
  const typOk = !!typ && grenzen.accept.split(",").some((t) => t.trim() === typ);
  const endungOk = ERLAUBTE_ENDUNGEN.some((e) => datei.name.toLowerCase().endsWith(e));
  if (!typOk && !endungOk) return MELDUNGEN.DATEITYP_NICHT_ERLAUBT;
  if (datei.size > grenzen.maxDateiBytes) return MELDUNGEN.DATEI_ZU_GROSS;
  if (datei.size === 0) return MELDUNGEN.DATEI_UNVOLLSTAENDIG;
  return null;
}

/** Hebt ein Datum im fertigen Satz des Servers hervor, ohne den Satz selbst zu bauen. */
function mitHervorhebung(satz: string, teil: string): ReactNode {
  const i = teil ? satz.indexOf(teil) : -1;
  if (i < 0) return satz;
  return (
    <>
      {satz.slice(0, i)}
      <strong className="font-bold">{teil}</strong>
      {satz.slice(i + teil.length)}
    </>
  );
}

const JSON_KOPF = { "Content-Type": "application/json" };

// =============================================
// Komponente
// =============================================

export interface UploadSeiteProps {
  token: string;
}

export function UploadSeite({ token }: UploadSeiteProps) {
  const [laedt, setLaedt] = useState(true);
  const [sperre, setSperre] = useState<Sperre | null>(null);
  const [daten, setDaten] = useState<OeffentlicheUnterlagen | null>(null);
  /** Getipptes „Gültig bis" je Unterlage, solange es nicht gespeichert ist. */
  const [eingaben, setEingaben] = useState<Record<string, string>>({});
  /** Fehler je Unterlage — bleiben bis zur naechsten Aktion dort stehen. */
  const [fehlerJePosition, setFehlerJePosition] = useState<Record<string, string[]>>({});
  /**
   * Abgelehntes „Gültig bis" je Unterlage. Der Ref spiegelt den Zustand, weil
   * Übermitteln ihn NACH dem Abwarten einer laufenden Speicherung liest — der
   * Zustand in seiner Closure waere dann veraltet.
   */
  const [datumFehler, setDatumFehlerZustand] = useState<Record<string, string>>({});
  const datumFehlerRef = useRef<Record<string, string>>({});
  /** Fehler beim Übermitteln (betrifft keine einzelne Unterlage). */
  const [seitenMeldung, setSeitenMeldung] = useState<string | null>(null);
  /** Was gerade laeuft („… wird hochgeladen (Datei 2 von 3)") — steht im Balken. */
  const [fortschritt, setFortschritt] = useState<string | null>(null);
  /** 429: Hinweis, solange die Seite `Retry-After` abwartet. */
  const [warteHinweis, setWarteHinweis] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [bestaetigung, setBestaetigung] = useState<Bestaetigung | null>(null);

  // Nur ein GET beim Oeffnen: Im StrictMode ruft React Effekte doppelt auf.
  const geladenFuer = useRef<string | null>(null);
  // Doppelklick-Schutz fuer Hochladen, Entfernen und Übermitteln.
  const laeuftRef = useRef(false);
  // Laufende Speicherungen von „Gültig bis": Übermitteln wartet sie ab. Wer
  // das Feld verlaesst, indem er auf „Unterlagen übermitteln" tippt, loest
  // beides zugleich aus — kaeme der PATCH nach der Übermittlung an, meldete er
  // an einer uebermittelten Unterlage „nicht mehr offen".
  const speicherungenRef = useRef(new Set<Promise<void>>());
  const aktivRef = useRef(true);
  const bestaetigungRef = useRef<HTMLElement>(null);
  // Wohin der Fokus nach der laufenden Aktion geht (Ids, das erste vorhandene
  // gewinnt). Erst NACH der Aktion: Solange sie laeuft, sind Knoepfe und
  // Dateifeld gesperrt und nehmen keinen Fokus an.
  const fokusDanachRef = useRef<string[] | null>(null);

  useEffect(() => {
    aktivRef.current = true;
    return () => {
      aktivRef.current = false;
    };
  }, []);

  useEffect(() => {
    const ziele = fokusDanachRef.current;
    if (beschaeftigt || !ziele) return;
    fokusDanachRef.current = null;
    for (const id of ziele) {
      const element = document.getElementById(id);
      if (element) {
        element.focus();
        return;
      }
    }
  }, [beschaeftigt]);

  const datumFehlerAendern = (aendern: (alt: Record<string, string>) => Record<string, string>) => {
    datumFehlerRef.current = aendern(datumFehlerRef.current);
    setDatumFehlerZustand(datumFehlerRef.current);
  };

  const datumFehlerSetzen = (positionId: string, text: string | null) =>
    datumFehlerAendern((alt) => {
      if (text === null && !(positionId in alt)) return alt;
      const neu = { ...alt };
      if (text === null) delete neu[positionId];
      else neu[positionId] = text;
      return neu;
    });

  /** Eine Anfrage an die oeffentliche API; bei 429 wartet sie `Retry-After` ab und wiederholt. */
  const senden = useCallback(
    async (pfad: string, init: RequestInit): Promise<Antwort> => {
      const url = `${API_BASIS}/${encodeURIComponent(token)}${pfad}`;
      for (let versuch = 0; ; versuch++) {
        const antwort = await einmalSenden(url, init);
        if (antwort.status !== 429 || versuch >= MAX_WIEDERHOLUNGEN || !aktivRef.current) return antwort;
        setWarteHinweis(`${MELDUNGEN.ZU_VIELE_ANFRAGEN} Neuer Versuch in ${sekundenText(antwort.retryAfterS)}.`);
        await warte(antwort.retryAfterS * 1000);
        setWarteHinweis(null);
        if (!aktivRef.current) return antwort;
      }
    },
    [token],
  );

  /** Laedt den Stand. Beim Oeffnen fuehrt jeder Fehler zur Fehlerseite, spaeter nur ein toter Link. */
  const laden = useCallback(
    async (beimOeffnen: boolean) => {
      const antwort = await senden("", { method: "GET" });
      if (!aktivRef.current) return;
      const stand = antwort.status === 200 ? standAus(antwort.body) : null;
      if (stand) {
        setDaten(stand);
        setSperre(null);
      } else if (beimOeffnen || istLinkSperre(antwort.status, fehlerAus(antwort.body).grund)) {
        setSperre(sperreAus(antwort.status, antwort.body));
      }
      if (beimOeffnen) setLaedt(false);
    },
    [senden],
  );

  useEffect(() => {
    if (geladenFuer.current === token) return;
    geladenFuer.current = token;
    void laden(true);
  }, [laden, token]);

  // Nach dem Übermitteln springt der Fokus auf die Bestaetigung (5.4).
  useEffect(() => {
    if (bestaetigung) bestaetigungRef.current?.focus();
  }, [bestaetigung]);

  const fehlerSetzen = (positionId: string, fehler: string[]) =>
    setFehlerJePosition((alt) => ({ ...alt, [positionId]: fehler }));

  /** Antwort auf eine Position uebernehmen — das eigene „Gültig bis" bleibt (es aendert nur der PATCH). */
  const positionUebernehmen = (neu: OeffentlichePosition) =>
    setDaten((d) =>
      d && {
        ...d,
        positionen: d.positionen.map((p) => (p.id === neu.id ? { ...neu, gueltigBisAngabe: p.gueltigBisAngabe } : p)),
      },
    );

  /**
   * Stellt die Seite um, wenn die Antwort das verlangt. `null` = nichts
   * umgestellt, sonst hoert der Aufrufer auf:
   *   - toter Link → Fehlerseite (`"fertig"`);
   *   - alles geprueft → sofort nur lesen und danach neu laden (`"neu-laden"`).
   *     HR hat inzwischen entschieden: Eine Unterlage mit Entwuerfen kann
   *     entfallen sein (die Entwuerfe sind dann geloescht, EP-2), eine
   *     uebermittelte angenommen. Ohne GET zeigten die Kacheln einen Stand, den
   *     es nicht mehr gibt. Scheitert das GET, bleibt wenigstens „nur lesen".
   */
  const seiteUmgestellt = (antwort: Antwort): "fertig" | "neu-laden" | null => {
    const f = fehlerAus(antwort.body);
    if (istLinkSperre(antwort.status, f.grund)) {
      setSperre(sperreAus(antwort.status, antwort.body));
      return "fertig";
    }
    if (antwort.status === 409 && f.grund === "ALLES_GEPRUEFT") {
      setDaten((d) => d && { ...d, readOnly: true, meldung: f.text ?? MELDUNGEN.ALLES_GEPRUEFT });
      // Fehler an Dateien und Daten sind ab jetzt gegenstandslos.
      setFehlerJePosition({});
      datumFehlerAendern(() => ({}));
      return "neu-laden";
    }
    return null;
  };

  /**
   * Hochladen, Entfernen und Übermitteln laufen nie gleichzeitig: Jede Antwort
   * bringt den ganzen Stand einer Unterlage mit, und eine spaet eintreffende
   * aeltere Antwort ueberschriebe sonst eine neuere. Liefert `fn` true, ist der
   * Stand veraltet und wird neu geladen.
   */
  const exklusiv = async (text: string, fn: () => Promise<boolean>) => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setBeschaeftigt(true);
    setSeitenMeldung(null);
    setBestaetigung(null);
    setFortschritt(text);
    let neuLaden = false;
    try {
      neuLaden = await fn();
    } finally {
      laeuftRef.current = false;
      setBeschaeftigt(false);
      setFortschritt(null);
    }
    if (neuLaden && aktivRef.current) await laden(false);
  };

  const dateienHochladen = (position: OeffentlichePosition, dateien: File[]) => {
    if (!daten || daten.readOnly || dateien.length === 0) return;
    const grenzen = daten.grenzen;
    void exklusiv("Dateien werden geprüft …", async () => {
      const fehler: string[] = [];
      const zeigen = () => fehlerSetzen(position.id, [...fehler]);

      // Vorpruefung ohne Anfrage: Typ, Groesse, Zahl je Unterlage.
      const zuSenden: File[] = [];
      for (const datei of dateien) {
        const grund =
          dateiVorpruefen(datei, grenzen) ??
          (position.entwuerfe.length + zuSenden.length >= grenzen.maxDateienJePosition
            ? MELDUNGEN.ZU_VIELE_DATEIEN_POSITION
            : null);
        if (grund) fehler.push(`${datei.name}: ${grund}`);
        else zuSenden.push(datei);
      }
      zeigen();

      // Eine Datei je Anfrage, nacheinander.
      for (let i = 0; i < zuSenden.length; i++) {
        const datei = zuSenden[i];
        setFortschritt(`${datei.name} wird hochgeladen (Datei ${i + 1} von ${zuSenden.length}) …`);
        const formular = new FormData();
        formular.append("datei", datei);
        const antwort = await senden(`/positionen/${encodeURIComponent(position.id)}/dateien`, {
          method: "POST",
          body: formular,
        });
        if (!aktivRef.current) return false;
        const neu = antwort.status === 201 ? positionAus(antwort.body) : null;
        if (neu) {
          positionUebernehmen(neu);
          continue;
        }
        const umgestellt = seiteUmgestellt(antwort);
        if (umgestellt) return umgestellt === "neu-laden";
        const f = fehlerAus(antwort.body);
        fehler.push(`${datei.name}: ${fehlerText(antwort.status, f.text)}`);
        // Leer, zu gross, falscher Typ betreffen nur diese Datei — weiter mit der naechsten.
        if (antwort.status === 400 || antwort.status === 413 || antwort.status === 415) {
          zeigen();
          continue;
        }
        const rest = zuSenden.slice(i + 1).map((d) => d.name);
        if (rest.length > 0) fehler.push(`Nicht hochgeladen: ${rest.join(", ")}.`);
        zeigen();
        return standVeraltet(antwort.status, f.grund);
      }
      return false;
    });
  };

  const dateiEntfernen = (position: OeffentlichePosition, datei: OeffentlicheDatei) => {
    if (!daten || daten.readOnly) return;
    void exklusiv(`${datei.name} wird entfernt …`, async () => {
      fehlerSetzen(position.id, []);
      const antwort = await senden(`/dateien/${encodeURIComponent(datei.id)}`, { method: "DELETE" });
      if (!aktivRef.current) return false;
      const neu = antwort.status === 200 ? positionAus(antwort.body) : null;
      if (neu) {
        positionUebernehmen(neu);
        // Der Knopf verschwindet mit seiner Zeile — ohne Fuehrung fiele der
        // Fokus auf <body>, und wer mit Tastatur oder Screenreader arbeitet,
        // muesste die Seite von oben neu durchgehen. Ziel: die naechste Datei
        // derselben Unterlage, sonst die vorige, sonst ihr Dateifeld.
        const stelle = position.entwuerfe.findIndex((d) => d.id === datei.id);
        const nachbar = stelle >= 0 ? (neu.entwuerfe[stelle] ?? neu.entwuerfe[stelle - 1]) : undefined;
        const ids = kachelIds(position.id);
        fokusDanachRef.current = [...(nachbar ? [entfernenKnopfId(nachbar.id)] : []), ids.dateiFeld, ids.titel];
        return false;
      }
      const umgestellt = seiteUmgestellt(antwort);
      if (umgestellt) return umgestellt === "neu-laden";
      const f = fehlerAus(antwort.body);
      fehlerSetzen(position.id, [`${datei.name}: ${fehlerText(antwort.status, f.text)}`]);
      return standVeraltet(antwort.status, f.grund);
    });
  };

  /** „Gültig bis" beim Verlassen des Feldes zwischenspeichern — nur, wenn es sich geaendert hat. */
  const gueltigBisSpeichern = async (position: OeffentlichePosition, wert: string) => {
    if (!daten || daten.readOnly || wert === (position.gueltigBisAngabe ?? "")) return;
    datumFehlerSetzen(position.id, null);
    const antwort = await senden(`/positionen/${encodeURIComponent(position.id)}`, {
      method: "PATCH",
      headers: JSON_KOPF,
      body: JSON.stringify({ gueltigBis: wert || null }),
    });
    if (!aktivRef.current) return;
    const neu = antwort.status === 200 ? positionAus(antwort.body) : null;
    if (neu) {
      setDaten((d) =>
        d && {
          ...d,
          positionen: d.positionen.map((p) => (p.id === neu.id ? { ...p, gueltigBisAngabe: neu.gueltigBisAngabe } : p)),
        },
      );
      // Die Eingabe bleibt nur stehen, wenn inzwischen weitergetippt wurde.
      setEingaben((alt) => {
        if (alt[neu.id] !== wert) return alt;
        const rest = { ...alt };
        delete rest[neu.id];
        return rest;
      });
      return;
    }
    const umgestellt = seiteUmgestellt(antwort);
    if (umgestellt) {
      if (umgestellt === "neu-laden") await laden(false);
      return;
    }
    const f = fehlerAus(antwort.body);
    const text = fehlerText(antwort.status, f.text);
    // 400 = das Datum selbst: unter das Feld. Alles andere (nicht mehr offen,
    // entfaellt, Verbindung) betrifft die Unterlage.
    if (antwort.status === 400) datumFehlerSetzen(position.id, text);
    else fehlerSetzen(position.id, [text]);
    if (standVeraltet(antwort.status, f.grund)) await laden(false);
  };

  const gueltigBisVerlassen = (position: OeffentlichePosition, wert: string) => {
    const lauf: Promise<void> = gueltigBisSpeichern(position, wert).finally(() => {
      speicherungenRef.current.delete(lauf);
    });
    speicherungenRef.current.add(lauf);
  };

  const uebermitteln = () => {
    if (!daten || daten.readOnly) return;
    const vorher = daten.positionen;
    // „Gültig bis" jeder bereiten Unterlage mit Ablaufdatum geht mit — leer heisst unbefristet.
    const gueltigBis: Record<string, string | null> = {};
    for (const p of vorher) {
      if (p.stand === "BEREIT" && p.fristpflichtig) gueltigBis[p.id] = (eingaben[p.id] ?? p.gueltigBisAngabe ?? "") || null;
    }
    // Nur ein noch nicht gespeichertes Datum kann ein 400 des Servers meinen —
    // die Antwort nennt keine Unterlage.
    const ungespeichert = vorher.filter(
      (p) => p.id in gueltigBis && (gueltigBis[p.id] ?? "") !== (p.gueltigBisAngabe ?? ""),
    );
    void exklusiv("Unterlagen werden übermittelt …", async () => {
      await Promise.all([...speicherungenRef.current]);
      if (!aktivRef.current) return false;
      // Ein abgelehntes Datum ginge sonst noch einmal mit, und der Server wiese
      // die GANZE Übermittlung ab. Statt zu senden: zum Feld.
      const abgelehnt = vorher.filter((p) => p.id in gueltigBis && datumFehlerRef.current[p.id]);
      if (abgelehnt.length > 0) {
        setSeitenMeldung(ablaufdatumPruefenText(abgelehnt.map((p) => p.bezeichnung)));
        fokusDanachRef.current = [kachelIds(abgelehnt[0].id).fristFeld];
        return false;
      }
      const antwort = await senden("/uebermitteln", {
        method: "POST",
        headers: JSON_KOPF,
        body: JSON.stringify(Object.keys(gueltigBis).length > 0 ? { gueltigBis } : {}),
      });
      if (!aktivRef.current) return false;
      const ergebnis = antwort.status === 200 ? uebermittelnAus(antwort.body) : null;
      if (ergebnis) {
        setDaten(ergebnis.stand);
        setEingaben((alt) => {
          const rest = { ...alt };
          for (const id of Object.keys(gueltigBis)) delete rest[id];
          return rest;
        });
        setFehlerJePosition({});
        datumFehlerAendern(() => ({}));
        setBestaetigung(bestaetigungBauen(vorher, ergebnis.stand, ergebnis.uebermittelt));
        return false;
      }
      const umgestellt = seiteUmgestellt(antwort);
      if (umgestellt) return umgestellt === "neu-laden";
      const f = fehlerAus(antwort.body);
      const text = fehlerText(antwort.status, f.text);
      setSeitenMeldung(text);
      // Abgewiesenes Datum: der Text auch an den Feldern, die es betreffen kann.
      if (antwort.status === 400 && ungespeichert.length > 0) {
        datumFehlerAendern((alt) => {
          const neu = { ...alt };
          for (const p of ungespeichert) neu[p.id] = text;
          return neu;
        });
        fokusDanachRef.current = [kachelIds(ungespeichert[0].id).fristFeld];
      }
      return standVeraltet(antwort.status, f.grund);
    });
  };

  // ---- Laden ----
  if (laedt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="text-center" role="status">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{warteHinweis ?? UPLOAD_SEITE_TEXTE.LADEN}</p>
        </div>
      </div>
    );
  }

  // ---- Fehlerseite (ungueltig, ersetzt, abgelaufen, zurueckgezogen, eingestellt, Laden gescheitert) ----
  if (sperre || !daten) {
    const s = sperre ?? sperreAus(200, null);
    return (
      <SperrSeite
        sperre={s}
        onErneut={() => {
          setSperre(null);
          setLaedt(true);
          void laden(true);
        }}
      />
    );
  }

  // ---- Unterlagen ----
  const heute = heuteInBerlin();
  const nurLesen = daten.readOnly;
  const kopfzeile = [daten.name, daten.einrichtung.trim()].filter(Boolean).join(" · ");
  const bereiteNamen = daten.positionen.filter((p) => p.stand === "BEREIT").map((p) => p.bezeichnung);
  const anzahlBereit = bereiteNamen.length;
  const zeigeBalken = !nurLesen && daten.positionen.some(istOffen);
  // Countdown nur vor der Frist (der Server nennt das Linkende erst danach).
  const countdown =
    !daten.linkGueltigBis && istKalendertag(daten.frist) ? fristCountdown(tageZwischen(heute, daten.frist)) : null;
  const hervorgehoben = daten.linkGueltigBis ? formatKalendertagLang(daten.linkGueltigBis) : daten.fristLang;
  const einrichtung = daten.einrichtung.trim();

  return (
    <div className={`flex min-h-screen flex-col bg-muted ${zeigeBalken ? "pb-52 sm:pb-32" : ""}`}>
      {/* Kopf */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/credo_logo.svg" alt="CREDO" width={100} height={33} priority />
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-foreground">HR-Portal</p>
              <p className="text-xs text-muted-foreground">Unterlagen nachreichen</p>
            </div>
          </div>
          {daten.vorgangsnummer && (
            <span
              className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              data-vorgangsnummer
            >
              Vorgang <span className="font-mono">{daten.vorgangsnummer}</span>
            </span>
          )}
        </div>
        <CredoLinie height={2} />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Unterlagen nachreichen</h1>
        {kopfzeile && (
          <p className="mt-1 break-words text-sm text-muted-foreground" data-kopfzeile>
            {kopfzeile}
          </p>
        )}

        {nurLesen && (
          <div role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {daten.meldung ?? MELDUNGEN.ALLES_GEPRUEFT}
          </div>
        )}

        {/* Ist nichts mehr offen, gibt es auch keine Frist mehr zu nennen — nur den Stand. */}
        {!nurLesen && !zeigeBalken && !bestaetigung && (
          <p
            className="mt-4 rounded-xl border border-[#009AC6]/30 bg-[#009AC6]/5 px-4 py-3 text-sm text-foreground"
            data-alles-uebermittelt
          >
            {UPLOAD_SEITE_TEXTE.ALLES_UEBERMITTELT}
          </p>
        )}

        {zeigeBalken && (
          <div className="mt-4 rounded-xl border border-[#FBC900]/60 bg-[#FBC900]/10 px-4 py-3" data-fristkasten>
            <p className="text-sm text-foreground">{mitHervorhebung(daten.fristSatz, hervorgehoben)}</p>
            {countdown && (
              <p className="mt-0.5 text-xs text-muted-foreground" data-countdown>
                {countdown}
              </p>
            )}
          </div>
        )}

        {bestaetigung && (
          <section
            ref={bestaetigungRef}
            tabIndex={-1}
            aria-labelledby="bestaetigung-titel"
            className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            data-bestaetigung
          >
            <h2 id="bestaetigung-titel" className="text-base font-bold text-green-800">
              {bestaetigung.nichtsNeues
                ? "Ihre Unterlagen sind bereits übermittelt."
                : "Vielen Dank – Ihre Unterlagen sind übermittelt."}
            </h2>
            {bestaetigung.uebermittelt.length > 0 && (
              <p className="mt-1 break-words">Übermittelt: {bestaetigung.uebermittelt.join(", ")}.</p>
            )}
            {/* Wer den Scan uebermittelt hat, haelt sich sonst genau hier fuer fertig. */}
            {bestaetigung.original.length > 0 && (
              <p className="mt-1 break-words font-medium" data-original-bestaetigung>
                {originalBestaetigungText(bestaetigung.original)}
              </p>
            )}
            {bestaetigung.offen.length > 0 ? (
              <p className="mt-1 break-words" data-noch-offen>
                Noch offen: {bestaetigung.offen.join(", ")}. Diese Unterlagen können Sie später über denselben Link
                hochladen und übermitteln.
              </p>
            ) : (
              <p className="mt-1">{UPLOAD_SEITE_TEXTE.PRUEFUNG}</p>
            )}
          </section>
        )}

        {daten.nachricht && (
          <section aria-labelledby="nachricht-titel" className="mt-4 rounded-xl border bg-card p-4 shadow-sm">
            <h2 id="nachricht-titel" className="text-sm font-semibold text-foreground">
              Nachricht der Personalabteilung
            </h2>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground" data-nachricht>
              {daten.nachricht}
            </p>
          </section>
        )}

        {zeigeBalken && (
          <p className="mt-4 text-sm text-muted-foreground" data-erklaerung>
            Sie können zu jeder Unterlage mehrere Dateien hochladen, zum Beispiel Vorder- und Rückseite – als PDF,
            JPG, PNG oder WebP, höchstens {formatBytes(daten.grenzen.maxDateiBytes)} je Datei. Die
            Personalabteilung sieht Ihre Dateien erst, wenn Sie „{UPLOAD_SEITE_TEXTE.UEBERMITTELN}“ wählen. Bis
            dahin können Sie sie wieder entfernen. {UPLOAD_SEITE_TEXTE.NACH_DEM_UEBERMITTELN}
          </p>
        )}

        {/* Ohne Balken (nach einem Neuladen ist nichts mehr offen) steht die Meldung hier. */}
        {seitenMeldung && !zeigeBalken && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {seitenMeldung}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {daten.positionen.map((p) => (
            <PositionKachel
              key={p.id}
              position={p}
              nurLesen={nurLesen}
              beschaeftigt={beschaeftigt}
              grenzen={daten.grenzen}
              gueltigBis={eingaben[p.id] ?? p.gueltigBisAngabe ?? ""}
              fehler={fehlerJePosition[p.id] ?? []}
              datumFehler={datumFehler[p.id] ?? null}
              onDateien={(dateien) => dateienHochladen(p, dateien)}
              onEntfernen={(datei) => dateiEntfernen(p, datei)}
              onGueltigBis={(wert) => {
                setEingaben((alt) => ({ ...alt, [p.id]: wert }));
                // Ein geaendertes Datum ist ein neuer Versuch — der alte Fehler gilt nicht mehr.
                datumFehlerSetzen(p.id, null);
              }}
              onGueltigBisVerlassen={(wert) => gueltigBisVerlassen(p, wert)}
            />
          ))}
          {daten.positionen.length === 0 && (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              Es sind keine Unterlagen angefordert.
            </p>
          )}
        </div>
      </main>

      {/* Fusszeile: verantwortliche Stelle, Datenschutz, Hinweise zum Link */}
      <footer className="border-t bg-card px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground" data-fusszeile="hinweise">
            {UPLOAD_SEITE_TEXTE.LINK_PERSOENLICH} {UPLOAD_SEITE_TEXTE.KEINE_EMAIL}
          </p>
          <p data-fusszeile="verantwortliche-stelle">Verantwortliche Stelle: {daten.verantwortlicheStelle}.</p>
          <p data-fusszeile="datenschutz">{UPLOAD_SEITE_TEXTE.DATENSCHUTZ}</p>
          <p data-fusszeile="einrichtung">
            © {heute.slice(0, 4)}
            {einrichtung ? ` ${einrichtung}` : ""}
          </p>
        </div>
      </footer>

      {/* Fester Balken unten: Stand und „Unterlagen übermitteln" */}
      {zeigeBalken && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.06)]" data-balken>
          <div className="mx-auto max-w-2xl px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {seitenMeldung && (
              <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {seitenMeldung}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p aria-live="polite" className="text-sm font-medium text-foreground" data-balken-stand>
                  {warteHinweis ?? fortschritt ?? bereitText(anzahlBereit)}
                </p>
                {/* Übermitteln ist fuer diese Unterlagen endgueltig — deshalb die Namen VOR dem Tippen. */}
                {anzahlBereit > 0 && (
                  <p id="balken-bereit" className="mt-0.5 break-words text-xs text-muted-foreground" data-balken-bereit>
                    {bereitNamenText(bereiteNamen)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={uebermitteln}
                aria-describedby={anzahlBereit > 0 ? "balken-bereit" : undefined}
                disabled={beschaeftigt || anzahlBereit === 0}
                className="min-h-11 rounded-lg bg-credo-gruen px-5 text-sm font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50 sm:shrink-0"
              >
                {UPLOAD_SEITE_TEXTE.UEBERMITTELN}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
