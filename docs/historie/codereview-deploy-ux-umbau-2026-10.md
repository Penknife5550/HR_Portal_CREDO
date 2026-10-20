# Prüfprotokoll Ablaufplan „Server-Update UX-Umbau“ — Oktober 2026

> **Stand:** 19.10.2026 · Zweig `ux-umbau`, Code-Stand `7d595e5` · Gegenstand:
> [`deploy-ux-umbau-2026-10.md`](deploy-ux-umbau-2026-10.md)
> **Grundlage:** Ausgangsstand auf dem Server nach Etappe 1 von S0 = `0e1d8de`
> ([`deploy-selfservice-s0-2026-10.md`](deploy-selfservice-s0-2026-10.md)); Vorlage für Gliederung und
> Befehle ist derselbe Plan samt seinem Prüfprotokoll
> ([`codereview-deploy-selfservice-s0-2026-10.md`](codereview-deploy-selfservice-s0-2026-10.md)).
> **Geprüft wurde das Dokument, dazu eine Generalprobe auf dem Entwicklerrechner.** Auf dem Server lief
> nichts; der Plan ist am 19.10.2026 noch nicht ausführbar (Platzhalter aus Etappe 1, Kopf des Plans).

Dieses Dokument hält fest, wie der Ablaufplan vor dem Commit geprüft wurde: was die Generalprobe
gemessen hat, welche Befunde die Prüfer meldeten, was die Gegenprüfung daraus machte und was im Plan
geändert wurde. Was am Deploy-Tag zu tun ist, steht im Ablaufplan.

---

## Überblick

### Runden

| Runde | Gegenstand | Prüfer (Blickwinkel) | Befunde W / k | Ergebnis |
|---|---|---|---|---|
| 0 | Generalprobe mit beiden Images (19.10.2026) | — | — | alle als „gemessen“ markierten Werte bestätigt; eine Abweichung (relative Weiterleitungsziele), eingearbeitet |
| 1 | Entwurf vom 19.10.2026 | 3: Betrieb und Befehle (13); Schema, Daten, Rückfall (8); HR, Mails, Datenschutz, Doku (14) | 35: 4 / 31 | je Befund eine adversariale Gegenprüfung (9 Gegenprüfer): 19 bestätigt, 10 teilweise (Vorschlag angepasst), 2 bei der Gegenprüfung schon erledigt, 2 durch die Generalprobe erledigt, 2 ohne eigene Gegenprüfung (Duplikat, fehlende Datei); alle umgesetzt, Teilvorschläge mit Grund verworfen (unten); kein Befund offen |
| 2 | überarbeiteter Plan (nach Runde 1, an über 50 Stellen geändert) | 3: innere Konsistenz; Person am Server; Vollständigkeit gegen Vorlage und Code | 30 Meldungen, zusammengefasst 22: 2 / 20 | alle umgesetzt; die beiden wichtigen an der Vorlage belegt, die übrigen beim Einarbeiten an der genannten Quelle nachgesehen (keine eigene Gegenprüfung) |

W = wichtig, k = klein. Kürzel: `B` Betrieb und Befehle, `S` Schema und Rückfall, `H` HR, Mails,
Datenschutz und Doku, jeweils mit laufender Nummer.

### Methode

- **Ein Entwurf, drei parallele Prüfer.** Jeder las den Plan aus einem Blickwinkel und belegte seine
  Befunde an der Quelle: Code, `docker-compose.yml`, `Dockerfile`, `entrypoint.sh`, die Vorlage,
  `git` im Repo. Nur lesend.
- **Adversariale Gegenprüfung.** Jeder Befund ging an einen Gegenprüfer mit dem Auftrag, ihn zu
  widerlegen; der wichtige Befund B1 an zwei mit verschiedenem Blickwinkel (Docker-Verhalten, Ablauf).
  Urteil je Befund: bestätigt, teilweise (Kern stimmt, Vorschlag angepasst) oder widerlegt.
- **Eine Überarbeitung.** Umgesetzt wurde die Fassung der Gegenprüfung; wo sie den Vorschlag
  verschärfte oder einschränkte, steht das in der Tabelle.
- **Lokal nachgerechnet, nur lesend:** alle 14 lesenden SQL-Abfragen des Plans gegen die
  Entwicklungsdatenbank (keine Fehler); per Skript: jeder der Befehlskästen genau eine Zeile, höchstens
  ein Sternchen, `git` nur mit `sudo`, `psql` nur mit `default_transaction_read_only`; die festen Stände
  aus 3.2 mit `git` im Repo.
- **Nicht gegen den Server.** Was nur dort messbar ist, steht im Kopf des Plans unter „Nicht gemessen“
  und unten bei den Restrisiken.

