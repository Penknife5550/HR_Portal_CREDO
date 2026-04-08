/**
 * Step 4 — Nachbesprechung & Beurteilungsgespräch
 *
 * Datum + Notizen für beide Gespräche. Beurteilungsgespräch ist Pflicht.
 *
 * Rechtsgrundlagen:
 * - BRL Nr. 9.1 — Nachbesprechung in der Probezeit (zeitnah)
 * - BRL Nr. 10.1 — Beurteilungsgespräch zwingend vor Abfassung
 */

import { LegalBox } from "./legal-box";
import type { StepProps } from "./types";

export function Step4Gespraech({
  formState,
  setFormState,
  onChange,
}: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Schritt 4 — Nachbesprechung & Beurteilungsgespräch
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dokumentieren Sie die Gespräche mit der Lehrkraft. Das
          Beurteilungsgespräch ist zwingend vor Abfassung der Beurteilung zu
          führen.
        </p>
      </div>

      <LegalBox references={["BRL_9_1", "BRL_10_1"]} />

      {/* Nachbesprechung */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Nachbesprechung des Unterrichtsbesuchs
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Bei Probezeit-Beurteilungen ist die Nachbesprechung zeitnah zu
            führen (BRL Nr. 9.1). Optional, aber dringend empfohlen.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Datum der Nachbesprechung
          </label>
          <input
            type="datetime-local"
            value={formState.postReviewAt}
            onChange={(e) => {
              setFormState((p) => ({ ...p, postReviewAt: e.target.value }));
              onChange();
            }}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Inhalt / Stärken / Entwicklungsfelder
          </label>
          <textarea
            value={formState.postReviewNotes}
            onChange={(e) => {
              setFormState((p) => ({
                ...p,
                postReviewNotes: e.target.value,
              }));
              onChange();
            }}
            rows={4}
            placeholder="Welche Stärken wurden besprochen, welche Entwicklungsfelder wurden vereinbart?"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
          />
        </div>
      </div>

      {/* Beurteilungsgespräch */}
      <div className="rounded-xl border-2 border-credo-gelb/40 bg-credo-gelb/5 p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Beurteilungsgespräch *
          </h3>
          <p className="mt-1 text-xs text-foreground">
            <strong>Pflichtfeld:</strong> Vor Abfassung der Beurteilung ist
            zwingend ein Beurteilungsgespräch mit der Lehrkraft zu führen
            (BRL Nr. 10.1). Auf Wunsch kann eine Vertrauenslehrkraft anwesend
            sein.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Datum des Beurteilungsgesprächs *
          </label>
          <input
            type="datetime-local"
            value={formState.beurteilungsgespraechAt}
            onChange={(e) => {
              setFormState((p) => ({
                ...p,
                beurteilungsgespraechAt: e.target.value,
              }));
              onChange();
            }}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Vergleich Selbsteinschätzung ↔ Fremdeinschätzung
          </label>
          <textarea
            value={formState.beurteilungsgespraechNotes}
            onChange={(e) => {
              setFormState((p) => ({
                ...p,
                beurteilungsgespraechNotes: e.target.value,
              }));
              onChange();
            }}
            rows={5}
            placeholder="Wie hat sich die Lehrkraft selbst eingeschätzt? Wo gab es Übereinstimmungen, wo Unterschiede? Welche konkreten Vereinbarungen wurden getroffen?"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
          />
        </div>
      </div>
    </div>
  );
}
