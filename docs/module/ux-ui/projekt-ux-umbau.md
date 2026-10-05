# UX-Umbau „Klarer Weg“ – Projektstand

**Hier einsteigen.** Für die nächste Sitzung: zuerst Abschnitt 0 (Übergabe). Diese Datei ist das Logbuch des Projekts: Stand, Entscheidungen, Regeln,
Abweichungen vom Plan und ein Protokoll je Arbeitstag. Sie wird mit **jedem** Commit auf
`ux-umbau` fortgeschrieben.

Letzte Änderung: 05.10.2026 (Merge von `main` mit dem Token-Fix Vertragsende; nicht gepusht)

## 0. Übergabe (Stand 05.10.2026)

### 0.1 Wo wir stehen

- **U0** (Tokens, neun Bausteine, Musterseite) und **U1** (ein Kopf, neue Adressen) sind gebaut,
  abgenommen und gepusht. **Nichts vom Umbau ist deployt.**
- **Pilot Vertragsende:** Feinplan [pilot-feinplan.md](pilot-feinplan.md) am 02.10.2026
  freigegeben (Fragen F1–F9, Kurzform in Abschnitt 4 als P-F1 bis P-F9). Gebaut sind:
  - **Tag 1 – Regeln** (`src/lib/prozess/prozess-stand.ts`, `src/lib/prozess/vertragsende.ts`,
    `src/lib/contract-end-status.ts`): Datenmodell der Prozessleiste, Adapter Vertragsende
    (Schritte, „Jetzt dran“, Menü, Statuspille), Statuslisten aller HR-Routen an einer Stelle.
  - **Tag 2 – Bausteine** (`src/components/ui/prozessleiste.tsx`, `src/components/ui/reiter.tsx`)
    auf der Musterseite `/ui-muster` – die Prozessleiste dort in acht echten Lagen des
    Vertragsendes (Klick-Dummy für den Prototyp-Tag).
  - Sechs Durchsichten insgesamt, alle bestätigten Befunde behoben.
- **Gepusht am 05.10.2026:** `origin/ux-umbau` bis einschließlich des Logbuch-Commits vom
  05.10.2026 (nach `61b817f`). Typen, Lint und alle Tests grün (192 Suiten, 5.043 Tests –
  geprüft ohne die fremden Arbeitskopien unter `.claude/`, siehe 0.3).
- **Noch NICHT gebaut:** die Detailseite selbst (Feinplan Tag 3–7: Bausteine Hinweis und
  Textfeld, neue Ansicht, Dialoge, Vorschau-Schalter, Abnahme). Laut Leitplanke erst NACH dem
  Prototyp-Tag (V0).

### 0.2 Erste Schritte der neuen Sitzung (in dieser Reihenfolge)

1. **Stand prüfen:** `git switch ux-umbau`, `git status`, `git log --oneline -6`,
   `git fetch` und `git rev-list --left-right --count origin/ux-umbau...HEAD` (erwartet `0 0`).
   Uncommittet sind nur `docs/README.md` (LOGA-Abschnitt) und `docs/module/loga/` – eigener
   Strang, NICHT in UX-Commits aufnehmen.
2. **Erledigt am 05.10.2026** (Protokoll „Merge von `main`“ in Abschnitt 7).
   **`main` nachziehen** (`git merge main`, nicht rebasen). Auf `main` liegen seit dem Abzweig
   zwei Commits zum Vertragsende: `6982015` und `3f6d3b0` – der Token der Führungskraft
   (`supervisorToken`) steht nicht mehr in den Antworten der HR-Routen (neu:
   `src/lib/contract-end-antwort.ts`). **Konflikte sind sicher**, beide Seiten haben dieselben
   Dateien angefasst:
   - `src/app/api/contract-end/[id]/route.ts`, `…/[id]/nicht-uebernehmen/route.ts`,
     `…/[id]/supervisor-link/route.ts` – BEIDES behalten: unsere Statuslisten aus
     `contract-end-status.ts` UND deren Antwort ohne Token.
   - `src/__tests__/api/contract-end-nicht-uebernehmen.test.ts`,
     `…/contract-end-reminder-manual.test.ts` – beide Ergänzungen behalten.
   - `src/__tests__/api/contract-end-supervisor-link.test.ts` – von BEIDEN Seiten neu angelegt
     (add/add): zu einer Datei zusammenführen (unsere Fälle: welcher Status gesperrt ist;
     deren Fälle: kein Token in der Antwort).
   - Danach prüfen: `supervisorTokenExpiresAt` muss in der Antwort von
     `GET /api/contract-end/[id]` bleiben (Pflichtfeld des Adapters). Logbuch-Eintrag „Merge von
     `main`“ wie am 01.10.2026.
3. **`tageZwischen`:** Auf dem lokalen Branch `perf/tagezwischen-direkte-rechnung` (`099680d`,
   nicht gepusht, nicht in `main`) rechnet die Funktion ohne Monatsschleife (Jest-Gesamtlauf laut
   jener Sitzung 64 s → 30 s). Erst nach `main` bringen (Entscheidung des
   Projektverantwortlichen), dann hierher mergen und die Hinweise „kostet unter Jest rund
   10 ms“ streichen: Kommentar über `PROBEN` in `src/__tests__/lib/prozess-vertragsende.test.ts`,
   Kommentar über `LAGEN` in `src/app/(portal)/ui-muster/prozessleiste-muster.tsx`, CLAUDE.md
   (Punkt „Prozess-Stand“).
4. **Arbeitskopien aufräumen:** Unter `.claude/worktrees/` liegen zwei (`bold-heisenberg-a615cf`,
   `nervous-ritchie-2bbb51`) aus den Nebenaufgaben. Wenn deren Sitzungen fertig sind:
   `git worktree list`, dann `git worktree remove <pfad>`. Solange sie liegen, siehe 0.3.

### 0.3 Prüfen, solange fremde Arbeitskopien unter `.claude/` liegen

`npm run pruefen` nimmt sie mit (`tsconfig.json` schließt nur `node_modules` aus, Jest kennt
keine Ausnahme) – dreifache Laufzeit und fremde Fehler. Dann so prüfen:

```bash
printf '{ "extends": "./tsconfig.json", "exclude": ["node_modules", ".claude"] }\n' > tsconfig.pruefen.tmp.json && npx tsc --noEmit -p tsconfig.pruefen.tmp.json; rm -f tsconfig.pruefen.tmp.json
```

```bash
npx next lint && npx jest --testPathIgnorePatterns ".claude"
```

Dauerhaft lösen (auf `main`): `.claude` in `tsconfig.json` (`exclude`) und in
`jest.config.ts` (`testPathIgnorePatterns`, `modulePathIgnorePatterns`) aufnehmen.

### 0.4 Nächste Aufgabe: der Prototyp-Tag (V0)

Termin setzt der Projektverantwortliche mit dem Personalbüro. Vorbereitet ist die Musterseite
`/ui-muster` (nur `SUPER_ADMIN`): Prozessleiste in acht Lagen, Reiter, alle Bausteine. Am
Prototyp-Tag zu klären:

| Frage | Woher |
|---|---|
| Texte von „Jetzt dran“ je Status, Statuspillen („Wartet auf Führungskraft“ …) | Feinplan 3.3 und 3.5 – alles dort nur angenommen |
| Was am Handy von den Schritten sichtbar sein soll (heute nur Punkte und „Schritt 4 von 5 · Vertrag“) | Feinplan 11, offen 1 |
| Ob ein klickbarer Schritt ein sichtbares Zeichen braucht | Feinplan 11, offen 2 |
| „sonst: Offboarding“ nach dem Abschluss weiter zeigen? | Feinplan 11, offen 3 |
| E9 Dichte der Listen, E11 Anzeigenamen der Module, E13 Textbausteine | Plan, Abschnitt 6 |

Ergebnisse in Abschnitt 4 (Entscheidungen) und im Feinplan festhalten, danach Tag 3.

### 0.5 Danach: Tag 3 bis 7 (Feinplan, Abschnitt 6)

Tag 3 Bausteine **Hinweis** und **Textfeld** (Feinplan 3.1), neue Ansicht lesend (Kopf, Leiste,
Hinweise, Reiter Übersicht); Tag 4 Handlungen und Dialoge, Reiter Vertragsdaten/Dokumente/
E-Mails, `?tab=`; Tag 5 Vorschau-Schalter (Cookie `ansicht-vertragsende=neu`, P-F1), Testdaten,
Seitentest; Tag 6–7 Abnahme, Durchsicht, Dokumentation. Dateien der neuen Ansicht neben
`src/app/(portal)/vorgaenge/vertragsende/[id]/page.tsx` (Feinplan 3.7); die alte Ansicht bleibt
unverändert, bis der Schalter entfällt. Entschieden und einzubauen: „Vorgang stornieren …“ im
Menü (P-F2), „Abschließen …“ auch nach „keine Übernahme“ mit Verweis zum Offboarding (P-F3),
Hinweis bei überschrittenem Vertragsende (P-F4, im Adapter schon drin), Rückmeldung per
`mailto:personalbuchhaltung@fes-minden.de` (P-F5).

### 0.6 Werkzeuge und Fallen

- **Anmelden im Browser für Abnahmen:** Testkonto `claude-test-admin@beispiel.invalid`
  (`SUPER_ADMIN`, nur Dev-DB auf Port 5433). Passwort NIE ausgeben: in einer Zeile mit
  `node scripts/dev-passwort-neu.js claude-test-admin@beispiel.invalid` erzeugen, per `grep`
  in eine Shell-Variable, direkt an `DEV_EMAIL=… DEV_PASSWORT="$PW" node scripts/ux-abnahme.js
  muster` übergeben. Dev-Server über die Startkonfiguration `credo-hr-dev`.
- **Abnahme-Skripte:** `scripts/ux-abnahme.js` (`muster` – drei Breiten nach `screenshots/`,
  `seiten`, `vergleich`), `scripts/ux-abnahme-u1.js` (Rollen, An-/Abmelden, Tastatur).
  `puppeteer-core` ist installiert; `forced-colors` lässt sich damit NICHT nachstellen.
- **Radix Tabs** wählt bei `mousedown`, nicht bei `click` – Tests spielen die ganze Folge einer
  Maustaste (`klick()` in `ui-reiter.test.tsx`).
- **Farbtabellen:** Tokens nur über `src/__tests__/hilfen/farb-tokens.ts`; jede neue Tabelle
  `…_FARBEN` braucht eine Rechnung (Wächter in `ui-kontrast.test.ts`) UND einen Test, dass das
  Markup sie benutzt.
- **Arbeitsabläufe mit Agenten** (Ultracode): danach IMMER `git status`, `git log`,
  `git rev-list … origin/ux-umbau...HEAD` prüfen – Agenten dürfen nicht committen oder pushen.
- Lange Python-Heredocs mit Backticks scheitern in der Bash: Skript in den Scratchpad schreiben.

### 0.7 Offen beim Projektverantwortlichen

Deploy von U0 + U1 (mit Ankündigung an das Personalbüro; Pilot-Teile sind noch nicht
sichtbar); Termin Prototyp-Tag; Deploy von `main` (Token-Fix Vertragsende, Checklisten,
Paket 3 mit zwei neuen Tabellen); Entscheidung über `perf/tagezwischen-direkte-rechnung`.

## 1. Worum es geht

Das Portal bekommt eine gemeinsame Sprache der Oberfläche: eine Prozessleiste für alle Module,
gruppierte Listen statt Kartenwände, eigene Dialoge statt Browser-Rückfragen, eine
Interaktionsfarbe. Die Fachlogik bleibt unangetastet.

| Dokument | Wofür |
|---|---|
| [ux-ui-plan-2026-09.html](ux-ui-plan-2026-09.html) | Der Plan (Fassung 3): Bewertung, Zielbild mit Mockups, Pakete, Entscheidungen, Leitplanken |
| [u0-feinplan.md](u0-feinplan.md) | Feinplan U0 (gebaut und abgenommen) |
| [u1-feinplan.md](u1-feinplan.md) | Feinplan U1 (gebaut und abgenommen) |
| [pilot-feinplan.md](pilot-feinplan.md) | Feinplan Pilot Vertragsende (freigegeben 02.10.2026) |
| `projekt-ux-umbau.md` (diese Datei) | Stand, Protokoll, Abweichungen |
| `CLAUDE.md`, Abschnitt „Oberfläche (UX-Umbau)“ | Die Regeln, die beim Programmieren gelten |
| [screenshots/](screenshots/) | Vorher-Bilder (erzeugt von `scripts/ux-screenshots.js`) und die Musterseite in drei Breiten (`ui-muster-*.png`, erzeugt von `scripts/ux-abnahme.js`) |

## 2. Stand auf einen Blick

| Paket | Inhalt | Stand |
|---|---|---|
| Schritt 0 | Entscheidungen vor U0, Plan committen | **erledigt** 01.10.2026; offen: Paket 3 deployen |
| V0 | Prototyp-Tag mit dem Personalbüro, Testdaten, Screenshot-Skript | offen – Termin setzt der Projektverantwortliche; **Voraussetzung für den Pilot** (der Plan verlangt ihn vor jedem Paket außer U0; U1 ist als reiner Rahmen davon ausgenommen, siehe Abschnitt 5) |
| **U0** | Tokens und Basis-Bausteine | **gebaut und abgenommen** (02.10.2026): alle neun Bausteine, Musterseite, Build grün, Screenshots in drei Breiten, fünf bestehende Seiten bildgleich mit `main`. Gepusht am 02.10.2026. Offen: Tastaturprobe von Hand durch den Projektverantwortlichen, Deploy (Empfehlung: zusammen mit U1) |
| U1 | Rahmen: ein Kopf für alle Seiten, neue Adressen | **gebaut und abgenommen** (02.10.2026): neue Adressen mit Weiterleitung, ein Kopf im Layout. Gepusht am 02.10.2026. Offen: Deploy zusammen mit U0, Ankündigung an das Personalbüro |
| Pilot | U2 + U4 für Vertragsende, Vorschau-Schalter | **Feinplan freigegeben** (02.10.2026, [pilot-feinplan.md](pilot-feinplan.md)); **Tag 1 (Regeln) und Tag 2 (Prozessleiste, Reiter, Musterseite) gebaut, durchgesehen und gepusht** (05.10.2026); die Seite (ab Tag 3) erst nach dem Prototyp-Tag (V0) |
| danach | Reihenfolge laut Plan, Abschnitt 5 | offen |

