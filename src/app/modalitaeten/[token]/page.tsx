"use client";

/**
 * Einstellungsmodalitäten – Vorgesetzten-Formular
 *
 * Der Vorgesetzte füllt hier die Vertragsdaten, Vergütung
 * und Arbeitgeber-Zuordnung für den neuen Mitarbeiter aus.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import { useForm } from "react-hook-form";
import type {
  FieldValues,
  Path,
  PathValue,
  UseFormGetValues,
  UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getBefristungSachgrundLabel, getBefristungsartLabel } from "@/lib/constants";
import { zahlenFeld, zahlOderNull } from "@/lib/formular-zahlen";
import { fehlerMeldung } from "@/lib/formular-fehler";
import {
  supStep1Schema,
  supStep2Schema,
  supStep3Schema,
  supStep4Schema,
  SUP_STEP_CONFIG,
  type SupStep1Data,
  type SupStep2Data,
  type SupStep3Data,
  type SupStep4Data,
} from "@/lib/validations/supervisor-data";

interface OrgOption {
  id: string;
  mandantNumber: string;
  name: string;
  shortName: string | null;
  type: string;
}

interface ModalitaetenData {
  onboardingId: string;
  email: string;
  employeeName: string;
  organization: { name: string; mandantNumber: string; type: string };
  organizations: OrgOption[];
  supervisorData: Record<string, unknown> | null;
  status: string;
}

/** ISO-Datum aus der API ("2026-08-31T00:00:00.000Z") auf das Format von <input type="date"> kuerzen. */
function dateInputValue(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  return v.slice(0, 10);
}

/** Sammelmeldung unter dem Formular, wenn "Weiter" an der Pruefung scheitert. */
const SAMMEL_FEHLER = "Bitte prüfen Sie die rot markierten Felder.";

/**
 * Merker einer Feldgruppe, die zusammen ein- und ausgeblendet wird:
 * ob sie zuletzt sichtbar war und welche Werte beim Ausblenden darin standen.
 */
type FelderMerker = { sichtbar: boolean; werte: Record<string, number | null> };

/**
 * WERTE AUSGEBLENDETER ZAHLENFELDER — warum es diese Funktion gibt
 * ============================================================================
 * Zod prueft immer den GANZEN Schritt, unabhaengig davon, was gerade auf dem
 * Bildschirm steht. Ein hinter "Vollzeit" verstecktes `tageProWoche: 9` laeuft
 * also gegen `.max(7)`, und `handleSubmit` ruft `onNext` nie auf — an einem
 * Feld, das die Person gar nicht mehr sehen und deshalb auch nicht berichtigen
 * kann. Dasselbe beim Wechsel des Verguetungsmodells und beim Entfernen der
 * Haken fuer Sachbezuege, Zulage und Probezeit.
 *
 * Deshalb wird der Wert beim Ausblenden ausdruecklich auf null gesetzt. null
 * ist in allen diesen Feldern gueltig (`z.number()....nullable()`), und es ist
 * auch fachlich richtig: Wer Vollzeit anhakt, hat keine Wochenstunden.
 *
 * WARUM NICHT `shouldUnregister: true` (der naheliegende Weg):
 * Das entfernt den Schluessel komplett aus den Formularwerten. Die Schemata in
 * `supervisor-data.ts` sind aber `.nullable()`, NICHT `.optional()` — ein
 * fehlender Schluessel ergaebe "Required" auf einem unsichtbaren Feld, also
 * genau die Blockade, die hier verschwinden soll. Zusaetzlich wuerde
 * `shouldUnregister` beim Absenden auch die Felder verschlucken, die gar kein
 * Eingabefeld haben (z.B. `sonderzahlungProzent`), und der Server bekaeme sie
 * nie zu sehen.
 *
 * WARUM EIN MERKER: Ein versehentliches Hin- und Herschalten darf nichts
 * vernichten. Beim Ausblenden wird der Wert gemerkt und beim Wiedereinblenden
 * zurueckgestellt — aber nur, wenn das Feld inzwischen leer geblieben ist,
 * damit eine frische Eingabe nicht ueberschrieben wird. Der Vergleich mit
 * `merker.current.sichtbar` sorgt dafuer, dass nur echte Wechsel etwas tun:
 * Ein Wechsel von TV-L auf TV-L S blendet dieselbe Gruppe erneut aus und
 * duerfte den gemerkten Wert nicht mit null ueberschreiben.
 */
function zahlenfelderUmschalter<T extends FieldValues>(
  felder: readonly Path<T>[],
  merker: { current: FelderMerker },
  getValues: UseFormGetValues<T>,
  setValue: UseFormSetValue<T>,
): (sichtbar: boolean) => void {
  return (sichtbar) => {
    if (merker.current.sichtbar === sichtbar) return;
    merker.current.sichtbar = sichtbar;

    for (const feld of felder) {
      if (sichtbar) {
        const gemerkt = merker.current.werte[feld];
        if (gemerkt !== null && gemerkt !== undefined && getValues(feld) == null) {
          setValue(feld, gemerkt as unknown as PathValue<T, Path<T>>);
        }
      } else {
        const aktuell = getValues(feld);
        merker.current.werte[feld] =
          typeof aktuell === "number" && Number.isFinite(aktuell) ? aktuell : null;
        setValue(feld, null as unknown as PathValue<T, Path<T>>);
      }
    }
  };
}

