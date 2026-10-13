/**
 * Tests: oeffentliche Routen der Onboarding-Abteilungsaufgaben (Paket 5)
 *
 *   GET   /api/onboarding-tasks/[token]
 *   PATCH /api/onboarding-tasks/[token]/[itemId]
 *
 * Die Fachlogik (Tokenpruefung, Vorgangsstatus, Ablauf, Sperren, Uebergaenge,
 * Mails) steckt in src/lib/abteilungsaufgaben-uebergaenge.ts und ist dort
 * getestet (src/__tests__/lib/abteilungsaufgaben-onboarding.test.ts). Hier geht
 * es um das, was die Routen SELBST tun — die IP-Bremse VOR dem Token-Lookup,
 * das Lesen des Bodys, das 1:1-Weiterreichen — und um die beiden Zusagen, die
 * ein Link ohne Anmeldung tragen muss:
 *   - Ein Offboarding-Token ist hier ein „Ungültiger Link" (Modulkreuzung).
 *   - Der Datenzuschnitt: kein `email` der Person, keine Fragebogen-Angaben
 *     ausser dem Namen, keine interne HR-Notiz, kein Fortschritt anderer
 *     Abteilungen.
 *
 * Die Dienstfunktionen sind jest.fn-Huellen um die ECHTEN Funktionen: Ein Test
 * kann sie fuer das reine Durchreichen ersetzen, die uebrigen laufen durch den
 * echten Dienst gegen die In-Memory-Datenbank
 * (src/__tests__/hilfen/abteilungs-fake-db.ts).
 */

type MailErgebnis = { status: "SENT" | "FAILED" | "SKIPPED"; detail?: string; recipient?: string } | null;

const mockTrigger = jest.fn(
  async (_event: string, payload: Record<string, unknown>): Promise<MailErgebnis> => ({
    status: "SENT",
    recipient: String(payload.email ?? "hr@example.org"),
  }),
);

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/abteilungs-fake-db").fakePrisma,
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (e: string, p: Record<string, unknown>) => mockTrigger(e, p),
}));
jest.mock("@/lib/abteilungsaufgaben-uebergaenge", () => {
  const echt = jest.requireActual("@/lib/abteilungsaufgaben-uebergaenge");
  return {
    ...echt,
    oeffentlicheOnboardingAufgabenLaden: jest.fn(echt.oeffentlicheOnboardingAufgabenLaden),
    oeffentlicheOnboardingAufgabeAendern: jest.fn(echt.oeffentlicheOnboardingAufgabeAendern),
  };
});

import { NextRequest } from "next/server";
import {
  db,
  dbLeeren,
  fakePrisma,
  naechsteId,
  neueAusstattungsZeile,
  neuerLink,
  neuerStellenHinweis,
  type Zeile,
} from "../hilfen/abteilungs-fake-db";
import { GET as aufgabenLaden } from "@/app/api/onboarding-tasks/[token]/route";
import { PATCH as aufgabeAendern } from "@/app/api/onboarding-tasks/[token]/[itemId]/route";
import {
  oeffentlicheOnboardingAufgabeAendern,
  oeffentlicheOnboardingAufgabenLaden,
} from "@/lib/abteilungsaufgaben-uebergaenge";
import { MELDUNGEN } from "@/lib/abteilungsaufgaben";

const echtUebergaenge = jest.requireActual<typeof import("@/lib/abteilungsaufgaben-uebergaenge")>(
  "@/lib/abteilungsaufgaben-uebergaenge",
);
const mockLaden = oeffentlicheOnboardingAufgabenLaden as jest.Mock;
const mockAendern = oeffentlicheOnboardingAufgabeAendern as jest.Mock;

type FakeTabelle = Record<string, jest.Mock>;
const fp = fakePrisma as unknown as Record<string, FakeTabelle>;

// =============================================
// Testdaten
// =============================================

const BASIS = "https://hr.example.org";
const TAG = 86_400_000;
const BEGINN = new Date("2026-10-01T00:00:00.000Z");

function vorgang(teil: Zeile = {}): Zeile {
  return {
    id: "onb-1",
    displayId: "ONB-2026-031",
    organizationId: "org-1",
    status: "SUPERVISOR_SUBMITTED",
    firstName: "Anna",
    lastName: "Beispiel",
    email: "anna.privat@example.org",
    supervisorEmail: "a.leitung@example.org",
    supervisorSubmittedAt: new Date(Date.now() - 2 * TAG),
    personalData: { firstName: "Anna", lastName: "Beispiel" },
    supervisorData: {
      isComplete: true,
      vertragsbeginn: BEGINN,
      stellenbeschreibung: "Lehrkraft Sek. I",
      betriebsstaette: "Minden, Hauptstandort",
    },
    organization: { name: "FES Minden", mandantNumber: "01" },
    ...teil,
  };
}

