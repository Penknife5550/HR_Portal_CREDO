import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { EinstellungenContent } from "./einstellungen-content";

/**
 * Einstellungen-Seite (Server Component)
 *
 * Zugaenglich fuer SUPER_ADMIN und HR_LEITUNG.
 * Verwaltet: Webhooks, SMTP-Fallback, E-Mail-Vorlagen
 */
export default async function EinstellungenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!["SUPER_ADMIN", "HR_LEITUNG"].includes(session.role)) {
    redirect("/dashboard");
  }

  return <EinstellungenContent user={session} />;
}
