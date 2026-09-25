/**
 * Die Schritte der HR-Uebersicht (Onboarding, Paket 2).
 *
 * Geprueft wird die REINE Datei `dashboard/[id]/uebersicht-schritte.ts`, nicht
 * ein Render von `TabOverview`: Die fuenf Konstellationen sind Datenfaelle, und
 * ueber einen Render gepruefte Datenfaelle machen jeden unbeteiligten Umbau in
 * der 3400-Zeilen-Datei zum Testbruch.
 *
 * Die Kernaussage aller Faelle: DIE MODALITAETEN-SPUR HAENGT NICHT AM
 * FRAGEBOGEN. Frueher stand ihr Schritt auf „upcoming" und trug keinen Knopf,
 * solange der Fragebogen offen war — obwohl die Route beides laengst erlaubt.
 */
import type { WorkflowStep } from "@/components/process-workflow-stepper";
import {
  onboardingKurzschritte,
  onboardingWorkflowSchritte,
  spurenChips,
  type SchritteStand,
  type SchrittAktionen,
} from "@/app/(portal)/dashboard/[id]/uebersicht-schritte";
import {
  abteilungsZeilenBauen,
  onboardingVersandSperre,
  type AbteilungsUebersichtDaten,
} from "@/lib/abteilungsaufgaben";
import { uebersichtBauen, type NachforderungEingabe, type UnterlagenUebersicht } from "@/lib/unterlagen";

const JETZT = new Date("2026-09-20T12:00:00.000Z");

/**
 * Stand der Karte „Aufgaben für Abteilungen" mit der ECHTEN Regel des Servers
 * (`abteilungsZeilenBauen`, `onboardingVersandSperre`): eine offene IT-Aufgabe,
 * IT mit hinterlegter Adresse. `gesperrt` = Modalitaeten fehlen.
 */
function abteilungen(opts: { gesperrt?: boolean } = {}): AbteilungsUebersichtDaten {
  const sperre = opts.gesperrt
    ? onboardingVersandSperre({ status: "IN_PROGRESS", supervisorSubmittedAt: null, supervisorData: null })
    : null;
  const r = abteilungsZeilenBauen({
    aufgaben: [
      { id: "c1", title: "Benutzerkonto anlegen", assigneeDepartment: "IT", isCompleted: false, dueDate: null },
    ],
    links: [],
    konfigs: [
      { departmentKey: "IT", departmentName: "IT-Abteilung", email: "it@credo-gruppe.de", organizationId: null, isActive: true },
    ],
    organizationId: "org-1",
    fuehrungskraft: null,
    vorgangAbgeschlossen: false,
    gesperrt: !!sperre,
    linkUrl: (t) => `https://hr.fes-credo.de/onboarding-tasks/${t}`,
    jetzt: JETZT,
  });
  return {
    ...r,
    modul: "ONBOARDING",
    vorgangAbgeschlossen: false,
    vorgangAbgebrochen: false,
    bezugsdatum: sperre ? null : "2026-10-01T00:00:00.000Z",
    gesperrt: sperre,
  };
}

function stand(teil: Partial<SchritteStand> = {}): SchritteStand {
  return {
    status: "IN_PROGRESS",
    token: "tok-fb",
    invitedAt: "2026-09-08T12:00:00.000Z",
    submittedAt: null,
    supervisorSubmittedAt: null,
    supervisorToken: null,
    supervisorEmail: null,
    supervisorTokenExpiresAt: null,
    supervisorLinkSentAt: null,
    reviewedAt: null,
    completedAt: null,
    fragebogenFortschritt: {
      position: 4,
      total: 9,
      titel: "Sozialversicherung",
      prozent: 44,
    },
    personalData: { isComplete: false, currentStep: 4 },
    supervisorData: null,
    documents: { length: 0 },
    checklistItems: [],
    ...teil,
  };
}

function aktionen(teil: Partial<SchrittAktionen> = {}): SchrittAktionen {
  return {
    darfBearbeiten: true,
    fragebogenLink: "https://hr.fes-credo.de/fragebogen/tok-fb",
    modalitaetenLink: null,
    supervisorAdresseEingetragen: true,
    linkWirdErzeugt: false,
    vorgesetztenLinkErzeugen: jest.fn(),
    abteilungenInformieren: jest.fn(),
    csvExport: jest.fn(),
    dokumenteVersenden: jest.fn(),
    ...teil,
  };
}

function schritte(s: SchritteStand, a: Partial<SchrittAktionen> = {}): WorkflowStep[] {
  return onboardingWorkflowSchritte(s, aktionen(a), JETZT);
}

function finde(alle: WorkflowStep[], key: string): WorkflowStep {
  const treffer = alle.find((x) => x.key === key);
  if (!treffer) throw new Error(`Schritt „${key}" fehlt`);
  return treffer;
}

