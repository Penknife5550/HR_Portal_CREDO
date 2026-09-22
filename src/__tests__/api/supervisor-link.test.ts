/**
 * Tests: Vorgesetzten-Link erzeugen (POST /api/onboarding/[id]/supervisor-link)
 *
 * Drei Eigenschaften, die es vorher nicht gab:
 *   1. WIEDERHOLUNGSSICHER — ein gueltiger Link an dieselbe Adresse bleibt,
 *      auch bei einem Doppelklick. Frueher toetete jeder Aufruf den Link, mit
 *      dem die Fuehrungskraft gerade arbeitete.
 *   2. KEIN VERALTETER STATUS — der Status kommt aus `statusAbgleichen` nach der
 *      Sperre, nicht aus dem vorher gelesenen Stand (frueher: Lost Update).
 *   3. NICHT NACH DER ABGABE — sonst saehe eine neue Person die kompletten
 *      Verguetungsangaben.
 */

// Der Link wird aus APP_URL gebaut — fest, damit die Erwartungen unten nicht
// von der Umgebung des Rechners abhaengen.
process.env.APP_URL = "http://localhost:3000";

const mockPrisma = {
  onboardingProcess: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  supervisorData: { upsert: jest.fn() },
  auditLog: { create: jest.fn() },
  userOrgAssignment: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
const mockSession = jest.fn();
const mockWebhook = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({
  getSession: () => mockSession(),
  generateToken: () => "neuer-token",
  getTokenExpiryDate: () => new Date("2026-10-22T10:00:00Z"),
}));
jest.mock("@/lib/webhooks", () => ({
  triggerWebhooks: (...a: unknown[]) => mockWebhook(...a),
}));

import { POST } from "@/app/api/onboarding/[id]/supervisor-link/route";
import { NextRequest } from "next/server";
import { MITARBEITER_NEUTRAL } from "@/lib/onboarding-spuren";

const HR = {
  userId: "u1",
  email: "hr@credo.example",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

function req(body: unknown) {
  return new NextRequest("http://localhost:3000/api/onboarding/ob1/supervisor-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function aufrufen(body: unknown = { supervisorEmail: "schulleitung@fes.example" }) {
  return POST(req(body), { params: Promise.resolve({ id: "ob1" }) });
}

function vorgang(teil: Record<string, unknown> = {}) {
  return {
    id: "ob1",
    displayId: "2026-GYM-014",
    organizationId: "org1",
    status: "IN_PROGRESS",
    email: "anna.privat@example.org",
    firstName: null,
    lastName: null,
    submittedAt: null,
    supervisorSubmittedAt: null,
    supervisorToken: null,
    supervisorEmail: null,
    supervisorTokenExpiresAt: null,
    organization: { id: "org1", name: "FES Gymnasium", mandantNumber: "10" },
    personalData: { firstName: null, lastName: null },
    supervisorData: null,
    ...teil,
  };
}

/** Was `statusAbgleichen` nach dem Setzen des Links liest. */
function standNachLink(teil: Record<string, unknown> = {}) {
  return {
    status: "IN_PROGRESS",
    submittedAt: null,
    supervisorSubmittedAt: null,
    supervisorToken: "neuer-token",
    personalData: { currentStep: 3, isComplete: false },
    supervisorData: { isComplete: false },
    ...teil,
  };
}

const MORGEN = () => new Date(Date.now() + 86_400_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue(HR);
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang());
  mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(standNachLink());
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.supervisorData.upsert.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma),
  );
  mockWebhook.mockResolvedValue({ status: "SENT" });
});

describe("Zugriff und Eingabe", () => {
  it("verlangt eine Anmeldung", async () => {
    mockSession.mockResolvedValue(null);
    expect((await aufrufen()).status).toBe(401);
  });

  it("laesst nur HR-Bearbeiter zu — auch keinen n8n-Dienstschluessel mehr", async () => {
    for (const role of ["SERVICE", "EINRICHTUNGSLEITUNG", "VORGESETZTER"]) {
      mockSession.mockResolvedValue({ ...HR, role });
      expect((await aufrufen()).status).toBe(403);
    }
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
  });

  it("weist eine ungueltige E-Mail-Adresse mit deutscher Meldung ab", async () => {
    const res = await aufrufen({ supervisorEmail: "kein-at-zeichen" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Bitte geben Sie eine gültige E-Mail-Adresse der Führungskraft an.",
    );
  });

  it("antwortet 404 fuer einen unbekannten Vorgang", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(null);
    expect((await aufrufen()).status).toBe(404);
  });

  // Dieselbe Regel wie beim Anlegen: Sonst saehe die Person ueber den
  // Modalitaeten-Link ihre eigenen Verguetungsangaben.
  it("weist die Adresse der Person selbst ab (400) — ohne Gross/Klein", async () => {
    const res = await aufrufen({ supervisorEmail: " Anna.Privat@EXAMPLE.org " });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Die Führungskraft braucht eine eigene E-Mail-Adresse – nicht die der neuen Person.",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("verwendet auch einen alten, gueltigen Link an die Person selbst nicht weiter", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        supervisorToken: "alter-token",
        supervisorEmail: "anna.privat@example.org",
        supervisorTokenExpiresAt: MORGEN(),
      }),
    );

    const res = await aufrufen({ supervisorEmail: "anna.privat@example.org" });

    expect(res.status).toBe(400);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });
});

