# Dokumentenpaket-Versand — offene Punkte

> **Stand:** 07.09.2026 · **auf `main` gemergt** (`74f0975`) und gepusht; noch nicht deployt
> **Plan:** [dokumentenpaket-versand-plan.html](dokumentenpaket-versand-plan.html) — vollständig abgearbeitet (Bausteine 1–15)
> **Nachweise:** `npx tsc --noEmit` fehlerfrei · `npm run lint` 0 Fehler · **1244 Tests in 73 Suites** grün (auch nach `jest --clearCache`) · `npm run build` exit 0

Dieses Dokument hält fest, was **nicht** erledigt ist.

Es entstand am 4. September aus einem Code-Review über den ganzen Zweig. Am
7. September wurde nachgearbeitet: die vier Befunde aus Abschnitt 2 und die
Liste aus Abschnitt 3 sind abgearbeitet, dabei fielen weitere Befunde an. Was
jetzt hier steht, ist der Rest — und der ist kleiner, aber nicht leer.

---

## 0 · Wo es weitergeht

Der Code liegt vollstaendig auf `main` (Merge-Commits `53c484b` und `74f0975`,
beide gepusht) — aber **auf keinem Server**. Was aussteht:

1. ~~Nach `main` mergen~~ — erledigt am 7. September, ohne PR, mit Merge-Commit
   (`74f0975`). Gate davor UND danach auf `main` selbst gefahren: tsc sauber,
   Lint ohne Fehler, 1244 Tests in 73 Suites grün, Build exit 0.
2. **Deployen** nach dem Ablauf in
   [../../historie/codereview-und-vorlagen-2026-09.md](../../historie/codereview-und-vorlagen-2026-09.md).
   Schema-Delta gegenüber dem letzten Deploy siehe Abschnitt 4 — es ist um eine
   Spalte gewachsen.
3. **Erst danach Abschnitt 1** (Verifikation mit echtem SMTP). Vorher hat
   niemand belegt, dass eine Mail mit Anhängen tatsächlich ankommt.
4. **Freigabeliste pflegen** (neu, siehe Abschnitt 2.1): Ohne gepflegte Domains
   ist die Schranke gegen abweichende Empfängeradressen wirkungslos. Das ist
   Absicht — eine ungepflegte Liste darf den Versand nicht lahmlegen —, aber es
   heißt, dass der Schutz erst mit der Pflege entsteht.

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
6. **Neu:** Eine Domain in die Freigabeliste eintragen (Einstellungen → SMTP),
   dann eine Adresse einer **anderen** Domain eingeben, die nicht die des
   Vorgangs ist — der Server muss mit **409** abweisen, und der Dialog muss es
   schon vor dem Klick sagen

---

## 2 · Am 7. September abgearbeitet

Alle vier Befunde aus dem Review vom 4. September sind behoben, ebenso die
Liste aus dem damaligen Abschnitt 3. Kurz, was daraus wurde:

### 2.1 Rate-Limit und Empfängeradresse
Der Versand hat jetzt eine Bremse (10/Minute und 60/Stunde als **Nachfüllrate**
je Benutzerkonto — der Kopfkommentar der Route sagt ausdrücklich, dass ein
Token-Eimer nach Ruhe zusätzlich einen vollen Schub gewährt) und eine
Freigabeliste für Empfängerdomains (`SmtpConfig.allowedRecipientDomains`).

**Die Ausformung ist wichtiger als die Zahl:** Eine Allowlist über *alle*
Adressen hätte den Normalfall blockiert — beim Onboarding geht das Paket an die
private Adresse der neuen Person, die noch kein dienstliches Postfach hat.
Deshalb gilt die Liste nur für **abweichende** Adressen; die im Vorgang
hinterlegte geht immer durch. Leere Liste = keine Einschränkung.

Dazu gehört zwingend, dass die **Änderung der Vorgangsadresse protokolliert
wird** — sonst ist die Schranke mit zwei Aufrufen umgangen (Adresse umbiegen,
versenden, zurücksetzen). Das war bis zum 7. September *nicht* der Fall und ist
jetzt in allen vier Modulen nachgerüstet, mit Vorher/Nachher im AuditLog.

### 2.2 bis 2.4
Rennen in der Vorprüfung (AbortController plus Laufzähler), Prüfung auf
verwaiste `{{#…}}`-Blöcke im Vorlagen-Editor, Reihenfolge im Dialog — alle drei
behoben und mit Tests belegt, die nachweislich fallen, wenn man den Fix
zurücknimmt.

### 2.5 Was beim Nacharbeiten zusätzlich gefunden wurde
Eine adversariale Durchsicht mit acht Prüfwinkeln fand danach noch:

- **Die Stundenbremse war praktisch wirkungslos.** Der Aufräum-Timer verwarf
  Einträge nach 10 Minuten Ruhe, und der nächste Aufruf legte einen *vollen*
  Eimer an — bei einem Stundenfenster. Im Takt „7 Minuten senden, 14 Minuten
  Pause“ waren ~198 Versendungen pro Stunde möglich statt 60. Die Schwelle
  hängt jetzt am Fenster des jeweiligen Speichers.
