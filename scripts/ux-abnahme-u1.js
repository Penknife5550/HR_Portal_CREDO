/**
 * Abnahme U1 (Rahmen) im echten Browser — was sich nicht mit Jest pruefen laesst.
 *
 *   1. Je Rolle anmelden: sichtbare Punkte, Rollenname, wohin das Logo fuehrt,
 *      wo man nach dem Anmelden landet.
 *   2. An- und Abmelden ueber die Oberflaeche: Der Kopf steht nach dem Anmelden
 *      sofort da (ohne Neuladen von Hand) und ist nach dem Abmelden weg.
 *   3. Tastatur: Sprunglink, Menue mit Enter/Pfeil/Escape, Fokus zurueck.
 *   4. Alte Adressen leiten weiter; die Fragebogen-Vorschau hat keinen Kopf.
 *   5. Bilder des Kopfs in 1440, 1366 und 390 px (390 auch mit offenem Menue)
 *      nach docs/module/ux-ui/screenshots/.
 *
 * DAS SKRIPT AENDERT DIE ROLLE DES TESTKONTOS in der Entwicklungsdatenbank
 * (nacheinander alle sechs Rollen) und stellt am Ende SUPER_ADMIN wieder her.
 * Es weigert sich, wenn die Datenbank nicht lokal liegt oder das Konto nicht
 * auf `@beispiel.invalid` endet.
 *
 * VORAUSSETZUNGEN wie scripts/ux-abnahme.js (Entwicklungsserver, puppeteer-core,
 * DEV_EMAIL/DEV_PASSWORT eines Testkontos).
 *
 * AUFRUF (im Projektverzeichnis)
 *   DEV_EMAIL=claude-test-admin@beispiel.invalid DEV_PASSWORT=... node scripts/ux-abnahme-u1.js
 */
const fs = require("fs");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASIS = process.env.BASIS || "http://localhost:3000";
const ZIEL = path.join(__dirname, "..", "docs", "module", "ux-ui", "screenshots");
const EMAIL = process.env.DEV_EMAIL;
const PASSWORT = process.env.DEV_PASSWORT;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const ROLLEN = ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER", "EINRICHTUNGSLEITUNG", "VORGESETZTER", "BEM_BEAUFTRAGTER"];

function datenbankUrl() {
  for (const datei of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), datei);
    if (!fs.existsSync(p)) continue;
    const zeile = fs.readFileSync(p, "utf8").split(/\r?\n/).find((z) => z.startsWith("DATABASE_URL="));
    if (zeile) return zeile.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
  }
  return null;
}

let fehler = 0;
function pruefe(name, ist, soll) {
  const gleich = JSON.stringify(ist) === JSON.stringify(soll);
  if (!gleich) fehler += 1;
  console.log(`${gleich ? "ok   " : "FEHLT"} ${name}${gleich ? "" : `\n        ist:  ${JSON.stringify(ist)}\n        soll: ${JSON.stringify(soll)}`}`);
}

/** Was der Kopf zeigt. */
const kopfLesen = (seite) =>
  seite.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Hauptnavigation"]');
    const kopf = document.querySelector("header");
    return {
      da: Boolean(nav),
      punkte: nav ? [...nav.querySelectorAll(":scope > a, :scope > button")].map((e) => e.textContent.replace(/\d.*$/, "").trim()) : [],
      rolle: kopf ? (kopf.querySelector(".text-right span:last-child")?.textContent ?? null) : null,
      logo: kopf ? kopf.querySelector("a")?.getAttribute("href") : null,
      ort: location.pathname,
    };
  });

async function anmeldenUeberFormular(seite) {
  await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
  // Erst tippen, wenn React das Formular uebernommen hat — vorher schickte der
  // Klick das Formular am Skript vorbei ab und lud nur die Anmeldeseite neu.
  await seite.waitForFunction(() => {
    const f = document.querySelector("form");
    return Boolean(f) && Object.keys(f).some((k) => k.startsWith("__reactProps"));
  });
  await seite.type('input[type="email"]', EMAIL);
  await seite.type('input[type="password"]', PASSWORT);
  await Promise.all([seite.waitForNavigation({ waitUntil: "networkidle2" }), seite.click('button[type="submit"]')]);
  await seite.waitForSelector("header", { timeout: 30000 }).catch(() => {});
}

