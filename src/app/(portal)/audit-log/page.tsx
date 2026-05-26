import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuditLogContent } from "./audit-log-content";

/**
 * Audit-Log Seite (Server Component)
 *
 * Nur für SUPER_ADMIN und HR_LEITUNG zugaenglich.
 */
export default async function AuditLogPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
    redirect("/dashboard");
  }

  return <AuditLogContent user={session} />;
}
