"use client";

/**
 * Kopf des Portals (UX-Umbau „Klarer Weg", U1)
 *
 * EINMAL eingebunden in `src/app/(portal)/layout.tsx` — keine Seite bindet
 * ihn selbst ein. Punkte, Rollen und „aktiv" kommen aus `src/lib/navigation.ts`.
 *
 * Regeln:
 *   - Genau ein Punkt ist aktiv (`aria-current="page"`); bei einem Menue ist
 *     es der Unterpunkt, der Menueknopf traegt dann nur die Markierung.
 *   - Der Kopf zeigt nur, was die Rolle oeffnen kann (navigation.ts).
 *   - „HR-Portal" ist KEINE Ueberschrift: Die `h1` gehoert der Seite.
 *   - Kein Emoji; Symbole aus `lucide-react`. Der BEM-Zaehler traegt seinen
 *     Text fuer Screenreader („3 Fristen mit Handlungsbedarf").
 *   - Menues auf Radix (Escape, Pfeiltasten, Fokus zurueck) — dieselbe Technik
 *     und dieselben Farben wie das „…"-Menue des Seitenkopfs.
 *   - Unter 768 px ein Menueknopf (`aria-expanded`); die Liste darunter zeigt
 *     alle erreichbaren Punkte und schliesst beim Wechsel der Seite.
 *   - „Zum Inhalt springen" ist der erste Tab-Halt (sichtbar erst bei Fokus);
 *     das Ziel `#inhalt` setzt das Layout.
 *   - Auch das Logo fuehrt nur dorthin, wo die Rolle hin darf (`startAdresse`).
 *   - Abmelden geht erst zur Anmeldeseite, wenn der Server die Sitzung
 *     beendet hat; scheitert das, bleibt die Seite stehen und meldet es.
 *   - Abmelden laedt die Anmeldeseite NEU (kein Wechsel im Client): Der Kopf
 *     haengt im Layout, und ein Layout zeichnet Next.js beim Seitenwechsel
 *     nicht neu — nach einem Wechsel des Kontos stuende sonst der alte Name da.
 *     Vorher raeumt es die Meldungen ab.
 *   - Die Hoehe ist fest (`h-16` + CREDO-Linie): `globals.css` zieht sie von
 *     der Mindesthoehe der Seiten ab (`.portal-inhalt`).
 *   - Farben nur aus den Tokens; `KOPF_FARBEN` ist die Quelle fuer den
 *     Kontrasttest.
 */
import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as RadixMenue from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Lock, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { seiteNeuLaden } from "@/lib/seite-laden";
import { aktiverPunkt, rollenName, sichtbarePunkte, startAdresse, type NavPunkt } from "@/lib/navigation";
import { CredoLinie } from "@/components/credo-linie";
import { SessionTimeoutWarning } from "@/components/session-timeout-warning";
import { Button } from "@/components/ui/button";
import { MENUE_FARBEN } from "@/components/ui/seitenkopf";
import { toast } from "@/components/ui/toast";

export interface PortalKopfNutzer {
  firstName: string;
  lastName: string;
  role: string;
}

/** Farbklassen der Punkte (auf `card`): in Ruhe, beim Ueberfahren, aktiv. */
export const KOPF_FARBEN = {
  ruhe: "text-ink-2",
  hover: "hover:bg-neutral-soft hover:text-ink",
  aktiv: "bg-action-soft text-ink",
  zaehler: "bg-critical text-critical-foreground",
} as const;

const PUNKT =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

function punktKlassen(aktiv: boolean) {
  return cn(PUNKT, aktiv ? cn("font-semibold", KOPF_FARBEN.aktiv) : cn(KOPF_FARBEN.ruhe, KOPF_FARBEN.hover));
}

function BemZaehler({ anzahl }: { anzahl: number }) {
  if (anzahl <= 0) return null;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-xs leading-none font-bold tabular-nums", KOPF_FARBEN.zaehler)}>
      {anzahl}
      <span className="sr-only"> Fristen mit Handlungsbedarf</span>
    </span>
  );
}

function PunktInhalt({ punkt, bemAnzahl }: { punkt: NavPunkt; bemAnzahl: number }) {
  return (
    <>
      {punkt.schluessel === "bem" && <Lock aria-hidden="true" className="h-3.5 w-3.5" />}
      {punkt.text}
      {punkt.schluessel === "bem" && <BemZaehler anzahl={bemAnzahl} />}
    </>
  );
}

