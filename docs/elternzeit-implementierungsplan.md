# Elternzeit & Mutterschutz — Vollständiger Implementierungsplan
## CREDO HR-Portal | Neues Modul

> **Erstellt:** April 2026
> **Rechtsstand:** April 2026 (BEEG, MuSchG, TV-L, FrUrlV NRW, FESchVO NRW)
> **Zuständige BR:** Bezirksregierung Detmold, Dezernat 41, Leopoldstr. 15, 32756 Detmold
> **Tarifvertrag:** TV-L (kein kirchlicher Vertrag)
> **Geltungsbereich:** Alle 16 Mandanten inkl. Kitas

---

## Inhaltsverzeichnis

1. [Überblick & Ziele](#1-überblick--ziele)
2. [Rechtliche Grundlagen](#2-rechtliche-grundlagen)
3. [Personalgruppen](#3-personalgruppen)
4. [Prozessfluss (vollständig)](#4-prozessfluss-vollständig)
5. [Status-Flows](#5-status-flows)
6. [Datenbankmodell (Prisma)](#6-datenbankmodell-prisma)
7. [API-Struktur](#7-api-struktur)
8. [Öffentliche Formulare (Magic Link)](#8-öffentliche-formulare-magic-link)
9. [Portal UI](#9-portal-ui)
10. [Dokumentengenerierung (PDF-Briefe)](#10-dokumentengenerierung-pdf-briefe)
11. [Fristenverwaltung](#11-fristenverwaltung)
12. [Feriensperrfrist-Check (§ 11 FrUrlV NRW)](#12-feriensperrfrist-check--11-frurlv-nrw)
13. [NRW Schulferienkalender](#13-nrw-schulferienkalender)
14. [Personalgruppen-spezifische Checklisten](#14-personalgruppen-spezifische-checklisten)
15. [Webhook-Events](#15-webhook-events)
16. [Entlassungsschutz-Cross-Check](#16-entlassungsschutz-cross-check)
17. [Bezirksregierung Detmold](#17-bezirksregierung-detmold)
18. [Phasenplan & Scope](#18-phasenplan--scope)
19. [Offene Punkte vor Implementierung](#19-offene-punkte-vor-implementierung)

---

## 1. Überblick & Ziele

### Was gebaut wird

Ein vollständiges **Elternzeit- & Mutterschutz-Verwaltungsmodul** für das CREDO HR-Portal, das den gesamten Prozess von der Schwangerschaftsmeldung bis zur Rückkehr digital abbildet.

### Zwei verknüpfte Sub-Prozesse

```
MutterschutzProzess (eigenständig)
    ↓ verknüpft mit (1:N)
ElternzeitProzess (eigenständig)
    ↓ kann enthalten
ElternzeitUnterbrechung (Sub-Record)
```

**Wichtig:** Mutterschutz und Elternzeit sind rechtlich getrennte Prozesse. Ein flacher Status-Flow würde Fälle wie "neue Schwangerschaft während laufender Elternzeit" nicht abbilden können.

### Integration in bestehende Architektur

- **Magic Links** wie bei Fragebogen / Verbeamtung (Mitarbeiter füllt extern aus)
- **Webhook-Events** → n8n (wie Onboarding / Offboarding / PSI)
- **PDF-Generierung** wie bestehende PDF-Exports
- **Cron-Job** für Fristenprüfung (wie `civil-service-deadlines`)
- **Einrichtungsleiter** als dynamischer Empfänger (wie Verbeamtung)
- **Rollenmodell** unverändert (SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER, EINRICHTUNGSLEITUNG, VORGESETZTER)

---

## 2. Rechtliche Grundlagen

### Bundesrecht

| Gesetz | Inhalt |
|---|---|
| **BEEG § 15** | Anspruch auf Elternzeit für Arbeitnehmer (TV-L) |
| **BEEG § 16** | Inanspruchnahme, Antragsfrist 7/13 Wochen, max. 3 Abschnitte |
| **BEEG § 17** | Urlaubsanspruch in der Elternzeit |
| **BEEG § 18** | **Kündigungsschutz** während Elternzeit (→ Cross-Check mit Offboarding!) |
| **BEEG § 21** | Befristungsgrund "Elternzeitvertretung" für Vertretungskräfte |
| **MuSchG** | Schutzfristen: 6 Wochen vor / 8 Wochen (12 bei Frühgeburt/Mehrlingen) nach Geburt |
| **SGB V § 224** | Beitragsfreiheit KV bei Elterngeldbezug |
| **SGB VI § 56** | Kindererziehungszeiten als rentenrechtliche Pflichtbeitragszeiten |
| **8. SGB IV-ÄndG** | **DEÜV-Meldepflicht** Elternzeit ab 01.01.2024 (Meldegrund 51) |
| **Bürokratieabbaugesetz IV (2024)** | Elektronische Form für Elternzeit-Antrag zulässig (QES oder E-Mail) |

### Landesrecht NRW

| Gesetz | Inhalt |
|---|---|
| **FrUrlV NRW §§ 9–13** | Elternzeit für Beamte (entsprechende BEEG-Anwendung) |
| **FrUrlV NRW § 11** | **Feriensperrfrist** Schuldienst — kritisch für Software! |
| **FrUrlV NRW § 13** | KV-Beitragszuschuss 31 EUR/Monat (Beamte/PSI) |
| **LBG NRW § 74** | Elternzeit Beamte NRW |
| **TV-L § 27** | Elternzeit TV-L Tarifangestellte |

### Wichtige Fristen (§ 16 BEEG)

| Frist | Wann |
|---|---|
| Antrag Elternzeit (bis 3. Lebensjahr) | **7 Wochen** vor geplantem Beginn |
| Antrag Elternzeit (3.–8. Lebensjahr) | **13 Wochen** vor geplantem Beginn |
| DEÜV-Meldung (TV-L, GKV-Pflicht) | Bei Beginn der Elternzeit |
| KV-Zuschuss-Antrag (Beamte/PSI) | Sofort bei Genehmigung |
| Geburtsurkunde nachreichen | Innerhalb 14 Tage nach Geburt (Praxis) |
| BR Detmold informieren | Innerhalb 7 Tage nach Genehmigung |
| Rückkehr abstimmen | 6 Wochen vor EZ-Ende |

---

## 3. Personalgruppen

Das Modul unterscheidet drei Personalgruppen mit grundlegend unterschiedlichen Workflows:

| Personalgruppe | Enum-Wert | SV-Status | DEÜV | KV-Zuschuss | BR Detmold |
|---|---|---|---|---|---|
| Tarifangestellte (TV-L) | `TARIF_TV_L` | SV-pflichtig | ✅ Ja, Meldegrund 51 | ❌ Nein | Info-Schreiben |
| Verbeamtete Lehrkräfte | `BEAMTER` | Nicht SV-pflichtig | ❌ Nein | ✅ 31 EUR/Monat | Genehmigungsantrag |
| Planstelleninhaber | `PLANSTELLENINHABER` | Nicht SV-pflichtig | ❌ Nein | ✅ 31 EUR/Monat | Genehmigungsantrag |

### KV-Typen (für DEÜV-Relevanz)

```
GKV_PFLICHT     → DEÜV-Meldung Pflicht (wenn keine TZ, mind. 1 Kalendermonat)
GKV_FREIWILLIG  → DEÜV-Meldung nur bei JAE-Grenze-Überschreitung
PKV             → Keine DEÜV-Meldung (KV-Beiträge laufen weiter)
```

### BAD-Pflicht (Betriebsärztlicher Dienst)

Nur bei **Kita und Schulen mit direktem Kinderkontakt**:
- BAD: Gesundheitszentrum Bielefeld, Am Lenkwerk 9, 33609 Bielefeld, Tel: 0521-557894-0
- Debitor: Christlicher Schulverein Minden e.V., Kundennummer: 11860244
- Bis BAD-Bescheinigung: Kein Umgang mit Kindern erlaubt
- Einrichtungstyp wird bei Vorgang-Anlage erfasst

---

## 4. Prozessfluss (vollständig)

```
╔══════════════════════════════════════════════════════════════════════════╗
║              ELTERNZEIT & MUTTERSCHUTZ — PROZESSFLUSS                  ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│  SCHRITT 0: Vorgang anlegen (HR im Portal)                              │
│  ─────────────────────────────────────────────────────────────────────  │
│  Felder:                                                                │
│  • Mitarbeiter auswählen (Suche)                                        │
│  • Personalgruppe: TV-L / Beamter / Planstelleninhaber                  │
│  • Geschlecht: Mutter / Vater (→ bestimmt Briefvorlagen)                │
│  • KV-Typ: GKV Pflicht / GKV Freiwillig / PKV                          │
│  • Voraussichtlicher Geburtstermin                                      │
│  • Einrichtungstyp: Schule / Kita (→ BAD-Pflicht bei Kita)             │
│  • Einrichtungsleiter Name + E-Mail (dynamisch, wie Verbeamtung)        │
│  • Mandant / Organisation                                               │
│                                                                         │
│  System erzeugt automatisch:                                            │
│  → DisplayId: MU-2026-001 + EZ-2026-001                                │
│  → Checkliste (personalgruppen-spezifisch)                              │
│  → Fristen (berechnet aus Geburtstermin)                                │
│                                                                         │
│  Status: SCHWANGERSCHAFT_GEMELDET                                       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
             ┌─────────────────┴──────────────────────┐
             ▼                                        ▼
    ══ SPUR A: MUTTERSCHUTZ ══              ══ SPUR B: ELTERNZEIT ══
    (eigenständiger Prozess)                (sequenziell nach Spur A)


╔══ SPUR A: MUTTERSCHUTZ ═══════════════════════════════════════════════╗

┌─────────────────────────────────────────────────────────────────────┐
│  A1: BAD-Prozess (nur Kita & Schulen mit Kinderkontakt)             │
│  ─────────────────────────────────────────────────────────────────  │
│  HR generiert: BAD-Aufforderungsbrief (PDF)                         │
│  → Mitarbeiterin macht Termin bei BAD Bielefeld                     │
│  → HR erfasst: Untersuchungsdatum + Ergebnis                        │
│  → Gefährdungsbeurteilung dokumentiert                              │
│  → Beschäftigungsverbot? Ja/Nein                                    │
│  → Alternative Tätigkeit bis BAD-Bescheinigung festgelegt           │
│                                                                     │
│  Status: BAD_BEAUFTRAGT → BAD_ABGESCHLOSSEN                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  A2: Mutterschutz aktiv                                             │
│  ─────────────────────────────────────────────────────────────────  │
│  Automatische Berechnung:                                           │
│  • Beginn = voraussichtl. Geburtstermin - 42 Tage (6 Wochen)       │
│  • Ende = tatsächl. Geburt + 56 Tage (8 Wo.) normal                │
│           tatsächl. Geburt + 84 Tage (12 Wo.) Frühgeburt/Mehrl.    │
│                                                                     │
│  HR-Aufgaben:                                                       │
│  → Lohnbescheinigung für Krankenkasse erstellen (1 Wo. vorher)      │
│  → LOGA Fehlzeiten eintragen (tägl. KK-Zuschuss 13,00 EUR)         │
│  → LOGA Steuer: Sonder-Steuerklasse Mutterschutz                   │
│  → LOGA Familie: Kind nach Geburt eintragen                         │
│  → LOGA SV: Kinderlosenzuschlag entfernen                           │
│                                                                     │
│  Status: MUTTERSCHUTZ_AKTIV                                         │
│                                                                     │
│  → Nach Geburt: Übergang zu Spur B                                  │
└─────────────────────────────────────────────────────────────────────┘

╔══ SPUR B: ELTERNZEIT ═════════════════════════════════════════════════╗

┌─────────────────────────────────────────────────────────────────────┐
│  B1: VORLÄUFIGER ANTRAG (vor oder nach Geburt möglich)              │
│  ─────────────────────────────────────────────────────────────────  │
│  HR sendet Magic Link (Token 1) an Mitarbeiter                      │
│  → Token-Gültigkeit: 30 Tage                                        │
│  → Status: ANTRAG_VORL_VERSANDT                                     │
│                                                                     │
│  Mitarbeiter füllt öffentliches Formular aus:                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Schritt 1: Persönliche Daten (vorausgefüllt)                │   │
│  │   • Name, Vorname (read-only)                               │   │
│  │   • Aktuelle Adresse (editierbar, für Briefkopf)            │   │
│  │   • Dienst-/Tarifbezeichnung                                │   │
│  │   • Personalnummer                                          │   │
│  │   • Schule/Einrichtung + Schulnummer                        │   │
│  │                                                             │   │
│  │ Schritt 2: Kind & Geburt                                    │   │
│  │   • Voraussichtlicher Geburtstermin                         │   │
│  │   • Erklärung zur Betreuungsabsicht                         │   │
│  │   • Gleichzeitige EZ beider Eltern? (Ja/Nein)              │   │
│  │                                                             │   │
│  │ Schritt 3: Elternzeit-Zeiträume                             │   │
│  │   • Abschnitt 1: Von / Bis (Pflicht)                        │   │
│  │   • Abschnitt 2: Von / Bis (optional)                       │   │
│  │   • Abschnitt 3: Von / Bis (optional)                       │   │
│  │   • Übertragung auf 3.–8. Lebensjahr? (→ AG-Zustimmung!)   │   │
│  │   ⚠ FERIENSPERRFRIST-CHECK: automatische Warnung            │   │
│  │   ⚠ FRISTCHECK: 7-Wochen-Vorlauf geprüft                   │   │
│  │                                                             │   │
│  │ Schritt 4: Teilzeit während EZ                              │   │
│  │   • Teilzeit während Elternzeit gewünscht? (Ja/Nein)        │   │
│  │   • Wenn Ja: gewünschte Stunden/Woche (max. 32h)            │   │
│  │   • Hinweis: Separater Antrag erforderlich                  │   │
│  │                                                             │   │
│  │ Schritt 5: Begründung & DSGVO                               │   │
│  │   • Begründung bei Feriennähe (§ 11 FrUrlV NRW)             │   │
│  │   • DSGVO-Zustimmung                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Status nach Einreichung: ANTRAG_VORL_EINGEREICHT                   │
│                                                                     │
│  Einrichtungsleiter genehmigt (Portal, EINRICHTUNGSLEITUNG-Rolle):  │
│  ✅ GENEHMIGT → Vorläufige Genehmigung PDF generiert                │
│  ❌ ABGELEHNT → Ablehnungsbrief, Mitarbeiter informiert             │
│                                                                     │
│  HR generiert + versendet:                                          │
│  → 📄 Vorläufige Genehmigung (Mutter- oder Vater-Version)          │
│  → Status: VORLAEUFIG_GENEHMIGT                                     │
│                                                                     │
│  Benachrichtigungen (n8n Webhook):                                  │
│  → Mitarbeiter (Genehmigung + PDF)                                  │
│  → Einrichtungsleitung                                              │
│  → HR + alle eingetragenen Empfänger                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  (nach Geburt)
┌──────────────────────────────▼──────────────────────────────────────┐
│  B2: ENDGÜLTIGER ANTRAG (nach Geburt, 2. Magic Link)                │
│  ─────────────────────────────────────────────────────────────────  │
│  HR sendet Magic Link (Token 2) nach Geburt an Mitarbeiter          │
│  → Token-Gültigkeit: 30 Tage                                        │
│  → Status: ANTRAG_ENDG_VERSANDT                                     │
│                                                                     │
│  Mitarbeiter füllt aus:                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • Tatsächliches Geburtsdatum                                │   │
│  │ • Name des Kindes + Geschlecht (Sohn/Tochter)              │   │
│  │ • Ggf. Korrektur der Zeitabschnitte                         │   │
│  │ • Upload: Geburtsurkunde (PDF/JPG, max. 10 MB)              │   │
│  │ • Frühgeburt? (→ verlängerte Mutterschutzfrist)             │   │
│  │ • Mehrlinge? (→ verlängerte Mutterschutzfrist)              │   │
│  │ • Bei Vater: Erklärung Mutter keine EZ für diesen Zeitraum  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Status: ANTRAG_ENDG_EINGEREICHT                                    │
│                                                                     │
│  HR prüft + genehmigt (+ Einrichtungsleiter bestätigt im Portal):   │
│                                                                     │
│  HR generiert automatisch alle Dokumente:                           │
│  → 📄 Endgültige Genehmigung (mit Kind-Name, Datum, Segensformel)  │
│  → 📄 Schreiben an BR Detmold, Dez. 41 (alle § 16 BEEG-Felder)    │
│  → 📄 VBL-Informationsbrief (nur TV-L)                             │
│  → 📄 AG-Bescheinigung für Elterngeld (Einkommensnachweis)         │
│  → 📄 Beihilfe-Änderungsformular (nur Beamte/PSI)                  │
│                                                                     │
│  Benachrichtigungen (n8n Webhook):                                  │
│  → Mitarbeiter (Genehmigung + alle PDFs)                            │
│  → Einrichtungsleitung                                              │
│  → HR + eingetragene Empfänger                                      │
│                                                                     │
│  Status: GENEHMIGT                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  (EZ-Beginn erreicht)
┌──────────────────────────────▼──────────────────────────────────────┐
│  B3: LAUFENDE VERWALTUNG                                            │
│  ─────────────────────────────────────────────────────────────────  │
│  Status: AKTIV                                                      │
│                                                                     │
│  Fristenverwaltung — Ampel-Anzeige im Portal:                       │
│  🔴 DEÜV Meldegrund 51 (TV-L, GKV-Pflicht, ab EZ-Beginn)          │
│  🔴 KV-Zuschuss-Antrag LBV NRW (Beamte/PSI, sofort bei Genehm.)    │
│  🟡 Geburtsurkunde nachgereicht? (14 Tage nach Geburt)              │
│  🟡 BR Detmold informiert? (7 Tage nach Genehmigung)               │
│  🟡 Rückkehr abstimmen (6 Wochen vor EZ-Ende)                      │
│  🟢 Alle Fristen erledigt                                           │
│                                                                     │
│  Sonderfall: Unterbrechung (neue Schwangerschaft während EZ)        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ → HR öffnet Unterbrechungs-Modal                            │   │
│  │ → System berechnet: verbleibende Rest-EZ für Kind 1         │   │
│  │ → HR erfasst: Unterbrechungsdatum                           │   │
│  │ → Unterbrechungsgenehmigung PDF generiert                   │   │
│  │ → Neuer MutterschutzProzess (Kind 2) wird verknüpft         │   │
│  │ → Status: UNTERBROCHEN                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Personalgruppen-Checkliste laufend abhaken (in Portal)             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│  B4: RÜCKKEHR                                                       │
│  ─────────────────────────────────────────────────────────────────  │
│  Automatische Erinnerung: 6 Wochen vor EZ-Ende (Cron)               │
│                                                                     │
│  HR erfasst:                                                        │
│  • Tatsächliches Rückkehrdatum                                      │
│  • Gewünschter Stundenumfang                                        │
│  • Einsatzort / Schule                                              │
│                                                                     │
│  Checkliste:                                                        │
│  ☐ LOGA Beschäftigung reaktiviert                                   │
│  ☐ DEÜV Wiederaufnahme-Meldung (TV-L)                              │
│  ☐ KV-Zuschuss beendet (Beamte/PSI)                                │
│  ☐ IT-Zugang reaktiviert                                            │
│  ☐ Stundenplan aktualisiert                                         │
│                                                                     │
│  Status: RUECKKEHR_GEPLANT → BEENDET                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Status-Flows

### MutterschutzProzess

```
GEMELDET
  → BAD_BEAUFTRAGT     (nur bei Kita/Schulen mit Kindern)
  → BAD_ABGESCHLOSSEN
  → AKTIV
  → BEENDET
```

### ElternzeitProzess

```
ANGELEGT
  → ANTRAG_VORL_VERSANDT     (Magic Link Token 1 generiert)
  → ANTRAG_VORL_EINGEREICHT  (Mitarbeiter hat Formular abgeschickt)
  → VORLAEUFIG_GENEHMIGT     (Einrichtungsleiter genehmigt)
  → VORLAEUFIG_ABGELEHNT     (Einrichtungsleiter lehnt ab)
  → ANTRAG_ENDG_VERSANDT     (Magic Link Token 2 nach Geburt)
  → ANTRAG_ENDG_EINGEREICHT  (Mitarbeiter hat endgültige Daten eingereicht)
  → GENEHMIGT                (HR + Einrichtungsleiter endgültig genehmigt)
  → AKTIV                    (EZ-Beginn erreicht)
  → UNTERBROCHEN             (neue Schwangerschaft, Unterbrechungsantrag)
  → RUECKKEHR_GEPLANT        (6 Wo. vor Ende)
  → BEENDET
  → ABGELEHNT                (jederzeit möglich)
```

---

## 6. Datenbankmodell (Prisma)

### Neue Modelle (Ergänzung zu prisma/schema.prisma)

```prisma
// ═══════════════════════════════════════════════════════════
// MUTTERSCHUTZ
// ═══════════════════════════════════════════════════════════

model MutterschutzProzess {
  id              String   @id @default(cuid())
  displayId       String   @unique  // MU-2026-001

  // Verknüpfungen
  employeeId      String
  employee        Employee     @relation(fields: [employeeId], references: [id])
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  // Schwangerschaftsdaten
  voraussGeburt        DateTime
  tatsGeburt           DateTime?
  mutterschutzBeginn   DateTime   // wird automatisch berechnet: voraussGeburt - 42 Tage
  mutterschutzEnde     DateTime?  // wird berechnet: tatsGeburt + 56 oder 84 Tage
  fruehgeburt          Boolean    @default(false)
  mehrlinge            Boolean    @default(false)

  // BAD (Betriebsärztlicher Dienst) - nur Kita/Schulen
  badErforderlich      Boolean    @default(false)
  badBeauftragtAm      DateTime?
  badAbgeschlossenAm   DateTime?
  badErgebnis          String?    // Freitext
  beschaeftigungsverbot Boolean   @default(false)
  alternativeTaetigkeit String?

  // Lohnbescheinigung
  lohnbeschKkErstelltAm DateTime?

  // Status
  status          MutterschutzStatus @default(GEMELDET)

  // Verknüpfte Elternzeit-Vorgänge (1 Mutterschutz → N Elternzeiten möglich)
  elternzeitProzesse ElternzeitProzess[]

  // Nebenmodelle
  dokumente       MutterschutzDokument[]
  notizen         MutterschutzNotiz[]
  checklistItems  MutterschutzChecklistItem[]

  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("mutterschutz_prozesse")
}

enum MutterschutzStatus {
  GEMELDET
  BAD_BEAUFTRAGT
  BAD_ABGESCHLOSSEN
  AKTIV
  BEENDET
}

model MutterschutzDokument {
  id              String   @id @default(cuid())
  mutterschutzId  String
  mutterschutz    MutterschutzProzess @relation(fields: [mutterschutzId], references: [id], onDelete: Cascade)
  dokumentTyp     MutterschutzDokumentTyp
  dateiname       String
  dateipfad       String
  hochgeladenAm   DateTime @default(now())
  hochgeladenVon  String?
  @@map("mutterschutz_dokumente")
}

enum MutterschutzDokumentTyp {
  BAD_AUFFORDERUNG
  BAD_BESCHEINIGUNG
  GEFAEHRDUNGSBEURTEILUNG
  LOHNBESCHEINIGUNG_KK
  SONSTIGES
}

model MutterschutzNotiz {
  id              String   @id @default(cuid())
  mutterschutzId  String
  mutterschutz    MutterschutzProzess @relation(fields: [mutterschutzId], references: [id], onDelete: Cascade)
  text            String
  erstelltVon     String
  createdAt       DateTime @default(now())
  @@map("mutterschutz_notizen")
}

model MutterschutzChecklistItem {
  id              String   @id @default(cuid())
  mutterschutzId  String
  mutterschutz    MutterschutzProzess @relation(fields: [mutterschutzId], references: [id], onDelete: Cascade)
  titel           String
  beschreibung    String?
  erledigtAm      DateTime?
  erledigtVon     String?
  personalgruppe  Personalgruppe?  // null = alle Gruppen
  @@map("mutterschutz_checkliste")
}


// ═══════════════════════════════════════════════════════════
// ELTERNZEIT
// ═══════════════════════════════════════════════════════════

model ElternzeitProzess {
  id              String   @id @default(cuid())
  displayId       String   @unique  // EZ-2026-001

  // Verknüpfungen
  employeeId      String
  employee        Employee     @relation(fields: [employeeId], references: [id])
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  // Verknüpfung zu Mutterschutz
  mutterschutzId  String?
  mutterschutz    MutterschutzProzess? @relation(fields: [mutterschutzId], references: [id])

  // Personalgruppe & KV
  personalgruppe  Personalgruppe
  geschlecht      Geschlecht
  kvTyp           KVTyp

  // Kind-Daten
  kindName             String?
  kindGeburtsdatum     DateTime?
  kindNummer           Int       // 1. Kind, 2. Kind, 3. Kind
  kindGeschlecht       KindGeschlecht?
  geburtsurkunde       Boolean   @default(false)
  geburtsurkundePfad   String?

  // Status
  status          ElternzeitStatus @default(ANGELEGT)

  // Magic Links (Tokens)
  antragTokenVorl  String?   @unique  // Token 1: vorläufiger Antrag
  antragTokenEndg  String?   @unique  // Token 2: endgültiger Antrag
  antragTokenVorlExpiry DateTime?
  antragTokenEndgExpiry DateTime?

  // Antragsdaten
  antragVorlAm         DateTime?
  antragEndgAm         DateTime?
  genehmigungAm        DateTime?
  genehmigungVon       String?

  // Einrichtungsleiter (dynamisch, wie Verbeamtung)
  einrichtungsleiterName  String?
  einrichtungsleiterEmail String?

  // Bezirksregierung Detmold Tracking
  brSchreibenGeneriertAm  DateTime?
  brSchreibenVersandtAm   DateTime?
  brAktenzeichen          String?
  brGenehmigungEingegAm   DateTime?  // nur Beamte/PSI

  // Mitarbeiter-Adresse (für Briefkopf, aus Formular)
  adresseStrasse  String?
  adressePlz      String?
  adresseOrt      String?

  // Dienst-/Tarifbezeichnung (aus Formular)
  dienstbezeichnung String?
  personalnummer    String?
  schulnummer       String?

  // Gleichzeitige EZ beider Eltern
  gleichzeitigeEZ Boolean @default(false)

  // Sub-Modelle
  abschnitte      ElternzeitAbschnitt[]
  fristen         ElternzeitFrist[]
  dokumente       ElternzeitDokument[]
  checklistItems  ElternzeitChecklistItem[]
  notizen         ElternzeitNotiz[]
  unterbrechungen ElternzeitUnterbrechung[]

  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("elternzeit_prozesse")
}

enum ElternzeitStatus {
  ANGELEGT
  ANTRAG_VORL_VERSANDT
  ANTRAG_VORL_EINGEREICHT
  VORLAEUFIG_GENEHMIGT
  VORLAEUFIG_ABGELEHNT
  ANTRAG_ENDG_VERSANDT
  ANTRAG_ENDG_EINGEREICHT
  GENEHMIGT
  AKTIV
  UNTERBROCHEN
  RUECKKEHR_GEPLANT
  BEENDET
  ABGELEHNT
}

enum Personalgruppe {
  TARIF_TV_L
  BEAMTER
  PLANSTELLENINHABER
}

enum Geschlecht {
  MUTTER
  VATER
}

enum KVTyp {
  GKV_PFLICHT
  GKV_FREIWILLIG
  PKV
}

enum KindGeschlecht {
  TOCHTER
  SOHN
}

model ElternzeitAbschnitt {
  id              String   @id @default(cuid())
  elternzeitId    String
  elternzeit      ElternzeitProzess @relation(fields: [elternzeitId], references: [id], onDelete: Cascade)

  abschnittNr     Int      // 1, 2 oder 3
  von             DateTime
  bis             DateTime

  // Übertragung auf 3.–8. Lebensjahr (§ 15 Abs. 2 BEEG)
  uebertragung3bis8  Boolean @default(false)
  agZustimmung       Boolean?  // null = noch offen, true = erteilt, false = abgelehnt

  // Teilzeit während EZ
  teilzeit           Boolean  @default(false)
  teilzeitStunden    Decimal? @db.Decimal(4,1)  // max. 32h

  // Feriensperrfrist
  ferienSperrfristWarnung Boolean @default(false)
  ferienBegruendung        String?

  @@map("elternzeit_abschnitte")
}

model ElternzeitFrist {
  id              String   @id @default(cuid())
  elternzeitId    String
  elternzeit      ElternzeitProzess @relation(fields: [elternzeitId], references: [id], onDelete: Cascade)

  fristTyp        ElternzeitFristTyp
  faelligAm       DateTime
  erledigtAm      DateTime?
  erledigtVon     String?
  erinnerung1Am   DateTime   // 4 Wochen vorher
  erinnerung2Am   DateTime   // 2 Wochen vorher
  status          FristStatus @default(OFFEN)
  notiz           String?

  @@map("elternzeit_fristen")
}

enum ElternzeitFristTyp {
  ANTRAG_EINREICHUNG          // 7 oder 13 Wochen vor EZ-Beginn
  DEÜV_MELDUNG_BEGINN         // bei EZ-Beginn (TV-L, GKV-Pflicht)
  DEÜV_MELDUNG_ENDE           // bei EZ-Ende (TV-L, GKV-Pflicht)
  KV_ZUSCHUSS_ANTRAG          // sofort bei Genehmigung (Beamte/PSI)
  GEBURTSURKUNDE_EINREICHEN   // 14 Tage nach Geburt
  BR_DETMOLD_SCHREIBEN        // 7 Tage nach endgültiger Genehmigung
  LOHNBESCHEINIGUNG_KK        // 1 Woche vor Mutterschutz-Beginn
  RUECKKEHR_ABSTIMMUNG        // 6 Wochen vor EZ-Ende
}

enum FristStatus {
  OFFEN
  ERLEDIGT
  ESKALIERT
  UEBERFAELLIG
}

model ElternzeitDokument {
  id              String   @id @default(cuid())
  elternzeitId    String
  elternzeit      ElternzeitProzess @relation(fields: [elternzeitId], references: [id], onDelete: Cascade)

  dokumentTyp     ElternzeitDokumentTyp
  dateiname       String
  dateipfad       String
  generiert       Boolean  @default(false)  // true = vom System erzeugt
  hochgeladenAm   DateTime @default(now())
  hochgeladenVon  String?

  @@map("elternzeit_dokumente")
}

enum ElternzeitDokumentTyp {
  ANTRAG_VORLAEUFIG
  GENEHMIGUNG_VORLAEUFIG
  ANTRAG_ENDGUELTIG
  GEBURTSURKUNDE
  GENEHMIGUNG_ENDGUELTIG
  BR_DETMOLD_SCHREIBEN
  VBL_INFORMATIONSBRIEF
  AG_BESCHEINIGUNG_ELTERNGELD
  BEIHILFE_AENDERUNGSFORMULAR
  UNTERBRECHUNGSGENEHMIGUNG
  LOHNBESCHEINIGUNG_KK
  SONSTIGES
}

model ElternzeitChecklistItem {
  id              String   @id @default(cuid())
  elternzeitId    String
  elternzeit      ElternzeitProzess @relation(fields: [elternzeitId], references: [id], onDelete: Cascade)

  titel           String
  beschreibung    String?
  logaHinweis     String?   // Hinweistext für LOGA-Buchung
  erledigtAm      DateTime?
  erledigtVon     String?
  personalgruppe  Personalgruppe?   // null = alle Gruppen
  phase           ElternzeitPhase

  @@map("elternzeit_checkliste")
}

enum ElternzeitPhase {
  ANTRAG
  GENEHMIGUNG
  EZ_AKTIV
  RUECKKEHR
}

model ElternzeitNotiz {
  id              String   @id @default(cuid())
  elternzeitId    String
  elternzeit      ElternzeitProzess @relation(fields: [elternzeitId], references: [id], onDelete: Cascade)
  text            String
  erstelltVon     String
  createdAt       DateTime @default(now())
  @@map("elternzeit_notizen")
}

model ElternzeitUnterbrechung {
  id              String   @id @default(cuid())
  elternzeitId    String
  elternzeit      ElternzeitProzess @relation(fields: [elternzeitId], references: [id], onDelete: Cascade)

  unterbrechungAm          DateTime
  grund                    String    // z.B. "Neue Schwangerschaft Kind 2"
  restEzKindVon            DateTime  // verbleibende EZ-Rest ab wann
  restEzKindBis            DateTime  // verbleibende EZ-Rest bis wann
  verbleibendeMonateCalc   Int       // berechnet

  genehmigungAm            DateTime?
  genehmigungVon           String?

  // Verknüpfung zu neuem Mutterschutz-Vorgang
  folgeMutterschutzId      String?

  dokumente                ElternzeitUnterbrechungDokument[]

  @@map("elternzeit_unterbrechungen")
}

model ElternzeitUnterbrechungDokument {
  id                String   @id @default(cuid())
  unterbrechungId   String
  unterbrechung     ElternzeitUnterbrechung @relation(fields: [unterbrechungId], references: [id], onDelete: Cascade)
  dateiname         String
  dateipfad         String
  @@map("elternzeit_unterbrechung_dokumente")
}


// ═══════════════════════════════════════════════════════════
// NRW SCHULFERIENKALENDER (pflegbar in Einstellungen)
// ═══════════════════════════════════════════════════════════

model SchulferienNRW {
  id          String    @id @default(cuid())
  bezeichnung String    // "Sommerferien 2026"
  von         DateTime
  bis         DateTime
  ferienTyp   FerienTyp
  schuljahr   String    // "2025/2026"
  aktiv       Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@map("schulferien_nrw")
}

enum FerienTyp {
  SOMMER    // Sperrzone: 6 Wochen vor/nach
  SONSTIGE  // Sperrzone: 2 Wochen vor/nach
}
```

---

## 7. API-Struktur

### Mutterschutz-Endpunkte

```
GET    /api/mutterschutz                      → Liste (Filter: Status, Org, Personalgruppe)
POST   /api/mutterschutz                      → Neuen Vorgang anlegen
GET    /api/mutterschutz/[id]                 → Details
PATCH  /api/mutterschutz/[id]                 → Status/Felder aktualisieren
DELETE /api/mutterschutz/[id]                 → Löschen (nur Status GEMELDET)
GET    /api/mutterschutz/[id]/checkliste      → Checkliste abrufen
PATCH  /api/mutterschutz/[id]/checkliste/[itemId] → Item abhaken
GET    /api/mutterschutz/[id]/dokumente       → Dokumente abrufen
POST   /api/mutterschutz/[id]/dokumente       → Dokument hochladen
DELETE /api/mutterschutz/[id]/dokumente/[docId]
GET    /api/mutterschutz/[id]/notizen         → Notizen abrufen
POST   /api/mutterschutz/[id]/notizen         → Notiz erstellen
GET    /api/mutterschutz/[id]/bad-aufforderung → BAD-Brief als PDF generieren
```

### Elternzeit-Endpunkte (Portal, geschützt)

```
GET    /api/elternzeit                        → Liste
POST   /api/elternzeit                        → Neuen Vorgang anlegen
GET    /api/elternzeit/[id]                   → Details
PATCH  /api/elternzeit/[id]                   → Status/Felder aktualisieren
DELETE /api/elternzeit/[id]                   → Löschen (nur ANGELEGT)

GET    /api/elternzeit/[id]/abschnitte        → Abschnitte abrufen
POST   /api/elternzeit/[id]/abschnitte        → Abschnitt hinzufügen
PATCH  /api/elternzeit/[id]/abschnitte/[aId]
DELETE /api/elternzeit/[id]/abschnitte/[aId]

GET    /api/elternzeit/[id]/fristen           → Fristen abrufen
PATCH  /api/elternzeit/[id]/fristen/[fId]     → Frist erledigt markieren

GET    /api/elternzeit/[id]/checkliste
PATCH  /api/elternzeit/[id]/checkliste/[cId]

GET    /api/elternzeit/[id]/dokumente
POST   /api/elternzeit/[id]/dokumente
DELETE /api/elternzeit/[id]/dokumente/[dId]

GET    /api/elternzeit/[id]/notizen
POST   /api/elternzeit/[id]/notizen

POST   /api/elternzeit/[id]/antrag-link-vorl  → Magic Link Token 1 generieren + versenden
POST   /api/elternzeit/[id]/antrag-link-endg  → Magic Link Token 2 generieren + versenden

POST   /api/elternzeit/[id]/genehmigen-vorl   → Vorläufig genehmigen
POST   /api/elternzeit/[id]/ablehnen-vorl
POST   /api/elternzeit/[id]/genehmigen-endg   → Endgültig genehmigen

GET    /api/elternzeit/[id]/genehmigung-vorl  → PDF vorläufige Genehmigung
GET    /api/elternzeit/[id]/genehmigung-endg  → PDF endgültige Genehmigung
GET    /api/elternzeit/[id]/br-schreiben      → PDF Schreiben BR Detmold Dez. 41
GET    /api/elternzeit/[id]/vbl-info          → PDF VBL-Informationsbrief (TV-L)
GET    /api/elternzeit/[id]/ag-bescheinigung  → PDF AG-Bescheinigung Elterngeld
GET    /api/elternzeit/[id]/beihilfe-aenderung → PDF Beihilfe-Änderung (Beamte/PSI)

POST   /api/elternzeit/[id]/unterbrechung     → Unterbrechung einleiten
GET    /api/elternzeit/[id]/unterbrechung/[uId]/genehmigung → PDF

GET    /api/elternzeit/[id]/lohnbuero-export  → CSV/PDF für DEÜV-relevante Daten

GET    /api/elternzeit/analytics              → Statistiken Dashboard
```

### Öffentliche Endpunkte (Magic Link, kein Auth)

```
GET    /api/elternzeit-antrag/[token]         → Formular-Daten laden
PATCH  /api/elternzeit-antrag/[token]         → Zwischenspeichern
POST   /api/elternzeit-antrag/[token]/submit  → Einreichen
POST   /api/elternzeit-antrag/[token]/dokumente → Geburtsurkunde hochladen
```

### Cron & Einstellungen

```
POST   /api/cron/elternzeit-fristen           → Tägliche Fristenprüfung + Eskalation
GET    /api/settings/schulferien              → Ferienkalender abrufen
POST   /api/settings/schulferien              → Ferientermin hinzufügen
PATCH  /api/settings/schulferien/[id]         → Ferientermin aktualisieren
DELETE /api/settings/schulferien/[id]         → Ferientermin löschen
```

---

## 8. Öffentliche Formulare (Magic Link)

### Formular 1: Vorläufiger Antrag (`/elternzeit-antrag/[token]`)

**5-Schritt-Formular** (wie Fragebogen/Verbeamtung):

| Schritt | Felder |
|---|---|
| 1: Persönliche Daten | Name (read-only), Adresse, Dienst-/Tarifbezeichnung, Personalnummer, Schule/Einrichtung, Schulnummer |
| 2: Kind & Geburt | Voraussichtlicher Geburtstermin, Erklärung Betreuungsabsicht, Gleichzeitige EZ beider Eltern (Ja/Nein) |
| 3: Zeitabschnitte | Abschnitt 1 Von/Bis (Pflicht), Abschnitt 2 Von/Bis (opt.), Abschnitt 3 Von/Bis (opt.), Übertragung 3.–8. Lj.? |
| 4: Teilzeit | Teilzeit während EZ (Ja/Nein), Gewünschte Stunden (max. 32h), Hinweis auf separaten Antrag |
| 5: Abschluss | Begründung Feriennähe (§ 11 FrUrlV), DSGVO-Zustimmung, Einreichen |

**Validierungen im Formular:**
- Feriensperrfrist-Check: ⚠ Warnung (kein harter Fehler) wenn EZ-Beginn/-Ende in Sperrzone
- Antragsfrist-Check: ⚠ Warnung wenn weniger als 7 Wochen bis EZ-Beginn
- Abschnitt-Logik: Max. 3 Abschnitte bis 3. Lebensjahr ohne AG-Zustimmung
- Teilzeit: Max. 32 Stunden/Woche (§ 15 Abs. 7 BEEG)

### Formular 2: Endgültiger Antrag (`/elternzeit-antrag/[token]`)

**3-Schritt-Formular** (nach Geburt):

| Schritt | Felder |
|---|---|
| 1: Geburt | Tatsächliches Geburtsdatum, Frühgeburt (Ja/Nein), Mehrlinge (Ja/Nein) |
| 2: Kind | Name des Kindes, Geschlecht (Tochter/Sohn), Ggf. Korrektur Zeitabschnitte |
| 3: Dokumente | Upload Geburtsurkunde (PDF/JPG/PNG max. 10MB), Bei Vater: Erklärung Mutter, DSGVO |

---

## 9. Portal UI

### Dashboard-Integration

Neuer Tab **"Elternzeit"** neben "Onboarding" / "Offboarding" / "Verbeamtung":

```
Dashboard-Kacheln:
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Aktive EZ      │ │ Mutterschutz   │ │ Offene Fristen │ │ Rückkehr       │
│ 8 Vorgänge     │ │ 3 aktiv        │ │ 🔴 2 überfällig│ │ nächste 8 Wo.  │
│                │ │                │ │ 🟡 4 bald      │ │ 3 Personen     │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘

Tabelle mit Spalten:
Name | Personalgruppe | Status | Einrichtung | EZ-Beginn | EZ-Ende | Fristen-Ampel | Aktionen
```

### Vorgang-Detailseite `/dashboard/elternzeit/[id]`

```
Header:
  [Name Mitarbeiter] — EZ-2026-001 — [Status-Badge] — [Personalgruppe-Badge]
  [Einrichtung] — TV-L / Beamter / PSI

Aktions-Buttons (kontextabhängig):
  [Magic Link senden] [Genehmigen] [Ablehnen] [Unterbrechung] [Exportieren]

Tabs:
  ├── Übersicht
  │     Mutterschutz-Daten (Beginn/Ende, BAD-Status)
  │     Kind-Daten (Name, Geburtsdatum, Geburtsurkunde ✓/✗)
  │     Zeitabschnitte (Tabelle)
  │     BR Detmold Status (Schreiben versandt? Genehmigung eingegangen?)
  │
  ├── Fristen (Ampel-Ansicht)
  │     🔴 DEÜV-Meldung: fällig seit 3 Tagen — [Als erledigt markieren]
  │     🟡 Geburtsurkunde: fällig in 7 Tagen — [Als erledigt markieren]
  │     🟢 KV-Zuschuss-Antrag: erledigt am 01.04.2026
  │
  ├── Dokumente
  │     Generierte Briefe: [📄 Vorläufige Genehmigung] [📄 Endgültige Genehmigung]
  │                        [📄 BR-Schreiben] [📄 VBL-Info] [📄 AG-Bescheinigung]
  │     Hochgeladene Dokumente: Geburtsurkunde.pdf ✓
  │
  ├── Checkliste
  │     Personalgruppen-spezifische Checkboxen mit LOGA-Hinweisen
  │
  └── Notizen
        Freitext-Notizen mit Zeitstempel
```

### Anlage-Modal "Neuer Elternzeit-Vorgang"

```
Felder:
  ┌ Mitarbeiter-Suche (Autovervollständigung)
  ├ Personalgruppe: ○ TV-L  ○ Beamter  ○ Planstelleninhaber
  ├ Geschlecht: ○ Mutter  ○ Vater
  ├ KV-Typ: ○ GKV Pflicht  ○ GKV Freiwillig  ○ PKV
  ├ Einrichtungstyp: ○ Schule  ○ Kita
  ├ Voraussichtlicher Geburtstermin: [Datum-Picker]
  ├ Einrichtungsleiter Name: [Text]
  ├ Einrichtungsleiter E-Mail: [E-Mail]
  └ Kind-Nummer: ○ 1. Kind  ○ 2. Kind  ○ 3. Kind  ○ weiteres
```

### Einstellungen → Schulferien NRW

Neue Seite unter `/einstellungen/schulferien`:
- Tabelle aller gespeicherten Ferientermine (nach Schuljahr gruppiert)
- Hinzufügen / Bearbeiten / Löschen von Terminen
- Typ-Auswahl: Sommer (6 Wo. Sperrzone) / Sonstige (2 Wo. Sperrzone)
- Initialer Seed mit Daten 2024–2028

---

## 10. Dokumentengenerierung (PDF-Briefe)

Alle Briefe werden mit **PDFKit** generiert (wie bestehende PDF-Exports im System). CREDO Corporate Design: Montserrat-Schrift, keine Farbverläufe, Primärfarbe #575756.

### Briefvorlagen-Übersicht

| Brief | Personalgruppe | Empfänger | Unterschrift |
|---|---|---|---|
| Vorläufige Genehmigung (Mutter) | Alle | Mitarbeiterin | HR |
| Vorläufige Genehmigung (Vater) | Alle | Mitarbeiter | HR |
| Endgültige Genehmigung Standard | Alle | Mitarbeiter/in | Geschäftsführung |
| Unterbrechungsgenehmigung | Alle | Mitarbeiter/in | HR |
| BAD-Aufforderung | Kita/Schule | Mitarbeiterin | HR |
| VBL-Informationsbrief | TV-L | Mitarbeiter/in | HR |
| AG-Bescheinigung Elterngeld | Alle | Mitarbeiter/in | HR |
| BR Detmold Schreiben | Alle | BR Detmold, Dez. 41 | HR/GF |
| Beihilfe-Änderungsformular | Beamte/PSI | Beihilfestelle | HR |

### BR Detmold Schreiben — Pflichtfelder (§ 16 BEEG)

Das generierte Schreiben an **Bezirksregierung Detmold, Dezernat 41, Leopoldstr. 15, 32756 Detmold** enthält zwingend:

```
- Name, Vorname der Lehrkraft
- Dienst-/Tarifbezeichnung (z.B. "L EG 13 TV-L" oder "Studienrätin")
- Personalnummer
- Schule + Schulnummer
- Geburtsdatum des Kindes
- Name des Kindes
- Gewünschte Elternzeit-Abschnitte (Von / Bis mit Nummern)
- Erklärung zur Betreuungsabsicht
- Gleichzeitige EZ beider Eltern? (Ja/Nein)
- Antrag auf Teilzeit während EZ? (Ja/Nein + Stunden)
- Frühgeburt/Mehrlinge? (falls relevant)
- Datum + Unterschrift (handschriftlich nach Druck)
```

**Einreichungsweg BR Detmold:** Per Post (rechtsverbindlich). Das Portal generiert das druckfertige Schreiben — HR druckt, lässt unterschreiben und versendet per Post.

### AG-Bescheinigung für Elterngeld

Einkommensnachweis für die Elterngeldstelle (wird von jedem Mitarbeiter benötigt):
- Bruttogehalt der letzten 12 Monate vor Mutterschutzbeginn
- Steuerklasse
- KV/RV-Beiträge
- Angabe ob sozialversicherungspflichtig
- Bestätigung Arbeitsverhältnis

---

## 11. Fristenverwaltung

### Automatische Berechnung bei Vorgang-Anlage

Beim Anlegen eines Elternzeit-Vorgangs werden alle Fristen automatisch berechnet und als `ElternzeitFrist`-Records erzeugt:

```typescript
// Fristenberechnung (src/lib/elternzeit-fristen.ts)
function berechneFristen(prozess: ElternzeitProzess): ElternzeitFrist[] {
  const fristen: ElternzeitFrist[] = [];
  const ersterAbschnitt = prozess.abschnitte[0];

  if (ersterAbschnitt) {
    const wochen = istUebertragung3bis8(ersterAbschnitt) ? 13 : 7;
    fristen.push({
      fristTyp: 'ANTRAG_EINREICHUNG',
      faelligAm: subWeeks(ersterAbschnitt.von, wochen),
      erinnerung1Am: subWeeks(ersterAbschnitt.von, wochen + 4),
      erinnerung2Am: subWeeks(ersterAbschnitt.von, wochen + 2),
    });
  }

  // DEÜV nur bei TV-L + GKV-Pflicht
  if (prozess.personalgruppe === 'TARIF_TV_L' && prozess.kvTyp === 'GKV_PFLICHT') {
    fristen.push({
      fristTyp: 'DEÜV_MELDUNG_BEGINN',
      faelligAm: ersterAbschnitt.von,
      erinnerung1Am: subDays(ersterAbschnitt.von, 14),
      erinnerung2Am: subDays(ersterAbschnitt.von, 7),
    });
  }

  // KV-Zuschuss nur bei Beamten/PSI (sofort bei Genehmigung)
  if (['BEAMTER', 'PLANSTELLENINHABER'].includes(prozess.personalgruppe)) {
    fristen.push({
      fristTyp: 'KV_ZUSCHUSS_ANTRAG',
      faelligAm: addDays(new Date(), 0),  // sofort
      erinnerung1Am: addDays(new Date(), 0),
      erinnerung2Am: addDays(new Date(), 3),
    });
  }

  // Weitere Fristen...
  return fristen;
}
```

### Eskalationsstufen (Cron-Job täglich)

```
Level 1 (Erinnerung):  Frist läuft in < 4 Wochen  → E-Mail an HR
Level 2 (Warnung):     Frist läuft in < 2 Wochen  → E-Mail an HR + Einrichtungsleitung
Level 3 (Überfällig):  Frist abgelaufen            → Dashboard-Alert (rot) + E-Mail GF
Level 4 (Kritisch):    Antragsfrist BEEG überschritten → Sofortmeldung GF
                        Konsequenz: EZ beginnt erst ab neuem Antragsdatum!
```

### Cron-Job `/api/cron/elternzeit-fristen`

```typescript
// Tägliche Ausführung (wie civil-service-deadlines)
// Prüft alle ElternzeitFrist-Records mit Status OFFEN
// Sendet Webhooks/E-Mails bei Erreichen der Eskalationsstufen
// Aktualisiert Status auf ESKALIERT / UEBERFAELLIG
```

---

## 12. Feriensperrfrist-Check (§ 11 FrUrlV NRW)

### Rechtliche Grundlage

§ 11 FrUrlV NRW: Elternzeit für Beamte/Planstelleninhaber im Schuldienst darf nicht allein auf Ferienzeit beschränkt sein und darf Schulferien nicht ohne sachgerechte Begründung aussparen.

**Sperrzone:**
- Sommerferien: 6 Wochen vor/nach den Ferien
- Alle anderen Ferien: 2 Wochen vor/nach den Ferien

### Implementierung

```typescript
// src/lib/elternzeit-ferien.ts

interface FerienWarnung {
  abschnittNr: number;
  ferienBezeichnung: string;
  typ: 'BEGINN_IN_FERIEN' | 'ENDE_IN_FERIEN' | 'BEGINN_IN_SPERRZONE' | 'ENDE_IN_SPERRZONE';
  hinweis: string;
}

function pruefeFeriensperrfrist(
  abschnitte: ElternzeitAbschnitt[],
  ferien: SchulferienNRW[],
  nurBeamteUndPSI: boolean
): FerienWarnung[] {
  // Nur bei Beamten/PSI und Schulen (nicht Kita) relevant
  // Gibt Warnungen aus — kein harter Validierungsfehler
  // Sachgerechte Begründung kann eingegeben werden
}
```

**Im Formular:** Warnung erscheint als gelbes Banner. Begründungsfeld wird eingeblendet. Benutzer kann trotzdem fortfahren (Bezirksregierung entscheidet letztlich).

**Im Portal:** Feriensperrfrist-Warnung-Icon in der Abschnitt-Ansicht mit Tooltip.

---

## 13. NRW Schulferienkalender

### Initiale Seed-Daten (aus ICS-Feed, Quelle: i.cal.to/ical/77/nrw)

```typescript
// prisma/seed.ts — Schulferien NRW 2024–2028
const schulferien = [
  // 2024/2025
  { bezeichnung: 'Sommerferien 2024',     von: '2024-07-08', bis: '2024-08-21', typ: 'SOMMER',   schuljahr: '2023/2024' },
  { bezeichnung: 'Herbstferien 2024',     von: '2024-10-14', bis: '2024-10-27', typ: 'SONSTIGE', schuljahr: '2024/2025' },
  { bezeichnung: 'Weihnachtsferien 24/25',von: '2024-12-23', bis: '2025-01-07', typ: 'SONSTIGE', schuljahr: '2024/2025' },
  { bezeichnung: 'Osterferien 2025',      von: '2025-04-14', bis: '2025-04-27', typ: 'SONSTIGE', schuljahr: '2024/2025' },
  { bezeichnung: 'Pfingstferien 2025',    von: '2025-06-10', bis: '2025-06-11', typ: 'SONSTIGE', schuljahr: '2024/2025' },
  // 2025/2026
  { bezeichnung: 'Sommerferien 2025',     von: '2025-07-14', bis: '2025-08-27', typ: 'SOMMER',   schuljahr: '2025/2026' },
  { bezeichnung: 'Herbstferien 2025',     von: '2025-10-13', bis: '2025-10-26', typ: 'SONSTIGE', schuljahr: '2025/2026' },
  { bezeichnung: 'Weihnachtsferien 25/26',von: '2025-12-22', bis: '2026-01-07', typ: 'SONSTIGE', schuljahr: '2025/2026' },
  { bezeichnung: 'Osterferien 2026',      von: '2026-03-30', bis: '2026-04-12', typ: 'SONSTIGE', schuljahr: '2025/2026' },
  { bezeichnung: 'Pfingstferien 2026',    von: '2026-05-26', bis: '2026-05-27', typ: 'SONSTIGE', schuljahr: '2025/2026' },
  // 2026/2027
  { bezeichnung: 'Sommerferien 2026',     von: '2026-07-20', bis: '2026-09-02', typ: 'SOMMER',   schuljahr: '2026/2027' },
  { bezeichnung: 'Herbstferien 2026',     von: '2026-10-17', bis: '2026-11-01', typ: 'SONSTIGE', schuljahr: '2026/2027' },
  { bezeichnung: 'Weihnachtsferien 26/27',von: '2026-12-23', bis: '2027-01-07', typ: 'SONSTIGE', schuljahr: '2026/2027' },
  { bezeichnung: 'Osterferien 2027',      von: '2027-03-22', bis: '2027-04-04', typ: 'SONSTIGE', schuljahr: '2026/2027' },
  { bezeichnung: 'Pfingstferien 2027',    von: '2027-05-18', bis: '2027-05-19', typ: 'SONSTIGE', schuljahr: '2026/2027' },
  // 2027/2028
  { bezeichnung: 'Sommerferien 2027',     von: '2027-07-19', bis: '2027-09-01', typ: 'SOMMER',   schuljahr: '2027/2028' },
  { bezeichnung: 'Herbstferien 2027',     von: '2027-10-23', bis: '2027-11-07', typ: 'SONSTIGE', schuljahr: '2027/2028' },
  { bezeichnung: 'Weihnachtsferien 27/28',von: '2027-12-24', bis: '2028-01-09', typ: 'SONSTIGE', schuljahr: '2027/2028' },
];
```

**ICS-Feed URL für zukünftige Updates:** `http://i.cal.to/ical/77/nrw/ferien/9d9578b9.6f39f433-d6a31321.ics`

---

## 14. Personalgruppen-spezifische Checklisten

### TV-L Tarifangestellte (Schule + Kita)

**Phase: Antrag / Mutterschutz**
- [ ] BAD-Aufforderungsbrief versandt *(nur Kita)*
- [ ] BAD-Untersuchung abgeschlossen *(nur Kita)*
- [ ] Lohnbescheinigung für KK erstellt (1 Woche vor Mutterschutz-Beginn)
- [ ] LOGA Fehlzeiten: Mutterschutz/Krankheit eingetragen (tägl. KK-Zuschuss 13,00 EUR)
- [ ] LOGA Steuer: Sonder-Steuerklasse Mutterschutz
- [ ] Vorläufiger Antrag via Magic Link versendet

**Phase: Genehmigung**
- [ ] Endgültiger Antrag via Magic Link versendet (nach Geburt)
- [ ] Geburtsurkunde erhalten
- [ ] LOGA Familie: Kind-Name und Geburtsdatum eingetragen
- [ ] LOGA SV: Kinderlosenzuschlag entfernt
- [ ] LOGA SV: Anzahl Kinder PV-Beitrag anpassen
- [ ] LOGA Fehlzeiten: Elternzeit eingetragen
- [ ] DEÜV-Unterbrechungsmeldung (Meldegrund 51) erstellt
- [ ] Endgültige Genehmigung versandt
- [ ] BR Detmold Schreiben versandt (Dez. 41, per Post)
- [ ] VBL-Informationsbrief versandt
- [ ] AG-Bescheinigung Elterngeld ausgestellt

**Phase: Rückkehr**
- [ ] Rückkehrdatum + Stundenumfang geklärt
- [ ] LOGA Beschäftigung reaktiviert
- [ ] DEÜV Wiederaufnahme-Meldung erstellt
- [ ] IT-Zugang reaktiviert
- [ ] Stundenplan / Einsatz koordiniert

### Beamte & Planstelleninhaber (zusätzlich zu TV-L)

- [ ] KV-Zuschuss-Antrag an LBV NRW gestellt (sofort bei Genehmigung)
- [ ] Beihilfestelle (Bezirksregierung) informiert
- [ ] Beihilfe-Änderungsformular ausgefüllt und versandt
- [ ] Planstelle als "vorübergehend unbesetzt" gemeldet
- [ ] Probezeit-Verlängerung dokumentiert (§ 16 LBG NRW)
- [ ] Stufenfestsetzungs-Notiz erstellt (EZ bis 3 Jahre/Kind anrechenbar § 30 LBesG NRW)
- [ ] BR Genehmigung eingegangen (Datum + Aktenzeichen erfassen)
- [ ] KV-Zuschuss bei Rückkehr beendet

---

## 15. Webhook-Events

Neue Events für n8n-Integration (wie bestehende Webhook-Konfiguration):

```typescript
// Mutterschutz
'mutterschutz-angelegt'           // { email, displayId, voraussGeburt, einrichtung }
'mutterschutz-bad-aufforderung'   // { email, displayId, badKontakt } (nur Kita)
'mutterschutz-aktiv'              // { email, displayId, beginn, ende }
'mutterschutz-beendet'            // { email, displayId }

// Elternzeit
'elternzeit-angelegt'             // { email, displayId, personalgruppe }
'elternzeit-antrag-link-versandt' // { email, displayId, antragTyp: 'vorlaeufig'|'endgueltig' }
'elternzeit-antrag-eingereicht'   // { email, displayId, antragTyp, submittedAt }
'elternzeit-vorl-genehmigt'       // { email, displayId, genehmigtVon }
'elternzeit-vorl-abgelehnt'       // { email, displayId, ablehnungsgrund }
'elternzeit-endg-genehmigt'       // { email, displayId, ezBeginn, ezEnde }
'elternzeit-aktiv'                // { email, displayId, ezBeginn }
'elternzeit-frist-erinnerung'     // { email, displayId, fristTyp, faelligAm, tageVerbleibend }
'elternzeit-frist-ueberfaellig'   // { email, displayId, fristTyp, ueberfaelligSeit }
'elternzeit-unterbrochen'         // { email, displayId, unterbrechungAm, restEzBis }
'elternzeit-rueckkehr-geplant'    // { email, displayId, rueckkehrAm }
'elternzeit-beendet'              // { email, displayId, beendetAm }
```

---

## 16. Entlassungsschutz-Cross-Check

### Rechtliche Grundlage

§ 18 BEEG: Während der Elternzeit besteht **Kündigungsschutz**. Eine Kündigung ist nur mit Zustimmung der zuständigen Behörde (Bezirksregierung) zulässig.

### Implementierung

Bei **Anlage eines Offboarding-Vorgangs** wird geprüft, ob der Mitarbeiter eine aktive Elternzeit hat:

```typescript
// In /api/offboarding/route.ts — POST handler
const aktiveElternzeit = await prisma.elternzeitProzess.findFirst({
  where: {
    employeeId: body.employeeId,
    status: { in: ['AKTIV', 'VORLAEUFIG_GENEHMIGT', 'GENEHMIGT', 'ANTRAG_VORL_EINGEREICHT'] }
  }
});

if (aktiveElternzeit) {
  // Warnung zurückgeben (kein harter Block — HR muss bestätigen)
  return NextResponse.json({
    warning: {
      type: 'ELTERNZEIT_AKTIV',
      message: `Achtung: ${mitarbeiter.vorname} ${mitarbeiter.nachname} hat eine aktive/genehmigte Elternzeit (${aktiveElternzeit.displayId}). Kündigung während Elternzeit erfordert Zustimmung der Bezirksregierung (§ 18 BEEG).`,
      elternzeitId: aktiveElternzeit.id,
      elternzeitDisplayId: aktiveElternzeit.displayId,
    }
  }, { status: 409 });
}
```

**UI:** Roter Warning-Banner im Offboarding-Anlage-Modal mit Link zum Elternzeit-Vorgang.

---

## 17. Bezirksregierung Detmold

### Kontaktdaten

```
Bezirksregierung Detmold
Dezernat 41 (Personalangelegenheiten Lehrkräfte)
Leopoldstr. 15
32756 Detmold
Tel: +49 5231 71-0
```

### Einreichungsprozess

1. Portal generiert rechtlich vollständiges PDF-Schreiben (alle § 16 BEEG-Pflichtfelder)
2. HR druckt Schreiben aus
3. Mitarbeiter/in unterschreibt (handschriftlich)
4. HR versendet per Post an Dez. 41
5. HR erfasst Versanddatum im Portal (Frist wird als erledigt markiert)
6. Nach Eingang der BR-Bestätigung: HR erfasst Aktenzeichen + Genehmigungsdatum

### Kein Online-Formular

Die BR Detmold hat kein standardisiertes online-verfügbares Formular. Ein formloser Antrag mit allen Pflichtangaben ist ausreichend. Das generierte CREDO-Portal-Schreiben enthält alle gesetzlich erforderlichen Felder.

**Empfehlung:** Bei erster Nutzung einmalig bei Dez. 41 anrufen (+49 5231 71-0) und aktuelles Antragsmuster anfragen.

---

## 18. Phasenplan & Scope

### Phase 1 — MVP (Kern-Prozess)

**Scope:**
- Prisma-Schema: Alle neuen Modelle (Migration)
- Seed: SchulferienNRW 2024–2028
- API: CRUD für Mutterschutz + Elternzeit + Abschnitte + Dokumente + Notizen + Checkliste
- Magic Link Token 1 (vorläufiger Antrag) generieren
- Öffentliches Formular (5 Schritte, vorläufiger Antrag) mit Feriensperrfrist-Check
- Dashboard-Tab "Elternzeit" mit Tabelle + Anlage-Modal + Detailseite (Tabs)
- PDF: Vorläufige Genehmigung Mutter-Version
- PDF: Vorläufige Genehmigung Vater-Version
- Entlassungsschutz-Cross-Check bei Offboarding-Anlage
- Personalgruppen-spezifische Checkliste (auto-generiert bei Anlage)

**Nicht in Phase 1:**
- Fristen-Tracking (nur Anzeige, kein Cron)
- Endgültiger Antrag (Token 2)
- Weitere PDF-Briefvorlagen
- Webhooks

---

### Phase 2 — Vollständig

**Scope:**
- `ElternzeitFrist`-Modell + automatische Berechnung bei Anlage
- Fristen-Ampel-Ansicht im Portal (Dashboard-Widget + Detailseite-Tab)
- Cron-Job `/api/cron/elternzeit-fristen` (täglich, Eskalation 4-stufig)
- Magic Link Token 2 (endgültiger Antrag nach Geburt)
- Öffentliches Formular 2 (3 Schritte, endgültiger Antrag + Geburtsurkunde-Upload)
- PDF: Endgültige Genehmigung (Standard, mit Kind-Name + Segensformel)
- PDF: Schreiben an BR Detmold, Dez. 41
- PDF: VBL-Informationsbrief (TV-L)
- PDF: AG-Bescheinigung für Elterngeld
- PDF: BAD-Aufforderungsbrief (Kita)
- PDF: Beihilfe-Änderungsformular (Beamte/PSI)
- Schulferienkalender-Verwaltung unter `/einstellungen/schulferien`
- Webhook-Events (alle EZ-Events → n8n)
- Einrichtungsleiter-Genehmigung im Portal

---

### Phase 3 — Erweitert

**Scope:**
- `ElternzeitUnterbrechung` Sub-Prozess mit eigenem Modal + PDF
- Rest-EZ-Kalkulator (UI-Widget: verbleibende Monate über mehrere Kinder)
- Lohnbüro-Export (CSV mit DEÜV-relevanten Feldern für DATEV/LOGA)
- BR Detmold Tracking (Versanddatum, Aktenzeichen, Genehmigungsdatum)
- Analytics-Dashboard (Statistiken, Übersicht alle EZ nach Mandant)
- Teilzeit-Antrag als Mini-Workflow (separater Antrag + Genehmigung + Dokument)

---

### Bewusst nicht im Scope

- **Refinanzierung/Jahresrechnung**: Zu nah an Buchhaltung. Stattdessen nur strukturierter Export-Bericht
- **DEÜV-Meldung direkt erstellen**: Das macht DATEV/LOGA — Portal liefert Datenbasis + Lohnbüro-Export
- **Elterngeld-Berechnung**: Das macht die Elterngeldstelle — Portal stellt nur AG-Bescheinigung aus

---

## 19. Offene Punkte vor Implementierung

| # | Punkt | Status |
|---|---|---|
| 1 | BR Detmold: Einmalig Dez. 41 anrufen (+49 5231 71-0) für aktuelles Antragsmuster | **Offen — bitte vor Phase 2 klären** |
| 2 | Entgelt-Daten für AG-Bescheinigung Elterngeld: Werden diese aus dem Portal-System gezogen oder manuell eingegeben? | **Offen** |
| 3 | Wer unterschreibt die endgültige Genehmigung? (In Doku: "Eduard Reimer, Geschäftsführung") — soll das konfigurierbar sein? | **Offen** |
| 4 | LOGA-Hinweistexte: Sollen die LOGA-Buchungshinweise in der Checkliste ausführlich (z.B. mit Menüpfad "LOGA → Familie → Kind anlegen") oder nur als Stichwort erscheinen? | **Offen** |
| 5 | Feriensperrfrist: Gilt die Prüfung nur für Beamte/PSI (§ 11 FrUrlV NRW) oder auch als Hinweis für TV-L? | **Empfehlung: Hinweis für alle, Pflichtbegründung nur Beamte/PSI** |

---

*Dokument erstellt: April 2026 | Für: Claude Code Implementierung im VS Code*
*Rechtsstand: April 2026 | TV-L, BEEG, MuSchG, FrUrlV NRW, FESchVO NRW*
*BR Detmold, Dezernat 41 | NRW Schulferienkalender 2024–2028 aus ICS-Feed*
