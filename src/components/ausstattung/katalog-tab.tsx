"use client";

/**
 * Einstellungen → Ausstattung & Zugänge: der Katalog (Feinplan S4, Mockup 6.7)
 *
 * Was Führungskräfte bei den Einstellungsmodalitäten anwählen können; jede
 * Wahl wird eine Aufgabe der Stelle. Nur Admin-Rollen (die Einstellungsseite
 * und die Routen unter /api/settings/ausstattung prüfen das).
 *
 *   - Liste mit Spalten Position, Art, Stelle, Gilt für, Fällig, Status und
 *     den Aktionen; Filter Stelle und Einrichtung laufen im Browser. Mit
 *     Einrichtungsfilter stehen ihre eigenen Positionen und die zentralen, die
 *     dort gelten — eine dort ausgeblendete zentrale mit „Ausgeblendet hier“
 *     und dem Knopf „Hier einblenden“.
 *   - Warnungen über der Liste (Adresslücken je Stelle, ähnliche
 *     Vorlagenpunkte, Adressen außerhalb der Freigabeliste) und je Zeile.
 *   - „Vorschläge übernehmen…“, „+ Position“, Bearbeiten und Löschen über
 *     DialogRahmen (Rückfragen nie über `confirm`); bei einem Fehler des
 *     Servers bleibt der Dialog offen und zeigt dessen Text. Ausnahme: Ist
 *     die Position inzwischen woanders geändert oder gelöscht worden (409
 *     `INZWISCHEN_GEAENDERT`, 404), schließt der Dialog, die Liste lädt neu
 *     und die Meldung steht darüber — ein zweites „Speichern“ schickte sonst
 *     den alten Formularstand noch einmal. „Bearbeiten“ schickt dazu den
 *     `stand` (updatedAt beim Öffnen) mit, an dem der Server das erkennt.
 *   - Ein- und Ausschalten, Aus- und Einblenden direkt in der Zeile.
 *
 * Fokus: Nach einer Aktion lädt der Reiter ZUERST neu und schließt DANN den
 * Dialog. So ist ein verschwundener Auslöser (gelöschte Zeile, Zeile fällt aus
 * dem Filter) beim Schließen schon weg, und DialogRahmen nimmt das Ersatzziel
 * (Satz über der Liste) statt `body`. Die Zeilenknöpfe sind während ihrer
 * Anfrage gesperrt; danach bekommt der Auslöser den Fokus zurück, sonst das
 * Ersatzziel (Muster `fokusNachAktion` in nachforderung-karte.tsx). Die
 * Zeilenknöpfe nennen die Position für Screenreader hinter dem sichtbaren
 * Text (`sr-only`), damit der zugängliche Name mit ihm beginnt (WCAG 2.5.3).
 *
 * Der Reiter rechnet nichts selbst: Zeilen, Status, kleine Zeile und
 * Warnungen kommen aus katalogZeilen/katalogHinweise (src/lib/ausstattung.ts),
 * die Warnungen selbst rechnet der Server. Client-Code importiert Werte nur
 * aus der reinen Datei.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { DialogRahmen } from "@/components/unterlagen/dialog-rahmen";
import { PositionDialog, type PositionBody } from "@/components/ausstattung/position-dialog";
import {
  MELDUNGEN,
  katalogHinweise,
  katalogZeilen,
  vorschlaegeVorschau,
  type KatalogEintrag,
  type KatalogFilter,
  type KatalogUebersicht,
  type KatalogWarnung,
  type KatalogZeile,
  type KatalogZeilenStatus,
} from "@/lib/ausstattung";

/** Ersatzziel des Fokus, wenn der Auslöser eines Dialogs verschwunden ist (etwa nach dem Löschen). */
const TITEL_ID = "ausstattung-katalog-titel";
const API = "/api/settings/ausstattung";

const EINGABE =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring";
const KNOPF_HAUPT =
  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const KNOPF_NEBEN =
  "rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50";
