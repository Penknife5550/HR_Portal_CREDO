"use client";

/**
 * Oeffentliche Aufgabenseite einer Abteilung (Magic Link, ohne Anmeldung)
 *
 * Eine Komponente fuer beide Module: Offboarding nutzt sie ab Paket 1b
 * (/offboarding-tasks/[token]), das Onboarding in Paket 5. Alles, was nach
 * Modul klingt, kommt deshalb als Prop: Titel, Bezeichnung der Person, des
 * Bezugsdatums und die Countdown-Texte.
 *
 * Was die Abteilung sieht (Datensparsamkeit, GET liefert nichts anderes):
 * Name, Einrichtung, Bezugsdatum, ihre EIGENEN Aufgaben mit Faelligkeit und
 * ihrem eigenen Kommentar. Keine interne HR-Notiz, keinen Fortschritt anderer
 * Abteilungen, keinen Vorgangsstatus ausser „nur lesen".
 *
 * Der Kommentar der Abteilung ist ein eigenes Feld (hoechstens 1000 Zeichen):
 *   - „Kommentar speichern" schickt `{ comment }` (ohne Statuswechsel),
 *   - Abhaken schickt `{ isCompleted: true }` und den Entwurf NUR, wenn
 *     jemand getippt hat,
 *   - Wiederoeffnen schickt `{ isCompleted: false }` — nie `comment: null`,
 *     der gespeicherte Kommentar bleibt stehen.
 *
 * Die Fusszeile nennt die Einrichtung des Vorgangs und die Gueltigkeit des
 * Links — frueher stand dort fest „Christlicher Schulverein Minden e.V.",
 * fuer alle 16 Mandanten.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { KOMMENTAR_MAX, MELDUNGEN } from "@/lib/abteilungsaufgaben";
import { formatDatumDE } from "@/lib/format";
import { datumUhrzeitDE } from "@/components/abteilungsaufgaben/abteilungen-karte";

// =============================================
// Typen (Form wie GET /api/offboarding-tasks/[token])
// =============================================

export interface OeffentlicheAufgabe {
  id: string;
  title: string;
  category: string;
  orderIndex: number;
  isCompleted: boolean;
  completedAt: string | null;
  dueDate: string | null;
  abteilungKommentar: string | null;
  abteilungKommentarAm: string | null;
}

export interface AufgabenSeitenDaten {
  abteilung: { key: string; name: string };
  vorgang: {
    vorgangsnummer: string;
    mitarbeiterName: string;
    einrichtung: string;
    /** Bezugsdatum (ISO), im Offboarding der letzte Arbeitstag. */
    bezugsdatum: string;
  };
  /** Vorgang abgeschlossen: nur lesen. */
  readOnly: boolean;
  gueltigBis: string;
  aufgaben: OeffentlicheAufgabe[];
  fortschritt: { gesamt: number; erledigt: number; prozent: number };
  allTasksComplete: boolean;
}

export interface AufgabenSeiteProps {
  /** z. B. "/api/offboarding-tasks" — GET `${apiBasis}/${token}`, PATCH `${apiBasis}/${token}/${id}`. */
  apiBasis: string;
  token: string;
  /** „Offboarding" → Kopf und Überschrift „Offboarding-Aufgaben: …". */
  modulTitel: string;
  /** Beschriftung der Person, z. B. „Mitarbeiterin / Mitarbeiter". */
  personLabel: string;
  /** Beschriftung des Bezugsdatums, z. B. „Letzter Arbeitstag". */
  bezugsdatumLabel: string;
  /** Countdown zum Bezugsdatum; `tage` > 0 Zukunft, 0 heute, < 0 vorbei. */
  countdownText: (tage: number) => string;
  /** Anzeige einer Kategorie (Zwischenüberschrift); ohne: der Rohwert. */
  kategorieLabel?: (kategorie: string) => string;
  /** Nur fuer Tests: Bezugszeit fuer Countdown, Überfälligkeit und Jahr. */
  jetzt?: Date;
}

// =============================================
// Helfer
// =============================================

const MS_PRO_TAG = 86_400_000;

const BERLIN_TEILE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalendertag in deutscher Zeit als fortlaufende Tageszahl. */
function kalendertag(d: Date): number {
  const teile = Object.fromEntries(BERLIN_TEILE.formatToParts(d).map((t) => [t.type, t.value]));
  return Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day)) / MS_PRO_TAG;
}

