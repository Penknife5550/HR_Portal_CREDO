/**
 * In-Memory Rate Limiter
 *
 * Einfaches Token-Bucket-basiertes Rate Limiting für API-Routen.
 * Fuer Produktion mit mehreren Instanzen sollte Redis verwendet werden.
 *
 * Schuetzt vor:
 * - Brute-Force Login-Versuche
 * - Token-Enumeration auf Magic-Link-Endpunkte
 * - API-Abuse
 *
 * Ausserdem wohnt hier die Ermittlung der Aufrufer-IP (`getClientIp` /
 * `getClientIpOrNull`) — sie liefert nicht nur die Schluessel fuer die Bremsen,
 * sondern auch die IP fuer die Protokolle (AuditLog, `erklaerungIp` der
 * Wahrheitsversicherung, BEM-Kommunikation). Der Dateiname allein sagt das
 * nicht mehr: Nach dem Zusammenfuehren der ueber die Anwendung verstreuten
 * Eigenbauten ist die Funktion an deutlich mehr Stellen Protokollquelle als
 * Zaehlerschluessel. Sie bleibt trotzdem hier — ein Umzug in eine eigene Datei
 * waere reine Benennung und wuerde rund neunzig Importzeilen anfassen, ohne
 * dass sich am Verhalten irgendetwas aendert.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterConfig {
  /** Maximale Anzahl Requests im Zeitfenster */
  maxRequests: number;
  /** Zeitfenster in Millisekunden */
  windowMs: number;
}

/**
 * Ein Speicher haelt die Eintraege EINES benannten Limiters — und daneben die
 * Schwelle, ab der der Aufraeumer sie wegwerfen darf. Die Schwelle muss hier
 * mitliegen und nicht als feste Zahl im Aufraeumer stehen: Der Aufraeumer
 * laeuft ueber alle Speicher, kennt aber nur die Eintraege. Ohne die Schwelle
 * am Speicher haette er kein Mittel, das Stundenfenster des
 * Dokumentenpaket-Versands von der Minutenbremse des Logins zu unterscheiden.
 */
interface RateLimitSpeicher {
  eintraege: Map<string, RateLimitEntry>;
  /** Ruhezeit, nach der ein Eintrag verworfen werden darf (siehe unten). */
  aufraeumSchwelleMs: number;
}

const stores = new Map<string, RateLimitSpeicher>();

/**
 * Untergrenze der Aufraeum-Schwelle. Genau der Wert, der frueher fest im
 * Aufraeumer stand — damit sich fuer jedes Fenster bis 10 Minuten (Login,
 * Token, allgemeine API, beide Export-Bremsen, die Minutenbremse des
 * Dokumentenpakets) nichts aendert.
 */
export const MINDEST_AUFRAEUM_SCHWELLE_MS = 10 * 60 * 1000;

/**
 * Wie lange ein Eintrag ohne Anfrage ueberleben muss, bevor er weg darf.
 *
 * WARUM das vom Fenster abhaengen MUSS: Einen Eintrag wegzuwerfen bedeutet
 * nicht "Zaehler vergessen", sondern "Eimer randvoll" — der naechste `check()`
 * findet nichts vor und legt einen vollen Eimer an. Das ist nur dann harmlos,
 * wenn der Eimer nach so viel Ruhe ohnehin voll WAERE, also erst nach
 * `windowMs` ohne Anfrage.
 *
 * Vorher stand hier fest 10 Minuten, ueber alle Speicher hinweg. Fuer Fenster
 * von 1 bis 15 Minuten faellt das nicht auf, fuer das Stundenfenster des
 * Dokumentenpaket-Versands (60 pro 60 Minuten) sehr wohl: Sieben Minuten
 * senden (die Minutenbremse deckelt auf 10/min, macht ~66 verbrauchte Token),
 * dann 14 Minuten Pause — der Aufraeum-Tick dazwischen loescht den Eintrag,
 * und die naechste Anfrage bekommt statt der korrekt nachgefuellten ~14 Token
 * einen vollen Eimer mit 60. Der Zyklus ist beliebig wiederholbar und macht
 * aus 60 Versendungen je Stunde dauerhaft rund 198.
 *
 * `lastRefill` ist dabei kein Anlegedatum, sondern der Zeitpunkt der letzten
 * Anfrage — jeder `check()` setzt ihn neu. Die Schwelle misst also echte Ruhe,
 * und ein Eimer, der `windowMs` lang in Ruhe war, ist rechnerisch voll. Der
 * Aufraeumer wirft damit nur noch weg, was er ohne Verlust wegwerfen kann.
 */
export function aufraeumSchwelleFuer(config: RateLimiterConfig): number {
  return Math.max(MINDEST_AUFRAEUM_SCHWELLE_MS, config.windowMs);
}