const KNOPF_ZEILE =
  "rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50";
const KNOPF_ZEILE_KRITISCH =
  "rounded-md border border-credo-rot/40 px-2.5 py-1 text-xs text-credo-rot hover:bg-credo-rot/10 disabled:opacity-50";

const STATUS_KLASSE: Readonly<Record<KatalogZeilenStatus, string>> = {
  AKTIV: "border-credo-gruen/40 bg-credo-gruen/10 text-foreground",
  AUS: "border-border bg-muted text-muted-foreground",
  AUSGEBLENDET: "border-border bg-accent text-foreground",
};

const WARN_KLASSE: Readonly<Record<KatalogWarnung["ton"], { kasten: string; symbol: string }>> = {
  rot: { kasten: "border-credo-rot/30 bg-credo-rot/10", symbol: "text-credo-rot" },
  gelb: { kasten: "border-credo-gelb/50 bg-credo-gelb/10", symbol: "text-credo-dunkelgrau" },
};

const LEERER_FILTER: KatalogFilter = { stelle: "", einrichtungId: "" };

// =============================================
// Schnittstelle
// =============================================

interface Antwort {
  ok: boolean;
  /** HTTP-Status; null bei einem Netzfehler. */
  status: number | null;
  daten: Record<string, unknown>;
}

/** fetch mit JSON; ein Netzfehler wird zu `ok: false` ohne Daten (dann gilt der Rückfalltext). */
async function anfrage(url: string, init?: RequestInit): Promise<Antwort> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    const daten = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: typeof res.status === "number" ? res.status : null, daten };
  } catch {
    return { ok: false, status: null, daten: {} };
  }
}

function fehlerText(antwort: Antwort, rueckfall: string): string {
  return typeof antwort.daten.error === "string" && antwort.daten.error.trim() ? antwort.daten.error : rueckfall;
}

/**
 * Der Stand, den der Dialog bearbeitet, ist überholt: inzwischen woanders
 * geändert (409 `INZWISCHEN_GEAENDERT`) oder gelöscht (404).
 */
function standUeberholt(antwort: Antwort): boolean {
  return antwort.daten.grund === "INZWISCHEN_GEAENDERT" || antwort.status === 404;
}

/**
 * Sichtbarer Text eines Zeilenknopfs, dahinter die Position nur für
 * Screenreader: „Bearbeiten „Kopierkarte““. Getrennt nur durch ein
 * Leerzeichen — ein Satzzeichen am Anfang des versteckten Teils läsen manche
 * Werkzeuge als eigenes Wort („Bearbeiten : …“).
 */
function MitBezug({ text, bezug }: { text: string; bezug: string }): ReactNode {
  return (
    <>
      {text}
      <span className="sr-only">{` ${bezug}`}</span>
    </>
  );
}

// =============================================
// Kleine Bausteine
// =============================================

function Warnungen({ liste, klein = false }: { liste: KatalogWarnung[]; klein?: boolean }) {
  if (liste.length === 0) return null;
  return (
    <ul className={klein ? "mt-1 space-y-1" : "space-y-2"}>
      {liste.map((w, i) => (
        <li
          key={`${w.ton}-${i}`}
          data-warnung={w.ton}
          className={
            klein
              ? "flex items-start gap-1.5 text-xs text-foreground"
              : `flex items-start gap-2 rounded-lg border px-4 py-3 text-sm text-foreground ${WARN_KLASSE[w.ton].kasten}`
          }
        >
          <TriangleAlert
            aria-hidden="true"
            className={`${klein ? "mt-px h-3.5 w-3.5" : "mt-0.5 h-4 w-4"} shrink-0 ${WARN_KLASSE[w.ton].symbol}`}
          />
          <span>{w.text}</span>
        </li>
      ))}
    </ul>
  );
}

type DialogZustand =
  | { art: "position"; position: KatalogEintrag | null }
  | { art: "loeschen"; position: KatalogEintrag }
  | { art: "vorschlaege" };

