/**
 * Screenshots fuer den UX/UI-Plan „Klarer Weg“ (Fassung 3).
 *
 * Erzeugt die „Vorher“-Bilder der Neuerungen vom 30.09./01.10.2026 in
 * docs/module/ux-ui/screenshots/ — Reiter Dokumente, Dialog „E-Mail
 * schreiben“, Dialog „Unterlagen nachfordern“, Reiter „E-Mails“,
 * Einstellungen → Automatische Läufe. Laesst sich nach jeder Aenderung der
 * Oberflaeche erneut ausfuehren (Grundstock fuer das Screenshot-Skript aus V0).
 *
 * VORAUSSETZUNGEN
 *   1. Entwicklungsserver laeuft (npm run dev, Dev-DB auf 5433).
 *   2. Vorgang 2026-BK-002 (Maria Voth) wie in scripts/handbuch-screenshots.js.
 *   3. puppeteer-core nutzt den vorhandenen Chrome:
 *        npm install --no-save puppeteer-core
 *
 * AUFRUF (im Projektverzeichnis)
 *   DEV_EMAIL=... DEV_PASSWORT=... NODE_PATH="$PWD/node_modules" node scripts/ux-screenshots.js
 *
 * Das Dev-Passwort setzt scripts/dev-passwort-neu.js.
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASIS = "http://localhost:3000";
const EMAIL = process.env.DEV_EMAIL;
const PASSWORT = process.env.DEV_PASSWORT;
const ZIEL = process.argv[2] || path.join(__dirname, "..", "docs", "module", "ux-ui", "screenshots");
const VORGANG = "d708212d-9ea6-42d6-bd70-635fea6a5133";

if (!EMAIL || !PASSWORT) {
  console.error("DEV_EMAIL oder DEV_PASSWORT fehlt (Umgebungsvariablen).");
  process.exit(1);
}
fs.mkdirSync(ZIEL, { recursive: true });
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis ein Text auf der Seite steht (die Seiten laden ihre Daten nach). */
async function warteAufText(seite, text, ms = 60000) {
  await seite.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, text);
  await warte(400);
}

/** Klickt den ersten Knopf mit genau diesem Text. */
async function klick(seite, text) {
  const ok = await seite.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t);
    if (b) b.click();
    return Boolean(b);
  }, text);
  if (!ok) throw new Error(`Knopf „${text}“ nicht gefunden`);
  await warte(600);
}

/** Markiert das Element, das `finde` im Browser liefert, und fotografiert es (hoechstens `maxHoehe` px). */
async function bild(seite, name, finde, maxHoehe = 2200) {
  const gefunden = await seite.evaluate((quelle) => {
    // eslint-disable-next-line no-new-func
    const el = new Function(`return (${quelle})()`)();
    if (!el) return false;
    el.setAttribute("data-ux-bild", "1");
    return true;
  }, finde.toString());
  if (!gefunden) throw new Error(`${name}: Element nicht gefunden`);
  const el = await seite.$('[data-ux-bild="1"]');
  const box = await el.boundingBox();
  const datei = path.join(ZIEL, name);
  if (box.height > maxHoehe) {
    await el.scrollIntoView();
    const b2 = await el.boundingBox();
    await seite.screenshot({ path: datei, clip: { x: b2.x, y: b2.y, width: b2.width, height: maxHoehe }, captureBeyondViewport: true });
  } else {
    await el.screenshot({ path: datei });
  }
  await seite.evaluate(() => document.querySelector('[data-ux-bild="1"]')?.removeAttribute("data-ux-bild"));
  console.log(`  + ${name}  (${Math.round(box.width)}x${Math.min(Math.round(box.height), maxHoehe)})`);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const seite = await browser.newPage();
  await seite.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
  const status = await seite.evaluate(
    async (email, passwort) => {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: passwort }),
      });
      return res.status;
    },
    EMAIL,
    PASSWORT,
  );
  if (status !== 200) throw new Error(`Anmeldung fehlgeschlagen (${status})`);

  // 1. Reiter Dokumente (Onboarding) — alle Karten untereinander.
  await seite.goto(`${BASIS}/dashboard/${VORGANG}?tab=dokumente`, { waitUntil: "networkidle2" });
  await warteAufText(seite, "Noch keine individuelle E-Mail versendet").catch(() => warteAufText(seite, "Zuletzt am"));
  await bild(seite, "dokumente-reiter.png", () => document.querySelector("main"), 2400);

  // 2. Dialog „E-Mail schreiben“ (Paket 3), leer geoeffnet.
  await klick(seite, "E-Mail schreiben…");
  await bild(seite, "individuelle-mail-dialog.png", () =>
    document.querySelector('[aria-labelledby="individuelle-mail-titel"] > div'),
  );
  await klick(seite, "Schließen");

  // 3. Dialog „Unterlagen nachfordern“ (Paket 4), leer geoeffnet.
  await klick(seite, "Unterlagen nachfordern…");
  await bild(seite, "unterlagen-dialog.png", () => {
    const d = document.querySelector('[role="dialog"]');
    return d?.firstElementChild?.getBoundingClientRect().height > 100 ? d.firstElementChild : d;
  });
  await seite.keyboard.press("Escape");
  await warte(500);

  // 4. Reiter „E-Mails“ (Mailprotokoll je Vorgang).
  await seite.goto(`${BASIS}/dashboard/${VORGANG}?tab=mails`, { waitUntil: "networkidle2" });
  await warteAufText(seite, "E-Mails zu diesem Vorgang");
  await warteAufText(seite, "Aktualisieren");
  await seite.waitForFunction(() => !document.body.innerText.includes("Lädt…"), { timeout: 30000 });
  await warte(800);
  await bild(seite, "vorgang-mails.png", () => {
    const h = [...document.querySelectorAll("h3")].find((x) => x.textContent.trim() === "E-Mails zu diesem Vorgang");
    return h?.closest("div.space-y-3");
  });

  // 5. Einstellungen → Automatische Läufe.
  await seite.goto(`${BASIS}/einstellungen?tab=laeufe`, { waitUntil: "networkidle2" });
  await warteAufText(seite, "Neue Läufe kommen");
  await bild(
    seite,
    "automatische-laeufe.png",
    () => {
      const p = [...document.querySelectorAll("div")].find((x) => x.textContent.trim().startsWith("Neue Läufe kommen"));
      return p?.parentElement;
    },
    1500,
  );

  await browser.close();
  console.log("fertig:", ZIEL);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
