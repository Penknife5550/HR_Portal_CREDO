/**
 * Tests: die Regeln der zwei Onboarding-Spuren (src/lib/onboarding-spuren.ts)
 * und ihr serverseitiger Abgleich (src/lib/onboarding-status-abgleich.ts).
 *
 * Anlass war ein Vorgang, der dauerhaft festhing: Die Fuehrungskraft hatte die
 * Modalitaeten zuerst abgesendet, der gemeinsame Status stand damit auf
 * SUPERVISOR_SUBMITTED, und der Fragebogen-Link der Person las das als
 * „bereits eingereicht". Belegt wird deshalb vor allem, dass keine Spur mehr
 * von der anderen abhaengt — ueber die ganze Matrix, nicht an zwei Beispielen.
 */

import {
  HR_STATUS,
  LINK_STATUS,
  ONBOARDING_STATUS,
  bereitZurPruefung,
  darfMitarbeiterSchreiben,
  darfVorgesetzteSchreiben,
  gesamtStatus,
  mitarbeiterAbgesendet,
  mitarbeiterName,
  nachweiseAbgegeben,
  pruefungNichtMoeglichGrund,
  vorgesetzteAbgesendet,
  vorgesetztenLinkAbgelaufen,
  vorgesetztenLinkErzeugtAm,
  vorgesetztenLinkWiederverwendbar,
  type SpurenStand,
} from "@/lib/onboarding-spuren";
import { statusAbgleichen } from "@/lib/onboarding-status-abgleich";

const ZEIT = new Date("2026-09-18T09:00:00Z");

/** Alle Kombinationen, die fuer die Regeln einen Unterschied machen. */
function matrix(): SpurenStand[] {
  const faelle: SpurenStand[] = [];
  for (const status of ONBOARDING_STATUS) {
    for (const submittedAt of [null, ZEIT]) {
      for (const supervisorSubmittedAt of [null, ZEIT]) {
        for (const supervisorToken of [null, "vg-token"]) {
          for (const currentStep of [0, 4]) {
            faelle.push({
              status,
              submittedAt,
              supervisorSubmittedAt,
              supervisorToken,
              personalData: { currentStep, isComplete: submittedAt !== null },
              supervisorData: supervisorToken
                ? { isComplete: supervisorSubmittedAt !== null }
                : null,
            });
          }
        }
      }
    }
  }
  return faelle;
}

describe("gesamtStatus", () => {
  it("laesst HR-Status unangetastet — ueber die ganze Matrix", () => {
    for (const v of matrix().filter((f) => (HR_STATUS as readonly string[]).includes(f.status))) {
      expect(gesamtStatus(v)).toBe(v.status);
    }
  });

  it("folgt bis zur eigenen Abgabe der Fragebogen-Spur, egal was die Fuehrungskraft tut", () => {
    for (const v of matrix()) {
      if ((HR_STATUS as readonly string[]).includes(v.status) || v.submittedAt) continue;
      const erwartet =
        v.status === "IN_PROGRESS" || (v.personalData?.currentStep ?? 0) > 0
          ? "IN_PROGRESS"
          : "INVITED";
      expect(gesamtStatus(v)).toBe(erwartet);
    }
  });

  it("leitet nach der Abgabe aus der Vorgesetzten-Spur ab", () => {
    for (const v of matrix()) {
      if ((HR_STATUS as readonly string[]).includes(v.status) || !v.submittedAt) continue;
      const erwartet = v.supervisorSubmittedAt
        ? "SUPERVISOR_SUBMITTED"
        : v.supervisorToken
          ? "SUPERVISOR_PENDING"
          : "SUBMITTED";
      expect(gesamtStatus(v)).toBe(erwartet);
    }
  });

  it("ist idempotent: ein abgeleiteter Status ergibt sich selbst wieder", () => {
    for (const v of matrix()) {
      const einmal = gesamtStatus(v);
      expect(gesamtStatus({ ...v, status: einmal })).toBe(einmal);
    }
  });

  it("heilt den gemeldeten Fall: Fuehrungskraft zuerst, Person in Schritt 4", () => {
    expect(
      gesamtStatus({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: null,
        supervisorSubmittedAt: ZEIT,
        supervisorToken: "vg-token",
        personalData: { currentStep: 4, isComplete: false },
      }),
    ).toBe("IN_PROGRESS");
  });

  it("wertet die Altfall-Merker isComplete als Abgabe (ohne Zeitstempel)", () => {
    expect(
      gesamtStatus({
        status: "SUPERVISOR_PENDING",
        submittedAt: null,
        personalData: { currentStep: 12, isComplete: true },
        supervisorToken: "vg-token",
        supervisorData: { isComplete: true },
      }),
    ).toBe("SUPERVISOR_SUBMITTED");
  });

  it("liefert nur gueltige Enum-Werte", () => {
    for (const v of matrix()) {
      expect(ONBOARDING_STATUS).toContain(gesamtStatus(v));
    }
  });
});

