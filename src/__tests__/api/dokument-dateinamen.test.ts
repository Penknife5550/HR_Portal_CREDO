/**
 * Tests: Dateinamen an den Dokument-Routen (Download-Header und Speichername)
 *
 * Zwei Befunde aus der Durchsicht 09/2026, beide mit sichtbarer Wirkung -
 * deshalb halten die Tests hier das NEUE Verhalten fest, nicht das alte:
 *
 * 1. Content-Disposition (Downloads Onboarding/Offboarding). Beide Routen
 *    bauten den Dateinamen mit `.replace(/[^a-zA-Z0-9._\- À-ɏ]/g, "_")`
 *    und liessen den Bereich U+00C0-U+024F ausdruecklich stehen - also genau
 *    die Umlaute. Damit trug ein HTTP-Header Nicht-ASCII-Zeichen, was der
 *    `filename`-Parameter nach RFC 6266 nicht vertraegt. Jetzt laeuft beides
 *    ueber asciiFilename() aus @/lib/file-upload, wie an den drei bereits
 *    richtigen Stellen (BEM-Download, Download erzeugter Brief-Dokumente).
 *
 * 2. Speichername (Uploads Verbeamtung/Offboarding/Fragebogen). Alle drei
 *    bauten `${Date.now()}_${bereinigterName}`. Der Zeitstempel loest nur auf
 *    Millisekunden auf: Zwei gleichzeitige Uploads derselben Datei ergaben
 *    denselben Pfad, die zweite ueberschrieb die erste stillschweigend. Jetzt
 *    vergibt sanitizeFilename() zusaetzlich acht Zeichen einer UUID.
 *
 * Der zentrale Test dazu stellt die Uhr an - bei fester Millisekunde ist der
 * UUID-Anteil das Einzige, was die beiden Namen noch trennen kann. Genau das
 * war vorher nicht da.
 */

const mockGetSession = jest.fn();
const mockValidateMagicToken = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();

const mockPrisma = {
  document: { findUnique: jest.fn(), create: jest.fn() },
  offboardingDocument: { findUnique: jest.fn(), create: jest.fn() },
  offboardingProcess: { findUnique: jest.fn() },
  civilServiceProcess: { findUnique: jest.fn() },
  civilServiceDocument: { create: jest.fn() },
  civilServiceChecklistItem: { findMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  validateMagicToken: mockValidateMagicToken,
}));
jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
  getClientIpOrNull: () => "127.0.0.1",
}));
// fs/promises wird komplett ersetzt. @/lib/file-upload wird BEWUSST NICHT
// gemockt - sanitizeFilename und asciiFilename sind ja der Gegenstand dieser
// Tests. Das Modul greift beim Laden nur auf die Namen zu, nicht auf die
// Funktionen, deshalb genuegen die vier hier gesetzten Eintraege.
jest.mock("fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  rmdir: jest.fn().mockResolvedValue(undefined),
}));

import { GET as ONBOARDING_DOWNLOAD } from "@/app/api/onboarding/[id]/documents/[docId]/route";
import { GET as OFFBOARDING_DOWNLOAD } from "@/app/api/offboarding/[id]/documents/[docId]/route";
import { POST as CIVIL_SERVICE_UPLOAD } from "@/app/api/civil-service/[id]/documents/route";
import { POST as OFFBOARDING_UPLOAD } from "@/app/api/offboarding/[id]/documents/route";
import { POST as FRAGEBOGEN_UPLOAD } from "@/app/api/fragebogen/[token]/documents/route";
import { NextRequest } from "next/server";

const HR_SESSION = {
  userId: "hr-1",
  email: "hr@credo-gruppe.de",
  role: "HR_SACHBEARBEITER",
  firstName: "H",
  lastName: "R",
};

/**
 * Der Header, so wie er kuenftig aussehen MUSS: `attachment;`, dann ein
 * gequoteter Name aus ausschliesslich \w, "-" und "." - also weder Umlaute
 * noch Anfuehrungszeichen noch Zeilenumbrueche, mit denen sich ein zweiter
 * Header einschmuggeln liesse.
 */
