"use client";

/**
 * Step 1: Persönliche Angaben
 * Name, Geburtsdatum, Familienstand, Schwerbehinderung
 *
 * Die `maxLength` an den Textfeldern spiegeln die Grenzen des Servers
 * (`fragebogenFieldsSchema` in api/fragebogen/[token]/route.ts). Ohne sie nimmt
 * das Feld beliebig viel entgegen, und erst der Auto-Save antwortet mit 400 —
 * die Person liest dann "Bitte pruefen Sie die Eingabe", ohne dass auf dem
 * Bildschirm irgendetwas falsch aussieht.
 *
 * Das `maxLength` allein genuegt aber nicht: Es bremst das Tippen, nicht das
 * EINFUEGEN aus der Zwischenablage. Deshalb steht unter jedem dieser Felder
 * zusaetzlich der Fehlerabsatz, der die Meldung des Schemas anzeigt.
 */

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStep1Schema, type Step1Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";
import { zahlenFeld, zahlOderNull } from "@/lib/formular-zahlen";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  fieldConfig?: FieldConfigHelper;
}

/**
 * Ja/Nein als zwei Schaltflaechen — eindeutiger als eine einzelne Checkbox.
 *
 * Ein Haken kennt nur „gesetzt" und „nicht gesetzt", und „nicht gesetzt" liest
 * sich wie ein Nein. Hier muss aber „noch nicht beantwortet" sichtbar bleiben:
 * Das Nein laesst die Nachweispflicht entfallen, und es soll nur dort stehen,
 * wo jemand es bewusst angeklickt hat.
 *
 * Baugleich mit der Fassung in step6-employment.tsx. Sie liegt dort ebenfalls
 * lokal; zusammengelegt gehoert beides erst, wenn eine dritte Stelle sie
 * braucht.
 */
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

