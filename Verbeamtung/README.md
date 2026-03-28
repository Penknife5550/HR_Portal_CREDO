# Verbeamtungsprozess (PSI): HR-Portal

**Status:** Geplant — Sprint 5
**Grundlage:** `PLAN_VERBEAMTUNG.html` (detaillierter Implementierungsplan)

---

## Was ist das?

Der Verbeamtungsprozess (PSI = Privatschul-Initiative) für Lehrkräfte an den CREDO-Schulen. Ein 5-Phasen-Prozess der sich über bis zu 3+ Jahre erstreckt — von der Antragstellung bis zur Übernahme auf Lebenszeit.

---

## Die 5 Phasen

### Phase 1: Antrag & Beurteilung (T-6 Monate)
- Schulleitung startet den Vorgang im Portal
- Checkliste: Antrag, Unterrichtsbesuch, Beurteilung, Beiratsentscheidung
- Magic Link an Schulleitung für digitale Beurteilung (5-Sterne-Bewertung)
- Beiratsentscheidung dokumentieren (Positiv / Negativ / Aufgeschoben)

### Phase 2: Verwaltungsvorgang starten (T-3 Monate)
- Automatisch nach positiver Beiratsentscheidung
- Webhook/E-Mail an Personalabteilung
- Dokument-Upload: Unterschriebene Beurteilung der SL

### Phase 3: Personaladministration (umfangreichste Phase)
8 Kategorien mit 40+ Checklisten-Punkten:

| Kategorie | Beispiel-Aufgaben |
|---|---|
| 3.1 Vertragsunterlagen | Amtsärztliches Zeugnis, Vertrag auf Probe, Stufenberechnung |
| 3.2 Betriebsrat | Unterlagen an BR, Antwort dokumentieren (mit Frist-Warnung) |
| 3.3 Versicherung | KK-Privatversicherung, Beihilfe-Antrag, Meldung Beihilfestelle |
| 3.4 Rentenversicherung | RV-Befreiungsantrag + Gewährleistungsentscheidung MSB |
| 3.5 Abrechnung | Vertragsende Angestelltenverhältnis, Mehrarbeit, Personalbogen |
| 3.6 LOGA-Umstellung | Transfer, neue Pers.-Nr., Kostenstelle, Pensionsrückstellungen |
| 3.7 Kommunikation | Info Sekretariat, Info UNTIS |
| 3.8 Förderverein | Mitgliedschaft prüfen/beantragen |

### Phase 4: Probezeit (3 Jahre)
- 3 Pflichtbeurteilungen via Magic Link an Schulleitung
- Automatische Erinnerungen (nach 1 Jahr, 2 Jahren, Ende)
- Fortschrittsanzeige: "2 von 3 Beurteilungen abgeschlossen"

### Phase 5: Übernahme auf Lebenszeit (T-3 Monate vor Probezeit-Ende)
- Automatische Berechnung: Probezeit endet am [Datum]
- Beiratsentscheidung (Positiv / Negativ / Verlängerung)
- Neues Amtsarztzeugnis (altes reicht nicht!)
- Vertrag auf Lebenszeit + BR-Anhörung

---

## Technische Umsetzung

Der Verbeamtungsprozess nutzt den **generischen Baukasten** aus Sprint 2:
- `ProcessDashboard` Komponente (config-basiert, wie Offboarding)
- `Employee` Verknüpfung (zentrale Personalakte)
- Magic Links für Schulleitungs-Beurteilungen
- Checklisten-Templates (40+ Punkte, phasenweise)
- Automatische Fristen-Warnungen (Amtsarztzeugnis < 3 Monate, BR-Frist)

### Neue Datenbank-Modelle
- `CivilServiceProcess` — Haupttabelle je Verbeamtungsvorgang
- `CivilServicePhase` — Status jeder der 5 Phasen
- `CivilServiceAssessment` — Beurteilungen (3 Pflichtbeurteilungen)
- `BoardDecision` — Beiratsentscheidungen

### Neue Webhooks
| Event | Empfänger | Inhalt |
|---|---|---|
| `psi-created` | HR + SL | Info + Link zur Beurteilung |
| `psi-assessment-requested` | Schulleitung | Magic Link zum Beurteilungsformular |
| `psi-assessment-completed` | HR | Benachrichtigung |
| `psi-phase-completed` | HR | Nächste Phase beginnen |
| `psi-deadline-warning` | HR | Frist-Warnung |
| `psi-completed` | HR + SL | Übernahme auf Lebenszeit bestätigt |

---

## Nächste Session: Hier weitermachen

1. Schema erweitern (CivilServiceProcess + Phasen-Modelle)
2. Seed: Checklisten-Templates (40+ Punkte je Phase)
3. API-Endpunkte (nutzt generischen apiHandler)
4. Dashboard-Config (nutzt ProcessDashboard)
5. Detail-Ansicht mit Phasen-Tabs
6. Beurteilungsformular (Magic Link für SL)
7. Fristen-Warnungen (Cron-Endpunkt)
