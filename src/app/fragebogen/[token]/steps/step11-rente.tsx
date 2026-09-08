"use client";

/**
 * Schritt 11 — Rentenversicherung (Minijob-Checkliste, Abschnitt 5)
 *
 * Die folgenreichste Entscheidung im Fragebogen. Deshalb steht hier mehr Text
 * als sonst, und die vier Wege sind bewusst gleich ausführlich beschrieben —
 * niemand soll durch die Gestaltung in eine Richtung geschoben werden.
 *
 * Das Merkblatt steht **im Formular**, nicht nur hinter einem Verweis nach
 * draußen: Ein Download, den niemand öffnet, erfüllt die Aufklärungspflicht nur
 * auf dem Papier.
 */

import { useMemo, useState } from "react";
import { ErklaerBox, HilfeHinweis } from "@/components/hilfe-hinweis";
import { FieldConfigHelper } from "@/lib/field-definitions";
import {
  BINDUNG_TEXT,
  MERKBLATT_KERN,
  RV_OPTIONEN,
  RV_SAETZE,
  getRvOption,
  istWaehlbar,
  prozent,
} from "@/lib/minijob-rentenversicherung";
import { statusLabel } from "@/lib/minijob-status";

/**
 * Wo der amtliche Wortlaut steht — verlinkt, nicht mitgeliefert.
 *
 * Frueher zeigte der Verweis auf `public/system-dokumente/merkblatt-rv-befreiung.pdf`
 * mit dem Zusatz „Stand 30. Juni 2026". Eine mitgelieferte Datei muss von Hand
 * nachgezogen werden, sobald die Minijob-Zentrale nachlegt — und bis das jemand
 * bemerkt, liefern wir dem Beschaeftigten wissentlich einen veralteten Wortlaut
 * aus, auf den er anschliessend seine Kenntnisnahme bestaetigt. Der Verweis auf
 * die gepflegte Seite kann nicht veralten; ein festes Standdatum daneben waere
 * irrefuehrend und faellt deshalb weg.
 *
 * Die Seite fuehrt die „Checkliste fuer geringfuegig entlohnte oder kurzfristig
 * Beschaeftigte" — das Merkblatt zur Befreiung ist deren Anlage. Genau diese
 * Adresse steht schon in der Projektdokumentation (docs/README.md,
 * docs/module/minijob/minijob-umsetzungsstand.md) als Bezugsquelle des Originals.
 */
const MERKBLATT_QUELLE =
  "https://www.minijob-zentrale.de/SharedDocs/Downloads/DE/Formulare/gewerblich/Checkliste_BDA_Personalfragebogen.html";

/**
 * Status aus dem Schritt „Weitere Beschaeftigung", bei denen die
 * Rentenversicherungsfreiheit schon von Gesetzes wegen feststeht.
 *
 * Wer als Altersvollrentner nach der Regelaltersgrenze oder als
 * Versorgungsempfaenger beschaeftigt wird, braucht keine Befreiung — es gibt
 * schlicht nichts zu beantragen. Der Schritt wird trotzdem gezeigt: So steht
 * die Feststellung „von Gesetzes wegen frei" im Fragebogen und im Nachweis,
 * statt dort einfach zu fehlen. Ein uebersprungener Schritt hinterlaesst eine
 * Luecke, die spaeter niemand mehr deuten kann.
 *
 * Die Werte sind dieselben wie im Server-Schema (`beschaeftigungsStatus` in
 * `src/app/api/fragebogen/[token]/route.ts`) und in `minijob-status.ts`.
 */
const STATUS_VON_GESETZES_WEGEN_FREI: readonly string[] = [
  "ALTERSVOLLRENTNER_NACH_REGELALTERSGRENZE",
  "VERSORGUNGSEMPFAENGER",
];

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  /**
   * Wird entgegengenommen, aber nicht ausgewertet — und das mit Absicht.
   *
   * In diesem Schritt ist nichts abschaltbar: Die Entscheidung traegt den
   * Schritt, und die beiden Zusagen sind die Voraussetzung, unter der eine
   * Befreiung beantragt werden darf. Die Registry fuehrt sie deshalb als
   * `alwaysVisible`/`alwaysRequired`, der Vorlagen-Editor zeigt dort ein
   * Pflichtfeld-Kennzeichen statt eines Schalters.
   */
  fieldConfig?: FieldConfigHelper;
  /** Magic-Link-Token — fuer den Download des vorausgefuellten Antrags. */
  token?: string;
  /** Ist beim Mandanten eine Betriebsnummer hinterlegt? */
  antragErzeugbar?: boolean;
}

