"use client";

/**
 * Elternzeit-Antrag (vorlaeufig) — 5-Schritt-Formular
 *
 * Schritt 1: Persoenliche Daten / Adresse
 * Schritt 2: Kind & Betreuungsabsicht
 * Schritt 3: Elternzeit-Zeitraeume (1-3 Abschnitte)
 * Schritt 4: Teilzeit waehrend Elternzeit
 * Schritt 5: DSGVO + Abschluss
 *
 * Feriensperrfrist-Warnung: nicht-blockierend, Pflichtbegruendung nur Beamte/PSI.
 */

import { useState, useMemo } from "react";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";
import type { ElternzeitAntragData } from "./page";

interface AbschnittInput {
  abschnittNr: number;
  von: string;
  bis: string;
  uebertragung3bis8: boolean;
  teilzeit: boolean;
  teilzeitStunden: number | null;
  ferienBegruendung: string;
}

interface FormState {
  // Schritt 1
  adresseStrasse: string;
  adressePlz: string;
  adresseOrt: string;
  dienstbezeichnung: string;
  schulnummer: string;
  // Schritt 2
  betreuungsabsicht: string;
  gleichzeitigeEZ: boolean;
  // Schritt 3
  abschnitte: AbschnittInput[];
  // Schritt 5
  dsgvoEinwilligung: boolean;
}

const STEP_LABELS = [
  "Persoenliche Daten",
  "Kind & Betreuung",
  "Elternzeit-Zeitraeume",
  "Teilzeit",
  "Abschluss",
];

