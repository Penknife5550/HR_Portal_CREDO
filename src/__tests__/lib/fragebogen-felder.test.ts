/**
 * Regressionsschutz fuer die Freigabeliste des Auto-Save.
 *
 * Anlass: Beim Bau des Status-Schritts (AP 6) wurde die Liste uebersehen. Die
 * Angaben kamen fehlerfrei durch die Validierung, der Server antwortete mit
 * 200 — und schrieb sie stillschweigend nicht in die Datenbank. Kein Fehler,
 * keine Meldung, nur fehlende Daten in der Akte.
 *
 * Dieser Test haelt die Liste gegen die Schritt-Schemata: Jedes Feld, das ein
 * Schritt sendet, muss auch gespeichert werden duerfen.
 */

import {
  ERLAUBTE_FRAGEBOGEN_FELDER,
  LEERBARE_FRAGEBOGEN_FELDER,
} from "@/lib/fragebogen-felder";
import {
  createStep1Schema,
  createStep3Schema,
  createStep4Schema,
  createStep5Schema,
  createStep6Schema,
  createStep8Schema,
  step2Schema,
  step9Schema,
} from "@/lib/validations/personal-data";
import { FieldConfigHelper } from "@/lib/field-definitions";
import { FIELD_REGISTRY } from "@/lib/field-definitions";
import type { ZodTypeAny } from "zod";

/** Die Feldnamen eines Schemas — auch durch superRefine hindurch. */
function feldNamen(schema: ZodTypeAny): string[] {
  // Ein `.superRefine()` verpackt das Objekt in ZodEffects; der Kern liegt
  // darunter.
  let kern: ZodTypeAny = schema;
  while (
    kern &&
    typeof kern === "object" &&
    "_def" in kern &&
    (kern._def as { schema?: ZodTypeAny }).schema
  ) {
    kern = (kern._def as { schema: ZodTypeAny }).schema;
  }
  const shape = (kern._def as { shape?: () => Record<string, unknown> }).shape;
  return shape ? Object.keys(shape()) : [];
}

const SCHRITTE: Array<{ nummer: number; felder: string[] }> = [
  { nummer: 1, felder: feldNamen(createStep1Schema(new FieldConfigHelper(1))) },
  // Schritt 2 hat keine Schema-Factory — der Pflicht-Schalter der Vorlage
  // wirkt dort bis heute nicht (bekannte Luecke, siehe Plandokument
  // Abschnitt 3). Geprueft wird deshalb das statische Schema.
  { nummer: 2, felder: feldNamen(step2Schema) },
  { nummer: 3, felder: feldNamen(createStep3Schema(new FieldConfigHelper(3))) },
  { nummer: 4, felder: feldNamen(createStep4Schema(new FieldConfigHelper(4))) },
  { nummer: 5, felder: feldNamen(createStep5Schema(new FieldConfigHelper(5))) },
  { nummer: 6, felder: feldNamen(createStep6Schema(new FieldConfigHelper(6))) },
  { nummer: 8, felder: feldNamen(createStep8Schema(new FieldConfigHelper(8))) },
  { nummer: 9, felder: feldNamen(step9Schema) },
];

