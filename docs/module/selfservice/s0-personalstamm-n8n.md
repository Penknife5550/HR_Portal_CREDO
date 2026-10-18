# Personalstamm aus DokuBit — n8n-Stammablauf (Self-Service S0)

**Stand:** 17.10.2026 · **Zweig:** `feat/selfservice-s0-personalstamm`
**Plan:** [`selfservice-portal-plan.html`](./selfservice-portal-plan.html), Abschnitt 5.1
**Vorlage zum Import:** [`s0-personalstamm-n8n.json`](./s0-personalstamm-n8n.json) (n8n 2.x, ohne Credentials)

Im Portal: Webhook `src/app/api/webhooks/personalstamm/route.ts`, Abgleich
`src/lib/personalstamm/abgleich.ts`, Ansicht „Personen“ (`/personen`).

---

## 1. Worum es geht

- n8n liest jede Nacht um 02:30 die Verträge aus DokuBit (MS SQL) und schickt sie an das Portal.
- Das Portal greift nie selbst auf DokuBit zu. Die Zugangsdaten der DokuBit-Datenbank liegen nur in n8n.
- **Eine Zeile ist ein Vertrag.** Der Schlüssel ist `MANDANTENNUMMER` + `ABRECHNUNGSKREIS` + `MANR`.
  Die MANR allein ist kein Personenschlüssel.
- **Die Person wird über die dienstliche Adresse erkannt** (`MAEMAIL`, Microsoft-365-Konto).
  Wer mehrere Verträge hat, ist eine Person mit mehreren Anstellungen.
- **Die Adresse ist die Person** (Entscheidung vom 17.10.2026, Begründung im Plan, E-S10). Das
  Portal schreibt die Adresse einer Person nie um und einen Datensatz nie auf einen anderen
  Menschen. Nennt ein laufender Vertrag eine andere Adresse, wechselt er zu der Person mit dieser
  Adresse; gibt es sie nicht, wird sie angelegt. Nach einer Heirat mit neuer Adresse gibt es
  deshalb zwei Datensätze: den neuen und den alten, der inaktiv wird.
- **Den Namen ändert das Portal nur bei gleicher Adresse,** nur, wenn alle laufenden Verträge
  der Person ihn im selben Stapel nennen, jeder mit seinem gespeicherten Vertragsbeginn (sonst
  gilt der Schlüssel als neu vergeben), und nur, wenn Vor- oder Nachname bleibt (Heirat). Ein
  ganz anderer Name ist ein anderer Mensch. Sonst meldet es `EMAIL_ANDERER_NAME` und lässt den
  Namen, wie er ist. Zieht im selben Lauf ein Vertrag der Person zu einer neuen Adresse um, folgt
  der Name am alten Datensatz erst im nächsten Lauf; bis dahin steht die Meldung in „Zu prüfen“.
  Ausnahme ist der Anschlussvertrag nach dem Ende des alten, und nur mit Nachweis: Auch die Zeile
  des alten Vertrags muss unter derselben Adresse den neuen Namen tragen (Entscheidungen vom
  17.10.2026, Abschnitt 4).
- **Ein Zweifel verschafft nie Zugang** (Entscheidung vom 17.10.2026). Endet die Zeile eines
  bekannten Vertrags als Zweifelsfall oder Fehler, bleibt der Vertrag bei seiner Person. Ein
  Vertragsende kommt immer an, ein laufender Vertrag wird aufgefrischt, aber nie verlängert oder
  entfristet. Ein beendeter oder inaktiver Vertrag bleibt dagegen unverändert, auch wenn die Zeile
  ihn wieder laufen lässt. Über eine solche Zeile wird also niemand wieder aktiv, und kein Vertrag
  läuft über sein gespeichertes Ende hinaus (Abschnitt 4, dort auch die eine Ausnahme).
- **Alle Zeilen derselben Adresse müssen im selben Stapel landen,** ebenso alle Zeilen mit
  demselben Vertragsschlüssel und alle mit demselben Namen; der Code-Knoten (Abschnitt 3.2) sorgt
  dafür. Nur so erkennt der Abgleich eine Adresse, die bei mehreren Namen steht, einen doppelt
  vergebenen Vertragsschlüssel und sieht bei einer Namensänderung alle Verträge der Person
  zusammen. Über den Namen liegt auch eine Zeile ohne Adresse bei den übrigen Zeilen der Person;
  sonst hinge der Schutz vor Stilllegung (unten), der je Stapel gilt, davon ab, wie die Stapel
  geschnitten sind.
- **Ein Vertrag läuft**, solange `VERTRAGSENDE` leer ist oder auf heute oder später fällt
  (deutsche Zeit). `VERTRAGSENDE` ist der letzte Arbeitstag.
- **Stillgelegt wird nur ausdrücklich:** über eine gelieferte Zeile mit ihrem Vertrag oder ihrer
  Adresse, und nur, wenn der Person kein laufender Vertrag bleibt. Geprüft wird einmal am Ende des
  Stapels. Steht im selben Stapel ein laufender Vertrag mit ihrer Adresse **und ihrem Namen**, der
  nur wegen eines Zweifelsfalls nicht zugeordnet wurde, bleibt sie aktiv — so lange, wie diese
  Zeile kommt und läuft, auch wenn es ihr eigener, im Portal schon beendeter Vertrag ist (Ausnahme
  in Abschnitt 4). Die Zeile eines anderen Namens mit derselben Adresse (Nachfolger,
  geteiltes Postfach) schützt nicht. Fehlt jemand in einer Lieferung, passiert nichts. Ein leerer
  oder halber Lauf legt niemanden still, eine fehlerhafte Zeile allein auch nicht. Scheitert aber
  der laufende Anschlussvertrag an einem Fehler (Formatfehler, unbekannter Mandant, interner
  Fehler), während der alte Vertrag als beendet ankommt, wird die Person stillgelegt; der Lauf
  nach der Behebung reaktiviert sie.
