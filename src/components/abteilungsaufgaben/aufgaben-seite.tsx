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
 *
 * Ausstattung & Zugaenge (Onboarding, Feinplan S14, Mockup 6.5): Der Server
 * liefert dazu den Arbeitsort (Kopf, neben der Einrichtung — nur wenn er
 * abweicht), Angaben und Hinweis an die eigene Stelle (Block „Nur für …“) und
 * je Aufgabe Bemerkung, „Eilt“ und „entfällt“. Eine entfallene Aufgabe steht
 * unter „Entfallene Aufgaben“, laesst sich nicht abhaken (Server 409), nimmt
 * aber weiter einen Kommentar. Gezaehlt wird mit `checklistFortschritt` —
 * entfallene Aufgaben zaehlen weder im Zaehler noch im Nenner (F2). Die
 * Bausteine dafuer stehen in src/components/ausstattung/link-seite-teile.tsx.
 * Im Offboarding fehlen alle diese Felder; die Seite sieht dort aus wie zuvor
 * (auch „100 %“ ohne Aufgabe — `checklistFortschritt` gaebe 0 %, `data.modul`
 * unterscheidet).
 *
 * Stufe 2 (Feinplan A4, G6, 1.8): An Ausstattungsaufgaben, deren Position
 * beim Austritt zurueckkommt bzw. gesperrt wird, liefert der Server `ausgabe`.
 * Darunter steht dann der Block „Übergabe vermerken“
 * (src/components/ausgaben/ausgabe-vermerk.tsx) — getrennt vom Abhaken, mit
 * eigenem Aufruf (`ausgabeSenden`: POST bzw. DELETE unter
 * `${apiBasis}/${token}/${id}/ausgaben`). Nicht bei „nur lesen“ und nicht an
 * einer entfallenen Aufgabe. Ohne `ausgabe` (Offboarding, A4 nicht
 * eingeschaltet) bleibt die Seite unveraendert.
 *
 * Offboarding, Stufe 2 (Feinplan A4, S32, 1.6, 1.8, G15, G17): An den
 * Ruecknahme- und Sperraufgaben der ausgebenden Stelle und an der Folgeaufgabe
 * „Schließung prüfen“ der Gebaeudewirtschaft liefert der Server `ausgabe`
 * (Kennung, Zustand). Darunter steht dann der Block
 * src/components/ausgaben/ruecknahme-auswahl.tsx: An einem Gegenstand ersetzen
 * die drei Knoepfe „Zurückerhalten“, „Beschädigt zurückerhalten“, „Fehlt“ den
 * Haken der offenen Aufgabe – sie schicken `{ isCompleted: true, zustand }`
 * an denselben PATCH (an einer erledigten wechseln sie nur den Zustand);
 * „Wieder öffnen“ bleibt der Haken. Ein Zugang behaelt den Haken („Als
 * gesperrt markieren“), die Folgeaufgabe zeigt die Kennung nur lesend. Legt
 * „Fehlt“ eine Folgeaufgabe fuer DIESE Stelle an (die Gebaeudewirtschaft gab
 * den Schluessel selbst aus), zaehlt der Server eine Aufgabe mehr – dann laedt
 * die Seite einmal neu, damit die neue Aufgabe erscheint.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Minus } from "lucide-react";
