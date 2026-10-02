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

/**
 * Klickt den ersten Knopf mit genau diesem Text — und WARTET, bis es ihn gibt
 * und er nicht gesperrt ist. networkidle2 heisst nicht, dass React die Knoepfe
 * schon gerendert hat; ein Klick auf einen gesperrten Knopf meldete Erfolg und
 * oeffnete nichts.
 */
async function klick(seite, text) {
  const finde = (t) =>
    [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t && !x.disabled);
  try {
    await seite.waitForFunction((t) => [...document.querySelectorAll("button")].some((x) => x.textContent.trim() === t && !x.disabled), { timeout: 15000 }, text);
  } catch {
    throw new Error(`Knopf „${text}“ nicht gefunden oder gesperrt`);
  }
  const knopf = await seite.evaluateHandle(finde, text);
  await knopf.asElement().click();
  await warte(600);
}

/**
 * Fotografiert das Element, das `finde` im Browser liefert (hoechstens
 * `maxHoehe` px hoch).
 *
 * Bewusst IMMER `el.screenshot()`, auch fuer hohe Elemente — mit einem `clip`
 * RELATIV zum Element. Die fruehere Fassung rechnete fuer hohe Elemente selbst
 * einen Ausschnitt aus `boundingBox()` (Viewport-Koordinaten nach dem Rollen)
 * und gab ihn an `page.screenshot`, das Seitenkoordinaten erwartet: Fotografiert
 * wurde der Seitenanfang statt des Elements. Puppeteer rechnet das fuer ein
 * Element selbst richtig um (dieselbe Lehre steht in handbuch-screenshots.js).
 */
async function bild(seite, name, finde, maxHoehe = 2200) {
  const griff = await seite.evaluateHandle(finde);
  const el = griff.asElement();
  if (!el) throw new Error(`${name}: Element nicht gefunden`);
  const box = await el.boundingBox();
  const datei = path.join(ZIEL, name);
  if (box.height > maxHoehe) {
    await el.screenshot({ path: datei, clip: { x: 0, y: 0, width: box.width, height: maxHoehe } });
  } else {
    await el.screenshot({ path: datei });
  }
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
  await seite.goto(`${BASIS}/vorgaenge/onboarding/${VORGANG}?tab=dokumente`, { waitUntil: "networkidle2" });
  // Auf den ZUSTAND der Karte warten, nicht nacheinander auf zwei Texte: Der
  // erste Text erscheint nie, sobald am Testvorgang eine individuelle Mail
  // haengt — jeder Lauf wartete dann 60 s ins Leere. Geladen ist die Karte,
  // wenn ihr Knopf nicht mehr gesperrt ist.
  await seite.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "E-Mail schreiben…" && !b.disabled),
    { timeout: 60000 },
  );
  await warte(400);
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
  await seite.goto(`${BASIS}/vorgaenge/onboarding/${VORGANG}?tab=mails`, { waitUntil: "networkidle2" });
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
