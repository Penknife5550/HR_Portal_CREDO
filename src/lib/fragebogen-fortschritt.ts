/**
 * Fortschritt eines Personalfragebogens serverseitig bestimmen.
 *
 * Der Fortschritt haengt an der Vorlage des Vorgangs: Ein Minijobber
 * durchlaeuft eine andere Strecke als eine TV-L-Angestellte. Die HR-Ansichten
 * kennen diese Konfiguration nicht, deshalb wird der Fortschritt hier berechnet
 * und fertig mitgeliefert, statt im Browser geraten zu werden.
 *
 * Massgeblich ist der `formTemplateSnapshot` des Vorgangs — die Kopie, die bei
 * der Anlage eingefroren wurde und die auch der Fragebogen selbst liest. Nur
 * wenn die fehlt (Altbestand), wird auf die aktuelle Vorlage zurueckgegriffen.
 */

import { prisma } from "@/lib/db";
import {
  describeProgress,
  type FragebogenFortschritt,
} from "@/lib/fragebogen-steps";
import type { StepFieldConfig } from "@/lib/field-definitions";

export type { FragebogenFortschritt };

/**
 * Die stepsConfig aller Formularvorlagen, nach Fragebogentyp.
 *
 * Einmal laden und wiederverwenden: Eine Dashboard-Liste mit 50 Vorgaengen
 * braucht sonst 50 Abfragen fuer hoechstens fuenf verschiedene Vorlagen.
 */
export async function ladeVorlagenKonfigurationen(): Promise<
  Map<string, StepFieldConfig[]>
> {
  const vorlagen = await prisma.formTemplate.findMany({
    select: { questionnaireType: true, stepsConfig: true },
  });

  const map = new Map<string, StepFieldConfig[]>();
  for (const v of vorlagen) {
    if (Array.isArray(v.stepsConfig)) {
      map.set(v.questionnaireType, v.stepsConfig as unknown as StepFieldConfig[]);
    }
  }
  return map;
}

interface VorgangMitFortschritt {
  questionnaireType: string;
  formTemplateSnapshot?: unknown;
  personalData?: { currentStep: number | null } | null;
}

/**
 * Fortschritt eines einzelnen Vorgangs.
 *
 * `vorlagen` stammt aus `ladeVorlagenKonfigurationen()` und dient nur als
 * Rueckfallebene fuer Vorgaenge ohne Snapshot.
 */
export function fortschrittFuerVorgang(
  vorgang: VorgangMitFortschritt,
  vorlagen: Map<string, StepFieldConfig[]>
): FragebogenFortschritt {
  const snapshot = Array.isArray(vorgang.formTemplateSnapshot)
    ? (vorgang.formTemplateSnapshot as unknown as StepFieldConfig[])
    : null;
  const config = snapshot ?? vorlagen.get(vorgang.questionnaireType) ?? null;

  return describeProgress(config, vorgang.personalData?.currentStep);
}
