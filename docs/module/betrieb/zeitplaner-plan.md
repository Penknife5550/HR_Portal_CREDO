# Zeitplaner im Portal – Erinnerungen und Läufe ohne n8n

Stand: 30.09.2026 · Fassung 2 · beauftragt und umgesetzt (Abschnitte 10 und 11)

Ziel: Alle täglichen Läufe (Erinnerungen, Fristen, Löschungen) startet das Portal selbst. Jede
Mail, die dabei hinausgeht – auch der Bericht an HR –, ist eine Vorlage unter
Einstellungen → E-Mail-Versand. n8n wird für Mailing und Erinnerungen nicht mehr gebraucht;
Webhooks bleiben als optionaler Zusatzkanal bestehen.

---

## 1 · Befund: n8n ist heute nur Wecker und Berichtsschreiber

| Was | Wo heute | Folge für den Umbau |
|---|---|---|
| Die Erinnerungs-Mails selbst | Portal: jede Cron-Route verschickt über `triggerWebhooks` → SMTP mit Vorlage aus der Datenbank | **Bleibt**, ändert sich nicht |
| Der Anstoß („jetzt laufen“) | n8n: Schedule Trigger → `POST /api/cron/…` mit `CRON_SECRET` | **Wandert ins Portal** |
| Der Bericht an HR („3 Erinnerungen, 1 nicht zugestellt“) | n8n: Code-Knoten (`n8n/quelle/*-auswerten.js`) → Outlook-Knoten | **Wandert ins Portal**, als neue Vorlage |
| Überwachung (Lauf ausgefallen, 401/500) | n8n: Fehlerausgang des HTTP-Knotens | **Wandert ins Portal**: Protokoll + Wächter |

Die zehn Cron-Routen unter `src/app/api/cron/`:

| Lauf | Mails | Eingeplant in n8n? | Probelauf (`dryRun`) | Logik liegt |
|---|---|---|---|---|
| `reminders` (Fragebogen, Modalitäten, Abteilungen Onboarding) | `employee-reminder`, `supervisor-reminder`, `onboarding-department-reminder` | ja, 08:00 (Import 1) | nein | in der Route (354 Z.) |
| `offboarding-reminders` | `offboarding-reminder` | ja, 08:00 (Import 2) | nein | `abteilungsaufgaben-dienst.ts` |
| `unterlagen-fristen` (Paket 4) | `unterlagen-erinnerung`, `unterlagen-frist-verstrichen`, `unterlagen-vollstaendig` (nachgeholt) | importiert, inaktiv (Import 3) | **ja** | `unterlagen-lauf.ts` |
| `dokument-ablauf` | `dokument-ablauf-warnung`, `dokument-abgelaufen` | importiert, inaktiv (Import 4) | nein | in der Route (523 Z.) |
| `civil-service-deadlines` (PSI) | `psi-deadline-warning` | **vermutlich nie** | nein | in der Route (408 Z.) |
| `contract-end-reminders` | `contract-end-supervisor-reminder`, `-eskalation`, `-unbearbeitet` | **vermutlich nie** | nein | Route + `contract-end-reminder.ts` |
| `elternzeit-fristen` | `elternzeit-frist-eskaliert` | **vermutlich nie** | nein | in der Route |
| `bem-fristen` | **fest im Code** (`renderCredoEmail` + `sendEmailDetailed`), nicht in der Vorlagenverwaltung | **vermutlich nie** | nein | in der Route |
| `bem-aufbewahrung` (löscht BEM-Fälle samt Dateien) | – | **vermutlich nie** | **nein** | in der Route |
| `dokumente-aufbewahrung` (löscht erzeugte Dokumente) | – | **vermutlich nie** | ja | in der Route |

Dazu zwei Lücken ohne eigenen Lauf:

- **`EmailLog` 90 Tage** werden nur gelöscht, wenn jemand das Versandprotokoll öffnet
  (`src/app/api/settings/email-log/route.ts:34`) oder der `reminders`-Lauf kommt.
- **`offboarding-task-overdue`** steht im Katalog mit `wired: false` (`events.ts:1094`).

