/**
 * Neue Detailseite Vertragsende (UX-Umbau, Pilot): die reinen Regeln der
 * Seite — Reiter aus der Adresse, Texte der Handlungen, Anzeigename, Auswahl
 * des MAV-Stands und die Aufrufe der Schnittstellen.
 *
 * Gegenprobe gegen die alte Ansicht: Die Aufrufe stehen dort im Quelltext
 * (`fetch(...)`); der Test liest ihn und verlangt, dass die neue Tabelle
 * dieselbe Adresse, Methode und denselben Körper schickt — in beide
 * Richtungen. Der Pilot ändert keine Fachlogik.
 */

import { readFileSync } from "fs";
import path from "path";

import {
  VERBINDUNGSFEHLER,
  anfrageMeldung,
  aufrufen,
  erinnerungMeldung,
  mailStatusAus,
  vertragsendeAufruf,
  type AufrufArt,
  type AufrufWerte,
} from "@/app/(portal)/vorgaenge/vertragsende/[id]/aufrufe";
import {
  AKTION_TEXT,
  MAV_AUSWAHL,
  aktionText,
  anzeigeName,
  menueText,
  reiterAusSuche,
  vertragsendeReiter,
  type ReiterWert,
} from "@/app/(portal)/vorgaenge/vertragsende/[id]/typen";
import { vorgangPfad } from "@/lib/adressen";
import { CONTRACT_END_UEBERGAENGE } from "@/lib/contract-end-status";
import {
  MAV_PILLE,
  vertragsendeMenue,
  vertragsendeProzessStand,
  type VertragsendeAktion,
  type VertragsendeStand,
} from "@/lib/prozess/vertragsende";
import { updateContractEndSchema } from "@/lib/validations/contract-end";

const ALTE_ANSICHT = path.join(
  process.cwd(),
  "src/app/(portal)/dashboard/contract-end/[id]/contract-end-detail-content.tsx",
);
const ALTE_QUELLE = readFileSync(ALTE_ANSICHT, "utf8");

const ALLE_STATUS = Object.keys(CONTRACT_END_UEBERGAENGE);
const ALLE_AKTIONEN = Object.keys(AKTION_TEXT) as VertragsendeAktion[];

// =============================================
// Reiter
// =============================================

