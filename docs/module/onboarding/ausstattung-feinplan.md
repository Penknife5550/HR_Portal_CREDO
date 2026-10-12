# Feinplan „Ausstattung & Zugänge“ – Pakete A1 bis A3

Stand: 12.10.2026, zweite Fassung nach geprüfter Mängelliste (26 Punkte, Umgang am Ende unter „Verworfene Einwände“) · Branch `feature/ausstattung-zugaenge` (auf `main` 8c1ef05 + Plan 6a1acc5)
Grundlage: [`ausstattung-zugaenge-plan.html`](ausstattung-zugaenge-plan.html) (Regeln 1–20, Datenmodell Stufe 1, Entscheidungen E-A1 bis E-A39, alle „wie empfohlen“) und `CLAUDE.md` im Arbeitsverzeichnis.

---

## 0. Zweck und Geltungsbereich

Dieser Feinplan macht den Plan baubar: Er legt fest, was der Plan technisch offenlässt (Abschnitt 1), schneidet die Arbeit in Schritte, die je ein Agent in einer Sitzung schafft (Abschnitt 2), und listet Vorlagen, Risiken und echte technische Restfragen (Abschnitte 3 bis 5). Die Regelnummern (R1 bis R20) beziehen sich auf Abschnitt 7 des Plans, die Entscheidungen (E-A…) auf die Abschnitte 12 und 13.

**Gebaut wird:** A1 (Katalog, Arbeitsort), A2 (Schritt im Modalitäten-Formular), A3 (Aufgaben, Karte, Mails, Nachtrag, Wächter, Sammelmail, Absage, Abschluss, Sperren, Webhook-Ausnahme, Löschlauf). Ausgeliefert wird alles zusammen (Empfehlung des Plans, Abschnitt 11). Nach dem Deploy ist der Katalog leer, also ändert sich für niemanden etwas, bis die Verwaltung Positionen einschaltet.

**Bewusst nicht gebaut:**

- **A0 (organisatorisch):** Gespräch mit dem DSB (Liste der Angaben, Löschfristen, Gesellschaften HELEX.IT/Objekt Service), Information der MAV, Katalogpflege (E-A38), Sammeln der Arbeitsort-Sonderfälle. Ohne Code. Gebaut werden darf vorher. **Eingeschaltet** wird der Katalog erst nach dem DSB-Gespräch (E-A15). Die Liste der Angaben (E-A13) steht als Konstante im Code und lässt sich nach dem Gespräch in einer Zeile ändern.
- **A4 (Stufe 2), nur Ausblick:** Tabelle `Ausgabe` je Stück, Übergabe vermerken, „Einstellung zuordnen …“ im Offboarding, Rücknahme- und Sperraufgaben, Rückgabezeilen, Übergabe- und Rückgabeprotokoll, Löschfristen der Ausgaben. Vorher muss die Rückgaben-Route (`/returns` gegen `/return-items`) repariert werden. Für A4 legt A1 nur die Snapshot-Spalten `ausgabeKennung`, `rueckgabeKategorie` und `beiAustritt` an (Plan, Abschnitt 8). Eine Oberfläche dafür gibt es in A1 bis A3 nicht. `betreffOhne` erhält `ausgabe_vermerk` erst mit A4.
- Außerdem nicht: Kennzahlen im Portal, Zustand „Problem gemeldet“ (E-A17, nach dem Pilot), Rückmeldung an die Führungskraft (E-A26), Katalogfeld „Vorlauf“ (E-A29), technische Kopplung an die DSB-Aufgabe (E-A28), Sammelbedarf zum Schuljahresbeginn, Dienstkleidung.
- **Handbuchseiten** (`docs/handbuch/`, Plan Abschnitt 11) gehören zur Einführung, nicht zu den Bauschritten. Der Abschnitt in `CLAUDE.md` ist dagegen Teil von S20.

---

## 1. Technische Festlegungen

### 1.1 Leitentscheidungen und Abweichungen vom Plan

| Nr. | Festlegung | Begründung | Abweichung vom Plan? |
|---|---|---|---|
| F1 | **Webhook-Ausnahme zentral** (E-A16): `triggerWebhooks` überspringt Schritt 2 (DB-Webhooks) für jedes Ereignis in `EVENTS_OHNE_WEBHOOK`. Die Onboarding-Abteilungsereignisse laufen weiter über `triggerWebhooks` und stehen in der Liste. `webhookAktiv(event)` im Versandkern liefert für diese Ereignisse `false`, damit gilt die WEBHOOK-Regel nur noch im Offboarding. | Gleiches Ergebnis wie ein direkter `sendEventEmail`-Aufruf (nur Mail, kein Webhook). Die Liste wird dabei vom bloßen Anzeigetext zur wirksamen Sperre und sichert auch künftige Aufrufer ab. Fünf Testdateien müssen ihren `@/lib/webhooks`-Mock nicht umbauen (Karte mail-laeufe, Abschnitt 9). | Ja, in der Form, nicht im Ergebnis. Der Plan sagt „wie beim Dokumentenpaket“ (direkter Aufruf). Die vier bestehenden Ausnahmen bleiben unverändert, sie rufen `triggerWebhooks` gar nicht auf. |
| F2 | **Gestrichene Aufgaben** (R9, E-A21) bekommen `ChecklistItem.entfaelltAm` und dazu `isCompleted = true`, `completedAt` und `completedById` (die HR-Kraft). | Damit behandelt jeder Zähler, der „entfällt“ nicht kennt (Linkstatus, Erinnerung, Fortschritt, Kandidaten des Laufs, Karte mail-abteilungsaufgaben Stolperstelle 7), sie als **nicht offen**. Fehlt einer Stelle das Wissen, kommt keine Erinnerung zu einer gestrichenen Position und der Link bleibt nicht ewig offen. Der Gegenentwurf (offen lassen, überall filtern) hätte rund zehn Stellen im gemeinsamen Kern geändert, und jede vergessene hätte Erinnerungen zu Gestrichenem ausgelöst. Die Anzeige liest `entfaelltAm` und schreibt „entfällt“ statt „erledigt“. Abhaken über Link und Portal liefert für solche Aufgaben 409. **Jede Zählung** (Kopfzeile X/Y, Fortschrittsbalken, „alle erledigt“, Stepper, Reiter-Badge, PDF, Link-Seite, `progress` des Portal-PATCH) läuft über die reine Hilfe `checklistFortschritt` (1.3): Entfallene zählen weder im Zähler noch im Nenner. Sonst stünde „6/6 erledigt“, obwohl zwei davon gestrichen sind, und Badge, Balken und Link-Seite zeigten verschiedene Zahlen. Auswertungen über `completedAt` (Pilot-Kennzahl „Bereitstellung zum Dienstbeginn“) filtern `entfaelltAm IS NULL`. | Ergänzung (der Plan nennt nur `OnboardingAusstattung.gestrichenAm`, das bleibt für die ganze Position). |
| F3 | **`ChecklistItem.herkunft`** (`null` = Vorlage, `"AUSSTATTUNG"`, `"HINWEIS"`) und **`ChecklistItem.eilt`** als flache Spalten. | Sperren im Portal-PATCH, Abschluss-Rückfrage, Sammelmail, Fälligkeit und Erinnerungsstufe erkennen Ausstattungsaufgaben ohne Relationsfilter. Die In-Memory-Fake-DB kann Relationsfilter nicht und wirft bei ihnen. „Eilt“ ist eine Eigenschaft der Fälligkeit und wird einmal gesetzt (R14). Wo „Eilt“ gespeichert wird, war offen (Karte abteilungsaufgaben, O:166). | Ergänzung |
| F4 | **Anspruch beim Anlegen der Aufgaben über die Vorgangssperre plus Primärschlüssel** statt `WHERE checklistItemId IS NULL` (R6). | Im Datenmodell ist `OnboardingAusstattungAufgabe.checklistItemId` Pflicht, es gibt also keine leere Zeile zum Beanspruchen. Jeder Anleger sperrt zuerst den Vorgang (`updateMany` auf `onboarding_processes`). Damit laufen zwei Anleger nacheinander, der zweite findet die Zeilen des ersten. Doppelte Anlage fängt `@@id([ausstattungId, option])` ab (P2002, die Transaktion rollt zurück, der Fehler wird geloggt, nachgeholt wird später). Für `OnboardingStellenHinweis` (Spalte nullable) bleibt das bedingte `updateMany … checklistItemId: null`. | Ja (Mechanik) |
| F5 | **Sperrreihenfolge beim Anlegen:** Vorgang → Links (`linksSperrenIn`) → Aufgaben anlegen → Verknüpfung → `faelligkeitenSetzen` → `linkStatusNeuBerechnenIn`. | R12 und Hausregel. Der Plan nennt in R6 „anlegen → faelligkeitenSetzen → linkStatusNeuBerechnenIn“. Die Links müssten dort nach den Aufgaben gesperrt werden, entgegen der Reihenfolge im öffentlichen PATCH (Link → Aufgabe) mit Gefahr einer Verklemmung. | Präzisierung |
| F6 | **Schreibwege der HR-Karte nehmen die prozesslokale Versandsperre** (`versandSperreNehmen`, belegt → 409 „Gerade läuft ein Versand …“). | Sonst gibt es einen Wettlauf zwischen „Informieren“ und einer HR-Änderung: `informieren` liest den Kontext und schreibt `sentAt` erst nach dem Versand, ohne Transaktion. Eine dazwischen ergänzte Position käme weder in die Mail noch in die Änderungsliste (Karte abteilungsaufgaben, Stolperstelle 8). Es entsteht keine neue Sperre, die vorhandene wird mitgenutzt (Plan: „keine neue prozesslokale Sperre“). | Präzisierung |
| F7 | **Änderungen gehen in jede Zuweisungsmail**, nicht nur in den Nachtrag. „Erneut senden“, „Link erneuern“ und die Mail mit neuem Link nach Adresswechsel nehmen offene Einträge der Änderungsliste mit. Bei SENT werden genau diese Einträge als gesendet markiert. | Sonst bliebe nach „Erneut senden“ ein Nachtrag stehen, dessen Inhalt die Stelle schon hat. Der Nachtrag selbst ist eine Zuweisungsmail im Modus `NACHTRAG` (gleicher Token). | Präzisierung von R10 |
| F8 | **Vorauswahl je Option:** `AusstattungsPosition.vorausgewaehlteOptionen String[]` neben `vorausgewaehlt Boolean`. | Mockup 6.7 zeigt „Dienst-E-Mail“ als vorausgewählte **Option** einer Auswahl-Position. Ein Boolean je Position kann das nicht ausdrücken. | Ergänzung |
| F9 | **`SupervisorData.ausstattungGespeichertAm`** entscheidet, ob die Vorauswahl angewendet wird (nur solange `null`). | „Keine Wahl gespeichert“ wäre sonst mehrdeutig: nie gesehen oder bewusst alles abgewählt. `currentStep` taugt nicht dafür, er kann über die Schrittpillen sinken (Karte modalitaeten, Abschnitt 4). | Ergänzung |
| F10 | **`AusstattungsPosition.entgeltrelevant Boolean`** und dazu die Regel: Ist das Feld gesetzt, muss die Stelle HR sein (400). | E-A24 verlangt die Einschränkung. Ohne Merkmal kann der Code sie nicht prüfen. Die Angabe macht die Admin-Rolle selbst. | Ergänzung |
| F11 | **`AusstattungsPosition.vorschlagSchluessel String? @unique`**. „Vorschläge übernehmen“ legt per `createMany({ skipDuplicates: true })` an. | Macht den Doppelklick und zwei Tabs atomar unschädlich. Ein Unique-Index über `(organizationId, …)` fängt NULL nicht ab (Karte einstellungen-infra, Stolperstelle 2). | Ergänzung |
| F12 | **`OnboardingProcess.expiredAt`** (gesetzt im Status-PATCH bei EXPIRED) und **`OnboardingProcess.ausstattungSammelmailAm`** (Merker der Sammelmail). | Die Löschfrist (E-A22) braucht den Zeitpunkt des Abbruchs. EXPIRED setzt heute keinen, und das AuditLog wird aufgeräumt. Die Sammelmail braucht einen Merker je Vorgang, weil `tagErledigt` nur den Zeitplan schützt („Jetzt ausführen“ und die Route laufen sonst doppelt). | Ergänzung |
| F13 | **`OffboardingDepartmentLink.abgesagtAm`** (gemeinsame Tabelle, nur im Onboarding gesetzt). | Merker „Absage gesendet“. Die Karte bietet die Absage danach nicht mehr an, ein zweiter Klick schickt nichts doppelt. | Ergänzung |
| F14 | **Arbeitsort als echte Relation** `OnboardingProcess.arbeitsort` (benannt `"OnboardingArbeitsort"`), die bestehende Relation wird `"OnboardingEinrichtung"` benannt. | Referenzielle Integrität, `include` des Namens und der Einrichtungsart. Relationsnamen gibt es nur in Prisma, die Datenbank sieht sie nicht (FK-Name bleibt `onboarding_processes_organizationId_fkey`). Das prüft S1 mit `prisma migrate diff`. | Präzisierung („Skalar“ im Plan) |
| F15 | **Mailfeld `arbeitsort`** (Name, nur gefüllt, wenn er von der Einrichtung abweicht, sonst `""`) in `onboardingAbteilungsMailFelder` und auf der Link-Seite. | Sonst steht in der Mail an den Hausmeister der Grundschule „in Förderverein Minden“. Der Schlüssel ist immer vorhanden, damit die Payload ihre Form behält (Positivliste). | Ergänzung |
| F16 | **Absage an `link.email`** (die Adresse, die informiert wurde), nicht an die heute aufgelöste. | Die Absage richtet sich an die Stelle, die die Aufgaben bekommen hat. | Präzisierung |
| F17 | **Absage-Mail nennt alle erledigten Aufgaben der Stelle** (Vorlage und Ausstattung, nicht entfallene). | Ein von der Vorlage stammender „IT-Zugang einrichten“ muss bei einer Absage genauso zurückgebaut werden wie ein gewählter Zugang. | Auslegung von E-A20 („erledigte Positionen“) |
| F18 | **`onboarding-ausstattung-offen` und `onboarding-department-abgesagt` stehen ebenfalls in `EVENTS_OHNE_WEBHOOK`.** | Grundsatz: Alles, was Ausstattungsinhalte (Titel, Stelle, Name) trägt, geht nicht an Webhooks. n8n wird dafür nicht gebraucht (E-A16). | Präzisierung (Karte mail-laeufe: „offen“) |
| F19 | **Betreff-Sperren über R17 hinaus:** `onboarding-task-completed` sperrt zusätzlich `kommentar` und `kommentar_text`. | Seit E-A17 kann die Mail allein wegen eines Kommentars hinausgehen, der Kommentar ist Freitext der Stelle, und Betreffzeilen stehen 90 Tage im `EmailLog`. | Ergänzung |
| F20 | **Aufgabe „Hinweis der Führungskraft beachten“** bekommt `relativeDueDays = -7`. | Ohne Fälligkeit bekäme eine Stelle, die nur einen Hinweis hat, nie eine Erinnerung, und der Wächter griffe nicht. −7 entspricht dem Vorlauf der übrigen Bereitstellung. Die Fälligkeit ändert HR in der Karte über `hinweis-aendern` mit `dueDate` (1.4); der Portal-PATCH bleibt für sie gesperrt wie für jede Aufgabe mit `herkunft`. | Festlegung |
| F21 | **Der Modalitäten-PUT kappt `currentStep`** auf die Länge der Schrittliste minus 1, statt mit 400 abzuweisen. | Bestehende Clients schicken nie mehr. Ein 400 brächte ein laufendes Formular nur ins Stolpern. | Festlegung (Plan: „optional“) |
| F22 | **Fälligkeit beim Versand anheben** (R14). Jede Zuweisungsmail an eine Stelle (Informieren, Erneut senden, Link erneuern, Nachtrag; nicht „Erinnern“) hebt vorher in derselben Transaktion wie das Nachholen (1.7, Schritt 7) jede offene, nicht entfallene Ausstattungs- und Hinweis-Aufgabe dieser Stelle, die die Stelle noch mit keiner Mail bekommen hat und deren `dueDate` vor dem Berliner Kalendertag des Versands liegt, auf diesen Tag an und setzt `eilt`. „Noch nicht bekommen“ heißt `createdAt > (link.lastSentAt ?? link.sentAt)`, ohne Versand also jede. | `ausstattungsFaelligkeit` rechnet beim Anlegen mit `jetzt` der Abgabe. Informiert HR eine Woche später, wären die Aufgaben beim ersten Versand schon überfällig, ohne „Eilt“, und die erste Erinnerung könnte eine Eskalation sein – genau das soll R14 verhindern. Bei einer schon zugestellten Aufgabe bleibt die Frist, sonst setzte „Erneut senden“ eine überfällige Aufgabe still auf „heute“ zurück. `zuweisungSenden` schreibt den Link ohne Transaktion; die Anhebung sitzt deshalb im Onboarding-Adapter vor dem Versand (O:285), nicht beim Link. Scheitert die Mail, bleibt die Anhebung stehen; der nächste Versand hebt erneut an. | Präzisierung von R14 |
| F23 | **Wiederaufnahme statt Neuanlage.** Wird eine abgewählte Option, eine gestrichene Position oder ein geleerter Hinweis wieder gewählt bzw. gefüllt, öffnet die Karte die vorhandene entfallene Aufgabe wieder (`entfaelltAm`, `isCompleted`, `completedAt`, `completedById` zurück, Eintrag NEU), statt eine zweite anzulegen. | Die Verknüpfung `(ausstattungId, option)` ist Primärschlüssel bzw. `checklistItemId` beim Hinweis gesetzt; das Nachholen fände die Verknüpfung vor und legte nichts an, die Stelle bekäme die wieder gewählte Position also nie. | Ergänzung zu R9 |

### 1.2 Datenmodell Stufe 1 (`prisma/schema.prisma`, nur additiv)

Zustände sind Zeichenketten mit der Wertliste im Kommentar. Ein Test hält jeden Kommentar gegen die Konstante in `src/lib/ausstattung.ts` (Muster `unterlagen.test.ts:219–227`). `String[]` immer mit `@default([])`.

```prisma
// ---------- Katalog (A1) ----------
// art: "JA_NEIN" | "AUSWAHL" | "ANGABE"
model AusstattungsPosition {
  id                      String        @id @default(uuid())
  departmentKey           String        // Stelle; nie MITARBEITER/VORGESETZTER
  organizationId          String?       // null = zentral
  organization            Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  einrichtungsarten       String[]      @default([]) // OrganizationType-Werte; nur zentral; leer = alle
  art                     String
  angabeSchluessel        String?       // nur ANGABE: Schluessel aus ANGABEN_KATALOG (E-A13)
  bezeichnung             String        // max. 120; bei ANGABE = Label aus ANGABEN_KATALOG
  hinweisFuehrungskraft   String?       // max. 300, nur im Formular
  hinweisStelle           String?       // max. 500, wird ChecklistItem.description
  optionen                String[]      @default([]) // nur AUSWAHL: 1..40, je max. 80
  vorausgewaehlt          Boolean       @default(false) // nur JA_NEIN
  vorausgewaehlteOptionen String[]      @default([])    // nur AUSWAHL, Teilmenge von optionen (F8)
  bemerkungAnbieten       Boolean       @default(true)
  bemerkungPlatzhalter    String?       // max. 120
  aufgabeTitel            String?       // max. 120; Standard "<Bezeichnung> bereitstellen"
  defaultDueDays          Int?          // relativ zum Vertragsbeginn; bei ANGABE immer null
  personengruppen         String[]      @default([]) // QuestionnaireType-Werte; leer = alle
  sichtbarFuer            String[]      @default([]) // nur ANGABE: weitere Stellen
  entgeltrelevant         Boolean       @default(false) // F10: dann nur Stelle HR
  ausgabeKennung          String?       // A4
  rueckgabeKategorie      String?       // A4: ReturnCategory-Wert
  beiAustritt             String?       // A4: "RUECKGABE" | "SPERREN" | "NICHTS"
  vorschlagSchluessel     String?       @unique // F11
  isActive                Boolean       @default(false) // neu = aus
  orderIndex              Int           @default(0)
  createdAt               DateTime      @default(now())
  updatedAt               DateTime      @updatedAt

  ausblendungen AusstattungsAusblendung[]
  auswahlen     OnboardingAusstattung[]

  @@index([organizationId])
  @@index([departmentKey])
  @@map("ausstattungs_positionen")
}

model AusstattungsAusblendung { // Einrichtung blendet ZENTRALE Position aus
  positionId     String
  position       AusstattungsPosition @relation(fields: [positionId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime             @default(now())

  @@id([positionId, organizationId])
  @@map("ausstattungs_ausblendungen")
}

// ---------- Je Vorgang (A2/A3) ----------
// quelle: "FUEHRUNGSKRAFT" | "HR"; bemerkungQuelle: "FUEHRUNGSKRAFT" | "HR" | "BEIDE"
model OnboardingAusstattung {
  id                 String                @id @default(uuid())
  onboardingId       String
  onboarding         OnboardingProcess     @relation(fields: [onboardingId], references: [id], onDelete: Cascade)
  positionId         String?               // null = freie Position von HR
  position           AusstattungsPosition? @relation(fields: [positionId], references: [id], onDelete: SetNull)
  // --- Momentaufnahme (R4) ---
  departmentKey      String
  art                String
  angabeSchluessel   String?
  bezeichnung        String
  aufgabeTitel       String
  hinweisStelle      String?
  relativeDueDays    Int?
  sichtbarFuer       String[]              @default([])
  ausgabeKennung     String?
  rueckgabeKategorie String?
  beiAustritt        String?
  reihenfolge        Int                   @default(0) // orderIndex der Position beim Speichern
  // --- Wahl ---
  auswahl            String[]              @default([]) // AUSWAHL: je Option eine Aufgabe (E-A12)
  angabe             String?               // ANGABE, max. 300
  bemerkung          String?               // max. 500
  bemerkungQuelle    String?
  quelle             String
  erfasstVonId       String?               // HR-Konto bei quelle HR (kein FK, Anzeige ueber Lookup)
  gestrichenAm       DateTime?             // R9: ganze Position nach der Information gestrichen
  inhaltGeleertAm    DateTime?             // E-A22
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  aufgaben OnboardingAusstattungAufgabe[]

  @@unique([onboardingId, positionId])
  @@index([onboardingId])
  @@map("onboarding_ausstattung")
}

model OnboardingAusstattungAufgabe { // eine Aufgabe je Position bzw. je Option
  ausstattungId   String
  ausstattung     OnboardingAusstattung @relation(fields: [ausstattungId], references: [id], onDelete: Cascade)
  option          String                @default("") // "" = ganze Position
  checklistItemId String                @unique
  checklistItem   ChecklistItem         @relation(fields: [checklistItemId], references: [id], onDelete: Cascade)
  createdAt       DateTime              @default(now())

  @@id([ausstattungId, option])
  @@map("onboarding_ausstattung_aufgaben")
}

model OnboardingStellenHinweis { // "Weitere Hinweise an die IT"
  onboardingId    String
  onboarding      OnboardingProcess @relation(fields: [onboardingId], references: [id], onDelete: Cascade)
  departmentKey   String
  text            String            // max. 1000; "" nach Leerung (E-A22) oder Entfernen durch HR
  quelle          String            // "FUEHRUNGSKRAFT" | "HR" (von HR neu angelegt) | "BEIDE" (FK-Text, von HR geaendert)
  checklistItemId String?           @unique
  checklistItem   ChecklistItem?    @relation(fields: [checklistItemId], references: [id], onDelete: SetNull)
  gesehenAm       DateTime?
  inhaltGeleertAm DateTime?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@id([onboardingId, departmentKey])
  @@map("onboarding_stellen_hinweise")
}

// art: "NEU" | "GEAENDERT" | "ENTFAELLT"
model OnboardingAusstattungAenderung { // Nachtragsliste je Stelle (R10)
  id            String            @id @default(uuid())
  onboardingId  String
  onboarding    OnboardingProcess @relation(fields: [onboardingId], references: [id], onDelete: Cascade)
  departmentKey String
  art           String
  titel         String            // nur Katalog-/Aufgabentitel, nie Freitext
  erfasstAm     DateTime          @default(now())
  gesendetAm    DateTime?         // bei SENT der Zuweisungsmail (F7)

  @@index([onboardingId, departmentKey, gesendetAm])
  @@map("onboarding_ausstattung_aenderungen")
}
```

**Ergänzungen bestehender Modelle**

| Modell | Neu | Hinweis |
|---|---|---|
| `Organization` | `onboardings OnboardingProcess[] @relation("OnboardingEinrichtung")` (nur benannt), `onboardingArbeitsorte OnboardingProcess[] @relation("OnboardingArbeitsort")`, `ausstattungsPositionen AusstattungsPosition[]`, `ausstattungsAusblendungen AusstattungsAusblendung[]` | `_count.onboardings` in `api/organizations/route.ts:60` bleibt gültig |
| `OnboardingProcess` | `organization … @relation("OnboardingEinrichtung", …)`; `arbeitsortId String?` + `arbeitsort Organization? @relation("OnboardingArbeitsort", fields: [arbeitsortId], references: [id], onDelete: SetNull)` + `@@index([arbeitsortId])`; `expiredAt DateTime?`; `ausstattungSammelmailAm DateTime?`; Rückrelationen `ausstattung`, `stellenHinweise`, `ausstattungAenderungen` | `arbeitsortId = null` heißt Einrichtung des Vorgangs. Gespeichert wird `null`, wenn der Arbeitsort gleich der Einrichtung ist. |
| `SupervisorData` | `mitAusstattung Boolean?` (R2), `ausstattungGespeichertAm DateTime?` (F9) | Bestand per Migration `false` |
| `ChecklistItem` | `herkunft String?` (F3, `"AUSSTATTUNG"` \| `"HINWEIS"`), `eilt Boolean @default(false)` (R14), `entfaelltAm DateTime?` (F2), Rückrelationen `ausstattungAufgabe OnboardingAusstattungAufgabe?`, `stellenHinweis OnboardingStellenHinweis?` | `eilt` ist NOT NULL mit Konstante: Postgres ergänzt ohne Umschreiben der Tabelle |
| `OffboardingDepartmentLink` | `abgesagtAm DateTime?` (F13) | nur Onboarding-Zeilen |

