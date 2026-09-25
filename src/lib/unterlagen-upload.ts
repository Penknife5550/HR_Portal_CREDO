/**
 * CREDO HR-Portal – Unterlagen nachfordern: oeffentliche API (Paket 4, nur Server)
 *
 * Die Upload-Seite der Person (`/unterlagen/[token]`) spricht nur mit diesen
 * fuenf Funktionen, jede hinter einer duennen Route unter
 * `src/app/api/unterlagen/[token]/…`:
 *
 *   GET    /api/unterlagen/[token]                                → unterlagenLaden
 *   POST   /api/unterlagen/[token]/positionen/[positionId]/dateien → unterlagenDateiHochladen
 *   DELETE /api/unterlagen/[token]/dateien/[dateiId]              → unterlagenDateiEntfernen
 *   PATCH  /api/unterlagen/[token]/positionen/[positionId]        → unterlagenGueltigBisSpeichern
 *   POST   /api/unterlagen/[token]/uebermitteln                   → unterlagenUebermitteln
 *
 * Die Routen reichen die Antwort 1:1 durch `oeffentlicheAntwort()` — so traegt
 * JEDE Antwort (auch 429 und 500) `no-store`, `nosniff`,
 * `Referrer-Policy: no-referrer` und `X-Robots-Tag: noindex`. Die Middleware
 * laeuft fuer `/api/unterlagen/*` bewusst NICHT (Matcher, src/middleware.ts):
 * Nur mit ihr klont Next.js den Body, schneidet ihn bei 10 MiB ab und schreibt
 * dabei die URL samt Token ins Log. Die Grenze fuer den Body liegt deshalb hier
 * (`leseBodyBegrenzt`), auch fuer die beiden JSON-Wege.
 *
 * Die Regeln (Feinplanung docs/module/onboarding/paket4-feinplanung.md):
 *
 *   1. **Reihenfolge beim Hochladen (4.3, verbindlich):** IP-Bremse → Tokenformat
 *      (ohne Datenbank) → Content-Type → Content-Length → Link ueber den Hash
 *      und seine Gueltigkeit (404/410) → Bremse je Nachforderung → Position
 *      DIESER Nachforderung (404) und offen (409) → Kontingente ohne Sperre →
 *      Body begrenzt lesen → genau ein `datei` → Typ aus den Bytes →
 *      PDF-Merkmale → SHA-256 → Datei schreiben → Transaktion (Sperre,
 *      Neupruefung, Kontingente, Zeile, `uploadsGesamt + 1`). Scheitert die
 *      Transaktion, wird die Datei wieder geloescht.
 *   2. **Token nur als Hash.** Gesucht wird ausschliesslich ueber
 *      `hashToken(token)`; ein Token in falscher Form bekommt 404, ohne dass
 *      die Datenbank gefragt wird. Der Klartext steht in keinem Log.
 *   3. **Kinder haengen am Token:** jede Position und Datei wird nur mit
 *      `{ id, nachforderungId: link.nachforderungId }` gesucht. Eine fremde ID
 *      ergibt dieselbe 404 wie eine unbekannte.
 *   4. **N1 — nach der Sperre noch einmal pruefen.** Jeder Schreibweg sperrt den
 *      Kopf bedingt (`updateMany … status LAUFEND`) und prueft danach Link
 *      (Entwertung, Linkende), Nachforderung, Vorgang und Position erneut. So
 *      gewinnt ein gleichzeitiges Zurueckziehen oder „Entfällt" sauber (410
 *      bzw. 409). Die oeffentlichen Wege nehmen KEINE Prozesssperre (Abschnitt 7).
 *   5. **Bremsen (5.2):** IP 20/min (`tokenRateLimiter`, vor der Suche);
 *      Hochladen 30 je 10 Minuten und die uebrigen Schreibwege 60/min, beide je
 *      NACHFORDERUNG, nicht je Link — jede Mail bringt einen neuen Link, ein
 *      Schluessel je Link vervielfachte das Budget. 429 mit `Retry-After`.
 *      Im Speicher des Prozesses: tragen nur bei EINEM Container.
 *   6. **Datenzuschnitt (5.3):** Name, Einrichtung, Vorgangsnummer, Frist,
 *      Nachricht, die Positionen mit eigenem Stand, die EIGENEN Entwuerfe mit
 *      Name und Groesse, die verantwortliche Stelle, die Grenzen. Nie:
 *      E-Mail-Adresse, Name der HR-Kraft, Pruefsummen, `tokenHash`, Notizen,
 *      Namen eingereichter Dateien. Eine 410 nennt nur die Meldung (beim
 *      Linkende das Datum), nie Name, Einrichtung oder Vorgangsnummer.
 *      „Eigen" heisst: nach dem letzten Adresswechsel hochgeladen
 *      (`entwuerfeAbLaden`) — Entwuerfe ueber einen ADRESSE-entwerteten Link
 *      sind fuer den neuen Link weder sichtbar noch entfernbar noch
 *      uebermittelbar und zaehlen nicht in seine Kontingente.
 *   7. **Protokoll (Abschnitt 11):** Nur „Übermitteln" schreibt ins AuditLog
 *      (`UNTERLAGEN_UEBERMITTELT` mit IDs, Groessen, Typ, SHA-256) — ohne IP,
 *      ohne Dateinamen. Entwuerfe hinterlassen keinen Eintrag. Die Konsole
 *      bekommt nur Praefix, IDs und `fehlerKennung`.
 *   8. **HR-Meldung „vollständig"** geht NACH der Antwort (`nachDerAntwort`)
 *      ueber `hrVollstaendigMelden` mit bedingtem Anspruch (Abschnitt 7). Faellt
 *      sie aus, holt der taegliche Lauf sie nach. Nach dem Commit gibt es
 *      keinen Datenbankzugriff mehr, der werfen koennte — der Stand fuer die
 *      Antwort entsteht noch in der Transaktion.
 */

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pruefeGueltigBis } from "@/lib/dokument-fristen";
import { formatVerantwortlicheStelle } from "@/lib/dsgvo";
import {
  anzeigeNameBereinigen,
  contentLengthZuGross,
  erkenneDateityp,
  leseBodyBegrenzt,
  pdfMerkmale,
  sha256Hex,
  UUID_MUSTER,
} from "@/lib/file-upload";
import { ablaufKalendertag, formatKalendertagLang, heuteInBerlin, type Kalendertag } from "@/lib/kalendertag";
import { nachDerAntwort } from "@/lib/nach-der-antwort";
import { mitarbeiterName } from "@/lib/onboarding-spuren";
import { createRateLimiter, getClientIp, tokenRateLimiter } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-hash";
import {
  BREMSEN,
  MAX_BODY_BYTES,
  MAX_BYTES_JE_NACHFORDERUNG,
  MAX_DATEI_BYTES,
  MAX_DATEIEN_JE_NACHFORDERUNG,
  MAX_DATEIEN_JE_POSITION,
  MAX_UPLOADS_GESAMT,
  MELDUNGEN,
  UNTERLAGEN_AUDIT,
  UPLOAD_ACCEPT,
  dateiUebergang,
  eigenerEntwurf,
  entwuerfeAb,
  hochladenErlaubt,
  istUnterlagenModul,
  linkGueltig,
  oeffentlicherFristSatz,
  pdfHinweiseSpeichern,
  personenStand,
  positionUebergang,
  tokenFormatGueltig,
  vollstaendigMerker,
  wartetAufPerson,
  WARTET_AUF_PERSON_STATUS,
  type EntwertungGrund,
  type LinkPruefung,
  type OeffentlichePosition,
  type OeffentlichePositionsAntwort,
  type OeffentlicheUnterlagen,
  type UebermittelnAntwort,
  type UnterlagenFehlerAntwort,
  type UnterlagenModul,
} from "@/lib/unterlagen";
import { entwuerfeLoeschen, entwurfSpeichern } from "@/lib/unterlagen-dateien";
import { hrVollstaendigMelden, zeitpunktUnterSperre } from "@/lib/unterlagen-dienst";
import { fehlerKennung } from "@/lib/fehler-kennung";
import { onboardingBaustein } from "@/lib/unterlagen-onboarding";
import { gueltigBisPatchSchema, jsonKoerperPruefen, uebermittelnSchema } from "@/lib/validations/unterlagen";
import type { z } from "zod";

