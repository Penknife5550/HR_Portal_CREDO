import { redirect } from "next/navigation";
import { vorgangslistePfad } from "@/lib/adressen";

/**
 * `/vorgaenge` ohne Modul: bis es mit U3 eine Startseite gibt, ist die
 * Onboarding-Liste der Einstieg — wie bisher unter der alten Adresse.
 */
export default function VorgaengePage() {
  redirect(vorgangslistePfad("onboarding"));
}
