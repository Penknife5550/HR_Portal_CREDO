# Modul „Vertragsende" — Prozess-Überarbeitung & Phase 2 (Arbeitsplan)

**Branch:** `feat/vertragsende` · **Stand:** 2026-06-19 · **Status:** ▶ Etappe 1 läuft (Task #1)
**Vorgänger:** [`vertragsende-implementierung.md`](./vertragsende-implementierung.md) (Phase 1, fertig) · [`vertragsende-prozess.html`](./vertragsende-prozess.html) (Ur-Konzept)

> **Lebendiges Dokument.** Wird nach jedem abgeschlossenen Task aktualisiert. Der Abschnitt
> [§0 Aktueller Stand](#0-aktueller-stand) sagt jederzeit, wo wir stehen und wie es weitergeht.

---

## 0. Aktueller Stand

| | |
|---|---|
| **Stand** | ✅ **Etappe 1 + 2 fertig & live verifiziert** — pausiert (Urlaub), Etappe 3 + 4 offen |
| **➡ Wiedereinstieg** | **#10** n8n-Webhook-Eingang → **#11** Tests (Warnlogik/Cron/Webhook) → **#12** QA (credo-check/simpler/build) + Merge nach `main` |
| **Branch** | `feat/vertragsende` nach **origin gepusht** (2026-06-19); noch **nicht** nach `main` gemergt |
| **Verifik.-Artefakte** | Test-Vorgänge VE-2026-GYM-003…007 (+ Demo-Offboardings) in lokaler DB 5433 — aufräumbar, **nicht** im Code |
| **Qualität** | tsc grün · ESLint ohne neue Befunde · Browser-Verifikation beider Etappen ok |

Fortschritt: siehe Checkliste in [§4](#4-arbeitspakete--fortschritt). Tasks auch im Session-Tasksystem (#1–#12).

---

## 1. Warum diese Überarbeitung

Phase 1 ließ **HR** die Weiche A/B (übernehmen / nicht übernehmen) stellen. Fachlich falsch: Ob
eine befristete Kraft weiterbeschäftigt wird, ist eine **Führungsentscheidung** (Schul-/Fachbereichs-
leitung) — HR kennt weder Stellenbedarf noch Leistungsbeurteilung, sondern *steuert* und *vollzieht*.

**Neuer Prozess:** HR stößt eine **Anfrage an die Führungskraft** an. Die Führungskraft entscheidet
im Magic-Link-Formular **„Übernehmen? Ja/Nein"** — bei Ja füllt sie gleich die Vertragsdaten aus,
bei Nein gibt sie eine Begründung. **HR vollzieht** danach (Vertrag erzeugen bzw. Offboarding
bestätigen). Dazu HR-Schutzbausteine (Recht/Compliance) und die Phase-2-Automatik über n8n.

---

## 2. Geklärte Entscheidungen (Klärung 2026-06-19)

| Thema | Entscheidung |
|---|---|
| **Prozess** | Führungskraft entscheidet **+** füllt im selben Magic-Link-Formular aus; HR vollzieht danach |
| **Felder konfigurierbar** | Feld-Schalter **pro Mandant** (Onboarding-Muster `field-definitions.ts`); feste Feldliste, **kein** Form-Builder |
| **Betriebsstätte** | Auswahl aus bereits angelegten **Organizations** (Dropdown) statt Freitext |
| **Mehrfacheinstellung** | **1 Vorgang je Einstellung**, Bündelung über Personalakte (`employeeId`); kein n:m am Vorgang |
| **n8n-Zusatzfelder** | aktuelle Vertragsdaten (Vorausfüllen) · Befristungsart+Historie (§14) · `personal_mandanten` (Mehrfach-Erkennung). **Nicht** verfügbar: Vorgesetzten-Mail → Anfrage bleibt manuell |
| **HR-Schutz** | **alle 4:** B1 Rücklauf/Entfristung · B2 §14-Warnung · B3 MAV · B6 Auslaufmitteilung+Zeugnis |
| **Strang B bei Mehrfach** | volles Offboarding **wie heute** (HR prüft selbst); kein Teil-Austritt |

---

## 3. Neuer Status-Flow

```
ANGELEGT
   │  HR: „Anfrage an Vorgesetzten senden"
   ▼
ANFRAGE_VORGESETZTER ──(Cron-Erinnerung bei Nicht-Antwort, gestaffelt nach Ampel)
   │
   ├─ Führungskraft: JA  + Vertragsdaten ──►  RUECKMELDUNG_UEBERNAHME
   │       │  HR-Vollzug (ggf. MAV-Anhörung B3)
   │       ▼
   │   VERTRAG_ERSTELLT ──(B1: unterschrieben zurück)──► VERTRAG_UNTERSCHRIEBEN ──► ABGESCHLOSSEN
   │
   └─ Führungskraft: NEIN + Begründung  ──►  RUECKMELDUNG_KEINE_UEBERNAHME
           │  HR bestätigt (window.confirm)
           ▼
       ENTSCHEIDUNG_KEINE_UEBERNAHME (Offboarding BEFRISTUNGSENDE + Auslaufmitteilung B6) ──► ABGESCHLOSSEN

(STORNIERT jederzeit möglich · ENTSCHEIDUNG_UEBERNAHME = Alt-Flow, deprecated, nur Bestandsdaten)
```

---

## 4. Arbeitspakete & Fortschritt

Legende: ⬜ offen · 🔵 in Arbeit · ✅ fertig

### Etappe 1 — Kern (Schema + Prozess-Reframe)
- [x] ✅ **#1 Schema-Fundament** — neue Status, Vorgesetzten-Rückmeldung, Reminder-Felder, B1/B3-Felder, n8n-Vorausfüll-/Befristungshistorie-Felder, Betriebsstätte-OrgId. *erledigt 2026-06-19: db push (5433) + generate + tsc grün.*
- [x] ✅ **#2 Vorgesetzten-Entscheidung ins Formular** — öffentliche Seite Ja/Nein (+Daten / +Begründung), API setzt RUECKMELDUNG_*. *Code fertig, tsc grün; Browser-Verifikation am Etappenende.*
- [x] ✅ **#3 Detailseite → HR-Vollzug** — „Anfrage senden" statt Weiche; Rückmeldung + Begründung anzeigen; Vollzug je Entscheidung; 5-stufige Schrittleiste. *tsc grün; Ja→RUECKMELDUNG_UEBERNAHME und Nein→Offboarding live durchgeklickt.*

> **Etappe 1 live verifiziert (2026-06-19):** Anfrage senden → `ANFRAGE_VORGESETZTER` (decision OFFEN) · öffentl. Formular zeigt Ja/Nein · Ja+Daten → `RUECKMELDUNG_UEBERNAHME` (E11 gespeichert) · Nein ohne Grund → 400, mit Grund → `RUECKMELDUNG_KEINE_UEBERNAHME` (Begründung HR sichtbar) · HR-Vollzug → Offboarding `OFF-2026-GYM-002` verknüpft.

### Etappe 2 — Schutz & Komfort
- [x] ✅ **#4 Erinnerungs-Cron + Event** — `POST /api/cron/contract-end-reminders`, gestaffelt nach Ampel (KRITISCH 3 / WARNUNG 7 / BEOBACHTEN 14 Tage); Event + Vorlage. *tsc grün; events-catalog+email-dispatch 26 Tests grün; Route kompiliert; Cron-Durchlauf-Test → #11.*
- [x] ✅ **#5 Felder konfigurierbar pro Mandant + Betriebsstätte-Dropdown** — Registry `contract-end-fields.ts` + JSON `Organization.contractEndFieldConfig` + Admin-Seite `/mandanten/[id]/vertragsende-config` + dyn. Formular (Sichtbarkeit/Pflicht/Label) + Org-Dropdown + Probezeit-Rechtshinweis. *tsc grün; Browser-Verifik. am Etappenende.*
- [x] ✅ **#6 B1 Unterschrifts-Rücklauf + Entfristungs-Warnung** — Status `VERTRAG_UNTERSCHRIEBEN` + `contractSignedReturnedAt` + Detailseite-Warnbox (§15 Abs.5 TzBfG) + „Unterschrift erfassen"-Button. *tsc grün; lib `contract-end-warnings.ts`, Unit-Test → #11.*
- [x] ✅ **#7 B2 §14-Kettenbefristungs-Warnung** — `getKettenbefristungWarning` (≥24 Mon / ≥3 Verläng., nur sachgrundlos) + Detailseite-Hinweis. *tsc grün; Unit-Test → #11.*
- [x] ✅ **#8 B3 MAV-Beteiligungsschritt** — `mavStatus`/`mavConsultedAt` + MAV-Karte (Nicht erforderlich/Angehört/Zugestimmt/Widerspruch) via PATCH + AuditLog. *tsc grün.*
- [x] ✅ **#9 B6 Auslaufmitteilung + Zeugnis (Strang B)** — Nicht-Übernahme-Zweig „Nächste Schritte" (Auslaufmitteilung via Dokumente-Tab) + Zeugnis via verknüpftes Offboarding (`tab-zeugnis`) bereits abgedeckt. *tsc grün; Word-Vorlage liefert Nutzer.*

> **Etappe 2 live verifiziert (2026-06-19):** Feld-Config — `stufe` per Mandanten-Config abgeschaltet → öffentl. Formular blendet es aus; Betriebsstätte-Dropdown listet 16 Mandanten. B3 MAV (`ANGEHOERT` + `mavConsultedAt`) und B1 Unterschrift (`VERTRAG_UNTERSCHRIEBEN` + `contractSignedReturnedAt`) gesetzt. **Bug gefunden+gefixt:** Übergang `RUECKMELDUNG_UEBERNAHME → VERTRAG_UNTERSCHRIEBEN` fehlte in `VALID_TRANSITIONS` (gab 400) → ergänzt. B1/B2-Warnlogik → Unit-Test in #11.

### Etappe 3 — Phase 2 (n8n)
- [ ] ⬜ **#10 n8n-Webhook-Eingang** `POST /api/webhooks/contract-end` — Auth, erweitertes Schema, Idempotenz (B8), Update (B9), Mehrfach via `personal_mandanten`. *verify: API-Tests Anlage/Dedup/Update/Auth.*

### Etappe 4 — Abschluss
- [ ] ⬜ **#11 Tests** — alle neuen Bausteine; 285 Bestandstests bleiben grün. *verify: `npm run test` grün.*
- [ ] ⬜ **#12 Qualität + Doku** — credo-check/simpler/lint/build; diese Doku + Konzept-HTML aktualisieren; push/PR klären. *verify: lint+build grün, credo-check sauber.*

---

## 5. HR-Review — blinde Flecken (Referenz)

| # | Befund | im Plan |
|---|---|---|
| B1 | **Entfristungsfalle** §15 Abs.5 TzBfG: Weiterarbeit ohne unterschriebenen Neuvertrag → unbefristet | #6 |
| B2 | **Kettenbefristung** §14 TzBfG: sachgrundlos max. 2 J / 3 Verläng. | #7 |
| B3 | **MAV-Beteiligung** (kirchlicher Träger, MVG-EKD/MAVO) | #8 |
| B4 | **Probezeit bei Verlängerung** i.d.R. unzulässig → Hinweis | #5 (Feld-Hinweis) |
| B5 | **Mehrfachbeschäftigung × Offboarding** | bewusst „wie heute" (HR prüft) |
| B6 | **Auslaufmitteilung + Zeugnis** bei Nicht-Übernahme | #9 |
| B7 | **HR-/GF-Freigabe-Gate** vor Vertragserzeugung | *optional, später* |
| B8 | **n8n-Idempotenz** (wöchentlicher Flow → Dubletten) | #10 |
| B9 | **Vertragsänderung** (Ende verschiebt sich) → Update statt Neuanlage | #10 |

---

## 6. Später / optional (bewusst zurückgestellt)

- **Vorgesetzten-Mail aus n8n** — DokuBit liefert sie nicht → Anfrage bleibt manuell; Teilautomatik später.
- **B7 HR-/GF-Freigabe-Gate** — nicht beschlossen; ließe sich in #6 in den Status-Flow ergänzen.
- **B5 Teil-Offboarding** — verworfen; reiner Info-Hinweis „Person hat weitere Einstellungen" wäre billig nachrüstbar.
- **Voller Form-Builder** — verworfen zugunsten des schlanken Feld-Schalters (#5).
- **Word-Vorlagen** „Verlängerung"/„Entfristung"/„Auslaufmitteilung"/„MAV-Anhörung" — Inhalt liefert der Nutzer; bis dahin Platzhalter-Vorlagen.

---

## 7. DokuBit / n8n (Referenz aus Phase-1-Klärung)

- Flow **„Email-Vertragsende-Personal 2.0"** (wöchentlich Mo 9 Uhr). Quelle MS-SQL **`DokuBit`**, Tabellen
  `dokubitmitarbeiter` + `personal_mandanten`. `MANDANTENNUMMER` == `Organization.mandantNumber` (Auto-Zuordnung).
- Bekannte Spalten: `MANR`, `MAVONAME`, `MANANAME`, `MAEMAIL`, `MANDANTENNUMMER`, `VERTRAGSBEGINN`, `VERTRAGSENDE`.
- **Künftig zusätzlich (#10):** aktuelle Vertragsdaten (Position/E-Gruppe/Stufe/Stunden), Befristungsart + bisherige
  Dauer/Verlängerungen, alle Mandanten-Zuordnungen je Person.