**Wichtigste Erkenntnis:** Sechs der zehn Läufe standen nach allem, was im Repo und in den
Deploy-Protokollen steht, nie in n8n. Ein Zeitplaner, der „alle Läufe“ startet, schaltet sie
zum ersten Mal scharf – mit Nachhol-Welle beim ersten Lauf und bei zweien mit **Löschung**.
Deshalb kommen alle Läufe **inaktiv** an und werden einzeln eingeschaltet (Abschnitt 7).

---

## 2 · Zielbild

```
Container-Start ─▶ instrumentation.ts register()  (nur Node-Runtime, nie im Build)
                     └▶ Zeitplaner: jede Minute ein Takt
                          └▶ je Lauf: fällig? (Uhrzeit Europe/Berlin, heute noch nicht gelaufen, aktiv)
                               └▶ Anspruch in der DB (bedingtes updateMany)  ── verloren → nichts tun
                                    └▶ laufAusfuehren(schluessel)  ◀── auch: Knopf „Jetzt ausführen“,
                                         │                               Cron-Route (Übergang/Notfall)
                                         ├▶ Lauf-Funktion aus src/lib (dieselbe wie heute)
                                         │     └▶ Mails wie bisher über triggerWebhooks/sendEventEmail
                                         ├▶ Protokollzeile (Bericht ohne Personendaten)
                                         └▶ Bericht auswerten → Event „automatischer-lauf-bericht“
                                               (nur bei Problemen oder Probelauf) → Vorlage → HR
```

Kein neuer Dienst, keine neue Abhängigkeit im Container: ein `setInterval` im Node-Prozess,
der Zustand liegt in PostgreSQL.

### 2.1 Grundsätze

1. **Eine Ausführungsfunktion für alle Auslöser.** `laufAusfuehren(schluessel, { ausloeser,
   probelauf, benutzerId? })` – Zeitplaner, Knopf im Portal und (während des Übergangs) die
   Cron-Route gehen durch dieselbe Tür. So kollidieren n8n und Portal im Übergang nicht, und
   jeder Lauf steht im selben Protokoll.
2. **Sperre und Tagesmerker in der Datenbank, nicht im Speicher.** Anspruch per
   `updateMany … WHERE schluessel = X AND (laeuftSeit IS NULL OR laeuftSeit < jetzt − 2 h)`;
   0 Treffer → läuft schon (Knopf/Route: 409). Der Tagesmerker `letzterLaufTag` (Berliner
   Kalendertag) wird im selben Schritt gesetzt. Das trägt auch bei einem Neustart mitten im Lauf
   und wäre sogar bei zwei Containern richtig – anders als die prozesslokalen Sperren, die es
   heute schon gibt (die bleiben zusätzlich bestehen).
3. **Nachholen am selben Tag, nicht über Tage.** War der Container um 08:00 gestoppt, läuft der
   Lauf beim nächsten Takt nach dem Start (solange es derselbe Kalendertag ist). Ausgefallene
   Vortage werden nicht einzeln nachgespielt – alle Läufe arbeiten zustandsbasiert (Merker,
   Abstände), der nächste Lauf holt Fälliges ohnehin nach.
4. **Berliner Zeit.** Der Container läuft in UTC. Fälligkeit wird aus `heuteInBerlin`/
   `berlinerKalendertag` (`src/lib/minijob-fristen.ts`) bzw. `kalendertag.ts` berechnet, die
   Uhrzeit über `Intl.DateTimeFormat(… timeZone: "Europe/Berlin")`. Sommer-/Winterzeit ist damit
   abgedeckt; eine Uhrzeit, die es am Umstellungstag nicht gibt (02:30), läuft zur nächsten
   vollen Minute – deshalb im Formular nur 05:00–22:00 zulassen.
5. **Not-Aus über die Umgebung.** `ZEITPLANER_AKTIV` (Standard: `true` in Produktion, `false`
   sonst). Die Entwicklungsumgebung verschickt so nie von selbst Mails gegen die Dev-DB. Im
   Build (`NEXT_PHASE === "phase-production-build"`) startet nichts.
