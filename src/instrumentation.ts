/**
 * Next.js-Instrumentation: laeuft einmal beim Start des Servers.
 *
 * Startet die Uhr des Zeitplaners (src/lib/zeitplaner/uhr.ts) — nur in der
 * Node-Runtime und nie waehrend `next build`. Die Uhr selbst importiert nichts
 * aus dem Portal; sie stoesst jede Minute die Takt-Route an (Begruendung dort).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { zeitplanerUhrStarten } = await import("./lib/zeitplaner/uhr");
  zeitplanerUhrStarten();
}
