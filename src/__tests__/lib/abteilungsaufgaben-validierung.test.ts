/**
 * Tests: Validierung der Abteilungsaufgaben (src/lib/validations/abteilungsaufgaben.ts)
 */

import { z } from "zod";
import {
  abteilungConfigSchema,
  abteilungConfigUpdateSchema,
  abteilungsAktionSchema,
  aufgabeLinkPatchSchema,
  fuehrungskraftAenderungFelder,
  fuehrungskraftAnlageFelder,
  meldungReservierterSchluessel,
  portalAufgabePatchSchema,
} from "@/lib/validations/abteilungsaufgaben";

function fehler(ergebnis: { success: boolean; error?: { errors: { message: string }[] } }): string | undefined {
  return ergebnis.success ? undefined : ergebnis.error?.errors[0]?.message;
}

describe("abteilungsAktionSchema", () => {
  it("leerer Body und {} heissen informieren", () => {
    expect(abteilungsAktionSchema.parse(undefined)).toEqual({ aktion: "informieren" });
    expect(abteilungsAktionSchema.parse(null)).toEqual({ aktion: "informieren" });
    expect(abteilungsAktionSchema.parse({})).toEqual({ aktion: "informieren" });
  });

  it("der alte Aufruf { action: 'remind' } heisst erinnern", () => {
    expect(abteilungsAktionSchema.parse({ action: "remind", departmentKey: "IT" })).toEqual({
      aktion: "erinnern",
      departmentKey: "IT",
    });
  });

  it("die vier Aktionen; Einzelaktionen brauchen einen Link-Schluessel", () => {
    expect(abteilungsAktionSchema.parse({ aktion: "erneut-senden", departmentKey: " IT " })).toEqual({
      aktion: "erneut-senden",
      departmentKey: "IT",
    });
    expect(abteilungsAktionSchema.parse({ aktion: "link-erneuern", departmentKey: "VORGESETZTER" })).toMatchObject({
      aktion: "link-erneuern",
    });
    expect(abteilungsAktionSchema.safeParse({ aktion: "erinnern" }).success).toBe(false);
    expect(fehler(abteilungsAktionSchema.safeParse({ aktion: "erinnern", departmentKey: "HR" }))).toBe(
      "Diese Zuständigkeit arbeitet im Portal und bekommt keinen Link.",
    );
    expect(fehler(abteilungsAktionSchema.safeParse({ aktion: "loeschen" }))).toBe("Unbekannte Aktion.");
    expect(fehler(abteilungsAktionSchema.safeParse({ action: "foo" }))).toBe("Unbekannte Aktion.");
  });
});

describe("aufgabeLinkPatchSchema", () => {
  it("Status und/oder Kommentar; notes wird verworfen", () => {
    expect(aufgabeLinkPatchSchema.parse({ isCompleted: true, notes: "HR-intern" })).toEqual({ isCompleted: true });
    expect(aufgabeLinkPatchSchema.parse({ comment: "  erledigt  " })).toEqual({ comment: "erledigt" });
    expect(aufgabeLinkPatchSchema.parse({ comment: "" })).toEqual({ comment: "" });
    expect(aufgabeLinkPatchSchema.parse({ isCompleted: false, comment: null })).toEqual({
      isCompleted: false,
      comment: null,
    });
  });

  it("ohne Aenderung, falscher Typ oder 1001 Zeichen: 400-Meldung", () => {
    expect(fehler(aufgabeLinkPatchSchema.safeParse({}))).toBe("Bitte Status oder Kommentar angeben.");
    expect(fehler(aufgabeLinkPatchSchema.safeParse({ comment: null }))).toBe("Bitte Status oder Kommentar angeben.");
    // Kaputtes JSON reicht die Route als undefined weiter: deutsche Meldung statt zods "Required".
    expect(fehler(aufgabeLinkPatchSchema.safeParse(undefined))).toBe("Ungültige Eingabe");
    expect(fehler(aufgabeLinkPatchSchema.safeParse([]))).toBe("Ungültige Eingabe");
    expect(fehler(portalAufgabePatchSchema.safeParse(undefined))).toBe("Ungültige Eingabe");
    expect(fehler(abteilungConfigSchema.safeParse("IT"))).toBe("Ungültige Eingabe");
    expect(fehler(abteilungConfigUpdateSchema.safeParse(null))).toBe("Ungültige Eingabe");
    expect(aufgabeLinkPatchSchema.safeParse({ isCompleted: "ja" }).success).toBe(false);
    expect(fehler(aufgabeLinkPatchSchema.safeParse({ comment: "x".repeat(1001) }))).toBe(
      "Der Kommentar darf höchstens 1000 Zeichen lang sein.",
    );
    expect(aufgabeLinkPatchSchema.safeParse({ comment: "x".repeat(1000) }).success).toBe(true);
  });
});

