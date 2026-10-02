/**
 * Prozess-Adapter Vertragsende (UX-Umbau, Pilot): Schritte, „Jetzt dran",
 * Menue, Statuspille — und die Gegenprobe gegen das, was die Routen annehmen.
 */

import { CONTRACT_END_STATUS_LABELS } from "@/lib/constants";
import { CONTRACT_END_UEBERGAENGE } from "@/lib/contract-end-status";
import { schrittKurzform } from "@/lib/prozess/prozess-stand";
import {
  MAV_PILLE,
  VERTRAGSENDE_PILLE,
  tageBisVertragsende,
  vertragsendeMenue,
  vertragsendePille,
  vertragsendeProzessStand,
  type VertragsendeAktion,
  type VertragsendeStand,
} from "@/lib/prozess/vertragsende";

const JETZT = new Date("2026-06-01T10:00:00Z");
const tag = (versatz: number) => new Date(Date.UTC(2026, 5, 1 + versatz)).toISOString();

function stand(teil: Partial<VertragsendeStand> = {}): VertragsendeStand {
  return {
    status: "ANGELEGT",
    decision: "OFFEN",
    contractEndDate: tag(300),
    createdAt: tag(-20),
    supervisorEmail: null,
    supervisorLinkSentAt: null,
    supervisorTokenExpiresAt: null,
    supervisorRespondedAt: null,
    lastSupervisorReminderAt: null,
    supervisorReminderCount: 0,
    contractSignedReturnedAt: null,
    mavStatus: null,
    completedAt: null,
    offboarding: null,
    ...teil,
  };
}

const angefragt = (teil: Partial<VertragsendeStand> = {}) =>
  stand({
    status: "ANFRAGE_VORGESETZTER",
    supervisorEmail: "leitung@beispiel.invalid",
    supervisorLinkSentAt: tag(-10),
    supervisorTokenExpiresAt: tag(20),
    ...teil,
  });
const uebernahme = (teil: Partial<VertragsendeStand> = {}) =>
  angefragt({ status: "RUECKMELDUNG_UEBERNAHME", decision: "UEBERNAHME", supervisorRespondedAt: tag(-3), ...teil });
const abgelehnt = (teil: Partial<VertragsendeStand> = {}) =>
  angefragt({
    status: "RUECKMELDUNG_KEINE_UEBERNAHME",
    decision: "KEINE_UEBERNAHME",
    supervisorRespondedAt: tag(-3),
    ...teil,
  });
const OFFBOARDING = { id: "off-1", displayId: "OFF-2026-GYM-003" };

const zustaende = (s: VertragsendeStand) =>
  Object.fromEntries(vertragsendeProzessStand(s, JETZT).schritte.map((x) => [x.key, x.status]));
const schritt = (s: VertragsendeStand, key: string) =>
  vertragsendeProzessStand(s, JETZT).schritte.find((x) => x.key === key)!;

const ALLE_STATUS = Object.keys(CONTRACT_END_UEBERGAENGE);

describe("Kataloge", () => {
  it("kennen jeden Status des Moduls", () => {
    expect(ALLE_STATUS.sort()).toEqual(Object.keys(CONTRACT_END_STATUS_LABELS).sort());
    expect(Object.keys(VERTRAGSENDE_PILLE).sort()).toEqual(ALLE_STATUS.sort());
    for (const eintrag of [...Object.values(VERTRAGSENDE_PILLE), ...Object.values(MAV_PILLE)]) {
      expect(eintrag.text.trim()).not.toBe("");
    }
  });

  it("unbekannter Status: Rohwert in der Pille, keine Handlung", () => {
    const s = stand({ status: "NEU_ERFUNDEN" });
    expect(vertragsendePille(s, JETZT)).toEqual({ text: "NEU_ERFUNDEN", ton: "neutral" });
    expect(vertragsendeProzessStand(s, JETZT).jetztDran).toBeNull();
    expect(vertragsendeMenue(s, JETZT)).toEqual([]);
  });
});

