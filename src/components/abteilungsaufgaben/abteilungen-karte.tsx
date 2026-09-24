"use client";

/**
 * Karte „Aufgaben für Abteilungen" (Paket 1b, modulneutral)
 *
 * Zeigt je Abteilung (und fuer die Fuehrungskraft) den Stand der Aufgaben,
 * die per Link verschickt werden: auch noch nicht informierte, uebersprungene
 * und fehlgeschlagene Abteilungen. Dazu die Aktionen „Abteilungen
 * informieren", „Erinnern", „Erneut senden", „Link kopieren" und „Link
 * erneuern…" (mit Rueckfrage).
 *
 * Die Karte rechnet NICHTS selbst: Zeilen, Pill-Texte, Farben, Hinweise und
 * erlaubte Aktionen kommen fertig vom Server (`abteilungsZeilenBauen` in
 * src/lib/abteilungsaufgaben.ts). So zeigen Karte, Versandbericht und Mail
 * dieselben Begriffe. Die kopierbare Adresse (`link.url`) baut ebenfalls der
 * Server aus APP_URL — nie `window.location`, sonst kopiert HR hinter einem
 * Proxy oder im Dev-Server eine Adresse, die die Abteilung nicht erreicht.
 *
 * Paket 5 (Onboarding) nutzt dieselbe Karte; deshalb steht hier nichts von
 * „Offboarding" — das Bezugsdatum heisst ueber `bezugsdatumLabel`.
 *
 * Nebenbei exportiert: `abteilungsAktionSenden` (ruft die Versandroute und
 * macht aus der Antwort eine Meldung) und `AktionsMeldungen` (gruene/rote
 * Leiste plus gelber Hinweis). Die Detailseite haelt den Zustand, die Karte
 * zeigt ihn an.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MELDUNGEN,
  MODUL_TEXTE,
  type AbteilungsAktion,
  type AbteilungsUebersichtDaten,
  type AbteilungsZeile,
  type AnzeigeFarbe,
  type ErledigtVon,
  type Fuehrungskraft,
} from "@/lib/abteilungsaufgaben";
import { AbteilungenDialog } from "@/components/abteilungsaufgaben/abteilungen-dialog";
import { formatDatumDE } from "@/lib/format";

// =============================================
// Typen
// =============================================

/**
 * Stand der Karte, wie ihn beide Module liefern (`abteilungen` in
 * GET /api/offboarding/[id] und GET /api/onboarding/[id]).
 *
 * Seit Paket 5 ist das EIN Typ aus dem Fundament: Das Onboarding kennt
 * `gesperrt` (Modalitaeten fehlen) und ein `bezugsdatum`, das noch `null` sein
 * darf. Ein eigener Kartentyp daneben hiesse, beide Formen von Hand
 * gleichzuhalten — genau dabei faellt spaeter ein Feld unter den Tisch.
 */
export type AbteilungenKarteDaten = AbteilungsUebersichtDaten;

/** Ergebnis einer Aktion fuer die Leisten ueber der Karte. */
export interface AktionsMeldung {
  /** erfolg = gruene Leiste (201), fehler = rote Leiste (409/502/…). */
  art: "erfolg" | "fehler";
  meldung: string;
  /** Gelbe Leiste, z. B. „Nicht informiert: Führungskraft (…)." */
  hinweis: string | null;
}

