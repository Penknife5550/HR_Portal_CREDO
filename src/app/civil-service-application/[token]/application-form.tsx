"use client";

/**
 * LK-Antragsformular – Antrag auf Uebernahme ins Planstelleninhaberverhaeltnis
 *
 * 12 Voraussetzungskarten als interaktive Cards.
 * Apple-like UX, Auto-Save, Touch-friendly.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type { ApplicationData } from "./page";

// =============================================
// Konstanten: Die 12 Kriterien
// =============================================

interface CriterionDefinition {
  key: string;
  title: string;
  description: string;
  type: "checkbox" | "number" | "checkbox-textarea" | "checkbox-date" | "text" | "info";
  /** Label für Checkbox-Input */
  checkboxLabel?: string;
  /** Placeholder für Text-/Textarea-Input */
  placeholder?: string;
  /** Info-Text für Kriterien die nicht von LK geprueft werden */
  infoText?: string;
  /** Validierungsfunktion */
  validate?: (value: unknown) => boolean;
  /** Minimum für number-Felder */
  min?: number;
}

const CRITERIA: CriterionDefinition[] = [
  {
    key: "hasUnlimitedContract",
    title: "Unbefristeter Arbeitsvertrag",
    description: "Sie benoetigen einen unbefristeten Arbeitsvertrag an der FES.",
    type: "checkbox",
    checkboxLabel: "Ich bestaetige einen unbefristeten Arbeitsvertrag",
  },
  {
    key: "intendedLongTermStay",
    title: "Langfristige Mitarbeit (10+ Jahre)",
    description: "Die Verbeamtung setzt die Absicht voraus, mindestens 10 weitere Jahre an der FES taetig zu sein.",
    type: "checkbox",
    checkboxLabel: "Ich beabsichtige mindestens 10 weitere Jahre an der FES zu arbeiten",
  },
  {
    key: "workloadPercent",
    title: "Mindestens 75% Stellenumfang",
    description: "Der aktuelle Stellenumfang muss mindestens 75% betragen.",
    type: "number",
    placeholder: "z.B. 100",
    min: 0,
    validate: (v) => typeof v === "number" && v >= 75,
  },
  {
    key: "dienstlicheBeurteilung",
    title: "Dienstliche Beurteilung < 3,0",
    description: "Ihre dienstliche Beurteilung muss insgesamt besser als 3,0 sein.",
    type: "info",
    infoText: "Wird im naechsten Schritt durch die Schulleitung geprueft.",
  },
  {
    key: "activeCommunityMembership",
    title: "Aktive Gemeindemitgliedschaft",
    description: "Eine aktive Mitgliedschaft in einer christlichen Gemeinde mit einem Dienstbereich wird vorausgesetzt.",
    type: "checkbox-textarea",
    checkboxLabel: "Ich bin aktives Mitglied einer christlichen Gemeinde",
    placeholder: "Name der Gemeinde und Dienstbereich (z.B. Jugendarbeit, Worship, Kinderkirche...)",
  },
  {
    key: "biblischeIntegration",
    title: "Biblische Integration",
    description: "Die Integration biblischer Prinzipien in den Unterricht wird erwartet.",
    type: "info",
    infoText: "Wird durch die Schulleitung beurteilt.",
  },
  {
    key: "vebsSeminarCompleted",
    title: "VEBS-Grundlagenseminar",
    description: "Die Teilnahme am VEBS-Grundlagenseminar ist Voraussetzung für die Verbeamtung.",
    type: "checkbox-date",
    checkboxLabel: "Ich habe am VEBS-Grundlagenseminar teilgenommen",
    placeholder: "Datum der Teilnahme",
  },
  {
    key: "statusErfueller",
    title: "Status Erfueller",
    description: "Sie benoetigen das 2. Staatsexamen mit 2 Faechern (Status: Erfueller).",
    type: "checkbox",
    checkboxLabel: "Ich besitze das 2. Staatsexamen mit 2 Faechern",
  },
  {
    key: "subjectCombination",
    title: "Notwendige Faecherkombination",
    description: "Ihre Faecherkombination muss den schulischen Bedarf decken.",
    type: "text",
    placeholder: "Meine Faecher: z.B. Deutsch, Mathematik",
    validate: (v) => typeof v === "string" && v.trim().length > 0,
  },
  {
    key: "foerdervereinMember",
    title: "Foerderverein-Mitgliedschaft",
    description: "Die Mitgliedschaft im Foerderverein der FES Minden ist erforderlich.",
    type: "checkbox",
    checkboxLabel: "Ich bin Mitglied im Foerderverein der FES Minden",
  },
  {
    key: "empfehlungSchulleitung",
    title: "Empfehlung Schulleitung",
    description: "Die Schulleitung muss eine Empfehlung für Ihre Verbeamtung aussprechen.",
    type: "info",
    infoText: "Wird von der Schulleitung erteilt.",
  },
  {
    key: "amtsaerztlicheUntersuchung",
    title: "Amtsaerztliche Gesundheitsuntersuchung",
    description: "Die amtsaerztliche Gesundheitsuntersuchung ist der letzte Schritt vor der Verbeamtung.",
    type: "info",
    infoText: "Wird nach positiver Beiratsentscheidung veranlasst.",
  },
];

