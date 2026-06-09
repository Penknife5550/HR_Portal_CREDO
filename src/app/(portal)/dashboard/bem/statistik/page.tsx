import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManageBemAccess } from "@/lib/permissions";
import { BemStatistikContent } from "./statistik-content";

export default async function BemStatistikPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Anonyme Aggregate, aber nur fuer die BEM-Steuerung (IKS) zugaenglich.
  if (!canManageBemAccess(session)) redirect("/dashboard/bem");
  return <BemStatistikContent user={session} />;
}
