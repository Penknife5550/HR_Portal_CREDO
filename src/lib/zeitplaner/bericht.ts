/**
 * Zeitplaner — Auswertung eines Laufs fuer Protokoll und Berichtsmail.
 *
 * Rein, ohne Uhr, client-sicher. Portiert die Auswertungen der frueheren
 * n8n-Workflows (Code-Knoten „Ergebnis auswerten“) ins Portal.
 *
 * Datensparsamkeit: Die Auswertung traegt nur Zaehler und zusammengefasste
 * Einzelschritte („2 × Warnung · versendet“) — nie Namen, Adressen,
 * Vorgangsnummern oder Tokens. Sie landet im Protokoll (90 Tage), in der
 * Berichtsmail und damit in jedem Webhook auf `automatischer-lauf-bericht`.
 */

import { escapeHtml } from "@/lib/email-layout";
import { AUSLOESER_TEXTE, ERGEBNIS_TEXTE, type LaufAusloeser, type LaufDefinition, type LaufSchluessel } from "./katalog";

/** Eine Zeile der Zaehler-Tabelle: Bezeichnung, Wert, rot hervorheben? */
export type ZaehlerZeile = [string, number | string, boolean?];

export interface LaufAuswertung {
  ergebnis: "OK" | "PROBLEME" | "FEHLER";
  zaehler: ZaehlerZeile[];
  schritte: string[];
  hinweis: string | null;
  /** Mails, die hinausgingen (im Probelauf: geplant) — fuer „Bericht auch bei Erfolg“. */
  versendet: number;
}

type Koerper = Record<string, unknown>;

/**
 * Liest die Antwort eines Laufs und merkt sich jedes erwartete Feld, das fehlt
 * oder die falsche Form hat. Frueher wurde ein fehlendes Feld still zu 0 — ein
 * umbenanntes `errors` meldete dann „ohne Befund“. Jetzt macht laufAuswerten
 * daraus ein Problem mit Bericht (Antwort unvollstaendig, Feldnamen genannt).
 */
export class AntwortLeser {
  constructor(
    private readonly werte: Koerper,
    private readonly pfad: string = "",
    readonly fehlend: string[] = [],
  ) {}

  private feld(schluessel: string): string {
    return this.pfad ? `${this.pfad}.${schluessel}` : schluessel;
  }

  /** Pflichtfeld: endliche Zahl. */
  zahl(schluessel: string): number {
    const wert = this.werte[schluessel];
    if (typeof wert === "number" && Number.isFinite(wert)) return wert;
    this.fehlend.push(this.feld(schluessel));
    return 0;
  }

  /** Pflichtfeld: Objekt. Fehlt es, werden seine Felder nicht einzeln gemeldet. */
  objekt(schluessel: string): AntwortLeser {
    const wert = this.werte[schluessel];
    if (wert && typeof wert === "object" && !Array.isArray(wert)) {
      return new AntwortLeser(wert as Koerper, this.feld(schluessel), this.fehlend);
    }
    this.fehlend.push(this.feld(schluessel));
    return new AntwortLeser({}, this.feld(schluessel), []);
  }

  /** Pflichtfeld: Liste. */
  liste(schluessel: string): Koerper[] {
    const wert = this.werte[schluessel];
    if (Array.isArray(wert)) return wert as Koerper[];
    this.fehlend.push(this.feld(schluessel));
    return [];
  }

  /** Freies Feld (darf fehlen oder null sein). */
  roh(schluessel: string): unknown {
    return this.werte[schluessel];
  }
}

/** Gleiche Eintraege zaehlen: ["a","b","a"] → ["2 × a", "1 × b"] (sortiert). */
export function gruppieren(eintraege: string[]): string[] {
  const zaehlung = new Map<string, number>();
  for (const e of eintraege) zaehlung.set(e, (zaehlung.get(e) ?? 0) + 1);
  return [...zaehlung]
    .sort((a, b) => a[0].localeCompare(b[0], "de"))
    .map(([text, n]) => `${n} × ${text}`);
}