/** Kriterien, die die LK selbst pruefen kann */
const SELF_CHECKABLE_KEYS = new Set(
  CRITERIA.filter((c) => c.type !== "info").map((c) => c.key)
);

/** Debounce-Timeout für Auto-Save in ms */
const SAVE_DEBOUNCE_MS = 1200;

// =============================================
// Props
// =============================================

interface ApplicationFormProps {
  token: string;
  initialData: ApplicationData;
}

// =============================================
// Hilfsfunktionen
// =============================================

/** Statusfarbe für ein Kriterium */
function getStatusIndicator(
  criterion: CriterionDefinition,
  values: Record<string, unknown>
): "fulfilled" | "missing" | "pending" {
  // Info-Kriterien sind immer "pending" (werden durch andere geprueft)
  if (criterion.type === "info") return "pending";

  const val = values[criterion.key];

  switch (criterion.type) {
    case "checkbox":
      return val === true ? "fulfilled" : "missing";
    case "number":
      return typeof val === "number" && val >= (criterion.min ?? 75) ? "fulfilled" : "missing";
    case "text":
      return typeof val === "string" && val.trim().length > 0 ? "fulfilled" : "missing";
    case "checkbox-textarea": {
      const checked = val === true;
      // Textarea-Value liegt unter dem Key + "Detail"
      const detail = values[criterion.key + "Detail"];
      const hasDetail = typeof detail === "string" && detail.trim().length > 0;
      return checked && hasDetail ? "fulfilled" : "missing";
    }
    case "checkbox-date": {
      const checked = val === true;
      const dateVal = values[criterion.key + "Date"];
      const hasDate = typeof dateVal === "string" && dateVal.trim().length > 0;
      return checked && hasDate ? "fulfilled" : "missing";
    }
    default:
      return "missing";
  }
}

// =============================================
// Komponente
// =============================================

