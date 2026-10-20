import { vorgangslistePfad } from "@/lib/adressen";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { MandantenContent } from "./mandanten-content";

/**
 * Mandanten-Verwaltung (Server Component)
 *
 * Nur für SUPER_ADMIN zugaenglich.
 * Prueft die Session und leitet um wenn nicht berechtigt.
 */
export default async function MandantenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "SUPER_ADMIN") {
    redirect(vorgangslistePfad());
  }

  return <MandantenContent user={session} />;
}
