# Deploy 07.09.2026 — Dokumentenpaket-Versand und Restbefunde

> **Stand nach dem Deploy:** `main` = `6124936` · Server `fes-vm-ubuntudocker`,
> `/vol/container/HR_Portal_CREDO` · Portal erreichbar, Schema angekommen
> **Vorher auf dem Server:** `a4b8c60` (Codereview-Stand vom 04.09.2026)

Dieser Deploy brachte **zwei Schema-Deltas auf einmal** auf den Server: den
Dokumentenpaket-Versand (am 04.09. nach `main` gemergt, aber nie ausgerollt) und
die Restbefunde vom 07.09. Das ist der Grund, warum hier mehr steht als sonst —
der Schritt war größer als ein gewöhnlicher Deploy.

---

## 1 · Was ausgerollt wurde

| Bereich | Inhalt |
|---|---|
| **Dokumentenpaket** | Versand befüllter Vorlagen und fester PDFs als Mailanhang, für alle vier Vorgangsmodule; Standardpaket je Mandant **und Modul**; Nachweis je Versand |
| **Empfänger-Freigabe** | Domainliste für **abweichende** Empfängeradressen; die im Vorgang hinterlegte Adresse geht immer durch |
| **Rate-Limit** | 10 Versendungen/Minute und 60/Stunde als Nachfüllrate je Benutzerkonto |
| **IP-Ermittlung** | 60 fälschbare Protokolladressen vereinheitlicht (siehe `86f632b`) |
| **Aufräumen** | Doppelungen zusammengelegt, Dateigrößen deutsch (`1,5 MB`), zwei Dateinamen-Fehler behoben |

Vollständige Liste: `git log a4b8c60..6124936`.

### Schema-Delta

- neue Tabelle `dokumenten_versand` (mit Rückverweis von `generated_documents.versandId`)
- `starterpaket_auswahl`: neue Spalten `modul` (Default `'ONBOARDING'`) und
  `templateId` (nullable, FK auf `document_templates`); `dokumentId` von
  `NOT NULL` **gelockert**; zwei neue Unique-Constraints; alter Index ersetzt
- `smtp_config`: neue Spalte `allowedRecipientDomains` (`String @default("")`)

Alles additiv oder lockernd — kein Datenverlust.

---

## 2 · Ablauf, so wie er gelaufen ist

### Vorab: die Unique-Constraints gegen die echten Daten prüfen

Der einzige Punkt, der scheitern **konnte**: `db push` legt zwei neue
Unique-Constraints an, und Duplikate hätten den Start abgebrochen.

```bash
sudo docker exec hr-portal-db psql -U hrportal -d hr_portal -c 'SELECT "organizationId", "dokumentId", COUNT(1) FROM starterpaket_auswahl GROUP BY 1,2 HAVING COUNT(1) > 1;'
```

Ergebnis: `(0 rows)` — erfüllbar.

> **Stolperstein, der Zeit gekostet hat:** Die erste Fassung dieser Abfrage
> benutzte `organization_id` und brach mit
> `column "organization_id" does not exist` ab. Das Prisma-Schema bildet mit
> `@@map` nur **Tabellen**namen ab; **Spalten** behalten camelCase und müssen in
> PostgreSQL in doppelte Anführungszeichen. Merksatz für alle künftigen
> psql-Abfragen an dieser Datenbank: Tabellen `snake_case`, Spalten `"camelCase"`.
> Zweitens hatte die Shell das `*` in `COUNT(*)` verschluckt — `COUNT(1)` ist
> hier robuster.

Warum die Constraints halten mussten, war vorher begründbar: `modul` bekommt für
alle Bestandszeilen denselben Wert, die neue Bedingung ist also genauso streng
wie die alte zweispaltige, die bereits hielt. Und `templateId` ist überall NULL
— PostgreSQL behandelt NULLs in Unique-Indizes als verschieden.

### Vorbedingungen (beide Startabbrüche verhindern)

```bash
grep -c "backups:/backups" docker-compose.yml   # erwartet: 2 (app UND db)
stat -c '%u %U %n' backups                      # erwartet: uid 1001
```

Zur uid-Anzeige: Auf diesem Server löst der Host 1001 als `n8n` auf, weil dort
zufällig ein gleichnamiger Benutzer diese Kennung trägt. Im Container gehört sie
`nextjs` — **die Zahl zählt, nicht der Name.**

### Deploy

```bash
cd /vol/container/HR_Portal_CREDO && git fetch origin && git checkout main && git pull
sudo docker compose up -d --build
sudo docker compose logs -f app
```

Log, wie es kam:

