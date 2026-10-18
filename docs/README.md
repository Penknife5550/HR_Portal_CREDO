# Dokumentation – CREDO HR-Portal

Ablage nach Modul. HTML-Dokumente sind im CREDO-Corporate-Design gehalten und direkt im Browser lesbar;
Markdown-Dateien sind Entwickler-Dokumentation.

## Handbücher

| Datei | Inhalt |
|---|---|
| [handbuch/handbuch.html](handbuch/handbuch.html) | Einsteiger-Handbuch für HR mit Screenshots |
| [handbuch/bem-handbuch.html](handbuch/bem-handbuch.html) | Handbuch zum BEM-Modul |

Die Screenshots liegen in `handbuch/screenshots/` und werden relativ aus `handbuch.html` geladen —
beim Verschieben müssen Handbuch und Bildordner zusammenbleiben.

## Module

### Onboarding — *Änderungsplan zur Freigabe*

| Datei | Inhalt |
|---|---|
| [module/onboarding/aenderungsplan-2026-09.html](module/onboarding/aenderungsplan-2026-09.html) | **Plan (Fassung 4 vom 22.09.2026; Paket 1 umgesetzt, Rest offen):** Stellenbezeichnung statt Stellenbeschreibung, Fragebogen und Modalitäten parallel (Fix für festhängende Vorgänge), individuelle E-Mail mit Anhang in vier Modulen, Unterlagen nachfordern in allen sechs Vorgangsarten, Reparatur der Abteilungsaufgaben im Offboarding (Paket 1b) und Abteilungsaufgaben im Onboarding (Paket 5). Mit Vorher/Nachher-Mockups, Entscheidungen, Deploy-Prüfungen |
| [module/onboarding/ausstattung-zugaenge-plan.html](module/onboarding/ausstattung-zugaenge-plan.html) | **Plan „Ausstattung & Zugänge“ (12.10.2026, Entscheidungen E-A1–E-A39 getroffen):** Führungskraft wählt in den Modalitäten Schlüssel, Geräte, Zugänge aus einem Katalog je Stelle und Einrichtung, mit Bemerkung; jede Wahl (je Option) wird eine Abteilungsaufgabe; Stufe 2 Ausgabe je Stück und Rücknahme/Sperren im Offboarding. Prozesslandschaft, Prozesskette mit RACI und Kennzahlen, Vorher/Nachher-Mockups, Regeln, Datenmodell, Lückenprüfung, Pakete A0–A4 |
| [module/onboarding/ausstattung-feinplan.md](module/onboarding/ausstattung-feinplan.md) | **Feinplan „Ausstattung & Zugänge“, Pakete A1–A3 (12.10.2026, in Betrieb seit 14.10.2026)** — Festlegungen F1–F23, Schritte S0–S20, Vorlagen, Risiken und Restfragen; Standardkatalog vom 14.10.2026 und Aufräumen der Vorlagenpunkte (Abschnitt 8) |
| [module/onboarding/ausstattung-feinplan-a4.md](module/onboarding/ausstattung-feinplan-a4.md) | **Feinplan Paket A4, Stufe 2 (13.10.2026, eingeschaltet am 14.10.2026)** — Festlegungen G1–G28, Schritte S21–S37: Ausgaben je Stück, „Einstellung zuordnen“ im Offboarding, Rücknahme- und Sperraufgaben, Rückgabezustände, Übergabe- und Rückgabeprotokoll, Löschfristen; Vorlagen und Betrieb (Abschnitt 4), offene Fragen an den DSB (Abschnitt 6) |
| [module/onboarding/ausstattung-schema-delta.sql](module/onboarding/ausstattung-schema-delta.sql) | Schema-Delta „Ausstattung & Zugänge“ (A1–A3, Abschnitt A4 am Ende) gegenüber `main`, nur zur Prüfung — nicht von Hand ausführen, der Entrypoint spielt es per `db push` ein. Einzige nicht rein additive Stelle: der neue Fremdschlüssel auf `offboarding_processes."onboardingId"` (Vorab-Prüfung in `CLAUDE.md`) |
| [module/onboarding/paket4-feinplanung.md](module/onboarding/paket4-feinplanung.md) | **Feinplanung Paket 4 „Unterlagen nachfordern“, Stufe 1 (25.09.2026, deployt am 30.09.2026)** — Spezifikation, Entscheidungen E-1–E-8 (16.1), Ergänzungen Z1–Z3, Regeln N1–N4 und Abweichungen bei der Umsetzung (Abschnitt 18) |