- **Wiederholbar:** Derselbe Stapel zweimal ändert nichts außer dem Zeitpunkt der letzten Lieferung.
  Eine Ausnahme greift erst im nächsten Lauf: der Name nach einem Umzug im selben Lauf (oben).
- **Protokoll:** Jeder Aufruf schreibt genau einen Eintrag „Personalstamm: Abgleich aus DokuBit“
  ins Audit-Log, mit Zahlen und Meldungen, ohne Namen und ohne Adressen, auch wenn der ganze
  Stapel scheitert. Wird eine Bestandsperson übernommen, wechselt ein Vertrag die Person, ändert
  sich ein Name oder wird jemand stillgelegt oder wieder aktiv, kommt je ein eigener Eintrag dazu,
  ebenfalls ohne Namen und Adressen. Alle Einträge
  des Abgleichs und der Änderungen von Hand (nächster Punkt) löscht der Lauf „Wartung“ nach 365 Tagen.
- **Von Hand nur, was DokuBit nicht liefert** (Schreibschutz, `src/lib/personalstamm/schreibschutz.ts`).
  Über `/api/employees` schreiben nur die HR-Rollen, nicht der n8n-Schlüssel; lesen darf er weiter.
  - Person aus DokuBit (`importSource` `DOKUBIT`): Adresse, Aktiv-Status und Quelle weist das Portal
    mit 409 ab, ebenso das Deaktivieren (`DELETE`). Name und private Angaben bleiben frei.
  - Vertrag aus DokuBit (Abrechnungskreis und MANR gesetzt): Mandant, Einrichtung, Beginn, Ende,
    Stunden und Aktiv-Status weist das Portal mit 409 ab, ebenso das Löschen. Position, Abteilung
    und Vertragsart bleiben frei.
  - Eine Person mit Quelle `DOKUBIT` legt nur der Abgleich an (`POST` → 400). Eine Person einer
    anderen Quelle darf HR auf `DOKUBIT` umstellen; zurück geht es nicht, sonst bliebe ihr
    Aktiv-Status nach dem Vertragsende stehen.
  - Jede Änderung von Hand kommt als eigener Eintrag ins Audit-Log („Personalstamm: … von Hand …“),
    nur mit Feldnamen, nie mit Werten.

## 2. SQL-Abfrage (feste Spaltenliste)

```sql
SELECT
  CAST(MANDANTENNUMMER AS varchar(10))      AS mandantNummer,
  LTRIM(RTRIM(ABRECHNUNGSKREIS))            AS abrechnungskreis,
  LTRIM(RTRIM(MANR))                        AS personalNr,
  LTRIM(RTRIM(MAVONAME))                    AS vorname,
  LTRIM(RTRIM(MANANAME))                    AS nachname,
  NULLIF(LOWER(LTRIM(RTRIM(MAEMAIL))), '')  AS email,
  TEILZEITSTUNDEN                           AS teilzeitstunden,
  CONVERT(char(10), VERTRAGSBEGINN, 23)     AS vertragsbeginn,
  CONVERT(char(10), VERTRAGSENDE, 23)       AS vertragsende
FROM [DokuBit].[dbo].[dokubitmitarbeiter]
WHERE VERTRAGSENDE IS NULL
   OR CAST(VERTRAGSENDE AS date) >= DATEADD(day, -30, CAST(GETDATE() AS date))
ORDER BY email, mandantNummer, abrechnungskreis, personalNr;
```

| DokuBit-Spalte | Feld im Stapel | Ziel im Portal |
|---|---|---|
| `MANDANTENNUMMER` | `mandantNummer` | Mandant (`Organization.mandantNumber`), Teil des Vertragsschlüssels |
| `ABRECHNUNGSKREIS` | `abrechnungskreis` | `Employment.abrechnungskreis`, Teil des Vertragsschlüssels |
| `MANR` | `personalNr` | `Employment.personalNumber`, Teil des Vertragsschlüssels. **Nicht** `Employee.personalNumber`, dort steht die LOGA-Nummer |
| `MAVONAME`, `MANANAME` | `vorname`, `nachname` | `Employee.firstName`, `Employee.lastName` |
| `MAEMAIL` | `email` | `Employee.email`, erkennt die Person |
| `TEILZEITSTUNDEN` | `teilzeitstunden` | `Employment.workingHoursWeek` |
| `VERTRAGSBEGINN` | `vertragsbeginn` | `Employment.startDate` |
| `VERTRAGSENDE` | `vertragsende` | `Employment.endDate` (leer = unbefristet), daraus „läuft“ |

- **Nur diese neun Spalten** verlassen DokuBit. Der Code-Knoten gibt genau diese Felder weiter,
  und der Webhook verwirft unbekannte Felder.
- **Nicht abgefragt** wird `EVTLLDA`: Die Spalte ist kein letzter Arbeitstag, ihre Bedeutung klärt
  die Personalabteilung noch. Ebenfalls nicht abgefragt werden die Spalten, die in DokuBit überall
  leer sind (`MASTATUS`, `BESCHAEFTIGUNGSGRUPPE`, `MAPOSITION`, `VERTRAGSART`, `MABENUTZER`,
  `ARCHIVDATUM`).
- **Das 30-Tage-Fenster** liefert die gerade beendeten Verträge mit. Nur über diese Zeilen erfährt
  das Portal von einem Austritt. War der Ablauf länger als 30 Tage aus, das Fenster für einen Lauf
  vergrößern (z. B. `-90`), sonst bleiben die dazwischen Ausgeschiedenen aktiv.