const NUR_ASCII_DATEINAME = /^attachment; filename="[\w\-.]*"$/;

/** Minimale, gueltige PDF-Datei - alle Upload-Routen pruefen die Magic Bytes. */
function pdfFile(name: string): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, { type: "application/pdf" });
}

/** Echo-Fassung von prisma.*.create - liefert zurueck, was hineingereicht wurde. */
function echoCreate({ data }: { data: Record<string, unknown> }) {
  return { id: "doc-neu", uploadedAt: new Date("2026-09-07T08:00:00Z"), ...data };
}

/** Die `data`-Objekte aller create-Aufrufe eines Mocks, in Aufrufreihenfolge. */
function angelegteDaten(mock: jest.Mock): Record<string, unknown>[] {
  return mock.mock.calls.map((call) => call[0].data as Record<string, unknown>);
}

beforeEach(() => {
  jest.clearAllMocks();

  mockGetSession.mockResolvedValue(HR_SESSION);
  mockValidateMagicToken.mockResolvedValue({
    valid: true,
    onboarding: { id: "onb-1" },
  });
  mockReadFile.mockResolvedValue(Buffer.from("%PDF-1.4"));
  mockWriteFile.mockResolvedValue(undefined);

  mockPrisma.civilServiceProcess.findUnique.mockResolvedValue({
    id: "vb-1",
    status: "IN_BEARBEITUNG",
  });
  mockPrisma.offboardingProcess.findUnique.mockResolvedValue({ id: "off-1" });
  mockPrisma.civilServiceChecklistItem.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({});

  mockPrisma.document.create.mockImplementation(echoCreate);
  mockPrisma.offboardingDocument.create.mockImplementation(echoCreate);
  mockPrisma.civilServiceDocument.create.mockImplementation(echoCreate);
});

// =============================================
// Befund 1 - Content-Disposition ohne Nicht-ASCII
// =============================================

async function onboardingDownload(fileName: string) {
  mockPrisma.document.findUnique.mockResolvedValue({
    id: "doc-1",
    onboardingId: "onb-1",
    fileName,
    filePath: "uploads/onb-1/1700000000000-abcdef12-datei.pdf",
    mimeType: "application/pdf",
  });
  return ONBOARDING_DOWNLOAD(
    new NextRequest("http://localhost:3000/api/onboarding/onb-1/documents/doc-1"),
    { params: Promise.resolve({ id: "onb-1", docId: "doc-1" }) },
  );
}

async function offboardingDownload(fileName: string) {
  mockPrisma.offboardingDocument.findUnique.mockResolvedValue({
    id: "doc-1",
    offboardingId: "off-1",
    fileName,
    filePath: "uploads/offboarding/off-1/1700000000000-abcdef12-datei.pdf",
    mimeType: "application/pdf",
  });
  return OFFBOARDING_DOWNLOAD(
    new NextRequest("http://localhost:3000/api/offboarding/off-1/documents/doc-1"),
    { params: Promise.resolve({ id: "off-1", docId: "doc-1" }) },
  );
}