// =============================================
// Antwort und Kopfzeilen
// =============================================

/**
 * Was die Funktionen hier von der Anfrage lesen: Kopfzeilen und den rohen
 * Datenstrom. `NextRequest` erfuellt das; ein Test kann einen eigenen Strom
 * einsetzen und zaehlen, wie viel gelesen wurde.
 */
export interface OeffentlicheAnfrage {
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/** Antwort jeder Funktion hier — die Route gibt sie ueber `oeffentlicheAntwort` 1:1 aus. */
export interface OeffentlicheDienstAntwort {
  status: number;
  body: object;
  /** Nur bei 429: `Retry-After` in Sekunden. */
  headers?: Record<string, string>;
}

/**
 * Die Kopfzeilen JEDER oeffentlichen Antwort (5.3). Die Middleware setzt sie
 * hier nicht — sie laeuft fuer `/api/unterlagen/*` nicht.
 */
export const OEFFENTLICHE_KOPFZEILEN: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};

/**
 * Obergrenze eines JSON-Bodys (Gültig bis, Übermitteln). Ohne Middleware setzt
 * Next.js keine Grenze; ein `request.text()` laese sonst jede Groesse. 30
 * Positionen mit Datum brauchen rund 2 KiB.
 */
export const MAX_JSON_BYTES = 64 * 1024;

/** Baut die Antwort der Route: Status, Body und die festen Kopfzeilen (5.3). */
export function oeffentlicheAntwort(antwort: OeffentlicheDienstAntwort): NextResponse {
  return NextResponse.json(antwort.body, {
    status: antwort.status,
    headers: { ...(antwort.headers ?? {}), ...OEFFENTLICHE_KOPFZEILEN },
  });
}

/** 500 der Routen — ohne jede Angabe zum Fehler. */
export const OEFFENTLICHER_SERVERFEHLER: OeffentlicheDienstAntwort = {
  status: 500,
  body: { error: MELDUNGEN.SERVERFEHLER },
};

function fehler(
  status: number,
  text: string,
  grund?: string,
  extra: Pick<UnterlagenFehlerAntwort, "linkGueltigBis"> = {},
): OeffentlicheDienstAntwort {
  return { status, body: { error: text, ...(grund ? { grund } : {}), ...extra } satisfies UnterlagenFehlerAntwort };
}

/** 429 mit `Retry-After` in ganzen Sekunden (mindestens 1). Die Seite wartet diese Zeit ab. */
function zuVieleAnfragen(retryAfterMs: number | undefined): OeffentlicheDienstAntwort {
  const sekunden = Math.max(1, Math.ceil((retryAfterMs ?? 1000) / 1000));
  return {
    status: 429,
    body: { error: MELDUNGEN.ZU_VIELE_ANFRAGEN } satisfies UnterlagenFehlerAntwort,
    headers: { "Retry-After": String(sekunden) },
  };
}

const LINK_UNGUELTIG = (): OeffentlicheDienstAntwort => fehler(404, MELDUNGEN.LINK_UNGUELTIG, "LINK_UNGUELTIG");
const POSITION_FEHLT = (): OeffentlicheDienstAntwort => fehler(404, MELDUNGEN.POSITION_NICHT_GEFUNDEN);
const DATEI_FEHLT = (): OeffentlicheDienstAntwort => fehler(404, MELDUNGEN.DATEI_NICHT_GEFUNDEN);
/** 409 auf jeden Schreibweg bei ERLEDIGT (`readOnly`). */
const NUR_LESEN = (): OeffentlicheDienstAntwort => fehler(409, MELDUNGEN.ALLES_GEPRUEFT, "ALLES_GEPRUEFT");

/** Bricht eine Transaktion ab und liefert die Antwort dafuer. */
class OeffentlicherAbbruch extends Error {
  constructor(readonly antwort: OeffentlicheDienstAntwort) {
    super("OeffentlicherAbbruch");
    this.name = "OeffentlicherAbbruch";
  }
}

type TxErgebnis<T> = { ok: true; wert: T } | { ok: false; antwort: OeffentlicheDienstAntwort };

/** `prisma.$transaction`, deren fachlicher Abbruch als Antwort zurueckkommt; alles andere wirft weiter. */
async function inTransaktion<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<TxErgebnis<T>> {
  try {
    return { ok: true, wert: await prisma.$transaction(fn) };
  } catch (err) {
    if (err instanceof OeffentlicherAbbruch) return { ok: false, antwort: err.antwort };
    throw err;
  }
}

// =============================================
// Bremsen (5.2)
// =============================================

/** Hochladen je Nachforderung: 30 in 10 Minuten. */
const hochladenLimiter = createRateLimiter("unterlagen-hochladen", {
  maxRequests: BREMSEN.HOCHLADEN.anzahl,
  windowMs: BREMSEN.HOCHLADEN.fensterMs,
});

/** Entfernen, „Gültig bis", Übermitteln je Nachforderung: 60 pro Minute. */
const schreibenLimiter = createRateLimiter("unterlagen-schreiben", {
  maxRequests: BREMSEN.SCHREIBEN.anzahl,
  windowMs: BREMSEN.SCHREIBEN.fensterMs,
});

type Limiter = ReturnType<typeof createRateLimiter>;

function bremse(limiter: Limiter, schluessel: string): OeffentlicheDienstAntwort | null {
  const ergebnis = limiter.check(schluessel);
  return ergebnis.allowed ? null : zuVieleAnfragen(ergebnis.retryAfterMs);
}

/**
 * Die ersten beiden Schritte jedes Wegs (4.3 Nr. 1 und 2): die IP-Bremse, die
 * alle Token-Routen teilen, und das Format des Tokens — beides OHNE Datenbank.
 */
function vorpruefen(request: Pick<OeffentlicheAnfrage, "headers">, token: string): OeffentlicheDienstAntwort | null {
  const ip = bremse(tokenRateLimiter, getClientIp(request.headers));
  if (ip) return ip;
  return tokenFormatGueltig(token) ? null : LINK_UNGUELTIG();
}

// =============================================
// Vorgang je Modul
// =============================================

/** Was die oeffentliche Seite vom Vorgang zeigt — und nicht mehr. */
export interface OeffentlicherVorgang {
  /** Wird der Vorgang nicht mehr bearbeitet (Onboarding: EXPIRED)? Dann 410. */
  eingestellt: boolean;
  /** `mitarbeiterName`, sonst keiner — nie die Adresse. */
  name: string | null;
  einrichtung: string;
  vorgangsnummer: string | null;
  /** `formatVerantwortlicheStelle` des Mandanten (P:1469). */
  verantwortlicheStelle: string;
}

