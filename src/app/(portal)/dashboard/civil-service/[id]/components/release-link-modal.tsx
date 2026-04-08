"use client";

/**
 * ReleaseLinkModal
 *
 * Wird angezeigt nachdem HR "Zur Bekanntgabe an Lehrkraft senden" geklickt hat.
 * Zeigt den generierten Lehrkraft-Bekanntgabe-Link explizit an, mit Copy-Button
 * und klarem Hinweis, was die Lehrkraft erhalten muss. Verhindert Verwechslung
 * mit dem SL-Magic-Link.
 *
 * Rechtsgrundlage: § 92 Abs. 1 Satz 6 LBG NRW (Bekanntgabe + Gegenaeusserung)
 */

import { useEffect, useState } from "react";

interface Props {
  ackLink: string;
  expiresAt: string;
  employeeName: string;
  onClose: () => void;
}

export function ReleaseLinkModal({
  ackLink,
  expiresAt,
  employeeName,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);

  // Beim Oeffnen sofort in die Zwischenablage kopieren — verhindert
  // dass der User versehentlich einen alten Link aus der Zwischenablage
  // weiterleitet.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(ackLink)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        // Clipboard-API blockiert — User muss manuell kopieren
      });
  }, [ackLink]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(ackLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: Eingabefeld auswählen
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-credo-gruen/15">
              <svg
                className="h-5 w-5 text-credo-gruen"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Bekanntgabe-Link erstellt
              </h3>
              <p className="text-xs text-gray-500">
                Für die Lehrkraft <strong>{employeeName}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Hinweis */}
          <div className="rounded-lg border border-credo-blau/20 bg-credo-blau/5 p-3">
            <p className="text-xs text-gray-700">
              <strong className="text-credo-blau">Wichtig:</strong> Senden Sie
              <strong> nur diesen Link</strong> aus dem Dialog an die Lehrkraft{" "}
              <strong>{employeeName}</strong>. Er ist 30 Tage gültig und kann
              nur einmal zur Quittierung verwendet werden.
            </p>
            <p className="text-[11px] text-gray-500 mt-1">
              Der Link wurde bereits in Ihre Zwischenablage kopiert. Verwenden
              Sie nicht den alten Schulleitungs-Link aus dem Browser-Verlauf —
              dieser ist nach dem Einreichen ungültig.
            </p>
          </div>

          {/* Link-Anzeige */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Bekanntgabe-Link
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={ackLink}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-credo-blau"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${
                  copied
                    ? "bg-credo-gruen text-white"
                    : "bg-credo-blau text-white hover:bg-credo-blau/90"
                }`}
              >
                {copied ? "✓ Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>

          {/* Gültig bis */}
          <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
            <span>Gültig bis</span>
            <span className="font-medium text-gray-700">
              {new Date(expiresAt).toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Mailto-Shortcut */}
          <a
            href={`mailto:?subject=${encodeURIComponent(
              `Bekanntgabe Ihrer dienstlichen Beurteilung — ${employeeName}`,
            )}&body=${encodeURIComponent(
              `Sehr geehrte/r ${employeeName},\n\nIm Folgenden finden Sie den Link zur Bekanntgabe Ihrer dienstlichen Beurteilung. Bitte prüfen Sie die Inhalte sorgfältig und nutzen Sie ggf. die Möglichkeit zur Gegenäußerung gemäß § 92 Abs. 1 Satz 6 LBG NRW.\n\n${ackLink}\n\nDieser Link ist 30 Tage gültig.\n\nMit freundlichen Grüßen\nIhre Personalabteilung`,
            )}`}
            className="flex items-center justify-center gap-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            ✉ Mit E-Mail-Programm öffnen
          </a>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-credo-blau px-4 py-2 text-sm font-semibold text-white hover:bg-credo-blau/90"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
