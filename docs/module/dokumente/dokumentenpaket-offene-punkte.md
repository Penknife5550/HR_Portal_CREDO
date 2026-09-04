# Dokumentenpaket-Versand — offene Punkte

> **Stand:** 04.09.2026 · Zweig `feat/dokumentenpaket-versand`, 18 Commits — **nur lokal, nicht auf `origin`, nicht nach `main` gemergt**
> **Plan:** [dokumentenpaket-versand-plan.html](dokumentenpaket-versand-plan.html) — vollständig abgearbeitet (Bausteine 1–15)
> **Nachweise:** `npx tsc --noEmit` fehlerfrei · `npm run lint` 0 Fehler · **1074 Tests in 66 Suites** grün · `npm run build` exit 0

Dieses Dokument hält fest, was **nicht** erledigt ist. Es entstand aus einem
Code-Review über den ganzen Zweig (zehn Prüfwinkel plus Nachlauf). Elf
Merge-Blocker wurden behoben (Commit `98d56df`); was hier steht, ist bewusst
liegengeblieben.

---

## 0 · Wo es weitergeht

Der Code ist fertig und geprüft, aber er liegt noch auf keinem Server und in
keinem entfernten Verzeichnis. In dieser Reihenfolge:

1. **Zweig sichern** — `git push -u origin feat/dokumentenpaket-versand`.
   Solange das nicht passiert ist, existieren die 18 Commits genau einmal, auf
   diesem Rechner.
2. **Nach `main` mergen** (oder als PR) — `main` steht auf `a4b8c60`, dem
   Stand, der am 4. September ausgerollt wurde.
3. **Deployen** nach dem Ablauf in
   [../../historie/codereview-und-vorlagen-2026-09.md](../../historie/codereview-und-vorlagen-2026-09.md).
   Neu gegenüber dem letzten Deploy: eine Tabelle (`dokumenten_versand`), zwei
   Spalten, zwei Unique-Constraints — siehe Abschnitt 4.
4. **Erst danach Abschnitt 1** (Verifikation mit echtem SMTP). Vorher hat
   niemand belegt, dass eine Mail mit Anhängen tatsächlich ankommt.

Die vier Befunde aus Abschnitt 2 blockieren keinen dieser Schritte.

---

## 1 · Zuerst: Verifikation mit echtem SMTP

**Der Versand ist nie mit einem echten Mailserver gelaufen.** Die
Entwicklungsumgebung hat weder SMTP noch Gotenberg. Geprüft sind jeder
Abbruchpfad und die gesamte Kette bis zum Mailer — der letzte Schritt, dass
eine Mail mit Anhängen tatsächlich ankommt, fehlt.

Das gehört auf den Server, **bevor** jemand das erste echte Paket verschickt:

1. Testvorgang anlegen, eigene Adresse als Empfänger eintragen
2. Standardpaket mit einem PDF **und** einer Vorlage konfigurieren
3. Versenden, Postfach prüfen: Kommen beide Anhänge an? Stimmen Dateinamen
   (`Vorlagenname_Nachname_JJJJ-MM-TT.pdf`) und die Anhangliste in der Mail?
4. Danach in der Datenbank: `DokumentenVersand` hat eine Zeile mit
   `messageId`, `betreff`, `positionen` (inkl. `generatedDocumentId`) und
   `empfaenger` — und zwar der **zugestellten** Adresse
5. Eine sensible Vorlage gegenprüfen: Ohne Häkchen muss der Server mit **409**
   abweisen

---

## 2 · Vier Befunde aus dem Review, bewusst nicht behoben

Keiner richtet beim Deploy Schaden an; alle vier brauchen eine Entscheidung
statt einer schnellen Korrektur.

### 2.1 Kein Rate-Limit auf dem Versand, Empfängeradresse völlig frei
`src/app/api/dokumentenpaket/versenden/route.ts`

Der Endpunkt hat keinen Rate-Limiter, keine Domain-Einschränkung und keinen
Abgleich gegen die im Vorgang hinterlegte Adresse — anders als vergleichbare
Exporte sensibler Daten im Projekt (vgl. `civil-service/[id]/export`, 10/min).

