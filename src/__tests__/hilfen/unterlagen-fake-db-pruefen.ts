/**
 * Test-Hilfe: Ergaenzung der Fake-Datenbank fuer „Pruefen und Uebernahme"
 * (Paket 4, Schritt 6)
 *
 * Erweitert `fakePrisma` aus unterlagen-fake-db.ts um genau das, was die
 * Entscheidungen ueber eine Position und das Oeffnen einer Datei brauchen:
 *
 *   - die Tabelle `document` (create, findMany, findFirst, deleteMany) —
 *     Ziel der Uebernahme beim Annehmen, geloescht bei der Ruecknahme;
 *   - `unterlagenPosition.findFirst` und `unterlagenDatei.findFirst` (mit dem
 *     Relationsfilter `nachforderung: {…}`, wie die Dienstfunktionen fragen).
 *
 * Eine eigene Datei statt Aenderungen an unterlagen-fake-db.ts, damit die
 * gemeinsame Fake-Datenbank der Schritte 4 und 5 unberuehrt bleibt. Wie dort:
 * kein Rollback, keine Sperre; jeder Aufruf steht als "tabelle.methode" in
 * `udb.aufrufe`.
 *
 * Einbinden: NACH unterlagen-fake-db importieren (die Ergaenzung laeuft beim
 * Import) und in beforeEach `ddbLeeren()` aufrufen.
 *
 *   import { ddb, ddbLeeren } from "../hilfen/unterlagen-fake-db-pruefen";
 */

import { randomUUID } from "crypto";
import { projizieren, sortieren } from "./abteilungs-fake-db";
import { fakePrisma, passtU, realmSicher, udb, type Zeile } from "./unterlagen-fake-db";

export const ddb: {
  /** Document-Zeilen (Onboarding). */
  dokumente: Zeile[];
} = { dokumente: [] };

/** Alle Dokumente entfernen (in beforeEach aufrufen). */
export function ddbLeeren(): void {
  ddb.dokumente = [];
}

type Args = { where?: Zeile; data?: Zeile; select?: Zeile; orderBy?: unknown };
type Methoden = Record<string, jest.Mock>;

function protokolliert<A extends unknown[], R>(name: string, fn: (...args: A) => R): jest.Mock<R, A> {
  return jest.fn((...args: A) => {
    udb.aufrufe.push(name);
    return fn(...args);
  });
}

/** Document mit den Standardwerten des Schemas. */
export function neuesDokument(data: Zeile): Zeile {
  const jetzt = new Date();
  return {
    id: randomUUID(),
    onboardingId: null,
    type: "SONSTIGES",
    fileName: "datei.pdf",
    filePath: "",
    fileSize: 0,
    mimeType: "application/pdf",
    status: "UPLOADED",
    rejectionReason: null,
    gueltigBis: null,
    ablaufErinnertAm: null,
    ablaufErinnertStufe: null,
    bezeichnung: null,
    unbefristet: false,
    uploadedAt: jetzt,
    reviewedAt: null,
    reviewedById: null,
    createdAt: jetzt,
    ...data,
  };
}

const fp = fakePrisma as unknown as Record<string, Methoden>;

fp.document = {
  create: protokolliert("document.create", async ({ data, select }: Args) => {
    const d = neuesDokument(data ?? {});
    ddb.dokumente.push(d);
    return realmSicher(projizieren(d, select));
  }),
  findMany: protokolliert("document.findMany", async ({ where, select, orderBy }: Args) =>
    sortieren(ddb.dokumente.filter((d) => passtU(d, where)), orderBy).map((d) => realmSicher(projizieren(d, select))),
  ),
  findFirst: protokolliert("document.findFirst", async ({ where, select }: Args) => {
    const d = ddb.dokumente.find((x) => passtU(x, where));
    return d ? realmSicher(projizieren(d, select)) : null;
  }),
  deleteMany: protokolliert("document.deleteMany", async ({ where }: Args) => {
    const vorher = ddb.dokumente.length;
    ddb.dokumente = ddb.dokumente.filter((d) => !passtU(d, where));
    return { count: vorher - ddb.dokumente.length };
  }),
};

/**
 * findFirst = der erste Treffer von findMany — dieselbe Projektion samt
 * geschachtelter Dateien (positionAusgabe der Fake-Datenbank). findMany traegt
 * sich beim Aufruf selbst in `udb.aufrufe` ein; der Eintrag kommt sofort
 * wieder heraus, damit ein findFirst als EIN Aufruf in der Liste steht.
 */
function ersterTreffer(tabelle: string): (args: Args) => Promise<Zeile | null> {
  return async (args) => {
    const suche = fp[tabelle].findMany(args) as Promise<Zeile[]>;
    if (udb.aufrufe[udb.aufrufe.length - 1] === `${tabelle}.findMany`) udb.aufrufe.pop();
    return (await suche)[0] ?? null;
  };
}

fp.unterlagenPosition.findFirst = protokolliert("unterlagenPosition.findFirst", ersterTreffer("unterlagenPosition"));
fp.unterlagenDatei.findFirst = protokolliert("unterlagenDatei.findFirst", ersterTreffer("unterlagenDatei"));
