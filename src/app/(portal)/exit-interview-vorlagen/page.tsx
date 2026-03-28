import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ExitInterviewVorlagenContent } from "./exit-interview-vorlagen-content";

/**
 * Exit-Interview-Vorlagen-Seite (Server Component)
 * Prueft die Session und leitet zum Login um wenn nicht angemeldet.
 * Nur SUPER_ADMIN und HR_LEITUNG haben Zugang.
 */
export default async function ExitInterviewVorlagenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Nur SUPER_ADMIN und HR_LEITUNG duerfen Exit-Interview-Vorlagen verwalten
  if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
    redirect("/dashboard");
  }

  return <ExitInterviewVorlagenContent user={session} />;
}