## 3. Arbeitsweise

- **Branch:** `ux-umbau` (von `main`). Alles zum Umbau landet dort, je Arbeitstag mindestens ein
  Commit. `main` bleibt deploybar; Dinge, die nichts mit dem Umbau zu tun haben, gehen direkt
  nach `main`, danach wird `ux-umbau` mit `git merge main` nachgezogen. Kein Rebase mehr: Er
  ändert die Commit-Kennungen, und dieses Logbuch verweist auf sie (am 01.10.2026 zweimal
  passiert, Abschnitt 8 nennt die gültigen).
- **Nichts wird ohne Auftrag gepusht.** Das Repository ist öffentlich.
- **Vor jedem Push `npm run pruefen`** (Typen, Lint, Tests). Es gibt weder CI noch Git-Hooks,
  und der Docker-Build führt keine Tests aus – Sperrklinke und Kontrasttest greifen nur, wenn
  jemand sie laufen lässt.
- **Je Paket ein Feinplan** in diesem Ordner, vor dem ersten Code: Umfang, Nicht-Umfang,
  Dateien, Tests, betroffene Mail- und Word-Vorlagen, Schema-Delta, Abnahme, Deploy.
- **Je Commit:** Protokoll in Abschnitt 7 ergänzen, Stand in Abschnitt 2 nachziehen,
  Abweichungen vom Plan in Abschnitt 5 eintragen. Regeln, die beim Programmieren gelten,
  gehören zusätzlich in `CLAUDE.md`.
- **Abnahme je Paket:** `npm run test`, `npm run lint`, `npm run build`; Screenshots in 1440,
  1366×768 und 390 px; Tastaturprobe.
- **Kein Modul außer dem Pilot** wird umgestellt, bevor das Personalbüro zwei Wochen mit dem
  Pilot gearbeitet hat (Leitplanke aus dem Plan).

## 4. Entscheidungen

Vollständig mit Begründung und verworfener Alternative im Plan, Abschnitt 6. Hier die Kurzform.

### Vor U0 (alle am 01.10.2026)

| # | Thema | Entschieden |
|---|---|---|
| E1 | Farbregel | CI-Farben nur für CREDO-Linie und Einrichtungen; Zustände aus einer funktionalen Palette; eine Interaktionsfarbe CI-Grau. CI-Freigabe erteilt. |
| E3 | Navigation | Obere Leiste bleibt, höchstens sechs Punkte: Start · Aufgaben · Vorgänge · Personen · BEM · Verwaltung. Module eine Ebene darunter. Seitenliste im Plan, Abschnitt 4 A. |
| E4 | Adressen | Nur der Pfad ändert sich: `/vorgaenge/<modul>/<uuid>`, BEM `/bem/<uuid>`. Die UUID bleibt. `/dashboard/…` leitet dauerhaft weiter (Middleware). |
| E5 | Dunkler Modus | Nein. Portal fest hell (`color-scheme: only light`), Tokens vorbereitet. |
| E6 | Anrede | „du“ nur hinter der Anmeldung (`src/app/(portal)/`), überall sonst „Sie“ – Link-Seiten, Anmeldeseite, **alle** E-Mails, PDFs, Briefe. Es entscheidet der Ort des Textes. Portal-Texte möglichst ohne Anrede. |
| E7 | Schrift | Montserrat für alles; ITC Avant Garde aus dem Token gestrichen. Abweichung vom CI bestätigt; Maßgabe: überall gleiches Aussehen. |
| E10 | Pilotmodul | Vertragsende. Onboarding folgt direkt danach. |

### Zum Feinplan U0 (01.10.2026)

| # | Thema | Entschieden |
|---|---|---|
| F1 | Dialog | Neu auf Radix; die vier Regeln aus `unterlagen/dialog-rahmen.tsx` werden übernommen. Bestehende Dialoge ziehen erst mit U4/U10 um. |
| F2 | `jest-axe` | Ja, als Entwicklungsabhängigkeit. |
| F3 | Musterseite | `/ui-muster`, auch in Produktion, nur `SUPER_ADMIN`, ohne Navigationseintrag. |
| F4 | Zuschnitt U0 | Aufgaben-Badge → Paket 6, Suchfeld → U1, Datumsfeld → erstes Formular, das es braucht. |

### Zum Feinplan U1 (02.10.2026)

| # | Thema | Entschieden |
|---|---|---|
| U1-F1 | Zuschnitt | U1 ändert nur Kopf und Adressen. Seitenkopf-Baustein und einheitliche Breite je Modul mit dessen Paket (Vertragsende im Pilot, übrige U4, Verwaltung U6); Suche nach dem Pilot. |
| U1-F2 | Modulnamen in der Adresse | `onboarding`, `offboarding`, `vertragsende`, `verbeamtung`, `elternzeit`, `mutterschutz` – dauerhaft. Die Anzeigenamen (E11) bleiben offen. |
| U1-F3 | „Formulare“ bei der Sachbearbeitung | Punkt ausblenden – der Kopf zeigt nur, was die Rolle öffnen kann. Keine Berechtigung ändert sich. |
| U1-F4 | Dateien der Module | bleiben unter `dashboard/` liegen, ziehen mit U4 um. |

### Zum Feinplan Pilot Vertragsende (02.10.2026)

| # | Thema | Entschieden |
|---|---|---|
| P-F1 | Vorschau-Schalter | Cookie im Browser, kein Schema-Delta; Vorgabe alte Ansicht. |
| P-F2 | Stornieren | „Vorgang stornieren …“ als kritischer Menüpunkt, nur `HR_EDIT_ROLES`, mit Rückfrage. |
| P-F3 | Abschließen nach „keine Übernahme“ | Ja. Die Rückfrage beim Anlegen sagt, dass ein neuer Offboarding-Vorgang gestartet wird; Verweis zum Offboarding auch im Abschluss-Dialog. Kein „keine Übernahme“ ohne Offboarding. |
| P-F4 | Überschrittenes Vertragsende | kritische Zeile in „Jetzt dran“; Ampel-Funktion unverändert. |
| P-F5 | Rückmeldungen | `mailto:` an `personalbuchhaltung@fes-minden.de`. |
| P-F6 | Klebende Leiste, Kompaktmodus | erst mit Onboarding; im Pilot nur messen (1366×768). |
| P-F7 | `VALID_TRANSITIONS` | in eine reine Datei verschieben, Route und Test lesen dieselbe Tabelle. |
| P-F8 | Statustexte der Pille | sagen, wer dran ist; Liste zeigt bis U3 die alten Texte. Endgültig nach V0. |
| P-F9 | Reihenfolge mit V0 | Tag 1–2 vorher, die Seite danach. |

### Noch offen

| # | Thema | Gebraucht vor |
|---|---|---|
| E9, E11, E13 | Dichte der Listen, Modulnamen, Textbausteine | Pilot – beantwortet der Prototyp-Tag (V0) |
| E2, E8 | Startseite, Personenseite | U3 bzw. U8 |
| E12, E14 | Reiter „Verlauf“, Sprache der automatischen Läufe | U10 bzw. U6 |
| LOGA (E17, E19, E20, E22) | eigener Strang, siehe `docs/module/loga/` | L0 |

## 5. Abweichungen vom Plan

Jede Stelle, an der die Umsetzung bewusst anders ist als der Plan, mit Grund.

| Wo | Plan | Umsetzung | Grund |
|---|---|---|---|
| Zustandsfarben | `ok #2e7d32`, `wait #b45309`, `info #1d6fa5` | `ok #27702b`, `wait #a34a08`, `info #1a6494` | Auf ihrem `-soft`-Grund erreichten die Planwerte nur 4,0–4,6:1 (nötig 4,5:1, auch auf dem Seitengrund). Die abgedunkelten Werte liegen bei 4,7–5,4:1. `critical` blieb unverändert (5,1:1). |
| Nebentext `ink-2` | `#6b6b67` | `#666662` | In der neutralen Pille (auf `neutral-soft`) nur 4,3:1 auf dem Seitengrund; jetzt 4,6:1. |
| Heller Ton `ink-3` | in den Mockups auch für Beschriftungen | nur für Gesperrtes, Trennzeichen, Zierde | 2,8:1 auf Weiß – kein Textton. Beschriftungen und Platzhalter in Eingabefeldern nehmen `ink-2`. |
| Umfang U0 | Aufgaben-Badge, Suchfeld, Datumsfeld, Datumsfunktion, `toLocaleDateString` ablösen | siehe F4; die Datumsfunktion gibt es schon (`formatDatumDE`), das Ablösen kommt je Modul mit U4 | Bausteine ohne Aufrufer vermeiden; das Ablösen ändert sichtbar das Verhalten (Zeitzone des Geräts bzw. des Containers → deutsche Zeit) und muss je Modul geprüft werden. |
| Emojis | U0: „Emojis aus Navigation und BEM-Bannern entfernen“ | Navigation → U1, BEM-Banner → U4 (BEM) | Beides gehört zu Dateien, die diese Pakete ohnehin umbauen; U0 fasst keine bestehende Seite an. |
| U0 zusätzlich | – | Kontrasttest, Musterseite, `cn()` mit eigenen Größen-Tokens | siehe Feinplan, Abschnitt 5 und 3.3 |
| Sperrklinke | – (nicht im Plan) | Test auf `main`, je Datei, ohne Kommentare | Fachpakete entstehen auf `main`; nur dort verhindert sie neue Altmuster. |
| Zahlen der Altmuster | 28 `confirm()`, 47 `toLocaleDateString`, 27 Überlagerungen, 146 Inline-SVG | 30 / 72 / 29 / 150 (gemessen 01.10.2026, ohne Kommentare, alle `.ts`/`.tsx`) | Der Plan zählte nur `.tsx`. Echter Zuwachs seit dem 24.09.: +2 `confirm()`, +2 Überlagerungen, +4 SVG, +11 Hex-Farben; `toLocaleDateString` unverändert. Die frühere Erklärung „5 neue confirm(), 27 neue toLocaleDateString“ war ein Zählartefakt. |
| Varianten der Bausteine | – (Feinplan: `class-variance-authority`) | exportierte Tabellen (`BUTTON_FARBEN`, `STATUS_TOENE`) | Kontrasttest und Musterseite müssen Schlüssel und Klassen lesen; `cva` gäbe nur eine Funktion heraus. |
| Hover des kritischen Knopfs | – | eigenes Flächen-Token `critical-hover` | Ein Filter (`brightness`) dunkelt auch die Schrift ab und senkt den Kontrast. |
| `color-scheme` | E5: `light` | `only light` | `light` verhindert erzwungenes Abdunkeln nicht. |
| Gruppentitel-Ebene | – | Vorgabe `h2` | Gruppen stehen direkt unter dem Seitentitel; `h3` verletzte die Überschriften-Reihenfolge. |
| Dialog: Klick daneben | – (Radix schließt dabei) | schließt nicht | Ein halb ausgefülltes Formular ginge durch einen verrutschten Klick verloren; der bestehende Rahmen (`dialog-rahmen.tsx`) schließt dort auch nicht. |
| Dialog: Knöpfe während der Aktion | bestehender Rahmen: `disabled` | `aria-disabled` (über den `Button`) | Der Fokus fällt nicht mehr auf `body`; Regel 7. |
| Toast mit „Rückgängig“ | Erfolg 5 s | 10 s, wenn „Rückgängig“ angeboten wird | Fünf Sekunden reichen zum Lesen, nicht zum Lesen und Entscheiden. |
| Toast-Aufruf | `toast.ok`, `toast.fehler` | dazu `toast.hinweis`; Speicher auf Modulebene statt Hook | Aus jedem Handler rufbar; eine Meldung kurz vor einem Seitenwechsel geht nicht verloren. |
| Schleier des Dialogs | – | eigenes Token `scrim` | Keine fest eingetragene Farbe und kein `/40` in einer Klasse. |
| Segment-Schalter | „Tastatur wie Radix Tabs“ | eigene Auswahlgruppe (`radiogroup`), Pfeiltasten wie bei Reitern | Radix Tabs verweist jeden Reiter auf ein Inhaltsfeld (`aria-controls`); der Schalter filtert eine Liste und hat keines – axe meldete den toten Verweis. |
| Schatten `shadow-overlay` | nur Dialog und Toast | auch das „…“-Menü des Seitenkopfs | Gilt für alles, was über der Seite schwebt. |
| Skelett | „`aria-busy`, kein Text „Lädt…“ nötig“ | `role="status"`, `aria-busy` und EIN Satz nur für Screenreader | Ohne Text erfährt ein Screenreader nicht, dass geladen wird; sichtbar bleibt es bei den Balken. |
| Umfang U1 | Kopf, Breadcrumb, Breite `6xl` überall, Suche (Strg+K) | nur Kopf und Adressen (U1-F1) | Seitenkopf und Breite ändern jede einzelne Seite – das ist der Umbau des Moduls und steht vor dem Pilot nicht an; die Suche hängt an allen sieben Modulen. |
| Ordner der Module | – (E4 nennt nur die Adressen) | Dateien bleiben unter `dashboard/`, neue Adressen über dünne Seiten-Dateien (U1-F4) | Sonst muss jede Änderung von `main` beim Nachziehen von Hand umgelegt werden. |
| Rollennamen | „Rollenname aus `permissions.ts`“ | Tabelle `ROLLEN_NAMEN` in `src/lib/navigation.ts` | `permissions.ts` zieht die Datenbank mit und darf nicht in den Browser; der Kopf ist eine Client-Komponente. |
| Hauptüberschrift | – (Feinplan: „HR-Portal“ ist keine `h1` mehr) | neun Verwaltungsseiten: Seitentitel von `h2` zu `h1`; Vorgangslisten: unsichtbare `h1` | Ohne die `h1` des Kopfs hätten diese Seiten gar keine mehr gehabt. Aussehen unverändert. |
| An- und Abmelden | – | volles Laden der Seite statt Wechsel im Client (`seiteNeuLaden`) | Der Kopf hängt im Layout; ein gemerktes Layout zeigte nach einem Kontowechsel Namen und Punkte des alten Kontos. |
| Fragebogen-Vorschau | – | eigene Ordnergruppe `(portal-ohne-kopf)`, Adresse unverändert | Die Vorschau zeigt den Fragebogen, wie ihn die Person sieht; über das Layout hätte sie den Portal-Kopf bekommen. |
| Rollennamen der Benutzerverwaltung | Feinplan: Zusammenführen mit U6 | schon jetzt aus `rollenName()` | Befund der vierten Durchsicht; sonst hieße dieselbe Person im Kopf „Führungskraft“ und in der Liste „Vorgesetzter“. |
| Prototyp-Tag | „Kein Paket außer U0 startet ohne den Prototyp-Tag“ | gilt ab dem Pilot; U1 darf vorher | U1 ändert nur den Rahmen (Kopf, Breadcrumb, Adressen) und hängt an keiner der Fragen des Prototyp-Tags (E9, E11, E13). |
| Prototyp-Tag, Pilot | wie oben | Tag 1–2 des Pilots (Regeln, Bausteine auf der Musterseite) vor V0, die Seite danach (P-F9) | Nichts davon sieht das Personalbüro; die Musterseite mit der Leiste ist der Klick-Dummy für V0. |
| Prozessleiste: kompakt und klebend | „Sticky mit Kompaktmodus beim Scrollen und unter 640 px“ | unter 640 px kompakt, aber nicht klebend (P-F6) | Die Seiten des Vertragsendes sind kurz; der Nutzen zeigt sich erst im Onboarding. |
| Prozessleiste: Zustände | erledigt, aktiv, parallel, kommend, blockiert, übersprungen, verzweigt, Schleife, abgebrochen/pausiert, Zeitachse | erledigt, aktiv, kommend, übersprungen, verzweigt (als Hinweis am Schritt), Ende abgeschlossen/abgebrochen | Nur was Vertragsende braucht; der Rest kommt mit dem Modul, das ihn braucht. |
| Reiter | – (Feinplan: Radix Tabs) | Radix Tabs, aber: ein Klick meldet einmal, Tab-Halt folgt der Auswahl, Bild-auf/-ab rollen die Seite | Radix meldet je Klick zweimal, merkt sich den zuletzt fokussierten Reiter und belegt Bild-auf/-ab – alle drei stören, sobald die Seite den Reiter in der Adresse führt. |