export function PortalKopf({ user }: { user: PortalKopfNutzer }) {
  const pathname = usePathname() ?? "";
  const mobilId = useId();
  const [mobilOffen, setMobilOffen] = useState(false);
  const [bemAnzahl, setBemAnzahl] = useState(0);

  const punkte = sichtbarePunkte(user.role);
  const aktiv = aktiverPunkt(pathname, punkte);
  const hatBem = punkte.some((p) => p.schluessel === "bem");

  // BEM-Handlungsbedarf fuer den Zaehler (0 fuer alle ohne Freigabe).
  useEffect(() => {
    if (!hatBem) return;
    let gilt = true;
    fetch("/api/bem/handlungsbedarf?countOnly=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gilt && j) setBemAnzahl(j.data?.counts?.total || 0);
      })
      .catch(() => {});
    return () => {
      gilt = false;
    };
  }, [pathname, hatBem]);

  // Das Handy-Menue schliesst beim Wechsel der Seite.
  useEffect(() => {
    setMobilOffen(false);
  }, [pathname]);

  async function abmelden() {
    // Zur Anmeldeseite NUR, wenn der Server die Sitzung wirklich beendet hat.
    // Sonst saehe die Seite abgemeldet aus, waehrend das Konto am selben
    // Rechner ohne Passwort offen bliebe.
    let beendet = false;
    try {
      const antwort = await fetch("/api/auth", { method: "DELETE" });
      beendet = antwort.ok;
    } catch {
      beendet = false;
    }
    if (!beendet) {
      toast.fehler("Abmelden fehlgeschlagen – die Sitzung besteht noch. Bitte erneut versuchen.");
      return;
    }
    toast.alleSchliessen();
    seiteNeuLaden("/login");
  }

  return (
    <>
      <SessionTimeoutWarning />
      <a
        href="#inhalt"
        className="sr-only rounded-lg bg-card px-3 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:outline-2 focus:outline-action"
      >
        Zum Inhalt springen
      </a>
      <header className="bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href={startAdresse(user.role)}
              className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <Image src="/credo_logo.svg" alt="CREDO" width={120} height={40} priority className="h-10 w-auto" />
              <span className="hidden sm:block">
                <span className="block font-heading text-base leading-tight font-bold text-ink">HR-Portal</span>
                <span className="block text-xs text-ink-2">Personalmanagement</span>
              </span>
            </Link>

            <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 md:flex">
              {punkte.map((punkt) =>
                punkt.href ? (
                  <Link
                    key={punkt.schluessel}
                    href={punkt.href}
                    aria-current={aktiv?.schluessel === punkt.schluessel ? "page" : undefined}
                    className={punktKlassen(aktiv?.schluessel === punkt.schluessel)}
                  >
                    <PunktInhalt punkt={punkt} bemAnzahl={bemAnzahl} />
                  </Link>
                ) : (
                  <RadixMenue.Root key={punkt.schluessel}>
                    <RadixMenue.Trigger
                      data-aktiv={aktiv?.schluessel === punkt.schluessel ? "" : undefined}
                      className={cn(punktKlassen(aktiv?.schluessel === punkt.schluessel), "cursor-default")}
                    >
                      {punkt.text}
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                    </RadixMenue.Trigger>
                    <RadixMenue.Portal>
                      <RadixMenue.Content
                        align="start"
                        sideOffset={6}
                        className="z-50 min-w-48 rounded-xl border border-hairline bg-card p-1 shadow-overlay"
                      >
                        {punkt.kinder!.map((kind) => (
                          <RadixMenue.Item
                            key={kind.href}
                            asChild
                            className={cn(
                              "flex cursor-default items-center rounded-lg px-3 py-2 text-sm outline-none select-none",
                              MENUE_FARBEN.normal.ruhe,
                              MENUE_FARBEN.normal.hervor,
                              aktiv?.href === kind.href ? "font-semibold" : "font-medium",
                            )}
                          >
                            <Link href={kind.href} aria-current={aktiv?.href === kind.href ? "page" : undefined}>
                              {kind.text}
                            </Link>
                          </RadixMenue.Item>
                        ))}
                      </RadixMenue.Content>
                    </RadixMenue.Portal>
                  </RadixMenue.Root>
                ),
              )}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <span className="block text-sm font-medium text-ink">
                {user.firstName} {user.lastName}
              </span>
              <span className="block text-xs text-ink-2">{rollenName(user.role)}</span>
            </div>
            <Button
              variante="ghost"
              groesse="sm"
              aria-label="Menü"
              aria-expanded={mobilOffen}
              aria-controls={mobilId}
              onClick={() => setMobilOffen((o) => !o)}
              className="px-2 md:hidden"
            >
              {mobilOffen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
            </Button>
            <Button groesse="sm" onClick={abmelden}>
              Abmelden
            </Button>
          </div>
        </div>

        <nav
          id={mobilId}
          aria-label="Hauptnavigation (Handy)"
          hidden={!mobilOffen}
          className="border-t border-hairline px-4 py-2 md:hidden"
        >
          <ul className="space-y-0.5">
            {punkte.map((punkt) =>
              punkt.href ? (
                <li key={punkt.schluessel}>
                  <Link
                    href={punkt.href}
                    aria-current={aktiv?.schluessel === punkt.schluessel ? "page" : undefined}
                    className={cn(punktKlassen(aktiv?.schluessel === punkt.schluessel), "w-full")}
                  >
                    <PunktInhalt punkt={punkt} bemAnzahl={bemAnzahl} />
                  </Link>
                </li>
              ) : (
                <li key={punkt.schluessel}>
                  <p className="px-3 pt-2 pb-1 font-heading text-2xs font-semibold tracking-label text-ink-2 uppercase">
                    {punkt.text}
                  </p>
                  <ul className="space-y-0.5">
                    {punkt.kinder!.map((kind) => (
                      <li key={kind.href}>
                        <Link
                          href={kind.href}
                          aria-current={aktiv?.href === kind.href ? "page" : undefined}
                          className={cn(punktKlassen(aktiv?.href === kind.href), "w-full")}
                        >
                          {kind.text}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ul>
        </nav>

        <CredoLinie height={3} />
      </header>
    </>
  );
}
