/**
 * Mandanten-Konfiguration: Verantwortliche Stelle (DSGVO) — Server Component
 *
 * Pflegbar pro Mandant; faellt im Personalfragebogen + in Briefen auf den
 * globalen Default zurueck (src/lib/dsgvo.ts), wenn leer.
 *
 * Zugang: SUPER_ADMIN, HR_LEITUNG.
 */

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { DsgvoConfigContent } from "./dsgvo-config-content";

export default async function MandantDsgvoConfigPage({
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
    select: {
      id: true,
      mandantNumber: true,
      name: true,
      shortName: true,
      type: true,
      dsgvoVerantwortlicheName: true,
      dsgvoVerantwortlicheStrasse: true,
      dsgvoVerantwortlichePlz: true,
      dsgvoVerantwortlicheOrt: true,
    },
  });

  if (!organization) notFound();

  return <DsgvoConfigContent user={session} organization={organization} />;
}
