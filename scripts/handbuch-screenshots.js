/**
 * Screenshots fuer das HR-Handbuch "Dokumente & Versand".
 *
 * Erzeugt die Bildschirmfotos, die in
 * docs/module/dokumente/handbuch-dokumente-versand.html eingebettet sind.
 * Aendert sich die Oberflaeche, laesst sich das Handbuch damit auffrischen,
 * ohne alles von Hand neu aufzunehmen.
 *
 * VORAUSSETZUNGEN
 *   1. Lokale Entwicklungsumgebung laeuft (npm run dev, Dev-DB auf 5433).
 *   2. Gotenberg erreichbar, sonst meldet der Dialog "PDF-Dienst nicht
 *      erreichbar" und das Bild taugt nicht fuers Handbuch:
 *        docker run -d --name credo-gotenberg-dev -p 3001:3000 gotenberg/gotenberg:8
 *      und in .env.local: GOTENBERG_URL=http://localhost:3001
 *   3. Ein Vorgang mit vollstaendigem Fragebogen UND ein konfiguriertes
 *      Standardpaket seines Mandanten - sonst ist der Dialog leer.
 *      Die IDs stehen unten in VORGANG und MANDANT.
 *   4. Fuer die Sperrmeldung: in der Dev-Datenbank eine Freigabeliste pflegen
 *      (smtp_config."allowedRecipientDomains"), sonst erscheint sie nicht.
 *   5. puppeteer-core - nutzt den vorhandenen Chrome, laedt keinen Browser:
 *        npm install --no-save puppeteer-core
 *
 * AUFRUF (im Projektverzeichnis)
 *   DEV_PASSWORT=... NODE_PATH="$PWD/node_modules" node scripts/handbuch-screenshots.js <zielordner>
 *
 * Das Dev-Passwort setzt scripts/dev-passwort-neu.js.
 */
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASIS = "http://localhost:3000";
const EMAIL = "dimitri.riesen@fes-minden.de";
const PASSWORT = process.env.DEV_PASSWORT;
const ZIEL = process.argv[2] || path.join(__dirname, "bilder");
// 2026-BK-002, Maria Voth, Mandant Berufskolleg - der Vorgang mit
// vollstaendigem Fragebogen UND einem konfigurierten Standardpaket.
const VORGANG = "d708212d-9ea6-42d6-bd70-635fea6a5133";
const MANDANT = "c7fc4629-a8ff-411a-a7dc-bac4611da6de";

if (!PASSWORT) {
  console.error("DEV_PASSWORT fehlt (Umgebungsvariable).");
  process.exit(1);
}

fs.mkdirSync(ZIEL, { recursive: true });

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Screenshot genau eines Elements.
 *
 * Bewusst el.screenshot() statt eines selbst gerechneten clip: Bei fixierten
 * Elementen (der Dialog liegt in einem `fixed inset-0`) stimmen die
 * Seitenkoordinaten nicht mit dem ueberein, was ein clip aufnimmt - der erste
 * Versuch schnitt quer durch den Dialog und zeigte daneben die Seite darunter.
 * Puppeteer rechnet das fuer ein Element selbst richtig aus.
 */
async function bildVon(seite, name, waehler) {
  const el = await seite.$(waehler);
  if (!el) {
    console.log(`  ! ${name}: Element nicht gefunden (${waehler})`);
    return false;
  }
  const box = await el.boundingBox();
  if (!box || box.width < 2 || box.height < 2) {
    console.log(`  ! ${name}: nicht sichtbar`);
    return false;
  }
  await el.screenshot({ path: path.join(ZIEL, name) });
  console.log(`  + ${name}  (${Math.round(box.width)}x${Math.round(box.height)})`);
  return true;
}

async function ganzeSeite(seite, name) {
  await seite.screenshot({ path: path.join(ZIEL, name), fullPage: true });
  console.log(`  + ${name}  (ganze Seite)`);
}

/**
 * Wartet, bis ein Element mit diesem Text da ist, und klickt es.
 *
 * Die Seiten hydrieren nach dem Laden nach: networkidle2 heisst noch lange
 * nicht, dass React die Knoepfe schon gerendert hat. Deshalb wird gewartet,
 * bis der Text auftaucht, statt eine feste Zeit zu raten.
 */
