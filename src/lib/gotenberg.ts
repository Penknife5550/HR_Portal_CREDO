/**
 * Gotenberg-Client — konvertiert .docx zu PDF (LibreOffice-Route).
 *
 * Gotenberg laeuft als Container im internen Docker-Netz (siehe docker-compose.yml,
 * Service "gotenberg"). Erreichbar ueber GOTENBERG_URL (Default http://gotenberg:3000).
 *
 * Die PDF-Erzeugung ist eine On-Demand-Funktion. Faellt der Dienst aus, wirft der
 * Helfer einen aussagekraeftigen Fehler — der Aufrufer faengt ihn ab und kann die
 * Word-Ausgabe trotzdem anbieten (PDF ist optional).
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEFAULT_TIMEOUT_MS = 120_000;

/** Liefert die konfigurierte Gotenberg-Basis-URL (ohne Trailing-Slash). */
export function getGotenbergUrl(): string {
  return (process.env.GOTENBERG_URL || "http://gotenberg:3000").replace(/\/+$/, "");
}

/**
 * Konvertiert ein .docx-Buffer in ein PDF-Buffer via Gotenberg LibreOffice.
 *
 * @param docx     Das gerenderte .docx als Buffer
 * @param filename Dateiname (Gotenberg leitet das Format aus der Endung ab)
 * @param timeoutMs Timeout in Millisekunden (Default 120s)
 * @returns PDF als Buffer
 * @throws Error wenn Gotenberg nicht erreichbar ist oder die Konvertierung fehlschlaegt.
 */
export async function convertDocxToPdf(
  docx: Buffer,
  filename = "dokument.docx",
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Buffer> {
  const url = `${getGotenbergUrl()}/forms/libreoffice/convert`;
  const safeName = filename.toLowerCase().endsWith(".docx")
    ? filename
    : `${filename}.docx`;

  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(docx)], { type: DOCX_MIME }),
    safeName,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Gotenberg nicht erreichbar (${getGotenbergUrl()}): ${reason}`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gotenberg-Konvertierung fehlgeschlagen (HTTP ${res.status}). ${body.slice(0, 300)}`,
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Fuegt mehrere PDF-Buffer in der uebergebenen Reihenfolge zu einem PDF zusammen
 * (Gotenberg pdfengines-Merge). Wird genutzt um das DMS-QR-Deckblatt vor den
 * eigentlichen Inhalt zu setzen.
 *
 * @throws Error wenn Gotenberg nicht erreichbar ist oder der Merge fehlschlaegt.
 */
export async function mergePdfs(
  pdfs: Buffer[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Buffer> {
  if (pdfs.length === 0) throw new Error("mergePdfs: keine PDFs uebergeben");
  if (pdfs.length === 1) return pdfs[0];

  const url = `${getGotenbergUrl()}/forms/pdfengines/merge`;
  const form = new FormData();
  // Gotenberg merged in alphanumerischer Reihenfolge der Dateinamen -> Index-Prefix.
  pdfs.forEach((pdf, i) => {
    const name = `${String(i).padStart(3, "0")}-teil.pdf`;
    form.append(
      "files",
      new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
      name,
    );
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Gotenberg nicht erreichbar (${getGotenbergUrl()}): ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gotenberg PDF-Merge fehlgeschlagen (HTTP ${res.status}). ${body.slice(0, 300)}`,
    );
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Prueft (best effort) ob Gotenberg erreichbar ist. Fuer Health-/Status-Anzeigen.
 * Wirft nie — gibt false zurueck wenn der Dienst nicht antwortet.
 */
export async function isGotenbergReachable(timeoutMs = 5_000): Promise<boolean> {
  try {
    const res = await fetch(`${getGotenbergUrl()}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}
