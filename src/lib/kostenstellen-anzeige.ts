/**
 * Die Kostenstellen-Aufteilung fuer alle LESENDEN Wege: HR-Vorgangsansicht,
 * LOGA-CSV und Personalakte-PDF.
 *
 * ============================================================================
 * WARUM ES DIESE DATEI GIBT
 * ============================================================================
 *
 * Seit KOSTENSTELLEN_AUFTEILUNG_V1 liegt die Aufteilung in
 * `supervisor_kostenstellen` — eine Zeile je Kostenstelle. Die beiden
 * Alt-Spalten `SupervisorData.kostenstelle` und `kostenstelleAnteil` bleiben in
 * DIESEM Release nur noch als Lesequelle stehen (Begruendung im Schema, siehe
 * prisma/schema.prisma, Abschnitt "Kostenstellen"); die Maske befuellt sie
 * nicht mehr.
 *
 * Wer weiter allein die Alt-Spalte liest, bekommt zwei Zustaende, und beide
 * sind falsch:
 *
 *  1. NEUER Vorgang. Die Alt-Spalte ist NULL. Die Vorgangsansicht zeigt einen
 *     Gedankenstrich, die LOGA-CSV eine leere Zelle — die gepflegte Aufteilung
 *     ist nirgends zu sehen, und niemand ahnt, dass es sie gibt.
 *  2. MIGRIERTER Bestandsvorgang, danach geaendert. Die Alt-Spalte steht
 *     eingefroren auf dem alten Wert. Die Lohnbuchhaltung bucht dann 100
 *     Prozent auf eine Kostenstelle, die im Portal seit Wochen ersetzt ist.
 *     Das ist der gefaehrlichere der beiden Zustaende: Die Anzeige ist
 *     gefuellt, also gibt es keinen Anlass zu zweifeln.
 *
 * Deshalb steht die Rueckfall-Regel genau EINMAL hier statt dreimal in den
 * Lesern. Sie ist dieselbe wie in `mitKostenstellenRueckfall`
 * (src/app/modalitaeten/[token]/page.tsx) und in der Datenmigration
 * (prisma/seed-check.js): Zeilen schlagen die Alt-Spalte; fehlt der Anteil der
 * einen alten Kostenstelle, traegt sie alles, also 100 Prozent; ein
 * hinterlegter Anteil wird UNVERAENDERT uebernommen, auch wenn er nicht 100
 * ergibt — die Zahl stammt von einem Menschen, und eine stillschweigend
 * geglaettete Luecke faellt niemandem mehr auf.
 *
 * ============================================================================
 * WARUM `kostenstellen` IM EINGABETYP PFLICHT IST
 * ============================================================================
 *
 * Genau der Fehler, den diese Datei behebt, kaeme sonst durch die Hintertuer
 * zurueck: Ein Leser, der das Prisma-`include` vergisst, uebergaebe ein Objekt
 * ohne `kostenstellen`, der Rueckfall griffe still, und die Anzeige stuende
 * wieder auf dem eingefrorenen Altwert — ohne dass irgendetwas rot wird. Als
 * Pflichtfeld weist der Compiler das ab: `supervisorData` ohne
 * `include: { kostenstellen: ... }` hat die Eigenschaft schlicht nicht.
 */

import {
  VOLLE_HUNDERT_HUNDERTSTEL,
  hundertstel,
  prozentText,
  summeHundertstel,
} from "@/lib/validations/kostenstellen";

/** Eine Zeile der Aufteilung, so wie sie angezeigt wird. */
export interface KostenstellenZeile {
  bezeichnung: string;
  anteil: number;
}

/**
 * Was ein Leser mitbringen muss. Bewusst strukturell und nicht der
 * Prisma-Typ: Das PDF bekommt seine Daten ueber einen eigenen Export-Kontext,
 * die HR-Ansicht ueber JSON aus der API.
 */
export interface KostenstellenQuelle {
  kostenstelle: string | null;
  kostenstelleAnteil: number | null;
  kostenstellenBemerkung: string | null;
  kostenstellen: readonly KostenstellenZeile[];
}

