"use client";

/**
 * Versand-Dialog fuer ein Dokumentenpaket.
 *
 * Modulneutral: Alles Vorgangsbezogene kommt ueber `modul` und `refId` vom
 * Server (GET /api/dokumentenpaket). Phase 2 bindet denselben Dialog in
 * Offboarding, Verbeamtung und Vertragsverlaengerung ein.
 *
 * Die Bestaetigung sensibler Vorlagen ist hier eine Anzeige, keine Schranke —
 * die Schranke sitzt im Server (409 ohne Bestaetigung, und der Resolver bekommt
 * die sensiblen Platzhalter gar nicht erst). Der Dialog macht sie nur sichtbar
 * und benennt, worum es geht.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTextIcon } from "lucide-react";

export interface SensiblesFeld {
  key: string;
  label: string;
}

export interface AngebotPosition {
  art: "PDF" | "VORLAGE";
  id: string;
  name: string;
  beschreibung: string | null;
  scope: "GLOBAL" | "MANDANT";
  groesse: number;
  sensibleFelder: SensiblesFeld[];
}

export interface PaketAngebot {
  modul: string;
  organizationId: string;
  empfaengerVorschlag: string;
  vorname: string;
  nachname: string;
  displayId: string | null;
  standardpaket: { art: "PDF" | "VORLAGE"; id: string }[];
  verfuegbar: AngebotPosition[];
  verlauf: {
    id: string;
    createdAt: string;
    empfaenger: string;
    anzahl: number;
    empfaengerAbweichend: boolean;
  }[];
  maxBytes: number;
}

interface PruefPosition {
  art: "PDF" | "VORLAGE";
  id: string;
  name: string;
  groesse: number;
  geschaetzt: boolean;
  fehlendeFelder: string[];
  sensibleFelder: SensiblesFeld[];
  bestaetigungNoetig: boolean;
}

interface Pruefung {
  empfaengerVorgang: string;
  empfaengerAbweichend: boolean;
  positionen: PruefPosition[];
  gesamtGroesse: number;
  gesamtGeschaetzt: boolean;
  ueberGroessenGrenze: boolean;
  pdfDienstErreichbar: boolean;
  mailvorlageKenntNachricht: boolean;
  warnungen: string[];
}

interface Ergebnis {
  versandId: string;
  empfaenger: string;
  dokumente: { name: string; dateiname: string; art: string }[];
  warnungen: string[];
}

function schluessel(p: { art: string; id: string }): string {
  return `${p.art}:${p.id}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


/**
 * Wartezeit nach der letzten Aenderung, bevor die Vorpruefung laeuft.
 *
 * Sie rendert Vorlagen probeweise — bei jedem Tastendruck waere das zu viel.
 * Eine halbe Sekunde fasst Tippen zusammen und ist kurz genug, dass die
 * Rueckmeldung noch zur Aktion gehoert.
 */
const VORPRUEFUNG_VERZOEGERUNG_MS = 500;