---

## Runde 0 — Generalprobe (19.10.2026)

Skript außerhalb des Repos (Sitzungsablage). Beide Images aus dem committeten Stand gebaut
(`git archive 0e1d8de` bzw. `7d595e5` | `docker build`), echter Entrypoint, Wegwerf-Datenbank
`postgres:16-alpine`, `ZEITPLANER_AKTIV=false`, kein Mailserver, `APP_URL` auf eine `.invalid`-Adresse.

| Schritt | Gemessen | Im Plan |
|---|---|---|
| Build `0e1d8de` / `7d595e5` | gut 6 bzw. gut 7 Minuten ohne Zwischenspeicher, `npm ci` 65 s bzw. 57 s und beim zweiten Image **nicht** `CACHED` (Lockfile geändert); 907 bzw. 909 MB | 3.3 |
| 1. Start `0e1d8de` auf leerer Datenbank | Seed läuft, 8 Merker, keine Tabelle `email_log_texte` | — |
| 2. Vorschau mit dem neuen Image | `ADD COLUMN 0`, `ADD VALUE 0`, `CREATE TABLE 1`, `INDEX 0`, `ADD CONSTRAINT 1`, keine `DROP/RENAME/TYPE`-Zeile, genau die acht Zeilen | 3.4 |
| 3. Start `7d595e5` | Startlog wie 4.3 (Sicherung, Push in 313 ms, 3 × „ist aktuell“, kein `data loss`), Health `ok`, Tabelle da, Fremdschlüssel `c` (Cascade), 13 Merker | 4.3, 5.1, 5.2 |
| 4. Vorschau des Rückfalls | `DROP TABLE 1`, `DROP CONSTRAINT 1`, `DROP COLUMN 0`, `DROP INDEX 0`, genau zwei Zeilen | 7.3 Schritt 5 |
| 5. Start `0e1d8de` (Weg A) | Warnung mit genau einem Punkt „You are about to drop the `email_log_texte` table, which is not empty (1 rows)“, danach Tabelle weg, `email_logs` unverändert (2 Zeilen), beide S0-Spalten da | 7.3 Schritt 11 |
| Kopfzeilen der Adressen (beide Images, mit `Host: hr.fes-credo.de` und `X-Forwarded-Proto: https` wie hinter Caddy) | alt: `/dashboard` → 307 `location: /login`, `/vorgaenge` und `/bem` → 404; neu: die vier alten Formen → 308 mit **relativem** Ziel (`location: /vorgaenge` …), `/vorgaenge` und `/bem` → 307 `/login`, `/bem/einwilligung/…` → 200 | 1.9, 5.3 |
| Kopfzeilen der 308 | **keine** `Cache-Control`, `Strict-Transport-Security`, `Content-Security-Policy`; dazu `Refresh: 0;url=/vorgaenge` | 5.3, 0 Punkt 3, 10 Punkt 3 |

**Abweichungen vom Entwurf:**

1. **Relative Ziele.** Der Entwurf erwartete `308 https://hr.fes-credo.de/vorgaenge` und prüfte Host und
   Schema gegen 1.9. Die Middleware gibt relative Ziele aus; `curl -w '%{redirect_url}'` zeigt für sie
   nichts an (gemessen mit curl 8.22 im Container). 1.9 und 5.3 lesen deshalb die Kopfzeile `location`
   selbst, und die Sorge um Host und Schema hinter Caddy entfällt — ein relatives Ziel setzt der Browser
   gegen die Adresse, die er aufgerufen hat.
2. **Drei Migrationszeilen beim zweiten Start** (`MINIJOB-Vorlage: Schritt-6-Felder gesetzt …`,
   `Masernschutz-Schritt war bereits ueberall aktiv.`, `BA-Betriebsnummern gesetzt: 16 von 16.`). Sie
   sind ein Kunstprodukt der leeren Datenbank: Beim ersten Start liefen die Migrationen vor dem Seed und
   fanden noch keine Vorlagen, ihre Merker blieben offen (8 → 13). Auf dem Server sind alle 13 gesetzt;
   die Regel „keine Migrationszeile“ in 4.3 bleibt.

---

## Runde 1 — drei Blickwinkel, adversariale Gegenprüfung

### Betrieb und Befehle (B)

**Wichtigster Befund (B1):** Nach dem Build in 3.3 heißt `hr_portal_credo-app:latest` schon das neue
Image, während der alte Container weiterläuft. Der Dienst `app` hat in `docker-compose.yml` nur
`build:`, kein `image:`; Compose merkt sich die Image-ID am Container und legt ihn bei jedem `up` neu an,
wenn sie abweicht — genau darauf baut 4.2. Ein `up` zwischen 3.3 und 4.2 (auch das `up -d --build` aus
der CLAUDE.md) rollte den neuen Code ohne die Sicherungen aus 4.1 aus, mit `db push --accept-data-loss`.
Der Zustand „gebaut, nicht gestartet“ kam am 14.10.2026 schon einmal vor. Die Vorlage hat dieselbe
Lücke.

