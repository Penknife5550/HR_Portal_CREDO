/**
 * Tests: Routen der individuellen E-Mail (Paket 3)
 *
 * Die Routen sind duenn — geprueft wird nur, was sie selbst tun: Rolle,
 * Bremse (gemeinsam mit dem Dokumentenpaket), Groesse vor dem Lesen,
 * Formular lesen, Statuscode aus dem Dienst, Kopfzeilen des Downloads.
 */
import { NextRequest } from "next/server";

const mockGetSession = jest.fn();
const mockMailSenden = jest.fn();
const mockUebersicht = jest.fn();
const mockAnhangLaden = jest.fn();
const mockLimit = jest.fn();

jest.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
jest.mock("@/lib/rate-limit", () => ({
  ...jest.requireActual("@/lib/rate-limit"),
  createRateLimiter: (name: string, config: { maxRequests: number; windowMs: number }) => ({
    check: (key: string) => mockLimit(name, key, config),
  }),
}));
jest.mock("@/lib/individuelle-mail-dienst", () => ({
  mailSenden: (...a: unknown[]) => mockMailSenden(...a),
  uebersichtLaden: (...a: unknown[]) => mockUebersicht(...a),
  anhangLaden: (...a: unknown[]) => mockAnhangLaden(...a),
}));

import { GET, POST } from "@/app/api/individuelle-mail/route";
import { GET as ANHANG } from "@/app/api/individuelle-mail/anhaenge/[anhangId]/route";
import { MAX_ANFRAGE_BYTES } from "@/lib/individuelle-mail";

const REF = "11111111-1111-4111-8111-111111111111";
const KENNUNG = "22222222-2222-4222-8222-222222222222";
const ANHANG_ID = "33333333-3333-4333-8333-333333333333";
const session = { userId: "u1", email: "hr@fes.de", role: "HR_SACHBEARBEITER", firstName: "Erika", lastName: "Muster" };
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

function formular(extra: Record<string, string> = {}, dateien: File[] = []): FormData {
  const f = new FormData();
  const felder = {
    modul: "ONBOARDING",
    refId: REF,
    dialogKennung: KENNUNG,
    empfaenger: "anna@example.org",
    betreff: "Vertrag",
    nachricht: "Guten Tag",
    ...extra,
  };
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  for (const d of dateien) f.append("dateien", d);
  return f;
}

function post(form: FormData, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/individuelle-mail", { method: "POST", body: form, headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(session);
  mockLimit.mockReturnValue({ allowed: true, remaining: 5 });
  mockMailSenden.mockResolvedValue({
    ok: true,
    daten: { mailId: "m1", empfaenger: "anna@example.org", betreff: "Vertrag", anhaenge: [], warnungen: [], wiederholt: false },
  });
});