describe("Schritte", () => {
  it("immer dieselben fünf, höchstens einer aktiv", () => {
    for (const status of ALLE_STATUS) {
      const p = vertragsendeProzessStand(stand({ status }), JETZT);
      expect(p.schritte.map((x) => x.key)).toEqual(["angelegt", "anfrage", "rueckmeldung", "vollzug", "abschluss"]);
      expect(p.schritte.filter((x) => x.status === "aktiv").length).toBeLessThanOrEqual(1);
      expect(p.schritte[0].status).toBe("erledigt");
    }
  });

  it("ANGELEGT: Anfrage aktiv, Schritt 4 nennt beide Wege", () => {
    expect(zustaende(stand())).toEqual({
      angelegt: "erledigt",
      anfrage: "aktiv",
      rueckmeldung: "kommend",
      vollzug: "kommend",
      abschluss: "kommend",
    });
    expect(schritt(stand(), "vollzug").titel).toBe("Vertrag oder Offboarding");
    expect(schritt(stand(), "vollzug").reiter).toBeUndefined();
  });

  it("ANFRAGE_VORGESETZTER: Rückmeldung aktiv, bei der Führungskraft", () => {
    expect(zustaende(angefragt())).toMatchObject({ anfrage: "erledigt", rueckmeldung: "aktiv" });
    expect(schritt(angefragt(), "rueckmeldung").zustaendig).toBe("Führungskraft");
    expect(schritt(angefragt(), "anfrage").datum).toBe(tag(-10));
  });

  it("Übernahme: gewählter Weg in der Linie, der andere als Hinweis", () => {
    const s = uebernahme();
    expect(zustaende(s)).toMatchObject({ rueckmeldung: "erledigt", vollzug: "aktiv", abschluss: "kommend" });
    expect(schritt(s, "rueckmeldung")).toMatchObject({ notiz: "Übernahme", sonst: "sonst: Offboarding" });
    expect(schritt(s, "vollzug")).toMatchObject({ titel: "Vertrag", reiter: "dokumente" });
  });

  it("VERTRAG_ERSTELLT zählt wie RUECKMELDUNG_UEBERNAHME (kein Code setzt den Status)", () => {
    const a = vertragsendeProzessStand(uebernahme(), JETZT);
    const b = vertragsendeProzessStand(uebernahme({ status: "VERTRAG_ERSTELLT" }), JETZT);
    expect(b).toEqual(a);
  });

  it("VERTRAG_UNTERSCHRIEBEN: Vertrag erledigt mit Datum, Abschluss aktiv", () => {
    const s = uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-1) });
    expect(zustaende(s)).toMatchObject({ vollzug: "erledigt", abschluss: "aktiv" });
    expect(schritt(s, "vollzug").datum).toBe(tag(-1));
  });

  it("Ablehnung: Offboarding als Schritt 4, Vertrag als Hinweis", () => {
    const s = abgelehnt();
    expect(zustaende(s)).toMatchObject({ rueckmeldung: "erledigt", vollzug: "aktiv" });
    expect(schritt(s, "rueckmeldung")).toMatchObject({ notiz: "abgelehnt", sonst: "sonst: Vertrag" });
    expect(schritt(s, "vollzug").titel).toBe("Offboarding");
  });

  it("Offboarding ohne Anfrage: Anfrage und Rückmeldung übersprungen, nicht erledigt", () => {
    const s = stand({ status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", decision: "KEINE_UEBERNAHME", offboarding: OFFBOARDING });
    expect(zustaende(s)).toEqual({
      angelegt: "erledigt",
      anfrage: "uebersprungen",
      rueckmeldung: "uebersprungen",
      vollzug: "erledigt",
      abschluss: "aktiv",
    });
    expect(schritt(s, "vollzug").notiz).toBe("OFF-2026-GYM-003");
    expect(schritt(s, "rueckmeldung").notiz).toBeUndefined();
  });

  it("Offboarding ohne Rückmeldung: nur die Rückmeldung übersprungen", () => {
    const s = angefragt({
      status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
      decision: "KEINE_UEBERNAHME",
      offboarding: OFFBOARDING,
    });
    expect(zustaende(s)).toMatchObject({ anfrage: "erledigt", rueckmeldung: "uebersprungen", vollzug: "erledigt" });
  });

  it("ABGESCHLOSSEN: Ende, Schritte ohne Beleg übersprungen", () => {
    const voll = uebernahme({ status: "ABGESCHLOSSEN", contractSignedReturnedAt: tag(-2), completedAt: tag(-1) });
    const p = vertragsendeProzessStand(voll, JETZT);
    expect(p.ende).toBe("abgeschlossen");
    expect(p.jetztDran).toBeNull();
    expect(p.schritte.every((x) => x.status === "erledigt")).toBe(true);
    expect(schritt(voll, "abschluss").datum).toBe(tag(-1));

    // Korrektur-Abschluss durch die HR-Leitung direkt aus ANGELEGT
    expect(zustaende(stand({ status: "ABGESCHLOSSEN" }))).toEqual({
      angelegt: "erledigt",
      anfrage: "uebersprungen",
      rueckmeldung: "uebersprungen",
      vollzug: "uebersprungen",
      abschluss: "erledigt",
    });
  });

  it("STORNIERT: abgebrochen; Erreichtes erledigt, der Rest kommend", () => {
    const p = vertragsendeProzessStand(angefragt({ status: "STORNIERT" }), JETZT);
    expect(p.ende).toBe("abgebrochen");
    expect(p.jetztDran).toBeNull();
    expect(Object.fromEntries(p.schritte.map((x) => [x.key, x.status]))).toEqual({
      angelegt: "erledigt",
      anfrage: "erledigt",
      rueckmeldung: "kommend",
      vollzug: "kommend",
      abschluss: "kommend",
    });
    expect(p.schritte.find((x) => x.key === "abschluss")!.notiz).toBeUndefined();
  });

  it("Altstatus ENTSCHEIDUNG_UEBERNAHME: mit zugestellter Anfrage wartet er auf die Rückmeldung, sonst auf die Anfrage", () => {
    expect(zustaende(angefragt({ status: "ENTSCHEIDUNG_UEBERNAHME", decision: "UEBERNAHME" }))).toMatchObject({
      rueckmeldung: "aktiv",
    });
    expect(zustaende(stand({ status: "ENTSCHEIDUNG_UEBERNAHME", decision: "UEBERNAHME" }))).toMatchObject({
      anfrage: "aktiv",
    });
  });

  it("ANFRAGE_VORGESETZTER ohne zugestellte Anfrage (Status von Hand gesetzt): Anfrage ist dran, nicht „Erinnern“", () => {
    const s = stand({ status: "ANFRAGE_VORGESETZTER" });
    expect(zustaende(s)).toMatchObject({ anfrage: "aktiv", rueckmeldung: "kommend" });
    expect(vertragsendeProzessStand(s, JETZT).jetztDran).toMatchObject({ bei: "HR", aktion: "anfrage-senden" });
  });

  it("Link ohne Ablaufdatum gilt als abgelaufen (wie in der Route)", () => {
    const s = angefragt({ supervisorTokenExpiresAt: null });
    expect(vertragsendeProzessStand(s, JETZT).jetztDran).toMatchObject({ aktion: "anfrage-neu-senden" });
  });

  it("„MAV offen“ steht am Abschluss, sobald entschieden ist — und nur solange der Stand fehlt", () => {
    expect(schritt(stand(), "abschluss").notiz).toBeUndefined();
    expect(schritt(uebernahme(), "abschluss").notiz).toBe("MAV offen");
    expect(schritt(uebernahme({ mavStatus: "AUSSTEHEND" }), "abschluss").notiz).toBe("MAV offen");
    expect(schritt(uebernahme({ mavStatus: "ZUGESTIMMT" }), "abschluss").notiz).toBeUndefined();
  });

  it("Kurzform für schmale Bildschirme", () => {
    expect(schrittKurzform(vertragsendeProzessStand(uebernahme(), JETZT))).toBe("Schritt 4 von 5 · Vertrag");
    expect(schrittKurzform(vertragsendeProzessStand(stand({ status: "ABGESCHLOSSEN" }), JETZT))).toBe("Abgeschlossen");
    expect(schrittKurzform(vertragsendeProzessStand(stand({ status: "STORNIERT" }), JETZT))).toBe("Abgebrochen");
  });
});

