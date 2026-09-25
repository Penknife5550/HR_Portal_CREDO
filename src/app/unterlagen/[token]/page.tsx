"use client";

/**
 * Unterlagen nachreichen – Magic-Link-Seite der Person (ohne Anmeldung, Paket 4)
 *
 * Duenne Huelle um src/components/unterlagen/upload-seite.tsx: Hier steht nur,
 * woher der Token kommt. Laden, Hochladen, Entfernen, „Gültig bis",
 * Übermitteln, Fehlerseite und Fusszeile liegen in der Komponente; die
 * Kopfdaten (noindex, no-referrer) im layout.tsx daneben.
 */

import { useParams } from "next/navigation";
import { UploadSeite } from "@/components/unterlagen/upload-seite";

export default function UnterlagenPage() {
  const params = useParams();
  const token = String(params.token ?? "");

  return <UploadSeite token={token} />;
}
