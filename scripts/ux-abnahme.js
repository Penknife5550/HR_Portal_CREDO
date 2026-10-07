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
 *   vergleich <ordnerA> <ordnerB> [kopfhoeheA]
 *       Vergleicht gleichnamige PNGs Bildpunkt fuer Bildpunkt und nennt je
 *       Datei die Zahl der abweichenden Punkte. Ende mit Code 1, wenn etwas
 *       abweicht. Mit `kopfhoeheA` nur unterhalb des Kopfs (fuer Pakete, die
 *       den Kopf aendern — U1: alter Kopf 72 px).
 *
 *   vertragsende [zielordner]
 *       Pilot Vertragsende (Feinplan Abschnitt 7, Punkt 3): die NEUE
 *       Detailseite (Cookie `ansicht-vertragsende=neu`) fuer die Testvorgaenge
 *       VE-<Jahr>-<Kuerzel>-T01 … T10 aus scripts/vertragsende-testdaten.js.
 *       Je Vorgang JPEG (Qualitaet 80): 1440×900 ganze Seite
 *       (`pilot-t01-1440.jpg`), 1366×768 sichtbarer Bereich (`…-1366.jpg`)
 *       und ganze Seite (`…-1366-ganz.jpg`), 390×844 ganze Seite
 *       (`…-390.jpg`). Fuer T04 dazu die ALTE Ansicht (ohne Cookie) in 1440
 *       (ganze Seite) und 1366 (sichtbar): `pilot-t04-alt-….jpg`.
 *       Gemessen wird bei 1366×768, wie weit Kopf, Schalterzeile, Seitenkopf,
 *       Prozessleiste und Hinweise bis zur Unterkante der Reiterleiste
 *       reichen (Ziel des Plans: hoechstens ein Drittel = 256 px). Geprueft
 *       je Lage und Breite: genau eine h1, keine Konsolenfehler, bei 390 px
 *       kein waagerechtes Rollen. Ende mit Code 1, wenn eine Pruefung
 *       scheitert. Vorgabe: docs/module/ux-ui/screenshots/pilot/.
 *       Die Testvorgaenge sind erfunden; Fristen haengen am Tag des Anlegens —
 *       vorher `node scripts/vertragsende-testdaten.js --mandant <nr>` laufen
 *       lassen, sonst stimmen „Jetzt dran“ und Ampel nicht mehr.
 *
 * VORAUSSETZUNGEN (muster, seiten, vertragsende)
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
  { name: "onboarding-liste", pfad: "/vorgaenge/onboarding" },
  { name: "onboarding-detail", pfad: `/vorgaenge/onboarding/${VORGANG}` },
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

// =============================================
// Pilot Vertragsende
// =============================================

/** Vom Testdaten-Skript angelegte Vorgaenge: `VE-<Jahr>-<Kuerzel>-T<NN>` (scripts/vertragsende-testdaten.js). */
const TEST_VERTRAGSENDE = /^VE-\d{4}-.+-T(\d{2})$/;
/** Ziel des Plans: Kopf, Leiste und Reiter hoechstens ein Drittel von 768 px. */
const DRITTEL_1366 = 256;
/** Der Vorgang, dessen ALTE Ansicht zum Vergleich mit abgelegt wird. */
const VERGLEICH_ALT = "T04";

/**
 * Setzt oder loescht den Cookie der Ansicht — so wie der Schalter der Seite
 * (`ansichtCookieZeile`, src/lib/ansicht.ts: „alt" loescht den Cookie).
 */
async function ansichtSetzen(seite, neu) {
  await seite.evaluate((zeile) => {
    document.cookie = zeile;
  }, neu ? "ansicht-vertragsende=neu; Max-Age=31536000; Path=/; SameSite=Lax" : "ansicht-vertragsende=; Max-Age=0; Path=/; SameSite=Lax");
}