- **Die 413-Grenze wurde zu früh durchgewunken.** Die Vorprüfung maß Rohbytes,
  der Versand die base64-Größe (4/3 davon) — Pakete zwischen ~11,25 und 15 MB
  liefen in genau den 409, den die neue Knopfsperre verhindern soll.
- **Eine Freigabeliste aus lauter Trennzeichen** wurde klaglos als leere Liste
  gespeichert und schaltete die Schranke damit still ab. Die Route lehnt das
  jetzt ab; ein bewusst geleertes Feld bleibt erlaubt.
- **Zwei Test-Attrappen.** Ein Test prüfte nach `unmount()` gegen einen leeren
  String (immer wahr), und kein Test deckte, dass der Dialog `onVersendet()`
  überhaupt ruft.
- **Die Komponententest-Suite lief gar nicht.** `preset: "ts-jest"` bringt ein
  eigenes Transform für `.tsx` mit, das Jest vor die eigenen Einträge legt.
  Danach fiel bei *kaltem* Cache reproduzierbar eine `.tsx`-Suite um, solange
  zwei Transform-Einträge nebeneinander standen — auf dem Entwicklerrechner
  (warmer Cache) unsichtbar, in CI jedes Mal. Details stehen als Kommentar in
  `jest.config.ts`; wer dort wieder aufteilt, holt sich den Fehler zurück.

Nebenbei fielen zwei Befunde außerhalb des Dokumentenpakets an, die mit
behoben wurden: zwei Download-Routen setzten `Content-Disposition` mit
Nicht-ASCII, und drei Upload-Routen bildeten ihren Speichernamen ohne den
Zeitstempel-/UUID-Schutz von `sanitizeFilename` — zwei gleichnamige Uploads
überschrieben sich.

---

## 3 · Was weiterhin offen ist

### 3.1 Entschlüsselte Daten liegen als Datei im Klartext
`uploads/brief-vorlagen-generiert/` · **Entscheidung vertagt (07.09.2026)**

Sobald ein Schreiben erzeugt ist, stehen IBAN, SV-Nummer und Steuer-ID
unverschlüsselt in einer Datei im Volume `uploads_data` — 12 Monate lang
(`AUFBEWAHRUNG_MONATE` in `src/lib/erzeugte-dokumente.ts`). Die Datenbank
verschlüsselt diese Felder spaltenweise mit AES-256-GCM; wer das Volume lesen
kann (Host-root, ein Backup, ein Image-Snapshot), liest sie ohne Schlüssel.

**Das ist kein neuer Fehler des Dokumentenpakets** — der Erzeugen-Weg macht es
seit jeher so. Es ist eine Grundsatzentscheidung, keine Codezeile. Vier Wege
stehen offen:

| Weg | Kosten | Was bricht |
|---|---|---|
| **Verschlüsselung at rest** (AES-256-GCM je Datei) | Buffer-Paar in `encryption.ts` (heute nur Zeichenketten), zwei Schreib-, eine Lesestelle, ein Marker für Bestandsdateien, einmalige Datenmigration | Nichts — wenn der Hash im Nachweis weiter über den **Klartext** gebildet wird. Braucht eine Entscheidung: `ENCRYPTION_KEY` mitbenutzen oder ein dritter Schlüssel wie `BEM_ENCRYPTION_KEY`? Ein eigener Schlüssel ist sauberer, kostet aber eine weitere Pflicht-Variable, ohne die der Container nicht startet |
| **Kürzere Aufbewahrung** | eine Konstante | Der Cron begründet die 12 Monate ausdrücklich mit dem Vorlauf der Vertragsende-Fristenampel (7–12 Monate). Kürzer heißt: Dokumente laufender Vorgänge verschwinden |
| **Gar nicht speichern** | Ablage-Teil der Transaktion entfällt | Der Download-Endpunkt hätte nichts mehr zu liefern. Neu-Erzeugen bei jedem Download bräuchte Resolver und Gotenberg zur Downloadzeit, entschlüsselte jedes Mal neu und lieferte womöglich ein *anderes* Dokument als das versendete — der Hash im Nachweis passte dann nicht mehr |
| **Nur die heiklen sondern** | mittel | Zwei Aufbewahrungsregeln nebeneinander. „Harmlos“ heißt hier nur „ohne IBAN/SV-Nr/Steuer-ID“, nicht „ohne Personenbezug“ — Name, Adresse und Vertragsdaten stehen weiter im Klartext |

Vor der Entscheidung ist eine Zahl hilfreich:
`SELECT count(*) FROM generated_documents WHERE pfad_pdf IS NOT NULL;`

### 3.2 Content-Disposition ohne `filename*`
`onboarding/[id]/documents/[docId]`, `offboarding/[id]/documents/[docId]` u. a.

