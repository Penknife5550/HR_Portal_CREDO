/**
 * Mandanten-Konfiguration: BEM-Ansprechpartner:innen — Server Component
 *
 * Pro Mandant pflegbare Liste von Ansprechpartner:innen, die im BEM-
 * Einwilligungs-Formular vom Mitarbeiter ausgewählt werden können.
 * Zugang: SUPER_ADMIN, HR_LEITUNG.
 */

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { BemAnsprechpartnerContent } from "./bem-ansprechpartner-content";

export default async function MandantBemAnsprechpartnerPage({
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
    select: { id: true, mandantNumber: true, name: true },
  });
  if (!organization) notFound();

  return <BemAnsprechpartnerContent user={session} organization={organization} />;
}
