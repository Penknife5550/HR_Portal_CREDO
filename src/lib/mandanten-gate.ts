/**
 * Mandanten-Gate: Welche API-Pfade duerfen mandantenbeschraenkte Rollen sehen?
 *
 * **Warum es das gibt.** Von den 193 API-Routen ziehen nur rund 50 den
 * Mandanten ueberhaupt in die Abfrage. Das faellt heute nicht auf: Die beiden
 * mandantenbeschraenkten Rollen lassen sich gar nicht vergeben
 * (`assignableRoles` kennt sie nicht, und `UserOrgAssignment` wird nirgends
 * geschrieben), also sind alle vorhandenen Konten globale Rollen, die ohnehin
 * alles sehen duerfen. Sobald aber die erste Einrichtungsleitung angelegt wird
 * — und genau das ist geplant —, wuerde sie ueber jede ungepruefte Route die
 * Vorgaenge fremder Traeger lesen: Personalakten, Fuehrungszeugnisse,
 * Amtsarzt-Atteste, entschluesselte IBANs.
 *
 * **Warum eine Allowlist und keine Sperrliste.** Eine Sperrliste muesste
 * vollstaendig sein, um zu schuetzen — und waere beim naechsten neuen Endpunkt
 * schon wieder unvollstaendig. Die Allowlist dreht das um: Was nicht
 * ausdruecklich freigegeben ist, bekommt 403. Eine neue Route ist damit
 * automatisch gesperrt, bis jemand ihre Mandantenpruefung nachgewiesen hat.
 * Der Fehlerfall ist "zu wenig sichtbar", nicht "fremde Daten offen".
 *
 * **Die Liste ist zugleich die Arbeitsliste.** Wer die Mandantenpruefung in
 * einer Route nachzieht (`canAccessProcess` bzw. `orgFilter` in JEDER Methode
 * der Datei), traegt sie hier ein — mit einem Wort dazu, was geprueft wurde.
 * So waechst die Freigabe Route fuer Route statt in einem grossen Rutsch.
 *
 * Dieses Modul laeuft in der Edge-Runtime der Middleware und darf deshalb
 * **nichts** importieren, was Prisma anfasst. Es ist reine Zeichenkettenlogik.
 */

/**
 * Rollen, die nur ihre zugewiesenen Mandanten sehen duerfen.
 *
 * Einzige Definition im Projekt — `src/lib/permissions.ts` reicht sie weiter.
 * Eine Kopie in der Middleware waere genau die Stelle, die beim naechsten
 * Rollenwechsel vergessen wird.
 */
export const ORG_RESTRICTED_ROLES = ["EINRICHTUNGSLEITUNG", "VORGESETZTER"];

/**
 * API-Pfade, die mandantenbeschraenkte Rollen aufrufen duerfen.
 *
 * Eintragen erst, wenn nachgewiesen ist, dass **jede** Methode der Route den
 * Mandanten filtert. Ein Eintrag ist eine Zusage, kein Vorsatz.
 *
 * Aktuell steht hier nur die Anmeldung. Das ist kein Versehen: Die
 * Zugriffspruefung fehlt in rund 90 Routen mit `[id]`-Parameter, und keine
 * davon ist bisher einzeln nachgewiesen. Bis das geschehen ist, sieht eine
 * solche Rolle bewusst nichts — sie kann sich anmelden, mehr nicht.
 */
export const MANDANTEN_API_ALLOWLIST: readonly string[] = [
  // Anmeldung, Sitzung, Abmeldung. Kennt keine Vorgangsdaten.
  "/api/auth",
];

/** Ist diese Rolle mandantenbeschraenkt? */
export function istMandantenRolle(role: unknown): boolean {
  return typeof role === "string" && ORG_RESTRICTED_ROLES.includes(role);
}

/**
 * Passt der Pfad auf einen Allowlist-Eintrag?
 *
 * Vergleicht auf Segmentgrenze, nicht per blossem `startsWith`. Sonst wuerde
 * ein Eintrag "/api/auth" auch "/api/authentisierung-geheim" freigeben — der
 * klassische Weg, wie eine Allowlist leise loechrig wird.
 */
export function apiPfadErlaubt(pathname: string): boolean {
  return MANDANTEN_API_ALLOWLIST.some(
    (erlaubt) => pathname === erlaubt || pathname.startsWith(erlaubt + "/")
  );
}

/**
 * Soll die Middleware diesen Aufruf mit 403 abweisen?
 *
 * Greift nur fuer API-Pfade. Seiten regelt die Middleware weiterhin ueber ihre
 * Portal-/Admin-Logik: Eine Seite ohne Daten ist harmlos, die Daten holt sie
 * sich ueber genau diese APIs.
 */
export function apiZugriffVerweigern(role: unknown, pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (!istMandantenRolle(role)) return false;
  return !apiPfadErlaubt(pathname);
}
