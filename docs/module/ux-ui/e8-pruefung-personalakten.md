# E8 — Prüfung auf dem Server: Sind Personalakten gefüllt?

**Stand 16.10.2026** · gehört zu Entscheidung **E8 (Personenseite, Paket U8)** im
[UX-Plan](ux-ui-plan-2026-09.html) und zum Logbuch [projekt-ux-umbau.md](projekt-ux-umbau.md),
Abschnitt 4

Der Plan macht U8 zur Auflage: **„Vorher prüfen, ob `Employee` in Produktion gefüllt ist."**
Von einem Entwicklerrechner ist die Produktionsdatenbank nicht erreichbar — diese Abfrage muss
auf dem Server laufen. Entschieden am 16.10.2026: **erst zählen, dann entscheiden.**

## Was die Abfrage tut

Sie **liest nur** und gibt **ausschließlich Zahlen** aus — keine Namen, keine Adressen, keine
Personalnummern, nichts, was eine Person erkennbar machte. Sie verändert nichts und kann
jederzeit laufen, auch im Betrieb (sie dauert Bruchteile einer Sekunde).

Drei Fragen beantwortet sie:

1. **Gibt es überhaupt Personalakten?** (`employees`, `employments`) — Wären es 0, liefe eine
   Personenseite ins Leere, und U8 setzte zuerst die LOGA-Anbindung voraus.
2. **Sind Vorgänge mit einer Personalakte verknüpft?** (`employeeId` je Modul) — Das zeigt, ob
   die Verknüpfung in der Praxis je benutzt wurde.
3. **Wie oft ist die Personalnummer am Vorgang gefüllt?** — Davon hängt ab, ob die vom Plan
   vorgeschlagene Zuordnung (erst Personalnummer, dann E-Mail + Geburtsdatum) trägt oder ob HR
   fast jede Zuordnung von Hand bestätigen müsste.

## Der Befehl

Auf dem Server (`fes-vm-ubuntudocker`, Pfad `/vol/container/HR_Portal_CREDO`) **in einem Stück**
einfügen und ausführen:

```bash
sudo docker exec -i hr-portal-db psql -U hrportal -d hr_portal -P pager=off <<'SQL'
SELECT 'Personalakten (employees)' AS was, count(*)::text AS zahl FROM employees
UNION ALL SELECT '  davon mit Personalnummer', count(*)::text FROM employees WHERE "personalNumber" IS NOT NULL AND "personalNumber" <> ''
UNION ALL SELECT 'Anstellungen (employments)', count(*)::text FROM employments
UNION ALL SELECT '--- Vorgaenge: verknuepft / gesamt ---', ''
UNION ALL SELECT 'Onboarding', count(*) FILTER (WHERE "employeeId" IS NOT NULL) || ' / ' || count(*) FROM onboarding_processes
UNION ALL SELECT 'Offboarding', count(*) FILTER (WHERE "employeeId" IS NOT NULL) || ' / ' || count(*) FROM offboarding_processes
UNION ALL SELECT 'Vertragsende', count(*) FILTER (WHERE "employeeId" IS NOT NULL) || ' / ' || count(*) FROM contract_end_processes
UNION ALL SELECT 'Verbeamtung', count(*) FILTER (WHERE "employeeId" IS NOT NULL) || ' / ' || count(*) FROM civil_service_processes
UNION ALL SELECT 'Mutterschutz', count(*) FILTER (WHERE "employeeId" IS NOT NULL) || ' / ' || count(*) FROM mutterschutz_prozesse
UNION ALL SELECT 'Elternzeit', count(*) FILTER (WHERE "employeeId" IS NOT NULL) || ' / ' || count(*) FROM elternzeit_prozesse
UNION ALL SELECT '--- Personalnummer am Vorgang: gefuellt / gesamt ---', ''
UNION ALL SELECT 'Offboarding', count(*) FILTER (WHERE "employeePersonalNr" IS NOT NULL AND "employeePersonalNr" <> '') || ' / ' || count(*) FROM offboarding_processes
UNION ALL SELECT 'Vertragsende', count(*) FILTER (WHERE "employeePersonalNr" IS NOT NULL AND "employeePersonalNr" <> '') || ' / ' || count(*) FROM contract_end_processes
UNION ALL SELECT 'Verbeamtung', count(*) FILTER (WHERE "employeePersonalNr" IS NOT NULL AND "employeePersonalNr" <> '') || ' / ' || count(*) FROM civil_service_processes
UNION ALL SELECT 'Mutterschutz', count(*) FILTER (WHERE "employeePersonalNr" IS NOT NULL AND "employeePersonalNr" <> '') || ' / ' || count(*) FROM mutterschutz_prozesse
UNION ALL SELECT 'Elternzeit', count(*) FILTER (WHERE "employeePersonalNr" IS NOT NULL AND "employeePersonalNr" <> '') || ' / ' || count(*) FROM elternzeit_prozesse;
SQL
```

Das Ergebnis ist eine Tabelle mit 16 Zeilen. **Die ganze Ausgabe darf gefahrlos in den Chat** —
sie enthält nur Zahlen.

Gegen die Entwicklungsdatenbank getestet (16.10.2026); dort kommt heraus: 0 Personalakten,
0 Anstellungen, kein Vorgang verknüpft, 1 von 17 Vertragsenden mit Personalnummer. Onboarding
fehlt in der unteren Tabelle, weil es **kein** Feld für die Personalnummer hat (nur
`employeeId`) — dort müsste die Zuordnung über E-Mail und Geburtsdatum aus dem Fragebogen laufen.

## Wie die Zahlen zu lesen sind

| Ergebnis | Was es bedeutet |
|---|---|
| Personalakten **0** | Erwartbar. Es gab nie eine Oberfläche dafür, nur die Schnittstelle `/api/employees`, die keine Seite aufruft. U8 braucht dann **zuerst** eine Quelle für Personen — das ist das LOGA-Paket L2. U8 allein wäre eine leere Seite. |
| Personalakten **> 0**, Vorgänge verknüpft | Jemand füllt die Tabelle (vermutlich ein n8n-Workflow). Dann lohnt U8 früher, und es ist zu klären, **wer** sie füllt und ob das so bleiben soll. |
| Personalnummer selten gefüllt | Stufe 1 der Zuordnung trägt nicht. HR müsste fast jede Zuordnung von Hand bestätigen — das ändert den Zuschnitt von U8 erheblich. |
| Personalnummer meist gefüllt | Die vom Plan vorgeschlagene Zuordnung trägt. |

## Was unabhängig vom Ergebnis gilt

- **Die Personalnummer sitzt im Modell falsch.** `Employee.personalNumber` ist je **Person**
  eindeutig; LOGA vergibt die Nummer je **Anstellung**. Für Menschen mit zwei Verträgen
  scheitert die Zuordnung deshalb am Modell, nicht an fehlenden Feldern. Das Paket **L2** der
  LOGA-Anbindung verschiebt sie an `Employment` — U8 und L2 gehören zusammen, so steht es auch
  im Plan.
- **Datenschutz-Kante:** `Employee` trägt fertige Beziehungen zu **BEM**, Mutterschutz und
  Elternzeit. BEM ist die versiegelte Akte und kennt **keinen** Rollen-Bypass — auch
  Administration sieht Inhalte nur mit Einzelfreigabe. Eine Personenseite darf über diese
  Beziehung nichts verraten, auch nicht die Tatsache, dass ein BEM-Fall besteht. Das ist beim
  Feinplan zu U8 ausdrücklich festzulegen.
