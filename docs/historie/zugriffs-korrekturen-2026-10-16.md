# Zugriffs-Korrekturen an den Vorgangsmodulen — 16.10.2026

**Hier einsteigen, wenn du diese Änderungen prüfen oder weiterführen willst.**
Vier Commits auf `main` (`5595cf7` → `c82ffec`), 17 Dateien, +1231/−38 Zeilen.
Nichts davon ist deployt; sie fahren mit dem nächsten Deploy mit (UX-Umbau,
siehe [`../module/ux-ui/projekt-ux-umbau.md`](../module/ux-ui/projekt-ux-umbau.md)).

Diese Datei ist die **Übergabe** für eine Durchsicht in einer neuen Sitzung. Sie
nennt, was geändert wurde, **warum**, was bewusst NICHT geändert wurde (damit
eine Durchsicht das nicht erneut meldet), und wo die bekannten Grenzen liegen.

---

## 0. Worum es geht, in fünf Sätzen

Die Detailrouten der Vorgangsmodule prüften die Rolle gegen `PORTAL_ROLES` und
gaben dann die rohe Prisma-Zeile zurück. Darin lagen Dinge, die eine
Einrichtungsleitung oder Führungskraft nicht sehen soll: das Protokoll des
Vorgangs, die entschlüsselte Abfindung, die Aufgaben-Links der Abteilungen und —
in der Verbeamtung — vier Arten lebender Magic-Link-Schlüssel samt der
dienstlichen Beurteilung. Dazu hatten vier Handler der Verbeamtung **gar keine**
Rollenprüfung und keiner prüfte den Mandanten, womit die amtsärztlichen
Zeugnisse jedes Trägers herunterladbar und löschbar waren (Art. 9 DSGVO).
Ausnutzbar war nichts davon, weil zwei Barrieren außerhalb der Routen liegen
(unten, Abschnitt 1) — die Routen selbst waren offen.

**Warum es trotzdem dringend war:** Die Allowlist des Mandanten-Gates ist
ausdrücklich eine Arbeitsliste. Jeder Eintrag einer Route ist der Moment, in dem
ihr Datenzuschnitt zählt.

---

## 1. Die zwei Barrieren (wichtig für die Einordnung jedes Befunds)

1. **Die mandantenbeschränkten Rollen lassen sich nicht vergeben.** `EINRICHTUNGSLEITUNG`
   und `VORGESETZTER` fehlen in `assignableRoles` (`src/lib/permissions.ts`), und
   `UserOrgAssignment` wird im ganzen Code nirgends geschrieben.
2. **Das Mandanten-Gate der Middleware** (`src/lib/mandanten-gate.ts`, aufgerufen
   als `apiZugriffVerweigern` in `src/middleware.ts`) verweigert diesen Rollen
   **jeden** `/api/`-Pfad außer `/api/auth`.

Das Gate greift **nur für `/api/`, nicht für Seiten**. Und sein Modulkopf sagt
selbst: „Ein Eintrag ist eine Zusage, kein Vorsatz."

---

## 2. Was geändert wurde

### Commit 1 — `c8b9c6e` (Merge `e6db330`): Protokoll bei Verbeamtung und Vertragsende

`auditLogs` kommt nur mit `HR_EDIT_ROLES` ins Prisma-`include` — die Schranke
sitzt in der **Abfrage**, die Zeilen verlassen die Datenbank nicht.

In der Verbeamtungs-Ansicht kam `NUR_HR_TABS` dazu: Die Oberfläche gated den
Reiter „E-Mails" schon lange, hatte „Protokoll" aber an **beiden** Stellen
vergessen (Reiterleiste und Inhalt). Jetzt lesen beide **eine** Liste.

> **Hinweis für die Durchsicht:** Der Teil für die Verbeamtung ist durch Commit 3
> überholt — dort ist die ganze Route HR-only, die Protokoll-Schranke wurde
> deshalb zurückgenommen. Für das **Vertragsende** gilt sie weiter.

### Commit 2 — `1cffbba` (Merge `457f3f6`): Offboarding und Onboarding

