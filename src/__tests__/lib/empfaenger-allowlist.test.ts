/**
 * Tests: SERVER-Seite der Empfaengerfreigabe
 *
 * Zwei Dinge stehen hier, weil sie beide eine Umgebung brauchen und deshalb
 * nicht in die importfreie empfaenger-freigabe.test.ts passen:
 *
 *  1. `ladeErlaubteDomains` — der einzige Teil von lib/empfaenger-allowlist.ts,
 *     der prisma braucht. Die REGEL selbst liegt importfrei in
 *     lib/empfaenger-freigabe.ts und wird drueben ohne jeden Mock geprueft.
 *
 *  2. Die SCHREIBENDE Seite: die Syntaxpruefung der Freigabeliste in
 *     PUT /api/settings/smtp. Sie war ungeprueft — der einzige Test dazu sagte
 *     nur, dass MAX_ERLAUBTE_DOMAINS eine Zahl ist. Genau diese Route ist aber
 *     die einzige Stelle, an der eine kaputte Liste abgefangen wird, bevor sie
 *     in der Datenbank landet; was hier durchrutscht, macht die Schranke des
 *     Dokumentenpaket-Versands still unwirksam. Der Routentest steht bewusst
 *     neben dem Leser: Beide Seiten derselben Spalte, in einer Datei.
 *
 * Dazu kommt eine Wache gegen den Rueckfall: Die Re-Exports muessen DIESELBEN
 * Funktionsobjekte sein wie drueben. Baute jemand hier wieder eine eigene
 * Fassung — der Fall, den dieser Umbau aufgeloest hat —, faellt der Test um,
 * statt dass zwei Regeln nebeneinander leise auseinanderlaufen.
 */

const mockPrisma = {
  smtpConfig: { findUnique: jest.fn(), upsert: jest.fn() },
  auditLog: { create: jest.fn() },
};
const mockGetSession = jest.fn();

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));
jest.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
// Die Verschluesselung ist hier nicht das Thema und braeuchte sonst einen
// gesetzten ENCRYPTION_KEY im Testlauf. Das SMTP-Passwort wandert in diesen
// Tests ohnehin nicht durch die Pruefung, um die es geht.
jest.mock("@/lib/encryption", () => ({
  encrypt: (wert: string) => `verschluesselt:${wert}`,
  isEncryptionConfigured: () => true,
}));

import * as allowlist from "@/lib/empfaenger-allowlist";
import * as freigabe from "@/lib/empfaenger-freigabe";
import { PUT } from "@/app/api/settings/smtp/route";
import { NextRequest } from "next/server";

const { ladeErlaubteDomains } = allowlist;

/** Eine Rolle, die die SMTP-Einstellungen aendern darf. */
const HR_LEITUNG = {
  userId: "hr1",
  email: "hr@credo-gruppe.de",
  role: "HR_LEITUNG",
  firstName: "H",
  lastName: "L",
};

/**
 * Ein PUT auf die SMTP-Route. `isActive` bleibt aus, damit die Pflichtfeld-
 * pruefung (Host, Benutzername, Absender) nicht dazwischenfunkt — geprueft
 * wird hier allein die Freigabeliste.
 */
function smtpRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/settings/smtp", {
    method: "PUT",
    body: JSON.stringify({ host: "smtp.example.org", isActive: false, ...body }),
    headers: { "Content-Type": "application/json" },
  });
}

/** Was die Route zu speichern versucht hat — oder null, wenn sie es nicht tat. */
function gespeicherteDomains(): string | null {
  const aufruf = mockPrisma.smtpConfig.upsert.mock.calls[0];
  if (!aufruf) return null;
  return aufruf[0].update.allowedRecipientDomains as string;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(HR_LEITUNG);
  mockPrisma.smtpConfig.findUnique.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockResolvedValue({});
  // Die Route gibt zurueck, was sie geschrieben hat — der Mock reicht die
  // Update-Daten durch, damit die Antwort zeigt, was tatsaechlich in der
  // Spalte landen wuerde.
  mockPrisma.smtpConfig.upsert.mockImplementation(
    async (args: { update: Record<string, unknown> }) => ({
      id: "default",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...args.update,
    }),
  );
});

describe("Re-Export der reinen Regel", () => {
  it("reicht genau die Funktionen aus empfaenger-freigabe durch, keine eigene Kopie", () => {
    expect(allowlist.domainVon).toBe(freigabe.domainVon);
    expect(allowlist.normalisiereDomains).toBe(freigabe.normalisiereDomains);
    expect(allowlist.empfaengerFreigegeben).toBe(freigabe.empfaengerFreigegeben);
    expect(allowlist.MAX_ERLAUBTE_DOMAINS).toBe(freigabe.MAX_ERLAUBTE_DOMAINS);
  });
});

describe("ladeErlaubteDomains", () => {
  it("normalisiert auch einen direkt in der Datenbank stehenden Wert", () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "@FES-Minden.de ,, credo-gruppe.de , fes-minden.de",
    });
    return expect(ladeErlaubteDomains()).resolves.toEqual([
      "fes-minden.de",
      "credo-gruppe.de",
    ]);
  });

  it("liefert eine leere Liste, wenn es noch keine SMTP-Konfiguration gibt", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue(null);
    await expect(ladeErlaubteDomains()).resolves.toEqual([]);
  });

  it("liefert eine leere Liste bei leerem Feld (Auslieferungszustand)", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "" });
    await expect(ladeErlaubteDomains()).resolves.toEqual([]);
  });

  it("laesst ungueltige Eintraege aus der Datenbank weg, statt sie zu vergleichen", async () => {
    // Eine kaputte Zeile darf die Schranke nicht mit einem Eintrag fuellen,
    // der auf keine Adresse passt — die Route lehnt sie beim Speichern ab,
    // hier ist es das Netz darunter.
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({
      allowedRecipientDomains: "fes-minden.de, http://x.de",
    });
    await expect(ladeErlaubteDomains()).resolves.toEqual(["fes-minden.de"]);
  });

  it("liest den Singleton mit der ID default", async () => {
    mockPrisma.smtpConfig.findUnique.mockResolvedValue({ allowedRecipientDomains: "" });
    await ladeErlaubteDomains();
    expect(mockPrisma.smtpConfig.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "default" } }),
    );
  });
});

