"use client";

/**
 * Der Arbeitgeberteil des RV-Antrags auf der HR-Detailseite (AP 12).
 *
 * Hier wird erfasst, was auf dem amtlichen Vordruck im Arbeitgeberblock steht —
 * Eingangsdatum, Wirkungsdatum — und hier laufen die beiden Fristen.
 *
 * **Vorschlag, nicht Automatik.** Das Wirkungsdatum wird berechnet und
 * daneben gelegt; übernommen wird es durch einen Klick. Die Daten wirken
 * unmittelbar auf die Beitragspflicht (3,6 % Arbeitnehmeranteil) und gehen nach
 * § 8 Abs. 2 Nr. 4a BVV in die Entgeltunterlagen — eine Software, die sie still
 * setzt, nimmt eine Verantwortung auf sich, die sie nicht tragen kann.
 *
 * Die Rechenwege stehen bewusst nicht hier, sondern serverseitig
 * (`src/lib/minijob-fristen.ts`, ausgeliefert über `/api/onboarding/:id/rv-fristen`).
 * Zwei Rechenwege, die auseinanderlaufen, wären bei Beitragsfolgen das Letzte,
 * was man gebrauchen kann.
 */

import { useCallback, useEffect, useState } from "react";
import {
  type Ampel,
  formatiere,
  fristampel,
  heuteInBerlin,
} from "@/lib/minijob-fristen";
import { rvEntscheidungLabel } from "@/lib/minijob-rentenversicherung";

interface Berechnung {
  datum: string | null;
  begruendung: string;
  hinweise: string[];
}

interface Meldefrist extends Berechnung {
  quelle: "ENTGELTABRECHNUNG" | "SECHS_WOCHEN" | null;
  unvollstaendig: boolean;
}

interface RvFristen {
  entscheidung: string | null;
  entscheidungAm: string | null;
  vertragsbeginn: string | null;
  mandant: {
    name: string | null;
    betriebsnummerVorhanden: boolean;
    entgeltabrechnungTag: number | null;
  };
  erfasst: {
    antragEingangAm: string | null;
    wirkungAb: string | null;
    meldungAm: string | null;
    bearbeitetAm: string | null;
  };
  vorschlag: {
    wirkungAb: (Berechnung & { verspaetet?: boolean }) | null;
    /** Hat der Rechenkern den Verspätungsfall angewandt? */
    verspaetet: boolean;
    meldefrist: Meldefrist | null;
    widerspruchsfrist: Berechnung;
  };
}

const AMPEL_STIL: Record<Ampel, string> = {
  ERLEDIGT: "border-credo-gruen/40 bg-credo-gruen/10 text-credo-gruen",
  LAEUFT: "border-border bg-muted text-muted-foreground",
  BALD: "border-[#FBC900]/50 bg-[#FBC900]/15 text-[#8a6d00]",
  UEBERFAELLIG: "border-destructive/40 bg-destructive/10 text-destructive",
  OFFEN: "border-border bg-muted text-muted-foreground",
};

function Zeile({
  label,
  children,
  hinweis,
}: {
  label: string;
  children: React.ReactNode;
  hinweis?: string;
}) {
  return (
    <div className="border-b border-border/50 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">{children}</div>
      </div>
      {hinweis && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {hinweis}
        </p>
      )}
    </div>
  );
}

