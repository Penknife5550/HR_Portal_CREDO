"use client";

/**
 * Schritt 6 — Weitere Beschäftigungen & Status
 *
 * Bildet Abschnitt 2 und Abschnitt 4 der Minijob-Checkliste ab: den Status bei
 * Beginn der Beschäftigung, die Meldung bei der Agentur für Arbeit und drei
 * Tabellen (weitere Beschäftigungen, Vorbeschäftigungen, Ausland).
 *
 * **Zur Gestaltung:** Der Schritt kann erschlagen. Deshalb erscheint jede
 * Tabelle erst, wenn die zugehörige Grundfrage mit Ja beantwortet ist — wer
 * nur diesen einen Minijob hat, sieht vier Fragen und ist fertig. Wo eine
 * gesetzliche Definition dahintersteckt, steht sie hinter einem Fragezeichen
 * statt in der Beschriftung.
 */

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep6Schema } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";
import { ErklaerBox, HilfeHinweis } from "@/components/hilfe-hinweis";
import { STATUS_OPTIONEN, nachweisFuerStatus } from "@/lib/minijob-status";
import {
  ART_LABELS,
  beschaeftigungsAngabeSchema,
  type BeschaeftigungsKategorieWert,
} from "@/lib/validations/beschaeftigungs-angaben";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

/** Eine Tabellenzeile im Formular — alles als Text, wie die Eingabefelder es liefern. */
interface ZeileEingabe {
  kategorie: BeschaeftigungsKategorieWert;
  beginn: string;
  ende: string;
  arbeitgeberName: string;
  arbeitgeberAdresse: string;
  art: string;
  entgeltUeberGrenze: boolean | null;
  arbeitstage: string;
  beiArbeitsagentur: boolean;
}

function leereZeile(kategorie: BeschaeftigungsKategorieWert): ZeileEingabe {
  return {
    kategorie,
    beginn: "",
    ende: "",
    arbeitgeberName: "",
    arbeitgeberAdresse: "",
    art: "",
    entgeltUeberGrenze: null,
    arbeitstage: "",
    beiArbeitsagentur: false,
  };
}

/** Aus dem gespeicherten Stand die Zeilen einer Kategorie herstellen. */
function ausBestand(
  data: Record<string, unknown>,
  kategorie: BeschaeftigungsKategorieWert
): ZeileEingabe[] {
  const alle = (data.beschaeftigungsAngaben as Record<string, unknown>[]) ?? [];
  return alle
    .filter((a) => a.kategorie === kategorie)
    .map((a) => ({
      kategorie,
      beginn: typeof a.beginn === "string" ? a.beginn.slice(0, 10) : "",
      ende: typeof a.ende === "string" ? a.ende.slice(0, 10) : "",
      arbeitgeberName: (a.arbeitgeberName as string) ?? "",
      arbeitgeberAdresse: (a.arbeitgeberAdresse as string) ?? "",
      art: (a.art as string) ?? "",
      entgeltUeberGrenze:
        typeof a.entgeltUeberGrenze === "boolean" ? a.entgeltUeberGrenze : null,
      arbeitstage:
        typeof a.arbeitstage === "number" ? String(a.arbeitstage) : "",
      beiArbeitsagentur: a.beiArbeitsagentur === true,
    }));
}

/** Zeile in die Form bringen, die die Prüfung erwartet. */
function zurPruefung(z: ZeileEingabe): Record<string, unknown> {
  const basis = {
    kategorie: z.kategorie,
    beginn: z.beginn,
    arbeitgeberName: z.arbeitgeberName || null,
    arbeitgeberAdresse: z.arbeitgeberAdresse || null,
  };
  if (z.kategorie === "WEITERE") return { ...basis, art: z.art || undefined };
  if (z.kategorie === "VORBESCHAEFTIGUNG") {
    return {
      ...basis,
      ende: z.ende,
      entgeltUeberGrenze: z.entgeltUeberGrenze ?? undefined,
      arbeitstage: z.arbeitstage === "" ? undefined : Number(z.arbeitstage),
      beiArbeitsagentur: z.beiArbeitsagentur,
    };
  }
  return { ...basis, ende: z.ende || null };
}

const feldKlasse =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const labelKlasse = "mb-1 block text-xs font-semibold text-foreground";