import { CredoLinie } from "@/components/credo-linie";
import {
  KOMMENTAR_MAX,
  MELDUNGEN,
  ZUSATZFELD_LABELS,
  type AbteilungsModul,
  type ZusatzFeld,
} from "@/lib/abteilungsaufgaben";
import { checklistFortschritt } from "@/lib/ausstattung";
import { formatDatumDE } from "@/lib/format";
import { datumUhrzeitDE } from "@/components/abteilungsaufgaben/abteilungen-karte";
import {
  AngabenEintraege,
  BemerkungKasten,
  ENTFAELLT_TEXT,
  EiltKennzeichen,
  EntfaelltKennzeichen,
} from "@/components/ausstattung/link-seite-teile";
import { AusgabeVermerk, type VermerkEingabe } from "@/components/ausgaben/ausgabe-vermerk";
import {
  RUECKNAHME_TEXTE,
  RuecknahmeAuswahl,
  knoepfeStattHaken,
  offboardingAusgabe,
  zugangMitHaken,
  type AufgabenAusgabe,
} from "@/components/ausgaben/ruecknahme-auswahl";
import type { LinkAusgabe, RueckgabeZustandStelle } from "@/lib/ausgaben";

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
  /** Hinweis aus der Checklisten-Vorlage (Paket 5, beide Module). */
  description?: string | null;
  /**
   * Nur Onboarding (Ausstattung & Zugaenge): Bemerkung zur Position mit ihrer
   * Beschriftung nach Herkunft (Regel 8) — eigener Kasten, getrennt von
   * `description` (dem festen Hinweis aus dem Katalog).
   */
  bemerkung?: { text: string; label: string } | null;
  /** Nur Onboarding: Frist auf den Tag der Benachrichtigung angehoben (Regel 14). */
  eilt?: boolean;
  /** Nur Onboarding: von der Personalabteilung gestrichen (R9, E-A21) — kein Abhaken mehr. */
  entfaellt?: boolean;
  /**
   * Stufe 2 (A4). Onboarding (G6): „Übergabe vermerken“ an einer
   * Ausstattungsaufgabe, deren Position beim Austritt zurueckkommt bzw.
   * gesperrt wird (`LinkAusgabe`). Offboarding (S30/S32, G15, G17): Kennung
   * und Rueckgabezustand an Ruecknahme-, Sperr- und Folgeaufgaben. Fehlt an
   * allen uebrigen Aufgaben ganz.
   */
  ausgabe?: AufgabenAusgabe;
}

export interface AufgabenSeitenDaten {
  /**
   * Modul des Links (der Server liefert es in beiden Modulen). Nur fuer den
   * Fortschritt ohne zaehlende Aufgabe: Onboarding 0 % (F2), Offboarding wie
   * eh und je 100 %; fehlt es, gilt das Offboarding.
   */
  modul?: AbteilungsModul;
  abteilung: { key: string; name: string };
  vorgang: {
    vorgangsnummer: string;
    mitarbeiterName: string;
    einrichtung: string;
    /**
     * Bezugsdatum (ISO): letzter Arbeitstag bzw. Vertragsbeginn. `null` ist
     * moeglich (Altbestand ohne Modalitaeten) — Zeile und Countdown entfallen
     * dann, statt „Invalid Date" zu zeigen.
     */
    bezugsdatum: string | null;
  };
  /**
   * Zusaetzliche Angaben, die genau DIESE Stelle sehen darf (Paket 5,
   * Onboarding). Der Server schneidet zu; die Seite zeigt nur, was ankommt.
   */
  zusatz?: Partial<Record<ZusatzFeld, string>>;
  /**
   * Nur Onboarding (E-A10, F15): Arbeitsort, wenn er von der Einrichtung
   * abweicht, sonst `null`. Steht im Kopf neben der Einrichtung.
   */
  arbeitsort?: string | null;
  /** Nur Onboarding (Regel 7): Angaben aus „Ausstattung & Zugänge“, die diese Stelle sehen darf. */
  angaben?: { label: string; wert: string }[];
  /** Nur Onboarding (Regel 7, E-A14): Hinweis der Führungskraft an genau diese Stelle. */
  hinweis?: string | null;
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
  /**
   * Überschrift ueber dem Countdown, z. B. „Bis zum Dienstbeginn". Ohne Wert
   * bleibt die Zeile wie im Offboarding ohne Überschrift.
   */
  countdownLabel?: string;
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

/**
 * Beschriftung der Zusatzfelder auf der Link-Seite.
 *
 * Bis auf eines dieselben Worte wie im Dialog „Abteilungen informieren"
 * (`ZUSATZFELD_LABELS`): Dort heisst das Feld „Adresse der Führungskraft",
 * weil HR dort liest, WAS hinausgeht. Hier liest die Abteilung, WEN sie
 * fragen kann — deshalb „Ansprechpartner (Führungskraft)".
 */
const ZUSATZ_LABELS_SEITE: Record<ZusatzFeld, string> = {
  ...ZUSATZFELD_LABELS,
  ansprechpartner_email: "Ansprechpartner (Führungskraft)",
};

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
  countdownLabel,
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

  // Entfallene Aufgaben sind auf dem Server `isCompleted` (F2) — hier stehen
  // sie in einem eigenen Abschnitt, nie unter „Erledigt“.
  const offeneAufgaben = useMemo(() => aufgaben.filter((a) => !a.isCompleted && !a.entfaellt), [aufgaben]);
  const erledigteAufgaben = useMemo(() => aufgaben.filter((a) => a.isCompleted && !a.entfaellt), [aufgaben]);
  const entfalleneAufgaben = useMemo(() => aufgaben.filter((a) => a.entfaellt === true), [aufgaben]);

