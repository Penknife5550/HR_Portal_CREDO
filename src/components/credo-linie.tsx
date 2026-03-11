/**
 * CREDO-Linie – Zentrales Gestaltungselement
 *
 * Linke Haelfte: Grau (#DADADA)
 * Rechte Haelfte: 4 gleichgrosse Farbsegmente
 *   Gelb (#FBC900) -> Gruen (#6BAA24) -> Rot (#E2001A) -> Blau (#009AC6)
 *
 * Fuer Verwaltung immer 4 Segmente.
 * Fuer einzelne Einrichtungen: 2 Segmente in deren Primaerfarbe.
 */

interface CredoLinieProps {
  /** Hoehe der Linie in Pixeln (Standard: 4) */
  height?: number;
  /** Optional: CSS-Klassen */
  className?: string;
}

export function CredoLinie({ height = 4, className = "" }: CredoLinieProps) {
  return (
    <div
      className={`flex w-full ${className}`}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      {/* Linke Haelfte: Grau */}
      <div className="flex-1" style={{ backgroundColor: "#DADADA" }} />
      {/* Rechte Haelfte: 4 Farbsegmente */}
      <div className="flex-[0.125]" style={{ backgroundColor: "#FBC900" }} />
      <div className="flex-[0.125]" style={{ backgroundColor: "#6BAA24" }} />
      <div className="flex-[0.125]" style={{ backgroundColor: "#E2001A" }} />
      <div className="flex-[0.125]" style={{ backgroundColor: "#009AC6" }} />
    </div>
  );
}
