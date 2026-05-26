"use client";

/**
 * HR-Login-Seite
 * E-Mail + Passwort Authentifizierung für das HR-Team
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CredoLinie } from "@/components/credo-linie";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Anmeldung fehlgeschlagen");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-lg">
        {/* Header */}
        <div className="space-y-4 p-8 text-center">
          <Image
            src="/credo_logo_claim.svg"
            alt="CREDO - Freie Evangelische Schulen Minden"
            width={220}
            height={70}
            className="mx-auto"
            priority
          />
          <div>
            <h1 className="text-xl font-bold text-foreground">HR-Portal Login</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bitte melden Sie sich mit Ihren Zugangsdaten an.
            </p>
          </div>
        </div>

        {/* Login-Formular */}
        <form onSubmit={handleLogin} className="space-y-4 px-8 pb-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              E-Mail-Adresse
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vorname.nachname@credo-gruppe.de"
              required
              autoFocus
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort eingeben"
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Anmeldung..." : "Anmelden"}
          </button>
        </form>

        {/* CREDO-Linie */}
        <CredoLinie />
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Christlicher Schulverein Minden e.V.
        &middot; Powered by helex.it
      </p>
    </div>
  );
}
