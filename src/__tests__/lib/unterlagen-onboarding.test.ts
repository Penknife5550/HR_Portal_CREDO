/**
 * Tests: Unterlagen nachfordern — Baustein ONBOARDING (src/lib/unterlagen-onboarding.ts)
 *
 * Die Onboarding-Regeln, die der modulneutrale Dienst ueber die Schnittstelle
 * abfragt: verfuegbar (Nachweise abgegeben UND nicht EXPIRED), Sperre des
 * Vorgangs (status not EXPIRED), Adressvorschlaege (Vorgang zuerst, die
 * Personalakte nur als zweiter Vorschlag), Auswahl (offene Nachweise
 * vorgeschlagen, SONSTIGES nie, sensibel/Schriftform/Ablaufdatum aus den
 * Listen) und die Abbildung der geladenen Zeile — auch der schon geladenen
 * Zeile der Vorgangsansicht (`onboardingVorgangAusAnsicht`). Seit Schritt 6
 * dazu die Uebernahme beim Annehmen (Art und Ablauf, je Datei ein `Document`)
 * und ihre Ruecknahme.
 */

jest.mock("@/lib/db", () => ({
  prisma: jest.requireActual("../hilfen/unterlagen-fake-db").fakePrisma,
}));

import { fakePrisma, udb, udbLeeren, type Zeile } from "../hilfen/unterlagen-fake-db";
import { ddb, ddbLeeren, neuesDokument } from "../hilfen/unterlagen-fake-db";
import {
  ONBOARDING_KATALOG,
  ONBOARDING_NICHT_VERFUEGBAR,
  ONBOARDING_STANDARDART,
  onboardingBaustein,
  onboardingUnterlagenVorgang,
  onboardingVorgangAusAnsicht,
  type OnboardingUnterlagenQuelle,
} from "@/lib/unterlagen-onboarding";
import { MELDUNGEN } from "@/lib/unterlagen";
import {
  NACHFORDERUNG_HINWEISE,
  SELECTABLE_DOCUMENT_TYPES,
  SENSIBEL_SPERRGRUND_TEXTE,
} from "@/lib/required-documents";
import type { UebernahmeKontext } from "@/lib/unterlagen-dienst";
import type { Prisma } from "@prisma/client";

const ID = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

function zeile(teil: Zeile = {}): Zeile {
  return {
    id: ID,
    displayId: "2026-GYM-014",
    organizationId: "org-1",
    status: "SUBMITTED",
    email: " anna.privat@example.org ",
    firstName: "Anna (HR)",
    lastName: "Beispiel (HR)",
    submittedAt: new Date("2026-09-10T10:00:00.000Z"),
    questionnaireType: "STANDARD",
    organization: { name: "FES Minden", type: "GYMNASIUM" },
    employee: null,
    personalData: {
      firstName: "Anna",
      lastName: "Beispiel",
      isComplete: true,
      birthDate: new Date("1990-05-01T00:00:00.000Z"),
      rvEntscheidung: null,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
      severelyDisabled: false,
      children: [{ id: "kind-1" }],
    },
    documents: [{ type: "PKV_NACHWEIS" }],
    ...teil,
  };
}

const abbilden = (z: Zeile, required: string[] = ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]) =>
  onboardingUnterlagenVorgang(z as unknown as OnboardingUnterlagenQuelle, required);

beforeEach(() => {
  udbLeeren();
  ddbLeeren();
});

describe("onboardingUnterlagenVorgang", () => {
  it("bildet Vorgang, Pflichten und vorhandene Arten ab — Name aus dem Fragebogen, Adresse getrimmt", () => {
    const v = abbilden(zeile());
    expect(v).toMatchObject({
      modul: "ONBOARDING",
      id: ID,
      einrichtung: "FES Minden",
      vorname: "Anna",
      nachname: "Beispiel",
      email: "anna.privat@example.org",
      eingestellt: false,
      organisationstyp: "GYMNASIUM",
      personalakteEmail: null,
      vorhandeneTypen: ["PKV_NACHWEIS"],
      severelyDisabled: false,
    });
    expect(v.pflicht).toMatchObject({
      required: ["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"],
      hasChildren: true,
      masernschutzPflichtig: true,
      aufenthaltstitelErforderlich: true,
      healthInsuranceType: "privat",
    });
  });

  it("ohne Namen im Fragebogen der Name am Vorgang, nie die Adresse", () => {
    const v = abbilden(zeile({ personalData: null }));
    expect(v).toMatchObject({ vorname: "Anna (HR)", nachname: "Beispiel (HR)" });
    const leer = abbilden(zeile({ personalData: null, firstName: null, lastName: " " }));
    expect(leer).toMatchObject({ vorname: null, nachname: null });
  });

  it("EXPIRED heisst eingestellt", () => {
    expect(abbilden(zeile({ status: "EXPIRED" })).eingestellt).toBe(true);
  });

  it("ohne Kinder keine Geburtsurkunde der Kinder als Pflicht", () => {
    const ohne = abbilden(zeile({ personalData: { ...(zeile().personalData as Zeile), children: [] } }));
    expect(ohne.pflicht.hasChildren).toBe(false);
  });
});