/**
 * Was die oeffentlichen Wege je Modul brauchen. Den Bezug und das Protokoll
 * liefert der Modul-Baustein (unterlagen-onboarding.ts); geladen wird hier mit
 * EIGENEM, schmalem `select` — `vorgangLaden` des Bausteins braeuchte
 * Fragebogen-Angaben, die die Seite nie zeigt, und laeuft nicht in der
 * Transaktion (N1).
 *
 * Offen fuer den Folgecommit nach Schritt 6 (Feinplanung 7: „Der
 * Modul-Baustein trägt Stufe 2 ohne Umbau"): `UnterlagenModulBaustein` um ein
 * `oeffentlichLaden(tx, id)` mit diesem schmalen `select` erweitern, die
 * Spalten des Bezugs aus `BEZUG_AUSWAHL` (unterlagen-dienst.ts) in
 * `KOPF_AUSWAHL` uebernehmen — dann entfallen dieses Register und die zweite
 * Regel „EXPIRED = eingestellt". Bis dahin haelt ein Test sie gleich mit
 * `onboardingUnterlagenVorgang`.
 */
interface OeffentlichesModul {
  vorgangIdAus(kopf: KopfZeile): string | null;
  vorgangLaden(db: Prisma.TransactionClient, id: string): Promise<OeffentlicherVorgang | null>;
  audit(id: string): { processType: string; fk: Record<string, string> };
}

const ONBOARDING_OEFFENTLICH_AUSWAHL = {
  status: true,
  displayId: true,
  firstName: true,
  lastName: true,
  personalData: { select: { firstName: true, lastName: true } },
  organization: {
    select: {
      name: true,
      dsgvoVerantwortlicheName: true,
      dsgvoVerantwortlicheStrasse: true,
      dsgvoVerantwortlichePlz: true,
      dsgvoVerantwortlicheOrt: true,
    },
  },
} satisfies Prisma.OnboardingProcessSelect;

export type OnboardingOeffentlichZeile = Prisma.OnboardingProcessGetPayload<{
  select: typeof ONBOARDING_OEFFENTLICH_AUSWAHL;
}>;

/**
 * Die schmale Onboarding-Zeile als `OeffentlicherVorgang` (rein). „EXPIRED =
 * eingestellt" steht hier ein zweites Mal neben `onboardingUnterlagenVorgang`
 * (EXPIRED heisst „von HR zurückgezogen"); ein Test haelt beide gleich.
 */
export function oeffentlicherOnboardingVorgang(v: OnboardingOeffentlichZeile): OeffentlicherVorgang {
  return {
    eingestellt: v.status === "EXPIRED",
    name: mitarbeiterName(v),
    einrichtung: v.organization?.name ?? "",
    vorgangsnummer: v.displayId ?? null,
    verantwortlicheStelle: formatVerantwortlicheStelle(v.organization),
  };
}

const OEFFENTLICHE_MODULE: Readonly<Record<UnterlagenModul, OeffentlichesModul>> = {
  ONBOARDING: {
    vorgangIdAus: (kopf) => onboardingBaustein.vorgangIdAus(kopf),
    async vorgangLaden(db, id) {
      const v = await db.onboardingProcess.findUnique({ where: { id }, select: ONBOARDING_OEFFENTLICH_AUSWAHL });
      return v ? oeffentlicherOnboardingVorgang(v) : null;
    },
    audit: (id) => onboardingBaustein.audit(id),
  },
};

// =============================================
// Link finden und pruefen (2.4, 5.1)
// =============================================

const LINK_AUSWAHL = {
  id: true,
  nachforderungId: true,
  gueltigBis: true,
  entwertetAm: true,
  entwertetGrund: true,
} satisfies Prisma.UnterlagenLinkSelect;

const KOPF_AUSWAHL = {
  id: true,
  modul: true,
  // Bezug zum Vorgang — Stufe 2 ergaenzt die Spalten der uebrigen Module.
  onboardingId: true,
  status: true,
  frist: true,
  nachricht: true,
  uploadsGesamt: true,
  vollstaendigSeit: true,
  vollstaendigGemeldetAm: true,
} satisfies Prisma.UnterlagenNachforderungSelect;

type LinkZeile = Prisma.UnterlagenLinkGetPayload<{ select: typeof LINK_AUSWAHL }>;
type KopfZeile = Prisma.UnterlagenNachforderungGetPayload<{ select: typeof KOPF_AUSWAHL }>;

/** Ein heute gueltiger Link samt Kopf und Vorgang. */
interface GueltigerLink {
  link: LinkZeile;
  kopf: KopfZeile;
  modul: OeffentlichesModul;
  vorgangId: string;
  vorgang: OeffentlicherVorgang;
  pruefung: Extract<LinkPruefung, { gueltig: true }>;
  frist: Kalendertag;
  heute: Kalendertag;
  /** Letzter Adresswechsel: nur spaeter hochgeladene Entwuerfe sind die eigenen (`entwuerfeAbLaden`). */
  entwuerfeAb: Date | null;
}

type LinkErgebnis = { ok: true; g: GueltigerLink } | { ok: false; antwort: OeffentlicheDienstAntwort };

/** 404/410 aus `linkGueltig`. Eine 410 nennt beim Linkende das Datum, sonst nichts ausser der Meldung (2.4). */
function linkFehler(p: Extract<LinkPruefung, { gueltig: false }>): OeffentlicheDienstAntwort {
  return fehler(
    p.status,
    p.meldung,
    p.schluessel,
    p.schluessel === "LINK_ABGELAUFEN" && p.linkende ? { linkGueltigBis: p.linkende } : {},
  );
}

/**
 * Prueft einen gefundenen Link gegen Kopf und Vorgang (`linkGueltig`). Laeuft
 * vor der Transaktion und nach der Sperre noch einmal (N1). Was fehlt oder
 * unlesbar ist, ergibt dieselbe 404 wie ein unbekannter Token.
 */
async function linkStandPruefen(
  db: Prisma.TransactionClient,
  link: LinkZeile | null,
  heute: Kalendertag,
): Promise<LinkErgebnis> {
  if (!link) return { ok: false, antwort: LINK_UNGUELTIG() };
  const kopf = await db.unterlagenNachforderung.findUnique({ where: { id: link.nachforderungId }, select: KOPF_AUSWAHL });
  const modul = kopf && istUnterlagenModul(kopf.modul) ? OEFFENTLICHE_MODULE[kopf.modul] : null;
  const vorgangId = kopf && modul ? modul.vorgangIdAus(kopf) : null;
  const vorgang = modul && vorgangId ? await modul.vorgangLaden(db, vorgangId) : null;
  const frist = kopf ? ablaufKalendertag(kopf.frist) : null;
  if (!kopf || !modul || !vorgangId || !vorgang || !frist) return { ok: false, antwort: LINK_UNGUELTIG() };

  const pruefung = linkGueltig({ link, nachforderung: kopf, vorgangEingestellt: vorgang.eingestellt, heute });
  if (!pruefung.gueltig) return { ok: false, antwort: linkFehler(pruefung) };
  const entwuerfeAb = await entwuerfeAbLaden(db, kopf.id);
  return { ok: true, g: { link, kopf, modul, vorgangId, vorgang, pruefung, frist, heute, entwuerfeAb } };
}

/**
 * Die Grenze „eigene Entwürfe" (`entwuerfeAb`, unterlagen.ts — dieselbe Regel
 * wie der Merker `entwurf_vorhanden` des Laufs). Fremde Entwuerfe sieht die
 * Person nicht, sie kann sie weder entfernen noch uebermitteln, und sie zaehlen
 * nicht in ihre Kontingente; liegen bleiben sie bis zum Aufraeumen des Laufs
 * (30 Tage nach dem Linkende).
 */
async function entwuerfeAbLaden(db: Prisma.TransactionClient, nachforderungId: string): Promise<Date | null> {
  const entwertet = await db.unterlagenLink.findMany({
    where: { nachforderungId, entwertetGrund: "ADRESSE" satisfies EntwertungGrund },
    select: { entwertetAm: true, entwertetGrund: true },
  });
  return entwuerfeAb(entwertet);
}

