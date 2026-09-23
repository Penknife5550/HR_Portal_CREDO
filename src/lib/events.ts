/**
 * CREDO HR-Portal – Zentraler Event-Katalog
 *
 * Eine Definition pro versandfaehigem Ereignis. Der Katalog ist die
 * gemeinsame Quelle fuer:
 *   - Status-Ampel in den Einstellungen (welches Event ist konfiguriert?)
 *   - Empfaenger-Defaults der E-Mail-Vorlagen (To/CC/BCC, variablen-faehig)
 *   - Test-Versand (Beispiel-Payload je Event)
 *
 * Die Beispiel-Payloads spiegeln die ECHTEN Felder der Aufrufstellen wider
 * (siehe triggerWebhooks-Aufrufe in src/app/api/**). Beim Versand stehen
 * alle skalaren Payload-Felder als {{platzhalter}} zur Verfuegung, plus die
 * kuratierten Variablen aus extractVariables (z.B. {{link}}, {{ablaufdatum}}).
 *
 * defaultRecipients.to == "" bedeutet: Es gibt keinen natuerlichen Empfaenger
 * im Payload (HR-interne Benachrichtigung) — die Adresse muss in der Vorlage
 * konfiguriert werden, sonst wird das Event uebersprungen und protokolliert.
 */

export type EventGroup =
  | "Onboarding"
  | "Offboarding"
  | "Vertragsende"
  | "Exit-Interview"
  | "Verbeamtung"
  | "Elternzeit"
  | "Mutterschutz";

export interface EventRecipientDefaults {
  to: string;
  cc?: string;
  bcc?: string;
}

export interface EventDefinition {
  /** Technischer Event-Name (== EmailTemplate.event / WebhookConfig.event) */
  event: string;
  /** Anzeigename in der UI */
  name: string;
  /** Prozessgruppe fuer die Gruppierung in der UI */
  group: EventGroup;
  /** Wer fachlich der Empfaenger ist (Anzeige in der UI) */
  recipientHint: string;
  /** Empfaenger-Defaults — variablen-faehig, kommagetrennt */
  defaultRecipients: EventRecipientDefaults;
  /** Beispiel-Payload fuer den Test-Versand (echte Feldnamen der Aufrufstelle) */
  samplePayload: Record<string, string | number | boolean>;
  /**
   * false = Event ist definiert, wird aber (noch) von keiner Stelle im Code
   * ausgeloest — wird in der Status-Ampel entsprechend ausgewiesen.
   */
  wired: boolean;
}

const BEISPIEL_LINK = "https://hr.fes-credo.de/beispiel-link";

/**
 * Gemeinsamer Teil aller Offboarding-Beispiele — genau die Felder, die
 * offboardingMailFelder (src/lib/offboarding-mail.ts) jeder Aufrufstelle
 * liefert. Bewusst abgeschrieben statt aufgerufen: Die Funktion haengt ueber
 * getBaseUrl an Node-Modulen, dieser Katalog wird auch im Browser geladen.
 * Test src/__tests__/api/offboarding-mails.test.ts vergleicht beide.
 */
const OFFBOARDING_BEISPIEL = {
  offboardingId: "00000000-0000-0000-0000-000000000002",
  displayId: "OFF-2026-GYM-001",
  employeeName: "Max Mustermann",
  employeeFirstName: "Max",
  employeeLastName: "Mustermann",
  vorname: "Max",
  nachname: "Mustermann",
  organization: "FES Minden",
  organizationName: "FES Minden",
  einrichtung: "FES Minden",
  mandantNumber: "01",
  lastWorkingDay: "2026-08-31T00:00:00.000Z",
  austrittsdatum: "31.08.2026",
};

/**
 * Beispiel fuer die Mails der Abteilungsaufgaben (Paket 1b): die Aufgaben der
 * IT-Abteilung im Offboarding von Max Mustermann (letzter Arbeitstag
 * 31.08.2026). Die Beispiel-Payloads unten erzaehlen EINE Geschichte:
 *
 *   17.08.2026, 08:00 UTC  IT informiert — Link gueltig bis +90 Tage (15.11.)
 *   30.08.2026, 06:00 UTC  taeglicher Lauf erinnert: Laptop seit 2 Tagen
 *                          ueberfaellig (Stufe WARNING), Link verlaengert (28.11.)
 *   31.08.2026             IT hakt "IT-Zugänge …" mit Kommentar ab
 *   01.09.2026, 09:30 UTC  letzte IT-Aufgabe erledigt — Abteilung fertig
 *
 * Aufgabenliste (Klartext und HTML), Zaehler, Stufenfelder und Kommentar
 * stehen unten als fertiger Text. Sie werden bewusst NICHT hier mit
 * aufgabenlisteMailFelder/stufenMailFelder/kommentarMailFelder
 * (src/lib/abteilungsaufgaben.ts) erzeugt: Dieser Katalog bleibt ohne
 * Importe (Test in ereignis-liste.test.ts). Stattdessen spielt
 * src/__tests__/api/offboarding-mails.test.ts die Geschichte mit dem echten
 * Dienst nach und prueft, dass er genau diese Payloads baut. Aendert sich dort
 * ein Feld oder das Markup der Liste, schlaegt der Test an.
 */
export const OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN: {
  id: string;
  title: string;
  dueDate: string | null;
}[] = [
  {
    id: "00000000-0000-0000-0000-00000000000c",
    title: "Laptop & Zubehör zurücknehmen",
    dueDate: "2026-08-28T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-00000000000b",
    title: "IT-Zugänge und E-Mail-Konto sperren",
    dueDate: "2026-08-31T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-00000000000d",
    title: "Postfach an die Schulleitung weiterleiten",
    dueDate: null,
  },
];

/** Kommentar der IT beim Abhaken von "IT-Zugänge …" (Rohtext, mit Zeilenumbruch). */
export const OFFBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR =
  "Konto gesperrt & Abwesenheitsnotiz eingerichtet.\nDer Laptop fehlt noch.";

/** Gemeinsamer Teil der Beispiele: die Abteilung, an die geschrieben wird. */
const OFFBOARDING_ABTEILUNG_IT = {
  departmentKey: "IT",
  departmentName: "IT-Abteilung",
  abteilung: "IT-Abteilung",
};

/** aufgabenlisteMailFelder(OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN), abgeschrieben. */
const OFFBOARDING_ABTEILUNG_AUFGABENLISTE = {
  aufgabenliste:
    "- Laptop & Zubehör zurücknehmen – fällig 28.08.2026\n" +
    "- IT-Zugänge und E-Mail-Konto sperren – fällig 31.08.2026\n" +
    "- Postfach an die Schulleitung weiterleiten",
  aufgabenliste_html:
    '<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
    '<li style="margin:0 0 4px;">Laptop &amp; Zubehör zurücknehmen – fällig 28.08.2026</li>' +
    '<li style="margin:0 0 4px;">IT-Zugänge und E-Mail-Konto sperren – fällig 31.08.2026</li>' +
    '<li style="margin:0 0 4px;">Postfach an die Schulleitung weiterleiten</li>' +
    "</ul>",
  anzahl_aufgaben: 3,
  naechste_faelligkeit: "28.08.2026",
};