6. **Kein Personendatum im Protokoll und im Bericht-Payload** – wie heute die Antworten von
   `unterlagen-fristen` und `dokument-ablauf`: Zähler, IDs, Vorgangsnummern, Schritt, Ergebnis.
   Adressen von Führungskräften/Abteilungen, die die heutigen Antworten von `reminders` und
   `offboarding-reminders` enthalten, kommen nicht ins Protokoll.

---

## 3 · Datenmodell (additiv, `db push` ohne Datenverlust)

```prisma
/// Ein automatischer Lauf und seine Einstellung (eine Zeile je Lauf, vom Seed-Check angelegt).
model AutomatischerLauf {
  schluessel      String    @id              // "reminders", "unterlagen-fristen", …
  aktiv           Boolean   @default(false)  // neue Läufe kommen IMMER aus an
  uhrzeit         String    @default("08:00") // "HH:MM", Europe/Berlin
  nurWerktags     Boolean   @default(false)
  probelauf       Boolean   @default(false)  // nur wo die Lauf-Funktion dryRun kann
  letzterLaufTag  DateTime? @db.Date          // Berliner Kalendertag des letzten Laufs (jeder Auslöser)
  laeuftSeit      DateTime?                   // Sperre; älter als 2 h = verwaist
  geaendertAm     DateTime  @updatedAt
  geaendertVonId  String?
  laeufe          AutomatischerLaufProtokoll[]
}

/// Ein einzelner Lauf. Aufbewahrung 90 Tage (Wartungslauf).
model AutomatischerLaufProtokoll {
  id          String   @id @default(uuid())
  schluessel  String
  lauf        AutomatischerLauf @relation(fields: [schluessel], references: [schluessel], onDelete: Cascade)
  ausloeser   String   // "ZEITPLAN" | "HAND" | "ROUTE"  (String statt Enum, siehe Paket 4 Regel 1)
  probelauf   Boolean
  gestartetAm DateTime @default(now())
  beendetAm   DateTime?
  ergebnis    String   // "OK" | "PROBLEME" | "FEHLER" | "LAEUFT"
  zaehler     Json     // nur Zahlen, z.B. { versendet: 3, nichtZugestellt: 1, errors: 0 }
  details     Json?    // gekürzt, ohne Personendaten (höchstens 200 Einträge)
  fehler      String?  // nur fehlerKennung(), nie Rohtext
  berichtMail String?  // SENT | FAILED | SKIPPED | null (kein Bericht nötig)
  benutzerId  String?
  @@index([schluessel, gestartetAm])
}
```

Der Seed-Check (`prisma/seed-check.js`) legt fehlende Zeilen mit `aktiv = false` an und ändert
vorhandene nie (wie die Abteilungen: gepflegte Einstellungen werden nicht überschrieben).

---

## 4 · Code-Bausteine

| Datei | Inhalt | Art |
|---|---|---|
| `src/lib/zeitplaner/faelligkeit.ts` | `laufFaellig(einstellung, jetzt)`, `berlinerUhrzeit(jetzt)`, `naechsterLauf(einstellung, jetzt)` | rein, ohne Uhr, voll getestet |
| `src/lib/zeitplaner/register.ts` | `LAEUFE`: je Schlüssel Name, Beschreibung, Standardzeit, `kannProbelauf`, `loescht`, `ausfuehren(ctx)`, `auswerten(ergebnis)` | Server |
| `src/lib/zeitplaner/bericht.ts` | Auswertung je Lauf (Portierung von `n8n/quelle/*-auswerten.js`): `{ problem, zaehler, zeilen[], schritte[] }` → Payload für die Berichtsmail | rein, getestet |
| `src/lib/zeitplaner/ausfuehren.ts` | `laufAusfuehren()`: Anspruch, Protokoll, Ausführung, Bericht, Freigabe im `finally` | Server |
| `src/lib/zeitplaner/takt.ts` | `zeitplanerStarten()`: `setInterval` 60 s, `unref()`, ein Takt nie doppelt (Flag), Fehler nur loggen | Server |
| `src/instrumentation.ts` | `register()`: nur `NEXT_RUNTIME === "nodejs"`, nicht im Build, nur bei `ZEITPLANER_AKTIV` → dynamischer Import von `takt.ts` | neu |
| `src/app/api/settings/automatische-laeufe/…` | `GET` Liste + Protokoll, `PATCH [schluessel]` (aktiv, Uhrzeit, werktags, Probelauf), `POST [schluessel]/ausfuehren` | `adminHandler` |