describe("Jetzt dran", () => {
  const dran = (s: VertragsendeStand) => vertragsendeProzessStand(s, JETZT).jetztDran!;

  it("je Status die eine Handlung", () => {
    expect(dran(stand())).toMatchObject({ bei: "HR", aktion: "anfrage-senden" });
    expect(dran(angefragt())).toMatchObject({ bei: "FUEHRUNGSKRAFT", aktion: "erinnern" });
    expect(dran(uebernahme())).toMatchObject({ bei: "HR", aktion: "vertrag-erfassen", nebenAktion: "dokumente" });
    expect(dran(uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-1) }))).toMatchObject({
      aktion: "abschliessen",
    });
    expect(dran(abgelehnt())).toMatchObject({ bei: "HR", aktion: "offboarding-anlegen" });
    expect(
      dran(stand({ status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", decision: "KEINE_UEBERNAHME", offboarding: OFFBOARDING })),
    ).toMatchObject({ aktion: "zum-offboarding", nebenAktion: "dokumente" });
  });

  it("keine Übernahme ohne verknüpftes Offboarding: kein Verweis ins Leere", () => {
    const d = dran(stand({ status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", decision: "KEINE_UEBERNAHME" }));
    expect(d.aktion).toBe("dokumente");
    expect(d.nebenAktion).toBeUndefined();
  });

  it("wartend: nennt Anfrage, Adresse und Erinnerungen", () => {
    expect(dran(angefragt()).unterzeile).toBe(
      "Anfrage vom 22.05.2026 an leitung@beispiel.invalid · noch nicht erinnert",
    );
    expect(dran(angefragt({ supervisorReminderCount: 2, lastSupervisorReminderAt: tag(-1) })).unterzeile).toBe(
      "Anfrage vom 22.05.2026 an leitung@beispiel.invalid · 2× erinnert, zuletzt 31.05.2026",
    );
  });

  it("abgelaufener Link: statt „Erinnern“ (die Route lehnt ab) „Anfrage neu senden“, bei HR", () => {
    const s = angefragt({ supervisorTokenExpiresAt: tag(-1) });
    expect(dran(s)).toMatchObject({ bei: "HR", aktion: "anfrage-neu-senden" });
    expect(vertragsendeMenue(s, JETZT)).not.toContain("anfrage-neu-senden");
  });

  it("Abschluss nach Übernahme nennt einen offenen MAV-Stand, sperrt aber nicht", () => {
    const s = uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-1) });
    expect(dran(s).unterzeile).toBe("Mitarbeitervertretung: Stand noch offen");
    expect(dran({ ...s, mavStatus: "ANGEHOERT" }).unterzeile).toBeUndefined();
    expect(dran(s).aktion).toBe("abschliessen");
  });
});

