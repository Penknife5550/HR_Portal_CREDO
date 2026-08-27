# Minijob-Checkliste — Umsetzungsstand

> **Stand:** 2026-08-27 · Branch `feat/minijob-checkliste-2026` (auf `origin`)
> **Fertig:** AP 1, AP 2, AP 5, AP 6, AP 7, AP 8 · **Als Nächstes:** AP 12
> **Verifiziert:** 706 Tests grün (52 Suites) · `tsc --noEmit` sauber · `npm run lint`
> ohne Errors · `npm run build` erfolgreich · Antragserzeugung, Sperren und
> Upload-Pflicht im Browser gegen die Dev-Datenbank durchgespielt

Dieses Dokument ist die Übergabe: Was ist gebaut, was ist bewusst offen, und
womit fängt man weiter an. Der fachliche Plan steht in
[minijob-checkliste-2026.html](minijob-checkliste-2026.html), die Masken in
[minijob-mockups-2026.html](minijob-mockups-2026.html).

---

## 1. Maßgebliche Grundlage

**Die amtliche Checkliste in der Fassung vom 30.06.2026**, abgelegt als
[checkliste-minijobzentrale-2026-06-30.pdf](checkliste-minijobzentrale-2026-06-30.pdf).

Der Erstabgleich lief gegen die Fassung 26.05.2026. Beim Nachprüfen am 25.08.2026
stellte sich heraus, dass die Minijob-Zentrale nachgelegt hatte — zwei Textstellen
zur Bindungswirkung der Befreiung. **Vor dem Extrahieren der Anlagen (AP 8) erneut
prüfen**, ob es eine neuere Fassung gibt:
[Downloadseite](https://www.minijob-zentrale.de/SharedDocs/Downloads/DE/Formulare/gewerblich/Checkliste_BDA_Personalfragebogen.html)

---

## 2. Was fertig ist

### AP 1 — Renderer von der Vorlagen-Konfiguration entkoppelt

Die Vorlagen-Steuerung hat im Fragebogen nie gewirkt: `activeSteps` wurde
berechnet, aber nie verwendet — gerendert wurde ein fest verdrahtetes Array.
Ursache war eine vierfach kopierte Schritt-Liste mit auseinanderlaufenden Nummern.

**Neu: [`src/lib/fragebogen-steps.ts`](../../../src/lib/fragebogen-steps.ts)** als
einzige Quelle. Array-Reihenfolge = Anzeigereihenfolge, `step` = stabile
Registry-Nummer. Virtuelle Schritte (ohne eigene Maske, heute nur „Kinder") sind
als solche markiert.

Mit behoben:

- Die **Vorlagen-Vorschau** zeigte ab Registry-Schritt 7 die *falsche* Maske.
- Der **Vorlagen-Editor** erkannte Änderungen über die Array-Position.
- `currentStep` in der API hing an einem festen `max(10)`.
- Die **HR-Ansichten** zeigten „Schritt X von 9" bzw. „X/10", teils widersprüchlich.

### AP 2 — Wahrheitsversicherung prüfungsfest

Der Fragebogen zeigte „Diese Erklärung ersetzt Ihre handschriftliche Unterschrift" —
die Checkbox war aber reiner Browser-Zustand. Der Server hat sie nie gesehen.

- **[`src/lib/erklaerung-arbeitnehmer.ts`](../../../src/lib/erklaerung-arbeitnehmer.ts)** —
  versionierter Wortlaut. Am Vorgang wird die Fassung gespeichert, die beim
  Absenden galt; das PDF druckt genau diese. **Neu im Text:** die Belehrung nach
  § 28o und § 111 Abs. 1 Nr. 4 SGB IV.
- **[`src/lib/fragebogen-pruefsumme.ts`](../../../src/lib/fragebogen-pruefsumme.ts)** —
  SHA-256 über die kanonisch serialisierten Angaben.
- Der Server **erzwingt** Bestätigung, Ort und eine bekannte Fassung; Zeitpunkt,
  IP, Browserkennung und Prüfsumme setzt er selbst.
- Eigener **PDF-Abschnitt** und eine **Karte auf der HR-Detailseite**.

### AP 5 — Datenmodell für die drei Tabellen

`BeschaeftigungsAngabe` mit Kategorie-Kennzeichen (`WEITERE`,
`VORBESCHAEFTIGUNG`, `AUSLAND`) statt drei getrennter Tabellen — die drei
Abschnitte teilen sich die meisten Felder.

Validierung in
[`src/lib/validations/beschaeftigungs-angaben.ts`](../../../src/lib/validations/beschaeftigungs-angaben.ts)
als `z.discriminatedUnion`. **Wichtig:** Die Datumsprüfung sitzt in einem
`.superRefine()` **auf** der Vereinigung. Ein `.refine()` an einem Mitglied macht
daraus `ZodEffects`, das Unterscheidungsmerkmal geht verloren und `kategorie`
kommt als `unknown` heraus.

### AP 6 — Schritt 6 neu: Status und Beschäftigungen

17 Statusoptionen ([`src/lib/minijob-status.ts`](../../../src/lib/minijob-status.ts)),
die drei Tabellen, die Additionsfrage und die bedingten Nachweise.

**Neu für die Textführung:**
[`src/components/hilfe-hinweis.tsx`](../../../src/components/hilfe-hinweis.tsx) —
`HilfeHinweis` (ein Fragezeichen neben der Beschriftung, ein Klick klappt die
Erklärung auf) und `ErklaerBox` (ein ruhiger Kasten für einen ganzen Abschnitt).
Aufklappen statt Hover: Ein Tooltip am Mauszeiger ist auf dem Handy nicht
erreichbar und für Screenreader schwer zu fassen.

### AP 7 — Schritt 11: Rentenversicherung

Die vier Wege aus Abschnitt 5 der Checkliste in
[`src/lib/minijob-rentenversicherung.ts`](../../../src/lib/minijob-rentenversicherung.ts),
die Maske in
[`step11-rente.tsx`](../../../src/app/fragebogen/[token]/steps/step11-rente.tsx).

Leitgedanken, die ein Test absichert:

- **Kein Schubs in eine Richtung.** Versichert-bleiben und Befreiung stehen
  gleich ausführlich nebeneinander; ein Test prüft, dass die Folgenlisten sich um
  höchstens einen Punkt unterscheiden.
- **Zahlen statt Prozente allein.** „3,6 %" sagt wenig, „rund 21,71 € im Monat"
  sagt etwas. Formatiert über `prozent()` / `euro()` — deutsche Dezimalkommas.
- **Das Merkblatt steht im Formular**, nicht nur als PDF zum Herunterladen.
- Die **Aufhebung einer Befreiung** (§ 6 Abs. 6 SGB VI) ist erst ab dem
  01.07.2026 wählbar; `istWaehlbar()` blendet sie vorher aus.
- Zusagen hängen am jeweiligen Weg: Merkblatt-Kenntnis nur vor einer Befreiung,
  Bindungswirkung bei Befreiung *und* Aufhebung, Schriftform nur bei der
  Befreiung.

Die MINIJOB-Vorlage schaltet Schritt 11 über die Entrypoint-Migration
`ensureMinijobRenteSchritt` ein — samt der Snapshots laufender Vorgänge.

### AP 8 — Merkblatt, beide Anträge, Betriebsnummer

**Die Betriebsnummer.** `Organization.betriebsnummer` (achtstellig, BA) — bewusst
neben `mandantNumber` (dreistellig, LOGA), weil beide regelmäßig verwechselt
werden. Sie steht deshalb im selben Formular direkt untereinander und in der
Mandantenliste in zwei Spalten nebeneinander; fehlt sie, zeigt die Liste ein
Warn-Badge „fehlt". Regeln in
[`src/lib/betriebsnummer.ts`](../../../src/lib/betriebsnummer.ts) — **ohne**
Prüfziffernrechnung: Die gilt erst für neuere Vergaben, und eine ältere echte
Nummer würde durchfallen und damit genau die Antragserzeugung blockieren, die die
Prüfung schützen soll.

**Das Merkblatt** (Seite 7) liegt als amtliches Original unter
`public/system-dokumente/merkblatt-rv-befreiung.pdf` — dieselbe Entscheidung wie
beim Masernschutz-Formular: nichts auszufüllen, also nicht nachbauen. Es ist über
den Magic Link erreichbar, weil Schritt 11 die Kenntnisnahme verlangt; der Weg
über die Brief-Vorlagen wäre für den Beschäftigten gesperrt.

**Die beiden Anträge** (Seiten 8 und 9) werden dagegen **nachgebaut**
([`pdf-rv-antrag.ts`](../../../src/lib/pdf-rv-antrag.ts)), weil sie die
Betriebsnummer tragen, die nur das Portal kennt. Das Merkblatt verlangt den
Vordruck nur „möglichst", eine zwingende Form gibt es also nicht. Abgesichert
durch: versionierten Wortlaut in
[`rv-antrag-wortlaut.ts`](../../../src/lib/rv-antrag-wortlaut.ts), eine
Herkunftszeile auf jedem Blatt und einen Test, der jeden Satz zeichengenau gegen
die abgelegte amtliche Textfassung
(`docs/module/minijob/anlagen-wortlaut-2026-06-30.txt`) hält.

**Was das Blatt NICHT ausfüllt — und warum.** Vorbelegt sind genau fünf Werte:
Name, Vorname, Rentenversicherungsnummer, Arbeitgebername, Betriebsnummer. Die
vier Arbeitgeberfelder bleiben leer:

- „*ist am … bei mir eingegangen*" ist eine Feststellung des Arbeitgebers. Zum
  Zeitpunkt des Drucks hat der Antrag ihn noch gar nicht erreicht — das Blatt
  wird ja gerade erst zum Unterschreiben ausgegeben.
- „*wirkt ab …*" hängt daran, ob rechtzeitig an die Minijob-Zentrale gemeldet
  wird (nächste Entgeltabrechnung, **spätestens** sechs Wochen — maßgeblich ist
  der frühere der beiden Termine). Das steht beim Druck noch nicht fest.
- Beide Unterschriftszeilen sind der einzige Grund, warum überhaupt gedruckt wird.

Diese Felder erfasst **AP 12**. Einzige Ausnahme: die zwei Kästchen „0" und „1"
in der Wirkungszeile des Aufhebungsantrags — die sind Vordruck, nicht
Vorbefüllung (die Aufhebung wirkt nur zum Monatsersten).

**Die Upload-Pflicht.** `computeMissingRequiredDocuments` kennt jetzt die
`rvEntscheidung`. Der unterschriebene Befreiungsantrag wird verlangt — **nur** bei
`BEFREIUNG_BEANTRAGT`. Bei der **Aufhebung nicht**: § 6 Abs. 6 SGB VI lässt die
elektronische Erklärung ausdrücklich zu, ein erzwungener Ausdruck wäre
hinzuerfundene Förmlichkeit. Damit ist das Versprechen aus Schritt 11 eingelöst.

**Zwei Ausgabekanäle, eine Sperre.** Der Beschäftigte holt das Blatt über
`/api/fragebogen/[token]/rv-antrag`, HR über `/api/onboarding/[id]/rv-antrag`.
Beide prüfen mit derselben Funktion
([`minijob-antrag.ts`](../../../src/lib/minijob-antrag.ts)) und antworten mit 409
und Klartext, wenn die Betriebsnummer fehlt. Der Beschäftigten-Kanal läuft
bewusst **nicht** über die Brief-Vorlagen: Deren PDF-Ausgabe hängt an Gotenberg,
ein Ausfall dieses Dienstes würde sonst den ganzen Fragebogen blockieren.

---

## 3. Festlegungen, die man kennen muss

Diese sind beim Bauen entstanden und gelten für alles Weitere.

### Schritt-Definition

- Die **Reihenfolge des Arrays** in `fragebogen-steps.ts` ist die Anzeigereihenfolge;
  `step` ist die stabile Registry-Nummer und darf sich **nie** ändern.
- Ein Schritt, den eine gespeicherte `stepsConfig` **nicht kennt, gilt als
  abgeschaltet**. Sonst erschiene jeder neu definierte Schritt sofort in allen
  Vorlagen — die Rentenversicherung also auch im TV-L-Fragebogen.
- `mergeStepsConfig()` in `field-definitions.ts` legt die gespeicherte
  Konfiguration als **Overlay** über die zentrale Definition. Der Vorlagen-Editor
  rendert daraus, sonst wäre ein neuer Schritt dort unsichtbar und nicht schaltbar.

### Datenmigrationen

- Merker liegen im Modell **`SystemMigration`**, nicht im AuditLog. Logs werden
  aufgeräumt; eine nicht idempotente Migration, die ein zweites Mal läuft,
  verschiebt Daten erneut. Steht als Konvention in `CLAUDE.md`.
- Merker und Datenänderung gehören in **dieselbe Transaktion**.
- `prisma/seed-check.js` ruft `main()` nur hinter `require.main === module` auf und
  exportiert seine reinen Funktionen — dadurch sind die Regeln ohne Datenbank
  testbar.

### Prüfsumme

- Über den **Klartext**, nicht das Chiffrat. AES-GCM erzeugt bei jedem Speichern
  ein anderes Chiffrat; darüber gebildet wäre die Prüfsumme schon nach einem
  folgenlosen Neuspeichern verletzt. *Im Durchstich bestätigt: über den Klartext
  reproduzierbar, über das Chiffrat nicht.*
- **Ausschlussliste statt Einschlussliste**, damit ein später ergänztes
  Angabenfeld automatisch mit erfasst wird.

### Fortschrittsanzeige

Wird **serverseitig** gegen die Vorlage des Vorgangs berechnet
(`src/lib/fragebogen-fortschritt.ts`) und fertig mitgeliefert. Maßgeblich ist der
`formTemplateSnapshot`. Eine im Browser geratene Zahl war um ein Vielfaches
daneben: Ehrenamt auf Schritt 2 von 3 zeigte 22 statt 67 Prozent.

---

## 4. Fallen, die schon zugeschnappt sind

**Der Snapshot.** Der Fragebogen liest bevorzugt
`OnboardingProcess.formTemplateSnapshot` — eine bei der Anlage eingefrorene Kopie
der Vorlagenkonfiguration. Wer die Vorlage korrigiert, erreicht damit **nicht** die
laufenden Vorgänge. Die Entrypoint-Korrektur zieht die Snapshots deshalb mit nach
(Status `INVITED` und `IN_PROGRESS`).

**Die Steuer-ID.** In der Datenbank stand für MINIJOB „Steuer: aus" — ein Stand,
der nie gewirkt hat. In dem Moment, in dem AP 1 die Konfiguration wirksam macht,
wäre die Steuer-ID aus dem Minijob-Fragebogen verschwunden. Der Entrypoint
korrigiert das einmalig und marker-gesichert.

**Die Freigabeliste.** `ERLAUBTE_FRAGEBOGEN_FELDER` in
[`src/lib/fragebogen-felder.ts`](../../../src/lib/fragebogen-felder.ts) entscheidet,
was der Auto-Save überhaupt schreiben darf. Wird ein neues Feld dort vergessen,
kommt es fehlerfrei durch die Validierung, die API antwortet mit 200 — und der
Wert landet nie in der Datenbank. Genau das ist bei AP 6 einmal passiert.

**Die Zusammenfassung.** Schritt 10 zählt seine Abschnitte fest auf. Ein neuer
Schritt erscheint dort **nicht** von selbst: Die Rentenentscheidung — die
folgenreichste Angabe im ganzen Fragebogen — fehlte zunächst beim Prüfen vor dem
Absenden, und Abschnitt 6 zeigte noch die Altfelder aus der Zeit vor AP 5/6.
Beides ist nachgezogen. Wer einen Schritt ergänzt, ergänzt auch die
Zusammenfassung **und** den PDF-Export.

**Blockieren statt leer drucken.** Der Weg über die Brief-Vorlagen ersetzt
fehlende Platzhalter still durch „___" und meldet sie nur in einem Header. Bei
einem amtlichen Antrag, der nach § 8 Abs. 2 Nr. 4a BVV in die Entgeltunterlagen
und damit in die Betriebsprüfung geht, ist ein leeres Pflichtfeld schlimmer als
kein Formular: Es sieht vollständig aus und ist es nicht. Deshalb die harte
Vorprüfung vor dem ersten Byte.

**Die Sackgasse.** Fehlt die Betriebsnummer, kann der Beschäftigte den Antrag
nicht erzeugen, also nicht unterschreiben, also nicht hochladen — und den
Fragebogen nicht absenden. Die Upload-Pflicht wird deshalb **nicht** automatisch
ausgesetzt (das würde die Schriftform still unterlaufen), sondern das Fehlen wird
früh sichtbar: Warn-Badge in der Mandantenliste, Hinweis im Dokumente-Hub des
Vorgangs, Klartext in Schritt 11 mit dem Zusatz, dass die Eingaben gespeichert
bleiben.

**Block im Absatz.** `HilfeHinweis` rendert seinen aufgeklappten Kasten als
`<span class="block">`, nicht als `<div>`. Ein `<div>` im `<p>` bricht der Browser
beim Parsen auf; Server- und Client-Struktur laufen auseinander und React meldet
einen Hydration-Fehler. Als phrasing content passt der Kasten in `<p>`, `<label>`,
`<legend>` und `<span>` gleichermaßen.

---

## 5. Was als Nächstes kommt

| AP | Inhalt | Aufwand |
|---|---|---|
| **12** | HR-Seite: Eingangsdatum und Wirkungsdatum erfassen, zwei Fristen überwachen (die frühere aus nächster Entgeltabrechnung / sechs Wochen, danach die Monatsfrist für den Widerspruch) | 12–16 h |

**Was AP 12 aus der Rechtsprüfung mitnehmen muss** (Gegenprüfung vom 27.08.2026,
drei unabhängige Blickwinkel je Regel):

- **Zwei Zweige, nicht einer.** Die Befreiung wirkt „grundsätzlich" ab Beginn des
  Eingangsmonats, frühestens ab Beschäftigungsbeginn — aber nur, wenn fristgerecht
  gemeldet wurde. Andernfalls beginnt sie erst am Ersten des übernächsten Monats
  nach Eingang der Meldung bei der Minijob-Zentrale. Welcher Zweig gilt, steht
  beim Erzeugen des Antrags noch nicht fest.
- **Zwei konkurrierende Meldetermine.** Maßgeblich ist der **frühere** aus
  nächster Entgeltabrechnung und Eingang + 6 Wochen. Eine Ampel, die nur sechs
  Wochen zählt, steht bei Eingang zu Monatsbeginn noch auf Grün, während die
  Frist über die Entgeltabrechnung längst abgelaufen ist.
- **Nicht automatisierbar.** Der Eingang der DEUEV-Meldung bei der
  Minijob-Zentrale entsteht außerhalb des Portals. Beide Widerspruchsfristen und
  der Verspätungsfall hängen daran — sie brauchen ein manuelles Erfassungsfeld
  und dürfen nicht geschätzt werden.
- **Monate rechnen, nicht Tage.** 31.01. + 30 Tage ergibt den 02.03. statt korrekt
  den 01.02.
- **Europe/Berlin, nicht UTC.** Beide Wirkungsformeln setzen auf dem *Monat* auf.
  Eine Absendung am 01.09. um 00:30 MESZ ist in UTC der 31.08. — das verschöbe das
  Ergebnis um einen vollen Monat und damit die Beitragspflicht.
- **Keine Analogie zur Aufhebung.** Für sie nennt der amtliche Text weder
  „frühestens ab Beschäftigungsbeginn" noch eine Meldefrist noch die
  Wirkungsverschiebung. Alle drei gelten nur für die Befreiung.
- **Vorschlag statt Automatik.** Die berechneten Daten haben unmittelbare
  Beitragsfolgen. Sie gehören HR als bestätigbarer Vorschlag vorgelegt, nicht als
  unveränderliches Ergebnis.

---

## 6. Was noch von außen kommen muss

1. Die **achtstelligen BA-Betriebsnummern** der 16 Mandanten. Das Feld und die
   Pflegemaske stehen (AP 8); solange eine Nummer fehlt, blockiert die
   Antragserzeugung für diesen Mandanten — bewusst, statt still mit leerer
   Pflichtangabe zu drucken. Die Mandantenliste zeigt mit einem Warn-Badge,
   welche noch offen sind.
2. Der **Termin der Entgeltabrechnung** je Mandant (AP 12). Ohne ihn überwacht das
   Portal nur die äußere Sechs-Wochen-Grenze und meldet zu spät.

---

## 7. Offene Handschritte

- **Deploy** auf `fes-vm-ubuntudocker`. Der Entrypoint führt `prisma db push` vor
  `seed-check.js` aus; die Schema-Erweiterungen (`SystemMigration`, sieben Spalten
  auf `personal_data`) kommen also von selbst mit.
- **HR vor dem Rollout informieren.** Der Renderer-Fix wirkt auf alle fünf
  Vorlagen; die Formulare ändern sich sichtbar, Ehrenamt schrumpft auf drei
  Schritte.

---

## 8. Entwicklungsumgebung

Die Dev-Datenbank läuft im Container `credo-hr-db-dev` auf **Port 5433** — nicht
5432. Die `.env` zeigt auf 5432, die richtige URL steht in **`.env.local`**.
Prisma-CLI-Befehle laden `.env`, nicht `.env.local`:

```bash
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')"
```

Dev-Server über `.claude/launch.json` (`credo-hr-dev`, Port 3000).

**Testvorgang für den Prozess-Durchgang:** `2026-BK-002`, Lena Bergmann,
Berufskolleg (767), Fragebogentyp MINIJOB. Der Magic Link steht auf der
Vorgangs-Detailseite im Portal.

Zum Absenden ist ein Upload nötig — die Geburtsurkunde ist als Pflichtdokument
hinterlegt.
