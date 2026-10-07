/**
 * Testdaten Vertragsende: je Lage ein fiktiver Vorgang (UX-Umbau, Pilot).
 *
 * Fuer den Prototyp-Tag und die Abnahme der neuen Detailseite braucht jede
 * Lage des Prozesses einen Vorgang, an dem man sie sieht — vom frisch
 * angelegten ueber den abgelaufenen Link bis zum Entfristungsrisiko. Das
 * Skript legt zehn solche Vorgaenge in einer LOKALEN Datenbank an. Alle Daten
 * liegen relativ zu HEUTE, damit Fristen, Ampel und „Jetzt dran" stimmen, an
 * welchem Tag man es auch laufen laesst.
 *
 * Erkennbar und wiederholbar:
 *   - Jede Person ist erfunden: Vorname A … J (Lage 1 … 10), Nachname beginnt
 *     mit „Test", Adresse auf `@beispiel.invalid` (die Domain gibt es nie, eine
 *     Mail dorthin kann niemanden erreichen). Auch die Fuehrungskraft hat eine
 *     solche Adresse — im Docker-Stapel gilt die echte SMTP-Einstellung.
 *   - Vorgangsnummern `VE-<Jahr>-<Kuerzel>-T01` … `-T10` (echte Nummern enden
 *     auf drei Ziffern), laufende Nummer 9001 … 9010.
 *   - Vor dem Anlegen loescht das Skript nur, was es selbst angelegt hat: die
 *     Vertragsende-Vorgaenge mit einer Adresse auf `@beispiel.invalid` UND
 *     einer Nummer `VE-…-T<NN>` (samt Vertragsdaten und Protokoll) und ebenso
 *     die Offboardings `OFF-…-T<NN>`. Ein Vorgang mit Testadresse, den jemand
 *     im Portal angelegt hat (echte Nummer), bleibt stehen; das Skript nennt
 *     nur die Zahl. Loeschen und Anlegen laufen in EINER Transaktion: zweimal
 *     laufen = derselbe Bestand.
 *   - Mit den eigenen Vertragsende-Vorgaengen fallen in derselben Transaktion
 *     die Zeilen, die OHNE Fremdschluessel an ihnen haengen: erzeugte
 *     Dokumente, Nachweise des Dokumentenpakets und individuelle E-Mails
 *     (`modul` VERTRAGSVERLAENGERUNG + `refId`, Anhaenge per Kaskade) und die
 *     Eintraege im Versandprotokoll (`vorgangTyp` CONTRACT_END +
 *     `vorgangId`). Ihre Dateien loescht das Skript erst NACH dem Commit und
 *     nur, wenn der Pfad wirklich unter `uploads/brief-vorlagen-generiert`
 *     bzw. `uploads/individuelle-mails` des Arbeitsverzeichnisses liegt (wie
 *     `pfadInWurzeln`: auch ueber realpath). Alles andere bleibt liegen; die
 *     Ausgabe nennt Art, Grund und — ohne Dateinamen, die koennen Namen
 *     tragen — das Verzeichnis.
 *
 * Aufruf (im Projektverzeichnis, Dev-Datenbank aus .env.local):
 *   node scripts/vertragsende-testdaten.js                 erster aktiver Mandant (nach Nummer)
 *   node scripts/vertragsende-testdaten.js --mandant 737   bestimmter Mandant (LOGA-Mandantennummer)
 *
 * Schutz: DATABASE_URL kommt aus der Umgebung, sonst aus .env.local, sonst aus
 * .env (wie scripts/dev-passwort-neu.js). Erlaubt sind nur die Hosts localhost
 * und 127.0.0.1 — oder genau der Host, der in TESTDATEN_HOST_ERLAUBT steht.
 * Alles andere bricht ab, bevor eine Verbindung entsteht.
 *
 * Im lokalen Docker-Stapel (`hr-portal-lokal`, Datenbank-Host „db") — Git Bash,
 * im Projektverzeichnis:
 *   export MSYS_NO_PATHCONV=1
 *   docker cp scripts/vertragsende-testdaten.js hr-portal-lokal-app:/app/vertragsende-testdaten.js
 *   docker exec -w /app -e TESTDATEN_HOST_ERLAUBT=db hr-portal-lokal-app node vertragsende-testdaten.js --mandant 737
 *   docker exec -u root hr-portal-lokal-app rm /app/vertragsende-testdaten.js
 * Die Datei muss unter /app liegen, damit `@prisma/client` aus /app/node_modules
 * gefunden wird; DATABASE_URL bringt der Container selbst mit.
 *
 * Gut zu wissen:
 *   - Laeuft der Zeitplaner (Erinnerungen Vertragsende), erinnert er auch an
 *     die Testvorgaenge — an die `.invalid`-Adresse, also ins Leere; Sammelmails
 *     an HR koennen sie aber nennen. In der Entwicklung ist die Uhr aus.
 *   - Lage 10 (Vertragsende von DokuBit geaendert, Status „Angelegt") kommt im
 *     Betrieb so nicht vor: Den Merker setzt der Webhook nur bei weit
 *     fortgeschrittenen Vorgaengen. Sie zeigt den Hinweis und die
 *     Ueberschreitung zusammen.
 */
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const TEST_DOMAIN = "@beispiel.invalid";
const FUEHRUNGSKRAFT = "fuehrungskraft.test@beispiel.invalid";
const TAG_MS = 86_400_000;
/** Standard-Gueltigkeit eines Magic-Links (720 h, src/lib/auth.ts). */
const LINK_TAGE = 30;
/** Vom Skript angelegte Offboardings: `OFF-<Jahr>-<Kuerzel>-T<NN>`. */
const TEST_OFFBOARDING = /^OFF-\d{4}-.+-T\d{2}$/;
/** Vom Skript angelegte Vertragsende-Vorgaenge: `VE-<Jahr>-<Kuerzel>-T<NN>`. */
const TEST_VORGANG = /^VE-\d{4}-.+-T\d{2}$/;
/**
 * `modul` der Zeilen, die per `refId` an einem Vertragsende-Vorgang haengen —
 * erzeugte Dokumente, Dokumentenpaket, individuelle E-Mail (Reiter Dokumente).
 */
