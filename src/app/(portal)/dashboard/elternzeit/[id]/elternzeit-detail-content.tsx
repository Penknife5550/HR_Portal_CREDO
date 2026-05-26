"use client";

/**
 * Elternzeit-Detailseite — Phase 1 MVP
 *
 * Tabs: Uebersicht, Abschnitte, Checkliste, Notizen
 * Aktions-Buttons: Magic Link senden, Genehmigen, Ablehnen, PDF generieren
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import {
  AblehnungModal,
  MagicLinkModal,
  GenehmigungEndgModal,
  AGBescheinigungModal,
  ConfirmDeleteModal,
  type AGBescheinigungData,
} from "@/components/elternzeit/elternzeit-modals";
import {
  ProzessStepper,
  NaechsterSchrittBanner,
} from "@/components/prozess-stepper";
import {
  ELTERNZEIT_STEPS,
  ELTERNZEIT_ABBRUCH_STATES,
  ELTERNZEIT_PAUSE_STATES,
  getStepIndex as getEzStepIndex,
  getNaechsterSchritt as getEzNaechsterSchritt,
  type ElternzeitStatus,
} from "@/lib/elternzeit-workflow";

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface Abschnitt {
  id: string;
  abschnittNr: number;
  von: string;
  bis: string;
  uebertragung3bis8: boolean;
  teilzeit: boolean;
  teilzeitStunden: number | null;
  ferienSperrfristWarnung: boolean;
  ferienBegruendung: string | null;
}

interface ChecklistItem {
  id: string;
  titel: string;
  beschreibung: string | null;
  logaHinweis: string | null;
  erledigtAm: string | null;
  erledigtVon: string | null;
  personalgruppe: string | null;
  phase: string;
}

interface Notiz {
  id: string;
  text: string;
  erstelltVon: string;
  createdAt: string;
}

interface DokumentEintrag {
  id: string;
  dokumentTyp: string;
  dateiname: string;
  mimeType: string | null;
  fileSize: number | null;
  generiert: boolean;
  hochgeladenAm: string;
  hochgeladenVon: string | null;
}

interface FristEintrag {
  id: string;
  fristTyp: string;
  bezeichnung: string;
  beschreibung: string | null;
  faelligAm: string;
  erledigtAm: string | null;
  erledigtVon: string | null;
  erledigung: string | null;
  severity: "INFO" | "WARNING" | "URGENT" | "OVERDUE" | null;
  verbleibendeTage: number | null;
}

interface ElternzeitData {
  id: string;
  displayId: string;
  status: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  employeePersonalNr: string | null;
  personalgruppe: string;
  geschlecht: string;
  kvTyp: string;
  kindNummer: number;
  kindName: string | null;
  kindGeburtsdatum: string | null;
  betreuungsabsicht: string | null;
  gleichzeitigeEZ: boolean;
  einrichtungsleiterName: string | null;
  einrichtungsleiterEmail: string | null;
  antragVorlAm: string | null;
  antragTokenVorl: string | null;
  antragTokenVorlExpiry: string | null;
  antragTokenVorlUsedAt: string | null;
  genehmigungAm: string | null;
  genehmigungVon: string | null;
  ablehnungGrund: string | null;
  organization: { id: string; name: string; mandantNumber: string };
  mutterschutz: {
    id: string;
    displayId: string;
    status: string;
  } | null;
  abschnitte: Abschnitt[];
  checklistItems: ChecklistItem[];
  notizen: Notiz[];
}

const STATUS_LABELS: Record<string, string> = {
  ANGELEGT: "Angelegt",
  ANTRAG_VORL_VERSANDT: "Vorl. Antrag versandt",
  ANTRAG_VORL_EINGEREICHT: "Vorl. Antrag eingereicht",
  VORLAEUFIG_GENEHMIGT: "Vorläufig genehmigt",
  VORLAEUFIG_ABGELEHNT: "Vorläufig abgelehnt",
  ANTRAG_ENDG_VERSANDT: "Endg. Antrag versandt",
  ANTRAG_ENDG_EINGEREICHT: "Endg. Antrag eingereicht",
  GENEHMIGT: "Genehmigt",
  AKTIV: "Aktiv",
  UNTERBROCHEN: "Unterbrochen",
  RUECKKEHR_GEPLANT: "Rueckkehr geplant",
  BEENDET: "Beendet",
  ABGELEHNT: "Abgelehnt",
};

const PHASE_LABELS: Record<string, string> = {
  ANTRAG: "Phase 1: Antrag",
  GENEHMIGUNG: "Phase 2: Genehmigung",
  EZ_AKTIV: "Phase 3: Elternzeit aktiv",
  RUECKKEHR: "Phase 4: Rueckkehr",
};

export function ElternzeitDetailContent({
  prozessId,
  user,
}: {
  prozessId: string;
  user: User;
}) {
  const [data, setData] = useState<ElternzeitData | null>(null);
  const [fristen, setFristen] = useState<FristEintrag[] | null>(null);
  const [dokumente, setDokumente] = useState<DokumentEintrag[] | null>(null);
  const [uploadTyp, setUploadTyp] = useState<string>("SONSTIGES");
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DokumentEintrag | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    | "uebersicht"
    | "abschnitte"
    | "checkliste"
    | "notizen"
    | "briefe"
    | "fristen"
    | "dokumente"
  >("uebersicht");
  const [neueNotiz, setNeueNotiz] = useState("");
  const [magicLinkResult, setMagicLinkResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSendLinkModal, setShowSendLinkModal] = useState(false);
  const [linkRecipient, setLinkRecipient] = useState("");
  // Phase-2 Modal-State (ersetzt prompt()/confirm())
  const [modal, setModal] = useState<
    | { type: "ablehnung-vorl" }
    | { type: "ablehnung-endg" }
    | { type: "magic-link-endg" }
    | { type: "magic-link-leiter" }
    | { type: "genehmigung-endg" }
    | { type: "ag-bescheinigung" }
    | null
  >(null);

  const load = useCallback(async (silent = false) => {
    // silent=true: Hintergrund-Refresh nach Aktionen — kein loading-State,
    // damit die Detailansicht nicht unmountet und die Scroll-Position bleibt.
    if (!silent) setLoading(true);
    const res = await fetch(`/api/elternzeit/${prozessId}`);
    if (res.ok) {
      const j = await res.json();
      setData(j.data);
      if (j.data.employeeEmail && !linkRecipient) {
        setLinkRecipient(j.data.employeeEmail);
      }
    }
    if (!silent) setLoading(false);
  }, [prozessId, linkRecipient]);

  const loadFristen = useCallback(async () => {
    const res = await fetch(`/api/elternzeit/${prozessId}/fristen`);
    if (res.ok) {
      const j = await res.json();
      setFristen(j.data);
    }
  }, [prozessId]);

  const loadDokumente = useCallback(async () => {
    const res = await fetch(`/api/elternzeit/${prozessId}/dokumente`);
    if (res.ok) {
      const j = await res.json();
      setDokumente(j.data);
    }
  }, [prozessId]);

  async function dokumentUpload(file: File) {
    setActionError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dokumentTyp", uploadTyp);
      const res = await fetch(`/api/elternzeit/${prozessId}/dokumente`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "Upload fehlgeschlagen.");
        return;
      }
      loadDokumente();
      load(true);
    } finally {
      setUploading(false);
    }
  }

  async function dokumentLoeschen(docId: string) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/dokumente/${docId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Dokument konnte nicht geloescht werden.");
      return;
    }
    loadDokumente();
    load(true);
  }

  async function fristToggle(f: FristEintrag) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/fristen/${f.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erledigt: !f.erledigtAm }),
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Frist konnte nicht aktualisiert werden.");
      return;
    }
    loadFristen();
  }

  useEffect(() => {
    load(false);
  }, [load]);

  // Dokumente werden direkt mitgeladen, damit der Uebersichts-Hinweis
  // (z.B. "Geburtsurkunde liegt vor") sofort funktioniert.
  useEffect(() => {
    loadDokumente();
  }, [loadDokumente]);

  useEffect(() => {
    if (tab === "fristen") {
      loadFristen();
    }
  }, [tab, loadFristen]);

  async function sendeAntragsLink() {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/antrag-link-vorl`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: linkRecipient }),
      },
    );
    if (!res.ok) {
      const j = await res.json();
      setActionError(j.error || "Fehler beim Senden des Links.");
      return;
    }
    const j = await res.json();
    setMagicLinkResult(j.data.magicUrl);
    setShowSendLinkModal(false);
    load(true);
  }

  async function genehmigen() {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/genehmigen-vorl`,
      { method: "POST" },
    );
    if (!res.ok) {
      const j = await res.json();
      setActionError(j.error || "Fehler bei Genehmigung.");
      return;
    }
    load(true);
  }

  async function ablehnen(grund: string) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/ablehnen-vorl`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ablehnungGrund: grund }),
      },
    );
    if (!res.ok) {
      const j = await res.json();
      setActionError(j.error || "Fehler bei Ablehnung.");
      throw new Error(j.error);
    }
    setModal(null);
    load(true);
  }

  // ── Phase-2-Aktionen: Endgültiger Antrag ──

  async function sendeAntragsLinkEndg(empfaenger: string) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/antrag-link-endg`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: empfaenger }),
      },
    );
    if (!res.ok) {
      const j = await res.json();
      setActionError(j.error || "Fehler beim Senden des endgültigen Links.");
      throw new Error(j.error);
    }
    const j = await res.json();
    setMagicLinkResult(j.data.magicUrl);
    setModal(null);
    load(true);
  }

  async function genehmigenEndg(unterzeichner: string) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/genehmigen-endg`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genehmigungVon: unterzeichner }),
      },
    );
    if (!res.ok) {
      const j = await res.json();
      setActionError(j.error || "Fehler bei endgültiger Genehmigung.");
      throw new Error(j.error);
    }
    setModal(null);
    load(true);
  }

  async function ablehnenEndg(grund: string) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/ablehnen-endg`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ablehnungGrund: grund }),
      },
    );
    if (!res.ok) {
      const j = await res.json();
      setActionError(j.error || "Fehler bei endgültiger Ablehnung.");
      throw new Error(j.error);
    }
    setModal(null);
    load(true);
  }

  // Leiter-Magic-Link senden (ersetzt inline-prompt im Button)
  async function sendeLeiterLink(empfaenger: string) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/leiter-link`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: empfaenger }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setActionError(err.error || "Fehler beim Erstellen des Links");
      throw new Error(err.error);
    }
    const j = await res.json();
    setMagicLinkResult(j.data.magicUrl);
    setModal(null);
    load(true);
  }

  // AG-Bescheinigung generieren (ersetzt 4 prompts)
  async function generiereAGBescheinigung(formData: AGBescheinigungData) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/ag-bescheinigung`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setActionError(err.error || "Fehler bei AG-Bescheinigung");
      throw new Error(err.error);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data?.displayId ?? "ag-bescheinigung"}_AG_Bescheinigung.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setModal(null);
  }

  async function toggleItem(item: ChecklistItem) {
    setActionError(null);
    const res = await fetch(
      `/api/elternzeit/${prozessId}/checkliste/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erledigt: !item.erledigtAm }),
      },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Item konnte nicht aktualisiert werden.");
      return;
    }
    load(true);
  }

  async function notizSpeichern() {
    if (neueNotiz.trim().length === 0) return;
    setActionError(null);
    const res = await fetch(`/api/elternzeit/${prozessId}/notizen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: neueNotiz }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || "Notiz konnte nicht gespeichert werden.");
      return;
    }
    setNeueNotiz("");
    load(true);
  }

  if (loading || !data) {
    return (
      <div>
        <PortalHeader user={user} />
        <div className="p-8 text-center text-sm text-muted-foreground">
          Lade…
        </div>
      </div>
    );
  }

  // Sekundaer-Aktionen — Primaer-Schritte uebernimmt der NaechsterSchrittBanner.
  // Hier nur Sichtbarkeits-Flags für Aktionen, die der Banner NICHT abdeckt:
  // Ablehnungen, Leiter-Magic-Link, PDF-Downloads.
  const canAblehnen = data.status === "ANTRAG_VORL_EINGEREICHT";
  const canDownloadPdf = !!data.genehmigungAm;
  const canSendLeiterLink = data.status === "ANTRAG_VORL_EINGEREICHT";
  const canAblehnenEndg = data.status === "ANTRAG_ENDG_EINGEREICHT";
  const canDownloadEndgPdf =
    data.status === "GENEHMIGT" ||
    data.status === "AKTIV" ||
    data.status === "BEENDET";

  // Checkliste nach Phase gruppieren
  const checklisteByPhase = data.checklistItems.reduce<
    Record<string, ChecklistItem[]>
  >((acc, item) => {
    if (!acc[item.phase]) acc[item.phase] = [];
    acc[item.phase].push(item);
    return acc;
  }, {});

  return (
    <div>
      <PortalHeader user={user} />
      <div className="mx-auto max-w-5xl p-4">
        <div className="mb-4">
          <Link
            href="/dashboard?tab=elternzeit"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Zurück zum Dashboard
          </Link>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">
              {data.employeeFirstName} {data.employeeLastName}
            </h1>
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {data.displayId}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              {STATUS_LABELS[data.status] || data.status}
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs">
              {data.geschlecht === "MUTTER" ? "Mutter" : "Vater"} ·{" "}
              {data.kindNummer}. Kind
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs">
              {data.personalgruppe.replace("TARIF_", "").replace("_", "-")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.organization.name} ({data.organization.mandantNumber})
          </p>
        </div>

        {/* Prozess-Stepper + Naechster-Schritt-Banner */}
        {(() => {
          const ezStatus = data.status as ElternzeitStatus;
          const abgebrochen = ELTERNZEIT_ABBRUCH_STATES.includes(ezStatus);
          const pausiert = ELTERNZEIT_PAUSE_STATES.includes(ezStatus);
          const stepIndex = getEzStepIndex(ezStatus);
          const naechster = getEzNaechsterSchritt(ezStatus);

          // Mapping: Action-Identifier → Handler
          const handler: (() => void) | undefined = (() => {
            switch (naechster.action) {
              case "MAGIC_LINK_VORL":
                return () => setShowSendLinkModal(true);
              case "GENEHMIGEN_VORL":
                return () => genehmigen();
              case "MAGIC_LINK_ENDG":
                return () => setModal({ type: "magic-link-endg" });
              case "GENEHMIGEN_ENDG":
                return () => setModal({ type: "genehmigung-endg" });
              default:
                return undefined;
            }
          })();

          return (
            <div className="mb-4 space-y-3">
              <ProzessStepper
                steps={ELTERNZEIT_STEPS.map((s) => ({
                  id: s.id,
                  label: s.label,
                  beschreibung: s.beschreibung,
                }))}
                currentStepIndex={stepIndex}
                abgebrochen={abgebrochen}
                pausiert={pausiert}
              />
              {!abgebrochen && !pausiert && (
                <NaechsterSchrittBanner
                  titel={naechster.titel}
                  beschreibung={naechster.beschreibung}
                  hrAktion={naechster.hrAktion}
                  actionLabel={naechster.actionLabel}
                  onAction={handler}
                />
              )}
            </div>
          );
        })()}

        {/*
          Sekundaer-Aktionen — der primaere "naechste Schritt" wird vom
          NaechsterSchrittBanner oben gerendert. Hier nur Aktionen, die
          der Banner NICHT abdeckt: Ablehnungen, Leiter-Link, PDF-Downloads.
        */}
        {(canAblehnen ||
          canAblehnenEndg ||
          canSendLeiterLink ||
          canDownloadPdf ||
          canDownloadEndgPdf) && (
          <div className="mb-4 flex flex-wrap gap-2">
            {canAblehnen && (
              <button
                type="button"
                onClick={() => setModal({ type: "ablehnung-vorl" })}
                className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive"
              >
                Ablehnen
              </button>
            )}
            {canSendLeiterLink && (
              <button
                type="button"
                onClick={() => setModal({ type: "magic-link-leiter" })}
                className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary"
              >
                Leiter-Magic-Link
              </button>
            )}
            {canAblehnenEndg && (
              <button
                type="button"
                onClick={() => setModal({ type: "ablehnung-endg" })}
                className="rounded-lg border border-destructive px-4 py-2 text-sm font-medium text-destructive"
              >
                Endgültig ablehnen
              </button>
            )}
            {canDownloadPdf && (
              <a
                href={`/api/elternzeit/${prozessId}/genehmigung-vorl`}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Vorl. Genehmigung (PDF)
              </a>
            )}
            {canDownloadEndgPdf && (
              <a
                href={`/api/elternzeit/${prozessId}/genehmigung-endg`}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Endg. Genehmigung (PDF)
              </a>
            )}
          </div>
        )}

        {actionError && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {actionError}
          </div>
        )}

        {magicLinkResult && (
          <div className="mb-4 rounded-md border border-credo-gruen bg-credo-gruen/10 p-3 text-sm">
            <div className="font-medium text-credo-gruen">
              Magic Link generiert
            </div>
            <input
              type="text"
              value={magicLinkResult}
              readOnly
              onClick={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded border bg-background px-2 py-1 text-xs"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b overflow-x-auto">
          {(
            [
              "uebersicht",
              "abschnitte",
              "checkliste",
              "dokumente",
              "notizen",
              "briefe",
              "fristen",
            ] as const
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
                tab === t
                  ? "border-credo-gruen text-credo-gruen"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "uebersicht"
                ? "Uebersicht"
                : t === "abschnitte"
                  ? `Abschnitte (${data.abschnitte.length})`
                  : t === "checkliste"
                    ? `Checkliste (${data.checklistItems.filter((i) => i.erledigtAm).length}/${data.checklistItems.length})`
                    : t === "dokumente"
                      ? `Dokumente (${dokumente?.length ?? 0})`
                      : t === "notizen"
                        ? `Notizen (${data.notizen.length})`
                        : t === "briefe"
                          ? "Briefe"
                          : "Fristen"}
            </button>
          ))}
        </div>

        {tab === "uebersicht" && (
          <div className="space-y-4">
            <Section title="Mitarbeiter/in">
              <Row label="Name">
                {data.employeeFirstName} {data.employeeLastName}
              </Row>
              <Row label="E-Mail">{data.employeeEmail}</Row>
              {data.employeePersonalNr && (
                <Row label="Personalnummer">{data.employeePersonalNr}</Row>
              )}
              <Row label="Personalgruppe">{data.personalgruppe}</Row>
              <Row label="KV-Typ">{data.kvTyp}</Row>
            </Section>

            <Section title="Antrag & Genehmigung">
              {data.antragVorlAm && (
                <Row label="Antrag eingereicht">
                  {new Date(data.antragVorlAm).toLocaleDateString("de-DE")}
                </Row>
              )}
              {data.genehmigungAm && (
                <Row label="Genehmigt am">
                  {new Date(data.genehmigungAm).toLocaleDateString("de-DE")}
                  {data.genehmigungVon && ` von ${data.genehmigungVon}`}
                </Row>
              )}
              {data.ablehnungGrund && (
                <Row label="Ablehnungsgrund">{data.ablehnungGrund}</Row>
              )}
              {data.einrichtungsleiterName && (
                <Row label="Einrichtungsleitung">
                  {data.einrichtungsleiterName} (
                  {data.einrichtungsleiterEmail})
                </Row>
              )}
              {data.gleichzeitigeEZ && (
                <Row label="Gleichzeitige EZ beider Eltern">Ja</Row>
              )}
            </Section>

            {data.betreuungsabsicht && (
              <Section title="Betreuungsabsicht">
                <p className="text-sm whitespace-pre-wrap">
                  {data.betreuungsabsicht}
                </p>
              </Section>
            )}

            {/* Dokumente-Quick-Glance: Geburtsurkunde + Gesamt-Anzahl */}
            <Section title="Dokumente">
              {(() => {
                const geburtsurkunde = dokumente?.find(
                  (d) => d.dokumentTyp === "GEBURTSURKUNDE",
                );
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Geburtsurkunde
                      </span>
                      {geburtsurkunde ? (
                        <a
                          href={`/api/elternzeit/${prozessId}/dokumente/${geburtsurkunde.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-credo-gruen hover:underline"
                        >
                          ✓ liegt vor — {geburtsurkunde.dateiname}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          noch nicht vorhanden
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Insgesamt
                      </span>
                      <button
                        onClick={() => setTab("dokumente")}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {dokumente?.length ?? 0} Dokument(e) anzeigen →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </Section>

            {data.mutterschutz && (
              <Section title="Verknuepfter Mutterschutz">
                <Link
                  href={`/dashboard/mutterschutz/${data.mutterschutz.id}`}
                  className="text-sm text-credo-gruen hover:underline"
                >
                  {data.mutterschutz.displayId} — {data.mutterschutz.status}
                </Link>
              </Section>
            )}
          </div>
        )}

        {tab === "abschnitte" && (
          <div className="space-y-3">
            {data.abschnitte.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Noch keine Zeitabschnitte erfasst (werden nach Antragseingang
                automatisch ausgefuellt).
              </p>
            )}
            {data.abschnitte.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Abschnitt {a.abschnittNr}</h3>
                  {a.ferienSperrfristWarnung && (
                    <span className="rounded bg-credo-gelb/20 px-2 py-0.5 text-xs">
                      ⚠ Feriensperrfrist
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Von</span>
                    <div>{new Date(a.von).toLocaleDateString("de-DE")}</div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Bis</span>
                    <div>{new Date(a.bis).toLocaleDateString("de-DE")}</div>
                  </div>
                </div>
                {a.uebertragung3bis8 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Uebertragung auf 3.–8. Lebensjahr
                  </div>
                )}
                {a.teilzeit && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Teilzeit: {a.teilzeitStunden} h/Woche
                  </div>
                )}
                {a.ferienBegruendung && (
                  <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                    <span className="font-medium">Begruendung:</span>{" "}
                    {a.ferienBegruendung}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "checkliste" && (
          <div className="space-y-6">
            {Object.entries(checklisteByPhase).map(([phase, items]) => (
              <div key={phase}>
                <h3 className="mb-2 text-sm font-semibold text-primary">
                  {PHASE_LABELS[phase] || phase}
                </h3>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border bg-card p-4 flex items-start gap-3"
                    >
                      <input
                        type="checkbox"
                        checked={!!item.erledigtAm}
                        onChange={() => toggleItem(item)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{item.titel}</div>
                        {item.beschreibung && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.beschreibung}
                          </div>
                        )}
                        {item.logaHinweis && (
                          <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                            <span className="font-medium">LOGA:</span>{" "}
                            {item.logaHinweis}
                          </div>
                        )}
                        {item.erledigtAm && item.erledigtVon && (
                          <div className="mt-1 text-xs text-credo-gruen">
                            ✓ Erledigt am{" "}
                            {new Date(item.erledigtAm).toLocaleDateString(
                              "de-DE",
                            )}{" "}
                            von {item.erledigtVon}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "dokumente" && (
          <div className="space-y-4">
            {/* Upload-Bereich */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold text-primary">
                Dokument hochladen
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Manueller Upload (max. 10 MB, PDF / JPG / PNG / WebP).
                Geburtsurkunden werden i.d.R. vom Mitarbeiter über den
                Magic-Link hochgeladen.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={uploadTyp}
                  onChange={(e) => setUploadTyp(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="GEBURTSURKUNDE">Geburtsurkunde</option>
                  <option value="ANTRAG_VORLAEUFIG">Antrag (vorläufig)</option>
                  <option value="ANTRAG_ENDGUELTIG">
                    Antrag (endgültig)
                  </option>
                  <option value="LOHNBESCHEINIGUNG_KK">
                    Lohnbescheinigung KK
                  </option>
                  <option value="ABLEHNUNGSSCHREIBEN">Ablehnungsschreiben</option>
                  <option value="SONSTIGES">Sonstiges</option>
                </select>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) dokumentUpload(f);
                    e.target.value = "";
                  }}
                  className="text-sm"
                />
                {uploading && (
                  <span className="text-xs text-muted-foreground">
                    Lade hoch…
                  </span>
                )}
              </div>
            </div>

            {/* Liste */}
            {dokumente && dokumente.length === 0 && (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Keine Dokumente vorhanden.
              </p>
            )}
            {dokumente && dokumente.length > 0 && (
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Typ</th>
                      <th className="px-3 py-2 text-left">Dateiname</th>
                      <th className="px-3 py-2 text-left">Hochgeladen</th>
                      <th className="px-3 py-2 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dokumente.map((d) => (
                      <tr
                        key={d.id}
                        className="border-t border-border/50 hover:bg-muted/20"
                      >
                        <td className="px-3 py-2">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs">
                            {d.dokumentTyp}
                          </span>
                          {d.generiert && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              (generiert)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`/api/elternzeit/${prozessId}/dokumente/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-credo-gruen hover:underline"
                          >
                            {d.dateiname}
                          </a>
                          {d.fileSize && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {(d.fileSize / 1024).toFixed(0)} KB
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {new Date(d.hochgeladenAm).toLocaleDateString(
                            "de-DE",
                          )}
                          {d.hochgeladenVon && ` · ${d.hochgeladenVon}`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(d)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "notizen" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <textarea
                value={neueNotiz}
                onChange={(e) => setNeueNotiz(e.target.value)}
                rows={3}
                placeholder="Neue Notiz…"
                className="w-full rounded border bg-background px-3 py-2 text-sm resize-none"
              />
              <button
                onClick={notizSpeichern}
                disabled={!neueNotiz.trim()}
                className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Speichern
              </button>
            </div>
            {data.notizen.map((n) => (
              <div key={n.id} className="rounded-lg border bg-card p-4">
                <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {n.erstelltVon} ·{" "}
                  {new Date(n.createdAt).toLocaleString("de-DE")}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "briefe" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold text-primary">
                Genehmigungen
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vorläufige + endgültige Genehmigung als PDF.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/api/elternzeit/${prozessId}/genehmigung-vorl`}
                  className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  Vorl. Genehmigung
                </a>
                <a
                  href={`/api/elternzeit/${prozessId}/genehmigung-endg`}
                  className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  Endg. Genehmigung
                </a>
              </div>
            </div>

            {(data.personalgruppe === "BEAMTER" ||
              data.personalgruppe === "PLANSTELLENINHABER") && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-primary">
                  Beamte / PSI
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pflicht-Briefe für Beamte und Planstelleninhaber.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/api/elternzeit/${prozessId}/br-detmold`}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    BR Detmold-Schreiben
                  </a>
                  <a
                    href={`/api/elternzeit/${prozessId}/beihilfe-aenderung`}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    Beihilfe-Aenderung
                  </a>
                </div>
              </div>
            )}

            {data.personalgruppe === "TARIF_TV_L" && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-primary">
                  TV-L Beschaeftigte
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/api/elternzeit/${prozessId}/vbl-info`}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    VBL-Informationsbrief
                  </a>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold text-primary">
                Externe Stellen
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setModal({ type: "ag-bescheinigung" })}
                  className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  AG-Bescheinigung Elterngeld
                </button>
                <a
                  href={`/api/elternzeit/${prozessId}/bad-aufforderung`}
                  className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  BAD-Aufforderung
                </a>
              </div>
            </div>
          </div>
        )}

        {tab === "fristen" && (
          <div className="space-y-3">
            {fristen === null ? (
              <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Lade Fristen...
              </div>
            ) : fristen.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                Keine Fristen vorhanden. Fristen werden automatisch beim
                Magic-Link-Versand und bei Statuswechsel angelegt.
              </div>
            ) : (
              fristen.map((f) => {
                const sevColor =
                  f.severity === "OVERDUE"
                    ? "border-credo-rot bg-credo-rot/5"
                    : f.severity === "URGENT"
                      ? "border-orange-400 bg-orange-50"
                      : f.severity === "WARNING"
                        ? "border-credo-gelb bg-credo-gelb/5"
                        : f.erledigtAm
                          ? "border-credo-gruen bg-credo-gruen/5"
                          : "border-input bg-card";
                const sevLabel =
                  f.severity === "OVERDUE"
                    ? "Ueberfaellig"
                    : f.severity === "URGENT"
                      ? "Dringend"
                      : f.severity === "WARNING"
                        ? "Warnung"
                        : f.severity === "INFO"
                          ? "Info"
                          : "";
                return (
                  <div
                    key={f.id}
                    className={`rounded-lg border p-4 flex items-start gap-3 ${sevColor}`}
                  >
                    <input
                      type="checkbox"
                      checked={!!f.erledigtAm}
                      onChange={() => fristToggle(f)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {f.bezeichnung}
                        </span>
                        {sevLabel && !f.erledigtAm && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium border">
                            {sevLabel}
                          </span>
                        )}
                      </div>
                      {f.beschreibung && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {f.beschreibung}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-muted-foreground">
                        Faellig:{" "}
                        {new Date(f.faelligAm).toLocaleDateString("de-DE")}
                        {f.verbleibendeTage !== null && !f.erledigtAm && (
                          <>
                            {" "}
                            ·{" "}
                            {f.verbleibendeTage >= 0
                              ? `${f.verbleibendeTage} Tage verbleibend`
                              : `${Math.abs(f.verbleibendeTage)} Tage ueberfaellig`}
                          </>
                        )}
                      </div>
                      {f.erledigtAm && (
                        <div className="mt-1 text-xs text-credo-gruen">
                          ✓ Erledigt am{" "}
                          {new Date(f.erledigtAm).toLocaleDateString("de-DE")}
                          {f.erledigtVon ? ` von ${f.erledigtVon}` : ""}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {showSendLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Magic Link senden</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Der Mitarbeiter erhält einen Link, um den vorläufigen Antrag
              auszufüllen.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium">
                E-Mail-Empfaenger
              </span>
              <input
                type="email"
                value={linkRecipient}
                onChange={(e) => setLinkRecipient(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowSendLinkModal(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={sendeAntragsLink}
                disabled={!linkRecipient}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Link generieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase-2 Modale (ersetzen prompt()/confirm()) */}
      {modal?.type === "ablehnung-vorl" && (
        <AblehnungModal
          titel="Vorläufige Ablehnung"
          onClose={() => setModal(null)}
          onSubmit={ablehnen}
        />
      )}
      {modal?.type === "ablehnung-endg" && (
        <AblehnungModal
          titel="Endgültige Ablehnung"
          onClose={() => setModal(null)}
          onSubmit={ablehnenEndg}
        />
      )}
      {modal?.type === "magic-link-endg" && (
        <MagicLinkModal
          titel="Magic Link endgültiger Antrag"
          beschreibung="Der Mitarbeiter erhält einen Link, um den endgültigen Antrag auszufüllen und die Geburtsurkunde hochzuladen."
          defaultEmail={linkRecipient || data.employeeEmail}
          onClose={() => setModal(null)}
          onSubmit={sendeAntragsLinkEndg}
        />
      )}
      {modal?.type === "magic-link-leiter" && (
        <MagicLinkModal
          titel="Leiter-Magic-Link senden"
          beschreibung="Die Einrichtungsleitung erhält einen Link für eine Stellungnahme zum Antrag."
          defaultEmail={data.einrichtungsleiterEmail ?? ""}
          onClose={() => setModal(null)}
          onSubmit={sendeLeiterLink}
        />
      )}
      {modal?.type === "genehmigung-endg" && (
        <GenehmigungEndgModal
          onClose={() => setModal(null)}
          onSubmit={genehmigenEndg}
        />
      )}
      {modal?.type === "ag-bescheinigung" && (
        <AGBescheinigungModal
          onClose={() => setModal(null)}
          onSubmit={generiereAGBescheinigung}
        />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          titel="Dokument löschen?"
          beschreibung={`'${confirmDelete.dateiname}' wird endgültig entfernt.`}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const docId = confirmDelete.id;
            setConfirmDelete(null);
            await dokumentLoeschen(docId);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-primary">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}
