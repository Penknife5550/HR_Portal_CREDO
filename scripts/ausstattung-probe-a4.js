/**
 * Prüfskript Paket A4 „Ausstattung & Zugänge“ (Stufe 2) – Ausgabe im
 * Onboarding, Rückgabe im Offboarding, Abschluss und Löschfristen über die
 * ECHTEN HTTP-Schnittstellen eines laufenden Dev-Servers.
 *
 * Feinplan: docs/module/onboarding/ausstattung-feinplan-a4.md, Abschnitte 1.6
 * (Routen) und 1.7 (Abläufe).
 *
 * Aufruf (aus dem Projektordner):
 *
 *   node --env-file=.env scripts/ausstattung-probe-a4.js [--screenshots]
 *
 *   --screenshots  zusätzlich je ein Bild der Link-Seite der IT im Onboarding
 *                  und der Gebäudewirtschaft im Offboarding mit headless Edge
 *                  nach docs/module/onboarding/screenshots/ausstattung/
 *                  (a4-onboarding-link-it.png, a4-offboarding-link-facility.png)
 *
 * Umgebung:
 *   PROBE_BASE_URL   Adresse des Dev-Servers (Standard http://localhost:3200)
 *   DATABASE_URL     muss auf die Testdatenbank hr_portal_ausstattung zeigen
 *                    (aus .env bzw. .env.local)
 *   PROBE_EMAIL / PROBE_PASSWORT
 *                    Testkonto; sonst die Kommentarzeilen „# TESTKONTO_EMAIL=…“
 *                    und „# TESTKONTO_PASSWORT=…“ in .env.local
 *   CRON_SECRET      für den Probelauf „Aufbewahrung erzeugter Dokumente“;
 *                    fehlt er, wird der Schritt übersprungen und gemeldet
 *   EDGE_PFAD        Pfad zu msedge.exe (für --screenshots)
 *
 * Schutz (Abbruch VOR dem ersten Schreiben):
 *   - nur gegen localhost bzw. 127.0.0.1;
 *   - DATABASE_URL zeigt auf hr_portal_ausstattung an localhost/127.0.0.1;
 *   - kein aktiver Mailserver (SmtpConfig leer oder inaktiv) und kein
 *     eingetragener Webhook (webhookConfig.count() = 0).
 *
 * Das Skript legt eine fiktive Person (@beispiel.invalid, Zeitstempel im
 * Namen) samt Onboarding und Offboarding an und lässt beide stehen; jeder
 * Lauf erzeugt neue Vorgänge. Es löscht nichts. Kennungen beginnen mit
 * „PROBE-“. Tokens werden nur gekürzt ausgegeben, das Passwort nie.
 *
 * Ausgabe: OK/FEHLER je Prüfpunkt, HINWEIS für Übersprungenes, am Ende eine
 * Zusammenfassung; Exit-Code 1 bei mindestens einem FEHLER, 2 bei Abbruch.
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// =============================================
// Grundeinstellungen
// =============================================

const PROJEKT = path.resolve(__dirname, "..");
const BASE = (process.env.PROBE_BASE_URL || "http://localhost:3200").replace(/\/+$/, "");
const ERLAUBTE_HOSTS = new Set(["localhost", "127.0.0.1"]);
const TEST_DB = "hr_portal_ausstattung";
const SCREENSHOTS = process.argv.includes("--screenshots");
const SCREENSHOT_DIR = path.join(PROJEKT, "docs", "module", "onboarding", "screenshots", "ausstattung");
const EDGE = process.env.EDGE_PFAD || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const KENNUNG_IPAD = "PROBE-IPAD-1";
const KENNUNG_IPAD_KORR = "PROBE-IPAD-1K";
const KENNUNG_SCHLUESSEL = "PROBE-GS-1";
const ALLE_KENNUNGEN = [KENNUNG_IPAD, KENNUNG_IPAD_KORR, KENNUNG_SCHLUESSEL];

// Katalog (Vorschläge übernommen, siehe RUECKGABE_VORGABEN in src/lib/ausgaben.ts)
const POS_IPAD = "Dienst-iPad (Lernmittel)";
const POS_SCHLUESSEL = "Schlüssel";
const POS_ZUGAENGE = "Zugänge";
const OPT_HAUPTEINGANG = "Haupteingang";
// Die Option heisst je nach Katalogstand „Dienst-E-Mail“ (Vorschläge bis
// 13.10.2026) oder „Benutzerkonto und Dienst-E-Mail“ (Standardkatalog,
// 14.10.2026) – sie wird deshalb aus dem Formular gelesen (optMail), nicht
// fest verdrahtet; so läuft die Probe auf altem und neuem Katalogstand.
const OPT_DIENSTMAIL_TEIL = "Dienst-E-Mail";

// =============================================
// Ausgabe und Prüfpunkte
// =============================================

const ergebnisse = [];
let aktuellerSchritt = "";

function schritt(titel) {
  aktuellerSchritt = titel;
  console.log("");
  console.log(`=== ${titel} ===`);
}

function kurz(wert, max = 300) {
  let text;
  try {
    text = typeof wert === "string" ? wert : JSON.stringify(wert);
  } catch {
    text = String(wert);
  }
  if (text === undefined) return "undefined";
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

/** Ein Prüfpunkt: OK oder FEHLER, mit Detail bei FEHLER (und optional bei OK). */
function pruefe(text, ok, detail) {
  const eintrag = { schritt: aktuellerSchritt, text, status: ok ? "OK" : "FEHLER", detail: detail ?? "" };
  ergebnisse.push(eintrag);
  const zusatz = detail !== undefined && detail !== "" ? ` – ${typeof detail === "string" ? detail : kurz(detail)}` : "";
  console.log(`  [${eintrag.status}] ${text}${ok && detail === undefined ? "" : zusatz}`);
  return !!ok;
}

/** Übersprungen oder nur zur Information – zählt nicht als Fehler. */
function hinweis(text, detail) {
  ergebnisse.push({ schritt: aktuellerSchritt, text, status: "HINWEIS", detail: detail ?? "" });
  console.log(`  [HINWEIS] ${text}${detail ? ` – ${detail}` : ""}`);
}

function info(text) {
  console.log(`  · ${text}`);
}

class Abbruch extends Error {}

/** Bricht ab (Exit 2), wenn eine Voraussetzung fehlt, ohne die nichts weiter prüfbar ist. */
function muss(text, ok, detail) {
  pruefe(text, ok, detail);
  if (!ok) throw new Abbruch(text);
}

function tokenKurz(t) {
  return typeof t === "string" && t.length > 8 ? `${t.slice(0, 8)}…` : String(t);
}

// =============================================
// Datum (deutsche Zeit, wie die Anwendung)
// =============================================

const TAG_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ZEIT_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Berliner Kalendertag `YYYY-MM-DD`. */
function berlinTag(d) {
  return TAG_FORMAT.format(d);
}

/** Berliner Uhrzeit `HH:MM:SS`. */
function berlinZeit(d) {
  return ZEIT_FORMAT.format(d);
}

/** Kalendertag + n Tage (reines Datum, ohne Zeitzone). */
function tagPlus(tag, n) {
  const [j, m, t] = tag.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + n));
  return d.toISOString().slice(0, 10);
}

/** Kalendertag + n Monate, am Monatsende gekappt (wie monateSpaeter in kalendertag.ts). */
function monatePlus(tag, n) {
  const [j, m, t] = tag.split("-").map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + n, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  return `${ziel.getUTCFullYear()}-${String(ziel.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(t, letzter)).padStart(2, "0")}`;
}

/** Ist `d` der Beginn (00:00:00 deutscher Zeit) des Berliner Tages `tag`? */
function istBerlinerTagesbeginn(d, tag) {
  return d instanceof Date && berlinTag(d) === tag && berlinZeit(d) === "00:00:00";
}