function knopfnamen(step: WorkflowStep): string[] {
  return (step.actions ?? []).map((x) => x.label);
}

// =============================================
// (a) Beide Spuren offen
// =============================================

describe("beide Spuren offen", () => {
  it("Fragebogen UND Modalitaeten sind gleichzeitig aktiv", () => {
    const alle = schritte(stand());
    expect(finde(alle, "fragebogen").status).toBe("active");
    expect(finde(alle, "modalitaeten").status).toBe("active");
    expect(alle.filter((x) => x.status === "active").map((x) => x.key)).toEqual([
      "fragebogen",
      "modalitaeten",
    ]);
  });

  it("ohne Link: Knopf „Vorgesetzten-Link erstellen“ (frueher blockiert durch den Fragebogen)", () => {
    const step = finde(schritte(stand()), "modalitaeten");
    expect(knopfnamen(step)).toEqual(["Vorgesetzten-Link erstellen"]);
    expect(step.actions?.[0].disabled).toBe(false);
    expect(step.info).toContain("Kann sofort erstellt werden, unabhängig vom Fragebogen.");
  });

  it("ohne eingetragene Adresse bleibt der Knopf deaktiviert", () => {
    const step = finde(
      schritte(stand(), { supervisorAdresseEingetragen: false }),
      "modalitaeten",
    );
    expect(step.actions?.[0].disabled).toBe(true);
  });

  it("mit Link: „Modalitäten-Link kopieren“ und der Stand der Fuehrungskraft", () => {
    const step = finde(
      schritte(
        stand({
          supervisorToken: "tok-sv",
          supervisorEmail: "leitung@example.org",
          supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
          supervisorData: { isComplete: false, currentStep: 1 },
        }),
        { modalitaetenLink: "https://hr.fes-credo.de/modalitaeten/tok-sv" },
      ),
      "modalitaeten",
    );
    expect(knopfnamen(step)).toEqual(["Modalitäten-Link kopieren"]);
    // Die Zahl der Fuehrungskraft, nicht der Rohindex.
    expect(step.info).toBe(
      "Modalitäten in Bearbeitung — Schritt 2 von 5 · Arbeitszeit & Arbeitgeber · leitung@example.org",
    );
  });

  it("Link verschickt, aber nie geoeffnet: Datum statt „Schritt 1 von 5“", () => {
    const step = finde(
      schritte(
        stand({
          supervisorToken: "tok-sv",
          supervisorLinkSentAt: "2026-09-09T12:00:00.000Z",
          supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
          supervisorData: { isComplete: false, currentStep: 0 },
        }),
      ),
      "modalitaeten",
    );
    expect(step.info).toBe("Link versendet am 09.09.2026 — noch nicht begonnen");
  });

  it("„Daten prüfen“ bleibt kommend, die Checkliste ebenso", () => {
    const alle = schritte(stand());
    expect(finde(alle, "pruefen").status).toBe("upcoming");
    expect(finde(alle, "pruefen").items).toBeUndefined();
    expect(finde(alle, "checkliste").status).toBe("upcoming");
  });

  it("„Einladung versenden“ ist immer erledigt und traegt das Einladungsdatum", () => {
    const step = finde(schritte(stand()), "einladung");
    expect(step.status).toBe("completed");
    expect(step.completedAt).toBe("08.09.2026");
    expect(step.info).toBeUndefined();
  });

  it("der Fragebogen-Schritt traegt seinen Fortschritt", () => {
    const step = finde(schritte(stand()), "fragebogen");
    expect(step.progress).toEqual({ done: 4, total: 9 });
    expect(step.info).toBe("Fragebogen in Bearbeitung — Schritt 4 von 9 · Sozialversicherung");
    expect(knopfnamen(step)).toEqual(["Fragebogen-Link kopieren"]);
  });

  it("nie begonnener Fragebogen: „noch nicht begonnen“ statt des toten Wartesatzes", () => {
    const step = finde(
      schritte(
        stand({
          fragebogenFortschritt: { position: 0, total: 9, titel: "noch nicht begonnen", prozent: 0 },
          personalData: { isComplete: false, currentStep: 0 },
        }),
      ),
      "fragebogen",
    );
    expect(step.info).toBe("Fragebogen noch nicht begonnen");
  });
});

// =============================================
// (b) Nur die Modalitaeten sind eingereicht
// =============================================