function aufgabe(teil: Zeile = {}): Zeile {
  return {
    id: `i-${naechsteId()}`,
    onboardingId: "onb-1",
    templateItemId: null,
    title: "Benutzerkonto anlegen",
    category: "Vor Arbeitsbeginn",
    orderIndex: naechsteId(),
    description: null,
    assignee: "IT",
    relativeDueDays: null,
    isCompleted: false,
    completedAt: null,
    completedById: null,
    dueDate: new Date("2026-09-24T00:00:00.000Z"),
    notes: null,
    abteilungKommentar: null,
    abteilungKommentarAm: null,
    // Paket A3 (S14): Spalten mit den Standardwerten des Schemas — der Link-
    // PATCH schaltet nur mit `entfaelltAm: null` im WHERE um.
    herkunft: null,
    eilt: false,
    entfaelltAm: null,
    ...teil,
  };
}

function link(teil: Zeile = {}): Zeile {
  return neuerLink({
    onboardingId: "onb-1",
    departmentKey: "IT",
    departmentName: "IT-Abteilung",
    email: "it@example.org",
    token: "tok-it",
    expiresAt: new Date(Date.now() + 60 * TAG),
    sentAt: new Date(Date.now() - 5 * TAG),
    lastSentAt: new Date(Date.now() - 5 * TAG),
    lastSendStatus: "SENT",
    ...teil,
  });
}

/** Ein Offboarding-Vorgang samt Link — fuer die Modulkreuzung. */
function offboardingMitLink(): void {
  db.vorgaenge = [
    {
      id: "off-1",
      displayId: "OFF-2027-GYM-014",
      organizationId: "org-1",
      status: "HANDOVER_PHASE",
      employeeFirstName: "Max",
      employeeLastName: "Mustermann",
      lastWorkingDay: new Date("2027-07-31T00:00:00.000Z"),
      organization: { name: "FES Minden", mandantNumber: "01" },
    },
  ];
  db.links.push(
    neuerLink({
      offboardingId: "off-1",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      token: "tok-off",
      expiresAt: new Date(Date.now() + 60 * TAG),
      sentAt: new Date(Date.now() - 5 * TAG),
      lastSendStatus: "SENT",
    }),
  );
}

// Jede Anfrage bekommt eine eigene IP — die IP-Bremse (20/min) ist ein
// Modulzaehler und gilt ueber alle Tests dieser Datei hinweg.
let ipNummer = 0;
function neueIp(): string {
  ipNummer++;
  return `10.${(ipNummer >> 16) & 255}.${(ipNummer >> 8) & 255}.${ipNummer & 255}`;
}