const STUFE: Record<string, string> = { INFO: "Info", WARNING: "Warnung", ESCALATION: "Eskalation" };
const VERSAND: Record<string, string> = {
  SENT: "versendet",
  WEBHOOK: "an Webhook übergeben",
  SKIPPED: "nicht versendet (Vorlage aus oder ohne Empfänger)",
  FAILED: "fehlgeschlagen",
};
const HINWEIS_ERINNERUNGEN =
  "Nicht zugestellte Mails stehen im Versandprotokoll (Einstellungen → E-Mail-Versand). Fehlgeschlagene versucht der nächste Lauf erneut, übersprungene (Vorlage aus oder ohne Empfänger) erst nach dem nächsten Abstand.";

/** Versuche und Uebersprungene der Abteilungserinnerungen (On- und Offboarding) ohne Namen. */
function abteilungsSchritte(ergebnis: AntwortLeser, praefix: string): { schritte: string[]; nicht: number; uebersprungen: number } {
  const versuche = ergebnis.liste("details");
  const uebersprungen = ergebnis.liste("uebersprungen");
  const schritte = [
    ...versuche.map(
      (d) => `${praefix} · ${STUFE[String(d.level)] ?? String(d.level ?? "–")} · ${VERSAND[String(d.status)] ?? String(d.status ?? "–")}`,
    ),
    ...uebersprungen.map((u) => `${praefix} übersprungen · ${String(u.grund ?? "–")}`),
  ];
  const nicht = versuche.filter((d) => d.status === "FAILED" || d.status === "SKIPPED").length;
  return { schritte: gruppieren(schritte), nicht, uebersprungen: uebersprungen.length };
}

// ---------------------------------------------
// Auswertung je Lauf
// ---------------------------------------------

type Auswerter = (b: AntwortLeser, probelauf: boolean) => Omit<LaufAuswertung, "ergebnis"> & { problem: boolean };

const UNTERLAGEN_SCHRITT: Record<string, string> = {
  LESEN: "Lesen",
  ERGEBNIS: "Ergebnis nachgetragen",
  ZURUECKZIEHEN: "Zurückziehen (Vorgang abgelaufen)",
  VOLLSTAENDIG: "HR-Meldung „vollständig“",
  NACHHOLEN: "Mail nachgeholt",
  ERINNERUNG: "Erinnerung an die Person",
  FRIST_VERSTRICHEN: "HR-Meldung „Frist verstrichen“",
  AUFRAEUMEN: "Aufräumen",
  SPERRE: "Vorgang gesperrt",
};
const UNTERLAGEN_ANLASS: Record<string, string> = { VORAB: "7 Tage vorher", FRISTTAG: "am Fristtag" };
const UNTERLAGEN_STATUS: Record<string, string> = {
  SENT: "versendet",
  SKIPPED: "übersprungen (Vorlage oder Empfänger)",
  FAILED: "fehlgeschlagen",
  NACHWEIS_FEHLT: "versendet, Nachweis nicht gespeichert",
  GEBREMST: "zurückgehalten (SMTP-Bremse)",
  GEPLANT: "geplant",
  ERLEDIGT: "erledigt",
  UEBERSPRUNGEN: "übersprungen (Vorgang gesperrt)",
  FEHLER: "Fehler",
};