export function ApplicationForm({ token, initialData }: ApplicationFormProps) {
  // Initiale Werte aus gespeicherten Daten oder leeres Objekt
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const saved = initialData.applicationData?.prerequisites;
    if (saved && typeof saved === "object") return { ...saved };
    // Auch aus process.prerequisites laden (falls schon mal gespeichert)
    if (initialData.prerequisites && typeof initialData.prerequisites === "object") {
      return { ...initialData.prerequisites };
    }
    return {};
  });

  const [employeeStatement, setEmployeeStatement] = useState(
    initialData.applicationData?.employeeStatement || ""
  );

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingCriteria, setMissingCriteria] = useState<string[]>([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // =============================================
  // Berechnungen
  // =============================================

  const criteriaStatus = useMemo(() => {
    const statuses: Record<string, "fulfilled" | "missing" | "pending"> = {};
    for (const c of CRITERIA) {
      statuses[c.key] = getStatusIndicator(c, values);
    }
    return statuses;
  }, [values]);

  const fulfilledCount = useMemo(
    () => Object.values(criteriaStatus).filter((s) => s === "fulfilled").length,
    [criteriaStatus]
  );

  const pendingCount = useMemo(
    () => Object.values(criteriaStatus).filter((s) => s === "pending").length,
    [criteriaStatus]
  );

  const selfCheckableCount = CRITERIA.filter((c) => c.type !== "info").length;

  const selfCheckableFulfilled = useMemo(
    () =>
      CRITERIA.filter((c) => c.type !== "info" && criteriaStatus[c.key] === "fulfilled").length,
    [criteriaStatus]
  );

  const canSubmit = selfCheckableFulfilled === selfCheckableCount;

  const progressPercent = useMemo(() => {
    return Math.round((fulfilledCount / 12) * 100);
  }, [fulfilledCount]);

  // =============================================
  // Auto-Save
  // =============================================

  const doSave = useCallback(
    async (currentValues: Record<string, unknown>, currentStatement: string) => {
      setSaving(true);
      setErrorMessage(null);
      try {
        // Fuer die API aufbereiten: flache Werte + Detail/Date-Felder in prerequisites zusammenfuehren
        const prerequisites: Record<string, unknown> = {};
        for (const c of CRITERIA) {
          if (c.type === "info") continue;
          const val = currentValues[c.key];
          prerequisites[c.key] = val;

          if (c.type === "checkbox-textarea") {
            prerequisites[c.key + "Detail"] = currentValues[c.key + "Detail"] || "";
          }
          if (c.type === "checkbox-date") {
            prerequisites[c.key + "Date"] = currentValues[c.key + "Date"] || "";
          }
        }

        const res = await fetch(`/api/civil-service-application/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prerequisites,
            employeeStatement: currentStatement || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || "Speichern fehlgeschlagen");
        }

        setLastSaved(new Date());
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  const scheduleSave = useCallback(
    (newValues: Record<string, unknown>, newStatement: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        doSave(newValues, newStatement);
      }, SAVE_DEBOUNCE_MS);
    },
    [doSave]
  );

  // =============================================
  // Event Handlers
  // =============================================

  const updateValue = useCallback(
    (key: string, value: unknown) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        scheduleSave(next, employeeStatement);
        return next;
      });
      // Fehlermeldung zuruecksetzen wenn Kriterium korrigiert wird
      setMissingCriteria((prev) => prev.filter((k) => k !== key));
    },
    [scheduleSave, employeeStatement]
  );

  const handleStatementChange = useCallback(
    (value: string) => {
      setEmployeeStatement(value);
      scheduleSave(values, value);
    },
    [scheduleSave, values]
  );

  // =============================================
  // Einreichen
  // =============================================

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);
    setMissingCriteria([]);

    try {
      // Erst einmal explizit speichern
      await doSave(values, employeeStatement);

      // Dann einreichen
      const res = await fetch(`/api/civil-service-application/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.missingCriteria) {
          setMissingCriteria(result.missingCriteria);
        }
        throw new Error(result.error || "Einreichen fehlgeschlagen");
      }

      setSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Einreichen fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, doSave, values, employeeStatement, token]);

  // =============================================
  // Erfolgsanzeige
  // =============================================

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
              <svg
                className="h-10 w-10 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-foreground">
              Antrag erfolgreich eingereicht
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Ihr Antrag auf Uebernahme ins Planstelleninhaberverhaeltnis wurde
              erfolgreich eingereicht. Die Schulleitung und der Beirat werden
              über Ihren Antrag informiert.
            </p>
            <div className="mt-6 rounded-lg bg-muted/50 p-4 text-left">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Naechste Schritte
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="shrink-0 text-blue-500">1.</span>
                  Die Schulleitung prueft Ihre Angaben und erstellt eine Beurteilung
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 text-blue-500">2.</span>
                  Der Beirat entscheidet über Ihren Antrag
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 text-blue-500">3.</span>
                  Bei positiver Entscheidung folgt die amtsaerztliche Untersuchung
                </li>
              </ul>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Sie koennen dieses Fenster jetzt schliessen.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  // =============================================
  // Formular
  // =============================================

  return (
    <div className="min-h-screen bg-muted">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={140}
              height={45}
              priority
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {saving && (
                <span className="flex items-center gap-1.5">
                  <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                  Speichern...
                </span>
              )}
              {!saving && lastSaved && (
                <span className="flex items-center gap-1.5 text-green-600">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Gespeichert
                </span>
              )}
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>{fulfilledCount} von 12 Voraussetzungen erfuellt</span>
              <span>{pendingCount} werden spaeter geprueft</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
        <CredoLinie height={2} />
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-6 pb-32">
        {/* Begrüßung */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-foreground leading-tight">
            Antrag auf Uebernahme ins Planstelleninhaberverhaeltnis
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {initialData.employeeName} &middot; {initialData.organizationName}
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Bitte pruefen Sie die folgenden 12 Voraussetzungen. Einige Kriterien
            koennen Sie selbst bestaetigten, andere werden durch die Schulleitung
            oder den Amtsarzt geprueft. Ihre Angaben werden automatisch gespeichert.
          </p>
        </div>

        {/* Fehlermeldung */}
        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">{errorMessage}</p>
          </div>
        )}

        {/* Kriterien-Karten */}
        <div className="space-y-4">
          {CRITERIA.map((criterion, index) => {
            const status = criteriaStatus[criterion.key];
            const isMissing = missingCriteria.includes(criterion.key);

            return (
              <div
                key={criterion.key}
                className={`overflow-hidden rounded-xl border bg-card shadow-sm transition-all ${
                  isMissing
                    ? "border-red-300 ring-1 ring-red-200"
                    : status === "fulfilled"
                    ? "border-green-200"
                    : status === "pending"
                    ? "border-border"
                    : "border-border"
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start gap-3 p-4">
                  {/* Nummer */}
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      status === "fulfilled"
                        ? "bg-green-100 text-green-700"
                        : status === "pending"
                        ? "bg-blue-50 text-blue-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {status === "fulfilled" ? (
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>

                  {/* Inhalt */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {criterion.title}
                      </h3>
                      {/* Status Badge */}
                      {status === "fulfilled" && (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                          erfuellt
                        </span>
                      )}
                      {status === "pending" && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                          wird geprueft
                        </span>
                      )}
                      {status === "missing" && SELF_CHECKABLE_KEYS.has(criterion.key) && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          offen
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {criterion.description}
                    </p>
                  </div>
                </div>

                {/* Card Body: Interactive Element */}
                <div className="border-t border-border/50 bg-muted/30 px-4 py-3">
                  {criterion.type === "info" && (
                    <div className="flex items-center gap-2 text-xs text-blue-600">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {criterion.infoText}
                    </div>
                  )}

                  {criterion.type === "checkbox" && (
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={values[criterion.key] === true}
                        onChange={(e) => updateValue(criterion.key, e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 focus:ring-offset-0 transition-colors"
                        autoComplete="off"
                      />
                      <span className="text-sm text-foreground">{criterion.checkboxLabel}</span>
                    </label>
                  )}

                  {criterion.type === "number" && (
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-foreground shrink-0">
                        Stellenumfang:
                      </label>
                      <div className="relative w-32">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={typeof values[criterion.key] === "number" ? (values[criterion.key] as number) : ""}
                          onChange={(e) => {
                            const num = e.target.value === "" ? undefined : Number(e.target.value);
                            updateValue(criterion.key, num);
                          }}
                          placeholder={criterion.placeholder}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          autoComplete="off"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                      {typeof values[criterion.key] === "number" && (values[criterion.key] as number) < 75 && (
                        <span className="text-xs text-red-500">Mindestens 75% erforderlich</span>
                      )}
                    </div>
                  )}

                  {criterion.type === "checkbox-textarea" && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={values[criterion.key] === true}
                          onChange={(e) => updateValue(criterion.key, e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 focus:ring-offset-0 transition-colors"
                          autoComplete="off"
                        />
                        <span className="text-sm text-foreground">{criterion.checkboxLabel}</span>
                      </label>
                      {values[criterion.key] === true && (
                        <textarea
                          value={(values[criterion.key + "Detail"] as string) || ""}
                          onChange={(e) => updateValue(criterion.key + "Detail", e.target.value)}
                          placeholder={criterion.placeholder}
                          rows={2}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                          autoComplete="off"
                        />
                      )}
                    </div>
                  )}

                  {criterion.type === "checkbox-date" && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={values[criterion.key] === true}
                          onChange={(e) => updateValue(criterion.key, e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 focus:ring-offset-0 transition-colors"
                          autoComplete="off"
                        />
                        <span className="text-sm text-foreground">{criterion.checkboxLabel}</span>
                      </label>
                      {values[criterion.key] === true && (
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-muted-foreground shrink-0">Datum:</label>
                          <input
                            type="date"
                            value={(values[criterion.key + "Date"] as string) || ""}
                            onChange={(e) => updateValue(criterion.key + "Date", e.target.value)}
                            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            autoComplete="off"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {criterion.type === "text" && (
                    <input
                      type="text"
                      value={(values[criterion.key] as string) || ""}
                      onChange={(e) => updateValue(criterion.key, e.target.value)}
                      placeholder={criterion.placeholder}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      autoComplete="off"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Persönliche Erklärung (optional) */}
        <div className="mt-8 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">
            Persönliche Erklärung (optional)
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Hier koennen Sie eine persönliche Erklärung oder Anmerkungen zu Ihrem Antrag hinzufuegen.
          </p>
          <textarea
            value={employeeStatement}
            onChange={(e) => handleStatementChange(e.target.value)}
            placeholder="Ihre persönliche Erklärung..."
            rows={4}
            className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            autoComplete="off"
          />
        </div>
      </main>

      {/* Sticky Footer */}
      <footer className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Fortschritt */}
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selfCheckableFulfilled}/{selfCheckableCount}
              </span>{" "}
              Selbstpruefungen erfuellt
              {pendingCount > 0 && (
                <span className="ml-2 text-blue-500">
                  + {pendingCount} extern
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${
                canSubmit && !submitting
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Wird eingereicht...
                </span>
              ) : (
                "Antrag einreichen"
              )}
            </button>
          </div>
        </div>

        {/* DSGVO Footer */}
        <div className="border-t border-border/50 bg-muted/30 px-4 py-2">
          <p className="mx-auto max-w-2xl text-center text-[10px] text-muted-foreground leading-relaxed">
            Ihre Daten werden gemäß der DSGVO verarbeitet und ausschliesslich für
            den Verbeamtungsvorgang verwendet. Die Speicherung erfolgt verschluesselt
            auf Servern der CREDO-Gruppe.
          </p>
        </div>
      </footer>
    </div>
  );
}
