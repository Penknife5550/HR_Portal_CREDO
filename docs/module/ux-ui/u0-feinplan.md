# U0 Fundament – Feinplan

Stand 01.10.2026 · gehört zu [ux-ui-plan-2026-09.html](ux-ui-plan-2026-09.html), Abschnitt 5 (Paket U0) ·
Branch `ux-umbau` · Status: **freigegeben am 01.10.2026** (F1–F4 wie vorgeschlagen), **gebaut und abgenommen am 02.10.2026** (Tag 1 bis 6; offen nur die Tastaturprobe von Hand), zwei Durchsichten eingearbeitet ·
Stand und Protokoll: [projekt-ux-umbau.md](projekt-ux-umbau.md)

## 1. Ziel

U0 legt die Farben, die Schrift und die Grundbausteine an, aus denen U1 (Rahmen) und der
Pilot Vertragsende gebaut werden. Nach U0 sieht **keine bestehende Seite anders aus**. Sichtbar
ist nur eine Musterseite, auf der alle Bausteine nebeneinander stehen.

Grundlage sind die Entscheidungen vom 01.10.2026:

| # | Entscheidung | Folge für U0 |
|---|---|---|
| E1 | CI-Farben nur für Linie und Einrichtungen, Zustände funktional, Interaktion CI-Grau | Token-Satz in 3.1 |
| E3 | obere Leiste, höchstens sechs Punkte | Seitenkopf ohne Seitenleisten-Variante |
| E4 | `/vorgaenge/<modul>/<uuid>` | Breadcrumb bekommt ihre Einträge als Eigenschaft, liest nichts aus der Adresse |
| E5 | kein dunkler Modus, Portal fest hell | `color-scheme: only light`, kein zweiter Token-Satz |
| E6 | „du“ hinter der Anmeldung, sonst „Sie“ | Texte der Bausteine ohne Anrede; Vorgaben wie „Abbrechen“, „Schließen“ |
| E7 | Montserrat für alles | ITC Avant Garde aus `--font-heading` streichen |
| E10 | Pilot Vertragsende | U0 baut zuerst, was der Pilot braucht (Abschnitt 2) |

## 2. Umfang

### In U0

1. **Tokens** in `src/app/globals.css` (3.1), Schrift, `color-scheme: only light`.
2. **Bausteine** in `src/components/ui/` (3.2): Button, Statuspille, Gruppe mit Zeile,
   Segment-Schalter, Dialog mit Bestätigungsdialog, Toast, Skelett, Leerzustand, Seitenkopf mit
   Breadcrumb.
3. **Musterseite** `/ui-muster` (3.3) als Abnahme- und Screenshot-Grundlage.
4. **Tests** (Abschnitt 5): je Baustein ein Komponententest mit axe, ein Kontrasttest über die
   Token-Paare, eine Sperrklinke gegen neue Altmuster.

### Bewusst nicht in U0 (Abweichung vom Paket im Plan)

| Baustein laut Plan | Kommt mit | Grund |
|---|---|---|
| Aufgaben-Badge | Paket 6 | Die Definition „offen/überfällig“ gibt es erst dort; ein Badge ohne Regel wäre geraten |
| Suchfeld (Strg+K) | U1 (kann dort hinter den Pilot rücken) | Der Pilot braucht es nicht; es hängt an den Listen-Endpunkten aller Module |
| Datumsfeld | erstes Formular, das es braucht | Vertragsende-Detail hat keinen neuen Datumsdialog; sonst entsteht ein Baustein ohne Aufrufer |
| Emojis aus der Navigation entfernen | U1 | gehört zum Kopf, den U1 ohnehin neu einbindet |
| Emojis aus den BEM-Bannern entfernen | U4 (BEM) | die Banner liegen in `bem-detail-content.tsx`, das U4 ohnehin teilt und umbaut |
| 72 Aufrufe von `toLocaleDateString`/`toLocaleTimeString` ablösen | U4, je Modul | siehe 3.4 – die Funktion gibt es schon, das Ersetzen ändert Seiten |

Damit bleibt U0 bei den 5–6 Tagen des Plans, trotz Musterseite und Sperrklinke.

### Nicht angefasst

- Keine Fachlogik, keine API-Route, kein Prisma-Schema, keine Mail- oder Word-Vorlage.
- Keine bestehende Seite und kein bestehender Dialog wird umgestellt – auch nicht
  `src/components/unterlagen/dialog-rahmen.tsx` (siehe 3.2, Dialog).
