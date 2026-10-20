/**
 * Abnahme Pilot Vertragsende im echten Browser — Feinplan Abschnitt 7,
 * Punkte 4 bis 7 (docs/module/ux-ui/pilot-feinplan.md), soweit sie nicht von
 * Texten abhaengen.
 *
 *   A. Rollen (Punkt 5): HR-Leitung und Sachbearbeitung sehen Knoepfe, Menue,
 *      „Stand setzen …" und den Reiter E-Mails. Einrichtungsleitung und
 *      Fuehrungskraft: was die Seite MIT Zugriff auf den Mandanten zeigt, was
 *      OHNE (fremder Mandant), und — mit einer simulierten Antwort der
 *      Schnittstelle — ob sie nur lesend gezeichnet wird (siehe unten).
 *   B. Tastatur (Punkt 6): Sprunglink → Pfad → Menue → Leiste → Reiter,
 *      Pfeiltasten in den Reitern (Adresse `?tab=`), Menue mit Enter, Dialog
 *      mit Fokus auf „Abbrechen", Escape gibt den Fokus an den Ausloeser.
 *   C. Beide Straenge (Punkt 4) per Klick in der NEUEN Ansicht, als
 *      Sachbearbeitung (ohne Admin-Abkuerzung bei Abschluss und Storno):
 *      T01 Anfrage (scheitert, siehe unten) → Zustellung nachgestellt →
 *      Anfrage neu senden (scheitert: Lage „nicht zugestellt") → nachgestellt
 *      → Erinnerung (scheitert) → Formular der Fuehrungskraft (oeffentliche
 *      Route) → Vertrag erfassen → Stand der MAV → Abschluss; T06 Offboarding
 *      → Abschluss; T02 Storno. Je Schritt: Status aus der GET-Antwort, neue
 *      Eintraege im AuditLog, die schreibenden Aufrufe der Seite samt Antwort
 *      der Route, die Meldung. Erwartet wird, was die Routen schreiben (aus dem
 *      Quelltext gelesen).
 *   F. Gegenprobe (Punkt 4): dieselben Schritte, soweit die ALTE Ansicht sie
 *      anbietet (T01 ganz — auch „Anfrage erneut senden", das sie ohne
 *      Rueckfrage anbietet —, T06 Offboarding), auf frischen Testdaten —
 *      AuditLog, Aufrufe und Antworten muessen gleich sein. Ohne Gegenstueck
 *      bleiben nur Dinge der neuen Ansicht selbst: Text der Rueckfrage, Pille,
 *      „Jetzt dran", Zeile „Anfrage vom" (verglichen werden nur die
 *      gemeinsamen Schritte).
 *   D. Schalter (Punkte 2 und 7): ohne Cookie alt mit „Neue Ansicht
 *      ausprobieren", hin und zurueck (`?tab=` bleibt), ein zweiter
 *      Browser-Kontext ohne den Cookie bleibt alt.
 *   E. Am Ende IMMER: Rolle zurueck auf SUPER_ADMIN, Mandantenzugriff
 *      zurueckgenommen, Testdaten neu eingespielt, die Offboardings dieses
 *      Laufs geloescht — und geprueft, dass T01–T10 wieder in den
 *      Ausgangslagen stehen und die uebrigen Testvorgaenge (GYM) unberuehrt
 *      sind.
 *
 * OHNE MAILSERVER — NACH PLAN: Die Testumgebung (Dev und Docker) hat bewusst
 * keinen Mailserver (docs/module/ux-ui/prototyp-tag-leitfaden.md: „Es geht
 * keine Mail hinaus"; smtp_config.isActive = false, das Skript bricht sonst
 * ab). Seit 10/2026 werten `/supervisor-link` und `/reminder` das
 * Versandergebnis aus (src/lib/contract-end-versand.ts): Der Mailer meldet
 * FAILED „SMTP ist nicht konfiguriert …", die Routen antworten 502 mit
 * `mailStatus: "FAILED"`. Die Anfrage speichert trotzdem Adresse und NEUEN
 * Link (AuditLog SUPERVISOR_LINK_CREATED in der Transaktion vor dem Versand),
 * setzt aber `supervisorLinkSentAt` zurueck auf null — bei der ersten Anfrage
 * auch den Status zurueck auf ANGELEGT. Die Erinnerung zaehlt nichts und
 * schreibt kein AuditLog. Genau das prueft das Skript. Damit der Strang danach
 * weiterlaufen kann (Erinnerung und Formular verlangen eine zugestellte
 * Anfrage), STELLT ES DIE ZUSTELLUNG NACH: per Prisma, nur am T01-Vorgang
 * dieses Laufs (per id, nur mit passender T-Nummer und der Testadresse),
 * `status = ANFRAGE_VORGESETZTER` und `supervisorLinkSentAt = jetzt` — das,
 * was `/supervisor-link` bei zugestellter Mail stehen liesse. Die Ausgabe
 * nennt jedes Nachstellen.
 *
 * WARUM SIMULIERT (A): Einrichtungsleitung und Fuehrungskraft sind
 * mandantenbeschraenkt. Das Mandanten-Gate der Middleware
 * (src/lib/mandanten-gate.ts) laesst fuer diese Rollen nur `/api/auth` durch —
 * auch `GET /api/contract-end/[id]` bekommt 403, MIT Zuweisung des Mandanten
 * (`UserOrgAssignment`) genauso wie ohne. Mit echten Daten sehen beide Rollen
 * deshalb nur den Hinweis „Vorgang konnte nicht geladen werden". Damit die
 * lesende Ansicht trotzdem geprueft ist, beantwortet das Skript genau diesen
 * einen Aufruf mit der Antwort, die die HR-Leitung bekommt; die Rolle und
 * damit das Bearbeitungsrecht kommen unveraendert vom Server.
 *
 * DAS SKRIPT AENDERT DIE ENTWICKLUNGSDATENBANK: Rolle des Testkontos, eine
 * Mandantenzuweisung (nur waehrend A), die Testvorgaenge VE-…-T01 … T10 (ueber
 * scripts/vertragsende-testdaten.js, das nur T-Vorgaenge loescht) und zwei
 * Offboardings, die es selbst anlegt und am Ende wieder loescht. Es weigert
 * sich, wenn Datenbank oder Portal nicht lokal liegen, das Konto nicht auf
 * `@beispiel.invalid` endet, ein Mailserver aktiv ist oder ein Webhook
 * eingetragen ist — die Schritte loesen Mails aus. Ohne Mailserver geht keine
 * hinaus (im Versandprotokoll FAILED „SMTP ist nicht konfiguriert …" bzw.
 * SKIPPED; das Skript prueft es).
 *
 * VORAUSSETZUNGEN wie scripts/ux-abnahme.js (Entwicklungsserver auf
 * http://localhost:3000 gegen die Dev-DB, puppeteer-core, Chrome). Bis zu fuenf
 * Anmeldungen je Lauf; die Bremse der Anmeldung (5 je Minute, 10 je Konto und
 * Viertelstunde) wartet das Skript ab.
 *
 * AUFRUF (Git Bash, im Projektverzeichnis; das Passwort nie ausgeben)
 *   PW=$(node scripts/dev-passwort-neu.js claude-test-admin@beispiel.invalid | grep -E '^ {4}[A-Za-z0-9]{20}$' | tr -d ' ')
 *   DEV_EMAIL=claude-test-admin@beispiel.invalid DEV_PASSWORT="$PW" node scripts/ux-abnahme-pilot.js
 *
 * Ende mit Code 0, wenn alle Pruefungen stimmen, sonst 1. Die Ausgabe nennt
 * keine Namen der Testpersonen und keinen Link-Schluessel.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASIS = process.env.BASIS || "http://localhost:3000";
const EMAIL = process.env.DEV_EMAIL;
const PASSWORT = process.env.DEV_PASSWORT;
const PROJEKT = path.join(__dirname, "..");
/** Mandant der Testvorgaenge (LOGA-Nummer), wie beim Anlegen mit --mandant. */
const MANDANT = process.env.PILOT_MANDANT || "712";
const FUEHRUNGSKRAFT = "fuehrungskraft.test@beispiel.invalid";
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Status je Lage direkt nach scripts/vertragsende-testdaten.js. */
const AUSGANGSLAGEN = {
  T01: "ANGELEGT",
  T02: "ANFRAGE_VORGESETZTER",
  T03: "ANFRAGE_VORGESETZTER",
  T04: "RUECKMELDUNG_UEBERNAHME",
  T05: "VERTRAG_UNTERSCHRIEBEN",
  T06: "RUECKMELDUNG_KEINE_UEBERNAHME",
  T07: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
  T08: "ABGESCHLOSSEN",
  T09: "STORNIERT",
  T10: "ANGELEGT",
};

/**
 * Was die Routen je Schritt ins AuditLog schreiben — aus dem Quelltext gelesen
 * (`eintragKurz` bildet dieselbe Form): `/supervisor-link` mit Konto, in der
 * Transaktion VOR dem Versand — also auch, wenn die Mail danach ohne
 * Mailserver scheitert (Anfrage und „neu senden"). `/reminder` ueber
 * `sendSupervisorReminder` schreibt SUPERVISOR_REMINDER_SENT nur bei
 * zugestellter Mail (SENT/WEBHOOK); ohne Mailserver (FAILED) gar nichts. Das
 * Formular der Fuehrungskraft ohne Konto, der PATCH mit `status` als
 * STATUS_CHANGED, mit `mavStatus` als CONTRACT_END_UPDATED,
 * `/nicht-uebernehmen` als CONTRACT_END_NO_RENEWAL (dazu OFFBOARDING_CREATED
 * am neuen Offboarding, `createOffboardingProcess`). Das Nachstellen der
 * Zustellung (Prisma direkt) schreibt nichts.
 */
const ERWARTET_PROTOKOLL = {
  anfrage: ["SUPERVISOR_LINK_CREATED · Testkonto · Felder: organization, supervisorEmail"],
  "neu-senden": ["SUPERVISOR_LINK_CREATED · Testkonto · Felder: organization, supervisorEmail"],
  erinnern: [],
  formular: ["SUPERVISOR_DECISION_UEBERNAHME · ohne Konto · Felder: displayId, vorstandAbgestimmt, vorstandAbstimmungVermerk"],
  vertrag: ["STATUS_CHANGED · Testkonto · RUECKMELDUNG_UEBERNAHME → VERTRAG_UNTERSCHRIEBEN"],
  mav: ["CONTRACT_END_UPDATED · Testkonto · mavStatus=ANGEHOERT"],
  "abschluss-t01": ["STATUS_CHANGED · Testkonto · VERTRAG_UNTERSCHRIEBEN → ABGESCHLOSSEN"],
  offboarding: ["CONTRACT_END_NO_RENEWAL · Testkonto · Felder: decision, offboardingDisplayId, offboardingId"],
  "abschluss-t06": ["STATUS_CHANGED · Testkonto · ENTSCHEIDUNG_KEINE_UEBERNAHME → ABGESCHLOSSEN"],
  storno: ["STATUS_CHANGED · Testkonto · ANFRAGE_VORGESETZTER → STORNIERT"],
};

/** Die schreibenden Aufrufe je Schritt — `aufrufe.ts` und die alte Ansicht. */
const ERWARTET_AUFRUFE = {
  anfrage: [`POST /api/contract-end/:id/supervisor-link {"supervisorEmail":"${FUEHRUNGSKRAFT}"}`],
  "neu-senden": [`POST /api/contract-end/:id/supervisor-link {"supervisorEmail":"${FUEHRUNGSKRAFT}"}`],
  erinnern: ["POST /api/contract-end/:id/reminder"],
  vertrag: ['PATCH /api/contract-end/:id {"status":"VERTRAG_UNTERSCHRIEBEN"}'],
  mav: ['PATCH /api/contract-end/:id {"mavStatus":"ANGEHOERT"}'],
  "abschluss-t01": ['PATCH /api/contract-end/:id {"status":"ABGESCHLOSSEN"}'],
  offboarding: ["POST /api/contract-end/:id/nicht-uebernehmen"],
  "abschluss-t06": ['PATCH /api/contract-end/:id {"status":"ABGESCHLOSSEN"}'],
  storno: ['PATCH /api/contract-end/:id {"status":"STORNIERT"}'],
};

/**
 * Antworten der Routen auf die Versandschritte ohne Mailserver — aus dem
 * Quelltext: FAILED → `statusNichtZugestellt` = 502, `mailStatus` = FAILED
 * (`versandStatusAusErgebnis`). Die uebrigen Schritte vergleicht die
 * Gegenprobe nur alt gegen neu.
 */
const ERWARTET_ANTWORTEN = {
  anfrage: ["POST /api/contract-end/:id/supervisor-link → 502 (mailStatus FAILED)"],
  "neu-senden": ["POST /api/contract-end/:id/supervisor-link → 502 (mailStatus FAILED)"],
  erinnern: ["POST /api/contract-end/:id/reminder → 502 (mailStatus FAILED)"],
};