/** `eigenerEntwurf` als Prisma-Bedingung — die Entwuerfe der Person, die den Link jetzt hat. */
function eigeneEntwuerfeWhere(ab: Date | null): Prisma.UnterlagenDateiWhereInput {
  return ab ? { status: "ENTWURF", hochgeladenAm: { gt: ab } } : { status: "ENTWURF" };
}

/** Sucht den Link NUR ueber den Hash des Tokens (5.1) und prueft ihn. */
async function linkLaden(token: string, heute: Kalendertag): Promise<LinkErgebnis> {
  const link = await prisma.unterlagenLink.findUnique({ where: { tokenHash: hashToken(token) }, select: LINK_AUSWAHL });
  return linkStandPruefen(prisma, link, heute);
}

/**
 * N1: sperrt den Kopf bedingt (`status LAUFEND`) und prueft danach Link,
 * Nachforderung und Vorgang noch einmal. Zieht HR zwischen Pruefung und Sperre
 * zurueck, ergibt das 410; ist die Nachforderung erledigt, 409.
 */
async function sperrenUndNeuPruefen(tx: Prisma.TransactionClient, g: GueltigerLink, jetzt: Date): Promise<GueltigerLink> {
  const gesperrt = await tx.unterlagenNachforderung.updateMany({
    where: { id: g.kopf.id, status: "LAUFEND" },
    data: { updatedAt: jetzt },
  });
  const link = await tx.unterlagenLink.findUnique({ where: { id: g.link.id }, select: LINK_AUSWAHL });
  const stand = await linkStandPruefen(tx, link, g.heute);
  if (!stand.ok) throw new OeffentlicherAbbruch(stand.antwort);
  // Ohne Treffer ist der Kopf nicht mehr LAUFEND: Zurueckgezogen hat
  // `linkStandPruefen` schon mit 410 beantwortet, bleibt ERLEDIGT (nur lesen).
  if (stand.g.pruefung.readOnly || gesperrt.count === 0) throw new OeffentlicherAbbruch(NUR_LESEN());
  return stand.g;
}

// =============================================
// Positionen und Datenzuschnitt (5.3)
// =============================================

/** Aktive Dateien fuer die Kontingente: Entwurf oder eingereicht (4.3 Nr. 12). */
const AKTIVE_DATEI_STATUS = ["ENTWURF", "EINGEREICHT"];

const POSITION_AUSWAHL = {
  id: true,
  nachforderungId: true,
  reihenfolge: true,
  typ: true,
  bezeichnung: true,
  hinweis: true,
  originalErforderlich: true,
  fristpflichtig: true,
  status: true,
  einreichungen: true,
  gueltigBisAngabe: true,
  uebermitteltAm: true,
  begruendung: true,
  // Nur die Entwuerfe — eingereichte Dateien nennt die Seite nie (5.3). Welche
  // Entwuerfe die eigenen sind, setzt `positionAuswahl` je Link.
  dateien: {
    where: { status: "ENTWURF" },
    orderBy: { hochgeladenAm: "asc" },
    select: { id: true, anzeigeName: true, groesse: true },
  },
} satisfies Prisma.UnterlagenPositionSelect;

type PositionZeile = Prisma.UnterlagenPositionGetPayload<{ select: typeof POSITION_AUSWAHL }>;

/** `POSITION_AUSWAHL` mit genau den eigenen Entwuerfen (`eigeneEntwuerfeWhere`). */
function positionAuswahl(g: Pick<GueltigerLink, "entwuerfeAb">) {
  return {
    ...POSITION_AUSWAHL,
    dateien: { ...POSITION_AUSWAHL.dateien, where: eigeneEntwuerfeWhere(g.entwuerfeAb) },
  } satisfies Prisma.UnterlagenPositionSelect;
}

function positionenLaden(db: Prisma.TransactionClient, g: GueltigerLink): Promise<PositionZeile[]> {
  return db.unterlagenPosition.findMany({
    where: { nachforderungId: g.kopf.id },
    orderBy: { reihenfolge: "asc" },
    select: positionAuswahl(g),
  });
}

/** Eine Position — nur, wenn sie zu DIESER Nachforderung gehoert (Abschnitt 6). */
function positionLaden(
  db: Prisma.TransactionClient,
  positionId: string,
  g: GueltigerLink,
): Promise<PositionZeile | null> {
  if (!UUID_MUSTER.test(positionId)) return Promise.resolve(null);
  return db.unterlagenPosition.findFirst({
    where: { id: positionId, nachforderungId: g.kopf.id },
    select: positionAuswahl(g),
  });
}

/**
 * Eine Position, wie die Person sie sieht (2.2, 5.3): die Begruendung nur bei
 * einer zurueckgewiesenen, von den Dateien nur die eigenen Entwuerfe mit Name
 * und Groesse. „Gültig bis" nur bei einer fristpflichtigen Unterlage.
 */
export function oeffentlichePositionBauen(p: PositionZeile): OeffentlichePosition {
  const stand = personenStand(p.status, p.dateien.length, p.uebermitteltAm);
  return {
    id: p.id,
    bezeichnung: p.bezeichnung,
    hinweis: p.hinweis,
    originalErforderlich: p.originalErforderlich,
    fristpflichtig: p.fristpflichtig,
    gueltigBisAngabe: p.fristpflichtig ? ablaufKalendertag(p.gueltigBisAngabe) : null,
    stand: stand.stand,
    standText: stand.text,
    begruendung: p.status === "ZURUECKGEWIESEN" ? p.begruendung : null,
    uebermitteltAm: p.uebermitteltAm ? p.uebermitteltAm.toISOString() : null,
    entwuerfe: p.dateien.map((d) => ({ id: d.id, name: d.anzeigeName, groesse: d.groesse })),
  };
}

/** Der ganze Stand fuer `GET` und die Antwort auf „Übermitteln" (5.3). */
function standBauen(g: GueltigerLink, positionen: PositionZeile[]): OeffentlicheUnterlagen {
  return {
    readOnly: g.pruefung.readOnly,
    meldung: g.pruefung.meldung,
    name: g.vorgang.name,
    einrichtung: g.vorgang.einrichtung,
    vorgangsnummer: g.vorgang.vorgangsnummer,
    frist: g.frist,
    fristLang: formatKalendertagLang(g.frist),
    // Das Linkende steht nur NACH der Frist da — vorher gibt es genau ein Datum.
    linkGueltigBis: g.heute > g.frist ? g.pruefung.linkende : null,
    fristSatz: oeffentlicherFristSatz(g.frist, g.pruefung.linkende, g.heute),
    nachricht: g.kopf.nachricht,
    verantwortlicheStelle: g.vorgang.verantwortlicheStelle,
    grenzen: { maxDateiBytes: MAX_DATEI_BYTES, maxDateienJePosition: MAX_DATEIEN_JE_POSITION, accept: UPLOAD_ACCEPT },
    positionen: positionen.map(oeffentlichePositionBauen),
  };
}

/** 409-Text, wenn die Person an dieser Position gerade nichts tun darf (Entfällt, übermittelt, erledigt). */
function offenPruefen(p: { status: string }, g: GueltigerLink): OeffentlicheDienstAntwort | null {
  const offen = hochladenErlaubt(p.status, { nachforderungStatus: g.kopf.status, vorgangEingestellt: g.vorgang.eingestellt });
  return offen.erlaubt ? null : fehler(409, offen.meldung, offen.grund);
}

