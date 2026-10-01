# UX-Umbau „Klarer Weg“ – Projektstand

**Hier einsteigen.** Diese Datei ist das Logbuch des Projekts: Stand, Entscheidungen, Regeln,
Abweichungen vom Plan und ein Protokoll je Arbeitstag. Sie wird mit **jedem** Commit auf
`ux-umbau` fortgeschrieben.

Letzte Änderung: 01.10.2026 (U0, Tag 1)

## 1. Worum es geht

Das Portal bekommt eine gemeinsame Sprache der Oberfläche: eine Prozessleiste für alle Module,
gruppierte Listen statt Kartenwände, eigene Dialoge statt Browser-Rückfragen, eine
Interaktionsfarbe. Die Fachlogik bleibt unangetastet.

| Dokument | Wofür |
|---|---|
| [ux-ui-plan-2026-09.html](ux-ui-plan-2026-09.html) | Der Plan (Fassung 3): Bewertung, Zielbild mit Mockups, Pakete, Entscheidungen, Leitplanken |
| [u0-feinplan.md](u0-feinplan.md) | Feinplan des laufenden Pakets U0 |
| `projekt-ux-umbau.md` (diese Datei) | Stand, Protokoll, Abweichungen |
| `CLAUDE.md`, Abschnitt „Oberfläche (UX-Umbau)“ | Die Regeln, die beim Programmieren gelten |
| [screenshots/](screenshots/) | Vorher-Bilder; erzeugt von `scripts/ux-screenshots.js` |

## 2. Stand auf einen Blick

| Paket | Inhalt | Stand |
|---|---|---|
| Schritt 0 | Entscheidungen vor U0, Plan committen | **erledigt** 01.10.2026; offen: Paket 3 deployen |
| V0 | Prototyp-Tag mit dem Personalbüro, Testdaten, Screenshot-Skript | offen – Termin setzt der Projektverantwortliche; **Voraussetzung für den Pilot** |
| **U0** | Tokens und Basis-Bausteine | **in Arbeit**, Tag 1 von 6 erledigt |
| U1 | Rahmen: Kopf, Breadcrumb, neue Adressen | offen |
| Pilot | U2 + U4 für Vertragsende, Vorschau-Schalter | offen |
| danach | Reihenfolge laut Plan, Abschnitt 5 | offen |

## 3. Arbeitsweise

- **Branch:** `ux-umbau` (von `main`). Alles zum Umbau landet dort, je Arbeitstag mindestens ein
  Commit. `main` bleibt deploybar; Dinge, die nichts mit dem Umbau zu tun haben, gehen direkt
  nach `main`, danach wird `ux-umbau` darauf nachgezogen (`git rebase main`, solange der Branch
  nicht gepusht ist; danach `git merge main`).
- **Nichts wird ohne Auftrag gepusht.** Das Repository ist öffentlich.
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
| E5 | Dunkler Modus | Nein. Portal fest hell (`color-scheme: light`), Tokens vorbereitet. |
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
| Heller Ton `ink-3` | in den Mockups auch für Beschriftungen | nur für Platzhalter, Gesperrtes, Trennzeichen | 2,8:1 auf Weiß – kein Textton. Beschriftungen nehmen `ink-2`. |
| Umfang U0 | Aufgaben-Badge, Suchfeld, Datumsfeld, Datumsfunktion, 47 × `toLocaleDateString` ablösen | siehe F4; die Datumsfunktion gibt es schon (`formatDatumDE`), das Ablösen kommt je Modul mit U4 | Bausteine ohne Aufrufer vermeiden; das Ablösen ändert sichtbar das Verhalten (Zeitzone des Geräts → deutsche Zeit) und muss je Modul geprüft werden. |
| U0 zusätzlich | – | Sperrklinke-Test, Kontrasttest, Musterseite | siehe Feinplan, Abschnitt 5 und 3.3 |
| Zahlen der Altmuster | 28 `confirm()`, 47 `toLocaleDateString`, 27 Überlagerungen, 146 Inline-SVG | 33 / 74 / 29 / 150 (gemessen 01.10.2026) | Paket 3, Paket 4 und der Zeitplaner kamen nach Fassung 2 im alten Stil dazu. |

Die Mockups im Plan zeigen weiter die ursprünglichen Farbwerte; maßgeblich ist `globals.css`.

## 6. Regeln, die schon gelten

Kurzfassung; verbindlich und ausführlich in `CLAUDE.md`, Abschnitt „Oberfläche (UX-Umbau)“.

1. Neue Oberfläche nutzt nur die neuen Tokens (`surface`, `ink`, `action`, `ok`, `wait`,
   `critical`, `info`, …) und – sobald vorhanden – die Bausteine aus `src/components/ui/`.
2. Kein neues `confirm()`, `alert()`, `toLocaleDateString`, keine neue Hex-Farbe in einer
   Klasse, keine neue selbst gebaute Überlagerung, kein neues Inline-SVG. Der Test
   `ui-sperrklinke.test.ts` hält die Zahlen fest; wer ein Altmuster entfernt, senkt die Grenze
   im selben Commit.
3. Wer einen Farbwert ändert oder ein neues Farbpaar baut, lässt `ui-kontrast.test.ts` laufen
   bzw. trägt das Paar dort ein.
4. `ink-3` nie für Text.
5. Anrede nach E6; Portal-Texte möglichst ohne Anrede.

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

**Sichtbare Änderung:** keine, bis auf die Überschriften-Schrift an der einen Stelle, die
`--font-heading` nutzt, und nur auf Rechnern, auf denen ITC Avant Garde installiert war.

**Nebenbei, auf `main`:** Reihenfolge der Punkte im Checklisten-Vorlagen-Editor per Ziehen und
Pfeilen (`226338d`). Gehört nicht zum Umbau. Im Browser noch nicht von Hand geprüft.

**Offen aus Schritt 0:** Paket 3 deployen; Termin für den Prototyp-Tag (V0).

**Als Nächstes (U0, Tag 2):** `jest-axe` einrichten; Button, Statuspille, Gruppe mit Zeile;
Musterseite `/ui-muster` beginnen.

## 8. Branches und Commits

| Branch | Commit | Inhalt |
|---|---|---|
| `main` | `226338d` | Checklisten: Reihenfolge der Punkte ändern |
| `ux-umbau` | `9259c7a` | Plan Fassung 3 mit Entscheidungen, Screenshots, Screenshot-Skript |
| `ux-umbau` | (dieser Commit) | U0 Tag 1: Tokens, Kontrast, Sperrklinke; Feinplan; Projektstand; CLAUDE.md |

Nichts davon ist gepusht. Uncommittet bleiben der LOGA-Abschnitt in `docs/README.md` und
`docs/module/loga/` (eigener Strang).
