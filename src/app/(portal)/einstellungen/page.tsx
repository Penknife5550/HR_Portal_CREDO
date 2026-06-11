import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { EinstellungenContent } from "./einstellungen-content";

/**
 * Einstellungen-Seite (Server Component)
 *
 * Zugaenglich für SUPER_ADMIN und HR_LEITUNG.
 * Verwaltet: E-Mail-Versand (SMTP, Vorlagen, Status, Protokoll),
 * Webhooks, Abteilungen und API-Zugang
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