export default function ModalitaetenPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<ModalitaetenData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/modalitaeten/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Fehler beim Laden.");
        return;
      }
      const result = await res.json();
      setPageData(result);
      if (result.supervisorData) {
        setFormData(result.supervisorData);
        setCurrentStep(result.supervisorData.currentStep || 0);
      }
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * Fehler der Serverantwort anzeigen.
   *
   * Das Rollen gehoert dazu: Der Fehlerbanner steht ueber dem Formular, der
   * Knopf, der ihn ausgeloest hat, weit darunter. Ohne das Rollen bliebe die
   * Meldung ausserhalb des Bildausschnitts – also genau die Stille, die hier
   * verschwinden soll.
   */
  const zeigeFehler = (text: string) => {
    setSaveError(true);
    setSaveMsg(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveStepData = async (
    stepData: Record<string, unknown>,
    nextStep: number
  ) => {
    setSaving(true);
    setSaveMsg("");
    setSaveError(false);
    try {
      const res = await fetch(`/api/modalitaeten/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...stepData, currentStep: nextStep }),
      });
      if (!res.ok) {
        // Ohne Meldung wirkt der "Weiter"-Button wie tot – Fehler immer sichtbar machen.
        // `fehlerMeldung` liest auch das `details`-Feld der Antwort aus, in dem die
        // Route die Zod-Befunde mitschickt: Statt "Validierungsfehler" steht dann
        // dort, WELCHES Feld klemmt und warum.
        const err = await res.json().catch(() => ({}));
        zeigeFehler(fehlerMeldung(err));
        return false;
      }
      setSaveMsg("Gespeichert");
      setTimeout(() => setSaveMsg(""), 2000);
      return true;
    } catch {
      zeigeFehler("Fehler beim Speichern. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async (stepData: Record<string, unknown>) => {
    const merged = { ...formData, ...stepData };
    setFormData(merged);
    const nextStep = currentStep + 1;
    const saved = await saveStepData(stepData, nextStep);
    if (saved) {
      setCurrentStep(nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setSaveMsg("");
    setSaveError(false);
    try {
      const res = await fetch(`/api/modalitaeten/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        zeigeFehler(fehlerMeldung(err));
        return;
      }
      setSubmitted(true);
    } catch {
      zeigeFehler("Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.");
    } finally {
      setSaving(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Wird geladen...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image src="/credo_logo_claim.svg" alt="CREDO" width={200} height={65} className="mx-auto mb-6" priority />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-foreground">Link nicht gültig</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // Already submitted
  if (submitted || pageData?.status === "SUPERVISOR_SUBMITTED" || pageData?.status === "REVIEWED" || pageData?.status === "COMPLETED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image src="/credo_logo_claim.svg" alt="CREDO" width={200} height={65} className="mx-auto mb-6" priority />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-foreground">Vielen Dank!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Die Einstellungsmodalitäten wurden erfolgreich eingereicht.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  if (!pageData) return null;

  const progress = ((currentStep + 1) / SUP_STEP_CONFIG.length) * 100;

  const stepProps = {
    data: formData,
    onNext: handleNext,
    onBack: handleBack,
    saving,
    organizations: pageData.organizations,
  };

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/credo_logo.svg" alt="CREDO" width={100} height={33} priority />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground">Einstellungsmodalitäten</h1>
              <p className="text-xs text-muted-foreground">
                für {pageData.employeeName} &middot; {pageData.organization.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                Speichern...
              </span>
            )}
            {/* Nur die kurze Erfolgsmeldung ("Gespeichert") passt in die Kopfzeile.
                Fehlertexte nennen seit der Auswertung von `details` das betroffene
                Feld und sind laenger als eine Zeile – die stehen unten im Banner. */}
            {saveMsg && !saving && !saveError && (
              <span className="text-xs text-green-600">{saveMsg}</span>
            )}
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Schritt {currentStep + 1} / {SUP_STEP_CONFIG.length}
            </span>
          </div>
        </div>
        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Step Navigation */}
      <nav className="border-b bg-card">
        <div className="mx-auto max-w-3xl px-4 py-2">
          <div className="flex gap-1">
            {SUP_STEP_CONFIG.map((step, idx) => {
              const isActive = idx === currentStep;
              const isDone = idx < currentStep;
              const isFuture = idx > currentStep;
              return (
                <button
                  key={step.number}
                  onClick={() => isDone && setCurrentStep(idx)}
                  disabled={isFuture}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-green-100 text-green-800 hover:bg-green-200" : "text-muted-foreground opacity-50"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive ? "bg-primary-foreground text-primary" : isDone ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : step.number}
                  </span>
                  <span className="hidden md:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-6">
        {saveError && saveMsg && !saving && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {saveMsg}
          </div>
        )}
        <div className="overflow-hidden rounded-xl bg-card shadow-sm">
          <div className="border-b bg-muted/50 px-6 py-4">
            <h2 className="text-lg font-bold text-foreground">{SUP_STEP_CONFIG[currentStep].title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{SUP_STEP_CONFIG[currentStep].description}</p>
          </div>
          <div className="p-6">
            {currentStep === 0 && <SupStep1 {...stepProps} />}
            {currentStep === 1 && <SupStep2 {...stepProps} />}
            {currentStep === 2 && <SupStep3 {...stepProps} />}
            {currentStep === 3 && <SupStep4 {...stepProps} />}
            {currentStep === 4 && (
              <SupStep5Summary
                data={formData}
                onBack={handleBack}
                saving={saving}
                onSubmit={() => setShowConfirmDialog(true)}
                organizations={pageData.organizations}
                employeeName={pageData.employeeName}
              />
            )}
          </div>
        </div>
      </main>

      {/* Bestätigungs-Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-foreground">Verbindlich absenden?</h3>
            </div>
            <p className="mb-2 text-sm text-muted-foreground">
              Sie sind dabei, die Einstellungsmodalitäten für <strong>{pageData.employeeName}</strong> verbindlich einzureichen.
            </p>
            <p className="mb-5 text-sm text-muted-foreground">
              Nach dem Absenden können die Daten <strong>nicht mehr geändert</strong> werden. Bitte stellen Sie sicher, dass alle Angaben korrekt sind.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Zurück zur Prüfung
              </button>
              <button
                onClick={() => { setShowConfirmDialog(false); handleSubmit(); }}
                disabled={saving}
                className="flex-1 rounded-lg bg-[#6BAA24] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
              >
                {saving ? "Wird gesendet..." : "Ja, verbindlich absenden"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto border-t bg-card py-4 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        </p>
      </footer>
    </div>
  );
}

// =============================================
// Step 1: Stelle & Vertrag
// =============================================
function SupStep1({
  data,
  onNext,
  saving,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<SupStep1Data>({
    resolver: zodResolver(supStep1Schema),
    defaultValues: {
      betriebsstaette: (data.betriebsstaette as string) || "",
      stellenbeschreibung: (data.stellenbeschreibung as string) || "",
      vertragsbeginn: dateInputValue(data.vertragsbeginn),
      befristet: (data.befristet as boolean) || false,
      // Altdaten kennen nur das kalendermaessige Enddatum -> als KALENDER vorbelegen
      befristungsart:
        (data.befristungsart as "KALENDER" | "ZWECK" | "") ||
        (data.befristet ? "KALENDER" : ""),
      vertragsende: dateInputValue(data.vertragsende),
      befristungZweck: (data.befristungZweck as string) || "",
      vertragsendeVoraussichtlich: dateInputValue(data.vertragsendeVoraussichtlich),
      befristungSachgrund: (data.befristungSachgrund as string) || "",
    },
  });

  const befristet = watch("befristet");
  const befristungsart = watch("befristungsart");

  // Zweiter Rueckruf von handleSubmit: Scheitert die Pruefung, passiert sonst
  // sichtbar nichts – der Fehltext steht womoeglich weit oben ausserhalb des
  // Bildausschnitts. Die Sammelmeldung sitzt direkt ueber dem Knopf.
  const [sammelFehler, setSammelFehler] = useState("");

  return (
    <form
      onSubmit={handleSubmit(
        (v) => {
          setSammelFehler("");
          onNext(v as unknown as Record<string, unknown>);
        },
        () => setSammelFehler(SAMMEL_FEHLER),
      )}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Betriebsstätte <span className="text-destructive">*</span></label>
        <input type="text" {...register("betriebsstaette")} placeholder="z.B. Gymnasium Minden" className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.betriebsstaette && <p className="text-xs text-destructive">{errors.betriebsstaette.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Stellenbeschreibung (wird in Arbeitsvertrag übernommen!) <span className="text-destructive">*</span></label>
        <textarea {...register("stellenbeschreibung")} rows={3} placeholder="z.B. Lehrkraft für Mathematik und Physik" className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.stellenbeschreibung && <p className="text-xs text-destructive">{errors.stellenbeschreibung.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Vertragsbeginn <span className="text-destructive">*</span></label>
        <input type="date" {...register("vertragsbeginn")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.vertragsbeginn && <p className="text-xs text-destructive">{errors.vertragsbeginn.message}</p>}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("befristet")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Befristeter Vertrag</span>
        </label>
        {errors.befristet && <p className="mt-2 text-xs text-destructive">{errors.befristet.message}</p>}
      </div>

      {befristet && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Art der Befristung <span className="text-destructive">*</span></label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 transition-colors hover:bg-accent/50">
                <input type="radio" value="KALENDER" {...register("befristungsart")} className="mt-0.5 h-4 w-4 border-border text-primary focus:ring-primary" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Festes Enddatum</span>
                  <span className="block text-xs text-muted-foreground">Der Vertrag endet an einem konkreten Kalendertag.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 transition-colors hover:bg-accent/50">
                <input type="radio" value="ZWECK" {...register("befristungsart")} className="mt-0.5 h-4 w-4 border-border text-primary focus:ring-primary" />
                <span>
                  <span className="block text-sm font-medium text-foreground">Zweckbefristung &ndash; kein festes Enddatum</span>
                  <span className="block text-xs text-muted-foreground">
                    Der Vertrag endet, sobald der Zweck erreicht ist bzw. die Finanzierung ausl&auml;uft &ndash; z.B. projektbezogen bis zum Ende einer Kostenzusage.
                  </span>
                </span>
              </label>
            </div>
            {errors.befristungsart && <p className="text-xs text-destructive">{errors.befristungsart.message}</p>}
          </div>

          {befristungsart === "KALENDER" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Vertragsende <span className="text-destructive">*</span></label>
              <input type="date" {...register("vertragsende")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
              {errors.vertragsende && <p className="text-xs text-destructive">{errors.vertragsende.message}</p>}
            </div>
          )}

          {befristungsart === "ZWECK" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Wodurch endet der Vertrag? <span className="text-destructive">*</span></label>
                <textarea
                  {...register("befristungZweck")}
                  rows={2}
                  placeholder="z.B. Ende der Kostenzusage des Jugendamtes für das Projekt ..."
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
                {errors.befristungZweck && <p className="text-xs text-destructive">{errors.befristungZweck.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Voraussichtliches Ende (optional)</label>
                <input type="date" {...register("vertragsendeVoraussichtlich")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
                {errors.vertragsendeVoraussichtlich && <p className="text-xs text-destructive">{errors.vertragsendeVoraussichtlich.message}</p>}
                <p className="text-xs text-muted-foreground">Unverbindlich &ndash; dient der Personalabteilung nur als Wiedervorlage.</p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Sachgrund der Befristung</label>
            <select {...register("befristungSachgrund")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              <option value="">Ohne Sachgrund</option>
              <option value="vertretung">Vertretung</option>
              <option value="projektbezogen">Projektbezogen</option>
              <option value="erprobung">Erprobung</option>
              <option value="sonstig">Sonstiger Sachgrund</option>
            </select>
            {errors.befristungSachgrund && <p className="text-xs text-destructive">{errors.befristungSachgrund.message}</p>}
          </div>
        </div>
      )}

      {sammelFehler && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
          {sammelFehler}
        </p>
      )}

      <div className="flex justify-end pt-4">
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 2: Arbeitszeit & Arbeitgeber
// =============================================
function SupStep2({
  data,
  onNext,
  onBack,
  saving,
  organizations,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const vollzeitStart = (data.vollzeit as boolean) ?? true;

  const { register, handleSubmit, watch, getValues, setValue, formState: { errors } } = useForm<SupStep2Data>({
    resolver: zodResolver(supStep2Schema),
    defaultValues: {
      vollzeit: vollzeitStart,
      // Nicht `(... as number) || null`: gespeicherte 0 waere dabei zu null
      // geworden. `setValueAs` greift auf defaultValues nicht, deshalb hier von
      // Hand normalisieren (siehe src/lib/formular-zahlen.ts).
      wochenstunden: zahlOderNull(data.wochenstunden),
      tageProWoche: zahlOderNull(data.tageProWoche),
      hauptarbeitgeberId: (data.hauptarbeitgeberId as string) || "",
      hauptarbeitgeberStunden: zahlOderNull(data.hauptarbeitgeberStunden),
      nebenarbeitgeberId: (data.nebenarbeitgeberId as string) || "",
      nebenarbeitgeberStunden: zahlOderNull(data.nebenarbeitgeberStunden),
      svPflichtig: (data.svPflichtig as boolean) ?? true,
      minijob: (data.minijob as boolean) || false,
      ehrenamt: (data.ehrenamt as boolean) || false,
    },
  });

  const vollzeit = watch("vollzeit");
  const [sammelFehler, setSammelFehler] = useState("");

  // Teilzeit-Felder verschwinden hinter dem Haken "Vollzeit" – siehe
  // zahlenfelderUmschalter().
  const merkerTeilzeit = useRef<FelderMerker>({ sichtbar: !vollzeitStart, werte: {} });
  const teilzeitUmschalten = zahlenfelderUmschalter<SupStep2Data>(
    ["wochenstunden", "tageProWoche"],
    merkerTeilzeit,
    getValues,
    setValue,
  );

  return (
    <form
      onSubmit={handleSubmit(
        (v) => {
          setSammelFehler("");
          onNext(v as unknown as Record<string, unknown>);
        },
        () => setSammelFehler(SAMMEL_FEHLER),
      )}
      className="space-y-5"
    >
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            {...register("vollzeit", {
              onChange: (e) => teilzeitUmschalten(!e.target.checked),
            })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Vollzeit</span>
        </label>
        {errors.vollzeit && <p className="mt-2 text-xs text-destructive">{errors.vollzeit.message}</p>}
      </div>

      {!vollzeit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Wochenstunden</label>
            <input type="number" {...register("wochenstunden", zahlenFeld)} step={0.01} min={0} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
            {errors.wochenstunden && <p className="text-xs text-destructive">{errors.wochenstunden.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Tage pro Woche</label>
            <input type="number" {...register("tageProWoche", zahlenFeld)} min={1} max={7} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
            {errors.tageProWoche && <p className="text-xs text-destructive">{errors.tageProWoche.message}</p>}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#009AC6]/20 bg-[#009AC6]/5 p-4">
        <p className="text-sm text-[#009AC6]">
          <strong>CREDO-Besonderheit:</strong> Ein Mitarbeiter kann bei zwei Einrichtungen gleichzeitig angestellt sein (Haupt- + Nebenarbeitgeber).
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Hauptarbeitgeber <span className="text-destructive">*</span></label>
        <select {...register("hauptarbeitgeberId")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
          <option value="">Bitte wählen...</option>
          {organizations.map((org) => (
            <option key={org.mandantNumber} value={org.mandantNumber}>
              {org.name} ({org.mandantNumber})
            </option>
          ))}
        </select>
        {errors.hauptarbeitgeberId && <p className="text-xs text-destructive">{errors.hauptarbeitgeberId.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Stunden beim Hauptarbeitgeber</label>
        <input type="number" {...register("hauptarbeitgeberStunden", zahlenFeld)} step={0.01} min={0} className="w-32 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.hauptarbeitgeberStunden && <p className="text-xs text-destructive">{errors.hauptarbeitgeberStunden.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Nebenarbeitgeber (optional)</label>
        <select {...register("nebenarbeitgeberId")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
          <option value="">Kein Nebenarbeitgeber</option>
          {organizations.map((org) => (
            <option key={org.mandantNumber} value={org.mandantNumber}>
              {org.name} ({org.mandantNumber})
            </option>
          ))}
        </select>
        {errors.nebenarbeitgeberId && <p className="text-xs text-destructive">{errors.nebenarbeitgeberId.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Stunden beim Nebenarbeitgeber</label>
        <input type="number" {...register("nebenarbeitgeberStunden", zahlenFeld)} step={0.01} min={0} className="w-32 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.nebenarbeitgeberStunden && <p className="text-xs text-destructive">{errors.nebenarbeitgeberStunden.message}</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">Vertragsart</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("svPflichtig")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          SV-pflichtig
        </label>
        {errors.svPflichtig && <p className="text-xs text-destructive">{errors.svPflichtig.message}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("minijob")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          Minijob (geringfügig beschäftigt)
        </label>
        {errors.minijob && <p className="text-xs text-destructive">{errors.minijob.message}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("ehrenamt")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          Ehrenamt
        </label>
        {errors.ehrenamt && <p className="text-xs text-destructive">{errors.ehrenamt.message}</p>}
      </div>

      {sammelFehler && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
          {sammelFehler}
        </p>
      )}

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 3: Vergütung
// =============================================
function SupStep3({
  data,
  onNext,
  onBack,
  saving,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const modellStart = (data.verguetungsmodell as SupStep3Data["verguetungsmodell"]) || undefined;
  const sachbezStart = (data.sachbezuege as boolean) || false;
  const zulageStart = (data.zulage as boolean) || false;

  const { register, handleSubmit, watch, getValues, setValue, formState: { errors } } = useForm<SupStep3Data>({
    resolver: zodResolver(supStep3Schema),
    defaultValues: {
      verguetungsmodell: modellStart,
      entgeltgruppe: (data.entgeltgruppe as string) || "",
      stufe: (data.stufe as string) || "",
      // Nicht `(... as number) || null`: ein gespeichertes 0-Gehalt waere dabei
      // verschwunden. Siehe src/lib/formular-zahlen.ts.
      festgehalt: zahlOderNull(data.festgehalt),
      stundenlohn: zahlOderNull(data.stundenlohn),
      bemerkungVerguetung: (data.bemerkungVerguetung as string) || "",
      jahressonderzahlung: (data.jahressonderzahlung as boolean) ?? true,
      sonderzahlungProzent: zahlOderNull(data.sonderzahlungProzent),
      sachbezuege: sachbezStart,
      sachbezuegeBetrag: zahlOderNull(data.sachbezuegeBetrag),
      zulage: zulageStart,
      zulageBetrag: zahlOderNull(data.zulageBetrag),
    },
  });

  const model = watch("verguetungsmodell");
  const sachbez = watch("sachbezuege");
  const zulage = watch("zulage");
  const [sammelFehler, setSammelFehler] = useState("");

  // Drei Feldgruppen blenden sich hier weg – siehe zahlenfelderUmschalter().
  const istFestbetragModell = (wert: unknown) => wert === "HAUSTARIF" || wert === "SONSTIGES";
  const merkerFestbetrag = useRef<FelderMerker>({ sichtbar: istFestbetragModell(modellStart), werte: {} });
  const festbetragUmschalten = zahlenfelderUmschalter<SupStep3Data>(
    ["festgehalt", "stundenlohn"],
    merkerFestbetrag,
    getValues,
    setValue,
  );

  const merkerSachbezuege = useRef<FelderMerker>({ sichtbar: sachbezStart, werte: {} });
  const sachbezuegeUmschalten = zahlenfelderUmschalter<SupStep3Data>(
    ["sachbezuegeBetrag"],
    merkerSachbezuege,
    getValues,
    setValue,
  );

  const merkerZulage = useRef<FelderMerker>({ sichtbar: zulageStart, werte: {} });
  const zulageUmschalten = zahlenfelderUmschalter<SupStep3Data>(
    ["zulageBetrag"],
    merkerZulage,
    getValues,
    setValue,
  );

  return (
    <form
      onSubmit={handleSubmit(
        (v) => {
          setSammelFehler("");
          onNext(v as unknown as Record<string, unknown>);
        },
        () => setSammelFehler(SAMMEL_FEHLER),
      )}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Vergütungsmodell <span className="text-destructive">*</span></label>
        <select
          {...register("verguetungsmodell", {
            onChange: (e) => festbetragUmschalten(istFestbetragModell(e.target.value)),
          })}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        >
          <option value="">Bitte wählen...</option>
          <option value="TV_L">TV-L (Tarifvertrag der Länder)</option>
          <option value="TV_L_S">TV-L S (Sozial- und Erziehungsdienst)</option>
          <option value="HAUSTARIF">Haustarif</option>
          <option value="SONSTIGES">Sonstiges</option>
        </select>
        {errors.verguetungsmodell && <p className="text-xs text-destructive">{errors.verguetungsmodell.message}</p>}
      </div>

      {(model === "TV_L" || model === "TV_L_S") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Entgeltgruppe</label>
            <select {...register("entgeltgruppe")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              <option value="">Bitte wählen...</option>
              {model === "TV_L" ? (
                <>
                  <option value="E1">E 1</option><option value="E2">E 2</option>
                  <option value="E3">E 3</option><option value="E4">E 4</option>
                  <option value="E5">E 5</option><option value="E6">E 6</option>
                  <option value="E7">E 7</option><option value="E8">E 8</option>
                  <option value="E9a">E 9a</option><option value="E9b">E 9b</option>
                  <option value="E10">E 10</option><option value="E11">E 11</option>
                  <option value="E12">E 12</option><option value="E13">E 13</option>
                  <option value="E14">E 14</option><option value="E15">E 15</option>
                </>
              ) : (
                <>
                  <option value="S2">S 2</option><option value="S3">S 3</option>
                  <option value="S4">S 4</option><option value="S7">S 7</option>
                  <option value="S8a">S 8a</option><option value="S8b">S 8b</option>
                  <option value="S9">S 9</option><option value="S11a">S 11a</option>
                  <option value="S11b">S 11b</option><option value="S12">S 12</option>
                  <option value="S13">S 13</option><option value="S14">S 14</option>
                  <option value="S15">S 15</option><option value="S17">S 17</option>
                  <option value="S18">S 18</option>
                </>
              )}
            </select>
            {errors.entgeltgruppe && <p className="text-xs text-destructive">{errors.entgeltgruppe.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Stufe</label>
            <select {...register("stufe")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              <option value="">Bitte wählen...</option>
              <option value="1">Stufe 1</option><option value="2">Stufe 2</option>
              <option value="3">Stufe 3</option><option value="4">Stufe 4</option>
              <option value="5">Stufe 5</option><option value="6">Stufe 6</option>
            </select>
            {errors.stufe && <p className="text-xs text-destructive">{errors.stufe.message}</p>}
          </div>
        </div>
      )}

      {(model === "HAUSTARIF" || model === "SONSTIGES") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Festgehalt (brutto/Monat)</label>
            <div className="relative">
              <input type="number" {...register("festgehalt", zahlenFeld)} step={0.01} min={0} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-12 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">EUR</span>
            </div>
            {errors.festgehalt && <p className="text-xs text-destructive">{errors.festgehalt.message}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Stundenlohn (brutto)</label>
            <div className="relative">
              <input type="number" {...register("stundenlohn", zahlenFeld)} step={0.01} min={0} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-12 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">EUR</span>
            </div>
            {errors.stundenlohn && <p className="text-xs text-destructive">{errors.stundenlohn.message}</p>}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Bemerkung zur Vergütung</label>
        <textarea {...register("bemerkungVerguetung")} rows={2} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.bemerkungVerguetung && <p className="text-xs text-destructive">{errors.bemerkungVerguetung.message}</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("jahressonderzahlung")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Jahressonderzahlung</span>
        </label>
        {errors.jahressonderzahlung && <p className="text-xs text-destructive">{errors.jahressonderzahlung.message}</p>}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            {...register("sachbezuege", {
              onChange: (e) => sachbezuegeUmschalten(e.target.checked),
            })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Sachbezüge</span>
        </label>
        {errors.sachbezuege && <p className="text-xs text-destructive">{errors.sachbezuege.message}</p>}
        {sachbez && (
          <div className="ml-7 space-y-1">
            <input type="number" {...register("sachbezuegeBetrag", zahlenFeld)} step={0.01} min={0} placeholder="Betrag in EUR" className="w-40 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
            {errors.sachbezuegeBetrag && <p className="text-xs text-destructive">{errors.sachbezuegeBetrag.message}</p>}
          </div>
        )}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            {...register("zulage", {
              onChange: (e) => zulageUmschalten(e.target.checked),
            })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Zulage</span>
        </label>
        {errors.zulage && <p className="text-xs text-destructive">{errors.zulage.message}</p>}
        {zulage && (
          <div className="ml-7 space-y-1">
            <input type="number" {...register("zulageBetrag", zahlenFeld)} step={0.01} min={0} placeholder="Betrag in EUR" className="w-40 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
            {errors.zulageBetrag && <p className="text-xs text-destructive">{errors.zulageBetrag.message}</p>}
          </div>
        )}
      </div>

      {/* `sonderzahlungProzent` hat kein Eingabefeld, kann also auch keinen
          eigenen Fehlerabsatz bekommen. Der Wert wird aus den defaultValues
          unveraendert mitgeschickt. */}
      {sammelFehler && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
          {sammelFehler}
        </p>
      )}

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 4: Zusätzliche Angaben
// =============================================
function SupStep4({
  data,
  onNext,
  onBack,
  saving,
}: {
  data: Record<string, unknown>;
  onNext: (d: Record<string, unknown>) => void;
  onBack: () => void;
  saving: boolean;
  organizations: OrgOption[];
}) {
  const probezeitStart = (data.probezeit as boolean) ?? true;

  // `formState: { errors }` fehlte hier ganz – in diesem Schritt konnte deshalb
  // NIE ein Feldfehler erscheinen, und "Weiter" blieb wortlos stehen.
  const { register, handleSubmit, watch, getValues, setValue, formState: { errors } } = useForm<SupStep4Data>({
    resolver: zodResolver(supStep4Schema),
    defaultValues: {
      kostenstelle: (data.kostenstelle as string) || "",
      // Nicht `(... as number) || null`: ein gespeicherter Anteil von 0 waere
      // dabei verschwunden. Siehe src/lib/formular-zahlen.ts.
      kostenstelleAnteil: zahlOderNull(data.kostenstelleAnteil),
      probezeit: probezeitStart,
      probezeitMonate: zahlOderNull(data.probezeitMonate) ?? 6,
      urlaubstageProJahr: zahlOderNull(data.urlaubstageProJahr) ?? 30,
      masernschutzErforderlich: (data.masernschutzErforderlich as boolean) || false,
      masernschutzVorArbeitsbeginn: (data.masernschutzVorArbeitsbeginn as boolean) || false,
      zeiterfassung: (data.zeiterfassung as boolean) ?? true,
      zusatzvereinbarungen: (data.zusatzvereinbarungen as string) || "",
    },
  });

  const probezeit = watch("probezeit");
  const masern = watch("masernschutzErforderlich");
  const [sammelFehler, setSammelFehler] = useState("");

  // Die Monatsangabe verschwindet mit dem Haken "Probezeit" – siehe
  // zahlenfelderUmschalter().
  const merkerProbezeit = useRef<FelderMerker>({ sichtbar: probezeitStart, werte: {} });
  const probezeitUmschalten = zahlenfelderUmschalter<SupStep4Data>(
    ["probezeitMonate"],
    merkerProbezeit,
    getValues,
    setValue,
  );

  return (
    <form
      onSubmit={handleSubmit(
        (v) => {
          setSammelFehler("");
          onNext(v as unknown as Record<string, unknown>);
        },
        () => setSammelFehler(SAMMEL_FEHLER),
      )}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Kostenstelle</label>
          <input type="text" {...register("kostenstelle")} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          {errors.kostenstelle && <p className="text-xs text-destructive">{errors.kostenstelle.message}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Kostenstellenanteil (%)</label>
          <input type="number" {...register("kostenstelleAnteil", zahlenFeld)} min={0} max={100} className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
          {errors.kostenstelleAnteil && <p className="text-xs text-destructive">{errors.kostenstelleAnteil.message}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            {...register("probezeit", {
              onChange: (e) => probezeitUmschalten(e.target.checked),
            })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-foreground">Probezeit</span>
        </label>
        {errors.probezeit && <p className="text-xs text-destructive">{errors.probezeit.message}</p>}
        {probezeit && (
          <div className="ml-7 space-y-2">
            <label className="text-xs text-muted-foreground">Dauer in Monaten</label>
            <input type="number" {...register("probezeitMonate", zahlenFeld)} min={0} max={12} className="w-24 rounded-lg border border-input bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
            {errors.probezeitMonate && <p className="text-xs text-destructive">{errors.probezeitMonate.message}</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Urlaubstage pro Jahr</label>
        <input type="number" {...register("urlaubstageProJahr", zahlenFeld)} min={0} max={50} className="w-24 rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.urlaubstageProJahr && <p className="text-xs text-destructive">{errors.urlaubstageProJahr.message}</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("masernschutzErforderlich")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Masernschutz erforderlich</span>
        </label>
        {errors.masernschutzErforderlich && <p className="text-xs text-destructive">{errors.masernschutzErforderlich.message}</p>}
        {masern && (
          <>
            <label className="ml-7 flex items-center gap-3">
              <input type="checkbox" {...register("masernschutzVorArbeitsbeginn")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              <span className="text-sm text-foreground">Muss vor Arbeitsbeginn vorliegen</span>
            </label>
            {errors.masernschutzVorArbeitsbeginn && <p className="ml-7 text-xs text-destructive">{errors.masernschutzVorArbeitsbeginn.message}</p>}
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" {...register("zeiterfassung")} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <span className="text-sm font-medium text-foreground">Zeiterfassung erforderlich</span>
        </label>
        {errors.zeiterfassung && <p className="mt-2 text-xs text-destructive">{errors.zeiterfassung.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Zusätzliche Vereinbarungen / Bemerkungen</label>
        <textarea {...register("zusatzvereinbarungen")} rows={4} placeholder="z.B. besondere Regelungen, Dienstwagen, etc." className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" />
        {errors.zusatzvereinbarungen && <p className="text-xs text-destructive">{errors.zusatzvereinbarungen.message}</p>}
      </div>

      {sammelFehler && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
          {sammelFehler}
        </p>
      )}

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Speichern..." : "Weiter"}
        </button>
      </div>
    </form>
  );
}

// =============================================
// Step 5: Zusammenfassung
// =============================================
function SupStep5Summary({
  data,
  onBack,
  saving,
  onSubmit,
  organizations,
  employeeName,
}: {
  data: Record<string, unknown>;
  onBack: () => void;
  saving: boolean;
  onSubmit: () => void;
  organizations: OrgOption[];
  employeeName: string;
}) {
  const str = (v: unknown): string => (v ? String(v) : "—");
  const dateDe = (v: unknown): string => {
    const iso = dateInputValue(v);
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  };
  const findOrg = (id: unknown): string => {
    const org = organizations.find((o) => o.mandantNumber === id);
    return org ? `${org.name} (${org.mandantNumber})` : str(id);
  };

  const MODELL_LABELS: Record<string, string> = {
    TV_L: "TV-L",
    TV_L_S: "TV-L S (Sozial- und Erziehungsdienst)",
    HAUSTARIF: "Haustarif",
    SONSTIGES: "Sonstiges",
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-800">
          Bitte prüfen Sie alle Angaben für <strong>{employeeName}</strong> sorgfältig.
        </p>
      </div>

      {/* Stelle & Vertrag */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">1. Stelle & Vertrag</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Betriebsstätte</span><span className="font-medium">{str(data.betriebsstaette)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stelle</span><span className="font-medium">{str(data.stellenbeschreibung)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Vertragsbeginn</span><span className="font-medium">{dateDe(data.vertragsbeginn)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Befristet</span><span className="font-medium">{data.befristet ? "Ja" : "Nein"}</span></div>
          {!!data.befristet && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Art der Befristung</span><span className="font-medium">{getBefristungsartLabel(data.befristungsart as string) || "—"}</span></div>
              {data.befristungsart === "ZWECK" ? (
                <>
                  <div className="flex justify-between gap-4"><span className="shrink-0 text-muted-foreground">Ende bei</span><span className="max-w-[60%] text-right font-medium">{str(data.befristungZweck)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Voraussichtliches Ende</span><span className="font-medium">{dateDe(data.vertragsendeVoraussichtlich)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-muted-foreground">Vertragsende</span><span className="font-medium">{dateDe(data.vertragsende)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Sachgrund</span><span className="font-medium">{getBefristungSachgrundLabel(data.befristungSachgrund as string)}</span></div>
            </>
          )}
        </div>
      </div>

      {/* Arbeitszeit */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">2. Arbeitszeit & Arbeitgeber</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Vollzeit</span><span className="font-medium">{data.vollzeit ? "Ja" : "Nein"}</span></div>
          {!data.vollzeit && <div className="flex justify-between"><span className="text-muted-foreground">Wochenstunden</span><span className="font-medium">{str(data.wochenstunden)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Hauptarbeitgeber</span><span className="font-medium">{findOrg(data.hauptarbeitgeberId)}</span></div>
          {!!data.nebenarbeitgeberId && <div className="flex justify-between"><span className="text-muted-foreground">Nebenarbeitgeber</span><span className="font-medium">{findOrg(data.nebenarbeitgeberId)}</span></div>}
        </div>
      </div>

      {/* Vergütung */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">3. Vergütung</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Modell</span><span className="font-medium">{MODELL_LABELS[str(data.verguetungsmodell)] || str(data.verguetungsmodell)}</span></div>
          {!!data.entgeltgruppe && <div className="flex justify-between"><span className="text-muted-foreground">Entgeltgruppe</span><span className="font-medium">{str(data.entgeltgruppe)}</span></div>}
          {!!data.stufe && <div className="flex justify-between"><span className="text-muted-foreground">Stufe</span><span className="font-medium">{str(data.stufe)}</span></div>}
          {!!data.festgehalt && <div className="flex justify-between"><span className="text-muted-foreground">Festgehalt</span><span className="font-medium">{str(data.festgehalt)} EUR</span></div>}
        </div>
      </div>

      {/* Zusätzliches */}
      <div className="rounded-lg border border-border">
        <div className="border-b bg-muted/50 px-4 py-2"><h3 className="text-sm font-semibold">4. Zusätzliche Angaben</h3></div>
        <div className="px-4 py-3 text-xs space-y-1">
          {!!data.kostenstelle && <div className="flex justify-between"><span className="text-muted-foreground">Kostenstelle</span><span className="font-medium">{str(data.kostenstelle)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Probezeit</span><span className="font-medium">{data.probezeit ? `${str(data.probezeitMonate)} Monate` : "Nein"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Urlaubstage</span><span className="font-medium">{str(data.urlaubstageProJahr)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Zeiterfassung</span><span className="font-medium">{data.zeiterfassung ? "Ja" : "Nein"}</span></div>
          {!!data.zusatzvereinbarungen && <div className="flex justify-between"><span className="text-muted-foreground">Zusatzvereinbarungen</span><span className="font-medium max-w-[60%] text-right">{str(data.zusatzvereinbarungen)}</span></div>}
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent">Zurück</button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="rounded-lg bg-[#6BAA24] px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-[#5a9420] disabled:opacity-50"
        >
          {saving ? "Wird gesendet..." : "Verbindlich absenden"}
        </button>
      </div>
    </div>
  );
}
