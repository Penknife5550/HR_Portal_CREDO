/**
 * Tests: Ausstellen und Pruefen der Sitzungs-Token (src/lib/auth.ts)
 *
 * Der Anlass ist ein Fehler, der lange unbemerkt lief: verifySessionToken gab
 * das rohe JWT-Payload zurueck, also samt der Standardansprueche `iat` und
 * `exp`. Der Cast auf SessionPayload verbarg das vor TypeScript. Sobald dieses
 * Objekt wieder in createSessionToken ging — genau das tut GET /api/auth, um
 * die Sitzung zu verlaengern —, warf jsonwebtoken, der Endpunkt antwortete 500
 * und die Sitzung lief unangekuendigt ab.
 *
 * Deshalb pruefen diese Tests nicht nur "Token rein, Payload raus", sondern
 * ausdruecklich den Rundlauf: Was verifySessionToken liefert, muss wieder
 * signierbar sein.
 */

process.env.JWT_SECRET = "test-secret-mit-ausreichender-laenge-1234567890";

import jwt from "jsonwebtoken";
import { createSessionToken, verifySessionToken } from "@/lib/auth";

const SITZUNG = {
  userId: "u-1",
  email: "anna@example.de",
  role: "HR_SACHBEARBEITER",
  firstName: "Anna",
  lastName: "Beispiel",
};

describe("createSessionToken / verifySessionToken", () => {
  it("gibt die Sitzungsdaten unveraendert zurueck", () => {
    expect(verifySessionToken(createSessionToken(SITZUNG))).toEqual(SITZUNG);
  });

  it("liefert genau die fuenf eigenen Felder — keine JWT-Standardansprueche", () => {
    const geprueft = verifySessionToken(createSessionToken(SITZUNG));
    expect(Object.keys(geprueft!).sort()).toEqual([
      "email",
      "firstName",
      "lastName",
      "role",
      "userId",
    ]);
    expect(geprueft).not.toHaveProperty("iat");
    expect(geprueft).not.toHaveProperty("exp");
  });

  it("laesst sich erneut signieren — das ist die Sitzungsverlaengerung", () => {
    // Der eigentliche Regressionstest. Vorher warf diese Zeile
    // "payload already has an 'exp' property", und GET /api/auth antwortete 500.
    const geprueft = verifySessionToken(createSessionToken(SITZUNG))!;
    expect(() => createSessionToken(geprueft)).not.toThrow();
    expect(verifySessionToken(createSessionToken(geprueft))).toEqual(SITZUNG);
  });

  it("ueberlebt mehrere Verlaengerungen hintereinander", () => {
    let token = createSessionToken(SITZUNG);
    for (let i = 0; i < 5; i++) {
      const geprueft = verifySessionToken(token);
      expect(geprueft).toEqual(SITZUNG);
      token = createSessionToken(geprueft!);
    }
  });

  it("weist einen Token mit falscher Unterschrift ab", () => {
    const fremd = jwt.sign(SITZUNG, "ein-ganz-anderes-geheimnis", {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    expect(verifySessionToken(fremd)).toBeNull();
  });

  it("weist einen abgelaufenen Token ab", () => {
    const abgelaufen = jwt.sign(SITZUNG, process.env.JWT_SECRET!, {
      algorithm: "HS256",
      expiresIn: "-1s",
    });
    expect(verifySessionToken(abgelaufen)).toBeNull();
  });

  it("weist einen Token ohne Unterschrift ab (alg: none)", () => {
    // Der klassische Angriff: Algorithmus auf "none" setzen und hoffen, dass
    // die Pruefung ihn akzeptiert. jwt.verify bekommt eine Allowlist, deshalb
    // darf das nie durchgehen.
    const ohne = jwt.sign(SITZUNG, "", { algorithm: "none" });
    expect(verifySessionToken(ohne)).toBeNull();
  });

  it("weist Unfug ab, statt zu werfen", () => {
    for (const wert of ["", "kein.jwt.hier", "abc"]) {
      expect(verifySessionToken(wert)).toBeNull();
    }
  });
});
