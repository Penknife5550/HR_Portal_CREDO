/**
 * Portal-Layout (für HR-Dashboard und Login)
 * Dieses Layout wird für alle Seiten unter /(portal)/ verwendet.
 *
 * Der ToastAnbieter zeichnet die Meldungen aus `toast.ok(…)`/`toast.fehler(…)`
 * (src/components/ui/toast.tsx) — genau einmal, hier.
 */
import { ToastAnbieter } from "@/components/ui/toast";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ToastAnbieter />
    </>
  );
}
