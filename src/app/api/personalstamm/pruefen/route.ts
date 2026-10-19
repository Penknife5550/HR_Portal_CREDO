/**
 * API: Personalstamm aus DokuBit — „Zu prüfen" (Self-Service, Paket S0)
 *
 * GET /api/personalstamm/pruefen
 *   → { data: { nichtGeliefert, meldungen, abgewieseneAnmeldungen, letzterLauf, hinweis } }
 *
 * Nur lesen, nur die HR-Rollen (authHandler, ohne SERVICE): Die Antwort nennt
 * Namen nicht gelieferter Personen. Mandantenbeschraenkte Rollen sperrt
 * bereits die Middleware (MANDANTEN_API_ALLOWLIST).
 * Rechnung in src/lib/personalstamm/pruefen.ts.
 */

import { NextResponse } from "next/server";
import { authHandler } from "@/lib/api-handler";
import { personalstammPruefen } from "@/lib/personalstamm/pruefen";

export const GET = authHandler(
  async () => {
    const data = await personalstammPruefen();
    return NextResponse.json({ data });
  },
  { logLabel: "Personalstamm Pruefen GET" },
);