  // Offene Aufgaben je Kategorie, in der Reihenfolge des Servers (Position; Kategorien nach ihrem ersten Punkt).
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

  /** PATCH einer Aufgabe; uebernimmt die Antwort des Servers und gibt sie zurueck. */
  const aendern = async (
    id: string,
    body: { isCompleted?: boolean; comment?: string; zustand?: RueckgabeZustandStelle },
  ): Promise<{ fortschritt?: { gesamt?: number } } | null> => {
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
      data?: { aufgabe?: OeffentlicheAufgabe; fortschritt?: { gesamt?: number } };
      error?: string;
    } | null;
    if (!res.ok) throw new SpeicherFehler(antwort?.error || FEHLER_SPEICHERN, res.status);
    const aufgabe = antwort?.data?.aufgabe;
    if (aufgabe) setAufgaben((prev) => prev.map((a) => (a.id === aufgabe.id ? aufgabe : a)));
    return antwort?.data ?? null;
  };

  /**
   * „Übergabe vermerken“ (Stufe 2, A4): POST bzw. DELETE unter
   * `${apiBasis}/${token}/${id}/ausgaben` — ein eigener Aufruf neben dem PATCH
   * der Aufgabe (ein Vermerk hakt nichts ab). Uebernimmt den frischen Stand
   * `ausgabe` des Servers. Ein Fehler wirft mit dem Text des Servers (der
   * Block zeigt ihn); was er fuer die ganze Seite heisst (Link ungueltig, nur
   * lesen, inzwischen entfallen), zieht `ausgabeFehlerFolgen` nach.
   */
  const ausgabeSenden = async (
    aufgabeId: string,
    anfrage: { method: "POST" | "DELETE"; pfad?: string; body?: unknown },
  ) => {
    let res: Response;
    try {
      res = await fetch(
        `${apiBasis}/${encodeURIComponent(token)}/${encodeURIComponent(aufgabeId)}/ausgaben${anfrage.pfad ?? ""}`,
        anfrage.body === undefined
          ? { method: anfrage.method }
          : {
              method: anfrage.method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(anfrage.body),
            },
      );
    } catch {
      throw new SpeicherFehler(FEHLER_VERBINDUNG, 0);
    }
    const antwort = (await res.json().catch(() => null)) as {
      data?: { ausgabe?: LinkAusgabe | null };
      error?: string;
      grund?: string;
    } | null;
    if (!res.ok) {
      const fehler = new SpeicherFehler(antwort?.error || FEHLER_SPEICHERN, res.status);
      ausgabeFehlerFolgen(fehler, aufgabeId, antwort?.grund);
      throw fehler;
    }
    const ausgabe = antwort?.data?.ausgabe ?? undefined;
    setAufgaben((prev) => prev.map((a) => (a.id === aufgabeId ? { ...a, ausgabe } : a)));
  };

  /**
   * Folgen eines Fehlers beim Vermerken fuer die ganze Seite: abgebrochen/
   * abgelaufen bzw. ungueltig → Fehlerseite; abgeschlossen → nur lesen;
   * inzwischen gestrichen (409 `AUFGABE_ENTFAELLT`) → die Aufgabe als
   * entfallen zeigen. In den beiden letzten Faellen verschwindet der Block —
   * die Meldung steht dann oben auf der Seite.
   */
  const ausgabeFehlerFolgen = (err: SpeicherFehler, aufgabeId: string, grund: string | undefined) => {
    if (err.status === 410 || (err.status === 404 && err.message === MELDUNGEN.LINK_UNGUELTIG)) {
      setFehler(err.message);
      return;
    }
    if (err.status === 409 && err.message === MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN) {
      setReadOnly(true);
      setMeldung(err.message);
    }
    if (err.status === 409 && grund === "AUFGABE_ENTFAELLT") {
      setAufgaben((prev) =>
        prev.map((a) => (a.id === aufgabeId ? { ...a, isCompleted: true, entfaellt: true } : a)),
      );
      setMeldung(err.message);
    }
  };

  /**
   * Fehler des Servers: abgeschlossen → nur lesen, abgebrochen/abgelaufen →
   * Fehlerseite, inzwischen gestrichen (409 „entfällt“) → die Aufgabe als
   * entfallen zeigen, ohne die Seite neu zu laden (jeder GET zaehlt als
   * „geöffnet“).
   */
  const fehlerZeigen = (err: unknown, aufgabeId?: string) => {
    const text = err instanceof Error ? err.message : FEHLER_SPEICHERN;
    const status = err instanceof SpeicherFehler ? err.status : 0;
    if (status === 410 || (status === 404 && text === MELDUNGEN.LINK_UNGUELTIG)) {
      setFehler(text);
      return;
    }
    if (status === 409 && text === MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN) setReadOnly(true);
    if (status === 409 && text === MELDUNGEN.AUFGABE_ENTFAELLT && aufgabeId) {
      setAufgaben((prev) =>
        prev.map((a) => (a.id === aufgabeId ? { ...a, isCompleted: true, entfaellt: true } : a)),
      );
    }
    setMeldung(text);
  };

  const umschalten = async (aufgabe: OeffentlicheAufgabe) => {
    if (readOnly || aufgabe.entfaellt || speichert.has(aufgabe.id)) return;
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
      fehlerZeigen(err, aufgabe.id);
    } finally {
      setzeSpeichert(aufgabe.id, false);
    }
  };

  /**
   * Ruecknahme eines Gegenstands (Offboarding, Stufe 2): „Zurückerhalten“,
   * „Beschädigt zurückerhalten“ oder „Fehlt“ – derselbe PATCH wie der Haken,
   * mit `zustand`. Einen getippten Kommentar nimmt er mit wie das Abhaken.
   * Kommt dadurch fuer diese Stelle eine Aufgabe hinzu (Folgeaufgabe
   * „Schließung prüfen“), laedt die Seite einmal neu.
   */
  const zustandWaehlen = async (aufgabe: OeffentlicheAufgabe, zustand: RueckgabeZustandStelle) => {
    if (readOnly || aufgabe.entfaellt || speichert.has(aufgabe.id)) return;
    const warOffen = !aufgabe.isCompleted;
    const body: { isCompleted: true; zustand: RueckgabeZustandStelle; comment?: string } = { isCompleted: true, zustand };
    const entwurf = entwuerfe[aufgabe.id];
    if (entwurf !== undefined && editorOffen.has(aufgabe.id)) body.comment = entwurf.trim();
    setzeSpeichert(aufgabe.id, true);
    setMeldung(null);
    try {
      const antwort = await aendern(aufgabe.id, body);
      if (body.comment !== undefined) editorSchliessen(aufgabe.id);
      if (warOffen) {
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
      const gesamt = antwort?.fortschritt?.gesamt;
      if (daten?.modul !== "ONBOARDING" && typeof gesamt === "number" && gesamt !== aufgaben.length) void laden();
    } catch (err) {
      fehlerZeigen(err, aufgabe.id);
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
  // EINE Rechnung (F2): entfallene Aufgaben zaehlen weder im Zaehler noch im
  // Nenner — ohne zaehlende Aufgabe steht der Balken im Onboarding auf 0 %.
  // Das Offboarding kennt kein „entfällt“ und bleibt Byte fuer Byte wie zuvor:
  // ohne Aufgabe 100 % (wie `fortschritt` des Servers).
  const zaehlung = checklistFortschritt(aufgaben);
  const { gesamt, erledigt, alleErledigt } = zaehlung;
  const prozent = gesamt === 0 && daten.modul !== "ONBOARDING" ? 100 : zaehlung.prozent;
  // Ohne Bezugsdatum (Altbestand ohne Modalitaeten) entfallen Zeile UND
  // Countdown — `formatDatumDE(null)` waere leer, `tageBis(null)` aber 0 und
  // damit „Heute ist der erste Arbeitstag".
  const bezug = daten.vorgang.bezugsdatum;
  const einrichtung = daten.vorgang.einrichtung.trim();
  const kategorie = (k: string) => (kategorieLabel ? kategorieLabel(k) : k);
  const zusatzFelder = (Object.entries(daten.zusatz ?? {}) as [ZusatzFeld, string][]).filter(
    ([feld, wert]) => !!wert && feld in ZUSATZ_LABELS_SEITE,
  );
  // Ausstattung & Zugaenge (nur Onboarding): Arbeitsort, Angaben, Hinweis.
  const arbeitsort = daten.arbeitsort?.trim() || null;
  const angaben = (daten.angaben ?? []).filter((a) => a.wert.trim() !== "");
  const stellenHinweis = daten.hinweis?.trim() || null;
  const nurFuerSichtbar = zusatzFelder.length > 0 || angaben.length > 0 || !!stellenHinweis;

  const renderAufgabe = (aufgabe: OeffentlicheAufgabe) => {
    const laeuft = speichert.has(aufgabe.id);
    const animiert = geradeErledigt.has(aufgabe.id);
    const offenEditor = editorOffen.has(aufgabe.id);
    const entfaellt = aufgabe.entfaellt === true;
    const faelligIn = aufgabe.dueDate ? tageBis(aufgabe.dueDate, nun) : null;
    const ueberfaellig = !aufgabe.isCompleted && faelligIn !== null && faelligIn < 0;
    const entwurf = entwuerfe[aufgabe.id];
    const textfeldWert = entwurf ?? aufgabe.abteilungKommentar ?? "";
    const gespeichert = (aufgabe.abteilungKommentar ?? "").trim();
    const kommentarGeaendert = entwurf !== undefined && entwurf.trim() !== gespeichert;
    const feldId = `kommentar-${aufgabe.id}`;
    const hinweisId = `kommentar-hinweis-${aufgabe.id}`;
    // Offboarding, Stufe 2: Ruecknahme (Knoepfe statt Haken, solange offen), Zugang, Folgeaufgabe.
    const ruecknahme = offboardingAusgabe(aufgabe.ausgabe);
    const ohneHaken = knoepfeStattHaken(aufgabe.ausgabe) && !aufgabe.isCompleted;
    const onboardingAusgabe: LinkAusgabe | null =
      aufgabe.ausgabe && "stuecke" in aufgabe.ausgabe ? aufgabe.ausgabe : null;

    // Eine erledigte Aufgabe wird nur am Titel gedaempft (grau, durchgestrichen)
    // und am Haken erkannt – nie per `opacity` am ganzen Eintrag: Die
    // Durchsichtigkeit erbten sonst alle Kinder, und Beschriftungen, Fehlertexte
    // und Knoepfe darunter (etwa „Übergabe vermerken“, das gerade nach dem
    // Abhaken gebraucht wird) fielen unter 4,5:1 (WCAG AA).
    return (
      <li
        key={aufgabe.id}
        className={`rounded-xl border bg-card shadow-sm transition-all duration-300 ${
          animiert ? "ring-2 ring-green-400 ring-offset-2" : ""
        }`}
        data-aufgabe={aufgabe.id}
      >
        <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
          {ohneHaken ? (
            // Statt des Hakens die drei Knoepfe darunter; der Platz bleibt, damit die Titel fluchten.
            <span className="mt-0.5 h-7 w-7 shrink-0 sm:h-6 sm:w-6" aria-hidden="true" data-ohne-haken />
          ) : (
          <button
            type="button"
            onClick={() => umschalten(aufgabe)}
            disabled={laeuft || readOnly || entfaellt}
            aria-label={
              entfaellt
                ? "Entfällt – kann nicht abgehakt werden"
                : aufgabe.isCompleted
                  ? "Als offen markieren"
                  : zugangMitHaken(aufgabe.ausgabe)
                    ? RUECKNAHME_TEXTE.gesperrtHaken
                    : "Als erledigt markieren"
            }
            aria-pressed={entfaellt ? undefined : aufgabe.isCompleted}
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-300 sm:h-6 sm:w-6 sm:rounded-md ${
              entfaellt
                ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                : aufgabe.isCompleted
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-gray-300 bg-white hover:border-primary hover:bg-primary/5"
            } ${laeuft ? "opacity-50" : ""} ${readOnly ? "cursor-not-allowed opacity-60" : ""} ${
              animiert ? "scale-110" : ""
            }`}
          >
            {entfaellt ? (
              <Minus className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={3} aria-hidden="true" />
            ) : (
              aufgabe.isCompleted && (
                <svg className="h-4 w-4 sm:h-3.5 sm:w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )
            )}
          </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4
                className={`min-w-0 break-words text-sm font-medium sm:text-base ${
                  aufgabe.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {aufgabe.title}
              </h4>
              {entfaellt && <EntfaelltKennzeichen />}
              {aufgabe.dueDate && !aufgabe.isCompleted && (
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {aufgabe.eilt && <EiltKennzeichen />}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      ueberfaellig ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {ueberfaellig
                      ? `Überfällig seit ${formatDatumDE(aufgabe.dueDate)}`
                      : `Fällig ${formatDatumDE(aufgabe.dueDate)}`}
                  </span>
                </span>
              )}
            </div>

            {/* Hinweis aus der Checklisten-Vorlage — was genau gemeint ist. */}
            {aufgabe.description && (
              <p
                className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground"
                data-hinweis="beschreibung"
              >
                {aufgabe.description}
              </p>
            )}

            {/* Bemerkung zur Position (Onboarding) — eigener Kasten, getrennt vom Katalog-Hinweis. */}
            <BemerkungKasten bemerkung={aufgabe.bemerkung} />

            {/* Übergabe vermerken (Onboarding, Stufe 2) — getrennt vom Abhaken. */}
            {onboardingAusgabe && !readOnly && !entfaellt && (
              <AusgabeVermerk
                aufgabeId={aufgabe.id}
                ausgabe={onboardingAusgabe}
                erledigt={aufgabe.isCompleted}
                gesperrt={laeuft}
                onVermerken={(stuecke: VermerkEingabe[]) =>
                  ausgabeSenden(aufgabe.id, { method: "POST", body: { stuecke } })
                }
                onEntfernen={(ausgabeId) =>
                  ausgabeSenden(aufgabe.id, { method: "DELETE", pfad: `/${encodeURIComponent(ausgabeId)}` })
                }
              />
            )}

            {/* Rücknahme, Sperre bzw. „Schließung prüfen“ (Offboarding, Stufe 2) — Kennung und Zustand. */}
            {ruecknahme && (
              <RuecknahmeAuswahl
                ausgabe={ruecknahme}
                erledigt={aufgabe.isCompleted}
                readOnly={readOnly}
                gesperrt={laeuft}
                onWahl={(zustand) => void zustandWaehlen(aufgabe, zustand)}
              />
            )}

            {entfaellt && (
              <p className="mt-1.5 text-xs text-muted-foreground" data-entfaellt-text>
                {ENTFAELLT_TEXT}
              </p>
            )}

            {aufgabe.isCompleted && !entfaellt && aufgabe.completedAt && (
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
              {/* Arbeitsort (Onboarding, E-A10) — nur, wenn er von der Einrichtung abweicht. */}
              {arbeitsort && (
                <dd className="break-words text-xs text-muted-foreground" data-arbeitsort>
                  Arbeitsort: <span className="font-medium text-foreground">{arbeitsort}</span>
                </dd>
              )}
            </div>
            {bezug && (
              <div>
                <dt className="text-xs text-muted-foreground">{bezugsdatumLabel}</dt>
                <dd className="font-medium text-foreground">{formatDatumDE(bezug)}</dd>
              </div>
            )}
          </dl>

          {/* Zweite Reihe: nur, was genau diese Stelle sehen darf — dazu im
              Onboarding Angaben und Hinweis aus „Ausstattung & Zugänge“. */}
          {nurFuerSichtbar && (
            <div className="mt-3 border-t pt-3" data-zusatz>
              <p className="text-xs font-semibold text-foreground">
                Nur für {daten.abteilung.name}
              </p>
              {zusatzFelder.length > 0 && (
                <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  {zusatzFelder.map(([feld, wert]) => (
                    <div key={feld}>
                      <dt className="text-xs text-muted-foreground">{ZUSATZ_LABELS_SEITE[feld]}</dt>
                      <dd className="break-words font-medium text-foreground">{wert}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <AngabenEintraege angaben={angaben} hinweis={stellenHinweis} />
            </div>
          )}

          {bezug && (
            <div className="mt-3">
              {countdownLabel && (
                <p className="text-xs text-muted-foreground">{countdownLabel}</p>
              )}
              <p className="text-sm font-medium text-foreground" data-countdown>
                {countdownText(tageBis(bezug, nun))}
              </p>
            </div>
          )}

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

        {/* Alles erledigt (entfallene zaehlen nicht mit) */}
        {alleErledigt && (
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

        {/* Entfallene Aufgaben (Onboarding): von der Personalabteilung gestrichen */}
        {entfalleneAufgaben.length > 0 && (
          <section className="mt-8" aria-labelledby="entfallene-aufgaben">
            <h2 id="entfallene-aufgaben" className="mb-3 text-sm font-semibold text-muted-foreground">
              Entfallene Aufgaben ({entfalleneAufgaben.length})
            </h2>
            {gesamt === 0 && (
              <p className="mb-3 text-sm text-muted-foreground" role="status">
                Für Sie ist nichts mehr zu tun – alle Aufgaben sind entfallen.
              </p>
            )}
            <ul className="space-y-3">{entfalleneAufgaben.map(renderAufgabe)}</ul>
          </section>
        )}

        {aufgaben.length === 0 && (
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
