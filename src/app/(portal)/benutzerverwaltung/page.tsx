import { vorgangslistePfad } from "@/lib/adressen";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BenutzerverwaltungContent } from "./benutzerverwaltung-content";

/**
 * Benutzerverwaltung (Server Component)
 *
 * Nur für SUPER_ADMIN und HR_LEITUNG zugaenglich.
 * Prueft die Session und leitet um wenn nicht berechtigt.
 */
export default async function BenutzerverwaltungPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
    redirect(vorgangslistePfad());
  }

  return <BenutzerverwaltungContent user={session} />;
}