| Kürzel | Schwere | Befund | Gegenprüfung | Ergebnis |
|---|---|---|---|---|
| B1 | wichtig | Nach dem Build kein Verbot von `docker compose up`; bei Abbruch zeigt `latest` auf das neue Image | teilweise (zwei Gegenprüfer): Kern bestätigt. Angepasst: `restart`, `start` (Befehl B) und ein Neustart des Servers sind **unbedenklich** (sie behalten den Container); gefährlich ist jedes `up`, dazu `down` und `run app` ohne `--entrypoint`. Das Zurücksetzen des Etiketts nur vor 4.2 und nur, wenn `laufend` = `0e1d8de`, **nie danach** (sonst legte das nächste `up` den alten Stand an und verwürfe `email_log_texte`). Das Etikett schützt nicht vor `up -d --build` — das Verbot bleibt | umgesetzt: Grundregel, Befehl F in 3.3, Satz in 3.4, Zeile im Protokoll |
| B2 | klein | „Wortgleich aus dem S0-Plan 1.4“, aber die Prüfung `DB_BACKUP_DIR` fehlt; zeigt sie woanders hin, kopiert 4.5 still eine ältere Sicherung | bestätigt | umgesetzt (Befehl wieder in 1.4, „Wie im S0-Plan“) |
| B3 | klein | Befehl B „ab 4.2 nie“, 7.3 verlangt ihn in den Schritten 6–9 | bestätigt | umgesetzt (Zusatz der Vorlage „in 7.3 nur, wo es dort steht“) |
| B4 | klein | Prüfbefehl bei fehlendem `tar OK` nur als Verweis mit Handänderung des Etiketts; in 4.1 fehlt der Verweis | bestätigt | umgesetzt (eigener Kasten in 2.2, Verweis in 4.1 und in „Was an Claude geht“) |
| B5 | klein | Gegenprobe `tar tzf … \| wc -l` des Archivs fehlt | bestätigt | umgesetzt (4.1, Protokollzeile) |
| B6 | klein | `a43aa25` nur gekürzt geprüft | teilweise: keine Lücke (der volle Hash ist Vorfahre von `0e1d8de`, das mit vollem Hash geprüft wird), Vereinheitlichung freiwillig | umgesetzt als voller Hash in der bestehenden Zeile, keine eigene `rev-parse`-Zeile |
| B7 | klein | 7.3 Schritt 6 ohne „Erwartet“, Schritt 10 ohne „Weicht ab → STOPP“ | bestätigt; dazu „Erwartet: keine Ausgabe“ bei Befehl E und Schritt 7 und die Begründung „kein Befehl E“ ab Schritt 10 | umgesetzt |
| B8 | klein | „Nach Weg A“: schon `docker compose build` nähme dem Rückfall-Image das Etikett | bestätigt (danach löschte schon ein einfaches `docker image prune` das alte Image) | umgesetzt |
| B9 | klein | 5.4 Punkt 6 wählt „Vorgang stornieren …“, die Liste „Nicht klicken“ nennt es auch; Stornieren schickt keine Mail | bestätigt | umgesetzt zusammen mit H1 (Liste neu) |
| B10 | klein | Die Zahl `versandprotokoll` kann zwischen 1.7, 4.1 und 5.2 auch sinken (Aufräumen nach 90 Tagen beim Öffnen des Versandprotokolls) | bestätigt; „Wartung“ läuft im Zeitfenster nicht (1.8) | umgesetzt (4.1, 5.2, Protokollzeile) |
| B11 | klein | Die Zeile `Schema-Vergleich nicht moeglich (Status …)` des Entrypoints ist im Plan nicht behandelt | teilweise: bestätigt; „nicht anhalten“ nur, solange keine Neustart-Schleife entsteht, sonst gilt deren Zeile (Befehl D); auch 4.2 und 4.3 müssen sie kennen. Ältere Pläne hatten die Zeile (`deploy-onboarding-pakete-2026-09.md`) | umgesetzt (4.2, 4.3, Zeile in 4.4) |
| B12 | klein | 5.3 „Schema und Host wie in 1.9“ widerspricht „`http://` → an Claude“ | durch die Generalprobe erledigt (Ziele relativ) | umgesetzt mit Runde 0 |
| B13 | klein | 3.3 verweist für die Dauer des Builds auf ein Prüfprotokoll, das es nicht gibt | durch die Generalprobe erledigt | umgesetzt (Dauer in 3.3, dieses Protokoll) |

