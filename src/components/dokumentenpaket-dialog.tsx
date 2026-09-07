"use client";

/**
 * Versand-Dialog fuer ein Dokumentenpaket.
 *
 * Modulneutral: Alles Vorgangsbezogene kommt ueber `modul` und `refId` vom
 * Server (GET /api/dokumentenpaket). Genau derselbe Dialog haengt in allen vier
 * Vorgangsmodulen — Onboarding, Vertragsverlaengerung, Verbeamtung,
 * Offboarding.
 *
 * Die Bestaetigung sensibler Vorlagen ist hier eine Anzeige, keine Schranke —
 * die Schranke sitzt im Server (409 ohne Bestaetigung, und der Resolver bekommt
 * die sensiblen Platzhalter gar nicht erst). Der Dialog macht sie nur sichtbar
 * und benennt, worum es geht.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTextIcon } from "lucide-react";
import { EMAIL_PATTERN } from "@/lib/constants";
import { empfaengerFreigegeben } from "@/lib/empfaenger-freigabe";
import { formatBytes } from "@/lib/format";
import type {
  PaketAngebotJson as PaketAngebot,
  PaketAngebotPosition as AngebotPosition,
  PaketPruefung as Pruefung,
  PaketVersandAntwort as Ergebnis,
  PruefPosition,
} from "@/lib/types/dokumentenpaket";

/**
 * `PaketAngebotJson` und nicht `PaketAngebot`: Der Dialog sieht das Angebot
 * hinter JSON.parse, dort sind `createdAt` und `altversand.am` Strings —
 * deshalb weiter unten `new Date(v.createdAt)`. Naehme jemand die Serversicht,
 * kompilierte das zwar weiter, aber die Typen luegen.
 *
 * Der Re-Export haelt src/components/dokumentenpaket-section.tsx, das den Typ
 * bisher von hier bezog, unveraendert lauffaehig.
 */
export type { PaketAngebot };

function schluessel(p: { art: string; id: string }): string {
  return `${p.art}:${p.id}`;
}

