/**
 * Seed-Daten: NRW Schulferien 2024–2028
 *
 * Quelle: km.nrw / offizielle Bekanntmachung des MSW NRW.
 * Wird einmalig per `npx tsx prisma/seeds/schulferien-nrw-2024-2028.ts`
 * eingespielt. Bestehende Eintraege werden nicht ueberschrieben.
 *
 * Hinweis: Pruefe die Daten vor dem Einsatz gegen die offizielle Quelle —
 * Termine koennen im Einzelfall vom MSW angepasst worden sein.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface FerienDef {
  bezeichnung: string;
  von: string; // YYYY-MM-DD
  bis: string;
  ferienTyp: "SOMMER" | "SONSTIGE";
  schuljahr: string;
}

const FERIEN: FerienDef[] = [
  // Schuljahr 2023/2024
  { bezeichnung: "Osterferien 2024", von: "2024-03-25", bis: "2024-04-06", ferienTyp: "SONSTIGE", schuljahr: "2023/2024" },
  { bezeichnung: "Pfingstferien 2024", von: "2024-05-21", bis: "2024-05-21", ferienTyp: "SONSTIGE", schuljahr: "2023/2024" },
  { bezeichnung: "Sommerferien 2024", von: "2024-07-08", bis: "2024-08-20", ferienTyp: "SOMMER", schuljahr: "2023/2024" },

  // Schuljahr 2024/2025
  { bezeichnung: "Herbstferien 2024", von: "2024-10-14", bis: "2024-10-26", ferienTyp: "SONSTIGE", schuljahr: "2024/2025" },
  { bezeichnung: "Weihnachtsferien 2024/25", von: "2024-12-23", bis: "2025-01-06", ferienTyp: "SONSTIGE", schuljahr: "2024/2025" },
  { bezeichnung: "Osterferien 2025", von: "2025-04-14", bis: "2025-04-26", ferienTyp: "SONSTIGE", schuljahr: "2024/2025" },
  { bezeichnung: "Pfingstferien 2025", von: "2025-06-10", bis: "2025-06-10", ferienTyp: "SONSTIGE", schuljahr: "2024/2025" },
  { bezeichnung: "Sommerferien 2025", von: "2025-07-14", bis: "2025-08-26", ferienTyp: "SOMMER", schuljahr: "2024/2025" },

  // Schuljahr 2025/2026
  { bezeichnung: "Herbstferien 2025", von: "2025-10-13", bis: "2025-10-25", ferienTyp: "SONSTIGE", schuljahr: "2025/2026" },
  { bezeichnung: "Weihnachtsferien 2025/26", von: "2025-12-22", bis: "2026-01-06", ferienTyp: "SONSTIGE", schuljahr: "2025/2026" },
  { bezeichnung: "Osterferien 2026", von: "2026-03-30", bis: "2026-04-11", ferienTyp: "SONSTIGE", schuljahr: "2025/2026" },
  { bezeichnung: "Pfingstferien 2026", von: "2026-05-26", bis: "2026-05-26", ferienTyp: "SONSTIGE", schuljahr: "2025/2026" },
  { bezeichnung: "Sommerferien 2026", von: "2026-06-29", bis: "2026-08-11", ferienTyp: "SOMMER", schuljahr: "2025/2026" },

  // Schuljahr 2026/2027
  { bezeichnung: "Herbstferien 2026", von: "2026-10-19", bis: "2026-10-31", ferienTyp: "SONSTIGE", schuljahr: "2026/2027" },
  { bezeichnung: "Weihnachtsferien 2026/27", von: "2026-12-23", bis: "2027-01-06", ferienTyp: "SONSTIGE", schuljahr: "2026/2027" },
  { bezeichnung: "Osterferien 2027", von: "2027-03-22", bis: "2027-04-03", ferienTyp: "SONSTIGE", schuljahr: "2026/2027" },
  { bezeichnung: "Sommerferien 2027", von: "2027-07-15", bis: "2027-08-27", ferienTyp: "SOMMER", schuljahr: "2026/2027" },

  // Schuljahr 2027/2028
  { bezeichnung: "Herbstferien 2027", von: "2027-10-25", bis: "2027-11-06", ferienTyp: "SONSTIGE", schuljahr: "2027/2028" },
  { bezeichnung: "Weihnachtsferien 2027/28", von: "2027-12-23", bis: "2028-01-06", ferienTyp: "SONSTIGE", schuljahr: "2027/2028" },
  { bezeichnung: "Osterferien 2028", von: "2028-04-10", bis: "2028-04-22", ferienTyp: "SONSTIGE", schuljahr: "2027/2028" },
  { bezeichnung: "Sommerferien 2028", von: "2028-07-13", bis: "2028-08-25", ferienTyp: "SOMMER", schuljahr: "2027/2028" },
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const f of FERIEN) {
    const existing = await prisma.schulferienNRW.findFirst({
      where: { bezeichnung: f.bezeichnung },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.schulferienNRW.create({
      data: {
        bezeichnung: f.bezeichnung,
        von: new Date(f.von),
        bis: new Date(f.bis),
        ferienTyp: f.ferienTyp,
        schuljahr: f.schuljahr,
        aktiv: true,
      },
    });
    created++;
  }
  console.log(`Schulferien NRW Seed: ${created} angelegt, ${skipped} bereits vorhanden.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
