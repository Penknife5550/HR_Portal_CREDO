/**
 * URL-Helper für das CREDO HR-Portal
 *
 * Zentrale Stelle für Base-URL-Auflösung und SSRF-Prevention.
 * Wurde extrahiert aus drei Stellen, an denen `getBaseUrl()` byte-identisch
 * dupliziert war (cron/reminders, cron/offboarding-reminders, offboarding/department-links).
 */

import { promises as dns } from "dns";
import { isIP } from "net";

/**
 * Base-URL der App.
 *
 * Reihenfolge:
 *   1. NEXT_PUBLIC_APP_URL
 *   2. APP_URL
 *   3. Im Dev-Modus (NODE_ENV !== "production"): http://localhost:3000
 *      → verhindert, dass lokale Dev-Tests Magic-Links mit der Prod-Domain
 *        erzeugen.
 *   4. Production-Default: https://hr.fes-credo.de
 *
 * Der Production-Default ist bewusst hardcoded, damit nicht durch eine fehlende
 * Env-Variable ein Mail-Magic-Link auf eine falsche/leere Domain zeigen kann.
 */
export function getBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return "https://hr.fes-credo.de";
}

/**
 * Prueft, ob eine IP-Adresse (v4 oder v6) in einem privaten/loopback/link-local
 * Bereich liegt. Wird für SSRF-Prevention von ausgehenden Webhook-Calls genutzt.
 */
export function isPrivateAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) {
    return isPrivateIpv4(addr);
  }
  if (family === 6) {
    return isPrivateIpv6(addr);
  }
  // Kein gueltiges IP-Format -> defensiv als "privat" werten,
  // um Surprise-Effekte bei Hostnamen-Edge-Cases zu vermeiden.
  return true;
}

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-Local / Cloud-Metadata wie AWS 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  // ::1 Loopback
  if (lower === "::1") return true;
  // fc00::/7 Unique Local Address
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // fe80::/10 Link-Local
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  return false;
}

/**
 * Prueft per DNS-Lookup, ob ein Hostname auf eine private/loopback/link-local
 * Adresse aufloest. Wird für Webhook-URL-Validierung genutzt (SSRF-Schutz).
 *
 * Liefert true, wenn der Host **sicher** zu sein scheint (kein privater Block).
 * Liefert false, wenn er privat aufloest oder die Auflösung fehlschlaegt.
 */
export async function isPublicHostname(hostname: string): Promise<boolean> {
  // Wenn der Hostname selbst schon eine IP ist, direkt pruefen
  if (isIP(hostname)) {
    return !isPrivateAddress(hostname);
  }

  // localhost-Aliase zentral abdecken
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower === "ip6-localhost" ||
    lower === "ip6-loopback"
  ) {
    return false;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) return false;
    return records.every((r) => !isPrivateAddress(r.address));
  } catch {
    // DNS-Fehler -> defensiv als "nicht oeffentlich" werten
    return false;
  }
}

/**
 * Maskiert sensible URL-Bestandteile für das Logging.
 * Entfernt Query-Parameter (koennen Tokens enthalten) und User-Info.
 *
 * Beispiel: "https://api.example.com/hook?token=secret" -> "https://api.example.com/hook"
 */
export function redactUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}