- Die alten Tokens (`--color-primary`, `--color-muted-foreground`, `--color-status-*` und
  `--color-credo-*` als Zustandsfarbe) bleiben unverändert stehen. Sie werden abgelöst, wenn
  ihr letzter Aufrufer umgebaut ist (U3/U4). `--color-credo-*` für die Linie und
  `--color-einrichtung-*` BLEIBEN dauerhaft – das sind nach E1 Marke und Einrichtung.

## 3. Was gebaut wird

### 3.1 Tokens

Tailwind 4 liest die Tokens aus `@theme inline` in `globals.css`; aus `--color-surface` wird
die Klasse `bg-surface`. Englische Namen, wie im Plan festgelegt. Werte aus Abschnitt 3 des
Plans (dort `--z-*`).

| Token | Wert | Verwendung |
|---|---|---|
| `surface` | `#f5f5f4` | Seitengrund |
| `card` | `#ffffff` | Gruppen, Dialoge (vorhanden, bleibt) |
| `ink` | `#1c1c1a` | Text, Überschriften |
| `ink-2` | `#666662` | Nebentext, Beschriftungen |
| `ink-3` | `#9a9a95` | **nur** Gesperrtes, Trennzeichen, Zierde – kein Text, auch kein Platzhalter (siehe Hinweis) |
| `hairline` | `rgba(0,0,0,.08)` | Linien zwischen Zeilen, Rand der Gruppen |
| `action` / `action-foreground` | `#575756` / `#ffffff` | Primärknopf, aktiver Zustand, Fokusring |
| `action-soft` | `rgba(87,87,86,.12)` | Hintergrund aktiver Elemente |
| `ok` / `ok-soft` | `#27702b` / `rgba(46,125,50,.13)` | erledigt |
| `wait` / `wait-soft` | `#a34a08` / `rgba(217,119,6,.14)` | wartet, Frist naht |
| `critical` / `critical-foreground` / `critical-soft` | `#b42318` / `#ffffff` / `rgba(180,35,24,.10)` | überfällig, Fehler, löschen |
| `critical-hover` | `#9a1e14` | Fläche des kritischen Knopfs beim Überfahren (Weiß darauf 8,2:1) |
| `info` / `info-soft` | `#1a6494` / `rgba(29,111,165,.12)` | Hinweis |
| `neutral-soft` | `rgba(0,0,0,.06)` | neutrale Pille, Segment-Hintergrund |

Dazu: Radius 8 px (`rounded-lg`, Knöpfe, Felder) und 12 px (`rounded-xl`, Gruppen, Dialoge) –
beide gab es schon; `--shadow-overlay` nur für Dialog und Toast.

**Schriftskala** (Abschnitt 3 des Plans, „verbindlich“), als Tokens, soweit Tailwind sie nicht
schon hat: Seitentitel `text-titel` (28 px) mit `tracking-titel` (−1 %), Gruppentitel
`text-2xs` (11 px, Versalien) mit `tracking-label` (+6 %); Inhalt ist `text-sm` (14 px),
Erläuterung `text-xs` (12 px). Nachgetragen am 01.10.2026 nach der zweiten Durchsicht – an
Tag 1 fehlte sie, und der Gruppentitel stand auf 12 px / +2,5 %.

**Größen-Tokens und `cn()`:** tailwind-merge hält jeden unbekannten Namen für eine Farbe.
`shadow-overlay`, `text-titel`, `text-2xs`, `tracking-label` und `tracking-titel` sind deshalb
in `src/lib/utils.ts` eingetragen (`extendTailwindMerge`); der Test `utils-cn.test.ts`
vergleicht mit `globals.css`.

**Gemessen an Tag 1 (01.10.2026), vier Werte gegenüber dem Plan geändert:** Die Zustandstöne
des Plans erreichten als Text auf ihrem `-soft`-Grund nur 4,0–4,6:1; verlangt sind 4,5:1,
auch wenn die Pille frei auf dem Seitengrund steht. `ok`, `wait` und `info` sind deshalb
leicht abgedunkelt (jetzt 4,7–5,4:1), ebenso `ink-2` (in der neutralen Pille 4,3:1, jetzt
4,6:1). `critical` blieb, wie es war.

