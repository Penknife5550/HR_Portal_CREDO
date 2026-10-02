# U1 Rahmen – Feinplan

Stand 02.10.2026 · gehört zu [ux-ui-plan-2026-09.html](ux-ui-plan-2026-09.html), Abschnitt 5 (Paket U1) und 4 A (Seitenliste) ·
Branch `ux-umbau` · Status: **freigegeben am 02.10.2026** (F1–F4 wie vorgeschlagen, Abschnitt 9) ·
Stand und Protokoll: [projekt-ux-umbau.md](projekt-ux-umbau.md)

## 1. Ziel

U1 baut den Rahmen, in dem alle Seiten des Portals stehen: **ein** Kopf mit der neuen
Navigation, und die **neuen Adressen** der Vorgänge. Nach U1 sieht jede Seite hinter der
Anmeldung oben anders aus (ruhigerer Kopf, „Vorgänge“ statt „Dashboard“) und hat eine neue
Adresse; der Inhalt der Seiten bleibt, wie er ist.

Grundlage sind die Entscheidungen vom 01.10.2026:

| # | Entscheidung | Folge für U1 |
|---|---|---|
| E1 | eine Interaktionsfarbe (CI-Grau), Zustände funktional | Kopf nur aus den neuen Tokens; der rote BEM-Zähler nimmt `critical` |
| E3 | obere Leiste, höchstens sechs Punkte | vorerst vier: Vorgänge · BEM · Vorlagen · Verwaltung (Start, Aufgaben, Personen gibt es noch nicht) |
| E4 | `/vorgaenge/<modul>/<uuid>`, BEM `/bem/<uuid>`, alte Adressen leiten dauerhaft weiter | Abschnitt 3.2 |
| E6 | „du“ hinter der Anmeldung | der Kopf hat keine Anrede; nichts zu tun |
| E7 | Montserrat | nichts zu tun |

## 2. Umfang

### In U1

1. **Ein Kopf für alle Seiten** (3.1): `PortalKopf` wird einmal im Layout eingebunden statt in
   29 Seiten einzeln; neue Navigation, Rollenname, Aktiv-Zustand ohne Doppelmarkierung, kein
   Emoji, Symbole aus `lucide-react`, Menüs auf Radix.
2. **Neue Adressen** (3.2): Seiten unter `/vorgaenge/…` und `/bem/…`, dauerhafte Weiterleitung
   aller alten Adressen in der Middleware, **eine** Stelle im Code, die Adressen baut.
3. **Modul-Reiter der Vorgangsliste** (3.3): werden echte Adressen (`/vorgaenge/onboarding` …)
   und rollen am Handy waagerecht – Zwischenlösung bis U3.
4. **Tests** (Abschnitt 5).

### Bewusst nicht in U1 (Abweichung vom Paket im Plan – entschieden mit F1)

| Laut Plan in U1 | Kommt mit | Grund |
|---|---|---|
| Seitenkopf-Baustein (Breadcrumb, Titel) auf allen Detail- und Verwaltungsseiten | je Modul mit dessen Paket: Vertragsende im Pilot, die übrigen mit U4, Verwaltung mit U6 | Der Seitenkopf ersetzt den Kopfbereich jeder einzelnen Seite – das IST der Umbau des Moduls. Die Leitplanke sagt: Kein Modul außer dem Pilot wird umgestellt, bevor das Personalbüro zwei Wochen mit dem Pilot gearbeitet hat. |
| Inhaltsbreite überall `6xl` | je Modul mit dessen Paket; in U1 bekommt nur der Kopf `6xl` | Heute stehen die Seiten auf vier Breiten (3 × `4xl`, 16 × `5xl`, 10 × `6xl`, 7 × `7xl`). Breiter oder schmaler ändert Raster und Tabellen jeder Seite sichtbar und muss je Seite angesehen werden. |
| Suchfeld im Kopf (Strg+K) | eigenes kleines Paket nach dem Pilot („U1b“) | Schon in U0 so vorgemerkt (F4). Die Suche hängt an den Listen-Endpunkten aller sieben Module und an der Frage, wer was finden darf; der Pilot braucht sie nicht. |

