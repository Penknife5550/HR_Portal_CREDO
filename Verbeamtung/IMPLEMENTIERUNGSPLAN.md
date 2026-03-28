# Verbeamtung (PSI) — Implementierungsplan für das HR-Portal

**Erstellt:** 2026-03-28
**Grundlage:** `PROZESS_VERBEAMTUNG_PSI.md` (11-Schritte-Modell nach FES-Vorgehensweise)
**Ziel:** Der gesamte Verbeamtungsprozess — vom Antrag bis zur Übernahme auf Lebenszeit — wird so im Portal abgebildet, dass jede der 3 beteiligten Personengruppen (Lehrkraft, Schulleitung, Personalverwaltung) jederzeit weiß: Was muss ICH tun? Was fehlt noch? Wo stehen wir?

---

## 1. Die drei Nutzergruppen und ihre Sicht

### Lehrkraft (LK)
**Sieht:** Eigenen Antrag, Status, was von ihr benötigt wird
**Macht:** Antrag stellen, Dokumente hochladen, Formulare ausfüllen, Vertrag unterschreiben
**Zugang:** Magic Link per E-Mail (kein Portal-Login nötig)

### Schulleitung (SL)
**Sieht:** Alle PSI-Vorgänge der eigenen Schule, Beurteilungen, Referenzen
**Macht:** Beurteilungen ausfüllen, Referenzen schreiben, Beirat informieren
**Zugang:** Magic Link für Beurteilungen + Portal-Login (Rolle EINRICHTUNGSLEITUNG)

### Personalverwaltung (HR)
**Sieht:** Alle Vorgänge aller Schulen, Checklisten, Fristen, Dokumente
**Macht:** Verwaltungsschritte abarbeiten, Dokumente generieren, Fristen überwachen
**Zugang:** Portal-Login (Rolle HR_LEITUNG / HR_SACHBEARBEITER)

---

## 2. Prozessabbildung im Portal

### Übersicht: Die 4 Haupt-Phasen

```
┌─────────────────────────────────────────────────────────────────────┐
│                     VERBEAMTUNG IM HR-PORTAL                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐ │
│  │  PHASE I     │  │  PHASE II    │  │ PHASE III│  │  PHASE IV  │ │
│  │  Antrag &    │→ │  Verwaltung  │→ │ Probezeit│→ │  Übernahme │ │
│  │  Beurteilung │  │  (A-H)       │  │ (3 Jahre)│  │  Lebenszeit│ │
│  │              │  │              │  │          │  │            │ │
│  │ Schritte 1-5 │  │  Schritt 6   │  │  7, 8, 9 │  │   10, 11   │ │
│  │ ~6 Monate    │  │  ~3 Monate   │  │  3 Jahre │  │  ~3 Monate │ │
│  └──────────────┘  └──────────────┘  └──────────┘  └────────────┘ │
│                                                                     │
│  👤 LK    🏫 SL    📋 HR    👥 Beirat    🏛️ BR Detmold            │
└─────────────────────────────────────────────────────────────────────┘
```

### Detail: Was passiert in jedem Schritt

