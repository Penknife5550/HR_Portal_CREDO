# U0 Fundament – Feinplan

Stand 01.10.2026 · gehört zu [ux-ui-plan-2026-09.html](ux-ui-plan-2026-09.html), Abschnitt 5 (Paket U0) ·
Branch `ux-umbau` · Status: **freigegeben am 01.10.2026** (F1–F4 wie vorgeschlagen), Tag 1 und 2 erledigt ·
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
| E5 | kein dunkler Modus, Portal fest hell | `color-scheme: light`, kein zweiter Token-Satz |
| E6 | „du“ hinter der Anmeldung, sonst „Sie“ | Texte der Bausteine ohne Anrede; Vorgaben wie „Abbrechen“, „Schließen“ |
| E7 | Montserrat für alles | ITC Avant Garde aus `--font-heading` streichen |
| E10 | Pilot Vertragsende | U0 baut zuerst, was der Pilot braucht (Abschnitt 2) |

## 2. Umfang

### In U0

1. **Tokens** in `src/app/globals.css` (3.1), Schrift, `color-scheme: light`.
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
| Suchfeld (Strg+K) | U1, nach dem Pilot | Der Pilot braucht es nicht; es hängt an den Listen-Endpunkten aller Module |
| Datumsfeld | erstes Formular, das es braucht | Vertragsende-Detail hat keinen neuen Datumsdialog; sonst entsteht ein Baustein ohne Aufrufer |
| Emojis aus der Navigation entfernen | U1 | gehört zum Kopf, den U1 ohnehin neu einbindet |
| 74 × `toLocaleDateString` ablösen | U4, je Modul | siehe 3.4 – die Funktion gibt es schon, das Ersetzen ändert Seiten |

Damit bleibt U0 bei den 5–6 Tagen des Plans, trotz Musterseite und Sperrklinke.

### Nicht angefasst

- Keine Fachlogik, keine API-Route, kein Prisma-Schema, keine Mail- oder Word-Vorlage.
- Keine bestehende Seite und kein bestehender Dialog wird umgestellt – auch nicht
  `src/components/unterlagen/dialog-rahmen.tsx` (siehe 3.2, Dialog).
- Die alten Tokens (`--color-primary`, `--color-status-*`, `--color-credo-*`,
  `--color-einrichtung-*`) bleiben unverändert stehen. Sie werden abgelöst, wenn ihr letzter
  Aufrufer umgebaut ist (U3/U4).

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
| `info` / `info-soft` | `#1a6494` / `rgba(29,111,165,.12)` | Hinweis |
| `neutral-soft` | `rgba(0,0,0,.06)` | neutrale Pille, Segment-Hintergrund |

Dazu: Radius 8 px (`rounded-lg`, Knöpfe, Felder) und 12 px (`rounded-xl`, Gruppen, Dialoge) –
beide gab es schon; `--shadow-overlay` nur für Dialog und Toast; Schriftskala aus Abschnitt 3
des Plans.

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

**Hell:** `color-scheme: light` auf `:root` (E5).

### 3.2 Bausteine in `src/components/ui/`

Eine Datei je Baustein, Varianten über `class-variance-authority` (liegt in `package.json`,
bisher ungenutzt), Symbole nur aus `lucide-react`. Jeder Baustein nimmt `className` an und
kennt keine Fachbegriffe.

| Datei | Inhalt | Regeln |
|---|---|---|
| `button.tsx` | Varianten `primary`, `secondary`, `ghost`, `critical`; Größen `md`, `sm`; Zustand `laedt` | Standard `type="button"`; `laedt` sperrt und zeigt den Text weiter; mit `asChild` (Radix Slot) auch als `<Link>` |
| `statuspille.tsx` | Töne `ok`, `wait`, `critical`, `info`, `neutral`; Punkt plus Text | Text ist Pflicht (nie nur Farbe); kein Einrichtungs-Farbpunkt daneben |
| `gruppe.tsx` | `Gruppe` (weiße Fläche, Haarlinien, Beschriftung darüber, Aktion rechts) und `Zeile` (Beschriftung/Wert oder frei) | ersetzt die Kartenwände; Beschriftung in `ink-2` |
| `segment.tsx` | Umschalter mit zwei bis fünf Werten, optional Zähler | Tastatur wie Radix Tabs (Pfeiltasten); nicht für Navigation zwischen Seiten |
| `dialog.tsx` | `Dialog` auf Radix, dazu `BestaetigungsDialog` (Titel, Satz, zwei Knöpfe, Variante `critical`) | siehe „Dialog“ unten |
| `toast.tsx` | Radix Toast, Anbieter im Portal-Layout, Aufruf `toast.ok(…)`, `toast.fehler(…)`, optional „Rückgängig“ | Fehler bleiben stehen, bis sie geschlossen werden; Erfolg 5 s |
| `skelett.tsx` | graue Zeilen als Ladezustand für Liste und Gruppe | `aria-busy`, kein Text „Lädt…“ nötig |
| `leerzustand.tsx` | Symbol (lucide), Titel, Satz, optional ein Knopf | kein Emoji |
| `seitenkopf.tsx` | Breadcrumb, Titel, Unterzeile, rechts Statuspille, Primärknopf und „…“-Menü (Radix Dropdown) | Breadcrumb-Einträge als Eigenschaft; Links über `next/link` |