export function DokumentenpaketDialog({
  angebot,
  modul,
  refId,
  titel = "Dokumente versenden",
  onClose,
  onVersendet,
}: {
  angebot: PaketAngebot;
  modul: string;
  refId: string;
  titel?: string;
  onClose: () => void;
  onVersendet: () => void;
}) {
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(
    () => new Set(angebot.standardpaket.map(schluessel)),
  );
  const [bestaetigt, setBestaetigt] = useState<Set<string>>(new Set());
  const [empfaenger, setEmpfaenger] = useState(angebot.empfaengerVorschlag);
  const [nachricht, setNachricht] = useState("");
  const [pruefung, setPruefung] = useState<Pruefung | null>(null);
  const [pruefend, setPruefend] = useState(false);
  const [sendend, setSendend] = useState(false);
  const [fehler, setFehler] = useState("");
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  const positionen = useMemo(
    () => angebot.verfuegbar.filter((p) => gewaehlt.has(schluessel(p))),
    [angebot.verfuegbar, gewaehlt],
  );

  // Reihenfolge: erst das Standardpaket in seiner konfigurierten Folge, dann
  // alles zusaetzlich Gewaehlte. Der Server nimmt die Liste so, wie sie kommt.
  const reihenfolge = useMemo(() => {
    const standard = angebot.standardpaket
      .map((s) => angebot.verfuegbar.find((p) => schluessel(p) === schluessel(s)))
      .filter((p): p is AngebotPosition => Boolean(p) && gewaehlt.has(schluessel(p!)));
    const rest = positionen.filter((p) => !standard.some((s) => s.id === p.id && s.art === p.art));
    return [...standard, ...rest];
  }, [angebot.standardpaket, angebot.verfuegbar, gewaehlt, positionen]);

  const sensibleOffen = reihenfolge.filter(
    (p) => p.sensibleFelder.length > 0 && !bestaetigt.has(schluessel(p)),
  );
  const adresseGueltig = EMAIL_MUSTER.test(empfaenger.trim());
  const adresseAbweichend =
    empfaenger.trim().toLowerCase() !== angebot.empfaengerVorschlag.trim().toLowerCase();

  // --- Vorpruefung, verzoegert nach jeder Aenderung ---
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pruefe = useCallback(async () => {
    setPruefend(true);
    try {
      const res = await fetch("/api/dokumentenpaket/pruefen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modul,
          refId,
          positionen: reihenfolge.map((p) => ({ art: p.art, id: p.id })),
          empfaenger: adresseGueltig ? empfaenger.trim() : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setPruefung(j.data);
        setFehler("");
      } else {
        setPruefung(null);
        setFehler(j.error || "Die Vorpruefung ist fehlgeschlagen.");
      }
    } catch {
      setPruefung(null);
      setFehler("Verbindungsfehler bei der Vorpruefung.");
    } finally {
      setPruefend(false);
    }
  }, [modul, refId, reihenfolge, empfaenger, adresseGueltig]);

  useEffect(() => {
    if (ergebnis) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(pruefe, VORPRUEFUNG_VERZOEGERUNG_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pruefe, ergebnis]);

  function umschalten(p: AngebotPosition) {
    const k = schluessel(p);
    setGewaehlt((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
        // Wer eine Vorlage abwaehlt, soll ihre Bestaetigung nicht behalten.
        setBestaetigt((b) => {
          const nb = new Set(b);
          nb.delete(k);
          return nb;
        });
      } else {
        next.add(k);
      }
      return next;
    });
  }

  function bestaetigungUmschalten(p: AngebotPosition) {
    const k = schluessel(p);
    setBestaetigt((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const versandGesperrt =
    sendend ||
    reihenfolge.length === 0 ||
    !adresseGueltig ||
    sensibleOffen.length > 0 ||
    Boolean(pruefung?.ueberGroessenGrenze) ||
    (reihenfolge.some((p) => p.art === "VORLAGE") && pruefung?.pdfDienstErreichbar === false);

  async function versenden() {
    setSendend(true);
    setFehler("");
    try {
      const res = await fetch("/api/dokumentenpaket/versenden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modul,
          refId,
          positionen: reihenfolge.map((p) => ({
            art: p.art,
            id: p.id,
            ...(p.sensibleFelder.length > 0 ? { bestaetigt: true } : {}),
          })),
          empfaenger: empfaenger.trim(),
          ...(nachricht.trim() ? { nachricht: nachricht.trim() } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setErgebnis(j.data);
        onVersendet();
      } else {
        setFehler(j.error || "Das Paket konnte nicht versendet werden.");
      }
    } catch {
      setFehler("Verbindungsfehler beim Versand.");
    } finally {
      setSendend(false);
    }
  }

  const pruefZeile = (p: AngebotPosition): PruefPosition | undefined =>
    pruefung?.positionen.find((x) => x.art === p.art && x.id === p.id);

  const standardSchluessel = new Set(angebot.standardpaket.map(schluessel));
  const bloecke: { titel: string; hinweis: string; eintraege: AngebotPosition[] }[] = [
    {
      titel: "Standardpaket",
      hinweis: "Für diesen Mandanten hinterlegt und vorausgewählt.",
      eintraege: angebot.verfuegbar.filter((p) => standardSchluessel.has(schluessel(p))),
    },
    {
      titel: "Weitere Vorlagen",
      hinweis: "Werden mit den Daten des Vorgangs befüllt.",
      eintraege: angebot.verfuegbar.filter(
        (p) => p.art === "VORLAGE" && !standardSchluessel.has(schluessel(p)),
      ),
    },
    {
      titel: "Weitere Dokumente",
      hinweis: "Feste PDFs, gehen unverändert mit.",
      eintraege: angebot.verfuegbar.filter(
        (p) => p.art === "PDF" && !standardSchluessel.has(schluessel(p)),
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">{titel}</h2>
            <p className="text-xs text-muted-foreground">
              {angebot.vorname} {angebot.nachname}
              {angebot.displayId ? ` · ${angebot.displayId}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:bg-accent"
          >
            Schließen
          </button>
        </div>

        {/* ===== Ergebnis ===== */}
        {ergebnis ? (
          <div className="px-6 py-5">
            <div className="rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-3 text-sm text-credo-gruen">
              {ergebnis.dokumente.length} Dokument
              {ergebnis.dokumente.length === 1 ? "" : "e"} an {ergebnis.empfaenger} versendet.
            </div>
            <ul className="mt-4 space-y-1 text-sm text-foreground">
              {ergebnis.dokumente.map((d) => (
                <li key={d.dateiname} className="flex items-center gap-2">
                  <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {d.name}
                  <span className="text-xs text-muted-foreground">({d.dateiname})</span>
                </li>
              ))}
            </ul>
            {ergebnis.warnungen.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-4 py-2 text-xs text-foreground">
                {ergebnis.warnungen.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90"
              >
                Fertig
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            {/* ===== Empfänger ===== */}
            <label className="text-xs font-semibold text-muted-foreground">Empfänger</label>
            <input
              value={empfaenger}
              onChange={(e) => setEmpfaenger(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            {!adresseGueltig && (
              <p className="mt-1 text-xs text-credo-rot">Bitte eine gültige E-Mail-Adresse angeben.</p>
            )}
            {adresseGueltig && adresseAbweichend && (
              <p className="mt-1 text-xs text-credo-gelb">
                Weicht von der Adresse im Vorgang ab ({angebot.empfaengerVorschlag}). Die Abweichung
                wird im Nachweis festgehalten.
              </p>
            )}

            {/* ===== Auswahl ===== */}
            {bloecke.map((block) =>
              block.eintraege.length === 0 ? null : (
                <div key={block.titel} className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {block.titel}
                  </h3>
                  <p className="mb-2 text-xs text-muted-foreground">{block.hinweis}</p>
                  <ul className="space-y-2">
                    {block.eintraege.map((p) => {
                      const k = schluessel(p);
                      const an = gewaehlt.has(k);
                      const zeile = pruefZeile(p);
                      return (
                        <li
                          key={k}
                          className={`rounded-lg border px-3 py-2 ${
                            an ? "border-border" : "border-dashed border-border opacity-60"
                          }`}
                        >
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={an}
                              onChange={() => umschalten(p)}
                              className="mt-1"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{p.name}</span>
                                {p.art === "VORLAGE" && (
                                  <span className="rounded-md bg-credo-gruen/10 px-2 py-0.5 text-[11px] font-medium text-credo-gruen">
                                    Vorlage
                                  </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">
                                  {formatBytes(zeile?.groesse ?? p.groesse)}
                                  {zeile?.geschaetzt ? " (geschätzt)" : ""}
                                </span>
                              </span>
                              {an && zeile && zeile.fehlendeFelder.length > 0 && (
                                <span className="mt-1 block text-[11px] text-credo-gelb">
                                  {zeile.fehlendeFelder.length} Feld
                                  {zeile.fehlendeFelder.length === 1 ? "" : "er"} bleibt leer:{" "}
                                  {zeile.fehlendeFelder.join(", ")}
                                </span>
                              )}
                            </span>
                          </label>

                          {/* Bestätigungsstufe je sensibler Vorlage */}
                          {an && p.sensibleFelder.length > 0 && (
                            <div className="mt-2 rounded-md border border-credo-rot/30 bg-credo-rot/5 px-3 py-2">
                              <label className="flex cursor-pointer items-start gap-2 text-[12px] text-credo-rot">
                                <input
                                  type="checkbox"
                                  checked={bestaetigt.has(k)}
                                  onChange={() => bestaetigungUmschalten(p)}
                                  className="mt-0.5"
                                />
                                <span>
                                  Ich bestätige den Versand von{" "}
                                  <strong>{p.sensibleFelder.map((f) => f.label).join(", ")}</strong>{" "}
                                  an <strong>{empfaenger.trim() || "—"}</strong> per unverschlüsselter
                                  E-Mail.
                                  {adresseAbweichend && (
                                    <span className="mt-1 block font-semibold">
                                      Achtung: Diese Adresse weicht von der im Vorgang hinterlegten ab.
                                    </span>
                                  )}
                                </span>
                              </label>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )}

            {/* ===== Nachricht ===== */}
            <div className="mt-5">
              <label className="text-xs font-semibold text-muted-foreground">
                Persönliche Nachricht (optional)
              </label>
              <textarea
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="z.B. Wir freuen uns auf Sie am 1. Oktober, Ihr Büro ist Raum 214."
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {nachricht.trim() !== "" && pruefung?.mailvorlageKenntNachricht === false && (
                <p className="mt-1 text-xs text-credo-rot">
                  Die E-Mail-Vorlage enthält die Variable <code>{"{{nachricht}}"}</code> nicht — dieser
                  Text erschiene nicht in der Mail.
                </p>
              )}
            </div>

            {/* ===== Zusammenfassung ===== */}
            <div className="mt-5 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {reihenfolge.length} Anhang/Anhänge ·{" "}
                  {formatBytes(pruefung?.gesamtGroesse ?? 0)}
                  {pruefung?.gesamtGeschaetzt ? " (geschätzt)" : ""} von{" "}
                  {formatBytes(angebot.maxBytes)}
                </span>
                {pruefend && <span>Vorprüfung läuft…</span>}
              </div>
              {pruefung?.ueberGroessenGrenze && (
                <p className="mt-1 text-credo-rot">
                  Das Paket überschreitet die Größengrenze. Bitte weniger Dokumente wählen.
                </p>
              )}
              {pruefung?.warnungen.map((w) => (
                <p key={w} className="mt-1 text-credo-gelb">
                  {w}
                </p>
              ))}
              {sensibleOffen.length > 0 && (
                <p className="mt-1 text-credo-rot">
                  {sensibleOffen.length} Vorlage(n) mit sensiblen Daten sind noch nicht bestätigt.
                </p>
              )}
            </div>

            {fehler && (
              <div className="mt-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
                {fehler}
              </div>
            )}

            {/* ===== Verlauf ===== */}
            {angebot.verlauf.length > 0 && (
              <details className="mt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Bisher versendet ({angebot.verlauf.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {angebot.verlauf.map((v) => (
                    <li key={v.id}>
                      {new Date(v.createdAt).toLocaleString("de-DE")} · {v.anzahl} Dokument
                      {v.anzahl === 1 ? "" : "e"} an {v.empfaenger}
                      {v.empfaengerAbweichend ? " (abweichende Adresse)" : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={versenden}
                disabled={versandGesperrt}
                className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
              >
                {sendend ? "Sende…" : "Versenden"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