```
PHASE I: ANTRAG & BEURTEILUNG
══════════════════════════════

Schritt 1: Formloser Antrag
├── Wer: LK → SL → Träger
├── Portal: LK füllt Online-Antrag aus (Magic Link)
├── Automatisch: Voraussetzungsprüfung (12 Kriterien)
├── Automatisch: Eingangsbestätigung per E-Mail
└── ✅ GATEKEEPER: Alle Voraussetzungen erfüllt?
    ├── JA → Weiter zu Schritt 2
    └── NEIN → Hinweis welche Voraussetzungen fehlen

Schritt 2: Erste Information an Beirat
├── Wer: SL informiert Beirat
├── Portal: Status-Update + Protokoll-Upload
└── Ergebnis: Positives Feedback → Weiter

Schritt 3: 1. Unterrichtsbesuch + Beurteilung
├── Wer: SL besucht Unterricht
├── Portal: 🔗 Magic Link an SL → Beurteilungsformular
│   ├── Jeder Bereich wird benotet (1-6)
│   ├── Mind. 1 Bereich muss Anforderungen übertreffen
│   ├── Kein Bereich schlechter als 3,0
│   └── Gesamtschnitt muss < 3,0 sein
├── Automatisch: Note wird berechnet und geprüft
└── ✅ GATEKEEPER: Beurteilung < 3,0?

Schritt 4: Gespräch SL + Bewerber → Referenz
├── Wer: SL + LK (+ ggf. Vorstand)
├── Portal: 🔗 Magic Link an SL → Referenz-Formular
│   ├── 12 Prüfpunkte (Ja/Nein/Teilweise)
│   ├── Andachtsbesuch, Belastbarkeit, Engagement etc.
│   └── Freitext: Gemeinde-Referenz
├── Zusätzlich: Gemeinde-Referenz Upload
└── Ergebnis: Schriftliche Referenz liegt vor

Schritt 5: Entscheidung Beirat
├── Wer: Beirat der Schule
├── Portal: Abstimmungsergebnis + Datum
├── Ergebnisse:
│   ├── ✅ POSITIV → Weiter zu Phase II
│   ├── ❌ NEGATIV → Prozess endet (Ablehnungsschreiben)
│   └── ⏸️ AUFGESCHOBEN → Wiedervorlage
└── ✅ GATEKEEPER: Nur bei POSITIV geht es weiter


PHASE II: VERWALTUNG (8 Kategorien, ~30 Aufgaben)
══════════════════════════════════════════════════

Schritt 6: Verwaltungsvorgang — Teilweise parallel

┌─ A. Amtsarzt ─────────────────────────────────────────┐
│ HR fordert Zeugnis an → LK geht zum Amtsarzt →       │
│ Zeugnis Upload → ✅ GATEKEEPER: Positiv?              │
│ ⚠️ FRIST: Max. 3 Monate alt bei Vertragsbeginn!       │
└───────────────────────────────────────────────────────┘

┌─ B. Besoldung ────────────────────────────────────────┐
│ Vordienstzeiten berechnen → Erfahrungsstufe →         │
│ Bescheid an LK                                         │
└───────────────────────────────────────────────────────┘

┌─ C. Vertrag & BR ─────────────────────────────────────┐
│ PSI-Vertrag erstellen → LK unterschreibt →            │
│ An BR Dez. 48 zur Genehmigung →                       │
│ ✅ GATEKEEPER: BR genehmigt?                          │
│ ⚠️ Beizulegen: Vertrag, Stufe, Amtsarzt, Urkunden    │
└───────────────────────────────────────────────────────┘

┌─ D. Krankenversicherung ──────────────────────────────┐
│ Info PKV-Pflicht → KK-Bescheinigung → LK wechselt    │
└───────────────────────────────────────────────────────┘

┌─ E. Beihilfe ─────────────────────────────────────────┐
│ Info → Erstantrag → Datenschutz → Stammblatt →        │
│ Meldung an BR Dez. 23                                  │
└───────────────────────────────────────────────────────┘

┌─ F. Rentenversicherung ───────────────────────────────┐
│ RV-Befreiungsantrag → AG-Erklärung → LK unterschreibt│
│ → An DRV Bund                                          │
│ ⚠️ FRIST: Max. 3 Monate nach Vertragsbeginn!          │
│ ⚠️ KRITISCH: Jeder PSI braucht eigenen Antrag!        │
└───────────────────────────────────────────────────────┘

┌─ G. Kündigung & LOGA ─────────────────────────────────┐
│ Kündigungsbestätigung Angestelltenverhältnis →         │
│ LOGA-Überführung (Angestellter → Beamter) →           │
│ Familienzuschläge-Erklärung                            │
└───────────────────────────────────────────────────────┘

┌─ H. Riester, Förderverein, Info ──────────────────────┐
│ Riester-Anschreiben → Einverständnis → Förderverein → │
│ Info an Sekretariat + SL                               │
└───────────────────────────────────────────────────────┘


PHASE III: PROBEZEIT (3 Jahre)
══════════════════════════════

Schritt 7: Übernahme ins PSI auf Probe
├── ✅ Tag-1-Checkliste (9 Pflichtpunkte)
│   ├── Amtsarzt positiv ✓
│   ├── BR Dez. 48 genehmigt ✓
│   ├── Vertrag unterschrieben ✓
│   ├── PKV abgeschlossen ✓
│   ├── RV-Befreiung eingereicht ✓
│   ├── Beihilfe gemeldet ✓
│   ├── LOGA umgestellt ✓
│   ├── Erfahrungsstufe beschieden ✓
│   └── Förderverein aktiv ✓
└── Probezeit beginnt — 3 Jahre

Schritt 8: 2. Unterrichtsbesuch (nach spätestens 1 Jahr)
├── Portal: 🔗 Magic Link an SL → Beurteilungsformular
├── Automatisch: Erinnerungen T+9, T+11, T+12 Monate
├── SL informiert Beirat über Entwicklung
└── Upload: Dienstliche Beurteilung

Schritt 9: 3. Unterrichtsbesuch (Ende Probezeit)
├── Portal: 🔗 Magic Link an SL → Beurteilung + Referenz
├── Automatisch: Erinnerungen T+30, T+33 Monate
├── Referenz-Formular (12 Kriterien, wie Schritt 4)
└── Upload: Beurteilung + Referenz + Gemeinde-Referenz


PHASE IV: ÜBERNAHME AUF LEBENSZEIT
═══════════════════════════════════

Schritt 10: Neuer Amtsarztbesuch
├── HR fordert neues Zeugnis an (altes reicht nicht!)
├── LK → Gesundheitsamt → Upload
└── ✅ GATEKEEPER: Positiv?

Schritt 11: Beirat → Lebenszeit
├── Beirat entscheidet (Grundlage: 3. Beurteilung + Referenz + Amtsarzt)
├── Bei POSITIV:
│   ├── PSI-Vertrag auf Lebenszeit
│   ├── An BR Dez. 48 zur Genehmigung
│   ├── Vertrag an LK (Magic Link)
│   ├── Änderungsmitteilung Beihilfestelle
│   ├── LOGA-Update: Probe → Lebenszeit
│   └── Info an Sekretariat + SL
└── 🎉 ABGESCHLOSSEN
```