export function Step1Personal({ data, onNext, saving, fieldConfig }: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(1);
  const schema = useMemo(() => createStep1Schema(fc), [fc]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      salutation: (data.salutation as Step1Data["salutation"]) || undefined,
      title: (data.title as string) || "",
      firstName: (data.firstName as string) || "",
      lastName: (data.lastName as string) || "",
      birthName: (data.birthName as string) || "",
      birthDate: (data.birthDate as string) || "",
      birthPlace: (data.birthPlace as string) || "",
      birthCountry: (data.birthCountry as string) || "Deutschland",
      nationality: (data.nationality as string) || "deutsch",
      // Ohne Vorbelegung: `null` heisst „noch nicht beantwortet". Ein
      // vorbelegtes `false` waere die folgenreichste Antwort des Fragebogens —
      // sie laesst Aufenthaltstitel und Arbeitserlaubnis aus den
      // Pflichtdokumenten fallen —, und niemand haette sie gegeben.
      aufenthaltstitelErforderlich:
        typeof data.aufenthaltstitelErforderlich === "boolean"
          ? data.aufenthaltstitelErforderlich
          : null,
      aufenthaltstitelGueltigBis:
        (data.aufenthaltstitelGueltigBis as string) || "",
      maritalStatus:
        (data.maritalStatus as Step1Data["maritalStatus"]) || undefined,
      severelyDisabled: (data.severelyDisabled as boolean) || false,
      // Nicht `(... as number) || null`: ein gespeicherter Grad von 0 waere
      // dabei zu null geworden und beim naechsten Laden verschwunden. 0 ist hier
      // eine Angabe, keine Luecke. `setValueAs` greift auf defaultValues nicht,
      // deshalb wird hier von Hand normalisiert.
      disabilityDegree: zahlOderNull(data.disabilityDegree),
    },
  });

  const severelyDisabled = watch("severelyDisabled");
  const aufenthaltstitelErforderlich = watch("aufenthaltstitelErforderlich");

  /**
   * Haken weg, Grad weg.
   *
   * Das Eingabefeld verschwindet zwar mit dem Haken, der zuletzt eingetippte
   * Grad bleibt aber im Formularzustand — react-hook-form meldet ein Feld beim
   * Ausblenden nicht ab (`shouldUnregister` steht auf `false`). Beim naechsten
   * "Weiter" ginge deshalb `severelyDisabled: false` gemeinsam mit
   * `disabilityDegree: 50` an den Server, und in der Personalakte stuende ein
   * Behinderungsgrad fuer jemanden ohne Schwerbehinderung.
   *
   * Bewusst als Effekt und nicht nur im `onChange` des Hakens: So heilt das
   * Formular auch Bestandsdaten, in denen diese Kombination schon gespeichert
   * ist. Sie wird beim ersten Rendern erkannt und beim naechsten Speichern
   * aufgeloest.
   */
  useEffect(() => {
    if (severelyDisabled) return;
    if (getValues("disabilityDegree") === null) return;
    setValue("disabilityDegree", null, { shouldDirty: true, shouldValidate: true });
  }, [severelyDisabled, getValues, setValue]);

  /**
   * Kein Aufenthaltstitel, kein Ablaufdatum.
   *
   * Dieselbe Falle wie beim Behinderungsgrad daneben, nur mit schwereren
   * Folgen: Wer erst „Ja" anklickt, ein Datum eintraegt und dann auf „Nein"
   * wechselt, hinterliesse in der Akte eine Befristung zu einem Titel, den es
   * nach eigener Aussage gar nicht gibt — und genau an diesem Datum haengt
   * spaeter die Ablauf-Ampel. Das leere Feld wird vom Server als `null`
   * uebernommen (`aufenthaltstitelGueltigBis` steht in
   * LEERBARE_FRAGEBOGEN_FELDER); ohne diese Freigabe bliebe der alte Wert
   * stehen und der Auto-Save meldete trotzdem Erfolg.
   *
   * Als Effekt und nicht nur im Klick-Handler, damit auch ein bereits
   * gespeicherter Widerspruch beim naechsten Speichern aufgeloest wird.
   */
  useEffect(() => {
    if (aufenthaltstitelErforderlich === true) return;
    if (getValues("aufenthaltstitelGueltigBis") === "") return;
    setValue("aufenthaltstitelGueltigBis", "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [aufenthaltstitelErforderlich, getValues, setValue]);

  const onSubmit = (values: Step1Data) => {
    onNext(values as unknown as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Anrede – alwaysVisible */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {fc.getLabel("salutation")} <span className="text-destructive">*</span>
        </label>
        <div className="flex gap-4">
          {["Herr", "Frau"].map((val) => (
            <label key={val} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value={val}
                {...register("salutation")}
                className="h-4 w-4 border-border text-primary focus:ring-primary"
              />
              {val}
            </label>
          ))}
        </div>
        {errors.salutation && (
          <p className="text-xs text-destructive">{errors.salutation.message}</p>
        )}
      </div>

      {/* Titel */}
      {fc.isVisible("title") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("title")} {fc.isRequired("title") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("title")}
            maxLength={100}
            placeholder="z.B. Dr., Prof."
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>
      )}

      {/* Vorname + Nachname – alwaysVisible */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("firstName")} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("firstName")}
            maxLength={100}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("lastName")} <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("lastName")}
            maxLength={100}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName.message}</p>
          )}
        </div>
      </div>

      {/* Geburtsname */}
      {fc.isVisible("birthName") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("birthName")} {fc.isRequired("birthName") && <span className="text-destructive">*</span>}
          </label>
          <input
            type="text"
            {...register("birthName")}
            maxLength={100}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.birthName && (
            <p className="text-xs text-destructive">
              {errors.birthName.message}
            </p>
          )}
        </div>
      )}

      {/* Geburtsdatum + Geburtsort */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Geburtsdatum – alwaysVisible
            AN DIESEM FELD HAENGT DER MASERNSCHUTZ. Schritt 9 fragt das
            Geburtsjahr nicht mehr ab, sondern leitet es hier ab
            (src/lib/masernschutz.ts); daraus entsteht die Pflicht zum Nachweis.
            Es traegt das zu Recht: Schritt 1 ist Pflichtschritt und steht immer
            vorn, das Feld ist in der Registry `alwaysVisible`/`alwaysRequired`
            und in `createStep1Schema` fest als Pflicht verdrahtet — es laesst
            sich im Vorlagen-Editor also nicht abschalten. Und `type="date"`
            liefert unabhaengig von der Anzeigesprache "JJJJ-MM-TT" oder "", das
            Format, das die Ableitung liest. Wer eines davon aendert, aendert die
            Masernschutz-Regel mit. */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("birthDate")} <span className="text-destructive">*</span>
          </label>
          <input
            type="date"
            {...register("birthDate")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {errors.birthDate && (
            <p className="text-xs text-destructive">
              {errors.birthDate.message}
            </p>
          )}
        </div>
        {fc.isVisible("birthPlace") && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {fc.getLabel("birthPlace")} {fc.isRequired("birthPlace") && <span className="text-destructive">*</span>}
            </label>
            <input
              type="text"
              {...register("birthPlace")}
              maxLength={200}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            {errors.birthPlace && (
              <p className="text-xs text-destructive">
                {errors.birthPlace.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Geburtsland + Staatsangehörigkeit */}
      {(fc.isVisible("birthCountry") || fc.isVisible("nationality")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fc.isVisible("birthCountry") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("birthCountry")} {fc.isRequired("birthCountry") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="text"
                {...register("birthCountry")}
                maxLength={100}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {errors.birthCountry && (
                <p className="text-xs text-destructive">
                  {errors.birthCountry.message}
                </p>
              )}
            </div>
          )}
          {fc.isVisible("nationality") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {fc.getLabel("nationality")} {fc.isRequired("nationality") && <span className="text-destructive">*</span>}
              </label>
              <input
                type="text"
                {...register("nationality")}
                maxLength={100}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {errors.nationality && (
                <p className="text-xs text-destructive">
                  {errors.nationality.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Aufenthaltstitel — steht bewusst direkt hinter der
          Staatsangehoerigkeit, aber als EIGENE Frage. Aus dem Freitextfeld
          darueber laesst sich der Aufenthaltsstatus nicht ableiten (siehe
          createStep1Schema); gefragt wird deshalb rundheraus.

          Der Erklaersatz ist kein Beiwerk. Die Frage geht an jede Person, auch
          an die, die seit ihrer Geburt hier lebt — ohne den Satz liest sie sich
          wie ein Verdacht. Mit ihm ist in einem Zug klar, dass sie einen
          Grossteil der Belegschaft gar nicht betrifft. */}
      {fc.isVisible("aufenthaltstitelErforderlich") && (
        <fieldset className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            {fc.getLabel("aufenthaltstitelErforderlich")}{" "}
            {fc.isRequired("aufenthaltstitelErforderlich") && (
              <span className="text-destructive">*</span>
            )}
          </legend>
          <p className="text-xs text-muted-foreground">
            Diese Angabe brauchen wir nur, wenn Sie keine EU-Staatsangehörigkeit
            haben. Mit der deutschen oder einer anderen Staatsangehörigkeit der
            EU — ebenso aus Island, Liechtenstein, Norwegen oder der Schweiz —
            dürfen Sie ohne Aufenthaltstitel arbeiten; antworten Sie dann bitte
            mit „Nein“.
          </p>
          <JaNein
            name={fc.getLabel("aufenthaltstitelErforderlich")}
            wert={aufenthaltstitelErforderlich ?? null}
            onChange={(v) =>
              setValue("aufenthaltstitelErforderlich", v, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          {errors.aufenthaltstitelErforderlich && (
            <p className="text-xs text-destructive">
              {errors.aufenthaltstitelErforderlich.message}
            </p>
          )}

          {aufenthaltstitelErforderlich === true &&
            fc.isVisible("aufenthaltstitelGueltigBis") && (
              <div className="space-y-2 border-t border-border pt-3">
                <label className="text-sm font-medium text-foreground">
                  {fc.getLabel("aufenthaltstitelGueltigBis")}{" "}
                  {fc.isRequired("aufenthaltstitelGueltigBis") && (
                    <span className="text-destructive">*</span>
                  )}
                </label>
                <input
                  type="date"
                  {...register("aufenthaltstitelGueltigBis")}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring sm:w-56"
                />
                {errors.aufenthaltstitelGueltigBis && (
                  <p className="text-xs text-destructive">
                    {errors.aufenthaltstitelGueltigBis.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Bitte lassen Sie das Feld leer, wenn Ihr Titel unbefristet ist
                  — etwa bei einer Niederlassungserlaubnis. Den Aufenthaltstitel
                  und, falls Sie eine gesonderte Arbeitserlaubnis haben, auch
                  diese laden Sie am Ende des Fragebogens hoch. Fehlt ein
                  Nachweis noch, können Sie den Fragebogen trotzdem absenden und
                  ihn nachreichen.
                </p>
              </div>
            )}
        </fieldset>
      )}

      {/* Familienstand */}
      {fc.isVisible("maritalStatus") && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {fc.getLabel("maritalStatus")} {fc.isRequired("maritalStatus") && <span className="text-destructive">*</span>}
          </label>
          <select
            {...register("maritalStatus")}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="">Bitte waehlen...</option>
            <option value="ledig">Ledig</option>
            <option value="verheiratet">Verheiratet</option>
            <option value="geschieden">Geschieden</option>
            <option value="verwitwet">Verwitwet</option>
            <option value="getrennt_lebend">Getrennt lebend</option>
            <option value="eingetragene_partnerschaft">
              Eingetragene Lebenspartnerschaft
            </option>
          </select>
          {errors.maritalStatus && (
            <p className="text-xs text-destructive">
              {errors.maritalStatus.message}
            </p>
          )}
        </div>
      )}

      {/* Schwerbehinderung */}
      {fc.isVisible("severelyDisabled") && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("severelyDisabled")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium text-foreground">
              {fc.getLabel("severelyDisabled")}
            </span>
          </label>
          {severelyDisabled && (
            <div className="ml-7 space-y-2">
              <label className="text-sm text-muted-foreground">
                Grad der Behinderung (GdB)
              </label>
              <input
                type="number"
                {...register("disabilityDegree", zahlenFeld)}
                min={0}
                max={100}
                step={10}
                className="w-32 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              {errors.disabilityDegree && (
                <p className="text-xs text-destructive">
                  {errors.disabilityDegree.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}
