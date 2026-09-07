/**
 * Tests: Begrenzung der Aufrufhaeufigkeit (src/lib/rate-limit.ts)
 *
 * Schwerpunkt ist die Wahl des Schluessels. Nimmt getClientIp den falschen
 * Eintrag aus X-Forwarded-For, sind saemtliche Bremsen wirkungslos -- der
 * Aufrufer sucht sich pro Versuch einen neuen Zaehler aus. Dieselbe Funktion
 * liefert auch die IP fuer die Protokolle, also haengt daran zusaetzlich die
 * Beweiskraft der Wahrheitsversicherung.
 *
 * Fuer die Protokolle gibt es `getClientIpOrNull`: gleicher Leseweg, aber
 * `null` statt "unknown", weil ein nullable Nachweisfeld lieber leer bleibt,
 * als eine Ersatzzeichenkette zu tragen. Die Faelle unten halten beides fest —
 * und dass der frei setzbare `X-Real-IP` in keiner der beiden Fassungen zaehlt.
 *
 * Zweiter Schwerpunkt ist der Aufraeumer: Er entscheidet, wann ein Eimer
 * vergessen wird — und "vergessen" heisst hier "wieder randvoll". Solange die
 * Schwelle fest bei 10 Minuten stand, hat er das Stundenfenster des
 * Dokumentenpaket-Versands regelmaessig aufgefuellt und aus 60 Versendungen je
 * Stunde rund 198 gemacht. Die Faelle unten halten beide Richtungen fest: das
 * lange Fenster ueberlebt die Pause, das kurze wird weiter exakt nach 10
 * Minuten geraeumt.
 */