- **Was das Fenster nicht sieht:** ein Vertragsende, das nachträglich mit einem Datum mehr als
  30 Tage zurück eingetragen wird, und eine in DokuBit gelöschte Zeile. Beide erreichen das Portal
  nie. Der Vertrag bleibt dort, wie er zuletzt kam: unbefristet oder mit dem alten Ende, und hält
  die Person aktiv, solange dieses Ende nicht verstrichen ist. Die rote Hinweiszeile unter „Personen“
  greift erst, wenn gar kein Vertrag der Person mehr geliefert wird. Abhilfe beim nachträglichen
  Ende: das Fenster für einen Lauf vergrößern (z. B. `-365`). Eine gelöschte Zeile kommt auch so
  nicht; dann den Vertrag in DokuBit wiederherstellen und beenden.

## 3. Ablauf in n8n einrichten

Am schnellsten: `s0-personalstamm-n8n.json` importieren (Workflows → Import from File), dann
URL und beide Credentials setzen. Von Hand geht es so:

### 3.1 Credentials

1. **Microsoft SQL** für DokuBit. Am besten ein Datenbankbenutzer, der nur `SELECT` auf
   `dbo.dokubitmitarbeiter` hat.
2. **Header Auth** nur für diesen Ablauf, z. B. „HR-Portal Personalstamm“:
   - Name: `Authorization`
   - Value: `Bearer <PERSONALSTAMM_SECRET>`
   - Das ist **nicht** `CRON_SECRET`. Das Credential in keinem anderen Ablauf verwenden.

### 3.2 Knoten

| Nr. | Knoten | Einstellung |
|---|---|---|
| 1 | **Schedule Trigger** „Täglich 02:30“ | Trigger Interval: Days, Hour 2, Minute 30 |
| 2 | **Microsoft SQL** „DokuBit lesen“ | Operation „Execute Query“, Query = Abfrage aus Abschnitt 2, Credential aus 3.1 Nr. 1 |
| 3 | **Code** „Stapel bilden“ | Mode „Run Once for All Items“, JavaScript, Code unten |
| 4 | **Loop Over Items** „Je Stapel“ | Batch Size `1`; Ausgang „loop“ auf Knoten 5, Ausgang „done“ frei |
| 5 | **HTTP Request** „An Portal senden“ | siehe unten; Ausgang zurück auf Knoten 4 |

**Code-Knoten „Stapel bilden“:** höchstens 200 Zeilen je Stapel; alle Zeilen derselben Adresse
liegen im selben Stapel, und Gruppen, die sich einen Vertragsschlüssel oder einen Namen teilen,
werden zusammengelegt. Das ist Pflicht, nicht Kür: Nur so erkennt der Abgleich eine Adresse mit
mehreren Namen und einen doppelten Vertragsschlüssel und sieht bei einer Namensänderung alle
Verträge der Person zusammen (Abschnitt 1). Lägen zwei Zeilen desselben Schlüssels mit
verschiedenen Adressen in verschiedenen Stapeln, hängte jeder Stapel den Vertrag zu „seiner“
Person, jede Nacht aufs Neue. Über den Namen landet auch die beendete Zeile ohne Adresse bei
den übrigen Zeilen der Person. Läge sie allein in einem Stapel, legte er die Person still, bevor
ihr laufender Anschluss geprüft ist: In derselben Nacht folgte „wieder aktiv“, oder sie bliebe
stillgelegt, wenn der Anschluss als Zweifelsfall gemeldet wird. Wächst eine zusammengelegte
Gruppe über 200 Zeilen, bricht der Knoten ab, und der Lauf schickt nichts; dann zeigt „Personen“
nach 26 Stunden die rote Hinweiszeile.