// =============================================
// Kontingente (4.3 Nr. 5 und 12)
// =============================================

export interface KontingentStand {
  /** Die aktiven Dateien (Entwurf oder eingereicht) der ganzen Nachforderung. */
  dateien: ReadonlyArray<{ positionId: string; groesse: number }>;
  /** Uploads ueber die ganze Laufzeit (`uploadsGesamt`). */
  uploadsGesamt: number;
}

/**
 * Passt eine weitere Datei von `neueGroesse` Bytes noch hinein? Hoechstens 10
 * aktive Dateien je Position, 40 Dateien und 150 MiB je Nachforderung, 200
 * Uploads ueber die ganze Laufzeit. Die Vorpruefung ohne Sperre rechnet mit
 * einem Byte (die Groesse kennt sie noch nicht), die Transaktion mit der echten.
 */
export function kontingentPruefen(
  stand: KontingentStand,
  positionId: string,
  neueGroesse: number,
): { grund: "ZU_VIELE_DATEIEN_POSITION" | "GESAMTGRENZE_ERREICHT"; meldung: string } | null {
  const jePosition = stand.dateien.filter((d) => d.positionId === positionId).length;
  if (jePosition >= MAX_DATEIEN_JE_POSITION) {
    return { grund: "ZU_VIELE_DATEIEN_POSITION", meldung: MELDUNGEN.ZU_VIELE_DATEIEN_POSITION };
  }
  const bytes = stand.dateien.reduce((summe, d) => summe + d.groesse, 0);
  if (
    stand.dateien.length >= MAX_DATEIEN_JE_NACHFORDERUNG ||
    bytes + neueGroesse > MAX_BYTES_JE_NACHFORDERUNG ||
    stand.uploadsGesamt >= MAX_UPLOADS_GESAMT
  ) {
    return { grund: "GESAMTGRENZE_ERREICHT", meldung: MELDUNGEN.GESAMTGRENZE_ERREICHT };
  }
  return null;
}

/** Die aktiven Dateien fuer die Kontingente — fremde Entwuerfe (vor einem Adresswechsel) zaehlen nicht. */
async function aktiveDateien(
  db: Prisma.TransactionClient,
  g: GueltigerLink,
): Promise<Array<{ positionId: string; groesse: number }>> {
  const dateien = await db.unterlagenDatei.findMany({
    where: { nachforderungId: g.kopf.id, status: { in: AKTIVE_DATEI_STATUS } },
    select: { positionId: true, groesse: true, status: true, hochgeladenAm: true },
  });
  return dateien
    .filter((d) => d.status !== "ENTWURF" || eigenerEntwurf(d, g.entwuerfeAb))
    .map((d) => ({ positionId: d.positionId, groesse: d.groesse }));
}

// =============================================
// Hilfen fuer Body und Dateien
// =============================================

/** Ein Eintrag aus `FormData` ist eine Datei (kein Text). */
function istDatei(wert: FormDataEntryValue | null | undefined): wert is File {
  return typeof wert === "object" && wert !== null && typeof (wert as Blob).arrayBuffer === "function";
}