function Hinweise({ texte }: { texte: string[] }) {
  if (texte.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1">
      {texte.map((t) => (
        <li key={t} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <span aria-hidden>·</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Ein Datumsfeld, das erst beim Verlassen speichert.
 *
 * Warum nicht bei `onChange`: Ein `<input type="date">` mit vorhandenem Wert ist
 * waehrend der Eingabe kurz leer und feuert dabei ein Change mit "". Wer ein
 * erfasstes Datum korrigieren wollte, loeschte es damit zuerst — und weil die
 * Antwort das Feld neu montierte, war die halb getippte Eingabe gleich mit weg.
 * Bei einem Feld, das unmittelbar auf die Beitragspflicht wirkt, ist das der
 * falsche Zeitpunkt zum Speichern.
 *
 * Leeren ist deshalb auch kein Nebeneffekt mehr, sondern ein eigener Knopf: Ein
 * leeres Datumsfeld ist meistens ein Zwischenzustand, kein Loeschwunsch.
 */
function DatumsFeld({
  wert,
  onSpeichern,
  bearbeitbar,
  laeuft,
}: {
  wert: string | null;
  onSpeichern: (neu: string | null) => void;
  bearbeitbar: boolean;
  laeuft: boolean;
}) {
  const [entwurf, setEntwurf] = useState(wert ?? "");

  // Wert von aussen uebernehmen — aber nur, wenn gerade nicht getippt wird.
  useEffect(() => {
    setEntwurf(wert ?? "");
  }, [wert]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={entwurf}
        readOnly={!bearbeitbar}
        onChange={(e) => setEntwurf(e.target.value)}
        onBlur={() => {
          if (!bearbeitbar) return;
          const neu = entwurf === "" ? null : entwurf;
          // Nichts geaendert, nichts speichern — sonst faellt bei jedem
          // Durchtabben ein Audit-Eintrag an.
          if (neu === (wert ?? null)) return;
          // Leeren nur ueber den eigenen Knopf.
          if (neu === null) {
            setEntwurf(wert ?? "");
            return;
          }
          onSpeichern(neu);
        }}
        className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring read-only:opacity-60"
      />
      {bearbeitbar && wert && (
        <button
          type="button"
          onClick={() => onSpeichern(null)}
          title="Datum entfernen"
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
        >
          Entfernen
        </button>
      )}
      {laeuft && (
        <span className="text-xs text-muted-foreground">wird gespeichert …</span>
      )}
    </div>
  );
}

export function RvFristenCard({
  onboardingId,
  canEdit,
}: {
  onboardingId: string;
  canEdit: boolean;
}) {
  const [daten, setDaten] = useState<RvFristen | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");
  const [gespeichert, setGespeichert] = useState("");

  const laden = useCallback(async () => {
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/rv-fristen`);
      if (res.ok) {
        const j = await res.json();
        setDaten(j.data);
      }
    } catch {
      // Stumm: Die Karte ist eine Ergänzung, kein Blocker für die Seite.
    } finally {
      setLaedt(false);
    }
  }, [onboardingId]);

  useEffect(() => {
    laden();
  }, [laden]);

  const speichern = async (feld: string, wert: string | null) => {
    setSpeichert(true);
    setFehler("");
    setGespeichert("");
    try {
      const res = await fetch(`/api/onboarding/${onboardingId}/rv-fristen`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [feld]: wert }),
      });
      const j = await res.json();
      if (!res.ok) {
        setFehler(j.error || "Speichern fehlgeschlagen.");
        return;
      }
      setDaten(j.data);
      setGespeichert("Gespeichert.");
    } catch {
      setFehler("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSpeichert(false);
    }
  };

  if (laedt) return null;
  if (!daten) return null;

  // Für die übrigen beiden Wege gibt es keinen Antrag und damit keine Fristen.
  const relevant =
    daten.entscheidung === "BEFREIUNG_BEANTRAGT" ||
    daten.entscheidung === "AUFHEBUNG_BEANTRAGT";

  const heute = heuteInBerlin();
  const meldefrist = daten.vorschlag.meldefrist;
  const meldeAmpel = meldefrist
    ? fristampel(meldefrist.datum, daten.erfasst.meldungAm, heute)
    : null;
  const widerspruch = daten.vorschlag.widerspruchsfrist;
  const widerspruchAmpel = widerspruch.datum
    ? fristampel(widerspruch.datum, null, heute)
    : null;

  const vorschlagWirkung = daten.vorschlag.wirkungAb;
  const wirkungAbweichend =
    vorschlagWirkung?.datum &&
    daten.erfasst.wirkungAb &&
    vorschlagWirkung.datum !== daten.erfasst.wirkungAb;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span aria-hidden>🏦</span>
          Rentenversicherung
        </h3>
      </div>

      <div className="px-6 py-4">
        <Zeile label="Entscheidung des Beschäftigten">
          <span className="text-sm font-medium text-foreground">
            {/* Aus der gemeinsamen Quelle: Eine zweite Liste hier war schon
                auseinandergelaufen („kein Antrag nötig" gegen „keine
                Befreiung nötig"). */}
            {daten.entscheidung
              ? rvEntscheidungLabel(daten.entscheidung)
              : "— noch nicht getroffen"}
          </span>
        </Zeile>

        {!relevant && (
          <p className="pt-3 text-xs text-muted-foreground">
            Für diesen Weg entsteht kein Antrag und laufen keine Fristen.
          </p>
        )}

        {relevant && (
          <>
            {/* ---------- Eingang beim Arbeitgeber ---------- */}
            <Zeile
              label="Antrag ist beim Arbeitgeber eingegangen am"
              hinweis={
                daten.entscheidung === "AUFHEBUNG_BEANTRAGT"
                  ? "Die Aufhebung darf elektronisch erklärt werden — dann ist das Absendedatum des Fragebogens maßgeblich. Bei Papiereingang tragen Sie den Posteingang ein."
                  : "Der Tag, an dem der unterschriebene Antrag hier eingegangen ist. Nicht das Datum der Unterschrift und nicht das Absendedatum des Fragebogens. Er steuert Wirkung und Frist."
              }
            >
              <DatumsFeld
                wert={daten.erfasst.antragEingangAm}
                bearbeitbar={canEdit}
                laeuft={speichert}
                onSpeichern={(neu) => speichern("antragEingangAm", neu)}
              />
            </Zeile>

            {/* ---------- Wirkungsdatum ---------- */}
            <Zeile label="Die Befreiung wirkt ab">
              <DatumsFeld
                wert={daten.erfasst.wirkungAb}
                bearbeitbar={canEdit}
                laeuft={speichert}
                onSpeichern={(neu) => speichern("wirkungAb", neu)}
              />
            </Zeile>

            {vorschlagWirkung && (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Vorschlag: {formatiere(vorschlagWirkung.datum)}
                  </span>
                  {canEdit && vorschlagWirkung.datum && (
                    <button
                      type="button"
                      disabled={speichert}
                      onClick={() =>
                        speichern("wirkungAb", vorschlagWirkung.datum)
                      }
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      Übernehmen
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {vorschlagWirkung.begruendung}
                </p>
                <Hinweise texte={vorschlagWirkung.hinweise} />
                {wirkungAbweichend && (
                  <p className="mt-1.5 text-xs font-medium text-[#8a6d00]">
                    Der eingetragene Wert weicht vom Vorschlag ab. Das kann
                    richtig sein — bitte nur bewusst so stehen lassen.
                  </p>
                )}
              </div>
            )}

            {/* ---------- Meldefrist ---------- */}
            {meldefrist && meldeAmpel && (
              <div className="mt-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Meldung an die Minijob-Zentrale
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${AMPEL_STIL[meldeAmpel.ampel]}`}
                  >
                    {meldeAmpel.text}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {meldefrist.begruendung}
                </p>
                <Hinweise texte={meldefrist.hinweise} />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground">
                    Gemeldet am
                  </label>
                  <DatumsFeld
                    wert={daten.erfasst.meldungAm}
                    bearbeitbar={canEdit}
                    laeuft={speichert}
                    onSpeichern={(neu) => speichern("meldungAm", neu)}
                  />
                </div>
              </div>
            )}

            {/* ---------- Verspätungsfall ---------- */}
            {/* Ob er gilt, entscheidet der Rechenkern — nicht diese Maske.
                Der oben angezeigte Vorschlag ist dann bereits der verschobene. */}
            {daten.vorschlag.verspaetet && (
              <div className="mt-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive">
                  Die Meldefrist wurde überschritten
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                  Der Vorschlag oben ist deshalb bereits das verschobene
                  Wirkungsdatum:{" "}
                  <strong>{formatiere(vorschlagWirkung?.datum ?? null)}</strong>.
                </p>
              </div>
            )}

            {/* ---------- Widerspruchsfrist ---------- */}
            <div className="mt-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  Widerspruchsfrist der Minijob-Zentrale
                </span>
                {widerspruchAmpel && (
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${AMPEL_STIL[widerspruchAmpel.ampel]}`}
                  >
                    {widerspruchAmpel.text}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {widerspruch.begruendung}
              </p>
            </div>

            {!daten.mandant.entgeltabrechnungTag && (
              <p className="mt-3 rounded-lg border border-[#FBC900]/50 bg-[#FBC900]/10 px-3 py-2 text-xs leading-relaxed text-foreground">
                Für den Mandanten ist kein Termin der Entgeltabrechnung
                hinterlegt. Überwacht wird deshalb nur die äußere
                Sechs-Wochen-Grenze — die tatsächliche Frist kann früher enden.
              </p>
            )}
          </>
        )}

        {fehler && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {fehler}
          </p>
        )}
        {gespeichert && !fehler && (
          <p className="mt-3 text-xs text-credo-gruen">{gespeichert}</p>
        )}
        {daten.erfasst.bearbeitetAm && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Zuletzt bearbeitet am{" "}
            {new Date(daten.erfasst.bearbeitetAm).toLocaleString("de-DE")}
          </p>
        )}
      </div>
    </div>
  );
}