```js
// Stapel fuer POST /api/webhooks/personalstamm bilden:
// - hoechstens 200 Zeilen je Stapel (Grenze des Webhooks)
// - alle Zeilen derselben Adresse im selben Stapel (eine Person, ein Aufruf)
// - Zeilen mit demselben Vertragsschluessel ebenfalls im selben Stapel: Nur so
//   erkennt das Portal die Dublette (FORMATFEHLER), statt den Vertrag in jeder
//   Nacht zwischen zwei Personen hin- und herzuhaengen
// - Zeilen mit demselben Namen ebenfalls im selben Stapel: Sonst laege etwa die
//   beendete Zeile ohne Adresse in einem anderen Stapel als der laufende
//   Anschluss derselben Person, und ob sie stillgelegt wird, hinge vom Schnitt ab
// - feste Spaltenliste: nur diese neun Felder gehen an das Portal
const MAX_STAPEL = 200;

// Gruppe -> Gruppe, mit der sie zusammengelegt ist (bis zur Wurzel verfolgen)
const zusammen = new Map();
const wurzel = (g) => {
  while (zusammen.get(g) !== g) g = zusammen.get(g);
  return g;
};
// Merkmal (Vertragsschluessel oder Name) -> erste Gruppe damit; jede weitere wird mit ihr zusammengelegt
const gruppeJeMerkmal = new Map();
const verbinden = (merkmal, gruppe) => {
  if (gruppeJeMerkmal.has(merkmal)) zusammen.set(wurzel(gruppe), wurzel(gruppeJeMerkmal.get(merkmal)));
  else gruppeJeMerkmal.set(merkmal, gruppe);
};
const zeilen = [];
let ohneAdresse = 0;
for (const item of $input.all()) {
  const z = item.json;
  const zeile = {
    mandantNummer: z.mandantNummer,
    abrechnungskreis: z.abrechnungskreis,
    personalNr: z.personalNr,
    vorname: z.vorname,
    nachname: z.nachname,
    email: z.email ?? null,
    teilzeitstunden: z.teilzeitstunden ?? null,
    vertragsbeginn: z.vertragsbeginn,
    // Bewusst ohne `?? null`: NULL aus SQL kommt als null (= unbefristet). Fehlt
    // die Spalte (etwa ein vertippter Alias), fehlt der Schluessel, und das
    // Portal meldet FORMATFEHLER, statt alle Vertraege fuer unbefristet zu halten.
    vertragsende: z.vertragsende,
  };
  // Zeilen ohne Adresse bilden je eine eigene Gruppe.
  const gruppe = zeile.email ? String(zeile.email).trim().toLowerCase() : `ohne-adresse-${ohneAdresse++}`;
  if (!zusammen.has(gruppe)) zusammen.set(gruppe, gruppe);
  // Vertragsschluessel wie im Portal: Mandant ohne fuehrende Nullen, alles getrimmt.
  const teile = [
    String(zeile.mandantNummer ?? '').trim().replace(/^0+/, ''),
    String(zeile.abrechnungskreis ?? '').trim(),
    String(zeile.personalNr ?? '').trim(),
  ];
  if (teile.every((t) => t !== '')) verbinden(`schluessel:${teile.join('|')}`, gruppe);
  // Name wie im Portal: getrimmt, klein; ohne Vor- oder Nachnamen wird nicht zusammengelegt.
  const name = [zeile.vorname, zeile.nachname].map((t) => String(t ?? '').trim().toLowerCase());
  if (name.every((t) => t !== '')) verbinden(`name:${name.join('|')}`, gruppe);
  zeilen.push({ gruppe, zeile });
}

const gruppen = new Map();
for (const { gruppe, zeile } of zeilen) {
  const g = wurzel(gruppe);
  if (!gruppen.has(g)) gruppen.set(g, []);
  gruppen.get(g).push(zeile);
}

const stapel = [];
let aktuell = [];
for (const zeilenDerGruppe of gruppen.values()) {
  if (zeilenDerGruppe.length > MAX_STAPEL) throw new Error(`Eine Gruppe zusammengehoeriger Zeilen hat mehr als ${MAX_STAPEL} Zeilen`);
  if (aktuell.length + zeilenDerGruppe.length > MAX_STAPEL) {
    stapel.push(aktuell);
    aktuell = [];
  }
  aktuell.push(...zeilenDerGruppe);
}
if (aktuell.length > 0) stapel.push(aktuell);

return stapel.map((eintraege, i) => ({ json: { stapel: i + 1, anzahl: eintraege.length, eintraege } }));
```

**Loop Over Items „Je Stapel“:** Batch Size `1`. Der Ausgang „loop“ führt auf „An Portal senden“,
dessen Ausgang zurück auf „Je Stapel“; der Ausgang „done“ bleibt frei. So schickt n8n den nächsten
Stapel erst, wenn das Portal den vorigen beantwortet hat.

**HTTP Request „An Portal senden“:**

- Method `POST`, URL `https://HR-PORTAL/api/webhooks/personalstamm` (Platzhalter `HR-PORTAL`
  durch die Adresse des Portals ersetzen, wie in `APP_URL`)
- Authentication: Generic Credential Type → Header Auth → Credential aus 3.1 Nr. 2
- Send Body: an, Body Content Type JSON, Specify Body „Using JSON“,
  JSON: `{{ JSON.stringify($json.eintraege) }}`
- Options → Timeout: `120000` ms. Ein Stapel mit 200 Zeilen braucht einige Sekunden.
- **Nicht** die Option „Batching“ verwenden (siehe unten).

> **Warum die Schleife und nicht „Batching“:** Die Option „Batching“ des HTTP-Request-Knotens
> staffelt nur den Start der Aufrufe; sie wartet nicht auf die Antwort des vorigen. Das Portal
> arbeitet gleichzeitige Aufrufe zwar nacheinander ab, damit sich zwei Stapel nie überschneiden
> (sonst legten etwa zwei Aufrufe für einen umziehenden Vertrag zweimal dieselbe Person an). Die
> übrigen Aufrufe warten dann aber im Portal und laufen in die Zeitgrenze. Die Schleife schickt
> den nächsten Stapel erst nach der Antwort. Aus demselben Grund den Ablauf nicht von Hand starten,
> während der nächtliche Lauf noch arbeitet.

### 3.3 Einstellungen des Ablaufs (Workflow → Settings)

- **Timezone:** Europe/Berlin.
- **Save successful production executions:** Do not save. Die Ausführungsdaten enthalten Namen
  und Adressen aus DokuBit.
- **Save manual executions:** Do not save (empfohlen, aus demselben Grund).
- Fehlgeschlagene Ausführungen speichert n8n weiter. Sie enthalten ebenfalls DokuBit-Daten; die
  instanzweite Bereinigung der Ausführungen sollte deshalb eine kurze Frist haben.

### 3.4 Erster Lauf und Kontrolle

- **Einen Probelauf gibt es nicht.** Schon der erste Aufruf schreibt in die Portal-Datenbank.
  Vorher die Checkliste in Abschnitt 7 abarbeiten.
- Ablauf einmal von Hand ausführen. Jeder Stapel muss mit HTTP 200 antworten. 401 heißt falsches
  Geheimnis, 500 mit „Konfigurationsfehler“ heißt: `PERSONALSTAMM_SECRET` fehlt im Portal oder ist
  kürzer als 24 Zeichen.
- Im Portal unter „Personen“ nachsehen: Hinweiszeile, Block „Zu prüfen“ und die Liste.
- Zahlen der Läufe in der Datenbank: Abschnitt 6, Abfrage 5.
- Danach den Ablauf aktiv schalten.

## 4. Antwort des Portals und Grundcodes

