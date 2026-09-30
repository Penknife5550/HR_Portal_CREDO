# Zeitplaner und Mailprotokoll je Vorgang — Übergabe

> **Stand:** 30.09.2026, vor einem Neustart des Rechners.
> Alles liegt **nur im Arbeitsbaum** (nicht committet, nicht gepusht, nicht deployt).
> Letzter Commit auf `main`: `d05c088` (Paket 4 – Abendstand 29.09.).
> **Nächster Schritt:** Nach dem Neustart gemeinsam im Docker ansehen (Abschnitt 3), danach
> committen (Abschnitt 5).

Maßgebliche Dokumente:

| Dokument | Inhalt |
|---|---|
| `docs/module/betrieb/zeitplaner-plan.md` | Plan, Befund, Entscheidungen (Abschnitt 10), Einführung ohne n8n (Abschnitt 8), Abweichungen (Abschnitte 11 und 12) |
| `CLAUDE.md`, Abschnitt „Automatische Läufe (Zeitplaner, 09/2026)“ | die acht Regeln, die beim Ändern gelten |
| `CLAUDE.md`, Abschnitt „E-Mail-Versand“, Punkt „Mailprotokoll je Vorgang“ | Regeln des Reiters „E-Mails“ |
| diese Datei | Stand, Prüfungen, Ansehen im Docker, offene Punkte |

---

## 1 · Was umgesetzt ist

### 1.1 Zeitplaner im Portal (statt n8n)

Entscheidungen des Nutzers vom 30.09.2026:

- **n8n wird nicht umgestellt**, auch nicht als Brücke; V-2 aus Paket 4 entfällt.
- Die sechs bisher nie eingeplanten Läufe kommen gleich mit.
- Die BEM-Fristenmail wird eine Vorlage.
- Einstellen dürfen nur Admins.
- Die Berichtsmail geht nur bei Problemen, Fehlern und Probeläufen (Empfehlung übernommen).

- **Uhr:** `src/instrumentation.ts` startet `src/lib/zeitplaner/uhr.ts`. Die Uhr ruft jede Minute
  `POST /api/zeitplaner/takt` im selben Prozess auf. Die Route ist mit einem Geheimnis gesichert,
  das nur im Speicher liegt; ohne es antwortet sie mit 404. Schalter: `ZEITPLANER_AKTIV`, Standard
  an in Produktion, aus in der Entwicklung.
- **Elf Läufe** (`src/lib/zeitplaner/katalog.ts`): Wartung, BEM-Aufbewahrung, Aufbewahrung
  erzeugter Dokumente, Unterlagen-Fristen, Ablauf befristeter Nachweise, Onboarding- und
  Offboarding-Erinnerungen, Verbeamtungs-Fristen, Vertragsende-Erinnerungen, Elternzeit-Fristen,
  BEM-Fristen. Die Logik liegt in `src/lib/laeufe/*.ts`; die Cron-Routen unter `/api/cron/*`
  sind nur noch dünne Hüllen für den Handaufruf mit `CRON_SECRET`.
- **Datenbank:** Neue Tabellen `automatische_laeufe` und `automatische_lauf_protokolle`. Rein
  additiv; `db push` ohne Datenverlust.
- **Oberfläche:** Neuer Reiter unter Einstellungen → „Automatische Läufe“. Er bietet:
  - Ein/Aus, Uhrzeit, „nur Mo–Fr“, „als Probelauf“ und „Bericht auch, wenn Mails hinausgingen“
  - „Probelauf jetzt“ und „Jetzt ausführen“
  - das Protokoll der letzten Läufe
  - eine rote Warnung, wenn ein eingeschalteter Lauf ausgeblieben ist
- **Neue Mail-Vorlagen:**
  - `automatischer-lauf-bericht` (Gruppe „System“, An: `{{hr_postfach}}`)
  - `bem-frist-erinnerung` (Gruppe „BEM“): Text wie bisher im Code, Betreff ohne Fallnummer.
    Sie geht direkt nur an die im Fall freigegebenen Beauftragten; das ist die dritte begründete
    Ausnahme vom Dispatcher-Gebot.
- **Health-Check:** `GET /api/health` meldet zusätzlich `zeitplaner.uhrAktiv` und `letzterTakt`.

### 1.2 Reiter „E-Mails“ in jedem Vorgang

