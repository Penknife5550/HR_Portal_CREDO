/**
 * BEM-Aktentrennung (gesetzlich vorgeschrieben, § 167 SGB IX)
 *
 * Legt pro Dokumenttyp fest, WO ein erzeugtes/erfasstes BEM-Dokument abgelegt
 * wird. Die strikte Trennung von BEM-Akte und Personalakte ist Pflicht:
 *  - NUR_BEM: bleibt ausschliesslich in der BEM-Akte (Gespraeche, Datenschutz).
 *  - KOPIE_PERSONALAKTE: BEM-Original + bereinigte Kopie (ohne med. Details)
 *    in die Personalakte (Massnahmenplan).
 *  - ORIGINAL_PERSONALAKTE: Original in die Personalakte (Kuendigungsschutz-
 *    Nachweis) + Kopie in der BEM-Akte (Abbruch/Beendigung).
 */

import type { BemDokumentTyp, BemDokumentAblage } from "@prisma/client";

export const BEM_DOKUMENT_ABLAGE: Record<BemDokumentTyp, BemDokumentAblage> = {
  EINLADUNG: "NUR_BEM",
  DATENSCHUTZVEREINBARUNG: "NUR_BEM",
  ERSTGESPRAECH_PROTOKOLL: "NUR_BEM",
  FOLGEGESPRAECH_PROTOKOLL: "NUR_BEM",
  GEDAECHTNISPROTOKOLL: "NUR_BEM",
  MASSNAHMENPLAN: "KOPIE_PERSONALAKTE",
  ABSCHLUSSERKLAERUNG: "NUR_BEM",
  ABBRUCHERKLAERUNG: "ORIGINAL_PERSONALAKTE",
  BEENDIGUNGSERKLAERUNG: "ORIGINAL_PERSONALAKTE",
  GESAMT_EXPORT: "NUR_BEM",
  SONSTIGES: "NUR_BEM",
};

/** Standard-Ablage fuer einen Dokumenttyp (Fallback: NUR_BEM). */
export function defaultAblage(typ: BemDokumentTyp): BemDokumentAblage {
  return BEM_DOKUMENT_ABLAGE[typ] ?? "NUR_BEM";
}

/**
 * Erfordert dieser Dokumenttyp eine zusaetzliche Ablage in der Personalakte?
 * (KOPIE_PERSONALAKTE = bereinigte Kopie; ORIGINAL_PERSONALAKTE = Original.)
 * Die tatsaechliche Uebernahme in die Personalakte ist ein separater,
 * bewusst manueller Schritt (Sichtpruefung der Bereinigung).
 */
export function brauchtPersonalakte(typ: BemDokumentTyp): boolean {
  const a = defaultAblage(typ);
  return a === "KOPIE_PERSONALAKTE" || a === "ORIGINAL_PERSONALAKTE";
}

export const ABLAGE_LABELS: Record<BemDokumentAblage, string> = {
  NUR_BEM: "Nur BEM-Akte",
  KOPIE_PERSONALAKTE: "BEM + bereinigte Kopie Personalakte",
  ORIGINAL_PERSONALAKTE: "Personalakte (Original) + Kopie BEM",
};