### 1.3 Reine Regeln: `src/lib/ausstattung.ts` (client-sicher, ohne Uhr, ohne Prisma-Import)

Konstanten:

- `AUSSTATTUNG_ARTEN`, `AUSSTATTUNG_QUELLEN`, `BEMERKUNG_QUELLEN`, `AENDERUNGS_ARTEN`, `AUFGABEN_HERKUNFT`, `BEI_AUSTRITT` (A4) sowie `AUSSTATTUNG_KATEGORIE = "Ausstattung & Zugänge"`.
- `GRENZEN`: bezeichnung 120, hinweisFuehrungskraft 300, hinweisStelle 500, option 80, optionen 40, bemerkungPlatzhalter 120, aufgabeTitel 120, bemerkung 500, angabe 300, hinweis 1000, freieBezeichnung 120, wahlJeVorgang 200, hinweiseJeVorgang 30, faelligTage ±365.
- `NICHT_ERLAUBTE_STELLEN = ["MITARBEITER", "VORGESETZTER"]` (R11).
- `PERSONENGRUPPEN`: QuestionnaireType → Label: STANDARD „Angestellte“, BEAMTE „Beamte“, ERZIEHER „Kita-Personal“, MINIJOB „Minijob“, EHRENAMT „Ehrenamt“.
- `EINRICHTUNGSARTEN`: OrganizationType → Label (Gymnasium, Gesamtschule, Grundschule, Berufskolleg, Kita, Verwaltung, GmbH, Verein). Ein Test hält beide Tabellen gegen die Enums des generierten Clients: `import { $Enums } from "@prisma/client"` und `Object.keys(PERSONENGRUPPEN).sort()` gegen `Object.values($Enums.QuestionnaireType).sort()` (ebenso `OrganizationType`). `$Enums` ist ein eigener Export, **nicht** Teil des Namespace `Prisma` (`Prisma.$Enums` wäre ein tsc-Fehler). Nur im Test importiert.
- **`ANGABEN_KATALOG` (E-A13), die feste Liste:**

| Schlüssel | Label | Platzhalter | Hilfe unter dem Feld | max. |
|---|---|---|---|---|
| `UNTERRICHTSFAECHER` | Unterrichtsfächer | z. B. Chemie, Sport | Hilft bei der Zuordnung von Fachräumen. | 200 |
| `DURCHWAHL` | Gewünschte Durchwahl | z. B. 214 | — | 30 |
| `ARBEITSPLATZ_RAUM` | Raum des Arbeitsplatzes | z. B. Lehrerzimmer, Büro 2.14 | — | 100 |

  Eine Erweiterung ist eine Code-Änderung. Nach dem DSB-Gespräch (A0) die Liste bestätigen und das Fach Religion einmal ansprechen (Plan, Abschnitt 10).
- `BEMERKUNG_HINWEIS` (Wortlaut Plan, Abschnitt 10). Er steht unter jedem Bemerkungs- und Hinweisfeld, im Formular wie im HR-Dialog.
- `FREITEXT_AUFBEWAHRUNG_MONATE = 6`, `HINWEIS_AUFGABE_TITEL = "Hinweis der Führungskraft beachten"`, `HINWEIS_AUFGABE_BESCHREIBUNG = "Den Hinweis der Führungskraft finden Sie auf Ihrer Aufgabenseite."` (ortsneutral: Erinnerung und Sammelmail tragen den Hinweis bewusst nicht, ein „siehe oben“ liefe dort ins Leere), `HINWEIS_FAELLIG_TAGE = -7` (F20), `WAECHTER_TAGE = 7`.
- `ORDER_BASIS = -100000`. Ausstattungsaufgaben bekommen `orderIndex = ORDER_BASIS + reihenfolge * 100 + optionIndex`, Hinweis-Aufgaben `-1000 + Index der Stelle`. Alle Vorlagenpunkte haben einen `orderIndex` ab 0, deshalb steht die Kategorie im Reiter, auf der Link-Seite und im PDF oben.
- `VORSCHLAEGE` (Plan, Abschnitt 5, „Vorschlag für den Anfangsbestand“, plus BYOD nach E-A39). Jeder Eintrag hat einen festen `vorschlagSchluessel` (z. B. `IT_IPAD`). Alle sind zentral und ausgeschaltet.
  - **IT**
    - JA_NEIN: Dienst-Laptop/PC, Dienst-iPad (Lernmittel), Telefon mit Durchwahl, Private Endgeräte (BYOD) freischalten
    - AUSWAHL: „Zugänge“ mit Dienst-E-Mail, Schulportal, WebUntis, Schulverwaltung, Drucker-PIN; vorausgewählt Dienst-E-Mail; Aufgabentitel „Zugang einrichten“; Hinweis für die Stelle „Erst nach Verpflichtung auf Vertraulichkeit freischalten.“ (E-A28)
    - ANGABE: DURCHWAHL
  - **FACILITY**
    - JA_NEIN: Transponder/Chip, Parkplatz, Spind
    - AUSWAHL: „Schlüssel“ mit Haupteingang und Lehrerzimmer; Aufgabentitel „Schlüssel ausgeben“; Hinweis für die Führungskraft „Weitere Räume bitte in der Bemerkung nennen.“ (er steht im Formular unter der Position und richtet sich deshalb an die Führungskraft). Die Pflegeanweisung „Räume einer Einrichtung bitte als eigene Position dieser Einrichtung anlegen.“ steht als `pflegeHinweis` des Vorschlags nur in der Vorschau von „Vorschläge übernehmen“; sie ist kein Katalogfeld und wird nie geschrieben (Review A1, 12.10.2026).
    - ANGABE: UNTERRICHTSFAECHER, `sichtbarFuer: ["IT"]`
  - **VERWALTUNG**
    - JA_NEIN: Fach im Lehrerzimmer, Kopierkarte, Türschild, Dienstausweis
- `MELDUNGEN` (alle Texte der Routen und der Karte), `AUSSTATTUNG_AUDIT` / `AUSSTATTUNG_AUDIT_LABELS` (Abschnitt 1.9).

Funktionen (Signaturen verbindlich, Namen ohne Umlaute):

| Funktion | Zweck | Regel |
|---|---|---|
| `positionPruefen(p: PositionEntwurf): string \| null` | Prüft die Felder einer Katalogposition gegeneinander, Client und Server nutzen sie gleich. Stelle nicht in `NICHT_ERLAUBTE_STELLEN`. `entgeltrelevant` verlangt HR. AUSWAHL verlangt 1..40 eindeutige, getrimmte Optionen, `vorausgewaehlteOptionen` ist Teilmenge davon. Optionen gibt es nur bei AUSWAHL, `vorausgewaehlt` nur bei JA_NEIN. ANGABE verlangt einen `angabeSchluessel` aus dem Katalog; `defaultDueDays`, Optionen, Bemerkung und `aufgabeTitel` sind dort leer. `sichtbarFuer` nur bei ANGABE, ohne die eigene Stelle. `einrichtungsarten` nur bei zentralen Positionen. | R11, E-A13, E-A24 |
| `positionGiltAm(p, ort: { arbeitsortId; einrichtungsart }, ausblendungen): boolean` | Eigene Position des Arbeitsorts **oder** zentrale Position mit passender Einrichtungsart, die für den Arbeitsort nicht ausgeblendet ist | Plan Abschnitt 5 |
| `positionenFuer(katalog, ctx: { arbeitsortId; einrichtungsart; questionnaireType; processType; ausblendungen; adresseVorhanden: (key) => boolean }): Position[]` | Liefert die aktiven Positionen, die am Arbeitsort gelten. Bedingungen: `processType === "EINSTELLUNG"`, Personengruppe passt, Stelle ist HR **oder** `adresseVorhanden(key)`. Sortiert nach `abteilungsReihenfolge`, dann `orderIndex`, dann `bezeichnung`. | R1 |
| `formularGruppen(positionen, stellenNamen): FormularGruppe[]` | Die Katalogsicht der Führungskraft, gruppiert nach Stelle. Die Felder `hinweisStelle`, `ausgabeKennung`, `entgeltrelevant` und `vorschlagSchluessel` werden entfernt. | R7 |
| `adressLuecken(positionen, einrichtungen, konfigs): Luecke[]` | Aktive Position mal Einrichtung, an der sie gilt, deren Stelle (ohne HR) per `empfaengerAufloesen` keine Adresse hat | R11 |
| `aehnlicheVorlagenpunkte(positionen, vorlagenpunkte): Treffer[]` | Vorlagenpunkt mit derselben Stelle (`defaultAssignee`), dessen Titel ein Wort mit mindestens 4 Zeichen aus Bezeichnung oder Option enthält (ohne Groß- und Kleinschreibung). Verglichen wird Wort für Wort, nicht als Teilzeichenkette des Titels: dasselbe Wort, gebeugt („Schlüssels“) oder als Teil eines zusammengesetzten Worts, dessen Rest selbst mindestens 4 Zeichen hat („Schulportalzugang“, „Postfach“); Ableitungen („dienstliche“, „telefonisch“) und kurze Reste („Dienstag“) zählen nicht (Review A1: „Dienst-Laptop/PC“ traf sonst „Benutzerkonto und dienstliche E-Mail-Adresse anlegen“) | Mockup 6.3 |
| `aufgabenTitel(zeile, option): string` | `aufgabeTitel` bzw. „`<Bezeichnung>` bereitstellen“, bei AUSWAHL dahinter „: `<Option>`“. Nie Freitext. | R4, R17 |
| `sollAufgaben(zeile): { option; titel; orderIndex; relativeDueDays; description }[]` | JA_NEIN: eine Aufgabe mit `option ""`. AUSWAHL: eine je gewählter Option. ANGABE und gestrichene Zeilen: keine. | E-A12 |
| `ausstattungsFaelligkeit(beginn, tage, jetzt): { dueDate: Date; eilt: boolean } \| null` | `dueDate = max(faelligkeitAus(beginn, tage), faelligkeitAus(jetzt, 0))`; `eilt` ist gesetzt, wenn das erste kleiner ist. Gilt beim Anlegen; beim Versand hebt F22 noch einmal an. | R14 |
| `anzuhebendeAufgaben(aufgaben: { id; dueDate; createdAt; isCompleted; entfaelltAm }[], letzterVersand: Date \| null, jetzt): string[]` | IDs der offenen, nicht entfallenen Aufgaben mit `createdAt > letzterVersand` (bei `null` alle) und `dueDate < faelligkeitAus(jetzt, 0)`. Aufgaben ohne Fälligkeit bleiben ohne. | F22 |
| `checklistFortschritt(items: { isCompleted; entfaelltAm? }[]): { gesamt; erledigt; prozent; alleErledigt }` | Entfallene zählen weder in `gesamt` noch in `erledigt`; `alleErledigt` nur bei `gesamt > 0`. Einzige Rechnung für Portal, Stepper, PDF, Link-Seite und Portal-PATCH. | F2 |
| `vorlaufWarnung(tage, beginn, jetzt): string \| null` | „bis Dienstbeginn voraussichtlich nicht verfügbar – Übergangslösung klären“ | R14 |
| `bemerkungLabel(quelle): string` | „Bemerkung der Führungskraft“ / „… der Personalabteilung“ / „… der Führungskraft, ergänzt durch die Personalabteilung“ | R8 |
| `bemerkungQuelleNach(alt, schreiber: "FUEHRUNGSKRAFT" \| "HR")` | FK-Text, den HR ändert, wird `BEIDE`; ein neuer Text von HR wird `HR` | R8 |
| `angabenFuer(departmentKey, zeilen, hinweise): { angaben: { label; wert }[]; hinweis: string \| null }` | Eigene Angaben und Angaben aus `sichtbarFuer` (nicht gestrichen, nicht leer, nicht geleert), dazu der Hinweis an die eigene Stelle | R7 |
| `angabenMailFelder(a): { angaben; angaben_html }` | Klartext in Zeilen. HTML als fertige Tabellenzeilen im Stil des Infokastens, Werte mit `escapeHtml`. Beide `""`, wenn leer. | R7 |
| `aenderungsEintraege(vorher, nachher, informiert: Set<string>): Eintrag[]` | Liefert NEU, GEAENDERT, ENTFAELLT für informierte Stellen. Es zählen nur Inhaltsfelder (Titel/Auswahl, Bemerkung, Angabe, Hinweis, Stelle); bei einem Stellenwechsel ENTFAELLT für die alte und NEU für die neue Stelle. | R10 |
| `nachtragListe(eintraege): { neu: string[]; geaendert: string[]; entfaellt: string[] }` | Fasst je Titel zusammen: NEU+ENTFAELLT fällt weg, NEU+GEAENDERT wird NEU, GEAENDERT+ENTFAELLT wird ENTFAELLT | R10 |
| `nachtragMailFelder(liste): { nachtrag; nachtrag_liste; nachtrag_liste_html }` | Merker `"ja"`/`""`. Flache Zeilen „Neu: …“, „Geändert: …“, „Entfällt: …“, keine verschachtelten Blöcke (Karte mail-laeufe, Stolperstelle 1) | R10 |
| `aenderungPruefen(zeile, aufgaben, aenderung): Grund \| null` | Regel 9 für Auswahl-Positionen ausgelegt: Eine Option mit erledigter Aufgabe lässt sich nicht abwählen; Stellenwechsel und Streichen der ganzen Position nur, wenn keine Aufgabe erledigt ist; Bemerkung ändern nur, wenn mindestens eine Aufgabe offen ist oder die Zeile keine Aufgaben hat (ANGABE); Optionen hinzufügen geht immer. Entfallene Aufgaben zählen nie als erledigt. | R9 |
| `hinweisAenderungPruefen(hinweis, aufgabe, aenderung): Grund \| null` | Regel 9 auf Hinweise übertragen (1.10, „Hinweis-Aufgabe“): Text ändern oder entfernen nur, solange die Hinweis-Aufgabe offen ist oder es keine gibt; ist sie erledigt, `AUFGABE_ERLEDIGT`. `dueDate` ändern nur bei offener Aufgabe. Ein neuer Hinweis (keine Zeile oder Text `""`) geht immer. | R9, F20 |
| `wahlPruefen(eingabe, ausschnitt, bestehend): { ok: true; zeilen } \| { ok: false; fehler }` | Prüfung des PUT: Jede Position stammt aus dem Ausschnitt **oder** aus den eigenen Zeilen (Momentaufnahme). Optionen stammen aus dem Katalog bzw. aus `bestehend.auswahl`. ANGABE nur mit `angabe`, JA_NEIN nur mit `gewaehlt: true`. Eine Position nur einmal, Hinweise nur für Stellen des Ausschnitts bzw. bestehende. **Eine eigene Zeile, deren Position der Katalog seit dem Speichern in Art, Stelle, Bezeichnung oder Angabe-Feld geändert hat, gilt wie eine Position außerhalb des Ausschnitts** (Angebot und Momentaufnahme aus der Zeile, die neue Form ist solange nicht wählbar); was die Führungskraft nicht sieht (Hinweis für die Stelle, Fälligkeit, Aufgabentitel, „sichtbar für“, Optionen), frischt jedes Speichern weiter aus dem Katalog auf. **Bemerkung** nur, wo der Ausschnitt sie für diese Position anbietet oder schon eine gespeichert ist – für eine Zeile außerhalb des Ausschnitts also nur mit gespeicherter Bemerkung, sonst `WAHL_OHNE_BEMERKUNG` (Review A2, 12.10.2026). | R4 |
| `ausstattungKurz(zeilen, hinweise): string` | „6 Positionen für 3 Stellen“ für `supervisor-completed`; `""`, wenn nichts gewählt ist. Gezählt werden JA_NEIN- und AUSWAHL-Zeilen, die Stellen kommen aus diesen und aus den Hinweisen. | Plan Abschnitt 9 |
| `ausstattungsUebersichtBauen(opts): AusstattungsUebersicht` | Baut die Karte im Reiter Checkliste und die fünfte Karte im Reiter Vorgesetzter (Form und Zustandsregel siehe 1.6). Wächst in A3 um Aufgabenstand und Aktionen. | R5, R9, R13 |
| `letzterWerktagVor(datum): Date` und `sammelmailFaellig(vertragsbeginn, jetzt): boolean` | Mo–Fr in Berliner Kalendertagen. Fällig, wenn `letzterWerktagVor(beginn) <= heute <= beginn` gilt. | E-A18 |
| `freitextGrenze(jetzt): Date` | jetzt minus 6 Monate | E-A22 |

In **`src/lib/abteilungsaufgaben.ts`** kommen hinzu (Offboarding bleibt unverändert, alle neuen Felder sind optional):

- `onboardingEmpfaengerEinrichtung(v: { arbeitsortId?: string \| null; organizationId: string }): string`, also `arbeitsortId ?? organizationId` (E-A10).
- `AufgabeFuerListe` erhält optional `bemerkung?: { text; label } \| null` und `eilt?: boolean`. `aufgabenlisteMailFelder` hängt „(eilt)“ an die Fälligkeit und setzt eine eingerückte Zeile „`<Label>`: `<Text>`“ darunter (HTML maskiert). Ohne die Felder bleibt die Ausgabe Byte für Byte gleich, das Katalogbeispiel in `events.ts:262` bleibt also gültig.
- `LinkErinnerungsStand.reminderCount?` und Aufgaben mit `eilt?`. Neue reine Funktion `eiltDeckeln(stufe, offene, reminderCount)`: Bei der ersten Erinnerung (`reminderCount === 0`) mit einer offenen eilenden Aufgabe wird ESCALATION zu WARNING. Sie wird in `erinnerungsStufe` und im Knopf „Erinnern“ (D:882) benutzt (R14).
- `AbteilungsAktion` erhält `"nachtrag" | "absage"`, dazu `AKTIONS_NAMEN` und je ein eigener Zweig in `berichtMeldung`. `Grund` erhält `KEIN_NACHTRAG`, `BEREITS_ABGESAGT` und `AUFGABE_ENTFAELLT` mit Texten; die beiden ersten stehen in `GRUENDE_OHNE_PROBLEM`.
- `Anzeige.hinweisTon?: "rot" | "gelb"`. Die Karte färbt rot bei `hinweisTon === "rot"` **oder** wie bisher über `ROTE_HINWEISE`.
- `waechterHinweis({ link, offene, nachtragOffen, gesperrt, abgeschlossen, jetzt }): string | null` mit den Texten „Früheste Fälligkeit TT.MM.JJJJ – Stelle noch nicht informiert“ bzw. „… – Nachtrag noch nicht gesendet“ (R15).
- `abteilungsZeilenBauen(opts)` erhält optional `waechter?: true` und `nachtraege?: Record<string, { anzahl: number; titel: string[] }>`.
  - `ZeilenAktionen` erhält optional `nachtrag` und `nachtragGesperrt`; `AbteilungsZeile` erhält optional `nachtrag: { anzahl; text } | null`.
  - **Bedingung für „Nachtrag senden“:** Link mit `sentAt`, aufgelöster Empfänger, Liste nicht leer, Vorgang weder gesperrt noch abgeschlossen, Sperrzeit vorbei. Offene Aufgaben sind **nicht** nötig.
- `AufgabeFuerZeile` erhält optional `herkunft`, `mitBemerkung`, `entfaellt`; `ZeilenVorschau` erhält optional `ausstattung: number`, `mitBemerkung: number`.
- `sichtbarkeitsHinweis(modul, empfaenger, ausstattung?)` liefert zusätzlich `ausstattungSatz: string | null` (Mockup 6.4).
- `AbteilungsUebersichtDaten.absage?: { moeglich: boolean; stellen: string[]; gesendetAm: string | null }`.
- `ABTEILUNGS_AUDIT.NACHTRAG_GESENDET = "DEPARTMENT_NACHTRAG_SENT"`, `ABSAGE_GESENDET = "DEPARTMENT_ABSAGE_SENT"` samt Labels.

### 1.4 Zod: `src/lib/validations/ausstattung.ts`

Feldnamen nie `bezeichnung` im Modalitäten-Weg: `FELD_BEZEICHNUNGEN` ist flach, und `bezeichnung` steht dort schon für die Kostenstelle (`formular-fehler.ts:185`). Neue Einträge in `FELD_BEZEICHNUNGEN`: `positionId` „Position“, `auswahl` „Auswahl“, `angabe` „Angabe“, `bemerkung` „Bemerkung“, `hinweis` „Hinweis an die Stelle“. Freitexte werden **vor** der Längenprüfung auf `\n` normalisiert und getrimmt (Muster `validations/individuelle-mail.ts`). Steuerzeichen werden wie bei `OHNE_KLAMMERN_STEUERZEICHEN` abgewiesen.

| Schema | Inhalt |
|---|---|
| `katalogPositionSchema` | Form der Felder aus 1.2 mit Grenzen aus `GRENZEN`, **ohne** die A4-Felder `ausgabeKennung`, `rueckgabeKategorie`, `beiAustritt` und ohne `vorschlagSchluessel`: Das Schema kennt sie nicht und verwirft sie (`.strip()`). Die A4-Felder schreibt bis A4 niemand (Momentaufnahme kopiert `null`), `vorschlagSchluessel` nur `vorschlaegeUebernehmen`. Sonst fände A4 ungeprüfte Werte vor, und ein Vorschlagsschlüssel ließe sich über POST/PATCH verbiegen. `departmentKey` über `schluesselFeld` (`validations/abteilungsaufgaben.ts:64`, heute ein nicht exportiertes `const`; S2 exportiert es). Arten, Einrichtungsarten, Personengruppen und Angabe-Schlüssel nur aus den Konstanten. `isActive` wird beim Anlegen ignoriert und ist immer `false`. |
| `katalogPositionAenderungSchema` | `.partial()` + `.refine` „Mindestens ein Feld erforderlich.“ (A4-Felder und `vorschlagSchluessel` fehlen auch hier). Die Prüfung der Felder gegeneinander macht der Dienst mit `positionPruefen` auf dem zusammengeführten Stand. Dazu `stand?: ISO-Zeitstempel` (kein Feld der Position, zählt nicht als Änderung): der `updatedAt`, den der Dialog „Bearbeiten“ beim Öffnen geladen hat. Der Dialog schickt das ganze Formular; weicht `stand` vom gespeicherten Wert ab, antwortet der Dienst 409 `INZWISCHEN_GEAENDERT`, statt die Änderung eines anderen Tabs still zurückzudrehen. Ohne `stand` (Ein-/Ausschalten in der Zeile) bleibt nur die Sperre innerhalb der Anfrage (Review A1). |
| `ausblendungSchema` | `{ organizationId: uuid, ausgeblendet: boolean }` |
| `modalitaetenAusstattungSchema` | `ausstattung?: { positionId: uuid; gewaehlt?: true; auswahl?: string[] (≤40); angabe?: string (≤300); bemerkung?: string (≤500) }[]` (≤200), `hinweise?: { departmentKey; hinweis: string (≤1000) }[]` (≤30). `.strip()`. Wird in `modalitaetenFieldsSchema` (Route :34–83) als `.optional()` eingebunden und steht **nicht** in `ALLOWED_FIELDS`. |
| `ausstattungAktionSchema` | `discriminatedUnion("aktion")` über sechs Aktionen:<br>• `hinzufuegen`: `{ positionId }` **oder** `{ frei: { departmentKey, bezeichnung ≤120, relativeDueDays? } }`, dazu `auswahl?`, `angabe?`, `bemerkung?`<br>• `aendern`: `{ ausstattungId, auswahl?, angabe?, bemerkung?, departmentKey?, faelligkeiten?: { option, dueDate: "YYYY-MM-DD" \| null }[] }`<br>• `streichen`: `{ ausstattungId }`<br>• `hinweis-aendern`: `{ departmentKey, hinweis?, dueDate?: "YYYY-MM-DD" \| null }`, mindestens eines der beiden Felder (`hinweis: ""` entfernt den Hinweis, `dueDate` ändert die Fälligkeit der Hinweis-Aufgabe, F20; `null` = ohne Fälligkeit und räumt `relativeDueDays` mit ab wie der Portal-PATCH)<br>• `hinweis-gesehen`: `{ departmentKey }`<br>• `hinweis-uebernehmen`: `{ departmentKey, positionId? \| frei?, bemerkung? }`<br>`departmentKey` nie aus `NICHT_ERLAUBTE_STELLEN` (400, R11), auch nicht bei `frei` und im Stellenwechsel von `aendern`. Freie Positionen sind immer JA_NEIN (E-A13: keine freien Angaben) und haben keinen `hinweisStelle` (der landete in `description` und damit bei `PORTAL_ROLES`). |
| `onboardingAbteilungsAktionSchema` | Das bestehende Schema plus `{ aktion: "nachtrag", departmentKey }` und `{ aktion: "absage" }`. `abteilungsAktionSchema` des Offboardings bleibt **unverändert**, dort antwortet `nachtrag` deshalb automatisch mit 400 „Unbekannte Aktion.“. |
| `arbeitsortSchema` | `{ arbeitsortId: idFeld \| null }`, bewusst **ohne** `.uuid()` wie `organizationId` (`validations/onboarding.ts:104`): Eine unbekannte ID ist ein 404 „Organisation nicht gefunden“, keine Formatfrage. `idFeld` (getrimmt, 1–64 Zeichen, ohne Steuerzeichen und spitze Klammern) gilt auch für `organizationId` im `katalogPositionSchema` und `arbeitsortId` im Anlege-Schema: Ein NUL-Zeichen liefe sonst bis in `findUnique` und endete als 500 (Postgres 22021) statt 400 (Review A1). |
| `statusAenderungSchema` (`validations/onboarding.ts:155`) | `+ bestaetigt: z.boolean().optional()` (E-A19) |
| `onboardingAnlegenSchema` (`validations/onboarding.ts:112`) | `+ arbeitsortId: z.preprocess(leerAlsFehlend, idFeld(…).optional())`, ohne `.uuid()` (wie oben) |