- Das Versandprotokoll (`EmailLog`) hat zwei neue Spalten, `vorgangTyp` und `vorgangId`.
  `sendEventEmail` füllt sie aus dem Payload (`src/lib/vorgangs-mails.ts`); beim Dokumentenpaket
  wird der Vorgang ausdrücklich mitgegeben. BEM und Test-Versand bekommen nie einen Vorgang.
- Der Reiter „E-Mails“ steht in Onboarding, Offboarding, Verbeamtung, Vertragsende, Elternzeit
  und Mutterschutz. Er zeigt Zeitpunkt, Art der Mail, Status, Betreff, An/CC/BCC, bei Problemen
  den Grund und beim Dokumentenpaket die Anhänge. Sichtbar ist er nur für HR-Rollen
  (`HR_EDIT_ROLES`).
- Datenquelle ist `GET /api/vorgaenge/[modul]/[id]/mails`; die Oberfläche liegt in
  `src/components/vorgangs-mails/mail-protokoll.tsx`.
- Sammelmails über mehrere Vorgänge (Verbeamtungs-Fristen, „unbearbeitete Vertragsenden“,
  Laufberichte) erscheinen nicht im Reiter. Einträge werden nach 90 Tagen gelöscht, und Mails
  von vor dem Deploy tragen keinen Vorgang.

### 1.3 Code-Review (10 Befunde, alle behoben)

1. Ein eingeplanter Probelauf lief jede Minute neu. Jetzt erledigt er den Tag.
2. Eine verwaiste Sperre ließ die Karte dauerhaft auf „läuft“ stehen. Nach 2 Stunden gilt sie als
   verwaist, hängende Protokollzeilen heißen „abgebrochen“ und werden geschlossen.
3. Die Probelauf-Pflicht für Löschläufe prüft der Server jetzt auch beim Abwählen von
   „als Probelauf“ und bei „Jetzt ausführen“.
4. Die BEM-Stufe wird erst nach dem Versand gespeichert; bei einem Fehlschlag oder ohne
   Beauftragte versucht es der nächste Lauf erneut.
5. Die Protokolle werden je Lauf geladen, sodass kein Lauf die anderen verdrängt.
6. Die Auswertung meldet fehlende Felder („Antwort unvollständig“), statt still 0 zu zählen.
7. Es gibt keine doppelten Hilfsfunktionen mehr (`escapeHtml`, `formatZeitpunktDE`).
8. Einstellungszeilen werden nur noch angelegt, wenn welche fehlen; Probeläufe werden in einer
   einzigen Abfrage gezählt.
9. Das Versandprotokoll wird an einer Stelle aufgeräumt (`src/lib/email-log-aufbewahrung.ts`).
   Das übernimmt die Wartung, und beim Öffnen des Protokolls höchstens einmal am Tag. Der
   Onboarding-Lauf löscht nicht mehr mit.
10. Der Hinweistext im Reiter „E-Mails“ nennt keinen festen Monat mehr.

---

## 2 · Was geprüft ist und was nicht

| Prüfung | Ergebnis |
|---|---|
| `npx jest` (alle) | **4454 Tests grün**, 173 Suites |
| `npx tsc --noEmit` | sauber |
| ESLint auf allen geänderten Dateien | sauber |
| `npm run build` | grün. Die Warnung zu `jose` in der Edge-Laufzeit gab es schon vorher. |
| Gebauter Server (`node .next/standalone/…/server.js`, ohne Datenbank) | Die Uhr startet und tickt jede Minute. Die Takt-Route nimmt das Geheimnis an und scheitert erst an der fehlenden Datenbank. Von außen antwortet sie mit 404. |
| **Browser (Reiter „Automatische Läufe“ und „E-Mails“)** | **noch nicht angesehen**: Docker lief nicht, die Entwicklungsdatenbank war nicht erreichbar |

**Hinweis zum Build:** Zweimal scheiterte `npm run build` mit
`EINVAL: invalid argument, readlink '…\.next\server\chunks'`. Vermutlich synchronisiert OneDrive
den Ordner `.next`. Abhilfe: `.next` löschen und neu bauen. Das ist kein Codefehler.

---

## 3 · Nach dem Neustart: im Docker ansehen

### 3.1 Container starten

1. Docker Desktop starten und warten, bis es läuft.
2. Prüfen, welche Container da sind:
   ```bash
   docker ps -a --format "{{.Names}} {{.Status}}"
   ```
3. Die Entwicklungsdatenbank und den PDF-Dienst starten (Namen laut Speicher; auf dem Rechner
   laufen weitere CREDO-Container, bitte nicht verwechseln):
   ```bash
   docker start credo-hr-db-dev credo-gotenberg-dev
   ```

