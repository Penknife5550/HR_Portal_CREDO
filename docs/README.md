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

### Minijob-Checkliste 2026 — *AP 1 und AP 2 umgesetzt, Phase 1 läuft*

| Datei | Inhalt |
|---|---|
| [module/minijob/minijob-umsetzungsstand.md](module/minijob/minijob-umsetzungsstand.md) | **Übergabe-Dokument:** Was gebaut ist, welche Festlegungen gelten, womit es weitergeht. Hier anfangen |
| [module/minijob/checkliste-minijobzentrale-2026-06-30.pdf](module/minijob/checkliste-minijobzentrale-2026-06-30.pdf) | **Amtliche Vorlage der Minijob-Zentrale, Stand 30.06.2026** — maßgeblich für die Umsetzung. Seiten 7–9 (Merkblatt, Befreiungsantrag, Aufhebungsantrag) werden in AP 8 als System-Dokumente extrahiert |
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
| [module/dokumente/starterpaket-dokumente.md](module/dokumente/starterpaket-dokumente.md) | Konzept Dokumente-Hub und Starterpaket |
| [module/dokumente/erzeugte-dokumente-im-vorgang-plan.html](module/dokumente/erzeugte-dokumente-im-vorgang-plan.html) | Erzeugte Dokumente im Vorgang sichtbar machen |
| [module/dokumente/erweiterungen-vorlagen-benutzer-plan.html](module/dokumente/erweiterungen-vorlagen-benutzer-plan.html) | Erweiterungen Vorlagen und Benutzerverwaltung |
| [module/dokumente/mitteilung-hr-team-vorlagen-update.md](module/dokumente/mitteilung-hr-team-vorlagen-update.md) | Mitteilung ans HR-Team zum Vorlagen-Update |
| [module/dokumente/dokumentenpaket-versand-plan.html](module/dokumente/dokumentenpaket-versand-plan.html) | **Plan (Sept. 2026):** Starterpaket flexibel — Vorlagen im Vorgang auswählen, befüllen, per E-Mail versenden; Mockups, Datenmodell, Aufwand. **Vollständig umgesetzt** (Bausteine 1–15, Zweig `feat/dokumentenpaket-versand`, 4. September) |
| [module/dokumente/dokumentenpaket-offene-punkte.md](module/dokumente/dokumentenpaket-offene-punkte.md) | **Offene Punkte** nach dem Code-Review: vier bewusst nicht behobene Befunde, die Verifikation mit echtem SMTP und die Deploy-Hinweise |

### Ruhestandsplanung — *geplant*

| Datei | Inhalt |
|---|---|
| [module/ruhestandsplanung/ruhestandsplanung-modul-plan.html](module/ruhestandsplanung/ruhestandsplanung-modul-plan.html) | Modulplan |

## Historie

| Datei | Inhalt |
|---|---|
| [historie/FEHLER_PDF_FIXES.md](historie/FEHLER_PDF_FIXES.md) | Behobene PDF-Fehler |
| [historie/onboarding-fixes-2026-08.md](historie/onboarding-fixes-2026-08.md) | Onboarding-Fixes August 2026 (Zweckbefristung, Dokument-Typ-Mapping) |
| [historie/codereview-und-vorlagen-2026-09.md](historie/codereview-und-vorlagen-2026-09.md) | **Gesamtdurchsicht + Vorlagen für Offboarding/Verbeamtung, Sept. 2026** — enthält die Deploy-Voraussetzung `./backups:/backups` und die offenen Punkte |

---

## Konventionen für neue Dokumente

- **Modul-Dokumentation** gehört nach `module/<modulname>/`.
- **HTML-Dokumente** zur Abstimmung mit dem Fachbereich folgen dem CREDO-CI. Als Vorlage dient
  `module/vertragsende/vertragsende-prozess.html` (Titelblatt, CREDO-Linie, Montserrat, Verwaltungs-Grau
  als Primärfarbe, Mockup-Klassen für Masken-Skizzen).
- **Keine Umlaute, Leerzeichen oder Gedankenstriche in Dateinamen** — das hat bei der Verbeamtungs-Datei
  Werkzeugprobleme verursacht.
- Neue Einträge bitte in dieser Übersicht ergänzen.