/**
 * Die Meldungen der Routen ohne Mailserver beginnen so
 * (`anfrageNichtZugestelltMeldung`, `erinnerungNichtZugestelltMeldung`; der
 * Grund kommt aus `sendEmailDetailed`). Ein frueher zugestellter Link wird
 * mit `ALTER_LINK_TOT` genannt — nur, wenn vorher `supervisorLinkSentAt`
 * gesetzt war.
 */
const ANFRAGE_OHNE_SMTP = "Die Anfrage an die Führungskraft konnte nicht versendet werden: SMTP ist nicht konfiguriert";
const ERINNERUNG_OHNE_SMTP = "Die Erinnerung konnte nicht versendet werden: SMTP ist nicht konfiguriert";
const ALTER_LINK_TOT = "Der zuvor versendete Link gilt nicht mehr.";
/** Was Chrome je gescheitertem Versand in die Konsole schreibt (Netzfehler, kein Skriptfehler). */
const NETZ_OHNE_SMTP = [
  "502 /api/contract-end/:id/supervisor-link",
  "502 /api/contract-end/:id/supervisor-link",
  "502 /api/contract-end/:id/reminder",
];
/** Versandprotokoll von T01 nach C bzw. F: je Versuch eine Zeile, keine zugestellt. */
const ERWARTET_MAILS_T01 = [
  "contract-end-supervisor-link FAILED (SMTP aus)",
  "contract-end-supervisor-link FAILED (SMTP aus)",
  "contract-end-supervisor-reminder FAILED (SMTP aus)",
];

/** Pfad einer Schnittstelle mit `:id` statt der Kennung. */
const pfadKurz = (pfad) => pfad.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");

function datenbankUrl() {
  for (const datei of [".env.local", ".env"]) {
    const p = path.join(PROJEKT, datei);
    if (!fs.existsSync(p)) continue;
    const zeile = fs.readFileSync(p, "utf8").split(/\r?\n/).find((z) => z.startsWith("DATABASE_URL="));
    if (zeile) return zeile.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
  }
  return null;
}

let fehler = 0;
let pruefungen = 0;
function pruefe(name, ist, soll) {
  pruefungen += 1;
  const gleich = JSON.stringify(ist) === JSON.stringify(soll);
  if (!gleich) fehler += 1;
  console.log(`${gleich ? "ok   " : "FEHLT"} ${name}${gleich ? "" : `\n        ist:  ${JSON.stringify(ist)}\n        soll: ${JSON.stringify(soll)}`}`);
}
/** Beobachtungen, die keine Pruefung des Skripts sind (am Ende gesammelt ausgegeben). */
const befunde = [];
const info = (text) => console.log(`      ${text}`);
const abschnitt = (titel) => console.log(`\n== ${titel}`);

/** Wartet, bis `bedingung()` etwas Wahres liefert. */
async function bis(bedingung, beschreibung, ms = 20000) {
  const ende = Date.now() + ms;
  for (;;) {
    const wert = await bedingung();
    if (wert) return wert;
    if (Date.now() > ende) throw new Error(`Zeitueberschreitung: ${beschreibung}`);
    await warte(250);
  }
}

