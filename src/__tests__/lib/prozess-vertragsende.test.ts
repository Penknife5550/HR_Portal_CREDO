/**
 * Prozess-Adapter Vertragsende (UX-Umbau, Pilot): Schritte, „Jetzt dran",
 * Menue, Statuspille — und die Gegenprobe gegen das, was die Routen annehmen.
 */

import { CONTRACT_END_STATUS_LABELS } from "@/lib/constants";
import {
  CONTRACT_END_ANFRAGE_GESPERRT,
  CONTRACT_END_ANFRAGE_OFFEN,
  CONTRACT_END_OFFBOARDING_AUS,
  CONTRACT_END_UEBERGAENGE,
} from "@/lib/contract-end-status";
import { schrittKurzform, type ProzessStand } from "@/lib/prozess/prozess-stand";
import {
  ANFRAGE_NICHT_ZUGESTELLT_ZEILE,
  MAV_PILLE,
  MAV_PILLE_OFFEN,
  VERTRAGSENDE_PILLE,
  VERTRAGSENDE_PILLE_LINK_ABGELAUFEN,
  VERTRAGSENDE_PILLE_NICHT_ZUGESTELLT,
  anfrageNichtZugestellt,
  fuehrungskraftKannAntworten,
  mavOffen,
  tageBisVertragsende,
  vertragsendeMenue,
  vertragsendePille,
  vertragsendeProzessStand,
  type PillenAngabe,
  type VertragsendeAktion,
  type VertragsendeStand,
} from "@/lib/prozess/vertragsende";

const JETZT = new Date("2026-06-01T10:00:00Z");
const tag = (versatz: number) => new Date(Date.UTC(2026, 5, 1 + versatz)).toISOString();
const ADRESSE = "leitung@beispiel.invalid";

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
    supervisorEmail: ADRESSE,
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
const keineUebernahme = (teil: Partial<VertragsendeStand> = {}) =>
  stand({ status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", decision: "KEINE_UEBERNAHME", ...teil });
const OFFBOARDING = { id: "off-1", displayId: "OFF-2026-GYM-003" };

const prozess = (s: VertragsendeStand) => vertragsendeProzessStand(s, JETZT);
const zustaende = (s: VertragsendeStand) => Object.fromEntries(prozess(s).schritte.map((x) => [x.key, x.status]));
const schritt = (s: VertragsendeStand, key: string) => prozess(s).schritte.find((x) => x.key === key)!;
const dran = (s: VertragsendeStand) => prozess(s).jetztDran!;

const ALLE_STATUS = Object.keys(CONTRACT_END_UEBERGAENGE);

/**
 * Alle Kombinationen, die in der Datenbank stehen koennen — auch solche, die
 * keine Route erzeugt, sondern nur ein Handeingriff (Offboarding an einem
 * Vorgang im Status ANGELEGT, Entscheidung passt nicht zum Status …). Die
 * Seite darf auch dort nichts anbieten, was die Route ablehnt.
 *
 * Voll gekreuzt ist, woran die Routen ihre Entscheidung haengen: Status, Stand
 * der Anfrage, Offboarding. Was sonst in die Aussagen einfliesst (Entscheidung,
 * Unterschrift, Naehe des Vertragsendes), kommt als vier Nebenlagen dazu.
 */
const ANFRAGEN: Partial<VertragsendeStand>[] = [
  {}, // nie angefragt
  // Adresse eingetragen, nie ein Link erzeugt (Hand-PATCH) — kein Versandversuch
  { supervisorEmail: ADRESSE },
  // Anfrage gescheitert (`/supervisor-link`, Mail nicht hinaus): neuer Link
  // gespeichert, aber nie zugestellt; Versandzeitpunkt zurueck auf null
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: null, supervisorTokenExpiresAt: tag(30) },
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: tag(-10), supervisorTokenExpiresAt: tag(20) }, // Link gilt
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: tag(-40), supervisorTokenExpiresAt: tag(-1) }, // abgelaufen
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: tag(-10), supervisorTokenExpiresAt: null }, // ohne Ablaufdatum
];
const NEBENLAGEN: Partial<VertragsendeStand>[] = [
  { decision: "OFFEN", contractSignedReturnedAt: null, contractEndDate: tag(300) }, // nichts entschieden, Ende fern
  { decision: "UEBERNAHME", contractSignedReturnedAt: null, contractEndDate: tag(10) }, // Fenster der Entfristungswarnung
  { decision: "UEBERNAHME", contractSignedReturnedAt: tag(-1), contractEndDate: tag(-3) }, // unterschrieben, Ende vorbei
  { decision: "KEINE_UEBERNAHME", contractSignedReturnedAt: null, contractEndDate: tag(-3) }, // abgelehnt, Ende vorbei
];
const LAGEN: VertragsendeStand[] = ALLE_STATUS.flatMap((status) =>
  ANFRAGEN.flatMap((anfrage) =>
    [null, OFFBOARDING].flatMap((offboarding) =>
      NEBENLAGEN.map((neben) => stand({ status, offboarding, ...anfrage, ...neben })),
    ),
  ),
);

