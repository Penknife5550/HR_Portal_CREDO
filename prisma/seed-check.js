/**
 * Prueft ob die Datenbank bereits geseeded wurde.
 * Wenn keine User existieren, wird der Seed ausgefuehrt.
 * Wird im Docker-Entrypoint aufgerufen.
 */
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log("Keine User gefunden — Seed wird ausgefuehrt...");
      await prisma.$disconnect();
      // Seed-Script ausfuehren (kompiliertes JS)
      require("./seed.js");
    } else {
      console.log(
        "Datenbank bereits geseeded (" + userCount + " User vorhanden). Seed uebersprungen."
      );
      await prisma.$disconnect();
    }
  } catch (error) {
    console.error("Seed-Check Fehler:", error.message);
    await prisma.$disconnect();
    // Nicht-kritisch: Server trotzdem starten
  }
}

main();
