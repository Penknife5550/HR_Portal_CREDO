"use client";

/**
 * Session-Timeout-Warnung
 *
 * Zeigt 5 Minuten vor Ablauf der JWT-Session eine Warnung an.
 * Der Nutzer kann die Session per Klick verlaengern (API-Call der neuen Cookie setzt).
 * Nach Ablauf wird automatisch auf /login weitergeleitet.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// JWT-Session dauert 7 Tage – Warnung 5 Minuten vorher
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const WARNING_BEFORE_MS = 5 * 60 * 1000;

export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(300);
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningTimeRef = useRef<number>(Date.now() + SESSION_DURATION_MS - WARNING_BEFORE_MS);
  const expiryTimeRef = useRef<number>(Date.now() + SESSION_DURATION_MS);

  const resetTimers = useCallback(() => {
    warningTimeRef.current = Date.now() + SESSION_DURATION_MS - WARNING_BEFORE_MS;
    expiryTimeRef.current = Date.now() + SESSION_DURATION_MS;
    setShowWarning(false);
    setRemainingSeconds(300);
  }, []);

  const refreshSession = useCallback(async () => {
    setRefreshing(true);
    try {
      // Ein einfacher Auth-Check reicht, um den Cookie zu erneuern
      const res = await fetch("/api/auth", { method: "GET" });
      if (res.ok) {
        resetTimers();
      } else {
        // Session bereits abgelaufen
        window.location.href = "/login?reason=expired";
      }
    } catch {
      // Netzwerkfehler – trotzdem versuchen weiterzuarbeiten
    } finally {
      setRefreshing(false);
    }
  }, [resetTimers]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const now = Date.now();

      if (now >= expiryTimeRef.current) {
        // Session abgelaufen
        window.location.href = "/login?reason=expired";
        return;
      }

      if (now >= warningTimeRef.current) {
        setShowWarning(true);
        const remaining = Math.max(0, Math.ceil((expiryTimeRef.current - now) / 1000));
        setRemainingSeconds(remaining);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Bei Nutzer-Aktivitaet (Klick, Tastendruck) Session-Timer zuruecksetzen
  // aber nur wenn die Warnung NICHT angezeigt wird (sonst wuerde jeder Klick resetten)
  useEffect(() => {
    const handleActivity = () => {
      if (!showWarning) {
        warningTimeRef.current = Date.now() + SESSION_DURATION_MS - WARNING_BEFORE_MS;
        expiryTimeRef.current = Date.now() + SESSION_DURATION_MS;
      }
    };

    window.addEventListener("click", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [showWarning]);

  if (!showWarning) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 pt-20">
      <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Session läuft ab</h3>
            <p className="text-xs text-muted-foreground">
              Ihre Sitzung endet in{" "}
              <span className="font-mono font-bold text-amber-600">
                {minutes}:{seconds.toString().padStart(2, "0")}
              </span>
            </p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Aus Sicherheitsgründen werden Sie automatisch abgemeldet.
          Klicken Sie auf &quot;Sitzung verlängern&quot;, um weiterarbeiten zu können.
        </p>
        <div className="flex gap-3">
          <button
            onClick={refreshSession}
            disabled={refreshing}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {refreshing ? "Wird verlängert..." : "Sitzung verlängern"}
          </button>
          <button
            onClick={() => { window.location.href = "/login"; }}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
