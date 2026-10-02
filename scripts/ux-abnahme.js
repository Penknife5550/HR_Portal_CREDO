/**
 * Abnahme-Bilder fuer den UX-Umbau „Klarer Weg“.
 *
 * Drei Aufgaben (erstes Argument):
 *
 *   muster [zielordner]
 *       Die Musterseite /ui-muster in 1440, 1366×768 und 390 px, jeweils die
 *       ganze Seite. Vorgabe: docs/module/ux-ui/screenshots/.
 *
 *   seiten <zielordner>
 *       Fuenf bestehende Seiten bei 1440 px (Anmeldung, Onboarding-Liste,
 *       Onboarding-Detail, Einstellungen, Fragebogen) — fuer den Vergleich
 *       „vorher/nachher“: einmal vor, einmal nach der Aenderung aufrufen, je in
 *       einen eigenen Ordner.
 *
 *   vergleich <ordnerA> <ordnerB>
 *       Vergleicht gleichnamige PNGs Bildpunkt fuer Bildpunkt und nennt je
 *       Datei die Zahl der abweichenden Punkte. Ende mit Code 1, wenn etwas
 *       abweicht.
 *
 * VORAUSSETZUNGEN (muster, seiten)
 *   1. Entwicklungsserver laeuft (npm run dev, Dev-DB auf 5433).
 *   2. npm install --no-save puppeteer-core   (nutzt den vorhandenen Chrome)
 *   3. Ein SUPER_ADMIN der Dev-Datenbank; Passwort ueber
 *      scripts/dev-passwort-neu.js.
 *
 * AUFRUF (im Projektverzeichnis)
 *   DEV_EMAIL=... DEV_PASSWORT=... node scripts/ux-abnahme.js muster
 *
 * Die Bilder zeigen nur Testdaten der Entwicklungsdatenbank. Bilder
 * bestehender Seiten gehoeren trotzdem NICHT ins Repository (Namen aus der
 * Dev-DB) — nur die der Musterseite, die keine Personendaten zeigt.
 */
const fs = require("fs");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASIS = process.env.BASIS || "http://localhost:3000";
const VORGANG = "d708212d-9ea6-42d6-bd70-635fea6a5133";
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const BREITEN = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1366", width: 1366, height: 768 },
  { name: "390", width: 390, height: 844 },
];

const SEITEN = [
  { name: "anmeldung", pfad: "/login", ohneAnmeldung: true },
  { name: "onboarding-liste", pfad: "/dashboard" },
  { name: "onboarding-detail", pfad: `/dashboard/${VORGANG}` },
  { name: "einstellungen", pfad: "/einstellungen" },
  // Ohne gueltigen Link: die Hinweisseite des Fragebogens. Ein echter Link
  // wuerde beim Oeffnen den Vorgang veraendern.
  { name: "fragebogen", pfad: "/fragebogen/00000000-0000-4000-8000-000000000000", ohneAnmeldung: true },
];

async function browserStarten() {
  const puppeteer = require("puppeteer-core");
  return puppeteer.launch({ executablePath: CHROME, headless: "new" });
}

async function anmelden(seite) {
  const email = process.env.DEV_EMAIL;
  const passwort = process.env.DEV_PASSWORT;
  if (!email || !passwort) throw new Error("DEV_EMAIL oder DEV_PASSWORT fehlt (Umgebungsvariablen).");
  await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
  const status = await seite.evaluate(
    async (e, p) => {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });
      return res.status;
    },
    email,
    passwort,
  );
  if (status !== 200) throw new Error(`Anmeldung fehlgeschlagen (${status})`);
}

/**
 * Wartet, bis die Seite ruhig ist, und friert sie dann ein.
 *
 * Reihenfolge ist wichtig (drei Lehren aus den ersten Laeufen):
 *   1. Die Seiten laden ihre Daten nach dem ersten Zeichnen nach —
 *      networkidle2 genuegt nicht, zwei Seiten waren noch 900 px hoch und leer.
 *      Ruhig ist die Seite, wenn sich Text und Hoehe sechsmal in Folge nicht
 *      aendern.
 *   2. Diagramme bauen sich danach per Skript auf (keine CSS-Animation); ein
 *      Bild zeigte sie halb aufgebaut. Also noch einmal warten.
 *   3. Erst dann CSS-Bewegung anhalten (pulsierende Balken, Ladesymbole) und
 *      das Entwickler-Symbol von Next.js ausblenden.
 */
async function ruhig(seite) {
  await seite.evaluate(() => document.fonts.ready);
  let vorher = "";
  let gleich = 0;
  for (let i = 0; i < 60 && gleich < 6; i++) {
    await warte(500);
    const jetzt = await seite.evaluate(
      () => `${document.documentElement.scrollHeight}|${document.body.innerText.length}`,
    );
    gleich = jetzt === vorher ? gleich + 1 : 0;
    vorher = jetzt;
  }
  await warte(3000);
  await seite.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" +
      "nextjs-portal{display:none!important}",
  });
  await warte(400);
}