describe("Schreibrechte je Link", () => {
  it("die Person darf schreiben, obwohl die Fuehrungskraft schon abgesendet hat", () => {
    expect(
      darfMitarbeiterSchreiben({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: null,
        personalData: { isComplete: false },
      }),
    ).toBe(true);
  });

  it("die Person darf nach der eigenen Abgabe NICHT mehr schreiben — auch bei SUPERVISOR_PENDING", () => {
    // Die fruehere Luecke: auth.ts sperrte nur bei status === "SUBMITTED".
    for (const status of ["SUBMITTED", "SUPERVISOR_PENDING", "SUPERVISOR_SUBMITTED"]) {
      expect(darfMitarbeiterSchreiben({ status, submittedAt: ZEIT })).toBe(false);
    }
  });

  it("die Fuehrungskraft darf schreiben, solange sie selbst nicht abgesendet hat — Fragebogen egal", () => {
    for (const status of LINK_STATUS) {
      expect(darfVorgesetzteSchreiben({ status, supervisorSubmittedAt: null })).toBe(true);
    }
  });

  it("die Fuehrungskraft darf nach der eigenen Abgabe nicht mehr schreiben — auch bei IN_PROGRESS", () => {
    expect(
      darfVorgesetzteSchreiben({ status: "IN_PROGRESS", supervisorSubmittedAt: ZEIT }),
    ).toBe(false);
    expect(
      darfVorgesetzteSchreiben({
        status: "IN_PROGRESS",
        supervisorSubmittedAt: null,
        supervisorData: { isComplete: true },
      }),
    ).toBe(false);
  });

  it("HR-Status sperren beide Links", () => {
    for (const status of HR_STATUS) {
      expect(darfMitarbeiterSchreiben({ status, submittedAt: null })).toBe(false);
      expect(darfVorgesetzteSchreiben({ status, supervisorSubmittedAt: null })).toBe(false);
    }
  });

  it("mitarbeiterAbgesendet/vorgesetzteAbgesendet haengen nie am Status", () => {
    for (const status of ONBOARDING_STATUS) {
      expect(mitarbeiterAbgesendet({ status, submittedAt: null })).toBe(false);
      expect(vorgesetzteAbgesendet({ status, supervisorSubmittedAt: null })).toBe(false);
    }
  });
});

/**
 * Das Tor des Kastens „Offene Nachweise" (Paket 4: zog aus detail-content.tsx
 * hierher). Es muss sich genau so verhalten wie vorher — die Nachforderung
 * baut darauf auf und sperrt EXPIRED selbst.
 */