export interface AbteilungenKarteProps {
  abteilungen: AbteilungenKarteDaten;
  /** Wirksame Fuehrungskraft — fuer den Zusatz „aus der Zeugnis-Bewertung". */
  fuehrungskraft?: Fuehrungskraft | null;
  /**
   * Steht im Untertitel: „Fälligkeiten richten sich nach dem {…} (TT.MM.JJJJ)."
   * Ohne Wert der Text des Moduls (`MODUL_TEXTE[…].bezugImSatz`).
   */
  bezugsdatumLabel?: string;
  /** Darf die angemeldete Rolle informieren/erinnern? Sonst nur lesen und kopieren. */
  darfAktionen?: boolean;
  /** Vorgang abgebrochen (statt abgeschlossen) — waehlt den Hinweistext. */
  abgebrochen?: boolean;
  /** Zeigt im Leerfall den Link zu den Checklisten-Vorlagen (nur fuer Admins). */
  zeigeVorlagenLink?: boolean;
  /** Fuehrt eine Aktion aus. Die Karte zeigt „Wird gesendet…", bis das Promise fertig ist. */
  onAktion: (aktion: AbteilungsAktion, departmentKey?: string) => Promise<unknown> | void;
  /** Link „Eintragen" in der Zeile der Fuehrungskraft. */
  onFuehrungskraftEintragen?: () => void;
  /** Meldung der letzten Aktion (Zustand haelt die Seite). */
  meldung?: AktionsMeldung | null;
  onMeldungSchliessen?: () => void;
  /**
   * Dialog „Abteilungen informieren" von aussen steuern — der Stepper-Schritt
   * „Checkliste abarbeiten" oeffnet denselben Dialog. Ohne diese beiden Props
   * haelt die Karte den Zustand selbst.
   */
  dialogOffen?: boolean;
  setDialogOffen?: (offen: boolean) => void;
  /** Nur fuer Tests: Bezugszeit fuer die Sperre „Bitte kurz warten". */
  jetzt?: Date;
}

// =============================================
// Kleine Helfer (auch von der Checkliste und der oeffentlichen Seite genutzt)
// =============================================

const BERLIN_DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

const BERLIN_ZEIT = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});

function gueltigesDatum(wert: string | Date | null | undefined): Date | null {
  if (!wert) return null;
  const d = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** „29.07.2027, 10:14" in deutscher Zeit; leer bei fehlendem Wert. */
export function datumUhrzeitDE(wert: string | Date | null | undefined): string {
  const d = gueltigesDatum(wert);
  return d ? BERLIN_DATUM_ZEIT.format(d) : "";
}

/**
 * Wer hat abgehakt — aus `erledigtVon` (beide Module, Server-Ergebnis von
 * `erledigtVonBestimmen`):
 *   LINK   „erledigt von IT-Abteilung (Link) am 29.07.2027, 10:14"
 *   PORTAL „erledigt im Portal von Erika Muster am 29.07.2027, 10:14"
 *   null   „am 29.07.2027" (Altbestand, Urheber unbekannt)
 */
export function erledigtText(item: {
  completedAt: string | null;
  erledigtVon?: ErledigtVon;
}): string {
  const am = item.completedAt ? ` am ${datumUhrzeitDE(item.completedAt)}` : "";
  const von = item.erledigtVon;
  if (von?.art === "LINK") return `erledigt von ${von.name} (Link)${am}`;
  if (von?.art === "PORTAL") return `erledigt im Portal von ${von.name}${am}`;
  return item.completedAt ? `am ${formatDatumDE(item.completedAt)}` : "";
}

/** „2 Aufgaben, 1 offen" / „1 Aufgabe" / „3 Aufgaben". */
export function aufgabenText(aufgaben: { gesamt: number; offen: number }): string {
  if (aufgaben.offen > 0 && aufgaben.offen < aufgaben.gesamt) {
    return `${aufgaben.gesamt} Aufgaben, ${aufgaben.offen} offen`;
  }
  return aufgaben.gesamt === 1 ? "1 Aufgabe" : `${aufgaben.gesamt} Aufgaben`;
}

/** Pill-Farben zu `anzeige.farbe` (Gelb mit dunkler Schrift, sonst kaum lesbar). */
export const PILL_FARBEN: Record<AnzeigeFarbe, string> = {
  gruen: "bg-credo-gruen/10 text-credo-gruen",
  blau: "bg-credo-blau/10 text-credo-blau",
  gelb: "bg-credo-gelb/15 text-amber-800",
  rot: "bg-credo-rot/10 text-credo-rot",
  grau: "bg-gray-100 text-gray-600",
};

/** Hinweise dieser Zustaende sind ein Fehler (rot), alle anderen gelb. */
const ROTE_HINWEISE = new Set(["FEHLGESCHLAGEN", "NICHT_VERSENDET", "ABGELAUFEN"]);

const QUELLEN_TEXT: Record<string, string> = {
  ZEUGNIS: "aus der Zeugnis-Bewertung",
  VERTRAGSENDE: "aus dem Vertragsende",
};

// =============================================
// Aufruf der Versandroute
// =============================================

/**
 * Ruft die Versandroute (POST …/department-links) und macht aus der Antwort
 * eine Meldung fuer die Leisten. „Informieren" schickt `{}`, die anderen
 * Aktionen `{ aktion, departmentKey }`.
 *
 * Der Server liefert `meldung` und `hinweis` fertig (berichtMeldung); bei
 * 409/502 steht der Text zusaetzlich in `error`. Bei 403/404 gibt es nur
 * `error` — der wird angezeigt, nie ein erfundener Ersatztext.
 */
export async function abteilungsAktionSenden(
  url: string,
  aktion: AbteilungsAktion,
  departmentKey?: string,
): Promise<AktionsMeldung> {
  const body = aktion === "informieren" ? {} : { aktion, departmentKey };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { art: "fehler", meldung: "Verbindungsfehler beim Versenden.", hinweis: null };
  }
  const daten = (await res.json().catch(() => null)) as {
    meldung?: unknown;
    hinweis?: unknown;
    error?: unknown;
  } | null;
  const text = (wert: unknown) => (typeof wert === "string" && wert.trim() ? wert : null);
  const hinweis = text(daten?.hinweis);
  if (res.ok) {
    return { art: "erfolg", meldung: text(daten?.meldung) ?? "E-Mail gesendet.", hinweis };
  }
  return {
    art: "fehler",
    meldung: text(daten?.error) ?? text(daten?.meldung) ?? "Die E-Mail konnte nicht gesendet werden.",
    hinweis,
  };
}