/** Die Testvorgaenge T01 … T10 ueber die Liste der Schnittstelle, nach Nummer sortiert. */
async function testvorgaengeFinden(seite) {
  const antwort = await seite.evaluate(async () => {
    const alle = [];
    for (let nr = 1; nr <= 20; nr++) {
      const res = await fetch(`/api/contract-end?search=${encodeURIComponent("-T")}&limit=200&page=${nr}`);
      if (!res.ok) return { status: res.status };
      const json = await res.json();
      alle.push(...json.data.map((v) => ({ id: v.id, displayId: v.displayId })));
      if (nr >= json.totalPages) break;
    }
    return { alle };
  });
  if (!antwort.alle) throw new Error(`Liste Vertragsende nicht lesbar (${antwort.status}).`);
  const jeNummer = new Map();
  for (const v of antwort.alle) {
    const treffer = TEST_VERTRAGSENDE.exec(v.displayId ?? "");
    if (!treffer) continue;
    const kurz = `T${treffer[1]}`;
    if (jeNummer.has(kurz)) console.log(`ACHTUNG: ${kurz} gibt es mehrfach — genommen wird ${jeNummer.get(kurz).displayId}.`);
    else jeNummer.set(kurz, { ...v, kurz });
  }
  if (jeNummer.size === 0) {
    throw new Error("Keine Testvorgaenge VE-…-T<NN> gefunden. Erst: node scripts/vertragsende-testdaten.js --mandant <nr>");
  }
  return [...jeNummer.values()].sort((x, y) => x.kurz.localeCompare(y.kurz));
}

/**
 * Was je Lage und Breite gemessen und geprueft wird. Nur Zahlen und die Texte
 * der Bausteine (Pille, Titel der Hinweise) — die Namen der Testpersonen
 * gehoeren nicht in die Ausgabe. Lagen in px ab Seitenanfang.
 */
function seiteLesen(seite) {
  return seite.evaluate(() => {
    const unten = (el) => (el ? Math.round(el.getBoundingClientRect().bottom + window.scrollY) : null);
    const oben = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
    const leiste = document.querySelector("[data-prozessleiste]");
    const reiter = document.querySelector('[role="tablist"]');
    const titel = document.getElementById("seitentitel");
    // Erster `header` = Portal-Kopf (layout.tsx); der Seitenkopf ist der `header` um die h1.
    const portalKopf = document.querySelector("header");
    const seitenkopf = titel ? titel.closest("header") : null;
    const schalter = document.querySelector('aside[aria-label="Ansicht dieser Seite"]');
    // Hinweise zwischen Leiste und Reiterleiste (nicht die in einem Reiter).
    const hinweise =
      leiste && reiter
        ? [...document.querySelectorAll("main section[data-ton]")].filter(
            (h) => oben(h) >= unten(leiste) && unten(h) <= oben(reiter),
          )
        : [];
    const reiterUnten = unten(reiter);
    return {
      h1: document.querySelectorAll("h1").length,
      breite: document.documentElement.scrollWidth,
      fenster: window.innerWidth,
      kopf: unten(portalKopf),
      schalter: unten(schalter),
      seitenkopf: unten(seitenkopf),
      leiste: unten(leiste),
      hinweise: hinweise.length,
      hinweisTitel: hinweise.map((h) => h.querySelector("h2, h3, h4")?.textContent.trim() ?? ""),
      reiter: reiterUnten,
      // Rechnerisch ohne Hinweise: Die Reiterleiste rueckte um den Block der
      // Hinweise samt einem Abstand nach oben (vom ersten Hinweis bis zur Leiste).
      reiterOhneHinweise:
        hinweise.length > 0 && reiterUnten !== null ? reiterUnten - (oben(reiter) - oben(hinweise[0])) : reiterUnten,
      pille: seitenkopf?.querySelector("[data-ton]")?.textContent.trim() ?? null,
      jetztDran: Boolean(document.querySelector("[data-jetzt-dran]")),
      ende: document.querySelector("[data-ende]")?.getAttribute("data-ende") ?? null,
    };
  });
}