describe("Frist", () => {
  const dran = (s: VertragsendeStand) => vertragsendeProzessStand(s, JETZT).jetztDran!;

  it("zählt Berliner Kalendertage: am Tag des Vertragsendes „heute“, überschritten erst danach", () => {
    expect(tageBisVertragsende(tag(0), JETZT)).toBe(0);
    expect(tageBisVertragsende(tag(-1), JETZT)).toBe(-1);
    expect(tageBisVertragsende(tag(1), new Date("2026-06-01T21:59:00Z"))).toBe(1);
    // 22:00 UTC ist in Berlin (Sommerzeit) schon der 2. Juni
    expect(tageBisVertragsende(tag(1), new Date("2026-06-01T22:00:00Z"))).toBe(0);
    expect(tageBisVertragsende("kein Datum", JETZT)).toBeNull();
    expect(dran(stand({ contractEndDate: tag(0) })).frist).toBe("Vertragsende 01.06.2026 · heute");
    expect(dran(stand({ contractEndDate: tag(1) })).frist).toBe("Vertragsende 02.06.2026 · morgen");
  });

  it("Ampel: kritisch, Warnung, sonst ohne Hervorhebung", () => {
    expect(dran(stand({ contractEndDate: tag(40) }))).toMatchObject({ dringlichkeit: "critical" });
    expect(dran(stand({ contractEndDate: tag(120) }))).toMatchObject({ dringlichkeit: "wait" });
    const fern = dran(stand({ contractEndDate: tag(300) }));
    expect(fern.frist).toBe("Vertragsende 28.03.2027 · in 300 Tagen");
    expect(fern.dringlichkeit).toBeUndefined();
  });

  it("überschrittenes Vertragsende bei offenem Vorgang ist kritisch (die Ampel allein zeigte nichts)", () => {
    for (const s of [stand(), angefragt(), abgelehnt()]) {
      const d = dran({ ...s, contractEndDate: tag(-3) });
      expect(d.frist).toBe("Vertragsende 29.05.2026 · seit 3 Tagen überschritten");
      expect(d.dringlichkeit).toBe("critical");
    }
    expect(dran(stand({ contractEndDate: tag(-1) })).frist).toContain("seit 1 Tag überschritten");
  });

  it("nach dem Vollzug ist das Vertragsende keine Frist mehr", () => {
    const fertig = [
      uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-9), contractEndDate: tag(-3) }),
      stand({
        status: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
        decision: "KEINE_UEBERNAHME",
        offboarding: OFFBOARDING,
        contractEndDate: tag(-3),
      }),
    ];
    for (const s of fertig) {
      expect(dran(s).frist).toBeUndefined();
      expect(dran(s).dringlichkeit).toBeUndefined();
    }
  });

  it("Entfristungsrisiko: ab 30 Tagen vor dem Vertragsende, in Frist und Pille", () => {
    const frueh = uebernahme({ contractEndDate: tag(45) });
    expect(dran(frueh).frist).toBe("Vertragsende 16.07.2026 · in 45 Tagen");
    expect(vertragsendePille(frueh, JETZT)).toEqual({ text: "Übernahme · Vertrag offen", ton: "info" });

    const knapp = uebernahme({ contractEndDate: tag(10) });
    expect(dran(knapp)).toMatchObject({
      frist: "Vertragsende 11.06.2026 · in 10 Tagen · Entfristungsrisiko (§ 15 Abs. 5 TzBfG)",
      dringlichkeit: "critical",
    });
    expect(vertragsendePille(knapp, JETZT)).toEqual({ text: "Entfristungsrisiko · in 10 Tagen", ton: "critical" });

    const drueber = uebernahme({ contractEndDate: tag(-2) });
    expect(vertragsendePille(drueber, JETZT).text).toBe("Entfristungsrisiko · seit 2 Tagen überschritten");

    // Unterschrieben: keine Warnung mehr
    const unterschrieben = uebernahme({
      status: "VERTRAG_UNTERSCHRIEBEN",
      contractSignedReturnedAt: tag(-1),
      contractEndDate: tag(10),
    });
    expect(vertragsendePille(unterschrieben, JETZT)).toEqual({ text: "Vertrag unterschrieben", ton: "ok" });
  });
});