describe("Freigabeliste des Auto-Save", () => {
  it("liest die Feldnamen der Schemata überhaupt aus", () => {
    // Wenn diese Zusicherung faellt, greift die Pruefung unten ins Leere und
    // meldet faelschlich Erfolg.
    for (const schritt of SCHRITTE) {
      expect(schritt.felder.length).toBeGreaterThan(0);
    }
  });

  it.each(SCHRITTE)(
    "gibt jedes Feld aus Schritt $nummer zum Speichern frei",
    ({ felder }) => {
      const fehlend = felder.filter((f) => !ERLAUBTE_FRAGEBOGEN_FELDER.has(f));
      expect(fehlend).toEqual([]);
    }
  );

  it("gibt jedes konfigurierbare Feld der Registry frei", () => {
    // Ein Feld, das im Vorlagen-Editor schaltbar ist, aber nicht gespeichert
    // werden darf, wäre eine stille Sackgasse.
    const ausserhalb: string[] = [];
    for (const [schritt, definitionen] of Object.entries(FIELD_REGISTRY)) {
      for (const def of definitionen) {
        // "children" ist eine eigene Tabelle und läuft nicht über die Liste.
        if (def.name === "children") continue;
        if (!ERLAUBTE_FRAGEBOGEN_FELDER.has(def.name)) {
          ausserhalb.push(`Schritt ${schritt}: ${def.name}`);
        }
      }
    }
    expect(ausserhalb).toEqual([]);
  });

  it("führt nur freigegebene Felder als leerbar", () => {
    for (const feld of LEERBARE_FRAGEBOGEN_FELDER) {
      expect(ERLAUBTE_FRAGEBOGEN_FELDER.has(feld)).toBe(true);
    }
  });

  it("erlaubt das Leeren nur bei Bedingungsfragen", () => {
    // Absichtlich eng gehalten: Der Grundsatz lautet "niemals mit null
    // überschreiben". Jede Ausnahme muss begründet sein.
    expect([...LEERBARE_FRAGEBOGEN_FELDER].sort()).toEqual([
      "agenturFuerArbeit",
      "beschaeftigungsStatusSonstige",
      "mitLeistungsbezug",
      "summeUeberGeringfuegigkeitsgrenze",
    ]);
  });

  it("lässt keine sensiblen Felder heimlich leeren", () => {
    // IBAN, SV-Nummer und Steuer-ID dürfen nie durch einen Teil-Speichervorgang
    // verschwinden.
    for (const feld of ["iban", "socialSecurityNumber", "taxId"]) {
      expect(LEERBARE_FRAGEBOGEN_FELDER.has(feld)).toBe(false);
    }
  });

  it("nimmt keine Felder auf, die es im Modell nicht gibt", () => {
    // Grobe Gegenprobe: Die Liste soll nicht wachsen, ohne dass jemand
    // hinschaut. Prisma-Feldnamen sind camelCase ohne Sonderzeichen.
    for (const feld of ERLAUBTE_FRAGEBOGEN_FELDER) {
      expect(feld).toMatch(/^[a-z][A-Za-z0-9]*$/);
    }
  });

  it("lässt den Beschäftigten die Arbeitgeberangaben nicht setzen", () => {
    // Die Felder aus AP 12 stehen zwar in PersonalData, sind aber
    // Feststellungen des ARBEITGEBERS. Stünden sie in der Freigabeliste,
    // könnte der Beschäftigte sein eigenes Eingangsdatum setzen — und damit
    // das Wirkungsdatum und seine Beitragspflicht verschieben. Das ist der
    // Grund, warum diese Zeile hier steht und nicht wegoptimiert werden darf.
    for (const feld of [
      "rvAntragEingangAm",
      "rvWirkungAb",
      "rvMeldungAm",
      "rvBearbeitetVonId",
      "rvBearbeitetAm",
    ]) {
      expect(ERLAUBTE_FRAGEBOGEN_FELDER.has(feld)).toBe(false);
      expect(LEERBARE_FRAGEBOGEN_FELDER.has(feld)).toBe(false);
    }
  });

  it("lässt die selbst getroffene Rentenentscheidung dagegen zu", () => {
    // Gegenprobe: Die Entscheidung selbst trifft der Beschäftigte — sie muss
    // schreibbar bleiben, sonst speichert Schritt 11 stillschweigend nichts.
    for (const feld of [
      "rvEntscheidung",
      "rvMerkblattGelesen",
      "rvBindungBestaetigt",
    ]) {
      expect(ERLAUBTE_FRAGEBOGEN_FELDER.has(feld)).toBe(true);
    }
  });
});
