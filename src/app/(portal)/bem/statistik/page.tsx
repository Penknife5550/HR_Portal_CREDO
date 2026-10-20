/**
 * Duenne Seiten-Datei (UX-Umbau U1): Die Adresse ist neu, der Inhalt liegt
 * weiter unter `src/app/(portal)/dashboard/` und zieht erst mit dem Umbau des
 * Moduls um (U4) — siehe docs/module/ux-ui/u1-feinplan.md, 3.2.
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { bemPfad } from "@/lib/adressen";
import { canManageBemAccess } from "@/lib/permissions";
import { BemStatistikContent } from "@/app/(portal)/dashboard/bem/statistik/statistik-content";

export default async function BemStatistikPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Anonyme Aggregate, aber nur fuer die BEM-Steuerung (IKS) zugaenglich.
  if (!canManageBemAccess(session)) redirect(bemPfad());
  return <BemStatistikContent user={session} />;
}
