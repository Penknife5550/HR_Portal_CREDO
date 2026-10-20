/**
 * Adressen des Portals (UX-Umbau „Klarer Weg", U1 — Entscheidung E4)
 *
 * Die EINE Stelle, die weiss, unter welcher Adresse ein Vorgang, eine Liste
 * oder ein BEM-Fall steht. Jeder Verweis im Code — `href`, `router.push`,
 * `redirect`, `portalLink` einer E-Mail — geht ueber die Funktionen hier; ein
 * Test (adressen.test.ts) haelt fest, dass sonst nirgends eine alte Adresse
 * als Zeichenkette steht.
 *
 *   /vorgaenge                      → leitet auf die Onboarding-Liste (bis es
 *                                     mit U3 eine Startseite gibt)
 *   /vorgaenge/<modul>              Liste eines Moduls
 *   /vorgaenge/<modul>/<uuid>       ein Vorgang
 *   /bem, /bem/<uuid>, /bem/statistik
 *
 * Regeln:
 *   - Die Kennung in der Adresse ist und bleibt die UUID. Die Vorgangsnummer
 *     steht im Seitenkopf, nicht in der Adresse.
 *   - Die Modulnamen der Adresse (`VORGANGS_MODULE`) sind DAUERHAFT
 *     (entschieden am 02.10.2026). Wer einen umbenennt, braucht eine weitere
 *     Weiterleitung in `alteAdresse`.
 *   - Alte Adressen unter `/dashboard…` leiten dauerhaft weiter (Lesezeichen,
 *     verschickte E-Mails, Audit-Log). `alteAdresse` ist die Uebersetzung; die
 *     Middleware ruft nur sie auf — ohne Datenbank.
 *   - `/bem/einwilligung/…` ist eine OEFFENTLICHE Seite (BEM-Einwilligung per
 *     Link) und liegt unter demselben Anfang wie das BEM-Modul des Portals.
 *     `istBemPortalPfad` nimmt sie aus; sie wird weder geschuetzt noch
 *     umgeleitet.
 *   - Vergleiche immer auf ganze Pfadteile (`unter`), nie mit `startsWith`
 *     allein: `/bem-vorlagen` beginnt auch mit `/bem`.
 *   - Die Adressen der SCHNITTSTELLEN bleiben, wie sie sind
 *     (`/api/onboarding/…`, `/api/vorgaenge/contract-end/…/mails`). E4 betrifft
 *     nur, was im Adressfeld des Browsers steht.
 *
 * Rein und client-sicher: keine Importe, keine Uhr.
 */

/** Modulnamen in der Adresse, in der Reihenfolge der Reiter der Vorgangsliste. */
export const VORGANGS_MODULE = [
  "onboarding",
  "offboarding",
  "vertragsende",
  "verbeamtung",
  "mutterschutz",
  "elternzeit",
] as const;

export type VorgangsModul = (typeof VORGANGS_MODULE)[number];

/** Beschriftung der Reiter (Stand vor U3; die Anzeigenamen entscheidet E11). */
export const VORGANGS_MODUL_NAMEN: Record<VorgangsModul, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  vertragsende: "Vertragsende",
  verbeamtung: "Verbeamtung",
  mutterschutz: "Mutterschutz",
  elternzeit: "Elternzeit",
};

export const VORGAENGE_PFAD = "/vorgaenge";
export const BEM_PFAD = "/bem";
export const BEM_STATISTIK_PFAD = "/bem/statistik";
/** Oeffentliche Seite der BEM-Einwilligung — gehoert NICHT zum Portal. */
const BEM_EINWILLIGUNG_PFAD = "/bem/einwilligung";

const ALT_PFAD = "/dashboard";

/** Namen unter `/dashboard/…` und in `?tab=…` → Modulname der neuen Adresse. */
const ALTE_MODULNAMEN: Record<string, VorgangsModul> = {
  onboarding: "onboarding",
  offboarding: "offboarding",
  "contract-end": "vertragsende",
  "civil-service": "verbeamtung",
  mutterschutz: "mutterschutz",
  elternzeit: "elternzeit",
};