describe("Reiter", () => {
  it("mit Bearbeitungsrecht vier Reiter, ohne drei (kein „E-Mails“)", () => {
    expect(vertragsendeReiter(true).map((r) => r.wert)).toEqual(["uebersicht", "vertragsdaten", "dokumente", "e-mails"]);
    expect(vertragsendeReiter(false).map((r) => r.wert)).toEqual(["uebersicht", "vertragsdaten", "dokumente"]);
    for (const r of vertragsendeReiter(true)) {
      expect(r.text.trim()).not.toBe("");
      // Aus dem Wert entsteht die Id des Inhaltsfelds (Baustein `Reiter`).
      expect(r.wert).toMatch(/^\S+$/);
    }
  });

  it("deutsche Namen, wie vorgangPfad sie schreibt", () => {
    const FAELLE: [string, ReiterWert][] = [
      ["uebersicht", "uebersicht"],
      ["übersicht", "uebersicht"],
      ["vertragsdaten", "vertragsdaten"],
      ["dokumente", "dokumente"],
      ["e-mails", "e-mails"],
      ["emails", "e-mails"],
    ];
    for (const [wert, reiter] of FAELLE) expect({ wert, reiter: reiterAusSuche(wert, true) }).toEqual({ wert, reiter });
  });

  it("Schlüssel der alten Ansicht (Lesezeichen, Verweise)", () => {
    const FAELLE: [string, ReiterWert][] = [
      ["overview", "uebersicht"],
      ["renewal", "vertragsdaten"],
      ["documents", "dokumente"],
      ["mails", "e-mails"],
    ];
    for (const [wert, reiter] of FAELLE) expect({ wert, reiter: reiterAusSuche(wert, true) }).toEqual({ wert, reiter });
  });

  it("Groß-/Kleinschreibung und Leerraum spielen keine Rolle", () => {
    expect(reiterAusSuche("Dokumente", true)).toBe("dokumente");
    expect(reiterAusSuche("DOCUMENTS", true)).toBe("dokumente");
    expect(reiterAusSuche("Übersicht", true)).toBe("uebersicht");
    expect(reiterAusSuche("E-Mails", true)).toBe("e-mails");
    expect(reiterAusSuche("  vertragsdaten  ", true)).toBe("vertragsdaten");
    expect(reiterAusSuche("\tRenewal\n", true)).toBe("vertragsdaten");
  });

  it("unbekannt, leer oder fehlend → Übersicht, nie ein Fehler", () => {
    for (const wert of [null, undefined, "", "   ", "unbekannt", "tab", "e-mail", "dokument", "uebersicht2"]) {
      expect({ wert, reiter: reiterAusSuche(wert, true) }).toEqual({ wert, reiter: "uebersicht" });
    }
  });

  it("Namen aus Object.prototype sind keine Reiter (`?tab=constructor`)", () => {
    // `?tab=` kommt aus der Adresse — jeder kann ihn setzen. Ein Nachschlagen
    // in einem gewöhnlichen Objekt fände dort die geerbten Eigenschaften.
    for (const wert of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"]) {
      for (const darf of [true, false]) {
        expect({ wert, darf, reiter: reiterAusSuche(wert, darf) }).toEqual({ wert, darf, reiter: "uebersicht" });
      }
    }
  });

  it("„E-Mails“ ohne Bearbeitungsrecht → Übersicht, in jeder Schreibweise", () => {
    for (const wert of ["e-mails", "E-Mails", "emails", "mails", " MAILS "]) {
      expect({ wert, reiter: reiterAusSuche(wert, false) }).toEqual({ wert, reiter: "uebersicht" });
    }
    // Die übrigen Reiter gehen auch ohne Recht.
    expect(reiterAusSuche("dokumente", false)).toBe("dokumente");
    expect(reiterAusSuche("renewal", false)).toBe("vertragsdaten");
  });

  it("was reiterAusSuche liefert, ist immer ein Reiter, den die Seite für dieses Recht auch zeigt", () => {
    const eingaben = [null, "", "overview", "renewal", "documents", "mails", "e-mails", "dokumente", "constructor", "x"];
    for (const darf of [true, false]) {
      const werte = vertragsendeReiter(darf).map((r) => r.wert as string);
      for (const wert of eingaben) {
        const reiter = reiterAusSuche(wert, darf);
        expect({ wert, darf, gezeigt: werte.includes(reiter) }).toEqual({ wert, darf, gezeigt: true });
      }
    }
  });

  it("Rundreise: der ?tab=-Wert, den vorgangPfad schreibt, öffnet wieder denselben Reiter", () => {
    for (const { wert } of vertragsendeReiter(true)) {
      const adresse = new URL(vorgangPfad("vertragsende", "0b7c6a2e-1111-4222-8333-944455556666", wert), "https://portal.invalid");
      expect(adresse.pathname).toBe("/vorgaenge/vertragsende/0b7c6a2e-1111-4222-8333-944455556666");
      expect(reiterAusSuche(adresse.searchParams.get("tab"), true)).toBe(wert);
    }
  });

  it("Gegenprobe: jeder Reiter der alten Ansicht führt auf den Reiter mit demselben Namen", () => {
    const block = /const TABS = \[([\s\S]*?)\] as const;/.exec(ALTE_QUELLE)?.[1];
    expect(block).toBeDefined();
    const alte = [...block!.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g)].map((m) => ({ id: m[1], label: m[2] }));
    expect(alte.map((t) => t.id)).toEqual(["overview", "renewal", "documents", "mails"]);
    const neue = vertragsendeReiter(true);
    for (const { id, label } of alte) {
      const reiter = neue.find((r) => r.wert === reiterAusSuche(id, true));
      expect({ id, text: reiter?.text }).toEqual({ id, text: label });
    }
  });
});

// =============================================
// Texte der Handlungen
// =============================================

/** Vorgang mit Offboarding samt Status, wie ihn die Antwort der Route trägt. */
type Lage = VertragsendeStand & { offboarding: { id: string; displayId: string; status: string } | null };

const JETZT = new Date("2026-06-01T10:00:00Z");
const tag = (versatz: number) => new Date(Date.UTC(2026, 5, 1 + versatz)).toISOString();
const ADRESSE = "leitung@beispiel.invalid";
const OFFBOARDING = { id: "off-1", displayId: "OFF-2026-GYM-003", status: "IN_PROGRESS" };

function lage(teil: Partial<Lage> = {}): Lage {
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

const ANFRAGEN: Partial<Lage>[] = [
  {}, // nie angefragt
  { supervisorEmail: ADRESSE }, // Adresse eingetragen, nichts verschickt
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: tag(-10), supervisorTokenExpiresAt: tag(20) }, // Link gilt
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: tag(-40), supervisorTokenExpiresAt: tag(-1) }, // abgelaufen
  { supervisorEmail: ADRESSE, supervisorLinkSentAt: tag(-10), supervisorTokenExpiresAt: null }, // ohne Ablaufdatum
];
const NEBENLAGEN: Partial<Lage>[] = [
  { decision: "OFFEN", contractEndDate: tag(300) },
  { decision: "UEBERNAHME", contractEndDate: tag(10) },
  { decision: "UEBERNAHME", contractSignedReturnedAt: tag(-1), contractEndDate: tag(-3) },
  { decision: "KEINE_UEBERNAHME", contractEndDate: tag(-3) },
];
const LAGEN: Lage[] = ALLE_STATUS.flatMap((status) =>
  ANFRAGEN.flatMap((anfrage) =>
    [null, OFFBOARDING].flatMap((offboarding) => NEBENLAGEN.map((neben) => lage({ status, offboarding, ...anfrage, ...neben }))),
  ),
);