import {
  aufraeumSchwelleFuer,
  createRateLimiter,
  getClientIp,
  getClientIpOrNull,
  MINDEST_AUFRAEUM_SCHWELLE_MS,
} from "@/lib/rate-limit";

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

  it("vertraut X-Real-IP NICHT und bleibt bei 'unknown'", () => {
    // Vor dem Portal steht ein blankes `reverse_proxy`, das nur
    // X-Forwarded-For schreibt. Ein X-Real-IP kaeme also ausschliesslich vom
    // Aufrufer — der Zaehlerschluessel darf sich davon nicht bewegen lassen.
    expect(getClientIp(anfrage({ "x-real-ip": "8.8.8.8" }))).toBe("unknown");
  });

  it("laesst sich auch mit einem blossen Headers-Objekt aufrufen", () => {
    // Der Weg, den eine Server-Komponente braucht: dort gibt es nur
    // `await headers()` und gar kein Request-Objekt.
    expect(getClientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe(
      "203.0.113.9"
    );
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});

describe("getClientIpOrNull", () => {
  it("nimmt den LETZTEN Eintrag, nicht den ersten", () => {
    // Der Kern des Befunds: Die vom Aufrufer vorgesetzte, frei erfundene
    // Adresse gewinnt nicht mehr — es zaehlt, was der eigene Proxy angehaengt
    // hat.
    expect(
      getClientIpOrNull(anfrage({ "x-forwarded-for": "8.8.8.8, 203.0.113.9" }))
    ).toBe("203.0.113.9");
  });

  it("gibt null zurueck, wenn der Header fehlt", () => {
    // Das nullable Protokollfeld bleibt dann leer, statt eine Ersatz-
    // zeichenkette zu bekommen, die spaeter wie ein Messwert aussieht.
    expect(getClientIpOrNull(anfrage())).toBeNull();
  });

  it("gibt null bei leerer oder nur aus Trennern bestehender Kette zurueck", () => {
    expect(getClientIpOrNull(anfrage({ "x-forwarded-for": "" }))).toBeNull();
    expect(getClientIpOrNull(anfrage({ "x-forwarded-for": " , " }))).toBeNull();
  });

  it("vertraut X-Real-IP NICHT", () => {
    // Der wichtigste neue Fall: Er haelt fest, dass der frei setzbare Header
    // nicht mehr ins Protokoll durchschlaegt, und faellt sofort um, wenn
    // jemand den Rueckfall wieder einbaut.
    expect(getClientIpOrNull(anfrage({ "x-real-ip": "8.8.8.8" }))).toBeNull();
  });

  it("laesst sich auch mit einem blossen Headers-Objekt aufrufen", () => {
    expect(
      getClientIpOrNull(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))
    ).toBe("203.0.113.9");
    expect(getClientIpOrNull(new Headers())).toBeNull();
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

// =============================================
// Der Aufraeumer
// =============================================

type RateLimitModul = typeof import("@/lib/rate-limit");

/**
 * Laedt das Modul FRISCH, waehrend die gestellten Uhren schon laufen.
 *
 * WARUM der Umweg noetig ist: Der Aufraeum-Timer entsteht beim Laden des
 * Moduls (`setInterval` auf Modulebene). Die oben importierte Fassung wurde vom
 * Testlaeufer mit ECHTEN Uhren geladen, ihr Timer haengt an der echten Zeit —
 * `jest.advanceTimersByTime` erreicht ihn nie, und der Aufraeumer liefe im Test
 * schlicht nicht. Erst ein Laden NACH `useFakeTimers()` haengt ihn an die
 * gestellte Uhr. `isolateModules` gibt jedem Fall ausserdem eigene Speicher,
 * sodass sich die Faelle nicht gegenseitig Eintraege wegraeumen.
 *
 * Nebenbei ist das der Beleg, dass `unref()` weiter durchgeht: Es wird bei
 * jedem dieser Ladevorgaenge auf dem gestellten Timer aufgerufen, und der
 * Aufraeumer feuert trotzdem.
 */
function ladeModulMitGestelltenUhren(): RateLimitModul {
  let modul: RateLimitModul | undefined;
  jest.isolateModules(() => {
    modul = require("@/lib/rate-limit") as RateLimitModul;
  });
  return modul!;
}

describe("Aufraeumer", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("schenkt einem Stundenfenster nach einer Pause KEINEN vollen Eimer", () => {
    // Der Befund in Reinform. Vorher loeschte der Aufraeumer den Eintrag nach
    // 10 Minuten Ruhe, und die naechste Anfrage traf auf "kein Eintrag" — also
    // auf einen randvollen Eimer. Wer 7 Minuten sendet und 14 Minuten pausiert,
    // bekam den Zaehler damit dauerhaft geschenkt: rund 198 Versendungen je
    // Stunde statt 60.
    jest.useFakeTimers();
    const { createRateLimiter: erzeuge } = ladeModulMitGestelltenUhren();
    const limiter = erzeuge("test-stundenfenster", {
      maxRequests: 60,
      windowMs: 60 * 60_000,
    });

    // t=0: Das Stundenkontingent ist aufgebraucht.
    for (let i = 0; i < 60; i++) {
      expect(limiter.check("u1").allowed).toBe(true);
    }
    expect(limiter.check("u1").allowed).toBe(false);

    // 21 Minuten Ruhe. Der Aufraeumer tickt dabei viermal (Minute 5, 10, 15,
    // 20); ab Minute 15 galt der Eintrag frueher als "zu alt" und flog raus.
    jest.advanceTimersByTime(21 * 60_000);

    // 21 von 60 Minuten sind vorbei, also sind exakt 21 Token nachgefuellt —
    // einen davon verbraucht diese Anfrage. Mit dem alten Aufraeumer stuende
    // hier 59: der volle Eimer eines frisch angelegten Eintrags.
    const nachDerPause = limiter.check("u1");
    expect(nachDerPause.allowed).toBe(true);
    expect(nachDerPause.remaining).toBe(20);
  });

  it("raeumt kurze Fenster weiterhin exakt nach 10 Minuten Ruhe", () => {
    // Die Regressionsprobe: Login, Token, allgemeine API und die
    // Minutenbremsen duerfen sich NICHT anders verhalten als vorher. Bei ihnen
    // ist der Eimer nach 10 Minuten ohnehin voll, das Raeumen ist also
    // folgenlos — sichtbar wird der Unterschied nur an der Speichergroesse.
    jest.useFakeTimers();
    const { createRateLimiter: erzeuge, speicherGroesse } = ladeModulMitGestelltenUhren();
    const limiter = erzeuge("test-kurzes-fenster", {
      maxRequests: 5,
      windowMs: 60_000,
    });
    limiter.check("a");
    expect(speicherGroesse("test-kurzes-fenster")).toBe(1);

    // Tick bei Minute 10: 600_000 > 600_000 ist falsch, der Eintrag bleibt —
    // genau die Grenze, die vorher galt.
    jest.advanceTimersByTime(10 * 60_000);
    expect(speicherGroesse("test-kurzes-fenster")).toBe(1);

    // Naechster Tick bei Minute 15: jetzt ist die Schwelle ueberschritten.
    jest.advanceTimersByTime(5 * 60_000);
    expect(speicherGroesse("test-kurzes-fenster")).toBe(0);
  });

  it("raeumt auch das Stundenfenster auf — nur eben erst nach einer Stunde", () => {
    // Die Kehrseite der Behebung: Der Speicher darf nicht unbegrenzt wachsen.
    // Ein Eintrag, der eine volle Stunde in Ruhe war, ist rechnerisch wieder
    // voll und kostet nur noch Speicher.
    jest.useFakeTimers();
    const { createRateLimiter: erzeuge, speicherGroesse } = ladeModulMitGestelltenUhren();
    const limiter = erzeuge("test-stundenspeicher", {
      maxRequests: 60,
      windowMs: 60 * 60_000,
    });
    limiter.check("u1");

    // Tick bei Minute 60: 3_600_000 > 3_600_000 ist falsch, also noch da.
    jest.advanceTimersByTime(60 * 60_000);
    expect(speicherGroesse("test-stundenspeicher")).toBe(1);

    jest.advanceTimersByTime(5 * 60_000);
    expect(speicherGroesse("test-stundenspeicher")).toBe(0);
  });

  it("nimmt bei doppelt vergebenem Namen die laengere Schwelle", () => {
    // Zwei Limiter unter demselben Namen teilen sich die Eintraege. Dann muss
    // das laengere Fenster die Schwelle bestimmen: Die kuerzere wuerde die
    // Eintraege des laengeren zu frueh wegwerfen und ihm volle Eimer schenken.
    jest.useFakeTimers();
    const { createRateLimiter: erzeuge, speicherGroesse } = ladeModulMitGestelltenUhren();
    const stunde = erzeuge("test-doppelt", { maxRequests: 60, windowMs: 60 * 60_000 });
    // Die zweite Anmeldung mit dem kurzen Fenster darf die Schwelle nicht
    // wieder auf 10 Minuten druecken.
    erzeuge("test-doppelt", { maxRequests: 5, windowMs: 60_000 });
    stunde.check("u1");

    jest.advanceTimersByTime(21 * 60_000);
    expect(speicherGroesse("test-doppelt")).toBe(1);
  });
});

describe("aufraeumSchwelleFuer", () => {
  it("laesst alle Fenster bis 10 Minuten bei der bisherigen Schwelle", () => {
    // Die Zahlen sind die real konfigurierten Fenster: Login (1 min), Magic
    // Link (1 min), allgemeine API (1 min), PDF-Exporte (1 min) und die
    // Minutenbremse des Dokumentenpakets. Fuer sie alle muss exakt der Wert
    // herauskommen, der frueher fest im Aufraeumer stand.
    expect(MINDEST_AUFRAEUM_SCHWELLE_MS).toBe(10 * 60 * 1000);
    for (const windowMs of [1_000, 60_000, 5 * 60_000, 10 * 60_000]) {
      expect(aufraeumSchwelleFuer({ maxRequests: 5, windowMs })).toBe(
        MINDEST_AUFRAEUM_SCHWELLE_MS
      );
    }
  });

  it("zieht bei laengeren Fenstern mit", () => {
    // login-email (10 Versuche je 15 Minuten) hatte denselben Fehler, nur
    // milder; und das Stundenfenster des Dokumentenpaket-Versands ist der
    // Anlass dieser Behebung.
    expect(aufraeumSchwelleFuer({ maxRequests: 10, windowMs: 15 * 60_000 })).toBe(
      15 * 60_000
    );
    expect(aufraeumSchwelleFuer({ maxRequests: 60, windowMs: 60 * 60_000 })).toBe(
      60 * 60_000
    );
  });
});
