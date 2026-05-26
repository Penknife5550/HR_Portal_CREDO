/**
 * CREDO HR-Portal – Zentraler API-Handler
 *
 * Reduziert Boilerplate in allen API-Routes:
 * - Auth-Check (Session + Rollen-Validierung)
 * - Body-Parsing + Zod-Validierung
 * - Error-Handling mit Logging
 * - Konsistente Fehler-Responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ZodSchema } from "zod";

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface HandlerOptions {
  /** Erlaubte Rollen. Wenn leer/undefined, jeder authentifizierte User */
  roles?: string[];
  /** Wenn true, kein Auth erforderlich (z.B. Magic-Links) */
  public?: boolean;
  /** Zod-Schema für Request-Body-Validierung */
  bodySchema?: ZodSchema;
  /** Label für Error-Logs */
  logLabel?: string;
}

interface HandlerContext<T = unknown> {
  request: NextRequest;
  session: SessionPayload;
  body: T;
  params: Record<string, string>;
}

/** Fuer public Endpoints (keine Session) */
interface PublicHandlerContext<T = unknown> {
  request: NextRequest;
  session: null;
  body: T;
  params: Record<string, string>;
}

type HandlerFn<T = unknown> = (
  ctx: HandlerContext<T> | PublicHandlerContext<T>
) => Promise<NextResponse>;

/**
 * Erstellt einen API-Route-Handler mit automatischem:
 * - Auth-Check (Session + Rollen-Validierung)
 * - Body-Parsing + Zod-Validierung
 * - Error-Handling mit Logging
 * - Konsistente Fehler-Responses
 */
export function apiHandler<T = unknown>(
  options: HandlerOptions,
  handler: HandlerFn<T>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      // Params aufloesen (Next.js 15 async params)
      const params = context.params ? await context.params : {};

      // Auth-Check (uebersprungen für public Endpoints)
      let session: SessionPayload | null = null;
      if (!options.public) {
        session = await getSession();
        if (!session) {
          return NextResponse.json(
            { error: "Nicht authentifiziert" },
            { status: 401 }
          );
        }
        if (options.roles && options.roles.length > 0) {
          if (!options.roles.includes(session.role)) {
            return NextResponse.json(
              { error: "Keine Berechtigung" },
              { status: 403 }
            );
          }
        }
      }

      // Body-Parsing + Validierung
      let body: T = undefined as T;
      if (options.bodySchema) {
        const rawBody = await request.json().catch(() => null);
        if (rawBody === null) {
          return NextResponse.json(
            { error: "Ungültiger Request-Body" },
            { status: 400 }
          );
        }
        const parsed = options.bodySchema.safeParse(rawBody);
        if (!parsed.success) {
          const firstError = parsed.error.errors[0];
          return NextResponse.json(
            { error: firstError.message },
            { status: 400 }
          );
        }
        body = parsed.data as T;
      }

      // Handler ausfuehren
      return await handler({
        request,
        session: session as SessionPayload & null,
        body,
        params,
      });
    } catch (error) {
      const label = options.logLabel || "API";
      console.error(`[${label}] Fehler:`, error);
      return NextResponse.json(
        { error: "Interner Serverfehler" },
        { status: 500 }
      );
    }
  };
}

/** Shortcut: Authentifizierter Handler für Admin-Rollen (SUPER_ADMIN, HR_LEITUNG) */
export function adminHandler<T = unknown>(
  handler: HandlerFn<T>,
  options?: Partial<HandlerOptions>
) {
  return apiHandler<T>(
    {
      roles: ["SUPER_ADMIN", "HR_LEITUNG"],
      ...options,
    },
    handler
  );
}

/** Shortcut: Authentifizierter Handler für alle HR-Rollen */
export function authHandler<T = unknown>(
  handler: HandlerFn<T>,
  options?: Partial<HandlerOptions>
) {
  return apiHandler<T>(
    {
      roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
      ...options,
    },
    handler
  );
}

/** Shortcut: Public Handler (kein Auth erforderlich) */
export function publicHandler<T = unknown>(
  handler: HandlerFn<T>,
  options?: Partial<HandlerOptions>
) {
  return apiHandler<T>(
    {
      public: true,
      ...options,
    },
    handler
  );
}