/** Was die Seite je Lage anbietet: Knopf und Nebenknopf in „Jetzt dran“, die Punkte des Menüs. */
function angeboten(s: Lage) {
  const dran = vertragsendeProzessStand(s, JETZT).jetztDran;
  return {
    knoepfe: [dran?.aktion, dran?.nebenAktion].filter((a): a is VertragsendeAktion => Boolean(a)),
    menue: vertragsendeMenue(s, JETZT),
  };
}

/** Handlungen ohne Dialog: Erinnern läuft ohne Rückfrage, die beiden anderen sind Verweise. */
const OHNE_DIALOG: VertragsendeAktion[] = ["erinnern", "dokumente", "zum-offboarding"];

describe("Texte der Handlungen", () => {
  it("jede Handlung, die die Seite in irgendeiner Lage anbietet, hat einen Text — und es gibt keine weiteren", () => {
    const vorgekommen = new Set<VertragsendeAktion>();
    for (const s of LAGEN) {
      const { knoepfe, menue } = angeboten(s);
      for (const a of knoepfe) {
        vorgekommen.add(a);
        expect({ a, text: aktionText(a, s).trim() !== "" }).toEqual({ a, text: true });
      }
      for (const a of menue) {
        vorgekommen.add(a);
        expect({ a, text: menueText(a, s).trim() !== "" }).toEqual({ a, text: true });
      }
    }
    expect([...vorgekommen].sort()).toEqual([...ALLE_AKTIONEN].sort());
  });

  it("Knöpfe, die einen Dialog öffnen, enden auf „ …“; die übrigen nicht", () => {
    for (const a of ALLE_AKTIONEN) {
      const text = AKTION_TEXT[a];
      expect({ a, dialog: text.endsWith(" …") }).toEqual({ a, dialog: !OHNE_DIALOG.includes(a) });
      expect(text).not.toMatch(/\.\.\.|…\S|\s{2,}/);
    }
    // Auch in jeder Lage — Knopf wie Menüpunkt
    for (const s of LAGEN) {
      const { knoepfe, menue } = angeboten(s);
      for (const a of knoepfe) {
        if (!OHNE_DIALOG.includes(a)) expect(aktionText(a, s)).toMatch(/ …$/);
      }
      for (const a of menue) {
        if (!OHNE_DIALOG.includes(a)) expect(menueText(a, s)).toMatch(/ …$/);
      }
    }
  });

  it("Sprache: keine Anrede, keine Pfeile, keine Emojis, kein „OK“, keine Versalien, „Führungskraft“", () => {
    const texte = [
      ...Object.values(AKTION_TEXT),
      menueText("offboarding-anlegen", { offboarding: null, supervisorLinkSentAt: null }),
      menueText("offboarding-anlegen", { offboarding: null, supervisorLinkSentAt: tag(-1) }),
    ];
    for (const text of texte) {
      const befund = {
        anrede: /\b(Sie|Ihnen|Ihre?[mnrs]?|du|dich|dir|dein\w*)\b/.test(text),
        pfeil: /[→←↑↓⇒⇐»«➜➔]|->|<-/.test(text),
        emoji: /\p{Extended_Pictographic}/u.test(text),
        ok: /\bOK\b/i.test(text),
        versalien: /(?<!\p{L})\p{Lu}{3,}(?!\p{L})/u.test(text),
        vorgesetzt: /Vorgesetzt/.test(text),
        anfang: /^\p{Lu}/u.test(text),
      };
      expect({ text, befund }).toEqual({
        text,
        befund: { anrede: false, pfeil: false, emoji: false, ok: false, versalien: false, vorgesetzt: false, anfang: true },
      });
    }
  });

  it("„Zum Offboarding“ hängt die Vorgangsnummer an — nur, wenn es eines gibt", () => {
    expect(aktionText("zum-offboarding", { offboarding: OFFBOARDING })).toBe("Zum Offboarding OFF-2026-GYM-003");
    expect(aktionText("zum-offboarding", { offboarding: null })).toBe("Zum Offboarding");
    // Andere Handlungen bleiben, wie sie sind
    for (const a of ALLE_AKTIONEN.filter((x) => x !== "zum-offboarding")) {
      expect(aktionText(a, { offboarding: OFFBOARDING })).toBe(AKTION_TEXT[a]);
    }
  });

  it("Menüpunkt „Offboarding anlegen“ sagt, was übersprungen wird: die Anfrage oder die Rückmeldung", () => {
    expect(menueText("offboarding-anlegen", { offboarding: null, supervisorLinkSentAt: null })).toBe(
      "Ohne Anfrage: Offboarding anlegen …",
    );
    expect(menueText("offboarding-anlegen", { offboarding: null, supervisorLinkSentAt: tag(-10) })).toBe(
      "Ohne Rückmeldung: Offboarding anlegen …",
    );
    for (const s of LAGEN) {
      if (!vertragsendeMenue(s, JETZT).includes("offboarding-anlegen")) continue;
      const text = menueText("offboarding-anlegen", s);
      expect(text.startsWith(s.supervisorLinkSentAt ? "Ohne Rückmeldung:" : "Ohne Anfrage:")).toBe(true);
    }
  });

  it("alle anderen Menüpunkte tragen denselben Text wie ihr Knopf", () => {
    for (const a of ALLE_AKTIONEN.filter((x) => x !== "offboarding-anlegen")) {
      for (const offboarding of [null, OFFBOARDING]) {
        expect(menueText(a, { offboarding, supervisorLinkSentAt: tag(-1) })).toBe(aktionText(a, { offboarding }));
      }
    }
  });
});