describe("Menü", () => {
  it("je Status; „Stornieren“ immer zuletzt, nach dem Ende nichts", () => {
    expect(vertragsendeMenue(stand(), JETZT)).toEqual(["offboarding-anlegen", "stornieren"]);
    expect(vertragsendeMenue(angefragt(), JETZT)).toEqual(["anfrage-neu-senden", "offboarding-anlegen", "stornieren"]);
    expect(vertragsendeMenue(uebernahme(), JETZT)).toEqual(["abschliessen", "stornieren"]);
    expect(vertragsendeMenue(abgelehnt(), JETZT)).toEqual(["stornieren"]);
    expect(
      vertragsendeMenue(stand({ status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", decision: "KEINE_UEBERNAHME" }), JETZT),
    ).toEqual(["abschliessen", "stornieren"]);
    expect(vertragsendeMenue(stand({ status: "ABGESCHLOSSEN" }), JETZT)).toEqual([]);
    expect(vertragsendeMenue(stand({ status: "STORNIERT" }), JETZT)).toEqual([]);
  });

  it("keine Handlung steht zugleich in „Jetzt dran“ und im Menü", () => {
    for (const status of ALLE_STATUS) {
      for (const s of [stand({ status }), angefragt({ status }), angefragt({ status, supervisorTokenExpiresAt: tag(-1) })]) {
        const d = vertragsendeProzessStand(s, JETZT).jetztDran;
        const menue = vertragsendeMenue(s, JETZT);
        if (d?.aktion) expect(menue).not.toContain(d.aktion);
        if (d?.nebenAktion) expect(menue).not.toContain(d.nebenAktion);
        expect(new Set(menue).size).toBe(menue.length);
      }
    }
  });
});

/**
 * Gegenprobe: Die Seite bietet nur an, was die Route auch annimmt.
 *
 * PATCH-Uebergaenge kommen aus derselben Tabelle wie in der Route
 * (`CONTRACT_END_UEBERGAENGE`). Die Listen der drei eigenen Routen sind hier
 * GESPIEGELT — wer sie dort aendert, aendert sie hier:
 *   - /nicht-uebernehmen: `status: { in: [...] }` im bedingten updateMany
 *   - /supervisor-link:   die Liste der gesperrten Status (400)
 *   - /reminder:          offene Anfrage, sonst 409
 */
describe("Gegenprobe gegen die Routen", () => {
  const NICHT_UEBERNEHMEN_AUS = [
    "ANGELEGT",
    "ANFRAGE_VORGESETZTER",
    "ENTSCHEIDUNG_UEBERNAHME",
    "RUECKMELDUNG_KEINE_UEBERNAHME",
  ];
  const ANFRAGE_GESPERRT_IN = [
    "ENTSCHEIDUNG_KEINE_UEBERNAHME",
    "VERTRAG_ERSTELLT",
    "VERTRAG_UNTERSCHRIEBEN",
    "ABGESCHLOSSEN",
    "STORNIERT",
  ];
  const ERINNERN_IN = ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"];

  function erlaubt(aktion: VertragsendeAktion, s: VertragsendeStand): boolean {
    const nach = (ziel: string) => (CONTRACT_END_UEBERGAENGE[s.status] ?? []).includes(ziel);
    switch (aktion) {
      case "abschliessen":
        return nach("ABGESCHLOSSEN");
      case "stornieren":
        return nach("STORNIERT");
      case "vertrag-erfassen":
        return nach("VERTRAG_UNTERSCHRIEBEN");
      case "offboarding-anlegen":
        return NICHT_UEBERNEHMEN_AUS.includes(s.status) && !s.offboarding;
      case "anfrage-senden":
      case "anfrage-neu-senden":
        return !ANFRAGE_GESPERRT_IN.includes(s.status);
      case "erinnern":
        return (
          ERINNERN_IN.includes(s.status) &&
          Boolean(s.supervisorEmail && s.supervisorLinkSentAt) &&
          Boolean(s.supervisorTokenExpiresAt && new Date(s.supervisorTokenExpiresAt) >= JETZT)
        );
      case "zum-offboarding":
        return Boolean(s.offboarding);
      case "dokumente":
        return true;
    }
  }

  it("jede angebotene Handlung nimmt die zuständige Route an", () => {
    for (const status of ALLE_STATUS) {
      const faelle = [
        stand({ status }),
        angefragt({ status }),
        angefragt({ status, supervisorTokenExpiresAt: tag(-1) }),
        angefragt({ status, offboarding: status === "ENTSCHEIDUNG_KEINE_UEBERNAHME" ? OFFBOARDING : null }),
      ];
      for (const s of faelle) {
        const d = vertragsendeProzessStand(s, JETZT).jetztDran;
        const angeboten = [d?.aktion, d?.nebenAktion, ...vertragsendeMenue(s, JETZT)].filter(
          (a): a is VertragsendeAktion => Boolean(a),
        );
        for (const aktion of angeboten) {
          expect({ status, aktion, erlaubt: erlaubt(aktion, s) }).toEqual({ status, aktion, erlaubt: true });
        }
      }
    }
  });
});