/**
 * Wartezeit nach der letzten Aenderung der AUSWAHL, bevor die Vorpruefung
 * laeuft.
 *
 * Sie rendert Vorlagen probeweise, liest jede Vorlagendatei und fragt den
 * PDF-Dienst — das soll nicht bei jedem Klick beim Zusammenstellen einzeln
 * losgehen. Eine halbe Sekunde fasst schnelles An- und Abwaehlen zusammen und
 * ist kurz genug, dass die Rueckmeldung noch zur Handlung gehoert.
 *
 * Am Empfaengerfeld haengt sie NICHT mehr (siehe Effekt weiter unten).
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
  // Der EINZIGE Ort, an dem der Angebotswert noch unmittelbar zaehlt: als
  // Startbelegung des Eingabefelds. Alles Urteilende (Sperre, Warnung,
  // Empfehlung) fragt `adresseVorgang` weiter unten.
  const [empfaenger, setEmpfaenger] = useState(angebot.empfaengerVorschlag);
  const [nachricht, setNachricht] = useState("");
  const [pruefung, setPruefung] = useState<Pruefung | null>(null);
  const [pruefend, setPruefend] = useState(false);
  const [sendend, setSendend] = useState(false);
  const [fehler, setFehler] = useState("");
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);

  /**
   * Die Bloecke des Dialogs von oben nach unten — und damit zugleich die Folge,
   * in der die Anhaenge hinausgehen.
   *
   * Block 1 folgt `angebot.standardpaket`. Das ist der Kern der Sache: Der
   * Server liefert `standardpaket` nach `orderIndex` sortiert (die Folge, die
   * unter Mandanten → Standardpaket mit den Pfeiltasten gepflegt wird),
   * `verfuegbar` dagegen alphabetisch. Frueher rendete der Dialog seinen ersten
   * Block aus `verfuegbar` und versendete nach `standardpaket` — wer das
   * Willkommensschreiben auf Position 1 zog, sah im Dialog das Leitbild oben und
   * fand im Postfach das Willkommensschreiben als ersten Anhang.
   *
   * Bloecke 2 und 3 folgen `verfuegbar` und damit dem Alphabet; dort gibt es
   * nichts Konfiguriertes zu respektieren. Ihre Reihenfolge zueinander
   * (Vorlagen vor PDFs) ist eine Setzung — sie bestimmt jetzt auch die
   * Versandfolge, weil beides aus derselben Liste kommt.
   *
   * MUSS ein useMemo bleiben: `reihenfolge` haengt daran, `pruefe` an
   * `reihenfolge` und der 500-ms-Effekt an `pruefe`. Ein bei jedem Rendern neu
   * erzeugtes Array setzte den Zeitgeber endlos zurueck — die Vorpruefung liefe
   * nie an, und das saehe man nur daran, dass Groessen und fehlende Felder
   * dauerhaft leer bleiben.
   */
  const bloecke = useMemo<{ titel: string; hinweis: string; eintraege: AngebotPosition[] }[]>(() => {
    const imStandard = new Set(angebot.standardpaket.map(schluessel));
    return [
      {
        titel: "Standardpaket",
        hinweis: "Für diesen Mandanten hinterlegt und vorausgewählt.",
        eintraege: angebot.standardpaket
          .map((s) => angebot.verfuegbar.find((p) => schluessel(p) === schluessel(s)))
          // Eine geloeschte oder deaktivierte Position faellt weg statt eine
          // Luecke zu erzeugen. ladePaketAngebot siebt sie zwar schon aus, aber
          // eine Anzeige, die auf undefined zugreift, waere der schlechtere
          // Fehler.
          .filter((p): p is AngebotPosition => p !== undefined),
      },
      {
        titel: "Weitere Vorlagen",
        hinweis: "Werden mit den Daten des Vorgangs befüllt.",
        eintraege: angebot.verfuegbar.filter(
          (p) => p.art === "VORLAGE" && !imStandard.has(schluessel(p)),
        ),
      },
      {
        titel: "Weitere Dokumente",
        hinweis: "Feste PDFs, gehen unverändert mit.",
        eintraege: angebot.verfuegbar.filter(
          (p) => p.art === "PDF" && !imStandard.has(schluessel(p)),
        ),
      },
    ];
  }, [angebot.standardpaket, angebot.verfuegbar]);

  /**
   * Was tatsaechlich hinausgeht: die Bloecke von oben nach unten, ohne die
   * abgewaehlten Zeilen. Der Server nimmt die Liste so, wie sie kommt
   * (stellePaketZusammen sortiert bewusst nicht nach).
   *
   * Die drei Bloecke sind ueberschneidungsfrei — was im Standardpaket steht,
   * ist aus 2 und 3 ausgeschlossen. Nur deshalb darf hier einfach abgeflacht
   * werden: Ein doppelter Eintrag waere ein doppelter Anhang.
   */
  const reihenfolge = useMemo(
    () => bloecke.flatMap((b) => b.eintraege).filter((p) => gewaehlt.has(schluessel(p))),
    [bloecke, gewaehlt],
  );

  const sensibleOffen = reihenfolge.filter(
    (p) => p.sensibleFelder.length > 0 && !bestaetigt.has(schluessel(p)),
  );

  /**
   * Positionen, die den Versand mit 409 abbrechen wuerden (Datei fehlt im
   * Speicher, Vorlage nicht befuellbar). Die Vorpruefung weiss das laengst —
   * ohne Sperre erfaehrt es die Person erst nach dem Klick, wenn nichts
   * hinausgegangen ist und das Paket neu zusammenzustellen waere.
   *
   * Fehlt die Zeile in der Pruefung (frisch angehakt, Pruefung laeuft noch),
   * gilt die Position als unauffaellig: Der Knopf soll nicht an einer noch
   * nicht gestellten Frage haengen.
   *
   * Steht bewusst HIER oben und nicht bei `pruefZeile` weiter unten —
   * `versandGesperrt` liest die Liste, und ein Zugriff auf eine erst spaeter
   * deklarierte const liefe in die temporale Totzone.
   */
  const blockierte = reihenfolge.filter((p) =>
    pruefung?.positionen.some((z) => z.art === p.art && z.id === p.id && z.blockiert),
  );

  /**
   * Die Adresse des Vorgangs — EINE Quelle fuer Sperre, Warnung und Empfehlung.
   *
   * Es gibt sie zweimal: `angebot.empfaengerVorschlag` stammt aus dem Abruf, der
   * die Karte gefuellt hat, `pruefung.empfaengerVorgang` aus der zuletzt
   * gelaufenen Vorpruefung. Serverseitig ist beides dasselbe Feld
   * (`vorgang.empfaenger`), nur zu verschiedenen Zeitpunkten gelesen — und der
   * Dialog steht offen, waehrend jemand anderes den Vorgang bearbeiten kann.
   *
   * Der FRISCHE Wert gilt. Der Grund ist nicht Aktualitaet um ihrer selbst
   * willen, sondern Widerspruchsfreiheit: Gesperrt wird nach dem frischen Wert
   * (`empfaengerFreigegeben` unten und, verbindlich, derselbe Aufruf im Server
   * beim Versand). Empfaehle die Anzeige daneben den alten, riete sie zu genau
   * der Adresse, die der Server ablehnt — "Bitte alt@… verwenden", gefolgt von
   * einem 409 auf ebendiese Adresse. Und die gelbe Abweichungswarnung bliebe
   * aus, obwohl der Nachweis den Versand als abweichend festhielte.
   *
   * `??` und nicht `||`: Ohne Vorpruefung (erstes Oeffnen, Netzfehler) oder bei
   * einer Antwort von vor dem Rollout gibt es nur den Angebotswert. Ein leerer
   * frischer Wert dagegen ist eine AUSSAGE — der Vorgang hat keine Adresse —
   * und darf nicht stillschweigend durch den alten ersetzt werden.
   *
   * Das Eingabefeld selbst bleibt davon unberuehrt: Es startet mit dem
   * Angebotswert (frueher gibt es nichts) und wird nie nachtraeglich
   * ueberschrieben — sonst verloere jemand mitten im Tippen seine Eingabe.
   */
  const adresseVorgang = pruefung?.empfaengerVorgang ?? angebot.empfaengerVorschlag;

  const adresseGueltig = EMAIL_PATTERN.test(empfaenger.trim());
  const adresseAbweichend =
    empfaenger.trim().toLowerCase() !== adresseVorgang.trim().toLowerCase();

  /**
   * Freigabe der Adresse — ohne eine einzige Anfrage je Tastendruck.
   *
   * Die gepflegte Domainliste kommt EINMAL mit der Vorpruefung (`erlaubteDomains`
   * steht dort unabhaengig davon, ob eine Adresse mitgeschickt wurde). Die
   * Entscheidung selbst faellt hier im Browser als reine Funktion. Frueher haette
   * dafuer jeder Tastendruck eine volle Vorpruefung ausgeloest: Vorgang laden,
   * Zugriff pruefen, jede Vorlage lesen und probeweise rendern — fuer einen
   * einzigen booleschen Wert.
   *
   * Solange noch keine Pruefung eingetroffen ist, gilt die Adresse als erlaubt.
   * Andernfalls sperrte ein Ausfall der Vorpruefung einen voellig gesunden
   * Versand; die Schranke sitzt ohnehin im Server.
   *
   * `empfaengerFreigegeben` ist DIESELBE Funktion, die der Server als Schranke
   * benutzt — sie liegt importfrei in @/lib/empfaenger-freigabe, damit dieser
   * Client sie holen kann, ohne prisma mitzuziehen. Hier ist sie nur eine
   * ANZEIGE: Sie sagt frueh, was der Server ohnehin ablehnen wuerde (409
   * EMPFAENGER_NICHT_ERLAUBT).
   */
  const adresseErlaubt = useMemo(() => {
    if (!pruefung) return true;
    return empfaengerFreigegeben({
      empfaenger,
      empfaengerVorgang: adresseVorgang,
      // Eine Antwort von vor dem Rollout kennt das Feld noch nicht — dann gibt
      // es keine Liste und damit keine Einschraenkung.
      domains: pruefung.erlaubteDomains ?? [],
    });
  }, [pruefung, empfaenger, adresseVorgang]);

  // --- Vorpruefung, verzoegert nach jeder Aenderung der AUSWAHL ---
  //
  // Die ADRESSE steht bewusst NICHT in den Abhaengigkeiten und auch nicht mehr
  // im Anfragekoerper. Die Vorpruefung liest jede Vorlage und rendert sie
  // probeweise; je Tastendruck im Empfaengerfeld waere das eine teure Anfrage
  // fuer ein Ergebnis, das der Dialog gar nicht anzeigt: Die beiden
  // adressabhaengigen Felder der Antwort (`empfaengerAbweichend`,
  // `empfaengerErlaubt`) rechnet er sich oben selbst aus — aus `adresseVorgang`
  // (dem Vorgangswert derselben Antwort) und der einmal gelieferten
  // Domainliste. Beide Felder haengen allein an der Eingabe, nicht an der
  // Auswahl; sie werden mit jedem Tastendruck neu bewertet, ohne dass dafuer
  // jemand gefragt werden muss.
  //
  // Zwei Dinge greifen ineinander, damit immer die JUENGSTE Antwort gewinnt,
  // und sie haben verschiedene Aufgaben:
  //
  //  - Der Abbruch spart Arbeit. Eine ueberholte Anfrage soll das probeweise
  //    Rendern nicht zu Ende bringen.
  //  - Der Laufzaehler entscheidet. Er MUSS es tun, weil das `.catch(() => ({}))`
  //    hinter res.json() einen Abbruch mitten im Lesen des Antwortkoerpers
  //    verschluckt: Dort kaeme ein leeres `{}` bei res.ok === true an, und die
  //    Anzeige stuende auf `undefined`. Ein blosser AbortController genuegt
  //    also nicht.
  //
  // Ohne beides ueberschreibt die langsame Antwort zu zehn Positionen die
  // schnelle zu zweien: Der Dialog zeigte fremde "Feld bleibt leer"-Hinweise
  // und eine Groessengrenze, die den Versand-Knopf faelschlich sperrt oder
  // freigibt — und die abgebrochene Anfrage haette der noch laufenden obendrein
  // den Spinner ausgeschaltet.
  const laufNr = useRef(0);
  const pruefe = useCallback(
    async (signal: AbortSignal, meineLaufNr: number) => {
      try {
        const res = await fetch("/api/dokumentenpaket/pruefen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            modul,
            refId,
            positionen: reihenfolge.map((p) => ({ art: p.art, id: p.id })),
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (laufNr.current !== meineLaufNr) return;
        if (res.ok) {
          setPruefung(j.data);
          setFehler("");
        } else {
          setPruefung(null);
          setFehler(j.error || "Die Vorprüfung ist fehlgeschlagen.");
        }
      } catch {
        // Ein Abbruch landet auch hier. Dann ist der Zaehler aber schon
        // weitergedreht, und "Verbindungsfehler" waere eine Falschmeldung ueber
        // eine Anfrage, die niemand mehr wollte.
        if (laufNr.current !== meineLaufNr) return;
        setPruefung(null);
        setFehler("Verbindungsfehler bei der Vorprüfung.");
      } finally {
        // Nur die juengste Anfrage darf den Spinner ausschalten, sonst nimmt ihn
        // die abgebrochene der noch laufenden weg.
        if (laufNr.current === meineLaufNr) setPruefend(false);
      }
    },
    [modul, refId, reihenfolge],
  );

  useEffect(() => {
    if (ergebnis) return;
    const controller = new AbortController();
    const meineLaufNr = laufNr.current;
    // Der Spinner beginnt schon mit der Wartezeit, nicht erst mit der Anfrage:
    // In diesen 500 ms steht in der Zusammenfassung noch das Ergebnis der
    // vorigen Auswahl — ohne Hinweis darauf saehe man eine Groessenangabe, die
    // zur angezeigten Liste nicht mehr passt.
    setPruefend(true);
    const zeitgeber = setTimeout(() => {
      void pruefe(controller.signal, meineLaufNr);
    }, VORPRUEFUNG_VERZOEGERUNG_MS);
    return () => {
      clearTimeout(zeitgeber);
      // Weiterdrehen, BEVOR abgebrochen wird: Ab hier ist keine laufende
      // Anfrage mehr die juengste — auch dann nicht, wenn der Dialog schliesst
      // und gar keine neue folgt. So schreibt auch niemand mehr in den State
      // einer ausgehaengten Komponente.
      laufNr.current += 1;
      controller.abort();
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

  // Bewusst NICHT dabei: `pruefung === null` und `pruefend`. Beim ersten
  // Oeffnen und bei einem Netzfehler der Vorpruefung bliebe der Knopf sonst
  // dauerhaft gesperrt, obwohl das Paket voellig versandfaehig ist — und mit
  // `pruefend` flackerte er bei jeder Auswahlaenderung. Was wirklich abbrechen
  // wuerde, faengt der Server ab (409/413).
  const versandGesperrt =
    sendend ||
    reihenfolge.length === 0 ||
    !adresseGueltig ||
    !adresseErlaubt ||
    sensibleOffen.length > 0 ||
    blockierte.length > 0 ||
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
            // Der TATSAECHLICHE Haekchenstand, nicht pauschal true. Sonst
            // waere die Bestaetigung eine blosse Behauptung des Clients und
            // die Schranke haenge allein am gesperrten Knopf — der 409 des
            // Servers koennte gar nicht mehr greifen.
            ...(p.sensibleFelder.length > 0
              ? { bestaetigt: bestaetigt.has(schluessel(p)) }
              : {}),
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
                {/* Der Vorgang KANN ohne Adresse dastehen (beim Offboarding etwa
                    ist sie `privat || dienstlich`, und beides darf leer sein).
                    Dann waere "ab ()" eine Klammer ohne Inhalt — die Abweichung
                    selbst stimmt trotzdem, es gibt eben nichts, wovon sie
                    abweicht. */}
                {adresseVorgang.trim()
                  ? `Weicht von der Adresse im Vorgang ab (${adresseVorgang.trim()}).`
                  : "Im Vorgang ist keine Adresse hinterlegt."}{" "}
                Die Abweichung wird im Nachweis festgehalten.
              </p>
            )}
            {adresseGueltig && !adresseErlaubt && (
              <p className="mt-1 text-xs font-semibold text-credo-rot">
                An diese Adresse darf nicht versendet werden: Sie weicht von der Adresse im Vorgang
                ab und ihre Domain ist nicht freigegeben
                {(pruefung?.erlaubteDomains ?? []).length > 0
                  ? ` (erlaubt: ${(pruefung?.erlaubteDomains ?? []).join(", ")})`
                  : ""}
                .{" "}
                {adresseVorgang.trim()
                  ? `Bitte ${adresseVorgang.trim()} verwenden oder die Freigabeliste in den Einstellungen (SMTP) ergänzen lassen.`
                  : "Bitte die Freigabeliste in den Einstellungen (SMTP) ergänzen lassen."}
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
                              {an && zeile?.blockiert && (
                                <span className="mt-1 block text-[11px] font-semibold text-credo-rot">
                                  {p.art === "PDF"
                                    ? "Diese Datei fehlt im Speicher und kann nicht mitgesendet werden — bitte abwählen."
                                    : "Diese Vorlage lässt sich nicht befüllen und kann nicht mitgesendet werden — bitte abwählen."}
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
              {blockierte.length > 0 && (
                <p className="mt-1 text-credo-rot">
                  {blockierte.length} Dokument(e) können nicht versendet werden. Bitte die rot
                  markierten Einträge abwählen — sonst bricht der Versand ab.
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