/** Liest einen JSON-Body begrenzt (`MAX_JSON_BYTES`) und prueft ihn gegen das Schema. */
async function jsonLesen<T>(
  request: OeffentlicheAnfrage,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<{ ok: true; daten: T } | { ok: false; antwort: OeffentlicheDienstAntwort }> {
  const body = await leseBodyBegrenzt(request, MAX_JSON_BYTES);
  if (!body.ok) {
    return {
      ok: false,
      antwort:
        body.status === 413
          ? fehler(413, MELDUNGEN.ANFRAGE_ZU_GROSS)
          : fehler(400, MELDUNGEN.UNGUELTIGE_EINGABE),
    };
  }
  const koerper = jsonKoerperPruefen(body.buffer.toString("utf8"), schema);
  return koerper.ok ? { ok: true, daten: koerper.daten } : { ok: false, antwort: fehler(400, koerper.error) };
}

/** Loescht Entwurfsdateien nach dem Commit bzw. nach einer gescheiterten Transaktion. Wirft nie. */
async function dateienWegraeumen(nachforderungId: string, pfade: ReadonlyArray<string | null>): Promise<void> {
  const bilanz = await entwuerfeLoeschen(nachforderungId, pfade);
  if (bilanz.fehler > 0) {
    console.error(`[Unterlagen] ${bilanz.fehler} Entwurfsdatei(en) von ${nachforderungId} nicht geloescht (der Lauf raeumt nach).`);
  }
}

/**
 * „Gültig bis" einer Position pruefen (6.1): nur bei einer fristpflichtigen
 * (409 sonst), nur solange sie offen ist (409), das Datum ueber
 * `pruefeGueltigBis` (400). Leer heisst unbefristet oder unbekannt — HR
 * entscheidet beim Annehmen (Z1).
 */
function gueltigBisPruefen(
  p: PositionZeile,
  roh: string | null,
  g: GueltigerLink,
  jetzt: Date,
): { ok: true; datum: Date | null } | { ok: false; antwort: OeffentlicheDienstAntwort } {
  if (!p.fristpflichtig) return { ok: false, antwort: fehler(409, MELDUNGEN.KEIN_ABLAUFDATUM, "KEIN_ABLAUFDATUM") };
  const nichtOffen = offenPruefen(p, g);
  if (nichtOffen) return { ok: false, antwort: nichtOffen };
  const frist = pruefeGueltigBis(roh, p.typ ?? "", jetzt);
  if (!frist.ok) return { ok: false, antwort: fehler(400, frist.fehler) };
  return { ok: true, datum: frist.gueltigBis };
}

/** Was „Entfernen" von einer Datei liest — nie ihren Namen. */
const DATEI_AUSWAHL = {
  id: true,
  positionId: true,
  status: true,
  speicherPfad: true,
  hochgeladenAm: true,
} satisfies Prisma.UnterlagenDateiSelect;

/** Ein fremder Entwurf (vor dem letzten Adresswechsel) gilt als unbekannt: 404 mit demselben Text. */
function fuerLinkSichtbar(d: { status: string; hochgeladenAm: Date }, g: GueltigerLink): boolean {
  return d.status !== "ENTWURF" || eigenerEntwurf(d, g.entwuerfeAb);
}

// =============================================
// GET /api/unterlagen/[token]
// =============================================

/**
 * Der Stand fuer die Upload-Seite (5.3). Schreibt nichts — Mailscanner, die den
 * Link oeffnen, verbrauchen ihn nicht (5.1).
 *
 *   200 OeffentlicheUnterlagen (bei ERLEDIGT mit `readOnly` und Meldung)
 *   404 Format falsch, Hash unbekannt, entwertet wegen Adresswechsel
 *   410 ersetzt, Linkende, zurueckgezogen, Vorgang eingestellt
 *   429 IP-Bremse
 */
export async function unterlagenLaden(
  request: Pick<OeffentlicheAnfrage, "headers">,
  token: string,
  jetzt: Date = new Date(),
): Promise<OeffentlicheDienstAntwort> {
  const vorab = vorpruefen(request, token);
  if (vorab) return vorab;

  const gefunden = await linkLaden(token, heuteInBerlin(jetzt));
  if (!gefunden.ok) return gefunden.antwort;
  const stand = standBauen(gefunden.g, await positionenLaden(prisma, gefunden.g));
  return { status: 200, body: stand };
}

// =============================================
// POST /api/unterlagen/[token]/positionen/[positionId]/dateien
// =============================================

/**
 * Eine Datei zu einer Position hochladen — als Entwurf, den HR nie sieht.
 * Reihenfolge verbindlich nach 4.3 (siehe Kopf dieser Datei). Kein AuditLog.
 *
 *   201 { position }
 *   400 kein/mehr als ein `datei`, leer, PDF unvollstaendig, Body abgebrochen
 *   404 Link, Position einer anderen Nachforderung
 *   409 Position nicht offen, erledigt, Kontingent
 *   410 Link ersetzt/abgelaufen/zurueckgezogen/Vorgang eingestellt
 *   413 Content-Length oder gezaehlter Body ueber 10 MiB, Datei ueber 9,5 MiB
 *   415 kein multipart, Typ nicht erlaubt
 *   429 IP-Bremse oder Bremse je Nachforderung
 */
export async function unterlagenDateiHochladen(
  request: OeffentlicheAnfrage,
  token: string,
  positionId: string,
  jetzt: Date = new Date(),
): Promise<OeffentlicheDienstAntwort> {
  // 1.–2. IP-Bremse, Tokenformat
  const vorab = vorpruefen(request, token);
  if (vorab) return vorab;

  // 3. Content-Type
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return fehler(415, MELDUNGEN.DATEITYP_NICHT_ERLAUBT);
  }
  // 4. Content-Length ueber der Grenze: sofort, ohne ein Byte zu lesen und ohne Datenbank
  if (contentLengthZuGross(request, MAX_BODY_BYTES)) return fehler(413, MELDUNGEN.DATEI_ZU_GROSS);

  // 5. Link, Bremse je Nachforderung, Position, Kontingente (ohne Sperre)
  const gefunden = await linkLaden(token, heuteInBerlin(jetzt));
  if (!gefunden.ok) return gefunden.antwort;
  const g = gefunden.g;
  const gebremst = bremse(hochladenLimiter, g.kopf.id);
  if (gebremst) return gebremst;
  const position = await positionLaden(prisma, positionId, g);
  if (!position) return POSITION_FEHLT();
  const nichtOffen = offenPruefen(position, g);
  if (nichtOffen) return nichtOffen;
  const voll = kontingentPruefen(
    { dateien: await aktiveDateien(prisma, g), uploadsGesamt: g.kopf.uploadsGesamt },
    position.id,
    1,
  );
  if (voll) return fehler(409, voll.meldung, voll.grund);

  // 6. Body begrenzt lesen, erst dann zerlegen
  const body = await leseBodyBegrenzt(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.status === 413 ? fehler(413, MELDUNGEN.DATEI_ZU_GROSS) : fehler(400, MELDUNGEN.DATEI_UNVOLLSTAENDIG);
  }
  let formular: FormData;
  try {
    formular = await new Response(body.buffer, { headers: { "content-type": contentType } }).formData();
  } catch {
    return fehler(400, MELDUNGEN.DATEI_UNVOLLSTAENDIG);
  }

  // 7. Genau ein Eintrag `datei`, nicht leer, hoechstens 9,5 MiB
  const eintraege = formular.getAll("datei");
  const datei = eintraege.length === 1 ? eintraege[0] : null;
  if (!istDatei(datei)) return fehler(400, MELDUNGEN.UNGUELTIGE_EINGABE);
  if (datei.size === 0) return fehler(400, MELDUNGEN.DATEI_UNVOLLSTAENDIG);
  if (datei.size > MAX_DATEI_BYTES) return fehler(413, MELDUNGEN.DATEI_ZU_GROSS);
  const buffer = Buffer.from(await datei.arrayBuffer());

  // 8. Typ allein aus den Bytes — `file.type` und die Endung zaehlen nicht
  const typ = erkenneDateityp(buffer);
  if (!typ.ok) {
    return typ.status === 400 ? fehler(400, MELDUNGEN.DATEI_UNVOLLSTAENDIG) : fehler(415, MELDUNGEN.DATEITYP_NICHT_ERLAUBT);
  }

  // 9.–10. PDF-Merkmale (nur Hinweis fuer HR), Pruefsumme, Anzeigename (nur in der Datenbank)
  const pdfHinweise = typ.mimeType === "application/pdf" ? pdfHinweiseSpeichern(pdfMerkmale(buffer)) : null;
  const sha256 = sha256Hex(buffer);
  const anzeigeName = anzeigeNameBereinigen(datei.name, typ.mimeType);

  // 11. Erst die Datei schreiben, dann die Transaktion
  const dateiId = randomUUID();
  const speicherPfad = await entwurfSpeichern(buffer, { nachforderungId: g.kopf.id, dateiId, mimeType: typ.mimeType });

  // 12. In der Transaktion: sperren, neu pruefen, zaehlen, Zeile, uploadsGesamt + 1
  let ergebnis: TxErgebnis<PositionZeile>;
  try {
    ergebnis = await inTransaktion(async (tx) => {
      const frisch = await sperrenUndNeuPruefen(tx, g, jetzt);
      const p = await positionLaden(tx, position.id, frisch);
      if (!p) throw new OeffentlicherAbbruch(POSITION_FEHLT());
      // „Entfällt" kann HR inzwischen gesetzt haben.
      const gesperrt = offenPruefen(p, frisch);
      if (gesperrt) throw new OeffentlicherAbbruch(gesperrt);
      const grenze = kontingentPruefen(
        { dateien: await aktiveDateien(tx, frisch), uploadsGesamt: frisch.kopf.uploadsGesamt },
        p.id,
        buffer.length,
      );
      if (grenze) throw new OeffentlicherAbbruch(fehler(409, grenze.meldung, grenze.grund));

      await tx.unterlagenDatei.create({
        data: {
          id: dateiId,
          positionId: p.id,
          // Aus der gesperrten Positionszeile, nie aus dem Link.
          nachforderungId: p.nachforderungId,
          status: "ENTWURF",
          anzeigeName,
          speicherPfad,
          mimeType: typ.mimeType,
          groesse: buffer.length,
          sha256,
          pdfHinweise,
          // Unter der Sperre (`zeitpunktUnterSperre`), nicht der Anfang der
          // Anfrage: Die Grenze „eigene Entwürfe" vergleicht mit `entwertetAm`
          // eines Adresswechsels, den HR ebenfalls unter der Sperre stempelt.
          hochgeladenAm: zeitpunktUnterSperre(jetzt),
        },
      });
      await tx.unterlagenNachforderung.updateMany({
        where: { id: frisch.kopf.id },
        data: { uploadsGesamt: { increment: 1 } },
      });
      const neu = await positionLaden(tx, p.id, frisch);
      if (!neu) throw new OeffentlicherAbbruch(POSITION_FEHLT());
      return neu;
    });
  } catch (err) {
    await dateienWegraeumen(g.kopf.id, [speicherPfad]);
    throw err;
  }
  if (!ergebnis.ok) {
    await dateienWegraeumen(g.kopf.id, [speicherPfad]);
    return ergebnis.antwort;
  }
  return {
    status: 201,
    body: { position: oeffentlichePositionBauen(ergebnis.wert) } satisfies OeffentlichePositionsAntwort,
  };
}

// =============================================
// DELETE /api/unterlagen/[token]/dateien/[dateiId]
// =============================================

/**
 * Einen eigenen Entwurf entfernen (2.3): die Zeile in der Transaktion, die
 * Datei danach. Eingereichte Dateien bleiben (409).
 *
 *   200 { position }  ·  404 Link oder Datei (fremd = unbekannt)  ·  409 kein Entwurf, erledigt
 *   410 Link  ·  429 Bremsen
 */