describe("nachweiseAbgegeben", () => {
  /** Das Tor, woertlich wie es bis Paket 4 in detail-content.tsx stand. */
  const ABGEGEBENE_STATUS: readonly string[] = ["REVIEWED", "COMPLETED"];
  const altesTor = (v: SpurenStand) =>
    mitarbeiterAbgesendet(v) || ABGEGEBENE_STATUS.includes(v.status);

  it("gleicht dem alten Tor des Kastens — ueber die ganze Matrix", () => {
    for (const v of matrix()) {
      expect(nachweiseAbgegeben(v)).toBe(altesTor(v));
    }
    // Auch der Altfall: isComplete ohne Zeitstempel.
    for (const status of ONBOARDING_STATUS) {
      const altfall = { status, submittedAt: null, personalData: { isComplete: true } };
      expect(nachweiseAbgegeben(altfall)).toBe(altesTor(altfall));
    }
  });

  it("bleibt bei EXPIRED wahr, wenn die Person abgesendet hatte", () => {
    // HR kann EXPIRED jederzeit setzen, auch nach dem Abschluss. Die
    // Nachforderung sperrt EXPIRED deshalb selbst (verfuegbar), das Tor nicht.
    expect(nachweiseAbgegeben({ status: "EXPIRED", submittedAt: ZEIT })).toBe(true);
    expect(nachweiseAbgegeben({ status: "EXPIRED", submittedAt: null, personalData: { isComplete: true } })).toBe(true);
    expect(nachweiseAbgegeben({ status: "EXPIRED", submittedAt: null })).toBe(false);
  });

  it("gilt fuer gepruefte und abgeschlossene Bestandsakten auch ohne Zeitstempel", () => {
    expect(nachweiseAbgegeben({ status: "REVIEWED", submittedAt: null })).toBe(true);
    expect(nachweiseAbgegeben({ status: "COMPLETED", submittedAt: null })).toBe(true);
  });

  it("ein Link-Status allein zaehlt nicht — die Person kann noch mitten im Fragebogen sein", () => {
    for (const status of LINK_STATUS) {
      expect(nachweiseAbgegeben({ status, submittedAt: null, personalData: { currentStep: 4 } })).toBe(false);
      expect(nachweiseAbgegeben({ status, submittedAt: ZEIT })).toBe(true);
    }
  });
});

describe("bereitZurPruefung", () => {
  it("Fragebogen eingereicht, kein Vorgesetzten-Link: pruefbar (z. B. Ehrenamt)", () => {
    expect(bereitZurPruefung({ status: "SUBMITTED", submittedAt: ZEIT })).toBe(true);
  });

  it("Fragebogen eingereicht, Link offen: nicht pruefbar", () => {
    const v = { status: "SUPERVISOR_PENDING", submittedAt: ZEIT, supervisorToken: "t" };
    expect(bereitZurPruefung(v)).toBe(false);
    expect(pruefungNichtMoeglichGrund(v)).toContain("Einstellungsmodalitäten");
  });

  it("nur Modalitaeten da (Fuehrungskraft war schneller): nicht pruefbar", () => {
    const v = {
      status: "SUPERVISOR_SUBMITTED",
      submittedAt: null,
      supervisorSubmittedAt: ZEIT,
      supervisorToken: "t",
    };
    expect(bereitZurPruefung(v)).toBe(false);
    expect(pruefungNichtMoeglichGrund(v)).toContain("Personalfragebogen");
  });

  it("beides eingereicht: pruefbar", () => {
    expect(
      bereitZurPruefung({
        status: "SUPERVISOR_SUBMITTED",
        submittedAt: ZEIT,
        supervisorSubmittedAt: ZEIT,
        supervisorToken: "t",
      }),
    ).toBe(true);
  });

  it("bereits geprueft: nicht noch einmal", () => {
    const v = { status: "REVIEWED", submittedAt: ZEIT };
    expect(bereitZurPruefung(v)).toBe(false);
    expect(pruefungNichtMoeglichGrund(v)).not.toBeNull();
  });

  it("Grund und Entscheidung passen ueber die ganze Matrix zusammen", () => {
    for (const v of matrix()) {
      expect(pruefungNichtMoeglichGrund(v) === null).toBe(bereitZurPruefung(v));
    }
  });

  it("abgelaufener, nie benutzter Link: weiter gesperrt, aber der Grund nennt den Ausweg", () => {
    // Der Fall aus dem Review: Link vor der Abgabe erzeugt, Fuehrungskraft hat
    // nie reagiert, Link seit Wochen tot. Die Regel bleibt (Entscheidung
    // 21.09.2026) — HR muss aber erfahren, dass ein neuer Link hilft.
    const jetzt = new Date("2026-09-22T10:00:00Z");
    const v = {
      status: "SUPERVISOR_PENDING",
      submittedAt: ZEIT,
      supervisorToken: "t",
      supervisorTokenExpiresAt: new Date("2026-08-31T00:00:00Z"),
    };
    expect(bereitZurPruefung(v)).toBe(false);
    const grund = pruefungNichtMoeglichGrund(v, jetzt);
    expect(grund).toContain("abgelaufen");
    expect(grund).toContain("neuen Link");
  });

  it("gueltiger Link: der Grund erwaehnt keinen Ablauf", () => {
    const jetzt = new Date("2026-09-22T10:00:00Z");
    const v = {
      status: "SUPERVISOR_PENDING",
      submittedAt: ZEIT,
      supervisorToken: "t",
      supervisorTokenExpiresAt: new Date("2026-10-15T00:00:00Z"),
    };
    expect(pruefungNichtMoeglichGrund(v, jetzt)).not.toContain("abgelaufen");
  });
});

