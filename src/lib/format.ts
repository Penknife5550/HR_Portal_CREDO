/**
 * Format-Helper für das CREDO HR-Portal
 *
 * Zentrale Stelle für wiederkehrende String-Formatierungen, die bisher
 * inline an mehreren Stellen gebaut wurden.
 */

/**
 * Baut den Anzeigenamen eines Mitarbeiters/einer Mitarbeiterin aus Vor- und Nachname.
 * Wird in Webhook-Payloads, Mail-Subjects und Audit-Logs konsistent verwendet.
 */
export function formatEmployeeName(person: {
  employeeFirstName: string;
  employeeLastName: string;
}): string {
  return `${person.employeeFirstName} ${person.employeeLastName}`.trim();
}
