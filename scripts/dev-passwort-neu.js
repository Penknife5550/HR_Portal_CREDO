/**
 * Dev-Passwort neu setzen.
 *
 * Nur fuer die lokale Entwicklungsdatenbank gedacht: Der Seed erzeugt beim
 * ersten Lauf ein zufaelliges Admin-Passwort und gibt es genau einmal aus. Ist
 * es weg, kommt man an die Oberflaeche nicht mehr heran.
 *
 * Das Skript erzeugt ein neues Zufallspasswort, schreibt dessen Hash in die
 * Datenbank und gibt das Klartextpasswort aus. Es wird bewusst NICHT
 * uebergeben, sondern erzeugt — so steht kein Passwort in der Kommandozeile und
 * damit auch keins im Verlauf der Shell.
 *
 * Aufruf (im Projektverzeichnis):
 *   node scripts/dev-passwort-neu.js dimitri.riesen@fes-minden.de
 *
 * Verweigert den Dienst gegen alles, was nicht lokal aussieht.
 */
const { randomBytes } = require("crypto");
const fs = require("fs");
const path = require("path");

/** DATABASE_URL bevorzugt aus .env.local lesen — das ist die Dev-Datenbank. */
function datenbankUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const datei of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), datei);
    if (!fs.existsSync(p)) continue;
    const zeile = fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .find((z) => z.startsWith("DATABASE_URL="));
    if (zeile) return zeile.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Lesbares Zufallspasswort: Gross, klein, Ziffern — ohne verwechselbare Zeichen. */
function neuesPasswort(laenge = 20) {
  const zeichen = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(laenge);
  let s = "";
  for (let i = 0; i < laenge; i++) s += zeichen[bytes[i] % zeichen.length];
  return s;
}

(async () => {
  const email = process.argv[2];
  if (!email) {
    console.error("Aufruf: node scripts/dev-passwort-neu.js <e-mail>");
    process.exit(1);
  }

  const url = datenbankUrl();
  if (!url) {
    console.error("FEHLER: Keine DATABASE_URL gefunden (.env.local oder .env).");
    process.exit(1);
  }

  // Schutz vor dem teuersten denkbaren Fehlgriff: dem Zuruecksetzen eines
  // Produktionspassworts. Nur localhost/127.0.0.1 ist erlaubt.
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(
      `FEHLER: Die Datenbank liegt auf "${host}", nicht lokal. Das Skript ist nur ` +
        "fuer die Entwicklungsdatenbank gedacht und bricht hier ab.",
    );
    process.exit(1);
  }

  const { PrismaClient } = require("@prisma/client");
  const { hashSync } = require("bcryptjs");
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user) {
      console.error(`FEHLER: Kein Benutzer mit der Adresse "${email}" in dieser Datenbank.`);
      process.exit(1);
    }

    const passwort = neuesPasswort();
    // Kostenfaktor 12 — derselbe wie im Seed (prisma/seed.ts).
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashSync(passwort, 12) },
    });

    console.log("");
    console.log("Neues Dev-Passwort gesetzt fuer: " + user.email + "  (" + user.role + ")");
    console.log("Datenbank: " + host + ":" + (new URL(url).port || "5432"));
    console.log("");
    console.log("    " + passwort);
    console.log("");
    console.log("Gilt nur lokal. Die Produktionsdatenbank ist davon nicht beruehrt.");
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