### 1.5 Server-Module (ohne Zyklen)

| Datei | Inhalt | Importiert (neu) |
|---|---|---|
| `src/lib/ausstattung-katalog.ts` | Katalog-CRUD, Vorschläge, Ausblendung, Warnungen; `katalogAusschnittLaden(db, vorgang)`; `ausstattungAngebotenIn(tx, kontext): Promise<boolean>` | db, ausstattung.ts, abteilungsaufgaben.ts (rein), empfaenger-allowlist |
| `src/lib/ausstattung-daten.ts` | **Nur lesend**: `ausstattungZuAufgabenLaden(db, checklistItemIds)` (Bemerkung, Label, Option), `angabenJeStelleLaden(db, onboardingId)`, `offeneAenderungenLaden(db, onboardingId)`, `ausstattungsStandLaden(db, onboardingId)` | db, ausstattung.ts |
| `src/lib/ausstattung-aufgaben.ts` | Schreibt in einer fremden Transaktion: `ausstattungsAufgabenAnlegenIn(tx, onboardingId, { jetzt, userId })`, `aenderungenSchreibenIn(tx, …)`, `aufgabeEntfallenIn(tx, …)` | uebergaenge (`linksSperrenIn`), ausstattung-daten |
| `src/lib/abteilungsaufgaben-onboarding.ts` (vorhanden) | Neu: `vorgangSperrenIn(tx, id, { auch?: OnboardingStatus[] })`, `onboardingAusstattungNachholenIn(tx, id, opts)` (in der Reihenfolge Vorgang sperren → anlegen → `faelligkeitenSetzen` → `linkStatusNeuBerechnenIn` → Audit), `onboardingAusstattungNachholen(id)`, Absage | ausstattung-aufgaben |
| `src/lib/ausstattung-dienst.ts` | FK-Wahl lesen und speichern (Modalitäten), HR-Karte (Übersicht, Aktionen), Übersicht für die Detailroute | abteilungsaufgaben-onboarding, -dienst, ausstattung-aufgaben, -katalog, -daten |
| `src/lib/ausstattung-lauf.ts` | `ausstattungNachholenLauf(jetzt)`, `ausstattungSammelmailLauf(jetzt)`, `ausstattungFreitexteLeeren({ grenze, dryRun })` | abteilungsaufgaben-onboarding, -dienst, ausstattung-daten, webhooks |
| `src/lib/onboarding-arbeitsort.ts` | `arbeitsortAendern({ onboardingId, rohBody, session })` | db, permissions |

`abteilungsaufgaben-dienst.ts` und `-uebergaenge.ts` importieren nur `ausstattung-daten.ts`, keinen Dienst. Damit entsteht kein Kreis: Der Adapter importiert `ausstattung-aufgaben`, `ausstattung-dienst` importiert den Adapter.

### 1.6 Routen

Alle Routen sind dünn: Sitzung, Body, **eine** Dienstfunktion, Antwort 1:1 (`DienstAntwort { status, body }`). „Unbekannt“ und „fremder Mandant“ ergeben dieselbe 404 mit demselben Text.

| Route | Rolle | Body | Antworten |
|---|---|---|---|
| `GET /api/settings/ausstattung` | `adminHandler` | — | 200 `{ data: { positionen (mit ausblendungen, verwendung), einrichtungen [{id,name,type,isActive}], stellen [{key,name}], warnungen: { adressLuecken, aehnlicheVorlagenpunkte, ausserhalbFreigabe } } }` |
| `POST /api/settings/ausstattung` | `adminHandler` | `katalogPositionSchema` | 201 `{ data }`; 400 (Zod oder `positionPruefen`, unbekannte Einrichtung); 409 bei P2002 |
| `PATCH /api/settings/ausstattung/[id]` | `adminHandler` | `katalogPositionAenderungSchema` | 200; ohne echte Änderung 200 ohne Schreiben und ohne Audit; 400; 404 (P2025); 409 `{ error, grund: "INZWISCHEN_GEAENDERT" }`, wenn `stand` veraltet ist oder zwischen Lesen und Schreiben jemand gespeichert hat. Die Katalogseite schließt dann den Dialog, lädt neu und zeigt die Meldung über der Liste (ebenso bei 404) |
| `DELETE /api/settings/ausstattung/[id]` | `adminHandler` | — | 200; 409 `IN_VERWENDUNG`, wenn ein Vorgang die Position gewählt hat („bitte ausschalten statt löschen“); 404 |
| `PUT /api/settings/ausstattung/[id]/ausblendung` | `adminHandler` | `ausblendungSchema` | 200 (Upsert bzw. Löschen, idempotent); 400 bei einer Position, die nicht zentral ist |
| `POST /api/settings/ausstattung/vorschlaege` | `adminHandler` | — | 200 `{ angelegt, vorhanden }` |
| `PATCH /api/onboarding/[id]/arbeitsort` | `HR_EDIT_ROLES` | `arbeitsortSchema` | 200; 403; 404 (Vorgang oder Einrichtung unbekannt bzw. fremd); 409 `LINK_ERZEUGT`, sobald `supervisorToken` gesetzt ist oder ein HR-Status vorliegt (bedingtes `updateMany` mit `supervisorToken: null`, count 0 → 409) |
| `GET /api/onboarding/[id]/ausstattung` | `HR_EDIT_ROLES` | — | 200 `{ data: AusstattungsUebersicht }`; 403; 404 |
| `POST /api/onboarding/[id]/ausstattung` | `HR_EDIT_ROLES` | `ausstattungAktionSchema` | Erfolg: 200 `{ data: AusstattungsUebersicht, meldung }`<br>Fehler: 400; 403; 404<br>409 mit `grund`: `VORGANG_ABGESCHLOSSEN`, `MODALITAETEN_FEHLEN`, `AUFGABE_ERLEDIGT`, `BEREITS_VORHANDEN`, `VERSAND_LAEUFT` |
| `POST /api/onboarding/[id]/abteilungen` (vorhanden) | `HR_EDIT_ROLES` | `onboardingAbteilungsAktionSchema` | wie bisher. `absage` ist **nur** bei EXPIRED erlaubt (sonst 409 `NICHT_ABGESAGT`); sie überspringt den EXPIRED-Abbruch (O:268) und die Modalitäten-Sperre. Jede andere Aktion holt vor dem Versand die Ausstattungsaufgaben nach (anstelle des heutigen reinen `faelligkeitenSetzen`, O:285). |
| `PATCH /api/onboarding/[id]` (vorhanden) | `HR_EDIT_ROLES` | `{ status, bestaetigt? }` | neu: 409 `{ error, grund: "AUSSTATTUNG_OFFEN", offen: [{ titel, stelle }] }` bei COMPLETED ohne `bestaetigt`; EXPIRED setzt `expiredAt` |
| `GET`/`PUT`/`POST /api/modalitaeten/[token]` (vorhanden) | Token | siehe S8 und S12 | PUT neu: 400 bei Ausstattung ohne Merker; 400 bei fremder oder unbekannter Position bzw. Option; 409 bei bereits eingereichten Modalitäten |

**`AusstattungsUebersicht`** (in `ausstattung.ts`, client-sicher; die Karte rechnet nichts selbst):

```ts
interface AusstattungsUebersicht {
  zustand: "ENTWURF" | "BEARBEITBAR" | "NUR_LESEN";
  satz: string | null;              // z. B. "Ohne Einstellungsmodalitäten kann nichts an die Stellen gehen."
  angefordertAm: string | null;     // supervisorSubmittedAt
  gruppen: {
    departmentKey: string; stelleName: string; adresseFehlt: boolean;
    zeilen: AusstattungsZeile[];
    hinweis: { text: string; quelleLabel: string; gesehen: boolean; checklistItemId: string | null;
               status: "offen" | "erledigt" | "entfaellt" | null; faelligAm: string | null; eilt: boolean;
               aktionen: { aendern: boolean; sperrGrund: string | null } } | null;
  }[];
  hinzufuegbar: { positionId: string; bezeichnung: string; art: string; departmentKey: string; optionen: string[] }[];
  darfBearbeiten: boolean;
}
interface AusstattungsZeile {
  id: string; positionId: string | null; art: string; bezeichnung: string;
  quelle: "FUEHRUNGSKRAFT" | "HR"; erfasst: string | null;   // "ergänzt von HR (A. Peters), 19.01.2027"
  bemerkung: { text: string; label: string } | null; angabe: { label: string; wert: string; sichtbarFuer: string[] } | null;
  gestrichen: boolean; nichtMehrImKatalog: boolean; vorlaufWarnung: string | null;
  aufgaben: { option: string; checklistItemId: string; titel: string;
              status: "offen" | "erledigt" | "entfaellt"; faelligAm: string | null; eilt: boolean; erledigtAm: string | null }[];
  aktionen: { aendern: boolean; streichen: boolean; sperrGrund: string | null };
}
```

**Zustandsregel** (`ausstattungsUebersichtBauen`, einzige Stelle; Karte und Server lesen dieselbe Ableitung):

| Zustand | Bedingung | Satz |
|---|---|---|
| `NUR_LESEN` | Status COMPLETED oder EXPIRED, **oder** Rolle nicht in `HR_EDIT_ROLES` | bei Endstatus „Der Vorgang ist abgeschlossen – nur noch lesbar.“, sonst `null` |
| `ENTWURF` | Modalitäten nicht eingereicht (`vorgesetzteAbgesendet` ist falsch) | mit `mitAusstattung = true`: „Ohne Einstellungsmodalitäten kann nichts an die Stellen gehen.“; sonst „Das Formular der Führungskraft enthält diesen Schritt nicht. Nach der Abgabe kann die Personalabteilung Positionen ergänzen.“ |
| `BEARBEITBAR` | eingereicht, Status nicht final, Rolle in `HR_EDIT_ROLES` – **unabhängig von `mitAusstattung`** | `null` |

`mitAusstattung` steuert nur das Formular der Führungskraft (R2), nie die Karte: Nach der Abgabe ergänzt HR auch bei Vorgängen ohne den Schritt (Bestand zum Go-live, Migration setzt `false`; falscher Fragebogentyp). Der Server (S15) prüft denselben Zustand (403, 409 `VORGANG_ABGESCHLOSSEN`, 409 `MODALITAETEN_FEHLEN`) und nie den Merker. `hinzufuegbar` = `positionenFuer` dieses Vorgangs (Arbeitsort, Art, Personengruppe, Vorgangsart, Adresse) ohne die schon gewählten, nicht gestrichenen Positionen; leer bei `ENTWURF`/`NUR_LESEN`. Einen Zustand `OHNE_SCHRITT` gibt es nicht mehr, er ist nur noch eine Satzvariante von `ENTWURF`.

### 1.7 Ablauf „Aufgaben je Option“ und Anschluss an Paket 5

`onboardingAusstattungNachholenIn(tx, onboardingId, { userId, jetzt, versandAn? })` im Adapter (`versandAn`: Stellen, an die gleich eine Zuweisungsmail geht, nur aus der Abteilungsaktion, F22):

1. **Vorgang sperren:** `vorgangSperrenIn(tx, id)` = `onboardingProcess.updateMany({ where: { id, status: { notIn: ["COMPLETED", "EXPIRED"] } }, data: { updatedAt: jetzt } })`. Ergibt das count 0, endet der Ablauf ohne Wirkung.
2. **Fehlende Aufgaben ermitteln:**
   - `ausstattungsStandLaden` liest Zeilen, Verknüpfungen und Hinweise.
   - Mit `sollAufgaben` gegen die vorhandenen Verknüpfungen werden die fehlenden `(ausstattungId, option)` bestimmt, dazu die Hinweise ohne `checklistItemId` (Text nicht leer, nicht geleert).
   - Daraus folgt die Menge der betroffenen Stellen, vereinigt mit `versandAn`.
3. **`linksSperrenIn(tx, bereich, stellen)`** (F5).
4. **Je fehlender Aufgabe:**
   - `tx.checklistItem.create` mit den Feldern:
     - `title` aus `aufgabenTitel`
     - `category: AUSSTATTUNG_KATEGORIE`
     - `orderIndex` (1.3)
     - `assignee: departmentKey`
     - `description: hinweisStelle`, bei Hinweis-Aufgaben `HINWEIS_AUFGABE_BESCHREIBUNG` (ortsneutral, steht auch in Erinnerung und Sammelmail ohne den Hinweis selbst)
     - `relativeDueDays`, `dueDate: null`, `templateItemId: null`
     - `herkunft`
   - Danach `tx.onboardingAusstattungAufgabe.create`. Bei einem Hinweis stattdessen `tx.onboardingStellenHinweis.updateMany({ where: { onboardingId, departmentKey, checklistItemId: null }, data: { checklistItemId } })`; count 0 bricht ab (Ausnahme, Rollback).
5. **Änderungsliste:** Ist die Stelle schon informiert (`link.sentAt ?? link.lastSentAt`, gelesen **nach** der Linksperre), schreibt der Ablauf je neuer Aufgabe einen Eintrag NEU (R10).
6. **`faelligkeitenSetzen(tx, id, { userId, jetzt })`** (erweitert): Für `herkunft != null` gilt `ausstattungsFaelligkeit`, gesetzt werden `dueDate` und `eilt`. Für Vorlagenaufgaben bleibt alles wie bisher. Auch hier gilt die Bedingung `dueDate: null` im WHERE.
7. **Anheben beim Versand (F22), nur mit `versandAn`:** Je Stelle aus `versandAn` den Link lesen (nach der Linksperre), die Aufgaben der Stelle mit `herkunft != null` lesen (`id`, `dueDate`, `createdAt`, `isCompleted`, `entfaelltAm`), `anzuhebendeAufgaben(aufgaben, link?.lastSentAt ?? link?.sentAt ?? null, jetzt)` und dann `checklistItem.updateMany({ where: { id: { in: ids }, isCompleted: false, entfaelltAm: null }, data: { dueDate: heute, eilt: true } })`. Gelesen und geschrieben wird unter Vorgangs- und Linksperre, deshalb reicht das WHERE über die IDs (keine Datumsoperatoren, die die Fake-DB nicht kennt). Audit nur mit Anzahl, wenn etwas angehoben wurde (`AUSSTATTUNG_FAELLIGKEIT_ANGEHOBEN`).
8. **`linkStatusNeuBerechnenIn(tx, bereich, stellen, jetzt)`:** Liefert sie für eine Stelle `WIEDER_OFFEN`, schreibt der Ablauf das Audit `DEPARTMENT_TASKS_REOPENED` (Muster U:1183–1196). Der Link wird dabei nicht verlängert; das tun erst Nachtrag und Erinnerung (Stolperstelle 14).
9. **Audit** `AUSSTATTUNG_AUFGABEN_ANGELEGT` mit Anzahl, Stellen-Schlüsseln und Herkunft, ohne Titel.

**Aufrufer**

| Aufrufer | Ausführung |
|---|---|
| Modalitäten-POST, zweite Transaktion | **ersetzt** `faelligkeitenSetzen` (Route :563). Bleibt bei genau zwei `$transaction`; ein Fehler wird nur geloggt. |
| `onboardingAbteilungsAktionAusfuehren` (O:285) | Jede Aktion außer `absage`, mit `versandAn` (F22): `informieren` = Link-Stellen (`istLinkAbteilung`, also nie HR) der Aufgaben, deren Link fehlt oder kein `sentAt` hat (an sie geht gleich die Erstmail; eine Stelle, die der Versand danach überspringt, bekommt die Anhebung trotzdem, das ist harmlos und wiederholt sich beim nächsten Versand); `erneut-senden`, `link-erneuern`, `nachtrag` = `[departmentKey]`; `erinnern` = keine. |
| Schreibwege der HR-Karte | ohne `versandAn` (keine Mail, also keine Anhebung) |
| Täglicher Lauf (`ausstattungNachholenLauf`) | Abschnitt 3a in `/api/cron/reminders`, vor den Abteilungs-Erinnerungen. Je Vorgang unter `versandSperreNehmen`. Kandidaten sind laufende Vorgänge mit `supervisorSubmittedAt` und mindestens einer nicht gestrichenen Ausstattungszeile oder einem Hinweis ohne Aufgabe. |

**Lesestellen für Bemerkung und „Eilt“**

- `aufgabenLaden` (D:215) wählt für das Onboarding zusätzlich `herkunft`, `eilt` und `entfaelltAm`. Haben Aufgaben `herkunft`, lädt sie danach die Bemerkungen über `ausstattungZuAufgabenLaden`; **ohne** Ausstattungsaufgaben fragt sie die Datenbank nicht ab, die bestehenden Tests bleiben also unberührt.
- `AufgabeFuerVersand` bekommt optional `herkunft`, `eilt`, `entfaellt` und `bemerkung`.
- `zuweisungSenden` nimmt als Rückfall-Liste (D:543) nie entfallene Aufgaben.

### 1.8 Arbeitsort (E-A10), Wirkung auf alle Onboarding-Abteilungsaufgaben

**Wer `arbeitsortId ?? organizationId` liest** (über `onboardingEmpfaengerEinrichtung`):

- `onboardingVersandModul` (O:130), damit Versand, Erneut, Erinnern, Nachtrag und Lauf
- `onboardingAbteilungsUebersichtLaden` (O:372), damit Karte, Stepper und Dialog
- der `select` in `onboardingAbteilungenLaden` (O:429–450)
- `ONBOARDING_VERSAND_AUSWAHL` (O:96) und `OnboardingUebersichtVorgang` (O:299) bekommen `arbeitsortId`
- `ONBOARDING_VORGANG_OEFFENTLICH` (U:479, Link-Weg: Seite, `onboarding-task-completed`, `onboarding-department-completed`) bekommt `arbeitsortId` und `arbeitsort: { select: { name: true } }`. Ohne das stünde das Mailfeld `arbeitsort` (F15) auf dem Link-Weg immer leer.
- PDF-Abteilungsnamen (`pdf-export/route.ts:117`)
- Katalogfilter (`positionenFuer`) samt Einrichtungsart aus `arbeitsort.type ?? organization.type`

Dadurch gehen **auch die Vorlagenaufgaben** an die Stellen des Arbeitsorts (E-A10).

**Link-Seite:** Der Arbeitsort steht als eigenes Feld `data.arbeitsort: string | null` (nur Onboarding, nur bei Abweichung von der Einrichtung, sonst `null`) und erscheint im Kopf der Seite neben der Einrichtung. Er kommt **nicht** in `data.vorgang` (dort pinnt `onboarding-tasks.test.ts:270` die Felder) und nicht in `zusatz` (je Schlüssel gepinnt, :320).

**Was unverändert bleibt** (Mandant = Arbeitgeber):

- jedes `canAccessProcess(…, organizationId)`
- die Unterlagen (`unterlagen-onboarding.ts:87, :181`)
- die Listenfilter (`api/onboarding/route.ts:412`)
- das Mailfeld `einrichtung` (dazu `arbeitsort` nach F15)

**Anlegen**

- Neues Feld im Dialog „Neuer Vorgang“, Vorgabe „wie Einrichtung“, angeboten werden nur aktive Einrichtungen.
- Der Dialog schickt `arbeitsortId` nur mit, wenn das Feld gesetzt ist und von der Einrichtung abweicht. Der Test `neuer-vorgang-modal.test.tsx:206` pinnt die Schlüssel des Body; er bleibt grün, solange `arbeitsortId` fehlt, wenn es nicht abweicht.
- Der Server prüft Existenz und `canAccessProcess` für den Arbeitsort; Fehler ergeben 404 „Organisation nicht gefunden“.
- Ist `arbeitsortId === organizationId`, speichert er `null`.

**Ändern**

- Über `PATCH …/arbeitsort`, nur solange `supervisorToken` null ist.
- Weil der Versand eingereichte Modalitäten voraussetzt, gibt es bei einer Änderung noch keine informierten Stellen.
- Audit `ONBOARDING_ARBEITSORT_GEAENDERT` mit `{ von, nach }` (IDs).

### 1.9 Merker `mitAusstattung`, Migration, Schrittliste (A2)

**Merker setzen**

- Die Aufrufer berechnen `ausstattungAngeboten = await ausstattungAngebotenIn(tx, { organizationId, arbeitsortId, questionnaireType, processType })` **in derselben Transaktion** vor `vorgesetztenLinkSetzen`.
  - Aufrufer: `POST /api/onboarding` (:278) und `/supervisor-link` (:174).
  - `VORGANG_INCLUDE` der Link-Route (:70–74) ist ein `include`; die Skalare `arbeitsortId`, `questionnaireType` und `processType` kommen damit schon mit (als include-Schlüssel wären sie ein tsc-Fehler). `ausstattungAngebotenIn` lädt die Einrichtungsart des Arbeitsorts selbst über `tx.organization.findUnique` (eine Abfrage, nur wenn `arbeitsortId` gesetzt ist); `VORGANG_INCLUDE` bleibt unverändert.
- `vorgesetztenLinkSetzen(tx, e)` bekommt die **Pflicht**felder `e.ausstattungAngeboten: boolean` und `e.arbeitsortId: string | null` (der Arbeitsort, mit dem der Aufrufer `ausstattungAngeboten` gerechnet hat). `arbeitsortId` steht im WHERE der bedingten Link-Sperre (`?? null`, damit ein fehlender Wert die Bedingung nicht still entfallen lässt): Hat ein gleichzeitiger Arbeitsort-PATCH (bedingt auf `supervisorToken: null`) zwischen dem Lesen und der Sperre committet, trifft sie nichts → `LinkGeaendert` → 409 „Vorgang wurde gerade geändert“. Sonst entstünde der Merker aus dem Katalog des alten Orts und bliebe, weil der Arbeitsort ab dem Link eingefroren ist (Review A2, 12.10.2026). Die Reihenfolge (erst Katalog, dann Sperre) bleibt.
  - `supervisorData.upsert({ …, update: {}, create: { onboardingId, mitAusstattung: e.ausstattungAngeboten } })` liefert die Zeile.
  - Ist dort `mitAusstattung === null` und `currentStep === 0`, folgt `supervisorData.updateMany({ where: { onboardingId, mitAusstattung: null, currentStep: 0 }, data: { mitAusstattung } })`.
  - Rückgabe ist zusätzlich `mitAusstattung: boolean` (wirksamer Wert, `null` gilt als `false`).
- Die Einladungsmail bekommt `ausstattung_angeboten: mitAusstattung ? "ja" : ""` über `vorgesetztenLinkMailFelder(…, { ausstattungAngeboten })`.

**Migration** `SUPERVISOR_MIT_AUSSTATTUNG_V1` in `prisma/seed-check.js` (Muster `ensureStellenbezeichnungLabels` :1190):

- `updateMany({ where: { mitAusstattung: null }, data: { mitAusstattung: false } })` plus Merker in **einer** Array-Transaktion, Anzahl in `details`.
- Aufruf in `main()` nach :1834, vor dem Seed. Plan-Funktion und Marker-Konstante werden exportiert.

**Schrittliste** (`validations/supervisor-data.ts`)

- `SUP_STEP_CONFIG` bleibt (5 Einträge) und bekommt `key` (`stelle`, `arbeitszeit`, `verguetung`, `zusatz`, `zusammenfassung`). `number` bleibt, wird aber nicht mehr gelesen.
- Neu: `SUP_SCHRITT_AUSSTATTUNG = { key: "ausstattung", title: "Ausstattung & Zugänge", description: "Was zum Arbeitsbeginn bereitstehen soll" }` und `supSchritte(mitAusstattung?: boolean | null)`. Bei `true` steht der neue Schritt an Index 4, die Zusammenfassung an Index 5; sonst gilt die Grundliste.
- `modalitaetenFortschritt(sd?: { currentStep?; mitAusstattung? })` rechnet `total` und `titel` aus `supSchritte`.

**Wer den Merker liest** (nie den Katalog):

| Leser | Fundstelle |
|---|---|
| Formular | `page.tsx` |
| Stepper | `uebersicht-schritte.ts:169, :504` |
| Karte „Vorgesetzten-Link“ | `detail-content.tsx:1495` |
| Dashboard-Liste | `dashboard-content.tsx:553`, dazu `select` in `api/onboarding/route.ts:447–449` um `mitAusstattung` erweitert |

### 1.10 Streichen, Hinweis-Aufgabe, Nachtrag, Wächter, Sammelmail, Absage, Abschluss

**Streichen und Abwählen** (R9; die Schreibwege der Karte, S15)