(async () => {
  if (!EMAIL || !PASSWORT) throw new Error("DEV_EMAIL oder DEV_PASSWORT fehlt (Umgebungsvariablen).");
  if (!EMAIL.endsWith("@beispiel.invalid")) throw new Error("Nur fuer ein Testkonto auf @beispiel.invalid.");
  const portalHost = new URL(BASIS).hostname;
  if (portalHost !== "localhost" && portalHost !== "127.0.0.1") throw new Error(`Das Portal liegt auf "${portalHost}", nicht lokal.`);
  const url = datenbankUrl();
  const dbHost = url ? new URL(url).hostname : "";
  if (dbHost !== "localhost" && dbHost !== "127.0.0.1") throw new Error(`Die Datenbank liegt auf "${dbHost}", nicht lokal.`);

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const puppeteer = require("puppeteer-core");

  const konto = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, role: true } });
  if (!konto) throw new Error("Testkonto nicht gefunden.");
  const smtp = await prisma.smtpConfig.findFirst({ select: { isActive: true } });
  if (smtp?.isActive) throw new Error("Ein Mailserver ist aktiv (smtp_config.isActive) — die Schritte verschicken Mails. Abbruch.");
  if ((await prisma.webhookConfig.count()) > 0) throw new Error("Es sind Webhooks eingetragen — die Schritte loesten sie aus. Abbruch.");
  const mandant = await prisma.organization.findFirst({ where: { mandantNumber: MANDANT }, select: { id: true, shortName: true } });
  if (!mandant) throw new Error(`Kein Mandant ${MANDANT}.`);
  const TEST_NUMMER = new RegExp(`^VE-\\d{4}-${mandant.shortName}-T(\\d{2})$`);

  const rolleSetzen = (role) => prisma.user.update({ where: { id: konto.id }, data: { role } });
  const zuweisungenVorher = await prisma.userOrgAssignment.findMany({ where: { userId: konto.id }, select: { organizationId: true } });
  let zuweisungAngelegt = false;
  /** Offboardings dieses Laufs — am Ende geloescht. */
  const eigeneOffboardings = new Set();

  // ---------- Stand, der unberuehrt bleiben muss
  // Testnummern wie in scripts/vertragsende-testdaten.js (TEST_VORGANG, TEST_OFFBOARDING).
  const fremdeVertragsenden = async () =>
    (
      await prisma.contractEndProcess.findMany({
        where: { employeeEmail: { endsWith: "@beispiel.invalid" } },
        select: { id: true, displayId: true, status: true, updatedAt: true, offboardingId: true, _count: { select: { auditLogs: true } } },
        orderBy: { displayId: "asc" },
      })
    )
      .filter((v) => !/^VE-\d{4}-.+-T\d{2}$/.test(v.displayId))
      .map((v) => ({ ...v, updatedAt: v.updatedAt.toISOString() }));
  const fremdeOffboardings = async () =>
    (
      await prisma.offboardingProcess.findMany({
        where: { employeeEmail: { endsWith: "@beispiel.invalid" } },
        select: { id: true, displayId: true },
        orderBy: { id: "asc" },
      })
    )
      .filter((o) => !/^OFF-\d{4}-.+-T\d{2}$/.test(o.displayId))
      .map((o) => o.id);
  const unberuehrtVorher = await fremdeVertragsenden();
  const offboardingsVorher = await fremdeOffboardings();

  /**
   * Testdaten neu anlegen; ausgegeben werden nur Zeilen ohne Namen.
   * DATABASE_URL ausdruecklich mitgeben: `@prisma/client` hat beim Laden die
   * `.env` in `process.env` geschrieben (dort steht nicht die Dev-DB), und das
   * Testdaten-Skript nimmt die Umgebung vor `.env.local`.
   */
  function testdatenEinspielen() {
    const ausgabe = execFileSync(process.execPath, [path.join("scripts", "vertragsende-testdaten.js"), "--mandant", MANDANT], {
      cwd: PROJEKT,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url },
    });
    for (const zeile of ausgabe.split(/\r?\n/)) {
      if (/^(Entfernt|Dazu|Hinweis|Nicht gel)/.test(zeile)) info(`Testdaten: ${zeile}`);
    }
  }
  /** Die Testvorgaenge T01 … T10 aus der Datenbank, je Kuerzel. */
  async function testvorgaenge() {
    const alle = await prisma.contractEndProcess.findMany({
      where: { organizationId: mandant.id, displayId: { contains: "-T" } },
      select: { id: true, displayId: true, status: true },
    });
    const je = {};
    for (const v of alle) {
      const treffer = TEST_NUMMER.exec(v.displayId);
      if (treffer) je[`T${treffer[1]}`] = v;
    }
    return je;
  }

  /** Ein AuditLog-Eintrag in kurzer, vergleichbarer Form (ohne Werte mit Personenbezug). */
  function eintragKurz(e) {
    const d = e.details && typeof e.details === "object" ? e.details : {};
    const wer = e.userId === null ? "ohne Konto" : e.userId === konto.id ? "Testkonto" : "anderes Konto";
    let zusatz;
    if (e.action === "STATUS_CHANGED") zusatz = `${d.statusFrom} → ${d.statusTo}`;
    else if (e.action === "CONTRACT_END_UPDATED") zusatz = Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join(", ");
    else if (e.action === "OFFBOARDING_CREATED") zusatz = `herkunft=${d.herkunft}`;
    else zusatz = `Felder: ${Object.keys(d).sort().join(", ")}`;
    return `${e.action} · ${wer} · ${zusatz}`;
  }
  const protokollIds = async (where) => new Set((await prisma.auditLog.findMany({ where, select: { id: true } })).map((e) => e.id));
  async function protokollNeu(where, vorher) {
    const alle = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "asc" }, select: { id: true, action: true, userId: true, details: true } });
    return alle.filter((e) => !vorher.has(e.id)).map(eintragKurz);
  }

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const kontexte = [];

  /** Neuer Browser-Kontext, als `rolle` angemeldet. Die Rolle steht im Sitzungs-Token. */
  async function kontextMitRolle(rolle) {
    await rolleSetzen(rolle);
    const kontext = await browser.createBrowserContext();
    kontexte.push(kontext);
    const seite = await kontext.newPage();
    seite.setDefaultTimeout(30000);
    seite.setDefaultNavigationTimeout(90000);
    await seite.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    // Konsolenfehler. Eine Antwort 4xx/5xx meldet Chrome als Netzfehler
    // („Failed to load resource …", puppeteer reicht ihn als Konsolenfehler
    // durch) — der steht getrennt in `netzFehler` (Status und Pfad), weil die
    // Versandschritte ohne Mailserver ihn erwartbar ausloesen.
    seite.konsole = [];
    seite.netzFehler = [];
    seite.on("console", (m) => {
      if (m.type() !== "error") return;
      const netz = /^Failed to load resource: the server responded with a status of (\d+)/.exec(m.text());
      if (netz) {
        let pfad = "?";
        try {
          pfad = pfadKurz(new URL(m.location()?.url ?? "").pathname);
        } catch {
          // ohne Adresse bleibt „?"
        }
        seite.netzFehler.push(`${netz[1]} ${pfad}`);
      } else seite.konsole.push(m.text().slice(0, 200));
    });
    seite.on("pageerror", (e) => seite.konsole.push(`Skriptfehler: ${String(e.message).slice(0, 200)}`));
    // Schreibende Aufrufe der Seite (Methode, Pfad mit `:id`, Koerper), dazu
    // der Verlauf aller Aufrufe der Schnittstelle (auch GET, ohne Koerper —
    // zeigt, ob die Seite nach einem Aufruf neu geladen hat).
    seite.schreibend = [];
    seite.verlauf = [];
    seite.on("request", (req) => {
      const u = new URL(req.url());
      if (!u.pathname.startsWith("/api/") || u.pathname === "/api/auth") return;
      seite.verlauf.push(`${req.method()} ${pfadKurz(u.pathname)}`);
      if (req.method() === "GET") return;
      seite.schreibend.push(`${req.method()} ${pfadKurz(u.pathname)}${req.postData() ? ` ${req.postData()}` : ""}`);
    });
    // Antworten auf die schreibenden Aufrufe: Status und — falls die Route ihn
    // nennt — `mailStatus` (nie der uebrige Koerper, er traegt Namen).
    seite.antworten = [];
    seite.on("response", (res) => {
      const req = res.request();
      const u = new URL(res.url());
      if (req.method() === "GET" || !u.pathname.startsWith("/api/") || u.pathname === "/api/auth") return;
      const eintrag = { zeile: `${req.method()} ${pfadKurz(u.pathname)} → ${res.status()}`, mail: null };
      eintrag.fertig = res
        .json()
        .then((j) => {
          if (j && typeof j.mailStatus === "string") eintrag.mail = j.mailStatus;
        })
        .catch(() => {});
      seite.antworten.push(eintrag);
    });
    // Ein window.confirm der Seite: in der neuen Ansicht ein Fehler (abgelehnt
    // und gezaehlt), in der Gegenprobe mit der alten Ansicht bestaetigt.
    seite.fenster = [];
    seite.fensterBestaetigen = false;
    seite.on("dialog", (d) => {
      seite.fenster.push(d.type());
      void (seite.fensterBestaetigen ? d.accept() : d.dismiss());
    });
    await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
    for (let versuch = 1; ; versuch++) {
      const antwort = await seite.evaluate(
        async (e, p) => {
          const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }) });
          return { status: res.status, warten: Number(res.headers.get("retry-after") || 0) };
        },
        EMAIL,
        PASSWORT,
      );
      if (antwort.status === 200) break;
      if (antwort.status !== 429 || versuch >= 6) throw new Error(`Anmeldung als ${rolle} fehlgeschlagen (${antwort.status}).`);
      const sekunden = Math.min(Math.max(antwort.warten, 10), 120);
      info(`(Anmeldung gebremst, warte ${sekunden} s)`);
      await warte(sekunden * 1000);
    }
    return { kontext, seite };
  }

  /** Setzt oder loescht den Cookie der Ansicht — wie der Schalter (src/lib/ansicht.ts). */
  const ansichtSetzen = (seite, neu) =>
    seite.evaluate((zeile) => {
      document.cookie = zeile;
    }, neu ? "ansicht-vertragsende=neu; Max-Age=31536000; Path=/; SameSite=Lax" : "ansicht-vertragsende=; Max-Age=0; Path=/; SameSite=Lax");

  /** Oeffnet die Detailseite und wartet, bis die neue Ansicht steht (Leiste oder Ladefehler). */
  async function neuOeffnen(seite, id, suche = "") {
    await seite.goto(`${BASIS}/vorgaenge/vertragsende/${id}${suche}`, { waitUntil: "networkidle2" });
    await seite.waitForFunction(
      () =>
        document.querySelector("[data-prozessleiste]") ||
        [...document.querySelectorAll("main section[data-ton] h2")].some((h) => h.textContent.includes("konnte nicht geladen")),
      { timeout: 60000 },
    );
  }
  /** Die alte Ansicht steht, wenn die Vorgangsnummer oder ihr Ladefehler da ist. */
  const altWarten = (seite, vorgang) =>
    seite.waitForFunction(
      (nr) => document.body.innerText.includes(nr) || document.querySelector(".text-destructive"),
      { timeout: 60000 },
      vorgang.displayId,
    );
  async function altOeffnen(seite, vorgang) {
    await seite.goto(`${BASIS}/vorgaenge/vertragsende/${vorgang.id}`, { waitUntil: "networkidle2" });
    await altWarten(seite, vorgang);
  }

  /** Was die neue Ansicht zeigt — nur Bausteine und Texte von Knoepfen, keine Namen. */
  const ansichtLesen = (seite) =>
    seite.evaluate(() => {
      const text = (e) => e.textContent.replace(/\s+/g, " ").trim();
      const jetzt = document.querySelector("[data-jetzt-dran]");
      const ladefehler = [...document.querySelectorAll("main section[data-ton]")].find((s) =>
        (s.querySelector("h2")?.textContent ?? "").includes("konnte nicht geladen"),
      );
      return {
        leiste: Boolean(document.querySelector("[data-prozessleiste]")),
        jetztDran: Boolean(jetzt),
        jetztDranKnoepfe: jetzt ? [...jetzt.querySelectorAll("button, a")].map(text) : [],
        menueKnopf: Boolean(document.querySelector('button[aria-label="Weitere Aktionen"]')),
        standSetzen: [...document.querySelectorAll("main button")].some((b) => text(b) === "Stand setzen …"),
        reiter: [...document.querySelectorAll('[role="tab"]')].map(text),
        gewaehlterReiter: text(document.querySelector('[role="tab"][aria-selected="true"]') ?? document.createElement("i")),
        ende: document.querySelector("[data-ende]")?.getAttribute("data-ende") ?? null,
        ladefehler: ladefehler ? { titel: text(ladefehler.querySelector("h2")), text: text(ladefehler.querySelector("h2 + div") ?? ladefehler) } : null,
      };
    });

  /** Oeffnet das Menue „…", liest die Punkte, schliesst mit Escape. */
  async function menueLesen(seite) {
    await seite.click('button[aria-label="Weitere Aktionen"]');
    await seite.waitForSelector('[role="menu"]', { visible: true });
    const punkte = await seite.$$eval('[role="menuitem"]', (e) => e.map((m) => m.textContent.replace(/\s+/g, " ").trim()));
    await seite.keyboard.press("Escape");
    await seite.waitForFunction(() => !document.querySelector('[role="menu"]'));
    return punkte;
  }

  /** Ein freier (nicht gesperrter) Knopf oder Verweis mit genau diesem Text. */
  async function knopf(seite, text, bereich = "body") {
    const h = await seite.waitForFunction(
      (b, t) => {
        const wurzel = document.querySelector(b);
        if (!wurzel) return null;
        return (
          [...wurzel.querySelectorAll("button, a")].find(
            (e) => e.textContent.replace(/\s+/g, " ").trim() === t && e.getAttribute("aria-disabled") !== "true" && !e.disabled,
          ) ?? null
        );
      },
      { timeout: 30000 },
      bereich,
      text,
    );
    return h.asElement();
  }

  /** Waehlt einen Menuepunkt per Maus; ist er gesperrt (Seite laedt noch), spaeter noch einmal. */
  async function menuePunktWaehlen(seite, text) {
    for (let versuch = 0; versuch < 40; versuch++) {
      await seite.click('button[aria-label="Weitere Aktionen"]');
      await seite.waitForSelector('[role="menu"]', { visible: true });
      const punkt = await seite.evaluateHandle(
        (t) => [...document.querySelectorAll('[role="menuitem"]')].find((m) => m.textContent.replace(/\s+/g, " ").trim() === t) ?? null,
        text,
      );
      const element = punkt.asElement();
      if (!element) throw new Error(`Menuepunkt „${text}" fehlt.`);
      if (!(await element.evaluate((m) => m.hasAttribute("data-disabled")))) {
        await element.click();
        return;
      }
      await seite.keyboard.press("Escape");
      await warte(500);
    }
    throw new Error(`Menuepunkt „${text}" bleibt gesperrt.`);
  }

  /** Bestaetigt den Dialog `name` mit dem Knopf `text`; liefert "zu" oder den Fehler des Dialogs. */
  async function dialogBestaetigen(seite, name, text) {
    await seite.waitForSelector(`[data-dialog="${name}"]`, { visible: true });
    await (await knopf(seite, text, `[data-dialog="${name}"]`)).click();
    const h = await seite.waitForFunction(
      (n) => {
        const d = document.querySelector(`[data-dialog="${n}"]`);
        if (!d) return "zu";
        const f = d.querySelector('[data-zeile="fehler"]');
        return f ? `Fehler im Dialog: ${f.textContent.trim()}` : null;
      },
      { timeout: 30000 },
      name,
    );
    return h.jsonValue();
  }

  /**
   * Wartet auf eine Meldung (Toast), deren Text auf das Muster passt; liefert
   * Ton und Text. Der Text ohne das, was nur Screenreader hoeren (der Vorsatz
   * „Fehler: " einer Fehlermeldung).
   */
  async function meldungMitTon(seite, muster) {
    const h = await seite
      .waitForFunction(
        (quelle) => {
          const re = new RegExp(quelle);
          for (const li of document.querySelectorAll("li[data-ton]")) {
            const kopie = li.cloneNode(true);
            for (const sr of kopie.querySelectorAll(".sr-only")) sr.remove();
            const text = kopie.textContent.replace(/\s+/g, " ").trim();
            if (re.test(text)) return { ton: li.getAttribute("data-ton"), text };
          }
          return null;
        },
        { timeout: 15000 },
        muster.source,
      )
      .catch(() => null);
    return h ? h.jsonValue() : null;
  }
  /** Wie `meldungMitTon`, nur der Text. */
  const meldung = async (seite, muster) => (await meldungMitTon(seite, muster))?.text ?? null;
  /** Texte der Erfolgsmeldungen, die gerade stehen. */
  const erfolgsMeldungen = (seite) =>
    seite.$$eval('li[data-ton="ok"]', (e) => e.map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  /** Schliesst stehende Fehlermeldungen (sie bleiben sonst, bis man sie schliesst). */
  async function fehlerMeldungenSchliessen(seite) {
    for (let i = 0; i < 5; i++) {
      const knopfZu = await seite.$('li[data-ton="fehler"] button[aria-label="Meldung schließen"]');
      if (!knopfZu) return;
      await knopfZu.click();
      await warte(400);
    }
  }

  /** Pille im Seitenkopf und „Jetzt dran" (Satz, letzter Teil der Unterzeile, Knoepfe). */
  const lageLesen = (seite) =>
    seite.evaluate(() => {
      const text = (e) => (e ? e.textContent.replace(/\s+/g, " ").trim() : null);
      const titel = document.getElementById("seitentitel");
      const jetzt = document.querySelector("[data-jetzt-dran]");
      const absaetze = jetzt?.firstElementChild?.children ?? [];
      return {
        pille: text(titel?.parentElement?.querySelector(":scope > [data-ton]")),
        jetztDran: text(absaetze[1]),
        // Nur der letzte Teil („noch nicht erinnert"), ohne Datum und Adresse.
        erinnert: (text(absaetze[2]) ?? "").split(" · ").pop() || null,
        knoepfe: jetzt ? [...jetzt.querySelectorAll("button, a")].map(text) : [],
      };
    });
  /** Wartet (hoechstens 15 s), bis die Lage `soll` erreicht, und liefert sie — sonst die zuletzt gelesene. */
  async function lageAbwarten(seite, soll) {
    const gleich = async () => {
      const ist = await lageLesen(seite);
      return Object.keys(soll).every((k) => JSON.stringify(ist[k]) === JSON.stringify(soll[k])) ? ist : null;
    };
    await bis(gleich, "Lage der Ansicht", 15000).catch(() => null);
    const ist = await lageLesen(seite);
    return Object.fromEntries(Object.keys(soll).map((k) => [k, ist[k]]));
  }
  /**
   * Eine Zeile im Reiter Uebersicht: „Datum", eine Pille („Pille „…" (Ton)")
   * oder der Text; `null`, wenn es die Zeile nicht gibt.
   */
  const zeileLesen = (seite, label) =>
    seite.evaluate((l) => {
      const panel = document.querySelector('[role="tabpanel"]');
      const beschriftung = [...(panel?.querySelectorAll("span") ?? [])].find((s) => s.textContent.trim() === l && s.nextElementSibling);
      if (!beschriftung) return null;
      const wert = beschriftung.nextElementSibling;
      const pille = wert.querySelector("[data-ton]");
      if (pille) return `Pille „${pille.textContent.replace(/\s+/g, " ").trim()}“ (${pille.getAttribute("data-ton")})`;
      const t = wert.textContent.replace(/\s+/g, " ").trim();
      return /^\d{2}\.\d{2}\.\d{4}$/.test(t) ? "Datum" : t;
    }, label);

  /** Der Teilsatz der Rueckfrage „Anfrage neu senden?" ueber den bisherigen Link. */
  const bisherigerLinkText = (seite) =>
    seite.evaluate(() => {
      const d = document.querySelector('[data-dialog="anfrage-neu-senden"]');
      const id = d?.getAttribute("aria-describedby");
      const b = id ? document.getElementById(id) : null;
      return b ? (/neuen Link; ([^.]+)\./.exec(b.textContent.replace(/\s+/g, " "))?.[1] ?? b.textContent.trim()) : null;
    });
  /** Die Fehlerzeile eines offenen Dialogs: Text und Rolle; `null` ohne Dialog oder Zeile. */
  const dialogFehler = (seite, name) =>
    seite.evaluate((n) => {
      const f = document.querySelector(`[data-dialog="${n}"] [data-zeile="fehler"]`);
      return f ? { text: f.textContent.replace(/\s+/g, " ").trim(), rolle: f.getAttribute("role") } : null;
    }, name);
  /** „Abbrechen" im Dialog `name`; wartet, bis er zu ist. */
  async function dialogAbbrechen(seite, name) {
    await (await knopf(seite, "Abbrechen", `[data-dialog="${name}"]`)).click();
    await seite.waitForFunction((n) => !document.querySelector(`[data-dialog="${n}"]`), { timeout: 15000 }, name);
  }
  /**
   * Hat die Seite nach dem Aufruf `aufruf` (ab Stelle `ab` im Verlauf) den
   * Vorgang neu geladen (GET /api/contract-end/:id)? Vor `apiStand` fragen —
   * dessen GET stuende sonst auch im Verlauf.
   */
  async function nachDemAufrufNeuGeladen(seite, ab, aufruf) {
    const geladen = () => {
      const liste = seite.verlauf.slice(ab);
      const i = liste.indexOf(aufruf);
      return i >= 0 && liste.slice(i + 1).includes("GET /api/contract-end/:id");
    };
    const ergebnis = await bis(async () => geladen(), "Neuladen nach dem Aufruf", 15000).catch(() => false);
    // Die Antwort des Neuladens abwarten, damit die Seite den neuen Stand zeichnet.
    await seite.waitForNetworkIdle({ idleTime: 300, timeout: 15000 }).catch(() => {});
    return ergebnis;
  }
  /**
   * Fehlerzeile der ALTEN Ansicht (`actionError`, verschwindet nach 6 s), die
   * mit `beginn` anfaengt — sonst `null`.
   */
  async function altFehlerzeile(seite, beginn) {
    const h = await seite
      .waitForFunction(
        (b) =>
          [...document.querySelectorAll("div")]
            .filter((d) => d.children.length === 0)
            .map((d) => d.textContent.replace(/\s+/g, " ").trim())
            .find((t) => t.startsWith(b)) ?? null,
        { timeout: 15000 },
        beginn,
      )
      .catch(() => null);
    return h ? h.jsonValue() : null;
  }
  /** Ein Text der Meldung in kurzer, vergleichbarer Form. */
  const meldungKurz = (text, beginn) =>
    text === null || text === undefined
      ? null
      : { beginn: text.slice(0, beginn.length), alterLinkTot: text.includes(ALTER_LINK_TOT) };

  /** Stand aus der Antwort von GET /api/contract-end/[id] (ohne Personendaten). */
  const apiStand = (seite, id) =>
    seite.evaluate(async (vid, fk) => {
      const res = await fetch(`/api/contract-end/${vid}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      return {
        http: res.status,
        status: j.status ?? null,
        erinnerungen: j.supervisorReminderCount ?? null,
        mav: j.mavStatus ?? null,
        offboarding: j.offboarding?.displayId ?? null,
        // Adresse nur als Art (die Testadresse ist fiktiv, andere nennt die Ausgabe nicht).
        fuehrungskraft: j.supervisorEmail ? (j.supervisorEmail === fk ? "Testadresse" : "andere Adresse") : null,
        anfrageVom: j.supervisorLinkSentAt ? "gesetzt" : null,
        schluesselInAntwort: Object.prototype.hasOwnProperty.call(j, "supervisorToken"),
        fehler: j.error ?? null,
      };
    }, id, FUEHRUNGSKRAFT);
  /** Stand in der Datenbank — der Link-Schluessel nur als „vorhanden", nie sein Wert. */
  async function dbStand(id) {
    const d = await prisma.contractEndProcess.findUnique({
      where: { id },
      select: {
        status: true,
        supervisorReminderCount: true,
        mavStatus: true,
        offboardingId: true,
        supervisorEmail: true,
        supervisorLinkSentAt: true,
        supervisorToken: true,
      },
    });
    return {
      status: d.status,
      supervisorReminderCount: d.supervisorReminderCount,
      mavStatus: d.mavStatus,
      offboardingId: d.offboardingId,
      fuehrungskraft: d.supervisorEmail ? (d.supervisorEmail === FUEHRUNGSKRAFT ? "Testadresse" : "andere Adresse") : null,
      gesendet: Boolean(d.supervisorLinkSentAt),
      link: Boolean(d.supervisorToken),
    };
  }
  /** Der Link-Schluessel des Vorgangs (nur zum Vergleichen und fuer die oeffentliche Route, nie ausgeben). */
  const linkSchluessel = async (id) =>
    (await prisma.contractEndProcess.findUnique({ where: { id }, select: { supervisorToken: true } })).supervisorToken;

  /**
   * Formular der Fuehrungskraft: GET und POST auf die oeffentliche Route, aus
   * einem Browser-Kontext OHNE Sitzung — derselbe Koerper, den
   * `buildPayload()` (src/app/vertrag-formular/[token]/page.tsx) fuer
   * „Übernahme" baut. Den Schluessel liest das Skript beim Aufruf aus der
   * Datenbank — also den zuletzt gespeicherten: Jeder Versuch von
   * `/supervisor-link` speichert einen NEUEN, auch der gescheiterte „neu
   * senden" (C 1c); Nachstellen und gescheiterte Erinnerung lassen ihn
   * stehen. Ausgegeben wird er nie.
   */
  async function formularAbsenden(vorgangId) {
    const schluessel = await linkSchluessel(vorgangId);
    if (!schluessel) throw new Error("Kein Link-Schluessel am Vorgang.");
    const kontext = await browser.createBrowserContext();
    try {
      const seite = await kontext.newPage();
      await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
      return await seite.evaluate(
        async (s) => {
          const laden = await fetch(`/api/vertrag-formular/${s}`);
          const daten = await laden.json();
          if (!laden.ok) return { laden: laden.status, fehler: daten.error ?? null };
          const vb = daten.vorbefuellung ?? {};
          const beginn = new Date(`${vb.vertragsbeginn}T00:00:00Z`);
          const ende = new Date(Date.UTC(beginn.getUTCFullYear() + 1, beginn.getUTCMonth(), beginn.getUTCDate() - 1));
          const koerper = {
            decision: "UEBERNAHME",
            vorstandAbgestimmt: true,
            vorstandAbstimmungVermerk: "Abgestimmt mit der Geschäftsführung (fiktiv, Abnahme)",
            vertragsbeginn: vb.vertragsbeginn,
            befristet: true,
            vertragsende: ende.toISOString().slice(0, 10),
            befristungSachgrund: "Vertretung (fiktiv, Abnahme)",
            vollzeit: false,
            wochenstunden: vb.wochenstunden ?? 20,
            tageProWoche: 5,
            verguetungsmodell: "TV_L",
            entgeltgruppe: vb.entgeltgruppe ?? "E 9b",
            stufe: vb.stufe ?? "3",
            urlaubstageProJahr: 30,
            probezeit: false,
            stellenbeschreibung: vb.stellenbeschreibung ?? "Lehrkraft",
            betriebsstaetteOrgId: daten.organizationId,
          };
          const senden = await fetch(`/api/vertrag-formular/${s}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(koerper),
          });
          const antwort = await senden.json().catch(() => ({}));
          return { laden: laden.status, statusVorher: daten.status, senden: senden.status, antwort: antwort.decision ?? antwort.error ?? null, felder: Object.keys(koerper).sort() };
        },
        schluessel,
      );
    } finally {
      await kontext.close();
    }
  }

  /**
   * Nur das Laden des oeffentlichen Formulars (GET) mit einem bestimmten
   * Schluessel, ohne Sitzung — fuer „der zuvor versendete Link gilt nicht
   * mehr". Liefert Status und Meldung der Route, nie den Schluessel.
   */
  async function formularLaden(schluessel) {
    const kontext = await browser.createBrowserContext();
    try {
      const seite = await kontext.newPage();
      await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
      return await seite.evaluate(async (s) => {
        const res = await fetch(`/api/vertrag-formular/${s}`);
        const j = await res.json().catch(() => ({}));
        return { http: res.status, fehler: j.error ?? null };
      }, schluessel);
    } finally {
      await kontext.close();
    }
  }

  /**
   * Die Mail ging ohne Mailserver nicht hinaus — die Zustellung NACHSTELLEN,
   * damit der Strang weiterlaufen kann (siehe Kopf, „Ohne Mailserver"). Nur am
   * Testvorgang `vorgang` dieses Laufs: per id, nur mit passender T-Nummer
   * (auch in der Datenbank), mit der Testadresse, einem gespeicherten Link und
   * ohne Versandzeitpunkt — also genau in dem Stand, den `/supervisor-link`
   * nach dem Fehlschlag hinterlaesst. Gesetzt wird, was die Route bei
   * zugestellter Mail stehen liesse.
   */
  async function zustellungNachstellen(vorgang, titel) {
    const passt = TEST_NUMMER.test(vorgang.displayId);
    const r = passt
      ? await prisma.contractEndProcess.updateMany({
          where: {
            id: vorgang.id,
            displayId: vorgang.displayId,
            supervisorEmail: FUEHRUNGSKRAFT,
            supervisorToken: { not: null },
            supervisorLinkSentAt: null,
            status: { in: ["ANGELEGT", "ANFRAGE_VORGESETZTER"] },
          },
          data: { status: "ANFRAGE_VORGESETZTER", supervisorLinkSentAt: new Date() },
        })
      : { count: 0 };
    pruefe(`${titel}: Nachstellen trifft genau den Testvorgang (T-Nummer, Testadresse, Link, nicht zugestellt)`, r.count, 1);
    if (r.count === 1) {
      info(`${titel}: Zustellung nachgestellt (kein Mailserver nach Plan) — Status ANFRAGE_VORGESETZTER, Versandzeitpunkt jetzt`);
    }
  }

  /**
   * EmailLog der Vorgaenge — belegt, dass nichts hinausging. Bei abgeschaltetem
   * Mailserver schreibt `sendEventEmail` FAILED mit dem Grund „SMTP ist nicht
   * konfiguriert …" (`sendEmailDetailed` baut dann gar keine Verbindung auf),
   * SKIPPED nur bei abgeschalteter Vorlage oder fehlendem Empfaenger.
   */
  const SMTP_AUS = "SMTP ist nicht konfiguriert";
  async function mailBilanz(ids) {
    const zeilen = await prisma.emailLog.findMany({
      where: { vorgangId: { in: ids } },
      orderBy: { createdAt: "asc" },
      select: { event: true, status: true, detail: true },
    });
    return {
      zeilen: zeilen.map((z) => `${z.event} ${z.status}${z.detail ? ` (${z.detail.slice(0, 50)} …)` : ""}`),
      gesendet: zeilen.filter((z) => z.status === "SENT").length,
      andererFehler: zeilen.filter((z) => z.status === "FAILED" && !(z.detail ?? "").startsWith(SMTP_AUS)).length,
    };
  }
  /** Versandprotokoll EINES Vorgangs, kurz: Ereignis, Ergebnis, Grund als Art. */
  async function mailZeilen(id) {
    const zeilen = await prisma.emailLog.findMany({
      where: { vorgangId: id },
      orderBy: { createdAt: "asc" },
      select: { event: true, status: true, detail: true },
    });
    return zeilen.map((z) => {
      const grund = z.status === "SENT" ? "" : (z.detail ?? "").startsWith(SMTP_AUS) ? " (SMTP aus)" : ` (${(z.detail ?? "ohne Grund").slice(0, 50)})`;
      return `${z.event} ${z.status}${grund}`;
    });
  }

  const ergebnisseNeu = {};
  const ergebnisseAlt = {};

  try {
    // =========================================================
    abschnitt("Vorbereitung");
    testdatenEinspielen();
    let t = await testvorgaenge();
    pruefe("Ausgangslagen T01–T10 nach dem Einspielen", Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.status]).sort()), AUSGANGSLAGEN);

    // =========================================================
    abschnitt("A. Rollen (Punkt 5) — Lage T04 (Übernahme, Vertrag offen)");
    const SOLL_HR = {
      leiste: true,
      jetztDran: true,
      jetztDranKnoepfe: ["Unterschriebenen Vertrag erfassen …", "Zu den Dokumenten"],
      menueKnopf: true,
      standSetzen: true,
      reiter: ["Übersicht", "Vertragsdaten", "Dokumente", "E-Mails"],
      gewaehlterReiter: "Übersicht",
      ende: null,
      ladefehler: null,
    };
    let t04Antwort = null;
    let sachbearbeitung = null;
    for (const rolle of ["HR_LEITUNG", "HR_SACHBEARBEITER"]) {
      const k = await kontextMitRolle(rolle);
      await ansichtSetzen(k.seite, true);
      await neuOeffnen(k.seite, t.T04.id);
      pruefe(`${rolle}: Knöpfe in „Jetzt dran“, Menü, „Stand setzen …“, Reiter mit E-Mails`, await ansichtLesen(k.seite), SOLL_HR);
      pruefe(`${rolle}: Punkte im Menü „Weitere Aktionen“`, await menueLesen(k.seite), ["Abschließen …", "Vorgang stornieren …"]);
      pruefe(
        `${rolle}: Mailprotokoll-Route antwortet (Reiter E-Mails)`,
        await k.seite.evaluate(async (id) => (await fetch(`/api/vorgaenge/contract-end/${id}/mails`)).status, t.T04.id),
        200,
      );
      pruefe(`${rolle}: nichts geschrieben, keine Konsolen- und Netzfehler`, { schreibend: k.seite.schreibend, konsole: k.seite.konsole, netz: k.seite.netzFehler }, { schreibend: [], konsole: [], netz: [] });
      if (rolle === "HR_LEITUNG") {
        t04Antwort = await k.seite.evaluate(async (id) => (await fetch(`/api/contract-end/${id}`)).json(), t.T04.id);
        await k.kontext.close();
      } else {
        sachbearbeitung = k; // bleibt offen fuer C und F
      }
    }

    const SOLL_NUR_LESEN = {
      leiste: true,
      jetztDran: true,
      jetztDranKnoepfe: [],
      menueKnopf: false,
      standSetzen: false,
      reiter: ["Übersicht", "Vertragsdaten", "Dokumente"],
      gewaehlterReiter: "Übersicht",
      ende: null,
      ladefehler: null,
    };
    for (const rolle of ["EINRICHTUNGSLEITUNG", "VORGESETZTER"]) {
      // Zugriff auf den Mandanten wie in `canAccessProcess`: eine Zeile in user_org_assignments.
      if (!zuweisungenVorher.some((z) => z.organizationId === mandant.id)) {
        await prisma.userOrgAssignment.upsert({
          where: { userId_organizationId: { userId: konto.id, organizationId: mandant.id } },
          update: {},
          create: { userId: konto.id, organizationId: mandant.id },
        });
        zuweisungAngelegt = true;
      }
      const k = await kontextMitRolle(rolle);
      await ansichtSetzen(k.seite, true);

      // 1. Echt, MIT Zugriff auf den Mandanten.
      await neuOeffnen(k.seite, t.T04.id);
      const mitZugriff = await ansichtLesen(k.seite);
      const apiMit = await apiStand(k.seite, t.T04.id);
      pruefe(`${rolle} mit Zugriff auf Mandant ${MANDANT}: kein Knopf, kein Menü, kein „Stand setzen …“, kein Reiter E-Mails`, {
        knoepfe: mitZugriff.jetztDranKnoepfe,
        menue: mitZugriff.menueKnopf,
        standSetzen: mitZugriff.standSetzen,
        eMails: mitZugriff.reiter.includes("E-Mails"),
      }, { knoepfe: [], menue: false, standSetzen: false, eMails: false });
      info(`mit Zugriff: Leiste ${mitZugriff.leiste ? "da" : "fehlt"}, Ladefehler ${JSON.stringify(mitZugriff.ladefehler)}, GET ${apiMit.http} „${apiMit.fehler}“`);
      if (!mitZugriff.leiste) {
        befunde.push(
          `${rolle}: auch MIT Zugriff auf Mandant ${MANDANT} keine Daten — GET /api/contract-end/[id] antwortet ${apiMit.http} „${apiMit.fehler}“ ` +
            "(Mandanten-Gate der Middleware, Allowlist nur /api/auth). Die Seite zeigt den Ladefehler statt der lesenden Ansicht.",
        );
      }

      // 2. Simuliert: dieselbe Rolle, die Antwort der HR-Leitung fuer genau diesen Aufruf.
      await k.seite.setRequestInterception(true);
      const umleiten = (req) => {
        if (req.isInterceptResolutionHandled()) return;
        const u = new URL(req.url());
        if (req.method() === "GET" && u.pathname === `/api/contract-end/${t.T04.id}`) {
          void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(t04Antwort) });
        } else void req.continue();
      };
      k.seite.on("request", umleiten);
      await neuOeffnen(k.seite, t.T04.id);
      pruefe(`${rolle} (Antwort simuliert): nur lesen — Leiste ohne Knöpfe, kein Menü, kein „Stand setzen …“, ohne Reiter E-Mails`, await ansichtLesen(k.seite), SOLL_NUR_LESEN);
      await neuOeffnen(k.seite, t.T04.id, "?tab=e-mails");
      pruefe(`${rolle} (Antwort simuliert): ?tab=e-mails fällt auf „Übersicht“`, (await ansichtLesen(k.seite)).gewaehlterReiter, "Übersicht");
      k.seite.off("request", umleiten);
      await k.seite.setRequestInterception(false);

      // 3. Fremder Mandant: Zugriff weg.
      if (zuweisungAngelegt) {
        await prisma.userOrgAssignment.deleteMany({ where: { userId: konto.id, organizationId: mandant.id } });
        zuweisungAngelegt = false;
      }
      await neuOeffnen(k.seite, t.T04.id);
      const fremd = await ansichtLesen(k.seite);
      const apiFremd = await apiStand(k.seite, t.T04.id);
      pruefe(`${rolle} ohne Zugriff (fremder Mandant): Hinweis „Vorgang konnte nicht geladen werden“ mit der Meldung der Schnittstelle`, fremd.ladefehler, {
        titel: "Vorgang konnte nicht geladen werden",
        text: apiFremd.fehler,
      });
      // Dieselbe Meldung in der alten Ansicht („wie heute").
      await ansichtSetzen(k.seite, false);
      await altOeffnen(k.seite, t.T04);
      const altFehler = await k.seite.evaluate(() => document.querySelector(".text-destructive")?.textContent.trim() ?? null);
      pruefe(`${rolle} ohne Zugriff: alte Ansicht zeigt dieselbe Meldung`, altFehler, apiFremd.fehler);
      pruefe(`${rolle}: nichts geschrieben`, k.seite.schreibend, []);
      info(`Meldung neu und alt: „${apiFremd.fehler}“ (HTTP ${apiFremd.http}); mit und ohne Zugriff gleich: ${JSON.stringify(mitZugriff.ladefehler) === JSON.stringify(fremd.ladefehler)}`);
      await k.kontext.close();
    }

    // =========================================================
    abschnitt("B. Tastatur (Punkt 6) — T04, Administration");
    const haupt = await kontextMitRolle("SUPER_ADMIN");
    const s = haupt.seite;
    await ansichtSetzen(s, true);
    await neuOeffnen(s, t.T04.id);
    await s.keyboard.press("Tab");
    pruefe("erster Tab-Halt: Sprunglink", await s.evaluate(() => document.activeElement?.textContent.trim()), "Zum Inhalt springen");
    await s.keyboard.press("Enter");
    await warte(200);
    pruefe("Sprunglink führt zum Inhalt", await s.evaluate(() => ({ anker: location.hash, fokus: document.activeElement?.id })), { anker: "#inhalt", fokus: "inhalt" });
    const fokusBeschreiben = () =>
      s.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return { bereich: "body", text: "" };
        const text = (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim();
        const kopf = e.closest("header");
        const bereich = e.closest('aside[aria-label="Ansicht dieser Seite"]')
          ? "schalter"
          : e.closest('nav[aria-label="Pfad"]')
            ? "pfad"
            : e.closest("[data-jetzt-dran]")
              ? "jetzt-dran"
              : e.closest("[data-prozessleiste]")
                ? "leiste"
                : e.closest('[role="tablist"]')
                  ? "reiter"
                  : kopf && kopf.querySelector("#seitentitel")
                    ? "seitenkopf"
                    : kopf
                      ? "portal-kopf"
                      : "sonst";
        return { bereich, text };
      });
    const halte = [];
    for (let i = 0; i < 30; i++) {
      await s.keyboard.press("Tab");
      const f = await fokusBeschreiben();
      halte.push(f);
      if (f.bereich === "reiter") break;
    }
    info(`Tab-Folge: ${halte.map((h) => `${h.bereich}: ${h.text.slice(0, 40)}`).join(" → ")}`);
    const stelle = (pruefen) => halte.findIndex(pruefen);
    const iPfad = stelle((h) => h.bereich === "pfad");
    const iMenue = stelle((h) => h.text === "Weitere Aktionen");
    const iLeiste = stelle((h) => h.bereich === "leiste" || h.bereich === "jetzt-dran");
    const iJetzt = stelle((h) => h.bereich === "jetzt-dran" && h.text === "Unterschriebenen Vertrag erfassen …");
    const iReiter = stelle((h) => h.bereich === "reiter");
    pruefe(
      "Tab-Reihenfolge: Pfad → Menü „Weitere Aktionen“ → Leiste → Knopf in „Jetzt dran“ → Reiter",
      iPfad >= 0 && iPfad < iMenue && iMenue < iLeiste && iLeiste <= iJetzt && iJetzt < iReiter,
      true,
    );
    pruefe("Tab landet auf dem gewählten Reiter", halte[halte.length - 1], { bereich: "reiter", text: "Übersicht" });
    const reiterStand = () =>
      s.evaluate(() => ({
        gewaehlt: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim(),
        fokus: document.activeElement?.textContent.trim(),
        suche: location.search,
      }));
    await s.keyboard.press("ArrowRight");
    await warte(300);
    pruefe("Pfeil rechts: „Vertragsdaten“ gewählt und fokussiert, Adresse ?tab=vertragsdaten", await reiterStand(), { gewaehlt: "Vertragsdaten", fokus: "Vertragsdaten", suche: "?tab=vertragsdaten" });
    await s.keyboard.press("ArrowRight");
    await warte(300);
    pruefe("Pfeil rechts: „Dokumente“, ?tab=dokumente", await reiterStand(), { gewaehlt: "Dokumente", fokus: "Dokumente", suche: "?tab=dokumente" });
    await s.keyboard.press("Home");
    await warte(300);
    pruefe("Pos1: „Übersicht“, Adresse ohne ?tab", await reiterStand(), { gewaehlt: "Übersicht", fokus: "Übersicht", suche: "" });

    await s.focus('button[aria-label="Weitere Aktionen"]');
    await s.keyboard.press("Enter");
    await s.waitForSelector('[role="menu"]', { visible: true });
    await warte(200);
    const fokusText = () => s.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").replace(/\s+/g, " ").trim());
    const ersterPunkt = await fokusText();
    for (let i = 0; i < 5 && (await fokusText()) !== "Vorgang stornieren …"; i++) await s.keyboard.press("ArrowDown");
    pruefe("Menü mit Enter offen, Fokus im Menü, Pfeil erreicht „Vorgang stornieren …“", { ersterPunkt, jetzt: await fokusText() }, { ersterPunkt: "Abschließen …", jetzt: "Vorgang stornieren …" });
    await s.keyboard.press("Enter");
    await s.waitForSelector('[data-dialog="stornieren"]', { visible: true });
    await warte(200);
    pruefe("Punkt mit Enter: Dialog „Vorgang stornieren?“ offen, Fokus auf „Abbrechen“", await fokusText(), "Abbrechen");
    await s.keyboard.press("Escape");
    await s.waitForFunction(() => !document.querySelector('[data-dialog="stornieren"]'));
    await warte(200);
    pruefe("Escape schließt, Fokus zurück auf „Weitere Aktionen“", await fokusText(), "Weitere Aktionen");

    await s.evaluate(() =>
      [...document.querySelectorAll("[data-jetzt-dran] button")].find((b) => b.textContent.trim() === "Unterschriebenen Vertrag erfassen …")?.focus(),
    );
    await s.keyboard.press("Enter");
    await s.waitForSelector('[data-dialog="vertrag-erfassen"]', { visible: true });
    await warte(200);
    pruefe("Knopf in „Jetzt dran“ mit Enter: Dialog offen, Fokus auf „Abbrechen“", await fokusText(), "Abbrechen");
    await s.keyboard.press("Escape");
    await s.waitForFunction(() => !document.querySelector('[data-dialog="vertrag-erfassen"]'));
    await warte(200);
    pruefe("Escape: Fokus zurück auf „Unterschriebenen Vertrag erfassen …“", await fokusText(), "Unterschriebenen Vertrag erfassen …");
    pruefe("Tastatur: nichts geschrieben, T04 unverändert, keine Konsolenfehler", {
      schreibend: s.schreibend,
      status: (await dbStand(t.T04.id)).status,
      konsole: s.konsole,
      netz: s.netzFehler,
      fenster: s.fenster,
    }, { schreibend: [], status: "RUECKMELDUNG_UEBERNAHME", konsole: [], netz: [], fenster: [] });

    // =========================================================
    abschnitt("D. Schalter alt/neu (Punkte 2 und 7) — T04, Administration");
    const schalterLesen = () =>
      s.evaluate(() => {
        const aside = document.querySelector('aside[aria-label="Ansicht dieser Seite"]');
        return {
          ansicht: document.querySelector("[data-prozessleiste]") ? "neu" : "alt",
          knopf: aside?.querySelector("button")?.textContent.trim() ?? null,
          rueckmeldung: aside?.querySelector('a[href^="mailto:"]') ? "mailto" : null,
          suche: location.search,
        };
      });
    const SCHALTER = 'aside[aria-label="Ansicht dieser Seite"]';
    const cookieWert = async () => (await haupt.kontext.cookies()).find((c) => c.name === "ansicht-vertragsende")?.value ?? null;
    await ansichtSetzen(s, false);
    await altOeffnen(s, t.T04);
    pruefe("ohne Cookie: alte Ansicht mit „Neue Ansicht ausprobieren“", await schalterLesen(), { ansicht: "alt", knopf: "Neue Ansicht ausprobieren", rueckmeldung: null, suche: "" });
    await Promise.all([s.waitForNavigation({ waitUntil: "networkidle2" }), (await knopf(s, "Neue Ansicht ausprobieren", SCHALTER)).click()]);
    await s.waitForSelector("[data-prozessleiste]", { timeout: 60000 });
    pruefe("Klick: neue Ansicht, Cookie „neu“, „Zur bisherigen Ansicht“ und „Rückmeldung geben“", { ...(await schalterLesen()), cookie: await cookieWert() }, {
      ansicht: "neu",
      knopf: "Zur bisherigen Ansicht",
      rueckmeldung: "mailto",
      suche: "",
      cookie: "neu",
    });
    await (await knopf(s, "Vertragsdaten", '[role="tablist"]')).click();
    await s.waitForFunction(() => location.search === "?tab=vertragsdaten");
    await Promise.all([s.waitForNavigation({ waitUntil: "networkidle2" }), (await knopf(s, "Zur bisherigen Ansicht", SCHALTER)).click()]);
    await altWarten(s, t.T04);
    pruefe("„Zur bisherigen Ansicht“: alte Ansicht, ?tab bleibt in der Adresse, Cookie weg", { ...(await schalterLesen()), cookie: await cookieWert() }, {
      ansicht: "alt",
      knopf: "Neue Ansicht ausprobieren",
      rueckmeldung: null,
      suche: "?tab=vertragsdaten",
      cookie: null,
    });
    await Promise.all([s.waitForNavigation({ waitUntil: "networkidle2" }), (await knopf(s, "Neue Ansicht ausprobieren", SCHALTER)).click()]);
    await s.waitForSelector("[data-prozessleiste]", { timeout: 60000 });
    pruefe("wieder neu: öffnet auf dem Reiter aus der Adresse („Vertragsdaten“)", (await ansichtLesen(s)).gewaehlterReiter, "Vertragsdaten");
    // Zweiter Browser-Kontext: dieselbe Sitzung, aber ohne den Cookie der Ansicht.
    const zweiter = await browser.createBrowserContext();
    kontexte.push(zweiter);
    const sitzung = (await haupt.kontext.cookies()).find((c) => c.name === "credo_session");
    await zweiter.setCookie({ name: sitzung.name, value: sitzung.value, domain: sitzung.domain, path: sitzung.path, httpOnly: sitzung.httpOnly, sameSite: sitzung.sameSite });
    const s2 = await zweiter.newPage();
    await s2.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await altOeffnen(s2, t.T04);
    pruefe("zweiter Browser-Kontext ohne Cookie: alte Ansicht", await s2.evaluate(() => (document.querySelector("[data-prozessleiste]") ? "neu" : "alt")), "alt");
    await neuOeffnen(s, t.T04.id);
    pruefe("erster Kontext bleibt neu", (await schalterLesen()).ansicht, "neu");
    pruefe("Schalter: nichts geschrieben, keine Konsolen- und Netzfehler", { schreibend: s.schreibend, konsole: s.konsole, netz: s.netzFehler }, { schreibend: [], konsole: [], netz: [] });
    await zweiter.close();

    // =========================================================
    abschnitt("C. Beide Stränge in der NEUEN Ansicht (Punkt 4) — Sachbearbeitung");
    await rolleSetzen("HR_SACHBEARBEITER");
    const sb = sachbearbeitung.seite;
    sb.schreibend.length = 0;
    sb.konsole.length = 0;
    sb.netzFehler.length = 0;
    sb.verlauf.length = 0;

    /**
     * Ein Schritt: ausfuehren, auf den Status in der Datenbank warten, dann
     * GET-Antwort, neue AuditLog-Eintraege, die schreibenden Aufrufe der Seite
     * und die Antworten der Routen pruefen. `sollFeld` bekommt den Stand aus
     * `dbStand` — noetig, wo der Status sich nicht aendert (die gescheiterte
     * erste Anfrage laesst ANGELEGT stehen).
     */
    async function schritt(ergebnisse, schluessel, titel, { vorgang, ausfuehren, sollStatus, sollFeld, offboardingSoll = false }) {
      const wo = { contractEndId: vorgang.id };
      const vorher = await protokollIds(wo);
      sachbearbeitung.seite.schreibend.length = 0;
      sachbearbeitung.seite.antworten.length = 0;
      let ausgang = "zu";
      try {
        ausgang = (await ausfuehren()) ?? "zu";
      } catch (e) {
        ausgang = `Abbruch: ${e.message}`;
      }
      const db = await bis(async () => {
        const d = await dbStand(vorgang.id);
        return d.status === sollStatus && (!sollFeld || sollFeld(d)) ? d : null;
      }, `${titel}: Status ${sollStatus}`).catch(() => null);
      const api = await apiStand(sachbearbeitung.seite, vorgang.id);
      const protokoll = await protokollNeu(wo, vorher);
      let offboardingProtokoll = null;
      if (offboardingSoll && db?.offboardingId) {
        eigeneOffboardings.add(db.offboardingId);
        offboardingProtokoll = await protokollNeu({ offboardingId: db.offboardingId }, new Set());
      }
      const aufrufe = [...sachbearbeitung.seite.schreibend];
      await Promise.all(sachbearbeitung.seite.antworten.map((a) => a.fertig));
      const antworten = sachbearbeitung.seite.antworten.map((a) => `${a.zeile}${a.mail ? ` (mailStatus ${a.mail})` : ""}`);
      ergebnisse[schluessel] = { protokoll, aufrufe, antworten, offboardingProtokoll };
      pruefe(`${titel}: Ablauf in der Seite`, ausgang, "zu");
      pruefe(`${titel}: Status laut GET-Antwort`, api.status, sollStatus);
      pruefe(`${titel}: AuditLog`, protokoll, ERWARTET_PROTOKOLL[schluessel]);
      if (ERWARTET_AUFRUFE[schluessel]) pruefe(`${titel}: Aufrufe der Seite`, aufrufe, ERWARTET_AUFRUFE[schluessel]);
      if (ERWARTET_ANTWORTEN[schluessel]) pruefe(`${titel}: Antwort der Route`, antworten, ERWARTET_ANTWORTEN[schluessel]);
      if (offboardingSoll) pruefe(`${titel}: AuditLog am neuen Offboarding`, offboardingProtokoll, ["OFFBOARDING_CREATED · Testkonto · herkunft=VERTRAGSENDE"]);
      pruefe(`${titel}: Link-Schlüssel nicht in der GET-Antwort`, api.schluesselInAntwort, false);
      return { api, db };
    }

    // ---- Strang A: T01 — ohne Mailserver (siehe Kopf): jede Mail scheitert,
    // die Zustellung wird nachgestellt, damit der Strang weiterlaeuft.
    const t01 = t.T01;
    /** Der Stand, den `/supervisor-link` nach gescheiterter Mail hinterlaesst (aus `dbStand`). */
    const gespeichertNichtZugestellt = (d) => d.fuehrungskraft === "Testadresse" && d.link && !d.gesendet;
    const ANFRAGE_OFFEN = { pille: "Anfrage offen", jetztDran: "Anfrage an die Führungskraft senden", knoepfe: ["Anfrage senden …"] };
    const WARTET = { pille: "Wartet auf Führungskraft", jetztDran: "Wartet auf die Rückmeldung der Führungskraft", knoepfe: ["Erinnerung senden"] };
    const NICHT_ZUGESTELLT = { pille: "Anfrage nicht zugestellt", jetztDran: "Anfrage wurde nicht zugestellt – erneut senden", knoepfe: ["Anfrage senden …"] };
    /** Zeilen „Anfrage vom" und „Link gültig bis" im Reiter Uebersicht. */
    const anfrageZeilen = async () => ({ anfrageVom: await zeileLesen(sb, "Anfrage vom"), gueltigBis: await zeileLesen(sb, "Link gültig bis") });

    // 1a. Erste Anfrage: Die Mail scheitert (502), der Dialog bleibt offen.
    // `/supervisor-link` speichert Adresse und Link, setzt aber den Versand-
    // zeitpunkt zurueck und — erste Anfrage — den Status auf ANGELEGT.
    await neuOeffnen(sb, t01.id);
    const anfrage = await schritt(ergebnisseNeu, "anfrage", "T01 Anfrage senden (kein Mailserver)", {
      vorgang: t01,
      sollStatus: "ANGELEGT",
      sollFeld: gespeichertNichtZugestellt,
      ausfuehren: async () => {
        await (await knopf(sb, "Anfrage senden …", "[data-jetzt-dran]")).click();
        await sb.waitForSelector('[data-dialog="anfrage-senden"] input[type="email"]', { visible: true });
        await sb.type('[data-dialog="anfrage-senden"] input[type="email"]', FUEHRUNGSKRAFT);
        const ab = sb.verlauf.length;
        if ((await dialogBestaetigen(sb, "anfrage-senden", "Anfrage senden")) === "zu") return "Dialog geschlossen — die Anfrage galt als gesendet";
        const zeile = await dialogFehler(sb, "anfrage-senden");
        pruefe(
          "T01 Anfrage: Meldung der Route im Dialog (role=alert), ohne früheren Link",
          { rolle: zeile?.rolle ?? null, meldung: meldungKurz(zeile?.text, ANFRAGE_OHNE_SMTP) },
          { rolle: "alert", meldung: { beginn: ANFRAGE_OHNE_SMTP, alterLinkTot: false } },
        );
        const neuGeladen = await nachDemAufrufNeuGeladen(sb, ab, "POST /api/contract-end/:id/supervisor-link");
        pruefe(
          "T01 Anfrage: Seite lädt dahinter neu, Dialog bleibt mit der Meldung offen, keine Erfolgsmeldung",
          { neuGeladen, dialogOffen: Boolean(await sb.$('[data-dialog="anfrage-senden"]')), meldungSteht: Boolean(await dialogFehler(sb, "anfrage-senden")), erfolg: await erfolgsMeldungen(sb) },
          { neuGeladen: true, dialogOffen: true, meldungSteht: true, erfolg: [] },
        );
        await dialogAbbrechen(sb, "anfrage-senden");
        return "zu";
      },
    });
    pruefe(
      "T01 Anfrage: GET-Antwort — Adresse gespeichert, kein Versandzeitpunkt",
      { fuehrungskraft: anfrage.api.fuehrungskraft, anfrageVom: anfrage.api.anfrageVom },
      { fuehrungskraft: "Testadresse", anfrageVom: null },
    );
    pruefe("T01 nach „Abbrechen“: wieder „Anfrage offen“, HR sendet", await lageAbwarten(sb, ANFRAGE_OFFEN), ANFRAGE_OFFEN);

    // 1b. Zustellung nachstellen (kein Mailserver): Die Fuehrungskraft „hat" den Link.
    await zustellungNachstellen(t01, "T01");
    await neuOeffnen(sb, t01.id);
    pruefe("T01 nachgestellt: „Wartet auf Führungskraft“ mit „Erinnerung senden“", await lageAbwarten(sb, WARTET), WARTET);
    pruefe("T01 nachgestellt: Übersicht „Anfrage vom“ und „Link gültig bis“ mit Datum", await anfrageZeilen(), { anfrageVom: "Datum", gueltigBis: "Datum" });
    pruefe("T01 nachgestellt: Menüpunkte", await menueLesen(sb), ["Anfrage neu senden …", "Ohne Rückmeldung: Offboarding anlegen …", "Vorgang stornieren …"]);

    // 1c. Anfrage neu senden: scheitert ebenso. Der NEUE Link ist gespeichert,
    // der zugestellte (nachgestellte) damit tot — Lage „nicht zugestellt".
    const schluesselZugestellt = await linkSchluessel(t01.id);
    const neuGesendet = await schritt(ergebnisseNeu, "neu-senden", "T01 Anfrage neu senden (kein Mailserver)", {
      vorgang: t01,
      sollStatus: "ANFRAGE_VORGESETZTER",
      sollFeld: gespeichertNichtZugestellt,
      ausfuehren: async () => {
        await menuePunktWaehlen(sb, "Anfrage neu senden …");
        await sb.waitForSelector('[data-dialog="anfrage-neu-senden"]', { visible: true });
        const vorher = await bisherigerLinkText(sb);
        const ab = sb.verlauf.length;
        if ((await dialogBestaetigen(sb, "anfrage-neu-senden", "Anfrage neu senden")) === "zu") return "Dialog geschlossen — die Anfrage galt als gesendet";
        const zeile = await dialogFehler(sb, "anfrage-neu-senden");
        pruefe(
          "T01 neu senden: Meldung der Route im Dialog (role=alert) nennt den toten Link",
          { rolle: zeile?.rolle ?? null, meldung: meldungKurz(zeile?.text, ANFRAGE_OHNE_SMTP) },
          { rolle: "alert", meldung: { beginn: ANFRAGE_OHNE_SMTP, alterLinkTot: true } },
        );
        pruefe(
          "T01 neu senden: Rückfrage zum bisherigen Link vorher / nach dem Fehlschlag",
          { vorher, nachher: await bisherigerLinkText(sb) },
          { vorher: "der bisherige wird ungültig", nachher: "der bisherige gilt bereits nicht mehr" },
        );
        const neuGeladen = await nachDemAufrufNeuGeladen(sb, ab, "POST /api/contract-end/:id/supervisor-link");
        pruefe(
          "T01 neu senden: Seite lädt dahinter neu, Dialog bleibt mit der Meldung offen, keine Erfolgsmeldung",
          { neuGeladen, dialogOffen: Boolean(await sb.$('[data-dialog="anfrage-neu-senden"]')), meldungSteht: Boolean(await dialogFehler(sb, "anfrage-neu-senden")), erfolg: await erfolgsMeldungen(sb) },
          { neuGeladen: true, dialogOffen: true, meldungSteht: true, erfolg: [] },
        );
        await dialogAbbrechen(sb, "anfrage-neu-senden");
        return "zu";
      },
    });
    pruefe(
      "T01 neu senden: GET-Antwort — Adresse bleibt, kein Versandzeitpunkt",
      { fuehrungskraft: neuGesendet.api.fuehrungskraft, anfrageVom: neuGesendet.api.anfrageVom },
      { fuehrungskraft: "Testadresse", anfrageVom: null },
    );
    pruefe("T01 danach: Lage „nicht zugestellt“ — Pille, „Jetzt dran“ mit „Anfrage senden …“", await lageAbwarten(sb, NICHT_ZUGESTELLT), NICHT_ZUGESTELLT);
    pruefe("T01 danach: Übersicht „Anfrage vom“ als Pille „Nicht zugestellt“, ohne „Link gültig bis“", await anfrageZeilen(), {
      anfrageVom: "Pille „Nicht zugestellt“ (critical)",
      gueltigBis: null,
    });
    const schluesselNeu = await linkSchluessel(t01.id);
    pruefe(
      "T01 danach: neuer Link gespeichert, der zugestellte antwortet im Formular 410 „Link ungültig“",
      { neuerLink: Boolean(schluesselNeu) && schluesselNeu !== schluesselZugestellt, bisheriger: await formularLaden(schluesselZugestellt) },
      { neuerLink: true, bisheriger: { http: 410, fehler: "Link ungültig" } },
    );

    // 1c (Ende). Wieder nachstellen: Diesmal „kommt" der neue Link an.
    await zustellungNachstellen(t01, "T01");
    await neuOeffnen(sb, t01.id);
    pruefe("T01 wieder nachgestellt: „Wartet auf Führungskraft“", await lageAbwarten(sb, WARTET), WARTET);

    // 1d. Erinnerung: Die Mail scheitert, gezaehlt wird nichts, kein AuditLog.
    const erinnert = await schritt(ergebnisseNeu, "erinnern", "T01 Erinnerung senden (kein Mailserver)", {
      vorgang: t01,
      sollStatus: "ANFRAGE_VORGESETZTER",
      sollFeld: (d) => d.supervisorReminderCount === 0 && d.gesendet,
      ausfuehren: async () => {
        // Stehende Fehlermeldungen vorher schliessen (sie bleiben, bis man sie
        // schliesst) und nur eine Meldung mit dem Anfang der Route annehmen —
        // sonst laese das Skript womoeglich eine aeltere.
        await fehlerMeldungenSchliessen(sb);
        const ab = sb.verlauf.length;
        await (await knopf(sb, "Erinnerung senden", "[data-jetzt-dran]")).click();
        const m = await meldungMitTon(sb, new RegExp(`^${ERINNERUNG_OHNE_SMTP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
        pruefe(
          "T01 Erinnerung: Fehlermeldung mit dem Text der Route, keine Erfolgsmeldung",
          { ton: m?.ton ?? null, beginn: m ? m.text.slice(0, ERINNERUNG_OHNE_SMTP.length) : null, erfolg: await erfolgsMeldungen(sb) },
          { ton: "fehler", beginn: ERINNERUNG_OHNE_SMTP, erfolg: [] },
        );
        pruefe("T01 Erinnerung: Seite lädt danach neu", await nachDemAufrufNeuGeladen(sb, ab, "POST /api/contract-end/:id/reminder"), true);
        await fehlerMeldungenSchliessen(sb);
        return "zu";
      },
    });
    pruefe(
      "T01 Erinnerung: nichts gezählt (GET-Antwort), „Jetzt dran“ sagt „noch nicht erinnert“",
      { erinnerungen: erinnert.api.erinnerungen, ...(await lageAbwarten(sb, { erinnert: "noch nicht erinnert" })) },
      { erinnerungen: 0, erinnert: "noch nicht erinnert" },
    );

    // 1e. Formular der Fuehrungskraft (oeffentlich, ohne Sitzung) — mit dem
    // Link aus 1c: Nachstellen und gescheiterte Erinnerung lassen ihn stehen.
    pruefe("T01 Formular: Link-Schlüssel ist der aus „neu senden“ (1c)", (await linkSchluessel(t01.id)) === schluesselNeu, true);
    {
      const vorher = await protokollIds({ contractEndId: t01.id });
      const formular = await formularAbsenden(t01.id).catch((e) => ({ fehler: e.message }));
      await bis(async () => (await dbStand(t01.id)).status === "RUECKMELDUNG_UEBERNAHME", "Formular: Status").catch(() => null);
      const api = await apiStand(sb, t01.id);
      const protokoll = await protokollNeu({ contractEndId: t01.id }, vorher);
      ergebnisseNeu.formular = { protokoll, aufrufe: [], antworten: [] };
      pruefe("T01 Formular der Führungskraft: GET 200 im Status Anfrage, POST 200 „UEBERNAHME“", {
        laden: formular.laden,
        statusVorher: formular.statusVorher,
        senden: formular.senden,
        antwort: formular.antwort,
      }, { laden: 200, statusVorher: "ANFRAGE_VORGESETZTER", senden: 200, antwort: "UEBERNAHME" });
      info(`Koerper des Formulars (Felder): ${(formular.felder ?? []).join(", ")}`);
      pruefe("T01 Formular: Status laut GET-Antwort", api.status, "RUECKMELDUNG_UEBERNAHME");
      pruefe("T01 Formular: AuditLog", protokoll, ERWARTET_PROTOKOLL.formular);
    }
    await neuOeffnen(sb, t01.id);
    await schritt(ergebnisseNeu, "vertrag", "T01 Unterschriebenen Vertrag erfassen", {
      vorgang: t01,
      sollStatus: "VERTRAG_UNTERSCHRIEBEN",
      ausfuehren: async () => {
        await (await knopf(sb, "Unterschriebenen Vertrag erfassen …", "[data-jetzt-dran]")).click();
        const zu = await dialogBestaetigen(sb, "vertrag-erfassen", "Vertrag erfassen");
        pruefe("T01 Vertrag: Meldung", await meldung(sb, /^Unterschriebener Vertrag/), "Unterschriebener Vertrag erfasst.");
        return zu;
      },
    });
    await schritt(ergebnisseNeu, "mav", "T01 Stand setzen … → Angehört", {
      vorgang: t01,
      sollStatus: "VERTRAG_UNTERSCHRIEBEN",
      sollFeld: (d) => d.mavStatus === "ANGEHOERT",
      ausfuehren: async () => {
        await (await knopf(sb, "Stand setzen …", "main")).click();
        await sb.waitForSelector('[data-dialog="mav-setzen"] input[value="ANGEHOERT"]', { visible: true });
        await sb.click('[data-dialog="mav-setzen"] input[value="ANGEHOERT"]');
        const zu = await dialogBestaetigen(sb, "mav-setzen", "Stand speichern");
        pruefe("T01 MAV: Meldung", await meldung(sb, /Mitarbeitervertretung/), "Stand der Mitarbeitervertretung gespeichert.");
        return zu;
      },
    });
    await schritt(ergebnisseNeu, "abschluss-t01", "T01 Abschließen", {
      vorgang: t01,
      sollStatus: "ABGESCHLOSSEN",
      ausfuehren: async () => {
        await (await knopf(sb, "Abschließen …", "[data-jetzt-dran]")).click();
        await sb.waitForSelector('[data-dialog="abschliessen"]', { visible: true });
        const offenePunkte = await sb.$$eval('[data-dialog="abschliessen"] li', (e) => e.length);
        pruefe("T01 Abschließen: keine offenen Punkte im Dialog (MAV gesetzt, Vertrag erfasst)", offenePunkte, 0);
        const zu = await dialogBestaetigen(sb, "abschliessen", "Abschließen");
        pruefe("T01 Abschluss: Meldung", await meldung(sb, /abgeschlossen/), "Vorgang abgeschlossen.");
        return zu;
      },
    });
    await sb.waitForSelector("[data-ende]", { timeout: 15000 });
    const t01Ende = await ansichtLesen(sb);
    pruefe("T01 danach: Leiste „abgeschlossen“, kein „Jetzt dran“, kein Menü", { ende: t01Ende.ende, jetztDran: t01Ende.jetztDran, menue: t01Ende.menueKnopf }, { ende: "abgeschlossen", jetztDran: false, menue: false });

    // ---- Strang B: T06
    const t06 = t.T06;
    await neuOeffnen(sb, t06.id);
    const offb = await schritt(ergebnisseNeu, "offboarding", "T06 Offboarding anlegen", {
      vorgang: t06,
      sollStatus: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
      sollFeld: (d) => Boolean(d.offboardingId),
      offboardingSoll: true,
      ausfuehren: async () => {
        await (await knopf(sb, "Offboarding anlegen …", "[data-jetzt-dran]")).click();
        const zu = await dialogBestaetigen(sb, "offboarding-anlegen", "Offboarding anlegen");
        const text = await meldung(sb, /^Offboarding .* angelegt\.$/);
        pruefe("T06 Offboarding: Meldung nennt die Nummer", /^Offboarding OFF-\d{4}-\S+-\d+ angelegt\.$/.test(text ?? ""), true);
        return zu;
      },
    });
    const verweis = await sb.waitForFunction(
      () => {
        const a = [...document.querySelectorAll("[data-jetzt-dran] a")].find((e) => e.textContent.trim().startsWith("Zum Offboarding OFF-"));
        return a ? { text: a.textContent.trim(), href: a.getAttribute("href") } : null;
      },
      { timeout: 15000 },
    ).then((h) => h.jsonValue()).catch(() => null);
    pruefe("T06 danach: Verweis „Zum Offboarding OFF-…“ in „Jetzt dran“", verweis, offb.db ? { text: `Zum Offboarding ${offb.api.offboarding}`, href: `/vorgaenge/offboarding/${offb.db.offboardingId}` } : "Offboarding fehlt");
    pruefe("T06 danach: Menüpunkte", await menueLesen(sb), ["Abschließen …", "Vorgang stornieren …"]);
    await schritt(ergebnisseNeu, "abschluss-t06", "T06 Menü „Abschließen …“", {
      vorgang: t06,
      sollStatus: "ABGESCHLOSSEN",
      ausfuehren: async () => {
        await menuePunktWaehlen(sb, "Abschließen …");
        const zu = await dialogBestaetigen(sb, "abschliessen", "Abschließen");
        pruefe("T06 Abschluss: Meldung", await meldung(sb, /abgeschlossen/), "Vorgang abgeschlossen.");
        return zu;
      },
    });

    // ---- Storno: T02
    const t02 = t.T02;
    await neuOeffnen(sb, t02.id);
    pruefe("T02 Menüpunkte (Anfrage läuft)", await menueLesen(sb), ["Anfrage neu senden …", "Ohne Rückmeldung: Offboarding anlegen …", "Vorgang stornieren …"]);
    await schritt(ergebnisseNeu, "storno", "T02 Menü „Vorgang stornieren …“", {
      vorgang: t02,
      sollStatus: "STORNIERT",
      ausfuehren: async () => {
        await menuePunktWaehlen(sb, "Vorgang stornieren …");
        const zu = await dialogBestaetigen(sb, "stornieren", "Stornieren");
        pruefe("T02 Storno: Meldung", await meldung(sb, /storniert/), "Vorgang storniert.");
        return zu;
      },
    });
    await sb.waitForSelector("[data-ende]", { timeout: 15000 });
    pruefe("T02 danach: Leiste „abgebrochen“", (await ansichtLesen(sb)).ende, "abgebrochen");
    pruefe(
      "neue Ansicht: kein window.confirm/alert, keine Konsolenfehler; Netzfehler nur die drei 502 ohne Mailserver",
      { fenster: sb.fenster, konsole: sb.konsole, netz: sb.netzFehler },
      { fenster: [], konsole: [], netz: NETZ_OHNE_SMTP },
    );
    const bilanz = await mailBilanz([t01.id, t02.id, t06.id, ...eigeneOffboardings]);
    for (const zeile of bilanz.zeilen) info(`Versandprotokoll: ${zeile}`);
    pruefe("keine Mail hinausgegangen (kein SENT; FAILED nur „SMTP ist nicht konfiguriert …“)", { gesendet: bilanz.gesendet, andererFehler: bilanz.andererFehler }, { gesendet: 0, andererFehler: 0 });
    pruefe("T01: Versandprotokoll — je Versuch eine Zeile FAILED „SMTP ist nicht konfiguriert …“", await mailZeilen(t01.id), ERWARTET_MAILS_T01);

    // =========================================================
    abschnitt("F. Gegenprobe mit der ALTEN Ansicht (Punkt 4) — frische Testdaten, Sachbearbeitung");
    testdatenEinspielen();
    t = await testvorgaenge();
    await ansichtSetzen(sb, false);
    sb.fensterBestaetigen = true;
    sb.fenster.length = 0;
    // Die alte Ansicht hat kein `main`; ihr Inhalt steht im Ziel des Sprunglinks.
    const altKnopf = (text) => knopf(sb, text, "#inhalt");
    // Wie in C: Konsolen- und Netzfehler nur dieses Strangs.
    sb.konsole.length = 0;
    sb.netzFehler.length = 0;
    sb.verlauf.length = 0;
    const a01 = t.T01;
    /** Was die alte Ansicht zur Anfrage zeigt (ohne Namen und Adressen). */
    const altAnfrageLesen = () =>
      sb.evaluate(() => {
        const text = document.body.innerText;
        return {
          gesendet: text.includes("Anfrage gesendet an"),
          nichtZugestellt: text.includes("Bei der Führungskraft ist keine Anfrage angekommen"),
          sendenKnopf: [...document.querySelectorAll("#inhalt button")].some((b) => b.textContent.trim() === "Anfrage an Vorgesetzten senden →"),
        };
      });
    /** Wartet (hoechstens 15 s), bis die alte Ansicht `soll` zeigt, und liefert, was sie zeigt. */
    const altAnfrageAbwarten = async (soll) => {
      await bis(async () => JSON.stringify(await altAnfrageLesen()) === JSON.stringify(soll), "alte Ansicht", 15000).catch(() => null);
      return altAnfrageLesen();
    };

    // 1a. Erste Anfrage: Fehlerzeile mit der Meldung der Route, Seite laedt neu.
    await altOeffnen(sb, a01);
    await schritt(ergebnisseAlt, "anfrage", "alt: T01 Anfrage (kein Mailserver)", {
      vorgang: a01,
      sollStatus: "ANGELEGT",
      sollFeld: gespeichertNichtZugestellt,
      ausfuehren: async () => {
        await sb.type('input[type="email"][placeholder="vorgesetzte@einrichtung.de"]', FUEHRUNGSKRAFT);
        const ab = sb.verlauf.length;
        await (await altKnopf("Anfrage an Vorgesetzten senden →")).click();
        pruefe("alt: T01 Anfrage: Fehlerzeile mit der Meldung der Route", meldungKurz(await altFehlerzeile(sb, ANFRAGE_OHNE_SMTP), ANFRAGE_OHNE_SMTP), {
          beginn: ANFRAGE_OHNE_SMTP,
          alterLinkTot: false,
        });
        pruefe("alt: T01 Anfrage: Seite lädt danach neu", await nachDemAufrufNeuGeladen(sb, ab, "POST /api/contract-end/:id/supervisor-link"), true);
        return "zu";
      },
    });
    pruefe("alt: T01 danach: wieder Eingabe und „Anfrage an Vorgesetzten senden →“", await altAnfrageAbwarten({ gesendet: false, nichtZugestellt: false, sendenKnopf: true }), {
      gesendet: false,
      nichtZugestellt: false,
      sendenKnopf: true,
    });

    // 1b. Zustellung nachstellen (kein Mailserver).
    await zustellungNachstellen(a01, "alt: T01");
    await altOeffnen(sb, a01);
    pruefe("alt: T01 nachgestellt: „Anfrage gesendet an …“", await altAnfrageAbwarten({ gesendet: true, nichtZugestellt: false, sendenKnopf: false }), {
      gesendet: true,
      nichtZugestellt: false,
      sendenKnopf: false,
    });

    // 1c. „Anfrage erneut senden" — die alte Ansicht bietet es (ohne Rueckfrage).
    const altZugestellt = await linkSchluessel(a01.id);
    await schritt(ergebnisseAlt, "neu-senden", "alt: T01 Anfrage erneut senden (kein Mailserver)", {
      vorgang: a01,
      sollStatus: "ANFRAGE_VORGESETZTER",
      sollFeld: gespeichertNichtZugestellt,
      ausfuehren: async () => {
        const ab = sb.verlauf.length;
        await (await altKnopf("Anfrage erneut senden")).click();
        pruefe("alt: T01 erneut senden: Fehlerzeile nennt den toten Link", meldungKurz(await altFehlerzeile(sb, ANFRAGE_OHNE_SMTP), ANFRAGE_OHNE_SMTP), {
          beginn: ANFRAGE_OHNE_SMTP,
          alterLinkTot: true,
        });
        pruefe("alt: T01 erneut senden: Seite lädt danach neu", await nachDemAufrufNeuGeladen(sb, ab, "POST /api/contract-end/:id/supervisor-link"), true);
        return "zu";
      },
    });
    pruefe("alt: T01 danach: roter Satz „keine Anfrage angekommen“, Eingabe und Knopf", await altAnfrageAbwarten({ gesendet: false, nichtZugestellt: true, sendenKnopf: true }), {
      gesendet: false,
      nichtZugestellt: true,
      sendenKnopf: true,
    });
    const altNeu = await linkSchluessel(a01.id);
    pruefe(
      "alt: T01 danach: neuer Link gespeichert, der zugestellte antwortet im Formular 410 „Link ungültig“",
      { neuerLink: Boolean(altNeu) && altNeu !== altZugestellt, bisheriger: await formularLaden(altZugestellt) },
      { neuerLink: true, bisheriger: { http: 410, fehler: "Link ungültig" } },
    );
    await zustellungNachstellen(a01, "alt: T01");
    await altOeffnen(sb, a01);

    // 1d. Erinnerung: Fehlerzeile, nichts gezaehlt (die alte Ansicht laedt dabei nicht neu).
    await schritt(ergebnisseAlt, "erinnern", "alt: T01 Erinnerung (kein Mailserver)", {
      vorgang: a01,
      sollStatus: "ANFRAGE_VORGESETZTER",
      sollFeld: (d) => d.supervisorReminderCount === 0 && d.gesendet,
      ausfuehren: async () => {
        await (await altKnopf("Erinnerung senden")).click();
        const zeile = await altFehlerzeile(sb, ERINNERUNG_OHNE_SMTP);
        pruefe("alt: T01 Erinnerung: Fehlerzeile mit der Meldung der Route", zeile ? zeile.slice(0, ERINNERUNG_OHNE_SMTP.length) : null, ERINNERUNG_OHNE_SMTP);
        return "zu";
      },
    });

    // 1e. Formular der Fuehrungskraft — mit dem Link aus 1c.
    {
      const vorher = await protokollIds({ contractEndId: a01.id });
      const formular = await formularAbsenden(a01.id).catch((e) => ({ fehler: e.message }));
      await bis(async () => (await dbStand(a01.id)).status === "RUECKMELDUNG_UEBERNAHME", "Formular: Status").catch(() => null);
      ergebnisseAlt.formular = { protokoll: await protokollNeu({ contractEndId: a01.id }, vorher), aufrufe: [], antworten: [] };
      pruefe("alt: T01 Formular POST 200", formular.senden, 200);
    }
    await altOeffnen(sb, a01);
    await schritt(ergebnisseAlt, "vertrag", "alt: T01 Vertrag erfassen", {
      vorgang: a01,
      sollStatus: "VERTRAG_UNTERSCHRIEBEN",
      ausfuehren: async () => (await altKnopf("Unterschriebenen Vertrag erfassen")).click().then(() => "zu"),
    });
    await schritt(ergebnisseAlt, "mav", "alt: T01 MAV „Angehört“", {
      vorgang: a01,
      sollStatus: "VERTRAG_UNTERSCHRIEBEN",
      sollFeld: (d) => d.mavStatus === "ANGEHOERT",
      ausfuehren: async () => (await altKnopf("Angehört")).click().then(() => "zu"),
    });
    await schritt(ergebnisseAlt, "abschluss-t01", "alt: T01 Abschließen", {
      vorgang: a01,
      sollStatus: "ABGESCHLOSSEN",
      ausfuehren: async () => (await altKnopf("Vorgang abschließen")).click().then(() => "zu"),
    });
    const a06 = t.T06;
    await altOeffnen(sb, a06);
    await schritt(ergebnisseAlt, "offboarding", "alt: T06 Offboarding anlegen", {
      vorgang: a06,
      sollStatus: "ENTSCHEIDUNG_KEINE_UEBERNAHME",
      sollFeld: (d) => Boolean(d.offboardingId),
      offboardingSoll: true,
      ausfuehren: async () => (await altKnopf("Offboarding anlegen →")).click().then(() => "zu"),
    });
    pruefe("alt: drei Rückfragen per window.confirm (Vertrag, Abschluss, Offboarding; „erneut senden“ fragt nicht)", sb.fenster, ["confirm", "confirm", "confirm"]);
    pruefe(
      "alt: keine Konsolenfehler, Netzfehler nur die drei 502 ohne Mailserver",
      { konsole: sb.konsole, netz: sb.netzFehler },
      { konsole: [], netz: NETZ_OHNE_SMTP },
    );
    const bilanzAlt = await mailBilanz([a01.id, a06.id, ...eigeneOffboardings]);
    pruefe("alt: keine Mail hinausgegangen (kein SENT; FAILED nur „SMTP ist nicht konfiguriert …“)", { gesendet: bilanzAlt.gesendet, andererFehler: bilanzAlt.andererFehler }, { gesendet: 0, andererFehler: 0 });
    pruefe("alt: T01 Versandprotokoll — je Versuch eine Zeile FAILED „SMTP ist nicht konfiguriert …“", await mailZeilen(a01.id), ERWARTET_MAILS_T01);
    // Verglichen werden die gemeinsamen Schritte — seit die alte Ansicht
    // „Anfrage erneut senden" anbietet, gehoert 1c dazu. Ohne Gegenstueck
    // bleibt nur, was die neue Ansicht selbst zeigt (Rueckfrage, Pille,
    // „Jetzt dran", Zeile „Anfrage vom") — geprueft in C.
    for (const schluessel of ["anfrage", "neu-senden", "erinnern", "formular", "vertrag", "mav", "abschluss-t01", "offboarding"]) {
      pruefe(`Gegenprobe ${schluessel}: AuditLog alt = neu`, ergebnisseAlt[schluessel]?.protokoll, ergebnisseNeu[schluessel]?.protokoll);
      pruefe(`Gegenprobe ${schluessel}: Aufrufe alt = neu`, ergebnisseAlt[schluessel]?.aufrufe, ergebnisseNeu[schluessel]?.aufrufe);
      pruefe(`Gegenprobe ${schluessel}: Antworten alt = neu`, ergebnisseAlt[schluessel]?.antworten, ergebnisseNeu[schluessel]?.antworten);
    }
    pruefe("Gegenprobe offboarding: AuditLog am Offboarding alt = neu", ergebnisseAlt.offboarding?.offboardingProtokoll, ergebnisseNeu.offboarding?.offboardingProtokoll);
    info("Ohne Gegenstueck in der alten Ansicht: „Abschließen“ nach Keine Übernahme (T06) und „Vorgang stornieren“ (T02) — beides bot sie nicht an.");

    // Bericht der Schritte (AuditLog je Schritt, neue Ansicht).
    abschnitt("AuditLog je Schritt (neue Ansicht)");
    for (const [schluessel, e] of Object.entries(ergebnisseNeu)) {
      info(`${schluessel.padEnd(14)} ${e.protokoll.join(" | ")}${e.offboardingProtokoll ? ` | Offboarding: ${e.offboardingProtokoll.join(" | ")}` : ""}`);
    }
  } finally {
    // =========================================================
    abschnitt("E. Aufräumen und Prüfen");
    for (const k of kontexte) await k.close().catch(() => {});
    await browser.close().catch(() => {});
    await prisma.user.update({ where: { id: konto.id }, data: { role: "SUPER_ADMIN" } }).catch((e) => {
      fehler += 1;
      console.error("ACHTUNG: Rolle des Testkontos nicht zurueckgesetzt:", e.message);
    });
    if (zuweisungAngelegt || !zuweisungenVorher.some((z) => z.organizationId === mandant.id)) {
      await prisma.userOrgAssignment.deleteMany({ where: { userId: konto.id, organizationId: mandant.id } }).catch((e) => {
        fehler += 1;
        console.error("ACHTUNG: Mandantenzuweisung nicht zurueckgenommen:", e.message);
      });
    }
    try {
      testdatenEinspielen();
    } catch (e) {
      fehler += 1;
      console.error("ACHTUNG: Testdaten nicht neu eingespielt:", e.message);
    }
    // Die Offboardings dieses Laufs (echte Nummer, also nicht vom Testdaten-
    // Skript erfasst). Nur, was nach dem Start neu war.
    const neueOffboardings = (await fremdeOffboardings()).filter((id) => !offboardingsVorher.includes(id));
    for (const id of neueOffboardings) eigeneOffboardings.add(id);
    const loeschen = [...eigeneOffboardings].filter((id) => !offboardingsVorher.includes(id));
    if (loeschen.length > 0) {
      await prisma.$transaction([
        prisma.auditLog.deleteMany({ where: { offboardingId: { in: loeschen } } }),
        prisma.emailLog.deleteMany({ where: { vorgangId: { in: loeschen } } }),
        prisma.offboardingProcess.deleteMany({ where: { id: { in: loeschen } } }),
      ]);
    }
    info(`${loeschen.length} Offboarding(s) dieses Laufs geloescht.`);

    const nachher = await testvorgaenge();
    pruefe("E: T01–T10 wieder in den Ausgangslagen", Object.fromEntries(Object.entries(nachher).map(([k, v]) => [k, v.status]).sort()), AUSGANGSLAGEN);
    pruefe(`E: übrige Testvorgänge (${unberuehrtVorher.length}, u. a. GYM) unberührt`, await fremdeVertragsenden(), unberuehrtVorher);
    pruefe("E: keine zusätzlichen Offboardings mit Testadresse", await fremdeOffboardings(), offboardingsVorher);
    pruefe("E: Rolle SUPER_ADMIN, Mandantenzuweisungen wie vorher", {
      rolle: (await prisma.user.findUnique({ where: { id: konto.id }, select: { role: true } })).role,
      zuweisungen: (await prisma.userOrgAssignment.findMany({ where: { userId: konto.id }, select: { organizationId: true } })).map((z) => z.organizationId).sort(),
    }, { rolle: "SUPER_ADMIN", zuweisungen: zuweisungenVorher.map((z) => z.organizationId).sort() });
    await prisma.$disconnect();
  }

  if (befunde.length > 0) {
    console.log("\nBefunde (keine Pruefung des Skripts):");
    for (const b of befunde) console.log(`  - ${b}`);
  }
  console.log(fehler === 0 ? `\nAlles in Ordnung (${pruefungen} Pruefungen).` : `\n${fehler} von ${pruefungen} Pruefungen stimmen nicht.`);
  process.exit(fehler === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