Der Nicht-ASCII-Fehler ist behoben, aber der Weg dahin kostet den lesbaren
deutschen Namen: Aus „Kündigung.pdf“ wird „Kuendigung.pdf“. Sauber wäre
`filename="…"` **plus** `filename*=UTF-8''…`. Das gehört an *alle* Stellen
zugleich, sonst zeigt dieselbe Anwendung je nach Route andere Namen — und
`encodeURIComponent` genügt nicht, weil `'`, `(`, `)` und `*` nach RFC 5987
keine `attr-char` sind. Also eine eigene, begründete Runde.

Im selben Zug: `civil-service/[id]/documents/[docId]` bildet den Namen mit
`encodeURIComponent` und ist damit eine dritte Fassung, die noch steht.

### 3.3 Die Vorprüfung prüft bei Pool-PDFs nur den Pfad, nicht die Lesbarkeit
`dokumentenpaket.ts` · **bewusst so**

`pfadInWurzeln` löst den Pfad auf, liest aber kein Byte — sonst liefe bei jeder
Auswahländerung ein voller Dateizugriff. Ein `EACCES` nach falschen Rechten im
uploads-Volume fällt deshalb erst beim Versand auf (409). Der häufige Fall —
Datei gelöscht oder Pfad außerhalb — wird erfasst und sperrt den Knopf.

### 3.4 Doppelversand-Sperre ist prozesslokal
`laufendeVersendungen` trägt nur, solange das Portal als **ein** Container
läuft. Beim waagerechten Skalieren durch eine Datenbanksperre ersetzen. Dasselbe
gilt für das neue Rate-Limit: Der Zähler lebt in einer Map im Prozess und ist
nach einem Neustart weg.

### 3.5 `canAccessProcess` fehlt in mehreren PATCH-Routen
Heute folgenlos, deshalb nur vermerkt: `HR_EDIT_ROLES` und `GLOBAL_ROLES` sind
dieselben drei Rollen, `canAccessProcess` liefert für sie ohnehin immer `true`.
Die Prüfung fehlt trotzdem — sie würde erst beißen, wenn `HR_EDIT_ROLES` je eine
nicht-globale Rolle bekommt. Verteidigung in der Tiefe, kein akutes Loch.

---

## 4 · Beim Deploy beachten

- **Schema-Änderung**: `db push` legt `dokumenten_versand` an, dazu zwei Spalten
  und zwei Unique-Constraints auf `starterpaket_auswahl` — **und neu seit dem
  7. September** die Spalte `smtp_config.allowed_recipient_domains`
  (`String @default("")`, rein additiv). Der Entrypoint sichert vorher per
  `pg_dump`. Voraussetzungen stehen in
  [../../historie/codereview-und-vorlagen-2026-09.md](../../historie/codereview-und-vorlagen-2026-09.md)
  — insbesondere `./backups:/backups` beim Dienst `app` **und**
  `sudo chown 1001 backups`.
- **Zwei Unique-Constraints** auf `starterpaket_auswahl`: Beweisbar erfüllbar
  (die alte Unique garantierte die Eindeutigkeit, `modul` kommt als konstanter
  Wert dazu, `templateId` ist überall NULL) — vor dem Deploy trotzdem einmal
  auf den echten Daten gegenprüfen.
- **Gotenberg muss laufen.** Ohne den Dienst lassen sich Vorlagen nicht
  versenden; feste PDFs gehen weiterhin.
- **Bestandsvorgänge**: Die Karte zeigt für Onboarding-Vorgänge mit altem
  `starterPacketSentAt` „Bereits versendet am … — vor Einführung des
  Nachweises". Das ist Absicht: Es wurde bewusst **kein** Nachweis nachträglich
  erfunden.
- **Sichtbare Änderung ohne Datenbezug**: Dateigrößen erscheinen jetzt überall
  deutsch (`1,5 MB` statt `1.5 MB`, ganze KB darunter) — acht Stellen in der
  Oberfläche, eine gemeinsame Funktion in `src/lib/format.ts`.

---

## 5 · Was bewusst nicht gebaut wurde

- **Kein DMS-Deckblatt mit QR-Code** an den versendeten PDFs. Die Unterlagen
  gehen an die Person, nicht in die Ablage.
- **Kein Serienbrief, keine Empfangsbestätigung, kein automatischer Versand bei
  Statuswechseln.** Der Versand bleibt eine bewusste Handlung von HR —
  Entscheidung vom Juni, im Plan bestätigt.
- **Keine Zweitfreigabe** für Pakete mit sensiblen Vorlagen. Am 7. September
  gegen Rate-Limit und Freigabeliste abgewogen und verworfen: spürbar mehr
  Aufwand im Alltag für einen Fall, den die Protokollierung sichtbar macht.
- **Phase 3** (Sammel-PDF, Vorschau einzelner Vorlagen, übergreifende
  Versandübersicht) steht im Plan und ist nicht beauftragt.
