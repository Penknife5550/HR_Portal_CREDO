"use client";

/**
 * Dialog „E-Mail schreiben“ (Paket 3).
 *
 * An (Adresse aus dem Vorgang, im Offboarding privat/dienstlich zur Wahl, oder
 * eine andere mit freigegebener Domain), Betreff, Nachricht, bis zu 10 Anhaenge
 * (PDF, JPG, PNG, WebP, zusammen 9 MB). „E-Mail senden“ bleibt gesperrt,
 * solange `sendenGesperrtGrund` einen Grund nennt — dieselben Regeln prueft der
 * Server verbindlich (die Endung hier ist nur eine Vorpruefung, dort zaehlen
 * die Bytes).
 *
 * Je geoeffnetem Dialog eine Kennung: Bricht die Verbindung nach dem Versand
 * ab und HR klickt erneut, erkennt der Server den zweiten Versuch und schickt
 * nichts noch einmal.
 */

import { useMemo, useRef, useState } from "react";
import { FileTextIcon, UploadCloudIcon } from "lucide-react";
import { empfaengerFreigegeben } from "@/lib/empfaenger-freigabe";
import { formatBytes } from "@/lib/format";
import {
  ACCEPT_ATTRIBUT,
  MAX_ANHAENGE,
  MAX_ANHAENGE_BYTES,
  MAX_BETREFF_ZEICHEN,
  MAX_NACHRICHT_ZEICHEN,
  MELDUNGEN,
  anhangZahlText,
  dateiVorpruefen,
  individuelleMailZeitpunkt,
  pruefsummeKurz,
  sendenGesperrtGrund,
  type IndividuelleMailAnhangZeile,
  type IndividuelleMailModul,
  type IndividuelleMailUebersicht,
  type IndividuelleMailVersandAntwort,
} from "@/lib/individuelle-mail";

const ANDERE = "__andere__";

interface GewaehlteDatei {
  schluessel: string;
  datei: File;
  fehler: string | null;
}