Die Mockups im Plan zeigen weiter die ursprünglichen Farbwerte; maßgeblich ist `globals.css`.

## 6. Regeln, die schon gelten

Kurzfassung; verbindlich und ausführlich in `CLAUDE.md`, Abschnitt „Oberfläche (UX-Umbau)“.

1. Neue Oberfläche nutzt nur die neuen Tokens (`surface`, `ink`, `action`, `ok`, `wait`,
   `critical`, `info`, …) und – sobald vorhanden – die Bausteine aus `src/components/ui/`.
2. Kein neues `confirm()`, `alert()`, `prompt()`, `toLocaleDateString`/`toLocaleTimeString`,
   keine fest eingetragene Farbe (Hex oder Farbfunktion in einer Klasse, Hex im `style`-Objekt,
   Tailwind-Palettenklasse), keine neue selbst gebaute Überlagerung, kein neues Inline-SVG, kein
   `text-ink-3`. Die Sperrklinke (`ui-sperrklinke.test.ts`, elf Muster, auf `main`) hält den
   Stand je Datei fest; wer ein Altmuster entfernt, schreibt den Stand im selben Commit neu.
3. Farbpaare stehen als exportierte Tabelle im Baustein; der Kontrasttest liest sie von dort.
   Kein `opacity`, kein Filter, kein `/50` in Farbklassen.
4. `ink-3` nie für Text, auch nicht für Platzhalter in Eingabefeldern.
5. Anrede nach E6; Portal-Texte möglichst ohne Anrede.
6. Wer einen Baustein baut oder ändert, trägt ihn auf der Musterseite `/ui-muster` ein und
   prüft seine Regeln in `ui-bausteine.test.tsx` (mit axe).
7. „Gesperrt, während etwas läuft“ heißt `aria-disabled`, nicht `disabled` – der Knopf
   behält den Tastaturfokus. Der `Button` sperrt dann wirklich (auch bei einem mitgegebenen
   `aria-disabled`); wer einen rohen `<button>` so sperrt, muss den Klick selbst abfangen.
8. Jedes Größen-Token (`--shadow-*`, `--text-*`, `--tracking-*`) wird in `src/lib/utils.ts` bei
   tailwind-merge eingetragen.
9. Zeilen, in denen Statuspillen stehen, bekommen keinen getönten Hover (die `-soft`-Töne sind
   halbtransparent und nur auf Karte und Seitengrund gerechnet).
10. Rückfragen und Meldungen kommen aus `ui/dialog.tsx` (`BestaetigungsDialog`) und
    `ui/toast.tsx` – in neuer Oberfläche keine Browser-Rückfrage, kein Hinweisfenster und
    keine eigene Überlagerung. Ein Fehler, zu dem etwas korrigiert werden muss, gehört in den
    Dialog (`fehler`), nicht in einen Toast.

## 7. Protokoll

### 01.10.2026 – Schritt 0 und U0, Tag 1

**Entschieden:** E1, E3, E4, E5, E6, E7, E10 und F1–F4 (Abschnitt 4).

**Dokumente:**
- Plan Fassung 3 mit den Entscheidungen und der Seitenliste (Abschnitt 4 A) committet.
- Feinplan U0 geschrieben und freigegeben.
- Diese Datei angelegt; `CLAUDE.md` um den Abschnitt „Oberfläche (UX-Umbau)“ ergänzt.

**Code (U0, Tag 1):**

| Datei | Änderung |
|---|---|
| `src/app/globals.css` | 19 neue Tokens (Flächen, Tinte, Aktion, vier Zustände mit `-soft`, Schatten für Überlagerungen); `--font-heading` auf Montserrat; `color-scheme: light` |
| `src/lib/ui/kontrast.ts` | neu: Farbe lesen, auf Untergrund legen, Leuchtdichte, Kontrast nach WCAG 2.1 |
| `src/__tests__/lib/ui-kontrast.test.ts` | neu: rechnet jedes Token-Paar der Bausteine auf Karte und Seitengrund |
| `src/__tests__/lib/ui-sperrklinke.test.ts` | neu: sechs Altmuster dürfen nur weniger werden |

**Geprüft:** Die beiden neuen Tests und die gesamte Testsuite; Typprüfung und Lint der neuen
Dateien. Der laufende Entwicklungsserver liefert die neuen Tokens und `color-scheme: light`
aus; die Schrift wird von `next/font` unter dem Namen „Montserrat“ ausgeliefert, das Token
greift also auf jedem Rechner.

**Sichtbare Änderung:** keine. Auch die Schrift ändert sich nirgends: `--font-heading` war
definiert, wurde aber von keiner Seite benutzt (die Aussage „einmal verwendet“ im Plan war
falsch; in der Durchsicht berichtigt).

**Nebenbei, auf `main`:** Reihenfolge der Punkte im Checklisten-Vorlagen-Editor per Ziehen und
Pfeilen (`226338d`, nachgebessert in `2fbc4e4`). Gehört nicht zum Umbau. Im Browser noch nicht
von Hand geprüft.

**Offen aus Schritt 0:** Paket 3 deployen; Termin für den Prototyp-Tag (V0).

### 01.10.2026 – Durchsicht (Code-Review) nach Tag 1

Zehn Befunde, alle behoben, bevor Tag 2 beginnt.

| # | Befund | Behoben in | Wie |
|---|---|---|---|
| 1 | Loslassen auf der Einfügemarke (Zwischenraum) verschob nichts | `main` `2fbc4e4` | Ablageziel ist die ganze Liste; die Zeile meldet nur die Position |
| 2 | `kontrast()` rechnete einen halbtransparenten Hintergrund ohne Untergrund als deckend | `ux-umbau` | Fehler statt falscher Zahl; Test dazu |
| 3 | Sperrklinke übersah Hex-Farben mitten im Wert (`shadow-[0_3px_0_0_#575756]`) | `ux-umbau`, `main` `2fbc4e4` | Muster erweitert, dazu `rgb()` in Klassen und Hex in `style`; die eigene Einfügemarke nutzt jetzt `shadow-primary` |
| 4 | `ink-3` war für Platzhalter freigegeben, die nach WCAG Text sind | `ux-umbau` | Regel verschärft (Platzhalter nehmen `ink-2`); der Test, der den schwachen Kontrast verlangte, ist gestrichen |
| 5 | Exakte Grenzen der Sperrklinke brechen, wenn `main` nachgezogen wird | `ux-umbau` | Verfahren festgelegt: Grenzen im Merge-Commit nachstellen und hier vermerken |
| 6 | Pfeilknopf wurde unter dem Tastaturfokus gesperrt | `main` `2fbc4e4` | `aria-disabled` statt `disabled` |
| 7 | Neuer Punkt in langen Listen mühsam zu platzieren | `main` `2fbc4e4` | „+ Punkt darunter“ an jeder Zeile, übernimmt die Kategorie |
| 8 | `NewItem.orderIndex` nach dem Verschieben falsch und ungenutzt | `main` `2fbc4e4` | Feld entfernt |
| 9 | `createEmptyItem(0)` lief bei jedem Rendern | `main` `2fbc4e4` | träger Startwert |
| 10 | Dokumentation behauptete eine Verwendung von `--font-heading`, die es nicht gibt | `ux-umbau` | Feinplan, Logbuch und Plan berichtigt; Commit-Kennungen nachgetragen |

**Gelernt:** Ein Rebase von `ux-umbau` ändert die Commit-Kennungen, auf die dieses Logbuch
verweist. Ab jetzt wird `main` gemergt (Abschnitt 3).

### 01.10.2026 – U0, Tag 2

**Code:**

| Datei | Inhalt |
|---|---|
| `src/components/ui/button.tsx` | Varianten `primary`, `secondary` (Vorgabe), `ghost`, `critical`; Größen `md`, `sm`; `laedt` (gesperrt über `aria-disabled` + `aria-busy`, bleibt fokussierbar, Text bleibt); `asChild` für `<Link>`; Vorgabe `type="button"` |
| `src/components/ui/statuspille.tsx` | fünf Töne (`ok`, `wait`, `critical`, `info`, `neutral`), Punkt plus Pflichttext |
| `src/components/ui/gruppe.tsx` | `Gruppe` (Beschriftung als Überschrift, benennt den Bereich; Beschreibung; Aktion) und `Zeile` (mit `label`: Beschriftung/Wert, leerer Wert als „—“; ohne: volle Breite) |
| `src/app/(portal)/ui-muster/page.tsx` | Musterseite: Farben, Knöpfe, Statuspillen, zwei Gruppen; nur `SUPER_ADMIN`, kein Navigationseintrag |
| `src/__tests__/components/ui-bausteine.test.tsx` | 26 Tests zu den Regeln der drei Bausteine, je Baustein ein axe-Lauf |
| `package.json` | `jest-axe`, `@types/jest-axe` (nur Entwicklung) |

**Entscheidungen beim Bauen:**
- Ein Testfile für alle Bausteine (`ui-bausteine.test.tsx`) statt eines je Baustein: Sie sind
  klein und werden zusammen verwendet; der axe-Lauf prüft sie auch im Zusammenspiel.
- `critical` wird beim Überfahren dunkler (`brightness-90`), nicht heller. (Berichtigt in der
  zweiten Durchsicht: Der Filter dunkelte auch die Schrift ab, der Kontrast FIEL von 6,57 auf
  6,08. Jetzt eigenes Flächen-Token `critical-hover`, Kontrast 8,2:1.)
- Welcher Fachstatus welchen Ton bekommt, entscheidet nicht die Statuspille, sondern ein
  Katalog je Modul (kommt mit dem Pilot bzw. U3/U4).
- Die Musterseite sichert sich selbst über `getSession()` ab, wie Audit-Log und
  Zeugnis-Vorlagen; die Middleware bleibt unverändert.

**Geprüft:** gesamte Testsuite (180 Suiten, 4.603 Tests), Typprüfung, Lint der neuen Dateien.
Der laufende Entwicklungsserver kompiliert die Seite (ohne Anmeldung Weiterleitung zur
Anmeldeseite) und erzeugt alle Token-Klassen der Bausteine.

**Nicht geprüft:** das Aussehen der Musterseite im Browser – dafür fehlt in der Sitzung die
Anmeldung. Bitte `/ui-muster` einmal als Super-Admin öffnen. `npm run build` lief nicht, weil
im selben Ordner der Entwicklungsserver einer anderen Sitzung läuft.

**Sichtbare Änderung:** nur die neue Seite `/ui-muster`.

### 01.10.2026 – Zweite Durchsicht (Code-Review „max“) nach Tag 2

Zehn Prüfwinkel, 16 Gegenprüfungen, eine Schlussdurchsicht. 15 Befunde gemeldet, dazu fünf
bestätigte Punkte über der Obergrenze. Alle behoben; zwei mit Einschränkung (siehe unten).