export function Step11Rente({
  data,
  onNext,
  onBack,
  saving,
  token,
  antragErzeugbar = true,
}: StepProps) {
  const gespeicherteEntscheidung = data.rvEntscheidung as string | undefined;

  // Der Status aus dem Schritt „Weitere Beschaeftigung" beantwortet die Frage
  // dieses Schritts unter Umstaenden schon. Dann ist die Angabe hier keine Wahl
  // mehr, sondern eine Feststellung — also steht sie vor.
  const statusWert = (data.beschaeftigungsStatus as string) || "";
  const statusMachtFrei = STATUS_VON_GESETZES_WEGEN_FREI.includes(statusWert);

  const [entscheidung, setEntscheidung] = useState<string>(
    // Vorausfuellen heisst nicht ueberschreiben: Der Vorgabewert greift nur,
    // solange nichts gespeichert ist. Wer schon geantwortet hat, findet seine
    // eigene Antwort wieder — auch dann, wenn sie der Vorgabe widerspricht.
    gespeicherteEntscheidung ||
      (statusMachtFrei ? "RENTENVERSICHERUNGSFREI" : "")
  );
  const [merkblattGelesen, setMerkblattGelesen] = useState(
    data.rvMerkblattGelesen === true
  );
  const [bindungBestaetigt, setBindungBestaetigt] = useState(
    data.rvBindungBestaetigt === true
  );
  const [merkblattOffen, setMerkblattOffen] = useState(false);
  const [fehler, setFehler] = useState("");

  // Der Aufhebungsantrag existiert erst seit dem 01.07.2026. Vorher wäre die
  // Option da, ohne dass es sie gibt.
  const heute = useMemo(() => new Date(), []);
  const optionen = useMemo(
    () => RV_OPTIONEN.filter((o) => istWaehlbar(o, heute)),
    [heute]
  );

  // Der Server erzeugt den Antrag aus dem GESPEICHERTEN Stand. Solange die
  // Auswahl nur im Browser steht, liefe ein Download auf die alte Entscheidung
  // — oder ins Leere. Deshalb haengt der Knopf am gespeicherten Wert (oben
  // gelesen), nicht am gerade angeklickten.
  const antragSchonGespeichert =
    gespeicherteEntscheidung === "BEFREIUNG_BEANTRAGT";

  const gewaehlt = getRvOption(entscheidung);
  const brauchtMerkblatt = gewaehlt?.brauchtMerkblatt === true;
  const brauchtBindung = gewaehlt?.brauchtBindung === true;

  /**
   * GREIFT die Vorauswahl gerade — oder behauptet der Kasten das nur?
   *
   * Der Unterschied ist die ganze Frage. Der Hinweistext hing frueher allein am
   * Status und sagte deshalb woertlich „unten ist ... bereits gewaehlt", auch
   * wenn eine abweichende gespeicherte Antwort gewonnen hatte (die
   * Zustandslogik oben ist richtig: gespeichert schlaegt Vorgabe). Der Weg
   * dahin ist kurz: erst hier „Ich moechte versichert bleiben" waehlen und
   * speichern, dann ueber die Schrittleiste zurueck zu „Weitere Beschaeftigung",
   * dort „Altersvollrentner" setzen und wieder herspringen. Danach stand die
   * Behauptung im Kasten, das Abzeichen klebte an einer nicht angekreuzten
   * Zeile — und angekreuzt war eine andere. Wer das liest und auf „Weiter"
   * klickt, speichert nicht, was er zu speichern glaubt, und zwar bei der
   * folgenreichsten Frage des Fragebogens.
   */
  const vorauswahlGreift =
    statusMachtFrei && entscheidung === "RENTENVERSICHERUNGSFREI";
  const freiLabel = getRvOption("RENTENVERSICHERUNGSFREI")?.label ?? "";

  const absenden = (e: React.FormEvent) => {
    e.preventDefault();

    if (!entscheidung) {
      setFehler("Bitte wählen Sie aus, wie Sie sich entscheiden.");
      return;
    }
    if (brauchtMerkblatt && !merkblattGelesen) {
      setFehler(
        "Bitte bestätigen Sie, dass Sie die Hinweise zur Rente gelesen haben."
      );
      return;
    }
    if (brauchtBindung && !bindungBestaetigt) {
      setFehler("Bitte bestätigen Sie die Erklärung zur Bindungswirkung.");
      return;
    }
    setFehler("");

    onNext({
      rvEntscheidung: entscheidung,
      // Nur mitsenden, wo die Zusage überhaupt verlangt wurde — sonst stünde
      // eine Bestätigung in der Akte, die niemand abgegeben hat.
      rvMerkblattGelesen: brauchtMerkblatt ? merkblattGelesen : false,
      rvBindungBestaetigt: brauchtBindung ? bindungBestaetigt : false,
    });
  };

  return (
    <form onSubmit={absenden} className="space-y-6">
      <ErklaerBox titel="Worum es hier geht" betont>
        <p>
          Als Minijobber sind Sie automatisch rentenversichert. Ihr Arbeitgeber
          zahlt {prozent(RV_SAETZE.arbeitgeber)} % Ihres Verdienstes ein, Sie
          selbst {prozent(RV_SAETZE.eigenanteil)} %. Dieser Anteil wird von
          Ihrem Lohn einbehalten.
        </p>
        <p>
          Sie dürfen sich davon befreien lassen. Dann bekommen Sie diesen Anteil
          ausgezahlt — sammeln aber weniger Rentenansprüche.{" "}
          <strong>
            Es gibt hier kein Richtig oder Falsch, und wir raten Ihnen bewusst zu
            keiner der beiden Seiten.
          </strong>{" "}
          Lesen Sie sich die Folgen in Ruhe durch.
        </p>
      </ErklaerBox>

      {/* ============================================= */}
      {/* Merkblatt                                     */}
      {/* ============================================= */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setMerkblattOffen((v) => !v)}
          aria-expanded={merkblattOffen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-foreground">
            {MERKBLATT_KERN.titel}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {merkblattOffen ? "Zuklappen" : "Aufklappen"}
          </span>
        </button>

        {merkblattOffen && (
          <div className="space-y-3 border-t border-border px-4 py-3 text-xs leading-relaxed text-foreground">
            <p>{MERKBLATT_KERN.einleitung}</p>
            <p className="font-semibold">
              Solange Sie versichert bleiben, gilt für Sie:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              {MERKBLATT_KERN.vorteile.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
            <p>{MERKBLATT_KERN.verzicht}</p>
            <p className="rounded-lg bg-[#009AC6]/5 px-3 py-2">
              {MERKBLATT_KERN.beratung}
            </p>
            {/* Der Befreiungsantrag bestaetigt die Kenntnisnahme des amtlichen
                Merkblatts. Was oben steht, ist unsere Zusammenfassung — das
                Original gehoert daneben, sichtbar getrennt, damit die
                Bestaetigung sich auf den amtlichen Wortlaut beziehen kann.
                Warum verlinkt statt mitgeliefert: siehe MERKBLATT_QUELLE. */}
            <p className="border-t border-border pt-3">
              <a
                href={MERKBLATT_QUELLE}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Amtliches Merkblatt bei der Minijob-Zentrale öffnen
              </a>
              <span className="mt-0.5 block text-muted-foreground">
                Öffnet die Seite der Minijob-Zentrale in einem neuen Fenster.
                Das Merkblatt gehört dort zur Checkliste — so lesen Sie immer
                die Fassung, die gerade gilt.
              </span>
            </p>
          </div>
        )}
      </div>

      {/* ============================================= */}
      {/* Warum hier schon etwas angekreuzt ist          */}
      {/* ============================================= */}
      {statusMachtFrei && (
        <div className="rounded-lg border-l-4 border-[#FBC900] bg-[#FBC900]/10 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">
            {vorauswahlGreift
              ? "Eine Antwort ist für Sie schon vorausgewählt"
              : "Ihre Angaben passen nicht zusammen"}
          </p>
          <p className="mt-1 text-foreground/80">
            Sie haben bei den Angaben zu Ihrer Beschäftigung „
            {statusLabel(statusWert)}“ angegeben. Damit sind Sie in der
            Rentenversicherung von Gesetzes wegen frei — eine Befreiung müssen
            Sie gar nicht erst beantragen.
          </p>
          {vorauswahlGreift ? (
            <>
              <p className="mt-1 text-foreground/80">
                Deshalb ist unten die Antwort „{freiLabel}“ bereits gewählt.
              </p>
              <p className="mt-1 text-foreground/80">
                Sie können sie trotzdem ändern: Sie kennen Ihre Lage besser als
                dieses Formular.
              </p>
            </>
          ) : (
            /* Kein „ist vorausgewaehlt" mehr, wenn es nicht stimmt — und kein
               stilles Umstellen der Auswahl: Was die Person zuletzt gewaehlt
               hat, bleibt stehen. Der Kasten sagt nur, dass beides
               auseinanderlaeuft, und ueberlaesst ihr die Entscheidung. */
            <>
              <p className="mt-1 text-foreground/80">
                Gewählt haben Sie unten aber „
                {getRvOption(entscheidung)?.label ?? "noch nichts"}“. Das ist
                möglich — Sie kennen Ihre Lage besser als dieses Formular.
              </p>
              <p className="mt-1 text-foreground/80">
                War das ein Versehen, wählen Sie bitte „{freiLabel}“.
              </p>
            </>
          )}
        </div>
      )}

      {/* ============================================= */}
      {/* Die vier Wege                                 */}
      {/* ============================================= */}
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">
          Wie möchten Sie sich entscheiden?{" "}
          <span className="text-destructive">*</span>
        </legend>

        {optionen.map((option) => {
          const aktiv = entscheidung === option.wert;
          return (
            <label
              key={option.wert}
              className={`block cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                aktiv
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="rvEntscheidung"
                  value={option.wert}
                  checked={aktiv}
                  onChange={() => {
                    setEntscheidung(option.wert);
                    setFehler("");
                  }}
                  className="mt-1 h-4 w-4 shrink-0 border-border text-primary focus:ring-primary"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {option.label}
                  </p>
                  {/* Verbindet den Hinweis oben mit der Zeile, die er meint —
                      sonst muss man raten, welche der Antworten gemeint war.
                      Der Wortlaut haengt am tatsaechlichen Zustand: „vorausgewaehlt"
                      darf nur an einer Zeile stehen, die auch angekreuzt ist. */}
                  {statusMachtFrei &&
                    option.wert === "RENTENVERSICHERUNGSFREI" && (
                      <p className="mt-1 inline-block rounded-full bg-[#FBC900]/20 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                        {vorauswahlGreift
                          ? "Aufgrund Ihrer Angabe vorausgewählt"
                          : "Passt zu Ihrer Angabe zur Beschäftigung"}
                      </p>
                    )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.kurz}
                  </p>

                  <ul className="mt-2 space-y-1 text-xs text-foreground/80">
                    {option.folgen.map((f) => (
                      <li key={f} className="flex gap-1.5">
                        <span aria-hidden className="text-muted-foreground">
                          ·
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {option.brauchtUnterschrift && aktiv && (
                    <div className="mt-3 rounded-lg border-l-4 border-[#FBC900] bg-[#FBC900]/10 px-3 py-2 text-xs">
                      <p className="font-semibold text-foreground">
                        Dieser Antrag braucht Ihre Unterschrift
                        <HilfeHinweis thema="Warum eine Unterschrift nötig ist">
                          Für die Befreiung schreibt das Gesetz die Schriftform
                          vor — ein Häkchen genügt hier nicht. Die Aufhebung
                          einer Befreiung darf dagegen elektronisch erfolgen;
                          deshalb der Unterschied.
                        </HilfeHinweis>
                      </p>
                      <p className="mt-1 text-foreground/80">
                        Wir füllen den Antrag für Sie aus. Sie drucken ihn,
                        unterschreiben und laden ihn im letzten Schritt wieder
                        hoch. Ohne den unterschriebenen Antrag können Sie den
                        Fragebogen nicht absenden.
                      </p>
                      {token && antragErzeugbar && antragSchonGespeichert && (
                        <a
                          href={`/api/fragebogen/${token}/rv-antrag?art=BEFREIUNG`}
                          className="mt-2 inline-block rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                        >
                          Antrag herunterladen (PDF)
                        </a>
                      )}
                      {antragErzeugbar && !antragSchonGespeichert && (
                        <p className="mt-2 text-foreground/70">
                          Den ausgefüllten Antrag finden Sie zum Herunterladen im
                          letzten Schritt bei den Unterlagen — sobald Sie diese
                          Auswahl mit „Weiter“ gespeichert haben.
                        </p>
                      )}
                      {!antragErzeugbar && (
                        <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-foreground">
                          Der Antrag kann derzeit nicht erstellt werden, weil
                          beim Arbeitgeber eine Angabe fehlt. Bitte wenden Sie
                          sich an die Personalabteilung. Ihre Eingaben bleiben
                          gespeichert.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </fieldset>

      {/* ============================================= */}
      {/* Zusagen, die an der Wahl hängen               */}
      {/* ============================================= */}
      {brauchtMerkblatt && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
          <input
            type="checkbox"
            checked={merkblattGelesen}
            onChange={(e) => {
              setMerkblattGelesen(e.target.checked);
              setFehler("");
            }}
            className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-foreground">
            Ich habe die Hinweise zu den Folgen einer Befreiung gelesen.{" "}
            <span className="text-destructive">*</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Sie stehen oben unter „{MERKBLATT_KERN.titel}“.
            </span>
          </span>
        </label>
      )}

      {brauchtBindung && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
          <input
            type="checkbox"
            checked={bindungBestaetigt}
            onChange={(e) => {
              setBindungBestaetigt(e.target.checked);
              setFehler("");
            }}
            className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-foreground">
            {BINDUNG_TEXT} <span className="text-destructive">*</span>
          </span>
        </label>
      )}

      {fehler && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {fehler}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Zurück
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Wird gespeichert..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}