async function vertragsende(ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  const browser = await browserStarten();
  const befunde = [];
  const messungen = [];
  try {
    const seite = await browser.newPage();
    // Konsolenfehler je Aufruf: vor jedem `goto` geleert.
    let konsole = [];
    seite.on("console", (m) => {
      if (m.type() === "error") konsole.push(m.text().slice(0, 300));
    });
    seite.on("pageerror", (e) => konsole.push(`Skriptfehler: ${String(e.message).slice(0, 300)}`));

    await seite.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await anmelden(seite);
    const vorgaenge = await testvorgaengeFinden(seite);
    await ansichtSetzen(seite, true);

    const oeffnen = async (vorgang, breite, neu) => {
      await seite.setViewport({ width: breite.width, height: breite.height, deviceScaleFactor: 1 });
      konsole = [];
      await seite.goto(`${BASIS}/vorgaenge/vertragsende/${vorgang.id}`, { waitUntil: "networkidle2" });
      if (neu) {
        await seite.waitForSelector("[data-prozessleiste]", { timeout: 60000 });
      } else {
        // Die alte Ansicht hat keine Leiste; sie ist da, wenn die Nummer steht.
        await seite
          .waitForFunction((nr) => document.body.innerText.includes(nr), { timeout: 60000 }, vorgang.displayId)
          .catch(() => console.log(`ACHTUNG: ${vorgang.kurz} alt — Nummer nicht gefunden, Bild trotzdem.`));
      }
      await ruhig(seite);
      await seite.evaluate(() => window.scrollTo(0, 0));
    };
    const bild = (name, ganz) =>
      seite.screenshot({ path: path.join(ziel, name), type: "jpeg", quality: 80, fullPage: ganz });
    const pruefen = (kurz, breite, gelesen) => {
      if (gelesen.h1 !== 1) befunde.push(`${kurz} ${breite}: ${gelesen.h1} h1 statt genau einer`);
      if (konsole.length > 0) befunde.push(`${kurz} ${breite}: ${konsole.length} Konsolenfehler — ${konsole.join(" | ")}`);
      if (gelesen.breite > gelesen.fenster) {
        befunde.push(`${kurz} ${breite}: waagerechtes Rollen (Seite ${gelesen.breite} px, Fenster ${gelesen.fenster} px)`);
      }
    };

    for (const vorgang of vorgaenge) {
      const klein = vorgang.kurz.toLowerCase();
      for (const b of BREITEN) {
        await oeffnen(vorgang, b, true);
        const gelesen = await seiteLesen(seite);
        pruefen(vorgang.kurz, b.name, gelesen);
        if (b.name === "1366") {
          messungen.push({ kurz: vorgang.kurz, ...gelesen });
          await bild(`pilot-${klein}-1366.jpg`, false);
          await bild(`pilot-${klein}-1366-ganz.jpg`, true);
        } else {
          await bild(`pilot-${klein}-${b.name}.jpg`, true);
        }
      }
      console.log(`${vorgang.kurz}  ${vorgang.displayId}  Bilder in 1440, 1366 (sichtbar, ganz), 390`);
    }

    // Die ALTE Ansicht eines Vorgangs zum Vergleich am Prototyp-Tag.
    const alt = vorgaenge.find((v) => v.kurz === VERGLEICH_ALT);
    if (alt) {
      await ansichtSetzen(seite, false);
      for (const b of BREITEN.filter((x) => x.name !== "390")) {
        await oeffnen(alt, b, false);
        await bild(`pilot-${alt.kurz.toLowerCase()}-alt-${b.name}.jpg`, b.name === "1440");
      }
      console.log(`${alt.kurz}  alte Ansicht in 1440 (ganz) und 1366 (sichtbar)`);
    } else {
      befunde.push(`${VERGLEICH_ALT} fehlt — keine Bilder der alten Ansicht`);
    }
  } finally {
    await browser.close();
  }

  // Messung bei 1366×768: Unterkante je Band in px ab Seitenanfang.
  const zelle = (wert, breite) => String(wert ?? "—").padStart(breite);
  const anteil = (px) => (px === null ? "   —" : `${String(Math.round((px / 768) * 100)).padStart(3)} %`);
  console.log("\nMessung 1366×768 — Unterkante in px (Ziel: Reiterleiste <= 256 px = ein Drittel)");
  console.log("Lage  Kopf  Schalter  Seitenkopf  Leiste  Hinw.  Reiter  Anteil  ohne Hinw.  Anteil  Pille / Hinweise");
  for (const m of messungen) {
    console.log(
      `${m.kurz}  ${zelle(m.kopf, 4)}  ${zelle(m.schalter, 8)}  ${zelle(m.seitenkopf, 10)}  ${zelle(m.leiste, 6)}  ` +
        `${zelle(m.hinweise, 5)}  ${zelle(m.reiter, 6)}  ${anteil(m.reiter)}  ${zelle(m.reiterOhneHinweise, 10)}  ` +
        `${anteil(m.reiterOhneHinweise)}  ${m.pille ?? "—"}${m.ende ? ` · Ende ${m.ende}` : ""}` +
        `${m.hinweisTitel.length > 0 ? ` / ${m.hinweisTitel.join(" · ")}` : ""}`,
    );
  }
  const ueber = messungen.filter((m) => m.reiter === null || m.reiter > DRITTEL_1366).map((m) => m.kurz);
  console.log(
    ueber.length === 0
      ? "Alle Lagen innerhalb eines Drittels."
      : `Ueber einem Drittel (Unterkante der Reiterleiste tiefer als 256 px): ${ueber.join(", ")}`,
  );

  console.log(befunde.length === 0 ? "\nPruefungen: genau eine h1, keine Konsolenfehler, kein waagerechtes Rollen — alles in Ordnung." : "\nPruefungen — Abweichungen:");
  for (const b of befunde) console.log(`  ${b}`);
  if (befunde.length > 0) process.exitCode = 1;
}