/** Nur eigene Eintraege — `constructor` oder `toString` sind keine Modulnamen. */
function altesModul(name: string | null): VorgangsModul | undefined {
  return name !== null && Object.hasOwn(ALTE_MODULNAMEN, name) ? ALTE_MODULNAMEN[name] : undefined;
}

export function istVorgangsModul(wert: unknown): wert is VorgangsModul {
  return typeof wert === "string" && (VORGANGS_MODULE as readonly string[]).includes(wert);
}

/** `pfad` ist `wurzel` selbst oder liegt darunter — ganze Pfadteile, nicht nur der Anfang. */
export function unter(pfad: string, wurzel: string): boolean {
  return pfad === wurzel || pfad.startsWith(`${wurzel}/`);
}

/** Liste eines Moduls; ohne Modul der Einstieg `/vorgaenge`. */
export function vorgangslistePfad(modul?: VorgangsModul): string {
  return modul ? `${VORGAENGE_PFAD}/${modul}` : VORGAENGE_PFAD;
}

/** Ein Vorgang, optional mit geoeffnetem Reiter (`?tab=…`). */
export function vorgangPfad(modul: VorgangsModul, id: string, reiter?: string): string {
  const pfad = `${VORGAENGE_PFAD}/${modul}/${encodeURIComponent(id)}`;
  return reiter ? `${pfad}?tab=${encodeURIComponent(reiter)}` : pfad;
}

/** BEM: ohne Kennung die Fallliste, mit Kennung der Fall. */
export function bemPfad(id?: string): string {
  return id ? `${BEM_PFAD}/${encodeURIComponent(id)}` : BEM_PFAD;
}

/** Vorgangslisten und Vorgaenge des Portals. */
export function istVorgaengePfad(pfad: string): boolean {
  return unter(pfad, VORGAENGE_PFAD);
}

/** Das BEM-Modul des Portals — ohne die oeffentliche Einwilligungsseite. */
export function istBemPortalPfad(pfad: string): boolean {
  return unter(pfad, BEM_PFAD) && !unter(pfad, BEM_EINWILLIGUNG_PFAD);
}

/**
 * Uebersetzt eine alte Adresse (`/dashboard…`) in die neue. `null`, wenn der
 * Pfad keine alte Adresse ist — dann leitet niemand um.
 *
 * `suche` ist der Teil ab dem Fragezeichen (`"?tab=dokumente"` oder `""`). Er
 * bleibt erhalten; nur `?tab=<modul>` an der alten Liste wird zum Pfad.
 */
export function alteAdresse(pfad: string, suche = ""): string | null {
  const ohneSchluss = pfad.length > 1 && pfad.endsWith("/") ? pfad.slice(0, -1) : pfad;
  if (!unter(ohneSchluss, ALT_PFAD)) return null;

  const teile = ohneSchluss.slice(ALT_PFAD.length).split("/").filter(Boolean);

  // Die alte Liste: das Modul stand in `?tab=`.
  if (teile.length === 0) {
    const parameter = new URLSearchParams(suche);
    const modul = altesModul(parameter.get("tab"));
    parameter.delete("tab");
    const rest = parameter.toString();
    return vorgangslistePfad(modul) + (rest ? `?${rest}` : "");
  }

  const [erster, ...weitere] = teile;
  const anhang = weitere.length > 0 ? `/${weitere.join("/")}` : "";

  if (erster === "bem") return `${BEM_PFAD}${anhang}${suche}`;

  // Ein Modulname ist keine Kennung: `/dashboard/offboarding/<id>`.
  const modul = altesModul(erster);
  if (modul) return `${vorgangslistePfad(modul)}${anhang}${suche}`;

  // Sonst war der erste Teil die Kennung eines Onboarding-Vorgangs.
  return `${vorgangslistePfad("onboarding")}/${erster}${anhang}${suche}`;
}