/**
 * Ganze Kalendertage von `jetzt` bis `ziel` (deutsche Zeit): 0 = heute,
 * 1 = morgen, -3 = vor drei Tagen. Die Tagesdaten liegen als UTC-Mitternacht
 * in der Datenbank und fallen in Berlin auf denselben Kalendertag.
 */
export function tageBis(ziel: string | Date, jetzt: Date): number {
  const d = ziel instanceof Date ? ziel : new Date(ziel);
  if (Number.isNaN(d.getTime())) return 0;
  return kalendertag(d) - kalendertag(jetzt);
}

const FEHLER_LADEN = "Fehler beim Laden der Aufgaben.";
const FEHLER_VERBINDUNG = "Verbindungsfehler. Bitte versuchen Sie es später erneut.";
const FEHLER_SPEICHERN = "Fehler beim Speichern.";

class SpeicherFehler extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// =============================================
// Komponente
// =============================================

export function AufgabenSeite({
  apiBasis,
  token,
  modulTitel,
  personLabel,
  bezugsdatumLabel,
  countdownText,
  kategorieLabel,
  jetzt,
}: AufgabenSeiteProps) {
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [daten, setDaten] = useState<AufgabenSeitenDaten | null>(null);
  const [aufgaben, setAufgaben] = useState<OeffentlicheAufgabe[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  /** Getippte Kommentare je Aufgabe — `undefined` heisst „nichts getippt". */
  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({});
  const [editorOffen, setEditorOffen] = useState<Set<string>>(new Set());
  const [speichert, setSpeichert] = useState<Set<string>>(new Set());
  const [meldung, setMeldung] = useState<string | null>(null);
  const [geradeErledigt, setGeradeErledigt] = useState<Set<string>>(new Set());
  // Jeder GET zaehlt als „geöffnet" (openCount). Im Entwicklungsmodus ruft
  // React Effekte doppelt auf — der Merker verhindert die zweite Zaehlung.
  const geladenFuer = useRef<string | null>(null);

  const laden = useCallback(async () => {
    try {
      const res = await fetch(`${apiBasis}/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as
        | { data?: AufgabenSeitenDaten; error?: string }
        | null;
      if (!res.ok || !body?.data) {
        setFehler(body?.error || FEHLER_LADEN);
        return;
      }
      setDaten(body.data);
      setAufgaben(body.data.aufgaben);
      setReadOnly(body.data.readOnly);
    } catch {
      setFehler(FEHLER_VERBINDUNG);
    } finally {
      setLaedt(false);
    }
  }, [apiBasis, token]);

  useEffect(() => {
    if (geladenFuer.current === token) return;
    geladenFuer.current = token;
    void laden();
  }, [laden, token]);

  // Fehlerleiste nach fuenf Sekunden ausblenden.
  useEffect(() => {
    if (!meldung) return;
    const timer = setTimeout(() => setMeldung(null), 5000);
    return () => clearTimeout(timer);
  }, [meldung]);

  const offeneAufgaben = useMemo(() => aufgaben.filter((a) => !a.isCompleted), [aufgaben]);
  const erledigteAufgaben = useMemo(() => aufgaben.filter((a) => a.isCompleted), [aufgaben]);

  // Offene Aufgaben je Kategorie, in der Reihenfolge des Servers (Kategorie, Position).
  const offenNachKategorie = useMemo(() => {
    const gruppen = new Map<string, OeffentlicheAufgabe[]>();
    for (const a of offeneAufgaben) {
      const k = a.category || "Sonstige";
      gruppen.set(k, [...(gruppen.get(k) ?? []), a]);
    }
    return [...gruppen.entries()];
  }, [offeneAufgaben]);

  const setzeSpeichert = (id: string, an: boolean) =>
    setSpeichert((prev) => {
      const next = new Set(prev);
      if (an) next.add(id);
      else next.delete(id);
      return next;
    });

  const editorSchliessen = (id: string) => {
    setEditorOffen((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setEntwuerfe((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  /** PATCH einer Aufgabe; uebernimmt die Antwort des Servers. */
  const aendern = async (id: string, body: { isCompleted?: boolean; comment?: string }) => {
    let res: Response;
    try {
      res = await fetch(`${apiBasis}/${encodeURIComponent(token)}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new SpeicherFehler(FEHLER_VERBINDUNG, 0);
    }
    const antwort = (await res.json().catch(() => null)) as {
      data?: { aufgabe?: OeffentlicheAufgabe };
      error?: string;
    } | null;
    if (!res.ok) throw new SpeicherFehler(antwort?.error || FEHLER_SPEICHERN, res.status);
    const aufgabe = antwort?.data?.aufgabe;
    if (aufgabe) setAufgaben((prev) => prev.map((a) => (a.id === aufgabe.id ? aufgabe : a)));
  };

  /** Fehler des Servers: abgeschlossen → nur lesen, abgebrochen/abgelaufen → Fehlerseite. */
  const fehlerZeigen = (err: unknown) => {
    const text = err instanceof Error ? err.message : FEHLER_SPEICHERN;
    const status = err instanceof SpeicherFehler ? err.status : 0;
    if (status === 410 || (status === 404 && text === MELDUNGEN.LINK_UNGUELTIG)) {
      setFehler(text);
      return;
    }
    if (status === 409 && text === MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN) setReadOnly(true);
    setMeldung(text);
  };

  const umschalten = async (aufgabe: OeffentlicheAufgabe) => {
    if (readOnly || speichert.has(aufgabe.id)) return;
    const neu = !aufgabe.isCompleted;
    const body: { isCompleted: boolean; comment?: string } = { isCompleted: neu };
    // Den Entwurf nur mitschicken, wenn jemand getippt hat, das Feld noch offen
    // ist — und nur beim Abhaken. Wiederoeffnen laesst den Kommentar in Ruhe.
    const entwurf = entwuerfe[aufgabe.id];
    if (neu && entwurf !== undefined && editorOffen.has(aufgabe.id)) body.comment = entwurf.trim();

    setAufgaben((prev) =>
      prev.map((a) =>
        a.id === aufgabe.id
          ? { ...a, isCompleted: neu, completedAt: neu ? new Date().toISOString() : null }
          : a,
      ),
    );
    if (neu) {
      setGeradeErledigt((prev) => new Set(prev).add(aufgabe.id));
      setTimeout(
        () =>
          setGeradeErledigt((prev) => {
            const next = new Set(prev);
            next.delete(aufgabe.id);
            return next;
          }),
        1200,
      );
    }
    setzeSpeichert(aufgabe.id, true);
    setMeldung(null);
    try {
      await aendern(aufgabe.id, body);
      if (neu) editorSchliessen(aufgabe.id);
    } catch (err) {
      // Zurueck auf den Stand vor dem Klick.
      setAufgaben((prev) => prev.map((a) => (a.id === aufgabe.id ? aufgabe : a)));
      fehlerZeigen(err);
    } finally {
      setzeSpeichert(aufgabe.id, false);
    }
  };

  const kommentarSpeichern = async (aufgabe: OeffentlicheAufgabe) => {
    const entwurf = entwuerfe[aufgabe.id];
    if (readOnly || entwurf === undefined || speichert.has(aufgabe.id)) return;
    setzeSpeichert(aufgabe.id, true);
    setMeldung(null);
    try {
      await aendern(aufgabe.id, { comment: entwurf.trim() });
      editorSchliessen(aufgabe.id);
    } catch (err) {
      fehlerZeigen(err);
    } finally {
      setzeSpeichert(aufgabe.id, false);
    }
  };

  // Zuklappen heisst Verwerfen: Der Entwurf geht mit. Sonst schickte ein
  // spaeteres Abhaken den zugeklappten Text doch noch als Kommentar an HR.
  const editorUmschalten = (id: string) => {
    if (editorOffen.has(id)) {
      editorSchliessen(id);
      return;
    }
    setEditorOffen((prev) => new Set(prev).add(id));
  };

  // ---- Laden ----
  if (laedt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="text-center" role="status">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Aufgaben werden geladen…</p>
        </div>
      </div>
    );
  }

  // ---- Fehler (ungueltig, abgelaufen, abgebrochen, zu viele Anfragen) ----
  if (fehler || !daten) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-6 text-center sm:p-8">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-foreground">Link nicht gültig</h1>
            <p className="mt-2 text-sm text-muted-foreground">{fehler || FEHLER_LADEN}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Bitte wenden Sie sich an die Personalabteilung, falls Sie einen neuen Link benötigen.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // ---- Aufgaben ----
  const nun = jetzt ?? new Date();
  const gesamt = aufgaben.length;
  const erledigt = erledigteAufgaben.length;
  const prozent = gesamt > 0 ? Math.round((erledigt / gesamt) * 100) : 100;
  const bezug = daten.vorgang.bezugsdatum;
  const einrichtung = daten.vorgang.einrichtung.trim();
  const kategorie = (k: string) => (kategorieLabel ? kategorieLabel(k) : k);

  const renderAufgabe = (aufgabe: OeffentlicheAufgabe) => {
    const laeuft = speichert.has(aufgabe.id);
    const animiert = geradeErledigt.has(aufgabe.id);
    const offenEditor = editorOffen.has(aufgabe.id);
    const faelligIn = aufgabe.dueDate ? tageBis(aufgabe.dueDate, nun) : null;
    const ueberfaellig = !aufgabe.isCompleted && faelligIn !== null && faelligIn < 0;
    const entwurf = entwuerfe[aufgabe.id];
    const textfeldWert = entwurf ?? aufgabe.abteilungKommentar ?? "";
    const gespeichert = (aufgabe.abteilungKommentar ?? "").trim();
    const kommentarGeaendert = entwurf !== undefined && entwurf.trim() !== gespeichert;
    const feldId = `kommentar-${aufgabe.id}`;
    const hinweisId = `kommentar-hinweis-${aufgabe.id}`;

    return (
      <li
        key={aufgabe.id}
        className={`rounded-xl border bg-card shadow-sm transition-all duration-300 ${
          animiert ? "ring-2 ring-green-400 ring-offset-2" : ""
        } ${aufgabe.isCompleted ? "opacity-80" : ""}`}
        data-aufgabe={aufgabe.id}
      >
        <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
          <button
            type="button"
            onClick={() => umschalten(aufgabe)}
            disabled={laeuft || readOnly}
            aria-label={aufgabe.isCompleted ? "Als offen markieren" : "Als erledigt markieren"}
            aria-pressed={aufgabe.isCompleted}
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-300 sm:h-6 sm:w-6 sm:rounded-md ${
              aufgabe.isCompleted
                ? "border-green-500 bg-green-500 text-white"
                : "border-gray-300 bg-white hover:border-primary hover:bg-primary/5"
            } ${laeuft ? "opacity-50" : ""} ${readOnly ? "cursor-not-allowed opacity-60" : ""} ${
              animiert ? "scale-110" : ""
            }`}
          >
            {aufgabe.isCompleted && (
              <svg className="h-4 w-4 sm:h-3.5 sm:w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4
                className={`min-w-0 break-words text-sm font-medium sm:text-base ${
                  aufgabe.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {aufgabe.title}
              </h4>
              {aufgabe.dueDate && !aufgabe.isCompleted && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ueberfaellig ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {ueberfaellig
                    ? `Überfällig seit ${formatDatumDE(aufgabe.dueDate)}`
                    : `Fällig ${formatDatumDE(aufgabe.dueDate)}`}
                </span>
              )}
            </div>

            {aufgabe.isCompleted && aufgabe.completedAt && (
              <p className="mt-1.5 text-xs text-green-700">
                Erledigt am {datumUhrzeitDE(aufgabe.completedAt)}
              </p>
            )}

            {gespeichert && !offenEditor && (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Ihr Kommentar:</span> {aufgabe.abteilungKommentar}
              </p>
            )}

            <button
              type="button"
              onClick={() => editorUmschalten(aufgabe.id)}
              disabled={readOnly}
              aria-expanded={offenEditor}
              aria-controls={offenEditor ? feldId : undefined}
              className="mt-2 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {gespeichert ? "Kommentar ändern" : "Kommentar hinzufügen"}
            </button>

            {offenEditor && !readOnly && (
              <div className="mt-2 space-y-2">
                <label htmlFor={feldId} className="sr-only">
                  Kommentar für die Personalabteilung
                </label>
                <textarea
                  id={feldId}
                  value={textfeldWert}
                  onChange={(e) =>
                    setEntwuerfe((prev) => ({ ...prev, [aufgabe.id]: e.target.value }))
                  }
                  maxLength={KOMMENTAR_MAX}
                  rows={3}
                  autoFocus
                  placeholder={`Kommentar für die Personalabteilung (optional, höchstens ${KOMMENTAR_MAX} Zeichen)`}
                  aria-describedby={hinweisId}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:text-sm"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {textfeldWert.length} / {KOMMENTAR_MAX}
                  </span>
                  <button
                    type="button"
                    onClick={() => kommentarSpeichern(aufgabe)}
                    disabled={laeuft || !kommentarGeaendert}
                    className="rounded-lg bg-credo-gruen px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
                  >
                    Kommentar speichern
                  </button>
                </div>
                <p id={hinweisId} className="text-xs text-muted-foreground">
                  Der Kommentar wird auch beim Abhaken gespeichert und ist für die Personalabteilung sichtbar.
                </p>
              </div>
            )}
          </div>

          {laeuft && (
            <div className="mt-1 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      {/* Kopf */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/credo_logo.svg" alt="CREDO" width={100} height={33} priority />
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-foreground">HR-Portal</p>
              <p className="text-xs text-muted-foreground">{modulTitel}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {erledigt} / {gesamt} erledigt
          </span>
        </div>
        <CredoLinie height={2} />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <h1 className="break-words text-xl font-bold text-foreground sm:text-2xl">
          {modulTitel}-Aufgaben: {daten.abteilung.name}
        </h1>

        {readOnly && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700"
          >
            Dieser Vorgang ist abgeschlossen. Die Aufgaben können nicht mehr geändert werden.
          </div>
        )}

        {/* Infokarte */}
        <div className="mt-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{personLabel}</dt>
              <dd className="break-words font-medium text-foreground">{daten.vorgang.mitarbeiterName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Einrichtung</dt>
              <dd className="break-words font-medium text-foreground">{einrichtung || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{bezugsdatumLabel}</dt>
              <dd className="font-medium text-foreground">{formatDatumDE(bezug)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm font-medium text-foreground" data-countdown>
            {countdownText(tageBis(bezug, nun))}
          </p>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span id="fortschritt-titel">Fortschritt Ihrer Aufgaben</span>
              <span className="font-medium">{prozent} %</span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-labelledby="fortschritt-titel"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={prozent}
            >
              <div
                className="h-full rounded-full bg-credo-gruen transition-all duration-700 ease-out"
                style={{ width: `${prozent}%` }}
              />
            </div>
          </div>
        </div>

        {meldung && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {meldung}
          </div>
        )}

        {/* Offene Aufgaben, je Kategorie */}
        {offeneAufgaben.length > 0 && (
          <section className="mt-6" aria-labelledby="offene-aufgaben">
            <h2 id="offene-aufgaben" className="mb-3 text-sm font-semibold text-foreground">
              Offene Aufgaben ({offeneAufgaben.length})
            </h2>
            <div className="space-y-5">
              {offenNachKategorie.map(([k, liste]) => (
                <div key={k}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {kategorie(k)}
                  </h3>
                  <ul className="space-y-3">{liste.map(renderAufgabe)}</ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Alles erledigt */}
        {gesamt > 0 && offeneAufgaben.length === 0 && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-6 text-center" role="status">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-green-800">Alle Aufgaben erledigt</p>
            <p className="mt-1 text-sm text-green-700">
              Vielen Dank. Die Personalabteilung sieht Ihre Rückmeldung im Portal.
            </p>
          </div>
        )}

        {/* Erledigte Aufgaben */}
        {erledigteAufgaben.length > 0 && (
          <section className="mt-8" aria-labelledby="erledigte-aufgaben">
            <h2 id="erledigte-aufgaben" className="mb-3 text-sm font-semibold text-muted-foreground">
              Erledigte Aufgaben ({erledigteAufgaben.length})
            </h2>
            <ul className="space-y-3">{erledigteAufgaben.map(renderAufgabe)}</ul>
          </section>
        )}

        {gesamt === 0 && (
          <div className="mt-6 rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">Keine Aufgaben für diese Abteilung vorhanden.</p>
          </div>
        )}
      </main>

      {/* Fusszeile: Einrichtung des Vorgangs und Gueltigkeit des Links */}
      <footer className="border-t bg-card px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">Bei Fragen wenden Sie sich an die Personalabteilung.</p>
        <p className="mx-auto mt-2 max-w-2xl text-xs text-muted-foreground">
          Dieser Link ist für Ihre Abteilung bestimmt und gültig bis {formatDatumDE(daten.gueltigBis)}. Bitte
          nicht außerhalb Ihrer Abteilung weitergeben.
        </p>
        <p className="mt-1 text-xs text-muted-foreground" data-fusszeile="einrichtung">
          © {nun.getFullYear()}
          {einrichtung ? ` ${einrichtung}` : ""}
        </p>
      </footer>
    </div>
  );
}
