# Minijob-Checkliste — Umsetzungsstand

> **Stand:** 2026-08-26 · Branch `feat/minijob-checkliste-2026` (auf `origin`)
> **Fertig:** AP 1, AP 2 · **Als Nächstes:** AP 5 → 6 → 7
> **Verifiziert:** 547 Tests grün (44 Suites) · `tsc --noEmit` sauber · `npm run lint`
> ohne Errors · `npm run build` erfolgreich · Durchstich gegen die Dev-Datenbank gemacht

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

## 4. Zwei Fallen, die schon zugeschnappt sind

**Der Snapshot.** Der Fragebogen liest bevorzugt
`OnboardingProcess.formTemplateSnapshot` — eine bei der Anlage eingefrorene Kopie
der Vorlagenkonfiguration. Wer die Vorlage korrigiert, erreicht damit **nicht** die
laufenden Vorgänge. Die Entrypoint-Korrektur zieht die Snapshots deshalb mit nach
(Status `INVITED` und `IN_PROGRESS`).

**Die Steuer-ID.** In der Datenbank stand für MINIJOB „Steuer: aus" — ein Stand,
der nie gewirkt hat. In dem Moment, in dem AP 1 die Konfiguration wirksam macht,
wäre die Steuer-ID aus dem Minijob-Fragebogen verschwunden. Der Entrypoint
korrigiert das einmalig und marker-gesichert.

---

## 5. Was als Nächstes kommt

**AP 5 → 6 → 7** ist die fachliche Kernkette und streng seriell.

| AP | Inhalt | Aufwand |
|---|---|---|
| **5** | Ein Datenmodell mit Kategorie-Kennzeichen für die drei Tabellen (weitere Beschäftigung / Vorbeschäftigung / Ausland) | 12–16 h |
| **6** | Schritt 6 neu: 17 Statusoptionen, drei Tabellen, Additionsfrage, bedingte Nachweise | 44–56 h |
| **7** | Schritt 11 „Rentenversicherung": Vier-Wege-Entscheidung, Merkblatt, Antragserzeugung | 18–24 h |

**Beim Anlegen von Registry-Schritt 11 (AP 7) zu beachten:**

- In `FRAGEBOGEN_STEPS` **vor** der Zusammenfassung einsortieren, Nummer 11.
- `FragebogenStepKey` um `"rente"` erweitern — Fragebogen *und* Vorschau brechen
  dann im Typecheck und erzwingen die Ergänzung. Das ist Absicht.
- Ein Eintrag in `FIELD_REGISTRY[11]` ist Pflicht (ein Test prüft das).
- Die bestehenden `stepsConfig` in der Datenbank kennen die 11 nicht → sie gilt
  als abgeschaltet. Für MINIJOB muss sie **aktiv gesetzt** werden, entweder im
  Vorlagen-Editor oder über eine `SystemMigration`.
- Der Minijob-Fragebogen hat danach **neun** Schritte statt acht.

---

## 6. Was noch von außen kommen muss

1. Die **achtstelligen BA-Betriebsnummern** der 16 Mandanten (AP 8). Ohne sie
   blockiert die Antragserzeugung — bewusst, statt still mit leerer Pflichtangabe
   zu drucken.
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