Antwort je Aufruf mit HTTP 200. 400, 401, 413 und 500 kommen nur, wenn der ganze Aufruf scheitert
(Körper, Anmeldung, Körper über 1 MiB, Konfiguration — auch, wenn `PERSONALSTAMM_SECRET` gleich
`CRON_SECRET` ist).

```json
{
  "success": true,
  "summary": { "zeilen": 200, "angelegt": 3, "aktualisiert": 1, "unveraendert": 194,
               "uebersprungen": 2, "stillgelegt": 0, "reaktiviert": 0, "zweifelsfall": 0, "fehler": 0 },
  "results": [{ "index": 0, "status": "unveraendert", "schluessel": "742|1|10023" }]
}
```

- `success` ist `false`, sobald eine Zeile den Status `fehler` hat. Der Ablauf in n8n schlägt
  deshalb nicht fehl; die Meldungen stehen im Portal unter „Personen“ → „Zu prüfen“.
- `status` je Zeile: `angelegt`, `aktualisiert`, `unveraendert`, `uebersprungen` (beendeter Vertrag,
  den das Portal nicht kennt), `zweifelsfall`, `fehler`.
- Die Antwort enthält weder Namen noch Adressen.

Behoben wird immer an der Quelle, meist in DokuBit. Der nächste Lauf räumt die Meldung von selbst ab.

| Code | Bedeutung | Was tun |
|---|---|---|
| `FORMATFEHLER` | Zeile unvollständig oder im falschen Format, auch mit Steuerzeichen oder einem einzelnen UTF-16-Surrogat (`feld` nennt die Stelle). Bei `feld` = `schluessel` steht derselbe Vertragsschlüssel mehrfach im Stapel, auch wenn eine dieser Zeilen zusätzlich einen anderen Fehler hat; keine dieser Zeilen wird verarbeitet. Bei `feld` = `email` ist die Adresse ungültig; ein bekannter Vertrag bleibt bei seiner Person, sein Vertragsende kommt trotzdem an (Regel „Zweifel verschafft nie Zugang“ unter der Tabelle), Person und Name bleiben | Zeile in DokuBit prüfen, z. B. ungültige Adresse, fehlender Name, Datum, doppelt vergebener Schlüssel |
| `MANDANT_UNBEKANNT` | Mandantennummer im Portal unbekannt | Mandant im Portal anlegen oder Nummer prüfen |
| `INTERNER_FEHLER` | Ausnahme bei dieser Zeile. Scheitert schon das Lesen vor der Verarbeitung, tragen alle Zeilen des Stapels diesen Code. Mit Schlüssel `person`: Der Aktiv-Status einer Person ließ sich am Ende des Stapels nicht schreiben | Log des Portals ansehen; der nächste Lauf versucht es erneut |
| `MAIL_FEHLT` | Vertrag ohne dienstliche Adresse. Ein neuer laufender wird nicht angelegt; ein bekannter bleibt bei seiner Person, sein Vertragsende kommt an (Regel unter der Tabelle), der Name bleibt | `MAEMAIL` in DokuBit nachtragen |
| `EMAIL_MEHRDEUTIG` | Die Adresse gehört im Portal mehreren Personen. Angelegt oder zugeordnet wird nichts; ein bekannter Vertrag bleibt bei seiner Person (Regel unter der Tabelle) | Dublette im Portal bereinigen; welche es sind, zeigt Abschnitt 6, Abfrage 4. Die Ansicht „Personen“ bearbeitet nichts: bei der überzähligen Person die Adresse über `PATCH /api/employees/[id]` (Feld `email`) korrigieren oder leeren. Bei einer Person aus DokuBit sperrt das Portal die Adresse (409, Abschnitt 1); überzählig ist dann die andere. **Nicht deaktivieren, nie per SQL löschen:** `DELETE /api/employees/[id]` setzt nur `isActive = false`; die Adresse bleibt und damit die Dublette. Ein `DELETE` in der Datenbank entfernt per Cascade auch die Anstellungen und alles, was an der Person hängt |
| `EMAIL_ANDERER_NAME` | Adresse und Name passen nicht zu derselben Person: Dieselbe Adresse steht im Stapel bei mehreren Namen; oder sie gehört im Portal einer Person mit anderem Namen, deren Namen der Abgleich nicht ändern darf (nicht alle ihre laufenden Verträge nennen den neuen Namen, Vor- und Nachname sind beide neu, sie hat keinen laufenden Vertrag mehr und für einen Anschluss fehlt der Nachweis nach der Regel unter der Tabelle, oder sie stammt aus dem Bestand ohne Herkunft). Angelegt oder zugeordnet wird nichts; ein bekannter Vertrag bleibt bei seiner Person (Regel unter der Tabelle). Die Person mit dieser Adresse bleibt nur aktiv, wenn die gemeldete Zeile ihren eigenen Namen trägt | In DokuBit prüfen: geteiltes Postfach, eine Adresse oder ein Vertragsschlüssel für einen anderen Menschen wiederverwendet, oder ein neuer Name erst bei einem Teil der Verträge. Adresse oder Name korrigieren; einen neuen Namen bei allen Verträgen der Person, die n8n liefert, auch bei den in den letzten 30 Tagen beendeten. **Anschluss nach einer Heirat ohne Nachweis** (Regel unter der Tabelle): den neuen Namen in DokuBit auch am alten Vertrag eintragen, und dort die Adresse stehen lassen oder wieder eintragen; der nächste Lauf ordnet den Anschluss zu und reaktiviert die Person. Ein `PATCH` des Namens hilft nicht, solange n8n die alte Zeile mit dem alten Namen unter der Adresse liefert. Nur wenn das in DokuBit nicht geht (Zeile gelöscht, neuer Vorname, Ende vor mehr als 30 Tagen, Anschluss auf demselben Vertragsschlüssel) und es wirklich dieselbe Person ist: den Namen im Portal über `PATCH /api/employees/[id]` (Felder `firstName`, `lastName`) nachziehen. Das wirkt, sobald alle Zeilen der Adresse im Stapel diesen Namen tragen; dann ordnet der nächste Lauf den Anschluss zu und reaktiviert die Person |
| `MANUELLER_DATENSATZ` | Die Adresse gehört im Portal einer von Hand geführten Person (`importSource` `MANUELL`, auch nachträglich umgestellt; eine Person aus DokuBit lässt sich nicht zurückstellen). Ihr wird kein Vertrag zugeordnet, weder ein neuer noch ein bekannter einer anderen Person; ein bekannter Vertrag bleibt, wo er ist (Regel unter der Tabelle). Adresse, Name und Aktiv-Status der Person bleiben | HR entscheidet. Soll der Abgleich die Person führen, `importSource` auf `DOKUBIT` setzen |
| `FREMDE_QUELLE` | Person aus einer anderen Quelle, z. B. LOGA; sonst wie `MANUELLER_DATENSATZ` | wie `MANUELLER_DATENSATZ` |