Damit bleibt U1 bei rund drei Tagen und ändert **keinen Seiteninhalt**.

### Nicht angefasst

- Keine Fachlogik, kein Prisma-Schema, keine API-Route. Die Adressen der **Schnittstellen**
  bleiben (`/api/onboarding/…`, `/api/vorgaenge/[modul]/[id]/mails` mit den englischen
  Modulnamen) – E4 betrifft nur, was im Adressfeld des Browsers steht.
- Keine Link-Seite (Fragebogen, Modalitäten, Unterlagen …) – die haben keinen Portal-Kopf.
- Die Anmeldeseite behält ihr Aussehen (U6).
- Keine Seite bekommt neuen Inhalt; die Dateien der Module bleiben an ihrem Ort (3.2,
  „Dateien bleiben liegen“).

## 3. Was gebaut wird

### 3.1 Der Kopf

**Heute** (`src/components/portal-header.tsx`, 331 Zeilen): Jede der 29 Seiten bindet den
Kopf selbst ein und reicht die Sitzung durch. „Dashboard“ ist auch dann markiert, wenn man im
BEM ist (beide Adressen beginnen mit `/dashboard`). Der Rollenname kennt nur drei Rollen –
Einrichtungsleitung und Führungskraft heißen dort „Sachbearbeiter“. BEM trägt ein
Schloss-Emoji. Das Menü ist selbst gebaut (kein Schließen mit Escape, keine Pfeiltasten).
Der Kopf trägt eine `h1` „HR-Portal“, jede Seite hat damit zwei Hauptüberschriften.

**Nachher** (`src/components/rahmen/portal-kopf.tsx`, neu; die alte Datei entfällt):

| Teil | Regel |
|---|---|
| Einbindung | einmal in `src/app/(portal)/layout.tsx`. Die Seiten binden nichts mehr ein. |
| Punkte | **Vorgänge** · **BEM** · **Vorlagen** ▾ · **Verwaltung** ▾ – Reihenfolge und Unterpunkte wie heute, nur „Dashboard“ heißt „Vorgänge“. Rollen je Punkt unverändert, mit einer Ausnahme (F3): „Formulare“ sieht die Sachbearbeitung nicht mehr – die Middleware lässt sie ohnehin nicht auf `/vorlagen`. Der Kopf zeigt nur, was die Rolle öffnen kann; ein Test hält die Tabelle gegen die Regeln der Middleware. |
| Eine Quelle | Die Punkte stehen als Tabelle in `src/lib/navigation.ts` (rein, getestet): Text, Adresse, Rollen, „aktiv bei“. Kopf, Handy-Menü und Tests lesen dieselbe Tabelle. |
| Aktiv | genau ein Punkt ist markiert (`aria-current="page"`), entschieden über den längsten passenden Adressanfang. Markierung: `action-soft` mit Text `ink` – nicht mehr die volle dunkle Fläche. |
| BEM | Schloss aus `lucide-react` statt Emoji; der Zähler „Fristen mit Handlungsbedarf“ bleibt, als Zahl mit sichtbarem Text für Screenreader. |
| Menüs | Radix Dropdown (Escape, Pfeiltasten, Fokus zurück) – dieselbe Technik wie das „…“-Menü des Seitenkopfs. |
| Rollenname | aus einer Tabelle für **alle** Rollen (`ROLLEN_NAMEN`, neben den Rollen in `permissions.ts`); eine unbekannte Rolle zeigt ihren Schlüssel, nie „Sachbearbeiter“. |
| Handy | unter 768 px ein Menüknopf (`aria-expanded`), darunter alle erreichbaren Punkte als Liste. |
| Überschrift | „HR-Portal“ ist keine `h1` mehr; die Hauptüberschrift gehört der Seite. |
| Breite | `max-w-6xl` (heute `7xl`) – die Breite, auf die alle Seiten mit ihrem Paket gehen. |
| Sprunglink | „Zum Inhalt springen“ als erster Tab-Halt (sichtbar erst bei Fokus). |
| Unverändert | CREDO-Linie unter dem Kopf, Sitzungswarnung, „Abmelden“. |