function schlafen(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// =============================================
// HTTP
// =============================================

const cookies = new Map();

/** Token-Routen teilen sich eine IP-Bremse (20/min): höchstens 15 je Minute vom Skript. */
const TOKEN_LIMIT = 15;
const tokenAufrufe = [];

async function tokenBremse(anzahl = 1) {
  for (;;) {
    const jetzt = Date.now();
    while (tokenAufrufe.length > 0 && jetzt - tokenAufrufe[0] > 61_000) tokenAufrufe.shift();
    if (tokenAufrufe.length + anzahl <= TOKEN_LIMIT) break;
    const warten = 61_000 - (jetzt - tokenAufrufe[0]) + 250;
    info(`Warte ${Math.ceil(warten / 1000)} s (IP-Bremse der Link-Routen, ${TOKEN_LIMIT}/min) …`);
    await schlafen(warten);
  }
  for (let i = 0; i < anzahl; i++) tokenAufrufe.push(Date.now());
}

let letzterAufruf = 0;

/**
 * fetch mit Wiederholung bei Netzwerkfehlern – nur für GET: Nach einer Pause
 * (etwa während des Screenshots) schliesst der Dev-Server eine ruhende
 * Keep-alive-Verbindung, und undici meldet beim ersten Aufruf darauf „fetch
 * failed“. Ein schreibender Aufruf wird nie blind wiederholt; vor ihm frischt
 * nach einer Pause ein GET auf /api/health die Verbindung auf.
 */
async function holen(url, init) {
  for (let versuch = 1; ; versuch++) {
    try {
      const r = await fetch(url, init);
      letzterAufruf = Date.now();
      return r;
    } catch (err) {
      if (init.method !== "GET" || versuch >= 3) {
        const ursache = err?.cause?.code ?? err?.cause?.message ?? "";
        throw new Error(`${init.method} ${url.replace(/[0-9a-f-]{36}/gi, "…")}: ${err.message}${ursache ? ` (${ursache})` : ""}`);
      }
      await schlafen(500);
    }
  }
}

/**
 * Ein Aufruf der Schnittstelle. `token: true` = öffentliche Link-Route
 * (Bremse je IP). Liefert { status, json, text, headers }; wirft nur bei
 * Netzwerkfehlern. Bei 429 einmal warten und wiederholen.
 */
async function api(methode, pfad, opts = {}) {
  const { body, token = false, headers = {}, ohneCookie = false } = opts;
  if (methode !== "GET" && Date.now() - letzterAufruf > 3000) {
    await holen(`${BASE}/api/health`, { method: "GET", headers: { Accept: "application/json" } }).then((r) => r.arrayBuffer());
  }
  for (let versuch = 1; versuch <= 2; versuch++) {
    if (token) await tokenBremse();
    const kopf = { Accept: "application/json", ...headers };
    if (!ohneCookie && cookies.size > 0) {
      kopf.Cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    let rumpf;
    if (body !== undefined) {
      kopf["Content-Type"] = "application/json";
      rumpf = typeof body === "string" ? body : JSON.stringify(body);
    }
    const antwort = await holen(`${BASE}${pfad}`, { method: methode, headers: kopf, body: rumpf, redirect: "manual" });
    const setCookies = typeof antwort.headers.getSetCookie === "function" ? antwort.headers.getSetCookie() : [];
    for (const c of setCookies) {
      const [paar] = c.split(";");
      const i = paar.indexOf("=");
      if (i > 0) cookies.set(paar.slice(0, i).trim(), paar.slice(i + 1).trim());
    }
    const text = await antwort.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (antwort.status === 429 && versuch === 1) {
      const sek = Number(antwort.headers.get("retry-after")) || 61;
      info(`429 auf ${methode} ${pfad.replace(/[0-9a-f-]{36}/gi, "…")} – warte ${sek} s und versuche es einmal erneut`);
      await schlafen(sek * 1000 + 500);
      tokenAufrufe.length = 0;
      continue;
    }
    return { status: antwort.status, json, text, headers: antwort.headers };
  }
  throw new Error("unerreichbar");
}

// =============================================
// Hilfen für Antworten
// =============================================

/** Alle Objekte in einem JSON-Baum, die `bedingung` erfüllen. */
function findeAlle(wurzel, bedingung, treffer = []) {
  if (wurzel && typeof wurzel === "object") {
    if (!Array.isArray(wurzel) && bedingung(wurzel)) treffer.push(wurzel);
    for (const wert of Array.isArray(wurzel) ? wurzel : Object.values(wurzel)) findeAlle(wert, bedingung, treffer);
  }
  return treffer;
}

function enthaeltKennung(text) {
  if (text === null || text === undefined) return false;
  const s = typeof text === "string" ? text : JSON.stringify(text);
  return ALLE_KENNUNGEN.some((k) => s.includes(k));
}

function testkontoLesen() {
  if (process.env.PROBE_EMAIL && process.env.PROBE_PASSWORT) {
    return { email: process.env.PROBE_EMAIL, password: process.env.PROBE_PASSWORT };
  }
  const datei = path.join(PROJEKT, ".env.local");
  if (!fs.existsSync(datei)) return null;
  const inhalt = fs.readFileSync(datei, "utf8");
  const email = /^#\s*TESTKONTO_EMAIL=(.+)$/m.exec(inhalt)?.[1]?.trim();
  const password = /^#\s*TESTKONTO_PASSWORT=(.+)$/m.exec(inhalt)?.[1]?.trim();
  return email && password ? { email, password } : null;
}

// =============================================
// Screenshots (headless Edge)
// =============================================

async function screenshot(url, dateiname, hinweisText) {
  if (!SCREENSHOTS) return;
  if (!fs.existsSync(EDGE)) {
    hinweis(`Screenshot ${dateiname} übersprungen`, `Edge nicht gefunden (${EDGE})`);
    return;
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const ziel = path.join(SCREENSHOT_DIR, dateiname);
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), "a4-probe-edge-"));
  const start = Date.now();
  // Die Seite ruft die Link-Route beim Laden auf: zwei Aufrufe für die IP-Bremse einplanen.
  await tokenBremse(2);
  const r = spawnSync(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--virtual-time-budget=15000",
      `--screenshot=${ziel}`,
      "--window-size=900,2300",
      `--user-data-dir=${profil}`,
      "--no-first-run",
      "--no-default-browser-check",
      url,
    ],
    { timeout: 120_000, encoding: "utf8" },
  );
  try {
    fs.rmSync(profil, { recursive: true, force: true });
  } catch {
    // Edge haelt das Profil manchmal noch kurz offen – Reste im Temp-Ordner sind harmlos.
  }
  const da = fs.existsSync(ziel) && fs.statSync(ziel).mtimeMs >= start - 2000;
  const groesse = da ? fs.statSync(ziel).size : 0;
  pruefe(
    `Screenshot ${hinweisText} geschrieben (${path.relative(PROJEKT, ziel).replace(/\\/g, "/")})`,
    da && groesse > 10_000,
    da ? `${Math.round(groesse / 1024)} KB` : `Edge-Exit ${r.status}, ${kurz(r.stderr || r.error?.message || "", 200)}`,
  );
}

// =============================================
// Ablauf
// =============================================