**`ink-3` ist kein Textton:** `#9a9a95` ergibt auf Weiß 2,8:1. Der Plan nutzt den Ton in den
Mockups auch für Beschriftungen über Gruppen. Es gilt: Beschriftungen und jeder lesbare Text
nehmen `ink-2`. Das gilt auch für Platzhalter in Eingabefeldern: Sie sind nach WCAG Text
(Befund der Durchsicht vom 01.10.2026). `ink-3` bleibt für Gesperrtes (von WCAG ausgenommen),
Trennzeichen und Zierde.

**Schrift:** `--font-heading` wird auf Montserrat gesetzt (E7). Montserrat kommt schon über
`next/font` aus `src/app/layout.tsx`, es wird nichts nachgeladen.

**Hell:** `color-scheme: only light` auf `:root` (E5). `light` allein hält nur die Fensterleiste
hell; erst `only` verbietet dem Browser das erzwungene Abdunkeln ganzer Seiten.

### 3.2 Bausteine in `src/components/ui/`

Eine Datei je Baustein, Symbole nur aus `lucide-react`. Jeder Baustein nimmt `className` an
und kennt keine Fachbegriffe. Die Farbklassen stehen als exportierte Tabelle im Baustein
(`BUTTON_FARBEN`, `STATUS_TOENE`), damit Kontrasttest und Musterseite sie lesen können –
deshalb kein `class-variance-authority`, das nur eine Funktion herausgäbe (geändert am
01.10.2026; der erste Wurf nutzte `cva` im Button und eine private Tabelle in der Pille).

| Datei | Inhalt | Regeln |
|---|---|---|
| `button.tsx` | Varianten `primary`, `secondary`, `ghost`, `critical`; Größen `md`, `sm`; Zustand `laedt` | Standard `type="button"`; gesperrt (bei `laedt`, `aria-disabled`, als Verweis bei `disabled`) läuft KEIN Handler – Sperre in der Capture-Phase; `laedt` zeigt Ladesymbol und Text in vollen Farben; mit `asChild` (Radix Slot) auch als `<Link>` |
| `statuspille.tsx` | Töne `ok`, `wait`, `critical`, `info`, `neutral`; Punkt plus Text | Text ist Pflicht (ohne Text zeichnet sie nichts); langer Text bricht zwischen den Wörtern um; kein Einrichtungs-Farbpunkt daneben |
| `gruppe.tsx` | `Gruppe` (weiße Fläche, Haarlinien, Beschriftung darüber, Aktion rechts) und `Zeile` (Beschriftung/Wert oder frei) | ersetzt die Kartenwände; Beschriftung als `h2` in `ink-2`; leerer Wert als „—“ (auch `false`, `[]`, Leerraum); nichts wird abgeschnitten |
| `segment.tsx` | Umschalter mit zwei bis fünf Werten, optional Zähler | Auswahlgruppe (`radiogroup`) mit Pfeiltasten wie bei Reitern, Auswahl folgt dem Fokus; nicht für Navigation zwischen Seiten; rollt waagerecht statt umzubrechen |
| `dialog.tsx` | `Dialog` auf Radix (gesteuert: `offen`, `onSchliessen`; fester Fuß mit „Abbrechen“ und `bestaetigen`), dazu `BestaetigungsDialog` (`alertdialog`: Titel, Satz, zwei Knöpfe, Variante `critical`) | siehe „Dialog“ unten; Klick daneben schließt nicht; Fokus beim Öffnen auf „Abbrechen“ oder dem Feld mit `data-autofokus` |
| `toast.tsx` | Radix Toast, `ToastAnbieter` im Portal-Layout, Aufruf `toast.ok(…)`, `toast.fehler(…)`, `toast.hinweis(…)`, optional „Rückgängig“ | Fehler bleiben stehen, bis sie geschlossen werden; Erfolg 5 s, mit „Rückgängig“ 10 s; ohne Text keine Meldung; Doppelte ersetzen sich, höchstens vier zugleich |
| `skelett.tsx` | graue Zeilen als Ladezustand für Liste und Gruppe | Form und Höhe der Gruppe (nichts springt); `role="status"`, `aria-busy`, ein Satz nur für Screenreader; kein sichtbares „Lädt…“ |
| `leerzustand.tsx` | Symbol (lucide), Titel, Satz, optional ein Knopf | kein Emoji; leer ist nicht Fehler und nicht „lädt“; „kein Treffer für den Filter“ ist ein eigener Text; Titel ist keine Überschrift |
| `seitenkopf.tsx` | Breadcrumb, Titel, Unterzeile, Statuspille am Titel, rechts Primärknopf und „…“-Menü (Radix Dropdown) | Breadcrumb-Einträge als Eigenschaft; Links über `next/link`; Titel = `h1` und Ersatzziel für den Fokus (`SEITENTITEL_ID`); ein Menüpunkt läuft erst nach dem Schließen des Menüs |

