# Gesamtdurchsicht und Vorlagen-Anbindung — September 2026

> **Stand:** 02.09.2026 · alles auf `main` (Merge-Commit `22ff22e`, PR #1, 44 Commits)
> **Noch nicht geschehen:** der Deploy auf `fes-vm-ubuntudocker`.

Zwei Arbeitspakete in einem Zug: die Befunde einer vollständigen Codedurchsicht und
die Anbindung der Brief-Vorlagen an Offboarding und Verbeamtung. Dieses Dokument sagt,
was sich geändert hat, was beim Deploy zu beachten ist und was offen bleibt.

---

## ⚠️ Vor dem nächsten Deploy

Der Dienst **`app`** in `docker-compose.yml` braucht die Einhängung
**`./backups:/backups`**. Ohne sie **startet der Container nicht mehr**, sobald sich das
Schema geändert hat — und bei diesem Deploy ändert es sich.

Grund: Der Entrypoint legt vor `prisma db push --accept-data-loss` einen `pg_dump` an
und bricht ab, wenn das misslingt. Bei deckungsgleichem Schema
(`prisma migrate diff --exit-code` = 0) entfallen Dump und Push ganz. Stellschrauben:
`DB_BACKUP_DIR` (Standard `/backups`), `DB_BACKUP_KEEP` (Standard 10).

Die Zeile steht in der gemergten Compose-Datei. Wird auf dem Server eine eigene Fassung
gepflegt, muss sie dort nachgetragen werden. Die Fehlermeldung beim Start nennt sie
wörtlich.

Ebenfalls neu in der Pflichttabelle: **`BEM_ENCRYPTION_KEY`**. Der Entrypoint bricht
ohne den Wert ab; in `CLAUDE.md` fehlte er bisher.

**Was beim ersten Start automatisch passiert:** Sicherung → Schema-Abgleich → vier
einmalige Migrationen (BA-Betriebsnummern, Schritt-6-Felder der Minijob-Vorlage, plus
die zwei bestehenden). Alle idempotent, alle gegen eine leere Testdatenbank
durchgespielt.

**Danach kurz prüfen:** ob die BA-Betriebsnummern bei allen 16 Mandanten stehen
(Mandanten-Übersicht) und ob in der Verbeamtungs-Detailseite der Einrichtungsname in
der Kopfzeile erscheint.

---

## Was sich geändert hat

### Sicherheit

| Was | Warum es zählte |
|---|---|
| **Next.js 15.5.12 → 15.5.25** | Schließt 24 Advisories, darunter drei Middleware-Bypässe. `src/middleware.ts` ist die einzige Schranke für externe BEM-Beauftragte — und Grundlage des neuen Mandanten-Gates. |
| **Sitzungsverlängerung repariert** | `verifySessionToken` gab das rohe JWT-Payload samt `iat`/`exp` zurück; `GET /api/auth` warf deshalb *immer*. Nutzer flogen unangekündigt raus und verloren offene Formulareingaben. |
| **Mandanten-Gate** (`src/lib/mandanten-gate.ts`) | Von 193 Routen prüfen nur ~50 den Mandanten. Die Middleware sperrt mandantenbeschränkte Rollen jetzt per **Allowlist** — Unbekanntes bekommt 403. |
| **Rate-Limits greifen wieder** | `X-Forwarded-For` wurde von vorn gelesen; ein Header pro Versuch reichte für einen frischen Zähler. Betraf auch die Protokoll-IP der Wahrheitsversicherung. |
| **CSV-Formel-Injection** geschlossen | In beiden Exporten. Eingabe aus dem öffentlichen Fragebogen konnte auf dem HR-Arbeitsplatz als Excel-Formel laufen. |
| **`decrypt()` scheitert laut** | Gab bei falschem Schlüssel still das Chiffrat als Klartext zurück — das landete in PDF, E-Mail und Akte, und ein Speichern danach verschlüsselte den Buchstabensalat erneut. |

### Betrieb

- **Node 20 (EOL) → Node 22** in allen Stages.
- **Prisma-CLI** wird beim Build aus `package-lock.json` abgeleitet statt geraten
  (stand auf 6.19.2 gegen Client 6.9.0).
- **`pg_dump`-Gate** vor dem Schema-Abgleich (siehe oben).

### Minijob-Branch

Vier Merge-Blocker behoben: Schritt 6 zwang seine Fragen allen Fragebogentypen auf
(Regression gegenüber `main`); der Löschen-Knopf im Dokumenten-Upload löste das
verbindliche Absenden aus; das Absenden war weder atomar noch transaktional; die neue
RV-Fristen-Route prüfte den Mandanten nicht.

### Anzeige und Geschwindigkeit

- **Blättern funktionierte nie**, solange „Archiv anzeigen" aus war: Die Gesamtzahl kam
  aus der gefilterten *aktuellen Seite*, `totalPages` war immer 1. Ab dem 26. offenen
  Vorgang war jeder weitere unerreichbar — in Onboarding, Offboarding, Vertragsende,
  Verbeamtung, Mutterschutz und Elternzeit.
- **`/dashboard`: 261 kB → 139 kB** First-Load-JS (recharts wird nachgeladen).

### Vorlagen für Offboarding und Verbeamtung

Vorlagen, die in der Vorlagenverwaltung diesen Modulen zugeordnet waren, tauchten im
Vorgang **nirgends** auf. Kein Filterfehler — die auslesende Oberfläche fehlte, und es
gab keinen Modul-Resolver.

Jetzt: **47 Platzhalter** für Offboarding, **44** für die Verbeamtung, je ein Resolver,
und die Sektion „Dokumente erstellen" in beiden Dokumente-Tabs.

> **Für künftige Module:** Ein neues Modul braucht **vier** Stellen, sonst wirkt es halb
> fertig — den Platzhalter-Block in `placeholder-catalog.ts` (samt Umstellung von
> `ALLGEMEIN_PLACEHOLDERS` auf `[...ALLGEMEIN, ...MODUL]` und Re-Export in
> `doc-template-resolvers.ts`), einen Resolver in der `resolvers`-Registry, Einträge in
> `UNTERSTUETZTE_MODULE` **und** `VORGANG_MANDANT` (`erzeugte-dokumente*.ts`), sowie die
> Einbindung der Komponente mit `organizationId` und `canEdit`.

**Bewusst nicht im Katalog:** Antworten aus dem Exit-Interview und die Freitexte der
Zeugnis-Bewertung (Vertrauensbefragung), sowie der Gesamtschnitt der
PSI-Beurteilungen — der Schema-Kommentar sagt dazu wörtlich „KEIN Gesamturteil".

**Festlegungen:** Geldbeträge mit zwei Nachkommastellen; die **Abfindung ist Freitext**
und läuft bewusst nicht durch die Zahlformatierung (`parseFloat("15.000,00")` = 15).
Die Zeugnisnote wird nur gesetzt, wenn die Bewertung abgeschlossen ist — vorher ist es
die vorläufige Einschätzung ohne HR-Korrektur.

### Zwei Fehler nebenbei

- **Jedes Dokument im Verbeamtungs-Modul war unsichtbar.** Die Oberfläche schickte den
  Typ als `type`, die Route las `documentType` → alles landete als `SONSTIGES`, und das
  Typ-Raster kennt `SONSTIGES` nicht. Die Dateien waren gespeichert, aber nirgends
  anzeigbar. Ein Block „Weitere Dokumente" holt die Altbestände zurück.
- **Drei Felder der Verbeamtungs-Detailseite blieben leer**, weil der TypeScript-Typ
  Felder beschrieb, die die Schnittstelle nie geliefert hat (`organizationName`,
  `startDate`, `lifetimeDate` — letzteres gibt es im Datenmodell gar nicht).

---

## Offene Punkte

| Punkt | Anmerkung |
|---|---|
| **Deploy auf den Server** | Siehe Warnung oben. |
| **Weg C: Mandanten-Allowlist füllen** | `MANDANTEN_API_ALLOWLIST` enthält heute nur `/api/auth`. Wer `canAccessProcess` in einer Route nachzieht, trägt sie dort ein. Nötig, bevor die ersten Einrichtungsleitungen Zugänge bekommen. |
| **Termine der Entgeltabrechnung** | Fehlen für alle 16 Mandanten. Ohne sie überwacht das Portal nur die äußere Sechs-Wochen-Grenze. |
| **BR-/GF-Stammdaten** | Bei **keinem** der 16 Mandanten gepflegt; liegen in der Oberfläche unter *Elternzeit-Konfiguration*, obwohl das Datenmodell sie für die Verbeamtung vorsieht. Alle `br_*`- und `gf_*`-Platzhalter bleiben bis dahin leer. |
| **Archiv-Filter serverseitig** | Für die fünf Endpunkte hinter `process-dashboard.tsx` ist bisher nur die Erreichbarkeit repariert; eine Seite kann dort weniger als 25 Zeilen zeigen. |
| **nodemailer 9.x** | Die verbliebene Lücke braucht die Message-Option `raw`, die der Code nie setzt. Major-Sprung am primären Versandkanal — nur mit Test gegen den echten SMTP-Server. |
| **postcss 8.4.31** | Nur verschachtelt unter `next` (Build-Zeit, CSS aus dem Repo). Einziger Fix wäre next 16. |
| **Drei niedrige Befunde** | `{wettbewerbsverbot}` setzt ohne `exitData` „Nein"; `{stellenumfang_prozent}` nutzt Punkt statt Komma; ein abgelehnter Mandantenzugriff liefert ein leeres Dokument statt 403. |
| **32 fachliche Minijob-Punkte** | Unverändert in [`module/minijob/minijob-offene-punkte.md`](../module/minijob/minijob-offene-punkte.md), elf davon vor dem Rollout. |

---

## Der Befund, der alles andere einordnet

**Die Mandantentrennung existiert im Code, aber nicht im Betrieb.** `GLOBAL_ROLES`
enthält alle drei vergebbaren HR-Rollen; `assignableRoles()` lässt
`EINRICHTUNGSLEITUNG` und `VORGESETZTER` bewusst weg, und `UserOrgAssignment` wird im
gesamten Repository **nirgends geschrieben**. Jedes anlegbare Konto sieht also alle 16
Mandanten, und `canAccessProcess`/`orgFilter` entscheiden nie etwas.

Deshalb wurden rund ein Dutzend IDOR-Befunde in der Durchsicht heruntergestuft: ~90 der
193 Routen prüfen den Mandanten nicht, was heute folgenlos bleibt. **Sobald die erste
Einrichtungsleitung angelegt wird, werden daraus echte Lecks.** Das Mandanten-Gate ist
die Brücke; Weg C schließt die Lücke Route für Route.

---

## Nachweise

Alle Zahlen am Stand `22ff22e` gemessen, nicht geschätzt:

- `npx tsc --noEmit` fehlerfrei
- `npm run lint` 0 Fehler, 7 `exhaustive-deps`-Warnungen (unverändert zum Ausgangsstand)
- `npm run test` **927 Tests in 63 Suites** grün (Start des Vorhabens: 790 in 54)
- `npm run build` exit 0
- `npm audit --omit=dev` 3 verbleibend, beide oben begründet

Zusätzlich am laufenden System geprüft: das Docker-Image gegen eine leere
Testdatenbank (Sicherung → Push → Seed; zweiter Start meldet „bereits deckungsgleich"),
das Mandanten-Gate mit signierten Test-Sitzungen, die Paginierung mit 52 Testdatensätzen,
und beide Vorlagen-Sektionen in der echten Oberfläche.
