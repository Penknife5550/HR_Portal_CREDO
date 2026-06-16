/**
 * Tests: Starterpaket-Versand-Service (src/lib/starterpaket.ts)
 *
 * - leere Konfiguration -> NO_DOCS (kein Versand)
 * - SENT -> Zeitstempel + AuditLog mit Dokument-Hashes
 * - Mailer FAILED -> kein Zeitstempel, FAILED durchgereicht
 */

const mockPrisma = {
  onboardingProcess: { findUnique: jest.fn(), update: jest.fn() },
  starterpaketAuswahl: { findMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockSendEventEmail = jest.fn();
const mockReadFile = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/mailer", () => ({ sendEventEmail: mockSendEventEmail }));
jest.mock("@/lib/file-upload", () => ({ readUploadedFile: mockReadFile }));

import { sendStarterpaket } from "@/lib/starterpaket";

const onboarding = {
  id: "onb1",
  email: "max@example.org",
  firstName: "Max",
  lastName: "Mustermann",
  displayId: "2026-GYM-001",
  organizationId: "org1",
  organization: { name: "Gymnasium" },
  personalData: { firstName: "Max", lastName: "Mustermann" },
};

const auswahlRow = {
  dokument: {
    id: "d1",
    name: "Leitbild",
    dateipfad: "/app/uploads/starterpaket/leitbild.pdf",
    originalName: "leitbild.pdf",
    hash: "abc123",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.onboardingProcess.findUnique.mockResolvedValue(onboarding);
  mockPrisma.onboardingProcess.update.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockReadFile.mockResolvedValue(Buffer.from("%PDF-1.4 test"));
  mockSendEventEmail.mockResolvedValue({ status: "SENT" });
});

describe("sendStarterpaket", () => {
  it("liefert NO_DOCS und versendet nichts, wenn nichts konfiguriert ist", async () => {
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([]);

    const result = await sendStarterpaket({ onboardingId: "onb1", userId: "u1" });
    expect(result.status).toBe("NO_DOCS");
    expect(mockSendEventEmail).not.toHaveBeenCalled();
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
  });

  it("versendet die markierten PDFs als Anhaenge und schreibt den Nachweis", async () => {
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([auswahlRow]);

    const result = await sendStarterpaket({
      onboardingId: "onb1",
      userId: "u1",
      ipAddress: "10.0.0.1",
    });

    expect(result.status).toBe("SENT");
    // Mailer mit Event + Anhang aufgerufen
    expect(mockSendEventEmail).toHaveBeenCalledWith(
      "onboarding-starter-packet-sent",
      expect.objectContaining({ email: "max@example.org", anzahlDokumente: 1 }),
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: "leitbild.pdf", contentType: "application/pdf" }),
        ]),
      }),
    );
    // Nachweis: Zeitstempel + Zaehler
    expect(mockPrisma.onboardingProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "onb1" },
        data: expect.objectContaining({
          starterPacketSentCount: { increment: 1 },
        }),
      }),
    );
    // Audit enthaelt Dokumentname + Hash
    const auditArg = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(auditArg.data.action).toBe("STARTERPAKET_SENT");
    expect(auditArg.data.details.dokumente).toEqual([{ name: "Leitbild", hash: "abc123" }]);
  });

  it("reicht einen Mailer-Fehlschlag durch und setzt KEINEN Zeitstempel", async () => {
    mockPrisma.starterpaketAuswahl.findMany.mockResolvedValue([auswahlRow]);
    mockSendEventEmail.mockResolvedValue({ status: "FAILED", detail: "SMTP weg" });

    const result = await sendStarterpaket({ onboardingId: "onb1", userId: "u1" });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toContain("SMTP");
    expect(mockPrisma.onboardingProcess.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