/**
 * Wie viele Schluessel ein Speicher gerade haelt.
 *
 * Nur zur Diagnose und fuer die Tests: Ob der Aufraeumer einen Eintrag behaelt
 * oder wegwirft, ist von aussen sonst NICHT beobachtbar — bei kurzen Fenstern
 * ist der Eimer nach der Ruhezeit ohnehin voll, das Ergebnis von `check()` ist
 * in beiden Faellen dasselbe. Genau deshalb blieb der Fehler im Stundenfenster
 * so lange unsichtbar. Ohne diesen Einblick liesse sich weder belegen, dass
 * kurze Fenster weiter exakt nach 10 Minuten geraeumt werden, noch dass der
 * Speicher ueberhaupt noch begrenzt bleibt.
 */
export function speicherGroesse(name: string): number {
  return stores.get(name)?.eintraege.size ?? 0;
}

// Periodische Bereinigung alter Eintraege (alle 5 Minuten)
const aufraeumUhr = setInterval(() => {
  const now = Date.now();
  for (const [, speicher] of stores) {
    for (const [key, entry] of speicher.eintraege) {
      // Eintraege entfernen, die laenger als die Schwelle DIESES Speichers in
      // Ruhe waren — also erst dann, wenn ihr Eimer nachweislich wieder voll
      // waere. Siehe aufraeumSchwelleFuer().
      if (now - entry.lastRefill > speicher.aufraeumSchwelleMs) {
        speicher.eintraege.delete(key);
      }
    }
  }
}, 5 * 60 * 1000);

// Der Timer soll den Prozess nicht am Leben halten. Im Server faellt das nicht
// auf — der laeuft ohnehin weiter. In Jest schon: Ohne unref() bleibt der
// Event-Loop offen, der Testlauf haengt am Ende und Jest meldet
// "A worker process has failed to exit gracefully".
// Optional aufgerufen, weil unref() nur in der Node-Runtime existiert.
(aufraeumUhr as unknown as { unref?: () => void }).unref?.();

/**
 * Erstellt einen Rate Limiter mit der gegebenen Konfiguration.
 *
 * @returns Objekt mit check()-Methode die true zurueckgibt wenn Request erlaubt ist
 */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
  const vorhanden = stores.get(name);
  const speicher: RateLimitSpeicher = vorhanden ?? {
    eintraege: new Map(),
    aufraeumSchwelleMs: 0,
  };
  // Die Schwelle darf nur wachsen. Beim ersten Aufruf hebt das Math.max sie von
  // 0 auf den Wert dieser Konfiguration. Meldet sich spaeter ein zweiter
  // Limiter unter DEMSELBEN Namen an — heute tut das niemand, aber der Name ist
  // eine frei gewaehlte Zeichenkette und ein Tippfehler genuegt —, teilen sich
  // beide die Eintraege. Dann muss das laengste Fenster gelten: Die Schwelle des
  // kuerzeren wuerde die Eintraege des laengeren zu frueh wegwerfen und ihm
  // volle Eimer schenken. Zu spaet raeumen kostet nur etwas Speicher, zu frueh
  // raeumen oeffnet die Bremse.
  speicher.aufraeumSchwelleMs = Math.max(
    speicher.aufraeumSchwelleMs,
    aufraeumSchwelleFuer(config),
  );
  if (!vorhanden) {
    stores.set(name, speicher);
  }
  const store = speicher.eintraege;

  return {
    /**
     * Prueft ob ein Request für den gegebenen Key erlaubt ist.
     *
     * @param key - Identifikator (z.B. IP-Adresse, E-Mail)
     * @returns { allowed: boolean, remaining: number, retryAfterMs?: number }
     */
    check(key: string): {
      allowed: boolean;
      remaining: number;
      retryAfterMs?: number;
    } {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry) {
        // Neuer Eintrag: ein Token verbrauchen
        store.set(key, {
          tokens: config.maxRequests - 1,
          lastRefill: now,
        });
        return { allowed: true, remaining: config.maxRequests - 1 };
      }

      // Tokens auffuellen basierend auf vergangener Zeit
      const elapsed = now - entry.lastRefill;
      const refillRate = config.maxRequests / config.windowMs;
      const tokensToAdd = elapsed * refillRate;
      entry.tokens = Math.min(config.maxRequests, entry.tokens + tokensToAdd);
      entry.lastRefill = now;

      if (entry.tokens < 1) {
        // Rate Limit erreicht
        const retryAfterMs = Math.ceil((1 - entry.tokens) / refillRate);
        return { allowed: false, remaining: 0, retryAfterMs };
      }

      // Token verbrauchen
      entry.tokens -= 1;
      store.set(key, entry);
      return { allowed: true, remaining: Math.floor(entry.tokens) };
    },
  };
}

// =============================================
// Vorkonfigurierte Rate Limiter
// =============================================

/** Login: max 5 Versuche pro Minute pro IP */
export const loginRateLimiter = createRateLimiter("login", {
  maxRequests: 5,
  windowMs: 60 * 1000,
});

/** Login per E-Mail: max 10 Versuche pro 15 Minuten pro E-Mail */
export const loginEmailRateLimiter = createRateLimiter("login-email", {
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
});

