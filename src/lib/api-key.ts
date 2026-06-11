/**
 * CREDO HR-Portal – API-Key-Verwaltung (Reporting-API)
 *
 * Keys werden im Format "crk_<48 zufaellige Zeichen>" erzeugt.
 * In der DB liegt nur der SHA-256-Hash; der Klartext wird dem Admin
 * genau einmal bei der Erstellung angezeigt.
 *
 * Authentifizierung externer Aufrufe:
 *   Authorization: Bearer crk_...   ODER   X-API-Key: crk_...
 */

import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/token-hash";

const KEY_PREFIX = "crk_";

export function generateApiKey(): { plaintext: string; keyHash: string; prefix: string } {
  const plaintext = `${KEY_PREFIX}${randomBytes(36).toString("base64url")}`;
  return {
    plaintext,
    keyHash: hashToken(plaintext),
    prefix: plaintext.slice(0, KEY_PREFIX.length + 6),
  };
}

export interface ApiKeyAuthResult {
  ok: boolean;
  keyId?: string;
  name?: string;
  error?: string;
}

/**
 * Prueft den API-Key aus dem Request gegen die DB.
 * Erfolgreiche Nutzung aktualisiert lastUsedAt (fire-and-forget).
 */
export async function authenticateApiKey(
  request: NextRequest,
  requiredScope: string
): Promise<ApiKeyAuthResult> {
  const bearer = request.headers.get("authorization");
  const headerKey = request.headers.get("x-api-key");
  const candidate = bearer?.startsWith("Bearer ")
    ? bearer.slice("Bearer ".length).trim()
    : headerKey?.trim();

  if (!candidate || !candidate.startsWith(KEY_PREFIX)) {
    return { ok: false, error: "Kein API-Key uebergeben" };
  }

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(candidate) },
  });

  if (!record || !record.isActive) {
    return { ok: false, error: "API-Key ungueltig oder deaktiviert" };
  }
  if (!record.scopes.includes(requiredScope)) {
    return { ok: false, error: `API-Key hat keinen Zugriff auf "${requiredScope}"` };
  }

  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { ok: true, keyId: record.id, name: record.name };
}

/**
 * Zugriffspruefung fuer Reporting-Endpunkte:
 * 1. API-Key (crk_...) mit Scope "reports:read"
 * 2. Eingeloggte Portal-Session mit Admin-Rolle
 *    (inkl. SERVICE via Legacy-N8N_API_KEY in getSession)
 *
 * Bewusst KEINE breiteren Rollen: Reports liefern mandantenuebergreifende
 * Daten, daher nur SUPER_ADMIN/HR_LEITUNG bzw. explizite API-Keys.
 */
const REPORT_SESSION_ROLES = ["SUPER_ADMIN", "HR_LEITUNG", "SERVICE"];

export async function authenticateReportAccess(
  request: NextRequest
): Promise<{ ok: boolean; via?: "api-key" | "session"; error?: string; status?: 401 | 403 }> {
  const keyResult = await authenticateApiKey(request, "reports:read");
  if (keyResult.ok) return { ok: true, via: "api-key" };

  // Dynamischer Import vermeidet zyklische Abhaengigkeiten beim Modul-Load
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (session && REPORT_SESSION_ROLES.includes(session.role)) {
    return { ok: true, via: "session" };
  }
  if (session) {
    // Authentifiziert, aber nicht berechtigt → 403 (nicht 401, sonst
    // werfen Clients mit Re-Login-Logik den Nutzer aus der Session)
    return { ok: false, error: "Keine Berechtigung für Auswertungen", status: 403 };
  }

  return {
    ok: false,
    error: keyResult.error ?? "Nicht authentifiziert",
    status: 401,
  };
}
