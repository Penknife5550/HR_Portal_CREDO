"use client";

/**
 * Shared Portal Header/Navigation
 *
 * 3 Hauptmenüpunkte mit Dropdown-Untermenüs:
 * - Dashboard (direkt)
 * - Vorlagen (Dropdown: Formulare, Checklisten, Exit-Interview, Zeugnis)
 * - Verwaltung (Dropdown: Benutzer, Mandanten, Einstellungen)
 */

import { useState, useEffect, useRef } from "react";
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

interface DropdownItem {
  href: string;
  label: string;
  roles: string[];
}

interface NavGroup {
  label: string;
  roles: string[];
  href?: string;
  children?: DropdownItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER"],
  },
  {
    // BEM = "versiegelte Akte". Nav fuer alle Portal-Rollen sichtbar; die Liste
    // zeigt aber nur Faelle mit aktiver Freigabe (bemFilter) — sonst leer.
    // BEM_BEAUFTRAGTER (E7) sieht NUR diesen Punkt (in keiner anderen Gruppe).
    label: "🔒 BEM",
    href: "/dashboard/bem",
    roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "BEM_BEAUFTRAGTER"],
  },
  {
    label: "Vorlagen",
    roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"],
    children: [
      { href: "/vorlagen", label: "Formulare", roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] },
      { href: "/brief-vorlagen", label: "Brief-Vorlagen", roles: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] },
      { href: "/checklisten", label: "Checklisten", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
      { href: "/exit-interview-vorlagen", label: "Exit-Interview", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
      { href: "/zeugnis-vorlagen", label: "Zeugnis-Bewertung", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
      { href: "/beurteilungs-vorlagen", label: "Beurteilungs-Vorlagen", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
    ],
  },
  {
    label: "Verwaltung",
    roles: ["SUPER_ADMIN", "HR_LEITUNG"],
    children: [
      { href: "/benutzerverwaltung", label: "Benutzer", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
      { href: "/bem-vorlagen", label: "BEM-Vorlagen", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
      { href: "/mandanten", label: "Mandanten", roles: ["SUPER_ADMIN"] },
      { href: "/einstellungen", label: "Einstellungen", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
      { href: "/audit-log", label: "Audit-Log", roles: ["SUPER_ADMIN", "HR_LEITUNG"] },
    ],
  },
];

function DropdownMenu({
  group,
  userRole,
  pathname,
}: {
  group: NavGroup;
  userRole: string;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside schließt das Dropdown
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const visibleChildren = group.children?.filter((c) => c.roles.includes(userRole)) || [];
  if (visibleChildren.length === 0) return null;

  const isAnyChildActive = visibleChildren.some((c) => pathname.startsWith(c.href));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          isAnyChildActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {group.label}
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg">
          {visibleChildren.map((child) => {
            const isActive = pathname.startsWith(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PortalHeader({ user }: { user: User }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bemCount, setBemCount] = useState(0);

  // BEM-Handlungsbedarf-Zaehler fuers Nav-Badge (0 fuer Nicht-Freigegebene).
  useEffect(() => {
    let active = true;
    fetch("/api/bem/handlungsbedarf?countOnly=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active && j) setBemCount(j.data?.counts?.total || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  // Alle sichtbaren Gruppen für diesen User
  const visibleGroups = NAV_GROUPS.filter((g) => g.roles.includes(user.role));

  // Flat list für Mobile
  const mobileItems: DropdownItem[] = [];
  for (const group of visibleGroups) {
    if (group.href) {
      mobileItems.push({ href: group.href, label: group.label, roles: group.roles });
    }
    if (group.children) {
      for (const child of group.children) {
        if (child.roles.includes(user.role)) {
          mobileItems.push(child);
        }
      }
    }
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
                  Personalmanagement
                </p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {visibleGroups.map((group) => {
                // Direkter Link (kein Dropdown)
                if (group.href) {
                  const isActive = pathname.startsWith(group.href);
                  return (
                    <Link
                      key={group.href}
                      href={group.href}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {group.label}
                      {group.href === "/dashboard/bem" && bemCount > 0 && (
                        <span
                          className="ml-1.5 inline-block rounded-full bg-credo-rot px-1.5 py-0.5 text-xs font-bold leading-none text-white"
                          title={`${bemCount} Fristen mit Handlungsbedarf`}
                        >
                          {bemCount}
                        </span>
                      )}
                    </Link>
                  );
                }

                // Dropdown
                return (
                  <DropdownMenu
                    key={group.label}
                    group={group}
                    userRole={user.role}
                    pathname={pathname}
                  />
                );
              })}
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
                    : user.role === "BEM_BEAUFTRAGTER"
                      ? "BEM-Beauftragte:r"
                      : "Sachbearbeiter"}
              </p>
            </div>

            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted md:hidden"
              aria-label="Menü"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

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
        {mobileOpen && (
          <div className="border-t bg-card px-4 py-2 md:hidden">
            <div className="flex flex-wrap gap-1">
              {mobileItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <CredoLinie height={3} />
      </header>
    </>
  );
}