### 4.1 Lauf-Logik aus den Routen herauslösen

Fünf Routen tragen ihre Logik im Handler. Sie wandern unverändert in eine Funktion unter
`src/lib/`, die Route wird dünn (Anmeldung per `CRON_SECRET`, dann `laufAusfuehren(…, { ausloeser:
"ROUTE" })`) – genau das Muster, das `unterlagen-fristen` und `offboarding-reminders` schon haben.

| Route | Neue Funktion | Zusatz |
|---|---|---|
| `reminders` | `onboardingErinnerungenLauf()` in `src/lib/onboarding-erinnerungen-lauf.ts` | `EmailLog`-Aufräumen wandert in den Wartungslauf |
| `dokument-ablauf` | `dokumentAblaufLauf()` | – |
| `civil-service-deadlines` | `verbeamtungFristenLauf()` | – |
| `contract-end-reminders` | `vertragsendeErinnerungenLauf()` | – |
| `elternzeit-fristen` | `elternzeitFristenLauf()` | – |
| `bem-fristen` | `bemFristenLauf()` | Mail auf Vorlage umstellen (4.3) |
| `bem-aufbewahrung` | `bemAufbewahrungLauf({ dryRun })` | **`dryRun` neu – Pflicht**, weil der Lauf Art.-9-Daten endgültig löscht |
| `dokumente-aufbewahrung` | `dokumenteAufbewahrungLauf({ dryRun })` | hat `dryRun` schon |

Bestehende Tests der Routen (`src/__tests__/api/reminders-cron.test.ts` u. a.) laufen weiter
gegen die Route; neue Tests prüfen die Funktion direkt.

### 4.2 Neuer Wartungslauf `wartung` (03:30)

- `EmailLog` älter als 90 Tage löschen (bisher nur beim Öffnen des Protokolls).
- `AutomatischerLaufProtokoll` älter als 90 Tage löschen.
- Später erweiterbar (z. B. abgelaufene Magic-Link-Token), bewusst jetzt nicht.

### 4.3 BEM-Fristenmail in die Vorlagenverwaltung

Heute baut `bem-fristen` Betreff und Text im Code. Neu: Event `bem-frist-erinnerung` (Gruppe
„BEM“, Katalog in `events.ts`, Standardtext in `default-email-templates.ts`, wörtlich der
heutige Text). Versand **direkt über `sendEventEmail` mit `overrideTo`** je freigegebenem
Beauftragten – nicht über `triggerWebhooks`:

- Empfänger sind ausschließlich die im Fall freigegebenen Beauftragten; ein Verteiler in der
  Vorlage (An/CC/BCC) darf nie greifen – `overrideTo` verwirft ihn.
- Ein BEM-Fall ist die „versiegelte Akte“; Fallnummer und Fristart gehören an keine frei
  konfigurierbare Webhook-URL.

Das ist die **dritte begründete Ausnahme** vom Dispatcher-Gebot. Sie kommt in CLAUDE.md
(„E-Mail-Versand“) und in `EVENTS_OHNE_WEBHOOK` (`src/lib/ereignis-liste.ts`); der Test
`ereignis-liste.test.ts` bekommt den neuen Quelltext dazu. Die Kommunikationszeile
(`logBemKommunikation`) bleibt. `betreffOhne` sperrt nichts Zusätzliches (der Betreff trägt
schon heute nur die Fallnummer).

Die übrigen BEM-Mails (Einladung, Einwilligung, Widerruf) und die Konto-Mails
(`users/…/setup-link`) sind ebenfalls fest im Code. Sie sind keine Erinnerungen und gehören
**nicht** zu diesem Plan – eigener Punkt, falls gewünscht.