// =============================================
// Anzeigename
// =============================================

describe("Anzeigename", () => {
  const person = (employeeFirstName: string, employeeLastName: string) => ({
    employeeFirstName,
    employeeLastName,
    displayId: "VE-2026-BK-004",
  });

  it("„Vorname Nachname“ — jeder Teil ohne Leerraum am Rand, dazwischen genau ein Leerzeichen", () => {
    expect(anzeigeName(person("Maria", "Muster"))).toBe("Maria Muster");
    expect(anzeigeName(person(" Maria ", " Muster "))).toBe("Maria Muster");
    // Mehrteilige Namen bleiben, wie sie sind.
    expect(anzeigeName(person("Anna Lena", "von Muster"))).toBe("Anna Lena von Muster");
  });

  it("nur ein Teil vorhanden: dieser Teil, ohne Leerzeichen davor oder dahinter", () => {
    expect(anzeigeName(person("", "Muster"))).toBe("Muster");
    expect(anzeigeName(person("Maria", ""))).toBe("Maria");
  });

  it("ohne Namen die Vorgangsnummer — ein Titel ist nie leer", () => {
    expect(anzeigeName(person("", ""))).toBe("VE-2026-BK-004");
    expect(anzeigeName(person("  ", "\t"))).toBe("VE-2026-BK-004");
  });
});

// =============================================
// MAV-Auswahl
// =============================================