describe("Neuer Link", () => {
  it("setzt Token, Adresse, Ablauf und den Versandzeitpunkt bedingt — und versendet die Mail", async () => {
    const res = await aufrufen();

    expect(res.status).toBe(201);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: "ob1",
      supervisorToken: null,
      supervisorSubmittedAt: null,
      status: { notIn: ["REVIEWED", "COMPLETED", "EXPIRED"] },
    });
    expect(arg.data).toMatchObject({
      supervisorEmail: "schulleitung@fes.example",
      supervisorToken: "neuer-token",
      lastSupervisorReminderAt: null,
    });
    expect(arg.data.supervisorLinkSentAt).toBeInstanceOf(Date);
    // Kein Status im Setzen — den leitet statusAbgleichen ab.
    expect(arg.data.status).toBeUndefined();

    expect(mockWebhook).toHaveBeenCalledWith(
      "supervisor-link-created",
      expect.objectContaining({
        supervisorEmail: "schulleitung@fes.example",
        modalitaetenLink: "http://localhost:3000/modalitaeten/neuer-token",
      }),
    );
    const daten = await res.json();
    expect(daten.mailVersand).toBe("SENT");
    expect(daten.wiederverwendet).toBe(false);
  });

  it("laesst den Status, solange der Fragebogen offen ist (Link parallel zum Fragebogen)", async () => {
    await aufrufen();
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("setzt SUPERVISOR_PENDING, wenn der Fragebogen schon eingereicht ist", async () => {
    mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(
      standNachLink({
        status: "SUBMITTED",
        submittedAt: new Date(),
        personalData: { currentStep: 12, isComplete: true },
      }),
    );
    await aufrufen();
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: "ob1" },
      data: { status: "SUPERVISOR_PENDING" },
    });
  });

  it("schreibt keinen veralteten Status zurueck (frueher: Lost Update)", async () => {
    // Beim Lesen stand der Vorgang auf IN_PROGRESS; die Person hat vor
    // unserer Sperre abgesendet. Der Status kommt aus dem Neulesen.
    mockPrisma.onboardingProcess.findUniqueOrThrow.mockResolvedValue(
      standNachLink({ status: "SUBMITTED", submittedAt: new Date() }),
    );
    await aufrufen();
    const geschrieben = mockPrisma.onboardingProcess.update.mock.calls.map(
      (c) => c[0].data.status,
    );
    expect(geschrieben).not.toContain("IN_PROGRESS");
    expect(geschrieben).toEqual(["SUPERVISOR_PENDING"]);
  });

  it("meldet einen gescheiterten Mailversand an die Oberflaeche", async () => {
    mockWebhook.mockResolvedValue({ status: "FAILED" });
    const res = await aufrufen();
    expect(res.status).toBe(201);
    expect((await res.json()).mailVersand).toBe("FAILED");
  });

  it("nennt der Fuehrungskraft nicht den Namen „null null“", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ firstName: "Anna", lastName: null }),
    );
    await aufrufen();
    expect(mockWebhook.mock.calls[0][1].employeeName).toBe("Anna");
  });

  it("nennt ohne Namen die neutrale Bezeichnung — nie die private Adresse der Person", async () => {
    await aufrufen();
    const nutzlast = mockWebhook.mock.calls[0][1];
    expect(nutzlast.employeeName).toBe(MITARBEITER_NEUTRAL);
    expect(nutzlast.mitarbeiter_name).toBe(MITARBEITER_NEUTRAL);
    // Weder als eigenes Feld noch irgendwo im Payload: Der Mailer faellt fuer
    // {{mitarbeiter_name}} auf `email` zurueck, und Webhooks bekaemen alles.
    expect(nutzlast).not.toHaveProperty("email");
    expect(nutzlast).not.toHaveProperty("employeeEmail");
    expect(JSON.stringify(nutzlast)).not.toContain("anna.privat@example.org");
  });

  it("gibt die Vorgangsnummer und die Frist des Links mit", async () => {
    await aufrufen();
    expect(mockWebhook.mock.calls[0][1]).toMatchObject({
      displayId: "2026-GYM-014",
      supervisorTokenExpiresAt: "2026-10-22T10:00:00.000Z",
    });
  });
});

