"use client";

/**
 * Knopf „Kopieren" fuer Links (Fragebogen, Modalitaeten).
 *
 * Herausgeloest aus der Detailseite des Onboardings, damit der Dialog „Neuer
 * Vorgang" dieselbe Fassung nutzt. Von dort stammt der Rueckfall: Die
 * Zwischenablage-API gibt es nur in sicheren Kontexten (HTTPS, localhost).
 * Wird das Portal intern per http aufgerufen, fehlt `navigator.clipboard` —
 * dann kopiert ein unsichtbares Textfeld per `execCommand("copy")`.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy } from "lucide-react";

async function inZwischenablage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Rueckfall fuer Nicht-HTTPS-Kontexte
    const feld = document.createElement("textarea");
    feld.value = text;
    feld.setAttribute("readonly", "");
    feld.style.position = "fixed";
    feld.style.opacity = "0";
    document.body.appendChild(feld);
    feld.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(feld);
    }
  }
}

export function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [zustand, setZustand] = useState<"kopiert" | "fehler" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    const ok = await inZwischenablage(text);
    setZustand(ok ? "kopiert" : "fehler");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setZustand(null), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-muted active:scale-95"
    >
      {zustand === "kopiert" ? (
        <>
          <Check className="h-3.5 w-3.5 text-credo-gruen" aria-hidden="true" />
          <span className="text-credo-gruen">Kopiert!</span>
        </>
      ) : zustand === "fehler" ? (
        // Weder API noch Rueckfall: Der Link steht daneben im Feld und laesst
        // sich von Hand markieren.
        <span className="text-destructive">Nicht kopiert</span>
      ) : (
        <>
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
