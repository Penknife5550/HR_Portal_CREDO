"use client";

/**
 * Step 9: Masernschutz
 * Fuer Gemeinschaftseinrichtungen (Schulen, Kitas) ab 01.03.2020 Pflicht
 * gemäß Masernschutzgesetz (IfSG §20 Abs. 8)
 *
 * DAS GEBURTSJAHR WIRD ABGELEITET, NICHT GEFRAGT. Frueher stand hier ein
 * eigener Haken "Nach 1971 geboren?" neben dem Geburtsdatum aus Schritt 1 —
 * zwei Wahrheiten zu derselben Tatsache. Blieb der Haken leer (und das tat er,
 * weil niemand eine Frage beantwortet, die er schon beantwortet hat), stand in
 * der Personalakte "Nein", obwohl das Geburtsjahr 2001 daneben stand. Die Regel
 * liegt jetzt in `@/lib/masernschutz` und wird von Fragebogen, Dokumentenpflicht
 * und Serverpruefung gemeinsam benutzt.
 *
 * Das Feld `bornAfter1971` wird weiterhin GESPEICHERT — Uebersicht, HR-Sicht und
 * Personalakte-PDF lesen es. Nur eben abgeleitet statt getippt.
 *
 * Wenn Nachweis vorhanden: Inline-Upload für Impfausweis/Attest
 */

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { step9Schema, type Step9Data } from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";
import { istNachreichbar } from "@/lib/required-documents";
import {
  geburtsjahr,
  istGemeinschaftseinrichtung,
  istNach1970Geboren,
  masernschutzPflichtig,
} from "@/lib/masernschutz";

interface StepProps {
  data: Record<string, unknown>;
  onNext: (data: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organization: { name: string; type: string };
  fieldConfig?: FieldConfigHelper;
  token?: string;
}

export function Step9Masern({
  data,
  onNext,
  onBack,
  saving,
  organization,
  fieldConfig,
  token,
}: StepProps) {
  const fc = fieldConfig ?? new FieldConfigHelper(9);

  // Abgeleitet aus Schritt 1. Der steht in jeder Vorlage vor Schritt 9 und ist
  // ein Pflichtschritt mit Pflichtfeld `birthDate` — der Wert liegt hier also
  // vor. `null` ist trotzdem vorgesehen: Er bedeutet "unbekannt" und fuehrt
  // weder zu einer Pflicht noch zu einem stillen "Nein".
  const geborenNach1970 = istNach1970Geboren(data.birthDate);
  const jahr = geburtsjahr(data.birthDate);
  const isGemeinschaftseinrichtung = istGemeinschaftseinrichtung(
    organization.type
  );
  // Dieselbe Funktion, die spaeter ueber die Dokumentenpflicht entscheidet.
  // Bauten Maske und Pflicht ihre eigene Bedingung, liefen sie auseinander.
  const nachweisPflichtig = masernschutzPflichtig({
    geburtsdatum: data.birthDate,
    organisationstyp: organization.type,
  });

  const {
    register,
    handleSubmit,
    watch,
  } = useForm<Step9Data>({
    resolver: zodResolver(step9Schema),
    defaultValues: {
      // `bornAfter1971` steht nur noch im Formularzustand, weil das Schema es
      // verlangt — angezeigt und bearbeitet wird es nicht mehr. Was tatsaechlich
      // gespeichert wird, entscheidet `onSubmit` aus dem abgeleiteten Wert.
      bornAfter1971: geborenNach1970 ?? false,
      masernschutzProvided: (data.masernschutzProvided as boolean) || false,
    },
  });

  const masernschutzProvided = watch("masernschutzProvided");

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!token) return;
    setUploadError(null);