| # | Befund | Behoben in | Wie |
|---|---|---|---|
| 1 | Zweiter Klick auf „nach unten“ nahm die Verschiebung zurück; nichts scrollte nach; Meldung „Punkt n“ blieb stehen | `main` `b6e1c8a` | Der Dialog rollt um die Strecke mit, die der Punkt gewandert ist; neues Titelfeld bekommt den Fokus; Meldung verschwindet bei jeder Positionsänderung |
| 2 | Reihenfolge wirkte in Vorgängen nur innerhalb einer Kategorie | `main` `b6e1c8a` | Alle Leser sortieren `orderIndex` zuerst, Kategorie nur bei Gleichstand; Hinweistext im Editor sagt, was gilt |
| 3 | `Button laedt` sperrte nur den eigenen `onClick` | `ux-umbau` | Sperre in der Capture-Phase; `disabled` ohne `pointer-events-none` |
| 4 | `Zeile` und `Statuspille` schnitten lange Inhalte stumm ab | `ux-umbau` | Wert, Beschriftung und Pille brechen um; kein `overflow-hidden` |
| 5 | Sperrklinke sperrte den eigenen Ersatz, zählte Kommentare, übersah Palettenklassen, `prompt(`, Hex nach `}` | `main` `bfb0665` | Neu gebaut: je Datei, ohne Kommentare, elf Muster, `components/ui/` bei Überlagerungen ausgenommen |
| 6 | Marken am Listenrand außerhalb des Ablageziels; Ziel hing am Weg des Zeigers; `dragenter` nicht abgebrochen | `main` `b6e1c8a` | Liste mit Innenabstand als Ziel; Zielposition aus der Stelle des Zeigers; `dragenter` abgebrochen; Marke verschwindet beim Verlassen |
| 7 | Ziehdaten als `text/plain`; Ziehzustand überlebte das Schließen | `main` `b6e1c8a` | Eigener Datentyp; Zustand wird beim Öffnen und nach dem Speichern zurückgesetzt |
| 8 | Fokus fiel nach „Entfernen“ auf `body`; Name von „+ Punkt darunter“ ohne sichtbaren Text | `main` `b6e1c8a` | Fokus auf „Entfernen“ der nachgerückten Zeile; Name beginnt mit „Punkt darunter“ |
| 9 | `{...rest}` überschrieb den Zustand; `asChild` verlor `type`, `disabled` wirkungslos | `ux-umbau` | Zustand nach `rest`; `asChild` + `disabled` wird zur Sperre; ausdrücklicher `type` erreicht das Kind |
| 10 | `Zeile` hielt `false`/`[]` nicht für leer; `Gruppe` verwarf `beschreibung`; Pille ohne Text; `h3` unter `h1` | `ux-umbau` | Leer-Erkennung über den gerenderten Inhalt; Vorgabe `h2`; axe läuft über die echte Musterseite |
| 11 | tailwind-merge hielt `shadow-overlay` für eine Farbe | `ux-umbau` | `extendTailwindMerge` in `utils.ts`, Test gegen `globals.css` |
| 12 | `color-scheme: light` verhinderte erzwungenes Abdunkeln nicht | `ux-umbau` | `only light`; Kommentar berichtigt |
| 13 | Sperrklinke nur auf `ux-umbau`; Jest läuft nie automatisch | `main` `bfb0665` | Test liegt auf `main`; `npm run pruefen`. **Einschränkung:** weiterhin kein CI und kein Hook – der Lauf bleibt ein Handschritt vor dem Push |
| 14 | Kontrast-Absicherung schwächer als behauptet | `ux-umbau` | Paare kommen aus den Bausteinen; `laedt` blendet nicht mehr ab; `critical-hover`; `text-ink-3` in der Sperrklinke; `aufUntergrund` wirft |
| 15 | Dokumentation widersprach Code und Historie | `ux-umbau` | Branchname, `--font-heading`, Zählung, Musterzahl, Schriftskala (jetzt als Tokens), Emojis, axe-Begründung berichtigt |
| + | Screenshot-Skript schnitt hohe Elemente falsch, wartete 60 s ins Leere | `ux-umbau` | `el.screenshot` mit elementbezogenem Ausschnitt; Warten auf den Zustand der Karte; `klick()` wartet. **Einschränkung:** nicht ausgeführt (braucht die Anmeldung); `screenshots/automatische-laeufe.png` ist noch das alte, falsch geschnittene Bild – Marken und Bildtext im Plan passen zu genau diesem Bild und müssen beim Neuerzeugen mitziehen |
| + | `@types/jest-axe` zog ein zweites axe-core nach und deklarierte den Matcher global | `ux-umbau` | Paket entfernt; eigene Typdatei und `axeVerstoesse()` |
| + | Editor-Tests ließen fünf Mutanten durch | `main` `b6e1c8a` | Tests für Identität der Zeile, Zustand nach dem Schließen, Datentyp, Kategorie des Punkts darüber |
| + | Pfeile 20 × 20 px | `main` `b6e1c8a` | 28 px Zielfläche |
| + | Button im Windows-Kontrastmodus ohne Begrenzung | `ux-umbau` | durchsichtiger Rand |

**Widerlegt:** Der Tastaturfokus geht bei „nach unten“ nicht verloren (React stellt ihn wieder
her). Der Punkt wanderte aber aus dem Sichtbereich – das ist Befund 1.

**Geändertes Verhalten, das HR bemerkt:** In Vorgängen stehen die Kategorien der Checkliste
nicht mehr alphabetisch, sondern in der Reihenfolge der Vorlage (also „Vor Arbeitsbeginn“ vor
„Dokumente“). Das gilt sofort auch für bestehende Vorgänge, weil nur die Sortierung beim Lesen
geändert ist. Mail- und Word-Vorlagen sind nicht betroffen; die Aufgabenliste der
Abteilungsmail bleibt nach Fälligkeit sortiert.

**Nicht geprüft:** Verhalten im echten Browser nach den Korrekturen (Ziehen, Mitrollen,
Musterseite) – in der Sitzung fehlt die Anmeldung; `npm run build` lief nicht, weil im selben
Ordner der Entwicklungsserver einer anderen Sitzung läuft.

### 01.10.2026 – U0, Tag 3

**Code:**

| Datei | Inhalt |
|---|---|
| `src/components/ui/dialog.tsx` | `Dialog` auf Radix (gesteuert über `offen`/`onSchliessen`) und `BestaetigungsDialog` (`alertdialog`, Titel, ein Satz, zwei Knöpfe, Variante `critical`). Die vier Regeln des bestehenden Rahmens als Eigenschaften: `gesperrt`, `fehler`, `bestaetigen.sperrGrund`, `fokusZiel` |
| `src/components/ui/toast.tsx` | `toast.ok` / `toast.fehler` / `toast.hinweis` (Speicher auf Modulebene), `ToastAnbieter` auf Radix Toast; Tabelle `TOAST_TOENE` |
| `src/app/(portal)/layout.tsx` | `ToastAnbieter` eingehängt |
| `src/app/globals.css` | Token `scrim` (Schleier hinter dem Dialog) |
| `src/app/(portal)/ui-muster/dialog-muster.tsx`, `page.tsx` | Gruppen „Dialoge“ und „Meldungen“ mit gespielten Aktionen (läuft 1,5 s; die kritische Rückfrage scheitert beim ersten Versuch) |
| `src/__tests__/components/ui-dialog.test.tsx` | 20 Tests: Aufbau, Fokus (Öffnen, Kreisen, Rückkehr, Ersatzziel), Schließen, Sperre, Fehler, Sperrgrund, axe |
| `src/__tests__/components/ui-toast.test.tsx` | 10 Tests: Standzeiten, „Rückgängig“, leerer Text, Doppelte, Höchstzahl, axe |
| `ui-kontrast.test.ts`, `ui-musterseite.test.tsx` | Symbolfarben der Meldungen, Schleier; axe über die Musterseite bei offenem Dialog |

**Entscheidungen beim Bauen** (Abweichungen stehen in Abschnitt 5):
- Der Dialog hat einen festen Fuß (Fehlerzeile, Sperrgrund, „Abbrechen“, Bestätigen). Der
  Aufrufer gibt Texte und Handler, keine eigenen Knöpfe – so sitzen die vier Regeln an einer
  Stelle.
- Fokus beim Öffnen auf „Abbrechen“, nie auf dem bestätigenden Knopf; ein Feld mit
  `data-autofokus` bekommt ihn stattdessen.
- Den Auslöser merkt sich der Dialog selbst (Radix gibt den Fokus ohne eigenen
  `Dialog.Trigger` nicht zurück).
- Die Fehlerzeile nimmt das Farbpaar aus `STATUS_TOENE.critical`; die Meldungen stehen auf
  `card` mit Text in `ink`, nur das Symbol trägt den Ton. Damit ist kein neues Textpaar
  entstanden.
- Dieselbe Meldung zweimal ersetzt die erste; höchstens vier stehen zugleich.
- Die Texte der Musterseite nennen die Browser-Rückfrage und das Hinweisfenster nicht beim
  Funktionsnamen – die Sperrklinke zählte sie sonst als Aufruf.

**Geprüft:** `npm run pruefen` (Typen, Lint, 184 Suiten, 4.714 Tests). Mutationsprobe am
Dialog: Der Test „Klick daneben schließt nicht“ prüfte zunächst nichts (Radix hängt seinen
Horcher erst im nächsten Takt an) und ist berichtigt. Der laufende Entwicklungsserver
kompiliert `/ui-muster`, erzeugt die neuen Klassen und liefert den Meldungsbereich im
Portal-Layout aus.

**Nicht geprüft:** Dialog und Meldungen im echten Browser (Tastaturprobe, Meldung über einem
offenen Dialog, Wischen auf dem Handy) – in der Sitzung fehlt die Anmeldung. Bitte auf
`/ui-muster` als Super-Admin: jede der drei Rückfragen öffnen, Escape während „Wird
gesendet …“, Fokus nach dem Schließen, die vier Meldungen. `npm run build` lief nicht (der
Entwicklungsserver einer anderen Sitzung läuft im selben Ordner).

**Bekannte Grenzen:**
- Öffnet ein Menüpunkt den Dialog (das „…“-Menü kommt an Tag 4), ist der Auslöser beim
  Schließen verschwunden; der Fokus geht dann nur mit `fokusZiel` an eine sinnvolle Stelle.
  Wird an Tag 4 mit dem Seitenkopf geprüft.
- Enter in einem Feld des Dialogs löst nichts aus (die Knöpfe stehen außerhalb des Inhalts).
  Kommt mit dem ersten Formular-Dialog des Pilots, wenn es gebraucht wird.
- Die öffentlichen Link-Seiten haben keinen `ToastAnbieter`.

**Sichtbare Änderung:** nur auf `/ui-muster`. Im Portal hängt ein leerer, unsichtbarer
Meldungsbereich an jeder Seite (auch an der Anmeldeseite).

### 02.10.2026 – Browserprobe zu Tag 3

Auf `/ui-muster` (eigener Entwicklungsserver, als Super-Admin) durchgeklickt: kritische
Rückfrage (Fokus auf „Abbrechen“, Escape während „Wird storniert …“ wirkungslos, Fehlerzeile
bekommt den Fokus, zweiter Versuch schließt, Fokus zurück auf den Auslöser, Meldung mit
„Rückgängig“), Fehler- und Erfolgsmeldungen (Erfolg verschwindet, Fehler bleibt), Dialog mit
Feld (Fokus im Feld, Sperrgrund als Text). Zwei Schönheitsfehler behoben:

- Die Meldungen sprangen beim Öffnen eines Dialogs um die Breite der Bildlaufleiste nach
  rechts. Der Abstand rechts rechnet jetzt `--removed-body-scroll-bar-size` mit (setzt Radix,
  solange der Dialog das Rollen sperrt). Gemessen: rechte Kante vorher und nachher gleich.
- Musterseite: Die Beschriftung „Begründung“ klebte am Fokusrahmen des Feldes.

Nicht geprobt: einfache Rückfrage, Meldungen „Erfolg“ und „Hinweis“, Kreisen mit Tab von
Hand, Wischen auf dem Handy. Das Passwort aus `.env` passt zu keinem Konto der
Entwicklungsdatenbank; dafür gibt es `scripts/dev-passwort-neu.js`.

### 02.10.2026 – U0, Tag 4

**Code:**

| Datei | Inhalt |
|---|---|
| `src/components/ui/seitenkopf.tsx` | `Seitenkopf`: Pfad (Breadcrumb als Eigenschaft, letzter Eintrag = Seite), Titel als `h1` mit `SEITENTITEL_ID` und `tabIndex={-1}`, Unterzeile, Zustand, Primärknopf, „…“-Menü auf Radix Dropdown (`MenuePunkt`: Aktion oder Verweis, `kritisch`, `gesperrt`, Symbol); Tabelle `MENUE_FARBEN` |
| `src/components/ui/segment.tsx` | `Segment`: Auswahlgruppe mit zwei bis fünf Sichten, optional Zähler; Pfeiltasten, Pos1, Ende; Tabelle `SEGMENT_FARBEN` |
| `src/app/(portal)/ui-muster/` | Der Kopf der Musterseite IST jetzt der Seitenkopf (mit Menü und einer Rückfrage aus dem Menü); neue Gruppe „Segment-Schalter“ |
| `src/__tests__/components/ui-seitenkopf.test.tsx` | 15 Tests: Pfad, Titel als Ersatzziel, Menü (Reihenfolge der Ereignisse, Escape, gesperrter Punkt, Dialog aus dem Menü), Segment (Gruppe, Tastatur, Zähler), axe |
| `ui-kontrast.test.ts`, `ui-musterseite.test.tsx` | Paare aus `SEGMENT_FARBEN` und `MENUE_FARBEN`; Kopf und Segment auf der echten Seite |

**Entscheidungen beim Bauen** (Abweichungen stehen in Abschnitt 5):
- **Die Grenze von Tag 3 ist gelöst:** Ein Menüpunkt läuft erst, NACHDEM das Menü geschlossen
  ist und der Fokus wieder auf dem „…“-Knopf liegt (`onCloseAutoFocus`, dann ein Takt). Ein
  daraus geöffneter Dialog merkt sich so den „…“-Knopf und gibt den Fokus dorthin zurück. Im
  Test und im Browser belegt.