### HR, Mails, Datenschutz, Doku (H)

**Wichtigste Befunde:** Die Browserprobe ließ Knöpfe der **bisherigen** Ansicht aus, die sofort und
ohne Rückfrage Mails verschicken — „Anfrage erneut senden“ entwertet dabei den Link der Führungskraft
(H1). Am Folgetag prüfte nichts die Kernzusage an den DSB, dass im gespeicherten Text kein persönlicher
Link steht (H2). Und die Sicherungen enthalten künftig die Mailtexte, während die abgestimmte
DSB-Mitteilung „keine Kopie an anderer Stelle“ sagt (H3).

| Kürzel | Schwere | Befund | Gegenprüfung | Ergebnis |
|---|---|---|---|---|
| H1 | wichtig | Liste „Nicht klicken“ ohne die Knöpfe der bisherigen Ansicht; Überschrift „verschickt Mails“ falsch für Status-Änderungen | teilweise: Kern bestätigt, Knopftexte wortgleich im Code geprüft. Ergänzt: die MAV-Knöpfe der bisherigen Ansicht speichern sofort; „Word“/„PDF“ unter „Dokumente erstellen“ legen ein Dokument an; die alten Knöpfe „Offboarding anlegen →“ u. a. fragen per Browser nach (gefährlich ist dort „OK“); gefährlich sind die bestätigenden Knöpfe **im** Dialog, nicht die Menüpunkte mit „…“. Nebenbefund: Punkt 8 „eines beliebigen Vorgangs“ — im Onboarding handeln „Vorgesetzten-Link erstellen“, „Generieren“ und „Als geprüft markieren“ sofort | umgesetzt: Liste neu nach „verschickt sofort“, „ändert sofort“, „öffnet eine Rückfrage“ und Faustregel; Punkt 6 und 8 präzisiert |
| H2 | wichtig | 6.1 prüft nur die Ausnahmen (SKIPPED, Test, BEM), nicht „kein Zugangslink im Text“ | teilweise: Kern bestätigt, Begründung („DB-Vorlagen überschreiben die Standards“) trägt nicht — ersetzt wird am fertigen HTML. Sinnvoll als Wächter unter Produktionsbedingungen (`APP_URL`, Link-Basis der Routen hinter Caddy). Die vorgeschlagene Pfadliste verfehlte `konto-einrichten` und `bem/einwilligung` (4 von 36 Proben); besser: jede UUID außerhalb von `/vorgaenge/<modul>/<id>` — alle Zugangstokens sind UUIDs. Gegen 134 erzeugte Kopien aller Standardvorlagen geprüft (0 Treffer, 36 von 36 im Roh-HTML erkannt) und von Claude gegen PostgreSQL 16 nachgerechnet | umgesetzt: zweite Abfrage `kennung_offen` in 6.1, Protokoll- und Meldezeile |
| H3 | wichtig | Sicherungen enthalten die Mailtexte; Mitteilung Abschnitt 5 „keine Kopie an anderer Stelle“ | teilweise: „Zustimmung beruht auf dem Satz“ überzogen — er meint die Ablage im Portal; wörtlich trifft er ab der ersten Sicherung mit Texten nicht mehr zu. Neu ist die Lücke nicht (Betreffzeilen, individuelle E-Mails, Unterlagen liegen schon heute unbefristet in Sicherungen). Die Sicherungen **dieses** Deploys enthalten noch keine Texte. Die abgestimmte Mitteilung wird nicht berichtigt; ein datierter Nachtrag nur nach Entscheidung des Auftraggebers | umgesetzt: 0 „Wachstum“ genau gefasst, neuer Punkt 8 unter „Vor dem Termin zu entscheiden“, Textvorschlag für den Nachtrag in 10 Punkt 4, Nachführung in 9 |
| H4 | klein | 5.4 Punkt 8 nennt nur einen der Sätze ohne Text; im Versandprotokoll erst nach Aufklappen | bestätigt | umgesetzt (alle Sätze wortgleich) |
| H5 | klein | Ankündigung: „Reiter statt einer langen Seite“ stimmt nicht — die bisherige Ansicht hat dieselben vier Reiter und eine Schrittzeile | bestätigt | umgesetzt (Prozessleiste ersetzt die Schrittzeile, „Jetzt dran“, Menü „…“) |
| H6 | klein | `betriebsstaetteName` als neu geführt, ist aber schon auf `0e1d8de` | Kern bestätigt, zum Zeitpunkt der Gegenprüfung schon erledigt | umgesetzt (unter „Nicht neu“) |
| H7 | klein | 5.5 ein Bild, Checkliste der Ankündigung zwei | bestätigt | umgesetzt (5.5 verweist auf die Checkliste) |
| H8 | klein | Checkliste verlangt „Wartung“ an vor dem Versand, der Plan schaltet sie erst in 6.2 ein | bestätigt | umgesetzt (6.2 am Deploytag gleich nach 5.5, Satz im Bescheid zur Berichtsmail, Checkliste angepasst) |
| H9 | klein | Liste der Platzhalter-Stellen in 0 Punkt 1 unvollständig, Schreibweise in 3.1 abweichend | Kern bestätigt, schon erledigt | umgesetzt |
| H10 | klein | Prüfprotokoll fehlt, `docs/README.md` hat keine Zeile für den Plan | bestätigt (ohne eigene Gegenprüfung) | umgesetzt (dieses Protokoll, Zeilen in `docs/README.md`) |
| H11 | klein | „BEM-Beauftragte:r steht seit U1 im Kopf“ — stand schon im alten Kopf | bestätigt | umgesetzt (10 Punkt 9) |
| H12 | klein | HR bekommt keinen Hinweis, offene Portal-Tabs neu zu laden | bestätigt | umgesetzt (Bescheid in 5.5) |
| H13 | klein | wie B4 | — | umgesetzt mit B4 |
| H14 | klein | „Route und alles, was sie lädt, unverändert“ — über `webhooks.ts` → `mailer.ts` speichert der Versand jetzt den Text | bestätigt | umgesetzt (genaue Fassung mit `git diff`-Beleg; am Flow ist nichts zu ändern) |