describe("vorgesetztenLinkAbgelaufen", () => {
  const jetzt = new Date("2026-09-22T10:00:00Z");

  it("ist wahr, sobald das Ablaufdatum erreicht ist", () => {
    expect(
      vorgesetztenLinkAbgelaufen(
        { supervisorToken: "t", supervisorTokenExpiresAt: "2026-08-31T00:00:00.000Z" },
        jetzt,
      ),
    ).toBe(true);
    expect(
      vorgesetztenLinkAbgelaufen({ supervisorToken: "t", supervisorTokenExpiresAt: jetzt }, jetzt),
    ).toBe(true);
  });

  it("ist falsch fuer einen gueltigen Link", () => {
    expect(
      vorgesetztenLinkAbgelaufen(
        { supervisorToken: "t", supervisorTokenExpiresAt: new Date("2026-10-01T00:00:00Z") },
        jetzt,
      ),
    ).toBe(false);
  });

  it("ist falsch ohne Link oder ohne Ablaufdatum", () => {
    expect(
      vorgesetztenLinkAbgelaufen(
        { supervisorToken: null, supervisorTokenExpiresAt: new Date("2026-08-31T00:00:00Z") },
        jetzt,
      ),
    ).toBe(false);
    expect(vorgesetztenLinkAbgelaufen({ supervisorToken: "t", supervisorTokenExpiresAt: null }, jetzt)).toBe(false);
  });
});

describe("vorgesetztenLinkErzeugtAm", () => {
  const TAG = 86_400_000;
  const DREISSIG_TAGE = 30 * TAG;
  const eingeladen = new Date("2026-09-01T08:00:00Z");

  it("nimmt supervisorLinkSentAt, wenn vorhanden", () => {
    const gesendet = new Date("2026-09-10T08:00:00Z");
    expect(
      vorgesetztenLinkErzeugtAm(
        {
          invitedAt: eingeladen,
          supervisorLinkSentAt: gesendet,
          supervisorTokenExpiresAt: new Date("2026-10-30T00:00:00Z"),
        },
        DREISSIG_TAGE,
      ),
    ).toEqual(gesendet);
  });

  it("rechnet ohne supervisorLinkSentAt aus dem Ablauf zurueck (Bestandslink)", () => {
    // Link am 21.09. erzeugt, 30 Tage gueltig.
    const erzeugt = new Date("2026-09-21T08:00:00Z");
    expect(
      vorgesetztenLinkErzeugtAm(
        {
          invitedAt: eingeladen,
          supervisorLinkSentAt: null,
          supervisorTokenExpiresAt: new Date(erzeugt.getTime() + DREISSIG_TAGE),
        },
        DREISSIG_TAGE,
      ),
    ).toEqual(erzeugt);
  });

  it("geht nie vor die Einladung zurueck", () => {
    expect(
      vorgesetztenLinkErzeugtAm(
        {
          invitedAt: eingeladen,
          supervisorLinkSentAt: null,
          supervisorTokenExpiresAt: new Date(eingeladen.getTime() + 5 * TAG),
        },
        DREISSIG_TAGE,
      ),
    ).toEqual(eingeladen);
  });

  it("faellt ohne Ablaufdatum auf die Einladung zurueck", () => {
    expect(
      vorgesetztenLinkErzeugtAm({ invitedAt: eingeladen.toISOString() }, DREISSIG_TAGE),
    ).toEqual(eingeladen);
  });
});

