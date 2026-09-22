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
import {
  darfMitarbeiterSchreiben,
  darfVorgesetzteSchreiben,
  mitarbeiterAbgesendet,
  vorgesetzteAbgesendet,
} from "./onboarding-spuren";

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
    const roh = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    }) as SessionPayload & { iat?: number; exp?: number };

    // NUR die eigenen Felder zurueckgeben. jwt.verify liefert zusaetzlich die
    // Standardansprueche `iat` und `exp` mit; der Cast auf SessionPayload hat
    // sie bisher nur vor TypeScript versteckt, zur Laufzeit waren sie da.
    //
    // Folge: GET /api/auth reichte dieses Objekt an createSessionToken weiter,
    // also an jwt.sign(payload, secret, { expiresIn }) — und jsonwebtoken
    // wirft dann "payload already has an 'exp' property". Die
    // Sitzungsverlaengerung hat deshalb nie funktioniert: Der Endpunkt
    // antwortete immer 500, die Sitzung lief unangekuendigt ab und riss
    // laufende Formulareingaben mit.
    return {
      userId: roh.userId,
      email: roh.email,
      role: roh.role,
      firstName: roh.firstName,
      lastName: roh.lastName,
    };
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
  // Schreibsperre (PUT, POST, Dokumente hochladen/aendern/loeschen). GET-
  // Anfragen setzen allowSubmitted: true, um die Angaben weiter anzuzeigen.
  //
  // Die Sperre haengt an der EIGENEN Spur (`submittedAt`, siehe
  // onboarding-spuren.ts), nicht am Vorgangsstatus. Frueher sperrte hier nur
  // `status === "SUBMITTED"` — mit zwei Folgen:
  //   - Sobald HR den Vorgesetzten-Link erzeugte (SUPERVISOR_PENDING) oder
  //     prueft (REVIEWED), war der Link nach dem eigenen Absenden wieder
  //     beschreibbar. Die Pruefsumme der abgegebenen Erklaerung passte danach
  //     nicht mehr zu den gespeicherten Angaben.
  //   - Umgekehrt haengt der Status seit dem parallelen Ablauf auch an der
  //     Fuehrungskraft; ein statusbasiertes Gate sperrte eine Person, die
  //     selbst noch gar nichts abgesendet hat.
  if (!options?.allowSubmitted && !darfMitarbeiterSchreiben(onboarding)) {
    return {
      valid: false,
      reason: mitarbeiterAbgesendet(onboarding)
        ? "Fragebogen wurde bereits eingereicht"
        : "Vorgang wurde bereits geprüft",
    };
  }

  return { valid: true, onboarding };
}

export async function validateSupervisorToken(token: string, options?: { allowSubmitted?: boolean }) {
  const onboarding = await prisma.onboardingProcess.findFirst({
    where: { supervisorToken: token },
    include: {
      organization: true,
      // Die Kostenstellen-Zeilen gehoeren zwingend dazu: Die GET-Route reicht
      // `supervisorData` unveraendert an das Formular weiter, und die Maske
      // stellt ihre Tabelle daraus wieder her. Ohne das `include` kaeme sie
      // beim zweiten Oeffnen leer zurueck — die Aufteilung waere gespeichert,
      // aber unsichtbar, und der naechste Klick auf "Weiter" ueberschriebe sie
      // mit nichts. Die POST-Route prueft aus derselben Quelle, ob die Anteile
      // 100 Prozent ergeben.
      supervisorData: {
        include: { kostenstellen: { orderBy: { orderIndex: "asc" } } },
      },
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
  // Schreibsperre an der EIGENEN Spur (`supervisorSubmittedAt`, Altfall
  // `supervisorData.isComplete`), nicht am Status: Seit beide Links parallel
  // laufen, sagt der Status nichts mehr darueber, ob die Fuehrungskraft selbst
  // abgesendet hat. Frueher sperrte hier `SUPERVISOR_SUBMITTED` — der Status
  // gilt jetzt erst, wenn BEIDE Spuren eingereicht sind. Hat die Fuehrungskraft
  // zuerst abgesendet, bliebe ihr Link sonst beschreibbar.
  if (!options?.allowSubmitted && !darfVorgesetzteSchreiben(onboarding)) {
    return {
      valid: false,
      reason: vorgesetzteAbgesendet(onboarding)
        ? "Die Einstellungsmodalitäten wurden bereits eingereicht"
        : "Vorgang wurde bereits geprüft",
    };
  }

  return { valid: true, onboarding };
}

// =============================================
// Magic-Link Generierung
// =============================================

export function generateToken(): string {
  // UUID v4 als Token (kryptographisch sicher)
  return crypto.randomUUID();
}

/** Standard-Gueltigkeit eines Magic Links: 30 Tage. */
const MAGIC_LINK_STANDARD_STUNDEN = 720;

/**
 * Wie lange ein neu erzeugter Magic Link gilt, in Millisekunden
 * (`MAGIC_LINK_EXPIRY_HOURS`, Standard 720 h).
 *
 * Eigene Funktion, weil nicht nur das Erzeugen die Frist braucht: Der
 * Erinnerungs-Cron rechnet fuer Vorgesetzten-Links aus der Zeit vor
 * `supervisorLinkSentAt` den Erzeugungszeitpunkt zurueck (Ablauf minus
 * Gueltigkeit). Beide Stellen muessen dieselbe Zahl sehen.
 *
 * Ein unlesbarer oder nicht positiver Wert faellt auf den Standard zurueck —
 * frueher entstand daraus ein `Invalid Date`, an dem erst Prisma scheiterte.
 */
export function magicLinkGueltigkeitMs(): number {
  const stunden = parseInt(process.env.MAGIC_LINK_EXPIRY_HOURS || String(MAGIC_LINK_STANDARD_STUNDEN));
  const gueltig = Number.isFinite(stunden) && stunden > 0 ? stunden : MAGIC_LINK_STANDARD_STUNDEN;
  return gueltig * 60 * 60 * 1000;
}

export function getTokenExpiryDate(): Date {
  return new Date(Date.now() + magicLinkGueltigkeitMs());
}