describe("Fuehrungskraft war schneller", () => {
  const s = stand({
    supervisorToken: "tok-sv",
    supervisorEmail: "leitung@example.org",
    supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
    supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
    supervisorData: { isComplete: true, currentStep: 5 },
  });

  it("Modalitaeten erledigt mit Datum, Fragebogen weiter aktiv", () => {
    const alle = schritte(s);
    expect(finde(alle, "modalitaeten").status).toBe("completed");
    expect(finde(alle, "modalitaeten").completedAt).toBe("18.09.2026");
    expect(finde(alle, "modalitaeten").actions).toBeUndefined();
    expect(finde(alle, "fragebogen").status).toBe("active");
    expect(alle.filter((x) => x.status === "active")).toHaveLength(1);
  });

  it("der Fragebogen-Schritt sagt, dass die Gegenspur schon da ist", () => {
    expect(finde(schritte(s), "fragebogen").info).toContain(
      "✓ Einstellungsmodalitäten bereits eingereicht am 18.09.2026, unabhängig vom Fragebogen.",
    );
  });

  it("noch nicht pruefbar", () => {
    expect(finde(schritte(s), "pruefen").status).toBe("upcoming");
  });
});

// =============================================
// (c) Beides eingereicht
// =============================================

describe("beides eingereicht", () => {
  const s = stand({
    status: "SUPERVISOR_SUBMITTED",
    submittedAt: "2026-09-19T12:00:00.000Z",
    personalData: { isComplete: true, currentStep: 9 },
    supervisorToken: "tok-sv",
    supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
    supervisorData: { isComplete: true, currentStep: 5 },
    documents: { length: 2 },
  });

  it("„Daten prüfen“ ist aktiv, mit beiden Haken und der Dokumentenzahl", () => {
    const step = finde(schritte(s), "pruefen");
    expect(step.status).toBe("active");
    expect(step.info).toBe("2 Dokumente hochgeladen");
    expect((step.items ?? []).map((i) => i.title)).toEqual([
      "Personalfragebogen vollständig",
      "Modalitäten vollständig",
      "2 Dokumente hochgeladen",
    ]);
  });

  it("beide Spuren-Schritte sind erledigt; AKTIV ist allein „Daten prüfen“", () => {
    // Die Checkliste beginnt erst mit der Pruefung. Waere sie hier schon aktiv,
    // stuende bei JEDEM Vorgang „Schritte 4 und 5 laufen parallel“ ueber zwei
    // Karten — und der Satz gehoert den beiden SPUREN, nicht der HR-Arbeit.
    expect(schritte(s).filter((x) => x.status === "active").map((x) => x.key)).toEqual([
      "pruefen",
    ]);
    expect(finde(schritte(s), "checkliste").status).toBe("upcoming");
    expect(finde(schritte(s), "fragebogen").status).toBe("completed");
    expect(finde(schritte(s), "modalitaeten").status).toBe("completed");
  });
});

// =============================================
// (d) Ehrenamt: kein Vorgesetzten-Link
// =============================================

describe("ohne Vorgesetzten-Link (z. B. Ehrenamt)", () => {
  const s = stand({
    status: "SUBMITTED",
    submittedAt: "2026-09-19T12:00:00.000Z",
    personalData: { isComplete: true, currentStep: 9 },
    documents: { length: 1 },
  });

  it("„Daten prüfen“ ist aktiv — frueher blieb der Schritt kommend, waehrend im Kopf schon der Knopf stand", () => {
    expect(finde(schritte(s), "pruefen").status).toBe("active");
  });

  it("ohne Link fehlt die Zeile „Modalitäten vollständig“ — sie waere eine Luege", () => {
    const titel = (finde(schritte(s), "pruefen").items ?? []).map((i) => i.title);
    expect(titel).toEqual(["Personalfragebogen vollständig", "1 Dokument hochgeladen"]);
  });

  it("der Modalitaeten-Schritt bleibt daneben aktiv und bietet den Link an", () => {
    expect(finde(schritte(s), "modalitaeten").status).toBe("active");
    expect(knopfnamen(finde(schritte(s), "modalitaeten"))).toEqual([
      "Vorgesetzten-Link erstellen",
    ]);
  });

  it("aktiv sind genau ZWEI Schritte — die Checkliste zaehlt nicht dazu", () => {
    // Ohne diese Zusicherung stuenden drei Karten in einem zweispaltigen
    // Raster, ueberschrieben mit „Die Schritte 3, 4 und 5 laufen parallel".
    expect(schritte(s).filter((x) => x.status === "active").map((x) => x.key)).toEqual([
      "modalitaeten",
      "pruefen",
    ]);
  });
});

// =============================================
// (e) HR hat geprueft
// =============================================