- **Vor der Information der Stelle** (Link ohne `sentAt ?? lastSentAt`) verschwindet die Position ganz. Reihenfolge in der Transaktion: zuerst `tx.checklistItem.deleteMany({ where: { id: { in: <verknüpfte checklistItemIds> }, onboardingId } })` – die Kaskade entfernt die Verknüpfungen `OnboardingAusstattungAufgabe` –, **danach** `tx.onboardingAusstattung.delete`. Umgekehrt bliebe die Aufgabe verwaist stehen (die Kaskade läuft von `ChecklistItem` zur Verknüpfung, nicht von der Zeile zur Aufgabe), ginge weiter an die Stelle, und das Nachholen bemerkte sie nicht. Beim Abwählen einer einzelnen Option ebenso nur deren Aufgabe.
- **Danach** entfällt sie (F2: `entfaelltAm`, `isCompleted`, `completedAt`, `completedById`; die Zeile bekommt bei ganzer Position `gestrichenAm`), Eintrag ENTFAELLT.
- **Wiederaufnahme** nach F23: Eine entfallene Aufgabe, deren Option bzw. Position wieder gewählt wird, wird wieder geöffnet (Eintrag NEU), keine zweite angelegt.

**Hinweis-Aufgabe** (E-A14; `hinweis-aendern`, `hinweis-uebernehmen`, `hinweisAenderungPruefen`)

| Fall | vor der Information der Stelle | nach der Information |
|---|---|---|
| HR legt einen Hinweis neu an (keine Zeile oder Text `""`) | Zeile mit `quelle = "HR"` (bzw. Text setzen); das Nachholen legt die Aufgabe an | ebenso, dazu Eintrag NEU „Hinweis der Führungskraft beachten“; war eine entfallene Aufgabe verknüpft, wird sie nach F23 wieder geöffnet |
| HR ändert den Text | `quelle` nach `bemerkungQuelleNach` (FK-Text → `BEIDE`) | ebenso, Eintrag GEAENDERT |
| HR entfernt den Hinweis (`hinweis: ""`) | Aufgabe löschen (erst `checklistItem.delete`, `checklistItemId` wird per `SetNull` frei), dann die Zeile löschen | Text `""`, Aufgabe entfällt (F2), Eintrag ENTFAELLT; die Zeile bleibt mit der Verknüpfung |
| Hinweis-Aufgabe ist erledigt | Ändern, Entfernen und `dueDate` ergeben 409 `AUFGABE_ERLEDIGT` (wie R9 bei Positionen), bis sie wieder geöffnet ist (Link-Seite oder Checkliste) | ebenso |
| `hinweis-uebernehmen` | legt die Position an (wie `hinzufuegen`) und setzt `gesehenAm`; **die Hinweis-Aufgabe bleibt unverändert** – der Hinweis steht weiter auf der Link-Seite und kann mehr enthalten als die Position. Wer ihn nicht mehr will, entfernt ihn danach (Zeile oben). | ebenso, Eintrag NEU für die Position |
| `hinweis-gesehen` | nur `gesehenAm` | ebenso, kein Eintrag (keine Inhaltsänderung) |

Die Hinweis-Aufgabe zählt wie jede Ausstattungsaufgabe in Erinnerung, Wächter, Sammelmail und Abschluss-Rückfrage mit, solange sie offen und nicht entfallen ist. Ein Hinweis mit Text `""` erzeugt nie eine Aufgabe (Nachholen, 1.7 Schritt 2).

**Nachtrag** (R10, E-A7)

- Aktion `nachtrag` im Versandkern mit eigener Vorprüfung `nachtragPruefung(ctx, key)`:
  - Ohne Link oder ohne `sentAt`: `NICHT_INFORMIERT`. HR nimmt dann „Erneut senden“, das die Einträge nach F7 mitnimmt.
  - Leere Änderungsliste: `KEIN_NACHTRAG`.
  - Sperrzeit läuft (10 Minuten): `SPERRZEIT`.
  - Empfänger fehlt: dessen Grund.
  - Adresse geändert: Modus `NEUER_LINK` wie bei „Erneut senden“.
- `ZuweisungsModus` bekommt `"NACHTRAG"`:
  - gleicher Token, Gültigkeit verlängern, `lastSentAt` setzen, `sentAt` bleibt.
  - Die Liste enthält nur die offenen Aufgaben, bei null offenen also eine leere Liste.
  - Merker `hat_offene_aufgaben` (`"ja"`/`""`).
- Payload über `ctx.nachtraege.get(key)`:
  - `versandKontextLaden` lädt im Onboarding `offeneAenderungenLaden` mit.
  - Felder: `nachtragMailFelder` sowie `angabenMailFelder` aus `angabenJeStelleLaden`.
  - `nachtrag*` und `hat_offene_aufgaben` kommen **nur** über das Onboarding (`ctx.nachtraege` ist im Offboarding nicht gesetzt, `zuweisungsPayload` spreizt sie nur dann). Die Payload des Offboardings bleibt Byte für Byte gleich; Wächter dafür ist `offboarding-mails.test.ts:447` (echte Payload = Katalogbeispiel).
- Nach SENT: `onboardingAusstattungAenderung.updateMany({ where: { id: { in: gesendeteIds }, gesendetAm: null }, data: { gesendetAm: jetzt } })` im `try` wie bei `ergebnisSpeichern`. Scheitert die Datenbank, gibt es eine Warnung, nie eine 500.
- `aktionMitKontextAusfuehren` (D:924) bekommt statt des verschachtelten Ternary ein `switch` mit `never`-Prüfung. Heute vergibt eine neue Aktion still einen **neuen Token** (Stolperstelle 1).

**Wächter** (R15)

- Der Adapter übergibt `waechter: true` und die Nachtragszähler.
- Die Zeile wird rot (`hinweisTon: "rot"`), wenn alle Bedingungen zutreffen:
  - Modalitäten eingereicht
  - Vorgang nicht abgeschlossen
  - Stelle nicht informiert **oder** Nachtrag offen
  - früheste Fälligkeit der offenen Aufgaben vor `jetzt + 7 Tage`
- Er gilt für **alle** Onboarding-Abteilungsaufgaben, das Offboarding bleibt ohne.

**Sammelmail** (E-A18)

- Ereignis `onboarding-ausstattung-offen`, Abschnitt 4 in `/api/cron/reminders`.
- Kandidaten:
  - Status nicht final, `supervisorSubmittedAt` gesetzt, `ausstattungSammelmailAm: null`
  - Vertragsbeginn zwischen heute und heute + 4 Tagen
  - danach `sammelmailFaellig`
  - und mindestens eine Aufgabe mit `herkunft != null`, `isCompleted: false`
- Ablauf:
  1. Beanspruchen per bedingtem `updateMany` (`ausstattungSammelmailAm` von `null` auf `jetzt`).
  2. Senden über `triggerWebhooks`. Das Ereignis steht in `EVENTS_OHNE_WEBHOOK`.
  3. Bei FAILED den Merker zurück auf `null`; SENT und SKIPPED behalten ihn (Hausregel der Merker).
- Payload: `onboardingId`, `displayId`, `mitarbeiter_name` (nie leer), `einrichtung`, `vertragsbeginn`, `hr_postfach`, `anzahl_offen`, `offene_liste`/`offene_liste_html` („Titel – Stelle“, ohne Bemerkungen) und `portalLink`.
- `portalLink` baut genau eine Funktion `ausstattungPortalLink(onboardingId)` in `ausstattung-lauf.ts` (`${getBaseUrl()}` + Pfad der Detailseite mit `?tab=checklist`, Muster `portalPfad` in `unterlagen-onboarding.ts:505`). Kein zweites Vorkommen der Zeichenkette `/dashboard` im neuen Code: Auf `ux-umbau` verbietet `adressen.test.ts` sie außerhalb von `src/lib/adressen.ts`, beim Merge wird nur diese eine Stelle auf `vorgangPfad("onboarding", id, "checkliste")` umgestellt (Abschnitt 4).
- Feiertage kennt die Rechnung nicht (Abschnitt 5, Frage 1).

**Absage** (E-A20)

- Aktion `absage` ohne `departmentKey`, nur bei EXPIRED.
- Empfänger: Links mit `sentAt ?? lastSentAt` und ohne `abgesagtAm`. Gesendet wird an `link.email` (F16), Event `onboarding-department-abgesagt`.
- Payload:
  - `mailFelder`, `abteilung`, `email`
  - `erledigte_liste`/`erledigte_liste_html` (F17)
  - Merker `hat_erledigte`
  - **keine** Link-Felder
- Bei SENT wird `abgesagtAm` gesetzt; FAILED lässt einen neuen Versuch zu.
- Audit `DEPARTMENT_ABSAGE_SENT`.

**Abschluss** (E-A19)

- Im COMPLETED-Zweig des Status-PATCH wird **nach** dem bedingten `updateMany` (sperrt den Vorgang zuerst) in derselben Transaktion gezählt: `tx.checklistItem.findMany({ where: { onboardingId, herkunft: { not: null }, isCompleted: false }, select: { title, assignee } })`.
  - Sind welche offen und fehlt die Bestätigung, wirft der PATCH `AusstattungOffen` (Rollback) und antwortet mit 409.
  - Mit Bestätigung gehen `offeneAusstattung: n` ins Audit `STATUS_CHANGED`.
- Hinweis-Aufgaben zählen mit, entfallene nicht (sie sind `isCompleted`).
- Oberfläche: `window.confirm` (`detail-content.tsx:730`) wird durch `DialogRahmen` ersetzt. Die Liste der offenen Aufgaben steht im Dialog; der zweite Klick schickt `bestaetigt: true`.

### 1.11 PATCH-Sperren und Rollen (R9, R16, E-A23)

**Portal-PATCH** `onboardingAufgabeImPortalAendern` (U:1104)

- Die Auswahl `vorher` (U:1129) bekommt `herkunft` und `entfaelltAm`.
- Prüfungen, sobald `herkunft != null`:

  | Bedingung | Antwort |
  |---|---|
  | Rolle nicht in `HR_EDIT_ROLES` | 403 „Ausstattungsaufgaben bearbeitet nur die Personalabteilung.“ Das sperrt SERVICE, VORGESETZTER und EINRICHTUNGSLEITUNG. |
  | `assignee` oder `dueDate` im Body | 409 „Zuständigkeit und Fälligkeit in der Karte ‚Ausstattung & Zugänge‘ ändern.“ (gilt auch für die Hinweis-Aufgabe; ihre Fälligkeit ändert `hinweis-aendern`, F20) |
  | `entfaelltAm` gesetzt und `isCompleted` im Body | 409 `AUFGABE_ENTFAELLT` |

- Die Prüfung auf „entfällt“ sitzt **in** der Transaktion: Das bedingte `updateMany` (U:1158) bekommt `entfaelltAm: null` ins WHERE; bei count 0 liest der PATCH die Aufgabe nach der Linksperre erneut und antwortet 409 `AUFGABE_ENTFAELLT`, wenn sie inzwischen entfallen ist (sonst wie bisher „keine Änderung“).
- `progress` der Antwort (U:1236–1240) zählt ohne Entfallene: `count({ onboardingId, entfaelltAm: null })` und `count({ onboardingId, isCompleted: true, entfaelltAm: null })` – dieselbe Aussage wie `checklistFortschritt` (F2).

**Link-PATCH** `oeffentlichAendern` (U:672): Steht `entfaelltAm` und kommt `isCompleted` mit, folgt 409 `AUFGABE_ENTFAELLT`. Ein Kommentar bleibt möglich. **Wo geprüft wird:** nicht am Lesestand vor der Transaktion (U:706–716, schmales `select`; dort kommt `entfaelltAm` nur für die Anzeige der Antwort hinzu). Ein gleichzeitiges „Streichen“ durch HR committet sonst dazwischen, und „wieder öffnen“ setzte eine gestrichene Aufgabe auf offen, während `entfaelltAm` stehen bliebe. Stattdessen:

- `aufgabeUmschaltenPerLink` (U:299) nimmt im Onboarding-Zweig `entfaelltAm: null` ins WHERE des bedingten `updateMany` (der Offboarding-Zweig bleibt unverändert, die Spalte gibt es dort nicht).
- Das erneute Lesen nach `linksSperrenIn` (`aufgabenZustaendigkeit`, U:156, Onboarding-Zweig um `entfaelltAm` erweitert) entscheidet: entfallen → 409 `AUFGABE_ENTFAELLT`, bevor geschrieben wird. Die HR-Karte sperrt denselben Link (S15, Schritt 2), die beiden Wege laufen also nacheinander.

**Detail-GET** (`[id]/route.ts:156`): `ausstattung` nur für `HR_EDIT_ROLES`, sonst `null`. Ein Test hält das, auch für den Fall, dass die Mandanten-Sperre der Middleware später gelockert wird: Er ruft den Route-Handler direkt (ohne Middleware) mit Sitzungen der Rollen EINRICHTUNGSLEITUNG und VORGESETZTER auf (beide `PORTAL_ROLES`, also zur Detailroute zugelassen) und erwartet `ausstattung === null`; `GET /api/onboarding/[id]/ausstattung` antwortet beiden mit 403, ebenso dem Schlüssel `SERVICE`. Eine Rolle `VIEWER` gibt es nicht (`UserRole`: SUPER_ADMIN, HR_LEITUNG, HR_SACHBEARBEITER, EINRICHTUNGSLEITUNG, VORGESETZTER, BEM_BEAUFTRAGTER, dazu `SERVICE` als API-Schlüssel).

- `ChecklistItem.description` enthält nur den Katalog-Hinweis für die Stelle, nie eine Bemerkung (Stolperstelle 13).
- `vorschau` liefert nur die Anzahlen `mitBemerkung` und `ausstattung`, keine Texte.

### 1.12 Webhook-Ausnahme und WEBHOOK-Regel (E-A16, F1)

**Neu in `EVENTS_OHNE_WEBHOOK`** (eigene Hinweiskonstante `AUSSTATTUNG_HINWEIS`):

- `onboarding-department-assigned`
- `onboarding-department-reminder`
- `onboarding-task-completed`
- `onboarding-department-completed`
- `onboarding-department-abgesagt`
- `onboarding-ausstattung-offen`

Wortlaut: „Webhooks auf dieses Ereignis feuern nicht: Die Mail enthält den Link der Stelle bzw. Angaben zur Ausstattung und wird deshalb nur per SMTP versendet.“

**`triggerWebhooks`** (`webhooks.ts:75`): Steht das Ereignis in der Liste, entfällt Schritt 2. Die Mail geht unverändert hinaus.

**`webhookAktiv(event)`** (D:297): Bei einem Ereignis aus der Liste liefert es sofort `false`.

- Damit wird SKIPPED wegen deaktivierter Vorlage im Onboarding nie mehr zu WEBHOOK, also nie mehr fälschlich „zugestellt“.
- Das deckt D:394–395, D:1262 und O:500 ab.
- Die WEBHOOK-Regel gilt nur noch im Offboarding. CLAUDE.md wird entsprechend angepasst (S20).

**`WebhookEvent`** (`webhooks.ts:34`) bekommt die beiden neuen Ereignisse.

### 1.13 Betreff-Sperren, Maskierung, Ereignisse, Vorlagen

**Betreff-Sperren**

- Neue Konstante `ONBOARDING_ABTEILUNG_BETREFF_OHNE = ["aufgabenliste", "aufgabenliste_html", "angaben", "angaben_html", "nachtrag_liste", "nachtrag_liste_html", "link", "magicLink"]` in `events.ts`. Sie gilt für:
  - `onboarding-department-assigned`
  - `-reminder`
  - `onboarding-task-completed` (plus `kommentar`, `kommentar_text`, F19)
  - `onboarding-department-abgesagt` (plus `erledigte_liste`, `erledigte_liste_html`)
- `onboarding-ausstattung-offen` sperrt `offene_liste`, `offene_liste_html` und `portalLink`.
- Der Text der 400 im PUT der Vorlagen (`email-templates/[id]/route.ts:56`) wird allgemein formuliert: „… steht 90 Tage im Versandprotokoll …“, ohne Bezug auf „Unterlagen“.
- `betreffOhne` wirkt **nur beim Speichern** einer Vorlage (`verboteneBetreffVariablen` im PUT). Beim Versand prüft es nur `unterlagen-dienst.ts` (`personenVorlagePruefen`), nicht der Versandkern der Abteilungsaufgaben. Die seit dem 24.09.2026 per SQL gespeicherten DB-Vorlagen der Onboarding-Abteilungsmails sind also nie geprüft worden; ihre Betreffzeilen prüft ein Handgriff nach dem Deploy (Abschnitt 3). Eine Versandprüfung für diese Ereignisse wird **nicht** gebaut (die Vorlagen ändert nur `ADMIN_ROLES`, und jeder spätere PUT prüft).

**Maskierung:** `FREITEXT_VARIABLEN` (`mailer.ts:486`) bekommt die Rohfelder `angaben`, `nachtrag_liste`, `erledigte_liste` und `offene_liste`, **nie** die `_html`-Felder.

**Ereignisse:** Neue Katalogeinträge direkt nach `onboarding-department-completed` (`events.ts:794`), Gruppe Onboarding, `wired: true`. Die Beispiel-Payloads sind fertiger Text, `events.ts` bleibt ohne Importe.

| Ereignis | An | Beispiel-Payload |
|---|---|---|
| `onboarding-department-abgesagt` | `{{email}}` | Stelle, Name, Vorgangsnummer, `erledigte_liste…`, `hat_erledigte` |
| `onboarding-ausstattung-offen` | `{{hr_postfach}}` | siehe 1.10, Sammelmail |

**Zusätzliche Felder in bestehenden Payloads**

| Ereignis | Neu | Quelle |
|---|---|---|
| `onboarding-department-assigned` | `angaben`, `angaben_html`, `nachtrag`, `nachtrag_liste`, `nachtrag_liste_html`, `hat_offene_aufgaben`, `arbeitsort` | `nachtrag*`/`hat_offene_aufgaben` nur über `ctx.nachtraege` (1.10) |
| `onboarding-department-reminder` | `arbeitsort` (über `mailFelder`) | `onboardingAbteilungsMailFelder` |
| `onboarding-task-completed` | `arbeitsort` (zusätzlich zu den Feldern unten) | Link-Weg: `onboardingOeffentlich` (U:541) über `onboardingAbteilungsMailFelder`, Auswahl `ONBOARDING_VORGANG_OEFFENTLICH` (1.8) |
| `onboarding-department-completed` | `arbeitsort` | wie oben |
| `onboarding-task-completed` | `hr_postfach`, `ist_erledigt`, `nur_kommentar`, `meldung_kurz` („erledigt“, „kommentiert“ oder „erledigt, mit Kommentar“) | `SmtpConfig.replyToEmail` (Muster `unterlagen-mail.ts:462`), An `{{hr_postfach}}` |
| `supervisor-link-created` | `ausstattung_angeboten` | |
| `supervisor-completed` | `ausstattung_kurz` | |

**E-A17 im Link-PATCH:** Die Transaktion (U:727–785) gibt `kommentarGeaendert` zurück. Nach dem Commit geht im **Onboarding** auch bei einem reinen Kommentar (nicht leer, geändert) die Mail `onboarding-task-completed` hinaus. Hakt die Stelle ab **und** kommentiert, geht genau eine Mail. Das Offboarding bleibt unverändert.

### 1.14 Löschfrist (E-A22)

`ausstattungFreitexteLeeren({ grenze, dryRun })` in `ausstattung-lauf.ts` läuft als eigener Block im Lauf „Aufbewahrung erzeugter Dokumente“ (`laeufe/dokumente-aufbewahrung.ts`), mit eigenem `try`.

**Betroffene Vorgänge**

- Status COMPLETED mit `completedAt < grenze`
- Status EXPIRED mit `expiredAt < grenze`; ist `expiredAt` leer, gilt `updatedAt < grenze` (konservativ: `updatedAt` liegt nie vor dem Abbruch)

**Was geleert wird** (`inhaltGeleertAm: null` im WHERE, die Zeilen bleiben stehen):

- `OnboardingAusstattung`: `bemerkung` und `angabe` werden `null`
- `OnboardingStellenHinweis`: `text` wird `""`
- In beiden wird `inhaltGeleertAm` gesetzt

**Probelauf und Antwort**

- Der Probelauf zählt nur.
- Antwortfeld: `ausstattung: { geleert, hinweiseGeleert, fehler }` bzw. im Probelauf `{ wuerdeLeeren }`.
- Audit je Vorgang `AUSSTATTUNG_FREITEXTE_GELEERT` mit Anzahlen.

Der Lauf ist ein Löschlauf (`loescht`) und hat schon einen Probelauf. Ohne eingeschalteten Lauf wird nie geleert.

### 1.15 Protokoll

**`AUSSTATTUNG_AUDIT`** (Labels in `AUSSTATTUNG_AUDIT_LABELS`, eingehängt per Spread in `audit-log-content.tsx:50–89`):

| Bereich | Code |
|---|---|
| Katalog | `AUSSTATTUNG_POSITION_ANGELEGT` |
| | `AUSSTATTUNG_POSITION_GEAENDERT` (Details `aenderungen { feld: { von, nach } }`) |
| | `AUSSTATTUNG_POSITION_GELOESCHT` |
| | `AUSSTATTUNG_AUSBLENDUNG_GEAENDERT` |
| | `AUSSTATTUNG_VORSCHLAEGE_UEBERNOMMEN` (Details `angelegt`, `vorhanden` und je angelegter Position `positionId`, `vorschlagSchluessel`, Stelle, Titel — über `createManyAndReturn`, damit auch eine wieder angelegte Vorschlags-Position einen zuordenbaren Anlage-Eintrag hat) |
| Vorgang | `ONBOARDING_ARBEITSORT_GEAENDERT` |
| | `AUSSTATTUNG_AUFGABEN_ANGELEGT` |
| | `AUSSTATTUNG_FAELLIGKEIT_ANGEHOBEN` (F22, nur Anzahl und Stellen-Schlüssel) |
| | `AUSSTATTUNG_HR_HINZUGEFUEGT` |
| | `AUSSTATTUNG_HR_GEAENDERT` |
| | `AUSSTATTUNG_HR_GESTRICHEN` |
| | `AUSSTATTUNG_HINWEIS_GEAENDERT` |
| | `AUSSTATTUNG_HINWEIS_GESEHEN` |
| | `AUSSTATTUNG_HINWEIS_UEBERNOMMEN` |
| | `AUSSTATTUNG_SAMMELMAIL_GESENDET` |
| | `AUSSTATTUNG_FREITEXTE_GELEERT` |

**Bezug und Inhalt der Einträge**

- Katalog-Einträge stehen mit `processType: "SYSTEM"`, die übrigen mit `onboardingId` und `"ONBOARDING"`.
- `details` enthält nur IDs, Schlüssel, Katalogtitel und Anzahlen. Bemerkung, Angabe und Hinweis erscheinen nur als Länge, nie als Text.

---

## 2. Arbeitsschritte

#### S0 Eigene Werkzeuge und eigene Datenbank für den Worktree (vor S1)

- **Warum:** Der Worktree `.claude/worktrees/ausstattung-zugaenge` hat nur ein leeres `node_modules`. Node, Jest, tsc und `@prisma/client` kommen deshalb aus `HR_Portal_CREDO/node_modules`, also aus dem Hauptcheckout auf Branch `ux-umbau`. Der Generator in `schema.prisma` hat kein `output`: Ein `npx prisma generate` im Worktree überschriebe `node_modules/.prisma/client` des Hauptcheckouts (dessen Dev-Server fragte danach `herkunft`, `eilt`, `entfaelltAm` usw. ab), und ein Generate im Hauptcheckout nähme dem Worktree mitten im Bau die neuen Modelle (tsc rot). Außerdem fehlt die `.env`: Die Prisma-CLI liest nur `.env`, nicht `.env.local`; `npx prisma validate` scheitert dort mit P1012 „Environment variable not found: DATABASE_URL“ (geprüft; `migrate diff` mit `--from/--to-schema-datamodel` läuft auch ohne). Und die Dev-DB auf Port 5433 ist die gemeinsame Datenbank des Hauptcheckouts.
- **Schritte** (im Worktree, einmal):
  1. `npm ci` – eigener `node_modules` samt eigenem `.bin` und eigenem generierten Client; danach `npx prisma generate` (schreibt nur noch in den Worktree). Prüfen: `node -p "require.resolve('@prisma/client')"` zeigt in den Worktree.
  2. Eigene Datenbank `hr_portal_ausstattung` auf demselben Server (Port 5433): In `.env.local` **des Worktrees** `DATABASE_URL` auf diese Datenbank stellen und dieselbe Zeile in eine Worktree-`.env` schreiben (beide stehen in `.gitignore`, werden nie eingecheckt; Next liest `.env.local` vor `.env`, die Prisma-CLI nur `.env` – deshalb in beiden derselbe Wert).
  3. `npx prisma db push` (legt die Datenbank an) und `npm run db:seed` – nur gegen `hr_portal_ausstattung`. Die gemeinsame Dev-DB `hr_portal` wird in diesem Paket nie gepusht.
- **Abnahme:** `npx prisma validate` läuft ohne P1012; `npx tsc --noEmit` und `npx jest` sind auf dem unveränderten Stand grün (Ausgangslage festhalten, damit spätere Rotfärbungen zuzuordnen sind).
- **Wer den Hauptcheckout nutzt**, muss danach nichts neu generieren: Er wird von diesem Paket nicht berührt.
- **So umgesetzt (12.10.2026):** statt `npm ci` (mehrere hundert MB zusätzlich im OneDrive-Ordner) nur eine eigene Kopie von `node_modules/@prisma` und `node_modules/.prisma` im Worktree. `require.resolve('@prisma/client')` zeigt damit in den Worktree, `npx prisma generate` schreibt nur dorthin, alle übrigen Pakete kommen weiter aus dem Hauptcheckout. Datenbank `hr_portal_ausstattung` angelegt (`db push`) und mit `db:seed` befüllt; `.env` und `.env.local` des Worktrees zeigen darauf. Keine weiteren `npm install`/`npm ci` im Worktree.