### 4.4 Berichtsmail als Vorlage (ersetzt den Outlook-Knoten)

Neues Event **`automatischer-lauf-bericht`** (Gruppe „System“, `wired: true`), Versand über
`triggerWebhooks` (der Payload trägt keine Personendaten, also darf er an Webhooks).

| Variable | Inhalt |
|---|---|
| `lauf_name` | „Onboarding-Erinnerungen“, „Unterlagen-Fristen“, … |
| `datum` | TT.MM.JJJJ (Berlin, `formatDatumDE`) |
| `ergebnis` | „ohne Befund“ / „bitte prüfen“ / „fehlgeschlagen“ |
| `ist_probelauf`, `hat_probleme`, `ist_fehler` | Merker als `"ja"`/`""` (`renderTemplate` kennt nur „nicht leer“) |
| `tabelle_html` | fertige Zähler-Tabelle (wie `warnungen_liste_html`, wird nicht maskiert – nur aus Zahlen und festen Texten gebaut) |
| `schritte_text` | Einzelschritte als Text („2 × Erinnerung · versendet“) |
| `hinweis` | fester Handlungshinweis je Lauf (aus den n8n-Auswertungen übernommen) |
| `portal_link` | `/einstellungen?tab=laeufe&lauf=<schluessel>` |

- **Empfänger** stehen in der Vorlage (`recipientTo`), Katalog-Default
  `personalbuchhaltung@fes-minden.de` wie in den n8n-Workflows – änderbar unter
  E-Mail-Vorlagen, CC z. B. für die IT.
- **Wann:** bei Problemen (`errors`, `nichtZugestellt`, `mailUebersprungen`, Löschfehler),
  bei jedem Probelauf und wenn der Lauf selbst scheitert. Bei `reminders`/`offboarding-
  reminders` zusätzlich, sobald Erinnerungen hinausgingen (wie heute Import 1/2) – über einen
  Schalter „Bericht auch bei Erfolg“ je Lauf abschaltbar.
- **Betreff ohne Personendaten** (wie heute): „HR-Portal: {{lauf_name}} – {{datum}} …“.
  `betreffOhne` sperrt `tabelle_html` und `schritte_text`.
- Scheitert die Berichtsmail, steht das im Protokoll (`berichtMail = FAILED`) und im Wächter.

### 4.5 Wächter („Lauf erreicht das Portal nicht“)

Bisher meldete n8n einen ausgefallenen HTTP-Aufruf. Jetzt kann der Zeitplaner selbst stehen
(z. B. `ZEITPLANER_AKTIV=false` vergessen, `register()` nicht geladen). Deshalb:

- Einstellungen → Versand-Status: rote Zeile, wenn ein **aktiver** Lauf seit mehr als 26 h
  kein Protokoll hat, oder der letzte Lauf `FEHLER` war.
- Der vorhandene `laufWaechter` der Karte „Unterlagen nachfordern“ (Paket 4) liest künftig
  das Protokoll statt nur aus den Merkern zu schließen.
- Health-Check `GET /api/health` meldet `zeitplaner: { aktiv, letzterTakt }` (ohne Details).

---

## 5 · Oberfläche: Einstellungen → „Automatische Läufe“ (neuer Reiter)

Nur `ADMIN`/`SUPER_ADMIN`. Eine Zeile je Lauf:

| Spalte | Inhalt |
|---|---|
| Lauf | Name + ein Satz, was er tut, welche Vorlagen er nutzt (Link zur Vorlage) |
| Aktiv | Schalter (Rückfrage beim ersten Einschalten: „Der erste Lauf verschickt alle fälligen Erinnerungen auf einmal“ bzw. bei Löschläufen „… löscht endgültig“) |
| Uhrzeit / werktags | Eingabe HH:MM (05:00–22:00), Häkchen „nur Mo–Fr“ |
| Probelauf | Schalter, nur wo der Lauf ihn kann; Pflicht beim ersten Einschalten eines Löschlaufs |
| Letzter Lauf | Zeit, Auslöser, Ampel, Kurzzahlen; aufklappbar: Protokoll der letzten 30 Läufe mit Einzelschritten |
| Nächster Lauf | berechnet aus `naechsterLauf()` |
| Aktion | „Jetzt ausführen“ (Rückfrage; bei Läufen mit Probelauf zusätzlich „Probelauf jetzt“) |