describe("onboardingVorgangAusAnsicht (Zeile der Vorgangsansicht, kein zweites Laden)", () => {
  /** So liefert GET /api/onboarding/[id] die Zeile: ohne `employee`, mit `employeeId` und allen Spalten. */
  function ansicht(teil: Zeile = {}): OnboardingUnterlagenQuelle & { employeeId: string | null } {
    return {
      ...zeile(),
      employee: undefined,
      employeeId: "akte-1",
      personalData: { ...(zeile().personalData as Zeile), iban: "verschluesselt", children: [{ id: "k" }] },
      documents: [{ type: "PKV_NACHWEIS", fileName: "pkv.pdf" }],
      ...teil,
    } as unknown as OnboardingUnterlagenQuelle & { employeeId: string | null };
  }

  it("mit Bearbeitungsrecht: die Adresse der Personalakte wird nachgeladen — Vorgang und Vorlage nicht", async () => {
    udb.personalakten = [{ id: "akte-1", email: "a.beispiel@credo-gruppe.de" }];
    const v = await onboardingVorgangAusAnsicht(ansicht(), ["SV_AUSWEIS"], true);
    expect(v.personalakteEmail).toBe("a.beispiel@credo-gruppe.de");
    expect(v.pflicht.required).toEqual(["SV_AUSWEIS"]);
    expect(v.vorhandeneTypen).toEqual(["PKV_NACHWEIS"]);
    expect(udb.aufrufe).toEqual(["employee.findUnique"]);
    // Nichts aus der Zeile, was die Nachforderung nicht braucht.
    expect(JSON.stringify(v)).not.toContain("verschluesselt");
    expect(JSON.stringify(v)).not.toContain("pkv.pdf");
  });

  it("ohne Bearbeitungsrecht oder ohne verknuepfte Akte: keine Abfrage, kein zweiter Vorschlag", async () => {
    udb.personalakten = [{ id: "akte-1", email: "a.beispiel@credo-gruppe.de" }];
    const leser = await onboardingVorgangAusAnsicht(ansicht(), [], false);
    const ohneAkte = await onboardingVorgangAusAnsicht(ansicht({ employeeId: null }), [], true);
    expect(leser.personalakteEmail).toBeNull();
    expect(ohneAkte.personalakteEmail).toBeNull();
    expect(udb.aufrufe).toEqual([]);
    expect(onboardingBaustein.empfaengerVorschlaege(leser)).toHaveLength(1);
  });
});

describe("verfuegbar", () => {
  it("nach der Abgabe ja, auch bei REVIEWED/COMPLETED ohne Zeitstempel", () => {
    expect(onboardingBaustein.verfuegbar(abbilden(zeile()))).toEqual({ ok: true });
    const bestand = zeile({ status: "COMPLETED", submittedAt: null, personalData: null });
    expect(onboardingBaustein.verfuegbar(abbilden(bestand))).toEqual({ ok: true });
  });

  it("vor der Abgabe nein, mit Grund im Klartext", () => {
    const offen = zeile({
      status: "SUPERVISOR_SUBMITTED",
      submittedAt: null,
      personalData: { ...(zeile().personalData as Zeile), isComplete: false },
    });
    expect(onboardingBaustein.verfuegbar(abbilden(offen))).toEqual({
      ok: false,
      grund: ONBOARDING_NICHT_VERFUEGBAR.FRAGEBOGEN_OFFEN,
    });
  });

  it("EXPIRED nein — obwohl die Nachweise abgegeben sind", () => {
    expect(onboardingBaustein.verfuegbar(abbilden(zeile({ status: "EXPIRED" })))).toEqual({
      ok: false,
      grund: ONBOARDING_NICHT_VERFUEGBAR.VORGANG_EINGESTELLT,
    });
  });
});

