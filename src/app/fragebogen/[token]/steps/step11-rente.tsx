"use client";

/**
 * Schritt 11 — Rentenversicherung (Minijob-Checkliste, Abschnitt 5)
 *
 * Die folgenreichste Entscheidung im Fragebogen. Deshalb steht hier mehr Text
 * als sonst, und die vier Wege sind bewusst gleich ausführlich beschrieben —
 * niemand soll durch die Gestaltung in eine Richtung geschoben werden.
 *
 * Das Merkblatt steht **im Formular**, nicht nur als PDF-Anhang: Ein Download,
 * den niemand öffnet, erfüllt die Aufklärungspflicht nur auf dem Papier.
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

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
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
  const [entscheidung, setEntscheidung] = useState<string>(
    (data.rvEntscheidung as string) || ""
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
  // — oder ins Leere. Deshalb haengt der Knopf am gespeicherten Wert, nicht am
  // gerade angeklickten.
  const gespeicherteEntscheidung = data.rvEntscheidung as string | undefined;
  const antragSchonGespeichert =
    gespeicherteEntscheidung === "BEFREIUNG_BEANTRAGT";

  const gewaehlt = getRvOption(entscheidung);
  const brauchtMerkblatt = gewaehlt?.brauchtMerkblatt === true;
  const brauchtBindung = gewaehlt?.brauchtBindung === true;

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
                Bestaetigung sich auf den amtlichen Wortlaut beziehen kann. */}
            <p className="border-t border-border pt-3">
              <a
                href="/system-dokumente/merkblatt-rv-befreiung.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Amtliches Merkblatt der Minijob-Zentrale öffnen (PDF)
              </a>
              <span className="mt-0.5 block text-muted-foreground">
                Der Wortlaut im Original, Stand 30. Juni 2026.
              </span>
            </p>
          </div>
        )}
      </div>

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