### Minijob-Checkliste 2026 — *AP 1 und AP 2 umgesetzt, Phase 1 läuft*

| Datei | Inhalt |
|---|---|
| [module/minijob/minijob-umsetzungsstand.md](module/minijob/minijob-umsetzungsstand.md) | **Übergabe-Dokument:** Was gebaut ist, welche Festlegungen gelten, womit es weitergeht. Hier anfangen |
| [module/minijob/minijob-offene-punkte.md](module/minijob/minijob-offene-punkte.md) | **Offene Punkte (01.09.2026)** — Arbeitsliste nach der Abschlussdurchsicht: 32 Punkte, davon 11 vor dem Rollout, je mit Begründung und Fundstellen |
| [module/minijob/checkliste-minijobzentrale-2026-06-30.pdf](module/minijob/checkliste-minijobzentrale-2026-06-30.pdf) | **Amtliche Vorlage der Minijob-Zentrale, Stand 30.06.2026** — maßgeblich für die Umsetzung. Seiten 7–9 (Merkblatt, Befreiungsantrag, Aufhebungsantrag) werden in AP 8 als System-Dokumente extrahiert |
| [module/minijob/anlagen-wortlaut-2026-06-30.txt](module/minijob/anlagen-wortlaut-2026-06-30.txt) | Unveränderter Wortlaut der Anlagen (Seiten 7–9) aus der amtlichen Checkliste vom 30.06.2026; Prüfgrundlage für `src/__tests__/lib/rv-antrag-wortlaut.test.ts`, nicht von Hand bearbeiten |
| [module/minijob/minijob-checkliste-2026.html](module/minijob/minijob-checkliste-2026.html) | Abgleich der amtlichen Checkliste mit dem Personalfragebogen, Lückenanalyse, Umsetzungsplan, Entscheidungsprotokoll, Nachtrag 25.08.2026 |
| [module/minijob/minijob-mockups-2026.html](module/minijob/minijob-mockups-2026.html) | Prozesskette und Masken-Entwürfe (Zielzustand nach voller Phase 1) |

Branch: `feat/minijob-checkliste-2026`.