**Dialog – eine Entscheidung nötig (F1).** Es gibt bereits einen sorgfältig gebauten Rahmen:
`src/components/unterlagen/dialog-rahmen.tsx` (ohne Radix). Er regelt Dinge, die Radix nicht
von sich aus tut und die bleiben müssen:

- Escape und „Abbrechen“ schließen **nicht**, während eine Aktion läuft.
- Ein neuer Serverfehler bekommt den Fokus (`role="alert"`).
- Ein gesperrter Bestätigen-Knopf nennt seinen Grund als sichtbaren Text.
- Nach dem Schließen geht der Fokus zurück; ist der Auslöser weg, auf ein Ersatzziel.

Vorschlag: `ui/dialog.tsx` auf Radix bauen (Fokusfang, Portal, Scroll-Sperre und ARIA kommen
dann aus einer gepflegten Bibliothek) und diese vier Regeln als Eigenschaften übernehmen
(`gesperrt`, `fehler`, `sperrGrund`, `fokusZiel`). `dialog-rahmen.tsx` und die übrigen
28 selbst gebauten Überlagerungen (`fixed inset-0`) bleiben in U0 unberührt und ziehen mit U4
und U10 um, zusammen mit ihren Tests.

### 3.3 Musterseite

`src/app/(portal)/ui-muster/page.tsx`: alle Bausteine in allen Varianten und Zuständen, dazu
die Token-Tabelle als Farbfelder. Sie ist die Abnahmegrundlage („noch keine Seite sieht anders
aus“ lässt sich sonst nicht zeigen) und das Motiv für das Screenshot-Skript.

Sichtbar nur für `SUPER_ADMIN`, ohne Eintrag in der Navigation (F3).

### 3.4 Datum: nichts Neues bauen

Der Plan verlangt „eine Datumsfunktion für die Oberfläche“. Sie existiert:
`formatDatumDE` in `src/lib/format.ts` (deutsche Zeit, TT.MM.JJJJ, unabhängig von den
ICU-Daten der Laufzeit). U0 baut keine zweite.

Das Ersetzen der heute **74** Aufrufe von `toLocaleDateString` gehört nicht in U0: Es berührt
über 30 Dateien, und der Browser rechnet dort in der Zeitzone des Geräts, `formatDatumDE` in
deutscher Zeit – das ist richtig, aber eine sichtbare Änderung, die je Modul mit U4 geprüft
werden muss. Die Sperrklinke (Abschnitt 5) verhindert bis dahin neue Aufrufe.

## 4. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/app/globals.css` | neue Tokens, `--font-heading`, `color-scheme` |
| `src/components/ui/*.tsx` | neu (neun Dateien) |
| `src/app/(portal)/ui-muster/page.tsx` | neu |
| `src/app/(portal)/layout.tsx` | Toast-Anbieter einhängen (eine Zeile; die Datei gibt es schon) |
| `src/__tests__/components/ui-bausteine.test.tsx` | neu (ein Testfile für die kleinen Bausteine; Dialog und Toast bekommen eigene) |
| `src/__tests__/lib/ui-kontrast.test.ts`, `ui-sperrklinke.test.ts` | neu |
| `package.json` | `jest-axe` und `@types/jest-axe` als devDependencies (F2) |
| `CLAUDE.md` | neuer Abschnitt „Oberfläche“: Tokens, Bausteine, Regeln E1–E7 |

**Mail- und Word-Vorlagen:** keine betroffen.
**Schema-Delta:** keines.

## 5. Tests

- **Je Baustein** ein Komponententest (jsdom im Docblock, wie die bestehenden): Varianten,
  Tastatur, die Regeln aus 3.2. Für den Dialog ausdrücklich: Escape während `gesperrt`
  schließt nicht; Fokus kehrt zurück; Fehler bekommt den Fokus.
- **axe** über `jest-axe`, je Datei eingebunden (kein `setupFilesAfterEnv`, die Jest-Konfiguration
  bleibt unverändert): Rollen, Namen, ARIA.