### Schema, Daten, feste Stände, Rückfall (S)

Der Prüfer fand keinen wichtigen Befund. Nachgerechnet und bestätigt: die drei vollen Hashes, 71/14,
die fünf `numstat`-Zeilen, `jest-axe` als einzige neue (Entwicklungs-)Abhängigkeit, 219 Dateien
außerhalb der Doku; das Schema-Delta ist genau `EmailLogText` mit Fremdschlüssel `ON DELETE CASCADE`;
keine neue einmalige Datenmigration (13 Merker in `seed-check.js`), 11 Läufe; ein Merge per „Create a
merge commit“ besteht in einem Wegwerf-Klon alle Prüfungen aus 3.2.

| Kürzel | Schwere | Befund | Gegenprüfung | Ergebnis |
|---|---|---|---|---|
| S1 | klein | Kommt Etappe 2 danach, sind im S0-Plan mehr Stellen nachzuführen (7.3 Schritt 5 nennt eine falsche Ursache, Befehl E löscht in der Kette die Override-Datei, 7.4/7.5 führen direkt auf `0974b7f`) | teilweise: alle drei bestätigt; die Nachführung von S0-Abschnitt 7 ist in **beiden** Fällen nötig, nicht nur, wenn Etappe 2 danach kommt. 7.4 Fall 2 ist danach gegenstandslos, Weg C direkt auf `0974b7f` ist ohne Entrypoint datensicher, muss das aber sagen | umgesetzt (0 Punkt 2, 7.1 mit Befehl zum Wiederherstellen der Override-Datei, Zeile „Danach“ in 8, 9) |
| S2 | klein | CLAUDE.md erlaubt heute wörtlich den Rückfall auf `0974b7f`; „ergänzen“ ließe das stehen | bestätigt; auch der Punkt „`ux-umbau` erst nach dem Merge von `main`“ ist mit dem Deploy erledigt | umgesetzt (9: drei Punkte **ersetzen**, Wortlaut vorgegeben) |
| S3 | klein | Die gemerkte 308 trifft mehr als alte Lesezeichen; „Nach Weg A“ bittet nur HR | teilweise: Kern bestätigt; **widerlegt** ist, dass Anmeldung und Logo betroffen sind — Next.js holt Seitenwechsel unter `?_rsc=…`. Betroffen ist jedes **volle** Laden (Lesezeichen, Mail-Link, Eingabe, „Neu laden“ nach der Anmeldung, neuer Tab, Umleitungen des alten Images, BEM-Beauftragte über `/dashboard/bem`). Alternative 307 ist ebenfalls eine Code-Änderung | umgesetzt (0 Punkt 3 mit beiden Alternativen, 7.2, „Nach Weg A“: alle Konten) |
| S4 | klein | Nach Weg A keine Datenprüfung; Schritt 2 ohne `s0_vertraege`; Schritt 3 ohne Begründung | bestätigt; Begründung gemessen (`docker compose run --dry-run` in einem Wegwerf-Ordner: ohne Etikett baut Compose aus dem jetzigen Code unter genau diesem Etikett) | umgesetzt (Schritt 2 mit drei Zahlen, Begründung in Schritt 3, neuer Schritt 12, Protokollzeile) |
| S5 | klein | `vor-rueckfall-…` und die Entrypoint-Sicherung des Rückfalls enthalten Mailtexte, „aufheben“ ohne Frist | bestätigt; `vor-deploy-ux-umbau-…` enthält **keine** Texte; ein Löschdatum gibt es erst mit einer Regel | umgesetzt mit H3 (Schritt 7, „Nach Weg A“, Tabelle der Sicherungen, 10 Punkt 4) |
| S6 | klein | Konflikt in `CLAUDE.md` beim Merge nach Etappe 1 „fast sicher“; Rebase ließe `7d595e5` verschwinden | teilweise: im Wegwerf-Klon nachgestellt — Konflikt nur, wenn die Nachführung die Zeile direkt über „UX-Umbau“ ändert (wahrscheinlich). Der vorgeschlagene Prüfbefehl war **ungültig** (`git diff --quiet 7d595e5... origin/main` → usage, rc 129, also ein falscher STOPP) | umgesetzt (0 Punkt 1: Konflikt nur per Merge, nie Rebase; berichtigter Prüfbefehl) |
| S7 | klein | Tabelle in 8 kennt keine Rücknahme von Etappe 2 (S0-Plan 8.8) | bestätigt | umgesetzt (Absatz unter der Tabelle, 1.2, 1.9, Kopf) |
| S8 | klein | Die 14 Merges sind nicht erklärt | teilweise: sechs der 71 Commits sind seit Etappe 1 schon auf dem Server; neu sind 65 mit 12 Merges | umgesetzt (0 „Was ausgerollt wird“) |