Jede Änderung schreibt ein AuditLog (`ZEITPLANER_GEAENDERT`, `ZEITPLANER_HAND_AUSGEFUEHRT`,
Details nur Schlüssel und Felder). Texte, Ampeln und erlaubte Aktionen kommen fertig vom Server
(wie `uebersichtBauen` in Paket 4) – die Seite rechnet nichts selbst.

---

## 6 · Betroffene Mail-Vorlagen (vollständig)

| Vorlage | Änderung | Handschritt nach dem Deploy |
|---|---|---|
| `automatischer-lauf-bericht` | **neu** | An-Feld prüfen (Default Personalbuchhaltung), ggf. CC IT |
| `bem-frist-erinnerung` | **neu** (Text wie bisher im Code) | keiner; An-Feld wird ignoriert (`overrideTo`) |
| `employee-reminder`, `supervisor-reminder`, `onboarding-department-reminder`, `offboarding-reminder` | unverändert; laufen ab jetzt über den Zeitplaner | keiner |
| `unterlagen-erinnerung`, `unterlagen-frist-verstrichen`, `unterlagen-vollstaendig` | unverändert | keiner |
| `dokument-ablauf-warnung`, `dokument-abgelaufen` | unverändert | An-Feld muss gesetzt sein (steht schon im Deploy-Plan Paket 4, 5.1) |
| `psi-deadline-warning`, `elternzeit-frist-eskaliert`, `contract-end-eskalation`, `contract-end-unbearbeitet` | unverändert, **feuern zum ersten Mal**, sobald ihr Lauf aktiv ist | **An-Feld prüfen** (HR-intern, Versand-Status zeigt „Kein Empfänger“), Text einmal lesen |
| `contract-end-supervisor-reminder` | unverändert, erstmals automatisch | Text lesen |
| `offboarding-task-overdue` | bleibt `wired: false` (eigener Punkt, nicht Teil dieses Plans) | – |

Word-Vorlagen sind nicht betroffen.

---

## 7 · Umsetzung in Paketen

| Paket | Inhalt | Umfang (grob) |
|---|---|---|
| **Z1 Kern** | Schema (3), `faelligkeit.ts` + Tests, Register, `laufAusfuehren` mit DB-Anspruch, Takt, `instrumentation.ts`, Seed-Check legt Zeilen inaktiv an, `ZEITPLANER_AKTIV`; zunächst nur die vier Läufe, deren Logik schon in `src/lib` liegt oder leicht herauszulösen ist: `unterlagen-fristen`, `offboarding-reminders`, `reminders`, `dokument-ablauf`; Routen gehen durch `laufAusfuehren` | 1 Sitzung |
| **Z2 Bericht + Oberfläche** | Event `automatischer-lauf-bericht` + Vorlage, Auswertungen (Portierung der vier n8n-Code-Knoten, Tests gegen dieselben Fälle wie `n8n/quelle/testen.js`), Reiter „Automatische Läufe“, Wächter, Health-Check | 1 Sitzung |
| **Z3 Übrige Läufe** | Herauslösen von PSI, Vertragsende, Elternzeit, BEM-Fristen, BEM- und Dokumente-Aufbewahrung; `dryRun` für `bem-aufbewahrung`; BEM-Mail als Vorlage (4.3); Wartungslauf | 1 Sitzung |
| **Z4 Abschluss** | CLAUDE.md-Abschnitt „Automatische Läufe“ (Regeln aus 2.1, dritte Dispatcher-Ausnahme), HR-Handbuch-Seite, Code-Review, `credo-check`/`edge-cases` | ½ Sitzung |

Jedes Paket ist für sich deploybar: Die Läufe kommen inaktiv an, n8n läuft unverändert weiter,
bis ein Lauf im Portal eingeschaltet wird.

---

## 8 · Einführung ohne n8n (Entscheidung 30.09.2026)