describe("portalAufgabePatchSchema", () => {
  it("nimmt Status, Notiz und Zustaendigkeit; '' bei Zustaendigkeit heisst keine", () => {
    expect(portalAufgabePatchSchema.parse({ isCompleted: true })).toEqual({ isCompleted: true });
    expect(portalAufgabePatchSchema.parse({ notes: "intern" })).toEqual({ notes: "intern" });
    expect(portalAufgabePatchSchema.parse({ assigneeDepartment: "" })).toEqual({ assigneeDepartment: null });
    expect(portalAufgabePatchSchema.parse({ assigneeDepartment: "FACILITY" })).toEqual({ assigneeDepartment: "FACILITY" });
  });

  it("weist falsche Formen ab", () => {
    expect(portalAufgabePatchSchema.safeParse({}).success).toBe(false);
    expect(portalAufgabePatchSchema.safeParse({ assigneeDepartment: "it" }).success).toBe(false);
    expect(portalAufgabePatchSchema.safeParse({ assigneeDepartment: 5 }).success).toBe(false);
    expect(portalAufgabePatchSchema.safeParse({ notes: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("abteilungConfigSchema", () => {
  const gueltig = { departmentKey: "VERWALTUNG", departmentName: "Sekretariat Minden", email: " sek@example.org " };

  it("zentral (organizationId leer/null) und fuer eine Einrichtung", () => {
    expect(abteilungConfigSchema.parse({ ...gueltig, organizationId: "" })).toEqual({
      departmentKey: "VERWALTUNG",
      departmentName: "Sekretariat Minden",
      email: "sek@example.org",
      organizationId: undefined,
    });
    expect(abteilungConfigSchema.parse({ ...gueltig, organizationId: "org-1" }).organizationId).toBe("org-1");
  });

  it("reservierte Schluessel werden mit Begruendung abgewiesen", () => {
    expect(fehler(abteilungConfigSchema.safeParse({ ...gueltig, departmentKey: "VORGESETZTER" }))).toBe(
      "Der Schlüssel „VORGESETZTER“ ist reserviert: Aufgaben für Vorgesetzte gehen an die Führungskraft des Vorgangs.",
    );
    expect(fehler(abteilungConfigSchema.safeParse({ ...gueltig, departmentKey: "HR" }))).toBe(
      meldungReservierterSchluessel("HR"),
    );
    expect(abteilungConfigSchema.safeParse({ ...gueltig, departmentKey: "MITARBEITER" }).success).toBe(false);
  });

  it("Schluesselform, Name und Adresse", () => {
    expect(abteilungConfigSchema.safeParse({ ...gueltig, departmentKey: "it" }).success).toBe(false);
    expect(abteilungConfigSchema.safeParse({ ...gueltig, departmentName: "" }).success).toBe(false);
    expect(abteilungConfigSchema.safeParse({ ...gueltig, departmentName: "<b>IT</b>" }).success).toBe(false);
    expect(fehler(abteilungConfigSchema.safeParse({ ...gueltig, email: "kein-at" }))).toBe(
      "Die E-Mail-Adresse ist nicht gültig.",
    );
  });
});

describe("abteilungConfigUpdateSchema", () => {
  it("mindestens ein Feld; E-Mail als Zahl ist 400 statt 500", () => {
    expect(abteilungConfigUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(abteilungConfigUpdateSchema.parse({ departmentName: " IT ", departmentKey: "X" })).toEqual({
      departmentName: "IT",
    });
    expect(abteilungConfigUpdateSchema.safeParse({}).success).toBe(false);
    expect(abteilungConfigUpdateSchema.safeParse({ email: 42 }).success).toBe(false);
  });
});

describe("Fuehrungskraft-Felder", () => {
  const anlage = z.object(fuehrungskraftAnlageFelder);
  const aenderung = z.object(fuehrungskraftAenderungFelder);

  it("Anlage: leer = nicht angegeben, sonst getrimmt", () => {
    expect(anlage.parse({ supervisorEmail: "", supervisorName: "  " })).toEqual({
      supervisorEmail: undefined,
      supervisorName: undefined,
    });
    expect(anlage.parse({ supervisorEmail: " leitung@example.org ", supervisorName: " Anna Leitung " })).toEqual({
      supervisorEmail: "leitung@example.org",
      supervisorName: "Anna Leitung",
    });
    expect(anlage.safeParse({ supervisorEmail: "kaputt" }).success).toBe(false);
    expect(anlage.safeParse({ supervisorName: "Anna\nLeitung" }).success).toBe(false);
  });

  it("Aenderung: undefined = unveraendert, '' oder null = loeschen", () => {
    expect(aenderung.parse({})).toEqual({});
    expect(aenderung.parse({ supervisorEmail: "", supervisorName: null })).toEqual({
      supervisorEmail: null,
      supervisorName: null,
    });
    expect(aenderung.parse({ supervisorEmail: "leitung@example.org" })).toEqual({ supervisorEmail: "leitung@example.org" });
  });
});