**Dialog (F1, entschieden: Radix).** Es gibt bereits einen sorgfältig gebauten Rahmen:
`src/components/unterlagen/dialog-rahmen.tsx` (ohne Radix). Er regelt Dinge, die Radix nicht
von sich aus tut und die bleiben müssen:

- Escape und „Abbrechen“ schließen **nicht**, während eine Aktion läuft.
- Ein neuer Serverfehler bekommt den Fokus (`role="alert"`).
- Ein gesperrter Bestätigen-Knopf nennt seinen Grund als sichtbaren Text.
- Nach dem Schließen geht der Fokus zurück; ist der Auslöser weg, auf ein Ersatzziel.

Entschieden: `ui/dialog.tsx` auf Radix bauen (Fokusfang, Portal, Scroll-Sperre und ARIA kommen
dann aus einer gepflegten Bibliothek) und diese vier Regeln als Eigenschaften übernehmen
(`gesperrt`, `fehler`, `bestaetigen.sperrGrund`, `fokusZiel`; gebaut an Tag 3). Während
`gesperrt` bleiben die Knöpfe fokussierbar (`aria-disabled` statt `disabled` wie im alten
Rahmen). `dialog-rahmen.tsx` und die übrigen
28 selbst gebauten Überlagerungen (`fixed inset-0`) bleiben in U0 unberührt und ziehen mit U4
und U10 um, zusammen mit ihren Tests. Die Überlagerung des neuen Dialogs zählt die Sperrklinke
nicht (`src/components/ui/` ist bei diesem Muster ausgenommen). Der Schatten kommt über
`shadow-overlay`.

### 3.3 Musterseite

`src/app/(portal)/ui-muster/page.tsx`: alle Bausteine in allen Varianten und Zuständen, dazu
die Token-Tabelle als Farbfelder. Sie ist die Abnahmegrundlage („noch keine Seite sieht anders
aus“ lässt sich sonst nicht zeigen) und das Motiv für das Screenshot-Skript.

Sichtbar nur für `SUPER_ADMIN`, ohne Eintrag in der Navigation (F3).

### 3.4 Datum: nichts Neues bauen

Der Plan verlangt „eine Datumsfunktion für die Oberfläche“. Sie existiert:
`formatDatumDE` in `src/lib/format.ts` (deutsche Zeit, TT.MM.JJJJ, unabhängig von den
ICU-Daten der Laufzeit). U0 baut keine zweite.

Das Ersetzen der heute **72** Aufrufe von `toLocaleDateString`/`toLocaleTimeString` (in 41
Dateien, ohne Kommentare gezählt) gehört nicht in U0. Im Browser rechnen sie in der Zeitzone
des Geräts, im Servercode (rund ein Viertel) in der des Containers, `formatDatumDE` immer in
deutscher Zeit – das ist richtig, aber eine sichtbare Änderung, die je Modul mit U4 geprüft
werden muss. Die Sperrklinke (Abschnitt 5) verhindert bis dahin neue Aufrufe.

## 4. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/app/globals.css` | neue Tokens, `--font-heading`, `color-scheme` |
| `src/components/ui/*.tsx` | neu (neun Dateien, alle stehen) |
| `src/app/(portal)/ui-muster/page.tsx` | neu |
| `src/app/(portal)/layout.tsx` | Toast-Anbieter einhängen (eine Zeile; die Datei gibt es schon) |
| `src/__tests__/components/ui-bausteine.test.tsx` | neu (ein Testfile für die kleinen Bausteine) |
| `src/__tests__/components/ui-dialog.test.tsx`, `ui-toast.test.tsx` | neu (Tag 3) |
| `src/__tests__/components/ui-seitenkopf.test.tsx` | neu (Tag 4): Seitenkopf und Segment |
| `src/app/(portal)/ui-muster/dialog-muster.tsx` | neu: der Teil der Musterseite mit Zustand (Dialoge, Meldungen) |
| `src/__tests__/components/ui-musterseite.test.tsx` | neu: Zugang und axe über die echte Musterseite |
| `src/__tests__/hilfen/axe.ts`, `jest-axe.d.ts` | neu: `axeVerstoesse()` für alle Baustein-Tests |
| `src/__tests__/lib/ui-kontrast.test.ts`, `utils-cn.test.ts` | neu |
| `src/__tests__/lib/ui-sperrklinke.test.ts`, `ui-sperrklinke.stand.json` | liegen auf `main` (seit 01.10.2026) |
| `src/lib/utils.ts` | `cn()` kennt die eigenen Größen-Tokens |
| `package.json` | `jest-axe` als devDependency (F2); `npm run pruefen` |
| `CLAUDE.md` | neuer Abschnitt „Oberfläche“: Tokens, Bausteine, Regeln E1–E7 |