- **Kontrast** als eigener Test: axe kann in jsdom keine Farbkontraste messen (es gibt dort
  kein Layout). Der Test rechnet die Token-Paare aus 3.1 nach WCAG und verlangt 4,5:1 für
  Text und 3:1 für Bedienelemente; `ink-3` steht in keiner der Listen. Ein halbtransparenter
  Hintergrund ohne Untergrund ist ein Fehler, keine falsche Zahl.
- **Sperrklinke:** ein Test zählt im Quelltext `confirm(`, `alert(`, `toLocaleDateString` und
  fest eingetragene Hex-Farben in Klassen und vergleicht mit dem Stand vom 01.10.2026. Die
  Zahl darf sinken, nicht steigen. Wer ein Modul umbaut, senkt die Grenze im selben Commit.

  | Muster | Stand 01.10.2026 | Plan (Fassung 2) |
  |---|---|---|
  | `confirm(` | 33 | 28 |
  | `alert(` | 4 | 4 |
  | `toLocaleDateString` | 74 | 47 |
  | Hex-Farbe in einer Klasse (auch mitten im Wert) | 181 | – |
  | `rgb()` in einer Klasse | 1 | – |
  | Hex-Farbe in einem `style`-Objekt | 10 | – |
  | selbst gebaute Überlagerung (`fixed inset-0`) | 29 | 27 |
  | Inline-`<svg` | 150 | 146 |

  Die Zahlen sind seit Fassung 2 gestiegen, weil Paket 3, Paket 4 und der Zeitplaner im
  heutigen Stil dazugekommen sind. Genau das soll die Sperrklinke ab jetzt verhindern.

## 6. Reihenfolge

| Tag | Arbeit | Ergebnis |
|---|---|---|
| 1 | Tokens, Schrift, `color-scheme`; Kontrasttest; Sperrklinke | grüne Tests, keine sichtbare Änderung |
| 2 | Button, Statuspille, Gruppe und Zeile | erste Bausteine auf der Musterseite |
| 3 | Dialog, Bestätigungsdialog, Toast mit Anbieter | Ersatz für `confirm()` und `alert()` steht bereit |
| 4 | Seitenkopf mit Breadcrumb und Menü, Segment | Kopf für U1 und den Pilot |
| 5 | Skelett, Leerzustand; Musterseite vollständig; axe über alles | Abnahme möglich |
| 6 | Puffer; CLAUDE.md „Oberfläche“; Screenshots der Musterseite in 1440, 1366×768 und 390 px | Paket deploybar |

Je Tag ein Commit auf `ux-klarer-weg`; `main` bleibt deploybar.

## 7. Abnahme

1. `npm run test`, `npm run lint` und `npm run build` sind grün.
2. Die Musterseite zeigt alle Bausteine; Screenshots in drei Breiten liegen in
   `docs/module/ux-ui/screenshots/`.
3. Vorher/Nachher-Screenshots von fünf bestehenden Seiten (Anmeldung, Onboarding-Liste,
   Onboarding-Detail, Einstellungen, Fragebogen) sind bis auf die Überschriften-Schrift
   gleich. Auch die Schrift ändert sich nirgends: `--font-heading` war zwar definiert,
   wurde aber von keiner Seite benutzt (die Aussage „einmal verwendet“ im Plan war falsch).
   Das Token ist jetzt für die neuen Bausteine richtig gesetzt.
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
| F2 | `jest-axe` als neue Entwicklungsabhängigkeit? | Ja; läuft nur im Test, nicht im Container |
| F3 | Musterseite auch in Produktion erreichbar (nur `SUPER_ADMIN`)? | Ja, ohne Navigationseintrag – sie hilft bei der Abnahme auf dem Server |
| F4 | Zuschnitt aus Abschnitt 2 (Aufgaben-Badge, Suchfeld, Datumsfeld später)? | Ja |

## 10. Fortschritt

| Tag | Stand | Commit |
|---|---|---|
| 1 Tokens, Schrift, `color-scheme`, Kontrasttest, Sperrklinke | **erledigt 01.10.2026** | siehe [projekt-ux-umbau.md](projekt-ux-umbau.md), Abschnitt 8 |
| 2 Button, Statuspille, Gruppe und Zeile, Musterseite begonnen, `jest-axe` | **erledigt 01.10.2026** | siehe Logbuch, Abschnitt 8 |
| 3 Dialog, Bestätigungsdialog, Toast | offen | |
| 4 Seitenkopf, Segment | offen | |
| 5 Skelett, Leerzustand, Musterseite, axe | offen | |
| 6 Puffer, Screenshots | offen | |

Gegenüber Abschnitt 4 kam an Tag 1 eine Datei dazu: `src/lib/ui/kontrast.ts` (die Rechnung
des Kontrasttests, rein und client-sicher). Der Abschnitt „Oberfläche“ in `CLAUDE.md` wurde
vorgezogen und wächst mit jedem Tag mit.