/** Ja/Nein als zwei Schaltflächen — eindeutiger als eine einzelne Checkbox. */
function JaNein({
  wert,
  onChange,
  name,
}: {
  wert: boolean | null;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={name}>
      {[
        { v: false, t: "Nein" },
        { v: true, t: "Ja" },
      ].map(({ v, t }) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={wert === v}
          onClick={() => onChange(v)}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
            wert === v
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:border-primary"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Step6Employment({
  data,
  onNext,
  onBack,
  saving,
  fieldConfig,
}: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(6);
  const schema = useMemo(() => createStep6Schema(fc), [fc]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      beschaeftigungsStatus: (data.beschaeftigungsStatus as string) || "",
      beschaeftigungsStatusSonstige:
        (data.beschaeftigungsStatusSonstige as string) || "",
      alsArbeitsuchendGemeldet: data.alsArbeitsuchendGemeldet === true,
      agenturFuerArbeit: (data.agenturFuerArbeit as string) || "",
      mitLeistungsbezug:
        typeof data.mitLeistungsbezug === "boolean"
          ? data.mitLeistungsbezug
          : null,
      hasOtherEmployment: data.hasOtherEmployment === true,
      summeUeberGeringfuegigkeitsgrenze:
        typeof data.summeUeberGeringfuegigkeitsgrenze === "boolean"
          ? data.summeUeberGeringfuegigkeitsgrenze
          : null,
      vorbeschaeftigungenVorhanden: data.vorbeschaeftigungenVorhanden === true,
      auslandsbeschaeftigungVorhanden:
        data.auslandsbeschaeftigungVorhanden === true,
      employerType: (data.employerType as
        | "hauptarbeitgeber"
        | "nebenarbeitgeber"
        | "nein") || undefined,
    },
  });

  const [weitere, setWeitere] = useState(() => ausBestand(data, "WEITERE"));
  const [vor, setVor] = useState(() => ausBestand(data, "VORBESCHAEFTIGUNG"));
  const [ausland, setAusland] = useState(() => ausBestand(data, "AUSLAND"));
  const [zeilenFehler, setZeilenFehler] = useState<string[]>([]);

  const status = watch("beschaeftigungsStatus");
  const gemeldet = watch("alsArbeitsuchendGemeldet");
  const hatWeitere = watch("hasOtherEmployment");
  const hatVor = watch("vorbeschaeftigungenVorhanden");
  const hatAusland = watch("auslandsbeschaeftigungVorhanden");

  const gewaehlt = STATUS_OPTIONEN.find((o) => o.wert === status);
  const nachweis = nachweisFuerStatus(status);
  // Die Additionsfrage stellt das Muster nur, wenn keine Hauptbeschäftigung
  // vorliegt — sonst wird der erste Minijob gar nicht zusammengerechnet.
  const additionsfrageNoetig =
    hatWeitere && status !== "ARBEITNEHMER_HAUPTBESCHAEFTIGUNG";

  const onSubmit = (werte: Record<string, unknown>) => {
    // Zeilen der aktiven Tabellen einsammeln und einzeln prüfen.
    const aktive = [
      ...(hatWeitere ? weitere : []),
      ...(hatVor ? vor : []),
      ...(hatAusland ? ausland : []),
    ];

    const fehler: string[] = [];
    const geprueft: unknown[] = [];
    aktive.forEach((zeile, i) => {
      const ergebnis = beschaeftigungsAngabeSchema.safeParse(zurPruefung(zeile));
      if (ergebnis.success) {
        geprueft.push(ergebnis.data);
      } else {
        const meldungen = ergebnis.error.issues.map((x) => x.message);
        fehler.push(`Eintrag ${i + 1}: ${[...new Set(meldungen)].join(" ")}`);
      }
    });

    if (fehler.length > 0) {
      setZeilenFehler(fehler);
      return;
    }
    setZeilenFehler([]);

    // Antworten auf Fragen, die inzwischen gegenstandslos sind, ausdrücklich
    // leeren. Wer erst „Schüler“ wählt und die Additionsfrage beantwortet,
    // dann aber auf „Hauptbeschäftigung“ wechselt, hinterließe sonst eine
    // Antwort auf eine Frage, die gar nicht mehr gestellt wird.
    const bereinigt: Record<string, unknown> = { ...werte };
    if (werte.beschaeftigungsStatus !== "SONSTIGE") {
      bereinigt.beschaeftigungsStatusSonstige = null;
    }
    if (!gemeldet) {
      bereinigt.agenturFuerArbeit = null;
      bereinigt.mitLeistungsbezug = null;
    }
    if (!additionsfrageNoetig) {
      bereinigt.summeUeberGeringfuegigkeitsgrenze = null;
    }

    onNext({
      ...bereinigt,
      // Immer alle drei Kategorien mitsenden: Ein "Nein" muss die vorher
      // eingetragenen Zeilen auch tatsächlich entfernen.
      beschaeftigungsAngaben: geprueft,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <ErklaerBox titel="Warum wir das fragen">
        <p>
          Ob Ihre Beschäftigung bei uns ein Minijob bleibt, hängt nicht nur von
          Ihrem Verdienst bei uns ab — sondern auch davon, was Sie sonst noch
          tun. Mehrere Minijobs werden zusammengerechnet, und erst die Summe
          entscheidet.
        </p>
        <p>
          Sie sind gesetzlich verpflichtet, uns diese Angaben vollständig zu
          machen (§ 28o SGB IV). Wenn nichts davon auf Sie zutrifft, sind Sie
          nach vier Fragen fertig.
        </p>
      </ErklaerBox>

      {/* ============================================= */}
      {/* Status bei Beginn der Beschäftigung           */}
      {/* ============================================= */}
      {fc.isVisible("beschaeftigungsStatus") && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Was trifft auf Sie zu, wenn Sie bei uns anfangen?{" "}
            <span className="text-destructive">*</span>
          </legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Bitte wählen Sie die eine Angabe, die am besten passt.
          </p>

          <div className="grid gap-1 sm:grid-cols-2">
            {STATUS_OPTIONEN.map((option) => (
              <div key={option.wert} className="sm:col-span-1">
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 hover:bg-muted/60">
                  <input
                    type="radio"
                    value={option.wert}
                    {...register("beschaeftigungsStatus")}
                    className="mt-0.5 h-4 w-4 shrink-0 border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">
                    {option.label}
                    {option.hilfe && (
                      <HilfeHinweis thema={option.label}>
                        {option.hilfe}
                      </HilfeHinweis>
                    )}
                    {option.kurz && (
                      <span className="block text-xs text-muted-foreground">
                        {option.kurz}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            ))}
          </div>

          {errors.beschaeftigungsStatus && (
            <p className="mt-2 text-xs text-destructive">
              {String(errors.beschaeftigungsStatus.message)}
            </p>
          )}

          {gewaehlt?.fragtNachFreitext && (
            <div className="mt-3">
              <label htmlFor="statusSonstige" className={labelKlasse}>
                Bitte kurz beschreiben <span className="text-destructive">*</span>
              </label>
              <input
                id="statusSonstige"
                type="text"
                maxLength={200}
                placeholder="z.B. Rentner wegen Erwerbsminderung"
                {...register("beschaeftigungsStatusSonstige")}
                className={feldKlasse}
              />
              {errors.beschaeftigungsStatusSonstige && (
                <p className="mt-1 text-xs text-destructive">
                  {String(errors.beschaeftigungsStatusSonstige.message)}
                </p>
              )}
            </div>
          )}

          {nachweis && (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Für diese Angabe brauchen wir später <strong>{nachweis}</strong>. Sie
              können sie im letzten Schritt hochladen.
            </p>
          )}
        </fieldset>
      )}

      {/* ============================================= */}
      {/* Meldung bei der Agentur für Arbeit            */}
      {/* ============================================= */}
      {fc.isVisible("alsArbeitsuchendGemeldet") && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Sind Sie bei der Agentur für Arbeit gemeldet?
            <HilfeHinweis thema="Meldung bei der Agentur für Arbeit">
              Gemeint ist eine Meldung als arbeitsuchend oder ausbildungsuchend —
              auch dann, wenn Sie kein Arbeitslosengeld beziehen. Die Angabe
              brauchen wir, weil sie bei kurzfristigen Beschäftigungen darüber
              mitentscheidet, ob Beiträge anfallen.
            </HilfeHinweis>
          </legend>

          <div className="mt-2">
            <JaNein
              name="Bei der Agentur für Arbeit gemeldet"
              wert={gemeldet}
              onChange={(v) => setValue("alsArbeitsuchendGemeldet", v)}
            />
          </div>

          {gemeldet && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="agentur" className={labelKlasse}>
                  Zuständige Agentur für Arbeit{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  id="agentur"
                  type="text"
                  maxLength={200}
                  placeholder="z.B. Agentur für Arbeit Minden"
                  {...register("agenturFuerArbeit")}
                  className={feldKlasse}
                />
                {errors.agenturFuerArbeit && (
                  <p className="mt-1 text-xs text-destructive">
                    {String(errors.agenturFuerArbeit.message)}
                  </p>
                )}
              </div>
              <div>
                <span className={labelKlasse}>
                  Beziehen Sie Leistungen?{" "}
                  <span className="text-destructive">*</span>
                </span>
                <JaNein
                  name="Leistungsbezug"
                  wert={watch("mitLeistungsbezug") ?? null}
                  onChange={(v) => setValue("mitLeistungsbezug", v)}
                />
                {errors.mitLeistungsbezug && (
                  <p className="mt-1 text-xs text-destructive">
                    {String(errors.mitLeistungsbezug.message)}
                  </p>
                )}
              </div>
            </div>
          )}
        </fieldset>
      )}

      {/* ============================================= */}
      {/* 4a — weitere Beschäftigungen                  */}
      {/* ============================================= */}
      {fc.isVisible("hasOtherEmployment") && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Arbeiten Sie derzeit noch bei anderen Arbeitgebern?
          </legend>
          <div className="mt-2">
            <JaNein
              name="Weitere Beschäftigungen"
              wert={hatWeitere}
              onChange={(v) => {
                setValue("hasOtherEmployment", v);
                if (v && weitere.length === 0) setWeitere([leereZeile("WEITERE")]);
              }}
            />
          </div>

          {hatWeitere && (
            <div className="mt-4 space-y-3">
              {weitere.map((zeile, i) => (
                <div key={i} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Beschäftigung {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setWeitere(weitere.filter((_, x) => x !== i))}
                      className="text-xs text-destructive hover:underline"
                    >
                      Entfernen
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelKlasse}>
                        Beginn <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={zeile.beginn}
                        onChange={(e) =>
                          setWeitere(weitere.map((z, x) => (x === i ? { ...z, beginn: e.target.value } : z)))
                        }
                        className={feldKlasse}
                      />
                    </div>
                    <div>
                      <label className={labelKlasse}>
                        Arbeitgeber{" "}
                        <span className="font-normal text-muted-foreground">(freiwillig)</span>
                      </label>
                      <input
                        type="text"
                        value={zeile.arbeitgeberName}
                        onChange={(e) =>
                          setWeitere(weitere.map((z, x) => (x === i ? { ...z, arbeitgeberName: e.target.value } : z)))
                        }
                        className={feldKlasse}
                      />
                    </div>
                    <div>
                      <label className={labelKlasse}>
                        Adresse{" "}
                        <span className="font-normal text-muted-foreground">(freiwillig)</span>
                      </label>
                      <input
                        type="text"
                        value={zeile.arbeitgeberAdresse}
                        onChange={(e) =>
                          setWeitere(weitere.map((z, x) => (x === i ? { ...z, arbeitgeberAdresse: e.target.value } : z)))
                        }
                        className={feldKlasse}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className={labelKlasse}>
                      Diese Beschäftigung ist <span className="text-destructive">*</span>
                      <HilfeHinweis thema="Eigenanteil zur Rentenversicherung">
                        In einem Minijob zahlt Ihr Arbeitgeber einen Pauschalbeitrag
                        zur Rentenversicherung. Sie selbst steuern normalerweise
                        3,6 % Ihres Verdienstes bei — das ist der Eigenanteil. Wer
                        sich davon hat befreien lassen, zahlt ihn nicht.{" "}
                        <strong>
                          Wenn Sie unsicher sind: Auf Ihrer Lohnabrechnung steht,
                          ob ein Rentenversicherungsbeitrag abgezogen wird.
                        </strong>
                      </HilfeHinweis>
                    </span>
                    <div className="mt-1 space-y-1">
                      {Object.entries(ART_LABELS).map(([wert, label]) => (
                        <label key={wert} className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="radio"
                            checked={zeile.art === wert}
                            onChange={() =>
                              setWeitere(weitere.map((z, x) => (x === i ? { ...z, art: wert } : z)))
                            }
                            className="mt-0.5 h-4 w-4 border-border text-primary focus:ring-primary"
                          />
                          <span className="text-foreground">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setWeitere([...weitere, leereZeile("WEITERE")])}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                + Weitere Beschäftigung hinzufügen
              </button>
            </div>
          )}

          {additionsfrageNoetig && (
            <div className="mt-4 rounded-lg border-l-4 border-[#FBC900] bg-[#FBC900]/10 p-3">
              <span className={labelKlasse}>
                Verdienen Sie mit allen Minijobs zusammen regelmäßig mehr als
                603 € im Monat? <span className="text-destructive">*</span>
                <HilfeHinweis thema="Zusammenrechnung mehrerer Minijobs">
                  Gemeint ist die Summe aus allen Ihren Minijobs, diesen hier
                  eingerechnet. Liegt sie über 603 €, ist es kein Minijob mehr —
                  dann gelten die normalen Regeln zur Sozialversicherung und es
                  werden Beiträge fällig. Deshalb müssen wir das vorher wissen.
                </HilfeHinweis>
              </span>
              <div className="mt-1">
                <JaNein
                  name="Summe über der Geringfügigkeitsgrenze"
                  wert={watch("summeUeberGeringfuegigkeitsgrenze") ?? null}
                  onChange={(v) => setValue("summeUeberGeringfuegigkeitsgrenze", v)}
                />
              </div>
              {errors.summeUeberGeringfuegigkeitsgrenze && (
                <p className="mt-1 text-xs text-destructive">
                  {String(errors.summeUeberGeringfuegigkeitsgrenze.message)}
                </p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {/* ============================================= */}
      {/* 4b — Vorbeschäftigungen                       */}
      {/* ============================================= */}
      {fc.isVisible("vorbeschaeftigungenVorhanden") && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Hatten Sie dieses Jahr schon andere Beschäftigungen?
            <HilfeHinweis thema="Beschäftigungen in diesem Kalenderjahr">
              Gemeint ist alles seit dem 1. Januar dieses Jahres — auch Zeiten, in
              denen Sie bei der Agentur für Arbeit als arbeit- oder
              ausbildungsuchend gemeldet waren. Diese Zeiten zählen zusammen; ab
              drei Monaten beziehungsweise 70 Arbeitstagen ändert sich die
              Beurteilung.
            </HilfeHinweis>
          </legend>
          <div className="mt-2">
            <JaNein
              name="Vorbeschäftigungen"
              wert={hatVor}
              onChange={(v) => {
                setValue("vorbeschaeftigungenVorhanden", v);
                if (v && vor.length === 0) setVor([leereZeile("VORBESCHAEFTIGUNG")]);
              }}
            />
          </div>

          {hatVor && (
            <div className="mt-4 space-y-3">
              {vor.map((zeile, i) => (
                <div key={i} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Zeitraum {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVor(vor.filter((_, x) => x !== i))}
                      className="text-xs text-destructive hover:underline"
                    >
                      Entfernen
                    </button>
                  </div>

                  <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={zeile.beiArbeitsagentur}
                      onChange={(e) =>
                        setVor(vor.map((z, x) => (x === i ? { ...z, beiArbeitsagentur: e.target.checked } : z)))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-foreground">
                      In diesem Zeitraum war ich arbeit- oder ausbildungsuchend
                      gemeldet, nicht beschäftigt.
                    </span>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelKlasse}>
                        Von <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={zeile.beginn}
                        onChange={(e) => setVor(vor.map((z, x) => (x === i ? { ...z, beginn: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                    <div>
                      <label className={labelKlasse}>
                        Bis <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={zeile.ende}
                        onChange={(e) => setVor(vor.map((z, x) => (x === i ? { ...z, ende: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                    <div>
                      <label className={labelKlasse}>
                        Tatsächliche Arbeitstage{" "}
                        <span className="text-destructive">*</span>
                        <HilfeHinweis thema="Tatsächliche Arbeitstage">
                          Gemeint sind die Tage, an denen Sie wirklich gearbeitet
                          haben — nicht die Kalendertage des Zeitraums. Bei einer
                          Meldung ohne Beschäftigung tragen Sie 0 ein.
                        </HilfeHinweis>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={366}
                        value={zeile.arbeitstage}
                        onChange={(e) => setVor(vor.map((z, x) => (x === i ? { ...z, arbeitstage: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                    <div>
                      <span className={labelKlasse}>
                        Verdienst über 603 € im Monat?{" "}
                        <span className="text-destructive">*</span>
                      </span>
                      <JaNein
                        name="Entgelt über der Grenze"
                        wert={zeile.entgeltUeberGrenze}
                        onChange={(v) =>
                          setVor(vor.map((z, x) => (x === i ? { ...z, entgeltUeberGrenze: v } : z)))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelKlasse}>
                        {zeile.beiArbeitsagentur ? "Zuständige Arbeitsagentur" : "Arbeitgeber"}{" "}
                        <span className="font-normal text-muted-foreground">(freiwillig)</span>
                      </label>
                      <input
                        type="text"
                        value={zeile.arbeitgeberName}
                        onChange={(e) => setVor(vor.map((z, x) => (x === i ? { ...z, arbeitgeberName: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setVor([...vor, leereZeile("VORBESCHAEFTIGUNG")])}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                + Weiteren Zeitraum hinzufügen
              </button>
            </div>
          )}
        </fieldset>
      )}

      {/* ============================================= */}
      {/* 4c — Ausland                                  */}
      {/* ============================================= */}
      {fc.isVisible("auslandsbeschaeftigungVorhanden") && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Arbeiten Sie derzeit im Ausland oder sind Sie dort selbstständig?
            <HilfeHinweis thema="Tätigkeit im Ausland">
              Wenn Sie zugleich im Ausland arbeiten, gilt möglicherweise das
              Sozialversicherungsrecht des anderen Landes. Das muss geklärt
              werden, bevor abgerechnet wird — dafür gibt es die
              <strong> Bescheinigung A1</strong>. Haben Sie noch keine, hilft die
              Deutsche Verbindungsstelle Krankenversicherung – Ausland in Bonn
              weiter.
            </HilfeHinweis>
          </legend>
          <div className="mt-2">
            <JaNein
              name="Tätigkeit im Ausland"
              wert={hatAusland}
              onChange={(v) => {
                setValue("auslandsbeschaeftigungVorhanden", v);
                if (v && ausland.length === 0) setAusland([leereZeile("AUSLAND")]);
              }}
            />
          </div>

          {hatAusland && (
            <div className="mt-4 space-y-3">
              {ausland.map((zeile, i) => (
                <div key={i} className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Tätigkeit {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAusland(ausland.filter((_, x) => x !== i))}
                      className="text-xs text-destructive hover:underline"
                    >
                      Entfernen
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelKlasse}>
                        Von <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="date"
                        value={zeile.beginn}
                        onChange={(e) => setAusland(ausland.map((z, x) => (x === i ? { ...z, beginn: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                    <div>
                      <label className={labelKlasse}>
                        Bis{" "}
                        <span className="font-normal text-muted-foreground">
                          (leer lassen, wenn es noch läuft)
                        </span>
                      </label>
                      <input
                        type="date"
                        value={zeile.ende}
                        onChange={(e) => setAusland(ausland.map((z, x) => (x === i ? { ...z, ende: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelKlasse}>
                        Arbeitgeber oder Tätigkeitsort{" "}
                        <span className="font-normal text-muted-foreground">(freiwillig)</span>
                      </label>
                      <input
                        type="text"
                        value={zeile.arbeitgeberName}
                        onChange={(e) => setAusland(ausland.map((z, x) => (x === i ? { ...z, arbeitgeberName: e.target.value } : z)))}
                        className={feldKlasse}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAusland([...ausland, leereZeile("AUSLAND")])}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                + Weitere Tätigkeit hinzufügen
              </button>
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Für diese Angabe brauchen wir später die{" "}
                <strong>Bescheinigung A1</strong>, falls Sie eine haben. Sie können
                sie im letzten Schritt hochladen.
              </p>
            </div>
          )}
        </fieldset>
      )}

      {/* Arbeitgeber-Typ bleibt aus der bisherigen Fassung erhalten */}
      {fc.isVisible("employerType") && (
        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Sind wir Ihr Haupt- oder Nebenarbeitgeber?{" "}
            {fc.isRequired("employerType") && (
              <span className="text-destructive">*</span>
            )}
            <HilfeHinweis thema="Haupt- oder Nebenarbeitgeber">
              Hauptarbeitgeber ist, wo Sie überwiegend arbeiten. Wenn diese
              Stelle bei uns Ihre einzige ist, sind wir Ihr Hauptarbeitgeber.
            </HilfeHinweis>
          </legend>
          <div className="mt-2 space-y-1">
            {[
              ["hauptarbeitgeber", "Hauptarbeitgeber"],
              ["nebenarbeitgeber", "Nebenarbeitgeber"],
              ["nein", "Weiß ich nicht"],
            ].map(([wert, label]) => (
              <label key={wert} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  value={wert}
                  {...register("employerType")}
                  className="h-4 w-4 border-border text-primary focus:ring-primary"
                />
                <span className="text-foreground">{label}</span>
              </label>
            ))}
          </div>
          {errors.employerType && (
            <p className="mt-1 text-xs text-destructive">
              {String(errors.employerType.message)}
            </p>
          )}
        </fieldset>
      )}

      {zeilenFehler.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">
            Bitte prüfen Sie Ihre Einträge:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-destructive">
            {zeilenFehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
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