**Die Anmeldeseite zieht um – nur im Ordner, nicht in der Adresse.** `/login` liegt heute in
derselben Layout-Gruppe wie die Portal-Seiten. Bindet das Layout den Kopf ein, hinge er auch
an der Anmeldeseite; ihn dort nur „ohne Sitzung“ wegzulassen genügt nicht, weil Next.js ein
Layout beim Wechsel von `/login` zur Vorgangsliste nicht neu zeichnet – der Kopf fehlte nach
dem Anmelden bis zum Neuladen. Deshalb: `src/app/(portal)/login/` → `src/app/(anmeldung)/login/`
(eigene Gruppe ohne Kopf). Die Adresse bleibt `/login`.

Folge: Der Meldungsbereich (`ToastAnbieter`) hängt dann nicht mehr an der Anmeldeseite. Dort
wird er nicht gebraucht.

### 3.2 Neue Adressen

| Alt | Neu |
|---|---|
| `/dashboard` | `/vorgaenge` → leitet auf `/vorgaenge/onboarding` (bis es mit U3 eine Startseite gibt) |
| `/dashboard?tab=<modul>` | `/vorgaenge/<modul>` |
| `/dashboard/<uuid>` | `/vorgaenge/onboarding/<uuid>` |
| `/dashboard/offboarding/<uuid>` | `/vorgaenge/offboarding/<uuid>` |
| `/dashboard/contract-end/<uuid>` | `/vorgaenge/vertragsende/<uuid>` |
| `/dashboard/civil-service/<uuid>` | `/vorgaenge/verbeamtung/<uuid>` |
| `/dashboard/elternzeit/<uuid>` | `/vorgaenge/elternzeit/<uuid>` |
| `/dashboard/mutterschutz/<uuid>` | `/vorgaenge/mutterschutz/<uuid>` |
| `/dashboard/bem` | `/bem` |
| `/dashboard/bem/<uuid>` | `/bem/<uuid>` |
| `/dashboard/bem/statistik` | `/bem/statistik` |

Alles hinter dem Fragezeichen bleibt erhalten (`?tab=dokumente` → `?tab=dokumente`); nur
`?tab=<modul>` an der Liste wird zum Pfad. Die Modulnamen in der Adresse sind deutsch
(entschieden mit F2) – sie sind danach dauerhaft, jede spätere Umbenennung bräuchte eine weitere
Weiterleitung.

**Wo die Regeln liegen**

- `src/lib/adressen.ts` (rein, client-sicher, getestet) – die EINE Stelle, die Adressen kennt:
  - `vorgangPfad(modul, id, reiter?)`, `vorgangslistePfad(modul)`, `bemPfad(id?)` – jeder
    Verweis im Code geht hierüber. Heute stehen die Adressen an 96 Stellen als Zeichenkette.
  - `alteAdresse(pfad, suche)` → neue Adresse oder `null` – die Übersetzungstabelle oben als
    Funktion. Die Middleware ruft nur sie auf.
  - Die Modul-Schlüssel der Adresse (`onboarding`, `vertragsende` …) und ihre Zuordnung zu
    den Modul-Schlüsseln des Codes (`ONBOARDING`, `CONTRACT_END` …).
- `src/middleware.ts`:
  - Alte Adresse → **308** (dauerhaft, Methode bleibt) auf die neue, **vor** der
    Sitzungsprüfung. Ohne Datenbank, wie in E4 entschieden.
  - Die Sitzungsprüfung gilt neu für `/vorgaenge` und `/bem` – **nicht** für
    `/bem/einwilligung` (öffentliche Seite der BEM-Einwilligung, liegt schon heute unter
    `/bem`).
  - Externe BEM-Beauftragte dürfen nur `/bem…`; alles andere leitet auf `/bem`.
  - Wer keine Verwaltungsrechte hat, landet auf `/vorgaenge` statt `/dashboard`.

**Dateien bleiben liegen.** Die Ordner unter `src/app/(portal)/dashboard/` enthalten neben den
Seiten 48 Dateien der Module (Reiter, Karten, Helfer), auf die Tests und andere Seiten
zeigen. Sie jetzt zu verschieben hieße: Jede Änderung, die auf `main` an einem Modul entsteht
(Paket 4 Stufe 2, Paket 6), müsste beim Nachziehen von Hand umgelegt werden. Deshalb in U1:

- Unter `src/app/(portal)/vorgaenge/…` und `src/app/(portal)/bem/…` entstehen **dünne
  Seiten-Dateien** (je rund 10 Zeilen), die den vorhandenen Inhalt einbinden. Je Modul ein
  fester Ordner (`vorgaenge/onboarding/[id]/` …), nicht ein gemeinsamer – sonst lüde jede
  Detailseite den Code aller sechs.
- Die alten `page.tsx` unter `dashboard/` entfallen (sonst gäbe es jede Seite zweimal); ihr
  Inhalt zieht in die neue Seiten-Datei.
- Die Modul-Dateien ziehen erst mit dem Umbau ihres Moduls um (U4), wenn sie ohnehin geteilt
  werden.

**Verweise in E-Mails.** Mails, die schon verschickt sind, tragen die alte Adresse und
funktionieren über die Weiterleitung weiter. Neue Mails bekommen die neue Adresse
(Abschnitt 4, „Mail-Vorlagen“).

### 3.3 Modul-Reiter der Vorgangsliste

Die Liste (`dashboard/page.tsx`, künftig `vorgaenge/[modul]/page.tsx`) zeigt heute sechs
Reiter als Verweise auf `/dashboard?tab=…`. Sie werden Verweise auf `/vorgaenge/<modul>`,
der gewählte trägt `aria-current="page"`, und die Reihe rollt unter 640 px waagerecht statt
umzubrechen. Aussehen sonst unverändert – die Listen selbst baut U3 um. Ein unbekannter
Modulname in der Adresse zeigt die „Seite nicht gefunden“ des Portals.

## 4. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/lib/adressen.ts` | neu: Adressen bauen, alte Adressen übersetzen |
| `src/lib/navigation.ts` | neu: Punkte des Kopfs, Rollen, Aktiv-Regel |
| `src/lib/permissions.ts` | `ROLLEN_NAMEN` für alle Rollen |
| `src/components/rahmen/portal-kopf.tsx` | neu; `src/components/portal-header.tsx` entfällt |
| `src/app/(portal)/layout.tsx` | bindet den Kopf ein (Sitzung einmal lesen) |
| `src/app/(anmeldung)/login/` | Ordner zieht aus `(portal)/` um, Adresse bleibt `/login` |
| `src/app/(portal)/vorgaenge/…`, `src/app/(portal)/bem/…` | neu: 10 dünne Seiten-Dateien |
| `src/app/(portal)/dashboard/**/page.tsx` | entfallen (10 Dateien); alle übrigen Dateien dort bleiben |
| 29 Seiten unter `src/app/(portal)/` | je eine Zeile: Einbindung des Kopfs entfällt |
| `src/middleware.ts` | Weiterleitung, geschützte Adressen, Ziel-Adressen |
| 57 Dateien mit Verweisen auf `/dashboard…` | Verweis über `adressen.ts` (17 × `redirect`, 9 × `router.push`, 30 × `href`) |
| `src/lib/laeufe/bem-fristen.ts`, `dokument-ablauf.ts`, `vertragsende-erinnerungen.ts`, `src/lib/psi-fristen-mail.ts`, `src/lib/unterlagen-onboarding.ts` | `portalLink` über `adressen.ts` |
| `src/lib/events.ts` | Beispiel-Adressen der Vorschau (9 Stellen) |
| `src/__tests__/lib/ui-sperrklinke.stand.json` | Stand sinkt (zwei Inline-SVG und die Palettenklassen des alten Kopfs entfallen) |
| `scripts/ux-abnahme.js`, `scripts/ux-screenshots.js`, `scripts/handbuch-screenshots.js` | neue Adressen |
| `CLAUDE.md`, `projekt-ux-umbau.md` | Regeln und Protokoll |

**Schema-Delta:** keines.

**Mail-Vorlagen** (Texte ändern sich nicht; es ändert sich nur der Wert, den `{{portalLink}}`
bzw. die fertige Liste einsetzt – auch eine in der Datenbank gespeicherte Vorlage bekommt
die neue Adresse, niemand muss „auf Standard zurücksetzen“):

