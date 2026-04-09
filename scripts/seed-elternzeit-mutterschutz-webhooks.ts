/**
 * Seed-Script: Elternzeit + Mutterschutz Webhooks
 *
 * Legt 18 Webhook-Konfigurationen (13 Elternzeit + 5 Mutterschutz)
 * idempotent in der DB an. Existierende Eintraege mit demselben
 * (event, name)-Paar werden uebersprungen.
 *
 * Aufruf:
 *   N8N_BASE_URL=https://n8n.fes-credo.de tsx scripts/seed-elternzeit-mutterschutz-webhooks.ts
 *
 * Default N8N_BASE_URL: https://n8n.fes-credo.de
 *
 * Nach dem Seed sind alle Webhooks **inaktiv** angelegt — manuell im
 * Portal aktivieren (Einstellungen → Webhooks → "Aktiv" pro Webhook).
 * Damit verhindern wir, dass beim ersten Test-Vorgang sofort echte Mails
 * rausgehen.
 */

import { prisma } from "../src/lib/db";

const N8N_BASE_URL = (process.env.N8N_BASE_URL || "https://n8n.fes-credo.de").replace(
  /\/$/,
  "",
);

interface WebhookSeed {
  event: string;
  name: string;
  description: string;
}

const WEBHOOKS: WebhookSeed[] = [
  // ── Elternzeit (13) ────────────────────────────────────────────────
  {
    event: "elternzeit-angelegt",
    name: "n8n Elternzeit — Anlage",
    description: "HR-Awareness: Neuer Elternzeit-Vorgang wurde angelegt.",
  },
  {
    event: "elternzeit-antrag-link-versandt",
    name: "n8n Elternzeit — Vorl. Magic-Link",
    description: "Mail an Mitarbeiter/in mit Magic-Link fuer Formular 1.",
  },
  {
    event: "elternzeit-antrag-eingereicht",
    name: "n8n Elternzeit — Vorl. eingereicht",
    description: "HR-Awareness: Mitarbeiter/in hat Formular 1 abgeschickt.",
  },
  {
    event: "elternzeit-vorl-genehmigt",
    name: "n8n Elternzeit — Vorl. genehmigt",
    description: "Bestaetigung an Mitarbeiter/in nach vorlaeufiger Genehmigung.",
  },
  {
    event: "elternzeit-vorl-abgelehnt",
    name: "n8n Elternzeit — Vorl. abgelehnt",
    description: "Ablehnungsmail an Mitarbeiter/in.",
  },
  {
    event: "elternzeit-leiter-link-versandt",
    name: "n8n Elternzeit — Leiter-Magic-Link",
    description: "Mail an Einrichtungsleitung mit Stellungnahme-Link.",
  },
  {
    event: "elternzeit-endg-genehmigt",
    name: "n8n Elternzeit — Endg. genehmigt",
    description: "Glueckwunschmail an Mitarbeiter/in nach endgueltiger Genehmigung.",
  },
  {
    event: "elternzeit-endg-abgelehnt",
    name: "n8n Elternzeit — Endg. abgelehnt",
    description: "Endgueltige Ablehnungsmail an Mitarbeiter/in.",
  },
  {
    event: "elternzeit-br-detmold-generiert",
    name: "n8n Elternzeit — BR-Detmold-Brief",
    description: "HR-Notify: BR-Detmold-Schreiben wurde erzeugt, weiterleiten.",
  },
  {
    event: "elternzeit-vbl-generiert",
    name: "n8n Elternzeit — VBL-Info-Brief",
    description: "HR-Notify: VBL-Info-Brief wurde erzeugt (TV-L).",
  },
  {
    event: "elternzeit-ag-bescheinigung-generiert",
    name: "n8n Elternzeit — AG-Bescheinigung",
    description: "HR-Notify: AG-Bescheinigung Elterngeld erzeugt.",
  },
  {
    event: "elternzeit-br-genehmigung-eingegangen",
    name: "n8n Elternzeit — BR-Genehmigung Eingang",
    description: "HR-Notify: BR-Detmold hat genehmigt.",
  },
  {
    event: "elternzeit-frist-eskaliert",
    name: "n8n Elternzeit — Frist eskaliert",
    description: "HR-Eskalation: Frist hat Severity-Stufe gewechselt (aus Cron).",
  },
  // ── Mutterschutz (5) ───────────────────────────────────────────────
  {
    event: "mutterschutz-angelegt",
    name: "n8n Mutterschutz — Anlage",
    description: "HR-Awareness: Neue Schwangerschaftsmeldung.",
  },
  {
    event: "mutterschutz-bad-beauftragt",
    name: "n8n Mutterschutz — BAD beauftragt",
    description: "HR-Notify: BAD-Untersuchung wurde beauftragt.",
  },
  {
    event: "mutterschutz-bad-abgeschlossen",
    name: "n8n Mutterschutz — BAD abgeschlossen",
    description: "HR-Notify: BAD-Ergebnis liegt vor.",
  },
  {
    event: "mutterschutz-aktiviert",
    name: "n8n Mutterschutz — Aktiviert",
    description: "HR-Notify: Schutzfrist hat begonnen, LOGA-Eintraege vornehmen.",
  },
  {
    event: "mutterschutz-beendet",
    name: "n8n Mutterschutz — Beendet",
    description: "HR-Notify: Schutzfrist abgelaufen, Wiedereingliederung pruefen.",
  },
];

async function main() {
  console.log(`\n[Seed] Elternzeit + Mutterschutz Webhooks`);
  console.log(`[Seed] Base-URL: ${N8N_BASE_URL}`);
  console.log(`[Seed] Anzahl: ${WEBHOOKS.length}\n`);

  let created = 0;
  let skipped = 0;

  for (const w of WEBHOOKS) {
    const url = `${N8N_BASE_URL}/webhook/${w.event}`;

    // Idempotenz: pruefen, ob (event, name) bereits existiert
    const existing = await prisma.webhookConfig.findFirst({
      where: { event: w.event, name: w.name },
    });
    if (existing) {
      console.log(`  [skip] ${w.event}  (existiert bereits)`);
      skipped++;
      continue;
    }

    await prisma.webhookConfig.create({
      data: {
        event: w.event,
        name: w.name,
        url,
        authType: "none",
        // INAKTIV anlegen — Admin aktiviert manuell nach Test
        isActive: false,
        description: w.description,
      },
    });
    console.log(`  [ok]   ${w.event}  →  ${url}`);
    created++;
  }

  console.log(
    `\n[Seed] Fertig — ${created} angelegt, ${skipped} uebersprungen.`,
  );
  console.log(
    `[Seed] Alle Webhooks sind INAKTIV. Im Portal aktivieren:`,
  );
  console.log(`       Einstellungen → Webhooks → Filter "Elternzeit"/"Mutterschutz"\n`);
}

main()
  .catch((err) => {
    console.error("[Seed] Fehler:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