describe("Content-Disposition beim Dokument-Download", () => {
  it("liefert den Onboarding-Dateinamen ohne Umlaute aus", async () => {
    // "Fuehrungszeugnis Mueller.pdf" mit echten Umlauten - der Normalfall im
    // Portal, nicht die Ausnahme.
    const res = await onboardingDownload("Führungszeugnis Müller.pdf");
    expect(res.status).toBe(200);

    const cd = res.headers.get("Content-Disposition") || "";
    expect(cd).toBe('attachment; filename="F_hrungszeugnis_M_ller.pdf"');
    expect(cd).not.toMatch(/[^\x00-\x7F]/);
  });

  it("liefert den Offboarding-Dateinamen ohne Umlaute aus", async () => {
    const res = await offboardingDownload("Kündigung Müller.pdf");
    expect(res.status).toBe(200);

    const cd = res.headers.get("Content-Disposition") || "";
    expect(cd).toBe('attachment; filename="K_ndigung_M_ller.pdf"');
    expect(cd).not.toMatch(/[^\x00-\x7F]/);
  });

  it.each([
    ["Onboarding", onboardingDownload],
    ["Offboarding", offboardingDownload],
  ])(
    "laesst im %s-Header weder Anfuehrungszeichen noch Zeilenumbrueche durch",
    async (_name, download) => {
      // Ein Dateiname, der den gequoteten Parameter verlassen und einen
      // zweiten Header anhaengen wollte. Der Weg dahin ist der Upload: Dort
      // kommt `fileName` unveraendert aus `file.name`, also vom Aufrufer.
      const res = await download('x";\r\nX-Injected: 1.pdf');
      expect(res.status).toBe(200);

      const cd = res.headers.get("Content-Disposition") || "";
      expect(cd).toMatch(NUR_ASCII_DATEINAME);
      expect(cd).not.toContain("\r");
      expect(cd).not.toContain("\n");
      expect(res.headers.get("X-Injected")).toBeNull();
    },
  );
});

// =============================================
// Befund 2 - Speichername mit Kollisionsschutz
// =============================================

async function civilServiceUpload(dateiname: string) {
  const formData = new FormData();
  formData.append("file", pdfFile(dateiname));
  formData.append("documentType", "SONSTIGES");

  return CIVIL_SERVICE_UPLOAD(
    new NextRequest("http://localhost:3000/api/civil-service/vb-1/documents", {
      method: "POST",
      body: formData,
    }),
    { params: Promise.resolve({ id: "vb-1" }) },
  );
}

async function offboardingUpload(dateiname: string) {
  const formData = new FormData();
  formData.append("file", pdfFile(dateiname));
  formData.append("type", "SONSTIGES");

  return OFFBOARDING_UPLOAD(
    new NextRequest("http://localhost:3000/api/offboarding/off-1/documents", {
      method: "POST",
      body: formData,
    }),
    { params: Promise.resolve({ id: "off-1" }) },
  );
}

async function fragebogenUpload(dateiname: string) {
  const formData = new FormData();
  formData.append("file", pdfFile(dateiname));
  formData.append("type", "sonstiges");

  return FRAGEBOGEN_UPLOAD(
    new NextRequest("http://localhost:3000/api/fragebogen/tok-1/documents", {
      method: "POST",
      body: formData,
    }),
    { params: Promise.resolve({ token: "tok-1" }) },
  );
}