describe("HR-Status", () => {
  const s = stand({
    status: "REVIEWED",
    submittedAt: "2026-09-19T12:00:00.000Z",
    reviewedAt: "2026-09-21T12:00:00.000Z",
    personalData: { isComplete: true, currentStep: 9 },
    supervisorToken: "tok-sv",
    supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
    supervisorData: { isComplete: true, currentStep: 5 },
    checklistItems: [
      { id: "c1", title: "Benutzerkonto anlegen", isCompleted: false, assignee: "IT", notes: null },
    ],
  });

  it("„Daten prüfen“ erledigt mit Pruefdatum, Checkliste aktiv", () => {
    const alle = schritte(s);
    expect(finde(alle, "pruefen").status).toBe("completed");
    expect(finde(alle, "pruefen").completedAt).toBe("21.09.2026");
    expect(finde(alle, "checkliste").status).toBe("active");
    expect(alle.filter((x) => x.status === "active")).toHaveLength(1);
  });

  it("der erledigte Schritt „Daten prüfen“ behaelt seine drei Haken", () => {
    // `bereitZurPruefung` ist mit dem HR-Status false. Haengen die Haken daran,
    // klappt HR den erledigten Schritt auf und sieht NICHTS — dabei sind sie
    // gerade dann die Begruendung des Hakens.
    expect((finde(schritte(s), "pruefen").items ?? []).map((i) => i.title)).toEqual([
      "Personalfragebogen vollständig",
      "Modalitäten vollständig",
      "0 Dokumente hochgeladen",
    ]);
  });

  it("EXPIRED gilt NICHT als geprueft", () => {
    // `istHrStatus` umfasst auch EXPIRED. Haengt der Haken daran, traegt ein
    // abgelaufener Vorgang einen gruenen Haken an „Daten prüfen“ — ohne Datum
    // und ohne dass je jemand geprueft haette.
    const alle = schritte(stand({ status: "EXPIRED", submittedAt: "2026-09-19T12:00:00.000Z" }));
    expect(finde(alle, "pruefen").status).toBe("upcoming");
    expect(finde(alle, "pruefen").items).toBeUndefined();
    expect(finde(alle, "checkliste").status).toBe("upcoming");
  });

  it("geprueft ohne Modalitaeten (Ehrenamt): der Schritt steht still statt ewig aktiv zu bleiben", () => {
    const alle = schritte(
      stand({
        status: "REVIEWED",
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
      }),
    );
    expect(finde(alle, "modalitaeten").status).toBe("upcoming");
    expect(finde(alle, "modalitaeten").actions).toBeUndefined();
  });

  it("Abschluss traegt `completedAt`, nicht das Datum der Fragebogen-Abgabe", () => {
    const alle = schritte(
      stand({
        status: "COMPLETED",
        submittedAt: "2026-09-19T12:00:00.000Z",
        completedAt: "2026-09-25T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        supervisorToken: "tok-sv",
        supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
        checklistItems: [
          { id: "c1", title: "Konto", isCompleted: true, assignee: "IT", notes: null },
        ],
      }),
    );
    expect(finde(alle, "abschluss").status).toBe("completed");
    expect(finde(alle, "abschluss").completedAt).toBe("25.09.2026");
  });
});

// =============================================
// (f) Altfall: Zeitstempel fehlt, isComplete steht
// =============================================

describe("Altfaelle ohne Zeitstempel", () => {
  it("`personalData.isComplete` allein zaehlt als eingereicht", () => {
    const alle = schritte(
      stand({ submittedAt: null, personalData: { isComplete: true, currentStep: 9 } }),
    );
    expect(finde(alle, "fragebogen").status).toBe("completed");
    // Ohne Zeitstempel bleibt das Datum leer statt „—" zu behaupten.
    expect(finde(alle, "fragebogen").completedAt).toBeUndefined();
  });

  it("`supervisorData.isComplete` allein zaehlt ebenso", () => {
    const alle = schritte(
      stand({
        supervisorToken: "tok-sv",
        supervisorSubmittedAt: null,
        supervisorData: { isComplete: true, currentStep: 5 },
      }),
    );
    expect(finde(alle, "modalitaeten").status).toBe("completed");
    expect(finde(alle, "fragebogen").info).toContain(
      "✓ Einstellungsmodalitäten bereits eingereicht, unabhängig vom Fragebogen.",
    );
  });
});

// =============================================
// (g) Abgelaufener Vorgesetzten-Link
// =============================================

describe("abgelaufener Vorgesetzten-Link", () => {
  const s = stand({
    supervisorToken: "tok-sv",
    supervisorEmail: "leitung@example.org",
    supervisorTokenExpiresAt: "2026-09-15T12:00:00.000Z",
    supervisorData: { isComplete: false, currentStep: 2 },
  });

  it("Info nennt den Ablauftag, die Aktion den Ausweg", () => {
    const step = finde(schritte(s, { modalitaetenLink: "https://hr.fes-credo.de/modalitaeten/tok-sv" }), "modalitaeten");
    expect(step.info).toBe("Link abgelaufen am 15.09.2026 — bitte neuen Link erzeugen");
    expect(knopfnamen(step)).toEqual(["Neuen Vorgesetzten-Link erzeugen"]);
  });
});

// =============================================
// Checkliste und Abteilungen
// =============================================

