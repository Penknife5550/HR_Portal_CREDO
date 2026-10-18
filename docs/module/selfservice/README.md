# Mitarbeiterportal (Self-Service)

Beschäftigte stellen ihre Anliegen an die Personalabteilung über vordefinierte Formulare im Portal.
Jedes Anliegen wird ein Ticket mit Nummer, Frist, Statusmodell und einem Verlauf, den beide Seiten
sehen. Mails an das HR-Postfach kommen als zweiter Eingang in dasselbe Ticketsystem. Angemeldet wird
zentral über Keycloak mit dem Microsoft-365-Konto. Grundlage für alles ist der Personalstamm aus
DokuBit, den n8n jede Nacht an das Portal schickt.

**Stand 17.10.2026:** Der Konzeptplan (Fassung 6) ist in `main` (PR #4). Personalabteilung,
Datenschutzbeauftragter und MAV haben ihm am 17.10.2026 zugestimmt. Paket S0 ist mit PR #5 in
`main`, aber nicht deployt; der Ablaufplan steht in
[`deploy-selfservice-s0-2026-10.md`](../../historie/deploy-selfservice-s0-2026-10.md).

**Hier anfangen:** [Übergabe S0 vom 17.10.2026](../../historie/uebergabe-selfservice-s0-2026-10-17.md).
Sie nennt Stand, Entscheidungen, Prüfung, die Checkliste vor dem ersten Produktivlauf, die offenen
Punkte und den Wiedereinstieg.

## Stand je Paket

Reihenfolge und Vorbedingungen: Plan, Abschnitt 13. Vorgeschlagen ist S1 und S0 parallel, dann S3
und S3b, danach S2 und S4, zuletzt S5.

| Paket | Inhalt | Stand |
|---|---|---|
| S0 | Personalstamm aus DokuBit: Webhook für n8n, Abgleich je Vertrag, Ansicht „Personen“ mit „Zu prüfen“, Schreibschutz der Beschäftigtenrouten | **in `main`** (PR #5, `a43aa25`), nicht deployt; vor dem ersten Produktivlauf E-S25 und E-S27 mit dem DSB klären |
| S1 | Keycloak und Anmeldung des HR-Teams | geplant; unabhängig von S0, parallel möglich |
| S2 | Mitarbeiterportal für Beschäftigte | geplant |
| S3 | Ticketsystem | geplant |
| S3b | HR-Postfach als zweiter Eingang | geplant |
| S4 | Welle 1 vollständig (Bankverbindung, Bescheinigung, Arbeitsbefreiung u. a.) | geplant |
| S5 | Betrieb und Einführung | geplant |

## Dokumente in diesem Ordner

| Datei | Inhalt |
|---|---|
| [selfservice-portal-plan.html](selfservice-portal-plan.html) | Konzeptplan, Fassung 6: Katalog, Ticketsystem, Postfach, Keycloak, Datenmodell, Datenschutz, Pakete S0–S5 und Entscheidungen E-S1–E-S29. Für S0 nachgeführt in 5.1, 11.1, 12.3 und 13 |
| [selfservice-designkonzept.html](selfservice-designkonzept.html) | Designkonzept: Leitbild, Bausteine aus `ux-umbau`, Mockups aller Masken für Beschäftigte, Schulleitung und HR |
| [s0-personalstamm-n8n.md](s0-personalstamm-n8n.md) | Betriebsanleitung S0: SQL-Abfrage, Einrichtung des n8n-Ablaufs, Grundcodes mit Abhilfe, Rücknahme, Bestandsprüfung der Portal-Datenbank, Checkliste vor dem ersten Produktivlauf |
| [s0-personalstamm-n8n.json](s0-personalstamm-n8n.json) | Importvorlage des n8n-Stammablaufs (n8n 2.x, ohne Credentials) |
| [s0-testdaten.json](s0-testdaten.json) | Elf erfundene DokuBit-Zeilen für den lokalen Webhook; Aufruf und Zweck je Zeile in der Übergabe, Abschnitt 8.3 |
| README.md | Diese Übersicht |

## Weitere Dokumente

| Datei | Inhalt |
|---|---|
| [../../historie/uebergabe-selfservice-s0-2026-10-17.md](../../historie/uebergabe-selfservice-s0-2026-10-17.md) | Übergabe S0: Stand, Entscheidungen, Prüfung in Kürze (Abschnitt 4), Checkliste vor dem ersten Produktivlauf, offene Punkte, Wiedereinstieg |
| [../../historie/codereview-s0-personalstamm-2026-10.md](../../historie/codereview-s0-personalstamm-2026-10.md) | Prüfprotokoll S0: sechs Runden Review und Gegenprüfung mit 77 Befunden und ihrem Ergebnis, die Entscheidungen mit Urheber, Ende-zu-Ende-Probe und Restrisiken |
| [../../historie/s0-bauvorgabe-2026-10.md](../../historie/s0-bauvorgabe-2026-10.md) | Archiv der Bauvorgabe, nach der S0 gebaut wurde, mit Markierungen, was später ersetzt oder ergänzt wurde. Nicht mehr maßgeblich; es gelten Plan und Anleitung |
| [../../historie/codereview-selfservice-plan-2026-10.md](../../historie/codereview-selfservice-plan-2026-10.md) | Prüfprotokoll des Konzeptplans: Code-Review mit Gegenprüfung, Befunde F1–F83 und ihre Umsetzung in Fassung 6 |

## Im Code

- Abgleich: `src/lib/personalstamm/abgleich.ts`. Der Kopfkommentar fasst die Regeln zusammen.
- Webhook: `src/app/api/webhooks/personalstamm/route.ts`
- Leserouten: `src/app/api/personalstamm/personen/route.ts` und `src/app/api/personalstamm/pruefen/route.ts`
- Schreibschutz der Beschäftigtenrouten unter `/api/employees`: `src/lib/personalstamm/schreibschutz.ts`
- Ansicht: `src/app/(portal)/personen/`, `src/components/personen/zu-pruefen.tsx`
- Konstanten: `src/lib/constants.ts`, Block „Personalstamm aus DokuBit“