### 3.2 Schema in die Entwicklungsdatenbank

Prisma liest nur `.env`, die richtige Adresse (Port **5433**) steht aber in `.env.local`:

```bash
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')"
```

```bash
npx prisma db push --skip-generate
```

Erwartet werden die zwei neuen Tabellen, zwei neue Spalten und ein Index am Versandprotokoll.
**Nennt `db push` einen Datenverlust, abbrechen und Claude fragen.**

### 3.3 Portal starten

- Entwicklungsserver: `npm run dev` oder über Claude (Vorschau `credo-hr-dev`, Port 3000).
- Anmelden als Admin. Ein neues Passwort für die Entwicklungsdatenbank erzeugt
  `node scripts/dev-passwort-neu.js <email>`.
- **Die Uhr ist in der Entwicklung aus** (`ZEITPLANER_AKTIV` nicht gesetzt). Das ist gewollt:
  „Probelauf jetzt“ und „Jetzt ausführen“ funktionieren trotzdem, und der Reiter zeigt oben
  „Die Uhr … läuft in diesem Portal nicht“.
- Wer die Uhr lokal sehen will, setzt in `.env.local` `ZEITPLANER_AKTIV=true` und startet neu.
  Hört `next dev` nicht auf 127.0.0.1, zusätzlich `ZEITPLANER_BASIS_URL=http://localhost:3000`
  setzen. **Vorsicht:** Mit eingeschalteten Läufen und konfiguriertem SMTP verschickt dann auch
  die Entwicklung echte Mails.

### 3.4 Was ansehen

1. **Einstellungen → Automatische Läufe**
   - Elf Karten, alle „aus“. Die Löschläufe zeigen den gelben Hinweis, dass zuerst ein
     Probelauf nötig ist.
   - Bei „Wartung“ **„Probelauf jetzt“**: Die Karte zeigt kurz „läuft gerade…“, dann erscheint
     ein Protokolleintrag „Probelauf“ mit Zählern. Die Berichtsmail wird versucht; ohne
     HR-Postfach steht sie auf „übersprungen“.
   - Bei „BEM-Aufbewahrung“ **„Jetzt ausführen“**: Der Knopf ist gesperrt, und der Server würde
     mit 409 antworten.
   - „Einschalten“ bei „Onboarding-Erinnerungen“: Es kommt eine Rückfrage, danach „Nächster Lauf:
     morgen 08:00“ (wenn es schon nach 08:00 ist). **Danach wieder ausschalten.**
2. **Einstellungen → E-Mail-Vorlagen und Versand-Status:** die neuen Gruppen „BEM“ und „System“
   mit „BEM: Frist fällig (Beauftragte)“ und „Bericht eines automatischen Laufs“. Der Kasten
   „BEM (versiegelte Akte)“ im Versand-Status nennt die Ausnahme.
3. **Vorgang öffnen → Reiter „E-Mails“** (Onboarding, Offboarding, Verbeamtung, Vertragsende,
   Elternzeit, Mutterschutz)
   - Zunächst leer, denn nur Mails ab jetzt tragen den Vorgang.
   - Zum Füllen eine Mail auslösen, z. B. im Onboarding „Vorgesetzten-Link erstellen“ mit eigener
     Adresse oder einen neuen Vorgang anlegen.
   - Ohne SMTP in der Entwicklung erscheint die Zeile mit „fehlgeschlagen“ bzw. „nicht versendet“
     und Grund; das zeigt die Anzeige ebenso gut.
4. **Einrichtungsleitung/Führungskraft:** Diese Rollen sehen den Reiter „E-Mails“ nicht.

### 3.5 Optional: das Ganze als Container (wie auf dem Server)

`docker-compose.yml` ist für den Server gebaut: externes Netz `reverse_proxy`, kein
freigegebener Port, `.env` mit allen Geheimnissen, `./backups` mit Eigentümer 1001. Lokal wäre
dafür eine eigene Probe-Konfiguration nötig. Das machen wir bei Bedarf gemeinsam nach dem
Ansehen im Entwicklungsserver.

---

## 4 · Betroffene Mail-Vorlagen