describe("Schritt „Checkliste abarbeiten“", () => {
  it("ohne Abteilungsdaten bleibt der Hinweis leer, der Fortschritt zaehlt", () => {
    const alle = schritte(
      stand({
        status: "REVIEWED",
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        checklistItems: [
          { id: "c1", title: "Konto anlegen", isCompleted: true, assignee: "IT", notes: null },
          { id: "c2", title: "Schlüssel", isCompleted: false, assignee: null, notes: "Notiz" },
        ],
      }),
    );
    const step = finde(alle, "checkliste");
    expect(step.progress).toEqual({ done: 1, total: 2 });
    expect((step.items ?? []).map((i) => i.title)).toEqual(["Schlüssel"]);
    // Rohschluessel werden nie angezeigt.
    expect(step.items?.[0].assignee).toBeUndefined();
    expect(step.info).toBeUndefined();
  });
});

// =============================================
// „Abteilungen informieren…" schon vor der Pruefung
// =============================================

describe("„Abteilungen informieren…“ vor der Prüfung", () => {
  // Informieren darf HR, sobald die Modalitaeten eingereicht sind
  // (onboardingVersandSperre) — der Schritt „Checkliste abarbeiten" kommt dann
  // aber noch. Der Knopf muss trotzdem erreichbar sein, OHNE dass der Schritt
  // aktiv wird (parallel sind nur die beiden Spuren).
  const IT_AUFGABE = [
    { id: "c1", title: "Benutzerkonto anlegen", isCompleted: false, assignee: "IT", notes: null },
  ];
  const beidesEingereicht = stand({
    status: "SUPERVISOR_SUBMITTED",
    submittedAt: "2026-09-19T12:00:00.000Z",
    personalData: { isComplete: true, currentStep: 9 },
    supervisorToken: "tok-sv",
    supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
    supervisorData: { isComplete: true, currentStep: 5 },
    checklistItems: IT_AUFGABE,
  });

  it("beides eingereicht, noch nicht geprueft: Schritt kommt, traegt aber den Knopf", () => {
    const abteilungenInformieren = jest.fn();
    const alle = schritte(
      { ...beidesEingereicht, abteilungen: abteilungen() },
      { abteilungenInformieren },
    );
    const step = finde(alle, "checkliste");
    expect(step.status).toBe("upcoming");
    expect(step.aktionenAuchKommend).toBe(true);
    expect(knopfnamen(step)).toEqual(["Abteilungen informieren…"]);

    step.actions?.[0].onClick();
    expect(abteilungenInformieren).toHaveBeenCalledTimes(1);

    // Die Entscheidung aus Paket 2 bleibt: aktiv ist allein „Daten prüfen".
    expect(alle.filter((x) => x.status === "active").map((x) => x.key)).toEqual(["pruefen"]);
  });

  it("Modalitaeten eingereicht, Fragebogen noch offen: der Knopf steht ebenfalls da", () => {
    // Die Sperre liest nur die Modalitaeten-Spur — der Fragebogen spielt fuer
    // den Versand an die Abteilungen keine Rolle.
    const alle = schritte(
      stand({
        supervisorToken: "tok-sv",
        supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
        supervisorData: { isComplete: true, currentStep: 5 },
        checklistItems: IT_AUFGABE,
        abteilungen: abteilungen(),
      }),
    );
    expect(finde(alle, "checkliste").status).toBe("upcoming");
    expect(knopfnamen(finde(alle, "checkliste"))).toEqual(["Abteilungen informieren…"]);
  });

  it("ohne eingereichte Modalitaeten (gesperrt): kein Knopf", () => {
    const alle = schritte(
      stand({
        status: "SUBMITTED",
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        checklistItems: IT_AUFGABE,
        abteilungen: abteilungen({ gesperrt: true }),
      }),
    );
    const step = finde(alle, "checkliste");
    expect(step.status).toBe("upcoming");
    expect(step.actions).toBeUndefined();
  });

  it("nichts informierbar (alle schon informiert o. ae.): kein Knopf", () => {
    const d = abteilungen();
    const alle = schritte({
      ...beidesEingereicht,
      abteilungen: { ...d, informierbar: 0, zeilen: d.zeilen.map((z) => ({ ...z, informierbar: false })) },
    });
    expect(finde(alle, "checkliste").actions).toBeUndefined();
  });

  it("nach der Pruefung: derselbe Knopf an der AKTIVEN Checkliste (unveraendert)", () => {
    const alle = schritte({
      ...beidesEingereicht,
      status: "REVIEWED",
      reviewedAt: "2026-09-21T12:00:00.000Z",
      abteilungen: abteilungen(),
    });
    const step = finde(alle, "checkliste");
    expect(step.status).toBe("active");
    expect(knopfnamen(step)).toEqual(["Abteilungen informieren…"]);
  });

  it("nur die Checkliste verlangt Knoepfe im kommenden Zustand", () => {
    const alle = schritte({ ...beidesEingereicht, abteilungen: abteilungen() });
    expect(alle.filter((x) => x.aktionenAuchKommend).map((x) => x.key)).toEqual(["checkliste"]);
  });
});

