/**
 * Step 1 — Vorbereitung
 *
 * Termin, Klasse, Fach, Vertrauenslehrkraft, Befangenheits-Erklärung.
 *
 * Rechtsgrundlagen:
 * - BRL Nr. 8.3 — Ankündigungsfrist + Vertrauenslehrkraft
 * - BRL Nr. 4.10 — Befangenheit
 */

import { LegalBox } from "./legal-box";
import type { StepProps } from "./types";

export function Step1Vorbereitung({
  initialData,
  formState,
  setFormState,
  onChange,
}: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Schritt 1 — Vorbereitung
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tragen Sie die Eckdaten zum Unterrichtsbesuch ein und bestätigen Sie,
          dass keine Befangenheit vorliegt.
        </p>
      </div>

      <LegalBox
        references={["BRL_8_3", "BRL_4_10"]}
        intro="Diese Vorbereitung ist Pflichtbestandteil jeder dienstlichen Beurteilung an Ersatzschulen NRW."
      />

      {/* Mitarbeiter-Info */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Beurteilte Lehrkraft
        </p>
        <p className="text-base font-semibold text-foreground">
          {initialData.employee.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {initialData.employee.organizationName}
        </p>
      </div>

      {/* Termin */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Termin Unterrichtsbesuch
          {initialData.scheduledDate && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (von HR vorgeschlagen — anpassbar)
            </span>
          )}
        </label>
        <input
          type="datetime-local"
          value={formState.scheduledDate}
          onChange={(e) => {
            setFormState((p) => ({ ...p, scheduledDate: e.target.value }));
            onChange();
          }}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
        />
      </div>

      {/* Fach + Klasse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Fach
          </label>
          <input
            type="text"
            value={formState.fach}
            onChange={(e) => {
              setFormState((p) => ({ ...p, fach: e.target.value }));
              onChange();
            }}
            placeholder="z.B. Mathematik"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Klasse / Lerngruppe
          </label>
          <input
            type="text"
            value={formState.klasse}
            onChange={(e) => {
              setFormState((p) => ({ ...p, klasse: e.target.value }));
              onChange();
            }}
            placeholder="z.B. 7b"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Vertrauenslehrkraft */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Vertrauenslehrkraft (optional)
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Auf Wunsch der zu beurteilenden Person darf eine Lehrkraft des
          Vertrauens beim Unterrichtsbesuch und beim Beurteilungsgespräch
          anwesend sein und Stellung nehmen (BRL Nr. 8.3).
        </p>
        <input
          type="text"
          value={formState.vertrauenslehrkraft}
          onChange={(e) => {
            setFormState((p) => ({
              ...p,
              vertrauenslehrkraft: e.target.value,
            }));
            onChange();
          }}
          placeholder="Name der Vertrauenslehrkraft"
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
          autoComplete="off"
        />
      </div>

      {/* Befangenheits-Erklärung */}
      <div className="rounded-xl border border-credo-gelb/30 bg-credo-gelb/5 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.unbiasedConfirmed}
            onChange={(e) => {
              setFormState((p) => ({
                ...p,
                unbiasedConfirmed: e.target.checked,
              }));
              onChange();
            }}
            className="mt-0.5 h-5 w-5 rounded border-input"
          />
          <span className="text-sm text-foreground">
            <strong>Befangenheits-Erklärung (Pflichtfeld):</strong> Ich
            bestätige hiermit, dass keine Gründe für eine Befangenheit gegenüber
            der zu beurteilenden Lehrkraft vorliegen. Mir ist keine persönliche,
            verwandtschaftliche oder wirtschaftliche Beziehung bekannt, die
            meine Objektivität beeinträchtigen könnte (BRL Nr. 4.10).
          </span>
        </label>
      </div>
    </div>
  );
}