function anfrage(
  url: string,
  method: string,
  opts: { body?: unknown; roh?: string; ip?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  let body: string | undefined;
  if (opts.roh !== undefined) {
    body = opts.roh;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  return new NextRequest(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}

const alteUmgebung = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = BASIS;
  dbLeeren();
  db.onboardingVorgaenge = [vorgang()];
  mockTrigger.mockImplementation(async (_e, p) => ({ status: "SENT", recipient: String(p.email ?? "hr@example.org") }));
  mockLaden.mockReset();
  mockLaden.mockImplementation(echtUebergaenge.oeffentlicheOnboardingAufgabenLaden);
  mockAendern.mockReset();
  mockAendern.mockImplementation(echtUebergaenge.oeffentlicheOnboardingAufgabeAendern);
});

afterAll(() => {
  process.env = alteUmgebung;
});

// =============================================
// GET /api/onboarding-tasks/[token]
// =============================================

describe("GET /api/onboarding-tasks/[token]", () => {
  const laden = (token: string, ip = neueIp()) =>
    aufgabenLaden(anfrage(`${BASIS}/api/onboarding-tasks/${token}`, "GET", { ip }), {
      params: Promise.resolve({ token }),
    });

  it("429 durch die IP-Bremse VOR dem Dienst (21. Aufruf derselben IP)", async () => {
    mockLaden.mockResolvedValue({ status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } });
    const ip = neueIp();
    for (let i = 0; i < 20; i++) {
      expect((await laden(`geraten-${i}`, ip)).status).toBe(404);
    }
    const res = await laden("geraten-21", ip);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN });
    // Der Dienst — und damit der Token-Lookup — lief beim 21. Aufruf nicht mehr.
    expect(mockLaden).toHaveBeenCalledTimes(20);
  });

  it.each([
    [404, { error: MELDUNGEN.LINK_UNGUELTIG }],
    [410, { error: MELDUNGEN.VORGANG_NICHT_MEHR_AKTIV }],
    [410, { error: MELDUNGEN.LINK_ABGELAUFEN }],
    [200, { data: { readOnly: true } }],
  ])("reicht %i und den Body des Dienstes 1:1 weiter", async (status, body) => {
    mockLaden.mockResolvedValue({ status, body });
    const res = await laden("tok-x");
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
    expect(mockLaden).toHaveBeenCalledWith("tok-x");
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockLaden.mockRejectedValue(new Error("DB weg"));
    const res = await laden("tok-x");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    stumm.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    beforeEach(() => {
      db.links = [link()];
      db.onboardingAufgaben = [
        aufgabe({
          title: "Benutzerkonto anlegen",
          description: "Konto in der Schulverwaltung und in Microsoft 365",
          notes: "Intern: Rücksprache Schulleitung",
        }),
        aufgabe({ title: "Schlüssel bestellen", assignee: "VERWALTUNG" }),
      ];
    });

    it("liefert nur die eigenen Aufgaben mit Hinweis — ohne interne Notiz und Urheber", async () => {
      const res = await laden("tok-it");
      expect(res.status).toBe(200);
      const { data } = await res.json();

      expect(data.modul).toBe("ONBOARDING");
      expect(data.abteilung).toEqual({ key: "IT", name: "IT-Abteilung" });
      expect(data.vorgang).toEqual({
        vorgangsnummer: "ONB-2026-031",
        mitarbeiterName: "Anna Beispiel",
        einrichtung: "FES Minden",
        bezugsdatum: BEGINN.toISOString(),
      });
      expect(data.aufgaben).toHaveLength(1);
      // Wie im Offboarding (abteilungsaufgaben-routen.test.ts) — im Onboarding
      // seit Paket A3 (S14) dazu Bemerkung, „Eilt“ und „entfällt“. Herkunft und
      // `entfaelltAm` selbst gehen nicht hinaus.
      expect(Object.keys(data.aufgaben[0]).sort()).toEqual(
        [
          "abteilungKommentar",
          "abteilungKommentarAm",
          "bemerkung",
          "category",
          "completedAt",
          "description",
          "dueDate",
          "eilt",
          "entfaellt",
          "id",
          "isCompleted",
          "orderIndex",
          "title",
        ].sort(),
      );
      expect(data.aufgaben[0]).toMatchObject({ bemerkung: null, eilt: false, entfaellt: false });
      expect(data.aufgaben[0].description).toBe("Konto in der Schulverwaltung und in Microsoft 365");
      expect(JSON.stringify(data)).not.toContain("Intern: Rücksprache");
      // Der Fortschritt zaehlt nur die eigenen Aufgaben.
      expect(data.fortschritt).toEqual({ gesamt: 1, erledigt: 0, prozent: 0 });
      // Ausstattung & Zugaenge: eigene Felder, ohne Ausstattung leer.
      expect(data.arbeitsort).toBeNull();
      expect(data.angaben).toEqual([]);
      expect(data.hinweis).toBeNull();
      expect(db.links[0].openCount).toBe(1);
    });

    it("nennt nie die private Adresse der Person — auch nicht im geladenen Datensatz", async () => {
      const res = await laden("tok-it");
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain("anna.privat@example.org");

      // Der Vorgang wird mit EIGENEM select geladen; `email`, `token` und die
      // Fragebogen-Angaben ausser dem Namen stehen gar nicht erst darin.
      const aufruf = fp.offboardingDepartmentLink.findUnique.mock.calls[0][0] as {
        include: { onboarding: { select: Record<string, unknown> } };
      };
      const felder = Object.keys(aufruf.include.onboarding.select);
      expect(felder).not.toContain("email");
      expect(felder).not.toContain("token");
      expect(felder).not.toContain("supervisorToken");
      expect(aufruf.include.onboarding.select.personalData).toEqual({
        select: { firstName: true, lastName: true },
      });
      // Paket A3 (S13, Feinplan 1.8): Der Arbeitsort kommt mit — nur sein Name,
      // fuer das Mailfeld `arbeitsort` auf dem Link-Weg. `data.vorgang` bleibt
      // unveraendert (oben); als eigenes Feld der Seite kommt er mit S14.
      expect(aufruf.include.onboarding.select.arbeitsortId).toBe(true);
      expect(aufruf.include.onboarding.select.arbeitsort).toEqual({ select: { name: true } });
    });

    it("zeigt nur die Zusatzfelder, die der Schlüssel sehen darf", async () => {
      const fuerIt = await (await laden("tok-it")).json();
      expect(fuerIt.data.zusatz).toEqual({
        stellenbezeichnung: "Lehrkraft Sek. I",
        betriebsstaette: "Minden, Hauptstandort",
        ansprechpartner_email: "a.leitung@example.org",
      });

      // Die Buchhaltung braucht nichts davon und bekommt deshalb nichts.
      db.links = [link({ departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", token: "tok-bh" })];
      db.onboardingAufgaben = [aufgabe({ assignee: "BUCHHALTUNG" })];
      const fuerBuchhaltung = await (await laden("tok-bh")).json();
      expect(fuerBuchhaltung.data.zusatz).toEqual({});
    });

    it("weist einen Offboarding-Token mit „Ungültiger Link“ ab (kein Hinweis, dass es ihn gibt)", async () => {
      offboardingMitLink();
      const res = await laden("tok-off");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: MELDUNGEN.LINK_UNGUELTIG });
    });

    it("410 „nicht mehr aktiv“ bei EXPIRED, nur lesen bei COMPLETED", async () => {
      db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
      const abgelaufen = await laden("tok-it");
      expect(abgelaufen.status).toBe(410);
      expect(await abgelaufen.json()).toEqual({ error: MELDUNGEN.VORGANG_NICHT_MEHR_AKTIV });

      db.onboardingVorgaenge = [vorgang({ status: "COMPLETED" })];
      const lesend = await laden("tok-it");
      expect(lesend.status).toBe(200);
      expect((await lesend.json()).data.readOnly).toBe(true);
    });

    it("schreibt „Name folgt“, solange niemand den Namen kennt", async () => {
      db.onboardingVorgaenge = [
        vorgang({ firstName: null, lastName: null, personalData: { firstName: null, lastName: null } }),
      ];
      const { data } = await (await laden("tok-it")).json();
      expect(data.vorgang.mitarbeiterName).toBe(MELDUNGEN.NAME_FOLGT);
    });

    // ---- Paket A3 (S14): Ausstattung & Zugaenge auf der Link-Seite ----

    describe("Ausstattung & Zugänge (Regel 7, 1.8, F2)", () => {
      it("Arbeitsort als eigenes Feld — nur bei Abweichung; `vorgang` und `zusatz` unverändert", async () => {
        db.onboardingVorgaenge = [
          vorgang({ arbeitsortId: "org-foev", arbeitsort: { name: "Förderverein Minden" } }),
        ];
        const { data } = await (await laden("tok-it")).json();
        expect(data.arbeitsort).toBe("Förderverein Minden");
        // Nicht in `vorgang` (dort sind die Felder festgelegt) und nicht in `zusatz`.
        expect(data.vorgang).toEqual({
          vorgangsnummer: "ONB-2026-031",
          mitarbeiterName: "Anna Beispiel",
          einrichtung: "FES Minden",
          bezugsdatum: BEGINN.toISOString(),
        });
        expect(data.zusatz).toEqual({
          stellenbezeichnung: "Lehrkraft Sek. I",
          betriebsstaette: "Minden, Hauptstandort",
          ansprechpartner_email: "a.leitung@example.org",
        });

        // Gleich der Einrichtung (gleicher Name) → null, wie das Mailfeld (F15).
        db.onboardingVorgaenge = [vorgang({ arbeitsortId: "org-x", arbeitsort: { name: "FES Minden" } })];
        expect((await (await laden("tok-it")).json()).data.arbeitsort).toBeNull();
      });

      it("je Aufgabe Bemerkung (getrennt vom Katalog-Hinweis), „Eilt“ und „entfällt“", async () => {
        db.ausstattungZeilen = [
          neueAusstattungsZeile({
            id: "aus-ipad",
            onboardingId: "onb-1",
            departmentKey: "IT",
            art: "JA_NEIN",
            bezeichnung: "Dienst-iPad",
            aufgabeTitel: "Dienst-iPad bereitstellen",
            quelle: "FUEHRUNGSKRAFT",
            bemerkung: "Mit Stift und Hülle",
            bemerkungQuelle: "FUEHRUNGSKRAFT",
          }),
          neueAusstattungsZeile({
            id: "aus-zug",
            onboardingId: "onb-1",
            departmentKey: "IT",
            art: "AUSWAHL",
            bezeichnung: "Zugänge",
            aufgabeTitel: "Zugang einrichten",
            auswahl: ["WebUntis"],
            quelle: "FUEHRUNGSKRAFT",
            bemerkung: "Nur lesend",
            bemerkungQuelle: "BEIDE",
          }),
        ];
        db.onboardingAufgaben = [
          aufgabe({
            id: "i-ipad",
            title: "Dienst-iPad bereitstellen",
            category: "Ausstattung & Zugänge",
            orderIndex: -100000,
            herkunft: "AUSSTATTUNG",
            eilt: true,
            description: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
          }),
          aufgabe({
            id: "i-zug",
            title: "Zugang einrichten: WebUntis",
            category: "Ausstattung & Zugänge",
            orderIndex: -99900,
            herkunft: "AUSSTATTUNG",
            isCompleted: true,
            completedAt: new Date(),
            entfaelltAm: new Date(),
          }),
          aufgabe({ id: "i-vorlage", title: "Benutzerkonto anlegen", description: "M365" }),
        ];
        db.ausstattungAufgaben = [
          { ausstattungId: "aus-ipad", option: "", checklistItemId: "i-ipad", createdAt: new Date() },
          { ausstattungId: "aus-zug", option: "WebUntis", checklistItemId: "i-zug", createdAt: new Date() },
        ];

        const { data } = await (await laden("tok-it")).json();
        const nach = (id: string) => data.aufgaben.find((a: Zeile) => a.id === id);
        expect(nach("i-ipad")).toMatchObject({
          bemerkung: { text: "Mit Stift und Hülle", label: "Bemerkung der Führungskraft" },
          eilt: true,
          entfaellt: false,
          // Die Bemerkung steht NIE in `description` (dort nur der Katalog-Hinweis).
          description: "Erst nach Verpflichtung auf Vertraulichkeit freischalten.",
        });
        expect(nach("i-zug")).toMatchObject({
          bemerkung: { text: "Nur lesend", label: "Bemerkung der Führungskraft, ergänzt durch die Personalabteilung" },
          entfaellt: true,
          isCompleted: true,
        });
        expect(nach("i-vorlage")).toMatchObject({ bemerkung: null, eilt: false, entfaellt: false });
        // Ausstattung steht oben (orderIndex unter allen Vorlagenpunkten).
        expect(data.aufgaben.map((a: Zeile) => a.id)).toEqual(["i-ipad", "i-zug", "i-vorlage"]);
        // Fortschritt OHNE die entfallene Aufgabe (F2): 0 von 2, nicht 1 von 3.
        expect(data.fortschritt).toEqual({ gesamt: 2, erledigt: 0, prozent: 0 });
        // Interne Spalten gehen nicht hinaus.
        expect(nach("i-ipad")).not.toHaveProperty("herkunft");
        expect(nach("i-ipad")).not.toHaveProperty("entfaelltAm");
      });

      it("Fortschritt: entfallene zählen weder im Zähler noch im Nenner; nur entfallene → 0 von 0", async () => {
        db.onboardingAufgaben = [
          aufgabe({ id: "i-1", isCompleted: true, completedAt: new Date() }),
          aufgabe({ id: "i-2" }),
          aufgabe({ id: "i-3", herkunft: "AUSSTATTUNG", isCompleted: true, completedAt: new Date(), entfaelltAm: new Date() }),
        ];
        expect((await (await laden("tok-it")).json()).data.fortschritt).toEqual({ gesamt: 2, erledigt: 1, prozent: 50 });

        db.onboardingAufgaben = [
          aufgabe({ id: "i-3", herkunft: "AUSSTATTUNG", isCompleted: true, completedAt: new Date(), entfaelltAm: new Date() }),
        ];
        expect((await (await laden("tok-it")).json()).data.fortschritt).toEqual({ gesamt: 0, erledigt: 0, prozent: 0 });
      });

      it("Angaben: eigene und freigegebene; Hinweis nur der eigenen Stelle — fremde verlassen den Server nie", async () => {
        db.ausstattungZeilen = [
          neueAusstattungsZeile({
            onboardingId: "onb-1",
            departmentKey: "FACILITY",
            art: "ANGABE",
            angabeSchluessel: "UNTERRICHTSFAECHER",
            bezeichnung: "Unterrichtsfächer",
            angabe: "Chemie, Sport",
            sichtbarFuer: ["IT"],
            quelle: "FUEHRUNGSKRAFT",
          }),
          neueAusstattungsZeile({
            onboardingId: "onb-1",
            departmentKey: "IT",
            art: "ANGABE",
            angabeSchluessel: "DURCHWAHL",
            bezeichnung: "Gewünschte Durchwahl",
            angabe: "214",
            quelle: "FUEHRUNGSKRAFT",
          }),
          neueAusstattungsZeile({
            onboardingId: "onb-1",
            departmentKey: "VERWALTUNG",
            art: "ANGABE",
            angabeSchluessel: "ARBEITSPLATZ_RAUM",
            bezeichnung: "Raum des Arbeitsplatzes",
            angabe: "Büro 2.14",
            quelle: "FUEHRUNGSKRAFT",
          }),
        ];
        db.stellenHinweise = [
          neuerStellenHinweis({ onboardingId: "onb-1", departmentKey: "IT", text: "Laptop bitte mit Dockingstation", quelle: "FUEHRUNGSKRAFT" }),
          neuerStellenHinweis({ onboardingId: "onb-1", departmentKey: "VERWALTUNG", text: "Nur für die Verwaltung", quelle: "FUEHRUNGSKRAFT" }),
        ];

        const res = await laden("tok-it");
        const { data } = await res.json();
        expect(data.angaben).toEqual([
          { label: "Gewünschte Durchwahl", wert: "214" },
          { label: "Unterrichtsfächer", wert: "Chemie, Sport" },
        ]);
        expect(data.hinweis).toBe("Laptop bitte mit Dockingstation");
        const text = JSON.stringify(data);
        expect(text).not.toContain("Büro 2.14");
        expect(text).not.toContain("Nur für die Verwaltung");

        // Die Buchhaltung sieht nichts davon.
        db.links = [link({ departmentKey: "BUCHHALTUNG", departmentName: "Buchhaltung", token: "tok-bh" })];
        db.onboardingAufgaben = [aufgabe({ assignee: "BUCHHALTUNG" })];
        const fuerBuchhaltung = (await (await laden("tok-bh")).json()).data;
        expect(fuerBuchhaltung.angaben).toEqual([]);
        expect(fuerBuchhaltung.hinweis).toBeNull();
      });
    });
  });
});