async function muster(ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  const browser = await browserStarten();
  try {
    const seite = await browser.newPage();
    await seite.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await anmelden(seite);
    for (const b of BREITEN) {
      await seite.setViewport({ width: b.width, height: b.height, deviceScaleFactor: 1 });
      await seite.goto(BASIS + "/ui-muster", { waitUntil: "networkidle2" });
      if (!(await seite.evaluate(() => location.pathname === "/ui-muster"))) {
        throw new Error("Die Musterseite ist nicht erreichbar (kein SUPER_ADMIN?).");
      }
      // Die Seite muss wirklich gezeichnet sein (ein Bild war einmal weiss,
      // weil der Entwicklungsserver gerade neu uebersetzte).
      await seite.waitForFunction(() => document.querySelector("h1#seitentitel") !== null, { timeout: 60000 });
      await ruhig(seite);
      const datei = path.join(ziel, `ui-muster-${b.name}.png`);
      await seite.screenshot({ path: datei, fullPage: true });
      const breiter = await seite.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      console.log(`${path.basename(datei)}  ${b.width} px${breiter ? "  ACHTUNG: Seite ist breiter als das Fenster" : ""}`);
    }
  } finally {
    await browser.close();
  }
}

async function seiten(ziel) {
  if (!ziel) throw new Error("Zielordner fehlt: node scripts/ux-abnahme.js seiten <ordner>");
  fs.mkdirSync(ziel, { recursive: true });
  const browser = await browserStarten();
  try {
    const offen = await browser.newPage();
    await offen.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    // Erst die Seiten ohne Anmeldung, dann anmelden.
    for (const s of [...SEITEN.filter((x) => x.ohneAnmeldung), null, ...SEITEN.filter((x) => !x.ohneAnmeldung)]) {
      if (s === null) {
        await anmelden(offen);
        continue;
      }
      await offen.goto(BASIS + s.pfad, { waitUntil: "networkidle2" });
      await ruhig(offen);
      await offen.screenshot({ path: path.join(ziel, `${s.name}.png`), fullPage: true });
      console.log(`${s.name}.png  ${await offen.evaluate(() => location.pathname)}`);
    }
  } finally {
    await browser.close();
  }
}

function vergleich(a, b) {
  if (!a || !b) throw new Error("Aufruf: node scripts/ux-abnahme.js vergleich <ordnerA> <ordnerB>");
  const { PNG } = require("pngjs");
  const dateien = fs.readdirSync(a).filter((d) => d.endsWith(".png"));
  if (dateien.length === 0) throw new Error(`Keine PNGs in ${a}`);
  let abweichend = 0;
  for (const d of dateien) {
    const pb = path.join(b, d);
    if (!fs.existsSync(pb)) {
      console.log(`${d}: FEHLT in ${b}`);
      abweichend += 1;
      continue;
    }
    const x = PNG.sync.read(fs.readFileSync(path.join(a, d)));
    const y = PNG.sync.read(fs.readFileSync(pb));
    if (x.width !== y.width || x.height !== y.height) {
      console.log(`${d}: Groesse ${x.width}×${x.height} gegen ${y.width}×${y.height}`);
      abweichend += 1;
      continue;
    }
    let punkte = 0;
    let oben = Infinity;
    let unten = -1;
    for (let i = 0; i < x.data.length; i += 4) {
      if (
        x.data[i] !== y.data[i] ||
        x.data[i + 1] !== y.data[i + 1] ||
        x.data[i + 2] !== y.data[i + 2] ||
        x.data[i + 3] !== y.data[i + 3]
      ) {
        punkte += 1;
        const zeile = Math.floor(i / 4 / x.width);
        if (zeile < oben) oben = zeile;
        if (zeile > unten) unten = zeile;
      }
    }
    if (punkte === 0) console.log(`${d}: gleich (${x.width}×${x.height})`);
    else {
      console.log(`${d}: ${punkte} Bildpunkte weichen ab, Zeilen ${oben}–${unten}`);
      abweichend += 1;
    }
  }
  if (abweichend > 0) process.exitCode = 1;
}

(async () => {
  const [aufgabe, a, b] = process.argv.slice(2);
  if (aufgabe === "muster") await muster(a || path.join(__dirname, "..", "docs", "module", "ux-ui", "screenshots"));
  else if (aufgabe === "seiten") await seiten(a);
  else if (aufgabe === "vergleich") vergleich(a, b);
  else {
    console.error("Aufruf: node scripts/ux-abnahme.js muster [ziel] | seiten <ziel> | vergleich <a> <b>");
    process.exit(1);
  }
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