async function main() {
  const start = new Date();
  const heute = berlinTag(start);
  const stempel = start.toISOString().replace(/[-:T]/g, "").slice(0, 14); // JJJJMMTTHHMMSS (UTC)

  console.log("Prüfskript Paket A4 „Ausstattung & Zugänge“");
  console.log(`Server: ${BASE} · heute (Berlin): ${heute} · Lauf: ${stempel}${SCREENSHOTS ? " · mit Screenshots" : ""}`);

  // ------------------------------------------------------------------
  schritt("0 Schutz: Host, Datenbank, Mailserver, Webhooks");
  // ------------------------------------------------------------------
  let basisUrl;
  try {
    basisUrl = new URL(BASE);
  } catch {
    basisUrl = null;
  }
  muss(`Server-Host ist localhost/127.0.0.1 (${basisUrl?.hostname ?? "ungültig"})`, !!basisUrl && ERLAUBTE_HOSTS.has(basisUrl.hostname));

  let dbUrl = null;
  try {
    dbUrl = new URL(process.env.DATABASE_URL || "");
  } catch {
    dbUrl = null;
  }
  const dbName = dbUrl ? decodeURIComponent(dbUrl.pathname.replace(/^\//, "")) : "";
  muss(`DATABASE_URL zeigt auf ${TEST_DB} (gefunden: ${dbName || "—"})`, dbName === TEST_DB);
  muss(`Datenbank-Host ist localhost/127.0.0.1 (${dbUrl?.hostname ?? "—"})`, !!dbUrl && ERLAUBTE_HOSTS.has(dbUrl.hostname));

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const smtp = await prisma.smtpConfig.findMany({ select: { id: true, isActive: true, host: true } });
    const smtpAktiv = smtp.filter((s) => s.isActive);
    muss(`Kein aktiver Mailserver (SmtpConfig: ${smtp.length} Zeile(n), aktiv: ${smtpAktiv.length})`, smtpAktiv.length === 0);
    const webhooks = await prisma.webhookConfig.count();
    muss(`Keine Webhooks eingetragen (webhookConfig.count() = ${webhooks})`, webhooks === 0);

    const health = await api("GET", "/api/health", { ohneCookie: true });
    muss(`Dev-Server erreichbar (GET /api/health → ${health.status})`, health.status === 200);

    const gym = await prisma.organization.findFirst({ where: { type: "GYMNASIUM", isActive: true } });
    muss(`Einrichtung Gymnasium vorhanden (${gym?.name ?? "—"}, Mandant ${gym?.mandantNumber ?? "—"})`, !!gym);

    await ablauf(prisma, { start, heute, stempel, gym });
  } finally {
    await prisma.$disconnect();
  }
}

async function ablauf(prisma, { start, heute, stempel, gym }) {
  // ------------------------------------------------------------------
  schritt("1 Anmelden, Rückgabe-Vorgaben übernehmen");
  // ------------------------------------------------------------------
  const konto = testkontoLesen();
  muss("Testkonto gefunden (.env.local bzw. PROBE_EMAIL/PROBE_PASSWORT)", !!konto);
  const login = await api("POST", "/api/auth", { body: { email: konto.email, password: konto.password }, ohneCookie: true });
  muss(`Anmeldung (POST /api/auth → ${login.status})`, login.status === 200 && cookies.size > 0, login.status === 200 ? undefined : kurz(login.json));
  pruefe(`Rolle des Testkontos ist SUPER_ADMIN (${login.json?.user?.role})`, login.json?.user?.role === "SUPER_ADMIN");

  const vorgaben = await api("POST", "/api/settings/ausstattung/rueckgabe-vorgaben");
  pruefe(
    `POST /api/settings/ausstattung/rueckgabe-vorgaben → 200 mit gesetzt/uebersprungen/meldung`,
    vorgaben.status === 200 &&
      typeof vorgaben.json?.gesetzt === "number" &&
      typeof vorgaben.json?.uebersprungen === "number" &&
      typeof vorgaben.json?.meldung === "string",
    `Status ${vorgaben.status}: ${kurz(vorgaben.json)}`,
  );
  pruefe("Kein Webhook-Hinweis in der Antwort (keine Webhooks eingetragen)", vorgaben.json?.hinweis === undefined, kurz(vorgaben.json?.hinweis ?? "—"));
  const vorgaben2 = await api("POST", "/api/settings/ausstattung/rueckgabe-vorgaben");
  pruefe(
    "Wiederholung ist folgenlos (zweiter Aufruf: gesetzt = 0)",
    vorgaben2.status === 200 && vorgaben2.json?.gesetzt === 0 && vorgaben2.json?.uebersprungen >= 1,
    `Status ${vorgaben2.status}: ${kurz(vorgaben2.json)}`,
  );

  const positionen = await prisma.ausstattungsPosition.findMany({
    where: { vorschlagSchluessel: { in: ["IT_IPAD", "FACILITY_SCHLUESSEL", "IT_ZUGAENGE"] } },
  });
  const posNach = Object.fromEntries(positionen.map((p) => [p.vorschlagSchluessel, p]));
  const erwartet = {
    IT_IPAD: ["RUECKGABE", "IT_HARDWARE", "Inventarnummer"],
    FACILITY_SCHLUESSEL: ["RUECKGABE", "SCHLUESSEL", "Schlüsselnummer"],
    IT_ZUGAENGE: ["SPERREN", null, null],
  };
  for (const [schluessel, [bei, kat, label]] of Object.entries(erwartet)) {
    const p = posNach[schluessel];
    pruefe(
      `Katalog ${schluessel}: beiAustritt=${bei}, Kategorie=${kat}, Kennung „${label}“, aktiv`,
      !!p && p.beiAustritt === bei && p.rueckgabeKategorie === kat && p.ausgabeKennung === label && p.isActive,
      p ? `${p.beiAustritt}/${p.rueckgabeKategorie}/${p.ausgabeKennung}/aktiv=${p.isActive}` : "Position fehlt",
    );
  }

  // ------------------------------------------------------------------
  schritt("2 Onboarding am Gymnasium mit Führungskraft, Modalitäten mit Ausstattung");
  // ------------------------------------------------------------------
  const vorname = "Paula";
  const nachname = `Probe-A4-${stempel}`;
  const privat = `paula.probe-a4-${stempel}@beispiel.invalid`;
  const fkAdresse = `fk.probe-a4-${stempel}@beispiel.invalid`;
  const anlage = await api("POST", "/api/onboarding", {
    body: { email: privat, organizationId: gym.id, firstName: vorname, lastName: nachname, supervisorEmail: fkAdresse },
  });
  muss(`POST /api/onboarding → 201`, anlage.status === 201 && !!anlage.json?.id, `Status ${anlage.status}: ${kurz(anlage.json)}`);
  const onbId = anlage.json.id;
  info(`Onboarding ${anlage.json.displayId} (${onbId}), Person „${vorname} ${nachname}“`);
  pruefe("Antwort trägt den Modalitäten-Link (vorgesetzter.modalitaetenLink)", !!anlage.json?.vorgesetzter?.modalitaetenLink);
  info(`Mailversand Fragebogen: ${anlage.json?.mailVersand ?? "—"}, Führungskraft: ${anlage.json?.vorgesetzter?.mailVersand ?? "—"} (ohne Mailserver erwartet: FAILED)`);

  const detail0 = await api("GET", `/api/onboarding/${onbId}`);
  const supToken = detail0.json?.supervisorToken;
  muss(`GET /api/onboarding/[id] liefert supervisorToken (${tokenKurz(supToken)})`, detail0.status === 200 && typeof supToken === "string" && supToken.length > 10);
  const sd0 = await prisma.supervisorData.findUnique({ where: { onboardingId: onbId } });
  pruefe("Merker SupervisorData.mitAusstattung = true", sd0?.mitAusstattung === true, `mitAusstattung=${sd0?.mitAusstattung}`);

  const mod = await api("GET", `/api/modalitaeten/${supToken}`, { token: true });
  muss(`GET /api/modalitaeten/[token] → 200 mit Ausstattungsschritt`, mod.status === 200 && !!mod.json?.ausstattung, `Status ${mod.status}`);
  const formPos = findeAlle(mod.json.ausstattung, (o) => typeof o.id === "string" && typeof o.bezeichnung === "string" && typeof o.art === "string");
  const fIpad = formPos.find((p) => p.bezeichnung === POS_IPAD && p.art === "JA_NEIN");
  const fSchl = formPos.find((p) => p.bezeichnung === POS_SCHLUESSEL && p.art === "AUSWAHL" && p.optionen?.includes(OPT_HAUPTEINGANG));
  const fZug = formPos.find(
    (p) => p.bezeichnung === POS_ZUGAENGE && p.art === "AUSWAHL" && p.optionen?.some((o) => o.includes(OPT_DIENSTMAIL_TEIL)),
  );
  const optMail = fZug?.optionen.find((o) => o.includes(OPT_DIENSTMAIL_TEIL));
  muss(
    `Formular bietet „${POS_IPAD}“, „${POS_SCHLUESSEL}“ (${OPT_HAUPTEINGANG}) und „${POS_ZUGAENGE}“ (${optMail ?? OPT_DIENSTMAIL_TEIL}) an`,
    !!fIpad && !!fSchl && !!fZug,
    `gefunden: ${formPos.map((p) => p.bezeichnung).join(", ")}`,
  );

  const vertragsbeginn = tagPlus(heute, 20);
  const schritte = [
    { betriebsstaette: `${gym.name} (Probe A4)`, stellenbeschreibung: "Lehrkraft (Probe A4)", vertragsbeginn, befristet: false, currentStep: 1 },
    { vollzeit: true, hauptarbeitgeberId: gym.mandantNumber, svPflichtig: true, minijob: false, ehrenamt: false, currentStep: 2 },
    { verguetungsmodell: "TV_L", entgeltgruppe: "E13", stufe: "1", currentStep: 3 },
    { kostenstellen: [], probezeit: true, probezeitMonate: 6, urlaubstageProJahr: 30, zeiterfassung: false, currentStep: 4 },
    {
      ausstattung: [
        { positionId: fIpad.id, gewaehlt: true },
        { positionId: fSchl.id, auswahl: [OPT_HAUPTEINGANG] },
        { positionId: fZug.id, auswahl: [optMail] },
      ],
      hinweise: [],
      currentStep: 5,
    },
  ];
  for (const [i, s] of schritte.entries()) {
    const r = await api("PUT", `/api/modalitaeten/${supToken}`, { body: s, token: true });
    muss(`PUT /api/modalitaeten/[token] Schritt ${i + 1} → 200`, r.status === 200, `Status ${r.status}: ${kurz(r.json)}`);
  }
  const abgabe = await api("POST", `/api/modalitaeten/${supToken}`, { token: true });
  muss(`POST /api/modalitaeten/[token] (Abgabe) → 200`, abgabe.status === 200, `Status ${abgabe.status}: ${kurz(abgabe.json)}`);

  const onb1 = await prisma.onboardingProcess.findUnique({
    where: { id: onbId },
    select: { supervisorSubmittedAt: true, status: true, supervisorData: { select: { vertragsbeginn: true, ausgabenAngeboten: true } } },
  });
  pruefe("Modalitäten eingereicht (supervisorSubmittedAt gesetzt)", !!onb1?.supervisorSubmittedAt, `Status ${onb1?.status}`);
  pruefe(
    `Vertragsbeginn gespeichert (${vertragsbeginn})`,
    !!onb1?.supervisorData?.vertragsbeginn && onb1.supervisorData.vertragsbeginn.toISOString().slice(0, 10) === vertragsbeginn,
    onb1?.supervisorData?.vertragsbeginn?.toISOString(),
  );
  pruefe("Merker SupervisorData.ausgabenAngeboten = true", onb1?.supervisorData?.ausgabenAngeboten === true, `${onb1?.supervisorData?.ausgabenAngeboten}`);

  const zeilen = await prisma.onboardingAusstattung.findMany({
    where: { onboardingId: onbId },
    include: { aufgaben: { include: { checklistItem: true } } },
  });
  const zIpad = zeilen.find((z) => z.bezeichnung === POS_IPAD);
  const zSchl = zeilen.find((z) => z.bezeichnung === POS_SCHLUESSEL);
  const zZug = zeilen.find((z) => z.bezeichnung === POS_ZUGAENGE);
  pruefe(
    "Ausstattungszeilen mit Momentaufnahme „Beim Austritt“ (iPad RUECKGABE, Schlüssel RUECKGABE, Zugänge SPERREN)",
    zIpad?.beiAustritt === "RUECKGABE" && zSchl?.beiAustritt === "RUECKGABE" && zZug?.beiAustritt === "SPERREN",
    `iPad=${zIpad?.beiAustritt}, Schlüssel=${zSchl?.beiAustritt}, Zugänge=${zZug?.beiAustritt}`,
  );
  const aIpad = zIpad?.aufgaben.find((a) => a.option === "")?.checklistItem;
  const aSchl = zSchl?.aufgaben.find((a) => a.option === OPT_HAUPTEINGANG)?.checklistItem;
  const aZug = zZug?.aufgaben.find((a) => a.option === optMail)?.checklistItem;
  muss(
    `Ausstattungsaufgaben angelegt (iPad → IT, Haupteingang → FACILITY, ${optMail} → IT)`,
    aIpad?.assignee === "IT" && aSchl?.assignee === "FACILITY" && aZug?.assignee === "IT" &&
      [aIpad, aSchl, aZug].every((a) => a.herkunft === "AUSSTATTUNG"),
    `iPad=${aIpad?.assignee}/${aIpad?.herkunft}, Haupteingang=${aSchl?.assignee}, ${optMail}=${aZug?.assignee}`,
  );
  info(`Aufgaben: „${aIpad.title}“, „${aSchl.title}“, „${aZug.title}“`);

  // ------------------------------------------------------------------
  schritt("3 Abteilungen informieren (ohne Mailserver)");
  // ------------------------------------------------------------------
  const informieren = await api("POST", `/api/onboarding/${onbId}/abteilungen`);
  pruefe(
    `POST /api/onboarding/[id]/abteilungen → 502 (kein Mailserver, alle Versuche scheitern)`,
    informieren.status === 502,
    `Status ${informieren.status}: ${kurz(informieren.json?.meldung ?? informieren.json?.error ?? informieren.json, 200)}`,
  );
  const onbLinks = await prisma.offboardingDepartmentLink.findMany({ where: { onboardingId: onbId } });
  const linkIt = onbLinks.find((l) => l.departmentKey === "IT");
  const linkFac = onbLinks.find((l) => l.departmentKey === "FACILITY");
  muss(
    "Links für IT und FACILITY trotzdem angelegt",
    !!linkIt && !!linkFac,
    `Links: ${onbLinks.map((l) => `${l.departmentKey}(${l.lastSendStatus ?? "—"})`).join(", ")}`,
  );
  pruefe(
    "Ohne Zustellung kein Nachweis (sentAt leer, lastSendStatus FAILED)",
    linkIt.sentAt === null && linkFac.sentAt === null && linkIt.lastSendStatus === "FAILED" && linkFac.lastSendStatus === "FAILED",
    `IT: sentAt=${linkIt.sentAt}, ${linkIt.lastSendStatus}; FACILITY: sentAt=${linkFac.sentAt}, ${linkFac.lastSendStatus}`,
  );
  info(`Token IT ${tokenKurz(linkIt.token)}, FACILITY ${tokenKurz(linkFac.token)}`);

  // ------------------------------------------------------------------
  schritt("4 Übergabe über die Links der Stellen vermerken");
  // ------------------------------------------------------------------
  const seiteIt = await api("GET", `/api/onboarding-tasks/${linkIt.token}`, { token: true });
  muss(`GET /api/onboarding-tasks/[IT-Token] → 200`, seiteIt.status === 200, `Status ${seiteIt.status}`);
  const itAufgaben = seiteIt.json?.data?.aufgaben ?? [];
  const itIpad = itAufgaben.find((a) => a.id === aIpad.id);
  const itZug = itAufgaben.find((a) => a.id === aZug.id);
  pruefe(
    "iPad-Aufgabe: ausgabe = { moeglich: true, art: RUECKGABE, kennungLabel: Inventarnummer, stuecke: [] }",
    itIpad?.ausgabe?.moeglich === true &&
      itIpad.ausgabe.art === "RUECKGABE" &&
      itIpad.ausgabe.kennungLabel === "Inventarnummer" &&
      Array.isArray(itIpad.ausgabe.stuecke) &&
      itIpad.ausgabe.stuecke.length === 0,
    kurz(itIpad?.ausgabe),
  );
  pruefe("Zugangs-Aufgabe: ausgabe.art = SPERREN", itZug?.ausgabe?.art === "SPERREN", kurz(itZug?.ausgabe));
  const fremdeMitAusgabe = itAufgaben.filter((a) => a.id !== aIpad.id && a.id !== aZug.id && "ausgabe" in a);
  pruefe(
    `Übrige IT-Aufgaben ohne Schlüssel „ausgabe“ (${itAufgaben.length - 2} weitere)`,
    fremdeMitAusgabe.length === 0,
    fremdeMitAusgabe.map((a) => a.title).join(", "),
  );
  pruefe(
    "Keine Kennung in Titel/Beschreibung auf der Link-Seite",
    !itAufgaben.some((a) => enthaeltKennung(a.title) || enthaeltKennung(a.description)),
  );

  const vermerkIt = await api("POST", `/api/onboarding-tasks/${linkIt.token}/${aIpad.id}/ausgaben`, {
    body: { stuecke: [{ kennung: KENNUNG_IPAD }] },
    token: true,
  });
  pruefe(
    `IT vermerkt iPad mit Kennung ${KENNUNG_IPAD} → 201, ein entfernbares Stück`,
    vermerkIt.status === 201 &&
      vermerkIt.json?.data?.ausgabe?.stuecke?.length === 1 &&
      vermerkIt.json.data.ausgabe.stuecke[0].kennung === KENNUNG_IPAD &&
      vermerkIt.json.data.ausgabe.stuecke[0].entfernbar === true &&
      vermerkIt.json.data.ausgabe.stuecke[0].uebergebenAm === heute,
    `Status ${vermerkIt.status}: ${kurz(vermerkIt.json)}`,
  );

  const fremd = await api("POST", `/api/onboarding-tasks/${linkFac.token}/${aIpad.id}/ausgaben`, {
    body: { stuecke: [{ kennung: "PROBE-FREMD" }] },
    token: true,
  });
  pruefe(`FACILITY auf die iPad-Aufgabe der IT → 404 (fremde Aufgabe)`, fremd.status === 404, `Status ${fremd.status}: ${kurz(fremd.json)}`);

  const seiteFac = await api("GET", `/api/onboarding-tasks/${linkFac.token}`, { token: true });
  const facSchl = (seiteFac.json?.data?.aufgaben ?? []).find((a) => a.id === aSchl.id);
  pruefe(
    "FACILITY-Seite: Haupteingang-Aufgabe mit ausgabe (Schlüsselnummer, RUECKGABE)",
    seiteFac.status === 200 && facSchl?.ausgabe?.moeglich === true && facSchl.ausgabe.kennungLabel === "Schlüsselnummer" && facSchl.ausgabe.art === "RUECKGABE",
    `Status ${seiteFac.status}: ${kurz(facSchl?.ausgabe)}`,
  );
  pruefe(
    "FACILITY sieht die iPad-Aufgabe der IT nicht",
    !(seiteFac.json?.data?.aufgaben ?? []).some((a) => a.id === aIpad.id),
  );
  const vermerkFac = await api("POST", `/api/onboarding-tasks/${linkFac.token}/${aSchl.id}/ausgaben`, {
    body: { stuecke: [{ kennung: KENNUNG_SCHLUESSEL, uebergebenAm: heute }] },
    token: true,
  });
  pruefe(
    `FACILITY vermerkt Schlüssel „${OPT_HAUPTEINGANG}“ mit Kennung ${KENNUNG_SCHLUESSEL} → 201`,
    vermerkFac.status === 201 && vermerkFac.json?.data?.ausgabe?.stuecke?.[0]?.kennung === KENNUNG_SCHLUESSEL,
    `Status ${vermerkFac.status}: ${kurz(vermerkFac.json)}`,
  );

  // Zugang abhaken OHNE Einrichtungsvermerk – für die Lage „ohne Übergabevermerk“ im Austritt.
  const zugErledigt = await api("PATCH", `/api/onboarding-tasks/${linkIt.token}/${aZug.id}`, {
    body: { isCompleted: true },
    token: true,
  });
  pruefe(
    `IT hakt „${aZug.title}“ ab, ohne einen Vermerk → 200`,
    zugErledigt.status === 200,
    `Status ${zugErledigt.status}: ${kurz(zugErledigt.json, 200)}`,
  );

  const ausgaben1 = await prisma.ausgabe.findMany({ where: { onboardingId: onbId }, orderBy: { createdAt: "asc" } });
  const gIpad = ausgaben1.find((a) => a.checklistItemId === aIpad.id);
  const gSchl = ausgaben1.find((a) => a.checklistItemId === aSchl.id);
  pruefe(`Genau zwei Ausgaben in der Tabelle ausgaben (gefunden: ${ausgaben1.length})`, ausgaben1.length === 2);
  pruefe(
    "Ausgabe iPad: AUSGEGEBEN, Kennung, IT, RUECKGABE/IT_HARDWARE, Quelle LINK, Gymnasium, Übergabe heute, ohne Löschfrist",
    !!gIpad &&
      gIpad.zustand === "AUSGEGEBEN" &&
      gIpad.kennung === KENNUNG_IPAD &&
      gIpad.kennungLabel === "Inventarnummer" &&
      gIpad.departmentKey === "IT" &&
      gIpad.beiAustritt === "RUECKGABE" &&
      gIpad.rueckgabeKategorie === "IT_HARDWARE" &&
      gIpad.quelle === "LINK" &&
      gIpad.organizationId === gym.id &&
      gIpad.bezeichnung === POS_IPAD &&
      gIpad.uebergebenAm.toISOString().slice(0, 10) === heute &&
      gIpad.loeschenAb === null,
    gIpad ? `${gIpad.zustand}/${gIpad.kennung}/${gIpad.departmentKey}/${gIpad.quelle}/${gIpad.bezeichnung}/${gIpad.uebergebenAm.toISOString().slice(0, 10)}/loeschenAb=${gIpad.loeschenAb}` : "fehlt",
  );
  pruefe(
    `Ausgabe Schlüssel: AUSGEGEBEN, „${POS_SCHLUESSEL}: ${OPT_HAUPTEINGANG}“, FACILITY, SCHLUESSEL, Kennung`,
    !!gSchl &&
      gSchl.zustand === "AUSGEGEBEN" &&
      gSchl.kennung === KENNUNG_SCHLUESSEL &&
      gSchl.bezeichnung === `${POS_SCHLUESSEL}: ${OPT_HAUPTEINGANG}` &&
      gSchl.departmentKey === "FACILITY" &&
      gSchl.rueckgabeKategorie === "SCHLUESSEL" &&
      gSchl.kennungLabel === "Schlüsselnummer",
    gSchl ? `${gSchl.zustand}/${gSchl.kennung}/${gSchl.bezeichnung}/${gSchl.departmentKey}/${gSchl.rueckgabeKategorie}` : "fehlt",
  );
  muss("Beide Ausgaben vorhanden (Voraussetzung für die folgenden Schritte)", !!gIpad && !!gSchl);

  const onbItems = await prisma.checklistItem.findMany({ where: { onboardingId: onbId } });
  pruefe(
    `Kennung nicht in ChecklistItem.title/description/notes (${onbItems.length} Aufgaben)`,
    !onbItems.some((i) => enthaeltKennung(i.title) || enthaeltKennung(i.description) || enthaeltKennung(i.notes)),
  );
  const vermerkLogs = await prisma.auditLog.findMany({ where: { onboardingId: onbId, action: "AUSGABE_VERMERKT" } });
  pruefe(
    `AuditLog AUSGABE_VERMERKT zweimal, details ohne Kennung (mitKennung: true, ueber: LINK)`,
    vermerkLogs.length === 2 &&
      vermerkLogs.every((l) => !enthaeltKennung(l.details) && l.details?.mitKennung === true && l.details?.ueber === "LINK" && l.userId === null),
    kurz(vermerkLogs.map((l) => l.details)),
  );

  await screenshot(`${BASE}/onboarding-tasks/${linkIt.token}`, "a4-onboarding-link-it.png", "Link-Seite IT (Onboarding)");

  // ------------------------------------------------------------------
  schritt("5 HR-Karte „Ausstattung & Zugänge“: Ausgaben anzeigen und korrigieren");
  // ------------------------------------------------------------------
  const detail1 = await api("GET", `/api/onboarding/${onbId}`);
  const kartenStuecke = findeAlle(detail1.json?.ausstattung, (o) => (o.id === gIpad.id || o.id === gSchl.id) && "kennung" in o && "aktionen" in o);
  const kIpad = kartenStuecke.find((o) => o.id === gIpad.id);
  const kSchl = kartenStuecke.find((o) => o.id === gSchl.id);
  pruefe(
    "GET /api/onboarding/[id]: ausstattung zeigt beide Ausgaben mit Kennung und Aktionen",
    detail1.status === 200 && kIpad?.kennung === KENNUNG_IPAD && kSchl?.kennung === KENNUNG_SCHLUESSEL && kIpad?.aktionen?.korrigieren === true,
    `iPad: ${kurz(kIpad?.text)} · Schlüssel: ${kurz(kSchl?.text)}`,
  );
  pruefe(
    "Karte: Schlüssel-Zeile ist als Schlüssel markiert und hat „tauschen“",
    findeAlle(detail1.json?.ausstattung, (o) => o.schluessel === true && Array.isArray(o.ausgaben) && o.ausgaben.some((a) => a.id === gSchl.id)).length === 1 &&
      kSchl?.aktionen?.tauschen === true,
  );

  const falsch = await api("POST", `/api/onboarding/${onbId}/ausgaben`, {
    body: { aktion: "korrigieren", ausgabeId: gIpad.id, kennung: "<b>PROBE</b>" },
  });
  pruefe("Kennung mit spitzen Klammern → 400", falsch.status === 400, `Status ${falsch.status}: ${kurz(falsch.json)}`);

  const korr = await api("POST", `/api/onboarding/${onbId}/ausgaben`, {
    body: { aktion: "korrigieren", ausgabeId: gIpad.id, kennung: KENNUNG_IPAD_KORR },
  });
  const korrStueck = findeAlle(korr.json?.data, (o) => o.id === gIpad.id && "kennung" in o)[0];
  pruefe(
    `POST /api/onboarding/[id]/ausgaben (korrigieren → ${KENNUNG_IPAD_KORR}) → 200, Übersicht mit neuer Kennung`,
    korr.status === 200 && korrStueck?.kennung === KENNUNG_IPAD_KORR && typeof korr.json?.meldung === "string",
    `Status ${korr.status}: meldung=${kurz(korr.json?.meldung ?? korr.json?.error)}`,
  );
  const gIpadKorr = await prisma.ausgabe.findUnique({ where: { id: gIpad.id } });
  pruefe("Datenbank: Kennung korrigiert, Zustand weiter AUSGEGEBEN", gIpadKorr?.kennung === KENNUNG_IPAD_KORR && gIpadKorr.zustand === "AUSGEGEBEN", `${gIpadKorr?.kennung}/${gIpadKorr?.zustand}`);
  const korrLog = await prisma.auditLog.findFirst({ where: { onboardingId: onbId, action: "AUSGABE_KORRIGIERT" }, orderBy: { createdAt: "desc" } });
  pruefe("AuditLog AUSGABE_KORRIGIERT ohne Kennung in details", !!korrLog && !enthaeltKennung(korrLog.details), kurz(korrLog?.details));

  // ------------------------------------------------------------------
  schritt("6 Offboarding derselben Person, Einstellung zuordnen");
  // ------------------------------------------------------------------
  const letzterTag = tagPlus(heute, 40);
  const offAnlage = await api("POST", "/api/offboarding", {
    body: {
      employeeFirstName: vorname,
      employeeLastName: nachname,
      employeeEmail: `paula.dienst-a4-${stempel}@beispiel.invalid`,
      employeePrivateEmail: privat,
      organizationId: gym.id,
      exitType: "KUENDIGUNG_ARBEITNEHMER",
      lastWorkingDay: letzterTag,
    },
  });
  muss(`POST /api/offboarding → 201`, offAnlage.status === 201 && !!offAnlage.json?.id, `Status ${offAnlage.status}: ${kurz(offAnlage.json)}`);
  const offId = offAnlage.json.id;
  info(`Offboarding ${offAnlage.json.displayId} (${offId}), letzter Arbeitstag ${letzterTag}`);

  const einst = await api("GET", `/api/offboarding/${offId}/einstellung`);
  const vorschlag = (einst.json?.data?.vorschlaege ?? []).find((v) => v.onboardingId === onbId);
  pruefe(
    "GET /api/offboarding/[id]/einstellung: Vorschläge enthalten das Onboarding (Stufe STARK)",
    einst.status === 200 && einst.json?.data?.zuordenbar === true && vorschlag?.stufe === "STARK",
    `Status ${einst.status}: ${vorschlag ? `${vorschlag.stufe}, ${vorschlag.gruende.map((g) => g.schluessel).join("+")}` : kurz(einst.json?.data?.vorschlaege)}`,
  );
  pruefe("Vorschlag ohne Adressen (kein @ im Vorschlag)", !!vorschlag && !JSON.stringify(vorschlag).includes("@"));

  const vorschau = await api("GET", `/api/offboarding/${offId}/einstellung?vorschau=${onbId}`);
  pruefe(
    "Vorschau zur Einstellung (GET ?vorschau=) → 200 mit vorschau",
    vorschau.status === 200 && !!vorschau.json?.data?.vorschau,
    `Status ${vorschau.status}: ${kurz(vorschau.json?.data?.vorschau, 400)}`,
  );

  const zuordnen = await api("POST", `/api/offboarding/${offId}/einstellung`, { body: { aktion: "zuordnen", onboardingId: onbId } });
  pruefe(
    "POST /api/offboarding/[id]/einstellung (zuordnen) → 200",
    zuordnen.status === 200 && !!zuordnen.json?.data,
    `Status ${zuordnen.status}: ${kurz(zuordnen.json?.meldung ?? zuordnen.json?.error)}`,
  );
  info(`Meldung: ${zuordnen.json?.meldung ?? "—"}`);

  const off1 = await prisma.offboardingProcess.findUnique({ where: { id: offId } });
  pruefe("OffboardingProcess.onboardingId gesetzt", off1?.onboardingId === onbId, `${off1?.onboardingId}`);
  pruefe("weitereBeschaeftigung = false (Vorbelegung bei Kündigung)", off1?.weitereBeschaeftigung === false, `${off1?.weitereBeschaeftigung}`);
  pruefe("Arbeitsort bleibt leer (Einstellung ohne abweichenden Arbeitsort, G12)", off1?.arbeitsortId === null, `${off1?.arbeitsortId}`);

  const offItems1 = await prisma.offboardingChecklistItem.findMany({ where: { offboardingId: offId } });
  const ruecknahme = offItems1.filter((i) => i.herkunft === "AUSGABE");
  const rIpad = ruecknahme.find((i) => i.ausgabeId === gIpad.id);
  const rSchl = ruecknahme.find((i) => i.ausgabeId === gSchl.id);
  pruefe(
    `Rücknahmeaufgaben (herkunft AUSGABE) je Ausgabe: ${ruecknahme.length}`,
    ruecknahme.length === 2 && !!rIpad && !!rSchl,
    ruecknahme.map((i) => `${i.assigneeDepartment}: ${i.title}`).join(" | "),
  );
  pruefe(
    "Titel der Rücknahmeaufgaben aus der Bezeichnung, Stelle = ausgebende Stelle",
    rIpad?.title === `${POS_IPAD} zurücknehmen` && rIpad.assigneeDepartment === "IT" &&
      rSchl?.title === `${POS_SCHLUESSEL}: ${OPT_HAUPTEINGANG} zurücknehmen` && rSchl.assigneeDepartment === "FACILITY",
    `${rIpad?.title} (${rIpad?.assigneeDepartment}) · ${rSchl?.title} (${rSchl?.assigneeDepartment})`,
  );
  pruefe(
    "Keine Kennung in Titel/Beschreibung irgendeiner Offboarding-Aufgabe",
    !offItems1.some((i) => enthaeltKennung(i.title) || enthaeltKennung(i.description)),
  );
  pruefe(
    "Keine Sperraufgabe für den Zugang (kein Zugang als eingerichtet vermerkt)",
    !offItems1.some((i) => i.herkunft === "AUSGABE" && i.title.endsWith(" sperren")),
    offItems1.filter((i) => i.herkunft).map((i) => i.title).join(" | "),
  );

  const rueck1 = await prisma.returnItem.findMany({ where: { offboardingId: offId } });
  const riIpad = rueck1.find((r) => r.ausgabeId === gIpad.id);
  const riSchl = rueck1.find((r) => r.ausgabeId === gSchl.id);
  pruefe(
    "ReturnItem je RUECKGABE-Stück mit ausgabeId und serialNumber = Kennung",
    !!riIpad && !!riSchl &&
      riIpad.serialNumber === KENNUNG_IPAD_KORR && riIpad.category === "IT_HARDWARE" &&
      riSchl.serialNumber === KENNUNG_SCHLUESSEL && riSchl.category === "SCHLUESSEL" &&
      !riIpad.isReturned && !riSchl.isReturned && riIpad.zustand === null && riSchl.zustand === null,
    `iPad: ${riIpad?.itemName}/${riIpad?.serialNumber}/${riIpad?.category} · Schlüssel: ${riSchl?.itemName}/${riSchl?.serialNumber}/${riSchl?.category}`,
  );
  pruefe(`Nur diese zwei Rückgabe-Zeilen mit ausgabeId (insgesamt ${rueck1.length})`, rueck1.filter((r) => r.ausgabeId).length === 2);
  pruefe("Keine Kennung im itemName der Rückgaben", !rueck1.some((r) => enthaeltKennung(r.itemName)));

  const offDetail1 = await api("GET", `/api/offboarding/${offId}`);
  const rg = offDetail1.json?.rueckgaben;
  pruefe(
    "GET /api/offboarding/[id]: rueckgaben.lage = AUSGABEN, 2 Gegenstände, 0 Zugänge",
    offDetail1.status === 200 && rg?.lage === "AUSGABEN",
    `lage=${rg?.lage}: ${rg?.text}`,
  );
  const ohneVermerk = (rg?.ohneVermerk ?? []).find((o) => o.checklistItemId === aZug.id);
  pruefe(
    "Lage „ohne Übergabevermerk“: der abgehakte Zugang steht in rueckgaben.ohneVermerk",
    !!ohneVermerk && (rg?.ohneVermerk ?? []).length === 1 && ohneVermerk.erledigtAm === heute,
    kurz(rg?.ohneVermerk),
  );
  pruefe("Keine Sperraufgaben-Zeile im Reiter (rueckgaben.sperraufgaben leer)", Array.isArray(rg?.sperraufgaben) && rg.sperraufgaben.length === 0, kurz(rg?.sperraufgaben));
  info(`Reiter „Rückgaben“: ${rg?.text ?? "—"} · Zeilen: ${(rg?.zeilen ?? []).length} · offen: ${(rg?.offen ?? []).length}`);

  const zLogs = await prisma.auditLog.findMany({ where: { offboardingId: offId, action: { in: ["EINSTELLUNG_ZUGEORDNET", "RUECKGABEN_VORGESCHLAGEN"] } } });
  pruefe(
    "AuditLog EINSTELLUNG_ZUGEORDNET und RUECKGABEN_VORGESCHLAGEN, details ohne Kennung",
    zLogs.some((l) => l.action === "EINSTELLUNG_ZUGEORDNET") && zLogs.some((l) => l.action === "RUECKGABEN_VORGESCHLAGEN") && zLogs.every((l) => !enthaeltKennung(l.details)),
    kurz(zLogs.map((l) => ({ a: l.action, d: l.details })), 500),
  );

  const offInformieren = await api("POST", `/api/offboarding/${offId}/department-links`, { body: {} });
  pruefe(
    "POST /api/offboarding/[id]/department-links (informieren) → 502 ohne Mailserver",
    offInformieren.status === 502,
    `Status ${offInformieren.status}: ${kurz(offInformieren.json?.meldung ?? offInformieren.json?.error, 200)}`,
  );
  const offLinks = await prisma.offboardingDepartmentLink.findMany({ where: { offboardingId: offId } });
  const offLinkIt = offLinks.find((l) => l.departmentKey === "IT");
  const offLinkFac = offLinks.find((l) => l.departmentKey === "FACILITY");
  muss(
    "Offboarding-Links für IT und FACILITY angelegt",
    !!offLinkIt && !!offLinkFac,
    offLinks.map((l) => `${l.departmentKey}(${l.lastSendStatus ?? "—"})`).join(", "),
  );
  info(`Offboarding-Token IT ${tokenKurz(offLinkIt.token)}, FACILITY ${tokenKurz(offLinkFac.token)}`);

  // ------------------------------------------------------------------
  schritt("7 Rückgaben: Schlüssel fehlt, iPad zurück");
  // ------------------------------------------------------------------
  const fehlt = await api("PATCH", `/api/offboarding/${offId}/return-items`, { body: { itemId: riSchl.id, zustand: "FEHLT" } });
  pruefe(
    "PATCH /api/offboarding/[id]/return-items { zustand: FEHLT } für den Schlüssel → 200",
    fehlt.status === 200,
    `Status ${fehlt.status}: ${kurz(fehlt.json, 200)}`,
  );
  const gSchl2 = await prisma.ausgabe.findUnique({ where: { id: gSchl.id } });
  const fehltJahr = Number(berlinTag(gSchl2?.zustandAm ?? new Date()).slice(0, 4));
  const fehltLoeschTag = `${fehltJahr + 4}-01-01`;
  pruefe(
    `Ausgabe Schlüssel: FEHLT, loeschenAb = 1.1.${fehltJahr + 4} (Beginn des Berliner Tages)`,
    gSchl2?.zustand === "FEHLT" && istBerlinerTagesbeginn(gSchl2.loeschenAb, fehltLoeschTag),
    `${gSchl2?.zustand}, loeschenAb=${gSchl2?.loeschenAb?.toISOString()} (Berlin ${gSchl2?.loeschenAb ? `${berlinTag(gSchl2.loeschenAb)} ${berlinZeit(gSchl2.loeschenAb)}` : "—"})`,
  );
  const riSchl2 = await prisma.returnItem.findUnique({ where: { id: riSchl.id } });
  pruefe("ReturnItem Schlüssel: zustand FEHLT", riSchl2?.zustand === "FEHLT", `zustand=${riSchl2?.zustand}, isReturned=${riSchl2?.isReturned}`);
  const offItems2 = await prisma.offboardingChecklistItem.findMany({ where: { offboardingId: offId } });
  const folge = offItems2.filter((i) => i.herkunft === "AUSGABE_FEHLT");
  const fSchlAufgabe = folge.find((i) => i.ausgabeId === gSchl.id);
  pruefe(
    `Folgeaufgabe „Schließung prüfen: ${POS_SCHLUESSEL}: ${OPT_HAUPTEINGANG}“ für FACILITY, offen, ohne Kennung`,
    folge.length === 1 &&
      fSchlAufgabe?.title === `Schließung prüfen: ${POS_SCHLUESSEL}: ${OPT_HAUPTEINGANG}` &&
      fSchlAufgabe.assigneeDepartment === "FACILITY" &&
      fSchlAufgabe.isCompleted === false &&
      !enthaeltKennung(fSchlAufgabe.title) &&
      !enthaeltKennung(fSchlAufgabe.description),
    folge.map((i) => `${i.assigneeDepartment}: ${i.title} (erledigt=${i.isCompleted})`).join(" | "),
  );
  const rSchl2 = offItems2.find((i) => i.id === rSchl.id);
  pruefe(
    "Rücknahmeaufgabe Schlüssel im Gleichlauf erledigt (durch HR, completedById gesetzt)",
    rSchl2?.isCompleted === true && !!rSchl2.completedById,
    `isCompleted=${rSchl2?.isCompleted}, completedById=${rSchl2?.completedById ? "gesetzt" : "leer"}`,
  );

  const ipadHaken = await api("PATCH", `/api/offboarding/${offId}/checklist/${rIpad.id}`, { body: { isCompleted: true } });
  pruefe(
    "Portal-PATCH /api/offboarding/[id]/checklist/[iPad-Aufgabe] { isCompleted: true } (ohne Zustand) → 200",
    ipadHaken.status === 200,
    `Status ${ipadHaken.status}: ${kurz(ipadHaken.json, 200)}`,
  );
  const riIpad2 = await prisma.returnItem.findUnique({ where: { id: riIpad.id } });
  pruefe(
    "ReturnItem iPad: isReturned = true, zustand ZURUECK, returnedAt gesetzt",
    riIpad2?.isReturned === true && riIpad2.zustand === "ZURUECK" && !!riIpad2.returnedAt,
    `isReturned=${riIpad2?.isReturned}, zustand=${riIpad2?.zustand}, returnedAt=${riIpad2?.returnedAt?.toISOString()}`,
  );
  const gIpad2 = await prisma.ausgabe.findUnique({ where: { id: gIpad.id } });
  const zurueckLoeschTag = monatePlus(berlinTag(gIpad2?.zustandAm ?? new Date()), 6);
  pruefe(
    `Ausgabe iPad: ZURUECK, loeschenAb = ${zurueckLoeschTag} (sechs Monate, Beginn des Berliner Tages)`,
    gIpad2?.zustand === "ZURUECK" && istBerlinerTagesbeginn(gIpad2.loeschenAb, zurueckLoeschTag),
    `${gIpad2?.zustand}, loeschenAb=${gIpad2?.loeschenAb?.toISOString()} (Berlin ${gIpad2?.loeschenAb ? `${berlinTag(gIpad2.loeschenAb)} ${berlinZeit(gIpad2.loeschenAb)}` : "—"})`,
  );
  const zLog2 = await prisma.auditLog.findMany({ where: { offboardingId: offId, action: "AUSGABE_ZUSTAND_GEAENDERT" } });
  pruefe(
    `AuditLog AUSGABE_ZUSTAND_GEAENDERT (${zLog2.length}×), details ohne Kennung`,
    zLog2.length >= 2 && zLog2.every((l) => !enthaeltKennung(l.details)),
    kurz(zLog2.map((l) => l.details), 400),
  );

  const offSeiteFac = await api("GET", `/api/offboarding-tasks/${offLinkFac.token}`, { token: true });
  const facAufgaben = offSeiteFac.json?.data?.aufgaben ?? [];
  const facFolge = facAufgaben.find((a) => a.id === fSchlAufgabe?.id);
  const facRueck = facAufgaben.find((a) => a.id === rSchl.id);
  pruefe(
    "Offboarding-Link FACILITY: Folgeaufgabe zeigt Kennung nur lesend (zustandLabel „fehlt“, ohne auswahl)",
    offSeiteFac.status === 200 &&
      facFolge?.ausgabe?.kennung === KENNUNG_SCHLUESSEL &&
      facFolge.ausgabe.zustandLabel === "fehlt" &&
      !("auswahl" in facFolge.ausgabe),
    `Status ${offSeiteFac.status}: ${kurz(facFolge?.ausgabe)}`,
  );
  pruefe(
    "Offboarding-Link FACILITY: Rücknahmeaufgabe des Schlüssels mit zustand FEHLT und drei Knöpfen",
    facRueck?.ausgabe?.zustand === "FEHLT" && facRueck.ausgabe.kennung === KENNUNG_SCHLUESSEL && facRueck.ausgabe.auswahl?.length === 3,
    kurz(facRueck?.ausgabe),
  );
  const facFremd = facAufgaben.filter((a) => a.id !== fSchlAufgabe?.id && a.id !== rSchl.id && "ausgabe" in a);
  pruefe("Übrige FACILITY-Aufgaben ohne Schlüssel „ausgabe“", facFremd.length === 0, facFremd.map((a) => a.title).join(", "));
  pruefe("FACILITY-Link zeigt die iPad-Aufgabe der IT nicht", !facAufgaben.some((a) => a.id === rIpad.id));

  const offSeiteIt = await api("GET", `/api/offboarding-tasks/${offLinkIt.token}`, { token: true });
  const itRueck = (offSeiteIt.json?.data?.aufgaben ?? []).find((a) => a.id === rIpad.id);
  pruefe(
    "Offboarding-Link IT: iPad-Aufgabe mit korrigierter Kennung, Zustand ZURUECK",
    offSeiteIt.status === 200 && itRueck?.ausgabe?.kennung === KENNUNG_IPAD_KORR && itRueck.ausgabe.zustand === "ZURUECK" && itRueck.isCompleted === true,
    `Status ${offSeiteIt.status}: ${kurz(itRueck?.ausgabe)}`,
  );

  await screenshot(`${BASE}/offboarding-tasks/${offLinkFac.token}`, "a4-offboarding-link-facility.png", "Link-Seite FACILITY (Offboarding)");

  // ------------------------------------------------------------------
  schritt("8 Abschluss des Austritts, Probelauf der Löschfristen");
  // ------------------------------------------------------------------
  const offVorAbschluss = await api("GET", `/api/offboarding/${offId}`);
  const offenErwartet = offVorAbschluss.json?.rueckgaben?.offen ?? [];
  info(`Noch offen laut Reiter: ${offenErwartet.length ? offenErwartet.map((o) => `${o.titel} (${o.stelle})`).join(" | ") : "nichts"}`);
  const exitVorher = await prisma.offboardingExitData.findUnique({ where: { offboardingId: offId } });

  const abschluss1 = await api("PATCH", `/api/offboarding/${offId}`, {
    body: { status: "COMPLETED", exitData: { successorName: "PROBE-NACHFOLGE" } },
  });
  if (offenErwartet.length > 0) {
    pruefe(
      `PATCH status COMPLETED ohne bestaetigt → 409 RUECKGABEN_OFFEN (${offenErwartet.length} offen)`,
      abschluss1.status === 409 && abschluss1.json?.grund === "RUECKGABEN_OFFEN" && abschluss1.json?.offen?.length === offenErwartet.length,
      `Status ${abschluss1.status}: ${kurz(abschluss1.json)}`,
    );
    pruefe(
      `Die offene Folgeaufgabe wird genannt, ohne Kennung`,
      (abschluss1.json?.offen ?? []).some((o) => o.titel === `Schließung prüfen: ${POS_SCHLUESSEL}: ${OPT_HAUPTEINGANG}`) && !enthaeltKennung(abschluss1.json),
      kurz(abschluss1.json?.offen),
    );
    const offNach409 = await prisma.offboardingProcess.findUnique({ where: { id: offId }, select: { status: true, completedAt: true } });
    const exitNach409 = await prisma.offboardingExitData.findUnique({ where: { offboardingId: offId } });
    pruefe(
      "Nach 409: Status unverändert, nichts abgeschlossen, exitData nicht geschrieben",
      offNach409?.status !== "COMPLETED" && offNach409?.completedAt === null &&
        (exitNach409?.successorName ?? null) === (exitVorher?.successorName ?? null),
      `status=${offNach409?.status}, successorName vorher=${exitVorher?.successorName ?? "—"} nachher=${exitNach409?.successorName ?? "—"}`,
    );
    const abschluss2 = await api("PATCH", `/api/offboarding/${offId}`, { body: { status: "COMPLETED", bestaetigt: true } });
    pruefe("PATCH status COMPLETED mit bestaetigt: true → 200", abschluss2.status === 200, `Status ${abschluss2.status}: ${kurz(abschluss2.json?.error ?? "", 200)}`);
  } else {
    pruefe("PATCH status COMPLETED ohne bestaetigt → 200 (nichts offen)", abschluss1.status === 200, `Status ${abschluss1.status}: ${kurz(abschluss1.json)}`);
  }

  const offEnde = await prisma.offboardingProcess.findUnique({ where: { id: offId }, select: { status: true, completedAt: true } });
  pruefe("Austritt abgeschlossen (status COMPLETED, completedAt gesetzt)", offEnde?.status === "COMPLETED" && !!offEnde.completedAt, `${offEnde?.status}`);
  const abschlussLog = (
    await prisma.auditLog.findMany({ where: { offboardingId: offId }, orderBy: { createdAt: "desc" } })
  ).find((l) => l.details && typeof l.details === "object" && "offeneRueckgaben" in l.details);
  pruefe(
    `AuditLog des Abschlusses nennt offeneRueckgaben (${abschlussLog?.details?.offeneRueckgaben ?? "—"})`,
    !!abschlussLog && typeof abschlussLog.details?.offeneRueckgaben === "number",
    abschlussLog ? `${abschlussLog.action}: ${kurz(abschlussLog.details)}` : "kein Eintrag",
  );
  const gEnde = await prisma.ausgabe.findMany({ where: { onboardingId: onbId } });
  const gIpadEnde = gEnde.find((a) => a.id === gIpad.id);
  const gSchlEnde = gEnde.find((a) => a.id === gSchl.id);
  pruefe(
    "Ausgaben nach dem Abschluss unverändert (iPad ZURUECK, Schlüssel FEHLT, Fristen gleich)",
    gIpadEnde?.zustand === "ZURUECK" && gSchlEnde?.zustand === "FEHLT" &&
      gIpadEnde.loeschenAb?.getTime() === gIpad2.loeschenAb?.getTime() &&
      gSchlEnde.loeschenAb?.getTime() === gSchl2.loeschenAb?.getTime(),
    `iPad ${gIpadEnde?.zustand}/${gIpadEnde?.loeschenAb?.toISOString()}, Schlüssel ${gSchlEnde?.zustand}/${gSchlEnde?.loeschenAb?.toISOString()}`,
  );

  // Probelauf „Aufbewahrung erzeugter Dokumente“
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    hinweis(
      "Probelauf „Aufbewahrung erzeugter Dokumente“ übersprungen",
      "CRON_SECRET fehlt in der Umgebung (.env) – POST /api/cron/dokumente-aufbewahrung?dryRun=1 nicht aufgerufen",
    );
  } else {
    const zaehlen = async () => ({
      ausgaben: await prisma.ausgabe.count(),
      faellig: await prisma.ausgabe.count({ where: { loeschenAb: { lte: new Date() } } }),
      eigene: await prisma.ausgabe.count({ where: { onboardingId: onbId } }),
      geloeschtMerker: await prisma.checklistItem.count({ where: { ausgabenGeloeschtAm: { not: null } } }),
    });
    const vorher = await zaehlen();
    const lauf = await api("POST", "/api/cron/dokumente-aufbewahrung?dryRun=1", {
      headers: { Authorization: `Bearer ${cronSecret}` },
      ohneCookie: true,
    });
    pruefe(
      "POST /api/cron/dokumente-aufbewahrung?dryRun=1 → 200, dryRun, Feld ausgaben",
      lauf.status === 200 && lauf.json?.dryRun === true && !!lauf.json?.ausgaben,
      `Status ${lauf.status}: ${kurz(lauf.json?.ausgaben ?? lauf.json, 400)}`,
    );
    const nachher = await zaehlen();
    pruefe(
      "Probelauf löscht nichts (Zähler vorher = nachher)",
      JSON.stringify(vorher) === JSON.stringify(nachher),
      `vorher ${JSON.stringify(vorher)}, nachher ${JSON.stringify(nachher)}`,
    );
  }

  // ------------------------------------------------------------------
  schritt("9 Querprüfung: Kennungen in Protokoll und Versandprotokoll");
  // ------------------------------------------------------------------
  const logs = await prisma.auditLog.findMany({ where: { OR: [{ onboardingId: onbId }, { offboardingId: offId }] } });
  const mitKennung = logs.filter((l) => enthaeltKennung(l.details));
  pruefe(
    `Kein AuditLog der beiden Vorgänge enthält eine Kennung (${logs.length} Einträge)`,
    mitKennung.length === 0,
    mitKennung.map((l) => `${l.action}: ${kurz(l.details, 200)}`).join(" | "),
  );
  const mails = await prisma.emailLog.findMany({ where: { createdAt: { gte: start } } });
  const mailMitKennung = mails.filter((m) => enthaeltKennung(m.subject) || enthaeltKennung(m.detail));
  pruefe(
    `Kein Eintrag im Versandprotokoll seit Laufbeginn mit Kennung im Betreff (${mails.length} Einträge)`,
    mailMitKennung.length === 0,
    mailMitKennung.map((m) => `${m.event}: ${m.subject}`).join(" | "),
  );
  const zugestellt = mails.filter((m) => m.status === "SENT");
  pruefe(`Keine Mail zugestellt (SENT) – ${mails.length} Versuche: ${[...new Set(mails.map((m) => m.status))].join("/") || "—"}`, zugestellt.length === 0);

  info(`Angelegt: Onboarding ${anlage.json.displayId} (${onbId}), Offboarding ${offAnlage.json.displayId} (${offId})`);
}