// =============================================
// PATCH /api/onboarding-tasks/[token]/[itemId]
// =============================================

describe("PATCH /api/onboarding-tasks/[token]/[itemId]", () => {
  const aendern = (token: string, itemId: string, opts: Parameters<typeof anfrage>[2] = {}) =>
    aufgabeAendern(anfrage(`${BASIS}/api/onboarding-tasks/${token}/${itemId}`, "PATCH", { ip: neueIp(), ...opts }), {
      params: Promise.resolve({ token, itemId }),
    });

  it("429 durch die IP-Bremse VOR dem Dienst (21. Aufruf derselben IP)", async () => {
    mockAendern.mockResolvedValue({ status: 404, body: { error: MELDUNGEN.LINK_UNGUELTIG } });
    const ip = neueIp();
    for (let i = 0; i < 20; i++) {
      expect((await aendern(`geraten-${i}`, "i-1", { ip, body: { isCompleted: true } })).status).toBe(404);
    }
    const res = await aendern("geraten-21", "i-1", { ip, body: { isCompleted: true } });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: MELDUNGEN.ZU_VIELE_ANFRAGEN });
    expect(mockAendern).toHaveBeenCalledTimes(20);
  });

  it("kaputtes JSON → Dienst mit undefined", async () => {
    mockAendern.mockResolvedValue({ status: 400, body: { error: MELDUNGEN.UNGUELTIGE_EINGABE } });
    const res = await aendern("tok-x", "i-1", { roh: "{kaputt", headers: { "Content-Type": "application/json" } });
    expect(mockAendern).toHaveBeenCalledWith("tok-x", "i-1", undefined);
    expect(res.status).toBe(400);
  });

  it("reicht Status und Body des Dienstes 1:1 weiter", async () => {
    const body = {
      data: { aufgabe: { id: "i-1" }, fortschritt: { gesamt: 1, erledigt: 1, prozent: 100 }, allTasksComplete: true },
    };
    mockAendern.mockResolvedValue({ status: 200, body });
    const res = await aendern("tok-x", "i-1", { body: { isCompleted: true, comment: "Erledigt" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(mockAendern).toHaveBeenCalledWith("tok-x", "i-1", { isCompleted: true, comment: "Erledigt" });
  });

  it("500 bei einer Ausnahme im Dienst", async () => {
    const stumm = jest.spyOn(console, "error").mockImplementation(() => {});
    mockAendern.mockRejectedValue(new Error("DB weg"));
    const res = await aendern("tok-x", "i-1", { body: { isCompleted: true } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Serverfehler" });
    stumm.mockRestore();
  });

  describe("mit dem echten Dienst", () => {
    let itemId: string;

    beforeEach(() => {
      db.links = [link()];
      const a = aufgabe({ title: "Benutzerkonto anlegen", notes: "Interne Notiz" });
      itemId = a.id as string;
      db.onboardingAufgaben = [a];
    });

    function mails(event: string) {
      return mockTrigger.mock.calls.filter((c) => c[0] === event);
    }

    it("speichert den Kommentar getrennt von der internen Notiz; `notes` im Body wird verworfen", async () => {
      const res = await aendern("tok-it", itemId, {
        body: { isCompleted: true, comment: "Konto angelegt", notes: "überschrieben?" },
      });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.aufgabe).toMatchObject({ isCompleted: true, abteilungKommentar: "Konto angelegt" });
      expect(data.aufgabe).not.toHaveProperty("notes");
      expect(db.onboardingAufgaben[0]).toMatchObject({
        notes: "Interne Notiz",
        abteilungKommentar: "Konto angelegt",
      });
    });

    it("weist einen Kommentar über 1000 Zeichen mit 400 ab", async () => {
      const res = await aendern("tok-it", itemId, { body: { comment: "x".repeat(1001) } });
      expect(res.status).toBe(400);
      expect(db.onboardingAufgaben[0].abteilungKommentar).toBeNull();
    });

    it("meldet „erledigt“ genau einmal — der zweite Klick ist 200 ohne Mail", async () => {
      const erste = await aendern("tok-it", itemId, { body: { isCompleted: true } });
      expect(erste.status).toBe(200);
      const zweite = await aendern("tok-it", itemId, { body: { isCompleted: true } });
      expect(zweite.status).toBe(200);
      expect(mails("onboarding-task-completed")).toHaveLength(1);
    });

    it("bestätigt der Abteilung genau einmal, wenn ihre letzte Aufgabe erledigt ist", async () => {
      const zweite = aufgabe({ title: "Zugänge einrichten" });
      db.onboardingAufgaben.push(zweite);

      await aendern("tok-it", itemId, { body: { isCompleted: true } });
      expect(mails("onboarding-department-completed")).toHaveLength(0);

      await aendern("tok-it", zweite.id as string, { body: { isCompleted: true, comment: "alles fertig" } });
      const fertig = mails("onboarding-department-completed");
      expect(fertig).toHaveLength(1);
      expect(fertig[0][1]).toMatchObject({ email: "it@example.org", abteilung: "IT-Abteilung", anzahl_aufgaben: 2 });
      expect(db.links[0].allTasksComplete).toBe(true);

      // Ein weiteres Speichern (nur Kommentar) bestaetigt nicht noch einmal —
      // HR erfaehrt den neuen Kommentar aber (E-A17, S18).
      await aendern("tok-it", zweite.id as string, { body: { comment: "Nachtrag" } });
      expect(mails("onboarding-department-completed")).toHaveLength(1);
      expect(mails("onboarding-task-completed").map((c) => c[1].meldung_kurz)).toEqual([
        "erledigt",
        "erledigt, mit Kommentar",
        "kommentiert",
      ]);
    });

    // ---- Paket A3 (S18, E-A17): jeder neue Kommentar erreicht das HR-Postfach ----

    it("ein neuer Kommentar ohne Abhaken meldet HR (kommentarGeaendert) — unverändert oder geleert nicht", async () => {
      db.replyToEmail = "personal@example.org";
      const erste = await aendern("tok-it", itemId, { body: { comment: "Kommt am 03.10." } });
      expect(erste.status).toBe(200);
      expect(db.onboardingAufgaben[0].isCompleted).toBe(false);
      const gemeldet = mails("onboarding-task-completed");
      expect(gemeldet).toHaveLength(1);
      expect(gemeldet[0][1]).toMatchObject({
        hr_postfach: "personal@example.org",
        ist_erledigt: "",
        nur_kommentar: "ja",
        meldung_kurz: "kommentiert",
        kommentar_text: "Kommt am 03.10.",
      });
      expect(gemeldet[0][1]).not.toHaveProperty("email");

      // Derselbe Text: nichts geaendert, keine Mail. Geleert: keine Mail.
      expect((await aendern("tok-it", itemId, { body: { comment: "Kommt am 03.10." } })).status).toBe(200);
      expect((await aendern("tok-it", itemId, { body: { comment: "" } })).status).toBe(200);
      expect(mails("onboarding-task-completed")).toHaveLength(1);
      expect(db.onboardingAufgaben[0].abteilungKommentar).toBeNull();
    });

    it("abhaken und kommentieren in einem PATCH: genau eine Mail", async () => {
      await aendern("tok-it", itemId, { body: { isCompleted: true, comment: "Konto steht" } });
      const gemeldet = mails("onboarding-task-completed");
      expect(gemeldet).toHaveLength(1);
      expect(gemeldet[0][1]).toMatchObject({ ist_erledigt: "ja", nur_kommentar: "", meldung_kurz: "erledigt, mit Kommentar" });
    });

    it("409 bei abgeschlossenem Vorgang, 410 bei EXPIRED — die Aufgabe bleibt unverändert", async () => {
      db.onboardingVorgaenge = [vorgang({ status: "COMPLETED" })];
      const abgeschlossen = await aendern("tok-it", itemId, { body: { isCompleted: true } });
      expect(abgeschlossen.status).toBe(409);
      expect(await abgeschlossen.json()).toEqual({ error: MELDUNGEN.VORGANG_ABGESCHLOSSEN_NUR_LESEN });

      db.onboardingVorgaenge = [vorgang({ status: "EXPIRED" })];
      const beendet = await aendern("tok-it", itemId, { body: { isCompleted: true } });
      expect(beendet.status).toBe(410);
      expect(await beendet.json()).toEqual({ error: MELDUNGEN.VORGANG_NICHT_MEHR_AKTIV });

      expect(db.onboardingAufgaben[0].isCompleted).toBe(false);
    });

    it("weist einen Offboarding-Token ab, ohne etwas zu ändern", async () => {
      offboardingMitLink();
      const res = await aendern("tok-off", itemId, { body: { isCompleted: true } });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: MELDUNGEN.LINK_UNGUELTIG });
      expect(db.onboardingAufgaben[0].isCompleted).toBe(false);
    });

    // ---- Paket A3 (S14): gestrichene Aufgaben (F2, Feinplan 1.11) ----

    describe("entfallene Aufgabe", () => {
      const GESTRICHEN = new Date("2026-09-20T09:00:00.000Z");

      function streichen(a: Zeile): void {
        Object.assign(a, { herkunft: "AUSSTATTUNG", isCompleted: true, completedAt: GESTRICHEN, completedById: "hr-1", entfaelltAm: GESTRICHEN });
      }

      it.each([[true], [false]])(
        "409 AUFGABE_ENTFAELLT bei isCompleted: %s — nichts wird geschrieben, auch kein mitgeschickter Kommentar",
        async (isCompleted) => {
          streichen(db.onboardingAufgaben[0]);
          const vorher = structuredClone(db.onboardingAufgaben[0]);
          const res = await aendern("tok-it", itemId, { body: { isCompleted, comment: "Schon erledigt" } });
          expect(res.status).toBe(409);
          expect(await res.json()).toEqual({ error: MELDUNGEN.AUFGABE_ENTFAELLT, grund: "AUFGABE_ENTFAELLT" });
          expect(db.onboardingAufgaben[0]).toEqual(vorher);
          expect(db.audits).toEqual([]);
          expect(mockTrigger).not.toHaveBeenCalled();
        },
      );

      it("ein Kommentar allein bleibt möglich; `entfaellt` steht in der Antwort", async () => {
        streichen(db.onboardingAufgaben[0]);
        const res = await aendern("tok-it", itemId, { body: { comment: "Schlüssel war schon ausgegeben" } });
        expect(res.status).toBe(200);
        const { data } = await res.json();
        expect(data.aufgabe).toMatchObject({ entfaellt: true, isCompleted: true, abteilungKommentar: "Schlüssel war schon ausgegeben" });
        // Ohne zaehlende Aufgabe: 0 von 0 (die entfallene zaehlt nicht).
        expect(data.fortschritt).toEqual({ gesamt: 0, erledigt: 0, prozent: 0 });
        expect(db.onboardingAufgaben[0]).toMatchObject({ entfaelltAm: GESTRICHEN, isCompleted: true });
        // Seit S18 (E-A17) erfaehrt HR auch diesen Kommentar.
        expect(mails("onboarding-task-completed")).toHaveLength(1);
        expect(mails("onboarding-task-completed")[0][1]).toMatchObject({ meldung_kurz: "kommentiert" });
      });

      it("Wettlauf: beim Lesen noch offen, vor der Linksperre gestrichen → 409, `entfaelltAm` und `isCompleted` bleiben", async () => {
        // Haken zwischen dem Lesestand vor der Transaktion und `linksSperrenIn`:
        // Der erste Sperr-Aufruf streicht die Aufgabe zuerst — wie eine HR-
        // Aktion, die vor dieser Transaktion committet.
        const sperren = fp.offboardingDepartmentLink.updateMany;
        const echt = sperren.getMockImplementation()!;
        sperren.mockImplementationOnce(async (args: unknown) => {
          streichen(db.onboardingAufgaben[0]);
          return echt(args);
        });

        // „wieder öffnen“ traefe mit WHERE isCompleted: true die gestrichene Aufgabe.
        const res = await aendern("tok-it", itemId, { body: { isCompleted: false } });
        expect(res.status).toBe(409);
        expect((await res.json()).grund).toBe("AUFGABE_ENTFAELLT");
        expect(db.onboardingAufgaben[0]).toMatchObject({ entfaelltAm: GESTRICHEN, isCompleted: true, completedAt: GESTRICHEN });
        expect(db.audits).toEqual([]);
        expect(mockTrigger).not.toHaveBeenCalled();
      });

      it("das bedingte Umschalten traegt `entfaelltAm: null` im WHERE (zweites Netz)", async () => {
        await aendern("tok-it", itemId, { body: { isCompleted: true } });
        const aufrufe = fp.checklistItem.updateMany.mock.calls.map((c) => c[0] as { where: Zeile });
        expect(aufrufe).toContainEqual(
          expect.objectContaining({ where: { id: itemId, isCompleted: false, entfaelltAm: null } }),
        );
      });
    });
  });
});