const AUSWERTER: Record<LaufSchluessel, Auswerter> = {
  "unterlagen-fristen": (b) => {
    const e = b.objekt("erinnerungen");
    const h = b.objekt("hrMeldungen");
    const a = b.objekt("aufgeraeumt");
    const nicht = b.zahl("nichtZugestellt");
    const ueber = b.zahl("mailUebersprungen");
    const loeschFehler = a.zahl("fehler");
    const fehler = b.zahl("errors");
    return {
      problem: fehler + nicht + ueber + loeschFehler > 0,
      versendet: b.zahl("total"),
      zaehler: [
        ["Erinnerungen 7 Tage vor der Frist", e.zahl("vorab")],
        ["Erinnerungen am Fristtag", e.zahl("fristtag")],
        ["HR-Meldung „vollständig“ nachgeholt", h.zahl("vollstaendigNachgeholt")],
        ["HR-Meldung „Frist verstrichen“", h.zahl("fristVerstrichen")],
        ["Gescheiterte Mails nachgeholt", b.zahl("nachgeholt")],
        ["Nicht zugestellt", nicht, nicht > 0],
        ["Übersprungen (Vorlage oder Empfänger)", ueber, ueber > 0],
        ["Vorgang gesperrt, morgen erneut", b.zahl("uebersprungen")],
        ["Zurückgezogen (Vorgang abgelaufen)", b.zahl("zurueckgezogen")],
        ["Gelöscht: Dateien / Entwürfe / Reste", `${a.zahl("dateien")} / ${a.zahl("entwuerfe")} / ${a.zahl("waisen")}`],
        ["Löschen fehlgeschlagen", loeschFehler, loeschFehler > 0],
        ["Fehler", fehler, fehler > 0],
      ],
      schritte: gruppieren(
        b.liste("details").map((d) =>
          [
            UNTERLAGEN_SCHRITT[String(d.schritt)] ?? d.schritt,
            d.anlass ? (UNTERLAGEN_ANLASS[String(d.anlass)] ?? d.anlass) : null,
            UNTERLAGEN_STATUS[String(d.status)] ?? d.status,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
      hinweis:
        "Nicht zugestellte Mails holt der nächste Lauf nach (höchstens dreimal). Übersprungene: Vorlagen der Gruppe „Unterlagen“ unter Einstellungen → E-Mail-Versand prüfen. Fehlgeschlagenes Löschen versucht der nächste Lauf erneut.",
    };
  },

  "dokument-ablauf": (b) => {
    const nicht = b.zahl("nichtZugestellt");
    const ueber = b.zahl("mailUebersprungen");
    const fehler = b.zahl("fehler");
    return {
      problem: fehler + nicht + ueber > 0,
      versendet: b.zahl("erinnerungen"),
      zaehler: [
        ["Nachweise geprüft", b.zahl("geprueft")],
        ["Erinnerungen an HR versendet", b.zahl("erinnerungen")],
        ["Als abgelaufen markiert", b.zahl("abgelaufenMarkiert")],
        ["Nicht zugestellt (der nächste Lauf versucht es erneut)", nicht, nicht > 0],
        ["Übersprungen (Vorlage aus oder ohne An-Feld)", ueber, ueber > 0],
        ["Fehler", fehler, fehler > 0],
      ],
      schritte: [],
      hinweis:
        ueber > 0
          ? "Übersprungen heißt: Die Erinnerung ging an niemanden. Unter Einstellungen → E-Mail-Versand die Vorlagen „Befristeter Nachweis läuft ab“ und „Befristeter Nachweis ist abgelaufen“ prüfen: aktiv und mit An-Feld?"
          : null,
    };
  },

  reminders: (b) => {
    const abt = b.objekt("departmentReminders");
    const s = abteilungsSchritte(abt, "Abteilung");
    const nicht = b.zahl("notSent");
    const fehler = b.zahl("errors") + abt.zahl("errors");
    const versendet = b.zahl("employeeReminders") + b.zahl("supervisorReminders") + abt.zahl("remindersProcessed");
    return {
      problem: nicht + s.nicht + fehler > 0,
      versendet,
      zaehler: [
        ["Fragebogen (Mitarbeitende)", b.zahl("employeeReminders")],
        ["Einstellungsmodalitäten (Führungskräfte)", b.zahl("supervisorReminders")],
        ["Aufgaben von Abteilungen", abt.zahl("remindersProcessed")],
        ["Fragebogen/Modalitäten nicht zugestellt", nicht, nicht > 0],
        ["Abteilungen nicht zugestellt", s.nicht, s.nicht > 0],
        ["Abteilungen übersprungen", s.uebersprungen],
        ["Fehler", fehler, fehler > 0],
      ],
      schritte: s.schritte,
      hinweis: HINWEIS_ERINNERUNGEN,
    };
  },

  "offboarding-reminders": (b) => {
    const s = abteilungsSchritte(b, "Abteilung");
    const fehler = b.zahl("errors");
    return {
      problem: s.nicht + fehler > 0,
      versendet: b.zahl("remindersProcessed"),
      zaehler: [
        ["Erinnerungen an Abteilungen", b.zahl("remindersProcessed")],
        ["Nicht zugestellt", s.nicht, s.nicht > 0],
        ["Übersprungen", s.uebersprungen],
        ["Fehler", fehler, fehler > 0],
      ],
      schritte: s.schritte,
      hinweis: HINWEIS_ERINNERUNGEN,
    };
  },

  "civil-service-deadlines": (b) => {
    const warnungen = b.liste("warnings");
    const mailRoh = b.roh("mailStatus");
    const mail = mailRoh == null ? null : String(mailRoh);
    const nicht = mail !== null && mail !== "SENT";
    return {
      problem: nicht,
      versendet: mail === "SENT" ? 1 : 0,
      zaehler: [
        ["Vorgänge geprüft", b.zahl("processed")],
        ["Fristhinweise", warnungen.length],
        ["Sammelmail an HR", mail === null ? "keine nötig" : (VERSAND[mail] ?? mail), nicht],
      ],
      schritte: gruppieren(warnungen.map((w) => `Hinweis · ${String(w.severity ?? "–")}`)),
      hinweis: nicht
        ? "Die Sammelmail „Verbeamtung: Fristen“ ging nicht hinaus — Vorlage unter Einstellungen → E-Mail-Versand prüfen (aktiv, An-Feld). Der nächste Lauf schickt sie erneut."
        : null,
    };
  },

  "contract-end-reminders": (b) => {
    const fehler = b.zahl("errors");
    return {
      problem: fehler > 0,
      versendet: b.zahl("reminders") + b.zahl("eskalationen") + b.zahl("unbearbeitetHinweis"),
      zaehler: [
        ["Erinnerungen an Führungskräfte", b.zahl("reminders")],
        ["Eskalationen an HR", b.zahl("eskalationen")],
        ["Hinweise „unbearbeitet“ (montags)", b.zahl("unbearbeitetHinweis")],
        ["Übersprungen", b.zahl("skipped")],
        ["Fehler", fehler, fehler > 0],
      ],
      schritte: [],
      hinweis: fehler > 0 ? "Fehler stehen im Log des Portals (sudo docker compose logs app)." : null,
    };
  },

  "elternzeit-fristen": (b) => {
    const d = b.objekt("data");
    const nicht = d.zahl("mailsFehler");
    const ueber = d.zahl("mailsUebersprungen");
    const fehler = d.zahl("syncFehler") + d.zahl("eskalationsFehler");
    return {
      problem: nicht + ueber + fehler > 0,
      versendet: d.zahl("eskalationen") - nicht - ueber,
      zaehler: [
        ["Vorgänge geprüft", d.zahl("vorgaengeGeprueft")],
        ["Offene Fristen", d.zahl("offeneFristen")],
        ["Meldungen an HR (Stufe gestiegen)", d.zahl("eskalationen")],
        ["Nicht zugestellt", nicht, nicht > 0],
        ["Übersprungen (Vorlage oder Empfänger)", ueber, ueber > 0],
        ["Fehler", fehler, fehler > 0],
      ],
      schritte: [],
      hinweis:
        nicht + ueber > 0
          ? "Die Meldung kommt je Stufe nur einmal. Vorlage „Elternzeit-Frist eskaliert“ unter Einstellungen → E-Mail-Versand prüfen (aktiv, An-Feld)."
          : null,
    };
  },

  "bem-fristen": (b) => {
    const d = b.objekt("data");
    const nicht = d.zahl("mailsFehler");
    const ueber = d.zahl("mailsUebersprungen");
    const ohne = d.zahl("ohneEmpfaenger");
    return {
      problem: nicht + ueber + ohne > 0,
      versendet: d.zahl("mailsGesendet"),
      zaehler: [
        ["Fälle geprüft", d.zahl("faelleGeprueft")],
        ["Offene Fristen", d.zahl("offeneFristen")],
        ["Fälle mit gestiegener Stufe", d.zahl("eskalierteFaelle")],
        ["Mails an Beauftragte", d.zahl("mailsGesendet")],
        ["Nicht zugestellt", nicht, nicht > 0],
        ["Übersprungen (Vorlage aus)", ueber, ueber > 0],
        ["Fälle ohne freigegebene Beauftragte", ohne, ohne > 0],
      ],
      schritte: [],
      hinweis:
        nicht + ueber + ohne > 0
          ? "Nicht zugestellte Erinnerungen und Fälle ohne Beauftragte versucht der nächste Lauf erneut (Fälle ohne Beauftragte: Zugriff im Fall freigeben). Übersprungene kommen je Stufe nur einmal: Vorlage „BEM: Frist fällig“ unter Einstellungen → E-Mail-Versand aktivieren."
          : null,
    };
  },

  "bem-aufbewahrung": (b, probelauf) => {
    const d = b.objekt("data");
    // Der Probelauf zaehlt nur und traegt kein `fehler`.
    const fehler = probelauf ? 0 : d.zahl("fehler");
    return {
      problem: fehler > 0,
      versendet: 0,
      zaehler: probelauf
        ? [
            ["Fälle mit abgelaufener Frist", d.zahl("faelligGeprueft")],
            ["Würde löschen: Fälle / Dateien", `${d.zahl("wuerdeLoeschen")} / ${d.zahl("wuerdeDateienLoeschen")}`],
          ]
        : [
            ["Fälle mit abgelaufener Frist", d.zahl("faelligGeprueft")],
            ["Gelöscht: Fälle / Dateien", `${d.zahl("geloescht")} / ${d.zahl("dateienGeloescht")}`],
            ["Fehler", fehler, fehler > 0],
          ],
      schritte: [],
      hinweis: fehler > 0 ? "Fehlgeschlagene Löschungen versucht der nächste Lauf erneut." : null,
    };
  },

  "dokumente-aufbewahrung": (b, probelauf) => {
    // Der Probelauf zaehlt nur und traegt kein `fehler`.
    const fehler = probelauf ? 0 : b.zahl("fehler");
    return {
      problem: fehler > 0,
      versendet: 0,
      zaehler: probelauf
        ? [["Würde löschen (Dokumente)", b.zahl("wuerdeLoeschen")]]
        : [
            ["Gelöscht: Dokumente / Dateien / Ordner", `${b.zahl("geloescht")} / ${b.zahl("dateienGeloescht")} / ${b.zahl("ordnerGeloescht")}`],
            ["Fehler", fehler, fehler > 0],
          ],
      schritte: [],
      hinweis: fehler > 0 ? "Fehlgeschlagene Löschungen versucht der nächste Lauf erneut." : null,
    };
  },

  wartung: (b, probelauf) => ({
    problem: false,
    versendet: 0,
    zaehler: [
      [probelauf ? "Würde löschen: Versandprotokoll" : "Gelöscht: Versandprotokoll", b.zahl("emailLogs")],
      [probelauf ? "Würde löschen: Lauf-Protokolle" : "Gelöscht: Lauf-Protokolle", b.zahl("protokolle")],
    ],
    schritte: [],
    hinweis: null,
  }),
};

/**
 * Wertet das Ergebnis eines Laufs aus. Statuscode 409 (ein anderer Lauf
 * arbeitete noch) zaehlt als Problem, 5xx und fehlender Koerper als Fehler.
 */
export function laufAuswerten(
  schluessel: LaufSchluessel,
  status: number,
  body: unknown,
  probelauf: boolean,
): LaufAuswertung {
  if (status >= 500 || !body || typeof body !== "object") {
    return {
      ergebnis: "FEHLER",
      zaehler: [["Antwort des Laufs", `Status ${status}`, true]],
      schritte: [],
      hinweis: "Der Lauf ist abgebrochen. Einzelheiten stehen im Log des Portals (sudo docker compose logs app). Der nächste Lauf versucht es erneut.",
      versendet: 0,
    };
  }
  if (status === 409) {
    return {
      ergebnis: "PROBLEME",
      zaehler: [["Antwort des Laufs", "arbeitete bereits", true]],
      schritte: [],
      hinweis: "Ein anderer Lauf arbeitete noch. Nichts zu tun – der nächste Lauf holt alles nach.",
      versendet: 0,
    };
  }
  const leser = new AntwortLeser(body as Koerper);
  const { problem, ...rest } = AUSWERTER[schluessel](leser, probelauf);
  if (leser.fehlend.length > 0) {
    return {
      ...rest,
      ergebnis: "PROBLEME",
      zaehler: [...rest.zaehler, ["Antwort unvollständig – es fehlen", leser.fehlend.join(", "), true]],
      hinweis:
        "Die Antwort des Laufs hat nicht die erwartete Form, die Zähler oben sind deshalb unvollständig. Bitte an die IT melden (Auswertung in src/lib/zeitplaner/bericht.ts an die Antwort des Laufs anpassen).",
    };
  }
  return { ergebnis: problem ? "PROBLEME" : "OK", ...rest };
}

/** Braucht dieser Lauf eine Berichtsmail? */
export function berichtNoetig(
  auswertung: LaufAuswertung,
  opts: { probelauf: boolean; berichtBeiErfolg: boolean },
): boolean {
  if (auswertung.ergebnis !== "OK") return true;
  if (opts.probelauf) return true;
  return opts.berichtBeiErfolg && auswertung.versendet > 0;
}

// ---------------------------------------------
// Payload der Berichtsmail
// ---------------------------------------------

const esc = (wert: unknown): string => escapeHtml(String(wert ?? ""));

export function tabelleHtml(zeilen: ZaehlerZeile[]): string {
  const tr = zeilen
    .map(
      ([bezeichnung, wert, rot]) =>
        `<tr><td style="padding:2px 16px 2px 0;vertical-align:top">${esc(bezeichnung)}</td>` +
        `<td style="padding:2px 0;text-align:right;vertical-align:top;font-weight:bold${rot ? ";color:#E2001A" : ""}">${esc(wert)}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;margin:0 0 12px">${tr}</table>`;
}

export function tabelleText(zeilen: ZaehlerZeile[]): string {
  return zeilen.map(([bezeichnung, wert]) => `${bezeichnung}: ${wert}`).join("\n");
}

/** Hoechstens so viele Einzelschritte in Protokoll und Mail. */
export const MAX_SCHRITTE = 40;

export function berichtPayload(opts: {
  definition: LaufDefinition;
  auswertung: LaufAuswertung;
  probelauf: boolean;
  ausloeser: LaufAusloeser;
  /** "TT.MM.JJJJ" (deutsche Zeit) */
  datum: string;
  /** "HH:MM" (deutsche Zeit) */
  uhrzeit: string;
  portalLink: string;
  hrPostfach: string;
}): Record<string, string> {
  const { auswertung } = opts;
  const schritte = auswertung.schritte.slice(0, MAX_SCHRITTE);
  const rest = auswertung.schritte.length - schritte.length;
  return {
    lauf: opts.definition.schluessel,
    lauf_name: opts.definition.name,
    datum: opts.datum,
    uhrzeit: opts.uhrzeit,
    ausloeser: AUSLOESER_TEXTE[opts.ausloeser],
    ergebnis: ERGEBNIS_TEXTE[auswertung.ergebnis],
    // Merker als Zeichenkette: renderTemplate kennt nur „nicht leer“.
    ist_probelauf: opts.probelauf ? "ja" : "",
    hat_probleme: auswertung.ergebnis === "PROBLEME" ? "ja" : "",
    ist_fehler: auswertung.ergebnis === "FEHLER" ? "ja" : "",
    tabelle_html: tabelleHtml(auswertung.zaehler),
    tabelle_text: tabelleText(auswertung.zaehler),
    schritte_text: [...schritte, ...(rest > 0 ? [`… und ${rest} weitere`] : [])].join("\n"),
    hinweis: auswertung.ergebnis === "OK" ? "" : (auswertung.hinweis ?? ""),
    portalLink: opts.portalLink,
    hr_postfach: opts.hrPostfach,
  };
}