describe("Speichername beim Dokument-Upload", () => {
  /**
   * Der Kern des Befunds. Die Uhr steht, beide Uploads heissen gleich - vorher
   * ergab das zweimal denselben Pfad und die zweite Datei loeschte die erste.
   */
  it.each([
    [
      "Verbeamtung",
      () => civilServiceUpload("Meldebescheinigung.pdf"),
      () => mockPrisma.civilServiceDocument.create,
      /^uploads\/civil-service\/vb-1\/1700000000000-[0-9a-f]{8}-Meldebescheinigung\.pdf$/,
    ],
    [
      "Offboarding",
      () => offboardingUpload("Meldebescheinigung.pdf"),
      () => mockPrisma.offboardingDocument.create,
      /^uploads\/offboarding\/off-1\/1700000000000-[0-9a-f]{8}-Meldebescheinigung\.pdf$/,
    ],
    [
      "Fragebogen",
      () => fragebogenUpload("Meldebescheinigung.pdf"),
      () => mockPrisma.document.create,
      /^uploads\/onb-1\/1700000000000-[0-9a-f]{8}-Meldebescheinigung\.pdf$/,
    ],
  ])(
    "%s: zwei gleichnamige Uploads in derselben Millisekunde bekommen verschiedene Pfade",
    async (_name, hochladen, create, muster) => {
      const uhr = jest.spyOn(Date, "now").mockReturnValue(1700000000000);
      try {
        const eins = await hochladen();
        const zwei = await hochladen();
        expect(eins.status).toBe(201);
        expect(zwei.status).toBe(201);

        const pfade = angelegteDaten(create()).map((d) => d.filePath as string);
        expect(pfade).toHaveLength(2);
        expect(pfade[0]).toMatch(muster);
        expect(pfade[1]).toMatch(muster);
        expect(pfade[0]).not.toBe(pfade[1]);
      } finally {
        uhr.mockRestore();
      }
    },
  );

  it("legt den Originalnamen unveraendert ab und bereinigt nur den Speichernamen", async () => {
    // Der Anzeigename bleibt der des Nutzers - nur der Pfad auf der Platte
    // wird ASCII. Diese Trennung ist der Grund, warum die Umstellung in der
    // Oberflaeche nicht auffaellt.
    const res = await fragebogenUpload("Meldebescheinigung für Müller.pdf");
    expect(res.status).toBe(201);

    const [daten] = angelegteDaten(mockPrisma.document.create);
    expect(daten.fileName).toBe("Meldebescheinigung für Müller.pdf");
    expect(daten.filePath).not.toMatch(/[^\x00-\x7F]/);
    expect(daten.filePath).toMatch(
      /^uploads\/onb-1\/\d+-[0-9a-f]{8}-Meldebescheinigung_f_r_M_ller\.pdf$/,
    );
  });

  it("schreibt die Datei unter genau dem Namen, der auch in der Datenbank steht", async () => {
    // Sonst zeigte die Datenbank auf eine Datei, die es nicht gibt - der
    // Download liefe in seinen 404-Zweig, obwohl der Upload gemeldet hat, es
    // sei alles gut gegangen.
    const res = await offboardingUpload("Zeugnis.pdf");
    expect(res.status).toBe(201);

    const [daten] = angelegteDaten(mockPrisma.offboardingDocument.create);
    const gespeicherterName = String(daten.filePath).split("/").pop() as string;

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(String(mockWriteFile.mock.calls[0][0])).toContain(gespeicherterName);
  });

  it("faellt bei namenlosem Upload auf 'upload' zurueck, bleibt aber eindeutig", async () => {
    // Ein Dateiname, von dem nach path.basename() nichts uebrig bleibt. Der
    // leere String selbst kommt hier nicht durch: Ein File ohne Namen wird beim
    // Serialisieren zum gewoehnlichen Formularfeld und faellt schon an der
    // Dateipruefung heraus.
    const uhr = jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    try {
      const eins = await civilServiceUpload("/");
      const zwei = await civilServiceUpload("/");
      expect(eins.status).toBe(201);
      expect(zwei.status).toBe(201);

      const pfade = angelegteDaten(mockPrisma.civilServiceDocument.create).map(
        (d) => d.filePath as string,
      );
      expect(pfade[0]).toMatch(
        /^uploads\/civil-service\/vb-1\/1700000000000-[0-9a-f]{8}-upload$/,
      );
      expect(pfade[0]).not.toBe(pfade[1]);
    } finally {
      uhr.mockRestore();
    }
  });

  it("laesst einen Dateinamen mit '../' nicht aus dem Vorgangsordner heraus", async () => {
    // Der Path-Traversal-Schutz war schon vorher da (path.basename plus die
    // Pruefung auf uploadBaseDir) und soll durch die Umstellung nicht
    // verlorengehen - deshalb steht er hier als Regressionsnetz.
    const res = await civilServiceUpload("../../etc/passwd");
    expect(res.status).toBe(201);

    const [daten] = angelegteDaten(mockPrisma.civilServiceDocument.create);
    expect(daten.filePath).toMatch(
      /^uploads\/civil-service\/vb-1\/\d+-[0-9a-f]{8}-passwd$/,
    );
    expect(String(daten.filePath)).not.toContain("..");
  });
});
