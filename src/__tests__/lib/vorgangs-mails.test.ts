/**
 * Mailprotokoll je Vorgang — Zuordnung einer Mail zu ihrem Vorgang und die
 * Zeilen des Reiters „E-Mails“ (src/lib/vorgangs-mails.ts).
 */

import fs from "fs";
import path from "path";
import {
  MODUL_ZU_VORGANGSTYP,
  VORGANGS_MODULE,
  bezugAusModul,
  mailZeileBauen,
  vorgangBezugAusPayload,
} from "@/lib/vorgangs-mails";

const ID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ID2 = "9a8b7c6d-5e4f-4a3b-9c1d-0e1f2a3b4c5d";

describe("vorgangBezugAusPayload", () => {
  it.each([
    ["onboardingId", "ONBOARDING"],
    ["offboardingId", "OFFBOARDING"],
    ["civilServiceId", "CIVIL_SERVICE"],
    ["contractEndId", "CONTRACT_END"],
    ["elternzeitId", "ELTERNZEIT"],
    ["mutterschutzId", "MUTTERSCHUTZ"],
  ])("%s → %s", (schluessel, typ) => {
    expect(vorgangBezugAusPayload("x", { [schluessel]: ID })).toEqual({ vorgangTyp: typ, vorgangId: ID });
  });

  it("der erste Schluessel in der Reihenfolge gewinnt", () => {
    expect(vorgangBezugAusPayload("x", { contractEndId: ID2, onboardingId: ID })?.vorgangTyp).toBe("ONBOARDING");
  });

  it("BEM nie — die Faelle sind eine versiegelte Akte", () => {
    expect(vorgangBezugAusPayload("bem-frist-erinnerung", { bemFallId: ID })).toBeNull();
  });

  it("nur echte IDs (UUID), keine Beispielwerte oder leeren Felder", () => {
    expect(vorgangBezugAusPayload("x", { onboardingId: "o1" })).toBeNull();
    expect(vorgangBezugAusPayload("x", { onboardingId: "" })).toBeNull();
    expect(vorgangBezugAusPayload("x", { onboardingId: 42 })).toBeNull();
  });

  it("Unterlagen: modul + refId", () => {
    expect(vorgangBezugAusPayload("unterlagen-erinnerung", { modul: "MUTTERSCHUTZ", refId: ID })).toEqual({
      vorgangTyp: "MUTTERSCHUTZ",
      vorgangId: ID,
    });
  });

  it("Sammelmails ohne Vorgangs-ID bleiben ohne Bezug", () => {
    expect(vorgangBezugAusPayload("psi-deadline-warning", { warnings: [{ processId: ID }] })).toBeNull();
    expect(vorgangBezugAusPayload("automatischer-lauf-bericht", { lauf: "reminders" })).toBeNull();
  });
});

describe("bezugAusModul (Dokumentenpaket)", () => {
  it("die Vertragsverlaengerung gehoert zum Vertragsende-Vorgang", () => {
    expect(bezugAusModul("VERTRAGSVERLAENGERUNG", ID)).toEqual({ vorgangTyp: "CONTRACT_END", vorgangId: ID });
    expect(bezugAusModul("VERBEAMTUNG", ID)?.vorgangTyp).toBe("CIVIL_SERVICE");
    expect(bezugAusModul("UNBEKANNT", ID)).toBeNull();
    expect(bezugAusModul("ONBOARDING", "kein-uuid")).toBeNull();
  });

  it("jede Vorgangsart hat ein URL-Segment", () => {
    const arten = new Set(Object.values(MODUL_ZU_VORGANGSTYP));
    for (const art of arten) expect(Object.values(VORGANGS_MODULE)).toContain(art);
  });

  it("dokumentenpaket.ts gibt den Bezug mit (der Payload traegt ihn nur beim Onboarding)", () => {
    const quelle = fs.readFileSync(path.join(process.cwd(), "src/lib/dokumentenpaket.ts"), "utf8");
    expect(quelle).toContain("bezug: bezugAusModul(opts.modul, opts.refId)");
  });

  it("jedes URL-Segment der Schnittstelle hat eine Detailseite, die das Protokoll einbindet", () => {
    const seite: Record<string, string> = {
      onboarding: "src/app/(portal)/dashboard/[id]/detail-content.tsx",
      offboarding: "src/app/(portal)/dashboard/offboarding/[id]/offboarding-detail-content.tsx",
      "civil-service": "src/app/(portal)/dashboard/civil-service/[id]/civil-service-detail-content.tsx",
      "contract-end": "src/app/(portal)/dashboard/contract-end/[id]/contract-end-detail-content.tsx",
      elternzeit: "src/app/(portal)/dashboard/elternzeit/[id]/elternzeit-detail-content.tsx",
      mutterschutz: "src/app/(portal)/dashboard/mutterschutz/[id]/mutterschutz-detail-content.tsx",
    };
    expect(Object.keys(seite).sort()).toEqual(Object.keys(VORGANGS_MODULE).sort());
    for (const [modul, datei] of Object.entries(seite)) {
      const quelle = fs.readFileSync(path.join(process.cwd(), datei), "utf8");
      expect({ modul, eingebunden: quelle.includes(`<MailProtokoll modul="${modul}"`) }).toEqual({ modul, eingebunden: true });
    }
  });
});

describe("mailZeileBauen", () => {
  const basis = {
    id: "l1",
    createdAt: new Date("2026-09-30T06:00:00Z"),
    event: "employee-reminder",
    subject: "Erinnerung",
    recipient: "max@example.org",
    cc: "",
    bcc: null,
  };

  it("SENT: Anhang-Vermerk statt Grund, Name aus dem Katalog", () => {
    const z = mailZeileBauen({ ...basis, status: "SENT", detail: "2 Anhang/Anhaenge: a.pdf, b.pdf" });
    expect(z.statusText).toBe("versendet");
    expect(z.grund).toBeNull();
    expect(z.anhang).toContain("a.pdf");
    expect(z.ereignisName).not.toBe("employee-reminder");
    expect(z.cc).toBeNull();
  });

  it("FAILED/SKIPPED: der Grund steht da", () => {
    const z = mailZeileBauen({ ...basis, status: "SKIPPED", detail: "E-Mail-Vorlage ist deaktiviert" });
    expect(z.statusText).toBe("nicht versendet");
    expect(z.grund).toBe("E-Mail-Vorlage ist deaktiviert");
    expect(z.anhang).toBeNull();
  });

  it("unbekanntes Event: der technische Name", () => {
    expect(mailZeileBauen({ ...basis, event: "freies-event", status: "SENT", detail: null }).ereignisName).toBe("freies-event");
  });
});
