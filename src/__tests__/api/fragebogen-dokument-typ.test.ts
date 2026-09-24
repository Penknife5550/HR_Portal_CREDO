/**
 * Tests: Dokument-Upload im Personalfragebogen (/api/fragebogen/[token]/documents)
 *
 * Hintergrund (Bug 08/2026): Die Route mappt den mitgeschickten `type` ueber eine
 * Tabelle mit KLEINGESCHRIEBENEN Schluesseln. Schritt 4 (Geburtsurkunde Kind) und
 * Schritt 8 (Masernschutz) haben die ENUM-Schreibweise gesendet — der Treffer blieb
 * aus und das Dokument landete stillschweigend als SONSTIGES. Folge: Das Pflicht-
 * dokument galt weiter als fehlend, der Mitarbeiter musste dieselbe Datei am Ende
 * des Fragebogens erneut hochladen.
 *
 * Diese Tests sichern beide Schreibweisen ab.
 */

const mockPrisma: {
  document: Record<string, jest.Mock>;
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
} = {
  document: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  // PATCH schreibt Datum, Merker, ggf. die Statusruecknahme und das Protokoll
  // gemeinsam — als interaktive Transaktion (der Eintrag muss wissen, ob der
  // Status zurueckgenommen wurde). `tx` ist hier dasselbe Mock-Objekt.
  $transaction: jest.fn((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(mockPrisma)
      : Promise.all(arg as unknown[]),
  ),
};
const mockValidateMagicToken = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ validateMagicToken: mockValidateMagicToken }));
jest.mock("@/lib/rate-limit", () => ({
  tokenRateLimiter: { check: () => ({ allowed: true }) },
  getClientIp: () => "127.0.0.1",
  // Vorsorglich mitgemockt, obwohl die hier getesteten Routen heute nur
  // `getClientIp` nutzen: Dieser Mock ersetzt das GANZE Modul. Stellt jemand
  // eine dieser Routen spaeter auf die null-Fassung um, kaeme sonst
  // stillschweigend `undefined` zurueck und der Test stuerbe an einem
  // TypeError statt an einer sprechenden Erwartung.
  getClientIpOrNull: () => "127.0.0.1",
}));
jest.mock("fs/promises", () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { PATCH, POST } from "@/app/api/fragebogen/[token]/documents/route";
import { NextRequest } from "next/server";

/** Minimale, gueltige PDF-Datei — die Route prueft die Magic Bytes (%PDF). */
function pdfFile(name = "geburtsurkunde.pdf"): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], name, { type: "application/pdf" });
}

async function upload(type: string) {
  const formData = new FormData();
  formData.append("file", pdfFile());
  formData.append("type", type);

  const request = new NextRequest(
    "http://localhost:3000/api/fragebogen/tok-123/documents",
    { method: "POST", body: formData }
  );

  const response = await POST(request, {
    params: Promise.resolve({ token: "tok-123" }),
  });

  return response;
}

/** Liest den `type`, mit dem das Dokument tatsaechlich angelegt wurde. */
function gespeicherterTyp(): string {
  expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
  return mockPrisma.document.create.mock.calls[0][0].data.type;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateMagicToken.mockResolvedValue({
    valid: true,
    onboarding: { id: "onb-1" },
  });
  mockPrisma.document.create.mockImplementation(({ data }: never) => ({
    id: "doc-1",
    fileName: (data as { fileName: string }).fileName,
    type: (data as { type: string }).type,
    fileSize: 8,
    uploadedAt: new Date("2026-08-17T10:00:00Z"),
  }));
});