---

## 3. Das Dashboard — Was HR auf einen Blick sieht

```
┌─────────────────────────────────────────────────────────────────┐
│ Dashboard    Vorlagen ▾    Verwaltung ▾                         │
├─────────────────────────────────────────────────────────────────┤
│ Onboarding │ Offboarding │ ★ Verbeamtung                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │  3   │ │  1   │ │  2   │ │  1   │ │  0   │ │  5   │       │
│  │Antrag│ │Verw. │ │Probe │ │Übernh│ │Abges.│ │Frist!│       │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘       │
│                                                                 │
│  Analytics ▾   Von [____] Bis [____]   Alle Schulen ▾   CSV    │
│                                                                 │
│  ID            Name             Schule    Schritt   Status      │
│  PSI-2026-001  Maria Schmidt    GYM       6.C       🟡 BR-Anh. │
│  PSI-2026-002  Thomas Müller    GES       3         🔵 Beurt.  │
│  PSI-2024-001  Anna Weber       GYM       8         🟢 Probe   │
│  PSI-2023-001  Peter König      GYM       11        🟣 LZ-Vert.│
│                                                                 │
│  ⚠️ FRISTEN:                                                    │
│  • Maria Schmidt: Amtsarzt läuft in 14 Tagen ab                │
│  • Anna Weber: 2. Unterrichtsbesuch in 3 Wochen fällig        │
│  • PSI-2024-002: RV-Befreiung 2 Monate überfällig!            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Die Detail-Ansicht — Was bei Klick auf einen Vorgang passiert

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Zurück   PSI-2026-GYM-001   🟡 Phase II: Verwaltung         │
│                                                                 │
│ Maria Schmidt · m.schmidt@fes-minden.de · Gymnasium (737)       │
│ PSI auf Probe · Geplanter Vertragsbeginn: 01.08.2026           │
├─────────────────────────────────────────────────────────────────┤
│ Übersicht │ Phasen │ Checkliste │ Dokumente │ Beurteilungen    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FORTSCHRITT                                                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 45%        │
│                                                                 │
│  PHASEN-ÜBERSICHT:                                              │
│  ✅ Phase I: Antrag & Beurteilung          (Schritt 1-5)       │
│  🔄 Phase II: Verwaltung                   (Schritt 6)         │
│     ├── ✅ A. Amtsarzt                     erledigt            │
│     ├── ✅ B. Besoldung                    erledigt            │
│     ├── 🔄 C. Vertrag & BR                BR-Anhörung läuft   │
│     ├── ⬜ D. Krankenversicherung          ausstehend          │
│     ├── ⬜ E. Beihilfe                     ausstehend          │
│     ├── ⬜ F. RV-Befreiung                 ausstehend          │
│     ├── ⬜ G. Kündigung & LOGA             ausstehend          │
│     └── ⬜ H. Riester, Förderverein        ausstehend          │
│  ⬜ Phase III: Probezeit                   (Schritt 7-9)       │
│  ⬜ Phase IV: Übernahme Lebenszeit         (Schritt 10-11)     │
│                                                                 │
│  NÄCHSTE AKTION:                                                │
│  📌 BR Dez. 48: Genehmigung abwarten (seit 15.03.2026)        │
│  📌 PKV-Wechsel: Info an LK senden                             │
│                                                                 │
│  ⚠️ FRIST-WARNUNGEN:                                            │
│  🔴 Amtsarztzeugnis nur noch 45 Tage gültig                   │
│  🟡 RV-Befreiung: Frist beginnt bei Vertragsbeginn             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Magic Links — Wer bekommt wann welchen Link

| Wann | An wen | Formular | Inhalt |
|------|--------|----------|--------|
| Schritt 1 | **LK** | Antragsformular | Online-Antrag statt formlosem Brief |
| Schritt 3 | **SL** | Beurteilungsformular | 1. Unterrichtsbesuch: Noten pro Bereich |
| Schritt 4 | **SL** | Referenz-Formular | 12 Prüfpunkte + Gemeinde-Referenz |
| Schritt 6.C | **LK** | Vertragsunterzeichnung | PSI-Vertrag auf Probe digital bestätigen |
| Schritt 6.E | **LK** | Datenschutz-Beihilfe | Einverständniserklärung |
| Schritt 6.F | **LK** | RV-Befreiung | Antrag online ausfüllen |
| Schritt 6.G | **LK** | Familienzuschläge | Erklärung ausfüllen |
| Schritt 6.H | **LK** | Riester + Förderverein | Einverständnis + Mitgliedsantrag |
| Schritt 8 | **SL** | Beurteilungsformular | 2. Unterrichtsbesuch |
| Schritt 9 | **SL** | Beurteilung + Referenz | 3. Unterrichtsbesuch + Referenz |
| Schritt 11 | **LK** | Vertragsunterzeichnung | PSI-Vertrag auf Lebenszeit |

**Prinzip:** Wer nicht im Portal eingeloggt ist, bekommt einen Magic Link. Alles andere läuft über die Portal-Oberfläche.

---

## 6. Automatische Fristen-Warnungen

| Frist | Wann prüfen | Warnung an | Eskalation |
|-------|-------------|-----------|-----------|
| Amtsarztzeugnis Gültigkeit | Täglich | HR | 🟡 60 Tage, 🟠 30 Tage, 🔴 14 Tage |
| BR-Genehmigung ausstehend | Täglich | HR | 🟡 4 Wochen, 🔴 8 Wochen |
| RV-Befreiungsfrist (3 Mon.) | Täglich | HR | 🟡 2 Monate, 🟠 1 Monat, 🔴 2 Wochen |
| 2. Unterrichtsbesuch (1 Jahr) | Monatlich | SL + HR | 🟡 3 Monate vorher, 🔴 1 Monat vorher |
| 3. Unterrichtsbesuch (Ende PZ) | Monatlich | SL + HR | 🟡 6 Monate vorher, 🔴 3 Monate vorher |
| Probezeit-Ende | Monatlich | HR | 🟡 6 Monate, 🟠 3 Monate, 🔴 1 Monat |

---

## 7. Gatekeeper — Automatische Qualitätstore

| Gate | Prüfung | Bei Fehler |
|------|---------|-----------|
| **G1: Voraussetzungen** | 12 Kriterien aus 3.1 (Vertrag, Stelle ≥75%, Erfüller, VEBS, etc.) | Antrag blockiert, fehlende Punkte angezeigt |
| **G2: Beurteilung** | Gesamtschnitt < 3,0, kein Bereich > 3,0, mind. 1 Bereich übertrifft | Beurteilung abgelehnt, SL muss überarbeiten |
| **G3: Beirat** | Nur POSITIV lässt weiter | NEGATIV → Ablehnung, AUFGESCHOBEN → Wiedervorlage |
| **G4: Amtsarzt** | Zeugnis positiv + nicht älter als 3 Monate | Prozess pausiert bis neues Zeugnis |
| **G5: BR Dez. 48** | Genehmigung erteilt | Prozess pausiert, HR wird informiert |
| **G6: Tag-1-Checkliste** | 9 Pflichtpunkte alle erfüllt | Probezeit-Start blockiert |
| **G7: Amtsarzt LZ** | Neues Zeugnis positiv | Übernahme blockiert |
| **G8: Beirat LZ** | POSITIV für Lebenszeit | Wie G3 |

---

## 8. Beurteilungsformular (Magic Link für SL)

Das Beurteilungsformular wird 3x im Prozess verwendet (Schritt 3, 8, 9). Es ist **konfigurierbar** über die Admin-UI (wie Exit-Interview-Vorlagen).

### Standard-Kategorien

| Kategorie | Gewichtung | Kriterien |
|-----------|------------|-----------|
| Fachliche Kompetenz | 20% | Fachwissen, Didaktik, Fortbildung |
| Pädagogische Kompetenz | 25% | Unterrichtsgestaltung, Differenzierung, Classroom Management |
| Arbeitsverhalten | 15% | Motivation, Zuverlässigkeit, Belastbarkeit |
| Sozialverhalten | 20% | Vorgesetzte, Kollegen, Schüler, Eltern |
| Christliches Profil (FES-spezifisch) | 20% | Andachten, Biblische Integration, Gemeindeleben, FES-Grundsätze |

**Bewertungsskala:** 1 (herausragend) bis 6 (ungenügend) — wie beim Zeugnis-System.

### Referenz-Formular (Schritt 4 + 9)

12 Prüfpunkte mit Ja/Nein/Teilweise + Freitext für Gemeinde-Referenz.

---

## 9. Technische Umsetzung

### Datenbank-Modelle (nutzt generisches Process-System)

```
CivilServiceProcess (Verbeamtungsvorgang)
├── employeeId → Employee (zentrale Personalakte)
├── organizationId → Organization (Schule)
├── type: PROBE | LIFETIME
├── currentStep: 1-11
├── currentPhase: I | II_A | II_B | ... | II_H | III | IV
├── prerequisites: JSON (12 Kriterien-Status)
├── psiStartDate: Geplanter Vertragsbeginn
├── probationEndDate: Probezeit-Ende (berechnet)
│
├── CivilServicePhase[] (Status jeder Sub-Phase)
│   ├── phaseKey: "A" | "B" | ... | "H"
│   ├── status: PENDING | IN_PROGRESS | COMPLETED | BLOCKED
│   └── completedAt, blockedReason
│
├── CivilServiceAssessment[] (3 Beurteilungen)
│   ├── assessmentNumber: 1 | 2 | 3
│   ├── token (Magic Link für SL)
│   ├── ratings: JSON (Noten pro Kriterium)
│   ├── overallGrade: Float
│   └── referenceData: JSON (12 Prüfpunkte, nur bei 1+3)
│
├── CivilServiceDocument[] (33+ Dokumente)
│   ├── documentType: AMTSARZT | VERTRAG_PROBE | BR_GENEHMIGUNG | ...
│   ├── generatedAt / uploadedAt
│   └── status: PENDING | UPLOADED | APPROVED | EXPIRED
│
├── BoardDecision[] (Beiratsentscheidungen)
│   ├── decisionType: PROBE | LIFETIME
│   ├── result: POSITIVE | NEGATIVE | POSTPONED
│   └── date, notes
│
└── CivilServiceChecklist[] (40+ Aufgaben)
    ├── step, category, title
    ├── assignee: HR | SL | LK | EXTERN
    ├── dueDate, isCompleted
    └── gatekeeper: Boolean (blockiert nächsten Schritt)