> **Achtung Formularstand:** Der Erstabgleich lief gegen die Fassung 26.05.2026, maßgeblich ist inzwischen
> **30.06.2026**. Vor dem Extrahieren der Anlagen bitte prüfen, ob die Minijob-Zentrale erneut nachgelegt hat —
> [Downloadseite](https://www.minijob-zentrale.de/SharedDocs/Downloads/DE/Formulare/gewerblich/Checkliste_BDA_Personalfragebogen.html).

### Vertragsende — *im Betrieb*

| Datei | Inhalt |
|---|---|
| [module/vertragsende/vertragsende-prozess.html](module/vertragsende/vertragsende-prozess.html) | Konzept, Prozess und Mockups |
| [module/vertragsende/vertragsende-implementierung.md](module/vertragsende/vertragsende-implementierung.md) | Implementierungs-Dokumentation |
| [module/vertragsende/vertragsende-phase2-plan.md](module/vertragsende/vertragsende-phase2-plan.md) | Phase 2 (n8n-Anbindung) |
| [module/vertragsende/zweckbefristung-formular-mockup.html](module/vertragsende/zweckbefristung-formular-mockup.html) | Mockup des Modalitäten-Formulars mit Zweckbefristung |

### Elternzeit

| Datei | Inhalt |
|---|---|
| [module/elternzeit/elternzeit-implementierungsplan.md](module/elternzeit/elternzeit-implementierungsplan.md) | Implementierungsplan |
| [module/elternzeit/elternzeit-phase-1-status.md](module/elternzeit/elternzeit-phase-1-status.md) | Status Phase 1 |
| [module/elternzeit/elternzeit-phase-2-status.md](module/elternzeit/elternzeit-phase-2-status.md) | Status Phase 2 |
| [module/elternzeit/elternzeit-phase-2-review-fixes.md](module/elternzeit/elternzeit-phase-2-review-fixes.md) | Behobene Review-Findings |

### BEM (Betriebliches Eingliederungsmanagement)

| Datei | Inhalt |
|---|---|
| [module/bem/BEM_UMSETZUNG.md](module/bem/BEM_UMSETZUNG.md) | Umsetzung |
| [module/bem/BEM_DEPLOY.md](module/bem/BEM_DEPLOY.md) | Deployment |
| [module/bem/BEM_E0_VORLAGENBIBLIOTHEK.md](module/bem/BEM_E0_VORLAGENBIBLIOTHEK.md) | E0 – Vorlagenbibliothek |
| [module/bem/BEM_E10_ONLINE_EINWILLIGUNGEN.md](module/bem/BEM_E10_ONLINE_EINWILLIGUNGEN.md) | E10 – Online-Einwilligungen |
| [module/bem/BEM_E11_DOKUMENTE_UND_EINWILLIGUNGSDOKUMENTE.md](module/bem/BEM_E11_DOKUMENTE_UND_EINWILLIGUNGSDOKUMENTE.md) | E11 – Dokumente und Einwilligungsdokumente |

### Verbeamtung

| Datei | Inhalt |
|---|---|
| [module/verbeamtung/unterrichtsbesuche-nrw-ersatzschulen.md](module/verbeamtung/unterrichtsbesuche-nrw-ersatzschulen.md) | Rechtsgrundlagen zur digitalen Dokumentation von Unterrichtsbesuchen (NRW-Ersatzschulen) — referenziert von `src/lib/legal-references.ts` |
| [module/verbeamtung/VERBEAMTUNG_BEURTEILUNGEN_STATUS.md](module/verbeamtung/VERBEAMTUNG_BEURTEILUNGEN_STATUS.md) | Status Beurteilungen |
| [module/verbeamtung/VERBEAMTUNG_NEXT_STEPS.md](module/verbeamtung/VERBEAMTUNG_NEXT_STEPS.md) | Nächste Schritte |

### Dokumente, Vorlagen & Starterpaket

| Datei | Inhalt |
|---|---|
| [module/dokumente/starterpaket-dokumente.md](module/dokumente/starterpaket-dokumente.md) | **Historisch (Juni 2026):** Konzept Dokumente-Hub und Starterpaket. Der dort geplante Versandweg (`src/lib/starterpaket.ts`, `POST /api/onboarding/[id]/starterpaket`) ist seit dem 4. September abgelöst — heute versendet `src/lib/dokumentenpaket.ts` hinter drei Routen unter `/api/dokumentenpaket/`. Die Abschnitte „Heute" im Dokument sind nachgeführt; der gültige Kurzstand steht in `CLAUDE.md`, Abschnitt „Dokumente & Starterpaket" |
| [module/dokumente/erzeugte-dokumente-im-vorgang-plan.html](module/dokumente/erzeugte-dokumente-im-vorgang-plan.html) | Erzeugte Dokumente im Vorgang sichtbar machen |
| [module/dokumente/erweiterungen-vorlagen-benutzer-plan.html](module/dokumente/erweiterungen-vorlagen-benutzer-plan.html) | Erweiterungen Vorlagen und Benutzerverwaltung |
| [module/dokumente/mitteilung-hr-team-vorlagen-update.md](module/dokumente/mitteilung-hr-team-vorlagen-update.md) | Mitteilung ans HR-Team zum Vorlagen-Update |
| [module/dokumente/handbuch-dokumente-versand.html](module/dokumente/handbuch-dokumente-versand.html) | **Handbuch „Dokumente erstellen und versenden“ für das Personalbüro (07.09.2026)** — Schreiben erstellen, Dokumentenpaket versenden (Onboarding, Vertragsverlängerung, Verbeamtung, Offboarding), was nach dem Versand passiert, Fehlerhilfe, Standardpaket einrichten |
| [module/dokumente/dokumentenpaket-versand-plan.html](module/dokumente/dokumentenpaket-versand-plan.html) | **Plan (Sept. 2026):** Starterpaket flexibel — Vorlagen im Vorgang auswählen, befüllen, per E-Mail versenden; Mockups, Datenmodell, Aufwand. **Vollständig umgesetzt** (Bausteine 1–15, Zweig `feat/dokumentenpaket-versand`, 4. September) |
| [module/dokumente/dokumentenpaket-offene-punkte.md](module/dokumente/dokumentenpaket-offene-punkte.md) | **Offene Punkte** nach dem Code-Review: vier bewusst nicht behobene Befunde, die Verifikation mit echtem SMTP und die Deploy-Hinweise |

### Betrieb — *Zeitplaner seit 30.09.2026 auf dem Server*

| Datei | Inhalt |
|---|---|
| [module/betrieb/zeitplaner-plan.md](module/betrieb/zeitplaner-plan.md) | **Zeitplaner im Portal (30.09.2026, Fassung 2, umgesetzt)** — Befund zu n8n als Wecker, Zielbild, Datenmodell, Oberfläche „Automatische Läufe“, Einführung ohne n8n (Abschnitt 8), Entscheidungen (Abschnitt 10), Umsetzung und Nachtrag zum Reiter „E-Mails“ (Abschnitte 11 und 12). Die Regeln stehen in `CLAUDE.md`, „Automatische Läufe“ |

### Ruhestandsplanung — *geplant*

| Datei | Inhalt |
|---|---|
| [module/ruhestandsplanung/ruhestandsplanung-modul-plan.html](module/ruhestandsplanung/ruhestandsplanung-modul-plan.html) | Modulplan |

### Mitarbeiterportal (Self-Service) — *Fassung 6; Paket S0 gebaut, nicht deployt*

| Datei | Inhalt |
|---|---|
| [module/selfservice/README.md](module/selfservice/README.md) | **Einstieg in den Feature-Ordner:** Stand je Paket S0–S5, die Dokumente des Ordners und die Einstiegspunkte im Code. Hier anfangen; der Wiedereinstieg in S0 steht in der [Übergabe vom 17.10.2026](historie/uebergabe-selfservice-s0-2026-10-17.md) |
| [module/selfservice/selfservice-portal-plan.html](module/selfservice/selfservice-portal-plan.html) | **Konzeptplan, Fassung 6 (17.10.2026) — nach Code-Review (7 Fachbereiche, 75 Agenten) mit allen kritischen und wesentlichen Befunden eingearbeitet; DokuBit-Abfragen vom 17.10.2026 eingetragen (eine Zeile je Vertrag, Schlüssel Mandant + Abrechnungskreis + MANR, Person über die dienstliche Adresse, Austritt über das Vertragsende; 343 Personen mit 362 laufenden Verträgen); 18 von 29 Entscheidungen getroffen, keine Trägerentscheidung mehr offen; Zustimmung von HR, DSB und MAV am 17.10.2026 erteilt; vor S0 bleiben E-S25 (Gremium der GmbHs) und E-S27 (DSG-EKD oder BDSG) offen.** Vordefinierte Formulare als Kern; jedes Anliegen wird ein **Ticket** mit vollständigem Statusmodell, Lastübersicht und einem Verlauf, den **beide Seiten** sehen. **Benachrichtigung bei jedem Statuswechsel** (13 Vorlagen). Zweiter Eingang: Übernahme der E-Mails an `CREDO-Personal-intern@fes-credo.de` über Microsoft Graph, berechtigt ausschließlich in Exchange Online. Anmeldung zentral über **Keycloak**, föderiert gegen Microsoft 365, mit abgeschotteter Sitzungsrolle für Beschäftigte. Personalstamm aus DokuBit über n8n. Sonderurlaub als Regelwerk je Mandant. Pakete S0–S5 mit Tests und Rücknahme, **46–63 Arbeitstage** ohne die vier Vorbedingungen. Entscheidungen E-S1–E-S29. |
| [module/selfservice/selfservice-designkonzept.html](module/selfservice/selfservice-designkonzept.html) | **Designkonzept Mitarbeiterportal (17.10.2026)** — Leitbild „Klarer Weg", Tokens und Bausteine aus `ux-umbau`, Statuskatalog je Sicht, Mockups aller Masken für Beschäftigte (Desktop und Handy), Schulleitung und HR, Benachrichtigungen, Barrierefreiheit (WCAG 2.1 AA) und Umsetzungshinweise je Maske |
| [module/selfservice/s0-personalstamm-n8n.md](module/selfservice/s0-personalstamm-n8n.md) | **n8n-Stammablauf S0 „Personalstamm aus DokuBit"** — SQL-Abfrage mit fester Spaltenliste, Einrichtung des Ablaufs (Stapel je Adresse, ein Stapel nach dem anderen), Antwort und Grundcodes mit Abhilfe, Rücknahme, Bestandsprüfung der Portal-Datenbank, Checkliste vor dem ersten Produktivlauf. Dazu die Importvorlage [s0-personalstamm-n8n.json](module/selfservice/s0-personalstamm-n8n.json) (n8n 2.x, ohne Credentials) |
| [module/selfservice/s0-testdaten.json](module/selfservice/s0-testdaten.json) | Elf erfundene DokuBit-Zeilen für den Webhook in der lokalen Umgebung (eine Person mit mehreren Verträgen, beendete Verträge, Formatfehler, unbekannter Mandant, geteiltes Postfach, Unterstrich in der Adresse); Aufruf und erwartete Ergebnisse in der Übergabe, Abschnitt 8.3 |

S0 ist mit PR #5 in `main` (`a43aa25`), noch nicht deployt. Stand vom 18.10.2026 und nächste Schritte: [Übergabe S0](historie/uebergabe-selfservice-s0-2026-10-17.md), Abschnitt „Stand 18.10.2026 — hier weitermachen“; Weitermachen auf einem anderen Rechner: dort Abschnitt 8.6.

## Entwicklung

| Datei | Inhalt |
|---|---|
| [entwicklung/lokale-umgebung.md](entwicklung/lokale-umgebung.md) | **Lokale Entwicklungsumgebung einrichten (18.10.2026)** — auf einem neuen Rechner nur mit dem Repo: Voraussetzungen, Klon, Abnahme ohne Datenbank, Datenbank-Container auf Port 5433, Umgebungsvariablen mit Mindestlängen (ohne Werte), Reihenfolge `db push` → `db seed` → `seed-check.js`, Testzugang, Gotenberg, Vorschau für Claude, Stolpersteine |

## Historie

| Datei | Inhalt |
|---|---|
| [historie/FEHLER_PDF_FIXES.md](historie/FEHLER_PDF_FIXES.md) | Behobene PDF-Fehler |
| [historie/onboarding-fixes-2026-08.md](historie/onboarding-fixes-2026-08.md) | Onboarding-Fixes August 2026 (Zweckbefristung, Dokument-Typ-Mapping) |
| [historie/deploy-dokumentenpaket-2026-09-07.md](historie/deploy-dokumentenpaket-2026-09-07.md) | **Deploy 07.09.2026** (Dokumentenpaket-Versand und Restbefunde, zwei Schema-Deltas auf einmal): was ausgerollt wurde, Ablauf, Verifikation, Nacharbeiten, Lehren |
| [historie/deploy-onboarding-pakete-2026-09.md](historie/deploy-onboarding-pakete-2026-09.md) | **Deploy 24.09.2026** (Onboarding-Pakete 1, 1b, 2, 5 und Code-Review-Fixes): Ablaufplan, Protokoll, Mailvorlagen, Lehren |
| [historie/codereview-und-vorlagen-2026-09.md](historie/codereview-und-vorlagen-2026-09.md) | **Gesamtdurchsicht + Vorlagen für Offboarding/Verbeamtung, Sept. 2026** — enthält die Deploy-Voraussetzung `./backups:/backups` und die offenen Punkte |
| [historie/deploy-paket4-stufe1.md](historie/deploy-paket4-stufe1.md) | **Ablaufplan Deploy Paket 4 Stufe 1 „Unterlagen nachfordern“ (25.09.2026)** — Vorprüfungen V-1–V-9, SQL-Prüfungen, Handschritte, n8n, Rückfall. Ausgeführt am 30.09.2026 samt Zeitplaner, nicht protokolliert; nachträglich belegt im Protokoll vom 14.10.2026 |
| [historie/paket4-stufe1-uebergabe.md](historie/paket4-stufe1-uebergabe.md) | **Übergabe Paket 4 nach Stufe 1 (26.–29.09.2026)** — was umgesetzt und geprüft ist, Code-Review, Voraussetzungen V-1–V-9, Stufe 2, offene Punkte, Lehren; Einstieg in Abschnitt 0 |
| [historie/zeitplaner-und-mailprotokoll-uebergabe.md](historie/zeitplaner-und-mailprotokoll-uebergabe.md) | **Übergabe Zeitplaner und Mailprotokoll je Vorgang (30.09.2026, Stand vor dem Commit)** — Entscheidungen (Zeitplaner statt n8n), Prüfungen, Ansehen im Docker, betroffene Mailvorlagen, offene Punkte, Dateiliste. Am 30.09.2026 mit Paket 4 ausgerollt |
| [historie/deploy-main-2026-10.md](historie/deploy-main-2026-10.md) | **Server-Update 14.10.2026, `main` ab `b6e1c8a` (ausgeführt, Protokoll unter dem Kopf)** — „Ausstattung & Zugänge“ A1–A4 samt Standardkatalog, zwei Offboarding-Fixes; Vorgeschichte der nicht protokollierten Deploys vom 30.09., 01.10. und 02.10.; Rückfall, „Offen nach dem Deploy“ |
| [historie/codereview-selfservice-plan-2026-10.md](historie/codereview-selfservice-plan-2026-10.md) | **Code-Review des Self-Service-Konzeptplans, 17.10.2026** — 7 Fachbereiche mit Gegenprüfung, 7 kritische und 32 wesentliche Befunde (F1–F83), ihre Umsetzung in Fassung 6 und die Konsistenzprüfung danach |
| [historie/s0-bauvorgabe-2026-10.md](historie/s0-bauvorgabe-2026-10.md) | **Bauvorgabe S0 „Personalstamm aus DokuBit“, Archiv (17.10.2026)** — erste Fassung und Nachtrag v3 „Die Adresse ist die Person“ im Wortlaut des Bautags, mit Markierungen, was später ersetzt oder ergänzt wurde. Nicht mehr maßgeblich; es gelten Plan und n8n-Anleitung |
| [historie/codereview-s0-personalstamm-2026-10.md](historie/codereview-s0-personalstamm-2026-10.md) | **Prüfprotokoll S0, 17.10.2026** — sechs Runden Review und adversariale Gegenprüfung, 77 Befunde (2 kritisch, 23 wesentlich), keiner der kritischen oder wesentlichen offen; Entscheidungen mit Urheber (Auftraggeber oder Claude), Ende-zu-Ende-Probe, Restrisiken |
| [historie/uebergabe-selfservice-s0-2026-10-17.md](historie/uebergabe-selfservice-s0-2026-10-17.md) | **Übergabe Self-Service S0, 17.10.2026** — Stand, Entscheidungen, Verifikation, Checkliste vor dem ersten Produktivlauf, offene Punkte, nächste Pakete und Wiedereinstieg in einer neuen Sitzung |
| [historie/deploy-selfservice-s0-2026-10.md](historie/deploy-selfservice-s0-2026-10.md) | **Ablaufplan Server-Update mit Self-Service S0 (noch nicht ausgeführt)** — `main` ab `ea2d41d`: Zugriffskorrekturen vom 16.10., Fix der Status-Kacheln, S0; Etappe 1 rollt S0 ruhend aus, Etappe 2 nimmt es erst nach den Freigaben F1–F11 in Betrieb; Rückfall, Protokollvorlage |
| [historie/codereview-deploy-selfservice-s0-2026-10.md](historie/codereview-deploy-selfservice-s0-2026-10.md) | **Prüfprotokoll des Ablaufplans, 17./18.10.2026** — zwei Runden (Entwurf mit drei Prüfern, Nachführen auf `0e1d8de` mit zwei Prüfern), 34 Befunde (14 wichtig, 20 klein), keiner offen; verworfene Teilvorschläge mit Grund, Restrisiken |

---

## Konventionen für neue Dokumente

- **Modul-Dokumentation** gehört nach `module/<modulname>/`.
- **HTML-Dokumente** zur Abstimmung mit dem Fachbereich folgen dem CREDO-CI. Als Vorlage dient
  `module/vertragsende/vertragsende-prozess.html` (Titelblatt, CREDO-Linie, Montserrat, Verwaltungs-Grau
  als Primärfarbe, Mockup-Klassen für Masken-Skizzen).
- **Keine Umlaute, Leerzeichen oder Gedankenstriche in Dateinamen** — das hat bei der Verbeamtungs-Datei
  Werkzeugprobleme verursacht.
- Neue Einträge bitte in dieser Übersicht ergänzen.