// =============================================
// Ohne Bearbeitungsrecht (HR_EDIT_ROLES) keine schreibenden Knoepfe
// =============================================

describe("ohne Bearbeitungsrecht", () => {
  // Durchsicht 09/2026: Die Uebersicht pruefte keine Rolle. Mit dem Knopf vor
  // der Pruefung (aktionenAuchKommend) sah z. B. eine Einrichtungsleitung
  // „Abteilungen informieren…" — und bekam beim Senden 403. Kopieren und
  // Export bleiben: Sie schreiben nichts.
  const IT_AUFGABE = [
    { id: "c1", title: "Benutzerkonto anlegen", isCompleted: false, assignee: "IT", notes: null },
  ];
  const ohneRecht = { darfBearbeiten: false };

  it("kein „Abteilungen informieren…“ — weder vor noch nach der Pruefung", () => {
    const vorher = schritte(
      stand({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        supervisorToken: "tok-sv",
        supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
        supervisorData: { isComplete: true, currentStep: 5 },
        checklistItems: IT_AUFGABE,
        abteilungen: abteilungen(),
      }),
      ohneRecht,
    );
    expect(finde(vorher, "checkliste").actions).toBeUndefined();

    const nachher = schritte(
      stand({
        status: "REVIEWED",
        reviewedAt: "2026-09-21T12:00:00.000Z",
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        supervisorToken: "tok-sv",
        supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
        supervisorData: { isComplete: true, currentStep: 5 },
        checklistItems: IT_AUFGABE,
        abteilungen: abteilungen(),
      }),
      ohneRecht,
    );
    const step = finde(nachher, "checkliste");
    expect(step.status).toBe("active");
    expect(step.actions).toBeUndefined();
    // Die Information bleibt — nur der Knopf faellt weg.
    expect(step.info).toContain("Abteilungen: 0 von 1 fertig");
  });

  it("kein „Vorgesetzten-Link erstellen“ und kein „Neuen … erzeugen“", () => {
    const ohneLink = schritte(stand(), ohneRecht);
    expect(finde(ohneLink, "modalitaeten").actions).toBeUndefined();
    // Der Stand bleibt stehen — ohne Aufforderung, fuer die es keinen Weg gibt.
    expect(finde(ohneLink, "modalitaeten").status).toBe("active");
    expect(finde(ohneLink, "modalitaeten").info).toBe("Noch kein Vorgesetzten-Link erstellt.");

    const abgelaufen = schritte(
      stand({
        supervisorToken: "tok-sv",
        supervisorEmail: "leitung@example.org",
        supervisorTokenExpiresAt: "2026-09-15T12:00:00.000Z",
        supervisorData: { isComplete: false, currentStep: 2 },
      }),
      { ...ohneRecht, modalitaetenLink: "https://hr.fes-credo.de/modalitaeten/tok-sv" },
    );
    expect(finde(abgelaufen, "modalitaeten").actions).toBeUndefined();
    expect(finde(abgelaufen, "modalitaeten").info).toBe("Link abgelaufen am 15.09.2026");
  });

  it("Kopieren bleibt: Fragebogen- und gueltiger Modalitaeten-Link", () => {
    const alle = schritte(
      stand({
        supervisorToken: "tok-sv",
        supervisorEmail: "leitung@example.org",
        supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
        supervisorData: { isComplete: false, currentStep: 1 },
      }),
      { ...ohneRecht, modalitaetenLink: "https://hr.fes-credo.de/modalitaeten/tok-sv" },
    );
    expect(knopfnamen(finde(alle, "fragebogen"))).toEqual(["Fragebogen-Link kopieren"]);
    expect(knopfnamen(finde(alle, "modalitaeten"))).toEqual(["Modalitäten-Link kopieren"]);
  });

  it("Abschluss: CSV-Export bleibt, „Dokumente versenden…“ faellt weg", () => {
    const erledigt = [
      { id: "c1", title: "Benutzerkonto anlegen", isCompleted: true, assignee: "IT", notes: null },
    ];
    const basis = stand({
      status: "REVIEWED",
      reviewedAt: "2026-09-21T12:00:00.000Z",
      submittedAt: "2026-09-19T12:00:00.000Z",
      personalData: { isComplete: true, currentStep: 9 },
      checklistItems: erledigt,
    });
    expect(knopfnamen(finde(schritte(basis, ohneRecht), "abschluss"))).toEqual([
      "CSV Export (LOGA)",
    ]);
    // Gegenprobe mit Recht: beide Knoepfe wie bisher.
    expect(knopfnamen(finde(schritte(basis), "abschluss"))).toEqual([
      "CSV Export (LOGA)",
      "Dokumente versenden…",
    ]);
  });
});