**Mail- und Word-Vorlagen:** keine betroffen.
**Schema-Delta:** keines.

## 5. Tests

- **Je Baustein** die Regeln aus 3.2 als Komponententest (jsdom im Docblock, wie die
  bestehenden); die kleinen Bausteine teilen sich `ui-bausteine.test.tsx`, Dialog und Toast
  bekommen eigene Dateien. Für den Dialog ausdrücklich: Escape während `gesperrt` schließt
  nicht; Fokus kehrt zurück; Fehler bekommt den Fokus.
- **axe** über `axeVerstoesse()` aus `src/__tests__/hilfen/axe.ts` (nennt Regel und Knoten).
  Über die echte Musterseite läuft axe in `ui-musterseite.test.tsx` – nicht über eine
  nachgebaute Fixture.
- **Kontrast** als eigener Test: axe kann in jsdom keine Farbkontraste messen (es gibt dort
  kein Layout). Der Test liest die Paare aus den Bausteinen (`STATUS_TOENE`, `BUTTON_FARBEN`,
  in Ruhe und beim Überfahren) und verlangt 4,5:1 auf Karte und Seitengrund. Ein
  halbtransparenter Hinter- oder Untergrund ohne deckende Fläche ist ein Fehler, keine falsche
  Zahl.
- **Sperrklinke** (liegt auf `main`): zählt Altmuster JE DATEI und ohne Kommentare gegen den
  Stand in `ui-sperrklinke.stand.json`. Mehr als im Stand ist ein Fehler mit Dateiname;
  weniger verlangt, den Stand neu zu schreiben (`SPERRKLINKE_STAND=schreiben npx jest
  ui-sperrklinke`) und die Summe im Test nachzuziehen.

  | Muster | Stand 01.10.2026 (ohne Kommentare) |
  |---|---|
  | `confirm(` | 30 |
  | `alert(` | 4 |
  | `prompt(` | 1 |
  | `toLocaleDateString` / `toLocaleTimeString` | 72 |
  | Hex-Farbe in einer Klasse (auch mitten im Wert) | 181 |
  | Farbfunktion in einer Klasse (`rgb`, `hsl`, `oklch` …) | 1 |
  | Hex-Farbe in einem `style`-Objekt (mit Klammerzählung) | 10 |
  | Tailwind-Palettenklasse (`bg-green-100`, `text-red-500` …) | 1.373 |
  | selbst gebaute Überlagerung (`fixed inset-0`, außerhalb von `components/ui/`) | 29 |
  | Inline-`<svg` | 150 |
  | `text-ink-3` | 0 |

  Berichtigung: Frühere Fassungen dieses Abschnitts nannten „33 statt 28 `confirm()`“ und
  „74 statt 47 `toLocaleDateString`“ und erklärten den Zuwachs mit Paket 3, Paket 4 und dem
  Zeitplaner. Das war ein Vergleich zweier Zählweisen (der Plan zählte nur `.tsx` und ohne
  Kommentare). Tatsächlich kamen seit dem 24.09.2026 zwei `confirm()` (beide im Zeitplaner),
  zwei Überlagerungen, vier Inline-SVG und elf Hex-Farben dazu; `toLocaleDateString` blieb
  gleich.

## 6. Reihenfolge

