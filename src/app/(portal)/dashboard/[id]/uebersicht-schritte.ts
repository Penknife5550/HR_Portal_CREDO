/**
 * CREDO HR-Portal – Onboarding: die Schritte der HR-Uebersicht
 *
 * Rein und client-sicher: kein Prisma, kein `next/*`, keine Uhr im Innern
 * (jede Funktion nimmt `jetzt` entgegen). Herausgeloest aus `detail-content.tsx`
 * (3400 Zeilen), weil die zu pruefenden Konstellationen reine DATENFAELLE sind:
 * Wer sie ueber einen Render von `TabOverview` (18 Props) pruefen muss, macht
 * jeden unbeteiligten Umbau dort zum Testbruch.
 *
 * DIE ZWEI SPUREN SIND HIER DIE EINZIGE WAHRHEIT. Gelesen werden
 * `mitarbeiterAbgesendet`, `vorgesetzteAbgesendet` und `bereitZurPruefung`
 * (src/lib/onboarding-spuren.ts) — NIE `personalData.isComplete` und nie der
 * Status. Sonst zeigte die Oberflaeche bei Altfaellen („Zeitstempel gesetzt,
 * `isComplete` fehlt") „in Bearbeitung", waehrend Server und Statuszeile
 * „eingereicht" sagen.
 *
 * Die Modalitaeten-Spur haengt AN KEINER STELLE am Fragebogen: Ihr Schritt ist
 * aktiv und traegt seinen Knopf, solange die Fuehrungskraft nicht abgesendet
 * hat — genau so, wie die Route es seit Paket 1 erlaubt. Frueher stand der
 * Schritt auf „upcoming" und hatte keinen Knopf, bis der Fragebogen da war.
 */

import type { WorkflowStep } from "@/components/process-workflow-stepper";
import type { AbteilungsUebersichtDaten } from "@/lib/abteilungsaufgaben";
import { abteilungLabel } from "@/lib/constants";
import { formatProgress, type FragebogenFortschritt } from "@/lib/fragebogen-steps";
import {
  bereitZurPruefung,
  istHrStatus,
  mitarbeiterAbgesendet,
  vorgesetzteAbgesendet,
  vorgesetztenLinkAbgelaufen,
} from "@/lib/onboarding-spuren";
import {
  formatModalitaetenFortschritt,
  modalitaetenFortschritt,
} from "@/lib/validations/supervisor-data";

// =============================================
// Eingaben
// =============================================

/**
 * Was die Schritte vom Vorgang brauchen — eine EIGENE, enge Schnittstelle.
 *
 * Bewusst kein Import von `DetailData`: Das erspart den Zirkelbezug auf
 * `detail-content.tsx` und haelt die Tests bei den paar Feldern, um die es
 * geht. `DetailData` erfuellt sie strukturell.
 */
export interface SchritteStand {
  status: string;
  token: string;
  invitedAt: string;
  submittedAt: string | null;
  supervisorSubmittedAt: string | null;
  supervisorToken: string | null;
  supervisorEmail: string | null;
  supervisorTokenExpiresAt: string | null;
  /** Wann der Vorgesetzten-Link verschickt wurde (Spread aus GET /api/onboarding/[id]). */
  supervisorLinkSentAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  fragebogenFortschritt: FragebogenFortschritt;
  personalData: { isComplete: boolean; currentStep: number } | null;
  supervisorData: { isComplete: boolean; currentStep: number } | null;
  /** Nur die Anzahl wird gebraucht — ein Array erfuellt das. */
  documents: { length: number };
  checklistItems: {
    id: string;
    title: string;
    isCompleted: boolean;
    assignee: string | null;
    notes: string | null;
  }[];
  abteilungen?: AbteilungsUebersichtDaten;
}

/** Was die Oberflaeche an Knoepfen beisteuert. */
export interface SchrittAktionen {
  /**
   * Darf die angemeldete Person den Vorgang bearbeiten (`HR_EDIT_ROLES`)?
   * Ohne dieses Recht bekommt der Stepper KEINE schreibenden Knoepfe
   * (Vorgesetzten-Link erstellen/erneuern, Abteilungen informieren, Dokumente
   * versenden) — die Routen antworteten darauf ohnehin mit 403, und ein Knopf,
   * der nur einen Fehler erzeugt, ist keiner. Kopieren und Export bleiben.
   * Pflichtfeld und nicht optional: Ein vergessener Wert darf nicht still
   * „ja" heissen.
   */
  darfBearbeiten: boolean;
  fragebogenLink: string;
  modalitaetenLink: string | null;
  /** Steht im Formular der Karte „Vorgesetzten-Link" eine Adresse? */
  supervisorAdresseEingetragen: boolean;
  linkWirdErzeugt: boolean;
  vorgesetztenLinkErzeugen: () => void;
  abteilungenInformieren: () => void;
  csvExport: () => void;
  dokumenteVersenden: () => void;
}