| Vorlage | Änderung | Nach dem Deploy |
|---|---|---|
| `automatischer-lauf-bericht` | **neu** | An-Feld prüfen (Standard: HR-Postfach = Antwortadresse unter SMTP) |
| `bem-frist-erinnerung` | **neu**, Text wie bisher im Code, Betreff ohne Fallnummer | keiner. An/CC/BCC werden ignoriert, die Mail geht nur an freigegebene Beauftragte. |
| `psi-deadline-warning`, `elternzeit-frist-eskaliert`, `contract-end-eskalation`, `contract-end-unbearbeitet`, `contract-end-supervisor-reminder` | Text unverändert. Sie **gehen zum ersten Mal automatisch hinaus**, sobald ihr Lauf eingeschaltet ist. | An-Feld und Text vor dem Einschalten prüfen |
| `dokument-ablauf-warnung`, `dokument-abgelaufen` | unverändert | An-Feld (Paket-4-Ablaufplan 5.1) |
| alle übrigen | unverändert | — |

Word-Vorlagen sind nicht betroffen.

---

## 5 · Offene Punkte (Reihenfolge)

1. **Ansehen im Docker** (Abschnitt 3), gefundene Fehler beheben.
2. **Commit:** Vorschlag sind drei Commits auf `main`:
   - Zeitplaner mit Läufen, Reiter und Vorlagen
   - Reiter „E-Mails“ je Vorgang
   - Code-Review-Korrekturen

   Dazu die Doku. `docs/README.md` und `docs/module/ux-ui/` sind **eigene, ältere Änderungen des
   Nutzers** und gehören nicht dazu. **Pushen nur mit ausdrücklicher Freigabe** (das Repo ist
   öffentlich).
3. **n8n:** Die zwei alten Workflows und die vier am 29.09. importierten (alle inaktiv) löschen,
   dazu die Zugangsdaten „HR-Portal Cron (Bearer)“.
4. **Deploy zusammen mit Paket 4**:
   - Ablauf nach `docs/historie/deploy-paket4-stufe1.md`; dessen Abschnitt 6 (n8n) ist abgelöst.
   - Danach die Läufe einzeln einschalten nach Abschnitt 8 in `zeitplaner-plan.md`: zuerst die
     Vorlagen und An-Felder prüfen, Löschläufe erst nach „Probelauf jetzt“, HR vorher
     informieren.
   - Der Entrypoint sichert vor dem Schema-Abgleich automatisch; die Schemaänderung ist rein
     additiv.
5. **HR-Handbuch:** je eine Seite „Automatische Läufe“ und „E-Mails im Vorgang“.
6. **Später, optional:** Die Cron-Routen entfernen, sobald niemand sie mehr braucht; dann entfällt
   `CRON_SECRET`.

---

## 6 · Geänderte und neue Dateien

**Neu:**
- `src/instrumentation.ts`
- `src/lib/zeitplaner/` (katalog, faelligkeit, bericht, ausfuehren, dienst, uhr)
- `src/lib/laeufe/` (die elf Lauf-Funktionen, `lauf-ergebnis.ts`, `cron-anmeldung.ts`)
- `src/lib/vorgangs-mails.ts`, `src/lib/email-log-aufbewahrung.ts`,
  `src/lib/validations/zeitplaner.ts`
- `src/app/api/zeitplaner/takt/`, `src/app/api/settings/automatische-laeufe/…`,
  `src/app/api/vorgaenge/[modul]/[id]/mails/`
- `src/components/zeitplaner/automatische-laeufe-tab.tsx`,
  `src/components/vorgangs-mails/mail-protokoll.tsx`
- Tests: `zeitplaner.test.ts`, `zeitplaner-ausfuehren.test.ts`, `vorgangs-mails.test.ts`,
  `bem-fristen-lauf.test.ts`, `api/vorgangs-mails-route.test.ts`
- Doku: `docs/module/betrieb/zeitplaner-plan.md`, diese Datei

**Geändert:**
- `prisma/schema.prisma`
- `src/lib/mailer.ts`, `events.ts`, `default-email-templates.ts`, `ereignis-liste.ts`,
  `dokumentenpaket.ts`, `format.ts`
- alle zehn Routen unter `src/app/api/cron/*`
- `src/app/api/health`, `src/app/api/settings/email-log`
- die sechs Vorgangs-Detailseiten und die Einstellungsseite
- bestehende Tests der Cron-Routen, `email-dispatch.test.ts`, `ereignis-liste.test.ts`
- `CLAUDE.md`, `.env.production.example`
- `docs/historie/deploy-paket4-stufe1.md` (Abschnitt 6 abgelöst),
  `docs/historie/paket4-stufe1-uebergabe.md` (Abschnitt 0, Hinweis)