    // Dieselbe Grenze wie serverseitig — hier vorweggenommen, damit ein
    // Handyfoto des Impfausweises nicht erst nach dem vollstaendigen Hochladen
    // abgewiesen wird. Ueber Mobilfunk sind das mehrere Minuten Wartezeit fuer
    // eine Absage, die von Anfang an feststand.
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`Datei "${file.name}" ist zu gross (max. 10 MB).`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "masernschutz");
      const res = await fetch(`/api/fragebogen/${token}/documents`, { method: "POST", body: formData });
      if (res.ok) {
        setUploadedFile(file.name);
      } else {
        // Der Server nennt den Grund ("Datei ist zu gross...", "Dateityp nicht
        // erlaubt..."). Ein pauschales "Upload fehlgeschlagen" verschweigt ihn
        // und laesst nur den Weg, dieselbe Datei noch einmal zu probieren.
        // `catch` faengt Antworten ohne JSON-Koerper ab (etwa eine Fehlerseite
        // des Reverse Proxy).
        const koerper = await res.json().catch(() => null);
        const meldung =
          koerper && typeof koerper.error === "string" ? koerper.error : "";
        setUploadError(meldung || "Der Upload ist fehlgeschlagen.");
      }
    } catch {
      setUploadError("Verbindungsfehler beim Hochladen.");
    } finally {
      setUploading(false);
    }
  };

  /**
   * Gespeichert wird nur, was tatsaechlich beantwortet ist.
   *
   * Ohne Geburtsdatum geht GAR NICHTS mit: Ein `bornAfter1971: false` waere ein
   * stilles "Nein" auf eine nie gestellte Frage — genau der Befund, der diesen
   * Umbau ausgeloest hat. `masernschutzProvided` bleibt in diesem Fall ebenfalls
   * unangetastet (die Route uebernimmt nur mitgesendete Felder, siehe
   * `api/fragebogen/[token]/route.ts`), damit ein frueher gegebener Wert nicht
   * durch ein Durchklicken geloescht wird.
   */
  const onSubmit = (values: Step9Data) => {
    const nutzlast: Record<string, unknown> = {};
    if (geborenNach1970 !== null) {
      nutzlast.bornAfter1971 = geborenNach1970;
      // Die Nachweisfrage wird nur gestellt, wenn die Person nach dem
      // 31.12.1970 geboren ist. Wer davor geboren ist, gilt als immun — dann
      // gibt es nichts zu beantworten und nichts zu ueberschreiben.
      if (geborenNach1970) {
        nutzlast.masernschutzProvided = values.masernschutzProvided;
      }
    }
    onNext(nutzlast);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Info-Box */}
      <div
        className={`rounded-lg border p-4 ${
          isGemeinschaftseinrichtung
            ? "border-yellow-300 bg-yellow-50"
            : "border-credo-blau/20 bg-credo-blau/5"
        }`}
      >
        <p className={`text-sm ${isGemeinschaftseinrichtung ? "text-yellow-800" : "text-credo-blau"}`}>
          {isGemeinschaftseinrichtung ? (
            <>
              <strong>Wichtig:</strong> Als Mitarbeiter/in einer
              Gemeinschaftseinrichtung ({organization.name}) sind Sie gemäß
              Masernschutzgesetz (IfSG §20 Abs. 8) verpflichtet, einen
              Masernschutz nachzuweisen, sofern Sie nach dem 31.12.1970 geboren
              wurden.
            </>
          ) : (
            /* Keine Gemeinschaftseinrichtung: IfSG §20 Abs. 8 traegt hier
               nicht. Der Nachweis ist ein Gesundheitsdatum (Art. 9 DSGVO) und
               darf deshalb nur freiwillig erbeten, nicht verlangt werden. */
            <>
              {organization.name} ist keine Gemeinschaftseinrichtung im Sinne des
              Masernschutzgesetzes — ein Nachweis ist hier nicht vorgeschrieben.
              Die folgende Angabe ist freiwillig.
            </>
          )}
        </p>
      </div>

      {/* Geburtsjahr — abgeleitet aus Schritt 1, keine Eingabe.
          `fc.isVisible` steuert weiterhin die ANZEIGE. Der abgeleitete Wert
          wird trotzdem gespeichert: Er ist eine Tatsache aus dem Geburtsdatum
          und keine Antwort, die HR per Schalter abbestellen koennte. */}
      {fc.isVisible("bornAfter1971") && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          {geborenNach1970 === null ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Ihr Geburtsdatum liegt uns noch nicht vor.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bitte tragen Sie es in Schritt 1 (Persönliche Angaben) nach —
                erst daraus ergibt sich, ob ein Masernschutznachweis nötig ist.
                Solange bleibt diese Angabe offen.
              </p>
            </>
          ) : geborenNach1970 ? (
            <>
              <p className="text-sm font-medium text-foreground">
                Sie sind nach dem 31.12.1970 geboren.
                {nachweisPflichtig
                  ? " Deshalb ist der Masernschutz nachzuweisen."
                  : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Abgeleitet aus Ihrem Geburtsjahr ({jahr}) aus Schritt 1. Stimmt
                das nicht, korrigieren Sie bitte dort das Geburtsdatum.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                Sie sind vor dem 01.01.1971 geboren — ein Masernschutznachweis
                ist für Sie nicht erforderlich.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Personen, die vor 1971 geboren sind, gelten als immun.
                Abgeleitet aus Ihrem Geburtsjahr ({jahr}) aus Schritt 1.
              </p>
            </>
          )}
        </div>
      )}

      {/* Masernschutz vorhanden — nur, wenn die Frage sich ueberhaupt stellt.
          Bei fehlendem Geburtsdatum (`null`) bleibt sie aus: Ohne die Grundlage
          waere jede Antwort hier eine Behauptung ins Blaue. */}
      {geborenNach1970 === true && fc.isVisible("masernschutzProvided") && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              {...register("masernschutzProvided")}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <div>
              {/* KEIN Pflicht-Sternchen. Der Haken erzwingt nichts — die
                  Pflicht haengt am hochgeladenen Nachweis, nicht an der
                  Selbstauskunft. Ein Sternchen an einem Feld, das niemand
                  prueft, ist genau die Sorte Anzeige, die diesen Schritt in den
                  Befund gebracht hat. */}
              <span className="text-sm font-medium text-foreground">
                {fc.getLabel("masernschutzProvided")}
              </span>
              <p className="text-xs text-muted-foreground">
                Ich kann einen der folgenden Nachweise erbringen: Impfausweis
                mit 2 Masern-Impfungen, aerztliches Attest über Immunitaet,
                oder eine Kontraindikation.
              </p>
            </div>
          </label>

          <div className="ml-7 rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Moegliche Nachweise:</strong>
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              <li>Impfausweis (2 Impfungen gegen Masern)</li>
              <li>Aerztliches Zeugnis über ausreichenden Impfschutz</li>
              <li>Aerztliches Zeugnis über Immunitaet</li>
              <li>Aerztliches Zeugnis über medizinische Kontraindikation</li>
            </ul>
          </div>

          {/* Inline Upload für Masernschutz-Nachweis */}
          {masernschutzProvided && token && (
            <div className="ml-7 rounded-lg border border-dashed border-border bg-muted/30 p-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Masernschutz-Nachweis</p>
                    {/* Der Fehler steht VOR dem Dateinamen: Schlaegt das
                        Ersetzen einer bereits hochgeladenen Datei fehl, waere
                        der gruene Name sonst die einzige Rueckmeldung — es
                        saehe aus, als haette es geklappt. */}
                    {uploadError ? (
                      <p className="text-[10px] text-destructive">{uploadError}</p>
                    ) : uploadedFile ? (
                      <p className="text-[10px] text-credo-gruen truncate">{uploadedFile}</p>
                    ) : nachweisPflichtig ? (
                      /* "Optional" waere hier falsch — und zwar an der einen
                         Stelle, an der die Person die Datei gerade in der Hand
                         haelt. Ob das Absenden ohne den Nachweis aufgehalten
                         wird, wird NICHT hier entschieden und auch nicht hier
                         behauptet: Das sagt `istNachreichbar`, dieselbe
                         Funktion, an der die Dokumentenliste in Schritt 10 und
                         die Pruefung des Servers haengen. Ein eigener Satz
                         waere die naechste Stelle, die mit ihr auseinanderlaeuft. */
                      <p className="text-[10px] text-muted-foreground">
                        {istNachreichbar("MASERNSCHUTZ")
                          ? "Pflicht — Sie dürfen den Nachweis nachreichen"
                          : "Pflicht — ohne den Nachweis können Sie nicht absenden"}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Optional — kann auch spaeter nachgereicht werden</p>
                    )}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    uploadedFile
                      ? "border border-credo-gruen/30 bg-credo-gruen/5 text-credo-gruen"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted"
                  } disabled:opacity-50`}
                >
                  {uploading ? "..." : uploadedFile ? "Ersetzen" : "Hochladen"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
        >
          Zurück
        </button>
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