describe("empfaengerVorschlaege", () => {
  it("Adresse des Vorgangs zuerst, Personalakte als zweiter Vorschlag nur bei Abweichung", () => {
    expect(onboardingBaustein.empfaengerVorschlaege(abbilden(zeile()))).toEqual([
      { adresse: "anna.privat@example.org", quelle: "VORGANG" },
    ]);
    const gleich = abbilden(zeile({ employee: { email: "Anna.Privat@Example.org" } }));
    expect(onboardingBaustein.empfaengerVorschlaege(gleich)).toHaveLength(1);
    const akte = abbilden(zeile({ employee: { email: "a.beispiel@credo-gruppe.de" } }));
    expect(onboardingBaustein.empfaengerVorschlaege(akte)).toEqual([
      { adresse: "anna.privat@example.org", quelle: "VORGANG" },
      { adresse: "a.beispiel@credo-gruppe.de", quelle: "PERSONALAKTE" },
    ]);
  });
});

describe("auswahl", () => {
  it("offene Nachweise zuerst und vorgeschlagen, dann der Katalog — nie SONSTIGES, jede Art einmal", () => {
    const auswahl = onboardingBaustein.auswahl(abbilden(zeile()));
    // PKV liegt schon vor → nicht vorgeschlagen.
    expect(auswahl.filter((a) => a.vorgeschlagen).map((a) => a.typ)).toEqual([
      "MASERNSCHUTZ",
      "AUFENTHALTSTITEL",
      "ARBEITSERLAUBNIS",
    ]);
    expect(auswahl.map((a) => a.typ).sort()).toEqual([...ONBOARDING_KATALOG].sort());
    expect(ONBOARDING_KATALOG).not.toContain("SONSTIGES");
    expect(ONBOARDING_KATALOG).toHaveLength(SELECTABLE_DOCUMENT_TYPES.length - 1);
  });

  it("sensibel, erlaubt, Schriftform, Ablaufdatum und Hinweis je Art", () => {
    const auswahl = new Map(onboardingBaustein.auswahl(abbilden(zeile())).map((a) => [a.typ, a]));
    expect(auswahl.get("AUFENTHALTSTITEL")).toMatchObject({
      label: "Aufenthaltstitel",
      sensibel: true,
      erlaubt: true,
      fristpflichtig: true,
      hinweis: NACHFORDERUNG_HINWEISE.AUFENTHALTSTITEL,
    });
    expect(auswahl.get("FUEHRUNGSZEUGNIS")).toMatchObject({ sensibel: true, erlaubt: false });
    expect(auswahl.get("FUEHRUNGSZEUGNIS")!.grund).toBeTruthy();
    expect(auswahl.get("SB_AUSWEIS")).toMatchObject({ sensibel: true, erlaubt: false });
    expect(auswahl.get("ARBEITSVERTRAG")).toMatchObject({ originalErforderlich: true, sensibel: false, erlaubt: true });
    expect(auswahl.get("SV_AUSWEIS")).toMatchObject({ originalErforderlich: false, fristpflichtig: false, hinweis: null });
  });
});

