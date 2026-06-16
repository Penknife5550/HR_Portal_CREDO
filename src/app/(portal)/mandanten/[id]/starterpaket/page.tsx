/**
 * Mandanten-Konfiguration: Starterpaket — Server Component.
 *
 * Pro Mandant: welche Pool-Dokumente (gruppenweit + eigene) gehoeren ins
 * Starterpaket, in welcher Reihenfolge. Zugang: SUPER_ADMIN, HR_LEITUNG.
 */
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { StarterpaketContent } from "./starterpaket-content";

export default async function MandantStarterpaketPage({
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

  return <StarterpaketContent user={session} organization={organization} />;
}
