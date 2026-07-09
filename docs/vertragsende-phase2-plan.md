# Modul „Vertragsende" — Prozess-Überarbeitung & Phase 2 (Arbeitsplan)

**Branch:** `feat/vertragsende` · **Stand:** 2026-07-09 · **Status:** ✅ ALLE Etappen fertig — bereit für Merge nach `main`
**Vorgänger:** [`vertragsende-implementierung.md`](./vertragsende-implementierung.md) (Phase 1, fertig) · [`vertragsende-prozess.html`](./vertragsende-prozess.html) (Ur-Konzept)

> **Lebendiges Dokument.** Wird nach jedem abgeschlossenen Task aktualisiert. Der Abschnitt
> [§0 Aktueller Stand](#0-aktueller-stand) sagt jederzeit, wo wir stehen und wie es weitergeht.

---

## 0. Aktueller Stand

| | |
|---|---|
| **Stand** | ✅ **ALLE Etappen (1–4) fertig + Erweiterungspaket 2026-07-09** (siehe [§8](#8-erweiterungspaket-2026-07-09)) |
| **➡ Nächster Schritt** | Server-Deploy (`prisma db push` via Entrypoint — NEUE Felder!) + n8n-Flow 3.0 **re-importieren** (Stammdaten-Spalten) + **Empfänger für die 2 neuen HR-Events konfigurieren** (Einstellungen → E-Mail-Versand: Eskalation + Unbearbeitet-Digest, sonst SKIPPED) |
| **n8n-Konfiguration** | Flow „Email-Vertragsende-Personal 3.0": `POST {APP_URL}/api/webhooks/contract-end`, Header `Authorization: Bearer {CRON_SECRET}`, Body = Eintrag-Objekt ODER Array (max. 200), inkl. `stammdaten`-Objekt. Zusätzlich täglich: `POST /api/cron/contract-end-reminders` (gleicher Bearer) |
| **Qualität (Basis)** | tsc/ESLint/Build grün · 320 Jest-Tests grün (35 neue) · credo-check 🟢 · Browser-Verifikation Etappe 1+2 (2026-06-19) |
| **Qualität (Erweiterung)** | 345 Jest-Tests grün (25 neue: Reminder-manuell, Webhook-Stammdaten/B9, Vorstand-Frage, Eskalation/Digest) · lint/build/tsc grün |

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
- [x] ✅ **#10 n8n-Webhook-Eingang** `POST /api/webhooks/contract-end` — Bearer CRON_SECRET (timing-safe), Einzel- oder Batch-Body (max. 200), Idempotenz B8 (offener Vorgang + gleiches Ende → `unveraendert`, Vorausfüll-Felder werden still aufgefrischt), Vertragsänderung B9 (Ende verschoben → Update + AuditLog `CONTRACT_END_UPDATED_BY_WEBHOOK`), Mehrfach-Erkennung via `personalMandanten` (AuditLog `CONTRACT_END_MEHRFACH_ERKANNT`, kein Teil-Offboarding, Entscheidung B5), Personalakte-Verknüpfung per Personalnummer, Eintrag-Fehler brechen den Batch nicht ab. Erweitertes Schema: `aktuellePosition/Entgeltgruppe/Stufe/Wochenstunden`, `befristungsart`, `bisherigeBefristungMonate/Verlaengerungen`, `personalMandanten`. *erledigt 2026-07-09.*

### Etappe 4 — Abschluss
- [x] ✅ **#11 Tests** — 35 neue: Warnlogik B1/B2 (Unit), Erinnerungs-Cron (Staffelung/Skip/Fehlertoleranz), Webhook (Auth/Anlage/B8/B9/Mehrfach/Batch). Gesamtsuite 320 grün. *erledigt 2026-07-09.*
- [x] ✅ **#12 Qualität + Doku** — lint+build grün, credo-check 🟢 (MINOR A8 gefixt), diese Doku aktualisiert, Merge nach `main`. *erledigt 2026-07-09.*

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
- **B7 HR-/GF-Freigabe-Gate** — teilweise erledigt: seit 2026-07-09 bestätigt die Führungskraft die Vorstand/GF-Abstimmung (Pflichtfrage + Nachweis, keine Blockade); ein hartes Freigabe-Gate bleibt optional.
- ~~**B5 Teil-Offboarding** — Info-Hinweis~~ → **Hinweis umgesetzt 2026-07-09** („Person hat weitere Einstellungen“-Karte auf der Detailseite); Teil-Offboarding bleibt verworfen.
- **Voller Form-Builder** — verworfen zugunsten des schlanken Feld-Schalters (#5).
- **Word-Vorlagen** „Verlängerung"/„Entfristung"/„Auslaufmitteilung"/„MAV-Anhörung" — Inhalt liefert der Nutzer; bis dahin Platzhalter-Vorlagen.
- ⚠ **DSGVO-Löschkonzept (bewusstes, dokumentiertes Restrisiko):** Abgeschlossene/stornierte Vorgänge behalten die DokuBit-Stammdaten (inkl. Adresse/Geburtsdatum in `dokubitDaten`) unbegrenzt. Entscheidung 2026-07-09: eigenes späteres Paket — Cron nach BEM-Aufbewahrungs-Muster, der X Jahre nach Abschluss die Personendaten im Vorgang leert.
- **Vorgesetzten-Stammdaten je Mandant** statt Freitext-E-Mail (Schutz gegen Fehlversand des Magic-Links) — Backlog-Kandidat.

---

## 7. DokuBit / n8n (Referenz aus Phase-1-Klärung)

- Flow **„Email-Vertragsende-Personal 3.0 (Portal-Webhook)"** (wöchentlich Mo 9 Uhr; JSON lokal unter `n8n/`,
  bewusst nicht im Repo). Quelle MS-SQL **`DokuBit`**, Tabellen `dokubitmitarbeiter` + `personal_mandanten`.
  `MANDANTENNUMMER` == `Organization.mandantNumber` (Auto-Zuordnung).
- Basis-Spalten: `MANR`, `MAVONAME`, `MANANAME`, `MAEMAIL`, `MANDANTENNUMMER`, `VERTRAGSBEGINN`, `VERTRAGSENDE`.
- **Seit 2026-07-09 zusätzlich (Erweiterungspaket):** aktueller Vertrag (`MAPOSITION`, `TARIFGRUPPE`, `TARIFSTUFE`,
  `TEILZEITSTUNDEN`) als typisierte Felder + `stammdaten`-Whitelist (`MAANREDE/MAGRAD/MATITEL`, Adresse, Geburtsdaten,
  `MAGESCHLECHT/MAQUALIFIKATION/MASTATUS`, `ABRECHNUNGSKREIS/TARIF/BESCHAEFTIGUNGSGRUPPE/VERTRAGSART`,
  `KONZERNEINTRITT/REGELSALTERSGRENZE`, `PROBEZEIT*`, `EVTLLDA`) → `ContractEndProcess.dokubitDaten`.
  Mehrfach-Erkennung aus dem Abfragefenster (gleiche `MANR` bei mehreren Mandanten) → `weitereMandanten`.
  Befristungsart/-historie liefert DokuBit weiterhin NICHT (Felder bleiben optional, §14-Warnung greift nur bei Lieferung).

---

## 8. Erweiterungspaket 2026-07-09

Nach Prozess-Review (HR-Brille) umgesetzt, alle Punkte in einem Branch `feat/vertragsende-erweiterungen`:

1. **DokuBit-Stammdaten komplett** (siehe §7): 26 neue Dokument-Platzhalter (Gruppen „Person (DokuBit)" +
   „Aktueller Vertrag (DokuBit)" im `VariablenKatalog`), Resolver liest `dokubitDaten` + `current*`.
2. **Formular-Vorbefüllung:** GET `/api/vertrag-formular/[token]` liefert `vorbefuellung` (Stunden/EG/Stufe/
   Position/Probezeit-Monate + Vertragsbeginn-Kandidat = Tag nach Vertragsende); Formular füllt nur leere Felder,
   gespeicherte Entwürfe haben Vorrang. Bewusst KEINE Adress-/Geburtsdaten im öffentlichen Formular.
3. **Vorstand/GF-Frage (B7 light):** Pflichtblock im Übernahme-Zweig „Wurde das mit dem Vorstand/Geschäftsführung
   abgestimmt?" (Ja/Nein, CREDO-Gelb hervorgehoben); bei Ja Pflicht-Nachweis „Abgestimmt mit …, am …".
   Per Mandant abschaltbar (Feld `vorstandAbstimmung` in der Vertragsende-Konfiguration). Bei Nein: Rückmeldung
   wird angenommen, Detailseite + Dokumente-Tab zeigen eine rote Warnbox (keine Blockade).
4. **Manueller Erinnerungs-Button:** `POST /api/contract-end/[id]/reminder` + Button „Erinnerung senden"
   (bestehender Link, kein Token-Reset — Unterschied zu „Anfrage erneut senden" wird im UI erklärt);
   gemeinsamer Helfer `contract-end-reminder.ts` mit dem Cron.
5. **Eskalation an HR:** Event `contract-end-eskalation` nach ≥3 erfolglosen Erinnerungen, genau einmal je
   Anfrage (`escalatedAt`, Reset bei erneutem Anfrage-Versand). **Empfänger muss in Einstellungen → E-Mail-Versand
   konfiguriert werden** (bewusst kein Default).
6. **Montags-Digest:** Event `contract-end-unbearbeitet` — kritische/Warnung-Vorgänge im Status ANGELEGT ohne
   versendete Anfrage, als Sammel-Mail. **Empfänger ebenfalls konfigurieren.**
7. **Detailseite:** Mehrfachbeschäftigungs-Karte (`weitereMandanten`) + amber Banner bei B9-Datumsänderung auf
   weit fortgeschrittenem Vorgang (`contractEndDateGeaendertAm` — vermutlich Verlängerung bereits in LOGA vollzogen).

**Neue Schema-Felder** (via `db push` beim Deploy): `dokubitDaten Json?`, `weitereMandanten String[]`,
`contractEndDateGeaendertAm`, `vorstandAbgestimmt`, `vorstandAbstimmungVermerk`, `escalatedAt`.
**Tests:** 345 gesamt grün (25 neue). **Deploy-Checkliste:** main deployen → n8n-Flow 3.0 re-importieren →
Empfänger für die 2 neuen HR-Events setzen.