n8n wird **nicht** mehr umgestellt (V-2 entfällt), auch nicht als Brücke. Der Deploy von Paket 4
wartet stattdessen auf diesen Zeitplaner und geht mit ihm zusammen hinaus.

1. **Vor dem Deploy in n8n:** die beiden alten Workflows („CREDO HR-Portal — Tägliche
   Erinnerungen“, „… Offboarding-Erinnerungen“) und die vier am 29.09. importierten (alle
   inaktiv) **deaktiviert lassen bzw. löschen**, das Credential „HR-Portal Cron (Bearer)“
   löschen. Läuft doch noch einer, schadet es nicht: Die Cron-Routen gehen durch denselben
   Anspruch wie der Zeitplaner (409, solange ein Lauf arbeitet; Protokoll mit Auslöser
   „Cron-Route“).
2. **Deploy.** Alle Läufe stehen auf „aus“; der Start verschickt nichts. `GET /api/health`
   zeigt `zeitplaner.uhrAktiv: true`, spätestens nach einer Minute auch `letzterTakt`.
3. **Vorlagen prüfen** (Abschnitt 6): An-Felder der HR-internen Vorlagen, dazu die neue Vorlage
   „Bericht eines automatischen Laufs“ (An = HR-Postfach aus den SMTP-Einstellungen, V-6).
4. **Einschalten, einzeln, an einem Werktag** — HR vorher informieren:
   - „Wartung“, „BEM-Aufbewahrung“, „Aufbewahrung erzeugter Dokumente“, „Unterlagen-Fristen“:
     zuerst **„Probelauf jetzt“**, Ergebnis prüfen (bei BEM mit den Beauftragten), dann als
     Probelauf oder scharf einschalten (scharf geht erst nach einem Probelauf).
   - „Onboarding-Erinnerungen“, „Offboarding-Erinnerungen“: der erste Lauf verschickt alles
     Fällige auf einmal (am 24.09. waren es fünf Onboarding-Erinnerungen).
   - „Ablauf befristeter Nachweise“: erst nach 5.1 des Paket-4-Ablaufplans (Reset der Vorlagen).
   - Verbeamtung, Vertragsende, Elternzeit, BEM-Fristen: waren nie eingeplant — Texte lesen,
     An-Felder prüfen, dann einschalten.
5. **Später optional:** Cron-Routen entfernen, sobald niemand sie mehr braucht (dann entfällt
   `CRON_SECRET` als Pflichtvariable).

---

## 9 · Risiken und Gegenmittel

| Risiko | Gegenmittel |
|---|---|
| Container steht → keine Läufe, niemand merkt es (früher: n8n-Fehlermail) | Wächter im Portal (4.5) + Nachholen am selben Tag; zusätzlich kann die IT den Health-Check von außen überwachen. Ehrlich: Steht der Container ganz, kann das Portal selbst nicht mailen – das ist der einzige Punkt, den ein externer Wecker besser konnte. |
| Ein vergessener n8n-Workflow ruft weiter eine Cron-Route | gemeinsame DB-Sperre + Protokoll (Auslöser „Cron-Route“); alle Läufe sind über Merker zusätzlich wiederholungsfest |
| Erster Lauf eines nie eingeplanten Laufs verschickt einen Schwall | alle Läufe kommen aus; Rückfrage beim Einschalten; Probelauf wo möglich |
| Lauf blockiert Anfragen | Mails sind asynchrones I/O; lange Läufe (bis 300 s bei Unterlagen) laufen im Hintergrund, Takt überspringt, solange einer läuft |
| Neustart mitten im Lauf | Sperre verwaist nach 2 h; Läufe sind über Merker wiederholungsfest (bestehende Regeln „Merker bei SENT und SKIPPED, bei FAILED nicht“) |
| Dev-Rechner verschickt Mails | `ZEITPLANER_AKTIV` standardmäßig aus außerhalb von Produktion |
| Waagerechtes Skalieren | DB-Anspruch trägt schon; die übrigen prozesslokalen Sperren wie bisher (CLAUDE.md) |

---