---

## Runde 2 — Abschlussprüfung des überarbeiteten Plans

Drei Leser mit frischem Blick, nur lesend: innere Konsistenz nach der Überarbeitung, die Person am
Server (jeder Kasten von 1.0 bis 5.5 und 7.3), Vollständigkeit gegen die Vorlage und den Code. Sie
bestätigten die festen Stände (auch 65 neue Commits mit 12 Merges), alle Tabellen- und Spaltennamen,
die Logzeilen, Knopftexte und Querverweise, das Quoting der neuen Kästen (`$$` und `!` in einfachen
Anführungszeichen, `printf` mit `\n`, Lookbehind in PostgreSQL ab 9.6) und die Zählung dieses
Protokolls. **Wichtigste Befunde:** zwei Rückschritte gegenüber der Vorlage, beide an deren Wortlaut
belegt (S0-Plan 4.2).

| Nr. | Schwere | Befund | Ergebnis |
|---|---|---|---|
| 2.01 | wichtig | 4.2 verlangte bei jedem zweiten Start Befehl D, auch nach `FATAL: Sicherung … fehlgeschlagen` — 4.4 verlangt dort Befehl A und den Neustart von selbst; nach Befehl D bliebe das Portal aus | umgesetzt: Satz der Vorlage („Steht stattdessen eine Zeile `FATAL: …` vor dem Neustart, gilt ihre Zeile in 4.4“), Befehl D nur nach gescheitertem Push; Zeile in 4.4 für „Befehl D schon ausgeführt“ |
| 2.02 | wichtig | 4.2 und 7.3 Schritt 10 erwarteten zwingend `Recreated`; am 14.10.2026 stand auf dem Server nur `Started` → falscher STOPP, gerade während das Startlog beobachtet werden muss | umgesetzt: „nur `Started` auch in Ordnung“, maßgeblich sind Startlog und Image-ID; bei Abweichung trotzdem gleich das Log ansehen |
| 2.03 | klein | 7.1 verbot den direkten Weg auf `0974b7f` ausnahmslos, 8 ließ Weg C des S0-Plans bei `7d595e5` beginnen | umgesetzt: Weg C (ohne Entrypoint) als einzige Ausnahme in 7.1 und im Text für CLAUDE.md; S0-Plan 7.3 nur, solange S0 nie geschrieben hat, sonst 7.5 |
| 2.04 | klein | Bedingungen für Befehl F an drei Stellen verschieden; Sonst-Zweig fehlte | umgesetzt: Grundregel und 3.4 verweisen auf die Bedingungen in 3.3; `laufend` ≠ `0e1d8de` → kein Befehl F, STOPP |
| 2.05 | klein | Liste der Sicherungen mit Mailtexten ohne die Kopie aus 4.5 und ohne `vor-s0-erster-lauf-manuell.sql` (S0-Plan 8.4) | umgesetzt (0 „Wachstum“, 10 Punkt 4, Textvorschlag, Zeile „Danach“ in 8) |
| 2.06 | klein | Zeitplaner-Zeile und `uhrAktiv` als gemessen geführt, obwohl die Generalprobe mit ausgeschalteter Uhr lief; „S0 unberührt“ ebenso | umgesetzt: Kopf „Nicht gemessen“, 4.3, 5.1, 7.3 eingeschränkt |
| 2.07 | klein | 8.1 des S0-Plans gilt auch für die Rücknahme in 8.8; Abschnitt 9 fehlte in „Nach dem Update“ | umgesetzt (9, Zeile „Danach“) |
| 2.08 | klein | Fall „Wartung an, aber als Probelauf“ in 0 Punkt 6, 5.5 und der Ankündigung nicht abgedeckt | umgesetzt: überall dieselbe Bedingung wie in 6.2 |
| 2.09 | klein | 1.7 sagte, 5.2 vergleiche mit 1.7; 4.1 ohne STOPP bei weniger Personen, Anstellungen, Vorgängen | umgesetzt |
| 2.10 | klein | Wiederaufnahme nach Befehl F mit Werten vom Vortag | umgesetzt: erst 1.2 bis 1.9, dann 3.3 |
| 2.11 | klein | „Erwartet“ fehlte bei Befehl A, der zweiten `UPLOADS_VOL`-Zeile, „Log sichern“, Befehl C (samt „an Claude“), `robots.txt`, Schritt 12 und dem `printf` in 7.1 | umgesetzt (aus der Vorlage) |
| 2.12 | klein | Die Faustregel in 5.4 verbot Klicks, die die Probe selbst verlangt | umgesetzt (Menüs, Punkte mit „…“, Aufklappen, Abmelden ausdrücklich erlaubt) |
| 2.13 | klein | Der Plan steht zweimal in `docs/README.md`, 9 nannte nur eine Zeile | umgesetzt |
| 2.14 | klein | 1.5 „zweite Zeile“ mehrdeutig (Kopfzeile von `df`) | umgesetzt (Wortlaut der Vorlage, Spalte `Mounted on`) |
| 2.15 | klein | Schritt 12 erwartete `versandprotokoll` nie kleiner, gegen 4.1/5.2 | umgesetzt |
| 2.16 | klein | S0-Plan 10 Punkte 11 und 13 stehen „erst nach Etappe 1“ — genau in der Lücke vor diesem Deploy, in der nur Doku auf `main` darf | umgesetzt: 0 Punkt 1 (erst nach diesem Deploy; Nachführung von S0-Plan und CLAUDE.md mit Etappe 1) |
| 2.17 | klein | „Nach dem Update“ ohne Übergabe S0 und Self-Service-Plan (Vorbedingung `ux-umbau` in `main`) | umgesetzt |
| 2.18 | klein | Protokoll ohne Zeile „6.2 Folgetag“, „Was an Claude geht“ ohne 6.2 | umgesetzt (aus der Vorlage) |
| 2.19 | klein | Abfrage der System-Vorlagen aus der Vorlage (1.7) fehlte | umgesetzt, mit Protokollzeile |
| 2.20 | klein | CLAUDE.md: „Branch `ux-umbau`“ und Ausstattung Regel 13 (`ausstattungPortalLink`) nach dem Merge überholt | umgesetzt (9) |
| 2.21 | klein | Handbuch: der **Text** zu Kopf, Startseite und Adressen ist ab dem Deploy falsch, nicht nur die Bilder | umgesetzt (10 Punkt 5: mit oder kurz nach dem Deploy, nur Doku) |
| 2.22 | klein | Ankündigung: Checkliste verlangte ein Datum, für das der Text keinen Platzhalter hat | umgesetzt (nur das Ende der zwei Wochen; „heute Vormittag“ passt zum Zeitfenster) |

