/**
 * `ohneLinkSchluessel` — Datenzuschnitt der Abteilungsuebersicht fuer Rollen
 * ohne HR_EDIT_ROLES (Befund 16.10.2026).
 *
 * Der Aufgaben-Link einer Abteilung ist ein Zugang OHNE Anmeldung. Er steckt an
 * DREI Stellen in der Antwort der Detailrouten: als Spalte `token` der
 * Link-Zeile, in `departmentLinks[].url` und in `abteilungen.zeilen[].link.url`.
 * Diese Tests halten fest, dass alle drei verschwinden — und dass sonst NICHTS
 * verschwindet, denn der Stand (informiert, geoeffnet, Faelligkeiten) soll
 * lesbar bleiben.
 */

import { ohneLinkSchluessel } from "@/lib/abteilungsaufgaben";

const TOKEN = "geheimer-abteilungs-token-0815";

function uebersicht() {
  return {
    departmentLinks: [
      {
        id: "lnk-it",
        offboardingId: "off-a",
        departmentKey: "IT",
        token: TOKEN,
        url: `https://hr.example.org/offboarding-tasks/${TOKEN}`,
        sentAt: "2027-07-01T08:00:00.000Z",
        openCount: 3,
        anzeige: { ton: "gruen", text: "informiert" },
      },
    ],
    checklistItems: [{ id: "auf-1", title: "Zugang sperren", erledigtVon: null }],
    abteilungen: {
      modul: "OFFBOARDING",
      zeilen: [
        {
          departmentKey: "IT",
          departmentName: "IT",
          email: "it@example.org",
          link: {
            id: "lnk-it",
            url: `https://hr.example.org/offboarding-tasks/${TOKEN}`,
            expiresAt: "2027-09-01T08:00:00.000Z",
            sentAt: "2027-07-01T08:00:00.000Z",
            openCount: 3,
            allTasksComplete: false,
          },
        },
        // Eine Stelle ohne Link (nie informiert) — darf nicht umkippen.
        { departmentKey: "FACILITY", departmentName: "Facility", email: null, link: null },
      ],
      informierbar: true,
    },
    fuehrungskraft: { email: "leitung@example.org", quelle: "VORGANG" },
  };
}

describe("ohneLinkSchluessel", () => {
  it("entfernt den Schluessel an allen drei Stellen", () => {
    const roh = JSON.stringify(uebersicht());
    const geschnitten = ohneLinkSchluessel(uebersicht());

    expect(roh).toContain(TOKEN); // die Vorgabe traegt ihn wirklich
    expect(JSON.stringify(geschnitten)).not.toContain(TOKEN);
    expect(geschnitten.departmentLinks[0]).not.toHaveProperty("token");
    expect(geschnitten.departmentLinks[0]).not.toHaveProperty("url");
    expect(geschnitten.abteilungen.zeilen[0].link).not.toHaveProperty("url");
  });

  it("laesst alles andere unveraendert — der Stand bleibt lesbar", () => {
    const g = ohneLinkSchluessel(uebersicht());

    // Die Link-Zeile behaelt Kennung und Stand.
    expect(g.departmentLinks[0]).toEqual({
      id: "lnk-it",
      offboardingId: "off-a",
      departmentKey: "IT",
      sentAt: "2027-07-01T08:00:00.000Z",
      openCount: 3,
      anzeige: { ton: "gruen", text: "informiert" },
    });

    // Die Zeile der Karte behaelt alles ausser `url`.
    expect(g.abteilungen.zeilen[0].link).toEqual({
      id: "lnk-it",
      expiresAt: "2027-09-01T08:00:00.000Z",
      sentAt: "2027-07-01T08:00:00.000Z",
      openCount: 3,
      allTasksComplete: false,
    });

    // Aufgaben, Fuehrungskraft und die uebrigen Felder der Karte: unberuehrt.
    expect(g.checklistItems).toEqual(uebersicht().checklistItems);
    expect(g.fuehrungskraft).toEqual(uebersicht().fuehrungskraft);
    expect(g.abteilungen.modul).toBe("OFFBOARDING");
    expect(g.abteilungen.informierbar).toBe(true);
  });

  it("eine Stelle ohne Link bleibt, wie sie ist", () => {
    const g = ohneLinkSchluessel(uebersicht());
    expect(g.abteilungen.zeilen[1]).toEqual({
      departmentKey: "FACILITY",
      departmentName: "Facility",
      email: null,
      link: null,
    });
  });

  it("aendert die Vorgabe nicht (keine Nebenwirkung)", () => {
    const vorher = uebersicht();
    ohneLinkSchluessel(vorher);
    expect(vorher.departmentLinks[0].token).toBe(TOKEN);
    expect(vorher.abteilungen.zeilen[0].link?.url).toContain(TOKEN);
  });

  it("leere Uebersicht: kein Fehler", () => {
    const g = ohneLinkSchluessel({ departmentLinks: [], abteilungen: { zeilen: [] } });
    expect(g.departmentLinks).toEqual([]);
    expect(g.abteilungen.zeilen).toEqual([]);
  });

  // Diese Funktion soll nur etwas WEGNEHMEN. Stuerzte sie bei einem fehlenden
  // Teil ab, waere das eine 500 fuer alle Rollen — auch fuer HR. Genau das ist
  // beim Bau passiert (zwei Suiten mit unvollstaendigen Attrappen), deshalb
  // steht es hier fest.
  it("unvollstaendige Uebersicht: nimmt, was da ist, und stuerzt nicht", () => {
    const nurLinks = ohneLinkSchluessel({
      departmentLinks: [{ id: "l1", token: TOKEN, url: `https://x/${TOKEN}` }],
    } as unknown as Parameters<typeof ohneLinkSchluessel>[0]);
    expect(JSON.stringify(nurLinks)).not.toContain(TOKEN);

    const nurZeilen = ohneLinkSchluessel({
      abteilungen: { zeilen: [{ departmentKey: "IT", link: { id: "l1", url: `https://x/${TOKEN}` } }] },
    } as unknown as Parameters<typeof ohneLinkSchluessel>[0]);
    expect(JSON.stringify(nurZeilen)).not.toContain(TOKEN);

    expect(() => ohneLinkSchluessel({} as unknown as Parameters<typeof ohneLinkSchluessel>[0])).not.toThrow();
    expect(() =>
      ohneLinkSchluessel({ departmentLinks: [], abteilungen: null } as unknown as Parameters<
        typeof ohneLinkSchluessel
      >[0]),
    ).not.toThrow();
  });
});