// =============================================
// Abschluss: EIN Info-Satz (Paket 4, EP-4)
// =============================================

describe("Abschluss-Schritt: ein zusammengeführter Info-Satz", () => {
  /** Eine laufende Nachforderung, gebaut mit der ECHTEN Regel des Servers. */
  function nachforderung(status: "LAUFEND" | "ERLEDIGT"): UnterlagenUebersicht {
    const n: NachforderungEingabe = {
      id: "nf-1",
      modul: "ONBOARDING",
      status,
      empfaenger: "anna.beispiel@example.org",
      frist: "2026-10-02T00:00:00.000Z",
      nachricht: null,
      angefordertAm: "2026-09-18T08:00:00.000Z",
      angefordertVonName: "Erika Muster",
      erinnertFuerFrist: null,
      erinnertStufe: null,
      erledigtAm: status === "ERLEDIGT" ? "2026-09-19T08:00:00.000Z" : null,
      zurueckgezogenAm: null,
      positionen: [
        {
          id: "p-1",
          reihenfolge: 0,
          typ: "AUFENTHALTSTITEL",
          bezeichnung: "Aufenthaltstitel",
          hinweis: null,
          originalErforderlich: false,
          sensibel: true,
          fristpflichtig: true,
          status: status === "LAUFEND" ? "ANGEFORDERT" : "ENTFAELLT",
          einreichungen: 0,
          gueltigBisAngabe: null,
          angefordertAm: "2026-09-18T08:00:00.000Z",
          uebermitteltAm: null,
          begruendung: null,
          entfaelltNotiz: null,
          entschiedenAm: status === "ERLEDIGT" ? "2026-09-19T08:00:00.000Z" : null,
          entschiedenVonName: null,
          dateien: [],
        },
      ],
      links: [],
    };
    return uebersichtBauen({
      modul: "ONBOARDING",
      nachforderungen: [n],
      verfuegbar: { ok: true },
      vorgangEingestellt: false,
      darfAktionen: true,
      dateiUrl: (id) => `/api/onboarding/onb-1/unterlagen/dateien/${id}`,
      jetzt: JETZT,
    });
  }

  const geprueft = stand({
    status: "REVIEWED",
    reviewedAt: "2026-09-21T12:00:00.000Z",
    submittedAt: "2026-09-19T12:00:00.000Z",
    personalData: { isComplete: true, currentStep: 9 },
    checklistItems: [{ id: "c1", title: "Benutzerkonto anlegen", isCompleted: true, assignee: "IT", notes: null }],
  });
  const info = (s: SchritteStand) => finde(schritte(s), "abschluss").info;

  it("offene Abteilungsaufgaben UND laufende Nachforderung: genau ein Satz", () => {
    expect(info({ ...geprueft, abteilungen: abteilungen(), unterlagen: nachforderung("LAUFEND") })).toBe(
      "Offene Aufgaben von Abteilungen und eine laufende Nachforderung verhindern den Abschluss nicht.",
    );
  });

  it("nur offene Abteilungsaufgaben: der bisherige Satz, unverändert", () => {
    expect(info({ ...geprueft, abteilungen: abteilungen() })).toBe(
      "Offene Aufgaben von Abteilungen verhindern den Abschluss nicht.",
    );
    // Auch eine erledigte Nachforderung aendert daran nichts.
    expect(info({ ...geprueft, abteilungen: abteilungen(), unterlagen: nachforderung("ERLEDIGT") })).toBe(
      "Offene Aufgaben von Abteilungen verhindern den Abschluss nicht.",
    );
  });

  it("nur eine laufende Nachforderung", () => {
    expect(info({ ...geprueft, unterlagen: nachforderung("LAUFEND") })).toBe(
      "Eine laufende Nachforderung verhindert den Abschluss nicht.",
    );
  });

  it("weder noch (auch: erledigte Nachforderung, keine Übersicht): kein Satz", () => {
    expect(info(geprueft)).toBeUndefined();
    expect(info({ ...geprueft, unterlagen: nachforderung("ERLEDIGT") })).toBeUndefined();
    expect(info({ ...geprueft, unterlagen: null })).toBeUndefined();
  });

  it("die laufende Nachforderung sperrt nichts: Status und Knöpfe aller Schritte bleiben gleich", () => {
    const fest = aktionen();
    const ohne = onboardingWorkflowSchritte(geprueft, fest, JETZT);
    const mit = onboardingWorkflowSchritte({ ...geprueft, unterlagen: nachforderung("LAUFEND") }, fest, JETZT);
    const ohneInfo = (alle: WorkflowStep[]) => alle.map((x) => ({ ...x, info: x.key === "abschluss" ? null : x.info }));
    expect(ohneInfo(mit)).toEqual(ohneInfo(ohne));
    expect(finde(mit, "abschluss").status).toBe("active");
    expect(knopfnamen(finde(mit, "abschluss"))).toEqual(["CSV Export (LOGA)", "Dokumente versenden…"]);
  });
});