/** Die Lage in einer Zeile — damit eine gescheiterte Erwartung sagt, WO sie scheitert. */
const kurz = (s: VertragsendeStand) =>
  `${s.status} / ${s.decision} / Adresse ${s.supervisorEmail ? "ja" : "nein"}, Anfrage ${s.supervisorLinkSentAt ? "verschickt" : "nie"}, Link bis ${
    s.supervisorTokenExpiresAt ?? "—"
  } / Offboarding ${s.offboarding ? "ja" : "nein"} / unterschrieben ${s.contractSignedReturnedAt ? "ja" : "nein"} / Ende ${s.contractEndDate}`;

/**
 * Je Lage EINMAL gerechnet und von allen Tests gelesen: So pruefen alle Tests
 * genau dieselben Staende, und eine neue Lage steht an einer Stelle.
 */
interface Probe {
  s: VertragsendeStand;
  lage: string;
  p: ProzessStand<VertragsendeAktion>;
  menue: VertragsendeAktion[];
  pille: PillenAngabe;
  /** „Jetzt dran" (Haupt- und Nebenhandlung) samt Menue. */
  angeboten: VertragsendeAktion[];
}
let PROBEN: Probe[] = [];
beforeAll(() => {
  PROBEN = LAGEN.map((s) => {
    const p = prozess(s);
    const menue = vertragsendeMenue(s, JETZT);
    const angeboten = [p.jetztDran?.aktion, p.jetztDran?.nebenAktion, ...menue].filter(
      (a): a is VertragsendeAktion => Boolean(a),
    );
    return { s, lage: kurz(s), p, menue, pille: vertragsendePille(s, JETZT), angeboten };
  });
}, 120_000);

describe("Kataloge", () => {
  it("kennen jeden Status des Moduls", () => {
    expect([...ALLE_STATUS].sort()).toEqual(Object.keys(CONTRACT_END_STATUS_LABELS).sort());
    expect(Object.keys(VERTRAGSENDE_PILLE).sort()).toEqual([...ALLE_STATUS].sort());
    const alle = [
      ...Object.values(VERTRAGSENDE_PILLE),
      ...Object.values(MAV_PILLE),
      VERTRAGSENDE_PILLE_LINK_ABGELAUFEN,
      VERTRAGSENDE_PILLE_NICHT_ZUGESTELLT,
      ANFRAGE_NICHT_ZUGESTELLT_ZEILE,
      MAV_PILLE_OFFEN,
    ];
    for (const eintrag of alle) {
      expect(eintrag.text.trim()).not.toBe("");
    }
  });

  it("MAV offen: ohne Stand und „Ausstehend“ — die vier gesetzten Stände nicht", () => {
    expect(mavOffen({ mavStatus: null })).toBe(true);
    expect(mavOffen({ mavStatus: "" })).toBe(true);
    expect(mavOffen({ mavStatus: "AUSSTEHEND" })).toBe(true);
    const gesetzt = Object.keys(MAV_PILLE).filter((s) => s !== "AUSSTEHEND");
    expect(gesetzt.sort()).toEqual(["ANGEHOERT", "NICHT_ERFORDERLICH", "WIDERSPRUCH", "ZUGESTIMMT"]);
    for (const mavStatus of gesetzt) expect({ mavStatus, offen: mavOffen({ mavStatus }) }).toEqual({ mavStatus, offen: false });
  });

  it("MAV offen: Leiste und „Jetzt dran“ folgen mavOffen; die Pille „Offen“ wartet wie „Ausstehend“", () => {
    // Die Pille „Offen“ wartet auf jemand anderen, wie „Ausstehend“.
    expect(MAV_PILLE_OFFEN).toEqual({ text: "Offen", ton: "wait" });
    expect(MAV_PILLE_OFFEN.ton).toBe(MAV_PILLE.AUSSTEHEND.ton);
    for (const mavStatus of [null, "AUSSTEHEND", "ZUGESTIMMT", "NICHT_ERFORDERLICH"]) {
      const s = uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-1), mavStatus });
      const notiz = schritt(s, "abschluss").notiz === "MAV offen";
      const unterzeile = dran(s).unterzeile === "Mitarbeitervertretung: Stand noch offen";
      expect({ mavStatus, notiz, unterzeile }).toEqual({ mavStatus, notiz: mavOffen(s), unterzeile: mavOffen(s) });
    }
  });

  it("unbekannter Status: Rohwert in der Pille, keine Handlung", () => {
    const s = stand({ status: "NEU_ERFUNDEN" });
    expect(vertragsendePille(s, JETZT)).toEqual({ text: "NEU_ERFUNDEN", ton: "neutral" });
    expect(prozess(s).jetztDran).toBeNull();
    expect(vertragsendeMenue(s, JETZT)).toEqual([]);
  });
});

