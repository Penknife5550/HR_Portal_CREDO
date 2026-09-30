/**
 * Zeitplaner — die Uhr.
 *
 * Laeuft im Node-Prozess des Portals (gestartet aus src/instrumentation.ts)
 * und ruft jede Minute POST /api/zeitplaner/takt im SELBEN Prozess auf. Mehr
 * tut sie nicht: Welche Laeufe faellig sind, entscheidet die Route.
 *
 * Warum der Umweg ueber eine Route statt eines direkten Funktionsaufrufs?
 * Next.js buendelt `instrumentation.ts` getrennt von den Routen. Riefe die Uhr
 * die Lauf-Funktionen direkt auf, gaebe es jedes Modul zweimal im Prozess —
 * eine zweite PrismaClient-Instanz und, schlimmer, zweite Exemplare der
 * prozesslokalen Sperren (etwa `laufendeUnterlagenAktionen`, die HR-Aktionen
 * und den Unterlagen-Lauf gegeneinander absichert). Ueber die Route laeuft
 * alles in denselben Modulen wie jede andere Anfrage.
 *
 * Deshalb importiert diese Datei nichts aus dem Portal. Der Zustand liegt auf
 * `globalThis` — das teilen Instrumentation und Routen, weil sie im selben
 * Prozess laufen.
 *
 * Absicherung der Takt-Route: ein zufaelliges Geheimnis, das die Uhr beim
 * Start erzeugt und nur im Speicher haelt. Von aussen (ueber Caddy) ist die
 * Route damit nicht aufrufbar, und es braucht keine Umgebungsvariable.
 *
 * Schalter: `ZEITPLANER_AKTIV` — Standard an in Produktion, aus sonst (die
 * Entwicklungsumgebung soll nie von selbst Mails verschicken). Basis-URL der
 * Selbstaufrufe: `ZEITPLANER_BASIS_URL`, sonst http://127.0.0.1:$PORT.
 */

// Bewusst kein Import aus "crypto": Next.js buendelt instrumentation.ts auch
// fuer die Edge-Laufzeit, dort gibt es das Node-Modul nicht. Web Crypto
// (globalThis.crypto) gibt es in Node und Edge.

const TAKT_MS = 60_000;
/** Erster Takt kurz nach dem Start — der Server lauscht dann sicher. */
const ERSTER_TAKT_MS = 20_000;
const TAKT_TIMEOUT_MS = 30_000;
export const TAKT_PFAD = "/api/zeitplaner/takt";
export const TAKT_KOPF = "x-zeitplaner-token";

interface ZeitplanerGlobal {
  token: string;
  gestartetAm: string;
  letzterTakt: string | null;
  letzterFehler: string | null;
  laeuft: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

const SCHLUESSEL = "__credoZeitplaner";

function globalZustand(): ZeitplanerGlobal | undefined {
  return (globalThis as unknown as Record<string, ZeitplanerGlobal | undefined>)[SCHLUESSEL];
}

function zufallsToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Soll die Uhr in diesem Prozess laufen? */
export function zeitplanerSollLaufen(env: Record<string, string | undefined> = process.env): boolean {
  const wert = env.ZEITPLANER_AKTIV?.trim().toLowerCase();
  if (wert === "true" || wert === "1") return true;
  if (wert === "false" || wert === "0") return false;
  return env.NODE_ENV === "production";
}

/** Zustand fuer Oberflaeche und Health-Check (ohne Geheimnis). */
export function zeitplanerZustand(): { uhrAktiv: boolean; letzterTakt: string | null; letzterFehler: string | null } {
  const z = globalZustand();
  return { uhrAktiv: !!z?.timer, letzterTakt: z?.letzterTakt ?? null, letzterFehler: z?.letzterFehler ?? null };
}

/** Prueft den Kopf der Takt-Route (zeitkonstant). */
export function taktTokenGueltig(wert: string | null): boolean {
  const z = globalZustand();
  if (!z || !wert) return false;
  if (wert.length !== z.token.length) return false;
  // Zeitkonstant: jedes Zeichen wird verglichen, egal wo der erste Unterschied liegt.
  let unterschied = 0;
  for (let i = 0; i < wert.length; i++) unterschied |= wert.charCodeAt(i) ^ z.token.charCodeAt(i);
  return unterschied === 0;
}

/** Die Takt-Route meldet, dass sie gelaufen ist. */
export function taktVermerken(jetzt: Date = new Date()): void {
  const z = globalZustand();
  if (z) z.letzterTakt = jetzt.toISOString();
}

async function takt(z: ZeitplanerGlobal, basis: string): Promise<void> {
  if (z.laeuft) return; // der vorige Takt haengt noch
  z.laeuft = true;
  try {
    const antwort = await fetch(`${basis}${TAKT_PFAD}`, {
      method: "POST",
      headers: { [TAKT_KOPF]: z.token },
      signal: AbortSignal.timeout(TAKT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!antwort.ok) {
      const fehler = `HTTP ${antwort.status}`;
      if (z.letzterFehler !== fehler) console.error(`[Zeitplaner] Takt fehlgeschlagen: ${fehler}`);
      z.letzterFehler = fehler;
    } else if (z.letzterFehler) {
      console.log("[Zeitplaner] Takt läuft wieder.");
      z.letzterFehler = null;
    }
  } catch (fehler) {
    const kennung = fehler instanceof Error ? fehler.name : "Fehler";
    // Nur beim Wechsel loggen, nicht jede Minute.
    if (z.letzterFehler !== kennung) console.error(`[Zeitplaner] Takt fehlgeschlagen: ${kennung}`);
    z.letzterFehler = kennung;
  } finally {
    z.laeuft = false;
  }
}

/** Startet die Uhr (einmal je Prozess). */
export function zeitplanerUhrStarten(env: Record<string, string | undefined> = process.env): void {
  if (!zeitplanerSollLaufen(env)) {
    console.log("[Zeitplaner] Uhr aus (ZEITPLANER_AKTIV).");
    return;
  }
  if (globalZustand()?.timer) return;
  const basis = (env.ZEITPLANER_BASIS_URL || `http://127.0.0.1:${env.PORT || "3000"}`).replace(/\/$/, "");
  const z: ZeitplanerGlobal = {
    token: zufallsToken(),
    gestartetAm: new Date().toISOString(),
    letzterTakt: null,
    letzterFehler: null,
    laeuft: false,
    timer: null,
  };
  (globalThis as unknown as Record<string, ZeitplanerGlobal>)[SCHLUESSEL] = z;
  setTimeout(() => void takt(z, basis), ERSTER_TAKT_MS).unref();
  z.timer = setInterval(() => void takt(z, basis), TAKT_MS);
  z.timer.unref();
  console.log("[Zeitplaner] Uhr gestartet (jede Minute).");
}
