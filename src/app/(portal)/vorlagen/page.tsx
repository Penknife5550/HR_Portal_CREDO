import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { VorlagenContent } from "./vorlagen-content";

/**
 * Formularvorlagen-Seite (Server Component)
 * Prueft die Session und leitet zum Login um wenn nicht angemeldet.
 */
export default async function VorlagenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <VorlagenContent user={session} />;
}
