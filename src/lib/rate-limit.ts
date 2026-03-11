/**
 * In-Memory Rate Limiter
 *
 * Einfaches Token-Bucket-basiertes Rate Limiting fuer API-Routen.
 * Fuer Produktion mit mehreren Instanzen sollte Redis verwendet werden.
 *
 * Schuetzt vor:
 * - Brute-Force Login-Versuche
 * - Token-Enumeration auf Magic-Link-Endpunkte
 * - API-Abuse
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

const stores = new Map<string, Map<string, RateLimitEntry>>();

// Periodische Bereinigung alter Eintraege (alle 5 Minuten)
setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      // Eintraege entfernen die aelter als 10 Minuten sind
      if (now - entry.lastRefill > 10 * 60 * 1000) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000);

/**
 * Erstellt einen Rate Limiter mit der gegebenen Konfiguration.
 *
 * @returns Objekt mit check()-Methode die true zurueckgibt wenn Request erlaubt ist
 */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const store = stores.get(name)!;

  return {
    /**
     * Prueft ob ein Request fuer den gegebenen Key erlaubt ist.
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
 * Hilfsfunktion: IP-Adresse aus NextRequest extrahieren.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  // Fallback - im Prod hinter Reverse Proxy immer x-forwarded-for nutzen
  return "unknown";
}