// =============================================
// spurenChips
// =============================================

describe("spurenChips", () => {
  it("Fragebogen: eingereicht / in Bearbeitung / nicht begonnen", () => {
    const [fertig] = spurenChips(
      stand({ submittedAt: "2026-09-19T12:00:00.000Z", personalData: { isComplete: true, currentStep: 9 } }),
      JETZT,
    );
    expect(fertig.text).toBe("✓ Fragebogen: eingereicht 19.09.2026");
    expect(fertig.kurz).toBe("eingereicht 19.09.2026");
    expect(fertig.ton).toBe("fertig");

    const [laufend] = spurenChips(stand(), JETZT);
    expect(laufend.text).toBe("Fragebogen: Schritt 4 von 9");
    expect(laufend.kurz).toBe("Schritt 4 von 9");
    expect(laufend.ton).toBe("offen");

    const [leer] = spurenChips(
      stand({
        fragebogenFortschritt: { position: 0, total: 9, titel: "noch nicht begonnen", prozent: 0 },
      }),
      JETZT,
    );
    expect(leer.text).toBe("Fragebogen: noch nicht begonnen");
  });

  it("Modalitaeten: eingereicht / kein Link / abgelaufen / in Bearbeitung / nicht begonnen", () => {
    const [, eingereicht] = spurenChips(
      stand({
        supervisorToken: "tok-sv",
        supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
        supervisorData: { isComplete: true, currentStep: 5 },
      }),
      JETZT,
    );
    expect(eingereicht.text).toBe("✓ Modalitäten: eingereicht 18.09.2026");
    expect(eingereicht.ton).toBe("fertig");

    const [, ohneLink] = spurenChips(stand(), JETZT);
    expect(ohneLink.text).toBe("Modalitäten: kein Link");
    expect(ohneLink.kurz).toBe("kein Link");

    const [, abgelaufen] = spurenChips(
      stand({
        supervisorToken: "tok-sv",
        supervisorTokenExpiresAt: "2026-09-15T12:00:00.000Z",
        supervisorData: { isComplete: false, currentStep: 2 },
      }),
      JETZT,
    );
    expect(abgelaufen.text).toBe("Modalitäten: Link abgelaufen");
    expect(abgelaufen.ton).toBe("warnung");

    const [, laufend] = spurenChips(
      stand({
        supervisorToken: "tok-sv",
        supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
        supervisorData: { isComplete: false, currentStep: 1 },
      }),
      JETZT,
    );
    expect(laufend.text).toBe("Modalitäten: Schritt 2 von 5");

    const [, unberuehrt] = spurenChips(
      stand({
        supervisorToken: "tok-sv",
        supervisorTokenExpiresAt: "2026-10-20T12:00:00.000Z",
        supervisorData: { isComplete: false, currentStep: 0 },
      }),
      JETZT,
    );
    expect(unberuehrt.text).toBe("Modalitäten: noch nicht begonnen");
    expect(unberuehrt.kurz).toBe("noch nicht begonnen");
  });
});

// =============================================
// „Sie sind hier"
// =============================================

describe("onboardingKurzschritte", () => {
  it("beide Spuren offen: ZWEI aktuelle Stationen", () => {
    const { schritte: stationen, aktuell } = onboardingKurzschritte(stand());
    expect(stationen.map((x) => x.label)).toEqual([
      "Einladung",
      "Fragebogen",
      "Modalitäten",
      "Prüfen",
      "Checkliste",
      "Abschluss",
    ]);
    expect([...aktuell].sort()).toEqual([1, 2]);
  });

  it("eine Spur fertig: nur die erste offene Station", () => {
    const { aktuell } = onboardingKurzschritte(
      stand({
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        supervisorToken: "tok-sv",
      }),
    );
    expect([...aktuell]).toEqual([2]);
  });

  it("abgeschlossen: die letzte Station", () => {
    const { schritte: stationen, aktuell } = onboardingKurzschritte(
      stand({
        status: "COMPLETED",
        submittedAt: "2026-09-19T12:00:00.000Z",
        personalData: { isComplete: true, currentStep: 9 },
        supervisorSubmittedAt: "2026-09-18T12:00:00.000Z",
        supervisorData: { isComplete: true, currentStep: 5 },
        checklistItems: [
          { id: "c1", title: "Konto", isCompleted: true, assignee: null, notes: null },
        ],
      }),
    );
    expect(stationen.every((x) => x.done)).toBe(true);
    expect([...aktuell]).toEqual([5]);
  });
});