`GET` bleibt dort bei `PORTAL_ROLES`, und das ist Absicht: Die
Offboarding-Ansicht ist **ausdrücklich zum Lesen gebaut** — `canEdit` in 24
Zeilen über drei Dateien, `NUR_HR_TABS` mit drei Reitern, und Exit-Interview und
Zeugnis werden für Nicht-HR **gar nicht geladen** („Magic Links in der
Antwort"). Eine Beschränkung auf `HR_EDIT_ROLES` hätte diesen Zugang zerstört.

Deshalb **feldweise**:

| Feld | Regel | Begründung |
|---|---|---|
| `auditLogs` | nur `HR_EDIT_ROLES` | Es gibt im Offboarding gar keinen Protokoll-Reiter — es war Fracht |
| `exitData.severancePay` | nur `FINANCIAL_ROLES`, sonst `null` | AES-verschlüsselt wie IBAN; `VORGESETZTER` fehlt in der Liste. **Erste Verwendung von `FINANCIAL_ROLES` im Code** — sie war bis dahin toter Code. `null` statt leer, damit „darf ich nicht sehen" nicht wie „keine Abfindung vereinbart" aussieht |
| Aufgaben-Links der Abteilungen | ohne `HR_EDIT_ROLES` entfernt, in **beiden** Modulen | Zugang ohne Anmeldung. Der Schlüssel steckt an **drei** Stellen, deshalb eine reine Funktion `ohneLinkSchluessel` (`src/lib/abteilungsaufgaben.ts`) statt dreimal Handarbeit |
| `notes` samt Urheber | **unverändert sichtbar** | Entscheidung des Projektverantwortlichen: „die Führungskraft darf mitlesen". Im Code UND als Test festgehalten |

### Commit 3 — `b474d8a` (Merge `b12a1e9`): Verbeamtung ist reine HR-Arbeit

Entscheidung des Projektverantwortlichen. `GET` auf **Detail- und Listenroute**
prüft `HR_EDIT_ROLES` (vorher `PORTAL_ROLES`).

Begründung, warum hier anders als im Offboarding: Jede Funktion der Seite hängt
an einer HR-only-Unterroute — eine Nicht-HR-Rolle sähe nur Knöpfe, die 403
geben. Die Fachdoku des Moduls verlangt selbst „403 für Nicht-HR-Rolle"
(`docs/module/verbeamtung/VERBEAMTUNG_NEXT_STEPS.md`). Und es geht um
**Art.-9-Daten an vier Stellen**: amtsärztliche Untersuchung, aber auch
Gemeinde-Mitgliedschaft samt Freitext und „biblische Integration" in
`prerequisites`, dazu die Amtsarzt-Dokumentarten und `gemeindeReferenz` der
Beurteilung — Gesundheit **und** Religion.

**Der eigentliche Fund waren aber nicht die Tokens.** Vier Handler hatten gar
keine Rollenprüfung (nur „ist angemeldet") und keiner prüfte den Mandanten:

| Handler | Was damit möglich war |
|---|---|
| `POST …/application` | Lebenden Magic-Link erzeugen, bestehenden überschreiben, Token samt Adresse in der Antwort erhalten — damit reicht man den Antrag im Namen der Lehrkraft ein |
| `GET/POST …/documents` | Nachweise listen, Dateien hochladen |
| `GET/DELETE …/documents/[docId]` | Dateien herunterladen und **löschen** |

Dazu zwei Befunde an der Liste: Sie gab `applicationToken` (plus
`applicationData`, `prerequisites`, `stakeholders`) für bis zu `limit` Vorgänge
heraus, weil `include` ohne `select` am Vorgang steht. Und ihr `groupBy` lief
**ohne `where`**: Die Status-Kacheln zählten über alle Träger, während die Liste
darunter gefiltert war — die Zahlen widersprachen sich.

### Commit 4 — `98d0697` (Merge `c82ffec`): n8n darf weiter an die Dokumente

**Korrektur an Commit 3.** Dort wurde das n8n-Dienstkonto (`SERVICE`) **doppelt**
ausgeschlossen, ohne dass es auffiel:

1. **Über die Rolle:** `SERVICE` steht nicht in `HR_EDIT_ROLES` → 403. Die
   Handler hatten vorher gar keine Prüfung, n8n kam also durch.
2. **Über den Mandanten:** `canAccessProcess` fragt für Rollen außerhalb von
   `GLOBAL_ROLES` die Tabelle `UserOrgAssignment` ab. Für `n8n-service` steht
   dort nichts → 404, selbst wenn die Rolle gepasst hätte.

Dass der Weg gewollt ist, steht in denselben Dateien: Beide nehmen
`n8n-service` im Protokolleintrag ausdrücklich auf
(`userId: session.userId !== "n8n-service" ? session.userId : undefined`, beim
Upload und beim Löschen). Hausmuster dazu: `checklist/[itemId]` lässt `SERVICE`
zu und prüft den Mandanten **gar nicht**, `/api/employees` ebenso.

Jetzt `DOKUMENT_ROLLEN = [...HR_EDIT_ROLES, "SERVICE"]`, und die
Mandantenprüfung läuft nur für Benutzer-Sitzungen. `POST …/application` bleibt
HR-only: Dort schreibt der Protokolleintrag `userId` unbedingt, n8n wäre also
immer am Fremdschlüssel gescheitert (500) — **403 ist dort die ehrlichere
Antwort**, und ein Test hält das fest.

---

## 3. Was bewusst NICHT geändert wurde

Damit eine Durchsicht das nicht als Befund meldet:

| Nicht geändert | Warum |
|---|---|
| `GET /api/offboarding/[id]` bleibt `PORTAL_ROLES` | Die Ansicht ist zum Lesen gebaut (Abschnitt 2, Commit 2) |
| `notes` samt Urheber im Offboarding sichtbar | Ausdrückliche Entscheidung des Projektverantwortlichen vom 16.10.2026 |
| Die Beurteilung und die Art-9-Felder der Verbeamtung stehen weiter in der Antwort | Kein Feld-Sieb, weil die Route jetzt HR-only ist. **Die Rollenschranke ist dort das einzige Netz** — ein Test macht diese Abhängigkeit ausdrücklich sichtbar |
| `POST …/application` für `SERVICE` gesperrt | War nie benutzbar (FK-Verletzung → 500) |
| Die übrigen `credo-*`-Zustandsfarben der Ausstattung | CLAUDE.md duldet die alten Tokens bis zum Umbau des Moduls |
| Die Modulliste zeigt allen Rollen alle Module | **Offener Punkt, Anzeigefrage** — siehe Abschnitt 5 |

---

## 4. Die Tests, und wie sie geprüft sind

Sechs Testdateien, **jede gegen eine Scheinkorrektur geprüft**: Fix zurücknehmen
muss rot werden, und wo es passt auch die Variante „Schranke nur in der Antwort
statt in der Abfrage".

| Datei | Prüfungen | Ohne Fix fallen |
|---|---|---|
| `lib/abteilungs-link-schluessel.test.ts` | 6 | — (reine Funktion) |
| `api/offboarding-detail-zuschnitt.test.ts` | 12 | 5 |
| `api/onboarding-abteilungen.test.ts` (ergänzt) | 2 neu | 2 |
| `api/civil-service-detail.test.ts` | 8 | Teil von 22 |
| `api/civil-service-unterrouten-zugriff.test.ts` | 27 | Teil von 22; 2 beim Aussperren von n8n |
| `api/contract-end-detail.test.ts` (ergänzt) | 5 neu | 2 |

**Drei Regeln, die dabei gelernt wurden — wichtig für jede weitere Arbeit hier:**

1. **Eine Prisma-Attrappe muss `include`-treu sein**, sonst sichert ein Test nur
   die Abfrage und nicht die Antwort. **Vorsicht:**
   `api/offboarding-einstellung.test.ts` ignoriert `include` völlig (gibt die
   Vorgabezeile zurück), und `hilfen/abteilungs-fake-db.ts` ist
   include-**additiv** (klont die Zeile, löscht nichts). In beiden lässt sich
   „nicht abgefragt" nicht von „leer" unterscheiden — für solche Zusicherungen
   eine eigene Datei mit eigener Attrappe.
2. **Rollenlisten nie kopieren**, sondern per
   `jest.requireActual("@/lib/permissions")` die echten nehmen und `NICHT_HR`
   daraus ableiten. Sonst bleibt der Test grün, wenn jemand `HR_EDIT_ROLES`
   erweitert.
3. **Eine Funktion, die nur Felder wegnimmt, muss fehlende Teile tolerieren** —
   sonst macht sie aus 200 eine 500 für ALLE Rollen, auch die berechtigten.

---

## 5. Offen

| Punkt | Wo |
|---|---|
| **Modulreiter „Verbeamtung" für Nicht-HR ausblenden.** Die Modulliste zeigt allen Portal-Rollen alle Module; eine Führungskraft sieht jetzt einen Reiter mit Fehlermeldung. Anzeigefrage, keine Sicherheitsfrage | `(portal)/vorgaenge/[modul]/page.tsx` — existiert **nur auf `ux-umbau`** (U1), deshalb nicht in diesen Commits |
| Eine Leseansicht der Verbeamtung für Nicht-HR wäre eine **Produkt**entscheidung | Wer sie beauftragt, schneidet vorher Tokens, Beurteilung, IP und Art-9-Felder zu. Muster: `ohneVorgesetztenToken`, `ohneLinkSchluessel`. Hinweis steht als Kommentar an der Entscheidungsstelle in der Route |
| Die Liste der Verbeamtung nimmt weiter `include` ohne `select` | Heute durch die Rollenschranke gedeckt. Wer sie je für mandantenbeschränkte Rollen öffnet, schneidet sie vorher zu |
| Entscheidung „dürfen Einrichtungsleitung und Führungskraft **Vertragsende**-Vorgänge lesen?" | Steht seit 08.10.2026 offen, UX-Logbuch Abschnitt 0.2/3c |

---

## 6. So prüfst du den Stand nachvollziehbar

```bash
git log --oneline 5595cf7..origin/main
```

```bash
npm run pruefen
```

> **Achtung beim Prüfen:** Auf `main` fehlt noch die Jest-Korrektur, die
> `.claude/` ausschließt (sie liegt auf `ux-umbau`). Solange Arbeitskopien unter
> `.claude/worktrees/` liegen, nimmt `npm run pruefen` dort **1331 fremde
> Testdateien** mit und ist immer rot. Dann nach UX-Logbuch, Abschnitt 0.3
> prüfen: temporäre tsconfig ohne `.claude` und
> `npx jest --testPathIgnorePatterns ".claude"`.

Gemessener Stand am 16.10.2026: `tsc` grün, `next lint` ohne Befund,
**236 Suiten / 7207 Tests** auf `main` und **260 / 8301** auf `ux-umbau`.

---

## 7. Wie die Befunde gefunden wurden (für die nächste Durchsicht)

Keiner der drei ernsten Funde stand in dem, wonach gesucht wurde:

- Angefangen hat es als **Randnotiz** in der Durchsicht des UX-Pilots („der
  Reiter Protokoll zeigt die Audit-Einträge allen Portal-Rollen").
- Die **vier Routen ohne Prüfung** fand erst eine Durchsicht, die ausdrücklich
  alle Nachbarrouten des Moduls auflisten sollte.
- Der **n8n-Ausschluss** fand sich beim Nachtragen ins Logbuch, als der Satz
  „niemand verliert etwas" belegt werden sollte.

**Daraus zwei Arbeitsregeln:**

1. Bei einem Zugriffs-Befund **alle Routen des Moduls durchzählen** und je Datei
   die Prüfzeile lesen (`grep -L "includes(session.role)"` über den Modulordner).
   Die gemeldete Stelle war hier jedes Mal die harmloseste.
2. **`SERVICE` gehört ausdrücklich auf die Liste der zu prüfenden Aufrufer**,
   auch wenn es kein Mensch ist. Ein Blick in den Protokollcode derselben Datei
   verrät, ob das Dienstkonto dort vorgesehen war.

Zwei eigene Fehler wurden unterwegs berichtigt und sind hier festgehalten, damit
sie nicht als stilles Aufweichen erscheinen: Ein Kommentar behauptete ungeprüft
„die Verbeamtung hat keine Nicht-HR-Ansicht" (entfernt), und
`civil-service-detail.test.ts` sicherte vormittags `200` für Nicht-HR zu, also
das Gegenteil der späteren Entscheidung (umgeschrieben; der Dateikopf erzählt
beide Schritte).
