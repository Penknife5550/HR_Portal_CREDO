/**
 * Schulferien-Verwaltung (Server Component)
 *
 * NRW Schulferien-Kalender pflegen — wird fuer Feriensperrfrist-Check
 * (§ 11 FrUrlV NRW) bei Elternzeit-Antraegen genutzt.
 *
 * Zugang: SUPER_ADMIN, HR_LEITUNG.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/permissions";
import { SchulferienContent } from "./schulferien-content";

export default async function SchulferienPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ADMIN_ROLES.includes(session.role)) redirect("/dashboard");
  return <SchulferienContent user={session} />;
}