- Der Titel ist zugleich das Ersatzziel für den Fokus (`<Dialog fokusZiel={SEITENTITEL_ID}>`).
- Der Kopf liest nichts aus der Adresse (E4); der letzte Pfadeintrag ist nie ein Verweis,
  auch wenn er ein `href` trägt.
- Ein gesperrter Menüpunkt bleibt sichtbar und wird abgeblendet (wie der gesperrte Knopf).
  `text-ink-3` kam dafür nicht in Frage – die Sperrklinke hält die Klasse auf Stand 0.
- Der Segment-Schalter rollt auf schmalen Bildschirmen waagerecht; der Fokusring liegt innen,
  damit ihn der Rollbereich nicht abschneidet. Ein Klick auf die gewählte Sicht meldet nichts.
- axe meldet für das offene Menü `region` (es hängt in einem Portal außerhalb von `main`).
  Das ist eine Empfehlung, kein WCAG-Kriterium; der Test lässt genau diese Regel beim offenen
  Menü aus und prüft das Menü selbst zusätzlich.

**Geprüft:** `npm run pruefen` (Typen, Lint, 185 Suiten, 4.734 Tests). Im Browser auf
`/ui-muster` (1104 px und 375 px): Kopf mit Pfad, Zustand, Primärknopf und Menü; Menü öffnet,
kritischer und gesperrter Punkt sind erkennbar; „Rückfrage aus dem Menü …“ öffnet den Dialog,
Escape schließt, Fokus liegt danach auf „Weitere Aktionen“; Segment wechselt die Sicht. Bei
375 px rutschen die Aktionen unter den Titel, der Segment-Schalter rollt (405 px Inhalt in
311 px), die Seite selbst wird nicht breiter.

**Nicht geprüft:** Pfeiltasten im Menü und im Segment von Hand, Windows-Kontrastmodus (die
Klassen für die gewählte Sicht sind dort ungetestet), `npm run build`.

**Bekannte Grenzen:**
- Menüpunkte ohne Symbol stehen neben solchen mit Symbol nicht in einer Flucht – in einem
  Menü entweder alle mit oder alle ohne Symbol.
- Die Seite hat mit dem alten Portal-Kopf zwei `h1` („HR-Portal“ und den Seitentitel). Das
  bestand schon vorher und fällt mit U1, wenn der Portal-Kopf neu gebaut wird.

**Sichtbare Änderung:** nur auf `/ui-muster`.

### 02.10.2026 – U0, Tag 5

**Code:**

| Datei | Inhalt |
|---|---|
| `src/components/ui/skelett.tsx` | `Skelett`: Ladezustand in der Form von `Gruppe`/`Zeile` (`art` `liste` oder `gruppe`, `zeilen`, `mitTitel`, `label`) |
| `src/components/ui/leerzustand.tsx` | `Leerzustand`: Symbol (lucide), Titel, ein Satz, höchstens ein Knopf; `mitFlaeche` für den Einsatz außerhalb einer Gruppe |
| `src/app/(portal)/ui-muster/` | Abschnitt „Ladezustand“ (Knopf schaltet zwischen Skelett und Inhalt um) und zwei Leerzustände („es gibt noch nichts“, „kein Treffer für den Filter“) |
| `ui-bausteine.test.tsx` | 9 neue Tests zu Skelett und Leerzustand |
| `ui-musterseite.test.tsx` | Ladezustand und Leerzustand auf der echten Seite; neuer Test „Vollständigkeit“: Jede Datei in `src/components/ui/` muss von der Musterseite eingebunden sein |

**Entscheidungen beim Bauen:**
- Das Skelett übernimmt Fläche, Haarlinien und Abstände der Gruppe wörtlich (ein Test
  vergleicht die Klassen). Die Balken sitzen in Kästen mit der Zeilenhöhe des Textes – der
  erste Wurf war je Zeile 2 px zu niedrig, die Seite sprang beim Umschalten um 6 px. Jetzt
  gemessen: Skelett und Inhalt 182 px (Liste) und 134 px (Gruppe), jeweils gleich.
- Die Breiten der Balken wechseln nach festem Muster, nicht zufällig (Server und Browser
  zeichnen dasselbe). Sie pulsieren nur, wenn das System Bewegung erlaubt.
- Der Titel des Leerzustands ist keine Überschrift: Er steht in einer Gruppe, deren Titel
  den Bereich schon benennt.
- Skelett und Leerzustand sind keine Client-Komponenten; sie lassen sich aus
  Server-Komponenten samt Symbol einbinden.
- „Musterseite vollständig“ hält jetzt ein Test fest, nicht die Erinnerung (Regel 6).

**Geprüft:** `npm run pruefen` (Typen, Lint, 185 Suiten, 4.745 Tests). Im Browser auf
`/ui-muster`: Skelett in beiden Formen, Umschalten auf den Inhalt ohne Sprung (Höhen
gemessen), beide Leerzustände.

**Nicht geprüft:** „Bewegung reduzieren“ im System, `npm run build`.

**Nachtrag (Commit danach):** Der Commit von Tag 5 ging hinaus, obwohl der letzte Gesamtlauf
rot war – die Befehle waren mit `;` statt `&&` verkettet. Ursache der roten Tests: Der
axe-Lauf über die ganze Musterseite braucht im vollen Lauf länger als die 5 s Vorgabe (der
Rechner war zusätzlich mit dem Entwicklungsserver belegt, der Gesamtlauf dauerte 80–110 s
statt 40 s); ein Test lief in die Zeitgrenze und riss den nächsten mit („Axe is already
running“). `ui-musterseite.test.tsx` hat jetzt 30 s Zeitgrenze. Danach zweimal in Folge
grün (185 Suiten, 4.745 Tests). In den roten Läufen fielen unter derselben Last auch zwei
Tests auf, die nichts mit dem Umbau zu tun haben (PDF-Export der Checkliste, Waisen der
Nachforderung, beide „Exceeded timeout“); sie sind unverändert und ohne Last grün.

**Sichtbare Änderung:** nur auf `/ui-muster`.

### 02.10.2026 – U0, Tag 6 (Abnahme)

**Abnahme nach Feinplan, Abschnitt 7:**

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | `npm run pruefen`, `npm run build` | beide grün. Der Build lief zum ersten Mal (vorher belegte immer ein fremder Entwicklungsserver den Ordner); `/ui-muster` 31,6 kB. |
| 2 | Musterseite zeigt alle Bausteine; Screenshots in drei Breiten | `screenshots/ui-muster-1440.png`, `-1366.png`, `-390.png` (ganze Seite). Bei keiner Breite ist die Seite breiter als das Fenster. |
| 3 | Fünf bestehende Seiten vorher/nachher gleich | Anmeldung, Onboarding-Liste, Onboarding-Detail, Einstellungen, Fragebogen (Hinweisseite ohne gültigen Link): **Bildpunkt für Bildpunkt gleich** bei 1440 px. Verfahren unten. |
| 4 | Tastaturprobe von Hand | offen – Dialog, Menü und Segment sind per Test und im Browser per Skript geprüft, aber nicht von einem Menschen mit der Tastatur. |

**Verfahren zu Punkt 3** (`scripts/ux-abnahme.js`, neu): Außerhalb der neuen Bausteine und der
Musterseite unterscheidet sich `ux-umbau` von `main` in genau drei Dateien, die bestehende
Seiten erreichen – `globals.css`, `(portal)/layout.tsx`, `lib/utils.ts`. Für „vorher“ wurden
diese drei im laufenden Entwicklungsserver kurz auf den Stand von `main` gesetzt
(`git checkout main -- …`), fotografiert und zurückgesetzt. Gegenprobe: Eine absichtliche
Änderung (`letter-spacing` am `body`) meldet der Vergleich auf allen fünf Seiten.
Einschränkung: Die beiden Diagramme der Onboarding-Liste zeichnet der Browser ohne Fenster
mal klein, mal groß – auch bei zwei Aufnahmen DESSELBEN Stands. Das Paar „vorher“ gegen die
zweite Nachher-Aufnahme ist vollständig gleich; wo es abweicht, liegt die Abweichung allein
im Diagrammbereich. Die Bilder der bestehenden Seiten liegen nicht im Repository (Namen aus
der Entwicklungsdatenbank).

**Bei der Abnahme gefunden und behoben:**
- Bei 390 px brach die Statuspille „Überfällig“ mitten im Wort um („Überfälli-g“), ebenso die
  Beschriftung „Bankverbindung“. Pille und Beschriftung brechen jetzt zwischen den Wörtern
  (`wrap-break-word`); der Wert einer Zeile weicht weiter an jeder Stelle aus. Tests angepasst.

**Neues Skript `scripts/ux-abnahme.js`:** `muster` (Musterseite in drei Breiten), `seiten`
(fünf bestehende Seiten), `vergleich` (Bildpunkte zweier Ordner). Drei Lehren stehen im
Skript: erst warten, bis die nachgeladenen Daten stehen; dann auf die Diagramme; erst dann
Bewegung einfrieren. Für spätere Pakete wiederverwendbar. Braucht `puppeteer-core`
(`npm install --no-save`, steht nicht in `package.json`).

**Anmeldung für die Aufnahmen:** Testkonto `claude-test-admin@beispiel.invalid` der
Entwicklungsdatenbank; sein Passwort wurde dafür mit `scripts/dev-passwort-neu.js` mehrfach
neu gesetzt und nirgends gespeichert.

**Geprüft:** `npm run pruefen` nach der Umbruch-Korrektur; Build; Bilder gesichtet.

**Damit ist U0 gebaut.** Nichts davon ist für das Personalbüro sichtbar (nur `/ui-muster`).

**Als Nächstes:** Tastaturprobe von Hand; Push nach Freigabe; Feinplan U1 (Rahmen: Kopf,
Breadcrumb, neue Adressen) – vor dem ersten Code. Optional vorher ein Code-Review über Tag 3
bis 6.

### 02.10.2026 – Feinplan U1 (Entwurf)

Die Tastaturprobe zu U0 hat der Projektverantwortliche am 02.10.2026 auf `/ui-muster`
gemacht („funktioniert jetzt“ – die Seite hing zuvor kurz, während der Entwicklungsserver neu
übersetzte).

`u1-feinplan.md` geschrieben, nach einer Bestandsaufnahme im Code:
- Der Kopf wird heute von 29 Seiten einzeln eingebunden; „Dashboard“ ist auch im BEM markiert;
  der Rollenname kennt nur drei Rollen (Einrichtungsleitung und Führungskraft heißen
  „Sachbearbeiter“); zwei `h1` je Seite.
- 57 Dateien nennen `/dashboard…` (17 × `redirect`, 9 × `router.push`, 30 × `href`, dazu
  fünf Stellen, die `portalLink` für Mails bauen).
- `/bem/einwilligung` ist eine öffentliche Seite und liegt schon heute unter `/bem` – die
  neue BEM-Adresse darf sie weder schützen noch umleiten.
- Die Anmeldeseite liegt in derselben Layout-Gruppe wie das Portal; für einen Kopf im Layout
  muss sie in eine eigene Gruppe (Adresse bleibt).
- Nebenbefund: „Formulare“ steht bei der Sachbearbeitung im Menü, die Middleware lässt sie
  aber nicht auf `/vorlagen` (Frage F3).

**Vorschlag zum Zuschnitt (weicht vom Plan ab, Frage F1):** U1 ändert nur Kopf und Adressen.
Seitenkopf-Baustein auf den Seiten, einheitliche Breite und Suche kommen mit den
Modul-Paketen bzw. nach dem Pilot – sonst würde U1 jedes Modul anfassen, was die Leitplanke
vor dem Pilot ausschließt.

**Freigegeben am 02.10.2026:** F1–F4 wie vorgeschlagen (Abschnitt 4, „Zum Feinplan U1“).

**Als Nächstes (U1, Tag 1):** `src/lib/adressen.ts` mit Tests, dünne Seiten unter
`/vorgaenge` und `/bem`, Weiterleitung in der Middleware, alle Verweise umstellen,
Wächter-Test.

### 02.10.2026 – U1, Tag 1 (Adressen)

**Code:**

| Datei | Inhalt |
|---|---|
| `src/lib/adressen.ts` | neu, rein: `vorgangPfad`, `vorgangslistePfad`, `bemPfad`, `BEM_STATISTIK_PFAD`, `alteAdresse` (Übersetzung jeder alten Adresse), `istBemPortalPfad`, `istVorgaengePfad`, `unter` |
| `src/app/(portal)/vorgaenge/…` | neu: `page.tsx` (leitet auf die Onboarding-Liste), `[modul]/page.tsx` (Liste mit Reitern), sechs dünne `<modul>/[id]/page.tsx` |
| `src/app/(portal)/bem/…` | neu: `page.tsx`, `[id]/page.tsx`, `statistik/page.tsx` |
| `src/app/(portal)/dashboard/**/page.tsx` | entfernt (10 Dateien); die 48 übrigen Dateien der Module bleiben dort |
| `src/middleware.ts` | alte Adresse → 308 auf die neue, vor allem anderen; Sitzungsprüfung für `/vorgaenge` und `/bem` (ohne `/bem/einwilligung`); BEM-Beauftragte nur `/bem…` |
| 43 Dateien unter `src/app/(portal)/` und `src/components/` | Verweise (`href`, `router.push`, `redirect`) über `adressen.ts` |
| `src/lib/laeufe/bem-fristen.ts`, `dokument-ablauf.ts`, `vertragsende-erinnerungen.ts`, `src/lib/psi-fristen-mail.ts`, `src/lib/unterlagen-onboarding.ts` | `portalLink` der Mails über `adressen.ts` |
| `src/lib/events.ts` | Beispiel-Adressen der Vorschau |
| `src/components/portal-header.tsx` | nur die neuen Adressen und ein Aktiv-Vergleich auf ganze Pfadteile – die Datei entfällt an Tag 2 |
| `src/__tests__/lib/adressen.test.ts` | neu, 50 Tests: Adressen bauen, jede alte Adresse, Middleware, drei Wächter |
| 14 bestehende Testdateien | erwarten die neuen Adressen |
| `scripts/ux-abnahme.js` | neue Adressen |

