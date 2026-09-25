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
import { portalCsp, routeSetztEigeneCsp } from "@/lib/content-security-policy";

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

  const { pathname } = request.nextUrl;

  // CSP (Aufbau in src/lib/content-security-policy.ts): In Dev-Modus
  // unsafe-eval (Next.js HMR). NICHT fuer Routen, die ihre CSP selbst setzen
  // (Datei-Route der Nachforderung: `sandbox` fuer Bilder) — Next.js haengt
  // einen Kopf der Route nur an, wenn die Middleware ihn nicht schon gesetzt
  // hat. Alle uebrigen Kopfzeilen oben gelten dort weiter.
  if (!routeSetztEigeneCsp(pathname)) {
    response.headers.set("Content-Security-Policy", portalCsp());
  }

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

  // =============================================
  // Portal-Routen: Redirect zu Login wenn keine Session
  // =============================================
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
     * - api/unterlagen/ (oeffentliche API von Paket 4, Unterlagen nachfordern):
     *   Nur wenn die Middleware greift, klont Next.js den Body, schneidet ihn
     *   bei 10 MiB ab und schreibt dabei die URL samt Token ins Log. Die Grenze
     *   liegt dort in der Route selbst (leseBodyBegrenzt), die Kopfzeilen setzt
     *   oeffentlicheAntwort(). Die SEITE /unterlagen/[token] bleibt hier drin
     *   und behaelt CSP, X-Frame-Options und nosniff.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/unterlagen/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