describe("Laden und Sperren", () => {
  it("vorgangLaden: eigenes select, Pflichtliste der AKTUELLEN Vorlage bzw. der Rueckfall", async () => {
    udb.vorgaenge = [zeile()];
    const ohneVorlage = await onboardingBaustein.vorgangLaden(ID);
    expect(ohneVorlage!.pflicht.required).toEqual(["GEBURTSURKUNDE_EIGEN", "GEBURTSURKUNDE_KIND"]);

    udb.formularVorlagen = [{ questionnaireType: "STANDARD", requiredDocuments: ["SV_AUSWEIS"] }];
    const mitVorlage = await onboardingBaustein.vorgangLaden(ID);
    expect(mitVorlage!.pflicht.required).toEqual(["SV_AUSWEIS"]);
    expect(await onboardingBaustein.vorgangLaden("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("vorgangSperren: nur, wenn der Vorgang nicht EXPIRED ist", async () => {
    udb.vorgaenge = [zeile()];
    const tx = fakePrisma as unknown as Prisma.TransactionClient;
    expect(await onboardingBaustein.vorgangSperren(tx, ID)).toBe(true);
    udb.vorgaenge[0].status = "EXPIRED";
    expect(await onboardingBaustein.vorgangSperren(tx, ID)).toBe(false);
  });

  it("Bereich, Kopf, Protokoll und Pfade", () => {
    expect(onboardingBaustein.bereichWhere(ID)).toEqual({ modul: "ONBOARDING", onboardingId: ID });
    expect(onboardingBaustein.kopfDaten(ID)).toEqual({ modul: "ONBOARDING", onboardingId: ID });
    expect(onboardingBaustein.vorgangIdAus({ onboardingId: ID })).toBe(ID);
    expect(onboardingBaustein.vorgangIdAus({ onboardingId: null })).toBeNull();
    expect(onboardingBaustein.audit(ID)).toEqual({ processType: "ONBOARDING", fk: { onboardingId: ID } });
    // Die HR-Mails landen im Reiter „Dokumente" bei der Karte (Schritt 11,
    // Abweichung von Feinplanung 8.2) — den Parameter liest `reiterAusSuche`
    // der Vorgangsansicht (belegt in onboarding-dokumente-nachforderung.test.tsx).
    expect(onboardingBaustein.portalPfad(ID)).toBe(`/dashboard/${ID}?tab=dokumente`);
    const url = new URL(onboardingBaustein.portalPfad(ID), "https://hr.fes-credo.de");
    expect(url.pathname).toBe(`/dashboard/${ID}`);
    expect(url.searchParams.get("tab")).toBe("dokumente");
    expect(onboardingBaustein.apiBasis(ID)).toBe(`/api/onboarding/${ID}/unterlagen`);
    expect(onboardingBaustein.mitDetails(abbilden(zeile()))).toBe(true);
  });
});

describe("annahmePruefen (4.4, Z1)", () => {
  const JETZT = new Date("2026-09-21T08:00:00.000Z");
  const v = () => abbilden(zeile());
  const angabe = new Date("2028-03-31T00:00:00.000Z");
  const pruefen = (e: Partial<Parameters<typeof onboardingBaustein.annahmePruefen>[1]>) =>
    onboardingBaustein.annahmePruefen(v(), { typ: "AUFENTHALTSTITEL", gueltigBisAngabe: angabe, ...e }, JETZT);

  it("Katalogzeile: ihre Art; ohne Angabe im Body gilt das „Gültig bis“ der Person", () => {
    expect(pruefen({})).toEqual({
      ok: true,
      art: "AUFENTHALTSTITEL",
      gueltigBis: new Date("2028-03-31T00:00:00.000Z"),
      unbefristet: false,
    });
  });

  it("ein Datum im Body geht vor; null heisst „Datum später nachtragen“; „unbefristet“ setzt nur das Kennzeichen", () => {
    expect(pruefen({ gueltigBis: "2029-01-31" })).toMatchObject({
      ok: true,
      gueltigBis: new Date("2029-01-31T00:00:00.000Z"),
      unbefristet: false,
    });
    expect(pruefen({ gueltigBis: null })).toEqual({ ok: true, art: "AUFENTHALTSTITEL", gueltigBis: null, unbefristet: false });
    expect(pruefen({ unbefristet: true })).toEqual({ ok: true, art: "AUFENTHALTSTITEL", gueltigBis: null, unbefristet: true });
  });

  it("ein Datum mehr als 20 Jahre voraus oder kein Kalendertag → 400 mit dem Text von pruefeGueltigBis", () => {
    const weit = pruefen({ gueltigBis: "2060-01-01" });
    expect(weit).toMatchObject({ ok: false, status: 400, grund: "GUELTIG_BIS_UNGUELTIG" });
    expect(weit.ok ? "" : weit.meldung).toContain("20 Jahre");
    expect(pruefen({ gueltigBis: "2027-02-31" })).toMatchObject({ ok: false, status: 400 });
    // Ein vergangenes Datum ist eine Tatsache, kein Fehler — der Dialog warnt.
    expect(pruefen({ gueltigBis: "2025-01-01" })).toMatchObject({ ok: true });
  });

  it("Art ohne Ablauf: Datum oder „unbefristet“ → 400; ohne Angabe kein Datum, auch nicht aus der Angabe der Person", () => {
    const pkv = (e: Partial<Parameters<typeof onboardingBaustein.annahmePruefen>[1]>) =>
      onboardingBaustein.annahmePruefen(v(), { typ: "PKV_NACHWEIS", gueltigBisAngabe: angabe, ...e }, JETZT);
    expect(pkv({})).toEqual({ ok: true, art: "PKV_NACHWEIS", gueltigBis: null, unbefristet: false });
    expect(pkv({ gueltigBis: "2029-01-31" })).toMatchObject({ ok: false, status: 400, grund: "GUELTIG_BIS_UNGUELTIG" });
    expect(pkv({ unbefristet: true })).toEqual({
      ok: false,
      status: 400,
      grund: "UNBEFRISTET_OHNE_ABLAUFDATUM",
      meldung: MELDUNGEN.UNBEFRISTET_OHNE_ABLAUFDATUM,
    });
  });

  it("Katalogzeile mit einer anderen Art → 400; dieselbe Art noch einmal ist in Ordnung", () => {
    expect(pruefen({ dokumentTyp: "SONSTIGES" })).toEqual({
      ok: false,
      status: 400,
      grund: "ART_NICHT_WAEHLBAR",
      meldung: MELDUNGEN.ART_NICHT_WAEHLBAR,
    });
    expect(pruefen({ dokumentTyp: "AUFENTHALTSTITEL" })).toMatchObject({ ok: true });
  });

  describe("frei benannte Zeile", () => {
    const frei = (e: Partial<Parameters<typeof onboardingBaustein.annahmePruefen>[1]>, vorgang = v()) =>
      onboardingBaustein.annahmePruefen(vorgang, { typ: null, gueltigBisAngabe: null, ...e }, JETZT);

    it("ohne Wahl SONSTIGES — nie still eine andere Art", () => {
      expect(ONBOARDING_STANDARDART).toBe("SONSTIGES");
      expect(frei({})).toEqual({ ok: true, art: "SONSTIGES", gueltigBis: null, unbefristet: false });
    });

    it("jede Art des Katalogs; eine fristpflichtige bekommt ihr Datum", () => {
      expect(frei({ dokumentTyp: "RV_BEFREIUNG" })).toMatchObject({ ok: true, art: "RV_BEFREIUNG" });
      expect(frei({ dokumentTyp: "AUFENTHALTSTITEL", gueltigBis: "2029-01-31" })).toEqual({
        ok: true,
        art: "AUFENTHALTSTITEL",
        gueltigBis: new Date("2029-01-31T00:00:00.000Z"),
        unbefristet: false,
      });
    });

    it("unbekannte Art → 400", () => {
      expect(frei({ dokumentTyp: "GIBT_ES_NICHT" })).toEqual({
        ok: false,
        status: 400,
        grund: "TYP_UNBEKANNT",
        meldung: MELDUNGEN.TYP_UNBEKANNT,
      });
    });

    it("sensible Art nur, wenn sensibelAnforderbar sie zulaesst (Abschnitt 11)", () => {
      // Fuehrungszeugnis: nicht Pflicht, liegt nicht vor → 409 mit Grund.
      expect(frei({ dokumentTyp: "FUEHRUNGSZEUGNIS" })).toEqual({
        ok: false,
        status: 409,
        grund: "ART_NICHT_UEBERNEHMBAR",
        meldung: MELDUNGEN.ART_NICHT_UEBERNEHMBAR,
        hinweis: SENSIBEL_SPERRGRUND_TEXTE.NICHT_PFLICHT,
      });
      // SB-Ausweis nur mit der Angabe „schwerbehindert".
      expect(frei({ dokumentTyp: "SB_AUSWEIS" })).toMatchObject({ ok: false, status: 409 });
      const schwerbehindert = abbilden(
        zeile({ personalData: { ...(zeile().personalData as Zeile), severelyDisabled: true } }),
      );
      expect(frei({ dokumentTyp: "SB_AUSWEIS" }, schwerbehindert)).toMatchObject({ ok: true, art: "SB_AUSWEIS" });
      // Aufenthaltstitel ist hier Pflicht → erlaubt.
      expect(frei({ dokumentTyp: "AUFENTHALTSTITEL" })).toMatchObject({ ok: true });
    });
  });
});

describe("uebernehmen, uebernahmeLaden, uebernahmeZuruecknehmen (4.4, 4.5)", () => {
  const tx = fakePrisma as unknown as Prisma.TransactionClient;
  const JETZT = new Date("2026-09-21T08:00:00.000Z");
  const DATEI = "5d8e3f9a-4c5f-4e7d-9a0b-9c8d7e6f5a4b";

  function kontext(teil: Partial<UebernahmeKontext> = {}): UebernahmeKontext {
    return {
      vorgangId: ID,
      art: "AUFENTHALTSTITEL",
      bezeichnung: null,
      gueltigBis: new Date("2028-03-31T00:00:00.000Z"),
      unbefristet: false,
      datei: {
        id: DATEI,
        anzeigeName: "titel-vorne.jpg",
        mimeType: "image/jpeg",
        groesse: 12345,
        uebermitteltAm: new Date("2026-09-20T09:00:00.000Z"),
      },
      zielPfad: `uploads/${ID}/${DATEI}.jpg`,
      entschiedenVonId: "u-hr",
      jetzt: JETZT,
      ...teil,
    };
  }

  it("ein Document je Datei: APPROVED, geprueft von HR, relativer Pfad, Anzeigename, neuer Erinnerungszyklus", async () => {
    const r = await onboardingBaustein.uebernehmen(tx, kontext());
    expect(ddb.dokumente).toHaveLength(1);
    const d = ddb.dokumente[0];
    expect(r).toEqual({ ziel: "DOCUMENT", id: d.id, neuerPfad: `uploads/${ID}/${DATEI}.jpg` });
    expect(d).toMatchObject({
      onboardingId: ID,
      type: "AUFENTHALTSTITEL",
      bezeichnung: null,
      fileName: "titel-vorne.jpg",
      filePath: `uploads/${ID}/${DATEI}.jpg`,
      fileSize: 12345,
      mimeType: "image/jpeg",
      status: "APPROVED",
      reviewedById: "u-hr",
      unbefristet: false,
      ablaufErinnertAm: null,
      ablaufErinnertStufe: null,
    });
    expect(d.reviewedAt).toEqual(JETZT);
    expect(d.uploadedAt).toEqual(new Date("2026-09-20T09:00:00.000Z"));
    expect(d.gueltigBis).toEqual(new Date("2028-03-31T00:00:00.000Z"));
    // Nichts ausser dem Document: kein Fragebogen (rvAntragEingangAm), keine Checkliste.
    expect(udb.aufrufe).toEqual(["document.create"]);
  });

  it("freie Zeile: ihr Name als `bezeichnung`; „unbefristet“ als Kennzeichen", async () => {
    await onboardingBaustein.uebernehmen(
      tx,
      kontext({ art: "SONSTIGES", bezeichnung: "Unterschriebener RV-Antrag", gueltigBis: null }),
    );
    await onboardingBaustein.uebernehmen(tx, kontext({ gueltigBis: null, unbefristet: true }));
    expect(ddb.dokumente[0]).toMatchObject({ type: "SONSTIGES", bezeichnung: "Unterschriebener RV-Antrag" });
    expect(ddb.dokumente[1]).toMatchObject({ unbefristet: true, gueltigBis: null });
  });

  it("Laden und Loeschen nur fuer Dokumente DIESES Vorgangs; die Anzahl sagt, ob alle da waren", async () => {
    const eigen = neuesDokument({ onboardingId: ID, filePath: `uploads/${ID}/a.pdf` });
    const fremd = neuesDokument({ onboardingId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", filePath: "uploads/x/b.pdf" });
    ddb.dokumente.push(eigen, fremd);

    expect(await onboardingBaustein.uebernahmeLaden(ID, [eigen.id as string, fremd.id as string])).toEqual([
      { id: eigen.id, pfad: `uploads/${ID}/a.pdf` },
    ]);
    expect(
      await onboardingBaustein.uebernahmeZuruecknehmen(tx, { vorgangId: ID, ids: [eigen.id as string, fremd.id as string] }),
    ).toBe(1);
    expect(ddb.dokumente).toEqual([fremd]);
  });

  it("zielPfadeVerwendet: nur Pfade, auf die ein Document DIESES Vorgangs zeigt — leere Liste ohne Abfrage", async () => {
    const ANDERER = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
    ddb.dokumente.push(
      neuesDokument({ onboardingId: ID, filePath: `uploads/${ID}/a.pdf` }),
      // Derselbe Pfad an einem anderen Vorgang zaehlt nicht (Bindung an den Vorgang).
      neuesDokument({ onboardingId: ANDERER, filePath: `uploads/${ID}/b.pdf` }),
    );
    const verwendet = await onboardingBaustein.zielPfadeVerwendet(ID, [
      `uploads/${ID}/a.pdf`,
      `uploads/${ID}/b.pdf`,
      `uploads/${ID}/c.pdf`,
    ]);
    expect([...verwendet]).toEqual([`uploads/${ID}/a.pdf`]);

    udb.aufrufe = [];
    expect([...(await onboardingBaustein.zielPfadeVerwendet(ID, []))]).toEqual([]);
    expect(udb.aufrufe).toEqual([]);
  });
});
