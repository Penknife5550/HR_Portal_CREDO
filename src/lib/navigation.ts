/**
 * Navigation des Portals (UX-Umbau „Klarer Weg", U1 — Entscheidung E3)
 *
 * Die EINE Tabelle der Punkte im Kopf: Text, Adresse, Rollen. Der Kopf
 * (src/components/rahmen/portal-kopf.tsx), sein Handy-Menue und die Tests
 * lesen von hier.
 *
 * Regeln:
 *   - Hoechstens sechs Punkte oben (E3). Heute sind es vier: Vorgänge · BEM ·
 *     Vorlagen · Verwaltung. Start, Aufgaben und Personen kommen mit ihren
 *     Paketen dazu; die Vorlagen ziehen dann unter „Verwaltung".
 *   - Der Kopf zeigt NUR, was die Rolle auch oeffnen kann (Entscheidung
 *     U1-F3). Die Rollen hier muessen zu den Regeln der Middleware und der
 *     Seiten passen — navigation.test.ts ruft die Middleware fuer jeden
 *     sichtbaren Punkt jeder Rolle auf. Wer hier eine Rolle ergaenzt, aendert
 *     KEINE Berechtigung; er macht nur einen Punkt sichtbar.
 *   - Genau EIN Punkt ist aktiv: der mit dem laengsten passenden
 *     Adressanfang, verglichen auf ganze Pfadteile (`unter`). Frueher waren
 *     „Dashboard" und „BEM" zugleich markiert.
 *   - Jede Rolle hat einen Namen (`rollenName`). Eine unbekannte Rolle zeigt
 *     ihren Schluessel — nie den Namen einer anderen Rolle.
 *
 * Rein und client-sicher (kein Import aus permissions.ts: die Datei zieht die
 * Datenbank mit).
 */
import { BEM_PFAD, unter, VORGAENGE_PFAD } from "@/lib/adressen";

export interface NavUnterpunkt {
  text: string;
  href: string;
  rollen: readonly string[];
}

export interface NavPunkt {
  schluessel: "vorgaenge" | "bem" | "vorlagen" | "verwaltung";
  text: string;
  /** Direkter Verweis; ohne `href` ist der Punkt ein Menue mit `kinder`. */
  href?: string;
  rollen: readonly string[];
  kinder?: readonly NavUnterpunkt[];
}

const ALLE_PORTAL = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER"] as const;
const HR = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] as const;
const LEITUNG = ["SUPER_ADMIN", "HR_LEITUNG"] as const;

export const NAVIGATION: readonly NavPunkt[] = [
  { schluessel: "vorgaenge", text: "Vorgänge", href: VORGAENGE_PFAD, rollen: ALLE_PORTAL },
  {
    // BEM = „versiegelte Akte". Fuer alle Portal-Rollen sichtbar; die Liste
    // zeigt aber nur Faelle mit aktiver Freigabe. Externe BEM-Beauftragte
    // sehen NUR diesen Punkt.
    schluessel: "bem",
    text: "BEM",
    href: BEM_PFAD,
    rollen: [...ALLE_PORTAL, "BEM_BEAUFTRAGTER"],
  },
  {
    schluessel: "vorlagen",
    text: "Vorlagen",
    rollen: HR,
    kinder: [
      // `/vorlagen` gibt die Middleware nur der HR-Leitung frei — die
      // Sachbearbeitung sieht den Punkt deshalb nicht (U1-F3).
      { text: "Formulare", href: "/vorlagen", rollen: LEITUNG },
      { text: "Brief-Vorlagen", href: "/brief-vorlagen", rollen: HR },
      { text: "Checklisten", href: "/checklisten", rollen: LEITUNG },
      { text: "Exit-Interview", href: "/exit-interview-vorlagen", rollen: LEITUNG },
      { text: "Zeugnis-Bewertung", href: "/zeugnis-vorlagen", rollen: LEITUNG },
      { text: "Beurteilungs-Vorlagen", href: "/beurteilungs-vorlagen", rollen: LEITUNG },
    ],
  },
  {
    schluessel: "verwaltung",
    text: "Verwaltung",
    rollen: LEITUNG,
    kinder: [
      { text: "Benutzer", href: "/benutzerverwaltung", rollen: LEITUNG },
      { text: "BEM-Vorlagen", href: "/bem-vorlagen", rollen: LEITUNG },
      { text: "Mandanten", href: "/mandanten", rollen: ["SUPER_ADMIN"] },
      { text: "Einstellungen", href: "/einstellungen", rollen: LEITUNG },
      { text: "Audit-Log", href: "/audit-log", rollen: LEITUNG },
    ],
  },
];

/** Die Punkte, die eine Rolle sieht — Menues nur mit ihren sichtbaren Unterpunkten, leere gar nicht. */
export function sichtbarePunkte(rolle: string): NavPunkt[] {
  const punkte: NavPunkt[] = [];
  for (const punkt of NAVIGATION) {
    if (!punkt.rollen.includes(rolle)) continue;
    if (!punkt.kinder) {
      punkte.push(punkt);
      continue;
    }
    const kinder = punkt.kinder.filter((k) => k.rollen.includes(rolle));
    if (kinder.length > 0) punkte.push({ ...punkt, kinder });
  }
  return punkte;
}

export interface AktiverPunkt {
  schluessel: NavPunkt["schluessel"];
  /** Die Adresse des Punkts bzw. Unterpunkts, der passt. */
  href: string;
}

/**
 * Welcher Punkt zur Adresse gehoert — der mit dem laengsten passenden
 * Adressanfang; `null`, wenn keiner passt (etwa `/ui-muster`).
 */
export function aktiverPunkt(pfad: string, punkte: readonly NavPunkt[] = NAVIGATION): AktiverPunkt | null {
  let bester: AktiverPunkt | null = null;
  for (const punkt of punkte) {
    const adressen = punkt.href ? [punkt.href] : (punkt.kinder ?? []).map((k) => k.href);
    for (const href of adressen) {
      if (unter(pfad, href) && (bester === null || href.length > bester.href.length)) {
        bester = { schluessel: punkt.schluessel, href };
      }
    }
  }
  return bester;
}

/**
 * Wohin das Logo fuehrt: der erste Punkt, den die Rolle sieht. Fuer externe
 * BEM-Beauftragte ist das die BEM-Fallliste — `/vorgaenge` leitete die
 * Middleware fuer sie nur um.
 */
export function startAdresse(rolle: string): string {
  const erster = sichtbarePunkte(rolle)[0];
  return erster?.href ?? erster?.kinder?.[0]?.href ?? VORGAENGE_PFAD;
}

/** Anzeigename je Rolle — fuer ALLE Rollen, die sich anmelden koennen. */
export const ROLLEN_NAMEN: Record<string, string> = {
  SUPER_ADMIN: "Administration",
  HR_LEITUNG: "HR-Leitung",
  HR_SACHBEARBEITER: "HR-Sachbearbeitung",
  EINRICHTUNGSLEITUNG: "Einrichtungsleitung",
  VORGESETZTER: "Führungskraft",
  BEM_BEAUFTRAGTER: "BEM-Beauftragte:r",
};

export function rollenName(rolle: string): string {
  return Object.hasOwn(ROLLEN_NAMEN, rolle) ? ROLLEN_NAMEN[rolle] : rolle;
}
