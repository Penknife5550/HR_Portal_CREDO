/**
 * Next.js Middleware
 *
 * Setzt Security-Headers fuer alle Responses und
 * schuetzt Portal-Routen mit Session-Check.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
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
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

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
      "upgrade-insecure-requests",
    ].join("; ")
  );

  // =============================================
  // Portal-Routen: Redirect zu Login wenn keine Session
  // =============================================
  const { pathname } = request.nextUrl;
  const isPortalRoute = pathname.startsWith("/dashboard") ||
                        pathname.startsWith("/benutzerverwaltung") ||
                        pathname.startsWith("/vorlagen") ||
                        pathname.startsWith("/checklisten") ||
                        pathname.startsWith("/mandanten");

  if (isPortalRoute) {
    const sessionCookie = request.cookies.get("credo_session");
    if (!sessionCookie?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
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