/**
 * Gemeinsamer Teil aller Onboarding-Abteilungsbeispiele (Paket 5) — genau die
 * Felder, die onboardingAbteilungsMailFelder (src/lib/onboarding-abteilung-mail.ts)
 * jeder Aufrufstelle liefert. Wie oben bewusst abgeschrieben statt aufgerufen:
 * Die Funktion haengt ueber getBaseUrl an Node-Modulen, dieser Katalog wird auch
 * im Browser geladen (ereignis-liste.test.ts erzwingt „keine Importe").
 * src/__tests__/api/onboarding-abteilungs-mails.test.ts haelt beide gleich.
 *
 * DATENSPARSAMKEIT: kein Feld der privaten Adresse der Person
 * (OnboardingProcess.email) — `email` ist immer die Adresse des EMPFAENGERS.
 */
const ONBOARDING_ABTEILUNG_BEISPIEL = {
  onboardingId: "00000000-0000-0000-0000-000000000005",
  displayId: "ONB-2026-031",
  vorname: "Anna",
  nachname: "Beispiel",
  mitarbeiter_name: "Anna Beispiel",
  employeeName: "Anna Beispiel",
  organization: "FES Minden",
  organizationName: "FES Minden",
  einrichtung: "FES Minden",
  mandantNumber: "01",
  contractStartDate: "2026-10-01T00:00:00.000Z",
  vertragsbeginn: "01.10.2026",
};

/**
 * Beispiel fuer die vier Onboarding-Abteilungsmails (Paket 5): die Aufgaben der
 * IT-Abteilung zum Dienstbeginn von Anna Beispiel am 01.10.2026. Wie im
 * Offboarding erzaehlen die Beispiel-Payloads unten EINE Geschichte:
 *
 *   22.09.2026, 08:00 UTC  IT informiert — Link gueltig bis +90 Tage (21.12.)
 *   26.09.2026, 06:00 UTC  taeglicher Lauf erinnert: Benutzerkonto seit 2 Tagen
 *                          ueberfaellig (Stufe WARNING), Link verlaengert (25.12.)
 *   28.09.2026             IT hakt "Benutzerkonto …" mit Kommentar ab
 *   01.10.2026, 09:30 UTC  letzte IT-Aufgabe erledigt — Abteilung fertig
 *
 * Neu gegenueber Paket 1b ist der `description`-Hinweis aus der Vorlage: Er
 * steht in der Klartextliste eingerueckt und im HTML als graue zweite Zeile.
 */
export const ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN: {
  id: string;
  title: string;
  dueDate: string | null;
  description: string | null;
}[] = [
  {
    id: "00000000-0000-0000-0000-00000000001a",
    title: "Benutzerkonto und E-Mail-Adresse anlegen",
    // Vertragsbeginn (01.10.) minus 7 Tage
    dueDate: "2026-09-24T00:00:00.000Z",
    description: "Konto in der Schulverwaltung und in Microsoft 365 anlegen",
  },
  {
    id: "00000000-0000-0000-0000-00000000001b",
    title: "Notebook & Zubehör bereitstellen",
    // am Vertragsbeginn
    dueDate: "2026-10-01T00:00:00.000Z",
    description: null,
  },
  {
    id: "00000000-0000-0000-0000-00000000001c",
    title: "WLAN-Zugang einrichten",
    dueDate: null,
    description: null,
  },
];

/**
 * Kommentar der IT beim Abhaken von "Benutzerkonto …" (Rohtext, mit
 * Zeilenumbruch und einem &, damit das Beispiel die Maskierung zeigt). Bewusst
 * OHNE E-Mail-Adresse: events-catalog.test.ts laesst im Katalog nur
 * @example.org zu, und in einem Kommentar hat eine echte Adresse nichts zu
 * suchen.
 */
export const ONBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR =
  "Konto angelegt & Postfach eingerichtet.\nDas Notebook kommt nächste Woche.";

/** Gemeinsamer Teil der Beispiele: die Abteilung, an die geschrieben wird. */
const ONBOARDING_ABTEILUNG_IT = {
  departmentKey: "IT",
  departmentName: "IT-Abteilung",
  abteilung: "IT-Abteilung",
};

/**
 * Die Zusatzangaben, die der Schluessel IT im Onboarding sehen darf
 * (ONBOARDING_ZUSATZFELDER in src/lib/abteilungsaufgaben.ts). Andere Schluessel
 * bekommen weniger oder nichts — die Felder fehlen dann GANZ im Payload.
 * Sie stehen nur in der Zuweisungsmail, nicht in Erinnerung, Erledigt-Meldung
 * oder Bestaetigung.
 */
const ONBOARDING_ABTEILUNG_ZUSATZ = {
  stellenbezeichnung: "Lehrkraft Sek. I",
  betriebsstaette: "Minden, Hauptstandort",
  ansprechpartner_email: "a.leitung@example.org",
};

/** aufgabenlisteMailFelder(ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN), abgeschrieben. */
const ONBOARDING_ABTEILUNG_AUFGABENLISTE = {
  aufgabenliste:
    "- Benutzerkonto und E-Mail-Adresse anlegen – fällig 24.09.2026\n" +
    "  Konto in der Schulverwaltung und in Microsoft 365 anlegen\n" +
    "- Notebook & Zubehör bereitstellen – fällig 01.10.2026\n" +
    "- WLAN-Zugang einrichten",
  aufgabenliste_html:
    '<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:14px;line-height:1.6;">' +
    '<li style="margin:0 0 4px;">Benutzerkonto und E-Mail-Adresse anlegen – fällig 24.09.2026' +
    '<br><span style="color:#6b7280;font-size:13px;">Konto in der Schulverwaltung und in Microsoft 365 anlegen</span></li>' +
    '<li style="margin:0 0 4px;">Notebook &amp; Zubehör bereitstellen – fällig 01.10.2026</li>' +
    '<li style="margin:0 0 4px;">WLAN-Zugang einrichten</li>' +
    "</ul>",
  anzahl_aufgaben: 3,
  naechste_faelligkeit: "24.09.2026",
};

/**
 * Beispiel-Hinweise fuer die Fristen-Sammelmail der Verbeamtung — genau die
 * Felder, die der Cron (cron/civil-service-deadlines) je Hinweis erzeugt.
 *
 * Die Mailfelder daraus (Liste als HTML und Klartext, Zaehler) stehen unten im
 * Beispiel-Payload als fertiger Text. Sie werden bewusst NICHT hier mit
 * fristenMailFelder (src/lib/psi-fristen-mail.ts) erzeugt: Dieser Katalog
 * bleibt ohne Importe, weil er im Browser geladen wird (ein Test in
 * ereignis-liste.test.ts erzwingt das). Stattdessen prueft
 * src/__tests__/lib/psi-fristen-mail.test.ts, dass der Text genau dem
 * entspricht, was fristenMailFelder aus diesen Hinweisen baut. Aendert sich
 * dort das Markup, schlaegt der Test an und nennt den neuen Text.
 */