---

## Verworfene Teilvorschläge

| Zu | Vorschlag | Grund |
|---|---|---|
| B1 | „kein `restart`“ ins Verbot aufnehmen | widerlegt: `restart`, `start` (Befehl B) und ein Neustart des Servers behalten den Container und damit das alte Image; gefährlich ist jedes `up` |
| B1 | Etikett ohne Einschränkung zurücksetzen | nur vor 4.2 und nur bei `laufend` = `0e1d8de`; danach legte das nächste `up` den alten Stand an und verwürfe `email_log_texte` |
| B6 | eigene Zeile `git rev-parse --verify a43aa25` | überflüssig: In der Vorlage diente sie einem Inhaltsvergleich, den dieser Plan nicht hat; stattdessen voller Hash in der bestehenden Zeile |
| H1 | Faustregel „nichts mit senden, informieren, anlegen, abschließen, stornieren“ | zu eng: erfasst weder die MAV-Knöpfe noch „Word“/„PDF“ noch „Stand speichern“; ersetzt durch eine Liste der unbedenklichen Bedienelemente |
| H2 | Liste gesperrter öffentlicher Pfade | verfehlte `konto-einrichten` und `bem/einwilligung` und veraltete mit jeder neuen Seite; ersetzt durch die Suche nach UUIDs außerhalb von `/vorgaenge/<modul>/<id>` |
| H2 | Begründung „DB-Vorlagen überschreiben die Code-Standards“ | trägt nicht: ersetzt wird am fertigen HTML, gleich aus welcher Vorlage |
| H2 | zusätzliche Suche nach Hex-Folgen | nicht nötig: kein Zugangstoken ist eine Hex-Folge; prüfte nur das Netz des Codes |
| H3 | DSB-Mitteilung Abschnitt 5 berichtigen | die Mitteilung ist abgestimmt (15.10.2026); möglich ist nur ein datierter Nachtrag, und der erst nach Entscheidung des Auftraggebers (0 Punkt 8) |
| H3, S5 | in 7.3 eine Löschfrist für `vor-rueckfall-…` nennen | keine Frist erfinden: Sie legen DSB, Auftraggeber und IT fest (10 Punkt 4); bis dahin Dateiname und Anlagedatum ins Protokoll |
| S3 | Anmeldung und Logo des alten Images als betroffen nennen | widerlegt: clientseitige Seitenwechsel laufen unter `?_rsc=…` |
| S6 | Prüfbefehl `git diff --quiet 7d595e5... origin/main …` | ungültige Syntax; berichtigt in 0 Punkt 1 |