/** UUID v4. `randomUUID` gibt es nur in sicheren Kontexten (https, localhost). */
function neueKennung(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function AnhangListe({ anhaenge, mitPruefsumme }: { anhaenge: IndividuelleMailAnhangZeile[]; mitPruefsumme: boolean }) {
  return (
    <ul className="space-y-1">
      {anhaenge.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="break-all">{a.dateiname}</span>
          <span className="text-xs text-muted-foreground">
            {formatBytes(a.groesse)}
            {mitPruefsumme ? ` · Prüfsumme ${pruefsummeKurz(a.sha256)}` : ""}
          </span>
          {a.verfuegbar ? (
            <a
              href={`/api/individuelle-mail/anhaenge/${a.id}`}
              className="text-xs text-credo-blau underline hover:no-underline"
            >
              Öffnen
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">(Datei gelöscht)</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function IndividuelleMailDialog({
  modul,
  refId,
  uebersicht,
  onClose,
  onVersendet,
}: {
  modul: IndividuelleMailModul;
  refId: string;
  uebersicht: IndividuelleMailUebersicht;
  onClose: () => void;
  onVersendet: () => void;
}) {
  const { vorgang } = uebersicht;
  const [kennung] = useState(neueKennung);
  const [wahl, setWahl] = useState<string>(vorgang.adressen[0]?.adresse ?? ANDERE);
  const [andere, setAndere] = useState("");
  const [betreff, setBetreff] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [dateien, setDateien] = useState<GewaehlteDatei[]>([]);
  const [ziehen, setZiehen] = useState(false);
  const [sendend, setSendend] = useState(false);
  const [fehler, setFehler] = useState("");
  const [ergebnis, setErgebnis] = useState<IndividuelleMailVersandAntwort | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  const empfaenger = (wahl === ANDERE ? andere : wahl).trim();
  const empfaengerErlaubt = useMemo(() => {
    if (vorgang.adressen.some((a) => a.adresse.toLowerCase() === empfaenger.toLowerCase())) return true;
    // Dieselbe Regel wie der Server (empfaenger-freigabe.ts): leere Liste = frei.
    return empfaengerFreigegeben({ empfaenger, empfaengerVorgang: "", domains: uebersicht.erlaubteDomains });
  }, [empfaenger, vorgang.adressen, uebersicht.erlaubteDomains]);

  const summe = dateien.reduce((s, d) => s + d.datei.size, 0);
  const gesperrt = sendenGesperrtGrund({
    empfaenger,
    empfaengerErlaubt,
    betreff,
    nachricht,
    dateien: dateien.map((d) => ({ size: d.datei.size, fehler: d.fehler })),
  });

  function hinzufuegen(liste: FileList | null) {
    if (!liste) return;
    const neu = Array.from(liste).map((datei, i) => ({
      schluessel: `${Date.now()}-${i}-${datei.name}`,
      datei,
      fehler: dateiVorpruefen(datei),
    }));
    setDateien((alt) => [...alt, ...neu]);
  }

  async function senden() {
    setSendend(true);
    setFehler("");
    try {
      const form = new FormData();
      form.set("modul", modul);
      form.set("refId", refId);
      form.set("dialogKennung", kennung);
      form.set("empfaenger", empfaenger);
      form.set("betreff", betreff.trim());
      form.set("nachricht", nachricht);
      for (const d of dateien) form.append("dateien", d.datei, d.datei.name);
      const res = await fetch("/api/individuelle-mail", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setErgebnis(j.data as IndividuelleMailVersandAntwort);
        onVersendet();
      } else {
        setFehler(j.error || MELDUNGEN.versandFehlgeschlagen);
      }
    } catch {
      // Die Mail kann trotzdem draussen sein. Erneut klicken ist sicher: Die
      // Kennung dieses Dialogs verhindert einen zweiten Versand.
      setFehler("Verbindungsfehler. Bitte erneut auf „E-Mail senden“ klicken – eine schon versendete E-Mail geht nicht doppelt hinaus.");
    } finally {
      setSendend(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="individuelle-mail-titel"
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="individuelle-mail-titel" className="text-base font-bold text-foreground">
              E-Mail schreiben
            </h2>
            <p className="text-xs text-muted-foreground">
              {vorgang.name || "Ohne Namen"}
              {vorgang.displayId ? ` · ${vorgang.displayId}` : ""}
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

        {ergebnis ? (
          <div className="px-6 py-5">
            <div className="rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-3 text-sm text-credo-gruen">
              ✓ E-Mail „{ergebnis.betreff}“ an {ergebnis.empfaenger} versendet.
            </div>
            {ergebnis.anhaenge.length > 0 && (
              <div className="mt-4">
                <AnhangListe anhaenge={ergebnis.anhaenge} mitPruefsumme />
              </div>
            )}
            {ergebnis.warnungen.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-4 py-2 text-xs text-foreground">
                {ergebnis.warnungen.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              „Öffnen“ ist 12 Monate lang möglich. Danach werden Datei und Text gelöscht; der Nachweis mit Datum,
              Empfänger, Betreff, Dateinamen und Prüfsummen bleibt.
            </p>
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
          <div className="space-y-4 px-6 py-5">
            {/* ===== An ===== */}
            <div>
              <label htmlFor="im-an" className="text-xs font-semibold text-muted-foreground">
                An
              </label>
              <select
                id="im-an"
                value={wahl}
                onChange={(e) => setWahl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {vorgang.adressen.map((a) => (
                  <option key={a.adresse} value={a.adresse}>
                    {a.adresse} ({a.bezeichnung})
                  </option>
                ))}
                <option value={ANDERE}>Andere Adresse…</option>
              </select>
              {wahl === ANDERE && (
                <input
                  type="email"
                  value={andere}
                  onChange={(e) => setAndere(e.target.value)}
                  placeholder="name@example.org"
                  className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Andere Adresse"
                />
              )}
              {wahl === ANDERE && empfaenger && !empfaengerErlaubt && (
                <p className="mt-1 text-xs text-credo-rot">{MELDUNGEN.adresseNichtFreigegeben}</p>
              )}
            </div>

            {/* ===== Betreff ===== */}
            <div>
              <label htmlFor="im-betreff" className="text-xs font-semibold text-muted-foreground">
                Betreff *
              </label>
              <input
                id="im-betreff"
                value={betreff}
                maxLength={MAX_BETREFF_ZEICHEN}
                onChange={(e) => setBetreff(e.target.value.replace(/[\r\n]/g, " "))}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* ===== Nachricht ===== */}
            <div>
              <label htmlFor="im-nachricht" className="text-xs font-semibold text-muted-foreground">
                Nachricht *
              </label>
              <textarea
                id="im-nachricht"
                value={nachricht}
                maxLength={MAX_NACHRICHT_ZEICHEN}
                onChange={(e) => setNachricht(e.target.value)}
                rows={8}
                placeholder={"Guten Tag …,\n\n…\n\nFreundliche Grüße"}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{MELDUNGEN.hinweisSignatur}</span>
                <span>
                  {nachricht.length.toLocaleString("de-DE")} / {MAX_NACHRICHT_ZEICHEN.toLocaleString("de-DE")}
                </span>
              </div>
            </div>

            {/* ===== Anhaenge ===== */}
            <div>
              <span className="text-xs font-semibold text-muted-foreground">Anhänge (optional)</span>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setZiehen(true);
                }}
                onDragLeave={() => setZiehen(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setZiehen(false);
                  hinzufuegen(e.dataTransfer.files);
                }}
                className={`mt-1 flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm ${
                  ziehen ? "border-credo-blau bg-credo-blau/5" : "border-border"
                }`}
              >
                <UploadCloudIcon className="h-5 w-5 text-muted-foreground" />
                <span>
                  Dateien hierher ziehen oder{" "}
                  <button type="button" onClick={() => eingabe.current?.click()} className="text-credo-blau underline">
                    auswählen
                  </button>
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, JPG, PNG oder WebP · bis zu {MAX_ANHAENGE} Dateien · zusammen höchstens{" "}
                  {MAX_ANHAENGE_BYTES / 1024 / 1024} MB
                </span>
                <input
                  ref={eingabe}
                  type="file"
                  multiple
                  accept={ACCEPT_ATTRIBUT}
                  className="hidden"
                  onChange={(e) => {
                    hinzufuegen(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              {dateien.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {dateien.map((d) => (
                    <li key={d.schluessel} className="flex flex-wrap items-center gap-2 text-sm">
                      <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className={`break-all ${d.fehler ? "text-credo-rot" : "text-foreground"}`}>{d.datei.name}</span>
                      <span className="text-xs text-muted-foreground">{formatBytes(d.datei.size)}</span>
                      {d.fehler && <span className="text-xs text-credo-rot">– {d.fehler}</span>}
                      <button
                        type="button"
                        onClick={() => setDateien((alt) => alt.filter((x) => x.schluessel !== d.schluessel))}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        Entfernen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={`mt-1 text-xs ${summe > MAX_ANHAENGE_BYTES ? "text-credo-rot" : "text-muted-foreground"}`}>
                {anhangZahlText(dateien.length)} · {formatBytes(summe)} von {MAX_ANHAENGE_BYTES / 1024 / 1024} MB
              </p>
            </div>

            {/* ===== Hinweise ===== */}
            <div className="rounded-lg border border-credo-gelb/40 bg-credo-gelb/10 px-4 py-2 text-xs text-foreground">
              {MELDUNGEN.hinweisUnverschluesselt}{" "}
              {uebersicht.antwortAn
                ? `Antworten gehen an das HR-Postfach: ${uebersicht.antwortAn}.`
                : "Es ist keine Antwortadresse eingerichtet – Antworten gehen an den Absender des Portals."}{" "}
              {MELDUNGEN.hinweisKopie}
            </div>

            {fehler && (
              <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
                {fehler}
              </div>
            )}

            {/* ===== Verlauf ===== */}
            {uebersicht.verlauf.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Bisher gesendete E-Mails ({uebersicht.verlauf.length})</summary>
                <ul className="mt-2 space-y-3">
                  {uebersicht.verlauf.map((v) => (
                    <li key={v.id}>
                      <div>
                        {individuelleMailZeitpunkt(v.gesendetAm)} · „{v.betreff}“ an {v.empfaenger}
                        {v.empfaengerAbweichend ? " (abweichende Adresse)" : ""}
                        {v.gesendetVon ? ` · von ${v.gesendetVon}` : ""}
                      </div>
                      {v.anhaenge.length > 0 && (
                        <div className="mt-1 pl-2">
                          <AnhangListe anhaenge={v.anhaenge} mitPruefsumme={false} />
                        </div>
                      )}
                      {v.inhaltGeloescht && <div className="mt-1">Text und Anhänge nach 12 Monaten gelöscht.</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {gesperrt && (betreff || nachricht || dateien.length > 0) && (
                <span className="mr-auto text-xs text-muted-foreground">{gesperrt}</span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={senden}
                disabled={sendend || gesperrt !== null}
                className="rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
              >
                {sendend ? "Sende…" : "E-Mail senden"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