| Ereignis | Verweis heute | Verweis neu |
|---|---|---|
| `bem-frist-erinnerung` | `/dashboard/bem/<id>` | `/bem/<id>` |
| `dokument-ablauf-warnung`, `dokument-abgelaufen` | `/dashboard/<id>` | `/vorgaenge/onboarding/<id>` |
| `contract-end-eskalation` | `/dashboard/contract-end/<id>` | `/vorgaenge/vertragsende/<id>` |
| `contract-end-unbearbeitet` | `/dashboard` | `/vorgaenge/vertragsende` |
| `psi-deadline-warning` (Liste der Vorgänge) | `/dashboard/civil-service/<id>` | `/vorgaenge/verbeamtung/<id>` |
| `unterlagen-vollstaendig`, `unterlagen-frist-verstrichen` | `/dashboard/<id>?tab=dokumente` | `/vorgaenge/onboarding/<id>?tab=dokumente` |

Die genauen Ereignisnamen prüfe ich beim Bau gegen `events.ts` und trage sie ins Protokoll
ein. **Webhooks:** Wer eines dieser Ereignisse per Webhook abnimmt, bekommt im Feld
`portalLink` ab dem Deploy die neue Adresse. Die alte bleibt gültig.

**Word-Vorlagen:** keine betroffen (keine trägt eine Portal-Adresse).

**Handbuch:** Die HR-Handbücher zeigen den alten Kopf und nennen „Dashboard“. Sie werden
nicht in U1 neu bebildert, sondern mit dem jeweiligen Modul (U4) – bis dahin stimmt der
Kopf in den Bildern nicht mehr.

## 5. Tests

- **`adressen.test.ts`**: jede Zeile der Tabelle aus 3.2 als Fall, dazu: Suche bleibt
  erhalten; unbekannter Modulname; `/dashboard/<uuid>` gegen `/dashboard/offboarding`
  (ein Modulname ist keine Kennung); `/bem/einwilligung` wird nie übersetzt und nie
  geschützt; die neue Adresse wird nicht noch einmal übersetzt (keine Schleife).
- **`navigation.test.ts`**: je Rolle die sichtbaren Punkte (alle sieben Rollen); kein Punkt, den die Middleware für die Rolle umleitet (F3); genau ein
  aktiver Punkt für jede Portal-Adresse – insbesondere `/bem` markiert nur BEM;
  BEM-Beauftragte sehen nur BEM; jede Rolle hat einen Namen.
- **`portal-kopf.test.tsx`** (jsdom, axe): Menü öffnet und schließt mit der Tastatur;
  `aria-current`; Zähler mit Text; Handy-Menü; kein Emoji; keine `h1`.
- **Middleware**: Weiterleitung mit 308 vor der Sitzungsprüfung; `/vorgaenge` und `/bem`
  ohne Sitzung → Anmeldung; `/bem/einwilligung` ohne Sitzung erreichbar; BEM-Beauftragte.
- **Ein Wächter-Test**: Im Quelltext unter `src/` steht außerhalb von `adressen.ts` und der
  Tests keine Zeichenkette `"/dashboard` mehr (Schnittstellen `/api/dashboard/…` ausgenommen)
  – sonst entsteht der nächste Verweis wieder von Hand.
- **Bestehende Tests**: 23 Testdateien nennen `/dashboard`, vier ersetzen den Kopf durch eine
  Attrappe; sie werden angepasst, ihre Aussage bleibt.
- **Sperrklinke**: Stand neu schreiben (nur weniger).

## 6. Reihenfolge

| Tag | Arbeit | Ergebnis |
|---|---|---|
| 1 | `adressen.ts` mit Tests; dünne Seiten unter `/vorgaenge` und `/bem`; Middleware; alle Verweise umstellen; Wächter-Test | neue Adressen gelten, alte leiten weiter; Aussehen unverändert |
| 2 | `navigation.ts`, `PortalKopf`, Layout, Umzug der Anmeldeseite, Kopf aus 29 Seiten entfernen | neuer Kopf auf allen Seiten |
| 3 | Modul-Reiter; Mail-Verweise; Skripte; Abnahme (Bilder, Tastatur, Rollen); Dokumentation | Paket deploybar |