**Szenario:** Ein HR_SACHBEARBEITER sieht alle 16 Mandanten. Er kann über die
Vorgangs-IDs des Dashboards iterieren und je Vorgang bis zu 50 Anhänge mit
IBAN, SV-Nummer und Steuer-ID an eine eigene Freemail-Adresse schicken. Nichts
bremst, nichts alarmiert; die Tat steht danach im Protokoll, die Daten sind
draußen.

**Zu entscheiden:** Rate-Limit allein, oder zusätzlich eine Domain-Allowlist
bzw. eine Zweitfreigabe für Pakete mit sensiblen Vorlagen? Letzteres widerspricht
der Entscheidung vom 2. September („mit Bestätigung erlauben") nicht, ergänzt sie
aber um eine zweite Person.

### 2.2 Ältere Vorprüfung überschreibt die neuere
`src/components/dokumentenpaket-dialog.tsx` (Effekt um Zeile 185)

Die entprellte Vorprüfung bricht laufende Anfragen nicht ab und hat keine
Reihenfolgen-Sicherung. Es gewinnt, was zuletzt zurückkommt.

**Szenario:** Bei zehn Positionen dauert die Prüfung mehrere Sekunden. Der
Nutzer kürzt auf zwei, die schnellere Antwort kommt zuerst, die alte
überschreibt sie. Danach zeigt der Dialog fremde „Felder bleiben leer"-Hinweise
und ein veraltetes `ueberGroessenGrenze`, das den Versand-Knopf fälschlich
sperrt oder freigibt. Der Server bricht in dem Fall trotzdem korrekt ab.

**Fix:** `AbortController` plus Generationszähler; nur die Antwort der zuletzt
gestarteten Anfrage übernehmen.

### 2.3 Offener Bedingungsblock wird wörtlich versendet
`src/lib/mailer.ts` (`renderTemplate`, um Zeile 209)

`{{#name}}…{{/name}}` wird nur als vollständiges Paar ersetzt. Ein fehlendes
oder vertipptes Schluss-Tag bleibt unverändert stehen, und die
Variablen-Ersetzung trifft `{{#name}}` nicht.

**Szenario:** HR bearbeitet eine Vorlage unter Einstellungen und vertippt das
Schluss-Tag. Die Mail erreicht die beschäftigte Person mit rohem
`{{#nachricht}}`-Markup im Text. Die Vorprüfung meldet trotzdem grün, weil ihr
Muster den öffnenden Marker erkennt.

**Fix:** Nach dem Ersetzen auf verbliebene `{{#`/`{{/` prüfen und die Vorlage
als fehlerhaft melden — im Vorlagen-Editor beim Speichern, nicht erst beim
Versand.

### 2.4 Dialog zeigt eine andere Reihenfolge, als er versendet
`src/components/dokumentenpaket-dialog.tsx` (Auswahlblöcke, um Zeile 267)

Die Blöcke zeigen `verfuegbar` (PDFs alphabetisch, dann Vorlagen alphabetisch);
versendet wird `reihenfolge` nach dem konfigurierten `orderIndex`.

**Szenario:** Die Konfigurationsseite verspricht „Reihenfolge = Reihenfolge der
Anhänge" und bietet Pfeiltasten. Stellt ein Admin das Willkommensschreiben an
Position 1 und das Leitbild an Position 2, erscheint im Dialog das Leitbild
zuerst, im Postfach das Willkommensschreiben.

**Fix:** Den Standardpaket-Block in Paketreihenfolge rendern statt alphabetisch.

---

## 3 · Weitere Befunde aus dem Review (kein Merge-Blocker)

Kurz gehalten, damit sie nicht verloren gehen:

| Fund | Ort |
|---|---|
| **Zwei widersprüchliche `clientIp`**: Der Versand liest `X-Forwarded-For` von hinten (richtig), die Konfig-Route den ersten Eintrag (vom Client frei setzbar). Die IP im Konfigurations-Protokoll ist damit fälschbar. Im Projekt gibt es `getClientIp` in `src/lib/rate-limit.ts` | `organizations/[id]/starterpaket/route.ts` |
| **`sendEventEmail` statt `triggerWebhooks`** — CLAUDE.md schreibt den Dispatcher vor. Technisch nötig, weil `triggerWebhooks` keine Anhänge durchreicht; entweder dort ergänzen oder in CLAUDE.md als Ausnahme vermerken | `dokumentenpaket.ts` |
| **Resolver-N+1**: Der Vorgang wird je Vorlage neu geladen (~5 Abfragen pro Position). Eine Vorprüfung mit 3 Vorlagen + 3 PDFs ergibt ~21 Abfragen, davon 15 redundant | `dokumentenpaket.ts` |
| **Vorprüfung liest ganze PDFs nur für `.length`**, obwohl `StarterpaketDokument.fileSize` in der Datenbank steht | `dokumentenpaket.ts` (Vorprüfung) |
| **Tippen im Empfängerfeld löst eine volle Vorprüfung aus**, deren adressabhängige Felder der Dialog nie liest | `dokumentenpaket-dialog.tsx` |
| **Fehlende Datei ist nur eine Warnung**, der Versand-Knopf sperrt nicht — der Server bricht dann mit 409 ab | `dokumentenpaket-dialog.tsx` |
| **„Bereits erstellt" wird nach dem Versand nicht aktualisiert** — das Etikett „per E-Mail versendet" erscheint erst nach einem Seitenreload | `template-generation-section.tsx` |
| **Doppelungen**: `ascii`/`asciiFilename`/`slugify`/`sanitizeFilename` (5 Fassungen), `formatBytes` (8 Kopien), `sha256` (7×), `EMAIL_MUSTER`/`EMAIL_PATTERN`, `alsHtmlAbsaetze`/`escapeHtml` aus `email-layout.ts`, `deutschesDatum`/`berlinerKalendertag` aus `minijob-fristen.ts` | mehrere |
| **Server- und Client-Typen doppelt getippt** (~52 Zeilen) | `dokumentenpaket-dialog.tsx` |
| **`leseVorlagenDatei` löst keine Symlinks auf** und erlaubt den ganzen `uploads/`-Baum inklusive BEM-Anlagen — der Docstring verspricht enger, als der Code hält | `dokumentenpaket.ts` |
| **Entschlüsselte Daten liegen als DOCX/PDF im Klartext** unter `uploads/brief-vorlagen-generiert/` (12 Monate). Die Datenbank verschlüsselt die IBAN, das Dateisystem nicht. Betrifft auch den bestehenden Erzeugen-Weg | `dokumentenpaket.ts` |
| **`starterpaket-dokumente.md` beschreibt die gelöschte Route** `POST /api/onboarding/[id]/starterpaket` | `docs/module/dokumente/` |

---

## 4 · Beim Deploy beachten

- **Schema-Änderung**: `db push` legt `dokumenten_versand` und
  `beschaeftigungs_angaben`-artige Tabellen an; der Entrypoint sichert vorher
  per `pg_dump`. Voraussetzungen stehen in
  [../../historie/codereview-und-vorlagen-2026-09.md](../../historie/codereview-und-vorlagen-2026-09.md)
  — insbesondere `./backups:/backups` beim Dienst `app` **und**
  `sudo chown 1001 backups`.
- **Zwei neue Unique-Constraints** auf `starterpaket_auswahl`. Beweisbar
  erfüllbar (die alte Unique garantierte die Eindeutigkeit, `modul` kommt als
  konstanter Wert dazu, `templateId` ist überall NULL) — vor dem Deploy
  trotzdem einmal auf den echten Daten gegenprüfen.
- **Gotenberg muss laufen.** Ohne den Dienst lassen sich Vorlagen nicht
  versenden; feste PDFs gehen weiterhin.
- **Bestandsvorgänge**: Die Karte zeigt für Onboarding-Vorgänge mit altem
  `starterPacketSentAt` „Bereits versendet am … — vor Einführung des
  Nachweises". Das ist Absicht: Es wurde bewusst **kein** Nachweis
  nachträglich erfunden.

---

## 5 · Was bewusst nicht gebaut wurde

- **Kein DMS-Deckblatt mit QR-Code** an den versendeten PDFs. Die Unterlagen
  gehen an die Person, nicht in die Ablage.
- **Kein Serienbrief, keine Empfangsbestätigung, kein automatischer Versand bei
  Statuswechseln.** Der Versand bleibt eine bewusste Handlung von HR —
  Entscheidung vom Juni, im Plan bestätigt.
- **Phase 3** (Sammel-PDF, Vorschau einzelner Vorlagen, übergreifende
  Versandübersicht) steht im Plan und ist nicht beauftragt.
