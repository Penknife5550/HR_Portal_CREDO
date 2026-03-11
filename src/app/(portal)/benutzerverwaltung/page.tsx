import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BenutzerverwaltungContent } from "./benutzerverwaltung-content";

/**
 * Benutzerverwaltung (Server Component)
 *
 * Nur fuer SUPER_ADMIN und HR_LEITUNG zugaenglich.
 * Prueft die Session und leitet um wenn nicht berechtigt.
 */
export default async function BenutzerverwaltungPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
    redirect("/dashboard");
  }

  return <BenutzerverwaltungContent user={session} />;
}
