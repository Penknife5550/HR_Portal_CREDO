"use client";

/**
 * Musterseite, das Textfeld: mit Hilfetext und Pruefung beim Absenden, mit
 * stehendem Fehler, mit Platzhalter und gesperrt.
 *
 * Die Pruefung hier ist nur eine Vorfuehrung; welche Eingabe gilt, entscheidet
 * der Aufrufer (im Pilot die Zod-Schemas der Route), nicht der Baustein.
 */
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textfeld } from "@/components/ui/textfeld";

export function TextfeldMuster() {
  const [adresse, setAdresse] = useState("");
  const [fehler, setFehler] = useState("");

  function pruefen(e: FormEvent) {
    e.preventDefault();
    setFehler(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse.trim())
        ? ""
        : "Bitte eine vollständige E-Mail-Adresse eingeben, z. B. name@beispiel.de.",
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={pruefen} noValidate className="space-y-3">
        <Textfeld
          label="E-Mail der Führungskraft"
          type="email"
          name="adresse"
          autoComplete="off"
          hilfe="An diese Adresse geht der Link zum Formular."
          fehler={fehler}
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
        <Button type="submit" groesse="sm">
          Prüfen
        </Button>
      </form>

      <div className="space-y-5">
        <Textfeld label="Personalnummer" defaultValue="10a42" fehler="Nur Ziffern, z. B. 104233." />
        <Textfeld label="Bemerkung (optional)" placeholder="z. B. Vertretung bis zu den Sommerferien" />
        <Textfeld label="Vorgangsnummer" defaultValue="VE-2026-BK-0007" disabled />
      </div>
    </div>
  );
}
