"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Phase = "pruefen" | "formular" | "ungueltig" | "fertig";

export function SetupContent({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("pruefen");
  const [email, setEmail] = useState<string>("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let abort = false;
    fetch(`/api/auth/setup?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (abort) return;
        if (j.valid) {
          setEmail(j.email || "");
          setPhase("formular");
        } else {
          setPhase("ungueltig");
        }
      })
      .catch(() => {
        if (!abort) setPhase("ungueltig");
      });
    return () => {
      abort = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 12) {
      setErr("Das Passwort muss mindestens 12 Zeichen lang sein.");
      return;
    }
    if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[0-9]/.test(pw)) {
      setErr("Das Passwort muss Gross-/Kleinbuchstaben und Ziffern enthalten.");
      return;
    }
    if (pw !== pw2) {
      setErr("Die Passwörter stimmen nicht überein.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Das Passwort konnte nicht gesetzt werden.");
        return;
      }
      setPhase("fertig");
    } catch {
      setErr("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-bold text-foreground">CREDO HR-Portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Zugang einrichten</p>

        {phase === "pruefen" && (
          <p className="mt-6 text-sm text-muted-foreground">Link wird geprüft…</p>
        )}

        {phase === "ungueltig" && (
          <div className="mt-6">
            <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-3 text-sm text-credo-rot">
              Dieser Einrichtungs-Link ist ungültig oder abgelaufen. Bitte wenden
              Sie sich an Ihre Ansprechperson, um einen neuen Link zu erhalten.
            </div>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm text-credo-blau hover:underline"
            >
              Zur Anmeldung
            </Link>
          </div>
        )}

        {phase === "fertig" && (
          <div className="mt-6">
            <div className="rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 px-4 py-3 text-sm text-credo-gruen">
              Ihr Passwort wurde gesetzt. Sie können sich jetzt mit Ihrer
              E-Mail-Adresse und dem gewählten Passwort anmelden.
            </div>
            <Link
              href="/login"
              className="mt-4 inline-block rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90"
            >
              Zur Anmeldung
            </Link>
          </div>
        )}

        {phase === "formular" && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {email && (
              <p className="text-sm text-muted-foreground">
                Konto: <span className="font-medium text-foreground">{email}</span>
              </p>
            )}
            {err && (
              <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 px-4 py-2 text-sm text-credo-rot">
                {err}
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground">Passwort</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Passwort wiederholen
              </label>
              <input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mindestens 12 Zeichen, mit Gross-/Kleinbuchstaben und einer Ziffer.
            </p>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-credo-blau px-5 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90 disabled:opacity-50"
            >
              {saving ? "Wird gespeichert…" : "Passwort einrichten"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