/** Magic-Link / Token-Endpunkte: max 20 Requests pro Minute pro IP */
export const tokenRateLimiter = createRateLimiter("token", {
  maxRequests: 20,
  windowMs: 60 * 1000,
});

/** Allgemeine API: max 60 Requests pro Minute pro IP */
export const apiRateLimiter = createRateLimiter("api", {
  maxRequests: 60,
  windowMs: 60 * 1000,
});

/**
 * Die IP des Aufrufers — so weit man ihr trauen kann.
 *
 * `X-Forwarded-For` ist eine Kette: Jeder Proxy haengt hinten an, wen er
 * gesehen hat. Vertrauenswuerdig ist deshalb nur der **letzte** Eintrag — den
 * hat der eigene Reverse Proxy geschrieben (Caddy, siehe Caddyfile.hr-portal).
 * Alles davor stammt aus dem Header, den der Aufrufer selbst mitgeschickt hat.
 *
 * Vorher stand hier der ERSTE Eintrag. Damit war jede Begrenzung wirkungslos:
 * Ein `X-Forwarded-For: <zufaellige IP>` pro Versuch, und jeder Aufruf bekam
 * einen frischen Zaehler — Login-Bremse, Token-Bremse und die Bremse der
 * Reporting-Endpunkte gleichermassen. Und weil dieselbe Funktion die IP fuer
 * die Protokolle liefert (AuditLog, `erklaerungIp` der Wahrheitsversicherung),
 * stand dort eine Adresse, die sich der Absender frei aussuchen konnte.
 *
 * Sind mehrere Proxys hintereinander geschaltet, muss diese Stelle mitwachsen:
 * dann ist nicht der letzte Eintrag der richtige, sondern der letzte VOR den
 * eigenen Proxys.
 *
 * Warum es KEINEN Rueckfall auf `X-Real-IP` gibt: Vor dem Portal steht Caddy
 * mit einem blanken `reverse_proxy` (Caddyfile.hr-portal Zeile 19). Caddy
 * schreibt dabei `X-Forwarded-For` — `X-Real-IP` schreibt hier niemand. Der
 * Header kaeme also ausschliesslich vom Aufrufer selbst, und er griffe genau
 * dann, wenn `X-Forwarded-For` fehlt: bei einem Zugriff, der am Proxy
 * vorbeigeht. Das ist der Fall, in dem man einem Header am wenigsten glauben
 * darf. Kehrseite, damit spaeter niemand den Fehler in der Anwendung sucht:
 * Kommt irgendwann ein Proxy davor, der NUR `X-Real-IP` setzt, sind alle
 * Protokoll-IPs schlagartig leer. Dann gehoert die Aenderung hierher — und
 * nur hierher.
 *
 * Zwei Rueckgaben auf EINEM Leseweg:
 * - `getClientIpOrNull` fuer Protokolle. `null` heisst "nicht ermittelbar",
 *   und genau das gehoert dann in das nullable Feld — eine erfundene
 *   Zeichenkette waere im Nachweis schlechter als eine Luecke.
 * - `getClientIp` fuer Zaehlerschluessel. Die brauchen immer einen String;
 *   `"unknown"` ist ein gemeinsamer Topf, der zu viel bremst, aber nichts
 *   oeffnet.
 *
 * Beide nehmen `Request` (also auch `NextRequest`) oder direkt `Headers`. Eine
 * Server-Komponente hat nur `await headers()` und gar kein Request-Objekt —
 * ohne diese Verbreiterung braeuchte sie wieder eine eigene Kopie, und genau
 * von den Kopien kommen wir hier her.
 */
export function getClientIpOrNull(quelle: Request | Headers): string | null {
  // `"headers" in quelle` statt `quelle instanceof Headers`: `headers` ist ein
  // Getter auf `Request.prototype`, `in` prueft also die Prototypenkette und
  // TypeScript verengt die Union damit sauber. `instanceof` haengt dagegen
  // davon ab, ob zur Laufzeit genau EINE `Headers`-Klasse existiert — bei
  // Next.js mit seinen eigenen Web-API-Nachbauten keine Annahme, auf die man
  // eine Sicherheitsentscheidung stellen moechte.
  const kopf = "headers" in quelle ? quelle.headers : quelle;
  const forwarded = kopf.get("x-forwarded-for");
  if (!forwarded) return null;
  const kette = forwarded
    .split(",")
    .map((eintrag) => eintrag.trim())
    .filter((eintrag) => eintrag.length > 0);
  return kette.length > 0 ? kette[kette.length - 1] : null;
}

export function getClientIp(quelle: Request | Headers): string {
  // Ohne Proxy-Header laesst sich die IP hier nicht ermitteln. Alle solchen
  // Aufrufe teilen sich dann einen Zaehler — das bremst zu viel, aber es
  // oeffnet nichts. Im Betrieb setzt Caddy den Header immer.
  return getClientIpOrNull(quelle) ?? "unknown";
}
