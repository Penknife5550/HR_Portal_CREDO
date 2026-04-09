/**
 * Tests fuer src/lib/token-hash.ts
 *
 * Trivial, aber wichtig als Regression-Guard:
 * Wenn jemand das Encoding aendert (z.B. base64 statt hex),
 * brechen alle Magic-Link-Routes still — diese Tests fangen das ab.
 */

import { hashToken } from "@/lib/token-hash";

describe("hashToken", () => {
  it("ist idempotent (gleicher Input → gleicher Hash)", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("liefert unterschiedliche Hashes fuer unterschiedliche Inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("liefert 64 Hex-Zeichen (SHA-256)", () => {
    const h = hashToken("foo");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verarbeitet leeren String", () => {
    const h = hashToken("");
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("verarbeitet UUID-aehnliche Tokens", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const h = hashToken(uuid);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toBe(uuid); // sicher kein Klartext
  });

  it("ist case-sensitiv", () => {
    expect(hashToken("ABC")).not.toBe(hashToken("abc"));
  });

  it("verarbeitet sehr lange Strings ohne Crash", () => {
    const long = "x".repeat(10_000);
    const h = hashToken(long);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