describe("Schritte", () => {
  it("immer dieselben fünf, höchstens einer aktiv", () => {
    for (const { p } of PROBEN) {
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
    expect(schritt(stand(), "anfrage").notiz).toBeUndefined();
  });

  it("ANFRAGE_VORGESETZTER: Rückmeldung aktiv, bei der Führungskraft", () => {
    expect(zustaende(angefragt())).toMatchObject({ anfrage: "erledigt", rueckmeldung: "aktiv" });
    expect(schritt(angefragt(), "rueckmeldung").zustaendig).toBe("Führungskraft");
    expect(schritt(angefragt(), "anfrage").datum).toBe(tag(-10));
  });

  it("abgelaufener Link: Die Anfrage ist wieder dran — die Führungskraft kann nicht mehr antworten", () => {
    for (const ablauf of [tag(-1), null]) {
      const s = angefragt({ supervisorTokenExpiresAt: ablauf });
      expect(zustaende(s)).toMatchObject({ anfrage: "aktiv", rueckmeldung: "kommend" });
      expect(schritt(s, "anfrage")).toMatchObject({ zustaendig: "HR", notiz: "Link abgelaufen" });
      expect(schrittKurzform(prozess(s))).toBe("Schritt 2 von 5 · Anfrage");
    }
  });

  it("Übernahme: gewählter Weg in der Linie, der andere als Hinweis", () => {
    const s = uebernahme();
    expect(zustaende(s)).toMatchObject({ rueckmeldung: "erledigt", vollzug: "aktiv", abschluss: "kommend" });
    expect(schritt(s, "rueckmeldung")).toMatchObject({ notiz: "Übernahme", sonst: "sonst: Offboarding" });
    expect(schritt(s, "vollzug").titel).toBe("Vertrag");
  });

  it("VERTRAG_ERSTELLT zählt wie RUECKMELDUNG_UEBERNAHME (kein Code setzt den Status)", () => {
    expect(prozess(uebernahme({ status: "VERTRAG_ERSTELLT" }))).toEqual(prozess(uebernahme()));
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

  it("nur der Schritt „Vertrag“ führt in den Reiter Dokumente — das Offboarding ist ein eigener Vorgang", () => {
    expect(schritt(uebernahme(), "vollzug").reiter).toBe("dokumente");
    expect(schritt(stand(), "vollzug").reiter).toBeUndefined();
    expect(schritt(abgelehnt(), "vollzug").reiter).toBeUndefined();
    expect(schritt(keineUebernahme({ offboarding: OFFBOARDING }), "vollzug").reiter).toBeUndefined();
    for (const { p } of PROBEN) {
      for (const x of p.schritte) {
        if (x.reiter) expect({ key: x.key, titel: x.titel }).toEqual({ key: "vollzug", titel: "Vertrag" });
      }
    }
  });

  it("Offboarding ohne Anfrage: Anfrage und Rückmeldung übersprungen, nicht erledigt", () => {
    const s = keineUebernahme({ offboarding: OFFBOARDING });
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
    const p = prozess(voll);
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
    const p = prozess(angefragt({ status: "STORNIERT" }));
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

  it("ANFRAGE_VORGESETZTER ohne Adresse (Status von Hand gesetzt): Anfrage ist dran wie bei ANGELEGT, nicht „Erinnern“", () => {
    for (const status of ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"]) {
      const s = stand({ status });
      expect(zustaende(s)).toMatchObject({ anfrage: "aktiv", rueckmeldung: "kommend" });
      expect(schritt(s, "anfrage").notiz).toBeUndefined();
      expect(dran(s)).toEqual(dran(stand()));
      expect(anfrageNichtZugestellt(s, JETZT)).toBe(false);
    }
  });

  it("ANFRAGE_VORGESETZTER mit Adresse, aber ohne je erzeugten Link (Hand-PATCH): „Anfrage senden“, NICHT „nicht zugestellt“", () => {
    // Ein Versand wurde nie versucht — „Die E-Mail ging nicht hinaus" waere falsch.
    for (const status of ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"]) {
      const s = stand({ status, supervisorEmail: ADRESSE, supervisorTokenExpiresAt: null });
      expect(zustaende(s)).toMatchObject({ anfrage: "aktiv", rueckmeldung: "kommend" });
      expect(schritt(s, "anfrage").notiz).toBeUndefined();
      expect(dran(s)).toMatchObject({ satz: "Anfrage an die Führungskraft senden", bei: "HR", aktion: "anfrage-senden" });
      expect(vertragsendePille(s, JETZT)).toEqual({ text: "Anfrage offen", ton: "info" });
      expect(anfrageNichtZugestellt(s, JETZT)).toBe(false);
    }
  });

  it("ANFRAGE_VORGESETZTER mit Adresse und erzeugtem Link, ohne Versandzeitpunkt: Anfrage aktiv mit Notiz „nicht zugestellt“", () => {
    for (const status of ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"]) {
      // Auch ein inzwischen abgelaufener Link: Die Mail dazu ging nie hinaus.
      for (const ablauf of [tag(30), tag(-1)]) {
        const s = stand({ status, supervisorEmail: ADRESSE, supervisorTokenExpiresAt: ablauf });
        expect(zustaende(s)).toMatchObject({ anfrage: "aktiv", rueckmeldung: "kommend" });
        expect(schritt(s, "anfrage")).toMatchObject({ zustaendig: "HR", notiz: "nicht zugestellt" });
        expect(schritt(s, "anfrage").datum).toBeUndefined();
        expect(schrittKurzform(prozess(s))).toBe("Schritt 2 von 5 · Anfrage");
      }
    }
  });

  it("„MAV offen“ steht am Abschluss, sobald entschieden ist — und nur solange der Stand fehlt", () => {
    expect(schritt(stand(), "abschluss").notiz).toBeUndefined();
    expect(schritt(uebernahme(), "abschluss").notiz).toBe("MAV offen");
    expect(schritt(uebernahme({ mavStatus: "AUSSTEHEND" }), "abschluss").notiz).toBe("MAV offen");
    expect(schritt(uebernahme({ mavStatus: "ZUGESTIMMT" }), "abschluss").notiz).toBeUndefined();
  });

  it("Kurzform für schmale Bildschirme", () => {
    expect(schrittKurzform(prozess(uebernahme()))).toBe("Schritt 4 von 5 · Vertrag");
    expect(schrittKurzform(prozess(stand({ status: "ABGESCHLOSSEN" })))).toBe("Abgeschlossen");
    expect(schrittKurzform(prozess(stand({ status: "STORNIERT" })))).toBe("Abgebrochen");
  });
});

describe("Jetzt dran", () => {
  it("je Status die eine Handlung", () => {
    expect(dran(stand())).toMatchObject({ bei: "HR", aktion: "anfrage-senden" });
    expect(dran(angefragt())).toMatchObject({ bei: "FUEHRUNGSKRAFT", aktion: "erinnern" });
    expect(dran(uebernahme())).toMatchObject({ bei: "HR", aktion: "vertrag-erfassen", nebenAktion: "dokumente" });
    expect(dran(uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-1) }))).toMatchObject({
      aktion: "abschliessen",
    });
    expect(dran(abgelehnt())).toMatchObject({ bei: "HR", aktion: "offboarding-anlegen" });
    expect(dran(keineUebernahme({ offboarding: OFFBOARDING }))).toMatchObject({
      aktion: "zum-offboarding",
      nebenAktion: "dokumente",
    });
  });

  it("keine Übernahme ohne verknüpftes Offboarding: kein Verweis ins Leere", () => {
    const d = dran(keineUebernahme());
    expect(d.aktion).toBe("dokumente");
    expect(d.nebenAktion).toBeUndefined();
  });

  it("Ablehnung mit schon verknüpftem Offboarding: kein zweites anlegen (die Route lehnte ab), sondern dorthin", () => {
    const d = dran(abgelehnt({ offboarding: OFFBOARDING }));
    expect(d).toMatchObject({ satz: "Offboarding ist bereits angelegt", bei: "HR", aktion: "zum-offboarding" });
    expect(d.nebenAktion).toBeUndefined();
  });

  it("wartend: nennt Anfrage, Adresse und Erinnerungen", () => {
    expect(dran(angefragt()).unterzeile).toBe("Anfrage vom 22.05.2026 an leitung@beispiel.invalid · noch nicht erinnert");
    expect(dran(angefragt({ supervisorReminderCount: 2, lastSupervisorReminderAt: tag(-1) })).unterzeile).toBe(
      "Anfrage vom 22.05.2026 an leitung@beispiel.invalid · 2× erinnert, zuletzt 31.05.2026",
    );
  });

  it("fehlt ein Datum, fällt es samt seinem Vorwort weg — kein „zuletzt “ ohne Datum", () => {
    expect(dran(angefragt({ supervisorReminderCount: 2, lastSupervisorReminderAt: null })).unterzeile).toBe(
      "Anfrage vom 22.05.2026 an leitung@beispiel.invalid · 2× erinnert",
    );
    expect(dran(angefragt({ supervisorReminderCount: 1, lastSupervisorReminderAt: "kein Datum" })).unterzeile).toBe(
      "Anfrage vom 22.05.2026 an leitung@beispiel.invalid · 1× erinnert",
    );
    expect(dran(angefragt({ supervisorLinkSentAt: "kein Datum" })).unterzeile).toBe(
      "Anfrage an leitung@beispiel.invalid · noch nicht erinnert",
    );
    for (const { p } of PROBEN) {
      for (const text of [p.jetztDran?.unterzeile, p.jetztDran?.frist]) {
        if (text !== undefined) expect(text).toBe(text.trim());
      }
    }
  });

  it("abgelaufener Link: statt „Erinnern“ (die Route lehnt ab) „Anfrage neu senden“, bei HR", () => {
    const s = angefragt({ supervisorTokenExpiresAt: tag(-1), supervisorReminderCount: 3, lastSupervisorReminderAt: tag(-5) });
    expect(dran(s)).toMatchObject({
      satz: "Link der Führungskraft ist abgelaufen – Anfrage neu senden",
      bei: "HR",
      aktion: "anfrage-neu-senden",
      unterzeile: "Anfrage vom 22.05.2026 an leitung@beispiel.invalid · 3× erinnert, zuletzt 27.05.2026",
    });
    expect(vertragsendeMenue(s, JETZT)).toEqual(["offboarding-anlegen", "stornieren"]);
  });

  it("Link ohne Ablaufdatum gilt als abgelaufen (wie in der Route)", () => {
    expect(dran(angefragt({ supervisorTokenExpiresAt: null }))).toMatchObject({ aktion: "anfrage-neu-senden" });
  });

  it("Anfrage nicht zugestellt: „erneut senden“ bei HR, die Unterzeile nennt die Adresse", () => {
    // So hinterlaesst `/supervisor-link` eine Anfrage, deren Mail nicht hinausging.
    const s = angefragt({ supervisorLinkSentAt: null, supervisorTokenExpiresAt: tag(30) });
    expect(dran(s)).toMatchObject({
      satz: "Anfrage wurde nicht zugestellt – erneut senden",
      bei: "HR",
      unterzeile: "Die E-Mail an leitung@beispiel.invalid ging nicht hinaus; die Führungskraft hat keinen gültigen Link.",
      aktion: "anfrage-senden",
      frist: "Vertragsende 28.03.2027 · in 300 Tagen",
    });
    expect(dran(s).nebenAktion).toBeUndefined();
    expect(vertragsendeMenue(s, JETZT)).toEqual(["offboarding-anlegen", "stornieren"]);
    // Die Frist gilt wie in jeder Anfrage-Lage.
    expect(dran({ ...s, contractEndDate: tag(0) })).toMatchObject({ dringlichkeit: "critical" });
  });

  it("Abschluss nach Übernahme nennt einen offenen MAV-Stand, sperrt aber nicht", () => {
    const s = uebernahme({ status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: tag(-1) });
    expect(dran(s).unterzeile).toBe("Mitarbeitervertretung: Stand noch offen");
    expect(dran({ ...s, mavStatus: "ANGEHOERT" }).unterzeile).toBeUndefined();
    expect(dran(s).aktion).toBe("abschliessen");
  });
});

describe("Frist", () => {
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

  it("die letzten Tage sind lückenlos kritisch — auch der Tag des Vertragsendes selbst", () => {
    // Die Ampel meldet am letzten Tag schon „AUSSERHALB“ (sie rechnet bis
    // Mitternacht davor); ohne eigene Regel fiele genau dieser Tag heraus.
    for (const s of [stand(), angefragt(), abgelehnt()]) {
      for (let versatz = 3; versatz >= -3; versatz--) {
        const d = dran({ ...s, contractEndDate: tag(versatz) });
        expect({ versatz, dringlichkeit: d.dringlichkeit }).toEqual({ versatz, dringlichkeit: "critical" });
      }
    }
    // … zu jeder Uhrzeit des letzten Tages (Berlin: 00:30 und 23:30 am 1. Juni)
    for (const uhr of ["2026-05-31T22:30:00Z", "2026-06-01T21:30:00Z"]) {
      const d = vertragsendeProzessStand(stand({ contractEndDate: tag(0) }), new Date(uhr)).jetztDran!;
      expect(d).toMatchObject({ frist: "Vertragsende 01.06.2026 · heute", dringlichkeit: "critical" });
    }
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
      keineUebernahme({ offboarding: OFFBOARDING, contractEndDate: tag(-3) }),
      keineUebernahme({ offboarding: OFFBOARDING, contractEndDate: tag(0) }),
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

    const heute = uebernahme({ contractEndDate: tag(0) });
    expect(vertragsendePille(heute, JETZT)).toEqual({ text: "Entfristungsrisiko · heute", ton: "critical" });

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

describe("Statuspille", () => {
  it("folgt dem Katalog, solange der Status sagt, wer dran ist", () => {
    expect(vertragsendePille(stand(), JETZT)).toEqual({ text: "Anfrage offen", ton: "info" });
    expect(vertragsendePille(angefragt(), JETZT)).toEqual({ text: "Wartet auf Führungskraft", ton: "wait" });
    expect(vertragsendePille(abgelehnt(), JETZT)).toEqual({ text: "Abgelehnt · Offboarding offen", ton: "info" });
    expect(vertragsendePille(keineUebernahme(), JETZT)).toEqual({ text: "Keine Übernahme", ton: "neutral" });
    expect(vertragsendePille(stand({ status: "ABGESCHLOSSEN" }), JETZT)).toEqual({ text: "Abgeschlossen", ton: "ok" });
    expect(vertragsendePille(stand({ status: "STORNIERT" }), JETZT)).toEqual({ text: "Storniert", ton: "neutral" });
  });

  it("sagt nicht „Wartet auf Führungskraft“, wenn die Führungskraft gar nicht antworten kann", () => {
    for (const status of ["ANFRAGE_VORGESETZTER", "ENTSCHEIDUNG_UEBERNAHME"]) {
      // nie eine Anfrage verschickt, keine Adresse
      expect(vertragsendePille(stand({ status }), JETZT)).toEqual({ text: "Anfrage offen", ton: "info" });
      // Adresse, aber nie ein Link erzeugt (Hand-PATCH): kein Versandversuch
      expect(vertragsendePille(stand({ status, supervisorEmail: ADRESSE }), JETZT)).toEqual({ text: "Anfrage offen", ton: "info" });
      // Adresse und Link, aber kein Versandzeitpunkt: Die Mail ging nicht hinaus
      for (const ablauf of [tag(30), tag(-1)]) {
        expect(vertragsendePille(stand({ status, supervisorEmail: ADRESSE, supervisorTokenExpiresAt: ablauf }), JETZT)).toEqual({
          text: "Anfrage nicht zugestellt",
          ton: "info",
        });
      }
      // Link abgelaufen bzw. ohne Ablaufdatum
      for (const ablauf of [tag(-1), null]) {
        expect(vertragsendePille(angefragt({ status, supervisorTokenExpiresAt: ablauf }), JETZT)).toEqual({
          text: "Link abgelaufen",
          ton: "info",
        });
      }
      // Link gilt
      expect(vertragsendePille(angefragt({ status }), JETZT)).toEqual({ text: "Wartet auf Führungskraft", ton: "wait" });
    }
  });
});

describe("Menü", () => {
  it("je Status; „Stornieren“ immer zuletzt, nach dem Ende nichts", () => {
    expect(vertragsendeMenue(stand(), JETZT)).toEqual(["offboarding-anlegen", "stornieren"]);
    expect(vertragsendeMenue(angefragt(), JETZT)).toEqual(["anfrage-neu-senden", "offboarding-anlegen", "stornieren"]);
    expect(vertragsendeMenue(uebernahme(), JETZT)).toEqual(["abschliessen", "stornieren"]);
    expect(vertragsendeMenue(abgelehnt(), JETZT)).toEqual(["stornieren"]);
    expect(vertragsendeMenue(keineUebernahme(), JETZT)).toEqual(["abschliessen", "stornieren"]);
    expect(vertragsendeMenue(stand({ status: "ABGESCHLOSSEN" }), JETZT)).toEqual([]);
    expect(vertragsendeMenue(stand({ status: "STORNIERT" }), JETZT)).toEqual([]);
  });

  it("bietet kein zweites Offboarding an", () => {
    expect(vertragsendeMenue(stand({ offboarding: OFFBOARDING }), JETZT)).toEqual(["stornieren"]);
    expect(vertragsendeMenue(angefragt({ offboarding: OFFBOARDING }), JETZT)).toEqual(["anfrage-neu-senden", "stornieren"]);
  });
});

describe("Kann die Führungskraft antworten?", () => {
  // Die Dialoge sagen „Der Link wird ungültig“ nur dann (`dialoge.tsx`).
  it("ja, solange die Anfrage zugestellt ist und ihr Link gilt", () => {
    expect(fuehrungskraftKannAntworten(angefragt(), JETZT)).toBe(true);
    // Altstatus mit zugestellter Anfrage wie ANFRAGE_VORGESETZTER
    expect(fuehrungskraftKannAntworten(angefragt({ status: "ENTSCHEIDUNG_UEBERNAHME" }), JETZT)).toBe(true);
    // Der Link gilt bis zu seinem Ablauf, nicht nur bis Mitternacht davor
    expect(fuehrungskraftKannAntworten(angefragt({ supervisorTokenExpiresAt: JETZT.toISOString() }), JETZT)).toBe(true);
  });

  it("nein vor der Anfrage, ohne Versand, mit abgelaufenem Link, nach der Rückmeldung und im Endstatus", () => {
    const FAELLE: [string, VertragsendeStand][] = [
      ["ANGELEGT", stand()],
      ["ANGELEGT mit Adresse", stand({ supervisorEmail: ADRESSE })],
      ["Status gesetzt, ohne Adresse", stand({ status: "ANFRAGE_VORGESETZTER" })],
      ["Status und Adresse von Hand, nie ein Link", stand({ status: "ANFRAGE_VORGESETZTER", supervisorEmail: ADRESSE })],
      [
        "Anfrage nicht zugestellt, neuer Link gespeichert",
        angefragt({ supervisorLinkSentAt: null, supervisorTokenExpiresAt: tag(30) }),
      ],
      ["Link abgelaufen", angefragt({ supervisorTokenExpiresAt: tag(-1) })],
      ["Link ohne Ablaufdatum", angefragt({ supervisorTokenExpiresAt: null })],
      ["Rückmeldung Übernahme", uebernahme()],
      ["Rückmeldung keine Übernahme", abgelehnt()],
      ["Keine Übernahme", keineUebernahme({ offboarding: OFFBOARDING })],
      ["ABGESCHLOSSEN (Link galt noch)", angefragt({ status: "ABGESCHLOSSEN" })],
      ["STORNIERT (Link galt noch)", angefragt({ status: "STORNIERT" })],
    ];
    for (const [lage, s] of FAELLE) {
      expect({ lage, kann: fuehrungskraftKannAntworten(s, JETZT) }).toEqual({ lage, kann: false });
    }
  });

  it("in jeder Lage genau dann, wenn „Jetzt dran“ bei der Führungskraft liegt", () => {
    for (const { s, lage, p } of PROBEN) {
      expect({ lage, kann: fuehrungskraftKannAntworten(s, JETZT) }).toEqual({
        lage,
        kann: p.jetztDran?.bei === "FUEHRUNGSKRAFT",
      });
    }
  });
});

/**
 * Was in JEDER Lage gilt — auch in denen, die nur ein Handeingriff erzeugt.
 */
describe("Über alle Lagen", () => {
  it("deckt jeden Status ab — und jede Lage ist gerechnet", () => {
    expect(new Set(LAGEN.map((s) => s.status))).toEqual(new Set(ALLE_STATUS));
    expect(LAGEN).toHaveLength(ALLE_STATUS.length * ANFRAGEN.length * 2 * NEBENLAGEN.length);
    expect(PROBEN).toHaveLength(LAGEN.length);
  });

  it("keine Handlung steht zugleich in „Jetzt dran“ und im Menü; „Stornieren“ steht zuletzt", () => {
    for (const { lage, p, menue } of PROBEN) {
      const d = p.jetztDran;
      const doppelt = menue.filter((a) => a === d?.aktion || a === d?.nebenAktion);
      expect({ lage, doppelt }).toEqual({ lage, doppelt: [] });
      expect(new Set(menue).size).toBe(menue.length);
      if (menue.includes("stornieren")) expect(menue[menue.length - 1]).toBe("stornieren");
      if (d?.aktion) expect(d.aktion).not.toBe(d.nebenAktion);
    }
  });

  it("wer dran ist, sagen Pille, aktiver Schritt und „Jetzt dran“ übereinstimmend", () => {
    const ZUSTAENDIG = { HR: "HR", FUEHRUNGSKRAFT: "Führungskraft" } as const;
    for (const { lage, p, pille } of PROBEN) {
      const aktiv = p.schritte.filter((x) => x.status === "aktiv");

      // Ohne „Jetzt dran“ ist kein Schritt aktiv — und umgekehrt.
      expect({ lage, aktiv: aktiv.length }).toEqual({ lage, aktiv: p.jetztDran ? 1 : 0 });
      // Der aktive Schritt liegt bei dem, der dran ist.
      if (p.jetztDran) {
        expect({ lage, zustaendig: aktiv[0].zustaendig }).toEqual({ lage, zustaendig: ZUSTAENDIG[p.jetztDran.bei] });
      }
      // „wait“ heisst: Es wartet auf jemand anderen — genau dann, wenn die Führungskraft dran ist.
      expect({ lage, wartet: pille.ton === "wait" }).toEqual({ lage, wartet: p.jetztDran?.bei === "FUEHRUNGSKRAFT" });
    }
  });

  it("„nicht zugestellt“ genau bei Anfrage-Status mit Adresse und erzeugtem Link ohne Versandzeitpunkt – dann sagen Pille, Schritt und „Jetzt dran“ dasselbe", () => {
    const vorkommen = { ja: 0, nein: 0 };
    for (const { s, lage, p, pille } of PROBEN) {
      const erwartet =
        (CONTRACT_END_ANFRAGE_OFFEN as readonly string[]).includes(s.status) &&
        Boolean(s.supervisorEmail) &&
        Boolean(s.supervisorTokenExpiresAt) &&
        !s.supervisorLinkSentAt;
      const ist = anfrageNichtZugestellt(s, JETZT);
      expect({ lage, ist }).toEqual({ lage, ist: erwartet });
      vorkommen[ist ? "ja" : "nein"] += 1;

      const notiz = p.schritte.find((x) => x.key === "anfrage")!.notiz === "nicht zugestellt";
      const satz = p.jetztDran?.satz === "Anfrage wurde nicht zugestellt – erneut senden";
      // Die Entfristungswarnung ersetzte jede Pille — sie greift aber nur nach einer
      // Rückmeldung, nie in einem Anfrage-Status.
      const pilleSagtEs = pille.text === VERTRAGSENDE_PILLE_NICHT_ZUGESTELLT.text;
      expect({ lage, notiz, satz, pilleSagtEs }).toEqual({ lage, notiz: ist, satz: ist, pilleSagtEs: ist });
      if (ist) {
        expect({ lage, dran: p.jetztDran }).toMatchObject({ lage, dran: { bei: "HR", aktion: "anfrage-senden" } });
        expect({ lage, ton: pille.ton }).toEqual({ lage, ton: "info" });
      }
    }
    // Beide Seiten kommen vor — sonst prueft der Test nichts.
    expect(vorkommen.ja).toBeGreaterThan(0);
    expect(vorkommen.nein).toBeGreaterThan(0);
  });
});

/**
 * Gegenprobe: Die Seite bietet nur an, was die Route auch annimmt — in jeder
 * Lage.
 *
 * Die Statuslisten sind DIESELBEN, die die Routen lesen
 * (`src/lib/contract-end-status.ts`); wer dort einen Status streicht, sieht
 * hier, welche Handlung die Seite dann zu Unrecht anboete. Zwei Bedingungen
 * pruefen die Routen ausserhalb der Listen, sie sind hier nachgebildet:
 *   - /nicht-uebernehmen: 409, wenn schon ein Offboarding verknuepft ist
 *   - /reminder: 409, wenn nie eine Anfrage hinausging oder ihr Link abgelaufen
 *     ist (den Token selbst sieht der Adapter nicht und soll ihn nicht sehen)
 */
describe("Gegenprobe gegen die Routen", () => {
  const einer = (liste: readonly string[], status: string) => liste.includes(status);

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
        return einer(CONTRACT_END_OFFBOARDING_AUS, s.status) && !s.offboarding;
      case "anfrage-senden":
      case "anfrage-neu-senden":
        return !einer(CONTRACT_END_ANFRAGE_GESPERRT, s.status);
      case "erinnern":
        return (
          einer(CONTRACT_END_ANFRAGE_OFFEN, s.status) &&
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
    for (const { s, lage, angeboten } of PROBEN) {
      const abgelehnte = angeboten.filter((aktion) => !erlaubt(aktion, s));
      expect({ lage, abgelehnte }).toEqual({ lage, abgelehnte: [] });
    }
  });

  it("die Gegenprobe ist nicht leer: Jede Handlung kommt in mindestens einer Lage vor", () => {
    const vorgekommen = new Set(PROBEN.flatMap((probe) => probe.angeboten));
    const alle: VertragsendeAktion[] = [
      "anfrage-senden",
      "erinnern",
      "anfrage-neu-senden",
      "offboarding-anlegen",
      "vertrag-erfassen",
      "dokumente",
      "zum-offboarding",
      "abschliessen",
      "stornieren",
    ];
    expect([...vorgekommen].sort()).toEqual([...alle].sort());
  });

  it("solange ein Vorgang läuft, gibt es einen Weg hinaus", () => {
    // Kein offener Vorgang ohne jede Handlung: Sonst bliebe er für immer in der Liste.
    for (const { s, lage, angeboten } of PROBEN) {
      const offen = (CONTRACT_END_UEBERGAENGE[s.status] ?? []).length > 0;
      expect({ lage, hatHandlung: angeboten.length > 0 }).toEqual({ lage, hatHandlung: offen });
    }
  });
});