**Vorgezogen von Tag 3:** Die Modul-Reiter der Vorgangsliste sind schon echte Adressen
(`/vorgaenge/<modul>`), tragen `aria-current="page"` und rollen waagerecht – die Liste
brauchte ohnehin eine neue Seiten-Datei.

**Entscheidungen beim Bauen:**
- Sechs feste Ordner `vorgaenge/<modul>/[id]/` statt eines `vorgaenge/[modul]/[id]/`: Eine
  gemeinsame Seite hätte alle sechs Detailansichten in ein Paket gezogen. Ein Wächter-Test
  hält die Ordner gegen `VORGANGS_MODULE`.
- Die Weiterleitung steht ganz vorn in der Middleware und fragt keine Sitzung ab; das Ziel
  prüft sie selbst.
- Modulnamen aus `?tab=` und aus dem Pfad werden nur über eigene Einträge der Tabelle
  aufgelöst (`Object.hasOwn`) – `?tab=constructor` erfindet keine Adresse.
- `vorgangPfad` und `bemPfad` kodieren die Kennung (`encodeURIComponent`).
- Der Wächter sucht `/dashboard` als ganzen Pfadteil; erlaubt bleiben die Schnittstelle
  `/api/dashboard/…` und der Ordner `(portal)/dashboard/`.

**Geändertes Verhalten:**
- Alle Verweise im Portal und in **neuen** E-Mails zeigen auf die neuen Adressen; alte
  Adressen leiten weiter.
- Die Sammelmail `contract-end-unbearbeitet` verwies bisher auf die Onboarding-Liste
  (`/dashboard`); jetzt auf die Vertragsende-Liste (`/vorgaenge/vertragsende`) – so stand es
  schon im Beispiel der Vorlagen-Vorschau.
- „Dashboard“ im alten Kopf ist nicht mehr markiert, wenn man im BEM ist (Nebenwirkung der
  neuen Adressen; der Kopf selbst kommt an Tag 2).

**Mail-Ereignisse mit neuer Adresse im `portalLink`** (Texte unverändert, niemand muss eine
Vorlage zurücksetzen): `bem-frist-erinnerung`, `dokument-ablauf-warnung`,
`dokument-abgelaufen`, `contract-end-eskalation`, `contract-end-unbearbeitet`,
`psi-deadline-warning` (Liste der Vorgänge), `unterlagen-vollstaendig`,
`unterlagen-frist-verstrichen`. Webhook-Abnehmer bekommen dieselbe neue Adresse.

**Geprüft:** `npm run pruefen` (Typen, Lint, 186 Suiten, 4.795 Tests). Im Browser
(angemeldet): `/dashboard?tab=contract-end` → `/vorgaenge/vertragsende` mit markiertem Reiter;
`/dashboard/<id>?tab=dokumente` → `/vorgaenge/onboarding/<id>?tab=dokumente`;
`/dashboard/bem` → `/bem`; `/vorgaenge` → `/vorgaenge/onboarding`; `/vorgaenge/gibt-es-nicht`
zeigt „Seite nicht gefunden“.

**Nicht geprüft:** die übrigen fünf Detailseiten und die BEM-Statistik im Browser (nur über
Typprüfung und Wächter-Test); Anmeldung als BEM-Beauftragte (nur im Middleware-Test);
`npm run build`; `scripts/ux-screenshots.js` und `handbuch-screenshots.js` nennen noch die
alten Adressen (funktionieren über die Weiterleitung, Umstellung an Tag 3).

**Als Nächstes (U1, Tag 2):** `src/lib/navigation.ts`, `PortalKopf` im Layout, Anmeldeseite
in eigene Gruppe, Kopf aus 29 Seiten entfernen, „Formulare“ für die Sachbearbeitung
ausblenden.

### 02.10.2026 – Dritte Durchsicht (Code-Review „high“) nach U1 Tag 1

Umfang: alles Ungepushte (U0 Tag 3 bis 6, U1 Tag 1). Zehn Befunde, alle behoben.

| # | Befund | Wie behoben |
|---|---|---|
| 1 | Gesperrter Menüpunkt mit Adresse navigierte trotzdem | wird nicht mehr als Verweis gezeichnet |
| 2 | Fehlermeldungen überlebten das Abmelden (Speicher auf Modulebene) | Anbieter räumt beim Aushängen ab; „Abmelden“ räumt zusätzlich ab |
| 3 | Alter Kopf: „BEM“ im Handy-Menü auch auf `/bem-vorlagen` markiert | entfällt mit dem neuen Kopf (eine Aktiv-Regel, ganze Pfadteile) |
| 4 | Meldung bei offenem Dialog mit der Tastatur nicht erreichbar | die Zeit aller Meldungen hält an, solange ein Dialog offen ist |
| 5 | `aria-busy` am Skelett hielt die Ansage zurück | entfernt |
| 6 | Dialog-Beschreibung in einem `<p>`: Absätze/Listen darin ungültig | `div` |
| 7 | „Rückgängig“ bekam das Klick-Ereignis als Argument | Aufruf ohne Argument |
| 8 | `robots.txt` kannte `/vorgaenge/` und `/bem/` nicht | ergänzt |
| 9 | Listen bauten Vorgangsadressen selbst (`detailUrlPrefix` + Kennung) | `detailPfad: (id) => vorgangPfad(…)` |
| 10 | Skripte mit alten Adressen; Wächter sah `scripts/` nicht | vier Skripte umgestellt (auch die n8n-Generatoren), Wächter liest `scripts/` mit |

Zu jedem Befund außer 3 und 8 gibt es einen Test. Commit `8874a30`.

### 02.10.2026 – U1, Tag 2 (Kopf)

**Code:**

| Datei | Inhalt |
|---|---|
| `src/lib/navigation.ts` | neu, rein: `NAVIGATION` (Punkte, Adressen, Rollen), `sichtbarePunkte`, `aktiverPunkt`, `ROLLEN_NAMEN`, `rollenName` |
| `src/components/rahmen/portal-kopf.tsx` | neu: `PortalKopf` auf den neuen Tokens, Menüs auf Radix, Symbole aus lucide, Sprunglink, Handy-Menü, BEM-Zähler; Tabelle `KOPF_FARBEN` |
| `src/components/portal-header.tsx` | entfernt |
| `src/app/(portal)/layout.tsx` | liest die Sitzung, bindet den Kopf einmal ein, `#inhalt` als Ziel des Sprunglinks |
| `src/app/(anmeldung)/login/` | Anmeldeseite in eigener Gruppe ohne Kopf (Adresse bleibt `/login`) |
| 28 Dateien unter `src/app/(portal)/` | Einbindung des Kopfs entfernt (40 Stellen) |
| `src/lib/seite-laden.ts` | neu: `seiteNeuLaden` – volles Laden beim An- und Abmelden |
| `src/app/globals.css` | `.portal-inhalt .min-h-screen` zieht die Höhe des Kopfs ab |
| neun Verwaltungs- und Vorlagenseiten | Seitentitel `h2` → `h1` (gleiche Klassen, gleiches Aussehen) |
| `vorgaenge/[modul]/page.tsx` | unsichtbare `h1` „Vorgänge: <Modul>“ |
| `navigation.test.ts`, `portal-kopf.test.tsx` | neu (38 und 14 Tests) |
| `ui-kontrast.test.ts` | Farbpaare des Kopfs |
| `ui-sperrklinke.stand.json` | zwei Inline-SVG weniger (148) |

**Sichtbare Änderungen – auf JEDER Seite hinter der Anmeldung:**
- Neuer Kopf: schmaler (`6xl`), ruhiger, aktiver Punkt hellgrau hinterlegt statt dunkel
  gefüllt. „Dashboard“ heißt „Vorgänge“. Schloss-Symbol statt Emoji am BEM.
- Rollenname oben rechts für alle Rollen: Administration, HR-Leitung, HR-Sachbearbeitung,
  Einrichtungsleitung, Führungskraft, BEM-Beauftragte:r. Vorher: „Administrator“,
  „HR-Leitung“, sonst immer „Sachbearbeiter“.
- Sachbearbeitung: Im Menü „Vorlagen“ steht nur noch „Brief-Vorlagen“ („Formulare“ führte
  ohnehin zurück zur Liste, U1-F3).
- Am Handy: Menüknopf mit einer Liste statt einer Reihe kleiner Knöpfe.
- Nach dem An- und Abmelden lädt die Seite einmal ganz neu.

**Entscheidungen beim Bauen** (Abweichungen stehen in Abschnitt 5):
- Der Kopf zeigt nur, was die Rolle öffnen kann: `navigation.test.ts` ruft die echte
  Middleware für jeden sichtbaren Punkt jeder Rolle auf.
- Die Seiten tragen weiter `min-h-screen`. Mit dem Kopf darüber wäre jede Seite um dessen
  Höhe zu hoch gewesen; eine Regel in `globals.css` zieht 4 rem + 3 px ab. Gemessen: Kopf
  67 px, Mindesthöhe 653 px bei 720 px Fenster. Entfällt mit dem Umbau der Seiten.
- Ohne Sitzung zeichnet das Layout keinen Kopf; die Seiten leiten selbst zur Anmeldung.
- Die Sitzungswarnung hängt jetzt einmal im Layout statt in jeder Seite.

**Geprüft:** `npm run pruefen` (Typen, Lint, 188 Suiten, 4.852 Tests). Im Browser (als
Super-Admin): Kopf auf Vorgangsliste, Einstellungen, BEM-Vorlagen, Checklisten; Menü
„Verwaltung“ zeigt fünf Punkte, auf `/bem-vorlagen` ist „BEM-Vorlagen“ aktiv und „BEM“
nicht; je Seite genau eine `h1`; keine zusätzliche Bildlaufleiste.

**Nicht geprüft:** An- und Abmelden im Browser (nur im Test – ich melde das Konto des
Projektverantwortlichen nicht ab); die übrigen fünf Rollen im Browser; Handy-Menü und
Aussehen als Bild (das Browser-Fenster war verdeckt, Bilder kamen nicht zustande);
`npm run build`. Alles Teil der Abnahme an Tag 3.

**Bekannte Grenzen:**
- Die Detailseiten von Onboarding, Offboarding und Vertragsende haben keine `h1` mehr (ihr
  Titel ist keine Überschrift). Vertragsende bekommt sie mit dem Pilot, die anderen mit U4.
- Kopf (`6xl`) und Seiteninhalt (`4xl` bis `7xl`) fluchten nicht – wie bisher, nur anders.
- `ROLE_LABELS` der Benutzerverwaltung nennt die Rollen noch anders („Super Admin“,
  „Sachbearbeiter“, „Vorgesetzter“); zusammengeführt wird das mit U6.

**Als Nächstes (U1, Tag 3):** Abnahme – Bilder des Kopfs in drei Breiten, Vergleich der
fünf Seiten (nur der Kopf darf abweichen), je Rolle anmelden, An-/Abmelden, Tastatur,
`npm run build`; HR-Handbücher bleiben bis U4 beim alten Kopf.

### 02.10.2026 – Vierte Durchsicht (Code-Review „high“) nach U1 Tag 2

Umfang: die Korrekturen der dritten Durchsicht und U1 Tag 2. Acht Befunde, alle behoben
(`fed608d`), zu jedem außer der Anmeldeseite ein Test.

| # | Befund | Wie behoben |
|---|---|---|
| 1 | „Abmelden“ ging auch dann zur Anmeldeseite, wenn der Server die Sitzung nicht beendet hatte | erst bei Erfolg; sonst bleibt die Seite stehen und meldet „die Sitzung besteht noch“ |
| 2 | Die Fragebogen-Vorschau bekam über das Layout den Portal-Kopf | eigene Gruppe `src/app/(portal-ohne-kopf)/`, Adresse und Zugang unverändert (Entscheidung des Projektverantwortlichen vom 02.10.2026) |
| 3 | Eine Meldung, die bei schon offenem Dialog entsteht, lief trotz der Pause ab | Pause wird bei jeder Änderung der Liste erneut gemeldet |
| 4 | Früh gemeldete Meldungen gingen im Strict Mode der Entwicklung verloren | Abräumen einen Takt nach dem Aushängen und nur, wenn kein Anbieter mehr hängt |
| 5 | Anmeldeknopf während des Neuladens wieder klickbar | bleibt nach Erfolg gesperrt |
| 6 | Das Logo führte BEM-Beauftragte auf `/vorgaenge` (wird umgeleitet) | `startAdresse(rolle)`: der erste Punkt, den die Rolle sieht |
| 7 | Zweite (und eine dritte, unbenutzte) Tabelle der Rollennamen | Benutzerverwaltung nutzt `rollenName()`; `USER_ROLE_LABELS` entfernt; Wächter-Test |
| 8 | Kein Test für „der Kopf hängt nur im Layout“ | Wächter in `navigation.test.ts` |

**Geändertes Verhalten:** Die Benutzerverwaltung nennt die Rollen jetzt wie der Kopf:
„Administration“ statt „Super Admin“, „HR-Sachbearbeitung“ statt „Sachbearbeiter“,
„Führungskraft“ statt „Vorgesetzter“. Eine unbekannte Rolle zeigt ihren Schlüssel, nicht mehr
„Sachbearbeiter“.

### 02.10.2026 – U1, Tag 3 (Abnahme)

**Abnahme nach Feinplan, Abschnitt 7:**

