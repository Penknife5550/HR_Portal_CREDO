import { listeVerschieben } from "@/lib/liste-verschieben";

describe("listeVerschieben", () => {
  const liste = ["a", "b", "c", "d"];

  it("verschiebt nach unten: das Element steht danach auf der Zielposition", () => {
    expect(listeVerschieben(liste, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("verschiebt nach oben", () => {
    expect(listeVerschieben(liste, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("verschiebt an Anfang und Ende", () => {
    expect(listeVerschieben(liste, 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(listeVerschieben(liste, 1, 3)).toEqual(["a", "c", "d", "b"]);
  });

  it("aendert nichts bei gleicher oder ungueltiger Position", () => {
    for (const [von, nach] of [[1, 1], [-1, 2], [0, 4], [4, 0], [0.5, 1], [Number.NaN, 1]]) {
      expect(listeVerschieben(liste, von, nach)).toEqual(liste);
    }
  });

  it("liefert immer eine neue Liste und laesst die alte unveraendert", () => {
    const ergebnis = listeVerschieben(liste, 1, 1);
    expect(ergebnis).not.toBe(liste);
    listeVerschieben(liste, 0, 3);
    expect(liste).toEqual(["a", "b", "c", "d"]);
  });
});
