"use client";

import { useState, useEffect, useCallback } from "react";

interface Ansprechpartner {
  id: string;
  name: string;
  funktion: string | null;
}

interface Info {
  employeeName: string;
  organizationName: string | null;
  art: string;
  artLabel: string;
  status: string;
  expired: boolean;
  erledigt: boolean;
  ansprechpartner: Ansprechpartner[];
}

type View = "laden" | "formular" | "fehler" | "fertig";

export function BemEinwilligungContent({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [view, setView] = useState<View>("laden");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [ansprechpartnerId, setAnsprechpartnerId] = useState("");
  const [vpWunsch, setVpWunsch] = useState(false);
  const [vpText, setVpText] = useState("");
  const [ergebnis, setErgebnis] = useState<"ERTEILT" | "ABGELEHNT" | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bem/einwilligung/${token}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Dieser Link ist ungültig.");
        setView("fehler");
        return;
      }
      const data: Info = json.data;
      setInfo(data);
      if (data.expired) {
        setMessage("Dieser Link ist abgelaufen. Bitte wenden Sie sich an Ihre Personalabteilung.");
        setView("fehler");
      } else if (data.erledigt) {
        setMessage("Diese Einwilligung wurde bereits beantwortet.");
        setView("fehler");
      } else {
        setView("formular");
      }
    } catch {
      setMessage("Verbindungsfehler. Bitte später erneut versuchen.");
      setView("fehler");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(entscheidung: "ERTEILT" | "ABGELEHNT") {
    if (name.trim().length < 2) {
      setMessage("Bitte geben Sie Ihren Namen an.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/bem/einwilligung/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entscheidung,
          name: name.trim(),
          ansprechpartnerId:
            entscheidung === "ERTEILT" && ansprechpartnerId
              ? ansprechpartnerId
              : null,
          vertrauenspersonWunsch: entscheidung === "ERTEILT" ? vpWunsch : false,
          vertrauenspersonText:
            entscheidung === "ERTEILT" && vpWunsch ? vpText.trim() || null : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json.error || "Die Antwort konnte nicht gespeichert werden.");
        return;
      }
      setErgebnis(entscheidung);
      setView("fertig");
    } catch {
      setMessage("Verbindungsfehler. Bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4f5] px-4 py-10">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-md">
        {/* Kopf + CREDO-Linie */}
        <div className="px-8 pt-7">
          <div className="text-xl font-bold text-[#575756]">CREDO HR-Portal</div>
        </div>
        <div className="mt-4 flex h-1 w-full">
          <div className="flex-1 bg-[#FBC900]" />
          <div className="flex-1 bg-[#6BAA24]" />
          <div className="flex-1 bg-[#E2001A]" />
          <div className="flex-1 bg-[#009AC6]" />
        </div>

        <div className="px-8 py-7">
          {view === "laden" && (
            <p className="text-sm text-gray-500">Lade…</p>
          )}

          {view === "fehler" && (
            <div>
              <h1 className="mb-2 text-lg font-bold text-[#575756]">
                Hinweis
              </h1>
              <p className="text-sm text-gray-700">{message}</p>
            </div>
          )}

          {view === "formular" && info && (
            <div>
              <h1 className="mb-2 text-lg font-bold text-[#575756]">
                Betriebliches Eingliederungsmanagement (BEM)
              </h1>
              <p className="text-sm text-gray-700">
                Guten Tag {info.employeeName},
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                Ihr Arbeitgeber{info.organizationName ? ` (${info.organizationName})` : ""}{" "}
                bietet Ihnen ein Betriebliches Eingliederungsmanagement an. Ziel ist es,
                gemeinsam Möglichkeiten zu finden, Ihre Arbeitsfähigkeit zu erhalten.
                Die Teilnahme ist <strong>freiwillig</strong> und Ihre Angaben werden
                streng vertraulich behandelt. Eine Ablehnung hat keine arbeitsrechtlichen
                Nachteile.
              </p>
              <p className="mt-3 text-sm text-gray-700">
                Bitte bestätigen Sie Ihre Entscheidung ({info.artLabel}):
              </p>

              <label className="mt-4 block text-sm font-medium text-gray-700">
                Ihr Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009AC6]"
                  placeholder="Vor- und Nachname"
                />
              </label>

              {info.ansprechpartner.length > 0 && (
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Wunsch-Ansprechpartner:in (optional)
                  <select
                    value={ansprechpartnerId}
                    onChange={(e) => setAnsprechpartnerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009AC6]"
                  >
                    <option value="">Keine Auswahl</option>
                    {info.ansprechpartner.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.funktion ? ` — ${a.funktion}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-gray-500">
                    Die ausgewählte Person wird informiert und kann sich mit Ihnen in
                    Verbindung setzen.
                  </span>
                </label>
              )}

              <div className="mt-4">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={vpWunsch}
                    onChange={(e) => setVpWunsch(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Ich wünsche die Begleitung durch eine Vertrauensperson
                    (z.&nbsp;B. Betriebsrat oder Schwerbehindertenvertretung).
                  </span>
                </label>
                {vpWunsch && (
                  <textarea
                    value={vpText}
                    onChange={(e) => setVpText(e.target.value)}
                    rows={2}
                    placeholder="Optional: Wen oder was wünschen Sie? (z. B. konkrete Person)"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#009AC6]"
                  />
                )}
              </div>

              {message && (
                <p className="mt-3 text-sm text-[#E2001A]">{message}</p>
              )}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit("ERTEILT")}
                  className="flex-1 rounded-lg bg-[#6BAA24] px-5 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  Ich stimme dem BEM zu
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit("ABGELEHNT")}
                  className="flex-1 rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Ich lehne ab
                </button>
              </div>
            </div>
          )}

          {view === "fertig" && (
            <div>
              <h1 className="mb-2 text-lg font-bold text-[#575756]">
                Vielen Dank
              </h1>
              <p className="text-sm text-gray-700">
                {ergebnis === "ERTEILT"
                  ? "Ihre Zustimmung wurde gespeichert. Die Personalabteilung wird sich mit Ihnen in Verbindung setzen."
                  : "Ihre Ablehnung wurde gespeichert. Ihnen entstehen dadurch keine Nachteile."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