async function klickText(seite, tag, text, sekunden = 15) {
  try {
    await seite.waitForFunction(
      (tag, text) =>
        [...document.querySelectorAll(tag)].some(
          (e) => e.textContent.trim() === text || e.textContent.trim().startsWith(text),
        ),
      { timeout: sekunden * 1000 },
      tag,
      text,
    );
  } catch {
    console.log(`  ! "${text}" ist nach ${sekunden}s nicht erschienen`);
    return false;
  }
  const ok = await seite.evaluate(
    (tag, text) => {
      const el = [...document.querySelectorAll(tag)].find(
        (e) => e.textContent.trim() === text || e.textContent.trim().startsWith(text),
      );
      if (!el) return false;
      el.click();
      return true;
    },
    tag,
    text,
  );
  if (!ok) console.log(`  ! Klick fehlgeschlagen: ${tag} "${text}"`);
  return ok;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    // Hoch genug, dass der Versand-Dialog vollstaendig hineinpasst - sonst
    // schneidet der Element-Screenshot ihn am unteren Rand ab.
    defaultViewport: { width: 1400, height: 1400, deviceScaleFactor: 2 },
  });
  const seite = await browser.newPage();

  // --- Anmelden ueber die API; das Cookie gilt danach fuer alle Seiten ---
  await seite.goto(BASIS + "/login", { waitUntil: "networkidle2" });
  const anmeldung = await seite.evaluate(
    async (email, passwort) => {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: passwort }),
        credentials: "include",
      });
      return res.status;
    },
    EMAIL,
    PASSWORT,
  );
  if (anmeldung !== 200) {
    console.error("Anmeldung fehlgeschlagen, Status " + anmeldung);
    await browser.close();
    process.exit(1);
  }
  console.log("Angemeldet.");

  // --- 1. Standardpaket je Mandant und Modul ---
  console.log("\n1) Standardpaket");
  await seite.goto(`${BASIS}/mandanten/${MANDANT}/starterpaket`, { waitUntil: "networkidle2" });
  await warte(2500);
  await ganzeSeite(seite, "01-standardpaket-ganz.png");

  // --- 2. Dokumente-Reiter des Vorgangs ---
  console.log("\n2) Dokumente-Reiter");
  await seite.goto(`${BASIS}/dashboard/${VORGANG}`, { waitUntil: "networkidle2" });
  await warte(2000);
  await klickText(seite, "button", "Dokumente");
  await warte(3000);
  await ganzeSeite(seite, "02-dokumente-tab-ganz.png");

  // Prozessschritt-Leiste ("Sie sind hier")
  await bildVon(seite, "03-prozessschritt.png", "main > div:first-child");

  // --- 3. Die Versand-Karte allein ---
  console.log("\n3) Versand-Karte");
  const karteGefunden = await seite.evaluate(() => {
    const ueber = [...document.querySelectorAll("h2, h3")].find((e) =>
      e.textContent.includes("Dokumente versenden"),
    );
    if (!ueber) return null;
    const karte = ueber.closest("section, div[class*='rounded']");
    if (!karte) return null;
    karte.setAttribute("data-shot", "versandkarte");
    karte.scrollIntoView({ block: "center" });
    return true;
  });
  await warte(900);
  if (karteGefunden) await bildVon(seite, "04-versand-karte.png", "[data-shot='versandkarte']");

  // --- 4. Der Versand-Dialog ---
  console.log("\n4) Versand-Dialog");
  await klickText(seite, "button", "Dokumente versenden");
  await warte(4000);
  await ganzeSeite(seite, "05-dialog-offen.png");

  const dialog = await seite.evaluate(() => {
    const d = document.querySelector("div.fixed.inset-0 > div");
    if (!d) return false;
    d.setAttribute("data-shot", "dialog");
    return true;
  });
  if (dialog) await bildVon(seite, "06-dialog.png", "[data-shot='dialog']", 0);

  // --- 5. Abweichende Empfaengeradresse ---
  console.log("\n5) Abweichende Adresse");
  const adresseGesetzt = await seite.evaluate(() => {
    // ALLE input-Elemente durchgehen: Ein Feld ohne type-Attribut ist zwar ein
    // Textfeld, wird von "input[type=text]" aber nicht erfasst.
    const feld = [...document.querySelectorAll("input")].find(
      (i) => i.value && i.value.includes("@"),
    );
    if (!feld) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(feld, "privat@gmail.com");
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  await warte(3000);
  console.log("  adresseGesetzt=" + adresseGesetzt);
  if (dialog) await bildVon(seite, "07-dialog-abweichende-adresse.png", "[data-shot='dialog']", 0);

  const texte = await seite.evaluate(() => document.querySelector("div.fixed.inset-0")?.innerText || "");
  fs.writeFileSync(path.join(ZIEL, "dialog-text.txt"), texte);

  await browser.close();
  console.log("\nFertig. Bilder in: " + ZIEL);
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