describe("Wiederholungssicher", () => {
  const gueltig = () =>
    vorgang({
      supervisorToken: "alter-token",
      supervisorEmail: "Schulleitung@fes.example",
      supervisorTokenExpiresAt: MORGEN(),
    });

  it("verwendet einen gueltigen Link an dieselbe Adresse wieder — ohne neue Mail", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(gueltig());

    const res = await aufrufen();

    expect(res.status).toBe(200);
    const daten = await res.json();
    expect(daten.wiederverwendet).toBe(true);
    expect(daten.modalitaetenLink).toBe("http://localhost:3000/modalitaeten/alter-token");
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("erzeugt fuer eine ANDERE Adresse einen neuen Token und entwertet den alten", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(gueltig());

    const res = await aufrufen({ supervisorEmail: "richtige.person@fes.example" });

    expect(res.status).toBe(201);
    const arg = mockPrisma.onboardingProcess.updateMany.mock.calls[0][0];
    // Nur ersetzen, wenn noch der gelesene alte Token dasteht.
    expect(arg.where.supervisorToken).toBe("alter-token");
    expect(arg.data.supervisorToken).toBe("neuer-token");
    const protokoll = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(protokoll.details.ersetztLinkAn).toBe("Schulleitung@fes.example");
  });

  it("erzeugt fuer einen abgelaufenen Link einen neuen", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({
        supervisorToken: "alter-token",
        supervisorEmail: "schulleitung@fes.example",
        supervisorTokenExpiresAt: new Date(Date.now() - 1000),
      }),
    );
    const res = await aufrufen();
    expect(res.status).toBe(201);
    expect(mockWebhook).toHaveBeenCalledTimes(1);
  });

  it("Doppelklick: Der zweite Aufruf findet den frischen Link vor und verwendet ihn wieder", async () => {
    // Beide lasen „kein Link". Der erste hat gesetzt; das bedingte UPDATE des
    // zweiten trifft danach nichts mehr (count 0).
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.onboardingProcess.findUnique
      .mockResolvedValueOnce(vorgang())
      .mockResolvedValueOnce(
        vorgang({
          supervisorToken: "token-vom-ersten-klick",
          supervisorEmail: "schulleitung@fes.example",
          supervisorTokenExpiresAt: MORGEN(),
        }),
      );

    const res = await aufrufen();

    expect(res.status).toBe(200);
    expect((await res.json()).modalitaetenLink).toBe(
      "http://localhost:3000/modalitaeten/token-vom-ersten-klick",
    );
    expect(mockWebhook).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("antwortet 409, wenn sich der Vorgang anders geaendert hat", async () => {
    mockPrisma.onboardingProcess.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.onboardingProcess.findUnique
      .mockResolvedValueOnce(vorgang())
      .mockResolvedValueOnce(vorgang({ supervisorSubmittedAt: new Date() }));

    const res = await aufrufen();

    expect(res.status).toBe(409);
    expect(mockWebhook).not.toHaveBeenCalled();
  });
});

describe("Gesperrt", () => {
  it("antwortet 409, wenn die Modalitaeten schon eingereicht sind", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ supervisorToken: "t", supervisorSubmittedAt: new Date() }),
    );
    const res = await aufrufen({ supervisorEmail: "andere@fes.example" });
    expect(res.status).toBe(409);
    expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    expect(mockWebhook).not.toHaveBeenCalled();
  });

  it("antwortet 409 auch im Altfall ohne Zeitstempel (isComplete)", async () => {
    mockPrisma.onboardingProcess.findUnique.mockResolvedValue(
      vorgang({ supervisorToken: "t", supervisorData: { isComplete: true } }),
    );
    expect((await aufrufen()).status).toBe(409);
  });

  it.each(["REVIEWED", "COMPLETED", "EXPIRED"])(
    "antwortet 409 bei Status %s",
    async (status) => {
      mockPrisma.onboardingProcess.findUnique.mockResolvedValue(vorgang({ status }));
      expect((await aufrufen()).status).toBe(409);
      expect(mockPrisma.onboardingProcess.updateMany).not.toHaveBeenCalled();
    },
  );
});