Je Tag ein Commit auf `ux-umbau`; `main` bleibt deploybar.

## 7. Abnahme

1. `npm run pruefen` und `npm run build` sind grün.
2. Jede alte Adresse aus 3.2 landet im Browser auf der neuen – mit und ohne Anmeldung, mit
   `?tab=…`.
3. Bildvergleich mit `scripts/ux-abnahme.js` bei 1440 px: Auf den fünf Seiten weicht **nur
   der Kopf** ab (die Zeilen unterhalb des Kopfs sind bildgleich, bis auf die Verschiebung
   durch dessen Höhe – wird gemessen und im Protokoll genannt).
4. Kopf in 1440, 1366×768 und 390 px; Bilder in `screenshots/`.
5. Je Rolle einmal angemeldet (Super-Admin, HR-Leitung, Sachbearbeitung, Einrichtungsleitung,
   Führungskraft, BEM-Beauftragte): sichtbare Punkte und Rollenname stimmen.
6. Tastaturprobe: Sprunglink, Menüs mit Pfeiltasten, Escape, Handy-Menü.
7. Nach dem Anmelden steht der Kopf sofort da (ohne Neuladen); nach dem Abmelden ist er weg.

## 8. Deploy

Kein Schema-Delta, keine neue Umgebungsvariable, keine Vorlage zurückzusetzen. U0 und U1
gehen zusammen hinaus (U0 allein ist nicht sichtbar).

**Was das Personalbüro bemerkt** – vorher ankündigen:
- Der Kopf sieht ruhiger aus; „Dashboard“ heißt „Vorgänge“.
- Die Adressen sind neu. Lesezeichen und Verweise in alten E-Mails funktionieren weiter.
- Einrichtungsleitung und Führungskräfte lesen oben rechts ihre richtige Rolle.

**Nach dem Deploy prüfen:** eine alte Adresse aus einer echten E-Mail öffnen; `/api/health`;
ein n8n-Ablauf, der `portalLink` weiterreicht (falls einer läuft).

Ein Deploy von `main` bringt unabhängig davon weiterhin die Checklisten-Änderung und Paket 3
mit (zwei neue Tabellen) – das ist getrennt zu entscheiden.

## 9. Fragen vor dem Bau – entschieden am 02.10.2026

| # | Frage | Entschieden |
|---|---|---|
| F1 | Zuschnitt: Seitenkopf auf allen Seiten, einheitliche Breite und Suche erst mit den Modul-Paketen (Abschnitt 2)? | Nur Kopf und Adressen. Seitenkopf und Breite je Modul mit dessen Paket, Suche nach dem Pilot. |
| F2 | Modulnamen in der Adresse: `onboarding`, `offboarding`, `vertragsende`, `verbeamtung`, `elternzeit`, `mutterschutz`? Sie sind danach dauerhaft. Die Anzeigenamen der Module (E11) bleiben davon unberührt offen. | Ja, genau diese sechs. |
| F3 | Der Punkt „Formulare“ steht heute auch bei der Sachbearbeitung im Menü, die Middleware leitet sie beim Klick aber zur Vorgangsliste zurück (`/vorlagen` ist nur für HR-Leitung und Super-Admin freigegeben; „Brief-Vorlagen“ ist erreichbar). Soll der Kopf (a) nur zeigen, was erreichbar ist, oder (b) die Sachbearbeitung die Formulare öffnen dürfen? | (a) Punkt ausblenden. Keine Berechtigung ändert sich. |
| F4 | Dateien der Module bleiben unter `dashboard/` liegen und ziehen erst mit U4 um (3.2)? | Ja, liegen lassen. |

## 10. Fortschritt

| Tag | Stand | Commit |
|---|---|---|
| 1 Adressen, Weiterleitung, Verweise (dazu vorgezogen: Modul-Reiter) | **erledigt 02.10.2026** | siehe Logbuch, Abschnitt 8 |
| 2 Kopf, Layout, Anmeldeseite | offen | |
| 3 Reiter, Mails, Abnahme | offen | |