export const PSI_FRISTEN_BEISPIEL: {
  processId: string;
  displayId: string;
  employeeName: string;
  type: string;
  severity: "WARNING" | "URGENT" | "OVERDUE";
  message: string;
  dueDate: string;
}[] = [
  {
    processId: "00000000-0000-0000-0000-000000000003",
    displayId: "PSI-2026-GYM-001",
    employeeName: "Max Mustermann",
    type: "BR_GENEHMIGUNG_MISSING",
    severity: "OVERDUE",
    message: "BR-Genehmigung überfällig. BR-Antrag eingereicht am 02.06.2026, 8-Wochen-Frist abgelaufen.",
    dueDate: "2026-07-28T00:00:00.000Z",
  },
  {
    processId: "00000000-0000-0000-0000-000000000004",
    displayId: "PSI-2026-GYM-002",
    employeeName: "Erika Beispiel",
    type: "ASSESSMENT_2_MISSING",
    severity: "WARNING",
    message: "2. Beurteilung steht an (T+9 Monate erreicht).",
    dueDate: "2026-11-01T00:00:00.000Z",
  },
];

/** Portal-Adresse, mit der das Beispiel seine Links baut. */
export const PSI_FRISTEN_BEISPIEL_BASIS = "https://hr.fes-credo.de";