**Pflicht am Ende jedes Schritts** (aus dem Arbeitsverzeichnis des Worktrees, mit S0 eingerichtet):

```bash
npx prisma generate            # nur wenn schema.prisma geändert wurde; schreibt seit S0 nur in den Worktree
npx prisma validate            # nur wenn schema.prisma geändert wurde; braucht die Worktree-.env aus S0
npx tsc --noEmit
npx next lint
npx jest <betroffene Tests>    # zuerst gezielt
npx jest                       # dann vollständig — Sperrklinke, Katalog- und Payload-Tests liegen quer
```

Grundregeln für alle Schritte:

- Nicht committen und nicht pushen, solange der Auftrag es nicht ausdrücklich verlangt.
- Neue Oberflächendateien haben in der Sperrklinke den Stand 0. Erlaubt sind nur Tokens (`bg-card`, `border-border`, `text-muted-foreground`, `text-foreground`, `bg-primary`/`text-primary-foreground`, `credo-*` mit `/10`), `lucide-react`, `formatDatumDE` und `unterlagen/dialog-rahmen.tsx`.
- In bestehenden Dateien dürfen keine Palettenklassen hinzukommen. Neues Markup gehört deshalb in Komponenten unter `src/components/ausstattung/`, die bestehende Seite bindet sie nur ein.
- Server-Code in `src/lib` hat keine `toLocale…String` ohne `timeZone`.
- Browserproben (S4, S9, S14, S16, S20) laufen nur gegen die Datenbank `hr_portal_ausstattung` aus S0 und mit dem Dev-Server **des Worktrees**, nie gegen die gemeinsame Dev-DB.
- **Jede neue reine Funktion bekommt im selben Schritt ihren Unit-Test** in `src/__tests__/lib/ausstattung.test.ts` (bzw. `abteilungsaufgaben.test.ts` für Funktionen dort). Route- und DB-Tests ersetzen ihn nicht. Die Schritte nennen die Fälle.

### A1 – Katalog und Arbeitsort

#### S1 Schema und Grundkonstanten

- **Ziel:** Das vollständige Schema für Stufe 1 (1.2) steht. Später braucht kein Schritt mehr eine Schemaänderung, und auf dem Server gibt es einen einzigen Push.
- **Dateien:**
  - `prisma/schema.prisma`: alle Modelle und Ergänzungen aus 1.2; die bestehende Organisation-Relation wird benannt.
  - **neu** `src/lib/ausstattung.ts`: nur Konstanten aus 1.3 (Arten, Quellen, Herkunft, Grenzen, `ANGABEN_KATALOG`, `PERSONENGRUPPEN`, `EINRICHTUNGSARTEN`, `NICHT_ERLAUBTE_STELLEN`, `BEMERKUNG_HINWEIS`, `AUSSTATTUNG_KATEGORIE`, `ORDER_BASIS`, `AUSSTATTUNG_AUDIT` und `_LABELS`), Typen.
  - `src/app/(portal)/audit-log/audit-log-content.tsx`: Labels per Spread einhängen.
- **Tests:**
  - **neu** `src/__tests__/lib/ausstattung-schema.test.ts`: Die Wertlisten in den Schemakommentaren stimmen mit den Konstanten überein; `PERSONENGRUPPEN` und `EINRICHTUNGSARTEN` haben genau die Enumwerte (`import { $Enums } from "@prisma/client"`, 1.3); `ANGABEN_KATALOG` hält die Grenzen ein (≤ 300).
  - `src/__tests__/components/audit-log-labels.test.tsx`: Schleife über `AUSSTATTUNG_AUDIT`.
- **Abnahme:**
  - `npx prisma validate` (mit der Worktree-`.env` aus S0).
  - `git show main:prisma/schema.prisma > <scratch>/schema-main.prisma`, danach `npx prisma migrate diff --from-schema-datamodel <scratch>/schema-main.prisma --to-schema-datamodel prisma/schema.prisma --script`. Erwartet werden nur `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX` und `ADD CONSTRAINT` für **neue** Spalten. Nicht vorkommen dürfen `DROP`, `RENAME` oder Änderungen an `onboarding_processes_organizationId_fkey`. Das Skript wird in die Übergabe geschrieben.
  - Dazu die Pflichtprüfung.
- **Abhängigkeiten:** S0.

#### S2 Reine Katalogregeln und Zod

- **Ziel:** Alle Katalogregeln liegen rein und getestet vor.
- **Dateien:**
  - `src/lib/ausstattung.ts`: `positionPruefen`, `positionGiltAm`, `positionenFuer`, `formularGruppen`, `adressLuecken`, `aehnlicheVorlagenpunkte`, `aufgabenTitel`, `VORSCHLAEGE`, `MELDUNGEN` (Katalogteil).
  - `src/lib/abteilungsaufgaben.ts`: `onboardingEmpfaengerEinrichtung`.
  - `src/lib/validations/abteilungsaufgaben.ts`: `schluesselFeld` exportieren (heute nicht exportiert, :64), ohne Änderung am Verhalten.
  - **neu** `src/lib/validations/ausstattung.ts`: `katalogPositionSchema`, `katalogPositionAenderungSchema` (beide ohne A4-Felder und `vorschlagSchluessel`, 1.4), `ausblendungSchema`.
- **Tests:**
  - **neu** `src/__tests__/lib/ausstattung.test.ts`. Abzudecken:
    - Filter nach Arbeitsort, Einrichtungsart, Ausblendung, Personengruppe und Vorgangsart
    - Stelle ohne Adresse fehlt, HR nie
    - Regel „entgeltrelevant nur HR“
    - Stelle `MITARBEITER` bzw. `VORGESETZTER` ergibt einen Fehler (je Eintrag aus `NICHT_ERLAUBTE_STELLEN`, R11)
    - Vorauswahl ist Teilmenge
    - ANGABE nur aus dem Katalog
    - Adresslücken
    - Ähnlichkeit
    - Titel mit Option
    - `formularGruppen` entfernt `hinweisStelle`, `ausgabeKennung`, `entgeltrelevant`, `vorschlagSchluessel`
    - `VORSCHLAEGE`: alle bestehen `positionPruefen` und haben eindeutige Schlüssel
  - **neu** `src/__tests__/lib/ausstattung-validierung.test.ts`: dazu „`ausgabeKennung`, `rueckgabeKategorie`, `beiAustritt` und `vorschlagSchluessel` im Body kommen nicht im geparsten Ergebnis an“ (POST- und PATCH-Schema).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S1.

#### S3 Katalog-Dienst und Einstellungsrouten

- **Ziel:** Der Katalog lässt sich über die API pflegen, jede Änderung wird protokolliert (R18), und die Warnungen werden auf dem Server berechnet.
- **Dateien:**
  - **neu** `src/lib/ausstattung-katalog.ts`: `katalogLaden`, `positionAnlegen`, `positionAendern` (nur echte Änderungen, mit Audit `vorher`/`nachher`), `positionLoeschen` (409 bei Verwendung), `ausblendungSetzen`, `vorschlaegeUebernehmen` (`createMany` mit `skipDuplicates`), `warnungenBerechnen`.
    - Die Warnungen bestehen aus den Adresslücken, den Vorlagenpunkten aktiver Onboarding-Checklisten (`ChecklistTemplateItem`) und der Freigabeliste (`ladeErlaubteDomains`, `empfaengerFreigegeben`).
    - `katalogAusschnittLaden` (für S8 schon hier).
  - **neu** `src/app/api/settings/ausstattung/route.ts` (GET, POST), `[id]/route.ts` (PATCH, DELETE), `[id]/ausblendung/route.ts` (PUT), `vorschlaege/route.ts` (POST), alle `adminHandler` mit `logLabel: "Einstellungen/Ausstattung"`. Route-Dateien exportieren nur die HTTP-Methoden.
  - `src/app/api/settings/departments/route.ts`: GET liefert je Eintrag zusätzlich `ausserhalbFreigabe: boolean` (E-A27).
- **Tests:**
  - **neu** `src/__tests__/api/settings-ausstattung.test.ts` (Gerüst von `settings-departments.test.ts`). Abzudecken:
    - 401 und 403
    - Anlegen immer ausgeschaltet
    - Zod-Fehler 400
    - `positionPruefen` 400
    - P2002 409
    - PATCH ohne Änderung schreibt nichts
    - Audit mit `vorher`/`nachher`
    - DELETE in Verwendung 409
    - Ausblendung nur für zentrale Positionen
    - Vorschläge zweimal ergeben `angelegt` 0
    - POST/PATCH mit `vorschlagSchluessel` oder A4-Feldern schreiben diese nicht
  - Bestehend: `src/__tests__/api/settings-departments.test.ts`, die GET-Erwartung um `ausserhalbFreigabe` ergänzen.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S2.

#### S4 Reiter „Ausstattung & Zugänge“ in den Einstellungen

- **Ziel:** Oberfläche nach Mockup 6.7, nur Admin-Rollen.
- **Dateien:**
  - **neu** `src/components/ausstattung/katalog-tab.tsx`:
    - Liste mit den Filtern Stelle und Einrichtung, auf dem Client
    - Spalten Position, Art, Stelle, Gilt für, Fällig, Status
    - Warnungen über der Liste und je Zeile
    - „Vorschläge übernehmen…“ als `DialogRahmen`
    - „+ Position“
    - Ein- und Ausschalten, Ausblenden für die gefilterte Einrichtung
    - Löschen mit `DialogRahmen`, bei 409 die Meldung des Servers
  - **neu** `src/components/ausstattung/position-dialog.tsx`: Formular über `DialogRahmen` mit `mitPflichtfeldern`. Die Felder wechseln mit der Art, Optionen eine je Zeile, Personengruppen als Chips. Vor dem Senden prüft `positionPruefen`. Stufe-2-Felder werden **nicht** gezeigt.
  - `src/app/(portal)/einstellungen/einstellungen-content.tsx`:
    - `"ausstattung"` in `TAB_IDS` (:165) und `tabs` (:197–206, neben „Abteilungen“)
    - Render-Zeile (:250–258), Import, Kopfkommentar (:6–18)
    - Reiterleiste mit `flex-wrap`
    - In `DepartmentsTab` je Zeile der Hinweis „außerhalb der Freigabeliste“, nur mit Tokens (`text-credo-rot`)
- **Tests:**
  - **neu** `src/__tests__/components/ausstattung-katalog-tab.test.tsx` (Muster `einstellungen-abteilungen.test.tsx`, ohne Mock für `next/navigation`): Anzeige, Filter, Dialog, Fehlertext des Servers, Vorschläge.
  - `src/__tests__/components/einstellungen-abteilungen.test.tsx`: Freigabe-Hinweis.
  - `ui-sperrklinke` bleibt grün, die neuen Dateien halten Stand 0.
- **Abnahme:** Pflichtprüfung. Eine Probe im Browser ist optional: `npm run dev`, Katalog anlegen und Vorschläge übernehmen.
- **Abhängigkeiten:** S3.

#### S5 Arbeitsort am Vorgang

- **Ziel:** E-A10 vollständig: anlegen, anzeigen, ändern bis zum Link. Empfänger **aller** Onboarding-Abteilungsaufgaben am Arbeitsort.
- **Dateien:**
  - `src/lib/validations/onboarding.ts`: `arbeitsortId` im Anlege-Schema; `arbeitsortSchema` in `validations/ausstattung.ts`.
  - `src/app/api/onboarding/route.ts`: Prüfung (:147–155) auch für den Arbeitsort, Normalisierung, `create.data` (:232–256), Audit (:264–272).
  - **neu** `src/lib/onboarding-arbeitsort.ts` und **neu** `src/app/api/onboarding/[id]/arbeitsort/route.ts`.
  - `src/app/api/onboarding/[id]/route.ts`: `include` um `arbeitsort: { select: { id, name, type } }`.
  - `src/lib/abteilungsaufgaben-onboarding.ts`: O:96, O:130, O:299, O:372, O:429–450 mit `onboardingEmpfaengerEinrichtung`.
  - `src/app/api/onboarding/[id]/pdf-export/route.ts:117`.
  - `src/components/neuer-vorgang-modal.tsx`: Auswahl nach :382, Zustand und Zurücksetzen, Body nur bei Abweichung.
  - **neu** `src/components/ausstattung/arbeitsort-feld.tsx` (Anzeige und Ändern-Dialog); `detail-content.tsx`: `DetailData` (`arbeitsortId`, `arbeitsort`), Kopfzeile :1122–1124, Karte „Person“ :1425–1428 bindet `ArbeitsortFeld` ein (änderbar nur mit `darfBearbeiten && !supervisorToken && !istHrStatus`).
- **Tests:**
  - `src/__tests__/api/onboarding-anlegen.test.ts`: Arbeitsort fremd → 404, unbekannte, nicht UUID-förmige ID (`"org-2"`) → 404 (nicht 400), gleich der Einrichtung → `null`, abweichend → gespeichert.
  - **neu** `src/__tests__/api/onboarding-arbeitsort.test.ts`: 403, 404, 409 bei gesetztem Token, Audit.
  - `src/__tests__/lib/abteilungsaufgaben-onboarding.test.ts`: Empfänger am Arbeitsort für eine **Vorlagen**aufgabe, Mandantenprüfung bleibt auf `organizationId`.
  - `src/__tests__/components/neuer-vorgang-modal.test.tsx`: Body unverändert ohne Abweichung, mit `arbeitsortId` bei Abweichung.
  - Die Fake-DB (`abteilungs-fake-db.ts`) ändert sich nicht, `arbeitsortId` fehlt dort und gilt deshalb als Einrichtung.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S1, S2.

### A2 – Formular der Führungskraft

#### S6 Schrittliste und Fortschritt mit Merker

- **Ziel:** Alle Anzeigestellen des Fortschritts lesen den Merker. Ohne Merker bleibt alles wie heute (5 Schritte).
- **Dateien:**
  - `src/lib/validations/supervisor-data.ts`: `key`, `SUP_SCHRITT_AUSSTATTUNG`, `supSchritte`, `modalitaetenFortschritt` mit Merker.
  - `src/app/(portal)/dashboard/[id]/uebersicht-schritte.ts` (`SchritteStand` :66, Aufrufe :169 und :504).
  - `src/app/(portal)/dashboard/[id]/detail-content.tsx` (Typ :370, Aufruf :1495).
  - `src/app/(portal)/dashboard/dashboard-content.tsx` (Typ :110, Aufruf :553).
  - `src/app/api/onboarding/route.ts:447–449` (`select` um `mitAusstattung`).
- **Tests:** `src/__tests__/lib/modalitaeten-fortschritt.test.ts` neue Fälle („Schritt 5 von 6 · Ausstattung & Zugänge“, Kappung bei 6, `null` gilt als 5). Die bestehenden Erwartungen in `onboarding-uebersicht-schritte.test.ts:166,853`, `onboarding-uebersicht-spuren.test.tsx:136`, `stellenbezeichnung.test.ts:119–124` und `modalitaeten-fortschritt.test.ts:57–60` bleiben unverändert grün.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S1.

#### S7 Merker beim Erzeugen des Links, Migration, Einladungsmail

- **Ziel:** R2 vollständig umgesetzt.
- **Dateien:**
  - `src/lib/ausstattung-katalog.ts`: `ausstattungAngebotenIn`.
  - `src/lib/onboarding-einladung.ts`: Parameter (Pflicht), `create`, bedingtes `updateMany`, Rückgabe `mitAusstattung`, Mailfeld.
  - `src/app/api/onboarding/route.ts` (:278–287, :315–317).
  - `src/app/api/onboarding/[id]/supervisor-link/route.ts` (:174–181, :217–219; `VORGANG_INCLUDE` :70–74 bleibt unverändert, 1.9).
  - `prisma/seed-check.js` (Migration, Aufruf, Export).
  - `src/lib/events.ts` (Beispiel `supervisor-link-created` :575–584 + `ausstattung_angeboten`).
  - `src/lib/default-email-templates.ts`: `supervisor-link-created` :218, Block `{{#ausstattung_angeboten}}Im Formular können Sie auch angeben, was zum Arbeitsbeginn bereitstehen soll.{{/ausstattung_angeboten}}` in HTML und Text, Variablenliste :321.
- **Tests:**
  - `onboarding-einladung.test.ts` :115–119 bleibt grün (Schlüssel = Beispiel). An :386–403 kommt ein `tx`-Mock mit `supervisorData.updateMany`, an :418–422 die Rückgabe mit `mitAusstattung`. Neue Fälle: angeboten, nicht angeboten, Erneuern mit `currentStep > 0` lässt den Merker unverändert.
  - `onboarding-anlegen.test.ts`: :534–538 (`create` mit `mitAusstattung`), :608–618 (Payload), `mockTx` (:32–41).
  - `supervisor-link.test.ts`: `jest.mock("@/lib/ausstattung-katalog", …)`; die Link-Sperre trägt den Arbeitsort, mit dem der Katalog gefragt wurde; Arbeitsort zwischen Lesen und Sperre geändert → 409, kein Merker, keine Mail (Review A2). Ebenso `onboarding-einladung.test.ts` (WHERE mit `arbeitsortId`, fehlender Wert → `null`) und `onboarding-anlegen.test.ts` (WHERE).
  - **neu** `src/__tests__/lib/ausstattung-katalog-lesen.test.ts` (eigener `mockPrisma`, weil `supervisor-link.test.ts` beide Funktionen nur mockt): `ausstattungAngebotenIn` und `katalogAusschnittLaden` mit Arbeitsort ≠ Einrichtung. Abzudecken: Einrichtungsart kommt vom Arbeitsort, nicht von der Einrichtung; eigene Positionen des Arbeitsorts ja, der Einrichtung nein; Ausblendung am Arbeitsort wirkt, an der Einrichtung nicht; Adresse der Stelle wird am Arbeitsort aufgelöst (Stelle ohne Adresse dort fehlt, HR nie); leerer Ausschnitt → `false`; `processType` ≠ EINSTELLUNG → `false`.
  - **neu** `src/__tests__/lib/ausstattung-migration.test.ts` (per `require("../../../prisma/seed-check.js")`): Plan und Merker.
  - `events-catalog.test.ts` bleibt grün.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S3, S6.

#### S8 Server des Formulars (GET und PUT)

- **Ziel:** R4 und R5. Der Ausschnitt geht an die Führungskraft, ihre Wahl wird gespeichert und gegen den Katalog dieses Vorgangs geprüft.
- **Dateien:**
  - `src/lib/ausstattung.ts`: `wahlPruefen`, `bemerkungQuelleNach`.
  - **neu** `src/lib/ausstattung-dienst.ts` mit:
    - `fuehrungskraftSichtLaden(onboarding)`: Ausschnitt nach `formularGruppen`, eigene Zeilen und Hinweise nur mit `quelle = FUEHRUNGSKRAFT`, `vorausgewaehltAnwenden = ausstattungGespeichertAm == null`, Texte (`BEMERKUNG_HINWEIS`, Hinweis „Änderungen nach dem Absenden bitte an die Personalabteilung“ (E-A26)).
    - **Katalog seit dem Speichern geändert (Review A2):** Eine eigene Zeile, deren Position der Ausschnitt mit anderer Art, Stelle, Bezeichnung oder anderem Angabe-Feld führt, steht in der **gespeicherten** Form unter der gespeicherten Stelle, mit `nichtMehrImKatalog` und `imKatalogGeaendert` (Formular: „inzwischen geändert“); die neue Form fehlt, bis die Zeile abgewählt und das Formular neu geladen ist (eine Position je Vorgang). `wahl` ist damit genau der gespeicherte Stand, und die Zusammenfassung vor dem Absenden zeigt, was abgegeben wird und was HR in Karte und PDF sieht – der POST frischt die Momentaufnahme nicht auf und braucht deshalb keine eigene Prüfung.
    - **Bemerkungsfeld einer Zeile außerhalb des Ausschnitts** nur mit gespeicherter Bemerkung (`bemerkungNurGespeichert`, fällt mit ihr weg); bei geänderter Form zusätzlich, wenn der Ausschnitt es für die Position anbietet (dann mit dessen Platzhalter). Sonst entstünde ein Freitextfeld, das die Verwaltung bewusst nicht wollte.
    - `fuehrungskraftWahlSpeichernIn(tx, onboarding, eingabe, jetzt)`: löscht nur FK-Zeilen und FK-Hinweise und legt sie neu an (Momentaufnahme aus dem Katalog bzw. aus der bestehenden Zeile), setzt `ausstattungGespeichertAm`.
  - `src/lib/validations/ausstattung.ts`: `modalitaetenAusstattungSchema`.
  - `src/app/api/modalitaeten/[token]/route.ts`:
    - GET (:122–147) liefert `ausstattung` nur bei `supervisorData?.mitAusstattung`, sonst `null`, und schreibt nichts.
    - PUT ergänzt das Schema (:34–83).
    - Nach :287 folgt 400 „Ausstattung ist für dieses Formular nicht vorgesehen.“, wenn kein Merker gesetzt ist.
    - `currentStep` wird gekappt (F21).
    - Die Transaktion (:355–379) sperrt zuerst den Vorgang bedingt, sobald `ausstattung` oder `hinweise` mitkommen: `updateMany` mit `supervisorToken: token`, `supervisorSubmittedAt: null` und `status notIn HR_STATUS`; count 0 ergibt 409.
    - Danach Upsert, Kostenstellen, `fuehrungskraftWahlSpeichernIn`. Eigene Fehlerklasse für 400 aus `wahlPruefen` innerhalb der Transaktion (Muster `BereitsEingereicht`).
  - `src/lib/formular-fehler.ts`: `FELD_BEZEICHNUNGEN`.
- **Tests:**
  - **neu** `src/__tests__/api/modalitaeten-ausstattung.test.ts` (Muster `modalitaeten.test.ts:9–56`). Abzudecken:
    - GET ohne Merker liefert `null`; mit Merker kommen Ausschnitt und eigene Wahl, aber kein `hinweisStelle`, keine HR-Zeilen
    - GET schreibt nichts
    - PUT mit fremder Position oder Option ergibt 400
    - PUT ohne Merker ergibt 400
    - `[]` löscht nur FK-Zeilen, ein fehlendes Feld lässt alles stehen
    - inzwischen ausgeschaltete Position aus der eigenen Wahl bleibt erlaubt
    - Position, deren Art bzw. Stelle der Katalog seit dem Speichern geändert hat: GET zeigt die gespeicherte Form markiert, PUT behält die gespeicherte Momentaufnahme; Position außerhalb des Katalogs ohne gespeicherte Bemerkung + neue Bemerkung → 400 (Review A2)
    - eingereicht ergibt 409
  - `src/__tests__/api/modalitaeten.test.ts`: Mock bekommt die neuen Modelle (bzw. `jest.mock("@/lib/ausstattung-dienst")`); `$transaction` bleibt bei 2.
  - `src/__tests__/lib/supervisor-grenzen.test.ts`: Ein neuer Fall verlangt, dass die Route `modalitaetenAusstattungSchema` einbindet und die Grenzen aus `GRENZEN` stammen.
  - `formular-fehler.test.ts`.
  - `ausstattung.test.ts`: `wahlPruefen` (Position außerhalb des Ausschnitts, aber in der eigenen Momentaufnahme → erlaubt; fremde Option → Fehler; Option aus `bestehend.auswahl` einer inzwischen geänderten Position → erlaubt; doppelte Position; JA_NEIN ohne `gewaehlt: true`; ANGABE ohne `angabe`; Hinweis für fremde Stelle) und `bemerkungQuelleNach` (alle vier Übergänge).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S3, S7.

#### S9 Formularschritt (Oberfläche)

- **Ziel:** Mockups 6.1 und 6.2. Laufende Formulare springen nicht (Plan Abschnitt 14).
- **Dateien:**
  - **neu** `src/components/ausstattung/ausstattung-schritt.tsx`:
    - Gruppen je Stelle mit dem Satz „Diese Angaben erhält …“
    - JA_NEIN als Häkchen, AUSWAHL als Chips; das Bemerkungsfeld klappt erst nach einer Wahl auf und trägt seinen eigenen Platzhalter
    - ANGABE als Textfeld mit Hilfe
    - „Weitere Hinweise an …“ je Stelle
    - `BEMERKUNG_HINWEIS`; Zeichenzähler aus `GRENZEN`
    - „Weiter“ nie gesperrt (R3)
    - Leerer Ausschnitt trotz Merker: Hinweis, „Weiter“ frei
    - `onNext({ ausstattung, hinweise })`
  - **neu** `src/components/ausstattung/ausstattung-zusammenfassung.tsx` („5. Ausstattung & Zugänge“, Kurzform je Stelle, Zahl der Bemerkungen).
  - `src/app/modalitaeten/[token]/page.tsx`:
    - `schritte = supSchritte(...)`, `currentStep` kappen (:364)
    - :532, :570 und :584–609 (Nummer `idx + 1`) sowie :626–627 auf `schritte`
    - Weiche :630–643 auf `schritt.key`
    - Typ `ModalitaetenData` (:60)
    - Zusammenfassung bindet die neue Komponente zwischen :1845 und :1847 ein
    - Platzhalter der Zusatzvereinbarungen (:1664) wird „z. B. besondere Regelungen (Ausstattung bitte im Schritt „Ausstattung & Zugänge“)“, nur wenn der Schritt angeboten wird, sonst „z. B. besondere Regelungen“ (E-A24, „Dienstwagen“ entfällt)
    - **Keine** neuen Klassen in `page.tsx` außer denen bestehender Zeilen