describe("Dokument-Typ-Mapping", () => {
  it("akzeptiert den Kategorie-Schluessel in Kleinschreibung", async () => {
    const res = await upload("geburtsurkunde_kind");
    expect(res.status).toBe(201);
    expect(gespeicherterTyp()).toBe("GEBURTSURKUNDE_KIND");
  });

  it("akzeptiert auch die Enum-Schreibweise (Regressionsschutz)", async () => {
    const res = await upload("GEBURTSURKUNDE_KIND");
    expect(res.status).toBe(201);
    expect(gespeicherterTyp()).toBe("GEBURTSURKUNDE_KIND");
  });

  it("mappt den Masernschutz-Nachweis in beiden Schreibweisen", async () => {
    await upload("MASERNSCHUTZ");
    expect(gespeicherterTyp()).toBe("MASERNSCHUTZ");

    jest.clearAllMocks();
    mockValidateMagicToken.mockResolvedValue({ valid: true, onboarding: { id: "onb-1" } });
    mockPrisma.document.create.mockImplementation(({ data }: never) => ({
      id: "doc-2",
      fileName: (data as { fileName: string }).fileName,
      type: (data as { type: string }).type,
      fileSize: 8,
      uploadedAt: new Date("2026-08-17T10:00:00Z"),
    }));

    await upload("masernschutz");
    expect(gespeicherterTyp()).toBe("MASERNSCHUTZ");
  });

  it("faellt bei unbekanntem Typ auf SONSTIGES zurueck", async () => {
    await upload("gibt_es_nicht");
    expect(gespeicherterTyp()).toBe("SONSTIGES");
  });

  it("legt kein Dokument an, wenn der Magic Link ungueltig ist", async () => {
    mockValidateMagicToken.mockResolvedValue({
      valid: false,
      reason: "Token nicht gefunden",
    });

    const res = await upload("geburtsurkunde_kind");
    expect(res.status).toBe(404);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });
});

// =============================================
// Ablaufdatum befristeter Nachweise (gueltigBis)
// =============================================

/** Der writeFile-Mock — fuer die Frage, WANN geschrieben wird. */
const fsMock = jest.requireMock("fs/promises") as {
  writeFile: jest.Mock;
};

/** Ein Jahr, das nie „in die Vergangenheit rutscht", wenn der Test alt wird. */
const ZUKUNFT = `${new Date().getUTCFullYear() + 2}-03-01`;
/** Sicher abgelaufen, unabhaengig vom Tag, an dem die Tests laufen. */
const VERGANGENHEIT = `${new Date().getUTCFullYear() - 2}-03-01`;

async function uploadMitFrist(type: string, gueltigBis?: string) {
  const formData = new FormData();
  formData.append("file", pdfFile("aufenthaltstitel.pdf"));
  formData.append("type", type);
  if (gueltigBis !== undefined) formData.append("gueltigBis", gueltigBis);

  const request = new NextRequest(
    "http://localhost:3000/api/fragebogen/tok-123/documents",
    { method: "POST", body: formData }
  );

  return POST(request, { params: Promise.resolve({ token: "tok-123" }) });
}

/** Liest das `gueltigBis`, mit dem das Dokument angelegt wurde. */
function gespeicherteFrist(): Date | null {
  expect(mockPrisma.document.create).toHaveBeenCalledTimes(1);
  return mockPrisma.document.create.mock.calls[0][0].data.gueltigBis;
}