**Zweifel verschafft nie Zugang** (Entscheidung des Auftraggebers vom 17.10.2026). Das gilt für
jeden bekannten Vertrag, dessen Zeile als Zweifelsfall oder Fehler endet: `EMAIL_ANDERER_NAME`
(auch bei einer Adresse mit mehreren Namen), `EMAIL_MEHRDEUTIG`, `MANUELLER_DATENSATZ`,
`FREMDE_QUELLE`, `MAIL_FEHLT` und `FORMATFEHLER` mit `feld` = `email`.

- Der Vertrag wechselt nie die Person.
- Beendet die Zeile den Vertrag, kommt das Ende an und der Vertrag wird inaktiv. Das Vertragsende
  muss immer ankommen. Sonst übernimmt das Portal aus dieser Zeile nichts, weder Beginn noch Stunden.
- Läuft die Zeile und läuft der Vertrag auch im Portal (aktiv, Ende nicht verstrichen), werden
  die Stunden aufgefrischt, sofern die Zeile den gespeicherten Vertragsbeginn nennt (mit einem
  anderen beschreibt sie vermutlich den Vertrag eines anderen Menschen), und ein früheres Ende
  übernommen. Er bleibt aktiv. Ein späteres oder leeres Ende übernimmt das Portal nicht, den
  Beginn ändert es nicht: Ein Zweifel verlängert keinen Vertrag. Am Tag nach dem gespeicherten
  Ende ist der Vertrag beendet, wie ohne die Zeile.
- Läuft die Zeile, der Vertrag im Portal aber nicht (beendet oder inaktiv), ändert sich nichts:
  kein neues Ende, keine Stunden, keine Reaktivierung, kein neuer Zeitpunkt der Lieferung.

Über eine zweifelhafte Zeile wird also niemand wieder aktiv, und es kommt nicht darauf an, ob sie
vor oder nach dem gespeicherten Ende eintrifft. Das gilt auch, wenn DokuBit den Schlüssel eines
Vertrags samt Postfach an einen anderen Menschen vergibt, vor oder nach dem Ende, auch mehr als
30 Tage danach. Abhilfe ist, den Zweifel an der Quelle aufzulösen (Tabelle). Ist es dieselbe
Person, frischt der nächste Lauf den Vertrag auf, auch ein verlängertes Ende, und reaktiviert sie
bei Bedarf. Ist es ein anderer Mensch, braucht er in DokuBit eine eigene Adresse; dann wandert
der Vertrag zu ihm. Eine echte Verlängerung kommt in DokuBit ohnehin als neue Zeile.

**Ausnahme, entschieden am 17.10.2026:** Trägt die zweifelhafte laufende Zeile Adresse und Namen
der Person, schützt sie die Person vor der Stilllegung (Abschnitt 1), auch wenn der Vertrag im
Portal schon beendet ist und die Zeile deshalb nichts ändert. Die Person bleibt dann aktiv, solange
diese Zeile kommt und läuft; der Vertrag bleibt mit seinem verstrichenen Ende stehen.
Grund: Sie hält nur einen bestehenden Zugang aufrecht und schafft keinen neuen; der Zweifel steht in „Zu prüfen“ und wird in DokuBit aufgelöst.

**Anschluss nach dem Ende des alten Vertrags, nur mit Nachweis** (Entscheidungen R2 und F des
Auftraggebers vom 17.10.2026). Hat eine Person keinen laufenden Vertrag mehr, etwa weil ihr alter
gestern endete, und kommt ein laufender Anschlussvertrag mit ihrer Adresse und neuem Nachnamen
(Heirat), übernimmt das Portal den Namen und hängt den Anschluss an sie. Dafür müssen alle
Bedingungen gelten:

- Die Person kommt aus DokuBit (`importSource` `DOKUBIT`); Bestand ohne Herkunft nie.
- Der Vorname bleibt gleich.
- Sie hatte vor dem Lauf keinen laufenden Vertrag.
- Die Zeile läuft.
- Alle Zeilen dieser Adresse im Stapel tragen denselben Namen.
- **Nachweis:** Im selben Stapel kommt unter derselben Adresse die Zeile eines ihrer Verträge, die
  ihn höchstens 30 Kalendertage vor heute enden lässt (deutsche Zeit;
  `PERSONALSTAMM_ANSCHLUSS_TAGE`, passend zum Fenster der Abfrage in Abschnitt 2) und denselben
  Vertragsbeginn nennt, den das Portal gespeichert hat. Wegen der vorigen Bedingung trägt diese
  Zeile den neuen Namen: DokuBit führt ihn also auch am alten Vertrag.