// =============================================
// Der Reiter
// =============================================

export function AusstattungKatalogTab() {
  const [daten, setDaten] = useState<KatalogUebersicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [ladefehler, setLadefehler] = useState(false);
  const [filter, setFilter] = useState<KatalogFilter>(LEERER_FILTER);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  /** Zeile mit laufender Anfrage — deren Knöpfe sind gesperrt (Doppelklick). */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogZustand | null>(null);
  const [dialogSendet, setDialogSendet] = useState(false);
  const [dialogFehler, setDialogFehler] = useState<string | null>(null);

  const load = useCallback(async () => {
    const antwort = await anfrage(API, { cache: "no-store" });
    const ergebnis = antwort.daten.data as KatalogUebersicht | undefined;
    if (antwort.ok && ergebnis && Array.isArray(ergebnis.positionen)) {
      setDaten(ergebnis);
      setLadefehler(false);
    } else {
      setLadefehler(true);
    }
    setLaden(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!meldung) return;
    const t = setTimeout(() => setMeldung(null), meldung.art === "ok" ? 5000 : 9000);
    return () => clearTimeout(t);
  }, [meldung]);

  // ---- Dialoge ----

  function dialogOeffnen(neu: DialogZustand) {
    setDialogFehler(null);
    setDialogSendet(false);
    setDialog(neu);
  }

  const dialogSchliessen = useCallback(() => {
    setDialog(null);
    setDialogFehler(null);
  }, []);

  /**
   * Erst neu laden, dann schließen (siehe Kopf, „Fokus“): Beim Aushängen
   * prüft DialogRahmen, ob es den Auslöser noch gibt — nach dem Löschen ist
   * seine Zeile dann schon weg, und der Fokus geht auf TITEL_ID statt auf
   * einen Knopf, der gleich verschwindet. Bis dahin bleibt der Dialog im
   * Zustand „Wird gesendet…“ (kein zweiter Klick auf den alten Stand).
   */
  async function neuLadenUndSchliessen(meldungDanach: { art: "ok" | "fehler"; text: string }) {
    await load();
    setDialogSendet(false);
    setDialogFehler(null);
    setDialog(null);
    setMeldung(meldungDanach);
  }

  async function positionSpeichern(position: KatalogEintrag | null, body: PositionBody) {
    setDialogSendet(true);
    setDialogFehler(null);
    // Regel 4a des Dienstes: Der Stand beim Öffnen geht mit — hat inzwischen
    // jemand anderes gespeichert, antwortet der Server 409, statt dessen
    // Änderung mit diesem Formular still zurückzudrehen.
    const mitStand = position?.updatedAt ? { ...body, stand: position.updatedAt } : body;
    const antwort = await anfrage(position ? `${API}/${position.id}` : API, {
      method: position ? "PATCH" : "POST",
      body: JSON.stringify(mitStand),
    });
    if (!antwort.ok) {
      const text = fehlerText(antwort, "Die Position konnte nicht gespeichert werden.");
      if (position && standUeberholt(antwort)) {
        // Das Formular zeigt einen alten Stand; ihn erneut anzubieten hieße,
        // ihn beim nächsten Klick doch zu schreiben. Schließen, neu laden.
        await neuLadenUndSchliessen({ art: "fehler", text });
        return;
      }
      setDialogSendet(false);
      setDialogFehler(text);
      void load();
      return;
    }
    const gespeichert = antwort.daten.data as KatalogEintrag | undefined;
    const name = gespeichert?.bezeichnung ?? body.bezeichnung;
    await neuLadenUndSchliessen({
      art: "ok",
      text: position
        ? `Position „${name}“ gespeichert.`
        : `Position „${name}“ angelegt – ausgeschaltet. In der Liste einschalten, wenn alles passt.`,
    });
  }

  async function positionLoeschen(position: KatalogEintrag) {
    setDialogSendet(true);
    setDialogFehler(null);
    const antwort = await anfrage(`${API}/${position.id}`, { method: "DELETE" });
    if (!antwort.ok) {
      // 409 IN_VERWENDUNG: die Meldung des Servers („bitte ausschalten statt löschen“).
      setDialogSendet(false);
      setDialogFehler(fehlerText(antwort, "Die Position konnte nicht gelöscht werden."));
      void load();
      return;
    }
    await neuLadenUndSchliessen({ art: "ok", text: `Position „${position.bezeichnung}“ gelöscht.` });
  }

  async function vorschlaegeUebernehmen() {
    setDialogSendet(true);
    setDialogFehler(null);
    const antwort = await anfrage(`${API}/vorschlaege`, { method: "POST" });
    if (!antwort.ok) {
      setDialogSendet(false);
      setDialogFehler(fehlerText(antwort, "Die Vorschläge konnten nicht übernommen werden."));
      return;
    }
    const text = typeof antwort.daten.meldung === "string" ? antwort.daten.meldung : "Vorschläge übernommen.";
    await neuLadenUndSchliessen({ art: "ok", text });
  }

  // ---- Aktionen in der Zeile ----

  // Ref zusätzlich zu `busyId`: Zwei Klicks vor dem nächsten Rendern sähen
  // beide noch `busyId === null` (Muster nachforderung-karte.tsx).
  const zeileBeschaeftigt = useRef(false);
  /** Knopf, der die laufende Zeilenaktion ausgelöst hat — er bekommt danach den Fokus zurück. */
  const fokusNachAktion = useRef<HTMLElement | null>(null);

  // Fokus nach einer Zeilenaktion: Während der Anfrage ist der Knopf gesperrt
  // (`disabled`), der Browser gibt den Fokus dabei an `body` ab. Danach zurück
  // auf den Knopf, wenn es ihn noch gibt und er frei ist, sonst auf den Satz
  // über der Liste. Hat die Nutzerin den Fokus inzwischen selbst woanders
  // hingesetzt, bleibt er dort.
  useEffect(() => {
    if (busyId !== null) return;
    const ausloeser = fokusNachAktion.current;
    if (!ausloeser) return;
    fokusNachAktion.current = null;
    const aktiv = document.activeElement;
    if (aktiv && aktiv !== document.body && aktiv !== ausloeser) return;
    if (ausloeser.isConnected && !ausloeser.hasAttribute("disabled")) {
      ausloeser.focus();
      return;
    }
    document.getElementById(TITEL_ID)?.focus();
  }, [busyId]);

  async function zeilenAktion(
    zeile: KatalogZeile,
    ausloeser: HTMLElement | null,
    url: string,
    init: RequestInit,
    erfolg: string,
    rueckfall: string,
  ) {
    if (zeileBeschaeftigt.current) return;
    zeileBeschaeftigt.current = true;
    fokusNachAktion.current = ausloeser;
    setBusyId(zeile.id);
    try {
      const antwort = await anfrage(url, init);
      setMeldung(antwort.ok ? { art: "ok", text: erfolg } : { art: "fehler", text: fehlerText(antwort, rueckfall) });
      // Erst nach dem Neuladen werden die Knöpfe wieder frei — sonst ginge ein
      // zweiter Klick noch auf den alten Stand.
      await load();
    } finally {
      zeileBeschaeftigt.current = false;
      setBusyId(null);
    }
  }

  function umschalten(zeile: KatalogZeile, ausloeser: HTMLElement | null) {
    const ein = !zeile.isActive;
    void zeilenAktion(
      zeile,
      ausloeser,
      `${API}/${zeile.id}`,
      { method: "PATCH", body: JSON.stringify({ isActive: ein }) },
      `„${zeile.bezeichnung}“ ${ein ? "eingeschaltet" : "ausgeschaltet"}.`,
      "Die Position konnte nicht umgeschaltet werden.",
    );
  }

  function ausblenden(zeile: KatalogZeile, ausloeser: HTMLElement | null, einrichtungId: string, einrichtung: string) {
    const ausgeblendet = !zeile.ausgeblendetHier;
    void zeilenAktion(
      zeile,
      ausloeser,
      `${API}/${zeile.id}/ausblendung`,
      { method: "PUT", body: JSON.stringify({ organizationId: einrichtungId, ausgeblendet }) },
      ausgeblendet
        ? `„${zeile.bezeichnung}“ für ${einrichtung} ausgeblendet.`
        : `„${zeile.bezeichnung}“ für ${einrichtung} wieder eingeblendet.`,
      "Die Ausblendung konnte nicht gespeichert werden.",
    );
  }

  // ---- Darstellung ----

  if (laden) {
    return <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Lade Katalog…</div>;
  }

  if (!daten) {
    return (
      <div className="space-y-3">
        <div role="alert" className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-foreground">
          Der Katalog konnte nicht geladen werden.
        </div>
        <button
          type="button"
          className={KNOPF_NEBEN}
          onClick={() => {
            setLaden(true);
            void load();
          }}
        >
          Erneut laden
        </button>
      </div>
    );
  }

  const zeilen = katalogZeilen(daten, filter);
  const hinweise = katalogHinweise(daten, filter);
  const ort = daten.einrichtungen.find((e) => e.id === filter.einrichtungId) ?? null;
  const positionNach = (id: string) => daten.positionen.find((p) => p.id === id) ?? null;
  const vorschau = vorschlaegeVorschau(daten.positionen, daten.stellen);
  const gefiltert = filter.stelle !== "" || filter.einrichtungId !== "";

  return (
    <div className="space-y-4" data-tab="ausstattung">
      {meldung && (
        <div
          role={meldung.art === "ok" ? "status" : "alert"}
          data-meldung={meldung.art}
          className={`rounded-lg border px-4 py-3 text-sm text-foreground ${
            meldung.art === "ok" ? "border-credo-gruen/40 bg-credo-gruen/10" : "border-credo-rot/30 bg-credo-rot/10"
          }`}
        >
          {meldung.text}
        </div>
      )}
      {ladefehler && (
        <div role="alert" className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-foreground">
          Der Katalog konnte nicht neu geladen werden. Die Liste zeigt den letzten Stand.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={TITEL_ID} tabIndex={-1} className="max-w-xl text-sm text-muted-foreground outline-none">
          Was Führungskräfte bei den Einstellungsmodalitäten anwählen können. Jede Wahl wird eine Aufgabe der Stelle.
          Neue Positionen sind ausgeschaltet – erst eingeschaltet erscheinen sie im Formular.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KNOPF_NEBEN} onClick={() => dialogOeffnen({ art: "vorschlaege" })}>
            Vorschläge übernehmen…
          </button>
          <button
            type="button"
            className={KNOPF_HAUPT}
            onClick={() => dialogOeffnen({ art: "position", position: null })}
          >
            + Position
          </button>
        </div>
      </div>

      <Warnungen liste={hinweise} />

      {/* ===== Filter ===== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ausstattung-filter-stelle" className="mb-1 block text-sm font-medium text-foreground">
            Stelle
          </label>
          <select
            id="ausstattung-filter-stelle"
            value={filter.stelle}
            onChange={(e) => setFilter((f) => ({ ...f, stelle: e.target.value }))}
            className={EINGABE}
          >
            <option value="">Alle Stellen</option>
            {daten.stellen.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ausstattung-filter-einrichtung" className="mb-1 block text-sm font-medium text-foreground">
            Einrichtung
          </label>
          <select
            id="ausstattung-filter-einrichtung"
            value={filter.einrichtungId}
            onChange={(e) => setFilter((f) => ({ ...f, einrichtungId: e.target.value }))}
            className={EINGABE}
          >
            <option value="">Alle Einrichtungen</option>
            {daten.einrichtungen.map((e) => (
              <option key={e.id} value={e.id}>
                {e.isActive === false ? `${e.name} (inaktiv, mit zentralen)` : `${e.name} (mit zentralen)`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===== Liste ===== */}
      {daten.positionen.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground" data-leer="katalog">
          <p className="font-medium text-foreground">Der Katalog ist leer.</p>
          <p className="mt-1">
            Solange er leer ist, ändert sich am Formular der Führungskraft nichts. „Vorschläge übernehmen…“ legt einen
            Anfangsbestand an – ausgeschaltet.
          </p>
        </div>
      ) : zeilen.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground" data-leer="filter">
          <p>Keine Position für diesen Filter.</p>
          <button type="button" className={`mt-3 ${KNOPF_NEBEN}`} onClick={() => setFilter(LEERER_FILTER)}>
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Position</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Art</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Stelle</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Gilt für</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Fällig</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {zeilen.map((z) => {
                  const beschaeftigt = busyId === z.id;
                  const position = positionNach(z.id);
                  // Für Screenreader hinter dem sichtbaren Text: welche Position.
                  const bezug = `„${z.bezeichnung}“`;
                  return (
                    <tr key={z.id} data-position={z.id}>
                      <td className="px-4 py-3 align-top">
                        <span className="font-semibold text-foreground">{z.bezeichnung}</span>
                        {z.details.length > 0 && (
                          <span className="mt-0.5 block text-xs text-muted-foreground" data-zeile="details">
                            {z.details.join(" · ")}
                          </span>
                        )}
                        <Warnungen liste={z.warnungen} klein />
                      </td>
                      <td className="px-4 py-3 align-top text-foreground">{z.artName}</td>
                      <td className="px-4 py-3 align-top text-foreground">{z.stelleName}</td>
                      <td className="px-4 py-3 align-top">
                        {z.zentral ? (
                          <span className="rounded-full border border-credo-blau/40 bg-credo-blau/10 px-2 py-0.5 text-xs font-medium text-foreground">
                            Zentral
                          </span>
                        ) : (
                          <span className="text-foreground">{z.giltFuer}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top tabular-nums text-foreground" data-zeile="faellig">
                        {z.faellig}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          data-status={z.status}
                          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_KLASSE[z.status]}`}
                        >
                          {z.statusText}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            className={KNOPF_ZEILE}
                            disabled={beschaeftigt || !position}
                            onClick={() => position && dialogOeffnen({ art: "position", position })}
                          >
                            <MitBezug text="Bearbeiten" bezug={bezug} />
                          </button>
                          <button
                            type="button"
                            className={KNOPF_ZEILE}
                            disabled={beschaeftigt}
                            onClick={(e) => umschalten(z, e.currentTarget)}
                          >
                            <MitBezug text={z.isActive ? "Ausschalten" : "Einschalten"} bezug={bezug} />
                          </button>
                          {ort && z.ausgeblendetHier !== null && (
                            <button
                              type="button"
                              className={KNOPF_ZEILE}
                              disabled={beschaeftigt}
                              onClick={(e) => ausblenden(z, e.currentTarget, ort.id, ort.name)}
                            >
                              <MitBezug
                                text={z.ausgeblendetHier ? "Hier einblenden" : "Hier ausblenden"}
                                bezug={`${bezug} für ${ort.name}`}
                              />
                            </button>
                          )}
                          <button
                            type="button"
                            className={KNOPF_ZEILE_KRITISCH}
                            disabled={beschaeftigt || !position}
                            onClick={() => position && dialogOeffnen({ art: "loeschen", position })}
                          >
                            <MitBezug text="Löschen" bezug={bezug} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {gefiltert && zeilen.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {`${zeilen.length} von ${daten.positionen.length} Positionen.`}{" "}
          <button type="button" className="underline hover:no-underline" onClick={() => setFilter(LEERER_FILTER)}>
            Filter zurücksetzen
          </button>
        </p>
      )}

      {/* ===== Dialoge ===== */}
      {dialog?.art === "position" && (
        <PositionDialog
          position={dialog.position}
          stellen={daten.stellen}
          einrichtungen={daten.einrichtungen}
          vorgabeStelle={filter.stelle || undefined}
          sendet={dialogSendet}
          fehler={dialogFehler}
          fokusZiel={TITEL_ID}
          onAbbrechen={dialogSchliessen}
          onSpeichern={(body) => void positionSpeichern(dialog.position, body)}
        />
      )}

      {dialog?.art === "loeschen" && (
        <DialogRahmen
          titel="Position löschen?"
          untertitel={dialog.position.bezeichnung}
          name="ausstattung-loeschen"
          sendet={dialogSendet}
          fehler={dialogFehler}
          fokusZiel={TITEL_ID}
          onAbbrechen={dialogSchliessen}
          bestaetigen={{
            text: "Löschen",
            onClick: () => void positionLoeschen(dialog.position),
            grund: dialog.position.verwendung > 0 ? MELDUNGEN.IN_VERWENDUNG : null,
            farbe: "rot",
          }}
        >
          {dialog.position.verwendung > 0 ? (
            <p className="text-foreground">
              {dialog.position.verwendung === 1
                ? `„${dialog.position.bezeichnung}“ wurde schon in 1 Vorgang gewählt.`
                : `„${dialog.position.bezeichnung}“ wurde schon in ${dialog.position.verwendung} Vorgängen gewählt.`}
            </p>
          ) : (
            <>
              <p className="text-foreground">
                {`„${dialog.position.bezeichnung}“ verschwindet aus dem Katalog und aus allen Formularen, die ab jetzt geöffnet werden.`}
              </p>
              <p className="text-muted-foreground">
                Wer sie nur vorübergehend nicht anbieten will, schaltet sie besser aus. Eine gelöschte Position aus
                den Vorschlägen legt „Vorschläge übernehmen…“ wieder an.
              </p>
            </>
          )}
        </DialogRahmen>
      )}

      {dialog?.art === "vorschlaege" && (
        <DialogRahmen
          titel="Vorschläge übernehmen"
          untertitel="Anfangsbestand für den Katalog"
          name="ausstattung-vorschlaege"
          sendet={dialogSendet}
          fehler={dialogFehler}
          fokusZiel={TITEL_ID}
          onAbbrechen={dialogSchliessen}
          bestaetigen={{
            text: vorschau.fehlen === 1 ? "1 Vorschlag übernehmen" : `${vorschau.fehlen} Vorschläge übernehmen`,
            onClick: () => void vorschlaegeUebernehmen(),
            grund: vorschau.fehlen === 0 ? MELDUNGEN.VORSCHLAEGE_ALLE_VORHANDEN : null,
            farbe: "blau",
          }}
        >
          <p className="text-foreground">
            Die Vorschläge kommen zentral, ausgeschaltet und ohne Fälligkeit in den Katalog. Was schon dort steht
            (auch geändert), bleibt, wie es ist. Danach prüfen, Fälligkeiten eintragen und einschalten, was passt.
          </p>
          <div className="space-y-3">
            {vorschau.gruppen.map((g) => (
              <div key={g.departmentKey} data-vorschlaege={g.departmentKey}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.stelleName}</p>
                <ul className="mt-1 space-y-0.5">
                  {g.eintraege.map((e) => (
                    <li
                      key={e.vorschlagSchluessel}
                      data-vorschlag={e.vorschlagSchluessel}
                      className={e.vorhanden ? "text-muted-foreground" : "text-foreground"}
                    >
                      {e.bezeichnung} <span className="text-xs text-muted-foreground">({e.artName})</span>
                      {e.vorhanden && <span className="text-xs"> – schon im Katalog</span>}
                      {e.hinweis && (
                        <span className="block text-xs text-muted-foreground" data-vorschlag-hinweis>
                          {e.hinweis}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogRahmen>
      )}
    </div>
  );
}