- **Tests:**
  - **neu** `src/__tests__/components/modalitaeten-ausstattung.test.tsx` (Muster `modalitaeten-kostenstellen.test.tsx:31–134`, Fixture `currentStep: 3, mitAusstattung: true`). Abzudecken:
    - Schritt 5 von 6
    - Bemerkung erst nach Wahl
    - Vorauswahl nur ohne `ausstattungGespeichertAm`
    - Weiter sendet `{ ausstattung, hinweise, currentStep: 5 }`
    - Zusammenfassung zeigt Kurzform
    - ohne Merker 5 Schritte wie bisher
  - Bestehend grün: `modalitaeten-kostenstellen.test.tsx`, `modalitaeten-stellenbezeichnung.test.tsx`.
- **Abnahme:** Pflichtprüfung. Probe im Browser: Formular mit und ohne Merker durchklicken.
- **Abhängigkeiten:** S8.

#### S10 HR liest mit: Reiter „Vorgesetzter“, PDF, HR-Mail

- **Ziel:** Die Wahl ist für HR sichtbar, nur lesend (A2-Umfang).
- **Dateien:**
  - `src/lib/ausstattung.ts`: `ausstattungsUebersichtBauen` (erste Fassung: Gruppen, Zeilen, Hinweise, Angaben, `zustand` nach der Zustandsregel in 1.6, `satz`, ohne Aufgaben und Aktionen); `ausstattungKurz`.
  - `src/lib/ausstattung-dienst.ts`: `ausstattungUebersichtLaden(onboarding, session)` gibt bei fehlendem `HR_EDIT_ROLES` `null` zurück, **ohne** die Datenbank zu fragen. Sie nutzt die übergebene Vorgangszeile (Status, `supervisorSubmittedAt`, `supervisorData`, `organizationId`, `arbeitsortId`) und lädt den Vorgang **nicht** ein zweites Mal – nur die eigenen Tabellen (`onboardingAusstattung`, `onboardingStellenHinweis`) und den Katalogausschnitt für `hinzufuegbar`. Die neuen Tabellen kommen bewusst **nicht** ins `include` der Detailroute: `...safeOnboarding` gäbe sie sonst an alle `PORTAL_ROLES` weiter (R16).
  - `src/app/api/onboarding/[id]/route.ts`: `...{ ausstattung: await ausstattungUebersichtLaden(...) }` nach :163.
  - **neu** `src/components/ausstattung/modalitaeten-ausstattung-karte.tsx`: fünfte Karte, exportiert, mit Verweis „Bearbeiten im Reiter Checkliste“. In `detail-content.tsx` nach :3816 einbinden, dazu `DetailData.ausstattung`.
  - `src/app/api/onboarding/[id]/pdf-export/route.ts`: `include` um `ausstattung` und `stellenHinweise` mit `?? []`.
  - `src/lib/pdf-export-onboarding.ts`: `ctx.ausstattung?` und ein Abschnitt nach :711. Vor jeder Zeile (Position, Bemerkung, Hinweis) wird ihre **echte** Höhe reserviert (`dataRowHoehe`, dieselben Breiten wie `dataRow`), keine feste Reserve: Ein langer Hinweis (bis 1000 Zeichen) nahe am Seitenende bräche pdfkit sonst selbst um – Seite ohne Kopfzeile, danach eine fast leere (Review A2).
  - `src/app/api/modalitaeten/[token]/route.ts`: `ausstattung_kurz` (:579–592). Das Laden steht in einem eigenen `try/catch` (Fehler loggen, Feld `""`), damit die HR-Mail `supervisor-completed` nie daran scheitert.
  - `src/lib/events.ts`: Beispiel `supervisor-completed` :597.
  - `src/lib/default-email-templates.ts`: `supervisor-completed` :918, Zeile `{{#ausstattung_kurz}}Ausstattung: {{ausstattung_kurz}}{{/ausstattung_kurz}}`, Variablenliste :1004.
  - **Testhilfe, aus S12 vorgezogen:** `src/__tests__/hilfen/abteilungs-fake-db.ts` bekommt jetzt schon die Tabellen `onboardingAusstattung`, `onboardingAusstattungAufgabe`, `onboardingStellenHinweis`, `onboardingAusstattungAenderung` (`findMany`/`findUnique`/`create`/`createMany`/`update`/`updateMany`/`delete`/`deleteMany`), `checklistItem.create`/`delete`/`deleteMany`, `dbLeeren` und `smtpConfig.replyToEmail`. Ab S10 laufen Detail-GET und Modalitäten-POST über diese Tabellen (`onboarding-abteilungen.test.ts:496ff` und :651); ohne sie ist das Repo nach S10 rot. Leere Tabellen als Vorgabe, damit bestehende Fälle unverändert bleiben.
- **Tests:**
  - **neu** `src/__tests__/components/modalitaeten-ausstattung-karte.test.tsx`.
  - **neu** `src/__tests__/api/onboarding-pdf-ausstattung.test.ts`; darin auch ein 1000-Zeichen-Hinweis 20 bis 120 pt vor dem Seitenende: Seitenwechsel samt Kopfzeile vor der Zeile, nie ein Umbruch durch pdfkit (Review A2).
  - **neu** `src/__tests__/api/onboarding-ausstattung-lesen.test.ts` (R16): Route-Handler direkt aufrufen (ohne Middleware, also ohne deren Mandanten-Sperre). `HR_EDIT_ROLES` bekommen die Übersicht; EINRICHTUNGSLEITUNG und VORGESETZTER (beide `PORTAL_ROLES`) bekommen `ausstattung === null`, und `ausstattungUebersichtLaden` fragt für sie die neuen Tabellen nicht ab. Es gibt keine Rolle `VIEWER`.
  - `src/__tests__/lib/ausstattung.test.ts`: `ausstattungKurz` („6 Positionen für 3 Stellen“, nur Hinweise, ANGABE zählt nicht, leer → `""`) und `ausstattungsUebersichtBauen` als **Zustandsmatrix** (eingereicht ja/nein × `mitAusstattung` true/false/null × Status laufend/COMPLETED/EXPIRED × Rolle HR/keine HR): `BEARBEITBAR` nach Abgabe auch bei `mitAusstattung = false`, beide Sätze von `ENTWURF`, `hinzufuegbar` nur bei `BEARBEITBAR`.
  - `src/__tests__/api/unterlagen-hr-routen.test.ts`: `jest.mock("@/lib/ausstattung-dienst", () => ({ ausstattungUebersichtLaden: jest.fn(async () => null) }))` nach dem Muster der schon gemockten Abteilungsübersicht (:57). Die unterlagen-fake-db kennt die neuen Tabellen nicht, und :361 verlangt genau einen `onboardingProcess.findUnique` – beides bleibt so.
  - `src/__tests__/api/onboarding-abteilungen.test.ts` (Detail-GET :496ff, `modalitaetenAbsenden` :651): grün mit der erweiterten Fake-DB.
  - `src/__tests__/api/onboarding-kostenstellen-export.test.ts` bleibt grün (neue Felder optional).
  - `onboarding-hr-mails.test.ts`: `ausstattung_kurz`; dazu ein Fall „Laden von `ausstattung_kurz` wirft → Mail geht trotzdem, Feld leer“.
  - `src/__tests__/api/modalitaeten.test.ts`: `mockPrisma` bekommt für `ausstattung_kurz` die Lesemethoden (Vorgabe `[]`).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S8.

### A3 – Aufgaben, Karte, Mails

#### S11 Webhook-Ausnahme (E-A16, F1)

- **Ziel:** Die Onboarding-Abteilungsereignisse gehen nur noch per Mail, die WEBHOOK-Regel gilt nur im Offboarding. Der Schritt kommt früh, bevor die Payloads wachsen.
- **Dateien:**
  - `src/lib/ereignis-liste.ts`: `AUSSTATTUNG_HINWEIS`, vier bestehende Onboarding-Ereignisse in `EVENTS_OHNE_WEBHOOK`. Die zwei neuen folgen mit S18 und S19, zusammen mit ihren Katalogeinträgen.
  - `src/lib/webhooks.ts`: Schritt 2 überspringen, `WebhookEvent`.
  - `src/lib/abteilungsaufgaben-dienst.ts`: `webhookAktiv` (:297).
- **Tests:**
  - `src/__tests__/lib/ereignis-liste.test.ts` :98–124 (Liste mit Hinweis) und :126–141 (Schlüsselmenge = Paket + Unterlagen + BEM + individuelle Mail **+ zentral gesperrte Onboarding-Ereignisse**, als eigene, benannte Liste im Test).
  - `src/__tests__/lib/email-dispatch.test.ts`: Ein Ereignis aus der Liste ruft `webhookConfig.findMany` nicht auf, die Mail geht trotzdem.
  - `src/__tests__/lib/abteilungsaufgaben-dienst.test.ts`: Neuer Fall „Onboarding, Vorlage aus, aktiver Webhook → SKIPPED, `sentAt` bleibt null“.
  - Die Offboarding-WEBHOOK-Tests (`abteilungsaufgaben-dienst.test.ts:266–290, 683`, `abteilungsaufgaben.test.ts:445–475`) bleiben grün.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S0. Kann parallel zu A1/A2 laufen, **nicht** parallel zu Strang 3 (S12–S19): S11 ändert `abteilungsaufgaben-dienst.ts`, `ereignis-liste.ts` und `webhooks.ts`, die S13, S17, S18 und S19 ebenfalls ändern.

#### S12 Aufgaben anlegen, Fälligkeit, „Eilt“, Nachholen

- **Ziel:** R6, R14 (Fälligkeit beim Anlegen **und** beim Versand, F22), E-A12. Aus der Wahl werden nach der Abgabe Aufgaben; ein Fehlschlag wird nachgeholt.
- **Dateien:**
  - `src/lib/ausstattung.ts`: `sollAufgaben`, `ausstattungsFaelligkeit`, `anzuhebendeAufgaben`, `vorlaufWarnung`, `HINWEIS_AUFGABE_BESCHREIBUNG`.
  - **neu** `src/lib/ausstattung-daten.ts`: `ausstattungsStandLaden`.
  - **neu** `src/lib/ausstattung-aufgaben.ts`: `ausstattungsAufgabenAnlegenIn` (1.7, Schritte 2–5).
  - `src/lib/abteilungsaufgaben-onboarding.ts`:
    - `vorgangSperrenIn`, `onboardingAusstattungNachholenIn` (mit `versandAn` und Schritt 7, F22), `onboardingAusstattungNachholen`
    - `faelligkeitenSetzen` mit `{ jetzt }` und Eilt-Zweig (`select` um `herkunft`)
    - Aktion (:285) nutzt das Nachholen und übergibt `versandAn` je Aktion (1.7, Aufrufer)
  - `src/app/api/modalitaeten/[token]/route.ts:563`: zweite Transaktion ruft das Nachholen auf.
  - **neu** `src/lib/ausstattung-lauf.ts`: `ausstattungNachholenLauf(jetzt)`.
  - `src/lib/laeufe/onboarding-erinnerungen.ts`: Abschnitt 3a mit eigenem `try`, Antwortfeld `ausstattung: { nachgeholt: { vorgaenge, aufgaben }, errors }`.
  - `src/lib/zeitplaner/bericht.ts`: `AUSWERTER.reminders` liest `b.objekt("ausstattung")`, Zähler „Ausstattung nachgeholt (Aufgaben)“.
- **Tests:**
  - **neu** `src/__tests__/lib/ausstattung-aufgaben.test.ts`, mit der in S10 erweiterten Fake-DB:
    - Abzudecken:
      - je Option eine Aufgabe
      - Titel, Kategorie, `orderIndex < 0`
      - zweiter Aufruf legt nichts an
      - Hinweis ergibt Aufgabe mit −7 und `description = HINWEIS_AUFGABE_BESCHREIBUNG`
      - informierte Stelle ergibt Eintrag NEU und WIEDER_OFFEN samt Audit
      - Vorgang EXPIRED legt nichts an
      - Sperrreihenfolge über `invocationCallOrder`: Vorgang vor Links vor `create`
  - `src/__tests__/lib/ausstattung.test.ts`:
    - `sollAufgaben` (JA_NEIN eine mit `option ""`, AUSWAHL je Option, ANGABE und gestrichene keine, `orderIndex` nach `ORDER_BASIS`)
    - `ausstattungsFaelligkeit` (Berliner Kalendertag: `jetzt` 23:30 UTC am Vortag zählt schon als nächster Tag; Sommerzeitwechsel Ende März und Ende Oktober; `eilt` nur bei angehobener Frist; `tage = null` → `null`)
    - `anzuhebendeAufgaben` (noch nie versendet → alle überfälligen; `createdAt` vor `lastSentAt` → keine; entfallen/erledigt/ohne Fälligkeit → keine; Fälligkeit heute → keine)
    - `vorlaufWarnung` (Vorlauf passt / passt nicht / ohne Vorlauf)
  - `src/__tests__/lib/abteilungsaufgaben-onboarding.test.ts`:
    - `faelligkeitenSetzen`-Fälle mit „Eilt“; Vorlagenaufgaben unverändert.
    - **F22:** „Information 10 Tage nach der Abgabe → die Ausstattungsaufgabe, deren Frist inzwischen verstrichen ist, ist heute fällig und `eilt`“. S13 ergänzt denselben Fall um „(eilt)“ in der Aufgabenliste der Mail und um „erste Erinnerung ist WARNING, nicht ESCALATION“ (`eiltDeckeln` kommt erst dort).
    - „Erneut senden“ für eine Stelle, die die Aufgabe schon bekommen hat → Frist bleibt.
    - „Erinnern“ hebt nie an; Vorlagenaufgaben werden nie angehoben.
  - `src/__tests__/api/modalitaeten.test.ts`: Der Test mockt den Adapter heute **nicht** (`faelligkeitenSetzen` läuft echt gegen `mockPrisma`, Kommentare :18–20 und :45–48). Neu: `jest.mock("@/lib/abteilungsaufgaben-onboarding", …)` mit einem Spy für `onboardingAusstattungNachholenIn` (und den übrigen genutzten Exporten), Prüfung „zweite Transaktion ruft das Nachholen mit der Vorgangs-ID auf“. Damit bleibt :482 (`onboardingProcess.updateMany` genau einmal) unverändert gültig, weil `vorgangSperrenIn` im Spy nicht läuft. Die Kommentare :18–20 und :45–48 werden angepasst (`findUnique` dient dann nur noch `statusAbgleichen`, sonst entfernen).
  - `src/__tests__/api/onboarding-hr-mails.test.ts` (fährt den POST mit eigenem `mockPrisma`): ebenso den Adapter mocken bzw. bestätigen, dass ein Fehler im Nachholen nur geloggt wird und die HR-Mail unverändert hinausgeht.
  - `src/__tests__/api/reminders-cron.test.ts`: `jest.mock("@/lib/ausstattung-lauf")`; `toEqual` an :471 erweitern.
  - `src/__tests__/lib/zeitplaner.test.ts` :226–258: Fixture bekommt `ausstattung`.
  - `src/__tests__/api/onboarding-abteilungen.test.ts`: Aktionen holen nach.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S8, S11.

#### S13 Mail an die Stelle: Bemerkung, „Eilt“, Angaben, Betreff-Sperren