## 10 · Entscheidungen (30.09.2026)

1. **Keine n8n-Umstellung, auch nicht als Brücke** — alles nur über das Portal.
2. **Berichtsmail:** nur bei Problemen, Fehlern und Probeläufen (Empfehlung übernommen, keine
   Rückmeldung); je Lauf zuschaltbar „Bericht auch, wenn Mails hinausgingen“.
3. **Die sechs nie eingeplanten Läufe gleich mit einführen** — ja.
4. **BEM-Fristenmail als Vorlage** — ja, als dritte begründete Dispatcher-Ausnahme.
5. **Einstellen dürfen Admins** (`SUPER_ADMIN`, `HR_LEITUNG` = `ADMIN_ROLES`).

---

## 11 · Umsetzung (30.09.2026, Z1–Z3 in einem Zug)

Abweichungen vom Plan oben:

- **Die Uhr ruft eine Route statt der Läufe direkt** (`uhr.ts` → `POST /api/zeitplaner/takt`,
  Geheimnis nur im Speicher). Next.js bündelt `instrumentation.ts` getrennt von den Routen; ein
  direkter Aufruf hätte jedes Modul zweimal geladen — zweiter PrismaClient und zweite Exemplare
  der prozesslokalen Sperren (z. B. `laufendeUnterlagenAktionen`). `uhr.ts` importiert auch
  kein `crypto` (Edge-Bündel, Web Crypto statt dessen). Geprüft am gebauten Server: Uhr startet,
  Takt erreicht die Route, von außen 404.
- **Kein Seed-Check-Eintrag:** Die Zeilen legt `laeufeSicherstellen` bei jedem Zugriff an
  (`createMany … skipDuplicates`, immer aus) — keine zweite JS-Kopie des Katalogs.
- **Tagesmerker als String** `tagErledigt` (`YYYY-MM-DD`, Berliner Tag) statt `@db.Date`.
- **Wächter** über `laufAusgeblieben` (letzter Termin + 60 min, Werktage beachtet) statt „26 h
  ohne Protokoll“ — sonst Fehlalarm am Wochenende bei „nur Mo–Fr“.
- **BEM-Betreff ohne Fallnummer** („BEM: Frist(en) fällig“): `sendEventEmail` schreibt den Betreff
  90 Tage ins allgemeine Versandprotokoll, das nicht nur BEM-Beauftragte sehen. Der Text der Mail
  nennt die Fallnummer weiter.
- **Verbeamtung und Elternzeit** warten das Mailergebnis jetzt ab (vorher fire-and-forget), damit
  der Bericht nicht Zugestelltes melden kann.
- Der **Lauf-Wächter der Karte „Unterlagen nachfordern“** (`laufWaechter`) liest weiter die Merker,
  nicht das neue Protokoll — reicht, weil beide dasselbe anzeigen; Umbau nur bei Bedarf.
- **Offen:** HR-Handbuch-Seite „Automatische Läufe“; Browserprobe des Reiters gegen die
  Entwicklungsdatenbank (am 30.09. lief Docker lokal nicht).

---

## 12 · Nachtrag 30.09.2026: Reiter „E-Mails“ und Code-Review

- **Reiter „E-Mails“ je Vorgang** (Wunsch des Nutzers): `EmailLog.vorgangTyp`/`vorgangId`,
  gesetzt in `sendEventEmail` aus dem Payload (`src/lib/vorgangs-mails.ts`), Reiter in sechs
  Modulen, nur HR-Rollen, BEM bewusst ausgenommen.
- **Code-Review mit zehn Befunden, alle behoben.** Die wichtigsten:
  - Ein eingeplanter Probelauf lief jede Minute neu.
  - Eine verwaiste Sperre ließ die Karte dauerhaft auf „läuft“ stehen.
  - Die Probelauf-Pflicht ließ sich über „Jetzt ausführen“ umgehen.
  - Die BEM-Stufe wurde vor dem Versand gespeichert.
- **Stand, Prüfungen, Ansehen im Docker und offene Punkte:**
  `docs/historie/zeitplaner-und-mailprotokoll-uebergabe.md`.
