/**
 * Tests: Begrenzung der Aufrufhaeufigkeit (src/lib/rate-limit.ts)
 *
 * Schwerpunkt ist die Wahl des Schluessels. Nimmt getClientIp den falschen
 * Eintrag aus X-Forwarded-For, sind saemtliche Bremsen wirkungslos -- der
 * Aufrufer sucht sich pro Versuch einen neuen Zaehler aus. Dieselbe Funktion
 * liefert auch die IP fuer die Protokolle, also haengt daran zusaetzlich die
 * Beweiskraft der Wahrheitsversicherung.
 */

import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

function anfrage(header: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/irgendwas", { headers: header });
}

describe("getClientIp", () => {
  it("nimmt den LETZTEN Eintrag der Kette — den hat der eigene Proxy geschrieben", () => {
    // Caddy haengt die echte Peer-IP hinten an. Alles davor kommt aus dem
    // Header, den der Aufrufer selbst mitgeschickt hat.
    expect(getClientIp(anfrage({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(
      getClientIp(anfrage({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))
    ).toBe("203.0.113.9");
  });

  it("laesst sich nicht durch eine erfundene Kette täuschen", () => {
    // Der Angriff: Der Aufrufer schickt selbst eine Kette mit, um bei jedem
    // Versuch einen frischen Zaehler zu bekommen. Der angehaengte echte Wert
    // bleibt derselbe, also muss auch der Schluessel derselbe bleiben.
    const echte = "203.0.113.9";
    const schluessel = new Set(
      ["8.8.8.8", "9.9.9.9", "10.0.0.1, 10.0.0.2"].map((erfunden) =>
        getClientIp(anfrage({ "x-forwarded-for": `${erfunden}, ${echte}` }))
      )
    );
    expect([...schluessel]).toEqual([echte]);
  });

  it("kommt mit Leerzeichen und leeren Gliedern zurecht", () => {
    expect(getClientIp(anfrage({ "x-forwarded-for": " 1.2.3.4 ,  203.0.113.9  " }))).toBe(
      "203.0.113.9"
    );
    expect(getClientIp(anfrage({ "x-forwarded-for": "1.2.3.4, ,203.0.113.9," }))).toBe(
      "203.0.113.9"
    );
  });

  it("faellt auf 'unknown' zurueck, wenn der Header fehlt oder leer ist", () => {
    expect(getClientIp(anfrage())).toBe("unknown");
    expect(getClientIp(anfrage({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(getClientIp(anfrage({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  it("laesst das Kontingent zu und bremst danach", () => {
    const limiter = createRateLimiter("test-kontingent", {
      maxRequests: 3,
      windowMs: 60_000,
    });
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("203.0.113.1").allowed).toBe(true);
    }
    const gebremst = limiter.check("203.0.113.1");
    expect(gebremst.allowed).toBe(false);
    expect(gebremst.retryAfterMs).toBeGreaterThan(0);
  });

  it("zaehlt je Schluessel getrennt", () => {
    const limiter = createRateLimiter("test-getrennt", {
      maxRequests: 1,
      windowMs: 60_000,
    });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    // Ein anderer Aufrufer darf davon nichts merken.
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("gibt nach Ablauf des Fensters wieder frei", () => {
    jest.useFakeTimers();
    try {
      const limiter = createRateLimiter("test-fenster", {
        maxRequests: 1,
        windowMs: 1_000,
      });
      expect(limiter.check("a").allowed).toBe(true);
      expect(limiter.check("a").allowed).toBe(false);
      jest.advanceTimersByTime(1_100);
      expect(limiter.check("a").allowed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
