/**
 * Mandanten-Konfiguration: Vertragsende-Formularfelder (Server Component).
 *
 * Pro Mandant pflegbar: welche Felder im oeffentlichen Vertragsdaten-Formular
 * sichtbar/Pflicht sind und ihr Label. Zugang: SUPER_ADMIN, HR_LEITUNG.
 */

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { resolveContractEndFieldConfig } from "@/lib/contract-end-fields";
import { VertragsendeConfigContent } from "./vertragsende-config-content";

export default async function MandantVertragsendeConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ADMIN_ROLES.includes(session.role)) redirect("/dashboard");

  const { id } = await params;
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true, mandantNumber: true, contractEndFieldConfig: true },
  });
  if (!organization) notFound();

  return (
    <VertragsendeConfigContent
      user={session}
      organization={{ id: organization.id, name: organization.name, mandantNumber: organization.mandantNumber }}
      initialFields={resolveContractEndFieldConfig(organization.contractEndFieldConfig)}
    />
  );
}
