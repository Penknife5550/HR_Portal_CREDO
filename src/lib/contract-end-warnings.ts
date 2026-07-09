/**
 * Rechtliche HR-Warnungen fuer Vertragsende-Vorgaenge. LIVE aus den Vorgangs-
 * daten abgeleitet (keine DB-Felder). Reine Hinweise — ersetzen keine
 * arbeitsrechtliche Pruefung, machen Risiken aber sichtbar.
 */

const MS_PER_DAY = 86400000;

export interface SignatureWarning {
  /** true, wenn ein unterschriebener Vertrag dringend benoetigt wird. */
  warn: boolean;
  /** Tage bis zum Vertragsende (negativ = bereits ueberschritten). */
  daysLeft: number;
  /** true, wenn das Vertragsende bereits ueberschritten ist. */
  overdue: boolean;
}

/**
 * B1 — Entfristungsfalle (§ 15 Abs. 5 TzBfG): Bei Uebernahme muss VOR dem
 * Vertragsende ein unterschriebener Vertrag vorliegen. Arbeitet die Person ohne
 * neuen Vertrag weiter, gilt das Arbeitsverhaeltnis als unbefristet verlaengert.
 *
 * Liefert eine Warnung, solange uebernommen wird (Status RUECKMELDUNG_UEBERNAHME
 * oder VERTRAG_ERSTELLT) und noch kein unterschriebener Ruecklauf erfasst ist —
 * scharf (`warn`), sobald das Vertragsende in <= `warnDays` liegt oder ueberschritten ist.
 * Gibt null zurueck, wenn die Warnung nicht einschlaegig ist (kein Uebernahme-Status
 * oder Ruecklauf liegt vor).
 */
export function getSignatureWarning(opts: {
  decision: string;
  status: string;
  contractEndDate: Date;
  contractSignedReturnedAt: Date | null;
  now?: Date;
  warnDays?: number;
}): SignatureWarning | null {
  const now = opts.now ?? new Date();
  const warnDays = opts.warnDays ?? 30;

  const istUebernahme = opts.decision === "UEBERNAHME";
  const offen = ["RUECKMELDUNG_UEBERNAHME", "VERTRAG_ERSTELLT"].includes(opts.status);
  if (!istUebernahme || !offen) return null;
  if (opts.contractSignedReturnedAt) return null; // Ruecklauf vorhanden -> keine Warnung

  const daysLeft = Math.floor((opts.contractEndDate.getTime() - now.getTime()) / MS_PER_DAY);
  return { warn: daysLeft <= warnDays, daysLeft, overdue: daysLeft < 0 };
}

export interface KettenbefristungWarning {
  warn: boolean;
  reason: string;
}

/**
 * B2 — Kettenbefristung (§ 14 Abs. 2 TzBfG): sachgrundlose Befristung ist nur bis
 * zu 24 Monaten und max. 3 Verlaengerungen zulaessig. Liefert eine Warnung, wenn
 * eine dieser Grenzen erreicht/ueberschritten ist — dann ist ein Sachgrund noetig
 * oder eine Entfristung zu pruefen. Greift nur bei `befristungsart === "SACHGRUNDLOS"`.
 */
export function getKettenbefristungWarning(opts: {
  befristungsart: string | null;
  bisherigeBefristungMonate: number | null;
  bisherigeVerlaengerungen: number | null;
}): KettenbefristungWarning | null {
  if (opts.befristungsart !== "SACHGRUNDLOS") return null;

  const reasons: string[] = [];
  if ((opts.bisherigeBefristungMonate ?? 0) >= 24) {
    reasons.push("die sachgrundlose Befristung erreicht/überschreitet 24 Monate");
  }
  if ((opts.bisherigeVerlaengerungen ?? 0) >= 3) {
    reasons.push("die zulässige Zahl von 3 Verlängerungen ist erreicht");
  }
  if (reasons.length === 0) return null;

  return {
    warn: true,
    reason: `Ohne Sachgrund nicht mehr zulässig (${reasons.join("; ")}). Sachgrund erforderlich oder Entfristung prüfen (§ 14 TzBfG).`,
  };
}
