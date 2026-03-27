"use client";

/**
 * Shared Portal Header/Navigation
 *
 * Wird auf allen Portal-Seiten verwendet:
 * - Dashboard
 * - Benutzerverwaltung (nur SUPER_ADMIN / HR_LEITUNG)
 * - Formularvorlagen
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { CredoLinie } from "@/components/credo-linie";
import { SessionTimeoutWarning } from "@/components/session-timeout-warning";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] },
  { href: "/benutzerverwaltung", label: "Benutzer", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
  { href: "/vorlagen", label: "Vorlagen", roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] },
  { href: "/checklisten", label: "Checklisten", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
  { href: "/mandanten", label: "Mandanten", roles: ["SUPER_ADMIN"] },
  { href: "/einstellungen", label: "Einstellungen", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
];

export function PortalHeader({ user }: { user: User }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <>
    <SessionTimeoutWarning />
    <header className="border-b bg-card shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image
              src="/credo_logo.svg"
              alt="CREDO"
              width={120}
              height={40}
              priority
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground">HR-Portal</h1>
              <p className="text-xs text-muted-foreground">
                Einstellungsmanagement
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.filter((item) => item.roles.includes(user.role)).map(
              (item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              }
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <span className="text-sm font-medium text-foreground">
              {user.firstName} {user.lastName}
            </span>
            <p className="text-xs text-muted-foreground">
              {user.role === "SUPER_ADMIN"
                ? "Administrator"
                : user.role === "HR_LEITUNG"
                  ? "HR-Leitung"
                  : "Sachbearbeiter"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Abmelden"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            Abmelden
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="flex md:hidden overflow-x-auto items-center gap-1 px-4 pb-2">
        {NAV_ITEMS.filter((item) => item.roles.includes(user.role)).map(
          (item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {item.label}
              </Link>
            );
          }
        )}
      </div>

      <CredoLinie height={3} />
    </header>
    </>
  );
}