const MODUL_VERTRAG = "VERTRAGSVERLAENGERUNG";
/** `EmailLog.vorgangTyp` eines Vertragsende-Vorgangs (src/lib/vorgangs-mails.ts). */
const VORGANGSTYP_VERTRAGSENDE = "CONTRACT_END";
/** Ablage im Arbeitsverzeichnis — wie `saveUploadedFile` (src/lib/file-upload.ts). */
const UPLOADS = path.join(process.cwd(), "uploads");
/** Erzeugte Dokumente: absolute Pfade unter `uploads/brief-vorlagen-generiert/<uuid>/`. */
const WURZEL_ERZEUGT = path.join(UPLOADS, "brief-vorlagen-generiert");
/** Anhaenge individueller E-Mails: relativ zu `uploads/`, unter `individuelle-mails/<mailId>/`. */
const WURZEL_MAILANHANG = path.join(UPLOADS, "individuelle-mails");
const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DATABASE_URL aus der Umgebung, sonst aus .env.local, sonst aus .env. */
function datenbankUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const datei of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), datei);
    if (!fs.existsSync(p)) continue;
    const zeile = fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .find((z) => z.startsWith("DATABASE_URL="));
    if (zeile) return zeile.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
  }
  return null;
}

/** Lokal oder ausdruecklich freigegeben (Docker-Stapel: Host „db"). */
function hostErlaubt(host) {
  if (host === "localhost" || host === "127.0.0.1") return true;
  const freigabe = process.env.TESTDATEN_HOST_ERLAUBT;
  return Boolean(freigabe) && host === freigabe;
}