(async () => {
  if (!EMAIL || !PASSWORT) throw new Error("DEV_EMAIL oder DEV_PASSWORT fehlt (Umgebungsvariablen).");
  if (!EMAIL.endsWith("@beispiel.invalid")) throw new Error("Nur fuer ein Testkonto auf @beispiel.invalid.");
  const url = datenbankUrl();
  const host = url ? new URL(url).hostname : "";
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error(`Die Datenbank liegt auf "${host}", nicht lokal.`);

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });

  const rolleSetzen = (role) => prisma.user.update({ where: { email: EMAIL }, data: { role } });

  try {
    // ---------- 1. Je Rolle
    const SOLL = {
      SUPER_ADMIN: { punkte: ["Vorgänge", "BEM", "Vorlagen", "Verwaltung"], rolle: "Administration", logo: "/vorgaenge", ort: "/vorgaenge/onboarding" },
      HR_LEITUNG: { punkte: ["Vorgänge", "BEM", "Vorlagen", "Verwaltung"], rolle: "HR-Leitung", logo: "/vorgaenge", ort: "/vorgaenge/onboarding" },
      HR_SACHBEARBEITER: { punkte: ["Vorgänge", "BEM", "Vorlagen"], rolle: "HR-Sachbearbeitung", logo: "/vorgaenge", ort: "/vorgaenge/onboarding" },
      EINRICHTUNGSLEITUNG: { punkte: ["Vorgänge", "BEM"], rolle: "Einrichtungsleitung", logo: "/vorgaenge", ort: "/vorgaenge/onboarding" },
      VORGESETZTER: { punkte: ["Vorgänge", "BEM"], rolle: "Führungskraft", logo: "/vorgaenge", ort: "/vorgaenge/onboarding" },
      BEM_BEAUFTRAGTER: { punkte: ["BEM"], rolle: "BEM-Beauftragte:r", logo: "/bem", ort: "/bem" },
    };
    for (const rolle of ROLLEN) {
      await rolleSetzen(rolle);
      const kontext = await browser.createBrowserContext();
      const seite = await kontext.newPage();
      await seite.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await anmeldenUeberFormular(seite);
      const k = await kopfLesen(seite);
      pruefe(`${rolle}: Kopf nach dem Anmelden sofort da, Punkte, Rollenname, Logo, Landeseite`, { da: k.da, punkte: k.punkte, rolle: k.rolle, logo: k.logo, ort: k.ort }, { da: true, ...SOLL[rolle] });
      if (rolle === "HR_SACHBEARBEITER") {
        await seite.goto(BASIS + "/vorlagen", { waitUntil: "networkidle2" });
        pruefe("HR_SACHBEARBEITER: /vorlagen leitet weiter (deshalb fehlt „Formulare“)", await seite.evaluate(() => location.pathname), "/vorgaenge/onboarding");
      }
      if (rolle === "BEM_BEAUFTRAGTER") {
        await seite.goto(BASIS + "/vorgaenge", { waitUntil: "networkidle2" });
        pruefe("BEM_BEAUFTRAGTER: /vorgaenge leitet ins BEM", await seite.evaluate(() => location.pathname), "/bem");
      }
      await kontext.close();
    }
    await rolleSetzen("SUPER_ADMIN");

    // ---------- 2. An- und Abmelden, 3. Tastatur, 4. Adressen, 5. Bilder
    const seite = await browser.newPage();
    await seite.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
    pruefe("Anmeldeseite: kein Kopf", (await kopfLesen(seite)).da, false);
    await anmeldenUeberFormular(seite);
    pruefe("nach dem Anmelden: Kopf da, ohne Neuladen von Hand", (await kopfLesen(seite)).da, true);

    // Alte Adressen
    for (const [alt, neu] of [
      ["/dashboard", "/vorgaenge/onboarding"],
      ["/dashboard?tab=contract-end", "/vorgaenge/vertragsende"],
      ["/dashboard/bem", "/bem"],
    ]) {
      await seite.goto(BASIS + alt, { waitUntil: "networkidle2" });
      pruefe(`alte Adresse ${alt}`, await seite.evaluate(() => location.pathname), neu);
    }

    // Fragebogen-Vorschau ohne Kopf (die Kennung muss es nicht geben)
    await seite.goto(BASIS + "/vorlagen/vorschau/00000000-0000-4000-8000-000000000000", { waitUntil: "networkidle2" });
    pruefe("Fragebogen-Vorschau: kein Portal-Kopf", { ort: await seite.evaluate(() => location.pathname), kopf: (await kopfLesen(seite)).da }, { ort: "/vorlagen/vorschau/00000000-0000-4000-8000-000000000000", kopf: false });

    // Tastatur
    await seite.goto(BASIS + "/checklisten", { waitUntil: "networkidle2" });
    await seite.keyboard.press("Tab");
    pruefe("Tastatur: erster Tab-Halt ist der Sprunglink", await seite.evaluate(() => document.activeElement?.textContent), "Zum Inhalt springen");
    await seite.keyboard.press("Enter");
    await warte(200);
    pruefe("Tastatur: Sprunglink fuehrt zum Inhalt", await seite.evaluate(() => ({ anker: location.hash, fokus: document.activeElement?.id })), { anker: "#inhalt", fokus: "inhalt" });
    await seite.focus('nav[aria-label="Hauptnavigation"] button');
    const knopfText = await seite.evaluate(() => document.activeElement?.textContent);
    await seite.keyboard.press("Enter");
    await seite.waitForSelector('[role="menu"]', { timeout: 5000 });
    await seite.keyboard.press("ArrowDown");
    const imMenue = await seite.evaluate(() => ({
      punkte: [...document.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent),
      fokusImMenue: document.activeElement?.getAttribute("role") === "menuitem",
      aktiv: [...document.querySelectorAll('[role="menuitem"][aria-current="page"]')].map((m) => m.textContent),
    }));
    pruefe("Tastatur: Menü „Vorlagen“ oeffnet mit Enter, Pfeil bewegt den Fokus, „Checklisten“ ist aktiv", { knopfText, ...imMenue }, {
      knopfText: "Vorlagen",
      punkte: ["Formulare", "Brief-Vorlagen", "Checklisten", "Exit-Interview", "Zeugnis-Bewertung", "Beurteilungs-Vorlagen"],
      fokusImMenue: true,
      aktiv: ["Checklisten"],
    });
    await seite.keyboard.press("Escape");
    await warte(300);
    pruefe("Tastatur: Escape schliesst, Fokus zurueck auf dem Menueknopf", await seite.evaluate(() => ({ menue: Boolean(document.querySelector('[role="menu"]')), fokus: document.activeElement?.textContent })), { menue: false, fokus: "Vorlagen" });
    pruefe("genau eine Hauptueberschrift auf /checklisten", await seite.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.textContent.trim())), ["Checklisten-Vorlagen"]);
    pruefe("keine zusaetzliche Bildlaufleiste durch den Kopf (Mindesthoehe der Seite)", await seite.evaluate(() => {
      const e = document.querySelector(".portal-inhalt .min-h-screen");
      return e ? getComputedStyle(e).minHeight : null;
    }), `${900 - 67}px`);

    // Bilder des Kopfs
    fs.mkdirSync(ZIEL, { recursive: true });
    const stil = "*,*::before,*::after{animation:none!important;transition:none!important}nextjs-portal{display:none!important}";
    for (const b of [
      { name: "1440", width: 1440, height: 900 },
      { name: "1366", width: 1366, height: 768 },
      { name: "390", width: 390, height: 844 },
    ]) {
      await seite.setViewport({ width: b.width, height: b.height, deviceScaleFactor: 1 });
      await seite.goto(BASIS + "/vorgaenge/vertragsende", { waitUntil: "networkidle2" });
      await seite.evaluate(() => document.fonts.ready);
      await seite.addStyleTag({ content: stil });
      await warte(1500);
      await seite.screenshot({ path: path.join(ZIEL, `u1-kopf-${b.name}.png`), clip: { x: 0, y: 0, width: b.width, height: b.name === "390" ? 180 : 130 } });
      // Gemessen wird der KOPF, nicht die Seite: Die alten Listen sind am Handy
      // selbst zu breit (Filterzeile, Tabelle) — das baut U3 um.
      const breiter = await seite.evaluate(() => document.querySelector("header").scrollWidth > document.documentElement.clientWidth);
      pruefe(`Bild u1-kopf-${b.name}.png – Kopf nicht breiter als das Fenster`, breiter, false);
      if (b.name === "390") {
        await seite.click('button[aria-label="Menü"]');
        await warte(300);
        pruefe("Handy: Menue offen (aria-expanded)", await seite.evaluate(() => document.querySelector('button[aria-label="Menü"]').getAttribute("aria-expanded")), "true");
        const hoehe = await seite.evaluate(() => Math.ceil(document.querySelector("header").getBoundingClientRect().height));
        await seite.screenshot({ path: path.join(ZIEL, "u1-kopf-390-menue.png"), clip: { x: 0, y: 0, width: b.width, height: hoehe + 20 } });
      }
    }

    // Abmelden
    await seite.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await seite.goto(BASIS + "/vorgaenge/onboarding", { waitUntil: "networkidle2" });
    const abmelden = await seite.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.textContent.trim() === "Abmelden"));
    await Promise.all([seite.waitForNavigation({ waitUntil: "networkidle2" }), abmelden.asElement().click()]);
    pruefe("nach dem Abmelden: Anmeldeseite ohne Kopf", { ort: await seite.evaluate(() => location.pathname), kopf: (await kopfLesen(seite)).da }, { ort: "/login", kopf: false });
    await seite.goto(BASIS + "/vorgaenge", { waitUntil: "networkidle2" });
    pruefe("nach dem Abmelden: /vorgaenge fuehrt zur Anmeldung", await seite.evaluate(() => location.pathname), "/login");
  } finally {
    await prisma.user.update({ where: { email: EMAIL }, data: { role: "SUPER_ADMIN" } }).catch((e) => {
      fehler += 1;
      console.error("ACHTUNG: Rolle des Testkontos nicht zurueckgesetzt:", e.message);
    });
    await prisma.$disconnect();
    await browser.close();
  }

  console.log(fehler === 0 ? "\nAlles in Ordnung." : `\n${fehler} Punkt(e) stimmen nicht.`);
  process.exit(fehler === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