---

## Restrisiken

1. **Generalprobe nur auf dem Entwicklerrechner** (Docker Desktop unter Windows). Build auf dem Server,
   Verfügbarkeit der npm-Registry und der freie Platz (Schätzung 5 GB) sind nicht gemessen; der Build
   braucht `npm ci` neu.
2. **Was Caddy der Weiterleitung hinzufügt** (HSTS, CSP) ist nicht gemessen; 5.3 notiert es.
3. **Wie Browser die 308 merken**, ist nicht gemessen (0 Punkt 3); die Folgen im Rückfall sind aus dem
   Verhalten von Next.js und dem Code abgeleitet.
4. **Browserprobe 5.4 mit echten Vorgängen** lief nie; die Liste „Nicht klicken“ ist aus dem Code
   abgeleitet (Knopftexte wortgleich geprüft).
5. **`kennung_offen` (6.1)** setzt voraus, dass alle Zugangstokens UUIDs sind (heute belegt). Ein
   künftiger Token anderer Form fiele durch diese Abfrage; das Netz des Codes erfasst zusätzlich
   Hex-Folgen ab 32 Zeichen.
6. **Weg B und C** sind nicht geprobt; die Befehle gibt Claude im Ernstfall.
7. **Merge nach Etappe 1** nur im Wegwerf-Klon nachgestellt; kommt nach `7d595e5` noch Code, sind alle
   festen Stände neu zu rechnen (0 Punkt 1).
8. **Platzhalter aus Etappe 1:** Der Plan ist erst ausführbar, wenn Claude die Werte aus deren
   Protokoll eingetragen und gegengeprüft hat.

---

## Entscheidungen des Auftraggebers (19.10.2026)

- **0 Punkt 3:** dauerhafte Weiterleitung (308) **hinnehmen** — kein neuer Code-Stand.
- **0 Punkte 7 und 8 (DSB):** „mit dem DSB ist alles geklärt und freigegeben“. Eine Frist für die
  Aufbewahrung der Sicherungen steht nicht im Repo (10 Punkt 4 bleibt Merkposten, bis sie eingetragen
  ist); die DSB-Mitteilung selbst ist unverändert.

## Offen

- **0 Punkt 2:** Etappe 2 vor oder nach diesem Deploy.
- **0 Punkt 5:** Ausgangswerte des Prototyp-Tags (oder das Maß fallen lassen).
- **Gendersprache:** Paarformen in neuen Texten (CLAUDE.md, offen) — die Ankündigung kommt mit neutralen
  Wörtern ohne diese Entscheidung aus; „BEM-Beauftragte:r“ bleibt ein eigener kleiner Fix (10 Punkt 9).

---

Die Rohdaten (Befundlisten der Prüfer, Urteile der Gegenprüfung, Logs der Generalprobe) liegen nur in
der temporären Ablage der Sitzung vom 19.10.2026 außerhalb des Repositorys und sind nicht archiviert.
Maßgeblich sind dieses Protokoll und der Ablaufplan.