export async function unterlagenDateiEntfernen(
  request: Pick<OeffentlicheAnfrage, "headers">,
  token: string,
  dateiId: string,
  jetzt: Date = new Date(),
): Promise<OeffentlicheDienstAntwort> {
  const vorab = vorpruefen(request, token);
  if (vorab) return vorab;

  const gefunden = await linkLaden(token, heuteInBerlin(jetzt));
  if (!gefunden.ok) return gefunden.antwort;
  const g = gefunden.g;
  const gebremst = bremse(schreibenLimiter, g.kopf.id);
  if (gebremst) return gebremst;

  const datei = UUID_MUSTER.test(dateiId)
    ? await prisma.unterlagenDatei.findFirst({ where: { id: dateiId, nachforderungId: g.kopf.id }, select: DATEI_AUSWAHL })
    : null;
  if (!datei || !fuerLinkSichtbar(datei, g)) return DATEI_FEHLT();
  const entfernbar = dateiUebergang("ENTFERNEN", datei.status);
  if (!entfernbar.erlaubt) return fehler(409, entfernbar.meldung, entfernbar.grund);
  if (g.pruefung.readOnly) return NUR_LESEN();

  const ergebnis = await inTransaktion(async (tx) => {
    const frisch = await sperrenUndNeuPruefen(tx, g, jetzt);
    const zeile = await tx.unterlagenDatei.findFirst({
      where: { id: datei.id, nachforderungId: frisch.kopf.id },
      select: DATEI_AUSWAHL,
    });
    if (!zeile || !fuerLinkSichtbar(zeile, frisch)) throw new OeffentlicherAbbruch(DATEI_FEHLT());
    const nochEntfernbar = dateiUebergang("ENTFERNEN", zeile.status);
    if (!nochEntfernbar.erlaubt) {
      throw new OeffentlicherAbbruch(fehler(409, nochEntfernbar.meldung, nochEntfernbar.grund));
    }
    const weg = await tx.unterlagenDatei.deleteMany({
      where: { id: zeile.id, nachforderungId: frisch.kopf.id, ...eigeneEntwuerfeWhere(frisch.entwuerfeAb) },
    });
    if (weg.count === 0) throw new OeffentlicherAbbruch(DATEI_FEHLT());
    const position = await positionLaden(tx, zeile.positionId, frisch);
    if (!position) throw new OeffentlicherAbbruch(POSITION_FEHLT());
    return { position, speicherPfad: zeile.speicherPfad };
  });
  if (!ergebnis.ok) return ergebnis.antwort;

  // Nach dem Commit: Die Zeile ist weg, die Datei folgt. Was liegen bleibt,
  // findet der Lauf als Waise.
  await dateienWegraeumen(g.kopf.id, [ergebnis.wert.speicherPfad]);
  return {
    status: 200,
    body: { position: oeffentlichePositionBauen(ergebnis.wert.position) } satisfies OeffentlichePositionsAntwort,
  };
}

// =============================================
// PATCH /api/unterlagen/[token]/positionen/[positionId]
// =============================================

/**
 * „Gültig bis" beim Verlassen des Feldes zwischenspeichern. Die Angabe der
 * Person landet NUR an der Position (`gueltigBisAngabe`), nie in den
 * Fragebogen-Daten; HR uebernimmt sie beim Annehmen.
 *
 *   200 { position }  ·  400 Datum/Body  ·  404 Link oder Position  ·  409 nicht fristpflichtig,
 *   nicht offen, erledigt  ·  410 Link  ·  413 Body  ·  429 Bremsen
 */
export async function unterlagenGueltigBisSpeichern(
  request: OeffentlicheAnfrage,
  token: string,
  positionId: string,
  jetzt: Date = new Date(),
): Promise<OeffentlicheDienstAntwort> {
  const vorab = vorpruefen(request, token);
  if (vorab) return vorab;
  if (contentLengthZuGross(request, MAX_JSON_BYTES)) return fehler(413, MELDUNGEN.ANFRAGE_ZU_GROSS);

  const gefunden = await linkLaden(token, heuteInBerlin(jetzt));
  if (!gefunden.ok) return gefunden.antwort;
  const g = gefunden.g;
  const gebremst = bremse(schreibenLimiter, g.kopf.id);
  if (gebremst) return gebremst;

  const koerper = await jsonLesen(request, gueltigBisPatchSchema);
  if (!koerper.ok) return koerper.antwort;
  const position = await positionLaden(prisma, positionId, g);
  if (!position) return POSITION_FEHLT();
  const angabe = gueltigBisPruefen(position, koerper.daten.gueltigBis, g, jetzt);
  if (!angabe.ok) return angabe.antwort;

  const ergebnis = await inTransaktion(async (tx) => {
    const frisch = await sperrenUndNeuPruefen(tx, g, jetzt);
    const p = await positionLaden(tx, position.id, frisch);
    if (!p) throw new OeffentlicherAbbruch(POSITION_FEHLT());
    const nochErlaubt = gueltigBisPruefen(p, koerper.daten.gueltigBis, frisch, jetzt);
    if (!nochErlaubt.ok) throw new OeffentlicherAbbruch(nochErlaubt.antwort);
    const r = await tx.unterlagenPosition.updateMany({
      where: { id: p.id, nachforderungId: frisch.kopf.id, fristpflichtig: true, status: { in: [...WARTET_AUF_PERSON_STATUS] } },
      data: { gueltigBisAngabe: nochErlaubt.datum },
    });
    if (r.count === 0) throw new OeffentlicherAbbruch(fehler(409, MELDUNGEN.UNTERLAGE_NICHT_OFFEN, "NICHT_OFFEN"));
    const neu = await positionLaden(tx, p.id, frisch);
    if (!neu) throw new OeffentlicherAbbruch(POSITION_FEHLT());
    return neu;
  });
  if (!ergebnis.ok) return ergebnis.antwort;
  return {
    status: 200,
    body: { position: oeffentlichePositionBauen(ergebnis.wert) } satisfies OeffentlichePositionsAntwort,
  };
}

// =============================================
// POST /api/unterlagen/[token]/uebermitteln
// =============================================

/**
 * „Unterlagen übermitteln" (2.2, 6.1): In EINER Transaktion werden zuerst die
 * mitgeschickten Daten „Gültig bis" gespeichert (KO-S4), dann gehen alle
 * offenen Positionen mit mindestens einem Entwurf auf EINGEREICHT
 * (`einreichungen + 1`), ihre Entwuerfe auf EINGEREICHT mit `uebermitteltAm`
 * und `einreichungNr`; dazu der Merker nach 2.1 und das AuditLog. Teilweises
 * Uebermitteln ist moeglich (P:1371).
 *
 * Doppelklick: Ist nichts mehr bereit, weil schon uebermittelt, kommt 200 mit
 * dem aktuellen Stand (`uebermittelt: 0`). 409 nur, wenn nie etwas bereit war.
 * Wartet danach nichts mehr auf die Person, geht die HR-Meldung NACH der
 * Antwort hinaus (bedingter Anspruch, Abschnitt 7).
 *
 *   200 { stand, uebermittelt }  ·  400 Body/Datum  ·  404 Link oder fremde Position
 *   409 nichts bereit, nicht fristpflichtig, erledigt  ·  410 Link  ·  413 Body  ·  429 Bremsen
 */