Die Person bleibt aktiv oder wird es wieder, im Audit-Log steht „Name geändert“. Die Zeile des alten
Vertrags wird in dieser Nacht noch mit `EMAIL_ANDERER_NAME` gemeldet, ab der nächsten passt der
Name. Maßgeblich ist das Ende, das in dieser Zeile steht; korrigiert die Lieferung es, zählt schon
das neue. Lief der alte Vertrag vor dem Lauf noch, ordnet die Namensänderung bei gleicher Adresse
zu (Abschnitt 1), sofern seine Zeile mit der Adresse und dem neuen Namen kommt.

Fehlt der Nachweis, bleibt es bei `EMAIL_ANDERER_NAME`. Die Person bleibt unverändert und inaktiv,
der Anschluss wird nicht angelegt. Das ist in diesen Fällen so:

- Die Zeile des alten Vertrags trägt noch den alten Namen (Adresse mit zwei Namen).
- Sie kommt ohne Adresse, mit einer anderen oder einer ungültigen Adresse, oder gar nicht, etwa weil
  sie in DokuBit gelöscht ist.
- Ihr Ende liegt mehr als 30 Tage zurück.
- Sie nennt einen anderen Vertragsbeginn als gespeichert. Dann hat DokuBit den Schlüssel neu
  vergeben, und die Zeile beschreibt den Vertrag eines anderen Menschen.
- Der Anschluss läuft auf demselben Vertragsschlüssel weiter. Dann gibt es keine beendete Zeile.

Abhilfe steht in der Tabelle bei `EMAIL_ANDERER_NAME`: Am besten den neuen Namen in DokuBit auch am
alten Vertrag eintragen, mit der Adresse.

Eine Nachfolgerin mit demselben Vornamen, der DokuBit das Postfach gibt, übernimmt den Datensatz der
ausgeschiedenen Person deshalb nicht, auch wenn deren alte Zeile ohne Adresse kommt oder fehlt oder
DokuBit ihr den alten Vertragsschlüssel gibt. Hat sie schon einen eigenen Datensatz, bleibt ihr
Vertrag dort.

**Restrisiko (bekannt, dem Auftraggeber am 17.10.2026 genannt).** Nicht von einer Heirat unterscheiden lassen sich zwei Fälle:

- Ein Fehler in DokuBit ändert die Zeile des alten Vertrags auf den Namen der Nachfolgerin, ohne
  ihren Vertragsbeginn zu ändern. Dann greift der Anschluss nach dem Ende.
- DokuBit vergibt einen Vertragsschlüssel samt Postfach neu, solange der Vertrag der bisherigen
  Person im Portal noch läuft, und der neue Name teilt Vor- oder Nachnamen mit ihr. Ist es ihr
  einziger laufender Vertrag und nennt die Zeile seinen gespeicherten Vertragsbeginn, gilt das als
  Namensänderung bei gleicher Adresse (Abschnitt 1): Der Datensatz bekommt ohne Meldung den neuen
  Namen, der Vertrag die neuen Daten samt Ende, und die Person bleibt aktiv. Nennt die Zeile
  einen anderen Beginn oder teilen die Namen nichts, wird gemeldet, und der Vertrag wird nicht
  verlängert (Regel „Zweifel verschafft nie Zugang“): Er endet zu seinem gespeicherten Ende. Hat
  er keins, weil DokuBit die Zeile überschrieben hat, ohne ein Ende einzutragen, hält er die Person
  aktiv, bis der Zweifel aufgelöst ist, wie eine gelöschte Zeile (Abschnitt 2).

## 5. Rücknahme

- **Ablauf in n8n ausschalten.** Mehr ist nicht nötig.
- Angelegte Personen und Verträge bleiben. Erkennbar sind sie an `employees."importSource" = 'DOKUBIT'`
  und an Anstellungen mit gesetztem `abrechnungskreis` und `personalNumber`.
- Kein Code-Rollback unter das Schema-Delta: Der Entrypoint führt `prisma db push --accept-data-loss`
  aus und würde die neuen Spalten samt Inhalt löschen.
- Wer sicher gehen will, dass auch ein vergessener Ablauf nichts mehr schreibt, leert zusätzlich
  `PERSONALSTAMM_SECRET` im Portal. Der Webhook antwortet dann mit 500.
- Nach 26 Stunden ohne Lieferung wird die Hinweiszeile unter „Personen“ rot. Das ist nach dem
  Abschalten zu erwarten.
- Wird der Ablauf nach mehr als 30 Tagen wieder eingeschaltet, für den ersten Lauf das Fenster
  der Abfrage vergrößern (Abschnitt 2).

## 6. Bestandsprüfung der Portal-Datenbank

Vor dem ersten Lauf, auf dem Server. Die Abfragen lesen nur (`default_transaction_read_only`).

**Abfragen 1–3 (nur Zahlen):**

