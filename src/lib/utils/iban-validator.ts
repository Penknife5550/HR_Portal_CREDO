/**
 * IBAN-Validierung nach ISO 13616
 *
 * Prueft:
 * 1. Laenge (15-34 Zeichen alphanumerisch)
 * 2. Deutsche IBAN: DE + 2 Pruefziffern + 18 Ziffern
 * 3. Pruefziffern-Validierung via Modulo 97
 */

/**
 * Validiert eine IBAN nach ISO 13616 (Modulo 97 Pruefziffern-Verfahren).
 *
 * @param iban - Die zu pruefende IBAN (mit oder ohne Leerzeichen)
 * @returns true wenn die IBAN gueltig ist
 */
export function validateIBAN(iban: string): boolean {
  // Leerzeichen und Bindestriche entfernen, Grossbuchstaben
  const cleaned = iban.replace(/[\s-]/g, "").toUpperCase();

  // Grundlegendes Format: 2 Buchstaben (Laendercode) + 2 Ziffern (Pruefziffer) + 11-30 alphanumerische Zeichen
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) {
    return false;
  }

  // Gesamtlaenge: 15-34 Zeichen
  if (cleaned.length < 15 || cleaned.length > 34) {
    return false;
  }

  // Spezifische Pruefung fuer deutsche IBAN: DE + 2 Pruefziffern + 18 Ziffern = 22 Zeichen
  if (cleaned.startsWith("DE")) {
    if (cleaned.length !== 22) {
      return false;
    }
    // Nach DE + 2 Pruefziffern muessen 18 Ziffern folgen
    if (!/^DE\d{20}$/.test(cleaned)) {
      return false;
    }
  }

  // ISO 13616 Modulo 97 Pruefung:
  // 1. Laendercode und Pruefziffern ans Ende verschieben
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  // 2. Buchstaben in Zahlen umwandeln (A=10, B=11, ..., Z=35)
  let numericString = "";
  for (const char of rearranged) {
    if (char >= "A" && char <= "Z") {
      numericString += (char.charCodeAt(0) - 55).toString();
    } else {
      numericString += char;
    }
  }

  // 3. Modulo 97 berechnen (mit schrittweiser Berechnung fuer grosse Zahlen)
  let remainder = 0;
  for (const digit of numericString) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  return remainder === 1;
}

/**
 * Formatiert eine IBAN fuer die Anzeige (Grossbuchstaben, Leerzeichen alle 4 Zeichen).
 *
 * @param iban - Die zu formatierende IBAN
 * @returns Formatierte IBAN (z.B. "DE89 3704 0044 0532 0130 00")
 */
export function formatIBAN(iban: string): string {
  const cleaned = iban.replace(/[\s-]/g, "").toUpperCase();
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}
