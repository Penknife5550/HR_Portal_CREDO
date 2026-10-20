/**
 * `cn()` und die eigenen Groessen-Tokens.
 *
 * tailwind-merge haelt jeden unbekannten Namen fuer eine FARBE. Ein eigenes
 * Groessen-Token (`--shadow-overlay`, `--text-titel`, `--text-2xs`) fiele damit
 * neben einer echten Farbe weg und liesse sich von `shadow-none` nicht
 * ueberschreiben. `src/lib/utils.ts` nennt die Tokens deshalb ausdruecklich.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { cn } from "@/lib/utils";

describe("cn() mit eigenen Tokens", () => {
  it("shadow-overlay ist eine Schattengroesse: Farbe daneben bleibt, shadow-none ueberschreibt", () => {
    expect(cn("shadow-overlay", "shadow-action")).toBe("shadow-overlay shadow-action");
    expect(cn("shadow-action", "shadow-overlay")).toBe("shadow-action shadow-overlay");
    expect(cn("shadow-overlay", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-lg", "shadow-overlay")).toBe("shadow-overlay");
  });

  it("text-titel und text-2xs sind Schriftgroessen, keine Textfarben", () => {
    expect(cn("text-titel", "text-ink")).toBe("text-titel text-ink");
    expect(cn("text-2xs", "text-ink-2")).toBe("text-2xs text-ink-2");
    expect(cn("text-sm", "text-titel")).toBe("text-titel");
    expect(cn("text-ink", "text-ink-2")).toBe("text-ink-2");
  });

  it("tracking-label und tracking-titel ersetzen einander", () => {
    expect(cn("tracking-wide", "tracking-label")).toBe("tracking-label");
    expect(cn("tracking-label", "tracking-titel")).toBe("tracking-titel");
  });

  it("Farb-Tokens verhalten sich wie Farben", () => {
    expect(cn("bg-surface", "bg-card")).toBe("bg-card");
    expect(cn("text-xs", "text-ok")).toBe("text-xs text-ok");
    expect(cn("ring-1 ring-inset ring-hairline")).toBe("ring-1 ring-inset ring-hairline");
    expect(cn("bg-critical", "hover:bg-critical-hover")).toBe("bg-critical hover:bg-critical-hover");
  });

  it("jedes Groessen-Token aus globals.css ist tailwind-merge bekannt", () => {
    // Wer ein --shadow-*, --text-* oder --tracking-* ergaenzt und es in
    // utils.ts vergisst, sieht es hier — nicht erst als fehlenden Schatten.
    const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
    const namen = (praefix: string) =>
      [...css.matchAll(new RegExp(`--${praefix}-([a-z0-9]+):`, "g"))].map((m) => m[1]);
    for (const n of namen("shadow")) expect(cn(`shadow-${n}`, "shadow-none")).toBe("shadow-none");
    for (const n of namen("text")) expect(cn("text-sm", `text-${n}`)).toBe(`text-${n}`);
    for (const n of namen("tracking")) expect(cn("tracking-wide", `tracking-${n}`)).toBe(`tracking-${n}`);
    expect(namen("shadow")).toContain("overlay");
    expect(namen("text")).toEqual(expect.arrayContaining(["titel", "2xs"]));
  });
});