describe("vorgesetztenLinkWiederverwendbar", () => {
  const jetzt = new Date("2026-09-22T10:00:00Z");
  const link = {
    supervisorToken: "t",
    supervisorEmail: "Schulleitung@FES.example",
    supervisorTokenExpiresAt: new Date("2026-10-01T00:00:00Z"),
  };

  it("gilt fuer dieselbe Adresse, Gross-/Kleinschreibung egal", () => {
    expect(vorgesetztenLinkWiederverwendbar(link, " schulleitung@fes.example ", jetzt)).toBe(true);
  });

  it("gilt NICHT fuer eine andere Adresse (falscher Empfaenger)", () => {
    expect(vorgesetztenLinkWiederverwendbar(link, "andere@fes.example", jetzt)).toBe(false);
  });

  it("gilt nicht fuer einen abgelaufenen oder fehlenden Link", () => {
    expect(
      vorgesetztenLinkWiederverwendbar(
        { ...link, supervisorTokenExpiresAt: new Date("2026-09-01T00:00:00Z") },
        "schulleitung@fes.example",
        jetzt,
      ),
    ).toBe(false);
    expect(
      vorgesetztenLinkWiederverwendbar(
        { ...link, supervisorToken: null },
        "schulleitung@fes.example",
        jetzt,
      ),
    ).toBe(false);
  });
});

describe("mitarbeiterName", () => {
  it("nimmt den Namen aus dem Fragebogen", () => {
    expect(
      mitarbeiterName({
        firstName: "Alt",
        lastName: "Name",
        personalData: { firstName: "Anna", lastName: "Beispiel" },
      }),
    ).toBe("Anna Beispiel");
  });

  it("faellt auf den Namen am Vorgang zurueck", () => {
    expect(
      mitarbeiterName({ firstName: "Anna", lastName: null, personalData: { firstName: "", lastName: null } }),
    ).toBe("Anna");
  });

  it("liefert null statt einer E-Mail-Adresse, wenn kein Name bekannt ist", () => {
    expect(mitarbeiterName({ firstName: null, lastName: null, personalData: null })).toBeNull();
  });
});

describe("statusAbgleichen", () => {
  function tx(stand: Record<string, unknown>) {
    return {
      onboardingProcess: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(stand),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  it("liest den Vorgang in der Transaktion neu und schreibt den abgeleiteten Status", async () => {
    const t = tx({
      status: "SUPERVISOR_PENDING",
      submittedAt: ZEIT,
      supervisorSubmittedAt: ZEIT,
      supervisorToken: "t",
      personalData: { currentStep: 12, isComplete: true },
      supervisorData: { isComplete: true },
    });

    const ergebnis = await statusAbgleichen(t as never, "ob1");

    expect(ergebnis).toEqual({ von: "SUPERVISOR_PENDING", nach: "SUPERVISOR_SUBMITTED" });
    expect(t.onboardingProcess.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ob1" } }),
    );
    expect(t.onboardingProcess.update).toHaveBeenCalledWith({
      where: { id: "ob1" },
      data: { status: "SUPERVISOR_SUBMITTED" },
    });
  });

  it("schreibt nichts, wenn der Status schon stimmt", async () => {
    const t = tx({
      status: "IN_PROGRESS",
      submittedAt: null,
      supervisorSubmittedAt: ZEIT,
      supervisorToken: "t",
      personalData: { currentStep: 3, isComplete: false },
      supervisorData: { isComplete: true },
    });

    const ergebnis = await statusAbgleichen(t as never, "ob1");

    expect(ergebnis).toEqual({ von: "IN_PROGRESS", nach: "IN_PROGRESS" });
    expect(t.onboardingProcess.update).not.toHaveBeenCalled();
  });
});
