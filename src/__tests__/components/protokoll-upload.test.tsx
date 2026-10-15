/**
 * @jest-environment jsdom
 */

/**
 * Karte „Unterschriebenes Übergabeprotokoll“ im Reiter Dokumente
 * (src/components/ausgaben/protokoll-upload.tsx) — Ausstattung & Zugaenge,
 * Stufe 2, Feinplan A4, S34, G19.
 *
 *  1. Sichtbar nur, wenn es etwas zu tun gibt: aktive Ausgaben, die
 *     zurueckkommen (`protokoll.noetig`), oder schon ein Protokoll.
 *  2. Stand aus dem Server („fehlt“ / „hochgeladen am …“), Knopf mit dem
 *     Namen aus dem Feinplan.
 *  3. Hochladen: genau `datei` + `type = UEBERGABEPROTOKOLL` an die Route,
 *     danach Erfolg als Status und Neuladen des Vorgangs.
 *  4. Zu gross: Fehler im Browser, ohne Anfrage. Fehler des Servers stehen
 *     als Alarm da, ohne Neuladen. Waehrend des Hochladens bleibt der Knopf
 *     fokussierbar (`aria-disabled`), sein Text ist die Statusmeldung.
 *  5. Entfernen (Review A4d): Die hochgeladenen Protokolle stehen mit Datei
 *     und Tag (deutsche Zeit) in der Karte, je mit „Entfernen …“. Erst die
 *     Rueckfrage schickt `DELETE` an die Route; Abbrechen schickt nichts. Ein
 *     Fehler des Servers bleibt im Dialog, ohne Neuladen. Nach Erfolg wird
 *     der Vorgang neu geladen, BEVOR der Dialog schliesst, und der Fokus
 *     landet auf dem Titel der Karte.
 *
 * Umgebung wie in den uebrigen Komponententests: jsdom im Docblock, ohne
 * @testing-library/jest-dom.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  ProtokollUpload,
  protokollUploadSichtbar,
  type ProtokollDokument,
} from "@/components/ausgaben/protokoll-upload";
import { PROTOKOLL_MAX_BYTES, PROTOKOLL_UPLOAD_MELDUNGEN as M, type ProtokollAnzeige } from "@/lib/ausgaben";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VORGANG = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

const FEHLT: ProtokollAnzeige = {
  art: "UEBERGABE",
  noetig: true,
  hochgeladenAm: null,
  text: "Unterschriebenes Übergabeprotokoll: fehlt",
};
const NICHT_NOETIG: ProtokollAnzeige = { art: "UEBERGABE", noetig: false, hochgeladenAm: null, text: null };

function pdf(name = "protokoll.pdf"): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], name, { type: "application/pdf" });
}

function eingabe(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

async function waehlen(datei: File) {
  await act(async () => {
    fireEvent.change(eingabe(), { target: { files: [datei] } });
  });
}

function knopf(): HTMLButtonElement {
  return document.querySelector('[data-aktion="protokoll-hochladen"]') as HTMLButtonElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("Sichtbarkeit", () => {
  it("protokollUploadSichtbar: noetig oder schon eins vorhanden", () => {
    expect(protokollUploadSichtbar(null, 0)).toBe(false);
    expect(protokollUploadSichtbar(undefined, 0)).toBe(false);
    expect(protokollUploadSichtbar(NICHT_NOETIG, 0)).toBe(false);
    expect(protokollUploadSichtbar(FEHLT, 0)).toBe(true);
    expect(protokollUploadSichtbar(NICHT_NOETIG, 1)).toBe(true);
    expect(protokollUploadSichtbar(null, 2)).toBe(true);
  });

  it("zeichnet ohne Bedarf nichts (A4 aus)", () => {
    const { container } = render(<ProtokollUpload onboardingId={VORGANG} protokoll={null} dokumente={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("zeigt Titel, Stand vom Server und den Knopf", () => {
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} />);
    expect(screen.getByRole("region", { name: M.TITEL })).toBeTruthy();
    expect(screen.getByText("Unterschriebenes Übergabeprotokoll: fehlt")).toBeTruthy();
    expect(knopf().textContent).toContain(M.KNOPF);
    expect(eingabe().accept).toContain("application/pdf");
  });
});

describe("Hochladen", () => {
  it("schickt genau datei und type an die Route, meldet Erfolg und laedt den Vorgang neu", async () => {
    const f = jest.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: "d1", meldung: M.ERFOLG }) }));
    global.fetch = f as unknown as typeof fetch;
    const onHochgeladen = jest.fn();
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} onAktualisiert={onHochgeladen} />);

    const datei = pdf();
    await waehlen(datei);

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/onboarding/${VORGANG}/documents`);
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("type")).toBe("UEBERGABEPROTOKOLL");
    expect(form.getAll("datei")).toHaveLength(1);
    expect((form.get("datei") as File).name).toBe("protokoll.pdf");

    expect(screen.getByRole("status").textContent).toContain(M.ERFOLG);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onHochgeladen).toHaveBeenCalledTimes(1);
  });

  it("eine zu grosse Datei scheitert im Browser — ohne Anfrage", async () => {
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} />);
    const gross = pdf();
    Object.defineProperty(gross, "size", { value: PROTOKOLL_MAX_BYTES + 1 });
    await waehlen(gross);
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(M.ZU_GROSS);
  });

  it("zeigt den Fehler des Servers als Alarm und laedt nicht neu", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 415,
      json: async () => ({ error: M.TYP_NICHT_ERLAUBT }),
    })) as unknown as typeof fetch;
    const onHochgeladen = jest.fn();
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} onAktualisiert={onHochgeladen} />);
    await waehlen(pdf("scan.docx"));
    expect(screen.getByRole("alert").textContent).toBe(M.TYP_NICHT_ERLAUBT);
    expect(screen.queryByRole("status")).toBeNull();
    expect(onHochgeladen).not.toHaveBeenCalled();
  });

  it("ohne Netz ein fester Text", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} />);
    await waehlen(pdf());
    expect(screen.getByRole("alert").textContent).toBe(M.NETZ);
  });

  it("waehrend des Hochladens bleibt der Knopf fokussierbar, sagt den Stand und oeffnet keine zweite Auswahl", async () => {
    let freigeben: (wert: unknown) => void = () => undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          freigeben = resolve;
        }),
    ) as unknown as typeof fetch;
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} />);
    const klick = jest.spyOn(eingabe(), "click");

    await waehlen(pdf());
    expect(knopf().getAttribute("aria-disabled")).toBe("true");
    expect(knopf().disabled).toBe(false);
    expect(knopf().textContent).toContain(M.LAEDT);
    fireEvent.click(knopf());
    expect(klick).not.toHaveBeenCalled();

    await act(async () => {
      freigeben({ ok: true, status: 201, json: async () => ({ meldung: M.ERFOLG }) });
    });
    expect(knopf().getAttribute("aria-disabled")).toBeNull();
    expect(knopf().textContent).toContain(M.KNOPF);
    fireEvent.click(knopf());
    expect(klick).toHaveBeenCalledTimes(1);
  });
});

describe("Entfernen (Review A4d)", () => {
  // 23:30 UTC am 27.01. ist in Berlin schon der 28.01. (00:30 Uhr).
  const DOK: ProtokollDokument = { id: "d-1", fileName: "Protokoll Müller.pdf", uploadedAt: "2027-01-27T23:30:00.000Z" };
  const HOCHGELADEN: ProtokollAnzeige = {
    art: "UEBERGABE",
    noetig: true,
    hochgeladenAm: "2027-01-27T23:30:00.000Z",
    text: "Unterschriebenes Übergabeprotokoll: hochgeladen am 28.01.2027",
  };

  function entfernenKnopf(): HTMLButtonElement {
    return document.querySelector('[data-aktion="protokoll-entfernen"]') as HTMLButtonElement;
  }

  function dialog(): HTMLElement | null {
    return document.querySelector('[data-dialog="protokoll-entfernen"]');
  }

  it("listet die hochgeladenen Protokolle mit Datei und Tag in deutscher Zeit, je mit „Entfernen …“", () => {
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={HOCHGELADEN} dokumente={[DOK]} />);
    const liste = screen.getByRole("list", { name: M.LISTE });
    expect(liste.textContent).toContain("Protokoll Müller.pdf · hochgeladen am 28.01.2027");
    expect(entfernenKnopf().textContent).toContain(M.ENTFERNEN_KNOPF);
    // Der Knopf nennt per Beschreibung die Datei, um die es geht.
    const beschreibung = document.getElementById(entfernenKnopf().getAttribute("aria-describedby")!);
    expect(beschreibung?.textContent).toContain("Protokoll Müller.pdf");
  });

  it("ohne hochgeladenes Protokoll gibt es keine Liste", () => {
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={FEHLT} dokumente={[]} />);
    expect(document.querySelector('[data-liste="protokolle"]')).toBeNull();
    expect(entfernenKnopf()).toBeNull();
  });

  it("der Knopf oeffnet nur die Rueckfrage; Abbrechen schickt nichts", async () => {
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={HOCHGELADEN} dokumente={[DOK]} />);
    fireEvent.click(entfernenKnopf());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain(M.ENTFERNEN_TITEL);
    expect(dialog()!.textContent).toContain("Protokoll Müller.pdf · hochgeladen am 28.01.2027");
    expect(dialog()!.textContent).toContain(M.ENTFERNEN_SATZ);
    fireEvent.click(within(dialog()!).getByRole("button", { name: "Abbrechen" }));
    expect(dialog()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("bestaetigt: DELETE an die Route, Neuladen VOR dem Schliessen, Erfolg als Status, Fokus auf den Titel", async () => {
    const f = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: DOK.id, meldung: M.ENTFERNT }) }));
    global.fetch = f as unknown as typeof fetch;
    let dialogBeimNeuladen: boolean | null = null;
    const onAktualisiert = jest.fn(async () => {
      dialogBeimNeuladen = dialog() !== null;
    });
    render(
      <ProtokollUpload onboardingId={VORGANG} protokoll={HOCHGELADEN} dokumente={[DOK]} onAktualisiert={onAktualisiert} />,
    );
    fireEvent.click(entfernenKnopf());
    await act(async () => {
      fireEvent.click(within(dialog()!).getByRole("button", { name: M.ENTFERNEN_BESTAETIGEN }));
    });

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/onboarding/${VORGANG}/documents/${DOK.id}`);
    expect(init.method).toBe("DELETE");
    expect(onAktualisiert).toHaveBeenCalledTimes(1);
    expect(dialogBeimNeuladen).toBe(true);
    expect(dialog()).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(M.ENTFERNT);
    expect(document.activeElement?.textContent).toBe(M.TITEL);
  });

  it("ein Fehler des Servers bleibt im Dialog stehen – ohne Neuladen", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: M.ENTFERNEN_DATEI_FEHLER }),
    })) as unknown as typeof fetch;
    const onAktualisiert = jest.fn();
    render(
      <ProtokollUpload onboardingId={VORGANG} protokoll={HOCHGELADEN} dokumente={[DOK]} onAktualisiert={onAktualisiert} />,
    );
    fireEvent.click(entfernenKnopf());
    await act(async () => {
      fireEvent.click(within(dialog()!).getByRole("button", { name: M.ENTFERNEN_BESTAETIGEN }));
    });
    expect(dialog()).not.toBeNull();
    expect(within(dialog()!).getByRole("alert").textContent).toBe(M.ENTFERNEN_DATEI_FEHLER);
    expect(onAktualisiert).not.toHaveBeenCalled();
  });

  it("ohne Netz ein fester Text im Dialog", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    render(<ProtokollUpload onboardingId={VORGANG} protokoll={HOCHGELADEN} dokumente={[DOK]} />);
    fireEvent.click(entfernenKnopf());
    await act(async () => {
      fireEvent.click(within(dialog()!).getByRole("button", { name: M.ENTFERNEN_BESTAETIGEN }));
    });
    expect(within(dialog()!).getByRole("alert").textContent).toBe(M.ENTFERNEN_NETZ);
  });
});
