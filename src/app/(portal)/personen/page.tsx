import { vorgangslistePfad } from "@/lib/adressen";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { PersonenContent } from "./personen-content";

/**
 * Personen (Server Component) — Leseansicht des Personalstamms aus DokuBit
 * (Self-Service, Paket S0).
 *
 * Nur fuer SUPER_ADMIN, HR_LEITUNG und HR_SACHBEARBEITER — dieselben Rollen
 * wie GET /api/personalstamm/pruefen (authHandler). Bearbeitet wird in
 * DokuBit, nicht hier.
 */
export default async function PersonenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!HR_EDIT_ROLES.includes(session.role)) {
    redirect(vorgangslistePfad());
  }

  return <PersonenContent user={session} />;
}