function argument(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// =============================================
// Dateien der geloeschten Zeilen
// =============================================

/** Liegt `ziel` echt unterhalb von `wurzel` (nicht die Wurzel selbst)? Wie `liegtIn` in file-upload.ts. */
function liegtUnter(wurzel, ziel) {
  const rel = path.relative(wurzel, ziel);
  return rel !== "" && rel.split(path.sep)[0] !== ".." && !path.isAbsolute(rel);
}

/**
 * Loescht eine Datei nur, wenn sie WIRKLICH unter `wurzel` liegt — dieselbe
 * Pruefung wie `dateiLoeschen`/`pfadInWurzeln` (src/lib/file-upload.ts): erst
 * der Pfad als Zeichenkette, dann das Verzeichnis ueber realpath (ein Link
 * nach draussen zaehlt als draussen). Geloescht wird der Eintrag im
 * aufgeloesten Verzeichnis, ohne dem letzten Pfadteil zu folgen; das dann
 * leere Verzeichnis der Zeile faellt mit. Wirft nie.
 *
 * @returns "geloescht" | "fehlte" | "ausserhalb" | "fehler"
 */
async function dateiLoeschenUnter(pfad, wurzel) {
  const ziel = path.resolve(pfad);
  if (!liegtUnter(path.resolve(wurzel), ziel)) return "ausserhalb";
  let echteWurzel;
  let verzeichnis;
  try {
    echteWurzel = await fs.promises.realpath(wurzel);
    verzeichnis = await fs.promises.realpath(path.dirname(ziel));
  } catch (fehler) {
    return fehler && fehler.code === "ENOENT" ? "fehlte" : "fehler";
  }
  if (verzeichnis !== echteWurzel && !liegtUnter(echteWurzel, verzeichnis)) return "ausserhalb";
  try {
    await fs.promises.unlink(path.join(verzeichnis, path.basename(ziel)));
  } catch (fehler) {
    return fehler && fehler.code === "ENOENT" ? "fehlte" : "fehler";
  }
  // Jede Erzeugung bzw. Mail hat ihr eigenes Verzeichnis; nicht leer = bleibt.
  if (verzeichnis !== echteWurzel) await fs.promises.rmdir(verzeichnis).catch(() => undefined);
  return "geloescht";
}

/**
 * Die Dateien der geloeschten Zeilen — erst NACH dem Commit: Scheitert die
 * Transaktion (etwa an einer belegten Nummer), stehen die Zeilen noch und
 * muessen ihre Dateien behalten. Ausgabe ohne Dateinamen (sie koennen den
 * Nachnamen tragen), nur Art, Grund und das Verzeichnis, wenn es eine
 * Kennung ist.
 */
async function dateienLoeschen(dateien) {
  const bilanz = { geloescht: 0, fehlte: 0, stehen: [] };
  for (const datei of dateien) {
    const ergebnis = await dateiLoeschenUnter(datei.pfad, datei.wurzel);
    if (ergebnis === "geloescht" || ergebnis === "fehlte") {
      bilanz[ergebnis] += 1;
      continue;
    }
    const ordner = path.basename(path.dirname(datei.pfad));
    bilanz.stehen.push({
      art: datei.art,
      grund: ergebnis === "ausserhalb" ? `liegt nicht unter ${path.relative(process.cwd(), datei.wurzel)}` : "liess sich nicht loeschen",
      ordner: UUID_FORM.test(ordner) ? ordner : "(Verzeichnis nicht ausgegeben)",
    });
  }
  return bilanz;
}

/** Der heutige Kalendertag in Berlin — der Container laeuft in UTC. */
function berlinerHeute(jetzt) {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(jetzt);
  const wert = (typ) => Number(teile.find((t) => t.type === typ).value);
  return { jahr: wert("year"), monat: wert("month"), tag: wert("day") };
}

/**
 * Zeit-Helfer relativ zu jetzt. `tag(n)` ist ein reines Datum (UTC-Mitternacht
 * des Berliner Kalendertags heute + n) — so speichern die Formulare
 * Vertragsende und Vertragsbeginn. `vor(n)`/`nach(n)` sind Zeitpunkte.
 */
function zeit(jetzt) {
  const heute = berlinerHeute(jetzt);
  const tag = (n) => new Date(Date.UTC(heute.jahr, heute.monat - 1, heute.tag + n));
  const vor = (n) => new Date(jetzt.getTime() - n * TAG_MS);
  const nach = (n) => new Date(jetzt.getTime() + n * TAG_MS);
  const datumText = (d) =>
    `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
  return { jahr: heute.jahr, tag, vor, nach, datumText };
}

// =============================================
// Bausteine der Lagen
// =============================================

/**
 * Eine Anfrage an die Fuehrungskraft: Felder am Vorgang plus Protokoll.
 * `gueltigBis` fehlt = Standard-Gueltigkeit ab Versand.
 */
function anfrage(z, { gesendetVor, gueltigBis, erinnertVor = [] }) {
  const gesendet = z.vor(gesendetVor);
  const erinnerungen = [...erinnertVor].sort((a, b) => b - a);
  return {
    felder: {
      supervisorEmail: FUEHRUNGSKRAFT,
      supervisorToken: randomUUID(),
      supervisorLinkSentAt: gesendet,
      supervisorTokenExpiresAt: gueltigBis ?? new Date(gesendet.getTime() + LINK_TAGE * TAG_MS),
      supervisorReminderCount: erinnerungen.length,
      lastSupervisorReminderAt: erinnerungen.length > 0 ? z.vor(erinnerungen[erinnerungen.length - 1]) : null,
    },
    protokoll: [
      { action: "SUPERVISOR_LINK_CREATED", am: gesendet, durchHr: true, details: { supervisorEmail: FUEHRUNGSKRAFT } },
      ...erinnerungen.map((tage) => ({
        action: "SUPERVISOR_REMINDER_SENT",
        am: z.vor(tage),
        durchHr: false,
        details: { tageOffen: gesendetVor - tage, email: FUEHRUNGSKRAFT },
      })),
    ],
  };
}

/** Die Rueckmeldung der Fuehrungskraft ueber das Formular. */
function rueckmeldung(z, { vor, uebernahme, vorstand, grund }) {
  const am = z.vor(vor);
  const vermerk = vorstand ? `Abgestimmt mit der Geschäftsführung (fiktiv), am ${z.datumText(z.vor(vor + 2))}` : null;
  return {
    felder: {
      decision: uebernahme ? "UEBERNAHME" : "KEINE_UEBERNAHME",
      supervisorRespondedAt: am,
      decidedAt: am,
      ...(uebernahme
        ? { vorstandAbgestimmt: Boolean(vorstand), vorstandAbstimmungVermerk: vermerk }
        : { supervisorDeclineReason: grund }),
    },
    protokoll: [
      uebernahme
        ? {
            action: "SUPERVISOR_DECISION_UEBERNAHME",
            am,
            durchHr: false,
            details: { vorstandAbgestimmt: Boolean(vorstand), ...(vermerk ? { vorstandAbstimmungVermerk: vermerk } : {}) },
          }
        : { action: "SUPERVISOR_DECISION_KEINE_UEBERNAHME", am, durchHr: false, details: { declineReason: grund } },
    ],
  };
}

/** Vollstaendige Vertragsdaten der Fuehrungskraft (Strang A). */
function vertragsdaten(z, { endeIn, position, organizationId, unbefristet = false }) {
  return {
    vertragsbeginn: z.tag(endeIn + 1),
    befristet: !unbefristet,
    vertragsende: unbefristet ? null : z.tag(endeIn + 365),
    befristungSachgrund: unbefristet ? null : "Vertretung während einer Elternzeit (§ 14 Abs. 1 Nr. 3 TzBfG)",
    vollzeit: false,
    wochenstunden: 20,
    tageProWoche: 5,
    verguetungsmodell: "TV_L",
    entgeltgruppe: "E 9b",
    stufe: "3",
    stellenbeschreibung: position,
    betriebsstaetteOrgId: organizationId,
    probezeit: false,
    urlaubstageProJahr: 30,
    isComplete: true,
  };
}

/** Ein Statuswechsel durch HR, wie ihn der PATCH protokolliert. */
function statuswechsel(z, vor, von, nach, zusatz = {}) {
  return { action: "STATUS_CHANGED", am: z.vor(vor), durchHr: true, details: { statusFrom: von, statusTo: nach, ...zusatz } };
}

/**
 * Die zehn Lagen. `endeIn` = Tage bis zum Vertragsende (negativ =
 * ueberschritten), `angelegtVor` = Alter des Vorgangs in Tagen.
 * `vertrag`: "leer" (Link erzeugt, noch nichts erfasst) oder "voll".
 */
function lagenBauen(z, organizationId) {
  const zusammen = (...teile) => ({
    felder: Object.assign({}, ...teile.map((t) => t.felder)),
    protokoll: teile.flatMap((t) => t.protokoll),
  });

  return [
    {
      nr: 1,
      titel: "Angelegt, Anfrage offen",
      vorname: "Anna",
      nachname: "Testmann",
      position: "Lehrkraft für Mathematik",
      endeIn: 70,
      angelegtVor: 3,
      felder: { status: "ANGELEGT" },
      protokoll: [],
    },
    (() => {
      const a = anfrage(z, { gesendetVor: 5, gueltigBis: z.nach(9), erinnertVor: [2] });
      return {
        nr: 2,
        titel: "Anfrage läuft, Link gültig",
        vorname: "Ben",
        nachname: "Testberg",
        position: "Erzieher",
        endeIn: 40,
        angelegtVor: 12,
        vertrag: "leer",
        felder: { ...a.felder, status: "ANFRAGE_VORGESETZTER", weitereMandanten: ["123"] },
        protokoll: a.protokoll,
      };
    })(),
    (() => {
      const a = anfrage(z, { gesendetVor: 20, gueltigBis: z.vor(1), erinnertVor: [13, 4] });
      return {
        nr: 3,
        titel: "Anfrage, Link abgelaufen",
        vorname: "Clara",
        nachname: "Testfeld",
        position: "Schulbegleitung",
        endeIn: 12,
        angelegtVor: 28,
        vertrag: "leer",
        felder: { ...a.felder, status: "ANFRAGE_VORGESETZTER" },
        protokoll: a.protokoll,
      };
    })(),
    (() => {
      const t = zusammen(
        anfrage(z, { gesendetVor: 10 }),
        rueckmeldung(z, { vor: 3, uebernahme: true, vorstand: false }),
      );
      return {
        nr: 4,
        titel: "Übernahme, Vertrag offen, Entfristungsrisiko",
        vorname: "David",
        nachname: "Testhaus",
        position: "Lehrkraft für Deutsch",
        endeIn: 20,
        angelegtVor: 25,
        vertrag: "voll",
        felder: {
          ...t.felder,
          status: "RUECKMELDUNG_UEBERNAHME",
          // Kettenbefristung: zwei Jahre sachgrundlos, einmal verlaengert.
          contractStartDate: z.tag(20 - 730),
          befristungsart: "SACHGRUNDLOS",
          bisherigeBefristungMonate: 24,
          bisherigeVerlaengerungen: 1,
        },
        protokoll: t.protokoll,
      };
    })(),
    (() => {
      const t = zusammen(
        anfrage(z, { gesendetVor: 30 }),
        rueckmeldung(z, { vor: 25, uebernahme: true, vorstand: true }),
      );
      return {
        nr: 5,
        titel: "Vertrag unterschrieben",
        vorname: "Emma",
        nachname: "Testkamp",
        position: "Sekretariat",
        endeIn: 35,
        angelegtVor: 40,
        vertrag: "voll",
        felder: { ...t.felder, status: "VERTRAG_UNTERSCHRIEBEN", contractSignedReturnedAt: z.vor(1), mavStatus: null },
        protokoll: [...t.protokoll, statuswechsel(z, 1, "RUECKMELDUNG_UEBERNAHME", "VERTRAG_UNTERSCHRIEBEN")],
      };
    })(),
    (() => {
      const t = zusammen(
        anfrage(z, { gesendetVor: 14 }),
        rueckmeldung(z, {
          vor: 2,
          uebernahme: false,
          grund: "Die Vertretung endet mit der Rückkehr der Stelleninhaberin; die Stunden fallen weg.",
        }),
      );
      return {
        nr: 6,
        titel: "Abgelehnt, Offboarding offen",
        vorname: "Felix",
        nachname: "Testmeier",
        position: "Lehrkraft für Sport",
        endeIn: 25,
        angelegtVor: 21,
        vertrag: "leer",
        felder: { ...t.felder, status: "RUECKMELDUNG_KEINE_UEBERNAHME" },
        protokoll: t.protokoll,
      };
    })(),
    (() => {
      const t = zusammen(
        anfrage(z, { gesendetVor: 28 }),
        rueckmeldung(z, {
          vor: 20,
          uebernahme: false,
          grund: "Das Projekt endet zum Schuljahresende; eine Anschlussfinanzierung gibt es nicht.",
        }),
      );
      return {
        nr: 7,
        titel: "Keine Übernahme, Offboarding angelegt",
        vorname: "Greta",
        nachname: "Testrath",
        position: "Sozialpädagogin",
        endeIn: 45,
        angelegtVor: 35,
        vertrag: "leer",
        offboardingVor: 18,
        felder: { ...t.felder, status: "ENTSCHEIDUNG_KEINE_UEBERNAHME", mavStatus: "ANGEHOERT", mavConsultedAt: z.vor(5) },
        protokoll: [
          ...t.protokoll,
          // CONTRACT_END_NO_RENEWAL schreibt das Skript selbst, sobald die
          // Offboarding-Nummer feststeht.
          { action: "CONTRACT_END_UPDATED", am: z.vor(5), durchHr: true, details: { mavStatus: "ANGEHOERT" } },
        ],
      };
    })(),
    (() => {
      const t = zusammen(
        anfrage(z, { gesendetVor: 50 }),
        rueckmeldung(z, { vor: 45, uebernahme: true, vorstand: true }),
      );
      return {
        nr: 8,
        titel: "Abgeschlossen (Übernahme)",
        vorname: "Hannes",
        nachname: "Testwald",
        position: "Hausmeister",
        endeIn: 10,
        angelegtVor: 60,
        vertrag: "voll",
        unbefristet: true,
        felder: {
          ...t.felder,
          status: "ABGESCHLOSSEN",
          contractSignedReturnedAt: z.vor(20),
          mavStatus: "ZUGESTIMMT",
          mavConsultedAt: z.vor(15),
          completedAt: z.vor(1),
        },
        protokoll: [
          ...t.protokoll,
          statuswechsel(z, 20, "RUECKMELDUNG_UEBERNAHME", "VERTRAG_UNTERSCHRIEBEN"),
          { action: "CONTRACT_END_UPDATED", am: z.vor(15), durchHr: true, details: { mavStatus: "ZUGESTIMMT" } },
          statuswechsel(z, 1, "VERTRAG_UNTERSCHRIEBEN", "ABGESCHLOSSEN"),
        ],
      };
    })(),
    (() => {
      const a = anfrage(z, { gesendetVor: 14 });
      return {
        nr: 9,
        titel: "Storniert (aus der Anfrage)",
        vorname: "Ida",
        nachname: "Teststein",
        position: "Lehrkraft für Englisch",
        endeIn: 60,
        angelegtVor: 20,
        vertrag: "leer",
        felder: { ...a.felder, status: "STORNIERT" },
        protokoll: [...a.protokoll, statuswechsel(z, 4, "ANFRAGE_VORGESETZTER", "STORNIERT")],
      };
    })(),
    {
      nr: 10,
      titel: "Angelegt, Vertragsende überschritten, von DokuBit geändert",
      vorname: "Jonas",
      nachname: "Testbrink",
      position: "Lehrkraft für Biologie",
      endeIn: -3,
      angelegtVor: 100,
      felder: { status: "ANGELEGT", source: "N8N", contractEndDateGeaendertAm: z.vor(8) },
      protokoll: [
        {
          action: "CONTRACT_END_UPDATED_BY_WEBHOOK",
          am: z.vor(8),
          durchHr: false,
          details: { altesVertragsende: z.tag(27).toISOString(), neuesVertragsende: z.tag(-3).toISOString(), quelle: "N8N" },
        },
      ],
    },
  ].map((lage) => ({ ...lage, organizationId }));
}

// =============================================
// Ablauf
// =============================================

(async () => {
  const url = datenbankUrl();
  if (!url) {
    console.error("FEHLER: Keine DATABASE_URL gefunden (Umgebung, .env.local oder .env).");
    process.exit(1);
  }

  // Testdaten loeschen und schreiben gehoert nie in eine fremde Datenbank.
  const host = new URL(url).hostname;
  if (!hostErlaubt(host)) {
    console.error(
      `FEHLER: Die Datenbank liegt auf "${host}". Erlaubt sind nur localhost und 127.0.0.1 ` +
        "oder genau der Host aus TESTDATEN_HOST_ERLAUBT. Das Skript bricht ab, ohne etwas zu aendern.",
    );
    process.exit(1);
  }

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const mandantNummer = argument("--mandant");
    if (process.argv.includes("--mandant") && !mandantNummer) {
      console.error("FEHLER: --mandant braucht eine Mandantennummer, z. B. --mandant 737.");
      process.exit(1);
    }
    const mandant = await prisma.organization.findFirst({
      where: mandantNummer ? { mandantNumber: mandantNummer } : { isActive: true },
      orderBy: { mandantNumber: "asc" },
      select: { id: true, name: true, shortName: true, mandantNumber: true },
    });
    if (!mandant) {
      console.error(
        mandantNummer
          ? `FEHLER: Kein Mandant mit der Nummer "${mandantNummer}".`
          : "FEHLER: Kein aktiver Mandant in dieser Datenbank.",
      );
      process.exit(1);
    }

    // Wer „angelegt" hat: bevorzugt ein Testkonto, sonst das aelteste aktive
    // HR-Konto. Das Offboarding (Lage 7) braucht zwingend eines.
    const konto =
      (await prisma.user.findFirst({
        where: { email: { endsWith: TEST_DOMAIN }, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })) ??
      (await prisma.user.findFirst({
        where: { isActive: true, role: { in: ["SUPER_ADMIN", "HR_LEITUNG", "HR_SACHBEARBEITER"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }));

    const jetzt = new Date();
    const z = zeit(jetzt);
    const kuerzel = mandant.shortName || mandant.mandantNumber;
    const nummer = (praefix, nr) => `${praefix}-${z.jahr}-${kuerzel}-T${String(nr).padStart(2, "0")}`;
    const lagen = lagenBauen(z, mandant.id).filter((lage) => lage.nr !== 7 || konto);

    const ergebnis = await prisma.$transaction(
      async (tx) => {
        // 1. Alten Testbestand entfernen — nur, was dieses Skript angelegt hat:
        //    Testadresse UND Testnummer (`…-T<NN>`).
        const alteIds = (
          await tx.contractEndProcess.findMany({
            where: { employeeEmail: { endsWith: TEST_DOMAIN } },
            select: { id: true, displayId: true },
          })
        )
          .filter((v) => TEST_VORGANG.test(v.displayId))
          .map((v) => v.id);
        const alteOffboardings = (
          await tx.offboardingProcess.findMany({
            where: { employeeEmail: { endsWith: TEST_DOMAIN } },
            select: { id: true, displayId: true },
          })
        ).filter((o) => TEST_OFFBOARDING.test(o.displayId));
        const offboardingIds = alteOffboardings.map((o) => o.id);

        // Zeilen ohne Fremdschluessel, die an den eigenen Vorgaengen haengen
        // (siehe Kopf). Die Pfade ihrer Dateien merken — geloescht wird nach
        // dem Commit.
        const anVorgang = { modul: MODUL_VERTRAG, refId: { in: alteIds } };
        const dateien = [];
        for (const dok of await tx.generatedDocument.findMany({ where: anVorgang, select: { pfadDocx: true, pfadPdf: true } })) {
          for (const pfad of [dok.pfadDocx, dok.pfadPdf]) {
            if (pfad) dateien.push({ art: "erzeugtes Dokument", pfad, wurzel: WURZEL_ERZEUGT });
          }
        }
        for (const mail of await tx.individuelleMail.findMany({
          where: anVorgang,
          select: { anhaenge: { select: { dateipfad: true } } },
        })) {
          for (const anhang of mail.anhaenge) {
            // `dateipfad` ist relativ zu uploads/ (individuelle-mail-dienst.ts).
            if (anhang.dateipfad) {
              dateien.push({ art: "Anhang einer individuellen E-Mail", pfad: path.join(UPLOADS, anhang.dateipfad), wurzel: WURZEL_MAILANHANG });
            }
          }
        }
        const anhaengsel = {
          dokumente: (await tx.generatedDocument.deleteMany({ where: anVorgang })).count,
          pakete: (await tx.dokumentenVersand.deleteMany({ where: anVorgang })).count,
          // Die Anhaenge gehen per Kaskade mit.
          mails: (await tx.individuelleMail.deleteMany({ where: anVorgang })).count,
          protokoll: (
            await tx.emailLog.deleteMany({ where: { vorgangTyp: VORGANGSTYP_VERTRAGSENDE, vorgangId: { in: alteIds } } })
          ).count,
        };

        // Das Protokoll haengt ohne Kaskade am Vorgang, die Vertragsdaten mit.
        // Der Vertragsende-Vorgang traegt den Verweis aufs Offboarding, also
        // faellt er zuerst; die Kinder des Offboardings gehen per Kaskade mit.
        await tx.auditLog.deleteMany({ where: { contractEndId: { in: alteIds } } });
        await tx.contractEndProcess.deleteMany({ where: { id: { in: alteIds } } });
        await tx.auditLog.deleteMany({ where: { offboardingId: { in: offboardingIds } } });
        await tx.offboardingProcess.deleteMany({ where: { id: { in: offboardingIds } } });

        const fremdeVorgaenge = await tx.contractEndProcess.count({
          where: { employeeEmail: { endsWith: TEST_DOMAIN } },
        });
        const fremdeOffboardings = await tx.offboardingProcess.count({
          where: { employeeEmail: { endsWith: TEST_DOMAIN } },
        });

        // 2. Kollisionen: Eine Testnummer, die nach dem Aufraeumen noch steht,
        // gehoert einem echten Vorgang — dann lieber gar nichts tun.
        const nummern = lagen.map((lage) => nummer("VE", lage.nr));
        const belegt = await tx.contractEndProcess.findMany({
          where: { displayId: { in: nummern } },
          select: { displayId: true },
        });
        const belegtOff = await tx.offboardingProcess.findMany({
          where: { displayId: { in: lagen.filter((l) => l.offboardingVor).map((l) => nummer("OFF", l.nr)) } },
          select: { displayId: true },
        });
        if (belegt.length > 0 || belegtOff.length > 0) {
          throw new Error(
            `Die Nummern ${[...belegt, ...belegtOff].map((b) => b.displayId).join(", ")} gehoeren ` +
              "Vorgaengen ohne Testadresse. Nichts geaendert.",
          );
        }

        // 3. Anlegen.
        const angelegt = [];
        for (const lage of lagen) {
          const email = `${lage.vorname}.${lage.nachname}${TEST_DOMAIN}`.toLowerCase();
          const erstellt = z.vor(lage.angelegtVor);
          const protokoll = [...lage.protokoll];

          let offboarding = null;
          if (lage.offboardingVor) {
            const am = z.vor(lage.offboardingVor);
            offboarding = await tx.offboardingProcess.create({
              data: {
                displayId: nummer("OFF", lage.nr),
                sequentialNumber: 9000 + lage.nr,
                organizationId: mandant.id,
                employeeEmail: email,
                employeeFirstName: lage.vorname,
                employeeLastName: lage.nachname,
                exitType: "BEFRISTUNGSENDE",
                lastWorkingDay: z.tag(lage.endeIn),
                status: "INITIATED",
                initiatedById: konto.id,
                initiatedAt: am,
                supervisorEmail: FUEHRUNGSKRAFT,
                createdAt: am,
                exitData: { create: {} },
              },
              select: { id: true, displayId: true },
            });
            await tx.auditLog.create({
              data: {
                offboardingId: offboarding.id,
                userId: konto.id,
                processType: "OFFBOARDING",
                action: "OFFBOARDING_CREATED",
                createdAt: am,
                details: {
                  employeeName: `${lage.vorname} ${lage.nachname}`,
                  organization: mandant.name,
                  exitType: "BEFRISTUNGSENDE",
                  lastWorkingDay: z.tag(lage.endeIn).toISOString(),
                  fuehrungskraftHinterlegt: true,
                  herkunft: "VERTRAGSENDE",
                  contractEndDisplayId: nummer("VE", lage.nr),
                },
              },
            });
            protokoll.push({
              action: "CONTRACT_END_NO_RENEWAL",
              am,
              durchHr: true,
              details: { decision: "KEINE_UEBERNAHME", offboardingId: offboarding.id, offboardingDisplayId: offboarding.displayId },
            });
          }

          const vorgang = await tx.contractEndProcess.create({
            data: {
              displayId: nummer("VE", lage.nr),
              sequentialNumber: 9000 + lage.nr,
              organizationId: mandant.id,
              employeeEmail: email,
              employeeFirstName: lage.vorname,
              employeeLastName: lage.nachname,
              contractStartDate: z.tag(lage.endeIn - 365),
              contractEndDate: z.tag(lage.endeIn),
              source: "MANUAL",
              // Was DokuBit meldet (N8N), hat niemand im Portal angelegt.
              initiatedById: lage.felder.source === "N8N" ? null : konto?.id ?? null,
              initiatedAt: erstellt,
              createdAt: erstellt,
              currentPosition: lage.position,
              currentEntgeltgruppe: "E 9b",
              currentStufe: "3",
              currentWochenstunden: 20,
              befristungsart: "MIT_SACHGRUND",
              bisherigeBefristungMonate: 12,
              bisherigeVerlaengerungen: 0,
              ...lage.felder,
              ...(offboarding ? { offboardingId: offboarding.id } : {}),
              ...(lage.vertrag === "leer" ? { renewalData: { create: {} } } : {}),
              ...(lage.vertrag === "voll"
                ? {
                    renewalData: {
                      create: vertragsdaten(z, {
                        endeIn: lage.endeIn,
                        position: lage.position,
                        organizationId: mandant.id,
                        unbefristet: lage.unbefristet,
                      }),
                    },
                  }
                : {}),
            },
            select: { id: true, displayId: true },
          });

          await tx.auditLog.createMany({
            data: [
              {
                action: "CONTRACT_END_CREATED",
                am: erstellt,
                durchHr: lage.felder.source !== "N8N",
                details: {
                  employeeName: `${lage.vorname} ${lage.nachname}`,
                  organization: mandant.name,
                  contractEndDate: z.tag(lage.endeIn).toISOString(),
                  source: lage.felder.source ?? "MANUAL",
                },
              },
              ...protokoll,
            ].map((eintrag) => ({
              contractEndId: vorgang.id,
              userId: eintrag.durchHr ? konto?.id ?? null : null,
              processType: "CONTRACT_END",
              action: eintrag.action,
              details: eintrag.details,
              createdAt: eintrag.am,
            })),
          });

          angelegt.push({ lage, vorgang, offboarding });
        }

        return {
          geloescht: alteIds.length,
          geloeschtOffboardings: offboardingIds.length,
          anhaengsel,
          dateien,
          fremdeVorgaenge,
          fremdeOffboardings,
          angelegt,
        };
      },
      { timeout: 60_000 },
    );

    // Erst jetzt, nach dem Commit (siehe `dateienLoeschen`).
    const dateiBilanz = await dateienLoeschen(ergebnis.dateien);

    console.log("");
    console.log(`Testdaten Vertragsende · Mandant ${mandant.mandantNumber} (${kuerzel}) · Datenbank ${host}`);
    console.log(
      `Entfernt: ${ergebnis.geloescht} Testvorgang/-vorgänge, ${ergebnis.geloeschtOffboardings} vom Skript angelegte(s) Offboarding(s).`,
    );
    const a = ergebnis.anhaengsel;
    console.log(
      `Dazu: ${a.dokumente} erzeugte(s) Dokument(e), ${a.pakete} Paketnachweis(e), ${a.mails} individuelle E-Mail(s), ` +
        `${a.protokoll} Eintrag/Einträge im Versandprotokoll; Dateien: ${dateiBilanz.geloescht} gelöscht, ` +
        `${dateiBilanz.fehlte} fehlte(n) schon.`,
    );
    if (dateiBilanz.stehen.length > 0) {
      console.log(`Nicht gelöscht: ${dateiBilanz.stehen.length} Datei(en) — bitte von Hand prüfen:`);
      for (const datei of dateiBilanz.stehen) {
        console.log(`  ${datei.art}, Verzeichnis ${datei.ordner}: ${datei.grund}`);
      }
    }
    console.log("");
    for (const { lage, vorgang, offboarding } of ergebnis.angelegt) {
      const nr = String(lage.nr).padStart(2, " ");
      console.log(
        `${vorgang.displayId}  Lage ${nr} · ${lage.titel} (${lage.vorname} ${lage.nachname})  /vorgaenge/vertragsende/${vorgang.id}`,
      );
      if (offboarding) {
        console.log(`${" ".repeat(vorgang.displayId.length)}  dazu ${offboarding.displayId}  /vorgaenge/offboarding/${offboarding.id}`);
      }
    }
    if (!konto) {
      console.log("");
      console.log("Lage 7 fehlt: Ein Offboarding braucht ein Benutzerkonto als Auslöser, und es gibt keines.");
    }
    // Gezaehlt nach dem Aufraeumen, vor dem Anlegen: nur, was stehen blieb.
    if (ergebnis.fremdeVorgaenge > 0) {
      console.log("");
      console.log(
        `Hinweis: ${ergebnis.fremdeVorgaenge} Vertragsende-Vorgang/-vorgänge mit ${TEST_DOMAIN} ` +
          "bleiben stehen (keine Testnummer …-T<NN>, also nicht von diesem Skript angelegt).",
      );
    }
    if (ergebnis.fremdeOffboardings > 0) {
      console.log("");
      console.log(
        `Hinweis: ${ergebnis.fremdeOffboardings} Offboarding(s) mit ${TEST_DOMAIN} bleiben stehen ` +
          "(nicht von diesem Skript angelegt, z. B. im Portal aus einem Testvorgang erzeugt).",
      );
    }
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