export async function unterlagenUebermitteln(
  request: OeffentlicheAnfrage,
  token: string,
  jetzt: Date = new Date(),
): Promise<OeffentlicheDienstAntwort> {
  const vorab = vorpruefen(request, token);
  if (vorab) return vorab;
  if (contentLengthZuGross(request, MAX_JSON_BYTES)) return fehler(413, MELDUNGEN.ANFRAGE_ZU_GROSS);

  const gefunden = await linkLaden(token, heuteInBerlin(jetzt));
  if (!gefunden.ok) return gefunden.antwort;
  const g = gefunden.g;
  const gebremst = bremse(schreibenLimiter, g.kopf.id);
  if (gebremst) return gebremst;

  const koerper = await jsonLesen(request, uebermittelnSchema);
  if (!koerper.ok) return koerper.antwort;
  if (g.pruefung.readOnly) return NUR_LESEN();
  const angaben = Object.entries(koerper.daten.gueltigBis ?? {});

  // Vorab, ohne Sperre: Jede Angabe gehoert zu einer Unterlage DIESER
  // Nachforderung (404), die ein Ablaufdatum hat (409), und ist ein gueltiges
  // Datum (400). Eine inzwischen uebermittelte Unterlage wird uebergangen —
  // beim Doppelklick schickt die Seite dieselben Angaben noch einmal.
  const vorPositionen = await positionenLaden(prisma, g);
  for (const [positionId, roh] of angaben) {
    const p = vorPositionen.find((x) => x.id === positionId);
    if (!p) return POSITION_FEHLT();
    if (!p.fristpflichtig) return fehler(409, MELDUNGEN.KEIN_ABLAUFDATUM, "KEIN_ABLAUFDATUM");
    const datum = pruefeGueltigBis(roh, p.typ ?? "", jetzt);
    if (!datum.ok) return fehler(400, datum.fehler);
  }

  const ergebnis = await inTransaktion(async (tx) => {
    const frisch = await sperrenUndNeuPruefen(tx, g, jetzt);
    const nachforderungId = frisch.kopf.id;

    // 1. „Gültig bis" — in DERSELBEN Transaktion, nur an offenen, fristpflichtigen Unterlagen.
    for (const [positionId, roh] of angaben) {
      const datum = pruefeGueltigBis(roh, vorPositionen.find((x) => x.id === positionId)?.typ ?? "", jetzt);
      if (!datum.ok) throw new OeffentlicherAbbruch(fehler(400, datum.fehler));
      await tx.unterlagenPosition.updateMany({
        where: { id: positionId, nachforderungId, fristpflichtig: true, status: { in: [...WARTET_AUF_PERSON_STATUS] } },
        data: { gueltigBisAngabe: datum.gueltigBis },
      });
    }

    // 2. Offene Positionen mit (eigenem) Entwurf → EINGEREICHT
    const positionen = await tx.unterlagenPosition.findMany({
      where: { nachforderungId },
      orderBy: { reihenfolge: "asc" },
      select: { id: true, typ: true, status: true, einreichungen: true },
    });
    const entwuerfe = await tx.unterlagenDatei.findMany({
      where: { nachforderungId, ...eigeneEntwuerfeWhere(frisch.entwuerfeAb) },
      orderBy: { hochgeladenAm: "asc" },
      select: { id: true, positionId: true, groesse: true, mimeType: true, sha256: true },
    });
    const kontext = {
      nachforderungStatus: frisch.kopf.status,
      vorgangEingestellt: frisch.vorgang.eingestellt,
      heute: frisch.heute,
    };
    const bereit = positionen.filter(
      (p) =>
        positionUebergang("UEBERMITTELN", p.status, {
          ...kontext,
          entwuerfe: entwuerfe.filter((d) => d.positionId === p.id).length,
        }).erlaubt,
    );
    if (bereit.length === 0) {
      // Doppelklick: schon uebermittelt → aktueller Stand. Nie etwas bereit → 409.
      if (positionen.some((p) => p.einreichungen > 0)) {
        return { stand: standBauen(frisch, await positionenLaden(tx, frisch)), uebermittelt: 0, melden: false };
      }
      throw new OeffentlicherAbbruch(fehler(409, MELDUNGEN.NICHTS_ZU_UEBERMITTELN, "NICHTS_BEREIT"));
    }

    for (const p of bereit) {
      const r = await tx.unterlagenPosition.updateMany({
        where: { id: p.id, nachforderungId, status: p.status },
        data: { status: "EINGEREICHT", einreichungen: { increment: 1 }, uebermitteltAm: jetzt },
      });
      if (r.count === 0) throw new OeffentlicherAbbruch(fehler(409, MELDUNGEN.UNTERLAGE_NICHT_OFFEN, "NICHT_OFFEN"));
      // Die eigenen Entwuerfe dieser Position: ENTWURF → EINGEREICHT (dateiUebergang "UEBERMITTELN").
      await tx.unterlagenDatei.updateMany({
        where: {
          id: { in: entwuerfe.filter((d) => d.positionId === p.id).map((d) => d.id) },
          positionId: p.id,
          nachforderungId,
          status: "ENTWURF",
        },
        data: { status: "EINGEREICHT", uebermitteltAm: jetzt, einreichungNr: p.einreichungen + 1 },
      });
    }

    // 3. Merker „vollständig" nach 2.1 — nur die Uebermittlung der Person setzt ihn.
    const bereitIds = new Set(bereit.map((p) => p.id));
    const positionenNachher = positionen.map((p) => ({ status: bereitIds.has(p.id) ? "EINGEREICHT" : p.status }));
    const merker = vollstaendigMerker("UEBERMITTELT", {
      vollstaendigSeit: frisch.kopf.vollstaendigSeit,
      vollstaendigGemeldetAm: frisch.kopf.vollstaendigGemeldetAm,
      positionenNachher,
      jetzt,
    });
    const vollstaendig = !positionenNachher.some((p) => wartetAufPerson(p.status));
    if (vollstaendig) {
      await tx.unterlagenNachforderung.updateMany({
        where: { id: nachforderungId },
        data: { vollstaendigSeit: merker.vollstaendigSeit, vollstaendigGemeldetAm: merker.vollstaendigGemeldetAm },
      });
    }

    // 4. Protokoll: IDs, Groessen, Typ, SHA-256 — ohne IP, ohne Dateinamen.
    const a = frisch.modul.audit(frisch.vorgangId);
    await tx.auditLog.create({
      data: {
        userId: null,
        processType: a.processType,
        ...a.fk,
        action: UNTERLAGEN_AUDIT.UEBERMITTELT,
        details: {
          nachforderungId,
          linkId: frisch.link.id,
          vollstaendig,
          positionen: bereit.map((p) => ({
            positionId: p.id,
            typ: p.typ,
            einreichungNr: p.einreichungen + 1,
            dateien: entwuerfe
              .filter((d) => d.positionId === p.id)
              .map((d) => ({ dateiId: d.id, groesse: d.groesse, mimeType: d.mimeType, sha256: d.sha256 })),
          })),
        },
      },
    });
    // 5. Der neue Stand fuer die Antwort — noch in der Transaktion: Nach dem
    // Commit darf nichts mehr werfen, sonst bekaeme die Person eine 500 auf
    // eine gespeicherte Uebermittlung, und die HR-Meldung fiele aus (Abschnitt 7).
    // Was `standBauen` vom Kopf liest, aendert das Uebermitteln nicht.
    const stand = standBauen(frisch, await positionenLaden(tx, frisch));
    return { stand, uebermittelt: bereit.length, melden: vollstaendig };
  });
  if (!ergebnis.ok) return ergebnis.antwort;

  const { stand, uebermittelt, melden } = ergebnis.wert;
  if (melden) {
    // Nach der Antwort — die Person wartet nicht auf SMTP. Der Anspruch in
    // hrVollstaendigMelden verhindert eine doppelte Mail, der Lauf holt eine
    // ausgefallene nach.
    const nachforderungId = g.kopf.id;
    nachDerAntwort(() => hrVollstaendigMelden(nachforderungId), "Unterlagen: HR-Meldung");
  }
  return { status: 200, body: { stand, uebermittelt } satisfies UebermittelnAntwort };
}