export const EVENT_CATALOG: EventDefinition[] = [
  // =============================================
  // Onboarding
  // =============================================
  {
    event: "onboarding-created",
    name: "Einladung Mitarbeiter (Personalfragebogen)",
    group: "Onboarding",
    recipientHint: "Mitarbeiter:in (Magic-Link zum Fragebogen)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      firstName: "Max",
      lastName: "Mustermann",
      fragebogenLink: BEISPIEL_LINK,
      organization: "FES Minden",
      mandantNumber: "01",
      tokenExpiresAt: "2026-07-15T12:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "questionnaire-confirmation-employee",
    name: "Eingangsbestaetigung Mitarbeiter (Fragebogen eingereicht)",
    group: "Onboarding",
    recipientHint: "Mitarbeiter:in (Bestaetigung nach Einreichung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      organization: "FES Minden",
    },
    wired: true,
  },
  {
    event: "questionnaire-completed",
    name: "Fragebogen eingereicht (HR-Benachrichtigung)",
    group: "Onboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      email: "max.mustermann@example.org",
      organization: "FES Minden",
    },
    wired: true,
  },
  {
    event: "supervisor-link-created",
    name: "Einladung Vorgesetzter (Einstellungsmodalitäten)",
    group: "Onboarding",
    recipientHint: "Leitung (Magic-Link zu den Modalitaeten)",
    defaultRecipients: { to: "{{supervisorEmail}}" },
    // Kein Feld `email`: Der Name der Person faellt nie auf ihre Adresse
    // zurueck (vorgesetztenLinkMailFelder in src/lib/onboarding-einladung.ts).
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      supervisorEmail: "leitung@example.org",
      modalitaetenLink: BEISPIEL_LINK,
      employeeName: "Max Mustermann",
      mitarbeiter_name: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      supervisorTokenExpiresAt: "2026-07-15T12:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "supervisor-completed",
    name: "Einstellungsmodalitäten eingereicht (HR-Benachrichtigung)",
    group: "Onboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      email: "max.mustermann@example.org",
      organization: "FES Minden",
    },
    wired: true,
  },
  {
    event: "employee-reminder",
    name: "Erinnerung Mitarbeiter (Fragebogen ausstehend)",
    group: "Onboarding",
    recipientHint: "Mitarbeiter:in (Erinnerung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      firstName: "Max",
      lastName: "Mustermann",
      einrichtung: "FES Minden",
      organization: "FES Minden",
      tage_offen: 5,
      fragebogenLink: BEISPIEL_LINK,
      link: BEISPIEL_LINK,
    },
    wired: true,
  },
  {
    event: "supervisor-reminder",
    name: "Erinnerung Vorgesetzter (Modalitäten ausstehend)",
    group: "Onboarding",
    recipientHint: "Leitung (Erinnerung)",
    defaultRecipients: { to: "{{supervisorEmail}}" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      email: "leitung@example.org",
      supervisorEmail: "leitung@example.org",
      mitarbeiter_name: "Max Mustermann",
      einrichtung: "FES Minden",
      organization: "FES Minden",
      tage_offen: 5,
      modalitaetenLink: BEISPIEL_LINK,
      supervisor_link: BEISPIEL_LINK,
    },
    wired: true,
  },
  {
    event: "onboarding-starter-packet-sent",
    name: "Starterpaket versandt (Onboarding-Abschluss)",
    group: "Onboarding",
    recipientHint: "Mitarbeiter:in (Starterpaket-Dokumente als PDF-Anhang)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      anzahlDokumente: 5,
      dokumentenliste: "1. Leitbild\n2. Willkommensschreiben",
      dokumentenliste_html: "<ol><li>Leitbild</li><li>Willkommensschreiben</li></ol>",
      nachricht: "Wir freuen uns auf Sie am 1. Oktober, Ihr Buero ist Raum 214.",
      nachricht_html: "Wir freuen uns auf Sie am 1. Oktober, Ihr Buero ist Raum 214.",
      sachbearbeiter_name: "Erika Sachbearbeiter",
    },
    wired: true,
  },

  // =============================================
  // Onboarding: Abteilungsaufgaben (Paket 5)
  //
  // Dieselben vier Ereignisse wie im Offboarding, aber mit dem Dienstbeginn
  // statt dem Austritt als Bezug. Ausloeser und Payload stehen in
  // src/lib/abteilungsaufgaben-dienst.ts (zuweisungsPayload,
  // erinnerungsPayload) und src/lib/abteilungsaufgaben-uebergaenge.ts
  // (aufgabeErledigtMelden, abteilungFertigMelden); der gemeinsame Teil kommt
  // aus src/lib/onboarding-abteilung-mail.ts.
  //
  // Zwei Unterschiede zum Offboarding, beide bewusst:
  //   - KEIN `token` im Payload (der Link genuegt, Datensparsamkeit).
  //   - Zusatzangaben je Schluessel (Stellenbezeichnung, Betriebsstaette,
  //     Adresse der Fuehrungskraft) nur in der Zuweisungsmail und nur, wenn
  //     ONBOARDING_ZUSATZFELDER sie dem Schluessel erlaubt. Nicht erlaubte
  //     Felder fehlen ganz — auch im Webhook.
  // =============================================
  {
    // Ausloeser: "Abteilungen informieren", "Erneut senden", "Link erneuern"
    // und "Erinnern" nach einer Adressaenderung — immer per HR-Knopf. Das
    // Beispiel ist die Erstmail an die IT (ONBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN).
    event: "onboarding-department-assigned",
    name: "Onboarding-Aufgaben für Abteilung zugewiesen",
    group: "Onboarding",
    recipientHint: "Abteilung bzw. Führungskraft (Link zu den Aufgaben)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      ...ONBOARDING_ABTEILUNG_BEISPIEL,
      ...ONBOARDING_ABTEILUNG_IT,
      email: "it@example.org",
      // informiert am 22.09.2026, 08:00 UTC + 90 Tage
      expiresAt: "2026-12-21T08:00:00.000Z",
      taskCount: 3,
      magicLink: BEISPIEL_LINK,
      link: BEISPIEL_LINK,
      ...ONBOARDING_ABTEILUNG_AUFGABENLISTE,
      erneut_gesendet: "",
      neuer_link: "",
      ist_fuehrungskraft: "",
      ...ONBOARDING_ABTEILUNG_ZUSATZ,
    },
    wired: true,
  },
  {
    // Knopf "Erinnern" und Abschnitt 3 des taeglichen Laufs
    // (/api/cron/reminders) senden denselben Aufbau. Die englischen Felder
    // (level, overdueItems, …) bleiben fuer Webhooks, die deutschen Merker
    // (ist_warnung, …) steuern die Bloecke der Vorlage. Keine Zusatzangaben.
    event: "onboarding-department-reminder",
    name: "Erinnerung: Offene Onboarding-Aufgaben",
    group: "Onboarding",
    recipientHint: "Abteilung bzw. Führungskraft (Erinnerung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      ...ONBOARDING_ABTEILUNG_BEISPIEL,
      ...ONBOARDING_ABTEILUNG_IT,
      email: "it@example.org",
      reminderCount: 1,
      // beim Erinnern am 26.09.2026, 06:00 UTC auf + 90 Tage verlaengert
      expiresAt: "2026-12-25T06:00:00.000Z",
      magicLink: BEISPIEL_LINK,
      link: BEISPIEL_LINK,
      level: "WARNING",
      overdueItems: 1,
      upcomingItems: 0,
      totalOpenItems: 3,
      offene_aufgaben: 3,
      maxOverdueDays: 2,
      ueberfaellige_aufgaben: "1",
      tage_ueberfaellig: "2",
      ist_ueberfaellig: "ja",
      ist_info: "",
      ist_warnung: "ja",
      ist_eskalation: "",
      ...ONBOARDING_ABTEILUNG_AUFGABENLISTE,
      ist_fuehrungskraft: "",
    },
    wired: true,
  },
  {
    // NUR ueber den Link der Abteilung — das HR-Haekchen im Portal loest im
    // Onboarding nichts aus (Entscheidung Paket 5). Kein `email`-Feld:
    // Empfaenger ist das An-Feld der Vorlage (ohne An-Feld SKIPPED).
    // `kommentar` ist schon maskiert (fuer das HTML), `kommentar_text` der
    // Rohtext (nur Textteil).
    event: "onboarding-task-completed",
    name: "Onboarding-Aufgabe erledigt",
    group: "Onboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      ...ONBOARDING_ABTEILUNG_BEISPIEL,
      ...ONBOARDING_ABTEILUNG_IT,
      itemId: "00000000-0000-0000-0000-00000000001a",
      itemTitle: "Benutzerkonto und E-Mail-Adresse anlegen",
      aufgabe: "Benutzerkonto und E-Mail-Adresse anlegen",
      offene_aufgaben: 5,
      offene_aufgaben_abteilung: 2,
      erledigt_ueber: "Link der Abteilung",
      kommentar: "Konto angelegt &amp; Postfach eingerichtet.<br>Das Notebook kommt nächste Woche.",
      kommentar_text: ONBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR,
    },
    wired: true,
  },
  {
    // Genau einmal beim Uebergang der Abteilung auf "fertig" ueber ihren Link.
    event: "onboarding-department-completed",
    name: "Onboarding: Abteilung abgeschlossen (Bestaetigung)",
    group: "Onboarding",
    recipientHint: "Abteilung bzw. Führungskraft (Bestätigung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      ...ONBOARDING_ABTEILUNG_BEISPIEL,
      ...ONBOARDING_ABTEILUNG_IT,
      email: "it@example.org",
      completedAt: "2026-10-01T09:30:00.000Z",
      anzahl_aufgaben: 3,
      ist_fuehrungskraft: "",
    },
    wired: true,
  },

  // =============================================
  // Befristete Nachweise (Aufenthaltstitel, Arbeitserlaubnis)
  //
  // Ausgeloest vom taeglichen Cron /api/cron/dokument-ablauf. Zwei Events und
  // nicht eines, weil der Ton ein voellig anderer ist: "bitte Termin bei der
  // Auslaenderbehoerde anstossen" gegen "seit gestern besteht ein
  // Beschaeftigungsverbot". Zwei Vorlagen heissen zwei Betreffzeilen — und HR
  // kann die abgelaufenen Faelle eigens weiterleiten.
  //
  // Beide gehen NUR an das HR-Postfach (Entscheidung 07.09.2026): Den neuen
  // Titel besorgt zwar die beschaeftigte Person, aber das
  // Beschaeftigungsverbot trifft den Arbeitgeber — und der Magic Link der
  // Person ist zum Ablaufzeitpunkt regelmaessig laengst tot.
  //
  // Die Adresse der Person steht deshalb als `mitarbeiter_email` im Payload
  // und NICHT als `email`: `{{email}}` im An-Feld einer Vorlage soll keine
  // Adresse ergeben (Ergebnis SKIPPED mit Protokolleintrag), statt die interne
  // Warnung an die betroffene Person selbst zu schicken.
  // =============================================
  {
    event: "dokument-ablauf-warnung",
    name: "Befristeter Nachweis läuft ab (HR-Erinnerung)",
    group: "Onboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      documentId: "00000000-0000-0000-0000-0000000000d1",
      mitarbeiter_name: "Max Mustermann",
      mitarbeiter_email: "max.mustermann@example.org",
      organization: "FES Minden",
      dokument_typ: "Aufenthaltstitel",
      dokument_datei: "aufenthaltstitel-vorderseite.pdf",
      gueltig_bis: "20.10.2026",
      tage_verbleibend: 42,
      tage_ueberfaellig: 0,
      dringlichkeit: "Warnung",
      frist_text: "Läuft in 42 Tagen ab (20.10.2026)",
      portalLink:
        "https://hr.fes-credo.de/dashboard/00000000-0000-0000-0000-000000000001",
    },
    wired: true,
  },
  {
    event: "dokument-abgelaufen",
    name: "Befristeter Nachweis ist abgelaufen (HR-Warnung)",
    group: "Onboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      displayId: "2026-GYM-001",
      documentId: "00000000-0000-0000-0000-0000000000d1",
      mitarbeiter_name: "Max Mustermann",
      mitarbeiter_email: "max.mustermann@example.org",
      organization: "FES Minden",
      dokument_typ: "Aufenthaltstitel",
      dokument_datei: "aufenthaltstitel-vorderseite.pdf",
      gueltig_bis: "01.09.2026",
      tage_verbleibend: -7,
      tage_ueberfaellig: 7,
      dringlichkeit: "Abgelaufen",
      frist_text: "Abgelaufen seit 7 Tagen (01.09.2026)",
      portalLink:
        "https://hr.fes-credo.de/dashboard/00000000-0000-0000-0000-000000000001",
    },
    wired: true,
  },

  // =============================================
  // Dokumentenpaket in Offboarding, Verbeamtung und Vertragsverlaengerung
  //
  // Gleicher Aufbau wie onboarding-starter-packet-sent; je Modul kommt eine
  // eigene Datumsvariable dazu, die der Lader in dokumentenpaket.ts fuellt.
  // =============================================
  {
    event: "offboarding-documents-sent",
    name: "Unterlagen zum Austritt (Offboarding)",
    group: "Offboarding",
    recipientHint: "Ausscheidende:r (private Adresse bevorzugt, im Dialog aenderbar)",
    defaultRecipients: { to: "{{email}}" },
    // Wie versendePaket (dokumentenpaket.ts) ihn baut: nur `refId`, kein
    // `offboardingId`; `austrittsdatum` kommt SCHON formatiert (TT.MM.JJJJ).
    // Der Mailer reicht es seit der Reparatur unveraendert durch — vorher
    // machte er daraus "Invalid Date". "01.08.2026" statt eines Datums, dessen
    // Tag groesser als 12 ist, damit ein vertauschtes Tag/Monat im
    // Testversand sofort auffiele.
    samplePayload: {
      refId: "00000000-0000-0000-0000-000000000001",
      displayId: "OFF-2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      organization: "FES Minden",
      einrichtung: "FES Minden",
      anzahlDokumente: 3,
      dokumentenliste: "1. Arbeitszeugnis\n2. Bescheinigung",
      dokumentenliste_html: "<ol><li>Arbeitszeugnis</li><li>Bescheinigung</li></ol>",
      nachricht: "",
      nachricht_html: "",
      sachbearbeiter_name: "Erika Sachbearbeiter",
      austrittsdatum: "01.08.2026",
    },
    wired: true,
  },

  {
    event: "civil-service-documents-sent",
    name: "Unterlagen zur Verbeamtung",
    group: "Verbeamtung",
    recipientHint: "Lehrkraft im Verbeamtungsverfahren",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      refId: "00000000-0000-0000-0000-000000000001",
      civilServiceId: "00000000-0000-0000-0000-000000000001",
      displayId: "PSI-2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      organization: "FES Minden",
      einrichtung: "FES Minden",
      anzahlDokumente: 3,
      dokumentenliste: "1. Arbeitszeugnis\n2. Bescheinigung",
      dokumentenliste_html: "<ol><li>Arbeitszeugnis</li><li>Bescheinigung</li></ol>",
      nachricht: "",
      nachricht_html: "",
      sachbearbeiter_name: "Erika Sachbearbeiter",
      probezeit_beginn: "01.08.2026",
    },
    wired: true,
  },

  {
    event: "contract-renewal-documents-sent",
    name: "Unterlagen zur Vertragsverlaengerung",
    group: "Vertragsende",
    recipientHint: "Beschaeftigte:r mit verlaengertem Vertrag",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      refId: "00000000-0000-0000-0000-000000000001",
      contractEndId: "00000000-0000-0000-0000-000000000001",
      displayId: "VE-2026-GYM-001",
      email: "max.mustermann@example.org",
      vorname: "Max",
      nachname: "Mustermann",
      organization: "FES Minden",
      einrichtung: "FES Minden",
      anzahlDokumente: 3,
      dokumentenliste: "1. Arbeitszeugnis\n2. Bescheinigung",
      dokumentenliste_html: "<ol><li>Arbeitszeugnis</li><li>Bescheinigung</li></ol>",
      nachricht: "",
      nachricht_html: "",
      sachbearbeiter_name: "Erika Sachbearbeiter",
      vertragsende_neu: "31.07.2028",
    },
    wired: true,
  },

  // =============================================
  // Offboarding
  // =============================================
  {
    event: "offboarding-created",
    name: "Neuer Offboarding-Vorgang erstellt",
    group: "Offboarding",
    // BEWUSST kein Default: die Mail darf NICHT automatisch an die
    // gekuendigte Person gehen (z.B. Anlage vor dem Kuendigungsgespraech)
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      ...OFFBOARDING_BEISPIEL,
      employeeEmail: "max.mustermann@example.org",
      exitType: "KUENDIGUNG_ARBEITNEHMER",
    },
    wired: true,
  },
  {
    // Ausloeser: "Abteilungen informieren", "Erneut senden", "Link erneuern"
    // und "Erinnern" nach einer Adressaenderung (zuweisungsPayload in
    // src/lib/abteilungsaufgaben-dienst.ts). Das Beispiel ist die Erstmail an
    // die IT (siehe OFFBOARDING_ABTEILUNG_BEISPIEL_AUFGABEN).
    event: "offboarding-department-assigned",
    name: "Offboarding-Aufgaben für Abteilung zugewiesen",
    group: "Offboarding",
    recipientHint: "Abteilung bzw. Führungskraft (Link zu den Aufgaben)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      ...OFFBOARDING_BEISPIEL,
      ...OFFBOARDING_ABTEILUNG_IT,
      email: "it@example.org",
      // informiert am 17.08.2026, 08:00 UTC + 90 Tage
      expiresAt: "2026-11-15T08:00:00.000Z",
      taskCount: 3,
      token: "00000000-0000-0000-0000-00000000000a",
      magicLink: BEISPIEL_LINK,
      link: BEISPIEL_LINK,
      ...OFFBOARDING_ABTEILUNG_AUFGABENLISTE,
      erneut_gesendet: "",
      neuer_link: "",
      ist_fuehrungskraft: "",
    },
    wired: true,
  },
  {
    // Zwei Aufrufer (Link der Abteilung und Portal-Checkliste) mit demselben
    // Aufbau (aufgabeErledigtMelden in src/lib/abteilungsaufgaben-uebergaenge.ts);
    // das Beispiel zeigt den Link-Weg. Der Portal-Weg sendet zusaetzlich
    // taskId/taskTitle/taskCategory/completedById. `kommentar` ist schon
    // maskiert (fuer das HTML), `kommentar_text` der Rohtext (Textteil).
    event: "offboarding-task-completed",
    name: "Offboarding-Aufgabe erledigt",
    group: "Offboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      ...OFFBOARDING_BEISPIEL,
      ...OFFBOARDING_ABTEILUNG_IT,
      itemId: "00000000-0000-0000-0000-00000000000b",
      itemTitle: "IT-Zugänge und E-Mail-Konto sperren",
      aufgabe: "IT-Zugänge und E-Mail-Konto sperren",
      offene_aufgaben: 5,
      offene_aufgaben_abteilung: 2,
      erledigt_ueber: "Link der Abteilung",
      kommentar: "Konto gesperrt &amp; Abwesenheitsnotiz eingerichtet.<br>Der Laptop fehlt noch.",
      kommentar_text: OFFBOARDING_ABTEILUNG_BEISPIEL_KOMMENTAR,
    },
    wired: true,
  },
  {
    // Genau einmal beim Uebergang der Abteilung auf "fertig" ueber ihren Link.
    event: "offboarding-department-completed",
    name: "Offboarding: Abteilung abgeschlossen (Bestaetigung)",
    group: "Offboarding",
    recipientHint: "Abteilung bzw. Führungskraft (Bestätigung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      ...OFFBOARDING_BEISPIEL,
      ...OFFBOARDING_ABTEILUNG_IT,
      email: "it@example.org",
      completedAt: "2026-09-01T09:30:00.000Z",
      anzahl_aufgaben: 3,
      ist_fuehrungskraft: "",
    },
    wired: true,
  },
  {
    // Knopf "Erinnern" und taeglicher Lauf senden denselben Aufbau
    // (erinnerungsPayload in src/lib/abteilungsaufgaben-dienst.ts). Die
    // englischen Felder (level, overdueItems, …) bleiben fuer Webhooks, die
    // deutschen Merker (ist_warnung, …) steuern die Bloecke der Vorlage.
    event: "offboarding-reminder",
    name: "Erinnerung: Offene Offboarding-Aufgaben",
    group: "Offboarding",
    recipientHint: "Abteilung bzw. Führungskraft (Erinnerung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      ...OFFBOARDING_BEISPIEL,
      ...OFFBOARDING_ABTEILUNG_IT,
      email: "it@example.org",
      reminderCount: 1,
      // beim Erinnern am 30.08.2026, 06:00 UTC auf + 90 Tage verlaengert
      expiresAt: "2026-11-28T06:00:00.000Z",
      magicLink: BEISPIEL_LINK,
      link: BEISPIEL_LINK,
      level: "WARNING",
      overdueItems: 1,
      upcomingItems: 1,
      totalOpenItems: 3,
      offene_aufgaben: 3,
      maxOverdueDays: 2,
      ueberfaellige_aufgaben: "1",
      tage_ueberfaellig: "2",
      ist_ueberfaellig: "ja",
      ist_info: "",
      ist_warnung: "ja",
      ist_eskalation: "",
      ...OFFBOARDING_ABTEILUNG_AUFGABENLISTE,
      ist_fuehrungskraft: "",
    },
    wired: true,
  },
  {
    event: "offboarding-task-overdue",
    name: "Offboarding-Aufgabe überfällig",
    group: "Offboarding",
    recipientHint: "HR intern — Event wird derzeit von keiner Stelle ausgeloest",
    defaultRecipients: { to: "" },
    samplePayload: {
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      departmentName: "IT-Abteilung",
      employeeName: "Max Mustermann",
      organizationName: "FES Minden",
    },
    wired: false,
  },
  {
    event: "offboarding-completed",
    name: "Offboarding abgeschlossen",
    group: "Offboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      ...OFFBOARDING_BEISPIEL,
      employeeEmail: "max.mustermann@example.org",
      completedAt: "2026-09-01T10:00:00.000Z",
      // Beispiel mit offenem Rest, damit der Testversand den Hinweisblock zeigt.
      offene_aufgaben_beim_abschluss: "2",
    },
    wired: true,
  },

  // =============================================
  // Exit-Interview
  // =============================================
  {
    event: "exit-interview-invited",
    name: "Exit-Interview: Einladung",
    group: "Exit-Interview",
    recipientHint: "Ausscheidende:r Mitarbeiter:in (Magic-Link zum Interview)",
    defaultRecipients: { to: "{{recipientEmail}}" },
    samplePayload: {
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      recipientEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      magicLink: BEISPIEL_LINK,
      expiresAt: "2026-09-30T00:00:00.000Z",
    },
    wired: true,
  },

  // =============================================
  // Verbeamtung (PSI)
  // =============================================
  {
    event: "psi-created",
    name: "Verbeamtung: Vorgang angelegt",
    group: "Verbeamtung",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      displayId: "PSI-2026-GYM-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      targetStartDate: "2026-09-01T00:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "psi-phase-completed",
    name: "Verbeamtung: Phase abgeschlossen",
    group: "Verbeamtung",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      displayId: "PSI-2026-GYM-001",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      phaseKey: "PHASE_1",
      phaseName: "Vorbereitung",
      completedAt: "2026-06-01T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "psi-completed",
    name: "Verbeamtung: Vorgang abgeschlossen",
    group: "Verbeamtung",
    recipientHint: "Lehrkraft (Abschluss-Information)",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      displayId: "PSI-2026-GYM-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      decisionType: "PROBE",
      decisionDate: "2026-06-01T00:00:00.000Z",
      completedAt: "2026-06-01T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "psi-deadline-warning",
    name: "Verbeamtung: Fristen-Warnung (HR-Sammelmail)",
    group: "Verbeamtung",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    // Die echten Felder des Crons (cron/civil-service-deadlines). Das alte
    // Beispiel zeigte die Felder EINES Hinweises auf oberster Ebene — so
    // sieht der Payload nie aus, und der Testversand rendert "0 Frist(en)"
    // mit leerer Dringlichkeit. `warnings` (Liste) und `bySeverity` (Objekt)
    // fehlen hier, weil der Katalog nur skalare Werte kennt; ihre Inhalte
    // stehen in den flachen Feldern daneben.
    samplePayload: {
      timestamp: "2026-09-22T06:00:00.000Z",
      totalWarnings: PSI_FRISTEN_BEISPIEL.length,
      shownWarnings: PSI_FRISTEN_BEISPIEL.length,
      truncated: false,
      omittedCount: 0,
      topSeverity: "OVERDUE",
      // Ab hier: was fristenMailFelder(PSI_FRISTEN_BEISPIEL, { maxAnzeige: 50,
      // portalBasis: PSI_FRISTEN_BEISPIEL_BASIS }) liefert (per Test belegt).
      hoechste_dringlichkeit: "Überfällig",
      anzahl_vorgaenge: 2,
      anzahl_ueberfaellig: 1,
      anzahl_dringend: 0,
      anzahl_vorwarnung: 1,
      warnungen_liste:
        "- [Überfällig] PSI-2026-GYM-001 · Max Mustermann: BR-Genehmigung überfällig. BR-Antrag eingereicht am 02.06.2026, 8-Wochen-Frist abgelaufen. (Frist: 28.07.2026)\n" +
        "  https://hr.fes-credo.de/dashboard/civil-service/00000000-0000-0000-0000-000000000003\n" +
        "- [Vorwarnung] PSI-2026-GYM-002 · Erika Beispiel: 2. Beurteilung steht an (T+9 Monate erreicht). (Frist: 01.11.2026)\n" +
        "  https://hr.fes-credo.de/dashboard/civil-service/00000000-0000-0000-0000-000000000004",
      warnungen_liste_html:
        '<ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:1.5;">' +
        '<li style="margin:0 0 10px;"><strong style="color:#991b1b;">Überfällig</strong> · ' +
        '<a href="https://hr.fes-credo.de/dashboard/civil-service/00000000-0000-0000-0000-000000000003" style="color:#575756;">PSI-2026-GYM-001</a> · Max Mustermann<br>' +
        '<span style="color:#374151;">BR-Genehmigung überfällig. BR-Antrag eingereicht am 02.06.2026, 8-Wochen-Frist abgelaufen.</span><br>' +
        '<span style="color:#6b7280;font-size:12px;">Frist: 28.07.2026</span></li>' +
        '<li style="margin:0 0 10px;"><strong style="color:#1e40af;">Vorwarnung</strong> · ' +
        '<a href="https://hr.fes-credo.de/dashboard/civil-service/00000000-0000-0000-0000-000000000004" style="color:#575756;">PSI-2026-GYM-002</a> · Erika Beispiel<br>' +
        '<span style="color:#374151;">2. Beurteilung steht an (T+9 Monate erreicht).</span><br>' +
        '<span style="color:#6b7280;font-size:12px;">Frist: 01.11.2026</span></li></ul>',
      weitere_warnungen: "",
    },
    wired: true,
  },
  {
    event: "psi-assessment-requested",
    name: "Verbeamtung: Beurteilung angefordert",
    group: "Verbeamtung",
    recipientHint: "Gutachter:in / Schulleitung (Magic-Link zum Beurteilungsformular)",
    defaultRecipients: { to: "{{recipientEmail}}" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      assessmentId: "00000000-0000-0000-0000-000000000004",
      displayId: "PSI-2026-GYM-001",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      assessmentNumber: 1,
      assessmentType: "BEURTEILUNG",
      recipientEmail: "schulleitung@example.org",
      recipientName: "Erika Beispiel",
      magicLink: BEISPIEL_LINK,
      tokenExpiresAt: "2026-09-15T00:00:00.000Z",
      fach: "Mathematik",
      klasse: "8b",
    },
    wired: true,
  },
  {
    event: "psi-assessment-completed",
    name: "Verbeamtung: Beurteilung eingereicht",
    group: "Verbeamtung",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      assessmentId: "00000000-0000-0000-0000-000000000004",
      displayId: "PSI-2026-GYM-001",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      assessmentType: "BEURTEILUNG",
      assessmentNumber: 1,
      submittedAt: "2026-06-01T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "psi-assessment-released",
    name: "Verbeamtung: Beurteilung freigegeben",
    group: "Verbeamtung",
    recipientHint: "Lehrkraft (Magic-Link zur Kenntnisnahme)",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      assessmentId: "00000000-0000-0000-0000-000000000004",
      displayId: "PSI-2026-GYM-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      ackLink: BEISPIEL_LINK,
      employeeAckExpiresAt: "2026-07-15T00:00:00.000Z",
      releasedToEmployeeAt: "2026-06-11T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "psi-assessment-acknowledged",
    name: "Verbeamtung: Beurteilung zur Kenntnis genommen",
    group: "Verbeamtung",
    recipientHint: "HR intern / Lehrkraft (Quittungs-Bestaetigung)",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      assessmentId: "00000000-0000-0000-0000-000000000004",
      displayId: "PSI-2026-GYM-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      acknowledgedByEmployeeAt: "2026-06-11T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "psi-assessment-archived",
    name: "Verbeamtung: Beurteilung archiviert",
    group: "Verbeamtung",
    recipientHint: "HR intern / Lehrkraft (Archivierungs-Information)",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      civilServiceId: "00000000-0000-0000-0000-000000000003",
      assessmentId: "00000000-0000-0000-0000-000000000004",
      displayId: "PSI-2026-GYM-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      archivedAt: "2026-06-11T10:00:00.000Z",
    },
    wired: true,
  },

  // =============================================
  // Elternzeit
  // =============================================
  {
    event: "elternzeit-angelegt",
    name: "Elternzeit: Vorgang angelegt",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      personalgruppe: "LEHRKRAFT",
      geschlecht: "VATER",
    },
    wired: true,
  },
  {
    event: "elternzeit-antrag-link-versandt",
    name: "Elternzeit: Antrags-Link versandt",
    group: "Elternzeit",
    recipientHint: "Mitarbeiter:in (Magic-Link zum Antragsformular)",
    defaultRecipients: { to: "{{recipientEmail}}" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      recipientEmail: "max.mustermann@example.org",
      antragTyp: "vorläufig",
      magicUrl: BEISPIEL_LINK,
    },
    wired: true,
  },
  {
    event: "elternzeit-antrag-eingereicht",
    name: "Elternzeit: Antrag eingereicht",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      antragTyp: "vorläufig",
    },
    wired: true,
  },
  {
    event: "elternzeit-vorl-genehmigt",
    name: "Elternzeit: Vorlaeufig genehmigt",
    group: "Elternzeit",
    recipientHint: "Mitarbeiter:in",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
    },
    wired: true,
  },
  {
    event: "elternzeit-vorl-abgelehnt",
    name: "Elternzeit: Vorlaeufig abgelehnt",
    group: "Elternzeit",
    recipientHint: "Mitarbeiter:in",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
    },
    wired: true,
  },
  {
    event: "elternzeit-endg-genehmigt",
    name: "Elternzeit: Endgueltig genehmigt",
    group: "Elternzeit",
    recipientHint: "Mitarbeiter:in",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
    },
    wired: true,
  },
  {
    event: "elternzeit-endg-abgelehnt",
    name: "Elternzeit: Endgueltig abgelehnt",
    group: "Elternzeit",
    recipientHint: "Mitarbeiter:in",
    defaultRecipients: { to: "{{employeeEmail}}" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
    },
    wired: true,
  },
  {
    event: "elternzeit-leiter-link-versandt",
    name: "Elternzeit: Leiter-Link versandt",
    group: "Elternzeit",
    recipientHint: "Einrichtungsleitung (Magic-Link zur Genehmigung)",
    defaultRecipients: { to: "{{recipientEmail}}" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      recipientEmail: "leitung@example.org",
      magicUrl: BEISPIEL_LINK,
    },
    wired: true,
  },
  {
    event: "elternzeit-leiter-genehmigt",
    name: "Elternzeit: Durch Leitung genehmigt",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeName: "Max Mustermann",
      leiterName: "Erika Beispiel",
    },
    wired: true,
  },
  {
    event: "elternzeit-leiter-abgelehnt",
    name: "Elternzeit: Durch Leitung abgelehnt",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeName: "Max Mustermann",
      leiterName: "Erika Beispiel",
      ablehnungGrund: "Betriebliche Gruende",
    },
    wired: true,
  },
  {
    event: "elternzeit-vbl-generiert",
    name: "Elternzeit: VBL-Information generiert",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
    },
    wired: true,
  },
  {
    event: "elternzeit-ag-bescheinigung-generiert",
    name: "Elternzeit: AG-Bescheinigung generiert",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
    },
    wired: true,
  },
  {
    event: "elternzeit-br-detmold-generiert",
    name: "Elternzeit: BR-Detmold-Dokument generiert",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      generiertAm: "2026-06-11T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "elternzeit-br-genehmigung-eingegangen",
    name: "Elternzeit: BR-Genehmigung eingegangen",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      eingegangenAm: "2026-06-11T10:00:00.000Z",
      brGenehmigungStatus: "GENEHMIGT",
    },
    wired: true,
  },
  {
    event: "elternzeit-frist-eskaliert",
    name: "Elternzeit: Frist eskaliert",
    group: "Elternzeit",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      elternzeitId: "00000000-0000-0000-0000-000000000005",
      displayId: "EZ-2026-001",
      employeeName: "Max Mustermann",
      severity: "WARNING",
      fristTyp: "ANTRAGSFRIST",
      verbleibendeTage: 7,
      fristDatum: "2026-06-18T00:00:00.000Z",
    },
    wired: true,
  },

  // =============================================
  // Mutterschutz
  // =============================================
  {
    event: "mutterschutz-angelegt",
    name: "Mutterschutz: Vorgang angelegt",
    group: "Mutterschutz",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      mutterschutzId: "00000000-0000-0000-0000-000000000006",
      displayId: "MS-2026-001",
      employeeEmail: "erika.beispiel@example.org",
      employeeName: "Erika Beispiel",
      organization: "FES Minden",
      mandantNumber: "01",
      voraussGeburt: "2026-10-01T00:00:00.000Z",
      mutterschutzBeginn: "2026-08-20T00:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "mutterschutz-bad-beauftragt",
    name: "Mutterschutz: BAD beauftragt",
    group: "Mutterschutz",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      mutterschutzId: "00000000-0000-0000-0000-000000000006",
      displayId: "MS-2026-001",
      employeeName: "Erika Beispiel",
      status: "BAD_BEAUFTRAGT",
    },
    wired: true,
  },
  {
    event: "mutterschutz-bad-abgeschlossen",
    name: "Mutterschutz: BAD abgeschlossen",
    group: "Mutterschutz",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      mutterschutzId: "00000000-0000-0000-0000-000000000006",
      displayId: "MS-2026-001",
      employeeName: "Erika Beispiel",
      status: "BAD_ABGESCHLOSSEN",
    },
    wired: true,
  },
  {
    event: "mutterschutz-aktiviert",
    name: "Mutterschutz: Aktiviert",
    group: "Mutterschutz",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      mutterschutzId: "00000000-0000-0000-0000-000000000006",
      displayId: "MS-2026-001",
      employeeName: "Erika Beispiel",
      status: "AKTIV",
    },
    wired: true,
  },
  {
    event: "mutterschutz-beendet",
    name: "Mutterschutz: Beendet",
    group: "Mutterschutz",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      mutterschutzId: "00000000-0000-0000-0000-000000000006",
      displayId: "MS-2026-001",
      employeeName: "Erika Beispiel",
      status: "BEENDET",
    },
    wired: true,
  },

  // =============================================
  // Vertragsende
  // =============================================
  {
    event: "contract-end-created",
    name: "Neuer Vertragsende-Vorgang erstellt",
    group: "Vertragsende",
    // BEWUSST kein Default: HR-interne Benachrichtigung, nicht an die
    // betroffene Person — Empfaenger wird in der Vorlage konfiguriert.
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      contractEndId: "00000000-0000-0000-0000-000000000007",
      displayId: "VE-2026-GYM-001",
      employeeName: "Max Mustermann",
      employeeEmail: "max.mustermann@example.org",
      organization: "FES Minden",
      mandantNummer: "01",
      contractEndDate: "2026-12-31T00:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "contract-end-supervisor-link",
    name: "Einladung Vorgesetzter (Vertragsverlängerung)",
    group: "Vertragsende",
    recipientHint: "Vorgesetzte:r (Magic-Link zum Vertragsdaten-Formular)",
    defaultRecipients: { to: "{{supervisorEmail}}" },
    samplePayload: {
      contractEndId: "00000000-0000-0000-0000-000000000007",
      displayId: "VE-2026-GYM-001",
      employeeName: "Max Mustermann",
      supervisorEmail: "vorgesetzte@example.org",
      organization: "FES Minden",
      contractEndDate: "2026-12-31T00:00:00.000Z",
      formularLink: BEISPIEL_LINK,
      tokenExpiresAt: "2026-07-15T12:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "contract-end-supervisor-reminder",
    name: "Erinnerung Vorgesetzter (Vertragsende-Anfrage offen)",
    group: "Vertragsende",
    recipientHint: "Vorgesetzte:r — Erinnerung bei unbeantworteter Uebernahme-Anfrage",
    defaultRecipients: { to: "{{supervisorEmail}}" },
    samplePayload: {
      contractEndId: "00000000-0000-0000-0000-000000000007",
      displayId: "VE-2026-GYM-001",
      employeeName: "Max Mustermann",
      mitarbeiter_name: "Max Mustermann",
      supervisorEmail: "vorgesetzte@example.org",
      einrichtung: "FES Minden",
      organization: "FES Minden",
      contractEndDate: "2026-12-31T00:00:00.000Z",
      vertragsende: "31.12.2026",
      formularLink: BEISPIEL_LINK,
      link: BEISPIEL_LINK,
      tage_offen: 7,
      dringlichkeit: "Warnung",
    },
    wired: true,
  },
  {
    event: "contract-end-eskalation",
    name: "Eskalation an HR (Vorgesetzter reagiert nicht)",
    group: "Vertragsende",
    // BEWUSST kein Default: HR-interne Benachrichtigung — Empfaenger wird in
    // der Vorlage konfiguriert (Pflicht-Konfigurationsschritt, sonst SKIPPED).
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      contractEndId: "00000000-0000-0000-0000-000000000007",
      displayId: "VE-2026-GYM-001",
      mitarbeiter_name: "Max Mustermann",
      supervisorEmail: "vorgesetzte@example.org",
      einrichtung: "FES Minden",
      organization: "FES Minden",
      vertragsende: "31.12.2026",
      contractEndDate: "2026-12-31T00:00:00.000Z",
      anzahl_erinnerungen: 3,
      tage_offen: 21,
      dringlichkeit: "Kritisch",
      portalLink: "https://hr.fes-credo.de/dashboard/contract-end/00000000-0000-0000-0000-000000000007",
    },
    wired: true,
  },
  {
    event: "contract-end-unbearbeitet",
    name: "Woechentlicher HR-Hinweis (Vertragsende ohne Anfrage)",
    group: "Vertragsende",
    // BEWUSST kein Default: HR-interne Sammel-Benachrichtigung.
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      anzahl: 2,
      liste_text:
        "VE-2026-GYM-001 · Max Mustermann · FES Minden · Vertragsende 31.12.2026 (Kritisch)\nVE-2026-GES-004 · Erika Musterfrau · Gesamtschule · Vertragsende 28.02.2027 (Warnung)",
      liste_html:
        "<li>VE-2026-GYM-001 · Max Mustermann · FES Minden · Vertragsende 31.12.2026 (Kritisch)</li><li>VE-2026-GES-004 · Erika Musterfrau · Gesamtschule · Vertragsende 28.02.2027 (Warnung)</li>",
      portalLink: "https://hr.fes-credo.de/dashboard?tab=contract-end",
    },
    wired: true,
  },
];

// =============================================
// Hilfsfunktionen
// =============================================
const catalogByEvent = new Map(EVENT_CATALOG.map((def) => [def.event, def]));

export function getEventDefinition(event: string): EventDefinition | undefined {
  return catalogByEvent.get(event);
}

/** Gruppen in fester Anzeige-Reihenfolge */
export const EVENT_GROUP_ORDER: EventGroup[] = [
  "Onboarding",
  "Offboarding",
  "Vertragsende",
  "Exit-Interview",
  "Verbeamtung",
  "Elternzeit",
  "Mutterschutz",
];