describe("Auswahl „Stand der Mitarbeitervertretung“", () => {
  it("genau die vier Werte, Texte aus MAV_PILLE", () => {
    expect(MAV_AUSWAHL).toEqual([
      { wert: "NICHT_ERFORDERLICH", text: MAV_PILLE.NICHT_ERFORDERLICH.text },
      { wert: "ANGEHOERT", text: MAV_PILLE.ANGEHOERT.text },
      { wert: "ZUGESTIMMT", text: MAV_PILLE.ZUGESTIMMT.text },
      { wert: "WIDERSPRUCH", text: MAV_PILLE.WIDERSPRUCH.text },
    ]);
    // „Ausstehend“ setzt niemand von Hand.
    expect(MAV_AUSWAHL.map((m) => m.wert)).not.toContain("AUSSTEHEND");
  });

  it("Gegenprobe: dieselben Werte und Texte wie die Knöpfe der alten Ansicht", () => {
    const block = /const MAV_OPTIONS[^=]*=\s*\[([\s\S]*?)\];/.exec(ALTE_QUELLE)?.[1];
    expect(block).toBeDefined();
    const alte = [...block!.matchAll(/\{\s*value:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g)].map((m) => ({
      wert: m[1],
      text: m[2],
    }));
    expect(alte).toHaveLength(4);
    expect(MAV_AUSWAHL).toEqual(alte);
  });
});

// =============================================
// Aufrufe
// =============================================

const ID = "0b7c6a2e-1111-4222-8333-944455556666";
const WERTE: Required<AufrufWerte> = { supervisorEmail: ADRESSE, mavStatus: "ZUGESTIMMT" };

/** Die erwartete Tabelle — `Record<AufrufArt, …>`, damit eine neue Art hier fehlen MUSS. */
const TABELLE: Record<AufrufArt, { url: string; method: "POST" | "PATCH"; body?: Record<string, string> }> = {
  "anfrage-senden": { url: `/api/contract-end/${ID}/supervisor-link`, method: "POST", body: { supervisorEmail: ADRESSE } },
  erinnern: { url: `/api/contract-end/${ID}/reminder`, method: "POST" },
  "offboarding-anlegen": { url: `/api/contract-end/${ID}/nicht-uebernehmen`, method: "POST" },
  "vertrag-erfassen": { url: `/api/contract-end/${ID}`, method: "PATCH", body: { status: "VERTRAG_UNTERSCHRIEBEN" } },
  abschliessen: { url: `/api/contract-end/${ID}`, method: "PATCH", body: { status: "ABGESCHLOSSEN" } },
  stornieren: { url: `/api/contract-end/${ID}`, method: "PATCH", body: { status: "STORNIERT" } },
  "mav-setzen": { url: `/api/contract-end/${ID}`, method: "PATCH", body: { mavStatus: "ZUGESTIMMT" } },
};
const ARTEN = Object.keys(TABELLE) as AufrufArt[];

/** Ein Wert im Körper der alten Ansicht, der aus einer Variable kommt (`{ supervisorEmail }`). */
const VARIABLE = Symbol("Variable");

interface AlterAufruf {
  /** Teil hinter `/api/contract-end/${contractEndId}`. */
  pfad: string;
  method: string;
  body: Record<string, string | typeof VARIABLE> | undefined;
  jsonKopf: boolean;
}

/** Alle `fetch(…)` der alten Ansicht, aus dem Quelltext gelesen. */
function alteAufrufe(): AlterAufruf[] {
  return ALTE_QUELLE.split("fetch(")
    .slice(1)
    .map((teil) => {
      // Der Aufruf endet mit „);“ — die Optionen enthalten kein Semikolon.
      const aufruf = teil.slice(0, teil.indexOf(";"));
      const pfad = /^`\/api\/contract-end\/\$\{contractEndId\}([^`]*)`/.exec(aufruf);
      if (!pfad) throw new Error(`Aufruf der alten Ansicht nicht erkannt: ${aufruf.slice(0, 120)}`);
      const method = /method:\s*"(\w+)"/.exec(aufruf)?.[1] ?? "GET";
      const koerper = /body:\s*JSON\.stringify\(\{([^}]*)\}\)/.exec(aufruf)?.[1];
      let body: AlterAufruf["body"];
      if (koerper !== undefined) {
        body = {};
        for (const eintrag of koerper.split(",").map((e) => e.trim()).filter(Boolean)) {
          const literal = /^(\w+)\s*:\s*"([^"]*)"$/.exec(eintrag);
          const kurzform = /^(\w+)$/.exec(eintrag);
          if (literal) body[literal[1]] = literal[2];
          else if (kurzform) body[kurzform[1]] = VARIABLE;
          else throw new Error(`Körper der alten Ansicht nicht erkannt: ${koerper}`);
        }
      } else if (/body:/.test(aufruf)) {
        throw new Error(`Körper der alten Ansicht nicht erkannt: ${aufruf.slice(0, 120)}`);
      }
      return { pfad: pfad[1], method, body, jsonKopf: /"Content-Type":\s*"application\/json"/.test(aufruf) };
    });
}

/** Schickt der neue Aufruf dasselbe wie der alte? Eine Variable der alten Ansicht entspricht dem Wert aus `WERTE`. */
function gleich(alt: AlterAufruf, art: AufrufArt): boolean {
  const neu = vertragsendeAufruf(art, ID, WERTE);
  if (neu.url !== `/api/contract-end/${ID}${alt.pfad}` || neu.method !== alt.method) return false;
  if (!alt.body || !neu.body) return !alt.body && !neu.body;
  const schluessel = Object.keys(alt.body).sort();
  if (JSON.stringify(schluessel) !== JSON.stringify(Object.keys(neu.body).sort())) return false;
  return schluessel.every((k) => {
    const erwartet = alt.body![k];
    return erwartet === VARIABLE ? neu.body![k] === WERTE[k as keyof AufrufWerte] : neu.body![k] === erwartet;
  });
}

describe("Aufrufe der Schnittstellen", () => {
  it("Tabelle aller Arten: Adresse, Methode, Körper", () => {
    for (const art of ARTEN) {
      const { url, method, body, ersatzFehler } = vertragsendeAufruf(art, ID, WERTE);
      expect({ art, url, method, body }).toEqual({ art, ...TABELLE[art] });
      expect(ersatzFehler.trim()).not.toBe("");
      expect(ersatzFehler).toMatch(/\.$/);
      expect(ersatzFehler).not.toMatch(/\b(Sie|du)\b/);
    }
  });

  it("Werte landen nur im Körper ihrer Art", () => {
    for (const art of ARTEN) {
      const ohne = vertragsendeAufruf(art, ID);
      const mit = vertragsendeAufruf(art, ID, WERTE);
      if (art !== "anfrage-senden") expect(JSON.stringify(mit.body ?? {})).not.toContain(ADRESSE);
      if (art !== "mav-setzen") expect(mit.body?.mavStatus).toBeUndefined();
      // Ohne Werte: dieselbe Adresse und Methode, ein leerer Wert statt `undefined` im Körper
      expect([ohne.url, ohne.method]).toEqual([mit.url, mit.method]);
      for (const wert of Object.values(ohne.body ?? {})) expect(typeof wert).toBe("string");
    }
  });

  it("jede Handlung mit Schnittstelle hat ihre Art — „Anfrage neu senden“ ist dieselbe wie „Anfrage senden“", () => {
    const VERWEISE: VertragsendeAktion[] = ["dokumente", "zum-offboarding"];
    for (const aktion of ALLE_AKTIONEN.filter((a) => !VERWEISE.includes(a))) {
      const art = aktion === "anfrage-neu-senden" ? "anfrage-senden" : aktion;
      expect({ aktion, hatArt: ARTEN.includes(art as AufrufArt) }).toEqual({ aktion, hatArt: true });
    }
  });

  it("der Körper jedes PATCH besteht die Prüfung der Route", () => {
    for (const art of ARTEN.filter((a) => TABELLE[a].method === "PATCH")) {
      expect({ art, ok: updateContractEndSchema.safeParse(vertragsendeAufruf(art, ID, WERTE).body).success }).toEqual({ art, ok: true });
    }
    for (const { wert } of MAV_AUSWAHL) {
      const body = vertragsendeAufruf("mav-setzen", ID, { mavStatus: wert }).body;
      expect(body).toEqual({ mavStatus: wert });
      expect(updateContractEndSchema.safeParse(body).success).toBe(true);
    }
  });

  describe("Gegenprobe gegen die alte Ansicht", () => {
    const ALTE = alteAufrufe();
    const ALTE_HANDLUNGEN = ALTE.filter((a) => !(a.method === "GET" && a.pfad === ""));

    it("die alte Ansicht wurde gelesen: genau ein GET zum Laden, dazu die Handlungen", () => {
      expect(ALTE.filter((a) => a.method === "GET")).toEqual([{ pfad: "", method: "GET", body: undefined, jsonKopf: false }]);
      expect(ALTE_HANDLUNGEN.length).toBeGreaterThan(0);
    });

    it("jede Art außer „stornieren“ steht dort mit derselben Adresse, Methode und demselben Körper", () => {
      for (const art of ARTEN.filter((a) => a !== "stornieren")) {
        const treffer = ALTE_HANDLUNGEN.filter((alt) => gleich(alt, art));
        expect({ art, treffer: treffer.length }).toEqual({ art, treffer: 1 });
      }
    });

    it("„erinnern“ und „offboarding-anlegen“: POST ohne Körper und ohne Content-Type — dort wie hier", () => {
      for (const [art, pfad] of [
        ["erinnern", "/reminder"],
        ["offboarding-anlegen", "/nicht-uebernehmen"],
      ] as const) {
        expect(ALTE_HANDLUNGEN.find((a) => a.pfad === pfad)).toEqual({ pfad, method: "POST", body: undefined, jsonKopf: false });
        expect(vertragsendeAufruf(art, ID, WERTE).body).toBeUndefined();
      }
    });

    it("umgekehrt: jeder Aufruf der alten Ansicht hat seine Art in der neuen Tabelle", () => {
      for (const alt of ALTE_HANDLUNGEN) {
        const arten = ARTEN.filter((art) => gleich(alt, art));
        expect({ alt: `${alt.method} ${alt.pfad || "/"}`, arten: arten.length }).toEqual({ alt: `${alt.method} ${alt.pfad || "/"}`, arten: 1 });
        // Mit Körper schickte die alte Ansicht immer den JSON-Kopf — `aufrufen` tut es auch.
        expect(alt.jsonKopf).toBe(Boolean(alt.body));
      }
    });

    it("„stornieren“ ist neu (P-F2) — die alte Ansicht kannte es nicht", () => {
      expect(ALTE_HANDLUNGEN.filter((alt) => gleich(alt, "stornieren"))).toEqual([]);
    });
  });

  it("„stornieren“: PATCH auf STORNIERT, und die Route erlaubt das aus jedem offenen Status", () => {
    expect(vertragsendeAufruf("stornieren", ID)).toMatchObject({ method: "PATCH", body: { status: "STORNIERT" } });
    const offen = ALLE_STATUS.filter((s) => !["ABGESCHLOSSEN", "STORNIERT"].includes(s));
    expect(offen.length).toBeGreaterThan(0);
    for (const status of offen) {
      expect({ status, erlaubt: CONTRACT_END_UEBERGAENGE[status].includes("STORNIERT") }).toEqual({ status, erlaubt: true });
    }
    // Und überall, wo die Seite „stornieren“ anbietet, nimmt die Route es an.
    for (const s of LAGEN) {
      if (vertragsendeMenue(s, JETZT).includes("stornieren")) {
        expect({ status: s.status, erlaubt: CONTRACT_END_UEBERGAENGE[s.status].includes("STORNIERT") }).toEqual({
          status: s.status,
          erlaubt: true,
        });
      }
    }
  });

  it("die Zielstatus der PATCH-Aufrufe sind Status des Moduls", () => {
    for (const art of ARTEN) {
      const status = vertragsendeAufruf(art, ID).body?.status;
      if (status !== undefined) expect(ALLE_STATUS).toContain(status);
    }
  });
});

// =============================================
// aufrufen
// =============================================

type Antwort = { ok: boolean; status?: number; json: () => Promise<unknown> };

describe("aufrufen", () => {
  const original = global.fetch;
  let fetchMock: jest.Mock;

  function antwort(ok: boolean, daten: unknown | (() => Promise<unknown>)): Antwort {
    return { ok, status: ok ? 200 : 409, json: typeof daten === "function" ? (daten as () => Promise<unknown>) : async () => daten };
  }
  const keinJson = async () => {
    throw new SyntaxError("Unexpected token < in JSON");
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = original;
  });

  it("ok: liefert die Antwort der Route", async () => {
    fetchMock.mockResolvedValue(antwort(true, { id: ID, status: "ABGESCHLOSSEN" }));
    await expect(aufrufen(vertragsendeAufruf("abschliessen", ID))).resolves.toEqual({
      ok: true,
      daten: { id: ID, status: "ABGESCHLOSSEN" },
    });
  });

  it("ok ohne lesbares JSON: trotzdem ok, ohne Daten", async () => {
    fetchMock.mockResolvedValue(antwort(true, keinJson));
    await expect(aufrufen(vertragsendeAufruf("erinnern", ID))).resolves.toEqual({ ok: true, daten: null });
  });

  it("Fehler mit Text der Route: genau dieser Text", async () => {
    fetchMock.mockResolvedValue(antwort(false, { error: "Ungültige E-Mail-Adresse" }));
    await expect(aufrufen(vertragsendeAufruf("anfrage-senden", ID, WERTE))).resolves.toEqual({
      ok: false,
      fehler: "Ungültige E-Mail-Adresse",
    });
  });

  it("Fehler ohne brauchbaren Text: der Ersatztext der Art", async () => {
    const ohneText: unknown[] = [{}, { error: "" }, { error: 42 }, { error: null }, { message: "x" }, null, "Fehler", [], 0];
    for (const art of ARTEN) {
      const aufruf = vertragsendeAufruf(art, ID, WERTE);
      for (const daten of ohneText) {
        fetchMock.mockResolvedValueOnce(antwort(false, daten));
        await expect(aufrufen(aufruf)).resolves.toEqual({ ok: false, fehler: aufruf.ersatzFehler });
      }
      fetchMock.mockResolvedValueOnce(antwort(false, keinJson));
      await expect(aufrufen(aufruf)).resolves.toEqual({ ok: false, fehler: aufruf.ersatzFehler });
    }
  });

  it("Netz weg: Verbindungsfehler, wirft nie", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(aufrufen(vertragsendeAufruf("stornieren", ID))).resolves.toEqual({ ok: false, fehler: VERBINDUNGSFEHLER });
    fetchMock.mockImplementation(() => {
      throw new Error("synchron");
    });
    await expect(aufrufen(vertragsendeAufruf("stornieren", ID))).resolves.toEqual({ ok: false, fehler: VERBINDUNGSFEHLER });
    expect(VERBINDUNGSFEHLER.trim()).not.toBe("");
    expect(VERBINDUNGSFEHLER).not.toMatch(/\b(Sie|du)\b/);
  });

  // Versandergebnis: `/supervisor-link` und `/reminder` nennen `mailStatus`
  // (src/lib/contract-end-versand.ts) — bei Erfolg wie bei Fehlschlag.
  it("mailStatus der Antwort geht in beide Ergebnisse — bei Erfolg und bei Fehler", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: ID, supervisorEmail: "fuehrung@example.org", mailStatus: "WEBHOOK" }),
    });
    await expect(aufrufen(vertragsendeAufruf("anfrage-senden", ID, WERTE))).resolves.toEqual({
      ok: true,
      daten: { id: ID, supervisorEmail: "fuehrung@example.org", mailStatus: "WEBHOOK" },
      mailStatus: "WEBHOOK",
    });

    for (const [status, mailStatus] of [
      [502, "FAILED"],
      [409, "SKIPPED"],
    ] as const) {
      fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({ error: "Nicht zugestellt.", mailStatus }) });
      await expect(aufrufen(vertragsendeAufruf("anfrage-senden", ID, WERTE))).resolves.toEqual({
        ok: false,
        fehler: "Nicht zugestellt.",
        mailStatus,
      });
    }
    // Auch ohne Fehlertext der Route: Ersatztext UND mailStatus.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ mailStatus: "FAILED" }) });
    const erinnern = vertragsendeAufruf("erinnern", ID);
    await expect(aufrufen(erinnern)).resolves.toEqual({ ok: false, fehler: erinnern.ersatzFehler, mailStatus: "FAILED" });
  });

  it("ohne mailStatus fehlt das Feld ganz — nicht als undefined", async () => {
    fetchMock.mockResolvedValueOnce(antwort(true, { ok: true }));
    const ok = await aufrufen(vertragsendeAufruf("erinnern", ID));
    expect(Object.keys(ok).sort()).toEqual(["daten", "ok"]);
    fetchMock.mockResolvedValueOnce(antwort(false, { error: "Ungültige E-Mail-Adresse" }));
    const fehler = await aufrufen(vertragsendeAufruf("anfrage-senden", ID, WERTE));
    expect(Object.keys(fehler).sort()).toEqual(["fehler", "ok"]);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(Object.keys(await aufrufen(vertragsendeAufruf("erinnern", ID))).sort()).toEqual(["fehler", "ok"]);
  });

  it("schickt Adresse und Methode; Content-Type und Körper nur, wenn die Art einen Körper hat", async () => {
    for (const art of ARTEN) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(antwort(true, {}));
      const aufruf = vertragsendeAufruf(art, ID, WERTE);
      await aufrufen(aufruf);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect({ art, url, method: init.method }).toEqual({ art, url: TABELLE[art].url, method: TABELLE[art].method });
      if (TABELLE[art].body) {
        expect(init.headers).toEqual({ "Content-Type": "application/json" });
        expect(typeof init.body).toBe("string");
        expect(JSON.parse(init.body as string)).toEqual(TABELLE[art].body);
      } else {
        expect({ art, schluessel: Object.keys(init).sort() }).toEqual({ art, schluessel: ["method"] });
      }
    }
  });
});

// =============================================
// Versandergebnis: mailStatus und Meldungen
// =============================================

describe("Versandergebnis", () => {
  it("mailStatusAus: nur ein nicht leerer Text aus einem Objekt, sonst undefined", () => {
    expect(mailStatusAus({ mailStatus: "SENT" })).toBe("SENT");
    expect(mailStatusAus({ mailStatus: " WEBHOOK " })).toBe("WEBHOOK");
    expect(mailStatusAus({ error: "x", mailStatus: "FAILED" })).toBe("FAILED");
    for (const daten of [null, undefined, "SENT", 0, [], [{ mailStatus: "SENT" }], {}, { mailStatus: "" }, { mailStatus: "  " }, { mailStatus: 1 }, { mailStatus: null }]) {
      expect({ daten, status: mailStatusAus(daten) }).toEqual({ daten, status: undefined });
    }
  });

  it("Anfrage: SENT, fehlend (älterer Server) oder unbekannt – wie bisher „gesendet“", () => {
    for (const status of ["SENT", undefined, "UNBEKANNT"]) {
      expect(anfrageMeldung("fuehrung@example.org", false, status)).toBe("Anfrage an fuehrung@example.org gesendet.");
      expect(anfrageMeldung("fuehrung@example.org", true, status)).toBe("Neue Anfrage an fuehrung@example.org gesendet.");
    }
  });

  it("Anfrage über den Webhook: sagt nicht „gesendet“, sondern wohin sie ging und warum", () => {
    expect(anfrageMeldung("fuehrung@example.org", false, "WEBHOOK")).toBe(
      "Anfrage für fuehrung@example.org an den Webhook weitergegeben (die E-Mail-Vorlage im Portal ist ausgeschaltet).",
    );
    expect(anfrageMeldung("fuehrung@example.org", true, "WEBHOOK")).toBe(
      "Neue Anfrage für fuehrung@example.org an den Webhook weitergegeben (die E-Mail-Vorlage im Portal ist ausgeschaltet).",
    );
  });

  it("Erinnerung: SENT/fehlend wie bisher, WEBHOOK mit eigenem Satz", () => {
    expect(erinnerungMeldung("SENT")).toBe("Erinnerung an die Führungskraft gesendet.");
    expect(erinnerungMeldung(undefined)).toBe("Erinnerung an die Führungskraft gesendet.");
    expect(erinnerungMeldung("WEBHOOK")).toBe(
      "Erinnerung an den Webhook weitergegeben (die E-Mail-Vorlage im Portal ist ausgeschaltet).",
    );
  });

  it("Sprache der Meldungen: keine Anrede, ein Satz mit Punkt", () => {
    const meldungen = [
      ...[false, true].flatMap((neu) => ["SENT", "WEBHOOK", undefined].map((s) => anfrageMeldung("a@b.de", neu, s))),
      ...["SENT", "WEBHOOK", undefined].map((s) => erinnerungMeldung(s)),
    ];
    for (const meldung of meldungen) {
      expect(meldung).not.toMatch(/\b(Sie|Ihr|Ihre|du|dein|deine)\b/);
      expect(meldung).toMatch(/\.$/);
      expect(meldung).toBe(meldung.trim());
    }
  });
});