```
Umgebungsvariablen geprueft: OK
Schema-Unterschied erkannt — Sicherung wird angelegt...
Sicherung abgelegt: /backups/vor-schema-abgleich-20260907-134416.sql (1389174 Bytes)
Datenbank-Schema wird synchronisiert...
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering the columns [organizationId,modul,dokumentId] ... will be added.
  • A unique constraint covering the columns [organizationId,modul,templateId] ... will be added.
🚀  Your database is now in sync with your Prisma schema. Done in 484ms
Datenbank-Schema synchronisiert.
System-Vorlage (Fuehrungszeugnis) ist aktuell.
Datenbank bereits geseeded (7 User vorhanden). Seed uebersprungen.
Next.js Server startet auf Port 3000...
✓ Ready in 159ms
```

**Zur Warnung `There might be data loss`:** Das ist kein Befund, sondern der
angekündigte Text von `db push --accept-data-loss`. Er sagt: „Falls Duplikate
existieren, wird das fehlschlagen." Es ist nicht fehlgeschlagen — die
Vorabprüfung hatte recht. Wer diesen Text im Log sieht, muss also nicht
erschrecken, sollte aber die **Zeile darunter** lesen.

Die Sicherung mit 1,39 MB liegt auf dem Host unter `./backups/`.

---

## 3 · Verifikation nach dem Deploy

### Schema (belegt)

`\d starterpaket_auswahl`, `\d dokumenten_versand` und `\d smtp_config` zeigten
jede erwartete Änderung: `modul` mit Default, `templateId` nullable mit FK,
`dokumentId` gelockert, beide neuen Unique-Indizes, die neue Tabelle samt
Rückverweis, `allowedRecipientDomains` mit Vorgabe `''`.

### Versand mit echtem Mailserver (belegt)

**Das war der Punkt, den bis dahin niemand belegt hatte.** Die
Entwicklungsumgebung hat weder SMTP noch Gotenberg; geprüft waren bis dahin nur
alle Abbruchpfade und die Kette bis zum Mailer.

Testversand mit einem festen PDF **und** einer zur Laufzeit befüllten Vorlage:
**Die Mail kam an, beide Anhänge waren dabei.** Damit ist die gesamte Kette
einmal durchlaufen — Resolver, Gotenberg, Anhangbau, SMTP.

### Noch nicht gegengeprüft

- der Nachweis in `dokumenten_versand` (eine Zeile mit `messageId`, `anzahl`,
  `positionen`) — die Abfrage steht in den offenen Punkten, Abschnitt 1
- Dateiname der befüllten Vorlage (`Vorlagenname_Nachname_JJJJ-MM-TT.pdf`)
- die beiden Gegenproben im Dialog: sensible Vorlage ohne Häkchen → Knopf
  gesperrt; nicht freigegebene Fremddomain → Sperrmeldung

---

## 4 · Was nach dem Deploy noch eingerichtet werden muss

**Die Freigabeliste ist leer und damit wirkungslos.** Das ist Absicht — eine
ungepflegte Liste darf den Versand nicht lahmlegen —, heißt aber: Der Schutz
gegen abweichende Empfängeradressen entsteht **erst mit der Pflege**.

Einstellungen → SMTP → Freigabeliste: dort die **dienstlichen** Domains
eintragen (`fes-minden.de`, `credo-gruppe.de`, …). **Nicht** die
Freemail-Domains: Die im Vorgang hinterlegte Adresse geht ohnehin immer durch,
auch an `web.de` oder `gmail.com` — beim Onboarding ist die private Adresse der
Regelfall. Die Liste greift ausschließlich, wenn jemand im Dialog eine **davon
abweichende** Adresse eintippt.

Gotenberg lief zum Deploy-Zeitpunkt seit sechs Wochen (`healthy`). Ohne den
Dienst gehen feste PDFs weiterhin, befüllte Vorlagen nicht.

---

## 5 · Für den nächsten Deploy mitnehmen

1. **Spaltennamen sind camelCase.** Jede psql-Abfrage an diese Datenbank braucht
   doppelte Anführungszeichen um Spalten. Tabellen dagegen sind `snake_case`.
2. **`COUNT(1)` statt `COUNT(*)`** in Befehlen, die durch eine Shell laufen.
3. **Die Byte-Zahl der Sicherung prüfen**, bevor man weitermacht — sie ist bei
   `--accept-data-loss` das einzige Netz.
4. **Zwei Deltas auf einmal sind vermeidbar.** Dass das Dokumentenpaket drei
   Tage unausgerollt auf `main` lag, hat diesen Deploy größer gemacht als nötig.
   Kleinere Schritte sind leichter zurückzunehmen.