describe("PUT /api/settings/smtp — Freigabeliste", () => {
  it("speichert eine gueltige Liste normalisiert", async () => {
    // Klein geschrieben, ohne fuehrendes "@", entdoppelt, in der Reihenfolge
    // der ersten Nennung: In der Spalte soll stehen, wogegen spaeter
    // tatsaechlich verglichen wird — sonst liest man in den Einstellungen
    // etwas anderes, als die Pruefung benutzt.
    const res = await PUT(
      smtpRequest({ allowedRecipientDomains: "@FES-Minden.de, credo-gruppe.de , fes-minden.de" }),
    );
    expect(res.status).toBe(200);
    expect(gespeicherteDomains()).toBe("fes-minden.de, credo-gruppe.de");
  });

  it("lehnt einen ungueltigen Eintrag mit 400 ab und NENNT ihn", async () => {
    // Eine Domain, die auf keine echte Adresse passt, wuerde jeden abweichenden
    // Versand in einen 409 laufen lassen, ohne dass jemand den Grund saehe.
    const res = await PUT(
      smtpRequest({ allowedRecipientDomains: "fes-minden.de, http://x.de" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // Der getrimmte Originaltext muss in der Meldung auftauchen, damit die
    // Person wiedererkennt, was sie getippt hat.
    expect(body.error).toContain("http://x.de");
    expect(gespeicherteDomains()).toBeNull();
  });

  it("lehnt eine Liste aus lauter Trennzeichen ab, statt die Schranke still abzuschalten", async () => {
    // Der eigentliche Befund: ",,, @" ergibt weder Domain noch ungueltigen
    // Eintrag. Ohne diese Pruefung wuerde eine LEERE Liste gespeichert — und
    // leer heisst "keine Einschraenkung". Ein Tippfehler in der Konfiguration
    // haette den Versand fuer jede beliebige Adresse geoeffnet.
    for (const roh of [",,, @", ",", "   ,  , ", "@"]) {
      jest.clearAllMocks();
      const res = await PUT(smtpRequest({ allowedRecipientDomains: roh }));
      expect(res.status).toBe(400);
      const body = await res.json();
      // Die Meldung muss den Ausweg nennen, sonst haelt man die Ablehnung fuer
      // eine Sperre und traegt Unsinn ein, nur damit das Feld gefuellt ist.
      expect(body.error).toMatch(/leer/i);
      expect(mockPrisma.smtpConfig.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    }
  });

  it("nimmt ein leeres Feld an — das ist der legitime Weg, die Einschraenkung abzuschalten", async () => {
    const res = await PUT(smtpRequest({ allowedRecipientDomains: "   " }));
    expect(res.status).toBe(200);
    expect(gespeicherteDomains()).toBe("");
  });

  it("nimmt ein fehlendes Feld an und speichert eine leere Liste", async () => {
    // Die Einstellungsseite schickt das Feld immer mit; ein Aufruf ohne das
    // Feld darf trotzdem keinen 500 ausloesen.
    const res = await PUT(smtpRequest({}));
    expect(res.status).toBe(200);
    expect(gespeicherteDomains()).toBe("");
  });

  it("lehnt mehr als MAX_ERLAUBTE_DOMAINS Domains mit 400 ab", async () => {
    const zuviele = Array.from(
      { length: freigabe.MAX_ERLAUBTE_DOMAINS + 1 },
      (_, i) => `domain${i}.de`,
    ).join(", ");
    const res = await PUT(smtpRequest({ allowedRecipientDomains: zuviele }));
    expect(res.status).toBe(400);
    expect(gespeicherteDomains()).toBeNull();
  });

  it("haelt die Aenderung der Liste im Audit-Log fest", async () => {
    // Wer diese Liste leert, schaltet die Freigabepruefung ab. Das muss mit
    // Benutzer und Zeitpunkt nachvollziehbar bleiben.
    await PUT(smtpRequest({ allowedRecipientDomains: "fes-minden.de" }));
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SMTP_CONFIG_UPDATED",
          userId: "hr1",
          details: expect.objectContaining({ allowedRecipientDomains: "fes-minden.de" }),
        }),
      }),
    );
  });

  it("laesst eine Rolle ohne Berechtigung gar nicht erst an die Liste", async () => {
    // Die Liste steht bewusst in den SMTP-Einstellungen: Wer versenden darf
    // (HR_EDIT_ROLES), soll die Schranke nicht selbst entfernen koennen.
    mockGetSession.mockResolvedValue({ ...HR_LEITUNG, role: "HR_STAFF" });
    const res = await PUT(smtpRequest({ allowedRecipientDomains: "beliebig.de" }));
    expect(res.status).toBe(403);
    expect(gespeicherteDomains()).toBeNull();
  });

  it("lehnt ohne Session mit 401 ab", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PUT(smtpRequest({ allowedRecipientDomains: "beliebig.de" }));
    expect(res.status).toBe(401);
    expect(gespeicherteDomains()).toBeNull();
  });
});