| # | Punkt | Ergebnis |
|---|---|---|
| 1 | `npm run pruefen`, `npm run build` | beide grün (188 Suiten, 4.869 Tests) |
| 2 | Alte Adressen landen auf den neuen | im Browser: `/dashboard`, `/dashboard?tab=contract-end`, `/dashboard/bem`, dazu (Tag 1) ein Vorgang mit `?tab=dokumente`; alle Zeilen der Tabelle im Test |
| 3 | Bildvergleich bei 1440 px, nur der Kopf darf abweichen | Anmeldung und Fragebogen: gleich. Onboarding-Detail: unterhalb des Kopfs gleich (Kopf 72 → 67 px, Seite 5 px kürzer). Einstellungen: unterhalb des Kopfs gleich bis auf 4 Zeilen direkt darunter – der Schatten des alten Kopfs, den der neue nicht hat – und drei einzelne Bildpunkte. **Onboarding-Liste: nicht bildgleich** (siehe unten). |
| 4 | Kopf in drei Breiten | `screenshots/u1-kopf-1440.png`, `-1366.png`, `-390.png`, `-390-menue.png` |
| 5 | Je Rolle angemeldet | alle sechs Rollen im Browser: sichtbare Punkte, Rollenname, Ziel des Logos und Landeseite stimmen; Sachbearbeitung wird von `/vorlagen` weitergeleitet, BEM-Beauftragte von `/vorgaenge` ins BEM |
| 6 | Tastatur | Sprunglink ist der erste Tab-Halt und führt zu `#inhalt`; Menü öffnet mit Enter, Pfeil bewegt den Fokus, Escape schließt und gibt den Fokus zurück |
| 7 | An- und Abmelden | nach dem Anmelden steht der Kopf sofort da; nach dem Abmelden Anmeldeseite ohne Kopf, `/vorgaenge` führt zur Anmeldung |

Dazu: die Fragebogen-Vorschau hat keinen Portal-Kopf; je Seite genau eine `h1` (geprüft
auf `/checklisten`); die Mindesthöhe der Seite ist um die 67 px des Kopfs gekürzt.

**Onboarding-Liste, nicht bildgleich:** Abweichend sind die beiden Diagramme (wie schon bei
U0 mal klein, mal groß gezeichnet) und in der Tabelle darunter die Lage der Spalten um einen
Bildpunkt. Die Vorher-Aufnahme stammt vom Vormittag; eine frische vom Stand vor U1 gibt es
nicht mehr, weil die Seiten umgezogen sind. Vermutete Ursache: geänderte Daten der
Entwicklungsdatenbank (die Spaltenbreite der Tabelle richtet sich nach dem Inhalt). Nicht
abschließend geklärt; am Aufbau der Liste hat U1 nichts geändert außer den Reitern.

**Neue Skripte:** `scripts/ux-abnahme-u1.js` (Rollen, An-/Abmelden, Tastatur, Adressen,
Bilder des Kopfs – setzt dafür nacheinander die Rolle des Testkontos und stellt
`SUPER_ADMIN` wieder her; nur lokal und nur für `@beispiel.invalid`).
`scripts/ux-abnahme.js vergleich` kann jetzt unterhalb des Kopfs vergleichen (dritter
Parameter: Höhe des alten Kopfs).

**Bei der Abnahme gefunden:**
- Die Vertragsende-Liste ist bei 390 px breiter als das Fenster (Filterzeile, Tabelle). Das
  liegt an der alten Liste, nicht am Kopf (der Kopf ist genau 390 px breit); U3 baut die
  Listen um.

**Nicht geprüft:** die HR-Handbücher (zeigen weiter den alten Kopf, Neubebilderung mit U4);
ein echter n8n-Ablauf mit `portalLink`; Windows-Kontrastmodus.

**Damit ist U1 gebaut.** Sichtbar für das Personalbüro: neuer Kopf, „Vorgänge“ statt
„Dashboard“, neue Adressen (alte leiten weiter), richtige Rollennamen.

**Als Nächstes:** Push nach Freigabe; Deploy von U0 + U1 mit Ankündigung; danach der
Prototyp-Tag (V0) als Voraussetzung für den Pilot Vertragsende (U2 + U4).

### 02.10.2026 – Feinplan Pilot Vertragsende (Entwurf)

[pilot-feinplan.md](pilot-feinplan.md) geschrieben, **nicht freigegeben, kein Code**. Gelesen
dafür: Plan (Abschnitte 4 D, 5, 6, 7), die Detailseite (910 Zeilen), die fünf Routen des
Moduls, Frist- und Warnregeln, Ereignisse, Stand der Sperrklinke.

**Kern des Entwurfs:** Prozessleiste als Baustein mit reinem Datenmodell `ProzessStand` (nur
die Zustände, die Vertragsende braucht) und einem Adapter je Modul; drei weitere Bausteine,
die fehlen (Reiter, Hinweis, Textfeld); neue Ansicht neben der Seiten-Datei, alte bleibt
unverändert; Vorschau-Schalter als Cookie (kein Schema-Delta); keine Mail- und keine
Word-Vorlage betroffen; sieben Tage.

**Befunde am Modul** (Feinplan, Abschnitt 9): `VERTRAG_ERSTELLT` setzt kein Code; Stornieren
gibt es nur in der Route; nach „keine Übernahme“ fehlt der Knopf zum Abschließen; „Anfrage
erneut senden“ setzt ohne Rückfrage zurück; ein überschrittenes Vertragsende zeigt keine Ampel.

**Nachtrag, selber Tag: freigegeben.** Alle neun Fragen entschieden (Abschnitt 4, P-F1 bis
P-F9). Ursprünglich offen waren:

**Offen:** Fragen F1–F9 (Schalter, Stornieren, Abschließen im Ablehnungsstrang, Hinweis bei
überschrittenem Vertragsende, Rückmelde-Adresse, klebende Leiste, Export der Statusübergänge,
Statustexte, Reihenfolge mit V0). Nicht committet.

### 02.10.2026 – Pilot, Tag 1 (Regeln)

**Gebaut** (noch nichts sichtbar):

- `src/lib/prozess/prozess-stand.ts` – Datenmodell der Prozessleiste (`ProzessSchritt`,
  `JetztDran`, `ProzessStand`, `schrittKurzform`).
- `src/lib/prozess/vertragsende.ts` – Adapter (`vertragsendeProzessStand`,
  `vertragsendeMenue`, `vertragsendePille`), Kataloge `VERTRAGSENDE_PILLE` und `MAV_PILLE`.
- `src/lib/contract-end-status.ts` – die Tabelle der Statusübergänge, aus der Route
  `api/contract-end/[id]` hierher verschoben (P-F7); Inhalt unverändert, die Route liest sie
  von dort.
- `src/__tests__/lib/prozess-vertragsende.test.ts` – 31 Tests, darunter die Gegenprobe:
  Jede angebotene Handlung nimmt die zuständige Route auch an.

**Von der Gegenprobe gefunden:** Der erste Entwurf bot „Erinnerung senden“ auch an, wenn der
Vorgang auf „Anfrage beim Vorgesetzten“ steht, ohne dass je eine Anfrage verschickt wurde;
die Route hätte mit 409 abgelehnt. Jetzt ist dann „Anfrage senden“ dran, bei abgelaufenem
Link „Anfrage neu senden“.

**Präzisierungen gegenüber dem Feinplan:** dort in Abschnitt 11 (Frist als eigenes Feld,
Berliner Kalendertage, eigenes Menü, gespiegelte Routenlisten).

**Geprüft:** `npm run pruefen` grün (189 Suiten, 4.900 Tests). Kein Build – es gibt noch
keinen Aufrufer in einer Seite.

**Außerdem aufgefallen, nicht angefasst:** `GET /api/contract-end/[id]` gibt den ganzen
Datensatz zurück, also auch `supervisorToken` (den Magic-Link der Führungskraft) – an alle
`PORTAL_ROLES`, auch an lesende Rollen. Gehört nicht zum Umbau; eigener Punkt für `main`.

**Als Nächstes:** Tag 2 – Bausteine Prozessleiste und Reiter auf der Musterseite.

### 02.10.2026 – Fünfte Durchsicht (Code-Review „high“) nach Pilot Tag 1

Umfang: Tag 1 des Pilots (`9d6baf4`). Acht Befunde, alle behoben, zu jedem ein Test. Die
Befunde waren nicht gegengeprüft (Stufe „high“ ohne Verifikationslauf); jeder hat sich beim
Beheben bestätigt.

| # | Befund | Wie behoben |
|---|---|---|
| 1 | Am Tag des Vertragsendes selbst fehlte die kritische Hervorhebung – die Ampel meldet an diesem Tag schon „außerhalb“, der Tag davor und der Tag danach waren kritisch | „heute“ zählt wie „überschritten“ als kritisch; Test über die Tage +3 bis −3 und zu zwei Uhrzeiten des letzten Tages |
| 2 | Die Pille sagte „Wartet auf Führungskraft“ über einem „Jetzt dran“, das HR zum Senden auffordert (Link abgelaufen oder nie verschickt) | Pille, aktiver Schritt und „Jetzt dran“ lesen EINE Lage (`lageVon`): Pille „Anfrage offen“ bzw. „Link abgelaufen“, der Schritt „Anfrage“ ist wieder aktiv |
| 3 | „… 2× erinnert, zuletzt “ ohne Datum, wenn der Zeitpunkt der letzten Erinnerung fehlt | Ein fehlendes oder unlesbares Datum fällt samt seinem Vorwort weg |
| 4 | Die Gegenprobe prüfte drei Routen gegen KOPIEN ihrer Statuslisten | Listen in `src/lib/contract-end-status.ts`; `/nicht-uebernehmen`, `/supervisor-link` und `/reminder` lesen sie von dort (freigegeben am 02.10.2026, Inhalt unverändert) |
| 5 | Die Gegenprobe kannte keine Lage mit schon verknüpftem Offboarding | 400 Lagen: Status × Stand der Anfrage × Offboarding × vier Nebenlagen; der Adapter bietet kein zweites Offboarding an, sondern führt zum vorhandenen |
| 6 | Der Schritt „Offboarding“ sprang in den Reiter Dokumente | Nur der Schritt „Vertrag“ trägt einen Reiter |
| 7 | Eigene Liste der Pillen-Töne neben der des Bausteins | Typ `StatusTon` aus `statuspille.tsx` (nur als Typ eingebunden) |
| 8 | Ein Test sortierte ein geteiltes Feld an Ort und Stelle | Kopie sortieren |

**Verschieben der Listen, abgesichert:** Zuerst je Route ein Test, der ausgeschrieben
festhält, was sie tut (welcher Status angenommen, welcher abgelehnt wird) – grün gegen die
unveränderten Routen, dann verschoben, wieder grün. Für `/supervisor-link` des Vertragsendes
gab es bisher gar keinen Test (`supervisor-link.test.ts` prüft die Route des Onboardings);
neu ist `contract-end-supervisor-link.test.ts`.

**Über die Befunde hinaus:**

- Bei abgelaufenem Link ist jetzt auch der **Schritt** „Anfrage“ wieder aktiv, nicht nur die
  Pille anders – sonst stünde in der Leiste „Rückmeldung · Führungskraft“ über einem „Jetzt
  dran“ bei HR. Ein Test hält über alle Lagen: Ton `wait` genau dann, wenn die Führungskraft
  dran ist; der aktive Schritt liegt bei dem, der dran ist.
- `VertragsendeStand.supervisorTokenExpiresAt` ist Pflichtfeld: Ein fehlender Wert zählt als
  abgelaufen; eine Liste, die das Feld nicht mitlädt, zeigte sonst jede offene Anfrage als
  abgelaufen.
- **`tageZwischen` ist unter Jest rund hundertmal langsamer als im Betrieb** (gemessen: 11 ms
  gegen 0,12 ms je Aufruf – die Funktion zählt jeden Monat seit dem Jahr 0, und Jest bremst
  solche Schleifen). Die erste Fassung der Gegenprobe lief damit über drei Minuten. Jetzt
  wird jede Lage einmal gerechnet (`PROBEN`): die Datei braucht allein rund 12 s, im
  Gesamtlauf rund 30 s. An der Hilfsfunktion selbst ist nichts geändert (gemeinsamer Code,
  gehört nach `main`).

**Geprüft:** `npm run pruefen` grün (190 Suiten, 4.936 Tests; keine neue Lint-Warnung). Kein
Build und keine Browserprobe: Der Adapter hat noch keinen Aufrufer in einer Seite, und die
drei Routen verhalten sich unverändert (ihre Tests).

**Nicht angefasst:** Dasselbe Statuspaar „Anfrage offen“ steht weiter im Formular der
Führungskraft (`api/vertrag-formular/[token]`) und im Erinnerungslauf; beide lesen die
gemeinsame Liste noch nicht. `GET /api/contract-end` und `GET /api/contract-end/[id]` geben
weiter `supervisorToken` an alle `PORTAL_ROLES` zurück (siehe Tag 1).

**Als Nächstes:** Tag 2 – Bausteine Prozessleiste und Reiter auf der Musterseite.

### 02.10.2026 – Pilot, Tag 2 (Bausteine Prozessleiste und Reiter)

**Gebaut:**

- `src/components/ui/prozessleiste.tsx` – zeichnet einen `ProzessStand`: Schritte als Punkte
  auf einer Linie, darunter „Jetzt dran“ mit Satz, bei wem, Unterzeile, Frist (dringend: Pille
  mit Wort) und den Knöpfen der Seite; am Ende „Abgeschlossen“ bzw. „Abgebrochen“.
- `src/components/ui/reiter.tsx` – `Reiter` und `ReiterInhalt` (Radix Tabs), gesteuert.
- Muster-Dateien `prozessleiste-muster.tsx` (acht Lagen aus dem echten Vertragsende-Adapter,
  festes Datum 26.09.2026) und `reiter-muster.tsx`; beide in `/ui-muster` eingebunden.
- `prozess-stand.ts`: `BEI_NAME` und `ENDE_NAME` (der Baustein führt keine Namen selbst);
  `schrittKurzform` liest `ENDE_NAME`.