export function ElternzeitAntragForm({
  token,
  initialData,
}: {
  token: string;
  initialData: ElternzeitAntragData;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    adresseStrasse: "",
    adressePlz: "",
    adresseOrt: "",
    dienstbezeichnung: "",
    schulnummer: "",
    betreuungsabsicht: "",
    gleichzeitigeEZ: false,
    abschnitte: [
      {
        abschnittNr: 1,
        von: "",
        bis: "",
        uebertragung3bis8: false,
        teilzeit: false,
        teilzeitStunden: null,
        ferienBegruendung: "",
      },
    ],
    dsgvoEinwilligung: false,
  });

  // Feriensperrfrist-Check (lokal, fuer Vorschau-Warnung)
  const ferienWarnungen = useMemo(() => {
    const warnungen: { abschnittNr: number; bezeichnung: string; hinweis: string }[] =
      [];
    for (const a of form.abschnitte) {
      if (!a.von || !a.bis) continue;
      const von = new Date(a.von);
      const bis = new Date(a.bis);
      for (const f of initialData.schulferien) {
        const fVon = new Date(f.von);
        const fBis = new Date(f.bis);
        const wochen = f.ferienTyp === "SOMMER" ? 6 : 2;
        const sperrVon = new Date(fVon);
        sperrVon.setDate(sperrVon.getDate() - wochen * 7);
        const sperrBis = new Date(fBis);
        sperrBis.setDate(sperrBis.getDate() + wochen * 7);
        const inSperr =
          (von >= sperrVon && von <= sperrBis) ||
          (bis >= sperrVon && bis <= sperrBis);
        if (inSperr) {
          warnungen.push({
            abschnittNr: a.abschnittNr,
            bezeichnung: f.bezeichnung,
            hinweis: `Liegt in der Sperrzone der ${f.bezeichnung} (§ 11 FrUrlV NRW)`,
          });
        }
      }
    }
    return warnungen;
  }, [form.abschnitte, initialData.schulferien]);

  function updateAbschnitt(idx: number, patch: Partial<AbschnittInput>) {
    setForm((f) => ({
      ...f,
      abschnitte: f.abschnitte.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  }

  function addAbschnitt() {
    if (form.abschnitte.length >= 3) return;
    setForm((f) => ({
      ...f,
      abschnitte: [
        ...f.abschnitte,
        {
          abschnittNr: f.abschnitte.length + 1,
          von: "",
          bis: "",
          uebertragung3bis8: false,
          teilzeit: false,
          teilzeitStunden: null,
          ferienBegruendung: "",
        },
      ],
    }));
  }

  function removeAbschnitt(idx: number) {
    setForm((f) => ({
      ...f,
      abschnitte: f.abschnitte
        .filter((_, i) => i !== idx)
        .map((a, i) => ({ ...a, abschnittNr: i + 1 })),
    }));
  }

  function canProceed(): boolean {
    if (step === 1) {
      return !!(
        form.adresseStrasse &&
        form.adressePlz.match(/^\d{5}$/) &&
        form.adresseOrt &&
        form.dienstbezeichnung
      );
    }
    if (step === 2) {
      return form.betreuungsabsicht.trim().length >= 10;
    }
    if (step === 3) {
      return form.abschnitte.every(
        (a) => a.von && a.bis && new Date(a.bis) >= new Date(a.von),
      );
    }
    if (step === 4) {
      return form.abschnitte.every(
        (a) => !a.teilzeit || (a.teilzeitStunden && a.teilzeitStunden <= 32),
      );
    }
    if (step === 5) return form.dsgvoEinwilligung;
    return true;
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        adresseStrasse: form.adresseStrasse,
        adressePlz: form.adressePlz,
        adresseOrt: form.adresseOrt,
        dienstbezeichnung: form.dienstbezeichnung,
        schulnummer: form.schulnummer || null,
        betreuungsabsicht: form.betreuungsabsicht,
        gleichzeitigeEZ: form.gleichzeitigeEZ,
        abschnitte: form.abschnitte.map((a) => ({
          abschnittNr: a.abschnittNr,
          von: a.von,
          bis: a.bis,
          uebertragung3bis8: a.uebertragung3bis8,
          teilzeit: a.teilzeit,
          teilzeitStunden: a.teilzeit ? a.teilzeitStunden : null,
          ferienBegruendung: a.ferienBegruendung || null,
        })),
        dsgvoEinwilligung: form.dsgvoEinwilligung,
      };
      const res = await fetch(`/api/elternzeit-antrag/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || "Fehler beim Absenden.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
        <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
          <div className="p-8 text-center">
            <Image
              src="/credo_logo_claim.svg"
              alt="CREDO"
              width={200}
              height={65}
              className="mx-auto mb-6"
              priority
            />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-credo-gruen/10">
              <svg
                className="h-8 w-8 text-credo-gruen"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold">Antrag eingereicht</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Vielen Dank! Ihr vorlaeufiger Elternzeit-Antrag wurde an die
              Personalabteilung uebermittelt. Sie erhalten in Kuerze die
              vorlaeufige Genehmigung.
            </p>
          </div>
          <CredoLinie />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-xl bg-card shadow-lg">
          {/* Header */}
          <div className="border-b bg-card p-6">
            <div className="flex items-center justify-between">
              <Image
                src="/credo_logo_claim.svg"
                alt="CREDO"
                width={160}
                height={50}
                priority
              />
              <div className="text-right text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                  {initialData.displayId}
                </div>
                <div>{initialData.organizationName}</div>
              </div>
            </div>
            <h1 className="mt-4 text-xl font-bold">
              Antrag auf Elternzeit (vorlaeufig)
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {initialData.employeeName} —{" "}
              {initialData.geschlecht === "MUTTER" ? "Mutter" : "Vater"} —{" "}
              {initialData.kindNummer}. Kind
            </p>

            {/* Stepper */}
            <div className="mt-6 flex items-center gap-2">
              {STEP_LABELS.map((label, idx) => {
                const num = idx + 1;
                const active = step === num;
                const done = step > num;
                return (
                  <div key={label} className="flex flex-1 items-center gap-2">
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : done
                            ? "bg-credo-gruen text-white"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? "✓" : num}
                    </div>
                    {idx < STEP_LABELS.length - 1 && (
                      <div
                        className={`h-px flex-1 ${
                          done ? "bg-credo-gruen" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Schritt {step} von 5: {STEP_LABELS[step - 1]}
            </div>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Schritt 1 */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4 text-sm">
                  <div className="font-medium">{initialData.employeeName}</div>
                  {initialData.employeePersonalNr && (
                    <div className="text-xs text-muted-foreground">
                      Personalnummer: {initialData.employeePersonalNr}
                    </div>
                  )}
                </div>
                <FieldGrid>
                  <Field label="Strasse + Hausnummer *">
                    <input
                      type="text"
                      value={form.adresseStrasse}
                      onChange={(e) =>
                        setForm({ ...form, adresseStrasse: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="PLZ *">
                    <input
                      type="text"
                      value={form.adressePlz}
                      onChange={(e) =>
                        setForm({ ...form, adressePlz: e.target.value })
                      }
                      className={inputCls}
                      maxLength={5}
                    />
                  </Field>
                  <Field label="Ort *">
                    <input
                      type="text"
                      value={form.adresseOrt}
                      onChange={(e) =>
                        setForm({ ...form, adresseOrt: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Dienst-/Tarifbezeichnung *">
                    <input
                      type="text"
                      value={form.dienstbezeichnung}
                      onChange={(e) =>
                        setForm({ ...form, dienstbezeichnung: e.target.value })
                      }
                      placeholder="z.B. L EG 13 TV-L oder Studienraetin"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Schulnummer (optional)">
                    <input
                      type="text"
                      value={form.schulnummer}
                      onChange={(e) =>
                        setForm({ ...form, schulnummer: e.target.value })
                      }
                      className={inputCls}
                    />
                  </Field>
                </FieldGrid>
              </div>
            )}

            {/* Schritt 2 */}
            {step === 2 && (
              <div className="space-y-4">
                <Field label="Erklaerung zur Betreuungsabsicht *">
                  <textarea
                    value={form.betreuungsabsicht}
                    onChange={(e) =>
                      setForm({ ...form, betreuungsabsicht: e.target.value })
                    }
                    rows={4}
                    placeholder="Bitte erlaeutern Sie kurz, dass Sie Ihr Kind in dieser Zeit selbst betreuen werden."
                    className={inputCls + " resize-none"}
                  />
                </Field>
                <Field label="Nimmt der/die andere Elternteil gleichzeitig Elternzeit?">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={!form.gleichzeitigeEZ}
                        onChange={() =>
                          setForm({ ...form, gleichzeitigeEZ: false })
                        }
                      />
                      Nein
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={form.gleichzeitigeEZ}
                        onChange={() =>
                          setForm({ ...form, gleichzeitigeEZ: true })
                        }
                      />
                      Ja
                    </label>
                  </div>
                </Field>
              </div>
            )}

            {/* Schritt 3 */}
            {step === 3 && (
              <div className="space-y-6">
                {form.abschnitte.map((a, idx) => {
                  const warns = ferienWarnungen.filter(
                    (w) => w.abschnittNr === a.abschnittNr,
                  );
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">
                          Abschnitt {a.abschnittNr}
                        </h3>
                        {form.abschnitte.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAbschnitt(idx)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Entfernen
                          </button>
                        )}
                      </div>
                      <FieldGrid>
                        <Field label="Von *">
                          <input
                            type="date"
                            value={a.von}
                            onChange={(e) =>
                              updateAbschnitt(idx, { von: e.target.value })
                            }
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Bis *">
                          <input
                            type="date"
                            value={a.bis}
                            onChange={(e) =>
                              updateAbschnitt(idx, { bis: e.target.value })
                            }
                            className={inputCls}
                          />
                        </Field>
                      </FieldGrid>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={a.uebertragung3bis8}
                          onChange={(e) =>
                            updateAbschnitt(idx, {
                              uebertragung3bis8: e.target.checked,
                            })
                          }
                        />
                        Uebertragung auf 3.–8. Lebensjahr (AG-Zustimmung
                        erforderlich)
                      </label>

                      {warns.length > 0 && (
                        <div className="rounded-md border border-credo-gelb bg-credo-gelb/10 p-3 text-xs">
                          <div className="font-medium text-foreground">
                            ⚠ Feriensperrfrist-Hinweis
                          </div>
                          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                            {warns.map((w, i) => (
                              <li key={i}>{w.hinweis}</li>
                            ))}
                          </ul>
                          {initialData.ferienBegruendungPflicht && (
                            <div className="mt-2">
                              <textarea
                                value={a.ferienBegruendung}
                                onChange={(e) =>
                                  updateAbschnitt(idx, {
                                    ferienBegruendung: e.target.value,
                                  })
                                }
                                placeholder="Pflicht (Beamte/PSI): sachgerechte Begruendung gem. § 11 FrUrlV NRW"
                                rows={2}
                                className={inputCls + " resize-none"}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {form.abschnitte.length < 3 && (
                  <button
                    type="button"
                    onClick={addAbschnitt}
                    className="w-full rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    + Weiteren Abschnitt hinzufuegen (max. 3)
                  </button>
                )}
              </div>
            )}

            {/* Schritt 4 */}
            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Sie koennen waehrend der Elternzeit in Teilzeit arbeiten
                  (max. 32 Stunden/Woche, § 15 Abs. 7 BEEG). Bei Wunsch nach
                  Teilzeit ist ein separater Antrag erforderlich.
                </p>
                {form.abschnitte.map((a, idx) => (
                  <div key={idx} className="rounded-lg border p-4 space-y-3">
                    <div className="font-medium">Abschnitt {a.abschnittNr}</div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={a.teilzeit}
                        onChange={(e) =>
                          updateAbschnitt(idx, {
                            teilzeit: e.target.checked,
                            teilzeitStunden: e.target.checked
                              ? a.teilzeitStunden
                              : null,
                          })
                        }
                      />
                      Teilzeit waehrend dieses Abschnitts gewuenscht
                    </label>
                    {a.teilzeit && (
                      <Field label="Stunden/Woche (max. 32) *">
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          max={32}
                          value={a.teilzeitStunden ?? ""}
                          onChange={(e) =>
                            updateAbschnitt(idx, {
                              teilzeitStunden: e.target.value
                                ? parseFloat(e.target.value)
                                : null,
                            })
                          }
                          className={inputCls}
                        />
                      </Field>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Schritt 5 */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-2">
                  <div className="font-medium">Zusammenfassung</div>
                  <div className="text-xs text-muted-foreground">
                    {form.abschnitte.length} Abschnitt(e),{" "}
                    {form.abschnitte.filter((a) => a.teilzeit).length} mit
                    Teilzeit
                  </div>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.dsgvoEinwilligung}
                    onChange={(e) =>
                      setForm({ ...form, dsgvoEinwilligung: e.target.checked })
                    }
                    className="mt-1"
                  />
                  <span className="text-muted-foreground">
                    Ich willige in die Verarbeitung meiner personenbezogenen
                    Daten gemaess DSGVO durch die CREDO-Schultraegergruppe zur
                    Bearbeitung meines Elternzeit-Antrags ein. Die Daten werden
                    ausschliesslich fuer den genannten Zweck verwendet und nach
                    Ablauf der gesetzlichen Aufbewahrungsfristen geloescht.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t p-4">
            <button
              type="button"
              disabled={step === 1 || submitting}
              onClick={() => setStep(step - 1)}
              className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Zurueck
            </button>
            {step < 5 ? (
              <button
                type="button"
                disabled={!canProceed()}
                onClick={() => setStep(step + 1)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Weiter
              </button>
            ) : (
              <button
                type="button"
                disabled={!canProceed() || submitting}
                onClick={handleSubmit}
                className="rounded-lg bg-credo-gruen px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Wird gesendet..." : "Antrag absenden"}
              </button>
            )}
          </div>
          <CredoLinie />
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
