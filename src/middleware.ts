/**
 * Next.js Middleware
 *
 * Setzt Security-Headers für alle Responses und
 * schuetzt Portal-Routen mit kryptographischer JWT-Validierung.
 * Verwendet 'jose' (Edge-Runtime-kompatibel) statt 'jsonwebtoken'.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { apiZugriffVerweigern } from "@/lib/mandanten-gate";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isDev = process.env.NODE_ENV !== "production";

  // =============================================
  // Security Headers
  // =============================================
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  // HSTS nur in Production und nur wenn APP_URL HTTPS ist.
  // In Dev (oder wenn APP_URL nicht gesetzt) NIEMALS senden, sonst pinnt
  // der Browser localhost auf HTTPS und die Login-Seite ist nicht erreichbar.
  if (!isDev && process.env.APP_URL?.startsWith("https://")) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  // CSP: In Dev-Modus unsafe-eval erlauben (Next.js HMR benoetigt es)
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const connectSrc = isDev
    ? "connect-src 'self' ws://localhost:3000"
    : "connect-src 'self'";

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      connectSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      // upgrade-insecure-requests nur in Produktion (blockiert localhost HTTP)
      ...(process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://")
        ? ["upgrade-insecure-requests"]
        : []),
    ].join("; ")
  );

  // =============================================
  // Portal-Routen: Redirect zu Login wenn keine Session
  // =============================================
  const { pathname } = request.nextUrl;

  // =============================================
  // API-Isolation fuer Rollen mit eingeschraenktem Blick
  //
  // Zwei Faelle, eine Stelle — beide, weil die Route-Handler den Zugriff nicht
  // durchgaengig selbst pruefen:
  //
  // 1. Externe BEM-Beauftragte (E7) duerfen AUSSCHLIESSLICH BEM-APIs (und
  //    Auth) erreichen, sonst laesen sie ueber ungegatete Nicht-BEM-Endpunkte
  //    (z.B. /api/dashboard/stats) Daten.
  //
  // 2. Mandantenbeschraenkte Rollen (EINRICHTUNGSLEITUNG, VORGESETZTER) duerfen
  //    nur, was in MANDANTEN_API_ALLOWLIST steht. Von 193 Routen filtern nur
  //    rund 50 nach Mandant; eine Sperrliste waere beim naechsten neuen
  //    Endpunkt schon wieder unvollstaendig, also gilt hier Allowlist:
  //    Unbekanntes bekommt 403. Details in src/lib/mandanten-gate.ts.
  //
  // Der Token wird fuer beide Faelle nur einmal geprueft.
  if (pathname.startsWith("/api/")) {
    const sessionCookie = request.cookies.get("credo_session");
    if (sessionCookie?.value) {
      try {
        const jwtSecret = process.env.JWT_SECRET;
        if (jwtSecret) {
          const secret = new TextEncoder().encode(jwtSecret);
          const { payload } = await jwtVerify(sessionCookie.value, secret, {
            algorithms: ["HS256"],
          });
          const role = payload.role as string;

          const bemGesperrt =
            role === "BEM_BEAUFTRAGTER" &&
            !pathname.startsWith("/api/bem") &&
            !pathname.startsWith("/api/auth");

          if (bemGesperrt || apiZugriffVerweigern(role, pathname)) {
            return NextResponse.json(
              { error: "Keine Berechtigung" },
              { status: 403 },
            );
          }
        }
      } catch {
        // Ungueltige/abgelaufene Session: der Route-Handler entscheidet (401).
      }
    }
  }

  const isPortalRoute = pathname.startsWith("/dashboard") ||
                        pathname.startsWith("/benutzerverwaltung") ||
                        pathname.startsWith("/vorlagen") ||
                        pathname.startsWith("/brief-vorlagen") ||
                        pathname.startsWith("/bem-vorlagen") ||
                        pathname.startsWith("/checklisten") ||
                        pathname.startsWith("/mandanten") ||
                        pathname.startsWith("/einstellungen");

  if (isPortalRoute) {
    const sessionCookie = request.cookies.get("credo_session");
    if (!sessionCookie?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Kryptographische JWT-Validierung (nicht nur Cookie-Existenz pruefen)
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(sessionCookie.value, secret, {
        algorithms: ["HS256"],
      });

      // Externe BEM-Beauftragte (E7) sehen AUSSCHLIESSLICH das BEM-Modul.
      // Jeder andere Portal-Pfad wird auf /dashboard/bem umgeleitet.
      if (
        (payload.role as string) === "BEM_BEAUFTRAGTER" &&
        !pathname.startsWith("/dashboard/bem")
      ) {
        return NextResponse.redirect(new URL("/dashboard/bem", request.url));
      }

      // Admin-Routen nur für SUPER_ADMIN und HR_LEITUNG
      const adminRoutes = ["/benutzerverwaltung", "/vorlagen", "/bem-vorlagen", "/checklisten", "/mandanten", "/einstellungen"];
      const isAdminRoute = adminRoutes.some((r) => pathname.startsWith(r));
      if (isAdminRoute) {
        const role = payload.role as string;
        const adminRoles = ["SUPER_ADMIN", "HR_LEITUNG"];
        if (!adminRoles.includes(role)) {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      }
    } catch {
      // Ungueltiger oder abgelaufener Token → Cookie löschen, Redirect zu Login
      const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
      redirectResponse.cookies.delete("credo_session");
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Alle Routen ausser:
     * - _next/static (statische Assets)
     * - _next/image (Bildoptimierung)
     * - favicon.ico, Bilder etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