// =============================================
// Start
// =============================================

main()
  .catch((err) => {
    if (err instanceof Abbruch) {
      console.log("");
      console.log(`ABBRUCH: ${err.message}`);
      return "abbruch";
    }
    console.log("");
    console.log(`ABBRUCH durch unerwarteten Fehler im Skript: ${err?.stack ?? err}`);
    return "abbruch";
  })
  .then((ende) => {
    const ok = ergebnisse.filter((e) => e.status === "OK").length;
    const fehler = ergebnisse.filter((e) => e.status === "FEHLER");
    const hinweise = ergebnisse.filter((e) => e.status === "HINWEIS");
    console.log("");
    console.log("=== Zusammenfassung ===");
    console.log(`  Prüfpunkte: ${ergebnisse.length} · OK: ${ok} · FEHLER: ${fehler.length} · HINWEIS: ${hinweise.length}`);
    for (const f of fehler) console.log(`  FEHLER  [${f.schritt}] ${f.text}${f.detail ? ` – ${typeof f.detail === "string" ? f.detail : kurz(f.detail)}` : ""}`);
    for (const h of hinweise) console.log(`  HINWEIS [${h.schritt}] ${h.text}${h.detail ? ` – ${h.detail}` : ""}`);
    if (ende === "abbruch") {
      console.log("  Ergebnis: ABGEBROCHEN");
      process.exitCode = 2;
    } else {
      console.log(`  Ergebnis: ${fehler.length === 0 ? "BESTANDEN" : "NICHT BESTANDEN"}`);
      process.exitCode = fehler.length === 0 ? 0 : 1;
    }
  });
