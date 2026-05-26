/**
 * CREDO HR-Portal – Auth-Modul
 *
 * Zwei Auth-Mechanismen:
 * 1. HR-Login: E-Mail + Passwort → JWT Session Cookie
 * 2. Magic-Link: Unique Token per E-Mail (für neue MA + Vorgesetzte)
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "./db";

/**
 * Lazy JWT_SECRET-Initialisierung.
 * Wird erst beim ersten Aufruf validiert, nicht beim Import/Build.
 * So kann Next.js die API-Routes waehrend `next build` kompilieren,
 * ohne dass die Umgebungsvariablen-Pruefung fehlschlaegt.
 */
let _jwtSecret: string | null = null;

function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "FATAL: JWT_SECRET ist nicht konfiguriert. " +
      "Bitte setzen Sie die Umgebungsvariable JWT_SECRET mit einem sicheren Zufallswert (min. 32 Zeichen)."
    );
  }
  // Warnung bei schwachem Secret in Produktion
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    console.error(
      "SECURITY WARNING: JWT_SECRET ist zu kurz (< 32 Zeichen). " +
      "Bitte verwenden Sie einen sicheren Zufallswert mit mindestens 32 Zeichen."
    );
  }
  // Bekannte Dev-Secrets in Produktion verhindern
  const KNOWN_DEV_SECRETS = ["dev_secret", "secret", "test", "changeme"];
  if (
    process.env.NODE_ENV === "production" &&
    KNOWN_DEV_SECRETS.some((ds) => secret.toLowerCase().includes(ds))
  ) {
    throw new Error(
      "FATAL: JWT_SECRET enthaelt ein bekanntes Dev-Secret. " +
      "In Produktion muss ein sicherer Zufallswert verwendet werden."
    );
  }
  _jwtSecret = secret;
  return _jwtSecret;
}
const SESSION_COOKIE = "credo_session";
const SESSION_EXPIRY = 60 * 60 * 24 * 7; // 7 Tage in Sekunden

// =============================================
// JWT Session Management
// =============================================

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export function createSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: SESSION_EXPIRY,
    algorithm: "HS256",
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    }) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  // 1. API-Key-Auth für n8n Service-Calls (X-API-Key Header)
  const configuredKey = process.env.N8N_API_KEY;
  if (configuredKey) {
    const headerStore = await headers();
    const apiKey = headerStore.get("x-api-key");
    if (
      apiKey &&
      apiKey.length === configuredKey.length &&
      crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(configuredKey))
    ) {
      return {
        userId: "n8n-service",
        email: "n8n@credo-gruppe.de",
        role: "SERVICE",
        firstName: "n8n",
        lastName: "Service",
      };
    }
  }

  // 2. Standard Cookie-Session
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_EXPIRY,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// =============================================
// HR-Login (E-Mail + Passwort)
// =============================================

export async function authenticateUser(
  email: string,
  password: string
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { email, isActive: true },
  });

  if (!user) return null;

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) return null;

  // Login-Zeitpunkt aktualisieren
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

// =============================================
// Magic-Link Validierung
// =============================================

export async function validateMagicToken(token: string, options?: { allowSubmitted?: boolean }) {
  const onboarding = await prisma.onboardingProcess.findUnique({
    where: { token },
    include: {
      organization: true,
      personalData: true,
    },
  });

  if (!onboarding) return { valid: false, reason: "Token nicht gefunden" };
  if (onboarding.tokenExpiresAt < new Date())
    return { valid: false, reason: "Token abgelaufen" };
  if (onboarding.status === "EXPIRED")
    return { valid: false, reason: "Vorgang abgelaufen" };
  if (onboarding.status === "COMPLETED")
    return { valid: false, reason: "Vorgang bereits abgeschlossen" };
  // SUBMITTED-Status blockiert schreibende Operationen (PUT/POST/DELETE)
  // GET-Anfragen koennen allowSubmitted: true setzen, um Daten noch anzuzeigen
  if (onboarding.status === "SUBMITTED" && !options?.allowSubmitted)
    return { valid: false, reason: "Fragebogen wurde bereits eingereicht" };

  return { valid: true, onboarding };
}

export async function validateSupervisorToken(token: string, options?: { allowSubmitted?: boolean }) {
  const onboarding = await prisma.onboardingProcess.findFirst({
    where: { supervisorToken: token },
    include: {
      organization: true,
      supervisorData: true,
      personalData: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!onboarding) return { valid: false, reason: "Token nicht gefunden" };
  if (
    !onboarding.supervisorTokenExpiresAt ||
    onboarding.supervisorTokenExpiresAt < new Date()
  )
    return { valid: false, reason: "Token abgelaufen" };
  if (onboarding.status === "COMPLETED")
    return { valid: false, reason: "Vorgang bereits abgeschlossen" };
  if (onboarding.status === "EXPIRED")
    return { valid: false, reason: "Vorgang abgelaufen" };
  // Bereits eingereichte Supervisor-Daten: Schreibzugriff verhindern (GET kann erlaubt werden)
  if (
    (onboarding.status === "SUPERVISOR_SUBMITTED" || onboarding.status === "REVIEWED") &&
    !options?.allowSubmitted
  )
    return { valid: false, reason: "Modalitaeten wurden bereits eingereicht" };

  return { valid: true, onboarding };
}

// =============================================
// Magic-Link Generierung
// =============================================

export function generateToken(): string {
  // UUID v4 als Token (kryptographisch sicher)
  return crypto.randomUUID();
}

export function getTokenExpiryDate(): Date {
  const hours = parseInt(process.env.MAGIC_LINK_EXPIRY_HOURS || "720");
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