export interface KostenstellenAnzeige {
  /** Die anzuzeigenden Zeilen; leer, wenn gar keine Kostenstelle hinterlegt ist. */
  zeilen: KostenstellenZeile[];
  /**
   * `true`, wenn die Zeile aus der Alt-Spalte stammt statt aus einer
   * gepflegten Aufteilung. Die Leser duerfen das kenntlich machen — es ist der
   * Unterschied zwischen "so eingetragen" und "aus dem Bestand uebernommen".
   */
  ausBestand: boolean;
  bemerkung: string | null;
  /** Summe der Anteile in ganzen Hundertsteln (siehe validations/kostenstellen.ts). */
  summe: number;
  /** Ergibt die Aufteilung 100 Prozent? Ohne Zeilen gibt es nichts zu pruefen. */
  summeStimmt: boolean;
}

/** Ein Anteil als deutscher Prozenttext: 60 -> "60,00 %". */
export function anteilText(anteil: number): string {
  return `${prozentText(hundertstel(anteil))} %`;
}

/**
 * Die Summe als Prozenttext: 10000 -> "100,00 %".
 *
 * Nimmt ganze Hundertstel entgegen, weil `KostenstellenAnzeige.summe` in
 * ganzen Hundertsteln rechnet — siehe validations/kostenstellen.ts.
 */
export function summeText(summeInHundertsteln: number): string {
  return `${prozentText(summeInHundertsteln)} %`;
}

/**
 * Die gesamte Aufteilung in EINER Zelle: "4711: 60,00 % | 4712: 40,00 %".
 *
 * Trennzeichen ist der senkrechte Strich und NICHT das Semikolon: Das
 * Semikolon trennt in der CSV die Spalten. Die Zelle wuerde zwar korrekt
 * gequotet (siehe src/lib/csv.ts), aber ein Import, der von Hand mit `split(";")`
 * arbeitet, zerlegte die Zeile trotzdem falsch.
 */
export function aufteilungText(zeilen: readonly KostenstellenZeile[]): string {
  return zeilen
    .map((zeile) => `${zeile.bezeichnung}: ${anteilText(zeile.anteil)}`)
    .join(" | ");
}

/** Zeilen, Bemerkung und Summe — die eine Quelle fuer alle Leser. */
export function kostenstellenAnzeige(
  sd: KostenstellenQuelle | null | undefined
): KostenstellenAnzeige {
  const leer: KostenstellenAnzeige = {
    zeilen: [],
    ausBestand: false,
    bemerkung: null,
    summe: 0,
    summeStimmt: true,
  };
  if (!sd) return leer;

  const bemerkung = sd.kostenstellenBemerkung?.trim() || null;
  const gepflegt = (sd.kostenstellen ?? []).filter(
    (zeile) => zeile && zeile.bezeichnung.trim() !== ""
  );

  const zeilen: KostenstellenZeile[] =
    gepflegt.length > 0
      ? gepflegt.map((zeile) => ({
          bezeichnung: zeile.bezeichnung.trim(),
          anteil: zeile.anteil,
        }))
      : [];

  if (zeilen.length === 0) {
    const alt = sd.kostenstelle?.trim() || "";
    if (!alt) return { ...leer, bemerkung };
    // Rueckfall auf den Bestand — dieselbe Regel wie in der Datenmigration.
    const anteil = sd.kostenstelleAnteil ?? 100;
    const summe = hundertstel(anteil);
    return {
      zeilen: [{ bezeichnung: alt, anteil }],
      ausBestand: true,
      bemerkung,
      summe,
      summeStimmt: summe === VOLLE_HUNDERT_HUNDERTSTEL,
    };
  }

  const summe = summeHundertstel(zeilen);
  return {
    zeilen,
    ausBestand: false,
    bemerkung,
    summe,
    summeStimmt: summe === VOLLE_HUNDERT_HUNDERTSTEL,
  };
}