```

### API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET/POST | `/api/civil-service` | Alle Vorgänge / Neuen anlegen |
| GET/PATCH | `/api/civil-service/[id]` | Einzelvorgang / Status aktualisieren |
| GET/PATCH | `/api/civil-service/[id]/phases` | Phasen-Status |
| POST | `/api/civil-service/[id]/assessments` | Beurteilung anfordern (Magic Link) |
| GET/PUT | `/api/civil-service-assessment/[token]` | Beurteilung ausfüllen (öffentlich) |
| POST | `/api/civil-service/[id]/board-decision` | Beiratsentscheidung dokumentieren |
| GET/POST | `/api/civil-service/[id]/documents` | Dokumente verwalten |
| GET | `/api/civil-service/analytics` | Analytics + Fristen-Übersicht |
| POST | `/api/cron/civil-service-deadlines` | Tägliche Fristenprüfung |

### Dashboard-Config (nutzt ProcessDashboard)

Neuer Tab im Dashboard neben Onboarding / Offboarding:
- Status-Kacheln: Antrag, Verwaltung, Probezeit, Übernahme, Abgeschlossen, Frist!
- Tabelle mit Schritt-Spalte und Fortschrittsbalken
- Fristen-Warnungen als Banner
- CSV-Export
- Analytics (wie Offboarding)

---

## 10. Implementierungs-Reihenfolge

### Woche 1: Schema + Kern-API
1. Prisma-Schema erweitern (CivilServiceProcess + alle Unter-Modelle)
2. Seed: Standard-Checklisten (40+ Punkte) + Beurteilungs-Template
3. CRUD-API: Vorgänge anlegen, lesen, Status ändern
4. Dashboard-Tab + Config (nutzt generisches ProcessDashboard)

### Woche 2: Phasen-Engine + Detail-Ansicht
5. Phasen-System: Status pro Sub-Phase (A-H), Gatekeeper-Logik
6. Detail-Ansicht: Phasen-Übersicht, Checkliste, Fortschrittsbalken
7. Dokumente-System: Upload/Download für 33+ Dokumenttypen
8. Fristen-Engine: Automatische Berechnung + Warnungen

### Woche 3: Magic Links + Beurteilungen
9. Beurteilungsformular (SL): Noten pro Kriterium, Gesamtschnitt, Gatekeeper
10. Referenz-Formular (SL): 12 Prüfpunkte + Gemeinde-Referenz
11. Antragsformular (LK): Voraussetzungsprüfung, Online-Antrag
12. Vertrags-Bestätigung (LK): Digital unterschreiben

### Woche 4: Automatisierung + Polish
13. Cron-Job: Tägliche Fristenprüfung + E-Mail-Warnungen
14. Webhooks: 6 neue Events (psi-created, assessment-requested, etc.)
15. Analytics: KPIs, Durchlaufzeiten, Fristen-Übersicht
16. Testing + Feinschliff

---

## 11. Was dieses Feature zum Killerfeature macht

1. **Kein anderes HR-Tool bildet den PSI-Prozess ab** — das ist Nische pur
2. **3+ Jahre Prozessdauer** — ohne digitales Tracking verliert man den Überblick
3. **12 Voraussetzungs-Checks automatisch** — kein manuelles Prüfen mehr
4. **Magic Links für SL** — Beurteilung in 10 Minuten statt Papierkram
5. **Fristen-Warnungen** — Amtsarzt, RV-Befreiung, BR-Frist: nie wieder verpassen
6. **Gatekeeper** — System verhindert dass Schritte übersprungen werden
7. **Beirats-Dokumentation** — Entscheidungen sauber protokolliert
8. **33 Dokumente digital** — Ordner wird zum Archiv, Portal ist die Akte
9. **Für andere Träger sofort nutzbar** — jede Ersatzschule in NRW hat den gleichen Prozess
