import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ZeugnisVorlagenContent } from "./zeugnis-vorlagen-content";

/**
 * Zeugnis-Bewertungsboegen-Verwaltung (Server Component)
 * Prueft die Session und leitet zum Login um wenn nicht angemeldet.
 * Nur SUPER_ADMIN und HR_LEITUNG haben Zugang.
 */
export default async function ZeugnisVorlagenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Nur SUPER_ADMIN und HR_LEITUNG duerfen Zeugnis-Vorlagen verwalten
  if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
    redirect("/dashboard");
  }

  return <ZeugnisVorlagenContent user={session} />;
}