- Tests `ui-prozessleiste.test.tsx` (72) und `ui-reiter.test.tsx` (32), Musterseiten-Test
  um beide erweitert; gemeinsamer Token-Leser `src/__tests__/hilfen/farb-tokens.ts` (vorher
  dreimal dieselbe Funktion) und ein Wächter: keine Farbtabelle eines Bausteins ohne Rechnung.

**Wie gebaut:** als Arbeitsablauf mit neun Agenten – je Baustein ein Erbauer und drei
Gutachter (Barrierefreiheit, Hausregeln, Korrektheit und Tests), danach ein Agent, der jeden
Befund zu widerlegen versuchte. Musterseite, Kontrasttest, Korrekturen und Dokumentation
danach von Hand. Git-Stand nach dem Lauf kontrolliert: nichts committet, nichts gepusht, nur
die erlaubten Dateien.

**Sechste Durchsicht (im Arbeitsablauf):** 17 Befunde, nach Gegenprüfung 8 eigenständige
bestätigt – alle behoben, je mit Test; die neuen Tests per Gegenprobe geprüft (Baustein
verfälscht → Test rot).

| # | Befund | Wie behoben |
|---|---|---|
| 1 | Reiter: Ein Mausklick rief `onWechsel` zweimal, sobald die Seite den neuen Wert nicht sofort zurückgibt (Reiter in der Adresse) – zwei Navigationen je Klick | Merker für das laufende Ereignis; der Test verlangt genau einen Aufruf, auch bei abgelehntem und verspätet übernommenem Wechsel |
| 2 | Reiter: Nach einem Wechsel von außen blieb der Tab-Halt auf dem zuletzt fokussierten Reiter – Umschalt+Tab aus dem Inhalt schaltete ungefragt zurück | `tabIndex` hängt an der Auswahl |
| 3 | Reiter: Bild-auf/Bild-ab sprangen zum ersten/letzten Reiter und schalteten den Inhalt um, statt die Seite zu rollen | Die beiden Tasten gehen nicht mehr an Radix |
| 4 | Prozessleiste: `ol` ohne `role="list"` – Safari mit VoiceOver sagt eine Liste ohne Zeichen nicht als Liste an („3 von 5“ entfiele) | `role="list"` |
| 5 | Prozessleiste: „übersprungen“ hing unter 640 px allein am gestrichelten Rand in `ink-3` (2,8:1) | Rand in `ink-2`; Kontrasttest für diesen Rand |
| 6 | Prozessleiste: Der Test hielt nur Punkt und Linie gegen die Farbtabelle – eine fest eingetragene Farbe an Frist oder Unterzeile wäre am Kontrasttest vorbeigelaufen | Test: keine Farbklasse am Markup vorbei an `PROZESS_FARBEN`; je Text sein Eintrag |
| 7 | Die Wörter für das Ende standen zweimal (`ENDE_NAME` und fest in `schrittKurzform`) | `schrittKurzform` liest `ENDE_NAME` |
| 8 | Musterseite: Im Beispiel „Link abgelaufen“ lag die Anfrage drei Wochen vor dem Anlegen | Anlagedatum des Beispiels berichtigt |

Widerlegt bzw. keine Mängel, aber offene Entscheidungen (stehen im Feinplan, Abschnitt 11):
was Sehende unter 640 px von den Schritten noch sehen; kein sichtbares Zeichen für einen
klickbaren Schritt am Handy; „sonst: Offboarding“ nach dem Abschluss.

**Abnahme im Browser** (Chrome über `puppeteer-core`, Testkonto der Entwicklungsdatenbank):

| Punkt | Ergebnis |
|---|---|
| Musterseite in 1440, 1366×768 und 390 px | Bilder neu: `screenshots/ui-muster-*.png`; in keiner Breite ist die Seite breiter als das Fenster |
| Prozessleiste bei 1440, 700 und 390 px | alle acht Lagen angesehen; Titel brechen um, nichts abgeschnitten; bei 390 px Punkte und Kurzform, Knöpfe unter dem Text |
| Höhe der Leiste bei 1440 px | 147 px (beendet) bis 249 px (mit „sonst“ und Frist) |
| Reiter mit der Tastatur | Pfeil rechts, Ende: Auswahl folgt dem Fokus; Bild-auf rollt die Seite (3198 → 2411 px), die Auswahl bleibt; Tab führt in den Inhalt, Umschalt+Tab zurück auf den gewählten Reiter |
| Reiter mit der Maus | ein Klick, ein Wechsel |
| Reiter bei 390 px | die Leiste rollt (421 px Inhalt in 358 px) |
| Schritt als Knopf | per Tab erreichbar, sichtbarer Fokusring (2 px), Enter und Klick melden den Reiter; Tab-Reihenfolge Schritt → Hauptknopf → Nebenknopf |
| Konsole | keine Fehler |

**Nicht geprüft:** Windows-Kontrastmodus (ließ sich in dieser Chrome-Steuerung nicht
nachstellen; die Klassen dafür stehen in beiden Bausteinen und sind getestet, gesehen hat sie
niemand), echter Screenreader, Safari.

**Geprüft:** Typen, Lint, alle Tests grün (192 Suiten, 5.043 Tests; keine neue Lint-Warnung).
Kein Build.

**Aufgefallen:** Solange unter `.claude/worktrees/` Arbeitskopien anderer Sitzungen liegen
(am 02.10. zwei: Token der Führungskraft, `tageZwischen`), nimmt `npm run pruefen` deren
Dateien mit – `tsconfig.json` schließt nur `node_modules` aus, Jest hat keine Ausnahme.
Geprüft wurde deshalb ohne diesen Ordner. Nicht geändert; gehört nach `main`.

**Als Nächstes:** Prototyp-Tag (V0) mit der Musterseite; danach Tag 3 (Bausteine Hinweis und
Textfeld, Detailseite lesend).

### 05.10.2026 – Push und Übergabe

Vor dem Push geprüft: Typen, Lint, alle Tests grün (192 Suiten, 5.043 Tests; ohne
`.claude/`, siehe 0.3). Gepusht: `ux-umbau` mit Feinplan, Tag 1, fünfter Durchsicht, Tag 2 und
diesem Logbuch-Eintrag. Abschnitt 0 für die nächste Sitzung neu geschrieben (Merge von `main`
mit sicheren Konflikten, `tageZwischen`-Branch, Arbeitskopien, Prototyp-Tag, Tag 3–7).

### 05.10.2026 – Merge von `main` (Token-Fix Vertragsende)

`git merge main` holt `6982015` und `3f6d3b0`: Der Token der Führungskraft (`supervisorToken`)
steht in keiner Antwort der HR-Routen mehr (`src/lib/contract-end-antwort.ts`,
`ohneVorgesetztenToken`), dazu die Tests `contract-end-detail.test.ts` und
`contract-end-antwort.test.ts`. Statt der angekündigten sechs Konflikte waren es vier; die Route
`supervisor-link` und der Test `contract-end-reminder-manual` hat Git selbst zusammengeführt.

| Datei | Konflikt | Lösung |
|---|---|---|
| `api/contract-end/[id]/route.ts` | Importzeile | beide: `ohneVorgesetztenToken` (main) und `CONTRACT_END_UEBERGAENGE` (wir) |
| `api/contract-end/[id]/nicht-uebernehmen/route.ts` | Importzeile | beide: `ohneVorgesetztenToken` und `CONTRACT_END_OFFBOARDING_AUS` |
| `contract-end-nicht-uebernehmen.test.ts` | zwei neue Testfälle an derselben Stelle | beide hintereinander (Statusliste; kein Token in der Antwort) |
| `contract-end-supervisor-link.test.ts` | beide Seiten neu angelegt (add/add) | Fassung von `main` als Grundlage, unsere Fälle (Rechte und Mandant, gesperrte und mögliche Status, Listen decken alle Status ab) unverändert dazu; Token-Attrappe einheitlich die von `main` (`geheimer-magic-link-token`, Ablauf 01.11.2026) |

Gegenprobe: Gegenüber `main` bleiben in den Routen nur unsere Statuslisten übrig, gegenüber
`ux-umbau` nur die Änderungen von `main`; kein Testfall einer Seite fehlt.
`supervisorTokenExpiresAt` steht weiter in der Antwort von `GET /api/contract-end/[id]`
(`contract-end-detail.test.ts` prüft es; der Adapter braucht es). Keine Oberfläche des
Vertragsendes liest `supervisorToken`. Typen, Lint und alle Tests grün (194 Suiten, `main`
bringt zwei neue; ohne `.claude/`, siehe 0.3). Die Sperrklinke brauchte keinen neuen Stand.

**Falle beim Prüfen:** `npx jest --testPathIgnorePatterns ".claude" <muster>` nimmt die Muster
dahinter als weitere AUSNAHMEN – es läuft dann alles außer den gesuchten Tests. Mit
Gleichheitszeichen und `--` schreiben: `npx jest --testPathIgnorePatterns=".claude" -- <muster>`.

## 8. Branches und Commits

| Branch | Commit | Inhalt |
|---|---|---|
| `main` | `226338d` | Checklisten: Reihenfolge der Punkte ändern |
| `main` | `2fbc4e4` | Checklisten: Befunde der Durchsicht |
| `ux-umbau` | `37b452b` | Plan Fassung 3 mit Entscheidungen, Screenshots, Screenshot-Skript |
| `ux-umbau` | `9e347d7` | U0 Tag 1: Tokens, Kontrast, Sperrklinke; Feinplan; Projektstand; CLAUDE.md |
| `ux-umbau` | `bd58ec5` | Befunde der Durchsicht: Kontrast, Sperrklinke, `ink-3`, Dokumentation |
| `ux-umbau` | `924f79d` | U0 Tag 2: Button, Statuspille, Gruppe und Zeile, Musterseite, `jest-axe` |
| `main` | `bfb0665` | Sperrklinke je Datei und ohne Kommentare; `npm run pruefen` |
| `main` | `b6e1c8a` | Checklisten: Reihenfolge wirkt im Vorgang; Verschieben, Ziehen, Fokus |
| `ux-umbau` | `656e80d` | Merge von `main` (Stand der Sperrklinke passte ohne Änderung) |
| `ux-umbau` | `c364f3a` | Befunde der zweiten Durchsicht an Bausteinen, Tokens, Tests, Skript, Dokumentation |
| `ux-umbau` | `7511540` | Logbuch: Push vom 01.10.2026 |
| `ux-umbau` | `9153727` | U0 Tag 3: Dialog, Bestätigungsdialog, Toast, Anbieter im Portal-Layout |
| `ux-umbau` | `1097424` | Browserprobe zu Tag 3: Meldungen springen nicht mehr, Abstand auf der Musterseite |
| `ux-umbau` | `17a2f3d` | U0 Tag 4: Seitenkopf mit Pfad und Menü, Segment-Schalter |
| `ux-umbau` | `8e530b0` | U0 Tag 5: Skelett, Leerzustand, Musterseite vollständig |
| `ux-umbau` | `c5afbc0` | Zeitgrenze des Musterseiten-Tests (axe über die ganze Seite) |
| `ux-umbau` | `7778752` | U0 Tag 6: Abnahme, Screenshots, `scripts/ux-abnahme.js`, Umbruch in Pille und Zeile |
| `ux-umbau` | `c66f451` | Feinplan U1 (Entwurf) |
| `ux-umbau` | `44ea9e3` | Feinplan U1 freigegeben (F1–F4) |
| `ux-umbau` | `bbaa2c4` | U1 Tag 1: neue Adressen, Weiterleitung, Verweise über `adressen.ts` |
| `ux-umbau` | `8874a30` | Befunde der dritten Durchsicht |
| `ux-umbau` | `96d7720` | U1 Tag 2: ein Kopf im Layout, Navigationstabelle, Anmeldeseite in eigener Gruppe |
| `ux-umbau` | `fed608d` | Befunde der vierten Durchsicht |
| `ux-umbau` | `9f9ceac` | U1 Tag 3: Abnahme, Bilder des Kopfs, `scripts/ux-abnahme-u1.js` |
| `ux-umbau` | `fbac12d` | Logbuch: Push vom 02.10.2026, Kennung nachgetragen |
| `ux-umbau` | `ea65ba9` | Übergabe nach U1 |
| `ux-umbau` | `f87fb38` | Feinplan Pilot Vertragsende, freigegeben (F1–F9) |
| `ux-umbau` | `9d6baf4` | Pilot Tag 1: Prozess-Stand, Adapter Vertragsende, Statusübergänge in eigener Datei |
| `ux-umbau` | `5975909` | Befunde der fünften Durchsicht; Statuslisten der HR-Routen in `contract-end-status.ts` |
| `ux-umbau` | `61b817f` | Pilot Tag 2: Bausteine Prozessleiste und Reiter, Musterseite, Token-Leser, Befunde der sechsten Durchsicht |

Kennungen werden jeweils im nächsten Commit nachgetragen (ein Commit kann seine eigene nicht
enthalten); `git log --oneline main..ux-umbau` zeigt den aktuellen Stand.

Gepusht nach Freigabe: am 01.10.2026 `main` bis `b6e1c8a` und `ux-umbau` bis `7511540`; am 02.10.2026 `ux-umbau` bis `9f9ceac` (U0 Tag 3 bis 6, U1 vollständig, vier Durchsichten). Nicht deployt; ein Deploy von `main` bringt neben der Checklisten-Änderung auch Paket 3 mit (zwei neue Tabellen). Am 05.10.2026 gepusht: `ux-umbau` bis einschließlich des Logbuch-Commits vom 05.10.2026 (Feinplan des Pilots `f87fb38`, Pilot Tag 1 `9d6baf4`, fünfte Durchsicht `5975909`, Pilot Tag 2 `61b817f`). Uncommittet bleiben der LOGA-Abschnitt in `docs/README.md` und
`docs/module/loga/` (eigener Strang).
