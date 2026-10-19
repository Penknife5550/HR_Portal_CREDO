/**
 * API: /api/webhooks/personalstamm
 *
 * POST – Stammabgleich aus DokuBit (Self-Service, Paket S0). n8n liest die
 * Vertragszeilen per SQL und schickt sie in Stapeln hierher, einen nach dem
 * anderen (Schleife „Loop Over Items", docs/module/selfservice/s0-personalstamm-n8n.md).
 *
 * Auth: Bearer PERSONALSTAMM_SECRET (eigenes Geheimnis, NICHT CRON_SECRET),
 * zeitkonstant verglichen. Fehlt es, ist es kuerzer als 24 Zeichen oder
 * gleich CRON_SECRET -> 500 „Konfigurationsfehler“; falscher/fehlender
 * Header -> 401.
 *
 * Body: EIN Eintrag (Objekt) oder ein Stapel (Array, max. 200), hoechstens
 * 1 MiB. Unlesbar / kein Objekt -> 400, leer -> 400, zu viele -> 400,
 * zu gross -> 413.
 *
 * Die Logik je Zeile (Vertrag, Person, Stilllegung, Lauf-Protokoll) liegt in
 * src/lib/personalstamm/abgleich.ts; die Route reicht nur durch.
 *
 * Antwort: immer HTTP 200 mit { success, summary, results } wie der
 * Vertragsende-Webhook — Zeilenfehler brechen den Stapel NICHT ab. Antwort
 * und Log enthalten keine Namen und keine Adressen.
 */

import { NextRequest, NextResponse } from "next/server";
import { PERSONALSTAMM_MAX_STAPEL } from "@/lib/constants";
import { gleichZeitkonstant } from "@/lib/laeufe/cron-anmeldung";
import { fehlerCode, leseBodyBegrenzt } from "@/lib/file-upload";
import { personalstammAbgleichen } from "@/lib/personalstamm/abgleich";

// Technische Grenze wie bei den neueren Cron-Routen (`mindestLaenge: 24`).
const MIN_SECRET_LAENGE = 24;

// Ein voller Stapel (200 Zeilen) bleibt weit darunter; die Grenze schuetzt
// den Speicher, denn request.json() selbst liest unbegrenzt.
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err) {
    // Nur Name und Code: Prisma-Fehler tragen sonst Datenwerte ins Log.
    const name = err instanceof Error ? err.name : typeof err;
    console.error("[personalstamm] Schwerer Fehler:", name, fehlerCode(err) ?? "-");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

async function handlePost(request: NextRequest) {
  const secret = process.env.PERSONALSTAMM_SECRET;
  if (!secret || secret.length < MIN_SECRET_LAENGE) {
    console.error("[personalstamm] PERSONALSTAMM_SECRET fehlt oder ist zu kurz");
    return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
  }
  // Sonst oeffnete das Notfall-Geheimnis der Cron-Routen auch diesen Eingang.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && gleichZeitkonstant(secret, cronSecret)) {
    console.error("[personalstamm] PERSONALSTAMM_SECRET ist gleich CRON_SECRET");
    return NextResponse.json({ error: "Konfigurationsfehler" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!gleichZeitkonstant(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const roh = await leseBodyBegrenzt(request, MAX_BODY_BYTES);
  if (!roh.ok && roh.status === 413) {
    return NextResponse.json(
      { error: `Request-Body zu groß (maximal ${MAX_BODY_BYTES / (1024 * 1024)} MiB)` },
      { status: 413 },
    );
  }
  let body: unknown = null;
  if (roh.ok) {
    try {
      body = JSON.parse(roh.buffer.toString("utf8"));
    } catch {
      body = null;
    }
  }
  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const eintraege: unknown[] = Array.isArray(body) ? body : [body];
  if (eintraege.length === 0) {
    return NextResponse.json({ error: "Leerer Stapel" }, { status: 400 });
  }
  if (eintraege.length > PERSONALSTAMM_MAX_STAPEL) {
    return NextResponse.json(
      { error: `Maximal ${PERSONALSTAMM_MAX_STAPEL} Einträge pro Aufruf` },
      { status: 400 },
    );
  }

  const ergebnis = await personalstammAbgleichen(eintraege);
  return NextResponse.json(ergebnis);
}
