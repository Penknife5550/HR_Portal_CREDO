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
    samplePayload: {
      onboardingId: "00000000-0000-0000-0000-000000000001",
      supervisorEmail: "leitung@example.org",
      modalitaetenLink: BEISPIEL_LINK,
      employeeName: "Max Mustermann",
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
    name: "Erinnerung Vorgesetzter (Modalitaeten ausstehend)",
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
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      employeeEmail: "max.mustermann@example.org",
      employeeName: "Max Mustermann",
      organization: "FES Minden",
      mandantNumber: "01",
      exitType: "RESIGNATION",
      lastWorkingDay: "2026-08-31T00:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "offboarding-department-assigned",
    name: "Offboarding-Aufgaben für Abteilung zugewiesen",
    group: "Offboarding",
    recipientHint: "Abteilung (Magic-Link zur Checkliste)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      expiresAt: "2026-08-31T00:00:00.000Z",
      employeeName: "Max Mustermann",
      organizationName: "FES Minden",
      lastWorkingDay: "2026-08-31T00:00:00.000Z",
      taskCount: 4,
      magicLink: BEISPIEL_LINK,
    },
    wired: true,
  },
  {
    event: "offboarding-task-completed",
    name: "Offboarding-Aufgabe erledigt",
    group: "Offboarding",
    recipientHint: "HR intern — Empfaenger in der Vorlage konfigurieren",
    defaultRecipients: { to: "" },
    samplePayload: {
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      itemTitle: "Laptop zurueckgeben",
      employeeName: "Max Mustermann",
      organizationName: "FES Minden",
    },
    wired: true,
  },
  {
    event: "offboarding-department-completed",
    name: "Offboarding: Abteilung abgeschlossen (Bestaetigung)",
    group: "Offboarding",
    recipientHint: "Abteilung (Bestaetigung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      employeeName: "Max Mustermann",
      organizationName: "FES Minden",
      completedAt: "2026-08-15T10:00:00.000Z",
    },
    wired: true,
  },
  {
    event: "offboarding-reminder",
    name: "Erinnerung: Offene Offboarding-Aufgaben",
    group: "Offboarding",
    recipientHint: "Abteilung (Erinnerung)",
    defaultRecipients: { to: "{{email}}" },
    samplePayload: {
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      departmentKey: "IT",
      departmentName: "IT-Abteilung",
      email: "it@example.org",
      reminderCount: 1,
      employeeName: "Max Mustermann",
      organizationName: "FES Minden",
      lastWorkingDay: "2026-08-31T00:00:00.000Z",
      magicLink: BEISPIEL_LINK,
      level: "INFO",
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
      offboardingId: "00000000-0000-0000-0000-000000000002",
      displayId: "OFF-2026-GYM-001",
      employeeName: "Max Mustermann",
      status: "COMPLETED",
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
    samplePayload: {
      processId: "00000000-0000-0000-0000-000000000003",
      displayId: "PSI-2026-GYM-001",
      employeeName: "Max Mustermann",
      type: "AMTSARZT_EXPIRING",
      severity: "WARNING",
      message: "Amtsarzt-Termin laeuft in 14 Tagen ab",
      dueDate: "2026-06-25T00:00:00.000Z",
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
  "Exit-Interview",
  "Verbeamtung",
  "Elternzeit",
  "Mutterschutz",
];
