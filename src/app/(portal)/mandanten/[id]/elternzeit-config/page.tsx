/**
 * Mandanten-Konfiguration: Elternzeit & Mutterschutz (Server Component)
 *
 * Pflegbar pro Mandant: Geschaeftsfuehrung (Briefunterschrift),
 * Standard-Einrichtungsleiter, BR Detmold-Kontakt, Token-Validity.
 *
 * Zugang: SUPER_ADMIN, HR_LEITUNG.
 */

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/permissions";
import { ElternzeitConfigContent } from "./elternzeit-config-content";

export default async function MandantElternzeitConfigPage({
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
      ezGfFirstName: true,
      ezGfLastName: true,
      ezGfTitle: true,
      ezSignaturePath: true,
      ezDefaultLeiterFirstName: true,
      ezDefaultLeiterLastName: true,
      ezDefaultLeiterEmail: true,
      ezBrDetmoldName: true,
      ezBrDetmoldEmail: true,
      ezBrDetmoldPhone: true,
      ezBrDetmoldAktenPrefix: true,
      ezTokenValidityDays: true,
    },
  });

  if (!organization) notFound();

  return <ElternzeitConfigContent user={session} organization={organization} />;
}