describe("POST /api/individuelle-mail", () => {
  it("liest das Formular samt Dateien und antwortet 201", async () => {
    const datei = new File([Buffer.from("%PDF-1.4\n%%EOF")], "Vertrag.pdf", { type: "application/pdf" });
    const res = await POST(post(formular({}, [datei])), ctx());
    expect(res.status).toBe(201);
    const aufruf = mockMailSenden.mock.calls[0][0];
    expect(aufruf).toMatchObject({
      modul: "ONBOARDING",
      refId: REF,
      dialogKennung: KENNUNG,
      empfaenger: "anna@example.org",
      betreff: "Vertrag",
      nachricht: "Guten Tag",
      session,
    });
    expect(aufruf.dateien).toHaveLength(1);
    expect(aufruf.dateien[0].name).toBe("Vertrag.pdf");
    expect(Buffer.isBuffer(aufruf.dateien[0].inhalt)).toBe(true);
  });

  it("ein wiederholter Versuch derselben Kennung antwortet 200", async () => {
    mockMailSenden.mockResolvedValue({
      ok: true,
      daten: { mailId: "m1", empfaenger: "a", betreff: "b", anhaenge: [], warnungen: [], wiederholt: true },
    });
    expect((await POST(post(formular()), ctx())).status).toBe(200);
  });

  it("nur HR_EDIT_ROLES: Einrichtungsleitung bekommt 403, nichts gelesen", async () => {
    mockGetSession.mockResolvedValue({ ...session, role: "EINRICHTUNGSLEITUNG" });
    expect((await POST(post(formular()), ctx())).status).toBe(403);
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it("Bremse gemeinsam mit dem Dokumentenpaket, je Benutzerkonto, vor allem anderen", async () => {
    mockLimit.mockImplementation((name: string) =>
      name === "dokumentenpaket-versand" ? { allowed: false, remaining: 0, retryAfterMs: 5000 } : { allowed: true },
    );
    const res = await POST(post(formular({ refId: "kaputt" })), ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect(mockLimit).toHaveBeenCalledWith("dokumentenpaket-versand", "u1", expect.anything());
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it("zu gross laut Content-Length: 413, ohne das Formular zu lesen", async () => {
    const res = await POST(post(formular(), { "content-length": String(MAX_ANFRAGE_BYTES + 1) }), ctx());
    expect(res.status).toBe(413);
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it("zu gross ohne Content-Length: gezaehlt, trotzdem 413 statt kaputtem Formular", async () => {
    const riesig = new File([new Uint8Array(MAX_ANFRAGE_BYTES + 1)], "gross.pdf");
    const req = post(formular({}, [riesig]));
    req.headers.delete("content-length");
    const res = await POST(req, ctx());
    expect(res.status).toBe(413);
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it("unbekanntes Modul: 400 ohne Dienst", async () => {
    expect((await POST(post(formular({ modul: "ELTERNZEIT" })), ctx())).status).toBe(400);
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it("ungueltige Kennung oder Vorgangs-ID: 400", async () => {
    expect((await POST(post(formular({ dialogKennung: "x" })), ctx())).status).toBe(400);
    expect((await POST(post(formular({ refId: "x" })), ctx())).status).toBe(400);
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it("mehr als 10 Dateien: 400 vor dem Dienst", async () => {
    const dateien = Array.from({ length: 11 }, (_, i) => new File(["x"], `${i}.pdf`));
    expect((await POST(post(formular({}, dateien)), ctx())).status).toBe(400);
    expect(mockMailSenden).not.toHaveBeenCalled();
  });

  it.each([
    ["VORGANG_NICHT_GEFUNDEN", 404],
    ["EMPFAENGER_NICHT_ERLAUBT", 409],
    ["DATEITYP", 415],
    ["ZU_GROSS", 413],
    ["VERSAND", 502],
  ])("Fehler %s aus dem Dienst → %i mit Text", async (fehler, status) => {
    mockMailSenden.mockResolvedValue({ ok: false, fehler, meldung: "Text" });
    const res = await POST(post(formular()), ctx());
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: "Text", fehler });
  });
});

describe("GET /api/individuelle-mail", () => {
  it("reicht Modul und Vorgang durch", async () => {
    mockUebersicht.mockResolvedValue({ ok: true, daten: { verlauf: [] } });
    const res = await GET(new NextRequest(`http://localhost:3000/api/individuelle-mail?modul=OFFBOARDING&refId=${REF}`), ctx());
    expect(res.status).toBe(200);
    expect(mockUebersicht).toHaveBeenCalledWith({ modul: "OFFBOARDING", refId: REF, session });
  });

  it("keine UUID: 404 ohne Datenbank", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/individuelle-mail?modul=ONBOARDING&refId=x"), ctx());
    expect(res.status).toBe(404);
    expect(mockUebersicht).not.toHaveBeenCalled();
  });
});

describe("GET /api/individuelle-mail/anhaenge/[anhangId]", () => {
  it("liefert immer als Download mit no-store und nosniff", async () => {
    mockAnhangLaden.mockResolvedValue({
      ok: true,
      daten: { inhalt: Buffer.from("PNGDATA"), mimeType: "image/png", dateiname: "Stundenplan Oktober.png" },
    });
    const res = await ANHANG(new NextRequest(`http://localhost:3000/api/individuelle-mail/anhaenge/${ANHANG_ID}`), ctx({ anhangId: ANHANG_ID }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"Stundenplan_Oktober.png\"; filename*=UTF-8''Stundenplan%20Oktober.png",
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("unbekannt oder fremd: 404", async () => {
    mockAnhangLaden.mockResolvedValue({ ok: false, fehler: "VORGANG_NICHT_GEFUNDEN", meldung: "Der Anhang wurde nicht gefunden." });
    const res = await ANHANG(new NextRequest(`http://localhost:3000/api/individuelle-mail/anhaenge/${ANHANG_ID}`), ctx({ anhangId: ANHANG_ID }));
    expect(res.status).toBe(404);
  });
});