/** Ton eines Spur-Chips im Kopf der Detailseite. */
export type SpurTon = "offen" | "fertig" | "warnung";

export interface SpurChip {
  key: "fragebogen" | "modalitaeten";
  /** Volle Beschriftung fuer den Kopf: „Fragebogen: Schritt 4 von 9". */
  text: string;
  /** Nur der Wert, fuer die Karte „Status-Übersicht": „Schritt 4 von 9". */
  kurz: string;
  ton: SpurTon;
}

// =============================================
// Hilfen
// =============================================

/** TT.MM.JJJJ wie in der ganzen Detailseite; `undefined`, wenn kein Datum da ist. */
function datum(wert?: string | null): string | undefined {
  if (!wert) return undefined;
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function dokumenteText(anzahl: number): string {
  return `${anzahl} Dokument${anzahl !== 1 ? "e" : ""} hochgeladen`;
}

// =============================================
// Die Schritte
// =============================================

export function onboardingWorkflowSchritte(
  s: SchritteStand,
  a: SchrittAktionen,
  jetzt: Date = new Date(),
): WorkflowStep[] {
  const fbAb = mitarbeiterAbgesendet(s);
  const modAb = vorgesetzteAbgesendet(s);
  const pruefbar = bereitZurPruefung(s);
  const hrStatus = istHrStatus(s.status);
  const linkAbgelaufen = vorgesetztenLinkAbgelaufen(s, jetzt);
  const modFortschritt = modalitaetenFortschritt(s.supervisorData);
  const istAbgeschlossen = s.status === "COMPLETED";

  // „Geprueft" ist NICHT `istHrStatus`: Dazu zaehlt auch EXPIRED, und ein
  // abgelaufener Vorgang wurde nie geprueft. Ein gruener Haken an „Daten
  // prüfen" behauptete dort eine Arbeit, die niemand getan hat.
  const geprueft = s.status === "REVIEWED" || istAbgeschlossen;

  const checklistTotal = s.checklistItems.length;
  const checklistDone = s.checklistItems.filter((i) => i.isCompleted).length;
  const checklistAllDone = checklistTotal > 0 && checklistDone === checklistTotal;
  // Die Checkliste beginnt, wenn HR geprueft hat — NICHT schon, sobald beide
  // Spuren da sind. Sonst stuenden „Daten prüfen" und „Checkliste abarbeiten"
  // bei JEDEM Vorgang gleichzeitig als aktive Karten nebeneinander, samt der
  // Zeile „Schritte 4 und 5 laufen parallel". Parallel sind die beiden SPUREN
  // (Fragebogen/Modalitaeten) — diesen Satz auch ueber die HR-Arbeit zu
  // schreiben, verwaessert ihn. Sichtbar verliert HR dadurch nichts: Bis
  // Paket 2 rendere der Stepper ohnehin nur den ersten aktiven Schritt, die
  // Checkliste war in diesem Stand also gar nicht zu sehen; jetzt steht sie
  // wenigstens unter „Kommende Schritte".
  const checklisteFreigegeben = geprueft;
  /** Die drei Haken am Schritt „Daten prüfen" — vor UND nach der Pruefung. */
  const pruefItems = pruefbar || geprueft;

  // ---- Abteilungen im Schritt „Checkliste abarbeiten" ----
  // „Fertig" heisst: kein offener Punkt mehr fuer diese Stelle — unabhaengig
  // davon, ob sie schon informiert wurde.
  const abt = s.abteilungen;
  const abtZeilen = abt?.zeilen ?? [];
  const abtFertig = abtZeilen.filter((z) => z.aufgaben.offen === 0).length;
  const abtGesperrt = abt?.gesperrt ?? null;
  const abtInformierbar = abt?.informierbar ?? 0;
  const abtInfo = [
    checklistTotal === 0 ? "Keine Checkliste zugewiesen" : null,
    abtZeilen.length > 0 ? `Abteilungen: ${abtFertig} von ${abtZeilen.length} fertig` : null,
    abtGesperrt?.text ?? null,
    abtZeilen.length > 0 && !abtGesperrt && (abt?.niemandInformiert ?? false)
      ? "Noch keine Abteilung informiert – im Tab Checkliste „Abteilungen informieren“ wählen."
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ---- Info des Fragebogen-Schritts ----
  // Der alte Zweig „Wartet auf Einreichung durch den Mitarbeiter" war tot:
  // `POST /api/onboarding` legt `personalData` beim Anlegen an, also galt der
  // Fragebogen ab Minute eins als „begonnen". Jetzt entscheidet der
  // Fortschritt, nicht die Existenz der Zeile.
  const fragebogenInfoTeile: string[] = [];
  if (!fbAb) {
    fragebogenInfoTeile.push(
      s.fragebogenFortschritt.position > 0
        ? `Fragebogen in Bearbeitung — ${formatProgress(s.fragebogenFortschritt)}`
        : "Fragebogen noch nicht begonnen",
    );
    // Der wichtigste Satz des parallelen Ablaufs: HR sieht, dass die
    // Gegenspur laengst da ist und nur noch der Fragebogen fehlt.
    if (modAb) {
      const am = datum(s.supervisorSubmittedAt);
      fragebogenInfoTeile.push(
        am
          ? `✓ Einstellungsmodalitäten bereits eingereicht am ${am}, unabhängig vom Fragebogen.`
          : "✓ Einstellungsmodalitäten bereits eingereicht, unabhängig vom Fragebogen.",
      );
    }
  }

  // ---- Info des Modalitaeten-Schritts ----
  let modalitaetenInfo: string | undefined;
  if (modAb) {
    modalitaetenInfo = undefined;
  } else if (linkAbgelaufen) {
    // Die Aufforderung nur, wenn es den Knopf dazu gibt (`darfBearbeiten`).
    modalitaetenInfo =
      `Link abgelaufen am ${datum(s.supervisorTokenExpiresAt) ?? "—"}` +
      (a.darfBearbeiten ? " — bitte neuen Link erzeugen" : "");
  } else if (s.supervisorToken && modFortschritt.begonnen) {
    modalitaetenInfo =
      `Modalitäten in Bearbeitung — ${formatModalitaetenFortschritt(modFortschritt)}` +
      (s.supervisorEmail ? ` · ${s.supervisorEmail}` : "");
  } else if (s.supervisorToken && s.supervisorLinkSentAt) {
    modalitaetenInfo = `Link versendet am ${datum(s.supervisorLinkSentAt)} — noch nicht begonnen`;
  } else if (s.supervisorToken) {
    modalitaetenInfo = "Link versendet — noch nicht begonnen";
  } else if (!a.darfBearbeiten) {
    // Ohne Bearbeitungsrecht hat die Karte daneben kein Formular — der Satz
    // unten waere eine Aufforderung ohne Weg.
    modalitaetenInfo = "Noch kein Vorgesetzten-Link erstellt.";
  } else {
    // Kein Eingabefeld im Stepper (Entscheidung 22.09.2026): `WorkflowStep`
    // hat keinen Slot dafuer, und zwei Felder fuer dieselbe Adresse laufen
    // auseinander. Der Satz zeigt deshalb auf die Karte daneben.
    modalitaetenInfo =
      "Kann sofort erstellt werden, unabhängig vom Fragebogen. Adresse der Führungskraft in der Karte „Vorgesetzten-Link“ eintragen.";
  }

  return [
    {
      key: "einladung",
      title: "Einladung versenden",
      description: "Magic Link an die neue Mitarbeiterin bzw. den neuen Mitarbeiter senden",
      // IMMER erledigt: `token` traegt `@default(uuid())` (prisma/schema.prisma)
      // und ist ab dem Anlegen gesetzt. Die frueheren `data.token`-Zweige
      // („wird beim Anlegen automatisch erstellt") waren unerreichbar.
      status: "completed",
      completedAt: datum(s.invitedAt),
    },
    {
      key: "fragebogen",
      title: "Personalfragebogen",
      description: "Mitarbeiter/in füllt den Personalfragebogen aus",
      status: fbAb ? "completed" : "active",
      completedAt: datum(s.submittedAt),
      progress:
        s.fragebogenFortschritt.total > 0
          ? { done: s.fragebogenFortschritt.position, total: s.fragebogenFortschritt.total }
          : undefined,
      info: fragebogenInfoTeile.length > 0 ? fragebogenInfoTeile.join(" · ") : undefined,
      actions: !fbAb
        ? [
            {
              label: "Fragebogen-Link kopieren",
              onClick: () => {
                void navigator.clipboard?.writeText(a.fragebogenLink);
              },
              variant: "secondary" as const,
            },
          ]
        : undefined,
    },
    {
      key: "modalitaeten",
      title: "Einstellungsmodalitäten",
      description: "Führungskraft füllt die Vertragsdetails aus",
      // OHNE Blick auf den Fragebogen — das ist die Kernstelle von Paket 2.
      // Bei einem HR-Status (geprueft/abgeschlossen/abgelaufen) steht der
      // Schritt still: Ein Vorgang ohne Vorgesetzten-Link (Ehrenamt) haette
      // sonst nach dem Abschluss ewig eine aktive Karte „Modalitäten".
      status: modAb ? "completed" : hrStatus ? "upcoming" : "active",
      completedAt: datum(s.supervisorSubmittedAt),
      info: modalitaetenInfo,
      // Erstellen und Erneuern nur mit Bearbeitungsrecht (`darfBearbeiten`);
      // Kopieren eines gueltigen Links darf jede Rolle, die den Vorgang sieht —
      // die Karte daneben zeigt denselben Link ohnehin.
      actions:
        !modAb && !hrStatus
          ? linkAbgelaufen
            ? a.darfBearbeiten
              ? [
                  {
                    // Ein abgelaufener Link hilft niemandem beim Kopieren — hier
                    // der Ausweg aus der Pruefsperre.
                    label: "Neuen Vorgesetzten-Link erzeugen",
                    onClick: a.vorgesetztenLinkErzeugen,
                    variant: "primary" as const,
                    disabled: !a.supervisorAdresseEingetragen,
                    loading: a.linkWirdErzeugt,
                  },
                ]
              : undefined
            : a.modalitaetenLink
              ? [
                  {
                    label: "Modalitäten-Link kopieren",
                    onClick: () => {
                      void navigator.clipboard?.writeText(a.modalitaetenLink ?? "");
                    },
                    variant: "secondary" as const,
                  },
                ]
              : a.darfBearbeiten
                ? [
                    {
                      label: "Vorgesetzten-Link erstellen",
                      onClick: a.vorgesetztenLinkErzeugen,
                      variant: "primary" as const,
                      disabled: !a.supervisorAdresseEingetragen,
                      loading: a.linkWirdErzeugt,
                    },
                  ]
                : undefined
          : undefined,
    },
    {
      key: "pruefen",
      title: "Daten prüfen",
      description: "HR prüft Fragebogen-Daten und Dokumente",
      // `bereitZurPruefung` statt „beide isComplete": Ohne Vorgesetzten-Link
      // genuegt der Fragebogen. Frueher blieb der Schritt dort „upcoming",
      // waehrend im Kopf schon „Als geprüft markieren" stand — Kopf und
      // Stepper widersprachen sich.
      status: geprueft ? "completed" : pruefbar ? "active" : "upcoming",
      completedAt: datum(s.reviewedAt),
      info: pruefbar ? dokumenteText(s.documents.length) : undefined,
      // Auch NACH der Pruefung: `bereitZurPruefung` wird mit dem HR-Status
      // falsch, und der aufgeklappte erledigte Schritt stuende sonst leer da
      // (die drei Haken sind gerade dann die Begruendung des Hakens).
      items: pruefItems
        ? [
            {
              id: "fb",
              title: "Personalfragebogen vollständig",
              isCompleted: true,
              assignee: "Mitarbeiter/in",
              assigneeColor: "bg-credo-gruen/10 text-credo-gruen",
            },
            // Ohne Link gibt es keine Modalitaeten — die Zeile waere eine Luege.
            ...(s.supervisorToken
              ? [
                  {
                    id: "sv",
                    title: "Modalitäten vollständig",
                    isCompleted: true,
                    assignee: "Führungskraft",
                    assigneeColor: "bg-purple-100 text-purple-700",
                  },
                ]
              : []),
            {
              id: "docs",
              title: dokumenteText(s.documents.length),
              isCompleted: s.documents.length > 0,
              assignee: "Mitarbeiter/in",
              assigneeColor: "bg-credo-gruen/10 text-credo-gruen",
            },
          ]
        : undefined,
    },
    {
      key: "checkliste",
      title: "Checkliste abarbeiten",
      description: "Interne Aufgaben erledigen und Abteilungen informieren",
      status:
        checklistAllDone || istAbgeschlossen
          ? "completed"
          : checklisteFreigegeben
            ? "active"
            : "upcoming",
      progress: checklistTotal > 0 ? { done: checklistDone, total: checklistTotal } : undefined,
      items:
        checklistTotal > 0 && !checklistAllDone && checklisteFreigegeben
          ? s.checklistItems
              .filter((i) => !i.isCompleted)
              .slice(0, 5)
              .map((i) => ({
                id: i.id,
                title: i.title,
                isCompleted: false,
                // Nie der rohe Schluessel: „IT" heisst hier „IT-Abteilung", und
                // der Name aus den Einstellungen geht dem festen Label vor.
                assignee:
                  abtZeilen.find((z) => z.departmentKey === i.assignee)?.departmentName ||
                  abteilungLabel(i.assignee) ||
                  undefined,
                assigneeColor: "bg-credo-blau/10 text-credo-blau",
                note: i.notes,
              }))
          : undefined,
      info: abtInfo || undefined,
      // Informieren darf HR, sobald die Modalitaeten eingereicht sind
      // (`onboardingVersandSperre`) — also schon VOR der Pruefung, waehrend
      // dieser Schritt noch „upcoming" ist. Den Schritt dafuer aktiv zu setzen,
      // hiesse die Entscheidung oben umzuwerfen (parallel sind nur die Spuren).
      // Stattdessen zeigt der Stepper den Knopf schmal in der Zeile unter
      // „Kommende Schritte". Wann er erscheint, entscheidet allein die
      // Bedingung an `actions` — bei gesperrtem Versand gibt es keinen, ohne
      // Bearbeitungsrecht auch nicht (die Karte im Tab Checkliste blendet ihren
      // Knopf dann ebenfalls aus, und die Route antwortete mit 403).
      aktionenAuchKommend: true,
      actions:
        a.darfBearbeiten && !istAbgeschlossen && !abtGesperrt && abtInformierbar > 0
          ? [
              {
                label: "Abteilungen informieren…",
                onClick: a.abteilungenInformieren,
                variant: "primary" as const,
              },
            ]
          : undefined,
    },
    {
      key: "abschluss",
      title: "Abschluss",
      description: "Vorgang abschließen und Daten exportieren",
      status: istAbgeschlossen ? "completed" : !checklistAllDone ? "upcoming" : "active",
      // `completedAt`, nicht `submittedAt`: Der Abschluss-Schritt zeigte bisher
      // den Tag, an dem die Person ihren Fragebogen abgegeben hat.
      completedAt: istAbgeschlossen ? datum(s.completedAt) : undefined,
      // Die Abteilungen arbeiten an ihren eigenen Aufgaben weiter; der Vorgang
      // wartet nicht auf sie. Ohne diesen Satz sucht HR den Grund dafuer,
      // dass der Abschluss trotz offener Abteilungsaufgaben moeglich ist.
      info: abtZeilen.some((z) => z.aufgaben.offen > 0)
        ? "Offene Aufgaben von Abteilungen verhindern den Abschluss nicht."
        : undefined,
      // Der Export bleibt fuer alle stehen (eigene Rollenpruefung der Route,
      // wie die uebrigen Export-Links der Seite); versenden nur mit
      // Bearbeitungsrecht — der Versand verlangt HR_EDIT_ROLES.
      actions:
        !istAbgeschlossen && checklistAllDone
          ? [
              { label: "CSV Export (LOGA)", onClick: a.csvExport, variant: "secondary" as const },
              ...(a.darfBearbeiten
                ? [
                    {
                      label: "Dokumente versenden…",
                      onClick: a.dokumenteVersenden,
                      variant: "primary" as const,
                    },
                  ]
                : []),
            ]
          : undefined,
    },
  ];
}

// =============================================
// Chips im Kopf der Detailseite
// =============================================

/**
 * Je ein Chip pro Spur — die EINZIGE Quelle fuer den Kopf UND die Karte
 * „Status-Übersicht". Zwei Rechnungen ueber denselben Stand liefen frueher
 * auseinander (die Karte kannte „Ausstehend", der Stepper „Schritt 1 von 5").
 *
 * Das Datum steht voll da (18.09.2026), nicht verkuerzt wie im Entwurf: Bei
 * Altfaellen zaehlt das Jahr, und `formatDate` ist ueberall sonst die Quelle.
 */
export function spurenChips(s: SchritteStand, jetzt: Date = new Date()): [SpurChip, SpurChip] {
  const fbAb = mitarbeiterAbgesendet(s);
  const modAb = vorgesetzteAbgesendet(s);
  const linkAbgelaufen = vorgesetztenLinkAbgelaufen(s, jetzt);
  const f = modalitaetenFortschritt(s.supervisorData);

  const fbAm = datum(s.submittedAt);
  const fragebogen: SpurChip = fbAb
    ? {
        key: "fragebogen",
        text: fbAm
          ? `✓ Fragebogen: eingereicht ${fbAm}`
          : "✓ Fragebogen: eingereicht",
        kurz: fbAm ? `eingereicht ${fbAm}` : "eingereicht",
        ton: "fertig",
      }
    : s.fragebogenFortschritt.position > 0
      ? {
          key: "fragebogen",
          text: `Fragebogen: Schritt ${s.fragebogenFortschritt.position} von ${s.fragebogenFortschritt.total}`,
          kurz: `Schritt ${s.fragebogenFortschritt.position} von ${s.fragebogenFortschritt.total}`,
          ton: "offen",
        }
      : {
          key: "fragebogen",
          text: "Fragebogen: noch nicht begonnen",
          kurz: "noch nicht begonnen",
          ton: "offen",
        };

  const modAm = datum(s.supervisorSubmittedAt);
  let modalitaeten: SpurChip;
  if (modAb) {
    modalitaeten = {
      key: "modalitaeten",
      text: modAm
        ? `✓ Modalitäten: eingereicht ${modAm}`
        : "✓ Modalitäten: eingereicht",
      kurz: modAm ? `eingereicht ${modAm}` : "eingereicht",
      ton: "fertig",
    };
  } else if (!s.supervisorToken) {
    modalitaeten = {
      key: "modalitaeten",
      text: "Modalitäten: kein Link",
      kurz: "kein Link",
      ton: "offen",
    };
  } else if (linkAbgelaufen) {
    modalitaeten = {
      key: "modalitaeten",
      text: "Modalitäten: Link abgelaufen",
      kurz: "Link abgelaufen",
      ton: "warnung",
    };
  } else if (f.begonnen) {
    modalitaeten = {
      key: "modalitaeten",
      text: `Modalitäten: Schritt ${f.position} von ${f.total}`,
      kurz: `Schritt ${f.position} von ${f.total}`,
      ton: "offen",
    };
  } else {
    modalitaeten = {
      key: "modalitaeten",
      text: "Modalitäten: noch nicht begonnen",
      kurz: "noch nicht begonnen",
      ton: "offen",
    };
  }

  return [fragebogen, modalitaeten];
}

// =============================================
// Kurzleiste „Sie sind hier" (Dokumente-Hub)
// =============================================

export interface Kurzschritt {
  label: string;
  done: boolean;
}

/**
 * Die sechs Stationen als Kurzleiste.
 *
 * `aktuell` ist eine MENGE, kein einzelner Index: Solange beide Spuren offen
 * sind, ist HR an zwei Stellen gleichzeitig. Frueher nahm die Leiste
 * `findIndex(s => !s.done)` und konnte immer nur eine Station hervorheben —
 * die Modalitaeten fielen unter den Tisch.
 */
export function onboardingKurzschritte(s: SchritteStand): {
  schritte: Kurzschritt[];
  aktuell: Set<number>;
} {
  const fbAb = mitarbeiterAbgesendet(s);
  const modAb = vorgesetzteAbgesendet(s);
  const checklistTotal = s.checklistItems.length;
  const checklistAllDone = checklistTotal > 0 && s.checklistItems.every((i) => i.isCompleted);
  const istAbgeschlossen = s.status === "COMPLETED";
  const geprueft = s.status === "REVIEWED" || istAbgeschlossen;

  const schritte: Kurzschritt[] = [
    { label: "Einladung", done: true },
    { label: "Fragebogen", done: fbAb },
    { label: "Modalitäten", done: modAb },
    { label: "Prüfen", done: geprueft },
    { label: "Checkliste", done: checklistAllDone || istAbgeschlossen },
    { label: "Abschluss", done: istAbgeschlossen },
  ];

  const aktuell = new Set<number>();
  if (!fbAb && !modAb) {
    aktuell.add(1);
    aktuell.add(2);
  } else {
    const erste = schritte.findIndex((x) => !x.done);
    aktuell.add(erste === -1 ? schritte.length - 1 : erste);
  }

  return { schritte, aktuell };
}