- **Ziel:** Mockup 6.6. R7, R8, R14 (Erinnerungsstufe) und R17.
- **Dateien:**
  - `src/lib/abteilungsaufgaben.ts`: `AufgabeFuerListe` und `aufgabenlisteMailFelder` (Bemerkung, eilt), `eiltDeckeln`, `erinnerungsStufe` mit `reminderCount` und eilt.
  - `src/lib/ausstattung.ts`: `bemerkungLabel`, `angabenFuer`, `angabenMailFelder`.
  - `src/lib/ausstattung-daten.ts`: `ausstattungZuAufgabenLaden`, `angabenJeStelleLaden`.
  - `src/lib/abteilungsaufgaben-dienst.ts`:
    - `ONBOARDING_AUFGABEN_AUSWAHL` (:186) und `aufgabenLaden` (:215) mit Bemerkung
    - `AufgabeFuerVersand`
    - `VersandModul.angaben?` bzw. Laden im Kontext
    - `zuweisungsPayload` (:508) mit `angaben*`
    - Rückfall-Liste ohne Entfallene (:543)
    - Knopf „Erinnern“ mit `eiltDeckeln` (:882)
  - `src/lib/onboarding-abteilung-mail.ts`: Feld `arbeitsort` (F15), Auswahl in `ONBOARDING_VERSAND_AUSWAHL` um `arbeitsort: { select: { name } }`.
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`: `ONBOARDING_VORGANG_OEFFENTLICH` (U:479) um `arbeitsortId` und `arbeitsort: { select: { name: true } }` (1.8). Ohne das ist `arbeitsort` auf dem Link-Weg (`onboarding-task-completed`, `onboarding-department-completed`, Link-Seite in S14) immer leer.
  - `src/lib/events.ts`: `ONBOARDING_ABTEILUNG_BETREFF_OHNE` an `-assigned` und `-reminder`; Beispiele von `-assigned` um `angaben`, `angaben_html`, `arbeitsort`; **alle vier** Onboarding-Abteilungsbeispiele (`-assigned`, `-reminder`, `onboarding-task-completed`, `onboarding-department-completed`) um `arbeitsort`, weil `onboardingAbteilungsMailFelder` alle vier speist.
  - `src/lib/mailer.ts`: `FREITEXT_VARIABLEN` um `angaben`.
  - `src/lib/default-email-templates.ts`: `onboarding-department-assigned` (:1228–1348) mit Block `{{#angaben_html}}` im Infokasten und `{{#arbeitsort}}`-Zeile, beides im Text (:1304–1326), Variablenliste :1327.
  - `src/app/api/settings/email-templates/[id]/route.ts:56`: allgemeiner Fehlertext.
- **Tests:**
  - `src/__tests__/lib/abteilungsaufgaben.test.ts`: Liste mit und ohne Bemerkung (ohne: Byte-gleich), eilt, `eiltDeckeln`, `erinnerungsStufe` mit `reminderCount` 0 und eilender Aufgabe → WARNING.
  - `src/__tests__/lib/ausstattung.test.ts`:
    - `bemerkungLabel` (drei Quellen)
    - `angabenFuer` (eigene Angabe; fremde nur mit `sichtbarFuer`; gestrichene, leere und geleerte fehlen; Hinweis nur der eigenen Stelle; Hinweis mit Text `""` fehlt)
    - `angabenMailFelder` (`escapeHtml` im HTML-Teil, Klartext roh, beide `""` ohne Angaben)
  - `src/__tests__/lib/abteilungsaufgaben-onboarding.test.ts` :386–400: Positivliste um `angaben`, `angaben_html`, `arbeitsort`. F22-Fall aus S12 um „(eilt)“ in der Mail und erste Erinnerung WARNING ergänzen.
  - `src/__tests__/lib/abteilungsaufgaben-paket5.test.ts:351` (`toEqual` auf die Rückgabe von `onboardingAbteilungsMailFelder`): um `arbeitsort: ""` (Einrichtung = Arbeitsort) ergänzen, neuer Fall mit abweichendem Arbeitsort.
  - `src/__tests__/api/onboarding-abteilungs-mails.test.ts`: :319, :541, :669, :768 (echte Payload = Katalogbeispiel; :669 und :768 sind `task-completed` und `department-completed` über den Link-Weg) und :871ff (gemeinsamer Teil = `onboardingAbteilungsMailFelder` für **alle** Ereignisse); neuer Fall mit Bemerkung und Angaben im echten Render; Angaben nur für eigene und freigegebene Stellen.
  - `src/__tests__/lib/events-catalog.test.ts` :148–155.
  - `src/__tests__/api/onboarding-tasks.test.ts`: Die Link-Route lädt jetzt `arbeitsort` mit; :270 (`data.vorgang`) bleibt unverändert (der Arbeitsort kommt in S14 als eigenes Feld).
  - `src/__tests__/api/email-template-syntax.test.ts`: Fälle für `-assigned` und `-reminder`.
  - `src/__tests__/lib/email-vorlagen-standard.test.ts` :201–214 auf die Onboarding-Vorlagen ausdehnen (keine verschachtelten Blöcke).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S12.

#### S14 Link-Seite der Stelle und Dialog „Abteilungen informieren“

- **Ziel:** Mockups 6.4 und 6.5.
- **Dateien:**
  - `src/lib/ausstattung.ts`: `checklistFortschritt` (F2) – hier eingeführt, weil die Link-Seite der erste Leser ist; S15 und S16 nutzen sie weiter.
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`:
    - `onboardingOeffentlich` (:523) mit `angaben` und `hinweis`
    - `oeffentlichLaden` (:596) hängt im Onboarding je Aufgabe `bemerkung`, `eilt` und `entfaellt` an (`AUFGABE_OEFFENTLICH` bleibt unverändert) und liefert `data.arbeitsort` als eigenes Feld (1.8, nicht in `vorgang`, nicht in `zusatz`)
    - Fortschritt über `checklistFortschritt`, also ohne Entfallene
    - `oeffentlichAendern`: 409 `AUFGABE_ENTFAELLT`, geprüft **in** der Transaktion nach `linksSperrenIn` (1.11): `aufgabeUmschaltenPerLink` mit `entfaelltAm: null` im WHERE (nur Onboarding-Zweig), `aufgabenZustaendigkeit` liest `entfaelltAm` mit; der Lesestand vor der Transaktion nimmt `entfaelltAm` nur für die Anzeige ins `select`
  - `src/components/abteilungsaufgaben/aufgaben-seite.tsx`:
    - Typen :44–82
    - Kasten „Bemerkung …“ je Aufgabe, getrennt vom Katalog-Hinweis (:489)
    - Kennzeichen „eilt“ und „entfällt“; Abhaken bei „entfällt“ gesperrt
    - Block „Nur für …“ (:601–634) mit Angaben und Hinweis; der Arbeitsort steht im Kopf neben der Einrichtung (`data.arbeitsort`)
    - nur Tokens
  - `src/lib/abteilungsaufgaben.ts`: `AufgabeFuerZeile`/`ZeilenVorschau` (Flags, Zähler), `sichtbarkeitsHinweis` mit `ausstattungSatz`.
  - `src/lib/abteilungsaufgaben-onboarding.ts`: Übersicht übergibt Flags und Satz.
  - `src/components/abteilungsaufgaben/abteilungen-dialog.tsx` (:107, :222–256): Zeile „davon N aus ‚Ausstattung & Zugänge‘, M mit Bemerkung“ und der Satz.
- **Tests:**
  - `src/__tests__/api/onboarding-tasks.test.ts`: :270 (`data.vorgang` unverändert), :278 (exakte Felder, nur Onboarding erweitert), :294 (Fortschritt), :309–316, :320 (`zusatz` unverändert), neu `angaben`, `bemerkung`, eilt, entfällt, `arbeitsort` (eigenes Feld; `null` ohne Abweichung), Fortschritt ohne Entfallene, 409 `AUFGABE_ENTFAELLT`. Wettlauf: Die Aufgabe ist beim Lesen vor der Transaktion noch offen, wird vor `linksSperrenIn` gestrichen (Fake-DB-Haken zwischen den beiden Schritten) → „wieder öffnen“ ergibt 409, `entfaelltAm` und `isCompleted` bleiben stehen.
  - `src/__tests__/lib/ausstattung.test.ts`: `checklistFortschritt` (ohne Entfallene in Zähler und Nenner; nur Entfallene → `gesamt 0`, `alleErledigt false`).
  - `src/__tests__/api/abteilungsaufgaben-routen.test.ts:482`: Offboarding unverändert.
  - `src/__tests__/components/aufgaben-seite.test.tsx`.
  - `src/__tests__/components/abteilungen-dialog.test.tsx`.
  - `src/__tests__/lib/abteilungsaufgaben-paket5.test.ts` (`sichtbarkeitsHinweis`).
- **Abnahme:** Pflichtprüfung. Probe im Browser: Link-Seite mit Bemerkung und „entfällt“.
- **Abhängigkeiten:** S13.

#### S15 HR-Karte: Server, Änderungsliste, Portal-Sperren, Rollen

- **Ziel:** R5, R8, R9, R10 (Einträge schreiben), R12, R13, R16, E-A11, E-A14, E-A21 und E-A23 auf dem Server.
- **Dateien:**
  - `src/lib/ausstattung.ts`: `aenderungPruefen`, `hinweisAenderungPruefen`, `aenderungsEintraege`, `ausstattungsUebersichtBauen` (Aufgabenstand, Aktionen, Warnungen, `hinzufuegbar`, Hinweis mit Stand und Fälligkeit).
  - `src/lib/ausstattung-aufgaben.ts`: `aufgabeEntfallenIn`, `aufgabeWiederAufnehmenIn` (F23), `aenderungenSchreibenIn`.
  - `src/lib/ausstattung-dienst.ts`: `ausstattungAktionAusfuehren({ onboardingId, rohBody, session, jetzt })`. Prüfreihenfolge:
    1. 403
    2. Zod 400 (auch Stelle aus `NICHT_ERLAUBTE_STELLEN`, R11)
    3. 404
    4. Endstatus 409 `VORGANG_ABGESCHLOSSEN` (COMPLETED **und** EXPIRED, R13)
    5. `MODALITAETEN_FEHLEN` 409 (Zustand `ENTWURF` nach 1.6; `mitAusstattung` wird nicht geprüft)
    6. `versandSperreNehmen` (F6) 409
  
    Danach EINE Transaktion:
    1. Vorgang sperren
    2. Links der alten und neuen Stelle sperren
    3. Aufgaben lesen, `aenderungPruefen` bzw. `hinweisAenderungPruefen`
    4. schreiben nach 1.10 („Streichen und Abwählen“, „Hinweis-Aufgabe“): vor der Information **erst** die verknüpften `ChecklistItem`s löschen (`checklistItem.deleteMany({ where: { id: { in: ids }, onboardingId } })`, die Kaskade nimmt die Verknüpfung mit), **dann** die Zeile; danach entfallen (F2); Wiederaufnahme nach F23; Fälligkeiten aus `faelligkeiten` bzw. `hinweis-aendern.dueDate` (bei `null` auch `relativeDueDays: null`)
    5. `aenderungenSchreibenIn`
    6. `onboardingAusstattungNachholenIn` (ohne `versandAn`)
    7. `linkStatusNeuBerechnenIn` für beide Stellen
    8. Audit

    Als Antwort geht die neue Übersicht zurück. `ausstattungUebersichtLaden` bekommt den vollen Stand.
  - `src/lib/validations/ausstattung.ts`: `ausstattungAktionSchema`.
  - **neu** `src/app/api/onboarding/[id]/ausstattung/route.ts` (GET, POST).
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`: `onboardingAufgabeImPortalAendern` (1.11: Sperren, `entfaelltAm: null` im WHERE von U:1158 mit 409 nach erneutem Lesen, `progress` ohne Entfallene).
- **Tests:**
  - **neu** `src/__tests__/lib/ausstattung-dienst.test.ts` (Fake-DB). Abzudecken:
    - vor der Abgabe 409
    - nach der Abgabe bei `mitAusstattung = false` (Bestand) erlaubt
    - Hinzufügen aus dem Katalog und frei; frei mit mehr als 120 Zeichen ergibt 400; frei bzw. Stellenwechsel nach `MITARBEITER` oder `VORGESETZTER` ergibt 400 (R11)
    - erneutes Hinzufügen einer gestrichenen Position reaktiviert sie **samt** ihrer entfallenen Aufgaben (F23, keine zweite Aufgabe, Eintrag NEU)
    - Option abwählen: vorher gelöscht, nachher „entfällt“ (`isCompleted`, `entfaelltAm`); wieder anwählen öffnet dieselbe Aufgabe
    - gestrichen vor der Information → **kein** `ChecklistItem` der Zeile mehr vorhanden (auch keine verwaiste Aufgabe mit `herkunft = "AUSSTATTUNG"`)
    - erledigte Option abwählen ergibt 409
    - Stellenwechsel schreibt Einträge für beide Stellen und berechnet beide Links neu
    - Bemerkung von HR ergibt `BEIDE`
    - Hinweis: gesehen; übernommen (Position angelegt, Hinweis-Aufgabe unverändert); neu von HR (`quelle "HR"`, Aufgabe angelegt); entfernt vor der Information (Aufgabe und Zeile weg); entfernt nach der Information (Aufgabe entfällt, Eintrag ENTFAELLT, Text `""`); wieder gefüllt (Aufgabe wieder offen); erledigte Hinweis-Aufgabe → Ändern, Entfernen und `dueDate` ergeben 409; `dueDate` ändern setzt die Fälligkeit, `null` räumt `relativeDueDays` ab
    - COMPLETED ergibt 409, **EXPIRED ergibt 409** (R13)
    - Versand läuft ergibt 409
    - Audit ohne Texte
  - `src/__tests__/lib/ausstattung.test.ts`:
    - `aenderungPruefen` als Matrix aus R9: je Aufgabenstand (offen, erledigt, entfallen, keine Aufgaben bei ANGABE) × Änderung (Option abwählen, Option hinzufügen, Bemerkung, Angabe, Stellenwechsel, Streichen)
    - `hinweisAenderungPruefen` (offen, erledigt, entfallen, kein Hinweis)
    - `aenderungsEintraege` (nur informierte Stellen; nur Inhaltsfelder; Stellenwechsel = ENTFAELLT alt + NEU neu; reine `dueDate`-Änderung ergibt keinen Eintrag)
  - **neu** `src/__tests__/api/onboarding-ausstattung.test.ts` (Route, 403, 404 fremd = unbekannt).
  - `src/__tests__/api/onboarding-abteilungen.test.ts` (Portal-PATCH ist dort schon abgedeckt): SERVICE ergibt 403, `assignee` und `dueDate` ergeben 409 (auch an der Hinweis-Aufgabe), entfallene Aufgabe abhaken ergibt 409, `progress` ohne Entfallene, Vorlagenaufgaben unverändert.
  - `onboarding-ausstattung-lesen.test.ts` (S10) erweitern: SERVICE gegen `GET /api/onboarding/[id]/ausstattung` → 403.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S12, S13.

#### S16 HR-Karte: Oberfläche und Reiter Checkliste

- **Ziel:** Mockup 6.3. R20 (beide Karten vor dem Leerzustand).
- **Dateien:**
  - **neu** `src/components/ausstattung/ausstattung-karte.tsx`:
    - Gruppen je Stelle; Zeilen mit Bemerkung (Label nach Herkunft), Optionen mit Stand, Kennzeichen „eilt“ und Vorlaufwarnung, „ergänzt von HR (…)“, „nicht mehr im Katalog“
    - „Position hinzufügen…“, „Bearbeiten“
    - Hinweise mit Stand, Fälligkeit, „Als Position übernehmen…“, „Bearbeiten…“ (Text und Fälligkeit, F20) und „Zur Kenntnis genommen“
    - Zustand `ENTWURF` lesend mit seinem Satz (beide Varianten aus 1.6), `NUR_LESEN` lesend, `BEARBEITBAR` mit Aktionen – unabhängig von `mitAusstattung`
    - rechnet nichts selbst
  - **neu** `src/components/ausstattung/ausstattung-dialoge.tsx`: Hinzufügen, Bearbeiten (Auswahl, Angabe, Bemerkung, Stelle, Fälligkeit je Option, `BEMERKUNG_HINWEIS`), Streichen (Rückfrage „entfällt für die Stelle“), Hinweis bearbeiten (Text, Fälligkeit, Entfernen mit Rückfrage) und übernehmen, alles über `DialogRahmen`.
  - **neu** `src/components/ausstattung/aufgabe-zusatz.tsx`: Bemerkung (nur HR), „eilt“, „entfällt“ unter einem Checklistenpunkt.
  - `src/app/(portal)/dashboard/[id]/detail-content.tsx` (F2: alle Zählstellen über `checklistFortschritt`):
    - `TabChecklist` (:3349–3464) bekommt Ausstattungskarte und `AbteilungenKarte` **vor** den Leerzustand; der Leerzustand ersetzt nur Fortschrittsbalken und Liste.
    - Je Punkt wird `AufgabeZusatz` eingebunden. Eine entfallene Aufgabe zeigt „entfällt“ statt `erledigtText` („erledigt von <HR> am …“, :3488), ihre Checkbox ist gesperrt (:3503, sonst lief der Klick in die 409).
    - Zähler: Kopfzeile X/Y (:1188), Zusammenfassung (:1626), „alle erledigt“ (:1631), Fortschrittsbalken (:3405) und Badge des Reiters – alle über `checklistFortschritt`.
    - `DetailData.checklistItems` um `entfaelltAm`, `herkunft`, `eilt` (die Detailroute lädt die Punkte per `include`, die Spalten kommen ohne Routenänderung mit).
    - Neue Props bleiben optional (Test `abteilungen-karte.test.tsx:945–970`).
  - `src/app/(portal)/dashboard/[id]/uebersicht-schritte.ts`: `SchritteStand.checklistItems` um optionales `entfaelltAm`; `checklistDone`/`checklistAllDone` (:178) und `onboardingKurzschritte` (:598) über `checklistFortschritt`.
  - `src/app/api/onboarding/[id]/pdf-export/route.ts` (:279–287): `entfaelltAm` in die Abbildung der Punkte; `src/lib/pdf-export-onboarding.ts` (:786–830): Zähler über `checklistFortschritt`, entfallene Punkte mit „entfällt“ statt ✓ und ohne „erledigt am“.
- **Tests:**
  - **neu** `src/__tests__/components/ausstattung-karte.test.tsx`: Zustände (auch `BEARBEITBAR` bei `mitAusstattung = false`), Aktionen nur mit Bearbeitungsrecht, Fehlertext des Servers, Bemerkung erscheint nicht ohne Recht, Hinweis-Fälligkeit bearbeitbar.
  - `src/__tests__/components/abteilungen-karte.test.tsx` :922–1050 (`TabChecklist` ohne Items zeigt Karten **und** Leerzustand); neu: zwei von fünf Punkten entfallen → Badge, Kopfzeile und Balken zeigen dieselbe Zahl (x/3), Checkbox der entfallenen gesperrt, „entfällt“ statt „erledigt von“.
  - `src/__tests__/lib/onboarding-uebersicht-schritte.test.ts`: „alle erledigt“ mit entfallenen Punkten; nur entfallene Punkte zählen nicht als „Checkliste fertig“.
  - `src/__tests__/lib/pdf-export-zustaendigkeit.test.ts` (oder ein neuer Fall daneben): entfallener Punkt druckt „entfällt“, nicht ✓, und zählt nicht im Fortschritt.
  - `ui-sperrklinke` grün.
- **Abnahme:** Pflichtprüfung. Probe im Browser: Vorgang mit und ohne Checklisten-Vorlage, Hinzufügen und Streichen.
- **Abhängigkeiten:** S15.

#### S17 Nachtrag und Wächter

- **Ziel:** R10 (Senden) und R15. Mockup 6.3, Zeile „Nachtrag senden“.
- **Dateien:**
  - `src/lib/abteilungsaufgaben.ts`: Aktion, Name, Meldung, Gründe, `hinweisTon`, `waechterHinweis`, `abteilungsZeilenBauen` (`nachtrag`, Wächter), Audit.
  - `src/lib/ausstattung.ts`: `nachtragListe`, `nachtragMailFelder`.
  - `src/lib/ausstattung-daten.ts`: `offeneAenderungenLaden`.
  - `src/lib/validations/abteilungsaufgaben.ts`: `onboardingAbteilungsAktionSchema` (V:87), `AbteilungsAktionInput` verbreitert.
  - `src/lib/abteilungsaufgaben-dienst.ts`:
    - `VersandKontext.nachtraege`
    - Modus `NACHTRAG`
    - `nachtragPruefung`, `nachtrag()`
    - `zuweisungsPayload` mit `nachtrag*` und `hat_offene_aufgaben` – **nur** wenn `ctx.nachtraege` gesetzt ist (Onboarding-`VersandModul`); im Offboarding fehlen die Schlüssel ganz
    - Markieren nach SENT
    - `switch` mit `never` in `aktionMitKontextAusfuehren`
  - `src/lib/abteilungsaufgaben-onboarding.ts`: Schema, Wächter und Zähler an `abteilungsZeilenBauen`.
  - `src/components/abteilungsaufgaben/abteilungen-karte.tsx`:
    - Knopf „Nachtrag senden“ (Muster „Erneut senden“ :658–668, nur Tokens)
    - Zeile „Nach der Information geändert: …“
    - `ROTE_HINWEISE` bzw. `hinweisTon`
  - `src/lib/events.ts` (Beispiel `-assigned` + `nachtrag*`, `hat_offene_aufgaben`).
  - `src/lib/default-email-templates.ts`: `-assigned` mit flachem Block `{{#nachtrag}}…{{nachtrag_liste_html}}{{/nachtrag}}`, Aufgabenblock in `{{#hat_offene_aufgaben}}`.
  - `src/lib/mailer.ts` (`nachtrag_liste`).
- **Tests:**
  - `abteilungsaufgaben.test.ts`: Wächter (nicht informiert, Nachtrag offen, über 7 Tage, abgeschlossen), `nachtragListe` zusammengefasst.
  - `ausstattung.test.ts`: `nachtragMailFelder` (Merker `"ja"`/`""`, flache Zeilen „Neu: …“, „Geändert: …“, „Entfällt: …“, HTML maskiert, keine verschachtelten Marker), `nachtragListe` (NEU+ENTFAELLT fällt weg, NEU+GEAENDERT → NEU, GEAENDERT+ENTFAELLT → ENTFAELLT).
  - `abteilungsaufgaben-onboarding.test.ts`:
    - **Positivliste :386–397** (`erlaubt`-Set, `toEqual([])`) um `nachtrag`, `nachtrag_liste`, `nachtrag_liste_html`, `hat_offene_aufgaben` erweitern (S13 hat `angaben*`/`arbeitsort` schon ergänzt)
    - Nachtrag mit nur „Entfällt“ und null offenen Aufgaben sendet
    - gleicher Token
    - Sperrzeit
    - leere Liste ergibt 409 `KEIN_NACHTRAG`
    - nur gesendete IDs markiert
    - DB-Fehler danach ergibt Warnung statt 500
    - „Erneut senden“ nimmt Einträge mit (F7)
  - `abteilungsaufgaben-routen.test.ts`: Offboarding `nachtrag` ergibt 400.
  - `src/__tests__/api/offboarding-mails.test.ts:447` (echte Offboarding-Payload = Katalogbeispiel) bleibt unverändert grün – der Wächter dafür, dass `zuweisungsPayload` (gemeinsam mit dem Offboarding, D:508) im Offboarding keine `nachtrag*`-Schlüssel ausgibt.
  - `onboarding-abteilungs-mails.test.ts`: echte Payload = Katalogbeispiel, Render ohne verwaiste Marker.
  - `abteilungen-karte.test.tsx`: Knopf, Sperre, roter Hinweis.
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S15, S16.

#### S18 Rückmeldung an HR (E-A17) und Sammelmail (E-A18)

- **Ziel:** Jeder Kommentar einer Stelle erreicht das HR-Postfach; am Werktag vor Dienstbeginn eine Sammelmail.
- **Dateien:**
  - `src/lib/abteilungsaufgaben-uebergaenge.ts`:
    - `oeffentlichAendern` gibt `kommentarGeaendert` aus der Transaktion zurück (:755, :783)
    - Mail nach dem Commit nach 1.13
    - `aufgabeErledigtMelden` (:371) mit `hr_postfach`, `ist_erledigt`, `nur_kommentar`, `meldung_kurz`, nur im Onboarding
  - `src/lib/ausstattung.ts`: `letzterWerktagVor`, `sammelmailFaellig`.
  - `src/lib/ausstattung-lauf.ts`: `ausstattungSammelmailLauf` (Kandidaten, Anspruch, Senden, Rücksetzen bei FAILED, Audit) und `ausstattungPortalLink` (einzige Stelle mit dem Pfad der Detailseite, 1.10).
  - `src/lib/laeufe/onboarding-erinnerungen.ts`: Abschnitt 4, `ausstattung.sammelmail { versendet, nichtZugestellt, uebersprungen }`.
  - `src/lib/zeitplaner/bericht.ts` (Zähler, `problem` bei „nicht zugestellt“).
  - `src/lib/zeitplaner/katalog.ts` (`LAEUFE.reminders.vorlagen` :106).
  - `src/lib/events.ts`:
    - `onboarding-task-completed`: An `{{hr_postfach}}`, Beispiel, `betreffOhne` (F19)
    - neues `onboarding-ausstattung-offen`
  - `src/lib/ereignis-liste.ts` (+ `onboarding-ausstattung-offen`).
  - `src/lib/webhooks.ts` (`WebhookEvent`).
  - `src/lib/default-email-templates.ts`:
    - `onboarding-task-completed` (:1466–1554): Betreff `Onboarding-Aufgabe {{meldung_kurz}}: {{aufgabe}} ({{abteilung}})`, Kommentarblock, Text
    - neue Vorlage `onboarding-ausstattung-offen` mit historischem Kopf `#1a1a2e`
  - `src/lib/mailer.ts` (`offene_liste`).
- **Tests:**
  - `onboarding-abteilungs-mails.test.ts`: :863–869 („nur task-completed ohne An-Feld“ wird zu „An = `{{hr_postfach}}`“); Kommentar ohne Abhaken ergibt eine Mail; Abhaken mit Kommentar ergibt eine Mail; Kommentar leer bzw. unverändert ergibt keine Mail; Offboarding unverändert.
  - `onboarding-tasks.test.ts` (`kommentarGeaendert`).
  - **neu** `src/__tests__/lib/ausstattung-lauf.test.ts` (eigener `mockPrisma`, weil das Fake-`onboardingProcess.findMany` WHERE-Teile ignoriert): Fenster Freitag vor Montag, Feiertag ignoriert, Merker bei SENT und SKIPPED, Rücksetzen bei FAILED, kein zweiter Versand, Bericht ohne Personendaten, offene Hinweis-Aufgabe zählt mit, entfallene nicht, `portalLink` aus `ausstattungPortalLink`.
  - `ausstattung.test.ts` (`letzterWerktagVor`, `sammelmailFaellig`: Werktage, Sommerzeit).
  - `zeitplaner.test.ts` (Vorlagen eines Laufs im Katalog :163–173).
  - `events-catalog.test.ts` (`hr_postfach` im Beispiel).
  - `ereignis-liste.test.ts`.
  - `email-template-syntax.test.ts` (Betreff mit `kommentar_text` ergibt 400).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S12, S13.

#### S19 Abschluss-Rückfrage (E-A19) und Absage (E-A20)

- **Ziel:** Beide Endfälle sind abgesichert.
- **Dateien:**
  - `src/lib/validations/onboarding.ts` (`bestaetigt`).
  - `src/app/api/onboarding/[id]/route.ts`: COMPLETED-Zweig mit Zählung nach dem `updateMany` und eigener Ausnahme; EXPIRED setzt `expiredAt`.
  - **neu** `src/components/ausstattung/abschluss-dialog.tsx` (`DialogRahmen`, bei 409 mit Liste der offenen Aufgaben).
  - `detail-content.tsx`: `handleCompleteProcess` (:728–750) ohne `window.confirm`, mit Dialog.
  - `src/lib/abteilungsaufgaben-onboarding.ts`: Zweig `absage` vor dem EXPIRED-Abbruch (:268); `absage()` im Versandkern bzw. Adapter (Empfänger nach F16, Payload nach F17, `abgesagtAm`, Audit); `absage`-Daten in der Übersicht. Der Kopfkommentar (:37, „Offene Abteilungsaufgaben blockieren den Abschluss NICHT.“) wird umgeschrieben: „… blockieren den Abschluss nicht – Ausnahme (E-A19): offene Ausstattungs- und Hinweis-Aufgaben verlangen eine Bestätigung (409 `AUSSTATTUNG_OFFEN`).“ Dazu ein Satz zur Absage bei EXPIRED.
  - `src/components/abteilungsaufgaben/abteilungen-karte.tsx`: Block „Stellen über die Absage informieren…“ bei `absage.moeglich`, mit `DialogRahmen`.
  - `src/lib/events.ts` (neues `onboarding-department-abgesagt`), `ereignis-liste.ts`, `webhooks.ts` (`WebhookEvent`).
  - `src/lib/default-email-templates.ts` (neue Vorlage ohne `{{link}}`).
  - `src/lib/mailer.ts` (`erledigte_liste`).
- **Tests:**
  - `src/__tests__/api/onboarding-status-patch.test.ts`: `mockPrisma.checklistItem.findMany` (Vorgabe `[]`); das WHERE an :124–137 bleibt **unverändert**. Neu: 409 `AUSSTATTUNG_OFFEN` samt Liste, mit Bestätigung 200 und Audit, `expiredAt` bei EXPIRED.
  - `abteilungsaufgaben-onboarding.test.ts`: Absage nur bei EXPIRED; nur informierte Stellen; an `link.email`; keine Link-Felder im Payload; `abgesagtAm` nur bei SENT; zweiter Klick ergibt 409 `BEREITS_ABGESAGT`.
  - `onboarding-abteilungs-mails.test.ts` (Render der Absage).
  - `src/__tests__/lib/ereignis-liste.test.ts`: die benannte Liste der zentral gesperrten Onboarding-Ereignisse aus S11 (:98–124 Liste mit Hinweis, :126–141 Schlüsselmenge) um `onboarding-department-abgesagt` erweitern – sonst ist der Test nach S19 rot. Der Test verlangt außerdem `getEventDefinition` für jeden Schlüssel; Katalogeintrag und Listeneintrag kommen deshalb im selben Schritt.
  - `src/__tests__/lib/events-catalog.test.ts`: Empfänger-Default `{{email}}` des neuen Ereignisses ist im Beispiel auflösbar; Beispiel ohne Link-Felder.
  - **neu** `src/__tests__/components/abschluss-dialog.test.tsx`.
  - Sperrklinke: `detail-content.tsx` confirm 1 → 0, also `SPERRKLINKE_STAND=schreiben npx jest ui-sperrklinke` und `gesamt` für `confirm` von 30 auf 29 (Senken ist erlaubt).
- **Abnahme:** Pflichtprüfung.
- **Abhängigkeiten:** S17.

#### S20 Löschfrist, Brief-Platzhalter, CLAUDE.md, Gesamtabnahme

- **Ziel:** E-A22 und E-A25; die Regeln stehen dauerhaft in CLAUDE.md.
- **Dateien:**
  - `src/lib/ausstattung.ts` (`freitextGrenze`).
  - `src/lib/ausstattung-lauf.ts` (`ausstattungFreitexteLeeren`).
  - `src/lib/laeufe/dokumente-aufbewahrung.ts` (Block wie `individuelleMails`, Probelauf und scharf).
  - `src/lib/zeitplaner/bericht.ts` (`AUSWERTER["dokumente-aufbewahrung"]` :368–388).
  - `src/lib/zeitplaner/katalog.ts:70` (Beschreibung).
  - `src/lib/placeholder-catalog.ts` (`ONBOARDING_PLACEHOLDERS` + `{ausstattung_liste}`, Erklärtext „ohne Bemerkungen“).
  - `src/lib/doc-template-resolvers.ts` (ONBOARDING-Resolver: gewählte, nicht gestrichene JA_NEIN- und AUSWAHL-Zeilen, „Bezeichnung“ bzw. „Bezeichnung: Option, Option“, eine je Zeile).
  - `CLAUDE.md`: neuer Abschnitt „Ausstattung & Zugänge (A1–A3)“ mit den Regeln aus Abschnitt 7 des Plans und den Festlegungen F1–F23 in Kurzform. Dazu werden **alle** Stellen angepasst, die sonst widersprächen (spätere Agenten bauten an ihnen E-A17, E-A10 oder E-A19 zurück):
    - Abschnitt „E-Mail-Versand“, Dispatcher-Absatz: `EVENTS_OHNE_WEBHOOK` wirkt jetzt auch in `triggerWebhooks` (Schritt 2 entfällt), mit den sechs Onboarding-Ereignissen als eigener Gruppe neben den vier direkten Ausnahmen
    - Abteilungsaufgaben, **Regel 2** (WEBHOOK-Regel): gilt nur noch im Offboarding
    - Abteilungsaufgaben, **Regel 4**: „Nur-Kommentar = keine Mail“ gilt nur im Offboarding; im Onboarding geht `onboarding-task-completed` auch bei einem geänderten, nicht leeren Kommentar hinaus, bei Haken plus Kommentar genau eine Mail (E-A17); Sperrreihenfolge „Vorgang → Links → Aufgaben → Ausstattung“
    - Abteilungsaufgaben, **Regel 7** (Empfänger): im Onboarding gilt der Eintrag des **Arbeitsorts** (`arbeitsortId ?? organizationId`, E-A10) vor dem zentralen; Mandant bleibt `organizationId`
    - Abteilungsaufgaben, **Regel 8** (Datenzuschnitt der öffentlichen Seite): im Onboarding zusätzlich Bemerkung je Aufgabe, Angaben und Hinweis der eigenen bzw. freigegebenen Stelle, Arbeitsort (eigenes Feld), Kennzeichen „eilt“ und „entfällt“; Fortschritt ohne Entfallene
    - Onboarding-Unterschied **7** (Events): `onboarding-task-completed` hat jetzt den Default `{{hr_postfach}}` statt eines leeren An-Felds; zwei neue Ereignisse (`onboarding-department-abgesagt`, `onboarding-ausstattung-offen`); alle sechs ohne Webhook
    - Onboarding, „**Status NIE direkt setzen**“ (HR-PATCH): `COMPLETED` mit offenen Ausstattungsaufgaben nur mit `bestaetigt: true`, sonst 409 `AUSSTATTUNG_OFFEN`; `EXPIRED` setzt `expiredAt`
    - Onboarding, „**Anlegen mit beiden Links**“: optionales `arbeitsortId` (ohne `.uuid()`, 404 bei fremd/unbekannt, gleich der Einrichtung → `null`), Merker `mitAusstattung` in derselben Transaktion
    - Hinweis: Den Satz „Offene Abteilungsaufgaben blockieren den Abschluss NICHT“ gibt es in `CLAUDE.md` nicht; er steht im Kopfkommentar von `src/lib/abteilungsaufgaben-onboarding.ts:37` und wurde in S19 umgeschrieben.
    - Kennzahlen und Auswertungen über `completedAt` filtern `entfaelltAm IS NULL` (F2)
- **Tests:**
  - `src/__tests__/lib/zeitplaner.test.ts` :346–348 (Probelauf-Fixture).
  - `ausstattung.test.ts`: `freitextGrenze` (6 Monate, Monatsende 31.08. → 28./29.02., Berliner Zeit).
  - `ausstattung-lauf.test.ts` (Leeren: Grenzen COMPLETED/EXPIRED/`updatedAt`-Rückfall, Zeile bleibt, Probelauf schreibt nichts).
  - `src/__tests__/lib/doc-template-resolvers.test.ts` (Platzhalter ohne Bemerkung).
  - `individuelle-mail-dienst.test.ts` bleibt grün.
- **Abnahme:**
  - Pflichtprüfung vollständig: `npm run pruefen`.
  - Zum Abschluss ein Durchgang im Browser (`npm run dev` im Worktree, Datenbank `hr_portal_ausstattung` aus S0 auf Port 5433):
    1. Katalog mit Vorschlägen übernehmen, zwei Positionen einschalten
    2. Vorgang mit Arbeitsort anlegen, Modalitäten-Link erzeugen
    3. Formular mit Auswahl und Bemerkung absenden
    4. Karte prüfen, Position ergänzen und streichen
    5. „Abteilungen informieren“, Link-Seite öffnen, abhaken und kommentieren
    6. Nachtrag senden
    7. Abschluss mit Rückfrage
  - Ohne Mailserver liefern die Mails SKIPPED oder FAILED; das wird geprüft und nicht umgangen.
- **Abhängigkeiten:** S12, S18, S19.

**Reihenfolge und Parallelität**

- S0 vor allem anderen.
- Strang 1: S1 → S2 → S3 → S4.
- S5 läuft nach S2.
- Strang 2: S6 → S7 → S8 → S9 → S10.
- S11 läuft nach S0, parallel zu Strang 1 und 2, aber **vor** Strang 3 und nie gleichzeitig mit ihm.
- Strang 3: S12 → S13 → S14 → S15 → S16 → S17 → S19 (setzt S10 voraus, dort wird die Fake-DB erweitert).
- S18 läuft nach S13 und wird vor S19 eingepflegt.
- S20 kommt zuletzt.

Wer parallel arbeiten lässt, achtet auf die gemeinsamen Dateien. Schritte, die dieselbe Datei ändern, laufen nacheinander, nicht gleichzeitig:

- `src/lib/events.ts`
- `src/lib/default-email-templates.ts`
- `src/lib/abteilungsaufgaben.ts`
- `src/lib/abteilungsaufgaben-dienst.ts` (S11, S13, S17, S18, S19)
- `src/lib/abteilungsaufgaben-uebergaenge.ts` (S13, S14, S15, S18)
- `src/lib/abteilungsaufgaben-onboarding.ts` (S5, S12, S14, S17, S19)
- `src/lib/ereignis-liste.ts` und `src/lib/webhooks.ts` (S11, S18, S19)
- `src/lib/mailer.ts` (S13, S17, S18, S19)
- `src/lib/ausstattung.ts` (fast jeder Schritt)
- `src/app/(portal)/dashboard/[id]/detail-content.tsx` (S5, S6, S10, S16, S19)
- `src/__tests__/hilfen/abteilungs-fake-db.ts` und `src/__tests__/api/onboarding-abteilungs-mails.test.ts` (S10, S12–S19)

Praktisch heißt das: Weil fast jeder Schritt `ausstattung.ts` ändert, lohnt Parallelarbeit kaum. Ohne gemeinsame Datei laufen nur S4 neben S6 und S11 neben A1/A2; alles andere in einer Reihe.

---

## 3. Betroffene Mail- und Word-Vorlagen

Gespeicherte Vorlagen in der Datenbank überschreiben den Code vollständig. „Text auf Standard zurücksetzen“ (Einstellungen → Vorlagen) behält An, CC, BCC, Reply-To und den Aktiv-Schalter. Ein neuer Empfänger-Default wirkt deshalb nur, wenn das Feld in der DB-Vorlage leer ist.

| Vorlage | Änderung | Zurücksetzen nötig? |
|---|---|---|
| `onboarding-department-assigned` (an die Stelle) | Bemerkung und „eilt“ kommen automatisch über `{{aufgabenliste_html}}`. Neu in der Vorlage: Block `{{#angaben_html}}` im Infokasten, Zeile `{{#arbeitsort}}`, Block `{{#nachtrag}}…{{nachtrag_liste_html}}{{/nachtrag}}`, Aufgabenblock in `{{#hat_offene_aufgaben}}`, alles auch im Textteil, Variablenliste. `betreffOhne` neu. | **Ja** (für Angaben, Arbeitsort und Nachtrag; die Bemerkungen kommen auch ohne) |
| `onboarding-department-reminder` (an die Stelle) | Bemerkung und „eilt“ kommen automatisch über die Aufgabenliste. `betreffOhne` neu – wirkt nur beim **Speichern** einer Vorlage, nicht beim Versand (1.13); die gespeicherte Betreffzeile prüft der Handgriff unten. Angaben stehen bewusst nur in der ersten Mail. | Nein |
| `onboarding-task-completed` (an HR) | An-Default `{{hr_postfach}}`; Betreff mit `{{meldung_kurz}}`; Kommentarblock auch für reine Kommentare; `betreffOhne` inkl. `kommentar`/`kommentar_text`. | **Ja**. Steht in der DB-Vorlage schon ein An-Feld, bleibt es; ist es leer, greift der neue Default. Die Antwortadresse (`SmtpConfig.replyToEmail`) muss gepflegt sein, sonst SKIPPED. Die Versand-Ampel warnt dann. |
| `onboarding-department-completed` | Keine Änderung am Text (Webhook-Sperre; neues Payload-Feld `arbeitsort`, von der Vorlage nicht genutzt) | Nein |
| `supervisor-link-created` (an die Führungskraft) | Satz im Block `{{#ausstattung_angeboten}}` | **Ja** |
| `supervisor-completed` (an HR) | Zeile `{{#ausstattung_kurz}}Ausstattung: …{{/ausstattung_kurz}}` | **Ja** |
| **neu** `onboarding-ausstattung-offen` (an HR) | Sammelmail (E-A18) | Nein (es gibt noch keine DB-Zeile, der Code-Default gilt) |
| **neu** `onboarding-department-abgesagt` (an die Stelle) | Absage ohne Link (E-A20) | Nein (wie oben) |
| `automatischer-lauf-bericht` | Keine Textänderung; die neuen Zähler baut der Code | Nein |
| Offboarding-Mails, Fragebogen-Mails, Erinnerungen an die Führungskraft | Keine (`offboarding-department-assigned` erst mit A4) | Nein |

Word, PDF und Exporte:

| Vorlage | Änderung | Zurücksetzen? |
|---|---|---|
| PDF-Export Onboarding (`pdf-export-onboarding.ts`, Code) | Neuer Abschnitt „Ausstattung & Zugänge“ mit Bemerkungen; nur HR-Rollen erzeugen ihn | entfällt (keine DB-Vorlage) |
| Brief-Vorlagen (Word, `DocumentTemplate`) | Neuer Platzhalter `{ausstattung_liste}` im Onboarding-Katalog, ohne Bemerkungen. Das Schreiben „Was Sie am ersten Tag erhalten“ legt HR selbst unter Brief-Vorlagen an; es gibt keine System-Vorlage. Erstzugänge (Passwörter) nie. | Nein (bestehende Vorlagen unverändert) |
| JSON-/CSV-Export (`[id]/export`) | Keine. Die neuen Spalten an `ChecklistItem` (`herkunft`, `eilt`, `entfaelltAm`) erscheinen, falls die Route die Punkte vollständig ausgibt; das ist unbedenklich, weil keine Freitexte darin stehen. | entfällt |

**Vor dem Deploy** (auf dem Server, nur lesend; Grund: Mit F1 zählt ein Onboarding-Abteilungsereignis mit deaktivierter Portal-Vorlage und aktivem Webhook **nicht mehr** als zugestellt. Wer heute die Vorlage aus- und einen n8n-Webhook eingeschaltet hat, bekäme nach dem Deploy bei der Stelle gar nichts mehr an: SKIPPED, `sentAt` bleibt `null`, „Abteilungen informieren“ antwortet 409):

```sql
SELECT event, "isActive", "recipientTo", subject FROM email_templates WHERE event IN ('onboarding-department-assigned', 'onboarding-department-reminder', 'onboarding-task-completed', 'onboarding-department-completed', 'supervisor-link-created', 'supervisor-completed');
SELECT event, "isActive", url FROM webhook_configs WHERE event IN ('onboarding-department-assigned', 'onboarding-department-reminder', 'onboarding-task-completed', 'onboarding-department-completed');
SELECT "replyToEmail" FROM smtp_config;
```

1. Ist eine der vier Onboarding-Abteilungsvorlagen deaktiviert (`isActive = false`), sie **vor** dem Deploy in Einstellungen → Vorlagen einschalten (bzw. die Lage mit dem Projektverantwortlichen klären). Erst danach deployen.
2. Steht in einer Betreffzeile (`subject`) eine der in 1.13 gesperrten Variablen (`aufgabenliste`, `angaben`, `nachtrag_liste`, `link`, `magicLink`, bei `onboarding-task-completed` auch `kommentar`, `kommentar_text`), den Betreff nach dem Deploy in der Oberfläche korrigieren. `betreffOhne` prüft nur beim Speichern; die seit dem 24.09.2026 per SQL angelegten Vorlagen sind nie geprüft worden.

**Nach dem Deploy** (Handgriffe für die Übergabe):

1. Die **vier** Vorlagen mit „Ja“ zurücksetzen (Einstellungen → Vorlagen → „Text auf Standard zurücksetzen“): `onboarding-department-assigned`, `onboarding-task-completed`, `supervisor-link-created`, `supervisor-completed`.
2. Prüfen, ob `onboarding-task-completed` ein An-Feld hat (leer = neuer Default `{{hr_postfach}}`).
3. Antwortadresse (`smtp_config."replyToEmail"`) prüfen; ohne sie gehen `onboarding-task-completed` und die Sammelmail als SKIPPED aus.
4. Eingetragene n8n-Webhooks auf die Onboarding-Abteilungsereignisse löschen; sie feuern nicht mehr.
5. Für die Pilot-Kennzahl „Bereitstellung zum Dienstbeginn“ (Plan, Abschnitt 4) zählt die Abfrage nur Aufgaben mit `herkunft IS NOT NULL AND "entfaelltAm" IS NULL` (F2).

---

## 4. Risiken beim Bau und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| **Sperrklinke** (`ui-sperrklinke.test.ts`): Neue Dateien stehen auf 0. Ein Umbau bestehender Zeilen mit Palettenklassen verschiebt die Zählung. Ein Code-Umzug mit Palettenklassen in eine neue Datei bricht den Test zweimal. | Neues Markup nur in `src/components/ausstattung/` und nur mit Tokens. In `page.tsx`, `detail-content.tsx`, `einstellungen-content.tsx` und `abteilungen-karte.tsx` nur Einbindung und Logik; keine Klassenstrings kopieren. Den Stand nur **senken** (S19: `confirm`), nie anheben. Die Sperrklinke läuft bei jeder Pflichtprüfung. |
| **Feste Erwartungen in bestehenden Tests** (Payload = Katalogbeispiel, Positivliste, exakte Felder der öffentlichen Aufgabe, `toEqual` auf Rückgaben, gepinntes WHERE im Status-PATCH, Modal-Body, Zahl der `$transaction`) | Jeder Schritt nennt die Stellen ausdrücklich. Neue Felder sind optional bzw. nur im Onboarding gesetzt; `events.ts` wird im selben Schritt mitgezogen. Das WHERE des Status-PATCH bleibt, geprüft wird **nach** dem `updateMany`. |
| **Fake-DB** (`abteilungs-fake-db.ts`) wirft bei Relationsfiltern, ignoriert in `onboardingProcess.findMany` fremde WHERE-Teile und hat kein `create`. | F3 (flache Spalten statt Relationsfilter). Kandidatenabfragen der Läufe liegen in `ausstattung-lauf.ts` und werden mit eigenem `mockPrisma` getestet. Die Fake-DB wird in **S10** einmal zentral erweitert (dort laufen Detail-GET und Modalitäten-POST zum ersten Mal über die neuen Tabellen). F22 schreibt über IDs statt über Datumsoperatoren. Bestehende Versandwege fragen die neuen Tabellen nur ab, wenn eine Aufgabe `herkunft` trägt. Wo eine Route über einen eigenen Mock läuft (`unterlagen-hr-routen.test.ts`, `modalitaeten.test.ts`, `onboarding-hr-mails.test.ts`), wird der neue Dienst bzw. Adapter gemockt (S10, S12). |
| **Gemeinsame Werkzeuge mit dem Hauptcheckout** (Worktree ohne eigenes `node_modules`, generierter Prisma-Client und Dev-DB geteilt mit `ux-umbau`) | S0: eigenes `npm ci`, eigene `.env`/`.env.local`, eigene Datenbank `hr_portal_ausstattung`. Nie `prisma generate` oder `db push` ausführen, solange `require.resolve('@prisma/client')` aus dem Worktree in den Hauptcheckout zeigt. |
| **Gemeinsamer Kern mit dem Offboarding** (R, D, U, V, Karte, Dialog, Link-Seite) | Alle neuen Felder optional. Das Offboarding-Schema bleibt (`nachtrag` ergibt 400). Die WEBHOOK-Regel bleibt im Offboarding (Tests bleiben grün). `switch` mit `never` statt Ternary (D:929). `AKTIONS_NAMEN` ist ein vollständiger Record, tsc meldet Lücken. |
| **Wettlauf PUT gegen POST der Modalitäten** | Der PUT mit Ausstattung sperrt den Vorgang bedingt auf `supervisorSubmittedAt: null` (S8). |
| **Wettlauf Informieren gegen HR-Änderung** | Die HR-Karte nimmt die Versandsperre (F6). Wächter und Nachtragsliste sind das Netz. |
| **Wettlauf zwei Anleger** | Vorgangssperre plus Primärschlüssel (F4). P2002 wird nur geloggt, nachgeholt wird später. |
| **Wettlauf Stelle öffnet wieder, HR streicht** | Prüfung auf „entfällt“ in der Transaktion nach der Linksperre und `entfaelltAm: null` im WHERE des bedingten Updates, im Link- wie im Portal-PATCH (1.11). |
| **Verklemmung** | Überall Vorgang → Links → Aufgaben → Ausstattung (F5). Der Test prüft `invocationCallOrder`. |
| **Schema-Deploy** (`db push --accept-data-loss`, kein Migrationsordner) | Nur additiv; S1 prüft mit `prisma migrate diff`, dass kein DROP und keine Umbenennung entsteht (auch nicht durch die benannten Relationen). Der Entrypoint sichert vor dem Push (`pg_dump`, `./backups` mit `chown 1001`). `mitAusstattung` wird erst **nach** dem Push per Migration gesetzt; der Server startet erst danach. Nach jeder Schemaänderung `npx prisma generate` (im Worktree, S0), sonst scheitert `tsc`, während die Tests mit Mocks grün bleiben. |
| **Webhook-Sperre ändert die Zustellung** (F1): Vorlage aus + Webhook an zählte bisher als zugestellt | Prüfung **vor** dem Deploy (Abschnitt 3): deaktivierte Onboarding-Abteilungsvorlagen vorher einschalten, erst dann deployen und die Webhooks löschen. |
| **Verschachtelte Bedingungsblöcke** bleiben in der Mail wörtlich stehen | Nur flache Blöcke oder fertiges `*_html`. Der Test `email-vorlagen-standard.test.ts` wird auf die Onboarding-Vorlagen ausgedehnt. |
| **Maskierung** | Rohfelder in `FREITEXT_VARIABLEN`, `*_html` selbst mit `escapeHtml` bauen und **nicht** eintragen (doppelte Maskierung). |
| **`mitarbeiter_name` fällt auf die private Adresse zurück** | Jede neue Payload nimmt `onboardingAbteilungsMailFelder` bzw. setzt den Namen ausdrücklich. |
| **Prozesslokale Sperren** gelten nur bei einem Container | Keine neue Sperre. Merker und Unique-Indizes in der Datenbank sichern die Zustände (Sammelmail, Absage, Vorschläge). |
| **Spätere Zusammenführung mit `ux-umbau`** (Adressen `/vorgaenge/…`, Bausteine, Umzug der Detailseiten mit U4) | Logik in reinen Dateien und `src/components/ausstattung/`, damit der Umbau nur die Einbindung verschiebt. Beim Merge von `main` in `ux-umbau` sind Konflikte in `detail-content.tsx`, `uebersicht-schritte.ts` und `einstellungen-content.tsx` zu erwarten; das Logbuch des Umbaus vermerkt sie. Dazu der Wächter `adressen.test.ts` auf `ux-umbau`: Er verbietet `/dashboard` außerhalb von `src/lib/adressen.ts`. Der neue Code hat genau eine solche Stelle (`ausstattungPortalLink` in `ausstattung-lauf.ts`, 1.10); beim Merge wird sie auf `vorgangPfad("onboarding", id, …)` umgestellt. |
| **Ein Durchlauf von `npx jest` dauert** | Erst gezielt, dann vollständig (Pflicht). Nie mit nur gezielt grünen Tests abschließen. |

---

## 5. Offene technische Fragen

Nur echte technische Punkte; fachlich ist alles entschieden. Jeder Punkt hat einen Vorschlag, mit dem gebaut werden kann.

1. **Feiertage bei „Werktag vor Dienstbeginn“ (E-A18).** Im Code gibt es keine Quelle für gesetzliche Feiertage in NRW (`SchulferienNRW` kennt nur Ferien). Vorschlag: Mo–Fr; das Fenster reicht bis einschließlich Dienstbeginn, damit ein Feiertag oder ein ausgefallener Lauf die Mail nur verschiebt, nicht verhindert. Eine Feiertagsliste wäre ein eigenes kleines Paket.
2. **Benannte Relationen und `prisma migrate diff`.** Nach Prisma-Dokumentation ändern Relationsnamen keine Constraint-Namen. Das muss S1 am echten Schema belegen. Zeigt der Vergleich wider Erwarten ein `DROP CONSTRAINT`, ist der Ausweg ein Skalar `arbeitsortId` ohne Relation (Muster `ReturnItem.returnedToId`); der Name wird dann je Leser separat geladen.
3. **Anzahl der Mails bei Kommentaren (E-A17).** Jede Kommentaränderung über den Link erzeugt eine Mail an HR. Gebremst wird nur durch die Link-Bremse (60/min) und die Regel „nur bei geändertem, nicht leerem Text“. Vorschlag: so bauen und im Pilot beobachten. Bündeln (etwa einmal je Stunde) wäre ein eigener Lauf.
4. **Kandidatenmenge des Nachholens im täglichen Lauf.** Vorschlag: laufende Vorgänge mit eingereichten Modalitäten und mindestens einer nicht gestrichenen Ausstattungszeile oder einem Hinweis ohne Aufgabe (Prisma: `ausstattung: { some: { gestrichenAm: null } }` oder `stellenHinweise: { some: { checklistItemId: null } }`). Bei wenigen Dutzend laufenden Vorgängen unkritisch. Eine genauere Abfrage („Zeile ohne Aufgabe je Option“) lohnt den Aufwand nicht, weil `sollAufgaben` ohnehin gegen den Bestand rechnet.
5. **Einrichtungsart des Arbeitsorts bei `GMBH`/`VEREIN`.** Ist der Arbeitsort eine Gesellschaft (Objekt Service, Förderverein), filtert der Katalog nach dieser Art. Vorschlag: so lassen. Wer dort arbeitet, bekommt über „Arbeitsort = Schule“ ohnehin die Positionen der Schule (E-A10). Eine Sonderregel ist nicht nötig, solange A0 keine anderslautenden Fälle sammelt.

---

## 6. Prüfung der Mängelliste (12.10.2026)

Alle 26 Punkte der geprüften Mängelliste wurden am Code bzw. am Plan nachgeprüft. Alle trafen in der Sache zu und sind eingearbeitet:

| Thema | eingearbeitet in |
|---|---|
| Fälligkeit beim Versand statt bei der Abgabe (R14) | F22, 1.3 `anzuhebendeAufgaben`, 1.7 Schritt 7 und Aufrufer, S12, S13 |
| Fälligkeit der Hinweis-Aufgabe änderbar | F20, 1.4 `hinweis-aendern`, 1.6 `hinweis`, 1.11, S15, S16 |
| Lebenslauf der Hinweis-Aufgabe, `quelle "HR"` | 1.2, 1.3 `hinweisAenderungPruefen`, 1.10 „Hinweis-Aufgabe“, F23, S15 |
| Entfallene überall gleich zählen | F2, 1.3 `checklistFortschritt`, 1.11, S14, S15, S16, Abschnitt 3 (Kennzahl) |
| Zustand der Karte unabhängig von `mitAusstattung` | 1.6 Zustandsregel, S10, S15, S16 |
| Vier statt drei Vorlagen, Prüfung vor dem Deploy | Abschnitt 3, Abschnitt 4 |
| Rolle `VIEWER` gibt es nicht | 1.11, S10, S15 |
| Unit-Tests der reinen Funktionen, R11- und EXPIRED-Fall, Katalog-Lesen am Arbeitsort | Grundregeln Abschnitt 2, S2, S7, S8, S10, S12–S15, S17, S18, S20 |
| Alle betroffenen Stellen in `CLAUDE.md`, Kopfkommentar des Adapters | S19, S20 |
| Löschreihenfolge vor der Information | 1.10 „Streichen und Abwählen“, S15 |
| A4-Felder und `vorschlagSchluessel` nicht über die API | 1.4, S2, S3 |
| Ortsneutraler Text der Hinweis-Aufgabe | 1.3, 1.7 Schritt 4, S12 |
| Eigene Werkzeuge, `.env` und Datenbank für den Worktree | S0, Pflichtprüfung, S1, Grundregeln, S20, Abschnitt 4 |
| Bestehende Tests nach S10 und S12 | S10 (Fake-DB vorgezogen, Mocks), S12 (`modalitaeten.test.ts`, `onboarding-hr-mails.test.ts`) |
| `arbeitsort` auf dem Link-Weg | 1.8, 1.13, S13, S14 |
| Positivliste und Offboarding-Wächter beim Nachtrag | 1.10, S17 |
| `ereignis-liste.test.ts` in S19 | S19 |
| Prüfung „entfällt“ in der Transaktion | 1.11, S14, S15, Abschnitt 4 |
| `VORGANG_INCLUDE` ist ein `include` | 1.9, S7 |
| `$Enums` statt `Prisma.$Enums` | 1.3, S1 |
| `schluesselFeld` exportieren, `arbeitsortId` ohne `.uuid()` | 1.4, S2, S5 |
| `betreffOhne` wirkt nur beim Speichern | 1.13, Abschnitt 3 |
| Gemeinsame Dateien bei Parallelarbeit | Abschnitt 2, „Reihenfolge und Parallelität“, S11 |
| `/dashboard` an genau einer Stelle | 1.10 Sammelmail, S18, Abschnitt 4 |

Über die Liste hinaus ergab sich beim Einarbeiten **F23** (Wiederaufnahme statt Neuanlage): Ohne sie bekäme eine Stelle eine wieder gewählte Option oder einen wieder gefüllten Hinweis nie, weil die alte Verknüpfung das Nachholen blockiert. Das betrifft auch den schon vorher geplanten Testfall „erneutes Hinzufügen einer gestrichenen Position reaktiviert sie“.

### Verworfene Einwände

Kein Punkt wurde in der Sache verworfen. Verworfen bzw. anders gelöst wurden nur einzelne Vorschläge zur Umsetzung:

- **Fälligkeit „in der Transaktion, die den Link schreibt“ anheben (Einwand zu R14):** `zuweisungSenden` schreibt den Link ohne Transaktion (`upsert`/`update`, D:563–598); die Anhebung sitzt deshalb in der Vorab-Transaktion des Adapters (O:285, F22). Sie gilt außerdem nur für Aufgaben, die die Stelle noch nicht bekommen hat, weil „Erneut senden“ sonst eine überfällige Aufgabe still auf „heute“ zurücksetzte.
- **Alternative „dueDate-Sperre im Portal-PATCH nur für `AUSSTATTUNG`“ (Hinweis-Fälligkeit):** Nicht gewählt, weil Zuständigkeit und Fälligkeit aller Aufgaben mit `herkunft` an genau einer Stelle (der Karte) geändert werden sollen; stattdessen `hinweis-aendern` mit `dueDate`.
- **Hinweis-Aufgabe entfällt bei „Als Position übernehmen“:** Nicht übernommen, weil der Hinweistext weiter auf der Link-Seite steht und mehr enthalten kann als die übernommene Position; wer ihn nicht mehr will, entfernt ihn ausdrücklich.
- **`entfaelltAm` „in die Auswahl der Detailroute aufnehmen“:** Nicht nötig, weil `GET /api/onboarding/[id]` die Checklistenpunkte per `include` lädt und neue Spalten ohnehin mitliefert; nur der PDF-Export bildet die Felder einzeln ab und wird angepasst.
- **`npx dotenv -e .env.local -- prisma validate`:** Verworfen, weil `dotenv-cli` keine Abhängigkeit des Projekts ist und `npx` ein fremdes Paket nachladen würde; stattdessen eine nicht eingecheckte Worktree-`.env` (S0).
- **Fake-DB-Erweiterung „nach S8“:** S10 gewählt, weil S8 mit eigenen Mocks testet und erst S10 Detail-GET und Modalitäten-POST über die Fake-DB führt.
- **Alternative „:482 auf den Beanspruchungsaufruf filtern“ (`modalitaeten.test.ts`):** Nicht gewählt, weil der Adapter-Mock die Erwartung unverändert lässt und den Aufruf des Nachholens selbst prüfbar macht.
- **Optionale Versandprüfung des Betreffs analog `personenVorlagePruefen`:** Nicht gebaut, weil Vorlagen nur `ADMIN_ROLES` über den PUT ändern, der prüft; der ungeprüfte Altbestand wird einmal per Handgriff vor dem Deploy gesichtet (Abschnitt 3).
- **`arbeitsort: { select: { type: true } }` in `VORGANG_INCLUDE`:** Nicht übernommen, weil `ausstattungAngebotenIn` die Art des Arbeitsorts in derselben Transaktion selbst lädt (die vom Einwand ausdrücklich zugelassene Alternative); `VORGANG_INCLUDE` bleibt unverändert.