function vergleich(a, b, kopfA) {
  if (!a || !b) throw new Error("Aufruf: node scripts/ux-abnahme.js vergleich <ordnerA> <ordnerB> [kopfhoeheA]");
  // Mit `kopfhoeheA` (Hoehe des Kopfs in den Bildern von A, in px) wird nur
  // der Bereich UNTERHALB des Kopfs verglichen: Ist der Kopf in B hoeher oder
  // niedriger, sind die Bilder verschieden hoch und der Inhalt verschoben. Die
  // Verschiebung ist der Hoehenunterschied der beiden Bilder.
  const kopf = kopfA ? Number(kopfA) : null;
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
    const versatz = x.height - y.height;
    if (x.width !== y.width || (versatz !== 0 && kopf === null)) {
      console.log(`${d}: Groesse ${x.width}×${x.height} gegen ${y.width}×${y.height}`);
      abweichend += 1;
      continue;
    }
    // Ohne Hoehenunterschied das ganze Bild; sonst ab dem Kopf, B um den
    // Unterschied verschoben.
    const abA = versatz !== 0 ? kopf : 0;
    const abB = abA - versatz;
    if (abB < 0) {
      console.log(`${d}: Kopfhoehe ${kopf} passt nicht zum Hoehenunterschied ${versatz}`);
      abweichend += 1;
      continue;
    }
    let punkte = 0;
    let oben = Infinity;
    let unten = -1;
    for (let zeile = abA; zeile < x.height; zeile++) {
      const ia = zeile * x.width * 4;
      const ib = (zeile - abA + abB) * y.width * 4;
      for (let k = 0; k < x.width * 4; k += 4) {
        if (
          x.data[ia + k] !== y.data[ib + k] ||
          x.data[ia + k + 1] !== y.data[ib + k + 1] ||
          x.data[ia + k + 2] !== y.data[ib + k + 2] ||
          x.data[ia + k + 3] !== y.data[ib + k + 3]
        ) {
          punkte += 1;
          if (zeile < oben) oben = zeile;
          if (zeile > unten) unten = zeile;
        }
      }
    }
    if (punkte === 0 && versatz !== 0) {
      console.log(`${d}: unterhalb des Kopfs gleich (Kopf ${kopf} → ${abB} px, Seite ${x.height} → ${y.height} px)`);
    } else if (punkte === 0) console.log(`${d}: gleich (${x.width}×${x.height})`);
    else {
      console.log(`${d}: ${punkte} Bildpunkte weichen ab, Zeilen ${oben}–${unten}`);
      abweichend += 1;
    }
  }
  if (abweichend > 0) process.exitCode = 1;
}

(async () => {
  const [aufgabe, a, b, c] = process.argv.slice(2);
  if (aufgabe === "muster") await muster(a || path.join(__dirname, "..", "docs", "module", "ux-ui", "screenshots"));
  else if (aufgabe === "seiten") await seiten(a);
  else if (aufgabe === "vergleich") vergleich(a, b, c);
  else if (aufgabe === "vertragsende") {
    await vertragsende(a || path.join(__dirname, "..", "docs", "module", "ux-ui", "screenshots", "pilot"));
  } else {
    console.error(
      "Aufruf: node scripts/ux-abnahme.js muster [ziel] | seiten <ziel> | vergleich <a> <b> | vertragsende [ziel]",
    );
    process.exit(1);
  }
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