| Tag | Arbeit | Ergebnis |
|---|---|---|
| 1 | Tokens, Schrift, `color-scheme`; Kontrasttest; Sperrklinke | grüne Tests, keine sichtbare Änderung |
| 2 | Button, Statuspille, Gruppe und Zeile | erste Bausteine auf der Musterseite |
| 3 | Dialog, Bestätigungsdialog, Toast mit Anbieter | Ersatz für `confirm()` und `alert()` steht bereit |
| 4 | Seitenkopf mit Breadcrumb und Menü, Segment | Kopf für U1 und den Pilot |
| 5 | Skelett, Leerzustand; Musterseite vollständig; axe über alles | Abnahme möglich |
| 6 | Puffer; CLAUDE.md „Oberfläche“; Screenshots der Musterseite in 1440, 1366×768 und 390 px | Paket deploybar |

Je Tag ein Commit auf `ux-umbau`; `main` bleibt deploybar.

## 7. Abnahme

1. `npm run pruefen` (Typen, Lint, Tests) und `npm run build` sind grün.
2. Die Musterseite zeigt alle Bausteine; Screenshots in drei Breiten liegen in
   `docs/module/ux-ui/screenshots/`.
3. Vorher/Nachher-Screenshots von fünf bestehenden Seiten (Anmeldung, Onboarding-Liste,
   Onboarding-Detail, Einstellungen, Fragebogen) sind gleich – auch in der Schrift:
   `--font-heading` war zwar definiert, wurde aber von keinem Element benutzt. Einzige
   zulässige Abweichung: Die Fensterleiste ist in Chrome und Edge jetzt auch bei dunklem
   Gerät hell (`color-scheme`).
4. Tastaturprobe von Hand: Dialog öffnen, Tab kreist, Escape schließt, Fokus kehrt zurück;
   Menü im Seitenkopf mit Pfeiltasten.

## 8. Deploy

Kein Schema-Delta, keine neue Umgebungsvariable, keine Vorlage zurückzusetzen. U0 kann allein
deployt werden oder zusammen mit U1; allein bringt es dem Personalbüro nichts Sichtbares.
Empfehlung: zusammen mit U1.

## 9. Fragen vor dem Bau – entschieden am 01.10.2026

| # | Frage | Entschieden |
|---|---|---|
| F1 | Dialog auf Radix neu bauen oder `dialog-rahmen.tsx` zum allgemeinen Baustein machen? | Radix, mit den vier Regeln des bestehenden Rahmens als Eigenschaften (3.2) |
| F2 | `jest-axe` als neue Entwicklungsabhängigkeit? | Ja; läuft nur im Test, nicht im Container. Ohne `@types/jest-axe` (eigene Typdatei in `src/__tests__/hilfen/`) |
| F3 | Musterseite auch in Produktion erreichbar (nur `SUPER_ADMIN`)? | Ja, ohne Navigationseintrag – sie hilft bei der Abnahme auf dem Server |
| F4 | Zuschnitt aus Abschnitt 2 (Aufgaben-Badge, Suchfeld, Datumsfeld später)? | Ja |

## 10. Fortschritt

| Tag | Stand | Commit |
|---|---|---|
| 1 Tokens, Schrift, `color-scheme`, Kontrasttest, Sperrklinke | **erledigt 01.10.2026** | siehe [projekt-ux-umbau.md](projekt-ux-umbau.md), Abschnitt 8 |
| 2 Button, Statuspille, Gruppe und Zeile, Musterseite begonnen, `jest-axe` | **erledigt 01.10.2026** | siehe Logbuch, Abschnitt 8 |
| 3 Dialog, Bestätigungsdialog, Toast, Anbieter im Portal-Layout, Token `scrim` | **erledigt 01.10.2026** | siehe Logbuch, Abschnitt 8 |
| 4 Seitenkopf mit Pfad und Menü, Segment-Schalter | **erledigt 02.10.2026** | siehe Logbuch, Abschnitt 8 |
| 5 Skelett, Leerzustand, Musterseite vollständig (Test), axe über die Seite | **erledigt 02.10.2026** | siehe Logbuch, Abschnitt 8 |
| 6 Abnahme: Build, Screenshots der Musterseite, Vorher/Nachher von fünf Seiten (bildgleich), `scripts/ux-abnahme.js` | **erledigt 02.10.2026** | siehe Logbuch, Abschnitt 7 und 8 |

Gegenüber Abschnitt 4 kam an Tag 1 eine Datei dazu: `src/lib/ui/kontrast.ts` (die Rechnung
des Kontrasttests, rein und client-sicher). Der Abschnitt „Oberfläche“ in `CLAUDE.md` wurde
vorgezogen und wächst mit jedem Tag mit.