// =============================================
// Leisten: Erfolg / Fehler / Hinweis
// =============================================

export function AktionsMeldungen({
  meldung,
  onSchliessen,
}: {
  meldung: AktionsMeldung | null | undefined;
  onSchliessen?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Die Karte kann lang sein: Die Meldung soll nicht ausserhalb des Blicks landen.
  useEffect(() => {
    if (meldung) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [meldung]);

  if (!meldung) return null;
  const erfolg = meldung.art === "erfolg";
  return (
    <div ref={ref} className="space-y-2" data-testid="aktions-meldungen">
      <div
        role={erfolg ? "status" : "alert"}
        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
          erfolg
            ? "border-credo-gruen/30 bg-credo-gruen/10 text-credo-gruen"
            : "border-credo-rot/30 bg-credo-rot/10 text-credo-rot"
        }`}
        data-art={meldung.art}
      >
        <span className="min-w-0 flex-1 break-words">{meldung.meldung}</span>
        {onSchliessen && (
          <button
            type="button"
            onClick={onSchliessen}
            aria-label="Meldung schließen"
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {meldung.hinweis && (
        <div
          role="status"
          className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-sm text-amber-900"
          data-art="hinweis"
        >
          {meldung.hinweis}
        </div>
      )}
    </div>
  );
}

// =============================================
// Karte
// =============================================

export function AbteilungenKarte({
  abteilungen,
  fuehrungskraft = null,
  bezugsdatumLabel,
  darfAktionen = true,
  abgebrochen = false,
  zeigeVorlagenLink = false,
  onAktion,
  onFuehrungskraftEintragen,
  meldung = null,
  onMeldungSchliessen,
  dialogOffen,
  setDialogOffen,
  jetzt,
}: AbteilungenKarteProps) {
  const [laeuft, setLaeuft] = useState<string | null>(null);
  // Ref zusaetzlich zum Zustand: Zwei Klicks vor dem naechsten Rendern
  // saehen beide noch `laeuft === null`.
  const laeuftRef = useRef(false);
  const [erneuernFuer, setErneuernFuer] = useState<AbteilungsZeile | null>(null);
  // Der Dialog laesst sich von aussen steuern (Stepper-Schritt „Checkliste
  // abarbeiten" oeffnet denselben); ohne die Props haelt die Karte ihn selbst.
  const [dialogIntern, setDialogIntern] = useState(false);
  const dialogAn = dialogOffen ?? dialogIntern;
  const dialogSetzen = setDialogOffen ?? setDialogIntern;

  const { zeilen, informierbar, niemandInformiert, vorgangAbgeschlossen, gesperrt } = abteilungen;
  const nurLesen = vorgangAbgeschlossen || !darfAktionen;
  const bezugImSatz = bezugsdatumLabel ?? MODUL_TEXTE[abteilungen.modul].bezugImSatz;
  // Onboarding EXPIRED und Offboarding CANCELLED heissen beide „abgebrochen",
  // lesen sich aber verschieden („abgelaufen" bzw. „wurde abgebrochen").
  const abgebrochenEff = abgebrochen || abteilungen.vorgangAbgebrochen;

  const ausfuehren = async (aktion: AbteilungsAktion, departmentKey?: string) => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setLaeuft(departmentKey ? `${aktion}:${departmentKey}` : aktion);
    try {
      await onAktion(aktion, departmentKey);
    } finally {
      laeuftRef.current = false;
      setLaeuft(null);
    }
  };

  // Gesperrt (Onboarding ohne eingereichte Modalitaeten): Der Knopf bleibt
  // sichtbar, aber grau — sonst suchte HR ihn, statt den Grund zu lesen.
  // `informierbar` ist dann 0 (abteilungsZeilenBauen), deshalb der eigene Zweig.
  const zeigeGesperrtenKnopf = !nurLesen && !!gesperrt && zeilen.length > 0;
  const hauptknopfText =
    nurLesen || (informierbar <= 0 && !zeigeGesperrtenKnopf)
      ? null
      : niemandInformiert || zeigeGesperrtenKnopf
        ? "Abteilungen informieren…"
        : `Weitere Abteilungen informieren (${informierbar})`;

  const bezug = formatDatumDE(abteilungen.bezugsdatum);

  return (
    <section
      aria-labelledby="abteilungen-karte-titel"
      className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id="abteilungen-karte-titel"
            className="flex items-center gap-2 text-sm font-bold text-foreground"
          >
            <span className="h-1 w-1 rounded-full bg-credo-gruen" />
            Aufgaben für Abteilungen
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Aufgaben mit zuständiger Abteilung erhält die Abteilung per Link, ohne Anmeldung.
            Fälligkeiten richten sich nach dem {bezugImSatz}
            {bezug ? ` (${bezug})` : ""}.
          </p>
        </div>
        {hauptknopfText && (
          <button
            type="button"
            onClick={() => dialogSetzen(true)}
            disabled={laeuft !== null || !!gesperrt}
            title={gesperrt?.text}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-credo-gruen px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {laeuft === "informieren" ? "Wird gesendet…" : hauptknopfText}
          </button>
        )}
      </div>

      {/* Voraussetzung fehlt (Onboarding): Grund im Klartext, nicht nur ein
          grauer Knopf. Die Zeilen darunter bleiben als Vorschau stehen. */}
      {gesperrt && !vorgangAbgeschlossen && (
        <p
          className="mb-3 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-xs text-amber-900"
          data-hinweis="gesperrt"
        >
          {gesperrt.text}
        </p>
      )}

      {meldung && (
        <div className="mb-3">
          <AktionsMeldungen meldung={meldung} onSchliessen={onMeldungSchliessen} />
        </div>
      )}

      {vorgangAbgeschlossen && (
        <p className="mb-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {!abgebrochenEff
            ? MELDUNGEN.HR_VORGANG_ABGESCHLOSSEN
            : abteilungen.modul === "ONBOARDING"
              ? MELDUNGEN.HR_VORGANG_ABGELAUFEN
              : MELDUNGEN.HR_VORGANG_ABGEBROCHEN}
        </p>
      )}

      {zeilen.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          {MELDUNGEN.KEINE_ABTEILUNGSAUFGABEN} Zuständigkeiten legen Sie in den{" "}
          {zeigeVorlagenLink ? (
            <Link href="/checklisten" className="font-semibold text-credo-blau underline-offset-2 hover:underline">
              Checklisten-Vorlagen
            </Link>
          ) : (
            "Checklisten-Vorlagen"
          )}{" "}
          fest.
        </p>
      ) : (
        <ul className="space-y-2">
          {zeilen.map((zeile) => (
            <AbteilungsZeileAnzeige
              key={zeile.departmentKey}
              zeile={zeile}
              fuehrungskraft={fuehrungskraft}
              nurLesen={nurLesen}
              laeuft={laeuft}
              onAktion={ausfuehren}
              onLinkErneuern={() => setErneuernFuer(zeile)}
              onFuehrungskraftEintragen={nurLesen ? undefined : onFuehrungskraftEintragen}
              jetzt={jetzt}
            />
          ))}
        </ul>
      )}

      {/* Freitext-Zustaendigkeiten: Sie gehen nie per Link hinaus. Ohne diesen
          Hinweis waere die Aufgabe einfach nicht da — die schlimmste Form von
          „nicht verschickt". */}
      {abteilungen.unbekannteZustaendigkeiten.length > 0 && (
        <p
          className="mt-3 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2 text-xs text-amber-900"
          data-hinweis="unbekannte-zustaendigkeiten"
        >
          Aufgaben mit unbekannter Zuständigkeit (
          {abteilungen.unbekannteZustaendigkeiten.map((t) => `„${t}“`).join(", ")}) werden nicht per
          Link verschickt – bitte in den Checklisten-Vorlagen zuordnen.
        </p>
      )}

      {/* `!nurLesen` auch hier, nicht nur am eigenen Knopf: Der Dialog laesst
          sich von aussen oeffnen (Stepper der Uebersicht). Ohne Recht oder bei
          abgeschlossenem Vorgang endete „Senden" nur in 403 bzw. 409. */}
      {dialogAn && !nurLesen && (
        <AbteilungenDialog
          abteilungen={abteilungen}
          sendet={laeuft === "informieren"}
          onAbbrechen={() => dialogSetzen(false)}
          onSenden={() => {
            void ausfuehren("informieren").then(() => dialogSetzen(false));
          }}
        />
      )}

      {erneuernFuer && (
        <LinkErneuernDialog
          zeile={erneuernFuer}
          onAbbrechen={() => setErneuernFuer(null)}
          onBestaetigen={() => {
            const key = erneuernFuer.departmentKey;
            setErneuernFuer(null);
            void ausfuehren("link-erneuern", key);
          }}
        />
      )}
    </section>
  );
}

// =============================================
// Eine Zeile
// =============================================

function AbteilungsZeileAnzeige({
  zeile,
  fuehrungskraft,
  nurLesen,
  laeuft,
  onAktion,
  onLinkErneuern,
  onFuehrungskraftEintragen,
  jetzt,
}: {
  zeile: AbteilungsZeile;
  fuehrungskraft: Fuehrungskraft | null;
  nurLesen: boolean;
  laeuft: string | null;
  onAktion: (aktion: AbteilungsAktion, departmentKey?: string) => void;
  onLinkErneuern: () => void;
  onFuehrungskraftEintragen?: () => void;
  jetzt?: Date;
}) {
  const [kopiert, setKopiert] = useState(false);
  const [menueOffen, setMenueOffen] = useState(false);
  const menueRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  const { link, anzeige } = zeile;
  const key = zeile.departmentKey;

  // Sperre („Bitte kurz warten") gegen die aktuelle Uhr pruefen und zum Ende
  // der Sperre neu zeichnen — sonst bliebe der Knopf grau, bis jemand neu laedt.
  const sperreBis = gueltigesDatum(zeile.sperreBis);
  const nun = jetzt ?? new Date();
  const gesperrt = !!sperreBis && sperreBis.getTime() > nun.getTime();
  const sperreBisMs = sperreBis?.getTime() ?? null;
  useEffect(() => {
    if (!gesperrt || sperreBisMs === null || jetzt) return;
    const rest = sperreBisMs - Date.now();
    const timer = setTimeout(() => setTick((t) => t + 1), Math.max(rest, 0) + 500);
    return () => clearTimeout(timer);
  }, [gesperrt, sperreBisMs, jetzt]);

  // Menue schliessen bei Klick ausserhalb oder Escape.
  useEffect(() => {
    if (!menueOffen) return;
    const klick = (e: MouseEvent) => {
      if (!menueRef.current?.contains(e.target as Node)) setMenueOffen(false);
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenueOffen(false);
    };
    document.addEventListener("mousedown", klick);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", klick);
      document.removeEventListener("keydown", taste);
    };
  }, [menueOffen]);

  // Der Server sperrt „Erinnern"/„Erneut senden" waehrend der Sperrzeit
  // (aktionen.* = false, aktionen.*Gesperrt = true). Sichtbar bleiben sie
  // trotzdem — grau, mit dem Grund im Tooltip —, damit HR sieht, dass und wann
  // es weitergeht. Die Regel selbst steht nur in abteilungsZeilenBauen.
  const zeigeErinnern = !nurLesen && (zeile.aktionen.erinnern || zeile.aktionen.erinnernGesperrt);
  const zeigeErneut = !nurLesen && (zeile.aktionen.erneutSenden || zeile.aktionen.erneutSendenGesperrt);
  const zeigeErneuern = !nurLesen && zeile.aktionen.linkErneuern;
  const zeigeKopieren = zeile.aktionen.linkKopieren && !!link?.url;
  const sperrTitel = gesperrt && sperreBis
    ? `Bitte kurz warten (bis ${BERLIN_ZEIT.format(sperreBis)} Uhr).`
    : undefined;

  const kopieren = async () => {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zwischenablage (unsicherer Kontext): Die Adresse steht im Tooltip.
    }
  };

  const hinweisRot = ROTE_HINWEISE.has(anzeige.status);
  const quelleText =
    zeile.istFuehrungskraft && fuehrungskraft?.quelle ? QUELLEN_TEXT[fuehrungskraft.quelle] : undefined;

  // --- Sonderfall: Fuehrungskraft ohne Adresse und ohne Link ---
  if (
    zeile.istFuehrungskraft &&
    !link &&
    zeile.empfaenger.grund === "KEINE_FUEHRUNGSKRAFT" &&
    zeile.aufgaben.offen > 0
  ) {
    return (
      <li
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2.5 text-sm"
        data-zeile={key}
        data-art="fuehrungskraft-fehlt"
      >
        <span className="inline-flex rounded-full bg-credo-gelb/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
          {zeile.departmentName}
        </span>
        <span className="min-w-0 flex-1 text-amber-900">
          Keine Führungskraft hinterlegt – bitte im Tab Übersicht eintragen
        </span>
        <span className="text-xs text-amber-900/80">{aufgabenText(zeile.aufgaben)}</span>
        {onFuehrungskraftEintragen && (
          <button
            type="button"
            onClick={onFuehrungskraftEintragen}
            className="text-xs font-semibold text-credo-blau underline-offset-2 hover:underline"
          >
            Eintragen
          </button>
        )}
      </li>
    );
  }

  // --- Sonderfall: uebersprungen (kein Link, Grund) ---
  if (!link && anzeige.status === "UEBERSPRUNGEN") {
    return (
      <li
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-3 py-2.5 text-sm text-amber-900"
        data-zeile={key}
        data-art="uebersprungen"
      >
        <span className="min-w-0 flex-1 break-words">
          {zeile.departmentName} · {anzeige.text}
        </span>
        <span className="text-xs text-amber-900/80">{aufgabenText(zeile.aufgaben)}</span>
      </li>
    );
  }

  const knopf =
    "rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <li className="rounded-lg border border-border bg-muted/30 p-3" data-zeile={key}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex rounded-full bg-credo-blau/10 px-2.5 py-0.5 text-[11px] font-semibold text-credo-blau">
            {zeile.departmentName}
          </span>
          {zeile.email && (
            <span className="break-all text-xs text-muted-foreground">
              {zeile.email}
              {zeile.istFuehrungskraft && zeile.fuehrungskraftName ? ` (${zeile.fuehrungskraftName})` : ""}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            · {aufgabenText(zeile.aufgaben)}
            {/* Die naechste Frist gehoert neben die Zahl: Ohne sie steht „3
                Aufgaben" da, und wie eilig es ist, weiss nur die Abteilung. */}
            {zeile.aufgaben.naechsteFaelligkeit
              ? `, nächste fällig ${formatDatumDE(zeile.aufgaben.naechsteFaelligkeit)}`
              : ""}
          </span>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PILL_FARBEN[anzeige.farbe]}`}
            title={anzeige.status === "FEHLGESCHLAGEN" && anzeige.hinweis ? anzeige.hinweis : undefined}
            data-status={anzeige.status}
          >
            {anzeige.text}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {zeigeErinnern && (
            <button
              type="button"
              onClick={() => onAktion("erinnern", key)}
              disabled={gesperrt || laeuft !== null}
              title={sperrTitel}
              className={knopf}
            >
              {laeuft === `erinnern:${key}` ? "Wird gesendet…" : "Erinnern"}
            </button>
          )}
          {zeigeErneut && (
            <button
              type="button"
              onClick={() => onAktion("erneut-senden", key)}
              disabled={gesperrt || laeuft !== null}
              title={sperrTitel}
              className={knopf}
            >
              {laeuft === `erneut-senden:${key}` ? "Wird gesendet…" : "Erneut senden"}
            </button>
          )}
          {zeigeKopieren && (
            <button type="button" onClick={kopieren} title={link?.url} className={knopf}>
              {kopiert ? <span className="text-credo-gruen">Kopiert!</span> : "Link kopieren"}
            </button>
          )}
          {zeigeErneuern && (
            <div className="relative" ref={menueRef}>
              <button
                type="button"
                onClick={() => setMenueOffen((o) => !o)}
                aria-label={`Weitere Aktionen für ${zeile.departmentName}`}
                aria-haspopup="menu"
                aria-expanded={menueOffen}
                disabled={laeuft !== null}
                className={knopf}
              >
                {laeuft === `link-erneuern:${key}` ? "Wird gesendet…" : "…"}
              </button>
              {menueOffen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenueOffen(false);
                      onLinkErneuern();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    Link erneuern…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(anzeige.zusatz || quelleText) && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {[quelleText, anzeige.zusatz].filter(Boolean).join(" · ")}
        </p>
      )}

      {anzeige.hinweis && (
        <p
          className={`mt-1.5 rounded-md px-2 py-1 text-xs ${
            hinweisRot ? "bg-credo-rot/10 text-credo-rot" : "bg-credo-gelb/10 text-amber-900"
          }`}
          data-hinweis={hinweisRot ? "rot" : "gelb"}
        >
          {anzeige.hinweis}
          {zeile.istFuehrungskraft &&
            zeile.empfaenger.grund === "KEINE_FUEHRUNGSKRAFT" &&
            onFuehrungskraftEintragen && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onFuehrungskraftEintragen}
                  className="font-semibold text-credo-blau underline-offset-2 hover:underline"
                >
                  Eintragen
                </button>
              </>
            )}
        </p>
      )}
    </li>
  );
}