```bash
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 <<'SQL'
\echo '== 1 Personen je Herkunft: aktiv, ohne Adresse, mit LOGA-Nummer'
SELECT COALESCE("importSource", '(leer)')                        AS herkunft,
       COUNT(*)                                                  AS personen,
       COUNT(*) FILTER (WHERE "isActive")                        AS aktiv,
       COUNT(*) FILTER (WHERE COALESCE(btrim(email), '') = '')   AS ohne_adresse,
       COUNT(*) FILTER (WHERE "personalNumber" IS NOT NULL)      AS mit_loga_nummer
FROM employees
GROUP BY 1
ORDER BY 1;

\echo '== 2 Dubletten der Adressen je Herkunft (ohne Gross-/Kleinschreibung)'
SELECT herkunft, COUNT(*) AS adressen, SUM(personen) AS personen
FROM (
  SELECT lower(btrim(email)) AS adresse,
         string_agg(DISTINCT COALESCE("importSource", '(leer)'), ' + '
                    ORDER BY COALESCE("importSource", '(leer)')) AS herkunft,
         COUNT(*) AS personen
  FROM employees
  WHERE COALESCE(btrim(email), '') <> ''
  GROUP BY 1
  HAVING COUNT(*) > 1
) d
GROUP BY herkunft
ORDER BY herkunft;

\echo '== 3 Anstellungen je Herkunft der Person'
SELECT COALESCE(e."importSource", '(leer)')                                  AS herkunft,
       COUNT(m.id)                                                           AS anstellungen,
       COUNT(m.id) FILTER (WHERE m."isActive")                               AS aktiv,
       COUNT(m.id) FILTER (WHERE m.abrechnungskreis IS NOT NULL
                             AND m."personalNumber" IS NOT NULL)             AS vom_abgleich_verwaltet
FROM employments m
JOIN employees e ON e.id = m."employeeId"
GROUP BY 1
ORDER BY 1;
SELECT COUNT(*) AS anstellungen_gesamt FROM employments;
SQL
```

**So lesen:**

- **Vor dem ersten Lauf** gibt es keine Herkunft `DOKUBIT`.
- **Herkunft `(leer)`** ist Altbestand. Der erste Lauf übernimmt eine solche Person, wenn ihre Adresse
  eindeutig ist und der Name passt. Ihre alten Anstellungen bleiben unberührt und zählen nicht für
  „aktiv“.
- **`MANUELL` und andere Quellen** (z. B. `LOGA`) fasst der Abgleich nicht an. Er meldet sie als
  Zweifelsfall.
- **Abfrage 2 sollte leer sein** (`(0 rows)`). Jede Adresse mit mehreren Personen führt sonst zu
  `EMAIL_MEHRDEUTIG`. Vorher bereinigen; welche Adressen es sind, zeigt Abfrage 4.
- **Leerzeichen und Großbuchstaben** in gespeicherten Adressen muss niemand vorher bereinigen: Der
  Abgleich vergleicht wie diese Abfragen getrimmt und kleingeschrieben.
- **Nach dem ersten Lauf** zeigt Abfrage 1 unter `DOKUBIT` rund 343 Personen und Abfrage 3 rund
  362 aktive, vom Abgleich verwaltete Anstellungen (Stand DokuBit 17.10.2026), abzüglich der
  Zweifelsfälle.

**Abfrage 4 (Einzelheiten der Dubletten):** Die Ausgabe enthält dienstliche Adressen. Nur auf dem
Server ansehen, nicht weitergeben.

```bash
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 <<'SQL'
SELECT lower(btrim(email)) AS adresse,
       COUNT(*) AS personen,
       string_agg(COALESCE("importSource", '(leer)'), ', ') AS herkunft
FROM employees
WHERE COALESCE(btrim(email), '') <> ''
GROUP BY 1
HAVING COUNT(*) > 1
ORDER BY 1;
SQL
```

**Abfrage 5 (Zahlen der letzten Läufe, nach dem ersten Lauf):**

```bash
sudo docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' hr-portal-db \
  psql -U hrportal -d hr_portal -v ON_ERROR_STOP=1 <<'SQL'
SELECT "createdAt", details->'zahlen' AS zahlen
FROM audit_logs
WHERE action = 'PERSONALSTAMM_LAUF'
ORDER BY "createdAt" DESC
LIMIT 10;
SQL
```

## 7. Checkliste vor dem ersten Produktivlauf

Organisatorisch, kein Code.

- [ ] **Bestand der Portal-Datenbank prüfen:** Abschnitt 6, Abfragen 1–3. Herkunft und Dubletten
      der Adressen klären; Dubletten vorher bereinigen (Abfrage 4, Weg wie bei `EMAIL_MEHRDEUTIG`
      in Abschnitt 4).
- [ ] **Verzeichnis der Verarbeitungstätigkeiten:** die drei n8n-Angaben nachtragen:
  - Betreiber und Standort von n8n
  - Aufbewahrung der Ausführungen (Abschnitt 3.3)
  - feste Spaltenliste (Abschnitt 2)
  - Ist der Betreiber nicht der Träger selbst, braucht es einen Vertrag nach Art. 28 DSGVO.
- [ ] **E-S25 und E-S27 klären,** beide mit dem DSB:
  - E-S25: welches Gremium für die drei GmbHs zustimmt, MAV oder Betriebsrat
  - E-S27: DSG-EKD oder BDSG, je juristische Person
- [ ] **Löschfrist von 1 Jahr mit dem DSB bestätigen.** Sie steht in `PERSONALSTAMM_AUFBEWAHRUNG_TAGE`
      (`src/lib/constants.ts`). Durchgesetzt wird sie vom Lauf „Wartung“; der muss unter
      Einstellungen → Automatische Läufe eingeschaltet sein.
- [ ] **In DokuBit bereinigen:** die 5 Adressen mit fremder Domain (vermutlich privat) und die
      1 Adresse mit zwei Namen. Bis dahin legt der Abgleich für diese Adresse niemanden an
      (`EMAIL_ANDERER_NAME`).
- [ ] **`PERSONALSTAMM_SECRET` setzen** und das n8n-Credential nur im Stammablauf anlegen:
  - Wert erzeugen: `openssl rand -base64 24`
  - in die `.env` des Portals auf dem Server eintragen, dann
    `sudo docker compose up -d --no-build --force-recreate app`
  - prüfen, ohne den Wert zu zeigen:
    `sudo docker exec hr-portal-app sh -c 'test ${#PERSONALSTAMM_SECRET} -ge 24 && echo gesetzt || echo FEHLT'`
