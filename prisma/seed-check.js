/**
 * Prueft ob die Datenbank bereits geseeded wurde + stellt System-Vorlagen sicher.
 * Wird im Docker-Entrypoint bei jedem Start aufgerufen.
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Idempotentes Seeding der System-Dokumentvorlagen (z.B. Fuehrungszeugnis-Antrag).
 * Die Quelldatei liegt als committetes Asset unter public/system-dokumente/ und
 * wird ins Prod-Image kopiert (Dockerfile COPY public). Bei Inhaltsaenderung
 * (Hash) wird der Eintrag aktualisiert. Platzhalter sind bekannt (feste Vorlage),
 * daher keine docx-Parsing-Abhaengigkeit noetig.
 * Nicht-kritisch: Fehler werden geloggt, brechen den Start NICHT ab.
 */
async function ensureSystemDocumentTemplates(prisma) {
  try {
    const assetPath = path.join(
      process.cwd(),
      "public",
      "system-dokumente",
      "fuehrungszeugnis-antrag.docx",
    );
    if (!fs.existsSync(assetPath)) {
      console.log("System-Vorlage (Fuehrungszeugnis) Asset fehlt — uebersprungen.");
      return;
    }
    const buf = fs.readFileSync(assetPath);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    const name = "Aufforderung erweitertes Führungszeugnis";
    const data = {
      name,
      description:
        "Anschreiben an die Lehrkraft (§ 30a BZRG) — editierbare System-Vorlage",
      modul: "ONBOARDING",
      dateipfad: assetPath,
      originalName: "Fuehrungszeugnis-Antrag.docx",
      fileSize: buf.length,
      hash,
      platzhalter: ["anrede", "vorname", "nachname", "strasse", "plz", "ort"],
      isSystem: true,
      organizationId: null,
      isActive: true,
    };
    const existing = await prisma.documentTemplate.findFirst({
      where: { name, modul: "ONBOARDING" },
      select: { id: true, hash: true, dateipfad: true },
    });
    if (!existing) {
      await prisma.documentTemplate.create({ data });
      console.log("System-Vorlage (Fuehrungszeugnis) angelegt.");
    } else if (existing.hash !== hash || existing.dateipfad !== assetPath) {
      await prisma.documentTemplate.update({ where: { id: existing.id }, data });
      console.log("System-Vorlage (Fuehrungszeugnis) aktualisiert.");
    } else {
      console.log("System-Vorlage (Fuehrungszeugnis) ist aktuell.");
    }
  } catch (error) {
    console.error("System-Vorlage-Seed Fehler (nicht kritisch):", error.message);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureSystemDocumentTemplates(prisma);

    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log("Keine User gefunden — Seed wird ausgefuehrt...");
      await prisma.$disconnect();
      // Seed-Script ausfuehren (kompiliertes JS)
      require("./seed.js");
      return;
    }
    console.log(
      "Datenbank bereits geseeded (" + userCount + " User vorhanden). Seed uebersprungen.",
    );
    await prisma.$disconnect();
  } catch (error) {
    console.error("Seed-Check Fehler:", error.message);
    await prisma.$disconnect();
    // Nicht-kritisch: Server trotzdem starten
  }
}

main();