// =============================================
// Rueckfrage „Link erneuern"
// =============================================

function LinkErneuernDialog({
  zeile,
  onAbbrechen,
  onBestaetigen,
}: {
  zeile: AbteilungsZeile;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}) {
  const abbrechenRef = useRef<HTMLButtonElement>(null);
  // Der neue Link geht an die AKTUELL aufgeloeste Adresse (nach einer
  // Adressaenderung nicht mehr an die des alten Links).
  const adresse = zeile.empfaenger.email ?? zeile.email ?? "";

  useEffect(() => {
    abbrechenRef.current?.focus();
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAbbrechen();
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, [onAbbrechen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-erneuern-titel"
      aria-describedby="link-erneuern-text"
    >
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-2xl">
        <h2 id="link-erneuern-titel" className="text-base font-bold text-foreground">
          Link der {zeile.departmentName} erneuern?
        </h2>
        <p id="link-erneuern-text" className="mt-2 text-sm text-muted-foreground">
          Der bisherige Link wird sofort ungültig. {zeile.departmentName} erhält eine neue E-Mail
          mit neuem Link an {adresse}.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={abbrechenRef}
            type="button"
            onClick={onAbbrechen}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onBestaetigen}
            className="rounded-lg bg-credo-rot px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-credo-rot/90"
          >
            Link erneuern und senden
          </button>
        </div>
      </div>
    </div>
  );
}