describe("Upload mit Ablaufdatum", () => {
  it("kennt die drei neuen Typen in beiden Schreibweisen", async () => {
    // Ohne Eintrag in DOCUMENT_TYPE_MAP faellt der Upload stillschweigend auf
    // SONSTIGES — das Pflichtdokument gilt dann weiter als fehlend.
    const faelle: [string, string][] = [
      ["aufenthaltstitel", "AUFENTHALTSTITEL"],
      ["AUFENTHALTSTITEL", "AUFENTHALTSTITEL"],
      ["arbeitserlaubnis", "ARBEITSERLAUBNIS"],
      ["pkv_nachweis", "PKV_NACHWEIS"],
      ["PKV_NACHWEIS", "PKV_NACHWEIS"],
    ];
    for (const [gesendet, erwartet] of faelle) {
      mockPrisma.document.create.mockClear();
      const res = await uploadMitFrist(gesendet);
      expect(res.status).toBe(201);
      expect(gespeicherterTyp()).toBe(erwartet);
    }
  });

  it("speichert das Datum als Mitternacht UTC", async () => {
    // `new Date(2028, 2, 1)` waere Mitternacht ORTSZEIT und landete oestlich von
    // Greenwich als 29.02. in einer `date`-Spalte. Der Tag kaeme nie zurueck.
    const res = await uploadMitFrist("aufenthaltstitel", ZUKUNFT);
    expect(res.status).toBe(201);
    expect(gespeicherteFrist()).toEqual(new Date(`${ZUKUNFT}T00:00:00.000Z`));
  });

  it("nimmt den Upload auch ohne Datum an", async () => {
    // Der Scan ist das Wichtigere. Ein Formular, das die Datei wegen eines
    // fehlenden Nebenfeldes zurueckweist, bekommt irgendein Datum eingetippt.
    const res = await uploadMitFrist("aufenthaltstitel");
    expect(res.status).toBe(201);
    expect(gespeicherteFrist()).toBeNull();
  });

  it("wertet ein leeres Feld wie ein fehlendes", async () => {
    const res = await uploadMitFrist("aufenthaltstitel", "   ");
    expect(res.status).toBe(201);
    expect(gespeicherteFrist()).toBeNull();
  });

  it("nimmt ein Datum in der Vergangenheit an", async () => {
    // Abweichung vom Plan, bewusst: Ein abgelaufener Titel ist eine Tatsache,
    // die HR sehen muss — die Ampel zeigt sie dann als ABGELAUFEN. Ein 400
    // erzoege zum Erfinden eines passenden Datums.
    const res = await uploadMitFrist("aufenthaltstitel", "2020-01-01");
    expect(res.status).toBe(201);
    expect(gespeicherteFrist()).toEqual(new Date("2020-01-01T00:00:00.000Z"));
  });

  it("weist ein Datum an einem Typ ohne Frist ab, statt es zu verschlucken", async () => {
    const res = await uploadMitFrist("masernschutz", ZUKUNFT);
    expect(res.status).toBe(400);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("weist Unlesbares ab, statt das Datum zu raten", async () => {
    // `new Date("03.05.2027")` liest je nach Laufzeit den 3. Mai oder den
    // 5. Maerz — und hier entscheidet der Tag ueber eine Warnung mit Rechtsfolge.
    for (const wert of ["03.05.2027", "2027-02-30", "morgen", "2027-13-01"]) {
      mockPrisma.document.create.mockClear();
      const res = await uploadMitFrist("aufenthaltstitel", wert);
      expect(res.status).toBe(400);
      expect(mockPrisma.document.create).not.toHaveBeenCalled();
    }
  });

  it("weist ein Datum weit jenseits jeder Befristung ab", async () => {
    // 2206 statt 2026: Der Tippfehler faellt niemandem auf, weil das Dokument
    // vollstaendig AUSSIEHT — nur die Ampel schweigt fuer immer.
    const res = await uploadMitFrist("aufenthaltstitel", "2206-03-01");
    expect(res.status).toBe(400);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });

  it("schreibt bei einem abgelehnten Datum keine Datei auf die Platte", async () => {
    // Sonst bliebe bei jedem 400 eine verwaiste Datei im Upload-Ordner zurueck,
    // auf die keine Datenbankzeile mehr zeigt.
    const res = await uploadMitFrist("aufenthaltstitel", "2027-02-30");
    expect(res.status).toBe(400);
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});

// =============================================
// PATCH – Ablaufdatum nachtragen
// =============================================
async function patchFrist(koerper: unknown) {
  const request = new NextRequest(
    "http://localhost:3000/api/fragebogen/tok-123/documents",
    {
      method: "PATCH",
      body: typeof koerper === "string" ? koerper : JSON.stringify(koerper),
      headers: { "Content-Type": "application/json" },
    }
  );

  return PATCH(request, { params: Promise.resolve({ token: "tok-123" }) });
}

describe("Ablaufdatum nachtragen", () => {
  beforeEach(() => {
    mockPrisma.document.findFirst.mockResolvedValue({
      id: "doc-1",
      type: "AUFENTHALTSTITEL",
    });
    mockPrisma.document.update.mockImplementation(({ data }: never) => ({
      id: "doc-1",
      type: "AUFENTHALTSTITEL",
      gueltigBis: (data as { gueltigBis: Date }).gueltigBis,
    }));
    // Standard: nichts war EXPIRED. Einzelne Tests setzen count 1.
    mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("traegt das Datum an einem hochgeladenen Nachweis nach", async () => {
    // Ohne diesen Weg waere „Frist fehlt" eine Sackgasse: Der einzige Ausweg
    // waere, den Scan zu loeschen und dieselbe Datei erneut hochzuladen.
    const res = await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });
    expect(res.status).toBe(200);
    expect(mockPrisma.document.update).toHaveBeenCalledTimes(1);
    // Mit dem Datum wird der Erinnerungs-Merker geleert: Fuer eine geaenderte
    // Frist beginnt ein neuer Zyklus (dieselbe Regel wie bei HR).
    expect(mockPrisma.document.update.mock.calls[0][0].data).toEqual({
      gueltigBis: new Date(`${ZUKUNFT}T00:00:00.000Z`),
      ablaufErinnertAm: null,
      ablaufErinnertStufe: null,
    });
  });

  it("nimmt EXPIRED zurueck, wenn die neue Frist nicht abgelaufen ist — nur EXPIRED", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      id: "doc-1",
      type: "AUFENTHALTSTITEL",
      fileName: "titel.pdf",
      gueltigBis: new Date(`${VERGANGENHEIT}T00:00:00.000Z`),
    });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });

    // Bedingt in der Abfrage: REJECTED (Entscheidung ueber den Scan) trifft
    // sie nie, und ein gerade erst vom Lauf gesetztes EXPIRED trotzdem.
    expect(mockPrisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", status: "EXPIRED" },
      data: { status: "UPLOADED" },
    });
    // Datum, Ruecknahme und Protokoll gehoeren zusammen: EINE Transaktion.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe("function");
  });

  it("protokolliert die Ruecknahme — HR hat die Ablaufmail in der Hand", async () => {
    // Durchsicht 09/2026: Der Nachtlauf hatte EXPIRED gesetzt und HR
    // „ABGELAUFEN" gemailt; ein Zukunftsdatum ueber den Link stellte den
    // Nachweis wieder auf gruen — ohne jede Spur.
    mockPrisma.document.findFirst.mockResolvedValue({
      id: "doc-1",
      type: "AUFENTHALTSTITEL",
      fileName: "titel.pdf",
      gueltigBis: new Date(`${VERGANGENHEIT}T00:00:00.000Z`),
    });
    mockPrisma.document.updateMany.mockResolvedValue({ count: 1 });

    const res = await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const eintrag = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(eintrag).toMatchObject({
      onboardingId: "onb-1",
      processType: "ONBOARDING",
      action: "DOKUMENT_FRIST_GEAENDERT",
      ipAddress: "127.0.0.1",
      details: {
        documentId: "doc-1",
        dokumentTyp: "AUFENTHALTSTITEL",
        dokumentDatei: "titel.pdf",
        vorher: VERGANGENHEIT,
        nachher: ZUKUNFT,
        quelle: "MAGIC_LINK",
        statusVorher: "EXPIRED",
        statusNachher: "UPLOADED",
      },
    });
    // Kein Benutzer: Ueber den Magic Link schreibt die beschaeftigte Person.
    expect(eintrag.userId).toBeUndefined();
  });

  it("protokolliert auch eine Aenderung ohne Statuswechsel — aber ohne Statusfelder", async () => {
    // Nichts war EXPIRED (count 0): Der Eintrag behauptet keinen Wechsel.
    mockPrisma.document.updateMany.mockResolvedValue({ count: 0 });

    await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const details = mockPrisma.auditLog.create.mock.calls[0][0].data.details;
    expect(details).toMatchObject({ vorher: null, nachher: ZUKUNFT, quelle: "MAGIC_LINK" });
    expect(details).not.toHaveProperty("statusVorher");
    expect(details).not.toHaveProperty("statusNachher");
  });

  it("laesst den Status stehen, wenn auch die neue Frist schon abgelaufen ist", async () => {
    await patchFrist({ documentId: "doc-1", gueltigBis: VERGANGENHEIT });

    expect(mockPrisma.document.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.document.updateMany).not.toHaveBeenCalled();
    // Die Aenderung selbst steht trotzdem im Protokoll — ohne Statuswechsel.
    const details = mockPrisma.auditLog.create.mock.calls[0][0].data.details;
    expect(details).not.toHaveProperty("statusVorher");
  });

  it("meldet keinen Erfolg, wenn das Protokoll scheitert", async () => {
    // Datum und Eintrag im selben Commit: Scheitert der Eintrag, wirft die
    // Transaktion — die Route meldet keinen Erfolg.
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error("DB weg"));
    await expect(
      patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT }),
    ).rejects.toThrow("DB weg");
  });

  it("schreibt nichts, wenn dasselbe Datum erneut gespeichert wird", async () => {
    // Sonst begaenne mit jedem Speichern ein neuer Erinnerungszyklus, und HR
    // bekaeme dieselbe Mahnung noch einmal.
    mockPrisma.document.findFirst.mockResolvedValue({
      id: "doc-1",
      type: "AUFENTHALTSTITEL",
      gueltigBis: new Date(`${ZUKUNFT}T00:00:00.000Z`),
    });

    const res = await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });
    expect(res.status).toBe(200);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
    expect(mockPrisma.document.updateMany).not.toHaveBeenCalled();
  });

  it("sucht das Dokument nur im eigenen Vorgang", async () => {
    await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });
    expect(mockPrisma.document.findFirst.mock.calls[0][0].where).toEqual({
      id: "doc-1",
      onboardingId: "onb-1",
    });
  });

  it("antwortet 404 auf ein fremdes Dokument und schreibt nichts", async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);
    const res = await patchFrist({ documentId: "fremd", gueltigBis: ZUKUNFT });
    expect(res.status).toBe(404);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  it("lehnt ein Datum an einem Typ ohne Frist ab", async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      id: "doc-2",
      type: "MASERNSCHUTZ",
    });
    const res = await patchFrist({ documentId: "doc-2", gueltigBis: ZUKUNFT });
    expect(res.status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  it("kann die Frist nicht loeschen", async () => {
    // Sonst liesse sich die Ablaufkontrolle mit einem Klick stumm schalten —
    // und von „nie erfasst" waere das hinterher nicht zu unterscheiden.
    for (const wert of ["", "   ", null, undefined]) {
      mockPrisma.document.update.mockClear();
      const res = await patchFrist({ documentId: "doc-1", gueltigBis: wert });
      expect(res.status).toBe(400);
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    }
  });

  it("antwortet 400 statt 500 auf einen kaputten Rumpf", async () => {
    const res = await patchFrist("{kein json");
    expect(res.status).toBe(400);
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  it("schreibt nichts, wenn der Magic Link ungueltig ist", async () => {
    mockValidateMagicToken.mockResolvedValue({
      valid: false,
      reason: "Token nicht gefunden",
    });
    const res = await patchFrist({ documentId: "doc-1", gueltigBis: ZUKUNFT });
    expect(res.status).toBe(404);
    expect(mockPrisma.document.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });
});
