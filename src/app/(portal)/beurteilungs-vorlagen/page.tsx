import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BeurteilungsVorlagenContent } from "./beurteilungs-vorlagen-content";

/**
 * Beurteilungs-Vorlagen — Admin-Verwaltung (Server Component)
 *
 * Verwaltet die rechtlich konformen Vorlagen für die dienstliche Beurteilung
 * im Rahmen der Verbeamtung an Ersatzschulen NRW (BRL Nr. 6.1).
 *
 * Globale Vorlagen + optionale Mandanten-Overrides.
 * Nur SUPER_ADMIN und HR_LEITUNG haben Zugang.
 */
export default async function BeurteilungsVorlagenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "SUPER_ADMIN" && session.role !== "HR_LEITUNG") {
    redirect("/dashboard");
  }

  return <BeurteilungsVorlagenContent user={session} />;
}
